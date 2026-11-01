// Aides COMMUNES au dessin des jetons des modules de contenu La Kour (40k, Warcraft, Veillées) : lecture et vérification
// des icônes game-icons, rendu plat et en relief, contrôle d'un SVG fabriqué, couleur d'anneau, tableau des crédits.
// Chaque monde garde son fabricant (outils/fabriquer-jetons*.mjs de son dépôt) : liste de ses jetons, chemins, texte
// de ses crédits. Il importe ces aides depuis le sous-module : modules/lakour-mj-ia/outils/jetons-commun.mjs.
// Paramètres propres à un monde : la table des auteurs (AUTEURS de son contenu/jetons.mjs), la racine de son dépôt
// (lecture et écriture des jetons), et au besoin un autre dossier d'icônes que celui du moteur.
// Icônes : copies des seules icônes utilisées, dans outils/game-icons/<auteur>/<nom>.svg du moteur (avec license.txt) ;
// une icône absente est prise dans l'archive officielle de game-icons.net (github.com/game-icons/icons) indiquée par
// --source, vérifiée, puis copiée (à verser ensuite dans le dépôt lakour-mj-ia).
// Seuls les tracés (<path d>) sont repris, recopiés en ligne : aucune référence externe dans les jetons.
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dossier des icônes partagé par les trois mondes : outils/game-icons/ du moteur.
export const DOSSIER_ICONES = join(dirname(fileURLToPath(import.meta.url)), "game-icons");
const FOND_ICONE = "M0 0h512v512H0z"; // carré noir de fond des icônes game-icons, retiré
export const NOM_ICONE = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const TRACE_SUR = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;

// ---------------------------------------------------------------- Lecture des icônes

// Tracés d'une icône game-icons : refuse tout ce qui n'est pas un simple SVG 512×512 fait de <path>.
export function tracesIcone(texte, nom = "icône") {
  if (!/^<svg\s[^>]*viewBox="0 0 512 512"[^>]*>/.test(texte.trim())) throw new Error(`${nom} : pas un SVG game-icons 512×512`);
  const balises = [...texte.matchAll(/<([a-zA-Z][\w:-]*)/g)].map(m => m[1]);
  const autres = balises.filter(b => b !== "svg" && b !== "path");
  if (autres.length) throw new Error(`${nom} : balises inattendues (${[...new Set(autres)].join(", ")})`);
  const traces = [...texte.matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*>/g)].map(m => m[1]).filter(d => d !== FOND_ICONE);
  if (!traces.length) throw new Error(`${nom} : aucun tracé`);
  for (const d of traces) if (!TRACE_SUR.test(d)) throw new Error(`${nom} : tracé illisible`);
  return traces;
}

// Tracés d'une icône « auteur/nom » : copie locale (dossierIcones), sinon prise dans l'archive source, vérifiée puis copiée
// (avec la licence de l'archive si le dossier n'en a pas encore). auteurs : table auteur -> nom affiché du monde.
export function lireIcone(nom, { auteurs, source, dossierIcones = DOSSIER_ICONES } = {}) {
  if (!NOM_ICONE.test(nom)) throw new Error(`Nom d'icône invalide : « ${nom} » (attendu auteur/nom)`);
  const [auteur] = nom.split("/");
  if (!auteurs?.[auteur]) throw new Error(`Auteur game-icons inconnu : ${auteur} (ajouter son nom dans AUTEURS, contenu/jetons.mjs)`);
  const copie = join(dossierIcones, `${nom}.svg`);
  if (!existsSync(copie)) {
    const original = source && join(source, `${nom}.svg`);
    if (!original || !existsSync(original)) throw new Error(`Icône ${nom} absente de outils/game-icons/ : relancer avec --source <archive game-icons>`);
    tracesIcone(readFileSync(original, "utf8"), nom); // vérifiée avant d'être copiée
    mkdirSync(dirname(copie), { recursive: true });
    copyFileSync(original, copie);
    const licence = join(source, "license.txt");
    if (existsSync(licence) && !existsSync(join(dossierIcones, "license.txt"))) copyFileSync(licence, join(dossierIcones, "license.txt"));
  }
  return tracesIcone(readFileSync(copie, "utf8"), nom);
}

// ---------------------------------------------------------------- Dessin

const echapper = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rvb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
// Mélange vers le blanc (t > 0) ou vers le noir (t < 0).
export const nuance = (couleur, t) => hex(rvb(couleur).map(v => (t >= 0 ? v + (255 - v) * t : v * (1 + t))));

const ombreSvg11 = (id, dx, dy, flou, opacite) => `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%">` +
  `<feGaussianBlur in="SourceAlpha" stdDeviation="${flou}"/><feOffset dx="${dx}" dy="${dy}" result="decale"/>` +
  `<feComponentTransfer><feFuncA type="linear" slope="${opacite}"/></feComponentTransfer>` +
  `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const silhouette = (traces, cx, cy, echelle, attributs) =>
  `<g transform="translate(${cx} ${cy}) scale(${echelle}) translate(-256 -256)">${traces.map(d => `<path ${attributs} d="${d}"/>`).join("")}</g>`;
const entete = titre => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><title>${echapper(titre)}</title>`;

// Version plate : anneau uni, médaillon sombre, silhouette claire avec une légère ombre.
export function jetonPlat({ titre, couleur, attitude, lisere, traces }) {
  const r = 166;
  return entete(titre) +
    `<defs><radialGradient id="fond" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#3b3331"/><stop offset="1" stop-color="#0c0a0a"/></radialGradient>` +
    ombreSvg11("ombre", 0, 3, 4, 0.8) +
    `<clipPath id="medaillon"><circle cx="200" cy="200" r="${r}"/></clipPath></defs>` +
    `<circle id="anneau" data-attitude="${attitude}" data-couleur="${couleur}" cx="200" cy="200" r="197" fill="${couleur}"/>` +
    `<circle cx="200" cy="200" r="196" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="2"/>` +
    `<circle cx="200" cy="200" r="${r}" fill="url(#fond)"/>` +
    `<g clip-path="url(#medaillon)"><g filter="url(#ombre)">${silhouette(traces, 200, 200, 0.5, 'fill="#ece5d6"')}</g></g>` +
    (lisere
      ? `<circle id="lisere" cx="200" cy="200" r="${r}" fill="none" stroke="${lisere}" stroke-width="4"/><circle cx="200" cy="200" r="192" fill="none" stroke="${lisere}" stroke-width="3"/>`
      : `<circle cx="200" cy="200" r="${r}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="3"/>`) +
    `</svg>\n`;
}

// Version en relief : anneau biseauté, médaillon bombé, silhouette en relief, reflet, ombre sous le jeton.
export function jetonRelief({ titre, couleur, attitude, lisere, traces }) {
  const cx = 200, cy = 194, R = 182, r = 152;
  const clair = nuance(couleur, 0.45), sombre = nuance(couleur, -0.6);
  // Arc de reflet sur le haut de l'anneau, de 205° à 335°.
  const rayonArc = (R + r) / 2 + 2, a1 = 205 * Math.PI / 180, a2 = 335 * Math.PI / 180;
  const pt = a => `${(cx + rayonArc * Math.cos(a)).toFixed(1)} ${(cy + rayonArc * Math.sin(a)).toFixed(1)}`;
  return entete(titre) + `<defs>` +
    `<filter id="flou-ombre" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="7"/></filter>` +
    `<linearGradient id="biseau" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="${clair}"/><stop offset="0.5" stop-color="${couleur}"/><stop offset="1" stop-color="${sombre}"/></linearGradient>` +
    `<linearGradient id="biseau-creux" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="${sombre}"/><stop offset="1" stop-color="${clair}"/></linearGradient>` +
    `<radialGradient id="bombe" cx="0.4" cy="0.34" r="0.75"><stop offset="0" stop-color="#4d4440"/><stop offset="0.55" stop-color="#1d1817"/><stop offset="1" stop-color="#060505"/></radialGradient>` +
    `<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset="1" stop-color="#bdb29a"/></linearGradient>` +
    `<linearGradient id="reflet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    (lisere ? `<linearGradient id="lisere-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${nuance(lisere, 0.6)}"/><stop offset="0.5" stop-color="${lisere}"/><stop offset="1" stop-color="${nuance(lisere, -0.5)}"/></linearGradient>` : "") +
    ombreSvg11("relief", 3, 5, 3, 0.9) +
    `<clipPath id="medaillon"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>` +
    // Ombre portée douce sous le jeton
    `<circle cx="${cx}" cy="${cy + 9}" r="${R}" fill="#000" fill-opacity="0.55" filter="url(#flou-ombre)"/>` +
    // Anneau biseauté et gorge intérieure
    `<circle id="anneau" data-attitude="${attitude}" data-couleur="${couleur}" cx="${cx}" cy="${cy}" r="${R}" fill="url(#biseau)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${R - 0.75}" fill="none" stroke="${sombre}" stroke-width="1.5"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="url(#biseau-creux)"/>` +
    // Médaillon bombé, silhouette en relief (liseré clair décalé vers la lumière, ombre portée), reflet
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bombe)"/>` +
    `<g clip-path="url(#medaillon)"><g filter="url(#relief)">` +
    silhouette(traces, cx - 1.5, cy - 1.5, 0.46, 'fill="#fff" fill-opacity="0.6"') +
    silhouette(traces, cx, cy, 0.46, 'fill="url(#metal)"') +
    `</g><ellipse cx="${cx}" cy="${cy - 82}" rx="126" ry="64" fill="url(#reflet)"/></g>` +
    `<path d="M${pt(a1)} A${rayonArc} ${rayonArc} 0 0 1 ${pt(a2)}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="7" stroke-linecap="round"/>` +
    (lisere
      ? `<circle id="lisere" cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="url(#lisere-metal)" stroke-width="3.5"/><circle cx="${cx}" cy="${cy}" r="${R - 4}" fill="none" stroke="url(#lisere-metal)" stroke-width="3"/>`
      : "") +
    `</svg>\n`;
}

// ---------------------------------------------------------------- Vérification (utilisée aussi par les essais)

// SVG autonome et bien formé : racine <svg> avec viewBox, balises équilibrées, aucune référence externe.
export function erreursSvg(texte, nom) {
  const erreurs = [];
  const t = texte.trim();
  if (!/^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/.test(t)) erreurs.push(`${nom} : la racine n'est pas <svg xmlns=…>`);
  if (!/^<svg\s[^>]*viewBox="0 0 400 400"/.test(t)) erreurs.push(`${nom} : viewBox 0 0 400 400 absent`);
  if (!t.endsWith("</svg>")) erreurs.push(`${nom} : ne se termine pas par </svg>`);
  if (/href|url\((?!#)|<image|<script|@import/i.test(t)) erreurs.push(`${nom} : référence externe ou script`);
  const pile = [];
  for (const [, fermante, nomBalise, autoFermee] of t.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g)) {
    if (fermante) {
      if (pile.pop() !== nomBalise) { erreurs.push(`${nom} : </${nomBalise}> mal fermée`); break; }
    } else if (!autoFermee) pile.push(nomBalise);
  }
  if (pile.length) erreurs.push(`${nom} : balise(s) non fermée(s) : ${pile.join(", ")}`);
  if (/<svg/.test(t) && (t.match(/<svg\b/g) ?? []).length !== 1) erreurs.push(`${nom} : plusieurs <svg>`);
  return erreurs;
}

// Couleur de l'anneau inscrite dans le jeton (attribut data-couleur de #anneau, et sa peinture).
export function couleurAnneau(texte) {
  const anneau = /<circle id="anneau"[^>]*>/.exec(texte)?.[0] ?? "";
  const declaree = /data-couleur="(#[0-9a-f]{6})"/.exec(anneau)?.[1] ?? null;
  const peinture = /fill="([^"]+)"/.exec(anneau)?.[1] ?? null;
  if (peinture === "url(#biseau)") {
    const milieu = /<linearGradient id="biseau"[^>]*>.*?<stop offset="0\.5" stop-color="(#[0-9a-f]{6})"/.exec(texte)?.[1] ?? null;
    return milieu === declaree ? declaree : null;
  }
  return peinture === declaree ? declaree : null;
}

// Contrôle d'un jeton fabriqué : présent, SVG bien formé, anneau de la couleur attendue. Les erreurs vont dans `erreurs`.
export function controleurJetons(lire, erreurs) {
  return (chemin, nom, couleur) => {
    const texte = lire(chemin);
    if (texte === null) return erreurs.push(`${nom} : jeton absent (${chemin})`);
    erreurs.push(...erreursSvg(texte, chemin));
    const lue = couleurAnneau(texte);
    if (lue !== couleur) erreurs.push(`${chemin} : anneau ${lue ?? "illisible"} au lieu de ${couleur}`);
  };
}

// ---------------------------------------------------------------- Disque (chemins relatifs à la racine d'un dépôt)

// lire(chemin relatif à racine) -> texte, ou null si absent.
export const lecteurDisque = racine => chemin => {
  const complet = join(racine, chemin);
  return existsSync(complet) ? readFileSync(complet, "utf8") : null;
};

// ecrire(chemin relatif à racine, texte), dossiers créés au besoin.
export const ecrivainDisque = racine => (chemin, texte) => {
  const complet = join(racine, chemin);
  mkdirSync(dirname(complet), { recursive: true });
  writeFileSync(complet, texte);
};

// Dessine chaque jeton { icone, titre, anneau: { couleur, attitude }, lisere?, plat, relief } en version plate et en relief.
export function dessinerJetons(jetons, { ecrire, auteurs, source, dossierIcones = DOSSIER_ICONES }) {
  for (const j of jetons) {
    const traces = lireIcone(j.icone, { auteurs, source, dossierIcones });
    const modele = { titre: j.titre, couleur: j.anneau.couleur, attitude: j.anneau.attitude, lisere: j.lisere ?? null, traces };
    ecrire(j.plat, jetonPlat(modele));
    ecrire(j.relief, jetonRelief(modele));
  }
}

// ---------------------------------------------------------------- Crédits

// Lignes du tableau des icônes (| Icône | Auteur | Utilisée pour |) et liste triée des auteurs, pour le CREDITS.md d'un monde.
export function tableauCredits(jetons, auteurs) {
  const usages = new Map();
  for (const j of jetons) usages.set(j.icone, [...(usages.get(j.icone) ?? []), j.titre]);
  const lignes = [...usages.keys()].sort().map(nom => {
    const [auteur, fichier] = nom.split("/");
    return `| [${fichier}](https://game-icons.net/1x1/${auteur}/${fichier}.html) | ${auteurs[auteur]} | ${usages.get(nom).join(" ; ")} |`;
  });
  return { lignes: lignes.join("\n"), auteurs: [...new Set([...usages.keys()].map(n => auteurs[n.split("/")[0]]))].sort().join(", ") };
}

// ---------------------------------------------------------------- Ligne de commande

// Vrai quand le fichier `url` (import.meta.url) est lancé directement par node (chemins réels comparés : un sous-module
// relié par une jonction ou un lien symbolique reste reconnu).
export function lanceDirectement(url) {
  if (!process.argv[1]) return false;
  try { return realpathSync(fileURLToPath(url)) === realpathSync(resolve(process.argv[1])); } catch { return false; }
}

// Valeur de --source <dossier icons-master de l'archive game-icons>, ou undefined.
export function argumentSource(argv = process.argv) {
  const i = argv.indexOf("--source");
  return i > 0 ? argv[i + 1] : undefined;
}
