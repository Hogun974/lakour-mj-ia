// Joueurs IA aux Veillées SANS narrateur IA (scripts/compagnons-veillees.js) : un MJ humain mène la Table, aucune séance du MJ IA.
// Point d'enregistrement game.lakourLoups.compagnons (creer, retirer), débat au lever du jour, réponses aux humains sans boucle
// entre compagnons, coût au compteur « compagnons hors séance » borné par le budget ; et la règle d'écoute ecouteActive (parole →
// texte seulement si une IA écoute). Doublures, aucun appel payant.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const reglages = {
  fournisseur: "anthropic", modeleAnthropic: "claude-opus-5-5", modeleCompagnons: "", budgetSeance: 1, delaiReponse: 0, bavardageCompagnons: "normal",
  compagnonsPrive: {}, compagnonsHorsSeance: { cout: 0, appels: 0, depuis: 0 }, pilote: false, autonomie: "validation", personnaliteActive: "p",
  personnalites: [{ id: "p", nom: "Essai", nomAffiche: "La Voix" }],
  seance: { active: false, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
let sansNarrateur = null;
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s) } };
globalThis.DOMParser = class { parseFromString(h) { return { querySelectorAll: () => [], body: { textContent: String(h).replace(/<[^>]*>/g, " ").trim() } }; } };
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.ChatMessage = { implementation: { create: async d => {
  chat.push(d);
  // Ce que fait le hook createChatMessage du MJ IA : chaque message est proposé aux compagnons sans narrateur.
  if (sansNarrateur) setImmediate(() => sansNarrateur.surMessage(d));
  return d;
} } };
globalThis.Actor = { implementation: { create: async d => {
  const a = { id: `c${game.actors.size + 1}`, ...structuredClone(d), async delete() { game.actors.delete(this.id); } };
  game.actors.set(a.id, a);
  return a;
} } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", { id: "u1", name: "Jordan", isGM: false, active: true }]]), actors: new Collection(),
  system: { id: "lakour-loups" }, world: { id: "monde" }, packs: new Collection(), messages: { get contents() { return chat; } },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  i18n: { localize: k => k, format: k => k, has: () => false }, combats: { active: null }, scenes: { active: null }, modules: new Map([["lakour-mj-ia", { api: {} }]])
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const { ecouteActive } = await import("../scripts/ecoute.js");
const { CompagnonsSansNarrateur } = await import("../scripts/compagnons-veillees.js");
const { MoteurMJ } = await import("../scripts/moteur.js");
const J = await import("../scripts/compagnons-jeu.js");

// L'API des Veillées, doublure : la phase, les villageois, le point d'enregistrement (avec son hook, comme le vrai système).
const hooks = [];
const etat = { partie: "p1", phase: "preparation", tour: 0, vainqueur: "" };
let point = null;
const api = {
  etat: () => structuredClone(etat),
  villageois: () => game.actors.filter(a => a.type === "villageois"),
  get compagnons() { return point; },
  set compagnons(p) { point = p; hooks.push(["lakourLoups.compagnons", p]); }
};
game.lakourLoups = api;

function monter({ reponse = "*Ysaline croise les bras.* — Je n'ai rien vu cette nuit." } = {}) {
  const moteur = new MoteurMJ();
  const appelsMJ = [];
  moteur.tour = async e => { appelsMJ.push(e); };   // le narrateur : ne doit JAMAIS être appelé ici
  const appels = [];
  moteur.compagnons.cerveaux.fournisseur = () => ({ nom: "anthropic", async envoyerCourt(c) { appels.push(c); return { texte: reponse, usage: { entree: 100000, cacheLecture: 0, cacheEcriture: 0, sortie: 10000 }, arret: "fin" }; } });
  moteur.compagnons.vue = a => ({ id: a.id, nom: a.name, monde: "Brumecombe", jeu: "loups", personnalite: a.flags["lakour-mj-ia"].compagnon, fiche: "", prive: [], public: [],
    scene: "", autres: [], allies: [], suspects: [], vivant: a.system.vivant, peutParler: a.system.vivant && etat.phase !== "nuit", tour: etat.tour });
  sansNarrateur = new CompagnonsSansNarrateur({ moteur, api: () => api });
  return { moteur, appelsMJ, appels, s: sansNarrateur };
}
const attendre = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 2)); };

test("écoute (parole → texte) : seulement si une séance du MJ IA est lancée ou s'il reste un compagnon vivant ; jamais module inactif", () => {
  assert.equal(ecouteActive({ seanceIA: true, compagnonsVivants: 0 }), true);
  assert.equal(ecouteActive({ seanceIA: false, compagnonsVivants: 2 }), true, "MJ humain et compagnons vivants : ils doivent entendre");
  assert.equal(ecouteActive({ seanceIA: false, compagnonsVivants: [{ id: "a" }] }), true);
  assert.equal(ecouteActive({ seanceIA: false, compagnonsVivants: 0 }), false, "aucune IA à l'écoute");
  assert.equal(ecouteActive({ seanceIA: false, compagnonsVivants: [] }), false);
  assert.equal(ecouteActive({ seanceIA: true, compagnonsVivants: 3, moduleActif: false }), false);
  assert.equal(ecouteActive(), false);
});

test("point d'enregistrement : game.lakourLoups.compagnons { disponible, creer, retirer } (hook) ; creer donne des villageois compagnons nommés, avec une personnalité", async () => {
  const { s } = monter();
  s.enregistrer();
  assert.equal(api.compagnons.disponible, true);
  assert.equal(hooks.at(-1)[0], "lakourLoups.compagnons");
  const ids = await api.compagnons.creer(4);
  assert.equal(ids.length, 4);
  for (const id of ids) {
    const a = game.actors.get(id);
    assert.equal(a.type, "villageois");
    assert.equal(a.system.compagnon, true);
    assert.equal(a.system.joueur, "");
    assert.ok(J.estCompagnon(a));
    assert.ok(a.flags["lakour-mj-ia"].compagnon.temperament, "une personnalité");
    // Le genre de son prénom, posé en trait (drapeau « traits » du système des Veillées) : « Odile » n'est jamais un homme.
    assert.equal(a.flags["lakour-loups"]?.traits?.genre, J.genreDuPrenom(a.name), a.name);
    assert.ok(["femme", "homme"].includes(a.flags["lakour-loups"].traits.genre), a.name);
    assert.ok(a.name && a.name !== "Jordan" && a.name !== "Hogun");
  }
  assert.equal(new Set(ids.map(id => game.actors.get(id).name)).size, 4, "noms distincts");
  assert.deepEqual(await api.compagnons.creer(0), []);
  assert.equal(await api.compagnons.retirer(ids[3]), true);
  assert.equal(game.actors.has(ids[3]), false);
  assert.equal(await api.compagnons.retirer("inconnu"), false);
  // Chez un autre que le MJ actif : rien n'est enregistré.
  const autre = { id: "mj2", isGM: true };
  game.user = autre;
  point = null;
  assert.equal(s.enregistrer(), null);
  game.user = mj;
  s.enregistrer();
});

test("le jour se lève : les compagnons vivants parlent (au plus le bavardage), en style théâtre ; la nuit et en séance, rien ; le narrateur jamais", async () => {
  chat.length = 0;
  const { s, appelsMJ, appels, moteur } = monter();
  etat.phase = "nuit";
  assert.deepEqual(await s.surPhase("nuit"), []);
  etat.phase = "jour";
  const dits = await s.surPhase("jour");
  assert.equal(dits.length, 2, "bavardage normal : 2 répliques");
  const repliques = chat.filter(m => m.flags?.["lakour-mj-ia"]?.compagnon);
  assert.equal(repliques.length, 2);
  assert.match(repliques[0].content, /<em class="lakour-mjia-didascalie">Ysaline croise les bras\.<\/em> — Je n'ai rien vu/);
  await attendre();
  assert.equal(appels.length, 2, "leurs propres répliques ne relancent personne (pas de boucle)");
  assert.equal(appelsMJ.length, 0, "aucun narrateur");
  // En séance du MJ IA, c'est le moteur qui mène : rien ici.
  reglages.seance.active = true;
  assert.deepEqual(await s.surPhase("jour"), []);
  reglages.seance.active = false;
  assert.equal(moteur.auRepos(), true);
});

test("ils répondent aux messages publics des humains (regroupés), jamais aux compagnons, au MJ IA, au système ni aux chuchotements", async () => {
  chat.length = 0;
  const { s, appels, appelsMJ } = monter();
  etat.phase = "jour";
  await ChatMessage.implementation.create({ content: "<p>Ysaline, tu étais où cette nuit ?</p>", speaker: { alias: "Jordan" }, flags: {} });
  await ChatMessage.implementation.create({ content: "<p>Et toi, Firmin ?</p>", speaker: { alias: "Jordan" }, flags: {} });
  await attendre();
  assert.equal(s.journal.filter(j => j.cause === "humain").length, 1, "deux messages rapprochés, un tour de parole");
  assert.equal(appels.length, 2);
  assert.match(appels[0].texte, /\[Ce qu'on attend de toi\]/);
  for (const m of [
    { content: "<p>chut</p>", whisper: ["mj"], flags: {} },
    { content: "<p>Le MJ IA parle</p>", flags: { "lakour-mj-ia": { ia: true } } },
    { content: "<p>La nuit tombe.</p>", flags: { "lakour-loups": { annonce: true } } },
    { content: "<p>Je vote.</p>", flags: { "lakour-mj-ia": { compagnon: "c1" } } }
  ]) assert.equal(s.surMessage(m), false, JSON.stringify(m.flags));
  etat.phase = "nuit";
  assert.equal(s.surMessage({ content: "<p>Psst</p>", flags: {} }), false, "la nuit, personne ne parle");
  etat.phase = "jour";
  await attendre();
  assert.equal(appels.length, 2);
  assert.equal(appelsMJ.length, 0);
});

test("coût hors séance : au compteur « compagnons hors séance », borné par le budget (puis repli sans appel) ; remis à zéro à la distribution", async () => {
  chat.length = 0;
  reglages.compagnonsHorsSeance = { cout: 0, appels: 0, depuis: 0 };
  reglages.seance.cout = 0;
  // Ce qu'ont laissé en attente les essais d'avant (le navigateur du MJ le garde d'un moteur à l'autre : couts-seance.test.mjs).
  reglages.coutsEnAttente = {};
  const { s, appels, moteur } = monter();
  etat.phase = "jour";
  await s.parler("essai");
  // Pendant la partie, le coût reste en mémoire : le réglage monde (livré à tous) ne bat pas au rythme des décisions des IA.
  assert.deepEqual(reglages.compagnonsHorsSeance, { cout: 0, appels: 0, depuis: 0 }, "rien d'écrit pendant la partie");
  assert.equal(moteur.couts.hors.appels, 2);
  // La partie finie : écrit d'un coup.
  etat.phase = "fin";
  assert.equal(moteur.coutsDifferes(), false);
  await moteur.viderCouts();
  etat.phase = "jour";
  const hors = reglages.compagnonsHorsSeance;
  assert.equal(hors.appels, 2);
  assert.ok(hors.cout > 0);
  assert.equal(reglages.seance.cout, 0, "rien au compteur de la séance");
  // Haiku 5.5 : 0,10 $/M d'entrée, 0,50 $/M de sortie (≈ 0,015 $ par appel ici) ; budget 1 $ (ce qui attend en mémoire compte).
  reglages.compagnonsHorsSeance = { cout: 0.5, appels: 80, depuis: 0 };
  moteur.couts.hors.cout = 0.5;
  const avant = appels.length;
  const dits = await s.parler("essai");
  assert.equal(appels.length, avant, "budget atteint : aucun appel");
  assert.ok(dits.every(d => d.source === "repli"), "repli déterministe");
  etat.phase = "preparation";
  await s.surPhase("preparation");
  assert.equal(reglages.compagnonsHorsSeance.cout, 0, "nouvelle partie : compteur à zéro");
});
