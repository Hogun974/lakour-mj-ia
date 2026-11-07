// Les compagnons sans modèle, d'après deux parties en vrai des Veillées (7 novembre 2026) : le Mur des murmures écrivait toujours les
// mêmes cinq phrases (une même phrase jusqu'à quatre fois sur un mur), les répliques de débat revenaient d'une partie à l'autre ; un
// compagnon que le narrateur interpellait (« Léonce, c'est à vous : pourquoi cette grâce ? ») ne répondait pas, et rien ne relançait
// la partie. Doublures, aucun appel payant.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}
const reglages = {
  fournisseur: "factice", modeleCompagnons: "", budgetSeance: 0, delaiReponse: 0, rythmeJoueur: 0, bavardageCompagnons: "normal", voix: "aucune",
  compagnonsPrive: {}, compagnonsHorsSeance: { cout: 0, appels: 0, depuis: 0 }, coutsEnAttente: {}, pilote: false, autonomie: "validation",
  personnaliteActive: "p", personnalites: [{ id: "p", nom: "Essai", nomAffiche: "La Voix" }],
  seance: { active: true, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }
};
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s) } };
globalThis.DOMParser = class { parseFromString(h) { return { querySelectorAll: () => [], body: { textContent: String(h).replace(/<[^>]*>/g, " ").trim() } }; } };
globalThis.Hooks = { on() {}, callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } };
globalThis.ChatMessage = { implementation: { create: async d => d } };
globalThis.game = {
  user: mj, users: new Collection([["mj", mj]]), actors: new Collection(), messages: { contents: [] }, system: { id: "lakour-loups" }, world: { id: "monde" },
  packs: new Collection(), settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  i18n: { localize: k => k, format: k => k, has: () => false }, combats: { active: null }, scenes: { active: null }, modules: new Map([["lakour-mj-ia", { api: {} }]])
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const C = await import("../scripts/compagnons.js");
const { MoteurMJ, RELANCE_MIN } = await import("../scripts/moteur.js");

const GENRE = /(?<!\p{L})(?:il|elle|lui|seul|seule|he|she|him|her|his)(?!\p{L})/iu;

test("réserves : au moins 40 murmures et 40 répliques de débat, les mêmes rangs en français et en anglais, sans accord de genre", () => {
  for (const langue of ["fr", "en"]) {
    const R = C.repliquesDansLaLangue(langue);
    assert.ok(R.murmures.length >= 40, `${langue} : ${R.murmures.length} murmures`);
    assert.ok(R.loups.length >= 40, `${langue} : ${R.loups.length} répliques`);
    assert.ok(R.annonces.length >= 8, `${langue} : ${R.annonces.length} annonces`);
    assert.equal(new Set(R.murmures).size, R.murmures.length, `${langue} : des murmures en double`);
    assert.equal(new Set(R.loups.map(f => f("X"))).size, R.loups.length, `${langue} : des répliques en double`);
    for (const m of R.murmures) assert.doesNotMatch(m, GENRE, `${langue} : ${m}`);
  }
  assert.equal(C.repliquesDansLaLangue("fr").murmures.length, C.repliquesDansLaLangue("en").murmures.length);
});

test("débat : jamais deux fois la même réplique dans une partie (tant que la réserve n'est pas épuisée)", () => {
  const autres = [{ id: "a", nom: "Odile Basquin" }, { id: "b", nom: "Colin Hautecœur" }];
  const dites = new Set();
  const textes = [];
  for (let n = 0; n < 200 && textes.length < 42; n++) {
    const t = C.repliReplique({ id: `c${n % 11}`, jeu: "loups", tour: Math.floor(n / 11), personnalite: { temperament: "bavard" }, autres }, "partie", { n, dites });
    if (t) textes.push(t.replace(/Odile Basquin|Colin Hautecœur/g, "X"));
  }
  assert.equal(textes.length, 42);
  assert.equal(new Set(textes).size, 42, "les 42 répliques, chacune une fois");
  // La réserve épuisée : elle recommence (jamais muet faute de réplique libre).
  assert.ok(C.repliReplique({ id: "c1", jeu: "loups", tour: 9, personnalite: { temperament: "bavard" }, autres, interpelle: true }, "partie", { n: 999, dites }));
  // Les annonces (« X est un loup ») ne se répètent pas non plus.
  const annonces = new Set();
  const d2 = new Set();
  for (let n = 0; n < 8; n++) annonces.add(C.repliReplique({ id: "c1", jeu: "loups", tour: n, annonce: { cible: "a", nom: "Odile" } }, "p", { n, dites: d2 }));
  assert.equal(annonces.size, 8);
  // Le cerveau des compagnons tient ce registre par partie : une partie neuve repart de la réserve entière.
  const cerveaux = new C.CerveauxCompagnons({ graine: "g" });
  const vue = i => ({ id: `c${i % 11}`, nom: `C${i}`, jeu: "loups", tour: 1, partie: "p1", peutParler: true, personnalite: { temperament: "bavard" }, autres });
  return (async () => {
    const dits = [];
    for (let i = 0; i < 60 && dits.length < 30; i++) { const r = await cerveaux.parler(vue(i)); if (r.texte) dits.push(r.texte.replace(/Odile Basquin|Colin Hautecœur/g, "X")); }
    assert.equal(new Set(dits).size, dits.length, "pas deux fois la même dans la partie");
    const r = await cerveaux.parler({ ...vue(0), partie: "p2" });
    void r;
    assert.equal(cerveaux.dites.partie, "p2");
  })();
});

test("Mur des murmures : jamais deux fois la même phrase sur un mur, une part des compagnons se tait, une partie neuve repart", async () => {
  const cerveaux = new C.CerveauxCompagnons({ graine: "mur" });
  const mur = async (tour, partie = "p1") => {
    const phrases = [];
    for (let i = 0; i < 11; i++) {
      const r = await cerveaux.decider({ id: `c${i}`, jeu: "loups", tour, partie, langue: "fr" }, { type: "texte", objet: "mur", max: 120, cle: `texte|${partie}|${tour}|${i}` });
      phrases.push(r.texte);
    }
    return phrases;
  };
  let muets = 0, ecrites = 0;
  for (let tour = 1; tour <= 6; tour++) {
    const p = await mur(tour);
    const dites = p.filter(Boolean);
    assert.equal(new Set(dites).size, dites.length, `nuit ${tour} : ${dites.join(" | ")}`);
    muets += p.length - dites.length;
    ecrites += dites.length;
  }
  assert.ok(muets > 0, "une part des compagnons n'écrit rien");
  assert.ok(ecrites > 30, `${ecrites} phrases sur six murs`);
  // Les phrases déjà sur le mur (demande.deja : un humain, un compagnon avec modèle) ne sont pas reprises.
  const R = C.repliquesDansLaLangue("fr");
  const deja = R.murmures.slice(0, 44);
  for (let i = 0; i < 20; i++) {
    const t = C.murmureSansIA({ langue: "fr" }, { deja }, C.hasard(`deja|${i}`));
    assert.ok(!t || t === R.murmures[44], t);
  }
  assert.equal(C.murmureSansIA({ langue: "fr" }, { deja: R.murmures }, () => 0.99), "", "le mur a tout : il se tait");
});

test("Mur des murmures : ce qu'un compagnon sait devient une allusion — son genre et un trait visible, jamais un nom", () => {
  const vus = new Set();
  for (let i = 0; i < 40; i++) {
    const t = C.murmureSansIA({ langue: "fr" }, { murmure: { sens: "loup", genre: "femme", indice: "lunettes" } }, C.hasard(`savant|${i}`));
    if (!t) continue;
    vus.add(t);
    assert.match(t, /celle qui porte des lunettes/i, t);
  }
  assert.ok(vus.size >= 4, `des tournures variées : ${[...vus].join(" | ")}`);
  assert.equal(C.phraseDAllusion({ sens: "innocent", genre: "homme", indice: "pipe" }, "fr", () => 0), "On peut se fier à celui qui fume la pipe.");
  assert.equal(C.phraseDAllusion({ sens: "loup", genre: "femme", indice: "coiffe" }, "fr", () => 0), "Méfiez-vous de celle à la coiffe sombre.");
  assert.equal(C.phraseDAllusion({ sens: "loup", genre: "", indice: "ecart" }, "fr", () => 0.2), "La personne qui vit de l'autre côté du pont ne dort pas la nuit.");
  assert.equal(C.phraseDAllusion({ sens: "loup", genre: "homme", indice: "vieux" }, "en", () => 0), "Beware of the man with the grey hair.");
  assert.equal(C.phraseDAllusion({ sens: "loup", genre: "femme", indice: "inconnu" }, "fr", () => 0), "", "un indice inconnu : rien");
  for (const langue of ["fr", "en"]) {
    const A = C.allusionsDansLaLangue(langue);
    assert.equal(A.loup.length, C.allusionsDansLaLangue("fr").loup.length);
    assert.deepEqual(Object.keys(A.indices).sort(), ["bijou", "bourg", "coiffe", "ecart", "jeune", "lunettes", "pipe", "sabots", "vieux"]);
  }
});

test("interpellation : le narrateur donne la parole à un compagnon — une question, « c'est à vous » ; un récit ne l'est pas", () => {
  const c = [{ id: "a", nom: "Léonce Tarride" }, { id: "b", nom: "Odile Basquin" }, { id: "c", nom: "Odile Ferrand" }];
  assert.deepEqual(C.interpellesDans("Léonce, c'est à vous : pourquoi cette grâce ?", c), ["a"]);
  assert.deepEqual(C.interpellesDans("Léonce pâlit. La brume monte sur Brumecombe.", c), []);
  assert.deepEqual(C.interpellesDans("Odile Basquin, qu'en dites-vous ?", c), ["b"]);
  assert.deepEqual(C.interpellesDans("Odile, parle donc !", c), [], "deux Odile : le prénom seul ne désigne personne");
  assert.deepEqual(C.interpellesDans("Le village attend. Léonce Tarride, à vous.", c), ["a"]);
  assert.deepEqual(C.interpellesDans("Léonce, your turn: why that pardon?", c), ["a"]);
});

test("moteur : un compagnon interpellé répond même après un lot de compagnons ; muet, le narrateur est relancé après le délai", async () => {
  game.actors = new Collection();
  for (const [id, nom] of [["v1", "Léonce Tarride"], ["v2", "Odile Basquin"]]) {
    game.actors.set(id, { id, name: nom, type: "villageois", flags: {}, system: { compagnon: true, joueur: "", vivant: true } });
  }
  game.lakourLoups = { etat: () => ({ partie: "p1", phase: "jour", tour: 2 }), villageois: () => game.actors.filter(a => a.type === "villageois") };
  const moteur = new MoteurMJ();
  Object.defineProperty(moteur, "actif", { get: () => true });
  const reactions = [];
  moteur.compagnons.reagir = async o => { reactions.push(o); return o.seuls?.includes("v1") && reactions.length === 1 ? [{ acteurId: "v1", texte: "Parce que…" }] : []; };
  // Un lot de répliques de compagnons seulement (la règle anti-boucle ne fait réagir personne) : l'interpellé parle quand même.
  const lot = [{ texte: "Odile : je vote contre Léonce.", source: "compagnon" }];
  const r = await moteur.repondreAuxInterpelles(lot, "Le village se tourne vers lui. Léonce, c'est à vous : pourquoi cette grâce ?", []);
  assert.deepEqual(reactions[0].seuls, ["v1"]);
  assert.deepEqual(r.map(x => x.acteurId), ["v1"]);
  // Celui qui a déjà parlé dans la réaction ordinaire n'est pas relancé.
  assert.deepEqual(await moteur.repondreAuxInterpelles(lot, "Léonce, c'est à vous ?", [{ acteurId: "v1" }]), []);
  // Muet : une relance du narrateur, passé le délai (RELANCE_MIN secondes au moins), si rien n'a bougé.
  const minuteries = [];
  const avant = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms) => { minuteries.push({ f, ms }); return minuteries.length; };
  const signaux = [];
  moteur.signaler = (texte, o) => signaux.push({ texte, ...o });
  try {
    await moteur.repondreAuxInterpelles(lot, "Odile Basquin, qu'en dites-vous ?", []);
    const relance = minuteries.find(m => m.ms === RELANCE_MIN * 1000);
    assert.ok(relance, "une relance prévue");
    relance.f();
    assert.match(signaux[0].texte, /^\[Le temps presse\] Odile Basquin ne répond pas/);
    // Un tour du narrateur entre-temps : pas de relance.
    await moteur.repondreAuxInterpelles(lot, "Odile Basquin, qu'en dites-vous ?", []);
    moteur.tours += 1;
    minuteries.at(-1).f();
    assert.equal(signaux.length, 1);
  } finally { globalThis.setTimeout = avant; }
  // Au plus INTERPELLATIONS_MAX fois de suite sans humain : ensuite, plus de réponse forcée (mais la relance reste).
  const n = reactions.length;
  for (let i = 0; i < 5; i++) await moteur.repondreAuxInterpelles(lot, "Léonce, c'est à vous ?", []);
  assert.ok(reactions.length - n <= 1, "la boucle narrateur-compagnon est bornée");
  await moteur.repondreAuxInterpelles([{ texte: "Jordan : Léonce ?", source: "humain" }], "Léonce, c'est à vous ?", []);
  assert.deepEqual(reactions.at(-1).seuls, ["v1"], "un humain a écrit : le compteur repart");
  clearTimeout(moteur.minuterieRelance);
  delete game.lakourLoups;
});

test("compagnons des Veillées : l'indice du Mur est un trait visible partagé ; le genre d'un prénom de compagnon, posé en trait", async () => {
  const J = await import("../scripts/compagnons-jeu.js");
  const traits = {
    a: { genre: "femme", age: "vieux", lunettes: true, pipe: true, bourg: false },
    b: { genre: "homme", age: "jeune", lunettes: true, bourg: true },
    c: { genre: "femme", age: "jeune", bourg: true }
  };
  for (let i = 0; i < 20; i++) {
    const indice = J.indiceDuMur("a", traits, ["a", "b", "c"], C.hasard(`i${i}`));
    assert.ok(["lunettes"].includes(indice), `un trait de « a » que d'autres vivants ont aussi : ${indice}`);
  }
  assert.ok(["pipe", "ecart", "vieux", "lunettes"].includes(J.indiceDuMur("a", traits, ["a"], () => 0.5)), "seul vivant : l'un de ses traits");
  assert.equal(J.indiceDuMur("z", traits, ["a"]), "", "sans traits : rien");
  // Le genre des prénoms (noms de secours et table du village) ; le système, s'il le sait, passe d'abord.
  assert.equal(J.genreDuPrenom("Ondine Malefosse", null), "femme");
  assert.equal(J.genreDuPrenom("Félicien Morteau", null), "homme");
  assert.equal(J.genreDuPrenom("Camille Roux", null), "");
  assert.equal(J.genreDuPrenom("Camille Roux", { logique: { genreDuPrenom: () => "femme" } }), "femme");
  assert.deepEqual(J.traitDeGenre("Edmée Vaissière"), { traits: { genre: "femme" } });
  assert.equal(J.traitDeGenre("Villageois 3"), null);
});
