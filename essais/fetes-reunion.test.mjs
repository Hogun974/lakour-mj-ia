// Fêtes de La Réunion au calendrier du moteur (demande de Fénoir) : fête de la liberté, letchis, Dipavali, Cavadee, Nouvel An
// chinois (dates lunaires calculées, vérifiées sur les relevés 2026 – 2036), 14 juillet, Toussaint dans le cœur d'Halloween ; les déclinaisons des autres
// mondes (40k, Warcraft, Veillées) ne voient pas les fêtes qu'elles ne déclinent pas.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../scripts/fetes-logique.js";

const jour = (a, m, j) => new Date(a, m - 1, j, 12);
const ids = liste => liste.map(f => f.id);

test("fêtes lunaires : les relevés de 2026 à 2036 retrouvés par le calcul, cœur ce jour-là ; et après 2036 aussi", () => {
  for (const id of ["dipavali", "cavadee", "nouvel-an-chinois"]) {
    for (let a = 2026; a <= 2036; a++) {
      const md = L.DATES_LUNAIRES[id][a];
      assert.match(md ?? "", /^\d{2}-\d{2}$/, `${id} ${a}`);
      const [m, j] = md.split("-").map(Number);
      const ce = L.fetesDuJour(jour(a, m, j)).find(f => f.id === id);
      assert.ok(ce?.coeur, `${id} ${a} : pas au cœur le ${md}`);
      assert.ok(L.fenetresDeLAnnee(a).some(f => f.id === id && f.coeurDebut === `${a}-${md}`));
    }
    for (const a of [2037, 2050, 2100]) assert.ok(L.fenetresDeLAnnee(a).some(f => f.id === id && f.coeurDebut === `${a}-${L.dateLunaire(id, a)}`), `${id} ${a}`);
  }
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 11, 5))), ["dipavali"], "trois jours avant");
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 11, 12))), [], "quatre jours après");
  assert.deepEqual(ids(L.fetesDuJour(jour(2027, 1, 23))), ["cavadee"], "lendemain");
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 2, 17))), ["nouvel-an-chinois", "carnaval"], "2026 : Mardi gras et fête du Printemps le même jour");
});

test("fixes : letchis à la mi-décembre (cœur avant Noël), liberté le 20, 14 juillet ; Toussaint au cœur d'Halloween", () => {
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 12, 13))), ["letchis", "noel"]);
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 12, 12))), ["noel", "letchis"], "hors cœur : la priorité");
  assert.deepEqual(ids(L.fetesDuJour(jour(2026, 12, 20))), ["liberte", "noel"]);
  assert.deepEqual(ids(L.fetesDuJour(jour(2027, 7, 14))), ["fete-nationale"]);
  const toussaint = L.fetesDuJour(jour(2026, 11, 1));
  assert.deepEqual(ids(toussaint), ["halloween"]);
  assert.equal(toussaint[0].coeur, true);
  assert.equal(L.fetesDuJour(jour(2026, 11, 2))[0].coeur, false);
});

test("chaque nouvelle fête a son décor, ses traductions de réglage, sa déclinaison possible", () => {
  for (const id of ["liberte", "letchis", "dipavali", "cavadee", "nouvel-an-chinois", "fete-nationale"]) {
    assert.ok(L.IDS_FETES.includes(id));
    assert.ok(L.DECORS_PAR_DEFAUT[id], `${id} sans décor`);
    assert.equal(L.normaliserDeclinaison({ id: `essai-${id}`, fete: id }).fete, id);
  }
});

// Les déclinaisons des mondes existants (scripts/fetes.js de lakour-40k, lakour-warcraft, lakour-veillees, au 04/11/2026).
const MONDES = {
  "40k": ["noel", "halloween", "nouvel-an", "paques"],
  warcraft: ["noel", "nouvel-an", "halloween", "musique", "carnaval"],
  veillees: ["halloween", "noel", "carnaval", "saint-valentin"]
};

test("les autres mondes ne voient pas les fêtes qu'ils ne déclinent pas", () => {
  const cas = [
    [jour(2026, 11, 8), { "40k": null, warcraft: null, veillees: null }],                 // Dipavali seule
    [jour(2026, 2, 17), { "40k": null, warcraft: "carnaval", veillees: "carnaval" }],      // Nouvel An chinois et Mardi gras
    [jour(2026, 12, 13), { "40k": "noel", warcraft: "noel", veillees: "noel" }],           // letchis au cœur, Noël décliné
    [jour(2026, 12, 20), { "40k": "noel", warcraft: "noel", veillees: "noel" }],           // liberté au cœur, Noël décliné
    [jour(2027, 7, 14), { "40k": null, warcraft: null, veillees: null }],
    [jour(2026, 11, 1), { "40k": "halloween", warcraft: "halloween", veillees: "halloween" }]
  ];
  for (const [date, attendu] of cas) {
    for (const [monde, declinees] of Object.entries(MONDES)) {
      assert.equal(L.feteRetenue({ date, declinees }), attendu[monde], `${monde} le ${date.toDateString()}`);
    }
  }
});

// ------------------------------------------------------------------ fêtes « sur demande » (lot « fetes » de Fénoir, 2026-11-13)
test("fêtes sur demande : Ramadan et Aïd el-Kebir (hégirien tabulaire), Nouvel An tamoul, marche sur le feu ; deux ramadans en 2030", () => {
  const aussi = L.IDS_SUR_DEMANDE;
  assert.deepEqual(aussi, ["ramadan", "aid-el-kebir", "nouvel-an-tamoul", "marche-sur-le-feu"]);
  const de = (a, id) => L.fenetresDeLAnnee(a, { aussi }).filter(f => f.id === id);
  // Dates connues (à un jour près de l'observation) : ramadan 2026 dès le 18 février, Aïd el-Fitr le 20 mars ; Aïd el-Kebir le 27 mai.
  assert.equal(de(2026, "ramadan")[0].debut, "2026-02-18");
  assert.equal(de(2026, "ramadan")[0].coeurDebut, "2026-03-20");
  assert.equal(de(2026, "aid-el-kebir")[0].coeurDebut, "2026-05-27");
  assert.equal(de(2027, "aid-el-kebir")[0].coeurDebut, "2027-05-17");
  assert.equal(de(2030, "ramadan").length, 2, "janvier et décembre 2030");
  assert.equal(de(2031, "nouvel-an-tamoul")[0].coeurDebut, "2031-04-14");
  assert.equal(de(2026, "marche-sur-le-feu")[0].coeurDebut, "2026-01-04", "premier dimanche après le Nouvel An");
  // Un ramadan qui chevauche la fin d'année (décembre 2030 – janvier 2031).
  assert.ok(ids(L.fetesDuJour(jour(2031, 1, 10), { aussi })).includes("ramadan"));
  // Chaque fête sur demande a son nom, son décor et se décline.
  for (const id of aussi) {
    assert.ok(L.nomDeFete(id) && L.DECORS_PAR_DEFAUT[id], id);
    assert.equal(L.normaliserDeclinaison({ id: `essai-${id}`, fete: id }).fete, id);
  }
});

test("fêtes sur demande : invisibles d'un monde qui ne les décline pas ; le réglage « fete » ne change pas", () => {
  for (let j = 1; j <= 31; j++) {
    for (const [m, a] of [[1, 2026], [2, 2026], [3, 2026], [4, 2027], [5, 2026], [12, 2030]]) {
      const d = jour(a, m, Math.min(j, 28));
      for (const f of L.fetesDuJour(d)) assert.ok(L.IDS_FETES.includes(f.id), `${f.id} sans demande`);
      for (const declinees of Object.values(MONDES)) assert.ok(!L.IDS_SUR_DEMANDE.includes(L.feteRetenue({ date: d, declinees })));
    }
  }
  assert.deepEqual(L.REGLAGES, [L.REGLAGE_AUTO, L.REGLAGE_AUCUNE, ...L.IDS_FETES]);
  for (const id of L.IDS_SUR_DEMANDE) assert.ok(!L.REGLAGES.includes(id));
  // Fénoir les décline : le calendrier et la fête du monde les voient.
  assert.equal(L.feteRetenue({ date: jour(2026, 5, 27), declinees: ["aid-el-kebir", "noel"] }), "aid-el-kebir");
  assert.equal(L.feteRetenue({ date: jour(2026, 2, 20), declinees: ["ramadan", "nouvel-an-chinois"] }), "nouvel-an-chinois", "le Nouvel An chinois passe devant le long ramadan");
});
