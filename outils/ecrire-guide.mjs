// Recopie le guide d'utilisation du MJ IA (scripts/guide.js et sa traduction scripts/guide-en.js, seules sources) en Markdown
// dans docs/guide-utilisation.md (français) et docs/guide-utilisation.en.md (anglais), pour le lire hors de Foundry (dépôt git,
// Forgejo).  Usage : node outils/ecrire-guide.mjs
import { writeFileSync } from "node:fs";
import { GUIDES } from "../scripts/guide.js";

// Fichier écrit pour chaque langue, et ce qui entoure les pages.
export const FICHIERS_GUIDE = { fr: "docs/guide-utilisation.md", en: "docs/guide-utilisation.en.md" };
const ENTOURAGE = {
  fr: {
    titre: "Guide d'utilisation — MJ IA de La Kour",
    chapeau: g => `Ce guide est aussi installé dans chaque monde par le MJ IA (journaux « ${g.noms["guide-mj"]} » et « ${g.noms["guide-joueurs"]} »). `
      + "In English: [guide-utilisation.en.md](guide-utilisation.en.md).",
    mj: "Pour le MJ", joueurs: "Pour les joueurs"
  },
  en: {
    titre: "User guide — La Kour AI GM (MJ IA)",
    chapeau: g => `This guide is also installed in every English world by the AI GM (journals "${g.noms["guide-mj"]}" and "${g.noms["guide-joueurs"]}"). `
      + "En français : [guide-utilisation.md](guide-utilisation.md).",
    mj: "For the GM", joueurs: "For the players"
  }
};

export function guideEnMarkdown(langue = "fr") {
  const guide = GUIDES[langue], e = ENTOURAGE[langue];
  const section = (titre, pages) => [`## ${titre}`, "", ...pages.flatMap(p => [`### ${p.titre}`, "",
    // Les titres « # » d'une page deviennent des titres de niveau 4 sous la page.
    p.texte.trim().replace(/^# (.*)$/gm, "#### $1"), ""])];
  return [
    `# ${e.titre}`, "", e.chapeau(guide), "",
    ...section(e.mj, guide.mj), ...section(e.joueurs, guide.joueurs)
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL((await import("node:path")).resolve(process.argv[1])).href) {
  for (const [langue, fichier] of Object.entries(FICHIERS_GUIDE)) {
    writeFileSync(new URL(`../${fichier}`, import.meta.url), `${guideEnMarkdown(langue).trim()}\n`);
    console.log(`${fichier} écrit`);
  }
}
