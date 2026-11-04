// outils/traduction.mjs : extraction du squelette d'un dictionnaire, fusion avec l'existant (traductions conservées,
// sources changées signalées), application (anglais appliqué, mémoire, uuid et drapeaux récrits, noms des références
// réalignés) et vérification des balises et des liens.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { appliquer, ecartsBalises, estTexte, extraire, fusionner, lireChemin, marqueurs, recrireIdentifiant } from "../outils/traduction.mjs";

const MODULE = "lakour-essai";
const talent = {
  _id: "AAAAAAAAAAAAAAAA", _key: "!items!AAAAAAAAAAAAAAAA", name: "Accès aux archives", type: "talent",
  img: "icons/svg/upgrade.svg",
  system: { notes: { player: "<p>Vous savez où chercher : <strong>+1 DR</strong> aux recherches.</p>", gm: "" },
    requirement: { value: "Faction : Inquisition", script: "" }, taken: 1, xpCost: 100, category: "standard" },
  effects: [{ _id: "EEEEEEEEEEEEEEEE", name: "Accès aux archives (+1 DR)", type: "base",
    system: { scriptData: [{ label: "Accès aux archives (+1 DR)", trigger: "dialog", script: "args.fields.SL += 1;", options: { hideScript: "return !['logic'].includes(args.skill);" } }],
      transferData: { documentType: "Actor", type: "document" } } }],
  flags: { [MODULE]: { cle: "acces-aux-archives" }, "lakour-mj-ia": { note: "Jamais extrait" } },
  _stats: { coreVersion: "14.369", systemId: "impmal", systemVersion: "4.1.0" }
};
const role = {
  _id: "BBBBBBBBBBBBBBBB", name: "Archiviste", type: "role", img: "icons/svg/book.svg",
  system: { notes: { player: "<p>Le rat d'archives.</p>", gm: "" }, skills: { value: 6, list: ["logic", "lore"] },
    talents: { number: 1, list: [{ uuid: `Compendium.${MODULE}.talents.Item.AAAAAAAAAAAAAAAA`, id: "AAAAAAAAAAAAAAAA", name: "Accès aux archives", diff: {} }] } },
  flags: { [MODULE]: { cle: "archiviste" } }
};
const table = {
  _id: "CCCCCCCCCCCCCCCC", name: "Mission — Accroches", formula: "1d2", description: "<p>Le fait étrange qui ouvre une affaire.</p>",
  results: [
    { _id: "RRRRRRRRRRRRRRR1", type: "text", name: "La liste du relais", description: "<p>Un relais vox émet une liste de noms : @UUID[Compendium.lakour-essai.talents.Item.AAAAAAAAAAAAAAAA]{le talent}. Jet : [[/roll 1d10 #Dégâts]].</p>", range: [1, 1], flags: {} },
    { _id: "RRRRRRRRRRRRRRR2", type: "document", name: "Accès aux archives", description: "", documentUuid: `Compendium.${MODULE}.talents.Item.AAAAAAAAAAAAAAAA`, range: [2, 2], flags: {} }
  ],
  flags: { [MODULE]: { cle: "accroches", installer: null } }
};
const scene = {
  _id: "DDDDDDDDDDDDDDDD", name: "Marché des Sept-Puits", navName: "Marché des Sept-Puits",
  levels: [{ _id: "defaultLevel0000", name: "Niveau principal", background: { color: "#18181b", src: `modules/${MODULE}/assets/cartes/marche.svg` } }],
  drawings: [{ _id: "GGGGGGGGGGGGGGGG", text: "Parvis", textColor: "#ffffff", author: "k4OpfQVJdDNKBBof", hidden: true }],
  regions: [{ _id: "HHHHHHHHHHHHHHHH", name: "Parvis", color: "#4f8cc9", behaviors: [{ _id: "IIIIIIIIIIIIIIII", name: "Parvis", type: "displayScrollingText", system: { text: "Encens et cire.", events: ["tokenAnimateIn"], color: "#e6d3a3" } }] }],
  notes: [{ _id: "JJJJJJJJJJJJJJJJ", entryId: "mtUEwbk8I8ZMVFcT", pageId: "BwCS7vOVG44YAuJ4", text: "Les muets du parvis", texture: { src: "icons/svg/silenced.svg", fit: "contain" } }],
  flags: { [MODULE]: { cle: "marche", description: "Le marché couvert.", aventure: "Le Chœur creux",
    plan: { largeur: 24, lumiere: "penombre", pieces: [{ nom: "Parvis", sol: "pierre" }, { nom: "Nef", sol: "bois" }], ouvertures: [{ cote: "ouest", type: "passage" }] } } }
};
const documents = () => [{ pack: "talents", doc: structuredClone(talent) }, { pack: "creation", doc: structuredClone(role) },
  { pack: "tables", doc: structuredClone(table) }, { pack: "scenes", doc: structuredClone(scene) }];

test("estTexte : du texte, pas des clés, chemins, uuid, couleurs ni formules", () => {
  for (const t of ["Parvis", "Soi", "Humain", "1 personne", "<p>Texte</p>", "Faction : Inquisition", "Instantanée"]) assert.ok(estTexte(t), t);
  for (const t of ["medium", "las", "root", "opt36", "and", "modules/x/a.svg", "icons/svg/d20.svg", "Compendium.x.y.Item.AAAAAAAAAAAAAAAA",
    "#ffffff", "1d10+2", "return true;", "AAAAAAAAAAAAAAAA", "", "  ", "tokenAnimateIn", "displayScrollingText"]) assert.ok(!estTexte(t), t);
});

test("extraire : les champs traduisibles, par pack/_id, sans les identifiants, images, scripts ni drapeaux des autres modules", () => {
  const { squelette, tout } = extraire(documents(), { module: MODULE });
  const t = squelette.talents["talents/AAAAAAAAAAAAAAAA"];
  assert.equal(t._nom, "Accès aux archives");
  assert.deepEqual(Object.keys(t).filter(k => !k.startsWith("_")).sort(),
    ["effects.EEEEEEEEEEEEEEEE.name", "name", "system.notes.player", "system.requirement.value"].sort());
  assert.deepEqual(t.name, { fr: "Accès aux archives", en: "" });
  // Doublon dans le document (libellé du script = nom de l'effet) : une seule entrée dans le squelette, deux dans « tout ».
  assert.ok("effects.EEEEEEEEEEEEEEEE.system.scriptData.0.label" in tout.talents["talents/AAAAAAAAAAAAAAAA"]);
  // Le nom d'une référence (talent d'un rôle) n'est pas extrait : il suit sa cible.
  const r = squelette.creation["creation/BBBBBBBBBBBBBBBB"];
  assert.deepEqual(Object.keys(r).filter(k => !k.startsWith("_")).sort(), ["name", "system.notes.player"]);
  // Table : description, résultats texte (name, description) ; pas le résultat « document ».
  const tb = squelette.tables["tables/CCCCCCCCCCCCCCCC"];
  assert.deepEqual(Object.keys(tb).filter(k => !k.startsWith("_")).sort(),
    ["description", "name", "results.RRRRRRRRRRRRRRR1.description", "results.RRRRRRRRRRRRRRR1.name"].sort());
  // Scène : nom, niveau, dessins, zones (nom, texte des comportements), épingles, drapeaux du module (description, aventure,
  // noms des pièces) ; « Parvis » listé une fois ; ni couleurs, ni sols, ni auteur.
  const s = squelette.scenes["scenes/DDDDDDDDDDDDDDDD"];
  const chemins = Object.keys(s).filter(k => !k.startsWith("_")).sort();
  assert.deepEqual(chemins, ["drawings.GGGGGGGGGGGGGGGG.text", `flags.${MODULE}.aventure`, `flags.${MODULE}.description`, `flags.${MODULE}.plan.pieces.1.nom`,
    "levels.defaultLevel0000.name", "name", "notes.JJJJJJJJJJJJJJJJ.text", "regions.HHHHHHHHHHHHHHHH.behaviors.IIIIIIIIIIIIIIII.system.text"].sort());
  assert.equal(s["drawings.GGGGGGGGGGGGGGGG.text"].fr, "Parvis");
  assert.ok(!JSON.stringify(squelette).includes("Jamais extrait"), "drapeaux d'un autre module");
});

test("extraire : champs explicites et packs ignorés", () => {
  const { squelette } = extraire(documents(), { module: MODULE, heuristique: false, champs: ["name", "results[].name"], ignorerPacks: ["scenes"] });
  assert.deepEqual(Object.keys(squelette).sort(), ["creation", "tables", "talents"]);
  // Le nom du résultat « document » (même texte que le talent, déjà listé) est un doublon : absent du squelette, présent dans « tout ».
  assert.deepEqual(Object.keys(squelette.tables["tables/CCCCCCCCCCCCCCCC"]).filter(k => !k.startsWith("_")).sort(),
    ["name", "results.RRRRRRRRRRRRRRR1.name"].sort());
  assert.ok("results.RRRRRRRRRRRRRRR2.name" in extraire(documents(), { module: MODULE, heuristique: false, champs: ["results[].name"] }).tout.tables["tables/CCCCCCCCCCCCCCCC"]);
});

test("fusionner : traductions conservées, source changée -> enAncien, document disparu retiré", () => {
  const { squelette, tout } = extraire(documents(), { module: MODULE });
  const existant = {
    "talents/AAAAAAAAAAAAAAAA": { _nom: "Accès aux archives", name: { fr: "Accès aux archives", en: "Archive Access" },
      "system.requirement.value": { fr: "Faction : Inquisiteurs", en: "Faction: Inquisitors" },
      "effects.EEEEEEEEEEEEEEEE.system.scriptData.0.label": { fr: "Accès aux archives (+1 DR)", en: "Archive Access (+1 SL)" } },
    "talents/ZZZZZZZZZZZZZZZZ": { _nom: "Disparu", name: { fr: "Disparu", en: "Gone" } }
  };
  const { dictionnaire, rapport } = fusionner(squelette.talents, existant, tout.talents);
  const t = dictionnaire["talents/AAAAAAAAAAAAAAAA"];
  assert.deepEqual(t.name, { fr: "Accès aux archives", en: "Archive Access" });
  assert.deepEqual(t["system.requirement.value"], { fr: "Faction : Inquisition", en: "", enAncien: "Faction: Inquisitors" });
  assert.deepEqual(t["system.notes.player"].en, "");
  // Doublon traduit à la main : conservé bien que le squelette ne le reliste pas.
  assert.equal(t["effects.EEEEEEEEEEEEEEEE.system.scriptData.0.label"].en, "Archive Access (+1 SL)");
  assert.ok(!("talents/ZZZZZZZZZZZZZZZZ" in dictionnaire));
  assert.deepEqual(rapport.obsoletes, ["talents/AAAAAAAAAAAAAAAA:system.requirement.value"]);
  assert.deepEqual(rapport.supprimees, ["talents/ZZZZZZZZZZZZZZZZ"]);
  assert.equal(rapport.conservees, 2);
  // Relancer la fusion sur son propre résultat ne change rien (idempotence).
  assert.deepEqual(fusionner(squelette.talents, dictionnaire, tout.talents).dictionnaire, dictionnaire);
});

test("marqueurs et écarts : balises, src, liens, jets et variables ; le texte libre est ignoré", () => {
  const fr = "<p>Voir @UUID[Compendium.x.y.Item.AAAAAAAAAAAAAAAA]{le talent} : [[/roll 1d10 #Dégâts]] pour {nom}, %valeur%.</p><img src=\"a.svg\">";
  const en = "<p>See @UUID[Compendium.x.y.Item.AAAAAAAAAAAAAAAA]{the talent}: [[/roll 1d10 #Damage]] for {nom}, %valeur%.</p><img src=\"a.svg\">";
  assert.deepEqual(ecartsBalises(fr, en), []);
  assert.deepEqual(marqueurs(fr).filter(m => m.startsWith("[[")), ["[[/roll 1d10]]"]);
  assert.ok(ecartsBalises(fr, en.replace("</p>", "")).some(e => e.startsWith("</p>")));
  assert.ok(ecartsBalises(fr, en.replace("AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB")).length >= 2, "lien changé");
  assert.ok(ecartsBalises(fr, en.replace("{nom}", "{name}")).length >= 2, "variable changée");
  assert.ok(ecartsBalises("<p>a</p>", "<p>a</p><p>b</p>").some(e => e.startsWith("<p> : 1 en français, 2 en anglais")));
  assert.ok(ecartsBalises("a", "<em>a</em>").some(e => e.includes("absent du français")));
});

test("appliquer : anglais appliqué, français gardé et compté manquant, mémoire, uuid et drapeaux récrits, noms réalignés", () => {
  const dictionnaire = {
    "talents/AAAAAAAAAAAAAAAA": { name: { fr: "Accès aux archives", en: "Archive Access" },
      "system.notes.player": { fr: talent.system.notes.player, en: "<p>You know where to look: <strong>+1 SL</strong> on research.</p>" },
      "effects.EEEEEEEEEEEEEEEE.name": { fr: "Accès aux archives (+1 DR)", en: "Archive Access (+1 SL)" } },
    "tables/CCCCCCCCCCCCCCCC": { name: { fr: "Mission — Accroches", en: "Mission — Hooks" },
      "results.RRRRRRRRRRRRRRR1.description": { fr: table.results[0].description, en: "<p>A vox relay broadcasts names: @UUID[Compendium.lakour-essai.talents.Item.AAAAAAAAAAAAAAAA]{the talent}. Roll: [[/roll 1d10 #Damage]].</p>" } },
    "scenes/DDDDDDDDDDDDDDDD": { "drawings.GGGGGGGGGGGGGGGG.text": { fr: "Parvis", en: "Forecourt" }, name: { fr: "Marché des Sept-Puits", en: "Seven Wells Market" } }
  };
  const { documents: traduits, rapport } = appliquer(documents(), dictionnaire, { module: MODULE, deId: MODULE, versId: `${MODULE}-en` });
  const t = traduits.find(d => d.pack === "talents").doc, r = traduits.find(d => d.pack === "creation").doc;
  const tb = traduits.find(d => d.pack === "tables").doc, s = traduits.find(d => d.pack === "scenes").doc;
  assert.equal(t.name, "Archive Access");
  assert.equal(t.system.requirement.value, "Faction : Inquisition", "sans traduction : le français reste");
  assert.equal(t.effects[0].system.scriptData[0].label, "Archive Access (+1 SL)", "doublon comblé par la mémoire");
  assert.ok(rapport.manquants.includes("talents/AAAAAAAAAAAAAAAA:system.requirement.value"));
  // Références : le nom suit la cible traduite ; uuid récrits vers le module anglais.
  assert.equal(r.system.talents.list[0].name, "Archive Access");
  assert.equal(r.system.talents.list[0].uuid, `Compendium.${MODULE}-en.talents.Item.AAAAAAAAAAAAAAAA`);
  assert.equal(tb.results[1].name, "Archive Access");
  assert.equal(tb.results[1].documentUuid, `Compendium.${MODULE}-en.talents.Item.AAAAAAAAAAAAAAAA`);
  assert.match(tb.results[0].description, /@UUID\[Compendium\.lakour-essai-en\.talents\.Item\.AAAAAAAAAAAAAAAA\]\{the talent\}/);
  // Scène : mémoire d'un document à l'autre et dans le document (Parvis partout), chemins d'images et portée des drapeaux.
  assert.equal(s.name, "Seven Wells Market");
  assert.equal(s.navName, "Seven Wells Market");
  assert.equal(s.regions[0].name, "Forecourt");
  assert.equal(s.regions[0].behaviors[0].name, "Forecourt");
  assert.equal(s.flags[`${MODULE}-en`].plan.pieces[0].nom, "Forecourt");
  assert.ok(!(MODULE in s.flags), "ancienne portée retirée");
  assert.equal(s.flags[`${MODULE}-en`].cle, "marche");
  assert.equal(s.levels[0].background.src, `modules/${MODULE}-en/assets/cartes/marche.svg`);
  assert.ok(!JSON.stringify(traduits).includes(`Compendium.${MODULE}.`), "aucun uuid vers le module français");
  assert.ok(!JSON.stringify(traduits).includes(`modules/${MODULE}/`));
  assert.equal(t._id, talent._id, "mêmes identifiants");
  assert.equal(t._key, talent._key);
  assert.deepEqual(rapport.obsoletes, []);
  assert.deepEqual(rapport.erreurs, []);
  assert.equal(rapport.parPack.talents.traduits, 3);
  assert.ok(rapport.parPack.talents.parMemoire >= 1);
  assert.ok(rapport.nomsRealignes >= 2);
  // Les documents d'origine ne sont pas modifiés.
  assert.equal(talent.name, "Accès aux archives");
});

test("appliquer : entrée obsolète (source changée) non appliquée et signalée ; balises en écart refusées", () => {
  const docs = documents();
  const dictionnaire = {
    "talents/AAAAAAAAAAAAAAAA": { name: { fr: "Accès aux archives (ancien)", en: "Archive Access" },
      "system.notes.player": { fr: talent.system.notes.player, en: "<p>You know where to look: +1 SL on research." } }
  };
  const { documents: traduits, rapport } = appliquer(docs, dictionnaire, { module: MODULE });
  const t = traduits[0].doc;
  assert.equal(t.name, "Accès aux archives");
  assert.deepEqual(rapport.obsoletes, ["talents/AAAAAAAAAAAAAAAA:name"]);
  assert.equal(t.system.notes.player, talent.system.notes.player, "balises en écart : le français reste");
  assert.equal(rapport.erreurs.length, 1);
  assert.deepEqual(rapport.erreurs[0], { cle: "talents/AAAAAAAAAAAAAAAA", chemin: "system.notes.player", ecarts: rapport.erreurs[0].ecarts });
  assert.ok(rapport.erreurs[0].ecarts.some(e => e.startsWith("</p>") || e.startsWith("<strong>")));
  // Sans deId/versId : rien n'est récrit.
  assert.equal(t.flags[MODULE].cle, "acces-aux-archives");
});

test("appliquer : une entrée ajoutée à la main sur un chemin non extrait est appliquée", () => {
  const dictionnaire = { "talents/AAAAAAAAAAAAAAAA": { "system.category": { fr: "standard", en: "standard-en" } } };
  const { documents: traduits } = appliquer(documents(), dictionnaire, { module: MODULE });
  assert.equal(traduits[0].doc.system.category, "standard-en");
  assert.equal(lireChemin(traduits[0].doc, "effects.EEEEEEEEEEEEEEEE.name"), "Accès aux archives (+1 DR)");
});

test("recrireIdentifiant : uuid, chemins et portées, sans toucher au reste", () => {
  const v = recrireIdentifiant({ a: "Compendium.lakour-40k.pnj.Actor.X", b: "modules/lakour-40k/assets/x.svg", flags: { "lakour-40k": { cle: 1 }, "lakour-40k-plus": 2 }, c: "lakour-40k" }, "lakour-40k", "lakour-40k-en");
  assert.deepEqual(v, { a: "Compendium.lakour-40k-en.pnj.Actor.X", b: "modules/lakour-40k-en/assets/x.svg", flags: { "lakour-40k-en": { cle: 1 }, "lakour-40k-plus": 2 }, c: "lakour-40k" });
  assert.deepEqual(recrireIdentifiant({ a: 1 }, "x", "x"), { a: 1 });
});
