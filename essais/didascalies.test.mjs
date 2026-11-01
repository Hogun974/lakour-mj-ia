// Répliques des compagnons IA à la manière du théâtre : une didascalie brève en italique (facultative, une seule, à la troisième
// personne), puis la parole. Le compagnon dit lui-même ses gestes ; le narrateur ne les raconte plus (consigne lakour-loups et
// consigne des compagnons, pour les trois mondes). Forme des répliques bornée, affichage « didascalie » au chat, lecture par le
// MJ IA, et une batterie par mutation.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const chat = [];
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;") } };
globalThis.ChatMessage = { implementation: { create: async d => { chat.push(d); return d; } } };
globalThis.DOMParser = class {
  parseFromString(html) { return { querySelectorAll: () => [], body: { textContent: String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() } }; }
};
globalThis.game = { system: { id: "lakour-loups" }, users: { get: () => null }, settings: { get: () => undefined }, world: { id: "monde" }, i18n: { has: () => false } };

const C = await import("../scripts/compagnons.js");
const { Compagnons } = await import("../scripts/compagnons-jeu.js");
const { decrireMessage, CONSIGNE_COMPAGNONS } = await import("../scripts/contexte.js");
const { adaptateur } = await import("../scripts/adaptateurs.js");

const EXEMPLE = "*Valentin regarde Clémence, les bras croisés.* — Moi, je l'ai vue sortir hier soir.";

test("forme : une didascalie en tête, gardée telle quelle ; acceptée en *…*, **…**, _…_ ou (…) ; facultative", () => {
  assert.equal(C.nettoyerReplique(EXEMPLE, "Valentin"), EXEMPLE);
  assert.equal(C.nettoyerReplique("Valentin : (Valentin croise les bras) « Je n'ai rien vu. »", "Valentin"), "*Valentin croise les bras.* — Je n'ai rien vu.");
  assert.equal(C.nettoyerReplique("**Il rit.** Et toi ?"), "*Il rit.* — Et toi ?");
  assert.equal(C.nettoyerReplique("_Elle baisse les yeux_ — Je ne sais pas."), "*Elle baisse les yeux.* — Je ne sais pas.");
  assert.equal(C.nettoyerReplique("*Il hausse les épaules.*"), "*Il hausse les épaules.*", "un geste seul, sans parole");
  assert.equal(C.nettoyerReplique("Je soupçonne le meunier."), "Je soupçonne le meunier.", "sans didascalie");
  for (const vide of ["—", "*—*", "(rien)", "", "*—* — —"]) assert.equal(C.nettoyerReplique(vide), "", JSON.stringify(vide));
});

test("forme : une seule didascalie (les autres disparaissent), longueurs bornées", () => {
  assert.equal(C.nettoyerReplique("*Il se lève.* — Je *il tape du poing* refuse *il se rassoit*."), "*Il se lève.* — Je refuse.");
  assert.equal(C.nettoyerReplique("Je refuse, *il tape du poing*, net."), "Je refuse, net.", "une didascalie au milieu n'en est pas une");
  const longue = C.nettoyerReplique(`*${"Il regarde longuement la place ".repeat(20)}* — ${"Non. ".repeat(200)}`);
  const [, didascalie, parole] = /^\*(.+)\* — (.+)$/.exec(longue);
  assert.ok(didascalie.length <= C.DIDASCALIE_MAX, `didascalie de ${didascalie.length}`);
  assert.ok(parole.length <= C.PAROLE_MAX, `parole de ${parole.length}`);
  assert.ok(longue.length <= C.DIDASCALIE_MAX + C.PAROLE_MAX + 5);
});

test("consigne de parole : brève, une didascalie au plus, à la troisième personne, jamais d'action de jeu, aucun secret ; selon le monde", () => {
  for (const mot of ["UNE didascalie brève", "troisième personne", "au plus une", "jamais une action qui change la partie", "aucun secret", "— Moi, je l'ai vue"]) {
    assert.ok(C.CONSIGNE_PARLER.includes(mot), mot);
  }
  const vue = { id: "a", nom: "Valentin", monde: "Brumecombe", jeu: "loups", personnalite: {}, fiche: "", prive: [], public: [], scene: "", autres: [] };
  assert.match(C.contexteCompagnon(vue).texte, /didascalie[\s\S]*Voter, agir la nuit ou user d'un pouvoir ne se fait jamais dans une réplique/);
  assert.match(C.contexteCompagnon({ ...vue, jeu: "aventure" }).texte, /didascalie[\s\S]*se dit dans ta parole, le meneur la résout/);
  assert.doesNotMatch(C.contexteCompagnon({ ...vue, jeu: "aventure" }, { consigne: C.CONSIGNE_COMBAT }).texte, /didascalie/, "en combat, une déclaration d'action");
});

test("affichage : la didascalie en italique, style « didascalie », sous le nom du compagnon ; le MJ IA la lit telle quelle", async () => {
  const k = new Compagnons({});
  const acteur = { id: "c1", name: "Valentin" };
  await k.poster(acteur, EXEMPLE);
  const m = chat.at(-1);
  assert.equal(m.speaker.alias, "Valentin");
  assert.match(m.content, /^<p><em class="lakour-mjia-didascalie">Valentin regarde Clémence, les bras croisés\.<\/em> — Moi, je l'ai vue sortir hier soir\.<\/p>$/);
  await k.poster(acteur, "Je n'ai rien vu.");
  assert.equal(chat.at(-1).content, "<p>Je n'ai rien vu.</p>");
  const lu = decrireMessage({ ...m, author: { name: "Hogun" }, flags: m.flags });
  assert.equal(lu, `Valentin (compagnon IA) : ${EXEMPLE}`);
  assert.ok(readFileSync(new URL("../styles/mj-ia.css", import.meta.url), "utf8").includes(".lakour-mjia-didascalie"));
});

test("consigne du narrateur : aux Veillées, ni gestes ni répliques des joueurs et des compagnons ; partout, pas le geste qu'un compagnon vient de dire", () => {
  const c = adaptateur().consignes;
  for (const mot of ["Tu ne racontes ni les gestes ni les paroles des joueurs et des compagnons IA", "ne répète pas, ne paraphrase pas",
    "Tu te limites à la nuit, à l'aube et aux morts, à l'animation du débat (tours de parole, temps, relances) et aux résultats"]) {
    assert.ok(c.includes(mot), mot);
  }
  assert.match(CONSIGNE_COMPAGNONS, /didascalie en italique[\s\S]*Ne la raconte pas de nouveau[\s\S]*décris le monde, les PNJ et les conséquences, pas le geste/);
});

// ------------------------------------------------------------------ mutations (compagnons.js)
const SOURCE = fileURLToPath(new URL("../scripts/compagnons.js", import.meta.url));
const MUTATIONS = {
  "plusieurs didascalies gardées": ['const parole = t.replace(/\\*{1,2}[^*]*\\*{1,2}|(^|\\s)_[^_]+_(?=\\s|$)/g, "$1")', "const parole = t"],
  "didascalie sans borne": ["`${didascalie}.`, DIDASCALIE_MAX)", "`${didascalie}.`, 100000)"],
  "parole sans borne": ["couper(parole, PAROLE_MAX)", "parole"],
  "didascalie perdue": ["  if (!didascalie) return dit;", "  return dit;"],
  "consigne sans didascalie": ["Tu peux la faire précéder d'UNE didascalie brève, en italique, à la troisième \"\n  + \"personne, comme au théâtre", "Tu peux \"\n  + \"parler"],
  "actions permises en didascalie": ["au plus une, jamais une action qui change la partie, et elle ne trahit aucun secret", "au plus une"]
};
function batterie(X) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  verifier("exemple", () => assert.equal(X.nettoyerReplique(EXEMPLE), EXEMPLE));
  verifier("une seule", () => assert.equal(X.nettoyerReplique("*Il se lève.* — Je *il tape du poing* refuse."), "*Il se lève.* — Je refuse."));
  verifier("bornes", () => assert.ok(X.nettoyerReplique(`*${"x".repeat(900)}* — ${"y".repeat(900)}`).length <= 560));
  verifier("consigne", () => { for (const mot of ["didascalie", "troisième personne", "jamais une action", "aucun secret"]) assert.ok(X.CONSIGNE_PARLER.includes(mot), mot); });
  return echecs;
}
test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const charger = async mutation => {
    const dossier = mkdtempSync(join(tmpdir(), "lakour-didascalie-"));
    let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
    if (mutation) {
      assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
      texte = texte.replace(mutation[0], mutation[1]);
    }
    writeFileSync(join(dossier, "compagnons.js"), texte);
    return { dossier, X: await import(pathToFileURL(join(dossier, "compagnons.js")).href) };
  };
  const vrai = await charger(null);
  try { assert.deepEqual(batterie(vrai.X), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok(batterie(m.X).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
