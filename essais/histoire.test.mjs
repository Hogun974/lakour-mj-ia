// Histoire de chaque personnage (40k, Warcraft, Fénoir ; pas les Veillées ; §10.5 de docs/survie-contrat.md, dépôt lakour-fenoir) :
// le journal à quatre pages (la page secrète au seul propriétaire et au MJ), l'uuid sur l'acteur, l'outil histoire_personnage
// (préparer, écrire, compléter, chapitre), le résumé d'un compagnon dans sa personnalité, la ligne d'histoire dans le résumé
// d'un personnage (pages publiques seulement), le bouton des fiches, la demande d'un joueur au MJ actif, la consigne de création.
// Chaque règle est rejouée sur des copies mutées.  Doublures, aucun réseau, aucune IA.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installerFenoir, Collection, acteur as faireActeur } from "./doublures/foundry-survie.mjs";

// Un monde : la doublure de Fénoir, plus les journaux, les dossiers, le canal, les crochets ; systeme au choix.
function monde(systeme = "lakour-survie", { moi = "mj" } = {}) {
  const r = installerFenoir();
  game.system.id = systeme;
  const journaux = new Collection();
  const dossiers = new Collection();
  const crochets = new Map();
  const emis = [];
  let n = 0;
  globalThis.Hooks = { on: (nom, fn) => crochets.set(nom, [...(crochets.get(nom) ?? []), fn]), callAll() {}, once() {} };
  globalThis.Folder = { implementation: { create: async d => { const f = { id: `F${++n}`, ...d }; dossiers.set(f.id, f); return f; } } };
  globalThis.JournalEntry = { implementation: { create: async d => {
    const id = `J${++n}`;
    const pages = new Collection(d.pages.map((p, i) => [`P${n}${i}`, { id: `P${n}${i}`, ...structuredClone(p) }]));
    const j = { id, uuid: `JournalEntry.${id}`, ...structuredClone({ ...d, pages: undefined }), pages, rendu: 0,
      sheet: { render: () => { j.rendu++; } },
      async updateEmbeddedDocuments(_t, maj) { for (const m of maj) pages.get(m._id).text.content = m["text.content"]; } };
    journaux.set(id, j);
    return j;
  } } };
  globalThis.fromUuid = async uuid => journaux.get(uuid.split(".").pop()) ?? null;
  game.journal = journaux;
  game.folders = dossiers;
  game.user = game.users.get(moi);
  game.users.activeGM = game.users.get("mj");
  game.socket = { emit: (canal, message, o) => emis.push({ message, recipients: o?.recipients }), on() {} };
  game.lakourSurvie.contenu = () => ({ passes: [{ cle: "infirmiere", nom: "Infirmière" }], enfances: [{ cle: "gamin-du-port", nom: "Gamin du Port" }], traits: [] });
  for (const a of game.actors.contents) a.testUserPermission = (u, niveau) => niveau === "OWNER" && (u?.isGM || (a.id === "s1" && u?.id === "u1"));
  game.actors.get("s1").isOwner = true;
  return { ...r, journaux, dossiers, crochets, emis };
}

async function charger(racine = fileURLToPath(new URL("../scripts/", import.meta.url))) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [H, h, o, a, c, mo, ca] = await Promise.all(["histoire-logique.js", "histoire.js", "outils.js", "adaptateurs.js", "compagnons-jeu.js", "moteur.js", "canal.js"].map(m));
  return { H, h, o, a, c, mo, ca };
}
monde();
const outil = (M, nom) => M.o.OUTILS.find(x => x.nom === nom);
const ARGS = { qui_il_est: "", son_histoire: "", ce_qu_il_garde: "", chapitre: "", resume_compagnon: "" };

const VERIFICATIONS = {
  "journal : quatre pages, les trois premières à tous, la secrète au propriétaire seul (et au MJ)"(M) {
    const d = M.H.donneesJournalHistoire({ nom: "Lucie", proprietaires: ["u1"], dossier: "F1", acteurUuid: "Actor.s1", systeme: "lakour-survie" });
    assert.equal(d.name, "Histoire de Lucie");
    assert.deepEqual(d.ownership, { default: 2, u1: 3 });
    assert.deepEqual(d.pages.map(p => p.name), ["Portrait", "Son histoire", "Ses secrets", "Chapitres"]);
    assert.deepEqual(d.pages.map(p => p.ownership), [{ default: -1 }, { default: -1 }, { default: 0, u1: 3 }, { default: -1 }]);
    assert.ok(d.pages.every(p => M.H.estAide(p.text.content)), "pages d'aide");
    assert.match(d.pages[1].text.content, /Qui as-tu perdu/);
  },
  async "preparer : journal créé dans son dossier, uuid sur l'acteur, matériau du monde (Fénoir) et questions"(M) {
    const { journaux, dossiers } = monde();
    game.actors.get("s1").system.enfance = "gamin-du-port";
    game.actors.get("s1").flags["lakour-mj-ia"] = { graineHistoire: "Sa sœur a disparu au jour zéro." };
    const r = await outil(M, "histoire_personnage").executer({ personnage: "Lucie", action: "preparer", ...ARGS });
    assert.ok(!r.erreur, r.contenu);
    assert.equal(journaux.size, 1);
    assert.equal(dossiers.contents[0].name, "Histoires des personnages");
    const j = journaux.contents[0];
    assert.equal(j.folder, dossiers.contents[0].id);
    assert.equal(game.actors.get("s1").flags["lakour-mj-ia"].histoire, j.uuid);
    assert.equal(game.actors.get("s1").system.histoire.journal, j.uuid, "Fénoir : system.histoire.journal aussi");
    for (const m of ["créé", "Enfance : Gamin du Port", "Passé : Infirmière", "Âge : 34 ans", "Graine d'histoire : Sa sœur a disparu", "Questions possibles"]) {
      assert.ok(r.contenu.includes(m), `${m} absent :\n${r.contenu}`);
    }
    await outil(M, "histoire_personnage").executer({ personnage: "Lucie", action: "preparer", ...ARGS });
    assert.equal(journaux.size, 1, "pas de second journal");
  },
  async "ecrire, completer, chapitre : pages remplacées, aide remplacée puis ajout, chapitre daté du jour de jeu"(M) {
    const { journaux } = monde();
    const o = outil(M, "histoire_personnage");
    await o.executer({ personnage: "Lucie", action: "ecrire", ...ARGS, qui_il_est: "Infirmière de nuit à Bellepierre.", ce_qu_il_garde: "Elle a volé de la morphine." });
    const j = journaux.contents[0];
    const page = cle => M.H.pageDe(j, cle).text.content;
    assert.equal(page("qui"), "<p>Infirmière de nuit à Bellepierre.</p>");
    assert.ok(M.H.estAide(page("histoire")), "page non donnée : inchangée");
    await o.executer({ personnage: "Lucie", action: "completer", ...ARGS, son_histoire: "Elle a fui le CHU.", qui_il_est: "Elle chante faux." });
    assert.equal(page("histoire"), "<p>Elle a fui le CHU.</p>", "l'aide est remplacée");
    assert.equal(page("qui"), "<p>Infirmière de nuit à Bellepierre.</p><p>Elle chante faux.</p>");
    await o.executer({ personnage: "Lucie", action: "chapitre", ...ARGS, chapitre: "Elle a sauvé Eddy." });
    assert.match(page("chapitres"), /^<h3>Jour 3, après-midi \(7 décembre 2026, saison des pluies\), phase panique<\/h3><p>Elle a sauvé Eddy\.<\/p>$/);
    assert.equal((await o.executer({ personnage: "Lucie", action: "ecrire", ...ARGS })).erreur, true, "rien à écrire");
  },
  async "résumé d'un personnage : une ligne des pages publiques, jamais la page secrète ; le narrateur la reçoit à part"(M) {
    monde("impmal");
    await outil(M, "histoire_personnage").executer({ personnage: "Lucie", action: "ecrire", ...ARGS, son_histoire: "Née dans la ruche basse.", ce_qu_il_garde: "SECRET-DE-LUCIE" });
    const resume = M.a.adaptateurDe("impmal").resumer(game.actors.get("s1"));
    assert.match(resume, /histoire : Née dans la ruche basse\./);
    assert.ok(!resume.includes("SECRET-DE-LUCIE"), "secret dans le résumé");
    assert.match(M.H.ligneHistoireActeur(game.actors.get("s1"), { publique: false, secret: true }), /^ses secrets \(connus de son joueur seul\) : SECRET-DE-LUCIE$/);
    game.system.id = "lakour-loups";
    assert.equal(M.H.ligneHistoireActeur(game.actors.get("s1")), "", "pas aux Veillées");
  },
  "titres, questions d'aide et consigne neutres : rien ne suppose un personnage masculin"(M) {
    const masculin = /(^|[^\p{L}'])(il|lui|qu'il|s'il|amené|seul)(?![\p{L}])/iu;
    for (const p of M.H.PAGES_HISTOIRE) assert.doesNotMatch(p.nom, masculin, p.nom);
    for (const s of ["impmal", "dnd5e", "lakour-survie"]) {
      for (const q of Object.values(M.H.questionsAide(s)).flat()) assert.doesNotMatch(q, masculin, q);
      assert.doesNotMatch(M.H.etapeHistoire(s, "Jordan").split("Puis histoire_personnage")[0], masculin);
    }
  },
  async "journal d'avant les titres neutres (« Qui il est », « Ce qu'il garde pour lui ») : pages retrouvées et écrites, titres gardés"(M) {
    const { journaux } = monde();
    const anciens = ["Qui il est", "Son histoire", "Ce qu'il garde pour lui", "Chapitres"];
    const pages = new Collection(anciens.map((name, i) => [`V${i}`, { id: `V${i}`, name, text: { content: "" }, flags: {} }]));
    const j = { id: "JV", uuid: "JournalEntry.JV", name: "Histoire de Lucie", pages,
      async updateEmbeddedDocuments(_t, maj) { for (const m of maj) pages.get(m._id).text.content = m["text.content"]; } };
    journaux.set("JV", j);
    game.actors.get("s1").flags["lakour-mj-ia"] = { histoire: j.uuid };
    const r = await outil(M, "histoire_personnage").executer({ personnage: "Lucie", action: "ecrire", ...ARGS, qui_il_est: "Infirmière.", ce_qu_il_garde: "SECRET-ANCIEN" });
    assert.ok(!r.erreur && !/introuvables/.test(r.contenu), r.contenu);
    assert.equal(journaux.size, 1, "pas de nouveau journal");
    assert.equal(pages.get("V0").text.content, "<p>Infirmière.</p>");
    assert.equal(pages.get("V2").text.content, "<p>SECRET-ANCIEN</p>");
    assert.deepEqual(pages.contents.map(p => p.name), anciens, "titres d'origine gardés");
    assert.match(M.H.ligneHistoireActeur(game.actors.get("s1"), { publique: false, secret: true }), /SECRET-ANCIEN/);
    // Le drapeau prime sur le titre : une page renommée par le MJ reste reconnue.
    pages.get("V2").name = "Mes secrets à moi";
    pages.get("V2").flags = { "lakour-mj-ia": { page: "secret" } };
    assert.equal(M.H.pageDe(j, "secret").id, "V2");
  },
  async "compagnon IA : le résumé de son histoire entre dans sa personnalité ; sa vue a sa propre page secrète, jamais celle d'un autre"(M) {
    monde();
    const o = outil(M, "histoire_personnage");
    await o.executer({ personnage: "Lucie", action: "ecrire", ...ARGS, son_histoire: "Lucie a fui.", ce_qu_il_garde: "SECRET-DE-LUCIE" });
    await o.executer({ personnage: "Eddy", action: "ecrire", ...ARGS, son_histoire: "Eddy réparait les grues du Port.", ce_qu_il_garde: "Il a laissé son frère." });
    const p = game.actors.get("s2").flags["lakour-mj-ia"].compagnon;
    assert.equal(p.histoire, "Eddy réparait les grues du Port. Ce que tu gardes pour toi : Il a laissé son frère.");
    assert.equal(p.temperament, "prudent", "la personnalité reste");
    await o.executer({ personnage: "Eddy", action: "completer", ...ARGS, qui_il_est: "Grand.", resume_compagnon: "Tu es Eddy, mécanicien." });
    assert.equal(game.actors.get("s2").flags["lakour-mj-ia"].compagnon.histoire, "Tu es Eddy, mécanicien.");
    const vue = JSON.stringify(M.c.vueAventure(game.actors.get("s2"), { messages: [] }));
    assert.ok(vue.includes("Il a laissé son frère"), "sa propre page secrète");
    assert.ok(!vue.includes("SECRET-DE-LUCIE"), "la page secrète d'un autre");
  },
  async "hors des trois mondes : refusé"(M) {
    monde("lakour-loups");
    assert.equal((await outil(M, "histoire_personnage").executer({ personnage: "Lucie", action: "preparer", ...ARGS })).erreur, true);
    assert.ok(!M.o.outilsDuSysteme("lakour-loups").some(x => x.nom === "histoire_personnage"));
    for (const s of ["impmal", "dnd5e", "lakour-survie"]) assert.ok(M.o.outilsDuSysteme(s).some(x => x.nom === "histoire_personnage"), s);
  },
  async "bouton des fiches : visible du MJ et du propriétaire, dans les trois mondes ; il ouvre ou crée le journal"(M) {
    const { crochets, journaux } = monde();
    M.h.brancherHistoire();
    const controles = [];
    for (const fn of crochets.get("getHeaderControlsActorSheetV2") ?? []) fn({ document: game.actors.get("s1") }, controles);
    assert.equal(controles.length, 1);
    assert.equal(controles[0].action, "lakourHistoire");
    await controles[0].onClick();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(journaux.size, 1, "créé par le MJ");
    assert.equal(journaux.contents[0].rendu, 1, "ouvert");
    assert.equal(M.h.boutonVisible(game.actors.get("s2"), { system: { id: "dnd5e" }, user: { isGM: false } }), false, "ni MJ ni propriétaire");
    assert.equal(M.h.boutonVisible(game.actors.get("s1"), { system: { id: "dnd5e" }, user: { isGM: false } }), true, "propriétaire");
    assert.equal(M.h.boutonVisible(game.actors.get("s1"), { system: { id: "lakour-loups" }, user: { isGM: true } }), false, "pas aux Veillées");
    assert.equal(M.h.boutonVisible(game.actors.get("abri1"), { system: { id: "lakour-survie" }, user: { isGM: true } }), false, "un abri n'a pas d'histoire");
    assert.equal(M.h.boutonVisible(game.actors.get("abri1"), { system: { id: "dnd5e" }, user: { isGM: true } }), true, "ailleurs, tout acteur (PNJ important)");
    // La fiche de survivant de Fénoir a déjà son bouton (action « histoire ») : pas de second bouton dans son en-tête.
    const deja = [];
    for (const fn of crochets.get("getHeaderControlsActorSheetV2") ?? []) fn({ document: game.actors.get("s1"), options: { actions: { histoire() {} } } }, deja);
    assert.equal(deja.length, 0);
  },
  async "un joueur sans journal le demande au MJ actif, qui le crée et le lui renvoie ; un autre joueur est refusé"(M) {
    const { journaux, emis } = monde("lakour-survie", { moi: "u1" });
    M.h.brancherHistoire();
    await M.h.ouvrirHistoire(game.actors.get("s1"));
    assert.deepEqual(emis[0], { message: { type: "histoire.creer", acteurId: "s1", userId: "u1" }, recipients: ["mj"] });
    game.user = game.users.get("mj");
    const { traiter } = M.ca;
    await traiter({ type: "histoire.creer", acteurId: "s2", userId: "u1" }, "u1");
    assert.equal(journaux.size, 0, "s2 n'est pas à lui");
    await traiter({ type: "histoire.creer", acteurId: "s1", userId: "u1" }, "u1");
    await new Promise(r => setTimeout(r, 0));
    assert.equal(journaux.size, 1);
    assert.deepEqual(emis.at(-1), { message: { type: "histoire.ouvrir", uuid: journaux.contents[0].uuid }, recipients: ["u1"] });
  },
  "création guidée : l'histoire après la fiche, dans les trois mondes, avec le contenu de chacun"(M) {
    for (const [s, motif] of [["impmal", /origine \(monde natal\), sa faction/], ["dnd5e", /son peuple, son historique, sa classe/], ["lakour-survie", /son enfance, son passé/]]) {
      const c = M.mo.consigneCreation("Jordan", { systeme: s });
      assert.match(c, /Après la fiche\. Histoire : pose à Jordan deux ou trois questions courtes/);
      assert.match(c, motif);
      assert.match(c, /histoire_personnage/);
    }
    assert.match(M.mo.consigneCreation("Jordan", { systeme: "lakour-survie" }), /creer_survivant, action « tirer »/);
  }
};

const MUTATIONS = [
  ["histoire-logique.js", "ownership: p.prive ? { default: NONE, ...proprio } : { default: INHERIT },", "ownership: { default: INHERIT },", "page secrète réservée"],
  ["histoire-logique.js", "?? [def.nom, ...def.anciens].map(", "?? [def.nom].map(", "anciens titres reconnus"],
  ["histoire-logique.js", "\"Comment as-tu rejoint le groupe ?\"", "\"Qu'est-ce qui t'a amené jusqu'au groupe ?\"", "questions neutres"],
  ["histoire-logique.js", "export function ligneHistoire(journal, { secret = false,", "export function ligneHistoire(journal, { secret = true,", "secret dans le résumé"],
  ["histoire-logique.js", "  if (mode === \"ecrire\" || estAide(ancien)) return html;", "  if (mode === \"ecrire\") return html;", "aide remplacée"],
  ["histoire.js", "  if (deja) return { journal: deja, cree: false };", "", "un seul journal"],
  ["histoire.js", "    if (!acteur || !u || !acteur.testUserPermission(u, \"OWNER\")) return;", "    if (!acteur || !u) return;", "demande d'un autre joueur"],
  ["outils-histoire.js", "      if (estCompagnon(acteur) && action !== \"chapitre\"", "      if (false && action !== \"chapitre\"", "résumé du compagnon"],
  ["compagnons-jeu.js", "ligneHistoireActeur(acteur, { publique: false, secret: true })].filter(Boolean)", "\"\"].filter(Boolean)", "sa propre page secrète"],
  ["moteur.js", "    `Après la fiche. ${etapeHistoire(systeme, nomJoueur)}`,\n", "", "consigne de création"]
];

const RACINE = fileURLToPath(new URL("../", import.meta.url));
async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-histoire-mutant-"));
  for (const d of ["scripts", "vendor"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  const chemin = join(dossier, "scripts", fichier);
  const texte = readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
  assert.ok(texte.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
  writeFileSync(chemin, texte.replace(avant, apres));
  try { return await charger(join(dossier, "scripts")); } finally { rmSync(dossier, { recursive: true, force: true }); }
}
async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push(`${nom} : ${e.message}`); }
  }
  return liste;
}

test("histoire des personnages : le moteur d'origine passe toute la batterie", async () => {
  assert.deepEqual(await echecs(await charger()), []);
});

test("histoire des personnages : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});

// L'acteur de la doublure sert aussi aux essais d'autres fichiers ; rien à faire ici.
void faireActeur;
