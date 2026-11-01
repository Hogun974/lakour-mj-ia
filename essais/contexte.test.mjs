// Cartes prêtes proposées à l'IA : lues dans l'index des compendiums de scènes, avec leur description et leur aventure.
import { test } from "node:test";
import assert from "node:assert/strict";

const { cartesPretes } = await import("../scripts/contexte.js");

const pack = (documentName, index) => ({ documentName, getIndex: async () => index });

test("cartes prêtes : nom exact, description, aventure ; les compendiums d'autres types sont ignorés", async () => {
  const lignes = await cartesPretes([
    pack("Scene", [
      { name: "Kour Primaris — Marché des Sept-Puits", flags: { "lakour-40k": { description: "Scène 2 : enquête et embuscade.", aventure: "Le Chœur creux" } } },
      { name: "Lieu — Bouge de ruche", flags: { "lakour-40k": { description: "Taverne mal famée : rencontres, rixes." } } },
      { name: "Carte nue" }
    ]),
    pack("Actor", [{ name: "Garde" }])
  ]);
  assert.deepEqual(lignes, [
    "- Kour Primaris — Marché des Sept-Puits — Scène 2 : enquête et embuscade. (aventure « Le Chœur creux »)",
    "- Lieu — Bouge de ruche — Taverne mal famée : rencontres, rixes.",
    "- Carte nue"
  ]);
});

test("cartes prêtes : la liste est bornée", async () => {
  const index = Array.from({ length: 60 }, (_, i) => ({ name: `Carte ${i}` }));
  assert.equal((await cartesPretes([pack("Scene", index)], 40)).length, 40);
});
