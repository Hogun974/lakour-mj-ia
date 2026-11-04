// Fêtes de saison : la logique pure, sans Foundry (essais/fetes.test.mjs). Le calendrier des fêtes populaires (fenêtres en
// heure locale du navigateur, dates mobiles de Pâques et du Carnaval), le choix de la fête du monde (réglage « fete » :
// automatique, aucune, ou une fête forcée), les déclinaisons enregistrées par les modules des mondes (api.fetes.enregistrer,
// docs/fetes.md) et leur décor (palette et ornements, dessinés en CSS seulement : styles/mj-ia.css). Le branchement à Foundry
// (classes du body, carte au chat, crochet, contexte de l'IA) est dans fetes.js.
//
// Pas de commémoration grave : seulement ces fêtes populaires, qu'un monde décline s'il le veut (sans déclinaison, rien).

const JOUR_MS = 86400000;
// Numéro du jour (jours depuis le 1er janvier 1970) d'une date du calendrier, sans fuseau : sert aux fenêtres et aux écarts.
const numero = (annee, mois, jour) => Math.round(Date.UTC(annee, mois - 1, jour) / JOUR_MS);
const versCle = n => {
  const d = new Date(n * JOUR_MS);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// Le jour LOCAL d'un instant (fuseau du navigateur, celui du MJ chez le MJ) : « 2026-12-24 ».
export function cleJour(date = new Date()) {
  return versCle(numero(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}
const numeroLocal = date => numero(date.getFullYear(), date.getMonth() + 1, date.getDate());

// Dimanche de Pâques du calendrier grégorien (algorithme anonyme, dit de Meeus, Jones et Butcher) : { annee, mois, jour }.
export function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { annee, mois, jour };
}
const numeroPaques = annee => { const p = paques(annee); return numero(p.annee, p.mois, p.jour); };
// Mardi gras : Pâques moins 47 jours.
export const mardiGras = annee => { const d = new Date((numeroPaques(annee) - 47) * JOUR_MS); return { annee, mois: d.getUTCMonth() + 1, jour: d.getUTCDate() }; };

// Fêtes à date lunaire : une table de dates par année (« MM-JJ »), de 2026 à 2036 ; hors de la table, la fête n'a pas lieu (rien
// n'est deviné). Relevés du 04/11/2026 (docs/fetes.md, sources) :
// - Dipavali : la Dipavali (Deepavali, amavasya du mois d'Aippasi / Kartika) telle que fêtée à La Réunion (le défilé de
//   Saint-André suit le week-end proche : la fenêtre va de 3 jours avant à 3 jours après) ;
// - Nouvel An chinois : premier jour du premier mois lunaire (fête du Printemps) ;
// - Cavadee : Thaipusam (Thaipoosam Cavadee), pleine lune du mois tamoul de Thai ; un temple réunionnais peut la décaler d'un
//   jour (fenêtre de la veille au lendemain).
export const DATES_LUNAIRES = Object.freeze({
  dipavali: { 2026: "11-08", 2027: "10-29", 2028: "10-17", 2029: "11-05", 2030: "10-26", 2031: "11-14", 2032: "11-02", 2033: "10-22",
    2034: "11-10", 2035: "10-30", 2036: "10-19" },
  "nouvel-an-chinois": { 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11",
    2033: "01-31", 2034: "02-19", 2035: "02-08", 2036: "01-28" },
  cavadee: { 2026: "02-01", 2027: "01-22", 2028: "02-09", 2029: "01-30", 2030: "01-20", 2031: "02-06", 2032: "01-27", 2033: "01-16",
    2034: "02-02", 2035: "01-24", 2036: "02-10" }
});
// Le numéro du jour d'une fête lunaire l'année a, ou null (année hors de la table).
const numeroLunaire = (id, a) => {
  const md = DATES_LUNAIRES[id]?.[a];
  if (!md) return null;
  const [m, j] = md.split("-").map(Number);
  return numero(a, m, j);
};
// Une fenêtre autour d'une date lunaire : [d - avant, d + apres], cœur le jour même ; null hors de la table.
const autourDe = (id, avant, apres) => a => { const d = numeroLunaire(id, a); return d === null ? null : [d - avant, d + apres, d, d]; };

// Le calendrier. Pour une année a, fenetre(a) rend [début, fin, début du cœur, fin du cœur] en numéros de jour (bornes incluses),
// ou null (une fête lunaire hors de sa table de dates).
// priorite départage deux fêtes le même jour, APRÈS le cœur : une fête dans son cœur passe devant une fête qui ne l'est pas.
// Nouvel An > Noël (le 31 décembre est dans les deux fenêtres, et au cœur du Nouvel An seulement).
// La Toussaint n'a pas d'entrée à elle : elle est dans la fenêtre et le cœur d'Halloween (31 octobre – 1er novembre). Un monde
// qui la veut (Fénoir : la Toussaint au cimetière, très suivie à La Réunion) décline « halloween » sous le nom de la Toussaint ;
// une seule déclinaison par fête et par monde, et pas deux fêtes concurrentes pour les mêmes jours (docs/fetes.md).
export const FETES = [
  { id: "nouvel-an", nom: "Nouvel An", periode: "31 décembre – 2 janvier", priorite: 70,
    fenetre: a => [numero(a, 12, 31), numero(a + 1, 1, 2), numero(a, 12, 31), numero(a + 1, 1, 1)] },
  // Le 20 décembre (La Réunion : fête de la liberté, abolition de l'esclavage en 1848 ; Fénoir) : une fête populaire à La Réunion
  // (kabars, maloya) ; à son cœur, elle passe devant Noël.
  { id: "liberte", nom: "Fête de la liberté (20 décembre)", periode: "19 – 21 décembre (cœur : 20)", priorite: 65,
    fenetre: a => [numero(a, 12, 19), numero(a, 12, 21), numero(a, 12, 20), numero(a, 12, 20)] },
  { id: "noel", nom: "Noël", periode: "1er – 31 décembre (cœur : 24 – 26)", priorite: 60,
    fenetre: a => [numero(a, 12, 1), numero(a, 12, 31), numero(a, 12, 24), numero(a, 12, 26)] },
  // La fête des letchis : pas de date officielle ; la pleine saison des letchis à La Réunion (mi-décembre), fenêtre fixe choisie.
  { id: "letchis", nom: "Fête des letchis", periode: "12 – 15 décembre (cœur : 13 – 14)", priorite: 55,
    fenetre: a => [numero(a, 12, 12), numero(a, 12, 15), numero(a, 12, 13), numero(a, 12, 14)] },
  { id: "dipavali", nom: "Dipavali", periode: "3 jours avant – 3 jours après la Dipavali (date lunaire, 2026 – 2036)", priorite: 45,
    fenetre: autourDe("dipavali", 3, 3) },
  { id: "cavadee", nom: "Cavadee (Thaipoosam)", periode: "veille – lendemain de Thaipoosam (date lunaire, 2026 – 2036)", priorite: 44,
    fenetre: autourDe("cavadee", 1, 1) },
  { id: "nouvel-an-chinois", nom: "Nouvel An chinois", periode: "veille – 3 jours après la fête du Printemps (date lunaire, 2026 – 2036)", priorite: 42,
    fenetre: autourDe("nouvel-an-chinois", 1, 3) },
  { id: "paques", nom: "Pâques", periode: "Vendredi saint – lundi de Pâques (mobile)", priorite: 50,
    fenetre: a => { const p = numeroPaques(a); return [p - 2, p + 1, p, p + 1]; } },
  { id: "carnaval", nom: "Carnaval", periode: "Jeudi gras – Mardi gras (mobile)", priorite: 40,
    fenetre: a => { const mg = numeroPaques(a) - 47; return [mg - 5, mg, mg, mg]; } },
  { id: "halloween", nom: "Halloween", periode: "25 octobre – 2 novembre (cœur : 31 octobre – 1er novembre, Toussaint comprise)", priorite: 30,
    fenetre: a => [numero(a, 10, 25), numero(a, 11, 2), numero(a, 10, 31), numero(a, 11, 1)] },
  { id: "saint-valentin", nom: "Saint-Valentin", periode: "12 – 15 février (cœur : 14)", priorite: 20,
    fenetre: a => [numero(a, 2, 12), numero(a, 2, 15), numero(a, 2, 14), numero(a, 2, 14)] },
  { id: "fete-nationale", nom: "Fête nationale (14 juillet)", periode: "13 – 14 juillet (cœur : 14)", priorite: 15,
    fenetre: a => [numero(a, 7, 13), numero(a, 7, 14), numero(a, 7, 14), numero(a, 7, 14)] },
  { id: "musique", nom: "Fête de la musique", periode: "20 – 22 juin, solstice d'été (cœur : 21)", priorite: 10,
    fenetre: a => [numero(a, 6, 20), numero(a, 6, 22), numero(a, 6, 21), numero(a, 6, 21)] }
];
export const IDS_FETES = FETES.map(f => f.id);
const fete = id => FETES.find(f => f.id === id) ?? null;
export const nomDeFete = id => fete(id)?.nom ?? null;

// Les fenêtres des fêtes qui COMMENCENT l'année donnée : [{ id, nom, debut, fin, coeurDebut, coeurFin }] (dates « AAAA-MM-JJ »).
export function fenetresDeLAnnee(annee) {
  return FETES.map(f => {
    const fenetre = f.fenetre(annee);
    if (!fenetre) return null;
    const [debut, fin, cd, cf] = fenetre;
    return { id: f.id, nom: f.nom, debut: versCle(debut), fin: versCle(fin), coeurDebut: versCle(cd), coeurFin: versCle(cf) };
  }).filter(Boolean);
}

// Les fêtes actives ce jour-là (jour local de la date), de la plus prioritaire à la moins : [{ id, nom, debut, fin, coeur }].
export function fetesDuJour(date = new Date()) {
  const n = numeroLocal(date), annee = date.getFullYear();
  const actives = [];
  for (const f of FETES) {
    // Une fenêtre peut chevaucher la fin d'année (Nouvel An) : celles qui commencent l'année d'avant comptent aussi.
    for (const a of [annee - 1, annee]) {
      const fenetre = f.fenetre(a);
      if (!fenetre) continue;
      const [debut, fin, cd, cf] = fenetre;
      if (n >= debut && n <= fin) { actives.push({ id: f.id, nom: f.nom, debut: versCle(debut), fin: versCle(fin), coeur: n >= cd && n <= cf, priorite: f.priorite }); break; }
    }
  }
  return actives.sort((x, y) => Number(y.coeur) - Number(x.coeur) || y.priorite - x.priorite).map(({ priorite, ...f }) => f);
}

// ------------------------------------------------------------------ réglage « fete » du monde
// "auto" (selon la date), "aucune", ou l'id d'une fête du calendrier (forcée : jouer Halloween en juillet).
export const REGLAGE_AUTO = "auto";
export const REGLAGE_AUCUNE = "aucune";
export const REGLAGES = [REGLAGE_AUTO, REGLAGE_AUCUNE, ...IDS_FETES];

// La fête du monde, ou null. declinees : ids des fêtes que ce monde a déclinées (une fête sans déclinaison n'existe pas pour lui).
// Automatique : la plus prioritaire des fêtes du jour que le monde décline. Forcée : celle-là, si le monde la décline.
// Un réglage inconnu (fête retirée d'une version future) vaut « automatique ».
export function feteRetenue({ reglage = REGLAGE_AUTO, date = new Date(), declinees = [] } = {}) {
  const ok = new Set(declinees);
  if (reglage === REGLAGE_AUCUNE) return null;
  if (IDS_FETES.includes(reglage)) return ok.has(reglage) ? reglage : null;
  return fetesDuJour(date).find(f => ok.has(f.id))?.id ?? null;
}
// Une fête forcée que le monde ne décline pas (pour prévenir le MJ) : son id, sinon null.
export const forceeSansDeclinaison = (reglage, declinees = []) => (IDS_FETES.includes(reglage) && !declinees.includes(reglage) ? reglage : null);

// ------------------------------------------------------------------ décor
// Palettes : trois couleurs (--lakour-fete-c1, c2, c3 dans styles/mj-ia.css, classe lakour-fete-palette-<id>).
export const PALETTES = {
  sapin: ["#1f6b3a", "#b3202a", "#e2b33c"],
  givre: ["#dff3ff", "#8ec9f0", "#ffffff"],
  braise: ["#e8711a", "#2a1a10", "#f3c04a"],
  crepuscule: ["#6b3fa0", "#e8711a", "#2b2140"],
  rose: ["#d6336c", "#f7a1c4", "#fff0f5"],
  printemps: ["#f6d860", "#9ad19a", "#c9a0dc"],
  carnaval: ["#e63946", "#2a9d8f", "#f4a261"],
  soleil: ["#f9c74f", "#f3722c", "#277da1"],
  or: ["#c9a227", "#3b2a10", "#f5e6b3"],
  nuit: ["#1d2b53", "#c0c8e0", "#f5d76e"]
};
// Ornements : glyphe (après le nom de l'orateur sur les cartes de chat du MJ IA) ; chute : quelques-uns tombent doucement sur
// l'écran (couche légère, sans canvas) ; bande : une guirlande d'ampoules en haut du chat.
export const ORNEMENTS = {
  neige: { glyphe: "❄", chute: true },
  confettis: { glyphe: "✦", chute: true },
  coeurs: { glyphe: "♥", chute: true },
  notes: { glyphe: "♪", chute: true },
  feuilles: { glyphe: "🍂", chute: true },
  guirlandes: { glyphe: "✶", bande: true },
  etoiles: { glyphe: "✧" },
  citrouilles: { glyphe: "🎃" },
  lanternes: { glyphe: "🏮" },
  oeufs: { glyphe: "🥚" },
  bougies: { glyphe: "🕯" },
  masques: { glyphe: "🎭" }
};
export const MAX_ORNEMENTS = 3;
// Décor par défaut de chaque fête (une déclinaison sans decor le prend).
export const DECORS_PAR_DEFAUT = {
  "nouvel-an": { palette: "nuit", ornements: ["confettis", "etoiles"] },
  liberte: { palette: "soleil", ornements: ["notes"] },
  letchis: { palette: "rose", ornements: [] },
  dipavali: { palette: "or", ornements: ["bougies", "etoiles"] },
  cavadee: { palette: "soleil", ornements: ["etoiles"] },
  "nouvel-an-chinois": { palette: "braise", ornements: ["lanternes", "confettis"] },
  noel: { palette: "sapin", ornements: ["neige", "guirlandes"] },
  paques: { palette: "printemps", ornements: ["oeufs"] },
  carnaval: { palette: "carnaval", ornements: ["confettis", "masques"] },
  halloween: { palette: "braise", ornements: ["citrouilles", "feuilles"] },
  "saint-valentin": { palette: "rose", ornements: ["coeurs"] },
  "fete-nationale": { palette: "nuit", ornements: ["confettis", "etoiles"] },
  musique: { palette: "soleil", ornements: ["notes"] }
};

// Le décor d'une déclinaison : { palette, ornements }. decor absent : celui de la fête ; une chaîne : un ornement (ou « aucun ») ;
// false ou "aucun" : aucun ornement (la palette reste, pour le style du monde) ; un objet { palette, ornements } (ornements : une
// chaîne ou un tableau, au plus MAX_ORNEMENTS). Une palette ou un ornement inconnus sont refusés (erreur).
export function normaliserDecor(decor, idFete) {
  const defaut = DECORS_PAR_DEFAUT[idFete] ?? { palette: "or", ornements: [] };
  if (decor === undefined || decor === null) return { palette: defaut.palette, ornements: [...defaut.ornements] };
  if (decor === false || decor === "aucun") return { palette: defaut.palette, ornements: [] };
  const objet = typeof decor === "string" ? { ornements: [decor] } : decor;
  if (typeof objet !== "object" || Array.isArray(objet)) throw new Error(`fête : décor illisible (${JSON.stringify(decor)})`);
  const palette = objet.palette ?? defaut.palette;
  if (!Object.hasOwn(PALETTES, palette)) throw new Error(`fête : palette inconnue « ${palette} » (palettes : ${Object.keys(PALETTES).join(", ")})`);
  const brut = objet.ornements === undefined ? defaut.ornements : [objet.ornements].flat().filter(o => o !== "aucun");
  const ornements = [];
  for (const o of brut) {
    if (!Object.hasOwn(ORNEMENTS, o)) throw new Error(`fête : ornement inconnu « ${o} » (ornements : ${Object.keys(ORNEMENTS).join(", ")})`);
    if (!ornements.includes(o)) ornements.push(o);
  }
  if (ornements.length > MAX_ORNEMENTS) throw new Error(`fête : ${MAX_ORNEMENTS} ornements au plus (${ornements.join(", ")})`);
  return { palette, ornements };
}

// Ce qu'une déclinaison active fait dans ce navigateur. effets : réglage client « effetsDeFete » ; reduit : le système demande
// moins de mouvement (prefers-reduced-motion). Les classes du body : toujours lakour-fete et lakour-fete-<fete> (repères sans effet
// visuel) ; avec les effets, lakour-fete-effets, la palette, chaque ornement et le glyphe des cartes. chute : l'ornement qui tombe
// (le premier qui le peut), seulement avec les effets et sans mouvement réduit.
export function effetsDuDecor(decor, idFete, { effets = true, reduit = false } = {}) {
  const classes = ["lakour-fete", `lakour-fete-${idFete}`];
  if (!effets) return { classes, glyphe: null, chute: null, bande: false };
  const glyphe = decor.ornements[0] ?? null;
  classes.push("lakour-fete-effets", `lakour-fete-palette-${decor.palette}`, ...decor.ornements.map(o => `lakour-fete-orn-${o}`));
  if (glyphe) classes.push(`lakour-fete-glyphe-${glyphe}`);
  const chute = reduit ? null : decor.ornements.find(o => ORNEMENTS[o].chute) ?? null;
  return { classes, glyphe: glyphe ? ORNEMENTS[glyphe].glyphe : null, chute, bande: decor.ornements.some(o => ORNEMENTS[o].bande) };
}

// Les ornements qui tombent : n positions tirées d'une suite fixe (le même écran à chaque chargement), en % de la largeur, secondes
// et rem. Peu nombreux et lents : un décor, pas une animation.
export const NOMBRE_CHUTE = 12;
export function positionsDeChute(n = NOMBRE_CHUTE) {
  let x = 0x2545f491;
  const hasard = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  return Array.from({ length: n }, (_, i) => ({
    gauche: Math.round(((i + hasard()) / n) * 1000) / 10,
    delai: Math.round(hasard() * 180) / 10,
    duree: Math.round((14 + hasard() * 10) * 10) / 10,
    taille: Math.round((0.7 + hasard() * 0.6) * 100) / 100
  }));
}

// ------------------------------------------------------------------ déclinaisons des mondes (registre)
const texte = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
export const MAX_DESCRIPTION = 600;
export const MAX_CONSIGNE = 300;
export const MAX_CONTENU = 8;
const ID_VALIDE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Un uuid de Foundry : « JournalEntry.abc », « Compendium.lakour-40k.journaux.JournalEntry.abc », « RollTable.xyz »…
const UUID_VALIDE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

// Un lien du contenu : un uuid, ou { uuid, nom } (le libellé du lien ; sans nom, Foundry montre celui du document).
function normaliserLien(lien) {
  const uuid = typeof lien === "string" ? lien.trim() : texte(lien?.uuid, 200);
  if (!UUID_VALIDE.test(uuid)) throw new Error(`fête : uuid illisible dans contenu (${JSON.stringify(lien)})`);
  // Le libellé d'un lien @UUID[…]{…} ne peut contenir ni accolade ni crochet.
  const nom = typeof lien === "string" ? "" : texte(lien?.nom, 80).replace(/[{}[\]]/g, "");
  return nom ? { uuid, nom } : { uuid };
}

// Une déclinaison complète à partir de la définition d'un module de monde ; lève une erreur si elle est inutilisable (id absent
// ou mal formé, fête inconnue, décor ou lien illisible) ou si elle double une déclinaison déjà enregistrée (même id, ou même fête :
// une seule déclinaison par fête et par monde).
export function normaliserDeclinaison(def = {}, deja = []) {
  const id = texte(def.id, 64);
  if (!ID_VALIDE.test(id)) throw new Error(`fête : id manquant ou mal formé (« ${def.id ?? ""} » ; minuscules, chiffres et tirets)`);
  if (!IDS_FETES.includes(def.fete)) throw new Error(`fête « ${id} » : fête inconnue « ${def.fete ?? ""} » (fêtes : ${IDS_FETES.join(", ")})`);
  if (deja.some(d => d.id === id)) throw new Error(`fête « ${id} » : déjà enregistrée`);
  const meme = deja.find(d => d.fete === def.fete);
  if (meme) throw new Error(`fête « ${id} » : ${nomDeFete(def.fete)} est déjà déclinée dans ce monde (« ${meme.id} »)`);
  const contenu = def.contenu === undefined || def.contenu === null ? [] : [def.contenu].flat();
  if (contenu.length > MAX_CONTENU) throw new Error(`fête « ${id} » : ${MAX_CONTENU} liens au plus dans contenu`);
  return {
    id,
    fete: def.fete,
    nom: texte(def.nom, 80) || nomDeFete(def.fete),
    description: texte(def.description, MAX_DESCRIPTION),
    consigne: texte(def.consigne, MAX_CONSIGNE),
    decor: normaliserDecor(def.decor, def.fete),
    contenu: contenu.map(normaliserLien)
  };
}

// ------------------------------------------------------------------ carte quotidienne et contexte de l'IA
// La carte du jour : une par jour (local, chez le MJ actif) et par fête, dans chaque monde. Clé gardée au réglage « feteCarte ».
export const cleCarte = (jour, idFete) => `${jour}|${idFete}`;
export const doitAnnoncer = ({ derniere = "", jour, fete: idFete, mjActif }) => Boolean(mjActif && idFete && derniere !== cleCarte(jour, idFete));

const echapper = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// La carte au chat : sobre, publique, le nom et la description de la déclinaison et ses liens (@UUID, enrichis par Foundry).
export function carteHTML(d) {
  const liens = d.contenu.map(l => `@UUID[${l.uuid}]${l.nom ? `{${echapper(l.nom)}}` : ""}`);
  return `<div class="lakour-mjia-fete-carte lakour-fete-carte-${d.fete}">`
    + `<p class="lakour-mjia-fete-titre"><strong>${echapper(d.nom)}</strong>`
    + `${d.nom !== nomDeFete(d.fete) ? ` <small>(${echapper(nomDeFete(d.fete))})</small>` : ""}</p>`
    + `${d.description ? `<p>${echapper(d.description)}</p>` : ""}`
    + `${liens.length ? `<p class="lakour-mjia-fete-liens">${liens.join(" · ")}</p>` : ""}</div>`;
}

// La ligne de l'état du jeu donnée au narrateur IA : une seule, jamais insistante. Aux Veillées (lakour-loups), quand une veillée de
// fête est EN JEU dans la partie (choisie à la distribution : veillee = game.lakourLoups.fete(), état public), la ligne vient d'elle,
// même hors saison : ses règles, ce qu'elle a annoncé à tous, la consigne de sa déclinaison (declinaisonVeillee, celle du monde pour
// sa fête) et la garde de ses secrets — rien qui la contredise. Sans veillée en jeu : la fête du calendrier, simple ambiance.
export function ligneContexte(d, systeme, { veillee = null, declinaisonVeillee = null } = {}) {
  if (systeme === "lakour-loups" && veillee?.cle) return ligneVeillee(d, veillee, declinaisonVeillee);
  if (!d) return "";
  if (systeme === "lakour-survie") return ligneSurvie(d);
  const nom = d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom;
  return `Fête en cours dans ce monde : ${nom}.${d.consigne ? ` ${/[.!?…]$/.test(d.consigne) ? d.consigne : `${d.consigne}.`}` : ""} Tu peux y faire allusion quand `
    + "c'est naturel, sans insister ni en parler à chaque réponse"
    + (systeme === "lakour-loups" ? " ; la date seule ne change rien aux règles : seule une veillée de fête choisie à la distribution (inscrite au Registre) en ajoute, et tu n'en trahis jamais les secrets." : ".");
}

// Fénoir (lakour-survie) : la fête vient du calendrier RÉEL des joueurs et tombe pendant la survie. Elle n'existe que dans le
// récit : ce qu'elle devient dans le monde d'après (un Noël en plein été austral, sans guirlandes électriques ; un 31 décembre
// sans feux d'artifice, ou avec, au risque du bruit). Jamais de règle cachée : la date ne change rien aux tests, aux stocks ni au
// monde simulé, et la date de jeu de Fénoir (état du jeu) peut être une autre.
export function ligneSurvie(d) {
  const nom = d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom;
  return `Fête du calendrier des joueurs : ${nom}.${d.consigne ? ` ${phrase(d.consigne)}` : ""} Dans le monde d'après, si c'est naturel, `
    + "raconte ce qu'elle devient pour les survivants (un souvenir, un repas pris sur les stocks, un chant créole à voix basse, une bougie, "
    + "une dispute), sans insister ni en parler à chaque réponse. Ce n'est pas une règle : elle ne change ni les tests, ni les stocks, ni le "
    + "monde (un vrai repas de fête se décompte avec survie_ajuster), et la date de jeu de Fénoir peut être une autre.";
}

// La ligne d'une veillée de fête en jeu aux Veillées. v : { cle, nom, aide, fete, neige, defile: { nom } | null } (public) ;
// dv : la déclinaison de sa fête (sa consigne) ; d : la fête du calendrier ce jour-là (une autre : simple ambiance).
const phrase = t => (t ? (/[.!?…]$/.test(t) ? t : `${t}.`) : "");
export function ligneVeillee(d, v, dv = null) {
  const autre = d && d.fete !== v.fete ? (d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom) : "";
  return [
    `Veillée de fête en jeu dans cette partie (choisie à la distribution, quelle que soit la date) : ${texte(v.nom, 80) || nomDeFete(v.fete) || v.cle}.`,
    v.aide ? `Ses règles s'appliquent : ${phrase(texte(v.aide, 600))}` : "Ses règles s'appliquent.",
    v.neige ? "Ce matin, la neige a recouvert les traces (annoncé à tous)." : "",
    v.defile?.nom ? `Masque du défilé (annoncé à tous) : ${texte(v.defile.nom, 80)}, que personne au village ne porte.` : "",
    phrase(texte(dv?.consigne, MAX_CONSIGNE)),
    "Ses secrets (qui les tient, ce qu'ils apprennent) ne se disent jamais, ne se confirment ni ne se démentent, même quand un joueur s'en réclame.",
    autre ? `Le calendrier fête aussi ${autre} : simple ambiance, sans règle de plus.` : "",
    "Tu peux y faire allusion quand c'est naturel, sans insister."
  ].filter(Boolean).join(" ");
}
