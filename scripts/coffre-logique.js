// Le coffre du moteur : logique pure (navigateur et Node), sans Foundry (essais/coffre-carnet.test.mjs, essais/fils-chiffres.test.mjs).
// Même principe que le coffre des secrets des Veillées (système lakour-loups, logique/coffre.mjs), recopié et étendu ici : le
// moteur ne dépend d'aucun monde.
//
// Foundry v14 livre tous les réglages monde à tous les navigateurs, et sert Data/ sans authentification : ce qui est caché aux
// joueurs (Carnet de campagne caché, fil de l'IA qui contient l'état du jeu) est donc rangé CHIFFRÉ (AES-GCM, 256 bits).
// La clé reste chez le MJ (réglage « client » de son navigateur) ; chaque compte joueur en reçoit une PART, à lui seul, par le
// socket. Partage de Shamir à seuil t, sur le corps des entiers modulo P = 2^521 - 1 (premier de Mersenne) : le polynôme
// y = k + a1·x + … + a(t-1)·x^(t-1), où k est la clé et les a des nombres tirés au hasard ; la part d'un joueur est le point
// (x, y), x tiré de son identifiant. t - 1 points ne disent rien de k ; t points donnent le polynôme, donc k. Le seuil est la
// majorité des comptes joueurs (seuilPour) : une poignée de joueurs, ou un ancien joueur et un complice, ne lisent rien.
// ATTENTION : un compte sans mot de passe est une part que n'importe qui peut prendre ; la protection suppose des mots de passe.
//
// Une clé, ses parts et ce qu'elle scelle portent le même identifiant (id, tiré au hasard) : une part d'une autre clé ne se
// mélange pas aux autres. Son empreinte (SHA-256, publiée dans le réglage monde « trousseau ») dit si une clé reconstituée est
// la bonne, sans rien révéler d'elle.
// Le clair est complété d'espaces jusqu'à un multiple de TAILLE_BLOC octets : la taille ne trahit pas ce qui a été ajouté.

export const P = (1n << 521n) - 1n;
export const TAILLE_BLOC = 4096;
// Au-delà, on n'essaie pas toutes les combinaisons de parts reçues (des parts fausses ne bloquent pas le MJ pour autant :
// il suffit d'autres parts).
export const MAX_ESSAIS = 2000;

const mod = n => ((n % P) + P) % P;

function puissance(base, exposant) {
  let r = 1n, b = mod(base), e = exposant;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}
const inverse = n => puissance(n, P - 2n);

const versNombre = octets => octets.reduce((n, o) => (n << 8n) | BigInt(o), 0n);
function versOctets(n, taille) {
  const octets = new Uint8Array(taille);
  for (let i = taille - 1; i >= 0; i--) { octets[i] = Number(n & 0xffn); n >>= 8n; }
  return octets;
}
const hasard = taille => globalThis.crypto.getRandomValues(new Uint8Array(taille));
const enHex = n => n.toString(16);
const deHex = h => {
  try { return BigInt(`0x${String(h || "0")}`); } catch { return 0n; }   // une part abîmée ne fait pas tomber le MJ
};
const coefs = cle => (Array.isArray(cle?.a) ? cle.a : [cle?.a]).map(deHex);

// Le seuil pour n comptes joueurs : la majorité, et jamais moins de 2.
export const seuilPour = n => Math.max(2, Math.floor((Number(n) || 0) / 2) + 1);

// L'abscisse d'un joueur : son identifiant lu comme un nombre (jamais nul, distinct d'un joueur à l'autre).
export const abscisse = userId => mod(versNombre(new TextEncoder().encode(String(userId))));

// Un identifiant tiré au hasard (2 × octets caractères hexadécimaux).
export const nouvelId = (octets = 8) => Array.from(hasard(octets), o => o.toString(16).padStart(2, "0")).join("");

// Une nouvelle clé : { id, seuil, k, a: [a1 … a(seuil-1)] } (nombres en hexadécimal, pour le stockage).
export function nouvelleCle({ id = nouvelId(), seuil = 2 } = {}) {
  const t = Math.max(2, Math.round(Number(seuil)) || 2);
  return { id, seuil: t, k: enHex(versNombre(hasard(32))), a: Array.from({ length: t - 1 }, () => enHex(mod(versNombre(hasard(72))))) };
}

// La part d'un joueur : { id, seuil, x, y }.
export function partDe(cle, userId) {
  const x = abscisse(userId);
  let y = deHex(cle.k), xi = 1n;
  for (const a of coefs(cle)) {
    xi = (xi * x) % P;
    y = mod(y + a * xi);
  }
  return { id: cle.id, seuil: cle.seuil ?? 2, x: enHex(x), y: enHex(y) };
}

// Produit de deux polynômes (coefficients du plus bas degré au plus haut).
function produit(p, q) {
  const r = new Array(p.length + q.length - 1).fill(0n);
  p.forEach((a, i) => q.forEach((b, j) => { r[i + j] = mod(r[i + j] + a * b); }));
  return r;
}

// La clé retrouvée à partir de `seuil` parts de la même clé (les premières d'abscisses distinctes) : { id, seuil, k, a }, ou
// null. Le polynôme entier est retrouvé (interpolation de Lagrange) : le MJ peut redonner sa part à chacun. Des parts fausses
// donnent une clé fausse, que l'empreinte refuse.
export function reconstituer(parts = [], seuil = parts.find(p => p?.seuil)?.seuil ?? 2) {
  const t = Math.max(2, Number(seuil) || 2);
  const id = parts.find(p => p?.id)?.id;
  const points = [];
  for (const p of parts) {
    if (!p?.id || p.id !== id || !p.x || !p.y) continue;
    const x = mod(deHex(p.x));
    if (x === 0n || points.some(q => q.x === x)) continue;
    points.push({ x, y: mod(deHex(p.y)) });
    if (points.length === t) break;
  }
  if (points.length < t) return null;
  let poly = new Array(t).fill(0n);
  for (const [i, pi] of points.entries()) {
    let base = [1n], den = 1n;
    for (const [j, pj] of points.entries()) {
      if (i === j) continue;
      base = produit(base, [mod(-pj.x), 1n]);
      den = mod(den * (pi.x - pj.x));
    }
    const facteur = mod(pi.y * inverse(den));
    poly = poly.map((c, d) => mod(c + facteur * (base[d] ?? 0n)));
  }
  return { id, seuil: t, k: enHex(poly[0]), a: poly.slice(1).map(enHex) };
}

const versBase64 = octets => btoa(Array.from(octets, o => String.fromCharCode(o)).join(""));
const deBase64 = texte => Uint8Array.from(atob(texte), c => c.charCodeAt(0));
// k est un nombre de 256 bits ; une clé reconstituée de parts fausses peut dépasser : elle est tronquée et n'ouvre rien.
const cleAES = (cle, usage) => globalThis.crypto.subtle.importKey("raw", versOctets(deHex(cle.k), 32), "AES-GCM", false, [usage]);

// L'empreinte d'une clé (hexadécimal) : publique, elle dit si une clé reconstituée est la bonne.
export async function empreinte(cle) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lakour-coffre:${cle?.id}:${cle?.k}`));
  return Array.from(new Uint8Array(h), o => o.toString(16).padStart(2, "0")).join("");
}

// Parmi des parts reçues (d'abscisses distinctes), la clé dont l'empreinte est attendue, ou null. Essaie les combinaisons de
// `seuil` parts (des parts fausses n'empêchent pas les vraies d'ouvrir).
export async function cleDesParts(parts, attendue, seuil = parts.find(p => p?.seuil)?.seuil ?? 2) {
  const t = Math.max(2, Number(seuil) || 2);
  if (!attendue || parts.length < t) return null;
  let essais = 0;
  const choisir = async (debut, choix) => {
    if (choix.length === t) {
      essais++;
      const cle = reconstituer(choix, t);
      return cle && (await empreinte(cle)) === attendue ? cle : null;
    }
    for (let i = debut; i <= parts.length - (t - choix.length) && essais < MAX_ESSAIS; i++) {
      const cle = await choisir(i + 1, [...choix, parts[i]]);
      if (cle) return cle;
    }
    return null;
  };
  return choisir(0, []);
}

// Le clair (UTF-8) complété d'espaces jusqu'à un multiple de TAILLE_BLOC octets (au moins un octet de bourrage).
export function bourrer(texte) {
  const octets = new TextEncoder().encode(texte);
  const complet = new Uint8Array(Math.ceil((octets.length + 1) / TAILLE_BLOC) * TAILLE_BLOC).fill(0x20);
  complet.set(octets);
  return complet;
}

// Un objet scellé : { chiffre: 1, id, iv, donnees } (base64).
export const estScelle = o => Boolean(o && typeof o === "object" && o.chiffre === 1 && o.id && o.iv && o.donnees);

// Chiffre un contenu avec une clé.
export async function sceller(contenu, cle) {
  const iv = hasard(12);
  const chiffre = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cleAES(cle, "encrypt"),
    bourrer(JSON.stringify({ id: cle.id, contenu })));
  return { chiffre: 1, id: cle.id, iv: versBase64(iv), donnees: versBase64(new Uint8Array(chiffre)) };
}

// Le contenu scellé, ou null (mauvaise clé, autre clé, objet abîmé : AES-GCM refuse tout ce qui a été touché).
export async function ouvrir(scelle, cle) {
  if (!scelle?.donnees || !cle?.k || scelle.id !== cle.id) return null;
  try {
    const clair = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(scelle.iv) }, await cleAES(cle, "decrypt"),
      deBase64(scelle.donnees));
    const contenu = JSON.parse(new TextDecoder().decode(clair));
    return contenu?.id === scelle.id ? contenu.contenu ?? null : null;
  } catch { return null; }
}
