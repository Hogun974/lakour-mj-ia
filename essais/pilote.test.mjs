// Pilote automatique (scripts/pilote.js) : quand il ne reste que des compagnons IA, en mode autonome, la partie continue seule.
// Hors de Foundry, sans AUCUN appel payant : l'API des Veillées est une petite partie factice (village, nuit, vote, victoire),
// le MJ IA une doublure qui « joue » chaque consigne en appelant l'API comme le feraient ses outils loups_*, et le temps est
// virtuel. Essais : détection (humain vivant ou non, mode, phase, séance), pas de pilote en mode Validation (un avis), arrêt à la
// victoire (après le dénouement), au budget, au plafond d'étapes, au retour d'un humain ; jamais deux étapes en même temps ni
// pendant un tour du MJ ou la voix du narrateur ; débat borné sans boucle (avec le vrai moteur) ; 40k/Warcraft (échanges bornés,
// combat relancé, combat retenu) ; batterie par mutation.  Lancer : npm run essais
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
const reglages = {
  pilote: true, piloteDelai: 4, piloteEtapes: 60, autonomie: "autonome", voix: "aucune", miseEnPlace: false, delaiReponse: 0, budgetSeance: 0,
  bavardageCompagnons: "normal", fournisseur: "anthropic", modeleAnthropic: "claude-opus-5-5", modeleCompagnons: "", jouerPnj: true,
  personnaliteActive: "p", personnalites: [{ id: "p", nom: "Essai", nomAffiche: "La Voix" }], compagnonsPrive: {}, mouvementsBloques: {},
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const REGLAGES_DEPART = structuredClone(reglages);
const chat = [];
let moteurEnEcoute = null;
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2) }
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
  // Ce que fait le hook createChatMessage du MJ IA : chaque message est proposé au moteur.
  if (moteurEnEcoute) setImmediate(() => moteurEnEcoute.recevoir(m));
  return m;
} } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups", title: "Les Veillées", version: "1" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const P = await import("../scripts/pilote.js");
const { MoteurMJ } = await import("../scripts/moteur.js");

// ------------------------------------------------------------------ une partie factice des Veillées
// Les villageois : humains (joueur) puis compagnons ; les `loups` premiers compagnons sont de la meute. La partie commence au
// tour 1, vote clos : le village vient d'exécuter le dernier humain vivant (les humains sont morts tôt).
let numero = 0;
function village({ humains = 1, humainVivant = false, compagnons = 7, loups = 2, strategie = "village" } = {}) {
  game.actors = new Collection();
  const ajouter = (nom, system) => {
    const a = { id: `v${++numero}`, name: nom, type: "villageois", flags: {}, system: { joueur: "", compagnon: false, vivant: true, camp: "village", ...system } };
    game.actors.set(a.id, a);
    return a;
  };
  for (let i = 0; i < humains; i++) ajouter(`Humain ${i + 1}`, { joueur: `u${i + 1}`, vivant: humainVivant });
  for (let i = 0; i < compagnons; i++) ajouter(`Compagnon ${i + 1}`, { compagnon: true, camp: i < loups ? "meute" : "village" });
  const premierHumain = game.actors.find(a => a.system.joueur);
  const etat = { partie: "p1", phase: "vote", tour: 1, vainqueur: "",
    vote: { ouvert: false, numero: 1, resultat: { objet: "execution", tour: 1, numero: 1, elus: premierHumain ? [premierHumain.id] : [] } } };
  const villageois = () => game.actors.filter(a => a.type === "villageois");
  const vivants = camp => villageois().filter(a => a.system.vivant && (!camp || a.system.camp === camp));
  const api = {
    journal: [], strategie,
    etat: () => structuredClone(etat),
    villageois,
    async changerPhase(p) { etat.phase = p; if (p === "nuit") etat.tour++; api.journal.push(`phase ${p}`); },
    async verifierVictoire() {
      const m = vivants("meute").length, v = vivants("village").length;
      const g = m === 0 ? "village" : m >= v ? "meute" : "";
      if (g) Object.assign(etat, { vainqueur: g, phase: "fin" });
      return g;
    },
    eliminer(id) { const a = game.actors.get(id); if (a) a.system.vivant = false; },
    ouvrirVote() { etat.phase = "vote"; etat.vote = { ouvert: true, numero: etat.vote.numero + 1, resultat: null }; },
    cloreVote() {
      const cible = api.strategie === "egalite" ? null : (api.strategie === "village" ? vivants("meute") : vivants("village"))[0];
      etat.vote = { ...etat.vote, ouvert: false, resultat: { objet: "execution", tour: etat.tour, numero: etat.vote.numero, elus: cible ? [cible.id] : [] } };
    }
  };
  return api;
}

// Le MJ IA doublure : il lit l'étape de la consigne et fait ce que ses outils loups_* feraient. Rien de payant.
async function jouerMJ(api, consigne) {
  if (!api || api.sourd) return;   // en aventure, pas de partie ; un MJ qui n'obéit plus : la partie n'avance plus
  if (/Étape : la nuit\./.test(consigne)) {
    await api.changerPhase("nuit");
    const proie = api.villageois().find(a => a.system.vivant && a.system.camp !== "meute");
    if (proie) api.eliminer(proie.id);
    await api.changerPhase("aube");
    await api.verifierVictoire();
  } else if (/Étape : le vote\./.test(consigne)) api.ouvrirVote();
  else if (/Étape : le dépouillement\./.test(consigne)) api.cloreVote();
  else if (/Étape : l'exécution\./.test(consigne)) {
    const noms = /Le village a désigné (.+?)\. Appelle/.exec(consigne)[1].split(" et ");
    for (const n of noms) api.eliminer(api.villageois().find(a => a.name === n).id);
    await api.verifierVictoire();
  }
}

// Temps virtuel : attendre(ms) avance l'horloge et laisse tourner la boucle d'événements (vrais minuteurs compris).
function horloge() {
  const h = { t: 0, maintenant: () => h.t, attendre: async ms => { h.t += ms; await new Promise(r => setTimeout(r, 0)); } };
  return h;
}

// Un moteur doublure : un tour à la fois (sinon l'essai échoue), coût par tour, compagnons doublures.
function moteurFactice(api, { coutTour = 0, dureeTour = 2 } = {}) {
  const m = {
    actif: true, enCours: false, occupe: false, tours: [], cout: 0, budget: 0, chevauchements: 0,
    auRepos() { return !this.enCours && !this.occupe; },
    budgetDepasse() { return this.budget > 0 && this.cout >= this.budget; },
    async tour(consigne) {
      if (this.enCours) this.chevauchements++;
      this.enCours = true;
      this.tours.push(consigne);
      for (let i = 0; i < dureeTour; i++) await new Promise(r => setImmediate(r));
      await jouerMJ(api, consigne);
      this.cout += coutTour;
      this.enCours = false;
    },
    compagnons: {
      repliques: 2, debats: [], reactions: 0, combats: 0,
      maxRepliques() { return this.repliques; },
      async debattre() { this.debats.push(api?.etat?.().tour ?? 0); return this.repliques ? [{ acteurId: "x", texte: "Je soupçonne le meunier." }] : []; },
      async reagir() { this.reactions++; return this.repliques ? [{ acteurId: "x", texte: "Je vous suis." }] : []; },
      async tourDeCombat() { this.combats++; return "J'attaque."; }
    }
  };
  return m;
}

function pilote(M, api, moteur, extra = {}) {
  const avis = [];
  const h = horloge();
  const p = new M.PiloteAutomatique({ moteur, api: () => api, horloge: h, aviser: t => avis.push(t), ...extra });
  return { p, avis, h };
}
// La boucle du pilote jusqu'à son arrêt ; au-delà de 5 s réelles, elle tourne à vide : on l'arrête et l'essai échoue.
async function fin(p) {
  let minuterie;
  const delai = new Promise(r => { minuterie = setTimeout(() => r("délai"), 5000); });
  try {
    while (p.boucle) {
      if (await Promise.race([p.boucle, delai]) === "délai") {
        p.arreter("manuel");
        throw new Error("le pilote tourne sans fin");
      }
    }
  } finally { clearTimeout(minuterie); }
}
const remettre = () => { Object.assign(reglages, structuredClone(REGLAGES_DEPART)); joueur.active = true; game.combats.active = null; game.scenes.active = null; };

// ------------------------------------------------------------------ détection
test("détection aux Veillées : un humain vivant, la phase, la séance, le réglage et le mode décident", () => {
  remettre();
  let api = village({ humainVivant: true });
  const { p } = pilote(P, api, moteurFactice(api));
  assert.deepEqual(p.conditions(), { ok: false, raison: "humain" }, "un humain vivant : pas de pilote");
  api = village({ humains: 2 });
  const q = pilote(P, api, moteurFactice(api)).p;
  assert.deepEqual(q.conditions(), { ok: true }, "humains morts qui regardent, que des compagnons vivants : pilote");
  api.changerPhase("preparation");
  assert.equal(q.conditions().raison, "preparation");
  api.changerPhase("jour");
  reglages.autonomie = "validation";
  assert.equal(q.conditions().raison, "validation");
  reglages.autonomie = "autonome";
  reglages.pilote = false;
  assert.equal(q.conditions().raison, "reglage");
  reglages.pilote = true;
  q.moteur.actif = false;
  assert.equal(q.conditions().raison, "seance");
  q.moteur.actif = true;
  api.etat = (e => () => ({ ...e(), vainqueur: "meute", phase: "fin" }))(api.etat);
  assert.equal(q.conditions().raison, "fin");
  const vide = village({ humains: 1, compagnons: 0 });
  assert.equal(pilote(P, vide, moteurFactice(vide)).p.conditions().raison, "personne");
  assert.deepEqual(P.vivantsVeillees(village({ humains: 2, humainVivant: true })).humains.length, 2);
});

test("étapes des Veillées (logique pure) : nuit, aube, débat borné, vote, exécution, dénouement", () => {
  const m = P.nouvelleMemoire();
  const e = (phase, extra = {}) => ({ phase, tour: 2, vainqueur: "", vote: { ouvert: false, numero: 1, resultat: null }, ...extra });
  assert.equal(P.prochaineEtapeLoups(e("nuit"), m), "nuit");
  assert.equal(P.prochaineEtapeLoups(e("aube"), m), "aube");
  assert.equal(P.prochaineEtapeLoups(e("jour"), { ...m, aube: true }), "debat");
  assert.equal(P.prochaineEtapeLoups(e("jour"), { ...m, aube: true, debats: 2 }), "vote-ouvrir");
  assert.equal(P.prochaineEtapeLoups(e("jour"), { ...m, debats: 1 }, { debatMax: 0 }), "vote-ouvrir", "bavardage silencieux : pas de débat");
  assert.equal(P.prochaineEtapeLoups(e("vote", { vote: { ouvert: true } }), m), "vote-clore");
  assert.equal(P.prochaineEtapeLoups(e("vote"), { ...m, voteFait: true }, { elusVivants: ["a"] }), "eliminer");
  assert.equal(P.prochaineEtapeLoups(e("vote"), { ...m, voteFait: true }), "nuit", "personne de désigné, ou déjà mort : la nuit");
  assert.equal(P.prochaineEtapeLoups(e("fin", { vainqueur: "village" }), m), "denouement");
  assert.equal(P.prochaineEtapeLoups(e("fin", { vainqueur: "village" }), { ...m, denouement: true }), null, "un seul dénouement");
  assert.equal(P.prochaineEtapeLoups(e("preparation"), m), null);
  assert.equal(P.voteDuJour({ tour: 2, vote: { ouvert: false, resultat: { objet: "execution", tour: 2 } } }), true);
  assert.equal(P.voteDuJour({ tour: 2, vote: { ouvert: false, resultat: { objet: "chapelle", tour: 2 } } }), false, "le vote de la Chapelle n'est pas l'exécution");
  assert.equal(P.voteDuJour({ tour: 3, vote: { ouvert: false, resultat: { objet: "execution", tour: 2 } } }), false, "le vote d'hier");
});

// ------------------------------------------------------------------ le pilote mène une partie
test("partie complète : le pilote mène les compagnons jusqu'à la victoire, raconte le dénouement une fois, puis s'arrête net", async () => {
  remettre();
  const api = village();
  const moteur = moteurFactice(api);
  const { p, avis } = pilote(P, api, moteur);
  p.verifier();
  assert.equal(p.enMarche, true);
  p.verifier(); p.demarrer();   // déjà en marche : rien de plus
  await fin(p);
  const etapes = p.journal.map(j => j.etape);
  assert.deepEqual(etapes, ["nuit", "aube", "debat", "debat", "vote-ouvrir", "vote-clore", "eliminer",
    "nuit", "aube", "debat", "debat", "vote-ouvrir", "vote-clore", "eliminer", "denouement"]);
  assert.equal(api.etat().vainqueur, "village");
  assert.equal(p.dernierArret.raison, "victoire");
  assert.equal(p.enMarche, false);
  assert.equal(moteur.chevauchements, 0, "jamais deux tours du MJ à la fois");
  assert.match(moteur.tours.at(-1), /Étape : le dénouement\. La partie est finie, victoire : le camp « village »/);
  assert.ok(moteur.tours.every(t => t.startsWith("[Pilote automatique")), "chaque consigne dit au MJ qu'il mène seul");
  assert.deepEqual(avis, ["LAKOUR_MJIA.Pilote.Demarre", "LAKOUR_MJIA.Pilote.Victoire"]);
  assert.ok(api.journal.includes("phase jour"), "après l'aube, le jour se lève (Table de jeu, mise en scène)");
  // Débat borné : au plus DEBAT_TOURS tours de parole par jour.
  const parJour = moteur.compagnons.debats.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
  assert.ok([...parJour.values()].every(n => n <= P.DEBAT_TOURS), JSON.stringify([...parJour]));
  // La partie finie, il ne repart pas.
  p.verifier();
  assert.equal(p.enMarche, false);
  // La meute peut gagner aussi.
  const api2 = village({ strategie: "meute" });
  const r2 = pilote(P, api2, moteurFactice(api2));
  r2.p.verifier();
  await fin(r2.p);
  assert.equal(api2.etat().vainqueur, "meute");
  assert.equal(r2.p.journal.at(-1).etape, "denouement");
});

test("mode Validation : pas de pilote, un seul avis au MJ ; passé en autonome, il démarre ; repassé en Validation, il s'arrête", async () => {
  remettre();
  reglages.autonomie = "validation";
  const api = village();
  const moteur = moteurFactice(api, { dureeTour: 20 });
  const { p, avis } = pilote(P, api, moteur);
  p.verifier(); p.verifier(); p.verifier();
  assert.equal(p.enMarche, false);
  assert.deepEqual(avis, ["LAKOUR_MJIA.Pilote.Validation"], "un avis, pas trois");
  reglages.autonomie = "autonome";
  p.verifier();
  assert.equal(p.enMarche, true);
  while (!p.journal.length) await new Promise(r => setTimeout(r, 0));
  reglages.autonomie = "validation";
  p.verifier();
  assert.equal(p.enMarche, false, "arrêt net");
  const n = p.journal.length;
  await fin(p);
  assert.equal(p.journal.length, n, "l'étape en cours finit, aucune autre ne commence");
  assert.equal(p.dernierArret.raison, "validation");
});

test("budget atteint : arrêt avec un avis, et le pilote ne repart pas seul", async () => {
  remettre();
  const api = village();
  const moteur = moteurFactice(api, { coutTour: 0.5 });
  moteur.budget = 2;
  const { p, avis } = pilote(P, api, moteur);
  p.verifier();
  await fin(p);
  assert.equal(p.dernierArret.raison, "budget");
  assert.equal(moteur.tours.length, 4, "0,5 $ par tour, budget 2 $ : quatre tours");
  assert.ok(avis.includes("LAKOUR_MJIA.Pilote.Budget"));
  assert.equal(api.etat().vainqueur, "");
  p.verifier();
  assert.equal(p.enMarche, false, "en pause : le MJ le relance depuis la console");
  moteur.budget = 0;
  assert.equal(p.relancer(), true, "relancé à la main (budget relevé)");
  await fin(p);
  assert.equal(p.dernierArret.raison, "victoire");
});

test("plafond d'étapes : arrêt avec un avis ; une partie qui n'avance plus s'arrête aussi", async () => {
  remettre();
  reglages.piloteEtapes = 5;
  const api = village();
  const { p, avis } = pilote(P, api, moteurFactice(api));
  p.verifier();
  await fin(p);
  assert.equal(p.journal.length, 5);
  assert.equal(p.dernierArret.raison, "max");
  assert.ok(avis.includes("LAKOUR_MJIA.Pilote.Max"));
  reglages.piloteEtapes = 60;
  // Un MJ qui n'obéit plus : la même étape sur le même état, trois fois au plus.
  const sourd = village();
  sourd.sourd = true;
  const r = pilote(P, sourd, moteurFactice(sourd));
  r.p.verifier();
  await fin(r.p);
  assert.equal(r.p.dernierArret.raison, "bloque");
  assert.deepEqual(r.p.journal.map(j => j.etape), ["nuit", "nuit", "nuit"]);
});

test("jamais deux étapes en même temps, ni pendant un tour du MJ (message d'un spectateur, file du moteur), ni pendant la voix", async () => {
  remettre();
  const api = village();
  const moteur = moteurFactice(api, { dureeTour: 5 });
  let voix = 0, voixFinie = true;
  const debuts = [];
  const { p } = pilote(P, api, moteur, { attendreVoix: async () => { voix++; voixFinie = false; for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); voixFinie = true; } });
  const executer = moteur.tour.bind(moteur);
  moteur.tour = async c => {
    debuts.push({ occupe: moteur.occupe, voixFinie, enEtape: p.enEtape });
    return executer(c);
  };
  // Le moteur est occupé (un tour lancé par un message, la file) pendant un moment : rien ne commence.
  moteur.occupe = true;
  for (let i = 0; i < 20; i++) p.verifier();
  p.demarrer(); p.demarrer();
  for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
  assert.equal(moteur.tours.length, 0, "aucune étape pendant que le moteur travaille");
  moteur.occupe = false;
  await fin(p);
  assert.equal(p.dernierArret.raison, "victoire");
  assert.equal(moteur.chevauchements, 0);
  assert.ok(debuts.every(d => !d.occupe && d.voixFinie && d.enEtape), JSON.stringify(debuts));
  assert.ok(voix >= p.journal.length, "la voix du narrateur est attendue avant chaque étape");
});

test("un humain vivant réapparaît : le pilote lui rend la main (avis) et repartira de lui-même quand il ne restera plus que des compagnons", async () => {
  remettre();
  const api = village();
  const moteur = moteurFactice(api, { dureeTour: 20 });
  const { p, avis } = pilote(P, api, moteur);
  p.verifier();
  while (!p.journal.length) await new Promise(r => setTimeout(r, 0));
  const humain = api.villageois().find(a => a.system.joueur);
  humain.system.vivant = true;   // ex. le Puits, une résurrection du narrateur, un joueur rattaché
  p.verifier();
  assert.equal(p.enMarche, false);
  await fin(p);
  assert.equal(p.journal.length, 1);
  assert.equal(p.dernierArret.raison, "humain");
  assert.ok(avis.includes("LAKOUR_MJIA.Pilote.Humain"));
  humain.system.vivant = false;
  p.verifier();
  assert.equal(p.enMarche, true, "pas en pause : il repart");
  p.arreter();
  assert.equal(p.suspendu, true, "arrêté par le MJ : il ne repart pas seul");
  p.verifier();
  assert.equal(p.enMarche, false);
  await fin(p);
  // Fin de séance.
  const q = pilote(P, api, moteurFactice(api, { dureeTour: 20 }));
  q.p.verifier();
  q.p.moteur.actif = false;
  q.p.verifier();
  await fin(q.p);
  assert.equal(q.p.dernierArret.raison, "seance");
});

// ------------------------------------------------------------------ débat borné, avec le vrai moteur
test("débat borné sans boucle (vrai moteur) : 2 tours de parole au plus, le MJ répond une fois à chacun, les compagnons ne se relancent pas", async () => {
  remettre();
  reglages.piloteDelai = 0;
  chat.length = 0;
  const api = village({ compagnons: 7 });
  game.lakourLoups = api;
  for (const a of game.actors.filter(x => x.system.compagnon)) a.flags["lakour-mj-ia"] = { compagnon: { temperament: "bavard" } };
  const moteur = new MoteurMJ();
  moteurEnEcoute = moteur;
  const tours = [];
  moteur.tour = async (entree, options) => {
    moteur.enCours = true;
    tours.push(entree);
    await new Promise(r => setTimeout(r, 0));
    await jouerMJ(api, entree);
    moteur.enCours = false;
  };
  const appels = [];
  moteur.compagnons.cerveaux.fournisseur = () => ({ nom: "anthropic", async envoyerCourt(c) { appels.push(c); return { texte: "Le meunier ment.", usage: {}, arret: "fin" }; } });
  moteur.compagnons.vue = a => ({ id: a.id, nom: a.name, monde: "Brumecombe", jeu: "loups", personnalite: { temperament: "bavard" }, fiche: "", prive: [], public: [],
    scene: "", autres: [], allies: [], suspects: [], vivant: a.system.vivant, peutParler: a.system.vivant && api.etat().phase !== "nuit", tour: api.etat().tour });
  const h = horloge();
  moteur.pilote.horloge = h;
  moteur.pilote.aviser = () => {};
  moteur.pilote.verifier();
  assert.equal(moteur.pilote.enMarche, true);
  await fin(moteur.pilote);
  assert.equal(moteur.pilote.dernierArret.raison, "victoire");
  const repliques = chat.filter(m => m.flags?.["lakour-mj-ia"]?.compagnon);
  const debats = moteur.pilote.journal.filter(j => j.etape === "debat").length;
  assert.equal(debats, 4, "deux jours, deux tours de parole chacun");
  assert.equal(repliques.length, debats * 2, "bavardage normal : 2 répliques par tour de parole, jamais plus");
  const reponses = tours.filter(t => t.includes("[Messages et actions des joueurs]"));
  assert.equal(reponses.length, debats, "le MJ répond une fois à chaque tour de parole");
  assert.equal(appels.length, repliques.length, "aucune réaction de compagnon en dehors des tours de parole du pilote (pas de boucle)");
  assert.equal(moteur.auRepos(), true);
  moteurEnEcoute = null;
  delete game.lakourLoups;
});

// ------------------------------------------------------------------ 40k et Warcraft
function aventure({ joueurConnecte = false } = {}) {
  game.system.id = "impmal";
  game.actors = new Collection();
  const acteur = (nom, extra) => { const a = { id: `a${++numero}`, name: nom, type: "character", flags: {}, ownership: {}, ...extra }; game.actors.set(a.id, a); return a; };
  const brin = acteur("Brin", { ownership: { u1: 3 }, hasPlayerOwner: true });
  joueur.character = brin;
  joueur.active = joueurConnecte;
  const ilsa = acteur("Sœur Ilsa", { flags: { "lakour-mj-ia": { compagnon: { temperament: "loyal" } } } });
  const varn = acteur("Varn", { flags: { "lakour-mj-ia": { compagnon: { temperament: "taciturne" } } } });
  const tokens = new Collection([brin, ilsa, varn].map((a, i) => [`t${i}`, { id: `t${i}`, name: a.name, actor: a, hidden: false }]));
  game.scenes.active = { id: "s", name: "Ruche", tokens };
  return { brin, ilsa, varn };
}

test("40k et Warcraft : un joueur connecté présent = pas de pilote ; parti, les compagnons continuent, échanges bornés puis pause", async () => {
  remettre();
  aventure({ joueurConnecte: true });
  const moteur = moteurFactice(null);
  const { p, avis } = pilote(P, null, moteur, { api: () => null });
  assert.deepEqual(p.conditions(), { ok: false, raison: "humain" });
  joueur.active = false;
  assert.deepEqual(p.conditions(), { ok: true }, "le joueur s'est déconnecté : il ne reste que les compagnons");
  joueur.active = true;
  game.scenes.active.tokens.delete("t0");
  assert.deepEqual(p.conditions(), { ok: true }, "son personnage a quitté la scène");
  p.verifier();
  await fin(p);
  assert.deepEqual(p.journal.map(j => j.etape), ["scene", "echange", "echange", "echange", "echange", "echange"]);
  assert.equal(p.dernierArret.raison, "pause");
  assert.ok(avis.includes("LAKOUR_MJIA.Pilote.Pause"));
  assert.equal(moteur.tours.length, 1, "le MJ fait avancer la scène, puis les compagnons réagissent (le MJ leur répond par sa file)");
  assert.equal(moteur.compagnons.reactions, P.ECHANGES_MAX);
  // Les compagnons se taisent : le MJ relance la scène lui-même.
  const muets = moteurFactice(null);
  muets.compagnons.repliques = 0;
  const r = pilote(P, null, muets, { api: () => null });
  r.p.verifier();
  await fin(r.p);
  assert.equal(muets.tours.length, P.ECHANGES_MAX);
  assert.match(muets.tours[1], /Étape : les compagnons n'ont rien dit/);
  game.system.id = "lakour-loups";
});

test("40k et Warcraft : le combat se poursuit (chaque tour compte), un combat arrêté est relancé, un combat en pause est retenu", async () => {
  remettre();
  reglages.piloteEtapes = 12;
  const { ilsa } = aventure();
  const moteur = moteurFactice(null);
  const { p, h } = pilote(P, null, moteur, { api: () => null });
  const combat = { id: "c1", started: true, round: 1, turn: 0, combatant: { name: "Cultiste", actor: { id: "pnj", flags: {} } } };
  game.combats.active = combat;
  p.verifier();
  // Le combat avance de lui-même (reactions.js) : le pilote compte les tours sans rien relancer.
  for (let i = 1; i <= 4; i++) {
    const t0 = h.t;
    while (h.t - t0 < 10000) await new Promise(r => setTimeout(r, 0));
    combat.turn = i;
  }
  const t0 = h.t;
  while (h.t - t0 < 10000) await new Promise(r => setTimeout(r, 0));
  assert.equal(moteur.tours.length, 0, "aucune relance : le combat avançait");
  assert.equal(p.etapes, 4, "quatre tours de combat joués, quatre étapes");
  // Il s'arrête au tour du cultiste : au bout de 30 s sans progrès, le pilote relance le MJ.
  while (!moteur.tours.length) await new Promise(r => setTimeout(r, 0));
  assert.match(moteur.tours[0], /le combat est arrêté au tour de Cultiste/);
  // Au tour d'un compagnon arrêté : son cerveau redéclare son action.
  combat.turn = 5;
  combat.combatant = { name: "Sœur Ilsa", actor: ilsa };
  while (!moteur.compagnons.combats) await new Promise(r => setTimeout(r, 0));
  await fin(p);
  assert.ok(["max", "bloque"].includes(p.dernierArret.raison), p.dernierArret.raison);
  assert.equal(p.combatRetenu(), true, "en pause, il ne reste que des compagnons : les tours ne se jouent plus d'eux-mêmes");
  joueur.active = true;
  game.scenes.active.tokens.set("t9", { id: "t9", name: "Brin", actor: joueur.character, hidden: false });
  assert.equal(p.combatRetenu(), false, "un joueur revient : le combat reprend");
  game.combats.active = null;
  game.system.id = "lakour-loups";
});

// ------------------------------------------------------------------ mutations
// Chaque règle est cassée à son tour dans une copie de pilote.js ; la batterie doit alors échouer.
const SOURCE = fileURLToPath(new URL("../scripts/pilote.js", import.meta.url));
const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
const MUTATIONS = {
  "mode Validation ignoré": ['    if (reglage("autonomie", "validation") !== "autonome") return { ok: false, raison: "validation" };\n', ""],
  "humain vivant ignoré": ['    if (groupe.humains.length) return { ok: false, raison: "humain" };\n', ""],
  "débat sans borne": ['  return m.debats < debatMax ? "debat" : "vote-ouvrir";', '  return m.debats < debatMax + 3 ? "debat" : "vote-ouvrir";'],
  "budget ignoré": ['      if (this.moteur.budgetDepasse()) return void this.arreter("budget");\n', ""],
  "plafond ignoré": ['      if (this.etapes >= this.etapesMax()) return void this.arreter("max");\n', ""],
  "pas d'attente du moteur": ["while (this.enMarche && !this.moteur.auRepos() &&", "while (false &&"],
  "pas de dénouement": ['        if (c.raison === "fin" && !this.memoire.denouement && !this.moteur.budgetDepasse()) await this.#etape("denouement", "fin");\n', ""],
  "victoire non vue": ['      if (etat.vainqueur || etat.phase === "fin") return { ok: false, raison: "fin" };\n', ""]
};

async function batterie(M) {
  const echecs = [];
  const verifier = async (nom, fn) => { try { await fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  remettre();
  await verifier("validation", () => { reglages.autonomie = "validation"; const a = village(); assert.equal(pilote(M, a, moteurFactice(a)).p.conditions().ok, false); reglages.autonomie = "autonome"; });
  await verifier("humain", () => { const a = village({ humainVivant: true }); assert.equal(pilote(M, a, moteurFactice(a)).p.conditions().ok, false); });
  await verifier("partie", async () => {
    const a = village();
    const m = moteurFactice(a);
    const { p } = pilote(M, a, m);
    p.verifier();
    await fin(p);
    assert.equal(p.dernierArret?.raison, "victoire");
    assert.equal(p.journal.filter(j => j.etape === "denouement").length, 1);
    assert.equal(p.journal.at(-1).etape, "denouement");
    assert.ok(Math.max(...[...m.compagnons.debats.reduce((x, t) => x.set(t, (x.get(t) ?? 0) + 1), new Map()).values()]) <= 2);
  });
  await verifier("budget", async () => {
    const a = village();
    const m = moteurFactice(a, { coutTour: 1 });
    m.budget = 2;
    const { p } = pilote(M, a, m);
    p.verifier();
    await fin(p);
    assert.equal(p.dernierArret?.raison, "budget");
  });
  await verifier("plafond", async () => {
    reglages.piloteEtapes = 3;
    try {
      const a = village();
      const { p } = pilote(M, a, moteurFactice(a));
      p.verifier();
      await fin(p);
      assert.equal(p.journal.length, 3);
    } finally { reglages.piloteEtapes = 60; }
  });
  await verifier("moteur occupé", async () => {
    const a = village();
    const m = moteurFactice(a);
    m.occupe = true;
    const { p } = pilote(M, a, m);
    p.verifier();
    for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
    try { assert.equal(m.tours.length, 0); } finally { p.arreter(); m.occupe = false; await fin(p); }
  });
  return echecs;
}

async function charger(mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-pilote-"));
  let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  if (mutation) {
    assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
    texte = texte.replace(mutation[0], mutation[1]);
  }
  writeFileSync(join(dossier, "pilote.js"), texte);
  return { dossier, M: await import(pathToFileURL(join(dossier, "pilote.js")).href) };
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const vrai = await charger(null);
  try { assert.deepEqual(await batterie(vrai.M), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok((await batterie(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
