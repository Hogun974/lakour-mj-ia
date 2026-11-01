// Petite doublure de Foundry pour le tour par tour (essais/tour-par-tour.test.mjs) : un MJ, un joueur, une scène à grille,
// des jetons, un Combat qui se comporte comme celui de Foundry (combattants, initiative, ordre, tour suivant, round suivant,
// drapeaux), le chat, des dés réglés d'avance. Le crochet « updateCombat » de Foundry est imité : chaque changement de tour
// appelle tour.surNouveauTour, comme le fait apps/tour-par-tour.js.

export class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
}

let n = 0;
export const nouvelId = () => `Zt${String(++n).padStart(14, "0")}`;
const poser = (o, cle, v) => {
  const parties = cle.split(".");
  const dernier = parties.pop();
  let x = o;
  for (const p of parties) x = x[p] ??= {};
  x[dernier] = v;
};

export const etat = { chat: [], reglages: {}, tour: null, des: { d20: [], d100: [] } };

export function installer({ systeme = "dnd5e" } = {}) {
  etat.chat.length = 0;
  etat.reglages = { jouerPnj: true, seulActifBouge: false, tourDeTable: { actif: false, ordre: [], index: 0, faits: {}, tour: 0 }, compagnonsPrive: {} };
  const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
  const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
  const users = new Collection([["mj", mj], ["u1", joueur]]);
  Object.defineProperty(users, "activeGM", { get: () => mj, configurable: true });
  const messages = new Collection();
  globalThis.foundry = {
    applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
    utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s), getProperty: (o, k) => k.split(".").reduce((x, p) => x?.[p], o) }
  };
  globalThis.Hooks = { on() {}, callAll() {}, once() {} };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.CONFIG = { statusEffects: [{ id: "prone", name: "À terre" }, { id: "poisoned", name: "Empoisonné" }] };
  globalThis.ChatMessage = { implementation: { create: async d => {
    const m = { id: nouvelId(), ...d, getFlag: (s, k) => m.flags?.[s]?.[k] };
    etat.chat.push(m);
    messages.set(m.id, m);
    return m;
  } } };
  globalThis.Roll = class {
    constructor(formule) { this.formula = formule; }
    async evaluate() { this.total = (this.formula === "1d100" ? etat.des.d100.shift() : etat.des.d20.shift()) ?? 50; return this; }
    async toMessage(m) { return ChatMessage.implementation.create({ ...m, rolls: [{ formula: this.formula, total: this.total }] }); }
  };
  globalThis.game = {
    user: mj, users, actors: new Collection(), messages, scenes: { active: null }, combats: null,
    system: { id: systeme }, world: { id: "monde", title: "La Kour" },
    settings: {
      get: (m, k) => {
        if (m === "core") return 0;
        if (!(k in etat.reglages)) throw new Error(`réglage inconnu ${k}`);
        return structuredClone(etat.reglages[k]);
      },
      set: async (_m, k, v) => { etat.reglages[k] = structuredClone(v); }
    },
    i18n: { localize: k => k, format: (k, d) => `${k}${d ? ` ${JSON.stringify(d)}` : ""}`, has: () => false },
    modules: new Map([["lakour-mj-ia", { api: {} }]])
  };
  const combats = [];
  Object.defineProperty(combats, "active", { get: () => combats.find(c => c.active) ?? null });
  game.combats = combats;
  globalThis.Combat = { implementation: { create: async d => { const c = new CombatDouble(d.scene ? game.scenes.get?.(d.scene) ?? scene : scene); combats.push(c); return c; } } };
  globalThis.fromUuidSync = uuid => scene?.tokens.find(t => t.uuid === uuid) ?? game.actors.find(a => a.uuid === uuid) ?? null;
  globalThis.fromUuid = async uuid => globalThis.fromUuidSync(uuid);
  globalThis.canvas = { scene: null };
  scene = null;
  return { mj, joueur };
}

// ------------------------------------------------------------------ scène et jetons
let scene = null;
export function creerScene({ distance = 5, unites = "ft", diagonales = 0 } = {}) {
  const tokens = new Collection();
  scene = { id: nouvelId(), name: "Clairière", grid: { size: 100, distance, units: unites, diagonals: diagonales }, tokens };
  game.scenes.active = scene;
  canvas.scene = scene;
  return scene;
}

export function poserJeton(acteur, x, y, { disposition = -1, cache = false } = {}) {
  const t = {
    id: nouvelId(), name: acteur.name, x: x * 100, y: y * 100, width: 1, height: 1, disposition, hidden: cache, actor: acteur, actorId: acteur.id,
    parent: scene, movementHistory: [], texture: { src: acteur.img }, getFlag: () => undefined,
    async update(c) { Object.assign(this, c); return this; }
  };
  t.uuid = `Scene.${scene.id}.Token.${t.id}`;
  scene.tokens.set(t.id, t);
  return t;
}

export function acteur(d) {
  const a = { id: nouvelId(), img: "x.webp", type: "npc", items: new Collection(), statuses: new Set(), flags: {}, hasPlayerOwner: false,
    ownership: {}, get uuid() { return `Actor.${this.id}`; }, testUserPermission(u) { return Boolean(u?.isGM) || (this.hasPlayerOwner && u?.id === "u1"); }, ...d };
  game.actors.set(a.id, a);
  return a;
}

// ------------------------------------------------------------------ le Combat
export class CombatDouble {
  constructor(sc) {
    this.id = nouvelId();
    this.scene = sc;
    this.sceneId = sc?.id;
    this.active = true;
    this.started = false;
    this.round = 0;
    this.turn = null;
    this.flags = {};
    this.combatants = new Collection();
    this.fin = false;
  }
  get turns() {
    return this.combatants.contents.sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || a.name.localeCompare(b.name));
  }
  get combatant() { return this.started ? this.turns[this.turn] ?? null : null; }
  async update(c) {
    for (const [k, v] of Object.entries(c)) poser(this, k, v);
    return this;
  }
  async createEmbeddedDocuments(_t, liste) {
    for (const d of liste) {
      const token = this.scene.tokens.get(d.tokenId);
      const c = { id: nouvelId(), tokenId: d.tokenId, actorId: d.actorId, token, actor: token.actor, name: token.name, initiative: null, hidden: Boolean(d.hidden), isDefeated: false, img: token.actor.img };
      this.combatants.set(c.id, c);
    }
  }
  async rollAll() {
    for (const c of this.combatants) if (c.initiative === null) c.initiative = c.actor.init ?? 10;
  }
  async startCombat() {
    this.started = true;
    this.round = 1;
    this.turn = 0;
    await etat.tour?.surNouveauTour(this);
  }
  async nextTurn() {
    if (this.turn + 1 >= this.turns.length) { this.round += 1; this.turn = 0; } else this.turn += 1;
    await etat.tour?.surNouveauTour(this);
  }
  async endCombat() { this.active = false; this.started = false; this.fin = true; }
}

export const attendre = async (fois = 10) => { for (let i = 0; i < fois; i++) await new Promise(r => setTimeout(r, 1)); };
