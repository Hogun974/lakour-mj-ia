// Outils de campagne, identiques pour les deux systèmes : expérience, bourse, objets, secrets, chronique.
// Doublures minimales de Foundry : acteurs avec update par chemins pointés.
import { test } from "node:test";
import assert from "node:assert/strict";

const definir = (o, chemin, v) => { const k = chemin.split("."); let x = o; for (const p of k.slice(0, -1)) x = x[p] ??= {}; x[k.at(-1)] = v; };
const lireChemin = (o, chemin) => chemin.split(".").reduce((x, k) => x?.[k], o);
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { escapeHTML: t => t, getProperty: lireChemin }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
globalThis.canvas = { scene: null };
const messages = [];
globalThis.ChatMessage = { implementation: { create: async m => messages.push(m) } };
const { OUTILS } = await import("../scripts/outils.js");
const outil = nom => OUTILS.find(o => o.nom === nom);

function acteur(nom, system, items = []) {
  const a = {
    name: nom, type: "character", system, hasPlayerOwner: true, items: [],
    async update(maj) { for (const [k, v] of Object.entries(maj)) definir(a, k, v); },
    async createEmbeddedDocuments(_, liste) {
      const crees = liste.map((d, i) => ({ ...d, id: `n${a.items.length + i}` }));
      a.items.push(...crees);
      return crees;
    },
    async deleteEmbeddedDocuments(_, ids) {
      const restants = a.items.filter(i => !ids.includes(i.id));
      a.items.length = 0;
      a.items.push(...restants);
    }
  };
  for (const i of items) {
    a.items.push({
      ...i,
      async update(m) { for (const [k, v] of Object.entries(m)) definir(this, k, v); },
      async delete() { a.items.splice(a.items.indexOf(this), 1); }
    });
  }
  return a;
}

function monde(systeme, acteurs, extra = {}) {
  const utilisateurs = [{ id: "u1", name: "Camille", isGM: false, character: acteurs[0] }, { id: "mj", name: "MJ", isGM: true }];
  globalThis.game = {
    system: { id: systeme }, user: { id: "mj" }, users: utilisateurs,
    actors: Object.assign([...acteurs], { get: () => undefined, getName: n => acteurs.find(a => a.name === n) }),
    settings: { get: (m, k) => (k === "personnalites" ? [{ id: "x", nomAffiche: "Le Conteur" }] : "x") },
    ...extra
  };
}

test("donner_xp : Imperium Maledictum (XP à dépenser) et D&D 5e (niveau suivant), « tous » = les personnages joueurs", async () => {
  const lazar = acteur("Lazar Vosk", { xp: { total: 75, spent: 50 } });
  monde("impmal", [lazar]);
  const r = await outil("donner_xp").executer({ personnages: ["tous"], xp: 100, raison: "le culte démasqué" });
  assert.equal(lazar.system.xp.total, 175);
  assert.match(r.contenu, /Lazar Vosk : 175 XP \(125 à dépenser\)/);
  assert.match(messages.at(-1).content, /\+100 XP/);
  const rowan = acteur("Rowan Harlowe", { details: { xp: { value: 250, max: 300 } } });
  monde("dnd5e", [rowan]);
  assert.match((await outil("donner_xp").executer({ personnages: ["Rowan Harlowe"], xp: 60, raison: "x" })).contenu, /310 XP — peut monter de niveau/);
  assert.ok((await outil("donner_xp").executer({ personnages: ["Personne"], xp: 10, raison: "x" })).erreur);
});

test("bourse : solars en 40k, pièces en D&D 5e ; on ne paie pas plus qu'on n'a", async () => {
  const lazar = acteur("Lazar Vosk", { solars: 400 });
  monde("impmal", [lazar]);
  await outil("bourse").executer({ personnage: "Lazar Vosk", montant: -150, devise: "solars", raison: "pot-de-vin" });
  assert.equal(lazar.system.solars, 250);
  assert.match((await outil("bourse").executer({ personnage: "Lazar Vosk", montant: -999, devise: "solars", raison: "x" })).contenu, /n'a que 250 solars/);
  assert.match((await outil("bourse").executer({ personnage: "Lazar Vosk", montant: 5, devise: "gp", raison: "x" })).contenu, /Devise inconnue/);
  const rowan = acteur("Rowan Harlowe", { currency: { gp: 10, sp: 3 } });
  monde("dnd5e", [rowan]);
  await outil("bourse").executer({ personnage: "Rowan Harlowe", montant: 25, devise: "gp", raison: "prime" });
  assert.deepEqual(rowan.system.currency, { gp: 35, sp: 3 });
});

test("donner_objets : achat payé, refusé si la bourse est trop légère ; retirer_objet : quantité partielle ou tout", async () => {
  const rowan = acteur("Rowan Harlowe", { currency: { gp: 10 } }, [{ name: "Flèches", system: { quantity: 20 } }, { name: "Corde", system: {} }]);
  monde("dnd5e", [rowan], { items: { fromCompendium: d => ({ name: d.name, type: d.type, system: { quantity: 1 } }) } });
  globalThis.fromUuid = async u => (u === "Compendium.x.Item.potion" ? { documentName: "Item", pack: "x", name: "Potion de soins", type: "consumable" } : null);
  const potions = { personnage: "Rowan Harlowe", objets: [{ uuid: "Compendium.x.Item.potion", quantite: 2 }], devise: "gp" };
  assert.match((await outil("donner_objets").executer({ ...potions, prix: 50 })).contenu, /n'a que 10 gp/);
  const r = await outil("donner_objets").executer({ ...potions, prix: 8 });
  assert.match(r.contenu, /reçoit : Potion de soins pour 8 gp/);
  assert.equal(rowan.system.currency.gp, 2);
  assert.equal(rowan.items.at(-1).system.quantity, 2);
  await outil("retirer_objet").executer({ personnage: "Rowan Harlowe", objet: "flèches", quantite: 5 });
  assert.equal(rowan.items.find(i => i.name === "Flèches").system.quantity, 15);
  await outil("retirer_objet").executer({ personnage: "Rowan Harlowe", objet: "Corde", quantite: 0 });
  assert.equal(rowan.items.find(i => i.name === "Corde"), undefined);
});

test("depenser_xp : appliqué si l'XP suffit, tout annulé sinon", async () => {
  const lazar = acteur("Lazar Vosk", { xp: { total: 200 }, skills: { stealth: { advances: 2 } }, characteristics: { ag: { advances: 0 } } });
  // Coût simulé comme le système le calcule d'après les avances : 40 XP par avance ajoutée.
  Object.defineProperty(lazar.system.xp, "spent", { get: () => 40 * ((lazar.system.skills.stealth.advances - 2) + lazar.system.characteristics.ag.advances) });
  monde("impmal", [lazar]);
  const sans = { talents: [], specialisations: [] };
  const ok = await outil("depenser_xp").executer({ personnage: "Lazar Vosk", caracteristiques: [{ carac: "ag", avances: 1 }], competences: [{ competence: "stealth", avances: 2 }], ...sans });
  assert.match(ok.contenu, /reste 80 XP/);
  assert.equal(lazar.system.skills.stealth.advances, 4);
  const trop = await outil("depenser_xp").executer({ personnage: "Lazar Vosk", caracteristiques: [{ carac: "ag", avances: 3 }], competences: [], ...sans });
  assert.ok(trop.erreur);
  assert.match(trop.contenu, /il manquerait 40 XP/);
  assert.equal(lazar.system.characteristics.ag.advances, 1, "annulé");
});

test("message_prive : chuchoté au joueur et au MJ seulement ; chronique : journal visible de tous, une page par entrée", async () => {
  const lazar = acteur("Lazar Vosk", {});
  const journaux = [];
  monde("impmal", [lazar], { journal: journaux });
  await outil("message_prive").executer({ joueur: "Camille", texte: "Tu entends ton nom murmuré dans l'eau." });
  assert.deepEqual(messages.at(-1).whisper, ["u1", "mj"]);
  globalThis.JournalEntry = { implementation: { create: async d => {
    const pages = [];
    const j = { ...d, pages, getFlag: (s, k) => d.flags?.[s]?.[k],
      async createEmbeddedDocuments(_, p) { pages.push(...p); pages.size = pages.length; } };
    journaux.push(j);
    return j;
  } } };
  await outil("ecrire_chronique").executer({ titre: "Séance 1", texte: "Le marché." });
  await outil("ecrire_chronique").executer({ titre: "Séance 2", texte: "Le manufactorum." });
  assert.equal(journaux.length, 1, "un seul journal de chronique");
  assert.equal(journaux[0].ownership.default, 2, "visible des joueurs");
  assert.deepEqual(journaux[0].pages.map(p => [p.name, p.sort]), [["Séance 1", 100], ["Séance 2", 200]]);
});
