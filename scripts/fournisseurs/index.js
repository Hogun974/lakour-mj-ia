import { lire } from "../reglages.js";
import { MODELES_ANTHROPIC, modeleCompagnonsParDefaut } from "../constantes.js";
import { FournisseurAnthropic } from "./anthropic.js";
import { FournisseurOpenAI } from "./openai.js";
import { FournisseurFactice } from "./factice.js";

const CLASSES = { anthropic: FournisseurAnthropic, openai: FournisseurOpenAI, factice: FournisseurFactice };

// Fournisseur de texte choisi dans la configuration. Renvoie null si la clé manque.
export function fournisseurTexte() {
  const nom = lire("fournisseur");
  if (nom === "factice") return new FournisseurFactice();
  if (nom === "openai") {
    const cle = lire("cleOpenAI");
    return cle ? new FournisseurOpenAI({ cle, modele: lire("modeleOpenAI"), effort: lire("effort"), modeleImage: lire("modeleImage") }) : null;
  }
  const cle = lire("cleAnthropic");
  return cle ? new FournisseurAnthropic({ cle, modele: lire("modeleAnthropic"), effort: lire("effort") }) : null;
}

// Modèle des compagnons IA : le réglage s'il est rempli (et connu pour Anthropic), sinon un modèle bon marché du fournisseur actif.
export function modeleCompagnons(nom = lire("fournisseur")) {
  let choisi = "";
  try { choisi = String(lire("modeleCompagnons") ?? "").trim(); } catch { /* réglage absent */ }
  if (choisi && (nom !== "anthropic" || MODELES_ANTHROPIC[choisi])) return choisi;
  return modeleCompagnonsParDefaut(nom);
}

// Fournisseur des compagnons IA : même fournisseur et même clé que le MJ, autre modèle. null si la clé manque.
export function fournisseurCompagnons() {
  const nom = lire("fournisseur");
  if (nom === "factice") return new FournisseurFactice();
  const modele = modeleCompagnons(nom);
  if (nom === "openai") {
    const cle = lire("cleOpenAI");
    return cle ? new FournisseurOpenAI({ cle, modele, effort: "low", modeleImage: lire("modeleImage") }) : null;
  }
  const cle = lire("cleAnthropic");
  return cle ? new FournisseurAnthropic({ cle, modele, effort: "low" }) : null;
}

// Les images passent toujours par OpenAI (Claude ne dessine pas), quel que soit le fournisseur de texte.
export function fournisseurImages() {
  const cle = lire("cleOpenAI");
  return cle ? new FournisseurOpenAI({ cle, modele: lire("modeleOpenAI"), effort: "low", modeleImage: lire("modeleImage") }) : null;
}

export function expliquerErreur(erreur) {
  for (const classe of Object.values(CLASSES)) {
    const texte = classe.expliquer(erreur);
    if (texte) return texte;
  }
  return erreur?.message ?? String(erreur);
}
