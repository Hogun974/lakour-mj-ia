// Fénoir : les noms exacts. Chaque fonction de game.lakourSurvie qu'appellent les outils survie_* et l'état du jeu existe dans le
// code du système (scripts/api.mjs, et les fabriques de scripts/api-*.mjs étalées dedans : marché, sens, gestion, plans, repères,
// corps, ateliers, fouilles, ouvrages, vivant, paradis), et les listes recopiées par le moteur (schémas des outils) sont celles de
// sa logique (marche.mjs, moralite.mjs, porte.mjs, esprit.mjs, savoirs.mjs, generation.mjs, fouilles.mjs, corps.mjs). Le système est
// lu dans le dépôt lakour-fenoir à côté du moteur, ou autour de lui quand le moteur est son sous-module (modules/lakour-mj-ia) ; sans
// lui, l'essai est sauté. Lecture seule, aucun réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const CANDIDATS = ["../../lakour-fenoir/systems/lakour-survie/", "../../../systems/lakour-survie/"].map(c => fileURLToPath(new URL(c, import.meta.url)));
const SYSTEME = CANDIDATS.find(c => existsSync(join(c, "scripts", "api.mjs")) && existsSync(join(c, "scripts", "api-marche.mjs")));
const SAUTER = SYSTEME ? false : "dépôt lakour-fenoir introuvable à côté du moteur";
const lire = f => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NL = "\n";

// Saute une chaîne, un gabarit ou un commentaire de ligne qui commence en k : l'indice de son dernier caractère, ou k.
function sauter(texte, k) {
  const c = texte[k];
  if (c === "/" && texte[k + 1] === "/") { const f = texte.indexOf(NL, k); return f < 0 ? texte.length : f; }
  if (c === "\"" || c === "'" || c === "`") {
    let j = k + 1;
    for (; j < texte.length && texte[j] !== c; j++) if (texte[j] === "\\") j++;
    return j;
  }
  return k;
}
// Le contenu d'un bloc { … } dont l'accolade ouvrante est à l'indice i.
function bloc(texte, i) {
  let p = 0;
  for (let k = i; k < texte.length; k++) {
    const s = sauter(texte, k);
    if (s !== k) { k = s; continue; }
    const c = texte[k];
    if ("{([".includes(c)) p++;
    else if ("})]".includes(c) && --p === 0) return texte.slice(i + 1, k);
  }
  throw new Error("bloc non fermé");
}
// Les entrées d'un objet littéral (son contenu) : { nom, valeur } (« nom: … », « nom(…) {…} », « nom » raccourci) ou { etale } (« ...X »).
function cles(contenu) {
  const entrees = [];
  let p = 0, debut = 0;
  for (let k = 0; k < contenu.length; k++) {
    const s = sauter(contenu, k);
    if (s !== k) { k = s; continue; }
    const c = contenu[k];
    if ("{([".includes(c)) p++;
    else if ("})]".includes(c)) p--;
    else if (c === "," && p === 0) { entrees.push(contenu.slice(debut, k)); debut = k + 1; }
  }
  entrees.push(contenu.slice(debut));
  const sansCommentaires = e => e.split(NL).filter(l => !l.trim().startsWith("//")).join(NL).trim();
  return entrees.map(sansCommentaires).filter(Boolean)
    .map(e => (e.startsWith("...") ? { etale: e.slice(3).trim() } : { nom: /^(?:async\s+)?(\w+)/.exec(e)?.[1], valeur: e }));
}
// Les noms de l'objet api du système (scripts/api.mjs) : ses clés, et celles des fabriques étalées dedans (...MARCHE.api, ...SENS, …),
// lues dans scripts/api-*.mjs : « const X = fonctionsY(…) », puis l'objet rendu par fonctionsY (ou son membre .api, .publiques).
function nomsDeLApi() {
  const lireS = f => readFileSync(join(SYSTEME, "scripts", f), "utf8").replace(/\r\n/g, NL);
  const api = lireS("api.mjs");
  const i = api.indexOf(`${NL}export const api = {`);
  assert.ok(i >= 0, "export const api introuvable");
  const fichiers = readdirSync(join(SYSTEME, "scripts")).filter(f => /^api-.*\.mjs$/.test(f));
  const noms = new Set();
  for (const e of cles(bloc(api, api.indexOf("{", i)))) {
    if (e.nom) { noms.add(e.nom); continue; }
    const [variable, membre] = e.etale.split(".");
    const fabrique = new RegExp(`const ${variable} = (\\w+)\\(`).exec(api)?.[1];
    assert.ok(fabrique, `fabrique de ${variable} introuvable`);
    const fichier = fichiers.find(f => lireS(f).includes(`export function ${fabrique}(`));
    assert.ok(fichier, `${fabrique} introuvable dans scripts/api-*.mjs`);
    const texte = lireS(fichier);
    const corps = texte.slice(texte.indexOf(`export function ${fabrique}(`));
    const retour = corps.lastIndexOf(`${NL}  return {`);
    let objet = cles(bloc(corps, corps.indexOf("{", retour + 3)));
    if (membre) {
      const m = objet.find(x => x.nom === membre);
      assert.ok(m, `${fichier} : ${membre} absent de ce que rend ${fabrique}`);
      const v = m.valeur.includes(":") ? m.valeur.slice(m.valeur.indexOf(":") + 1).trim() : membre;
      // Le membre est un objet écrit sur place, ou une constante de la fabrique (« const api = { … } »).
      objet = v.startsWith("{") ? cles(bloc(v, 0)) : cles(bloc(corps, corps.indexOf("{", corps.indexOf(`const ${v} = {`))));
    }
    for (const x of objet) if (x.nom) noms.add(x.nom);
  }
  return noms;
}
// Les fonctions que le moteur appelle : appeler("nom"), lire("nom"), lire1("nom", …), lireSurvie(…, "nom"), fonctionSurvie(…, "nom"),
// les deux du troc, et les deux branches d'un appeler(… ? "a" : "b").
function nomsAppeles() {
  const outils = lire("../scripts/outils-survie.js"), logique = lire("../scripts/survie-logique.js"), adaptateurs = lire("../scripts/adaptateurs.js"),
    histoire = lire("../scripts/outils-histoire.js");
  const noms = new Set();
  for (const re of [/appeler\("(\w+)"/g, /\blire1?\("(\w+)"/g, /lireSurvie\([^,]+, "(\w+)"/g, /fonctionSurvie\([^,]+, "(\w+)"\)/g]) {
    for (const t of [outils, logique, adaptateurs, histoire]) for (const m of t.matchAll(re)) noms.add(m[1]);
  }
  assert.ok(outils.includes('appeler(troc ? "troquer" : "evaluerTroc"'), "le troc appelle troquer ou evaluerTroc");
  for (const m of outils.matchAll(/appeler\(\w+(?: === "\w+")? \? "(\w+)" : "(\w+)"/g)) noms.add(m[1]).add(m[2]);
  return noms;
}

test("noms exacts : chaque fonction de game.lakourSurvie appelée par le moteur existe dans le système (api.mjs, api-marche.mjs)", { skip: SAUTER }, () => {
  const api = nomsDeLApi();
  const appeles = nomsAppeles();
  for (const n of ["marche", "coursDuJour", "stadesDuMarche", "evenementDeMarche", "evaluerTroc", "troquer", "ouvrirBoutique", "crediter", "rendre", "effacerDette",
    "solderCarnet", "ouvrirMarche", "fermerMarche", "accueillir", "rompreTreve", "retablirTreve", "rumeur", "dementir", "dementirPrejuge", "prejuges", "creerMarchand",
    "preparerCyclone", "apprendre", "gagnerConfiance", "dicter", "apprivoiser", "cyclone", "savoirsDuGroupe", "communaute", "acteMoral", "ajusterEsprit", "tirerEsprit",
    "entente", "chef", "parole", "voter", "decider", "porte", "frapper", "tribut", "resoudreMenace", "separer", "fusionner", "lireSigne", "genererRecrue",
    // Les douze lots du jeu 3D (§16 à §29).
    "histoireDuSurvivant", "affaires", "tirerAffaire", "penteAffaire", "issueAffaire", "sens", "approche", "noir", "nettoyer", "jouer", "corps", "symptomes",
    "bivouac", "dormir", "soignerMorsure", "chute", "menage", "parer", "grisConnu", "reperes", "compte", "donnerDate", "lireLaLune", "donnerRepere",
    "copierCarte", "lireJournal", "plans", "valeurPlan", "lieuxAPlans", "lieuAPlans", "lirePlan", "copierPlan", "enseignerPlan", "rangerPlan",
    "prendrePlan", "perdreEtagere", "donnerPlan", "recevoirPlan", "noterPlan", "reprendrePlans", "tableDeGestion", "priorites", "quota", "corvee",
    "second", "admettre", "passage", "convertir", "tenirEtal", "releverEtal", "valeurObjet", "outils", "userOutil", "reparerOutil", "lieux",
    "gisements", "demonter", "ouvrages", "entretenir", "incendie", "cheptels", "flairDuChien", "beteSauvage", "peupler", "mettreEnEnclos",
    "abattre", "soignerCheptel", "curer", "capturer", "chasser", "recevoirBete", "lacherBetes", "paradis", "ile", "ronde", "traiterCorps",
    "leurre", "chaleur", "sousTerre", "rallumer", "chantierRegion"]) {
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
  // Les lots du jeu 3D : les tâches (la ronde comprise), les cibles d'un lieu, la cible « plans », les traits d'un bivouac.
  assert.deepEqual(M.TACHES, Object.keys(L.TACHES), "TACHES");
  assert.deepEqual(M.CIBLES_LIEUX, L.CIBLES_FOUILLES, "CIBLES_LIEUX");
  assert.match(api, /export const CIBLE_PLANS = "plans"/);
  for (const c of M.CRITERES_BIVOUAC) {
    assert.ok(L.jugerBivouac({ pente: c.replace("pente-", ""), couvert: c !== "a-decouvert", [c]: true }).raisons.includes(c), `bivouac : ${c}`);
  }
  assert.deepEqual(M.CIBLES_SAVOIRS, ["jardins", "livres"]);
  // L'issue d'une menace (resoudreMenace) : assaut, ecarter, ultimatum, rejoindre.
  for (const issue of ["ultimatum", "rejoindre"]) assert.match(api, new RegExp(`if \\(action === "${issue}"\\)`), issue);
});
