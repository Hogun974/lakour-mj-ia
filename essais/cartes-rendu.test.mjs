// Essais du rendu des cartes en image SVG (fond dessiné gratuit).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { planVersSVG } from "../scripts/cartes-rendu.js";

const PLAN = {
  largeur: 12, hauteur: 6, lumiere: "nuit",
  pieces: [
    { nom: "Salle", x: 0, y: 0, l: 6, h: 6, sol: "metal" },
    { nom: "Réserve", x: 6, y: 0, l: 6, h: 3, sol: "inconnu" },
    { nom: "Bassin", x: 6, y: 3, l: 6, h: 3, sol: "eau" }
  ],
  ouvertures: [
    { x: 5, y: 1, cote: "est", type: "porte" },
    { x: 5, y: 4, cote: "est", type: "verrouillee" },
    { x: 8, y: 3, cote: "nord", type: "secrete" },
    { x: 2, y: 0, cote: "nord", type: "fenetre" }
  ],
  lumieres: [{ x: 1, y: 1, rayon: 2, couleur: "#ff8844" }],
  elements: [{ nom: "Pilier", x: 3, y: 3, l: 1, h: 1 }, { nom: "Caisses", x: 9, y: 1, l: 1, h: 1 }, { nom: "Autel", x: 1, y: 4, l: 2, h: 1 }]
};

test("le SVG est valide (rendu réel par resvg) et a la taille de la scène", () => {
  const { erreurs, svg } = planVersSVG(PLAN, { taille: 100 });
  assert.deepEqual(erreurs, []);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="600" viewBox="0 0 1200 600">/);
  const image = new Resvg(svg).render();
  assert.equal(image.width, 1200);
  assert.equal(image.height, 600);
  assert.ok(!/href="http/.test(svg), "aucune ressource externe : l'image doit être autonome");
});

test("portes visibles, verrou dessiné, porte secrète invisible, fenêtre", () => {
  const { svg } = planVersSVG(PLAN, { taille: 100 });
  const battants = svg.match(/fill="#9a7444"/g) ?? [];
  assert.equal(battants.length, 2, "deux portes dessinées : la normale et la verrouillée (pas la secrète)");
  assert.equal((svg.match(/fill="#c9a24a"/g) ?? []).length, 1, "un seul verrou");
  assert.equal((svg.match(/stroke="#9fd0e8"/g) ?? []).length, 1, "une fenêtre");
});

test("sols : motif choisi par pièce, repli sur la pierre pour un sol inconnu", () => {
  const { svg } = planVersSVG(PLAN, { taille: 100 });
  assert.match(svg, /fill="url\(#sol-metal\)"/);
  assert.match(svg, /fill="url\(#sol-eau\)"/);
  assert.match(svg, /fill="url\(#sol-pierre\)"/, "« inconnu » doit retomber sur la pierre");
});

test("objets dessinés selon leur nom, halo de lumière", () => {
  const { svg } = planVersSVG(PLAN, { taille: 100 });
  assert.match(svg, /<circle cx="350" cy="350"/, "pilier rond au centre de sa case");
  assert.match(svg, /fill="#ffd27a"/, "bougies de l'autel");
  assert.match(svg, /stop-color="#ff8844"/, "halo de la couleur de la lumière");
});

test("rendu déterministe, et plan invalide refusé", () => {
  assert.equal(planVersSVG(PLAN).svg, planVersSVG(PLAN).svg);
  assert.ok(planVersSVG({ ...PLAN, largeur: 200 }).erreurs.length);
});

// ---------------------------------------------------------------- Style relief (3D) et bascule des chemins
test("relief 3D : rendu valide, ombres floutées, arêtes éclairées ; le plat n'a pas de filtre", () => {
  const plat = planVersSVG(PLAN, { taille: 100, style: "2d" }).svg;
  const relief = planVersSVG(PLAN, { taille: 100, style: "3d" }).svg;
  assert.ok(!plat.includes("feGaussianBlur"), "le plat reste sans filtre (léger)");
  assert.match(relief, /<filter id="flou"[^>]*><feGaussianBlur/);
  assert.match(relief, /stroke="#7a8089"/, "arête éclairée sur le dessus des murs");
  assert.equal(new Resvg(relief).render().width, 1200, "le relief se rend correctement");
  assert.ok(planVersSVG(PLAN, { style: "isometrique" }).erreurs[0].includes("style"));
});

test("relief 3D : les objets ronds projettent une ombre ronde", () => {
  const relief = planVersSVG(PLAN, { taille: 100, style: "3d" }).svg;
  const groupe = /<g filter="url\(#flou\)" opacity="0\.55">(.*?)<\/g>/.exec(relief)[1];
  assert.ok(/<circle cx="372" cy="372"/.test(groupe), "ombre ronde du pilier, décalée vers le bas-droite");
  assert.ok(/<rect x="9\d\d/.test(groupe), "ombre rectangulaire des caisses");
});
