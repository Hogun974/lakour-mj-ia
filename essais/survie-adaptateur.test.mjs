// Fénoir (système lakour-survie) : l'adaptateur du MJ IA. Conversion des difficultés communes vers celles du système (succès
// requis et dés en plus), avantages et désavantages en dés, test par l'API du système (demander_jet, jet_compagnon), résumé
// d'un survivant (compétences, état, INFECTION, savoirs, compagnon, mort ou Livide), consignes du narrateur, pas de tour par tour.
// Doublure de game.lakourSurvie (essais/doublures/foundry-survie.mjs), aucun réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installerFenoir, MARQUEURS_SECRETS } from "./doublures/foundry-survie.mjs";

installerFenoir();
const { adaptateur, adaptateurDe, DIFFICULTES } = await import("../scripts/adaptateurs.js");
const L = await import("../scripts/survie-logique.js");

test("conversion des difficultés (§7 du contrat) : facile +1 dé, routinière et exigeante normales, difficile, ardue et très ardue extrêmes", () => {
  const attendu = {
    aucune: ["normale", 0], "tres-facile": ["normale", 2], facile: ["normale", 1], routiniere: ["normale", 0], exigeante: ["normale", 0],
    difficile: ["difficile", 0], ardue: ["extreme", 0], "tres-ardue": ["extreme", 0]
  };
  for (const d of DIFFICULTES) assert.deepEqual(Object.values(L.convertirDifficulte(d)), attendu[d], d);
  for (const d of ["normale", "difficile", "extreme"]) assert.equal(L.convertirDifficulte(d).difficulte, d, "noms du système acceptés");
  assert.deepEqual(L.convertirDifficulte("n'importe quoi"), { difficulte: "normale", bonus: 0 });
});

test("réglages d'un test : avantages et modificateur en dés de bonus, désavantages et modificateur négatif en malus, bornés", () => {
  assert.deepEqual(L.reglagesVersTest({ difficulte: "facile", avantage: 2, desavantage: 1, modificateur: 1 }), { difficulte: "normale", bonus: 4, malus: 1 });
  assert.deepEqual(L.reglagesVersTest({ difficulte: "ardue", modificateur: -10 }), { difficulte: "extreme", bonus: 0, malus: 2 }, "-10 (échelle 40k) ramené à -2 dés");
  assert.deepEqual(L.reglagesVersTest({ difficulte: "difficile", avantage: 9, desavantage: 9 }), { difficulte: "difficile", bonus: 3, malus: 3 });
  assert.deepEqual(L.reglagesVersTest({}), { difficulte: "normale", bonus: 0, malus: 0 });
});

test("lancer (demander_jet) : le test du système, difficulté convertie, titre, compte ; lancerDirect rend { total: succès, reussite, marge, texte }", async () => {
  const { api } = installerFenoir();
  const sys = adaptateur();
  assert.equal(sys.id, "lakour-survie");
  await sys.lancer(game.actors.get("s1"), "soins", { difficulte: "tres-ardue", avantage: 1, desavantage: 0, modificateur: 0, titre: "laver la morsure" });
  assert.deepEqual(api.appels.at(-1), ["test", { acteurId: "s1", competence: "soins", difficulte: "extreme", bonus: 1, malus: 0, forcer: false,
    titre: "laver la morsure", compte: true }]);
  const r = await sys.lancerDirect(game.actors.get("s2"), "bricolage", { difficulte: "facile", titre: "" });
  assert.deepEqual(api.appels.at(-1)[1], { acteurId: "s2", competence: "bricolage", difficulte: "normale", bonus: 1, malus: 0, forcer: false, titre: "Bricolage", compte: true });
  assert.equal(r.total, 2);
  assert.equal(r.reussite, true);
  assert.equal(r.marge, 1);
  assert.match(r.texte, /^Eddy Payet, Bricolage \(normale\) : 2 succès pour 1 requis — réussite \(marge \+1\)/);
  await assert.rejects(sys.lancer(game.actors.get("s1"), "athletics", {}), /Compétence inconnue : athletics/);
});

test("lancer : système absent ou fonction absente -> erreur claire", async () => {
  installerFenoir({ avecApi: false });
  await assert.rejects(adaptateur().lancer(game.actors.get("s1"), "soins", {}), /lakour-survie n'est pas chargé/);
  installerFenoir();
  delete game.lakourSurvie.test;
  await assert.rejects(adaptateur().lancer(game.actors.get("s1"), "soins", {}), /ne fournit pas game\.lakourSurvie\.test\(\)/);
});

test("compétences : les dix du contrat, libellés français ; pas d'expérience, pas de devises, notes publiques, PNJ « survivant »", () => {
  installerFenoir();
  const sys = adaptateurDe("lakour-survie");
  assert.deepEqual(sys.competences().map(c => c.cle), ["endurance", "combat", "tir", "discretion", "vigilance", "bricolage", "survie", "soins", "parole", "conduite"]);
  assert.equal(sys.competences().find(c => c.cle === "discretion").libelle, "Discrétion");
  assert.equal(sys.typePnj, "survivant");
  assert.equal(sys.cheminNotesMJ, "system.notes");
  assert.deepEqual(sys.devises, []);
  assert.equal(sys.xp({}).total, 0);
  assert.equal(sys.cheminXp, null);
  assert.equal(sys.tour, undefined, "pas de tour par tour : combats par les règles simples du §1.7");
});

test("consignes du narrateur : temps (survie_avancer), secret daté, deux voies, tests mesurés, morsure, plans, créole, île", () => {
  const c = adaptateurDe("lakour-survie").consignes;
  for (const motif of [/survie_avancer/, /\[secret MJ\]/, /Ne révèle jamais/, /laisse pas deviner/, /repartir/, /s'enraciner/, /demander_jet/, /survie_test/,
    /MORSURE/, /soins extrême/, /plans/, /[Cc]réole/, /lagon|cirques/, /enjeu le justifie/, /survie_assaut/]) {
    assert.match(c, motif);
  }
});

test("résumé d'un survivant : passé du contenu, compétences non nulles, état, INFECTION, savoirs, équipement ; compagnon ; mort ; Livide", () => {
  installerFenoir();
  const sys = adaptateur();
  const lucie = sys.resumer(game.actors.get("s1"));
  for (const morceau of ["Lucie Hoarau (survivant, 34 ans)", "passé : Infirmière", "soins 3 (1 marque)", "survie 1", "blessures 1/4 (égratigné)",
    "fatigue 2/5", "moral 4/5", "INFECTÉ : stade 2/6 depuis le quart 10", "savoirs : Premiers secours avancés", "équipement : Trousse de secours"]) {
    assert.ok(lucie.includes(morceau), `${morceau} absent de : ${lucie}`);
  }
  assert.ok(!/tir 0/.test(lucie), "une compétence à 0 est tue");
  const eddy = sys.resumer(game.actors.get("s2"));
  assert.match(eddy, /Eddy Payet \[compagnon IA\]/);
  assert.match(eddy, /passé : mecanicien/, "clé inconnue du contenu : telle quelle");
  assert.doesNotMatch(eddy, /INFECTÉ/);
  game.actors.get("s2").system.vivant = false;
  assert.match(sys.resumer(game.actors.get("s2")), /— MORT$/);
  game.actors.get("s2").system.livide = true;
  assert.match(sys.resumer(game.actors.get("s2")), /LIVIDE/);
  for (const m of MARQUEURS_SECRETS) assert.ok(!lucie.includes(m) && !eddy.includes(m), `le résumé ne lit jamais le monde (${m})`);
});

test("texte d'un test : échec forcé avec complication et marque", () => {
  assert.equal(L.texteTest("Lucie", "soins", { succes: 1, requis: 3, reussite: false, marge: -2, force: true, complication: true, marque: true, difficulte: "extreme" }),
    "Lucie, Soins (extreme) : 1 succès pour 3 requis — échec (marge -2), forcé ; COMPLICATION (choisis-en une : bruit, outil cassé, blessure légère, temps perdu) ; une marque gagnée.");
  // monte (api.test) : la marque a fait monter la compétence ; le narrateur le dit.
  assert.match(L.texteTest("Lucie", "soins", { succes: 0, requis: 1, reussite: false, marge: -1, marque: true, monte: true }), /une marque gagnée ; la compétence MONTE d'un niveau/);
});

test("renseignement : une nouvelle par radio ne rajeunit pas le pillage ni les routes (vuDirect, ou vu d'une source « vu »)", async () => {
  const { ligneRenseignement, ageDirect } = await import("../scripts/survie-logique.js");
  const r = { vu: 20, vuDirect: 8, source: "radio", infestation: "dense", pillage: "entamé", routes: { cilaos: "coupée" } };
  assert.equal(ageDirect(r, 22), 14);
  const ligne = ligneRenseignement("Le Port", r, 22);
  assert.match(ligne, /par radio, il y a 2 j/);
  assert.match(ligne, /pillage entamé \(vu il y a 14 j\)/);
  assert.match(ligne, /routes : cilaos coupée \(vu il y a 14 j\)/);
  // Vu de ses yeux : pas de seconde date ; ancien renseignement sans vuDirect, daté par son vu.
  assert.doesNotMatch(ligneRenseignement("Le Port", { vu: 20, source: "vu", pillage: "vidé" }, 22), /\(vu il y a/);
  assert.equal(ageDirect({ vu: 5, source: "vu" }, 9), 4);
  assert.equal(ageDirect({ vu: 5, source: "rumeur" }, 9), null);
});
