// Le lot 0.7.0 des Veillées côté MJ IA (Dernier souffle, Almanach des brumes, Somnambule, Rosière, Saints du calendrier), sur une
// doublure de l'API du système (game.lakourLoups) : état du jeu du narrateur (présage, Glas, souffles ; Somnambules et Bonne étoile
// en secret), vue et résolveur des compagnons (voix du Dernier souffle), outils (Glas à la distribution, loups_calendrier, souffles
// au dépouillement, nuit refusée après le Glas, chaque porteur d'un rôle réveillé), pilote (dénouement au Glas), consignes.
// Tout reste défensif : un système plus ancien (sans ces fonctions) marche comme avant.
// Chaque règle est cassée à son tour dans une copie du script : la batterie doit alors échouer.  Lancer : npm run essais
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
const { PERSONNALITES_DE_BASE } = await import("../scripts/personnalites.js");
const reglages = {
  fournisseur: "factice", autonomie: "autonome", miseEnPlace: false, voix: "aucune", delaiReponse: 0, budgetSeance: 0, pilote: true, piloteDelai: 0,
  piloteEtapes: 60, bavardageCompagnons: "normal", modeleCompagnons: "", personnaliteActive: PERSONNALITES_DE_BASE[0].id, personnalites: PERSONNALITES_DE_BASE,
  compagnonsPrive: {}, mouvementsBloques: {}, historiqueLoups: [], modeleAnthropic: "claude-opus-5-5",
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const chat = [];
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: null };
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
  utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => Math.random().toString(36).slice(2), getRoute: r => r }
};
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...structuredClone(d) }; chat.push(m); return m; } } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["u1", joueur]]), actors: new Collection(), messages: { get contents() { return chat; } },
  system: { id: "lakour-loups", title: "Les Veillées", version: "0.7.0" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), journal: [], paused: false, packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
async function charger(fichier, mutation = null) {
  if (!mutation) return { X: await import(`../scripts/${fichier}`), dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-calendrier-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], mutation[1]);
  writeFileSync(join(dossier, fichier), texte);
  return { X: await import(pathToFileURL(join(dossier, fichier)).href), dossier };
}

// ------------------------------------------------------------------ une partie des Veillées 0.7.0 (doublure de l'API)
// etat : ce qui s'ajoute à l'état ; ancien : un système d'avant 0.7.0 ; somnambules : ce que rend api.somnambules() ;
// presage : ce que rend api.presage() ; ordre : ce que rend api.ordreDeNuit() ; glasALaNuit : changerPhase("nuit") déclare la victoire.
function veillees({ phase = "jour", etat: plus = {}, ancien = false, somnambules = [], presage = null, ordre = [], glasALaNuit = false, resultat = null, etape = "" } = {}) {
  game.actors = new Collection();
  reglages.compagnonsPrive = {};
  const roles = [["Aubin", "u1", "village", true], ["Berthe", "", "village", true], ["Colin", "", "meute", true], ["Désiré", "", "village", false], ["Ernest", "", "village", false]];
  for (const [i, [nom, j, camp, vivant]] of roles.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant, camp, maison: "" },
      items: [{ type: "role", name: camp === "meute" ? "Loup de Brumecombe" : "Liseuse de cendres", system: { camp, nuit: { cibles: 1 } } }], update: async () => a };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour: 2, vainqueur: "", vote: { ouvert: false }, morts: [{ acteurId: "v3", cause: "nuit", tour: 1 }, { acteurId: "v4", cause: "vote", tour: 1 }],
    historique: [], ...(ancien ? {} : { souffle: { actif: true, utilises: ["v4"] } }), ...plus };
  const api = {
    appels: { demanderAction: [], noterAction: [], changerPhase: [], etoile: [], glas: [], nouvellePartie: [], verifierVictoire: [] },
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    carnet: () => [],
    logique: { etatPublic: e => structuredClone(e) },
    async changerPhase(p) {
      api.appels.changerPhase.push(p);
      if (p === "nuit" && glasALaNuit) { etat.vainqueur = "meute"; etat.phase = "fin"; return; }
      etat.phase = p;
    },
    ordreDeNuit: () => ordre,
    candidatsDeNuit: ({ acteurId }) => api.villageois().filter(a => a.system.vivant && a.id !== acteurId).map(a => a.id),
    async demanderAction(d) { api.appels.demanderAction.push(d.acteurId); return [d.candidats[0]]; },
    async demanderActionMeute(d) { return [d.candidats[0]]; },
    async noterAction(a) { api.appels.noterAction.push(a); },
    async resoudreNuit() { return { morts: [], messages: [], annonces: [] }; },
    async verifierVictoire(o) { api.appels.verifierVictoire.push(o ?? {}); if (o?.finDuJour && etat.glas && etat.tour >= etat.glas) { etat.vainqueur = "meute"; etat.phase = "fin"; } return etat.vainqueur; },
    async cloreVote() { etat.vote = { ouvert: false, resultat }; return structuredClone(resultat); },
    async nouvellePartie(args) { api.appels.nouvellePartie.push(args); return { partie: "p2", joueurs: [], compagnons: [], composition: { cle: "x", libelle: "x", roles: ["villageois"], batiments: [] } }; }
  };
  if (!ancien) {
    Object.assign(api, {
      presage: () => structuredClone(presage ?? { actif: true, cle: "", tour: 0, nom: "", effet: "" }),
      somnambules: () => { if (somnambules === "erreur") throw new Error("Réservé au MJ actif."); return structuredClone(somnambules); },
      peutSouffler: id => ({ ok: true, aSonSouffle: !game.actors.get(id).system.vivant && !(etat.souffle?.utilises ?? []).includes(id) }),
      async bonneEtoile(id) { if (etat.tour > 1) throw new Error("Trop tard : la première nuit est passée."); api.appels.etoile.push(id); etat.bonneEtoile = id; return id; },
      async glasFinal(n) { api.appels.glas.push(n); etat.glas = n; return n; },
      etapeSuivante: () => ({ cle: etape || "debat" })
    });
  }
  game.lakourLoups = api;
  return api;
}
const FOIRE = { actif: true, cle: "foire", tour: 2, nom: "Jour de foire", effet: "Le vote se fait à main levée." };

// ------------------------------------------------------------------ la batterie
const O = (M, n) => M.outils.OUTILS.find(o => o.nom === n);
const VERIFICATIONS = {
  async "narrateur : présage, Glas, souffles gardés ; Somnambules et Bonne étoile en secret"(M) {
    let api = veillees({ presage: FOIRE, etat: { glas: 3, tour: 1, bonneEtoile: "v0" }, somnambules: [{ acteurId: "v1", nom: "Berthe", croit: "liseuse", croitNom: "Liseuse de cendres", devoile: false }] });
    let t = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(t, /Présage de l'Almanach \(public, déjà annoncé par le système\) : Jour de foire — Le vote se fait à main levée\. Raconte-le à l'aube/);
    assert.match(t, /Glas final \(public\) : la partie s'arrête au soir du jour 3 \(aujourd'hui : jour 1\)/);
    assert.match(t, /Dernier souffle : Désiré garde encore sa voix/);
    assert.doesNotMatch(t, /Ernest garde/, "un souffle donné ne revient pas");
    assert.match(t, /Somnambules — SECRET ABSOLU : Berthe croit être Liseuse de cendres\. Ne le trahis jamais/);
    assert.match(t, /laisse-les l'être/);
    assert.match(t, /Bonne étoile — SECRET : Aubin est protégé la première nuit/);
    api = veillees({ etat: { bonneEtoile: "v0", tour: 2 }, somnambules: [{ acteurId: "v1", nom: "Berthe", croit: "liseuse", croitNom: "Liseuse", devoile: true }] });
    t = M.contexte.etatPartieLoups(api).join("\n");
    assert.doesNotMatch(t, /Bonne étoile|Somnambules|Présage|Glas/, "après la première nuit, un somnambule dévoilé, sans présage ni glas : rien");
    api = veillees({ etat: { vainqueur: "meute", phase: "fin", glas: 2 }, somnambules: [{ acteurId: "v1", nom: "Berthe", croit: "x", devoile: false }], presage: FOIRE });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Somnambules|Glas final|Dernier souffle|Présage/, "partie finie : rien de tout cela");
  },

  async "narrateur : défensif (système d'avant 0.7.0, Somnambules réservés au MJ actif)"(M) {
    let api = veillees({ ancien: true });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Présage|Glas|souffle|Somnambule|étoile/);
    api = veillees({ somnambules: "erreur" });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Somnambule/);
  },

  async "compagnons : un mort qui garde son souffle vote encore une fois ; présage du jour"(M) {
    veillees({ presage: FOIRE });
    const C = new M.jeu.Compagnons({ graine: "souffle" });
    const desire = C.vue(game.actors.get("v3"));
    assert.match(desire.fiche, /tu gardes ton Dernier souffle : une seule voix, au vote d'exécution/);
    assert.doesNotMatch(desire.fiche, /tu ne votes plus/);
    assert.match(C.vue(game.actors.get("v4")).fiche, /Tu es MORT : tu te tais et tu ne votes plus\./, "souffle donné");
    assert.match(C.vue(game.actors.get("v1")).scene, /Présage du jour \(Almanach des brumes\) : Jour de foire — Le vote se fait à main levée\./);
    veillees({ ancien: true });
    assert.match(new M.jeu.Compagnons({ graine: "x" }).vue(game.actors.get("v3")).fiche, /tu ne votes plus/);
  },

  async "résolveur : un vote du Dernier souffle, voix précieuse, note privée juste ; sans IA, gardée"(M) {
    veillees();
    const C = new M.jeu.Compagnons({ graine: "souffle" });
    const vues = [];
    C.cerveaux.decider = async (vue, d) => { vues.push(d); return { cibles: d.candidats.slice(0, 1).map(c => c.id) }; };
    await C.resoudreLoups({ type: "vote", id: "s", acteurId: "v3", invite: "Qui exécuter ?", candidats: [{ id: "v2", nom: "Colin" }], nombre: 1, souffle: true });
    assert.equal(vues[0].objet, "souffle");
    assert.equal(vues[0].vote, true);
    assert.match(vues[0].invite, /tu gardes ton Dernier souffle : une seule voix, pour ce vote d'exécution/);
    assert.match(vues[0].invite, /ne la donne que si ce vote est décisif/);
    assert.match(M.jeu.privesDe("v3")[0], /^Dernier souffle, tour 2 : tu as donné ta dernière voix contre Colin/);
    assert.equal(M.jeu.notePriveeLoups("souffle", 3, []), "Dernier souffle, tour 3 : tu as gardé ton souffle pour un autre jour.");
    const r = M.compagnons.repliDecision({ id: "v3", allies: [], suspects: [] }, { type: "cibles", objet: "souffle", vote: true, candidats: [{ id: "v2", nom: "Colin" }], nombre: 1 }, "g");
    assert.deepEqual(r.cibles, [], "sans suspect, le souffle est gardé");
  },

  async "outils : Glas à la (re)distribution, loups_calendrier, souffles au dépouillement"(M) {
    let api = veillees({ phase: "fin" });
    await O(M, "loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "", glas: 4 });
    assert.equal(api.appels.nouvellePartie[0].glas, 4);
    await O(M, "loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "", glas: 0 });
    assert.ok(!("glas" in api.appels.nouvellePartie[1]), "0 : pas de glas");
    assert.ok(O(M, "loups_distribuer").schema.properties.glas, "loups_distribuer accepte le glas");
    assert.match(O(M, "loups_distribuer").description, /Le Somnambule et la Rosière ne sortent jamais d'un tirage : seulement si on les demande/);
    game.modules.get("lakour-mj-ia").api = {};
    api = veillees({ etat: { tour: 1 } });
    const cal = O(M, "loups_calendrier");
    assert.match((await cal.executer({ action: "etoile", villageois: "Aubin", jour: 0 })).contenu, /Bonne étoile \(secret\) : Aubin/);
    assert.deepEqual(api.appels.etoile, ["v0"]);
    assert.match((await cal.executer({ action: "glas", villageois: "", jour: 3 })).contenu, /jour 3/);
    assert.deepEqual(api.appels.glas, [3]);
    api = veillees({ etat: { tour: 2 } });
    assert.ok((await cal.executer({ action: "etoile", villageois: "Aubin", jour: 0 })).erreur, "après la première nuit : refusé, avec la raison");
    veillees({ ancien: true });
    assert.ok((await cal.executer({ action: "glas", villageois: "", jour: 3 })).erreur);
    veillees({ resultat: { objet: "execution", decompte: { v2: 3 }, elus: ["v2"], elu: "v2", souffles: ["v3"] } });
    const r = await O(M, "loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false, objet: "execution" });
    assert.match(r.contenu, /Dernier souffle : Désiré ont donné leur dernière voix/);
  },

  async "loups_nuit : jamais après la fin ; le Glas qui sonne au soir ; chaque porteur d'un rôle réveillé"(M) {
    const nuit = O(M, "loups_nuit");
    let api = veillees({ etat: { vainqueur: "meute", phase: "fin" } });
    let r = await nuit.executer({ delai_secondes: 30, peste_victime: "" });
    assert.ok(r.erreur);
    assert.deepEqual(api.appels.changerPhase, [], "rien ne bouge");
    api = veillees({ glasALaNuit: true });
    r = await nuit.executer({ delai_secondes: 30, peste_victime: "" });
    assert.match(r.contenu, /Le Glas final a sonné : la partie s'arrête ce soir, sans nuit\. VICTOIRE : meute/);
    assert.deepEqual(api.appels.demanderAction, [], "personne n'est réveillé");
    api = veillees({ ordre: [{ roleCle: "liseuse-de-cendres", acteurIds: ["v0", "v1"] }] });
    r = await nuit.executer({ delai_secondes: 30, peste_victime: "" });
    assert.deepEqual(api.appels.demanderAction, ["v0", "v1"], "le vrai porteur et le Somnambule");
    assert.deepEqual(api.appels.noterAction.map(a => a.acteurId), ["v0", "v1"]);
    assert.match(r.contenu, /2 porteurs/);
  },

  async "pilote : le Glas atteint ou la victoire vue par le système mènent au dénouement, qui le dit"(M) {
    const P = M.pilote;
    const m = { aube: true, debats: 2, voteFait: true };
    assert.equal(P.prochaineEtapeLoups({ phase: "vote", tour: 3, glas: 3, vote: { ouvert: false } }, m), "denouement", "après le vote du jour du glas");
    assert.equal(P.prochaineEtapeLoups({ phase: "vote", tour: 2, glas: 3, vote: { ouvert: false } }, m), "nuit");
    assert.equal(P.prochaineEtapeLoups({ phase: "jour", tour: 2, vote: { ouvert: false } }, { ...m, voteFait: false }, { victoire: true }), "denouement");
    assert.equal(P.prochaineEtapeLoups({ phase: "vote", tour: 3, glas: 3, vote: { ouvert: false } }, { ...m, denouement: true }), null, "un seul dénouement");
    assert.match(P.libelleVainqueurPilote("meute", id => id, false, 3), /le camp « meute » — le Glas final a sonné au soir du jour 3/);
    assert.equal(P.libelleVainqueurPilote("meute"), "le camp « meute »");
    // En marche : le système voit la victoire (le Glas, sans vote) ; le pilote la fait trancher et raconter.
    const api = veillees({ etat: { glas: 2 }, etape: "victoire" });
    for (const a of game.actors.contents) { a.system.joueur = ""; a.system.compagnon = true; }
    const vues = [];
    const moteur = { actif: true, auRepos: () => true, budgetDepasse: () => false, compagnons: { maxRepliques: () => 0 } };
    const p = new P.PiloteAutomatique({ moteur, horloge: { maintenant: () => 0, attendre: async () => {} }, aviser: () => {}, etatDuJeu: () => "" });
    moteur.tour = async texte => { vues.push(texte); p.arreter("manuel"); };
    p.demarrer();
    await p.boucle;
    assert.ok(api.appels.verifierVictoire.some(o => o.finDuJour), "victoire tranchée au soir");
    assert.match(vues.join("\n"), /Étape : le dénouement\. .*victoire : le camp « meute » — le Glas final a sonné au soir du jour 2/);
  },

  async "compagnons : aucun rôle caché, pas même pour un mort qui garde son souffle (ni après, contrairement aux morts humains)"(M) {
    veillees();
    const C = new M.jeu.Compagnons({ graine: "roles" });
    reglages.mortsVoientTout = true;
    for (const id of ["v3", "v4", "v1"]) assert.doesNotMatch(C.vue(game.actors.get(id)).scene, /Loup de Brumecombe/, `${id} : aucun rôle caché`);
    game.actors.get("v2").system.revele = true;
    assert.match(C.vue(game.actors.get("v3")).scene, /Colin — vivant, rôle révélé : Loup de Brumecombe/, "un rôle révélé se voit");
    delete reglages.mortsVoientTout;
  },

  async "historique des compositions : la partie en cours reste chez le MJ, l'historique ne la reçoit qu'à la fin"(M) {
    const H = M.historique;
    Object.assign(reglages, { historiqueLoups: [{ roles: ["a"], quand: 1 }], historiqueLoupsEnAttente: {}, historique: [{ roles: ["sys"], quand: 2 }] });
    await H.retenirComposition({ roles: ["somnambule", "rosiere"], batiments: ["puits"] });
    assert.equal(reglages.historiqueLoups.length, 1, "rien de publié pendant la partie");
    assert.deepEqual(reglages.historiqueLoupsEnAttente.roles, ["somnambule", "rosiere"]);
    await H.retenirComposition({ roles: ["b"] });
    assert.deepEqual(reglages.historiqueLoups.map(x => x.roles[0]), ["a", "somnambule"], "la partie abandonnée est consignée");
    assert.equal(await H.consignerComposition(), true);
    assert.equal(await H.consignerComposition(), false, "une seule fois");
    assert.deepEqual(reglages.historiqueLoups.map(x => x.roles[0]), ["a", "somnambule", "b"]);
    assert.deepEqual(H.historiqueDesParties().map(x => x.roles[0]).slice(0, 2), ["a", "sys"], "celles du système aussi, dans l'ordre");
    Object.assign(reglages, { historiqueLoups: [], historiqueLoupsEnAttente: {} });
    delete reglages.historique;
  },

  async "consignes : présage à l'aube, Rosière jamais confirmée, Somnambule jamais trahi, Glas au dénouement"(M) {
    const c = M.adaptateurs.adaptateur().consignes;
    assert.match(c, /raconte-le à l'aube en une image, sans le recopier/);
    assert.match(c, /Un joueur qui se dit Rosière \(ou tout autre rôle\) n'est jamais confirmé par toi/);
    assert.match(c, /Un Somnambule croit tenir un rôle qu'il n'a pas : ne le trahis jamais/);
    assert.match(c, /ton dénouement dit que le glas a mis fin à la veillée/);
    assert.match(c, /ne nomme un villageois que pour le désigner/);
    veillees();
    assert.match(M.compagnons.consigneSysteme(new M.jeu.Compagnons({ graine: "x" }).vue(game.actors.get("v1"))), /un mort garde son Dernier souffle \(une seule voix, au vote d'exécution\)/);
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
    ["compagnons", "compagnons.js"], ["adaptateurs", "adaptateurs.js"], ["historique", "historique-loups.js"]]) {
    const r = await charger(fichier, mute[fichier] ?? null);
    M[cle] = r.X;
    if (r.dossier) dossiers.push(r.dossier);
  }
  return { M, dossiers };
}

test("lot 0.7.0 des Veillées (MJ IA) : les scripts d'origine passent toute la batterie", async () => {
  const { M } = await modules();
  assert.deepEqual(await batterie(M), []);
});

const MUTATIONS = [
  ["contexte.js", "  if (p?.cle && !e.vainqueur) {", "  if (false) {", "narrateur : le présage"],
  ["contexte.js", "  if (Number(e.glas) > 0 && !e.vainqueur) {", "  if (false) {", "narrateur : le Glas"],
  ["contexte.js", ".filter(id => !utilises.has(id));", ";", "narrateur : souffles donnés comptés"],
  ["contexte.js", "  if (reveurs.length) {", "  if (false) {", "narrateur : les Somnambules"],
  ["contexte.js", "?.filter(s => !s.devoile) ?? [];", " ?? [];", "narrateur : Somnambule dévoilé encore secret"],
  ["contexte.js", "  if (e.vainqueur) return lignes;\n", "", "narrateur : secrets après la fin"],
  ["contexte.js", "  if (e.bonneEtoile && Number(e.tour) <= 1) {", "  if (e.bonneEtoile) {", "narrateur : Bonne étoile après la première nuit"],
  ["contexte.js", "const p = typeof api?.presage === \"function\" ? essayer(() => api.presage()) : null;", "const p = api.presage();", "narrateur : pas défensif"],
  ["compagnons-jeu.js", "    vivant ? \"\" : souffle ? ", "    vivant ? \"\" : false ? ", "compagnon : le Dernier souffle"],
  ["compagnons-jeu.js", "    presageDuJour(api),\n", "", "compagnon : le présage"],
  ["compagnons-jeu.js", "  if (demande.type === \"vote\" && demande.souffle) return \"souffle\";\n", "", "résolveur : le souffle"],
  ["compagnons-jeu.js", "    case \"souffle\": return `Dernier souffle", "    case \"souffle_\": return `Dernier souffle", "note privée du souffle"],
  ["compagnons.js", "  if (demande.objet === \"souffle\") {", "  if (false) {", "repli : le souffle gardé"],
  ["compagnons.js", "Selon la veillée, un mort garde son ", "Selon la veillée, un mort perd son ", "compagnons : la règle du souffle"],
  ["outils.js", "...(glas > 0 ? { glas: Math.floor(glas) } : {}) });", "});", "loups_rejouer : le Glas perdu"],
  ["outils.js", "      if (finie()) return { erreur: true, contenu: `La partie est finie", "      if (false) return { erreur: true, contenu: `La partie est finie", "loups_nuit après la fin"],
  ["outils.js", "      if (finie()) return { contenu: `Le Glas final a sonné", "      if (false) return { contenu: `Le Glas final a sonné", "loups_nuit : le Glas au soir"],
  ["outils.js", "        if (!meute && acteurIds.length > 1) {", "        if (false) {", "un seul porteur réveillé"],
  ["outils.js", "      const souffles = (r.souffles ?? []).length ?", "      const souffles = false ?", "souffles tus au dépouillement"],
  ["outils.js", "      try { await api.bonneEtoile(id); }", "      try { await null; }", "Bonne étoile jamais posée"],
  ["pilote.js", ": glasAtteint(etat) ? (m.denouement ? null : \"denouement\") : \"nuit\";", ": \"nuit\";", "pilote : une nuit après le Glas"],
  ["pilote.js", "  if (etat.vainqueur || etat.phase === \"fin\" || victoire) return", "  if (etat.vainqueur || etat.phase === \"fin\") return", "pilote : victoire du système ignorée"],
  ["pilote.js", "          try { await api.verifierVictoire?.({ finDuJour: true }); }", "          try { await null; }", "pilote : victoire jamais tranchée"],
  ["pilote.js", "glasAtteint(e) ? e.glas : 0)", "0)", "pilote : le Glas tu au dénouement"],
  ["adaptateurs.js", "n'est jamais confirmé par toi", "est confirmé si tu le sais", "narrateur : Rosière confirmée"],
  ["compagnons-jeu.js", "${a.system.revele && roleDe(a) ? `, rôle révélé", "${(a.system.revele || !vivant) && roleDe(a) ? `, rôle révélé", "compagnon mort : rôles cachés"],
  ["compagnons-jeu.js", "${a.system.revele && roleDe(a) ? `, rôle révélé", "${false && roleDe(a) ? `, rôle révélé", "compagnon : rôles révélés tus"],
  ["historique-loups.js", "    await consigner();\n    await ecrireAttente(", "    await ecrireAttente(", "partie abandonnée perdue"],
  ["historique-loups.js", "  await ecrireAttente({});\n", "", "consignée deux fois"],
  ["historique-loups.js", ", ...lire(\"lakour-loups\", \"historique\", [])]", "]", "historique du système ignoré"],
  ["adaptateurs.js", "Un Somnambule croit tenir un rôle qu'il n'a pas : ne le trahis jamais, ses visions sont fausses. ", "", "narrateur : Somnambule"]
];

test("lot 0.7.0 des Veillées (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    const { M, dossiers } = await modules({ [fichier]: [avant, apres] });
    try { if (!(await batterie(M)).length) passees.push(`${regle} (${fichier})`); }
    finally { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
