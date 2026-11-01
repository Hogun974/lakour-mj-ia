// Rendu d'un plan de carte en image SVG vue de dessus (fond de scène gratuit, sans service d'images) :
// sols texturés, murs biseautés, portes, fenêtres, objets dessinés selon leur nom, halos de lumière.
// Les murs viennent du même calcul que ceux de la scène (planVersScene) : image et murs Foundry coïncident.
// Pur (aucune dépendance à Foundry) : éprouvé hors du navigateur (essais/cartes-rendu.test.mjs).
// Carte à étages (cartes.js) : un fond par étage (option `etage`), ou tous d'un coup avec fondsDesNiveaux.
import { planVersScene, etagesDuPlan } from "./cartes.js";

// Générateur pseudo-aléatoire déterministe : la même carte donne toujours la même image.
function hasard(graine) {
  let s = 0;
  for (const c of String(graine)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const r = n => Math.round(n * 10) / 10;

// ---------- Motifs de sol (une case = t pixels ; chaque motif couvre une case)
function motifs(t) {
  const h = hasard("sols");
  const points = (n, couleur, taille, opacite) => Array.from({ length: n }, () =>
    `<circle cx="${r(h() * t)}" cy="${r(h() * t)}" r="${r(taille * (0.5 + h()))}" fill="${couleur}" opacity="${r(opacite * (0.5 + h()) * 100) / 100}"/>`).join("");
  const def = (id, contenu) => `<pattern id="sol-${id}" width="${t}" height="${t}" patternUnits="userSpaceOnUse">${contenu}</pattern>`;
  const q = t / 2;
  return [
    def("metal", `<rect width="${t}" height="${t}" fill="#3b4047"/>`
      + `<rect x="1" y="1" width="${q - 2}" height="${q - 2}" fill="#41474f"/><rect x="${q + 1}" y="${q + 1}" width="${q - 2}" height="${q - 2}" fill="#41474f"/>`
      + `<path d="M0 ${q}H${t}M${q} 0V${t}" stroke="#25292e" stroke-width="2"/><path d="M0 0H${t}M0 0V${t}" stroke="#4d545c" stroke-width="1.5"/>`
      + [[6, 6], [q - 6, 6], [6, q - 6], [q - 6, q - 6], [q + 6, q + 6], [t - 6, q + 6], [q + 6, t - 6], [t - 6, t - 6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#5a626b"/>`).join("")),
    def("ferraille", `<rect width="${t}" height="${t}" fill="#463a2f"/>` + points(14, "#6b4a2a", t / 14, 0.5) + points(10, "#2a221b", t / 18, 0.6)
      + `<path d="M0 ${t / 3}H${t}M0 ${(2 * t) / 3}H${t}" stroke="#2c241d" stroke-width="3"/><path d="M${t / 4} 0V${t / 3}M${(3 * t) / 4} ${t / 3}V${(2 * t) / 3}M${t / 2} ${(2 * t) / 3}V${t}" stroke="#2c241d" stroke-width="2"/>`),
    def("pierre", `<rect width="${t}" height="${t}" fill="#4b463f"/>`
      + `<rect x="2" y="2" width="${q * 1.2 - 4}" height="${q - 4}" fill="#524c45"/><rect x="${q * 1.2 + 2}" y="2" width="${t - q * 1.2 - 4}" height="${q - 4}" fill="#48433d"/>`
      + `<rect x="2" y="${q + 2}" width="${q * 0.7 - 4}" height="${q - 4}" fill="#4f4943"/><rect x="${q * 0.7 + 2}" y="${q + 2}" width="${t - q * 0.7 - 4}" height="${q - 4}" fill="#55504a"/>`
      + points(8, "#2f2b27", t / 30, 0.5)),
    def("terre", `<rect width="${t}" height="${t}" fill="#57472f"/>` + points(26, "#3e3222", t / 25, 0.6) + points(12, "#74603f", t / 30, 0.5)),
    def("sanctuaire", `<rect width="${t}" height="${t}" fill="#3f3448"/><rect width="${q}" height="${q}" fill="#4d4058"/><rect x="${q}" y="${q}" width="${q}" height="${q}" fill="#4d4058"/>`
      + `<path d="M0 0H${t}V${t}H0Z" fill="none" stroke="#8a7240" stroke-width="1" opacity="0.6"/>`),
    def("herbe", `<rect width="${t}" height="${t}" fill="#3d5034"/>` + points(30, "#506a42", t / 28, 0.6) + points(15, "#2d3c26", t / 30, 0.6)),
    def("eau", `<rect width="${t}" height="${t}" fill="#1f3a50"/>`
      + `<path d="M0 ${t * 0.3}q${t / 4} -6 ${t / 2} 0t${t / 2} 0M0 ${t * 0.75}q${t / 4} -6 ${t / 2} 0t${t / 2} 0" fill="none" stroke="#3d6683" stroke-width="2" opacity="0.7"/>`),
    def("bois", `<rect width="${t}" height="${t}" fill="#5a412c"/>` + [0, 1, 2, 3].map(i => `<path d="M0 ${(i * t) / 4}H${t}" stroke="#3b2a1c" stroke-width="2"/>`).join("")
      + `<path d="M${t / 3} 0V${t / 4}M${(2 * t) / 3} ${t / 4}V${t / 2}M${t / 5} ${t / 2}V${(3 * t) / 4}M${(4 * t) / 5} ${(3 * t) / 4}V${t}" stroke="#3b2a1c" stroke-width="1.5"/>`),
    def("luxe", `<rect width="${t}" height="${t}" fill="#5a2a2e"/><path d="M${q} 6L${t - 6} ${q}L${q} ${t - 6}L6 ${q}Z" fill="none" stroke="#a07a3a" stroke-width="1.5" opacity="0.7"/>`
      + `<circle cx="${q}" cy="${q}" r="${t / 12}" fill="#7a3a3e"/>`),
    def("cendre", `<rect width="${t}" height="${t}" fill="#363437"/>` + points(30, "#59565a", t / 40, 0.6) + points(10, "#1f1e20", t / 25, 0.6))
  ].join("");
}

const estRond = e => /pilier|colonne|puits/.test(e.nom.toLowerCase());

// ---------- Objets dessinés d'après leur nom
function objet(e, t) {
  const x = e.x * t, y = e.y * t, l = e.l * t, h = e.h * t, cx = x + l / 2, cy = y + h / 2, m = t * 0.12;
  const n = e.nom.toLowerCase();
  if (/pilier|colonne/.test(n)) {
    const rayon = Math.min(l, h) / 2 - m / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r(rayon)}" fill="#5b5650" stroke="#2b2826" stroke-width="4"/><circle cx="${cx - rayon / 4}" cy="${cy - rayon / 4}" r="${r(rayon / 2)}" fill="#6b655e"/>`;
  }
  if (/puits/.test(n)) return `<circle cx="${cx}" cy="${cy}" r="${r(Math.min(l, h) / 2 - m)}" fill="#55504a" stroke="#2b2826" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r(Math.min(l, h) / 2 - m * 2.2)}" fill="#0b0d10"/>`;
  if (/autel/.test(n)) {
    return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" fill="#6a6258" stroke="#2b2826" stroke-width="4"/>`
      + [0.25, 0.75].map(f => `<circle cx="${x + l * f}" cy="${y + m * 1.8}" r="${r(t * 0.06)}" fill="#ffd27a"/>`).join("");
  }
  if (/machine|générateur|generateur|presse|cogitateur/.test(n)) {
    return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" rx="6" fill="#4a4f55" stroke="#1d1f22" stroke-width="4"/>`
      + `<rect x="${x + 2 * m}" y="${y + 2 * m}" width="${l - 4 * m}" height="${(h - 4 * m) / 2}" fill="#2f3337"/>`
      + `<circle cx="${x + l - 2.5 * m}" cy="${y + h - 2.5 * m}" r="${r(t * 0.07)}" fill="#ff5a3a"/>`;
  }
  if (/tuyau|conduit|canalisation/.test(n)) {
    const horizontal = l >= h, ep = (horizontal ? h : l) * 0.45;
    return horizontal
      ? `<rect x="${x}" y="${cy - ep / 2}" width="${l}" height="${ep}" rx="${ep / 2}" fill="#6a5a48" stroke="#2a221b" stroke-width="3"/><path d="M${x} ${cy - ep / 6}H${x + l}" stroke="#8a775f" stroke-width="2"/>`
      : `<rect x="${cx - ep / 2}" y="${y}" width="${ep}" height="${h}" rx="${ep / 2}" fill="#6a5a48" stroke="#2a221b" stroke-width="3"/><path d="M${cx - ep / 6} ${y}V${y + h}" stroke="#8a775f" stroke-width="2"/>`;
  }
  if (/sarcophage|tombe/.test(n)) {
    return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" rx="8" fill="#5f5a54" stroke="#2b2826" stroke-width="4"/>`
      + `<rect x="${x + 2 * m}" y="${y + 2 * m}" width="${l - 4 * m}" height="${h - 4 * m}" rx="6" fill="none" stroke="#3b3733" stroke-width="2"/>`;
  }
  if (/étal|etal|table|bureau|buffet|comptoir/.test(n)) {
    return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" fill="#6a4a30" stroke="#2e2015" stroke-width="3"/>`
      + `<path d="M${x + m} ${cy}H${x + l - m}" stroke="#8a3a2a" stroke-width="${r(Math.max(4, (h - 2 * m) / 3))}" opacity="0.8"/>`;
  }
  if (/niche|ossement|ossuaire/.test(n)) {
    return `<rect x="${x}" y="${y + m}" width="${l}" height="${h - 2 * m}" fill="#2a2724"/>`
      + Array.from({ length: Math.max(2, Math.round(e.l * 2)) }, (_, i) => `<circle cx="${x + (i + 0.5) * (l / Math.max(2, Math.round(e.l * 2)))}" cy="${cy}" r="${r(t * 0.1)}" fill="#cfc6b0"/>`).join("");
  }
  // Par défaut : caisses empilées.
  return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" fill="#7a5a36" stroke="#3a2a17" stroke-width="4"/>`
    + `<path d="M${x + m} ${y + m}L${x + l - m} ${y + h - m}M${x + l - m} ${y + m}L${x + m} ${y + h - m}" stroke="#3a2a17" stroke-width="3"/>`;
}

// Escalier (carte à étages) : des marches en travers du sens de la montée (le côté le plus long du rectangle).
function marches(s, t) {
  const x = s.x * t, y = s.y * t, l = (s.l ?? 1) * t, h = (s.h ?? 1) * t, m = t * 0.08;
  const enLargeur = l >= h, n = Math.max(3, Math.round((enLargeur ? l : h) / (t * 0.25)));
  const traits = Array.from({ length: n - 1 }, (_, i) => {
    const f = (i + 1) / n;
    return enLargeur ? `M${r(x + l * f)} ${y + m}V${y + h - m}` : `M${x + m} ${r(y + h * f)}H${x + l - m}`;
  }).join("");
  return `<rect x="${x + m}" y="${y + m}" width="${l - 2 * m}" height="${h - 2 * m}" fill="#6b625a" stroke="#2b2826" stroke-width="4"/>`
    + `<path d="${traits}" stroke="#2b2826" stroke-width="3"/>`;
}

// style : "2d" (plat, vue de dessus) ou "3d" (relief : murs en hauteur, ombres portées, objets en volume).
// etage (carte à étages) : nom ou rang de l'étage à dessiner ; le premier par défaut.
export const STYLES = ["2d", "3d"];
export function planVersSVG(plan, { taille = 100, style = "2d", etage = null } = {}) {
  const { erreurs, scene } = planVersScene(plan, { taille });
  if (erreurs.length) return { erreurs };
  if (!STYLES.includes(style)) return { erreurs: [`style « ${style} » inconnu (2d ou 3d)`] };
  // Carte à étages : on dessine l'étage choisi, avec ses seuls murs et les escaliers qui y passent.
  let walls = scene.walls, escaliers = [];
  if (plan.etages?.length) {
    const liste = etagesDuPlan(plan);
    const choisi = etage === null ? liste[0] : liste.find(e => e.nom === etage) ?? (Number.isInteger(etage) ? liste[etage] : undefined);
    if (!choisi) return { erreurs: [`étage « ${etage} » inconnu (${liste.map(e => e.nom).join(", ")})`] };
    walls = scene.walls.filter(w => w.levels.includes(choisi.niveau));
    escaliers = (plan.escaliers ?? []).filter(s => s.etages.includes(choisi.nom));
    plan = choisi.plan;
  }
  const relief = style === "3d";
  const t = taille, L = plan.largeur * t, H = plan.hauteur * t;
  const sols = new Set(["metal", "ferraille", "pierre", "terre", "sanctuaire", "herbe", "eau", "bois", "luxe", "cendre"]);

  const pieces = plan.pieces.map(p => `<rect x="${p.x * t}" y="${p.y * t}" width="${p.l * t}" height="${p.h * t}" fill="url(#sol-${sols.has(p.sol) ? p.sol : "pierre"})"/>`
    // Ombre portée intérieure le long des murs.
    + `<rect x="${p.x * t + 4}" y="${p.y * t + 4}" width="${p.l * t - 8}" height="${p.h * t - 8}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${r(t * 0.12)}"/>`).join("");

  const ep = r(t * 0.22);
  const murs = walls.map(w => {
    const [x1, y1, x2, y2] = w.c;
    const horizontal = y1 === y2;
    if (w.door === 1) {
      // Porte : battant de métal ; verrouillée : avec un verrou.
      const [rx, ry, rl, rh] = horizontal ? [x1, y1 - ep / 2, x2 - x1, ep] : [x1 - ep / 2, y1, ep, y2 - y1];
      const verrou = w.ds === 2 ? `<circle cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="${r(ep / 2.2)}" fill="#c9a24a" stroke="#3a2a10" stroke-width="2"/>` : "";
      const milieu = horizontal ? `M${x1 + 4} ${y1}H${x2 - 4}` : `M${x1} ${y1 + 4}V${y2 - 4}`;
      return `<rect x="${rx}" y="${ry}" width="${rl}" height="${rh}" fill="#9a7444" stroke="#20180f" stroke-width="4"/>`
        + `<path d="${milieu}" stroke="#4a3418" stroke-width="3"/>${verrou}`;
    }
    if (w.sight === 0) return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#9fd0e8" stroke-width="${r(ep / 2.5)}" stroke-opacity="0.85"/>`; // fenêtre
    // Mur plein (les portes secrètes ont l'air d'un mur : c'est le but).
    return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#16171a" stroke-width="${ep}" stroke-linecap="square"/>`
      + `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#55595f" stroke-width="${r(ep / 4)}" stroke-linecap="square" stroke-opacity="0.8"/>`;
  }).join("");

  const halos = (plan.lumieres ?? []).map((l, i) => {
    const id = `halo${i}`;
    return `<radialGradient id="${id}"><stop offset="0" stop-color="${esc(l.couleur || "#ffcc88")}" stop-opacity="0.35"/><stop offset="1" stop-color="${esc(l.couleur || "#ffcc88")}" stop-opacity="0"/></radialGradient>`
      + `<circle cx="${(l.x + 0.5) * t}" cy="${(l.y + 0.5) * t}" r="${l.rayon * t}" fill="url(#${id})"/>`;
  }).join("");

  // ---------- Relief (style « 3d ») : lumière venant du haut-gauche, ombres portées vers le bas-droite.
  let occlusion = "", ombres = "", epaisseurs = "", dessus = "";
  if (relief) {
    const d = t * 0.22; // décalage de l'ombre portée
    occlusion = plan.pieces.map(p => `<rect x="${p.x * t}" y="${p.y * t}" width="${p.l * t}" height="${p.h * t}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="${r(t * 0.35)}" filter="url(#flou)"/>`).join("");
    const pleins = walls.filter(w => w.sight !== 0);
    // Les objets ronds (piliers, puits) projettent une ombre ronde, les autres une ombre rectangulaire.
    const forme = (e, decalage, marge, couleur, extra = "") => {
      const x = e.x * t + decalage, y = e.y * t + decalage, l = e.l * t, h = e.h * t;
      if (estRond(e)) return `<circle cx="${r(x + l / 2)}" cy="${r(y + h / 2)}" r="${r(Math.min(l, h) / 2 - marge)}" fill="${couleur}"${extra}/>`;
      return `<rect x="${r(x + marge)}" y="${r(y + marge)}" width="${r(l - 2 * marge)}" height="${r(h - 2 * marge)}" rx="5" fill="${couleur}"${extra}/>`;
    };
    ombres = `<g filter="url(#flou)" opacity="0.55">`
      + pleins.map(w => `<path d="M${w.c[0] + d} ${w.c[1] + d}L${w.c[2] + d} ${w.c[3] + d}" stroke="#000" stroke-width="${ep * 1.4}" stroke-linecap="square"/>`).join("")
      + (plan.elements ?? []).map(e => forme(e, d, t * 0.1, "#000")).join("")
      + "</g>";
    // Épaisseur des objets : une face latérale sombre décalée sous le dessus.
    epaisseurs = (plan.elements ?? []).map(e => forme(e, t * 0.06, t * 0.12, "#0c0c0e", ' opacity="0.75"')).join("");
    // Arête éclairée sur le dessus des murs pleins.
    dessus = pleins.map(w => `<path d="M${w.c[0] - ep * 0.18} ${w.c[1] - ep * 0.18}L${w.c[2] - ep * 0.18} ${w.c[3] - ep * 0.18}" stroke="#7a8089" stroke-width="${r(ep * 0.35)}" stroke-linecap="square" stroke-opacity="0.9"/>`).join("");
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">`
    + `<defs>${motifs(t)}<pattern id="roche" width="${t * 2}" height="${t * 2}" patternUnits="userSpaceOnUse"><rect width="${t * 2}" height="${t * 2}" fill="#0e0f12"/>`
    + `<circle cx="${t * 0.6}" cy="${t * 0.5}" r="${t * 0.3}" fill="#141519"/><circle cx="${t * 1.5}" cy="${t * 1.3}" r="${t * 0.4}" fill="#121317"/></pattern>`
    + (relief ? `<filter id="flou" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${r(t * 0.07)}"/></filter>` : "")
    + `</defs><rect width="${L}" height="${H}" fill="url(#roche)"/>${pieces}${occlusion}${ombres}${epaisseurs}`
    + `${escaliers.map(s => marches(s, t)).join("")}${(plan.elements ?? []).map(e => objet(e, t)).join("")}${halos}${murs}${dessus}</svg>`;
  return { erreurs: [], svg };
}

// Les fonds de tous les niveaux d'une carte : { erreurs, fonds: [{ niveau, nom, suffixe, svg }] }, dans l'ordre des
// niveaux de planVersScene. niveau : identifiant du Level dont c'est le fond (background.src) ; suffixe : à ajouter au
// nom du fichier, "" pour un plan sans étages (un seul fond, nommé comme avant), « -<étage> » sinon (unique).
export function fondsDesNiveaux(plan, { taille = 100, style = "2d" } = {}) {
  const fonds = [], suffixes = new Set();
  for (const [i, e] of etagesDuPlan(plan).entries()) {
    const { erreurs, svg } = planVersSVG(plan, { taille, style, etage: e.nom === null ? null : i });
    if (erreurs.length) return { erreurs, fonds: [] };
    const base = e.nom === null ? "" : String(e.nom).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(i);
    let suffixe = base && `-${base}`;
    if (suffixes.has(suffixe)) suffixe += `-${i}`;
    suffixes.add(suffixe);
    fonds.push({ niveau: e.niveau, nom: e.nom, suffixe, svg });
  }
  return { erreurs: [], fonds };
}
