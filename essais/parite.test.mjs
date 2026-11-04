// Ce qui vaut pour un système vaut pour l'autre : fiche incomplète signalée et complétée (Imperium Maledictum comme D&D 5e),
// module de contenu par système (jetons de personnage, figurants) lu de la même façon.
// Ce que chaque module de contenu doit fournir (figurants.json, index des jetons, plans) est le contrat commun
// outils/contrat-contenu.mjs, éprouvé ici sur un module d'essai (contrat-contenu.test.mjs) et appliqué à chaque monde
// dans son propre dépôt (lakour-w40k, lakour-warcraft, lakour-veillees).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { getRoute: r => `/${r}` } };
const { adaptateur } = await import("../scripts/adaptateurs.js");
const { OUTILS } = await import("../scripts/outils.js");
const { CONTENUS, moduleDeContenu, jetonJoueur, figurantsDuContenu } = await import("../scripts/contenus.js");

const avecMonde = (systeme, modulesActifs = [], extra = {}) => {
  globalThis.game = { system: { id: systeme }, modules: { get: id => (modulesActifs.includes(id) ? { active: true } : undefined) }, ...extra };
};

test("Imperium Maledictum : une fiche sans origine, faction ou rôle est signalée, comme en D&D 5e", () => {
  avecMonde("impmal");
  const fiche = types => ({ name: "Lazar", type: "character", system: { characteristics: { ag: { total: 40 } } }, items: types.map(t => ({ type: t })) });
  assert.match(adaptateur().resumer(fiche(["origin"])), /FICHE INCOMPLÈTE, il manque : faction, rôle .*creer_personnage, acteur_existant/);
  assert.doesNotMatch(adaptateur().resumer(fiche(["origin", "faction", "role"])), /INCOMPLÈTE/);
  assert.doesNotMatch(adaptateur().resumer({ ...fiche([]), type: "npc" }), /INCOMPLÈTE/);
});

test("creer_personnage (impmal) : compléter une fiche inexistante est refusé, sans rien créer", async () => {
  let cree = false;
  avecMonde("impmal", [], { actors: { find: () => null } });
  globalThis.Actor = { implementation: { create: async () => { cree = true; } } };
  const outil = OUTILS.find(o => o.nom === "creer_personnage");
  assert.ok(outil.schema.properties.acteur_existant, "même paramètre qu'en D&D 5e");
  const r = await outil.executer({ nom: "Lazar", joueur: "", acteur_existant: "Lazar Vosk", tirages: {}, bonus_choisis: [], origine_uuid: "", faction_uuid: "",
    role_uuid: "", competences: [], specialisations: [], objets: [], px: 0, description: "" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /Fiche introuvable : Lazar Vosk/);
  assert.equal(cree, false);
});

test("module de contenu : un par système, seulement s'il est actif", () => {
  assert.deepEqual(CONTENUS, { impmal: "lakour-40k", dnd5e: "lakour-warcraft", "lakour-loups": "lakour-veillees", "lakour-survie": "lakour-fenoir" });
  avecMonde("dnd5e", ["lakour-warcraft"]);
  assert.equal(moduleDeContenu(), "lakour-warcraft");
  avecMonde("dnd5e", ["lakour-40k"]);
  assert.equal(moduleDeContenu(), null, "le module 40k ne sert pas un monde D&D 5e");
  avecMonde("pf2e", ["lakour-40k", "lakour-warcraft"]);
  assert.equal(moduleDeContenu(), null);
});

test("jetons de personnage et figurants : même lecture pour les deux modules (index.json / index-3d.json, figurants.json)", async () => {
  const lus = [];
  globalThis.fetch = async url => { lus.push(url); return { json: async () => (url.endsWith("figurants.json") ? { paysan: { libelle: "Paysan", jeton: "paysan" } } : { worgen: `${url}:worgen` }) }; };
  avecMonde("dnd5e", ["lakour-warcraft"]);
  assert.equal(await jetonJoueur("worgen", "3d"), "/modules/lakour-warcraft/assets/jetons/index-3d.json:worgen");
  assert.equal(await jetonJoueur("inconnu", "2d"), null);
  assert.equal(await jetonJoueur("", "2d"), null);
  avecMonde("impmal", ["lakour-40k"]);
  assert.deepEqual(await figurantsDuContenu(), { module: "lakour-40k", types: { paysan: { libelle: "Paysan", jeton: "paysan" } } });
  assert.ok(lus.includes("/modules/lakour-40k/assets/jetons/figurants.json"));
  globalThis.fetch = async () => { throw new Error("absent"); };
  assert.equal(await jetonJoueur("worgen", "2d"), null, "pas de fichier : image par défaut");
});
