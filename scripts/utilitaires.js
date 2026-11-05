import { DOSSIER_DONNEES, MODELES_ANTHROPIC } from "./constantes.js";

// HTML -> texte brut (contenu des messages, des journaux, des descriptions).
export function versTexte(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  doc.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, tr").forEach(el => el.append("\n"));
  return sansEnrichers(doc.body.textContent).replace(/\n{3,}/g, "\n\n").trim();
}

// Les liens et jets enrichis des journaux, lus comme un joueur les voit : @UUID[…]{Nom} -> « Nom », [[/check …]]{Texte}
// -> « Texte », [[/save dex dc=13]] -> « (save dex dc=13) ». Sans libellé, un @UUID n'est qu'un identifiant : il disparaît.
export function sansEnrichers(texte) {
  return String(texte ?? "")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@UUID\[[^\]]*\]/g, "")
    .replace(/\[\[\/[^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/\[\[\/([^\]]*)\]\]/g, "($1)");
}

// Texte montré aux joueurs (chat, cartes, avis), dans la langue de l'interface : la clé de lang/<langue>.json, remplie de
// ses {paramètres} ; le français donné en repli (clé absente, ou hors de Foundry : essais). Le français du code et celui de
// lang/fr.json doivent rester identiques (essais/langue-du-monde.test.mjs).
export function texteJoueurs(cle, francais, donnees = {}) {
  let modele = francais;
  try {
    const i18n = globalThis.game?.i18n;
    if (i18n?.has?.(cle)) modele = i18n.localize(cle);
  } catch { /* hors Foundry : le français */ }
  return String(modele).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(donnees, k) ? String(donnees[k]) : m));
}

// Le libellé d'un modèle Claude, vu du MJ (configuration, console) : LAKOUR_MJIA.Modeles.<id>, sinon le libellé de constantes.js.
export const libelleModele = id => texteJoueurs(`LAKOUR_MJIA.Modeles.${id}`, MODELES_ANTHROPIC[id]?.libelle ?? id);

// Un message du chat écrit par un MJ (le navigateur du MJ actif, qui poste les cartes, narrations, répliques de compagnons et
// annonces du système) ? Foundry v14 (common/documents/chat-message.mjs) refuse qu'un joueur crée un message au nom d'un autre
// (#canCreate : author === lui) et le serveur interdit de changer l'auteur ensuite ; mais un joueur peut créer, puis modifier,
// SON message avec n'importe quel contenu, classe CSS ou drapeau (il en est propriétaire). Un bouton, un drapeau ou une classe
// du MJ IA n'est donc honoré que sur un message dont l'auteur est un MJ. message.author : le document User (champ
// DocumentAuthorField, résolu dans le client) ; isGM vaut aussi pour un MJ-assistant.
export const ecritParUnMJ = message => message?.author?.isGM === true;

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

// ------------------------------------------------------------------ Veillées (système lakour-loups 0.9.0)
// Le rôle et le camp d'un villageois ne sont plus dans ses documents (Foundry les livre à tous) : ils vivent dans les secrets du
// MJ actif, que le système donne par son API (game.lakourLoups.roleDe / campDe, MJ actif). Un système d'avant 0.9.0 : repli sur
// le document. roleLoups -> objet de rôle (name, img, system) ou null ; campLoups -> "village" | "meute" | "solitaire" | "".
export function roleLoups(acteur, api = globalThis.game?.lakourLoups) {
  if (!acteur) return null;
  if (typeof api?.roleDe === "function") return api.roleDe(acteur) ?? null;
  return acteur.items?.find?.(i => i.type === "role") ?? null;
}
export function campLoups(acteur, api = globalThis.game?.lakourLoups) {
  if (!acteur) return "";
  if (typeof api?.campDe === "function") return api.campDe(acteur) ?? "";
  return acteur.system?.camp ?? roleLoups(acteur, api)?.system?.camp ?? "";
}

// Aux Veillées, le MJ actif n'a pas (encore) les secrets à jour de la partie (coffre du système : autre navigateur, autre MJ, parts
// attendues) : le système refuse toute écriture. Le MJ IA se met en pause (narrateur, pilote, compagnons) : ses appels échoueraient,
// et coûteraient.
export function secretsVeilleesEnAttente() {
  if (globalThis.game?.system?.id !== "lakour-loups") return false;
  try { return Boolean(globalThis.game?.lakourLoups?.ecritureBloquee?.()); } catch { return false; }
}
