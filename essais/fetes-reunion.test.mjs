// Fêtes de La Réunion au calendrier du moteur (demande de Fénoir) : fête de la liberté, letchis, Dipavali, Cavadee, Nouvel An
// chinois (dates lunaires par table, 2026 – 2036), 14 juillet, Toussaint dans le cœur d'Halloween ; les déclinaisons des autres
// mondes (40k, Warcraft, Veillées) ne voient pas les fêtes qu'elles ne déclinent pas.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../scripts/fetes-logique.js";

const jour = (a, m, j) => new Date(a, m - 1, j, 12);
const ids = liste => liste.map(f => f.id);

test("fêtes lunaires : une date par année de 2026 à 2036, cœur ce jour-là ; hors table, rien", () => {
  for (const id of ["dipavali", "cavadee", "nouvel-an-chinois"]) {
    for (let a = 2026; a <= 2036; a++) {
      const md = L.DATES_LUNAIRES[id][a];
      assert.match(md ?? "", /^\d{2}-\d{2}$/, `${id} ${a}`);
      const [m, j] = md.split("-").map(Number);
      const ce = L.fetesDuJour(jour(a, m, j)).find(f => f.id === id);
      assert.ok(ce?.coeur, `${id} ${a} : pas au cœur le ${md}`);
      assert.ok(L.fenetresDeLAnnee(a).some(f => f.id === id && f.coeurDebut === `${a}-${md}`));
    }
    assert.ok(!L.fenetresDeLAnnee(2037).some(f => f.id === id), `${id} inventé en 2037`);
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
