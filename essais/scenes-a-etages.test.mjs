// Cartes à étages (Scene Levels de Foundry v14) : un niveau par étage avec son propre fond, chaque mur, dessin,
// lumière, son, zone et note rattaché au niveau de SON étage, escaliers en régions « Change Level » utilisables dans les
// deux sens, creer_scene qui dépose un fond par niveau dans un seul Scene.create ; un plan sans étages donne exactement la
// même scène qu'avant. Chaque vérification est rejouée sur des copies mutées du moteur : chaque règle cassée doit faire
// échouer la batterie. Si les sources de Foundry v14 sont là (variable FOUNDRY_V14 = dossier contenant common/, sinon
// une copie « fvtt14 » dans le dossier temporaire des sessions Claude), la scène est aussi validée par les vraies classes
// en mode strict, dans un processus à part.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { installer } from "./doublures/foundry-decisions.mjs";

installer();
const RACINE = fileURLToPath(new URL("../", import.meta.url));
const S = 100, D = 2; // taille d'une case en pixels, mètres par case

// ---------- Doublures pour creer_scene : dépôt de fichiers et création de scène retenus.
let depots = [], creations = [];
game.world = { id: "monde-essai" };
const getReglage = game.settings.get;
game.settings.get = (module, cle) => (cle === "styleVisuel" ? "2d" : getReglage(module, cle));
foundry.applications.apps = { FilePicker: { implementation: {
  createDirectory: async () => {},
  upload: async (source, dossier, fichier) => { depots.push({ dossier, nom: fichier.name, texte: await fichier.text() }); return { path: `${dossier}/${fichier.name}` }; }
} } };
globalThis.Scene = { implementation: { create: async donnees => { creations.push(structuredClone(donnees)); return { uuid: "Scene.EssaiEtages00001", activate: async () => {} }; } } };

async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [cartes, rendu, outils] = await Promise.all([m("scripts/cartes.js"), m("scripts/cartes-rendu.js"), m("scripts/outils.js")]);
  return { cartes, rendu, outils, creer: outils.OUTILS.find(o => o.nom === "creer_scene") };
}

// ---------- Schémas Foundry v14 attendus
// common/documents/level.mjs
const CHAMPS_NIVEAU = ["_id", "name", "elevation", "background", "foreground", "fog", "textures", "visibility", "sort", "flags"];
const CHAMPS_FOND = ["color", "src", "tint", "alphaThreshold"];
// client/data/region-behaviors/change-level.mjs : movementActions, parmi CONFIG.Token.movement.actions sauf displace.
const ACTIONS = ["walk", "fly", "swim", "burrow", "climb", "crawl", "jump", "blink"];
const estId = v => typeof v === "string" && /^[a-zA-Z0-9]{16}$/.test(v);
const champsConnus = (objet, champs, ou) => {
  for (const k of Object.keys(objet)) assert.ok(champs.includes(k), `${ou} : champ « ${k} » inconnu du schéma v14`);
};

// Un jeton est-il dans la région ? Recopie de TokenDocument#testInsideRegion (client/documents/token.mjs), partie
// niveau et élévation : la région doit être du niveau du jeton (aucun niveau = tous), et l'élévation dans sa tranche.
function jetonDansRegion(region, { niveau, elevation, depth = 1 }) {
  if (region.levels.length && !region.levels.includes(niveau)) return false;
  const bottom = region.elevation.bottom ?? -Infinity, top = region.elevation.top ?? Infinity;
  if (region.elevation.topInclusive) { if (elevation > top) return false; }
  else if ((elevation !== bottom) && (elevation >= top)) return false;
  const tete = elevation + depth * D;
  return depth === 0 ? tete >= bottom : tete > bottom;
}
// Niveaux proposés par Change Level à un jeton (#getDestinationLevels) : ceux de la région, sauf le sien.
const destinations = (region, niveau) => region.levels.filter(id => id !== niveau);
// Élévation d'un jeton posé sur un niveau (Level#prepareBaseData : elevation.base).
const base = niveau => (Number.isFinite(niveau.elevation.bottom) ? niveau.elevation.bottom : Math.min(niveau.elevation.top ?? Infinity, 0));

// ---------- Plans d'essai
// Une maison : la cave (en dessous), le rez (on y arrive), l'étage. Escalier rez ↔ étage, échelle cave ↔ rez,
// et une trappe du rez qui téléporte au fond de la cave (zone d'un autre étage).
const PLAN = {
  largeur: 10, hauteur: 8, lumiere: "nuit",
  etages: [
    { nom: "Rez", elevation: 0,
      pieces: [{ nom: "Hall", x: 0, y: 0, l: 6, h: 8, sol: "pierre" }, { nom: "Cuisine", x: 6, y: 0, l: 4, h: 8, sol: "bois" }],
      ouvertures: [{ x: 5, y: 3, cote: "est", type: "porte" }, { x: 2, y: 0, cote: "nord", type: "fenetre" }],
      lumieres: [{ x: 2, y: 2, rayon: 3, couleur: "#ff8844" }],
      elements: [{ nom: "Cheminée", x: 7, y: 0, l: 2, h: 1 }],
      zones: [{ nom: "Trappe", x: 8, y: 6, l: 1, h: 1, type: "teleport", vers: "Fond" }],
      notes: [{ x: 1, y: 1, entryId: "JrnlAventure0001", texte: "Hall" }] },
    { nom: "Cave", elevation: -3,
      pieces: [{ nom: "Cellier", x: 0, y: 0, l: 10, h: 8, sol: "terre" }],
      zones: [{ nom: "Fond", x: 9, y: 7, l: 1, h: 1, type: "texte", texte: "Ça sent le moisi." }] },
    { nom: "Étage", elevation: 3,
      pieces: [{ nom: "Chambre", x: 0, y: 0, l: 7, h: 8, sol: "luxe" }, { nom: "Grenier", x: 7, y: 0, l: 3, h: 8, sol: "bois" }],
      ouvertures: [{ x: 6, y: 4, cote: "est", type: "verrouillee" }],
      lumieres: [{ x: 3, y: 3, rayon: 2 }],
      sons: [{ x: 4, y: 4, rayon: 3, son: "vent" }] }
  ],
  escaliers: [
    { nom: "Escalier", x: 1, y: 5, l: 2, h: 1, etages: ["Rez", "Étage"] },
    { nom: "Échelle", x: 0, y: 7, etages: ["Cave", "Rez"] }
  ]
};
const avec = modif => { const p = structuredClone(PLAN); modif(p); return p; };
const convertir = (M, plan = PLAN) => M.cartes.planVersScene(plan, { taille: S, distance: D });
// Un étage seul, converti comme une carte simple : la référence de ce que son niveau doit contenir.
const etageSeul = (M, e) => M.cartes.planVersScene({ largeur: PLAN.largeur, hauteur: PLAN.hauteur, lumiere: PLAN.lumiere,
  pieces: e.pieces, ouvertures: e.ouvertures, lumieres: e.lumieres, elements: e.elements, sons: e.sons }, { taille: S, distance: D }).scene;
const sans = (d, ...cles) => Object.fromEntries(Object.entries(d).filter(([k]) => !cles.includes(k)));

// Carte simple de référence (auberge complète) et empreinte de sa scène AVANT les étages : elle ne doit pas bouger.
const SIMPLE = {
  largeur: 16, hauteur: 10, lumiere: "penombre",
  pieces: [
    { nom: "Salle commune", x: 0, y: 0, l: 8, h: 10, sol: "bois" },
    { nom: "Forge", x: 8, y: 0, l: 8, h: 5, sol: "pierre" },
    { nom: "Quai", x: 8, y: 5, l: 8, h: 5, sol: "eau" }
  ],
  ouvertures: [{ x: 7, y: 2, cote: "est", type: "porte" }, { x: 7, y: 7, cote: "est", type: "passage" }, { x: 10, y: 0, cote: "nord", type: "fenetre" }, { x: 12, y: 4, cote: "sud", type: "verrouillee" }],
  lumieres: [{ x: 2, y: 2, rayon: 3, couleur: "#ff8844" }],
  elements: [{ nom: "Cheminée", x: 0, y: 0, l: 2, h: 1 }, { nom: "Enclume", x: 12, y: 2, l: 1, h: 1 }],
  zones: [{ nom: "Trappe", x: 2, y: 8, l: 1, h: 1, type: "teleport", vers: "Cale" }, { nom: "Cale", x: 14, y: 8, l: 1, h: 1, type: "teleport", vers: "Trappe" }],
  notes: [{ x: 5, y: 5, entryId: "JrnlAventure0001", texte: "L'auberge" }]
};
const EMPREINTES_SIMPLE = { 2: "117d6a9e47c0eb59", 1.5: "a4d678b64bc219ef" };
const empreinte = o => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

// Plan de creer_scene : schéma strict, tous les champs présents (vides à la racine pour une carte à étages).
const VIDE = { pieces: [], ouvertures: [], lumieres: [], elements: [], sons: [], zones: [] };
const pourOutil = plan => ({
  nom: "Maison du passeur", largeur: plan.largeur, hauteur: plan.hauteur, lumiere: plan.lumiere, ...VIDE,
  etages: plan.etages.map(e => ({ ...VIDE, nom: e.nom, elevation: e.elevation, pieces: e.pieces, ouvertures: e.ouvertures ?? [],
    lumieres: (e.lumieres ?? []).map(l => ({ couleur: "", ...l })), elements: e.elements ?? [], sons: e.sons ?? [],
    zones: (e.zones ?? []).map(z => ({ texte: "", vers: "", obscurite: 0, ...z })) })),
  escaliers: plan.escaliers.map(s => ({ l: 1, h: 1, ...s })),
  image: false, description_image: "", activer: false
});

const VERIFICATIONS = {
  "niveaux : un par étage, conformes au schéma v14, dans l'ordre du plan, rangés par altitude, plafond au sol du dessus"(M) {
    const { erreurs, scene } = convertir(M);
    assert.deepEqual(erreurs, []);
    assert.equal(scene.levels.length, 3);
    for (const l of scene.levels) {
      champsConnus(l, CHAMPS_NIVEAU, `niveau ${l.name}`);
      champsConnus(l.background, CHAMPS_FOND, `fond du niveau ${l.name}`);
      assert.ok(estId(l._id), `identifiant de niveau ${l._id}`);
      assert.ok((l.elevation.bottom ?? -Infinity) <= (l.elevation.top ?? Infinity), "elevation.top >= elevation.bottom");
      assert.ok("top" in l.elevation, "top toujours donné (sinon Foundry le fixe à 4 cases, sous le sol d'un étage haut)");
    }
    assert.deepEqual(scene.levels.map(l => l.name), ["Rez", "Cave", "Étage"], "ordre du plan");
    assert.equal(scene.levels[0]._id, M.cartes.DEFAULT_LEVEL, "le premier étage garde le niveau par défaut");
    assert.equal(scene.initialLevel, M.cartes.DEFAULT_LEVEL, "on arrive au premier étage du plan");
    assert.equal(new Set(scene.levels.map(l => l._id)).size, 3, "identifiants distincts");
    assert.deepEqual(scene.levels.map(l => l.sort), [1, 0, 2], "sort : du plus bas au plus haut");
    assert.deepEqual(scene.levels.map(l => l.elevation), [{ bottom: 0, top: 3 }, { bottom: -3, top: 0 }, { bottom: 3, top: null }]);
    assert.deepEqual(convertir(M).scene.levels.map(l => l._id), scene.levels.map(l => l._id), "identifiants stables");
  },

  "chaque document est rattaché au niveau de son étage, à son élévation, et rien d'un étage ne fuit sur un autre"(M) {
    const { scene } = convertir(M);
    const id = nom => scene.levels.find(l => l.name === nom)._id;
    for (const c of ["walls", "drawings", "lights", "sounds", "notes", "regions"]) {
      for (const d of scene[c]) assert.ok(d.levels.length >= 1, `${c} : un document sans niveau serait sur TOUS les étages`);
    }
    for (const e of PLAN.etages) {
      const n = id(e.nom), ref = etageSeul(M, e);
      const du = c => scene[c].filter(d => d.levels.length === 1 && d.levels[0] === n);
      assert.deepEqual(du("walls").map(w => sans(w, "levels")), ref.walls.map(w => sans(w, "levels")), `murs et portes de « ${e.nom} »`);
      assert.deepEqual(du("drawings").map(d => sans(d, "levels")), ref.drawings.map(d => sans(d, "levels")), `sols et étiquettes de « ${e.nom} »`);
      assert.deepEqual(du("lights").map(d => sans(d, "levels", "elevation")), ref.lights.map(d => sans(d, "levels", "elevation")), `lumières de « ${e.nom} »`);
      assert.deepEqual(du("sounds").map(d => sans(d, "levels", "elevation")), ref.sounds.map(d => sans(d, "levels", "elevation")), `sons de « ${e.nom} »`);
      for (const d of [...du("lights"), ...du("sounds"), ...du("notes")]) assert.equal(d.elevation, e.elevation, `élévation d'un document de « ${e.nom} »`);
    }
    const total = c => PLAN.etages.reduce((t, e) => t + etageSeul(M, e)[c].length, 0);
    for (const c of ["walls", "drawings", "lights", "sounds"]) assert.equal(scene[c].length, total(c), `${c} : ni doublon ni oubli`);
    assert.deepEqual(scene.notes.map(n => [n.text, n.levels]), [["Hall", [id("Rez")]]]);
    const zone = nom => scene.regions.find(r => r.name === nom);
    assert.deepEqual(zone("Trappe").levels, [id("Rez")], "zone au niveau de son étage");
    assert.deepEqual(zone("Fond").levels, [id("Cave")]);
    assert.ok(scene.walls.some(w => w.levels[0] === id("Étage") && w.ds === 2), "la porte verrouillée de l'étage");
    assert.ok(!scene.walls.some(w => w.levels[0] === id("Cave") && w.door), "aucune porte à la cave");
  },

  "escaliers : région Change Level invisible des joueurs, sur les niveaux reliés seulement, aux mêmes cases"(M) {
    const { scene } = convertir(M);
    const id = nom => scene.levels.find(l => l.name === nom)._id;
    const escaliers = scene.regions.filter(r => r.behaviors.some(b => b.type === "changeLevel"));
    assert.deepEqual(escaliers.map(r => r.name), ["Escalier", "Échelle"]);
    for (const r of escaliers) {
      assert.ok(estId(r._id) && estId(r.behaviors[0]._id));
      assert.equal(r.behaviors.length, 1);
      const b = r.behaviors[0];
      assert.deepEqual(Object.keys(b.system), ["movementActions"], "schéma de changeLevel");
      assert.ok(b.system.movementActions.every(a => ACTIONS.includes(a)), "actions de déplacement connues (jamais displace)");
      assert.equal(b.disabled, false);
      assert.equal(r.hidden, false, "une région cachée désactive ses comportements");
      assert.equal(r.ownership.default, 0, "les joueurs ne l'observent pas");
      assert.ok([0, 4].includes(r.visibility), "visible sur le calque des régions seulement");
      assert.equal(r.restriction.enabled, false, "on y marche librement");
      assert.equal(r.shapes.length, 1);
    }
    const [escalier, echelle] = escaliers;
    assert.deepEqual(escalier.shapes[0], { type: "rectangle", x: 100, y: 500, width: 200, height: 100, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false });
    assert.deepEqual(echelle.shapes[0], { type: "rectangle", x: 0, y: 700, width: 100, height: 100, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false }, "1×1 par défaut");
    assert.deepEqual([...escalier.levels].sort(), [id("Rez"), id("Étage")].sort());
    assert.deepEqual([...echelle.levels].sort(), [id("Cave"), id("Rez")].sort());
    assert.ok(!escalier.levels.includes(id("Cave")), "l'escalier ne descend pas à la cave");
  },

  "escaliers dans les deux sens : un jeton de chaque étage relié y entre et se voit proposer l'autre ; pas ailleurs"(M) {
    const { scene } = convertir(M);
    const niveau = nom => scene.levels.find(l => l.name === nom);
    const region = nom => scene.regions.find(r => r.name === nom);
    for (const [nom, haut, bas] of [["Escalier", "Étage", "Rez"], ["Échelle", "Rez", "Cave"]]) {
      const r = region(nom);
      for (const [depart, arrivee] of [[bas, haut], [haut, bas]]) {
        const n = niveau(depart);
        assert.ok(jetonDansRegion(r, { niveau: n._id, elevation: base(n) }), `${nom} : un jeton posé au sol de « ${depart} » est dans la région`);
        assert.deepEqual(destinations(r, n._id), [niveau(arrivee)._id], `${nom} : de « ${depart} », on propose « ${arrivee} »`);
      }
    }
    assert.ok(!jetonDansRegion(region("Escalier"), { niveau: niveau("Cave")._id, elevation: base(niveau("Cave")) }), "rien à la cave sous l'escalier");
  },

  "téléportation vers une zone d'un autre étage : la zone d'arrivée n'a que son niveau (le jeton en change)"(M) {
    const { scene } = convertir(M);
    const trappe = scene.regions.find(r => r.name === "Trappe");
    const [uuid] = trappe.behaviors[0].system.destinations;
    const m = /^\.\.([a-zA-Z0-9]{16})$/.exec(uuid);
    const arrivee = scene.regions.find(r => r._id === m?.[1]);
    assert.equal(arrivee?.name, "Fond");
    assert.deepEqual(arrivee.levels, [scene.levels.find(l => l.name === "Cave")._id]);
  },

  "plan sans étages : exactement la même scène qu'avant (empreinte), etages et escaliers vides ignorés"(M) {
    for (const distance of [2, 1.5]) {
      const r = M.cartes.planVersScene(SIMPLE, { taille: S, distance });
      assert.deepEqual(r.erreurs, []);
      assert.equal(empreinte(r), EMPREINTES_SIMPLE[distance], `scène d'une carte simple changée (distance ${distance})`);
      assert.equal(empreinte(M.cartes.planVersScene({ ...SIMPLE, etages: [], escaliers: [] }, { taille: S, distance })), EMPREINTES_SIMPLE[distance], "etages: [] (creer_scene)");
    }
    const { scene } = M.cartes.planVersScene(SIMPLE, { taille: S });
    assert.deepEqual(scene.levels, [{ _id: M.cartes.DEFAULT_LEVEL, name: "Niveau principal", elevation: { bottom: 0, top: null }, background: { color: "#18181b", src: null } }]);
    for (const c of ["walls", "drawings", "lights", "sounds", "notes", "regions"]) assert.ok(scene[c].every(d => d.levels.length === 0), `${c} : tous les niveaux`);
  },

  "plans à étages fautifs refusés avec un message clair"(M) {
    const casse = modif => convertir(M, avec(modif)).erreurs.join(" | ");
    assert.match(casse(p => { p.pieces = [{ nom: "X", x: 0, y: 0, l: 2, h: 2, sol: "bois" }]; }), /pieces vont dans chaque étage/);
    assert.match(casse(p => { p.etages[2].nom = "Rez"; }), /étage « Rez » en double/);
    assert.match(casse(p => { p.etages[2].elevation = 0; }), /élévation 0 déjà prise/);
    assert.match(casse(p => { delete p.etages[1].elevation; }), /élévation undefined invalide/);
    assert.match(casse(p => { p.etages = [...p.etages, ...Array.from({ length: 6 }, (_, i) => ({ nom: `N${i}`, elevation: 10 + i * 3, pieces: [{ nom: "S", x: 0, y: 0, l: 2, h: 2, sol: "bois" }] }))]; }), /9 étages : 8 au plus/);
    assert.match(casse(p => { p.escaliers[0].etages = ["Rez"]; }), /au moins deux étages différents/);
    assert.match(casse(p => { p.escaliers[0].etages = ["Rez", "Rez"]; }), /au moins deux étages différents/);
    assert.match(casse(p => { p.escaliers[0].etages = ["Rez", "Grenier"]; }), /étage « Grenier » inconnu/);
    assert.match(casse(p => { p.escaliers[0].x = 9; }), /hors du plan/);
    assert.match(casse(p => { p.escaliers[1].nom = "Escalier"; }), /« Escalier » en double/);
    assert.match(casse(p => { p.etages[2].pieces[0].h = 5; }), /cases hors des pièces de l'étage : 1,5 \(Étage\), 2,5 \(Étage\)/);
    assert.match(casse(p => { p.etages[1].zones[0].nom = "Trappe"; }), /zone « Trappe » en double/, "noms de zones uniques dans toute la scène");
    assert.match(casse(p => { p.etages[0].pieces[0].l = 20; }), /étage « Rez » : pièce « Hall » .* hors du plan/, "l'étage fautif est nommé");
    assert.match(convertir(M, { ...SIMPLE, escaliers: [{ nom: "E", x: 1, y: 1, etages: ["A", "B"] }] }).erreurs.join(), /escaliers sans étages/);
  },

  "fonds : un SVG par niveau (fondsDesNiveaux), aux murs et marches de son étage"(M) {
    const { scene } = convertir(M);
    const { erreurs, fonds } = M.rendu.fondsDesNiveaux(PLAN, { taille: S });
    assert.deepEqual(erreurs, []);
    assert.deepEqual(fonds.map(f => f.niveau), scene.levels.map(l => l._id), "un fond par niveau, dans l'ordre des niveaux");
    assert.deepEqual(fonds.map(f => f.suffixe), ["-rez", "-cave", "-etage"]);
    assert.equal(new Set(fonds.map(f => f.svg)).size, 3, "trois fonds différents");
    for (const f of fonds) {
      assert.match(f.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1000" height="800" viewBox="0 0 1000 800">/, `fond de « ${f.nom} » à la taille de la scène`);
      const murs = scene.walls.filter(w => w.levels[0] === f.niveau && w.sight !== 0 && w.door !== 1).length;
      assert.equal((f.svg.match(/stroke="#16171a"/g) ?? []).length, murs, `murs pleins de « ${f.nom} » seulement`);
    }
    const marches = f => (f.svg.match(/fill="#6b625a"/g) ?? []).length;
    assert.deepEqual(fonds.map(marches), [2, 1, 1], "rez : escalier et échelle ; cave : échelle ; étage : escalier");
    assert.equal(M.rendu.planVersSVG(PLAN, { taille: S, etage: "Cave" }).svg, fonds[1].svg, "étage par nom");
    assert.equal(M.rendu.planVersSVG(PLAN, { taille: S }).svg, fonds[0].svg, "sans étage précisé : le premier");
    assert.match(M.rendu.planVersSVG(PLAN, { taille: S, etage: "Toit" }).erreurs.join(), /étage « Toit » inconnu/);
    const homonymes = M.rendu.fondsDesNiveaux(avec(p => { p.etages[1].nom = "Etage"; p.escaliers[1].etages = ["Etage", "Rez"]; }), { taille: S }).fonds;
    assert.equal(new Set(homonymes.map(f => f.suffixe)).size, 3, "« Étage » et « Etage » : fichiers distincts");
  },

  "fonds d'une carte simple : un seul, au niveau par défaut, sans suffixe, identique à planVersSVG"(M) {
    for (const style of ["2d", "3d"]) {
      const { fonds } = M.rendu.fondsDesNiveaux(SIMPLE, { taille: S, style });
      assert.equal(fonds.length, 1);
      assert.deepEqual([fonds[0].niveau, fonds[0].suffixe, fonds[0].nom], [M.cartes.DEFAULT_LEVEL, "", null]);
      assert.equal(fonds[0].svg, M.rendu.planVersSVG(SIMPLE, { taille: S, style }).svg);
    }
  },

  "creer_scene : schéma strict avec etages et escaliers, chaque étage a le contenu complet d'un plan"(M) {
    const p = M.creer.schema.properties;
    for (const c of ["etages", "escaliers"]) {
      assert.equal(p[c].type, "array");
      assert.deepEqual([...p[c].items.required].sort(), Object.keys(p[c].items.properties).sort(), `${c} : tous les champs requis`);
      assert.equal(p[c].items.additionalProperties, false);
    }
    assert.deepEqual(Object.keys(p.etages.items.properties).sort(), ["elements", "elevation", "lumieres", "nom", "ouvertures", "pieces", "sons", "zones"]);
    for (const c of ["pieces", "ouvertures", "lumieres", "elements", "sons", "zones"]) assert.deepEqual(p.etages.items.properties[c], p[c], `${c} : comme à la racine`);
    assert.deepEqual(Object.keys(p.escaliers.items.properties).sort(), ["etages", "h", "l", "nom", "x", "y"]);
    assert.equal(p.escaliers.items.properties.etages.items.type, "string");
  },

  async "creer_scene : un fond dessiné par niveau, tous dans un seul Scene.create"(M) {
    depots = []; creations = [];
    const plan = pourOutil(PLAN);
    const r = await M.creer.executer(plan);
    assert.ok(!r.erreur, r.contenu);
    assert.match(r.contenu, /3 étages \(Rez, Cave, Étage ; on arrive à « Rez »\), 2 escaliers/);
    assert.equal(creations.length, 1, "une seule création de scène");
    const [s] = creations;
    const { fonds } = M.rendu.fondsDesNiveaux(plan, { taille: 100, style: "2d" });
    assert.equal(depots.length, 3, "trois fonds déposés");
    assert.equal(new Set(depots.map(d => d.nom)).size, 3, "trois fichiers distincts");
    for (const [i, l] of s.levels.entries()) {
      const depot = depots.find(d => `${d.dossier}/${d.nom}` === l.background.src);
      assert.ok(depot, `niveau « ${l.name} » : fond déposé`);
      assert.equal(depot.texte, fonds.find(f => f.niveau === l._id).svg, `niveau « ${l.name} » : SON fond`);
      assert.equal(l._id, fonds[i].niveau);
    }
    assert.equal(s.initialLevel, s.levels[0]._id);
    assert.ok(s.drawings.every(d => d.hidden), "restent les étiquettes MJ");
    assert.ok(s.regions.some(x => x.behaviors[0].type === "changeLevel"));
    assert.deepEqual(s.flags["lakour-mj-ia"].plan.etages.map(e => e.nom), ["Rez", "Cave", "Étage"], "plan gardé");
  },

  async "creer_scene : une carte simple comme avant (un fond, sans suffixe d'étage)"(M) {
    depots = []; creations = [];
    const plan = { nom: "Auberge", ...VIDE, ...structuredClone(SIMPLE), etages: [], escaliers: [], image: false, description_image: "", activer: false };
    plan.lumieres = plan.lumieres.map(l => ({ couleur: "", ...l }));
    plan.zones = plan.zones.map(z => ({ texte: "", obscurite: 0, ...z }));
    delete plan.notes;
    const r = await M.creer.executer(plan);
    assert.ok(!r.erreur, r.contenu);
    assert.doesNotMatch(r.contenu, /étages/);
    assert.equal(depots.length, 1);
    assert.match(depots[0].nom, /^\d+-auberge-2d\.svg$/);
    assert.equal(depots[0].texte, M.rendu.planVersSVG(plan, { taille: 100, style: "2d" }).svg);
    assert.equal(creations[0].levels.length, 1);
    assert.equal(creations[0].levels[0].background.src, `${depots[0].dossier}/${depots[0].nom}`);
  },

  async "creer_scene : plan à étages fautif refusé sans rien créer"(M) {
    depots = []; creations = [];
    const plan = pourOutil(PLAN);
    plan.pieces = [{ nom: "Cour", x: 0, y: 0, l: 2, h: 2, sol: "herbe" }];
    const r = await M.creer.executer(plan);
    assert.equal(r.erreur, true);
    assert.match(r.contenu, /Plan refusé : .*pieces vont dans chaque étage/);
    assert.deepEqual([depots.length, creations.length], [0, 0]);
  }
};

const MUTATIONS = [
  ["scripts/cartes.js", "const niveaux = () => (niveau ? [niveau] : []);", "const niveaux = () => [];", "documents rattachés à leur niveau"],
  ["scripts/cartes.js", "elevation, levels: niveaux(), walls: true,", "elevation: 0, levels: niveaux(), walls: true,", "lumières à l'élévation de l'étage"],
  ["scripts/cartes.js", "top: parAltitude[rang + 1]?.elevation ?? null", "top: null", "plafond au sol du dessus"],
  ["scripts/cartes.js", "background: { color: \"#18181b\", src: null }, sort: rang };", "background: { color: \"#18181b\", src: null }, sort: 0 };", "niveaux rangés par altitude"],
  ["scripts/cartes.js", "niveau: i === 0 ? DEFAULT_LEVEL : idStable(", "niveau: idStable(", "premier étage au niveau par défaut"],
  ["scripts/cartes.js", "levels: desservis.map(e => e.niveau),", "levels: [desservis[0].niveau],", "escalier sur tous les niveaux reliés"],
  ["scripts/cartes.js", "type: \"changeLevel\", system: { movementActions: [] }", "type: \"teleportToken\", system: { movementActions: [] }", "comportement Change Level"],
  ["scripts/cartes.js", "top: desservis.at(-1).elevation + distance", "top: desservis.at(-1).elevation", "jeton de l'étage du haut dans l'escalier"],
  ["scripts/cartes.js", "elevation: { bottom: desservis[0].elevation,", "elevation: { bottom: desservis.at(-1).elevation,", "jeton de l'étage du bas dans l'escalier"],
  ["scripts/cartes.js", "    if (dehors.length) {", "    if (false) {", "escalier dans les pièces"],
  ["scripts/cartes.js", "if (new Set(relies).size < 2 ||", "if (new Set(relies).size < 1 ||", "deux étages au moins"],
  ["scripts/cartes.js", "else if (elevations.has(e.elevation))", "else if (false)", "élévation unique"],
  ["scripts/cartes.js", "const surRacine = CONTENUS_ETAGE.filter(c => plan[c]?.length);", "const surRacine = [];", "rien à la racine d'un plan à étages"],
  ["scripts/cartes.js", "if (plan.etages?.length || plan.escaliers?.length) return", "if (plan.etages?.length) return", "escaliers sans étages refusés"],
  ["scripts/cartes.js", "      ownership: { default: 0 },\n      // movementActions", "      ownership: { default: 2 },\n      // movementActions", "escalier invisible des joueurs"],
  ["scripts/cartes.js", "}).map(z => ({ z, niveau, prefixe }));", "}).map(z => ({ z, niveau: null, prefixe }));", "zones au niveau de leur étage"],
  ["scripts/cartes.js", "regionsDesZones(etages.flatMap(e => e.docs.zones), { taille, erreurs })", "etages.flatMap(e => regionsDesZones(e.docs.zones, { taille, erreurs }))", "zones d'un étage à l'autre"],
  ["scripts/cartes.js", "if (plan.etages.length > MAX_ETAGES)", "if (false)", "nombre d'étages borné"],
  ["scripts/cartes-rendu.js", "walls = scene.walls.filter(w => w.levels.includes(choisi.niveau));", "walls = scene.walls;", "fond : murs de l'étage seul"],
  ["scripts/cartes-rendu.js", "escaliers = (plan.escaliers ?? []).filter(s => s.etages.includes(choisi.nom));", "escaliers = plan.escaliers ?? [];", "marches des étages reliés seulement"],
  ["scripts/cartes-rendu.js", "etage: e.nom === null ? null : i", "etage: null", "un fond par niveau"],
  ["scripts/cartes-rendu.js", "if (suffixes.has(suffixe)) suffixe +=", "if (false) suffixe +=", "noms de fichiers distincts"],
  ["scripts/outils.js", "await deposerFondDessine(plan, slug, lire(\"styleVisuel\"), i);", "await deposerFondDessine(plan, slug, lire(\"styleVisuel\"));", "chaque niveau son fond"],
  ["scripts/outils.js", "const { svg } = planVersSVG(plan, { taille: 100, style, etage });", "const { svg } = planVersSVG(plan, { taille: 100, style });", "fond de l'étage demandé"],
  ["scripts/outils.js", "const aEtages = Boolean(plan.etages?.length);", "const aEtages = false;", "carte à étages reconnue"],
  ["scripts/outils.js", "${etage === null ? \"\" : `-n${etage}`}", "", "un fichier par étage"],
  ["scripts/outils.js", "elevation: { type: \"number\", description: \"Altitude du sol de l'étage en mètres, unique (cave -3, rez 0, étage 3…).\" }, ...CONTENU_PLAN }) },",
    "elevation: { type: \"number\", description: \"Altitude.\" }, pieces: CONTENU_PLAN.pieces }) },", "étage complet dans le schéma"]
];

// Copie du moteur mutée dans un dossier temporaire.
async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-etages-mutant-"));
  for (const d of ["scripts", "vendor"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  const chemin = join(dossier, fichier);
  const texte = readFileSync(chemin, "utf8");
  assert.ok(texte.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
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

test("cartes à étages : le moteur d'origine passe toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("cartes à étages : chaque règle cassée est détectée par la batterie", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(regle);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});

test("cartes à étages : chaque fond est un SVG valide (rendu réel par resvg, plat et relief)", async () => {
  const { rendu } = await charger(RACINE);
  for (const style of ["2d", "3d"]) {
    for (const f of rendu.fondsDesNiveaux(PLAN, { taille: S, style }).fonds) {
      const image = new Resvg(f.svg).render();
      assert.deepEqual([image.width, image.height], [1000, 800], `fond ${style} de « ${f.nom} »`);
    }
  }
});

// ---------- Validation par les vraies classes de Foundry v14 (mode strict), dans un processus à part : elles
// installent leurs propres globales (foundry, CONST, game), incompatibles avec les doublures ci-dessus.
function sourcesFoundry() {
  const candidats = [process.env.FOUNDRY_V14].filter(Boolean);
  const sessions = join(tmpdir(), "claude");
  try {
    for (const projet of readdirSync(sessions)) {
      for (const session of readdirSync(join(sessions, projet))) candidats.push(join(sessions, projet, session, "scratchpad", "fvtt14"));
    }
  } catch { /* aucune session */ }
  return candidats.find(d => existsSync(join(d, "common", "server.mjs")) && existsSync(join(d, "common", "documents", "level.mjs"))) ?? null;
}
const FOUNDRY = sourcesFoundry();

// Même préparation que outils/valider-foundry.mjs ; les types de comportements de région sont ceux du cœur.
const VALIDATEUR = `
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [dossier, fichier] = process.argv.slice(1);
const foundry = await import(pathToFileURL(dossier + "/common/server.mjs").href);
globalThis.foundry = foundry; globalThis.CONST = foundry.CONST;
globalThis.CONFIG = { Token: { movement: { actions: { walk: {}, fly: {}, swim: {}, burrow: {}, climb: {}, crawl: {}, jump: {}, blink: {}, displace: {} } } } };
const types = nom => nom === "RegionBehavior" ? Object.fromEntries(foundry.documents.BaseRegionBehavior.metadata.coreTypes.map(t => [t, {}])) : { base: {} };
globalThis.game = { release: { version: "14.369", generation: 14 }, model: new Proxy({}, { get: (_, nom) => types(nom) }),
  system: { id: "dnd5e", version: "1", grid: { type: 1, distance: 2, units: "m" }, documentTypes: new Proxy({}, { get: (_, nom) => types(nom) }) },
  documentTypes: new Proxy({}, { get: (_, nom) => Object.keys(types(nom)) }) };
const resultats = [];
for (const donnees of JSON.parse(readFileSync(fichier, "utf8"))) {
  try {
    const s = new foundry.documents.BaseScene(donnees, { strict: true });
    resultats.push({ ok: true, niveaux: s.levels.size, regions: s.regions.contents.map(r => [r.name, [...r.levels].sort(), r.behaviors.contents.map(b => b.type)]) });
  } catch (e) { resultats.push({ ok: false, message: String(e.message).split("\\n").slice(0, 8).join(" | ") }); }
}
console.log(JSON.stringify(resultats));
`;

function validerDansFoundry(scenes) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-etages-foundry-"));
  try {
    const fichier = join(dossier, "scenes.json");
    writeFileSync(fichier, JSON.stringify(scenes));
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", VALIDATEUR, FOUNDRY, fichier], { encoding: "utf8" }));
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}

// Comme scene() des mondes : identifiants des documents embarqués, auteur des dessins.
function pourCompendium(scene, nom) {
  const s = structuredClone(scene);
  let n = 0;
  for (const c of ["walls", "drawings", "lights", "sounds", "notes", "regions"]) for (const d of s[c]) d._id ??= `Doc${String(++n).padStart(13, "0")}`;
  for (const d of s.drawings) d.author = "AuteurCartes0001";
  return { _id: `Scene${nom.padStart(11, "0")}`.slice(0, 16), name: nom, ...s };
}

test("cartes à étages : validées en mode strict par les classes de Foundry v14", { skip: FOUNDRY ? false : "sources de Foundry v14 absentes (FOUNDRY_V14 = dossier contenant common/)" }, async () => {
  const { cartes } = await charger(RACINE);
  const etages = pourCompendium(cartes.planVersScene(PLAN, { taille: S, distance: 1.5 }).scene, "Etages");
  const simple = pourCompendium(cartes.planVersScene(SIMPLE, { taille: S, distance: 2 }).scene, "Simple");
  // Témoin : un niveau dont le plafond est sous le sol doit être refusé (le validateur mord).
  const fautive = structuredClone(etages);
  fautive.levels[0].elevation.top = -10;
  const [a, b, c] = validerDansFoundry([etages, simple, fautive]);
  assert.ok(a.ok, a.message);
  assert.equal(a.niveaux, 3);
  const ids = Object.fromEntries(etages.levels.map(l => [l.name, l._id]));
  assert.deepEqual(a.regions.find(r => r[0] === "Escalier"), ["Escalier", [ids.Rez, ids["Étage"]].sort(), ["changeLevel"]]);
  assert.deepEqual(a.regions.find(r => r[0] === "Échelle"), ["Échelle", [ids.Cave, ids.Rez].sort(), ["changeLevel"]]);
  assert.ok(b.ok, b.message);
  assert.equal(b.niveaux, 1);
  assert.equal(c.ok, false, "le témoin fautif devait être refusé");
  assert.match(c.message, /elevation/);
});
