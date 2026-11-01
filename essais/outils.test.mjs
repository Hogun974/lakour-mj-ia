// Essais des outils du MJ IA hors de Foundry : schémas stricts (refusés par les API sinon) et calcul des
// caractéristiques de la création de personnage.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerCaracteristiques, CARACS } from "../scripts/creation-impmal.js";

// Doublures minimales des globales Foundry lues au chargement des modules (les fenêtres ApplicationV2).
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
const { OUTILS } = await import("../scripts/outils.js");

function verifierStrict(schema, chemin, erreurs) {
  if (schema.type === "object") {
    const cles = Object.keys(schema.properties ?? {});
    if (schema.additionalProperties !== false) erreurs.push(`${chemin} : additionalProperties doit valoir false`);
    const manquants = cles.filter(c => !(schema.required ?? []).includes(c));
    if (manquants.length) erreurs.push(`${chemin} : champs non requis ${manquants.join(", ")}`);
    for (const c of cles) verifierStrict(schema.properties[c], `${chemin}.${c}`, erreurs);
  }
  if (schema.type === "array") {
    if (!schema.items) erreurs.push(`${chemin} : tableau sans « items »`);
    else verifierStrict(schema.items, `${chemin}[]`, erreurs);
  }
  if (!schema.type && !schema.enum) erreurs.push(`${chemin} : pas de type`);
}

test("chaque outil a un schéma strict valide pour Anthropic et OpenAI", () => {
  const erreurs = [];
  const noms = new Set();
  for (const o of OUTILS) {
    assert.match(o.nom, /^[a-z][a-z0-9_]{2,63}$/, `nom d'outil invalide : ${o.nom}`);
    assert.ok(!noms.has(o.nom), `outil en double : ${o.nom}`);
    noms.add(o.nom);
    assert.ok(o.description?.length > 20, `${o.nom} : description trop courte`);
    verifierStrict(o.schema, o.nom, erreurs);
  }
  assert.deepEqual(erreurs, []);
  for (const attendu of ["demander_jet", "demander_des", "lancer_table", "creer_personnage", "lire_document", "creer_scene", "amener_joueurs", "pause", "ambiance_lumiere", "regler_vision", "lumiere_jeton", "gerer_lumieres", "gerer_portes", "regler_scene", "bloquer_mouvements", "passer_tour", "figurants", "retirer_jetons", "mettre_en_scene", "creer_personnage_dnd5e", "vue_3d", "modifier_scenario", "vote_groupe", "choix_secret"]) assert.ok(noms.has(attendu), `outil absent : ${attendu}`);
});

test("le vérificateur de schéma repère un champ facultatif (mutation)", () => {
  const erreurs = [];
  verifierStrict({ type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a"], additionalProperties: false }, "essai", erreurs);
  assert.ok(erreurs.some(e => /non requis b/.test(e)));
});

const tirages = { ws: 30, bs: 31, str: 25, tgh: 28, ag: 33, int: 35, per: 29, wil: 27, fel: 40 };

test("caractéristiques : +5 base origine, +5 base faction, +5 par choix", () => {
  const { caracteristiques, erreurs } = calculerCaracteristiques(tirages, { baseOrigine: "ag", baseFaction: "per", choix: ["fel", "ag"] });
  assert.deepEqual(erreurs, []);
  assert.equal(caracteristiques.ag.starting, 43);   // 33 + 5 origine + 5 choix
  assert.equal(caracteristiques.per.starting, 34);  // 29 + 5 faction
  assert.equal(caracteristiques.fel.starting, 45);  // 40 + 5 choix
  assert.equal(caracteristiques.ws.starting, 30);   // inchangé
  for (const c of CARACS) assert.deepEqual(Object.keys(caracteristiques[c]).sort(), ["advances", "modifier", "starting"]);
});

test("caractéristiques : un tirage impossible ou une clé inconnue est refusé", () => {
  assert.ok(calculerCaracteristiques({ ...tirages, str: 45 }, { baseOrigine: "ag", baseFaction: "per" }).erreurs.length);
  assert.ok(calculerCaracteristiques({ ...tirages, str: 21 }, { baseOrigine: "ag", baseFaction: "per" }).erreurs.length);
  assert.ok(calculerCaracteristiques({ ...tirages, str: 30.5 }, { baseOrigine: "ag", baseFaction: "per" }).erreurs.length);
  assert.ok(calculerCaracteristiques(tirages, { baseOrigine: "force", baseFaction: "per" }).erreurs.length);
  assert.ok(calculerCaracteristiques(tirages, { baseOrigine: "ag", baseFaction: "per", choix: ["ws", "bs", "str"] }).erreurs.length);
  const { ws, ...incomplet } = tirages;
  assert.ok(calculerCaracteristiques(incomplet, { baseOrigine: "ag", baseFaction: "per" }).erreurs.length);
});

// ---------------------------------------------------------------- Validation des arguments (schema.js)
const { validerSchema } = await import("../scripts/schema.js");
const schemaCreation = OUTILS.find(o => o.nom === "creer_personnage").schema;
const appelCorrect = {
  nom: "Vex Marr", joueur: "Jordan", acteur_existant: "",
  tirages: { ws: 30, bs: 31, str: 25, tgh: 28, ag: 33, int: 35, per: 29, wil: 27, fel: 40 },
  bonus_choisis: ["fel", "ag"],
  origine_uuid: "Compendium.lakour-40k.creation.Item.aaaaaaaaaaaaaaaa", faction_uuid: "Compendium.x.y.Item.b", role_uuid: "Compendium.x.y.Item.c",
  competences: [{ competence: "stealth", avances: 2 }], specialisations: [{ uuid: "Compendium.x.y.Item.d", avances: 1 }],
  objets: ["Compendium.x.y.Item.e"], px: 100, description: "Une ombre de la ruche."
};

test("validation : un appel creer_personnage correct passe", () => {
  assert.deepEqual(validerSchema(schemaCreation, appelCorrect), []);
});

test("validation : chaque défaut est signalé avec son chemin (mutations)", () => {
  const casser = f => { const a = structuredClone(appelCorrect); f(a); return validerSchema(schemaCreation, a).join(" | "); };
  assert.match(casser(a => { delete a.px; }), /arguments\.px : champ manquant/);
  assert.match(casser(a => { a.inconnu = 1; }), /arguments\.inconnu : champ inconnu/);
  assert.match(casser(a => { a.tirages.ws = "30"; }), /arguments\.tirages\.ws : nombre entier attendu/);
  assert.match(casser(a => { a.tirages.ws = 30.5; }), /tirages\.ws : nombre entier attendu/);
  assert.match(casser(a => { a.bonus_choisis = ["force"]; }), /bonus_choisis\[0\] : « force » n'est pas parmi/);
  assert.match(casser(a => { a.competences[0].competence = "cuisine"; }), /competences\[0\]\.competence/);
  assert.match(casser(a => { a.objets = "Compendium.x"; }), /arguments\.objets : tableau attendu/);
  assert.match(casser(a => { delete a.tirages.fel; }), /tirages\.fel : champ manquant/);
});

test("validation : chaque outil accepte ses propres arguments minimaux bien formés", () => {
  // Construit un exemple valide à partir du schéma, pour s'assurer qu'aucun schéma n'est impossible à satisfaire.
  const exemple = s => s.enum ? s.enum[0] : s.type === "object" ? Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, exemple(v)]))
    : s.type === "array" ? [exemple(s.items)] : s.type === "integer" ? 1 : s.type === "number" ? 1 : s.type === "boolean" ? true : "x";
  for (const o of OUTILS) assert.deepEqual(validerSchema(o.schema, exemple(o.schema)), [], o.nom);
});

test("création 40k : les doubles voulus (deux Stimm du rôle) restent quand la fiche les range ensuite, sinon un seul", async () => {
  const { objetsDeDepart } = await import("../scripts/creation-impmal.js");
  const role = { equipment: { structure: { type: "and", options: [{ id: "a" }, { id: "b" }] }, options: [{ id: "a", type: "item", documentId: "Stimm" }, { id: "b", type: "item", documentId: "Stimm" }] } };
  const origine = { equipment: { list: [{ uuid: "Missel" }] }, talents: { list: [] } };
  const avec = objetsDeDepart({ origine, role }, ["Missel"], { garderDoubles: true });
  const sans = objetsDeDepart({ origine, role }, ["Missel"]);
  assert.equal(new Set(sans).size, sans.length, "sans rangement : aucun doublon");
  assert.ok(avec.length >= sans.length, "avec rangement : les répétitions restent");
  assert.equal(avec.filter(u => u === "Missel").length, 2);
});
