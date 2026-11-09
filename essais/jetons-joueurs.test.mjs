// Jetons des personnages joueurs existants (scripts/jetons-joueurs.js) et jeton peint prioritaire dans les deux styles (contenus.js).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { utils: { getRoute: r => `/${r}` } };
const { jetonJoueur, estJetonPeint } = await import("../scripts/contenus.js");
const { remplacable, cleDuJoueur, rafraichirJetonsJoueurs, signatureJetons } = await import("../scripts/jetons-joueurs.js");

const PEINT = "modules/lakour-warcraft/assets/jetons/ia/joueurs/orc.webp";
const INDEX = {
  "index.json": { orc: PEINT, nain: "modules/lakour-warcraft/assets/jetons/joueurs/nain.svg" },
  "index-3d.json": { orc: "modules/lakour-warcraft/assets/jetons/3d/joueurs/orc.svg", nain: "modules/lakour-warcraft/assets/jetons/3d/joueurs/nain.svg" }
};
globalThis.fetch = async url => ({ json: async () => INDEX[url.split("/").pop()] ?? {} });

const monde = (systeme, modules, extra = {}) => {
  globalThis.game = {
    system: { id: systeme },
    modules: { get: id => (modules.includes(id) ? { active: true, version: "0.11.3" } : undefined) },
    packs: [], actors: [], scenes: [], ...extra
  };
  return globalThis.game;
};
const acteur = (props) => {
  const a = { id: props.id, type: "character", items: [], img: "icons/svg/mystery-man.svg", prototypeToken: { texture: { src: "icons/svg/mystery-man.svg" } }, ...props, maj: [] };
  a.update = async m => { a.maj.push(m); };
  return a;
};

test("jeton peint : il passe avant le SVG, à plat comme en relief ; sans lui, le SVG du style", async () => {
  monde("dnd5e", ["lakour-warcraft"]);
  assert.equal(await jetonJoueur("orc", "2d"), PEINT);
  assert.equal(await jetonJoueur("orc", "3d"), PEINT);
  assert.equal(await jetonJoueur("nain", "2d"), INDEX["index.json"].nain);
  assert.equal(await jetonJoueur("nain", "3d"), INDEX["index-3d.json"].nain);
  assert.ok(estJetonPeint(PEINT));
  assert.ok(!estJetonPeint(INDEX["index.json"].nain));
});

test("image remplaçable : vide, par défaut, ou jeton d'un module La Kour ; jamais une image choisie", () => {
  assert.ok(remplacable(""));
  assert.ok(remplacable("icons/svg/mystery-man.svg"));
  assert.ok(remplacable("systems/dnd5e/tokens/defaut.webp", "systems/dnd5e/tokens/defaut.webp"));
  assert.ok(remplacable("modules/lakour-warcraft/assets/jetons/joueurs/orc.svg"));
  assert.ok(remplacable("/modules/lakour-40k-en/assets/jetons/3d/role-medicae.svg"));
  assert.ok(!remplacable("worlds/la-kour-warcraft/portraits/thrall.png"));
  assert.ok(!remplacable("modules/autre-module/assets/jetons/orc.svg"));
  assert.ok(!remplacable("modules/lakour-warcraft/assets/monde/fond.jpg"));
});

test("clé d'un joueur : drapeau du peuple (variante anglaise comprise), compendium par nom, passé d'un survivant ; pas aux Veillées", async () => {
  monde("dnd5e", ["lakour-warcraft-en"]);
  const orc = acteur({ id: "a", items: [{ type: "race", name: "Orc", flags: { "lakour-warcraft": { cle: "orc" } } }] });
  assert.equal(await cleDuJoueur(orc), "orc", "drapeaux posés par le module français avant le passage en anglais");
  const pack = { documentName: "Item", metadata: { packageName: "lakour-warcraft-en" },
    getIndex: async () => [{ type: "race", name: "Dwarf", flags: { "lakour-warcraft-en": { cle: "nain" } } }] };
  monde("dnd5e", ["lakour-warcraft-en"], { packs: [pack] });
  assert.equal(await cleDuJoueur(acteur({ id: "b", items: [{ type: "race", name: "Dwarf", flags: {} }] })), "nain");
  assert.equal(await cleDuJoueur(acteur({ id: "c", items: [] })), null, "sans peuple : rien");
  assert.equal(await cleDuJoueur(acteur({ id: "d", type: "npc", items: orc.items })), null, "un PNJ n'est pas un joueur");
  monde("lakour-survie", ["lakour-fenoir"]);
  assert.equal(await cleDuJoueur(acteur({ id: "e", type: "survivant", system: { passe: "pecheur-de-saint-gilles" } })), "pecheur-de-saint-gilles");
  monde("lakour-loups", ["lakour-veillees"]);
  assert.equal(await cleDuJoueur(acteur({ id: "f", type: "character", system: { role: "loup-affame" } })), null, "rôle secret : jamais");
});

test("rafraîchir : fiche, jeton type et jetons posés reçoivent le jeton peint ; une image choisie reste", async () => {
  const thrall = acteur({ id: "t", items: [{ type: "race", name: "Orc", flags: { "lakour-warcraft": { cle: "orc" } } }],
    img: "modules/lakour-warcraft/assets/jetons/joueurs/orc.svg", prototypeToken: { texture: { src: "modules/lakour-warcraft/assets/jetons/3d/joueurs/orc.svg" } } });
  const garrosh = acteur({ id: "g", items: [{ type: "race", name: "Orc", flags: { "lakour-warcraft": { cle: "orc" } } }],
    img: "worlds/w/garrosh.png", prototypeToken: { texture: { src: "worlds/w/garrosh.png" } } });
  const poses = [];
  const scene = { tokens: [
    { id: "j1", actorId: "t", texture: { src: "modules/lakour-warcraft/assets/jetons/joueurs/orc.svg" } },
    { id: "j2", actorId: "g", texture: { src: "worlds/w/garrosh.png" } },
    { id: "j3", actorId: "x", texture: { src: "modules/lakour-warcraft/assets/jetons/joueurs/orc.svg" } }
  ], updateEmbeddedDocuments: async (type, maj) => { poses.push([type, maj]); } };
  const jeu = monde("dnd5e", ["lakour-warcraft"], { actors: [thrall, garrosh], scenes: [scene] });
  assert.equal(await rafraichirJetonsJoueurs({ style: "3d", jeu }), 1);
  assert.deepEqual(thrall.maj, [{ img: PEINT, "prototypeToken.texture.src": PEINT }]);
  assert.deepEqual(garrosh.maj, []);
  assert.deepEqual(poses, [["Token", [{ _id: "j1", "texture.src": PEINT }]]]);
  thrall.img = PEINT; thrall.prototypeToken.texture.src = PEINT; scene.tokens[0].texture.src = PEINT;
  assert.equal(await rafraichirJetonsJoueurs({ style: "2d", jeu }), 0, "déjà à jour : rien n'est réécrit");
  assert.equal(signatureJetons(jeu), "lakour-warcraft@0.11.3");
  assert.equal(await rafraichirJetonsJoueurs({ jeu: monde("lakour-loups", ["lakour-veillees"], { actors: [thrall] }) }), 0);
});
