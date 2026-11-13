// Fêtes de saison : la logique pure, sans Foundry (essais/fetes.test.mjs). Le calendrier des fêtes populaires (fenêtres en
// heure locale du navigateur, dates mobiles de Pâques et du Carnaval), le choix de la fête du monde (réglage « fete » :
// automatique, aucune, ou une fête forcée), les déclinaisons enregistrées par les modules des mondes (api.fetes.enregistrer,
// docs/fetes.md) et leur décor (palette et ornements, dessinés en CSS seulement : styles/mj-ia.css). Le branchement à Foundry
// (classes du body, carte au chat, crochet, contexte de l'IA) est dans fetes.js.
//
// Pas de commémoration grave : seulement ces fêtes populaires, qu'un monde décline s'il le veut (sans déclinaison, rien).

const JOUR_MS = 86400000;
// Numéro du jour (jours depuis le 1er janvier 1970) d'une date du calendrier, sans fuseau : sert aux fenêtres et aux écarts.
const numero = (annee, mois, jour) => Math.round(Date.UTC(annee, mois - 1, jour) / JOUR_MS);
const versCle = n => {
  const d = new Date(n * JOUR_MS);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// Une date lisible -> Date (une Date valide telle quelle ; « AAAA-MM-JJ… » : ce jour-là à midi, heure locale), sinon null.
export function lireDate(x) {
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof x === "string" ? x : "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

// Le jour LOCAL d'un instant (fuseau du navigateur, celui du MJ chez le MJ) : « 2026-12-24 ».
export function cleJour(date = new Date()) {
  return versCle(numero(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}
const numeroLocal = date => numero(date.getFullYear(), date.getMonth() + 1, date.getDate());

// Dimanche de Pâques du calendrier grégorien (algorithme anonyme, dit de Meeus, Jones et Butcher) : { annee, mois, jour }.
export function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { annee, mois, jour };
}
const numeroPaques = annee => { const p = paques(annee); return numero(p.annee, p.mois, p.jour); };
// Mardi gras : Pâques moins 47 jours.
export const mardiGras = annee => { const d = new Date((numeroPaques(annee) - 47) * JOUR_MS); return { annee, mois: d.getUTCMonth() + 1, jour: d.getUTCDate() }; };

// Fêtes à date lunaire : CALCULÉES pour toute année, d'après les phases de la lune (Jean Meeus, « Astronomical Algorithms »,
// chap. 49 ; longitudes du Soleil et de la Lune, chap. 25 et 47, abrégés ; zodiaque sidéral de Lahiri pour les mois tamouls
// et hindous). Jusqu'au 05/11/2026, une table s'arrêtait en 2036 : la Dipavali, la Cavadee et le Nouvel An chinois ne
// tombaient plus ensuite. Le calcul redonne les relevés du 04/11/2026 (DATES_LUNAIRES, docs/fetes.md, sources) de 2026 à 2036,
// et le Nouvel An chinois jusqu'en 2050 (essais/fetes-reunion.test.mjs) :
// - Nouvel An chinois : la nouvelle lune qui tombe entre le 21 janvier et le 20 février, à l'heure de Pékin (UTC+8) ;
// - Dipavali : la nouvelle lune (amavasya) du mois où le Soleil est dans la Balance sidérale (Tula), à l'heure de l'Inde ; la
//   fête est le soir où l'amavasya a commencé : le jour même si la nouvelle lune tombe après 15 h, sinon la veille (telle que
//   La Réunion la date ; le défilé de Saint-André suit le week-end proche : la fenêtre va de 3 jours avant à 3 jours après) ;
// - Cavadee : Thaipusam, le jour du mois tamoul de Thai (Soleil dans le Capricorne sidéral) où la Lune passe le plus d'heures
//   de jour (6 h 30 – 18 h 30, heure de l'Inde) dans la demeure de Pusam (93° 20' – 106° 40' sidéraux), près de la pleine
//   lune ; un temple réunionnais peut la décaler d'un jour (fenêtre de la veille au lendemain).
// DATES_LUNAIRES : les relevés (sources de docs/fetes.md), qui servent aux essais du calcul.
export const DATES_LUNAIRES = Object.freeze({
  dipavali: { 2026: "11-08", 2027: "10-29", 2028: "10-17", 2029: "11-05", 2030: "10-26", 2031: "11-14", 2032: "11-02", 2033: "10-22",
    2034: "11-10", 2035: "10-30", 2036: "10-19" },
  "nouvel-an-chinois": { 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11",
    2033: "01-31", 2034: "02-19", 2035: "02-08", 2036: "01-28" },
  cavadee: { 2026: "02-01", 2027: "01-22", 2028: "02-09", 2029: "01-30", 2030: "01-20", 2031: "02-06", 2032: "01-27", 2033: "01-16",
    2034: "02-02", 2035: "01-24", 2036: "02-10" }
});

const sinD = d => Math.sin((d * Math.PI) / 180);
const angle = x => ((x % 360) + 360) % 360;
const HEURE_MS = 3600000;
const JULIEN_1970 = 2440587.5;
// Instant (ms UTC) de la phase k (entier : nouvelle lune ; + 0,5 : pleine lune) ; Meeus chap. 49, ΔT ≈ 70 s.
const PLANETES = [[299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164], [349.42, 36.412478, 0.000126],
  [84.66, 18.206239, 0.00011], [141.74, 53.303771, 0.000062], [207.14, 2.453732, 0.00006], [154.84, 7.30686, 0.000056], [34.52, 27.261239, 0.000047],
  [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.00004], [161.72, 24.198154, 0.000037], [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023]];
function phaseLunaire(k) {
  const pleine = k % 1 !== 0;
  const T = k / 1236.85, T2 = T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T2 * T;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T2 * T - 0.000000058 * T2 * T2;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T2 * T + 0.000000011 * T2 * T2;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T2 * T;
  let jd = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T2 * T + 0.00000000073 * T2 * T2;
  jd += pleine
    ? -0.40614 * sinD(Mp) + 0.17302 * E * sinD(M) + 0.01614 * sinD(2 * Mp) + 0.01043 * sinD(2 * F) + 0.00734 * E * sinD(Mp - M)
      - 0.00515 * E * sinD(Mp + M) + 0.00209 * E * E * sinD(2 * M)
    : -0.4072 * sinD(Mp) + 0.17241 * E * sinD(M) + 0.01608 * sinD(2 * Mp) + 0.01039 * sinD(2 * F) + 0.00739 * E * sinD(Mp - M)
      - 0.00514 * E * sinD(Mp + M) + 0.00208 * E * E * sinD(2 * M);
  jd += -0.00111 * sinD(Mp - 2 * F) - 0.00057 * sinD(Mp + 2 * F) + 0.00056 * E * sinD(2 * Mp + M) - 0.00042 * sinD(3 * Mp)
    + 0.00042 * E * sinD(M + 2 * F) + 0.00038 * E * sinD(M - 2 * F) - 0.00024 * E * sinD(2 * Mp - M) - 0.00017 * sinD(O)
    - 0.00007 * sinD(Mp + 2 * M) + 0.00004 * sinD(2 * Mp - 2 * F) + 0.00004 * sinD(3 * M) + 0.00003 * sinD(Mp + M - 2 * F)
    + 0.00003 * sinD(2 * Mp + 2 * F) - 0.00003 * sinD(Mp + M + 2 * F) + 0.00003 * sinD(Mp - M + 2 * F) - 0.00002 * sinD(Mp - M - 2 * F)
    - 0.00002 * sinD(3 * Mp + M) + 0.00002 * sinD(4 * Mp);
  PLANETES.forEach(([a, b, c], i) => { jd += c * sinD(a + b * k + (i === 0 ? -0.009173 * T2 : 0)); });
  return (jd - 70 / 86400 - JULIEN_1970) * JOUR_MS;
}
// Longitudes sidérales (Lahiri, approchée) du Soleil et de la Lune à l'instant ms (degrés ; précision ≈ 0,05°).
function longitudesSiderales(ms) {
  const j = ms / JOUR_MS + JULIEN_1970 - 2451545, T = j / 36525;
  const ayanamsa = 23.853 + 0.013969 * (j / 365.25);
  const nutation = -0.00478 * sinD(125.04 - 1934.136 * T);
  const Ms = 357.52911 + 35999.05029 * T;
  const soleil = 280.46646 + 36000.76983 * T + (1.914602 - 0.004817 * T) * sinD(Ms) + 0.019993 * sinD(2 * Ms) + 0.000289 * sinD(3 * Ms) - 0.00569 + nutation;
  const D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T, Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T, E = 1 - 0.002516 * T;
  const lune = 218.3164477 + 481267.88123421 * T + 6.288774 * sinD(Mp) + 1.274027 * sinD(2 * D - Mp) + 0.658314 * sinD(2 * D)
    + 0.213618 * sinD(2 * Mp) - 0.185116 * E * sinD(M) - 0.114332 * sinD(2 * F) + 0.058793 * sinD(2 * D - 2 * Mp)
    + 0.057066 * E * sinD(2 * D - M - Mp) + 0.053322 * sinD(2 * D + Mp) + 0.045758 * E * sinD(2 * D - M) - 0.040923 * E * sinD(M - Mp)
    - 0.03472 * sinD(D) - 0.030383 * E * sinD(M + Mp) + 0.015327 * sinD(2 * D - 2 * F) - 0.012528 * sinD(Mp + 2 * F)
    + 0.01098 * sinD(Mp - 2 * F) + 0.010675 * sinD(4 * D - Mp) + 0.010034 * sinD(3 * Mp) + 0.008548 * sinD(4 * D - 2 * Mp)
    - 0.007888 * E * sinD(2 * D + M - Mp) - 0.006766 * E * sinD(2 * D + M) - 0.005163 * sinD(D - Mp) + 0.004987 * E * sinD(D + M)
    + 0.004036 * E * sinD(2 * D - M + Mp) + 0.003994 * sinD(2 * D + 2 * Mp) + 0.003861 * sinD(4 * D) + 0.003665 * sinD(2 * D - 3 * Mp) + nutation;
  return { soleil: angle(soleil - ayanamsa), lune: angle(lune - ayanamsa) };
}
// Les nouvelles (ou pleines) lunes qui tombent l'année a (UTC), en ms.
function phasesDeLAnnee(a, pleine) {
  const k0 = Math.floor((a - 2000) * 12.3685) - 2;
  const l = [];
  for (let k = k0; k < k0 + 16; k++) { const t = phaseLunaire(k + (pleine ? 0.5 : 0)); if (new Date(t).getUTCFullYear() === a) l.push(t); }
  return l;
}
// Le numéro du jour civil d'un instant à un fuseau (heures) ; l'heure qu'il y est.
const jourA = (ms, fuseau) => Math.floor((ms + fuseau * HEURE_MS) / JOUR_MS);
const heureA = (ms, fuseau) => (((ms + fuseau * HEURE_MS) % JOUR_MS) + JOUR_MS) % JOUR_MS / HEURE_MS;
const INDE = 5.5, PEKIN = 8, PUSAM = [93 + 1 / 3, 106 + 2 / 3];
const soleilEntre = (min, max) => t => { const s = longitudesSiderales(t).soleil; return s >= min && s < max; };
const CALCULS_LUNAIRES = {
  "nouvel-an-chinois": a => {
    const debut = numero(a, 1, 21), fin = numero(a, 2, 20);
    return phasesDeLAnnee(a, false).map(t => jourA(t, PEKIN)).find(n => n >= debut && n <= fin) ?? null;
  },
  dipavali: a => {
    const t = phasesDeLAnnee(a, false).find(soleilEntre(180, 210));
    if (t === undefined) return null;
    return heureA(t, INDE) >= 15 ? jourA(t, INDE) : jourA(t, INDE) - 1;
  },
  cavadee: a => {
    const t = phasesDeLAnnee(a, true).find(soleilEntre(270, 300));
    if (t === undefined) return null;
    const pleine = jourA(t, INDE);
    let mieux = { n: pleine, mesures: 0 };
    for (let n = pleine - 3; n <= pleine + 3; n++) {
      let mesures = 0;
      // De 6 h 30 à 18 h 30, heure de l'Inde (1 h à 13 h UTC), toutes les dix minutes.
      for (let m = 60; m <= 13 * 60; m += 10) {
        const l = longitudesSiderales(n * JOUR_MS + m * 60000).lune;
        if (l >= PUSAM[0] && l < PUSAM[1]) mesures++;
      }
      if (mesures > mieux.mesures) mieux = { n, mesures };
    }
    return mieux.n;
  }
};
const cacheLunaire = new Map();
// Le numéro du jour d'une fête lunaire l'année a, ou null (fête inconnue, année illisible).
const numeroLunaire = (id, a) => {
  if (!CALCULS_LUNAIRES[id] || !Number.isInteger(a)) return null;
  const cle = `${id}|${a}`;
  if (!cacheLunaire.has(cle)) cacheLunaire.set(cle, CALCULS_LUNAIRES[id](a));
  return cacheLunaire.get(cle);
};
// La date calculée d'une fête lunaire l'année a, « MM-JJ », ou null.
export const dateLunaire = (id, a) => { const n = numeroLunaire(id, a); return n === null ? null : versCle(n).slice(5); };
// Une fenêtre autour d'une date lunaire : [d - avant, d + apres], cœur le jour même.
const autourDe = (id, avant, apres) => a => { const d = numeroLunaire(id, a); return d === null ? null : [d - avant, d + apres, d, d]; };

// Le calendrier. Pour une année a, fenetre(a) rend [début, fin, début du cœur, fin du cœur] en numéros de jour (bornes incluses),
// ou null (une fête lunaire qu'on ne sait pas dater cette année-là).
// priorite départage deux fêtes le même jour, APRÈS le cœur : une fête dans son cœur passe devant une fête qui ne l'est pas.
// Nouvel An > Noël (le 31 décembre est dans les deux fenêtres, et au cœur du Nouvel An seulement).
// La Toussaint n'a pas d'entrée à elle : elle est dans la fenêtre et le cœur d'Halloween (31 octobre – 1er novembre). Un monde
// qui la veut (Fénoir : la Toussaint au cimetière, très suivie à La Réunion) décline « halloween » sous le nom de la Toussaint ;
// une seule déclinaison par fête et par monde, et pas deux fêtes concurrentes pour les mêmes jours (docs/fetes.md).
export const FETES = [
  { id: "nouvel-an", nom: "Nouvel An", periode: "31 décembre – 2 janvier", priorite: 70,
    fenetre: a => [numero(a, 12, 31), numero(a + 1, 1, 2), numero(a, 12, 31), numero(a + 1, 1, 1)] },
  // Le 20 décembre (La Réunion : fête de la liberté, abolition de l'esclavage en 1848 ; Fénoir) : une fête populaire à La Réunion
  // (kabars, maloya) ; à son cœur, elle passe devant Noël.
  { id: "liberte", nom: "Fête de la liberté (20 décembre)", periode: "19 – 21 décembre (cœur : 20)", priorite: 65,
    fenetre: a => [numero(a, 12, 19), numero(a, 12, 21), numero(a, 12, 20), numero(a, 12, 20)] },
  { id: "noel", nom: "Noël", periode: "1er – 31 décembre (cœur : 24 – 26)", priorite: 60,
    fenetre: a => [numero(a, 12, 1), numero(a, 12, 31), numero(a, 12, 24), numero(a, 12, 26)] },
  // La fête des letchis : pas de date officielle ; la pleine saison des letchis à La Réunion (mi-décembre), fenêtre fixe choisie.
  { id: "letchis", nom: "Fête des letchis", periode: "12 – 15 décembre (cœur : 13 – 14)", priorite: 55,
    fenetre: a => [numero(a, 12, 12), numero(a, 12, 15), numero(a, 12, 13), numero(a, 12, 14)] },
  { id: "dipavali", nom: "Dipavali", periode: "3 jours avant – 3 jours après la Dipavali (date lunaire calculée)", priorite: 45,
    fenetre: autourDe("dipavali", 3, 3) },
  { id: "cavadee", nom: "Cavadee (Thaipoosam)", periode: "veille – lendemain de Thaipoosam (date lunaire calculée)", priorite: 44,
    fenetre: autourDe("cavadee", 1, 1) },
  { id: "nouvel-an-chinois", nom: "Nouvel An chinois", periode: "veille – 3 jours après la fête du Printemps (date lunaire calculée)", priorite: 42,
    fenetre: autourDe("nouvel-an-chinois", 1, 3) },
  { id: "paques", nom: "Pâques", periode: "Vendredi saint – lundi de Pâques (mobile)", priorite: 50,
    fenetre: a => { const p = numeroPaques(a); return [p - 2, p + 1, p, p + 1]; } },
  { id: "carnaval", nom: "Carnaval", periode: "Jeudi gras – Mardi gras (mobile)", priorite: 40,
    fenetre: a => { const mg = numeroPaques(a) - 47; return [mg - 5, mg, mg, mg]; } },
  { id: "halloween", nom: "Halloween", periode: "25 octobre – 2 novembre (cœur : 31 octobre – 1er novembre, Toussaint comprise)", priorite: 30,
    fenetre: a => [numero(a, 10, 25), numero(a, 11, 2), numero(a, 10, 31), numero(a, 11, 1)] },
  { id: "saint-valentin", nom: "Saint-Valentin", periode: "12 – 15 février (cœur : 14)", priorite: 20,
    fenetre: a => [numero(a, 2, 12), numero(a, 2, 15), numero(a, 2, 14), numero(a, 2, 14)] },
  { id: "fete-nationale", nom: "Fête nationale (14 juillet)", periode: "13 – 14 juillet (cœur : 14)", priorite: 15,
    fenetre: a => [numero(a, 7, 13), numero(a, 7, 14), numero(a, 7, 14), numero(a, 7, 14)] },
  { id: "musique", nom: "Fête de la musique", periode: "20 – 22 juin, solstice d'été (cœur : 21)", priorite: 10,
    fenetre: a => [numero(a, 6, 20), numero(a, 6, 22), numero(a, 6, 21), numero(a, 6, 21)] }
];
export const IDS_FETES = FETES.map(f => f.id);

// ------------------------------------------------------------------ fêtes « sur demande » (ajout du 2026-11-13, lot « fetes » de Fénoir)
// Des fêtes que seul un monde qui les DÉCLINE voit : elles n'entrent ni dans le réglage « fete » (REGLAGES, inchangé), ni dans le
// calendrier d'un monde qui ne les a pas déclinées (fetesDuJour(date) sans `aussi` rend exactement ce qu'il rendait). Fénoir les
// décline pour faire vivre le calendrier du métissage réunionnais : Ramadan, Aïd el-Kebir, Nouvel An tamoul, marche sur le feu.
// - Ramadan et Aïd el-Kebir : calendrier hégirien TABULAIRE (arithmétique, époque civile du 16 juillet 622), qui tombe à un jour
//   près de l'observation du croissant ; la fenêtre couvre cet écart. Ramadan : du 1er ramadan au 1er chawwal (Aïd el-Fitr, le
//   cœur, la fin du jeûne) ; Aïd el-Kebir : le 10 dhou al-hijja, de la veille au surlendemain. Une année grégorienne peut voir
//   commencer deux ramadans (2030, 2063) : une fenêtre peut donc rendre plusieurs fenêtres.
// - Nouvel An tamoul (Puthandu) : le 14 avril, de la veille au lendemain.
// - Marche sur le feu : chaque temple a sa date ; les principales tombent au début de janvier (Saint-André le 1er) : fenêtre fixe
//   du 2 au 12 janvier, cœur le premier dimanche de janvier qui suit le Nouvel An (le Nouvel An passe devant le 1er).
const HEGIRE_EPOQUE = 1948439.5;   // jour julien du 1er mouharram 1 (calendrier civil tabulaire)
const JULIEN_EPOQUE_UNIX = 2440587.5;
// Le numéro du jour (depuis le 1er janvier 1970) d'une date hégirienne tabulaire (année h, mois 1..12, jour 1..30).
export const numeroHegirien = (h, mois, jour) =>
  Math.round(jour + Math.ceil(29.5 * (mois - 1)) + (h - 1) * 354 + Math.floor((3 + 11 * h) / 30) + HEGIRE_EPOQUE - 1 - JULIEN_EPOQUE_UNIX);
// Les dates (numéros de jour) d'un jour hégirien donné qui tombent l'année grégorienne a.
function hegiriensDeLAnnee(a, mois, jour) {
  const h0 = Math.floor((a - 622) * 33 / 32);
  const debut = numero(a, 1, 1), fin = numero(a, 12, 31);
  return [h0 - 1, h0, h0 + 1, h0 + 2].map(h => numeroHegirien(h, mois, jour)).filter(n => n >= debut && n <= fin);
}
// Le premier dimanche de janvier de l'année a, à partir du 2 (numéro de jour).
const premierDimancheDeJanvier = a => { for (let j = 2; j <= 8; j++) if (new Date(Date.UTC(a, 0, j)).getUTCDay() === 0) return numero(a, 1, j); return numero(a, 1, 2); };
export const FETES_SUR_DEMANDE = [
  { id: "ramadan", nom: "Ramadan", periode: "1er ramadan – Aïd el-Fitr (calendrier hégirien ; cœur : l'Aïd el-Fitr)", priorite: 25,
    fenetre: a => hegiriensDeLAnnee(a, 9, 1).map(d => { const fitr = d + (numeroHegirien(1, 10, 1) - numeroHegirien(1, 9, 1)); return [d, fitr + 1, fitr, fitr + 1]; }) },
  { id: "aid-el-kebir", nom: "Aïd el-Kebir", periode: "veille – surlendemain du 10 dhou al-hijja (calendrier hégirien)", priorite: 46,
    fenetre: a => hegiriensDeLAnnee(a, 12, 10).map(d => [d - 1, d + 2, d, d + 1]) },
  { id: "nouvel-an-tamoul", nom: "Nouvel An tamoul", periode: "13 – 15 avril (cœur : 14)", priorite: 43,
    fenetre: a => [numero(a, 4, 13), numero(a, 4, 15), numero(a, 4, 14), numero(a, 4, 14)] },
  { id: "marche-sur-le-feu", nom: "Marche sur le feu", periode: "2 – 12 janvier (cœur : le premier dimanche de janvier)", priorite: 41,
    fenetre: a => { const d = premierDimancheDeJanvier(a); return [numero(a, 1, 2), numero(a, 1, 12), d, d]; } }
];
export const IDS_SUR_DEMANDE = FETES_SUR_DEMANDE.map(f => f.id);
// Toutes les fêtes qu'un monde peut décliner.
export const IDS_DECLINABLES = [...IDS_FETES, ...IDS_SUR_DEMANDE];
const fete = id => FETES.find(f => f.id === id) ?? FETES_SUR_DEMANDE.find(f => f.id === id) ?? null;
export const nomDeFete = id => fete(id)?.nom ?? null;
// Les fêtes du calendrier pour un monde : le socle, plus les fêtes sur demande qu'il a demandées (aussi : leurs ids).
const fetesPour = (aussi = []) => [...FETES, ...FETES_SUR_DEMANDE.filter(f => (aussi ?? []).includes(f.id))];
// Une fenêtre ou une liste de fenêtres (ramadan) -> liste de fenêtres.
const fenetresDe = (f, a) => { const x = f.fenetre(a); return !x ? [] : Array.isArray(x[0]) ? x : [x]; };

// Les fenêtres des fêtes qui COMMENCENT l'année donnée : [{ id, nom, debut, fin, coeurDebut, coeurFin }] (dates « AAAA-MM-JJ »).
// options.aussi : les fêtes sur demande à compter (ids).
export function fenetresDeLAnnee(annee, { aussi = [] } = {}) {
  return fetesPour(aussi).flatMap(f => fenetresDe(f, annee).map(([debut, fin, cd, cf]) =>
    ({ id: f.id, nom: f.nom, debut: versCle(debut), fin: versCle(fin), coeurDebut: versCle(cd), coeurFin: versCle(cf) })));
}

// Les fêtes actives ce jour-là (jour local de la date), de la plus prioritaire à la moins : [{ id, nom, debut, fin, coeur }].
// options.aussi : les fêtes sur demande à compter (ids) ; sans elles, le calendrier du socle seul.
export function fetesDuJour(date = new Date(), { aussi = [] } = {}) {
  const n = numeroLocal(date), annee = date.getFullYear();
  const actives = [];
  for (const f of fetesPour(aussi)) {
    // Une fenêtre peut chevaucher la fin d'année (Nouvel An, un ramadan de décembre) : celles qui commencent l'année d'avant comptent aussi.
    const trouvee = [annee - 1, annee].flatMap(a => fenetresDe(f, a)).find(([debut, fin]) => n >= debut && n <= fin);
    if (trouvee) {
      const [debut, fin, cd, cf] = trouvee;
      actives.push({ id: f.id, nom: f.nom, debut: versCle(debut), fin: versCle(fin), coeur: n >= cd && n <= cf, priorite: f.priorite });
    }
  }
  return actives.sort((x, y) => Number(y.coeur) - Number(x.coeur) || y.priorite - x.priorite).map(({ priorite, ...f }) => f);
}

// ------------------------------------------------------------------ réglage « fete » du monde
// "auto" (selon la date), "aucune", ou l'id d'une fête du calendrier (forcée : jouer Halloween en juillet).
export const REGLAGE_AUTO = "auto";
export const REGLAGE_AUCUNE = "aucune";
export const REGLAGES = [REGLAGE_AUTO, REGLAGE_AUCUNE, ...IDS_FETES];

// La fête du monde, ou null. declinees : ids des fêtes que ce monde a déclinées (une fête sans déclinaison n'existe pas pour lui).
// Automatique : la plus prioritaire des fêtes du jour que le monde décline. Forcée : celle-là, si le monde la décline.
// Un réglage inconnu (fête retirée d'une version future) vaut « automatique ».
export function feteRetenue({ reglage = REGLAGE_AUTO, date = new Date(), declinees = [] } = {}) {
  const ok = new Set(declinees);
  if (reglage === REGLAGE_AUCUNE) return null;
  if (IDS_FETES.includes(reglage)) return ok.has(reglage) ? reglage : null;
  return fetesDuJour(date, { aussi: declinees }).find(f => ok.has(f.id))?.id ?? null;
}
// Une fête forcée que le monde ne décline pas (pour prévenir le MJ) : son id, sinon null.
export const forceeSansDeclinaison = (reglage, declinees = []) => (IDS_FETES.includes(reglage) && !declinees.includes(reglage) ? reglage : null);

// ------------------------------------------------------------------ décor
// Palettes : trois couleurs (--lakour-fete-c1, c2, c3 dans styles/mj-ia.css, classe lakour-fete-palette-<id>).
export const PALETTES = {
  sapin: ["#1f6b3a", "#b3202a", "#e2b33c"],
  givre: ["#dff3ff", "#8ec9f0", "#ffffff"],
  braise: ["#e8711a", "#2a1a10", "#f3c04a"],
  crepuscule: ["#6b3fa0", "#e8711a", "#2b2140"],
  rose: ["#d6336c", "#f7a1c4", "#fff0f5"],
  printemps: ["#f6d860", "#9ad19a", "#c9a0dc"],
  carnaval: ["#e63946", "#2a9d8f", "#f4a261"],
  soleil: ["#f9c74f", "#f3722c", "#277da1"],
  or: ["#c9a227", "#3b2a10", "#f5e6b3"],
  nuit: ["#1d2b53", "#c0c8e0", "#f5d76e"]
};
// Ornements : glyphe (après le nom de l'orateur sur les cartes de chat du MJ IA) ; chute : quelques-uns tombent doucement sur
// l'écran (couche légère, sans canvas) ; bande : une guirlande d'ampoules en haut du chat.
export const ORNEMENTS = {
  neige: { glyphe: "❄", chute: true },
  confettis: { glyphe: "✦", chute: true },
  coeurs: { glyphe: "♥", chute: true },
  notes: { glyphe: "♪", chute: true },
  feuilles: { glyphe: "🍂", chute: true },
  guirlandes: { glyphe: "✶", bande: true },
  etoiles: { glyphe: "✧" },
  citrouilles: { glyphe: "🎃" },
  lanternes: { glyphe: "🏮" },
  oeufs: { glyphe: "🥚" },
  bougies: { glyphe: "🕯" },
  masques: { glyphe: "🎭" }
};
export const MAX_ORNEMENTS = 3;
// Décor par défaut de chaque fête (une déclinaison sans decor le prend).
export const DECORS_PAR_DEFAUT = {
  "nouvel-an": { palette: "nuit", ornements: ["confettis", "etoiles"] },
  liberte: { palette: "soleil", ornements: ["notes"] },
  letchis: { palette: "rose", ornements: [] },
  dipavali: { palette: "or", ornements: ["bougies", "etoiles"] },
  cavadee: { palette: "soleil", ornements: ["etoiles"] },
  "nouvel-an-chinois": { palette: "braise", ornements: ["lanternes", "confettis"] },
  noel: { palette: "sapin", ornements: ["neige", "guirlandes"] },
  paques: { palette: "printemps", ornements: ["oeufs"] },
  carnaval: { palette: "carnaval", ornements: ["confettis", "masques"] },
  halloween: { palette: "braise", ornements: ["citrouilles", "feuilles"] },
  "saint-valentin": { palette: "rose", ornements: ["coeurs"] },
  "fete-nationale": { palette: "nuit", ornements: ["confettis", "etoiles"] },
  musique: { palette: "soleil", ornements: ["notes"] },
  // Fêtes sur demande.
  ramadan: { palette: "nuit", ornements: ["lanternes", "etoiles"] },
  "aid-el-kebir": { palette: "or", ornements: ["etoiles"] },
  "nouvel-an-tamoul": { palette: "printemps", ornements: ["bougies"] },
  "marche-sur-le-feu": { palette: "braise", ornements: ["bougies"] }
};

// Le décor d'une déclinaison : { palette, ornements }. decor absent : celui de la fête ; une chaîne : un ornement (ou « aucun ») ;
// false ou "aucun" : aucun ornement (la palette reste, pour le style du monde) ; un objet { palette, ornements } (ornements : une
// chaîne ou un tableau, au plus MAX_ORNEMENTS). Une palette ou un ornement inconnus sont refusés (erreur).
export function normaliserDecor(decor, idFete) {
  const defaut = DECORS_PAR_DEFAUT[idFete] ?? { palette: "or", ornements: [] };
  if (decor === undefined || decor === null) return { palette: defaut.palette, ornements: [...defaut.ornements] };
  if (decor === false || decor === "aucun") return { palette: defaut.palette, ornements: [] };
  const objet = typeof decor === "string" ? { ornements: [decor] } : decor;
  if (typeof objet !== "object" || Array.isArray(objet)) throw new Error(`fête : décor illisible (${JSON.stringify(decor)})`);
  const palette = objet.palette ?? defaut.palette;
  if (!Object.hasOwn(PALETTES, palette)) throw new Error(`fête : palette inconnue « ${palette} » (palettes : ${Object.keys(PALETTES).join(", ")})`);
  const brut = objet.ornements === undefined ? defaut.ornements : [objet.ornements].flat().filter(o => o !== "aucun");
  const ornements = [];
  for (const o of brut) {
    if (!Object.hasOwn(ORNEMENTS, o)) throw new Error(`fête : ornement inconnu « ${o} » (ornements : ${Object.keys(ORNEMENTS).join(", ")})`);
    if (!ornements.includes(o)) ornements.push(o);
  }
  if (ornements.length > MAX_ORNEMENTS) throw new Error(`fête : ${MAX_ORNEMENTS} ornements au plus (${ornements.join(", ")})`);
  return { palette, ornements };
}

// Ce qu'une déclinaison active fait dans ce navigateur. effets : réglage client « effetsDeFete » ; reduit : le système demande
// moins de mouvement (prefers-reduced-motion). Les classes du body : toujours lakour-fete et lakour-fete-<fete> (repères sans effet
// visuel) ; avec les effets, lakour-fete-effets, la palette, chaque ornement et le glyphe des cartes. chute : l'ornement qui tombe
// (le premier qui le peut), seulement avec les effets et sans mouvement réduit.
export function effetsDuDecor(decor, idFete, { effets = true, reduit = false } = {}) {
  const classes = ["lakour-fete", `lakour-fete-${idFete}`];
  if (!effets) return { classes, glyphe: null, chute: null, bande: false };
  const glyphe = decor.ornements[0] ?? null;
  classes.push("lakour-fete-effets", `lakour-fete-palette-${decor.palette}`, ...decor.ornements.map(o => `lakour-fete-orn-${o}`));
  if (glyphe) classes.push(`lakour-fete-glyphe-${glyphe}`);
  const chute = reduit ? null : decor.ornements.find(o => ORNEMENTS[o].chute) ?? null;
  return { classes, glyphe: glyphe ? ORNEMENTS[glyphe].glyphe : null, chute, bande: decor.ornements.some(o => ORNEMENTS[o].bande) };
}

// Les ornements qui tombent : n positions tirées d'une suite fixe (le même écran à chaque chargement), en % de la largeur, secondes
// et rem. Peu nombreux et lents : un décor, pas une animation.
export const NOMBRE_CHUTE = 12;
export function positionsDeChute(n = NOMBRE_CHUTE) {
  let x = 0x2545f491;
  const hasard = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  return Array.from({ length: n }, (_, i) => ({
    gauche: Math.round(((i + hasard()) / n) * 1000) / 10,
    delai: Math.round(hasard() * 180) / 10,
    duree: Math.round((14 + hasard() * 10) * 10) / 10,
    taille: Math.round((0.7 + hasard() * 0.6) * 100) / 100
  }));
}

// ------------------------------------------------------------------ déclinaisons des mondes (registre)
const texte = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
export const MAX_DESCRIPTION = 600;
export const MAX_CONSIGNE = 300;
export const MAX_CONTENU = 8;
const ID_VALIDE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Un uuid de Foundry : « JournalEntry.abc », « Compendium.lakour-40k.journaux.JournalEntry.abc », « RollTable.xyz »…
const UUID_VALIDE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

// Un lien du contenu : un uuid, ou { uuid, nom } (le libellé du lien ; sans nom, Foundry montre celui du document).
function normaliserLien(lien) {
  const uuid = typeof lien === "string" ? lien.trim() : texte(lien?.uuid, 200);
  if (!UUID_VALIDE.test(uuid)) throw new Error(`fête : uuid illisible dans contenu (${JSON.stringify(lien)})`);
  // Le libellé d'un lien @UUID[…]{…} ne peut contenir ni accolade ni crochet.
  const nom = typeof lien === "string" ? "" : texte(lien?.nom, 80).replace(/[{}[\]]/g, "");
  return nom ? { uuid, nom } : { uuid };
}

// Une déclinaison complète à partir de la définition d'un module de monde ; lève une erreur si elle est inutilisable (id absent
// ou mal formé, fête inconnue, décor ou lien illisible) ou si elle double une déclinaison déjà enregistrée (même id, ou même fête :
// une seule déclinaison par fête et par monde).
export function normaliserDeclinaison(def = {}, deja = []) {
  const id = texte(def.id, 64);
  if (!ID_VALIDE.test(id)) throw new Error(`fête : id manquant ou mal formé (« ${def.id ?? ""} » ; minuscules, chiffres et tirets)`);
  if (!IDS_DECLINABLES.includes(def.fete)) throw new Error(`fête « ${id} » : fête inconnue « ${def.fete ?? ""} » (fêtes : ${IDS_DECLINABLES.join(", ")})`);
  if (deja.some(d => d.id === id)) throw new Error(`fête « ${id} » : déjà enregistrée`);
  const meme = deja.find(d => d.fete === def.fete);
  if (meme) throw new Error(`fête « ${id} » : ${nomDeFete(def.fete)} est déjà déclinée dans ce monde (« ${meme.id} »)`);
  const contenu = def.contenu === undefined || def.contenu === null ? [] : [def.contenu].flat();
  if (contenu.length > MAX_CONTENU) throw new Error(`fête « ${id} » : ${MAX_CONTENU} liens au plus dans contenu`);
  return {
    id,
    fete: def.fete,
    nom: texte(def.nom, 80) || nomDeFete(def.fete),
    description: texte(def.description, MAX_DESCRIPTION),
    consigne: texte(def.consigne, MAX_CONSIGNE),
    decor: normaliserDecor(def.decor, def.fete),
    contenu: contenu.map(normaliserLien)
  };
}

// ------------------------------------------------------------------ carte quotidienne et contexte de l'IA
// La carte du jour : une par jour (local, chez le MJ actif) et par fête, dans chaque monde. Clé gardée au réglage « feteCarte ».
export const cleCarte = (jour, idFete) => `${jour}|${idFete}`;
export const doitAnnoncer = ({ derniere = "", jour, fete: idFete, mjActif }) => Boolean(mjActif && idFete && derniere !== cleCarte(jour, idFete));

const echapper = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// La carte au chat : sobre, publique, le nom et la description de la déclinaison et ses liens (@UUID, enrichis par Foundry).
// t(cle, francais) : traduit le nom de la fête du calendrier, vu des joueurs (fetes.js passe texteJoueurs,
// LAKOUR_MJIA.Fetes.Noms.<id>) ; français par défaut.
export function carteHTML(d, t = (cle, francais) => francais) {
  const liens = d.contenu.map(l => `@UUID[${l.uuid}]${l.nom ? `{${echapper(l.nom)}}` : ""}`);
  const generique = t(`LAKOUR_MJIA.Fetes.Noms.${d.fete}`, nomDeFete(d.fete));
  return `<div class="lakour-mjia-fete-carte lakour-fete-carte-${d.fete}">`
    + `<p class="lakour-mjia-fete-titre"><strong>${echapper(d.nom)}</strong>`
    + `${d.nom !== nomDeFete(d.fete) && d.nom !== generique ? ` <small>(${echapper(generique)})</small>` : ""}</p>`
    + `${d.description ? `<p>${echapper(d.description)}</p>` : ""}`
    + `${liens.length ? `<p class="lakour-mjia-fete-liens">${liens.join(" · ")}</p>` : ""}</div>`;
}

// La ligne de l'état du jeu donnée au narrateur IA : une seule, jamais insistante. Aux Veillées (lakour-loups), quand une veillée de
// fête est EN JEU dans la partie (choisie à la distribution : veillee = game.lakourLoups.fete(), état public), la ligne vient d'elle,
// même hors saison : ses règles, ce qu'elle a annoncé à tous, la consigne de sa déclinaison (declinaisonVeillee, celle du monde pour
// sa fête) et la garde de ses secrets — rien qui la contredise. Sans veillée en jeu : la fête du calendrier, simple ambiance.
export function ligneContexte(d, systeme, { veillee = null, declinaisonVeillee = null } = {}) {
  if (systeme === "lakour-loups" && veillee?.cle) return ligneVeillee(d, veillee, declinaisonVeillee);
  if (!d) return "";
  if (systeme === "lakour-survie") return ligneSurvie(d);
  const nom = d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom;
  return `Fête en cours dans ce monde : ${nom}.${d.consigne ? ` ${/[.!?…]$/.test(d.consigne) ? d.consigne : `${d.consigne}.`}` : ""} Tu peux y faire allusion quand `
    + "c'est naturel, sans insister ni en parler à chaque réponse"
    + (systeme === "lakour-loups" ? " ; la date seule ne change rien aux règles : seule une veillée de fête choisie à la distribution (inscrite au Registre) en ajoute, et tu n'en trahis jamais les secrets." : ".");
}

// Fénoir (lakour-survie) : la fête suit la date de JEU (sourceDeDate) et tombe pendant la survie. Elle vit d'abord dans le récit :
// ce qu'elle devient dans le monde d'après (un Noël en plein été austral, sans guirlandes électriques ; un 31 décembre sans feux
// d'artifice, ou avec, au risque du bruit). La date seule ne change rien : seule une fête que le groupe CHOISIT de fêter
// (survie_feter) ou à laquelle il va chez d'autres (survie_participer) a son gain et son coût, que le système applique et dit.
// Jamais de magie : la foi agit par le moral.
export function ligneSurvie(d) {
  const nom = d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom;
  return `Fête du calendrier du jeu : ${nom}.${d.consigne ? ` ${phrase(d.consigne)}` : ""} Dans le monde d'après, si c'est naturel, `
    + "raconte ce qu'elle devient pour les survivants (un souvenir, un repas pris sur les stocks, un chant créole à voix basse, une bougie, "
    + "une dispute), sans insister ni en parler à chaque réponse. La date seule ne change rien : si les joueurs décident de la fêter "
    + "(survie_feter) ou d'aller à celle d'une autre communauté (survie_participer), le système applique son gain et son coût ; aucune "
    + "fête n'a d'effet magique, la foi agit par le moral.";
}

// La ligne d'une veillée de fête en jeu aux Veillées. v : { cle, nom, aide, fete, neige, defile: { nom } | null } (public) ;
// dv : la déclinaison de sa fête (sa consigne) ; d : la fête du calendrier ce jour-là (une autre : simple ambiance).
const phrase = t => (t ? (/[.!?…]$/.test(t) ? t : `${t}.`) : "");
export function ligneVeillee(d, v, dv = null) {
  const autre = d && d.fete !== v.fete ? (d.nom !== nomDeFete(d.fete) ? `${d.nom} (${nomDeFete(d.fete)})` : d.nom) : "";
  return [
    `Veillée de fête en jeu dans cette partie (choisie à la distribution, quelle que soit la date) : ${texte(v.nom, 80) || nomDeFete(v.fete) || v.cle}.`,
    v.aide ? `Ses règles s'appliquent : ${phrase(texte(v.aide, 600))}` : "Ses règles s'appliquent.",
    v.neige ? "Ce matin, la neige a recouvert les traces (annoncé à tous)." : "",
    v.defile?.nom ? `Masque du défilé (annoncé à tous) : ${texte(v.defile.nom, 80)}, que personne au village ne porte.` : "",
    phrase(texte(dv?.consigne, MAX_CONSIGNE)),
    "Ses secrets (qui les tient, ce qu'ils apprennent) ne se disent jamais, ne se confirment ni ne se démentent, même quand un joueur s'en réclame.",
    autre ? `Le calendrier fête aussi ${autre} : simple ambiance, sans règle de plus.` : "",
    "Tu peux y faire allusion quand c'est naturel, sans insister."
  ].filter(Boolean).join(" ");
}
