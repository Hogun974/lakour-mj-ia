// Réinitialiser la campagne, dans chacun des trois mondes : le contenu du jeu revient (40k, Warcraft, Veillées), une scène
// est activée (sans elle, Foundry masque la barre d'outils : plus de console du MJ IA ni de Table de veillée) et la
// partie des Veillées revient aux préparatifs (ses villageois viennent d'être effacés).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: { input: async () => ({}) } } },
  utils: { expandObject: o => o, deepClone: o => structuredClone(o), escapeHTML: s => s }
};
const { reinitialiserCampagne } = await import("../scripts/reinitialiser.js");

function monde(systeme) {
  const traces = { installes: [], activees: [], reglages: {} };
  const scene = { name: "Village", activate: async () => { traces.activees.push("Village"); scene.active = true; } };
  const scenes = [];
  const contenus = ["lakour-40k", "lakour-warcraft", "lakour-veillees"].map(id => [id, {
    id, active: true,
    api: { installer: async () => { traces.installes.push(id); scenes.push(scene); } }
  }]);
  const vide = { size: 0, map: () => [], filter: () => [], [Symbol.iterator]: [][Symbol.iterator] };
  const supprimer = { documentClass: { deleteDocuments: async () => { scenes.length = 0; } } };
  globalThis.CONFIG = { ChatMessage: supprimer, Combat: supprimer, Scene: supprimer, JournalEntry: supprimer, Item: supprimer,
    RollTable: supprimer, FogExploration: supprimer };
  globalThis.Actor = { implementation: { deleteDocuments: async () => {} } };
  globalThis.Folder = { implementation: { deleteDocuments: async () => {} } };
  globalThis.ui = { notifications: { info: () => {} } };
  globalThis.game = {
    user: { isGM: true }, users: vide, actors: vide, folders: vide, paused: false,
    world: { id: "monde" }, system: { id: systeme },
    i18n: { localize: k => k, format: k => k },
    collections: { get: () => ({ size: 1 }) },
    modules: new Map(contenus),
    scenes: { get active() { return scenes.find(s => s.active); }, get size() { return scenes.length; }, get contents() { return scenes; } },
    settings: {
      settings: new Map([["lakour-loups.partie", { default: { partie: null, phase: "preparation", tour: 0 } }]]),
      set: async (scope, cle, valeur) => { traces.reglages[`${scope}.${cle}`] = valeur; },
      get: () => ""
    }
  };
  return traces;
}

for (const [systeme, module] of [["impmal", "lakour-40k"], ["dnd5e", "lakour-warcraft"], ["lakour-loups", "lakour-veillees"]]) {
  test(`réinitialiser (${systeme}) : ${module} réinstallé, une scène activée`, async () => {
    const traces = monde(systeme);
    await reinitialiserCampagne({ minuterie: null });
    assert.deepEqual(traces.installes, [module], "seul le contenu du jeu de ce monde est réinstallé");
    assert.equal(traces.reglages[`${module}.installe`], "", "l'installation repart de zéro");
    assert.deepEqual(traces.activees, ["Village"], "sans scène active, le MJ n'a plus de barre d'outils");
    for (const cle of ["horloges", "enquetes", "contacts"]) assert.deepEqual(traces.reglages[`lakour-mj-ia.${cle}`], [], `${cle} effacés`);
    if (systeme === "lakour-loups") assert.deepEqual(traces.reglages["lakour-loups.partie"], { partie: null, phase: "preparation", tour: 0 });
    else assert.ok(!("lakour-loups.partie" in traces.reglages));
  });
}
