import { ID, prixDuModele, coutDe } from "./constantes.js";
import { lire, ecrire } from "./reglages.js";
import { fournisseurTexte, fournisseurCompagnons, modeleCompagnons, expliquerErreur } from "./fournisseurs/index.js";
import { OUTILS, outil, resumerAppel, outilsDuSysteme } from "./outils.js";
import { promptSysteme, etatDuJeu, decrireMessage, messagePourIA } from "./contexte.js";
import { versHTML, lireJSON, ecrireJSON } from "./utilitaires.js";
import { validerSchema } from "./schema.js";
import { VoixEnDirect, direReplique } from "./voix.js";
import { estSilence } from "./voix-texte.js";
import { Compagnons, effacerPrive } from "./compagnons-jeu.js";
import { peuventReagir, estAnnonceSysteme } from "./compagnons.js";
import { PiloteAutomatique, attendreFinVoix } from "./pilote.js";

const MAX_TOURS_OUTILS = 12;
const HORS_SEANCE_VIDE = { cout: 0, appels: 0, depuis: 0 };
const MAX_TOURS_PLATEAU = 3;
// Demandes adressées aux joueurs : pendant le brouillon, elles attendent que la narration soit affichée.
const DIFFEREES = ["demander_jet", "demander_des"];

// Mise en place : l'IA écrit d'abord sa réponse SANS qu'elle s'affiche, puis place sur le plateau exactement ce
// qu'elle décrit (qui est où), et c'est seulement ensuite que la narration paraît. Le plateau suit ainsi le récit,
// y compris les personnages que l'IA invente en écrivant.
export const CONSIGNE_BROUILLON = "[Déroulement] Fais d'abord tes appels d'outils s'il en faut (consulter des documents, changer de lieu : "
  + "creer_scene, amener_joueurs), puis écris ta réponse aux joueurs UNE seule fois, complète, dans ta dernière réponse : seule celle-ci "
  + "sera affichée, après la mise en place du plateau qu'on te demandera ensuite. Ne place pas encore les jetons.";
export const CONSIGNE_PLATEAU = [
  "[Mise en place] Ta narration ci-dessus n'est pas encore affichée. Mets maintenant le plateau en accord avec elle, en un appel à mettre_en_scene :",
  "- chaque personnage joueur à l'endroit décrit ;",
  "- chaque PNJ nommé ou simplement décrit (« une petite vieille », « un marchand ») qui est là, avec pres_de quand le texte le situe "
    + "(près du puits, au seuil d'une échoppe, à côté d'un personnage) ; cache true s'il est là mais pas encore visible des joueurs ;",
  "- les groupes anonymes et les foules en figurants (pres_de pour un groupe situé : « deux gardes près du puits ») ;",
  "- le retrait de ce qui n'y est plus.",
  "Sers-toi de la carte (vue de dessus) de l'état du jeu pour situer chacun ; personne ne se pose sur un étal, un puits ou un autre obstacle.",
  "Tu recevras ensuite le plateau obtenu : compare-le à ta narration et corrige ce qui ne va pas (placer_jetons, retirer_jetons, figurants), "
    + "ou réponds seulement « plateau prêt ».",
  "N'écris rien d'autre. Si le plateau correspond déjà, réponds seulement « plateau prêt »."
].join("\n");

// Création de personnage guidée par l'IA, dans le chat, avec les dés : la même consigne sert au bouton de la console
// et à la parenthèse faite pour un joueur connecté sans personnage (enParenthese).
export function consigneCreation(nomJoueur, { enParenthese = false, systeme = "impmal" } = {}) {
  return [
    `[Création de personnage — à mener maintenant avec ${nomJoueur}]`,
    ...(systeme === "dnd5e" ? etapesDnd5e(nomJoueur) : etapesImpmal(nomJoueur)),
    "Reste dans ta personnalité, mais sois clair sur les règles. Une question à la fois.",
    ...(enParenthese ? [
      `C'est une parenthèse dans la partie en cours : préviens brièvement les autres joueurs (« un instant, ${nomJoueur} nous rejoint »), `
        + "garde chaque étape courte, puis, la fiche créée, fais entrer le personnage dans la scène (amener_joueurs ou mettre_en_scene) "
        + "et reprends le fil là où il en était."
    ] : [])
  ].join("\n");
}

// ---------- Veillées de Brumecombe : chaque partie repart de zéro pour le narrateur (fil neuf, sans mémoire des précédentes).
export const OUVERTURE_NOUVELLE_PARTIE = "Nouvelle partie : la précédente est finie et archivée, ne la raconte pas et n'y fais aucune allusion. "
  + "Présente le village, annonce la composition sans dire qui (les rôles en jeu, groupés par camp), et lance la première nuit (loups_nuit).";
export const OUVERTURE_NOUVELLE_VEILLEE = "Nouvelle veillée, sans aucune partie précédente à rappeler. Accueille les joueurs, propose une composition "
  + "équilibrée (loups_composer) pour les joueurs présents (et des compagnons IA s'ils en veulent), puis loups_distribuer.";
export const OUVERTURE_PARTIE_EN_COURS = "La séance reprend en pleine partie. En une phrase, dis où en est le village (phase et tour : voir l'état du jeu), "
  + "sans rappeler aucune autre partie, puis continue.";
export const PARTIE_DEJA_ANNONCEE = "Nouvelle partie distribuée et déjà annoncée dans le fil précédent (archivé) : poursuis-la, sans jamais évoquer "
  + "une partie précédente.";

// Pour le narrateur seul : qui tient quel rôle dans la partie qui commence (le fil neuf ne contient pas la distribution).
export function distributionSecrete(api = game.lakourLoups) {
  const lignes = (api?.villageois?.() ?? []).map(a => {
    const role = a.items?.find?.(i => i.type === "role");
    const qui = a.system?.joueur ? game.users.get(a.system.joueur)?.name ?? "joueur" : "compagnon IA";
    return `- ${a.name} (${qui}) : ${role?.name ?? "?"}, camp ${a.system?.camp ?? role?.system?.camp ?? "?"}`;
  });
  return lignes.length ? `[Distribution — secret, pour toi seul]\n${lignes.join("\n")}` : "";
}

// La partie des Veillées en cours (phase ni « preparation » ni « fin ») ?
const partieLoupsEnCours = api => {
  const e = api?.etat?.();
  return Boolean(e && !e.vainqueur && !["preparation", "fin"].includes(e.phase));
};
const filNonVide = fil => Boolean(fil?.messages?.length || fil?.elements?.length);

// Systèmes où la création guidée existe.
export const CREATION_GUIDEE = ["impmal", "dnd5e"];

function etapesDnd5e(nomJoueur) {
  return [
    `Guide ${nomJoueur} pas à pas, une étape par message, en attendant sa réponse dans le chat avant de passer à la suivante :`,
    "1. Demande-lui son idée de personnage en deux ou trois phrases (concept, ambiance, faction s'il y en a).",
    "2. Peuple : présente les peuples jouables (chercher_compendium, type Item, requête « peuple » ou le guide du joueur du monde), il en choisit un.",
    "3. Classe : propose les classes qui collent à son concept (le guide du joueur dit quelle classe pour quel archétype), il en choisit une.",
    "4. Historique : présente ceux du compendium des historiques, il en choisit un.",
    `5. Caractéristiques : tableau standard (15, 14, 13, 12, 10, 8) ou tirage (demander_des avec joueur « ${nomJoueur} », formule « 4d6kh3 », nombre 6). `
      + "Il répartit les six valeurs sur For, Dex, Con, Int, Sag, Cha (conseille selon sa classe) ; les bonus d'historique viendront ensuite.",
    "6. Nom, apparence, ambition.",
    "7. Choix restants, posés au joueur en une ou deux questions : compétences de classe et d'historique, bonus d'historique (+2/+1 ou +1/+1/+1), "
      + "don ou sorts si son peuple, son historique ou sa classe en demandent (lis-les avec lire_document), équipement de départ ou or.",
    "8. Récapitule, demande confirmation, puis appelle creer_personnage_dnd5e avec les uuid exacts : c'est TOI qui crées la fiche complète, "
      + "le joueur n'a rien à faire sur sa fiche. Annonce-lui ensuite ses caractéristiques, PV, compétences et équipement."
  ];
}

function etapesImpmal(nomJoueur) {
  return [
    `Guide ${nomJoueur} pas à pas, une étape par message, en attendant sa réponse dans le chat avant de passer à la suivante :`,
    "1. Demande-lui son idée de personnage en deux ou trois phrases (concept, ambiance).",
    `2. Caractéristiques : appelle demander_des avec joueur « ${nomJoueur} », formule « 2d10+20 », nombre 9. `
      + "Quand les neuf résultats arrivent (garde la première série s'il y en a plusieurs), laisse le joueur les répartir sur CC, CT, F, E, Ag, Int, Per, FM, Soc, ou propose une répartition qui colle à son concept.",
    "3. Origine : tire sur la table « Origines » avec lancer_table (ou laisse-le choisir s'il préfère, sans le bonus d'expérience du tirage). "
      + "Lis l'origine avec lire_document : il choisit UNE ligne de compétences et UNE caractéristique bonus parmi les choix.",
    "4. Faction : tire avec lancer_table sur l'uuid factionTable de l'origine. Lis la faction : il répartit 5 avances entre ses compétences, choisit sa caractéristique bonus, un talent et un paquetage parmi les options.",
    "5. Rôle : présente les rôles (chercher_compendium, requête « role », type Item), il en choisit un. Lis-le : avances de compétences, spécialisations (cherche-les avec la requête « specialisation »), talent et équipement selon le rôle.",
    "6. Nom, apparence, ambition.",
    "7. Récapitule tout, demande confirmation, puis appelle creer_personnage avec les uuid exacts lus dans les documents. "
      + "Expérience de départ : 25 PX si l'origine a été tirée, 75 PX si la faction a été tirée."
  ];
}

// Le moteur ne tourne que dans le navigateur du MJ actif (c'est là que vit la clé).
export class MoteurMJ {
  constructor() {
    this.attente = [];        // messages de joueurs pas encore transmis
    this.minuterie = null;
    this.enCours = false;
    this.chaine = Promise.resolve();   // file d'attente des tours
    this.fil = null;
    this.fournisseur = null;
    this.systeme = null;
    // Compagnons IA : chacun son cerveau (appel séparé, contexte restreint), même compteur et même budget que le MJ.
    // Leur voix (mode OpenAI) : chacun la sienne, entendue seulement de ceux qui peuvent l'entendre (voix.js).
    this.compagnons = new Compagnons({ moteur: this, fournisseur: fournisseurCompagnons, modele: () => modeleCompagnons(),
      dire: (acteur, texte, message) => direReplique(acteur, texte, message) });
    // Pilote automatique : quand il ne reste que des compagnons IA (mode autonome), la partie continue seule (pilote.js).
    this.toursEnFile = 0;     // tours demandés et pas encore finis (en cours ou en attente dans la chaîne)
    this.vidages = 0;         // lots de messages en cours de traitement (réponse du MJ, puis réactions des compagnons)
    this.pilote = new PiloteAutomatique({ moteur: this, attendreVoix: () => attendreFinVoix(), etatDuJeu });
  }

  get personnalite() {
    const toutes = lire("personnalites");
    return toutes.find(p => p.id === lire("personnaliteActive")) ?? toutes[0];
  }

  get actif() {
    return lire("seance").active && game.user === game.users.activeGM;
  }

  // ---------- Séance

  // silencieux : ouvre la séance sans la narration d'ouverture (la création de personnage enchaîne aussitôt).
  async demarrer({ silencieux = false } = {}) {
    this.fournisseur = fournisseurTexte();
    if (!this.fournisseur) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasDeCle"));
    // Un fil par monde et par fournisseur : changer de fournisseur repart d'un fil neuf,
    // la mémoire de campagne assure la continuité.
    const sauve = await lireJSON("fils", this.nomFichier());
    this.fil = sauve?.fournisseur === this.fournisseur.nom ? sauve : this.fournisseur.nouveauFil();
    // Aux Veillées, hors d'une partie en cours, la séance commence une partie neuve : l'ancien fil est archivé, les compagnons oublient.
    const loups = game.system.id === "lakour-loups" ? game.lakourLoups : null;
    const enPartie = loups && partieLoupsEnCours(loups);
    if (loups && !enPartie) {
      await this.#archiverFil(sauve);
      this.fil = this.fournisseur.nouveauFil();
      await effacerPrive();
    }
    this.systeme = await promptSysteme(this.personnalite);
    await ecrire("seance", { active: true, debut: Date.now(), jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 });
    this.pilote.suspendu = false;
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Seance.Demarree"));
    // Foundry met le jeu en pause à chaque lancement du monde : le MJ IA la lève pour que les joueurs jouent.
    if (game.paused) game.togglePause(false, { broadcast: true });
    if (silencieux) return;
    const distribuee = loups && loups.etat().phase === "preparation" && loups.villageois().some(a => a.items?.find?.(i => i.type === "role"));
    const ouverture = loups
      ? (enPartie ? OUVERTURE_PARTIE_EN_COURS : distribuee ? `${distributionSecrete(loups)}\n\n${OUVERTURE_NOUVELLE_PARTIE}` : OUVERTURE_NOUVELLE_VEILLEE)
      : filNonVide(this.fil)
      ? "La séance reprend. En deux ou trois phrases, « Précédemment… », rappelle où en était l'histoire (mémoire de campagne, chronique), "
        + "puis relance la scène avec son ambiance sonore."
      : "C'est la toute première séance. Présente le cadre, accueille les personnages et lance une première scène.";
    // Joueurs déjà connectés sans personnage : la création se fera en parenthèse, juste après l'ouverture.
    for (const u of this.joueursSansPersonnage()) setTimeout(() => this.proposerCreation(u), 0);
    return this.tour(`[Ouverture de séance]\n${etatDuJeu()}\n\n${ouverture}`, { miseEnPlace: this.miseEnPlaceVoulue() });
  }

  async arreter() {
    if (!lire("seance").active) return;
    clearTimeout(this.minuterie);
    this.pilote.arreter("seance");
    await this.tour("[Fin de séance] Donne l'expérience méritée (donner_xp), écris pour les joueurs le résumé de la séance dans la chronique "
      + "(ecrire_chronique, sans les secrets du MJ), coupe l'ambiance sonore (ambiance_sonore « aucune »). "
      + "Mets à jour la mémoire de campagne avec noter_memoire : résumé de la séance, "
      + "PNJ rencontrés, lieux, fils ouverts. Puis dis au revoir aux joueurs en une phrase.");
    await ecrire("seance", { ...lire("seance"), active: false });
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Seance.Arretee"));
  }

  // ---------- Veillées : une nouvelle partie (loups_distribuer, loups_rejouer, hook lakourLoups.nouvellePartie, Table de jeu).
  // Le fil de la partie précédente est archivé (autre nom, dans Data/lakour-mj-ia/fils/, jamais supprimé) et un fil NEUF commence,
  // avec un prompt système recalculé (les nouveaux rôles) ; les compagnons IA oublient la partie précédente.
  // ouverture : le narrateur ouvre la nouvelle partie dans le fil neuf (présente le village, annonce la composition sans dire
  // qui, lance la première nuit) ; sinon (loups_distribuer, où il vient de l'annoncer), le fil neuf commence par la distribution.
  // Passe dans la file des tours : appelée par un outil pendant un tour, elle attend la fin de ce tour (la partie précédente
  // finit dans son fil). Plusieurs demandes rapprochées (outil et hook) n'en font qu'une.
  nouvellePartie({ ouverture = false } = {}) {
    if (game.user !== game.users.activeGM) return Promise.resolve(null);
    effacerPrive().catch(e => console.error(`${ID} | mémoire des compagnons`, e));
    this.pilote.suspendu = false;
    if (!this.actif || !this.fil || !this.fournisseur) return Promise.resolve(null);
    if (this.partieDemandee) {
      this.partieDemandee.ouverture ||= ouverture;
      return this.partieDemandee.promesse;
    }
    const demande = { ouverture };
    this.partieDemandee = demande;
    this.toursEnFile++;
    demande.promesse = this.chaine.then(() => this.#commencerPartie(demande)).finally(() => { this.toursEnFile--; });
    this.chaine = demande.promesse.catch(() => null);
    return demande.promesse;
  }

  async #commencerPartie(demande) {
    this.partieDemandee = null;
    await this.#archiverFil(this.fil);
    this.fil = this.fournisseur.nouveauFil();
    try { this.systeme = await promptSysteme(this.personnalite); } catch (e) { console.error(`${ID} | prompt système`, e); }
    await ecrireJSON("fils", this.nomFichier(), this.fil).catch(e => console.error(`${ID} | sauvegarde du fil`, e));
    const distribution = distributionSecrete();
    if (!demande.ouverture) {
      this.preambule = [distribution, PARTIE_DEJA_ANNONCEE].filter(Boolean).join("\n");
      return this.fil;
    }
    this.preambule = "";
    // Déjà dans la file des tours : le tour d'ouverture passe tout de suite (this.tour attendrait la fin de cette étape).
    await this.#tour(`[Nouvelle partie]\n${etatDuJeu()}\n\n${distribution}\n\n${OUVERTURE_NOUVELLE_PARTIE}`, { miseEnPlace: false });
    return this.fil;
  }

  // Le fil d'une partie finie, gardé sous un autre nom (<monde>-partie-<date>.json) ; un fil vide n'est pas archivé.
  async #archiverFil(fil) {
    if (!filNonVide(fil)) return null;
    const nom = `${game.world.id}-partie-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}.json`;
    try {
      await ecrireJSON("fils", nom, fil);
      return nom;
    } catch (e) {
      console.error(`${ID} | archive du fil`, e);
      return null;
    }
  }

  // Joueurs connectés qui n'ont pas encore de personnage.
  joueursSansPersonnage() {
    return game.users.filter(u => !u.isGM && u.active && !u.character);
  }

  // Un joueur sans personnage est là (connecté avant ou pendant la séance) : l'IA fait une parenthèse pour qu'il le crée.
  // Une seule fois par joueur et par séance ; seulement là où la création guidée existe (Imperium Maledictum).
  proposerCreation(utilisateur) {
    if (!this.actif || utilisateur.isGM || utilisateur.character || !CREATION_GUIDEE.includes(game.system.id)) return;
    this.creationsProposees ??= new Set();
    if (this.creationsProposees.has(utilisateur.id)) return;
    this.creationsProposees.add(utilisateur.id);
    this.signaler(`[Joueur sans personnage] ${utilisateur.name} est connecté mais n'a pas de personnage.\n`
      + consigneCreation(utilisateur.name, { enParenthese: true, systeme: game.system.id }), { fusion: `creation-${utilisateur.id}` });
  }

  nomFichier() {
    return `${game.world.id}.json`;
  }

  // ---------- Messages des joueurs et événements du plateau (une seule file d'attente)

  recevoir(message) {
    if (!this.actif || !messagePourIA(message)) return;
    // Une annonce du système des Veillées (mort, vote…) : le MJ la lit, mais elle ne réveille pas les compagnons. Pendant le pilote
    // automatique, celles qui naissent d'un tour du MJ viennent de ses propres outils (aucun humain vivant n'agit) : il les a déjà.
    if (estAnnonceSysteme(message.content)) {
      if (this.enCours && this.pilote.enMarche) return;
      return this.signaler(decrireMessage(message), { source: "annonce" });
    }
    // Une réplique de compagnon IA arrive comme un message de joueur, mais ne relance pas les compagnons (pas de boucle).
    this.signaler(decrireMessage(message), { source: message.flags?.[ID]?.compagnon ? "compagnon" : "humain" });
  }

  // fusion : une clé ; un nouvel événement de même clé remplace l'ancien (ex. la dernière position d'un jeton).
  // immediat : on répond vite (tour d'un PNJ en combat) au lieu d'attendre que les joueurs aient fini.
  // source : "humain" (message de joueur), "compagnon" (réplique ou action d'un compagnon IA), "evenement" (plateau, vote…).
  signaler(texte, { fusion = null, immediat = false, source = "evenement" } = {}) {
    if (!this.actif) return;
    if (fusion) this.attente = this.attente.filter(e => e.fusion !== fusion);
    this.attente.push({ texte, fusion, source });
    // On attend que les joueurs aient fini d'écrire ou de bouger, pour répondre à tout le groupe d'un coup.
    clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => this.vider(), immediat ? 500 : lire("delaiReponse") * 1000);
  }

  async vider() {
    if (this.enCours || !this.attente.length) return;
    // Tour de table en cours (tour-par-tour.js) : le MJ IA attend que chacun ait parlé (ou passé) avant de raconter ; la fin
    // du tour de table lui est signalée et relance la file.
    if (this.tourParTour?.retientIA?.()) return;
    const lot = this.attente.splice(0);
    const textes = lot.map(e => e.texte);
    // Compté jusqu'à la fin des réactions des compagnons : le pilote automatique attend que tout soit retombé.
    this.vidages++;
    try {
      await this.tour(`[État du jeu]\n${etatDuJeu()}\n\n[Messages et actions des joueurs]\n${textes.join("\n")}`, { miseEnPlace: this.miseEnPlaceVoulue() });
      await this.faireReagirCompagnons(lot);
    } finally {
      this.vidages--;
    }
  }

  // Après la réponse du MJ, les compagnons présents peuvent réagir (au plus le bavardage réglé, une réplique chacun) ;
  // leurs répliques entrent ensuite dans la file comme des messages de joueurs. Jamais quand le lot ne contenait que des
  // répliques de compagnons (pas de boucle entre compagnons sans message humain), ni en plein combat (ils agissent à leur tour),
  // ni pendant un tour de table (ils parlent quand vient leur tour de parole).
  async faireReagirCompagnons(lot) {
    if (!this.actif || !peuventReagir(lot) || game.combats?.active?.started || this.tourParTour?.tableActive?.()) return [];
    try {
      return await this.compagnons.reagir({ mentions: lot.map(e => e.texte).join("\n") });
    } catch (erreur) {
      console.error(`${ID} | compagnons`, erreur);
      return [];
    }
  }

  // Mise en place avant chaque réponse, sauf en plein combat (les tours des PNJ doivent rester rapides).
  miseEnPlaceVoulue() {
    return lire("miseEnPlace") && !game.combats.active?.started;
  }

  // ---------- Création de personnage avec un joueur, dans le fil de la séance (le joueur répond dans le chat)

  async creerPersonnage(nomJoueur) {
    if (!CREATION_GUIDEE.includes(game.system.id)) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.CreationImpmal"));
    if (!lire("seance").active) await this.demarrer({ silencieux: true });
    if (!lire("seance").active) return;
    const consigne = consigneCreation(nomJoueur, { systeme: game.system.id });
    return this.tour(consigne);
  }

  // ---------- Préparation d'un scénario (hors séance, fil à part, réponses chuchotées au MJ)

  async genererScenario(theme) {
    this.fournisseur ??= fournisseurTexte();
    if (!this.fournisseur) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasDeCle"));
    const mission = "Tu prépares un scénario pour le MJ humain, hors séance. Les joueurs ne voient rien de ce travail.";
    const systeme = await promptSysteme(this.personnalite, { mission });
    const outils = OUTILS.filter(o => ["chercher_compendium", "lire_document", "creer_journal", "creer_pnj", "noter_memoire", "illustrer"].includes(o.nom));
    const consigne = [
      `Prépare un scénario jouable en une à trois séances pour ces personnages, sur ce thème : ${theme}`,
      "1. Cherche dans les compendiums les lieux, PNJ, objets et règles officiels utiles, et lis-les.",
      "2. Crée un journal secret (visible_joueurs false) « Scénario — <titre> » : synopsis, accroche, 3 à 6 scènes "
        + "(lieu, enjeu, rencontres, indices, conséquences), PNJ et motivations, dénouements possibles, récompenses.",
      "3. Crée les PNJ importants avec creer_pnj, à partir de profils officiels quand il en existe.",
      "4. Si c'est utile, crée une aide de jeu pour les joueurs (visible_joueurs true).",
      "5. Note l'accroche dans la mémoire de campagne (section « Fils ouverts »).",
      "Termine par un résumé de quelques lignes pour le MJ."
    ].join("\n");
    return this.tour(consigne, { fil: this.fournisseur.nouveauFil(), systeme, outils, sauver: false, chuchoter: true });
  }

  // ---------- Un tour complet : modèle -> outils -> modèle… jusqu'à la narration finale.
  // Les tours passent un par un : deux tours simultanés mélangeraient le fil.

  tour(entree, options = {}) {
    this.toursEnFile++;
    const suite = this.chaine.then(() => this.#tour(entree, options)).finally(() => { this.toursEnFile--; });
    this.chaine = suite.catch(() => null);
    return suite;
  }

  // Au repos : aucun tour en cours ni en attente, aucun message en file (le pilote automatique n'avance qu'ainsi).
  auRepos() {
    return !this.enCours && this.toursEnFile === 0 && !this.vidages && !this.attente.length;
  }

  async #tour(entree, { fil = this.fil, systeme = this.systeme, outils = outilsDuSysteme(), sauver = true, chuchoter = false, miseEnPlace = false } = {}) {
    this.enCours = true;
    // Premier tour d'un fil neuf commencé sans ouverture (loups_distribuer) : la distribution secrète passe devant.
    if (this.preambule && fil === this.fil) {
      entree = `${this.preambule}\n\n${entree}`;
      this.preambule = "";
    }
    try {
      if (miseEnPlace) await this.#tourMisEnPlace(entree, fil, systeme, outils, chuchoter);
      else await this.#tourDirect(entree, fil, systeme, outils, chuchoter);
    } catch (erreur) {
      console.error(`${ID} |`, erreur);
      await this.prevenirMJ(expliquerErreur(erreur));
    } finally {
      this.enCours = false;
      // Un fil remplacé pendant ce tour (nouvelle partie) n'écrase pas le fil neuf : il est archivé par la nouvelle partie.
      if (sauver && fil === this.fil) await ecrireJSON("fils", this.nomFichier(), fil).catch(e => console.error(`${ID} | sauvegarde du fil`, e));
      // Des joueurs ont écrit pendant que l'IA répondait : on leur répond à leur tour.
      if (this.attente.length) setTimeout(() => this.vider(), 0);
      // Une mort, une victoire, un joueur parti : le pilote automatique regarde s'il doit démarrer ou s'arrêter.
      if (sauver) this.pilote?.verifierBientot();
    }
  }

  // Un appel au modèle ; false si on doit s'arrêter (budget dépassé, refus).
  async #envoyer(fil, systeme, outils, surTexte = null) {
    if (this.budgetDepasse()) {
      await this.prevenirMJ(game.i18n.format("LAKOUR_MJIA.Erreurs.Budget", { budget: lire("budgetSeance") }));
      return null;
    }
    const reponse = await this.fournisseur.envoyer(fil, { systeme, outils, surTexte });
    await this.compter(reponse.usage);
    if (reponse.arret === "refus") {
      await this.prevenirMJ(game.i18n.format("LAKOUR_MJIA.Erreurs.Refus", { detail: reponse.detail ?? "" }));
      return null;
    }
    return reponse;
  }

  // Tour direct : la narration s'affiche (et se dit) pendant qu'elle s'écrit. Création, scénario, combat.
  async #tourDirect(entree, fil, systeme, outils, chuchoter) {
    this.fournisseur.ajouterUtilisateur(fil, entree);
    for (let i = 0; i < MAX_TOURS_OUTILS; i++) {
      const bulle = new BulleChat(this.personnalite.nomAffiche, chuchoter);
      // Voix OpenAI en direct : les phrases partent à la synthèse pendant que le texte s'écrit.
      const voix = !chuchoter && lire("voix") === "openai" ? new VoixEnDirect(this.personnalite) : null;
      const reponse = await this.#envoyer(fil, systeme, outils, morceau => { bulle.ajouter(morceau); voix?.suivre(bulle.texte); });
      // La voix suit le texte tel qu'il a été reçu (ses positions), pas la version finale retouchée.
      const ecrit = bulle.texte.trim() ? bulle.texte : reponse?.texte ?? "";
      await bulle.terminer(reponse?.texte);
      if (voix) {
        voix.suivre(bulle.message ? ecrit : "", true);
        voix.terminer(bulle.message).catch(e => console.error(`${ID} | voix`, e));
      }
      if (!reponse?.appels.length) return;
      const resultats = [];
      for (const appel of reponse.appels) resultats.push(await this.executer(appel, outils));
      this.fournisseur.ajouterResultats(fil, resultats);
    }
  }

  // Tour mis en place : 1. brouillon (rien ne s'affiche ; la voix se prépare), 2. plateau accordé au brouillon,
  // 3. publication de la narration, voix et demandes de jet comprises.
  async #tourMisEnPlace(entree, fil, systeme, outils, chuchoter) {
    this.fournisseur.ajouterUtilisateur(fil, `${entree}\n\n${CONSIGNE_BROUILLON}`);
    // Seule la dernière narration compte : l'IA écrit parfois un premier jet avant ses appels d'outils, puis le réécrit.
    let recit = "";
    const differees = [];
    let reponse = null;
    for (let i = 0; i < MAX_TOURS_OUTILS; i++) {
      reponse = await this.#envoyer(fil, systeme, outils);
      if (!reponse) return;
      if (reponse.texte.trim()) recit = estSilence(reponse.texte) ? "" : reponse.texte;
      if (!reponse.appels.length) break;
      const resultats = [];
      for (const appel of reponse.appels) {
        const def = outils.find(o => o.nom === appel.nom);
        if (DIFFEREES.includes(appel.nom) && def && !validerSchema(def.schema, appel.args).length) {
          differees.push(appel);
          resultats.push({ id: appel.id, contenu: "Demande prête : elle partira au joueur dès que ta narration sera affichée. Attends son résultat." });
        } else {
          resultats.push(await this.executer(appel, outils));
        }
      }
      this.fournisseur.ajouterResultats(fil, resultats);
    }
    if (!recit) return; // « — » : rien à dire, rien à placer

    // La voix se prépare pendant la mise en place ; elle ne parle qu'une fois le texte affiché.
    let ouvrir;
    const affiche = new Promise(resolve => { ouvrir = resolve; });
    const voix = !chuchoter && lire("voix") === "openai" ? new VoixEnDirect(this.personnalite, { attendre: affiche }) : null;
    voix?.suivre(recit, true);

    // Plateau accordé à la narration. On ne relance l'IA que si un placement a échoué (repère inconnu…).
    // Une panne ici ne doit empêcher ni la narration de paraître ni la voix de parler (sa file attend `affiche`).
    try {
      this.fournisseur.ajouterUtilisateur(fil, CONSIGNE_PLATEAU);
      for (let i = 0; i < MAX_TOURS_PLATEAU; i++) {
        const placement = await this.#envoyer(fil, systeme, outils);
        if (!placement?.appels.length) break;
        const resultats = [];
        for (const appel of placement.appels) resultats.push(await this.executer(appel, outils));
        // Pas d'arrêt ici : l'IA voit le plateau obtenu et le vérifie (« plateau prêt » ou corrections).
        this.fournisseur.ajouterResultats(fil, resultats);
      }
    } catch (erreur) {
      console.error(`${ID} | mise en place`, erreur);
      await this.prevenirMJ(expliquerErreur(erreur));
    }

    // Publication, puis les demandes adressées aux joueurs.
    try {
      const bulle = new BulleChat(this.personnalite.nomAffiche, chuchoter);
      await bulle.terminer(recit);
      voix?.terminer(bulle.message).catch(e => console.error(`${ID} | voix`, e));
    } finally {
      ouvrir();
    }
    for (const appel of differees) {
      const r = await this.executer(appel, outils);
      if (r.erreur) await this.prevenirMJ(r.contenu);
    }
  }

  async executer(appel, outils) {
    const def = outils.find(o => o.nom === appel.nom) ?? outil(appel.nom);
    if (!def) return { id: appel.id, erreur: true, contenu: `Outil inconnu : ${appel.nom}.` };
    // Arguments vérifiés avant tout (et avant de déranger le MJ humain) : l'IA reçoit le détail et corrige.
    const invalides = validerSchema(def.schema, appel.args);
    if (invalides.length) {
      return { id: appel.id, erreur: true, contenu: `Arguments invalides pour ${appel.nom}, rien n'a été exécuté : ${invalides.join(" ; ")}. Corrige et rappelle l'outil.` };
    }
    if (def.sensible && lire("autonomie") === "validation") {
      const accord = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("LAKOUR_MJIA.Validation.Titre") },
        content: resumerAppel(appel),
        rejectClose: false
      });
      if (!accord) return { id: appel.id, erreur: true, contenu: "Le MJ humain a refusé cette action. Continue sans elle." };
    }
    try {
      const r = await def.executer(appel.args);
      return { id: appel.id, contenu: r.contenu, erreur: Boolean(r.erreur) };
    } catch (erreur) {
      console.error(`${ID} | outil ${appel.nom}`, erreur);
      return { id: appel.id, erreur: true, contenu: `Échec : ${erreur.message}` };
    }
  }

  // ---------- Coût

  // modele : celui de l'appel (les compagnons IA ont le leur, moins cher) ; par défaut celui du MJ.
  // Hors séance (joueurs IA d'une partie des Veillées menée par un MJ humain), le coût va au compteur « compagnons hors
  // séance », borné par le même budget.
  async compter(usage, modele = null) {
    const fournisseur = lire("fournisseur");
    const leModele = modele || (fournisseur === "anthropic" ? lire("modeleAnthropic") : fournisseur === "openai" ? lire("modeleOpenAI") : "");
    return this.compterCout(coutDe(usage, prixDuModele(fournisseur, leModele)), usage);
  }

  // Un coût déjà connu en dollars (transcription de la parole des joueurs, comptée à la minute) ; usage : jetons, s'il y en a.
  async compterCout(cout, usage = null) {
    const seance = foundry.utils.deepClone(lire("seance"));
    if (!seance.active) {
      const hors = { ...HORS_SEANCE_VIDE, ...(lire("compagnonsHorsSeance") ?? {}) };
      await ecrire("compagnonsHorsSeance", { ...hors, cout: hors.cout + cout, appels: hors.appels + 1 });
      return;
    }
    if (usage) for (const k of Object.keys(seance.jetons)) seance.jetons[k] += usage[k] ?? 0;
    seance.cout += cout;
    await ecrire("seance", seance);
  }

  budgetDepasse() {
    const budget = lire("budgetSeance");
    if (!(budget > 0)) return false;
    const seance = lire("seance");
    const cout = seance.active ? seance.cout : (lire("compagnonsHorsSeance")?.cout ?? 0);
    return cout >= budget;
  }

  // Une nouvelle partie hors séance : le compteur « compagnons hors séance » repart de zéro.
  async remettreHorsSeance() {
    await ecrire("compagnonsHorsSeance", { ...HORS_SEANCE_VIDE, depuis: Date.now() });
  }

  async prevenirMJ(texte) {
    ui.notifications.error(texte);
    await ChatMessage.implementation.create({
      content: `<p><strong>MJ IA</strong> — ${foundry.utils.escapeHTML(texte)}</p>`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
      flags: { [ID]: { ia: true } }
    });
  }
}

// Message de chat qui se remplit au fil du streaming (mises à jour espacées pour ménager le serveur).
class BulleChat {
  constructor(alias, chuchoter = false) {
    this.alias = alias;
    this.whisper = chuchoter ? game.users.filter(u => u.isGM).map(u => u.id) : [];
    this.texte = "";
    this.message = null;
    this.derniere = 0;
    this.chaine = Promise.resolve();
  }

  ajouter(morceau) {
    this.texte += morceau;
    if (this.texte.trim().length < 4) return; // un « — » (rien à dire) ne doit jamais s'afficher
    const maintenant = Date.now();
    if (maintenant - this.derniere < 800) return;
    this.derniere = maintenant;
    this.publier();
  }

  // Les publications s'enchaînent une à une : chacune lit le texte du moment où elle s'exécute,
  // donc la dernière écrit toujours le texte complet.
  // final : dernière publication, texte complet ; c'est elle que la voix du narrateur lit.
  publier(final = false) {
    this.chaine = this.chaine.then(async () => {
      const content = versHTML(this.texte);
      const flags = { [ID]: { ia: true, narration: true, final } };
      if (!this.message) this.message = await ChatMessage.implementation.create({ content, speaker: { alias: this.alias }, whisper: this.whisper, flags });
      else await this.message.update({ content, flags });
    }).catch(e => console.error(`${ID} | bulle de chat`, e));
    return this.chaine;
  }

  async terminer(texteFinal) {
    // « — » seul : l'IA n'a rien à dire (déplacement sans intérêt) ; rien n'est publié.
    if (estSilence(texteFinal ?? this.texte)) {
      await this.chaine;
      if (this.message) await this.message.delete();
      this.message = null;
      return;
    }
    if (!texteFinal && !this.message) return;
    if (texteFinal) this.texte = texteFinal;
    await this.publier(true);
  }
}
