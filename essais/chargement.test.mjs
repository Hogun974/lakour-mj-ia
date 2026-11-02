// Chaque script du module se charge (comme dans le navigateur) sans erreur de syntaxe de module : un export en double ou un
// import manquant empêche TOUT le moteur de démarrer (réglages non enregistrés), même dans les fichiers qu'aucun autre essai
// n'importe (fenêtres).  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = fileURLToPath(new URL("../scripts/", import.meta.url));
const fichiers = dossier => readdirSync(dossier).flatMap(f => {
  const p = join(dossier, f);
  return statSync(p).isDirectory() ? fichiers(p) : p.endsWith(".js") ? [p] : [];
});

test("chargement : aucun script n'a d'erreur de syntaxe de module (export en double, import introuvable)", async () => {
  const erreurs = [];
  for (const f of fichiers(RACINE)) {
    try { await import(pathToFileURL(f).href); }
    catch (e) { if (e instanceof SyntaxError) erreurs.push(`${f.slice(RACINE.length)} : ${e.message}`); }
  }
  assert.deepEqual(erreurs, []);
});
