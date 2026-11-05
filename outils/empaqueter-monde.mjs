// Empaquette un MONDE VIERGE La Kour (Foundry VTT v14) à partir d'une copie du monde joué sur le serveur : le contenu
// de monde (scènes et journaux installés depuis nos compendiums, tables, listes de lecture, dossiers, réglages qui
// configurent le monde) est gardé ; tout ce qui est personnel ou de partie (utilisateurs, messages, personnages des
// joueurs, brouillard, combats, clés, coffres, mémoires, fils, horloges, chroniques…) est retiré. Outil COMMUN aux
// mondes, appelé depuis le sous-module : `npm run empaqueter-monde` dans lakour-warcraft, lakour-veillees, lakour-fenoir…
//
// Modes (le dépôt du monde est le dossier courant, ou --depot <dossier>) :
//   --inventaire <Data/worlds/<id serveur>>  déballe la base LevelDB (dans un dossier temporaire) et AFFICHE le tri,
//                                           document par document et réglage par réglage, sans rien écrire ;
//   --extraire   <Data/worlds/<id serveur>>  même tri, puis écrit les sources versionnées monde/src/<collection>/*.json
//                                           et monde/world.json, et vérifie le résultat ;
//   --construire                            compile monde/src en LevelDB dans monde/dist/<id>/data, y pose world.json et
//                                           les licences du dépôt (LICENSE, LICENCE-CONTENU.md : LICENCES_DU_MONDE),
//                                           écrit l'archive monde/dist/<id>.zip et monde/dist/world.json (lus par
//                                           outils/empaqueter-module.mjs et le workflow de release) ;
//   --verifier                              relit le paquet produit (monde/dist/<id>, sinon monde/src) et ÉCHOUE s'il
//                                           reste un utilisateur autre que le Gamemaster créé, un message, un acteur
//                                           de type joueur, un réglage interdit ou une chaîne qui ressemble à un secret,
//                                           une IP privée, un chemin Hogun974 ou une adresse mail ; contrôle aussi la
//                                           structure (_id, _key) et signale les liens @UUID / chemins cassés ;
//   --rafraichir                            remet monde/src au niveau du contenu ACTUEL des modules, sans monde du serveur,
//                                           comme une installation neuve du module de contenu (MONDES[module].installation) et
//                                           du guide du MJ IA : journaux et scènes repris des sources des compendiums, manquants
//                                           ajoutés, disparus retirés, <module>.installe et versions à jour, guides du MJ IA
//                                           réécrits (scripts/guide.js) ; aligne monde/world.json (version, versions minimales) ;
//   sans option                             --construire puis --verifier (ce que fait la release GitHub).
//   --version <x.y.z>                       version du monde (par défaut : celle du module de contenu, module.json).
//   --langue en                             (avec --construire, --verifier ou sans option) le MONDE VIERGE ANGLAIS, jumeau du
//                                           français : mêmes sources monde/src, documents traduits par les dictionnaires
//                                           contenu/en/ du module de contenu (outils/traduction.mjs : mêmes _id, uuid, chemins
//                                           et drapeaux récrits vers <module>-en, mémoire de traduction pour les textes repris),
//                                           réglages basculés sur <module>-en (core.moduleConfiguration active <module>-en au
//                                           lieu du module français, compendiums, <module>.installe), manifeste engendré de
//                                           monde/world.json et de monde/world.en.json (id « <id>-en », title et description
//                                           anglais, relationships vers le manifeste <module>-en.json ; Gamemaster identique).
//                                           Produit monde/dist/<id>-en/, monde/dist/<id>-en.zip et monde/dist/world-en.json.
//                                           Les guides du MJ IA (sans dictionnaire) sont réécrits depuis scripts/guide-en.js ; les
//                                           modules de traduction française (fr-core, dnd5e_fr-FR, babele) y sont désactivés.
//
// RÈGLE DE TRI (voir aussi docs/empaqueter-monde.md) — par collection :
//   users           tous retirés ; un seul utilisateur « Gamemaster », rôle 4, sans mot de passe, est créé (les sources
//                   du serveur Foundry ne sont pas disponibles pour vérifier qu'il en crée un quand la collection est
//                   vide ; s'il le fait, la collection n'est plus vide et il n'en crée pas un second) ;
//   messages, combats, fog, cards   tous retirés (partie en cours, brouillard des joueurs) ;
//   actors          retirés : type joueur du système (character, villageois), acteur dont un utilisateur non-MJ est
//                   propriétaire, acteur rangé dans un dossier d'essai (« Essais Claude ») ; gardés : ceux qui viennent
//                   de nos compendiums (PNJ installés), avec ownership { default: 0 } et seulement nos drapeaux ;
//   items, effects, macros          gardés seulement s'ils viennent de nos compendiums ou portent nos drapeaux ;
//   journal         gardés : journaux installés depuis nos compendiums (drapeau <module>.cle, _stats.compendiumSource)
//                   et guides du MJ IA (drapeau lakour-mj-ia.guide) ; retirés : mémoire de campagne, chroniques,
//                   histoires de personnages (drapeaux lakour-mj-ia.memoire / .chronique, lakour-loups.chroniques),
//                   notes de calendrier de Calendaria, « sequencerDatabase », et tout journal d'origine inconnue ;
//   scenes          gardées si elles viennent de nos compendiums ou portent le drapeau du module de contenu ; la scène
//                   d'accueil de Foundry (NUEDEFAULTSCENE0) est retirée ; jetons des acteurs retirés enlevés ;
//   tables, playlists   gardées si elles viennent de nos compendiums ou portent nos drapeaux ; la liste « Ambiances (MJ IA) »
//                   est retirée (pistes jouées en partie ; le MJ IA la re-crée au premier usage) ;
//   folders         gardés : dossiers de compendiums (core.compendiumConfiguration les cite) et dossiers portant nos
//                   drapeaux ; retirés : dossiers de Calendaria, « Essais Claude », et tout dossier resté vide ;
//   settings        par clé (REGLAGES ci-dessous) : réglages de conduite du MJ IA, règles de la veillée et choix du MJ de
//                   Fénoir gardés sur liste blanche, tout le reste de lakour-mj-ia / lakour-loups / lakour-survie retiré
//                   (Fénoir : partie, monde scellé et ses copies) ; <module>.installe gardé ;
//                   core.rtcWorldSettings (serveur TURN, identifiants) retiré ; marqueurs « déjà vu », licences
//                   acceptées, états de Calendaria retirés ; les réglages des systèmes et des autres modules gardés.
// Sur tout document gardé : ownership ramené à son niveau « default » (plus d'entrée par utilisateur), _stats.lastModifiedBy
// et Setting.user mis à null, tout identifiant d'utilisateur du serveur effacé ; Drawing.author (obligatoire pour Foundry) passe
// au Gamemaster créé.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { appliquer, recrireIdentifiant, resumerRapport } from "./traduction.mjs";

// ---------------------------------------------------------------- Les quatre mondes

// traduction : les options d'extraction du fabricant du module (OPTIONS_TRADUCTION de outils/fabriquer-<monde>.mjs, hors
// ignorerPacks), reprises à l'identique pour le monde anglais : les clés que le système lit telles quelles (Veillées : repères
// de la carte « Maison 1 », « Chapelle », noms du plan) ne sont pas traduites, ni comptées comme restées en français.
// installation : ce que l'installation du module de contenu (scripts/main.js, installerContenu) met dans un monde, refait hors
// Foundry par --rafraichir : packs de journaux installés et leur dossier (null : à la racine), scènes installées (exclure : clés
// laissées au compendium ; seulement : les seules clés installées), dossier des scènes (parAventure : un dossier par aventure,
// drapeau « aventure » de la scène, sinon ce nom), carte vivante (sons, zones et épingles marqués), drapeau de version sur les
// scènes, plans (assets/cartes/plans.json), style visuel (plat / relief, réglage lakour-mj-ia.styleVisuel), tables installées
// (drapeau « installer ») et le réglage du système qui les désigne, réglages posés par l'installation ; dossiers créés : couleur
// et forme du drapeau (« booleen » : { dossier: true, aventure? } en 40k ; « nom » : { dossier: <nom> }). scenes.active : la scène
// active à l'ouverture du monde vierge (sans scène active, Foundry masque la barre d'outils, donc la console du MJ IA) : la
// première carte de l'aventure de départ, le village des Veillées, la carte de La Réunion.
export const MONDES = {
  "lakour-40k": {
    id: "la-kour-40k", depot: "lakour-w40k", systeme: "impmal", typesJoueur: ["character"],
    requis: [{ id: "warhammer-lib", type: "module" }],
    installation: {
      journaux: { packs: ["journaux"], dossier: null },
      scenes: { exclure: /^lieu-/, parAventure: "Le Chœur creux", vivante: true, version: true, active: "marche-sept-puits" },
      tables: { dossier: "La Kour 40k", reglage: "impmal.tableSettings" },
      dossiers: { couleur: "#5a1a1a", drapeau: "booleen" }, plans: true, style: true
    }
  },
  "lakour-warcraft": {
    id: "la-kour-warcraft", depot: "lakour-warcraft", systeme: "dnd5e", typesJoueur: ["character"], requis: [], traduction: { exclure: ["max", "count", "license"] },
    installation: {
      journaux: { packs: ["journaux"], dossier: "La Kour Warcraft" },
      scenes: { exclure: /^lieu-/, parAventure: "La Kour Warcraft", vivante: true, version: true, active: "cabestan-quai" },
      reglages: { "dnd5e.metricLengthUnits": true, "dnd5e.metricWeightUnits": true, "dnd5e.metricVolumeUnits": true },
      dossiers: { couleur: "#1a3a5a", drapeau: "nom" }, plans: true, style: true
    }
  },
  "lakour-veillees": {
    id: "la-kour-veillees", depot: "lakour-veillees", systeme: "lakour-loups", typesJoueur: ["villageois"], requis: [], traduction: { exclure: ["repere", "maison", "nom", "texte"] },
    installation: {
      journaux: { packs: ["journaux"], dossier: "Les Veillées de Brumecombe" },
      scenes: { dossier: "Les Veillées de Brumecombe", vivante: true, version: true, active: "village-de-brumecombe" },
      dossiers: { couleur: "#3a2a4a", drapeau: "nom" }, plans: true, style: true
    }
  },
  "lakour-fenoir": {
    id: "la-kour-fenoir", depot: "lakour-fenoir", systeme: "lakour-survie", typesJoueur: ["survivant"], requis: [],
    installation: {
      journaux: { packs: ["guides", "mj"], dossier: "Fénoir" },
      scenes: { seulement: ["carte-de-la-reunion"], dossier: "Fénoir", vivante: false, version: false, active: "carte-de-la-reunion" },
      dossiers: { couleur: "#2b3a2f", drapeau: "nom" }, plans: false, style: false
    }
  }
};
// Modules de traduction FRANÇAISE (interface de Foundry, compendiums dnd5e) : désactivés dans les mondes anglais.
export const MODULES_FRANCAIS = ["fr-core", "dnd5e_fr-FR", "babele"];
export const MOTEUR = "lakour-mj-ia";
export const COMPTE_GITHUB = "https://github.com/Hogun974";
export const COLLECTIONS = ["actors", "cards", "combats", "effects", "fog", "folders", "items", "journal", "macros", "messages",
  "playlists", "scenes", "settings", "tables", "users"];
const TYPE_PAR_COLLECTION = { actors: "Actor", cards: "Cards", combats: "Combat", effects: "ActiveEffect", fog: "FogExploration",
  folders: "Folder", items: "Item", journal: "JournalEntry", macros: "Macro", messages: "ChatMessage", playlists: "Playlist",
  scenes: "Scene", settings: "Setting", tables: "RollTable", users: "User" };
const COLLECTION_PAR_TYPE = Object.fromEntries(Object.entries(TYPE_PAR_COLLECTION).map(([c, t]) => [t, c]));
const GAMEMASTER_ID = "LaKourGamemaster"; // 16 caractères alphanumériques, comme un identifiant Foundry
const GAMEMASTER_NOM = "Gamemaster";

// ---------------------------------------------------------------- Règle de tri des réglages

// Personnalités livrées avec le MJ IA : personnaliteActive n'est gardé que s'il en désigne une (pas une personnalité
// écrite par Jordan, qui vivrait dans lakour-mj-ia.personnalites, retiré).
const PERSONNALITES_LIVREES = new Set(["inquisiteur", "conteur", "arbitre", "chroniqueuse", "bouffon", "voix-de-la-brume"]);

export const REGLAGES = {
  // Liste blanche du moteur : réglages de CONDUITE du monde (booléens, nombres, identifiants livrés). Tout autre réglage
  // lakour-mj-ia.* est retiré : clés, coffres, trousseau, fils, voix, compagnons, horloges, séance, mémoire…
  [MOTEUR]: {
    garder: {
      pilote: "le MJ IA mène la séance (pilote automatique)", piloteDelai: "délai du pilote", piloteEtapes: "étapes du pilote",
      autonomie: "degré d'autonomie du MJ IA", effort: "effort de réflexion demandé au modèle (pas de secret)",
      styleVisuel: "style des cartes (plat ou relief)", jouerPnj: "le MJ IA joue les PNJ", reagirPortes: "réaction aux portes",
      reagirDeplacements: "réaction aux déplacements", seulActifBouge: "seul le joueur actif bouge",
      delaiReponse: "délai de réponse (nombre)", budgetSeance: "budget d'une séance (nombre, pas d'historique)",
      miseEnPlace: "mise en place de la table par le MJ IA (booléen)", fete: "fêtes de saison (auto / fixe)",
      effetsDeFete: "effets visuels des fêtes", panneauTourAuto: "panneau de tour automatique", tourDeTable: "tour de table",
      personnaliteActive: "personnalité du MJ IA choisie pour ce monde (une personnalité livrée)"
    },
    motifsRetires: [
      [/^(trousseau|coffreCarnet|cleCarnet|partCarnet)$/, "clé d'API, coffre ou trousseau"],
      [/^(fournisseur|modele)/, "compte IA de l'opérateur (fournisseur et modèles vont avec sa clé)"],
      [/voix|Voix|transcription|ecoute|entendre|appelJoueur/, "voix et écoute"],
      [/ompagnons/, "compagnons"], [/^horloges$/, "horloges de campagne"], [/^filsScelles$/, "fils de l'IA"],
      [/^(seance|feteCarte|reparations|mouvementsBloques|historiqueLoups|personnalites)/, "état de partie ou mémoire"]
    ],
    sinon: "réglage du moteur hors liste blanche (seuls les réglages de conduite sont livrés)"
  },
  // Système des Veillées : les règles de la veillée sont livrées, la partie, le coffre et les chroniques non.
  "lakour-loups": {
    garder: Object.fromEntries(["mortsVoientTout", "canalDesMorts", "dureeVote", "chanceEpier", "chancePeste", "annoncesEnChat",
      "repartirAZero", "delaiChoix", "salonsAutomatiques", "revelerALaMort", "almanach", "bailli", "banc", "dernierSouffle",
      "gensDePassage", "glasDuDeuil", "masques", "petiteTablee", "plateauInteractif", "signalTour", "veilleeDeFete"]
      .map(c => [c, "règle de la veillée"])),
    motifsRetires: [[/^(partie|coffre|secrets|chroniques|historique|lancementTraite|carnet)$/, "partie, coffre ou chroniques"]],
    sinon: "réglage du système hors liste blanche"
  },
  // Système de Fénoir (systems/lakour-survie/scripts/reglages.mjs) : les choix du MJ sont livrés ; l'état de la partie, le monde
  // réel scellé (coffre) et ses copies en clair non.
  "lakour-survie": {
    garder: Object.fromEntries(["dateDepart", "budgetCreation", "repartitionAuto", "creationOuverte", "fetesSuiventLeJeu", "lumiereSuitLeMoment"]
      .map(c => [c, "choix du MJ pour la partie"])),
    motifsRetires: [[/^(partie|coffre|mondeClair|monde)$/, "état de la partie, monde scellé ou sa copie en clair"]],
    sinon: "réglage du système hors liste blanche"
  },
  core: {
    motifsRetires: [
      [/^rtcWorldSettings$/, "serveur audio/vidéo (adresse et identifiants TURN)"],
      [/^nue\./, "état de la découverte de Foundry"], [/^adventureImports$/, "historique d'imports"]
    ],
    sinon: null // gardé : moduleConfiguration, compendiumConfiguration, permissions, grille, anneaux de jeton…
  },
  // Tout autre espace (systèmes, modules tiers) : gardé, sauf les marqueurs personnels ci-dessous.
  "*": {
    motifsRetires: [
      [/LicenseAgreement/i, "licence acceptée par l'opérateur"], [/primaryGM/, "désigne un utilisateur"],
      [/welcome|runonlyonce|oneTimeMessages|seenVersions|changelogger|updateNotices|update-notice|releaseMessage|firstLoad|firstRun/i,
        "marqueur « déjà vu »"],
      [/^calendaria\.(seededCalendars|weatherHistory|calendarHUDPosition|weatherForecastPlan)$/, "état de Calendaria (re-créé au lancement)"]
    ],
    sinon: null
  }
};

// Modules activés par core.moduleConfiguration (Set), ou null si le réglage est absent ou illisible (rien n'est alors écarté).
export function modulesActifs(settings) {
  const conf = (settings ?? []).find(s => s.key === "core.moduleConfiguration");
  if (!conf) return null;
  try {
    let v = typeof conf.value === "string" ? JSON.parse(conf.value) : conf.value;
    if (typeof v === "string") v = JSON.parse(v);
    return v && typeof v === "object" ? new Set(Object.entries(v).filter(([, on]) => on === true).map(([id]) => id)) : null;
  } catch { return null; }
}

// Verdict d'un réglage : { garde: bool, raison }. `actifs` (modulesActifs) : le réglage d'un module désactivé dans ce monde
// (item-piles réglé pour dnd5e dans un monde impmal, par exemple) ne sert à rien et n'est pas gardé.
export function trierReglage(cle, valeurJson, { moduleContenu, systeme, actifs = null }) {
  const [espace, ...reste] = cle.split(".");
  const nom = reste.join(".");
  if (espace === moduleContenu) return nom === "installe" ? { garde: true, raison: "marqueur d'installation du contenu (évite une réinstallation)" }
    : { garde: false, raison: "réglage du module de contenu hors « installe »" };
  if (actifs && espace !== "core" && espace !== systeme && !actifs.has(espace)) return { garde: false, raison: "réglage d'un module désactivé dans ce monde" };
  const regle = REGLAGES[espace] ?? (espace === systeme && REGLAGES[systeme] ? REGLAGES[systeme] : null);
  const generique = REGLAGES["*"];
  for (const [motif, raison] of generique.motifsRetires) if (motif.test(espace === "core" ? nom : cle)) return { garde: false, raison };
  if (!regle) return { garde: true, raison: "réglage du système ou d'un module tiers (configuration du monde)" };
  for (const [motif, raison] of regle.motifsRetires ?? []) if (motif.test(nom)) return { garde: false, raison };
  if (regle.garder?.[nom]) {
    if (nom === "personnaliteActive") {
      let v; try { v = JSON.parse(valeurJson); } catch { v = null; }
      if (!PERSONNALITES_LIVREES.has(v)) return { garde: false, raison: "personnalité non livrée avec le moteur" };
    }
    return { garde: true, raison: regle.garder[nom] };
  }
  if (regle.sinon) return { garde: false, raison: regle.sinon };
  return { garde: true, raison: "configuration du monde" };
}

// ---------------------------------------------------------------- Secrets : ce qui ne doit jamais sortir

export const MOTIFS_SECRETS = [
  [/sk-(?:ant-)?[A-Za-z0-9_-]{16,}/, "clé d'API (sk-…)"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/, "clé d'API"],
  [/\bAKIA[0-9A-Z]{16}\b/, "clé AWS"],
  [/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/, "hash bcrypt"],
  [/\b(?:10|127)(?:\.\d{1,3}){3}\b|\b192\.168(?:\.\d{1,3}){2}\b|\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/, "adresse IP privée"],
  [/hogun974/i, "chemin ou identifiant Hogun974 (hors adresses GitHub publiques)"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, "adresse mail"],
  [/["']?(?:api[_-]?key|apikey|password|passwd|secret|token|bearer)["']?\s*[:=]\s*["']?(?=[A-Za-z0-9+/=_-]*\d)[A-Za-z0-9+/=_-]{12,}/i, "paire clé/valeur sensible"],
  [/(?<![A-Za-z0-9+=_-])(?=[A-Za-z0-9+=_-]*\d)[A-Za-z0-9+=_-]{40,}(?![A-Za-z0-9+=_-])/, "chaîne longue (avec chiffres) qui ressemble à un jeton"]
];
// Les adresses GitHub publiques du projet (manifest, download, readme…) portent le compte Hogun974 : ce n'est pas une
// fuite. Elles sont ôtées de la chaîne avant les contrôles ; les chemins de fichiers et adresses web ne sont pas soumis
// au contrôle « chaîne longue » (un nom de fichier long n'est pas un jeton).
const ADRESSES_PUBLIQUES = /https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/Hogun974(?=[/"\s]|$)/g;
const estCheminOuAdresse = s => /^(?:https?:\/\/|modules\/|systems\/|icons\/|worlds\/|ui\/|nue\/|data:)/.test(s);

// Parcourt un document ; appelle f(chemin, chaîne) pour chaque chaîne.
function chaines(valeur, f, chemin = "") {
  if (typeof valeur === "string") f(chemin, valeur);
  else if (Array.isArray(valeur)) valeur.forEach((v, i) => chaines(v, f, `${chemin}[${i}]`));
  else if (valeur && typeof valeur === "object") for (const [k, v] of Object.entries(valeur)) chaines(v, f, chemin ? `${chemin}.${k}` : k);
}

// Fuites dans un document : [{ chemin, motif }]. Le texte lui-même n'est jamais renvoyé.
export function fuites(doc, { idsInterdits = [], nomsInterdits = [] } = {}) {
  const trouvees = [];
  chaines(doc, (chemin, brut) => {
    const s = brut.replace(ADRESSES_PUBLIQUES, "");
    for (const [motif, nom] of MOTIFS_SECRETS) {
      if (nom.startsWith("chaîne longue") && estCheminOuAdresse(brut)) continue;
      if (motif.test(s)) trouvees.push({ chemin, motif: nom });
    }
    for (const id of idsInterdits) if (s.includes(id)) trouvees.push({ chemin, motif: "identifiant d'utilisateur du serveur" });
    for (const n of nomsInterdits) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(s)) trouvees.push({ chemin, motif: "nom d'un utilisateur du serveur" });
  });
  return trouvees;
}

// ---------------------------------------------------------------- Utilitaires

const estId = v => typeof v === "string" && /^[A-Za-z0-9]{16}$/.test(v);
const echapperRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lireJson = chemin => JSON.parse(readFileSync(chemin, "utf8"));
const ecrireJson = (chemin, v) => { mkdirSync(dirname(chemin), { recursive: true }); writeFileSync(chemin, `${JSON.stringify(v, null, 2)}\n`); };
const slug = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
const lireDossierJson = d => existsSync(d) ? readdirSync(d).filter(f => f.endsWith(".json")).sort().map(f => lireJson(join(d, f))) : [];

// Le CLI Foundry, résolu depuis le dépôt du monde (son node_modules).
async function cliFoundry(racine) {
  const require = createRequire(join(racine, "package.json"));
  return import(pathToFileURL(require.resolve("@foundryvtt/foundryvtt-cli")).href);
}

// Le dépôt du monde : module de contenu (modules/<id>/module.json dont l'id est dans MONDES), monde, chemins. Avec
// langue « en », le monde ANGLAIS : moduleCible et idMonde portent « -en », et nos portées (scopes) sont celles du paquet
// anglais (le module français n'y figure plus : une trace qui en resterait est une erreur, voir verifier).
export function contexteDuDepot(racine, { langue = "fr" } = {}) {
  if (!["fr", "en"].includes(langue)) throw new Error(`langue inconnue : ${langue} (fr ou en)`);
  const modules = existsSync(join(racine, "modules")) ? readdirSync(join(racine, "modules")) : [];
  const moduleContenu = modules.find(m => MONDES[m] && existsSync(join(racine, "modules", m, "module.json")));
  if (!moduleContenu) throw new Error(`aucun module de contenu connu (${Object.keys(MONDES).join(", ")}) dans ${join(racine, "modules")}`);
  const manifeste = lireJson(join(racine, "modules", moduleContenu, "module.json"));
  const monde = MONDES[moduleContenu];
  const moteur = existsSync(join(racine, "modules", MOTEUR, "module.json")) ? lireJson(join(racine, "modules", MOTEUR, "module.json")) : null;
  const anglais = langue === "en";
  const moduleCible = anglais ? `${moduleContenu}-en` : moduleContenu;
  return { racine, moduleContenu, manifeste, moteur, monde, langue, anglais, moduleCible, idMonde: anglais ? `${monde.id}-en` : monde.id,
    fichierManifeste: anglais ? "world-en.json" : "world.json", scopes: new Set([moduleCible, MOTEUR, monde.systeme]),
    dossierMonde: join(racine, "monde"), src: join(racine, "monde", "src"), dist: join(racine, "monde", "dist") };
}

// ---------------------------------------------------------------- Déballage d'un monde du serveur

async function deballer(racine, dossierMondeServeur) {
  const { extractPack } = await cliFoundry(racine);
  const temp = mkdtempSync(join(tmpdir(), "empaqueter-monde-"));
  const docs = {};
  for (const coll of COLLECTIONS) {
    const base = join(dossierMondeServeur, "data", coll);
    docs[coll] = [];
    if (!existsSync(base)) continue;
    const sortie = join(temp, coll);
    mkdirSync(sortie, { recursive: true });
    await extractPack(base, sortie, { log: false, nedb: false, yaml: false, jsonOptions: { space: 2 } });
    docs[coll] = lireDossierJson(sortie);
  }
  const autres = readdirSync(join(dossierMondeServeur, "data")).filter(d => !COLLECTIONS.includes(d));
  rmSync(temp, { recursive: true, force: true });
  return { docs, autres, world: lireJson(join(dossierMondeServeur, "world.json")) };
}

// ---------------------------------------------------------------- Tri

const scopesDe = doc => Object.keys(doc.flags ?? {});
const vientDeNous = (doc, scopes) => {
  const src = doc._stats?.compendiumSource;
  return typeof src === "string" && [...scopes].some(s => src.startsWith(`Compendium.${s}.`));
};
const porteNosDrapeaux = (doc, scopes) => scopesDe(doc).some(s => scopes.has(s));

// Trie les documents d'un monde. Renvoie { gardes: { collection: [docs nettoyés] }, verdicts: [{ collection, id, nom, type,
// garde, raison }], utilisateurs: { ids, noms } }. Les noms des utilisateurs et des acteurs retirés ne sont pas repris
// dans les verdicts (seulement leur type) : l'inventaire peut être affiché ou collé sans fuite.
export function trier(docs, ctx) {
  const { scopes, monde, moduleContenu } = ctx;
  const verdicts = [];
  const gardes = Object.fromEntries(COLLECTIONS.map(c => [c, []]));
  const utilisateurs = { ids: new Set(), noms: new Set(), nonMj: new Set() };
  for (const u of docs.users ?? []) {
    // Le Gamemaster créé par l'outil (sources monde/src relues par --rafraichir) n'est pas un utilisateur du serveur.
    if (u._id === GAMEMASTER_ID) continue;
    utilisateurs.ids.add(u._id);
    if (u.name && u.name.toLowerCase() !== GAMEMASTER_NOM.toLowerCase() && u.name.length >= 5) utilisateurs.noms.add(u.name);
    if (u.role !== 4) utilisateurs.nonMj.add(u._id);
    verdicts.push({ collection: "users", id: u._id, nom: `(utilisateur, rôle ${u.role})`, garde: false, raison: "un monde vierge n'a pas d'utilisateur" });
  }
  for (const coll of ["messages", "combats", "fog", "cards"]) for (const d of docs[coll] ?? []) {
    verdicts.push({ collection: coll, id: d._id, nom: coll === "messages" ? "(message)" : d.name ?? `(${coll})`, garde: false, raison: { messages: "messages de chat : partie", combats: "combat : partie", fog: "brouillard d'un joueur", cards: "cartes : partie" }[coll] });
  }

  // Dossiers : chaîne des parents, pour reconnaître les dossiers d'essai.
  const dossiers = new Map((docs.folders ?? []).map(f => [f._id, f]));
  const cheminDossier = id => { const noms = []; for (let d = dossiers.get(id); d; d = dossiers.get(d.folder)) noms.unshift(d.name ?? ""); return noms; };
  const dansEssais = doc => cheminDossier(doc.folder).some(n => /essais?\s+claude/i.test(n));

  const juger = (coll, d, verdict) => {
    verdicts.push({ collection: coll, id: d._id, nom: verdict.nom ?? d.name ?? "(sans nom)", type: d.type, garde: verdict.garde, raison: verdict.raison });
    if (verdict.garde) gardes[coll].push(d);
  };

  for (const d of docs.actors ?? []) {
    const proprietaireJoueur = Object.entries(d.ownership ?? {}).some(([u, n]) => u !== "default" && utilisateurs.nonMj.has(u) && n >= 3);
    if (monde.typesJoueur.includes(d.type)) juger("actors", d, { garde: false, nom: `(acteur de type ${d.type})`, raison: "acteur de type joueur" });
    else if (proprietaireJoueur) juger("actors", d, { garde: false, nom: `(acteur de type ${d.type})`, raison: "un joueur en est propriétaire" });
    else if (dansEssais(d)) juger("actors", d, { garde: false, nom: `(acteur de type ${d.type})`, raison: "dossier d'essai" });
    else if (vientDeNous(d, scopes) || porteNosDrapeaux(d, scopes)) juger("actors", d, { garde: true, raison: "PNJ venu de nos compendiums" });
    else juger("actors", d, { garde: false, nom: `(acteur de type ${d.type})`, raison: "origine inconnue" });
  }
  for (const coll of ["items", "effects", "macros"]) for (const d of docs[coll] ?? []) {
    if (dansEssais(d)) juger(coll, d, { garde: false, raison: "dossier d'essai" });
    else if (vientDeNous(d, scopes) || porteNosDrapeaux(d, scopes)) juger(coll, d, { garde: true, raison: "venu de nos compendiums ou de nos modules" });
    else juger(coll, d, { garde: false, raison: "origine inconnue" });
  }
  for (const d of docs.journal ?? []) {
    const f = d.flags ?? {};
    if (f[MOTEUR]?.memoire || f[MOTEUR]?.chronique || f[monde.systeme]?.chroniques) juger("journal", d, { garde: false, raison: "mémoire de campagne ou chronique" });
    else if (/m[ée]moire de campagne|chronique|histoire de/i.test(d.name ?? "")) juger("journal", d, { garde: false, raison: "mémoire, chronique ou histoire de personnage (par le nom)" });
    else if (dansEssais(d)) juger("journal", d, { garde: false, raison: "dossier d'essai" });
    else if (f.calendaria) juger("journal", d, { garde: false, raison: "note de calendrier de Calendaria (re-créée par le module)" });
    else if (d.name === "sequencerDatabase") juger("journal", d, { garde: false, raison: "journal technique de Sequencer (re-créé par le module)" });
    else if (f[MOTEUR]?.guide) juger("journal", d, { garde: true, raison: "guide du MJ IA" });
    else if (vientDeNous(d, scopes) || f[moduleContenu]?.cle) juger("journal", d, { garde: true, raison: "journal installé depuis nos compendiums" });
    else juger("journal", d, { garde: false, raison: "origine inconnue (ni nos compendiums, ni le MJ IA)" });
  }
  for (const d of docs.scenes ?? []) {
    if (d._id === "NUEDEFAULTSCENE0") juger("scenes", d, { garde: false, raison: "scène d'accueil de Foundry" });
    else if (dansEssais(d)) juger("scenes", d, { garde: false, raison: "dossier d'essai" });
    else if (vientDeNous(d, scopes) || porteNosDrapeaux(d, scopes)) juger("scenes", d, { garde: true, raison: "scène installée depuis nos compendiums" });
    else juger("scenes", d, { garde: false, raison: "origine inconnue" });
  }
  for (const coll of ["tables", "playlists"]) for (const d of docs[coll] ?? []) {
    if (dansEssais(d)) juger(coll, d, { garde: false, raison: "dossier d'essai" });
    else if (coll === "playlists" && d.flags?.[MOTEUR]?.ambiances) juger(coll, d, { garde: false, raison: "ambiances jouées en partie (le MJ IA re-crée la liste au premier usage)" });
    else if (vientDeNous(d, scopes) || porteNosDrapeaux(d, scopes)) juger(coll, d, { garde: true, raison: coll === "tables" ? "table installée depuis nos compendiums" : "liste de lecture du MJ IA" });
    else juger(coll, d, { garde: false, raison: "origine inconnue" });
  }
  for (const [cle, valeur] of Object.entries(docs)) if (!COLLECTIONS.includes(cle)) for (const d of valeur) juger(cle, d, { garde: false, raison: "collection hors Foundry" });

  // Dossiers : nos drapeaux ou dossiers de compendiums ; puis élagage de ceux restés vides.
  const idsGardes = new Set(Object.values(gardes).flat().map(d => d._id));
  const dossiersCandidats = (docs.folders ?? []).filter(f => {
    if (f.flags?.calendaria || /essais?\s+claude/i.test(f.name ?? "")) { verdicts.push({ collection: "folders", id: f._id, nom: f.name, type: f.type, garde: false, raison: f.flags?.calendaria ? "dossier de Calendaria" : "dossier d'essai" }); return false; }
    return true;
  });
  const vivants = new Set(dossiersCandidats.map(f => f._id));
  let changement = true;
  while (changement) {
    changement = false;
    for (const f of dossiersCandidats) {
      if (!vivants.has(f._id)) continue;
      if (f.type === "Compendium") continue;
      const aContenu = Object.values(gardes).flat().some(d => d.folder === f._id && idsGardes.has(d._id));
      const aSousDossier = dossiersCandidats.some(g => g.folder === f._id && vivants.has(g._id));
      if (!aContenu && !aSousDossier) { vivants.delete(f._id); changement = true; }
    }
  }
  for (const f of dossiersCandidats) {
    const garde = vivants.has(f._id);
    verdicts.push({ collection: "folders", id: f._id, nom: f.name, type: f.type, garde, raison: garde ? (f.type === "Compendium" ? "dossier de compendiums (cité par core.compendiumConfiguration)" : "dossier de nos documents") : "dossier resté vide après le tri" });
    if (garde) gardes.folders.push(f);
  }

  // Réglages : une clé en double dans la base (vu : impmal.systemMigrationVersion) → le plus récent seulement.
  const parCle = new Map();
  for (const d of docs.settings ?? []) {
    const deja = parCle.get(d.key);
    if (deja && (deja._stats?.modifiedTime ?? 0) >= (d._stats?.modifiedTime ?? 0)) { verdicts.push({ collection: "settings", id: d._id, nom: d.key, garde: false, raison: "doublon plus ancien de la même clé" }); continue; }
    if (deja) verdicts.push({ collection: "settings", id: deja._id, nom: deja.key, garde: false, raison: "doublon plus ancien de la même clé" });
    parCle.set(d.key, d);
  }
  const actifs = modulesActifs([...parCle.values()]);
  for (const d of parCle.values()) {
    const v = trierReglage(d.key, d.value, { moduleContenu, systeme: monde.systeme, actifs });
    verdicts.push({ collection: "settings", id: d._id, nom: d.key, garde: v.garde, raison: v.raison });
    if (v.garde) gardes.settings.push(d);
  }

  // Nettoyage des documents gardés.
  const idsActeurs = new Set(gardes.actors.map(a => a._id));
  const effaces = { ownership: 0, auteurs: 0, identifiants: 0, jetons: 0, dossiers: 0 };
  const nettoyer = (valeur, coll, cle) => {
    if (typeof valeur === "string") {
      if (!utilisateurs.ids.size) return valeur;
      let s = valeur;
      for (const id of utilisateurs.ids) if (s.includes(id)) { s = s.split(id).join(""); effaces.identifiants++; }
      return s === valeur ? valeur : s;
    }
    if (Array.isArray(valeur)) return valeur.map(v => nettoyer(v, coll, cle));
    if (!valeur || typeof valeur !== "object") return valeur;
    const sortie = {};
    for (const [k, v] of Object.entries(valeur)) {
      if (k === "ownership" && v && typeof v === "object") {
        const niveau = coll === "actors" ? 0 : (v.default ?? 0);
        if (Object.keys(v).some(u => u !== "default")) effaces.ownership++;
        sortie.ownership = { default: niveau };
      } else if (k === "_stats" && v && typeof v === "object") sortie._stats = { ...v, lastModifiedBy: null };
      // Un dessin sans auteur est refusé par Foundry (champ obligatoire) : il prend le Gamemaster créé.
      else if (k === "author" && cle === "drawings") { if (v && v !== GAMEMASTER_ID) effaces.auteurs++; sortie.author = GAMEMASTER_ID; }
      else if (k === "author" && (estId(v) || v === null)) { if (v) effaces.auteurs++; sortie.author = null; }
      else if (k === "user" && cle === "settings" && (estId(v) || v === null)) { if (v) effaces.auteurs++; sortie.user = null; }
      else if (k === "flags" && coll === "actors" && cle === "actors" && v && typeof v === "object") sortie.flags = Object.fromEntries(Object.entries(v).filter(([s]) => scopes.has(s) || s === "core"));
      else if (k === "folder" && typeof v === "string" && !vivants.has(v)) { sortie.folder = null; effaces.dossiers++; }
      else sortie[k] = nettoyer(v, coll, k);
    }
    return sortie;
  };
  for (const coll of COLLECTIONS) gardes[coll] = gardes[coll].map(d => nettoyer(d, coll, coll));
  for (const s of gardes.scenes) {
    const avant = s.tokens?.length ?? 0;
    s.tokens = (s.tokens ?? []).filter(t => !t.actorId || idsActeurs.has(t.actorId));
    effaces.jetons += avant - s.tokens.length;
  }
  // Un seul utilisateur : le Gamemaster, sans mot de passe.
  gardes.users = [{
    name: GAMEMASTER_NOM, role: 4, _id: GAMEMASTER_ID, password: "", avatar: null, character: null, color: "#aa3333", pronouns: "",
    hotbar: {}, permissions: {}, flags: {}, _stats: { coreVersion: null, systemId: null, systemVersion: null, createdTime: null, modifiedTime: null, lastModifiedBy: null },
    _key: `!users!${GAMEMASTER_ID}`
  }];
  verdicts.push({ collection: "users", id: GAMEMASTER_ID, nom: GAMEMASTER_NOM, garde: true, raison: "utilisateur Gamemaster créé, sans mot de passe" });
  return { gardes, verdicts, utilisateurs: { ids: [...utilisateurs.ids], noms: [...utilisateurs.noms] }, effaces };
}

// ---------------------------------------------------------------- Manifeste du monde

export function manifesteDuMonde(ctx, worldServeur, version) {
  const { monde, manifeste, moteur, moduleContenu } = ctx;
  const depot = `${COMPTE_GITHUB}/${monde.depot}`;
  const requis = [
    { id: monde.systeme, type: "system", compatibility: { minimum: worldServeur.systemVersion } },
    { id: moduleContenu, type: "module", manifest: `${depot}/releases/latest/download/module.json`, compatibility: { minimum: manifeste.version } },
    { id: MOTEUR, type: "module", manifest: `${COMPTE_GITHUB}/${MOTEUR}/releases/latest/download/module.json`, ...(moteur ? { compatibility: { minimum: moteur.version } } : {}) },
    ...monde.requis
  ];
  return {
    id: monde.id,
    title: worldServeur.title,
    description: worldServeur.description,
    version,
    system: monde.systeme,
    systemVersion: worldServeur.systemVersion,
    coreVersion: worldServeur.coreVersion,
    compatibility: { minimum: "14", verified: worldServeur.coreVersion },
    background: `modules/${moduleContenu}/assets/monde/fond.jpg`,
    joinTheme: worldServeur.joinTheme ?? "default",
    authors: manifeste.authors ?? [],
    url: depot,
    manifest: `${depot}/releases/latest/download/world.json`,
    download: `${depot}/releases/latest/download/${monde.id}.zip`,
    readme: `${depot}#readme`,
    license: "LICENSE",
    bugs: `${depot}/issues`,
    relationships: { requires: requis },
    flags: {}
  };
}

// Le manifeste du monde anglais, engendré du manifeste français et de monde/world.en.json ({ id: "<id>-en", title, description }) :
// même version, mêmes auteurs et adresses ; fond d'écran du module anglais, manifeste world-en.json, archive <id>-en.zip, et le
// module de contenu requis devient <module>-en (manifeste <module>-en.json). Le système, le moteur et les autres modules requis
// ne changent pas. Pure : sans disque.
export function manifesteDuMondeAnglais(manifeste, traductions, { moduleContenu, monde }) {
  const moduleEn = `${moduleContenu}-en`;
  for (const champ of ["id", "title", "description"]) {
    if (typeof traductions?.[champ] !== "string" || !traductions[champ].trim()) throw new Error(`monde/world.en.json : champ ${champ} manquant`);
  }
  if (traductions.id !== `${monde.id}-en`) throw new Error(`monde/world.en.json : id ${traductions.id} au lieu de ${monde.id}-en`);
  const depot = `${COMPTE_GITHUB}/${monde.depot}`;
  const requis = (manifeste.relationships?.requires ?? []).map(r => (r.id === moduleContenu
    ? { ...r, id: moduleEn, manifest: `${depot}/releases/latest/download/${moduleEn}.json` } : r));
  return {
    ...manifeste, id: traductions.id, title: traductions.title, description: traductions.description,
    background: recrireIdentifiant(manifeste.background, moduleContenu, moduleEn),
    manifest: `${depot}/releases/latest/download/world-en.json`,
    download: `${depot}/releases/latest/download/${traductions.id}.zip`,
    relationships: { ...manifeste.relationships, requires: requis }
  };
}

// Le manifeste du paquet à produire : monde/world.json (version demandée, sinon celle du module), ou son jumeau anglais.
function manifesteCible(ctx, version) {
  const fichier = join(ctx.dossierMonde, "world.json");
  if (!existsSync(fichier)) throw new Error(`${relative(ctx.racine, fichier)} absent : lancer d'abord --extraire <monde du serveur>`);
  const fr = { ...lireJson(fichier), version: version ?? ctx.manifeste.version };
  if (!ctx.anglais) return fr;
  const en = join(ctx.dossierMonde, "world.en.json");
  if (!existsSync(en)) throw new Error(`${relative(ctx.racine, en)} absent : il porte l'id, le titre et la description du monde anglais`);
  return manifesteDuMondeAnglais(fr, lireJson(en), ctx);
}

// Les dictionnaires de traduction du module de contenu (modules/<module>/contenu/en/<pack>.json, union ; module.json et
// figurants.json à part), plus une entrée de mémoire par étiquette du manifeste (dossiers de compendiums, packs) : les dossiers
// du monde portent souvent ces noms. Rend { dictionnaire, traductionsManifeste }.
export function dictionnairesDuModule(racine, moduleContenu) {
  const dossier = join(racine, "modules", moduleContenu, "contenu", "en");
  const dictionnaire = {};
  let traductionsManifeste = {};
  if (!existsSync(dossier)) return { dictionnaire, traductionsManifeste };
  for (const f of readdirSync(dossier).filter(f => f.endsWith(".json")).sort()) {
    const contenu = lireJson(join(dossier, f));
    if (f === "module.json") traductionsManifeste = contenu;
    else if (f !== "figurants.json") Object.assign(dictionnaire, contenu);
  }
  const manifeste = lireJson(join(racine, "modules", moduleContenu, "module.json"));
  const etiquettes = {};
  let i = 0;
  for (const [fr, en] of Object.entries(traductionsManifeste.packFolders ?? {})) etiquettes[String(i++)] = { fr, en };
  for (const p of manifeste.packs ?? []) if (p.label && traductionsManifeste.packs?.[p.name]) etiquettes[String(i++)] = { fr: p.label, en: traductionsManifeste.packs[p.name] };
  if (i) dictionnaire["_manifeste/etiquettes"] = { _nom: "étiquettes du manifeste (mémoire pour les dossiers)", ...etiquettes };
  return { dictionnaire, traductionsManifeste };
}

// Traduit les documents d'un monde (collections de COLLECTIONS, tels que monde/src les range) vers le module anglais :
// - un document installé depuis un de nos compendiums (_stats.compendiumSource) prend l'entrée « <pack>/<_id du compendium> »
//   de son dictionnaire (recopiée sous son propre _id, qui peut différer) ; ses pages re-créées par l'installation (autres
//   identifiants) et tout autre texte repris passent par la mémoire (même français -> même anglais) ;
// - un document du moteur (drapeaux lakour-mj-ia : guides, listes de lecture) n'est pas traduit (pack « moteur », ignoré) ;
// - uuid, chemins modules/<module>/ et portée de drapeaux récrits vers <module>-en, à toute profondeur, documents du moteur compris ;
// - réglages : la clé <module>.* devient <module>-en.* (installe), et dans les valeurs « "<module>. » (compendiums de
//   core.compendiumConfiguration, packSourceConfiguration…) et « "<module>" » (core.moduleConfiguration) deviennent « -en » ;
//   core.moduleConfiguration désactive les modules de traduction française (MODULES_FRANCAIS : fr-core, dnd5e_fr-FR, babele) ;
// - les guides du MJ IA ne sont pas traduits ici (ils n'ont pas de dictionnaire) : construire les réécrit depuis guide-en.js ;
// - utilisateurs inchangés (le Gamemaster créé).
// options : celles de l'extraction (MONDES[module].traduction : exclure…).
// Rend { docs (copies, par collection), rapport (celui d'appliquer : traduits, parMemoire, manquants, obsoletes, erreurs) }.
export function traduireMonde(docs, { moduleContenu, dictionnaire = {}, options = MONDES[moduleContenu]?.traduction ?? {} }) {
  const moduleEn = `${moduleContenu}-en`;
  const prefixe = `Compendium.${moduleContenu}.`;
  const liste = [];
  for (const coll of COLLECTIONS) {
    if (["settings", "users"].includes(coll)) continue;
    for (const doc of docs[coll] ?? []) {
      const src = doc._stats?.compendiumSource;
      let pack = doc.flags?.[MOTEUR] ? "moteur" : "monde", cle = null;
      if (typeof src === "string" && src.startsWith(prefixe)) { const p = src.split("."); pack = p[2]; cle = `${pack}/${p[4]}`; }
      liste.push({ coll, pack, cle, doc });
    }
  }
  const dico = { ...dictionnaire };
  for (const d of liste) if (d.cle && dictionnaire[d.cle] && d.cle !== `${d.pack}/${d.doc._id}`) dico[`${d.pack}/${d.doc._id}`] = dictionnaire[d.cle];
  const { documents, rapport } = appliquer(liste, dico, { ...options, module: moduleContenu, deId: moduleContenu, versId: moduleEn, ignorerPacks: ["moteur"] });
  const sortie = Object.fromEntries(COLLECTIONS.map(c => [c, []]));
  for (const d of documents) sortie[d.coll].push(d.doc);
  const motifs = [
    [new RegExp(`"${echapperRegex(moduleContenu)}\\.`, "g"), `"${moduleEn}.`],
    [new RegExp(`"${echapperRegex(moduleContenu)}"`, "g"), `"${moduleEn}"`]
  ];
  for (const s of docs.settings ?? []) {
    // Les modules de traduction française sont désactivés dans le monde anglais : leurs réglages n'ont plus lieu d'être.
    if (MODULES_FRANCAIS.includes(s.key.split(".")[0])) continue;
    const key = s.key.startsWith(`${moduleContenu}.`) ? `${moduleEn}.${s.key.slice(moduleContenu.length + 1)}` : s.key;
    let value = s.value;
    if (typeof value === "string") {
      value = recrireIdentifiant(value, moduleContenu, moduleEn);
      for (const [motif, remplacement] of motifs) value = value.replace(motif, remplacement);
    }
    // Monde anglais : les modules de traduction française restent déclarés mais désactivés.
    if (key === "core.moduleConfiguration" && typeof value === "string") {
      try {
        const actifs = JSON.parse(value);
        for (const m of MODULES_FRANCAIS) if (actifs[m]) actifs[m] = false;
        value = JSON.stringify(actifs);
      } catch { /* valeur illisible : laissée telle quelle, la vérification le dira */ }
    }
    sortie.settings.push({ ...structuredClone(s), key, value });
  }
  sortie.users = structuredClone(docs.users ?? []);
  return { docs: sortie, rapport };
}

// ---------------------------------------------------------------- Rafraîchir les sources depuis le contenu actuel

// Les sources monde/src sont extraites d'un monde du serveur, souvent plus vieux que le contenu des modules. --rafraichir les
// remet au niveau du contenu actuel, SANS monde du serveur, comme le ferait une installation neuve du module de contenu
// (MONDES[module].installation, calquée sur scripts/main.js) puis du guide du MJ IA (scripts/guide.js) : journaux et scènes
// repris de modules/<module>/src (identifiant, dossier et rang du monde gardés), documents disparus du module retirés, journaux,
// scènes et tables manquants ajoutés, marqueur <module>.installe et drapeaux de version à jour, guides du MJ IA réécrits à leur
// version. Les règles du tri (trier) sont réappliquées d'abord : une règle ajoutée depuis l'extraction vaut aussi pour les sources.

// Identifiant Foundry (16 caractères) tiré d'une graine : le même à chaque passage, donc des sources stables dans git.
export function idStable(graine) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const h = createHash("sha256").update(String(graine)).digest();
  let id = "";
  for (let i = 0; i < 16; i++) id += alphabet[h[i] % alphabet.length];
  return id;
}

// Chemin d'une image du module selon le style visuel (plat : assets/<x>/<f> ; relief : assets/<x>/3d/<f>), comme
// cheminSelonStyle des modules de contenu.
export function cheminSelonStyle(src, style, moduleContenu) {
  if (typeof src !== "string" || !src.startsWith(`modules/${moduleContenu}/assets/`)) return src;
  const plat = src.replace("/3d/", "/");
  if (style !== "3d") return plat;
  const i = plat.lastIndexOf("/");
  return `${plat.slice(0, i)}/3d${plat.slice(i)}`;
}

// Les deux journaux du guide du MJ IA dans une langue, comme installerGuide (scripts/guide.js) : pages réécrites, nom du guide,
// drapeaux { guide, versionGuide, langueGuide } ; guide des joueurs visible (OBSERVER), guide du MJ caché. Identifiant, dossier,
// rang et _stats du journal existant gardés ; pages aux identifiants stables (les mêmes en français et en anglais).
// guide : { GUIDES, VERSION_GUIDE } de scripts/guide.js ; versHTML : celui de scripts/utilitaires.js.
export const GUIDES_DU_MOTEUR = [{ cle: "guide-mj", pages: "mj", visible: false }, { cle: "guide-joueurs", pages: "joueurs", visible: true }];
export function journalDuGuide(existant, cle, { langue, guide, versHTML }) {
  const g = guide.GUIDES[langue] ?? guide.GUIDES.fr;
  const def = GUIDES_DU_MOTEUR.find(x => x.cle === cle);
  const id = existant._id;
  const pages = g[def.pages].map((p, i) => {
    const pid = idStable(`${id}.page.${i}`);
    return { _id: pid, _key: `!journal.pages!${id}.${pid}`, name: p.titre, type: "text", sort: (i + 1) * 100, title: { show: true, level: 1 },
      text: { content: versHTML(p.texte), format: 1 }, ownership: { default: -1 }, flags: {} };
  });
  return {
    ...existant, name: g.noms[cle], categories: existant.categories ?? [], ownership: { default: def.visible ? 2 : 0 },
    flags: { ...(existant.flags ?? {}), [MOTEUR]: { guide: cle, versionGuide: guide.VERSION_GUIDE, langueGuide: langue } },
    pages, _key: `!journal!${id}`
  };
}

// Récrit l'identifiant du parent dans les _key des documents imbriqués (une source du compendium posée sous un autre _id).
function recrireCles(valeur, ancien, nouveau) {
  if (Array.isArray(valeur)) return valeur.map(v => recrireCles(v, ancien, nouveau));
  if (!valeur || typeof valeur !== "object") return valeur;
  const sortie = {};
  for (const [k, v] of Object.entries(valeur)) sortie[k] = k === "_key" && typeof v === "string" ? v.split(ancien).join(nouveau) : recrireCles(v, ancien, nouveau);
  return sortie;
}

// Remet des documents de monde (collections de COLLECTIONS, déjà triés) au niveau du contenu actuel. Pure : sans disque.
// options : moduleContenu ; sources { <pack>: [docs de modules/<module>/src/<pack>] } ; typesPacks { <pack>: "JournalEntry"… } ;
// versionContenu (VERSION_CONTENU du module) ; plans (assets/cartes/plans.json) ; guide et versHTML (guides du MJ IA, langue fr) ;
// coreVersion, systemVersion (ceux du monde, pour les _stats des documents ajoutés).
// Rend { docs, rapport: [lignes] }.
export function rafraichirMonde(docs, { moduleContenu, sources, typesPacks, versionContenu, plans = {}, guide = null, versHTML = null, coreVersion = null, systemVersion = null }) {
  const monde = MONDES[moduleContenu];
  const inst = monde.installation ?? {};
  const M = moduleContenu;
  const sortie = Object.fromEntries(COLLECTIONS.map(c => [c, structuredClone(docs[c] ?? [])]));
  const rapport = [];
  const reglage = cle => sortie.settings.find(s => s.key === cle);
  const valeurReglage = cle => { try { return JSON.parse(reglage(cle)?.value ?? "null"); } catch { return null; } };
  const poserReglage = (cle, valeur, pourquoi) => {
    const json = JSON.stringify(valeur);
    const s = reglage(cle);
    if (s && s.value === json) return;
    if (s) s.value = json;
    else { const id = idStable(`${monde.id}.reglage.${cle}`); sortie.settings.push({ key: cle, user: null, value: json, _id: id, _stats: stats(null), _key: `!settings!${id}` }); }
    rapport.push(`réglage ${cle} = ${json.length > 60 ? `${json.slice(0, 60)}…` : json} (${pourquoi})`);
  };
  const stats = src => ({ coreVersion, systemId: monde.systeme, systemVersion, createdTime: null, modifiedTime: null, lastModifiedBy: null,
    compendiumSource: src, duplicateSource: null, exportSource: null });
  const style = inst.style ? (valeurReglage(`${MOTEUR}.styleVisuel`) ?? "2d") : "2d";
  const uuid = (pack, s) => `Compendium.${M}.${pack}.${typesPacks[pack]}.${s._id}`;
  const cleDe = d => d.flags?.[M]?.cle;
  const libre = (coll, id) => !sortie[coll].some(d => d._id === id);
  // Le document du monde installé depuis cette source : même source au compendium, sinon même clé.
  const trouver = (coll, pack, s) => sortie[coll].find(d => d._stats?.compendiumSource === uuid(pack, s))
    ?? (cleDe(s) ? sortie[coll].find(d => cleDe(d) === cleDe(s)) : undefined);
  // La source au compendium d'un document du monde (pack et document), ou null.
  const sourceDe = d => {
    const src = d._stats?.compendiumSource;
    if (typeof src !== "string" || !src.startsWith(`Compendium.${M}.`)) return null;
    const [, , pack, , id] = src.split(".");
    const s = (sources[pack] ?? []).find(x => x._id === id);
    return s ? { pack, s } : { pack, s: null };
  };
  // Dossier d'un type, retrouvé par son drapeau (ou son nom, pour les dossiers d'avant les drapeaux d'aventure), sinon créé.
  const dossier = (type, nom, aventure) => {
    const f = sortie.folders.find(x => x.type === type && (x.flags?.[M]?.aventure === nom || x.flags?.[M]?.dossier === nom
      || (x.name === nom && x.flags?.[M]?.dossier)));
    if (f) return f._id;
    const id = idStable(`${monde.id}.dossier.${type}.${nom}`);
    const drapeaux = inst.dossiers?.drapeau === "booleen" ? { dossier: true, ...(aventure ? { aventure: nom } : {}) } : { dossier: nom };
    sortie.folders.push({ name: nom, type, folder: null, sorting: "a", sort: 0, color: inst.dossiers?.couleur ?? null, description: "",
      flags: { [M]: drapeaux }, _id: id, _stats: stats(null), _key: `!folders!${id}` });
    rapport.push(`dossier ajouté : ${nom} (${type})`);
    return id;
  };
  // Un document du monde refait depuis sa source : tout vient du compendium, sauf l'identifiant, le dossier, le rang et les _stats
  // du document existant (compendiumSource pointant la source).
  const depuisSource = (coll, pack, s, existant, { folder = null } = {}) => {
    const id = existant?._id ?? (libre(coll, s._id) ? s._id : idStable(`${monde.id}.${coll}.${s._id}`));
    const doc = recrireCles(structuredClone(s), s._id, id);
    doc._id = id;
    doc._key = `!${coll}!${id}`;
    doc.folder = existant ? (existant.folder ?? null) : folder;
    doc.sort = existant?.sort ?? 0;
    doc._stats = { ...(existant?._stats ?? stats(null)), compendiumSource: uuid(pack, s), lastModifiedBy: null };
    return doc;
  };
  const remplacer = (coll, existant, doc) => {
    if (existant) sortie[coll][sortie[coll].indexOf(existant)] = doc;
    else sortie[coll].push(doc);
  };
  const changeDe = (avant, apres) => {
    if (!avant) return "ajouté";
    const sans = d => JSON.stringify({ ...d, _stats: undefined });
    return sans(avant) === sans(apres) ? null : "mis à jour";
  };

  // 1. Journaux des packs installés.
  const journaux = new Map(); // identifiant au compendium -> identifiant dans le monde
  for (const pack of inst.journaux?.packs ?? []) for (const s of sources[pack] ?? []) {
    const existant = trouver("journal", pack, s);
    const folder = !existant && inst.journaux.dossier ? dossier("JournalEntry", inst.journaux.dossier) : null;
    const doc = depuisSource("journal", pack, s, existant, { folder });
    doc.flags = { ...(doc.flags ?? {}), [M]: { ...(s.flags?.[M] ?? {}), version: versionContenu } };
    const change = changeDe(existant, doc);
    if (change) rapport.push(`journal ${change} : ${doc.name}`);
    remplacer("journal", existant, doc);
    journaux.set(s._id, doc._id);
  }

  // 2. Tables installées (40k : drapeau « installer », désignées par un réglage du système).
  if (inst.tables) {
    const designees = { ...(valeurReglage(inst.tables.reglage) ?? {}) };
    for (const s of sources.tables ?? []) {
      const cle = s.flags?.[M]?.installer;
      if (!cle) continue;
      const existant = trouver("tables", "tables", s);
      const doc = depuisSource("tables", "tables", s, existant, { folder: existant ? null : dossier("RollTable", inst.tables.dossier) });
      const change = changeDe(existant, doc);
      if (change) rapport.push(`table ${change} : ${doc.name}`);
      remplacer("tables", existant, doc);
      designees[cle] = doc._id;
    }
    if (inst.tables.reglage) poserReglage(inst.tables.reglage, designees, "tables désignées au système");
  }

  // 3. Scènes installées : notes raccordées aux journaux du monde, sons, zones et épingles marqués (carte vivante), dessins au
  // Gamemaster, plan et style visuel ; hors de la navigation (fromCompendium de Foundry) ; une seule active (conf.active).
  const conf = inst.scenes ?? {};
  const installee = s => { const cle = cleDe(s) ?? ""; return conf.seulement ? conf.seulement.includes(cle) : !conf.exclure?.test(cle); };
  const scenesInstallees = new Set();
  for (const s of (sources.scenes ?? []).filter(installee)) {
    const existant = trouver("scenes", "scenes", s);
    const nomDossier = conf.parAventure ? (s.flags?.[M]?.aventure ?? conf.parAventure) : conf.dossier;
    const folder = existant ? null : (nomDossier ? dossier("Scene", nomDossier, Boolean(conf.parAventure)) : null);
    const doc = depuisSource("scenes", "scenes", s, existant, { folder });
    doc.active = Boolean(conf.active) && cleDe(s) === conf.active;
    doc.navigation = false;
    delete doc.navOrder;
    for (const d of doc.drawings ?? []) d.author = GAMEMASTER_ID;
    for (const n of doc.notes ?? []) if (journaux.has(n.entryId)) n.entryId = journaux.get(n.entryId);
    if (conf.vivante) for (const champ of ["sounds", "regions", "notes"]) for (const e of doc[champ] ?? []) e.flags = { ...(e.flags ?? {}), [M]: { ...(e.flags?.[M] ?? {}), carte: true } };
    doc.flags = { ...(doc.flags ?? {}), [M]: { ...(doc.flags?.[M] ?? {}) } };
    if (conf.version) doc.flags[M].version = versionContenu;
    if (inst.plans && plans[cleDe(s)]) doc.flags[M].plan = plans[cleDe(s)];
    for (const n of doc.levels ?? []) if (n.background?.src) n.background.src = cheminSelonStyle(n.background.src, style, M);
    for (const t of doc.tokens ?? []) if (t.texture?.src) t.texture.src = cheminSelonStyle(t.texture.src, style, M);
    const change = changeDe(existant, doc);
    if (change) rapport.push(`scène ${change} : ${doc.name}`);
    remplacer("scenes", existant, doc);
    scenesInstallees.add(doc._id);
  }

  // 4. Documents venus de notre compendium : rafraîchis s'ils y sont encore, retirés sinon ; une scène que l'installation ne pose
  // pas (lieu importé en jeu par le MJ IA) est retirée.
  for (const coll of ["journal", "scenes", "tables", "actors", "items", "macros", "playlists"]) {
    for (const d of [...sortie[coll]]) {
      const origine = sourceDe(d);
      if (!origine) continue;
      if (!origine.s) { sortie[coll].splice(sortie[coll].indexOf(d), 1); rapport.push(`${coll} retiré : ${d.name} (absent de ${M}/${origine.pack})`); continue; }
      if (coll === "scenes" && !scenesInstallees.has(d._id)) { sortie[coll].splice(sortie[coll].indexOf(d), 1); rapport.push(`scène retirée : ${d.name} (l'installation ne la pose pas)`); continue; }
      if (["journal", "scenes"].includes(coll) || (coll === "tables" && inst.tables && origine.s.flags?.[M]?.installer)) continue;
      const doc = depuisSource(coll, origine.pack, origine.s, d);
      if (coll === "actors") doc.ownership = { default: 0 };
      const change = changeDe(d, doc);
      if (change) rapport.push(`${coll} ${change} : ${doc.name}`);
      remplacer(coll, d, doc);
    }
  }

  // 5. Réglages : contenu installé à sa version, réglages posés par l'installation.
  poserReglage(`${M}.installe`, versionContenu, "contenu installé à la version du module");
  for (const [cle, valeur] of Object.entries(inst.reglages ?? {})) poserReglage(cle, valeur, "posé par l'installation du module");

  // 6. Guides du MJ IA, en français (le monde anglais les réécrit en anglais à la construction).
  if (guide && versHTML) for (const { cle } of GUIDES_DU_MOTEUR) {
    const existant = sortie.journal.find(j => j.flags?.[MOTEUR]?.guide === cle);
    const base = existant ?? { _id: idStable(`${monde.id}.guide.${cle}`), folder: null, sort: 0, flags: {}, _stats: stats(null) };
    const doc = journalDuGuide(base, cle, { langue: "fr", guide, versHTML });
    const change = changeDe(existant, doc);
    if (change) rapport.push(`guide du MJ IA ${change} : ${doc.name} (version ${guide.VERSION_GUIDE})`);
    remplacer("journal", existant, doc);
  }

  // Dossiers restés vides (contenu retiré) : retirés, comme au tri.
  let vides = true;
  while (vides) {
    vides = false;
    for (const f of [...sortie.folders]) {
      if (f.type === "Compendium") continue;
      const plein = Object.values(sortie).flat().some(d => d !== f && d.folder === f._id);
      if (!plein) { sortie.folders.splice(sortie.folders.indexOf(f), 1); rapport.push(`dossier retiré : ${f.name} (vide)`); vides = true; }
    }
  }
  return { docs: sortie, rapport };
}

// VERSION_CONTENU du module de contenu (scripts/main.js), sinon la version de son manifeste.
export function versionDuContenu(racine, moduleContenu) {
  const main = join(racine, "modules", moduleContenu, "scripts", "main.js");
  const m = existsSync(main) ? /const\s+VERSION_CONTENU\s*=\s*["']([^"']+)["']/.exec(readFileSync(main, "utf8")) : null;
  return m?.[1] ?? lireJson(join(racine, "modules", moduleContenu, "module.json")).version;
}

// Les sources des compendiums du module de contenu : { sources: { pack: docs }, typesPacks: { pack: type } }.
function sourcesDuModule(racine, moduleContenu) {
  const man = lireJson(join(racine, "modules", moduleContenu, "module.json"));
  const sources = {}, typesPacks = {};
  for (const p of man.packs ?? []) { sources[p.name] = lireDossierJson(join(racine, "modules", moduleContenu, "src", p.name)); typesPacks[p.name] = p.type; }
  return { sources, typesPacks };
}

// Le guide du MJ IA (scripts/guide.js du moteur, à côté de cet outil) et sa mise en HTML (scripts/utilitaires.js, qui lit
// foundry.utils.escapeHTML : hors Foundry, son repli).
export async function guideDuMoteur() {
  const guide = await import(new URL("../scripts/guide.js", import.meta.url).href);
  const { versHTML } = await import(new URL("../scripts/utilitaires.js", import.meta.url).href);
  const enHTML = texte => {
    const avait = "foundry" in globalThis;
    if (!avait) globalThis.foundry = { utils: {} };
    try { return versHTML(texte); } finally { if (!avait) delete globalThis.foundry; }
  };
  return { guide, versHTML: enHTML };
}

// Le manifeste du monde aligné sur le contenu : version du module de contenu, versions minimales du module et du moteur.
export function manifesteAJour(manifeste, ctx) {
  const requires = (manifeste.relationships?.requires ?? []).map(r => {
    if (r.id === ctx.moduleContenu) return { ...r, compatibility: { ...(r.compatibility ?? {}), minimum: ctx.manifeste.version } };
    if (r.id === MOTEUR && ctx.moteur?.version) return { ...r, compatibility: { ...(r.compatibility ?? {}), minimum: ctx.moteur.version } };
    return r;
  });
  return { ...manifeste, version: ctx.manifeste.version, relationships: { ...manifeste.relationships, requires } };
}

// ---------------------------------------------------------------- Modes

function afficherInventaire(resultat, docs, ctx) {
  const parColl = new Map();
  for (const v of resultat.verdicts) { if (!parColl.has(v.collection)) parColl.set(v.collection, []); parColl.get(v.collection).push(v); }
  console.log(`Monde ${ctx.monde.id} (module ${ctx.moduleContenu}, système ${ctx.monde.systeme})`);
  let totalGarde = 0, totalRetire = 0;
  for (const coll of [...COLLECTIONS, ...[...parColl.keys()].filter(c => !COLLECTIONS.includes(c))]) {
    const vs = parColl.get(coll) ?? [];
    const g = vs.filter(v => v.garde).length, r = vs.length - g;
    totalGarde += g; totalRetire += r;
    console.log(`\n== ${coll} : ${g} gardé(s), ${r} retiré(s)${coll === "folders" ? ` ; dossiers : ${[...new Set((docs.folders ?? []).map(f => `${f.name} [${f.type}]`))].join(", ") || "aucun"}` : ""}`);
    for (const v of vs.sort((a, b) => Number(b.garde) - Number(a.garde) || String(a.nom).localeCompare(String(b.nom), "fr"))) {
      console.log(`  ${v.garde ? "✓" : "✗"} ${v.nom}${v.type ? ` (${v.type})` : ""} — ${v.raison}`);
    }
  }
  console.log(`\nTotal : ${totalGarde} gardé(s), ${totalRetire} retiré(s). Effacés sur les documents gardés : ${JSON.stringify(resultat.effaces)}.`);
}

export async function inventaire(ctx, dossierMondeServeur) {
  const { docs, autres } = await deballer(ctx.racine, dossierMondeServeur);
  for (const a of autres) docs[a] = [{ _id: a, name: `(dossier data/${a})` }];
  const resultat = trier(docs, ctx);
  afficherInventaire(resultat, docs, ctx);
  return resultat;
}

// Écrit les sources versionnées monde/src/<collection>/*.json (l'ancien contenu est effacé) ; rend le nombre de documents.
function ecrireSources(ctx, gardes) {
  rmSync(ctx.src, { recursive: true, force: true });
  let n = 0;
  for (const coll of COLLECTIONS) {
    mkdirSync(join(ctx.src, coll), { recursive: true });
    for (const d of gardes[coll] ?? []) {
      const nom = coll === "settings" ? d.key : coll === "users" ? slug(d.name) : `${slug(d.name)}_${d._id}`;
      ecrireJson(join(ctx.src, coll, `${nom}.json`), d);
      n++;
    }
  }
  return n;
}

// --rafraichir : relit monde/src, réapplique le tri, remet le contenu au niveau des modules (rafraichirMonde), réécrit monde/src et
// aligne monde/world.json (version, versions minimales du module et du moteur), puis vérifie. Sans monde du serveur.
export async function rafraichir(ctx) {
  const docs = Object.fromEntries(COLLECTIONS.map(c => [c, lireDossierJson(join(ctx.src, c))]));
  const tri = trier(docs, ctx);
  for (const v of tri.verdicts.filter(v => !v.garde && v.collection !== "users")) console.log(`retiré par le tri : ${v.collection} ${v.nom} — ${v.raison}`);
  const { sources, typesPacks } = sourcesDuModule(ctx.racine, ctx.moduleContenu);
  const versionContenu = versionDuContenu(ctx.racine, ctx.moduleContenu);
  const fichierPlans = join(ctx.racine, "modules", ctx.moduleContenu, "assets", "cartes", "plans.json");
  const plans = existsSync(fichierPlans) ? lireJson(fichierPlans) : {};
  const { guide, versHTML } = await guideDuMoteur();
  const fichierManifeste = join(ctx.dossierMonde, "world.json");
  const manifeste = lireJson(fichierManifeste);
  const { docs: frais, rapport } = rafraichirMonde(tri.gardes, { moduleContenu: ctx.moduleContenu, sources, typesPacks, versionContenu, plans,
    guide, versHTML, coreVersion: manifeste.coreVersion, systemVersion: manifeste.systemVersion });
  for (const l of rapport) console.log(l);
  const n = ecrireSources(ctx, frais);
  const aJour = manifesteAJour(manifeste, ctx);
  if (JSON.stringify(aJour) !== JSON.stringify(manifeste)) { ecrireJson(fichierManifeste, aJour); console.log(`${relative(ctx.racine, fichierManifeste)} : version ${aJour.version}, versions minimales du module et du moteur alignées`); }
  console.log(`\n${n} documents écrits dans ${relative(ctx.racine, ctx.src)} (contenu ${ctx.moduleContenu} ${versionContenu}, guide du MJ IA ${guide.VERSION_GUIDE})`);
  return verifier(ctx, { source: "src" });
}

export async function extraire(ctx, dossierMondeServeur, { version } = {}) {
  const { docs, autres, world } = await deballer(ctx.racine, dossierMondeServeur);
  for (const a of autres) docs[a] = [{ _id: a, name: `(dossier data/${a})` }];
  const resultat = trier(docs, ctx);
  afficherInventaire(resultat, docs, ctx);
  const n = ecrireSources(ctx, resultat.gardes);
  const manifeste = manifesteDuMonde(ctx, world, version ?? ctx.manifeste.version);
  ecrireJson(join(ctx.dossierMonde, "world.json"), manifeste);
  console.log(`\n${n} documents écrits dans ${relative(ctx.racine, ctx.src)}, manifeste ${relative(ctx.racine, join(ctx.dossierMonde, "world.json"))}`);
  // Garde-fou immédiat : les identifiants et noms des utilisateurs du serveur ne doivent apparaître nulle part.
  const rapport = await verifier(ctx, { interdits: resultat.utilisateurs, source: "src" });
  return { resultat, rapport };
}

// Licences du dépôt du monde, posées à la racine du monde vierge et donc de son archive (world.json déclare
// « license »: "LICENSE") : LICENSE (MIT, le code) et LICENCE-CONTENU.md (CC BY-NC-SA 4.0, les textes et les images).
// Rend la liste des fichiers absents de la racine du dépôt (l'archive part alors sans eux, avec un avertissement).
export const LICENCES_DU_MONDE = ["LICENSE", "LICENCE-CONTENU.md"];
export function copierLicences(racine, sortie) {
  const absents = [];
  for (const f of LICENCES_DU_MONDE) {
    if (existsSync(join(racine, f))) cpSync(join(racine, f), join(sortie, f));
    else absents.push(f);
  }
  return absents;
}

// Archive zip « deflate » sans dépendance : entrées en chemins POSIX, à la racine.
function ecrireZip(dossier, cheminZip) {
  const fichiers = [];
  const marcher = d => { for (const e of readdirSync(d).sort()) { const p = join(d, e); if (statSync(p).isDirectory()) marcher(p); else fichiers.push(p); } };
  marcher(dossier);
  const locaux = [], centraux = [];
  let decalage = 0;
  const date = new Date(2026, 0, 1, 12, 0, 0);
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  for (const f of fichiers) {
    const nom = Buffer.from(posix.join(...relative(dossier, f).split(/[\\/]/)), "utf8");
    const brut = readFileSync(f);
    const comp = deflateRawSync(brut, { level: 9 });
    const crc = crc32(brut);
    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0); entete.writeUInt16LE(20, 4); entete.writeUInt16LE(0x0800, 6); entete.writeUInt16LE(8, 8);
    entete.writeUInt16LE(dosTime, 10); entete.writeUInt16LE(dosDate, 12); entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(comp.length, 18); entete.writeUInt32LE(brut.length, 22); entete.writeUInt16LE(nom.length, 26); entete.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(brut.length, 24); central.writeUInt16LE(nom.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(decalage, 42);
    locaux.push(entete, nom, comp);
    centraux.push(central, nom);
    decalage += entete.length + nom.length + comp.length;
  }
  const tailleCentral = centraux.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(0, 4); fin.writeUInt16LE(0, 6); fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10); fin.writeUInt32LE(tailleCentral, 12); fin.writeUInt32LE(decalage, 16); fin.writeUInt16LE(0, 20);
  writeFileSync(cheminZip, Buffer.concat([...locaux, ...centraux, fin]));
  return fichiers.length;
}

export async function construire(ctx, { version } = {}) {
  const manifeste = manifesteCible(ctx, version);
  const { compilePack } = await cliFoundry(ctx.racine);
  const sortie = join(ctx.dist, manifeste.id);
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(join(sortie, "data"), { recursive: true });
  // Monde anglais : les sources traduites sont écrites dans un dossier temporaire, puis compilées comme les françaises.
  let source = ctx.src, temporaire = null, rapport = null;
  if (ctx.anglais) {
    const docs = Object.fromEntries(COLLECTIONS.map(c => [c, lireDossierJson(join(ctx.src, c))]));
    const { dictionnaire } = dictionnairesDuModule(ctx.racine, ctx.moduleContenu);
    const traduction = traduireMonde(docs, { moduleContenu: ctx.moduleContenu, dictionnaire });
    rapport = traduction.rapport;
    if (rapport.erreurs.length) throw new Error(`${rapport.erreurs.length} traduction(s) en écart de balises ou de liens : ${rapport.erreurs.map(e => `${e.cle}:${e.chemin}`).join(", ")}`);
    // Guides du MJ IA : sans dictionnaire, réécrits en anglais depuis scripts/guide-en.js (le moteur ne les réécrira pas au
    // premier chargement : version et langue sont à jour).
    const { guide, versHTML } = await guideDuMoteur();
    traduction.docs.journal = traduction.docs.journal.map(j => (GUIDES_DU_MOTEUR.some(g => g.cle === j.flags?.[MOTEUR]?.guide) ? journalDuGuide(j, j.flags[MOTEUR].guide, { langue: "en", guide, versHTML }) : j));
    temporaire = mkdtempSync(join(tmpdir(), "monde-anglais-"));
    for (const coll of COLLECTIONS) for (const d of traduction.docs[coll]) ecrireJson(join(temporaire, coll, `${d._id}.json`), d);
    source = temporaire;
  }
  let n = 0;
  for (const coll of COLLECTIONS) {
    const src = join(source, coll);
    mkdirSync(src, { recursive: true }); // une collection vide reste une base LevelDB (vide)
    await compilePack(src, join(sortie, "data", coll), { log: false, nedb: false, yaml: false });
    n += lireDossierJson(src).length;
  }
  if (temporaire) rmSync(temporaire, { recursive: true, force: true });
  ecrireJson(join(sortie, "world.json"), manifeste);
  for (const f of copierLicences(ctx.racine, sortie)) console.warn(`avertissement : ${f} absent de la racine du dépôt : l'archive du monde part sans`);
  ecrireJson(join(ctx.dist, ctx.fichierManifeste), manifeste);
  const zip = join(ctx.dist, `${manifeste.id}.zip`);
  const fichiers = ecrireZip(sortie, zip);
  if (rapport) {
    console.log(resumerRapport(rapport));
    for (const o of rapport.obsoletes) console.warn(`avertissement : traduction obsolète (le français du monde diffère de celui du dictionnaire) : ${o}`);
    console.log(`${rapport.traduits + rapport.parMemoire} texte(s) traduits (${rapport.parMemoire} par mémoire), ${rapport.manquants.length} resté(s) en français`);
  }
  console.log(`${manifeste.id} ${manifeste.version} : ${n} documents compilés dans ${relative(ctx.racine, sortie)}, ${fichiers} fichiers dans ${relative(ctx.racine, zip)}`);
  return { sortie, zip, n, rapport };
}

// Relit le paquet (LevelDB de monde/dist/<id>/data déballée dans un dossier temporaire, sinon monde/src) et contrôle.
export async function verifier(ctx, { interdits = { ids: [], noms: [] }, source } = {}) {
  const { monde, racine, scopes, moduleCible, idMonde, anglais } = ctx;
  const moduleContenu = moduleCible;
  const erreurs = [], avertissements = [];
  const manifestePath = join(ctx.dossierMonde, "world.json");
  let docs = {}, origine;
  const distData = join(ctx.dist, idMonde, "data");
  if (anglais && (source === "src" || !existsSync(distData))) throw new Error(`${relative(racine, distData)} absent : lancer d'abord --construire --langue en`);
  if (source !== "src" && existsSync(distData)) {
    const { extractPack } = await cliFoundry(racine);
    const temp = mkdtempSync(join(tmpdir(), "verifier-monde-"));
    for (const coll of COLLECTIONS) {
      docs[coll] = [];
      if (!existsSync(join(distData, coll))) { erreurs.push(`collection ${coll} absente de ${relative(racine, distData)}`); continue; }
      const sortie = join(temp, coll);
      mkdirSync(sortie, { recursive: true });
      await extractPack(join(distData, coll), sortie, { log: false, nedb: false, yaml: false });
      docs[coll] = lireDossierJson(sortie);
    }
    rmSync(temp, { recursive: true, force: true });
    origine = relative(racine, distData);
  } else {
    for (const coll of COLLECTIONS) docs[coll] = lireDossierJson(join(ctx.src, coll));
    origine = relative(racine, ctx.src);
  }

  // Manifeste : monde/world.json, ou le manifeste anglais engendré avec monde/world.en.json (celui écrit dans dist/world-en.json).
  if (!existsSync(manifestePath)) erreurs.push("monde/world.json absent");
  else {
    let m = null;
    try { m = manifesteCible(ctx); } catch (e) { erreurs.push(e.message); }
    if (m) {
      const nomManifeste = anglais ? "world-en.json" : "world.json";
      for (const champ of ["id", "title", "description", "version", "system", "systemVersion", "coreVersion", "compatibility", "background", "manifest", "download", "url", "readme", "license", "bugs", "relationships"]) if (m[champ] == null) erreurs.push(`${nomManifeste} : champ ${champ} absent`);
      if (m.id !== idMonde) erreurs.push(`${nomManifeste} : id ${m.id} au lieu de ${idMonde}`);
      if ("nextSession" in m || "lastPlayed" in m || "playtime" in m) erreurs.push(`${nomManifeste} : nextSession, lastPlayed ou playtime présent`);
      if (m.background && !existsSync(join(racine, m.background))) avertissements.push(`${nomManifeste} : fond ${m.background} introuvable dans le dépôt`);
      for (const f of fuites(m, { idsInterdits: interdits.ids, nomsInterdits: interdits.noms })) erreurs.push(`${nomManifeste} ${f.chemin} : ${f.motif}`);
      if (anglais) {
        const requis = m.relationships?.requires ?? [];
        if (!requis.some(r => r.id === moduleCible && /\/releases\/latest\/download\/[\w-]+-en\.json$/.test(r.manifest ?? ""))) erreurs.push(`${nomManifeste} : le module ${moduleCible} (manifeste ${moduleCible}.json) n'est pas requis`);
        if (requis.some(r => r.id === ctx.moduleContenu)) erreurs.push(`${nomManifeste} : le module français ${ctx.moduleContenu} est encore requis`);
        if (!/-en\.zip$/.test(m.download) || !/world-en\.json$/.test(m.manifest)) erreurs.push(`${nomManifeste} : download ou manifest ne sont pas ceux du monde anglais`);
        const ecrit = join(ctx.dist, "world-en.json");
        if (!existsSync(ecrit) || JSON.stringify(lireJson(ecrit)) !== JSON.stringify(m)) erreurs.push("monde/dist/world-en.json absent ou différent du manifeste engendré (relancer --construire --langue en)");
      }
    }
  }
  // Monde anglais : plus aucune trace du module français (uuid, chemins, drapeaux, réglages), et core.moduleConfiguration active
  // le module anglais à sa place.
  if (anglais) {
    const fr = ctx.moduleContenu;
    for (const coll of COLLECTIONS) for (const d of docs[coll]) {
      const nom = d.name ?? d.key ?? d._id;
      chaines(d, (chemin, s) => {
        if (s.includes(`Compendium.${fr}.`) || s.includes(`modules/${fr}/`) || (coll === "settings" && (s.includes(`"${fr}.`) || s.includes(`"${fr}"`)))) erreurs.push(`${coll} ${nom} (${chemin}) : trace du module français ${fr}`);
      });
      if (d.flags && typeof d.flags === "object" && fr in d.flags) erreurs.push(`${coll} ${nom} : drapeaux sous la portée du module français ${fr}`);
      if (coll === "settings" && d.key.startsWith(`${fr}.`)) erreurs.push(`settings ${d.key} : réglage du module français`);
    }
    const configuration = docs.settings.find(s => s.key === "core.moduleConfiguration");
    let actifs = {};
    try { actifs = JSON.parse(configuration?.value ?? "{}"); } catch { actifs = {}; }
    if (actifs[moduleCible] !== true) erreurs.push(`settings core.moduleConfiguration : ${moduleCible} n'est pas activé`);
    if (fr in actifs) erreurs.push(`settings core.moduleConfiguration : ${fr} encore présent`);
    for (const m of MODULES_FRANCAIS) if (actifs[m]) erreurs.push(`settings core.moduleConfiguration : ${m} (traduction française) activé dans le monde anglais`);
  }

  // Structure, interdits, secrets.
  const ids = new Map(); // "Type.id" -> doc
  const verifierId = (d, coll, chemin) => {
    if (!estId(d._id)) erreurs.push(`${coll} ${chemin} : _id manquant ou invalide`);
  };
  for (const coll of COLLECTIONS) for (const d of docs[coll]) {
    const nom = d.name ?? d.key ?? d._id;
    verifierId(d, coll, nom);
    if (d._key !== `!${coll}!${d._id}`) erreurs.push(`${coll} ${nom} : _key « ${d._key} » attendu « !${coll}!${d._id} »`);
    ids.set(`${TYPE_PAR_COLLECTION[coll]}.${d._id}`, d);
    // Documents imbriqués : _id présent.
    for (const [k, v] of Object.entries(d)) if (Array.isArray(v) && v.length && v.every(x => x && typeof x === "object" && "_id" in x)) for (const e of v) {
      if (!estId(e._id)) erreurs.push(`${coll} ${nom} : ${k} contient un document sans _id valide`);
      ids.set(`${TYPE_PAR_COLLECTION[coll]}.${d._id}.${k}.${e._id}`, e);
    }
    for (const f of fuites(d, { idsInterdits: interdits.ids, nomsInterdits: interdits.noms })) erreurs.push(`${coll} ${nom} (${f.chemin}) : ${f.motif}`);
    chaines(d, (chemin, s) => { if (/^worlds\//.test(s)) avertissements.push(`${coll} ${nom} (${chemin}) : chemin dans worlds/ (ne suivra pas le monde)`); });
  }
  for (const coll of ["messages", "combats", "fog", "cards"]) if (docs[coll].length) erreurs.push(`${coll} : ${docs[coll].length} document(s) alors que la collection doit être vide`);
  if (docs.users.length !== 1) erreurs.push(`users : ${docs.users.length} utilisateur(s) au lieu du seul Gamemaster`);
  for (const u of docs.users) {
    if (u.role !== 4 || u.name !== GAMEMASTER_NOM) erreurs.push("users : un utilisateur autre que le Gamemaster créé");
    if (u.password || u.passwordSalt) erreurs.push("users : le Gamemaster porte un mot de passe");
  }
  for (const a of docs.actors) {
    if (monde.typesJoueur.includes(a.type)) erreurs.push(`actors ${a._id} : acteur de type joueur (${a.type})`);
    if (Object.keys(a.ownership ?? {}).some(k => k !== "default")) erreurs.push(`actors ${a._id} : propriétaire nommé`);
  }
  for (const d of [...docs.journal, ...docs.scenes, ...docs.tables, ...docs.playlists, ...docs.items, ...docs.macros]) {
    if (Object.keys(d.ownership ?? {}).some(k => k !== "default")) erreurs.push(`${d.name} : propriétaire nommé dans ownership`);
    if (d._stats?.lastModifiedBy) erreurs.push(`${d.name} : _stats.lastModifiedBy renseigné`);
  }
  const actifs = modulesActifs(docs.settings);
  for (const s of docs.settings) {
    const v = trierReglage(s.key, s.value, { moduleContenu, systeme: monde.systeme, actifs });
    if (!v.garde) erreurs.push(`settings ${s.key} : réglage interdit (${v.raison})`);
    if (s.user) erreurs.push(`settings ${s.key} : lié à un utilisateur`);
  }
  for (const s of docs.scenes) for (const t of s.tokens ?? []) if (t.actorId && !ids.has(`Actor.${t.actorId}`)) erreurs.push(`scenes ${s.name} : jeton ${t.name} d'un acteur absent`);
  // Un dessin sans auteur est refusé par Foundry au chargement (les étiquettes des pièces, que lit le MJ IA, disparaîtraient).
  for (const s of docs.scenes) for (const d of s.drawings ?? []) if (!estId(d.author)) erreurs.push(`scenes ${s.name} : dessin ${d._id} sans auteur valide`);

  // Contenu en retard sur les modules (sources extraites d'un monde plus ancien) : signalé, à corriger par --rafraichir.
  const versionContenu = versionDuContenu(racine, ctx.moduleContenu);
  const installe = docs.settings.find(s => s.key === `${moduleCible}.installe`);
  if (installe?.value !== JSON.stringify(versionContenu)) avertissements.push(`settings ${moduleCible}.installe : ${installe?.value ?? "absent"} au lieu de « ${versionContenu} » (contenu en retard : --rafraichir)`);
  for (const d of [...docs.journal, ...docs.scenes]) {
    const v = d.flags?.[moduleCible]?.version;
    if (v && v !== versionContenu) avertissements.push(`${d.name} : contenu de la version ${v} au lieu de ${versionContenu} (--rafraichir)`);
  }
  try {
    const { guide } = await guideDuMoteur();
    const langue = anglais ? "en" : "fr";
    for (const { cle } of GUIDES_DU_MOTEUR) {
      const g = docs.journal.find(j => j.flags?.[MOTEUR]?.guide === cle);
      const f = g?.flags?.[MOTEUR];
      if (!g) avertissements.push(`guide du MJ IA « ${cle} » absent (le moteur le créera au premier chargement)`);
      else if (!(f.versionGuide >= guide.VERSION_GUIDE) || (f.langueGuide ?? "fr") !== langue) avertissements.push(`${g.name} : guide du MJ IA en version ${f.versionGuide} (${f.langueGuide ?? "fr"}) au lieu de ${guide.VERSION_GUIDE} (${langue}) (--rafraichir)`);
    }
  } catch (e) { avertissements.push(`guide du MJ IA illisible (${e.message})`); }
  const actives = docs.scenes.filter(s => s.active);
  if (actives.length > 1) erreurs.push(`scenes : ${actives.length} scènes actives`);

  // Liens : @UUID et uuid nus, vers le monde ou vers nos compendiums (modules/<id>/src/<pack>/*.json).
  const compendiums = new Map(); // "module.pack" -> Set(ids)
  const typesPacks = new Map();
  for (const m of readdirSync(join(racine, "modules")).filter(m => existsSync(join(racine, "modules", m, "module.json")))) {
    const man = lireJson(join(racine, "modules", m, "module.json"));
    for (const p of man.packs ?? []) {
      typesPacks.set(`${m}.${p.name}`, p.type);
      const dossier = join(racine, "modules", m, "src", p.name);
      compendiums.set(`${m}.${p.name}`, new Set(lireDossierJson(dossier).map(d => d._id)));
    }
  }
  const liens = new Map();
  const motifUuid = /(?:Compendium\.[\w-]+\.[\w-]+\.[A-Za-z]+\.[A-Za-z0-9]{16}|(?:JournalEntry|Actor|Scene|RollTable|Playlist|Macro|Item|Folder|Cards)\.[A-Za-z0-9]{16})(?:\.[A-Za-z]+\.[A-Za-z0-9]{16})*/g;
  for (const coll of COLLECTIONS) for (const d of docs[coll]) chaines(d, (chemin, s) => {
    for (const m of s.matchAll(motifUuid)) { const u = m[0]; if (!liens.has(u)) liens.set(u, `${coll} ${d.name ?? d.key} (${chemin})`); }
  });
  let liensVerifies = 0, liensNonVerifiables = 0;
  for (const [uuid, ou] of liens) {
    const parts = uuid.split(".");
    if (parts[0] === "Compendium") {
      const pack = `${parts[1]}.${parts[2]}`;
      if (!compendiums.has(pack)) { if (scopes.has(parts[1])) avertissements.push(`lien ${uuid} (${ou}) : compendium ${pack} inconnu de nos modules`); else liensNonVerifiables++; continue; }
      liensVerifies++;
      if (!compendiums.get(pack).has(parts[4])) avertissements.push(`lien cassé ${uuid} (${ou}) : absent de modules/${parts[1]}/src/${parts[2]}`);
      // Pages ou documents imbriqués d'un compendium : non vérifiés plus loin que le document.
    } else {
      liensVerifies++;
      const cle = parts.length > 2 ? `${parts[0]}.${parts[1]}.${{ JournalEntryPage: "pages", Item: "items", ActiveEffect: "effects", TableResult: "results", PlaylistSound: "sounds", Token: "tokens", Note: "notes", Region: "regions" }[parts[2]] ?? parts[2]}.${parts[3]}` : uuid;
      if (!ids.has(cle)) avertissements.push(`lien cassé ${uuid} (${ou}) : absent du monde`);
    }
  }
  // Chemins de fichiers vers nos modules et notre système : présents dans le dépôt ?
  const cheminsVus = new Set();
  for (const coll of COLLECTIONS) for (const d of docs[coll]) chaines(d, (chemin, s) => {
    const m = /^(modules|systems)\/([\w-]+)\/(.+)$/.exec(s);
    if (!m || !scopes.has(m[2]) || cheminsVus.has(s)) return;
    cheminsVus.add(s);
    if (!existsSync(join(racine, m[1], m[2], m[3]))) avertissements.push(`fichier ${s} (${coll} ${d.name ?? d.key}) introuvable dans le dépôt`);
  });

  const total = COLLECTIONS.reduce((n, c) => n + docs[c].length, 0);
  console.log(`\nVérification de ${origine} : ${total} documents, ${liensVerifies} liens vérifiés (${liensNonVerifiables} vers des compendiums tiers, non vérifiables), ${cheminsVus.size} chemins de fichiers contrôlés`);
  for (const a of avertissements) console.log(`  avertissement : ${a}`);
  for (const e of erreurs) console.log(`  ERREUR : ${e}`);
  console.log(erreurs.length ? `ÉCHEC : ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s)` : `OK : aucune erreur, ${avertissements.length} avertissement(s)`);
  return { erreurs, avertissements, total };
}

// ---------------------------------------------------------------- Ligne de commande

function lireArguments(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else o._.push(a);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = lireArguments(process.argv.slice(2));
  const version = typeof o.version === "string" ? o.version.replace(/^v/, "") : undefined;
  const source = s => { if (typeof s !== "string") throw new Error("indiquer le dossier du monde du serveur (Data/worlds/<id>)"); if (!existsSync(join(s, "world.json"))) throw new Error(`${s} : pas de world.json`); return resolve(s); };
  try {
    const ctx = contexteDuDepot(resolve(o.depot ?? process.cwd()), { langue: typeof o.langue === "string" ? o.langue : "fr" });
    if (ctx.anglais && (o.inventaire || o.extraire || o.rafraichir)) throw new Error("--langue en : seulement avec --construire, --verifier ou sans option (les sources monde/src sont celles du monde français)");
    if (o.inventaire) await inventaire(ctx, source(o.inventaire));
    else if (o.rafraichir) { const r = await rafraichir(ctx); process.exitCode = r.erreurs.length ? 1 : 0; }
    else if (o.extraire) { const { rapport } = await extraire(ctx, source(o.extraire), { version }); process.exitCode = rapport.erreurs.length ? 1 : 0; }
    else if (o.verifier) { const r = await verifier(ctx); process.exitCode = r.erreurs.length ? 1 : 0; }
    else { await construire(ctx, { version }); const r = await verifier(ctx); process.exitCode = r.erreurs.length ? 1 : 0; }
  } catch (e) {
    console.error(`erreur : ${e.message}`);
    process.exitCode = 2;
  }
}
