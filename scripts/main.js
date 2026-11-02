import { ID } from "./constantes.js";
import { enregistrerReglages, lire, migrerReglages } from "./reglages.js";
import { adaptateur } from "./adaptateurs.js";
import { MoteurMJ } from "./moteur.js";
import { ConsoleMJ } from "./apps/console.js";
import { estNarrationAudible, lireNavigateur, taireNavigateur, jouerTousLesMorceaux, brancherVoixDirecte, couperVoix } from "./voix.js";
import { brancherReactions } from "./reactions.js";
import { redessinerCartes, donnerMunitions } from "./outils.js";
import { definirFigurants } from "./placement.js";
import { figurantsDuContenu } from "./contenus.js";
import { brancherVue3d } from "./vue3d.js";
import { brancherDecisions, brancherCompagnonsDecisions } from "./decisions.js";
import { installerGuide } from "./guide.js";
import { CompagnonsSansNarrateur } from "./compagnons-veillees.js";
import { ecouteActive } from "./ecoute.js";
import { EcouteJoueurs, afficherEcoute } from "./transcription.js";
import { compagnonsPresents } from "./compagnons-jeu.js";
import { versHTML } from "./utilitaires.js";
import { TourParTour, mouvementHorsTour } from "./tour-par-tour.js";
import { brancherTourParTour, ouvrirPanneau } from "./apps/tour-par-tour.js";
import * as horloges from "./horloges.js";
import * as carnet from "./carnet.js";
import { ouvrirCarnet, ouvrirHorloges, rafraichirCarnet } from "./apps/carnet.js";

Hooks.once("init", () => {
  enregistrerReglages();
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
    // Une IA doit-elle entendre les joueurs (transcription de la parole, docs/voix-et-ecoute.md §2) ?
    ecouteActive: () => ecouteActive({ seanceIA: moteur.actif, compagnonsVivants: compagnonsPresents().length, moduleActif: true }),
    ecoute,
    // Le joueur coupe la voix des IA chez lui (réglage « entendreNarration ») : ce qui joue s'arrête net.
    couperVoix,
    afficherEcoute,
    // Horloges, jauges et réputations (horloges.js ; 40k, Warcraft). Contrat des modules des mondes : assurer(def) crée
    // l'élément s'il n'existe pas (par id) et le rend ; avancer(id, n = 1) ; lister() ; palier(id). Seul le MJ actif écrit.
    horloges: {
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
    carnet: (onglet = null) => ouvrirCarnet(onglet)
  };
  // Gestes de la fenêtre Carnet de campagne faits par un autre MJ : transmis au MJ actif.
  horloges.brancherHorloges();
  carnet.brancherCarnet();
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
  // Sans narrateur IA : le jour, les compagnons débattent ; une nouvelle partie remet leur compteur hors séance à zéro.
  Hooks.on("lakourLoups.phase", phase => { sansNarrateur.surPhase(phase).catch(e => console.error(`${ID} | compagnons`, e)); });
  Hooks.on("createChatMessage", message => sansNarrateur.surMessage(message));
  // Pilote automatique : une mort, une victoire, une phase, un joueur qui arrive ou part, un jeton posé ou retiré… il revoit s'il
  // doit mener la partie (il ne reste que des compagnons IA) ou rendre la main (un humain vivant est là).
  for (const crochet of ["lakourLoups.phase", "lakourLoups.elimination", "lakourLoups.victoire", "updateActor", "userConnected",
    "createToken", "deleteToken", "canvasReady", "updateCombat", "deleteCombat"]) {
    Hooks.on(crochet, () => moteur.pilote.verifierBientot());
  }
  // Vue 3D demandée par l'IA (3D Canvas) : ouverture et cadrage, dans chaque navigateur.
  if (game.modules.get("levels-3d-preview")?.active) brancherVue3d();
  // L'API est prête : les modules des mondes peuvent y déclarer leurs horloges (api.horloges.assurer), quel que soit l'ordre
  // de chargement des modules.
  Hooks.callAll(`${ID}.pret`, game.modules.get(ID).api);

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
  }
});

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

// Bouton « lancer le test » des cartes de jet demandées par l'IA.
Hooks.on("renderChatMessageHTML", (message, html) => {
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
// et revient à l'IA comme n'importe quel message.
Hooks.on("renderChatMessageHTML", (message, html) => {
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
        flavor: raison,
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
// ou voix du navigateur).
Hooks.on("renderChatMessageHTML", (message, html) => {
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
  if (!faites.munitions && game.system.id === "impmal" && game.packs.get("lakour-40k.armement")) {
    const rapport = [];
    for (const acteur of game.actors.filter(a => a.type === "character")) {
      const lots = await donnerMunitions(acteur);
      if (lots.length) rapport.push(`${acteur.name} : ${lots.join(", ")}`);
    }
    if (rapport.length) ui.notifications.info(`MJ IA — munitions ajoutées : ${rapport.join(" ; ")}`);
    faites.munitions = true;
  }
  await game.settings.set(ID, "reparations", faites);
}
