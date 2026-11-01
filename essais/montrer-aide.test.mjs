// montrer_aide : le MJ IA montre une aide de jeu aux joueurs (journal ou page précise, ou image), jamais un journal réservé
// au MJ ; venue d'un compendium, c'est la copie du monde qui est montrée (ou importée).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

const montres = [], images = [], crees = [];
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {},
  documents: { collections: { Journal: { show: async (doc, o) => { montres.push({ doc, o }); return doc; }, showImage: (src, o) => images.push({ src, o }) } } }
};
const { OUTILS, aideAMontrer } = await import("../scripts/outils.js");
const outil = OUTILS.find(o => o.nom === "montrer_aide");

class Pages extends Map { find(f) { return [...this.values()].find(f); } }
function journal({ uuid, name, defaut, pack = null, cle = null, pages = [] }) {
  const j = { documentName: "JournalEntry", uuid, name, pack, ownership: { default: defaut }, flags: cle ? { "lakour-40k": { cle } } : {}, _stats: {} };
  j.pages = new Pages(pages.map(p => [p.id, { documentName: "JournalEntryPage", parent: j, ownership: { default: -1 }, ...p }]));
  return j;
}
const lettre = journal({ uuid: "Compendium.lakour-40k.journaux.JournalEntry.L", name: "Lettre de mandat", defaut: 2, pack: "lakour-40k.journaux",
  cle: "lettre-mandat", pages: [{ id: "p1", name: "La lettre", uuid: "Compendium.lakour-40k.journaux.JournalEntry.L.JournalEntryPage.p1" }] });
const guide = journal({ uuid: "Compendium.lakour-40k.journaux.JournalEntry.G", name: "Guide du MJ", defaut: 0, pack: "lakour-40k.journaux", cle: "guide-mj" });
const copieMonde = journal({ uuid: "JournalEntry.W", name: "Lettre de mandat", defaut: 2, cle: "lettre-mandat", pages: [{ id: "p1", name: "La lettre" }] });
const docs = new Map([[lettre.uuid, lettre], [guide.uuid, guide], [lettre.pages.get("p1").uuid, lettre.pages.get("p1")], [copieMonde.uuid, copieMonde]]);
globalThis.fromUuid = async u => docs.get(u) ?? null;
const monde = [];
globalThis.game = { journal: { find: f => monde.find(f), fromCompendium: (d, o) => ({ source: d.uuid, o }) } };
globalThis.JournalEntry = { implementation: { create: async d => { crees.push(d); const j = journal({ uuid: "JournalEntry.N", name: "Importé", defaut: 2, pages: [{ id: "p1", name: "La lettre" }] }); monde.push(j); return j; } } };

test("montrer_aide : un journal réservé au MJ est refusé, rien n'est montré", async () => {
  const r = await outil.executer({ uuid: guide.uuid, image: "" });
  assert.equal(r.erreur, true);
  assert.match(r.contenu, /réservé au MJ/);
  assert.equal(montres.length, 0);
});

test("montrer_aide : une page de compendium montre la page de la copie du monde", async () => {
  monde.length = 0; monde.push(copieMonde); montres.length = 0;
  const r = await outil.executer({ uuid: lettre.pages.get("p1").uuid, image: "" });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(montres.length, 1);
  assert.equal(montres[0].doc, copieMonde.pages.get("p1"), "la page du monde, pas celle du compendium");
  assert.equal(montres[0].o.force, true);
  assert.equal(crees.length, 0, "rien n'est importé quand la copie existe");
});

test("montrer_aide : sans copie dans le monde, le journal est importé (droits et identifiants gardés) puis montré", async () => {
  monde.length = 0; montres.length = 0;
  const r = await aideAMontrer(lettre.uuid);
  assert.equal(r.importe, true);
  assert.deepEqual(crees[0].o, { keepId: true, clearOwnership: false });
  assert.equal(r.doc.uuid, "JournalEntry.N");
});

test("montrer_aide : une image se montre par son chemin ; un uuid inconnu est refusé", async () => {
  const r = await outil.executer({ uuid: "", image: "modules/lakour-40k/assets/cartes/plan.webp" });
  assert.ok(!r.erreur);
  assert.equal(images.at(-1).src, "modules/lakour-40k/assets/cartes/plan.webp");
  assert.equal((await outil.executer({ uuid: "Compendium.x.y.JournalEntry.Z", image: "" })).erreur, true);
});
