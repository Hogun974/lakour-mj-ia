// Dans quelle pièce se trouve un point ? Nos cartes (creer_scene et cartes d'aventure) portent, pour chaque
// pièce, un dessin rectangulaire caché au texte = nom de la pièce. Pur : éprouvé hors Foundry (essais/salles.test.mjs).

// dessins : [{ x, y, shape: { type, width, height }, text, hidden }]
export function salleEn(dessins, px, py) {
  const etiquettes = dessins.filter(d => d.hidden && d.text && d.shape?.type === "r");
  // La plus petite pièce qui contient le point (un couloir peut être dessiné dans une grande salle).
  let meilleure = null;
  for (const d of etiquettes) {
    const dedans = px >= d.x && px < d.x + d.shape.width && py >= d.y && py < d.y + d.shape.height;
    if (!dedans) continue;
    const aire = d.shape.width * d.shape.height;
    if (!meilleure || aire < meilleure.aire) meilleure = { nom: d.text, aire };
  }
  return meilleure?.nom ?? null;
}

// Pièces de part et d'autre d'un segment de mur (une porte) : on sonde un peu de chaque côté de son milieu.
export function sallesAutourDe(dessins, c, ecart = 25) {
  const [x1, y1, x2, y2] = c;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const horizontal = y1 === y2;
  const cotes = horizontal ? [[mx, my - ecart], [mx, my + ecart]] : [[mx - ecart, my], [mx + ecart, my]];
  return [...new Set(cotes.map(([x, y]) => salleEn(dessins, x, y)).filter(Boolean))];
}
