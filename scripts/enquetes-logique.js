// Tableau d'enquête (« règle des trois indices ») : la logique pure, sans Foundry (essais/carnet.test.mjs). Le réglage monde
// « enquetes » (reglages.js) est un tableau d'enquêtes :
//   { id, titre, visible, maj, conclusions: [{ id, texte, revelee }], indices: [{ id, texte, ou, mene: [idConclusion], trouve }] }
// Une conclusion est ce que les joueurs doivent comprendre ; un indice mène à une ou plusieurs conclusions. La règle des trois
// indices : chaque conclusion encore cachée devrait avoir au moins SEUIL_INDICES indices encore trouvables (les joueurs en rateront).
// Les joueurs ne voient d'une enquête visible que les indices trouvés et les conclusions révélées : le réglage n'a d'ailleurs que
// cela en clair (secrets-logique.js) ; le reste, et les enquêtes cachées, sont chiffrés au coffre du Carnet (coffre.js).
import { idDepuisNom } from "./horloges-logique.js";
import { plier } from "./recherche-nom.js";

export const SEUIL_INDICES = 3;
// Lignes de l'enquête en cours dans le contexte de l'IA (contexte.js).
export const MAX_LIGNES_ENQUETE = 6;

const texte = v => (typeof v === "string" ? v.trim() : "");
const court = (t, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Une entrée (enquête, conclusion, indice) par identifiant, sinon par texte ou titre (casse et accents ignorés), sinon par
// l'identifiant tiré du texte donné.
export function trouverEntree(liste, ref, champ = "texte") {
  const r = texte(ref);
  if (!r || !Array.isArray(liste)) return null;
  return liste.find(e => e.id === r) ?? liste.find(e => plier(e[champ]) === plier(r)) ?? liste.find(e => e.id === idDepuisNom(r))
    ?? liste.find(e => idDepuisNom(e[champ]) === idDepuisNom(r)) ?? null;   // id tiré au hasard (élément caché) : par le nom
}

const idLibre = (base, pris) => idDepuisNom(base, pris);

// Une enquête complète à partir d'une définition partielle (API assurer, outil « creer »). Lève une erreur sans titre ni id.
export function normaliserEnquete(def = {}, pris = []) {
  const titre = texte(def.titre) || texte(def.id);
  if (!titre) throw new Error("une enquête a besoin d'un titre");
  const enquete = { id: texte(def.id) || idLibre(titre, pris), titre, visible: Boolean(def.visible), maj: Number(def.maj) || 0, conclusions: [], indices: [] };
  for (const c of def.conclusions ?? []) ajouterConclusionA(enquete, c);
  for (const i of def.indices ?? []) ajouterIndiceA(enquete, i);
  return enquete;
}

// Ajoute une conclusion (sur place). -> la conclusion, ou une erreur si le texte manque ou existe déjà.
function ajouterConclusionA(enquete, def) {
  const t = texte(typeof def === "string" ? def : def?.texte);
  if (!t) throw new Error("une conclusion a besoin d'un texte");
  if (trouverEntree(enquete.conclusions, t)) throw new Error(`la conclusion « ${t} » existe déjà`);
  const c = { id: texte(def?.id) || idLibre(t, enquete.conclusions.map(x => x.id)), texte: t, revelee: Boolean(def?.revelee) };
  enquete.conclusions.push(c);
  return c;
}

// Ajoute un indice (sur place) ; mene : identifiants ou textes de conclusions existantes (au moins une).
function ajouterIndiceA(enquete, def) {
  const t = texte(def?.texte);
  if (!t) throw new Error("un indice a besoin d'un texte");
  if (trouverEntree(enquete.indices, t)) throw new Error(`l'indice « ${t} » existe déjà`);
  const mene = [];
  for (const ref of def.mene ?? []) {
    const c = trouverEntree(enquete.conclusions, ref);
    if (!c) throw new Error(`conclusion introuvable : « ${ref} » (conclusions : ${enquete.conclusions.map(x => x.texte).join(" ; ") || "aucune"})`);
    if (!mene.includes(c.id)) mene.push(c.id);
  }
  if (!mene.length) throw new Error("un indice doit mener à au moins une conclusion");
  const i = { id: texte(def.id) || idLibre(t, enquete.indices.map(x => x.id)), texte: t, ou: texte(def.ou), mene, trouve: Boolean(def.trouve) };
  enquete.indices.push(i);
  return i;
}

// Versions qui rendent une copie (les outils et l'API) : { enquete, entree }.
const copier = e => structuredClone(e);
export function ajouterConclusion(enquete, def) {
  const e = copier(enquete);
  return { enquete: e, entree: ajouterConclusionA(e, def) };
}
export function ajouterIndice(enquete, def) {
  const e = copier(enquete);
  return { enquete: e, entree: ajouterIndiceA(e, def) };
}
// Un indice trouvé (ou non), une conclusion révélée (ou non). Lève une erreur si la référence est inconnue.
export function marquerIndice(enquete, ref, trouve = true) {
  const e = copier(enquete);
  const i = trouverEntree(e.indices, ref);
  if (!i) throw new Error(`indice introuvable : « ${ref} »`);
  i.trouve = Boolean(trouve);
  return { enquete: e, entree: i };
}
export function marquerConclusion(enquete, ref, revelee = true) {
  const e = copier(enquete);
  const c = trouverEntree(e.conclusions, ref);
  if (!c) throw new Error(`conclusion introuvable : « ${ref} »`);
  c.revelee = Boolean(revelee);
  return { enquete: e, entree: c };
}

// Les conclusions encore cachées qui ont moins de SEUIL_INDICES indices encore trouvables (non trouvés) :
// [{ conclusion, trouvables, trouves }].
export function conclusionsFragiles(enquete, seuil = SEUIL_INDICES) {
  return (enquete?.conclusions ?? []).filter(c => !c.revelee).map(c => {
    const lies = enquete.indices.filter(i => i.mene.includes(c.id));
    return { conclusion: c, trouvables: lies.filter(i => !i.trouve).length, trouves: lies.filter(i => i.trouve).length };
  }).filter(x => x.trouvables < seuil);
}

// Le rappel donné à l'IA après chaque modification : "" si chaque conclusion cachée a ses trois indices trouvables.
export function rappelTroisIndices(enquete) {
  const f = conclusionsFragiles(enquete);
  if (!f.length) return "";
  return `Règle des trois indices (« ${enquete.titre} ») : ${f.map(x => `« ${court(x.conclusion.texte)} » n'a que ${x.trouvables} indice(s) encore `
    + `trouvable(s)`).join(" ; ")}. Ajoute des indices (ajouter_indice), par d'autres chemins (un lieu, un PNJ, un document).`;
}

// Une enquête est ouverte tant qu'elle n'a pas de conclusion (elle vient d'être créée) ou qu'une de ses conclusions est cachée ;
// close quand toutes ses conclusions sont révélées.
export const enqueteOuverte = e => !e.conclusions.length || e.conclusions.some(c => !c.revelee);

// L'enquête en cours : la plus récemment créée ou modifiée parmi les ouvertes ; null si toutes sont closes.
export function enqueteEnCours(liste = []) {
  return [...liste].sort((a, b) => (Number(b.maj) || 0) - (Number(a.maj) || 0)).find(enqueteOuverte) ?? null;
}

// L'enquête visée quand l'outil ne la nomme pas : celle en cours, sinon la plus récente (close), pour la montrer ou la corriger.
export const enqueteParDefaut = (liste = []) => enqueteEnCours(liste)
  ?? [...liste].sort((a, b) => (Number(b.maj) || 0) - (Number(a.maj) || 0))[0] ?? null;

// La dernière enquête close (toutes ouvertes ou aucune : null), pour une seule ligne de contexte quand rien n'est en cours.
export function derniereClose(liste = []) {
  return [...liste].sort((a, b) => (Number(b.maj) || 0) - (Number(a.maj) || 0)).find(e => !enqueteOuverte(e)) ?? null;
}

// Un horodatage strictement croissant (deux écritures dans la même milliseconde restent ordonnées).
export const horodatage = (liste = [], maintenant = Date.now()) => Math.max(maintenant, ...liste.map(e => (Number(e.maj) || 0) + 1));

// Le résumé pour l'IA (MAX_LIGNES_ENQUETE lignes au plus) : l'en-tête, les conclusions révélées, celles à découvrir (avec leurs
// indices trouvés et trouvables), les indices encore à trouver, le rappel des trois indices.
export function resumeEnquete(enquete, max = MAX_LIGNES_ENQUETE) {
  if (!enquete) return [];
  const autres = enquete.autres ? ` (et ${enquete.autres} autre(s) : outil enquete, « lister »)` : "";
  const lignes = [`Enquête en cours « ${enquete.titre} » [${enquete.id}]${enquete.visible ? "" : ", cachée aux joueurs"}${autres} :`];
  const revelees = enquete.conclusions.filter(c => c.revelee);
  if (revelees.length) lignes.push(`- Conclusions révélées : ${revelees.map(c => court(c.texte, 60)).join(" ; ")}.`);
  const cachees = enquete.conclusions.filter(c => !c.revelee);
  if (cachees.length) {
    lignes.push(`- À découvrir : ${cachees.map(c => {
      const lies = enquete.indices.filter(i => i.mene.includes(c.id));
      return `${court(c.texte, 60)} (indices trouvés ${lies.filter(i => i.trouve).length}, encore trouvables ${lies.filter(i => !i.trouve).length})`;
    }).join(" ; ")}.`);
  }
  const restants = enquete.indices.filter(i => !i.trouve);
  if (restants.length) lignes.push(`- Indices à trouver : ${restants.slice(0, 6).map(i => `${court(i.texte, 50)}${i.ou ? ` (${court(i.ou, 40)})` : ""}`).join(" ; ")}${restants.length > 6 ? " ; …" : ""}.`);
  const trouves = enquete.indices.filter(i => i.trouve);
  if (trouves.length) lignes.push(`- Indices déjà trouvés : ${trouves.slice(0, 6).map(i => court(i.texte, 50)).join(" ; ")}${trouves.length > 6 ? " ; …" : ""}.`);
  const rappel = conclusionsFragiles(enquete);
  if (rappel.length) lignes.push(`- Règle des trois indices : à étoffer — ${rappel.map(x => court(x.conclusion.texte, 40)).join(" ; ")}.`);
  return lignes.slice(0, max);
}

// Ce que montre l'onglet Enquêtes : les joueurs, les enquêtes visibles, leurs indices trouvés et conclusions révélées seulement ;
// le MJ tout (indices non trouvés et conclusions cachées compris, avec où les trouver).
export function vueEnquetes(liste = [], { mj = false } = {}) {
  return liste.filter(e => mj || e.visible).map(e => {
    const nom = id => e.conclusions.find(c => c.id === id)?.texte ?? id;
    return {
      id: e.id, titre: e.titre, visible: e.visible,
      conclusions: e.conclusions.filter(c => mj || c.revelee).map(c => ({ id: c.id, texte: c.texte, revelee: c.revelee,
        fragile: mj && conclusionsFragiles(e).some(x => x.conclusion.id === c.id) })),
      indices: e.indices.filter(i => mj || i.trouve).map(i => ({ id: i.id, texte: i.texte, trouve: i.trouve, ou: mj ? i.ou : "",
        mene: mj ? i.mene.map(nom).join(" ; ") : "" }))
    };
  });
}
