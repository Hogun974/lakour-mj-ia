// Mesure HORS LIGNE de ce que le narrateur envoie au modèle, et du coût d'une partie type des Veillées (docs/cout.md). Aucun appel à un
// modèle : le prompt système, les outils et l'état du jeu sont construits par le code du moteur sur une doublure de Foundry, puis
// comptés en caractères ; les jetons sont ESTIMÉS (caractères / 3,5, voir JETONS_PAR_CARACTERE).
//
//   node outils/mesurer-prompt.mjs                 avant (version 0.44.1, git) / après (copie de travail)
//   node outils/mesurer-prompt.mjs --avant <réf>   une autre version de référence (étiquette, commit)
//   node outils/mesurer-prompt.mjs --json          les chiffres bruts
//
// La version de référence est extraite de git (git show) dans un dossier temporaire, effacé à la fin. La carte du village vient du
// dépôt des Veillées s'il est à côté de celui-ci (../lakour-veillees, lecture seule) ; sans lui, l'état du jeu est compté sans carte.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const ID = "lakour-mj-ia";
// Estimation : environ 3,5 caractères par jeton pour du français mêlé de JSON (schémas des outils). Le compte exact demande l'API
// (messages.count_tokens, un appel réseau) : ce n'est qu'un ordre de grandeur, le même avant et après, qui suffit à comparer.
export const JETONS_PAR_CARACTERE = 1 / 3.5;
export const jetons = texte => Math.round(String(texte ?? "").length * JETONS_PAR_CARACTERE);
// La version 0.44.1, celle de la partie mesurée en vrai le 7 novembre (3,45 $).
const REFERENCE = "1b6c912";

// ------------------------------------------------------------------ doublure de Foundry
class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
  get size() { return super.size; }
}
const collection = items => new Collection(items.map(x => [x.id, x]));

export function installerFoundry() {
  globalThis.foundry = {
    applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: { confirm: async () => true } } },
    utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s ?? ""), randomID: () => "x", getRoute: r => `/${r}`, mergeObject: (a, b) => ({ ...a, ...b }) }
  };
  globalThis.CONFIG = {};
  globalThis.Hooks = { on() {}, once() {}, callAll() {}, call() {} };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
  globalThis.ChatMessage = { implementation: { create: async d => d } };
  globalThis.DOMParser = class {
    parseFromString(html) { return { querySelectorAll: () => [], body: { textContent: String(html).replace(/<[^>]*>/g, " ") } }; }
  };
}

// La carte du village de Brumecombe (dépôt des Veillées à côté, lecture seule) : la scène telle que Foundry la tient.
export async function sceneDuVillage() {
  const fabrique = join(RACINE, "../lakour-veillees/outils/fabriquer-veillees.mjs");
  if (!existsSync(fabrique)) return null;
  try {
    const { fabriquer } = await import(pathToFileURL(fabrique).href);
    const doc = fabriquer().find(d => d.pack === "scenes" && d.doc.flags?.["lakour-veillees"]?.plan)?.doc;
    return doc ?? null;
  } catch { return null; }
}

// Une partie des Veillées : 10 compagnons IA, dans la phase de jour du tour 2.
const NOMS = ["Aubin", "Berthe", "Colin", "Delphine", "Émile", "Fanchon", "Gaspard", "Héloïse", "Isidore", "Jeanne"];
export const PARTIES = {
  // Avant la distribution : on ne sait rien de la partie à venir (toutes les consignes entrent).
  preparation: { partie: "", roles: [] },
  // Une veillée classique : deux loups, la Liseuse, le Garde, l'Herboriste, le Bailli ; aucune variante.
  classique: { partie: "p1", roles: ["loup-de-brumecombe", "loup-de-brumecombe", "liseuse-de-cendres", "garde", "herboriste",
    "villageois", "villageois", "villageois", "villageois", "villageois"], bailli: true },
  // La partie mesurée en vrai : niveau Le Pacte, Le Village, la Gazette de la lune.
  pacte: { partie: "p1", niveau: "le-pacte", roles: ["loup-de-brumecombe", "loup-de-brumecombe", "loup-pale", "liseuse-de-cendres",
    "braconniere", "innocent", "chambriere", "greffier-begue", "souffre-douleur", "villageois"], bailli: true, village: true, gazette: true }
};
const CAMP = cle => (cle.startsWith("loup") ? "meute" : "village");
const NOM_ROLE = cle => cle.split("-").map(m => m[0].toUpperCase() + m.slice(1)).join(" ");

function apiVeillees(def, acteurs) {
  const e = {
    partie: def.partie, phase: def.partie ? "jour" : "preparation", tour: def.partie ? 2 : 0, vainqueur: "", format: "", glas: 0,
    vote: { ouvert: false }, morts: def.partie ? [{ acteurId: "v9", cause: "nuit", tour: 1 }] : [],
    bailli: { actif: Boolean(def.bailli) }, presage: { actif: false }, souffle: { actif: false, utilises: [] }, banc: { actif: false },
    deuil: { actif: false, compte: 0 }, passage: { actif: false }, somnambules: {}, bonneEtoile: "",
    village: { actif: Boolean(def.village) }, gazette: { actif: Boolean(def.gazette) }, variantes: {}, aConsigner: def.niveau ? { niveau: def.niveau } : null,
    ...(def.etat ?? {})
  };
  const role = a => (a.system.role ? { name: NOM_ROLE(a.system.role), system: { cle: a.system.role, camp: CAMP(a.system.role) } } : null);
  return {
    etatInterne: e,   // pour les essais : la partie qui avance (phase, vainqueur…)
    etat: () => structuredClone(e),
    villageois: () => acteurs,
    roleDe: role,
    campDe: a => (a.system.role ? CAMP(a.system.role) : ""),
    fiche: () => ({}),
    bailli: () => (def.bailli ? { actif: true, acteurId: "v2", nom: "Colin" } : { actif: false }),
    registreTexte: () => (def.partie ? Array.from({ length: 12 }, (_, i) => `Jour ${1 + (i >> 2)} — ${NOMS[i % 10]} a déclaré : « J'ai vu une lanterne près du lavoir. »`) : []),
    masques: () => [],
    village: () => (def.village ? { actif: true, batiments: [{ acteurId: "v1", occupant: "Berthe", titre: "la Meunière", nom: "Moulin", disponible: true },
      { acteurId: "v4", occupant: "Émile", titre: "le Hobereau", nom: "Manoir", disponible: true }], chemineaux: [] } : { actif: false }),
    gazette: () => (def.gazette ? { actif: true, rythme: 1, tirees: [{ tour: 2, nom: "Le Brouillard" }], enCours: [] } : { actif: false }),
    pacte: () => ({ gracies: [] }),
    ambigus: () => ({}),
    ambigusSecrets: () => ({})
  };
}

// Installe le monde : systeme (lakour-loups, dnd5e, impmal, lakour-survie) et, aux Veillées, la partie (une clé de PARTIES, ou sa
// définition : { partie, roles, bailli, village, gazette, niveau, etat }). village : la scène active (aux Veillées, ou ailleurs pour
// comparer) ; reglages : ceux du module en plus. -> { api, reglages }
export function monde(systeme, { partie = "pacte", village = null, reglages: extra = {} } = {}) {
  const mj = { id: "mj", name: "Hogun", isGM: true, active: true, character: null };
  const reglages = { personnalites: [], mouvementsBloques: {}, historiqueLoups: [], miseEnPlace: true, ...extra };
  const acteurs = [];
  let api = null;
  if (systeme === "lakour-loups") {
    const def = typeof partie === "string" ? PARTIES[partie] : partie;
    NOMS.forEach((nom, i) => acteurs.push({
      id: `v${i}`, name: nom, type: "villageois", hasPlayerOwner: false, items: [{ type: "metier", name: "Lavandière" }],
      flags: { [ID]: { compagnon: { temperament: "prudent", parler: "phrases courtes" } } },
      system: { joueur: "", compagnon: true, vivant: i !== 9, camp: def.roles[i] ? CAMP(def.roles[i]) : "", role: def.roles[i] ?? "", maison: `Maison ${i + 1}` }
    }));
    api = apiVeillees(def, acteurs);
  }
  let scene = null;
  if (village) {
    const size = village.grid.size, pad = village.padding ?? 0;
    const sceneX = Math.round(village.width * pad / size) * size, sceneY = Math.round(village.height * pad / size) * size;
    const jetons = acteurs.map((a, i) => ({ id: `t${i}`, name: a.name, actor: a, x: sceneX + (16 + i) * size, y: sceneY + 14 * size, width: 1, height: 1,
      hidden: false, flags: {}, getFlag: () => undefined }));
    scene = {
      name: village.name, navName: village.navName, grid: village.grid, flags: village.flags,
      dimensions: { sceneX, sceneY, sceneWidth: village.width, sceneHeight: village.height },
      drawings: { contents: village.drawings.map(d => ({ ...d, toObject: () => d })) },
      tokens: { contents: jetons }
    };
  }
  globalThis.game = {
    user: mj, users: collection([mj]), actors: collection(acteurs),
    system: { id: systeme, title: { "lakour-loups": "Les Veillées", dnd5e: "Dungeons & Dragons Fifth Edition", impmal: "Imperium Maledictum",
      "lakour-survie": "Fénoir" }[systeme], version: "1" },
    world: { id: "monde", title: { "lakour-loups": "Brumecombe", dnd5e: "Warcraft", impmal: "Warhammer 40k", "lakour-survie": "Fénoir" }[systeme] },
    settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = v; } },
    combats: { active: null }, scenes: { active: scene }, paused: false, packs: new Collection(), journal: new Collection(),
    i18n: { lang: "fr", localize: k => k, format: k => k, has: () => false },
    modules: new Map([[ID, { active: true, api: {} }]]), lakourLoups: api
  };
  Object.defineProperty(game.users, "activeGM", { get: () => mj });
  return { api, reglages };
}

// ------------------------------------------------------------------ une version du moteur
export async function chargerVersion(racine) {
  const url = f => pathToFileURL(join(racine, "scripts", f)).href;
  return {
    contexte: await import(url("contexte.js")),
    outils: await import(url("outils.js")),
    personnalites: await import(url("personnalites.js")),
    compagnons: await import(url("compagnons.js")),
    moteur: await import(url("moteur.js"))
  };
}

// Les fichiers de scripts/ d'une version git, dans un dossier temporaire (vendor/ et lang/ copiés de la copie de travail).
function extraireVersion(ref) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-avant-"));
  const fichiers = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "scripts"], { cwd: RACINE, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of fichiers) {
    const cible = join(dossier, f);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, execFileSync("git", ["show", `${ref}:${f}`], { cwd: RACINE, maxBuffer: 64 * 1024 * 1024 }));
  }
  for (const d of ["vendor", "lang"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  writeFileSync(join(dossier, "package.json"), JSON.stringify({ type: "module" }));
  return dossier;
}

// Ce qu'un appel du narrateur envoie en tête (outils puis prompt système), et l'état du jeu d'un tour.
export async function mesurer(V, systeme, options = {}) {
  monde(systeme, options);
  const outils = V.outils.outilsDuSysteme(systeme);
  const definitions = JSON.stringify(outils.map(o => ({ name: o.nom, description: o.description, input_schema: o.schema })));
  const systemeTexte = await V.contexte.promptSysteme(V.personnalites.PERSONNALITES_DE_BASE[0]);
  const etat = systeme === "lakour-loups" ? V.contexte.etatDuJeu() : "";
  // L'étape « [Mise en place] » : un appel de plus par réponse aux joueurs, quand le moteur la demande.
  const moteur = new V.moteur.MoteurMJ();
  const miseEnPlace = moteur.miseEnPlaceVoulue();
  return {
    outils: outils.length, noms: outils.map(o => o.nom), carOutils: definitions.length, carSysteme: systemeTexte.length, carEtat: etat.length,
    jetonsOutils: jetons(definitions), jetonsSysteme: jetons(systemeTexte), jetonsEtat: jetons(etat),
    prefixe: jetons(definitions) + jetons(systemeTexte), miseEnPlace, systemeTexte, etat,
    consignesPlateau: miseEnPlace ? jetons(`${V.moteur.CONSIGNE_BROUILLON ?? ""}${V.moteur.CONSIGNE_PLATEAU ?? ""}`) : 0
  };
}

// ------------------------------------------------------------------ le coût d'une partie type
// Prix du narrateur et des compagnons : la table du dépôt (scripts/constantes.js). L'écriture du cache pour une heure coûte deux fois
// l'entrée (la table donne celle de cinq minutes, 1,25 fois).
// La partie type (calée sur la partie du 7 novembre : 4 tours, 10 compagnons, Le Pacte, Le Village, la Gazette ; voir docs/cout.md) :
export const PARTIE_TYPE = {
  tours: 35,            // réponses du narrateur (étapes du pilote, réponses aux répliques des compagnons, annonces), dénouement compris
  appelsParTour: 2.25,  // appels au modèle par réponse (outils, puis la narration)
  messages: 300,        // jetons des messages des joueurs et des compagnons, des annonces, par réponse
  resultats: 300,       // jetons des résultats d'outils, par appel qui en appelle
  sortie: 190,          // jetons écrits par le narrateur (réflexion comprise), par appel
  expirations: 2,       // attentes de plus de cinq minutes (une nuit longue : loups_nuit attend chaque rôle) : le cache du fil expire
  prefixesEcrits: 2,    // le préfixe écrit en entier : à l'ouverture de la séance, puis au fil neuf de la partie distribuée
  compagnons: { entree: 441948, sortie: 30000 }  // compteur de la séance, laissé tel quel (les compagnons ne changent pas)
};

// Simule les appels d'une partie : ce que le cache lit et écrit à chaque appel. v : { prefixe, etat, miseEnPlace, consignesPlateau,
// outilsChangentALaFin, prefixeUneHeure }.
export function simulerPartie(v, partie = {}) {
  const p = { ...PARTIE_TYPE, ...partie };
  let fil = 0;                       // jetons du fil déjà envoyés (hors préfixe)
  let lu = 0, ecrit = 0, ecritUneHeure = 0, sortie = 0, appels = 0;
  const totalAppels = Math.round(p.tours * p.appelsParTour);
  const expirations = new Set(Array.from({ length: p.expirations }, (_, i) => Math.round(((i + 1) * totalAppels) / (p.expirations + 1))));
  const prefixe = v.prefixe;
  const ecrirePrefixe = () => { if (v.prefixeUneHeure) ecritUneHeure += prefixe; else ecrit += prefixe; };
  for (let k = 0; k < p.prefixesEcrits; k++) ecrirePrefixe();
  let nouveau = 0;                   // jetons ajoutés au fil depuis l'appel précédent
  let n = 0;
  const appel = () => {
    n++; appels++;
    if (expirations.has(n)) {
      // Plus de cinq minutes sans appel : le fil est réécrit ; le préfixe aussi, sauf s'il est gardé une heure (et que les outils
      // n'ont pas changé).
      if (v.prefixeUneHeure && !v.outilsChangentALaFin) lu += prefixe; else ecrit += prefixe;
      ecrit += fil + nouveau;
    } else {
      lu += prefixe + fil;
      ecrit += nouveau;
    }
    fil += nouveau;
    nouveau = p.sortie;
    sortie += p.sortie;
  };
  const outilsChangent = { avant: v.outilsChangentALaFin };
  for (let t = 0; t < p.tours; t++) {
    // Le dénouement (dernière réponse) : avant 0.45, la liste des outils changeait à la fin de la partie (ecrire_chronique revenait),
    // et le fournisseur réécrivait tout le préfixe et tout le fil.
    if (t === p.tours - 1 && outilsChangent.avant) expirations.add(n + 1);
    nouveau += v.etat + p.messages;
    const appelsDuTour = Math.round((t + 1) * p.appelsParTour) - Math.round(t * p.appelsParTour);
    for (let i = 0; i < appelsDuTour; i++) {
      if (i > 0) nouveau += p.resultats;
      appel();
    }
    // La mise en place : la consigne, puis « plateau prêt » (un appel de plus).
    if (v.miseEnPlace) { nouveau += v.consignesPlateau; appel(); }
  }
  return { appels, lu, ecrit, ecritUneHeure, sortie, filFinal: fil };
}

export function coutPartie(s, prix, prixCompagnons, compagnons = PARTIE_TYPE.compagnons) {
  const narrateur = (s.lu * prix.cacheLecture + s.ecrit * prix.cacheEcriture + s.ecritUneHeure * 2 * prix.entree + s.sortie * prix.sortie) / 1e6;
  const comp = (compagnons.entree * prixCompagnons.entree + compagnons.sortie * prixCompagnons.sortie) / 1e6;
  return { narrateur, compagnons: comp, total: narrateur + comp,
    detail: { lecture: s.lu * prix.cacheLecture / 1e6, ecriture: (s.ecrit * prix.cacheEcriture + s.ecritUneHeure * 2 * prix.entree) / 1e6, sortie: s.sortie * prix.sortie / 1e6 } };
}

// ------------------------------------------------------------------ rapport
const JEUX = [
  ["Veillées, préparation (avant la distribution)", "lakour-loups", { partie: "preparation" }],
  ["Veillées, sans variante (classique)", "lakour-loups", { partie: "classique" }],
  ["Veillées, Le Pacte + Le Village + Gazette", "lakour-loups", { partie: "pacte" }],
  ["Warcraft (dnd5e)", "dnd5e", {}],
  ["40k (impmal)", "impmal", {}],
  ["Fénoir (lakour-survie)", "lakour-survie", {}]
];

async function principal() {
  const args = process.argv.slice(2);
  const ref = args.includes("--avant") ? args[args.indexOf("--avant") + 1] : REFERENCE;
  installerFoundry();
  const village = await sceneDuVillage();
  const dossier = extraireVersion(ref);
  try {
    const avant = await chargerVersion(dossier);
    const apres = await chargerVersion(RACINE);
    const lignes = [];
    for (const [libelle, systeme, options] of JEUX) {
      const a = await mesurer(avant, systeme, { ...options, village });
      const b = await mesurer(apres, systeme, { ...options, village });
      lignes.push({ libelle, systeme, avant: a, apres: b, identique: a.systemeTexte === b.systemeTexte && a.carOutils === b.carOutils });
    }
    const { MODELES_ANTHROPIC } = await import(pathToFileURL(join(RACINE, "scripts/constantes.js")).href);
    const prix = MODELES_ANTHROPIC["claude-opus-5-5"], prixC = MODELES_ANTHROPIC["claude-haiku-5-5"];
    const pacte = lignes.find(l => l.libelle.includes("Pacte"));
    const prep = lignes.find(l => l.libelle.includes("préparation"));
    // Le préfixe moyen : la séance s'ouvre en préparation, puis la partie (l'essentiel des appels).
    const sim = {
      avant: simulerPartie({ prefixe: pacte.avant.prefixe, etat: pacte.avant.jetonsEtat, miseEnPlace: false, outilsChangentALaFin: true }),
      apres: simulerPartie({ prefixe: pacte.apres.prefixe, etat: pacte.apres.jetonsEtat, miseEnPlace: false, prefixeUneHeure: true })
    };
    const humains = {
      avant: simulerPartie({ prefixe: pacte.avant.prefixe, etat: pacte.avant.jetonsEtat, miseEnPlace: true, consignesPlateau: jetons(`${avant.moteur.CONSIGNE_BROUILLON}${avant.moteur.CONSIGNE_PLATEAU}`), outilsChangentALaFin: true }),
      apres: simulerPartie({ prefixe: pacte.apres.prefixe, etat: pacte.apres.jetonsEtat, miseEnPlace: pacte.apres.miseEnPlace, consignesPlateau: pacte.apres.consignesPlateau, prefixeUneHeure: true })
    };
    const couts = Object.fromEntries(Object.entries(sim).map(([k, s]) => [k, coutPartie(s, prix, prixC)]));
    const coutsH = Object.fromEntries(Object.entries(humains).map(([k, s]) => [k, coutPartie(s, prix, prixC)]));
    if (args.includes("--json")) {
      const brut = l => Object.fromEntries(Object.entries(l).filter(([k]) => !["systemeTexte", "etat"].includes(k)));
      console.log(JSON.stringify({ reference: ref, village: Boolean(village), jeux: lignes.map(l => ({ ...l, avant: brut(l.avant), apres: brut(l.apres) })),
        partie: { sim, couts, humains, coutsH }, preparation: { avant: prep.avant.prefixe, apres: prep.apres.prefixe } }, null, 2));
      return;
    }
    const k = n => `${(n / 1000).toFixed(1).replace(".", ",")} k`;
    const d = n => `${n.toFixed(2).replace(".", ",")} $`;
    console.log(`Mesure hors ligne (jetons estimés : caractères / 3,5) — avant : ${ref}, après : copie de travail${village ? "" : " — SANS la carte du village (../lakour-veillees absent)"}\n`);
    console.log("Préfixe envoyé à chaque appel du narrateur (outils + prompt système) :");
    console.log("| Jeu | Outils avant → après | Jetons outils | Jetons système | Préfixe avant → après | Économie |");
    console.log("|---|---|---|---|---|---|");
    for (const l of lignes) {
      const eco = 1 - l.apres.prefixe / l.avant.prefixe;
      console.log(`| ${l.libelle} | ${l.avant.outils} → ${l.apres.outils} | ${k(l.avant.jetonsOutils)} → ${k(l.apres.jetonsOutils)} | ${k(l.avant.jetonsSysteme)} → ${k(l.apres.jetonsSysteme)} `
        + `| ${k(l.avant.prefixe)} → ${k(l.apres.prefixe)} | ${l.identique ? "identique" : `${Math.round(eco * 100)} %`} |`);
    }
    console.log(`\nÉtat du jeu d'un tour, aux Veillées (Le Pacte) : ${k(pacte.avant.jetonsEtat)} → ${k(pacte.apres.jetonsEtat)} jetons ; `
      + `mise en place (un appel de plus par réponse) : ${pacte.avant.miseEnPlace ? "oui" : "non"} → ${pacte.apres.miseEnPlace ? "oui" : "non"}.`);
    console.log("\nPartie type des Veillées (Opus 5.5 narrateur, Haiku 5.5 compagnons, prix de scripts/constantes.js) :");
    console.log("| | Appels | Cache lu | Cache écrit (5 min + 1 h) | Sortie | Narrateur | Compagnons | Total |");
    console.log("|---|---|---|---|---|---|---|---|");
    for (const [nom, s, c] of [["Pilote, avant", sim.avant, couts.avant], ["Pilote, après", sim.apres, couts.apres],
      ["Avec joueurs humains, avant", humains.avant, coutsH.avant], ["Avec joueurs humains, après", humains.apres, coutsH.apres]]) {
      console.log(`| ${nom} | ${s.appels} | ${k(s.lu)} | ${k(s.ecrit)} + ${k(s.ecritUneHeure)} | ${k(s.sortie)} | ${d(c.narrateur)} | ${d(c.compagnons)} | ${d(c.total)} |`);
    }
    console.log("\nSelon le nombre d'attentes de plus de cinq minutes (pilote) :");
    console.log("| Attentes | Avant | Après | Économie |");
    console.log("|---|---|---|---|");
    for (const expirations of [0, 2, 4, 6]) {
      const a = coutPartie(simulerPartie({ prefixe: pacte.avant.prefixe, etat: pacte.avant.jetonsEtat, outilsChangentALaFin: true }, { expirations }), prix, prixC).total;
      const b = coutPartie(simulerPartie({ prefixe: pacte.apres.prefixe, etat: pacte.apres.jetonsEtat, prefixeUneHeure: true }, { expirations }), prix, prixC).total;
      console.log(`| ${expirations} | ${d(a)} | ${d(b)} | ${Math.round((1 - b / a) * 100)} % |`);
    }
    console.log(`\nMesuré en vrai le 7 novembre (avant) : cache lu 5 280,6 k, écrit 411,9 k, entrée 441,9 k (compagnons), sortie 45,1 k, total 3,45 $.`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await principal();
