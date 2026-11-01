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
//
// Scène vivante (facultatif) :
//   sons : [{ x, y, rayon, son, volume? }]  sons d'ambiance natifs (AmbientSound) au centre de la case, rayon en cases ;
//          son : une clé de SONS_AMBIANCE (fichier modules/lakour-mj-ia/assets/sons/<son>.wav) ; volume 0 à 1 (0,5).
//          Arrêtés par les murs, avec fondu à l'approche.
//   sonsAuto : false pour ne PAS déduire de sons. Sans `sons`, des sons prudents (volume bas, 4 au plus) sont déduits
//          des éléments et des pièces : cheminée, âtre, fourneau, brasero → feu ; forge, enclume, machines → forge ;
//          place, marché, salle commune, taverne → foule (jamais la nuit) ; crypte, caverne, galerie de terre → grotte ;
//          sol eau → mer ; dehors (sol herbe) la nuit → nuit. Rien d'éteint, d'effondré ni de ruiné.
//   zones : [{ nom, x, y, l, h, type, ... }]  régions natives (Region) en cases, invisibles des joueurs ; nom unique :
//          type "texte"     : texte qui s'élève au-dessus du jeton qui entre (texte, couleur?, unique? = true) ;
//          type "teleport"  : téléporte le jeton vers la zone nommée `vers` de la même scène ;
//          type "pause"     : met la partie en pause quand un jeton de joueur entre (unique? = true) ;
//          type "obscurite" : règle l'obscurité dans la zone (obscurite 0 à 1, mode? fixer | eclaircir | assombrir).
//   notes : [{ x, y, entryId, pageId?, texte, icone? }]  épingles (Note) vers un journal, au centre de la case.
//
// Carte à étages (facultatif ; Scene Levels de Foundry v14) : la même grille (largeur, hauteur, lumiere) pour tous les
// étages, et à la racine ni pièces ni rien d'autre : tout va dans les étages.
//   etages : [{ nom, elevation, pieces, ouvertures?, lumieres?, elements?, sons?, sonsAuto?, zones?, notes? }]
//            un niveau v14 (Level) par étage, avec son propre fond ; nom unique ; elevation : altitude du SOL de l'étage
//            en mètres (unités de la grille), unique (ex. cave -3, rez 0, étage 3). Le niveau va de son élévation à celle
//            de l'étage au-dessus (le plus haut : sans plafond). Le PREMIER étage du plan est le niveau initial (là où
//            l'on arrive ; identifiant DEFAULT_LEVEL) ; les niveaux restent dans l'ordre du plan, `sort` les range du
//            plus bas au plus haut. Murs, portes, sols, lumières, sons, zones et notes d'un étage appartiennent à SON
//            niveau seul (levels: [id]) ; lumières, sons et notes sont posés à l'élévation de l'étage.
//            Les noms de zones sont uniques dans toute la scène : une téléportation peut viser une zone d'un autre
//            étage (le jeton change alors de niveau, la zone d'arrivée n'étant que d'un niveau).
//   escaliers : [{ nom, x, y, l?, h?, etages: [nom, nom…] }]  rectangle en cases (1×1 par défaut), le MÊME sur chaque
//            étage relié (une cage d'escalier, une échelle, une trappe) : chacune de ses cases doit être dans une pièce
//            de chaque étage relié. Devient une région « Change Level » (changeLevel, client/data/region-behaviors/
//            change-level.mjs) rattachée à tous ces niveaux : un jeton qui y entre se voit proposer de passer à l'autre
//            niveau (au choix s'il y en a plusieurs), À LA MÊME POSITION — d'où le même rectangle à chaque étage. Une
//            seule région sert dans les deux sens. Élévation de la région : du sol de l'étage le plus bas relié à une
//            case au-dessus du sol du plus haut (comme la démonstration officielle « The Restored Keep »). Invisible
//            des joueurs comme les zones.

// Valeurs des constantes Foundry v14 (common/constants.mjs), recopiées pour rester pur.
const PORTE = { NONE: 0, DOOR: 1, SECRET: 2 }, ETAT = { CLOSED: 0, LOCKED: 2 };
const SENS = { NONE: 0, NORMAL: 20 };
const VISIBILITE_REGION = { LAYER: 0 };            // CONST.REGION_VISIBILITY : sur le calque des régions, aux observateurs
const ANCRE_TEXTE = { BOTTOM: 1 };                 // CONST.TEXT_ANCHOR_POINTS
// Comportements de région (client/data/region-behaviors/*.mjs) : DisplayScrollingText.VISIBILITY_MODES et
// AdjustDarknessLevel.MODES ; l'événement « un jeton entre en s'animant » (CONST.REGION_EVENTS.TOKEN_ANIMATE_IN).
const TEXTE_VISIBLE = { ANYONE: 2 };
const MODES_OBSCURITE = { fixer: 0, eclaircir: 1, assombrir: 2 };
const ENTREE_JETON = "tokenAnimateIn";
export const DEFAULT_LEVEL = "defaultLevel0000";

export const SOLS = {
  metal: "#3a3d42", pierre: "#4a4540", terre: "#5a4a36", ferraille: "#463a30", sanctuaire: "#4b3f52",
  herbe: "#3f5235", eau: "#2c4256", bois: "#5b4330", luxe: "#5a3a3a", cendre: "#38363a"
};
const OBSCURITE = { jour: 0, penombre: 0.5, nuit: 0.85 };
const TYPES_OUVERTURE = ["porte", "secrete", "verrouillee", "fenetre", "passage"];

// Sons d'ambiance du moteur (assets/sons/index.json) et leur chemin dans Foundry.
export const SONS_AMBIANCE = ["feu", "forge", "foule", "grotte", "mer", "nuit", "orage", "pluie", "tension", "vent"];
export const cheminSon = son => `modules/lakour-mj-ia/assets/sons/${son}.wav`;
export const TYPES_ZONE = ["texte", "teleport", "pause", "obscurite"];
const COULEURS_ZONE = { texte: "#4f8cc9", teleport: "#9b59b6", pause: "#e0a030", obscurite: "#303050" };

// Identifiant Foundry stable (16 lettres et chiffres) tiré d'une graine : une téléportation désigne sa zone d'arrivée
// par identifiant, connu dès le plan, et la même carte redonne toujours les mêmes identifiants.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function idStable(graine) {
  let h = 2166136261;
  for (const c of String(graine)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  let id = "";
  for (let i = 0; i < 16; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; // xorshift32
    id += ALPHABET[h % 62];
  }
  return id;
}

// Sons déduits : la première règle dont le motif reconnaît le nom (minuscules, sans accents) l'emporte ; forge avant
// feu, pour qu'un « Haut-fourneau » sonne la forge. `piece` : la règle vaut aussi pour les pièces. Le nom d'un élément
// doit COMMENCER par le mot-clé (« Machine à vox » oui, « Autel de la Machine » ou « Comptoir de la taverne » non).
const REGLES_SONS = [
  { son: "forge", volume: 0.3, piece: true, motif: /\b(forge|enclume|haut-fourneau|creuset|fonderie|coulee|machines?|generateurs?|presses?|chaudiere|moteur|atelier)\b/ },
  { son: "feu", volume: 0.35, motif: /\b(cheminee|atre|fourneau|brasero|feu de camp|foyer|chaudron|marmite)\b/ },
  { son: "foule", volume: 0.2, piece: true, jour: true, motif: /\b(place|marche|salle commune|taverne|auberge|cantine|mess|banquet|bouge)\b/ },
  { son: "grotte", volume: 0.25, piece: true, seulementPiece: true, motif: /\b(crypte|caveau|caverne|grotte|tunnel|egouts?|souterrain|ossuaire)\b/ }
];
const SANS_SON = /\b(eteinte?s?|effondree?s?|ruines?|brisee?s?|renversee?s?|morte?s?)\b/;
const MAX_SONS_DEDUITS = 4, MAX_PAR_SON = 2;
const normaliser = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Candidats déduits du plan, en cases : éléments d'abord (sources précises), puis pièces (ambiances de fond).
// piece(x, y) : indice de la pièce qui possède la case (-1 hors des pièces).
function sonsDeduits(plan, piece) {
  const nuit = plan.lumiere === "nuit";
  const candidats = [];
  const regle = (nom, estPiece) => {
    const n = normaliser(nom);
    if (SANS_SON.test(n)) return null;
    return REGLES_SONS.find(r => (estPiece ? r.piece : !r.seulementPiece) && !(r.jour && nuit)
      && (estPiece ? r.motif.test(n) : n.match(r.motif)?.index === 0)) ?? null;
  };
  for (const e of plan.elements ?? []) {
    const r = regle(e.nom, false);
    if (r) candidats.push({ son: r.son, volume: r.volume, cx: e.x + e.l / 2, cy: e.y + e.h / 2, rayon: Math.min(6, Math.max(3, Math.ceil(Math.max(e.l, e.h) / 2) + 2)), nom: e.nom });
  }
  for (const p of plan.pieces ?? []) {
    const n = normaliser(p.nom);
    let r = regle(p.nom, true);
    // Une galerie de terre est une galerie de mine ; une galerie de pierre peut être celle d'un salon.
    if (!r && p.sol === "terre" && /\bgaleries?\b/.test(n) && !SANS_SON.test(n)) r = { son: "grotte", volume: 0.25 };
    if (!r && p.sol === "eau") r = { son: "mer", volume: 0.3 };
    if (!r && nuit && p.sol === "herbe") r = { son: "nuit", volume: 0.25 };
    if (r) candidats.push({ son: r.son, volume: r.volume, cx: p.x + p.l / 2, cy: p.y + p.h / 2, rayon: Math.min(15, Math.max(3, Math.ceil(Math.hypot(p.l, p.h) / 2))), nom: p.nom });
  }
  // Un même son n'est pas répété dans une pièce ni là où il s'entend déjà ; deux fois au plus, quatre sons en tout.
  const retenus = [];
  for (const c of candidats) {
    if (retenus.length >= MAX_SONS_DEDUITS) break;
    c.piece = piece(Math.floor(c.cx), Math.floor(c.cy));
    const memes = retenus.filter(s => s.son === c.son);
    if (memes.length >= MAX_PAR_SON || memes.some(s => s.piece === c.piece || Math.hypot(s.cx - c.cx, s.cy - c.cy) < Math.max(s.rayon, c.rayon))) continue;
    retenus.push(c);
  }
  return retenus;
}

// Une zone (en cases, type déjà vérifié, dans le plan) -> région native v14 et son comportement : { region } | { erreur }.
// Sert à planVersScene et, en cours de partie, à l'outil zone_scene. idZone(nom) : identifiant de la région de ce nom
// (la téléportation vise sa zone d'arrivée par UUID relatif) ; nomsZones : les noms de zones existants ; niveau : le
// niveau v14 de la région (aucun = tous les niveaux). Coordonnées en pixels à partir de l'origine du plan.
export function zoneVersRegion(z, { taille = 100, idZone = nom => idStable(`zone:${nom}`), nomsZones = new Set(), niveau = null } = {}) {
  const ou = `zone « ${z.nom} »`;
  let comportement;
  if (z.type === "texte") {
    if (!z.texte) return { erreur: `${ou} : texte manquant` };
    comportement = { type: "displayScrollingText", system: { events: [ENTREE_JETON], text: z.texte, color: z.couleur || "#ffffff", visibility: TEXTE_VISIBLE.ANYONE, once: z.unique !== false } };
  } else if (z.type === "teleport") {
    if (!nomsZones.has(z.vers) || z.vers === z.nom) return { erreur: `${ou} : zone d'arrivée « ${z.vers} » introuvable (une autre zone de la scène)` };
    comportement = { type: "teleportToken", system: { destinations: [`..${idZone(z.vers)}`], placement: "random", snap: true, choice: false, revealed: false,
      dialog: { revealed: null, unrevealed: null }, transition: { type: null, duration: 1500 } } };
  } else if (z.type === "pause") {
    comportement = { type: "pauseGame", system: { once: z.unique !== false } };
  } else {
    const mode = MODES_OBSCURITE[z.mode ?? "fixer"];
    if (mode === undefined) return { erreur: `${ou} : mode « ${z.mode} » inconnu (${Object.keys(MODES_OBSCURITE).join(", ")})` };
    if (!(z.obscurite >= 0 && z.obscurite <= 1)) return { erreur: `${ou} : obscurite ${z.obscurite} hors de 0 à 1` };
    comportement = { type: "adjustDarknessLevel", system: { mode, modifier: z.obscurite } };
  }
  return { region: {
    _id: idZone(z.nom), name: z.nom, color: COULEURS_ZONE[z.type],
    shapes: [{ type: "rectangle", x: z.x * taille, y: z.y * taille, width: z.l * taille, height: z.h * taille, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false }],
    elevation: { bottom: null, top: null, topInclusive: false }, levels: niveau ? [niveau] : [],
    restriction: { enabled: false, type: "move", priority: 0 }, attachment: { token: null },
    // Jamais `hidden` : une région cachée désactive ses comportements. Les joueurs ne l'observent pas (propriété
    // « aucune ») : visible seulement du MJ, sur le calque des régions.
    visibility: VISIBILITE_REGION.LAYER, highlightMode: "shapes", displayMeasurements: false, hidden: false, locked: false,
    ownership: { default: 0 },
    behaviors: [{ _id: idStable(`comportement:${z.nom}`), name: z.nom, disabled: false, flags: {}, ...comportement }]
  } };
}

// Documents d'un étage (ou d'un plan sans étages) : murs, dessins, lumières, sons, notes et zones retenues (encore en
// cases : leurs régions se font ensuite, quand tous les noms de zones de la scène sont connus). niveau : identifiant du
// niveau v14 de l'étage (aucun = tous les niveaux) ; elevation : celle de ses lumières, sons et notes ; prefixe : devant
// chaque erreur (« étage « Cave » : »). a(x, y) rendu : la pièce qui possède la case (-1 hors des pièces).
function documentsEtage(plan, { L, H, taille, distance, erreurs, prefixe = "", niveau = null, elevation = 0 }) {
  const niveaux = () => (niveau ? [niveau] : []);
  const erreur = message => erreurs.push(prefixe + message);

  // 1. Qui possède chaque case : -1 = vide (hors plan), sinon l'indice de la pièce. La dernière pièce gagne.
  const proprio = Array.from({ length: H }, () => new Array(L).fill(-1));
  const horsPlan = new Set();
  plan.pieces.forEach((p, i) => {
    if (p.l < 1 || p.h < 1 || p.x < 0 || p.y < 0 || p.x + p.l > L || p.y + p.h > H) {
      erreur(`pièce « ${p.nom} » (${p.x},${p.y} ${p.l}×${p.h}) hors du plan ${L}×${H}`);
      horsPlan.add(i);
      return;
    }
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.l; x++) proprio[y][x] = i;
  });
  if (!plan.pieces.length) erreur("aucune pièce");
  const a = (x, y) => (x >= 0 && y >= 0 && x < L && y < H ? proprio[y][x] : -1);

  // 2. Arêtes : "h:x:y" = bord haut de la case (x,y) ; "v:x:y" = bord gauche de la case (x,y).
  const ouvertures = new Map();
  for (const o of plan.ouvertures ?? []) {
    if (!TYPES_OUVERTURE.includes(o.type)) { erreur(`ouverture en ${o.x},${o.y} : type « ${o.type} » inconnu`); continue; }
    const cle = { nord: `h:${o.x}:${o.y}`, sud: `h:${o.x}:${o.y + 1}`, ouest: `v:${o.x}:${o.y}`, est: `v:${o.x + 1}:${o.y}` }[o.cote];
    if (!cle) { erreur(`ouverture en ${o.x},${o.y} : côté « ${o.cote} » inconnu`); continue; }
    const [, xs, ys] = cle.split(":"), ex = Number(xs), ey = Number(ys);
    const [c1, c2] = cle[0] === "h" ? [a(ex, ey - 1), a(ex, ey)] : [a(ex - 1, ey), a(ex, ey)];
    if (c1 === c2) { erreur(`ouverture en ${o.x},${o.y} côté ${o.cote} : il n'y a pas de mur à cet endroit`); continue; }
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
    const mur = { c, move: SENS.NORMAL, sight: SENS.NORMAL, light: SENS.NORMAL, sound: SENS.NORMAL, door: PORTE.NONE, ds: ETAT.CLOSED, dir: 0, levels: niveaux() };
    if (s.type === "porte") mur.door = PORTE.DOOR;
    if (s.type === "secrete") mur.door = PORTE.SECRET;
    if (s.type === "verrouillee") { mur.door = PORTE.DOOR; mur.ds = ETAT.LOCKED; }
    if (s.type === "fenetre") { mur.sight = SENS.NONE; mur.light = SENS.NONE; }
    return mur;
  });

  // 5. Sols, étiquettes (MJ seulement), obstacles, lumières.
  const rect = (x, y, l, h, couleur, extra = {}) => ({
    x: x * taille, y: y * taille, shape: { type: "r", width: l * taille, height: h * taille },
    fillType: 1, fillColor: couleur, fillAlpha: 1, strokeWidth: 0, strokeColor: "#000000", strokeAlpha: 0, levels: niveaux(), ...extra
  });
  const drawings = [];
  plan.pieces.forEach((p, i) => {
    if (horsPlan.has(i)) return;
    drawings.push(rect(p.x, p.y, p.l, p.h, SOLS[p.sol] ?? SOLS.pierre, { sort: i }));
    drawings.push({ ...rect(p.x, p.y, p.l, p.h, "#000000", { fillType: 0, fillAlpha: 0 }), text: p.nom, fontSize: Math.min(48, Math.max(16, Math.round(taille / 3))), textColor: "#ffffff", textAlpha: 0.8, hidden: true, sort: 1000 + i });
  });
  for (const [i, e] of (plan.elements ?? []).entries()) {
    if (e.x < 0 || e.y < 0 || e.x + e.l > L || e.y + e.h > H) { erreur(`élément « ${e.nom} » hors du plan`); continue; }
    drawings.push(rect(e.x + 0.1, e.y + 0.1, e.l - 0.2, e.h - 0.2, "#202022", { strokeWidth: 4, strokeColor: "#777777", strokeAlpha: 1, text: e.nom, fontSize: 18, textAlpha: 0.7, sort: 500 + i }));
  }
  const lights = (plan.lumieres ?? []).map(l => ({
    x: Math.round((l.x + 0.5) * taille), y: Math.round((l.y + 0.5) * taille), elevation, levels: niveaux(), walls: true,
    config: { dim: l.rayon * distance, bright: Math.round(l.rayon * distance) / 2, color: l.couleur || "#ffcc88", alpha: 0.4, coloration: 1, luminosity: 0.5 }
  }));

  // 6. Sons d'ambiance (AmbientSound) : donnés par le plan, sinon déduits. Rayon en unités de grille, comme les lumières.
  const dedans = (x, y, l = 1, h = 1) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x + l <= L && y + h <= H;
  const sons = [];
  for (const s of plan.sons ?? []) {
    if (!SONS_AMBIANCE.includes(s.son)) { erreur(`son « ${s.son} » inconnu (${SONS_AMBIANCE.join(", ")})`); continue; }
    if (!dedans(s.x, s.y)) { erreur(`son « ${s.son} » en ${s.x},${s.y} hors du plan`); continue; }
    if (!(s.rayon > 0)) { erreur(`son « ${s.son} » en ${s.x},${s.y} : rayon ${s.rayon} invalide`); continue; }
    const volume = s.volume ?? 0.5;
    if (!(volume >= 0 && volume <= 1)) { erreur(`son « ${s.son} » en ${s.x},${s.y} : volume ${volume} hors de 0 à 1`); continue; }
    sons.push({ son: s.son, volume, cx: s.x + 0.5, cy: s.y + 0.5, rayon: s.rayon, nom: s.nom });
  }
  if (!(plan.sons ?? []).length && plan.sonsAuto !== false) sons.push(...sonsDeduits(plan, a));
  const sounds = sons.map(s => ({
    name: s.nom ? `${s.son} — ${s.nom}` : s.son,
    x: Math.round(s.cx * taille), y: Math.round(s.cy * taille), elevation, levels: niveaux(),
    radius: s.rayon * distance, path: cheminSon(s.son), repeat: true, volume: s.volume,
    walls: true, easing: true, hidden: false, locked: false
  }));

  // 7. Zones retenues (type connu, dans le plan) ; leurs régions viennent après (regionsDesZones).
  const zones = (plan.zones ?? []).filter(z => {
    const ou = `zone « ${z.nom} »`;
    if (!z.nom) { erreur("zone sans nom"); return false; }
    if (!TYPES_ZONE.includes(z.type)) { erreur(`${ou} : type « ${z.type} » inconnu (${TYPES_ZONE.join(", ")})`); return false; }
    if (!(z.l >= 1 && z.h >= 1 && dedans(z.x, z.y, z.l, z.h))) { erreur(`${ou} (${z.x},${z.y} ${z.l}×${z.h}) hors du plan ${L}×${H}`); return false; }
    return true;
  }).map(z => ({ z, niveau, prefixe }));

  // 8. Notes de carte (Note) : épingles vers une page de journal fournie par le monde.
  const estId = v => typeof v === "string" && /^[a-zA-Z0-9]{16}$/.test(v);
  const notes = [];
  for (const n of plan.notes ?? []) {
    const ou = `note « ${n.texte ?? ""} » en ${n.x},${n.y}`;
    if (!dedans(n.x, n.y)) { erreur(`${ou} hors du plan`); continue; }
    if (!estId(n.entryId) || (n.pageId != null && !estId(n.pageId))) { erreur(`${ou} : identifiant de journal ou de page invalide (16 lettres ou chiffres)`); continue; }
    notes.push({
      entryId: n.entryId, pageId: n.pageId ?? null,
      x: Math.round((n.x + 0.5) * taille), y: Math.round((n.y + 0.5) * taille), elevation, levels: niveaux(), sort: 0, locked: false,
      texture: { src: n.icone || "icons/svg/book.svg", anchorX: 0.5, anchorY: 0.5, fit: "contain", scaleX: 1, scaleY: 1, tint: "#ffffff" },
      iconSize: 40, text: n.texte ?? "", fontFamily: "", fontSize: 24, textAnchor: ANCRE_TEXTE.BOTTOM, textColor: "#ffffff", global: false
    });
  }
  return { a, walls, drawings, lights, sounds, notes, zones };
}

// Zones (Region) et leurs comportements (RegionBehavior), une fois connus tous les noms de zones de la scène (tous
// étages confondus). Identifiants stables : la téléportation vise sa zone d'arrivée par UUID relatif au comportement
// (« ..<id> » = une région sœur, dans la même scène, à n'importe quel niveau).
function regionsDesZones(zones, { taille, erreurs }) {
  const idZone = nom => idStable(`zone:${nom}`);
  const nomsZones = new Set();
  for (const { z, prefixe } of zones) {
    if (nomsZones.has(z.nom)) erreurs.push(`${prefixe}zone « ${z.nom} » en double : le nom d'une zone doit être unique`);
    nomsZones.add(z.nom);
  }
  const regions = [];
  for (const { z, niveau, prefixe } of zones) {
    const r = zoneVersRegion(z, { taille, idZone, nomsZones, niveau });
    if (r.erreur) erreurs.push(prefixe + r.erreur);
    else regions.push(r.region);
  }
  return regions;
}

// Ce que toute scène a en commun : taille, grille, vision, obscurité.
function enteteScene(L, H, taille, distance, lumiere) {
  const obscurite = OBSCURITE[lumiere] ?? OBSCURITE.penombre;
  return {
    width: L * taille, height: H * taille, padding: 0,
    grid: { type: 1, size: taille, distance, units: "m" },
    tokenVision: true,
    environment: { darknessLevel: obscurite, globalLight: { enabled: obscurite === 0 } }
  };
}

export function planVersScene(plan, { taille = 100, distance = 2 } = {}) {
  const erreurs = [];
  const L = plan.largeur, H = plan.hauteur;
  if (!(Number.isInteger(L) && Number.isInteger(H) && L >= 4 && H >= 4 && L <= 80 && H <= 80)) {
    return { erreurs: [`taille ${L}×${H} : entre 4 et 80 cases de côté`] };
  }
  // `etages: []` et `escaliers: []` (outil creer_scene, schéma strict) : un plan ordinaire.
  if (plan.etages?.length || plan.escaliers?.length) return planAEtagesVersScene(plan, { taille, distance });

  const d = documentsEtage(plan, { L, H, taille, distance, erreurs });
  const regions = regionsDesZones(d.zones, { taille, erreurs });
  return {
    erreurs,
    scene: {
      ...enteteScene(L, H, taille, distance, plan.lumiere),
      levels: [{ _id: DEFAULT_LEVEL, name: "Niveau principal", elevation: { bottom: 0, top: null }, background: { color: "#18181b", src: null } }],
      initialLevel: DEFAULT_LEVEL,
      walls: d.walls, drawings: d.drawings, lights: d.lights, sounds: d.sounds, regions, notes: d.notes
    }
  };
}

// ---------- Cartes à étages (Scene Levels v14)
export const MAX_ETAGES = 8;
const COULEUR_ESCALIER = "#28c9cc";
const CONTENUS_ETAGE = ["pieces", "ouvertures", "lumieres", "elements", "sons", "zones", "notes"];

// Les étages d'un plan, chacun comme un plan simple sur la grille commune, avec l'identifiant de son niveau v14 :
// [{ nom, niveau, elevation, plan }]. Un plan sans étages donne un seul « étage » sans nom, au niveau par défaut.
// Sert au convertisseur, au rendu des fonds (un par niveau) et à creer_scene.
export function etagesDuPlan(plan) {
  if (!plan.etages?.length) return [{ nom: null, niveau: DEFAULT_LEVEL, elevation: 0, plan }];
  return plan.etages.map((e, i) => ({
    nom: e.nom, niveau: i === 0 ? DEFAULT_LEVEL : idStable(`niveau:${e.nom}`), elevation: e.elevation,
    plan: { ...e, largeur: plan.largeur, hauteur: plan.hauteur, lumiere: plan.lumiere, sonsAuto: e.sonsAuto ?? plan.sonsAuto }
  }));
}

function planAEtagesVersScene(plan, { taille, distance }) {
  const erreurs = [];
  const L = plan.largeur, H = plan.hauteur;
  if (!plan.etages?.length) return { erreurs: ["des escaliers sans étages : décris les étages (etages)"] };
  if (plan.etages.length > MAX_ETAGES) erreurs.push(`${plan.etages.length} étages : ${MAX_ETAGES} au plus`);
  const surRacine = CONTENUS_ETAGE.filter(c => plan[c]?.length);
  if (surRacine.length) erreurs.push(`plan à étages : ${surRacine.join(", ")} vont dans chaque étage, pas à la racine du plan`);
  const noms = new Set(), elevations = new Set();
  for (const e of plan.etages) {
    if (!e.nom) erreurs.push("étage sans nom");
    else if (noms.has(e.nom)) erreurs.push(`étage « ${e.nom} » en double : le nom d'un étage doit être unique`);
    noms.add(e.nom);
    if (!Number.isFinite(e.elevation)) erreurs.push(`étage « ${e.nom} » : élévation ${e.elevation} invalide (en mètres)`);
    else if (elevations.has(e.elevation)) erreurs.push(`étage « ${e.nom} » : élévation ${e.elevation} déjà prise par un autre étage`);
    elevations.add(e.elevation);
    if (!Array.isArray(e.pieces)) erreurs.push(`étage « ${e.nom} » : pièces manquantes`);
  }
  if (erreurs.length) return { erreurs };

  // Chaque étage : ses documents, rattachés à son seul niveau et posés à son élévation.
  const etages = etagesDuPlan(plan).map(e => ({ ...e, docs: documentsEtage(e.plan, {
    L, H, taille, distance, erreurs, prefixe: `étage « ${e.nom} » : `, niveau: e.niveau, elevation: e.elevation }) }));
  const regions = regionsDesZones(etages.flatMap(e => e.docs.zones), { taille, erreurs });

  // Niveaux : dans l'ordre du plan (le premier est le niveau initial) ; `sort` les range du plus bas au plus haut.
  // Chacun va du sol de son étage à celui de l'étage au-dessus (le plus haut : sans plafond).
  const parAltitude = [...etages].sort((p, q) => p.elevation - q.elevation);
  const levels = etages.map(e => {
    const rang = parAltitude.indexOf(e);
    return { _id: e.niveau, name: e.nom, elevation: { bottom: e.elevation, top: parAltitude[rang + 1]?.elevation ?? null },
      background: { color: "#18181b", src: null }, sort: rang };
  });

  // Escaliers : une région « Change Level » sur tous les niveaux qu'ils relient, au même endroit sur chacun.
  const nomsEscaliers = new Set();
  for (const s of plan.escaliers ?? []) {
    const ou = `escalier « ${s.nom} »`;
    if (!s.nom) { erreurs.push("escalier sans nom"); continue; }
    if (nomsEscaliers.has(s.nom)) { erreurs.push(`${ou} en double : le nom d'un escalier doit être unique`); continue; }
    nomsEscaliers.add(s.nom);
    const l = s.l ?? 1, h = s.h ?? 1;
    if (![s.x, s.y, l, h].every(Number.isInteger) || l < 1 || h < 1 || s.x < 0 || s.y < 0 || s.x + l > L || s.y + h > H) {
      erreurs.push(`${ou} (${s.x},${s.y} ${l}×${h}) hors du plan ${L}×${H}`); continue;
    }
    const relies = Array.isArray(s.etages) ? s.etages : [];
    if (new Set(relies).size < 2 || new Set(relies).size !== relies.length) {
      erreurs.push(`${ou} : il relie au moins deux étages différents (etages : ${relies.join(", ") || "aucun"})`); continue;
    }
    const inconnus = relies.filter(n => !noms.has(n));
    if (inconnus.length) { erreurs.push(`${ou} : étage « ${inconnus.join(", ")} » inconnu (${[...noms].join(", ")})`); continue; }
    const desservis = parAltitude.filter(e => relies.includes(e.nom));
    const dehors = [];
    for (const e of desservis) {
      for (let y = s.y; y < s.y + h; y++) for (let x = s.x; x < s.x + l; x++) if (e.docs.a(x, y) === -1) dehors.push(`${x},${y} (${e.nom})`);
    }
    if (dehors.length) { erreurs.push(`${ou} : cases hors des pièces de l'étage : ${dehors.join(", ")}`); continue; }
    regions.push({
      _id: idStable(`escalier:${s.nom}`), name: s.nom, color: COULEUR_ESCALIER,
      shapes: [{ type: "rectangle", x: s.x * taille, y: s.y * taille, width: l * taille, height: h * taille, anchorX: 0, anchorY: 0, rotation: 0, hole: false, gridBased: false }],
      elevation: { bottom: desservis[0].elevation, top: desservis.at(-1).elevation + distance, topInclusive: false },
      levels: desservis.map(e => e.niveau),
      restriction: { enabled: false, type: "move", priority: 0 }, attachment: { token: null },
      visibility: VISIBILITE_REGION.LAYER, highlightMode: "shapes", displayMeasurements: false, hidden: false, locked: false,
      ownership: { default: 0 },
      // movementActions vide : toutes les façons de se déplacer (marche, vol, escalade…) proposent le changement.
      behaviors: [{ _id: idStable(`comportement:escalier:${s.nom}`), name: s.nom, type: "changeLevel", system: { movementActions: [] }, disabled: false, flags: {} }]
    });
  }

  const tous = cle => etages.flatMap(e => e.docs[cle]);
  return {
    erreurs,
    scene: {
      ...enteteScene(L, H, taille, distance, plan.lumiere),
      levels, initialLevel: DEFAULT_LEVEL,
      walls: tous("walls"), drawings: tous("drawings"), lights: tous("lights"), sounds: tous("sounds"), regions, notes: tous("notes")
    }
  };
}
