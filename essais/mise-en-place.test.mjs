// Essais de la mise en place du plateau avant la narration, et de la voix qui suit le texte pendant qu'il s'écrit.
// Hors Foundry, sans réseau : un faux fournisseur rejoue des réponses écrites à l'avance.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { morceauxPrets, texteParlable } from "../scripts/voix-texte.js";

// ---------------------------------------------------------------- Voix au fil du texte

const RECIT = "La foule *gronde* sur la place. Un diacre vous agrippe le bras ! « Ils me cherchent », souffle-t-il. "
  + "Deux silhouettes en manteau gris fendent la cohue, scrutant chaque visage, et l'une d'elles porte un sceau de l'Inquisition. "
  + "Le diacre tremble. Que faites-vous ?";

// Simule l'écriture caractère par caractère, comme le flux de l'API.
function lireEnDirect(texte, pas = 1) {
  let pris = 0, nombre = 0;
  const envois = [];
  for (let i = pas; i <= texte.length; i += pas) {
    const r = morceauxPrets(texte.slice(0, i), pris, { premier: nombre === 0 });
    pris = r.pris;
    for (const m of r.morceaux) envois.push({ apres: i, m, nombre: nombre++ });
  }
  const fin = morceauxPrets(texte, pris, { final: true });
  for (const m of fin.morceaux) envois.push({ apres: texte.length, m, nombre: nombre++ });
  return envois;
}

test("voix en direct : la première phrase part dès qu'elle est écrite, sans attendre la suite", () => {
  const envois = lireEnDirect(RECIT);
  assert.equal(envois[0].m, "La foule gronde sur la place.");
  assert.ok(envois[0].apres < 40, `première phrase envoyée après ${envois[0].apres} caractères`);
  // Même si plusieurs phrases arrivent d'un coup, seule la première part tout de suite (synthèse plus courte, voix plus tôt).
  assert.equal(morceauxPrets(RECIT, 0, { premier: true }).morceaux.join(" "), "La foule gronde sur la place.");
});

test("voix en direct : tout le texte est lu, une seule fois, dans l'ordre, sans la mise en forme", () => {
  for (const pas of [1, 3, 17, 500]) {
    const lu = lireEnDirect(RECIT, pas).map(e => e.m).join(" ");
    assert.equal(lu, texteParlable(RECIT), `pas de ${pas}`);
  }
});

test("voix en direct : après la première, les phrases partent par paquets (pas une requête par phrase)", () => {
  const envois = lireEnDirect(RECIT);
  assert.ok(envois.length >= 2 && envois.length <= 3, envois.map(e => e.m).join(" | "));
  assert.ok(envois.slice(1, -1).every(e => e.m.length >= 250));
});

test("voix en direct : une phrase pas finie attend ; un silence (« — ») n'est jamais lu", () => {
  assert.deepEqual(morceauxPrets("La porte grince", 0, { premier: true }), { morceaux: [], pris: 0 });
  assert.deepEqual(morceauxPrets("—", 0, { final: true }).morceaux, []);
  assert.deepEqual(morceauxPrets("Fin.", 4, { final: true }).morceaux, []);
});

// ---------------------------------------------------------------- Mise en place avant narration (moteur)

const reglages = { miseEnPlace: true, voix: "aucune", budgetSeance: 0, delaiReponse: 1,
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 },
  personnalites: [{ id: "p", nom: "Essai", nomAffiche: "MJ" }], personnaliteActive: "p", fournisseur: "factice" };
const publies = [];
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
globalThis.game = {
  settings: { get: (_m, k) => reglages[k], set: async (_m, k, v) => { reglages[k] = v; } },
  combats: { active: null }, users: { filter: () => [] }, user: {},
  i18n: { localize: k => k, format: k => k }, world: { id: "essai" }
};
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...d, update: async u => Object.assign(m, u), delete: async () => {} }; publies.push(m); return m; } } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { MoteurMJ, CONSIGNE_BROUILLON, CONSIGNE_PLATEAU, consigneCreation } = await import("../scripts/moteur.js");

// Faux fournisseur : rejoue des réponses ; note ce qu'on lui envoie et si le texte était affiché (surTexte).
function fournisseurScripte(reponses) {
  const journal = { envois: [], resultats: [], utilisateur: [] };
  return {
    journal,
    nom: "factice",
    nouveauFil: () => ({ messages: [] }),
    ajouterUtilisateur: (fil, texte) => { journal.utilisateur.push(texte); },
    ajouterResultats: (fil, resultats, texte = "") => { journal.resultats.push({ resultats, texte }); },
    async envoyer(fil, { surTexte }) {
      const r = reponses.shift();
      journal.envois.push({ affiche: Boolean(surTexte) });
      if (surTexte) for (const mot of r.texte.split(/(?<= )/)) surTexte(mot);
      return { texte: r.texte ?? "", appels: r.appels ?? [], usage: {}, arret: r.appels?.length ? "outils" : "fin" };
    }
  };
}

// Chaque outil note combien de messages étaient publiés quand il s'est exécuté.
const executions = [];
let echecsPlacement = 0;
const sansArgs = { type: "object", properties: {}, required: [], additionalProperties: false };
const OUTILS_ESSAI = ["mettre_en_scene", "amener_joueurs", "demander_jet"].map(nom => ({
  nom, schema: sansArgs, sensible: false,
  executer: async () => {
    executions.push({ nom, publies: publies.length });
    if (nom === "mettre_en_scene" && echecsPlacement > 0) { echecsPlacement--; return { erreur: true, contenu: "repère « fontaine » introuvable" }; }
    return { contenu: "fait" };
  }
}));
const appel = (nom, id = nom) => ({ id, nom, args: {} });

async function jouer(reponses, options) {
  publies.length = 0; executions.length = 0;
  const moteur = new MoteurMJ();
  moteur.fournisseur = fournisseurScripte(reponses);
  moteur.compter = async () => {};
  await moteur.tour("[Messages des joueurs] Je traverse la place.", { fil: {}, systeme: "S", outils: OUTILS_ESSAI, sauver: false, ...options });
  assert.equal(reponses.length, 0, "toutes les réponses prévues ont été demandées, pas plus");
  return moteur.fournisseur.journal;
}
const RECIT_MARCHE = "Deux gardes se disputent près du puits central. Au seuil de l'échoppe, une petite vieille vous fait signe.";

test("mise en place : la narration est écrite en coulisse, le plateau suit, PUIS elle s'affiche", async () => {
  const journal = await jouer([{ texte: RECIT_MARCHE }, { appels: [appel("mettre_en_scene")] }, { texte: "plateau prêt" }], { miseEnPlace: true });
  assert.ok(journal.utilisateur[0].startsWith("[Messages des joueurs] Je traverse la place."));
  assert.ok(journal.utilisateur[0].endsWith(CONSIGNE_BROUILLON));
  assert.equal(journal.utilisateur[1], CONSIGNE_PLATEAU, "la mise en place vient après la narration écrite");
  assert.deepEqual(journal.envois.map(e => e.affiche), [false, false, false], "rien ne s'affiche pendant l'écriture ni la vérification");
  assert.deepEqual(executions, [{ nom: "mettre_en_scene", publies: 0 }], "plateau posé avant toute publication");
  assert.equal(publies.length, 1);
  assert.match(publies[0].content, /une petite vieille vous fait signe/);
  assert.equal(publies[0].flags["lakour-mj-ia"].final, true, "publiée d'un bloc, prête pour la voix");
});

test("mise en place : plateau déjà conforme → « plateau prêt » n'est jamais affiché", async () => {
  await jouer([{ texte: "Rien ne bouge dans la nef." }, { texte: "plateau prêt" }], { miseEnPlace: true });
  assert.equal(publies.length, 1);
  assert.match(publies[0].content, /Rien ne bouge/);
});

test("mise en place : un placement raté est corrigé (au plus 3 essais), puis la narration paraît", async () => {
  echecsPlacement = 1;
  const journal = await jouer([{ texte: RECIT_MARCHE }, { appels: [appel("mettre_en_scene", "m1")] }, { appels: [appel("mettre_en_scene", "m2")] }, { texte: "plateau prêt" }], { miseEnPlace: true });
  assert.equal(journal.resultats.length, 2);
  assert.ok(journal.resultats[0].resultats[0].erreur, "l'IA voit l'échec");
  assert.equal(publies.length, 1);
  echecsPlacement = 5;
  await jouer([{ texte: RECIT_MARCHE }, { appels: [appel("mettre_en_scene", "a")] }, { appels: [appel("mettre_en_scene", "b")] }, { appels: [appel("mettre_en_scene", "c")] }], { miseEnPlace: true });
  assert.equal(publies.length, 1, "la narration paraît même si le plateau résiste");
  echecsPlacement = 0;
});

test("mise en place : l'IA voit le plateau obtenu et corrige avant que la narration ne paraisse", async () => {
  const journal = await jouer([
    { texte: RECIT_MARCHE },
    { appels: [appel("mettre_en_scene", "m")] },
    { appels: [appel("amener_joueurs", "correction")] },  // une correction après avoir vu le plateau
    { texte: "plateau prêt" }
  ], { miseEnPlace: true });
  assert.equal(journal.resultats.length, 2);
  assert.deepEqual(executions.map(e => [e.nom, e.publies]), [["mettre_en_scene", 0], ["amener_joueurs", 0]]);
  assert.equal(publies.length, 1);
});

test("mise en place : changement de lieu pendant l'écriture, avant la narration et le plateau", async () => {
  await jouer([{ appels: [appel("amener_joueurs")] }, { texte: "Vous débouchez sur la place du marché." }, { appels: [appel("mettre_en_scene")] }, { texte: "plateau prêt" }], { miseEnPlace: true });
  assert.deepEqual(executions.map(e => [e.nom, e.publies]), [["amener_joueurs", 0], ["mettre_en_scene", 0]]);
  assert.match(publies[0].content, /place du marché/);
});

test("mise en place : une demande de jet attend que la narration soit affichée", async () => {
  const journal = await jouer([
    { texte: "Le garde vous dévisage. Faites un test de Discrétion.", appels: [appel("demander_jet")] },
    { texte: "" },
    { appels: [appel("mettre_en_scene")] },
    { texte: "plateau prêt" }
  ], { miseEnPlace: true });
  assert.match(journal.resultats[0].resultats[0].contenu, /partira au joueur dès que ta narration sera affichée/);
  assert.deepEqual(executions.map(e => [e.nom, e.publies]), [["mettre_en_scene", 0], ["demander_jet", 1]]);
});

test("mise en place : un premier jet avant les outils, réécrit ensuite → seule la dernière version paraît", async () => {
  await jouer([
    { texte: "Bienvenue sur Kour Primaris (premier jet).", appels: [appel("amener_joueurs")] },
    { texte: "Bienvenue sur Kour Primaris, Lazar Vosk." },
    { appels: [appel("mettre_en_scene")] },
    { texte: "plateau prêt" }
  ], { miseEnPlace: true });
  assert.equal(publies.length, 1);
  assert.match(publies[0].content, /Lazar Vosk/);
  assert.doesNotMatch(publies[0].content, /premier jet/);
});

test("mise en place : « — » (rien à dire) → ni plateau ni message", async () => {
  const journal = await jouer([{ texte: "—" }], { miseEnPlace: true });
  assert.equal(journal.envois.length, 1);
  assert.equal(publies.length, 0);
});

test("sans mise en place (création, scénario, combat) : narration directe, comme avant", async () => {
  const journal = await jouer([{ texte: "Bienvenue." }], { miseEnPlace: false });
  assert.deepEqual(journal.envois.map(e => e.affiche), [true]);
  assert.equal(journal.utilisateur[0], "[Messages des joueurs] Je traverse la place.");
  // Et en plein combat, le moteur ne la demande pas.
  const moteur = new MoteurMJ();
  assert.equal(moteur.miseEnPlaceVoulue(), true);
  game.combats.active = { started: true };
  assert.equal(moteur.miseEnPlaceVoulue(), false);
  game.combats.active = null;
  reglages.miseEnPlace = false;
  assert.equal(moteur.miseEnPlaceVoulue(), false);
  reglages.miseEnPlace = true;
});

test("joueur connecté sans personnage : une parenthèse de création, une seule fois par séance", () => {
  const moteur = new MoteurMJ();
  const signales = [];
  moteur.signaler = (texte, options) => signales.push({ texte, options });
  game.user = { id: "mj" }; game.users.activeGM = game.user; game.system = { id: "impmal" };
  const nouveau = { id: "u2", name: "Kael", isGM: false, character: null };
  moteur.proposerCreation(nouveau);
  moteur.proposerCreation(nouveau);
  assert.equal(signales.length, 1, "proposée une seule fois");
  assert.match(signales[0].texte, /Kael est connecté mais n'a pas de personnage/);
  assert.match(signales[0].texte, /demander_des avec joueur « Kael »/);
  assert.match(signales[0].texte, /parenthèse dans la partie en cours/);
  // Rien pour un joueur qui a déjà un personnage, pour le MJ, ou sur un système sans création guidée.
  moteur.proposerCreation({ id: "u3", name: "Lia", isGM: false, character: { id: "a" } });
  moteur.proposerCreation({ id: "u4", name: "MJ2", isGM: true, character: null });
  game.system = { id: "pf2e" };
  moteur.proposerCreation({ id: "u6", name: "Zoé", isGM: false, character: null });
  assert.equal(signales.length, 1);
  // D&D 5e : étapes propres (peuple, historique, classe, 4d6kh3, creer_personnage_dnd5e), sans rien d'Imperium Maledictum.
  game.system = { id: "dnd5e" };
  moteur.proposerCreation({ id: "u5", name: "Tom", isGM: false, character: null });
  assert.equal(signales.length, 2);
  assert.match(signales[1].texte, /formule « 4d6kh3 »/);
  assert.match(signales[1].texte, /creer_personnage_dnd5e/);
  assert.match(signales[1].texte, /le joueur n.a rien à faire sur sa fiche/);
  assert.doesNotMatch(signales[1].texte, /glisser/);
  assert.match(signales[1].texte, /parenthèse dans la partie en cours/);
  assert.doesNotMatch(signales[1].texte, /2d10\+20|creer_personnage(?!_dnd5e)/);
  // La consigne du bouton de la console, elle, n'est pas une parenthèse.
  assert.doesNotMatch(consigneCreation("Kael"), /parenthèse/);
});
