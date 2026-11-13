// Fénoir (système lakour-survie), les nouveautés du 2026-11-13 (contrat §12 à §15 du dépôt lakour-fenoir) : le marché et le Ladi
// Lafé, les deux savoirs et l'île en mouvement, l'esprit, le sens moral et la communauté. Pour chaque outil : son schéma strict, les
// arguments passés à l'API du système, le refus hors du MJ actif et hors d'un monde lakour-survie, le secret (vérité des rumeurs,
// vraie couleur, préjugés, sens moral, cyclone vécu) jamais dans le bloc « [connu des joueurs] » ni dans ce que voit un compagnon IA.
// Doublure de game.lakourSurvie (essais/doublures/foundry-survie.mjs, monde « nouveautes »), aucun réseau, aucune IA.
// Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installerFenoir, MARQUEURS_SECRETS } from "./doublures/foundry-survie.mjs";

installerFenoir({ nouveautes: true });
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { validerSchema } = await import("../scripts/schema.js");
const L = await import("../scripts/survie-logique.js");
const { vueAventure } = await import("../scripts/compagnons-jeu.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");
const { CONNU, SECRET } = L;

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

const NOUVEAUX = ["survie_marche", "survie_troquer", "survie_carnet", "survie_marche_forain", "survie_rumeur", "survie_prejuge", "survie_veillee",
  "survie_porte", "survie_vote", "survie_acte_moral", "survie_communaute", "survie_esprit"];

// Des arguments complets (schéma strict) pour chaque outil, à compléter.
const A = {
  survie_marche: { action: "lire", region: "", stade: "" },
  survie_troquer: { action: "evaluer", biens: [{ ressource: "medicaments", n: 1 }, { ressource: "nourriture", n: -8 }], pnj: "", cibles: [], faction: "", marche: "", accepter: false, prejuge: "" },
  survie_carnet: { action: "prendre", boutique: "", tenancier: "", biens: [{ ressource: "nourriture", n: 2 }], cibles: [], faction: "", remise: false },
  survie_marche_forain: { action: "ouvrir", marche: "", foire: "", nom: "", jour_semaine: 6, bastions: [], par: "" },
  survie_rumeur: { action: "lancer", sujet: "", texte: "", vraie: true, malveillant: false, auteur: "", portee: "region", contre: true, rumeur: "", preuve: "fait" },
  survie_prejuge: { action: "dementir", cible: "", pnj: [], prejuges: [] },
  survie_veillee: { action: "apprendre", personnage: "", autre: "", savoir: "", source: "", membres: [], quarts: 0 },
  survie_porte: { action: "frapper", visiteur: "", profil: "", vote: "", circonstances: false },
  survie_vote: { action: "voter", question: "", acte: "", voix: [], circonstances: false, vote: "", decision: "pour" },
  survie_acte_moral: { personnages: [], acte: "", delta: 0, circonstances: false, temoins: true, vote: "", journal: false },
  survie_communaute: { action: "chef", qui: [], oui: true, delta: 0, raison: "", cible: "", nom: "", abri_aux: "restants" },
  survie_esprit: { action: "lire", personnage: "", regard: "", religion: [], pratique: "", ancrage: "", ancrage_perdu: "", reputation: 0, autorite: 0, chance: 0, forcer: false }
};
const avec = (nom, x) => ({ ...A[nom], ...x });

test("nouveaux outils : proposés à Fénoir seulement (systemes lakour-survie), jamais à Warcraft, 40k ni aux Veillées", () => {
  const ici = new Set(outilsDuSysteme("lakour-survie").map(o => o.nom));
  for (const n of NOUVEAUX) {
    assert.ok(ici.has(n), `absent de Fénoir : ${n}`);
    assert.deepEqual(OUTILS.find(o => o.nom === n).systemes, ["lakour-survie"], n);
  }
  for (const s of ["dnd5e", "impmal", "lakour-loups"]) {
    const ailleurs = new Set(outilsDuSysteme(s).map(o => o.nom));
    for (const n of NOUVEAUX) assert.ok(!ailleurs.has(n), `${n} proposé en ${s}`);
  }
  assert.equal(ici.size, 83, "Fénoir : 71 outils avant, 12 de plus");
});

test("schémas stricts : les arguments complets passent, un choix inconnu ou un champ manquant est refusé", () => {
  for (const n of NOUVEAUX) {
    const o = OUTILS.find(x => x.nom === n);
    assert.deepEqual(validerSchema(o.schema, A[n]), [], n);
    const { action: _a, ...sans } = A[n];
    if ("action" in A[n]) {
      assert.ok(validerSchema(o.schema, { ...A[n], action: "inconnue" }).length, `${n} : action inconnue acceptée`);
      assert.ok(validerSchema(o.schema, sans).length, `${n} : action manquante acceptée`);
    }
  }
  assert.ok(validerSchema(OUTILS.find(x => x.nom === "survie_troquer").schema, avec("survie_troquer", { biens: [{ ressource: "energie", n: 1 }] })).length,
    "l'énergie ne se troque pas");
});

test("refus hors d'un monde lakour-survie : sans le système, chaque outil refuse clairement, sans exception", async () => {
  installerFenoir({ systeme: "dnd5e", avecApi: false });
  for (const n of NOUVEAUX) {
    const r = await executer(n, A[n]);
    assert.equal(r.erreur, true, `${n} accepté hors de Fénoir`);
    assert.match(r.contenu, new RegExp(`^${n} : Le système lakour-survie n'est pas chargé`), n);
  }
});

test("hors du MJ actif : chaque outil qui écrit est refusé avec le message du système", async () => {
  installerFenoir({ mjActif: false, nouveautes: true });
  const ecritures = {
    survie_troquer: { action: "troquer" }, survie_carnet: {}, survie_marche_forain: { marche: "marche-saint-paul" },
    survie_rumeur: { texte: "On dit des choses." }, survie_prejuge: { cible: "zoreils" }, survie_veillee: { action: "preparer_cyclone" },
    survie_porte: {}, survie_vote: { acte: "accueillir" }, survie_acte_moral: { personnages: ["Lucie"], acte: "aider" },
    survie_communaute: { qui: ["Lucie"] }, survie_esprit: { action: "tirer", personnage: "Eddy" }
  };
  for (const [n, x] of Object.entries(ecritures)) {
    const r = await executer(n, avec(n, x));
    assert.equal(r.erreur, true, `${n} accepté hors du MJ actif`);
    assert.match(r.contenu, new RegExp(`^${n} : Seul le MJ actif peut faire cela\\. \\(LAKOUR_SURVIE\\.Erreurs\\.PasMJActif\\).*rien n'a changé`), n);
  }
  assert.equal((await executer("survie_assaut", { force: 0, type: "", description: "", menace: "m1", issue: "ultimatum" })).erreur, true, "resoudreMenace");
});

test("survie_marche : lire (cours, stades, carnets, marchés, rumeurs ; vérité au secret), evenement (au secret)", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const r = ok(await executer("survie_marche", A.survie_marche), "lire");
  const { connu, secret } = blocs(r.contenu);
  for (const m of ["Cours du jour (parts) : eau 0,5, nourriture 1", "Stades à Saint-Paul : troc oui", "Boutique Chane [chane], tenue par Madame Chane : dette du groupe 4 part(s)",
    "Marché forain de Saint-Paul [marche-saint-paul] (lundi)", "JOUR DE MARCHÉ AUJOURD'HUI", "r1 (le groupe, region, contre)"]) assert.ok(connu.includes(m), `${m} :\n${connu}`);
  assert.ok(!connu.includes("Une vieille histoire"), "une rumeur démentie ne court plus");
  sansSecret(connu, "survie_marche");
  assert.match(secret, /Rumeur r1 : FAUSSE, malveillante, lancée par AUTEUR-SECRET/);
  const e = ok(await executer("survie_marche", avec("survie_marche", { action: "evenement", stade: "boutique" })), "evenement");
  assert.equal(blocs(e.contenu).connu, "", "un événement à jouer : tout au secret");
  assert.match(e.contenu, /Le vieux qui rend la monnaie.*survie_prejuge dementir/s);
  assert.ok(api.appels.every(([n]) => !["evenementDeMarche", "marche"].includes(n)), "lectures : rien d'écrit");
});

test("survie_troquer : biens signés (+ reçu, − donné), préjugés éveillés, faction, marché ; confiance et préjugés au secret ; prejuge porte « colporter »", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const e = ok(await executer("survie_troquer", avec("survie_troquer", { pnj: "Madame Chane", cibles: ["Zoreils"], faction: "Les Planteurs des Hauts", marche: "Marché forain" })), "evaluer");
  assert.equal(api.appels.length, 0, "évaluer n'écrit rien");
  const { connu, secret } = blocs(e.contenu);
  assert.match(connu, /donne nourriture 8 \(8 parts\) contre médicaments 1 \(7,5 parts\) ; Madame Chane en demande 11,25/);
  assert.match(connu, /il refuserait/);
  sansSecret(connu, "évaluer");
  assert.match(secret, /Première confiance de Madame Chane : poids 2 \(préjugés éveillés : zoreils\) → majoration \+50 %, pas de crédit, −1 dé/);
  assert.match(secret, /PREJUGE-SECRET/);
  const t = ok(await executer("survie_troquer", avec("survie_troquer", { action: "troquer", pnj: "Madame Chane", cibles: ["zoreils"], accepter: true, prejuge: "Lucie" })), "troquer");
  assert.deepEqual(derniers(api), ["troquer", { donne: { nourriture: 8 }, recoit: { medicaments: 1 }, pnjId: "pnj-chane", cibles: ["zoreils"], faction: "", marche: "",
    accepter: true, prejuge: "s1" }]);
  assert.match(blocs(t.contenu).connu, /Troc fait\. Stocks : eau 12/);
  assert.match(blocs(t.contenu).secret, /Ses préjugés s'usent : zoreils.*Sens moral : Lucie Hoarau -1/s);
  assert.doesNotMatch(blocs(t.contenu).connu, /Sens moral/);
  const refus = ok(await executer("survie_troquer", avec("survie_troquer", { action: "troquer", pnj: "Madame Chane", cibles: ["zoreils"] })), "refus");
  assert.match(refus.contenu, /Refusé : Il demande 11\.25 parts/);
  assert.equal((await executer("survie_troquer", avec("survie_troquer", { biens: [] }))).erreur, true, "rien à échanger");
  assert.match((await executer("survie_troquer", avec("survie_troquer", { marche: "Mordor" }))).contenu, /marché introuvable : « Mordor » \(Marché forain de Saint-Paul \[marche-saint-paul\]\)/);
});

test("survie_carnet : ouvrir, prendre (confiance au secret), rendre, effacer, solder (remise) ; la boutique par son nom ou la seule", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  await executer("survie_carnet", avec("survie_carnet", { action: "ouvrir", boutique: "Chez Payet", tenancier: "Eddy", biens: [] }));
  assert.deepEqual(derniers(api), ["ouvrirBoutique", { nom: "Chez Payet", tenancier: "s2" }]);
  const p = ok(await executer("survie_carnet", avec("survie_carnet", { cibles: ["zoreils"] })), "prendre");
  assert.deepEqual(derniers(api), ["crediter", { boutique: "chane", biens: { nourriture: 2 }, cibles: ["zoreils"], faction: "" }]);
  assert.match(blocs(p.contenu).connu, /Pris à crédit : nourriture 2 \(2 parts\) ; le groupe doit 6 part\(s\) sur un plafond de 10/);
  const refus = ok(await executer("survie_carnet", avec("survie_carnet", { boutique: "Boutique Chane", cibles: ["zoreils", "malbars"] })), "refus");
  assert.match(refus.contenu, /Pas de crédit : pas de crédit pour le groupe/);
  await executer("survie_carnet", avec("survie_carnet", { action: "rendre", biens: [{ ressource: "eau", n: 4 }] }));
  assert.deepEqual(derniers(api), ["rendre", { boutique: "chane", biens: { eau: 4 }, cibles: [] }]);
  await executer("survie_carnet", avec("survie_carnet", { action: "effacer", biens: [] }));
  assert.deepEqual(derniers(api), ["effacerDette", { boutique: "chane", debiteur: "groupe" }]);
  const s = ok(await executer("survie_carnet", avec("survie_carnet", { action: "solder", biens: [], remise: true })), "solder");
  assert.deepEqual(derniers(api), ["solderCarnet", { boutique: "chane", remises: ["groupe"] }]);
  assert.match(s.contenu, /la dette du groupe est effacée/);
  assert.equal((await executer("survie_carnet", avec("survie_carnet", { biens: [] }))).erreur, true, "prendre sans biens");
});

test("survie_marche_forain : ouvrir (contenu, foire, le sien), accueillir, rendre, rompre (réputation ; sens moral au secret), retablir, fermer", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  await executer("survie_marche_forain", avec("survie_marche_forain", { marche: "Marché forain de Saint-Paul", bastions: ["Les Récupérateurs", "groupe"] }));
  assert.deepEqual(derniers(api), ["ouvrirMarche", { modele: "marche-saint-paul", bastions: ["recuperateurs", "groupe"] }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { foire: "Foire aux letchis" }));
  assert.deepEqual(derniers(api), ["ouvrirMarche", { foire: "foire-letchis", bastions: [] }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { nom: "Marché du Maïdo", jour_semaine: 3 }));
  assert.deepEqual(derniers(api), ["ouvrirMarche", { nom: "Marché du Maïdo", jourSemaine: 3, bastions: [] }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { action: "accueillir" }));
  assert.deepEqual(derniers(api), ["accueillir", { marche: "marche-saint-paul", hote: "groupe" }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { action: "rendre" }));
  assert.deepEqual(derniers(api), ["accueillir", { marche: "marche-saint-paul", hote: "" }]);
  const r = ok(await executer("survie_marche_forain", avec("survie_marche_forain", { action: "rompre" })), "rompre");
  assert.deepEqual(derniers(api), ["rompreTreve", { marche: "marche-saint-paul", par: "groupe" }]);
  assert.match(blocs(r.contenu).connu, /TRÊVE ROMPUE.*Réputation : Les Planteurs des Hauts -3/);
  assert.match(blocs(r.contenu).secret, /Sens moral : Lucie Hoarau -1 \(réputation -1\), Eddy Payet -1/);
  await executer("survie_marche_forain", avec("survie_marche_forain", { action: "rompre", par: "Les Récupérateurs" }));
  assert.deepEqual(derniers(api), ["rompreTreve", { marche: "marche-saint-paul", par: "recuperateurs" }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { action: "retablir" }));
  assert.deepEqual(derniers(api), ["retablirTreve", { marche: "marche-saint-paul" }]);
  await executer("survie_marche_forain", avec("survie_marche_forain", { action: "fermer" }));
  assert.deepEqual(derniers(api), ["fermerMarche", { marche: "marche-saint-paul" }]);
  assert.equal((await executer("survie_marche_forain", A.survie_marche_forain)).erreur, true, "ouvrir sans rien");
});

test("survie_rumeur : lancer (vérité au secret, colporteur), dementir ; une rumeur vraie ne se dément pas", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const r = ok(await executer("survie_rumeur", avec("survie_rumeur", { texte: "AUTEUR-SECRET a vu des Livides au collège.", vraie: false, malveillant: true, auteur: "Eddy" })), "lancer");
  assert.deepEqual(derniers(api), ["rumeur", { sujet: "groupe", texte: "AUTEUR-SECRET a vu des Livides au collège.", vraie: false, malveillant: true, auteur: "s2", portee: "region", contre: true }]);
  assert.match(blocs(r.contenu).connu, /Rumeur r2 \(region\) sur le groupe/);
  assert.match(blocs(r.contenu).secret, /Elle est FAUSSE, malveillante, lancée par Eddy Payet\.\nSens moral : Eddy Payet -1/);
  assert.doesNotMatch(blocs(r.contenu).connu, /FAUSSE|Eddy/);
  await executer("survie_rumeur", avec("survie_rumeur", { texte: "Le vieux Ti Jean ment.", sujet: "Ti Jean", auteur: "groupe" }));
  assert.equal(derniers(api)[1].sujet, "Ti Jean");
  assert.equal(derniers(api)[1].auteur, "groupe");
  const d = ok(await executer("survie_rumeur", avec("survie_rumeur", { action: "dementir", rumeur: "r1", preuve: "temoin" })), "dementir");
  assert.deepEqual(derniers(api), ["dementir", { id: "r1", preuve: "temoin" }]);
  assert.match(d.contenu, /La rumeur r1 est démentie \(temoin\)/);
  assert.match((await executer("survie_rumeur", avec("survie_rumeur", { action: "dementir", rumeur: "r9" }))).contenu, /Démenti impossible : une rumeur vraie ne se dément pas/);
  assert.equal((await executer("survie_rumeur", A.survie_rumeur)).erreur, true, "lancer sans texte");
});

test("survie_prejuge : dementir (au secret), ecrire (un PNJ), marchand (résumé public, préjugés au secret)", async () => {
  const { api, acteurs } = installerFenoir({ nouveautes: true });
  const d = ok(await executer("survie_prejuge", avec("survie_prejuge", { cible: "Zoreils" })), "dementir");
  assert.deepEqual(derniers(api), ["dementirPrejuge", { cible: "zoreils", pnj: [] }]);
  assert.equal(blocs(d.contenu).connu, "");
  assert.match(d.contenu, /Madame Chane en rabat un cran/);
  await executer("survie_prejuge", avec("survie_prejuge", { action: "ecrire", pnj: ["Madame Chane"], prejuges: [{ cible: "Malbars", poids: 5, dit: "Ils parlent trop fort." }] }));
  assert.deepEqual(derniers(api), ["prejuges", { acteurId: "pnj-chane", prejuges: [{ cible: "malbars", poids: 3, dit: "Ils parlent trop fort." }] }]);
  assert.equal((await executer("survie_prejuge", avec("survie_prejuge", { action: "ecrire", pnj: [] }))).erreur, true, "ecrire sans PNJ");
  acteurs.delete("pnj-chane");
  const m = ok(await executer("survie_prejuge", avec("survie_prejuge", { action: "marchand", cible: "Madame Chane" })), "marchand");
  assert.deepEqual(derniers(api), ["creerMarchand", { cle: "madame-chane" }]);
  const { connu, secret } = blocs(m.contenu);
  assert.match(connu, /Madame Chane entre en jeu/);
  assert.match(connu, /regard : refaire/);
  sansSecret(connu, "marchand");
  assert.doesNotMatch(connu, /sens moral|préjugés/);
  assert.match(secret, /sens moral \+2 \(bleutée\).*préjugés .*Zoreils \[zoreils\] \(poids 2\) : « PREJUGE-SECRET/s);
});

test("survie_veillee : preparer_cyclone, apprendre (livre, maître), confiance, dicter, apprivoiser", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const p = ok(await executer("survie_veillee", avec("survie_veillee", { action: "preparer_cyclone", membres: ["Lucie", "Eddy"], quarts: 2 })), "préparer");
  assert.deepEqual(derniers(api), ["preparerCyclone", { membres: ["s1", "s2"], quarts: 2 }]);
  assert.match(p.contenu, /4\/4 quarts-personne — PRÊT/);
  await executer("survie_veillee", avec("survie_veillee", { personnage: "Eddy", autre: "Lucie", savoir: "Tisanes lontan" }));
  assert.deepEqual(derniers(api), ["apprendre", { acteurId: "s2", savoir: "tisanes", source: "maitre", maitreId: "s1" }]);
  const l = ok(await executer("survie_veillee", avec("survie_veillee", { personnage: "Eddy", savoir: "premiers-secours", source: "livre" })), "livre");
  assert.deepEqual(derniers(api), ["apprendre", { acteurId: "s2", savoir: "premiers-secours", source: "livre" }]);
  assert.match(l.contenu, /2\/14 veillées ; à la bougie/);
  assert.equal((await executer("survie_veillee", avec("survie_veillee", { personnage: "Eddy", savoir: "tisanes", source: "maitre" }))).erreur, true, "maître manquant");
  await executer("survie_veillee", avec("survie_veillee", { action: "confiance", personnage: "Eddy", autre: "Lucie" }));
  assert.deepEqual(derniers(api), ["gagnerConfiance", { acteurId: "s2", parleurId: "s1" }]);
  const d = ok(await executer("survie_veillee", avec("survie_veillee", { action: "dicter", personnage: "Eddy", autre: "Lucie" })), "dicter");
  assert.deepEqual(derniers(api), ["dicter", { gramouneId: "s2", scribeId: "s1" }]);
  assert.match(d.contenu, /Le cahier de Eddy Payet est écrit \(porté par Lucie Hoarau\) : il apprend Tisanes lontan/);
  await executer("survie_veillee", avec("survie_veillee", { action: "apprivoiser", personnage: "Lucie" }));
  assert.deepEqual(derniers(api), ["apprivoiser", { acteurId: "s1" }]);
  assert.equal((await executer("survie_veillee", avec("survie_veillee", { action: "dicter", personnage: "Eddy" }))).erreur, true, "scribe manquant");
});

test("survie_fouiller (jardins, livres), survie_recrue (une gramoune : savoirs, préjugés au secret)", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  for (const cible of ["jardins", "livres", "gaz"]) {
    ok(await executer("survie_fouiller", { region: "", site: "", cible, membres: [], quarts: 1, prudence: "normal" }), cible);
    assert.equal(derniers(api)[1].cible, cible);
  }
  game.lakourSurvie.fouiller = async () => ({ butin: {}, livre: "tisanes", rencontre: null, bruit: 0, faits: [] });
  const f = await executer("survie_fouiller", { region: "", site: "", cible: "livres", membres: ["Eddy"], quarts: 1, prudence: "discret" });
  assert.match(f.contenu, /Un livre trouvé : Tisanes lontan, porté par Eddy Payet.*survie_veillee apprendre/);
  const g = ok(await executer("survie_recrue", { action: "generer", region: "", gramoune: "Gramoune Ida", recrue: "", parleur: "", attitude: "" }), "gramoune");
  assert.deepEqual(derniers(api), ["genererRecrue", { region: "saint-paul", gramoune: "gramoune-ida" }]);
  assert.equal(blocs(g.contenu).connu, "");
  assert.match(g.contenu, /Gramoune Ida.*GRAMOUNE.*savoirs : Tisanes lontan.*confiance de départ 1\/5.*préjugés .*PREJUGE-SECRET/s);
  assert.match(g.contenu, /esprit : regard l'épreuve.*foi : Catholique, pratiquant ; autorité 3\/5 ; couleur bleutée \(sens moral \+4 : À NE DIRE QU'AU JOUEUR CONCERNÉ/s);
  assert.match((await executer("survie_recrue", { action: "generer", region: "", gramoune: "Mémé Inconnue", recrue: "", parleur: "", attitude: "" })).contenu,
    /« Mémé Inconnue » introuvable dans le contenu de Fénoir \(gramounes : gramoune-ida\)/);
});

test("survie_porte : frapper (vraie couleur au secret), accueillir, refuser (suite au secret), trahir, avec un vote", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const f = ok(await executer("survie_porte", avec("survie_porte", { profil: "dur" })), "frapper");
  assert.deepEqual(derniers(api), ["frapper", { profil: "dur" }]);
  assert.match(blocs(f.contenu).connu, /On frappe à la porte : v2 Teddy Fontaine, 44 ans \(dur\)/);
  assert.doesNotMatch(blocs(f.contenu).connu, /couleur|rouge/);
  assert.match(blocs(f.contenu).secret, /Sa vraie couleur : rouge \(sens moral -8\)/);
  const a = ok(await executer("survie_porte", avec("survie_porte", { action: "accueillir", visiteur: "Maëva", vote: "vote1", circonstances: true })), "accueillir");
  assert.deepEqual(derniers(api), ["porte", { visiteurId: "v1", decision: "accueillir", voteId: "vote1", circonstances: true }]);
  assert.match(blocs(a.contenu).connu, /Maëva Grondin entre au groupe \(recrue\) avec 2 proche\(s\).*Le chef N'A PAS SUIVI le vote/s);
  assert.match(blocs(a.contenu).secret, /Sens moral : Lucie Hoarau \+1/);
  const r = ok(await executer("survie_porte", avec("survie_porte", { action: "refuser", visiteur: "v1" })), "refuser");
  assert.match(blocs(r.contenu).secret, /il reviendra mettre le FEU/);
  assert.doesNotMatch(blocs(r.contenu).connu, /FEU/);
  const t = ok(await executer("survie_porte", avec("survie_porte", { action: "trahir", visiteur: "v1" })), "trahir");
  assert.match(t.contenu, /prend ce que Maëva Grondin apportait \(nourriture 2\)/);
  assert.match((await executer("survie_porte", avec("survie_porte", { action: "refuser", visiteur: "personne" }))).contenu, /visiteur introuvable.*v1 Maëva Grondin/);
});

test("survie_vote : voter (voix par nom, dont un compagnon IA), decider ; survie_acte_moral (colporter, delta, vote) au secret", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const v = ok(await executer("survie_vote", avec("survie_vote", { question: "On l'accueille ?", acte: "accueillir", voix: [{ personnage: "Eddy", voix: "pour" }] })), "voter");
  assert.deepEqual(derniers(api), ["voter", { question: "On l'accueille ?", acte: "accueillir", voix: { s2: "pour" }, circonstances: false }]);
  assert.match(v.contenu, /Vote vote2 « On l'accueille \? » : pour 1, contre 0, abstention 1 \(Lucie Hoarau abstention, Eddy Payet pour\)/);
  const d = ok(await executer("survie_vote", avec("survie_vote", { action: "decider", vote: "vote2", decision: "contre" })), "decider");
  assert.deepEqual(derniers(api), ["decider", { voteId: "vote2", decision: "contre" }]);
  assert.match(d.contenu, /N'A PAS SUIVI/);
  assert.equal((await executer("survie_vote", A.survie_vote)).erreur, true, "voter sans acte");
  const c = ok(await executer("survie_acte_moral", avec("survie_acte_moral", { personnages: ["Lucie"], acte: "colporter", journal: true })), "colporter");
  assert.deepEqual(derniers(api), ["acteMoral", { acteurs: ["s1"], acte: "colporter", circonstances: false, temoins: true, voteId: "", journal: true }]);
  assert.match(blocs(c.contenu).connu, /Acte noté : Lucie Hoarau — colporter/);
  assert.doesNotMatch(blocs(c.contenu).connu, /Sens moral/);
  assert.match(blocs(c.contenu).secret, /Sens moral : Lucie Hoarau -1 \(réputation -1\)/);
  await executer("survie_acte_moral", avec("survie_acte_moral", { personnages: ["Eddy", "Lucie"], delta: 7, vote: "vote1" }));
  assert.deepEqual(derniers(api), ["acteMoral", { acteurs: ["s2", "s1"], delta: 3, circonstances: false, temoins: true, voteId: "vote1", journal: false }]);
  assert.equal((await executer("survie_acte_moral", avec("survie_acte_moral", { personnages: ["Lucie"] }))).erreur, true, "ni acte ni delta");
});

test("survie_communaute : chef, parole, entente, separer, fusionner, signe (lireSigne), tribut", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  await executer("survie_communaute", avec("survie_communaute", { qui: ["Eddy"] }));
  assert.deepEqual(derniers(api), ["chef", { acteurId: "s2" }]);
  await executer("survie_communaute", avec("survie_communaute", { qui: [] }));
  assert.deepEqual(derniers(api), ["chef", { acteurId: "" }]);
  await executer("survie_communaute", avec("survie_communaute", { action: "parole", oui: false, raison: "promesse oubliée" }));
  assert.deepEqual(derniers(api), ["parole", { tenue: false, raison: "promesse oubliée" }]);
  await executer("survie_communaute", avec("survie_communaute", { action: "entente", delta: -5 }));
  assert.deepEqual(derniers(api), ["entente", { delta: -3, raison: "" }]);
  await executer("survie_communaute", avec("survie_communaute", { action: "separer", qui: ["Eddy"], nom: "Ceux du bas", abri_aux: "partants" }));
  assert.deepEqual(derniers(api), ["separer", { partants: ["s2"], abriVaAux: "partants", nom: "Ceux du bas" }]);
  await executer("survie_communaute", avec("survie_communaute", { action: "fusionner", cible: "Ceux du Maïdo" }));
  assert.deepEqual(derniers(api), ["fusionner", { communauteId: "c1" }]);
  const s = ok(await executer("survie_communaute", avec("survie_communaute", { action: "signe" })), "signe");
  assert.deepEqual(derniers(api), ["lireSigne", {}]);
  assert.match(s.contenu, /Lucie Hoarau y voit un SIGNE \(\+1 moral\) ; Eddy Payet n'y voit rien\. Le jeu ne confirme ni ne dément rien/);
  const t = ok(await executer("survie_communaute", avec("survie_communaute", { action: "tribut", oui: false })), "tribut");
  assert.deepEqual(derniers(api), ["tribut", { tributId: "t1", paye: false }]);
  assert.match(t.contenu, /REFUSÉ : la bande attaquera/);
  assert.equal((await executer("survie_communaute", avec("survie_communaute", { action: "separer" }))).erreur, true, "separer sans partants");
});

test("survie_esprit : lire (public au connu, sens moral et chance au secret), ajuster (variations bornées, religions), tirer", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const l = ok(await executer("survie_esprit", avec("survie_esprit", { personnage: "Lucie" })), "lire");
  const { connu, secret } = blocs(l.contenu);
  for (const m of ["CHEF du groupe (autorité 3/5)", "regard : refaire (bâtir, accueillir)", "foi : Catholique, pratiquant — EN FAUTE", "IL LÂCHE : mange moins",
    "parle moins (−1 dé en parole)", "réputation +2 (bleutée)"]) assert.ok(connu.includes(m), `${m} :\n${connu}`);
  assert.doesNotMatch(connu, /sens moral|chance/);
  assert.match(secret, /sens moral \+3 \(bleutée\), chance 1/);
  await executer("survie_esprit", avec("survie_esprit", { action: "ajuster", personnage: "Lucie", religion: ["Islam", "Catholique"], pratique: "non", ancrage_perdu: "oui", autorite: 9, chance: -1 }));
  assert.deepEqual(derniers(api), ["ajusterEsprit", { acteurId: "s1", religion: "plusieurs", religions: ["islam", "catholique"], pratique: false, ancragePerdu: true, autorite: 5, chance: 0 }]);
  await executer("survie_esprit", avec("survie_esprit", { action: "ajuster", personnage: "Lucie", religion: ["aucune"], ancrage: "La photo des siens" }));
  assert.deepEqual(derniers(api), ["ajusterEsprit", { acteurId: "s1", religion: "aucune", religions: [], ancrage: "photo" }]);
  assert.equal((await executer("survie_esprit", avec("survie_esprit", { action: "ajuster", personnage: "Lucie" }))).erreur, true, "rien à changer");
  const t = ok(await executer("survie_esprit", avec("survie_esprit", { action: "tirer", personnage: "Eddy" })), "tirer");
  assert.deepEqual(derniers(api), ["tirerEsprit", { acteurId: "s2", forcer: false }]);
  assert.match(t.contenu, /Esprit tiré pour Eddy Payet/);
});

test("survie_assaut : une menace du jour réglée (assaut, ecarter, ultimatum : un tribut, rejoindre : on frappe, vraie couleur au secret)", async () => {
  const { api } = installerFenoir({ nouveautes: true });
  const base = { force: 0, type: "", description: "" };
  const a = ok(await executer("survie_assaut", { ...base, menace: "m1", issue: "assaut" }), "assaut");
  assert.deepEqual(derniers(api), ["resoudreMenace", { id: "m1", action: "assaut" }]);
  assert.match(a.contenu, /Assaut \(menace m1, bande, force 4\) : repoussé/);
  const u = ok(await executer("survie_assaut", { ...base, menace: "m1", issue: "ultimatum" }), "ultimatum");
  assert.match(u.contenu, /Ultimatum accepté : tribut t2 à Les Récupérateurs : nourriture 3, carburant 1 tous les 7 jours/);
  const j = ok(await executer("survie_assaut", { ...base, menace: "m1", issue: "rejoindre" }), "rejoindre");
  assert.match(blocs(j.contenu).connu, /Le chef de la bande vient frapper à la porte.*v3 Le Grand Raymond/);
  assert.match(blocs(j.contenu).secret, /Sa vraie couleur : rougeâtre \(sens moral -5\)/);
  assert.match((await executer("survie_assaut", { ...base, menace: "m1", issue: "ecarter" })).contenu, /Menace m1 écartée/);
  assert.equal((await executer("survie_assaut", { ...base, menace: "", issue: "assaut" })).erreur, true, "un assaut libre garde sa force bornée");
});

test("creer_survivant : verrous de l'esprit (regard, religion, religions, pratique, ancrage) ; le tirage dit regard, foi, autorité, la couleur au seul joueur", async () => {
  const { cadre } = installerFenoir({ nouveautes: true });
  const verrous = { nom: "", age: 0, enfance: "", passe: "", traits: [], regard: "vivre", religion: "Plusieurs", religions: ["Islam", "Hindouisme tamoul"], pratique: "non", ancrage: "La photo des siens" };
  game.lakourSurvie.generer = async options => { cadre.generes.push(structuredClone(options));
    return { nom: "Inès", age: 25, competences: { soins: 3, survie: 3, parole: 2, endurance: 2, tir: 2 }, regard: "vivre", religion: "plusieurs", religions: ["islam", "hindouisme-tamoul"],
      pratique: false, ancrage: "", sensMoral: -3, autorite: 1 }; };
  const r = ok(await executer("creer_survivant", { action: "tirer", nombre: 1, verrous, favoriser: [], tirage: "", statut: "joueur", rejoindre: true, nom: "", joueur: "",
    acteur_existant: "", passe: "", competences: [], equipement: [], age: 0, lien: "", description: "" }), "tirer");
  assert.deepEqual(cadre.generes[0].verrous, { regard: "vivre", religion: "plusieurs", religions: ["islam", "hindouisme-tamoul"], pratique: false, ancrage: "photo" });
  assert.match(r.contenu, /esprit : regard vivre \(les petits plaisirs\) ; foi : plusieurs \(Islam, Hindouisme tamoul\) ; autorité 1\/5 ; couleur rougeâtre \(sens moral -3 : À NE DIRE QU'AU JOUEUR CONCERNÉ, en privé/);
});

test("état du jeu : marché, communauté, savoirs au connu ; vérité des rumeurs, vraies couleurs, préjugés, cyclone vécu, menace et son chef au secret", () => {
  installerFenoir({ nouveautes: true });
  const texte = L.contexteSurvie(game.lakourSurvie, { acteur: id => game.actors.get(id) }).join("\n");
  const i = texte.indexOf(SECRET);
  const connu = texte.slice(0, i), secret = texte.slice(i);
  assert.ok(connu.startsWith(CONNU));
  for (const m of ["Communauté : chef Lucie Hoarau (autorité 3/5) ; entente +1 ; réputation +1,5", "À la porte : v1 Maëva Grondin (31 ans, famille, +2 bouches)",
    "Liste à la porte (ce qui manque) : eau 4, médicaments 2", "Tributs : t1 (Les Récupérateurs) nourriture 3 tous les 7 j — DÛ AUJOURD'HUI",
    "Derniers votes : vote1 « Faut-il ouvrir à la famille ? » (accueillir) : 1 pour, 1 contre", "Groupes partis : c1 Ceux du Maïdo",
    "Jour de marché aujourd'hui : Marché forain de Saint-Paul", "Dettes du groupe au carnet : Boutique Chane 4 part(s)", "Ce qui se dit : r1",
    "Savoirs : moderne Premiers secours avancés ; lontan aucun", "Chien errant à Saint-Paul : confiance 1"]) assert.ok(connu.includes(m), `${m} :\n${connu}`);
  sansSecret(connu, "état du jeu");
  assert.doesNotMatch(connu, /rouge|FAUSSE|Cyclone vécu|Préjugés|son chef veut|Couleur/);
  for (const m of ["Vraie couleur à la porte : v1 rouge (-7)", "Couleur réelle du groupe : rougeâtre (-2,5)", "Vérité des rumeurs : r1 FAUSSE, malveillante, de AUTEUR-SECRET",
    "Préjugés des PNJ présents", "Madame Chane : Zoreils [zoreils] (poids 2) : « PREJUGE-SECRET", "Cyclone vécu à Saint-Paul (jour 3), malus dehors : matin rafales (dés -2, vigilance -3, discrétion +2)",
    "m1 [bande ; force 4 ; son chef veut : ULTIMATUM"]) assert.ok(secret.includes(m), `${m} :\n${secret}`);
  assert.ok(!texte.includes("Préjugé tombé"), "un préjugé tombé n'est plus dit");
  // Coffre fermé : rien du monde (vraie couleur, vérité des rumeurs), ni le cyclone vécu (api.cyclone() : MJ actif, monde ouvert).
  installerFenoir({ nouveautes: true, mondeOuvert: false });
  const ferme = L.contexteSurvie(game.lakourSurvie, { acteur: id => game.actors.get(id) }).join("\n");
  assert.doesNotMatch(ferme, /AUTEUR-SECRET|Vraie couleur|Cyclone vécu/);
});

test("un compagnon IA ne reçoit jamais le secret : ni sens moral, ni chance, ni préjugés, ni vérité des rumeurs ; le narrateur, si", () => {
  const { acteurs } = installerFenoir({ nouveautes: true });
  acteurs.get("s2").system.prejuges = [{ cible: "zoreils", poids: 2, dit: "PREJUGE-SECRET : les zoreils i koné pa." }];
  Object.assign(acteurs.get("s2").system, { regard: "vivre", religion: "islam", sensMoral: -4, esprit: { chance: 2 } });
  const vue = JSON.stringify(vueAventure(acteurs.get("s2"), { messages: [] }));
  for (const m of [...MARQUEURS_SECRETS, "sens moral", "chance 2", "préjugés", SECRET]) assert.ok(!vue.includes(m), `vue du compagnon : « ${m} »`);
  assert.match(vue, /regard : vivre/, "son esprit public, il le sait");
  const narrateur = adaptateur().resumer(acteurs.get("s2"), { secret: true });
  assert.match(narrateur, /\[secret MJ\] sens moral -4 \(rougeâtre\), chance 2.*PREJUGE-SECRET/);
  assert.ok(!adaptateur().resumer(acteurs.get("s2")).includes(SECRET), "sans secret : rien du secret");
  assert.match(adaptateur().resumer(acteurs.get("s1")), /CHEF du groupe/);
});

test("consignes du narrateur de Fénoir : préjugés éveillés par lui, jamais d'après une origine ; pas de miracle ; « un matin, il n'est plus là » ; voix des compagnons", () => {
  const c = adaptateur().consignes;
  assert.match(c, /c'est toi qui dis lesquels s'éveillent \(cibles\), d'après la façon dont le PNJ voit le groupe.*JAMAIS d'après une origine/s);
  assert.match(c, /puis laisse les faits les démentir/);
  assert.match(c, /JAMAIS de miracle/);
  assert.match(c, /« un matin, il n'est plus là », aucune scène de suicide/);
  assert.match(c, /ne vivent que dans la bouche des personnages/);
  assert.match(c, /les compagnons IA peuvent donner leur voix dans un vote/);
});
