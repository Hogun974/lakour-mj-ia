// Outils du narrateur de « Fénoir » (système lakour-survie, monde lakour-fenoir ; docs/survie.md). Chacun appelle l'API du
// système, game.lakourSurvie (§5 du contrat docs/survie-contrat.md du dépôt lakour-fenoir), et rend à l'IA un texte court en
// deux blocs : « [connu des joueurs] » (ce que les personnages perçoivent, ce que le groupe croit) et « [secret MJ] » (le réel
// du monde, pour le narrateur seul). Les outils qui écrivent passent TOUS par l'API, qui refuse hors du MJ actif ou tant que le
// monde n'est pas ouvert (coffre) : le refus revient à l'IA, rien n'est écrit en douce. Ajoutés à OUTILS par outils.js.
import { versHTML } from "./utilitaires.js";
import { oublierPrive } from "./compagnons-jeu.js";
import { packDeContenu, CONTENUS, jetonJoueur } from "./contenus.js";
import {
  CLES_COMPETENCES, RESSOURCES, DIFFICULTES_SURVIE, convertirDifficulte, apiSurvie, fonctionSurvie, lireSurvie, messageErreurSurvie,
  trouverFiche, listeDe, nomDe, voisinsDe, texteQuand, texteStocks, texteVariations, texteTest, ligneRenseignement, ligneReel,
  lignesSurvie, lignesMenaces, rendu, resumerSurvivant, etatCourt, jourDuQuart, libelleRessource, TACHES, STATUTS,
  dansLeBudget, sommeNiveaux, resumerTirage, lignesBesoins, repartirTaches, resumerRecrue,
  resoudreTransport, vehiculesDu, ligneVehicule, ligneTransport, portentVehicule,
  RESSOURCES_TROC, STADES_MARCHE, PORTEES_RUMEUR, PREUVES, REGARDS, ACTES_MORAUX, VOIX, PROFILS_VISITEUR, SOURCES_APPRENTISSAGE, CIBLES_SAVOIRS,
  GROUPE, bandeSensMoral, detteDuGroupe, texteMarche, texteRumeur, rumeurVivante, textePrejuges, secretDuSurvivant
} from "./survie-logique.js";

const SURVIE = ["lakour-survie"];
const ID_MJIA = "lakour-mj-ia";

// Schémas stricts, comme ceux d'outils.js (tous les champs requis ; une valeur vide = sans objet).
const objet = proprietes => ({ type: "object", properties: proprietes, required: Object.keys(proprietes), additionalProperties: false });
const chaine = description => ({ type: "string", description });
const booleen = description => ({ type: "boolean", description });
const entier = description => ({ type: "integer", description });
const choix = (valeurs, description) => ({ type: "string", enum: valeurs, description });
const liste = (items, description) => ({ type: "array", items, description });

const MEMBRES = liste(chaine("Nom d'un survivant du groupe."), "Qui y va (noms) ; vide = tous les membres valides du groupe.");
const RESSOURCES_PILLABLES = RESSOURCES.filter(r => r !== "energie");
// Les ressources naturelles des alentours (§2.1 du contrat, NATURE du système) : cibles d'une fouille « nature » (cueillette, chasse,
// pêche, bois), renouvelables, hors du pillage des maisons.
const NATURE = ["cueillette", "gibier", "peche", "bois"];
const ETATS_ROUTE = ["ouverte", "difficile", "coupee"];

// ------------------------------------------------------------------ accès au jeu
const jeu = () => globalThis.game;
const api = () => apiSurvie(jeu()?.lakourSurvie);
const appeler = (nom, args) => fonctionSurvie(jeu()?.lakourSurvie, nom)(args);
const lire = nom => lireSurvie(jeu()?.lakourSurvie, nom);
const acteurDe = id => jeu()?.actors?.get?.(id) ?? null;
const nomActeur = id => acteurDe(id)?.name ?? String(id ?? "?");
const traduire = k => { try { return jeu()?.i18n?.localize?.(k) ?? k; } catch { return k; } };
const tousLesActeurs = () => [...(jeu()?.actors?.contents ?? jeu()?.actors ?? [])];
const n = t => String(t ?? "").trim().toLowerCase();
// Texte brut d'un HTML, sans ponctuation finale (la ligne remet la sienne).
const brut = t => String(t ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().replace(/[.;\s]+$/, "");

// Un outil : ses erreurs (système absent, fonction absente, refus hors du MJ actif, argument inconnu) reviennent à l'IA.
class Refus extends Error {}
function outil(def) {
  return {
    ...def,
    systemes: SURVIE,
    async executer(args) {
      try { return await def.executer(args); } catch (e) {
        return { erreur: true, contenu: `${def.nom} : ${e instanceof Refus ? e.message : messageErreurSurvie(e, traduire)}` };
      }
    }
  };
}

// Un survivant par son nom (exact d'abord) ; les survivants passent devant les autres acteurs.
function survivant(nom, { requis = true } = {}) {
  const cle = n(nom);
  if (!cle) { if (requis) throw new Refus("donne le nom du personnage."); return null; }
  const tous = tousLesActeurs().sort((a, b) => Number(b.type === "survivant") - Number(a.type === "survivant"));
  const a = acteurDe(nom) ?? tous.find(x => n(x.name) === cle) ?? tous.find(x => n(x.name).includes(cle)) ?? null;
  if (!a && requis) throw new Refus(`personnage introuvable : ${nom}.`);
  return a;
}

// Les membres nommés -> ids ; vide = les membres vivants du groupe (état public).
function membres(noms = []) {
  if (!noms.length) {
    return (lire("etat")?.groupe?.membres ?? []).filter(id => {
      const s = acteurDe(id)?.system;
      return !s || (s.vivant !== false && !s.livide);
    });
  }
  return noms.map(nom => survivant(nom).id);
}

// Une fiche du contenu (région, site, installation) par clé ou nom ; vide autorisé si defaut est donné.
function cleDe(collection, reference, genre, { defaut = undefined } = {}) {
  if (!String(reference ?? "").trim()) {
    if (defaut !== undefined) return defaut;
    throw new Refus(`donne ${genre}.`);
  }
  const contenu = lire("contenu");
  const fiches = contenu?.[collection];
  if (!fiches) return String(reference).trim();   // registre illisible : le système jugera
  const f = trouverFiche(fiches, reference);
  if (!f) {
    const proposees = listeDe(fiches).slice(0, 25).map(x => x.cle ?? x.nom).join(", ");
    throw new Refus(`« ${reference} » introuvable dans le contenu de Fénoir (${LIBELLES_COLLECTIONS[collection] ?? collection} : ${proposees || "aucune"}).`);
  }
  return f.cle;
}
const LIBELLES_COLLECTIONS = { regions: "régions", sites: "sites", installations: "installations", recettes: "recettes", afflictions: "afflictions",
  factions: "factions", communautes: "communautés", marchands: "gens du marché", marches: "marchés", foires: "foires", savoirs: "savoirs",
  religions: "religions", ancrages: "ancrages", gramounes: "gramounes" };
const regionDuGroupe = () => lire("etat")?.groupe?.region ?? "";
const nomRegion = cle => nomDe(lire("contenu")?.regions, cle);
const quandTexte = () => texteQuand(lire("quand"));

// Une rencontre, quelle que soit sa forme : « 6 livides », « humains (les Récupérateurs, méfiants) : … ».
function texteRencontre(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  const qui = [r.type, r.nombre ? `×${r.nombre}` : "", r.taille ? `taille ${r.taille}` : ""].filter(Boolean).join(" ");
  const details = [r.faction, r.intentions ?? r.attitude].filter(Boolean).join(", ");
  const texte = String(r.texte ?? r.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `${qui || "rencontre"}${details ? ` (${details})` : ""}${texte ? ` : ${texte}` : ""}`;
}
const RENCONTRE = "Rencontre à mettre en scène MAINTENANT (les joueurs n'en savent que ce que tu décris ; intentions et nombre exact restent à toi) : ";
// Les rencontres d'une action (une par étape d'un voyage : rencontres ; sinon la seule : rencontre), chacune une ligne du secret.
const lignesRencontres = r => (Array.isArray(r?.rencontres) && r.rencontres.length ? r.rencontres : [r?.rencontre]).filter(Boolean)
  .map(x => `${RENCONTRE}${texteRencontre(x)}`);
// L'issue d'un assaut (logique du système : repoussee, endommagee, breche), en clair.
const ISSUES_ASSAUT = { repoussee: "repoussé", endommagee: "une installation endommagée et un blessé", breche: "BRÈCHE" };
// Les provisions de route qui ont manqué (voyage, déménagement : manque = { eau, nourriture, carburant }).
const ligneManque = manque => {
  const m = Object.entries(manque ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${libelleRessource(k)} ${v}`);
  return m.length ? `Provisions qui ont manqué en route : ${m.join(", ")} (faim, soif ou panne sèche en chemin : fais-le sentir).` : "";
};
// Les faits d'une action : les publics aux joueurs, les autres au secret.
function trierFaits(faits = []) {
  const ligne = f => `${f.region ? `${nomRegion(f.region)} : ` : ""}${brut(f.texte ?? f.cle)}`;
  return { publics: faits.filter(f => f?.public !== false).map(ligne), secrets: faits.filter(f => f?.public === false).map(ligne) };
}
const lignePubliques = (titre, faits) => (faits.length ? [`${titre} : ${faits.join(" ; ")}.`] : []);
const RAPPEL_RENSEIGNEMENTS = "Raconte ce qu'ils perçoivent ; ne corrige leurs renseignements (survie_renseigner) que s'ils apprennent quelque chose.";

// Le réel d'une région (secret), d'après le monde du moment.
const reelDe = region => {
  const monde = lire("monde");
  if (!monde) return "Monde réel indisponible (coffre pas encore ouvert) : ne devine pas.";
  return ligneReel(nomRegion(region), monde.regions?.[region], nomRegion);
};

// Le transport d'un voyage ou d'un déménagement : générique (pied, vehicule, bateau) ou véhicule du contenu (clé ou nom).
const CHOIX_TRANSPORT = "transport : « pied », « vehicule » ou « bateau » (génériques), ou la clé ou le nom d'un véhicule ou d'une monture "
  + "du contenu (scooter, voiture, quatre-quatre, camion-plateau, velo, velo-cargo, kayak, barque-a-moteur, ane, cheval-de-la-plaine…) : "
  + "prends celui que les joueurs utilisent et qu'ils ont (sur une fiche, à l'abri, ou trouvé en scène) ; le système en tire la durée "
  + "(moteur : vite ; vélo, âne : à l'allure), les terrains praticables (un sentier : à pied ou à dos d'âne ; la mer : bateau), la charge, "
  + "le carburant par quart (pris dans les stocks) et le bruit (+10 % de rencontres en route par point). Le texte rendu dit le carburant "
  + "consommé et le bruit.";
const TRANSPORT = chaine("pied, vehicule, bateau, ou clé ou nom d'un véhicule du contenu (« scooter », « 4×4 », « Âne de bât ») ; vide = à pied.");
function transportDe(reference) {
  const contenu = lire("contenu");
  const t = resoudreTransport(contenu, reference);
  if (t) return t;
  if (!contenu?.equipements) return { transport: String(reference).trim(), vehicule: null };   // registre illisible : le système jugera
  const v = vehiculesDu(contenu);
  throw new Refus(`transport « ${reference} » inconnu : pied, vehicule, bateau, ou un véhicule du contenu (${v.map(x => `${x.cle} (${x.nom ?? x.cle})`).join(", ") || "aucun"}).`);
}
// Au secret : le véhicule choisi, et personne du groupe (ni l'abri) ne l'a sur sa fiche (le système ne le vérifie pas).
function noteVehicule({ vehicule }, ids = []) {
  if (!vehicule) return "";
  const porteurs = portentVehicule([...ids, lire("etat")?.groupe?.abri].map(acteurDe).filter(Boolean), vehicule);
  return `Véhicule : ${ligneVehicule(vehicule)}${porteurs.length ? `, porté par ${porteurs.map(a => a.name).join(", ")}`
    : " ; aucune fiche du groupe ne l'a : s'ils l'ont trouvé en scène, donne-le à l'un d'eux, sinon ce trajet ne devait pas se faire ainsi"}.`;
}

// ------------------------------------------------------------------ les outils
export const OUTILS_SURVIE = [
  outil({
    nom: "survie_etat",
    description: "Fénoir : l'état de la partie en un coup d'œil, en deux blocs : ce que le groupe sait (moment, abri, stocks, membres, "
      + "renseignements datés) et, pour toi seul, le réel (infestation, pillage, hordes proches, cyclone, ce qui s'est passé hors champ). "
      + "Avec une région : ce que le groupe en croit, sa géographie (routes, sites) et son état réel. À utiliser avant un choix de route, "
      + "un déménagement, ou quand l'état du jeu ne suffit pas.",
    schema: objet({
      region: chaine("Région à regarder de près (clé ou nom, ex. « cilaos ») ; vide = la région du groupe et ses voisines.")
    }),
    sensible: false,
    async executer({ region }) {
      api();
      const donnees = { etat: lire("etat"), quand: lire("quand"), bilan: lire("bilan"), monde: lire("monde"), contenu: lire("contenu") };
      if (!String(region ?? "").trim()) {
        const { connu, secret } = lignesSurvie(donnees, { acteur: acteurDe });
        const journal = (donnees.etat?.journal ?? []).slice(-5).map(e => `jour ${jourDuQuart(e.quart)} : ${brut(e.texte)}`);
        return { contenu: rendu({ connu: [...connu, ...(journal.length ? [`Chronique récente : ${journal.join(" ; ")}.`] : [])], secret }) };
      }
      const cle = cleDe("regions", region, "une région");
      const fiche = trouverFiche(donnees.contenu?.regions, cle) ?? { cle };
      const jour = donnees.quand?.jour ?? jourDuQuart(donnees.etat?.horloge?.quart);
      const routes = (fiche.voisins ?? []).map(v => `${nomRegion(v.region)} par ${v.route ?? v.terrain ?? "?"} (${v.terrain ?? "?"}, ${v.km ?? "?"} km, `
        + `${v.quartsPied ?? "?"} quart(s) à pied${v.quartsVehicule ? `, ${v.quartsVehicule} en véhicule` : ", pas de véhicule"})`);
      const sites = (fiche.sites ?? []).map(s => nomDe(donnees.contenu?.sites, s));
      const monde = donnees.monde;
      return { contenu: rendu({
        connu: [
          `${fiche.nom ?? cle} (${fiche.zone ?? "?"}, ${fiche.altitude ?? "?"} m).`,
          ligneRenseignement(fiche.nom ?? cle, donnees.etat?.renseignements?.[cle], jour, nomRegion),
          routes.length ? `Routes : ${routes.join(" ; ")}.` : "",
          sites.length ? `Sites d'abri connus : ${sites.join(", ")}.` : ""
        ],
        secret: monde ? [ligneReel(fiche.nom ?? cle, monde.regions?.[cle], nomRegion),
          ...(monde.hordes ?? []).filter(h => h.region === cle).map(h => `Horde ${h.id ?? "?"} (taille ${h.taille ?? "?"}) ICI${h.cap ? `, cap sur ${nomRegion(h.cap)}` : ""}.`)]
          : ["Monde réel indisponible (coffre pas encore ouvert) : ne devine pas."]
      }) };
    }
  }),
  outil({
    nom: "survie_demarrer",
    description: "Fénoir : démarre une NOUVELLE partie au jour zéro (6 h du matin) : le système tire les dates de chute des réseaux, "
      + "initialise le monde secret et place le groupe dans sa région de départ. Une seule fois, quand les joueurs ont choisi où ils "
      + "vivent et qui fait partie du groupe ; ensuite, survie_installer pour leur premier abri.",
    schema: objet({
      region: chaine("Région de départ (clé ou nom, ex. « saint-denis »)."),
      membres: liste(chaine("Nom d'un survivant."), "Les survivants du groupe ; vide = les personnages des joueurs et les compagnons IA."),
      pnj: liste(objet({ nom: chaine("Nom du PNJ."), passe: chaine("Son passé (clé du contenu ou texte libre).") }),
        "PNJ qui suivent le groupe dès le départ (voisins, famille) ; vide = aucun."),
      date_depart: chaine("Date réelle du jour zéro, « AAAA-MM-JJ » ; vide = le réglage du monde (4 décembre 2026 par défaut).")
    }),
    sensible: true,
    // Pas de graine choisie par l'IA : le système tire une graine sûre de 128 bits (une graine courte ou devinable laisserait un
    // joueur recalculer le monde réel). Une graine donnée quand même est ignorée.
    async executer({ region, membres: noms, pnj, date_depart }) {
      api();
      const cle = cleDe("regions", region, "une région de départ");
      const ids = noms.length ? noms.map(x => survivant(x).id)
        : tousLesActeurs().filter(a => a.type === "survivant" && a.system?.vivant !== false && (a.hasPlayerOwner || a.flags?.[ID_MJIA]?.compagnon)).map(a => a.id);
      if (!ids.length) throw new Refus("aucun survivant pour former le groupe : crée d'abord les personnages (creer_survivant) ou nomme-les.");
      if (date_depart.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(date_depart.trim())) throw new Refus(`date_depart illisible : « ${date_depart} » (AAAA-MM-JJ).`);
      await appeler("demarrer", {
        region: cle, membres: ids,
        ...(date_depart.trim() ? { dateDepart: date_depart.trim() } : {}),
        ...(pnj.length ? { pnj: pnj.map(p => ({ nom: p.nom, passe: p.passe })) } : {})
      });
      const sites = (trouverFiche(lire("contenu")?.regions, cle)?.sites ?? []).map(s => `${nomDe(lire("contenu")?.sites, s)} [${s}]`);
      return { contenu: rendu({ connu: [
        `Partie démarrée : ${quandTexte()}. Le groupe (${ids.map(nomActeur).join(", ")}) est à ${nomRegion(cle)}.`,
        "Tout marche encore, rien ne va plus : raconte le premier matin (rumeurs, urgences saturées, embouteillages).",
        sites.length ? `Sites d'abri possibles ici (survie_installer) : ${sites.join(", ")}.` : ""
      ] }) };
    }
  }),
  outil({
    nom: "survie_avancer",
    description: "Fénoir : fait passer le temps, en quarts de six heures (matin, après-midi, soir, nuit), quand une action en prend sans "
      + "outil qui le compte (garde, repos, attente, soins, travaux simples, discussion longue). Le monde avance avec (consommation, "
      + "production, réseaux, hordes, météo, menaces). Rend les faits publics à raconter et, pour toi seul, ce qui s'est passé hors champ. "
      + "Une nuit de repos à l'abri : 2 quarts (soir et nuit).",
    schema: objet({
      quarts: entier("Nombre de quarts (1 à 28 ; 4 = un jour)."),
      raison: chaine("Ce que fait le groupe pendant ce temps (inscrit à la chronique) ; vide = sans précision.")
    }),
    sensible: false,
    async executer({ quarts, raison }) {
      api();
      if (!Number.isInteger(quarts) || quarts < 1 || quarts > 28) throw new Refus("quarts : de 1 à 28 (quatre par jour).");
      const avant = lire("quand")?.jour ?? 0;
      const r = await appeler("avancer", { quarts, raison: raison.trim() });
      const { publics } = trierFaits(r?.faits ?? []);
      const b = r?.bilan;
      const etat = lire("etat");
      const abri = acteurDe(etat?.groupe?.abri);
      const monde = lire("monde");
      return { contenu: rendu({
        connu: [
          `${quarts} quart(s) passent (${raison.trim() || "sans raison dite"}). Maintenant : ${texteQuand(r?.quand ?? lire("quand"))}.`,
          ...lignePubliques("Ce que le groupe voit ou entend", publics),
          ...((r?.alertes ?? []).length ? [`Alertes : ${r.alertes.map(a => brut(a.texte ?? a)).join(" ; ")}.`] : []),
          abri ? `Stocks : ${texteStocks(abri.system?.stocks)}${b?.joursDeStocks ? ` (eau ${b.joursDeStocks.eau ?? "?"} j, nourriture ${b.joursDeStocks.nourriture ?? "?"} j)` : ""}.` : "",
          b?.net ? `Net par jour : ${texteVariations(b.net)}.` : "",
          `État du groupe : ${(etat?.groupe?.membres ?? []).map(acteurDe).filter(Boolean).map(etatCourt).join(" ; ") || "?"}.`,
          (r?.departs ?? []).length ? `Départs : ${r.departs.map(nomActeur).join(", ")} (à bout, ils quittent le groupe ; leur fiche reste : raconte-le).` : "",
          RAPPEL_RENSEIGNEMENTS
        ],
        secret: lignesMenaces({ monde, contenu: lire("contenu"), ici: etat?.groupe?.region, jour: r?.quand?.jour ?? avant, depuisJour: avant })
      }) };
    }
  }),
  outil({
    nom: "survie_test",
    description: "Fénoir : lance DIRECTEMENT un test de compétence (réserve de d6, 5 et 6 = succès) et le montre au chat : pour un PNJ, un "
      + "compagnon IA, ou quand un joueur te demande de lancer pour lui. Pour un personnage joueur présent, préfère demander_jet (il "
      + "lance lui-même). Seulement quand l'enjeu le justifie. Une morsure : soins, extrême, tout de suite. compte = true si l'échec "
      + "ou l'effort apprend quelque chose (marque de progression).",
    schema: objet({
      personnage: chaine("Nom du survivant qui fait le test."),
      competence: choix(CLES_COMPETENCES, "La compétence testée."),
      difficulte: choix(DIFFICULTES_SURVIE, "facile (1 succès, +1 dé), normale (1 succès), difficile (2), extreme (3)."),
      bonus: entier("Dés en plus : outil adapté +1, aide d'un autre +1, situation +1 ou +2. 0 si aucun."),
      malus: entier("Dés en moins pour la situation (obscurité, pluie battante, panique) : 1 ou 2, 0 si aucun ; les malus d'état sont comptés par le système."),
      forcer: booleen("true si le personnage force d'emblée (relance des dés ratés, +1 fatigue ; échec forcé = complication)."),
      compte: booleen("true si le test compte pour la progression (danger, enjeu réel)."),
      raison: chaine("Ce qu'il tente, en quelques mots (titre de la carte au chat) ; vide = le nom de la compétence.")
    }),
    sensible: false,
    async executer({ personnage, competence, difficulte, bonus, malus, forcer, compte, raison }) {
      api();
      const a = survivant(personnage);
      const conv = convertirDifficulte(difficulte);
      const r = await appeler("test", { acteurId: a.id, competence, difficulte: conv.difficulte, bonus: Math.max(0, bonus) + conv.bonus,
        malus: Math.max(0, malus), forcer, titre: raison.trim() || competence, compte });
      return { contenu: rendu({ connu: [texteTest(a.name, competence, { ...r, difficulte: r?.difficulte ?? conv.difficulte })] }) };
    }
  }),
  outil({
    nom: "survie_explorer",
    description: "Fénoir : le groupe (ou une partie) explore une région, 1 à 2 quarts : il observe l'infestation, le pillage, les réseaux, "
      + "les routes et les gens ; leurs renseignements sur cette région sont mis à jour (datés d'aujourd'hui). Peut provoquer une "
      + "rencontre. À utiliser quand les joueurs vont voir, reconnaissent un quartier, cherchent un futur abri.",
    schema: objet({
      region: chaine("Région explorée (clé ou nom) ; vide = celle du groupe."),
      membres: MEMBRES,
      quarts: entier("Durée en quarts (1 ou 2 en général ; 0 = 1).")
    }),
    sensible: false,
    async executer({ region, membres: noms, quarts }) {
      api();
      const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
      const ids = membres(noms);
      const r = await appeler("explorer", { region: cle, membres: ids, quarts: Math.max(1, quarts || 1) });
      const { publics, secrets } = trierFaits(r?.faits ?? []);
      const jour = lire("quand")?.jour ?? 0;
      return { contenu: rendu({
        connu: [
          `${ids.map(nomActeur).join(", ")} explorent ${nomRegion(cle)} (${Math.max(1, quarts || 1)} quart(s)) ; maintenant : ${quandTexte()}.`,
          `Ce qu'ils savent désormais : ${ligneRenseignement(nomRegion(cle), r?.renseignement ?? lire("etat")?.renseignements?.[cle], jour, nomRegion)}`,
          ...lignePubliques("Faits perçus", publics)
        ],
        secret: [r?.rencontre ? `${RENCONTRE}${texteRencontre(r.rencontre)}` : "", `Réel : ${reelDe(cle)}`, ...lignePubliques("Hors de leur vue", secrets)]
      }) };
    }
  }),
  outil({
    nom: "survie_fouiller",
    description: "Fénoir : fouille d'un lieu pour des ressources (1 quart en général) : butin ajouté aux stocks, bruit, rencontre possible. "
      + "prudence « discret » (moins de butin, moins de bruit), « normal », « rapide » (plus de butin, plus de bruit et de risques). "
      + "À utiliser quand les joueurs fouillent une maison, un commerce, une pharmacie, une station-service, la nature alentour.",
    schema: objet({
      region: chaine("Région fouillée (clé ou nom) ; vide = celle du groupe."),
      site: chaine("Site précis (clé ou nom d'un site du contenu) ; vide = la région en général."),
      cible: choix(["", ...RESSOURCES_PILLABLES, "gaz", ...NATURE, ...CIBLES_SAVOIRS], "Ressource cherchée en priorité dans les maisons et commerces, ou la nature "
        + "alentour (cueillette, gibier, peche : nourriture ; bois : matériaux), ou jardins (les jardins créoles des cases : plantes, boutures), livres "
        + "(un livre qui apprend un savoir, au premier fouilleur) ; vide = tout ce qui se trouve."),
      membres: MEMBRES,
      quarts: entier("Durée en quarts (1 en général ; 0 = 1)."),
      prudence: choix(["discret", "normal", "rapide"], "Façon de fouiller.")
    }),
    sensible: false,
    async executer({ region, site, cible, membres: noms, quarts, prudence }) {
      api();
      const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
      const cleSite = site.trim() ? cleDe("sites", site, "un site") : "";
      const ids = membres(noms);
      const r = await appeler("fouiller", { region: cle, ...(cleSite ? { site: cleSite } : {}), ...(cible ? { cible } : {}), membres: ids,
        quarts: Math.max(1, quarts || 1), prudence });
      const butin = Object.entries(r?.butin ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${libelleRessource(k)} ${v}`);
      const { publics, secrets } = trierFaits(r?.faits ?? []);
      return { contenu: rendu({
        connu: [
          `${ids.map(nomActeur).join(", ")} fouillent ${cleSite ? nomDe(lire("contenu")?.sites, cleSite) : nomRegion(cle)} (${prudence}) ; maintenant : ${quandTexte()}.`,
          `Butin : ${butin.join(", ") || "rien de valable"}.`, Number(r?.bruit) ? `Bruit fait : ${r.bruit}.` : "",
          r?.livre ? `Un livre trouvé : ${nomDe(lire("contenu")?.savoirs, r.livre)}, porté par ${nomActeur(ids[0])} ; il s'apprend en veillées de lecture `
            + "(survie_veillee apprendre, source livre)." : "",
          ...lignePubliques("Faits perçus", publics)
        ],
        secret: [r?.rencontre ? `${RENCONTRE}${texteRencontre(r.rencontre)}` : "", `Réel après la fouille : ${reelDe(cle)}`, ...lignePubliques("Hors de leur vue", secrets)]
      }) };
    }
  }),
  outil({
    nom: "survie_installer",
    description: "Fénoir : le groupe s'installe dans un site d'abri de sa région (ou reprend un abri abandonné connu) : l'abri reçoit les "
      + "stocks trouvés sur place et ses installations de départ. À utiliser quand les joueurs décident d'habiter un lieu.",
    schema: objet({
      site: chaine("Site d'abri (clé ou nom d'un site du contenu)."),
      abri_abandonne: chaine("Nom d'un acteur abri abandonné à reprendre (un ancien abri du groupe) ; vide = nouvel abri.")
    }),
    sensible: true,
    async executer({ site, abri_abandonne }) {
      api();
      const cleSite = cleDe("sites", site, "un site");
      const abris = tousLesActeurs().filter(x => x.type === "abri");
      const ancien = abri_abandonne.trim() ? abris.find(x => n(x.name) === n(abri_abandonne)) ?? abris.find(x => n(x.name).includes(n(abri_abandonne))) : null;
      if (abri_abandonne.trim() && !ancien) throw new Refus(`abri introuvable : « ${abri_abandonne} » (abris : ${abris.map(x => x.name).join(", ") || "aucun"}).`);
      await appeler("installer", { site: cleSite, ...(ancien ? { abriId: ancien.id } : {}) });
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      const fiche = trouverFiche(lire("contenu")?.sites, cleSite) ?? {};
      const installations = [...(abri?.items ?? [])].filter(i => i.type === "installation").map(i => `${i.name} ${i.system?.niveau ?? ""}`.trim());
      return { contenu: rendu({ connu: [
        `Le groupe s'installe : ${abri?.name ?? fiche.nom ?? cleSite}. Maintenant : ${quandTexte()}.`,
        abri ? `Stocks : ${texteStocks(abri.system?.stocks)}.` : "",
        installations.length ? `Déjà là : ${installations.join(", ")}.` : "",
        (fiche.atouts ?? []).length ? `Atouts : ${fiche.atouts.join(", ")}.` : "", (fiche.defauts ?? []).length ? `Défauts : ${fiche.defauts.join(", ")}.` : ""
      ] }) };
    }
  }),
  outil({
    nom: "survie_construire",
    description: "Fénoir : chantier d'une installation de l'abri (citerne, potager, palissade, panneaux solaires, galerie…) ou réparation "
      + "d'une installation endommagée. Les coûts sont payés au premier quart ; le travail avance de quarts × bras. Une installation déjà "
      + "construite ailleurs (plans du groupe) coûte 25 % de matériaux en moins et moitié moins de travail.",
    schema: objet({
      action: choix(["construire", "reparer"], "construire (ou poursuivre un chantier, ou monter d'un niveau), ou reparer."),
      installation: chaine("construire : clé ou nom d'une installation du contenu ; reparer : nom de l'installation endommagée de l'abri, ou vide = "
        + "les dégâts de l'abri lui-même (après un assaut)."),
      membres: MEMBRES,
      quarts: entier("Quarts de travail (1 à 8 en général ; 0 = 1).")
    }),
    sensible: false,
    async executer({ action, installation, membres: noms, quarts }) {
      api();
      const ids = membres(noms);
      const q = Math.max(1, quarts || 1);
      if (action === "reparer") {
        const abri = acteurDe(lire("etat")?.groupe?.abri);
        if (!abri) throw new Refus("le groupe n'a pas d'abri.");
        if (!installation.trim()) {
          // Sans installation : les dégâts de l'abri (api.reparer sans installationId).
          const r = await appeler("reparer", { membres: ids, quarts: q });
          return { contenu: rendu({ connu: [`${ids.map(nomActeur).join(", ")} réparent l'abri ${abri.name} (${q} quart(s)) ; maintenant : ${quandTexte()}.`,
            r?.degats !== undefined ? `Dégâts restants de l'abri : ${r.degats}.` : ""] }) };
        }
        const items = [...(abri.items ?? [])].filter(i => i.type === "installation");
        const cible = items.find(i => n(i.name) === n(installation) || n(i.system?.cle) === n(installation))
          ?? items.find(i => n(i.name).includes(n(installation)));
        if (!cible) throw new Refus(`installation introuvable dans l'abri : « ${installation} » (installations : ${items.map(i => i.name).join(", ") || "aucune"}).`);
        const r = await appeler("reparer", { installationId: cible.id, membres: ids, quarts: q });
        return { contenu: rendu({ connu: [`${ids.map(nomActeur).join(", ")} réparent ${cible.name} (${q} quart(s)) ; maintenant : ${quandTexte()}.`,
          r?.etat !== undefined ? `État : ${r.etat === 0 ? "intacte" : `${r.etat}/3 d'usure`}.` : ""] }) };
      }
      const cle = cleDe("installations", installation, "une installation");
      const plans = lire("etat")?.groupe?.plans ?? [];
      const r = await appeler("construire", { installation: cle, membres: ids, quarts: q });
      const c = r?.chantier ?? {};
      return { contenu: rendu({ connu: [
        `${ids.map(nomActeur).join(", ")} travaillent à ${nomDe(lire("contenu")?.installations, cle)} (${q} quart(s))${plans.includes(cle) ? " — ils en ont déjà les plans" : ""} ; maintenant : ${quandTexte()}.`,
        r?.termine ? `TERMINÉ : niveau ${r.niveau ?? "?"} en service.` : `Chantier : ${c.fait ?? "?"}/${c.requis ?? "?"} quarts-personne.`
      ] }) };
    }
  }),
  outil({
    nom: "survie_voyager",
    description: "Fénoir : le groupe part vers une région voisine (à pied, en véhicule, en bateau) : le temps de route passe, l'état RÉEL "
      + "des routes compte (pas celui qu'ils croient : une route crue ouverte peut être coupée), une rencontre peut survenir ; à l'arrivée, "
      + "ils voient la région (renseignement mis à jour). Pour quitter l'abri pour de bon, survie_demenager. " + CHOIX_TRANSPORT,
    schema: objet({
      vers: chaine("Région voisine de destination (clé ou nom)."),
      transport: TRANSPORT,
      membres: MEMBRES,
      charge: entier("Unités portées en plus (butin, matériel) ; 0 si rien.")
    }),
    sensible: false,
    async executer({ vers, transport, membres: noms, charge }) {
      api();
      const cle = cleDe("regions", vers, "une région de destination");
      const ici = regionDuGroupe();
      const contenu = lire("contenu");
      if (ici && contenu?.regions && !voisinsDe(contenu, ici).includes(cle)) {
        throw new Refus(`${nomRegion(cle)} n'est pas voisine de ${nomRegion(ici)} (voisines : ${voisinsDe(contenu, ici).map(nomRegion).join(", ")}) : voyage étape par étape.`);
      }
      const ids = membres(noms);
      const moyen = transportDe(transport);
      const r = await appeler("voyager", { vers: cle, transport: moyen.transport, membres: ids, charge: Math.max(0, charge) });
      const { publics, secrets } = trierFaits(r?.faits ?? []);
      const route = lire("monde")?.regions?.[ici]?.routes?.[cle];
      return { contenu: rendu({
        connu: [
          r?.arrivee ? `${ids.map(nomActeur).join(", ")} arrivent à ${nomRegion(cle)} après ${r.quarts ?? "?"} quart(s) de route ; maintenant : ${quandTexte()}.`
            : `${ids.map(nomActeur).join(", ")} sont en route vers ${nomRegion(cle)} (${r?.quarts ?? "?"} quart(s) passés, pas encore arrivés) ; maintenant : ${quandTexte()}.`,
          r?.arrivee ? `Ce qu'ils voient : ${ligneRenseignement(nomRegion(cle), lire("etat")?.renseignements?.[cle], lire("quand")?.jour ?? 0, nomRegion)}` : "",
          ligneTransport(moyen, r),
          ligneManque(r?.manque),
          ...lignePubliques("En chemin", publics)
        ],
        secret: [...lignesRencontres(r), noteVehicule(moyen, ids), route ? `Route réelle au départ : ${route}.` : "",
          `Réel à destination : ${reelDe(cle)}`, ...lignePubliques("Hors de leur vue", secrets)]
      }) };
    }
  }),
  outil({
    nom: "survie_demenager",
    description: "Fénoir : la voie « repartir » : le groupe abandonne son abri (gardé comme abri abandonné, que d'autres pourront occuper), "
      + "emporte ce qu'il peut porter, voyage et s'installe sur un nouveau site. Les compétences et les plans suivent. À utiliser quand "
      + "le lieu est épuisé ou intenable et que les joueurs l'ont décidé. " + CHOIX_TRANSPORT + " La charge du véhicule borne ce qu'ils emportent.",
    schema: objet({
      site: chaine("Site d'arrivée (clé ou nom d'un site du contenu)."),
      transport: TRANSPORT,
      emporter: objet(Object.fromEntries(RESSOURCES.map(r => [r, entier(`${libelleRessource(r)} emporté(es) (0 si rien).`)])))
    }),
    sensible: true,
    async executer({ site, transport, emporter }) {
      api();
      const cleSite = cleDe("sites", site, "un site d'arrivée");
      const pris = Object.fromEntries(Object.entries(emporter ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Math.floor(v)]));
      const moyen = transportDe(transport);
      const r = await appeler("demenager", { site: cleSite, emporter: pris, transport: moyen.transport });
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      const { publics, secrets } = trierFaits(r?.faits ?? []);
      return { contenu: rendu({
        connu: [`Le groupe déménage vers ${nomDe(lire("contenu")?.sites, cleSite)} en emportant ${texteVariations(r?.emporte ?? pris).replace(/\+/g, "") || "rien"} ; maintenant : ${quandTexte()}.`,
          ligneTransport(moyen, r),
          r?.arrivee === false ? "Ils ne sont pas encore arrivés." : abri ? `Nouvel abri : ${abri.name} ; stocks : ${texteStocks(abri.system?.stocks)}.` : "",
          ligneManque(r?.manque), ...lignePubliques("En chemin", publics),
          RAPPEL_RENSEIGNEMENTS],
        secret: [...lignesRencontres(r), noteVehicule(moyen, membres([])), ...lignePubliques("Hors de leur vue", secrets)]
      }) };
    }
  }),
  outil({
    nom: "survie_ajuster",
    description: "Fénoir : corrige à la main ce que les autres outils ne comptent pas : stocks (un troc, un don, une perte, un repas de "
      + "fête), état d'un survivant (fatigue d'une course, moral après un deuil ou une victoire, faim, soif). Variations, pas valeurs : "
      + "+2, -1… ; 0 = inchangé.",
    schema: objet({
      stocks: objet(Object.fromEntries(RESSOURCES.map(r => [r, entier(`Variation de ${libelleRessource(r)} (0 = inchangé).`)]))),
      personnage: chaine("Survivant dont l'état change ; vide = aucun."),
      etat: objet({
        blessures: entier("Variation des blessures (échelle 0 à 4 ; 0 = inchangé ; pour une blessure de combat, préfère survie_blessure)."),
        fatigue: entier("Variation de la fatigue (échelle 0 à 5 ; 0 = inchangé)."), moral: entier("Variation du moral (échelle 0 à 5 ; 0 = inchangé)."),
        faim: entier("Variation des jours sans manger (0 = inchangé)."), soif: entier("Variation des quarts sans boire (0 = inchangé).")
      }),
      raison: chaine("Pourquoi (inscrit à la chronique) ; vide = « ajustement ».")
    }),
    sensible: true,
    async executer({ stocks, personnage, etat, raison }) {
      api();
      const s = Object.fromEntries(Object.entries(stocks ?? {}).filter(([, v]) => Number(v)));
      const e = Object.fromEntries(Object.entries(etat ?? {}).filter(([, v]) => Number(v)));
      const a = personnage.trim() ? survivant(personnage) : null;
      if (Object.keys(e).length && !a) throw new Refus("un changement d'état demande un personnage.");
      if (!Object.keys(s).length && !Object.keys(e).length) throw new Refus("rien à changer (toutes les variations valent 0).");
      await appeler("ajuster", { ...(Object.keys(s).length ? { stocks: s } : {}), ...(a ? { acteurId: a.id } : {}),
        ...(Object.keys(e).length ? { etat: e } : {}), raison: raison.trim() });
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      return { contenu: rendu({ connu: [
        Object.keys(s).length ? `Stocks : ${texteVariations(s)} → ${abri ? texteStocks(abri.system?.stocks) : "?"}.` : "",
        a ? `${etatCourt(acteurDe(a.id) ?? a)}.` : ""
      ] }) };
    }
  }),
  outil({
    nom: "survie_blessure",
    description: "Fénoir : blessures et infection. blesser (n blessures ; morsure = true si un Livide a mordu ou griffé profond : il faut "
      + "alors TOUT DE SUITE un test de soins extrême), soigner (un soigneur traite les blessures, avec les médicaments de l'abri), "
      + "infecter (échec du test après une morsure : le Gris suit sa route, stade +1 tous les deux quarts, Livide à 6).",
    schema: objet({
      action: choix(["blesser", "soigner", "infecter"], "Ce qui arrive."),
      personnage: chaine("Le survivant touché ou soigné."),
      n: entier("blesser : nombre de blessures (1 en général) ; 0 sinon."),
      morsure: booleen("blesser : true si c'est une morsure ou une griffure profonde de Livide."),
      soigneur: chaine("soigner : nom de celui qui soigne ; vide = le meilleur soigneur présent, choisi par le système (blesser, infecter : vide).")
    }),
    sensible: true,
    async executer({ action, personnage, n: nombre, morsure, soigneur }) {
      api();
      const a = survivant(personnage);
      let suite = "";
      if (action === "blesser") {
        await appeler("blesser", { acteurId: a.id, n: Math.max(1, nombre || 1), morsure });
        if (morsure) suite = "MORSURE : test de soins EXTRÊME maintenant, dans le quart (demander_jet soins « tres-ardue » pour un joueur, "
          + "survie_test soins extreme sinon) ; décris le geste (lavage, cautérisation, amputation selon l'endroit). Échec : survie_blessure infecter.";
      } else if (action === "soigner") {
        // Sans soigneur nommé, le système prend le meilleur en soins (api.soigner) : il rend le test (du soigneur) et les blessures soignées.
        const s = survivant(soigneur, { requis: false });
        const r = await appeler("soigner", { acteurId: a.id, ...(s ? { soigneurId: s.id } : {}) });
        const qui = s?.name ?? nomActeur(r?.test?.acteurId);
        suite = [r?.test ? texteTest(qui, "soins", r.test) : "",
          r?.soignees !== undefined ? `${Number(r.soignees) || 0} blessure(s) soignée(s)${r.medicament ? ", un médicament consommé" : ""}.` : ""].filter(Boolean).join(" ");
      } else {
        await appeler("infecter", { acteurId: a.id });
        suite = "Le Gris est en lui : stade +1 tous les deux quarts, mort à 6 puis Livide au quart suivant si rien n'est fait. Aucun "
          + "remède connu. Laisse les joueurs choisir ce qu'ils font de ce temps.";
      }
      return { contenu: rendu({ connu: [resumerSurvivant(acteurDe(a.id) ?? a), suite] }) };
    }
  }),
  outil({
    nom: "survie_marquer",
    description: "Fénoir : donne une marque de progression à une compétence après une scène marquante (le système en donne déjà une à "
      + "chaque test qui comptait, échoué ou forcé). Quand les marques atteignent 2 × (niveau + 1), la compétence monte.",
    schema: objet({
      personnage: chaine("Le survivant."),
      competence: choix(CLES_COMPETENCES, "La compétence qui progresse."),
      raison: chaine("La scène qui lui a appris quelque chose ; vide = sans précision.")
    }),
    sensible: false,
    async executer({ personnage, competence, raison }) {
      api();
      const a = survivant(personnage);
      const r = await appeler("marquer", { acteurId: a.id, competence });
      return { contenu: rendu({ connu: [`${a.name}, ${competence} : ${r?.monte ? `MONTE au niveau ${r.niveau}` : `niveau ${r?.niveau ?? "?"}, ${r?.marques ?? "?"} marque(s)`}`
        + `${raison.trim() ? ` (${raison.trim()})` : ""}.`] }) };
    }
  }),
  outil({
    nom: "survie_assaut",
    description: "Fénoir : une menace attaque l'abri (horde de passage, bande armée, chiens) : défense de l'abri et meilleure vigilance de la "
      + "garde contre la force de la menace. Issue : repoussée, une installation endommagée et un blessé, ou BRÈCHE (scène de combat, "
      + "fuite possible). Raconte l'assaut d'après le résultat. Une MENACE DU JOUR (identifiant « m3 » au secret de l'état du jeu) se règle "
      + "par menace et issue : assaut, ecarter, ultimatum (le groupe accepte le tribut de la bande), rejoindre (son chef frappe à la porte).",
    schema: objet({
      force: entier("Force de la menace en d6 (1 à 10 : une poignée de Livides 2, une horde 6 à 10, une bande armée 4 à 7) ; 0 avec une menace du jour."),
      type: chaine("Nature de la menace (« horde », « bande », « chiens »…) ; vide = inconnue."),
      description: chaine("Ce qui arrive, en une phrase (inscrit à la chronique) ; vide = rien de plus."),
      menace: chaine("Identifiant d'une menace du jour à régler (« m3 ») ; vide = un assaut libre (force, type)."),
      issue: choix(["assaut", "ecarter", "ultimatum", "rejoindre"], "Avec une menace : ce qu'il en advient ; sans : assaut.")
    }),
    sensible: true,
    async executer({ force, type, description, menace = "", issue = "assaut" }) {
      api();
      if (String(menace ?? "").trim()) return reglerMenace(String(menace).trim(), issue);
      if (!Number.isInteger(force) || force < 1 || force > 10) throw new Refus("force : de 1 à 10 dés.");
      const r = await appeler("assaut", { force, type: type.trim(), description: description.trim() });
      return { contenu: rendu({ connu: lignesAssaut(r, `${type.trim() || "?"}, force ${force}`) }) };
    }
  }),
  outil({
    nom: "survie_rencontre",
    description: "Fénoir : tire une rencontre selon l'état RÉEL d'une région (Livides selon l'infestation, humains selon les factions, "
      + "animaux, dangers) : pour une sortie que tu racontes sans autre outil, ou quand le récit en appelle une. Le résultat est pour "
      + "toi : mets-le en scène, les joueurs n'en savent que ce qu'ils perçoivent.",
    schema: objet({
      region: chaine("Région (clé ou nom) ; vide = celle du groupe."),
      type: choix(["", "livides", "humains", "animaux", "danger"], "Genre voulu ; vide = selon l'état réel.")
    }),
    sensible: false,
    async executer({ region, type }) {
      api();
      const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
      const r = await appeler("rencontre", { region: cle, ...(type ? { type } : {}) });
      return { contenu: rendu({ secret: [r ? `${RENCONTRE}${texteRencontre(r)}` : `Aucune rencontre à ${nomRegion(cle)}.`] }) };
    }
  }),
  outil({
    nom: "survie_renseigner",
    description: "Fénoir : note ce que le groupe CROIT d'une région, quand il apprend quelque chose sans y aller (radio, rumeur, récit "
      + "d'un PNJ) ou quand tu corriges un oubli. C'est public (tableau des joueurs) et ce peut être faux : une rumeur ment, une radio "
      + "date. N'y recopie jamais le réel qu'ils n'ont pas appris.",
    schema: objet({
      region: chaine("Région concernée (clé ou nom)."),
      source: choix(["vu", "radio", "rumeur"], "D'où vient l'information."),
      infestation: choix(["", "inconnue", "calme", "presente", "dense", "grouillante"], "Ce qu'on en dit ; vide = inchangé."),
      pillage: choix(["", "inconnu", "intact", "entame", "maigre", "vide"], "Ce qu'on en dit ; vide = inchangé."),
      electricite: choix(["", "oui", "non", "inconnue"], "Le courant, d'après l'information ; vide = inchangé."),
      eau: choix(["", "oui", "non", "inconnue"], "L'eau courante, d'après l'information ; vide = inchangé."),
      routes: liste(objet({ vers: chaine("Région voisine."), etat: choix(ETATS_ROUTE, "État dit de la route.") }), "Routes dont on parle ; vide = inchangées."),
      factions: liste(chaine("Faction vue ou signalée."), "Factions signalées ; vide = inchangées."),
      notes: chaine("Ce qu'on raconte, en une phrase ; vide = rien.")
    }),
    sensible: false,
    async executer({ region, source, infestation, pillage, electricite, eau, routes, factions, notes }) {
      api();
      const cle = cleDe("regions", region, "une région");
      const bool = v => (v === "oui" ? true : v === "non" ? false : null);
      const jour = lire("quand")?.jour;
      const args = {
        region: cle, source, ...(Number.isFinite(jour) ? { vu: jour } : {}),
        ...(infestation ? { infestation } : {}), ...(pillage ? { pillage } : {}),
        ...(electricite ? { electricite: bool(electricite) } : {}), ...(eau ? { eau: bool(eau) } : {}),
        ...(routes.length ? { routes: Object.fromEntries(routes.map(r => [cleDe("regions", r.vers, "une région voisine"), r.etat])) } : {}),
        ...(factions.length ? { factions } : {}), ...(notes.trim() ? { notes: notes.trim() } : {})
      };
      await appeler("renseigner", args);
      return { contenu: rendu({ connu: [`Renseignement noté : ${ligneRenseignement(nomRegion(cle), lire("etat")?.renseignements?.[cle] ?? args, jour ?? 0, nomRegion)}`] }) };
    }
  }),
  outil({
    nom: "survie_bilan",
    description: "Fénoir : le bilan de l'abri (public : les joueurs le voient sur leur tableau) : production, consommation et net par jour, "
      + "jours de stocks, défense, discrétion, visibilité, capacité, autonomie. À utiliser quand les joueurs font les comptes ou "
      + "préparent un chantier.",
    schema: objet({}),
    sensible: false,
    async executer() {
      api();
      const b = await fonctionSurvie(jeu()?.lakourSurvie, "bilan")();
      const etat = lire("etat");
      const abri = acteurDe(etat?.groupe?.abri);
      return { contenu: rendu({ connu: [
        abri ? `Abri ${abri.name} — stocks : ${texteStocks(abri.system?.stocks)}.` : "Pas d'abri.",
        `Production : ${texteVariations(b?.production)} ; consommation : ${texteVariations(b?.consommation)} ; net : ${texteVariations(b?.net)}.`,
        `Jours de stocks : eau ${b?.joursDeStocks?.eau ?? "?"}, nourriture ${b?.joursDeStocks?.nourriture ?? "?"}.`,
        `Défense ${b?.defense ?? "?"}, discrétion ${b?.discretion ?? "?"}, visibilité ${b?.visibilite ?? "?"}, capacité ${b?.capacite ?? "?"}.`,
        `Autonomie : ${typeof b?.autonomie === "object" && b?.autonomie ? JSON.stringify(b.autonomie) : b?.autonomie ?? "?"} ; jours autonomes d'affilée ${etat?.joursAutonomes ?? 0}${etat?.autonome ? " (AUTONOMES)" : ""}.`,
        (b?.alertes ?? []).length ? `Alertes : ${b.alertes.map(a => String(a.texte ?? a)).join(" ; ")}.` : ""
      ] }) };
    }
  }),
  // ---------- ajout du §9 du contrat (2026-11-04) : atelier, afflictions, fête au camp. Fonctions de l'API supposées (le §5 ne
  // les nomme pas) : fabriquer({ recette, acteurId, membres }), affliction({ acteurId, cle, action }), feter({ fete }).
  outil({
    nom: "survie_fabriquer",
    description: "Fénoir : l'atelier. Un survivant fabrique un objet ou une ressource d'après une recette du contenu (arc et flèches, "
      + "pièges, filtre portatif, alambic, réchaud à bois, munitions rechargées, savon…) : coût payé sur les stocks, temps de travail, "
      + "test de la compétence de la recette, savoirs et installation requis vérifiés par le système. À utiliser quand les joueurs "
      + "veulent fabriquer quelque chose de précis. Les bras comptent : le système compte l'artisan ET ses aides (membres), plus de bras "
      + "pour un travail plus court.",
    schema: objet({
      recette: chaine("Clé ou nom d'une recette du contenu (« arc-et-fleches », « Filtre portatif »)."),
      artisan: chaine("Le survivant qui fabrique (sa compétence fait le test)."),
      membres: liste(chaine("Nom d'un aide."), "Ceux qui l'aident (travail partagé) ; vide = personne d'autre.")
    }),
    sensible: false,
    async executer({ recette, artisan, membres: aides }) {
      api();
      const cle = cleDe("recettes", recette, "une recette");
      const a = survivant(artisan);
      const ids = [...new Set(aides.map(x => survivant(x).id).filter(id => id !== a.id))];
      // L'API compte bras = membres.length || 1 : l'artisan et ses aides, tous dans membres.
      const r = await appeler("fabriquer", { recette: cle, acteurId: a.id, membres: [a.id, ...ids] });
      const produit = r?.produit ? Object.entries(r.produit).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k} ${v}`).join(", ") : "";
      return { contenu: rendu({ connu: [
        `${a.name}${ids.length ? ` (aidé de ${ids.map(nomActeur).join(", ")})` : ""} travaille à ${nomDe(lire("contenu")?.recettes, cle)} ; maintenant : ${quandTexte()}.`,
        r?.test ? texteTest(a.name, r.test.competence ?? r.competence ?? "bricolage", r.test) : "",
        r?.termine === false ? `Pas encore fini${r?.chantier ? ` (${r.chantier.fait ?? "?"}/${r.chantier.requis ?? "?"} quarts)` : ""}.`
          : r?.reussite === false || r?.test?.reussite === false ? "Raté : matériaux perdus ou objet bancal (raconte-le)." : produit ? `Fabriqué : ${produit}.` : "Fabrication faite.",
        brut(r?.texte)
      ] }) };
    }
  }),
  outil({
    nom: "survie_affliction",
    description: "Fénoir : maladies et blessures persistantes (dengue, chikungunya, leptospirose après l'eau des ravines, gastro-entérite, "
      + "plaie infectée, fracture, brûlure, piqûre de scolopendre, coup de chaleur, choc après une perte). « donner » quand le récit ou "
      + "les conditions de vie l'imposent (eau non traitée, moustiques, chute) ; « soigner » quand un soin réussi en vient à bout (le "
      + "système applique le test, les médicaments et la durée). Ce n'est pas l'infection du Gris : pour elle, survie_blessure.",
    schema: objet({
      action: choix(["donner", "soigner"], "donner une affliction, ou la soigner."),
      personnage: chaine("Le survivant atteint."),
      affliction: chaine("Clé ou nom de l'affliction (« leptospirose », « Fracture »).")
    }),
    sensible: true,
    async executer({ action, personnage, affliction }) {
      api();
      const a = survivant(personnage);
      const cle = cleDe("afflictions", affliction, "une affliction");
      const r = await appeler("affliction", { acteurId: a.id, cle, action });
      const nom = nomDe(lire("contenu")?.afflictions, cle);
      return { contenu: rendu({ connu: [
        action === "donner" ? `${a.name} est atteint(e) : ${nom}.` : `${a.name} : ${nom}${r?.gueri === false || r?.reussite === false ? " résiste au soin" : " soigné(e)"}.`,
        r?.test ? texteTest(nomActeur(r.test.acteurId), r.test.competence ?? "soins", r.test) : "",
        brut(r?.texte),
        resumerSurvivant(acteurDe(a.id) ?? a)
      ] }) };
    }
  }),
  // Les fêtes du métissage (lot « fetes » de Fénoir, 2026-11-13) : chacune a son gain et son coût, que le système applique.
  outil({
    nom: "survie_feter",
    description: "Fénoir : le groupe fête une fête au camp (Noël en plein été, le 20 décembre, la Dipavali, le Nouvel An chinois, le ramadan…), "
      + "seulement si les joueurs le décident, une fois par fête et par an (le système refuse la seconde). Chaque fête a son GAIN et son "
      + "COÛT, que le système applique et rend (moral, souvenir de plusieurs jours, rations, bois, bruit, lueur visible, hygiène, sang-froid, "
      + "liens avec un abri voisin) ; jamais d'effet magique : la foi agit par le moral, ne confirme rien. Raconte-le : une fête s'entend "
      + "et se voit. action « voeu_tenu » / « voeu_rompu » : dis qu'un vœu du Cavadee (pour : qui) est tenu (+1 moral) ou rompu (−1).",
    schema: objet({
      action: choix(["feter", "voeu_tenu", "voeu_rompu"], "feter (défaut), ou le sort d'un vœu."),
      fete: chaine("La fête (clé du calendrier de Fénoir : « noel », « liberte », « dipavali », « ramadan », « marche-sur-le-feu »…) ; vide = la "
        + "fête du jour DE JEU, que le système trouve d'après la date de la partie (pas celle des joueurs) ; il refuse s'il n'y en a pas."),
      option: choix(["", "musique", "silence"], "La fête de la musique : en musique (moral, bruit) ou en silence (on dort serrés) ; vide = la première."),
      pour: liste(chaine("Nom d'un survivant du groupe."), "Cavadee : qui fait le vœu ; Noël : la recrue qu'un cadeau attache ; vœu : de qui ; vide = tous."),
      avec: chaine("L'abri voisin (faction, clé ou nom) qui reçoit les dons du Nouvel An chinois, l'échange de graines du Nouvel An tamoul, "
        + "la part de l'Aïd el-Kebir : un lien de plus avec lui ; vide = personne.")
    }),
    sensible: true,
    async executer({ action = "feter", fete, option = "", pour = [], avec = "" }) {
      api();
      const ids = (pour ?? []).filter(x => String(x).trim()).map(nom => survivant(nom).id);
      if (action === "voeu_tenu" || action === "voeu_rompu") {
        if (!ids.length) throw new Refus("dis de qui (pour).");
        const issue = action === "voeu_tenu" ? "tenu" : "rompu";
        for (const id of ids) await appeler("voeu", { acteurId: id, issue });
        return { contenu: rendu({ connu: [`Vœu ${issue} : ${ids.map(nomActeur).join(", ")} (${issue === "tenu" ? "+1" : "−1"} de moral). Raconte-le avec pudeur.`] }) };
      }
      const faction = String(avec ?? "").trim() ? cleDe("factions", avec, "une faction") : "";
      // Fête vide : le système la cherche à la date DE JEU (api.feter) ; la fête du calendrier réel des joueurs (fetes.js) n'est pas
      // la bonne : la date de Fénoir est une autre. Seuls les arguments donnés partent à l'API.
      const r = await appeler("feter", { fete: fete.trim(), ...(option ? { option } : {}), ...(ids.length ? { pour: ids } : {}), ...(faction ? { avec: faction } : {}) });
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      const cle = String(r?.fete || fete.trim() || "");
      const def = trouverFiche(lire("contenu")?.fetes, cle);
      const nom = String(def?.nom || cle || "la fête du jour");
      return { contenu: rendu({ connu: [
        `Le groupe fête ${nom} au camp${r?.option ? ` (${r.option})` : ""}.`,
        def?.gain ? `Ce qu'elle apporte : ${brut(def.gain)}.` : "",
        def?.cout ? `Ce qu'elle coûte : ${brut(def.cout)}.` : "",
        (r?.attaches ?? []).length ? `Le cadeau attache au groupe : ${r.attaches.map(nomActeur).join(", ")} (compagnons désormais).` : "",
        (r?.voeux ?? []).length ? `Vœu fait : ${r.voeux.map(nomActeur).join(", ")} (dis-moi quand il est tenu ou rompu : action voeu_tenu ou voeu_rompu).` : "",
        (r?.reposes ?? []).length ? `Ils reposent : ${r.reposes.join(", ")}.` : "",
        (r?.restent ?? []).length ? `Pas encore retrouvés (leur deuil pèse encore) : ${r.restent.join(", ")}.` : "",
        r?.refugies ? "La nouvelle de la part donnée court : fais venir des réfugiés dans les jours qui viennent (survie_recrue generer)." : "",
        brut(r?.texte),
        abri ? `Stocks : ${texteStocks(abri.system?.stocks)}.` : ""
      ] }) };
    }
  }),
  outil({
    nom: "survie_participer",
    description: "Fénoir : des membres du groupe vont à la fête d'une AUTRE communauté de l'île (le feu de la Dipavali chez les Malbars, le "
      + "dragon du Nouvel An chinois, le kabar du 20 décembre, la rupture du jeûne…), chez un abri voisin ou une faction. Deux quarts ; "
      + "+1 de moral à ceux qui y vont ; un lien de plus avec la communauté et la faction qui reçoivent (deux liens : on recrute plus "
      + "facilement chez eux), une fois par fête, par an et par hôte. Les PNJ y portent leurs préjugés, les faits les démentent : "
      + "joue-le, et monte l'horloge de réputation rep-<faction> si l'accueil le mérite.",
    schema: objet({
      fete: chaine("La fête (clé ou nom) ; vide = celle du jour de jeu."),
      communaute: choix(["", "cafres", "yabs", "zoreils", "malbars", "zarabes", "chinois", "malgaches", "comoriens"],
        "La communauté qui reçoit ; vide = celle de la fête."),
      faction: chaine("La faction (abri voisin) qui reçoit, clé ou nom ; vide = aucune."),
      membres: MEMBRES
    }),
    sensible: true,
    async executer({ fete, communaute, faction, membres: noms }) {
      api();
      const f = String(faction ?? "").trim() ? cleDe("factions", faction, "une faction") : "";
      const r = await appeler("participer", { fete: fete.trim(), communaute, faction: f, membres: membres(noms) });
      return { contenu: rendu({ connu: [
        `${(r?.qui ?? []).map(nomActeur).join(", ") || "Le groupe"} vont à la fête ${r?.fete ?? fete} chez ${[r?.communaute, f ? nomDe(lire("contenu")?.factions, f) : ""].filter(Boolean).join(", ")} : `
          + "deux quarts, +1 de moral chacun, un lien de plus avec ceux qui reçoivent.",
        r?.liens ? `Liens du groupe : ${Object.entries({ ...(r.liens.communautes ?? {}), ...(r.liens.factions ?? {}) }).map(([k, n]) => `${k} ${n}`).join(", ")}.` : ""
      ], secret: ["Un PNJ hôte peut y porter un préjugé sur le groupe (ou un membre du groupe sur eux) : fais-le dire, puis démentir par les faits."] }) };
    }
  }),
  // La mort et ce qui reste (famille 6) : la relève et l'autel.
  outil({
    nom: "survie_releve",
    description: "Fénoir : à la mort du survivant d'un joueur, la RELÈVE. « candidats » : qui il peut reprendre (membres vivants du groupe, "
      + "16 ans au moins, qui ne sont pas déjà le survivant d'un joueur : compagnons, recrues, PNJ, et les PNJ légers du groupe). Propose-lui "
      + "le choix, ou un nouveau tirage. « reprendre » : le système lui confie le survivant choisi (propriété, personnage), qui CESSE son "
      + "travail pour le groupe (dis-le : sa tâche est à reprendre ou à confier) ; un compagnon IA cesse d'en être un ; de 16 à 18 ans, il "
      + "porte moins, travaille moins vite et ne peut pas être chef. « tirage » : le joueur crée le suivant (creer_survivant).",
    schema: objet({
      action: choix(["candidats", "reprendre", "tirage"], "candidats, reprendre ou tirage."),
      mort: chaine("Le survivant mort (nom)."),
      candidat: chaine("reprendre : le survivant repris (nom, ou celui d'un PNJ léger du groupe) ; vide sinon."),
      joueur: chaine("Le joueur Foundry qui le reprend (nom) ; vide = celui du mort.")
    }),
    sensible: true,
    async executer({ action, mort, candidat, joueur }) {
      api();
      const m = survivant(mort);
      if (action === "candidats") {
        const c = await lireSurvie(jeu()?.lakourSurvie, "candidatsReleve", { mortId: m.id });
        return { contenu: rendu({ connu: [(c ?? []).length
          ? `Peuvent prendre la relève de ${m.name} : ${c.map(x => `${x.nom}${x.source === "pnj" ? " (PNJ du groupe, sa fiche sera tirée)" : ` (${x.age} ans${x.jeune ? ", jeune" : ""}${x.tache && x.tache !== "repos" ? `, ${x.tache}` : ""})`}`).join(" ; ")}. Ou un nouveau tirage.`
          : `Personne ne peut prendre la relève de ${m.name} : il reste le nouveau tirage (creer_survivant).`] }) };
      }
      const utilisateur = trouverJoueur(joueur);
      if (String(joueur ?? "").trim() && !utilisateur) throw new Refus(`joueur introuvable : ${joueur}.`);
      if (action === "tirage") {
        await appeler("releve", { mortId: m.id, action: "tirage", userId: utilisateur?.id ?? "" });
        return { contenu: rendu({ connu: [`Le joueur de ${m.name} tire un nouveau survivant : creer_survivant (tirer, puis creer avec joueur), qui rejoint le groupe.`] }) };
      }
      if (!String(candidat ?? "").trim()) throw new Refus("dis qui il reprend (candidat), ou action tirage.");
      const repris = trouverCandidat(candidat);
      const etaitCompagnon = repris ? Boolean(repris.flags?.[ID_MJIA]?.compagnon) : false;
      const r = await appeler("releve", { mortId: m.id, candidat: repris?.id ?? candidat.trim(), userId: utilisateur?.id ?? "", action: "reprendre" });
      const a = acteurDe(r?.acteurId);
      if (etaitCompagnon && a) await oublierPrive(a.id);
      const garde = await confier(utilisateur ?? jeu()?.users?.get?.(r?.joueur), a);
      return { contenu: rendu({ connu: [
        `${a?.name ?? candidat} prend la relève de ${m.name}${r?.source === "pnj" ? " (sa fiche vient d'être tirée : présente-la)" : ""}.`,
        r?.tacheLaissee && r.tacheLaissee !== "repos" ? `Il ne fait plus sa tâche pour le groupe (${r.tacheLaissee}) : demande qui la reprend (survie_assigner).` : "",
        r?.jeune ? "Il a moins de 18 ans : il porte moins, travaille moins vite, ne peut pas être chef." : "",
        etaitCompagnon ? "Ce n'est plus un compagnon IA : son joueur le joue désormais." : "",
        garde ? `Le joueur garde ${garde} comme personnage principal.` : "",
        a ? resumerSurvivant(a) : ""
      ] }) };
    }
  }),
  outil({
    nom: "survie_autel",
    description: "Fénoir : les morts du groupe et l'autel de l'abri. « liste » : les noms, et qui pèse encore (deuil : le moral remonte un "
      + "cran moins haut tant qu'un mort n'a pas reçu le repos). « honorer » : l'autel des morts de l'abri (installation), une assiette "
      + "offerte, un quart, une fois par semaine : +1 de moral et un soutien de sept jours. « repos » : donner le repos à un mort RETROUVÉ "
      + "(un quart ; lève son deuil ; à la Toussaint, survie_feter halloween le fait pour tous). « retrouver » : son corps est retrouvé "
      + "(ou le Livide qu'il était a reçu le repos). « inscrire » : un nom de plus (un PNJ léger tombé, un proche). Sobriété : le deuil "
      + "se raconte avec pudeur, jamais comme un spectacle.",
    schema: objet({
      action: choix(["liste", "honorer", "repos", "retrouver", "inscrire"], "Ce qu'on fait."),
      mort: chaine("repos, retrouver : le mort (nom) ; inscrire : le nom à inscrire ; vide sinon.")
    }),
    sensible: true,
    async executer({ action, mort }) {
      api();
      const nom = String(mort ?? "").trim();
      if (action === "liste") {
        const morts = (await lireSurvie(jeu()?.lakourSurvie, "morts")) ?? lire("etat")?.morts ?? [];
        return { contenu: rendu({ connu: [morts.length
          ? `Sur l'autel : ${morts.map(x => `${x.nom} (${x.repos ? "repose" : x.retrouve ? "en deuil" : "pas retrouvé"})`).join(", ")}.`
          : "Aucun nom sur l'autel."] }) };
      }
      if (action !== "honorer" && !nom) throw new Refus("dis de quel mort il s'agit (mort).");
      const r = await appeler("autel", action === "inscrire" ? { action, nom } : { action, mort: nom });
      const textes = { honorer: "Le groupe honore l'autel des morts : +1 de moral chacun, un soutien de sept jours. Une scène sobre.",
        repos: `Le repos est donné à ${r?.mort ?? nom}${r?.deuil === false ? " : le deuil du groupe se lève" : ""}.`,
        retrouver: `Le corps de ${nom} est retrouvé : on pourra lui donner le repos.`, inscrire: `${nom} est inscrit sur l'autel.` };
      return { contenu: rendu({ connu: [textes[action]] }) };
    }
  })
];
// Le texte d'un assaut résolu (api.assaut, api.resoudreMenace « assaut »).
function lignesAssaut(r, libelle) {
  const blesses = (r?.blesses ?? []).map(b => (typeof b === "string" ? nomActeur(b) : b?.nom ?? nomActeur(b?.acteurId ?? b?.id)));
  const degats = Array.isArray(r?.degats) ? r.degats.map(d => (typeof d === "string" ? d : d?.nom ?? d?.installation ?? "?")).join(", ") : r?.degats;
  return [
    `Assaut (${libelle}) : ${ISSUES_ASSAUT[r?.issue] ?? r?.issue ?? "?"} (marge ${r?.marge ?? "?"}).`,
    degats ? `Dégâts : ${degats}.` : "", blesses.length ? `Blessés : ${blesses.join(", ")}.` : "",
    r?.issue === "breche" || Number(r?.marge) <= -2 ? "BRÈCHE : joue la scène (combat simple, §1.7) ; la fuite est une vraie option." : ""
  ];
}
// Une menace du jour réglée (api.resoudreMenace, §14.5) : assaut, écartée, ultimatum accepté (un tribut), rejoindre (on frappe).
async function reglerMenace(id, issue) {
  const m = (lire("monde")?.menaces ?? []).find(x => x.id === id);
  const r = await appeler("resoudreMenace", { id, action: issue });
  if (issue === "assaut" && r && !r.ecartee) return { contenu: rendu({ connu: lignesAssaut(r, `menace ${id}${m ? `, ${m.type ?? "?"}, force ${m.force ?? "?"}` : ""}`) }) };
  if (r?.tribut) {
    const t = r.tribut;
    return { contenu: rendu({ connu: [`Ultimatum accepté : tribut ${t.id} à ${t.bande ?? t.faction ?? "?"} : ${texteBiensTroc(t.demande)} tous les ${t.tousLes ?? "?"} jours, `
      + `premier dû le jour ${t.prochain ?? "?"} (survie_communaute tribut, payé ou refusé : refuser, c'est la guerre).`] }) };
  }
  if (r?.visiteur) return { contenu: rendu(texteVisiteur(r.visiteur, "Le chef de la bande vient frapper à la porte, il demande à rejoindre")) };
  return { contenu: rendu({ connu: [`Menace ${id} écartée : elle ne vient pas (raconte pourquoi, ou laisse-la hors champ).`] }) };
}

// Un survivant repris par la relève : un acteur (nom), sinon le nom d'un PNJ léger (le système le résout).
function trouverCandidat(nom) {
  try { return survivant(nom); } catch { return null; }
}

// ------------------------------------------------------------------ création d'un survivant (création guidée, compagnons)
// Le passé vient du compendium « passes » du module de contenu (Item « passe » : { cle, competences: { cle: niveau }, savoirs: [cle],
// equipement: [cle] }) ; ses savoirs et son équipement des compendiums « savoirs » et « equipements ». Le module est lakour-fenoir ou
// sa variante anglaise lakour-fenoir-en, celle qui est active (packDeContenu, contenus.js) : résolu à chaque appel, pas au chargement.
const PACKS = { passes: "passes", savoirs: "savoirs", equipements: "equipements" };
async function documentsDe(nom) {
  const pack = jeu()?.packs?.get?.(packDeContenu(nom, "lakour-survie"));
  if (!pack) return [];
  try { return [...(await pack.getDocuments())]; } catch { return []; }
}
const parCleOuNom = (docs, ref) => docs.find(d => n(d.system?.cle) === n(ref)) ?? docs.find(d => n(d.name) === n(ref))
  ?? docs.find(d => n(d.name).includes(n(ref))) ?? null;
const trouverJoueur = nom => {
  const x = n(nom);
  if (!x) return null;
  const users = jeu()?.users;
  if (typeof users?.find !== "function") return null;
  return users.find(u => n(u.name) === x) ?? users.find(u => n(u.character?.name) === x) ?? null;
};
// Le jeton d'un passé, comme le système (api.mjs) : celui que désigne l'index des jetons de joueur du module de contenu actif
// (assets/jetons/index.json : un jeton peint ia/…webp s'il existe), sinon le SVG du passé dans le module de contenu de base.
const JETON_PASSE = cle => `modules/${CONTENUS[SURVIE[0]]}/assets/jetons/joueurs/${cle}.svg`;
const jetonDuPasse = async cle => (await jetonJoueur(cle, "2d").catch(() => null)) ?? JETON_PASSE(cle);
// La fiche devient le personnage du joueur, sauf s'il en joue déjà un autre, vivant (il garde le sien ; la nouvelle lui appartient
// aussi). -> le nom du personnage gardé, ou "".
async function confier(utilisateur, acteur) {
  if (!utilisateur || utilisateur.isGM || !acteur) return "";
  const actuel = utilisateur.character;
  if (actuel?.id === acteur.id) return "";
  if (actuel && actuel.type === "survivant" && actuel.system?.vivant !== false && !actuel.system?.livide) return actuel.name;
  await utilisateur.update({ character: acteur.id });
  return "";
}

// Les tirages du générateur (creer_survivant, action « tirer ») et les recrues proposées (survie_recrue), gardés ici jusqu'à leur
// création : clé (« A », « R1 ») -> données du générateur. Chez le MJ actif seulement, en mémoire.
const tirages = new Map();
const recrues = new Map();
let compteurRecrues = 0;
export function oublierTirages() { tirages.clear(); recrues.clear(); compteurRecrues = 0; }
const nomContenu = (collection, cle, genre = "") => nomDe(lire("contenu")?.[collection], cle, genre);
const VERROUS = objet({
  nom: chaine("Nom gardé (vide = tiré)."), age: entier("Âge gardé, 16 à 75 (0 = tiré)."),
  enfance: chaine("Enfance gardée (clé ou nom ; vide = tirée)."), passe: chaine("Passé gardé (clé ou nom ; vide = tiré)."),
  traits: liste(chaine("Trait gardé (clé ou nom)."), "Traits gardés (vide = tirés)."),
  regard: choix(["", ...REGARDS], "Regard sur la catastrophe gardé (epreuve : endurer ; refaire : bâtir ; vivre : les petits plaisirs) ; vide = tiré."),
  religion: chaine("Religion gardée (clé ou nom du contenu, « aucune », « plusieurs ») ; vide = tirée."),
  religions: liste(chaine("Religion (clé ou nom)."), "Avec « plusieurs » : deux ou trois religions ; vide sinon."),
  pratique: choix(["", "oui", "non"], "Pratiquant (sa religion ou son ancrage) ; vide = tiré."),
  ancrage: chaine("Ce qui fait tenir un non-croyant (clé ou nom d'un ancrage du contenu) ; vide = tiré.")
});
// Les verrous non vides, résolus dans le contenu quand c'est possible.
function verrousDe(v = {}) {
  const contenu = lire("contenu");
  const cle = (collection, ref) => (contenu?.[collection] ? trouverFiche(contenu[collection], ref)?.cle ?? ref.trim() : ref.trim());
  const traits = (v.traits ?? []).filter(t => t.trim());
  return Object.fromEntries([
    ["nom", v.nom?.trim()], ["age", v.age > 0 ? v.age : null],
    ["enfance", v.enfance?.trim() ? cle("enfances", v.enfance) : null], ["passe", v.passe?.trim() ? cle("passes", v.passe) : null],
    ["traits", traits.length ? traits.map(t => cle("traits", t)) : null],
    // L'esprit choisi par le joueur (§14.1 : generer({ verrous: { regard, religion, religions, pratique, ancrage } })).
    ["regard", REGARDS.includes(v.regard) ? v.regard : null], ["religion", v.religion?.trim() ? cle("religions", v.religion) : null],
    ["religions", (v.religions ?? []).filter(r => r.trim()).length ? v.religions.filter(r => r.trim()).map(r => cle("religions", r)) : null],
    ["pratique", v.pratique === "oui" ? true : v.pratique === "non" ? false : null], ["ancrage", v.ancrage?.trim() ? cle("ancrages", v.ancrage) : null]
  ].filter(([, x]) => x !== null && x !== undefined && x !== ""));
}
// Un tirage dans le budget (§10.2 : somme des niveaux entre 10 et 16) : jusqu'à cinq relances, verrous gardés.
async function tirerDansLeBudget(generer, options) {
  let d = null;
  for (let essai = 0; essai < 5; essai++) {
    d = await generer(options);
    if (dansLeBudget(d)) break;
  }
  return d;
}

OUTILS_SURVIE.push(outil({
  nom: "creer_survivant",
  description: "Fénoir : création d'un survivant « tiré au sort mais cohérent » par le générateur du système (enfance, passé, "
    + "compétences, passions, traits, incapacités, équipement, graine d'histoire). D'abord « tirer » : deux ou trois tirages résumés à "
    + "proposer au joueur (verrous : ce qu'il garde — nom, âge, enfance, passé, traits, et son esprit : regard, religion, pratique, ancrage — "
    + "pour relancer le reste ; la couleur tirée ne se dit qu'à lui, en privé). Puis « creer » avec la "
    + "lettre du tirage choisi (et ses ajustements) : le SYSTÈME crée la fiche (creerSurvivant : jeton du passé, genre, graine, objets), "
    + "la confie au joueur nommé (joueur ; vide = personne : PNJ, compagnon IA) et, rejoindre = true, la fait entrer au groupe avec son "
    + "statut. Sans tirage (lettre vide), même chose d'après un passé du compendium. Pour un compagnon IA, statut « compagnon » "
    + "(compagnon_ajouter s'en sert).",
  schema: objet({
    action: choix(["tirer", "creer"], "tirer : proposer des tirages ; creer : créer la fiche."),
    nombre: entier("tirer : combien de tirages (1 à 3 ; 0 = 3)."),
    verrous: VERROUS,
    favoriser: liste(choix(CLES_COMPETENCES, "Compétence à favoriser."), "tirer : compétences à favoriser (le concept du joueur) ; vide = aucune."),
    tirage: chaine("creer : lettre du tirage choisi (« A », « B », « C ») ; vide = création à la main d'après passe et competences."),
    statut: choix(STATUTS, "joueur, compagnon (IA), recrue ou pnj : son statut sur la fiche et dans le groupe."),
    rejoindre: booleen("creer : true = il entre au groupe dès sa création (partie démarrée) ; false = pas encore (survie_ajouter_membre plus tard)."),
    nom: chaine("creer : nom du survivant (vide = celui du tirage)."),
    joueur: chaine("creer : à qui la donner : nom du joueur Foundry (ou de son personnage) qui en devient propriétaire ; vide = personne (PNJ, compagnon IA)."),
    acteur_existant: chaine("creer : nom d'une fiche de survivant existante à compléter ; vide = nouvelle fiche."),
    passe: chaine("creer sans tirage : clé ou nom d'un passé du compendium, ou texte libre (donne alors toutes les compétences) ; vide = celui du tirage."),
    competences: liste(objet({ competence: choix(CLES_COMPETENCES, "Compétence."), niveau: entier("Niveau 0 à 5.") }),
      "creer : niveaux qui REMPLACENT ceux du tirage ou du passé (ajustements choisis avec le joueur) ; vide = aucun."),
    equipement: liste(chaine("Clé ou nom d'un équipement du compendium."), "creer : équipement en plus ; vide = rien de plus."),
    age: entier("creer : âge (0 = celui du tirage, ou non précisé)."),
    lien: chaine("creer : son lien avec le groupe ; vide = aucun."),
    description: chaine("creer : apparence, vie d'avant, en quelques lignes (notes de la fiche, publiques) ; vide = aucune.")
  }),
  sensible: true,
  async executer(a) {
    const g = jeu();
    if (g?.system?.id !== "lakour-survie") throw new Refus("seulement dans un monde Fénoir (système lakour-survie).");
    if (a.action === "tirer") {
      const generer = fonctionSurvie(g.lakourSurvie, "generer");
      const verrous = verrousDe(a.verrous);
      const nb = Math.max(1, Math.min(3, a.nombre || 3));
      tirages.clear();
      const lignes = [];
      for (let i = 0; i < nb; i++) {
        const lettre = "ABC"[i];
        const d = await tirerDansLeBudget(generer, { verrous, statut: a.statut, ...(regionDuGroupe() ? { region: regionDuGroupe() } : {}),
          ...(a.favoriser.length ? { favoriser: Object.fromEntries(a.favoriser.map(c => [c, 2])) } : {}) });
        if (!d) throw new Refus("le générateur n'a rien rendu.");
        tirages.set(lettre, d);
        lignes.push(resumerTirage(d, lettre, { nomDe: nomContenu }));
      }
      return { contenu: [`${nb} tirage(s)${Object.keys(verrous).length ? ` (gardés : ${Object.keys(verrous).join(", ")})` : ""} — résume-les au joueur, `
        + "en quelques mots chacun, et laisse-le choisir, relancer en gardant ce qu'il aime (verrous), ou ajuster :", ...lignes].join("\n") };
    }
    const existant = a.acteur_existant.trim()
      ? tousLesActeurs().find(x => x.type === "survivant" && n(x.name) === n(a.acteur_existant)) : null;
    if (a.acteur_existant.trim() && !existant) throw new Refus(`fiche de survivant introuvable : ${a.acteur_existant}.`);
    const fautif = a.competences.find(c => !Number.isInteger(c.niveau) || c.niveau < 0 || c.niveau > 5);
    if (fautif) throw new Refus(`niveau de ${fautif.competence} hors de 0 à 5 (${fautif.niveau}).`);
    const lettre = a.tirage.trim().toUpperCase();
    const tire = lettre ? tirages.get(lettre) : null;
    if (lettre && !tire) throw new Refus(`tirage « ${a.tirage} » inconnu (tirages : ${[...tirages.keys()].join(", ") || "aucun : action tirer d'abord"}).`);
    const [passes, savoirs, equipements] = await Promise.all([documentsDe(PACKS.passes), documentsDe(PACKS.savoirs), documentsDe(PACKS.equipements)]);
    const passe = tire ? null : a.passe.trim() ? parCleOuNom(passes, a.passe) : null;
    const sp = passe?.system ?? {};
    if (!tire && !passe && !a.competences.length) {
      throw new Refus(`passé « ${a.passe} » absent du compendium (passés : ${passes.map(p => p.name).join(", ") || "compendium introuvable"}) : `
        + "tire un survivant (action tirer), choisis un passé, ou donne toutes les compétences.");
    }
    const base = tire?.competences ?? sp.competences ?? {};
    const niveaux = Object.fromEntries(CLES_COMPETENCES.map(c => [c, Number(base[c]?.niveau ?? base[c] ?? 0) || 0]));
    for (const c of a.competences) niveaux[c.competence] = c.niveau;
    const competences = Object.fromEntries(CLES_COMPETENCES.map(c => [c, { niveau: niveaux[c], marques: existant?.system?.competences?.[c]?.marques ?? 0 }]));
    const source = tire ?? sp;
    const utilisateur = trouverJoueur(a.joueur);
    if (a.joueur.trim() && !utilisateur) throw new Refus(`joueur introuvable : ${a.joueur}.`);
    const nom = a.nom.trim() || tire?.nom || "";
    if (!nom && !existant) throw new Refus("donne un nom.");
    const age = a.age > 0 ? a.age : Number(tire?.age) || 0;
    const rejoindre = a.rejoindre !== false;
    const clePasse = tire?.passe ?? sp.cle ?? passe?.name ?? a.passe.trim();
    // La graine d'histoire du générateur : gardée pour l'histoire du personnage (histoire_personnage, preparer).
    const graine = tire?.graine ?? tire?.histoire ?? "";
    const introuvables = [];
    const parApi = !existant && typeof g.lakourSurvie?.creerSurvivant === "function";
    let acteur = existant;
    let membre = false;
    let objets = [];

    if (parApi) {
      // Par l'API du système (creerSurvivant, chez le MJ actif) : jeton du passé, genre, graine, objets du contenu, propriété du
      // joueur, entrée au groupe et journal. Savoirs et équipement y vont par clé (compendiums d'abord, sinon le contenu).
      const versCles = (docs, collection, refs, genre) => [...new Set(refs.map(ref => {
        const cle = parCleOuNom(docs, ref)?.system?.cle ?? trouverFiche(lire("contenu")?.[collection], ref)?.cle ?? null;
        if (!cle) introuvables.push(`${genre} ${ref}`);
        return cle;
      }).filter(Boolean))];
      const donnees = {
        ...(tire ?? {}), nom, statut: a.statut, passe: clePasse, competences: niveaux,
        savoirs: versCles(savoirs, "savoirs", source.savoirs ?? [], "savoir"),
        equipement: versCles(equipements, "equipements", [...(source.equipement ?? []), ...a.equipement], "équipement"),
        ...(age > 0 ? { age } : {}), lien: a.lien.trim() || tire?.lien || "",
        notes: a.description.trim() ? versHTML(a.description) : tire?.notes ?? "", graine
      };
      const r = await appeler("creerSurvivant", { donnees, userId: utilisateur?.id ?? "", rejoindre, statut: a.statut });
      acteur = acteurDe(r?.acteurId);
      if (!acteur) throw new Refus(`le système n'a pas rendu la fiche créée (${JSON.stringify(r ?? null)}).`);
      membre = Boolean(r?.membre);
      // Le moteur lit la graine en flags.lakour-mj-ia.graineHistoire ; le système ne l'y met que s'il voit le module actif.
      if (graine && !acteur.flags?.[ID_MJIA]?.graineHistoire) await acteur.update({ [`flags.${ID_MJIA}.graineHistoire`]: graine });
      objets = [...(acteur.items ?? [])];
      const portes = new Set(objets.flatMap(o => [o.system?.cle, n(o.name)]).filter(Boolean));
      const absent = (collection, cle) => !portes.has(cle) && !portes.has(n(nomContenu(collection, cle)));
      introuvables.push(...donnees.savoirs.filter(c => absent("savoirs", c)).map(c => `savoir ${c}`),
        ...donnees.equipement.filter(c => absent("equipements", c)).map(c => `équipement ${c}`));
    } else {
      // Repli à la main : fiche existante à compléter, ou système sans creerSurvivant.
      const deja = new Set([...(existant?.items ?? [])].map(i => `${i.type}:${n(i.name)}`));
      const ajouter = (docs, ref, genre) => {
        const d = parCleOuNom(docs, ref);
        if (!d) { introuvables.push(`${genre} ${ref}`); return; }
        const cle = `${d.type}:${n(d.name)}`;
        if (deja.has(cle)) return;
        deja.add(cle);
        objets.push(g.items?.fromCompendium ? g.items.fromCompendium(d) : (d.toObject?.() ?? d));
      };
      for (const s of source.savoirs ?? []) ajouter(savoirs, s, "savoir");
      for (const e of [...(source.equipement ?? []), ...a.equipement]) ajouter(equipements, e, "équipement");
      const systeme = {
        competences, statut: a.statut, passe: clePasse,
        ...(tire ? { enfance: tire.enfance ?? "", genre: tire.genre ?? "", passions: tire.passions ?? {}, traits: tire.traits ?? [], incapacites: tire.incapacites ?? [] } : {}),
        ...(age > 0 ? { age } : {}), ...(a.lien.trim() ? { lien: a.lien.trim() } : {}), ...(a.description.trim() ? { notes: versHTML(a.description) } : {})
      };
      const PROPRIO = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
      const AMICAL = globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;
      if (existant) {
        await existant.update({ ...Object.fromEntries(Object.entries(systeme).map(([k, v]) => [`system.${k}`, v])),
          ...(graine ? { [`flags.${ID_MJIA}.graineHistoire`]: graine } : {}) });
      } else {
        // Le jeton du passé, comme le système ; sinon celui par défaut de Foundry.
        const passeConnu = trouverFiche(lire("contenu")?.passes, clePasse)?.cle ?? sp.cle ?? "";
        const jeton = passeConnu ? await jetonDuPasse(passeConnu) : null;
        acteur = await globalThis.Actor.implementation.create({
          name: nom, type: "survivant", ...(jeton ? { img: jeton } : {}), system: { ...systeme, vivant: true, livide: false },
          ...(graine ? { flags: { [SURVIE[0]]: { graine }, [ID_MJIA]: { graineHistoire: graine } } } : {}),
          ownership: utilisateur && !utilisateur.isGM ? { default: 0, [utilisateur.id]: PROPRIO } : { default: 0 },
          prototypeToken: { name: nom, actorLink: true, disposition: AMICAL, sight: { enabled: true }, ...(jeton ? { texture: { src: jeton } } : {}) }
        });
      }
      if (objets.length) await acteur.createEmbeddedDocuments("Item", objets);
      const e = lire("etat");
      if (rejoindre && e?.demarree && !(e.groupe?.membres ?? []).includes(acteur.id) && typeof g.lakourSurvie?.ajouterMembre === "function") {
        await appeler("ajouterMembre", { acteurId: acteur.id, statut: a.statut });
        membre = true;
      }
    }
    const garde = await confier(utilisateur, acteur);
    if (tire) tirages.clear();
    const somme = sommeNiveaux(competences);
    const etat = lire("etat");
    const dansLeGroupe = membre || (etat?.groupe?.membres ?? []).includes(acteur.id);
    return { contenu: [
      `Survivant « ${acteur.name} » ${existant ? "complété" : "créé"}${utilisateur ? `, confié à ${utilisateur.name}` : ""}${tire ? ` (tirage ${lettre})` : ""}.`,
      resumerSurvivant(acteur, { nomDe: nomContenu }),
      garde ? `${utilisateur.name} garde ${garde} comme personnage principal (vivant) ; cette fiche lui appartient aussi.` : "",
      a.statut === "joueur" && !dansLeBudget({ competences }) ? `Attention : somme des niveaux ${somme}, hors du budget de départ (10 à 16).` : "",
      objets.length ? `${parApi ? "Sur lui" : "Ajoutés"} : ${objets.map(o => o.name).join(", ")}.` : "",
      introuvables.length ? `Introuvables, non ajoutés : ${introuvables.join(", ")} (vérifie avec chercher_compendium).` : "",
      "Son histoire : histoire_personnage (preparer, puis ecrire).",
      membre ? `Il rejoint le groupe (${a.statut}).`
        : etat?.demarree && !dansLeGroupe
          ? `Pas membre du groupe${rejoindre ? " (le système ne l'a pas ajouté : monde fermé ?)" : ""} : survie_ajouter_membre quand il le rejoint.` : ""
    ].filter(Boolean).join("\n") };
  }
}));

// ------------------------------------------------------------------ besoins, recrues, tâches, membres (§10.2, §10.3)
OUTILS_SURVIE.push(
  outil({
    nom: "survie_besoins",
    description: "Fénoir : ce qui manque au groupe, tâche par tâche (garde, cultures, soins, chantier…) : compétence requise, meilleur "
      + "niveau du groupe, couverture (couvert, faible, manquant), urgence (blessés sans soigneur, pas de garde la nuit…) et le profil "
      + "à chercher. Pour toi : de quoi faire croiser au groupe les PNJ qui comblent ces manques (survie_recrue), avec un prix.",
    schema: objet({ tous: booleen("true pour voir aussi les tâches couvertes.") }),
    sensible: false,
    async executer({ tous }) {
      const b = await fonctionSurvie(jeu()?.lakourSurvie, "besoins")();
      const lignes = lignesBesoins(b, { tous });
      return { contenu: rendu({ connu: [lignes.length ? `Besoins du groupe :\n${lignes.map(l => `- ${l}`).join("\n")}` : "Rien ne manque au groupe pour l'instant."] }) };
    }
  }),
  outil({
    nom: "survie_recrue",
    description: "Fénoir : une recrue qui comble les manques du groupe. « generer » : le système tire un survivant qui penche vers les "
      + "compétences manquantes, avec une raison d'être là et un PRIX (ce qu'il demande, un défaut, une méfiance, un proche à sauver) : "
      + "fais-le rencontrer au groupe (rencontre, appel radio), sans dévoiler son prix d'emblée. « recruter » : quand les joueurs lui "
      + "proposent de les rejoindre, le test de parole du parleur décide ; réussi, il entre au groupe (statut recrue). Une GRAMOUNE (une ancienne "
      + "aux savoirs lontan, du contenu) se présente aussi en recrue : generer avec gramoune.",
    schema: objet({
      action: choix(["generer", "recruter"], "generer une recrue, ou la recruter."),
      region: chaine("generer : région où on la croise (clé ou nom) ; vide = celle du groupe."),
      gramoune: chaine("generer : clé ou nom d'une gramoune du contenu ; vide = une recrue tirée selon les manques."),
      recrue: chaine("recruter : identifiant de la recrue rendu par generer (« R1 ») ; vide sinon."),
      parleur: chaine("recruter : le survivant qui la convainc (test de parole) ; vide sinon."),
      attitude: choix(["", "amicale", "neutre", "mefiante", "hostile"], "recruter : l'attitude de la recrue envers le groupe (elle règle la difficulté "
        + "du test : amicale facile, neutre normale, méfiante difficile, hostile extrême ; un cran de moins si elle comble un manque) ; vide = neutre.")
    }),
    sensible: true,
    async executer({ action, region, gramoune = "", recrue, parleur, attitude }) {
      api();
      if (action === "generer") {
        const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
        const g = String(gramoune ?? "").trim() ? cleDe("gramounes", gramoune, "une gramoune") : "";
        const d = await appeler("genererRecrue", { region: cle, ...(g ? { gramoune: g } : {}) });
        if (!d) throw new Refus("le système n'a proposé aucune recrue.");
        const id = `R${++compteurRecrues}`;
        recrues.set(id, d);
        return { contenu: rendu({ secret: ["Recrue possible, à mettre en scène (les joueurs n'en savent que ce qu'ils voient ; son prix se découvre) : "
          + resumerRecrue(d, id, { nomDe: nomContenu }), `Pour la recruter : survie_recrue recruter, recrue « ${id} », avec le parleur.`] }) };
      }
      const id = recrue.trim().toUpperCase();
      const d = recrues.get(id);
      if (!d) throw new Refus(`recrue « ${recrue} » inconnue (recrues proposées : ${[...recrues.keys()].join(", ") || "aucune"}).`);
      const p = survivant(parleur);
      const r = await appeler("recruter", { recrue: d, parleurId: p.id, ...(attitude ? { attitude } : {}) });
      const nouvel = acteurDe(r?.acteurId ?? r?.acteur?.id ?? r?.id);
      const reussi = r?.reussite ?? r?.test?.reussite ?? Boolean(nouvel);
      if (reussi) recrues.delete(id);
      return { contenu: rendu({ connu: [
        r?.test ? texteTest(p.name, "parole", r.test) : "",
        reussi ? `${nouvel?.name ?? d.nom ?? "La recrue"} rejoint le groupe (recrue). Donne-lui une tâche (survie_assigner) et, s'il compte, une histoire (histoire_personnage).`
          : `${d.nom ?? "La recrue"} refuse, pour l'instant. Raconte pourquoi.`
      ] }) };
    }
  }),
  outil({
    nom: "survie_assigner",
    description: "Fénoir : la tâche du jour d'un compagnon IA, d'une recrue ou d'un PNJ du groupe (les joueurs choisissent la leur) : "
      + `${TACHES.join(", ")}. repartir = true : répartition automatique des compagnons et des recrues selon les manques du groupe `
      + "(urgences d'abord, le plus compétent, jamais une tâche dont il est incapable).",
    schema: objet({
      personnage: chaine("Le membre ; vide si repartir."),
      tache: choix(["", ...TACHES], "La tâche ; vide si repartir."),
      repartir: booleen("true : répartition automatique des compagnons et recrues.")
    }),
    sensible: false,
    async executer({ personnage, tache, repartir }) {
      api();
      if (repartir) {
        const b = await fonctionSurvie(jeu()?.lakourSurvie, "besoins")();
        const libres = (lire("etat")?.groupe?.membres ?? []).map(acteurDe).filter(x => x && x.system?.vivant !== false && !x.system?.livide
          && (x.flags?.[ID_MJIA]?.compagnon || ["compagnon", "recrue", "pnj"].includes(x.system?.statut)))
          .map(x => ({ id: x.id, nom: x.name, competences: x.system?.competences ?? {}, incapacites: x.system?.incapacites ?? [] }));
        const plan = repartirTaches(b, libres);
        for (const p of plan) await appeler("assigner", { acteurId: p.acteurId, tache: p.tache });
        return { contenu: rendu({ connu: [plan.length ? `Tâches du jour : ${plan.map(p => `${p.nom} → ${p.tache} (${p.raison})`).join(" ; ")}.`
          : "Aucune tâche à répartir (pas de compagnon ni de recrue libre, ou rien ne manque)."] }) };
      }
      if (!tache) throw new Refus("donne la tâche (ou repartir = true).");
      const a = survivant(personnage);
      await appeler("assigner", { acteurId: a.id, tache });
      return { contenu: rendu({ connu: [`${a.name} → ${tache}.`] }) };
    }
  }),
  outil({
    nom: "survie_ajouter_membre",
    description: "Fénoir : ajoute au groupe du système un survivant qui existe déjà (un compagnon IA créé en cours de partie, un PNJ qui "
      + "se joint pour de bon). Une recrue passe plutôt par survie_recrue.",
    schema: objet({
      personnage: chaine("Le survivant qui rejoint le groupe."),
      statut: choix(STATUTS, "Son statut dans le groupe.")
    }),
    sensible: true,
    async executer({ personnage, statut }) {
      api();
      const a = survivant(personnage);
      if ((lire("etat")?.groupe?.membres ?? []).includes(a.id)) throw new Refus(`${a.name} fait déjà partie du groupe.`);
      await appeler("ajouterMembre", { acteurId: a.id, statut });
      return { contenu: rendu({ connu: [`${a.name} rejoint le groupe (${statut}).`] }) };
    }
  })
);


// ------------------------------------------------------------------ le marché, les savoirs, la communauté (§12 à §15, 2026-11-13)
// Les fonctions de l'API (scripts/api.mjs et api-marche.mjs du système) : marche, coursDuJour, stadesDuMarche, evenementDeMarche,
// evaluerTroc, troquer, ouvrirBoutique, crediter, rendre, effacerDette, solderCarnet, ouvrirMarche, fermerMarche, accueillir,
// rompreTreve, retablirTreve, rumeur, dementir, dementirPrejuge, prejuges, creerMarchand ; preparerCyclone, apprendre,
// gagnerConfiance, dicter, apprivoiser ; frapper, porte, voter, decider, acteMoral, chef, parole, entente, separer, fusionner,
// lireSigne, tribut, ajusterEsprit, tirerEsprit, resoudreMenace (essais/survie-api-fenoir.test.mjs les cherche dans le code du système).
// Le sens moral, la vraie couleur, la vérité des rumeurs et les préjugés vont au bloc secret, jamais au connu.
const BIENS = liste(objet({ ressource: choix(RESSOURCES_TROC, "Le bien."), n: entier("Quantité.") }), "Les biens ; vide = aucun.");
// signe : 1 = les quantités positives ; -1 = les négatives, en valeur absolue (un troc : + reçu, − donné).
const biensDe = (l, signe = 1) => {
  const o = {};
  for (const b of l ?? []) { const q = Math.floor(Number(b?.n) * signe); if (q > 0) o[b.ressource] = (o[b.ressource] ?? 0) + q; }
  return o;
};
function texteBiensTroc(o) {
  return Object.entries(o ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${libelleRessource(k)} ${v}`).join(", ") || "rien";
}
const parts = v => String(Math.round(Number(v || 0) * 100) / 100).replace(".", ",");
const ref = x => String(x ?? "").trim();
const estGroupe = x => ["groupe", "le groupe"].includes(n(x));
// Une communauté visée par un préjugé (contenu « communautes ») : sa clé ; une cible hors du contenu reste telle quelle.
const ciblesDe = l => (l ?? []).map(ref).filter(Boolean).map(c => trouverFiche(lire("contenu")?.communautes, c)?.cle ?? c);
const factionDe = f => (ref(f) ? cleDe("factions", f, "une faction") : "");
const pnjDe = nom => (ref(nom) ? survivant(nom).id : "");
// Qui porte un acte du marché ou d'une rumeur : « groupe », un survivant (son id), sinon le nom tel quel (un PNJ inconnu ne porte rien).
function porteurDe(qui) {
  const x = ref(qui);
  if (!x) return "";
  if (estGroupe(x)) return GROUPE;
  return survivant(x, { requis: false })?.id ?? x;
}
const nomPorteur = qui => (qui === GROUPE ? "le groupe" : acteurDe(qui)?.name ?? qui);
const signeDe = v => `${Number(v) > 0 ? "+" : ""}${Number(v) || 0}`;
// Ce que l'acte a fait au sens moral (retour de porterActe : { membres: [{ nom, delta, deltaReputation }], enfants }) : au secret.
function lignesSens(sens) {
  if (!sens?.membres?.length) return [];
  return [`Sens moral : ${sens.membres.map(m => `${m.nom} ${signeDe(m.delta)}${Number(m.deltaReputation) ? ` (réputation ${signeDe(m.deltaReputation)})` : ""}`).join(", ")}.`,
    ...((sens.enfants ?? []).length ? [`Les enfants ont vu : ${sens.enfants.map(e => `${e.nom} ${e.reaction ?? ""}${e.projet ? ` (projet : ${e.projet})` : ""}`).join(", ")}.`] : [])];
}
// Une boutique ou un marché de l'état public, par clé ou nom ; vide = le seul qui existe.
function lieuDuMarche(genre, reference, { requis = true } = {}) {
  const liste = lire("etat")?.marche?.[genre] ?? [];
  const libelle = genre === "boutiques" ? "boutique" : "marché";
  const connus = () => liste.map(x => `${x.nom ?? x.cle} [${x.cle}]`).join(", ") || "aucun pour l'instant";
  if (!ref(reference)) {
    if (liste.length === 1) return liste[0].cle;
    if (!requis) return "";
    throw new Refus(`dis quel ${libelle} (${connus()}).`);
  }
  const f = trouverFiche(liste, reference);
  if (!f) throw new Refus(`${libelle} introuvable : « ${reference} » (${connus()}).`);
  return f.cle;
}
// La première confiance d'un PNJ (évaluer, troquer, crédit) : au secret, le narrateur la joue.
function ligneConfiance(c) {
  if (!c) return "";
  const credit = { plein: "plein crédit", moitie: "crédit de moitié", refuse: "pas de crédit" }[c.credit] ?? c.credit;
  return `Première confiance${c.pnj ? ` de ${c.pnj}` : ""} : poids ${c.poids ?? 0}${(c.enJeu ?? []).length ? ` (préjugés éveillés : ${c.enJeu.join(", ")})` : ""}`
    + `${Number(c.rumeurs) ? ` ; rumeurs contre le groupe : ${c.rumeurs}` : ""} → majoration +${Math.round(Number(c.majoration || 0) * 100)} %, ${credit}`
    + `${Number(c.parole) ? `, −${c.parole} dé(s) en parole avec lui` : ""}${(c.dits ?? []).length ? `. Ce qu'il en dit (dans sa bouche) : ${c.dits.map(d => `« ${brut(d)} »`).join(" ; ")}` : ""}.`;
}
// Quelqu'un à la porte (api.frapper, resoudreMenace « rejoindre ») : ce que le groupe voit, et au secret sa vraie couleur.
function texteVisiteur(v, tete = "On frappe à la porte") {
  const vrai = lire("monde")?.porte?.[v?.id]?.survivant;
  const demande = brut(v?.demande?.texte ?? v?.demande);
  return {
    connu: [`${tete} : ${v?.id ?? "?"} ${v?.nom ?? "?"}${Number(v?.age) ? `, ${v.age} ans` : ""} (${v?.profil ?? "?"}${Number(v?.bouches) ? `, ${v.bouches} bouche(s) en plus` : ""})`
      + `${demande ? ` : « ${demande} »` : ""}. Le groupe décide : survie_porte (accueillir, refuser, trahir), après un vote s'il le veut (survie_vote).`],
    secret: vrai ? [`Sa vraie couleur : ${bandeSensMoral(vrai.sensMoral)} (sens moral ${signeDe(vrai.sensMoral)}) ; ne la dis pas, montre-la par ses gestes.`] : []
  };
}
// Le résumé d'un survivant pour le narrateur : le public au connu, sens moral et préjugés au secret.
function resumeEnDeux(a, { nomContenu }) {
  return { connu: [resumerSurvivant(a, { nomDe: nomContenu, chef: lire("etat")?.groupe?.chef === a.id })], secret: [secretDuSurvivant(a, { nomDe: nomContenu })] };
}

OUTILS_SURVIE.push(
  outil({
    nom: "survie_marche",
    description: "Fénoir, le marché (troc seulement, en parts : une part = un jour de nourriture). « lire » : le cours du jour, les stades "
      + "possibles, les carnets, les marchés, ce qui se dit ; au secret, la vérité des rumeurs. « evenement » : un événement de marché à jouer.",
    schema: objet({
      action: choix(["lire", "evenement"], "lire, ou tirer un événement."),
      region: chaine("lire : région des stades ; vide = celle du groupe."),
      stade: choix(["", ...STADES_MARCHE], "evenement : le stade ; vide = forain.")
    }),
    sensible: false,
    async executer({ action, region, stade }) {
      api();
      const contenu = lire("contenu");
      if (action === "evenement") {
        const e = await appeler("evenementDeMarche", { stade: stade || "forain" });
        if (!e) return { contenu: rendu({ connu: ["Aucun événement de marché pour ce stade, cette saison, cette phase."] }) };
        const effets = Object.entries(e.effets ?? {}).map(([k, v]) => `${k} : ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ; ");
        return { contenu: rendu({ secret: [`Événement de marché à jouer au bon moment : ${e.nom ?? e.cle} — ${brut(e.texte)}.`,
          effets ? `Effets : ${effets}${e.effets?.dementi ? " (un démenti : survie_prejuge dementir quand les faits l'ont montré)" : ""}.` : ""] }) };
      }
      const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
      const m = await appeler("marche", {});
      const cours = await appeler("coursDuJour", {});
      const stades = await appeler("stadesDuMarche", { region: cle });
      const quand = lire("quand") ?? {};
      const jour = quand.jour ?? 0;
      const vivantes = (m?.rumeurs ?? []).filter(r => rumeurVivante(r, jour));
      const verites = lire("monde")?.marche?.rumeurs ?? {};
      return { contenu: rendu({
        connu: [
          `Cours du jour (parts) : ${Object.entries(cours ?? {}).map(([k, v]) => `${libelleRessource(k)} ${parts(v)}`).join(", ") || "?"}.`,
          `Stades à ${nomRegion(cle)} : ${(stades ?? []).map(s => `${s.stade} ${s.ouvert ? "oui" : "non"}${brut(s.texte ?? s.motif?.texte) ? ` (${brut(s.texte ?? s.motif?.texte)})` : ""}`).join(" ; ")}.`,
          (m?.boutiques ?? []).length ? `Boutiques et carnets : ${m.boutiques.map(b => `${b.nom ?? b.cle} [${b.cle}]${b.tenancier ? `, tenue par ${nomActeur(b.tenancier)}` : ""} : `
            + `dette du groupe ${parts(detteDuGroupe(b))} part(s)`).join(" ; ")}.` : "Aucune boutique ouverte (survie_carnet ouvrir).",
          (m?.marches ?? []).length ? `Marchés : ${m.marches.map(x => texteMarche(x, { contenu, jour, date: quand.date })).join(" ; ")}.` : "",
          vivantes.length ? `Ce qui se dit : ${vivantes.map(texteRumeur).join(" ; ")}.` : "",
          m?.signe ? `Signe du groupe (ses objets marqués) : ${m.signe}.` : ""
        ],
        secret: vivantes.filter(r => verites[r.id]).map(r => `Rumeur ${r.id} : ${verites[r.id].vraie ? "VRAIE" : "FAUSSE"}${verites[r.id].malveillant ? ", malveillante" : ""}`
          + `${verites[r.id].auteur ? `, lancée par ${nomPorteur(verites[r.id].auteur)}` : ""}.`)
      }) };
    }
  }),
  outil({
    nom: "survie_troquer",
    description: "Fénoir : un troc au cours du jour avec un PNJ ou une faction. Il demande sa valeur MAJORÉE par sa première confiance : les "
      + "préjugés que TU dis éveillés (cibles), les rumeurs contre le groupe, la réputation de sa faction. « evaluer » ne change rien ; "
      + "« troquer » (refusé s'il n'y trouve pas son compte, sauf accepter). Un échange honnête use ses préjugés.",
    schema: objet({
      action: choix(["evaluer", "troquer"], "evaluer, ou troquer."),
      biens: liste(objet({ ressource: choix(RESSOURCES_TROC, "Le bien."), n: entier("+ reçu par le groupe, − donné.") }), "L'échange."),
      pnj: chaine("Le PNJ (nom d'un acteur) ; vide = aucun."),
      cibles: liste(chaine("Communauté (clé ou nom)."), "Ses préjugés éveillés devant le groupe ; vide = aucun."),
      faction: chaine("Sa faction (clé ou nom) ; vide = aucune."),
      marche: chaine("Le marché (une foire : sa récolte vaut moins) ; vide = aucun."),
      accepter: booleen("troquer : true = passer outre un refus."),
      prejuge: chaine("troquer : qui joue d'un préjugé pour le prix (« groupe », un survivant : il porte « colporter ») ; vide = personne.")
    }),
    sensible: true,
    async executer({ action, biens, pnj, cibles, faction, marche, accepter, prejuge }) {
      api();
      const args = { donne: biensDe(biens, -1), recoit: biensDe(biens, 1), pnjId: pnjDe(pnj), cibles: ciblesDe(cibles), faction: factionDe(faction),
        marche: ref(marche) ? lieuDuMarche("marches", marche) : "" };
      if (!Object.keys(args.recoit).length && !Object.keys(args.donne).length) throw new Refus("rien à échanger (donne et recoit vides).");
      const troc = action === "troquer";
      const r = await appeler(troc ? "troquer" : "evaluerTroc", troc ? { ...args, accepter, prejuge: porteurDe(prejuge) } : args);
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      return { contenu: rendu({
        connu: [
          `Le groupe donne ${texteBiensTroc(args.donne)} (${parts(r?.valeurDonnee)} parts) contre ${texteBiensTroc(args.recoit)} (${parts(r?.valeurRecue)} parts) ; `
            + `${args.pnjId ? nomActeur(args.pnjId) : "l'autre"} en demande ${parts(r?.demandee)}.`,
          !troc ? `Évaluation : ${r?.accepte ? "il accepterait" : "il refuserait"}${r?.equitable ? " (échange équitable au cours)" : ""}.`
            : r?.ok ? `Troc fait.${abri ? ` Stocks : ${texteStocks(abri.system?.stocks)}.` : ""}` : `Refusé : ${brut(r?.raison) || "il n'y trouve pas son compte"}.`
        ],
        secret: [ligneConfiance(r?.confiance), (r?.usure?.uses ?? []).length ? `Ses préjugés s'usent : ${r.usure.uses.join(", ")}${(r.usure.tombes ?? []).length ? ` ; TOMBÉS : ${r.usure.tombes.join(", ")}` : ""}.` : "",
          ...lignesSens(r?.sens)]
      }) };
    }
  }),
  outil({
    nom: "survie_carnet",
    description: "Fénoir : une boutique et son carnet de crédit (en parts, au cours). « ouvrir » (nom, tenancier) ; « prendre » à crédit "
      + "(plafond 10 parts, moins si le tenancier se méfie) ; « rendre » ; « effacer » (le tenancier efface la dette : un cyclone, un deuil) ; "
      + "« solder » (au Nouvel An chinois). Une dette qui traîne 30 jours fait courir une rumeur.",
    schema: objet({
      action: choix(["ouvrir", "prendre", "rendre", "effacer", "solder"], "Ce qu'on fait."),
      boutique: chaine("La boutique (ouvrir : son nom) ; vide = la seule ouverte."),
      tenancier: chaine("ouvrir : le commerçant (un acteur) ; prendre : qui fait crédit, si ce n'est lui ; vide sinon."),
      biens: BIENS,
      cibles: liste(chaine("Communauté."), "prendre, rendre : ses préjugés éveillés ; vide = aucun."),
      faction: chaine("prendre : sa faction ; vide = aucune."),
      remise: booleen("solder : true = effacer ce que le groupe doit encore.")
    }),
    sensible: true,
    async executer({ action, boutique, tenancier, biens, cibles, faction, remise }) {
      api();
      if (action === "ouvrir") {
        if (!ref(boutique)) throw new Refus("donne le nom de la boutique.");
        const t = pnjDe(tenancier);
        const r = await appeler("ouvrirBoutique", { nom: ref(boutique), tenancier: t });
        return { contenu: rendu({ connu: [`Boutique ouverte : ${r?.boutique?.nom ?? boutique} [${r?.boutique?.cle ?? "?"}]${t ? `, tenue par ${nomActeur(t)}` : ""}, avec son carnet.`] }) };
      }
      const cle = lieuDuMarche("boutiques", boutique);
      const b = biensDe(biens);
      if (["prendre", "rendre"].includes(action) && !Object.keys(b).length) throw new Refus("dis quels biens (biens).");
      let r, ligne;
      if (action === "prendre") {
        r = await appeler("crediter", { boutique: cle, biens: b, ...(ref(tenancier) ? { pnjId: pnjDe(tenancier) } : {}), cibles: ciblesDe(cibles), faction: factionDe(faction) });
        ligne = r?.ok ? `Pris à crédit : ${texteBiensTroc(b)} (${parts(r.entree?.valeur)} parts) ; le groupe doit ${parts(r.dette)} part(s) sur un plafond de ${parts(r.plafond)}.`
          : `Pas de crédit : ${brut(r?.raison) || "refusé"}.`;
      } else if (action === "rendre") {
        r = await appeler("rendre", { boutique: cle, biens: b, cibles: ciblesDe(cibles) });
        ligne = `Rendu : ${texteBiensTroc(b)} (${parts(r?.paye)} parts payées) ; reste dû : ${parts(r?.reste)} part(s).`;
      } else if (action === "effacer") {
        r = await appeler("effacerDette", { boutique: cle, debiteur: GROUPE });
        ligne = `Le tenancier efface la dette du groupe (${parts(r?.efface)} part(s)).`;
      } else {
        r = await appeler("solderCarnet", { boutique: cle, remises: remise ? [GROUPE] : [] });
        const impaye = (r?.impayees ?? []).some(x => x.debiteur === GROUPE);
        ligne = r?.deja ? "Le carnet est déjà soldé cette année."
          : `Carnet soldé : ${(r?.remises ?? []).length ? "la dette du groupe est effacée" : impaye ? "le groupe doit encore : la dette traîne, la rumeur suivra"
            : (r?.soldes ?? []).includes(GROUPE) ? "le groupe a tout rendu (parole tenue : son plafond monte)" : "rien au nom du groupe"}.`;
      }
      return { contenu: rendu({ connu: [ligne], secret: [ligneConfiance(r?.confiance)] }) };
    }
  }),
  outil({
    nom: "survie_marche_forain",
    description: "Fénoir : un marché forain (jour fixe, conseil d'une voix par bastion, sous TRÊVE) ou une foire (trois jours, une récolte). "
      + "« ouvrir » (du contenu, ou le sien), « fermer », « accueillir » à l'abri (bruit, l'abri se voit, réputation auprès des bastions) ou "
      + "« rendre » l'accueil, « rompre » la trêve (toute l'île le sait ; le groupe : −3 de réputation par bastion, acte « attaquer »), « retablir ».",
    schema: objet({
      action: choix(["ouvrir", "fermer", "accueillir", "rendre", "rompre", "retablir"], "Ce qu'on fait."),
      marche: chaine("Le marché ; ouvrir : un marché du contenu ; vide = le seul ouvert."),
      foire: chaine("ouvrir : une foire du contenu ; vide sinon."),
      nom: chaine("ouvrir un marché à soi : son nom ; vide sinon."),
      jour_semaine: entier("ouvrir un marché à soi : 0 dimanche … 6 samedi."),
      bastions: liste(chaine("Faction, ou « groupe »."), "ouvrir : son conseil ; vide = aucun."),
      par: chaine("rompre : qui rompt (« groupe », un survivant, une faction) ; vide = le groupe.")
    }),
    sensible: true,
    async executer({ action, marche, foire, nom, jour_semaine, bastions, par }) {
      api();
      const contenu = lire("contenu");
      if (action === "ouvrir") {
        const f = ref(foire) ? cleDe("foires", foire, "une foire") : "";
        const modele = !f && ref(marche) ? cleDe("marches", marche, "un marché du contenu") : "";
        if (!f && !modele && !ref(nom)) throw new Refus("dis quel marché du contenu (marche), quelle foire, ou le nom d'un marché à soi.");
        const conseil = (bastions ?? []).map(ref).filter(Boolean).map(b => (estGroupe(b) ? GROUPE : trouverFiche(contenu?.factions, b)?.cle ?? b));
        const jour = Number.isInteger(jour_semaine) && jour_semaine >= 0 && jour_semaine <= 6 ? jour_semaine : 6;
        const r = await appeler("ouvrirMarche", { ...(f ? { foire: f } : modele ? { modele } : { nom: ref(nom), jourSemaine: jour }), bastions: conseil });
        const q = lire("quand") ?? {};
        return { contenu: rendu({ connu: [`Ouvert : ${r?.marche ? texteMarche(r.marche, { contenu, jour: q.jour ?? 0, date: q.date }) : ref(nom) || modele || f}.`] }) };
      }
      const cle = lieuDuMarche("marches", marche);
      if (action === "fermer") { await appeler("fermerMarche", { marche: cle }); return { contenu: rendu({ connu: [`Le marché ${cle} ferme.`] }) }; }
      if (action === "retablir") { await appeler("retablirTreve", { marche: cle }); return { contenu: rendu({ connu: [`La trêve du marché ${cle} est rétablie.`] }) }; }
      if (action === "accueillir" || action === "rendre") {
        const r = await appeler("accueillir", { marche: cle, hote: action === "accueillir" ? GROUPE : "" });
        return { contenu: rendu({ connu: [action === "accueillir" ? `Le groupe accueille le marché ${cle} à son abri : du bruit le jour du marché, l'abri se voit `
          + `(signature ${r?.signature ?? "?"}), un point de réputation par mois tenu auprès de chaque bastion.` : `Le groupe n'accueille plus le marché ${cle}.`] }) };
      }
      const qui = !ref(par) || estGroupe(par) ? GROUPE : survivant(par, { requis: false })?.id ?? trouverFiche(contenu?.factions, par)?.cle ?? ref(par);
      const r = await appeler("rompreTreve", { marche: cle, par: qui });
      const rep = Object.entries(r?.reputation ?? {}).map(([f, v]) => `${nomDe(contenu?.factions, f)} ${v}`).join(", ");
      return { contenu: rendu({ connu: [`TRÊVE ROMPUE au marché ${cle} par ${nomPorteur(qui)} : toute l'île le saura.${rep ? ` Réputation : ${rep}.` : ""}`], secret: lignesSens(r?.sens) }) };
    }
  }),
  outil({
    nom: "survie_rumeur",
    description: "Fénoir, le Ladi Lafé : « lancer » une rumeur (publique ; sa VÉRITÉ au secret) : qui colporte du mal porte l'acte « colporter » ; "
      + "contre le groupe, elle pèse sur la première confiance des PNJ. « dementir » par une preuve : une rumeur vraie ne se dément pas ; un "
      + "mensonge malveillant démenti se retourne contre son auteur.",
    schema: objet({
      action: choix(["lancer", "dementir"], "lancer, ou dementir."),
      sujet: chaine("lancer : de qui on parle ; vide = le groupe."),
      texte: chaine("lancer : ce qui se dit ; vide sinon."),
      vraie: booleen("lancer : c'est vrai."),
      malveillant: booleen("lancer : pour nuire."),
      auteur: chaine("lancer : qui la lance (« groupe », un survivant, un PNJ) ; vide = inconnu."),
      portee: choix(PORTEES_RUMEUR, "lancer : jusqu'où elle court."),
      contre: booleen("lancer : elle dessert son sujet."),
      rumeur: chaine("dementir : la rumeur (« r3 ») ; vide sinon."),
      preuve: choix(PREUVES, "dementir : la marque d'un objet, un témoin, les faits.")
    }),
    sensible: true,
    async executer({ action, sujet, texte, vraie, malveillant, auteur, portee, contre, rumeur, preuve }) {
      api();
      if (action === "dementir") {
        if (!ref(rumeur)) throw new Refus("dis quelle rumeur (rumeur : « r3 »).");
        const r = await appeler("dementir", { id: ref(rumeur), preuve });
        if (!r?.ok) return { contenu: rendu({ connu: [`Démenti impossible : ${brut(r?.raison) || "?"}.`] }) };
        return { contenu: rendu({ connu: [`La rumeur ${ref(rumeur)} est démentie (${preuve}) : elle cesse de peser.`],
          secret: [r.menteur ? `Le mensonge se retourne contre ${nomPorteur(r.menteur)} : une rumeur vraie court sur lui.` : "", ...lignesSens(r.sens)] }) };
      }
      if (!ref(texte)) throw new Refus("dis ce qui se dit (texte).");
      const s = !ref(sujet) || estGroupe(sujet) ? GROUPE : ref(sujet);
      const qui = porteurDe(auteur);
      const r = await appeler("rumeur", { sujet: s, texte: ref(texte), vraie, malveillant, auteur: qui, portee, contre });
      return { contenu: rendu({
        connu: [`Rumeur ${r?.id ?? "?"} (${portee}) sur ${nomPorteur(s)} : « ${ref(texte)} ». Fais-la entendre par la bouche des gens.`],
        secret: [`Elle est ${vraie ? "VRAIE" : "FAUSSE"}${malveillant ? ", malveillante" : ""}${qui ? `, lancée par ${nomPorteur(qui)}` : ""}.`, ...lignesSens(r?.sens)]
      }) };
    }
  }),
  outil({
    nom: "survie_prejuge",
    description: "Fénoir : les préjugés, traits d'un PNJ. « dementir » : les faits démentent un préjugé sous ses yeux (un cran de moins ; pnj "
      + "vide = tous ceux qui le portent). « ecrire » les préjugés d'un PNJ. « marchand » : un des gens du marché du contenu entre en jeu.",
    schema: objet({
      action: choix(["dementir", "ecrire", "marchand"], "Ce qu'on fait."),
      cible: chaine("dementir : la communauté visée ; marchand : qui (clé ou nom) ; vide sinon."),
      pnj: liste(chaine("Un acteur."), "dementir : ceux qui ont vu (vide = tous) ; ecrire : le PNJ (un seul)."),
      prejuges: liste(objet({ cible: chaine("Communauté."), poids: entier("1 à 3."), dit: chaine("Ce qu'il en dit.") }), "ecrire : ses préjugés (remplacent les anciens).")
    }),
    sensible: true,
    async executer({ action, cible, pnj, prejuges }) {
      api();
      const contenu = lire("contenu");
      const nomContenu = (collection, cle, genre = "") => nomDe(contenu?.[collection], cle, genre);
      if (action === "marchand") {
        const cle = cleDe("marchands", cible, "un des gens du marché");
        const r = await appeler("creerMarchand", { cle });
        const a = acteurDe(r?.acteurId);
        const resume = a ? resumeEnDeux(a, { nomContenu }) : { connu: [], secret: [] };
        return { contenu: rendu({ connu: [`${a?.name ?? cle} ${r?.deja ? "existe déjà" : "entre en jeu"} (PNJ du marché).`, ...resume.connu], secret: resume.secret }) };
      }
      const ids = (pnj ?? []).map(ref).filter(Boolean).map(x => survivant(x).id);
      if (action === "ecrire") {
        if (ids.length !== 1) throw new Refus("ecrire : un PNJ, et un seul (pnj).");
        const liste = (prejuges ?? []).filter(p => ref(p.cible)).map(p => ({ cible: ciblesDe([p.cible])[0], poids: Math.max(1, Math.min(3, Number(p.poids) || 1)), dit: ref(p.dit) }));
        await appeler("prejuges", { acteurId: ids[0], prejuges: liste });
        return { contenu: rendu({ secret: [`Préjugés de ${nomActeur(ids[0])} : ${textePrejuges(liste, nomContenu) || "aucun"}. Dans sa bouche seulement ; les faits les démentiront.`] }) };
      }
      const c = ciblesDe([cible])[0];
      if (!c) throw new Refus("dis quel préjugé les faits démentent (cible).");
      const r = await appeler("dementirPrejuge", { cible: c, pnj: ids });
      return { contenu: rendu({ secret: [`Les faits démentent le préjugé contre ${nomContenu("communautes", c)} : ${(r?.pnj ?? []).join(", ") || "personne ne le portait plus"} en rabat un cran. `
        + "Montre-le par un geste, un silence, une phrase qui change ; jamais par une leçon."] }) };
    }
  }),
  outil({
    nom: "survie_veillee",
    description: "Fénoir, les savoirs et le cyclone (le temps passe). « preparer_cyclone » (rentrer, fixer : quarts × bras, valable 5 jours) ; "
      + "« apprendre » un savoir (le soir à l'abri : livre, cahier de gramoune, maître du groupe) ; « confiance » d'une gramoune (test de "
      + "parole) ; « dicter » : la gramoune dicte son cahier (six veillées : ses savoirs lontan lui survivent) ; « apprivoiser » le chien errant.",
    schema: objet({
      action: choix(["preparer_cyclone", "apprendre", "confiance", "dicter", "apprivoiser"], "Ce qu'on fait."),
      personnage: chaine("apprendre : l'élève ; confiance, dicter : la gramoune ; apprivoiser : qui ; vide sinon."),
      autre: chaine("apprendre : le maître ; confiance : qui lui parle ; dicter : le scribe ; vide sinon."),
      savoir: chaine("apprendre : le savoir ; vide sinon."),
      source: choix(["", ...SOURCES_APPRENTISSAGE], "apprendre : d'où."),
      membres: MEMBRES,
      quarts: entier("preparer_cyclone : quarts (1 à 8).")
    }),
    sensible: false,
    async executer({ action, personnage, autre, savoir, source, membres: noms, quarts }) {
      api();
      const nomSavoir = cle => nomDe(lire("contenu")?.savoirs, cle);
      if (action === "preparer_cyclone") {
        const ids = membres(noms);
        const r = await appeler("preparerCyclone", { membres: ids, quarts: Math.max(1, quarts || 1) });
        return { contenu: rendu({ connu: [`${ids.map(nomActeur).join(", ")} préparent l'abri au cyclone : ${r?.fait ?? "?"}/${r?.requis ?? "?"} quarts-personne`
          + `${r?.prete ? " — PRÊT (valable cinq jours)" : ""} ; maintenant : ${quandTexte()}.`] }) };
      }
      const a = survivant(personnage);
      const b = ref(autre) ? survivant(autre) : null;
      if (action === "apprendre") {
        const cle = cleDe("savoirs", savoir, "un savoir");
        const src = source || (b ? "maitre" : "livre");
        if (src === "maitre" && !b) throw new Refus("apprendre d'un maître : dis qui (autre).");
        const r = await appeler("apprendre", { acteurId: a.id, savoir: cle, source: src, ...(src === "maitre" ? { maitreId: b.id } : {}) });
        return { contenu: rendu({ connu: [`${a.name} apprend ${nomSavoir(cle)} (${src}${src === "maitre" ? `, avec ${b.name}` : ""}) : ${r?.termine ? "APPRIS" : `${r?.fait ?? "?"}/${r?.requis ?? "?"} veillées`}`
          + `${r?.lumiere === "energie" ? " ; une unité d'énergie pour la lumière" : r?.lumiere === "bougie" ? " ; à la bougie (l'abri se voit un peu ce soir)" : ""} ; maintenant : ${quandTexte()}.`] }) };
      }
      if (action === "apprivoiser") {
        const r = await appeler("apprivoiser", { acteurId: a.id });
        return { contenu: rendu({ connu: [r?.apprivoise ? `Le chien suit ${a.name} : il est au groupe.`
          : `${a.name} pose à manger au chien : confiance ${r?.confiance ?? "?"}${r?.morsure ? " ; il a MORDU (une blessure)" : ""} ; maintenant : ${quandTexte()}.`] }) };
      }
      if (!b) throw new Refus(`${action} : dis qui ${action === "dicter" ? "écrit (le scribe)" : "lui parle"} (autre).`);
      if (action === "confiance") {
        const r = await appeler("gagnerConfiance", { acteurId: a.id, parleurId: b.id });
        return { contenu: rendu({ connu: [`Veillée de ${b.name} avec ${a.name} : confiance ${r?.confiance ?? "?"}/5 (${signeDe(r?.delta)}, ${r?.reussite ? "réussite" : "échec"}) ; `
          + `maintenant : ${quandTexte()}.`] }) };
      }
      const r = await appeler("dicter", { gramouneId: a.id, scribeId: b.id });
      return { contenu: rendu({ connu: [r?.termine ? `Le cahier de ${a.name} est écrit (porté par ${b.name}) : il apprend ${(r.enseigne ?? []).map(nomSavoir).join(", ") || "ses savoirs"}.`
        : `${a.name} dicte, ${b.name} écrit : ${r?.fait ?? "?"}/${r?.requis ?? "?"} veillées ; maintenant : ${quandTexte()}.`] }) };
    }
  }),
  outil({
    nom: "survie_porte",
    description: "Fénoir : la porte de l'abri (l'état du jeu dit qui attend). « frapper » : quelqu'un frappe maintenant. « accueillir » (recrue, "
      + "avec sa famille), « refuser » (exclure), « trahir » (prendre ce qu'il apporte, le chasser) : le groupe présent porte l'acte ; avec un "
      + "vote, qui a voté contre ne le porte pas, et le chef suit ou non.",
    schema: objet({
      action: choix(["frapper", "accueillir", "refuser", "trahir"], "Ce qui se passe."),
      visiteur: chaine("Le visiteur (« v2 » ou son nom) ; vide pour frapper."),
      profil: choix(["", ...PROFILS_VISITEUR], "frapper : son profil ; vide = selon la couleur du groupe."),
      vote: chaine("Le vote qui a précédé (« vote3 ») ; vide = aucun."),
      circonstances: booleen("Les témoins savent les circonstances (moitié moins).")
    }),
    sensible: true,
    async executer({ action, visiteur, profil, vote, circonstances }) {
      api();
      if (action === "frapper") return { contenu: rendu(texteVisiteur(await appeler("frapper", { profil }))) };
      const porte = lire("etat")?.porte ?? [];
      const v = porte.find(x => x.id === ref(visiteur)) ?? trouverFiche(porte.map(x => ({ ...x, cle: x.id })), visiteur);
      if (!v) throw new Refus(`visiteur introuvable : « ${visiteur} » (à la porte : ${porte.map(x => `${x.id} ${x.nom}`).join(", ") || "personne"}).`);
      const r = await appeler("porte", { visiteurId: v.id, decision: action, voteId: ref(vote), circonstances });
      return { contenu: rendu({
        connu: [action === "accueillir" ? `${v.nom} entre au groupe (recrue)${Number(r?.bouches) ? ` avec ${r.bouches} proche(s) à nourrir` : ""} : donne-lui une tâche (survie_assigner).`
          : action === "trahir" ? `Le groupe prend ce que ${v.nom} apportait (${texteBiensTroc(r?.pris)}) puis le chasse.` : `${v.nom} est refusé à la porte.`,
          r?.vote ? `Le chef ${r.vote.suivi ? "suit" : "N'A PAS SUIVI"} le vote${r.vote.suivi ? "" : " (l'entente baisse)"}.` : ""],
        secret: [r?.suite ? `Suite du refus : ${r.suite === "feu" ? "il reviendra mettre le FEU" : r.suite === "revient" ? "il reviendra, avec de quoi se faire accepter" : "il s'en va pour de bon"} (ne l'annonce pas).` : "",
          ...lignesSens(r)]
      }) };
    }
  }),
  outil({
    nom: "survie_vote",
    description: "Fénoir : le groupe vote sur un acte. « voter » : les voix données (joueurs, compagnons IA qui donnent la leur) ; les autres "
      + "selon leur sens moral ; un jeune de 16 à 18 ans, une demi-voix. « decider » : le chef suit le vote ou non, sans autre acte. L'acte "
      + "lui-même : survie_porte ou survie_acte_moral avec le vote.",
    schema: objet({
      action: choix(["voter", "decider"], "voter, ou decider."),
      question: chaine("voter : la question ; vide = l'acte."),
      acte: choix(["", ...ACTES_MORAUX], "voter : l'acte mis au vote."),
      voix: liste(objet({ personnage: chaine("Le votant."), voix: choix(VOIX, "Sa voix.") }), "voter : les voix données ; vide = selon leur jauge."),
      circonstances: booleen("voter : les circonstances pèsent (danger, faim)."),
      vote: chaine("decider : le vote (« vote3 ») ; vide sinon."),
      decision: choix(["pour", "contre"], "decider : pour = le chef fait ce que le vote a choisi.")
    }),
    sensible: true,
    async executer({ action, question, acte, voix, circonstances, vote, decision }) {
      api();
      if (action === "decider") {
        if (!ref(vote)) throw new Refus("dis quel vote (vote).");
        const r = await appeler("decider", { voteId: ref(vote), decision });
        return { contenu: rendu({ connu: [`Le chef ${r?.suivi === false ? "N'A PAS SUIVI le vote (l'entente baisse)" : "suit le vote"}${Number(r?.delta) ? ` (autorité ${signeDe(r.delta)})` : ""}.`] }) };
      }
      if (!acte) throw new Refus("dis quel acte est mis au vote (acte).");
      const donnees = Object.fromEntries((voix ?? []).filter(x => ref(x.personnage)).map(x => [survivant(x.personnage).id, x.voix]));
      const r = await appeler("voter", { question: ref(question), acte, voix: donnees, circonstances });
      const res = r?.resultat ?? {};
      const parVoix = Object.entries(r?.voix ?? {}).map(([id, v]) => `${nomActeur(id)} ${v}`).join(", ");
      return { contenu: rendu({ connu: [`Vote ${r?.id ?? "?"} « ${ref(question) || acte} » : pour ${res.pour ?? "?"}, contre ${res.contre ?? "?"}, abstention ${res.abstention ?? "?"}`
        + `${parVoix ? ` (${parVoix})` : ""}. Puis l'acte (survie_porte, survie_acte_moral avec ce vote) ou survie_vote decider.`] }) };
    }
  }),
  outil({
    nom: "survie_acte_moral",
    description: "Fénoir, le sens moral (du rouge : exclure, trahir, au bleu : accueillir, aider) : un acte porté par des survivants, vu par des "
      + "témoins (réputation) et par les enfants ; « colporter » : dire du mal de quelqu'un ; sans acte, un déplacement libre (delta). Avec un "
      + "vote, qui a voté contre ne le porte pas. Le résultat est au secret.",
    schema: objet({
      personnages: liste(chaine("Un survivant."), "Ceux qui portent l'acte."),
      acte: choix(["", ...ACTES_MORAUX], "L'acte ; vide = delta."),
      delta: entier("Sans acte : −3 à +3 ; 0 sinon."),
      circonstances: booleen("Les témoins savent les circonstances (moitié moins)."),
      temoins: booleen("Quelqu'un a vu (la réputation suit)."),
      vote: chaine("Le vote qui l'a décidé ; vide = aucun."),
      journal: booleen("L'inscrire à la chronique publique.")
    }),
    sensible: true,
    async executer({ personnages, acte, delta, circonstances, temoins, vote, journal }) {
      api();
      const ids = [...new Set((personnages ?? []).map(ref).filter(Boolean).map(x => survivant(x).id))];
      if (!ids.length) throw new Refus("dis qui porte l'acte (personnages).");
      if (!acte && !Number(delta)) throw new Refus("un acte, ou un delta non nul.");
      const r = await appeler("acteMoral", { acteurs: ids, ...(acte ? { acte } : { delta: Math.max(-3, Math.min(3, delta)) }), circonstances, temoins, voteId: ref(vote), journal });
      return { contenu: rendu({ connu: [`Acte noté : ${ids.map(nomActeur).join(", ")} — ${acte || `déplacement ${signeDe(delta)}`}`
        + `${(r?.epargnes ?? []).length ? ` (épargnés, ils avaient voté contre : ${r.epargnes.map(nomActeur).join(", ")})` : ""}.`,
        r?.vote ? `Le chef ${r.vote.suivi ? "suit" : "N'A PAS SUIVI"} le vote.` : ""], secret: lignesSens(r) }) };
    }
  }),
  outil({
    nom: "survie_communaute",
    description: "Fénoir, la communauté : « chef » (pas un jeune de 16 à 18 ans) ; « parole » du chef tenue ou manquée (autorité ±1) ; "
      + "« entente » (−3 à +3, sur le moral de chacun) ; « separer » (des partants avec leur part) ; « fusionner » un groupe parti ; « signe » : "
      + "un objet du cyclone, une coïncidence, que chacun lit selon sa foi ; « tribut » dû à une bande : payé, ou refusé (elle attaquera).",
    schema: objet({
      action: choix(["chef", "parole", "entente", "separer", "fusionner", "signe", "tribut"], "Ce qu'on fait."),
      qui: liste(chaine("Un survivant."), "chef : le chef (vide = personne) ; separer : les partants."),
      oui: booleen("parole : tenue ; tribut : payé."),
      delta: entier("entente : variation ; 0 sinon."),
      raison: chaine("parole, entente : pourquoi ; vide sinon."),
      cible: chaine("fusionner : le groupe parti (« c1 ») ; tribut : « t1 » ou la bande ; vide sinon."),
      nom: chaine("separer : nom du groupe qui part ; vide = tiré."),
      abri_aux: choix(["restants", "partants"], "separer : à qui va l'abri.")
    }),
    sensible: true,
    async executer({ action, qui, oui, delta, raison, cible, nom, abri_aux }) {
      api();
      const ids = (qui ?? []).map(ref).filter(Boolean).map(x => survivant(x).id);
      const etat = lire("etat");
      if (action === "chef") {
        await appeler("chef", { acteurId: ids[0] ?? "" });
        return { contenu: rendu({ connu: [ids[0] ? `${nomActeur(ids[0])} mène le groupe.` : "Le groupe n'a plus de chef."] }) };
      }
      if (action === "parole") {
        const r = await appeler("parole", { tenue: oui, raison: ref(raison) });
        return { contenu: rendu({ connu: [`Parole du chef ${oui ? "tenue" : "manquée"} : autorité ${r?.autorite ?? "?"}/5.`] }) };
      }
      if (action === "entente") {
        if (!Number(delta)) throw new Refus("entente : une variation non nulle (delta).");
        const r = await appeler("entente", { delta: Math.max(-3, Math.min(3, delta)), raison: ref(raison) });
        return { contenu: rendu({ connu: [`Entente du groupe : ${r?.entente ?? "?"} (de −3 à +3).`] }) };
      }
      if (action === "separer") {
        if (!ids.length) throw new Refus("separer : dis qui part (qui).");
        const r = await appeler("separer", { partants: ids, abriVaAux: abri_aux, nom: ref(nom) });
        return { contenu: rendu({ connu: [`${ids.map(nomActeur).join(", ")} partent : « ${r?.communaute?.nom ?? ref(nom)} » [${r?.communaute?.id ?? "?"}], avec leur part des stocks`
          + `${abri_aux === "partants" ? " et l'abri" : ""} ; tous gardent les plans.`] }) };
      }
      if (action === "fusionner") {
        const groupes = etat?.communautes ?? [];
        const g = groupes.find(x => x.id === ref(cible)) ?? trouverFiche(groupes.map(x => ({ ...x, cle: x.id })), cible);
        if (!g) throw new Refus(`groupe introuvable : « ${cible} » (${groupes.map(x => `${x.id} ${x.nom}`).join(", ") || "aucun groupe parti"}).`);
        const r = await appeler("fusionner", { communauteId: g.id });
        return { contenu: rendu({ connu: [`« ${g.nom} » rejoint le groupe : stocks et plans mis ensemble ; entente ${r?.entente ?? "?"}.`] }) };
      }
      if (action === "signe") {
        const r = await appeler("lireSigne", {});
        const l = r?.lectures ?? [];
        return { contenu: rendu({ connu: [`Chacun le lit selon sa foi : ${l.map(x => `${x.nom} ${({ signe: "y voit un SIGNE (+1 moral)", doute: "doute", rien: "n'y voit rien" })[x.lecture] ?? x.lecture}`).join(" ; ") || "personne"}. `
          + "Le jeu ne confirme ni ne dément rien : fais-le dire par eux."] }) };
      }
      const tributs = etat?.tributs ?? [];
      const actifs = tributs.filter(x => x.etat === "actif");
      const t = tributs.find(x => x.id === ref(cible)) ?? (ref(cible) ? trouverFiche(tributs.map(x => ({ ...x, cle: x.id, nom: x.bande })), cible) : actifs.length === 1 ? actifs[0] : null);
      if (!t) throw new Refus(`tribut introuvable : « ${cible} » (${tributs.map(x => `${x.id} ${x.bande}`).join(", ") || "aucun"}).`);
      const r = await appeler("tribut", { tributId: t.id, paye: oui });
      const issues = { paye: "payé", hausse: "payé, mais la bande AUGMENTE sa demande", alliance: "payé : la bande devient ALLIÉE", revolte: "REFUSÉ : la bande attaquera (une menace de sa force)" };
      return { contenu: rendu({ connu: [`Tribut ${t.id} à ${t.bande} : ${issues[r?.issue] ?? r?.issue ?? (oui ? "payé" : "refusé")}.`] }) };
    }
  }),
  outil({
    nom: "survie_esprit",
    description: "Fénoir, l'esprit d'un survivant. « lire » : son résumé, au secret son sens moral et ses préjugés. « ajuster » (vide ou 0 = "
      + "inchangé ; nombres : variations ; le sens moral passe par survie_acte_moral). « tirer » l'esprit d'une fiche qui n'en a pas (forcer : "
      + "le retirer). Rien de magique : la foi agit par le moral.",
    schema: objet({
      action: choix(["lire", "ajuster", "tirer"], "Ce qu'on fait."),
      personnage: chaine("Le survivant."),
      regard: choix(["", ...REGARDS], "Son regard."),
      religion: liste(chaine("Religion (clé ou nom)."), "Sa religion, « aucune », ou deux ou trois (plusieurs)."),
      pratique: choix(["", "oui", "non"], "Pratiquant."),
      ancrage: chaine("Ce qui fait tenir un non-croyant (clé ou nom)."),
      ancrage_perdu: choix(["", "oui", "non"], "A perdu son ancrage (la photo, le carnet)."),
      reputation: entier("Réputation."),
      autorite: entier("Autorité."),
      chance: entier("Chance."),
      forcer: booleen("tirer : retirer un esprit déjà tiré.")
    }),
    sensible: true,
    async executer(a) {
      api();
      const s = survivant(a.personnage);
      const contenu = lire("contenu");
      const nomContenu = (collection, cle, genre = "") => nomDe(contenu?.[collection], cle, genre);
      const resume = tete => { const r = resumeEnDeux(acteurDe(s.id) ?? s, { nomContenu }); return { connu: [tete, ...r.connu], secret: r.secret }; };
      if (a.action === "lire") return { contenu: rendu(resume("")) };
      if (a.action === "tirer") {
        const r = await appeler("tirerEsprit", { acteurId: s.id, forcer: a.forcer });
        return { contenu: rendu(resume(r?.deja ? `${s.name} a déjà un esprit (forcer pour le retirer).` : `Esprit tiré pour ${s.name}.`)) };
      }
      const sys = s.system ?? {};
      const borne = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));
      // Une religion (ou « aucune ») ; deux ou trois : « plusieurs » et la liste (espritDuTirage du système).
      const religions = (a.religion ?? []).filter(ref).map(r => cleDe("religions", r, "une religion"));
      const foi = religions.length > 1 ? { religion: "plusieurs", religions: religions.slice(0, 3) } : religions.length ? { religion: religions[0], religions: [] } : {};
      const champs = Object.fromEntries([
        ["regard", a.regard || undefined], ...Object.entries(foi),
        ["pratique", a.pratique ? a.pratique === "oui" : undefined], ["ancrage", ref(a.ancrage) ? cleDe("ancrages", a.ancrage, "un ancrage") : undefined],
        ["ancragePerdu", a.ancrage_perdu ? a.ancrage_perdu === "oui" : undefined],
        ["reputation", a.reputation ? borne((Number(sys.reputation) || 0) + a.reputation, -10, 10) : undefined],
        ["autorite", a.autorite ? borne((Number(sys.autorite ?? 2) || 0) + a.autorite, 0, 5) : undefined],
        ["chance", a.chance ? borne((Number(sys.esprit?.chance) || 0) + a.chance, 0, 3) : undefined]
      ].filter(([, v]) => v !== undefined));
      if (!Object.keys(champs).length) throw new Refus("rien à changer (tous les champs vides ou à 0).");
      await appeler("ajusterEsprit", { acteurId: s.id, ...champs });
      return { contenu: rendu(resume(`Esprit de ${s.name} ajusté (${Object.keys(champs).join(", ")}).`)) };
    }
  })
);
