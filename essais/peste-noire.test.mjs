// La peste noire des Veillées côté MJ IA, sur une doublure de l'API du système (game.lakourLoups) : la composition ne s'annonce
// plus (ouverture, distribution) ; la variante est dite au seul narrateur (distribution secrète, état du jeu) et jamais dans une
// partie ordinaire ; loups_composer / loups_distribuer / loups_rejouer la tirent ou la reçoivent (« oui », « non », hasard) ;
// loups_nuit mène l'étape « la peste » (victime du narrateur, ou hasard) ; loups_peste fait crier ; le pilote automatique demande
// la victime au narrateur la première nuit seulement ; un compagnon qui écrit « C'est la peste noire ! » crie pour de bon.
// Chaque règle est cassée à son tour dans une copie du script : la batterie doit alors échouer.
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
  fournisseur: "factice", autonomie: "autonome", miseEnPlace: false, voix: "aucune", delaiReponse: 0, budgetSeance: 0, pilote: true, piloteDelai: 0,
  piloteEtapes: 60, bavardageCompagnons: "normal", modeleCompagnons: "", personnaliteActive: PERSONNALITES_DE_BASE[0].id, personnalites: PERSONNALITES_DE_BASE,
  compagnonsPrive: {}, mouvementsBloques: {}, historiqueLoups: [], modeleAnthropic: "claude-opus-5-5",
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
const fichiers = new Map([
  ["modules/lakour-veillees/assets/compositions.json", { "classique-4": { libelle: "Classique", joueurs: [4, 6], niveau: "classique", roles: ["loup-de-brumecombe", "liseuse-de-cendres", "villageois", "villageois"], batiments: ["puits"] } }],
  ["modules/lakour-veillees/assets/equilibre.json", { roles: { "loup-de-brumecombe": { camp: "meute" }, "liseuse-de-cendres": { camp: "village" }, villageois: { camp: "village" } }, batiments: {} }]
]);
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
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
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...structuredClone(d) }; chat.push(m); return m; } } };
const index = cles => ({ getIndex: async () => new Collection(cles.map(([cle, nom]) => [cle, { uuid: `Compendium.x.${cle}`, name: nom, system: { cle } }])) });
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
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
// Un script du MJ IA, d'origine ou muté (copie dont les imports pointent vers les vrais scripts).
async function charger(fichier, mutation = null) {
  if (!mutation) return { X: await import(`../scripts/${fichier}`), dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-peste-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], mutation[1]);
  writeFileSync(join(dossier, fichier), texte);
  return { X: await import(pathToFileURL(join(dossier, fichier)).href), dossier };
}

// ------------------------------------------------------------------ une partie des Veillées (doublure de l'API)
// peste : null (partie ordinaire) ou { active, porteur }.
function veillees({ phase = "jour", peste = null, vainqueur = "", chance = 0 } = {}) {
  game.actors = new Collection();
  const roles = [["Aubin", "u1", "Villageois"], ["Berthe", "", "Liseuse de cendres"], ["Colin", "", "Villageois"], ["Désiré", "", "Villageois"]];
  for (const [i, [nom, j, role]] of roles.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant: true, camp: "village" },
      items: [{ type: "role", name: role, system: { camp: "village", nuit: {} } }], update: async () => a };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour: 1, vainqueur, vote: { ouvert: false }, morts: [], historique: [], peste };
  const api = {
    appels: { reveiller: [], crier: [], composer: [], distribuer: [], nouvellePartie: [] },
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    carnet: () => [],
    chancePeste: () => chance,
    logique: {
      etatPublic: e => { const p = structuredClone(e); delete p.peste; return p; },
      CHANCE_PESTE: 1 / 30,
      tirerPeste: ({ chance: c }) => c >= 1,
      composer: (n, _eq, options) => {
        api.appels.composer.push(options);
        const roles = options.peste ? ["liseuse-de-cendres", ...Array(n - 1).fill("villageois")] : ["loup-de-brumecombe", "liseuse-de-cendres", ...Array(n - 2).fill("villageois")];
        return { roles, batiments: ["puits"], somme: 0, verdict: options.peste ? "peste noire" : "équilibrée", camps: {} };
      },
      maisonsDuVillage: n => Array.from({ length: n }, (_, i) => `Maison ${i + 1}`)
    },
    async changerPhase(p) { etat.phase = p; },
    ordreDeNuit: () => (etat.peste ? [{ roleCle: "peste", acteurIds: etat.peste.porteur ? [etat.peste.porteur] : [] }] : []),
    candidatsDeNuit: () => api.villageois().map(a => a.id),
    async reveiller(roleCle, options) { api.appels.reveiller.push({ roleCle, ...options }); return { roleCle, cibles: [options.cible || "v3"], hasard: !options.cible }; },
    async noterAction() {},
    async resoudreNuit() { return { morts: [], messages: [], annonces: [] }; },
    async verifierVictoire() { return etat.vainqueur; },
    async crierPeste(id) {
      api.appels.crier.push(id);
      if (!etat.peste) return { juste: false, annonces: [], vainqueur: "" };
      etat.vainqueur = "village"; etat.phase = "fin";
      return { juste: true, annonces: [], vainqueur: "village" };
    },
    async distribuer(args) { api.appels.distribuer.push(args); return []; },
    async nouvellePartie(args) {
      api.appels.nouvellePartie.push(args);
      return { partie: "p2", joueurs: [], compagnons: [], composition: { cle: "generee", libelle: "générée", roles: ["villageois"], batiments: [] } };
    }
  };
  game.lakourLoups = api;
  return api;
}

// ------------------------------------------------------------------ la batterie
// M : { outils, moteur, contexte, pilote, jeu, compagnons } (modules, d'origine ou un muté).
const VERIFICATIONS = {
  async "la composition ne s'annonce plus : ouverture, distribution, consignes"(M) {
    assert.match(M.moteur.OUVERTURE_NOUVELLE_PARTIE, /sans annoncer la composition/);
    assert.doesNotMatch(M.moteur.OUVERTURE_NOUVELLE_PARTIE, /annonce la composition sans dire qui/);
    assert.match(M.moteur.OUVERTURE_NOUVELLE_VEILLEE, /N'annonce jamais la composition/);
    const api = veillees();
    const r = await M.outils.OUTILS.find(o => o.nom === "loups_distribuer").executer({ joueurs: [], mode: "composition", niveau: "classique", roles: [], batiments: [],
      inclure: [], exclure: [], composition: "classique-4", compagnons: 3, peste: "" });
    assert.ok(!r.erreur, r.contenu);
    assert.match(r.contenu, /Composition, pour toi seul \(ne l'annonce JAMAIS/);
    assert.doesNotMatch(r.contenu, /À annoncer|PESTE/);
    assert.equal(api.appels.distribuer[0].peste, undefined, "partie ordinaire : pas de peste");
  },

  async "le narrateur seul sait la peste : distribution secrète et état du jeu, jamais dans une partie ordinaire"(M) {
    veillees();
    assert.doesNotMatch(M.moteur.distributionSecrete(), /PESTE/);
    assert.ok(!M.contexte.etatPartieLoups(game.lakourLoups).some(l => /PESTE/.test(l)));
    veillees({ peste: { active: true, porteur: "" } });
    assert.match(M.moteur.distributionSecrete(), /PESTE NOIRE \(secret absolu/);
    const sans = M.contexte.etatPartieLoups(game.lakourLoups).join("\n");
    assert.match(sans, /PESTE NOIRE/);
    assert.match(sans, /c'est TOI qui choisis la victime/);
    veillees({ peste: { active: true, porteur: "v2" } });
    assert.match(M.contexte.etatPartieLoups(game.lakourLoups).join("\n"), /Porteur : Colin/);
    veillees({ peste: { active: true, porteur: "v2" }, vainqueur: "peste", phase: "fin" });
    const fin = M.contexte.etatPartieLoups(game.lakourLoups).join("\n");
    assert.match(fin, /victoire : la peste noire/);
    assert.doesNotMatch(fin, /secret absolu/);
  },

  async "loups_nuit : l'étape de la peste, victime du narrateur (nom), ou hasard"(M) {
    const nuit = M.outils.OUTILS.find(o => o.nom === "loups_nuit");
    assert.ok("peste_victime" in nuit.schema.properties);
    let api = veillees({ phase: "jour", peste: { active: true, porteur: "" } });
    let r = await nuit.executer({ delai_secondes: 30, peste_victime: "Colin" });
    assert.deepEqual(api.appels.reveiller.map(x => [x.roleCle, x.cible]), [["peste", "v2"]]);
    assert.match(r.contenu, /la peste \(ton choix\) → Colin/);
    api = veillees({ phase: "jour", peste: { active: true, porteur: "" } });
    r = await nuit.executer({ delai_secondes: 30, peste_victime: "hasard" });
    assert.equal(api.appels.reveiller[0].cible, "");
    assert.match(r.contenu, /\(au hasard\)/);
    api = veillees({ phase: "jour", peste: { active: true, porteur: "v1" } });
    r = await nuit.executer({ delai_secondes: 30, peste_victime: "" });
    assert.match(r.contenu, /la peste \(porteur Berthe\)/);
  },

  async "loups_peste : le système tranche ; juste, la victoire ; faux, le crieur pendu"(M) {
    const outil = M.outils.OUTILS.find(o => o.nom === "loups_peste");
    assert.deepEqual(outil.systemes, ["lakour-loups"]);
    let api = veillees({ peste: { active: true, porteur: "v1" } });
    let r = await outil.executer({ villageois: "Colin" });
    assert.deepEqual(api.appels.crier, ["v2"]);
    assert.match(r.contenu, /C'était bien la peste noire.*VICTOIRE : village/s);
    api = veillees();
    r = await outil.executer({ villageois: "Colin" });
    assert.match(r.contenu, /Ce n'était pas la peste : Colin est pendu/);
    assert.equal((await outil.executer({ villageois: "Personne" })).erreur, true);
  },

  async "composer, distribuer, rejouer : « oui » / « non » / le hasard du système"(M) {
    const O = n => M.outils.OUTILS.find(o => o.nom === n);
    for (const n of ["loups_composer", "loups_distribuer", "loups_rejouer"]) assert.deepEqual(O(n).schema.properties.peste.enum, ["", "oui", "non"], n);
    // loups_composer « oui » : une peste, dite au narrateur seul ; distribuée telle quelle, elle reste une peste.
    let api = veillees();
    const c = await O("loups_composer").executer({ nombre_joueurs: 4, niveau: "classique", inclure: [], exclure: [], peste: "oui" });
    assert.equal(api.appels.composer[0].peste, true);
    assert.match(c.contenu, /pour toi seul, ne l'annonce pas/);
    assert.match(c.contenu, /PESTE NOIRE/);
    const roles = JSON.parse(/roles = (\[[^\]]*\])/.exec(c.contenu)[1]);
    await O("loups_distribuer").executer({ joueurs: [], mode: "roles", niveau: "classique", roles, batiments: ["puits"], inclure: [], exclure: [], composition: "", compagnons: 3, peste: "" });
    assert.equal(api.appels.distribuer[0].peste, true, "la peste proposée reste une peste");
    // Le hasard du système (chance 1 ici) en mode auto ; « non » l'interdit.
    api = veillees({ chance: 1 });
    let d = await O("loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [], composition: "", compagnons: 3, peste: "" });
    assert.equal(api.appels.distribuer[0].peste, true);
    assert.match(d.contenu, /PESTE NOIRE/);
    api = veillees({ chance: 1 });
    await O("loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [], composition: "", compagnons: 3, peste: "non" });
    assert.equal(api.appels.distribuer[0].peste, undefined);
    api = veillees({ chance: 0 });
    await O("loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [], composition: "", compagnons: 3, peste: "" });
    assert.equal(api.appels.distribuer[0].peste, undefined, "chance nulle : jamais");
    // loups_rejouer : « oui » passé au système ; sans choix, le système tire lui-même.
    api = veillees({ phase: "fin" });
    await O("loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "oui" });
    await O("loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "" });
    assert.deepEqual(api.appels.nouvellePartie.map(a => a.peste), [true, undefined]);
    assert.ok(!("peste" in api.appels.nouvellePartie[1]));
    game.modules.get("lakour-mj-ia").api = {};
  },

  async "le pilote : la victime de la peste demandée au narrateur la première nuit seulement, jamais dans une partie ordinaire"(M) {
    assert.match(M.pilote.CONSIGNE_PESTE_NUIT, /peste_victime/);
    const consignes = async peste => {
      veillees({ phase: "nuit", peste });
      for (const a of game.actors.contents) { a.system.joueur = ""; a.system.compagnon = true; }
      const vues = [];
      const moteur = { actif: true, auRepos: () => true, budgetDepasse: () => false, compagnons: { maxRepliques: () => 2 } };
      const p = new M.pilote.PiloteAutomatique({ moteur, horloge: { maintenant: () => 0, attendre: async () => {} }, aviser: () => {}, etatDuJeu: () => "" });
      moteur.tour = async texte => { vues.push(texte); p.arreter("manuel"); };
      p.demarrer();
      await p.boucle;
      return vues.join("\n");
    };
    assert.doesNotMatch(await consignes(null), /peste/i, "partie ordinaire : rien");
    assert.match(await consignes({ active: true, porteur: "" }), /peste_victime/);
    assert.doesNotMatch(await consignes({ active: true, porteur: "v1" }), /peste/i, "avec porteur : rien à choisir");
    assert.match(M.pilote.libelleVainqueurPilote("peste"), /la peste noire/);
  },

  async "un compagnon qui crie « C'est la peste noire ! » crie pour de bon (et le tour de parole s'arrête)"(M) {
    assert.ok(M.compagnons.criePeste("*Il pâlit.* — C'est la peste noire !"));
    assert.ok(!M.compagnons.criePeste("Je crois que c'est un loup."));
    assert.match(M.compagnons.CONSIGNE_PARLER_LOUPS, /C'est la peste noire !/);
    assert.match(M.compagnons.CONSIGNE_PARLER_LOUPS, /CONVAINCU/);
    const api = veillees({ peste: { active: true, porteur: "v3" } });
    const C = new M.jeu.Compagnons({ graine: "peste" });
    C.cerveaux.parler = async () => ({ texte: "*Il pâlit.* — C'est la peste noire !", source: "ia" });
    const dits = await C.reagir({ max: 3 });
    assert.equal(dits.length, 1, "le tour de parole s'arrête au cri");
    assert.equal(api.appels.crier.length, 1);
    // Un compagnon ne connaît pas la variante : sa vue part de l'état PUBLIC.
    const vue = C.vue(game.actors.get("v1"));
    assert.doesNotMatch(JSON.stringify(vue), /porteur|"peste"/);
  }
};

async function batterie(M) {
  const echecs = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { echecs.push(`${nom} : ${e.message}`); }
  }
  return echecs;
}

async function modules(mute = {}) {
  const dossiers = [];
  const M = {};
  for (const [cle, fichier] of [["outils", "outils.js"], ["moteur", "moteur.js"], ["contexte", "contexte.js"], ["pilote", "pilote.js"], ["jeu", "compagnons-jeu.js"], ["compagnons", "compagnons.js"]]) {
    const r = await charger(fichier, mute[fichier] ?? null);
    M[cle] = r.X;
    if (r.dossier) dossiers.push(r.dossier);
  }
  return { M, dossiers };
}

test("peste noire (MJ IA) : les scripts d'origine passent toute la batterie", async () => {
  const { M } = await modules();
  assert.deepEqual(await batterie(M), []);
});

const MUTATIONS = [
  ["outils.js", "        if (roleCle === \"peste\") {", "        if (false) {", "loups_nuit : l'étape de la peste"],
  ["outils.js", "const cible = voulue && !/^(au )?hasard$/i.test(voulue) ? idVillageois(voulue) ?? \"\" : \"\";", "const cible = \"\";", "loups_nuit : la victime du narrateur"],
  ["outils.js", "      return { contenu: r.juste\n", "      return { contenu: false\n", "loups_peste : le verdict"],
  ["outils.js", "        + (enPeste ? `${NOTE_PESTE}\\n` : \"\")\n        + `Bâtiments", "        + `Bâtiments", "loups_composer : la peste dite au narrateur"],
  ["outils.js", "        enPeste ??= Boolean(propositionPeste && memesRoles(rolesPour({ roles: cles }, total), propositionPeste));", "        enPeste ??= false;", "la peste proposée reste une peste"],
  ["outils.js", "        enPeste ??= tirerPesteIA(api);", "        enPeste ??= false;", "le hasard en mode auto"],
  ["outils.js", "...(voulue !== undefined ? { peste: voulue } : {})", "", "loups_rejouer : la peste voulue"],
  ["outils.js", "Composition, pour toi seul (ne l'annonce JAMAIS, ni le nombre de loups) : ", "À annoncer à tous (sans dire qui) : ", "composition annoncée"],
  ["moteur.js", "  const peste = api?.etat?.()?.peste?.active\n", "  const peste = false\n", "distribution secrète sans la peste"],
  ["moteur.js", "Présente le village et les bâtiments en jeu, sans annoncer la composition", "Présente le village, annonce la composition sans dire qui", "ouverture qui annonce la composition"],
  ["contexte.js", "  if (e.peste?.active && !e.vainqueur) {", "  if (false) {", "état du jeu sans la peste"],
  ["contexte.js", "  if (e.peste?.active && !e.vainqueur) {", "  if (e.peste?.active) {", "la peste reste « secrète » après la fin"],
  ["pilote.js", "const premiere = e.peste?.active && !e.peste.porteur;", "const premiere = e.peste?.active;", "pilote : victime demandée malgré le porteur"],
  ["pilote.js", "const premiere = e.peste?.active && !e.peste.porteur;", "const premiere = false;", "pilote : victime jamais demandée"],
  ["compagnons-jeu.js", "      if (c.vue.jeu === \"loups\" && criePeste(r.texte) && await crierALaPeste(c.id)) break;\n", "", "le cri d'un compagnon"],
  ["compagnons.js", "export const CRI_PESTE = /c['’]est la peste noire/i;", "export const CRI_PESTE = /jamais-crie/;", "le cri reconnu"],
  ["compagnons.js", "+ \"exactement « C'est la peste noire ! ». Si", "+ \"une phrase. Si", "les compagnons savent crier"]
];

test("peste noire (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    const { M, dossiers } = await modules({ [fichier]: [avant, apres] });
    try { if (!(await batterie(M)).length) passees.push(`${regle} (${fichier})`); }
    finally { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
