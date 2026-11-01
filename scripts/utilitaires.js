import { DOSSIER_DONNEES } from "./constantes.js";

// HTML -> texte brut (contenu des messages, des journaux, des descriptions).
export function versTexte(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  doc.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, tr").forEach(el => el.append("\n"));
  return doc.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

export function tronquer(texte, max) {
  return texte.length <= max ? texte : `${texte.slice(0, max)}\n[… tronqué, ${texte.length - max} caractères de plus]`;
}

// Texte de l'IA -> HTML sûr pour le chat et les journaux : tout est échappé, puis seuls
// **gras**, *italique*, les listes « - » et les titres « # » sont rendus.
export function versHTML(texte) {
  const echappe = foundry.utils.escapeHTML ?? (t => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`));
  const enLigne = t => echappe(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  return String(texte ?? "").trim().split(/\n{2,}/).map(bloc => {
    const lignes = bloc.split("\n");
    if (lignes.every(l => /^\s*[-•]\s+/.test(l))) {
      return `<ul>${lignes.map(l => `<li>${enLigne(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    const titre = /^(#{1,3})\s+(.*)$/.exec(bloc);
    if (titre && lignes.length === 1) return `<h${titre[1].length + 1}>${enLigne(titre[2])}</h${titre[1].length + 1}>`;
    return `<p>${lignes.map(enLigne).join("<br>")}</p>`;
  }).join("");
}

// --- Fichiers dans Data/lakour-mj-ia/… (seul un MJ peut y écrire).
const FP = () => foundry.applications.apps.FilePicker.implementation;

async function creerDossier(chemin) {
  let courant = "";
  for (const morceau of chemin.split("/")) {
    courant = courant ? `${courant}/${morceau}` : morceau;
    try { await FP().createDirectory("data", courant, {}); } catch { /* existe déjà */ }
  }
}

export async function deposerFichier(sousDossier, nom, contenu) {
  const dossier = `${DOSSIER_DONNEES}/${sousDossier}`;
  await creerDossier(dossier);
  const fichier = contenu instanceof File ? contenu : new File([contenu], nom, { type: contenu.type || "application/json" });
  const r = await FP().upload("data", dossier, fichier, {}, { notify: false });
  if (!r?.path) throw new Error(`Dépôt de ${nom} impossible.`);
  return r.path;
}

export async function lireJSON(sousDossier, nom) {
  const chemin = `${DOSSIER_DONNEES}/${sousDossier}/${nom}`;
  const r = await fetch(`${foundry.utils.getRoute(chemin)}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

export function ecrireJSON(sousDossier, nom, objet) {
  return deposerFichier(sousDossier, nom, new Blob([JSON.stringify(objet)], { type: "application/json" }));
}

// Retrouve un acteur par UUID, identifiant ou nom (l'IA connaît surtout les noms).
export async function trouverActeur(reference) {
  if (!reference) return null;
  if (reference.includes(".")) {
    const doc = await fromUuid(reference).catch(() => null);
    if (doc) return doc.actor ?? doc;
  }
  const norme = reference.trim().toLowerCase();
  return game.actors.get(reference)
    ?? game.actors.find(a => a.name.toLowerCase() === norme)
    ?? canvas.scene?.tokens.find(t => t.name.toLowerCase() === norme)?.actor
    ?? game.actors.find(a => a.name.toLowerCase().includes(norme))
    ?? null;
}
