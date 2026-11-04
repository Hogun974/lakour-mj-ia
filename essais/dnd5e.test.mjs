// MJ IA sur D&D 5e (monde Warcraft) : figurants fournis par un autre module de contenu, plans lus dans n'importe quel
// module, fiche préparée pour le joueur. Ces essais modifient TYPES_FIGURANTS : ils vivent dans leur propre fichier
// (node --test isole chaque fichier dans son processus).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
const { TYPES_FIGURANTS, definirFigurants, jetonFigurant, moduleDesFigurants, planDe } = await import("../scripts/placement.js");
const { OUTILS } = await import("../scripts/outils.js");

test("figurants : un module de contenu remplace la liste, et le schéma de l'outil suit", () => {
  const schema = () => OUTILS.find(o => o.nom === "figurants").schema.properties.type;
  assert.ok(schema().enum.includes("ganger"), "40k par défaut");
  definirFigurants({ paysan: { libelle: "Paysan", jeton: "paysan" }, grunt: { libelle: "Grunt", jeton: "grunt-orgrimmar" } }, "lakour-warcraft");
  assert.deepEqual(Object.keys(TYPES_FIGURANTS), ["paysan", "grunt"]);
  assert.deepEqual(schema().enum, ["paysan", "grunt"]);
  assert.deepEqual(JSON.parse(JSON.stringify(schema())).enum, ["paysan", "grunt"], "l'enum part bien dans le JSON envoyé à l'API");
  assert.equal(moduleDesFigurants(), "lakour-warcraft");
  assert.equal(jetonFigurant("grunt", "3d"), "modules/lakour-warcraft/assets/jetons/3d/grunt-orgrimmar.svg");
  assert.equal(jetonFigurant("inconnu", "2d"), "modules/lakour-warcraft/assets/jetons/paysan.svg", "type inconnu : le premier");
  definirFigurants({}, "autre");
  assert.equal(moduleDesFigurants(), "lakour-warcraft", "une liste vide ne remplace rien");
});

test("plan d'une scène : MJ IA d'abord, puis n'importe quel module de contenu", () => {
  const plan = { largeur: 4 };
  assert.equal(planDe({ flags: { "lakour-warcraft": { cle: "x", plan } } }), plan);
  assert.equal(planDe({ flags: { "lakour-warcraft": { plan }, "lakour-mj-ia": { plan: { largeur: 9 } } } }).largeur, 9);
  assert.equal(planDe({ flags: { core: { sheetClass: "" } } }), null);
  assert.equal(planDe(null), null);
});

test("creer_personnage_dnd5e : refusée hors D&D 5e et pour des caractéristiques hors 3-18", async () => {
  const outil = OUTILS.find(o => o.nom === "creer_personnage_dnd5e");
  const caracs = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  globalThis.game = { system: { id: "impmal" } };
  assert.match((await outil.executer({ nom: "A", joueur: "B", acteur_existant: "", caracteristiques: caracs, description: "" })).contenu, /ne sert qu.en D&D 5e/);
  globalThis.game = { system: { id: "dnd5e" } };
  const r = await outil.executer({ nom: "A", joueur: "B", acteur_existant: "", caracteristiques: { ...caracs, cha: 2, str: 19 }, description: "" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /str, cha/);
});

test("creer_personnage_dnd5e : compléter une fiche inexistante est refusé, sans rien créer", async () => {
  const outil = OUTILS.find(o => o.nom === "creer_personnage_dnd5e");
  let cree = false;
  globalThis.game = { system: { id: "dnd5e" }, actors: { find: () => null } };
  globalThis.Actor = { implementation: { create: async () => { cree = true; } } };
  const r = await outil.executer({ nom: "Rowan", joueur: "Camille", acteur_existant: "Rowan Harlowe", caracteristiques: { str: 8, dex: 15, con: 14, int: 12, wis: 13, cha: 10 },
    peuple_uuid: "", historique_uuid: "", classe_uuid: "", bonus_historique: [], maitrises: [], choix_uuid: [], taille: "", carac_sorts: "", equipement: "objets", description: "" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /Fiche introuvable : Rowan Harlowe/);
  assert.equal(cree, false);
});
