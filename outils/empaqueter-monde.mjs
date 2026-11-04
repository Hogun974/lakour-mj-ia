// Empaquette un MONDE VIERGE La Kour (Foundry VTT v14) à partir d'une copie du monde joué sur le serveur : le contenu
// de monde (scènes et journaux installés depuis nos compendiums, tables, listes de lecture, dossiers, réglages qui
// configurent le monde) est gardé ; tout ce qui est personnel ou de partie (utilisateurs, messages, personnages des
// joueurs, brouillard, combats, clés, coffres, mémoires, fils, horloges, chroniques…) est retiré. Outil COMMUN aux trois
// mondes, appelé depuis le sous-module : `npm run empaqueter-monde` dans lakour-w40k, lakour-warcraft, lakour-veillees.
//
// Modes (le dépôt du monde est le dossier courant, ou --depot <dossier>) :
//   --inventaire <Data/worlds/<id serveur>>  déballe la base LevelDB (dans un dossier temporaire) et AFFICHE le tri,
//                                           document par document et réglage par réglage, sans rien écrire ;
//   --extraire   <Data/worlds/<id serveur>>  même tri, puis écrit les sources versionnées monde/src/<collection>/*.json
//                                           et monde/world.json, et vérifie le résultat ;
//   --construire                            compile monde/src en LevelDB dans monde/dist/<id>/data, y pose world.json,
//                                           écrit l'archive monde/dist/<id>.zip et monde/dist/world.json (lus par
//                                           outils/empaqueter-module.mjs et le workflow de release) ;
//   --verifier                              relit le paquet produit (monde/dist/<id>, sinon monde/src) et ÉCHOUE s'il
//                                           reste un utilisateur autre que le Gamemaster créé, un message, un acteur
//                                           de type joueur, un réglage interdit ou une chaîne qui ressemble à un secret,
//                                           une IP privée, un chemin Hogun974 ou une adresse mail ; contrôle aussi la
//                                           structure (_id, _key) et signale les liens @UUID / chemins cassés ;
//   sans option                             --construire puis --verifier (ce que fait la release GitHub).
//   --version <x.y.z>                       version du monde (par défaut : celle du module de contenu, module.json).
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
//   tables, playlists   gardées si elles viennent de nos compendiums ou portent nos drapeaux (« Ambiances (MJ IA) ») ;
//   folders         gardés : dossiers de compendiums (core.compendiumConfiguration les cite) et dossiers portant nos
//                   drapeaux ; retirés : dossiers de Calendaria, « Essais Claude », et tout dossier resté vide ;
//   settings        par clé (REGLAGES ci-dessous) : réglages de conduite du MJ IA et règles de la veillée gardés sur
//                   liste blanche, tout le reste de lakour-mj-ia / lakour-loups retiré ; <module>.installe gardé ;
//                   core.rtcWorldSettings (serveur TURN, identifiants) retiré ; marqueurs « déjà vu », licences
//                   acceptées, états de Calendaria retirés ; les réglages des systèmes et des autres modules gardés.
// Sur tout document gardé : ownership ramené à son niveau « default » (plus d'entrée par utilisateur), _stats.lastModifiedBy
// et Setting.user mis à null, tout identifiant d'utilisateur du serveur effacé (Drawing.author, etc.).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

// ---------------------------------------------------------------- Les quatre mondes

export const MONDES = {
  "lakour-40k": {
    id: "la-kour-40k", depot: "lakour-w40k", systeme: "impmal", typesJoueur: ["character"],
    requis: [{ id: "warhammer-lib", type: "module" }]
  },
  "lakour-warcraft": { id: "la-kour-warcraft", depot: "lakour-warcraft", systeme: "dnd5e", typesJoueur: ["character"], requis: [] },
  "lakour-veillees": { id: "la-kour-veillees", depot: "lakour-veillees", systeme: "lakour-loups", typesJoueur: ["villageois"], requis: [] },
  "lakour-fenoir": { id: "la-kour-fenoir", depot: "lakour-fenoir", systeme: "lakour-survie", typesJoueur: ["survivant"], requis: [] }
};
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

// Verdict d'un réglage : { garde: bool, raison }.
export function trierReglage(cle, valeurJson, { moduleContenu, systeme }) {
  const [espace, ...reste] = cle.split(".");
  const nom = reste.join(".");
  if (espace === moduleContenu) return nom === "installe" ? { garde: true, raison: "marqueur d'installation du contenu (évite une réinstallation)" }
    : { garde: false, raison: "réglage du module de contenu hors « installe »" };
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
const lireJson = chemin => JSON.parse(readFileSync(chemin, "utf8"));
const ecrireJson = (chemin, v) => { mkdirSync(dirname(chemin), { recursive: true }); writeFileSync(chemin, `${JSON.stringify(v, null, 2)}\n`); };
const slug = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
const lireDossierJson = d => existsSync(d) ? readdirSync(d).filter(f => f.endsWith(".json")).sort().map(f => lireJson(join(d, f))) : [];

// Le CLI Foundry, résolu depuis le dépôt du monde (node_modules de lakour-w40k, lakour-warcraft, lakour-veillees).
async function cliFoundry(racine) {
  const require = createRequire(join(racine, "package.json"));
  return import(pathToFileURL(require.resolve("@foundryvtt/foundryvtt-cli")).href);
}

// Le dépôt du monde : module de contenu (modules/<id>/module.json dont l'id est dans MONDES), monde, chemins.
export function contexteDuDepot(racine) {
  const modules = existsSync(join(racine, "modules")) ? readdirSync(join(racine, "modules")) : [];
  const moduleContenu = modules.find(m => MONDES[m] && existsSync(join(racine, "modules", m, "module.json")));
  if (!moduleContenu) throw new Error(`aucun module de contenu connu (${Object.keys(MONDES).join(", ")}) dans ${join(racine, "modules")}`);
  const manifeste = lireJson(join(racine, "modules", moduleContenu, "module.json"));
  const monde = MONDES[moduleContenu];
  const moteur = existsSync(join(racine, "modules", MOTEUR, "module.json")) ? lireJson(join(racine, "modules", MOTEUR, "module.json")) : null;
  return { racine, moduleContenu, manifeste, moteur, monde, scopes: new Set([moduleContenu, MOTEUR, monde.systeme]),
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
  for (const d of parCle.values()) {
    const v = trierReglage(d.key, d.value, { moduleContenu, systeme: monde.systeme });
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

export async function extraire(ctx, dossierMondeServeur, { version } = {}) {
  const { docs, autres, world } = await deballer(ctx.racine, dossierMondeServeur);
  for (const a of autres) docs[a] = [{ _id: a, name: `(dossier data/${a})` }];
  const resultat = trier(docs, ctx);
  afficherInventaire(resultat, docs, ctx);
  rmSync(ctx.src, { recursive: true, force: true });
  let n = 0;
  for (const coll of COLLECTIONS) {
    mkdirSync(join(ctx.src, coll), { recursive: true });
    for (const d of resultat.gardes[coll]) {
      const nom = coll === "settings" ? d.key : coll === "users" ? slug(d.name) : `${slug(d.name)}_${d._id}`;
      ecrireJson(join(ctx.src, coll, `${nom}.json`), d);
      n++;
    }
  }
  const manifeste = manifesteDuMonde(ctx, world, version ?? ctx.manifeste.version);
  ecrireJson(join(ctx.dossierMonde, "world.json"), manifeste);
  console.log(`\n${n} documents écrits dans ${relative(ctx.racine, ctx.src)}, manifeste ${relative(ctx.racine, join(ctx.dossierMonde, "world.json"))}`);
  // Garde-fou immédiat : les identifiants et noms des utilisateurs du serveur ne doivent apparaître nulle part.
  const rapport = await verifier(ctx, { interdits: resultat.utilisateurs, source: "src" });
  return { resultat, rapport };
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
  if (!existsSync(join(ctx.dossierMonde, "world.json"))) throw new Error(`${relative(ctx.racine, join(ctx.dossierMonde, "world.json"))} absent : lancer d'abord --extraire <monde du serveur>`);
  const { compilePack } = await cliFoundry(ctx.racine);
  const manifeste = { ...lireJson(join(ctx.dossierMonde, "world.json")), version: version ?? ctx.manifeste.version };
  const sortie = join(ctx.dist, manifeste.id);
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(join(sortie, "data"), { recursive: true });
  let n = 0;
  for (const coll of COLLECTIONS) {
    const src = join(ctx.src, coll);
    mkdirSync(src, { recursive: true }); // une collection vide reste une base LevelDB (vide)
    await compilePack(src, join(sortie, "data", coll), { log: false, nedb: false, yaml: false });
    n += lireDossierJson(src).length;
  }
  ecrireJson(join(sortie, "world.json"), manifeste);
  ecrireJson(join(ctx.dist, "world.json"), manifeste);
  const zip = join(ctx.dist, `${manifeste.id}.zip`);
  const fichiers = ecrireZip(sortie, zip);
  console.log(`${manifeste.id} ${manifeste.version} : ${n} documents compilés dans ${relative(ctx.racine, sortie)}, ${fichiers} fichiers dans ${relative(ctx.racine, zip)}`);
  return { sortie, zip, n };
}

// Relit le paquet (LevelDB de monde/dist/<id>/data déballée dans un dossier temporaire, sinon monde/src) et contrôle.
export async function verifier(ctx, { interdits = { ids: [], noms: [] }, source } = {}) {
  const { monde, racine, scopes, moduleContenu } = ctx;
  const erreurs = [], avertissements = [];
  const manifestePath = join(ctx.dossierMonde, "world.json");
  let docs = {}, origine;
  const distData = join(ctx.dist, monde.id, "data");
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

  // Manifeste.
  if (!existsSync(manifestePath)) erreurs.push("monde/world.json absent");
  else {
    const m = lireJson(manifestePath);
    for (const champ of ["id", "title", "description", "version", "system", "systemVersion", "coreVersion", "compatibility", "background", "manifest", "download", "url", "readme", "license", "bugs", "relationships"]) if (m[champ] == null) erreurs.push(`world.json : champ ${champ} absent`);
    if (m.id !== monde.id) erreurs.push(`world.json : id ${m.id} au lieu de ${monde.id}`);
    if ("nextSession" in m || "lastPlayed" in m || "playtime" in m) erreurs.push("world.json : nextSession, lastPlayed ou playtime présent");
    if (m.background && !existsSync(join(racine, m.background))) avertissements.push(`world.json : fond ${m.background} introuvable dans le dépôt`);
    for (const f of fuites(m, { idsInterdits: interdits.ids, nomsInterdits: interdits.noms })) erreurs.push(`world.json ${f.chemin} : ${f.motif}`);
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
  for (const s of docs.settings) {
    const v = trierReglage(s.key, s.value, { moduleContenu, systeme: monde.systeme });
    if (!v.garde) erreurs.push(`settings ${s.key} : réglage interdit (${v.raison})`);
    if (s.user) erreurs.push(`settings ${s.key} : lié à un utilisateur`);
  }
  for (const s of docs.scenes) for (const t of s.tokens ?? []) if (t.actorId && !ids.has(`Actor.${t.actorId}`)) erreurs.push(`scenes ${s.name} : jeton ${t.name} d'un acteur absent`);
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
  const ctx = contexteDuDepot(resolve(o.depot ?? process.cwd()));
  const version = typeof o.version === "string" ? o.version.replace(/^v/, "") : undefined;
  const source = s => { if (typeof s !== "string") throw new Error("indiquer le dossier du monde du serveur (Data/worlds/<id>)"); if (!existsSync(join(s, "world.json"))) throw new Error(`${s} : pas de world.json`); return resolve(s); };
  try {
    if (o.inventaire) await inventaire(ctx, source(o.inventaire));
    else if (o.extraire) { const { rapport } = await extraire(ctx, source(o.extraire), { version }); process.exitCode = rapport.erreurs.length ? 1 : 0; }
    else if (o.verifier) { const r = await verifier(ctx); process.exitCode = r.erreurs.length ? 1 : 0; }
    else { await construire(ctx, { version }); const r = await verifier(ctx); process.exitCode = r.erreurs.length ? 1 : 0; }
  } catch (e) {
    console.error(`erreur : ${e.message}`);
    process.exitCode = 2;
  }
}
