// Variantes anglaises des modules de contenu (lakour-40k-en, lakour-warcraft-en, lakour-veillees-en, lakour-fenoir-en : mêmes
// documents, mêmes _id, drapeaux sous leur propre identifiant ; docs/traduction.md) : partout où le moteur nommait un module de
// contenu en dur, il prend la variante active (scripts/contenus.js : moduleDeContenu, contenuNomme, packDeContenu,
// drapeauxDuContenu). Doublure de game.modules avec la variante « -en » active, pour chaque endroit corrigé : figurants
// (placement.js), noms de villageois (compagnons-jeu.js), munitions et création 40k / Warcraft, lancer_table et loups_composer
// (outils.js), creer_survivant (outils-survie.js), réparation des munitions (main.js, lu dans le source). Batterie par mutation
// sur contenus.js. Hors de Foundry, sans IA.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installerFenoir } from "./doublures/foundry-survie.mjs";

// ------------------------------------------------------------------ doublure de Foundry
class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
const chat = [];
const fichiers = new Map();   // chemin -> JSON servi par fetch
const demandes = [];          // chemins demandés à fetch
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
const reglages = { historiqueLoups: [], mouvementsBloques: {}, compagnonsPrive: {}, styleVisuel: "plat", reparations: {}, personnalites: [] };

function installerGlobales() {
  globalThis.foundry = {
    applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
    utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2),
      getRoute: r => r, setProperty: (o, k, v) => { const p = k.split("."); const d = p.pop(); let x = o; for (const q of p) x = x[q] ??= {}; x[d] = v; },
      getProperty: (o, k) => k.split(".").reduce((x, p) => x?.[p], o), expandObject: o => o }
  };
  globalThis.fetch = async url => {
    const chemin = String(url).split("?")[0];
    demandes.push(chemin);
    return fichiers.has(chemin) ? { ok: true, json: async () => structuredClone(fichiers.get(chemin)) } : { ok: false, json: async () => { throw new Error(`404 ${chemin}`); } };
  };
  globalThis.Hooks = { on() {}, callAll() {}, once() {} };
  globalThis.fromUuidSync = uuid => ({ name: String(uuid).split(".").at(-1) });
  globalThis.fromUuid = async () => null;
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0, FRIENDLY: 1, HOSTILE: -1 },
    DICE_ROLL_MODES: { PUBLIC: "publicroll" } };
  globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...structuredClone(d) }; chat.push(m); return m; } } };
  globalThis.canvas = { scene: null };
}
// Un monde : son système, ses modules (id -> actif ou non), ses compendiums ([id, pack]) et ses tables.
function monde({ systeme, modules = {}, packs = [], tables = [] } = {}) {
  installerGlobales();
  demandes.length = 0;
  globalThis.game = {
    user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
    system: { id: systeme, title: systeme, version: "1" }, world: { id: "monde", title: "Monde" },
    settings: { get: (_m, k) => structuredClone(reglages[k] ?? null), set: async (_m, k, v) => { reglages[k] = structuredClone(v); }, settings: new Map() },
    combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
    modules: new Map(Object.entries(modules).map(([id, active]) => [id, { id, active, api: {} }])), journal: [], paused: false,
    packs: new Collection(packs), tables, items: { fromCompendium: d => structuredClone(d) }
  };
  Object.defineProperty(game.users, "activeGM", { get: () => mj });
  return game;
}
monde({ systeme: "impmal" });
const C = await import("../scripts/contenus.js");
const P = await import("../scripts/placement.js");
const { OUTILS, donnerMunitions } = await import("../scripts/outils.js");
const { nomsPourCompagnons } = await import("../scripts/compagnons-jeu.js");
const outil = nom => OUTILS.find(o => o.nom === nom);

// ------------------------------------------------------------------ contenus.js : la batterie (d'origine ou mutée)
// Chaque règle, vérifiée sur un module M (contenus.js) : rend la liste des échecs.
function batterie(M) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  verifier("variantes : le français puis l'anglais", () => assert.deepEqual(M.variantes("lakour-40k"), ["lakour-40k", "lakour-40k-en"]));
  verifier("moduleDeBase retire le suffixe anglais", () => { assert.equal(M.moduleDeBase("lakour-40k-en"), "lakour-40k"); assert.equal(M.moduleDeBase("lakour-40k"), "lakour-40k"); });
  verifier("moduleDeContenu : la variante active, pas celle qui est seulement installée", () => {
    monde({ systeme: "impmal", modules: { "lakour-40k": false, "lakour-40k-en": true } });
    assert.equal(M.moduleDeContenu(), "lakour-40k-en");
    assert.equal(M.moduleDeContenu("impmal"), "lakour-40k-en");
    monde({ systeme: "impmal", modules: { "lakour-40k": true } });
    assert.equal(M.moduleDeContenu(), "lakour-40k");
    monde({ systeme: "impmal", modules: { "lakour-40k": false } });
    assert.equal(M.moduleDeContenu(), null);
  });
  verifier("contenuNomme : la variante active, sinon l'identifiant français", () => {
    monde({ systeme: "dnd5e", modules: { "lakour-warcraft-en": true } });
    assert.equal(M.contenuNomme(), "lakour-warcraft-en");
    monde({ systeme: "dnd5e" });
    assert.equal(M.contenuNomme(), "lakour-warcraft");
    assert.equal(M.contenuNomme("lakour-survie"), "lakour-fenoir");
    assert.equal(M.contenuNomme("inconnu"), null);
  });
  verifier("packDeContenu nomme le compendium de la variante active", () => {
    monde({ systeme: "lakour-loups", modules: { "lakour-veillees-en": true } });
    assert.equal(M.packDeContenu("tables"), "lakour-veillees-en.tables");
    assert.equal(M.packDeContenu("armement", "impmal"), "lakour-40k.armement");
    assert.equal(M.packDeContenu("x", "inconnu"), null);
  });
  verifier("drapeauxDuContenu : la variante active d'abord, puis l'autre ; rien sinon", () => {
    const deux = { "lakour-40k": { cle: "fr" }, "lakour-40k-en": { cle: "en" } };
    assert.equal(M.drapeauxDuContenu(deux, "lakour-40k-en").cle, "en");
    assert.equal(M.drapeauxDuContenu(deux, "lakour-40k").cle, "fr");
    assert.equal(M.drapeauxDuContenu({ "lakour-40k": { cle: "fr" } }, "lakour-40k-en").cle, "fr", "document posé par le module français, lu quand l'anglais est actif");
    assert.equal(M.drapeauxDuContenu({ "lakour-40k-en": { cle: "en" } }, "lakour-40k").cle, "en", "et l'inverse");
    assert.equal(M.drapeauxDuContenu({ "lakour-mj-ia": {} }, "lakour-40k-en"), undefined);
    assert.equal(M.drapeauxDuContenu(undefined, "lakour-40k-en"), undefined);
    assert.equal(M.drapeauxDuContenu(deux, null), undefined);
    monde({ systeme: "impmal", modules: { "lakour-40k-en": true } });
    assert.equal(M.drapeauxDuContenu(deux).cle, "en", "module par défaut : celui qui est actif");
  });
  return echecs;
}

test("contenus.js : variantes, module actif, identifiant à nommer, compendium, drapeaux des deux langues", () => {
  assert.deepEqual(batterie(C), []);
});

const MUTATIONS = {
  "variantes oublie l'anglais": ["[id, `${id}${SUFFIXE_ANGLAIS}`]", "[id]"],
  "moduleDeBase garde le suffixe": ["id.replace(new RegExp(`${SUFFIXE_ANGLAIS}$`), \"\")", "id"],
  "moduleDeContenu prend un module installé mais inactif": [".find(id => globalThis.game?.modules?.get?.(id)?.active)", ".find(id => globalThis.game?.modules?.get?.(id))"],
  "contenuNomme sans repli sur le français": ["moduleDeContenu(systeme) ?? CONTENUS[systeme] ?? null", "moduleDeContenu(systeme) ?? null"],
  "packDeContenu nomme toujours le français": ["const module = contenuNomme(systeme);", "const module = CONTENUS[systeme];"],
  "drapeaux : l'autre variante n'est plus lue": ["[module, ...variantes(base).filter(v => v !== module)]", "[module]"],
  "drapeaux : l'autre variante avant la variante active": ["[module, ...variantes(base).filter(v => v !== module)]", "[...variantes(base).filter(v => v !== module), module]"]
};

test("mutations : la batterie attrape chaque règle cassée de contenus.js", async () => {
  const source = readFileSync(join(SCRIPTS, "contenus.js"), "utf8").replace(/\r\n/g, "\n");
  for (const [nom, [avant, apres]] of Object.entries(MUTATIONS)) {
    assert.ok(source.includes(avant), `mutation obsolète : ${avant}`);
    const dossier = mkdtempSync(join(tmpdir(), "lakour-contenus-"));
    try {
      writeFileSync(join(dossier, "contenus.js"), source.replace(avant, apres));
      const M = await import(pathToFileURL(join(dossier, "contenus.js")).href);
      assert.ok(batterie(M).length > 0, `mutation non détectée : ${nom}`);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ placement.js : jetons des figurants
test("figurants (placement.js) : le jeton vient de lakour-40k-en quand c'est la variante active, de lakour-40k sinon", () => {
  monde({ systeme: "impmal", modules: { "lakour-40k-en": true } });
  assert.equal(P.moduleDesFigurants(), "lakour-40k-en");
  assert.equal(P.jetonFigurant("garde", "plat"), "modules/lakour-40k-en/assets/jetons/garde-pdf.svg");
  assert.equal(P.jetonFigurant("garde", "3d"), "modules/lakour-40k-en/assets/jetons/3d/garde-pdf.svg");
  monde({ systeme: "impmal" });
  assert.equal(P.moduleDesFigurants(), "lakour-40k", "sans module actif : l'identifiant français, comme avant");
  assert.equal(P.jetonFigurant("garde", "plat"), "modules/lakour-40k/assets/jetons/garde-pdf.svg");
  // Un module de contenu qui fournit ses figurants (lakour-warcraft-en sur dnd5e) l'emporte sur le défaut.
  P.definirFigurants({ paysan: { libelle: "Paysan", jeton: "paysan" } }, "lakour-warcraft-en");
  assert.equal(P.jetonFigurant("paysan", "plat"), "modules/lakour-warcraft-en/assets/jetons/paysan.svg");
});

// ------------------------------------------------------------------ compagnons-jeu.js : noms de villageois
const tableNoms = (module, noms) => [[`${module}.tables`, { getDocuments: async () => [
  { name: "Autre table", flags: {}, results: noms.map(() => ({ name: "Pas celle-là" })) },
  { name: "Noms de villageois", flags: { [module]: { cle: "noms-de-villageois" } }, results: noms.map(n => ({ name: n })) }
] }]];
test("noms de villageois (compagnons-jeu.js) : la table « Noms de villageois » de lakour-veillees-en quand c'est la variante active", async () => {
  monde({ systeme: "lakour-loups", modules: { "lakour-veillees-en": true }, packs: tableNoms("lakour-veillees-en", ["Agnes Corbet", "Benedict Ferrand"]) });
  assert.deepEqual((await nomsPourCompagnons(2)).sort(), ["Agnes Corbet", "Benedict Ferrand"]);
  // Une table importée du module français avant le changement de langue, dans le compendium anglais : ses drapeaux sont lus aussi.
  monde({ systeme: "lakour-loups", modules: { "lakour-veillees-en": true },
    packs: [[`lakour-veillees-en.tables`, { getDocuments: async () => [{ name: "Noms", flags: { "lakour-veillees": { cle: "noms-de-villageois" } }, results: [{ name: "Odile Basquin" }] }] }]] });
  assert.deepEqual(await nomsPourCompagnons(1), ["Odile Basquin"]);
  // Le compendium français seul, variante anglaise active : rien dans lakour-veillees-en.tables, noms de secours.
  monde({ systeme: "lakour-loups", modules: { "lakour-veillees-en": true }, packs: tableNoms("lakour-veillees", ["Agnes Corbet"]) });
  const secours = await nomsPourCompagnons(1);
  assert.notDeepEqual(secours, ["Agnes Corbet"]);
  assert.equal(secours.length, 1);
});

// ------------------------------------------------------------------ outils.js : munitions (40k), jeton du rôle et du peuple
function acteurImpmal(items) {
  const a = { name: "Vex", type: "character", items: new Collection(items.map(i => [i.id, i])), crees: [] };
  a.createEmbeddedDocuments = async (_type, [d]) => { const lot = { id: `lot${a.items.size}`, ...structuredClone(d) }; a.items.set(lot.id, lot); a.crees.push(lot); return [lot]; };
  return a;
}
const pistoletLas = () => {
  const arme = { id: "w1", type: "weapon", name: "Pistolet las", flags: {}, system: { attackType: "ranged", category: "las", mag: { value: 10 }, ammo: {} } };
  arme.update = async d => { arme.system.ammo.id = d["system.ammo.id"]; };
  return arme;
};
const armement = module => [[`${module}.armement`, { getDocuments: async () => [
  { name: "Charges laser", type: "ammo", flags: { [module]: { cle: "munition-charges-laser" } }, system: { quantity: 1 } }] }]];

test("donnerMunitions : le compendium « armement » et les drapeaux de lakour-40k-en quand c'est la variante active", async () => {
  monde({ systeme: "impmal", modules: { "lakour-40k-en": true }, packs: armement("lakour-40k-en") });
  const arme = pistoletLas();
  const acteur = acteurImpmal([arme]);
  assert.deepEqual(await donnerMunitions(acteur), ["Charges laser (2)"]);
  assert.equal(arme.system.ammo.id, acteur.crees[0].id);
  assert.deepEqual(acteur.crees[0].flags, { "lakour-40k-en": { cle: "munition-charges-laser" } });
  // Le compendium français seul, variante anglaise active : rien (le pack de la variante active n'existe pas).
  monde({ systeme: "impmal", modules: { "lakour-40k-en": true }, packs: armement("lakour-40k") });
  assert.deepEqual(await donnerMunitions(acteurImpmal([pistoletLas()])), []);
  // Sans module de contenu actif : le compendium français, comme avant.
  monde({ systeme: "impmal", packs: armement("lakour-40k") });
  assert.deepEqual(await donnerMunitions(acteurImpmal([pistoletLas()])), ["Charges laser (2)"]);
});

test("donnerMunitions : un lot posé par le module français (flags.lakour-40k) est reconnu quand lakour-40k-en est actif", async () => {
  monde({ systeme: "impmal", modules: { "lakour-40k-en": true }, packs: armement("lakour-40k-en") });
  const arme = pistoletLas();
  const lot = { id: "a1", type: "ammo", name: "Charges laser", flags: { "lakour-40k": { cle: "munition-charges-laser" } }, system: { quantity: 2 } };
  const acteur = acteurImpmal([arme, lot]);
  assert.deepEqual(await donnerMunitions(acteur), [], "rien de créé : le lot existant sert");
  assert.equal(arme.system.ammo.id, "a1");
});

test("création 40k et Warcraft : le jeton du rôle ou du peuple se lit dans les drapeaux de la variante active (source)", () => {
  const source = readFileSync(join(SCRIPTS, "outils.js"), "utf8");
  assert.match(source, /jetonJoueur\(drapeauxDuContenu\(role\.flags, contenuNomme\("impmal"\)\)\?\.cle/);
  assert.match(source, /jetonJoueur\(drapeauxDuContenu\(peuple\?\.flags, contenuNomme\("dnd5e"\)\)\?\.cle/);
  assert.match(source, /game\.modules\.get\(contenuNomme\("impmal"\)\)\?\.api\?\.preparerDepart/);
});

// ------------------------------------------------------------------ outils.js : lancer_table (appels de Fénoir, contrats de Warcraft)
const tableAvec = (nom, resultat) => ({ name: nom, draw: async () => ({ roll: { total: 7 }, results: [resultat] }) });
const appel = { type: "radio", faction: "gendarmerie", reputation: 1, recompense: { eau: 2 } };
test("lancer_table : les drapeaux « appel » d'un résultat posé par lakour-fenoir-en, ou par lakour-fenoir, sont dits à l'IA", async () => {
  monde({ systeme: "lakour-survie", modules: { "lakour-fenoir-en": true }, tables: [tableAvec("Appels", { name: "SOS du Port", flags: { "lakour-fenoir-en": { appel } } })] });
  let r = await outil("lancer_table").executer({ table: "Appels", raison: "Un appel" });
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /SOS du Port \[appel \(radio\) : récompense eau 2, \+1 de réputation auprès de gendarmerie/);
  monde({ systeme: "lakour-survie", modules: { "lakour-fenoir-en": true }, tables: [tableAvec("Appels", { name: "SOS du Port", flags: { "lakour-fenoir": { appel } } })] });
  r = await outil("lancer_table").executer({ table: "Appels", raison: "Un appel" });
  assert.match(r.contenu, /\[appel \(radio\)/, "résultat importé du module français avant le changement de langue");
  monde({ systeme: "dnd5e", modules: { "lakour-warcraft-en": true },
    tables: [tableAvec("Contrats", { name: "Escorte", flags: { "lakour-warcraft-en": { contrat: { type: "escorte", po: 50, reputation: 2, faction: "horde" } } } })] });
  r = await outil("lancer_table").executer({ table: "Contrats", raison: "Un contrat" });
  assert.match(r.contenu, /Escorte \[contrat \(escorte\) : 50 po, \+2 de réputation auprès de horde/);
});

// ------------------------------------------------------------------ outils.js : loups_composer (assets et compendiums des Veillées)
const indexVeillees = cles => ({ getIndex: async () => new Collection(cles.map(([cle, nom]) => [cle, { uuid: `Compendium.x.${cle}`, name: nom, system: { cle } }])) });
function veilleesEn(module) {
  fichiers.clear();
  fichiers.set(`modules/${module}/assets/compositions.json`, { "classique-4": { libelle: "Classic", joueurs: [4, 6], niveau: "classique", roles: ["loup-de-brumecombe", "liseuse-de-cendres", "villageois", "villageois"], batiments: ["puits"] } });
  fichiers.set(`modules/${module}/assets/equilibre.json`, { roles: { "loup-de-brumecombe": { camp: "meute" }, "liseuse-de-cendres": { camp: "village" }, villageois: { camp: "village" } }, batiments: {} });
  monde({ systeme: "lakour-loups", modules: { [module]: true }, packs: [
    [`${module}.roles`, indexVeillees([["loup-de-brumecombe", "Mistwood Wolf"], ["liseuse-de-cendres", "Ash Reader"], ["villageois", "Villager"]])],
    [`${module}.metiers`, indexVeillees([["forgeron", "Blacksmith"]])], [`${module}.batiments`, indexVeillees([["puits", "The Well"]])]
  ] });
  game.lakourLoups = {
    appels: [], villageois: () => [], carnet: () => [], chancePeste: () => 0,
    logique: { CHANCE_PESTE: 0, tirerPeste: () => false,
      composer: (n, equilibre, options) => { game.lakourLoups.appels.push({ n, equilibre, options }); return { roles: ["loup-de-brumecombe", "liseuse-de-cendres", "villageois", "villageois"].slice(0, n), batiments: ["puits"], somme: 0, verdict: "équilibrée" }; } }
  };
}
test("loups_composer : compositions.json, equilibre.json et les compendiums roles/metiers/batiments de lakour-veillees-en", async () => {
  veilleesEn("lakour-veillees-en");
  const r = await outil("loups_composer").executer({ nombre_joueurs: 4, niveau: "classique", inclure: ["Ash Reader"], exclure: [], peste: "non" });
  assert.ok(!r.erreur, r.contenu);
  assert.deepEqual(demandes.filter(d => d.includes("/assets/")).sort(), ["modules/lakour-veillees-en/assets/compositions.json", "modules/lakour-veillees-en/assets/equilibre.json"]);
  assert.deepEqual(game.lakourLoups.appels[0].options.inclure, ["liseuse-de-cendres"], "rôle résolu par son nom anglais dans le compendium anglais");
  assert.deepEqual(game.lakourLoups.appels[0].equilibre.roles["loup-de-brumecombe"], { camp: "meute" });
  assert.match(r.contenu, /Meute : Mistwood Wolf ; Village : Ash Reader, Villager ×2/);
  assert.match(r.contenu, /Bâtiments : The Well\./);
  // Le module français actif : ses propres fichiers, comme avant.
  veilleesEn("lakour-veillees");
  assert.ok(!(await outil("loups_composer").executer({ nombre_joueurs: 4, niveau: "classique", inclure: [], exclure: [], peste: "non" })).erreur);
  assert.ok(demandes.includes("modules/lakour-veillees/assets/compositions.json"));
  assert.ok(!demandes.some(d => d.includes("lakour-veillees-en")));
});

// ------------------------------------------------------------------ outils-survie.js : creer_survivant (compendiums de Fénoir)
const CREER = { action: "creer", nombre: 0, verrous: { nom: "", age: 0, enfance: "", passe: "", traits: [] }, favoriser: [], tirage: "", statut: "pnj",
  nom: "Josette", joueur: "", acteur_existant: "", passe: "Infirmière", competences: [], equipement: [], age: 70, lien: "", description: "" };
// Fénoir installé (doublure), ses compendiums renommés sous le module voulu, et ce module actif.
function fenoir(moduleDesPacks, moduleActif) {
  const { acteurs } = installerFenoir();
  const packs = new Collection([...game.packs].map(([id, pack]) => [id.replace(/^lakour-fenoir\./, `${moduleDesPacks}.`), pack]));
  game.packs = packs;
  if (moduleActif) game.modules.set(moduleActif, { id: moduleActif, active: true, api: {} });
  return acteurs;
}
test("creer_survivant : les passés, savoirs et équipements viennent des compendiums de lakour-fenoir-en quand c'est la variante active", async () => {
  let acteurs = fenoir("lakour-fenoir-en", "lakour-fenoir-en");
  let r = await outil("creer_survivant").executer({ ...CREER });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(acteurs.find(x => x.name === "Josette").system.competences.soins.niveau, 3);
  // Compendiums français seuls, variante anglaise active : le passé est absent (les compendiums du module actif n'existent pas).
  fenoir("lakour-fenoir", "lakour-fenoir-en");
  r = await outil("creer_survivant").executer({ ...CREER });
  assert.match(r.contenu, /passé « Infirmière » absent du compendium \(passés : compendium introuvable\)/);
  // Sans module de contenu actif (doublure d'origine) : les compendiums français, comme avant.
  acteurs = fenoir("lakour-fenoir", null);
  r = await outil("creer_survivant").executer({ ...CREER });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(acteurs.find(x => x.name === "Josette").system.competences.soins.niveau, 3);
});

// ------------------------------------------------------------------ main.js et le reste du moteur : plus d'identifiant en dur
test("main.js : la réparation des munitions cherche le compendium « armement » de la variante active", () => {
  const source = readFileSync(join(SCRIPTS, "main.js"), "utf8");
  assert.match(source, /game\.packs\.get\(packDeContenu\("armement", "impmal"\)\)/);
  assert.doesNotMatch(source, /"lakour-40k\.armement"/);
});

test("aucun script du moteur ne nomme un module de contenu en dur dans son code (hors contenus.js et le guide)", () => {
  const motif = /["'`][^"'`\n]*\blakour-(40k|warcraft|veillees|fenoir)\b[^"'`\n]*["'`]/;
  const fautifs = [];
  for (const f of readdirSync(SCRIPTS).filter(f => f.endsWith(".js") && !["contenus.js", "guide.js"].includes(f))) {
    const lignes = readFileSync(join(SCRIPTS, f), "utf8").split("\n");
    lignes.forEach((l, i) => { if (motif.test(l.replace(/\/\/.*$/, ""))) fautifs.push(`${f}:${i + 1} ${l.trim()}`); });
  }
  assert.deepEqual(fautifs, []);
});
