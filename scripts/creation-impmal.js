// Création de personnage Imperium Maledictum guidée par le MJ IA : calcul pur des caractéristiques,
// séparé de Foundry pour être éprouvé hors du navigateur (essais/creation.test.mjs).
// Règle du système (assistant de création) : chaque caractéristique = 2d10 + 20 ; +5 à la caractéristique
// de base de l'origine et à celle de la faction ; +5 à la caractéristique choisie pour l'origine et pour la faction.

export const CARACS = ["ws", "bs", "str", "tgh", "ag", "int", "per", "wil", "fel"];

export function calculerCaracteristiques(tirages, { baseOrigine, baseFaction, choix = [] }) {
  const erreurs = [];
  for (const c of CARACS) {
    const v = tirages[c];
    if (!Number.isInteger(v) || v < 22 || v > 40) erreurs.push(`${c} = ${v} : un tirage 2d10+20 donne un entier de 22 à 40`);
  }
  for (const c of [baseOrigine, baseFaction, ...choix]) {
    if (c && !CARACS.includes(c)) erreurs.push(`caractéristique inconnue : ${c}`);
  }
  if (choix.length > 2) erreurs.push("au plus deux bonus choisis (un pour l'origine, un pour la faction)");
  if (erreurs.length) return { erreurs };

  const resultat = Object.fromEntries(CARACS.map(c => [c, { starting: tirages[c], advances: 0, modifier: 0 }]));
  for (const c of [baseOrigine, baseFaction, ...choix]) if (c) resultat[c].starting += 5;
  return { caracteristiques: resultat, erreurs: [] };
}

// ---------- Objets de départ (comme les avancements de D&D 5e) : tout ce que donnent l'origine, la faction et le rôle,
// en suivant les choix de l'IA (uuid préférés) et, à défaut, la première option. Données brutes (toObject().system).

// Choix de warhammer-lib (ChoiceModel) : { structure: arbre or/and/option, options: [{ id, type: "item", documentId }] }.
// « or » : l'option qui contient le plus d'uuid préférés (la première à égalité) ; « and » : toutes.
export function uuidsDeChoix(choix, preferes = []) {
  if (!choix?.structure) return [];
  const voulus = new Set(preferes);
  const parId = new Map((choix.options ?? []).map(o => [o.id, o]));
  const visiter = noeud => {
    if (!noeud) return [];
    if (noeud.type === "option") {
      const o = parId.get(noeud.id);
      return o?.type === "item" && o.documentId ? [o.documentId] : [];
    }
    const enfants = (noeud.options ?? []).map(visiter);
    if (noeud.type === "and") return enfants.flat();
    let meilleur = enfants[0] ?? [];
    for (const e of enfants) if (e.filter(u => voulus.has(u)).length > meilleur.filter(u => voulus.has(u)).length) meilleur = e;
    return meilleur;
  };
  return visiter(choix.structure);
}

// Talents de rôle (TalentListModel) : `number` talents parmi la liste, les préférés d'abord.
export function talentsDeRole(talents, preferes = []) {
  const liste = (talents?.list ?? []).map(t => t.uuid).filter(Boolean);
  const voulus = liste.filter(u => preferes.includes(u));
  return [...voulus, ...liste.filter(u => !voulus.includes(u))].slice(0, talents?.number ?? 1);
}

// Tous les uuid de départ : listes de l'origine, choix de faction et de rôle, puis les objets demandés en plus. Sans doublon
// par défaut ; garderDoubles : chaque répétition reste (deux Stimm du Médicae), la fiche les fusionne ensuite (lakour-40k,
// preparerDepart, qui sait quels doubles sont voulus).
export function objetsDeDepart({ origine, faction, role }, preferes = [], { garderDoubles = false } = {}) {
  const uuids = [
    ...(origine?.equipment?.list ?? []).map(e => e.uuid), ...(origine?.talents?.list ?? []).map(e => e.uuid),
    ...uuidsDeChoix(faction?.character?.talents, preferes), ...uuidsDeChoix(faction?.character?.equipment, preferes),
    ...talentsDeRole(role?.talents, preferes), ...uuidsDeChoix(role?.equipment, preferes),
    ...preferes
  ];
  return garderDoubles ? uuids.filter(Boolean) : [...new Set(uuids.filter(Boolean))];
}

// Munitions par catégorie d'arme à distance (clés des munitions de lakour-40k) ; deux lots par arme à chargeur.
export const MUNITIONS = { las: "munition-charges-laser", solid: "munition-balles", bolt: "munition-bolts", flame: "munition-promethium", plasma: "munition-cellule-plasma" };
// Les armes à dispersion (fusil à pompe) tirent des cartouches, pas des balles.
export function munitionPour(arme) {
  if (arme?.type !== "weapon" || arme.system?.attackType !== "ranged" || !((arme.system?.mag?.value ?? 0) > 0)) return null;
  const dispersion = (arme.system.traits?.list ?? []).some(t => t.key === "spread");
  if (arme.system.category === "solid" && dispersion) return "munition-cartouches";
  return MUNITIONS[arme.system.category] ?? null;
}
