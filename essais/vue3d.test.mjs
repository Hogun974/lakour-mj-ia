// Vue 3D pilotée par l'IA : ce que chaque navigateur fait d'une mise à jour de scène (ouvrir/fermer 3D Canvas, cadrer).
import { test } from "node:test";
import assert from "node:assert/strict";

const aPropriete = (o, chemin) => chemin.split(".").reduce((x, k) => (x && typeof x === "object" && k in x ? x[k] : undefined), o) !== undefined;
globalThis.foundry = { utils: { hasProperty: aPropriete } };
const { reaction3d } = await import("../scripts/vue3d.js");

const scene = (l3d = {}, mjia = {}) => ({ flags: { "levels-3d-preview": l3d, "lakour-mj-ia": mjia } });
const joueur = { active: false, estMJ: false };

test("activer : le joueur ouvre la 3D si la scène l'autorise aux joueurs ; le MJ toujours", () => {
  const changements = { flags: { "levels-3d-preview": { auto3d: true } } };
  assert.equal(reaction3d(scene({ auto3d: true, enablePlayers: true }), changements, joueur).basculer, true);
  assert.equal(reaction3d(scene({ auto3d: true }), changements, joueur).basculer, null, "pas pour les joueurs");
  assert.equal(reaction3d(scene({ auto3d: true }), changements, { active: false, estMJ: true }).basculer, true);
  assert.equal(reaction3d(scene({ auto3d: true, enablePlayers: true }), changements, { active: true, estMJ: false }).basculer, null, "déjà ouverte");
});

test("desactiver : fermeture ; une autre mise à jour ne bascule rien", () => {
  assert.equal(reaction3d(scene({ auto3d: false }), { flags: { "levels-3d-preview": { auto3d: false } } }, { active: true, estMJ: false }).basculer, false);
  assert.equal(reaction3d(scene({ auto3d: true, enablePlayers: true }), { name: "x" }, joueur).basculer, null);
});

test("cadrage : appliqué seulement si la 3D est (ou va être) ouverte, et seulement quand il change", () => {
  const camera = { jeton: "abc", dessus: false, n: 1 };
  const changements = { flags: { "lakour-mj-ia": { camera3d: camera } } };
  assert.deepEqual(reaction3d(scene({ auto3d: true }, { camera3d: camera }), changements, { active: true, estMJ: false }).camera, camera);
  assert.equal(reaction3d(scene({}, { camera3d: camera }), changements, joueur).camera, null, "3D fermée : rien");
  assert.equal(reaction3d(scene({ auto3d: true }, { camera3d: camera }), { flags: { "lakour-mj-ia": { autre: 1 } } }, { active: true, estMJ: false }).camera, null);
  // Activation et cadrage dans la même mise à jour : cadré après ouverture.
  const ensemble = { flags: { "levels-3d-preview": { auto3d: true }, "lakour-mj-ia": { camera3d: camera } } };
  const r = reaction3d(scene({ auto3d: true, enablePlayers: true }, { camera3d: camera }), ensemble, joueur);
  assert.equal(r.basculer, true);
  assert.deepEqual(r.camera, camera);
});
