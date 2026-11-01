import { ID } from "./constantes.js";
import { versTexte, versHTML, tronquer } from "./utilitaires.js";

// Mémoire de campagne : un journal réservé au MJ, que l'IA complète (outil noter_memoire)
// et relit au début de chaque séance. Le MJ humain peut la corriger à la main.
export const SECTIONS = ["Résumé", "Personnages non joueurs", "Lieux", "Fils ouverts", "Notes du MJ"];
const NOM = "MJ IA — Mémoire de campagne";

export async function journalMemoire() {
  const existant = game.journal.find(j => j.getFlag(ID, "memoire"));
  if (existant) return existant;
  return JournalEntry.implementation.create({
    name: NOM,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [ID]: { memoire: true } },
    pages: SECTIONS.map((name, i) => ({ name, type: "text", sort: (i + 1) * 100, text: { content: "" } }))
  });
}

export async function lireMemoire() {
  const journal = game.journal.find(j => j.getFlag(ID, "memoire"));
  if (!journal) return "(mémoire vide : c'est la première séance)";
  const morceaux = journal.pages.contents
    .sort((a, b) => a.sort - b.sort)
    .map(p => `### ${p.name}\n${versTexte(p.text?.content) || "(vide)"}`);
  return tronquer(morceaux.join("\n\n"), 40000);
}

export async function noterMemoire(section, texte) {
  const journal = await journalMemoire();
  let page = journal.pages.find(p => p.name === section);
  if (!page) [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: section, type: "text", text: { content: "" } }]);
  const date = new Date().toLocaleDateString("fr-FR");
  const ajout = `<p><em>[${date}]</em></p>${versHTML(texte)}`;
  await page.update({ "text.content": `${page.text?.content ?? ""}${ajout}` });
  return `Noté dans « ${section} ».`;
}
