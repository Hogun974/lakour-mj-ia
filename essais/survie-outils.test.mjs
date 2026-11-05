// Fénoir (système lakour-survie) : les outils survie_* et creer_survivant du MJ IA. Pour chacun : les arguments passés à l'API du
// système (§5 du contrat), le refus hors du MJ actif (rien d'écrit en douce, message clair), le texte rendu à l'IA en deux blocs
// « [connu des joueurs] » / « [secret MJ] », le secret jamais dans le premier. Liste des outils proposés à Fénoir.
// Doublure de game.lakourSurvie (essais/doublures/foundry-survie.mjs), aucun réseau, aucune IA.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installerFenoir, MARQUEURS_SECRETS } from "./doublures/foundry-survie.mjs";

installerFenoir();
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { validerSchema } = await import("../scripts/schema.js");
const { CONNU, SECRET, resoudreTransport, proprietesVehicule, ligneTransport, vehiculesDu } = await import("../scripts/survie-logique.js");

// Exécute un outil après avoir vérifié ses arguments contre son schéma strict (comme le moteur).
async function executer(nom, args) {
  const o = OUTILS.find(x => x.nom === nom);
  assert.ok(o, `outil absent : ${nom}`);
  assert.deepEqual(validerSchema(o.schema, args), [], `${nom} : arguments hors schéma`);
  return o.executer(args);
}
// Le texte rendu : bloc connu, bloc secret.
function blocs(texte) {
  const i = texte.indexOf(SECRET);
  return { connu: i < 0 ? texte : texte.slice(0, i), secret: i < 0 ? "" : texte.slice(i) };
}
const sansSecret = (texte, quoi) => { for (const m of MARQUEURS_SECRETS) assert.ok(!texte.includes(m), `${quoi} : « ${m} » hors du bloc secret\n${texte}`); };
const derniersArgs = api => api.appels.at(-1);
const ZERO = { eau: 0, nourriture: 0, carburant: 0, medicaments: 0, munitions: 0, materiaux: 0, pieces: 0, graines: 0, energie: 0 };

const NOMS = ["survie_etat", "survie_demarrer", "survie_avancer", "survie_test", "survie_explorer", "survie_fouiller", "survie_installer",
  "survie_construire", "survie_voyager", "survie_demenager", "survie_ajuster", "survie_blessure", "survie_marquer", "survie_assaut",
  "survie_rencontre", "survie_renseigner", "survie_bilan", "survie_fabriquer", "survie_affliction", "survie_feter", "creer_survivant", "survie_besoins", "survie_recrue", "survie_assigner", "survie_ajouter_membre"];

test("outils proposés à Fénoir : les survie_*, demander_jet, lancer_des, compagnons, horloges ; ni loups_*, ni xp, ni tour par tour", () => {
  const ici = new Set(outilsDuSysteme("lakour-survie").map(o => o.nom));
  for (const n of [...NOMS, "demander_jet", "lancer_des", "compagnon_ajouter", "compagnon_retirer", "compagnons", "jet_compagnon", "horloge",
    "noter_memoire", "message_prive", "vote_groupe", "choix_secret", "creer_pnj", "mettre_en_scene"]) assert.ok(ici.has(n), `absent de Fénoir : ${n}`);
  for (const n of ["loups_nuit", "donner_xp", "bourse", "combat_etat", "passer_tour", "creer_personnage", "calendrier", "demander_des"]) {
    assert.ok(!ici.has(n), `proposé à Fénoir à tort : ${n}`);
  }
  for (const s of ["impmal", "dnd5e", "lakour-loups"]) {
    const ailleurs = new Set(outilsDuSysteme(s).map(o => o.nom));
    for (const n of NOMS) assert.ok(!ailleurs.has(n), `${n} proposé en ${s}`);
  }
  for (const n of NOMS) assert.deepEqual(OUTILS.find(o => o.nom === n).systemes, ["lakour-survie"]);
});

test("survie_etat : connu (moment, abri, stocks, membres, renseignements datés) puis secret (réel, hordes proches, cyclone)", async () => {
  installerFenoir();
  const r = await executer("survie_etat", { region: "" });
  assert.ok(!r.erreur, r.contenu);
  const { connu, secret } = blocs(r.contenu);
  assert.ok(connu.startsWith(CONNU));
  for (const m of ["jour 3", "après-midi", "Collège des Hauts", "eau 12", "Lucie Hoarau", "Le Port et La Possession (par radio, il y a 2 j)", "Chronique récente"]) {
    assert.ok(connu.includes(m), `${m} absent du connu`);
  }
  sansSecret(connu, "survie_etat");
  for (const m of ["HORDE-SECRETE", "CYCLONE-SECRET", "faction-secrete"]) assert.ok(secret.includes(m), `${m} absent du secret`);
  assert.ok(!secret.includes("HORDE-LOINTAINE"), "une horde à 3 régions n'est pas « proche »");
  const zoom = await executer("survie_etat", { region: "Le Port" });
  assert.match(blocs(zoom.contenu).connu, /Le Port et La Possession \(littoral, 10 m\)/);
  assert.match(blocs(zoom.contenu).secret, /infestation 4,2\/5/);
  assert.match(blocs(zoom.contenu).secret, /HORDE-SECRETE/);
  sansSecret(blocs(zoom.contenu).connu, "survie_etat région");
  const inconnue = await executer("survie_etat", { region: "Mordor" });
  assert.equal(inconnue.erreur, true);
  assert.match(inconnue.contenu, /« Mordor » introuvable dans le contenu de Fénoir \(régions : saint-paul/);
});

test("survie_etat : coffre fermé -> pas de réel, l'IA ne doit pas deviner", async () => {
  installerFenoir({ mondeOuvert: false });
  const r = await executer("survie_etat", { region: "" });
  assert.match(r.contenu, /Monde réel indisponible/);
  sansSecret(r.contenu, "coffre fermé");
});

test("survie_demarrer : région et membres résolus par nom, date facultative, graine jamais transmise (le système tire une graine sûre) ; date illisible refusée", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_demarrer", { region: "Saint-Denis", membres: ["Lucie Hoarau"], pnj: [{ nom: "Tantine Josette", passe: "retraitee" }],
    date_depart: "2026-12-04" });
  assert.ok(!r.erreur, r.contenu);
  assert.deepEqual(derniersArgs(api), ["demarrer", { region: "saint-denis", membres: ["s1"], dateDepart: "2026-12-04", pnj: [{ nom: "Tantine Josette", passe: "retraitee" }] }]);
  await executer("survie_demarrer", { region: "saint-paul", membres: [], pnj: [], date_depart: "" });
  assert.deepEqual(derniersArgs(api)[1], { region: "saint-paul", membres: ["s1", "s2"] }, "vide = joueurs et compagnons ; jamais de graine");
  assert.equal("graine" in (OUTILS.find(o => o.nom === "survie_demarrer")?.schema?.properties ?? {}), false, "l'IA ne choisit pas la graine");
  assert.match((await executer("survie_demarrer", { region: "saint-paul", membres: [], pnj: [], date_depart: "4 décembre" })).contenu, /date_depart illisible/);
});

test("survie_avancer : quarts bornés ; faits publics au connu, hors-champ depuis le dernier jour au secret", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_avancer", { quarts: 4, raison: "monter la garde et dormir" });
  assert.deepEqual(derniersArgs(api), ["avancer", { quarts: 4, raison: "monter la garde et dormir" }]);
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /4 quart\(s\) passent .* jour 4/);
  assert.match(connu, /Une fumée noire monte du Port/);
  assert.match(connu, /Alerte orange cyclonique/);
  assert.match(connu, /Départs : Eddy Payet/);
  sansSecret(connu, "survie_avancer");
  assert.match(secret, /JOURNAL-SECRET-NOUVEAU/);
  assert.ok(!secret.includes("JOURNAL-SECRET-ANCIEN"), "seulement depuis le jour d'avant l'avance");
  for (const q of [0, 29]) assert.equal((await executer("survie_avancer", { quarts: q, raison: "" })).erreur, true);
});

test("survie_test : difficulté du système (facile = normale +1 dé), bonus, malus, forcer, compte ; texte au connu", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_test", { personnage: "Eddy", competence: "bricolage", difficulte: "facile", bonus: 1, malus: 2, forcer: true, compte: true, raison: "réparer la pompe" });
  assert.deepEqual(derniersArgs(api), ["test", { acteurId: "s2", competence: "bricolage", difficulte: "normale", bonus: 2, malus: 2, forcer: true, titre: "réparer la pompe", compte: true }]);
  assert.match(r.contenu, /Eddy Payet, Bricolage \(normale\) : 2 succès pour 1 requis — réussite \(marge \+1\), forcé\./);
  const x = await executer("survie_test", { personnage: "Lucie", competence: "soins", difficulte: "extreme", bonus: 0, malus: 0, forcer: false, compte: true, raison: "" });
  assert.match(x.contenu, /échec \(marge -1\) ; une marque gagnée/);
  assert.equal((await executer("survie_test", { personnage: "Personne", competence: "soins", difficulte: "normale", bonus: 0, malus: 0, forcer: false, compte: false, raison: "" })).erreur, true);
});

test("survie_explorer : renseignement daté au connu ; rencontre, réel et faits cachés au secret", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_explorer", { region: "le port", membres: ["Lucie Hoarau"], quarts: 0 });
  assert.deepEqual(derniersArgs(api), ["explorer", { region: "le-port", membres: ["s1"], quarts: 1 }]);
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /Le Port et La Possession \(vu, aujourd'hui\) : infestation dense, pillage maigre, électricité coupée, eau courante là/);
  assert.match(connu, /Des sirènes au loin/);
  sansSecret(connu, "survie_explorer");
  for (const m of ["RENCONTRE-SECRETE", "FAIT-SECRET", "infestation 4,2/5"]) assert.ok(secret.includes(m), m);
});

test("survie_fouiller : site, cible, prudence ; butin et bruit au connu", async () => {
  const { api } = installerFenoir();
  // La nature alentour (§2.1) est une cible comme une autre : passée telle quelle au système.
  await executer("survie_fouiller", { region: "", site: "", cible: "peche", membres: ["Eddy"], quarts: 0, prudence: "normal" });
  assert.deepEqual(derniersArgs(api), ["fouiller", { region: "saint-paul", cible: "peche", membres: ["s2"], quarts: 1, prudence: "normal" }]);
  const r = await executer("survie_fouiller", { region: "", site: "Case créole du lagon", cible: "medicaments", membres: [], quarts: 1, prudence: "discret" });
  assert.deepEqual(derniersArgs(api), ["fouiller", { region: "saint-paul", site: "case-du-lagon", cible: "medicaments", membres: ["s1", "s2"], quarts: 1, prudence: "discret" }]);
  assert.match(blocs(r.contenu).connu, /Butin : nourriture 3, médicaments 1\./);
  sansSecret(blocs(r.contenu).connu, "survie_fouiller");
  assert.match((await executer("survie_fouiller", { region: "", site: "Tour Eiffel", cible: "", membres: [], quarts: 1, prudence: "normal" })).contenu, /« Tour Eiffel » introuvable.*\(sites :/);
});

test("survie_installer : site du contenu, abri abandonné repris par son nom", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_installer", { site: "college-hauts-saint-paul", abri_abandonne: "" });
  assert.deepEqual(derniersArgs(api), ["installer", { site: "college-hauts-saint-paul" }]);
  assert.match(r.contenu, /Déjà là : Palissade 1\./);
  await executer("survie_installer", { site: "case-du-lagon", abri_abandonne: "Bellemène" });
  assert.deepEqual(derniersArgs(api), ["installer", { site: "case-du-lagon", abriId: "abri0" }]);
  assert.equal((await executer("survie_installer", { site: "case-du-lagon", abri_abandonne: "Château" })).erreur, true);
});

test("survie_construire : construire par clé ou nom, plans signalés ; réparer une installation de l'abri par son nom", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_construire", { action: "construire", installation: "Citerne de pluie", membres: ["Eddy Payet"], quarts: 2 });
  assert.deepEqual(derniersArgs(api), ["construire", { installation: "citerne", membres: ["s2"], quarts: 2 }]);
  assert.match(r.contenu, /ils en ont déjà les plans/);
  assert.match(r.contenu, /Chantier : 2\/6 quarts-personne/);
  await executer("survie_construire", { action: "reparer", installation: "palissade", membres: [], quarts: 1 });
  assert.deepEqual(derniersArgs(api), ["reparer", { installationId: "i1", membres: ["s1", "s2"], quarts: 1 }]);
  // Sans installation : les dégâts de l'abri lui-même (après un assaut).
  const abri = await executer("survie_construire", { action: "reparer", installation: "", membres: ["Eddy"], quarts: 2 });
  assert.deepEqual(derniersArgs(api), ["reparer", { membres: ["s2"], quarts: 2 }]);
  assert.match(abri.contenu, /réparent l'abri Collège des Hauts \(2 quart\(s\)\).*Dégâts restants de l'abri : 1/s);
  assert.match((await executer("survie_construire", { action: "reparer", installation: "serre", membres: [], quarts: 1 })).contenu, /installation introuvable dans l'abri/);
});

test("survie_voyager : seulement vers une voisine ; route réelle et destination réelle au secret", async () => {
  const { api } = installerFenoir();
  const loin = await executer("survie_voyager", { vers: "Saint-Denis", transport: "pied", membres: [], charge: 0 });
  assert.equal(loin.erreur, true);
  assert.match(loin.contenu, /pas voisine/);
  const r = await executer("survie_voyager", { vers: "le-port", transport: "vehicule", membres: [], charge: 3 });
  assert.deepEqual(derniersArgs(api), ["voyager", { vers: "le-port", transport: "vehicule", membres: ["s1", "s2"], charge: 3 }]);
  const { connu, secret } = blocs(r.contenu);
  assert.match(connu, /arrivent à Le Port et La Possession après 2 quart/);
  assert.match(connu, /Provisions qui ont manqué en route : eau 1/);
  assert.match(connu, /Transport : vehicule ; carburant consommé : 1 ; bruit 2 \(rencontres en route \+20 %/, "véhicule générique : bruit 2");
  sansSecret(connu, "survie_voyager");
  assert.match(secret, /Route réelle au départ : coupee/);
  assert.ok(secret.includes("RENCONTRE-SECRETE-1") && secret.includes("RENCONTRE-SECRETE-2"), "une rencontre par étape du voyage");
});

test("survie_voyager : un véhicule du contenu par clé ou nom (clé passée à l'API), carburant consommé et bruit ; qui l'a, au secret", async () => {
  const { api, acteurs } = installerFenoir();
  let r = await executer("survie_voyager", { vers: "le-port", transport: "Scooter", membres: [], charge: 0 });
  assert.ok(!r.erreur, r.contenu);
  assert.deepEqual(derniersArgs(api), ["voyager", { vers: "le-port", transport: "scooter", membres: ["s1", "s2"], charge: 0 }]);
  let b = blocs(r.contenu);
  assert.match(b.connu, /Transport : Scooter ; carburant consommé : 1 ; bruit 1 \(rencontres en route \+10 %/);
  assert.match(b.secret, /Véhicule : Scooter \(scooter ; route, piste ; charge 4 ; 2 place\(s\) ; carburant 0,25\/quart ; bruit 1\) ; aucune fiche du groupe ne l'a/);
  sansSecret(b.connu, "survie_voyager véhicule");
  // Eddy a le 4×4 sur sa fiche : « porté par ».
  acteurs.get("s2").items.push({ type: "equipement", name: "4×4", system: { cle: "quatre-quatre" } });
  r = await executer("survie_voyager", { vers: "saint-paul", transport: "4x4", membres: ["Eddy"], charge: 10 });
  assert.equal(derniersArgs(api)[1].transport, "quatre-quatre", "« 4x4 » trouve le 4×4");
  b = blocs(r.contenu);
  assert.match(b.connu, /Transport : 4×4 ; carburant consommé : 4 ; bruit 1/);
  assert.match(b.secret, /porté par Eddy Payet/);
  // Une monture : sans carburant.
  r = await executer("survie_voyager", { vers: "le-port", transport: "ane", membres: [], charge: 0 });
  assert.match(blocs(r.contenu).connu, /Transport : Âne de bât \(monture\) ; carburant consommé : 0 ; bruit 1/);
  // À pied (vide = à pied) : silencieux.
  r = await executer("survie_voyager", { vers: "saint-paul", transport: "", membres: [], charge: 0 });
  assert.equal(derniersArgs(api)[1].transport, "pied");
  assert.match(r.contenu, /Transport : à pied ; carburant consommé : 0 ; bruit 0 \(silencieux\)/);
  // Inconnu, ou un équipement qui ne transporte pas : refusé, la liste des véhicules donnée, rien d'appelé.
  const avant = api.appels.length;
  for (const t of ["fusée", "Machette"]) {
    const x = await executer("survie_voyager", { vers: "le-port", transport: t, membres: [], charge: 0 });
    assert.equal(x.erreur, true);
    assert.match(x.contenu, new RegExp(`transport « ${t} » inconnu : pied, vehicule, bateau, ou un véhicule du contenu \\(scooter \\(Scooter\\), quatre-quatre \\(4×4\\), voiture`));
  }
  assert.equal(api.appels.length, avant);
});

test("survie_demenager : site, transport, seulement ce qu'on emporte ; un véhicule (clé ou nom) : sa charge, son carburant, son bruit", async () => {
  const { api } = installerFenoir();
  let r = await executer("survie_demenager", { site: "case-du-lagon", transport: "pied", emporter: { ...ZERO, eau: 4, nourriture: 3 } });
  assert.deepEqual(derniersArgs(api), ["demenager", { site: "case-du-lagon", emporter: { eau: 4, nourriture: 3 }, transport: "pied" }]);
  assert.match(r.contenu, /en emportant eau 4, nourriture 2/, "ce que le système a pris (à pied : 3 par personne), pas ce qui était demandé");
  assert.match(r.contenu, /Transport : à pied ; carburant consommé : 0 ; bruit 0/);
  r = await executer("survie_demenager", { site: "case-du-lagon", transport: "Voiture", emporter: { ...ZERO, eau: 10, nourriture: 10 } });
  assert.equal(derniersArgs(api)[1].transport, "voiture", "« Voiture » : le véhicule du contenu, pas le générique");
  assert.match(r.contenu, /en emportant eau 10, nourriture 5/, "ce que le système a pris (charge 15), pas ce qui était demandé");
  assert.match(r.contenu, /Transport : Voiture ; carburant consommé : 2 ; bruit 2 \(rencontres en route \+20 %/, "carburant calculé : 2 quarts × 1");
  assert.match(blocs(r.contenu).secret, /Véhicule : Voiture/);
});

test("transport (logique pure) : génériques d'abord, véhicule par clé ou nom, forme brute du contenu lue aussi", () => {
  const contenu = { equipements: [{ cle: "couteau", nom: "Couteau" },
    { cle: "barque-a-moteur", nom: "Barque à moteur", categorie: "transport", bruit: 0,
      transport: { mode: "bateau", places: 4, chargeMax: 20, carburantParQuart: 1, terrains: ["mer"], bruit: 2 } }] };
  assert.deepEqual(resoudreTransport(contenu, "À pied"), { transport: "pied", vehicule: null });
  assert.deepEqual(resoudreTransport(contenu, "véhicule"), { transport: "vehicule", vehicule: null });
  assert.equal(resoudreTransport(contenu, "couteau"), null);
  assert.deepEqual(vehiculesDu(contenu).map(v => v.cle), ["barque-a-moteur"]);
  const t = resoudreTransport(contenu, "barque a moteur");
  assert.equal(t.transport, "barque-a-moteur");
  assert.deepEqual(t.vehicule, { cle: "barque-a-moteur", nom: "Barque à moteur", mode: "bateau", terrains: ["mer"], charge: 20, places: 4,
    carburantParQuart: 1, bruit: 2, moteur: true });
  assert.deepEqual(proprietesVehicule({ cle: "ane", nom: "Âne", type: "monture", terrains: ["sentier"], charge: 8, carburantParQuart: 0, bruit: 1 }).mode, "monture");
  assert.equal(ligneTransport(t, { quarts: 3 }), "Transport : Barque à moteur ; carburant consommé : 3 ; bruit 2 (rencontres en route +20 %, ça s'entend de loin).");
  assert.match(ligneTransport(t, { quarts: 3, carburant: 5, bruit: 4 }), /carburant consommé : 5 ; bruit 4/, "ce que l'API rend passe devant le calcul");
  assert.match(ligneTransport({ transport: "vehicule", vehicule: null }, {}), /carburant consommé : \? ; bruit 2/);
});

test("survie_ajuster : variations non nulles seulement ; un état sans personnage ou rien à changer est refusé", async () => {
  const { api } = installerFenoir();
  await executer("survie_ajuster", { stocks: { ...ZERO, nourriture: -2 }, personnage: "Lucie", etat: { blessures: 0, fatigue: 1, moral: -1, faim: 0, soif: 0 }, raison: "repas de Noël" });
  assert.deepEqual(derniersArgs(api), ["ajuster", { stocks: { nourriture: -2 }, acteurId: "s1", etat: { fatigue: 1, moral: -1 }, raison: "repas de Noël" }]);
  const etat0 = { blessures: 0, fatigue: 0, moral: 0, faim: 0, soif: 0 };
  assert.match((await executer("survie_ajuster", { stocks: ZERO, personnage: "", etat: etat0, raison: "" })).contenu, /rien à changer/);
  assert.match((await executer("survie_ajuster", { stocks: ZERO, personnage: "", etat: { ...etat0, moral: 1 }, raison: "" })).contenu, /demande un personnage/);
});

test("survie_blessure : blesser (morsure -> rappel du test de soins extrême), soigner, infecter", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_blessure", { action: "blesser", personnage: "Eddy", n: 1, morsure: true, soigneur: "" });
  assert.deepEqual(derniersArgs(api), ["blesser", { acteurId: "s2", n: 1, morsure: true }]);
  assert.match(r.contenu, /MORSURE : test de soins EXTRÊME/);
  const s = await executer("survie_blessure", { action: "soigner", personnage: "Eddy", n: 0, morsure: false, soigneur: "Lucie" });
  assert.deepEqual(derniersArgs(api), ["soigner", { acteurId: "s2", soigneurId: "s1" }]);
  assert.match(s.contenu, /Lucie Hoarau, Soins : 2 succès pour 1 requis — réussite \(marge \+1\)\. 1 blessure\(s\) soignée\(s\), un médicament consommé\./);
  // Sans soigneur nommé : le système choisit le meilleur (l'outil ne refuse pas), et nomme celui qui a fait le test.
  const auto = await executer("survie_blessure", { action: "soigner", personnage: "Eddy", n: 0, morsure: false, soigneur: "" });
  assert.deepEqual(derniersArgs(api), ["soigner", { acteurId: "s2" }]);
  assert.match(auto.contenu, /Lucie Hoarau, Soins : 2 succès/);
  const i = await executer("survie_blessure", { action: "infecter", personnage: "Eddy", n: 0, morsure: false, soigneur: "" });
  assert.deepEqual(derniersArgs(api), ["infecter", { acteurId: "s2" }]);
  assert.match(i.contenu, /Aucun remède connu/);
});

test("survie_marquer, survie_assaut (force bornée, blessés nommés), survie_rencontre (au secret), survie_bilan", async () => {
  const { api } = installerFenoir();
  assert.match((await executer("survie_marquer", { personnage: "Lucie", competence: "soins", raison: "l'accouchement" })).contenu, /soins : niveau 3, 2 marque/);
  assert.deepEqual(derniersArgs(api), ["marquer", { acteurId: "s1", competence: "soins" }]);
  const a = await executer("survie_assaut", { force: 6, type: "horde", description: "La horde du Port déferle." });
  assert.deepEqual(derniersArgs(api), ["assaut", { force: 6, type: "horde", description: "La horde du Port déferle." }]);
  assert.match(a.contenu, /installation endommagée \(marge -1\)/);
  assert.match(a.contenu, /Blessés : Lucie Hoarau/);
  assert.equal((await executer("survie_assaut", { force: 0, type: "", description: "" })).erreur, true);
  const r = await executer("survie_rencontre", { region: "", type: "humains" });
  assert.deepEqual(derniersArgs(api), ["rencontre", { region: "saint-paul", type: "humains" }]);
  assert.ok(!r.contenu.includes(CONNU) && r.contenu.startsWith(SECRET), "une rencontre tirée est pour le MJ seul");
  const b = await executer("survie_bilan", {});
  assert.match(b.contenu, /net : eau -2, nourriture -3/);
  assert.match(b.contenu, /Jours de stocks : eau 4, nourriture 3/);
});

test("survie_renseigner : ce que le groupe croit, daté du jour ; routes par nom ; valeurs vides inchangées", async () => {
  const { api } = installerFenoir();
  const r = await executer("survie_renseigner", { region: "Hauts de l'Ouest", source: "rumeur", infestation: "calme", pillage: "", electricite: "non", eau: "",
    routes: [{ vers: "Saint-Paul", etat: "difficile" }], factions: [], notes: "Un éboulement sur la route du Maïdo." });
  assert.deepEqual(derniersArgs(api), ["renseigner", { region: "hauts-ouest", source: "rumeur", vu: 3, infestation: "calme", electricite: false,
    routes: { "saint-paul": "difficile" }, notes: "Un éboulement sur la route du Maïdo." }]);
  assert.match(r.contenu, /Hauts de l'Ouest \(rumeur, aujourd'hui\) : infestation calme, électricité coupée, routes : Saint-Paul difficile/);
});

test("survie_fabriquer, survie_affliction, survie_feter (§9) : arguments supposés de l'API, textes", async () => {
  const { api, cadre } = installerFenoir();
  const f = await executer("survie_fabriquer", { recette: "Arc et flèches", artisan: "Eddy", membres: ["Lucie", "Eddy"] });
  assert.deepEqual(derniersArgs(api), ["fabriquer", { recette: "arc-et-fleches", acteurId: "s2", membres: ["s2", "s1"] }],
    "l'API compte bras = membres.length : l'artisan ET ses aides, l'artisan une seule fois");
  assert.ok(f.contenu.includes("Eddy Payet (aidé de Lucie Hoarau) travaille à Arc et flèches"), f.contenu);
  assert.ok(f.contenu.includes("Fabriqué : equipement arc-et-fleches, n 1."), f.contenu);
  await executer("survie_fabriquer", { recette: "filtre-portatif", artisan: "Eddy", membres: [] });
  assert.deepEqual(derniersArgs(api)[1].membres, ["s2"], "seul : un bras, le sien");
  assert.ok((await executer("survie_fabriquer", { recette: "fusée", artisan: "Eddy", membres: [] })).contenu.includes("« fusée » introuvable dans le contenu de Fénoir (recettes :"));
  const a = await executer("survie_affliction", { action: "donner", personnage: "Lucie", affliction: "Leptospirose" });
  assert.deepEqual(derniersArgs(api), ["affliction", { acteurId: "s1", cle: "leptospirose", action: "donner" }]);
  assert.ok(a.contenu.includes("Lucie Hoarau est atteint(e) : Leptospirose."), a.contenu);
  assert.match((await executer("survie_affliction", { action: "soigner", personnage: "Lucie", affliction: "fracture" })).contenu, /Fracture soigné/);
  // Fête vide : c'est le SYSTÈME qui la trouve, à la date de jeu (jamais la fête du calendrier réel des joueurs, fetes.js).
  game.modules.set("lakour-mj-ia", { api: { fetes: { active: () => ({ id: "halloween-fenoir", fete: "halloween" }) } } });
  const t = await executer("survie_feter", { fete: "" });
  assert.deepEqual(derniersArgs(api), ["feter", { fete: "" }], "vide : le système cherche la fête du jour de jeu");
  assert.ok(t.contenu.includes("Le groupe fête noel au camp") && t.contenu.includes("Moral +1 pour chacun"), t.contenu);
  await executer("survie_feter", { fete: "liberte" });
  assert.deepEqual(derniersArgs(api), ["feter", { fete: "liberte" }]);
  cadre.feteDuJour = "";
  const sans = await executer("survie_feter", { fete: "" });
  assert.equal(sans.erreur, true);
  assert.match(sans.contenu, /AucuneFete/);
});

test("hors du MJ actif : chaque outil qui écrit est refusé avec le message du système, et le dit à l'IA", async () => {
  installerFenoir({ mjActif: false });
  const essais = {
    survie_avancer: { quarts: 1, raison: "" },
    survie_test: { personnage: "Lucie", competence: "soins", difficulte: "normale", bonus: 0, malus: 0, forcer: false, compte: false, raison: "" },
    survie_explorer: { region: "", membres: [], quarts: 1 },
    survie_fouiller: { region: "", site: "", cible: "", membres: [], quarts: 1, prudence: "normal" },
    survie_installer: { site: "case-du-lagon", abri_abandonne: "" },
    survie_construire: { action: "construire", installation: "potager", membres: [], quarts: 1 },
    survie_voyager: { vers: "le-port", transport: "pied", membres: [], charge: 0 },
    survie_demenager: { site: "case-du-lagon", transport: "pied", emporter: ZERO },
    survie_ajuster: { stocks: { ...ZERO, eau: 1 }, personnage: "", etat: { blessures: 0, fatigue: 0, moral: 0, faim: 0, soif: 0 }, raison: "" },
    survie_blessure: { action: "blesser", personnage: "Lucie", n: 1, morsure: false, soigneur: "" },
    survie_marquer: { personnage: "Lucie", competence: "soins", raison: "" },
    survie_assaut: { force: 3, type: "chiens", description: "" },
    survie_renseigner: { region: "le-port", source: "radio", infestation: "", pillage: "", electricite: "", eau: "", routes: [], factions: [], notes: "x" },
    survie_demarrer: { region: "saint-paul", membres: [], pnj: [], date_depart: "" },
    survie_fabriquer: { recette: "filtre-portatif", artisan: "Eddy", membres: [] },
    survie_affliction: { action: "donner", personnage: "Lucie", affliction: "fracture" },
    survie_feter: { fete: "liberte" },
    survie_recrue: { action: "generer", region: "", recrue: "", parleur: "", attitude: "" },
    survie_assigner: { personnage: "Eddy", tache: "garde", repartir: false },
    survie_ajouter_membre: { personnage: "Bellemène", statut: "pnj" }
  };
  for (const [nom, args] of Object.entries(essais)) {
    const r = await executer(nom, args);
    assert.equal(r.erreur, true, `${nom} accepté hors du MJ actif`);
    assert.match(r.contenu, new RegExp(`^${nom} : Seul le MJ actif peut faire cela\\. \\(LAKOUR_SURVIE\\.Erreurs\\.PasMJActif\\).*rien n'a changé`), nom);
  }
});

test("système absent ou fonction absente : refus clair, jamais une exception", async () => {
  installerFenoir({ avecApi: false });
  const r = await executer("survie_bilan", {});
  assert.equal(r.erreur, true);
  assert.match(r.contenu, /survie_bilan : Le système lakour-survie n'est pas chargé/);
  installerFenoir();
  delete game.lakourSurvie.assaut;
  assert.match((await executer("survie_assaut", { force: 2, type: "", description: "" })).contenu, /ne fournit pas game\.lakourSurvie\.assaut\(\)/);
});

// creer_survivant : arguments complets (schéma strict), pour les essais.
const CREER = { action: "creer", nombre: 0, verrous: { nom: "", age: 0, enfance: "", passe: "", traits: [] }, favoriser: [], tirage: "", statut: "joueur",
  rejoindre: true, nom: "", joueur: "", acteur_existant: "", passe: "", competences: [], equipement: [], age: 0, lien: "", description: "" };

test("creer_survivant, tirer : trois tirages du générateur, verrous résolus, hors budget relancé, résumés pour le joueur", async () => {
  const { cadre } = installerFenoir();
  const r = await executer("creer_survivant", { ...CREER, action: "tirer", verrous: { nom: "", age: 0, enfance: "Gamin du Port", passe: "", traits: ["Main verte"] },
    favoriser: ["soins"] });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(cadre.generes.length, 4, "le premier tirage, hors budget (17), est relancé");
  assert.deepEqual(cadre.generes[0], { verrous: { enfance: "gamin-du-port", traits: ["main-verte"] }, statut: "joueur", region: "saint-paul", favoriser: { soins: 2 } });
  assert.match(r.contenu, /gardés : enfance, traits/);
  assert.match(r.contenu, /\nA — Tiré 2, 22 ans — enfance : Gamin du Port ; passé : Infirmière — soins 3 \(PASSION\), survie 3 \(intérêt\)/);
  assert.match(r.contenu, /\(somme 11\) — traits : Main verte — INCAPABLE de : violence — sur lui : Trousse de secours — histoire : Elle a perdu sa sœur/);
  assert.match(r.contenu, /\nC — Tiré 4/);
});

test("creer_survivant, creer : par l'API creerSurvivant (tirage choisi, ajustements, savoirs et équipement par clé, graine, jeton), confié, au groupe", async () => {
  const { acteurs, api, cadre } = installerFenoir();
  await executer("creer_survivant", { ...CREER, action: "tirer", nombre: 2 });
  const inconnu = await executer("creer_survivant", { ...CREER, tirage: "C", nom: "X" });
  assert.match(inconnu.contenu, /tirage « C » inconnu \(tirages : A, B\)/);
  const r = await executer("creer_survivant", { ...CREER, tirage: "b", nom: "Aurélie Grondin", joueur: "Jordan",
    competences: [{ competence: "endurance", niveau: 1 }], equipement: ["machette"], lien: "la cousine de Lucie" });
  assert.ok(!r.erreur, r.contenu);
  const a = acteurs.find(x => x.name === "Aurélie Grondin");
  assert.equal(a.type, "survivant");
  assert.equal(a.system.statut, "joueur");
  assert.equal(a.system.enfance, "gamin-du-port");
  assert.deepEqual(a.system.passions, { soins: 2, survie: 1 });
  assert.deepEqual(a.system.incapacites, ["violence"]);
  assert.equal(a.system.competences.soins.niveau, 3);
  assert.equal(a.system.competences.endurance.niveau, 1, "ajustement");
  assert.equal(a.system.age, 23);
  assert.equal(a.flags["lakour-mj-ia"].graineHistoire, "Elle a perdu sa sœur sur la route du Littoral.");
  assert.deepEqual(a.items.map(i => i.name).sort(), ["Machette", "Premiers secours avancés", "Trousse de secours"]);
  assert.deepEqual(a.ownership, { default: 0, u1: 3 });
  const [nom, args] = derniersArgs(api);
  assert.equal(nom, "creerSurvivant");
  assert.equal(args.userId, "u1");
  assert.equal(args.rejoindre, true);
  assert.equal(args.statut, "joueur");
  assert.deepEqual(args.donnees.savoirs, ["premiers-secours"]);
  assert.deepEqual(args.donnees.equipement, ["trousse", "machette"], "l'équipement en plus, donné par son nom, passe par sa clé");
  assert.equal(args.donnees.competences.endurance, 1);
  assert.equal(args.donnees.lien, "la cousine de Lucie");
  assert.equal(a.img, "modules/lakour-fenoir/assets/jetons/joueurs/infirmiere.svg", "le jeton du passé");
  assert.equal(a.prototypeToken.texture.src, a.img);
  assert.equal(a.flags["lakour-survie"].graine, "Elle a perdu sa sœur sur la route du Littoral.");
  assert.ok(cadre.etat.groupe.membres.includes(a.id), "rejoindre : il entre au groupe");
  assert.match(r.contenu, /Il rejoint le groupe \(joueur\)/);
  assert.equal(game.users.get("u1").character.id, "s1", "Jordan joue encore Lucie, vivante : il la garde");
  assert.match(r.contenu, /confié à Jordan \(tirage B\)/);
  assert.match(r.contenu, /Jordan garde Lucie Hoarau comme personnage principal/);
  assert.match(r.contenu, /Sur lui : Premiers secours avancés, Trousse de secours, Machette/);
  assert.match(r.contenu, /histoire_personnage/);
  // Lucie morte : la nouvelle fiche devient son personnage.
  acteurs.get("s1").system.vivant = false;
  await executer("creer_survivant", { ...CREER, action: "tirer", nombre: 1 });
  const r2 = await executer("creer_survivant", { ...CREER, tirage: "A", nom: "Paul Grondin", joueur: "Jordan" });
  assert.equal(game.users.get("u1").character, acteurs.find(x => x.name === "Paul Grondin").id);
  assert.ok(!r2.contenu.includes("garde"), r2.contenu);
  assert.match((await executer("creer_survivant", { ...CREER, tirage: "A", nom: "Y" })).contenu, /tirage « A » inconnu/, "les tirages sont consommés");
});

test("creer_survivant, creer sans tirage : passé du compendium ; refus d'un passé inconnu sans compétences, d'un niveau hors bornes", async () => {
  const { acteurs } = installerFenoir();
  const r = await executer("creer_survivant", { ...CREER, nom: "Josette", passe: "Infirmière", statut: "pnj", age: 70, rejoindre: false });
  assert.ok(!r.erreur, r.contenu);
  const a = acteurs.find(x => x.name === "Josette");
  assert.equal(a.system.competences.soins.niveau, 3);
  assert.equal(a.system.statut, "pnj");
  assert.equal(a.img, "modules/lakour-fenoir/assets/jetons/joueurs/infirmiere.svg");
  assert.deepEqual(a.ownership, { default: 0 }, "à personne");
  assert.ok(!game.lakourSurvie.etat().groupe.membres.includes(a.id), "rejoindre = false : pas au groupe");
  assert.match(r.contenu, /Pas membre du groupe : survie_ajouter_membre quand il le rejoint/);
  assert.match((await executer("creer_survivant", { ...CREER, nom: "X", passe: "astronaute" })).contenu, /passé « astronaute » absent du compendium/);
  assert.match((await executer("creer_survivant", { ...CREER, nom: "Y", competences: [{ competence: "tir", niveau: 7 }] })).contenu, /hors de 0 à 5/);
});

test("creer_survivant, repli à la main (système sans creerSurvivant) : jeton, graine, propriété, entrée au groupe par ajouterMembre", async () => {
  const { acteurs, api, cadre } = installerFenoir();
  delete game.lakourSurvie.creerSurvivant;
  acteurs.get("s1").system.livide = true;
  await executer("creer_survivant", { ...CREER, action: "tirer", nombre: 1 });
  const r = await executer("creer_survivant", { ...CREER, tirage: "A", nom: "Mélissa", joueur: "Jordan", statut: "joueur" });
  assert.ok(!r.erreur, r.contenu);
  const a = acteurs.find(x => x.name === "Mélissa");
  assert.equal(a.img, "modules/lakour-fenoir/assets/jetons/joueurs/infirmiere.svg");
  assert.equal(a.prototypeToken.texture.src, a.img);
  assert.equal(a.flags["lakour-survie"].graine, "Elle a perdu sa sœur sur la route du Littoral.");
  assert.equal(a.flags["lakour-mj-ia"].graineHistoire, "Elle a perdu sa sœur sur la route du Littoral.");
  assert.deepEqual(a.ownership, { default: 0, u1: 3 });
  assert.equal(game.users.get("u1").character, a.id, "Lucie livide : la nouvelle fiche devient son personnage");
  assert.deepEqual(derniersArgs(api), ["ajouterMembre", { acteurId: a.id, statut: "joueur" }]);
  assert.ok(cadre.etat.groupe.membres.includes(a.id));
  assert.match(r.contenu, /Ajoutés : Premiers secours avancés, Trousse de secours/);
  assert.match(r.contenu, /Il rejoint le groupe \(joueur\)/);
});

test("compagnon_ajouter à Fénoir : la fiche passe par creer_survivant (statut compagnon), puis devient compagnon", async () => {
  const { acteurs } = installerFenoir();
  const { TEMPERAMENTS } = await import("../scripts/compagnons.js");
  const creation = JSON.stringify({ ...CREER, statut: "compagnon", passe: "infirmiere", age: 30 });
  const r = await executer("compagnon_ajouter", { nom: "Mimose", creation, fiche_existante: "", temperament: Object.keys(TEMPERAMENTS)[0],
    facon_de_parler: "", histoire: "Aide-soignante du CHU.", pres_de: "" });
  assert.ok(!r.erreur, r.contenu);
  const m = acteurs.find(x => x.name === "Mimose");
  assert.equal(m.type, "survivant");
  assert.equal(m.system.statut, "compagnon");
  assert.equal(m.flags["lakour-mj-ia"].compagnon.histoire, "Aide-soignante du CHU.");
});

test("survie_besoins : les manques, urgences d'abord ; tous = avec les tâches couvertes", async () => {
  installerFenoir();
  const r = await executer("survie_besoins", { tous: false });
  assert.match(r.contenu, /- garde \(vigilance\) : MANQUANT \(meilleur niveau 0\) — URGENT : pas de garde la nuit — profil cherché : ancien gendarme, vigile\n- chantier \(bricolage\) : FAIBLE/);
  assert.ok(!r.contenu.includes("soins :"));
  assert.match((await executer("survie_besoins", { tous: true })).contenu, /soins : COUVERT/);
});

test("survie_recrue : generer (au secret, avec son prix), recruter par le test de parole ; identifiant inconnu refusé", async () => {
  const { api, acteurs } = installerFenoir();
  const g = await executer("survie_recrue", { action: "generer", region: "", recrue: "", parleur: "", attitude: "" });
  assert.deepEqual(derniersArgs(api), ["genererRecrue", { region: "saint-paul" }]);
  assert.ok(g.contenu.startsWith(SECRET), "une recrue tirée est pour le MJ");
  assert.match(g.contenu, /R1 — Gilles Técher, 52 ans — enfance : Enfant des Hauts de Salazie.*pourquoi il est là : Il garde seul la caserne vide — SON PRIX : Il veut qu'on aille chercher sa fille/);
  const r = await executer("survie_recrue", { action: "recruter", region: "", recrue: "r1", parleur: "Lucie", attitude: "mefiante" });
  assert.equal(derniersArgs(api)[0], "recruter");
  assert.equal(derniersArgs(api)[1].parleurId, "s1");
  assert.equal(derniersArgs(api)[1].attitude, "mefiante", "l'attitude règle la difficulté du test (API recruter)");
  assert.equal(derniersArgs(api)[1].recrue.nom, "Gilles Técher");
  assert.match(r.contenu, /Lucie Hoarau, Parole : 1 succès pour 1 requis — réussite/);
  assert.match(r.contenu, /Gilles Técher rejoint le groupe \(recrue\)/);
  assert.ok(acteurs.find(x => x.name === "Gilles Técher"));
  assert.match((await executer("survie_recrue", { action: "recruter", region: "", recrue: "R1", parleur: "Lucie", attitude: "" })).contenu, /recrue « R1 » inconnue/);
  await executer("survie_recrue", { action: "generer", region: "", recrue: "", parleur: "", attitude: "" });
  await executer("survie_recrue", { action: "recruter", region: "", recrue: "R2", parleur: "Lucie", attitude: "" });
  assert.equal("attitude" in derniersArgs(api)[1], false, "attitude vide : celle par défaut du système (neutre)");
});

test("survie_assigner : une tâche ; répartition automatique des compagnons et recrues selon les manques, jamais les joueurs", async () => {
  const { api, acteurs } = installerFenoir();
  await executer("survie_assigner", { personnage: "Eddy", tache: "chantier", repartir: false });
  assert.deepEqual(derniersArgs(api), ["assigner", { acteurId: "s2", tache: "chantier" }]);
  const r = await executer("survie_assigner", { personnage: "", tache: "", repartir: true });
  assert.deepEqual(api.appels.filter(x => x[0] === "assigner").map(x => x[1]), [{ acteurId: "s2", tache: "chantier" }, { acteurId: "s2", tache: "garde" }],
    "Eddy (compagnon) à la garde, urgente ; Lucie (joueuse) n'est pas touchée");
  assert.match(r.contenu, /Eddy Payet → garde \(manquant, urgent, vigilance 0\)/);
  assert.equal(acteurs.get("s1").system.tache, undefined);
  assert.equal((await executer("survie_assigner", { personnage: "Eddy", tache: "", repartir: false })).erreur, true);
});

test("survie_ajouter_membre : un compagnon arrivé en cours de partie ; déjà membre refusé", async () => {
  const { api, acteurs } = installerFenoir();
  const nouveau = await globalThis.Actor.implementation.create({ name: "Mimose", type: "survivant", system: {} });
  await executer("survie_ajouter_membre", { personnage: "Mimose", statut: "compagnon" });
  assert.deepEqual(derniersArgs(api), ["ajouterMembre", { acteurId: nouveau.id, statut: "compagnon" }]);
  assert.match((await executer("survie_ajouter_membre", { personnage: "Lucie", statut: "joueur" })).contenu, /fait déjà partie du groupe/);
  assert.ok(acteurs.get(nouveau.id));
});
