// MJ IA 0.35.0 et système lakour-loups 0.9.0 : les secrets des Veillées ne se lisent plus dans les documents.
// - rôles et camps lus par l'API du système (roleLoups, campLoups ; adaptateur, vue d'un compagnon, distribution du narrateur),
//   jamais l'objet d'un document (un leurre posé sur le document n'est pas lu) ; repli sur le document avec un système d'avant ;
// - aux Veillées, ni mémoire de campagne ni journal créé par l'IA (outils absents, et refusés s'ils sont appelés) ;
// - aux Veillées, la chronique de campagne (lisible de tous) ni proposée ni acceptée pendant une partie en cours ; hors partie, oui.
// Doublures, aucun appel payant. Chaque règle est rejouée sur des copies mutées.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { deepClone: o => structuredClone(o) } };
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));

async function charger(racine = SCRIPTS) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [u, a, o, c] = await Promise.all([m("utilitaires.js"), m("adaptateurs.js"), m("outils.js"), m("compagnons-jeu.js")]);
  return { u, a, o, c };
}

// Un village : l'acteur porte sur son document un LEURRE (rôle et camp d'avant 0.9.0) ; la vérité est dans les secrets du MJ.
function monde({ apiSecrets = true } = {}) {
  const acteur = {
    id: "a1", name: "Ysaline", type: "villageois",
    system: { joueur: "", compagnon: true, vivant: true, revele: false, camp: "village", maison: "Maison 2", amoureux: "", silence: false },
    items: [{ type: "role", name: "LEURRE-ROLE", system: { cle: "villageois", camp: "village", description: "<p>LEURRE</p>" } }]
  };
  acteur.items.find = Array.prototype.find.bind(acteur.items);
  const vrai = { name: "VRAI-ROLE", img: "", system: { cle: "loup-de-brumecombe", camp: "meute", description: "<p>Tu chasses.</p>", victoire: "" } };
  const pub = { partie: "p", phase: "jour", tour: 1, morts: [], vote: {}, historique: [], partis: [], registre: [] };
  const api = {
    logique: { etatPublic: e => e }, etat: () => structuredClone(pub), villageois: () => [acteur], carnet: () => [],
    gensDePassage: () => [], peutSouffler: () => ({ aSonSouffle: false }), bailli: () => null, presage: () => ({ cle: "" }),
    registreTexte: () => [], banc: () => ({ actif: false }), deuil: () => ({ actif: false }),
    ...(apiSecrets ? { roleDe: a => (a?.id === "a1" ? vrai : null), campDe: a => (a?.id === "a1" ? "meute" : ""), fiche: id => (id === "a1" ? { camp: "meute", amoureux: "", protections: 0, role: vrai } : null) } : {})
  };
  globalThis.game = { system: { id: "lakour-loups" }, lakourLoups: api, users: { get: () => null }, i18n: { has: () => false, localize: k => k } };
  return { acteur, api };
}

const VERIFICATIONS = {
  "roleLoups / campLoups : les secrets du système ; le document seulement avec un système d'avant 0.9.0"(M) {
    const { acteur, api } = monde();
    assert.equal(M.u.roleLoups(acteur, api).name, "VRAI-ROLE");
    assert.equal(M.u.campLoups(acteur, api), "meute");
    const ancien = monde({ apiSecrets: false });
    assert.equal(M.u.roleLoups(ancien.acteur, ancien.api).name, "LEURRE-ROLE");
  },
  "adaptateur des Veillées (resumer) : le rôle et le camp secrets, jamais le leurre du document"(M) {
    monde();
    const texte = M.a.adaptateur().resumer(game.lakourLoups.villageois()[0]);
    assert.match(texte, /VRAI-ROLE \(camp meute\)/);
    assert.ok(!texte.includes("LEURRE"), texte);
  },
  "vue d'un compagnon : son rôle et son camp secrets, jamais le leurre"(M) {
    const { acteur } = monde();
    const v = M.c.vueVeillees(acteur, { api: game.lakourLoups, messages: [] });
    const texte = JSON.stringify(v);
    assert.match(texte, /VRAI-ROLE \(camp meute\)/);
    assert.match(texte, /Masques de veillée/, "il se sait loup (son camp secret)");
    assert.ok(!texte.includes("LEURRE"), "le leurre du document");
  },
  "aux Veillées, ni mémoire de campagne ni journal créé par l'IA ; ailleurs, oui"(M) {
    monde();
    const noms = M.o.outilsDuSysteme("lakour-loups").map(o => o.nom);
    for (const n of ["noter_memoire", "creer_journal"]) assert.ok(!noms.includes(n), `${n} proposé aux Veillées`);
    for (const n of ["noter_memoire", "creer_journal"]) assert.ok(M.o.outilsDuSysteme("impmal").some(o => o.nom === n), `${n} absent ailleurs`);
  },
  async "aux Veillées, un appel à noter_memoire ou creer_journal est refusé sans rien écrire"(M) {
    monde();
    let ecrit = 0;
    globalThis.JournalEntry = { implementation: { create: async () => { ecrit++; return {}; } } };
    game.journal = { find: () => null };
    for (const nom of ["noter_memoire", "creer_journal"]) {
      const o = M.o.OUTILS.find(x => x.nom === nom);
      const r = await o.executer({ section: "Résumé", texte: "Ysaline est loup.", titre: "Notes", pages: [{ titre: "x", texte: "Ysaline est loup." }], visible_joueurs: false });
      assert.equal(r.erreur, true, nom);
    }
    assert.equal(ecrit, 0, "aucun journal du monde");
  },
  async "aux Veillées, ecrire_chronique : ni proposé ni accepté pendant une partie ; proposé avant et après"(M) {
    const { api } = monde();
    const proposee = () => M.o.outilsDuSysteme("lakour-loups").some(o => o.nom === "ecrire_chronique");
    assert.ok(!proposee(), "proposée pendant la partie");
    let ecrit = 0;
    globalThis.JournalEntry = { implementation: { create: async () => { ecrit++; return {}; } } };
    game.journal = { find: () => null };
    const r = await M.o.OUTILS.find(x => x.nom === "ecrire_chronique").executer({ titre: "Nuit 2", texte: "Ysaline est loup." });
    assert.equal(r.erreur, true, "refusée en garde");
    assert.equal(ecrit, 0);
    const pub = api.etat();
    api.etat = () => ({ ...pub, phase: "fin" });
    assert.ok(proposee(), "après la partie");
    api.etat = () => ({ ...pub, partie: "", phase: "preparation" });
    assert.ok(proposee(), "avant la partie");
    assert.ok(M.o.outilsDuSysteme("impmal").some(o => o.nom === "ecrire_chronique"), "ailleurs");
  }
};

const MUTATIONS = [
  ["utilitaires.js", "  if (typeof api?.roleDe === \"function\") return api.roleDe(acteur) ?? null;\n", "", "rôle lu dans les secrets"],
  ["utilitaires.js", "  if (typeof api?.campDe === \"function\") return api.campDe(acteur) ?? \"\";\n", "", "camp lu dans les secrets"],
  ["adaptateurs.js", "    const role = roleLoups(acteur, api);", "    const role = acteur.items?.find(i => i.type === \"role\");", "adaptateur : rôle secret"],
  ["compagnons-jeu.js", "  const camp = campLoups(acteur, api);", "  const camp = acteur.system.camp;", "compagnon : camp secret"],
  ["outils.js", "    nom: \"noter_memoire\",\n    horsSystemes: [\"lakour-loups\"],", "    nom: \"noter_memoire\",", "mémoire absente aux Veillées"],
  ["outils.js", "    nom: \"creer_journal\",\n    horsSystemes: [\"lakour-loups\"],", "    nom: \"creer_journal\",", "journal absent aux Veillées"],
  ["outils.js", "  if (globalThis.game?.system?.id !== \"lakour-loups\") return null;", "  return null;", "refus en garde"],
  ["outils.js", "    horsPartieLoups: true,\n", "", "chronique absente pendant une partie"],
  ["outils.js", "      if (partieLoupsEnCoursIci()) {\n        return { erreur: true, contenu: \"Pas pendant", "      if (false) {\n        return { erreur: true, contenu: \"Pas pendant", "chronique refusée en garde"],
  ["outils.js", "    return Boolean(e?.partie) && e.phase !== \"fin\";", "    return Boolean(e?.partie);", "chronique rendue à la fin"]
];

const RACINE = fileURLToPath(new URL("../", import.meta.url));
async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-secrets-mutant-"));
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

test("secrets des Veillées : le moteur d'origine passe toute la batterie", async () => {
  assert.deepEqual(await echecs(await charger()), []);
});

test("secrets des Veillées : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
