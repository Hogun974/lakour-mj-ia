// Scènes vivantes : sons d'ambiance (AmbientSound), zones (Region et leurs comportements) et notes (Note) produits par
// planVersScene, conformes aux schémas de Foundry v14 (build 14.369) recopiés ci-dessous. Chaque vérification est rejouée
// sur des copies mutées du convertisseur : chaque règle cassée doit faire échouer la batterie.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const charger = racine => import(pathToFileURL(join(racine, "scripts/cartes.js")).href);
const S = 100, D = 2; // taille d'une case en pixels, mètres par case

// ---------- Schémas Foundry v14 attendus (champs autorisés et valeurs permises)
// common/documents/ambient-sound.mjs
const CHAMPS_SON = ["_id", "name", "x", "y", "elevation", "levels", "radius", "path", "repeat", "volume", "walls", "easing", "hidden", "locked", "darkness", "effects", "flags"];
// common/documents/region.mjs ; forme : common/data/data.mjs (RectangleShapeData)
const CHAMPS_REGION = ["_id", "name", "color", "shapes", "elevation", "levels", "restriction", "attachment", "behaviors", "visibility", "highlightMode", "displayMeasurements", "hidden", "locked", "ownership", "flags", "_shapeConstraints"];
const CHAMPS_RECTANGLE = ["type", "hole", "x", "y", "width", "height", "anchorX", "anchorY", "rotation", "gridBased"];
const VISIBILITES_REGION = [0, 1, 2, 3, 4]; // CONST.REGION_VISIBILITY : LAYER, GAMEMASTER, ALWAYS, OBSERVER, LAYER_UNLOCKED
// common/documents/region-behavior.mjs (coreTypes) ; system : client/data/region-behaviors/*.mjs
const CHAMPS_COMPORTEMENT = ["_id", "name", "type", "system", "disabled", "flags", "_stats"];
const SYSTEMES = {
  displayScrollingText: ["events", "text", "color", "visibility", "once"],
  teleportToken: ["destinations", "placement", "snap", "choice", "revealed", "dialog", "transition"],
  pauseGame: ["once"],
  adjustDarknessLevel: ["mode", "modifier"]
};
const EVENEMENTS_TEXTE = ["tokenAnimateIn", "tokenAnimateOut", "tokenTurnStart", "tokenTurnEnd", "tokenRoundStart", "tokenRoundEnd"];
// common/documents/note.mjs ; CONST.TEXT_ANCHOR_POINTS : 0 à 4
const CHAMPS_NOTE = ["_id", "author", "entryId", "pageId", "x", "y", "elevation", "levels", "sort", "locked", "texture", "iconSize", "text", "fontFamily", "fontSize", "textAnchor", "textColor", "global", "flags"];
const CHAMPS_TEXTURE = ["src", "anchorX", "anchorY", "fit", "scaleX", "scaleY", "tint", "alphaThreshold"];

const estId = v => typeof v === "string" && /^[a-zA-Z0-9]{16}$/.test(v);
const champsConnus = (objet, champs, ou) => {
  for (const k of Object.keys(objet)) assert.ok(champs.includes(k), `${ou} : champ « ${k} » inconnu du schéma v14`);
};
const entier = (v, ou) => assert.ok(Number.isInteger(v), `${ou} doit être un entier (${v})`);

function verifierSon(s) {
  champsConnus(s, CHAMPS_SON, `son ${s.name}`);
  entier(s.x, "son.x"); entier(s.y, "son.y");
  assert.ok(s.radius > 0, "rayon positif");
  assert.ok(s.volume >= 0 && s.volume <= 1, `volume ${s.volume} hors de 0 à 1`);
  assert.match(s.path, /^modules\/lakour-mj-ia\/assets\/sons\/[a-z]+\.wav$/);
  assert.equal(s.walls, true, "un son d'ambiance est arrêté par les murs");
  assert.equal(s.easing, true, "fondu à l'approche");
  assert.equal(s.hidden, false, "un son caché ne joue pas");
  assert.deepEqual(s.levels, [], "tous les niveaux, comme les lumières");
}

function verifierRegion(r, regions) {
  champsConnus(r, CHAMPS_REGION, `région ${r.name}`);
  assert.ok(estId(r._id), `identifiant de région ${r._id}`);
  assert.ok(r.name, "une région a un nom");
  assert.match(r.color, /^#[0-9a-f]{6}$/i);
  assert.equal(r.shapes.length, 1);
  champsConnus(r.shapes[0], CHAMPS_RECTANGLE, "forme");
  assert.equal(r.shapes[0].type, "rectangle");
  assert.ok(r.shapes[0].width > 0 && r.shapes[0].height > 0);
  assert.ok(VISIBILITES_REGION.includes(r.visibility));
  assert.ok([0, 4].includes(r.visibility), "visible sur le calque des régions seulement : jamais toujours visible");
  assert.equal(r.ownership.default, 0, "les joueurs n'observent pas la zone, donc ne la voient pas");
  assert.equal(r.hidden, false, "une région cachée désactive ses comportements");
  assert.ok((r.elevation.bottom ?? -Infinity) <= (r.elevation.top ?? Infinity));
  assert.ok(["move", "light", "darkness", "sight", "sound"].includes(r.restriction.type));
  assert.ok(["shapes", "coverage"].includes(r.highlightMode));
  assert.ok(r.behaviors.length >= 1);
  for (const b of r.behaviors) {
    champsConnus(b, CHAMPS_COMPORTEMENT, `comportement de ${r.name}`);
    assert.ok(estId(b._id), `identifiant de comportement ${b._id}`);
    assert.ok(SYSTEMES[b.type], `type de comportement « ${b.type} » inconnu`);
    assert.deepEqual(Object.keys(b.system).sort(), [...SYSTEMES[b.type]].sort(), `champs de ${b.type}`);
    assert.equal(b.disabled, false);
    if (b.type === "displayScrollingText") {
      assert.ok(b.system.events.length && b.system.events.every(e => EVENEMENTS_TEXTE.includes(e)), `événements ${b.system.events}`);
      assert.ok(b.system.text);
      assert.ok([0, 1, 2].includes(b.system.visibility));
      assert.match(b.system.color, /^#[0-9a-f]{6}$/i);
    }
    if (b.type === "teleportToken") {
      assert.ok(["random", "center", "relative"].includes(b.system.placement));
      assert.ok(b.system.transition.duration >= 500 && b.system.transition.duration <= 10000);
      for (const uuid of b.system.destinations) assert.ok(arrivee(uuid, r, regions), `destination ${uuid} : pas une autre zone de la scène`);
    }
    if (b.type === "adjustDarknessLevel") {
      assert.ok([0, 1, 2].includes(b.system.mode));
      assert.ok(b.system.modifier >= 0 && b.system.modifier <= 1);
    }
  }
}

// Résolution d'un UUID relatif au comportement, comme parseUuid de Foundry (common/utils/helpers.mjs) : chaque point en
// tête au-delà du premier remonte d'un parent ; « ..ID » = la région sœur ID (même scène).
function arrivee(uuid, region, regions) {
  const m = /^(\.+)([a-zA-Z0-9]{16})$/.exec(uuid);
  if (!m || m[1].length !== 2) return null;
  const cible = regions.find(x => x._id === m[2]);
  return cible && cible !== region ? cible : null;
}

function verifierNote(n) {
  champsConnus(n, CHAMPS_NOTE, `note ${n.text}`);
  champsConnus(n.texture, CHAMPS_TEXTURE, "texture de note");
  assert.ok(estId(n.entryId));
  assert.ok(n.pageId === null || estId(n.pageId));
  entier(n.x, "note.x"); entier(n.y, "note.y");
  assert.ok(Number.isInteger(n.iconSize) && n.iconSize >= 32);
  assert.ok(Number.isInteger(n.fontSize) && n.fontSize >= 8 && n.fontSize <= 128);
  assert.ok([0, 1, 2, 3, 4].includes(n.textAnchor));
  assert.deepEqual(n.levels, []);
}

// ---------- Plans d'essai
// Auberge : salle commune (foule), forge (enclume ; la « Forge éteinte » se tait), quai (eau → mer), cheminée (feu).
const PLAN = {
  largeur: 16, hauteur: 10, lumiere: "penombre",
  pieces: [
    { nom: "Salle commune", x: 0, y: 0, l: 8, h: 10, sol: "bois" },
    { nom: "Forge", x: 8, y: 0, l: 8, h: 5, sol: "pierre" },
    { nom: "Quai", x: 8, y: 5, l: 8, h: 5, sol: "eau" }
  ],
  ouvertures: [{ x: 7, y: 2, cote: "est", type: "porte" }, { x: 7, y: 7, cote: "est", type: "passage" }],
  elements: [
    { nom: "Cheminée", x: 0, y: 0, l: 2, h: 1 },
    { nom: "Forge éteinte", x: 9, y: 1, l: 1, h: 1 },
    { nom: "Enclume", x: 12, y: 2, l: 1, h: 1 },
    { nom: "Comptoir de la taverne", x: 3, y: 5, l: 2, h: 1 }
  ],
  zones: [
    { nom: "Seuil", x: 0, y: 4, l: 1, h: 2, type: "texte", texte: "Une odeur de suie flotte ici." },
    { nom: "Trappe", x: 2, y: 8, l: 1, h: 1, type: "teleport", vers: "Cale" },
    { nom: "Cale", x: 14, y: 8, l: 1, h: 1, type: "teleport", vers: "Trappe" },
    { nom: "Embuscade", x: 10, y: 1, l: 3, h: 3, type: "pause" },
    { nom: "Ombre", x: 4, y: 1, l: 2, h: 2, type: "obscurite", obscurite: 0.9, mode: "assombrir" }
  ],
  notes: [
    { x: 5, y: 5, entryId: "JrnlAventure0001", pageId: "PageAuberge00001", texte: "L'auberge" },
    { x: 12, y: 2, entryId: "JrnlAventure0001", texte: "La forge", icone: "icons/svg/anvil.svg" }
  ]
};
const avec = modif => { const p = structuredClone(PLAN); modif(p); return p; };
const sonsDe = (M, plan) => M.planVersScene(plan, { taille: S, distance: D }).scene.sounds;
const resume = sons => sons.map(s => s.path.match(/sons\/(\w+)\.wav/)[1]);

const VERIFICATIONS = {
  "sons explicites : AmbientSound v14 au centre de la case, rayon en unités de grille, volume 0,5 par défaut"(M) {
    const { erreurs, scene } = M.planVersScene(avec(p => { p.sons = [{ x: 3, y: 2, rayon: 4, son: "orage" }, { x: 10, y: 7, rayon: 2, son: "mer", volume: 0.2 }]; }), { taille: S, distance: D });
    assert.deepEqual(erreurs, []);
    assert.equal(scene.sounds.length, 2, "des sons donnés : rien de déduit en plus");
    scene.sounds.forEach(verifierSon);
    const [orage, mer] = scene.sounds;
    assert.deepEqual([orage.x, orage.y], [350, 250]);
    assert.equal(orage.radius, 8, "4 cases × 2 m");
    assert.equal(orage.volume, 0.5);
    assert.equal(orage.path, "modules/lakour-mj-ia/assets/sons/orage.wav");
    assert.equal(mer.volume, 0.2);
  },

  "sons déduits : cheminée → feu, enclume → forge, salle commune → foule, eau → mer ; rien d'éteint ni de mal nommé"(M) {
    const sons = sonsDe(M, PLAN);
    sons.forEach(verifierSon);
    assert.deepEqual(resume(sons), ["feu", "forge", "foule", "mer"]);
    assert.ok(sons.every(s => s.volume <= 0.4), "volume bas");
    const foule = sons.find(s => s.path.includes("foule"));
    assert.ok(foule.volume <= 0.25, "une foule discrète");
    assert.deepEqual([sons[0].x, sons[0].y], [100, 50], "le feu au centre de la cheminée");
    assert.ok(!sons.some(s => /éteinte|Comptoir/.test(s.name)), "ni la forge éteinte, ni le comptoir de la taverne");
    assert.ok(sons.every(s => s.radius <= 15 * D), "rayon raisonnable");
  },

  "sons déduits : quatre au plus, deux fois le même son au plus"(M) {
    const plan = {
      largeur: 30, hauteur: 6, lumiere: "jour",
      pieces: [0, 1, 2, 3, 4, 5].map(i => ({ nom: i === 4 ? "Taverne" : `Salle ${i}`, x: i * 5, y: 0, l: 5, h: 6, sol: i === 5 ? "eau" : "pierre" })),
      elements: [{ nom: "Âtre", x: 1, y: 1, l: 1, h: 1 }, { nom: "Cheminée", x: 6, y: 1, l: 1, h: 1 }, { nom: "Brasero", x: 11, y: 1, l: 1, h: 1 },
        { nom: "Enclume", x: 16, y: 1, l: 1, h: 1 }]
    };
    const sons = sonsDe(M, plan);
    assert.deepEqual(resume(sons), ["feu", "feu", "forge", "foule"]);
  },

  "sons déduits : pas de foule la nuit ; dehors la nuit → nuit ; galerie de terre → grotte"(M) {
    const nuit = sonsDe(M, avec(p => { p.lumiere = "nuit"; p.pieces[2].sol = "herbe"; }));
    assert.deepEqual(resume(nuit), ["feu", "forge", "nuit"]);
    const mine = sonsDe(M, { largeur: 10, hauteur: 6, lumiere: "nuit", pieces: [{ nom: "Galerie principale", x: 0, y: 0, l: 5, h: 6, sol: "terre" }, { nom: "Galerie des portraits", x: 5, y: 0, l: 5, h: 6, sol: "pierre" }] });
    assert.deepEqual(mine.map(s => s.name), ["grotte — Galerie principale"]);
  },

  "sons désactivés : sonsAuto false"(M) {
    assert.deepEqual(sonsDe(M, avec(p => { p.sonsAuto = false; })), []);
    assert.equal(sonsDe(M, avec(p => { p.sonsAuto = false; p.sons = [{ x: 1, y: 1, rayon: 2, son: "vent" }]; })).length, 1, "les sons donnés restent");
  },

  "zones : régions v14 des quatre types, cachées aux joueurs, comportements conformes"(M) {
    const { erreurs, scene } = M.planVersScene(PLAN, { taille: S, distance: D });
    assert.deepEqual(erreurs, []);
    assert.equal(scene.regions.length, 5);
    scene.regions.forEach(r => verifierRegion(r, scene.regions));
    const par = nom => scene.regions.find(r => r.name === nom);
    const seuil = par("Seuil");
    assert.deepEqual(seuil.shapes[0], { type: "rectangle", x: 0, y: 400, width: 100, height: 200, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false });
    const texte = seuil.behaviors[0];
    assert.equal(texte.type, "displayScrollingText");
    assert.deepEqual(texte.system.events, ["tokenAnimateIn"], "à l'entrée d'un jeton");
    assert.equal(texte.system.text, "Une odeur de suie flotte ici.");
    assert.equal(texte.system.once, true, "une seule fois par défaut");
    assert.equal(par("Embuscade").behaviors[0].type, "pauseGame");
    assert.equal(par("Embuscade").behaviors[0].system.once, true, "pause une seule fois");
    const ombre = par("Ombre").behaviors[0];
    assert.equal(ombre.type, "adjustDarknessLevel");
    assert.deepEqual(ombre.system, { mode: 2, modifier: 0.9 }, "assombrir à 0,9");
    const ids = [...scene.regions.map(r => r._id), ...scene.regions.flatMap(r => r.behaviors.map(b => b._id))];
    assert.equal(new Set(ids).size, ids.length, "identifiants distincts");
  },

  "zones : la téléportation vise la zone nommée, dans les deux sens"(M) {
    const { scene } = M.planVersScene(PLAN, { taille: S, distance: D });
    const par = nom => scene.regions.find(r => r.name === nom);
    const [trappe, cale] = [par("Trappe"), par("Cale")];
    assert.equal(trappe.behaviors[0].type, "teleportToken");
    assert.equal(arrivee(trappe.behaviors[0].system.destinations[0], trappe, scene.regions), cale);
    assert.equal(arrivee(cale.behaviors[0].system.destinations[0], cale, scene.regions), trappe);
    assert.deepEqual(M.planVersScene(PLAN, { taille: S, distance: D }).scene.regions.map(r => r._id), scene.regions.map(r => r._id), "identifiants stables d'une fabrication à l'autre");
  },

  "zones : plans fautifs refusés avec un message clair"(M) {
    const casse = modif => M.planVersScene(avec(modif), { taille: S, distance: D }).erreurs.join(" | ");
    assert.match(casse(p => { p.zones[0].type = "piege"; }), /type « piege » inconnu/);
    assert.match(casse(p => { p.zones[0].x = 15; p.zones[0].l = 3; }), /hors du plan/);
    assert.match(casse(p => { p.zones[1].vers = "Grenier"; }), /« Grenier » introuvable/);
    assert.match(casse(p => { p.zones[1].vers = "Trappe"; }), /« Trappe » introuvable/, "pas de téléportation vers soi-même");
    assert.match(casse(p => { p.zones[3].nom = "Seuil"; }), /en double/);
    assert.match(casse(p => { delete p.zones[0].texte; }), /texte manquant/);
    assert.match(casse(p => { p.zones[4].obscurite = 2; }), /hors de 0 à 1/);
    assert.match(casse(p => { p.zones[4].mode = "noir"; }), /mode « noir » inconnu/);
  },

  "notes : épingles v14 au centre de la case vers le journal fourni"(M) {
    const { scene } = M.planVersScene(PLAN, { taille: S, distance: D });
    assert.equal(scene.notes.length, 2);
    scene.notes.forEach(verifierNote);
    const [auberge, forge] = scene.notes;
    assert.deepEqual([auberge.x, auberge.y, auberge.entryId, auberge.pageId, auberge.text], [550, 550, "JrnlAventure0001", "PageAuberge00001", "L'auberge"]);
    assert.equal(auberge.texture.src, "icons/svg/book.svg");
    assert.equal(forge.pageId, null);
    assert.equal(forge.texture.src, "icons/svg/anvil.svg");
  },

  "sons et notes fautifs refusés"(M) {
    const casse = modif => M.planVersScene(avec(modif), { taille: S, distance: D }).erreurs.join(" | ");
    assert.match(casse(p => { p.sons = [{ x: 1, y: 1, rayon: 2, son: "cornemuse" }]; }), /son « cornemuse » inconnu/);
    assert.match(casse(p => { p.sons = [{ x: 40, y: 1, rayon: 2, son: "feu" }]; }), /hors du plan/);
    assert.match(casse(p => { p.sons = [{ x: 1, y: 1, rayon: 0, son: "feu" }]; }), /rayon 0 invalide/);
    assert.match(casse(p => { p.sons = [{ x: 1, y: 1, rayon: 2, son: "feu", volume: 3 }]; }), /volume 3 hors de 0 à 1/);
    assert.match(casse(p => { p.notes[0].entryId = "auberge"; }), /identifiant de journal ou de page invalide/);
    assert.match(casse(p => { p.notes[1].pageId = "court"; }), /identifiant de journal ou de page invalide/);
    assert.match(casse(p => { p.notes[0].x = -1; }), /hors du plan/);
  },

  "identifiants stables : 16 lettres ou chiffres, même graine même identifiant"(M) {
    const a = M.idStable("zone:Trappe");
    assert.ok(estId(a), a);
    assert.equal(M.idStable("zone:Trappe"), a);
    assert.notEqual(M.idStable("zone:Cale"), a);
  },

  "sans zones, sons ni notes : collections vides, la scène reste valable"(M) {
    const { erreurs, scene } = M.planVersScene({ largeur: 6, hauteur: 5, lumiere: "jour", pieces: [{ nom: "Cellule", x: 1, y: 1, l: 3, h: 2, sol: "pierre" }] }, { taille: S });
    assert.deepEqual(erreurs, []);
    assert.deepEqual([scene.sounds, scene.regions, scene.notes], [[], [], []]);
  }
};

const MUTATIONS = [
  ["walls: true, easing: true", "walls: false, easing: false", "murs et fondu"],
  ["radius: s.rayon * distance", "radius: s.rayon", "rayon en unités de grille"],
  ["const volume = s.volume ?? 0.5;", "const volume = s.volume ?? 1;", "volume par défaut"],
  ["cheminSon = son => `modules/lakour-mj-ia/assets/sons/${son}.wav`", "cheminSon = son => `sons/${son}.ogg`", "chemin des sons"],
  ["if (!(plan.sons ?? []).length && plan.sonsAuto !== false)", "if (!(plan.sons ?? []).length)", "désactivable"],
  ["if (!(plan.sons ?? []).length && plan.sonsAuto !== false)", "if (plan.sonsAuto !== false)", "les sons donnés remplacent la déduction"],
  ["    if (retenus.length >= MAX_SONS_DEDUITS) break;\n", "", "quatre sons au plus"],
  ["memes.length >= MAX_PAR_SON || ", "", "deux fois le même son au plus"],
  ["!(r.jour && nuit)", "true", "pas de foule la nuit"],
  ["    if (SANS_SON.test(n)) return null;\n", "", "rien d'éteint"],
  ["n.match(r.motif)?.index === 0", "r.motif.test(n)", "mot-clé en tête du nom d'un élément"],
  ["    if (!r && p.sol === \"eau\") r = { son: \"mer\", volume: 0.3 };\n", "", "eau → mer"],
  ["    if (!r && nuit && p.sol === \"herbe\") r = { son: \"nuit\", volume: 0.25 };\n", "", "dehors la nuit"],
  ["{ son: \"foule\", volume: 0.2,", "{ son: \"foule\", volume: 0.8,", "foule discrète"],
  ["visibility: VISIBILITE_REGION.LAYER", "visibility: 2", "cachée aux joueurs"],
  ["displayMeasurements: false, hidden: false", "displayMeasurements: false, hidden: true", "jamais cachée"],
  ["ownership: { default: 0 },", "ownership: { default: 2 },", "les joueurs n'observent pas"],
  ["events: [ENTREE_JETON]", "events: [\"tokenEnter\"]", "événement d'entrée"],
  ["destinations: [`..${idZone(z.vers)}`]", "destinations: [`.${idZone(z.vers)}`]", "UUID relatif de la zone sœur"],
  ["system: { once: z.unique !== false } };", "system: { once: false } };", "pause une seule fois"],
  ["    if (nomsZones.has(z.nom)) erreurs.push(", "    if (false) erreurs.push(", "nom de zone unique"],
  [" || z.vers === z.nom", "", "pas de téléportation vers soi"],
  ["mode, modifier: z.obscurite", "mode, modifier: 1 - z.obscurite", "niveau d'obscurité"],
  ["const mode = MODES_OBSCURITE[z.mode ?? \"fixer\"];", "const mode = 0;", "mode d'obscurité"],
  ["if (!(z.obscurite >= 0 && z.obscurite <= 1))", "if (false)", "obscurité bornée"],
  ["x: Math.round((n.x + 0.5) * taille)", "x: Math.round(n.x * taille)", "note au centre de la case"],
  ["if (!estId(n.entryId) || (n.pageId != null && !estId(n.pageId)))", "if (false)", "identifiants de journal valides"],
  ["textAnchor: ANCRE_TEXTE.BOTTOM", "textAnchor: 9", "ancre du texte"],
  ["  return id;\n}", "  return id.slice(1);\n}", "identifiant de 16 caractères"],
  ["if (!SONS_AMBIANCE.includes(s.son))", "if (false)", "son connu"]
];

// Copie du convertisseur mutée dans un dossier temporaire (le fichier est pur : rien d'autre à copier).
async function chargerMutant(avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-scenes-mutant-"));
  mkdirSync(join(dossier, "scripts"));
  cpSync(join(RACINE, "scripts/cartes.js"), join(dossier, "scripts/cartes.js"));
  const chemin = join(dossier, "scripts/cartes.js");
  const texte = readFileSync(chemin, "utf8");
  assert.ok(texte.includes(avant), `mutation introuvable dans cartes.js : ${avant}`);
  writeFileSync(chemin, texte.replace(avant, apres));
  try { return await charger(dossier); }
  finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push({ nom, e }); }
  }
  return liste;
}

test("scènes vivantes : le convertisseur d'origine passe toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("scènes vivantes : chaque règle cassée est détectée par la batterie", async () => {
  const passees = [];
  for (const [avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(avant, apres))).length) passees.push(regle);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});

test("scènes vivantes : les sons du convertisseur sont ceux du moteur (assets/sons/index.json), fichiers présents", async () => {
  const M = await charger(RACINE);
  const index = JSON.parse(readFileSync(join(RACINE, "assets/sons/index.json"), "utf8"));
  assert.deepEqual([...M.SONS_AMBIANCE].sort(), Object.keys(index).sort());
  for (const son of M.SONS_AMBIANCE) {
    assert.equal(M.cheminSon(son), index[son].fichier);
    assert.ok(existsSync(join(RACINE, M.cheminSon(son).replace(/^modules\/lakour-mj-ia\//, ""))), `${son} : fichier absent`);
  }
});
