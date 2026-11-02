// Tour par tour : chaque règle de la logique pure (scripts/tour-logique.js) est cassée à son tour dans une copie ; la batterie
// doit alors échouer. Prouve que les essais attrapent une étape oubliée, une distance fausse, une proposition absurde.
// Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("../scripts/tour-logique.js", import.meta.url));
const MUTATIONS = {
  "victoire jamais annoncée": ['if (eux.length && eux.every(horsCombat)) return etape("victoire"', 'if (false) return etape("victoire"'],
  "initiative oubliée": ['if (sans.length) return etape("initiative"', 'if (false) return etape("initiative"'],
  "obligation sautée": ["const [o] = suivi.obligations ?? [];", "const o = null;"],
  "dégâts jamais appliqués": ['if (a?.phase === "appliquer") return etape("appliquer"', 'if (false) return etape("appliquer"'],
  "le MJ joue à la place du joueur": ['if (actif.camp === "joueur") {', "if (false) {"],
  "nouveau round jamais annoncé": ['if (!suivant) return etape("round"', 'if (false) return etape("round"'],
  "jet contre la mort à chaque clic": ['if (horsCombat(actif) && !(actif.jetsMort && !actif.mort && a?.phase === "fini")) {', "if (horsCombat(actif)) {"],
  "diagonales ignorées": ["case 4: return grand + Math.floor(petit / 2);", "case 4: return grand;"],
  "pieds non convertis": ["ft: 0.3,", "ft: 1,"],
  "distance de case à case au lieu de bord à bord": ["const dx = Math.max(0, b.x - (a.x + al - 1), a.x - (b.x + bl - 1));", "const dx = Math.abs(b.x - a.x) + al - 1;"],
  "portée longue aussi bonne que normale": ["else if (distance <= longue + marge) score = moyenne / 2;", "else if (distance <= longue + marge) score = moyenne;"],
  "un adversaire à terre est visé": ["const debout = adversaires.filter(c => !horsCombat(c) && c.cases);", "const debout = adversaires.filter(c => c.cases);"],
  "la plus lointaine d'abord": [".sort((a, b) => a.d - b.d || String(a.c.nom).localeCompare(String(b.c.nom)));", ".sort((a, b) => b.d - a.d || String(a.c.nom).localeCompare(String(b.c.nom)));"],
  "tour de table : un autre fait avancer": ["if (!o || o.id !== id) return t;", "if (!o) return t;"],
  "dépense au-delà de la réserve": ["return { ...depenses, [cle]: Math.min(Number(r.n ?? 1), Number(depenses?.[cle] ?? 0) + 1) };", "return { ...depenses, [cle]: Number(depenses?.[cle] ?? 0) + 1 };"],
  "moyenne d'un dé fausse": ["Number(m[2] || 1) * (Number(m[3]) + 1) / 2", "Number(m[2] || 1) * Number(m[3]) / 2"],
  "DD de concentration sans plancher": ["Math.min(30, Math.max(10, Math.floor(Number(degats || 0) / 2)))", "Math.min(30, Math.floor(Number(degats || 0) / 2))"],
  "légendaires du combattant actif proposés": ["c.id !== actifId && pnj(c) && c.legendaires?.reste > 0", "pnj(c) && c.legendaires?.reste > 0"],
  "légendaires épuisés proposés": ["c.id !== actifId && pnj(c) && c.legendaires?.reste > 0", "c.id !== actifId && pnj(c) && c.legendaires"],
  "légendaires d'un PNJ à terre": ["const pnj = c => !c.aTerre && !", "const pnj = c => !"],
  "repaire jamais au bon moment": ["const maintenant = i >= 0 && ini(actif) < compte && (i === 0 || ini(combattants[i - 1]) >= compte);", "const maintenant = false;"],
  "repaire à chaque tour sous 20": ["(i === 0 || ini(combattants[i - 1]) >= compte)", "true"]
};

const combattant = (id, nom, camp, extra = {}) => ({ id, nom, camp, initiative: 10, aTerre: false, mort: false, jetsMort: null, cases: { x: 0, y: 0 }, ...extra });
const groupe = () => [combattant("j", "Grommash", "joueur"), combattant("g1", "Gobelin", "ennemi"), combattant("g2", "Chef", "ennemi")];
const ECO = [{ cle: "action", n: 1 }, { cle: "bonus", n: 1 }];
const etat = ({ actif = "g1", combattants = groupe(), suivi = {} } = {}) => ({ combat: { commence: true, round: 1, actif, combattants }, economie: ECO, suivi: { depenses: {}, obligations: [], ...suivi } });

async function batterie(L) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  verifier("victoire", () => assert.equal(L.etapeSuivanteCombat(etat({ combattants: groupe().map(c => (c.camp === "ennemi" ? { ...c, aTerre: true } : c)) })).cle, "victoire"));
  verifier("initiative", () => assert.equal(L.etapeSuivanteCombat({ combat: { commence: false, combattants: [combattant("j", "G", "joueur", { initiative: null })] }, economie: ECO }).cle, "initiative"));
  verifier("obligation", () => assert.equal(L.etapeSuivanteCombat(etat({ suivi: { obligations: [{ cle: "sauvegarde", nom: "G" }] } })).cle, "sauvegarde"));
  verifier("appliquer", () => assert.equal(L.etapeSuivanteCombat(etat({ suivi: { depenses: { action: 1 }, attaque: { phase: "appliquer", degats: 4 } } })).cle, "appliquer"));
  verifier("joueur", () => assert.equal(L.etapeSuivanteCombat(etat({ actif: "j" })).attente, true));
  verifier("round", () => assert.equal(L.etapeSuivanteCombat(etat({ actif: "g2", suivi: { depenses: { action: 1 } } })).cle, "round"));
  verifier("jet contre la mort", () => {
    const mourant = groupe().map(c => (c.id === "j" ? { ...c, aTerre: true, jetsMort: { succes: 0, echecs: 0 } } : c));
    assert.equal(L.etapeSuivanteCombat(etat({ actif: "j", combattants: mourant, suivi: { attaque: { phase: "fini" } } })).cle, "suivant");
  });
  verifier("diagonales", () => assert.equal(L.distanceMetres({ x: 0, y: 0 }, { x: 2, y: 2 }, { distance: 1, unites: "m", diagonales: 4 }), 3));
  verifier("pieds", () => assert.equal(L.distanceMetres({ x: 0, y: 0 }, { x: 2, y: 0 }, { distance: 5, unites: "ft" }), 3));
  verifier("bord à bord", () => assert.equal(L.distanceMetres({ x: 0, y: 0, l: 2, h: 2 }, { x: 2, y: 0 }, { distance: 1, unites: "m" }), 1));
  const arc = { id: "arc", nom: "Arc", type: "distance", portee: { normale: 5, longue: 20 }, moyenne: 6 };
  const dague = { id: "dague", nom: "Dague lancée", type: "distance", portee: { normale: 20, longue: 60 }, moyenne: 4 };
  verifier("portée longue", () => assert.equal(L.proposerAction({ acteur: { id: "g", cases: { x: 0, y: 0 }, attaques: [arc, dague] },
    adversaires: [combattant("j", "G", "joueur", { cases: { x: 10, y: 0 } })], grille: { distance: 1, unites: "m" } }).attaqueNom, "Dague lancée"));
  verifier("à terre", () => assert.equal(L.proposerAction({ acteur: { id: "g", cases: { x: 0, y: 0 }, attaques: [arc] },
    adversaires: [combattant("j", "G", "joueur", { aTerre: true, cases: { x: 1, y: 0 } })], grille: { distance: 1, unites: "m" } }).type, "attendre"));
  verifier("le plus proche", () => assert.equal(L.proposerAction({ acteur: { id: "g", cases: { x: 0, y: 0 }, attaques: [dague] },
    adversaires: [combattant("a", "Loin", "joueur", { cases: { x: 15, y: 0 } }), combattant("b", "Près", "joueur", { cases: { x: 3, y: 0 } })], grille: { distance: 1, unites: "m" } }).cibleNom, "Près"));
  verifier("tour de table", () => {
    const t = L.nouveauTourDeTable([{ id: "a", nom: "A" }, { id: "b", nom: "B" }]);
    assert.equal(L.avancerTourDeTable(t, { id: "b" }), t);
  });
  verifier("dépense", () => assert.deepEqual(L.depenser(ECO, { action: 1 }, "action"), { action: 1 }));
  verifier("moyenne", () => assert.equal(L.moyenneFormule("2d6"), 7));
  verifier("concentration", () => assert.equal(L.ddConcentration(4), 10));
  // Actions légendaires et de repaire (D&D 5e) : une ligne courte pour l'IA.
  const dragon = { id: "d", nom: "Onyxia", camp: "ennemi", initiative: 15, aTerre: false, legendaires: { reste: 2, max: 3 }, repaire: 20 };
  const ordre = [{ id: "j", nom: "Grommash", camp: "joueur", initiative: 22 }, { id: "g", nom: "Gobelin", camp: "ennemi", initiative: 18 }, dragon,
    { id: "k", nom: "Kael", camp: "compagnon", initiative: 9, legendaires: { reste: 1, max: 1 } }];
  verifier("légendaires à la fin du tour d'un autre", () => {
    const l = L.rappelsLegendaires({ combattants: ordre, actifId: "j" }).join("\n");
    assert.match(l, /Actions légendaires possibles à la fin du tour de Grommash : Onyxia \(2\/3\)\./);
    assert.doesNotMatch(l, /Kael/, "un compagnon n'est pas un PNJ légendaire");
  });
  verifier("pas de légendaires pour soi, ni épuisés, ni à terre", () => {
    assert.doesNotMatch(L.rappelsLegendaires({ combattants: ordre, actifId: "d" }).join("\n"), /Actions légendaires/);
    const epuise = ordre.map(c => (c.id === "d" ? { ...c, legendaires: { reste: 0, max: 3 } } : c));
    assert.doesNotMatch(L.rappelsLegendaires({ combattants: epuise, actifId: "j" }).join("\n"), /Actions légendaires/);
    const tombe = ordre.map(c => (c.id === "d" ? { ...c, aTerre: true } : c));
    assert.deepEqual(L.rappelsLegendaires({ combattants: tombe, actifId: "j" }), []);
  });
  verifier("repaire : le moment, au premier combattant sous 20 du round", () => {
    assert.match(L.rappelsLegendaires({ combattants: ordre, actifId: "g" }).join("\n"), /Actions de repaire : c'est le moment \(initiative 20, avant Gobelin\) — Onyxia/);
    assert.match(L.rappelsLegendaires({ combattants: ordre, actifId: "j" }).join("\n"), /Repaire : Onyxia a une action de repaire par round, à l'initiative 20/);
    assert.doesNotMatch(L.rappelsLegendaires({ combattants: ordre, actifId: "d" }).join("\n"), /c'est le moment/, "une seule fois par round");
  });
  return echecs;
}

async function charger(mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-tour-"));
  let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
  if (mutation) {
    assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
    texte = texte.replace(mutation[0], mutation[1]);
  }
  writeFileSync(join(dossier, "tour-logique.js"), texte);
  return { dossier, L: await import(pathToFileURL(join(dossier, "tour-logique.js")).href) };
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const vrai = await charger(null);
  try { assert.deepEqual(await batterie(vrai.L), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok((await batterie(m.L)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
