// Outil histoire_personnage (40k, Warcraft, Fénoir ; pas les Veillées) : le MJ IA prépare, écrit, complète l'histoire d'un
// personnage, ou y ajoute un chapitre (histoire.js, histoire-logique.js ; §10.5 de docs/survie-contrat.md, dépôt lakour-fenoir).
// Pour un compagnon IA, le résumé de son histoire entre dans sa personnalité (champ « histoire ») : il en parle, s'en souvient,
// agit selon elle. Ajouté à OUTILS par outils.js.
import { ID } from "./constantes.js";
import { versHTML } from "./utilitaires.js";
import * as H from "./histoire-logique.js";
import { assurerJournal, ecrireHistoire } from "./histoire.js";
import { estCompagnon } from "./compagnons-jeu.js";
import { texteQuand, nomDe } from "./survie-logique.js";

const objet = proprietes => ({ type: "object", properties: proprietes, required: Object.keys(proprietes), additionalProperties: false });
const chaine = description => ({ type: "string", description });
const n = t => String(t ?? "").trim().toLowerCase();

function personnage(nom) {
  const cle = n(nom);
  if (!cle) return null;
  const tous = [...(game.actors?.contents ?? game.actors ?? [])];
  return game.actors.get?.(nom) ?? tous.find(a => n(a.name) === cle) ?? tous.find(a => n(a.name).includes(cle)) ?? null;
}
// La date d'un chapitre : celle de Fénoir (jour de jeu), sinon le jour réel de la séance.
function quandChapitre() {
  if (game.system?.id === "lakour-survie") {
    try { const q = game.lakourSurvie?.quand?.(); if (q) return texteQuand(q).replace(/^jour/, "Jour"); } catch { /* sans système */ }
  }
  return `Séance du ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}
const nomContenu = (collection, cle) => { try { return nomDe(game.lakourSurvie?.contenu?.()?.[collection], cle); } catch { return cle; } };

export const OUTIL_HISTOIRE = {
  nom: "histoire_personnage",
  systemes: H.SYSTEMES_HISTOIRE,
  description: "L'histoire d'un personnage (joueur, compagnon IA, recrue ou PNJ important), dans son journal « Histoire de <nom> » (quatre "
    + "pages : « Qui il est » et « Son histoire » lisibles de tous, « Ce qu'il garde pour lui » pour son joueur et toi seuls, « Chapitres »). "
    + "preparer : crée le journal s'il manque et te rend ce que le contenu du monde dit de lui (origine, faction, rôle ; peuple, "
    + "historique, classe ; enfance, passé, traits) et les questions à poser. ecrire : remplace les pages données (après deux ou trois "
    + "questions courtes au joueur, ou en inventant s'il le demande). completer : ajoute aux pages données. chapitre : un paragraphe "
    + "daté après un événement marquant de la campagne. Pour un compagnon IA, le résumé entre dans sa personnalité.",
  schema: objet({
    personnage: chaine("Nom du personnage."),
    action: { type: "string", enum: ["preparer", "ecrire", "completer", "chapitre"], description: "Ce qu'il faut faire." },
    qui_il_est: chaine("Page « Qui il est » : origine, famille, ce qu'il faisait, apparence, manières (vide = inchangée)."),
    son_histoire: chaine("Page « Son histoire » : le passé raconté, ce qui l'a amené là (vide = inchangée)."),
    ce_qu_il_garde: chaine("Page « Ce qu'il garde pour lui » : un secret, une peur, ce qu'il cherche (vide = inchangée)."),
    chapitre: chaine("action chapitre : le paragraphe à ajouter ; vide sinon."),
    resume_compagnon: chaine("Compagnon IA : le résumé de son histoire pour sa personnalité, deux ou trois phrases à la deuxième personne "
      + "(« Tu as grandi… ») ; vide = tiré des pages écrites.")
  }),
  sensible: false,
  async executer({ personnage: nom, action, qui_il_est = "", son_histoire = "", ce_qu_il_garde = "", chapitre = "", resume_compagnon = "" }) {
    const systeme = game.system?.id;
    if (!H.SYSTEMES_HISTOIRE.includes(systeme)) return { erreur: true, contenu: "Pas d'histoire de personnage dans ce monde (40k, Warcraft et Fénoir seulement)." };
    const acteur = personnage(nom);
    if (!acteur) return { erreur: true, contenu: `Personnage introuvable : ${nom}.` };
    try {
      if (action === "preparer") {
        const { journal, cree } = await assurerJournal(acteur);
        const ecrites = H.PAGES_HISTOIRE.filter(p => !H.estAide(H.pageDe(journal, p.cle)?.text?.content)).map(p => p.nom);
        const materiau = H.materiauHistoire(acteur, systeme, { nomDe: nomContenu });
        const q = H.questionsAide(systeme);
        return { contenu: [
          `Journal « ${journal.name} » ${cree ? "créé (pages d'aide)" : "déjà là"} ; pages écrites : ${ecrites.join(", ") || "aucune"}.`,
          materiau.length ? `Ce que le monde dit de lui :\n${materiau.map(l => `- ${l}`).join("\n")}` : "Sa fiche ne dit rien de son origine : demande au joueur.",
          `Questions possibles (deux ou trois, courtes) : ${[...q.qui.slice(0, 1), ...q.histoire, q.secret[0]].join(" ; ")}`,
          "Ensuite : histoire_personnage, action ecrire."
        ].join("\n") };
      }
      const textes = { qui: qui_il_est, histoire: son_histoire, secret: ce_qu_il_garde };
      if (action === "chapitre" && !chapitre.trim()) return { erreur: true, contenu: "Donne le paragraphe du chapitre." };
      if (action !== "chapitre" && !Object.values(textes).some(t => t.trim())) return { erreur: true, contenu: "Rien à écrire : donne au moins une page." };
      const r = await ecrireHistoire(acteur, {
        ...(action === "chapitre" ? { chapitre: versHTML(chapitre), quand: quandChapitre() }
          : Object.fromEntries(Object.entries(textes).map(([k, t]) => [k, t.trim() ? versHTML(t) : ""]))),
        mode: action === "completer" ? "completer" : "ecrire"
      });
      let compagnon = "";
      if (estCompagnon(acteur) && action !== "chapitre" && acteur.type !== "villageois") {
        const p = acteur.flags?.[ID]?.compagnon ?? {};
        const resume = H.resumeCompagnon({ resume: resume_compagnon, histoire: son_histoire || "", qui: qui_il_est, secret: ce_qu_il_garde })
          || p.histoire || "";
        if (resume) {
          await acteur.update({ [`flags.${ID}.compagnon`]: { ...p, histoire: resume } });
          compagnon = ` Sa personnalité de compagnon garde ce résumé : « ${resume} ».`;
        }
      }
      return { contenu: `Histoire de ${acteur.name} : ${r.pages} page(s) ${action === "completer" ? "complétée(s)" : action === "chapitre" ? "(chapitre ajouté)" : "écrite(s)"}`
        + `${r.cree ? " (journal créé)" : ""}.${r.manquantes.length ? ` Pages introuvables (supprimées ?) : ${r.manquantes.join(", ")}.` : ""}${compagnon}` };
    } catch (e) {
      return { erreur: true, contenu: `histoire_personnage : ${e.message}` };
    }
  }
};
