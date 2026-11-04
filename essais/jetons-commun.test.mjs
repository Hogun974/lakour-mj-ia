// Essais des aides communes au dessin des jetons (outils/jetons-commun.mjs), utilisées par les fabricants de jetons des
// trois mondes : lecture des icônes game-icons, rendu plat et relief, contrôle d'un SVG, couleur d'anneau, crédits.
// Les jetons réels de chaque monde sont éprouvés dans son dépôt (essais/jetons.test.mjs, warcraft-*, veillees-jetons).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOSSIER_ICONES, controleurJetons, couleurAnneau, dessinerJetons, erreursSvg, jetonPlat, jetonRelief, lireIcone, tableauCredits, tracesIcone
} from "../outils/jetons-commun.mjs";

// Déplacé de l'ancien essai des jetons : il n'éprouve que l'aide commune.
test("le lecteur d'icônes refuse tout ce qui n'est pas un simple tracé (mutation)", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path fill="#fff" d="M10 10h20v20z"/></svg>';
  assert.deepEqual(tracesIcone(base), ["M10 10h20v20z"]);
  assert.throws(() => tracesIcone(base.replace("<path fill", '<image href="x.png"/><path fill')), /balises inattendues/);
  assert.throws(() => tracesIcone(base.replace("M10 10h20v20z", "M10 10 url(javascript:x)")), /tracé illisible/);
  assert.throws(() => tracesIcone(base.replace("512 512", "24 24")), /512×512/);
});

test("icônes partagées : toutes lisibles, licence présente ; nom, auteur ou icône inconnus refusés", () => {
  const auteurs = Object.fromEntries(readdirSync(DOSSIER_ICONES, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => [e.name, e.name]));
  assert.ok(readdirSync(DOSSIER_ICONES).includes("license.txt"), "licence CC BY 3.0 de game-icons.net");
  let n = 0;
  for (const auteur of Object.keys(auteurs)) {
    for (const f of readdirSync(join(DOSSIER_ICONES, auteur))) { assert.ok(lireIcone(`${auteur}/${f.slice(0, -4)}`, { auteurs }).length); n++; }
  }
  assert.ok(n >= 100, `${n} icônes seulement`);
  const [auteur] = Object.keys(auteurs);
  assert.throws(() => lireIcone("Pas Bon", { auteurs }), /Nom d'icône invalide/);
  assert.throws(() => lireIcone("inconnu/epee", { auteurs }), /Auteur game-icons inconnu : inconnu/);
  assert.throws(() => lireIcone(`${auteur}/icone-qui-n-existe-pas`, { auteurs }), /absente de outils\/game-icons\/ : relancer avec --source/);
});

test("rendu plat et relief : SVG autonomes, anneau lisible ; fabrication et contrôle sur un dossier d'essai (mutation)", () => {
  const traces = ["M10 10h20v20z"];
  for (const dessin of [jetonPlat, jetonRelief]) {
    for (const lisere of [null, "#c9a227"]) {
      const svg = dessin({ titre: "Garde & <capitaine>", couleur: "#8a1414", attitude: "hostile", lisere, traces });
      assert.deepEqual(erreursSvg(svg, "essai"), [], `${dessin.name} ${lisere}`);
      assert.equal(couleurAnneau(svg), "#8a1414");
      assert.match(svg, /<title>Garde &amp; &lt;capitaine&gt;<\/title>/);
    }
  }
  const dossier = mkdtempSync(join(tmpdir(), "lakour-jetons-"));
  try {
    // Une archive « source » d'une seule icône : copiée dans le dossier d'icônes d'essai, avec sa licence.
    const source = join(dossier, "source"), icones = join(dossier, "icones");
    mkdirSync(join(source, "lorc"), { recursive: true });
    writeFileSync(join(source, "lorc", "epee.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path d="M1 1h9v9z"/></svg>');
    writeFileSync(join(source, "license.txt"), "CC BY 3.0");
    const fichiers = new Map();
    const ecrire = (chemin, texte) => fichiers.set(chemin, texte);
    const jetons = [{ icone: "lorc/epee", titre: "Bretteur", anneau: { couleur: "#2e7d36", attitude: "allie" }, plat: "j/bretteur.svg", relief: "j/3d/bretteur.svg" }];
    dessinerJetons(jetons, { ecrire, auteurs: { lorc: "Lorc" }, source, dossierIcones: icones });
    assert.deepEqual(readdirSync(icones).sort(), ["license.txt", "lorc"]);
    assert.deepEqual([...fichiers.keys()], ["j/bretteur.svg", "j/3d/bretteur.svg"]);
    const lire = c => fichiers.get(c) ?? null;
    const erreurs = [];
    const controler = controleurJetons(lire, erreurs);
    controler("j/bretteur.svg", "bretteur", "#2e7d36");
    controler("j/3d/bretteur.svg", "bretteur (3D)", "#2e7d36");
    assert.deepEqual(erreurs, []);
    controler("j/absent.svg", "fantôme", "#2e7d36");
    controler("j/bretteur.svg", "bretteur", "#8a1414");
    assert.deepEqual(erreurs, ["fantôme : jeton absent (j/absent.svg)", "j/bretteur.svg : anneau #2e7d36 au lieu de #8a1414"]);
    const { lignes, auteurs } = tableauCredits([...jetons, { ...jetons[0], titre: "Duelliste" }], { lorc: "Lorc" });
    assert.equal(lignes, "| [epee](https://game-icons.net/1x1/lorc/epee.html) | Lorc | Bretteur ; Duelliste |");
    assert.equal(auteurs, "Lorc");
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
