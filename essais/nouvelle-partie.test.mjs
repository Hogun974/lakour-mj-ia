// Aux Veillées de Brumecombe, chaque partie repart de zéro pour le narrateur : à une nouvelle partie (loups_distribuer,
// loups_rejouer, hook lakourLoups.nouvellePartie), le fil de la précédente est ARCHIVÉ sous un autre nom (jamais supprimé) et un
// fil NEUF commence ; l'ouverture dit « nouvelle partie » sans rappeler l'histoire ; la mémoire de campagne n'entre pas dans le
// prompt ; les compagnons IA oublient. Outil loups_rejouer sur une doublure de l'API (game.lakourLoups.nouvellePartie).
// Hors de Foundry, sans appel payant (fournisseurs doublure et factice).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

// ------------------------------------------------------------------ doublure de Foundry
class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const { PERSONNALITES_DE_BASE } = await import("../scripts/personnalites.js");
const reglages = {
  fournisseur: "factice", autonomie: "autonome", miseEnPlace: false, voix: "aucune", delaiReponse: 0, budgetSeance: 0, pilote: false,
  bavardageCompagnons: "normal", modeleCompagnons: "", personnaliteActive: PERSONNALITES_DE_BASE[0].id, personnalites: PERSONNALITES_DE_BASE,
  compagnonsPrive: {}, mouvementsBloques: {}, historiqueLoups: [], modeleAnthropic: "claude-opus-5-5",
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
const fichiers = new Map();   // chemin -> objet JSON écrit dans Data
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
globalThis.foundry = {
  applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c },
    apps: { FilePicker: { implementation: {
      createDirectory: async () => {},
      upload: async (_src, dossier, fichier) => { fichiers.set(`${dossier}/${fichier.name}`, JSON.parse(await fichier.text())); return { path: `${dossier}/${fichier.name}` }; }
    } } }
  },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2), getRoute: r => r }
};
globalThis.fetch = async url => {
  const chemin = String(url).split("?")[0];
  return fichiers.has(chemin) ? { ok: true, json: async () => structuredClone(fichiers.get(chemin)) } : { ok: false, json: async () => null };
};
globalThis.DOMParser = class {
  parseFromString(html) {
    const texte = String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return { querySelectorAll: () => [], body: { textContent: texte } };
  }
};
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 } };
globalThis.ChatMessage = { implementation: { create: async d => {
  const m = { ...structuredClone(d), getFlag: (s, k) => m.flags?.[s]?.[k], update: async u => Object.assign(m, u), delete: async () => {} };
  chat.push(m);
  return m;
} } };
const memoire = { getFlag: (s, k) => k === "memoire", pages: { contents: [{ name: "Résumé", sort: 1, text: { content: "<p>CANARI-MEMOIRE : la partie d'hier, le meunier était loup.</p>" } }] } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups", title: "Les Veillées", version: "1" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), packs: new Collection(), journal: [memoire], paused: false
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const M = await import("../scripts/moteur.js");
const J = await import("../scripts/compagnons-jeu.js");
const { OUTILS } = await import("../scripts/outils.js");
const { CONSIGNES_LOUPS } = await import("../scripts/pilote.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");
const { promptSysteme } = await import("../scripts/contexte.js");
const outil = nom => OUTILS.find(o => o.nom === nom);
const ARCHIVE = /^lakour-mj-ia\/fils\/monde-partie-[\w-]+\.json$/;
const PRINCIPAL = "lakour-mj-ia/fils/monde.json";
const archives = () => [...fichiers.keys()].filter(k => ARCHIVE.test(k));

// ------------------------------------------------------------------ une partie des Veillées (doublure de l'API)
function veillees({ phase = "vote", vainqueur = "" } = {}) {
  game.actors = new Collection();
  const roles = [["Aubin", "u1", "Loup de Brumecombe", "meute"], ["Berthe", "", "Liseuse de cendres", "village"], ["Colin", "", "Villageois", "village"]];
  for (const [i, [nom, j, role, camp]] of roles.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant: true, camp },
      items: [{ type: "role", name: role, system: { camp } }] };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour: 3, vainqueur, vote: { ouvert: false } };
  const api = {
    appels: [],
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    logique: { etatPublic: e => e },
    carnet: () => [],
    async nouvellePartie(args) {
      api.appels.push(args);
      if (api.echec) throw new Error(api.echec);
      Object.assign(etat, { partie: "p2", phase: "preparation", tour: 0, vainqueur: "" });
      return { partie: "p2", joueurs: [{ userId: "u1", nom: "Jordan", acteurId: "v0" }], compagnons: [{ nom: "Berthe", acteurId: "v1" }, { nom: "Colin", acteurId: "v2" }],
        composition: { cle: "generee", libelle: "générée, équilibrée", niveau: args.niveau || "classique", roles: ["loup-de-brumecombe", "liseuse", "villageois"], batiments: ["puits"] } };
    }
  };
  game.lakourLoups = api;
  return api;
}

// Un fournisseur doublure : note ce qu'il reçoit, répond ce qu'on lui a prévu (puis une phrase).
function fournisseur(reponses = []) {
  const recu = [];
  return {
    nom: "essai", recu,
    nouveauFil: () => ({ fournisseur: "essai", messages: [] }),
    ajouterUtilisateur: (fil, texte) => fil.messages.push({ role: "user", content: texte }),
    ajouterResultats: (fil, resultats) => fil.messages.push({ role: "outils", content: resultats }),
    async envoyer(fil) {
      recu.push(fil.messages.at(-1));
      const r = reponses.shift() ?? { texte: "Le village s'éveille.", appels: [] };
      fil.messages.push({ role: "assistant", content: r.texte, appels: r.appels ?? [] });
      return { texte: r.texte, appels: r.appels ?? [], usage: {}, arret: r.appels?.length ? "outils" : "fin" };
    }
  };
}

function moteur(Moteur = M.MoteurMJ, reponses) {
  const m = new Moteur();
  m.fournisseur = fournisseur(reponses);
  m.fil = { fournisseur: "essai", messages: [{ role: "user", content: "CANARI-ANCIENNE-PARTIE : Aubin est le loup." }, { role: "assistant", content: "La meute frappe." }] };
  m.systeme = "ANCIEN-PROMPT";
  m.compter = async () => {};
  return m;
}
const premier = fil => fil.messages.find(x => x.role === "user")?.content ?? "";

// ------------------------------------------------------------------ fil archivé, fil neuf, ouverture
test("nouvelle partie : le fil précédent est archivé sous un autre nom (pas supprimé), un fil NEUF commence, l'ouverture dit « nouvelle partie »", async () => {
  fichiers.clear();
  veillees();
  const m = moteur();
  const ancien = m.fil;
  await m.nouvellePartie({ ouverture: true });
  assert.equal(archives().length, 1, "une archive");
  assert.match(JSON.stringify(fichiers.get(archives()[0])), /CANARI-ANCIENNE-PARTIE/, "l'archive garde toute la partie précédente");
  assert.notEqual(m.fil, ancien);
  const ouverture = premier(m.fil);
  for (const attendu of ["[Nouvelle partie]", "Présente le village", "sans annoncer la composition", "loups_nuit",
    "[Distribution — secret, pour toi seul]", "Aubin (Jordan) : Loup de Brumecombe", "Berthe (compagnon IA) : Liseuse de cendres"]) {
    assert.ok(ouverture.includes(attendu), `ouverture sans « ${attendu} »`);
  }
  // La composition ne s'annonce plus (une partie peut être une peste noire) ; une partie ordinaire ne parle jamais de peste.
  for (const interdit of ["CANARI", "Précédemment", "reprend", "rappelle où en était", "annonce la composition sans dire qui", "PESTE"]) {
    assert.ok(!ouverture.includes(interdit), `ouverture avec « ${interdit} »`);
  }
  assert.ok(!JSON.stringify(fichiers.get(PRINCIPAL)).includes("CANARI"), "le fil principal est le neuf");
  assert.equal(fichiers.get(PRINCIPAL).messages.length, 2, "le fil neuf : l'ouverture et sa narration");
  assert.notEqual(m.systeme, "ANCIEN-PROMPT", "le prompt système est recalculé (nouveaux rôles)");
  assert.ok(!m.systeme.includes("CANARI-MEMOIRE"), "aux Veillées, la mémoire de campagne n'entre pas dans le prompt");
  assert.equal(m.auRepos(), true);
});

test("pendant un tour (le MJ distribue avec loups_distribuer) : la partie précédente finit dans son fil, puis fil neuf sans nouvelle ouverture", async () => {
  fichiers.clear();
  veillees({ phase: "preparation" });
  const m = moteur(M.MoteurMJ, [{ texte: "Les cartes sont données.", appels: [{ id: "a1", nom: "distribuer_essai", args: {} }] }, { texte: "Voici la composition : un loup, une liseuse." }]);
  const outils = [{ nom: "distribuer_essai", schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    executer: async () => { m.nouvellePartie({ ouverture: false }); return { contenu: "Partie prête, rôles distribués." }; } }];
  const ancien = m.fil;
  await m.tour("[Messages et actions des joueurs] On joue !", { outils });
  await m.chaine;
  assert.equal(m.fournisseur.recu.length, 2, "pas de tour d'ouverture en plus : le MJ vient d'annoncer la partie");
  assert.equal(archives().length, 1);
  const archive = JSON.stringify(fichiers.get(archives()[0]));
  assert.ok(archive.includes("Partie prête, rôles distribués.") && archive.includes("Voici la composition"), "le tour de distribution est dans l'archive");
  assert.notEqual(m.fil, ancien);
  assert.equal(m.fil.messages.length, 0, "fil neuf, vide");
  await m.tour("[Messages et actions des joueurs] Jordan : bonne nuit !", { outils });
  const debut = premier(m.fil);
  assert.ok(debut.startsWith("[Distribution — secret, pour toi seul]"), "la distribution secrète ouvre le fil neuf");
  assert.ok(debut.includes(M.PARTIE_DEJA_ANNONCEE) && debut.includes("Jordan : bonne nuit !"));
  await m.tour("[Messages et actions des joueurs] Jordan : encore ?", { outils });
  assert.ok(!m.fil.messages.at(-2).content.includes("[Distribution"), "une seule fois");
});

test("une demande de l'outil et le hook de la même nouvelle partie n'en font qu'une (avec ouverture)", async () => {
  fichiers.clear();
  veillees();
  const m = moteur();
  const a = m.nouvellePartie({ ouverture: false });
  const b = m.nouvellePartie({ ouverture: true });
  await Promise.all([a, b]);
  assert.equal(archives().length, 1);
  assert.equal(m.fournisseur.recu.length, 1, "une ouverture");
  assert.match(premier(m.fil), /\[Nouvelle partie\]/);
  // Hors séance, ou chez un autre que le MJ actif : rien.
  reglages.seance.active = false;
  assert.equal(await m.nouvellePartie({ ouverture: true }), null);
  reglages.seance.active = true;
});

test("les compagnons IA oublient la partie précédente (mémoire privée vidée)", async () => {
  fichiers.clear();
  veillees();
  J.reinitialiserPrive();
  await J.noterPrive("v1", "CANARI-PRIVE : tu as lu les cendres d'Aubin.");
  assert.equal(J.privesDe("v1").length, 1);
  const m = moteur();
  await m.nouvellePartie({ ouverture: false });
  assert.deepEqual(J.privesDe("v1"), []);
  assert.deepEqual(reglages.compagnonsPrive, {}, "le réglage « client » aussi");
});

test("séance aux Veillées : partie finie → fil neuf (l'ancien archivé) et ouverture « nouvelle veillée » ; partie en cours → même fil, sans rappel d'histoire", async () => {
  fichiers.clear();
  fichiers.set(PRINCIPAL, { fournisseur: "factice", modele: "factice", messages: [{ role: "user", content: "CANARI-HIER" }, { role: "assistant", content: "…" }] });
  veillees({ phase: "fin", vainqueur: "village" });
  J.reinitialiserPrive();
  await J.noterPrive("v1", "souvenir");
  const m = new M.MoteurMJ();
  await m.demarrer();
  assert.equal(archives().length, 1, "le fil d'hier est archivé");
  const ouverture = premier(m.fil);
  assert.ok(ouverture.includes(M.OUVERTURE_NOUVELLE_VEILLEE));
  assert.ok(!/CANARI|Précédemment|La séance reprend\./.test(JSON.stringify(m.fil)), "rien de la partie précédente");
  assert.deepEqual(J.privesDe("v1"), []);
  // Partie distribuée, pas encore commencée : ouverture « nouvelle partie » avec la distribution.
  fichiers.clear();
  veillees({ phase: "preparation" });
  const m2 = new M.MoteurMJ();
  await m2.demarrer();
  assert.ok(premier(m2.fil).includes(M.OUVERTURE_NOUVELLE_PARTIE) && premier(m2.fil).includes("[Distribution"));
  // Partie en cours : le fil continue, l'ouverture ne raconte que l'état du village.
  fichiers.clear();
  fichiers.set(PRINCIPAL, { fournisseur: "factice", modele: "factice", messages: [{ role: "user", content: "NUIT-2" }, { role: "assistant", content: "…" }] });
  veillees({ phase: "jour" });
  const m3 = new M.MoteurMJ();
  await m3.demarrer();
  assert.equal(archives().length, 0);
  assert.equal(premier(m3.fil), "NUIT-2", "même fil");
  const reprise = m3.fil.messages.filter(x => x.role === "user").at(-1).content;
  assert.ok(reprise.includes(M.OUVERTURE_PARTIE_EN_COURS) && !reprise.includes("Précédemment"));
});

test("mémoire de campagne : absente du prompt aux Veillées, présente ailleurs ; l'historique des compositions reste", async () => {
  veillees();
  reglages.historiqueLoups = [{ roles: ["liseuse"], batiments: [], quand: 1 }];
  const p = PERSONNALITES_DE_BASE[0];
  assert.ok(!(await promptSysteme(p)).includes("CANARI-MEMOIRE"));
  game.system.id = "autre-systeme";   // adaptateur générique (40k et Warcraft lisent la même mémoire)
  assert.ok((await promptSysteme(p)).includes("CANARI-MEMOIRE"));
  game.system.id = "lakour-loups";
  await moteur().nouvellePartie({ ouverture: false });
  assert.equal(reglages.historiqueLoups.length, 1, "nouvellePartie n'efface pas l'historique des compositions");
});

// ------------------------------------------------------------------ loups_rejouer
test("loups_rejouer (doublure de l'API) : mêmes joueurs, nouvelle composition, puis fil neuf et ouverture ; erreurs claires", async () => {
  const api = veillees({ phase: "fin", vainqueur: "meute" });
  reglages.historiqueLoups = [];
  const demandes = [];
  game.modules.get("lakour-mj-ia").api = { moteur: { nouvellePartie: o => demandes.push(o) } };
  const def = outil("loups_rejouer");
  assert.deepEqual(def.systemes, ["lakour-loups"]);
  assert.equal(def.sensible, true);
  assert.deepEqual(Object.keys(def.schema.properties).sort(), ["composition", "format", "glas", "niveau", "peste", "roles"]);
  const r = await def.executer({ niveau: "chaos", roles: [], composition: "" });
  assert.ok(!r.erreur, r.contenu);
  assert.deepEqual(api.appels, [{ memesJoueurs: true, niveau: "chaos", roles: [], composition: "" }]);
  assert.deepEqual(demandes, [{ ouverture: true }], "le moteur enchaîne : fil neuf et ouverture");
  assert.match(r.contenu, /1 joueurs et 2 compagnons IA, composition « générée, équilibrée »/);
  assert.match(r.contenu, /une seule phrase de transition/);
  // La composition de la partie en cours n'entre pas à l'historique (réglage monde, livré à tous) : le MJ la garde jusqu'à la fin
  // (ce système doublure ne la garde pas lui-même).
  assert.equal(reglages.historiqueLoups.length, 0, "la partie en cours ne se trahit pas");
  assert.ok(reglages.historiqueLoupsEnAttente?.roles?.length, "le MJ la garde, pour plus tard");
  await def.executer({ niveau: "", roles: ["Loup de Brumecombe", "Liseuse de cendres", "villageois"], composition: "" });
  assert.deepEqual(api.appels[1].roles, ["Loup de Brumecombe", "Liseuse de cendres", "villageois"]);
  assert.equal(reglages.historiqueLoups.length, 1, "la partie abandonnée rejoint l'historique (pour varier)");
  api.echec = "Rôles inconnus : licorne.";
  const e = await def.executer({ niveau: "", roles: ["licorne"], composition: "" });
  assert.equal(e.erreur, true);
  assert.equal(e.contenu, "Rôles inconnus : licorne.");
  assert.equal(demandes.length, 2, "pas de fil neuf quand la partie n'a pas été relancée");
  delete api.nouvellePartie;
  assert.match((await def.executer({ niveau: "", roles: [], composition: "" })).contenu, /ne sait pas rejouer/);
  game.modules.get("lakour-mj-ia").api = {};
});

test("le narrateur propose une autre partie en fin de partie ; le pilote automatique, lui, n'en relance jamais", () => {
  game.system.id = "lakour-loups";
  assert.match(adaptateur().consignes, /une autre partie avec les mêmes joueurs \? » ; s'ils le veulent, loups_rejouer/);
  assert.match(CONSIGNES_LOUPS.denouement("le camp « village »"), /pas de loups_rejouer/);
});

// ------------------------------------------------------------------ mutations
const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
const MUTATIONS_MOTEUR = {
  "fil non archivé": ["    await this.#archiverFil(this.fil);\n    this.fil = this.fournisseur.nouveauFil();", "    this.fil = this.fournisseur.nouveauFil();"],
  "ancien fil gardé": ["    this.fil = this.fournisseur.nouveauFil();\n    try { this.systeme", "    try { this.systeme"],
  "ouverture qui rappelle l'histoire": ["\"Nouvelle partie : la précédente est finie et archivée, ne la raconte pas et n'y fais aucune allusion. \"",
    "\"La séance reprend. « Précédemment… », rappelle la partie précédente. \""],
  "compagnons qui se souviennent": ["    effacerPrive().catch(e => console.error(`${ID} | mémoire des compagnons`, e));\n", ""],
  "séance aux Veillées sur l'ancien fil": ["    if (loups && !enPartie) {", "    if (false) {"]
};

async function charger(fichier, mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-partie-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  if (mutation) {
    assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
    texte = texte.replace(mutation[0], mutation[1]);
  }
  writeFileSync(join(dossier, fichier), texte);
  return { dossier, X: await import(pathToFileURL(join(dossier, fichier)).href) };
}

async function batterieMoteur(X) {
  const echecs = [];
  const verifier = async (nom, fn) => { try { await fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  await verifier("nouvelle partie", async () => {
    fichiers.clear();
    veillees();
    J.reinitialiserPrive();
    await J.noterPrive("v1", "souvenir");
    const m = moteur(X.MoteurMJ);
    await m.nouvellePartie({ ouverture: true });
    assert.equal(archives().length, 1);
    assert.ok(!JSON.stringify(m.fil).includes("CANARI"));
    assert.ok(!/Précédemment|reprend/.test(premier(m.fil)));
    assert.deepEqual(J.privesDe("v1"), []);
  });
  await verifier("séance", async () => {
    fichiers.clear();
    fichiers.set(PRINCIPAL, { fournisseur: "factice", modele: "factice", messages: [{ role: "user", content: "CANARI-HIER" }] });
    veillees({ phase: "fin", vainqueur: "village" });
    const m = new X.MoteurMJ();
    await m.demarrer();
    assert.ok(!JSON.stringify(m.fil).includes("CANARI"));
  });
  return echecs;
}

test("mutations : les essais attrapent un fil non archivé, un ancien fil gardé, une ouverture qui rappelle l'histoire, des compagnons qui se souviennent ; loups_rejouer sans fil neuf", async () => {
  const vrai = await charger("moteur.js", null);
  try { assert.deepEqual(await batterieMoteur(vrai.X), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS_MOTEUR)) {
    const m = await charger("moteur.js", mutation);
    try { assert.ok((await batterieMoteur(m.X)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
  // loups_rejouer qui ne demande pas de fil neuf au moteur.
  const o = await charger("outils.js", ["      game.modules?.get(ID)?.api?.moteur?.nouvellePartie({ ouverture: true });\n", ""]);
  try {
    veillees({ phase: "fin", vainqueur: "meute" });
    const demandes = [];
    game.modules.get("lakour-mj-ia").api = { moteur: { nouvellePartie: x => demandes.push(x) } };
    await o.X.OUTILS.find(x => x.nom === "loups_rejouer").executer({ niveau: "", roles: [], composition: "" });
    assert.equal(demandes.length, 0, "mutation non détectée : loups_rejouer sans fil neuf");
  } finally {
    game.modules.get("lakour-mj-ia").api = {};
    rmSync(o.dossier, { recursive: true, force: true });
  }
});
