// outils/empaqueter-monde.mjs, monde vierge ANGLAIS (--langue en) : le manifeste anglais (id -en, titre et description de
// world.en.json, module requis <module>-en, fond et archive anglais), la traduction des documents du monde par les dictionnaires
// du module (entrée du compendium recopiée sous l'_id du monde, mémoire, uuid et drapeaux récrits, documents du moteur gardés
// tels quels), les réglages basculés (core.moduleConfiguration, compendiums, <module>.installe), les clés protégées des
// Veillées, et le contexte du dépôt. Puis --rafraichir (rafraichirMonde) : sources du monde remises au niveau du contenu actuel
// comme une installation neuve, guides du MJ IA réécrits ; et les règles du tri ajoutées depuis (liste d'ambiances, auteur des
// dessins, réglages de Fénoir). Sans Foundry, sans CLI : fonctions pures sur des documents inventés.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MONDES, COLLECTIONS, MODULES_FRANCAIS, contexteDuDepot, dictionnairesDuModule, manifesteDuMondeAnglais, traduireMonde, rafraichirMonde,
  journalDuGuide, guideDuMoteur, idStable, cheminSelonStyle, trier, trierReglage, versionDuContenu, manifesteAJour } from "../outils/empaqueter-monde.mjs";

const M = "lakour-40k", EN = "lakour-40k-en";
const ctx = { moduleContenu: M, monde: MONDES[M] };
const manifesteFr = {
  id: "la-kour-40k", title: "La Kour — Kour Primaris", description: "<p>Français.</p>", version: "0.14.0", system: "impmal",
  background: "modules/lakour-40k/assets/monde/fond.jpg", manifest: "https://github.com/Hogun974/lakour-w40k/releases/latest/download/world.json",
  download: "https://github.com/Hogun974/lakour-w40k/releases/latest/download/la-kour-40k.zip",
  relationships: { requires: [
    { id: "impmal", type: "system" },
    { id: M, type: "module", manifest: "https://github.com/Hogun974/lakour-w40k/releases/latest/download/module.json", compatibility: { minimum: "0.14.0" } },
    { id: "lakour-mj-ia", type: "module", manifest: "https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/module.json" },
    { id: "warhammer-lib", type: "module" }
  ] }
};
const traductions = { id: "la-kour-40k-en", title: "La Kour — Kour Primaris (English)", description: "<p>English.</p>" };

test("manifeste anglais : id -en, textes de world.en.json, module requis -en par son manifeste, fond et archive anglais, le reste repris", () => {
  const en = manifesteDuMondeAnglais(manifesteFr, traductions, ctx);
  assert.equal(en.id, "la-kour-40k-en");
  assert.equal(en.title, traductions.title);
  assert.equal(en.description, traductions.description);
  assert.equal(en.version, "0.14.0");
  assert.equal(en.background, "modules/lakour-40k-en/assets/monde/fond.jpg");
  assert.match(en.manifest, /\/releases\/latest\/download\/world-en\.json$/);
  assert.match(en.download, /\/releases\/latest\/download\/la-kour-40k-en\.zip$/);
  const requis = en.relationships.requires;
  assert.deepEqual(requis.map(r => r.id), ["impmal", EN, "lakour-mj-ia", "warhammer-lib"]);
  const module = requis.find(r => r.id === EN);
  assert.equal(module.manifest, "https://github.com/Hogun974/lakour-w40k/releases/latest/download/lakour-40k-en.json");
  assert.deepEqual(module.compatibility, { minimum: "0.14.0" });
  assert.deepEqual(requis[2], manifesteFr.relationships.requires[2], "le moteur ne change pas");
  assert.deepEqual(manifesteFr.relationships.requires[1].id, M, "le manifeste français n'est pas modifié");
  // Garde-fous : world.en.json incomplet ou au mauvais id.
  assert.throws(() => manifesteDuMondeAnglais(manifesteFr, { id: "la-kour-40k-en", title: "x" }, ctx), /description/);
  assert.throws(() => manifesteDuMondeAnglais(manifesteFr, { ...traductions, id: "la-kour-40k" }, ctx), /id la-kour-40k au lieu de la-kour-40k-en/);
});

// Un monde inventé : un journal installé du compendium (autre _id que sa source, pages re-créées), une scène sous le même _id,
// un guide du MJ IA, deux dossiers, les réglages, le Gamemaster.
const monde = () => ({
  ...Object.fromEntries(COLLECTIONS.map(c => [c, []])),
  journal: [{
    _id: "MondeJournal00001", _key: "!journal!MondeJournal00001", name: "Guide du MJ", folder: "DossierTables001",
    flags: { [M]: { cle: "guide-mj" }, core: { sourceId: `Compendium.${M}.journaux.JournalEntry.PackJournal000001` } },
    _stats: { compendiumSource: `Compendium.${M}.journaux.JournalEntry.PackJournal000001`, lastModifiedBy: null },
    pages: [{ _id: "PageRecreee000001", name: "Fêtes de la Kour", text: { content: `<p>Voir @UUID[Compendium.${M}.tables.RollTable.PackTable0000001]{Périls}.</p>` } }]
  }, {
    _id: "GuideMoteur000001", _key: "!journal!GuideMoteur000001", name: "MJ IA — Guide du MJ", flags: { "lakour-mj-ia": { guide: "guide-mj" } },
    pages: [{ _id: "PageMoteur0000001", name: "Pour commencer", text: { content: "<p>Texte du moteur, sans dictionnaire.</p>" } }]
  }],
  scenes: [{
    _id: "PackScene00000001", _key: "!scenes!PackScene00000001", name: "Le Chœur creux — La chapelle", background: { src: `modules/${M}/assets/cartes/chapelle.webp` },
    flags: { [M]: { cle: "chapelle", aventure: "Le Chœur creux", plan: { pieces: [{ nom: "Parvis" }] } } },
    _stats: { compendiumSource: `Compendium.${M}.scenes.Scene.PackScene00000001` }
  }],
  folders: [
    { _id: "DossierTables001", _key: "!folders!DossierTables001", name: "La Kour 40k", type: "RollTable", flags: { [M]: { cle: "tables" } } },
    { _id: "DossierScenes001", _key: "!folders!DossierScenes001", name: "Le Chœur creux", type: "Scene", flags: { [M]: { aventure: "Le Chœur creux" } } }
  ],
  settings: [
    { _id: "ReglageModules001", _key: "!settings!ReglageModules001", key: "core.moduleConfiguration", value: JSON.stringify({ "lakour-mj-ia": true, [M]: true, "lib-wrapper": true }) },
    { _id: "ReglageCompend001", _key: "!settings!ReglageCompend001", key: "core.compendiumConfiguration", value: JSON.stringify({ [`${M}.journaux`]: { folder: "x", sort: 1 }, "dnd5e.items": { folder: "y" } }) },
    { _id: "ReglageInstalle01", _key: "!settings!ReglageInstalle01", key: `${M}.installe`, value: "\"0.14.0\"" },
    { _id: "ReglagePilote0001", _key: "!settings!ReglagePilote0001", key: "lakour-mj-ia.pilote", value: "true" }
  ],
  users: [{ _id: "LaKourGamemaster", _key: "!users!LaKourGamemaster", name: "Gamemaster", role: 4, password: "" }]
});
const dictionnaire = {
  "journaux/PackJournal000001": {
    _nom: "Guide du MJ",
    name: { fr: "Guide du MJ", en: "GM's Guide" },
    "pages.PageDuPack0000001.name": { fr: "Fêtes de la Kour", en: "Festivals of the Kour" },
    "pages.PageDuPack0000001.text.content": { fr: `<p>Voir @UUID[Compendium.${M}.tables.RollTable.PackTable0000001]{Périls}.</p>`, en: `<p>See @UUID[Compendium.${M}.tables.RollTable.PackTable0000001]{Perils}.</p>` }
  },
  "scenes/PackScene00000001": {
    _nom: "Le Chœur creux — La chapelle",
    name: { fr: "Le Chœur creux — La chapelle", en: "The Hollow Choir — The chapel" },
    "flags.lakour-40k.aventure": { fr: "Le Chœur creux", en: "The Hollow Choir" },
    "flags.lakour-40k.plan.pieces.0.nom": { fr: "Parvis", en: "Forecourt" }
  },
  "_manifeste/etiquettes": { "0": { fr: "La Kour 40k", en: "La Kour 40k (English)" } }
};

test("traduireMonde : documents traduits (entrée recopiée sous l'_id du monde, pages re-créées par mémoire), uuid, chemins et drapeaux récrits, moteur intact", () => {
  const avant = monde();
  const { docs, rapport } = traduireMonde(avant, { moduleContenu: M, dictionnaire });
  assert.deepEqual(rapport.erreurs, []);
  assert.deepEqual(rapport.obsoletes, []);
  const journal = docs.journal.find(j => j._id === "MondeJournal00001");
  assert.equal(journal.name, "GM's Guide");
  assert.equal(journal.pages[0].name, "Festivals of the Kour", "page re-créée : traduite par la mémoire");
  assert.equal(journal.pages[0].text.content, `<p>See @UUID[Compendium.${EN}.tables.RollTable.PackTable0000001]{Perils}.</p>`);
  assert.equal(journal._stats.compendiumSource, `Compendium.${EN}.journaux.JournalEntry.PackJournal000001`);
  assert.equal(journal.flags.core.sourceId, `Compendium.${EN}.journaux.JournalEntry.PackJournal000001`);
  assert.deepEqual(journal.flags[EN], { cle: "guide-mj" });
  assert.ok(!(M in journal.flags), "portée française renommée");
  assert.equal(journal._key, "!journal!MondeJournal00001", "mêmes _id et _key");
  const scene = docs.scenes[0];
  assert.equal(scene.name, "The Hollow Choir — The chapel");
  assert.equal(scene.background.src, `modules/${EN}/assets/cartes/chapelle.webp`);
  assert.equal(scene.flags[EN].plan.pieces[0].nom, "Forecourt");
  assert.equal(scene.flags[EN].aventure, "The Hollow Choir");
  // Dossiers : étiquette du manifeste et titre d'aventure, par mémoire.
  assert.deepEqual(docs.folders.map(f => f.name), ["La Kour 40k (English)", "The Hollow Choir"]);
  // Le guide du moteur n'est ni traduit ni compté ; il est tout de même récrit (rien à récrire ici).
  const guide = docs.journal.find(j => j._id === "GuideMoteur000001");
  assert.equal(guide.pages[0].text.content, "<p>Texte du moteur, sans dictionnaire.</p>");
  assert.deepEqual(rapport.parPack.moteur, { traduits: 0, parMemoire: 0, manquants: 0, obsoletes: 0, erreurs: 0 });
  assert.deepEqual(rapport.manquants, []);
  assert.ok(rapport.traduits >= 4 && rapport.parMemoire >= 3, JSON.stringify(rapport));
  // Les documents reçus ne sont pas modifiés.
  assert.equal(avant.journal[0].name, "Guide du MJ");
  assert.equal(avant.scenes[0].flags[M].aventure, "Le Chœur creux");
  assert.ok(!JSON.stringify(docs).includes(`Compendium.${M}.`) && !JSON.stringify(docs).includes(`modules/${M}/`), "plus aucune trace du module français");
});

test("traduireMonde : réglages basculés sur le module anglais (moduleConfiguration, compendiums, installe), le reste et le Gamemaster intacts", () => {
  const { docs } = traduireMonde(monde(), { moduleContenu: M, dictionnaire });
  const reglage = cle => docs.settings.find(s => s.key === cle);
  assert.deepEqual(JSON.parse(reglage("core.moduleConfiguration").value), { "lakour-mj-ia": true, [EN]: true, "lib-wrapper": true });
  assert.deepEqual(JSON.parse(reglage("core.compendiumConfiguration").value), { [`${EN}.journaux`]: { folder: "x", sort: 1 }, "dnd5e.items": { folder: "y" } });
  assert.equal(reglage(`${EN}.installe`).value, "\"0.14.0\"");
  assert.equal(reglage(`${M}.installe`), undefined);
  assert.equal(reglage("lakour-mj-ia.pilote").value, "true");
  assert.equal(reglage(`${EN}.installe`)._key, "!settings!ReglageInstalle01", "_id et _key du réglage inchangés");
  assert.deepEqual(docs.users, monde().users);
  for (const coll of ["messages", "combats", "fog", "cards", "actors", "items"]) assert.deepEqual(docs[coll], []);
});

test("traduireMonde : un texte sans traduction reste en français et est compté manquant ; un dictionnaire dont le français a changé est obsolète", () => {
  const sansRien = traduireMonde(monde(), { moduleContenu: M, dictionnaire: {} });
  assert.equal(sansRien.docs.journal[0].name, "Guide du MJ");
  assert.ok(sansRien.rapport.manquants.includes("journaux/MondeJournal00001:name"));
  assert.equal(sansRien.docs.journal[0]._stats.compendiumSource, `Compendium.${EN}.journaux.JournalEntry.PackJournal000001`, "récrit même sans traduction");
  const change = structuredClone(dictionnaire);
  change["journaux/PackJournal000001"].name.fr = "Guide du MJ (nouveau)";
  const r = traduireMonde(monde(), { moduleContenu: M, dictionnaire: change });
  assert.ok(r.rapport.obsoletes.includes("journaux/MondeJournal00001:name"));
  assert.equal(r.docs.journal[0].name, "Guide du MJ", "une entrée obsolète n'est pas appliquée");
});

test("traduireMonde (Veillées) : les clés lues par le système (maison, repere, nom et texte du plan) ne sont ni traduites ni comptées", () => {
  const V = "lakour-veillees";
  const docs = { ...Object.fromEntries(COLLECTIONS.map(c => [c, []])), scenes: [{
    _id: "SceneVillage00001", _key: "!scenes!SceneVillage00001", name: "Brumecombe — le village",
    flags: { [V]: { cle: "village", plan: { elements: [{ nom: "Maison 1" }, { nom: "Chapelle" }], sons: [{ nom: "la Brume" }] } } },
    _stats: { compendiumSource: `Compendium.${V}.scenes.Scene.SceneVillage00001` }
  }] };
  const dico = { "scenes/SceneVillage00001": { name: { fr: "Brumecombe — le village", en: "Brumecombe — the village" } } };
  const { docs: traduits, rapport } = traduireMonde(docs, { moduleContenu: V, dictionnaire: dico });
  assert.equal(traduits.scenes[0].name, "Brumecombe — the village");
  assert.deepEqual(traduits.scenes[0].flags["lakour-veillees-en"].plan.elements.map(e => e.nom), ["Maison 1", "Chapelle"]);
  assert.deepEqual(rapport.manquants, [], "les clés protégées ne sont pas comptées");
  assert.deepEqual(MONDES[V].traduction.exclure, ["repere", "maison", "nom", "texte"], "mêmes clés que OPTIONS_TRADUCTION de outils/fabriquer-veillees.mjs");
});

test("dictionnairesDuModule : union des packs (module.json et figurants.json à part), étiquettes du manifeste en mémoire", () => {
  const racine = mkdtempSync(join(tmpdir(), "monde-dicos-"));
  try {
    const dossier = join(racine, "modules", M, "contenu", "en");
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(racine, "modules", M, "module.json"), JSON.stringify({ id: M, packs: [{ name: "tables", label: "La Kour 40k — Tables" }] }));
    writeFileSync(join(dossier, "tables.json"), JSON.stringify({ "tables/PackTable0000001": { name: { fr: "Périls", en: "Perils" } } }));
    writeFileSync(join(dossier, "module.json"), JSON.stringify({ title: "x", packs: { tables: "La Kour 40k — Tables (EN)" }, packFolders: { "La Kour 40k": "La Kour 40k (English)" } }));
    writeFileSync(join(dossier, "figurants.json"), JSON.stringify({ garde: "Guard" }));
    const { dictionnaire, traductionsManifeste } = dictionnairesDuModule(racine, M);
    assert.deepEqual(Object.keys(dictionnaire).sort(), ["_manifeste/etiquettes", "tables/PackTable0000001"]);
    assert.deepEqual(Object.values(dictionnaire["_manifeste/etiquettes"]).filter(v => typeof v === "object"),
      [{ fr: "La Kour 40k", en: "La Kour 40k (English)" }, { fr: "La Kour 40k — Tables", en: "La Kour 40k — Tables (EN)" }]);
    assert.equal(traductionsManifeste.title, "x");
    assert.ok(!("garde" in dictionnaire));
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test("contexteDuDepot : langue en -> module cible, id du monde et manifeste anglais ; langue inconnue refusée", () => {
  const racine = mkdtempSync(join(tmpdir(), "monde-ctx-"));
  try {
    mkdirSync(join(racine, "modules", M), { recursive: true });
    writeFileSync(join(racine, "modules", M, "module.json"), JSON.stringify({ id: M, version: "0.14.0" }));
    const fr = contexteDuDepot(racine);
    assert.deepEqual([fr.langue, fr.anglais, fr.moduleCible, fr.idMonde, fr.fichierManifeste], ["fr", false, M, "la-kour-40k", "world.json"]);
    assert.deepEqual([...fr.scopes].sort(), ["impmal", M, "lakour-mj-ia"]);
    const en = contexteDuDepot(racine, { langue: "en" });
    assert.deepEqual([en.langue, en.anglais, en.moduleCible, en.idMonde, en.fichierManifeste], ["en", true, EN, "la-kour-40k-en", "world-en.json"]);
    assert.deepEqual([...en.scopes].sort(), ["impmal", EN, "lakour-mj-ia"]);
    assert.equal(en.moduleContenu, M, "le module français reste connu (dictionnaires, sources)");
    assert.throws(() => contexteDuDepot(racine, { langue: "de" }), /langue inconnue/);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- --rafraichir

// Un monde extrait d'un serveur plus ancien que le contenu : un journal à l'ancienne version (une page renommée, une page ajoutée
// par le MJ IA, une page manquante), un journal dont la source a disparu du module, une scène jouée (sombre, dessins sans auteur,
// carte en relief), un lieu importé en jeu, des guides du MJ IA d'une vieille version, le marqueur installe ancien, un dossier vide.
const G = "LaKourGamemaster";
const sourcesDuPack = () => ({
  journaux: [{
    _id: "PackJournal000001", _key: "!journal!PackJournal000001", name: "Guide du MJ", folder: null, sort: 0, ownership: { default: 0 },
    flags: { [M]: { cle: "guide-mj" } },
    pages: [
      { _id: "PagePack00000001", _key: "!journal.pages!PackJournal000001.PagePack00000001", name: "Automatismes", type: "text", text: { content: "<p>Nouveau.</p>" } },
      { _id: "PagePack00000002", _key: "!journal.pages!PackJournal000001.PagePack00000002", name: "Nouvelle page", type: "text", text: { content: "<p>Ajoutée.</p>" } }
    ]
  }, {
    _id: "PackLivre0000001", _key: "!journal!PackLivre0000001", name: "Le livre de la Kour", ownership: { default: 2 }, flags: { [M]: { cle: "livre" } },
    pages: [{ _id: "PageLivre0000001", _key: "!journal.pages!PackLivre0000001.PageLivre0000001", name: "Le sous-secteur", type: "text", text: { content: "<p>Lore.</p>" } }]
  }],
  scenes: [{
    _id: "PackScene00000001", _key: "!scenes!PackScene00000001", name: "Marché", navigation: true, active: false,
    environment: { darknessLevel: 0.55 },
    levels: [{ _id: "defaultLevel0000", _key: "!scenes.levels!PackScene00000001.defaultLevel0000", background: { src: `modules/${M}/assets/cartes/marche.svg` } }],
    drawings: [{ _id: "Dessin0000000001", _key: "!scenes.drawings!PackScene00000001.Dessin0000000001", author: "AuteurDuPack0001", hidden: true }],
    notes: [{ _id: "Note000000000001", _key: "!scenes.notes!PackScene00000001.Note000000000001", entryId: "PackJournal000001" }],
    sounds: [{ _id: "Son0000000000001", _key: "!scenes.sounds!PackScene00000001.Son0000000000001", path: `modules/${M}/assets/sons/foule.ogg` }],
    flags: { [M]: { cle: "marche-sept-puits", aventure: "Le Chœur creux" } }
  }, {
    _id: "PackLieu00000001", _key: "!scenes!PackLieu00000001", name: "Lieu — Bouge", flags: { [M]: { cle: "lieu-bouge" } }
  }],
  tables: [{ _id: "PackTable0000001", _key: "!tables!PackTable0000001", name: "Périls du Warp", flags: { [M]: { cle: "perils", installer: "perils" } },
    results: [{ _id: "Resultat00000001", _key: "!tables.results!PackTable0000001.Resultat00000001", text: "Rien" }] }]
});
const typesPacks = { journaux: "JournalEntry", scenes: "Scene", tables: "RollTable" };
const ancien = () => ({
  ...Object.fromEntries(COLLECTIONS.map(c => [c, []])),
  journal: [{
    _id: "MondeJournal00001", _key: "!journal!MondeJournal00001", name: "Guide du MJ", folder: "DossierJournaux1", sort: 300, ownership: { default: 0 },
    flags: { [M]: { cle: "guide-mj", version: "0.12.0" } }, _stats: { compendiumSource: `Compendium.${M}.journaux.JournalEntry.PackJournal000001`, createdTime: 5 },
    pages: [
      { _id: "PagePack00000001", _key: "!journal.pages!MondeJournal00001.PagePack00000001", name: "Conseils", type: "text", text: { content: "<p>Ancien.</p>" } },
      { _id: "PageDuMjIa000001", _key: "!journal.pages!MondeJournal00001.PageDuMjIa000001", name: "Ajout en partie", flags: { "lakour-mj-ia": { ajoutee: true } } }
    ]
  }, {
    _id: "JournalDisparu01", _key: "!journal!JournalDisparu01", name: "Ancien guide", flags: { [M]: { cle: "ancien" } },
    _stats: { compendiumSource: `Compendium.${M}.journaux.JournalEntry.SourceDisparue01` }, pages: []
  }, {
    _id: "GuideMoteur000001", _key: "!journal!GuideMoteur000001", name: "MJ IA — Guide du MJ", folder: null, ownership: { default: 0 },
    flags: { "lakour-mj-ia": { guide: "guide-mj", versionGuide: 14 } }, pages: [{ _id: "PageVieille00001", name: "Vieille page" }]
  }],
  scenes: [{
    _id: "MondeScene000001", _key: "!scenes!MondeScene000001", name: "Marché", folder: "DossierChoeur001", sort: 7, navigation: false, active: false,
    environment: { darknessLevel: 0.15 }, flags: { [M]: { cle: "marche-sept-puits", version: "0.12.0" }, fxmaster: { migration: 1 } },
    _stats: { compendiumSource: `Compendium.${M}.scenes.Scene.PackScene00000001` },
    levels: [{ _id: "defaultLevel0000", background: { src: `modules/${M}/assets/cartes/3d/marche.svg` } }],
    drawings: [{ _id: "Dessin0000000001", author: null, hidden: true }], notes: []
  }, {
    _id: "MondeLieu0000001", _key: "!scenes!MondeLieu0000001", name: "Lieu — Bouge", folder: null, active: true, flags: { [M]: { cle: "lieu-bouge" } },
    _stats: { compendiumSource: `Compendium.${M}.scenes.Scene.PackLieu00000001` }
  }],
  tables: [{ _id: "PackTable0000001", _key: "!tables!PackTable0000001", name: "Périls du Warp", folder: "DossierTables001", flags: { [M]: { cle: "perils", installer: "perils" } },
    _stats: { compendiumSource: `Compendium.${M}.tables.RollTable.PackTable0000001` }, results: [] }],
  folders: [
    { _id: "DossierJournaux1", _key: "!folders!DossierJournaux1", name: "Rangement", type: "JournalEntry", flags: {} },
    { _id: "DossierChoeur001", _key: "!folders!DossierChoeur001", name: "Le Chœur creux", type: "Scene", flags: { [M]: { dossier: true } } },
    { _id: "DossierTables001", _key: "!folders!DossierTables001", name: "La Kour 40k", type: "RollTable", flags: { [M]: { dossier: true } } },
    { _id: "DossierVide00001", _key: "!folders!DossierVide00001", name: "Vide", type: "Scene", flags: { [M]: { dossier: true } } }
  ],
  settings: [
    { _id: "ReglageInstalle01", _key: "!settings!ReglageInstalle01", key: `${M}.installe`, value: "\"0.12.0\"" },
    { _id: "ReglageStyle00001", _key: "!settings!ReglageStyle00001", key: "lakour-mj-ia.styleVisuel", value: "\"3d\"" },
    { _id: "ReglageTables0001", _key: "!settings!ReglageTables0001", key: "impmal.tableSettings", value: JSON.stringify({ perils: "PackTable0000001" }) }
  ],
  users: [{ _id: G, _key: `!users!${G}`, name: "Gamemaster", role: 4, password: "" }]
});
const guideFactice = {
  VERSION_GUIDE: 17,
  GUIDES: {
    fr: { mj: [{ titre: "Démarrer", texte: "Texte **MJ**." }, { titre: "Console", texte: "- un\n- deux" }], joueurs: [{ titre: "Jouer", texte: "Parle." }],
      noms: { "guide-mj": "MJ IA — Guide du MJ", "guide-joueurs": "MJ IA — Guide des joueurs" } },
    en: { mj: [{ titre: "Getting started", texte: "GM **text**." }, { titre: "Console", texte: "- one\n- two" }], joueurs: [{ titre: "Play", texte: "Talk." }],
      noms: { "guide-mj": "MJ IA — GM's Guide", "guide-joueurs": "MJ IA — Players' Guide" } }
  }
};
const versHTMLFactice = t => `<p>${t}</p>`;
const optionsRafraichir = () => ({ moduleContenu: M, sources: sourcesDuPack(), typesPacks, versionContenu: "0.14.0", guide: guideFactice, versHTML: versHTMLFactice,
  plans: { "marche-sept-puits": { largeur: 24 } }, coreVersion: "14.369", systemVersion: "4.1.0" });

test("rafraichirMonde : journaux repris du compendium (identifiant, dossier et rang du monde gardés), manquant ajouté, disparu retiré", () => {
  const { docs, rapport } = rafraichirMonde(ancien(), optionsRafraichir());
  const guide = docs.journal.find(j => j._id === "MondeJournal00001");
  assert.deepEqual([guide.folder, guide.sort, guide._key], ["DossierJournaux1", 300, "!journal!MondeJournal00001"]);
  assert.deepEqual(guide.pages.map(p => [p.name, p._key]), [
    ["Automatismes", "!journal.pages!MondeJournal00001.PagePack00000001"], ["Nouvelle page", "!journal.pages!MondeJournal00001.PagePack00000002"]
  ], "pages du compendium sous l'_id du monde ; la page ajoutée en partie disparaît");
  assert.deepEqual(guide.flags[M], { cle: "guide-mj", version: "0.14.0" });
  assert.equal(guide._stats.createdTime, 5, "_stats du monde gardées");
  const livre = docs.journal.find(j => j.flags[M]?.cle === "livre");
  assert.equal(livre._id, "PackLivre0000001", "même identifiant qu'au compendium, libre dans le monde");
  assert.equal(livre.folder, null, "40k : journaux à la racine");
  assert.equal(livre._stats.compendiumSource, `Compendium.${M}.journaux.JournalEntry.PackLivre0000001`);
  assert.deepEqual(livre.ownership, { default: 2 }, "visibilité du compendium");
  assert.ok(!docs.journal.some(j => j._id === "JournalDisparu01"), "journal dont la source a disparu : retiré");
  assert.ok(rapport.some(l => /journal ajouté : Le livre de la Kour/.test(l)) && rapport.some(l => /retiré : Ancien guide/.test(l)), rapport.join("\n"));
});

test("rafraichirMonde : scène reprise du compendium (épingles raccordées, carte vivante, dessins au Gamemaster, plan, style, active), lieu de jeu retiré", () => {
  const { docs } = rafraichirMonde(ancien(), optionsRafraichir());
  assert.deepEqual(docs.scenes.map(s => s._id), ["MondeScene000001"], "le lieu importé en jeu n'est pas posé par l'installation");
  const s = docs.scenes[0];
  assert.deepEqual([s.folder, s.sort, s.navigation, s.active], ["DossierChoeur001", 7, false, true]);
  assert.equal(s.environment.darknessLevel, 0.55, "réglages de la carte : ceux du compendium, pas ceux laissés par la partie");
  assert.equal(s.levels[0].background.src, `modules/${M}/assets/cartes/3d/marche.svg`, "style relief du monde");
  assert.equal(s.levels[0]._key, "!scenes.levels!MondeScene000001.defaultLevel0000");
  assert.equal(s.drawings[0].author, G);
  assert.equal(s.notes[0].entryId, "MondeJournal00001", "épingle vers le journal du monde");
  assert.equal(s.notes[0].flags[M].carte, true);
  assert.equal(s.sounds[0].flags[M].carte, true);
  assert.deepEqual(s.flags, { [M]: { cle: "marche-sept-puits", aventure: "Le Chœur creux", version: "0.14.0", plan: { largeur: 24 } } }, "drapeaux du compendium seulement");
});

test("rafraichirMonde : tables, réglages, guides du MJ IA, dossiers vides ; un second passage ne change rien", () => {
  const { docs, rapport } = rafraichirMonde(ancien(), optionsRafraichir());
  const reglage = cle => docs.settings.find(s => s.key === cle)?.value;
  assert.equal(reglage(`${M}.installe`), "\"0.14.0\"");
  assert.deepEqual(JSON.parse(reglage("impmal.tableSettings")), { perils: "PackTable0000001" });
  const table = docs.tables[0];
  assert.deepEqual([table.folder, table.results.length], ["DossierTables001", 1]);
  const mj = docs.journal.find(j => j._id === "GuideMoteur000001");
  assert.equal(mj.name, "MJ IA — Guide du MJ");
  assert.deepEqual(mj.flags["lakour-mj-ia"], { guide: "guide-mj", versionGuide: 17, langueGuide: "fr" });
  assert.deepEqual(mj.pages.map(p => [p.name, p.text.content]), [["Démarrer", "<p>Texte **MJ**.</p>"], ["Console", "<p>- un\n- deux</p>"]]);
  const joueurs = docs.journal.find(j => j.flags["lakour-mj-ia"]?.guide === "guide-joueurs");
  assert.equal(joueurs._id, idStable("la-kour-40k.guide.guide-joueurs"), "guide manquant : créé, identifiant stable");
  assert.deepEqual(joueurs.ownership, { default: 2 });
  assert.ok(!docs.folders.some(f => f._id === "DossierVide00001"), "dossier vide retiré");
  assert.ok(rapport.length > 0);
  const second = rafraichirMonde(docs, optionsRafraichir());
  assert.deepEqual(second.rapport, [], "idempotent");
  assert.deepEqual(second.docs, docs);
});

test("rafraichirMonde (Fénoir) : journaux de deux packs dans un dossier créé, seule la carte de l'île posée et active", () => {
  const F = "lakour-fenoir";
  const sources = {
    guides: [{ _id: "GuideFenoir00001", _key: "!journal!GuideFenoir00001", name: "Guide du joueur", flags: { [F]: { cle: "guide" } }, pages: [] }],
    mj: [{ _id: "MjFenoir00000001", _key: "!journal!MjFenoir00000001", name: "Guide du MJ", flags: { [F]: { cle: "guide-mj" } }, pages: [] }],
    scenes: [
      { _id: "CarteReunion0001", _key: "!scenes!CarteReunion0001", name: "Carte de La Réunion", flags: { [F]: { cle: "carte-de-la-reunion" } },
        notes: [{ _id: "NoteReunion00001", _key: "!scenes.notes!CarteReunion0001.NoteReunion00001", entryId: "MjFenoir00000001" }] },
      { _id: "LieuCase00000001", _key: "!scenes!LieuCase00000001", name: "Lieu — Case créole", flags: { [F]: { cle: "lieu-case-creole" } } }
    ]
  };
  const vide = { ...Object.fromEntries(COLLECTIONS.map(c => [c, []])), users: [{ _id: G, name: "Gamemaster", role: 4 }] };
  const { docs } = rafraichirMonde(vide, { moduleContenu: F, sources, typesPacks: { guides: "JournalEntry", mj: "JournalEntry", scenes: "Scene" }, versionContenu: "0.2.0" });
  assert.deepEqual(docs.journal.map(j => j._id), ["GuideFenoir00001", "MjFenoir00000001"]);
  const dossierJ = docs.folders.find(f => f.type === "JournalEntry");
  assert.deepEqual([dossierJ.name, dossierJ.flags[F]], ["Fénoir", { dossier: "Fénoir" }]);
  assert.ok(docs.journal.every(j => j.folder === dossierJ._id && j.flags[F].version === "0.2.0"));
  assert.deepEqual(docs.scenes.map(s => [s.name, s.active]), [["Carte de La Réunion", true]]);
  assert.ok(!("version" in docs.scenes[0].flags[F]) && !("carte" in (docs.scenes[0].notes[0].flags?.[F] ?? {})), "Fénoir : ni version ni carte vivante sur la scène");
  assert.equal(docs.settings.find(s => s.key === `${F}.installe`).value, "\"0.2.0\"");
  assert.equal(docs.journal.filter(j => j.flags["lakour-mj-ia"]).length, 0, "sans guide fourni, pas de guide du MJ IA");
});

test("journalDuGuide : mêmes identifiants de pages en français et en anglais, nom et langue de la version anglaise", () => {
  const base = { _id: "GuideMoteur000001", folder: "Dossier000000001", sort: 4, flags: { autre: { x: 1 } } };
  const fr = journalDuGuide(base, "guide-mj", { langue: "fr", guide: guideFactice, versHTML: versHTMLFactice });
  const en = journalDuGuide(fr, "guide-mj", { langue: "en", guide: guideFactice, versHTML: versHTMLFactice });
  assert.deepEqual(en.pages.map(p => p._id), fr.pages.map(p => p._id));
  assert.equal(en.pages[0]._key, `!journal.pages!GuideMoteur000001.${fr.pages[0]._id}`);
  assert.deepEqual([en.name, en.pages[0].name, en.flags["lakour-mj-ia"].langueGuide, en.folder, en.sort], ["MJ IA — GM's Guide", "Getting started", "en", "Dossier000000001", 4]);
  assert.deepEqual(en.flags.autre, { x: 1 });
});

test("guideDuMoteur : le vrai guide (scripts/guide.js) et sa mise en HTML hors de Foundry, sans laisser de global", async () => {
  const { guide, versHTML } = await guideDuMoteur();
  assert.ok(Number.isInteger(guide.VERSION_GUIDE) && guide.GUIDES.fr.mj.length === guide.GUIDES.en.mj.length);
  assert.equal(versHTML("# Titre\n\n- **un**\n- deux"), "<h2>Titre</h2><ul><li><strong>un</strong></li><li>deux</li></ul>");
  assert.ok(!("foundry" in globalThis));
});

test("trier : ambiances jouées retirées, dessins au Gamemaster, le Gamemaster créé n'est pas un utilisateur du serveur", () => {
  const ctx40k = { scopes: new Set([M, "lakour-mj-ia", "impmal"]), monde: MONDES[M], moduleContenu: M };
  const docs = { ...Object.fromEntries(COLLECTIONS.map(c => [c, []])),
    playlists: [{ _id: "Ambiances0000001", name: "Ambiances (MJ IA)", flags: { "lakour-mj-ia": { ambiances: true } } }],
    scenes: [{ _id: "Scene00000000001", name: "Marché", flags: { [M]: { cle: "marche" } },
      drawings: [{ _id: "Dessin0000000001", author: "UnJoueurDuServ01" }, { _id: "Dessin0000000002", author: G }], notes: [{ _id: "Note000000000001", text: `vu par ${G}` }] }],
    users: [{ _id: G, name: "Gamemaster", role: 4 }, { _id: "UnJoueurDuServ01", name: "Quelqu'un", role: 1 }] };
  const { gardes, utilisateurs } = trier(docs, ctx40k);
  assert.deepEqual(gardes.playlists, []);
  assert.deepEqual(gardes.scenes[0].drawings.map(d => d.author), [G, G]);
  assert.equal(gardes.scenes[0].notes[0].text, `vu par ${G}`, "l'identifiant du Gamemaster créé n'est pas effacé");
  assert.deepEqual(utilisateurs.ids, ["UnJoueurDuServ01"]);
});

test("trierReglage (Fénoir) : choix du MJ gardés, partie et monde scellé retirés", () => {
  const ctx = { moduleContenu: "lakour-fenoir", systeme: "lakour-survie" };
  assert.equal(trierReglage("lakour-survie.dateDepart", "\"2026-12-20\"", ctx).garde, true);
  for (const cle of ["partie", "coffre", "mondeClair", "monde", "inconnu"]) assert.equal(trierReglage(`lakour-survie.${cle}`, "{}", ctx).garde, false, cle);
});

test("traduireMonde : les modules de traduction française sont désactivés dans le monde anglais", () => {
  const docs = monde();
  docs.settings[0].value = JSON.stringify({ [M]: true, "fr-core": true, "dnd5e_fr-FR": true, babele: true, "lib-wrapper": true });
  const { docs: en } = traduireMonde(docs, { moduleContenu: M, dictionnaire });
  const actifs = JSON.parse(en.settings.find(s => s.key === "core.moduleConfiguration").value);
  assert.deepEqual(actifs, { [EN]: true, "fr-core": false, "dnd5e_fr-FR": false, babele: false, "lib-wrapper": true });
  assert.deepEqual(MODULES_FRANCAIS, ["fr-core", "dnd5e_fr-FR", "babele"]);
});

test("cheminSelonStyle, versionDuContenu, manifesteAJour", () => {
  assert.equal(cheminSelonStyle(`modules/${M}/assets/cartes/a.svg`, "3d", M), `modules/${M}/assets/cartes/3d/a.svg`);
  assert.equal(cheminSelonStyle(`modules/${M}/assets/cartes/3d/a.svg`, "2d", M), `modules/${M}/assets/cartes/a.svg`);
  assert.equal(cheminSelonStyle("icons/x.svg", "3d", M), "icons/x.svg");
  const racine = mkdtempSync(join(tmpdir(), "monde-version-"));
  try {
    mkdirSync(join(racine, "modules", M, "scripts"), { recursive: true });
    writeFileSync(join(racine, "modules", M, "module.json"), JSON.stringify({ id: M, version: "0.14.0" }));
    assert.equal(versionDuContenu(racine, M), "0.14.0", "sans main.js : la version du manifeste");
    writeFileSync(join(racine, "modules", M, "scripts", "main.js"), `const VERSION_CONTENU = "0.13.2";  // commentaire\n`);
    assert.equal(versionDuContenu(racine, M), "0.13.2");
  } finally { rmSync(racine, { recursive: true, force: true }); }
  const m = manifesteAJour({ ...manifesteFr, version: "0.13.0", relationships: { requires: [
    { id: "impmal", type: "system", compatibility: { minimum: "4.1.0" } }, { id: M, compatibility: { minimum: "0.13.0" } }, { id: "lakour-mj-ia", compatibility: { minimum: "0.39.0" } }] } },
  { moduleContenu: M, manifeste: { version: "0.14.0" }, moteur: { version: "0.40.0" } });
  assert.equal(m.version, "0.14.0");
  assert.deepEqual(m.relationships.requires.map(r => r.compatibility.minimum), ["4.1.0", "0.14.0", "0.40.0"]);
});

test("réglages d'un module désactivé dans le monde : écartés (item-piles réglé pour dnd5e dans un monde impmal)", async () => {
  const { trierReglage, modulesActifs } = await import("../outils/empaqueter-monde.mjs");
  const settings = [{ key: "core.moduleConfiguration", value: JSON.stringify({ "lakour-40k": true, "dice-so-nice": true, "item-piles": false }) }];
  const actifs = modulesActifs(settings);
  assert.deepEqual([...actifs].sort(), ["dice-so-nice", "lakour-40k"]);
  const ctx = { moduleContenu: "lakour-40k", systeme: "impmal", actifs };
  assert.equal(trierReglage("item-piles.currencies", "[]", ctx).garde, false);
  assert.equal(trierReglage("autoanimations.debug", "false", ctx).garde, false, "module absent de la configuration");
  assert.equal(trierReglage("dice-so-nice.maxDiceNumber", "20", ctx).garde, true);
  assert.equal(trierReglage("impmal.unReglage", "1", ctx).garde, true, "le système n'est pas un module");
  assert.equal(trierReglage("core.moduleConfiguration", "{}", ctx).garde, true);
  assert.equal(trierReglage("item-piles.currencies", "[]", { moduleContenu: "lakour-40k", systeme: "impmal" }).garde, true, "sans configuration lisible, rien n'est écarté");
  assert.equal(modulesActifs([{ key: "core.moduleConfiguration", value: "illisible" }]), null);
  assert.equal(modulesActifs([]), null);
});
