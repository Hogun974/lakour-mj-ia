// MJ IA narrateur des « Veillées de Brumecombe » : outils propres au système lakour-loups, appelant son API (docs/loups-contrat.md).
// L'API du système est ici une doublure qui respecte le contrat ; le vrai système a ses propres essais (essais/loups-*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { getRoute: r => `/${r}`, escapeHTML: t => t } };
const messages = [];
globalThis.ChatMessage = { implementation: { create: async m => messages.push(m) } };
const { OUTILS, outilsDuSysteme, choisirComposition, rolesPour } = await import("../scripts/outils.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");
const outil = nom => OUTILS.find(o => o.nom === nom);

test("chaque monde ne reçoit que ses outils", () => {
  const noms = s => new Set(outilsDuSysteme(s).map(o => o.nom));
  const loups = noms("lakour-loups"), impmal = noms("impmal"), dnd = noms("dnd5e");
  for (const n of ["loups_distribuer", "loups_nuit", "loups_vote", "loups_eliminer", "loups_effet", "message_prive", "ecrire_chronique", "ambiance_sonore"]) assert.ok(loups.has(n), `loups : ${n}`);
  for (const n of ["demander_jet", "lancer_combat", "creer_personnage", "creer_personnage_dnd5e", "bourse"]) assert.ok(!loups.has(n), `loups ne doit pas avoir ${n}`);
  assert.ok(impmal.has("creer_personnage") && impmal.has("depenser_xp") && !impmal.has("monter_niveau") && !impmal.has("loups_nuit"));
  assert.ok(dnd.has("monter_niveau") && dnd.has("creer_personnage_dnd5e") && !dnd.has("creer_personnage") && !dnd.has("loups_vote"));
  // Les outils communs aux aventures restent dans chacune (parité) ; aux Veillées, le système met le plateau en scène : ni plateau,
  // ni cartes, ni PNJ (docs/cout.md), mais le secret, la chronique hors partie, les aides et les tables.
  for (const n of ["mettre_en_scene", "figurants", "vue_3d", "modifier_scenario", "message_prive", "ecrire_chronique"]) {
    for (const s of [impmal, dnd]) assert.ok(s.has(n), `${n} manquant`);
  }
  for (const n of ["message_prive", "ecrire_chronique", "montrer_aide", "lancer_table", "chercher_compendium", "lire_document", "compagnons"]) {
    assert.ok(loups.has(n), `loups : ${n}`);
  }
  for (const n of ["mettre_en_scene", "figurants", "vue_3d", "modifier_scenario", "creer_scene", "placer_jetons", "creer_pnj", "illustrer"]) {
    assert.ok(!loups.has(n), `loups ne doit pas avoir ${n}`);
  }
});

test("composition : celle demandée, sinon la première du niveau qui accepte ce nombre ; rôles complétés de villageois", () => {
  const compositions = {
    "petit-village": { libelle: "Petit village", joueurs: [6, 8], niveau: "debutants", roles: ["loup", "loup", "liseuse", "garde", "villageois", "villageois", "villageois", "villageois"] },
    "veillee": { libelle: "Veillée", joueurs: [6, 10], niveau: "classique", roles: ["loup", "loup", "liseuse", "herboriste", "garde", "sonneur"] }
  };
  assert.equal(choisirComposition(compositions, 7).cle, "veillee");
  assert.equal(choisirComposition(compositions, 7, { niveau: "debutants" }).cle, "petit-village");
  assert.equal(choisirComposition(compositions, 9, { niveau: "debutants" }).cle, "veillee", "repli sur une composition possible");
  assert.equal(choisirComposition(compositions, 12), null);
  assert.equal(choisirComposition(compositions, 7, { cle: "inconnue" }), null);
  assert.deepEqual(rolesPour(compositions.veillee, 8), ["loup", "loup", "liseuse", "herboriste", "garde", "sonneur", "villageois", "villageois"]);
  assert.deepEqual(rolesPour(compositions["petit-village"], 6).length, 6);
});

// Doublure de game.lakourLoups : trois villageois, un loup ; la nuit tue la cible de la meute.
function partie() {
  const acteurs = new Map();
  const villageois = (id, nom, joueur, roleCle, camp, extra = {}) => {
    const a = { id, name: nom, system: { joueur, vivant: true, camp, revele: false, ...extra }, items: [{ type: "role", name: roleCle, system: { camp, nuit: { invite: `${roleCle} ?`, cibles: 1 } } }] };
    a.items.find = Array.prototype.find.bind(a.items);
    acteurs.set(id, a);
  };
  villageois("a1", "Aubin", "u1", "loup", "meute");
  villageois("a2", "Berthe", "u2", "liseuse", "village");
  villageois("a3", "Colin", "u3", "villageois", "village");
  const appels = [];
  const etat = { phase: "preparation", tour: 0, vote: { ouvert: false } };
  const api = {
    etat: () => ({ ...etat }), villageois: () => [...acteurs.values()],
    async changerPhase(p) { appels.push(["phase", p]); etat.phase = p; if (p === "nuit") etat.tour++; },
    ordreDeNuit: () => [{ roleCle: "meute", acteurIds: ["a1"] }, { roleCle: "liseuse", acteurIds: ["a2"] }],
    async demanderActionMeute(o) { appels.push(["meute", o.candidats.length]); return ["a3"]; },
    async demanderAction(o) { appels.push(["action", o.acteurId, o.invite]); return ["a1"]; },
    async noterAction(a) { appels.push(["noter", a.roleCle, a.cibles]); },
    // Comme le vrai système : l'aube élimine ; les messages privés sont rendus au MJ IA, qui les chuchote.
    async resoudreNuit() {
      acteurs.get("a3").system.vivant = false;
      appels.push(["aube"]);
      return { morts: ["a3"], revelations: [], messages: [{ acteurId: "a2", texte: "Aubin est de la **meute**." }], sauves: [], narrateur: [{ acteurId: "a2", effet: "messager", cibles: ["a1"] }], narration: ["Le messager attend ton arbitrage."], enAttente: [] };
    },
    async eliminer(id) { acteurs.get(id).system.vivant = false; appels.push(["eliminer", id]); },
    async verifierVictoire() { const v = [...acteurs.values()].filter(a => a.system.vivant); return v.filter(a => a.system.camp === "meute").length >= v.filter(a => a.system.camp !== "meute").length ? "meute" : ""; },
    async ouvrirVote(o) { appels.push(["ouvrir", o.candidats, o.duree, o.double]); },
    async cloreVote() { return { decompte: { a1: 2, a2: 0 }, elu: "a1", votes: {} }; }
  };
  globalThis.game = {
    system: { id: "lakour-loups" }, lakourLoups: api,
    actors: { get: id => acteurs.get(id) },
    users: Object.assign([{ id: "u1", name: "Jordan" }, { id: "u2", name: "Lia" }, { id: "u3", name: "Tom" }, { id: "mj", name: "MJ", isGM: true }],
      { get: id => game.users.find(u => u.id === id) }),
    settings: { get: (m, k) => (k === "personnalites" ? [{ id: "x", nomAffiche: "La Conteuse" }] : "x") }
  };
  return { api, appels, acteurs };
}

test("loups_nuit : réveille la meute puis la liseuse, résout l'aube, envoie le message privé, détecte la victoire", async () => {
  const { appels, acteurs } = partie();
  const r = await outil("loups_nuit").executer({ delai_secondes: 30 });
  assert.deepEqual(appels.filter(a => a[0] === "phase").map(a => a[1]), ["nuit", "aube"]);
  assert.deepEqual(appels.find(a => a[0] === "meute"), ["meute", 3]);
  assert.deepEqual(appels.find(a => a[0] === "action"), ["action", "a2", "liseuse ?"]);
  assert.equal(acteurs.get("a3").system.vivant, false, "la victime meurt");
  assert.equal(messages.length, 1, "un seul message privé, chuchoté par le MJ IA");
  assert.deepEqual(messages[0].whisper, ["u2", "mj"], "le message de la liseuse ne va qu'à elle et au MJ");
  assert.match(messages[0].content, /<strong>meute<\/strong>/);
  assert.match(r.contenu, /Pour toi : Le messager attend ton arbitrage/);
  assert.equal(appels.filter(a => a[0] === "noter" && a[1] === "meute").length, 1, "la meute est notée une seule fois");
  assert.match(r.contenu, /1 message\(s\) privé\(s\) chuchoté/);
  assert.match(r.contenu, /À ARBITRER par toi : Berthe — messager → Aubin/);
  assert.match(r.contenu, /meute \(Aubin\) → Colin/);
  assert.match(r.contenu, /Morts de la nuit : Colin/);
  assert.match(r.contenu, /VICTOIRE : meute/, "un loup contre un villageois : la meute gagne");
});

test("loups_nuit avec un système qui tient un carnet secret : les messages passent par envoyerSecret, aucun chuchotement", async () => {
  const { api } = partie();
  const secrets = [];
  api.envoyerSecret = async (acteurId, texte) => { secrets.push([acteurId, texte]); };
  const avant = messages.length;
  const r = await outil("loups_nuit").executer({ delai_secondes: 30 });
  assert.deepEqual(secrets, [["a2", "Aubin est de la **meute**."]]);
  assert.equal(messages.length, avant, "rien au chat : un chuchotement serait livré à tous les navigateurs");
  assert.match(r.contenu, /1 message\(s\) secret\(s\) remis aux joueurs concernés \(carnet secret\)/);
});

test("loups_nuit : candidats donnés par le système (effets du jour) et mot du Messager demandé à l'expéditeur", async () => {
  const { api, appels } = partie();
  api.candidatsDeNuit = ({ roleCle }) => (roleCle === "meute" ? ["a2"] : ["a1", "a3"]);
  api.ordreDeNuit = () => [{ roleCle: "meute", acteurIds: ["a1"] }, { roleCle: "messager", acteurIds: ["a2"] }];
  game.actors.get("a2").items[0].system = { camp: "village", effet: "messager", nuit: { invite: "messager ?", cibles: 2 } };
  api.demanderAction = async o => { appels.push(["action", o.acteurId, o.candidats]); return ["a3", "a1"]; };
  api.demanderTexte = async o => { appels.push(["texte", o.acteurId, o.invite]); return "Méfie-toi du moulin."; };
  await outil("loups_nuit").executer({ delai_secondes: 30 });
  assert.deepEqual(appels.find(a => a[0] === "meute"), ["meute", 1], "la meute ne voit que les candidats du système");
  assert.deepEqual(appels.find(a => a[0] === "action"), ["action", "a2", ["a1", "a3"]]);
  const texte = appels.find(a => a[0] === "texte");
  assert.equal(texte[1], "a3", "l'expéditeur écrit");
  assert.match(texte[2], /écris une phrase pour Aubin/);
  assert.deepEqual(appels.find(a => a[0] === "noter" && a[1] === "messager"), ["noter", "messager", ["a3", "a1"]]);
});

test("loups_vote puis loups_eliminer : vote ouvert sur les vivants, décompte, élimination avec rôle", async () => {
  const { appels } = partie();
  const ouvert = await outil("loups_vote").executer({ action: "ouvrir", candidats: [], duree_secondes: 90, double: false });
  assert.match(ouvert.contenu, /Vote ouvert \(3 candidats, 90 s\)/);
  assert.deepEqual(appels.find(a => a[0] === "ouvrir"), ["ouvrir", ["a1", "a2", "a3"], 90000, undefined], "double non transmis : celui de la nuit est gardé");
  const clos = await outil("loups_vote").executer({ action: "clore", candidats: [], duree_secondes: 0, double: false });
  assert.match(clos.contenu, /Aubin : 2.*Désigné : Aubin/);
  const fin = await outil("loups_eliminer").executer({ villageois: "aubin", cause: "vote", reveler: true });
  assert.match(fin.contenu, /Aubin meurt \(vote\)\. Rôle d'Aubin : loup|Rôle de Aubin : loup/);
  assert.match((await outil("loups_vote").executer({ action: "ouvrir", candidats: ["Personne"], duree_secondes: 0, double: false })).contenu, /introuvable/);
});

test("adaptateur du narrateur : pas de dés, rôle marqué secret dans le résumé", async () => {
  partie();
  const sys = adaptateur();
  assert.equal(sys.id, "lakour-loups");
  await assert.rejects(sys.lancer(), /Pas de dés/);
  const a = game.actors.get("a2");
  a.items.push({ type: "metier", name: "Meunière" });
  assert.match(sys.resumer(a), /Berthe \[joué par Lia\] — vivant — métier public : Meunière — rôle SECRET \(ne le dis à personne\) : liseuse/);
});

test("état de partie pour le narrateur : phase, tour, vivants, morts, vote en cours, silences", async () => {
  const { etatPartieLoups } = await import("../scripts/contexte.js");
  const { api, acteurs } = partie();
  acteurs.get("a3").system.vivant = false;
  acteurs.get("a2").system.silence = true;
  api.etat = () => ({ phase: "vote", tour: 2, morts: [{ acteurId: "a3", cause: "nuit", tour: 1 }], vote: { ouvert: true, votes: { a1: "a2" }, double: true } });
  const lignes = etatPartieLoups(api).join("\n");
  assert.match(lignes, /phase « vote », tour 2/);
  assert.match(lignes, /Vivants \(2\) : Aubin, Berthe/);
  assert.match(lignes, /Morts : Colin \(nuit, tour 1\)/);
  assert.match(lignes, /Vote OUVERT : 1 voix reçue\(s\) sur 2, vote double/);
  assert.match(lignes, /silence aujourd'hui : Berthe/);
});

test("message_prive aux Veillées : carnet secret du système (rien dans le chat) ; ailleurs, chuchotement", async () => {
  const { api } = partie();
  const remis = [];
  api.envoyerSecret = async (acteurId, contenu) => { remis.push([acteurId, contenu]); };
  const avant = messages.length;
  const r = await outil("message_prive").executer({ joueur: "Lia", texte: "Tu entends un hurlement près du puits." });
  assert.match(r.contenu, /carnet de Lia/);
  assert.deepEqual(remis, [["a2", { texte: "Tu entends un hurlement près du puits.", titre: "La Conteuse" }]]);
  assert.equal(messages.length, avant, "aucun message de chat");
  // Sans le système des Veillées : un chuchotement au joueur et aux MJ.
  delete game.lakourLoups;
  game.users.filter = Array.prototype.filter.bind(game.users);
  await outil("message_prive").executer({ joueur: "Lia", texte: "Un frisson." });
  assert.deepEqual(messages.at(-1).whisper, ["u2", "mj"]);
});
