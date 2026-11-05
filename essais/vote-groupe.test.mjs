// Vote de groupe du MJ IA (tous systèmes) : décompte, égalité, abstention, délai, voix refusées, diffusion limitée,
// textes propres pour l'IA, et une batterie par mutation.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installer, reinitialiser, etat, U, comme, livrerTout, attendre, fenetreDe } from "./doublures/foundry-decisions.mjs";

installer();
const D = await import("../scripts/decisions.js");
const C = await import("../scripts/canal.js");
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
D.brancherDecisions();
const vote = args => OUTILS.find(o => o.nom === "vote_groupe").executer({
  action: "ouvrir", question: "Que fait le groupe ?", options: ["On attaque le convoi", "On négocie", "On fuit"],
  personnages: false, joueurs: [], delai: 0, anonyme: false, ...args
});
const clore = () => OUTILS.find(o => o.nom === "vote_groupe").executer({ action: "clore", question: "", options: [], personnages: false, joueurs: [], delai: 0, anonyme: false });
const joueurs = () => [U.Jordan, U.Lise, U.Tom];
const idDemande = () => etat.emissions.find(e => e.message.type === "vote-demande").message.id;

// Un texte pour l'IA : des noms, jamais d'identifiant ni « undefined ».
function propre(texte) {
  assert.equal(typeof texte, "string");
  assert.doesNotMatch(texte, /undefined|null|\[object/);
  for (const u of game.users.values()) assert.ok(!texte.includes(u.id), `identifiant de ${u.name} dans : ${texte}`);
}

// Le joueur vote dans sa fenêtre, puis tout est livré.
async function voter(u, index) {
  await comme(u, () => fenetreDe(u).voter(index));
  await livrerTout();
}

test("décompte : majorité, égalité, abstention, absents ; une voix d'un non-votant ne compte pas", () => {
  const options = ["a", "b", "c"];
  let r = D.decompter({ options, votes: { x: 0, y: 0, z: 2 }, votants: ["x", "y", "z"] });
  assert.deepEqual(r.comptes.map(c => c.voix), [2, 0, 1]);
  assert.deepEqual(r.gagnants, [0]);
  assert.equal(r.egalite, false);
  r = D.decompter({ options, votes: { x: 0, y: 1 }, votants: ["x", "y"] });
  assert.deepEqual(r.gagnants, [0, 1]);
  assert.equal(r.egalite, true);
  r = D.decompter({ options, votes: { x: null, y: 1, intrus: 0 }, votants: ["x", "y", "z"] });
  assert.deepEqual(r.comptes.map(c => c.voix), [0, 1, 0]);
  assert.deepEqual(r.abstentions, ["x"]);
  assert.deepEqual(r.absents, ["z"]);
  assert.equal(r.exprimes, 1);
  r = D.decompter({ options, votes: { x: null }, votants: ["x", "y"] });
  assert.deepEqual(r.gagnants, []);
});

test("vote_groupe : la demande ne part que chez les joueurs visés, les voix vont au seul MJ, le résultat paraît à la clôture", async () => {
  reinitialiser();
  const r = await vote({});
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /Vote ouvert chez Brin \(Jordan\), Mira \(Lise\), Tom : « Que fait le groupe \? »/);
  propre(r.contenu);
  const demande = etat.emissions[0];
  assert.equal(demande.canal, "module.lakour-mj-ia");
  assert.equal(demande.message.type, "vote-demande");
  assert.deepEqual([...demande.options.recipients].sort(), joueurs().map(u => u.id).sort(), "ni le MJ ni l'absente");
  await livrerTout();
  for (const u of joueurs()) assert.ok(fenetreDe(u), `fenêtre de ${u.name}`);
  assert.equal(etat.fenetres.length, 3);

  await voter(U.Jordan, 0);
  const voix = etat.emissions.find(e => e.message.type === "vote");
  assert.deepEqual(voix.options.recipients, [U.Hogun.id], "une voix ne va qu'au MJ actif");
  // Les votants n'apprennent que le nombre de voix.
  const progression = etat.emissions.find(e => e.message.type === "vote-progression");
  assert.deepEqual(Object.keys(progression.message).sort(), ["exprimes", "id", "total", "type"]);
  assert.equal(fenetreDe(U.Lise).exprimes, 1);
  assert.equal(etat.messages.length, 0, "rien dans le chat avant la clôture");

  await voter(U.Lise, 0);
  await voter(U.Tom, 2);   // tout le monde a voté : clôture
  assert.equal(D.voteEnCours(), null);
  assert.equal(etat.messages.length, 1);
  const carte = etat.messages[0];
  assert.equal(carte.whisper, undefined, "résultat public");
  assert.match(carte.content, /Décision : On attaque le convoi/);
  assert.match(carte.content, /Brin, Mira/);
  assert.equal(etat.signaux.length, 1, "résultat signalé à l'IA");
  assert.match(etat.signaux[0].texte, /tout le monde a voté/);
  assert.match(etat.signaux[0].texte, /- On attaque le convoi : 2 voix \(Brin \(Jordan\), Mira \(Lise\)\)/);
  assert.match(etat.signaux[0].texte, /Décision du groupe : « On attaque le convoi »/);
  propre(etat.signaux[0].texte);
  for (const u of joueurs()) assert.equal(fenetreDe(u), undefined, `fenêtre de ${u.name} fermée`);
  for (const e of etat.emissions) assert.ok(Array.isArray(e.options?.recipients), `${e.message.type} diffusé à tous`);
});

test("égalité : annoncée dans le chat et à l'IA, sans vainqueur", async () => {
  reinitialiser();
  await vote({ joueurs: ["Jordan", "Mira"] });
  await livrerTout();
  await voter(U.Jordan, 0);
  await voter(U.Lise, 1);
  assert.match(etat.messages[0].content, /Égalité/);
  assert.match(etat.signaux[0].texte, /Égalité entre « On attaque le convoi », « On négocie » : tranche/);
  assert.doesNotMatch(etat.signaux[0].texte, /Décision du groupe/);
});

test("abstention et changement d'avis ; clore rend le décompte à l'IA sans le lui signaler deux fois", async () => {
  reinitialiser();
  await vote({});
  await livrerTout();
  await voter(U.Jordan, 1);
  await voter(U.Jordan, 0);              // change d'avis
  await comme(U.Lise, () => fenetreDe(U.Lise).voter(null));   // s'abstient
  await livrerTout();
  assert.equal(D.voteEnCours().exprimes, 2);
  const r = await clore();
  assert.ok(!r.erreur);
  assert.match(r.contenu, /clos par toi/);
  assert.match(r.contenu, /- On attaque le convoi : 1 voix \(Brin \(Jordan\)\)/);
  assert.match(r.contenu, /- On négocie : 0 voix\n/);
  assert.match(r.contenu, /Abstention : Mira \(Lise\)\./);
  assert.match(r.contenu, /Sans réponse : Tom\./);
  propre(r.contenu);
  assert.equal(etat.signaux.length, 0);
  assert.match(etat.messages[0].content, /Abstention : Mira/);
  const encore = await clore();
  assert.ok(encore.erreur);
  assert.equal(encore.contenu, "Aucun vote de groupe n'est ouvert.");
});

test("délai : le vote se clôt seul, les absents sont « sans réponse », les fenêtres se ferment", async () => {
  reinitialiser();
  D.ouvrirVote({ question: "Qui garde le prisonnier ?", options: ["Brin", "Mira"], votants: [U.Jordan, U.Lise], delai: 40 });
  await livrerTout();
  await voter(U.Jordan, 1);
  await attendre(80);
  await livrerTout();
  assert.equal(D.voteEnCours(), null);
  assert.match(etat.signaux[0].texte, /délai écoulé/);
  assert.match(etat.signaux[0].texte, /Sans réponse : Mira \(Lise\)\./);
  assert.match(etat.signaux[0].texte, /Décision du groupe : « Mira »/);
  assert.deepEqual(etat.emissions.find(e => e.message.type === "vote-clos").options.recipients, [U.Jordan.id, U.Lise.id]);
  assert.equal(fenetreDe(U.Jordan), undefined);
  // Une voix arrivée après la clôture n'est pas prise.
  assert.equal(D.recevoirVote({ id: idDemande(), choix: 0 }, U.Lise.id).ok, false);
});

test("voix refusées : autre joueur, fausse identité, option inconnue, navigateur qui n'est pas le MJ actif, fausse demande", async () => {
  reinitialiser();
  await vote({ joueurs: ["Jordan", "Lise"] });
  await livrerTout();
  const id = idDemande();
  // Tom n'est pas appelé à voter.
  assert.deepEqual(D.recevoirVote({ id, choix: 0 }, U.Tom.id), { ok: false, raison: "votant non attendu" });
  // Lise se fait passer pour Jordan : le serveur dit qui émet, le message est rejeté.
  await comme(U.Lise, () => game.socket.emit(C.CANAL, { type: "vote", id, choix: 1, userId: U.Jordan.id }, { recipients: [U.Hogun.id] }));
  await livrerTout();
  assert.equal(D.voteEnCours().exprimes, 0);
  // Option hors liste.
  assert.equal(D.recevoirVote({ id, choix: 7 }, U.Jordan.id).ok, false);
  assert.equal(D.recevoirVote({ id, choix: "0" }, U.Jordan.id).ok, false);
  // Seul le MJ actif enregistre : la même voix reçue dans le navigateur de Lise ne compte pas.
  assert.equal(await comme(U.Lise, () => C.traiter({ type: "vote", id, choix: 0, userId: U.Jordan.id }, U.Jordan.id)), false);
  assert.equal(D.voteEnCours().exprimes, 0);
  // Une demande de vote venue d'un joueur n'ouvre rien chez les autres.
  const avant = etat.fenetres.length;
  await comme(U.Tom, () => game.socket.emit(C.CANAL, { type: "vote-demande", id: "faux", question: "?", options: [{ libelle: "a" }, { libelle: "b" }], delai: 1000, total: 1 }, { recipients: [U.Jordan.id] }));
  await livrerTout();
  assert.equal(etat.fenetres.length, avant);
  // La vraie voix de Jordan passe.
  await voter(U.Jordan, 0);
  assert.equal(D.voteEnCours().exprimes, 1);
  await clore();
});

test("un seul vote à la fois ; erreurs claires", async () => {
  reinitialiser();
  await vote({});
  const r = await vote({ question: "Autre chose ?" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /Vote non ouvert : Un vote est déjà ouvert \(« Que fait le groupe \? »\)/);
  await clore();
  for (const [args, motif] of [
    [{ options: ["Seule option"] }, /au moins deux options/],
    [{ question: "  " }, /La question est vide/],
    [{ joueurs: ["Inconnu"] }, /Joueur introuvable : Inconnu \(joueurs connectés : Brin \(Jordan\), Mira \(Lise\), Tom\)/],
    [{ joueurs: ["Absente"] }, /Aucun joueur connecté pour voter \(pas connecté : Nox \(Absente\)\)/],
    [{ personnages: true, options: ["Brin", "Fantôme"] }, /Personnage introuvable : Fantôme/]
  ]) {
    const e = await vote(args);
    assert.ok(e.erreur, JSON.stringify(args));
    assert.match(e.contenu, motif);
    propre(e.contenu);
  }
  assert.equal(D.voteEnCours(), null);
});

test("options-personnages : nom exact et portrait ; un joueur déconnecté est signalé sans fenêtre", async () => {
  reinitialiser();
  const r = await vote({ question: "Qui envoyer en éclaireur ?", options: ["brin", "Capitaine Varn"], personnages: true, joueurs: ["Jordan", "Absente"] });
  assert.match(r.contenu, /options : « Brin », « Capitaine Varn »/);
  assert.match(r.contenu, /Pas connecté, donc sans fenêtre : Nox \(Absente\)/);
  assert.deepEqual(etat.emissions[0].message.options, [{ libelle: "Brin", img: "brin.webp" }, { libelle: "Capitaine Varn", img: "varn.webp" }]);
  assert.deepEqual(etat.emissions[0].options.recipients, [U.Jordan.id]);
  await clore();
});

test("vote anonyme : le chat ne montre que les totaux ; l'IA garde les noms et la consigne de discrétion", async () => {
  reinitialiser();
  await vote({ joueurs: ["Jordan", "Lise"], anonyme: true });
  await livrerTout();
  await voter(U.Jordan, 2);
  await comme(U.Lise, () => fenetreDe(U.Lise).voter(null));
  await livrerTout();
  const carte = etat.messages[0].content;
  assert.match(carte, /On fuit<\/strong> : 1 voix/);
  assert.match(carte, /Abstentions : 1/);
  assert.doesNotMatch(carte, /Brin|Mira|Jordan|Lise/);
  assert.match(etat.signaux[0].texte, /On fuit : 1 voix \(Brin \(Jordan\)\)/);
  assert.match(etat.signaux[0].texte, /ne révèle pas qui a voté quoi/);
});

test("vote_groupe et choix_secret servent dans tous les systèmes", () => {
  for (const systeme of ["impmal", "dnd5e", "lakour-loups", "pf2e"]) {
    const noms = outilsDuSysteme(systeme).map(o => o.nom);
    assert.ok(noms.includes("vote_groupe") && noms.includes("choix_secret"), systeme);
  }
});

// ---------------------------------------------------------------- mutations
// Chaque règle est cassée à son tour dans une copie de decisions.js et canal.js ; la batterie doit alors échouer.
const SOURCE = fileURLToPath(new URL("../scripts/", import.meta.url));

const BATTERIE = {
  "l'abstention n'est pas une voix": ({ D }) => {
    const r = D.decompter({ options: ["a", "b"], votes: { x: null, y: 1 }, votants: ["x", "y"] });
    assert.deepEqual(r.comptes.map(c => c.voix), [0, 1]);
  },
  "l'égalité est rendue telle quelle": ({ D }) => {
    assert.deepEqual(D.decompter({ options: ["a", "b"], votes: { x: 0, y: 1 }, votants: ["x", "y"] }).gagnants, [0, 1]);
  },
  "seul un votant attendu vote": async ({ D }) => {
    const v = D.ouvrirVote({ question: "q", options: ["a", "b"], votants: [U.Jordan, U.Lise] });
    try { assert.equal(D.recevoirVote({ id: v.id, choix: 0 }, U.Tom.id).ok, false); } finally { await D.cloreVote(); }
  },
  "l'émetteur annoncé par le serveur fait foi": async ({ D, C }) => {
    const v = D.ouvrirVote({ question: "q", options: ["a", "b"], votants: [U.Jordan, U.Lise] });
    try {
      C.traiter({ type: "vote", id: v.id, choix: 0, userId: U.Jordan.id }, U.Tom.id);
      assert.equal(D.voteEnCours().exprimes, 0);
    } finally { await D.cloreVote(); }
  },
  "une demande ne part que chez ses destinataires": async ({ D }) => {
    D.ouvrirVote({ question: "q", options: ["a", "b"], votants: [U.Jordan] });
    try {
      const e = etat.emissions.findLast(x => x.message.type === "vote-demande");
      assert.deepEqual(e.options?.recipients, [U.Jordan.id]);
    } finally { await D.cloreVote(); }
  },
  "un choix secret n'accepte que la réponse de son destinataire": async ({ D }) => {
    const attente = D.demanderChoix({ utilisateur: U.Jordan, question: "q", options: ["a", "b"], delai: 1000 });
    const id = etat.emissions.findLast(x => x.message.type === "choix-demande").message.id;
    const accepte = D.recevoirChoix({ id, choix: 0 }, U.Lise.id);
    D.recevoirChoix({ id, choix: 1 }, U.Jordan.id);
    await attente;
    assert.equal(accepte, false);
  }
};

const MUTATIONS = {
  "abstention comptée pour la première option": ["decisions.js", "if (v === null || !comptes[v]) abstentions.push(id);", "if (!comptes[v ?? 0]) abstentions.push(id);"],
  "égalité tranchée en faveur de la première": ["decisions.js", ".map(c => c.index) : [];", ".map(c => c.index).slice(0, 1) : [];"],
  "voix d'un joueur non appelé acceptée": ["decisions.js", "if (!vote.votants.includes(emetteur)) return { ok: false, raison: \"votant non attendu\" };", ""],
  "identité déclarée crue sur parole": ["canal.js", "const qui = emetteur || message.userId || null;", "const qui = message.userId || emetteur || null;",
    "if (emetteur && message.userId && message.userId !== emetteur) return false;   // se fait passer pour un autre", ""],
  "message diffusé à tous": ["canal.js", "game.socket.emit(CANAL, message, { recipients: autres });", "game.socket.emit(CANAL, message);"],
  "réponse secrète acceptée de n'importe qui": ["decisions.js", "if (!c || c.destinataire !== emetteur) return false;", "if (!c) return false;"]
};

async function charger(mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-decisions-"));
  const sources = Object.fromEntries(["decisions.js", "canal.js", "constantes.js", "appel.js", "utilitaires.js", "personnalites.js"].map(f => [f, readFileSync(join(SOURCE, f), "utf8")]));
  if (mutation) {
    const [fichier, ...remplacements] = mutation;
    for (let i = 0; i < remplacements.length; i += 2) {
      assert.ok(sources[fichier].includes(remplacements[i]), `mutation obsolète : ${remplacements[i]}`);
      sources[fichier] = sources[fichier].replace(remplacements[i], remplacements[i + 1]);
    }
  }
  for (const [f, texte] of Object.entries(sources)) writeFileSync(join(dossier, f), texte);
  const D = await import(pathToFileURL(join(dossier, "decisions.js")).href);
  const C = await import(pathToFileURL(join(dossier, "canal.js")).href);
  D.brancherDecisions();
  return { D, C, dossier };
}

async function echecs(modules) {
  const rates = [];
  for (const [nom, verifier] of Object.entries(BATTERIE)) {
    reinitialiser();
    try { await verifier(modules); } catch { rates.push(nom); }
  }
  return rates;
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const vrai = await charger(null);
  try { assert.deepEqual(await echecs(vrai), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok((await echecs(m)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
