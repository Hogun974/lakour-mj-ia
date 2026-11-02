// Warcraft (D&D 5e) : le tableau des contrats (lancer_table tire N résultats sans doublon, écarte ceux déjà pris, rend à l'IA
// po et réputation de chaque contrat), la réputation qui avance après un contrat (horloge rep-<faction>, trouvée aussi par le nom
// de la faction), et les actions légendaires et de repaire lues sur la fiche dnd5e. Batterie par mutation sur scripts/tirages.js.
// Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const chat = [];
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
globalThis.ChatMessage = { implementation: { create: async d => { chat.push(d); return d; } } };
globalThis.CONST = { DICE_ROLL_MODES: { PUBLIC: "publicroll" } };
globalThis.fromUuid = async () => null;
const T = await import("../scripts/tirages.js");
const { OUTILS } = await import("../scripts/outils.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");
const HL = await import("../scripts/horloges-logique.js");

// ------------------------------------------------------------------ logique pure (tirages.js)
// Une table qui rend, tirage après tirage, les résultats de la suite donnée (identifiants « r<n> »).
const suite = noms => { let i = 0; return async () => ({ total: i + 1, resultats: [{ id: `r${noms[i % noms.length]}`, nom: `Contrat ${noms[i++ % noms.length]}` }] }); };
async function batterie(T) {
  const echecs = [];
  const verifier = async (nom, fn) => { try { await fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  await verifier("trois résultats différents, doublons relancés", async () => {
    const r = await T.tirerSansDoublon(suite([1, 1, 2, 1, 3, 4]), 3);
    assert.deepEqual(r.map(x => x.r.id), ["r1", "r2", "r3"]);
  });
  await verifier("les exclus ne sortent jamais (casse, accents, morceau de nom)", async () => {
    const r = await T.tirerSansDoublon(suite([1, 2, 3, 4]), 2, { exclus: ["CONTRAT 1", "contrat 3"] });
    assert.deepEqual(r.map(x => x.r.id), ["r2", "r4"]);
    assert.ok(T.estExclu("Traque — La bouche de fer des marais", ["la bouche de fer"]));
    assert.ok(T.estExclu("Récolte — Sel blanc", ["recolte — sel BLANC"]));
    assert.ok(!T.estExclu("Escorte — Le cartographe", ["", "  "]));
  });
  await verifier("une table trop petite rend ce qu'elle a, sans boucler", async () => {
    let appels = 0;
    const tirer = async () => { appels++; return { total: 1, resultats: [{ id: "seul", nom: "Seul" }] }; };
    const r = await T.tirerSansDoublon(tirer, 3);
    assert.equal(r.length, 1);
    assert.ok(appels <= 3 * T.ESSAIS_PAR_RESULTAT, `${appels} tirages`);
  });
  await verifier("nombre borné (1 à 10)", async () => {
    assert.equal((await T.tirerSansDoublon(suite(Array.from({ length: 20 }, (_, i) => i)), 50)).length, T.TIRAGES_MAX);
    assert.equal((await T.tirerSansDoublon(suite([1, 2]), 0)).length, 1);
  });
  await verifier("un tirage de plusieurs résultats n'en garde pas plus que voulu", async () => {
    const tirer = async () => ({ total: 1, resultats: [{ id: "a", nom: "A" }, { id: "b", nom: "B" }, { id: "c", nom: "C" }] });
    assert.equal((await T.tirerSansDoublon(tirer, 2)).length, 2);
  });
  await verifier("un contrat en clair : po, réputation, horloge", () => {
    assert.equal(T.donneesDuResultat({ contrat: { type: "traque", po: 60, faction: "horde", reputation: 4 } }),
      "contrat (traque) : 60 po, +4 de réputation auprès de horde (horloge rep-horde)");
    assert.equal(T.donneesDuResultat(undefined), "");
    assert.equal(T.donneesDuResultat({}), "");
    assert.match(T.donneesDuResultat({ rare: { cle: "gueule" } }), /^données : \{"rare":\{"cle":"gueule"\}\}$/);
  });
  return echecs;
}

test("tirages : sans doublon, exclus écartés, borné ; données d'un contrat (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await batterie(T), []);
});

const MUTATIONS = {
  "doublons gardés": ["vus.has(cle) || ", ""],
  "exclus ignorés": [" || estExclu(nomDe(r), exclus)", ""],
  "exclusion au nom exact seulement": ["n === e || n.includes(e)", "n === e"],
  "un exclu vide écarte tout": [".map(plier).filter(Boolean)", ".map(plier)"],
  "boucle sans fin sur une petite table": ["i < voulus * essais", "i < 1000"],
  "nombre non borné": ["Math.min(TIRAGES_MAX, Math.round(Number(n) || 1))", "Math.round(Number(n) || 1)"],
  "trop de résultats d'un seul tirage": ["if (sortie.length >= voulus || ", "if ("],
  "réputation sans son horloge": [" (horloge rep-${contrat.faction})", ""],
  "po perdues": ["${Number(contrat.po) || 0} po", "${Number(contrat.reputation) || 0} po"]
};

test("mutations (tirages) : la batterie attrape chaque règle cassée", async () => {
  const racine = fileURLToPath(new URL("../scripts/", import.meta.url));
  const source = readFileSync(join(racine, "tirages.js"), "utf8").replace(/\r\n/g, "\n");
  for (const [nom, [avant, apres]] of Object.entries(MUTATIONS)) {
    assert.ok(source.includes(avant), `mutation obsolète : ${avant}`);
    const dossier = mkdtempSync(join(tmpdir(), "lakour-tirages-"));
    try {
      copyFileSync(join(racine, "recherche-nom.js"), join(dossier, "recherche-nom.js"));
      writeFileSync(join(dossier, "tirages.js"), source.replace(avant, apres));
      const M = await import(pathToFileURL(join(dossier, "tirages.js")).href);
      assert.ok((await batterie(M)).length > 0, `mutation non détectée : ${nom}`);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ lancer_table sur le tableau des contrats (Warcraft)
function monde({ warcraft = true } = {}) {
  chat.length = 0;
  const contrats = [
    ["Traque — La bête aux yeux verts", { type: "traque", po: 60, faction: "horde", reputation: 4 }],
    ["Récolte — Lichen de sang", { type: "recolte", po: 30, faction: "cercle-cenarien", reputation: 2 }],
    ["Escorte — La caravane de sel", { type: "escorte", po: 60, faction: "horde", reputation: 3 }],
    ["Avis de recherche — Le déserteur", { type: "avis", po: 70, faction: "kor-kron", reputation: 4 }]
  ].map(([name, contrat], i) => ({ id: `c${i}`, name, flags: { "lakour-warcraft": { contrat } } }));
  const ordre = [0, 0, 1, 3, 2, 1, 0, 2, 3];
  let i = 0;
  const tirages = [];
  const table = {
    name: "Contrats — Le Carrefour",
    draw: async options => { tirages.push(options); const r = contrats[ordre[i++ % ordre.length]]; return { roll: { total: i }, results: [r] }; }
  };
  globalThis.game = {
    tables: [table], packs: [], system: { id: "dnd5e" },
    modules: { get: id => (id === "lakour-warcraft" && warcraft ? { active: true } : undefined) },
    settings: { get: (_m, k) => (k === "personnalites" ? [{ id: "p", nomAffiche: "Le Conteur" }] : "p") }
  };
  return tirages;
}
const lancer = args => OUTILS.find(o => o.nom === "lancer_table").executer({ table: "Contrats — Le Carrefour", raison: "Contrats du jour", nombre: 0, exclure: [], ...args });

test("lancer_table : trois contrats différents, ceux déjà pris écartés, po et réputation rendues à l'IA, une carte au chat", async () => {
  let tirages = monde();
  let r = await lancer({ nombre: 3, exclure: ["Lichen de sang"] });
  assert.ok(!r.erreur, r.contenu);
  const lignes = r.contenu.split("\n").slice(1);
  assert.equal(lignes.length, 3);
  assert.match(lignes[0], /La bête aux yeux verts \[contrat \(traque\) : 60 po, \+4 de réputation auprès de horde \(horloge rep-horde\)\]/);
  assert.match(lignes[1], /Le déserteur/);
  assert.match(lignes[2], /La caravane de sel/);
  assert.doesNotMatch(r.contenu, /Lichen/, "contrat déjà pris : écarté");
  assert.ok(tirages.every(o => o.displayChat === false), "tirages muets");
  assert.equal(chat.length, 1, "une seule carte");
  assert.equal((chat[0].content.match(/<li>/g) ?? []).length, 3);
  assert.doesNotMatch(chat[0].content, /po|réputation/, "la carte montre les affiches, pas les données");
  // Un seul tirage : celui de Foundry, affiché ; les données sont rendues aussi.
  tirages = monde();
  r = await lancer({});
  assert.equal(tirages[0].displayChat, true);
  assert.match(r.contenu, /\[contrat \(traque\) : 60 po/);
  assert.equal(chat.length, 0);
  // Sans module de contenu actif : pas de données.
  monde({ warcraft: false });
  assert.doesNotMatch((await lancer({})).contenu, /contrat \(/);
});

// ------------------------------------------------------------------ réputation après un contrat
test("horloge : la réputation d'une faction se retrouve par son nom ou son identifiant rep-<faction>", () => {
  const liste = [
    HL.normaliser({ id: "rep-horde", nom: "Horde (Le Carrefour)", type: "reputation", faction: "horde" }),
    HL.normaliser({ id: "rep-kirin-tor", nom: "Kirin Tor", type: "reputation", faction: "kirin-tor" }),
    HL.normaliser({ id: "horde-rituel", nom: "Rituel", type: "horloge" })
  ];
  assert.equal(HL.trouver(liste, "rep-horde")?.id, "rep-horde");
  assert.equal(HL.trouver(liste, "horde")?.id, "rep-horde");
  assert.equal(HL.trouver(liste, "Kirin Tor")?.id, "rep-kirin-tor");
  assert.equal(HL.trouver(liste, "cercle-cenarien"), null);
  const r = HL.avancer(HL.trouver(liste, "horde"), 4);
  assert.equal(r.element.valeur, 4);
  assert.match(OUTILS.find(o => o.nom === "horloge").description, /nom rep-<faction>/);
});

test("consigne Warcraft : trois contrats par jour, po et réputation à la remise ; légendaires et repaire en combat", () => {
  globalThis.game = { system: { id: "dnd5e" }, modules: { get: () => undefined } };
  const c = adaptateur().consignes;
  assert.match(c, /paie les po \(bourse\) et avance la réputation indiquée \(rep-<faction>\)/);
  assert.match(c, /lancer_table, nombre 3/);
  assert.match(c, /actions légendaires restantes/);
});

test("fiche dnd5e : actions légendaires restantes, repaire au compte d'initiative (20 par défaut)", () => {
  globalThis.game = { system: { id: "dnd5e" }, modules: { get: () => undefined } };
  globalThis.CONFIG = { DND5E: {} };
  const fiche = resources => adaptateur().tour.combattant({ type: "npc", items: [], system: { attributes: { hp: { value: 50, max: 50 }, ac: { value: 15 } }, resources } });
  assert.deepEqual(fiche({ legact: { value: 2, max: 3 }, lair: { value: false, initiative: null } }).legendaires, { reste: 2, max: 3 });
  assert.equal(fiche({ legact: { value: 2, max: 3 }, lair: { value: false, initiative: null } }).repaire, null);
  assert.equal(fiche({ legact: { max: 0 }, lair: { value: true, initiative: null } }).repaire, 20);
  assert.equal(fiche({ legact: { max: 0 }, lair: { value: false, initiative: 15 } }).repaire, 15);
});
