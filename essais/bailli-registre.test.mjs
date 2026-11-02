// Le Bailli, le Registre du greffier et les Masques de veillée (système lakour-loups 0.6.0) côté MJ IA, sur une doublure de l'API
// du système (game.lakourLoups) : état du jeu du narrateur (Bailli, Registre, Masques en secret absolu), vue des compagnons,
// loups_vote (élection sans exécution, départage), loups_bailli et loups_registre, résolveur des compagnons (vote du Bailli,
// départage, succession posthume, notes privées), « Au Registre : … » d'un compagnon, pilote automatique (élection avant le vote
// d'exécution), consignes. Tout reste défensif : un système plus ancien (sans ces fonctions) marche comme avant.
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
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2), getRoute: r => r }
};
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...structuredClone(d) }; chat.push(m); return m; } } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups", title: "Les Veillées", version: "0.6.0" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), journal: [], paused: false, packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
async function charger(fichier, mutation = null) {
  if (!mutation) return { X: await import(`../scripts/${fichier}`), dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-bailli-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], mutation[1]);
  writeFileSync(join(dossier, fichier), texte);
  return { X: await import(pathToFileURL(join(dossier, fichier)).href), dossier };
}

// ------------------------------------------------------------------ une partie des Veillées 0.6.0 (doublure de l'API)
// bailli : ce que rend api.bailli() ; ancien : un système d'avant 0.6.0 (ni bailli, ni registre, ni masques) ;
// masques : [{ cle, nom }] ou "erreur" (pas le MJ actif).
function veillees({ phase = "jour", bailli = null, registre = [], masques = [], ancien = false, vote = { ouvert: false }, resultat = null } = {}) {
  game.actors = new Collection();
  reglages.compagnonsPrive = {};
  const roles = [["Aubin", "u1", "village"], ["Berthe", "", "village"], ["Colin", "", "meute"], ["Désiré", "", "village"], ["Ernest", "", "meute"]];
  for (const [i, [nom, j, camp]] of roles.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant: true, camp, maison: "" },
      items: [{ type: "role", name: camp === "meute" ? "Loup de Brumecombe" : "Villageois", system: { camp, nuit: {} } }], update: async () => a };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour: 2, vainqueur: "", vote, morts: [], historique: [] };
  const api = {
    appels: { ouvrirVote: [], changerPhase: [], declarer: [], nommer: [], registreMax: [] },
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    // Le carnet d'un loup : sa carte nomme sa meute (Colin et Ernest).
    carnet: id => (["v2", "v4"].includes(id) ? [{ titre: "Ton rôle", html: "<p>Loup de Brumecombe. Ta meute : Colin, Ernest.</p>" }] : []),
    logique: { etatPublic: e => structuredClone(e) },
    async changerPhase(p) { api.appels.changerPhase.push(p); etat.phase = p; },
    async ouvrirVote(args) {
      api.appels.ouvrirVote.push(args);
      if (args.objet === "bailli") api.electionFaite = true;
      etat.vote = { ouvert: true, objet: args.objet ?? "execution", candidats: args.candidats ?? ["v0", "v1", "v2", "v3", "v4"], exprimes: [], votes: {} };
    },
    async cloreVote() { etat.vote = { ouvert: false, resultat }; return structuredClone(resultat); },
    async verifierVictoire() { return ""; }
  };
  if (!ancien) {
    Object.assign(api, {
      // Sans Bailli donné : l'élection est due tant qu'elle n'a pas été ouverte ce jour-là.
      bailli: () => structuredClone(bailli ?? { actif: true, acteurId: "", nom: "", depuis: 0, succession: null,
        election: api.electionFaite ? { ok: false, raison: "deja" } : { ok: true, raison: "" } }),
      registreTexte: ({ max = 30 } = {}) => { api.appels.registreMax.push(max); return registre.slice(-max); },
      async declarer(id, texte) {
        if (api.refus) throw new Error(api.refus);
        api.appels.declarer.push([id, texte]);
        return { type: "declaration", acteurId: id, texte };
      },
      async nommerBailli(id) { api.appels.nommer.push(id); return id; },
      masques: () => { if (masques === "erreur") throw new Error("Réservé au MJ actif."); return masques; }
    });
  }
  game.lakourLoups = api;
  return api;
}
const BERTHE = { actif: true, acteurId: "v1", nom: "Berthe", depuis: 1, succession: null, election: { ok: false, raison: "bailli" } };
const registreDe = n => Array.from({ length: n }, (_, i) => `Ligne ${i + 1} du Registre`);

// ------------------------------------------------------------------ la batterie
// M : { outils, contexte, pilote, jeu, compagnons, adaptateurs } (modules, d'origine ou un muté).
const O = (M, n) => M.outils.OUTILS.find(o => o.nom === n);
const VERIFICATIONS = {
  async "état du jeu : Bailli élu, succession, élection due ; Registre (20 lignes) ; Masques en secret absolu"(M) {
    let api = veillees({ bailli: BERTHE, registre: registreDe(30), masques: [{ cle: "herboriste", nom: "Herboriste" }, { cle: "garde", nom: "Garde" }] });
    let t = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(t, /Bailli \(public\) : Berthe/);
    assert.deepEqual(api.appels.registreMax, [20]);
    assert.match(t, /Registre du greffier \(public ; pour toi, ne le récite pas/);
    assert.match(t, /ne la confirme ni ne l'infirme jamais/);
    assert.match(t, /· Ligne 30 du Registre/);
    assert.doesNotMatch(t, /Ligne 10 du Registre\b/);
    assert.match(t, /Masques de veillée de la meute — SECRET ABSOLU : Herboriste, Garde/);
    assert.match(t, /Ne les nomme jamais, ne dis jamais qu'un rôle n'est pas en jeu\./);
    api = veillees({ bailli: { actif: true, acteurId: "", nom: "", succession: { de: "v1", nom: "Berthe", tour: 2 }, election: { ok: false } } });
    assert.match(M.contexte.etatPartieLoups(api).join("\n"), /Bailli : Berthe est mort ; il remet le sceau/);
    api = veillees();
    t = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(t, /Pas de Bailli : élis-le avant le vote d'exécution \(loups_vote ouvrir, objet « bailli »\)/);
    assert.doesNotMatch(t, /Masques|Registre/, "rien à dire : ni Masques ni Registre");
  },

  async "état du jeu : défensif (système d'avant 0.6.0, Masques réservés au MJ actif)"(M) {
    let api = veillees({ ancien: true });
    const t = M.contexte.etatPartieLoups(api).join("\n");
    assert.doesNotMatch(t, /Bailli|Registre|Masques/);
    assert.match(t, /Vivants \(5\)/);
    api = veillees({ masques: "erreur", bailli: BERTHE });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Masques/);
  },

  async "vue des compagnons : le Bailli (« toi » s'il l'est), 15 lignes du Registre, masque accordé pour un loup"(M) {
    const api = veillees({ bailli: BERTHE, registre: registreDe(30) });
    const C = new M.jeu.Compagnons({ graine: "bailli" });
    const berthe = C.vue(game.actors.get("v1"));
    assert.match(berthe.scene, /Tu es le Bailli \(public\)/);
    assert.deepEqual(api.appels.registreMax, [15]);
    assert.match(berthe.scene, /· Ligne 30 du Registre/);
    assert.doesNotMatch(berthe.scene, /Ligne 15 du Registre\b/);
    const colin = C.vue(game.actors.get("v2"));
    assert.match(colin.scene, /Bailli \(public\) : Berthe/);
    assert.doesNotMatch(colin.scene, /Tu es le Bailli/);
    assert.match(colin.fiche, /Accorde ton masque avec la meute/);
    assert.doesNotMatch(berthe.fiche, /masque/i, "un villageois n'a pas de masque");
    veillees({ ancien: true });
    assert.doesNotMatch(C.vue(game.actors.get("v1")).scene, /Bailli|Registre/);
  },

  async "loups_vote : élection du Bailli sans changer de phase ni exécuter ; élection d'abord ; départage annoncé"(M) {
    const outil = O(M, "loups_vote");
    assert.ok(outil.schema.properties.objet.enum.includes("bailli"));
    const base = { action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "execution" };
    let api = veillees();
    let r = await outil.executer(base);
    assert.ok(r.erreur, "pas de Bailli : l'élection d'abord");
    assert.match(r.contenu, /élis-le d'abord/);
    assert.deepEqual(api.appels.ouvrirVote, []);
    r = await outil.executer({ ...base, objet: "bailli" });
    assert.ok(!r.erreur, r.contenu);
    assert.equal(api.appels.ouvrirVote[0].objet, "bailli");
    assert.deepEqual(api.appels.changerPhase, [], "l'élection ne change pas la phase");
    api = veillees({ resultat: { objet: "bailli", decompte: { v1: 2, v3: 2 }, elus: [], egalite: true, bailli: "v3", sort: true } });
    r = await outil.executer({ ...base, action: "clore" });
    assert.match(r.contenu, /Désiré est le nouveau Bailli \(désigné par le sort/);
    assert.doesNotMatch(r.contenu, /loups_eliminer/, "une élection n'exécute personne");
    api = veillees({ resultat: { objet: "bailli", decompte: {}, elus: [], egalite: false, bailli: "", sort: false } });
    assert.match((await outil.executer({ ...base, action: "clore" })).contenu, /Personne n'est élu/);
    api = veillees({ bailli: BERTHE, resultat: { objet: "execution", decompte: { v2: 2, v3: 2 }, elus: ["v2"], elu: "v2", egalite: true, poids: { v1: 2 },
      departage: { par: "v1", candidats: ["v2", "v3"], places: 1, choix: ["v2"] } } });
    r = await outil.executer({ ...base, action: "clore" });
    assert.match(r.contenu, /Égalité tranchée par le Bailli Berthe : Colin/);
    assert.match(r.contenu, /voix du Bailli Berthe comptée double/);
    assert.match(r.contenu, /loups_eliminer/);
    api = veillees({ ancien: true });
    r = await outil.executer(base);
    assert.ok(!r.erreur, "système ancien : le vote s'ouvre comme avant");
    assert.ok((await outil.executer({ ...base, objet: "bailli" })).erreur);
  },

  async "loups_bailli et loups_registre"(M) {
    let api = veillees({ bailli: BERTHE, registre: ["Tour 1 : Aubin déclare…"] });
    assert.match((await O(M, "loups_bailli").executer({ action: "etat", villageois: "" })).contenu, /Bailli : Berthe/);
    await O(M, "loups_bailli").executer({ action: "nommer", villageois: "Désiré" });
    assert.deepEqual(api.appels.nommer, ["v3"]);
    assert.match((await O(M, "loups_registre").executer({ action: "lire", villageois: "", texte: "" })).contenu, /Aubin déclare/);
    const r = await O(M, "loups_registre").executer({ action: "declarer", villageois: "Aubin", texte: "Je suis la Liseuse." });
    assert.deepEqual(api.appels.declarer, [["v0", "Je suis la Liseuse."]]);
    assert.match(r.contenu, /Ne le confirme ni ne l'infirme/);
    api.refus = "Trois déclarations par jour.";
    assert.ok((await O(M, "loups_registre").executer({ action: "declarer", villageois: "Aubin", texte: "Encore." })).erreur);
    api = veillees({ ancien: true });
    assert.ok((await O(M, "loups_bailli").executer({ action: "etat", villageois: "" })).erreur);
    assert.ok((await O(M, "loups_registre").executer({ action: "lire", villageois: "", texte: "" })).erreur);
  },

  async "résolveur : vote du Bailli, départage, succession posthume ; notes privées justes"(M) {
    veillees({ bailli: BERTHE });
    const C = new M.jeu.Compagnons({ graine: "bailli" });
    const vues = [];
    C.cerveaux.decider = async (vue, d) => { vues.push(d); return { cibles: [d.candidats[0].id] }; };
    const cand = [{ id: "v2", nom: "Colin" }, { id: "v3", nom: "Désiré" }];
    await C.resoudreLoups({ type: "vote", id: "a", acteurId: "v1", invite: "Qui élire ?", candidats: cand, nombre: 1, objet: "bailli" });
    await C.resoudreLoups({ type: "demande", id: "b", acteurId: "v1", invite: "Tranche.", candidats: cand, nombre: 1, objet: "departage" });
    await C.resoudreLoups({ type: "demande", id: "c", acteurId: "v1", invite: "À qui le sceau ?", candidats: cand, nombre: 1, objet: "succession", posthume: true });
    await C.resoudreLoups({ type: "vote", id: "d", acteurId: "v1", invite: "Qui exécuter ?", candidats: cand, nombre: 1 });
    assert.deepEqual(vues.map(d => d.objet), ["bailli", "departage", "succession", "vote"]);
    assert.match(vues[0].invite, /Élection du Bailli : vote POUR/);
    assert.match(vues[1].invite, /Tu es le Bailli : le vote d'exécution est à égalité/);
    assert.match(vues[2].invite, /Tu es mort, et tu étais le Bailli/);
    const notes = M.jeu.privesDe("v1");
    assert.match(notes[0], /^Élection du Bailli, tour 2 : tu as voté pour Colin/);
    assert.match(notes[1], /en Bailli, tu as tranché l'égalité : tu as désigné Colin/);
    assert.match(notes[2], /^Mort, tu as remis le sceau du Bailli à Colin/);
    assert.match(notes[3], /^Vote du tour 2 : tu as voté contre Colin/);
    assert.ok(!notes.slice(0, 3).some(n => /^Nuit/.test(n)));
    // Sans IA : un loup confie le sceau à sa meute ; un villageois, à quelqu'un qu'il ne soupçonne pas.
    const repli = M.compagnons.repliDecision({ id: "v2", allies: ["v4"], suspects: [] },
      { type: "cibles", objet: "succession", candidats: [{ id: "v0", nom: "Aubin" }, { id: "v4", nom: "Ernest" }, { id: "v3", nom: "Désiré" }], nombre: 1 }, "g");
    assert.deepEqual(repli.cibles, ["v4"]);
    const repliV = M.compagnons.repliDecision({ id: "v1", allies: [], suspects: ["v2", "v4"] },
      { type: "cibles", objet: "bailli", vote: true, candidats: [{ id: "v2", nom: "Colin" }, { id: "v4", nom: "Ernest" }, { id: "v3", nom: "Désiré" }], nombre: 1 }, "g");
    assert.deepEqual(repliV.cibles, ["v3"]);
  },

  async "un compagnon qui commence par « Au Registre : … » fait inscrire sa déclaration"(M) {
    assert.equal(M.compagnons.declarationAuRegistre("Au Registre : je suis la Liseuse de cendres."), "je suis la Liseuse de cendres.");
    assert.equal(M.compagnons.declarationAuRegistre("*Il se lève.* — Au registre :  j'ai lu  Berthe."), "j'ai lu Berthe.");
    assert.equal(M.compagnons.declarationAuRegistre("Je dirai au Registre : rien."), null);
    assert.match(M.compagnons.CONSIGNE_PARLER_LOUPS, /« Au Registre : »/);
    const api = veillees();
    const C = new M.jeu.Compagnons({ graine: "registre" });
    const repliques = ["*Elle lève la main.* — Au Registre : je suis l'Herboriste.", "Je n'ai rien vu cette nuit."];
    C.cerveaux.parler = async () => ({ texte: repliques.shift() ?? "—", source: "ia" });
    await C.reagir({ max: 2 });
    assert.equal(api.appels.declarer.length, 1);
    assert.equal(api.appels.declarer[0][1], "je suis l'Herboriste.");
  },

  async "pilote : l'élection avant le vote d'exécution, sa clôture sans exécution"(M) {
    const P = M.pilote;
    const m = { aube: true, debats: 2, voteFait: false };
    const e = (phase, extra = {}) => ({ phase, tour: 2, vote: { ouvert: false }, ...extra });
    assert.equal(P.prochaineEtapeLoups(e("jour"), m, { election: true }), "bailli");
    assert.equal(P.prochaineEtapeLoups(e("jour"), m), "vote-ouvrir");
    assert.equal(P.prochaineEtapeLoups(e("jour"), { ...m, debats: 0 }, { election: true }), "debat", "le débat d'abord");
    assert.equal(P.prochaineEtapeLoups(e("vote", { vote: { ouvert: true, objet: "bailli" } }), m), "bailli-clore");
    assert.equal(P.prochaineEtapeLoups(e("vote", { vote: { ouvert: true } }), m), "vote-clore");
    const annonce = P.CONSIGNES_LOUPS.annonceBailli("Désiré est élu Bailli");
    assert.match(annonce, /vient d'élire son Bailli \(élection menée au débat\) : Désiré est élu Bailli\./);
    assert.doesNotMatch(annonce, /loups_eliminer|loups_vote/);
    assert.match(annonce, /personne n'a été exécuté par l'élection/);
    assert.equal(P.resultatElection({ bailli: "v3", sort: true }, id => (id === "v3" ? "Désiré" : id)), "Désiré est élu Bailli (par le sort, entre les ex aequo)");
    assert.match(P.resultatElection({ bailli: "" }), /la charge reste vacante/);
    // En marche : le pilote ouvre lui-même l'élection due (au débat, sans changer de phase) et la clôt, sans tour du narrateur ;
    // le narrateur annonce le Bailli en ouvrant le vote d'exécution.
    const consigne = async (options, prep = () => {}) => {
      const api = veillees(options);
      prep(api);
      for (const a of game.actors.contents) { a.system.joueur = ""; a.system.compagnon = true; }
      const vues = [];
      const moteur = { actif: true, auRepos: () => true, budgetDepasse: () => false, compagnons: { maxRepliques: () => 0 } };
      const p = new P.PiloteAutomatique({ moteur, horloge: { maintenant: () => 0, attendre: async () => {} }, aviser: () => {}, etatDuJeu: () => "" });
      moteur.tour = async texte => { vues.push(texte); p.arreter("manuel"); };
      p.demarrer();
      await p.boucle;
      return { texte: vues.join("\n"), api, etapes: p.journal.map(j => j.etape) };
    };
    let x = await consigne({ resultat: { objet: "bailli", decompte: { v3: 3 }, elus: ["v3"], bailli: "v3", sort: false } });
    assert.deepEqual(x.etapes, ["bailli", "bailli-clore", "vote-ouvrir"]);
    assert.deepEqual(x.api.appels.ouvrirVote.map(a => a.objet), ["bailli"], "le pilote ouvre l'élection lui-même");
    assert.deepEqual(x.api.appels.changerPhase, [], "au débat, sans passer en phase vote");
    assert.match(x.texte, /^[\s\S]*Étape : le vote\.[\s\S]*Désiré est élu Bailli/, "un seul tour du narrateur : le vote, avec l'annonce");
    // Refusée par le système : pas d'élection ce jour-là, le vote d'exécution suit (sans boucler), sans annonce.
    x = await consigne({}, api => { api.ouvrirVote = async () => { throw new Error("Une élection a déjà eu lieu aujourd'hui."); }; });
    assert.deepEqual(x.etapes, ["bailli", "vote-ouvrir"]);
    assert.doesNotMatch(x.texte, /élire son Bailli/);
    assert.match((await consigne({ ancien: true })).texte, /Étape : le vote\./, "système ancien : le vote d'exécution");
  },

  async "consignes : Bailli public, Registre jamais confirmé, Masques jamais mentionnés ; nommer pour désigner seulement"(M) {
    game.system.id = "lakour-loups";
    const c = M.adaptateurs.adaptateur().consignes;
    assert.match(c, /Le Bailli est une charge PUBLIQUE/);
    assert.match(c, /le système gère seul sa voix double, le départage des égalités et sa succession/);
    assert.match(c, /ne la confirme ni ne l'infirme jamais/);
    assert.match(c, /Masques de veillée sont un secret de la meute : ne les mentionne jamais/);
    assert.match(c, /ne nomme un villageois que pour le désigner/);
    assert.match(c, /n'énumère jamais les vivants/);
    veillees();
    const vue = new M.jeu.Compagnons({ graine: "x" }).vue(game.actors.get("v1"));
    const sys = M.compagnons.consigneSysteme(vue);
    assert.match(sys, /Le Bailli est une charge PUBLIQUE/);
    assert.match(sys, /une déclaration n'est qu'une parole, que personne ne vérifie/);
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
  for (const [cle, fichier] of [["outils", "outils.js"], ["contexte", "contexte.js"], ["pilote", "pilote.js"], ["jeu", "compagnons-jeu.js"],
    ["compagnons", "compagnons.js"], ["adaptateurs", "adaptateurs.js"]]) {
    const r = await charger(fichier, mute[fichier] ?? null);
    M[cle] = r.X;
    if (r.dossier) dossiers.push(r.dossier);
  }
  return { M, dossiers };
}

test("Bailli, Registre, Masques (MJ IA) : les scripts d'origine passent toute la batterie", async () => {
  const { M } = await modules();
  assert.deepEqual(await batterie(M), []);
});

const MUTATIONS = [
  ["contexte.js", "if (b.acteurId) lignes.push(`Bailli (public)", "if (false) lignes.push(`Bailli (public)", "narrateur : le Bailli élu"],
  ["contexte.js", "else if (b.election?.ok) lignes.push(", "else if (false) lignes.push(", "narrateur : l'élection due"],
  ["contexte.js", "else if (b.succession) lignes.push(", "else if (false) lignes.push(", "narrateur : la succession"],
  ["contexte.js", "  if (registre?.length) {", "  if (false) {", "narrateur : le Registre"],
  ["contexte.js", "export const MAX_REGISTRE_NARRATEUR = 20;", "export const MAX_REGISTRE_NARRATEUR = 300;", "narrateur : Registre borné"],
  ["contexte.js", "  if (masques?.length) {", "  if (false) {", "narrateur : les Masques"],
  ["contexte.js", " Ne les nomme jamais, ne dis jamais qu'un rôle n'est pas en jeu.", "", "Masques sans le secret"],
  ["contexte.js", "const b = typeof api?.bailli === \"function\" ? essayer(() => api.bailli()) : null;", "const b = api.bailli();", "narrateur : pas défensif"],
  ["contexte.js", "typeof api?.masques === \"function\" && !e.vainqueur ? essayer(() => api.masques()) : null", "typeof api?.masques === \"function\" ? api.masques() : null", "Masques hors MJ actif"],
  ["compagnons-jeu.js", "if (b.acteurId === acteur.id) lignes.push(", "if (false) lignes.push(", "compagnon : « tu es le Bailli »"],
  ["compagnons-jeu.js", "    ...bailliEtRegistre(api, acteur),\n", "", "compagnon : ni Bailli ni Registre"],
  ["compagnons-jeu.js", "export const MAX_REGISTRE_COMPAGNON = 15;", "export const MAX_REGISTRE_COMPAGNON = 30;", "compagnon : Registre borné"],
  ["compagnons-jeu.js", "    loup ? \"Tes Masques de veillée", "    false ? \"Tes Masques de veillée", "compagnon loup : le masque"],
  ["compagnons-jeu.js", "      if (c.vue.jeu === \"loups\") await declarerAuRegistre(c.id, declarationAuRegistre(r.texte));\n", "", "« Au Registre » transmis"],
  ["compagnons-jeu.js", "  if (demande.objet === \"departage\") return \"departage\";\n", "", "résolveur : le départage"],
  ["compagnons-jeu.js", "  if (demande.objet === \"succession\") return \"succession\";\n", "", "résolveur : la succession"],
  ["compagnons-jeu.js", "return demande.objet === \"bailli\" ? \"bailli\" :", "return false ? \"bailli\" :", "résolveur : le vote du Bailli"],
  ["compagnons-jeu.js", "invite: inviteLoups(demande, sujet)", "invite: demande.invite", "résolveur : la précision du Bailli"],
  ["compagnons-jeu.js", "    case \"succession\": return `Mort, tu as remis", "    case \"succession_\": return `Mort, tu as remis", "note privée de la succession"],
  ["compagnons.js", "au registre\\s*:\\s*(.+)$/is", "au greffe\\s*:\\s*(.+)$/is", "« Au Registre » reconnu"],
  ["compagnons.js", "(?:\\*[^*]*\\*\\s*(?:[—–-]\\s*)?)?", "", "« Au Registre » après une didascalie"],
  ["compagnons.js", "  if (demande.objet === \"bailli\" || demande.objet === \"succession\") {", "  if (false) {", "repli : confier le sceau"],
  ["compagnons.js", "commence ta réplique par « Au Registre : »", "dis-le", "compagnons : savoir déclarer"],
  ["compagnons.js", " Le Bailli est une charge \"\n", " \"\n", "compagnons : le Bailli public"],
  ["outils.js", "enum: [\"execution\", \"chapelle\", \"bailli\", \"exil\"]", "enum: [\"execution\", \"chapelle\", \"exil\"]", "loups_vote : objet bailli"],
  ["outils.js", "      if (r.objet === \"bailli\") {\n        return { contenu: `Élection du Bailli", "      if (false) {\n        return { contenu: `Élection du Bailli", "élection traitée en exécution"],
  ["outils.js", "      const departage = r.departage\n", "      const departage = false\n", "départage non annoncé"],
  ["outils.js", "if (action === \"ouvrir\" && sujet === \"execution\" && (", "if (false && (", "exécution avant l'élection"],
  ["outils.js", "          await api.ouvrirVote({ objet: \"bailli\",", "          await api.changerPhase(\"vote\"); await api.ouvrirVote({ objet: \"bailli\",", "l'élection change la phase"],
  ["outils.js", "        const entree = await api.declarer(id, texte);", "        const entree = { texte };", "loups_registre n'inscrit rien"],
  ["outils.js", "        try { await api.nommerBailli(id); }", "        try { await null; }", "loups_bailli ne nomme pas"],
  ["pilote.js", "  return election ? \"bailli\" : \"vote-ouvrir\";", "  return \"vote-ouvrir\";", "pilote : pas d'élection"],
  ["pilote.js", "return etat.vote.objet === \"bailli\" ? \"bailli-clore\" : \"vote-clore\";", "return \"vote-clore\";", "pilote : élection close comme une exécution"],
  ["pilote.js", "try { election = Boolean(api.bailli?.()?.election?.ok) && m.electionRefusee !== etat.tour; }", "try { election = false; }", "pilote : élection jamais vue"],
  ["pilote.js", " && m.electionRefusee !== etat.tour; }", "; }", "pilote : élection refusée redemandée sans fin"],
  ["pilote.js", "        try { await api.ouvrirVote({ objet: \"bailli\", duree: 0 }); } catch (e) {", "        try { await null; } catch (e) {", "pilote : élection jamais ouverte"],
  ["pilote.js", "        try { r = await api.cloreVote(); }", "        try { r = null; }", "pilote : élection jamais close"],
  ["pilote.js", "const annonce = m.annonceBailli ? ` ${CONSIGNES_LOUPS.annonceBailli(m.annonceBailli)}` : \"\";", "const annonce = \"\";", "pilote : Bailli jamais annoncé"],
  ["adaptateurs.js", "ne la confirme ni ne l'infirme jamais", "confirme-la si tu le sais", "narrateur : déclaration confirmée"],
  ["adaptateurs.js", "Les Masques de veillée sont un secret de la meute : ne les mentionne jamais, et ne dis jamais qu'un \"\n    + \"rôle n'est pas en jeu. \"",
    "\"", "narrateur : Masques non tus"]
];

test("Bailli, Registre, Masques (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    const { M, dossiers } = await modules({ [fichier]: [avant, apres] });
    try { if (!(await batterie(M)).length) passees.push(`${regle} (${fichier})`); }
    finally { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
