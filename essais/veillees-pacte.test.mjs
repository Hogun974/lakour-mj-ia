// Le Pacte des Veillées (système lakour-loups, docs/plan-le-pacte.md du dépôt des Veillées, « À faire dans le moteur commun ») côté
// MJ IA, sur une doublure de l'API du système (game.lakourLoups) :
// - loups_nuit passe par api.reveiller pour chaque étape (l'ordre relu après chaque étape : le Chapardeur, la carte du Bateleur), ne
//   nomme aucune clé brute, ne garde aucune phrase du mur avec son auteur, attend la Gazette du matin, ne referme pas un vote ouvert de
//   lui-même, ne demande plus à la Braconnière qui elle emporte ; un système plus ancien (sans reveiller du Pacte) : la nuit d'avant ;
// - loups_eliminer : les graciés (Innocent, Hobereau, marché) ne meurent pas, la carte de la Chambrière et de l'Exécuteur reste cachée,
//   les morts multiples, le second vote ouvert de lui-même ;
// - loups_vote : la Crue rend { erreur }, la Chaîne, le Bailli des Vendanges, les votants du Souffre-douleur, le Cabaretier, le résultat
//   (Souffre-douleur, plume, voix du Bailli), l'Exécuteur, le Châtiment, le vote à tour de rôle attendu ; jamais rouvrir un vote ouvert ;
// - loups_jour : le Greffier jamais annoncé, le Régent (1 à 2), le rasoir du Perruquier ;
// - loups_composer, loups_distribuer, loups_rejouer : le niveau « le-pacte » (sans métier), le Village, les variantes (un loup de plus
//   aux Vendanges, la composition de Double visage), la Gazette, la mise en place présentée au narrateur (et le centre, pour lui seul) ;
// - loups_gazette, loups_pacte : les gestes du narrateur ; refus clair avec un système qui ne les a pas ;
// - le contexte du narrateur, le pilote (aube sans fermer un vote ouvert, la Chaîne) ;
// - les compagnons : la clé et l'effet de leur rôle, leur personnalité, chaque demande nouvelle avec son sujet, sa précision, sa note ; un
//   repli sensé (un marché pas toujours accepté, une carte du Crieur pas toujours lue) ; sans modèle, les politiques du système avec
//   l'adresse du tempérament ; leurs annonces au débat ;
// - étapes 6b et 6c : « une allégeance loup de plus » demandable (avec Double visage seulement, le réglage du monde, son conseil de
//   taille, ignorée d'un système qui ne la connaît pas), le loup de moins des débutants dit au narrateur, l'appel des charmés à voix
//   haute (chat public, avant leur réveil, sans nommer personne), les nuits d'appel comptées pour les compagnons (charmesAppeles : le
//   hook du système et le chat, jamais un message de joueur), le jour de la victoire du Revenant et du Chasseur de primes (narrateur,
//   compagnons).
// Chaque règle est cassée à son tour dans une copie du script : la batterie doit alors échouer.
// Hors de Foundry, sans appel payant.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

// ------------------------------------------------------------------ doublure de Foundry
class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const reglages = {
  fournisseur: "factice", autonomie: "autonome", voix: "aucune", compagnonsPrive: {}, mouvementsBloques: {}, historiqueLoups: [], pilote: true,
  bavardageCompagnons: "normal", personnalites: [], personnaliteActive: ""
};
// Les réglages du système des Veillées (game.settings.get("lakour-loups", …)).
const reglagesLoups = {};
const chat = [];
const fichiers = new Map([
  ["modules/lakour-veillees/assets/compositions.json", {
    "le-pacte-06": { libelle: "Le Pacte, six", joueurs: [6, 6], niveau: "le-pacte", roles: ["loup-de-brumecombe", "chapardeur", "villageois", "villageois", "villageois", "villageois", "villageois", "villageois"], batiments: [] },
    "classique-6": { libelle: "Classique, six", joueurs: [6, 6], niveau: "classique", roles: ["loup-de-brumecombe", "liseuse-de-cendres", "villageois", "villageois", "villageois", "villageois"], batiments: ["puits"] }
  }],
  ["modules/lakour-veillees/assets/equilibre.json", { roles: { "loup-de-brumecombe": { camp: "meute" }, "liseuse-de-cendres": { camp: "village" }, villageois: { camp: "village" },
    chapardeur: { camp: "village" }, incendiaire: { camp: "solitaire", village: true } }, batiments: {} }]
]);
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2), getRoute: r => r }
};
globalThis.fetch = async url => {
  const chemin = String(url).split("?")[0];
  return fichiers.has(chemin) ? { ok: true, json: async () => structuredClone(fichiers.get(chemin)) } : { ok: false, json: async () => null };
};
// Les réveils de la nuit (hook lakourLoups.reveil du système) : les compagnons y entendent l'appel des charmés.
const reveils = [];
globalThis.Hooks = { on(nom, f) { if (nom === "lakourLoups.reveil") reveils.push(f); }, callAll() {}, once() {} };
globalThis.fromUuidSync = uuid => ({ name: String(uuid).split(".").at(-1) });
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...structuredClone(d) }; chat.push(m); return m; } } };
const index = cles => ({ getIndex: async () => new Collection(cles.map(([cle, nom]) => [cle, { uuid: `Compendium.x.${cle}`, name: nom, system: { cle } }])) });
const TRADUCTIONS = {
  "LAKOUR_LOUPS.Variantes.Mur.Invite": "Le Mur des murmures : écris une courte phrase, sans ton nom, ou passe.",
  "LAKOUR_LOUPS.Gazette.Cartes.crue.Nom": "La Crue", "LAKOUR_LOUPS.Gazette.Cartes.lune-noire.Nom": "Lune noire"
};
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", { id: "u1", name: "Jordan", isGM: false, active: true }], ["u2", { id: "u2", name: "Lia", isGM: false, active: true }]]),
  actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups", title: "Les Veillées", version: "1" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (m, k) => structuredClone(m === "lakour-loups" ? reglagesLoups[k] : reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null },
  i18n: { localize: k => TRADUCTIONS[k] ?? k, format: k => k, has: k => k in TRADUCTIONS, translations: {} },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), journal: [], paused: false,
  packs: new Collection([
    ["lakour-veillees.roles", index([["loup-de-brumecombe", "Loup de Brumecombe"], ["liseuse-de-cendres", "Liseuse de cendres"], ["villageois", "Villageois"], ["chapardeur", "Chapardeur"], ["incendiaire", "Incendiaire"]])],
    ["lakour-veillees.metiers", index([["forgeron", "Forgeron"]])], ["lakour-veillees.batiments", index([["puits", "Le Puits"]])]
  ])
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
// Un script du MJ IA, d'origine ou muté (copie dont les imports pointent vers les vrais scripts).
async function charger(fichier, mutation = null) {
  if (!mutation) return { X: await import(`../scripts/${fichier}`), dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-pacte-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], mutation[1]);
  writeFileSync(join(dossier, fichier), texte);
  return { X: await import(pathToFileURL(join(dossier, fichier)).href), dossier };
}

// ------------------------------------------------------------------ une partie du Pacte (doublure de l'API)
// Les rôles SECRETS (api.roleDe), jamais sur les documents. ancien : un système d'avant le Pacte (ni reveiller du Pacte, ni pacte,
// ni ambigus, ni village, ni gazette…).
const role = (nom, cle, camp, effet = "", nuit = {}) => ({ name: nom, img: "", system: { cle, camp, effet, description: `<p>${nom}.</p>`, victoire: "", nuit: { invite: `${nom} : que fais-tu ?`, cibles: 1, ...nuit } } });
const ROLES = {
  v0: role("Loup de Brumecombe", "loup-de-brumecombe", "meute", "tuer", { invite: "La meute chasse. Quelle maison ?", ordre: 40 }),
  v1: role("Herboriste", "herboriste", "village", "remede", { invite: "Sauver ou empoisonner ?", cibles: 2 }),
  v2: role("Chapardeur", "chapardeur", "village", "chaparder"),
  v3: role("Braconnière", "braconniere", "village", "emporter"),
  v4: role("Mâtin", "matin", "village", "choisir-camp", { soiMeme: true })
};
function pacte({ ancien = false, phase = "jour", tour = 1 } = {}) {
  game.actors = new Collection();
  for (const [i, [nom, joueur]] of [["Aubin", "u1"], ["Berthe", ""], ["Colin", ""], ["Denise", "u2"], ["Ernest", ""]].entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, img: "", system: { joueur, compagnon: !joueur, vivant: true, revele: false, maison: `Maison ${i + 1}` },
      items: [], update: async () => a };
    a.items.find = Array.prototype.find.bind(a.items);
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour, vainqueur: "", vote: { ouvert: false, numero: 3 }, morts: [], historique: [], registre: [], variantes: {}, batimentsCles: [] };
  const appels = { reveiller: [], noter: [], distribuer: [], composer: [], nouvellePartie: [], ouvrir: [], eliminer: [], agir: [], gazette: 0, demandes: [] };
  const vivant = id => game.actors.get(id).system.vivant;
  const api = {
    appels, etat: () => structuredClone(etat), _etat: etat,
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    roleDe: a => ROLES[a?.id ?? a] ?? null, campDe: a => ROLES[a?.id ?? a]?.system.camp ?? "",
    fiche: id => (ROLES[id] ? { camp: ROLES[id].system.camp, amoureux: "", protections: 0, role: ROLES[id] } : null),
    carnet: () => [],
    logique: {
      etatPublic: e => structuredClone(e),
      maisonsDuVillage: n => Array.from({ length: n }, (_, i) => `Maison ${i + 1}`),
      composer: (n, _eq, options) => {
        appels.composer.push(options);
        return { roles: ["loup-de-brumecombe", ...Array(n - 1).fill("villageois")], batiments: options.niveau === "le-pacte" ? [] : ["puits"], somme: 0, verdict: "équilibrée" };
      },
      variantesPermises: v => ({ ...v }), paquetDoubleVisage: n => Array(n).fill("villageois"), LOUPS_DES_VENDANGES: 1,
      paquetDuChapardeur: cles => cles.includes("chapardeur"), voteEmpeche: e => Boolean(e.crue), CLES_DE_LA_GAZETTE: ["crue", "lune-noire"],
      // Le Pacte, étapes 6b et 6c (un système ancien ne les a pas).
      ...(ancien ? {} : { allegeanceLoupEnPlus: e => Boolean(e?.variantes?.allegeanceLoup), LOUPS_DE_MOINS: { debutants: 1 }, JOUR_DU_REVENANT: 3,
        JOUR_LIMITE_DE_LA_PRIME: 2 })
    },
    async changerPhase(p) { etat.phase = p; if (p === "nuit") etat.tour++; },
    candidatsDeNuit: () => api.villageois().filter(a => vivant(a.id)).map(a => a.id),
    async demanderAction(o) { appels.demandes.push(o); return o.candidats.slice(0, 1); },
    async demanderActionMeute(o) { appels.demandes.push({ meute: true, ...o }); return o.candidats.slice(0, 1); },
    async noterAction(a) { appels.noter.push(a); },
    async resoudreNuit() { return { morts: [], messages: [], annonces: [], enAttente: [] }; },
    async verifierVictoire() { return etat.vainqueur; },
    async distribuer(args) { appels.distribuer.push(args); return []; },
    async nouvellePartie(args) { appels.nouvellePartie.push(args); return { partie: "p2", joueurs: [], compagnons: [], composition: { cle: "generee", libelle: "générée" } }; },
    async ouvrirVote(o) { appels.ouvrir.push(o); etat.vote = { ...etat.vote, ouvert: true, objet: o.objet ?? "execution", candidats: o.candidats ?? [] }; return structuredClone(etat.vote); },
    async cloreVote() { etat.vote.ouvert = false; return { decompte: { v0: 2 }, elu: "v0", elus: ["v0"], objet: etat.vote.objet ?? "execution" }; },
    async eliminer(id) { appels.eliminer.push(id); game.actors.get(id).system.vivant = false; return [id]; },
    pouvoirsDeJour: () => [],
    async agirDeJour(o) { appels.agir.push(o); return { pouvoir: o.pouvoir, annonces: [] }; }
  };
  if (!ancien) {
    // L'ordre de la nuit, relu à chaque étape : le Chapardeur fait entrer la carte jouée par le Bateleur, le mur suit.
    const faites = new Set();
    let emprunt = false;
    Object.assign(api, {
      ordreDeNuit: () => [
        { roleCle: "chapardeur", acteurIds: ["v2"] },
        ...(emprunt ? [{ roleCle: "liseuse-de-cendres", acteurIds: ["v2"], emprunt: true }] : []),
        { roleCle: "meute", acteurIds: ["v0"] }, { roleCle: "herboriste", acteurIds: ["v1"] }, { roleCle: "mur", acteurIds: ["v0", "v1", "v2", "v3", "v4"] }
      ],
      proiesDeLaNuit: () => ({ proies: ["v3"], mordus: [], aSauver: ["v3"] }),
      async reveiller(roleCle, o = {}) {
        appels.reveiller.push({ roleCle, ...o });
        faites.add(roleCle);
        if (roleCle === "chapardeur") { emprunt = true; return { roleCle, acteurIds: ["v2"], cibles: [], texte: "", carte: 0 }; }
        if (roleCle === "mur") return { roleCle, acteurIds: [], cibles: [], texte: "" };
        if (roleCle === "meute") return { roleCle, acteurIds: ["v0"], cibles: ["v3"], texte: "" };
        return { roleCle, acteurIds: ["v1"], cibles: ["v3"], texte: "" };
      },
      attendreGazette: async () => { appels.gazette++; },
      pacte: () => ({ sagessePerdue: etat.sagesse ?? 0, gracies: etat.gracies ?? [], votants: etat.votants ?? null, plume: null }),
      ambigus: () => ({ bateleur: [{ cle: "liseuse-de-cendres", nom: "Liseuse de cendres", img: "" }], retirees: [], commenceParLeJour: Boolean(etat.feuFollet), groupes: null,
        devouements: etat.devouements ?? [] }),
      ambigusSecrets: () => ({ centre: [{ cle: "loup-de-brumecombe", nom: "Loup de Brumecombe" }, { cle: "villageois", nom: "Villageois" }], modeles: {}, matins: [], charmes: [], emprunts: {} }),
      village: () => ({ actif: Boolean(etat.village), batiments: etat.village ?? [], detruits: [], chemineaux: [{ acteurId: "v4", nom: "Ernest" }], regent: null, graces: etat.graces ?? [], cabaret: null }),
      personnalite: id => (etat.village ?? []).filter(b => b.acteurId === id).map(b => ({ cle: b.cle, personnalite: b.personnalite, titre: b.titre, aide: b.aide ?? "", batiment: b.nom }))[0] ?? null,
      gazette: () => ({ actif: true, rythme: 1, choix: false, restantes: 20, tirees: etat.tirees ?? [], enCours: [], conduite: [], absents: [], proteges: [], prives: [],
        crieur: { actif: false, acteurId: "", nom: "" }, executeur: { acteurId: etat.executeur ?? "", nom: etat.executeur ? "Ernest" : "" }, marches: etat.marches ?? [] }),
      traits: () => ({ v0: { texte: "homme, vieux (70 ans), pipe" } }),
      derniersGestes: () => etat.gestes ?? [],
      async designerVotants(ids) { return ids; },
      async lireUneCarte(cle) { appels.lu = cle; return cle; },
      async priverDeVote(id) { appels.prive = id; return true; }
    });
  } else {
    api.ordreDeNuit = () => [{ roleCle: "meute", acteurIds: ["v0"] }, { roleCle: "herboriste", acteurIds: ["v1"] }];
  }
  game.lakourLoups = api;
  return api;
}
const sansClesBrutes = (texte, ou) => {
  for (const cle of ["loup-de-brumecombe", "liseuse-de-cendres", "lune-noire", "double-visage", "le-pacte"]) {
    assert.doesNotMatch(texte, new RegExp(`(^|[^\\w-])${cle}($|[^\\w-])`), `${ou} : clé brute « ${cle} » : ${texte}`);
  }
  assert.doesNotMatch(texte, /undefined|\[object Object\]|\bNaN\b/, `${ou} : ${texte}`);
};

// ------------------------------------------------------------------ la batterie
// M : { outils, contexte, pilote, jeu, compagnons, pacte } (modules, d'origine ou un muté).
const outil = (M, nom) => M.outils.OUTILS.find(o => o.nom === nom);
const VERIFICATIONS = {
  async "loups_nuit : chaque étape par api.reveiller, l'ordre relu (la carte du Bateleur), la Gazette attendue, rien de brut"(M) {
    const api = pacte();
    const r = await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
    assert.ok(!r.erreur, r.contenu);
    assert.deepEqual(api.appels.reveiller.map(x => x.roleCle), ["chapardeur", "liseuse-de-cendres", "meute", "herboriste", "mur"], "toutes les étapes, la carte empruntée comprise");
    assert.equal(api.appels.demandes.length, 0, "le MJ IA ne réveille plus lui-même");
    assert.equal(api.appels.noter.length, 0, "le système note lui-même (le mur jamais avec un auteur)");
    assert.equal(api.appels.gazette, 1, "le matin de la Gazette est attendu");
    assert.match(r.contenu, /Chapardeur \(Colin\) → a pris une carte du centre/);
    assert.match(r.contenu, /la carte jouée par le Bateleur \(Liseuse de cendres\)/);
    assert.match(r.contenu, /le Mur des murmures → chacun a pu écrire/);
    assert.match(r.contenu, /meute \(Aubin\) → Denise/);
    sansClesBrutes(r.contenu, "loups_nuit");
  },
  async "loups_nuit : un vote ouvert de lui-même au matin, la carte de la Gazette, la Braconnière qui choisit seule"(M) {
    const api = pacte();
    api.resoudreNuit = async () => { api._etat.vote = { ouvert: true, objet: "execution", numero: 4 }; api._etat.tirees = [{ cle: "crue", tour: api._etat.tour, nom: "La Crue" }];
      return { morts: ["v3"], messages: [], annonces: [], enAttente: [{ acteurId: "v3", effet: "emporter" }] }; };
    const r = await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
    assert.match(r.contenu, /Un vote s'est ouvert de lui-même ce matin/);
    assert.doesNotMatch(r.contenu, /ouvre le débat du jour/);
    assert.match(r.contenu, /Gazette de la lune, ce matin \(déjà lue au chat/);
    assert.match(r.contenu, /Denise choisit lui-même qui il emporte/);
    assert.doesNotMatch(r.contenu, /demande-le-lui/);
    // Un vote encore ouvert : la nuit le fermerait sans dépouillement.
    assert.equal((await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" })).erreur, true);
  },
  async "loups_nuit : un système d'avant le Pacte, la nuit d'avant (le MJ IA réveille, l'Herboriste apprend la proie)"(M) {
    const api = pacte({ ancien: true });
    const r = await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
    assert.ok(!r.erreur, r.contenu);
    assert.ok(api.appels.demandes.some(d => d.meute), "la meute réveillée par le MJ IA");
    const h = api.appels.demandes.find(d => d.acteurId === "v1");
    assert.match(h.invite, /^Cette nuit, la meute a attaqué Aubin|^Cette nuit, la meute a attaqué Berthe|^Cette nuit, la meute a attaqué /);
    assert.equal(api.appels.noter.length, 2);
  },
  async "loups_eliminer : un gracié ne meurt pas, la carte de la Chambrière reste cachée, la Braconnière choisit seule, le second vote"(M) {
    let api = pacte();
    api.eliminer = async () => { api._etat.gracies = [{ acteurId: "v1", tour: 1 }]; return []; };
    let r = await outil(M, "loups_eliminer").executer({ villageois: "Berthe", cause: "vote", reveler: true });
    assert.match(r.contenu, /Berthe n'est PAS mort : l'Innocent est gracié/);
    assert.doesNotMatch(r.contenu, /meurt|Rôle/);
    api = pacte();
    api.eliminer = async () => { api._etat.graces = [{ acteurId: "v1", tour: 1 }]; return []; };
    r = await outil(M, "loups_eliminer").executer({ villageois: "Berthe", cause: "vote", reveler: true });
    assert.match(r.contenu, /le Hobereau l'a gracié/);
    api = pacte();
    api.eliminer = async id => { game.actors.get(id).system.vivant = false; api._etat.devouements = [{ acteurId: "v4", de: id, tour: 1 }]; return [id]; };
    r = await outil(M, "loups_eliminer").executer({ villageois: "Berthe", cause: "vote", reveler: true });
    assert.match(r.contenu, /La Chambrière Ernest s'est dévouée/);
    assert.doesNotMatch(r.contenu, /Herboriste/, "la carte du condamné n'est pas dite");
    api = pacte();
    api.eliminer = async id => { for (const x of [id, "v3"]) game.actors.get(x).system.vivant = false; game.actors.get(id).system.revele = true;
      api._etat.gestes = [{ acteurId: "v3", nom: "Denise", geste: "emporter", demande: true }]; api._etat.vote = { ouvert: true, numero: 5 }; return [id, "v3"]; };
    r = await outil(M, "loups_eliminer").executer({ villageois: "Berthe", cause: "vote", reveler: true });
    assert.match(r.contenu, /Berthe et Denise meurent/);
    assert.match(r.contenu, /raconte-les toutes/);
    assert.match(r.contenu, /Rôle révélé de Berthe : Herboriste/);
    assert.match(r.contenu, /Carte de Denise NON retournée/);
    assert.match(r.contenu, /Denise choisit lui-même qui il emporte/);
    assert.doesNotMatch(r.contenu, /demande-lui/);
    assert.match(r.contenu, /second vote d'exécution s'est ouvert de lui-même, SANS débat/);
  },
  async "loups_vote : la Crue refusée sans exception, la Chaîne, le Bailli des Vendanges, les votants, le Cabaretier ; jamais rouvrir"(M) {
    let api = pacte();
    api._etat.crue = true;
    assert.equal((await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "execution" })).erreur, true);
    api = pacte();
    api.ouvrirVote = async () => { throw new Error("La Crue : pas de vote aujourd'hui."); };
    const refus = await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.equal(refus.erreur, true);
    assert.match(refus.contenu, /La Crue/);
    api = pacte();
    api._etat.votants = { tour: 1, ids: ["v1", "v2"], par: "v3" };
    api._etat.village = [{ cle: "cabaret", nom: "Le Cabaret", personnalite: "cabaretier", titre: "Cabaretier", acteurId: "v4", occupant: "Ernest", disponible: true }];
    api.ouvrirVote = async o => { api._etat.vote = { ouvert: true, objet: "execution", numero: 6, chaine: true, bailliDabord: { acteurId: "v1" }, candidats: o.candidats.filter(c => c !== "v4") }; return api._etat.vote; };
    const r = await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.match(r.contenu, /4 candidats/, "le Cabaretier n'est pas candidat (le système le retire)");
    assert.match(r.contenu, /La Chaîne des innocents : personne ne vote/);
    assert.match(r.contenu, /Berthe, le Bailli, vote seul et le premier/);
    assert.match(r.contenu, /Seuls votent aujourd'hui .* Berthe, Colin/);
    assert.match(r.contenu, /Ernest, le Cabaretier, vote à découvert/);
    assert.equal((await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "execution" })).erreur, true, "jamais rouvrir");
  },
  async "loups_vote : le dépouillement du Pacte (Souffre-douleur, plume, voix du Bailli), l'Exécuteur, le Châtiment, le vote à tour de rôle"(M) {
    let api = pacte();
    api._etat.vote = { ouvert: true, objet: "execution", numero: 2 };
    api.cloreVote = async () => ({ decompte: { v0: 2, v1: 2 }, elus: ["v3"], objet: "execution", souffreDouleur: "v3", plume: "v0", departage: { par: "v1", auto: ["v0"], choix: [] } });
    let r = await outil(M, "loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.match(r.contenu, /L'égalité est PAYÉE par Denise/);
    assert.match(r.contenu, /ne propose pas de revote/);
    assert.match(r.contenu, /La plume noire a porté deux voix sans votant contre Aubin/);
    assert.match(r.contenu, /La voix du Bailli Berthe a tranché d'elle-même : Aubin/);
    api = pacte();
    assert.ok(!(await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "executeur" })).erreur);
    assert.equal(api._etat.phase, "jour", "l'élection de l'Exécuteur ne change pas de phase");
    api.cloreVote = async () => ({ decompte: { v4: 3 }, elus: ["v4"], objet: "executeur", executeur: "v4" });
    r = await outil(M, "loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.match(r.contenu, /Ernest est l'Exécuteur/);
    api = pacte();
    assert.equal((await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 0, double: false, objet: "chatiment" })).erreur, true, "le Châtiment : un accusé");
    assert.ok(!(await outil(M, "loups_vote").executer({ action: "ouvrir", candidats: ["Colin"], duree_secondes: 0, double: false, objet: "chatiment" })).erreur);
    assert.deepEqual(api.appels.ouvrir.at(-1).candidats, ["v2"]);
    api.cloreVote = async () => ({ decompte: { v2: 1 }, elus: ["v2"], elu: "v2", objet: "chatiment", soutiens: 1 });
    r = await outil(M, "loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.match(r.contenu, /n'appelle pas loups_eliminer/);
    // À tour de rôle : le système clôt lui-même ; l'outil attend la fin, sans recompter.
    api = pacte();
    api._etat.vote = { ouvert: true, objet: "execution", numero: 8, mode: "suite", ordre: ["v0", "v1"], rang: 1 };
    let clos = 0;
    api.cloreVote = async () => { clos++; return {}; };
    setTimeout(() => { api._etat.vote = { ouvert: false, numero: 8, resultat: { decompte: { v1: 2 }, elus: ["v1"], objet: "execution", mode: "suite" } }; }, 50);
    r = await outil(M, "loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.equal(clos, 0, "jamais clos avant le dernier");
    assert.match(r.contenu, /Désigné : Berthe/);
  },
  async "loups_jour : le signe du Greffier jamais annoncé, le Régent (1 à 2), le rasoir du Perruquier"(M) {
    const api = pacte();
    api.pouvoirsDeJour = id => (id === "v1" ? [{ pouvoir: "greffier-begue", nom: "Greffier bègue", source: "role", cibles: 0, candidats: [], possible: true },
      { pouvoir: "ecole", nom: "Régent", source: "tenure", cibles: 2, ciblesMin: 1, candidats: [{ id: "v0", nom: "Aubin" }], possible: true },
      { pouvoir: "echoppe", nom: "Perruquier", source: "tenure", cibles: 1, candidats: [{ id: "v0", nom: "Aubin" }], possible: true }] : []);
    const liste = await outil(M, "loups_jour").executer({ action: "lister", villageois: "Berthe", pouvoir: "", cibles: [], texte: "" });
    assert.match(liste.contenu, /Greffier bègue \(rôle SECRET : un signe secret, ne l'annonce jamais\)/);
    assert.match(liste.contenu, /Régent \(personnalité, publique\) — désigne 1 à 2/);
    const signe = await outil(M, "loups_jour").executer({ action: "utiliser", villageois: "Berthe", pouvoir: "Greffier bègue", cibles: [], texte: "" });
    assert.match(signe.contenu, /SECRET/);
    assert.doesNotMatch(signe.contenu, /Annoncé au village/);
    api._etat.vainqueur = "village";
    const rasoir = await outil(M, "loups_jour").executer({ action: "utiliser", villageois: "Berthe", pouvoir: "Perruquier", cibles: ["Aubin"], texte: "" });
    assert.match(rasoir.contenu, /n'appelle pas loups_eliminer/);
    assert.match(rasoir.contenu, /VICTOIRE : village/);
  },
  async "loups_composer, loups_distribuer, loups_rejouer : le Pacte, le Village, les variantes, la Gazette, la mise en place"(M) {
    let api = pacte();
    const c = await outil(M, "loups_composer").executer({ nombre_joueurs: 6, niveau: "le-pacte", inclure: [], exclure: [], peste: "non", village: "oui", variantes: ["vendanges"] });
    assert.ok(!c.erreur, c.contenu);
    assert.deepEqual([api.appels.composer[0].niveau, api.appels.composer[0].village, api.appels.composer[0].loupsEnPlus], ["le-pacte", true, 1]);
    assert.match(c.contenu, /Le Pacte/);
    assert.match(c.contenu, /les Vendanges \(un loup de plus, compté\)/);
    sansClesBrutes(c.contenu.split("Clés pour")[0], "loups_composer");
    // Le Pacte : le centre du Chapardeur (n + 2 cartes), sans métier ; la mise en place présentée, le centre au narrateur seul.
    api = pacte();
    api._etat.feuFollet = true;
    let r = await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "composition", niveau: "le-pacte", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "le-pacte-06", compagnons: 4, peste: "", glas: 0, format: "", village: "", variantes: [], gazette: "oui" });
    assert.ok(!r.erreur, r.contenu);
    const d = api.appels.distribuer[0];
    assert.equal(d.roles.length, 8, "six joueurs, deux cartes au centre");
    assert.deepEqual(d.metiers, [], "le jeu de soirée n'a pas de métier");
    assert.deepEqual(d.gazette, { actif: true });
    assert.match(r.contenu, /Cartes du Bateleur, face visible \(PUBLIQUES/);
    assert.match(r.contenu, /COMMENCE PAR UN JOUR/);
    assert.match(r.contenu, /Pour toi seul \(SECRET\) : les cartes du centre du Chapardeur — Loup de Brumecombe, Villageois/);
    assert.match(r.contenu, /Traits visibles \(PUBLICS/);
    sansClesBrutes(r.contenu, "loups_distribuer");
    // Double visage : la composition du système, la variante transmise ; les Vendanges : un Villageois devient loup.
    api = pacte();
    await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "", compagnons: 5, peste: "", glas: 0, format: "", village: "non", variantes: ["double-visage-petite"], gazette: "" });
    assert.equal(api.appels.distribuer[0].composition, "double-visage");
    assert.equal(api.appels.distribuer[0].variantes.doubleVisage, "petite");
    assert.equal(api.appels.distribuer[0].village, false);
    api = pacte();
    await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "composition", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "classique-6", compagnons: 4, peste: "", glas: 0, format: "", village: "", variantes: ["vendanges"], gazette: "" });
    assert.equal(api.appels.distribuer[0].roles.filter(u => u.endsWith("loup-de-brumecombe")).length, 2, "les Vendanges : un loup de plus");
    // loups_rejouer : les choix passés au système.
    api = pacte();
    game.modules.get("lakour-mj-ia").api = { moteur: { nouvellePartie() {} } };
    await outil(M, "loups_rejouer").executer({ niveau: "le-pacte", roles: [], composition: "", peste: "", glas: 0, format: "", village: "oui", variantes: ["mur"], gazette: "oui-crieur" });
    const np = api.appels.nouvellePartie[0];
    assert.equal(np.niveau, "le-pacte");
    assert.equal(np.village, true);
    assert.equal(np.variantes.mur, true);
    assert.deepEqual(np.gazette, { actif: true, crieur: true });
    game.modules.get("lakour-mj-ia").api = {};
  },
  async "loups_gazette et loups_pacte : les gestes du narrateur ; refus clair avec un système plus ancien"(M) {
    let api = pacte();
    const lu = await outil(M, "loups_gazette").executer({ action: "lire", villageois: "", cartes: ["Lune noire"], texte: "" });
    assert.ok(!lu.erreur, lu.contenu);
    assert.equal(api.appels.lu, "lune-noire");
    sansClesBrutes(lu.contenu, "loups_gazette");
    await outil(M, "loups_gazette").executer({ action: "priver", villageois: "Colin", cartes: [], texte: "loup" });
    assert.equal(api.appels.prive, "v2");
    const v = await outil(M, "loups_pacte").executer({ action: "votants", villageois: ["Berthe"], cartes: [], batiment: "" });
    assert.match(v.contenu, /Votants de demain .* Berthe/);
    api = pacte({ ancien: true });
    assert.equal((await outil(M, "loups_gazette").executer({ action: "etat", villageois: "", cartes: [], texte: "" })).erreur, true);
    assert.equal((await outil(M, "loups_pacte").executer({ action: "etat", villageois: [], cartes: [], batiment: "" })).erreur, true);
  },
  "le contexte du narrateur : le public du Pacte ; le centre du Chapardeur avant la première nuit seulement"(M) {
    const api = pacte({ tour: 0, phase: "preparation" });
    api._etat.gracies = [{ acteurId: "v1", tour: 0 }];
    let lignes = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(lignes, /Innocents graciés .* Berthe/);
    assert.match(lignes, /le centre du Chapardeur — Loup de Brumecombe/);
    api._etat.tour = 2;
    lignes = M.contexte.etatPartieLoups(api).join("\n");
    assert.doesNotMatch(lignes, /centre du Chapardeur/);
    // Un système plus ancien : rien ne casse.
    assert.ok(M.contexte.etatPartieLoups(pacte({ ancien: true })).length > 0);
  },
  async "le pilote : l'aube attend la Gazette et ne referme pas un vote ouvert de lui-même ; la Chaîne dite au vote"(M) {
    const api = pacte({ phase: "aube" });
    api._etat.vote = { ouvert: true, numero: 9, objet: "execution" };
    const tours = [];
    await M.pilote.aubeDesVeillees(api, async t => { tours.push(t); });
    assert.equal(api.appels.gazette, 1, "le matin de la Gazette attendu");
    assert.equal(api._etat.phase, "aube", "le vote ouvert n'est pas fermé par le jour");
    assert.match(tours.join("\n"), /Un vote s'est ouvert de lui-même ce matin/);
    api._etat.vote = { ouvert: false, numero: 9 };
    await M.pilote.aubeDesVeillees(api, async t => { tours.push(t); });
    assert.equal(api._etat.phase, "jour", "sans vote ouvert, le jour se lève");
    assert.match(M.pilote.CONSIGNES_LOUPS.chaine, /personne ne vote/);
    assert.match(M.pilote.CONSIGNES_LOUPS.nuit, /ordre d'appel du livre/);
  },
  "compagnons : chaque demande du Pacte a son sujet, sa note ; les votes à part"(M) {
    const J = M.jeu;
    for (const objet of J.OBJETS_DU_PACTE) {
      assert.equal(J.sujetDemandeLoups({ type: "demande", objet }), objet, objet);
      assert.doesNotMatch(J.notePriveeLoups(objet, 2, ["Colin"], "?"), /^Nuit 2 \(« \? »\)/, `note de ${objet}`);
    }
    assert.equal(J.sujetDemandeLoups({ type: "vote", mode: "defiance", objet: "execution" }), "defiance");
    assert.equal(J.sujetDemandeLoups({ type: "vote", mode: "suite", objet: "execution" }), "suite");
    assert.equal(J.sujetDemandeLoups({ type: "vote", objet: "executeur" }), "vote-executeur");
    assert.equal(J.sujetDemandeLoups({ type: "vote", objet: "chatiment" }), "vote-chatiment");
    for (const s of ["defiance", "suite", "vote-executeur", "vote-chatiment"]) assert.ok(J.SUJETS_DE_VOTE.includes(s), s);
  },
  "compagnons sans modèle : un repli sensé (marché, Crieur, supplique, Défiance, Mâtin)"(M) {
    const C = M.compagnons;
    const cand = ids => ids.map(id => ({ id, nom: id.toUpperCase() }));
    const d = (vue, objet, ids, cle, extra = {}) => C.repliDecision({ id: "a1", allies: [], suspects: [], ...vue }, { type: "cibles", objet, candidats: cand(ids), nombre: 1, cle, ...extra }, "g").cibles;
    const marches = Array.from({ length: 60 }, (_, i) => d({}, "marche", ["a1"], `m${i}`).length);
    assert.ok(marches.includes(0) && marches.includes(1), "un marché accepté parfois, pas toujours");
    const lectures = Array.from({ length: 60 }, (_, i) => d({}, "crieur-annonce", ["crue", "lune-noire"], `c${i}`).length);
    assert.ok(lectures.includes(0) && lectures.includes(1), "le Crieur ne lit pas toujours une carte");
    for (let i = 0; i < 20; i++) assert.deepEqual(d({}, "supplique", ["h"], `s${i}`), ["h"], "la supplique : toujours");
    for (let i = 0; i < 30; i++) {
      const voix = d({}, "defiance", ["a1", "a2", "a3", "a4"], `f${i}`, { nombre: 2, vote: true });
      assert.equal(new Set(voix).size, 2, "deux voix distinctes");
      assert.ok(!voix.includes("a1"), "jamais soi");
    }
    const matin = Array.from({ length: 60 }, (_, i) => d({ effet: "choisir-camp" }, "nuit", ["a1"], `t${i}`).length);
    const rejoint = matin.filter(Boolean).length / matin.length;
    assert.ok(rejoint > 0.15 && rejoint < 0.65, `le Mâtin rejoint la meute deux fois sur cinq environ (${rejoint})`);
    assert.ok(C.adresseDe({ temperament: "prudent" }) > C.adresseDe({ temperament: "impulsif" }), "l'adresse suit le tempérament");
    // Ce qu'il sait passe avant le silence (vue.annonce, les politiques du système), même chez un taciturne.
    for (let i = 0; i < 10; i++) {
      const dit = C.repliReplique({ id: "a1", jeu: "loups", tour: i, personnalite: { temperament: "taciturne" }, annonce: { cible: "a2", nom: "Aubin" }, autres: [] }, `r${i}`);
      assert.match(dit, /Aubin/, "l'annonce dite");
    }
  },
  async "compagnons sans modèle : les politiques du système (effet du réveil, objet du vote, adresse du tempérament), sinon le repli"(M) {
    const api = pacte();
    const recus = [];
    api.logique.savoirDuJoueur = o => ({ moi: o.moi, camp: o.camp, allies: o.allies, loups: [], innocents: [], soupcons: {}, utiles: [], menteurs: [] });
    api.logique.politiqueDeNuit = o => { recus.push(["nuit", o.effet, o.objet, o.adresse]); return [o.candidats.at(-1).id]; };
    api.logique.politiqueDeVote = o => { recus.push(["vote", o.objet]); return o.candidats[0]; };
    api.logique.POLITIQUES_DES_GESTES = { chaine: () => [] };
    api.contenu = async () => ({ roles: [{ cle: "herboriste", nom: "Herboriste" }], equilibre: { roles: {} } });
    const herboriste = game.actors.get("v1");
    game.actors.get("v1").flags["lakour-mj-ia"] = { compagnon: { temperament: "prudent" } };
    const vue = M.jeu.vueVeillees(herboriste, { api, messages: [] });
    assert.deepEqual([vue.roleCle, vue.effet, vue.camp], ["herboriste", "remede", "village"]);
    const candidats = [{ id: "v3", nom: "Denise" }, { id: "v4", nom: "Ernest" }];
    let r = await M.jeu.decisionParPolitique(api, herboriste, vue, { type: "demande", id: "x1", invite: "Cette nuit, la meute a attaqué Denise. Sauver ou empoisonner ?", candidats, nombre: 2 }, "nuit", "g");
    assert.deepEqual(r.cibles, ["v4"]);
    assert.deepEqual(recus[0], ["nuit", "remede", "", 0.9]);
    const loup = game.actors.get("v0");
    const vueLoup = M.jeu.vueVeillees(loup, { api, messages: [] });
    await M.jeu.decisionParPolitique(api, loup, vueLoup, { type: "demande", id: "x2", invite: "Le Toucher mortel : marquez la proie.", candidats, nombre: 1 }, "nuit", "g");
    assert.equal(recus[1][1], "tuer", "un loup réveillé sous une autre invite chasse");
    await M.jeu.decisionParPolitique(api, herboriste, vue, { type: "vote", id: "x3", objet: "executeur", candidats, nombre: 1 }, "vote-executeur", "g");
    assert.deepEqual(recus[2], ["vote", "bailli"], "l'Exécuteur s'élit comme on confie un sceau");
    await M.jeu.decisionParPolitique(api, herboriste, vue, { type: "demande", id: "x4", objet: "chaine", candidats, nombre: 1 }, "chaine", "g");
    assert.deepEqual(recus[3].slice(0, 3), ["nuit", undefined, "chaine"]);
    // Le cerveau : la politique passe avant le repli, source « politique ».
    const cerveaux = new M.compagnons.CerveauxCompagnons({ graine: "g" });
    const d = await cerveaux.decider(vue, { type: "cibles", candidats, nombre: 1, cle: "k" }, { repli: async () => ({ cibles: ["v4"] }) });
    assert.deepEqual([d.cibles, d.source], [["v4"], "politique"]);
    // Un système sans politiques : null (le repli d'avant).
    assert.equal(await M.jeu.decisionParPolitique(pacte({ ancien: true }), herboriste, vue, { type: "demande", candidats, nombre: 1 }, "nuit", "g"), null);
  },
  "compagnons : la vue dit la personnalité (le Cabaretier vote à découvert), l'envoûtement, le public du Pacte ; un système ancien ne casse rien"(M) {
    const api = pacte();
    api._etat.village = [{ cle: "cabaret", nom: "Le Cabaret", personnalite: "cabaretier", titre: "Cabaretier", aide: "Il vote à découvert.", acteurId: "v2", occupant: "Colin", disponible: true }];
    api._etat.variantes = { chandelles: true, angoissante: false, chaine: true, mur: false, doubleVisage: "", vendanges: false, envoutement: false };
    const ambigus = api.ambigus;
    api.ambigus = () => ({ ...ambigus(), groupes: { critere: "rive", a: [{ id: "v0", nom: "Aubin" }, { id: "v2", nom: "Colin" }], b: [{ id: "v1", nom: "Berthe" }] } });
    const colin = game.actors.get("v2");
    ROLES.v2.system.envoute = true;
    try {
      const vue = M.jeu.vueVeillees(colin, { api, messages: [] });
      assert.match(vue.fiche, /Ta personnalité du village \(PUBLIQUE\) : Cabaretier/);
      assert.match(vue.fiche, /Ton vote est annoncé à tous/);
      assert.match(vue.fiche, /Tu es ENVOÛTÉ/);
      assert.match(vue.scene, /Variantes de la veillée \(publiques\) : la Veillée aux chandelles, la Chaîne des innocents/);
      assert.match(vue.scene, /Le Village \(public\) : Colin, Cabaretier/);
      assert.doesNotMatch(vue.scene, /Loup de Brumecombe/, "le centre du Chapardeur n'est pas pour lui");
      // Les cartes du Bateleur et les deux bords de l'Illuminé, comme le chat les annonce : sans nommer le rôle qui les met en jeu (la
      // composition ne s'annonce pas ; trouvé par l'essai d'intégration des Veillées, verifierSavoirDesCompagnons).
      assert.match(vue.scene, /Cartes posées face visible au milieu de la table \(une nuit, quelqu'un pourra jouer l'une d'elles\) : Liseuse de cendres\./);
      assert.match(vue.scene, /Le village est partagé en deux bords \(annoncé\) : Aubin, Colin \| Berthe\./);
      assert.doesNotMatch(vue.scene, /Bateleur|Illuminé/, "un rôle nommé dans la vue publique");
    } finally { delete ROLES.v2.system.envoute; }
    const ancien = pacte({ ancien: true });
    const v = M.jeu.vueVeillees(game.actors.get("v1"), { api: ancien, messages: [] });
    assert.equal(v.roleCle, "herboriste");
  },
  async "compagnons sans modèle : ce qu'ils savent se dit au débat et se retient ; un pouvoir de jour, une fois par jour"(M) {
    const api = pacte();
    const vus = [];
    api.logique.savoirDuJoueur = o => { vus.push(o.annonces); return { moi: o.moi, camp: o.camp, allies: [], loups: [], innocents: [], soupcons: {}, utiles: [], menteurs: [] }; };
    api.logique.politiqueDeNuit = () => [];
    api.logique.annoncesDuJoueur = ({ savoir }) => (savoir.moi === "v1" ? [{ cible: "v0", camp: "meute" }] : []);
    api.logique.politiqueDuJour = ({ possibles }) => ({ pouvoir: possibles[0].pouvoir, cibles: [] });
    api.pouvoirsDeJour = id => (id === "v1" ? [{ pouvoir: "sonneur", nom: "Sonneur", cibles: 0, candidats: [], possible: true }] : []);
    game.actors.get("v1").flags["lakour-mj-ia"] = { compagnon: { temperament: "bavard" } };
    const c = new M.jeu.Compagnons({ graine: "g" });
    const dits = await c.reagir({ max: 3, mentions: "Berthe" });
    const berthe = dits.find(x => x.acteurId === "v1");
    assert.match(berthe?.texte ?? "", /Aubin est un loup|Aubin est de la meute|c'est Aubin, le loup/, "il dit ce qu'il sait");
    assert.deepEqual(api.appels.agir.map(a => [a.acteurId, a.pouvoir]), [["v1", "sonneur"]], "son pouvoir de jour");
    await c.reagir({ max: 3, mentions: "Berthe" });
    assert.equal(api.appels.agir.length, 1, "un pouvoir de jour par jour");
    assert.ok(vus.at(-1).some(a => a.par === "v1" && a.cible === "v0"), "l'annonce retenue nourrit le savoir de chacun");
    // Une mémoire remise à zéro (une partie rejouée sous le même identifiant : la doublure des Veillées) : ni annonce ni pouvoir tenté
    // de la précédente (trouvé par l'essai d'intégration des Veillées : une partie rejouée ne se rejouait pas à l'identique).
    M.jeu.reinitialiserPrive();
    vus.length = 0;
    await new M.jeu.Compagnons({ graine: "g" }).reagir({ max: 3, mentions: "Berthe" });
    assert.ok(vus.length && !vus[0].some(a => a.par === "v1"), "les annonces de la partie d'avant oubliées");
    assert.equal(api.appels.agir.length, 2, "le pouvoir de jour se tente de nouveau");
  },
  "les textes purs du Pacte : variantes demandées et du monde, sans clé brute ; un appel sûr"(M) {
    const P = M.pacte;
    assert.equal(P.variantesDemandees([]), undefined, "rien de demandé : les réglages du monde");
    assert.deepEqual(P.variantesDemandees(["aucune", "mur"]), { chandelles: false, angoissante: false, chaine: false, mur: false, doubleVisage: "", allegeanceLoup: false, vendanges: false, envoutement: false });
    assert.equal(P.variantesDemandees(["angoissante"]).chandelles, true, "angoissante : des chandelles");
    assert.equal(P.variantesDeLaVeillee(undefined, cle => (cle === "vendanges" ? true : undefined)).vendanges, true, "le réglage du monde");
    assert.equal(P.variantesDeLaVeillee({ vendanges: false }, () => true).vendanges, false, "le choix l'emporte");
    sansClesBrutes(P.texteDesVariantes({ doubleVisage: "grande", vendanges: true }), "texteDesVariantes");
    assert.equal(P.appelSur({ f: () => { throw new Error("non"); } }, "f"), null);
    assert.equal(P.appelSur({}, "f"), null);
    // La mise en place présentée au narrateur : le centre du Chapardeur (pour lui seul), le Feu follet (un jour d'abord).
    const api = pacte();
    api._etat.feuFollet = true;
    const lignes = P.miseEnPlaceLoups(api, { nom: id => game.actors.get(id)?.name ?? id }).join("\n");
    assert.match(lignes, /Pour toi seul \(SECRET\) : les cartes du centre du Chapardeur/);
    assert.match(lignes, /COMMENCE PAR UN JOUR/);
    sansClesBrutes(lignes, "miseEnPlaceLoups");
    assert.deepEqual(P.miseEnPlaceLoups(pacte({ ancien: true })), [], "un système ancien : rien");
  },
  "étape 6c : une allégeance loup de plus, demandée ou du monde, avec Double visage seulement ; son conseil de taille"(M) {
    const P = M.pacte;
    assert.ok(P.CHOIX_DES_VARIANTES.includes("allegeance-loup"), "le narrateur peut la demander");
    assert.equal(P.variantesDemandees(["double-visage-grande", "allegeance-loup"]).allegeanceLoup, true);
    assert.equal(P.variantesDemandees(["allegeance-loup"]).allegeanceLoup, false, "sans Double visage, rien");
    const monde = cle => ({ doubleVisage: "petite", allegeanceLoupEnPlus: true })[cle];
    const nouveau = { allegeanceLoupEnPlus: () => true, variantesPermises: v => ({ ...v }) };
    assert.equal(P.variantesDeLaVeillee(undefined, monde, { logique: nouveau }).allegeanceLoup, true, "le réglage du monde");
    assert.equal(P.variantesDeLaVeillee(undefined, monde, { logique: { ...nouveau, variantesPermises: v => ({ ...v, doubleVisage: "" }) } }).allegeanceLoup, false,
      "Double visage écarté (la taille) : la carte de plus aussi");
    assert.equal(P.variantesDeLaVeillee(undefined, monde, { logique: { variantesPermises: v => ({ ...v }) } }).allegeanceLoup, false,
      "un système qui ne la connaît pas : jamais annoncée");
    assert.match(P.texteDesVariantes({ doubleVisage: "petite", allegeanceLoup: true }), /Double visage \(petite complication, une allégeance loup de plus\)/);
    // Le conseil mesuré (docs/equilibre-veillees.md des Veillées) : dès 16 en petite complication, et à 13 ; dès 12 en grande.
    assert.deepEqual([10, 12, 13, 14, 15, 16, 18].map(n => P.allegeanceLoupConseillee("petite", n)), [false, false, true, false, false, true, true]);
    assert.deepEqual([11, 12, 18].map(n => P.allegeanceLoupConseillee("grande", n)), [false, true, true]);
    assert.match(P.conseilDeLAllegeance({ doubleVisage: "petite", allegeanceLoup: true }, 10), /donne la partie à la meute/);
    assert.match(P.conseilDeLAllegeance({ doubleVisage: "grande", allegeanceLoup: false }, 14), /propose-la à la table/);
    assert.equal(P.conseilDeLAllegeance({ doubleVisage: "petite", allegeanceLoup: false }, 10), "", "en dessous, le paquet du livre : rien à proposer");
    assert.equal(P.conseilDeLAllegeance({}, 16), "");
  },
  "étape 6c : les textes purs (loup de moins, nuits d'appel au chat, jour des solitaires)"(M) {
    const P = M.pacte;
    assert.match(P.notesDuNiveau("debutants", { LOUPS_DE_MOINS: { debutants: 1 } }), /^Niveau débutants : un loup de moins/);
    assert.equal(P.notesDuNiveau("classique", { LOUPS_DE_MOINS: { debutants: 1 } }), "");
    assert.equal(P.notesDuNiveau("debutants", {}), "", "un système qui ne le compte pas");
    const mj = m => m.author?.isGM === true;
    const appel = (tour, o = {}) => ({ author: { isGM: true }, flags: { "lakour-mj-ia": { [P.APPEL_DES_CHARMES]: { partie: "p1", tour } } }, ...o });
    const nuits = P.nuitsDAppelAuChat([appel(1), appel(1), appel(2), appel(3, { author: { isGM: false } }), appel(4, { whisper: ["u1"] }),
      { ...appel(5), flags: { "lakour-mj-ia": { [P.APPEL_DES_CHARMES]: { partie: "p0", tour: 5 } } } }, { author: { isGM: true }, flags: {} }], { partie: "p1", ecritParUnMJ: mj });
    assert.deepEqual([...nuits].sort(), [1, 2], "deux nuits : ni un joueur, ni un chuchotement, ni une autre partie");
    assert.match(P.texteAppelDesCharmes("fr"), /^Les charmés, ouvrez les yeux/);
    assert.match(P.texteAppelDesCharmes("en"), /^The charmed ones, open your eyes/);
    // Le jour des solitaires, pour le narrateur seul.
    const roles = { c: { name: "Chasseur de primes", system: { cle: "chasseur-de-primes", camp: "solitaire" } }, r: { name: "Revenant", system: { cle: "revenant", camp: "solitaire" } } };
    const api = { logique: { JOUR_DU_REVENANT: 3, JOUR_LIMITE_DE_LA_PRIME: 2 }, villageois: () => [{ id: "c", name: "Colin", system: { vivant: true } }, { id: "r", name: "Rose", system: { vivant: true } }],
      roleDe: a => roles[a.id], campDe: a => roles[a.id].system.camp };
    let l = P.etatPacteLoups(api, { tour: 1, primes: { c: "x" } }, id => (id === "x" ? "Xavier" : id)).join("\n");
    assert.match(l, /la cible de Colin \(Chasseur de primes\) est Xavier ; elle doit tomber au vote au plus tard le jour 2/);
    assert.match(l, /Rose \(Revenant\) ne gagne qu'exécuté au vote à partir du jour 3/);
    l = P.etatPacteLoups(api, { tour: 3, primes: { c: "x" } }, id => id).join("\n");
    assert.doesNotMatch(l, /la cible de Colin/, "passé le jour 2, la prime n'est plus à redire");
    roles.c.system.camp = "village";
    assert.match(P.etatPacteLoups(api, { tour: 3, primes: { c: "x" } }).join("\n"), /la prime de Colin a échoué/);
    assert.deepEqual(P.reglesDesSolitaires({ ...api, logique: {} }, { tour: 1, primes: { c: "x" } }), [], "un système sans ces règles");
  },
  async "étape 6c : les outils de partie connaissent la carte de plus (composer, distribuer, rejouer, le réglage du monde)"(M) {
    let api = pacte();
    let c = await outil(M, "loups_composer").executer({ nombre_joueurs: 10, niveau: "classique", inclure: [], exclure: [], peste: "", village: "", variantes: ["double-visage-petite", "allegeance-loup"] });
    assert.match(c.contenu, /petite complication, une allégeance loup de plus/);
    assert.match(c.contenu, /donne la partie à la meute/, "hors de sa taille : le narrateur est prévenu");
    c = await outil(M, "loups_composer").executer({ nombre_joueurs: 12, niveau: "classique", inclure: [], exclure: [], peste: "", village: "", variantes: ["double-visage-grande"] });
    assert.match(c.contenu, /propose-la à la table/, "à sa taille : proposée");
    sansClesBrutes(c.contenu, "loups_composer (Double visage)");
    api = pacte();
    let r = await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "", compagnons: 8, peste: "", glas: 0, format: "", village: "", variantes: ["double-visage-petite", "allegeance-loup"], gazette: "" });
    assert.equal(api.appels.distribuer[0].variantes.allegeanceLoup, true, "transmise au système");
    assert.match(r.contenu, /donne la partie à la meute/);
    // Sans choix explicite : les réglages du monde, la carte de plus comprise (le choix de Double visage ne l'efface plus).
    api = pacte();
    Object.assign(reglagesLoups, { doubleVisage: "petite", allegeanceLoupEnPlus: true });
    try {
      r = await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [],
        composition: "", compagnons: 14, peste: "", glas: 0, format: "", village: "", variantes: [], gazette: "" });
      assert.equal(api.appels.distribuer[0].variantes.allegeanceLoup, true, "le réglage du monde gardé");
      assert.doesNotMatch(r.contenu, /donne la partie à la meute/, "16 joueurs : sa taille");
    } finally { delete reglagesLoups.doubleVisage; delete reglagesLoups.allegeanceLoupEnPlus; }
    api = pacte();
    game.modules.get("lakour-mj-ia").api = { moteur: { nouvellePartie() {} } };
    try {
      await outil(M, "loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "", glas: 0, format: "", village: "", variantes: ["double-visage-grande", "allegeance-loup"], gazette: "" });
      assert.equal(api.appels.nouvellePartie[0].variantes.allegeanceLoup, true);
    } finally { game.modules.get("lakour-mj-ia").api = {}; }
    // Un système qui ne la connaît pas : ni transmise comme acquise, ni annoncée.
    api = pacte({ ancien: true });
    r = await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "classique", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "", compagnons: 8, peste: "", glas: 0, format: "", village: "", variantes: ["double-visage-petite", "allegeance-loup"], gazette: "" });
    assert.equal(api.appels.distribuer[0].variantes.allegeanceLoup, false);
    assert.doesNotMatch(r.contenu, /allégeance loup de plus/);
  },
  async "étape 6c : le loup de moins des débutants, dit au narrateur seul (un système qui ne le compte pas : rien)"(M) {
    let api = pacte();
    let c = await outil(M, "loups_composer").executer({ nombre_joueurs: 8, niveau: "debutants", inclure: [], exclure: [], peste: "non", village: "", variantes: [] });
    assert.match(c.contenu, /Niveau débutants : un loup de moins que le barème .* déjà compté par le système ; n'en retire pas un autre/);
    c = await outil(M, "loups_composer").executer({ nombre_joueurs: 8, niveau: "classique", inclure: [], exclure: [], peste: "non", village: "", variantes: [] });
    assert.doesNotMatch(c.contenu, /un loup de moins/);
    api = pacte();
    const r = await outil(M, "loups_distribuer").executer({ joueurs: [], mode: "auto", niveau: "debutants", roles: [], batiments: [], inclure: [], exclure: [],
      composition: "", compagnons: 6, peste: "non", glas: 0, format: "", village: "", variantes: [], gazette: "" });
    assert.match(r.contenu, /Niveau débutants : un loup de moins/);
    assert.equal(api.appels.composer[0].niveau, "debutants", "le générateur du système le compte");
    pacte({ ancien: true });
    c = await outil(M, "loups_composer").executer({ nombre_joueurs: 8, niveau: "debutants", inclure: [], exclure: [], peste: "non", village: "", variantes: [] });
    assert.doesNotMatch(c.contenu, /un loup de moins/);
  },
  async "étape 6c : le narrateur appelle les charmés à voix haute (chat public, avant leur réveil, sans nommer personne)"(M) {
    const api = pacte();
    const ordre = api.ordreDeNuit;
    api.ordreDeNuit = () => [...ordre(), { roleCle: "charmes", acteurIds: ["v1", "v3"] }];
    const reveiller = api.reveiller;
    let auReveil = -1;
    api.reveiller = async (cle, o) => { if (cle === "charmes") auReveil = chat.length; return reveiller(cle, o); };
    const avant = chat.length;
    try {
      const r = await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
      assert.ok(!r.erreur, r.contenu);
      const appels = chat.slice(avant).filter(m => m.flags?.["lakour-mj-ia"]?.appelDesCharmes);
      assert.equal(appels.length, 1, "un appel, une fois");
      const [m] = appels;
      assert.equal(auReveil, chat.indexOf(m) + 1, "dit avant leur réveil");
      assert.ok(!m.whisper?.length, "à tous");
      assert.match(m.content, /Les charmés, ouvrez les yeux/);
      assert.doesNotMatch(m.content, /vielle|Berthe|Denise/i, "ni le Joueur de vielle ni un charmé nommés");
      assert.deepEqual(m.flags["lakour-mj-ia"].appelDesCharmes, { partie: "p1", tour: 2 });
      assert.equal(m.flags["lakour-mj-ia"].narration && m.flags["lakour-mj-ia"].final, true, "lu par la voix du narrateur");
      assert.match(r.contenu, /les charmés \(Berthe, Denise\) → ils se sont reconnus .* appelés à voix haute/);
      assert.match(outil(M, "loups_nuit").description, /charmés .* appelés à voix haute/);
      sansClesBrutes(r.contenu, "loups_nuit (charmés)");
      // Une nuit sans charmés : aucun appel.
      pacte();
      const n = chat.length;
      await outil(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
      assert.equal(chat.slice(n).filter(x => x.flags?.["lakour-mj-ia"]?.appelDesCharmes).length, 0);
    } finally { chat.length = avant; }
  },
  async "étape 6c : les compagnons comptent les nuits d'appel des charmés (le hook, le chat du MJ ; jamais un message de joueur)"(M) {
    const api = pacte();
    const recus = [];
    api.logique.savoirDuJoueur = o => { recus.push(o.charmesAppeles); return { moi: o.moi, camp: o.camp, allies: [], loups: [], innocents: [], soupcons: {}, utiles: [], menteurs: [] }; };
    api.logique.politiqueDeNuit = o => [o.candidats[0].id];
    M.jeu.reinitialiserPrive();
    const berthe = game.actors.get("v1");
    const vue = M.jeu.vueVeillees(berthe, { api, messages: [] });
    const decider = () => M.jeu.decisionParPolitique(api, berthe, vue, { type: "demande", id: `d${recus.length}`, invite: "Sauver ou empoisonner ?",
      candidats: [{ id: "v3", nom: "Denise" }], nombre: 1 }, "nuit", "g");
    const avant = chat.length;
    const appel = (tour, o = {}) => ({ content: "Les charmés, ouvrez les yeux…", author: { isGM: true }, flags: { "lakour-mj-ia": { ia: true, appelDesCharmes: { partie: "p1", tour } } }, ...o });
    try {
      await decider();
      assert.equal(recus.at(-1), 0, "personne n'a été appelé");
      chat.push(appel(1));
      await decider();
      assert.equal(recus.at(-1), 1, "l'appel du MJ IA, au chat");
      chat.push(appel(2, { author: { isGM: false } }), appel(3, { whisper: ["u1"] }));
      chat.push({ ...appel(4), flags: { "lakour-mj-ia": { appelDesCharmes: { partie: "autre", tour: 4 } } } });
      await decider();
      assert.equal(recus.at(-1), 1, "ni un message de joueur, ni un chuchotement, ni une autre partie");
      // Le hook du système (la nuit menée par la Table d'un MJ humain) : une nuit de plus ; la même nuit ne compte qu'une fois.
      api._etat.tour = 2;
      for (const f of reveils) f({ roleCle: "charmes", enCours: true });
      for (const f of reveils) f({ roleCle: "charmes", enCours: false });
      for (const f of reveils) f({ roleCle: "meute", enCours: true });
      await decider();
      assert.equal(recus.at(-1), 2, "le hook : une nuit de plus");
      api._etat.tour = 1;
      for (const f of reveils) f({ roleCle: "charmes", enCours: true });
      await decider();
      assert.equal(recus.at(-1), 2, "la nuit 1, déjà au chat");
      M.jeu.reinitialiserPrive();
      await decider();
      assert.equal(recus.at(-1), 1, "la mémoire oubliée avec la partie ; le chat reste");
    } finally { chat.length = avant; M.jeu.reinitialiserPrive(); }
  },
  "étape 6b : le jour de la victoire du Revenant et du Chasseur de primes (narrateur seul, compagnons) ; un système ancien : rien"(M) {
    const sauves = { v3: ROLES.v3, v4: ROLES.v4 };
    const chasseur = role("Chasseur de primes", "chasseur-de-primes", "solitaire");
    chasseur.system.victoireCle = "cible-executee";
    ROLES.v3 = chasseur;
    ROLES.v4 = role("Revenant", "revenant", "solitaire");
    try {
      const api = pacte();
      api._etat.primes = { v3: "v0" };
      let lignes = M.contexte.etatPartieLoups(api).join("\n");
      assert.match(lignes, /Pour toi seul \(SECRET\) : la cible de Denise \(Chasseur de primes\) est Aubin ; elle doit tomber au vote au plus tard le jour 2/);
      assert.match(lignes, /Ernest \(Revenant\) ne gagne qu'exécuté au vote à partir du jour 3/);
      sansClesBrutes(lignes, "contexte (solitaires)");
      let fiche = M.jeu.vueVeillees(game.actors.get("v3"), { api, messages: [] }).fiche;
      assert.match(fiche, /Ta cible \(ton carnet\) doit tomber au vote du village au plus tard le jour 2 \(nous sommes au jour 1\)/);
      assert.match(M.jeu.vueVeillees(game.actors.get("v4"), { api, messages: [] }).fiche, /Ne te fais pas exécuter avant le jour 3/);
      // La prime échue (le système l'a fait villageois) : il joue pour le Village.
      api._etat.tour = 3;
      chasseur.system.camp = "village";
      lignes = M.contexte.etatPartieLoups(api).join("\n");
      assert.match(lignes, /la prime de Denise a échoué/);
      assert.doesNotMatch(lignes, /la cible de Denise/);
      fiche = M.jeu.vueVeillees(game.actors.get("v3"), { api, messages: [] }).fiche;
      assert.match(fiche, /Ta prime a échoué : tu n'es plus qu'un simple villageois/);
      assert.match(M.jeu.vueVeillees(game.actors.get("v4"), { api, messages: [] }).fiche, /Le jour 3 est venu/);
      const ancien = pacte({ ancien: true });
      ancien._etat.primes = { v3: "v0" };
      assert.doesNotMatch(M.contexte.etatPartieLoups(ancien).join("\n"), /SECRET\) : la cible|ne gagne qu'exécuté/);
      assert.doesNotMatch(M.jeu.vueVeillees(game.actors.get("v4"), { api: ancien, messages: [] }).fiche, /Ne te fais pas exécuter/);
    } finally { Object.assign(ROLES, sauves); }
  }
};

async function batterie(M) {
  const echecs = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { echecs.push(`${nom} : ${e.message}`); }
  }
  return echecs;
}

async function modules(mute = {}) {
  const dossiers = [];
  const M = {};
  for (const [cle, fichier] of [["outils", "outils.js"], ["contexte", "contexte.js"], ["pilote", "pilote.js"], ["jeu", "compagnons-jeu.js"],
    ["compagnons", "compagnons.js"], ["pacte", "veillees-pacte.js"]]) {
    const r = await charger(fichier, mute[fichier] ?? null);
    M[cle] = r.X;
    if (r.dossier) dossiers.push(r.dossier);
  }
  return { M, dossiers };
}

test("Le Pacte (MJ IA) : les scripts d'origine passent toute la batterie", async () => {
  const { M } = await modules();
  assert.deepEqual(await batterie(M), []);
});

const MUTATIONS = [
  ["outils.js", "const parLeSysteme = typeof api.reveiller === \"function\" && typeof api.proiesDeLaNuit === \"function\";", "const parLeSysteme = false;", "loups_nuit : le système ne réveille plus"],
  ["outils.js", "    const entree = api.ordreDeNuit().find(e => !faites.has(e.roleCle));", "    const entree = null;", "loups_nuit : l'ordre non relu"],
  ["outils.js", "      await attendreSur(api, \"attendreGazette\");\n", "", "loups_nuit : la Gazette non attendue"],
  ["outils.js", "      if (api.etat().vote?.ouvert) return { erreur: true, contenu: \"Un vote est encore ouvert", "      if (false) return { erreur: true, contenu: \"Un vote est encore ouvert", "loups_nuit : un vote ouvert fermé par la nuit"],
  ["outils.js", "      const voteOuvert = !vainqueur && apres.vote?.ouvert;", "      const voteOuvert = false;", "loups_nuit : le vote du matin ignoré"],
  ["outils.js", "      const gestes = typeof api.derniersGestes === \"function\";", "      const gestes = false;", "loups_nuit : la Braconnière à qui l'on demande"],
  ["outils.js", "  if (effet === \"chaparder\") return", "  if (false) return", "loups_nuit : le Chapardeur raconté comme un choix de joueur"],
  ["outils.js", "      if (!morts.includes(id) && game.actors.get(id)?.system.vivant) lignes.push(graceDuCondamne(api, id));", "", "loups_eliminer : la grâce tue"],
  ["outils.js", "  if (devouement) {", "  if (false) {", "loups_eliminer : la Chambrière ignorée"],
  ["outils.js", "  if (acteur?.system?.revele) return", "  if (true) return", "loups_eliminer : toute carte révélée"],
  ["outils.js", "      if (!vainqueur && api.etat().vote?.ouvert) {", "      if (false) {", "loups_eliminer : le second vote tu"],
  ["outils.js", "      return g.demande ? `${g.nom} choisit lui-même qui il emporte", "      return false ? `${g.nom} choisit lui-même qui il emporte", "loups_eliminer : on demande à la Braconnière"],
  ["outils.js", "      if (ouvertAvant?.ouvert) {", "      if (false) {", "loups_vote : un vote rouvert"],
  ["outils.js", "appelSur(api.logique, \"voteEmpeche\", api.etat()) === true", "false", "loups_vote : la Crue ouvre quand même"],
  ["outils.js", "          return { erreur: true, contenu: `Vote refusé : ${e.message} S'il n'y a pas", "          throw e; return { erreur: true, contenu: `Vote refusé : ${e.message} S'il n'y a pas", "loups_vote : l'erreur remonte"],
  ["outils.js", "  if (v.chaine) {", "  if (false) {", "loups_vote : la Chaîne tue"],
  ["outils.js", "  if (v.bailliDabord?.acteurId) {", "  if (false) {", "loups_vote : le Bailli des Vendanges tu"],
  ["outils.js", "  if (p?.votants?.ids?.length && Number(p.votants.tour) === Number(e.tour)) {\n    notes.push(", "  if (false) {\n    notes.push(", "loups_vote : les votants tus"],
  ["outils.js", "  if (cabaret) notes.push(", "  if (false) notes.push(", "loups_vote : le Cabaretier tu"],
  ["outils.js", "      if (deja?.ouvert && deja.mode === \"suite\") {", "      if (false) {", "loups_vote : la suite close trop tôt"],
  ["outils.js", "      if (r.objet === \"executeur\") {", "      if (false) {", "loups_vote : l'Exécuteur pris pour une exécution"],
  ["outils.js", "        if (sujet === \"chatiment\" && ids.length !== 1)", "        if (false)", "loups_vote : le Châtiment sans accusé"],
  ["outils.js", "        if (p.pouvoir === \"greffier-begue\") {", "        if (false) {", "loups_jour : le signe annoncé"],
  ["outils.js", "p.ciblesMin && p.ciblesMin < p.cibles ?", "false ?", "loups_jour : le Régent désigne toujours 2"],
  ["outils.js", "        if (p.pouvoir === \"echoppe\") {", "        if (false) {", "loups_jour : le rasoir à exécuter de nouveau"],
  ["outils.js", "...(loupsEnPlus > 0 ? { loupsEnPlus } : {})", "...{}", "les Vendanges sans loup de plus"],
  ["outils.js", "...(village ? { village: true } : {})", "...{}", "le générateur sans le Village"],
  ["outils.js", "      const avecMetiers = reglageLoups(\"metiersEnJeu\") !== false && (compo.niveau ?? niveau) !== \"le-pacte\";", "      const avecMetiers = true;", "le Pacte avec des métiers"],
  ["outils.js", "      const cles = avecCentre ? compo.roles.slice(0, total + 2) : rolesPour(compo, total);", "      const cles = rolesPour(compo, total);", "le centre du Chapardeur perdu"],
  ["outils.js", "      } else if (choix.doubleVisage && typeof api.logique?.paquetDoubleVisage === \"function\") {", "      } else if (false) {", "Double visage composé par le MJ IA"],
  ["outils.js", "          if (i >= 0) compo = { ...compo, roles: compo.roles.map((c, k) => (k === i ? \"loup-de-brumecombe\" : c)) };", "", "les Vendanges : une composition prête sans loup de plus"],
  ["outils.js", "        ...(laGazette && !compo.autel ? { gazette: laGazette } : {})", "...{}", "la Gazette non transmise"],
  ["outils.js", "...(voulues ? { variantes: voulues } : {}), ...(laGazette ? { gazette: laGazette } : {}) });", "});", "loups_rejouer : les variantes perdues"],
  ["outils.js", "        + (miseEnPlace.length ? `\\n${miseEnPlace.join(\"\\n\")}` : \"\")\n        + (absents.length || nommesHorsLigne.length", "        + (absents.length || nommesHorsLigne.length",
    "la mise en place tue au narrateur"],
  ["veillees-pacte.js", "  if (s?.centre?.length) lignes.push(", "  if (false) lignes.push(", "le centre du Chapardeur tu"],
  ["veillees-pacte.js", "  if (a.commenceParLeJour) {", "  if (false) {", "le Feu follet oublié"],
  ["veillees-pacte.js", "    const x = voulues && cle in voulues ? voulues[cle] : lire(reglage);", "    const x = lire(reglage);", "le choix des variantes ignoré"],
  ["veillees-pacte.js", "  if (l.includes(\"aucune\")) return v;", "", "« aucune » ignoré"],
  ["contexte.js", "  lignes.push(...etatPacteLoups(api, e, nom));", "", "narrateur : le Pacte tu"],
  ["contexte.js", "const centre = Number(e.tour) < 1 && !e.vainqueur ?", "const centre = !e.vainqueur ?", "narrateur : le centre redit chaque jour"],
  ["pilote.js", "  if (api.etat().phase === \"aube\" && !api.etat().vote?.ouvert) await api.changerPhase(\"jour\");", "  if (api.etat().phase === \"aube\") await api.changerPhase(\"jour\");", "pilote : le vote du matin fermé"],
  ["pilote.js", "  try { await api.attendreGazette?.(); } catch { /* sans Gazette */ }", "", "pilote : la Gazette non attendue"],
  ["compagnons-jeu.js", "  if (OBJETS_DU_PACTE.includes(demande.objet)) return demande.objet;", "", "compagnons : demandes du Pacte sans sujet"],
  ["compagnons-jeu.js", "  if (demande.type === \"vote\" && demande.mode === \"defiance\") return \"defiance\";", "", "compagnons : la Défiance votée comme un vote"],
  ["compagnons-jeu.js", "    case \"marche\": return `Jour ${tour} :", "    case \"marche_\": return `Jour ${tour} :", "compagnons : note du marché"],
  ["compagnons-jeu.js", "  if (sienne && String(invite).includes(sienne)) return role?.system?.effet ?? \"\";", "", "politique : l'effet de son rôle oublié"],
  ["compagnons-jeu.js", "  if (vue.camp === \"meute\") return \"tuer\";", "", "politique : un loup qui ne chasse pas"],
  ["compagnons-jeu.js", "const objet = sujet === \"bailli\" || sujet === \"vote-executeur\" ? \"bailli\" :", "const objet = sujet === \"bailli\" ? \"bailli\" :", "politique : l'Exécuteur voté comme une exécution"],
  ["compagnons-jeu.js", "  const adresse = adresseDe(vue.personnalite, vue.id);\n  const h = hasard(`politique|", "  const adresse = 0.7;\n  const h = hasard(`politique|", "politique : l'adresse sans tempérament"],
  ["compagnons-jeu.js", "  if (L.POLITIQUES_DES_GESTES?.[sujet]) {", "  if (false) {", "politique : les gestes au repli"],
  ["compagnons-jeu.js", "    roleCle: role?.system?.cle ?? \"\", effet: role?.system?.effet ?? \"\", camp: camp || \"\",", "", "vue : ni clé ni effet"],
  ["compagnons-jeu.js", "      + (perso.personnalite === \"cabaretier\" ? \" Ton vote est annoncé à tous", "      + (false ? \" Ton vote est annoncé à tous", "vue : le Cabaretier l'ignore"],
  ["compagnons-jeu.js", "  if (role?.system?.envoute) fiche.push(", "  if (false) fiche.push(", "vue : l'envoûté se croit armé"],
  ["compagnons-jeu.js", "    ...pacte.scene,\n", "", "vue : le public du Pacte tu"],
  ["compagnons-jeu.js", "scene.push(`Cartes posées face visible au milieu de la table (une nuit, quelqu'un pourra jouer l'une d'elles) : ", "scene.push(`Cartes du Bateleur, face visible : ", "vue : le Bateleur nommé"],
  ["compagnons-jeu.js", "scene.push(`Le village est partagé en deux bords (annoncé) : ", "scene.push(`Les deux groupes de l'Illuminé : ", "vue : l'Illuminé nommé"],
  ["compagnons.js", "    case \"marche\": return { cibles: soi && h() < 0.35 ? [soi.id] : [] };", "    case \"marche\": return { cibles: soi ? [soi.id] : [] };", "repli : le marché toujours accepté"],
  ["compagnons.js", "    case \"crieur-annonce\": return { cibles: candidats.length && h() < 0.5 ? un(candidats) : [] };", "    case \"crieur-annonce\": return { cibles: un(candidats) };", "repli : le Crieur lit toujours"],
  ["compagnons.js", "    case \"defiance\": return { cibles: melanger(", "    case \"defiance_\": return { cibles: melanger(", "repli : la Défiance à une voix"],
  ["compagnons.js", "    if (vue.effet === \"choisir-camp\") return", "    if (false) return", "repli : le Mâtin rejoint toujours la meute"],
  ["compagnons.js", "        if (v && Array.isArray(v.cibles)) {", "        if (false) {", "cerveau : la politique ignorée"],
  ["compagnons-jeu.js", "      if (sansModele && c.vue.jeu === \"loups\") c.vue.annonce = await annonceDuCompagnon(", "      if (false) c.vue.annonce = await annonceDuCompagnon(", "débat : le compagnon tait ce qu'il sait"],
  ["compagnons-jeu.js", "r.texte.includes(c.vue.annonce.nom)) retenirAnnonce(", "r.texte.includes(c.vue.annonce.nom)) void (", "débat : l'annonce oubliée"],
  ["compagnons-jeu.js", "  if (pouvoirsTentes.has(cle)) return null;", "", "jour : un pouvoir à chaque réplique"],
  ["compagnons-jeu.js", "  prive = null;\n  oublierLesPolitiques();", "  prive = null;", "mémoire remise à zéro : les politiques gardées"],
  ["compagnons.js", "  if (vue.jeu === \"loups\" && vue.annonce?.nom) return", "  if (false) return", "repli : l'annonce jamais dite"],
  ["compagnons.js", "export const ADRESSE_DES_TEMPERAMENTS = { prudent: 0.9,", "export const ADRESSE_DES_TEMPERAMENTS = { prudent: 0.5,", "adresse : le prudent pas plus adroit"],
  // Étapes 6b et 6c.
  ["veillees-pacte.js", "    else if (x === \"allegeance-loup\") v.allegeanceLoup = true;\n", "", "6c : la carte de plus non demandable"],
  ["veillees-pacte.js", "  if (!v.doubleVisage) v.allegeanceLoup = false;\n  return v;", "  return v;", "6c : la carte de plus sans Double visage"],
  ["veillees-pacte.js", "  v.allegeanceLoup = Boolean(v.doubleVisage && v.allegeanceLoup && connaitLAllegeance(logique));", "  v.allegeanceLoup = Boolean(v.allegeanceLoup);", "6c : la carte de plus d'un système qui l'ignore"],
  ["veillees-pacte.js", "      p.allegeanceLoup = Boolean(p.doubleVisage && p.allegeanceLoup);\n", "", "6c : la carte de plus gardée quand Double visage tombe"],
  ["veillees-pacte.js", "doubleVisage: \"doubleVisage\", allegeanceLoup: \"allegeanceLoupEnPlus\",", "doubleVisage: \"doubleVisage\",", "6c : le réglage du monde ignoré"],
  ["veillees-pacte.js", "  return mode === \"grande\" ? n >= 12 : mode === \"petite\" ? n >= 16 || n === 13 : false;", "  return mode === \"grande\" ? n >= 10 : mode === \"petite\" ? n >= 14 : false;", "6c : le conseil de l'étape 6b"],
  ["veillees-pacte.js", "    + `${v.allegeanceLoup ? \", une allégeance loup de plus\" : \"\"})`);", "    + \")\");", "6c : la carte de plus non annoncée"],
  ["outils.js", "          + `loups_distribuer en mode « auto », avec les mêmes variantes.${conseil ? `\\n${conseil}` : \"\"}` };", "          + \"loups_distribuer en mode « auto ».\" };", "6c : le conseil tu à la composition"],
  ["outils.js", "        + (allegeance ? `${allegeance}\\n` : \"\")\n", "", "6c : la carte de plus hors de sa taille, tue"],
  ["veillees-pacte.js", "  if (moins <= 0) return \"\";\n", "  return \"\";\n", "6c : le loup de moins des débutants tu"],
  ["outils.js", "    const appeles = roleCle === \"charmes\" ? await appelerLesCharmes(api) : false;", "    const appeles = false;", "6c : les charmés appelés en silence"],
  ["outils.js", "      flags: { [ID]: { ia: true, narration: true, final: true, [APPEL_DES_CHARMES]:", "      whisper: [\"mj\"], flags: { [ID]: { ia: true, narration: true, final: true, [APPEL_DES_CHARMES]:", "6c : l'appel chuchoté"],
  ["veillees-pacte.js", "    if (!f || m.whisper?.length || !ecritParUnMJ(m)) continue;", "    if (!f) continue;", "6c : un joueur fait croire à un appel"],
  ["veillees-pacte.js", "    if (partie && f.partie && String(f.partie) !== String(partie)) continue;\n", "", "6c : les appels d'une autre partie comptés"],
  ["compagnons-jeu.js", " charmesAppeles: charmesAppeles(),", "", "6c : les compagnons sourds à l'appel"],
  ["compagnons-jeu.js", "try { globalThis.Hooks?.on?.(\"lakourLoups.reveil\", noterUnReveil); } catch { /* hors Foundry */ }", "", "6c : le hook du système ignoré"],
  ["compagnons-jeu.js", "  appelsDesCharmes.clear();\n", "", "6c : les appels d'avant gardés"],
  ["veillees-pacte.js", "  lignes.push(...reglesDesSolitaires(api, e, nom));\n", "", "6b : le narrateur ignore le jour des solitaires"],
  ["veillees-pacte.js", "      if (camp === \"solitaire\" && cible && Number(e.tour) <= jours.prime) {", "      if (cible) {", "6b : la prime échue redite"],
  ["compagnons-jeu.js", "  fiche.push(...jourDeSaVictoire(api, acteur, pub, role));\n", "", "6b : les compagnons ignorent le jour de leur victoire"],
  ["compagnons-jeu.js", "    if (camp === \"village\") return [\"Ta prime a échoué", "    if (false) return [\"Ta prime a échoué", "6b : le chasseur échu se croit solitaire"]
];

test("Le Pacte (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    const { M, dossiers } = await modules({ [fichier]: [avant, apres] });
    try { if (!(await batterie(M)).length) passees.push(`${regle} (${fichier})`); }
    finally { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
