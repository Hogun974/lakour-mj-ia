// Fénoir (système lakour-survie), les douze lots portés du jeu 3D (contrat §16 à §29 du dépôt lakour-fenoir, branche vague3) : les
// outils nouveaux (survie_affaire, survie_sens, survie_corps, survie_reperes, survie_plans, survie_vivant, survie_paradis) et ceux
// qu'ils étendent (survie_avancer, survie_test, survie_fouiller, survie_blessure, survie_construire, survie_assaut, survie_fabriquer,
// survie_assigner, survie_communaute, survie_carnet, survie_marche_forain, survie_marche, survie_troquer, survie_voyager,
// histoire_personnage). Pour chacun : son schéma strict, les arguments passés à l'API du système, le refus hors du MJ actif et hors d'un
// monde lakour-survie, ce qui va au connu et ce qui reste au secret. Doublure de game.lakourSurvie (essais/doublures/foundry-survie.mjs,
// monde « troisD »), aucun réseau, aucune IA.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installerFenoir, MARQUEURS_SECRETS } from "./doublures/foundry-survie.mjs";

installerFenoir({ troisD: true });
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { validerSchema } = await import("../scripts/schema.js");
const L = await import("../scripts/survie-logique.js");
const { SECRET } = L;

async function executer(nom, args) {
  const o = OUTILS.find(x => x.nom === nom);
  assert.ok(o, `outil absent : ${nom}`);
  assert.deepEqual(validerSchema(o.schema, args), [], `${nom} : arguments hors schéma`);
  return o.executer(args);
}
const blocs = texte => { const i = texte.indexOf(SECRET); return { connu: i < 0 ? texte : texte.slice(0, i), secret: i < 0 ? "" : texte.slice(i) }; };
const sansSecret = (texte, quoi) => { for (const m of MARQUEURS_SECRETS) assert.ok(!texte.includes(m), `${quoi} : « ${m} » hors du bloc secret\n${texte}`); };
const derniers = api => api.appels.at(-1);
const ok = (r, quoi) => { assert.ok(!r.erreur, `${quoi} : ${r.contenu}`); return r; };

const NOUVEAUX = ["survie_affaire", "survie_sens", "survie_corps", "survie_reperes", "survie_plans", "survie_vivant", "survie_paradis"];
// Des arguments complets (schéma strict) pour chaque outil nouveau, à compléter.
const A = {
  survie_affaire: { action: "lister", affaire: "", issue: "", declencheur: "" },
  survie_sens: { action: "lire", personnages: [], creature: "", vent: "", bruit: false, region: "", site: "", n: 0, air: "doux" },
  survie_corps: { action: "lire", personnage: "", membres: [], quarts: 0, lieu: "", hauteur: 0, eau: 0, tester: false, livide: false, touches: 0, criteres: [], oui: true },
  survie_reperes: { action: "lire", personnage: "", de: "", a: "", date: "", certitude: "", mensonge: false, objet: "", repere: "", mort: "", plans: [] },
  survie_plans: { action: "lire", plan: "", objet: "", personnage: "", membres: [], lieu: "", cause: "", contre: [], qui: "", mort: "" },
  survie_vivant: { action: "lire", installation: "", bete: "", espece: "", n: 0, personnage: "", membres: [], portees: false, tir: false },
  survie_paradis: { action: "lire", membres: [], quarts: 0, abattus: -1, livides: -1, delta: 0, vit: "", region: "", chantier: "", aide: "" }
};
const avec = (nom, x) => ({ ...A[nom], ...x });
// Les outils d'avant, avec leurs champs nouveaux.
const B = {
  survie_avancer: { quarts: 1, raison: "", lumiere: false, lumiere_en_route: false, dorment: [], eveilles: [], lieu_sommeil: "", silence: "" },
  survie_test: { personnage: "Lucie", competence: "vigilance", difficulte: "normale", bonus: 0, malus: 0, forcer: false, compte: false, raison: "", ecoute: "" },
  survie_fouiller: { region: "", site: "", cible: "", membres: [], quarts: 1, prudence: "normal", genre: "", ecart: "", lieu: "", gisement: "" },
  survie_fabriquer: { action: "fabriquer", recette: "", artisan: "", membres: [], objet: "", usages: 0 },
  survie_assigner: { action: "table", personnage: "", tache: "", priorites: "", jours: 0, ref: "" },
  survie_construire: { action: "ouvrages", installation: "", membres: [], quarts: 0 },
  survie_communaute: { action: "second", qui: [], oui: true, delta: 0, raison: "", cible: "", nom: "", abri_aux: "restants", religions: [] }
};
const de = (nom, x) => ({ ...B[nom], ...x });

test("nouveaux outils : proposés à Fénoir seulement, jamais à Warcraft, 40k ni aux Veillées", () => {
  const ici = new Set(outilsDuSysteme("lakour-survie").map(o => o.nom));
  for (const n of NOUVEAUX) {
    assert.ok(ici.has(n), `absent de Fénoir : ${n}`);
    assert.deepEqual(OUTILS.find(o => o.nom === n).systemes, ["lakour-survie"], n);
  }
  for (const s of ["dnd5e", "impmal", "lakour-loups"]) {
    const ailleurs = new Set(outilsDuSysteme(s).map(o => o.nom));
    for (const n of NOUVEAUX) assert.ok(!ailleurs.has(n), `${n} proposé en ${s}`);
  }
  assert.equal(ici.size, 90, "Fénoir : 83 outils, 7 de plus");
});

test("schémas stricts : arguments complets acceptés ; action inconnue ou champ manquant refusés", () => {
  for (const n of NOUVEAUX) {
    const o = OUTILS.find(x => x.nom === n);
    assert.deepEqual(validerSchema(o.schema, A[n]), [], n);
    assert.ok(validerSchema(o.schema, { ...A[n], action: "inconnue" }).length, `${n} : action inconnue acceptée`);
    const { action, ...sans } = A[n];
    assert.ok(validerSchema(o.schema, sans).length, `${n} : action manquante acceptée`);
  }
  for (const [n, args] of Object.entries(B)) assert.deepEqual(validerSchema(OUTILS.find(x => x.nom === n).schema, args), [], n);
  assert.ok(L.TACHES.includes("ronde"), "la tâche « ronde » (à la demande)");
});

test("refus hors d'un monde lakour-survie, sans exception", async () => {
  installerFenoir({ systeme: "dnd5e", avecApi: false });
  for (const n of NOUVEAUX) {
    const r = await executer(n, A[n]);
    assert.equal(r.erreur, true, `${n} accepté hors de Fénoir`);
    assert.match(r.contenu, new RegExp(`^${n} : Le système lakour-survie n'est pas chargé`), n);
  }
});

test("hors du MJ actif : chaque écriture est refusée avec le message du système", async () => {
  installerFenoir({ mjActif: false, troisD: true });
  const ecritures = [
    ["survie_sens", { action: "nettoyer", n: 3 }], ["survie_corps", { action: "menage" }], ["survie_reperes", { action: "noter" }],
    ["survie_plans", { action: "noter", plan: "citerne" }], ["survie_vivant", { action: "lacher", bete: "b1" }], ["survie_paradis", { action: "ronde" }]
  ];
  for (const [n, x] of ecritures) {
    const r = await executer(n, avec(n, x));
    assert.equal(r.erreur, true, `${n} accepté hors du MJ actif`);
    assert.match(r.contenu, new RegExp(`^${n} : Seul le MJ actif peut faire cela\\. \\(LAKOUR_SURVIE\\.Erreurs\\.PasMJActif\\).*rien n'a changé`), n);
  }
  for (const [n, x] of [["survie_blessure", { action: "morsure", personnage: "Lucie", n: 0, morsure: false, soigneur: "" }], ["survie_avancer", de("survie_avancer", { lumiere: true })],
    ["survie_construire", de("survie_construire", { action: "entretenir", installation: "Palissade" })]]) {
    assert.match((await executer(n, x)).contenu, /PasMJActif/, n);
  }
});

test("survie_affaire : lister, tirer (horloge cachée, vérité au secret), avancer (un cran de pente), clore (effets appliqués, le reste au narrateur)", async () => {
  const { api, cadre } = installerFenoir({ troisD: true });
  const l = ok(await executer("survie_affaire", A.survie_affaire), "lister");
  assert.equal(blocs(l.contenu).connu, "", "la liste des affaires est au narrateur seul");
  assert.match(l.contenu, /La source tarie \[la-source-tarie\]/);
  const t = ok(await executer("survie_affaire", avec("survie_affaire", { action: "tirer", affaire: "La source tarie", declencheur: "date-perdue" })), "tirer");
  assert.equal(blocs(t.contenu).connu, "");
  assert.match(blocs(t.contenu).secret, /Sa VÉRITÉ \(piege\) : VERITE-SECRETE/);
  assert.match(t.contenu, /Issues \(clore\) : partager — On partage l'eau/);
  const h = cadre.horloges.find(x => x.id === "affaire-la-source-tarie");
  assert.ok(h && !h.visible && h.max === 3 && /VERITE-SECRETE/.test(h.notes), "horloge cachée, une case par cran, vérité dans ses notes");
  assert.equal((await executer("survie_affaire", avec("survie_affaire", { action: "tirer", affaire: "la-source-tarie" }))).erreur, true, "déjà en cours");
  const a = ok(await executer("survie_affaire", avec("survie_affaire", { action: "avancer" })), "avancer");
  assert.match(blocs(a.contenu).secret, /cran 1\/3 : On fait la queue à la fontaine/);
  assert.equal(cadre.horloges.find(x => x.id === h.id).valeur, 1);
  assert.equal((await executer("survie_affaire", avec("survie_affaire", { action: "clore", issue: "fuir" }))).erreur, true, "issue inconnue");
  const c = ok(await executer("survie_affaire", avec("survie_affaire", { action: "clore", issue: "partager" })), "clore");
  assert.match(c.contenu, /close : On partage l'eau — La source est partagée entre trois abris/);
  assert.match(c.contenu, /Appliqué : stocks eau \+4 ; moral \+1 à chacun ; réputation Les Planteurs des Hauts \+3 ; front fournaise -1/);
  assert.match(c.contenu, /À toi de le jouer : plantes \+1 .*\(survie_rumeur lancer\)/);
  assert.ok(api.appels.some(x => x[0] === "ajuster" && x[1].stocks?.eau === 4), "stocks par ajuster (les ressources du jeu seulement)");
  assert.ok(cadre.horloges.some(x => x.id === "rep-planteurs" && x.valeur === 3 && x.type === "reputation"), "réputation : horloge rep-<faction>");
  assert.ok(cadre.horloges.some(x => x.id === "front-fournaise"), "front : horloge front-<front>");
  assert.match(cadre.horloges.find(x => x.id === h.id).notes, /^Close \(issue partager\)/);
  // Close : elle ne renaît pas, ne se dit plus en cours.
  assert.match((await executer("survie_affaire", A.survie_affaire)).contenu, /peuvent naître : aucune/);
  assert.deepEqual(derniers(api), ["ajuster", { acteurId: "s2", etat: { moral: 1 }, raison: "Affaire : La source tarie" }]);
});

test("survie_sens : lire (odeur au secret), approche, l'habitude du noir, nettoyer, jouer", async () => {
  const { api } = installerFenoir({ troisD: true });
  const r = ok(await executer("survie_sens", A.survie_sens), "lire");
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /Dehors : il pleut, brise du sud-est ; la voix du coin : ressac ; la ravine : coule/);
  assert.match(connu, /Habitude du noir : Lucie Hoarau 7 nuit\(s\) \(palier 2\)/);
  sansSecret(connu, "sens");
  assert.match(secret, /Odeur de l'abri : 2\/4 pour les Livides, 1\/4 pour les bêtes \(ODEUR-SECRETE cuisine\), portée vers le nord-ouest/);
  assert.match(ok(await executer("survie_sens", avec("survie_sens", { action: "approche", vent: "vers-lui", bruit: true })), "approche").contenu, /-1 dé\(s\) de discrétion/);
  ok(await executer("survie_sens", avec("survie_sens", { action: "regler", personnages: ["Lucie"], n: 14 })), "regler");
  assert.deepEqual(derniers(api), ["noir", { acteurId: "s1", action: "regler", nuits: 14 }]);
  ok(await executer("survie_sens", avec("survie_sens", { action: "lumiere", personnages: ["Lucie"] })), "lumiere");
  assert.deepEqual(derniers(api), ["noir", { acteurId: "s1", action: "lumiere" }]);
  assert.match(ok(await executer("survie_sens", avec("survie_sens", { action: "nettoyer", site: "case-du-lagon", n: 4 })), "nettoyer").contenu, /Case créole du lagon nettoyé \(4 Livide\(s\)\) : les rencontres y sont × 0.5/);
  assert.deepEqual(derniers(api), ["nettoyer", { region: "saint-paul", site: "case-du-lagon", tues: 4 }]);
  assert.match(ok(await executer("survie_sens", avec("survie_sens", { action: "jouer", personnages: ["Eddy"], air: "fort" })), "jouer").contenu, /\+1 de moral à chacun, bruit \+3/);
  assert.deepEqual(derniers(api), ["jouer", { musiciens: ["s2"], air: "fort" }]);
  assert.equal((await executer("survie_sens", avec("survie_sens", { action: "jouer" }))).erreur, true, "jouer sans musicien");
});

test("survie_corps : sommeil, symptômes (signes au connu, vrais maux au secret), bivouac, dormir, chute, ménage, parer, Gris connu", async () => {
  const { api } = installerFenoir({ troisD: true });
  const l = ok(await executer("survie_corps", A.survie_corps), "lire");
  assert.match(blocs(l.contenu).connu, /Sommeil : Lucie Hoarau epuise \(-1 dé\)/);
  assert.match(blocs(l.contenu).connu, /Hygiène de l'abri : sale \(latrines 0, toilette 0\)/);
  assert.match(blocs(l.contenu).secret, /Souillure réelle : 2.4/);
  const s = ok(await executer("survie_corps", avec("survie_corps", { action: "symptomes", personnage: "Lucie" })), "symptomes");
  assert.match(blocs(s.contenu).connu, /Lucie Hoarau : fièvre, frissons ; une toux sèche ; sommeil : epuise\. Dis-le par ces signes\./);
  assert.doesNotMatch(blocs(s.contenu).connu, /dengue|INFECT|Gris/);
  assert.match(blocs(s.contenu).secret, /Ses vrais maux : MAL-SECRET dengue \(active, moral -1\)/);
  assert.match(blocs(s.contenu).secret, /INFECTÉ 2\/6/);
  const b = ok(await executer("survie_corps", avec("survie_corps", { action: "bivouac", criteres: ["ravine", "a-decouvert"] })), "bivouac");
  assert.match(b.contenu, /Bivouac dangereux : au bord d'une ravine/);
  ok(await executer("survie_corps", avec("survie_corps", { action: "dormir", membres: ["Lucie"], quarts: 2, lieu: "bivouac" })), "dormir");
  assert.deepEqual(derniers(api), ["dormir", { membres: ["s1"], quarts: 2, lieu: "bivouac" }]);
  const c = ok(await executer("survie_corps", avec("survie_corps", { action: "chute", personnage: "Eddy", hauteur: 7, eau: 0, tester: true })), "chute");
  assert.deepEqual(derniers(api), ["chute", { acteurId: "s2", hauteur: 7, eau: 0, tester: true }]);
  assert.match(c.contenu, /Eddy Payet tombe de 7 m : 2 blessure\(s\), une FRACTURE/);
  assert.match(ok(await executer("survie_corps", avec("survie_corps", { action: "chute", hauteur: 9, livide: true })), "livide").contenu, /il rampe/);
  ok(await executer("survie_corps", avec("survie_corps", { action: "menage", quarts: 1 })), "menage");
  assert.deepEqual(derniers(api), ["menage", { membres: ["s1", "s2"], quarts: 1 }]);
  assert.match(ok(await executer("survie_corps", avec("survie_corps", { action: "parer", personnage: "Eddy", touches: 2 })), "parer").contenu, /1 touche\(s\) parée\(s\), 1 passent/);
  ok(await executer("survie_corps", avec("survie_corps", { action: "gris_connu", oui: true })), "gris connu");
  assert.deepEqual(derniers(api), ["grisConnu", { connu: true }]);
});

test("survie_blessure : morsure par soignerMorsure (test chuchoté, issue au secret seulement)", async () => {
  const { api } = installerFenoir({ troisD: true });
  const r = ok(await executer("survie_blessure", { action: "morsure", personnage: "Lucie", n: 0, morsure: false, soigneur: "Eddy" }), "morsure");
  assert.deepEqual(derniers(api), ["soignerMorsure", { acteurId: "s1", soigneurId: "s2" }]);
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /La morsure de Lucie Hoarau est lavée et pansée par Eddy Payet, avec un médicament\. Personne ne sait encore/);
  assert.doesNotMatch(connu, /Gris est en lui|propre|infect/i);
  assert.match(secret, /Issue \(à ne jamais dire ni laisser deviner\) : le Gris est en lui/);
});

test("survie_reperes : le compte (écart au secret), une date reçue ou donnée (mensonge au secret), la lune, un repère, une carte copiée, un journal", async () => {
  const { api } = installerFenoir({ troisD: true });
  const l = ok(await executer("survie_reperes", A.survie_reperes), "lire");
  assert.match(blocs(l.contenu).connu, /Compte des jours : a-peu-pres, le groupe croit être le 5 décembre 2026 \(à 2 j près\), tenu par Lucie Hoarau/);
  assert.match(blocs(l.contenu).connu, /Repères : Carte routière \(Lucie Hoarau\)/);
  assert.match(blocs(l.contenu).secret, /Écart réel du compte : \+2 j \(ne le dis jamais\)/);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "teneur", personnage: "Eddy" })), "teneur");
  assert.deepEqual(derniers(api), ["compte", { action: "teneur", acteurId: "s2" }]);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "regler", date: "2026-12-07", certitude: "sur" })), "regler");
  assert.deepEqual(derniers(api), ["compte", { action: "regler", date: "2026-12-07", certitude: "sur" }]);
  assert.equal((await executer("survie_reperes", avec("survie_reperes", { action: "regler", date: "7 décembre" }))).erreur, true, "date illisible");
  const recu = ok(await executer("survie_reperes", avec("survie_reperes", { action: "recevoir_date", de: "un pêcheur", date: "2026-12-06" })), "recevoir");
  assert.deepEqual(derniers(api), ["donnerDate", { de: "un pêcheur", date: "2026-12-06" }]);
  assert.match(blocs(recu.contenu).secret, /Cette date est FAUSSE/);
  const donne = ok(await executer("survie_reperes", avec("survie_reperes", { action: "donner_date", personnage: "Lucie", a: "Madame Chane", date: "2026-12-01", mensonge: true })), "donner");
  assert.deepEqual(derniers(api), ["donnerDate", { de: "s1", a: "Madame Chane", date: "2026-12-01", mensonge: true }]);
  assert.doesNotMatch(blocs(donne.contenu).connu, /MENSONGE/);
  assert.match(blocs(donne.contenu).secret, /MENSONGE \(une rumeur r9/);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "lune" })), "lune");
  assert.deepEqual(derniers(api), ["lireLaLune", {}]);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "repere", personnage: "Eddy", repere: "carte-routiere" })), "repere");
  assert.deepEqual(derniers(api), ["donnerRepere", { acteurId: "s2", cle: "carte-routiere" }]);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "copier_carte", objet: "Carte routière" })), "copier");
  assert.deepEqual(derniers(api), ["copierCarte", { objetId: "pp9", acteurId: "s2" }]);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "journal", mort: "Gilberte" })), "journal");
  assert.deepEqual(derniers(api), ["lireJournal", { mortId: "m1" }]);
  ok(await executer("survie_reperes", avec("survie_reperes", { action: "journal", de: "un inconnu", date: "2026-12-02", plans: ["potager"] })), "journal d'un inconnu");
  assert.deepEqual(derniers(api), ["lireJournal", { de: "un inconnu", date: "2026-12-02", plans: ["potager"] }]);
});

test("survie_plans : carnet, valeur, lieux (au secret), visiter, papiers, copier, apprendre, étagère, donner, recevoir, noter, reprendre", async () => {
  const { api } = installerFenoir({ troisD: true });
  const l = ok(await executer("survie_plans", A.survie_plans), "lire");
  assert.match(l.contenu, /Carnet : Citerne de pluie\.\nPapiers : Carnet du fontainier \(Lucie Hoarau ; Citerne\)\.\nPar cœur : Eddy Payet \(Potager\)\./);
  assert.match(ok(await executer("survie_plans", avec("survie_plans", { action: "valeur", plan: "citerne" })), "valeur").contenu, /vaut 7 part\(s\) \(rareté 20\)/);
  const lx = ok(await executer("survie_plans", avec("survie_plans", { action: "lieux" })), "lieux");
  assert.equal(blocs(lx.contenu).connu, "");
  assert.match(lx.contenu, /LIEU-PLANS-SECRET Le vieux moulin \[moulin\] \(Saint-Paul, ICI ; fenêtre OUVERTE ; garde : Des Livides dans la cour\)\. Un plan n'est jamais obligatoire/);
  assert.match(ok(await executer("survie_plans", avec("survie_plans", { action: "visiter", lieu: "moulin", membres: ["Eddy"] })), "visiter").contenu, /ils trouvent un plan : Potager \(lu au carnet\)/);
  assert.deepEqual(derniers(api), ["lieuAPlans", { lieu: "moulin", membres: ["s2"] }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "apprendre", personnage: "Eddy", plan: "citerne" })), "apprendre");
  assert.deepEqual(derniers(api), ["enseignerPlan", { acteurId: "s2", cle: "citerne" }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "copier", personnage: "Eddy", plan: "citerne" })), "copier");
  assert.deepEqual(derniers(api), ["copierPlan", { cle: "citerne", acteurId: "s2" }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "donner", objet: "Carte routière", contre: [{ ressource: "nourriture", n: 3 }], qui: "Madame Chane" })), "donner");
  assert.deepEqual(derniers(api), ["donnerPlan", { objetId: "pp9", contre: { nourriture: 3 }, a: "Madame Chane" }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "recevoir", personnage: "Lucie", plan: "potager", qui: "un vieux" })), "recevoir");
  assert.deepEqual(derniers(api), ["recevoirPlan", { cle: "potager", acteurId: "s1", contre: {}, de: "un vieux" }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "perdre", cause: "feu" })), "perdre");
  assert.deepEqual(derniers(api), ["perdreEtagere", { cause: "feu" }]);
  assert.equal((await executer("survie_plans", avec("survie_plans", { action: "perdre" }))).erreur, true, "perdre sans cause");
  ok(await executer("survie_plans", avec("survie_plans", { action: "noter", plan: "potager" })), "noter");
  assert.deepEqual(derniers(api), ["noterPlan", { cle: "potager" }]);
  ok(await executer("survie_plans", avec("survie_plans", { action: "reprendre", mort: "Lucie", personnage: "Eddy" })), "reprendre");
  assert.deepEqual(derniers(api), ["reprendrePlans", { deId: "s1", aId: "s2" }]);
});

test("survie_vivant : cheptels et bêtes portées, peupler, enclos, abattre, soigner, curer, capturer, chasser, recevoir, lâcher, flair, bête sauvage (au secret)", async () => {
  const { api } = installerFenoir({ troisD: true });
  const l = ok(await executer("survie_vivant", A.survie_vivant), "lire");
  assert.match(l.contenu, /Cheptels : Basse-cour \[basse-cour\] 5\/8 poules \(santé 2\/3, manque : soif\)\.\nBêtes portées : 2 poules \[b1\] \(encore 3 quart\(s\)\)\.\nLe chien est avec le groupe\./);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "peupler", installation: "Basse-cour", n: 2, portees: true })), "peupler");
  assert.deepEqual(derniers(api), ["peupler", { installation: "basse-cour", n: 2, portees: true }]);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "enclos", bete: "poule" })), "enclos");
  assert.deepEqual(derniers(api), ["mettreEnEnclos", { beteId: "b1" }]);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "abattre", installation: "basse-cour", n: 1 })), "abattre");
  assert.deepEqual(derniers(api), ["abattre", { installation: "basse-cour", n: 1 }]);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "abattre", bete: "b1" })), "abattre une bête portée");
  assert.deepEqual(derniers(api), ["abattre", { beteId: "b1" }]);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "chasser", personnage: "Eddy", espece: "tangue", tir: true })), "chasser");
  assert.deepEqual(derniers(api), ["chasser", { acteurId: "s2", espece: "tangue", competence: "tir" }]);
  ok(await executer("survie_vivant", avec("survie_vivant", { action: "curer", installation: "Basse-cour", membres: ["Eddy"] })), "curer");
  assert.deepEqual(derniers(api), ["curer", { installation: "basse-cour", membres: ["s2"] }]);
  assert.match(ok(await executer("survie_vivant", avec("survie_vivant", { action: "flair", n: 3 })), "flair").contenu, /Le chien, à 3 m : Il tourne la tête/);
  const s = ok(await executer("survie_vivant", avec("survie_vivant", { action: "sauvage" })), "sauvage");
  assert.equal(blocs(s.contenu).connu, "");
  assert.equal((await executer("survie_vivant", avec("survie_vivant", { action: "enclos", bete: "cochon" }))).erreur, true, "bête inconnue");
});

test("survie_paradis : le signe au connu, la chaleur au secret ; ronde (morsures à soigner), corps, leurre, chaleur, sous terre, rallumer, chantier de région", async () => {
  const { api } = installerFenoir({ troisD: true });
  const r = ok(await executer("survie_paradis", A.survie_paradis), "lire");
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /Autour de l'abri : on vous a remarqués : des traces autour de la clôture ; 3 corps \(2 frais\) ; dernière ronde jour 2, 1 manquée\(s\)\./);
  assert.doesNotMatch(connu, /4.37|Chaleur/);
  assert.match(secret, /Chaleur : 4.37\/10, 2 agglutiné\(s\)/);
  assert.match(ok(await executer("survie_paradis", avec("survie_paradis", { action: "ile" })), "île").contenu, /L'île : 1\/5 région\(s\) rallumée\(s\)\.\n- Saint-Paul : rallumée ; TOUT Y EST/);
  const ronde = ok(await executer("survie_paradis", avec("survie_paradis", { action: "ronde", membres: ["Eddy"], abattus: 2, livides: 3 })), "ronde");
  assert.deepEqual(derniers(api), ["ronde", { membres: ["s2"], abattus: 2, livides: 3 }]);
  assert.match(blocs(ronde.contenu).connu, /MORDUS : Eddy Payet : soigne la morsure tout de suite \(survie_blessure morsure\)/);
  assert.match(blocs(ronde.contenu).secret, /Chaleur après la ronde : 3.9/);
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "ronde", membres: ["Eddy"] })), "ronde tirée");
  assert.deepEqual(derniers(api), ["ronde", { membres: ["s2"] }]);
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "bruler", quarts: 1 })), "brûler");
  assert.deepEqual(derniers(api), ["traiterCorps", { action: "bruler", membres: ["s1", "s2"], quarts: 1 }]);
  const leurre = ok(await executer("survie_paradis", avec("survie_paradis", { action: "leurre", membres: ["Eddy"] })), "leurre");
  assert.match(blocs(leurre.contenu).secret, /Effet : chaleur -2 ; 1 agglutiné\(s\) le suivent/);
  const ch = ok(await executer("survie_paradis", avec("survie_paradis", { action: "chaleur", delta: -1 })), "chaleur");
  assert.equal(blocs(ch.contenu).connu, "");
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "sous_terre", vit: "oui" })), "sous terre");
  assert.deepEqual(derniers(api), ["sousTerre", { vit: true }]);
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "eteindre", region: "Saint-Paul" })), "éteindre");
  assert.deepEqual(derniers(api), ["rallumer", { region: "saint-paul", action: "eteindre" }]);
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "chantier", chantier: "La centrale de Langevin", membres: ["Eddy"], quarts: 0 })), "chantier");
  assert.deepEqual(derniers(api), ["chantierRegion", { cle: "centrale-langevin", membres: ["s2"], quarts: 2 }]);
  ok(await executer("survie_paradis", avec("survie_paradis", { action: "aide", chantier: "centrale-langevin", aide: "planteurs" })), "aide");
  assert.deepEqual(derniers(api), ["chantierRegion", { cle: "centrale-langevin", aide: "planteurs" }]);
});

test("outils étendus : avancer (lumière, sommeil, silence), test (écouter), fouiller (un lieu, une récolte), construire (ouvrages, entretenir, démonter), incendie", async () => {
  const { api } = installerFenoir({ troisD: true });
  ok(await executer("survie_avancer", de("survie_avancer", { quarts: 2, lumiere: true, dorment: ["Lucie"], eveilles: ["Eddy"], lieu_sommeil: "bivouac", silence: "oui" })), "avancer");
  assert.deepEqual(derniers(api), ["avancer", { quarts: 2, raison: "", lumiere: true, dorment: ["s1"], eveilles: ["s2"], lieuSommeil: "bivouac", silence: true }]);
  ok(await executer("survie_avancer", de("survie_avancer", {})), "avancer sans option");
  assert.deepEqual(derniers(api), ["avancer", { quarts: 1, raison: "" }], "sans option, l'appel d'avant");
  ok(await executer("survie_test", de("survie_test", { ecoute: "yeux-fermes" })), "écouter");
  assert.equal(derniers(api)[1].ecoute, "yeux-fermes");
  ok(await executer("survie_fouiller", de("survie_fouiller", { cible: "lieu", genre: "maison", ecart: "oui" })), "fouiller un lieu");
  assert.deepEqual(derniers(api), ["fouiller", { region: "saint-paul", cible: "lieu", membres: ["s1", "s2"], quarts: 1, prudence: "normal", genre: "maison", ecart: true }]);
  ok(await executer("survie_fouiller", de("survie_fouiller", { cible: "matieres", gisement: "bambou" })), "récolter");
  assert.equal(derniers(api)[1].gisement, "bambou");
  const e = ok(await executer("survie_etat", { region: "saint-paul" }), "région de près");
  assert.match(blocs(e.contenu).connu, /Lieux à fouiller \(genre : nombre, vus\) : Maisons \[maison\] 12, 1 vu\(s\)/);
  assert.match(blocs(e.contenu).connu, /Gisements \(survie_fouiller matieres\) : Bambou \[bambou\]/);
  assert.match(blocs(e.contenu).secret, /Pillage réel des lieux vus \(0 intact, 1 vidé\) : Maisons 1 0.73, une bête : BETE-SECRETE poules/);
  const o = ok(await executer("survie_construire", de("survie_construire", {})), "ouvrages");
  assert.match(o.contenu, /Palissade 1 \(bois-sous-tole, usure 2\/3, entretien EN RETARD de 2 j\)/);
  assert.match(o.contenu, /Défenses devant les Livides : pièges 1, une alarme/);
  ok(await executer("survie_construire", de("survie_construire", { action: "entretenir", installation: "Palissade", quarts: 1 })), "entretenir");
  assert.deepEqual(derniers(api), ["entretenir", { installationId: "i1", membres: ["s1", "s2"], quarts: 1 }]);
  ok(await executer("survie_construire", de("survie_construire", { action: "demonter", installation: "etabli", membres: ["Eddy"] })), "démonter");
  assert.deepEqual(derniers(api), ["demonter", { installationId: "i2", membres: ["s2"] }]);
  const f = ok(await executer("survie_assaut", { force: 2, type: "incendie", description: "Une lampe renversée.", menace: "", issue: "assaut" }), "incendie");
  assert.deepEqual(derniers(api), ["incendie", { force: 2, cause: "Une lampe renversée." }]);
  assert.match(f.contenu, /Le feu à l'abri \(force 2\) : brûlé Palissade ; épargné rien ; l'abri prend 1 dégât/);
  assert.equal((await executer("survie_assaut", { force: 5, type: "incendie", description: "", menace: "", issue: "assaut" })).erreur, true, "incendie : force 1 à 3");
});

test("outils étendus : atelier et outils, table de gestion, rangs et conversion, boutique, étal, valeur d'un objet, troc à la boutique", async () => {
  const { api } = installerFenoir({ troisD: true, nouveautes: true });
  assert.match(ok(await executer("survie_fabriquer", de("survie_fabriquer", { action: "outils" })), "outils").contenu, /Hache \(Eddy Payet ; recuperation, USÉ, 6\/20 usages\)/);
  ok(await executer("survie_fabriquer", de("survie_fabriquer", { action: "reparer", artisan: "Eddy", objet: "hache" })), "réparer");
  assert.deepEqual(derniers(api), ["reparerOutil", { acteurId: "s2", objetId: "h1" }]);
  ok(await executer("survie_fabriquer", de("survie_fabriquer", { action: "user", objet: "Hache", usages: 2 })), "user");
  assert.deepEqual(derniers(api), ["userOutil", { acteurId: "s2", objetId: "h1", usages: 2 }]);
  const t = ok(await executer("survie_assigner", de("survie_assigner", {})), "table");
  assert.match(t.contenu, /- Eddy Payet \(second\) : à chantier, corvée eau-du-matin, grille : chantier 1/);
  assert.match(t.contenu, /Quotas : Eddy Payet chantier 3 j\/semaine \(fait 1\) \[q1\]/);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "priorites", personnage: "Eddy", priorites: "ronde 1, garde 9" })), "priorités");
  assert.deepEqual(derniers(api), ["priorites", { acteurId: "s2", grille: { ronde: 1, garde: 4 } }]);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "priorites", personnage: "Eddy" })), "effacer");
  assert.deepEqual(derniers(api), ["priorites", { acteurId: "s2", effacer: true }]);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "quota", personnage: "Eddy", tache: "eau", jours: 2 })), "quota");
  assert.deepEqual(derniers(api), ["quota", { acteurId: "s2", tache: "eau", jours: 2 }]);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "retirer_quota", ref: "q1" })), "retirer");
  assert.deepEqual(derniers(api), ["quota", { retirer: "q1" }]);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "corvee", personnage: "Eddy", ref: "L'eau du matin" })), "corvée");
  assert.deepEqual(derniers(api), ["corvee", { acteurId: "s2", corvee: "eau-du-matin" }]);
  ok(await executer("survie_assigner", de("survie_assigner", { action: "tache", personnage: "Eddy", tache: "ronde" })), "la ronde, à la demande");
  assert.deepEqual(derniers(api), ["assigner", { acteurId: "s2", tache: "ronde" }]);
  ok(await executer("survie_communaute", de("survie_communaute", { qui: ["Eddy"], oui: false })), "second retiré");
  assert.deepEqual(derniers(api), ["second", { acteurId: "s2", retirer: true }]);
  ok(await executer("survie_communaute", de("survie_communaute", { action: "convertir", qui: ["Eddy"], religions: ["Islam"], raison: "la mosquée de Saint-Paul" })), "convertir");
  assert.deepEqual(derniers(api), ["convertir", { acteurId: "s2", religion: "islam", lieu: "la mosquée de Saint-Paul" }]);
  ok(await executer("survie_communaute", de("survie_communaute", { action: "passage", cible: "c1", oui: true })), "passage");
  assert.deepEqual(derniers(api), ["passage", { communauteId: "c1", ouvert: true }]);
  const carnet = { action: "ouvrir", boutique: "Chez Ah-Kiem", tenancier: "", biens: [], cibles: [], faction: "", remise: false, tirer: true };
  ok(await executer("survie_carnet", carnet), "boutique");
  assert.deepEqual(derniers(api), ["ouvrirBoutique", { nom: "Chez Ah-Kiem", tenancier: "", tirer: true }]);
  const forain = { action: "etal", marche: "", foire: "", nom: "", jour_semaine: 6, bastions: [], par: "Eddy", biens: [{ ressource: "graines", n: 2 }], contre: "medicaments" };
  ok(await executer("survie_marche_forain", forain), "étal");
  assert.deepEqual(derniers(api), ["tenirEtal", { marche: "marche-saint-paul", biens: { graines: 2 }, contre: "medicaments", gardien: "s2" }]);
  assert.match(ok(await executer("survie_marche", { action: "valeur", region: "", stade: "", objet: "Trousse de secours" }), "valeur").contenu, /Trousse de secours vaut 5 part\(s\) \(bareme\)/);
  const troc = { action: "evaluer", biens: [{ ressource: "eau", n: 1 }], pnj: "", cibles: [], faction: "", marche: "", accepter: false, prejuge: "", boutique: "chane", parleur: "Lucie" };
  ok(await executer("survie_troquer", troc), "troc à la boutique");
});

test("voyage (ce qu'on comprend en arrivant), le jour relatif quand le groupe a un compte", async () => {
  installerFenoir({ troisD: true });
  const v = ok(await executer("survie_voyager", { vers: "le-port", transport: "pied", membres: [], charge: 0 }), "voyager");
  assert.match(blocs(v.contenu).connu, /En arrivant, ce qu'on comprend \(à raconter\) : Les grues sont immobiles, les quais se taisent\./);
  assert.equal(L.texteJour(5, { jour: 7, compte: {} }), "il y a 2 j");
  assert.equal(L.texteJour(9, { jour: 7, compte: {} }), "dans 2 j");
  assert.equal(L.texteJour(7, { jour: 7, compte: {} }), "aujourd'hui");
  assert.equal(L.texteJour(7, { jour: 7 }), "jour 7", "un système sans compte : comme avant");
  assert.equal(L.texteQuand({ jour: 7, moment: "soir", compte: { certitude: "perdu" }, jourDuGroupe: null, dateDuGroupe: "début décembre", phase: "silence" }),
    "jour inconnu, soir (début décembre), phase silence");
});
