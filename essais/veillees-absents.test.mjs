// Aux Veillées, une partie que prépare le MJ IA laisse de côté un joueur humain ABSENT (hors ligne) qui a un villageois au village
// (vu en vraie partie : « 10 joueurs IA, Hogun974 est absent », et pourtant une carte pour son personnage) : loups_composer ne le
// compte pas, loups_distribuer ne le distribue pas, loups_rejouer ne le reprend pas parmi « les mêmes joueurs » ; le narrateur
// l'apprend dans la sortie de l'outil, et peut le garder en le nommant (joueurs). Sur une doublure de l'API du système
// (game.lakourLoups). Chaque règle est cassée à son tour dans une copie du script : la batterie doit alors échouer.
// Hors de Foundry, sans appel payant.  Lancer : npm run essais
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
const fichiers = new Map([
  ["modules/lakour-veillees/assets/compositions.json", { "classique-4": { libelle: "Classique", joueurs: [4, 6], niveau: "classique", roles: ["loup-de-brumecombe", "liseuse-de-cendres", "villageois", "villageois"], batiments: ["puits"] } }],
  ["modules/lakour-veillees/assets/equilibre.json", { roles: { "loup-de-brumecombe": { camp: "meute" }, "liseuse-de-cendres": { camp: "village" }, villageois: { camp: "village" } }, batiments: {} }]
]);
const mj = { id: "mj", name: "Meneuse", isGM: true, active: true, character: null };
// Quatre joueurs connectés, et Hogun974, hors ligne.
const humains = [["u1", "Jordan"], ["u2", "Ondine"], ["u3", "Félicien"], ["u4", "Aurore"], ["u5", "Hogun974"]]
  .map(([id, name]) => ({ id, name, isGM: false, active: id !== "u5", character: null }));
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2), getRoute: r => r }
};
globalThis.fetch = async url => {
  const chemin = String(url).split("?")[0];
  return fichiers.has(chemin) ? { ok: true, json: async () => structuredClone(fichiers.get(chemin)) } : { ok: false, json: async () => null };
};
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.fromUuidSync = uuid => ({ name: String(uuid).split(".").at(-1) });
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.ChatMessage = { implementation: { create: async d => structuredClone(d) } };
const index = cles => ({ getIndex: async () => new Collection(cles.map(([cle, nom]) => [cle, { uuid: `Compendium.x.${cle}`, name: nom, system: { cle } }])) });
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ...humains.map(u => [u.id, u])]), actors: new Collection(), messages: { contents: [] },
  system: { id: "lakour-loups", title: "Les Veillées", version: "1" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), journal: [], paused: false,
  packs: new Collection([
    ["lakour-veillees.roles", index([["loup-de-brumecombe", "Loup de Brumecombe"], ["liseuse-de-cendres", "Liseuse de cendres"], ["villageois", "Villageois"]])],
    ["lakour-veillees.metiers", index([["forgeron", "Forgeron"]])], ["lakour-veillees.batiments", index([["puits", "Le Puits"]])]
  ])
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
// outils.js, d'origine ou muté (copie dont les imports pointent vers les vrais scripts).
async function charger(mutation = null) {
  if (!mutation) return { O: (await import("../scripts/outils.js")).OUTILS, dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-absents-"));
  let texte = readFileSync(fileURLToPath(new URL("../scripts/outils.js", import.meta.url)), "utf8").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], () => mutation[1]);
  writeFileSync(join(dossier, "outils.js"), texte);
  return { O: (await import(pathToFileURL(join(dossier, "outils.js")).href)).OUTILS, dossier };
}

// ------------------------------------------------------------------ une partie finie des Veillées (doublure de l'API)
// Chaque humain a son villageois (Hogun974 aussi, de la partie d'avant), et deux compagnons IA.
function veillees() {
  game.actors = new Collection();
  const places = [...humains.map(u => [u.name, u.id]), ["Berthe", ""], ["Colin", ""]];
  for (const [i, [nom, j]] of places.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant: true, camp: "village" },
      items: [{ type: "role", name: "Villageois", system: { camp: "village", nuit: {} } }], update: async () => a };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase: "fin", tour: 3, vainqueur: "meute", vote: { ouvert: false }, morts: [], historique: [], partis: [] };
  const api = {
    appels: { distribuer: [], nouvellePartie: [] },
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    carnet: () => [],
    chancePeste: () => 0,
    logique: {
      etatPublic: e => structuredClone(e),
      tirerPeste: () => false,
      composer: n => ({ roles: ["loup-de-brumecombe", "liseuse-de-cendres", ...Array(Math.max(0, n - 2)).fill("villageois")], batiments: ["puits"], somme: 0, verdict: "équilibrée", camps: {} }),
      maisonsDuVillage: n => Array.from({ length: n }, (_, i) => `Maison ${i + 1}`)
    },
    async distribuer(args) { api.appels.distribuer.push(args); return args.joueurs.map((userId, i) => ({ acteurId: `v${i}`, userId, compagnon: false })); },
    async nouvellePartie(args) {
      api.appels.nouvellePartie.push(args);
      return { partie: "p2", joueurs: [], compagnons: [], composition: { cle: "generee", libelle: "générée", roles: ["villageois"], batiments: [] } };
    }
  };
  game.lakourLoups = api;
  return api;
}
const DISTRIBUER = { mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [], composition: "", peste: "non" };
const ABSENT = /Laissé de côté, car absent \(hors ligne\) : Hogun974 — son villageois quitte le village, sans carte/;

const VERIFICATIONS = {
  async "loups_composer : les connectés seulement ; l'absent n'est pas compté, et le narrateur le sait"(O) {
    veillees();
    const r = await O.find(o => o.nom === "loups_composer").executer({ nombre_joueurs: 0, niveau: "classique", peste: "non" });
    assert.ok(!r.erreur, r.contenu);
    assert.match(r.contenu, /Composition préparée pour 4 joueurs/);
    assert.match(r.contenu, ABSENT);
    assert.match(r.contenu, /pas comptés dans les 4 joueurs/);
  },

  async "loups_distribuer : l'absent ne reçoit pas de carte, la sortie le dit ; nommé, il est gardé"(O) {
    const api = veillees();
    const d = O.find(o => o.nom === "loups_distribuer");
    const r = await d.executer({ joueurs: [], ...DISTRIBUER });
    assert.ok(!r.erreur, r.contenu);
    assert.deepEqual(api.appels.distribuer.at(-1).joueurs, ["u1", "u2", "u3", "u4"], "pas de carte pour l'absent");
    assert.match(r.contenu, ABSENT);
    // Nommé par le narrateur : gardé, et dit hors ligne.
    const g = await d.executer({ joueurs: ["Jordan", "Ondine", "Félicien", "Hogun974"], ...DISTRIBUER });
    assert.deepEqual(api.appels.distribuer.at(-1).joueurs, ["u1", "u2", "u3", "u5"]);
    assert.match(g.contenu, /Hors ligne mais inclus à ta demande : Hogun974/);
    assert.doesNotMatch(g.contenu, /Laissé/, "Aurore, connectée, n'est pas une absente");
    // Tout le monde connecté : rien à dire.
    humains[4].active = true;
    try { assert.doesNotMatch((await d.executer({ joueurs: [], ...DISTRIBUER })).contenu, /absent|hors ligne/i); }
    finally { humains[4].active = false; }
  },

  async "loups_rejouer : les mêmes joueurs sans l'absent (liste donnée au système) ; nommé, il rejoue ; tous là, « mêmes joueurs » tel quel"(O) {
    const api = veillees();
    const def = O.find(o => o.nom === "loups_rejouer");
    assert.ok(def.schema.properties.joueurs, "loups_rejouer accepte des joueurs à garder");
    const r = await def.executer({ niveau: "", roles: [], composition: "" });
    assert.ok(!r.erreur, r.contenu);
    assert.deepEqual(api.appels.nouvellePartie.at(-1).joueurs, ["u1", "u2", "u3", "u4"], "l'absent ne rejoue pas");
    assert.match(r.contenu, ABSENT);
    const g = await def.executer({ joueurs: ["Hogun974"], niveau: "", roles: [], composition: "" });
    assert.equal(api.appels.nouvellePartie.at(-1).joueurs, undefined, "gardé : les mêmes joueurs, tous");
    assert.match(g.contenu, /Hors ligne mais inclus à ta demande : Hogun974/);
    assert.match((await def.executer({ joueurs: ["Personne"], niveau: "", roles: [], composition: "" })).contenu, /Joueur introuvable/);
    humains[4].active = true;
    try {
      const t = await def.executer({ niveau: "chaos", roles: [], composition: "" });
      assert.deepEqual(api.appels.nouvellePartie.at(-1), { memesJoueurs: true, niveau: "chaos", roles: [], composition: "" });
      assert.doesNotMatch(t.contenu, /absent|hors ligne/i);
    } finally { humains[4].active = false; }
  }
};

async function batterie(O) {
  const echecs = [];
  for (const [nom, v] of Object.entries(VERIFICATIONS)) {
    try { await v(O); } catch (e) { echecs.push(`${nom} : ${e.message}`); }
  }
  return echecs;
}

test("joueurs absents (MJ IA) : le script d'origine passe toute la batterie", async () => {
  assert.deepEqual(await batterie((await charger()).O), []);
});

const MUTATIONS = [
  ["const joueursDeLaPartie = noms => (noms.length ? noms.map(n => trouverJoueur(n)) : game.users.filter(u => u.active && !u.isGM));",
    "const joueursDeLaPartie = noms => (noms.length ? noms.map(n => trouverJoueur(n)) : game.users.filter(u => !u.isGM));", "les connectés seulement"],
  ["const absentsDuVillage = (api, gardes = []) => humainsDuVillage(api).filter(u => !u.active && !gardes.some(g => g?.id === u.id));",
    "const absentsDuVillage = (api, gardes = []) => humainsDuVillage(api).filter(u => !gardes.some(g => g?.id === u.id));", "un absent est hors ligne"],
  ["const absentsDuVillage = (api, gardes = []) => humainsDuVillage(api).filter(u => !u.active && !gardes.some(g => g?.id === u.id));",
    "const absentsDuVillage = (api, gardes = []) => humainsDuVillage(api).filter(u => !u.active);", "un absent nommé est gardé"],
  ["      const absents = absentsDuVillage(api, utilisateurs);", "      const absents = [];", "loups_distribuer : les absents dits"],
  ["      const absents = nombre_joueurs > 0 ? [] : absentsDuVillage(api);", "      const absents = [];", "loups_composer : les absents dits"],
  ["...(lesJoueurs ? { joueurs: lesJoueurs } : {})", "...{}", "loups_rejouer : sans l'absent"],
  ["      const nommesHorsLigne = joueurs.length ? utilisateurs.filter(u => !u.active) : [];", "      const nommesHorsLigne = [];", "loups_distribuer : le nommé hors ligne dit"]
];

test("joueurs absents (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [avant, apres, regle] of MUTATIONS) {
    const { O, dossier } = await charger([avant, apres]);
    try { if (!(await batterie(O)).length) passees.push(regle); }
    finally { rmSync(dossier, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
