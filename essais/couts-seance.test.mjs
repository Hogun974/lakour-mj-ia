// Le coût des IA compté et borné (vu en vrai, 7 novembre 2026 : toute une séance des Veillées à « 0 $ », narrateur Opus 5.5 et compagnons
// Haiku 5.5). Un appel Anthropic (le vrai fournisseur, sa réponse doublée avec son usage) fait monter jetons et coût ; aux Veillées, pendant
// une partie, ils attendent la fin en mémoire ET dans le navigateur du MJ (réglage client « coutsEnAttente » : un rechargement ne les perd
// plus) ; la console les montre ; le budget les compte et arrête le narrateur comme les compagnons. Et le réglage « modeleCompagnons »,
// une liste, avec sa migration d'un ancien nom (« Claude Haiku 5.5 » -> claude-haiku-5-5). Doublures, aucun appel payant.
// Lancer : npm run essais
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
  fournisseur: "anthropic", modeleAnthropic: "claude-opus-5-5", modeleCompagnons: "", budgetSeance: 2, effort: "medium", voix: "aucune",
  compagnonsPrive: {}, compagnonsHorsSeance: { cout: 0, appels: 0, depuis: 0 }, coutsEnAttente: {}, pilote: false, autonomie: "validation",
  personnaliteActive: "p", personnalites: [{ id: "p", nom: "Essai", nomAffiche: "La Voix" }],
  seance: { active: true, debut: 1, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s) } };
globalThis.DOMParser = class { parseFromString(h) { return { querySelectorAll: () => [], body: { textContent: String(h).replace(/<[^>]*>/g, " ").trim() } }; } };
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
const avis = [];
globalThis.ui = { notifications: { info: t => avis.push(t), warn: t => avis.push(t), error: t => avis.push(t) } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } };
globalThis.ChatMessage = { implementation: { create: async d => { chat.push(d); return { ...d, update: async () => {}, delete: async () => {} }; } } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups" }, world: { id: "monde" }, packs: new Collection(),
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  i18n: { localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d ?? {})}`, has: () => false }, combats: { active: null }, scenes: { active: null },
  modules: new Map([["lakour-mj-ia", { api: {} }]])
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });
// Une partie des Veillées en cours : les coûts attendent sa fin.
const etat = { partie: "p1", phase: "jour", tour: 2, vainqueur: "" };
game.lakourLoups = { etat: () => structuredClone(etat), villageois: () => [] };

const { MoteurMJ } = await import("../scripts/moteur.js");
const { FournisseurAnthropic } = await import("../scripts/fournisseurs/anthropic.js");
const { modeleCompagnons } = await import("../scripts/fournisseurs/index.js");
const R = await import("../scripts/reglages.js");
const { MODELES_ANTHROPIC, prixDuModele, coutDe } = await import("../scripts/constantes.js");

// Le vrai fournisseur Anthropic, son client doublé : la réponse de l'API avec son usage (snake_case, comme l'API le rend).
const USAGE = { input_tokens: 200000, output_tokens: 10000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0 };
function anthropic(modele, appels) {
  const f = new FournisseurAnthropic({ cle: "sk-essai", modele, effort: "low" });
  const message = { content: [{ type: "text", text: "—" }], stop_reason: "end_turn", usage: USAGE };
  f.client = {
    messages: { create: async p => { appels.push(p.model); return { ...message, content: [{ type: "text", text: "Je n'ai rien vu." }] }; } },
    beta: { messages: { stream: p => { appels.push(p.model); return { on() {}, finalMessage: async () => message }; } } }
  };
  return f;
}

test("prix : les quatre modèles Claude ont leur prix ; l'usage de l'API donne un coût", () => {
  for (const m of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"]) assert.ok(prixDuModele("anthropic", m)?.entree > 0, m);
  // Opus 5.5 : 200 000 × 4 + 50 000 × 0,2 + 10 000 × 20, par million : 1,01 $.
  assert.equal(Math.round(coutDe({ entree: 200000, cacheLecture: 50000, cacheEcriture: 0, sortie: 10000 }, MODELES_ANTHROPIC["claude-opus-5-5"]) * 100) / 100, 1.01);
});

test("un appel du narrateur et un appel d'un compagnon (Anthropic) font monter jetons et coût ; pendant la partie, ils attendent et survivent à un rechargement", async () => {
  reglages.seance = { active: true, debut: 1, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 };
  reglages.coutsEnAttente = {};
  const appels = [];
  const moteur = new MoteurMJ();
  moteur.fournisseur = anthropic("claude-opus-5-5", appels);
  moteur.fil = moteur.fournisseur.nouveauFil();
  moteur.systeme = "Tu es le narrateur.";
  moteur.compagnons.cerveaux.fournisseur = () => anthropic("claude-haiku-5-5", appels);
  await moteur.tour("Le jour se lève.", { outils: [], sauver: false, miseEnPlace: true });
  assert.deepEqual(appels, ["claude-opus-5-5"]);
  const vue = { id: "c1", nom: "Odile", jeu: "loups", personnalite: { temperament: "bavard" }, peutParler: true, autres: [], tour: 2, partie: "p1" };
  const r = await moteur.compagnons.cerveaux.parler(vue);
  assert.equal(r.source, "ia");
  assert.deepEqual(appels, ["claude-opus-5-5", "claude-haiku-5-5"]);
  const p = moteur.couts.seance;
  assert.equal(p.n, 2);
  assert.deepEqual(p.jetons, { entree: 400000, cacheLecture: 100000, cacheEcriture: 0, sortie: 20000 });
  // Opus 1,01 $ + Haiku (200 000 × 0,1 + 50 000 × 0,01 + 10 000 × 0,5) / 1e6 = 0,0255 $.
  assert.equal(Math.round(p.cout * 10000) / 10000, 1.0355);
  // Partie en cours : le réglage monde (livré à tous) n'a pas bougé ; le navigateur du MJ les garde.
  assert.equal(reglages.seance.cout, 0);
  assert.equal(Math.round(reglages.coutsEnAttente.seance.cout * 10000) / 10000, 1.0355);
  // La console les montre (séance écrite + en attente).
  assert.equal(Math.round(moteur.coutDeLaSeance().cout * 10000) / 10000, 1.0355);
  assert.equal(moteur.coutDeLaSeance().jetons.entree, 400000);
  // Un rechargement de la page : un moteur neuf retrouve ce qui attendait.
  const recharge = new MoteurMJ();
  assert.equal(recharge.couts.seance.n, 2);
  assert.equal(Math.round(recharge.couts.seance.cout * 10000) / 10000, 1.0355);
  // La partie finie : tout est écrit d'un coup, et plus rien n'attend.
  etat.phase = "fin";
  await recharge.viderCouts();
  etat.phase = "jour";
  assert.equal(Math.round(reglages.seance.cout * 10000) / 10000, 1.0355);
  assert.equal(reglages.seance.jetons.sortie, 20000);
  assert.deepEqual(reglages.coutsEnAttente, {});
  assert.equal(new MoteurMJ().couts.seance.n, 0);
});

test("le budget compte ce qui attend : au-delà, ni le narrateur ni les compagnons n'appellent le modèle", async () => {
  reglages.seance = { active: true, debut: 1, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 };
  reglages.coutsEnAttente = {};
  reglages.budgetSeance = 2;
  const appels = [];
  const moteur = new MoteurMJ();
  moteur.fournisseur = anthropic("claude-opus-5-5", appels);
  moteur.fil = moteur.fournisseur.nouveauFil();
  moteur.systeme = "x";
  moteur.compagnons.cerveaux.fournisseur = () => anthropic("claude-haiku-5-5", appels);
  for (let i = 0; i < 4; i++) await moteur.tour(`Tour ${i}`, { outils: [], sauver: false, miseEnPlace: true });
  assert.equal(appels.length, 2, "1,01 $ par appel, budget 2 $ : le troisième ne part pas");
  assert.ok(moteur.budgetDepasse());
  assert.ok(avis.some(t => /LAKOUR_MJIA\.Erreurs\.Budget/.test(t)), "le MJ est prévenu (notification, jamais le chat)");
  assert.ok(!chat.some(m => /LAKOUR_MJIA\.Erreurs\.Budget/.test(m.content)), "rien au chat");
  const r = await moteur.compagnons.cerveaux.parler({ id: "c1", nom: "Odile", jeu: "loups", personnalite: { temperament: "bavard" }, peutParler: true, autres: [], tour: 2, partie: "p1" });
  assert.equal(appels.length, 2, "le compagnon non plus");
  assert.equal(r.source, "repli");
  // Un rechargement ne remet pas le budget à zéro.
  assert.ok(new MoteurMJ().budgetDepasse(), "après rechargement, toujours au budget");
  reglages.coutsEnAttente = {};
});

test("modèle des compagnons : une liste (vide = défaut), et un ancien nom écrit à la main migre vers son identifiant", async () => {
  const enregistres = {};
  const avant = game.settings.register;
  game.settings.register = (_m, cle, conf) => { enregistres[cle] = conf; };
  game.settings.registerMenu = () => {};
  try { R.enregistrerReglages?.(); } catch { /* d'autres réglages demandent Foundry : seul modeleCompagnons compte ici */ }
  game.settings.register = avant;
  const conf = enregistres.modeleCompagnons;
  assert.ok(conf?.choices, "une liste de choix");
  assert.equal(conf.default, "");
  for (const m of ["", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "gpt-6-luna"]) assert.ok(m in conf.choices, m);
  // La migration : « Claude Haiku 5.5 » (un nom) -> claude-haiku-5-5 ; un nom inconnu -> vide (le défaut), jamais en silence ailleurs.
  assert.equal(R.identifiantDeModele("Claude Haiku 5.5"), "claude-haiku-5-5");
  assert.equal(R.identifiantDeModele("claude haiku 5.5 (très économique)"), "claude-haiku-5-5");
  assert.equal(R.identifiantDeModele("Claude Opus 5.5"), "claude-opus-5-5");
  assert.equal(R.identifiantDeModele("claude-sonnet-5-5"), "claude-sonnet-5-5");
  assert.equal(R.identifiantDeModele("gpt-6-luna"), "gpt-6-luna");
  assert.equal(R.identifiantDeModele("Mon modèle à moi"), "");
  reglages.modeleCompagnons = "Claude Haiku 5.5";
  await R.migrerModeleCompagnons();
  assert.equal(reglages.modeleCompagnons, "claude-haiku-5-5");
  assert.equal(modeleCompagnons("anthropic"), "claude-haiku-5-5");
  reglages.modeleCompagnons = "";
  assert.equal(modeleCompagnons("anthropic"), "claude-haiku-5-5", "vide : le défaut du fournisseur");
});
