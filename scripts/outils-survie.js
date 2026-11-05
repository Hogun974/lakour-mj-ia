// Outils du narrateur de « Fénoir » (système lakour-survie, monde lakour-fenoir ; docs/survie.md). Chacun appelle l'API du
// système, game.lakourSurvie (§5 du contrat docs/survie-contrat.md du dépôt lakour-fenoir), et rend à l'IA un texte court en
// deux blocs : « [connu des joueurs] » (ce que les personnages perçoivent, ce que le groupe croit) et « [secret MJ] » (le réel
// du monde, pour le narrateur seul). Les outils qui écrivent passent TOUS par l'API, qui refuse hors du MJ actif ou tant que le
// monde n'est pas ouvert (coffre) : le refus revient à l'IA, rien n'est écrit en douce. Ajoutés à OUTILS par outils.js.
import { versHTML } from "./utilitaires.js";
import { packDeContenu, CONTENUS } from "./contenus.js";
import {
  CLES_COMPETENCES, RESSOURCES, DIFFICULTES_SURVIE, convertirDifficulte, apiSurvie, fonctionSurvie, lireSurvie, messageErreurSurvie,
  trouverFiche, listeDe, nomDe, voisinsDe, texteQuand, texteStocks, texteVariations, texteTest, ligneRenseignement, ligneReel,
  lignesSurvie, lignesMenaces, rendu, resumerSurvivant, etatCourt, jourDuQuart, libelleRessource, TACHES, STATUTS,
  dansLeBudget, sommeNiveaux, resumerTirage, lignesBesoins, repartirTaches, resumerRecrue,
  resoudreTransport, vehiculesDu, ligneVehicule, ligneTransport, portentVehicule
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
const LIBELLES_COLLECTIONS = { regions: "régions", sites: "sites", installations: "installations", recettes: "recettes", afflictions: "afflictions" };
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
      cible: choix(["", ...RESSOURCES_PILLABLES, ...NATURE], "Ressource cherchée en priorité dans les maisons et commerces, ou la nature alentour "
        + "(cueillette, gibier, peche : nourriture ; bois : matériaux) ; vide = tout ce qui se trouve."),
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
      + "fuite possible). Raconte l'assaut d'après le résultat.",
    schema: objet({
      force: entier("Force de la menace en d6 (1 à 10 : une poignée de Livides 2, une horde 6 à 10, une bande armée 4 à 7)."),
      type: chaine("Nature de la menace (« horde », « bande », « chiens »…) ; vide = inconnue."),
      description: chaine("Ce qui arrive, en une phrase (inscrit à la chronique) ; vide = rien de plus.")
    }),
    sensible: true,
    async executer({ force, type, description }) {
      api();
      if (!Number.isInteger(force) || force < 1 || force > 10) throw new Refus("force : de 1 à 10 dés.");
      const r = await appeler("assaut", { force, type: type.trim(), description: description.trim() });
      const blesses = (r?.blesses ?? []).map(b => (typeof b === "string" ? nomActeur(b) : b?.nom ?? nomActeur(b?.acteurId ?? b?.id)));
      const degats = Array.isArray(r?.degats) ? r.degats.map(d => (typeof d === "string" ? d : d?.nom ?? d?.installation ?? "?")).join(", ") : r?.degats;
      return { contenu: rendu({ connu: [
        `Assaut (${type.trim() || "?"}, force ${force}) : ${ISSUES_ASSAUT[r?.issue] ?? r?.issue ?? "?"} (marge ${r?.marge ?? "?"}).`,
        degats ? `Dégâts : ${degats}.` : "", blesses.length ? `Blessés : ${blesses.join(", ")}.` : "",
        r?.issue === "breche" || Number(r?.marge) <= -2 ? "BRÈCHE : joue la scène (combat simple, §1.7) ; la fuite est une vraie option." : ""
      ] }) };
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
  outil({
    nom: "survie_feter",
    description: "Fénoir : le groupe fête une fête au camp (Noël en plein été, le 20 décembre, le Nouvel An…) : une ration de plus par "
      + "personne, +1 de moral pour chacun, une fois par fête (le système refuse la seconde). Seulement si les joueurs le décident ; "
      + "une fête, ça s'entend (bruit) et ça se voit : raconte-le.",
    schema: objet({
      fete: chaine("La fête (clé du calendrier de Fénoir : « noel », « liberte », « nouvel-an »…) ; vide = la fête du jour DE JEU, que le "
        + "système trouve d'après la date de la partie (pas celle des joueurs) ; il refuse s'il n'y en a pas.")
    }),
    sensible: true,
    async executer({ fete }) {
      api();
      // Fête vide : le système la cherche à la date DE JEU (api.feter) ; la fête du calendrier réel des joueurs (fetes.js) n'est pas
      // la bonne : la date de Fénoir est une autre.
      const r = await appeler("feter", { fete: fete.trim() });
      const abri = acteurDe(lire("etat")?.groupe?.abri);
      const nom = String(r?.fete || fete.trim() || "la fête du jour");
      return { contenu: rendu({ connu: [
        `Le groupe fête ${nom} au camp : une ration de plus chacun, +1 de moral.`,
        brut(r?.texte),
        abri ? `Stocks : ${texteStocks(abri.system?.stocks)}.` : ""
      ] }) };
    }
  })
];

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
// Le jeton d'un passé, au même chemin que le système (api.mjs : JETON_PASSE, dans le module de contenu de base).
const JETON_PASSE = cle => `modules/${CONTENUS[SURVIE[0]]}/assets/jetons/joueurs/${cle}.svg`;
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
  traits: liste(chaine("Trait gardé (clé ou nom)."), "Traits gardés (vide = tirés).")
});
// Les verrous non vides, résolus dans le contenu quand c'est possible.
function verrousDe(v = {}) {
  const contenu = lire("contenu");
  const cle = (collection, ref) => (contenu?.[collection] ? trouverFiche(contenu[collection], ref)?.cle ?? ref.trim() : ref.trim());
  const traits = (v.traits ?? []).filter(t => t.trim());
  return Object.fromEntries([
    ["nom", v.nom?.trim()], ["age", v.age > 0 ? v.age : null],
    ["enfance", v.enfance?.trim() ? cle("enfances", v.enfance) : null], ["passe", v.passe?.trim() ? cle("passes", v.passe) : null],
    ["traits", traits.length ? traits.map(t => cle("traits", t)) : null]
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
    + "proposer au joueur (verrous : ce qu'il garde — nom, âge, enfance, passé, traits — pour relancer le reste). Puis « creer » avec la "
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
        const jeton = passeConnu ? JETON_PASSE(passeConnu) : null;
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
      + "proposent de les rejoindre, le test de parole du parleur décide ; réussi, il entre au groupe (statut recrue).",
    schema: objet({
      action: choix(["generer", "recruter"], "generer une recrue, ou la recruter."),
      region: chaine("generer : région où on la croise (clé ou nom) ; vide = celle du groupe."),
      recrue: chaine("recruter : identifiant de la recrue rendu par generer (« R1 ») ; vide sinon."),
      parleur: chaine("recruter : le survivant qui la convainc (test de parole) ; vide sinon."),
      attitude: choix(["", "amicale", "neutre", "mefiante", "hostile"], "recruter : l'attitude de la recrue envers le groupe (elle règle la difficulté "
        + "du test : amicale facile, neutre normale, méfiante difficile, hostile extrême ; un cran de moins si elle comble un manque) ; vide = neutre.")
    }),
    sensible: true,
    async executer({ action, region, recrue, parleur, attitude }) {
      api();
      if (action === "generer") {
        const cle = cleDe("regions", region, "une région", { defaut: regionDuGroupe() });
        const d = await appeler("genererRecrue", { region: cle });
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

