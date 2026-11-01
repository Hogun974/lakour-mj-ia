// L'appel « à toi » (40k, Warcraft, et les votes du MJ IA aux Veillées) : un tintement chez le seul joueur attendu — vote
// de groupe, choix secret, son tour de combat, sa parole au tour de table —, jamais diffusé, jamais chez le MJ, coupé par
// son réglage client ; au combat, pas de second son si un thème de combat de Foundry joue déjà ; le titre de l'onglet
// clignote s'il regarde ailleurs. Chaque vérification est rejouée sur des copies mutées du moteur.  Lancer : npm run essais
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installer, reinitialiser, etat, U, comme, livrerTout } from "./doublures/foundry-decisions.mjs";

installer();
const RACINE = fileURLToPath(new URL("../", import.meta.url));

async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [appel, logique, decisions, outils] = await Promise.all([m("scripts/appel.js"), m("scripts/tour-logique.js"), m("scripts/decisions.js"), m("scripts/outils.js")]);
  decisions.brancherDecisions();
  return { appel, L: logique, decisions, outils, bandeau: readFileSync(join(racine, "scripts/apps/tour-par-tour.js"), "utf8") };
}

// Les sons joués, avec le navigateur qui les joue ; réglages lus dans `reglages`.
let sons = [];
function preparer({ appelJoueur, combatTheme = "none" } = {}) {
  reinitialiser();
  sons = [];
  const get = game.settings.get;
  game.settings.get = (module, cle) => (cle === "appelJoueur" ? appelJoueur : cle === "combatTheme" ? combatTheme : get(module, cle));
  globalThis.CONFIG = { sounds: { notification: "sounds/notify.wav" } };
  foundry.audio = { AudioHelper: { play: (donnees, diffuser) => { sons.push({ chez: game.user.id, donnees, diffuser }); } } };
  return () => { game.settings.get = get; };
}

const VERIFICATIONS = {
  "un tintement chez le joueur, local, sur le canal interface ; rien chez le MJ ; réglage coupé : rien"(M) {
    let rendre = preparer();
    try {
      assert.equal(M.appel.appeler("LAKOUR_MJIA.Appel.Vote"), false, "le MJ n'est pas appelé");
      comme(U.Jordan, () => assert.equal(M.appel.appeler("LAKOUR_MJIA.Appel.Vote"), true));
      assert.equal(sons.length, 1);
      assert.equal(sons[0].diffuser, false, "jamais diffusé");
      assert.equal(sons[0].donnees.channel, "interface");
      comme(U.Jordan, () => M.appel.appeler("x", { son: false }));
      assert.equal(sons.length, 1, "son: false : le titre seul");
    } finally { rendre(); }
    rendre = preparer({ appelJoueur: false });
    try { comme(U.Jordan, () => assert.equal(M.appel.appeler("x"), false)); assert.equal(sons.length, 0); }
    finally { rendre(); }
  },

  async "un vote de groupe appelle chaque joueur visé, chez lui"(M) {
    const rendre = preparer();
    try {
      await M.outils.OUTILS.find(o => o.nom === "vote_groupe").executer({ action: "ouvrir", question: "Que fait le groupe ?",
        options: ["On attaque", "On fuit"], personnages: false, joueurs: [], delai: 0, anonyme: false });
      await livrerTout();
      const appeles = sons.map(s => s.chez).sort();
      assert.ok(appeles.length >= 2, `des joueurs appelés : ${appeles}`);
      assert.ok(!appeles.includes(U.Hogun.id), "pas le MJ");
      assert.equal(new Set(appeles).size, appeles.length, "une fois chacun");
    } finally {
      await M.outils.OUTILS.find(o => o.nom === "vote_groupe").executer({ action: "clore", question: "", options: [], personnages: false, joueurs: [], delai: 0, anonyme: false }).catch(() => null);
      await livrerTout();
      rendre();
    }
  },

  async "un choix secret appelle son destinataire"(M) {
    const rendre = preparer();
    try {
      await comme(U.Jordan, () => M.decisions.ouvrirFenetreChoix({ id: "c1", titre: "Choix", question: "Lequel ?", options: ["a", "b"], delai: 10000 }));
      assert.deepEqual(sons.map(s => s.chez), [U.Jordan.id]);
    } finally { rendre(); }
  },

  "le bandeau : une clé par tour qui attend le joueur, rien sinon"(M) {
    const { cleDAppel } = M.L;
    assert.equal(cleDAppel(null), "");
    assert.equal(cleDAppel({ combat: true, aMoi: false, round: 1, actif: "Gobelin" }), "");
    const a = cleDAppel({ combat: true, aMoi: true, round: 1, actif: "Brin" });
    assert.ok(a);
    assert.notEqual(cleDAppel({ combat: true, aMoi: true, round: 2, actif: "Brin" }), a, "round suivant : nouvel appel");
    assert.notEqual(cleDAppel({ combat: true, aMoi: true, round: 1, actif: "Mira" }), a, "son second personnage : nouvel appel");
    assert.ok(cleDAppel({ table: true, aMoi: true, tour: 1, orateur: "Brin" }));
    assert.equal(cleDAppel({ table: true, aMoi: false, tour: 1, orateur: "Mira" }), "");
  },

  "le bandeau appelle une fois par tour, sans doubler le thème de combat"(M) {
    assert.match(M.bandeau, /if \(cle && cle !== dernierAppel\) \{/);
    assert.match(M.bandeau, /\{ son: !\(ctx\.combat && themeDeCombat\(\)\) \}/);
    assert.match(M.bandeau, /dernierAppel = cle;/);
    const rendre = preparer({ combatTheme: "epic" });
    try { assert.equal(M.appel.themeDeCombat(), true); } finally { rendre(); }
    const rendre2 = preparer();
    try { assert.equal(M.appel.themeDeCombat(), false); } finally { rendre2(); }
  },

  "onglet caché : le titre clignote jusqu'au retour"(M) {
    const rendre = preparer();
    const ecouteurs = new Map();
    globalThis.document = { hidden: true, title: "LaKour", addEventListener: (n, f) => ecouteurs.set(n, f), removeEventListener: n => ecouteurs.delete(n) };
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      comme(U.Jordan, () => M.appel.appeler("À toi"));
      mock.timers.tick(1000);
      assert.equal(document.title, "🔔 À toi");
      document.hidden = false;
      ecouteurs.get("visibilitychange")();
      mock.timers.tick(3000);
      assert.equal(document.title, "LaKour");
    } finally { mock.timers.reset(); M.appel.arreterClignotement(); delete globalThis.document; rendre(); }
  }
};

const MUTATIONS = [
  ["scripts/appel.js", "if (game.user?.isGM || !lireReglage()) return false;", "", "ni MJ ni réglage coupé"],
  ["scripts/appel.js", "channel: \"interface\" }, false);", "channel: \"interface\" }, true);", "jamais diffusé"],
  ["scripts/appel.js", "  if (son) {", "  if (true) {", "le titre seul"],
  ["scripts/appel.js", "return (game.settings.get(\"core\", \"combatTheme\") ?? \"none\") !== \"none\";", "return false;", "thème de combat"],
  ["scripts/appel.js", "const retour = () => { if (!document.hidden) arreterClignotement(); };", "const retour = () => {};", "retour à l'onglet"],
  ["scripts/decisions.js", "  appeler(\"LAKOUR_MJIA.Appel.Vote\");\n", "", "vote appelé"],
  ["scripts/decisions.js", "  appeler(\"LAKOUR_MJIA.Appel.Choix\");\n", "", "choix appelé"],
  ["scripts/tour-logique.js", "if (!ctx?.aMoi) return \"\";", "", "seulement son tour"],
  ["scripts/tour-logique.js", "`combat|${ctx.round ?? 0}|${ctx.actif ?? \"\"}`", "\"combat\"", "un appel par tour"],
  ["scripts/apps/tour-par-tour.js", "if (cle && cle !== dernierAppel) {", "if (cle) {", "une fois par tour"]
];

async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-appel-mutant-"));
  for (const d of ["scripts", "vendor"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  const chemin = join(dossier, fichier);
  const texte = readFileSync(chemin, "utf8");
  assert.ok(texte.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
  writeFileSync(chemin, texte.replace(avant, apres));
  try { return await charger(dossier); }
  finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push({ nom, e }); }
  }
  return liste;
}

test("appel : le moteur d'origine passe toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("appel : chaque règle cassée est détectée par la batterie", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
