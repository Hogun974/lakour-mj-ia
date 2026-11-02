// Retrouver un document par le nom que donne l'IA (lancer_table), sans jamais tomber au hasard sur le mauvais : logique pure,
// sans Foundry (essais/lancer-table.test.mjs). Trois niveaux, dans l'ordre : nom exact, puis nom qui commence par le texte,
// puis nom qui le contient ; casse, accents, apostrophes et espaces ignorés. Le premier niveau qui trouve quelque chose décide :
// un seul nom → choisi ; plusieurs noms différents → ambigu, la liste des candidats revient à l'IA.

// « L’Épreuve  du Warp » → « l'epreuve du warp » ; « Le Chœur » → « le choeur » (ligatures, que NFD ne décompose pas).
export const plier = texte => String(texte ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2019\u02bc`]/g, "'")
  .replace(/[œŒ]/g, "oe").replace(/[æÆ]/g, "ae")
  .toLowerCase().replace(/\s+/g, " ").trim();

// candidats : dans l'ordre de préférence (tables du monde avant celles des compendiums) ; nomDe lit le nom d'un candidat.
// -> { choix, ambigus } : choix = le candidat retenu (le premier si plusieurs portent le même nom, une copie dans le monde
// d'une table de compendium par exemple), ou null ; ambigus = les noms candidats quand le texte en désigne plusieurs.
export function choisirParNom(candidats, texte, nomDe = c => c.nom) {
  const cible = plier(texte);
  if (!cible) return { choix: null, ambigus: [] };
  const niveaux = [n => n === cible, n => n.startsWith(cible), n => n.includes(cible)];
  for (const correspond of niveaux) {
    const trouves = candidats.filter(c => correspond(plier(nomDe(c))));
    if (!trouves.length) continue;
    if (new Set(trouves.map(c => plier(nomDe(c)))).size === 1) return { choix: trouves[0], ambigus: [] };
    return { choix: null, ambigus: [...new Set(trouves.map(nomDe))] };
  }
  return { choix: null, ambigus: [] };
}
