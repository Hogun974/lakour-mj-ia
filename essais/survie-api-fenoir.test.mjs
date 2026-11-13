// Fénoir : les noms exacts. Chaque fonction de game.lakourSurvie qu'appellent les outils survie_* et l'état du jeu existe dans le
// code du système (scripts/api.mjs, et api-marche.mjs étalé dedans), et les listes recopiées par le moteur (schémas des outils)
// sont celles de sa logique (marche.mjs, moralite.mjs, porte.mjs, esprit.mjs, savoirs.mjs). Le système est lu dans le dépôt
// lakour-fenoir à côté du moteur, ou autour de lui quand le moteur est son sous-module (modules/lakour-mj-ia) ; sans lui, l'essai
// est sauté. Lecture seule, aucun réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const CANDIDATS = ["../../lakour-fenoir/systems/lakour-survie/", "../../../systems/lakour-survie/"].map(c => fileURLToPath(new URL(c, import.meta.url)));
const SYSTEME = CANDIDATS.find(c => existsSync(join(c, "scripts", "api.mjs")) && existsSync(join(c, "scripts", "api-marche.mjs")));
const SAUTER = SYSTEME ? false : "dépôt lakour-fenoir introuvable à côté du moteur";
const lire = f => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Les noms de l'objet api du système : ses clés au premier niveau (api.mjs) et celles du marché, étalées (...MARCHE.api).
function nomsDeLApi() {
  const api = readFileSync(join(SYSTEME, "scripts", "api.mjs"), "utf8").replace(/\r\n/g, "\n");
  const marche = readFileSync(join(SYSTEME, "scripts", "api-marche.mjs"), "utf8").replace(/\r\n/g, "\n");
  const bloc = (texte, debut, fin) => { const i = texte.indexOf(debut); assert.ok(i >= 0, `${debut} introuvable`); return texte.slice(i, texte.indexOf(fin, i)); };
  const objet = bloc(api, "\nexport const api = {", "\n};\n");
  assert.ok(objet.includes("...MARCHE.api"), "l'API du marché n'est plus étalée dans game.lakourSurvie");
  const cles = (texte, retrait) => [...texte.matchAll(new RegExp(`^ {${retrait}}(?:async\\s+)?(\\w+)\\s*(?::|\\()`, "gm"))].map(m => m[1]);
  return new Set([...cles(objet, 2), ...cles(bloc(marche, "\n  const api = {", "\n  };\n"), 4)]);
}
// Les fonctions que le moteur appelle : appeler("nom"), lire("nom"), lireSurvie(…, "nom"), fonctionSurvie(…, "nom"), et les deux du troc.
function nomsAppeles() {
  const outils = lire("../scripts/outils-survie.js"), logique = lire("../scripts/survie-logique.js"), adaptateurs = lire("../scripts/adaptateurs.js");
  const noms = new Set();
  for (const re of [/appeler\("(\w+)"/g, /\blire\("(\w+)"\)/g, /lireSurvie\([^,]+, "(\w+)"/g, /fonctionSurvie\([^,]+, "(\w+)"\)/g]) {
    for (const t of [outils, logique, adaptateurs]) for (const m of t.matchAll(re)) noms.add(m[1]);
  }
  assert.ok(outils.includes('appeler(troc ? "troquer" : "evaluerTroc"'), "le troc appelle troquer ou evaluerTroc");
  noms.add("troquer").add("evaluerTroc");
  return noms;
}

test("noms exacts : chaque fonction de game.lakourSurvie appelée par le moteur existe dans le système (api.mjs, api-marche.mjs)", { skip: SAUTER }, () => {
  const api = nomsDeLApi();
  const appeles = nomsAppeles();
  for (const n of ["marche", "coursDuJour", "stadesDuMarche", "evenementDeMarche", "evaluerTroc", "troquer", "ouvrirBoutique", "crediter", "rendre", "effacerDette",
    "solderCarnet", "ouvrirMarche", "fermerMarche", "accueillir", "rompreTreve", "retablirTreve", "rumeur", "dementir", "dementirPrejuge", "prejuges", "creerMarchand",
    "preparerCyclone", "apprendre", "gagnerConfiance", "dicter", "apprivoiser", "cyclone", "savoirsDuGroupe", "communaute", "acteMoral", "ajusterEsprit", "tirerEsprit",
    "entente", "chef", "parole", "voter", "decider", "porte", "frapper", "tribut", "resoudreMenace", "separer", "fusionner", "lireSigne", "genererRecrue"]) {
    assert.ok(appeles.has(n), `le moteur n'appelle pas ${n}`);
  }
  const absents = [...appeles].filter(n => !api.has(n));
  assert.deepEqual(absents, [], "fonctions appelées par le moteur, absentes de game.lakourSurvie");
  assert.ok(!appeles.has("signe") || api.has("signe"), "le signe du groupe (marché) et lireSigne (esprit) ne se confondent pas");
});

test("listes recopiées : ressources du troc, stades, portées, preuves, regards, actes moraux, voix, profils, sources, cibles de fouille", { skip: SAUTER }, async () => {
  const L = await import(pathToFileURL(join(SYSTEME, "logique", "index.mjs")).href);
  const M = await import("../scripts/survie-logique.js");
  assert.deepEqual(M.RESSOURCES_TROC, L.RESSOURCES_TROC, "RESSOURCES_TROC");
  assert.deepEqual(M.STADES_MARCHE, L.STADES_MARCHE);
  assert.deepEqual(M.PORTEES_RUMEUR, L.PORTEES_RUMEUR);
  assert.deepEqual(M.PREUVES, L.PREUVES);
  assert.deepEqual(M.REGARDS, L.REGARDS);
  assert.deepEqual(M.ACTES_MORAUX, Object.keys(L.ACTES_MORAUX));
  assert.deepEqual(M.VOIX, L.VOIX);
  assert.deepEqual(M.PROFILS_VISITEUR, L.PROFILS_VISITEUR);
  assert.deepEqual(M.SOURCES_APPRENTISSAGE, L.SOURCES_APPRENTISSAGE);
  for (const v of [-10, -6, -5, -2, -1, 0, 1, 2, 5, 6, 10]) {
    // Le moteur l'accorde à « couleur » (bleutée, bleue) ; le système garde ses clés (bleute, bleu).
    const CLES = { rouge: "rouge", "rougeâtre": "rougeatre", neutre: "neutre", "bleutée": "bleute", bleue: "bleu" };
    assert.equal(CLES[M.bandeSensMoral(v)], L.bandeSensMoral(v), `bande du sens moral ${v}`);
  }
  const api = readFileSync(join(SYSTEME, "scripts", "api.mjs"), "utf8");
  assert.match(api, /export const CIBLES_SAVOIRS = \["jardins", "livres"\]/);
  assert.deepEqual(M.CIBLES_SAVOIRS, ["jardins", "livres"]);
  // L'issue d'une menace (resoudreMenace) : assaut, ecarter, ultimatum, rejoindre.
  for (const issue of ["ultimatum", "rejoindre"]) assert.match(api, new RegExp(`if \\(action === "${issue}"\\)`), issue);
});
