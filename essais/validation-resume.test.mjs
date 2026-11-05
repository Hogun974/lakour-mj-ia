// Fenêtre « Action du MJ IA » (autonomie Validation) : les arguments d'un outil sensible sont résumés pour le MJ humain,
// pas recopiés en JSON brut, et tout ce qui vient de l'IA est échappé.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Échappement de Foundry (foundry.utils.escapeHTML) et i18n tiré des vrais fichiers de langue.
const echapper = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]);
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: echapper } };
const langue = code => JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf8"));
const i18n = dico => {
  const localize = cle => cle.split(".").reduce((o, k) => o?.[k], dico) ?? cle;
  return { localize, format: (cle, d) => localize(cle).replace(/\{(\w+)\}/g, (m, k) => (k in d ? String(d[k]) : m)) };
};
globalThis.game = { i18n: i18n(langue("fr")) };
const { resumerAppel } = await import("../scripts/outils.js");

const scene = {
  nom: "L'Auberge du Puits", largeur: 30, hauteur: 20, lumiere: "penombre", image: false, description_image: "",
  pieces: ["Salle commune", "Cuisine", "Réserve", "Cour du puits"].map((nom, i) => ({ nom, x: i * 6, y: 0, l: 6, h: 6, sol: "bois" })),
  ouvertures: [{ x: 5, y: 2, cote: "est", type: "porte" }, { x: 11, y: 3, cote: "est", type: "secrete" }, { x: 2, y: 5, cote: "sud", type: "fenetre" }],
  lumieres: [{ x: 3, y: 3, rayon: 4, couleur: "#ffaa55" }],
  elements: [], sons: [], zones: [], etages: [], escaliers: []
};

test("creer_scene : tableaux résumés (noms ou nombre), vides omis, scalaires tels quels, aucun JSON brut", () => {
  const html = resumerAppel({ nom: "creer_scene", args: scene });
  assert.match(html, /^<p>Le MJ IA veut utiliser <strong>creer_scene<\/strong> :<\/p><ul>/);
  assert.match(html, /<li><strong>pieces<\/strong> : 4 éléments \(Salle commune, Cuisine, Réserve, Cour du puits\)<\/li>/);
  assert.match(html, /<li><strong>ouvertures<\/strong> : 3 éléments<\/li>/, "objets sans nom : le nombre seul");
  assert.match(html, /<li><strong>lumieres<\/strong> : 1 élément<\/li>/);
  assert.match(html, /<li><strong>largeur<\/strong> : 30<\/li>/);
  assert.match(html, /<li><strong>image<\/strong> : non<\/li>/);
  assert.match(html, /<li><strong>nom<\/strong> : L&#x27;Auberge du Puits<\/li>/);
  for (const absent of ["elements", "sons", "zones", "etages", "escaliers", "description image"]) {
    assert.doesNotMatch(html, new RegExp(`<strong>${absent}</strong>`), `${absent} vide : omis`);
  }
  assert.doesNotMatch(html, /[{}[\]]|&quot;/, "plus de JSON brut");
});

test("liste longue abrégée, tableau de textes joint, objet résumé par ses clés", () => {
  const html = resumerAppel({ nom: "essai", args: {
    salles: Array.from({ length: 9 }, (_, i) => ({ nom: `S${i + 1}` })),
    etages: ["Cave", "Étage"],
    tirages: { ws: 30, bs: 31, vide: "", detail: { nom: "Lazar" }, liste: [{ x: 1 }, { x: 2 }] },
    description_longue: "a".repeat(700)
  } });
  assert.match(html, /<strong>salles<\/strong> : 9 éléments \(S1, S2, S3, S4, S5, S6, et 3 autres\)/);
  assert.match(html, /<strong>etages<\/strong> : Cave, Étage</);
  assert.match(html, /<strong>tirages<\/strong> : ws : 30, bs : 31, detail : Lazar, liste : 2 éléments</);
  assert.match(html, /<strong>description longue<\/strong> : a{600}…</, "texte tronqué à 600 caractères");
  assert.match(resumerAppel({ nom: "pause", args: {} }), /<p>Sans arguments\.<\/p>$/);
});

test("échappement : rien de ce que dit l'IA ne devient une balise (nom d'outil, clés, valeurs, noms listés)", () => {
  const piege = "<img src=x onerror=alert(1)>";
  const html = resumerAppel({ nom: `outil${piege}`, args: {
    [`cle${piege}`]: piege,
    pieces: [{ nom: piege }, { nom: "<script>alert(2)</script>" }],
    reglages: { [piege]: piege }
  } });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /2 éléments \(&lt;img src=x onerror=alert\(1\)&gt;, &lt;script&gt;alert\(2\)&lt;\/script&gt;\)/);
  // Seules les balises du résumé lui-même restent.
  assert.deepEqual([...new Set(html.match(/<\/?[a-z]+/g))].sort(), ["</li", "</p", "</strong", "</ul", "<li", "<p", "<strong", "<ul"]);
});

test("en anglais : mêmes résumés, libellés traduits", () => {
  const avant = globalThis.game;
  globalThis.game = { i18n: i18n(langue("en")) };
  try {
    const html = resumerAppel({ nom: "creer_scene", args: scene });
    assert.match(html, /The AI GM wants to use <strong>creer_scene<\/strong>:/);
    assert.match(html, /pieces<\/strong> : 4 items \(Salle commune, Cuisine, Réserve, Cour du puits\)/);
    assert.match(html, /lumieres<\/strong> : 1 item</);
    assert.match(html, /image<\/strong> : no</);
  } finally {
    globalThis.game = avant;
  }
});
