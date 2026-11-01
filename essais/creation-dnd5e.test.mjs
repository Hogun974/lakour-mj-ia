// Création D&D 5e par l'IA : choix purs (bonus d'historique, maîtrises, équipement de départ) et pilotage du gestionnaire
// d'avancements de dnd5e (doublure qui suit son protocole : crochet preAdvancementManagerRender, puis
// flow.getAutomaticApplicationValue() ; une valeur false ouvre la fenêtre).
import { test } from "node:test";
import assert from "node:assert/strict";

const { assignationsASI, choisirTraits, resoudreEquipement, ajouterAvecAvancements } = await import("../scripts/creation-dnd5e.js");

test("bonus d'historique : ceux demandés s'ils sont permis, sinon +2/+1 sur les meilleures caractéristiques permises", () => {
  const fond = { points: 3, cap: 2, locked: ["int", "wis", "cha"] };
  assert.deepEqual(assignationsASI(fond, [{ carac: "con", valeur: 2 }, { carac: "str", valeur: 1 }]), { con: 2, str: 1 });
  assert.deepEqual(assignationsASI(fond, [{ carac: "str", valeur: 1 }, { carac: "dex", valeur: 1 }, { carac: "con", valeur: 1 }]), { str: 1, dex: 1, con: 1 });
  // Refusés : caractéristique verrouillée, dépassement du plafond, total trop grand -> défaut selon les priorités.
  for (const faux of [[{ carac: "int", valeur: 2 }], [{ carac: "str", valeur: 3 }], [{ carac: "str", valeur: 2 }, { carac: "dex", valeur: 2 }]]) {
    assert.deepEqual(assignationsASI(fond, faux, ["wis", "dex", "con", "str"]), { dex: 2, con: 1 });
  }
  assert.deepEqual(assignationsASI({ points: 0, cap: 2, fixed: { str: 1 } }, []), { str: 1 }, "bonus fixe conservé");
});

test("maîtrises : préférences d'abord (clé courte ou complète), puis la première option ; une par groupe", async () => {
  const groupes = [new Set(["skills:ath", "skills:prc", "skills:ste"]), new Set(["skills:ath", "skills:prc", "skills:ste"])];
  const restants = async deja => groupes.slice(deja.size).map(choix => ({ choix: new Set([...choix].filter(k => !deja.has(k))) }));
  assert.deepEqual(await choisirTraits(restants, ["ste", "skills:prc"]), ["skills:ste", "skills:prc"]);
  assert.deepEqual(await choisirTraits(restants, ["arc"]), ["skills:ath", "skills:prc"], "préférence impossible : premières options");
});

test("équipement de départ : objets liés, pièces, choix A ou B, et catégories génériques signalées", () => {
  const entrees = [
    { _id: "ou", group: null, sort: 1, type: "OR" },
    { _id: "a", group: "ou", sort: 1, type: "AND" },
    { _id: "a1", group: "a", sort: 1, type: "linked", key: "Compendium.dnd5e.equipment24.Item.epee", count: 1 },
    { _id: "a2", group: "a", sort: 2, type: "currency", key: "gp", count: 15 },
    { _id: "b", group: "ou", sort: 2, type: "currency", key: "gp", count: 75 },
    { _id: "c", group: null, sort: 2, type: "weapon", key: "sim", count: 1 }
  ];
  assert.deepEqual(resoudreEquipement(entrees, "objets"), {
    objets: [{ uuid: "Compendium.dnd5e.equipment24.Item.epee", nombre: 1 }], pieces: { gp: 15 }, aChoisir: ["1 × weapon (sim)"]
  });
  assert.deepEqual(resoudreEquipement(entrees, "or").pieces, { gp: 75 });
});

// Doublure du gestionnaire : chaque rendu appelle le crochet puis getAutomaticApplicationValue de l'étape ; false = fenêtre.
function installerDoublure(etapes, { refuser = () => false } = {}) {
  const crochets = {};
  const journal = { appliques: [], fenetres: 0 };
  globalThis.Hooks = {
    on: (nom, f) => { (crochets[nom] ??= []).push(f); return f; },
    off: (nom, f) => { crochets[nom] = (crochets[nom] ?? []).filter(x => x !== f); },
    call: (nom, ...a) => { for (const f of crochets[nom] ?? []) f(...a); return true; },
    callAll: (nom, ...a) => { for (const f of crochets[nom] ?? []) f(...a); }
  };
  class Gestionnaire {
    static forNewItem() { const g = new Gestionnaire(); g.steps = etapes.map(e => ({ ...e, flow: e.flow && { ...e.flow, getAutomaticApplicationValue: async () => false } })); g.i = 0; return g; }
    get step() { return this.steps[this.i]; }
    async render() {
      while (this.step) {
        Hooks.call("dnd5e.preAdvancementManagerRender", this);
        const donnees = this.step.automatic ? {} : await this.step.flow.getAutomaticApplicationValue();
        if (donnees === false) { journal.fenetres++; return; }
        if (refuser(this.step, donnees)) { this.step.automatic = false; continue; }
        journal.appliques.push([this.step.flow?.advancement.constructor.typeName, donnees]);
        this.i++;
      }
      Hooks.callAll("dnd5e.advancementManagerComplete", this);
    }
  }
  globalThis.dnd5e = { applications: { advancement: { AdvancementManager: Gestionnaire } } };
  return journal;
}
const avancement = (typeName, configuration = {}, extra = {}) => ({ advancement: { constructor: { typeName }, configuration, item: { isOriginalClass: true }, ...extra }, level: 1 });

test("avancements : chaque étape reçoit les choix de l'IA, sans fenêtre", async () => {
  const journal = installerDoublure([
    { flow: avancement("Size", { sizes: new Set(["sm", "med"]) }) },
    { flow: avancement("Trait", {}, { unfulfilledChoices: async deja => ({ available: deja.size ? [] : [{ choices: { asSet: () => new Set(["skills:ath", "skills:prc"]) } }] }) }) },
    { flow: avancement("AbilityScoreImprovement", { points: 3, cap: 2, fixed: {}, locked: new Set(["int", "wis", "cha"]) }) },
    { flow: avancement("HitPoints") },
    { flow: avancement("ItemChoice", { pool: [{ uuid: "U1" }, { uuid: "U2" }], choices: { 1: { count: 1 } } }) }
  ]);
  await ajouterAvecAvancements({}, { name: "Test" }, { taille: "sm", maitrises: ["prc"], bonus: [{ carac: "con", valeur: 2 }, { carac: "str", valeur: 1 }], choix: ["U2"], caracSorts: "", priorites: [] });
  assert.equal(journal.fenetres, 0);
  assert.deepEqual(journal.appliques.map(([t, d]) => [t, d]), [
    ["Size", { size: "sm" }],
    ["Trait", { chosen: ["skills:prc"] }],
    ["AbilityScoreImprovement", { type: "asi", assignments: { con: 2, str: 1 } }],
    ["HitPoints", { 1: "max" }],
    ["ItemChoice", { selected: ["U2"], ability: undefined }]
  ]);
});

test("avancements : des choix refusés ne bouclent pas, la fenêtre de dnd5e prend le relais", async () => {
  const journal = installerDoublure([{ flow: avancement("Size", { sizes: new Set(["med"]) }) }], { refuser: () => true });
  const promesse = ajouterAvecAvancements({}, { name: "Test" }, { taille: "", maitrises: [], bonus: [], choix: [], caracSorts: "", priorites: [] }, { delai: 50 });
  await assert.rejects(promesse, /avancement non terminé/, "le MJ est prévenu si la fenêtre n'est pas terminée");
  assert.equal(journal.fenetres, 1, "un seul essai, puis la fenêtre");
});
