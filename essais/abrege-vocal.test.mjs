// L'abrégé vocal : à l'écrit tout reste, à l'oral l'essentiel (début de la narration dans la limite de longueur, puis la
// question finale aux joueurs si elle a été coupée), pour que la voix suive le rythme du jeu.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../scripts/", import.meta.url));
const charger = async dossier => import(pathToFileURL(join(dossier, "voix-texte.js")).href);

const LONG = "La brume se lève sur le gué. Les lanternes tremblent au vent. Un chien aboie au loin, puis se tait. "
  + "Sur la place, les volets claquent l'un après l'autre. Une odeur de cendre froide traîne entre les maisons. "
  + "Quelqu'un a laissé une porte ouverte chez le meunier, et la farine s'est envolée jusqu'au puits. "
  + "Le village se réveille lentement, chacun regardant son voisin de travers. Que faites-vous ?";

const VERIFICATIONS = {
  "courte : le début, puis la question finale ; rien de plus"(V) {
    const a = new V.AbregeVocal(V.LONGUEURS_VOIX.courte);
    const dits = V.decouperPourVoix(LONG, 120).filter(m => a.garder(m));
    const total = dits.join(" ").length;
    assert.ok(dits.length >= 1 && total <= V.LONGUEURS_VOIX.courte, `${total} caractères dits`);
    assert.ok(dits[0].startsWith("La brume"), "le début est dit");
    assert.equal(a.fin(LONG), "Que faites-vous ?", "la question finale est ajoutée");
  },
  "texte court : tout est dit, sans doublon de la question"(V) {
    const court = "La porte grince. Qui entre le premier ?";
    const a = new V.AbregeVocal(V.LONGUEURS_VOIX.courte);
    assert.deepEqual(V.decouperPourVoix(court).filter(m => a.garder(m)), [court]);
    assert.equal(a.fin(court), "");
  },
  "le premier morceau est toujours dit, même trop long"(V) {
    const a = new V.AbregeVocal(10);
    assert.equal(a.garder("Une phrase bien plus longue que la limite."), true);
    assert.equal(a.garder("La suite."), false);
  },
  "complète : tout est lu"(V) {
    const a = new V.AbregeVocal(V.LONGUEURS_VOIX.complete);
    const morceaux = V.decouperPourVoix(LONG, 120);
    assert.equal(morceaux.filter(m => a.garder(m)).length, morceaux.length);
    assert.equal(a.fin(LONG), "");
  },
  "coupé sans question finale : rien n'est ajouté"(V) {
    const sansQuestion = LONG.replace(" Que faites-vous ?", " Le jour se lève.");
    const a = new V.AbregeVocal(V.LONGUEURS_VOIX.courte);
    V.decouperPourVoix(sansQuestion, 120).forEach(m => a.garder(m));
    assert.equal(a.coupe, true);
    assert.equal(a.fin(sansQuestion), "");
  }
};

const MUTATIONS = [
  ["if (this.coupe || (this.dit > 0 && this.dit + n > this.max)) { this.coupe = true; return false; }", "", "limite de longueur"],
  ["if (this.coupe || (this.dit > 0 && this.dit + n > this.max))", "if (this.coupe || (this.dit + n > this.max))", "premier morceau toujours dit"],
  ["return /[?!][\"»”)]*$/.test(derniere) ? derniere : \"\";", "return derniere;", "seulement une question ou un appel"]
];

async function echecs(V) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) { try { await verifier(V); } catch (e) { liste.push(`${nom} : ${e.message}`); } }
  return liste;
}

test("abrégé vocal : le moteur d'origine passe toute la batterie", async () => {
  assert.deepEqual(await echecs(await charger(RACINE)), []);
});

test("abrégé vocal : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [avant, apres, regle] of MUTATIONS) {
    const dossier = mkdtempSync(join(tmpdir(), "abrege-"));
    try {
      cpSync(RACINE, dossier, { recursive: true });
      const f = join(dossier, "voix-texte.js");
      const texte = readFileSync(f, "utf8");
      assert.ok(texte.includes(avant), `mutation introuvable : ${avant}`);
      writeFileSync(f, texte.replace(avant, apres));
      if (!(await echecs(await charger(dossier))).length) passees.push(regle);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  }
  assert.deepEqual(passees, []);
});
