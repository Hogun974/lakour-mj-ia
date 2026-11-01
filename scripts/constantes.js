// Identifiant du module : doit rester identique à "id" dans module.json.
export const ID = "lakour-mj-ia";

// Modèles proposés. Claude Opus 5.5 par défaut ; le choix appartient au MJ (coût / qualité).
// Prix Anthropic en dollars par million de jetons (relevés le 06/10/2026) : ils servent
// uniquement à l'estimation affichée dans la console, la facture fait foi.
export const MODELES_ANTHROPIC = {
  "claude-opus-5-5": { libelle: "Claude Opus 5.5 (recommandé)", entree: 4, sortie: 20, cacheLecture: 0.2, cacheEcriture: 5, repli: true },
  "claude-sonnet-5-5": { libelle: "Claude Sonnet 5.5 (moins cher)", entree: 2, sortie: 10, cacheLecture: 0.2, cacheEcriture: 2.5, repli: true },
  "claude-haiku-5-5": { libelle: "Claude Haiku 5.5 (très économique)", entree: 0.1, sortie: 0.5, cacheLecture: 0.01, cacheEcriture: 0.125, repli: false },
  "claude-fable-5-1": { libelle: "Claude Fable 5.1 (le plus puissant, le plus cher)", entree: 10, sortie: 50, cacheLecture: 0.25, cacheEcriture: 12.5, repli: true }
};

// OpenAI : le modèle est un champ libre (leur gamme change souvent) ; ces valeurs ne sont que des suggestions.
// GPT-6.1 Sol : meilleur rapport qualité/prix pour mener une partie (relevé le 31/10/2026).
export const MODELE_OPENAI_DEFAUT = "gpt-6.1-sol";
export const MODELE_IMAGE_DEFAUT = "gpt-image-2";

// Prix OpenAI en dollars par million de jetons (relevés le 31/10/2026), pour l'estimation de la console.
// Clé = début de l'identifiant du modèle (« gpt-6.1-sol-2026-… » trouve « gpt-6.1-sol »).
export const PRIX_OPENAI = {
  "gpt-6-astra": { entree: 10, cacheLecture: 1, sortie: 50 },
  "gpt-6.1-sol": { entree: 2, cacheLecture: 0.1, sortie: 10 },
  "gpt-6.1-terra": { entree: 1, cacheLecture: 0.05, sortie: 5 },
  "gpt-6-sol": { entree: 2, cacheLecture: 0.2, sortie: 10 },
  "gpt-6-luna": { entree: 0.1, cacheLecture: 0.01, sortie: 0.5 },
  "gpt-5.6-sol": { entree: 4, cacheLecture: 0.4, sortie: 20 },
  "gpt-5.6-terra": { entree: 2, cacheLecture: 0.2, sortie: 12 },
  "gpt-5.6-luna": { entree: 0.2, cacheLecture: 0.02, sortie: 1.2 },
  "gpt-5.5": { entree: 5, cacheLecture: 0.5, sortie: 30 },
  "gpt-5.4-mini": { entree: 0.75, cacheLecture: 0.075, sortie: 4.5 },
  "gpt-5.4-nano": { entree: 0.2, cacheLecture: 0.02, sortie: 1.25 },
  "gpt-5.4": { entree: 2.5, cacheLecture: 0.25, sortie: 15 }
};

// Prix d'un modèle OpenAI : l'entrée la plus longue qui commence l'identifiant (gpt-5.4-mini avant gpt-5.4).
export function prixOpenAI(modele) {
  const cle = Object.keys(PRIX_OPENAI).filter(k => modele === k || modele?.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return cle ? { ...PRIX_OPENAI[cle], cacheEcriture: 0 } : null;
}

// Prix d'un modèle chez un fournisseur (estimation de la console), null si inconnu.
export function prixDuModele(fournisseur, modele) {
  if (fournisseur === "anthropic") return MODELES_ANTHROPIC[modele] ?? null;
  if (fournisseur === "openai") return prixOpenAI(modele);
  return null;
}

// Coût en dollars d'un appel, d'après son usage ({ entree, cacheLecture, cacheEcriture, sortie }) et un prix.
export function coutDe(usage, prix) {
  if (!prix) return 0;
  return ((usage.entree ?? 0) * prix.entree + (usage.cacheLecture ?? 0) * prix.cacheLecture
    + (usage.cacheEcriture ?? 0) * (prix.cacheEcriture ?? 0) + (usage.sortie ?? 0) * prix.sortie) / 1e6;
}

// Modèle des compagnons IA par défaut : un modèle bon marché du fournisseur actif (Claude Haiku 5.5 chez Anthropic,
// le moins cher de la liste chez OpenAI). Le réglage « modeleCompagnons » l'emporte s'il est rempli.
export const MODELE_COMPAGNONS_ANTHROPIC = "claude-haiku-5-5";
export function modeleCompagnonsParDefaut(fournisseur) {
  if (fournisseur === "anthropic") return MODELE_COMPAGNONS_ANTHROPIC;
  if (fournisseur === "openai") {
    return Object.entries(PRIX_OPENAI).sort(([, a], [, b]) => (a.entree + a.sortie) - (b.entree + b.sortie))[0][0];
  }
  return "factice";
}

// Anciens réglages par défaut, remplacés au chargement du monde s'ils n'ont pas été changés à la main.
export const ANCIENS_DEFAUTS = { modeleOpenAI: ["gpt-5.5"], modeleVoix: ["gpt-4o-mini-tts"] };

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Voix du narrateur (OpenAI). gpt-4o-mini-tts (API Speech) s'arrête le 06/01/2027 : OpenAI le remplace par
// gpt-realtime-2.1-mini (API Realtime), qui accepte aussi des consignes de ton. Un modèle « gpt-realtime… »
// passe par Realtime, tout autre modèle par l'ancienne API Speech.
export const MODELE_VOIX = "gpt-realtime-2.1-mini";
// Voix de l'API Realtime (marin et cedar : les meilleures selon OpenAI).
export const VOIX_OPENAI = ["cedar", "marin", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "alloy"];

// Dossier (dans Data/) où le module range ses fichiers : fils de conversation, images générées.
export const DOSSIER_DONNEES = "lakour-mj-ia";
