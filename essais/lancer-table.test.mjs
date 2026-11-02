// lancer_table : la table se retrouve par son nom sans jamais tomber au hasard sur la mauvaise. Nom exact (casse, accents et
// apostrophes ignorés), puis début du nom, puis nom qui contient le texte ; plusieurs noms possibles : rien n'est tiré, l'IA
// reçoit la liste. Batterie par mutation sur scripts/recherche-nom.js.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
const R = await import("../scripts/recherche-nom.js");
const { OUTILS } = await import("../scripts/outils.js");

const tables = noms => noms.map(nom => ({ nom }));
function batterie(R) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  const choix = (noms, texte) => R.choisirParNom(tables(noms), texte);
  verifier("le nom exact l'emporte sur un nom qui le contient", () => {
    assert.equal(choix(["Origines de la ruche", "Origines"], "Origines").choix?.nom, "Origines");
  });
  verifier("exact : casse et accents ignorés", () => {
    assert.equal(choix(["Rencontres en forêt", "Rencontres en forêt profonde"], "RENCONTRES EN FORET").choix?.nom, "Rencontres en forêt");
  });
  verifier("exact : apostrophe typographique et espaces", () => {
    assert.equal(choix(["L’Épreuve du Warp", "L'épreuve du Warp — variantes"], "l'epreuve  du warp").choix?.nom, "L’Épreuve du Warp");
  });
  verifier("le début du nom l'emporte sur un nom qui le contient ailleurs", () => {
    assert.equal(choix(["Butin de la ruche", "Rumeurs : butin"], "butin").choix?.nom, "Butin de la ruche");
  });
  verifier("plusieurs débuts possibles : ambigu, avec la liste", () => {
    const r = choix(["Rumeurs du port", "Rumeurs de la ruche", "Visages"], "rumeurs");
    assert.equal(r.choix, null);
    assert.deepEqual(r.ambigus, ["Rumeurs du port", "Rumeurs de la ruche"]);
  });
  verifier("plusieurs contenus possibles : ambigu", () => {
    const r = choix(["Les complications urbaines", "Petites complications"], "complication");
    assert.equal(r.choix, null);
    assert.equal(r.ambigus.length, 2);
  });
  verifier("un seul nom qui contient le texte : choisi", () => assert.equal(choix(["Visages", "Rencontres du Warp"], "warp").choix?.nom, "Rencontres du Warp"));
  verifier("le même nom deux fois (monde et compendium) : le premier, sans ambiguïté", () => {
    const candidats = [{ nom: "Origines", ou: "monde" }, { nom: "origines", ou: "compendium" }];
    const r = R.choisirParNom(candidats, "Origines");
    assert.equal(r.choix?.ou, "monde");
    assert.deepEqual(r.ambigus, []);
  });
  verifier("rien ne correspond, ou texte vide", () => {
    assert.deepEqual(choix(["Visages"], "dragons"), { choix: null, ambigus: [] });
    assert.deepEqual(choix(["Visages"], "  "), { choix: null, ambigus: [] });
  });
  return echecs;
}

test("recherche par nom : exact, puis début, puis contenu ; ambiguïté rendue (la batterie passe sur le vrai code)", () => {
  assert.deepEqual(batterie(R), []);
});

const MUTATIONS = {
  "le contenu d'abord (ancien comportement)": ["const niveaux = [n => n === cible, n => n.startsWith(cible), n => n.includes(cible)];",
    "const niveaux = [n => n.includes(cible)];"],
  "pas de niveau « début du nom »": ["n => n.startsWith(cible), ", ""],
  "accents comptés": [".normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")", ""],
  "casse comptée": [".toLowerCase().replace(/\\s+/g, \" \")", ".replace(/\\s+/g, \" \")"],
  "apostrophes typographiques comptées": [".replace(/[\\u2019\\u02bc`]/g, \"'\")", ""],
  "espaces doubles comptés": [".replace(/\\s+/g, \" \").trim()", ".trim()"],
  "ambiguïté tranchée au hasard (le premier)": ["return { choix: null, ambigus: [...new Set(trouves.map(nomDe))] };", "return { choix: trouves[0], ambigus: [] };"],
  "même nom deux fois pris pour une ambiguïté": ["if (new Set(trouves.map(c => plier(nomDe(c)))).size === 1)", "if (trouves.length === 1)"],
  "texte vide accepté": ["if (!cible) return { choix: null, ambigus: [] };", ""]
};

test("mutations : la batterie attrape chaque règle cassée", async () => {
  const source = readFileSync(fileURLToPath(new URL("../scripts/recherche-nom.js", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  for (const [nom, [avant, apres]] of Object.entries(MUTATIONS)) {
    assert.ok(source.includes(avant), `mutation obsolète : ${avant}`);
    const dossier = mkdtempSync(join(tmpdir(), "lakour-recherche-"));
    try {
      writeFileSync(join(dossier, "recherche-nom.js"), source.replace(avant, apres));
      const M = await import(pathToFileURL(join(dossier, "recherche-nom.js")).href);
      assert.ok(batterie(M).length > 0, `mutation non détectée : ${nom}`);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ l'outil, avec le monde et les compendiums
function monde(nomsMonde, nomsPack) {
  const tires = [];
  const table = (nom, ou) => ({ name: nom, ou, draw: async () => { tires.push(`${nom} (${ou})`); return { roll: { total: 7 }, results: [{ name: "Un résultat" }] }; } });
  const pack = { documentName: "RollTable", getIndex: async () => nomsPack.map((name, i) => ({ name, _id: `p${i}` })),
    getDocument: async id => table(nomsPack[Number(id.slice(1))], "compendium") };
  globalThis.game = { tables: nomsMonde.map(n => table(n, "monde")), packs: [pack, { documentName: "Actor" }] };
  globalThis.CONST = { DICE_ROLL_MODES: { PUBLIC: "publicroll" } };
  globalThis.fromUuid = async () => null;
  return tires;
}
const lancer = table => OUTILS.find(o => o.nom === "lancer_table").executer({ table, raison: "Inspiration" });

test("lancer_table : nom exact préféré, compendium au besoin, ambiguïté rendue sans tirage", async () => {
  let tires = monde(["Rumeurs de la ruche (étendue)", "Visages"], ["Rumeurs de la ruche"]);
  let r = await lancer("rumeurs de la ruche");
  assert.ok(!r.erreur, r.contenu);
  assert.deepEqual(tires, ["Rumeurs de la ruche (compendium)"], "le nom exact du compendium passe avant un nom du monde qui le contient");

  tires = monde(["Origines"], ["Origines"]);
  await lancer("ORIGINES");
  assert.deepEqual(tires, ["Origines (monde)"], "même nom : la table du monde");

  tires = monde(["Rumeurs du port", "Visages"], ["Rumeurs de la ruche"]);
  r = await lancer("Rumeurs");
  assert.ok(r.erreur);
  assert.match(r.contenu, /désigne plusieurs tables : « Rumeurs du port », « Rumeurs de la ruche »/);
  assert.match(r.contenu, /Rien n'a été tiré/);
  assert.deepEqual(tires, [], "aucun tirage au hasard");

  tires = monde(["Visages"], []);
  r = await lancer("Dragons");
  assert.ok(r.erreur);
  assert.match(r.contenu, /Table introuvable : Dragons\. Tables du monde : Visages\./);
});
