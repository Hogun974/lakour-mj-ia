// Guide d'utilisation du MJ IA : installé dans chaque monde (journal du MJ caché, journal des joueurs visible), une seule fois par
// version et par langue, et recopié à l'identique dans docs/guide-utilisation.md (français) et docs/guide-utilisation.en.md
// (anglais). La traduction (scripts/guide-en.js) suit le français section par section.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
const { installerGuide, langueDuGuide, VERSION_GUIDE, GUIDES, GUIDE_MJ, GUIDE_JOUEURS } = await import("../scripts/guide.js");
const { guideEnMarkdown, FICHIERS_GUIDE } = await import("../outils/ecrire-guide.mjs");
const ID = "lakour-mj-ia";

function monde({ modules = [], lang = "fr" } = {}) {
  const journaux = [];
  let creations = 0, majPages = 0;
  const journal = d => {
    const j = { ...d, flags: structuredClone(d.flags ?? {}), pages: Object.assign([...d.pages], {}),
      getFlag(s, k) { return this.flags[s]?.[k]; },
      async update(maj) {
        for (const [k, v] of Object.entries(maj)) {
          if (!k.startsWith("flags.")) { this[k] = v; continue; }
          const [, s, cle] = k.match(/^flags\.(.+)\.([^.]+)$/);
          (this.flags[s] ??= {})[cle] = v;
        }
      },
      async deleteEmbeddedDocuments() { this.pages.length = 0; majPages++; },
      async createEmbeddedDocuments(_, p) { this.pages.push(...p); } };
    journaux.push(j);
    return j;
  };
  const actifs = new Set(modules);
  globalThis.game = { journal: journaux, system: { id: "impmal" }, i18n: { lang },
    modules: { get: id => (actifs.has(id) ? { id, active: true } : undefined) } };
  globalThis.JournalEntry = { implementation: { create: async d => { creations++; return journal(d); } } };
  return { journaux, compte: () => ({ creations, majPages }), activer: m => { actifs.clear(); for (const x of m) actifs.add(x); } };
}
const versHTML = t => `<p>${t.trim()}</p>`;
const guideDe = (journaux, cle) => journaux.find(j => j.flags[ID].guide === cle);

test("deux journaux : guide du MJ caché, guide des joueurs visible ; une seule installation par version", async () => {
  const { journaux, compte } = monde({ modules: ["lakour-40k"] });
  await installerGuide({ id: ID, versHTML });
  assert.equal(journaux.length, 2);
  const mj = guideDe(journaux, "guide-mj");
  const joueurs = guideDe(journaux, "guide-joueurs");
  assert.equal(mj.ownership.default, 0, "le guide du MJ est caché aux joueurs");
  assert.equal(joueurs.ownership.default, 2, "le guide des joueurs est visible");
  assert.equal(mj.pages.length, GUIDE_MJ.length);
  assert.equal(joueurs.pages.length, GUIDE_JOUEURS.length);
  assert.equal(mj.name, "MJ IA — Guide du MJ");
  assert.equal(mj.flags[ID].langueGuide, "fr");
  await installerGuide({ id: ID, versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 0 }, "rien de refait à la même version");
  // Nouvelle version du guide : les pages sont remplacées, sans recréer les journaux.
  mj.flags[ID].versionGuide = VERSION_GUIDE - 1;
  await installerGuide({ id: ID, versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 1 });
  assert.equal(mj.flags[ID].versionGuide, VERSION_GUIDE);
});

test("langue du guide : le module de contenu actif décide (-en : anglais), sinon la langue de l'interface", () => {
  assert.equal(langueDuGuide({ module: "lakour-40k-en", lang: "fr" }), "en");
  assert.equal(langueDuGuide({ module: "lakour-warcraft", lang: "en" }), "fr", "un monde au contenu français garde le guide français");
  assert.equal(langueDuGuide({ module: null, lang: "en" }), "en");
  assert.equal(langueDuGuide({ module: null, lang: "en-GB" }), "en");
  assert.equal(langueDuGuide({ module: null, lang: "fr" }), "fr");
  assert.equal(langueDuGuide({ module: null, lang: undefined }), "fr");
  // Lue dans le monde : variante active (game.modules), puis game.i18n.lang.
  const m = monde({ modules: ["lakour-40k-en"], lang: "fr" });
  assert.equal(langueDuGuide(), "en");
  m.activer([]);
  assert.equal(langueDuGuide(), "fr");
  globalThis.game.i18n.lang = "en";
  assert.equal(langueDuGuide(), "en");
});

test("monde anglais : guide anglais ; changement de langue : le même journal réécrit et renommé, jamais un second", async () => {
  const { journaux, compte, activer } = monde({ modules: ["lakour-40k-en"] });
  await installerGuide({ id: ID, versHTML });
  const mj = guideDe(journaux, "guide-mj");
  const joueurs = guideDe(journaux, "guide-joueurs");
  assert.equal(mj.name, "MJ IA — GM's Guide");
  assert.equal(joueurs.name, "MJ IA — Players' Guide");
  assert.equal(mj.flags[ID].langueGuide, "en");
  assert.deepEqual(mj.pages.map(p => p.name), GUIDES.en.mj.map(p => p.titre));
  assert.equal(joueurs.ownership.default, 2);
  // Retour au contenu français : mêmes journaux (droits gardés), pages et noms français.
  joueurs.ownership.default = 0; // le MJ l'avait caché : on n'y touche pas
  activer(["lakour-40k"]);
  await installerGuide({ id: ID, versHTML });
  assert.equal(journaux.length, 2);
  assert.deepEqual(compte(), { creations: 2, majPages: 2 });
  assert.equal(mj.name, "MJ IA — Guide du MJ");
  assert.deepEqual(mj.pages.map(p => p.name), GUIDE_MJ.map(p => p.titre));
  assert.equal(mj.flags[ID].langueGuide, "fr");
  assert.equal(joueurs.ownership.default, 0);
  // Un nom choisi par le MJ est gardé ; seules les pages changent de langue.
  joueurs.name = "Aide-mémoire de la table";
  activer(["lakour-40k-en"]);
  await installerGuide({ id: ID, versHTML });
  assert.equal(joueurs.name, "Aide-mémoire de la table");
  assert.equal(joueurs.flags[ID].langueGuide, "en");
  assert.equal(mj.name, "MJ IA — GM's Guide");
  await installerGuide({ id: ID, versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 4 }, "rien de refait une fois à jour");
});

test("un guide posé avant la traduction (sans langue) est français : rien à refaire dans un monde français", async () => {
  const { journaux, compte } = monde({ modules: ["lakour-40k"] });
  await installerGuide({ id: ID, versHTML });
  for (const j of journaux) delete j.flags[ID].langueGuide;
  await installerGuide({ id: ID, versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 0 });
});

test("docs/guide-utilisation.md et .en.md sont à jour (node outils/ecrire-guide.mjs après toute modification du guide)", () => {
  assert.deepEqual(Object.keys(FICHIERS_GUIDE).sort(), Object.keys(GUIDES).sort());
  for (const [langue, chemin] of Object.entries(FICHIERS_GUIDE)) {
    const fichier = readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(fichier, `${guideEnMarkdown(langue).trim()}\n`, chemin);
  }
});

test("le guide parle des trois mondes et de chaque module à activer", () => {
  const motsParLangue = { fr: ["Table de jeu", "Démarrer la séance"], en: ["Game Table", "Start session"] };
  for (const [langue, guide] of Object.entries(GUIDES)) {
    const tout = [...guide.mj, ...guide.joueurs].map(p => p.texte).join("\n");
    for (const mot of ["lakour-40k", "lakour-warcraft", "lakour-veillees", "lakour-loups", "dnd5e_fr-FR", ...motsParLangue[langue]]) {
      assert.ok(tout.includes(mot), `le guide (${langue}) ne parle pas de ${mot}`);
    }
  }
});

// ------------------------------------------------------------------ les deux langues se correspondent
const plat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? plat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const lire = f => JSON.parse(readFileSync(new URL(`../lang/${f}`, import.meta.url), "utf8"));
const EN = Object.fromEntries(plat(lire("en.json")));
// Un libellé tel qu'on le cite : sans la parenthèse finale (« Délai avant réponse (secondes) »), ni les deux-points, points
// d'exclamation ou points de suspension de la fin (« Prochaine étape : … »).
const net = t => t.replace(/\s*\([^()]*\)\s*$/, "").replace(/[\s:!?.…]+$/u, "").trim().toLowerCase();
// Libellé français (net) -> ses traductions anglaises (nettes) dans lang/en.json.
const LIBELLES = new Map();
for (const [cle, fr] of plat(lire("fr.json"))) {
  if (typeof EN[cle] !== "string" || !net(fr)) continue;
  if (!LIBELLES.has(net(fr))) LIBELLES.set(net(fr), new Set());
  LIBELLES.get(net(fr)).add(net(EN[cle]));
}
// Noms des outils de l'IA (déclarés « nom: "…" » dans scripts/outils*.js) : jamais traduits.
const OUTILS = new Set(readdirSync(new URL("../scripts/", import.meta.url)).filter(f => /^outils.*\.js$/.test(f))
  .flatMap(f => [...readFileSync(new URL(`../scripts/${f}`, import.meta.url), "utf8").matchAll(/^\s*nom: "([a-z_]+)"/gm)].map(m => m[1])));
// Ce qu'on cite en gras, en italique ou entre guillemets ; « A / B » compte pour A et pour B.
const citations = texte => [...texte.matchAll(/\*\*(.+?)\*\*|(?<![*\w])\*([^*\n]+?)\*(?![*\w])|«\s*(.+?)\s*»/g)]
  .flatMap(m => (m[1] ?? m[2] ?? m[3]).split(" / "));
// Identifiants de code : modules, outils, API, crochets, chemins (« api.coffre.chercher() », « lakour-mj-ia.pret »…).
const identifiants = texte => new Set([...texte.matchAll(/\blakour-[a-z0-9-]+|\b(?:fr-core|babele|dnd5e_fr-FR)\b|\b[a-z][\w]*(?:[._][\w]+)+(?:\([^)]*\))?/g)].map(m => m[0]));
const structure = texte => texte.trim().split("\n").map(l => (l.startsWith("# ") ? "#" : l.startsWith("- ") ? "-" : l.trim() ? "¶" : "")).join("");

const paires = () => ["mj", "joueurs"].flatMap(partie => GUIDES.fr[partie].map((fr, i) => ({ partie, fr, en: GUIDES.en[partie][i] })));

test("guide anglais : mêmes sections, dans le même ordre, et même découpage (titres « # », listes, paragraphes)", () => {
  for (const partie of ["mj", "joueurs"]) {
    assert.deepEqual(GUIDES.en[partie].map(p => p.cle), GUIDES.fr[partie].map(p => p.cle), `sections du guide ${partie}`);
    assert.equal(new Set(GUIDES.fr[partie].map(p => p.cle)).size, GUIDES.fr[partie].length, "une clé par section");
  }
  for (const { partie, fr, en } of paires()) {
    assert.ok(en.titre && en.titre !== fr.titre, `${partie}/${fr.cle} : titre traduit`);
    assert.equal(structure(en.texte), structure(fr.texte), `${partie}/${fr.cle} : même découpage`);
    assert.doesNotMatch(en.texte, /\b(?:le|la|les|des|du|une|est|avec|pour|dans|sans)\s+(?:le|la|les|des|un|une|MJ|joueurs?)\b/,
      `${partie}/${fr.cle} : reste de français ?`);
  }
});

test("guide anglais : mêmes noms d'outils, d'API, de modules et de crochets que le français", () => {
  for (const { partie, fr, en } of paires()) {
    const ids = identifiants(en.texte);
    for (const id of identifiants(fr.texte)) assert.ok(ids.has(id), `${partie}/${fr.cle} : « ${id} » manque en anglais`);
    // « son outil **horloge** », « (outil combat_etat) » : le nom de l'outil, jamais traduit (« horloge » seul est un mot).
    for (const [, outil] of fr.texte.matchAll(/outils?\s+\**([a-z_]+)/gi)) {
      if (!OUTILS.has(outil)) continue;
      assert.match(en.texte, new RegExp(`(?<![\\w-])${outil}(?![\\w-])`), `${partie}/${fr.cle} : l'outil ${outil} manque en anglais`);
    }
  }
});

test("guide anglais : chaque réglage, bouton ou libellé d'interface cité en français l'est en anglais tel que lang/en.json l'écrit", () => {
  let verifies = 0;
  for (const { partie, fr, en } of paires()) {
    const texteEn = en.texte.toLowerCase();
    for (const citation of citations(fr.texte)) {
      const traductions = LIBELLES.get(net(citation));
      if (!traductions || OUTILS.has(citation)) continue;
      verifies++;
      assert.ok([...traductions].some(t => texteEn.includes(t)),
        `${partie}/${fr.cle} : « ${citation} » devrait être cité en anglais comme « ${[...traductions].join(" » ou « ")} »`);
    }
  }
  assert.ok(verifies >= 50, `assez de libellés vérifiés (${verifies})`);
});
