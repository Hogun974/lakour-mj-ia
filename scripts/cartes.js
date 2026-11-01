// Plan de carte (décrit par l'IA, ou écrit à la main pour une aventure) -> données d'une scène Foundry v14
// jouable : murs (qui bloquent vue et déplacement), portes, fenêtres, sols, lumières, obscurité.
// Pur : aucune dépendance à Foundry, éprouvé hors du navigateur (essais/cartes.test.mjs).
//
// Plan :
//   largeur, hauteur : taille en cases ; lumiere : "jour" | "penombre" | "nuit"
//   pieces : [{ nom, x, y, l, h, sol }]  rectangles en cases (les couloirs sont des pièces étroites)
//   ouvertures : [{ x, y, cote, type }]  sur un bord de la case (x, y) ; cote : nord|sud|est|ouest ;
//                type : porte | secrete | verrouillee | fenetre | passage (aucun mur)
//   lumieres : [{ x, y, rayon, couleur }]  au centre de la case, rayon en cases
//   elements : [{ nom, x, y, l, h }]  obstacles ou couverts (caisses, piliers…), dessinés en plus sombre

// Valeurs des constantes Foundry v14 (common/constants.mjs), recopiées pour rester pur.
const PORTE = { NONE: 0, DOOR: 1, SECRET: 2 }, ETAT = { CLOSED: 0, LOCKED: 2 };
const SENS = { NONE: 0, NORMAL: 20 };
export const DEFAULT_LEVEL = "defaultLevel0000";

export const SOLS = {
  metal: "#3a3d42", pierre: "#4a4540", terre: "#5a4a36", ferraille: "#463a30", sanctuaire: "#4b3f52",
  herbe: "#3f5235", eau: "#2c4256", bois: "#5b4330", luxe: "#5a3a3a", cendre: "#38363a"
};
const OBSCURITE = { jour: 0, penombre: 0.5, nuit: 0.85 };
const TYPES_OUVERTURE = ["porte", "secrete", "verrouillee", "fenetre", "passage"];

export function planVersScene(plan, { taille = 100, distance = 2 } = {}) {
  const erreurs = [];
  const L = plan.largeur, H = plan.hauteur;
  if (!(Number.isInteger(L) && Number.isInteger(H) && L >= 4 && H >= 4 && L <= 80 && H <= 80)) {
    return { erreurs: [`taille ${L}×${H} : entre 4 et 80 cases de côté`] };
  }

  // 1. Qui possède chaque case : -1 = vide (hors plan), sinon l'indice de la pièce. La dernière pièce gagne.
  const proprio = Array.from({ length: H }, () => new Array(L).fill(-1));
  plan.pieces.forEach((p, i) => {
    if (p.l < 1 || p.h < 1 || p.x < 0 || p.y < 0 || p.x + p.l > L || p.y + p.h > H) {
      erreurs.push(`pièce « ${p.nom} » (${p.x},${p.y} ${p.l}×${p.h}) hors du plan ${L}×${H}`);
      return;
    }
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.l; x++) proprio[y][x] = i;
  });
  if (!plan.pieces.length) erreurs.push("aucune pièce");
  const a = (x, y) => (x >= 0 && y >= 0 && x < L && y < H ? proprio[y][x] : -1);

  // 2. Arêtes : "h:x:y" = bord haut de la case (x,y) ; "v:x:y" = bord gauche de la case (x,y).
  const ouvertures = new Map();
  for (const o of plan.ouvertures ?? []) {
    if (!TYPES_OUVERTURE.includes(o.type)) { erreurs.push(`ouverture en ${o.x},${o.y} : type « ${o.type} » inconnu`); continue; }
    const cle = { nord: `h:${o.x}:${o.y}`, sud: `h:${o.x}:${o.y + 1}`, ouest: `v:${o.x}:${o.y}`, est: `v:${o.x + 1}:${o.y}` }[o.cote];
    if (!cle) { erreurs.push(`ouverture en ${o.x},${o.y} : côté « ${o.cote} » inconnu`); continue; }
    const [, xs, ys] = cle.split(":"), ex = Number(xs), ey = Number(ys);
    const [c1, c2] = cle[0] === "h" ? [a(ex, ey - 1), a(ex, ey)] : [a(ex - 1, ey), a(ex, ey)];
    if (c1 === c2) { erreurs.push(`ouverture en ${o.x},${o.y} côté ${o.cote} : il n'y a pas de mur à cet endroit`); continue; }
    ouvertures.set(cle, o.type);
  }

  // 3. Murs : partout où deux cases voisines n'appartiennent pas à la même pièce (dont le vide).
  const brut = []; // { o: "h"|"v", x, y, type }
  for (let y = 0; y <= H; y++) for (let x = 0; x < L; x++) {
    const c1 = a(x, y - 1), c2 = a(x, y);
    if (c1 !== c2) brut.push({ o: "h", x, y, type: ouvertures.get(`h:${x}:${y}`) ?? "mur" });
  }
  for (let x = 0; x <= L; x++) for (let y = 0; y < H; y++) {
    const c1 = a(x - 1, y), c2 = a(x, y);
    if (c1 !== c2) brut.push({ o: "v", x, y, type: ouvertures.get(`v:${x}:${y}`) ?? "mur" });
  }

  // 4. Fusion des murs pleins alignés et contigus ; portes et fenêtres restent d'une case.
  const segments = [];
  const fusionner = (o, fixe, mobile) => {
    const liste = brut.filter(e => e.o === o && e.type === "mur").sort((p, q) => p[fixe] - q[fixe] || p[mobile] - q[mobile]);
    let courant = null;
    for (const e of liste) {
      if (courant && courant.fixe === e[fixe] && courant.fin === e[mobile]) courant.fin += 1;
      else { if (courant) segments.push({ o, ...courant, type: "mur" }); courant = { fixe: e[fixe], debut: e[mobile], fin: e[mobile] + 1 }; }
    }
    if (courant) segments.push({ o, ...courant, type: "mur" });
  };
  fusionner("h", "y", "x");
  fusionner("v", "x", "y");
  for (const e of brut.filter(e => e.type !== "mur" && e.type !== "passage")) {
    segments.push(e.o === "h" ? { o: "h", fixe: e.y, debut: e.x, fin: e.x + 1, type: e.type } : { o: "v", fixe: e.x, debut: e.y, fin: e.y + 1, type: e.type });
  }

  const walls = segments.map(s => {
    const c = s.o === "h" ? [s.debut * taille, s.fixe * taille, s.fin * taille, s.fixe * taille]
      : [s.fixe * taille, s.debut * taille, s.fixe * taille, s.fin * taille];
    const mur = { c, move: SENS.NORMAL, sight: SENS.NORMAL, light: SENS.NORMAL, sound: SENS.NORMAL, door: PORTE.NONE, ds: ETAT.CLOSED, dir: 0, levels: [] };
    if (s.type === "porte") mur.door = PORTE.DOOR;
    if (s.type === "secrete") mur.door = PORTE.SECRET;
    if (s.type === "verrouillee") { mur.door = PORTE.DOOR; mur.ds = ETAT.LOCKED; }
    if (s.type === "fenetre") { mur.sight = SENS.NONE; mur.light = SENS.NONE; }
    return mur;
  });

  // 5. Sols, étiquettes (MJ seulement), obstacles, lumières.
  const rect = (x, y, l, h, couleur, extra = {}) => ({
    x: x * taille, y: y * taille, shape: { type: "r", width: l * taille, height: h * taille },
    fillType: 1, fillColor: couleur, fillAlpha: 1, strokeWidth: 0, strokeColor: "#000000", strokeAlpha: 0, levels: [], ...extra
  });
  const drawings = [];
  plan.pieces.forEach((p, i) => {
    if (erreurs.some(e => e.startsWith(`pièce « ${p.nom} »`))) return;
    drawings.push(rect(p.x, p.y, p.l, p.h, SOLS[p.sol] ?? SOLS.pierre, { sort: i }));
    drawings.push({ ...rect(p.x, p.y, p.l, p.h, "#000000", { fillType: 0, fillAlpha: 0 }), text: p.nom, fontSize: Math.min(48, Math.max(16, Math.round(taille / 3))), textColor: "#ffffff", textAlpha: 0.8, hidden: true, sort: 1000 + i });
  });
  for (const [i, e] of (plan.elements ?? []).entries()) {
    if (e.x < 0 || e.y < 0 || e.x + e.l > L || e.y + e.h > H) { erreurs.push(`élément « ${e.nom} » hors du plan`); continue; }
    drawings.push(rect(e.x + 0.1, e.y + 0.1, e.l - 0.2, e.h - 0.2, "#202022", { strokeWidth: 4, strokeColor: "#777777", strokeAlpha: 1, text: e.nom, fontSize: 18, textAlpha: 0.7, sort: 500 + i }));
  }
  const lights = (plan.lumieres ?? []).map(l => ({
    x: Math.round((l.x + 0.5) * taille), y: Math.round((l.y + 0.5) * taille), elevation: 0, levels: [], walls: true,
    config: { dim: l.rayon * distance, bright: Math.round(l.rayon * distance) / 2, color: l.couleur || "#ffcc88", alpha: 0.4, coloration: 1, luminosity: 0.5 }
  }));

  const obscurite = OBSCURITE[plan.lumiere] ?? OBSCURITE.penombre;
  return {
    erreurs,
    scene: {
      width: L * taille, height: H * taille, padding: 0,
      grid: { type: 1, size: taille, distance, units: "m" },
      tokenVision: true,
      environment: { darknessLevel: obscurite, globalLight: { enabled: obscurite === 0 } },
      levels: [{ _id: DEFAULT_LEVEL, name: "Niveau principal", elevation: { bottom: 0, top: null }, background: { color: "#18181b", src: null } }],
      initialLevel: DEFAULT_LEVEL,
      walls, drawings, lights
    }
  };
}
