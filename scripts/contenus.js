// Modules de contenu La Kour, un par système de jeu. Chacun fournit les mêmes fichiers, que le MJ IA lit de la même façon :
// - assets/jetons/figurants.json : types de figurants { type: { libelle, jeton } } (jeton = assets/jetons/<jeton>.svg) ;
// - assets/jetons/index.json et index-3d.json : jeton d'un personnage joueur, par clé (rôle en 40k, peuple en Warcraft) ;
// - assets/cartes/plans.json et le plan dans les drapeaux des scènes (repères pour placer les jetons).
// Ce qu'on ajoute à l'un s'ajoute à l'autre : on écrit ici ce qui est commun, une seule fois.
export const CONTENUS = { impmal: "lakour-40k", dnd5e: "lakour-warcraft", "lakour-loups": "lakour-veillees" };

// Module de contenu actif pour le système du monde, ou null.
export function moduleDeContenu(systeme = game.system.id) {
  const id = CONTENUS[systeme];
  return id && game.modules.get(id)?.active ? id : null;
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
