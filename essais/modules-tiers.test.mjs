// Outils liés aux modules tiers (scripts/outils.js) : animation (Sequencer + JB2A gratuit), meteo (FXMaster), calendrier
// (Calendaria), butin (Item Piles). Doublures minimales calquées sur le code de ces modules (Sequencer 4.3.0, JB2A 0.9.4,
// FXMaster 8.4.2, Calendaria 1.4.8, Item Piles 3.3.4) : appels conformes, outil absent de la liste ou refus si un module manque,
// noms JB2A présents dans la vraie base, consignes du prompt par module actif. Chaque règle est rejouée sur des copies mutées
// du moteur.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../", import.meta.url));

// ---------------------------------------------------------------- Données réelles des modules
// Base Sequencer de JB2A gratuit 0.9.4, aplatie, avec la présence de chaque fichier dans le module installé.
const BASE_JB2A = readFileSync(new URL("./donnees/jb2a-gratuit-0.9.4.tsv", import.meta.url), "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#")).map(l => { const [nom, fichier, present] = l.split("\t"); return { nom, fichier, present: present === "1" }; });
// Préréglages de FXMaster 8.4.2 qui ont une variante gratuite (const Vn de fxmaster.js) et types de particules enregistrés.
const PRESETS_FXMASTER = ["acid-rain", "autumn-leaves", "blizzard", "blood-rain", "cloudy", "drizzle", "fog", "hail", "heat-wave",
  "hurricane", "ice-storm", "mist", "monsoon", "nullfront", "overcast", "partly-cloudy", "rain", "rolling-fog", "sleet", "snow",
  "spore-cloud", "sunshower", "thunderstorm", "wildfire-smoke"];
const PARTICULES_FXMASTER = ["bats", "birds", "crows", "eagles", "rats", "spiders", "bubbles", "embers", "stars", "autumnleaves",
  "clouds", "fog", "rain", "hail", "snow", "snowstorm"];
const NIVEAUX_FXMASTER = { "very-low": 0, low: 0.5, medium: 1, high: 1.5, "very-high": 2 };
// Préréglages météo intégrés à Calendaria 1.4.8 (const P de calendaria.mjs).
const METEOS_CALENDARIA = ["clear", "partly-cloudy", "cloudy", "overcast", "drizzle", "rain", "fog", "mist", "windy", "sunshower",
  "snow", "sleet", "heat-wave", "thunderstorm", "blizzard", "hail", "tornado", "hurricane", "ice-storm", "monsoon", "ashfall",
  "sandstorm", "luminous-sky", "sakura-bloom", "autumn-leaves", "rolling-fog", "wildfire-smoke", "dust-devil", "black-sun", "ley-surge",
  "aether-haze", "nullfront", "permafrost-surge", "gravewind", "veilfall", "arcane-winds", "acid-rain", "blood-rain", "meteor-shower",
  "spore-cloud", "divine-light", "plague-miasma"];
const TOUS_MODULES = ["sequencer", "JB2A_DnD5e", "fxmaster", "calendaria", "item-piles", "autoanimations"];

// ---------------------------------------------------------------- Doublures de Foundry
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => s } };

class TokenDocument {
  constructor({ id, name, x, y, actor = null, flags = {} }) {
    Object.assign(this, { id, name, x, y, actor, flags, width: 1, height: 1, documentName: "Token", items: [], argent: "" });
  }
  get uuid() { return `Scene.s1.Token.${this.id}`; }
  getFlag(portee, cle) { return this.flags?.[portee]?.[cle]; }
}
globalThis.TokenDocument = TokenDocument;
class Jetons extends Array { get contents() { return [...this]; } }

const OBJETS = {
  "Compendium.lakour.objets.Item.epee": { documentName: "Item", pack: "lakour.objets", name: "Épée longue", type: "weapon", system: { quantity: 1 } },
  "Item.potion": { documentName: "Item", name: "Potion de soins", type: "consumable", system: { quantity: 1 }, toObject() { return structuredClone({ ...this, toObject: undefined }); } }
};

let scene, etat;
function installer({ modules = TOUS_MODULES, systeme = "dnd5e" } = {}) {
  scene = {
    id: "s1", name: "Clairière", grid: { size: 100, distance: 5 }, flags: {},
    dimensions: { sceneX: 0, sceneY: 0, sceneWidth: 1000, sceneHeight: 800 },
    drawings: { contents: [] },
    tokens: Jetons.from([
      new TokenDocument({ id: "brin", name: "Brin", x: 100, y: 100, actor: { name: "Brin", hasPlayerOwner: true } }),
      new TokenDocument({ id: "gob", name: "Gobelin", x: 400, y: 300, actor: { name: "Gobelin", hasPlayerOwner: false } }),
      new TokenDocument({ id: "mira", name: "Mère Gruss", x: 600, y: 300, actor: { name: "Mère Gruss", hasPlayerOwner: false } })
    ])
  };
  etat = { sequences: [], fx: null, cal: null, piles: [] };
  const actifs = new Set(modules);
  globalThis.game = {
    system: { id: systeme },
    modules: { get: id => (TOUS_MODULES.includes(id) ? { id, active: actifs.has(id), api: id === "fxmaster" ? fxmaster().api : undefined } : undefined) },
    users: [{ id: "mj", isGM: true, active: true }, { id: "j1", name: "Jordan", isGM: false, active: true }, { id: "j2", name: "Lou", isGM: false, active: false }],
    i18n: { localize: k => ({ "CALENDARIA.Season.Winter": "Hiver", "CALENDARIA.MoonPhase.FullMoon": "Pleine lune" }[k] ?? k) },
    items: { fromCompendium: d => structuredClone({ name: d.name, type: d.type, system: d.system, _id: "x" }) },
    scenes: { active: null },
    itempiles: { API: itemPiles() }
  };
  game.scenes.active = scene;
  globalThis.canvas = { scene };
  globalThis.fromUuid = async uuid => OBJETS[uuid] ?? scene.tokens.find(t => t.uuid === uuid) ?? null;
  globalThis.CALENDARIA = { api: calendaria() };
  installerSequencer();
}

// Sequencer 4.3.0 : window.Sequence (sections d'effet aux méthodes qui vérifient leurs arguments) et Sequencer.Database
// (entryExists : une entrée aplatie qui commence par le nom donné, sans l'indice final « [n] »).
function installerSequencer() {
  class EffectSection {
    constructor(fichier) { this.appels = fichier ? [["file", fichier]] : []; }
    file(f) { if (typeof f !== "string" && !Array.isArray(f)) throw new Error("file"); this.appels.push(["file", f]); return this; }
    atLocation(lieu, options = {}) {
      if (!lieu || !(typeof lieu === "object" || typeof lieu === "string")) throw new Error("atLocation | inLocation is invalid");
      this.appels.push(["atLocation", lieu, options]); return this;
    }
    stretchTo(lieu, options = {}) { if (!lieu || typeof lieu !== "object") throw new Error("stretchTo"); this.appels.push(["stretchTo", lieu, options]); return this; }
    scaleToObject(echelle = 1, options = {}) { if (!Number.isFinite(echelle)) throw new Error("scaleToObject"); this.appels.push(["scaleToObject", echelle, options]); return this; }
    size(taille, options = {}) {
      if (!Number.isFinite(taille) && typeof taille !== "object") throw new Error("size");
      if (options.gridUnits !== undefined && typeof options.gridUnits !== "boolean") throw new Error("size | gridUnits");
      this.appels.push(["size", taille, options]); return this;
    }
    missed(oui = true) { if (typeof oui !== "boolean") throw new Error("missed"); this.appels.push(["missed", oui]); return this; }
  }
  globalThis.Sequence = class Sequence {
    constructor(options = { moduleName: "Sequencer" }) { this.moduleName = typeof options === "string" ? options : options?.moduleName ?? "Sequencer"; this.sections = []; }
    effect(fichier = "") { const e = new EffectSection(fichier); this.sections.push(e); return e; }
    play() { etat.sequences.push(this); return Promise.resolve(this); }
  };
  const aplaties = BASE_JB2A.map(e => e.nom);
  globalThis.Sequencer = { Database: { entryExists: nom => Boolean(aplaties.find(e => e.startsWith(nom.trim().replace(/\[[0-9]+]$/, "")))) } };
}

// FXMaster 8.4.2 : api.presets (switch sans nom = arrêt des préréglages de l'API ; play rend false si le préréglage manque)
// et api.effects (un identifiant demandé n'est gardé que dans l'espace « apiMacro_…_p », sinon il est tiré au hasard).
function fxmaster() {
  if (etat.fx) return etat.fx;
  const fx = { presets: new Map(), particules: new Map(), appels: [] };
  const valide = d => d === undefined || typeof d === "number" || d in NIVEAUX_FXMASTER;
  fx.api = {
    presets: {
      async play(nom, opts = {}) {
        fx.appels.push(["presets.play", nom, opts]);
        if (!PRESETS_FXMASTER.includes(nom)) return false;
        if (!valide(opts.density)) throw new Error(`densité invalide ${opts.density}`);
        fx.presets.set(nom, opts);
        return true;
      },
      async switch(nom, opts = {}) {
        fx.appels.push(["presets.switch", nom, opts]);
        if (nom && !PRESETS_FXMASTER.includes(nom)) return false;
        fx.presets.clear();
        return !nom || this.play(nom, opts);
      },
      listValid: () => [...PRESETS_FXMASTER]
    },
    effects: {
      async play({ particles = [], scene: s = null } = {}) {
        fx.appels.push(["effects.play", particles, s]);
        const ids = [];
        for (const p of particles) {
          if (!PARTICULES_FXMASTER.includes(p.type)) throw new Error(`particule inconnue ${p.type}`);
          const id = typeof p.id === "string" && p.id.startsWith("apiMacro_") && p.id.endsWith("_p") ? p.id : `apiMacro_${Math.random().toString(36).slice(2)}_p`;
          fx.particules.set(id, { type: p.type, options: p.options });
          ids.push(id);
        }
        return { particles: ids, filters: [] };
      },
      async stop({ particles = [] } = {}) {
        fx.appels.push(["effects.stop", particles]);
        for (const id of particles) fx.particules.delete(id);
        return { particles, filters: [] };
      }
    }
  };
  etat.fx = fx;
  return fx;
}

// Calendaria 1.4.8 : CALENDARIA.api (advanceTime prend des secondes ou { day, hour, minute, second } ; setWeather ignore un
// préréglage inconnu avec un avertissement ; advanceTimeToPreset : sunrise, midday/noon, sunset, midnight).
function calendaria() {
  const cal = { temps: 8 * 3600, meteo: null, avertissements: [] };
  etat.cal = cal;
  const heure = () => Math.floor((cal.temps % 86400) / 3600);
  return {
    getCurrentDateTime() {
      const t = cal.temps;
      return { year: 1491, month: 3, day: 1 + Math.floor(t / 86400), hour: heure(), minute: Math.floor((t % 3600) / 60), second: t % 60 };
    },
    formatDate(e = null, format = "dateLong") { return `${this.getCurrentDateTime().day} Ches 1491`; },
    isDaytime() { return heure() >= 6 && heure() < 18; },
    getCurrentSeason: () => ({ name: "CALENDARIA.Season.Winter" }),
    getMoonPhase: (i = 0) => ({ name: "CALENDARIA.MoonPhase.FullMoon" }),
    getCurrentWeather: () => cal.meteo,
    async advanceTime(e) {
      if (typeof e === "object" && e !== null) e = (e.day ?? 0) * 24 * 3600 + (e.hour ?? 0) * 3600 + (e.minute ?? 0) * 60 + (e.second ?? 0);
      cal.temps += e;
      return cal.temps;
    },
    async advanceTimeToPreset(nom) {
      const cible = { sunrise: 6, midday: 12, noon: 12, sunset: 18, midnight: 0 }[nom.toLowerCase()];
      if (cible === undefined) { cal.avertissements.push(nom); return cal.temps; }
      let d = cible - heure() - (cal.temps % 3600) / 3600;
      if (d <= 0) d += 24;
      cal.temps += Math.floor(d * 3600);
      return cal.temps;
    },
    async setWeather(id) {
      if (!METEOS_CALENDARIA.includes(id)) { cal.avertissements.push(id); return cal.meteo; }
      cal.meteo = { id, label: `CALENDARIA.Weather.${id}`, temperature: 7 };
      return cal.meteo;
    },
    async clearWeather() { cal.meteo = null; },
    async generateWeather() { cal.meteo = { id: "rain", label: "CALENDARIA.Weather.rain", temperature: 9 }; return cal.meteo; }
  };
}

// Item Piles 3.3.4 : game.itempiles.API. Les devises viennent du module compagnon du système ; ici des abréviations françaises,
// lues comme le fait getPriceFromString (abréviation sans « {#} », en minuscules).
function itemPiles() {
  const DEVISES = [["pp", "{#} pp"], ["gp", "{#} po"], ["ep", "{#} pe"], ["sp", "{#} pa"], ["cp", "{#} pc"]]
    .map(([cle, abbreviation]) => ({ type: "attribute", abbreviation, data: { path: `system.currency.${cle}` }, exchangeRate: 1 }));
  const pile = t => t?.flags?.["item-piles"]?.data;
  const verifierJeton = (t, f) => { if (!(t instanceof TokenDocument)) throw new Error(`${f} | Target must be of type Token or TokenDocument`); };
  return {
    get CURRENCIES() { return structuredClone(DEVISES); },
    async createItemPile({ position = false, sceneId = "s1", tokenOverrides = {}, itemPileFlags = {}, items = false } = {}) {
      if (position && (typeof position !== "object" || !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new Error("createItemPile | position");
      if (typeof sceneId !== "string") throw new Error("createItemPile | sceneId must be of type string");
      if (typeof itemPileFlags !== "object" || typeof tokenOverrides !== "object") throw new Error("createItemPile | flags");
      const t = new TokenDocument({ id: `pile${etat.piles.length}`, name: tokenOverrides.name ?? "Item Pile", ...position,
        flags: { "item-piles": { data: { enabled: true, type: "pile", closed: false, ...itemPileFlags } } } });
      t.items = (items || []).map(i => i?.item ?? i);
      game.scenes.active.tokens.push(t);
      etat.piles.push({ action: "creer", t });
      return { tokenUuid: t.uuid, actorUuid: "Actor.pileDefaut" };
    },
    async turnTokensIntoItemPiles(cibles, { pileSettings = {} } = {}) {
      for (const t of [cibles].flat()) {
        verifierJeton(t, "turnTokensIntoItemPiles");
        t.flags["item-piles"] = { data: { ...pile(t), type: "pile", ...pileSettings, enabled: true } };
        etat.piles.push({ action: "transformer", t, pileSettings });
      }
    },
    async revertTokensFromItemPiles(cibles) {
      for (const t of [cibles].flat()) { verifierJeton(t, "revertTokensFromItemPiles"); t.flags["item-piles"].data.enabled = false; etat.piles.push({ action: "annuler", t }); }
    },
    isValidItemPile: t => Boolean(pile(t)?.enabled),
    async addItems(t, objets) { t.items.push(...objets.map(o => o.item ?? o)); etat.piles.push({ action: "objets", t }); },
    async addCurrencies(t, texte) {
      if (typeof texte !== "string") throw new Error("addCurrency | currencies must be of type string");
      const ids = DEVISES.map(d => d.abbreviation.toLowerCase().replace("{#}", "").trim()).sort((a, b) => b.length - a.length);
      const parties = [...texte.split(",").join("").split(" ").join("").trim().toLowerCase().matchAll(new RegExp(`(.*?) *(${ids.join("|")})`, "g"))];
      if (!parties.length || parties.some(p => !(Number(p[1]) > 0))) throw new Error(`addCurrency | Could not determine currencies to add with string "${texte}"`);
      t.argent = parties.map(p => `${p[1]} ${p[2]}`).join(", ");
    },
    async renderItemPileInterface(t, { userIds = null, useDefaultCharacter = false } = {}) {
      if (!pile(t)?.enabled) throw new Error("renderItemPileInterface | This target is not a valid item pile");
      etat.piles.push({ action: "ouvrir", t, userIds, useDefaultCharacter });
    }
  };
}

// ---------------------------------------------------------------- Chargement du moteur (d'origine ou muté)
async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [outils, contexte, schema] = await Promise.all([m("scripts/outils.js"), m("scripts/contexte.js"), m("scripts/schema.js")]);
  const outil = nom => outils.OUTILS.find(o => o.nom === nom);
  return { ...outils, contexte, validerSchema: schema.validerSchema, outil, lancer: (nom, args) => outil(nom).executer(args) };
}

const ARGENT_VIDE = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
const anim = (effet, o = {}) => ({ effet, source: "", cible: "", x: -1, y: -1, rate: false, ...o });
const cal = (action, o = {}) => ({ action, jours: 0, heures: 0, minutes: 0, moment: "aucun", meteo: "inchangee", ...o });
const butin = (action, o = {}) => ({ action, jeton: "", x: -1, y: -1, nom: "", objets: [], argent: { ...ARGENT_VIDE }, ...o });
const NOUVEAUX = ["animation", "meteo", "calendrier", "butin"];

const VERIFICATIONS = {
  "liste des outils : chaque outil n'apparaît que si ses modules sont actifs, et dans ses systèmes"(M) {
    const noms = s => new Set(M.outilsDuSysteme(s).map(o => o.nom));
    installer({ modules: [] });
    for (const s of ["impmal", "dnd5e", "lakour-loups"]) for (const n of NOUVEAUX) assert.ok(!noms(s).has(n), `${s} sans module : ${n}`);
    installer({ modules: ["sequencer"] });
    assert.ok(!noms("dnd5e").has("animation"), "Sequencer sans JB2A : pas d'animation");
    installer({ modules: TOUS_MODULES });
    for (const s of ["impmal", "dnd5e", "lakour-loups"]) assert.ok(noms(s).has("animation") && noms(s).has("meteo"), s);
    assert.ok(noms("impmal").has("calendrier") && noms("dnd5e").has("calendrier") && !noms("lakour-loups").has("calendrier"));
    assert.ok(noms("dnd5e").has("butin") && !noms("impmal").has("butin") && !noms("lakour-loups").has("butin"));
    for (const n of NOUVEAUX) assert.ok(M.outil(n).modules?.length, `${n} déclare ses modules`);
    assert.ok(M.outil("butin").sensible && !M.outil("animation").sensible && !M.outil("meteo").sensible);
  },

  async "module inactif : refus clair, rien n'est appelé"(M) {
    installer({ modules: [] });
    const args = { animation: anim("explosion", { cible: "Gobelin" }), meteo: { meteo: "pluie", intensite: "moyenne" },
      calendrier: cal("avancer", { heures: 2 }), butin: butin("jeton_vaincu", { jeton: "Gobelin" }) };
    for (const n of NOUVEAUX) {
      const r = await M.lancer(n, args[n]);
      assert.ok(r.erreur && /Module inactif/.test(r.contenu), `${n} : ${r.contenu}`);
    }
    assert.equal(etat.sequences.length, 0);
    assert.equal(etat.cal.temps, 8 * 3600);
    assert.equal(etat.piles.length, 0);
    installer({ modules: ["JB2A_DnD5e"] });
    assert.match((await M.lancer("animation", args.animation)).contenu, /sequencer/);
  },

  "schémas : appels types valides, champ inconnu ou valeur hors liste refusés"(M) {
    const ok = { animation: anim("fleche", { source: "Brin", cible: "Gobelin" }), meteo: { meteo: "aucune", intensite: "faible" },
      calendrier: cal("lire"), butin: butin("tas", { x: 2, y: 2, objets: [{ uuid: "Item.potion", quantite: 2 }], argent: { ...ARGENT_VIDE, gp: 5 } }) };
    for (const n of NOUVEAUX) assert.deepEqual(M.validerSchema(M.outil(n).schema, ok[n]), [], n);
    assert.ok(M.validerSchema(M.outil("animation").schema, anim("boule_magique")).length);
    assert.ok(M.validerSchema(M.outil("meteo").schema, { meteo: "pluie", intensite: "forte", duree: 3 }).length);
    assert.ok(M.validerSchema(M.outil("calendrier").schema, cal("reculer")).length);
    assert.ok(M.validerSchema(M.outil("butin").schema, { ...butin("tas"), argent: { gp: 5 } }).length, "toutes les devises requises");
  },

  "JB2A : chaque animation désigne des entrées de la vraie base gratuite, aux fichiers tous présents"(M) {
    const effets = Object.entries(M.EFFETS_ANIMATION);
    assert.ok(effets.length >= 20 && effets.length <= 32, `${effets.length} effets`);
    assert.deepEqual(M.outil("animation").schema.properties.effet.enum, Object.keys(M.EFFETS_ANIMATION));
    for (const [cle, e] of effets) {
      const entrees = BASE_JB2A.filter(b => b.nom === e.base || b.nom.startsWith(`${e.base}.`) || b.nom.startsWith(`${e.base}[`));
      assert.ok(entrees.length, `${cle} : ${e.base} absent de la base JB2A`);
      const absents = entrees.filter(b => !b.present).map(b => b.fichier);
      assert.deepEqual(absents, [], `${cle} : fichiers absents du module`);
      assert.ok(["sur_place", "trajet"].includes(e.genre) && e.libelle, cle);
      if (e.genre === "sur_place") assert.ok(e.taille > 0, `${cle} : taille`);
      // Un projectile ou un rayon a ses longueurs (05ft… 90ft) : Sequencer choisit la bonne avec stretchTo.
      if (e.genre === "trajet" && cle !== "coup_epee") assert.ok(entrees.some(b => /\.\d+ft(\[\d+\])?$/.test(b.nom)), `${cle} : pas de longueurs`);
    }
    for (const mot of ["feu", "explosion", "eclair", "soin", "benediction", "tenebres", "poison", "fleche", "balle", "griffes", "fumee", "bouclier", "teleportation", "portail"]) {
      assert.ok(M.EFFETS_ANIMATION[mot], `effet attendu : ${mot}`);
    }
  },

  async "animation : sur un jeton, sur une case, de la source à la cible ; refus clairs"(M) {
    installer();
    let r = await M.lancer("animation", anim("explosion", { cible: "gobelin" }));
    assert.ok(!r.erreur, r.contenu);
    let s = etat.sequences.at(-1);
    assert.equal(s.moduleName, "lakour-mj-ia");
    assert.deepEqual(s.sections[0].appels.map(a => a[0]), ["file", "atLocation", "scaleToObject"]);
    assert.equal(s.sections[0].appels[0][1], M.EFFETS_ANIMATION.explosion.base);
    assert.equal(s.sections[0].appels[1][1].name, "Gobelin");
    assert.equal(s.sections[0].appels[2][1], M.EFFETS_ANIMATION.explosion.taille);

    r = await M.lancer("animation", anim("tenebres", { x: 3, y: 2 }));
    s = etat.sequences.at(-1).sections[0].appels;
    assert.deepEqual(s[1][1], { x: 350, y: 250 }, "centre de la case");
    assert.deepEqual(s[2], ["size", M.EFFETS_ANIMATION.tenebres.taille, { gridUnits: true }]);

    r = await M.lancer("animation", anim("tir_laser", { source: "Brin", cible: "Gobelin", rate: true }));
    assert.match(r.contenu, /de Brin vers Gobelin \(manqué\)/);
    s = etat.sequences.at(-1).sections[0].appels;
    assert.deepEqual(s.map(a => a[0]), ["file", "atLocation", "stretchTo", "missed"]);
    assert.equal(s[1][1].name, "Brin");
    assert.equal(s[2][1].name, "Gobelin");
    await M.lancer("animation", anim("fleche", { source: "Brin", cible: "Gobelin" }));
    assert.ok(!etat.sequences.at(-1).sections[0].appels.some(a => a[0] === "missed"), "touché : pas de missed");

    const n = etat.sequences.length;
    assert.match((await M.lancer("animation", anim("fleche", { cible: "Gobelin" }))).contenu, /donne la source/);
    assert.match((await M.lancer("animation", anim("soin", { cible: "Personne" }))).contenu, /introuvable/);
    assert.match((await M.lancer("animation", anim("soin", { x: 40, y: 2 }))).contenu, /case x,y/);
    Sequencer.Database.entryExists = () => false;
    assert.match((await M.lancer("animation", anim("soin", { cible: "Brin" }))).contenu, /absente de la base/);
    assert.equal(etat.sequences.length, n, "aucune animation jouée sur un refus");
  },

  async "meteo : préréglage à l'intensité voulue, une météo à la fois, particules aux identifiants de l'API, « aucune » coupe tout"(M) {
    installer();
    for (const [cle, m] of Object.entries(M.METEOS)) {
      if (m.prereglage) assert.ok(PRESETS_FXMASTER.includes(m.prereglage), `${cle} : préréglage ${m.prereglage} sans variante gratuite`);
      else for (const p of m.particules) assert.ok(PARTICULES_FXMASTER.includes(p.type), `${cle} : ${p.type}`);
    }
    for (const id of M.PARTICULES_METEO) assert.match(id, /^apiMacro_.+_p$/);
    for (const mot of ["pluie", "orage", "neige", "brouillard", "braises", "feuilles_mortes", "cendres"]) assert.ok(M.METEOS[mot], mot);
    const fx = etat.fx = fxmaster();
    let r = await M.lancer("meteo", { meteo: "pluie", intensite: "forte" });
    assert.ok(!r.erreur, r.contenu);
    assert.deepEqual([...fx.presets.keys()], ["rain"]);
    assert.equal(fx.presets.get("rain").density, "high");
    assert.equal(fx.presets.get("rain").scene, scene);
    await M.lancer("meteo", { meteo: "neige", intensite: "faible" });
    assert.deepEqual([...fx.presets.keys()], ["snow"], "la pluie est remplacée");
    assert.equal(fx.presets.get("snow").density, "low");
    await M.lancer("meteo", { meteo: "braises", intensite: "forte" });
    assert.deepEqual([...fx.presets.keys()], [], "le préréglage est coupé");
    assert.deepEqual([...fx.particules.keys()], [M.PARTICULES_METEO[0]]);
    assert.equal(fx.particules.get(M.PARTICULES_METEO[0]).options.density, 0.7 * 1.5);
    r = await M.lancer("meteo", { meteo: "aucune", intensite: "moyenne" });
    assert.match(r.contenu, /coupée/);
    assert.equal(fx.presets.size + fx.particules.size, 0, "plus rien");
    assert.match(M.outil("meteo").description, /ambiance_sonore/);
  },

  async "calendrier : lire, avancer (jours, heures, minutes), jusqu'à un moment, météo du jour"(M) {
    installer();
    let r = await M.lancer("calendrier", cal("lire"));
    assert.match(r.contenu, /1 Ches 1491, 08 h 00 ; il fait jour ; saison : Hiver ; lune : Pleine lune ; météo : non fixée/);
    r = await M.lancer("calendrier", cal("avancer", { jours: 1, heures: 2, minutes: 30 }));
    assert.equal(etat.cal.temps, 8 * 3600 + 86400 + 2 * 3600 + 30 * 60);
    assert.match(r.contenu, /1 j 2 h 30 min.*2 Ches 1491, 10 h 30/);
    const avant = etat.cal.temps;
    assert.ok((await M.lancer("calendrier", cal("avancer", { heures: -3 }))).erreur);
    assert.ok((await M.lancer("calendrier", cal("avancer"))).erreur);
    assert.equal(etat.cal.temps, avant, "refus : le temps ne bouge pas");
    r = await M.lancer("calendrier", cal("jusqu_a", { moment: "crepuscule" }));
    assert.match(r.contenu, /18 h 00 ; il fait nuit/);
    assert.ok((await M.lancer("calendrier", cal("jusqu_a"))).erreur, "moment manquant");
    for (const id of Object.values(M.METEOS_CALENDRIER)) assert.ok(METEOS_CALENDARIA.includes(id), id);
    r = await M.lancer("calendrier", cal("meteo", { meteo: "orage" }));
    assert.equal(etat.cal.meteo.id, "thunderstorm");
    assert.match(r.contenu, /météo : CALENDARIA\.Weather\.thunderstorm, 7°/);
    await M.lancer("calendrier", cal("meteo", { meteo: "effacer" }));
    assert.equal(etat.cal.meteo, null);
    await M.lancer("calendrier", cal("meteo", { meteo: "au_hasard" }));
    assert.equal(etat.cal.meteo.id, "rain");
    assert.deepEqual(etat.cal.avertissements, []);
  },

  async "butin : ennemi vaincu, tas et coffre près d'un repère, marchand ouvert aux joueurs connectés, annuler ; jamais un PJ"(M) {
    installer();
    let r = await M.lancer("butin", butin("jeton_vaincu", { jeton: "Gobelin", objets: [{ uuid: "Item.potion", quantite: 2 }], argent: { ...ARGENT_VIDE, gp: 12, sp: 3 } }));
    assert.ok(!r.erreur, r.contenu);
    const gob = scene.tokens.find(t => t.name === "Gobelin");
    assert.equal(gob.flags["item-piles"].data.type, "pile");
    assert.equal(gob.items[0].system.quantity, 2);
    assert.equal(gob.argent, "12 po, 3 pa", "abréviations des devises d'Item Piles");

    assert.match((await M.lancer("butin", butin("jeton_vaincu", { jeton: "Brin" }))).contenu, /personnage joueur/);
    assert.ok(!scene.tokens.find(t => t.name === "Brin").flags["item-piles"]);

    r = await M.lancer("butin", butin("coffre", { jeton: "Mère Gruss", nom: "Coffre du contrebandier", objets: [{ uuid: "Compendium.lakour.objets.Item.epee", quantite: 1 }], argent: { ...ARGENT_VIDE, pp: 1 } }));
    assert.ok(!r.erreur, r.contenu);
    const coffre = scene.tokens.find(t => t.name === "Coffre du contrebandier");
    assert.ok(coffre, "coffre posé");
    const d = coffre.flags["item-piles"].data;
    assert.equal(d.type, "container");
    assert.equal(d.closed, true);
    assert.ok(d.closedImage && d.openedImage && d.emptyImage, "images du coffre");
    assert.equal(coffre.items[0].name, "Épée longue");
    assert.equal(coffre.argent, "1 pp");
    const mere = scene.tokens.find(t => t.name === "Mère Gruss");
    assert.ok(Math.max(Math.abs(coffre.x - mere.x), Math.abs(coffre.y - mere.y)) === 100, "sur une case libre, à côté du repère");

    r = await M.lancer("butin", butin("tas", { x: 1, y: 1 }));
    const tas = etat.piles.at(-1).t;
    assert.notDeepEqual([tas.x, tas.y], [100, 100], "la case 1,1 est prise par Brin");
    assert.equal(Math.max(Math.abs(tas.x - 100), Math.abs(tas.y - 100)), 100, "la case libre voisine");
    assert.equal(tas.flags["item-piles"].data.type, "pile");

    r = await M.lancer("butin", butin("marchand", { jeton: "Mère Gruss" }));
    assert.ok(!r.erreur, r.contenu);
    assert.equal(mere.flags["item-piles"].data.type, "merchant");
    const ouvert = etat.piles.find(p => p.action === "ouvrir");
    assert.deepEqual(ouvert.userIds, ["j1"], "seulement les joueurs connectés");
    assert.equal(ouvert.useDefaultCharacter, true);

    r = await M.lancer("butin", butin("annuler", { jeton: "Mère Gruss" }));
    assert.equal(mere.flags["item-piles"].data.enabled, false);
    assert.ok((await M.lancer("butin", butin("annuler", { jeton: "Mère Gruss" }))).erreur, "déjà normal");
    assert.match((await M.lancer("butin", butin("tas", { x: 2, y: 2, objets: [{ uuid: "Item.inconnu", quantite: 1 }] }))).contenu, /introuvable/);
    assert.deepEqual(M.argentPourItemPiles({ ...ARGENT_VIDE, gp: 3, cp: 2 }, []), { texte: "", inconnues: ["gp", "cp"] }, "sans devises configurées : signalé");
  },

  "consignes : une phrase par module actif, seulement dans les systèmes de l'outil"(M) {
    const { consignesModulesTiers } = M.contexte;
    const avec = ids => id => ids.includes(id);
    assert.deepEqual(consignesModulesTiers(avec([]), "dnd5e"), []);
    const tout = consignesModulesTiers(avec(TOUS_MODULES), "dnd5e").join("\n");
    for (const n of NOUVEAUX) assert.match(tout, new RegExp(`\\(${n}\\)`), n);
    assert.match(tout, /Automated Animations/);
    assert.match(tout, /ne la double pas avec meteo/);
    assert.doesNotMatch(consignesModulesTiers(avec(["sequencer", "JB2A_DnD5e"]), "dnd5e").join("\n"), /Automated Animations/);
    assert.doesNotMatch(consignesModulesTiers(avec(TOUS_MODULES), "impmal").join("\n"), /Automated Animations|\(butin\)/);
    const loups = consignesModulesTiers(avec(TOUS_MODULES), "lakour-loups").join("\n");
    assert.doesNotMatch(loups, /\(calendrier\)|\(butin\)/);
    assert.match(loups, /\(animation\)/);
    // Cohérence avec la liste des outils : chaque outil proposé a sa consigne, et réciproquement.
    for (const s of ["impmal", "dnd5e", "lakour-loups"]) {
      installer({ modules: TOUS_MODULES, systeme: s });
      const proposes = M.outilsDuSysteme(s).filter(o => o.modules).map(o => o.nom).sort();
      const cites = NOUVEAUX.filter(n => consignesModulesTiers(avec(TOUS_MODULES), s).join("\n").includes(`(${n})`)).sort();
      assert.deepEqual(cites, proposes, s);
    }
  }
};

const MUTATIONS = [
  ["scripts/outils.js", "\n  && (o.modules ?? []).every(moduleActif));", ");", "filtre des modules"],
  ["scripts/outils.js", "const refus = sansModules(\"sequencer\", \"JB2A_DnD5e\");", "const refus = null;", "refus animation"],
  ["scripts/outils.js", "const refus = sansModules(\"calendaria\");", "const refus = null;", "refus calendrier"],
  ["scripts/outils.js", "e.atLocation(depuis).stretchTo(vers);", "e.atLocation(vers);", "trajet"],
  ["scripts/outils.js", "        if (rate) e.missed();\n", "", "tir manqué"],
  ["scripts/outils.js", "e.atLocation(vers).size(def.taille, { gridUnits: true });", "e.atLocation(vers).size(def.taille);", "taille en cases"],
  ["scripts/outils.js", "e.atLocation(vers).scaleToObject(def.taille);", "e.atLocation(vers);", "taille du jeton"],
  ["scripts/outils.js", "jb2a.markers.poison.dark_green", "jb2a.markers.poison.green", "nom JB2A"],
  ["scripts/outils.js", "      await api.presets.switch(null, { scene });\n", "", "une météo à la fois"],
  ["scripts/outils.js", "      await api.effects.stop({ particles: PARTICULES_METEO, scene });\n", "", "particules coupées"],
  ["scripts/outils.js", "\"apiMacro_lakourMeteo0_p\"", "\"lakourMeteo0_p\"", "identifiant de l'API"],
  ["scripts/outils.js", "{ scene, density: niveau, silent: true }", "{ scene, silent: true }", "intensité"],
  ["scripts/outils.js", "const duree = { day: jours || 0, hour: heures || 0, minute: minutes || 0 };", "const duree = { day: jours || 0, hour: minutes || 0, minute: heures || 0 };", "durée"],
  ["scripts/outils.js", "if (Object.values(duree).some(n => n < 0))", "if (false)", "temps qui recule"],
  ["scripts/outils.js", "tempete_de_glace: \"ice-storm\"", "tempete_de_glace: \"ice_storm\"", "id météo Calendaria"],
  ["scripts/outils.js", "if (t.actor?.hasPlayerOwner) return", "if (false) return", "jamais un PJ"],
  ["scripts/outils.js", "{ pileSettings: { type: \"merchant\" } }", "{ pileSettings: { type: \"pile\" } }", "marchand"],
  ["scripts/outils.js", "{ type: \"container\", closed: true,", "{ type: \"container\", closed: false,", "coffre fermé"],
  ["scripts/outils.js", "morceaux.push(`${n}${d.abbreviation.toLowerCase().replace(\"{#}\", \"\").trim()}`);", "morceaux.push(`${n}${cle}`);", "abréviations d'Item Piles"],
  ["scripts/outils.js", "const [c] = choisirCases(1, ou, occupeesDe(scene, ou.g));", "const c = ou.centre;", "case libre"],
  ["scripts/outils.js", "const joueurs = joueursConnectes().map(u => u.id);", "const joueurs = game.users.filter(u => !u.isGM).map(u => u.id);", "joueurs connectés"],
  ["scripts/contexte.js", "actif(\"autoanimations\")", "true", "Automated Animations"],
  ["scripts/contexte.js", "if (systeme === \"dnd5e\" && actif(\"item-piles\"))", "if (actif(\"item-piles\"))", "butin en D&D seulement"],
  ["scripts/contexte.js", "const aventure = [\"impmal\", \"dnd5e\"].includes(systeme);", "const aventure = true;", "calendrier hors Veillées"]
];

async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-modules-mutant-"));
  for (const d of ["scripts", "vendor"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  const chemin = join(dossier, fichier);
  const texte = readFileSync(chemin, "utf8");
  assert.ok(texte.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
  writeFileSync(chemin, texte.replace(avant, apres));
  try { return await charger(dossier); }
  finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push({ nom, e }); }
  }
  return liste;
}

test("modules tiers : le moteur d'origine passe toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("modules tiers : chaque règle cassée est détectée par la batterie", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
