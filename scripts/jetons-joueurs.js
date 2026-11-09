// Jetons des personnages joueurs déjà créés : quand un module de contenu change ses jetons (jetons peints de 2026-11), les fiches
// existantes gardaient l'ancienne image, posée une fois pour toutes à la création. Ici, le MJ actif leur redonne le jeton de leur
// peuple (Warcraft, dnd5e), de leur rôle (40k, impmal) ou de leur passé (Fénoir, lakour-survie), sur la fiche, le jeton type et les
// jetons déjà posés sur les cartes. Seulement les images posées par La Kour (dossier assets/jetons/ d'un module lakour-*) ou
// l'image par défaut : une image choisie par le MJ ou un joueur n'est jamais touchée.
// Les Veillées (lakour-loups) ne sont pas concernées : le rôle d'un villageois est secret, son jeton ne doit pas le dire.
// Automatique une fois par version du module de contenu (réglage « jetonsJoueurs »), et à la demande : api.jetonsJoueurs.rafraichir().
import { moduleDeContenu, drapeauxDuContenu, variantes, moduleDeBase, jetonJoueur } from "./contenus.js";

// Par système : le type d'acteur des personnages joueurs et la façon de trouver la clé de leur jeton (clé de index.json).
export const JOUEURS = {
  dnd5e: { type: "character", objet: "race" },
  impmal: { type: "character", objet: "role" },
  "lakour-survie": { type: "survivant", cle: acteur => acteur.system?.passe }
};

const DEFAUTS = ["icons/svg/mystery-man.svg"];
// Une image qu'on peut remplacer : vide, l'image par défaut de Foundry ou du système, ou un jeton fourni par un module La Kour.
export function remplacable(src, defaut = globalThis.CONFIG?.Actor?.documentClass?.DEFAULT_ICON) {
  if (!src) return true;
  const chemin = String(src).replace(/^\//, "");
  if (DEFAUTS.includes(chemin) || (defaut && chemin === String(defaut).replace(/^\//, ""))) return true;
  return /^modules\/lakour-[^/]+\/assets\/jetons\//.test(chemin);
}

// Clé du jeton d'un acteur : drapeau « cle » de son peuple ou de son rôle (posé par le module de contenu, variante française ou
// anglaise), sinon celui de l'objet du même nom dans un compendium du module ; pour un survivant, son passé.
export async function cleDuJoueur(acteur, systeme = globalThis.game?.system?.id, module = moduleDeContenu(systeme)) {
  const regle = JOUEURS[systeme];
  if (!regle || !module || acteur?.type !== regle.type) return null;
  if (regle.cle) return regle.cle(acteur) || null;
  const objet = acteur.items?.find?.(i => i.type === regle.objet);
  if (!objet) return null;
  const cle = drapeauxDuContenu(objet.flags, module)?.cle;
  if (cle) return cle;
  const ids = variantes(moduleDeBase(module));
  for (const pack of globalThis.game?.packs ?? []) {
    if (pack.documentName !== "Item" || !ids.includes(pack.metadata?.packageName)) continue;
    const index = await pack.getIndex({ fields: ["flags", "type"] }).catch(() => null);
    const trouve = index?.find?.(e => e.type === regle.objet && e.name === objet.name);
    const c = trouve ? drapeauxDuContenu(trouve.flags, module)?.cle : null;
    if (c) return c;
  }
  return null;
}

// Redonne leur jeton aux personnages joueurs. -> nombre de personnages changés.
export async function rafraichirJetonsJoueurs({ style = "2d", jeu = globalThis.game } = {}) {
  const systeme = jeu?.system?.id;
  if (!JOUEURS[systeme] || !moduleDeContenu(systeme)) return 0;
  let n = 0;
  for (const acteur of jeu.actors ?? []) {
    const cle = await cleDuJoueur(acteur, systeme);
    const jeton = cle ? await jetonJoueur(cle, style) : null;
    if (!jeton) continue;
    const maj = {};
    if (acteur.img !== jeton && remplacable(acteur.img)) maj.img = jeton;
    const tex = acteur.prototypeToken?.texture?.src;
    if (tex !== jeton && remplacable(tex)) maj["prototypeToken.texture.src"] = jeton;
    let change = false;
    if (Object.keys(maj).length) { await acteur.update(maj); change = true; }
    for (const scene of jeu.scenes ?? []) {
      const poses = (scene.tokens ?? []).filter(t => t.actorId === acteur.id && t.texture?.src !== jeton && remplacable(t.texture?.src));
      if (poses.length) { await scene.updateEmbeddedDocuments("Token", poses.map(t => ({ _id: t.id, "texture.src": jeton }))); change = true; }
    }
    if (change) n++;
  }
  return n;
}

// Signature du contenu qui fournit les jetons : module actif et sa version. Elle change avec une nouvelle version du monde.
export function signatureJetons(jeu = globalThis.game) {
  const module = moduleDeContenu(jeu?.system?.id);
  return module ? `${module}@${jeu.modules.get(module)?.version ?? ""}` : "";
}
