// Essais : retrouver la pièce d'un jeton ou d'une porte, et le silence du MJ IA (« — »).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { salleEn, sallesAutourDe } from "../scripts/salles.js";
import { planVersScene } from "../scripts/cartes.js";
import { estSilence } from "../scripts/voix-texte.js";

// Les étiquettes produites par le convertisseur de cartes servent de référence : même source qu'en jeu.
const { scene } = planVersScene({
  largeur: 11, hauteur: 4, lumiere: "nuit",
  pieces: [{ nom: "Salle A", x: 0, y: 0, l: 4, h: 4, sol: "metal" }, { nom: "Couloir", x: 4, y: 1, l: 3, h: 1, sol: "pierre" }, { nom: "Salle B", x: 7, y: 0, l: 4, h: 4, sol: "pierre" }],
  ouvertures: [{ x: 3, y: 1, cote: "est", type: "porte" }, { x: 6, y: 1, cote: "est", type: "passage" }]
}, { taille: 100 });

test("pièce d'un point : centre des cases de chaque pièce, rien hors des pièces", () => {
  assert.equal(salleEn(scene.drawings, 150, 150), "Salle A");
  assert.equal(salleEn(scene.drawings, 550, 150), "Couloir");
  assert.equal(salleEn(scene.drawings, 950, 350), "Salle B");
  assert.equal(salleEn(scene.drawings, 550, 350), null, "sous le couloir : aucune pièce");
});

test("la plus petite pièce l'emporte quand deux étiquettes se recouvrent", () => {
  const dessins = [
    { x: 0, y: 0, shape: { type: "r", width: 1000, height: 1000 }, text: "Grande salle", hidden: true },
    { x: 200, y: 200, shape: { type: "r", width: 100, height: 300 }, text: "Alcôve", hidden: true },
    { x: 0, y: 0, shape: { type: "r", width: 1000, height: 1000 }, text: "Caisses", hidden: false }
  ];
  assert.equal(salleEn(dessins, 250, 250), "Alcôve");
  assert.equal(salleEn(dessins, 800, 800), "Grande salle", "un obstacle visible n'est pas une pièce");
});

test("pièces de part et d'autre d'une porte", () => {
  const porte = scene.walls.find(w => w.door === 1);
  assert.deepEqual(sallesAutourDe(scene.drawings, porte.c).sort(), ["Couloir", "Salle A"]);
});

test("silence : seul un tiret isolé fait taire le MJ IA", () => {
  for (const t of ["—", " — ", "–", "-", "---"]) assert.ok(estSilence(t), JSON.stringify(t));
  for (const t of ["— Halte !", "Rien.", "", "La porte grince — puis cède."]) assert.ok(!estSilence(t), JSON.stringify(t));
});
