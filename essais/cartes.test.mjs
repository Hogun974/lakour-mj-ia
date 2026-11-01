// Essais du convertisseur plan -> scène (cartes jouables), sans Foundry.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { planVersScene, DEFAULT_LEVEL } from "../scripts/cartes.js";

const S = 100; // taille d'une case en pixels

// Deux salles reliées par un couloir : salle A (0,0 4×4), couloir (4,1 3×1), salle B (7,0 4×4).
const PLAN = {
  largeur: 11, hauteur: 4, lumiere: "nuit",
  pieces: [
    { nom: "Salle A", x: 0, y: 0, l: 4, h: 4, sol: "metal" },
    { nom: "Couloir", x: 4, y: 1, l: 3, h: 1, sol: "pierre" },
    { nom: "Salle B", x: 7, y: 0, l: 4, h: 4, sol: "sanctuaire" }
  ],
  ouvertures: [
    { x: 3, y: 1, cote: "est", type: "porte" },      // A -> couloir
    { x: 6, y: 1, cote: "est", type: "passage" },    // couloir -> B : ouvert
    { x: 8, y: 0, cote: "nord", type: "fenetre" }
  ],
  lumieres: [{ x: 1, y: 1, rayon: 3, couleur: "#ff8844" }],
  elements: [{ nom: "Caisses", x: 9, y: 2, l: 1, h: 1 }]
};

// Longueur totale de murs (en cases) le long d'une ligne, par type de mur.
const surLigne = (walls, test) => walls.filter(w => test(w.c)).reduce((t, w) => t + (Math.abs(w.c[2] - w.c[0]) + Math.abs(w.c[3] - w.c[1])) / S, 0);

test("deux salles et un couloir : périmètre fermé, porte, passage et fenêtre au bon endroit", () => {
  const { erreurs, scene } = planVersScene(PLAN, { taille: S });
  assert.deepEqual(erreurs, []);
  assert.equal(scene.width, 1100);
  assert.equal(scene.height, 400);

  const portes = scene.walls.filter(w => w.door === 1);
  assert.equal(portes.length, 1);
  assert.deepEqual(portes[0].c, [400, 100, 400, 200], "porte sur le bord est de la case (3,1)");

  // Aucun mur entre le couloir (6,1) et la salle B (7,1) : le passage est ouvert.
  assert.ok(!scene.walls.some(w => w.c[0] === 700 && w.c[2] === 700 && w.c[1] <= 100 && w.c[3] >= 200), "le passage ne doit pas être muré");

  const fenetres = scene.walls.filter(w => w.sight === 0);
  assert.equal(fenetres.length, 1);
  assert.deepEqual(fenetres[0].c, [800, 0, 900, 0]);
  assert.equal(fenetres[0].move, 20, "une fenêtre bloque le passage, pas la vue");

  // Salle A fermée : mur ouest (x=0) de 4 cases, mur est (x=4) de 4 cases dont une porte.
  assert.equal(surLigne(scene.walls, c => c[0] === 0 && c[2] === 0), 4);
  assert.equal(surLigne(scene.walls, c => c[0] === 400 && c[2] === 400), 4);
});

test("les murs pleins alignés sont fusionnés en un seul segment", () => {
  const { scene } = planVersScene(PLAN, { taille: S });
  const ouest = scene.walls.filter(w => w.c[0] === 0 && w.c[2] === 0);
  assert.equal(ouest.length, 1);
  assert.deepEqual(ouest[0].c, [0, 0, 0, 400]);
});

test("sols, étiquettes cachées, obstacle, lumière, obscurité et niveau par défaut", () => {
  const { scene } = planVersScene(PLAN, { taille: S, distance: 2 });
  const sols = scene.drawings.filter(d => d.fillType === 1 && !d.text);
  assert.equal(sols.length, 3);
  assert.ok(scene.drawings.filter(d => d.hidden && d.text).length === 3, "trois étiquettes réservées au MJ");
  assert.ok(scene.drawings.some(d => d.text === "Caisses" && !d.hidden));
  assert.deepEqual([scene.lights[0].x, scene.lights[0].y], [150, 150]);
  assert.equal(scene.lights[0].config.dim, 6, "rayon de 3 cases × 2 m");
  assert.equal(scene.environment.darknessLevel, 0.85);
  assert.equal(scene.environment.globalLight.enabled, false);
  assert.equal(scene.levels[0]._id, DEFAULT_LEVEL);
  assert.equal(scene.levels[0]._id.length, 16, "un identifiant Foundry fait 16 caractères");
});

test("plans impossibles refusés avec un message clair", () => {
  const casse = modif => { const p = structuredClone(PLAN); modif(p); return planVersScene(p, { taille: S }).erreurs.join(" | "); };
  assert.match(casse(p => { p.pieces[0].l = 20; }), /hors du plan/);
  assert.match(casse(p => { p.ouvertures.push({ x: 1, y: 1, cote: "est", type: "porte" }); }), /pas de mur à cet endroit/);
  assert.match(casse(p => { p.ouvertures[0].type = "trappe"; }), /type « trappe » inconnu/);
  assert.match(casse(p => { p.ouvertures[0].cote = "haut"; }), /côté « haut » inconnu/);
  assert.match(planVersScene({ ...PLAN, largeur: 200 }).erreurs[0], /entre 4 et 80/);
});

test("chaque case de pièce est entourée : aucune fuite vers le vide", () => {
  // Une salle seule : son périmètre complet (2×(l+h) cases) doit être muré.
  const { scene } = planVersScene({ largeur: 6, hauteur: 5, lumiere: "jour", pieces: [{ nom: "Cellule", x: 1, y: 1, l: 3, h: 2, sol: "pierre" }] }, { taille: S });
  const total = scene.walls.reduce((t, w) => t + (Math.abs(w.c[2] - w.c[0]) + Math.abs(w.c[3] - w.c[1])) / S, 0);
  assert.equal(total, 2 * (3 + 2));
  assert.equal(scene.environment.globalLight.enabled, true, "en plein jour, lumière globale");
});
