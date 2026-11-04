// Modules de contenu La Kour, un par système de jeu. Chacun fournit les mêmes fichiers, que le MJ IA lit de la même façon :
// - assets/jetons/figurants.json : types de figurants { type: { libelle, jeton } } (jeton = assets/jetons/<jeton>.svg) ;
// - assets/jetons/index.json et index-3d.json : jeton d'un personnage joueur, par clé (rôle en 40k, peuple en Warcraft) ;
// - assets/cartes/plans.json et le plan dans les drapeaux des scènes (repères pour placer les jetons).
// Ce qu'on ajoute à l'un s'ajoute à l'autre : on écrit ici ce qui est commun, une seule fois.
export const CONTENUS = { impmal: "lakour-40k", dnd5e: "lakour-warcraft", "lakour-loups": "lakour-veillees", "lakour-survie": "lakour-fenoir" };

// Chaque module de contenu existe en français (« lakour-40k ») et en anglais (« lakour-40k-en » : même fabricant, mêmes _id
// de documents, mêmes drapeaux sous sa propre portée ; outils/traduction.mjs, docs/traduction.md). Un seul des deux est actif
// à la fois (ils se déclarent en conflit) : partout où le moteur nomme un module de contenu, il prend celui qui est actif.
export const SUFFIXE_ANGLAIS = "-en";
export const variantes = id => (id ? [id, `${id}${SUFFIXE_ANGLAIS}`] : []);
// Identifiant de base d'un module de contenu, quelle que soit sa langue : « lakour-40k-en » -> « lakour-40k ».
export const moduleDeBase = id => (typeof id === "string" ? id.replace(new RegExp(`${SUFFIXE_ANGLAIS}$`), "") : id);

// Module de contenu actif pour le système du monde (sa version française ou anglaise), ou null.
export function moduleDeContenu(systeme = game.system.id) {
  return variantes(CONTENUS[systeme]).find(id => game.modules.get(id)?.active) ?? null;
}

// Jeton de personnage joueur fourni par le module de contenu pour cette clé, dans le style voulu ; null sinon.
export async function jetonJoueur(cle, style) {
  const module = moduleDeContenu();
  if (!module || !cle) return null;
  try {
    const fichier = style === "3d" ? "index-3d.json" : "index.json";
    const index = await (await fetch(foundry.utils.getRoute(`modules/${module}/assets/jetons/${fichier}`), { cache: "no-store" })).json();
    return index[cle] ?? null;
  } catch { return null; } // pas de jetons fournis : image par défaut
}

// Types de figurants du module de contenu ; null s'il n'en fournit pas.
export async function figurantsDuContenu() {
  const module = moduleDeContenu();
  if (!module) return null;
  try {
    const types = await (await fetch(foundry.utils.getRoute(`modules/${module}/assets/jetons/figurants.json`), { cache: "no-store" })).json();
    return { module, types };
  } catch { return null; }
}
