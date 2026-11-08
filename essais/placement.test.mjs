// Essais du placement des jetons (pièces, cases libres, figurants), hors Foundry.  Lancer : npm run essais
// Les essais sur les vraies cartes d'un monde (marché des Sept-Puits, village de Brumecombe) et sur les jetons de ses
// figurants vivent dans le dépôt de ce monde (essais/placement-40k.test.mjs, essais/placement-veillees.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { listeSalles, trouverSalle, salleDeLaCase, centreSalle, casesLibres, casesOccupees, TYPES_FIGURANTS, jetonFigurant, resumerFigurants,
  casesDispersees, casesInterdites, reperesDuPlan, trouverRepere, casesAutour, carteTexte, carteDeScene, definirFigurants }
  from "../scripts/placement.js";

// Grille de 100 px, scène décalée de 200 px (marge de Foundry). Deux pièces et un couloir dans la nef.
const G = { size: 100, sceneX: 200, sceneY: 200 };
const piece = (text, x, y, w, h) => ({ hidden: true, text, x: 200 + x * 100, y: 200 + y * 100, shape: { type: "r", width: w * 100, height: h * 100 } });
const DESSINS = [
  piece("Nef de Sainte-Liesse", 0, 0, 10, 6),   // cases 0,0 à 9,5
  piece("Sacristie", 10, 0, 4, 3),              // cases 10,0 à 13,2
  piece("Allée centrale", 4, 0, 2, 6),          // dans la nef
  { hidden: false, text: "Note visible", x: 200, y: 200, shape: { type: "r", width: 100, height: 100 } },
  { hidden: true, text: "", x: 200, y: 200, shape: { type: "r", width: 100, height: 100 } }
];
const SALLES = listeSalles(DESSINS, G);
const LIMITES = { largeur: 14, hauteur: 6 };

test("pièces : lues des étiquettes cachées, converties en cases", () => {
  assert.deepEqual(SALLES.map(s => s.nom), ["Nef de Sainte-Liesse", "Sacristie", "Allée centrale"]);
  assert.deepEqual(SALLES[1], { nom: "Sacristie", x1: 10, y1: 0, x2: 13, y2: 2 });
  assert.deepEqual(centreSalle(SALLES[1]), { x: 11, y: 1 });
});

test("pièce par nom : sans accents ni casse, sinon la plus petite qui contient la recherche", () => {
  assert.equal(trouverSalle(SALLES, "sacristie").nom, "Sacristie");
  assert.equal(trouverSalle(SALLES, "NEF DE SAINTE-LIESSE").nom, "Nef de Sainte-Liesse");
  assert.equal(trouverSalle(SALLES, "allee").nom, "Allée centrale");
  assert.equal(trouverSalle(SALLES, "nef").nom, "Nef de Sainte-Liesse");
  assert.equal(trouverSalle(SALLES, "cave"), null);
  assert.equal(trouverSalle(SALLES, "  "), null);
  // Une case de l'allée est dans l'allée (la plus petite pièce), pas dans la nef.
  assert.equal(salleDeLaCase(SALLES, 4, 3).nom, "Allée centrale");
  assert.equal(salleDeLaCase(SALLES, 1, 1).nom, "Nef de Sainte-Liesse");
  assert.equal(salleDeLaCase(SALLES, 13, 5), null);
});

test("cases libres : au plus près du centre, jamais occupées, jamais hors de la pièce", () => {
  const sacristie = SALLES[1];
  const occupees = new Set(["11,1"]);
  const cases = casesLibres(12, { centre: centreSalle(sacristie), zone: sacristie, limites: LIMITES, occupees });
  assert.equal(cases.length, 11, "12 cases dans la sacristie, une occupée");
  assert.ok(cases.every(c => c.x >= 10 && c.x <= 13 && c.y >= 0 && c.y <= 2), JSON.stringify(cases));
  assert.ok(!cases.some(c => c.x === 11 && c.y === 1));
  assert.equal(new Set(cases.map(c => `${c.x},${c.y}`)).size, cases.length, "aucune case en double");
  // Les premières cases sont les voisines directes du centre.
  assert.ok(cases.slice(0, 4).every(c => Math.abs(c.x - 11) + Math.abs(c.y - 1) === 1), JSON.stringify(cases.slice(0, 4)));
  // L'ensemble des occupées fourni n'est pas modifié.
  assert.deepEqual([...occupees], ["11,1"]);
  // Sans zone : limites de la scène.
  const coin = casesLibres(4, { centre: { x: 0, y: 0 }, limites: LIMITES });
  assert.ok(coin.every(c => c.x >= 0 && c.y >= 0), JSON.stringify(coin));
  assert.deepEqual(coin[0], { x: 0, y: 0 });
});

test("cases occupées : un jeton couvre ses cases (1×1 et 2×2)", () => {
  const occ = casesOccupees([{ x: 300, y: 200, width: 1, height: 1 }, { x: 600, y: 400, width: 2, height: 2 }], G);
  assert.deepEqual([...occ].sort(), ["1,0", "4,2", "4,3", "5,2", "5,3"]);
});

test("figurants : résumé par groupe, avec effectif, pièces et comportement", () => {
  const lignes = resumerFigurants([
    { groupe: "Foule du marché", comportement: "pressés, envoient paître", salle: "Place" },
    { groupe: "Foule du marché", comportement: "pressés, envoient paître", salle: "Place" },
    { groupe: "Gardes", comportement: "", salle: undefined }
  ]);
  assert.deepEqual(lignes, ["« Foule du marché » ×2 (Place) — si on les aborde : pressés, envoient paître", "« Gardes » ×1"]);
});

// ---------------------------------------------------------------- Foule dispersée (la place du marché)

const PLACE = { nom: "Place du marché", x1: 0, y1: 0, x2: 15, y2: 15 };
const LAZAR = { x: 7, y: 7 };
const pres = (a, b, d) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= d;

test("foule dispersée : jamais collée au personnage joueur, répartie dans toute la pièce, sans bloc compact", () => {
  const occupees = new Set(["9,7"]); // Mère Gruss, à deux pas
  const foule = casesDispersees(15, { zone: PLACE, limites: { largeur: 16, hauteur: 16 }, occupees, proteges: [LAZAR], graine: 42 });
  assert.equal(foule.length, 15);
  assert.ok(foule.every(c => !pres(c, LAZAR, 1)), "un anneau libre autour de Lazar");
  assert.ok(!foule.some(c => c.x === 9 && c.y === 7), "pas sur Mère Gruss");
  assert.ok(foule.every(c => c.x >= 0 && c.x <= 15 && c.y >= 0 && c.y <= 15));
  // Écartés les uns des autres quand la place le permet.
  for (const a of foule) assert.ok(!foule.some(b => b !== a && pres(a, b, 1)), `${a.x},${a.y} a un voisin collé`);
  // Étalés : la foule couvre l'essentiel de la place, pas un carré de 5 cases autour du joueur.
  const etendue = k => Math.max(...foule.map(c => c[k])) - Math.min(...foule.map(c => c[k]));
  assert.ok(etendue("x") >= 10 && etendue("y") >= 10, `étendue ${etendue("x")}×${etendue("y")}`);
  // Même graine, même disposition ; autre graine, autre disposition.
  assert.deepEqual(casesDispersees(15, { zone: PLACE, limites: { largeur: 16, hauteur: 16 }, occupees, proteges: [LAZAR], graine: 42 }), foule);
  assert.notDeepEqual(casesDispersees(15, { zone: PLACE, limites: { largeur: 16, hauteur: 16 }, occupees, proteges: [LAZAR], graine: 7 }), foule);
});

test("foule dispersée : dans une petite pièce elle se resserre, mais ne déborde jamais", () => {
  const reduit = { x1: 0, y1: 0, x2: 3, y2: 2 }; // 12 cases
  const foule = casesDispersees(20, { zone: reduit, limites: { largeur: 16, hauteur: 16 }, proteges: [], graine: 3 });
  assert.equal(foule.length, 12);
  assert.equal(new Set(foule.map(c => `${c.x},${c.y}`)).size, 12);
  // Un joueur au milieu : son anneau reste libre, même serré.
  const autour = casesDispersees(20, { zone: reduit, limites: { largeur: 16, hauteur: 16 }, proteges: [{ x: 1, y: 1 }], graine: 3 });
  assert.deepEqual(autour.map(c => `${c.x},${c.y}`).sort(), ["3,0", "3,1", "3,2"]);
});

test("cases interdites : obstacles du plan et abords des portes, pas les fenêtres", () => {
  const plan = {
    elements: [{ nom: "Étal", x: 2, y: 3, l: 2, h: 1 }, { nom: "Puits", x: 5, y: 10 }],
    ouvertures: [{ x: 15, y: 4, cote: "est", type: "porte" }, { x: 8, y: 0, cote: "nord", type: "fenetre" }]
  };
  assert.deepEqual([...casesInterdites(plan)].sort(), ["15,4", "16,4", "2,3", "3,3", "5,10"]);
  assert.equal(casesInterdites(null).size, 0);
  // La foule évite étals, puits et portes.
  const interdites = casesInterdites(plan);
  const foule = casesDispersees(60, { zone: PLACE, limites: { largeur: 16, hauteur: 16 }, occupees: interdites, proteges: [LAZAR], graine: 9 });
  assert.ok(foule.every(c => !interdites.has(`${c.x},${c.y}`)));
});

// ---------------------------------------------------------------- Les outils sur une fausse scène

globalThis.foundry ??= { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
const { OUTILS } = await import("../scripts/outils.js");
const outil = nom => OUTILS.find(o => o.nom === nom);

function fausseScene(jetons, plan = null) {
  const tokens = jetons.map(j => ({
    width: 1, height: 1, hidden: false, flags: {}, ...j,
    getFlag(portee, cle) { return this.flags[portee]?.[cle]; },
    async update(d) { Object.assign(this, d); }
  }));
  const scene = {
    grid: { size: 100 },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1400, sceneHeight: 600 },
    drawings: { contents: DESSINS.map(d => ({ toObject: () => d })) },
    tokens: Object.assign(tokens, { contents: tokens }),
    supprimes: [],
    flags: plan ? { "lakour-40k": { plan } } : {}, // une carte d'aventure : son plan est dans les flags de lakour-40k
    async deleteEmbeddedDocuments(_type, ids) { this.supprimes.push(...ids); }
  };
  globalThis.canvas = { scene };
  return scene;
}
const pj = { hasPlayerOwner: true };
const pnj = { hasPlayerOwner: false };

test("placer_jetons : un personnage va sur une case libre de la pièce nommée", async () => {
  const scene = fausseScene([
    { id: "a", name: "Lazar Vosk", actor: pj, x: 300, y: 300 },               // case 1,1, dans la nef
    { id: "b", name: "Diacre", actor: pnj, x: 200 + 11 * 100, y: 200 + 100 }  // case 11,1 : centre de la sacristie
  ]);
  const r = await outil("placer_jetons").executer({ jetons: [{ personnage: "lazar vosk", salle: "sacristie", x: 0, y: 0, cache: false }] });
  const lazar = scene.tokens[0];
  const c = { x: (lazar.x - 200) / 100, y: (lazar.y - 200) / 100 };
  assert.equal(salleDeLaCase(SALLES, c.x, c.y).nom, "Sacristie", r.contenu);
  assert.notDeepEqual(c, { x: 11, y: 1 }, "pas sur la case du diacre");
  assert.match(r.contenu, /Lazar Vosk → case \d+,\d+ dans « Sacristie »/);
  // Déjà dans la pièce : il ne bouge plus.
  const avant = { x: lazar.x, y: lazar.y };
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "Sacristie", x: 0, y: 0, cache: false }] });
  assert.deepEqual({ x: lazar.x, y: lazar.y }, avant);
  // Pièce inconnue : signalée avec la liste des pièces, rien ne bouge.
  const faux = await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "Crypte", x: 0, y: 0, cache: false }] });
  assert.match(faux.contenu, /« Crypte » introuvable \(pièces : Nef de Sainte-Liesse, Sacristie, Allée centrale\)/);
  // Sans pièce : la case donnée.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "", x: 2, y: 3, cache: true }] });
  assert.deepEqual({ x: lazar.x, y: lazar.y, hidden: lazar.hidden }, { x: 400, y: 500, hidden: true });
});

test("figurants : retirer un groupe ne touche ni les autres groupes ni les PNJ", async () => {
  const fig = (id, groupe) => ({ id, name: "Citoyen", actor: pnj, x: 200, y: 200, flags: { "lakour-mj-ia": { figurant: true, groupe } } });
  const scene = fausseScene([fig("f1", "Foule du marché"), fig("f2", "foule du marché"), fig("f3", "Gardes"), { id: "p", name: "Diacre", actor: pnj, x: 300, y: 300 }]);
  const r = await outil("figurants").executer({ action: "retirer", groupe: "Foule du marché", type: "citoyen", nombre: 1, salle: "", attitude: "neutre", comportement: "" });
  assert.deepEqual(scene.supprimes, ["f1", "f2"], r.contenu);
  scene.supprimes = [];
  await outil("figurants").executer({ action: "retirer", groupe: "tous", type: "citoyen", nombre: 1, salle: "", attitude: "neutre", comportement: "" });
  assert.deepEqual(scene.supprimes, ["f1", "f2", "f3"]);
});

test("retirer_jetons : retire les PNJ, refuse les personnages joueurs", async () => {
  const scene = fausseScene([{ id: "a", name: "Lazar Vosk", actor: pj, x: 300, y: 300 }, { id: "b", name: "Diacre", actor: pnj, x: 400, y: 300 }]);
  const r = await outil("retirer_jetons").executer({ noms: ["Diacre", "Lazar Vosk", "Fantôme"] });
  assert.deepEqual(scene.supprimes, ["b"]);
  assert.match(r.contenu, /1 jeton\(s\) retiré\(s\)\. Refusé pour les personnages joueurs : Lazar Vosk\. Introuvables : fantôme\./);
});

// ---------------------------------------------------------------- Repères : le marché des Sept-Puits

// Place 0..15 × 0..15, échoppe 16..23 × 2..7 (porte à l'est de la case 15,5), allée 16..23 × 0..1.
const MARCHE = {
  elements: [
    { nom: "Étal", x: 3, y: 4, l: 2, h: 1 }, { nom: "Étal", x: 11, y: 4, l: 2, h: 1 },
    { nom: "Puits", x: 1, y: 14 }, { nom: "Puits", x: 7, y: 7 }, { nom: "Puits", x: 14, y: 1 }
  ],
  ouvertures: [{ x: 15, y: 5, cote: "est", type: "porte" }, { x: 19, y: 2, cote: "nord", type: "porte" }, { x: 23, y: 10, cote: "nord", type: "fenetre" }]
};
const SALLES_MARCHE = [
  { nom: "Place du marché", x1: 0, y1: 0, x2: 15, y2: 15 },
  { nom: "Échoppe de Mère Gruss", x1: 16, y1: 2, x2: 23, y2: 7 },
  { nom: "Allée des Fondeurs", x1: 16, y1: 0, x2: 23, y2: 1 }
];
const REPERES = reperesDuPlan(MARCHE, SALLES_MARCHE);

test("repères : éléments et portes du plan, avec les pièces qu'ils touchent ; pas les fenêtres", () => {
  assert.equal(REPERES.length, 7);
  assert.deepEqual(REPERES.filter(r => r.type === "porte").map(r => r.nom),
    ["Porte Place du marché / Échoppe de Mère Gruss", "Porte Échoppe de Mère Gruss / Allée des Fondeurs"]);
  assert.deepEqual(REPERES[0].cases, [{ x: 3, y: 4 }, { x: 4, y: 4 }]);
});

test("repère par texte libre : « puits central », « seuil de l'échoppe de Mère Gruss », « étal »", () => {
  assert.deepEqual(trouverRepere(REPERES, "le puits central").cases, [{ x: 7, y: 7 }]);
  assert.deepEqual(trouverRepere(REPERES, "près du puits").cases.length, 1);
  const seuil = trouverRepere(REPERES, "au seuil de l'échoppe de Mère Gruss", "Place du marché");
  assert.equal(seuil.nom, "Porte Place du marché / Échoppe de Mère Gruss", "la porte qui donne sur la place, pas celle de l'allée");
  assert.equal(trouverRepere(REPERES, "devant la porte de l'allée des fondeurs", "Place du marché").nom, "Porte Échoppe de Mère Gruss / Allée des Fondeurs");
  assert.equal(trouverRepere(REPERES, "un étal").nom, "Étal");
  assert.equal(trouverRepere(REPERES, "la cathédrale"), null);
  // Le nom d'une personne n'est pas une porte : « à côté de Mère Gruss » ne vise pas l'échoppe (sans « seuil », « porte »…).
  assert.equal(trouverRepere(REPERES, "à côté de Mère Gruss"), null);
  // Deux portes donnent sur l'échoppe : on prend celle du côté des joueurs.
  assert.equal(trouverRepere(REPERES, "la porte de l'échoppe de Mère Gruss", "Allée des Fondeurs").nom, "Porte Échoppe de Mère Gruss / Allée des Fondeurs");
  assert.equal(trouverRepere(REPERES, "la porte de l'échoppe de Mère Gruss", "Place du marché").nom, "Porte Place du marché / Échoppe de Mère Gruss");
});

test("autour d'un repère : au plus près, jamais dessus, jamais sur une case prise", () => {
  const autour = casesAutour(3, [{ x: 7, y: 7 }], { zone: SALLES_MARCHE[0], limites: { largeur: 24, hauteur: 16 }, occupees: new Set(["7,6"]) });
  assert.equal(autour.length, 3);
  assert.ok(autour.every(c => Math.max(Math.abs(c.x - 7), Math.abs(c.y - 7)) === 1), JSON.stringify(autour));
  assert.ok(!autour.some(c => (c.x === 7 && c.y === 7) || (c.x === 7 && c.y === 6)));
  assert.deepEqual(autour[0], { x: 6, y: 7 }, "les cases droites avant les diagonales");
});

test("placer_jetons pres_de : la vieille au seuil de l'échoppe côté place, les gardes au puits central", async () => {
  // Grille de 100 px, origine 200 : la case (x, y) est au pixel (200 + 100x, 200 + 100y).
  const px = (x, y) => ({ x: 200 + 100 * x, y: 200 + 100 * y });
  const scene = fausseScene([
    { id: "l", name: "Lazar Vosk", actor: pj, ...px(8, 9) },
    { id: "v", name: "Mère Gruss", actor: pnj, ...px(2, 2) },
    { id: "g", name: "Garde", actor: pnj, ...px(0, 0) }
  ], MARCHE);
  scene.dimensions.sceneWidth = 2400; scene.dimensions.sceneHeight = 1600;
  scene.drawings.contents = SALLES_MARCHE.map(s => ({ toObject: () => ({ hidden: true, text: s.nom, x: 200 + 100 * s.x1, y: 200 + 100 * s.y1, shape: { type: "r", width: 100 * (s.x2 - s.x1 + 1), height: 100 * (s.y2 - s.y1 + 1) } }) }));
  const r = await outil("placer_jetons").executer({ jetons: [
    { personnage: "Mère Gruss", salle: "", pres_de: "au seuil de l'échoppe de Mère Gruss", x: -1, y: -1, cache: false },
    { personnage: "Garde", salle: "", pres_de: "puits central", x: -1, y: -1, cache: false }
  ] });
  const caseDe = t => ({ x: (t.x - 200) / 100, y: (t.y - 200) / 100 });
  const vieille = caseDe(scene.tokens[1]), garde = caseDe(scene.tokens[2]);
  // Côté place (x ≤ 15), tout contre la porte (15,5), mais pas sur la case de la porte elle-même (laissée libre).
  assert.ok(vieille.x <= 15 && Math.max(Math.abs(vieille.x - 15), Math.abs(vieille.y - 5)) === 1, `${r.contenu} → ${JSON.stringify(vieille)}`);
  assert.ok(Math.max(Math.abs(garde.x - 7), Math.abs(garde.y - 7)) === 1, `${r.contenu} → ${JSON.stringify(garde)}`);
  assert.match(r.contenu, /Mère Gruss → case \d+,\d+ près de « Porte Place du marché \/ Échoppe de Mère Gruss » dans « Place du marché »/);
  // Repère inconnu : signalé avec la liste des repères, rien ne bouge.
  const faux = await outil("placer_jetons").executer({ jetons: [{ personnage: "Garde", salle: "", pres_de: "la fontaine", x: -1, y: -1, cache: false }] });
  assert.match(faux.contenu, /repère « la fontaine » introuvable \(repères : Étal, Puits, Porte Place du marché/);
  // Près d'un PNJ : le garde rejoint Mère Gruss.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Garde", salle: "", pres_de: "Mère Gruss", x: -1, y: -1, cache: false }] });
  const g2 = caseDe(scene.tokens[2]);
  assert.ok(Math.max(Math.abs(g2.x - vieille.x), Math.abs(g2.y - vieille.y)) === 1, JSON.stringify(g2));
  // Le repère recopié de l'état du jeu, avec sa case : c'est la case qui compte (il y a deux étals), et le nom de pièce
  // entre parenthèses ne doit pas faire choisir une porte de cette pièce.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Garde", salle: "", pres_de: "Étal (case 11,4, Place du marché)", x: -1, y: -1, cache: false }] });
  const g3 = caseDe(scene.tokens[2]);
  assert.ok(Math.max(Math.abs(g3.x - 11.5), Math.abs(g3.y - 4)) <= 1.5 && !(g3.y === 4 && (g3.x === 11 || g3.x === 12)), JSON.stringify(g3));
  // Sans case, le nom de pièce entre parenthèses est ignoré : c'est bien le puits, pas une porte de la place.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Garde", salle: "", pres_de: "Puits central (Place du marché)", x: -1, y: -1, cache: false }] });
  const g4 = caseDe(scene.tokens[2]);
  assert.ok(Math.max(Math.abs(g4.x - 7), Math.abs(g4.y - 7)) === 1, JSON.stringify(g4));
  // Une porte recopiée avec sa case, et la pièce demandée : Lazar entre dans l'échoppe, juste derrière la porte.
  const r2 = await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "Échoppe de Mère Gruss", pres_de: "Porte Place du marché / Échoppe de Mère Gruss (case 16,5)", x: -1, y: -1, cache: false }] });
  const l1 = caseDe(scene.tokens[0]);
  assert.ok(l1.x >= 16 && Math.max(Math.abs(l1.x - 16), Math.abs(l1.y - 5)) === 1, `${r2.contenu} → ${JSON.stringify(l1)}`);
  // Il est déplacé d'un coup (« displace ») : une marche ordinaire s'arrêterait contre le mur ou la porte fermée.
  assert.equal(scene.tokens[0].action, "displace");

  // Un jeton cité dans la phrase sert de repère, mais jamais celui qu'on place : Lazar suit Mère Gruss, pas lui-même.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "", pres_de: "Lazar Vosk suit Mère Gruss", x: -1, y: -1, cache: false }] });
  const l2 = caseDe(scene.tokens[0]), v2 = caseDe(scene.tokens[1]);
  assert.ok(Math.max(Math.abs(l2.x - v2.x), Math.abs(l2.y - v2.y)) === 1, JSON.stringify({ l2, v2 }));
});

// ---------------------------------------------------------------- La carte vue par l'IA

test("carte en texte : une case par caractère, pièces, éléments, portes et jetons au bon endroit", () => {
  const carte = carteTexte({
    largeur: 24, hauteur: 16, salles: SALLES_MARCHE, reperes: REPERES,
    jetons: [
      { nom: "Lazar Vosk", x: 7, y: 9, pj: true },
      { nom: "Prêcheur", x: 7, y: 3 },
      { nom: "Mère Gruss", x: 18, y: 4, cache: true },
      { nom: "Citoyen", x: 2, y: 2, figurant: true },
      { nom: "Perdu", x: 40, y: 40 }
    ]
  });
  const lignes = carte.split("\n");
  const ligne = y => lignes[2 + y].slice(4); // deux lignes d'en-tête, puis « yyy » et une espace
  const en = (x, y) => ligne(y)[x];
  assert.equal(lignes[1], "    012345678901234567890123");
  assert.equal(ligne(0).length, 24);
  assert.equal(en(7, 7), "B", "le puits central");
  assert.equal(en(3, 4), "A", "un étal");
  assert.equal(en(15, 5), "+", "devant la porte de l'échoppe, côté place");
  assert.equal(en(16, 5), "+", "et côté échoppe");
  assert.equal(en(7, 9), "@");
  assert.equal(en(7, 3), "1");
  assert.equal(en(18, 4), "?", "un PNJ caché reste marqué, sans être confondu avec un visible");
  assert.equal(en(2, 2), "f");
  assert.equal(en(20, 10), en(16, 10), "même lettre pour toute une pièce");
  assert.notEqual(en(16, 3), en(14, 3), "deux pièces voisines ont des lettres différentes");
  assert.match(carte, /@ = Lazar Vosk en 7,9/);
  assert.match(carte, /1 = Prêcheur en 7,3/);
  assert.match(carte, /\? = Mère Gruss \(caché\) en 18,4/);
  assert.match(carte, /A = Étal/);
  assert.match(carte, /= Place du marché/);
  assert.doesNotMatch(carte, /Citoyen/, "les figurants ne sont pas listés un par un");
  assert.equal(carteTexte({ largeur: 90, hauteur: 10, salles: SALLES_MARCHE }), "", "trop grande : rien (trop de jetons de contexte)");
});

test("carte d'une scène Foundry : jetons, pièces dessinées et plan de l'aventure", () => {
  const scene = fausseScene([
    { id: "l", name: "Lazar Vosk", actor: pj, x: 200 + 700, y: 200 + 1400 },
    { id: "f", name: "Citoyen", actor: pnj, x: 200 + 100, y: 200 + 100, flags: { "lakour-mj-ia": { figurant: true } } }
  ], MARCHE);
  scene.dimensions.sceneWidth = 2400; scene.dimensions.sceneHeight = 1600;
  scene.drawings.contents = SALLES_MARCHE.map(s => ({ toObject: () => ({ hidden: true, text: s.nom, x: 200 + 100 * s.x1, y: 200 + 100 * s.y1, shape: { type: "r", width: 100 * (s.x2 - s.x1 + 1), height: 100 * (s.y2 - s.y1 + 1) } }) }));
  const carte = carteDeScene(scene);
  const en = (x, y) => carte.split("\n")[2 + y].slice(4)[x];
  assert.equal(en(7, 14), "@");
  assert.equal(en(1, 1), "f");
  assert.equal(en(7, 7), "B");
  const vide = fausseScene([]);
  vide.drawings.contents = [];
  assert.equal(carteDeScene(vide), "", "une scène sans pièces n'a pas de carte");
});

test("placer_jetons : une case donnée sur un obstacle (le puits) → la case libre la plus proche, dans la même pièce", async () => {
  const scene = fausseScene([{ id: "l", name: "Lazar Vosk", actor: pj, x: 200, y: 200 }], MARCHE);
  scene.dimensions.sceneWidth = 2400; scene.dimensions.sceneHeight = 1600;
  scene.drawings.contents = SALLES_MARCHE.map(s => ({ toObject: () => ({ hidden: true, text: s.nom, x: 200 + 100 * s.x1, y: 200 + 100 * s.y1, shape: { type: "r", width: 100 * (s.x2 - s.x1 + 1), height: 100 * (s.y2 - s.y1 + 1) } }) }));
  const r = await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "", pres_de: "", x: 7, y: 7, cache: false }] });
  const c = { x: (scene.tokens[0].x - 200) / 100, y: (scene.tokens[0].y - 200) / 100 };
  assert.notDeepEqual(c, { x: 7, y: 7 }, r.contenu);
  assert.equal(Math.max(Math.abs(c.x - 7), Math.abs(c.y - 7)), 1, JSON.stringify(c));
  assert.match(r.contenu, /case 7,7 prise : la plus proche libre/);
  // Une case libre est respectée telle quelle.
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "", pres_de: "", x: 2, y: 12, cache: false }] });
  assert.deepEqual({ x: scene.tokens[0].x, y: scene.tokens[0].y }, { x: 400, y: 1400 });
  // Déjà sur l'obstacle et « près du puits » : il ne reste pas dessus.
  scene.tokens[0].x = 200 + 700; scene.tokens[0].y = 200 + 700;
  await outil("placer_jetons").executer({ jetons: [{ personnage: "Lazar Vosk", salle: "", pres_de: "puits central", x: -1, y: -1, cache: false }] });
  assert.notDeepEqual({ x: scene.tokens[0].x, y: scene.tokens[0].y }, { x: 900, y: 900 });
});

test("jeton de figurant : l'image peinte passe avant le SVG à plat, jamais en relief", () => {
  const avant = { ...TYPES_FIGURANTS };
  try {
    definirFigurants({ refugie: { libelle: "Réfugié", jeton: "figurant-refugie", image: "ia/figurant-refugie.webp" },
      garde: { libelle: "Garde", jeton: "garde" } }, "lakour-essai");
    assert.equal(jetonFigurant("refugie", "2d"), "modules/lakour-essai/assets/jetons/ia/figurant-refugie.webp");
    assert.equal(jetonFigurant("refugie", "3d"), "modules/lakour-essai/assets/jetons/3d/figurant-refugie.svg");
    assert.equal(jetonFigurant("garde", "2d"), "modules/lakour-essai/assets/jetons/garde.svg");
  } finally { definirFigurants(avant, null); }
});
