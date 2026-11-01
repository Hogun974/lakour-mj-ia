// Chaque clé de traduction utilisée dans le code d'un module existe en français ET en anglais, et les deux fichiers ont
// exactement les mêmes clés (outils/contrat-contenu.mjs, ecartsTraductions).  Lancer : npm run essais
// Ici : le MJ IA lui-même, et un module d'essai qui prouve que le contrôle attrape chaque écart. Chaque monde éprouve
// ses propres traductions dans son dépôt (essais/traductions-*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ecartsTraductions } from "../outils/contrat-contenu.mjs";

test("lakour-mj-ia : traductions complètes et cohérentes", () => {
  const e = ecartsTraductions(fileURLToPath(new URL("../", import.meta.url)), "LAKOUR_MJIA");
  assert.deepEqual(e.francaisSeul, [], "clés françaises absentes de l'anglais");
  assert.deepEqual(e.anglaisSeul, [], "clés anglaises absentes du français");
  assert.deepEqual(e.manquantes, []);
});

// Remplace l'essai de lakour-boite-a-outils (module resté dans l'archive foundry-modules, hors des quatre dépôts) :
// même contrôle, sur un petit module d'essai écrit à la volée, avec ses écarts.
test("module d'essai : traductions complètes acceptées, chaque écart signalé (mutation)", () => {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-traductions-"));
  try {
    const ecrire = (chemin, texte) => { mkdirSync(join(dossier, chemin, ".."), { recursive: true }); writeFileSync(join(dossier, chemin), texte); };
    const langue = cles => JSON.stringify({ ESSAI: cles });
    ecrire("lang/fr.json", langue({ Titre: "Titre", Efforts: { facile: "Facile", dur: "Dur" } }));
    ecrire("lang/en.json", langue({ Titre: "Title", Efforts: { facile: "Easy", dur: "Hard" } }));
    ecrire("scripts/main.js", "game.i18n.localize('ESSAI.Titre'); game.i18n.localize(`ESSAI.Efforts.${e}`);\n");
    ecrire("templates/fenetre.hbs", "<h1>{{localize 'ESSAI.Titre'}}</h1>\n");
    assert.deepEqual(ecartsTraductions(dossier, "ESSAI"), { francaisSeul: [], anglaisSeul: [], manquantes: [] }, "clé dynamique tronquée tolérée");
    ecrire("templates/fenetre.hbs", "<h1>{{localize 'ESSAI.Absente'}}</h1>\n");
    assert.deepEqual(ecartsTraductions(dossier, "ESSAI").manquantes, ["ESSAI.Absente"]);
    ecrire("lang/en.json", langue({ Titre: "Title", Efforts: { facile: "Easy" }, Bonus: "Extra" }));
    const e = ecartsTraductions(dossier, "ESSAI");
    assert.deepEqual(e.francaisSeul, ["ESSAI.Efforts.dur"]);
    assert.deepEqual(e.anglaisSeul, ["ESSAI.Bonus"]);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
