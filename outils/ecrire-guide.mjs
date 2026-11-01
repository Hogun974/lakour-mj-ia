// Recopie le guide d'utilisation du MJ IA (scripts/guide.js, seule source) en Markdown dans
// docs/guide-utilisation.md, pour le lire hors de Foundry (dépôt git, Forgejo).  Usage : node outils/ecrire-guide.mjs
import { writeFileSync } from "node:fs";
import { GUIDE_MJ, GUIDE_JOUEURS } from "../scripts/guide.js";

export function guideEnMarkdown() {
  const section = (titre, pages) => [`## ${titre}`, "", ...pages.flatMap(p => [`### ${p.titre}`, "",
    // Les titres « # » d'une page deviennent des titres de niveau 4 sous la page.
    p.texte.trim().replace(/^# (.*)$/gm, "#### $1"), ""])];
  return [
    "# Guide d'utilisation — MJ IA de La Kour", "",
    "Ce guide est aussi installé dans chaque monde par le MJ IA (journaux « MJ IA — Guide du MJ » et « MJ IA — Guide des joueurs »).", "",
    ...section("Pour le MJ", GUIDE_MJ), ...section("Pour les joueurs", GUIDE_JOUEURS)
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  writeFileSync(new URL("../docs/guide-utilisation.md", import.meta.url), `${guideEnMarkdown().trim()}\n`);
  console.log("docs/guide-utilisation.md écrit");
}
