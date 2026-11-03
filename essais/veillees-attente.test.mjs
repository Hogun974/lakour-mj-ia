// MJ IA 0.35.0 et système lakour-loups 0.9.0 (relecture 8) : quand les écritures de la partie sont bloquées aux Veillées (le MJ actif
// n'a pas encore les secrets à jour : api.ecritureBloquee()), le MJ IA se met en pause au lieu de relancer des appels facturés :
// - le narrateur n'appelle pas le modèle (un seul avis au MJ), puis repart quand les secrets sont revenus ;
// - un outil loups_* reçu entre-temps rend une erreur explicite (« ne relance pas »), sans rien exécuter ;
// - le pilote automatique s'arrête (raison « secrets », avis) sans se suspendre : il repart seul ;
// - les compagnons n'appellent pas leur modèle.
// Doublures, aucun appel payant. Chaque règle est rejouée sur des copies mutées.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const reglages = { miseEnPlace: false, voix: "aucune", budgetSeance: 0, delaiReponse: 0, pilote: true, autonomie: "autonome",
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 },
  personnalites: [{ id: "p", nom: "Essai", nomAffiche: "MJ" }], personnaliteActive: "p", fournisseur: "factice" };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { deepClone: o => structuredClone(o) } };
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.ChatMessage = { implementation: { create: async d => { const m = { ...d, update: async u => Object.assign(m, u), delete: async () => {} }; return m; } } };
let bloque = true;
const api = { etat: () => ({ partie: "p", phase: "jour", vainqueur: "" }), villageois: () => [], ecritureBloquee: () => bloque };
globalThis.game = {
  settings: { get: (_m, k) => reglages[k], set: async (_m, k, v) => { reglages[k] = v; } },
  combats: { active: null }, users: { filter: () => [], get: () => null }, user: {}, actors: { filter: () => [] },
  i18n: { localize: k => k, format: k => k, has: () => false }, world: { id: "essai" }, system: { id: "lakour-loups" }, lakourLoups: api,
  modules: new Map()
};

const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
async function charger(racine = SCRIPTS) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [moteur, pilote, compagnons] = await Promise.all([m("moteur.js"), m("pilote.js"), m("compagnons-jeu.js")]);
  return { moteur, pilote, compagnons };
}

const VERIFICATIONS = {
  async "narrateur : aucun appel au modèle pendant l'attente (un seul avis), puis il repart"(M) {
    bloque = true;
    const moteur = new M.moteur.MoteurMJ();
    let appels = 0;
    moteur.fournisseur = { ajouterUtilisateur() {}, ajouterResultats() {}, envoyer: async () => { appels++; return { texte: "La nuit tombe.", appels: [], usage: {} }; } };
    moteur.compter = async () => {};
    const avis = [];
    moteur.prevenirMJ = async t => { avis.push(t); };
    const tour = () => moteur.tour("[Étape] la nuit.", { fil: {}, systeme: "S", outils: [], sauver: false });
    await tour();
    await tour();
    assert.equal(appels, 0, "aucun appel facturé");
    assert.deepEqual(avis, ["LAKOUR_MJIA.Erreurs.SecretsVeillees"], "un seul avis au MJ");
    bloque = false;
    await tour();
    assert.equal(appels, 1, "les secrets revenus, il repart");
  },
  async "outil loups_* reçu pendant l'attente : erreur explicite, rien d'exécuté"(M) {
    bloque = true;
    let execute = 0;
    const outils = [{ nom: "loups_vote", systemes: ["lakour-loups"], schema: { type: "object", properties: {} }, executer: async () => { execute++; return { contenu: "ok" }; } }];
    const r = await M.moteur.MoteurMJ.prototype.executer.call({}, { id: "a", nom: "loups_vote", args: {} }, outils);
    assert.equal(r.erreur, true);
    assert.match(r.contenu, /En attente des secrets.*Ne relance aucun outil/s);
    assert.equal(execute, 0);
    bloque = false;
    const r2 = await M.moteur.MoteurMJ.prototype.executer.call({}, { id: "b", nom: "loups_vote", args: {} }, outils);
    assert.equal(r2.erreur, false);
    assert.equal(execute, 1);
  },
  "pilote : arrêté pendant l'attente (avis), jamais suspendu : il repartira seul"(M) {
    bloque = true;
    const avis = [];
    const moteur = { actif: true, auRepos: () => true, budgetDepasse: () => false, compagnons: { maxRepliques: () => 2 } };
    const p = new M.pilote.PiloteAutomatique({ moteur, api: () => api, aviser: t => avis.push(t) });
    assert.deepEqual(p.conditions(), { ok: false, raison: "secrets" });
    p.enMarche = true;
    p.verifier();
    assert.equal(p.enMarche, false);
    assert.ok(avis.includes("LAKOUR_MJIA.Pilote.Secrets"), avis.join(" | "));
    assert.equal(p.suspendu, false, "pas suspendu : il repart de lui-même");
    bloque = false;
    assert.notEqual(p.conditions().raison, "secrets");
  },
  "compagnons : aucun appel de leur modèle pendant l'attente"(M) {
    const c = new M.compagnons.Compagnons({ moteur: { budgetDepasse: () => false } });
    bloque = true;
    assert.equal(c.cerveaux.budgetDepasse(), true);
    bloque = false;
    assert.equal(c.cerveaux.budgetDepasse(), false);
  }
};

const MUTATIONS = [
  ["moteur.js", "    if (secretsVeilleesEnAttente()) {\n      if (!this.avisSecrets)", "    if (false) {\n      if (!this.avisSecrets)", "narrateur en pause"],
  ["moteur.js", "      this.avisSecrets = true;\n      return null;", "      return null;", "un seul avis"],
  ["moteur.js", "    if (def.systemes?.includes(\"lakour-loups\") && secretsVeilleesEnAttente()) {", "    if (false) {", "outil loups_* refusé"],
  ["pilote.js", "      if (api.ecritureBloquee?.()) return { ok: false, raison: \"secrets\" };\n", "", "pilote en pause"],
  ["pilote.js", "  humain: \"Humain\", validation: \"Validation\", reglage: \"Coupe\", secrets: \"Secrets\" };", "  humain: \"Humain\", validation: \"Validation\", reglage: \"Coupe\" };", "avis du pilote"],
  ["compagnons-jeu.js", "Boolean(this.moteur?.budgetDepasse?.()) || secretsVeilleesEnAttente(),", "Boolean(this.moteur?.budgetDepasse?.()),", "compagnons en pause"],
  ["utilitaires.js", "  try { return Boolean(globalThis.game?.lakourLoups?.ecritureBloquee?.()); } catch { return false; }", "  return false;", "attente lue du système"]
];

const RACINE = fileURLToPath(new URL("../", import.meta.url));
async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-attente-mutant-"));
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
  bloque = false;
  return liste;
}

test("attente des secrets des Veillées : le moteur d'origine passe toute la batterie", async () => {
  assert.deepEqual(await echecs(await charger()), []);
});

test("attente des secrets des Veillées : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
