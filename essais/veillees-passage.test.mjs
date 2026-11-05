// Le lot 0.8.0 des Veillées côté MJ IA (Gens de passage, départ et exil, Banc des accusés, Glas du deuil, Nuit de la Saint-Martin),
// sur une doublure de l'API du système (game.lakourLoups) : état du jeu du narrateur (partis, gens de passage au camp tu, Banc, glas ;
// pouvoirs du deuil et autel en secret), vue et résolveur des compagnons (parti, arrivant, jugement, exil, « J'accuse … »), outils
// (loups_passage, loups_banc, exil et jugement par loups_vote, vision du deuil, Saint-Martin), pilote (juger jusqu'à la condamnation,
// nuit d'un banc vide, dénouement de la Saint-Martin), consignes. Défensif : un système plus ancien marche comme avant.
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
  system: { id: "lakour-loups", title: "Les Veillées", version: "0.8.0" }, world: { id: "monde", title: "Brumecombe" },
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  combats: { active: null }, scenes: { active: null }, i18n: { localize: k => k, format: k => k, has: () => false },
  modules: new Map([["lakour-mj-ia", { api: {} }]]), journal: [], paused: false, packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const SCRIPTS = pathToFileURL(fileURLToPath(new URL("../scripts/", import.meta.url))).href;
async function charger(fichier, mutation = null) {
  if (!mutation) return { X: await import(`../scripts/${fichier}`), dossier: null };
  const dossier = mkdtempSync(join(tmpdir(), "lakour-passage-"));
  let texte = readFileSync(fileURLToPath(new URL(`../scripts/${fichier}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/from "\.\//g, `from "${SCRIPTS}`);
  assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
  texte = texte.replace(mutation[0], mutation[1]);
  writeFileSync(join(dossier, fichier), texte);
  return { X: await import(pathToFileURL(join(dossier, fichier)).href), dossier };
}

// ------------------------------------------------------------------ une partie des Veillées 0.8.0 (doublure de l'API)
// etat : ce qui s'ajoute à l'état ; ancien : un système d'avant 0.8.0 ; banc, gens, deuil, pouvoirs, autel : ce que rendent les
// fonctions du même nom ; resultat : ce que rend cloreVote ; ordre : ordreDeNuit ; finALaNuit : changerPhase("nuit") finit la partie.
function veillees({ phase = "jour", etat: plus = {}, ancien = false, banc = null, gens = [], deuil = null, pouvoirs = null, autel = [], resultat = null,
  ordre = [], finALaNuit = "", etape = null } = {}) {
  game.actors = new Collection();
  reglages.compagnonsPrive = {};
  const roles = [["Aubin", "u1", "village", true], ["Berthe", "", "village", true], ["Colin", "", "meute", true], ["Désiré", "", "village", false],
    ["Firmin", "", "village", false], ["Gaspard", "", "meute", true]];
  for (const [i, [nom, j, camp, vivant]] of roles.entries()) {
    const a = { id: `v${i}`, name: nom, type: "villageois", flags: {}, system: { joueur: j, compagnon: !j, vivant, camp, maison: "" },
      items: [{ type: "role", name: i === 5 ? "Rémouleur" : camp === "meute" ? "Loup de Brumecombe" : "Liseuse de cendres",
        system: { camp: i === 5 ? "village" : camp, nuit: { cibles: 1 } } }],
      update: async u => { Object.assign(a, { _maj: u }); return a; } };
    game.actors.set(a.id, a);
  }
  const etat = { partie: "p1", phase, tour: 2, vainqueur: "", vote: { ouvert: false }, morts: [{ acteurId: "v3", cause: "nuit", tour: 1 }], historique: [],
    ...(ancien ? {} : { partis: [{ acteurId: "v4", tour: 2, comment: "exil" }] }), ...plus };
  const api = {
    appels: { changerPhase: [], ouvrirVote: [], accueillir: [], partir: [], accuser: [], reveiller: [], nouvellePartie: [], verifierVictoire: [] },
    etat: () => structuredClone(etat),
    villageois: () => game.actors.filter(a => a.type === "villageois"),
    carnet: () => [],
    logique: { etatPublic: e => structuredClone(e) },
    async changerPhase(p) {
      api.appels.changerPhase.push(p);
      if (p === "nuit" && finALaNuit) { etat.vainqueur = finALaNuit; etat.phase = "fin"; return; }
      etat.phase = p;
    },
    ordreDeNuit: () => ordre,
    candidatsDeNuit: () => api.villageois().filter(a => a.system.vivant).map(a => a.id),
    async demanderAction(d) { return [d.candidats[0]]; },
    async demanderActionMeute(d) { return [d.candidats[0]]; },
    async noterAction() {},
    async resoudreNuit() { return { morts: [], messages: [], annonces: [] }; },
    async verifierVictoire(o) { api.appels.verifierVictoire.push(o ?? {}); return etat.vainqueur; },
    async ouvrirVote(args) { api.appels.ouvrirVote.push(args); etat.vote = { ouvert: true, objet: args.objet ?? "execution", candidats: [], exprimes: [] }; },
    async cloreVote() { etat.vote = { ouvert: false, resultat }; return structuredClone(resultat); },
    async nouvellePartie(args) { api.appels.nouvellePartie.push(args); return { partie: "p2", joueurs: [], compagnons: [], composition: { cle: "x", libelle: "x", roles: ["villageois"], batiments: [] } }; }
  };
  if (!ancien) {
    Object.assign(api, {
      gensDePassage: () => structuredClone(gens),
      banc: () => structuredClone(banc ?? { actif: false, accusations: [], prochain: "", prochainNom: "" }),
      deuil: () => structuredClone(deuil ?? { actif: false, compte: 0 }),
      pouvoirsDuDeuil: () => { if (pouvoirs === "erreur") throw new Error("Réservé au MJ actif."); return structuredClone(pouvoirs ?? { visions: 0, voix: false, linceul: 0 }); },
      autel: () => structuredClone(autel),
      async accueillir(args) { api.appels.accueillir.push(args); return { acteurId: "v5", nom: args.nom ?? "Aubin", cle: args.cle || "remouleur" }; },
      async partir(id, o) { api.appels.partir.push([id, o?.comment]); return true; },
      async accuser(par, contre) { if (api.refus) throw new Error(api.refus); api.appels.accuser.push([par, contre]); return { par, contre }; },
      async reveiller(cle, o) { api.appels.reveiller.push(cle); return { roleCle: cle, cibles: ["v1"] }; },
      etapeSuivante: () => structuredClone(etape ?? { cle: "debat" })
    });
  }
  game.lakourLoups = api;
  return api;
}
const BANC = { actif: true, accusations: [{ par: "v1", parNom: "Berthe", contre: "v2", contreNom: "Colin", juge: false }], prochain: "v2", prochainNom: "Colin" };
const GENS = [{ acteurId: "v5", nom: "Gaspard", cle: "remouleur", role: "Rémouleur", tour: 2, parti: false }];

// ------------------------------------------------------------------ la batterie
const O = (M, n) => M.outils.OUTILS.find(o => o.nom === n);
const VERIFICATIONS = {
  async "narrateur : partis, gens de passage (camp tu), Banc, glas du deuil ; pouvoirs du deuil et autel en secret"(M) {
    let api = veillees({ banc: BANC, gens: GENS, deuil: { actif: true, compte: 2 }, pouvoirs: { visions: 1, voix: true, linceul: 0, cible: { numero: 3, cible: "v0" } },
      autel: [{ cle: "sourcier", nom: "Sourcier" }], etat: { format: "saint-martin" } });
    const t = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(t, /Nuit de la Saint-Martin : un seul jour, un seul vote d'exécution/);
    assert.match(t, /Partis \(ni morts ni révélés, hors jeu\) : Firmin \(exilé, tour 2\)/);
    assert.match(t, /Gens de passage \(rôle PUBLIC, camp secret : ne le dis jamais\) : Gaspard — Rémouleur \(arrivé au tour 2\)/);
    assert.doesNotMatch(t, /Gaspard[^\n]*meute/, "le camp d'un gens de passage n'est jamais dit");
    assert.match(t, /Banc des accusés \(public\) : Berthe accuse Colin\. Prochain jugé : Colin/);
    assert.match(t, /Glas du deuil \(public\) : il a sonné 2 fois/);
    assert.match(t, /Pouvoirs du deuil de la meute — SECRET : 1 vision\(s\)[^\n]*une voix sans visage au vote \(placée sur Aubin\)\. Ne les évoque jamais\./);
    assert.match(t, /Sous l'autel de la Chapelle — SECRET : Sourcier\. Ces rôles ne sont pas en jeu : ne les nomme jamais\./);
    api = veillees({ banc: { actif: true, accusations: [], prochain: "", prochainNom: "" } });
    assert.match(M.contexte.etatPartieLoups(api).join("\n"), /aucune accusation aujourd'hui\. Sans accusé, pas de vote d'exécution : la nuit tombera\./);
    api = veillees({ etat: { vainqueur: "brume", phase: "fin" }, pouvoirs: { visions: 1, voix: false, linceul: 0 }, autel: [{ cle: "x", nom: "X" }] });
    const fin = M.contexte.etatPartieLoups(api).join("\n");
    assert.match(fin, /victoire : la brume \(Saint-Martin : un innocent pendu, personne ne gagne\)/);
    assert.doesNotMatch(fin, /SECRET/, "partie finie : plus de secrets");
    api = veillees({ ancien: true });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Partis|passage|Banc|deuil|autel/);
    api = veillees({ pouvoirs: "erreur" });
    assert.doesNotMatch(M.contexte.etatPartieLoups(api).join("\n"), /Pouvoirs du deuil/);
  },

  async "compagnons : un parti ne joue plus ; un arrivant connaît son rôle public et garde son camp ; Banc et glas ; jamais un rôle caché"(M) {
    veillees({ banc: BANC, gens: GENS, deuil: { actif: true, compte: 1 } });
    const C = new M.jeu.Compagnons({ graine: "passage" });
    const firmin = C.vue(game.actors.get("v4"));
    assert.match(firmin.fiche, /Tu as quitté la veillée \(départ ou exil\) : tu ne joues plus/);
    assert.doesNotMatch(firmin.fiche, /Dernier souffle|Tu es MORT/);
    const gaspard = C.vue(game.actors.get("v5"));
    assert.match(gaspard.fiche, /Tu es de passage à Brumecombe\. Ton rôle \(PUBLIC, tout le village le connaît\) : Rémouleur/);
    assert.match(gaspard.fiche, /Ton camp, lui, est SECRET \(ton carnet te le dit\)/);
    const berthe = C.vue(game.actors.get("v1"));
    assert.match(berthe.scene, /Firmin — parti/);
    assert.match(berthe.scene, /Gaspard — vivant, de passage : Rémouleur/);
    assert.match(berthe.scene, /Banc des accusés : Berthe accuse Colin ; prochain jugé : Colin\. Sans accusé, pas de vote d'exécution\. Pour accuser quelqu'un/);
    assert.match(berthe.scene, /écris dans ta réplique « J'accuse <son nom> »/);
    // Monde anglais (langue du monde « en ») : la formule annoncée est l'anglaise, et la consigne de parole aussi.
    game.i18n.lang = "en";
    try {
      const vueEn = C.vue(game.actors.get("v1"));
      assert.equal(vueEn.langue, "en");
      assert.match(vueEn.scene, /écris dans ta réplique « I accuse <son nom> »/);
      const { systeme, texte: contexte } = M.compagnons.contexteCompagnon(vueEn);
      assert.match(systeme, /« It's the black plague! »/);
      assert.doesNotMatch(systeme, /« C'est la peste noire ! »/);
      assert.match(contexte, /« It's the black plague! »/);
      assert.match(contexte, /« For the Register: »/);
      assert.doesNotMatch(contexte, /« C'est la peste noire ! »|« Au Registre : »|« J'accuse/);
    } finally { delete game.i18n.lang; }
    assert.match(M.compagnons.contexteCompagnon(C.vue(game.actors.get("v1"))).systeme, /« C'est la peste noire ! »/, "monde français : inchangé");
    assert.match(berthe.scene, /Le glas du deuil a sonné 1 fois/);
    assert.doesNotMatch(berthe.scene, /Loup de Brumecombe/, "jamais un rôle caché");
    assert.doesNotMatch(C.vue(game.actors.get("v3")).scene, /Pour accuser/, "un mort n'accuse pas");
    veillees({ ancien: true });
    assert.doesNotMatch(new M.jeu.Compagnons({ graine: "x" }).vue(game.actors.get("v1")).scene, /Banc|passage|parti/);
  },

  async "résolveur : jugement au Banc et vote d'exil, notes justes ; sans IA, un loup acquitte les siens"(M) {
    veillees();
    const C = new M.jeu.Compagnons({ graine: "banc" });
    const vues = [];
    C.cerveaux.decider = async (vue, d) => { vues.push(d); return { cibles: [d.candidats[0].id] }; };
    await C.resoudreLoups({ type: "vote", id: "b", acteurId: "v1", invite: "Condamner Colin ?", candidats: [{ id: "v2", nom: "Colin" }], nombre: 1, banc: "v2" });
    await C.resoudreLoups({ type: "vote", id: "x", acteurId: "v1", invite: "Qui exiler ?", candidats: [{ id: "v5", nom: "Gaspard" }], nombre: 1, objet: "exil" });
    await C.resoudreLoups({ type: "demande", id: "dv", acteurId: "v2", invite: "Qui voir ?", candidats: [{ id: "v1", nom: "Berthe" }], nombre: 1, objet: "deuil-vision" });
    await C.resoudreLoups({ type: "demande", id: "dx", acteurId: "v2", invite: "Où placer la voix ?", candidats: [{ id: "v0", nom: "Aubin" }], nombre: 1, objet: "deuil-voix" });
    assert.deepEqual(vues.map(d => [d.objet, d.vote]), [["banc", true], ["exil", true], ["deuil-vision", false], ["deuil-voix", false]]);
    assert.match(vues[2].invite, /SECRET, pour la meute seule : le Glas du deuil vous donne une vision/);
    assert.match(vues[3].invite, /place une voix sans visage dans ce vote d'exécution/);
    const meute = M.jeu.privesDe("v2");
    assert.match(meute[0], /^Nuit 2, Glas du deuil \(secret\) : tu as voulu que la meute voie le camp de Berthe/);
    assert.match(meute[1], /^Vote du tour 2, voix du deuil \(secret\) : tu as proposé de la porter contre Aubin/);
    assert.match(vues[0].invite, /Voter pour lui le condamne ; ne rien choisir l'acquitte/);
    assert.match(vues[1].invite, /quitte la veillée sans mourir/);
    const notes = M.jeu.privesDe("v1");
    assert.match(notes[0], /^Banc des accusés, tour 2 : tu as voté pour condamner Colin/);
    assert.match(notes[1], /^Vote d'exil, tour 2 : tu as voté pour exiler Gaspard/);
    const d = { type: "cibles", objet: "banc", vote: true, candidats: [{ id: "v5", nom: "Gaspard" }], nombre: 1 };
    assert.deepEqual(M.compagnons.repliDecision({ id: "v2", allies: ["v5"], suspects: [] }, d, "g").cibles, [], "un loup acquitte les siens");
    assert.deepEqual(M.compagnons.repliDecision({ id: "v1", allies: [], suspects: ["v5"] }, d, "g").cibles, ["v5"], "un suspect est condamné");
  },

  async "compagnons : « J'accuse Colin » porte l'accusation au Banc (s'il est ouvert)"(M) {
    const noms = [{ id: "v2", nom: "Colin" }, { id: "v1", nom: "Berthe" }];
    assert.equal(M.compagnons.accusationDans("*Elle se lève.* — J'accuse Colin ! Il ment depuis l'aube.", noms), "v2");
    assert.equal(M.compagnons.accusationDans("j’accuse berthe de mentir", noms), "v1");
    assert.equal(M.compagnons.accusationDans("J'accuse le vent.", noms), null);
    assert.equal(M.compagnons.accusationDans("Je n'accuse personne.", noms), null);
    // Monde anglais : les mêmes accusations en anglais (apostrophe droite ou courbe, casse ignorée).
    assert.equal(M.compagnons.accusationDans("*She stands up.* — I accuse Colin! He has lied since dawn.", noms), "v2");
    assert.equal(M.compagnons.accusationDans("i’m accusing berthe of lying", noms), "v1");
    assert.equal(M.compagnons.accusationDans("I'm accusing Colin.", noms), "v2");
    assert.equal(M.compagnons.accusationDans("I am accusing Berthe, and I won't take it back.", noms), "v1");
    assert.equal(M.compagnons.accusationDans("I accuse the wind.", noms), null);
    assert.equal(M.compagnons.accusationDans("I'm not accusing anyone yet.", noms), null);
    assert.equal(M.compagnons.formulesReplique("en").accuser, "I accuse");
    assert.equal(M.compagnons.formulesReplique("fr").accuser, "J'accuse");
    let api = veillees({ banc: BANC });
    const C = new M.jeu.Compagnons({ graine: "accuse" });
    const repliques = ["J'accuse Colin !", "—"];
    C.cerveaux.parler = async () => ({ texte: repliques.shift() ?? "—", source: "ia" });
    await C.reagir({ max: 1 });
    assert.equal(api.appels.accuser.length, 1);
    assert.equal(api.appels.accuser[0][1], "v2");
    // La même chose en anglais, de bout en bout.
    api = veillees({ banc: BANC });
    const E = new M.jeu.Compagnons({ graine: "accuse" });
    E.cerveaux.parler = async () => ({ texte: "*She points.* — I accuse Colin!", source: "ia" });
    await E.reagir({ max: 1 });
    assert.equal(api.appels.accuser.length, 1);
    assert.equal(api.appels.accuser[0][1], "v2");
    api = veillees();
    const D = new M.jeu.Compagnons({ graine: "accuse" });
    D.cerveaux.parler = async () => ({ texte: "J'accuse Colin !", source: "ia" });
    await D.reagir({ max: 1 });
    assert.deepEqual(api.appels.accuser, [], "Banc fermé : rien");
  },

  async "outils : gens de passage (accueillir, partir), Banc (accuser, juger), exil, vision du deuil, fin de la Saint-Martin"(M) {
    let api = veillees();
    game.users.set("u2", { id: "u2", name: "Lise", isGM: false, active: true });
    let r = await O(M, "loups_passage").executer({ action: "accueillir", qui: "Lise", role: "" });
    assert.deepEqual(api.appels.accueillir[0], { userId: "u2" });
    assert.match(r.contenu, /Son camp est SECRET : ne le dis jamais/);
    r = await O(M, "loups_passage").executer({ action: "accueillir", qui: "Gaspard Lerouge", role: "pelerine" });
    assert.deepEqual(api.appels.accueillir[1], { nom: "Gaspard Lerouge", cle: "pelerine" });
    assert.ok(game.actors.get("v5")._maj?.["flags.lakour-mj-ia.compagnon"], "un compagnon qui arrive reçoit une personnalité");
    await O(M, "loups_passage").executer({ action: "partir", qui: "Berthe", role: "" });
    assert.deepEqual(api.appels.partir, [["v1", "depart"]]);
    game.users.delete("u2");
    assert.ok((await O(M, "loups_banc").executer({ action: "etat", par: "", contre: "" })).contenu.match(/Pas de Banc/));
    await O(M, "loups_banc").executer({ action: "accuser", par: "Aubin", contre: "Colin" });
    assert.deepEqual(api.appels.accuser, [["v0", "v2"]]);
    const vote = (action, objet = "execution") => O(M, "loups_vote").executer({ action, candidats: [], duree_secondes: 0, double: false, objet });
    api = veillees({ banc: { actif: true, accusations: [], prochain: "", prochainNom: "" } });
    r = await vote("ouvrir");
    assert.ok(r.erreur);
    assert.match(r.contenu, /personne n'est accusé/);
    assert.deepEqual(api.appels.ouvrirVote, []);
    api = veillees({ banc: BANC });
    assert.match((await vote("ouvrir")).contenu, /Jugement de Colin au Banc des accusés/);
    api = veillees({ resultat: { objet: "execution", decompte: { v2: 2 }, elus: [], banc: { accuse: "v2", pour: 2, total: 5 }, deuil: "v2" } });
    r = await vote("clore");
    assert.match(r.contenu, /Colin est acquitté \(2 pour sur 5\)\. Une voix sans visage/);
    assert.match(r.contenu, /s'il reste un accusé, juge-le/);
    assert.doesNotMatch(r.contenu, /loups_eliminer/);
    api = veillees({ resultat: { objet: "execution", decompte: { v2: 4 }, elus: ["v2"], elu: "v2", banc: { accuse: "v2", pour: 4, total: 5 } } });
    assert.match((await vote("clore")).contenu, /Colin est CONDAMNÉ \(4 pour sur 5\)[^\n]*Désigné : Colin \(loups_eliminer\)/);
    api = veillees();
    await vote("ouvrir", "exil");
    assert.deepEqual(api.appels.ouvrirVote.map(a => a.objet), ["exil"]);
    api = veillees({ resultat: { objet: "exil", decompte: { v5: 3 }, elus: ["v5"], elu: "v5" } });
    assert.match((await vote("clore")).contenu, /Gaspard quitte la veillée \(ni mort ni révélé/);
    api = veillees({ ordre: [{ roleCle: "deuil", acteurIds: ["v2"] }] });
    r = await O(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
    assert.deepEqual(api.appels.reveiller, ["deuil"]);
    assert.match(r.contenu, /la vision du deuil \(meute\) → Berthe/);
    api = veillees({ etat: { format: "saint-martin" }, finALaNuit: "brume" });
    r = await O(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" });
    assert.match(r.contenu, /La Nuit de la Saint-Martin s'achève[^\n]*VICTOIRE : la brume/);
    api = veillees({ phase: "fin" });
    const rejouer = format => O(M, "loups_rejouer").executer({ niveau: "", roles: [], composition: "", peste: "", glas: 0, format });
    await rejouer("saint-martin");
    await rejouer("ordinaire");
    await rejouer("");
    assert.deepEqual(api.appels.nouvellePartie.map(a => ("format" in a ? a.format : "(la précédente)")), ["saint-martin", "", "(la précédente)"]);
    // Un départ : déjà parti, refusé ; seul candidat du vote ouvert, le vote se clôt sans élu (le système), personne à éliminer.
    api = veillees({ etat: { vote: { ouvert: true, objet: "execution" } } });
    api.partir = async () => { api.etat = () => ({ vote: { ouvert: false, resultat: { objet: "execution", elus: [], depart: "v2" } } }); return true; };
    r = await O(M, "loups_passage").executer({ action: "partir", qui: "Colin", role: "" });
    assert.match(r.contenu, /le système l'a clos SANS élu ; n'élimine personne/);
    r = await vote("clore");
    assert.match(r.contenu, /Le vote s'est clos sans élu : Colin a quitté la veillée\. Personne n'est désigné ; n'élimine personne\./);
    api = veillees();
    api.partir = async () => false;
    r = await O(M, "loups_passage").executer({ action: "partir", qui: "Colin", role: "" });
    assert.ok(r.erreur);
    assert.match(r.contenu, /Colin a déjà quitté la veillée/);
    api = veillees({ ordre: [] });
    api.resoudreNuit = async () => ({ morts: [], messages: [], annonces: [], deuil: "v1" });
    assert.match((await O(M, "loups_nuit").executer({ delai_secondes: 30, peste_victime: "" })).contenu, /Glas du deuil \(SECRET\) : la meute a appris le camp de Berthe/);
    game.modules.get("lakour-mj-ia").api = {};
    assert.deepEqual(O(M, "loups_distribuer").schema.properties.format.enum, ["", "saint-martin"]);
    api = veillees({ ancien: true });
    assert.ok((await O(M, "loups_passage").executer({ action: "lister", qui: "", role: "" })).erreur);
    assert.ok((await O(M, "loups_banc").executer({ action: "etat", par: "", contre: "" })).erreur);
  },

  async "pilote : juger jusqu'à la condamnation, la nuit quand le banc est vide, dénouement de la Saint-Martin"(M) {
    const P = M.pilote;
    const e = (extra = {}) => ({ phase: "vote", tour: 2, vote: { ouvert: false }, ...extra });
    const m = { aube: true, debats: 2, voteFait: true };
    assert.equal(P.prochaineEtapeLoups(e(), m, { systeme: { cle: "juger" } }), "vote-ouvrir", "un acquitté : le suivant est jugé");
    assert.equal(P.prochaineEtapeLoups(e(), m, { systeme: { cle: "juger" }, elusVivants: ["v2"] }), "eliminer", "un condamné : l'exécution");
    assert.equal(P.prochaineEtapeLoups(e({ phase: "jour" }), { ...m, voteFait: false }, { systeme: { cle: "juger" } }), "vote-ouvrir");
    assert.equal(P.prochaineEtapeLoups(e({ phase: "jour" }), { ...m, voteFait: false, debats: 0 }, { systeme: { cle: "juger" } }), "debat", "le débat d'abord");
    assert.equal(P.prochaineEtapeLoups(e({ phase: "jour" }), { ...m, voteFait: false }, { systeme: { cle: "nuit", detail: { cle: "bancVide" } } }), "nuit");
    assert.equal(P.prochaineEtapeLoups(e({ format: "saint-martin" }), m), "denouement", "Saint-Martin : pas de seconde nuit");
    assert.equal(P.prochaineEtapeLoups(e({ phase: "jour", format: "saint-martin" }), { ...m, voteFait: false }, { systeme: { cle: "nuit", detail: { cle: "bancVide" } } }),
      "denouement", "Saint-Martin sans accusé : la fin, pas la nuit");
    assert.match(P.libelleVainqueurPilote("brume"), /^la brume : à la Saint-Martin, le village a pendu un innocent/);
    // En marche : le vote d'exécution juge l'accusé du Banc.
    veillees({ banc: BANC, etape: { cle: "juger" } });
    for (const a of game.actors.contents) { a.system.joueur = ""; a.system.compagnon = true; }
    const vues = [];
    const moteur = { actif: true, auRepos: () => true, budgetDepasse: () => false, compagnons: { maxRepliques: () => 0 } };
    const p = new P.PiloteAutomatique({ moteur, horloge: { maintenant: () => 0, attendre: async () => {} }, aviser: () => {}, etatDuJeu: () => "" });
    moteur.tour = async texte => { vues.push(texte); p.arreter("manuel"); };
    p.demarrer();
    await p.boucle;
    assert.match(vues.join("\n"), /Étape : le vote\.[\s\S]*ce vote est le jugement de Colin, lui seul/);
  },

  async "consignes : gens de passage, Banc, glas du deuil, Saint-Martin ; compagnons"(M) {
    const c = M.adaptateurs.adaptateur().consignes;
    assert.match(c, /un rôle PUBLIC et un camp secret que tu ne dis jamais/);
    assert.match(c, /Avec le Banc des accusés, seul un accusé est jugé/);
    assert.match(c, /donne en secret des pouvoirs à la meute : ne les évoque jamais/);
    assert.match(c, /La Nuit de la Saint-Martin \(format « saint-martin »\) n'a qu'un jour et qu'un vote/);
    assert.match(c, /ne nomme un villageois que pour le désigner/);
    veillees();
    assert.match(M.compagnons.consigneSysteme(new M.jeu.Compagnons({ graine: "x" }).vue(game.actors.get("v1"))), /avec le Banc des accusés, seul un accusé est jugé/);
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
    ["compagnons", "compagnons.js"], ["adaptateurs", "adaptateurs.js"]]) {
    const r = await charger(fichier, mute[fichier] ?? null);
    M[cle] = r.X;
    if (r.dossier) dossiers.push(r.dossier);
  }
  return { M, dossiers };
}

test("lot 0.8.0 des Veillées (MJ IA) : les scripts d'origine passent toute la batterie", async () => {
  const { M } = await modules();
  assert.deepEqual(await batterie(M), []);
});

const MUTATIONS = [
  ["contexte.js", "  if (e.partis?.length) {", "  if (false) {", "narrateur : les partis"],
  ["contexte.js", "  if (gens.length) {", "  if (false) {", "narrateur : les gens de passage"],
  ["contexte.js", "  if (banc?.actif && !e.vainqueur) {", "  if (false) {", "narrateur : le Banc"],
  ["contexte.js", "  if (deuil?.actif && deuil.compte > 0 && !e.vainqueur)", "  if (false)", "narrateur : le glas du deuil"],
  ["contexte.js", "  if (p && (p.visions > 0 || p.voix || p.linceul > 0)) {", "  if (false) {", "narrateur : pouvoirs du deuil"],
  ["contexte.js", "  if (autel.length) lignes.push(", "  if (false) lignes.push(", "narrateur : l'autel"],
  ["contexte.js", "  if (e.vainqueur) return lignes;\n  // Les secrets du MJ actif (ailleurs, ces fonctions", "  // Les secrets du MJ actif (ailleurs, ces fonctions", "narrateur : secrets après la fin"],
  ["contexte.js", ": v === \"brume\" ? \"la brume (Saint-Martin", ": v === \"brume_\" ? \"la brume (Saint-Martin", "narrateur : la brume"],
  ["compagnons-jeu.js", "    vivant ? \"\" : parti ? ", "    vivant ? \"\" : false ? ", "compagnon parti"],
  ["compagnons-jeu.js", "    dePassage ? \"Ton camp, lui, est SECRET", "    false ? \"Ton camp, lui, est SECRET", "compagnon de passage : camp secret"],
  ["compagnons-jeu.js", "${partis.has(a.id) ? \"parti\" : ", "${", "compagnon : les partis au village"],
  ["compagnons-jeu.js", "    ...bancEtDeuil(api, acteur),\n", "", "compagnon : Banc et glas"],
  ["compagnons-jeu.js", "      if (c.vue.jeu === \"loups\") await accuserAuBanc(", "      if (false) await accuserAuBanc(", "compagnon : l'accusation"],
  ["compagnons-jeu.js", "    if (!api.banc?.()?.actif) return false;\n", "", "accusation avec le Banc fermé"],
  ["compagnons-jeu.js", "  if (demande.type === \"vote\" && demande.banc) return \"banc\";\n", "", "résolveur : le Banc"],
  ["compagnons-jeu.js", "  if (demande.type === \"vote\" && demande.objet === \"exil\") return \"exil\";\n", "", "résolveur : l'exil"],
  ["compagnons.js", "    if (!accuse || allies.has(accuse.id)) return { cibles: [] };", "    if (!accuse) return { cibles: [] };", "repli : un loup condamne les siens"],
  ["compagnons.js", "?? candidats.find(x => vise.startsWith(plierNom(x.nom)))", "", "accusation suivie d'une raison"],
  ["outils.js", "        if (roleCle === \"deuil\") {", "        if (false) {", "loups_nuit : la vision du deuil"],
  ["outils.js", "      if (banc?.actif && !banc.prochain) {", "      if (false) {", "loups_vote : banc vide"],
  ["outils.js", "      if (r.banc) {", "      if (false) {", "loups_vote : le verdict du Banc"],
  ["outils.js", "      if (r.objet === \"exil\") {", "      if (false) {", "loups_vote : l'exil"],
  ["outils.js", "const formatVoulu = format === \"saint-martin\" ? { format } : format === \"ordinaire\" ? { format: \"\" } : {};", "const formatVoulu = {};", "loups_rejouer : le format"],
  ["outils.js", "        if (parti === false) return { erreur: true,", "        if (false) return { erreur: true,", "loups_passage : déjà parti"],
  ["outils.js", "          + (sansObjet ? \" Le vote en cours", "          + (false ? \" Le vote en cours", "départ : vote sans objet tu"],
  ["outils.js", "      if (!deja?.ouvert && deja?.resultat?.depart) {", "      if (false) {", "loups_vote : vote clos par un départ"],
  ["outils.js", "        deuil ? `Glas du deuil (SECRET) : la meute a appris", "        false ? `Glas du deuil (SECRET) : la meute a appris", "loups_nuit : la vision tue"],
  ["compagnons-jeu.js", "  if (demande.objet === \"deuil-vision\") return \"deuil-vision\";\n", "", "résolveur : la vision du deuil"],
  ["compagnons-jeu.js", "  if (demande.objet === \"deuil-voix\") return \"deuil-voix\";\n", "", "résolveur : la voix du deuil"],
  ["contexte.js", "${p.cible?.cible ? ` (placée sur ${nom(p.cible.cible)})` : \"\"}", "", "narrateur : la cible de la voix du deuil"],
  ["outils.js", "        try { await api.accuser(a, c); }", "        try { await null; }", "loups_banc n'accuse pas"],
  ["outils.js", "      if (!joueur) await game.actors.get(r.acteurId)?.update(", "      if (false) await game.actors.get(r.acteurId)?.update(", "arrivant sans personnalité"],
  ["pilote.js", "  if (systeme?.cle === \"juger\" && finDuDebat && !elusVivants.length) return \"vote-ouvrir\";\n", "", "pilote : le jugement suivant"],
  ["pilote.js", "    return etat.format === \"saint-martin\" ? (m.denouement ? null : \"denouement\") : \"nuit\";\n  }", "    return \"nuit\";\n  }", "pilote : la nuit d'un banc vide"],
  ["pilote.js", "return glasAtteint(etat) || etat.format === \"saint-martin\" ?", "return glasAtteint(etat) ?", "pilote : une seconde nuit à la Saint-Martin"],
  ["pilote.js", "if (b?.actif && b.prochain) banc = ", "if (false) banc = ", "pilote : l'accusé tu"],
  ["adaptateurs.js", "un rôle PUBLIC et un camp secret que tu ne dis jamais", "un rôle et un camp", "narrateur : le camp d'un arrivant"]
];

test("lot 0.8.0 des Veillées (MJ IA) : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    const { M, dossiers } = await modules({ [fichier]: [avant, apres] });
    try { if (!(await batterie(M)).length) passees.push(`${regle} (${fichier})`); }
    finally { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
