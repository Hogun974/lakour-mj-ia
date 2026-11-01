// Vote de groupe et choix secret du MJ IA avec des compagnons IA (decisions.js) : un compagnon vote et choisit par son cerveau,
// chez le MJ actif, sans socket ; une réponse invalide vaut abstention ; son choix secret ne laisse aucune trace au chat et
// rejoint ce qu'il sait en privé. Aucun appel payant : fournisseur doublure.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installer, reinitialiser, etat, U, comme, livrerTout, attendre, fenetreDe } from "./doublures/foundry-decisions.mjs";

installer();
const D = await import("../scripts/decisions.js");
const { OUTILS } = await import("../scripts/outils.js");
const J = await import("../scripts/compagnons-jeu.js");
D.brancherDecisions();

// Deux compagnons dans le monde (drapeau du MJ IA), un fournisseur qui répond ce qu'on veut et note ce qu'il reçoit.
const compagnon = (id, name, temperament) => {
  const a = { id, name, img: "", type: "character", items: [], hasPlayerOwner: false, system: { characteristics: {}, skills: {} },
    flags: { "lakour-mj-ia": { compagnon: { temperament, parler: "phrases courtes et sèches", histoire: "" } } } };
  game.actors.set(id, a);
  return a;
};
const ilsa = compagnon("Cp00000000000001", "Sœur Ilsa", "loyal");
const varn = compagnon("Cp00000000000002", "Varn", "soupconneux");
let reponse = '{"choix": "On négocie"}';
const recu = [];
const cerveaux = new J.Compagnons({
  fournisseur: () => ({ nom: "anthropic", async envoyerCourt(c) { recu.push(c); return { texte: typeof reponse === "function" ? reponse(c) : reponse, usage: {}, arret: "fin" }; } }),
  graine: "decisions"
});
D.brancherCompagnonsDecisions((acteurId, demande) => cerveaux.deciderOption(acteurId, demande));

const vote = args => OUTILS.find(o => o.nom === "vote_groupe").executer({
  action: "ouvrir", question: "Que fait le groupe ?", options: ["On attaque le convoi", "On négocie", "On fuit"],
  personnages: false, joueurs: [], delai: 0, anonyme: false, ...args
});
const choixSecret = args => OUTILS.find(o => o.nom === "choix_secret").executer({ joueur: "Sœur Ilsa", question: "Gardes-tu la relique pour toi ?", options: ["Je la garde", "Je la rends"], delai: 0, ...args });
const voter = async (u, index) => { await comme(u, () => fenetreDe(u).voter(index)); await livrerTout(); };
const sansIdentifiant = texte => { for (const a of [ilsa, varn]) assert.ok(!texte.includes(a.id), `identifiant de ${a.name} dans : ${texte}`); };

test("vote_groupe : les joueurs connectés ET les compagnons présents votent ; la demande ne part que chez les joueurs ; les compagnons votent par leur cerveau", async () => {
  reinitialiser();
  reponse = '{"choix": "On négocie"}';
  const r = await vote({});
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /Vote ouvert chez Brin \(Jordan\), Mira \(Lise\), Tom, Sœur Ilsa \(compagnon IA\), Varn \(compagnon IA\)/);
  const demande = etat.emissions.find(e => e.message.type === "vote-demande");
  assert.deepEqual([...demande.options.recipients].sort(), [U.Jordan.id, U.Lise.id, U.Tom.id].sort(), "rien n'est envoyé pour un compagnon");
  // (La doublure joue tous les navigateurs dans un seul processus : on laisse les compagnons voter avant de livrer aux joueurs.)
  await attendre(5);
  assert.equal(D.voteEnCours().exprimes, 2, "les deux compagnons ont déjà voté");
  await livrerTout();
  assert.equal(recu.length, 2);
  assert.match(recu[0].texte, /Options : « On attaque le convoi », « On négocie », « On fuit »/);
  await voter(U.Jordan, 0);
  await voter(U.Lise, 0);
  await voter(U.Tom, 2);   // tout le monde a voté : clôture
  assert.equal(D.voteEnCours(), null);
  const signal = etat.signaux.at(-1).texte;
  assert.match(signal, /- On négocie : 2 voix \(Sœur Ilsa \(compagnon IA\), Varn \(compagnon IA\)\)/);
  assert.match(signal, /Égalité entre « On attaque le convoi », « On négocie »/);
  sansIdentifiant(signal);
  const carte = etat.messages.at(-1).content;
  assert.match(carte, /On négocie<\/strong> : 2 voix <small>\(Sœur Ilsa, Varn\)<\/small>/);
  assert.ok(!etat.emissions.some(e => (e.options?.recipients ?? []).some(x => String(x).startsWith("compagnon:"))), "aucune émission adressée à un compagnon");
});

test("vote_groupe : une réponse invalide d'un compagnon vaut abstention ; on peut ne faire voter que des compagnons nommés", async () => {
  reinitialiser();
  reponse = c => (c.systeme.includes("Tu joues Varn") ? "Moi je dis qu'on fonce !" : '{"choix": "On fuit"}');
  const r = await vote({ joueurs: ["Sœur Ilsa", "Varn"] });
  assert.ok(!r.erreur, r.contenu);
  assert.equal(etat.emissions.filter(e => e.message.type === "vote-demande").length, 0, "aucune fenêtre de joueur");
  await attendre(10);
  assert.equal(D.voteEnCours(), null, "les deux ont répondu : le vote est clos");
  const signal = etat.signaux.at(-1).texte;
  assert.match(signal, /- On fuit : 1 voix \(Sœur Ilsa \(compagnon IA\)\)/);
  assert.match(signal, /Abstention : Varn \(compagnon IA\)\./);
  assert.match(signal, /Décision du groupe : « On fuit »/);
});

test("choix_secret à un compagnon : il répond par son cerveau ; rien au chat, rien par le socket ; il s'en souvient en privé", async () => {
  reinitialiser();
  reponse = '{"choix": "Je la garde"}';
  const r = await choixSecret({});
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /Choix secret de Sœur Ilsa \(compagnon IA\) \(« Gardes-tu la relique pour toi \? »\) : « Je la garde »/);
  assert.equal(etat.messages.length, 0);
  assert.equal(etat.emissions.length, 0);
  assert.ok(J.privesDe(ilsa.id).some(t => /Choix secret « Gardes-tu la relique pour toi \? » : tu as répondu « Je la garde »/.test(t)));
  assert.ok(!J.privesDe(varn.id).some(t => /relique/.test(t)), "l'autre compagnon n'en sait rien");
  reponse = "Je la garde, évidemment.";
  assert.match((await choixSecret({})).contenu, /a passé sans choisir/, "réponse invalide : il passe");
  reponse = '{"choix": null}';
  assert.match((await choixSecret({})).contenu, /a passé sans choisir/);
});
