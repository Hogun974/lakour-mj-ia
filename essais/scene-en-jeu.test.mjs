// La scène se modifie en jouant : zone_scene (Region et son comportement), epingle (Note vers un journal, AmbientSound
// localisé) et lieux_scene (ce qui est posé, et quelle page décrit quel lieu), sur la scène affichée, en cases comme
// placer_jetons, au niveau v14 affiché, sans jamais rien montrer aux joueurs d'un journal du MJ. Doublures minimales de
// Foundry v14 (build 14.369) ; chaque vérification est rejouée sur des copies mutées du moteur.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../", import.meta.url));

// ---------- Schémas Foundry v14 attendus (mêmes relevés que scenes-vivantes.test.mjs)
// common/documents/region.mjs ; forme : common/data/data.mjs (RectangleShapeData) ; region-behavior.mjs
const CHAMPS_REGION = ["_id", "name", "color", "shapes", "elevation", "levels", "restriction", "attachment", "behaviors", "visibility", "highlightMode", "displayMeasurements", "hidden", "locked", "ownership", "flags", "_shapeConstraints"];
const CHAMPS_RECTANGLE = ["type", "hole", "x", "y", "width", "height", "anchorX", "anchorY", "rotation", "gridBased"];
const CHAMPS_COMPORTEMENT = ["_id", "name", "type", "system", "disabled", "flags", "_stats"];
const SYSTEMES = {
  displayScrollingText: ["events", "text", "color", "visibility", "once"],
  teleportToken: ["destinations", "placement", "snap", "choice", "revealed", "dialog", "transition"],
  pauseGame: ["once"],
  adjustDarknessLevel: ["mode", "modifier"]
};
// common/documents/note.mjs, ambient-sound.mjs
const CHAMPS_NOTE = ["_id", "author", "entryId", "pageId", "x", "y", "elevation", "levels", "sort", "locked", "texture", "iconSize", "text", "fontFamily", "fontSize", "textAnchor", "textColor", "global", "flags"];
const CHAMPS_SON = ["_id", "name", "x", "y", "elevation", "levels", "radius", "path", "repeat", "volume", "walls", "easing", "hidden", "locked", "darkness", "effects", "flags"];
const estId = v => typeof v === "string" && /^[a-zA-Z0-9]{16}$/.test(v);
const champsConnus = (objet, champs, ou) => {
  for (const k of Object.keys(objet)) assert.ok(champs.includes(k), `${ou} : champ « ${k} » inconnu du schéma v14`);
};

// ---------- Doublures de Foundry
class Coll extends Map {
  constructor(docs = []) { super(docs.map(d => [d.id, d])); }
  get contents() { return [...this.values()]; }
  find(f) { return this.contents.find(f); }
  filter(f) { return this.contents.filter(f); }
  map(f) { return this.contents.map(f); }
  some(f) { return this.contents.some(f); }
}
let n = 0;
const nouvelId = () => `Doc${String(++n).padStart(13, "0")}`;

const regionDoc = d => ({
  ...d, id: d._id,
  behaviors: new Coll(d.behaviors.map(b => ({ ...b, id: b._id, system: { ...b.system, ...(b.system.destinations ? { destinations: new Set(b.system.destinations) } : {}) } }))),
  bounds: { x: d.shapes[0].x, y: d.shapes[0].y, width: d.shapes[0].width, height: d.shapes[0].height }
});
const noteDoc = d => ({ ...d, id: d._id, get entry() { return game.journal.get(d.entryId); }, get page() { return this.entry?.pages.get(d.pageId); } });
const sonDoc = d => ({ ...d, id: d._id });
const FABRIQUES = { Region: ["regions", regionDoc], Note: ["notes", noteDoc], AmbientSound: ["sounds", sonDoc] };

const NIVEAU = "NiveauEtage00001";
let crees, retires;
// Carte de 16×10 cases de 100 px, 2 m par case, avec une marge (origine en 200,100) ; une zone, une épingle et un son posés.
function nouvelleScene() {
  crees = []; retires = [];
  const scene = {
    id: "SceneAuberge0001", name: "Auberge du Gué", grid: { size: 100, distance: 2 },
    dimensions: { sceneX: 200, sceneY: 100, sceneWidth: 1600, sceneHeight: 1000 },
    initialLevel: { id: "defaultLevel0000" }, levels: new Coll([{ id: "defaultLevel0000" }, { id: NIVEAU }]),
    regions: new Coll([regionDoc({ _id: "CaleCaleCale0001", name: "Cale", shapes: [{ type: "rectangle", x: 1600, y: 900, width: 100, height: 100 }],
      behaviors: [{ _id: "CompCale00000001", type: "pauseGame", system: { once: true } }] })]),
    notes: new Coll([noteDoc({ _id: "NoteForge0000001", entryId: "JrnlGuideMJ00001", pageId: "PageForge0000001", x: 1450, y: 450, text: "La forge" })]),
    sounds: new Coll([sonDoc({ _id: "SonMer0000000001", name: "mer — Quai", x: 1650, y: 850, radius: 6, path: "modules/lakour-mj-ia/assets/sons/mer.wav", hidden: false })]),
    async createEmbeddedDocuments(type, donnees, options = {}) {
      const [champ, fabrique] = FABRIQUES[type];
      return donnees.map(d => {
        crees.push({ type, d: structuredClone({ ...d, flags: d.flags }), options });
        const doc = fabrique({ ...structuredClone(d), _id: options.keepId && d._id ? d._id : nouvelId() });
        this[champ].set(doc.id, doc);
        return doc;
      });
    },
    async deleteEmbeddedDocuments(type, ids) {
      for (const id of ids) { retires.push({ type, id }); this[FABRIQUES[type][0]].delete(id); }
      return ids;
    }
  };
  globalThis.canvas = { scene, level: { id: NIVEAU } };
  game.scenes.active = scene;
  return scene;
}

function journal({ id, name, defaut, pack = null, compendiumSource = null, pages = [] }) {
  const j = { documentName: "JournalEntry", id, uuid: pack ? `Compendium.${pack}.JournalEntry.${id}` : `JournalEntry.${id}`, name, pack,
    ownership: { default: defaut }, flags: {}, _stats: { compendiumSource } };
  j.pages = new Coll(pages.map(p => ({ documentName: "JournalEntryPage", parent: j, ownership: { default: -1 }, uuid: `${j.uuid}.JournalEntryPage.${p.id}`, ...p })));
  return j;
}
const guide = journal({ id: "JrnlGuideMJ00001", name: "Guide du MJ", defaut: 0, pages: [{ id: "PageForge0000001", name: "La forge de Brann" }] });
const affiche = journal({ id: "JrnlAffiche00001", name: "Avis de recherche", defaut: 2 });
const lettrePack = journal({ id: "JrnlLettrePack01", name: "Lettre", defaut: 2, pack: "lakour-warcraft.journaux", pages: [{ id: "PageLettre000001", name: "La lettre" }] });
const lettreMonde = journal({ id: "JrnlLettreMonde1", name: "Lettre", defaut: 2, compendiumSource: lettrePack.uuid, pages: [{ id: "PageLettre000001", name: "La lettre" }] });
const acteur = { documentName: "Actor", uuid: "Actor.Brann0000000001" };
const UUIDS = new Map([guide, affiche, lettrePack, lettreMonde].flatMap(j => [[j.uuid, j], ...j.pages.map(p => [p.uuid, p])]).concat([[acteur.uuid, acteur]]));
const importes = [];

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 }, TEXT_ANCHOR_POINTS: { CENTER: 0, BOTTOM: 1, TOP: 2, LEFT: 3, RIGHT: 4 } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
globalThis.fromUuid = async u => UUIDS.get(u) ?? null;
globalThis.game = { scenes: { active: null }, system: { id: "dnd5e" }, journal: Object.assign(new Coll([guide, affiche, lettreMonde]), { fromCompendium: (d, o) => ({ source: d.uuid, o }) }) };
globalThis.JournalEntry = { implementation: { create: async d => { importes.push(d); return lettreMonde; } } };

async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [outils, schema] = await Promise.all([m("scripts/outils.js"), m("scripts/schema.js")]);
  const o = nom => outils.OUTILS.find(x => x.nom === nom);
  return { zone: o("zone_scene"), epingle: o("epingle"), lieux: o("lieux_scene"), valider: schema.validerSchema };
}

// Appels complets (schémas stricts : tous les champs sont requis).
const ZONE = { action: "ajouter", nom: "Seuil", x: 2, y: 3, l: 2, h: 1, type: "texte", texte: "Une odeur de suie.", vers: "", obscurite: 0, unique: true };
const EPINGLE = { action: "epingler", uuid: guide.pages.get("PageForge0000001").uuid, x: 12, y: 3, texte: "", son: "aucun", rayon: 0, volume: 0, id: "" };
const zone = (M, args) => M.zone.executer({ ...ZONE, ...args });
const epingle = (M, args) => M.epingle.executer({ ...EPINGLE, ...args });
const derniere = type => crees.filter(c => c.type === type).at(-1);

function verifierRegion(r) {
  champsConnus(r, CHAMPS_REGION, `région ${r.name}`);
  assert.ok(estId(r._id), `identifiant ${r._id}`);
  assert.equal(r.shapes.length, 1);
  champsConnus(r.shapes[0], CHAMPS_RECTANGLE, "forme");
  assert.equal(r.visibility, 0, "sur le calque des régions seulement");
  assert.equal(r.ownership.default, 0, "les joueurs n'observent pas la zone");
  assert.equal(r.hidden, false, "une région cachée désactive ses comportements");
  assert.deepEqual(r.levels, [NIVEAU], "au niveau affiché, pas au niveau initial");
  assert.equal(r.behaviors.length, 1);
  const b = r.behaviors[0];
  champsConnus(b, CHAMPS_COMPORTEMENT, "comportement");
  assert.ok(estId(b._id));
  assert.deepEqual(Object.keys(b.system).sort(), [...SYSTEMES[b.type]].sort(), `champs de ${b.type}`);
}

const VERIFICATIONS = {
  "schémas : appels complets valides ; lieux_scene libre, zone_scene et epingle soumis au MJ en mode validation"(M) {
    assert.deepEqual(M.valider(M.zone.schema, ZONE), []);
    assert.deepEqual(M.valider(M.epingle.schema, EPINGLE), []);
    assert.deepEqual(M.valider(M.lieux.schema, {}), []);
    assert.ok(M.valider(M.zone.schema, { ...ZONE, type: "piege" }).length, "type de zone hors liste");
    assert.ok(M.valider(M.epingle.schema, { ...EPINGLE, son: "cornemuse" }).length, "son hors liste");
    assert.equal(M.zone.sensible, true);
    assert.equal(M.epingle.sensible, true);
    assert.equal(M.lieux.sensible, false);
  },

  async "zone texte : région v14 en cases (origine de la scène comprise), invisible des joueurs, au niveau affiché"(M) {
    const scene = nouvelleScene();
    const r = await zone(M, {});
    assert.ok(!r.erreur, r.contenu);
    const { d, options } = derniere("Region");
    verifierRegion(d);
    assert.deepEqual(d.shapes[0], { type: "rectangle", x: 400, y: 400, width: 200, height: 100, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false });
    assert.equal(options.keepId, true, "l'identifiant annoncé est celui de la région");
    assert.ok(scene.regions.has(d._id));
    assert.match(r.contenu, new RegExp(d._id));
    const b = d.behaviors[0];
    assert.equal(b.type, "displayScrollingText");
    assert.deepEqual(b.system.events, ["tokenAnimateIn"]);
    assert.equal(b.system.text, "Une odeur de suie.");
    assert.equal(b.system.once, true);
    assert.ok(d.flags["lakour-mj-ia"].zone, "marquée comme posée par le MJ IA");
  },

  async "zones pause et obscurité : comportements v14"(M) {
    nouvelleScene();
    assert.ok(!(await zone(M, { nom: "Embuscade", type: "pause", unique: false })).erreur);
    const pause = derniere("Region").d;
    verifierRegion(pause);
    assert.deepEqual(pause.behaviors[0].system, { once: false }, "à chaque entrée si demandé");
    assert.ok(!(await zone(M, { nom: "Ombre", type: "obscurite", obscurite: 0.8, x: 0, y: 0, l: 16, h: 10 })).erreur, "toute la carte");
    const ombre = derniere("Region").d;
    verifierRegion(ombre);
    assert.deepEqual(ombre.behaviors[0].system, { mode: 0, modifier: 0.8 });
  },

  async "zone teleport : vise la vraie région d'arrivée de la scène (UUID relatif)"(M) {
    const scene = nouvelleScene();
    const r = await zone(M, { nom: "Trappe", type: "teleport", vers: "cale" });
    assert.ok(!r.erreur, r.contenu);
    const { d } = derniere("Region");
    verifierRegion(d);
    assert.deepEqual(d.behaviors[0].system.destinations, ["..CaleCaleCale0001"]);
    // Le retour : de la cale vers la trappe tout juste créée, par son identifiant gardé.
    assert.ok(!(await zone(M, { nom: "Échelle", type: "teleport", vers: "Trappe", x: 14, y: 7 })).erreur);
    assert.deepEqual(derniere("Region").d.behaviors[0].system.destinations, [`..${d._id}`]);
    assert.notEqual(derniere("Region").d._id, d._id);
    assert.equal(scene.regions.size, 3);
  },

  async "zones refusées proprement : hors scène, arrivée inconnue, nom pris, hors de la carte, texte manquant"(M) {
    const scene = nouvelleScene();
    let r = await zone(M, { nom: "Trappe", type: "teleport", vers: "Grenier" });
    assert.equal(r.erreur, true);
    assert.match(r.contenu, /« Grenier » inconnue sur cette scène .*« Cale »/);
    r = await zone(M, { nom: "Trappe", type: "teleport", vers: "Trappe" });
    assert.equal(r.erreur, true, "pas de téléportation vers soi-même");
    r = await zone(M, { nom: " cale " });
    assert.equal(r.erreur, true);
    assert.match(r.contenu, /existe déjà/);
    assert.equal((await zone(M, { x: 15, l: 2 })).erreur, true, "dépasse à droite");
    assert.equal((await zone(M, { y: -1 })).erreur, true);
    assert.equal((await zone(M, { l: 0 })).erreur, true);
    assert.match((await zone(M, { texte: "" })).contenu, /texte manquant/);
    assert.equal((await zone(M, { obscurite: 3, type: "obscurite" })).erreur, true);
    assert.equal(crees.length, 0, "rien n'est créé");
    assert.equal(scene.regions.size, 1);
    canvas.scene = null; game.scenes.active = null;
    r = await zone(M, {});
    assert.equal(r.erreur, true);
    assert.match(r.contenu, /Aucune scène/);
    assert.equal((await epingle(M, {})).erreur, true);
    assert.equal((await M.lieux.executer({})).erreur, true);
  },

  async "zone retirée par son nom ; la téléportation qui y menait est signalée ; zone inconnue refusée"(M) {
    const scene = nouvelleScene();
    await zone(M, { nom: "Trappe", type: "teleport", vers: "Cale" });
    const r = await zone(M, { action: "retirer", nom: "CALE", x: 0, y: 0, l: 0, h: 0 });
    assert.ok(!r.erreur, r.contenu);
    assert.deepEqual(retires, [{ type: "Region", id: "CaleCaleCale0001" }]);
    assert.ok(!scene.regions.has("CaleCaleCale0001"));
    assert.match(r.contenu, /ne mènent plus nulle part : « Trappe »/);
    const inconnue = await zone(M, { action: "retirer", nom: "Grenier" });
    assert.equal(inconnue.erreur, true);
    assert.match(inconnue.contenu, /introuvable .*« Trappe »/);
  },

  async "épingle d'une page du journal du MJ : Note v14 au centre de la case, au niveau affiché, réservée au MJ"(M) {
    nouvelleScene();
    const r = await epingle(M, {});
    assert.ok(!r.erreur, r.contenu);
    const { d } = derniere("Note");
    champsConnus(d, CHAMPS_NOTE, "note");
    assert.deepEqual([d.entryId, d.pageId, d.x, d.y], ["JrnlGuideMJ00001", "PageForge0000001", 1450, 450]);
    assert.deepEqual(d.levels, [NIVEAU]);
    assert.ok(d.iconSize >= 32 && d.fontSize >= 8 && d.fontSize <= 128);
    assert.equal(d.textAnchor, 1);
    assert.equal(d.text, "", "sans libellé : le nom de la page, que seul le MJ voit");
    assert.match(r.contenu, /réservée au MJ/);
    const visible = await epingle(M, { uuid: affiche.uuid, texte: "Avis placardé" });
    assert.match(visible.contenu, /visible des joueurs/);
    assert.equal(derniere("Note").d.pageId, null);
  },

  async "épingle d'un journal de compendium : la copie du monde ; uuid inconnu ou étranger refusé"(M) {
    nouvelleScene();
    const r = await epingle(M, { uuid: lettrePack.pages.get("PageLettre000001").uuid });
    assert.ok(!r.erreur, r.contenu);
    assert.equal(derniere("Note").d.entryId, "JrnlLettreMonde1", "une Note ne vise qu'un journal du monde");
    assert.equal(importes.length, 0, "la copie existe : rien d'importé");
    for (const uuid of ["JournalEntry.Inconnu000000001", acteur.uuid, ""]) {
      const refus = await epingle(M, { uuid });
      assert.equal(refus.erreur, true, uuid);
      assert.match(refus.contenu, /Aucun journal ni page/);
    }
    assert.equal(crees.length, 1);
    assert.equal((await epingle(M, { x: 16 })).erreur, true, "hors de la carte");
  },

  async "son localisé : AmbientSound v14, portée en unités de grille, au niveau affiché ; son inconnu refusé"(M) {
    nouvelleScene();
    const r = await epingle(M, { action: "son", uuid: "", x: 3, y: 2, texte: "Forge de Brann", son: "forge", rayon: 4, volume: 0.3 });
    assert.ok(!r.erreur, r.contenu);
    const { d } = derniere("AmbientSound");
    champsConnus(d, CHAMPS_SON, "son");
    assert.deepEqual([d.x, d.y, d.radius, d.volume], [550, 350, 8, 0.3]);
    assert.equal(d.path, "modules/lakour-mj-ia/assets/sons/forge.wav");
    assert.equal(d.name, "forge — Forge de Brann");
    assert.deepEqual(d.levels, [NIVEAU]);
    assert.deepEqual([d.walls, d.easing, d.hidden, d.repeat], [true, true, false, true]);
    assert.equal((await epingle(M, { action: "son", son: "aucun", rayon: 4, volume: 0.3 })).erreur, true);
    assert.equal((await epingle(M, { action: "son", son: "feu", rayon: 0, volume: 0.3 })).erreur, true);
    assert.equal((await epingle(M, { action: "son", son: "feu", rayon: 2, volume: 2 })).erreur, true);
    assert.equal(crees.length, 1);
  },

  async "retirer une épingle ou un son par identifiant ; identifiant inconnu refusé"(M) {
    const scene = nouvelleScene();
    assert.ok(!(await epingle(M, { action: "retirer", id: "NoteForge0000001" })).erreur);
    assert.ok(!(await epingle(M, { action: "retirer", id: "SonMer0000000001" })).erreur);
    assert.deepEqual(retires, [{ type: "Note", id: "NoteForge0000001" }, { type: "AmbientSound", id: "SonMer0000000001" }]);
    assert.equal(scene.notes.size + scene.sounds.size, 0);
    const r = await epingle(M, { action: "retirer", id: "CaleCaleCale0001" });
    assert.equal(r.erreur, true, "une zone ne se retire pas par epingle");
    assert.equal(retires.length, 2);
  },

  async "lieux_scene : zones en cases, épingles avec leur page et son uuid (MJ seulement), sons"(M) {
    nouvelleScene();
    await zone(M, {});
    await epingle(M, { uuid: affiche.uuid, x: 1, y: 1, texte: "Avis" });
    const { contenu, erreur } = await M.lieux.executer({});
    assert.ok(!erreur);
    assert.match(contenu, /« Cale » \(CaleCaleCale0001\) — pause, cases 14,8 \(1×1\)/);
    assert.match(contenu, /« Seuil » .* — texte, cases 2,3 \(2×1\)/);
    assert.match(contenu, /NoteForge0000001 — case 12,3, « La forge » → page « La forge de Brann » de « Guide du MJ » \(JournalEntry\.JrnlGuideMJ00001\.JournalEntryPage\.PageForge0000001\), MJ seulement/);
    assert.match(contenu, /case 1,1, « Avis » → « Avis de recherche » \(JournalEntry\.JrnlAffiche00001\)\n/, "visible des joueurs : pas de mention");
    assert.match(contenu, /SonMer0000000001 — mer — Quai, case 14,7, portée 3 cases/);
  }
};

const MUTATIONS = [
  ["scripts/outils.js", "for (const f of region.shapes) { f.x += g.sceneX; f.y += g.sceneY; }", "", "origine de la scène"],
  ["scripts/outils.js", "{ taille: g.size, idZone, nomsZones, niveau: niveauAffiche(scene) }", "{ taille: g.size, idZone, nomsZones }", "zone au niveau affiché"],
  ["scripts/cartes.js", "levels: niveau ? [niveau] : []", "levels: []", "niveau de la région"],
  ["scripts/outils.js", "await scene.createEmbeddedDocuments(\"Region\", [region], { keepId: true });", "await scene.createEmbeddedDocuments(\"Region\", [region]);", "identifiant gardé"],
  ["scripts/outils.js", "const idZone = z => (z === nom ? id : zoneNommee(scene, z)?.id);", "const idZone = z => z === nom ? id : idStable(`zone:${z}`);", "vraie région d'arrivée"],
  ["scripts/outils.js", "if (zoneNommee(scene, nom)) return", "if (false) return", "nom de zone unique"],
  ["scripts/outils.js", "if (type === \"teleport\" && !arrivee) return", "if (false) return", "arrivée connue"],
  ["scripts/outils.js", "x + l <= g.largeur && y + h <= g.hauteur", "true", "dans la carte"],
  ["scripts/outils.js", "if (!(l >= 1 && h >= 1 && dansLaGrille(g, x, y, l, h))) {", "if (!dansLaGrille(g, x, y)) {", "taille de zone"],
  ["scripts/outils.js", "        await scene.deleteEmbeddedDocuments(\"Region\", [zone.id]);\n", "", "zone retirée"],
  ["scripts/outils.js", "String(d).endsWith(zone.id)", "false", "téléportation orpheline signalée"],
  ["scripts/outils.js", "const centreDeCase = (g, x, y) => ({ x: Math.round(g.sceneX + (x + 0.5) * g.size)", "const centreDeCase = (g, x, y) => ({ x: Math.round(g.sceneX + x * g.size)", "centre de la case"],
  ["scripts/outils.js", "const niveauxDe = scene => { const n = niveauAffiche(scene); return n ? [n] : []; };", "const niveauxDe = scene => [];", "épingle et son au niveau affiché"],
  ["scripts/outils.js", '!["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return { erreur: `Aucun journal', 'false) return { erreur: `Aucun journal', "seulement un journal ou une page"],
  ["scripts/outils.js", "    entree = copie;\n", "", "copie du monde"],
  ["scripts/outils.js", "const qui = lisibleDesJoueurs(entree, page) ?", "const qui = true ?", "réservée au MJ annoncée"],
  ["scripts/outils.js", "const secret = entree && !lisibleDesJoueurs(entree, page) ? \", MJ seulement\" : \"\";", "const secret = \"\";", "MJ seulement listé"],
  ["scripts/outils.js", "radius: rayon * scene.grid.distance", "radius: rayon", "portée en unités de grille"],
  ["scripts/outils.js", "if (!SONS_AMBIANCE.includes(son))", "if (false)", "son connu"],
  ["scripts/outils.js", "scene.notes.has(id) ? \"Note\" : scene.sounds.has(id) ? \"AmbientSound\" : null", "scene.notes.has(id) ? \"Note\" : \"AmbientSound\"", "identifiant inconnu refusé"],
  ["scripts/outils.js", "${casesDeBornes(r.bounds, g)}", "${r.bounds.x},${r.bounds.y}", "zones listées en cases"]
];

async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-scene-jeu-mutant-"));
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

test("scène en jeu : le moteur d'origine passe toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("scène en jeu : chaque règle cassée est détectée par la batterie", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
