// outils/empaqueter-monde.mjs, monde vierge ANGLAIS (--langue en) : le manifeste anglais (id -en, titre et description de
// world.en.json, module requis <module>-en, fond et archive anglais), la traduction des documents du monde par les dictionnaires
// du module (entrée du compendium recopiée sous l'_id du monde, mémoire, uuid et drapeaux récrits, documents du moteur gardés
// tels quels), les réglages basculés (core.moduleConfiguration, compendiums, <module>.installe), les clés protégées des
// Veillées, et le contexte du dépôt. Sans Foundry, sans CLI : fonctions pures sur des documents inventés.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MONDES, COLLECTIONS, contexteDuDepot, dictionnairesDuModule, manifesteDuMondeAnglais, traduireMonde } from "../outils/empaqueter-monde.mjs";

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
