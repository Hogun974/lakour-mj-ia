// Choix secret du MJ IA (tous systèmes) : la demande ne va qu'au joueur, la réponse qu'au MJ, rien dans le chat ;
// passer, fermer, délai, déconnexion, réponses refusées, textes propres pour l'IA.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { installer, reinitialiser, etat, U, comme, livrerTout, fenetreDe } from "./doublures/foundry-decisions.mjs";

installer();
const D = await import("../scripts/decisions.js");
const C = await import("../scripts/canal.js");
const { OUTILS } = await import("../scripts/outils.js");
D.brancherDecisions();
const QUESTION = "Le marchand a le dos tourné. Glisses-tu la bague dans ta poche ?";
const choix = args => OUTILS.find(o => o.nom === "choix_secret").executer({ joueur: "Brin", question: QUESTION, options: ["Je la garde", "Je la rends", "Je la montre aux autres"], delai: 0, ...args });
const idDemande = () => etat.emissions.findLast(e => e.message.type === "choix-demande").message.id;

function propre(texte) {
  assert.doesNotMatch(texte, /undefined|null|\[object/);
  for (const u of game.users.values()) assert.ok(!texte.includes(u.id), `identifiant de ${u.name} dans : ${texte}`);
}

test("choix_secret : la question ne va qu'au joueur, sa réponse qu'au MJ, et rien n'apparaît dans le chat", async () => {
  reinitialiser();
  const attente = choix({});
  const demande = etat.emissions[0];
  assert.equal(demande.message.type, "choix-demande");
  assert.deepEqual(demande.options.recipients, [U.Jordan.id]);
  assert.equal(demande.message.question, QUESTION);
  await livrerTout();
  assert.equal(etat.fenetres.length, 1, "une seule fenêtre, chez lui");
  const f = fenetreDe(U.Jordan);
  assert.equal(f.demande.titre, "Brin");
  await comme(U.Jordan, async () => { f.choisir(0); await f.valider(); });
  await livrerTout();
  const r = await attente;
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /^Choix secret de Brin \(Jordan\) \(« Le marchand a le dos tourné\. Glisses-tu la bague dans ta poche \? »\) : « Je la garde »\./);
  assert.match(r.contenu, /ne le révèle pas/);
  propre(r.contenu);
  const reponse = etat.emissions.find(e => e.message.type === "choix-reponse");
  assert.deepEqual(reponse.options.recipients, [U.Hogun.id], "la réponse ne va qu'au MJ actif");
  // Ni chat (public ou chuchoté), ni diffusion à tous, ni rien chez les autres joueurs.
  assert.equal(etat.messages.length, 0);
  for (const e of etat.emissions) {
    assert.ok(Array.isArray(e.options?.recipients), `${e.message.type} diffusé à tous`);
    for (const id of e.options.recipients) assert.ok([U.Jordan.id, U.Hogun.id].includes(id), `${e.message.type} envoyé à un autre joueur`);
  }
  assert.ok(!etat.hooks.some(h => JSON.stringify(h.args).includes("Je la garde")), "aucun hook ne propage la réponse");
  assert.equal(fenetreDe(U.Jordan), undefined);
});

test("passer, ou fermer la fenêtre, revient à passer", async () => {
  for (const geste of [f => f.passer(), f => f.close()]) {
    reinitialiser();
    const attente = choix({});
    await livrerTout();
    await comme(U.Jordan, () => geste(fenetreDe(U.Jordan)));
    await livrerTout();
    const r = await attente;
    assert.match(r.contenu, /^Brin \(Jordan\) a passé sans choisir/);
    propre(r.contenu);
    assert.equal(etat.messages.length, 0);
  }
});

test("délai : la fenêtre est fermée sans réponse et l'IA est prévenue", async t => {
  reinitialiser();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const attente = choix({ delai: 20 });
  t.mock.timers.tick(20_000);
  const r = await attente;
  t.mock.timers.reset();
  assert.match(r.contenu, /^Brin \(Jordan\) n'a pas répondu dans les 20 s/);
  propre(r.contenu);
  const annuler = etat.emissions.find(e => e.message.type === "choix-annuler");
  assert.deepEqual(annuler.options.recipients, [U.Jordan.id]);
  // Livrées dans l'ordre : la fenêtre s'ouvre puis se ferme aussitôt, sans répondre.
  await livrerTout();
  assert.equal(fenetreDe(U.Jordan), undefined);
  assert.ok(!etat.emissions.some(e => e.message.type === "choix-reponse"));
  // Le délai par défaut et les bornes.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const defaut = choix({ delai: 0 });
  t.mock.timers.tick(D.DELAI_CHOIX * 1000);
  assert.match((await defaut).contenu, new RegExp(`dans les ${D.DELAI_CHOIX} s`));
  const court = choix({ delai: 1 });
  t.mock.timers.tick(10_000);
  assert.match((await court).contenu, /dans les 10 s/);
  t.mock.timers.reset();
});

test("réponses refusées : un autre joueur, une fausse identité, une option inconnue ; puis la vraie réponse passe", async () => {
  reinitialiser();
  const attente = choix({});
  await livrerTout();
  const id = idDemande();
  assert.equal(D.recevoirChoix({ id, choix: 1 }, U.Lise.id), false);
  await comme(U.Lise, () => game.socket.emit(C.CANAL, { type: "choix-reponse", id, choix: 1, userId: U.Jordan.id }, { recipients: [U.Hogun.id] }));
  await livrerTout();
  assert.equal(D.recevoirChoix({ id, choix: 9 }, U.Jordan.id), false);
  assert.equal(D.recevoirChoix({ id, choix: 1.5 }, U.Jordan.id), false);
  // Reçue ailleurs que chez le MJ actif, la réponse n'est pas enregistrée.
  assert.equal(await comme(U.Lise, () => C.traiter({ type: "choix-reponse", id, choix: 1, userId: U.Jordan.id }, U.Jordan.id)), false);
  // Une demande de choix venue d'un joueur n'ouvre rien.
  await comme(U.Tom, () => game.socket.emit(C.CANAL, { type: "choix-demande", id: "faux", question: "?", options: ["a", "b"], delai: 1000 }, { recipients: [U.Lise.id] }));
  await livrerTout();
  assert.equal(fenetreDe(U.Lise), undefined);
  await comme(U.Jordan, async () => { const f = fenetreDe(U.Jordan); f.choisir(2); await f.valider(); });
  await livrerTout();
  assert.match((await attente).contenu, /« Je la montre aux autres »/);
});

test("joueur absent, inconnu ou déconnecté en attendant ; options invalides", async () => {
  reinitialiser();
  let r = await choix({ joueur: "Nox" });
  assert.ok(r.erreur);
  assert.equal(r.contenu, "Nox (Absente) n'est pas connecté : impossible de lui poser ce choix.");
  r = await choix({ joueur: "Fantôme" });
  assert.equal(r.contenu, "Joueur introuvable : Fantôme (joueurs connectés : Brin (Jordan), Mira (Lise), Tom).");
  r = await choix({ options: ["Oui", "oui "] });
  assert.equal(r.contenu, "Choix non posé : Il faut au moins deux options différentes.");
  r = await choix({ question: "" });
  assert.equal(r.contenu, "Choix non posé : La question est vide.");
  assert.equal(etat.emissions.length, 0, "rien n'est parti");

  const attente = choix({ joueur: "Tom" });
  await livrerTout();
  U.Tom.active = false;
  Hooks.callAll("userConnected", U.Tom, false);
  r = await attente;
  assert.equal(r.contenu, `Tom s'est déconnecté avant de répondre (« ${QUESTION} »).`);
  assert.deepEqual(etat.emissions.find(e => e.message.type === "choix-annuler").options.recipients, [U.Tom.id]);
});

test("le MJ actif peut se poser le choix à lui-même (essai en solo) : traité sans passer par le serveur", async () => {
  reinitialiser();
  const attente = D.demanderChoix({ utilisateur: U.Hogun, question: "Essai ?", options: ["Oui", "Non"], delai: 1000 });
  await livrerTout();
  assert.equal(etat.emissions.length, 0, "rien sur le réseau");
  const f = fenetreDe(U.Hogun);
  f.choisir(1);
  await f.valider();
  assert.deepEqual(await attente, { choix: 1, libelle: "Non", raison: "repondu" });
});
