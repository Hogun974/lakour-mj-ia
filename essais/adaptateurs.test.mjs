// Essais du pré-remplissage des tests demandés par le MJ IA, pour chaque système.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptateur, DIFFICULTES } from "../scripts/adaptateurs.js";

const avecSysteme = id => { globalThis.game = { system: { id } }; return adaptateur(); };
const acteurEspion = () => {
  const appels = [];
  return { appels, system: { characteristics: { ag: {} } },
    setupSkillTest: (...a) => appels.push(["skill", ...a]), setupCharacteristicTest: (...a) => appels.push(["carac", ...a]),
    rollSkill: (...a) => appels.push(["skill", ...a]), rollAbilityCheck: (...a) => appels.push(["carac", ...a]), rollSavingThrow: (...a) => appels.push(["sauv", ...a]) };
};
const REGLAGES = { difficulte: "difficile", modificateur: -10, dr: 1, avantage: 2, desavantage: 1, titre: "crocheter la serrure" };

test("Imperium Maledictum : fenêtre de compétence pré-remplie (difficulté, modificateur, DR, avantages, titre)", async () => {
  const sys = avecSysteme("impmal"), a = acteurEspion();
  await sys.lancer(a, "tech", REGLAGES);
  assert.deepEqual(a.appels[0], ["skill", { key: "tech" },
    { fields: { difficulty: "difficult", modifier: -10, SL: 1, advantage: 2, disadvantage: 1 }, appendTitle: " — crocheter la serrure" }]);
});

test("Imperium Maledictum : test de caractéristique, et « aucune » ne force pas de difficulté", async () => {
  const sys = avecSysteme("impmal"), a = acteurEspion();
  await sys.lancer(a, "ag", { difficulte: "aucune", modificateur: 0, dr: 0, avantage: 0, desavantage: 0, titre: "" });
  assert.deepEqual(a.appels[0], ["carac", "ag", { fields: {} }]);
});

test("D&D 5e : DD, avantage net et bonus de situation", async () => {
  const sys = avecSysteme("dnd5e"), a = acteurEspion();
  await sys.lancer(a, "ste", REGLAGES);
  assert.deepEqual(a.appels[0], ["skill", { target: 20, advantage: true, disadvantage: false, rolls: [{ parts: ["@situational"], data: { situational: -10 } }], skill: "ste" }]);
  await sys.lancer(a, "sauv:dex", { difficulte: "facile", desavantage: 1 });
  assert.deepEqual(a.appels[1], ["sauv", { target: 10, advantage: false, disadvantage: true, ability: "dex" }]);
});

test("chaque difficulté proposée à l'IA a une traduction dans les deux systèmes", async () => {
  for (const d of DIFFICULTES.filter(x => x !== "aucune")) {
    const a = acteurEspion(), b = acteurEspion();
    await avecSysteme("impmal").lancer(a, "tech", { difficulte: d });
    await avecSysteme("dnd5e").lancer(b, "ste", { difficulte: d });
    assert.ok(a.appels[0][2].fields.difficulty, `impmal : ${d} sans équivalent`);
    assert.ok(b.appels[0][1].target, `dnd5e : ${d} sans DD`);
  }
});

test("D&D 5e : une fiche de personnage sans classe est signalée à l'IA ; une fiche complète ou un PNJ ne le sont pas", () => {
  const sys = avecSysteme("dnd5e");
  const fiche = (type, types) => ({ name: "Rowan", type, system: { attributes: { hp: { value: 0, max: 0 }, ac: { value: 13 } }, abilities: { dex: { value: 17 } } },
    items: types.map(t => ({ type: t, name: t, system: { levels: 1 } })) });
  assert.match(sys.resumer(fiche("character", ["race", "background"])), /FICHE INCOMPLÈTE, il manque : classe .*acteur_existant/);
  assert.doesNotMatch(sys.resumer(fiche("character", ["race", "background", "class"])), /INCOMPLÈTE/);
  assert.doesNotMatch(sys.resumer(fiche("npc", [])), /INCOMPLÈTE/);
});
