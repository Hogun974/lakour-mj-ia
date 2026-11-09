import { ID } from "./constantes.js";
import { enregistrerReglages, lire, migrerReglages } from "./reglages.js";
import { adaptateur } from "./adaptateurs.js";
import { MoteurMJ } from "./moteur.js";
import { ConsoleMJ } from "./apps/console.js";
import { estNarrationAudible, lireNavigateur, taireNavigateur, jouerTousLesMorceaux, brancherVoixDirecte, couperVoix, nettoyerVoixPrivees } from "./voix.js";
import { brancherReactions } from "./reactions.js";
import { redessinerCartes, donnerMunitions } from "./outils.js";
import { definirFigurants } from "./placement.js";
import { figurantsDuContenu, packDeContenu } from "./contenus.js";
import { brancherVue3d } from "./vue3d.js";
import { brancherDecisions, brancherCompagnonsDecisions } from "./decisions.js";
import { installerGuide } from "./guide.js";
import { CompagnonsSansNarrateur } from "./compagnons-veillees.js";
import { ecouteActive } from "./ecoute.js";
import { EcouteJoueurs, afficherEcoute, brancherTranscription } from "./transcription.js";
import { compagnonsPresents } from "./compagnons-jeu.js";
import { versHTML, texteJoueurs, ecritParUnMJ } from "./utilitaires.js";
import { consignerComposition } from "./historique-loups.js";
import { texteAvanceSurvie, textePalierSurvie } from "./survie-logique.js";
import { brancherHistoire, ouvrirHistoire, journalDe, assurerJournal } from "./histoire.js";
import { TourParTour, mouvementHorsTour } from "./tour-par-tour.js";
import { brancherTourParTour, ouvrirPanneau } from "./apps/tour-par-tour.js";
import * as horloges from "./horloges.js";
import * as carnet from "./carnet.js";
import * as coffre from "./coffre.js";
import * as fetes from "./fetes.js";
import { lireArchive } from "./fils.js";
import { ouvrirCoffre as ouvrirFenetreCoffre, brancherRappelSecours } from "./apps/coffre.js";
import { ouvrirCarnet, ouvrirHorloges, rafraichirCarnet } from "./apps/carnet.js";
import { brancherCameras, api as apiCameras } from "./cameras.js";
import { rafraichirJetonsJoueurs, signatureJetons } from "./jetons-joueurs.js";

Hooks.once("init", () => {
  enregistrerReglages();
  // Caméras des joueurs (cameras.js) : AVMaster enveloppé avant que Foundry ne crée game.webrtc (après « setup ») ; l'API des
  // caméras est là dès « init », pour qu'un système y pose sa règle avant la connexion A/V (aux Veillées : au « setup »).
  brancherCameras();
  const module = game.modules.get(ID);
  if (module) module.api = { ...(module.api ?? {}), cameras: apiCameras };
});

Hooks.once("ready", () => {
  const moteur = new MoteurMJ();
  // Joueurs IA aux Veillées sans narrateur IA (MJ humain, hors séance) : point d'enregistrement de la Table, débat, réponses.
  const sansNarrateur = new CompagnonsSansNarrateur({ moteur });
  // Écoute des joueurs (parole → texte), chez le MJ actif, seulement quand une IA doit entendre (docs/voix-et-ecoute.md §2).
  const ecoute = new EcouteJoueurs({ moteur, sansNarrateur });

  // Tour par tour (40k, Warcraft) : panneau du MJ, bandeau des joueurs, tour de table ; le MJ IA lit le même état.
  const tour = new TourParTour({ moteur });
  moteur.tourParTour = tour;
  // API pour les macros et les autres modules : game.modules.get("lakour-mj-ia").api
  game.modules.get(ID).api = {
    moteur,
    sansNarrateur,
    tour,
    tourParTour: () => ouvrirPanneau(),
    console: () => new ConsoleMJ().render({ force: true }),
    // Caméras des joueurs (cameras.js, README « Caméras des joueurs ») : regle(fn) pour un système de jeu, actualiser(), video(userId),
    // permises(), permettre(oui), diagnostic(), activerVideo(), donnerCamera().
    cameras: apiCameras,
    // Jetons des personnages joueurs existants (jetons-joueurs.js) : rafraichir() leur redonne le jeton de leur peuple, rôle ou
    // passé (images posées par La Kour seulement) et rend le nombre de personnages changés. Fait seul une fois par version du contenu.
    jetonsJoueurs: { rafraichir: () => rafraichirJetonsJoueurs({ style: lire("styleVisuel") }) },
    // Une IA doit-elle entendre les joueurs (transcription de la parole, docs/voix-et-ecoute.md §2) ?
    ecouteActive: () => ecouteActive({ seanceIA: moteur.actif, compagnonsVivants: compagnonsPresents().length, moduleActif: true }),
    ecoute,
    // Le joueur coupe la voix des IA chez lui (réglage « entendreNarration ») : ce qui joue s'arrête net.
    couperVoix,
    afficherEcoute,
    // Horloges, jauges et réputations (horloges.js ; 40k, Warcraft). Contrat des modules des mondes : assurer(def) crée
    // l'élément s'il n'existe pas (par id) et le rend ; avancer(id, n = 1) ; lister() ; palier(id). Seul le MJ actif écrit.
    // libelles({ "Exposition": "LAKOUR40K.Jauges.Exposition", … }) : nom français d'un élément, d'un seuil ou d'une faction ->
    // clé i18n du module, pour l'affichage des joueurs seulement (dans chaque navigateur, au « ready » du module de contenu).
    horloges: {
      libelles: table => horloges.libelles(table),
      assurer: def => horloges.assurer(def),
      avancer: (id, n = 1) => horloges.avancer(id, n),
      lister: () => horloges.lister(),
      palier: id => horloges.palier(id),
      trouver: ref => horloges.trouver(ref),
      regler: (id, changements) => horloges.regler(id, changements),
      montrer: (id, visible = true) => horloges.montrer(id, visible),
      retirer: id => horloges.retirer(id),
      ouvrir: () => ouvrirHorloges(),
      // La fenêtre « Carnet de campagne » (horloges, enquêtes, contacts), redessinée à chaque changement d'un des trois réglages.
      rafraichir: (cle = null) => rafraichirCarnet(cle)
    },
    // Tableau d'enquête et registre des contacts (carnet.js ; 40k, Warcraft) : assurer(def) crée l'élément s'il n'existe pas (par id)
    // et le rend ; lister() ; trouver(ref). Seul le MJ actif écrit.
    enquetes: {
      assurer: def => carnet.assurerEnquete(def),
      lister: () => carnet.enquetes.lister(),
      trouver: ref => carnet.trouverEnquete(ref)
    },
    contacts: {
      assurer: def => carnet.assurerContact(def),
      lister: () => carnet.contacts.lister(),
      trouver: ref => carnet.trouverContact(ref)
    },
    carnet: (onglet = null) => ouvrirCarnet(onglet),
    // Coffre du moteur (coffre.js), dans tous les mondes : le Carnet caché et le fil de l'IA (fils.js), chiffrés ; la clé chez le
    // MJ, une part chez chaque compte joueur (seuil : la majorité). etat() : { etat: "vide" | "ouvert" | "ouverture" | "attente" |
    // "ferme" | "joueur", … } ; chercher() : rouvrir, ou redemander les parts ; renouveler() : nouvelle clé, en vigueur une fois
    // ses parts accusées (tout est alors rescellé) ; abandonner({ confirmer: true }) : parts perdues, le MJ renonce aux éléments cachés et aux fils chiffrés ;
    // lireArchive(nom) : le contenu d'un fil ou d'une archive de Data/lakour-mj-ia/fils/.
    // Histoire de chaque personnage (histoire.js ; 40k, Warcraft, Fénoir) : ouvrir(acteur) ouvre ou crée son journal ; journal(acteur)
    // le rend (ou null) ; assurer(acteur) le crée chez un MJ. Les systèmes peuvent s'en servir dans leur propre fiche.
    histoire: { ouvrir: acteur => ouvrirHistoire(acteur), journal: acteur => journalDe(acteur), assurer: acteur => assurerJournal(acteur) },
    coffre: {
      etat: () => coffre.etatCoffre(),
      chercher: () => coffre.chercherCoffre(),
      renouveler: () => coffre.renouveler(),
      // Clé de secours : téléchargée par le MJ (fichier), réimportée sur un autre navigateur (File, Blob ou texte).
      exporterSecours: () => coffre.exporterSecours(),
      importerSecours: fichier => coffre.importerSecours(fichier),
      ouvrir: () => ouvrirFenetreCoffre(),
      abandonner: options => coffre.abandonnerCoffre(options),
      lireArchive: nom => lireArchive(nom),
      changement: () => coffre.coffreChange(),
      // Pour un autre module (le système des Veillées scelle ses secrets de partie avec la même clé) : sceller(contenu) -> objet
      // scellé ou null (pas MJ actif, clé absente) ; ouvrirScelle(scelle) -> contenu ou null (parts demandées si la clé manque) ;
      // scellerAvec(contenu, cle) dans un rappel de renouvellement ; siRenouvele(fn(cle)) : rescelle avant que la nouvelle clé
      // n'entre en vigueur ; siDisponible(fn) : la clé est là (démarrage, réouverture).
      sceller: contenu => coffre.scellerPourAutre(contenu),
      // scellerEnPartant(contenu) : le MJ qui perd la main (un autre devient actif) scelle une dernière fois, avec la clé en vigueur.
      scellerEnPartant: contenu => coffre.scellerEnPartant(contenu),
      ouvrirScelle: scelle => coffre.ouvrirPourAutre(scelle),
      scellerAvec: (contenu, cle) => coffre.scellerAvec(contenu, cle),
      siRenouvele: fn => coffre.siRenouvele(fn),
      siDisponible: fn => coffre.siCleDisponible(fn)
    },
    // Fêtes de saison (fetes.js, docs/fetes.md), dans les trois mondes. Contrat des modules des mondes, au crochet « lakour-mj-ia.pret » :
    // enregistrer({ id, fete, nom, description, consigne, decor, contenu }) rend la déclinaison (erreur si la fête est inconnue ou
    // déjà déclinée) ; active() : la déclinaison de la fête en cours dans ce navigateur, ou null ; lister() ; sourceDeDate(fn) :
    // la date d'un monde qui a son calendrier (Fénoir : la date de jeu), à brancher au crochet. Crochet « lakour-mj-ia.fete »
    // (ancienne, nouvelle) quand elle change.
    fetes: {
      enregistrer: def => fetes.enregistrer(def),
      active: () => fetes.active(),
      lister: () => fetes.lister(),
      calendrier: date => fetes.calendrier(date),
      sourceDeDate: fn => fetes.sourceDeDate(fn),
      dateDuMonde: () => fetes.dateDuMonde(),
      decors: () => fetes.decors(),
      verifier: () => fetes.verifier(),
      rafraichir: () => fetes.appliquerEffets()
    }
  };
  // Gestes de la fenêtre Carnet de campagne faits par un autre MJ : transmis au MJ actif.
  horloges.brancherHorloges();
  carnet.brancherCarnet();
  // Coffre du moteur (tous les mondes) : le MJ l'ouvre (ou demande les parts des joueurs), chiffre ce qui traîne en clair (Carnet,
  // fils de l'IA) ; un joueur demande sa part au MJ actif. Une clé créée ou renouvelée sans clé de secours : la fenêtre de rappel.
  brancherRappelSecours();
  coffre.brancherCoffre();
  // Transcriptions montrées aux MJ (réglage) : par le canal du module, aux seuls MJ, jamais par un chuchotement du chat.
  if (game.user.isGM) brancherTranscription();
  // Voix des IA en direct : chaque navigateur joue les morceaux de son reçus du MJ actif (canal du module).
  brancherVoixDirecte();
  // L'écoute suit l'état de la table : séance, compagnons, flux A/V qui arrivent ou changent, phase des Veillées.
  afficherEcoute();
  if (game.user.isGM) {
    setInterval(() => ecoute.verifier(), 4000);
    for (const crochet of ["rtcSettingsChanged", "userConnected", "lakourLoups.phase", "lakourLoups.elimination", "createActor", "deleteActor",
      "createToken", "deleteToken", "canvasReady"]) {
      Hooks.on(crochet, () => ecoute.verifier());
    }
    ecoute.verifier();
  }
  Hooks.on("userConnected", () => afficherEcoute());
  // Figurants fournis par le module de contenu de ce système (lakour-40k, lakour-warcraft : même fichier figurants.json).
  figurantsDuContenu().then(f => f && definirFigurants(f.types, f.module));
  // Déplacements, portes et tour des PNJ transmis à l'IA (n'agit que dans le navigateur du MJ actif, en séance).
  brancherReactions(moteur);
  // Tour par tour : suivi du tour, lecture des jets au chat, compagnons à leur tour, panneau et bandeau.
  brancherTourParTour(tour);
  // Canal du module : votes de groupe et choix secrets (fenêtres chez les joueurs, réponses au MJ actif).
  brancherDecisions();
  // Compagnons IA : leur cerveau répond aux votes de groupe et choix secrets, et aux demandes des Veillées (nuit, vote),
  // que le système lakour-loups adresse à son résolveur au lieu du socket.
  brancherCompagnonsDecisions((acteurId, demande) => moteur.compagnons.deciderOption(acteurId, demande));
  // Séance ou non : avec un MJ humain aussi, les compagnons choisissent la nuit et votent par leur cerveau.
  const brancherVeillees = api => {
    if (!api) return;
    api.resolveurs ??= {};
    api.resolveurs.compagnon = demande => moteur.compagnons.resoudreLoups(demande);
    sansNarrateur.enregistrer();
  };
  brancherVeillees(game.lakourLoups);
  Hooks.on("lakourLoups.pret", brancherVeillees);
  // Une nouvelle partie des Veillées (Table de jeu, « Tout recommencer », loups_rejouer) : fil archivé, fil neuf, ouverture ;
  // les compagnons oublient la partie précédente (moteur.nouvellePartie ; une demande déjà faite par l'outil n'est pas doublée).
  Hooks.on("lakourLoups.nouvellePartie", () => moteur.nouvellePartie({ ouverture: true }));
  // Une partie distribuée par le MJ IA finit (victoire) ou est abandonnée (nouvelle partie de la Table) : sa composition entre
  // enfin à l'historique (historique-loups.js), chez le MJ actif qui la gardait.
  for (const crochet of ["lakourLoups.victoire", "lakourLoups.nouvellePartie"]) {
    Hooks.on(crochet, () => { if (game.user === game.users.activeGM) consignerComposition().catch(e => console.error(`${ID} | historique`, e)); });
  }
  // Histoire de chaque personnage (40k, Warcraft, Fénoir) : bouton « Histoire » des fiches, demandes des joueurs au MJ actif.
  brancherHistoire();
  // Fénoir (lakour-survie) : le temps avancé hors de l'IA (tableau de bord du MJ humain) arrive au narrateur avec ses faits
  // PUBLICS (crochet du système : quand, faits publics). Pendant un tour de l'IA, c'est son propre outil : il a déjà la réponse.
  Hooks.on("lakourSurvie.avance", (quand, faits) => {
    if (moteur.enCours) return;
    moteur.signaler(texteAvanceSurvie(quand, faits));
  });
  // Fénoir : la visibilité de l'abri franchit un palier à la hausse (crochet du système : { palier, table }) : la table d'événements
  // de ce palier est proposée au narrateur (en séance ; sans séance, la carte privée du système suffit au MJ humain).
  Hooks.on("lakourSurvie.palier", charge => moteur.signaler(textePalierSurvie(charge)));
  // Sans narrateur IA : le jour, les compagnons débattent ; une nouvelle partie remet leur compteur hors séance à zéro.
  Hooks.on("lakourLoups.phase", phase => { sansNarrateur.surPhase(phase).catch(e => console.error(`${ID} | compagnons`, e)); });
  // Les coûts des IA, gardés en mémoire pendant une partie des Veillées (moteur.compterCout), s'écrivent d'un coup quand elle est
  // finie ou abandonnée, et avant de quitter la page.
  const viderCouts = () => { if (game.user === game.users.activeGM && !moteur.coutsDifferes()) moteur.viderCouts().catch(e => console.error(`${ID} | coûts`, e)); };
  for (const crochet of ["lakourLoups.victoire", "lakourLoups.phase", "lakourLoups.nouvellePartie"]) Hooks.on(crochet, () => setTimeout(viderCouts, 0));
  window.addEventListener?.("beforeunload", () => { if (game.user === game.users.activeGM) moteur.viderCouts().catch(() => null); });
  Hooks.on("createChatMessage", message => sansNarrateur.surMessage(message));
  // Pilote automatique : une mort, une victoire, une phase, un joueur qui arrive ou part, un jeton posé ou retiré… il revoit s'il
  // doit mener la partie (il ne reste que des compagnons IA) ou rendre la main (un humain vivant est là).
  for (const crochet of ["lakourLoups.phase", "lakourLoups.elimination", "lakourLoups.victoire", "lakourLoups.passage", "lakourLoups.depart",
    "lakourLoups.accusation", "lakourLoups.deuil", "lakourLoups.secrets", "updateActor", "userConnected",
    "createToken", "deleteToken", "canvasReady", "updateCombat", "deleteCombat"]) {
    Hooks.on(crochet, () => moteur.pilote.verifierBientot());
  }
  // Vue 3D demandée par l'IA (3D Canvas) : ouverture et cadrage, dans chaque navigateur.
  if (game.modules.get("levels-3d-preview")?.active) brancherVue3d();
  // L'API est prête : les modules des mondes peuvent y déclarer leurs horloges (api.horloges.assurer), quel que soit l'ordre
  // de chargement des modules.
  Hooks.callAll(`${ID}.pret`, game.modules.get(ID).api);
  // Fêtes de saison : les déclinaisons sont enregistrées (crochet ci-dessus) ; la fête du monde, ses effets et la carte du jour.
  fetes.demarrer().catch(e => console.error(`${ID} | fêtes`, e));

  // Une séance restée « active » (navigateur fermé en pleine partie) ne doit pas
  // reprendre en silence : le MJ la relance depuis la console.
  if (game.user === game.users.activeGM && lire("seance").active) {
    game.settings.set(ID, "seance", { ...lire("seance"), active: false });
  }
  if (game.user === game.users.activeGM) {
    // L'une après l'autre : toutes deux écrivent le réglage « reparations ».
    migrerReglages().then(reparerMonde).catch(e => console.error(`${ID} | migration et réparations`, e));
    // Guide d'utilisation (journaux du MJ et des joueurs), installé ou mis à jour une fois par version du guide.
    installerGuide({ id: ID, versHTML }).catch(e => console.error(`${ID} | guide d'utilisation`, e));
    // Jetons des personnages joueurs, une fois par version du module de contenu (nouveaux jetons peints, par exemple).
    rafraichirAuChargement().catch(e => console.error(`${ID} | jetons des joueurs`, e));
  }
});

async function rafraichirAuChargement() {
  const signature = signatureJetons();
  if (!signature || lire("jetonsJoueurs") === signature) return;
  const n = await rafraichirJetonsJoueurs({ style: lire("styleVisuel") });
  await game.settings.set(ID, "jetonsJoueurs", signature);
  if (n) ui.notifications.info(game.i18n.format("LAKOUR_MJIA.JetonsJoueurs.Rafraichis", { n }));
}

// Un joueur se connecte en pleine séance sans personnage : le MJ IA lui propose d'en créer un (parenthèse).
Hooks.on("userConnected", (utilisateur, connecte) => {
  if (connecte) game.modules.get(ID).api?.moteur?.proposerCreation(utilisateur);
});

// Style visuel changé (plat / relief) : le MJ actif redessine les cartes créées par le MJ IA.
Hooks.on("lakourStyleVisuel", async style => {
  if (game.user !== game.users.activeGM) return;
  const n = await redessinerCartes(style);
  if (n) ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Style.Redessinees", { n }));
});

// Chaque message du chat est proposé au moteur ; il ne fait quelque chose que dans le
// navigateur du MJ actif, et seulement pendant une séance.
Hooks.on("createChatMessage", message => {
  game.modules.get(ID).api?.moteur.recevoir(message);
});

// Les cartes du MJ IA reçoivent la classe lakour-mjia-message (le glyphe d'une fête en cours s'y pose en CSS).
Hooks.on("renderChatMessageHTML", (message, html) => fetes.marquerMessage(message, html));

// Bouton « lancer le test » des cartes de jet demandées par l'IA. Seulement sur une carte écrite par un MJ (utilitaires.js,
// ecritParUnMJ) : un joueur ne fabrique pas un bouton dans son propre message.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!ecritParUnMJ(message)) return;
  for (const bouton of html.querySelectorAll("[data-lakour-jet]")) {
    bouton.addEventListener("click", async event => {
      event.preventDefault();
      const acteur = await fromUuid(bouton.dataset.acteur);
      if (!acteur?.isOwner) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasTonPersonnage"));
      try {
        // Réglages choisis par l'IA (difficulté, modificateur, DR, avantages) : la fenêtre s'ouvre pré-remplie.
        let reglages = {};
        try { reglages = JSON.parse(bouton.dataset.reglages || "{}"); } catch { /* ancienne carte sans réglages */ }
        await adaptateur().lancer(acteur, bouton.dataset.competence, reglages);
      } catch (erreur) {
        ui.notifications.error(erreur.message);
      }
    });
  }
});

// Bouton « lancer les dés » demandé par l'IA : le joueur lance lui-même, le résultat part dans le chat
// et revient à l'IA comme n'importe quel message. Seulement sur une carte écrite par un MJ (ecritParUnMJ).
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!ecritParUnMJ(message)) return;
  for (const bouton of html.querySelectorAll("[data-lakour-des]")) {
    const { formule, nombre, raison, joueur } = bouton.dataset;
    if (joueur && joueur !== game.user.id && !game.user.isGM) bouton.disabled = true;
    bouton.addEventListener("click", async event => {
      event.preventDefault();
      if (joueur && joueur !== game.user.id) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasTonJet"));
      const jets = [];
      for (let i = 0; i < Number(nombre || 1); i++) jets.push(await new Roll(formule).evaluate());
      await ChatMessage.implementation.create({
        author: game.user.id,
        speaker: ChatMessage.implementation.getSpeaker({ actor: game.user.character }),
        // La raison lue dans l'attribut est du texte brut (déchiffré par le navigateur) : échappée avant d'en faire du HTML.
        flavor: foundry.utils.escapeHTML(String(raison ?? "")),
        content: `<p>${jets.map(j => `<strong>${j.total}</strong>`).join(" · ")}</p>`,
        rolls: jets,
        sound: CONFIG.sounds.dice
      });
    });
  }
});

// Voix du navigateur : chaque client lit la narration finale du MJ IA (création directe ou fin du streaming).
Hooks.on("createChatMessage", message => {
  if (lire("voix") === "navigateur" && estNarrationAudible(message)) lireNavigateur(message);
});
Hooks.on("updateChatMessage", (message, changements) => {
  if (lire("voix") === "navigateur" && changements.flags?.[ID]?.final && estNarrationAudible(message)) lireNavigateur(message);
  // Voix OpenAI impossible (pas de clé, budget atteint) : chaque navigateur lit la narration avec sa propre voix.
  if (lire("voix") === "openai" && changements.flags?.[ID]?.repliNavigateur && estNarrationAudible(message)) lireNavigateur(message);
});

// Bouton 🔊 sur chaque narration (et chaque réplique de compagnon dite à voix haute) : réécouter (fichier OpenAI pour soi seul,
// ou voix du navigateur). Seulement sur un message écrit par un MJ : le drapeau « audio » d'un message de joueur ferait jouer
// l'adresse de son choix, « narration » lire son texte à voix haute.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!ecritParUnMJ(message)) return;
  const audio = message.getFlag(ID, "audio");
  if (!(message.getFlag(ID, "narration") || audio?.length) || lire("voix") === "aucune") return;
  const bouton = document.createElement("a");
  bouton.className = "lakour-mjia-ecouter";
  bouton.dataset.tooltip = game.i18n.localize("LAKOUR_MJIA.Voix.Reecouter");
  bouton.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  bouton.addEventListener("click", event => {
    event.preventDefault();
    if (audio?.length) jouerTousLesMorceaux(audio, false);
    else { taireNavigateur(); lireNavigateur(message); }
  });
  html.querySelector(".message-content")?.append(bouton);
});

// Déplacements bloqués par l'IA (outil bloquer_mouvements) : refusés dans le navigateur du joueur, avant
// d'atteindre le serveur. Le MJ (humain ou IA) n'est jamais bloqué.
function mouvementInterdit(jeton) {
  if (game.user.isGM) return false;
  // Réglage « Seul le combattant actif peut bouger » (tour-par-tour.js).
  if (mouvementHorsTour(jeton)) {
    ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Mouvement.HorsTour"));
    return true;
  }
  const raison = lire("mouvementsBloques")?.[jeton.actorId];
  if (!raison) return false;
  ui.notifications.warn(raison);
  return true;
}
Hooks.on("preUpdateToken", (jeton, changements) => {
  if (("x" in changements || "y" in changements) && mouvementInterdit(jeton)) return false;
});
Hooks.on("preMoveToken", jeton => {
  if (mouvementInterdit(jeton)) return false;
});

// Accès à la console depuis les contrôles de scène (MJ uniquement) ; le Carnet de campagne pour tous (hors Veillées).
Hooks.on("getSceneControlButtons", controles => {
  const jetons = controles.tokens ?? controles.token;
  if (!jetons?.tools) return;
  // Carnet de campagne (horloges, enquêtes, contacts) : les joueurs n'y voient que ce que le MJ a montré.
  if (horloges.disponibles()) {
    jetons.tools.lakourHorloges = {
      name: "lakourHorloges",
      title: "LAKOUR_MJIA.Carnet.Titre",
      icon: "fa-solid fa-book-open",
      order: Object.keys(jetons.tools).length,
      button: true,
      visible: true,
      onChange: () => ouvrirCarnet()
    };
  }
  if (!game.user.isGM) return;
  jetons.tools.lakourMjIa = {
    name: "lakourMjIa",
    title: "LAKOUR_MJIA.Console.Titre",
    icon: "fa-solid fa-hat-wizard",
    order: Object.keys(jetons.tools).length,
    button: true,
    visible: true,
    onChange: () => new ConsoleMJ().render({ force: true })
  };
  // Le panneau Tour par tour (Imperium Maledictum, D&D 5e).
  if (game.modules.get(ID)?.api?.tour?.disponible()) {
    jetons.tools.lakourTour = {
      name: "lakourTour",
      title: "LAKOUR_MJIA.Tour.Titre",
      icon: "fa-solid fa-shield-halved",
      order: Object.keys(jetons.tools).length,
      button: true,
      visible: true,
      onChange: () => ouvrirPanneau()
    };
  }
});

// Réparations faites une fois par monde, au premier chargement d'une version qui les apporte.
// - munitions (0.22.0) : les armes à chargeur des personnages joueurs créés avant n'avaient aucune munition reliée.
async function reparerMonde() {
  const faites = { ...game.settings.get(ID, "reparations") };
  // Le compendium d'armement du module de contenu 40k, dans sa langue active (lakour-40k ou lakour-40k-en).
  if (!faites.munitions && game.system.id === "impmal" && game.packs.get(packDeContenu("armement", "impmal"))) {
    const rapport = [];
    for (const acteur of game.actors.filter(a => a.type === "character")) {
      const lots = await donnerMunitions(acteur);
      if (lots.length) rapport.push(`${acteur.name} : ${lots.join(", ")}`);
    }
    if (rapport.length) ui.notifications.info(texteJoueurs("LAKOUR_MJIA.Reparations.Munitions", "MJ IA — munitions ajoutées : {liste}", { liste: rapport.join(" ; ") }));
    faites.munitions = true;
  }
  // Voix privées déposées dans Data par les versions d'avant 0.34.0 (Data/ est servi à tous) : écrasées par un silence, une fois
  // (voix.js, nettoyerVoixPrivees ; Foundry n'offre pas de suppression de fichier côté client).
  if (!faites.voixPrivees2) {
    const r = await nettoyerVoixPrivees().catch(e => { console.error(`${ID} | voix privées`, e); return { liste: false }; });
    if (r.liste) {
      faites.voixPrivees2 = true;
      if (r.ecrases) ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Voix.PriveesEcrasees", { n: r.ecrases }));
    }
  }
  await game.settings.set(ID, "reparations", faites);
}
