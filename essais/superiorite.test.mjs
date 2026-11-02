// Supériorité (Imperium Maledictum) : l'outil superiorite lit, fixe et ajuste la réserve par l'API du système
// (game.impmal.resources.get / set("superiority")), en 40k seulement ; demander_jet pré-coche « Utiliser la Supériorité »
// seulement là où la fenêtre de test du système montre la case (en combat, personnage joueur).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");
const superiorite = (action, valeur = 0) => OUTILS.find(o => o.nom === "superiorite").executer({ action, valeur });

function monde(valeur = 0) {
  const reserve = { valeur, ecritures: [] };
  globalThis.game = {
    system: { id: "impmal" }, modules: { get: () => undefined },
    impmal: { resources: { get: cle => (cle === "superiority" ? reserve.valeur : undefined), set: (cle, v) => { reserve.ecritures.push([cle, v]); reserve.valeur = v; } } }
  };
  return reserve;
}

test("superiorite : en 40k seulement", () => {
  const a = s => outilsDuSysteme(s).some(o => o.nom === "superiorite");
  assert.ok(a("impmal"));
  assert.ok(!a("dnd5e") && !a("lakour-loups"));
});

test("superiorite : lire, fixer, ajuster (jamais sous 0) par l'API du système", async () => {
  const reserve = monde(2);
  assert.equal((await superiorite("lire")).contenu, "Supériorité : 2.");
  assert.deepEqual(reserve.ecritures, [], "lire n'écrit rien");
  assert.match((await superiorite("ajuster", 1)).contenu, /2 → 3/);
  assert.match((await superiorite("ajuster", -5)).contenu, /3 → 0/);
  assert.match((await superiorite("fixer", 4)).contenu, /0 → 4\.$/);
  assert.match((await superiorite("fixer", 6)).contenu, /trop faciles/);
  assert.deepEqual(reserve.ecritures, [["superiority", 3], ["superiority", 0], ["superiority", 4], ["superiority", 6]]);
  globalThis.game.impmal = undefined;
  assert.ok((await superiorite("lire")).erreur);
});

test("consigne 40k : renseignements, plafond, embuscade, remise à zéro", () => {
  monde();
  const c = adaptateur().consignes;
  assert.match(c, /\+1 par renseignement confirmé/);
  assert.match(c, /plafond 3 à 4/);
  assert.match(c, /0 s'ils tombent dans une embuscade/);
  assert.match(c, /remets-la à 0 à la fin du combat/);
});

test("demander_jet (impmal) : « Utiliser la Supériorité » pré-cochée seulement en combat, pour un personnage joueur", async () => {
  monde(2);
  const ouverts = [];
  const acteur = (inCombat, hasPlayerOwner) => ({ inCombat, hasPlayerOwner, system: { characteristics: { ag: {} } },
    setupSkillTest: (_c, contexte) => ouverts.push(contexte.fields), setupCharacteristicTest: (_c, contexte) => ouverts.push(contexte.fields) });
  const sys = adaptateur();
  await sys.lancer(acteur(true, true), "stealth", { superiorite: true });
  await sys.lancer(acteur(false, true), "stealth", { superiorite: true });
  await sys.lancer(acteur(true, false), "ag", { superiorite: true });
  await sys.lancer(acteur(true, true), "stealth", { superiorite: false });
  assert.deepEqual(ouverts.map(f => f.useSuperiority ?? false), [true, false, false, false]);
  assert.ok(OUTILS.find(o => o.nom === "demander_jet").schema.properties.superiorite, "option de demander_jet");
});
