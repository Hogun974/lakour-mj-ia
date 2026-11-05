// Compagnons IA en Warhammer 40k (Imperium Maledictum) et en Warcraft (D&D 5e), hors de Foundry : outils compagnon_ajouter,
// compagnon_retirer, compagnons ; ce que voit un compagnon (jamais un jeton caché, un chuchotement, le message privé d'un
// autre) ; un tour de combat (il déclare, le MJ IA résout avec les vrais jets de SA fiche, sans fenêtre) ; le moteur :
// les compagnons réagissent après le MJ, au plus le bavardage réglé, jamais en boucle entre eux ; coût et budget partagés.
// Aucun appel payant : fournisseurs doublures.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ doublure de Foundry
class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const appliquer = (cible, changements) => {
  for (const [k, v] of Object.entries(changements)) {
    const parties = k.split(".");
    const dernier = parties.pop();
    let o = cible;
    for (const p of parties) o = o[p] ??= {};
    o[dernier] = structuredClone(v);
  }
};
let n = 0;
const id = () => `Zq${String(++n).padStart(14, "0")}`;

const reglages = {
  miseEnPlace: false, voix: "aucune", budgetSeance: 0, delaiReponse: 0, bavardageCompagnons: "normal", fournisseur: "anthropic",
  modeleAnthropic: "claude-opus-5-5", modeleOpenAI: "gpt-6.1-sol", modeleCompagnons: "", cleAnthropic: "", personnaliteActive: "p",
  personnalites: [{ id: "p", nom: "Essai", nomAffiche: "Le Conteur" }], jouerPnj: true, compagnonsPrive: {},
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
const crochets = new Map();
let moteurEnEcoute = null;
function document(d) {
  const m = { ...structuredClone(d), getFlag: (s, k) => m.flags?.[s]?.[k], update: async u => Object.assign(m, u), delete: async () => {} };
  return m;
}
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: {
    deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => id(),
    setProperty: (o, k, v) => appliquer(o, { [k]: v }), getProperty: (o, k) => k.split(".").reduce((x, p) => x?.[p], o)
  }
};
globalThis.DOMParser = class {
  parseFromString(html) {
    const texte = String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return { querySelectorAll: () => [], body: { textContent: texte } };
  }
};
globalThis.Hooks = { on: (nom, fn) => crochets.set(nom, [...(crochets.get(nom) ?? []), fn]), callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 }, TOKEN_DISPOSITIONS: { FRIENDLY: 1, HOSTILE: -1 } };
globalThis.ChatMessage = { implementation: { create: async d => {
  // Comme Foundry (DocumentAuthorField) : l'auteur est l'utilisateur qui crée le message, sauf s'il est donné.
  const m = document({ author: game.user, ...d });
  chat.push(m);
  // Ce que fait le hook createChatMessage du MJ IA : chaque message est proposé au moteur.
  if (moteurEnEcoute) setImmediate(() => moteurEnEcoute.recevoir(m));
  return m;
} } };
const jets = [];
globalThis.Roll = class {
  constructor(formule) { this.formula = formule; }
  async evaluate() { this.total = Roll.prochain.shift() ?? 50; return this; }
  async toMessage(m) { jets.push({ formule: this.formula, total: this.total, ...m }); }
};
Roll.prochain = [];
Roll.validate = () => true;
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "impmal", title: "Imperium Maledictum", version: "1" }, world: { id: "monde", title: "La Kour" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); }, settings: new Map() },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });
globalThis.canvas = { scene: null, level: null };

function acteur({ rollSkill, rollSavingThrow, ...d }) {
  const a = {
    id: id(), type: "character", items: [], flags: {}, img: "x.webp", hasPlayerOwner: false, prototypeToken: {}, ...structuredClone(d), rollSkill, rollSavingThrow,
    async update(c) { appliquer(this, c); return this; },
    async unsetFlag(s, k) { delete this.flags[s]?.[k]; },
    async getTokenDocument(donnees) { return { toObject: () => ({ ...donnees, name: this.name, actorId: this.id }) }; },
    testUserPermission: () => false
  };
  game.actors.set(a.id, a);
  return a;
}

// Une scène minimale : grille de 100 px, jetons posés.
function scene(jetons = []) {
  const tokens = new Collection();
  const s = {
    id: id(), name: "Ruche basse", navName: "", flags: {}, grid: { size: 100 }, initialLevel: { id: "niv" },
    dimensions: { sceneX: 0, sceneY: 0, sceneWidth: 2000, sceneHeight: 2000 }, drawings: { contents: [] }, tokens,
    async createEmbeddedDocuments(_t, liste) {
      for (const d of liste) {
        const t = { id: id(), width: 1, height: 1, hidden: false, ...d, actor: game.actors.get(d.actorId), getFlag: () => undefined };
        tokens.set(t.id, t);
      }
    },
    async deleteEmbeddedDocuments(_t, ids) { for (const i of ids) tokens.delete(i); }
  };
  for (const j of jetons) {
    const t = { id: id(), width: 1, height: 1, hidden: false, getFlag: () => undefined, ...j };
    tokens.set(t.id, t);
  }
  return s;
}

const { MoteurMJ } = await import("../scripts/moteur.js");
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { brancherReactions } = await import("../scripts/reactions.js");
const J = await import("../scripts/compagnons-jeu.js");
const { contexteCompagnon } = await import("../scripts/compagnons.js");
const { decrireMessage, CONSIGNE_COMPAGNONS } = await import("../scripts/contexte.js");
const outil = nom => OUTILS.find(o => o.nom === nom);
const attendre = async (fois = 20) => { for (let i = 0; i < fois; i++) await new Promise(r => setTimeout(r, 5)); };

// Un fournisseur doublure pour les compagnons : répond toujours, note ce qu'il reçoit.
function fournisseurCompagnon(texte = "Je vous suis, mais je n'aime pas cet endroit.") {
  const recu = [];
  return { nom: "anthropic", recu, async envoyerCourt(c) { recu.push(c); return { texte, usage: { entree: 900, cacheLecture: 0, cacheEcriture: 0, sortie: 30 }, arret: "fin" }; } };
}

const ilsa = acteur({ name: "Sœur Ilsa", flags: { "lakour-mj-ia": { compagnon: { temperament: "loyal", parler: "phrases courtes et sèches", histoire: "Ancienne hospitalière." } } },
  system: { characteristics: { bs: { total: 41 }, ws: { total: 35 }, ag: { total: 38 }, per: { total: 33 } }, skills: { ranged: { advances: 2, characteristic: "bs" }, awareness: { advances: 0 } } } });
const varn = acteur({ name: "Varn le Taciturne", flags: { "lakour-mj-ia": { compagnon: { temperament: "taciturne", parler: "", histoire: "" } } }, system: { characteristics: { ws: { total: 40 } }, skills: {} } });
const pj = acteur({ name: "Brin", hasPlayerOwner: true, system: { characteristics: {}, skills: {} } });

// ------------------------------------------------------------------ outils
test("outils : compagnon_ajouter, compagnon_retirer et jet_compagnon en 40k et en Warcraft ; compagnons partout", () => {
  const noms = s => new Set(outilsDuSysteme(s).map(o => o.nom));
  for (const s of ["impmal", "dnd5e"]) for (const o of ["compagnon_ajouter", "compagnon_retirer", "compagnons", "jet_compagnon"]) assert.ok(noms(s).has(o), `${s} : ${o}`);
  assert.ok(noms("lakour-loups").has("compagnons") && !noms("lakour-loups").has("compagnon_ajouter"), "aux Veillées, les compagnons viennent de loups_distribuer");
  assert.ok(outil("compagnon_ajouter").sensible && outil("compagnon_retirer").sensible, "le MJ humain valide en mode validation");
  assert.match(CONSIGNE_COMPAGNONS, /Ne lui souffle JAMAIS un secret/);
  assert.match(CONSIGNE_COMPAGNONS, /jet_compagnon/);
});

test("compagnon_ajouter : fiche existante sans joueur, personnalité, jeton posé près du groupe ; une fiche de joueur est refusée", async () => {
  canvas.scene = scene([{ name: "Brin", x: 500, y: 500, actor: pj }]);
  const recrue = acteur({ name: "Kael Durn", system: { characteristics: {}, skills: {} } });
  const r = await outil("compagnon_ajouter").executer({ nom: "Kael Durn", creation: "", fiche_existante: "Kael Durn", temperament: "farceur",
    facon_de_parler: "", histoire: "Contrebandier qui doit une vie à Brin.", pres_de: "" });
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /Kael Durn rejoint le groupe comme compagnon IA \(farceur\)\. Jeton posé, case \d+,\d+\./);
  assert.ok(J.estCompagnon(recrue));
  assert.equal(recrue.flags["lakour-mj-ia"].compagnon.histoire, "Contrebandier qui doit une vie à Brin.");
  assert.ok(recrue.flags["lakour-mj-ia"].compagnon.parler, "façon de parler tirée au hasard");
  const jeton = canvas.scene.tokens.find(t => t.actor === recrue);
  assert.ok(jeton && Math.abs(jeton.x - 500) <= 300 && Math.abs(jeton.y - 500) <= 300, "près du groupe");
  assert.ok(!(jeton.x === 500 && jeton.y === 500), "pas sur la case d'un autre");
  const refus = await outil("compagnon_ajouter").executer({ nom: "Brin", creation: "", fiche_existante: "Brin", temperament: "loyal", facon_de_parler: "", histoire: "", pres_de: "" });
  assert.ok(refus.erreur && /fiche d'un joueur/.test(refus.contenu));
  assert.ok((await outil("compagnon_ajouter").executer({ nom: "X", creation: "", fiche_existante: "", temperament: "loyal", facon_de_parler: "", histoire: "", pres_de: "" })).erreur);
  canvas.scene = null;
});

test("compagnon_ajouter : la création passe par l'outil de création du système, arguments vérifiés avant de rien créer", async () => {
  let crees = 0;
  globalThis.Actor = { implementation: { create: async () => { crees++; } } };
  const base = { nom: "Nox", fiche_existante: "", temperament: "prudent", facon_de_parler: "", histoire: "", pres_de: "" };
  assert.match((await outil("compagnon_ajouter").executer({ ...base, creation: "{pas du json" })).contenu, /pas du JSON valide/);
  const mal = await outil("compagnon_ajouter").executer({ ...base, creation: JSON.stringify({ tirages: {} }) });
  assert.ok(mal.erreur);
  assert.match(mal.contenu, /Arguments de creer_personnage invalides, rien n'a été créé : .*origine_uuid : champ manquant/);
  assert.equal(crees, 0);
});

test("compagnons : la liste (fiche, tempérament, présent ou non) ; compagnon_retirer en PNJ puis en départ", async () => {
  const liste = await outil("compagnons").executer({});
  assert.match(liste.contenu, /Sœur Ilsa .* — loyal, phrases courtes et sèches ; Ancienne hospitalière\. — présent/);
  const temp = acteur({ name: "Garde Molk", flags: { "lakour-mj-ia": { compagnon: { temperament: "impulsif" } } }, system: { characteristics: {}, skills: {} } });
  await J.noterPrive(temp.id, "Le meneur te dit en privé : CANARI");
  const r = await outil("compagnon_retirer").executer({ compagnon: "Garde Molk", mode: "pnj" });
  assert.match(r.contenu, /devenu|désormais un PNJ/);
  assert.equal(J.estCompagnon(temp), false);
  assert.deepEqual(J.privesDe(temp.id), [], "il oublie ce qu'il savait en privé");
  canvas.scene = scene([{ name: "Garde Molk 2", x: 0, y: 0, actor: null }]);
  const autre = acteur({ name: "Garde Pell", flags: { "lakour-mj-ia": { compagnon: { temperament: "loyal" } } }, system: { characteristics: {}, skills: {} } });
  await canvas.scene.createEmbeddedDocuments("Token", [{ x: 100, y: 100, actorId: autre.id, name: "Garde Pell" }]);
  assert.match((await outil("compagnon_retirer").executer({ compagnon: "Garde Pell", mode: "depart" })).contenu, /quitte le groupe \(jeton retiré de la carte\)/);
  assert.ok(!canvas.scene.tokens.some(t => t.actor === autre));
  assert.ok((await outil("compagnon_retirer").executer({ compagnon: "Personne", mode: "pnj" })).erreur);
  canvas.scene = null;
});

// ------------------------------------------------------------------ ce que voit un compagnon
test("vue d'un compagnon : sa fiche, le chat public, les jetons visibles ; jamais un jeton caché, un chuchotement ni le message privé d'un autre", async () => {
  game.scenes.active = scene([
    { name: "Sœur Ilsa", x: 0, y: 0, actor: ilsa }, { name: "Varn le Taciturne", x: 100, y: 0, actor: varn }, { name: "Brin", x: 200, y: 0, actor: pj },
    { name: "Cultiste", x: 500, y: 0, actor: null, disposition: -1 }, { name: "Assassin CANARI-CACHE", x: 600, y: 0, actor: null, hidden: true }
  ]);
  chat.length = 0;
  await ChatMessage.implementation.create({ content: "<p>On avance vers la chapelle.</p>", speaker: { alias: "Brin" }, author: joueur });
  await ChatMessage.implementation.create({ content: "<p>CANARI-CHUCHOTE : je trahirai le groupe.</p>", speaker: { alias: "Brin" }, whisper: ["mj"] });
  const r = await outil("message_prive").executer({ joueur: "Sœur Ilsa", texte: "CANARI-PRIVE-ILSA : tu reconnais l'odeur du warp." });
  assert.match(r.contenu, /gardé par le compagnon Sœur Ilsa/);
  assert.equal(chat.length, 2, "un message privé à un compagnon ne paraît pas au chat");
  const texte = v => { const c = contexteCompagnon(v); return `${c.systeme}\n${c.texte}`; };
  const vueIlsa = texte(J.vueAventure(ilsa));
  const vueVarn = texte(J.vueAventure(varn));
  assert.match(vueIlsa, /Tu joues Sœur Ilsa/);
  assert.match(vueIlsa, /Brin : On avance vers la chapelle\./);
  assert.match(vueIlsa, /Cultiste \(hostile\)/);
  assert.match(vueIlsa, /Varn le Taciturne \(compagnon\)/);
  assert.match(vueIlsa, /CANARI-PRIVE-ILSA/, "son message privé");
  for (const v of [vueIlsa, vueVarn]) {
    assert.ok(!v.includes("CANARI-CACHE"), "un jeton caché");
    assert.ok(!v.includes("CANARI-CHUCHOTE"), "un chuchotement");
  }
  assert.ok(!vueVarn.includes("CANARI-PRIVE-ILSA"), "le message privé d'un autre compagnon");
  assert.ok(!vueIlsa.includes("Mémoire de campagne") && !vueIlsa.includes("Tu es le meneur de jeu"), "rien du prompt du MJ");
  game.scenes.active = null;
  chat.length = 0;
});

test("le MJ lit une réplique de compagnon comme celle d'un joueur, marquée « compagnon IA »", () => {
  const m = document({ content: "<p>Je couvre l'entrée.</p>", speaker: { alias: "Sœur Ilsa" }, author: mj, flags: { "lakour-mj-ia": { compagnon: ilsa.id } } });
  assert.equal(decrireMessage(m), "Sœur Ilsa (compagnon IA) : Je couvre l'entrée.");
});

// ------------------------------------------------------------------ moteur : rythme et pas de boucle
function moteurEssai({ texte } = {}) {
  const moteur = new MoteurMJ();
  const tours = [];
  moteur.tour = async entree => { tours.push(entree); };
  const f = fournisseurCompagnon(texte);
  moteur.compagnons.cerveaux.fournisseur = () => f;
  moteurEnEcoute = moteur;
  return { moteur, tours, f };
}

test("moteur : après la réponse du MJ, au plus N compagnons réagissent (un chacun) ; leurs répliques reviennent au MJ ; jamais de boucle", async () => {
  reglages.bavardageCompagnons = "normal";
  chat.length = 0;
  const { moteur, tours, f } = moteurEssai();
  const k1 = acteur({ name: "Compagnon Un", flags: { "lakour-mj-ia": { compagnon: { temperament: "bavard" } } }, system: { characteristics: {}, skills: {} } });
  moteur.signaler("Brin (joué par Jordan) : On entre dans la taverne.", { source: "humain" });
  await attendre();
  assert.equal(tours.length, 2, "le MJ répond au joueur, puis aux répliques des compagnons, puis s'arrête");
  const repliques = chat.filter(m => m.flags?.["lakour-mj-ia"]?.compagnon);
  assert.equal(repliques.length, 2, "bavardage normal : 2 répliques");
  assert.equal(new Set(repliques.map(m => m.flags["lakour-mj-ia"].compagnon)).size, 2, "un compagnon ne parle qu'une fois");
  assert.match(tours[1], /\(compagnon IA\) : Je vous suis/, "leurs répliques entrent dans la file comme des messages de joueurs");
  assert.equal(f.recu.length, 2, "un appel au modèle des compagnons par réplique");
  // Un nouveau message humain relance un tour de parole ; ceux qui n'avaient pas parlé passent d'abord.
  moteur.signaler("Brin (joué par Jordan) : Je commande à boire.", { source: "humain" });
  await attendre();
  assert.equal(tours.length, 4);
  const orateurs = chat.filter(m => m.flags?.["lakour-mj-ia"]?.compagnon).map(m => m.flags["lakour-mj-ia"].compagnon);
  const [premiere, deuxieme] = [orateurs.slice(0, 2), orateurs.slice(2, 4)];
  assert.equal(deuxieme.length, 2);
  assert.ok(premiere.includes(k1.id), "premier tour de parole : par ordre alphabétique");
  assert.ok(!deuxieme.some(x => premiere.includes(x)), "rotation de la parole : ceux qui n'ont pas encore parlé d'abord");
  // Un événement du plateau (sans humain) : une seule vague de réactions, puis plus rien.
  moteur.signaler("🚪 Brin ouvre une porte.");
  await attendre();
  assert.equal(tours.length, 6);
  await attendre();
  assert.equal(tours.length, 6, "toujours pas de boucle");
  game.actors.delete(k1.id);
  moteurEnEcoute = null;
});

test("moteur : bavardage silencieux ou bavard ; pas de bavardage en plein combat ; une réplique « — » ne s'affiche pas", async () => {
  chat.length = 0;
  reglages.bavardageCompagnons = "silencieux";
  let essai = moteurEssai();
  essai.moteur.signaler("Brin : Bonjour.", { source: "humain" });
  await attendre();
  assert.deepEqual([essai.tours.length, chat.length], [1, 0]);
  reglages.bavardageCompagnons = "bavard";
  game.combats.active = { started: true, round: 1, turns: [] };
  essai = moteurEssai();
  essai.moteur.signaler("Brin : Je tire.", { source: "humain" });
  await attendre();
  assert.deepEqual([essai.tours.length, chat.length], [1, 0], "en combat, ils agissent à leur tour, pas en bavardant");
  game.combats.active = null;
  essai = moteurEssai({ texte: "—" });
  essai.moteur.signaler("Brin : Quelqu'un a une idée ?", { source: "humain" });
  await attendre();
  assert.deepEqual([essai.tours.length, chat.length], [1, 0], "rien à dire : rien ne paraît");
  reglages.bavardageCompagnons = "normal";
  moteurEnEcoute = null;
});

test("coût : les appels des compagnons comptent au prix de leur modèle, dans le même compteur et le même budget que le MJ", async () => {
  reglages.seance = { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 };
  const moteur = new MoteurMJ();
  await moteur.compter({ entree: 1e6, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, "claude-haiku-5-5");
  assert.equal(reglages.seance.cout, 0.1, "Claude Haiku 5.5 : 0,10 $ le million de jetons d'entrée");
  await moteur.compter({ entree: 1e6, cacheLecture: 0, cacheEcriture: 0, sortie: 0 });
  assert.equal(reglages.seance.cout, 4.1, "sans modèle précisé : celui du MJ (Opus 5.5)");
  assert.equal(reglages.seance.jetons.entree, 2e6, "un seul compteur");
  // Budget atteint : les compagnons passent au repli, sans appel.
  reglages.budgetSeance = 4;
  const f = fournisseurCompagnon();
  moteur.compagnons.cerveaux.fournisseur = () => f;
  const d = await moteur.compagnons.cerveaux.decider(J.vueAventure(ilsa), { type: "option", question: "On y va ?", options: ["Oui", "Non"], cle: "b" });
  assert.equal(d.source, "repli");
  assert.equal(f.recu.length, 0);
  reglages.budgetSeance = 0;
  // Le modèle des compagnons : Haiku 5.5 par défaut chez Anthropic, celui du réglage s'il est connu.
  const { modeleCompagnons } = await import("../scripts/fournisseurs/index.js");
  assert.equal(modeleCompagnons("anthropic"), "claude-haiku-5-5");
  reglages.modeleCompagnons = "claude-sonnet-5-5";
  assert.equal(modeleCompagnons("anthropic"), "claude-sonnet-5-5");
  reglages.modeleCompagnons = "inconnu-9";
  assert.equal(modeleCompagnons("anthropic"), "claude-haiku-5-5", "un modèle inconnu d'Anthropic retombe sur Haiku");
  reglages.modeleCompagnons = "";
  assert.equal(modeleCompagnons("openai"), "gpt-6-luna");
});

// ------------------------------------------------------------------ combat
function combatAvec(combattant) {
  const combat = { started: true, round: 2, combatant: combattant, turns: [combattant, { name: "Cultiste" }], tours: 0, async nextTurn() { this.tours++; }, async nextRound() {} };
  game.combats.active = combat;
  return combat;
}

test("combat en 40k : au tour du compagnon, il déclare son action ; le MJ IA la résout avec le vrai d100 de SA fiche, sans fenêtre", async () => {
  game.system.id = "impmal";
  chat.length = 0; jets.length = 0;
  const signaux = [];
  const moteur = new MoteurMJ();
  moteur.signaler = (texte, options) => signaux.push({ texte, options });
  const f = fournisseurCompagnon("Je tire sur le cultiste le plus proche, à couvert derrière la colonne.");
  moteur.compagnons.cerveaux.fournisseur = () => f;
  crochets.clear();
  brancherReactions(moteur);
  const combat = combatAvec({ name: "Sœur Ilsa", actor: ilsa, token: null, defeated: false });
  for (const fn of crochets.get("updateCombat")) fn(combat, { turn: 1 });
  await attendre(5);
  const declaration = chat.find(m => m.flags?.["lakour-mj-ia"]?.compagnon === ilsa.id);
  assert.ok(declaration, "la déclaration paraît au chat sous son nom");
  assert.equal(declaration.speaker.alias, "Sœur Ilsa");
  assert.equal(declaration.flags["lakour-mj-ia"].ia, true, "déjà transmise au moteur : il ne la reçoit pas une seconde fois");
  assert.equal(signaux.length, 1);
  assert.match(signaux[0].texte, /c'est au tour de Sœur Ilsa, compagnon IA\. Il déclare : « Je tire sur le cultiste le plus proche/);
  assert.match(signaux[0].texte, /jet_compagnon/);
  assert.deepEqual(signaux[0].options, { immediat: true, source: "compagnon" });
  assert.match(f.recu[0].texte, /C'est ton tour de combat/);
  assert.match(f.recu[0].texte, /Combat : round 2, tour de Sœur Ilsa/);
  // Le MJ IA résout : CT 41 + 2 avances × 5 = 51 ; difficulté exigeante (+0) ; d100 = 37 → réussite, 5 - 3 = 2 DR.
  Roll.prochain = [37];
  const r = await outil("jet_compagnon").executer({ compagnon: "Sœur Ilsa", competence: "ranged", difficulte: "exigeante", modificateur: 0, raison: "tir sur le cultiste" });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(r.contenu, "Sœur Ilsa, tir sur le cultiste : 37 pour 51 — réussite (+2 DR).");
  assert.equal(jets[0].formule, "1d100");
  assert.match(jets[0].flavor, /réussite/);
  // demander_jet sur un compagnon : pas de carte à cliquer, le jet part directement.
  Roll.prochain = [97];
  const d = await outil("demander_jet").executer({ personnage: "Sœur Ilsa", competence: "awareness", difficulte: "facile", modificateur: 0, dr_bonus: 0, avantages: 0, desavantages: 0, raison: "repérer l'embuscade" });
  assert.match(d.contenu, /compagnon IA : jet lancé directement\. Sœur Ilsa, repérer l'embuscade : 97 pour 73 — échec/, "96 à 100 échouent toujours");
  assert.ok(!chat.some(m => String(m.content).includes("data-lakour-jet")), "aucune fenêtre de joueur");
  await outil("passer_tour").executer({ round: false });
  assert.equal(combat.tours, 1, "puis le tour passe");
  // Un compagnon vaincu ne joue pas.
  signaux.length = 0;
  for (const fn of crochets.get("updateCombat")) fn(combatAvec({ name: "Sœur Ilsa", actor: ilsa, token: null, defeated: true }), { turn: 2 });
  await attendre(5);
  assert.ok(!signaux.some(s => /compagnon IA/.test(s.texte)));
  game.combats.active = null;
});

test("combat en Warcraft (D&D 5e) : le compagnon déclare, le MJ IA lance le jet du système sans fenêtre (configure: false)", async () => {
  game.system.id = "dnd5e";
  chat.length = 0;
  const appels = [];
  const thrall = acteur({ name: "Grosh", flags: { "lakour-mj-ia": { compagnon: { temperament: "impulsif", parler: "franc-parler, sans détour" } } },
    system: { attributes: { hp: { value: 12, max: 12 }, ac: { value: 16 } }, abilities: { str: { value: 16 } } },
    rollSkill: async (config, dialogue) => { appels.push(["skill", config, dialogue]); return [{ total: 17 }]; },
    rollSavingThrow: async (config, dialogue) => { appels.push(["sauv", config, dialogue]); return [{ total: 6 }]; } });
  const signaux = [];
  const moteur = new MoteurMJ();
  moteur.signaler = (texte, options) => signaux.push({ texte, options });
  moteur.compagnons.cerveaux.fournisseur = () => null;   // sans clé : repli, il déclare quand même
  crochets.clear();
  brancherReactions(moteur);
  const combat = combatAvec({ name: "Grosh", actor: thrall, token: null, defeated: false });
  for (const fn of crochets.get("updateCombat")) fn(combat, { turn: 0, round: 3 });
  await attendre(5);
  assert.equal(signaux.length, 1);
  assert.match(signaux[0].texte, /c'est au tour de Grosh, compagnon IA\. Il déclare : « .+ »/);
  assert.ok(chat.some(m => m.flags?.["lakour-mj-ia"]?.compagnon === thrall.id));
  const r = await outil("jet_compagnon").executer({ compagnon: "Grosh", competence: "ath", difficulte: "exigeante", modificateur: 0, raison: "renverser l'orc" });
  assert.equal(r.contenu, "Grosh, renverser l'orc : 17 contre DD 15 — réussite.");
  assert.deepEqual(appels[0], ["skill", { target: 15, advantage: false, disadvantage: false, skill: "ath" }, { configure: false }]);
  const s = await outil("jet_compagnon").executer({ compagnon: "Grosh", competence: "sauv:con", difficulte: "difficile", modificateur: 2, raison: "résister au poison" });
  assert.match(s.contenu, /6 contre DD 20 — échec/);
  assert.deepEqual(appels[1][2], { configure: false });
  assert.deepEqual(appels[1][1].rolls, [{ parts: ["@situational"], data: { situational: 2 } }]);
  assert.ok((await outil("jet_compagnon").executer({ compagnon: "Personne", competence: "ath", difficulte: "aucune", modificateur: 0, raison: "" })).erreur);
  game.combats.active = null;
  game.system.id = "impmal";
});
