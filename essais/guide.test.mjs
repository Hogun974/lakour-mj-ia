// Guide d'utilisation du MJ IA : installé dans chaque monde (journal du MJ caché, journal des joueurs visible), une seule fois par
// version, et recopié à l'identique dans docs/guide-utilisation.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
const { installerGuide, VERSION_GUIDE, GUIDE_MJ, GUIDE_JOUEURS } = await import("../scripts/guide.js");
const { guideEnMarkdown } = await import("../outils/ecrire-guide.mjs");

function monde() {
  const journaux = [];
  let creations = 0, majPages = 0;
  const journal = d => {
    const j = { ...d, flags: structuredClone(d.flags ?? {}), pages: Object.assign([...d.pages], {}),
      getFlag(s, k) { return this.flags[s]?.[k]; },
      async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; },
      async deleteEmbeddedDocuments() { this.pages.length = 0; majPages++; },
      async createEmbeddedDocuments(_, p) { this.pages.push(...p); } };
    journaux.push(j);
    return j;
  };
  globalThis.game = { journal: journaux };
  globalThis.JournalEntry = { implementation: { create: async d => { creations++; return journal(d); } } };
  return { journaux, compte: () => ({ creations, majPages }) };
}
const versHTML = t => `<p>${t.trim()}</p>`;

test("deux journaux : guide du MJ caché, guide des joueurs visible ; une seule installation par version", async () => {
  const { journaux, compte } = monde();
  await installerGuide({ id: "lakour-mj-ia", versHTML });
  assert.equal(journaux.length, 2);
  const mj = journaux.find(j => j.flags["lakour-mj-ia"].guide === "guide-mj");
  const joueurs = journaux.find(j => j.flags["lakour-mj-ia"].guide === "guide-joueurs");
  assert.equal(mj.ownership.default, 0, "le guide du MJ est caché aux joueurs");
  assert.equal(joueurs.ownership.default, 2, "le guide des joueurs est visible");
  assert.equal(mj.pages.length, GUIDE_MJ.length);
  assert.equal(joueurs.pages.length, GUIDE_JOUEURS.length);
  await installerGuide({ id: "lakour-mj-ia", versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 0 }, "rien de refait à la même version");
  // Nouvelle version du guide : les pages sont remplacées, sans recréer les journaux.
  mj.flags["lakour-mj-ia"].versionGuide = VERSION_GUIDE - 1;
  await installerGuide({ id: "lakour-mj-ia", versHTML });
  assert.deepEqual(compte(), { creations: 2, majPages: 1 });
  assert.equal(mj.flags["lakour-mj-ia"].versionGuide, VERSION_GUIDE);
});

test("docs/guide-utilisation.md est à jour (node outils/ecrire-guide.mjs après toute modification du guide)", () => {
  const fichier = readFileSync(new URL("../docs/guide-utilisation.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(fichier, `${guideEnMarkdown().trim()}\n`);
});

test("le guide parle des trois mondes et de chaque module à activer", () => {
  const tout = [...GUIDE_MJ, ...GUIDE_JOUEURS].map(p => p.texte).join("\n");
  for (const mot of ["lakour-40k", "lakour-warcraft", "lakour-veillees", "lakour-loups", "dnd5e_fr-FR", "Table de jeu", "Démarrer la séance"]) {
    assert.ok(tout.includes(mot), `le guide ne parle pas de ${mot}`);
  }
});
