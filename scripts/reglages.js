import { ID, MODELES_ANTHROPIC, MODELE_OPENAI_DEFAUT, MODELE_IMAGE_DEFAUT, MODELE_VOIX, EFFORTS, ANCIENS_DEFAUTS } from "./constantes.js";
import { PERSONNALITES_DE_BASE } from "./personnalites.js";
import { BAVARDAGE } from "./compagnons.js";
import { voixRealtime } from "./voix-texte.js";
import { ConfigIA } from "./apps/config-ia.js";
import { EditeurPersonnalites } from "./apps/personnalites.js";

export function enregistrerReglages() {
  // --- Secrets : portée "client" = stockés dans CE navigateur uniquement (localStorage).
  // Un réglage "world" serait transmis à tous les joueurs connectés : jamais pour une clé.
  for (const cle of ["cleAnthropic", "cleOpenAI"]) {
    game.settings.register(ID, cle, { scope: "client", config: false, type: String, default: "" });
  }

  // --- Choix techniques, propres au monde (aucun secret).
  game.settings.register(ID, "fournisseur", {
    scope: "world", config: false, type: String, default: "anthropic"
  });
  game.settings.register(ID, "modeleAnthropic", {
    scope: "world", config: false, type: String, default: "claude-opus-5-5",
    choices: Object.fromEntries(Object.entries(MODELES_ANTHROPIC).map(([k, v]) => [k, v.libelle]))
  });
  game.settings.register(ID, "modeleOpenAI", { scope: "world", config: false, type: String, default: MODELE_OPENAI_DEFAUT });
  game.settings.register(ID, "modeleImage", { scope: "world", config: false, type: String, default: MODELE_IMAGE_DEFAUT });
  // Réparations déjà faites dans ce monde (une seule fois chacune), ex. { munitions: true }.
  game.settings.register(ID, "reparations", { scope: "world", config: false, type: Object, default: {} });
  // Compositions des dernières parties de loup-garou ({ roles, batiments, quand }) : le générateur évite de les répéter.
  game.settings.register(ID, "historiqueLoups", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "effort", {
    scope: "world", config: false, type: String, default: "medium",
    choices: Object.fromEntries(EFFORTS.map(e => [e, e]))
  });

  // --- Comportement du MJ.
  game.settings.register(ID, "personnalites", {
    scope: "world", config: false, type: Array, default: PERSONNALITES_DE_BASE
  });
  game.settings.register(ID, "personnaliteActive", {
    scope: "world", config: false, type: String, default: PERSONNALITES_DE_BASE[0].id
  });
  game.settings.register(ID, "autonomie", {
    name: "LAKOUR_MJIA.Reglages.Autonomie.Nom",
    hint: "LAKOUR_MJIA.Reglages.Autonomie.Aide",
    scope: "world", config: true, type: String, default: "validation",
    choices: {
      validation: "LAKOUR_MJIA.Reglages.Autonomie.Validation",
      autonome: "LAKOUR_MJIA.Reglages.Autonomie.Autonome"
    },
    onChange: revoirPilote
  });
  game.settings.register(ID, "delaiReponse", {
    name: "LAKOUR_MJIA.Reglages.Delai.Nom",
    hint: "LAKOUR_MJIA.Reglages.Delai.Aide",
    scope: "world", config: true, type: Number, default: 6,
    range: { min: 0, max: 30, step: 1 }
  });
  game.settings.register(ID, "budgetSeance", {
    name: "LAKOUR_MJIA.Reglages.Budget.Nom",
    hint: "LAKOUR_MJIA.Reglages.Budget.Aide",
    scope: "world", config: true, type: Number, default: 10
  });

  // --- Compagnons IA (compagnons.js) : personnages côté joueurs joués par l'IA, chacun avec son propre cerveau.
  // Modèle : vide = un modèle bon marché du fournisseur actif (Claude Haiku 5.5, ou le moins cher d'OpenAI).
  game.settings.register(ID, "modeleCompagnons", {
    name: "LAKOUR_MJIA.Reglages.ModeleCompagnons.Nom", hint: "LAKOUR_MJIA.Reglages.ModeleCompagnons.Aide",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(ID, "bavardageCompagnons", {
    name: "LAKOUR_MJIA.Reglages.BavardageCompagnons.Nom", hint: "LAKOUR_MJIA.Reglages.BavardageCompagnons.Aide",
    scope: "world", config: true, type: String, default: "normal",
    choices: Object.fromEntries(Object.keys(BAVARDAGE).map(b => [b, `LAKOUR_MJIA.Reglages.BavardageCompagnons.${b}`]))
  });
  // Ce que chaque compagnon sait en privé (messages qui lui sont destinés, ses choix secrets) : portée « client », donc rangé
  // dans le navigateur du MJ (localStorage) et jamais envoyé au serveur ni aux joueurs, comme les secrets des Veillées.
  game.settings.register(ID, "compagnonsPrive", { scope: "client", config: false, type: Object, default: {} });
  // Coût des compagnons IA hors séance (Veillées menées par un MJ humain, sans narrateur IA) : borné par le budget de séance,
  // remis à zéro à chaque nouvelle partie (compagnons-veillees.js).
  game.settings.register(ID, "compagnonsHorsSeance", { scope: "world", config: false, type: Object, default: { cout: 0, appels: 0, depuis: 0 } });

  // --- Pilote automatique (pilote.js) : quand il ne reste que des compagnons IA, en mode autonome, la partie continue seule,
  // étape par étape. Délai entre deux étapes (après la voix du narrateur) et plafond d'étapes (valeurs par défaut : celles de
  // pilote.js, DELAI_DEFAUT et ETAPES_MAX).
  game.settings.register(ID, "pilote", {
    name: "LAKOUR_MJIA.Reglages.Pilote.Nom", hint: "LAKOUR_MJIA.Reglages.Pilote.Aide",
    scope: "world", config: true, type: Boolean, default: true, onChange: revoirPilote
  });
  game.settings.register(ID, "piloteDelai", {
    name: "LAKOUR_MJIA.Reglages.PiloteDelai.Nom", hint: "LAKOUR_MJIA.Reglages.PiloteDelai.Aide",
    scope: "world", config: true, type: Number, default: 4, range: { min: 0, max: 30, step: 1 }
  });
  game.settings.register(ID, "piloteEtapes", {
    name: "LAKOUR_MJIA.Reglages.PiloteEtapes.Nom", hint: "LAKOUR_MJIA.Reglages.PiloteEtapes.Aide",
    scope: "world", config: true, type: Number, default: 60, range: { min: 10, max: 300, step: 10 }
  });

  // --- Style visuel des cartes et des jetons : plat (2D) ou relief (3D). Un changement redessine les cartes du
  // MJ IA et prévient les modules de contenu (hook « lakourStyleVisuel ») pour qu'ils basculent leurs images.
  game.settings.register(ID, "styleVisuel", {
    name: "LAKOUR_MJIA.Reglages.Style.Nom",
    hint: "LAKOUR_MJIA.Reglages.Style.Aide",
    scope: "world", config: true, type: String, default: "3d",
    choices: { "2d": "LAKOUR_MJIA.Reglages.Style.Plat", "3d": "LAKOUR_MJIA.Reglages.Style.Relief" },
    onChange: style => Hooks.callAll("lakourStyleVisuel", style)
  });

  // --- Réactions au plateau : ce que font les joueurs avec leurs jetons, et le tour des PNJ en combat.
  for (const [cle, def] of [["miseEnPlace", true], ["reagirDeplacements", true], ["reagirPortes", true], ["jouerPnj", true]]) {
    game.settings.register(ID, cle, {
      name: `LAKOUR_MJIA.Reglages.${cle}.Nom`, hint: `LAKOUR_MJIA.Reglages.${cle}.Aide`,
      scope: "world", config: true, type: Boolean, default: def
    });
  }
  // --- Tour par tour (tour-par-tour.js) : un joueur ne bouge que le jeton dont c'est le tour (le MJ jamais bloqué) ; le
  // panneau du MJ s'ouvre au début d'un combat ; le tour de table en cours (écrit par le MJ actif, lu par les bandeaux).
  game.settings.register(ID, "seulActifBouge", {
    name: "LAKOUR_MJIA.Reglages.seulActifBouge.Nom", hint: "LAKOUR_MJIA.Reglages.seulActifBouge.Aide",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(ID, "panneauTourAuto", {
    name: "LAKOUR_MJIA.Reglages.panneauTourAuto.Nom", hint: "LAKOUR_MJIA.Reglages.panneauTourAuto.Aide",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "tourDeTable", {
    scope: "world", config: false, type: Object, default: { actif: false, ordre: [], index: 0, faits: {}, tour: 0 },
    onChange: () => game.modules.get(ID)?.api?.tour?.rafraichir?.()
  });
  // Personnages dont l'IA a bloqué les déplacements : { idActeur: raison }. Lu par chaque navigateur de joueur.
  game.settings.register(ID, "mouvementsBloques", { scope: "world", config: false, type: Object, default: {} });

  // --- Voix du narrateur : le mode est choisi par le MJ ; chaque joueur règle l'écoute chez lui.
  game.settings.register(ID, "voix", {
    name: "LAKOUR_MJIA.Reglages.Voix.Nom",
    hint: "LAKOUR_MJIA.Reglages.Voix.Aide",
    scope: "world", config: true, type: String, default: "navigateur",
    choices: {
      aucune: "LAKOUR_MJIA.Reglages.Voix.Aucune",
      navigateur: "LAKOUR_MJIA.Reglages.Voix.Navigateur",
      openai: "LAKOUR_MJIA.Reglages.Voix.OpenAI"
    }
  });
  game.settings.register(ID, "modeleVoix", { scope: "world", config: false, type: String, default: MODELE_VOIX });
  // Voix OpenAI en direct (voix.js) : chaque morceau de son part aux joueurs dès sa réception. Décoché : l'ancien chemin (fichier
  // entier déposé puis joué), plus lent d'environ deux secondes.
  game.settings.register(ID, "voixDirecte", {
    name: "LAKOUR_MJIA.Reglages.VoixDirecte.Nom", hint: "LAKOUR_MJIA.Reglages.VoixDirecte.Aide",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "entendreNarration", {
    name: "LAKOUR_MJIA.Reglages.Entendre.Nom",
    hint: "LAKOUR_MJIA.Reglages.Entendre.Aide",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: entendre => { if (!entendre) game.modules.get(ID)?.api?.couperVoix?.(); }
  });
  game.settings.register(ID, "voixNavigateur", {
    name: "LAKOUR_MJIA.Reglages.VoixNavigateur.Nom",
    hint: "LAKOUR_MJIA.Reglages.VoixNavigateur.Aide",
    scope: "client", config: true, type: String, default: ""
  });
  game.settings.register(ID, "vitesseVoix", {
    name: "LAKOUR_MJIA.Reglages.Vitesse.Nom",
    scope: "client", config: true, type: Number, default: 1, range: { min: 0.5, max: 2, step: 0.1 }
  });
  game.settings.register(ID, "volumeVoix", {
    name: "LAKOUR_MJIA.Reglages.Volume.Nom",
    scope: "client", config: true, type: Number, default: 1, range: { min: 0, max: 1, step: 0.05 }
  });

  // --- Écoute des joueurs (transcription.js) : la parole dite dans la voix intégrée de Foundry, transcrite pour les IA, seulement
  // quand une IA doit entendre. Le MJ peut la couper ; modèle vide = le moins cher (ecoute.js, MODELE_TRANSCRIPTION_DEFAUT).
  game.settings.register(ID, "ecouteJoueurs", {
    name: "LAKOUR_MJIA.Reglages.EcouteJoueurs.Nom", hint: "LAKOUR_MJIA.Reglages.EcouteJoueurs.Aide",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => game.modules.get(ID)?.api?.ecoute?.verifier()
  });
  game.settings.register(ID, "modeleTranscription", {
    name: "LAKOUR_MJIA.Reglages.ModeleTranscription.Nom", hint: "LAKOUR_MJIA.Reglages.ModeleTranscription.Aide",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(ID, "transcriptionAuMJ", {
    name: "LAKOUR_MJIA.Reglages.TranscriptionAuMJ.Nom", hint: "LAKOUR_MJIA.Reglages.TranscriptionAuMJ.Aide",
    scope: "world", config: true, type: Boolean, default: false
  });
  // L'écoute tourne (écrit par le MJ actif) : chaque navigateur affiche l'icône « ta voix est transcrite ».
  game.settings.register(ID, "ecouteEnCours", {
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => game.modules.get(ID)?.api?.afficherEcoute?.()
  });

  // --- État de la séance (compteurs de coût, séance ouverte ou non).
  game.settings.register(ID, "seance", {
    scope: "world", config: false, type: Object,
    default: { active: false, debut: null, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
  });

  game.settings.registerMenu(ID, "configIA", {
    name: "LAKOUR_MJIA.ConfigIA.Titre",
    label: "LAKOUR_MJIA.ConfigIA.Ouvrir",
    hint: "LAKOUR_MJIA.ConfigIA.Aide",
    icon: "fa-solid fa-key",
    type: ConfigIA,
    restricted: true
  });
  game.settings.registerMenu(ID, "personnalitesMenu", {
    name: "LAKOUR_MJIA.Personnalites.Titre",
    label: "LAKOUR_MJIA.Personnalites.Ouvrir",
    hint: "LAKOUR_MJIA.Personnalites.Aide",
    icon: "fa-solid fa-masks-theater",
    type: EditeurPersonnalites,
    restricted: true
  });
}

// Le pilote automatique revoit s'il doit marcher (autonomie ou réglage du pilote changés).
function revoirPilote() {
  game.modules.get(ID)?.api?.moteur?.pilote?.verifierBientot();
}

export const lire = cle => game.settings.get(ID, cle);
export const ecrire = (cle, valeur) => game.settings.set(ID, cle, valeur);

// Un ancien réglage par défaut (jamais changé à la main) est remplacé par le nouveau : par exemple
// gpt-5.5 → gpt-6.1-sol, gpt-4o-mini-tts → gpt-realtime-2.1-mini. Une valeur choisie par le MJ reste.
export async function migrerReglages() {
  const faits = [];
  for (const [cle, anciens] of Object.entries(ANCIENS_DEFAUTS)) {
    const actuel = lire(cle);
    const nouveau = game.settings.settings.get(`${ID}.${cle}`)?.default;
    if (anciens.includes(actuel) && nouveau && actuel !== nouveau) {
      await ecrire(cle, nouveau);
      faits.push(`${actuel} → ${nouveau}`);
    }
  }
  // Voix de personnalité absentes de l'API Realtime : la plus proche.
  const personnalites = lire("personnalites");
  if (personnalites.some(p => p.voixOpenAI && voixRealtime(p.voixOpenAI) !== p.voixOpenAI)) {
    await ecrire("personnalites", personnalites.map(p => (p.voixOpenAI ? { ...p, voixOpenAI: voixRealtime(p.voixOpenAI) } : p)));
    faits.push("voix des personnalités");
  }
  // Personnalités livrées après la création du monde : ajoutées une fois (celles déjà vues, même supprimées depuis, ne reviennent pas).
  const { nouvelles, vues } = personnalitesAAjouter(lire("personnalites"), lire("reparations").personnalitesVues);
  if (nouvelles.length) {
    await ecrire("personnalites", [...lire("personnalites"), ...nouvelles]);
    faits.push(`personnalités : ${nouvelles.map(p => p.nom).join(", ")}`);
  }
  await ecrire("reparations", { ...lire("reparations"), personnalitesVues: vues });
  if (faits.length) ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Migration", { faits: faits.join(", ") }));
}

// Personnalités livrées que ce monde n'a jamais eues. vues = ids déjà proposés (undefined : monde d'avant ce suivi, dont
// on considère comme vues les personnalités qu'il a, plus les livrées d'origine).
export function personnalitesAAjouter(actuelles, vues) {
  const ORIGINE = ["inquisiteur", "conteur", "arbitre", "chroniqueuse", "bouffon"];
  const deja = new Set(vues ?? [...ORIGINE, ...actuelles.map(p => p.id)]);
  const nouvelles = PERSONNALITES_DE_BASE.filter(p => !deja.has(p.id) && !actuelles.some(a => a.id === p.id)).map(p => structuredClone(p));
  return { nouvelles, vues: [...new Set([...deja, ...PERSONNALITES_DE_BASE.map(p => p.id)])] };
}
