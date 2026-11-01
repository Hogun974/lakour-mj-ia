// Placement des jetons sur la grille : pièces de la carte et cases libres. Pur : éprouvé hors Foundry
// (essais/placement.test.mjs). Toutes les positions sont en cases (0,0 = coin haut-gauche de la scène).

// Pièces de la carte, d'après les dessins rectangulaires cachés dont le texte est le nom de la pièce
// (posés par creer_scene et par les cartes des aventures). grille = { size, sceneX, sceneY }.
export function listeSalles(dessins, { size, sceneX, sceneY }) {
  return dessins
    .filter(d => d.hidden && d.text && d.shape?.type === "r")
    .map(d => ({
      nom: d.text,
      x1: Math.floor((d.x - sceneX) / size + 1e-6),
      y1: Math.floor((d.y - sceneY) / size + 1e-6),
      x2: Math.ceil((d.x + d.shape.width - sceneX) / size - 1e-6) - 1,
      y2: Math.ceil((d.y + d.shape.height - sceneY) / size - 1e-6) - 1
    }));
}

const sansAccent = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Pièce par nom : exact (sans accents ni casse), sinon la plus petite dont le nom contient la recherche.
export function trouverSalle(salles, nom) {
  const n = sansAccent(nom);
  if (!n) return null;
  const aire = s => (s.x2 - s.x1 + 1) * (s.y2 - s.y1 + 1);
  return salles.find(s => sansAccent(s.nom) === n)
    ?? salles.filter(s => sansAccent(s.nom).includes(n)).sort((a, b) => aire(a) - aire(b))[0]
    ?? null;
}

// La plus petite pièce qui contient une case.
export function salleDeLaCase(salles, x, y) {
  return salles
    .filter(s => x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2)
    .sort((a, b) => (a.x2 - a.x1 + 1) * (a.y2 - a.y1 + 1) - (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1))[0] ?? null;
}

export const centreSalle = s => ({ x: Math.floor((s.x1 + s.x2) / 2), y: Math.floor((s.y1 + s.y2) / 2) });

// n cases libres, au plus près du centre (anneaux successifs autour de lui), dans la zone si elle est donnée
// (une pièce : on ne pose personne derrière un mur), sinon dans les limites de la scène.
// occupees : Set de « x,y ». Rend moins de n cases s'il n'y a pas la place.
export function casesLibres(n, { centre, zone = null, limites, occupees = new Set() }) {
  const dedans = (x, y) => (zone
    ? x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2
    : x >= 0 && y >= 0 && x < limites.largeur && y < limites.hauteur);
  const prises = new Set(occupees);
  const choisies = [];
  const rayonMax = Math.max(limites.largeur, limites.hauteur);
  for (let r = 0; r <= rayonMax && choisies.length < n; r++) {
    // Les cases de l'anneau r, les plus proches (distance réelle) d'abord.
    const anneau = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) anneau.push([centre.x + dx, centre.y + dy, dx * dx + dy * dy]);
      }
    }
    anneau.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of anneau) {
      if (choisies.length >= n) break;
      const cle = `${x},${y}`;
      if (!dedans(x, y) || prises.has(cle)) continue;
      prises.add(cle);
      choisies.push({ x, y });
    }
  }
  return choisies;
}

// Cases occupées par des jetons (largeur et hauteur en cases). jetons : [{ x, y, width, height }] en pixels.
export function casesOccupees(jetons, { size, sceneX, sceneY }) {
  const occupees = new Set();
  for (const t of jetons) {
    const x0 = Math.round((t.x - sceneX) / size), y0 = Math.round((t.y - sceneY) / size);
    for (let dx = 0; dx < Math.max(1, Math.round(t.width ?? 1)); dx++) {
      for (let dy = 0; dy < Math.max(1, Math.round(t.height ?? 1)); dy++) occupees.add(`${x0 + dx},${y0 + dy}`);
    }
  }
  return occupees;
}

// Figurants : types proposés à l'IA et jeton du module de contenu qui les représente. Par défaut ceux de lakour-40k ;
// un autre module (lakour-warcraft sur dnd5e) fournit les siens au chargement (definirFigurants).
export const TYPES_FIGURANTS = {
  citoyen: { libelle: "Citoyen", jeton: "citoyen-de-ruche" },
  ouvrier: { libelle: "Ouvrier", jeton: "citoyen-de-ruche" },
  fidele: { libelle: "Fidèle", jeton: "citoyen-de-ruche" },
  garde: { libelle: "Garde", jeton: "garde-pdf" },
  arbitrator: { libelle: "Arbitrator", jeton: "arbitrator" },
  precheur: { libelle: "Prêcheur", jeton: "precheur" },
  noble: { libelle: "Noble", jeton: "noble-intrigant" },
  scribe: { libelle: "Scribe", jeton: "scribe-administratum" },
  adepte: { libelle: "Adepte du Mechanicus", jeton: "adepte-mechanicus" },
  serviteur: { libelle: "Serviteur", jeton: "serviteur-de-combat" },
  soeur: { libelle: "Sœur hospitalière", jeton: "soeur-hospitaliere" },
  ganger: { libelle: "Ganger", jeton: "ganger" },
  contrebandier: { libelle: "Contrebandier", jeton: "contrebandier" },
  cultiste: { libelle: "Cultiste", jeton: "cultiste" },
  mutant: { libelle: "Mutant", jeton: "mutant-renegat" }
};

let moduleFigurants = "lakour-40k";
export const moduleDesFigurants = () => moduleFigurants;

// Remplace les types de figurants (même objet : les schémas des outils lisent ses clés à chaque appel).
export function definirFigurants(types, module) {
  if (!types || !Object.keys(types).length) return;
  for (const cle of Object.keys(TYPES_FIGURANTS)) delete TYPES_FIGURANTS[cle];
  Object.assign(TYPES_FIGURANTS, types);
  moduleFigurants = module;
}

// Jeton d'un type de figurant, plat ou en relief (type inconnu : le premier type de la liste).
export const jetonFigurant = (type, style) =>
  `modules/${moduleFigurants}/assets/jetons/${style === "3d" ? "3d/" : ""}${(TYPES_FIGURANTS[type] ?? Object.values(TYPES_FIGURANTS)[0]).jeton}.svg`;

// Résumé des figurants d'une scène pour l'IA : un groupe par ligne, avec effectif et comportement.
// figurants : [{ groupe, comportement, salle }]
export function resumerFigurants(figurants) {
  const groupes = new Map();
  for (const f of figurants) {
    const g = groupes.get(f.groupe) ?? { nombre: 0, comportement: f.comportement, salles: new Set() };
    g.nombre++;
    if (f.salle) g.salles.add(f.salle);
    groupes.set(f.groupe, g);
  }
  return [...groupes].map(([nom, g]) => `« ${nom} » ×${g.nombre}${g.salles.size ? ` (${[...g.salles].join(", ")})` : ""}`
    + `${g.comportement ? ` — si on les aborde : ${g.comportement}` : ""}`);
}

// Plan d'une scène : celui de creer_scene (MJ IA), sinon celui d'une carte d'un module de contenu (lakour-40k,
// lakour-warcraft…). (Lecture directe des flags : getFlag refuse la portée d'un module inactif.)
export const planDe = scene => scene?.flags?.["lakour-mj-ia"]?.plan
  ?? Object.values(scene?.flags ?? {}).find(f => f?.plan)?.plan ?? null;

// Cases à laisser libres d'après le plan de la carte (creer_scene) : obstacles (étals, caisses, piliers…)
// et cases de part et d'autre de chaque porte ou passage, pour ne jamais boucher un accès.
export function casesInterdites(plan) {
  const interdites = new Set();
  for (const e of plan?.elements ?? []) {
    for (let dx = 0; dx < Math.max(1, e.l ?? 1); dx++) {
      for (let dy = 0; dy < Math.max(1, e.h ?? 1); dy++) interdites.add(`${e.x + dx},${e.y + dy}`);
    }
  }
  const voisine = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
  for (const o of plan?.ouvertures ?? []) {
    if (o.type === "fenetre" || !voisine[o.cote]) continue;
    interdites.add(`${o.x},${o.y}`);
    interdites.add(`${o.x + voisine[o.cote][0]},${o.y + voisine[o.cote][1]}`);
  }
  return interdites;
}

// Hasard reproductible (mulberry32) : même graine, même disposition.
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Figurants dispersés dans la pièce, comme une vraie foule : jamais collés aux personnages joueurs (un anneau
// libre autour d'eux pour qu'ils puissent bouger), écartés les uns des autres si la place le permet, et tirés au
// hasard dans toute la pièce plutôt qu'en bloc. proteges : cases des personnages joueurs.
export function casesDispersees(n, { zone = null, limites, occupees = new Set(), proteges = [], graine = 1 }) {
  const x1 = zone?.x1 ?? 0, y1 = zone?.y1 ?? 0;
  const x2 = zone?.x2 ?? limites.largeur - 1, y2 = zone?.y2 ?? limites.hauteur - 1;
  const pres = (a, b, d) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= d;
  const candidates = [];
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      if (occupees.has(`${x},${y}`) || proteges.some(p => pres(p, { x, y }, 1))) continue;
      candidates.push({ x, y });
    }
  }
  // Mélange reproductible (Fisher-Yates).
  const alea = hasard(graine);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // D'abord des cases sans voisin déjà pris ; s'il en manque, on resserre.
  const choisies = [];
  for (const espace of [true, false]) {
    for (const c of candidates) {
      if (choisies.length >= n) break;
      if (choisies.includes(c)) continue;
      if (espace && choisies.some(d => pres(c, d, 1))) continue;
      choisies.push(c);
    }
  }
  return choisies;
}

// ---------- Repères : éléments du plan (puits, étals, autel…) et portes entre deux pièces, pour placer
// quelqu'un « près du puits » ou « au seuil de l'échoppe ».

// reperes : [{ nom, type: "element" | "porte", cases: [{x, y}], salles: [noms] }]
export function reperesDuPlan(plan, salles) {
  const reperes = [];
  for (const e of plan?.elements ?? []) {
    const cases = [];
    for (let dx = 0; dx < Math.max(1, e.l ?? 1); dx++) for (let dy = 0; dy < Math.max(1, e.h ?? 1); dy++) cases.push({ x: e.x + dx, y: e.y + dy });
    const salle = salleDeLaCase(salles, e.x, e.y)?.nom;
    reperes.push({ nom: e.nom, type: "element", cases, salles: salle ? [salle] : [] });
  }
  const voisine = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
  for (const o of plan?.ouvertures ?? []) {
    if (o.type === "fenetre" || !voisine[o.cote]) continue;
    const a = { x: o.x, y: o.y }, b = { x: o.x + voisine[o.cote][0], y: o.y + voisine[o.cote][1] };
    const noms = [salleDeLaCase(salles, a.x, a.y)?.nom, salleDeLaCase(salles, b.x, b.y)?.nom].filter(Boolean);
    reperes.push({ nom: `${o.type === "passage" ? "Passage" : "Porte"} ${noms.join(" / ")}`, type: "porte", cases: [a, b], salles: noms });
  }
  return reperes;
}

// Le repère qui correspond le mieux à un texte libre (« le puits central », « le seuil de l'échoppe de Mère Gruss »).
// salleJoueurs : pour une porte, on préfère celle qui donne sur la pièce des joueurs.
export function trouverRepere(reperes, texte, salleJoueurs = null) {
  const n = sansAccent(texte);
  if (!n) return null;
  const versPorte = /\b(porte|seuil|entree|sortie|devant|passage)\b/.test(n);
  const central = /\b(central|centre|milieu)\b/.test(n);
  let meilleur = null;
  for (const r of reperes) {
    let score = 0;
    if (r.type === "element") {
      const nom = sansAccent(r.nom);
      if (n.includes(nom)) score = nom.length + 1;
      else if (nom.includes(n)) score = n.length;
    } else {
      // Une porte se reconnaît au nom d'une des pièces qu'elle relie (« seuil de l'échoppe »).
      for (const s of r.salles) {
        const ns = sansAccent(s);
        const mots = ns.split(/\s+/).filter(m => m.length > 3);
        if (n.includes(ns)) score = Math.max(score, ns.length);
        // Quelques mots du nom ne suffisent qu'avec « porte », « seuil »… (« à côté de Mère Gruss » vise la personne).
        else if (versPorte && mots.some(m => n.includes(m))) score = Math.max(score, Math.max(...mots.filter(m => n.includes(m)).map(m => m.length)));
      }
      if (score && versPorte) score += 5;
      if (score && salleJoueurs && r.salles.includes(salleJoueurs)) score += 1;
    }
    if (!score) continue;
    const ecart = central ? distanceAuCentre(r) : 0;
    if (!meilleur || score > meilleur.score || (score === meilleur.score && ecart < meilleur.ecart)) meilleur = { r, score, ecart };
  }
  return meilleur?.r ?? null;
  function distanceAuCentre(r) {
    const xs = reperes.flatMap(p => p.cases.map(c => c.x)), ys = reperes.flatMap(p => p.cases.map(c => c.y));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return Math.min(...r.cases.map(c => Math.hypot(c.x - cx, c.y - cy)));
  }
}

// n cases libres au plus près d'un repère (ses cases à lui ne sont jamais prises), dans la zone si elle est donnée.
export function casesAutour(n, cibles, { zone = null, limites, occupees = new Set(), portee = 6 }) {
  const dans = (x, y) => (zone ? x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2
    : x >= 0 && y >= 0 && x < limites.largeur && y < limites.hauteur);
  const surCible = new Set(cibles.map(c => `${c.x},${c.y}`));
  const candidates = [];
  const xs = cibles.map(c => c.x), ys = cibles.map(c => c.y);
  for (let x = Math.min(...xs) - portee; x <= Math.max(...xs) + portee; x++) {
    for (let y = Math.min(...ys) - portee; y <= Math.max(...ys) + portee; y++) {
      const cle = `${x},${y}`;
      if (!dans(x, y) || occupees.has(cle) || surCible.has(cle)) continue;
      const d = Math.min(...cibles.map(c => Math.max(Math.abs(c.x - x), Math.abs(c.y - y))));
      const e = Math.min(...cibles.map(c => Math.hypot(c.x - x, c.y - y)));
      if (d <= portee) candidates.push({ x, y, d, e });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.e - b.e || a.y - b.y || a.x - b.x);
  return candidates.slice(0, n).map(({ x, y }) => ({ x, y }));
}

// ---------- La carte vue par l'IA : un plan en caractères, une case par caractère, avec les coordonnées.
// Pièces (lettres minuscules), éléments (lettres majuscules), portes (+), jetons (@ personnages joueurs, chiffres pour
// les PNJ, « f » pour les figurants, « ? » pour un jeton caché). Le modèle s'y repère bien mieux qu'avec des listes.
// jetons : [{ nom, x, y, pj, figurant, cache }] ; reperes : ceux de reperesDuPlan.
export function carteTexte({ largeur, hauteur, salles, reperes = [], jetons = [] }) {
  if (!(largeur > 0 && hauteur > 0) || largeur > 80 || hauteur > 80) return "";
  const grille = Array.from({ length: hauteur }, () => Array(largeur).fill(" "));
  const mettre = (x, y, c) => { if (x >= 0 && y >= 0 && x < largeur && y < hauteur) grille[y][x] = c; };
  const legende = [];
  // Les plus grandes pièces d'abord : un couloir dessiné dans une salle reste visible.
  const aire = s => (s.x2 - s.x1 + 1) * (s.y2 - s.y1 + 1);
  const lettres = "abcdeghijkmnopqrstuvwxyz"; // sans f (figurants) ni l (lisibilité)
  [...salles].sort((a, b) => aire(b) - aire(a)).forEach((s, i) => {
    const lettre = lettres[i % lettres.length];
    for (let x = s.x1; x <= s.x2; x++) for (let y = s.y1; y <= s.y2; y++) mettre(x, y, lettre);
    legende.push(`${lettre} = ${s.nom}`);
  });
  const sortes = new Map();
  for (const r of reperes) {
    if (r.type === "porte") { for (const c of r.cases) mettre(c.x, c.y, "+"); continue; }
    if (!sortes.has(r.nom)) sortes.set(r.nom, "ABCDEGHIJKLMNOQRSTUVWXYZ"[sortes.size % 24]);
    for (const c of r.cases) mettre(c.x, c.y, sortes.get(r.nom));
  }
  for (const [nom, lettre] of sortes) legende.push(`${lettre} = ${nom}`);
  if (reperes.some(r => r.type === "porte")) legende.push("+ = case devant une porte ou un passage");
  let numero = 0;
  for (const j of jetons) {
    const signe = j.pj ? "@" : j.figurant ? "f" : String(++numero % 10);
    mettre(j.x, j.y, j.cache && !j.pj ? "?" : signe);
    if (!j.figurant) legende.push(`${j.cache && !j.pj ? "?" : signe} = ${j.nom}${j.cache ? " (caché)" : ""} en ${j.x},${j.y}`);
  }
  if (jetons.some(j => j.figurant)) legende.push("f = figurant");
  const dizaines = "    " + Array.from({ length: largeur }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ")).join("");
  const unites = "    " + Array.from({ length: largeur }, (_, x) => String(x % 10)).join("");
  const lignes = grille.map((l, y) => `${String(y).padStart(3)} ${l.join("")}`);
  return [dizaines, unites, ...lignes, `(colonnes = x, lignes = y ; espace = hors des pièces)`, ...legende].join("\n");
}

// La carte d'une scène Foundry telle que l'IA la voit (plan en caractères), ou "" si la scène n'a ni pièces ni plan.
export function carteDeScene(scene) {
  if (!scene) return "";
  const { size } = scene.grid, { sceneX, sceneY, sceneWidth, sceneHeight } = scene.dimensions;
  const grille = { size, sceneX, sceneY };
  const salles = listeSalles(scene.drawings.contents.map(d => d.toObject()), grille);
  if (!salles.length) return "";
  const jetons = scene.tokens.contents.map(t => ({
    nom: t.name, x: Math.round((t.x - sceneX) / size), y: Math.round((t.y - sceneY) / size),
    pj: Boolean(t.actor?.hasPlayerOwner), figurant: Boolean(t.flags?.["lakour-mj-ia"]?.figurant), cache: Boolean(t.hidden)
  }));
  return carteTexte({
    largeur: Math.floor(sceneWidth / size), hauteur: Math.floor(sceneHeight / size),
    salles, reperes: reperesDuPlan(planDe(scene), salles), jetons
  });
}

// Repères pour l'état du jeu : les éléments d'abord (bâtiments, maisons, puits… : les plus utiles pour pres_de), puis les
// ouvertures ; un même nom répété plus de 3 fois (les 44 passages d'une place) est regroupé en une entrée « ×n ».
export function resumerReperes(reperes, max = 60) {
  const decrire = r => `${r.nom} (case ${r.cases[0].x},${r.cases[0].y}${r.type === "element" && r.salles[0] ? `, ${r.salles[0]}` : ""})`;
  const tries = [...reperes.filter(r => r.type === "element"), ...reperes.filter(r => r.type !== "element")];
  const compte = new Map();
  for (const r of tries) compte.set(r.nom, (compte.get(r.nom) ?? 0) + 1);
  const vus = new Set();
  const lignes = [];
  for (const r of tries) {
    if (compte.get(r.nom) > 3) {
      if (!vus.has(r.nom)) lignes.push(`${r.nom} ×${compte.get(r.nom)}`);
      vus.add(r.nom);
    } else lignes.push(decrire(r));
  }
  return lignes.slice(0, max);
}
