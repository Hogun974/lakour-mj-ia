// Fabrique les boucles d'ambiance du module lakour-mj-ia, entièrement SYNTHÉTISÉES (aucun enregistrement, aucun
// téléchargement, donc aucun droit d'auteur) : bruit filtré, oscillateurs, enveloppes, réverbération et aléatoire à
// graine fixe. Sorties : assets/sons/<cle>.wav du module (WAV PCM mono 22 050 Hz 16 bits) et index.json.
//
// Bouclage sans clic : chaque son est PÉRIODIQUE par construction. Le bruit source est une suite de N échantillons
// lue en boucle, les courbes de commande sont périodiques, les évènements (gouttes, tonnerre, frappes) sont posés
// modulo N, les fréquences des oscillateurs font un nombre entier de cycles sur la boucle, et chaque traitement à
// mémoire (filtre, réverbération) est d'abord « amorcé » avec la fin du signal. Le dernier échantillon enchaîne donc
// sur le premier exactement comme deux échantillons voisins.
//
// Volume : sonie mesurée en pondération K (UIT-R BS.1770, sans portillonnage) amenée à SONIE_CIBLE, puis limiteur
// doux (circulaire lui aussi) qui garde la crête sous -3 dBFS.
//
// Usage : npm run fabriquer-sons
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DOSSIER_SONS = "modules/lakour-mj-ia/assets/sons"; // chemin vu de Foundry (index.json)
export const DOSSIER_SONS_DISQUE = "assets/sons";              // le même dossier, vu de la racine de ce dépôt
export const FREQUENCE = 22050;
export const DUREE = 24;           // secondes par boucle (10 ambiances ≈ 10,6 Mo)
export const CRETE_DBFS = -3;      // crête maximale
export const SONIE_CIBLE = -21;    // LUFS (pondération K, sans portillonnage)

const SR = FREQUENCE;
const ech = sec => Math.round(sec * SR);
const dB = v => 20 * Math.log10(v);
const PLAFOND = 10 ** ((CRETE_DBFS - 0.15) / 20); // petite marge pour l'arrondi 16 bits

// ---------------------------------------------------------------- Aléatoire à graine fixe

// mulberry32 : rapide, reproductible d'une machine à l'autre.
export function alea(graine) {
  let a = graine >>> 0, reserve = null;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => { // loi normale (Box-Muller polaire)
    if (reserve !== null) { const r = reserve; reserve = null; return r; }
    let x, y, s;
    do { x = 2 * u() - 1; y = 2 * u() - 1; s = x * x + y * y; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    reserve = y * m;
    return x * m;
  };
  return { u, n, entre: (min, max) => min + (max - min) * u(), entier: (min, max) => min + Math.floor((max - min + 1) * u()) };
}

// Graine dérivée de la clé (FNV-1a) : chaque ambiance a son propre tirage, toujours le même.
export const grainePour = cle => [...cle].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// ---------------------------------------------------------------- Briques de signal

const vide = n => new Float32Array(n);
const remplir = (n, f) => { const y = vide(n); for (let i = 0; i < n; i++) y[i] = f(i); return y; };

// Valeur efficace ramenée à 1 (pour doser les couches entre elles).
function unite(x) {
  let s = 0;
  for (const v of x) s += v * v;
  const k = s > 0 ? 1 / Math.sqrt(s / x.length) : 0;
  return x.map(v => v * k);
}
// Crête ramenée à 1 (pour les pistes d'évènements, dont la valeur efficace dépend du nombre d'évènements).
function crete1(x) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m > 0 ? x.map(v => v / m) : x;
}

// Traitement à mémoire appliqué comme si le signal tournait en boucle : on le fait précéder de ses `amorce` derniers
// échantillons, on traite, puis on jette ce préambule. Les arguments qui ne sont pas des Float32Array passent tels quels.
export function circulaire(amorce, traitement, ...args) {
  const n = args[0].length, a = Math.min(Math.round(amorce), n);
  const etendre = s => {
    if (!(s instanceof Float32Array)) return s;
    const e = vide(n + a);
    e.set(s.subarray(n - a));
    e.set(s, a);
    return e;
  };
  return traitement(...args.map(etendre)).slice(a);
}

// Filtre à variables d'état (TPT, Simper) : stable même quand la fréquence varie. fc et q : nombre ou tableau.
// mode « bas », « haut » ou « bande » (passe-bande de gain 1 à la résonance).
export function svf(x, mode, fc, q = 0.707) {
  const n = x.length, y = vide(n), varie = typeof fc !== "number" || typeof q !== "number";
  const m = { bas: 0, haut: 1, bande: 2 }[mode];
  let ic1 = 0, ic2 = 0, k = 0, a1 = 0, a2 = 0, a3 = 0;
  const coef = (f, qq) => {
    const g = Math.tan(Math.PI * Math.min(Math.max(f, 5), SR * 0.45) / SR);
    k = 1 / qq; a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
  };
  if (!varie) coef(fc, q);
  for (let i = 0; i < n; i++) {
    if (varie && (i & 7) === 0) coef(typeof fc === "number" ? fc : fc[i], typeof q === "number" ? q : q[i]);
    const v0 = x[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = m === 0 ? v2 : m === 1 ? v0 - k * v1 - v2 : k * v1;
  }
  return y;
}
export const filtrer = (x, mode, fc, q = 0.707, amorce = SR) => circulaire(amorce, (xe, f, qq) => svf(xe, mode, f, qq), x, fc, q);

// Passe-bas du premier ordre (lissage des courbes, bruit brun).
function passeBas1Brut(x, fc) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / SR), y = vide(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) { v += a * (x[i] - v); y[i] = v; }
  return y;
}
export const passeBas1 = (x, fc, amorce = SR) => circulaire(amorce, xe => passeBas1Brut(xe, fc), x);
const lisser = (x, tau) => passeBas1(x, 1 / (2 * Math.PI * tau), Math.min(SR * 2, Math.max(SR / 4, tau * SR * 12)));

const blanc = (n, r) => remplir(n, () => r.n());
const brun = (n, r) => unite(passeBas1(blanc(n, r), 40));
// Bruit rose : filtre de Paul Kellet.
function rose(n, r) {
  return unite(circulaire(SR, w => {
    const y = vide(w.length);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < w.length; i++) {
      const x = w[i];
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      y[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    }
    return y;
  }, blanc(n, r)));
}

// Courbe lente périodique : `points` valeurs au hasard réparties sur la boucle, interpolées (Catmull-Rom circulaire).
export function courbe(n, points, r, min = 0, max = 1) {
  const v = Array.from({ length: points }, () => r.entre(min, max)), y = vide(n);
  for (let i = 0; i < n; i++) {
    const t = i * points / n, j = Math.floor(t), f = t - j;
    const p0 = v[(j - 1 + points) % points], p1 = v[j % points], p2 = v[(j + 1) % points], p3 = v[(j + 2) % points];
    y[i] = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  }
  return y;
}
const borner = (x, min = 0, max = 1) => x.map(v => Math.min(max, Math.max(min, v)));

// Oscillateur périodique : la fréquence (nombre ou tableau) est rajustée d'un rien pour faire un nombre entier de
// cycles sur la boucle. forme « sinus » ou « scie » (dent de scie à bande limitée, polyBLEP).
export function oscillateur(n, f, forme = "sinus", phase0 = 0) {
  const tab = typeof f === "number" ? null : f;
  let cycles = 0;
  if (tab) { for (const v of tab) cycles += v; cycles /= SR; } else cycles = f * n / SR;
  const k = Math.max(1, Math.round(cycles)) / cycles, y = vide(n);
  let p = ((phase0 % 1) + 1) % 1;
  for (let i = 0; i < n; i++) {
    const dt = (tab ? tab[i] : f) * k / SR;
    if (forme === "sinus") y[i] = Math.sin(2 * Math.PI * p);
    else {
      let v = 2 * p - 1;
      if (p < dt) { const t = p / dt; v -= t + t - t * t - 1; } else if (p > 1 - dt) { const t = (p - 1) / dt; v -= t * t + t + t + 1; }
      y[i] = v;
    }
    p += dt;
    if (p >= 1) p -= 1;
  }
  return y;
}
// Oscillation lente d'un nombre entier de cycles par boucle, entre 0 et 1.
const lfo = (n, cycles, phase0 = 0) => remplir(n, i => 0.5 + 0.5 * Math.sin(2 * Math.PI * (cycles * i / n + phase0)));

// Pose un évènement dans la boucle (ajout modulo N).
function poser(dest, son, debut, gain = 1) {
  const n = dest.length, d = ((Math.round(debut) % n) + n) % n;
  for (let i = 0; i < son.length; i++) dest[(d + i) % n] += son[i] * gain;
}
// Instants d'un processus de Poisson (taux par seconde) sur la boucle, en échantillons.
function instants(n, taux, r) {
  const t = [];
  for (let x = -Math.log(1 - r.u()) / taux * SR; x < n; x += -Math.log(1 - r.u()) / taux * SR) t.push(x);
  return t;
}

// Réverbération de Schroeder-Moorer (Freeverb mono), appliquée en boucle.
export function reverberation(x, { piece = 0.8, amorti = 0.4, humide = 0.3, sec = 1, predelai = 0, amorce = 5 * SR } = {}) {
  return circulaire(amorce, xe => {
    const n = xe.length, mouille = vide(n), fb = piece * 0.28 + 0.7, am = amorti * 0.4, pd = ech(predelai);
    for (const d0 of [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]) {
      const d = Math.round(d0 * SR / 44100), tampon = vide(d);
      let j = 0, filtre = 0;
      for (let i = 0; i < n; i++) {
        const sortie = tampon[j];
        filtre = sortie * (1 - am) + filtre * am;
        tampon[j] = (i >= pd ? xe[i - pd] : 0) * 0.015 + filtre * fb;
        mouille[i] += sortie;
        j = (j + 1) % d;
      }
    }
    for (const d0 of [556, 441, 341, 225]) {
      const d = Math.round(d0 * SR / 44100), tampon = vide(d);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const b = tampon[j], e = mouille[i];
        mouille[i] = b - e;
        tampon[j] = e + b * 0.5;
        j = (j + 1) % d;
      }
    }
    return remplir(n, i => xe[i] * sec + mouille[i] * humide * 3);
  }, x);
}

// Frappe métallique par synthèse modale : partiels inharmoniques amortis, petit bruit d'impact, choc grave.
function frappe(r, { f, rapports, taus, bruit = 0.3, choc = 0, fChoc = 55 }) {
  const len = ech(Math.max(...taus) * 5 + 0.02), y = vide(len);
  const phases = rapports.map(() => r.u());
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 0; k < rapports.length; k++) {
      const fk = f * rapports[k];
      if (fk < SR * 0.45) v += Math.exp(-t / taus[k]) * Math.sin(2 * Math.PI * (fk * t + phases[k])) / (1 + k) ** 0.6;
    }
    if (t < 0.006) v += bruit * r.n() * Math.exp(-t / 0.0015);
    if (choc) v += choc * Math.sin(2 * Math.PI * fChoc * t) * Math.exp(-t / 0.07) * (1 - Math.exp(-t / 0.002));
    y[i] = v * (1 - Math.exp(-t / 0.0003));
  }
  return y;
}

// ---------------------------------------------------------------- Les ambiances (signal brut, non normalisé)

// Vent : grondement grave + deux sifflements résonants et un souffle large, tous menés par une courbe de rafales.
function vent(n, r) {
  const rafale = borner(courbe(n, 12, r, -0.1, 1.1));
  const g = rafale.map(v => 0.15 + 0.85 * v * v);
  const frisson = courbe(n, 200, r, -1, 1), frisson2 = courbe(n, 150, r, -1, 1);
  const grave = unite(filtrer(brun(n, r), "bande", g.map(v => 90 + 220 * v), 0.6));
  const hurle = unite(filtrer(blanc(n, r), "bande", g.map((v, i) => 260 + 620 * v + 70 * frisson[i]), 8));
  const hurle2 = unite(filtrer(blanc(n, r), "bande", g.map((v, i) => 520 + 900 * v + 120 * frisson2[i]), 12));
  const souffle = unite(filtrer(rose(n, r), "bande", g.map(v => 600 + 2000 * v), 0.8));
  return remplir(n, i => grave[i] * (0.35 + 0.65 * g[i]) * 0.6 + hurle[i] * g[i] ** 1.6 * 0.45
    + hurle2[i] * g[i] ** 2.2 * 0.18 + souffle[i] * g[i] ** 1.8 * 0.7);
}

// Pluie : nappe de bruit (bruissement) + milliers de micro-impacts + quelques grosses gouttes qui « plic ».
function pluie(n, r, { densite = 1, sombre = false } = {}) {
  const fond = unite(filtrer(filtrer(rose(n, r), "haut", 350, 0.7), "bas", sombre ? 4200 : 7500, 0.7));
  const grain = unite(filtrer(blanc(n, r), "bande", sombre ? 2200 : 3800, 0.9));
  const houle = courbe(n, 10, r, 0.85, 1.05);
  const micro = vide(n);
  for (const t of instants(n, 450 * densite, r)) {
    const f = r.entre(2200, 7500), tau = r.entre(0.0008, 0.003), a = 0.15 + r.u() ** 3, len = ech(tau * 5);
    poser(micro, remplir(len, i => Math.exp(-i / (tau * SR)) * Math.sin(2 * Math.PI * f * i / SR)), t, a);
  }
  const gouttes = vide(n);
  for (const t of instants(n, 9 * densite, r)) {
    const f0 = r.entre(900, 2600), tau = r.entre(0.006, 0.018), len = ech(tau * 5), a = r.entre(0.3, 1);
    let p = 0;
    poser(gouttes, remplir(len, i => {
      p += f0 * (1 + 0.5 * (1 - Math.exp(-i / (0.004 * SR)))) / SR;
      return Math.exp(-i / (tau * SR)) * Math.sin(2 * Math.PI * p) * (1 - Math.exp(-i / 10));
    }), t, a);
  }
  const m = unite(filtrer(micro, "haut", 1500, 0.7, SR / 10)), gg = crete1(gouttes);
  return remplir(n, i => (fond[i] * 0.55 + grain[i] * 0.12 + m[i] * 0.4) * houle[i] + gg[i] * 0.5);
}

// Orage : pluie plus sombre et plus dense, grondement de fond, et trois coups de tonnerre espacés (lointain,
// proche avec craquement, moyen).
function tonnerre(r, { duree, proche, fond = 1 }) {
  const len = ech(duree), env = vide(len);
  const bosses = r.entier(4, 7);
  for (let b = 0; b < bosses; b++) {
    const t0 = b === 0 ? 0 : r.entre(0.1, duree * 0.55), att = b === 0 && !proche ? r.entre(0.4, 0.8) : r.entre(0.04, 0.3), dec = r.entre(0.5, 1.8), a = b === 0 ? 1 : r.entre(0.35, 0.9);
    for (let i = ech(t0); i < len; i++) { const t = i / SR - t0; env[i] += a * (1 - Math.exp(-t / att)) * Math.exp(-t / dec); }
  }
  const finale = remplir(len, i => Math.min(1, (len - i) / ech(0.8)));
  const corps = svf(passeBas1Brut(remplir(len, () => r.n()), 250), "bas", remplir(len, i => 55 + (proche ? 650 : 260) * Math.exp(-i / SR / 0.9)), 0.8);
  const roule = svf(remplir(len, () => r.n()), "bande", remplir(len, i => 70 + 60 * Math.exp(-i / SR / 2)), 1.5);
  const k1 = unite(corps), k2 = unite(roule);
  const y = remplir(len, i => (k1[i] + k2[i] * 0.6) * env[i] * finale[i] * fond);
  if (proche) {
    const crac = svf(remplir(ech(0.6), () => r.n()), "haut", 1200, 0.7);
    for (let i = 0; i < crac.length; i++) { const t = i / SR; y[i] += 1.3 * crac[i] * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.09) * (1 + 0.6 * Math.sin(2 * Math.PI * 23 * t)); }
  }
  return y;
}
function orage(n, r) {
  const p = unite(pluie(n, r, { densite: 1.5, sombre: true }));
  const fond = unite(filtrer(brun(n, r), "bas", 90, 0.7)), f = courbe(n, 8, r, 0.2, 0.6);
  const t = vide(n);
  poser(t, tonnerre(r, { duree: 7.5, proche: false, fond: 0.55 }), ech(1.5));
  poser(t, tonnerre(r, { duree: 8, proche: true }), ech(9.6));
  poser(t, tonnerre(r, { duree: 6.5, proche: false, fond: 0.75 }), ech(17.8));
  return remplir(n, i => p[i] * 0.4 + fond[i] * f[i] * 0.3 + t[i] * 1.3);
}

// Feu : souffle grave qui vacille, ronflement des flammes, crépitements (grappes de petits claquements) et quelques
// éclats plus gros.
function feu(n, r) {
  const flamme = courbe(n, 300, r, 0.55, 1);
  const grave = unite(filtrer(rose(n, r), "bande", 170, 0.6));
  const ronfle = unite(filtrer(rose(n, r), "bande", 900, 0.6)), vif = courbe(n, 90, r, 0.4, 1);
  const activite = borner(courbe(n, 30, r, 0, 1.2)).map(v => 0.25 + 0.75 * v);
  const crepit = vide(n);
  for (const t0 of instants(n, 34, r)) {
    if (r.u() > activite[Math.floor(t0)]) continue;
    const grappe = r.u() < 0.35 ? r.entier(2, 6) : 1;
    let t = t0;
    for (let g = 0; g < grappe; g++) {
      const tau = r.entre(0.0004, 0.0028), len = ech(tau * 6) + 2, a = 0.12 + r.u() ** 2.5;
      poser(crepit, remplir(len, i => r.n() * Math.exp(-i / (tau * SR))), t, a);
      t += ech(r.entre(0.004, 0.045));
    }
  }
  const eclats = vide(n);
  for (const t of instants(n, 0.7, r)) {
    const len = ech(0.05), tau = r.entre(0.004, 0.012);
    poser(eclats, svf(remplir(len, i => r.n() * Math.exp(-i / (tau * SR))), "bande", r.entre(500, 1400), 1.2), t, r.entre(0.5, 1));
  }
  const c = crete1(filtrer(crepit, "haut", 1300, 0.7, SR / 10)), e = crete1(eclats);
  return remplir(n, i => grave[i] * flamme[i] * 0.55 + ronfle[i] * vif[i] * flamme[i] * 0.12 + c[i] * 2.2 + e[i] * 0.8);
}

// Grotte : ronflement grave (bruit brun + résonance vers 50 Hz), souffle d'air à peine audible, et gouttes qui
// tombent dans des flaques, noyées dans une longue réverbération.
function goutte(r, f0, tau) {
  const len = ech(tau * 7), y = vide(len), monte = r.entre(0.3, 0.7);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    p += f0 * (1 + monte * (1 - Math.exp(-t / 0.01))) / SR;
    y[i] = Math.sin(2 * Math.PI * p) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0006)) + (t < 0.003 ? 0.3 * r.n() * Math.exp(-t / 0.0008) : 0);
  }
  return y;
}
function grotte(n, r) {
  const respire = courbe(n, 8, r, 0.75, 1);
  const grave = unite(filtrer(brun(n, r), "bas", 100, 0.7)), res = unite(filtrer(blanc(n, r), "bande", 52, 3));
  const air = unite(filtrer(rose(n, r), "bande", 450, 0.5));
  const gouttes = vide(n);
  for (const [periode, f, a] of [[1.85, 1350, 1], [3.05, 920, 0.8], [4.4, 1750, 0.55]]) {
    for (let t = r.entre(0, periode) * SR; t < n; t += periode * SR * (1 + 0.04 * r.n())) poser(gouttes, goutte(r, f * (1 + 0.03 * r.n()), r.entre(0.03, 0.06)), t, a * r.entre(0.8, 1));
  }
  for (const t of instants(n, 0.35, r)) poser(gouttes, goutte(r, r.entre(650, 2400), r.entre(0.02, 0.05)), t, r.entre(0.25, 0.6));
  const echo = crete1(reverberation(gouttes, { piece: 0.97, amorti: 0.2, humide: 1, sec: 0.25, predelai: 0.03, amorce: 8 * SR }));
  return remplir(n, i => (grave[i] * 0.6 + res[i] * 0.35) * respire[i] * 0.5 + air[i] * 0.04 + echo[i] * 1.0);
}

// Mer : quatre vagues par boucle. Chaque vague gonfle (bruit rose dont le filtre s'ouvre), déferle, puis se retire
// en écume (bruit aigu) ; ressac grave continu dessous.
function mer(n, r) {
  const A = vide(n), B = vide(n), nb = 4;
  for (let v = 0; v < nb; v++) {
    const t0 = (v + 0.5 + 0.12 * r.n()) * n / nb, montee = r.entre(2.2, 3.3), descente = r.entre(1.6, 2.6), a = r.entre(0.65, 1);
    poser(A, remplir(ech(montee + 7), i => { const t = i / SR - montee; return a * (t < 0 ? (1 + t / montee) ** 2.5 : Math.exp(-t / descente)); }), t0 - ech(montee));
    const att = r.entre(0.5, 0.9), dec = r.entre(2, 3);
    poser(B, remplir(ech(8), i => { const t = i / SR; return 0.7 * a * (1 - Math.exp(-t / att)) * Math.exp(-t / dec); }), t0 + ech(0.6));
  }
  const corps = unite(filtrer(rose(n, r), "bas", A.map(a => 200 + 3200 * Math.min(1.2, a) ** 1.4), 0.55));
  const ecume = unite(filtrer(filtrer(blanc(n, r), "haut", 2200, 0.7), "bas", 8000, 0.7));
  const ressac = unite(filtrer(brun(n, r), "bande", 110, 0.7));
  return remplir(n, i => corps[i] * (0.1 + A[i]) * 0.8 + ecume[i] * (0.35 * B[i] + 0.25 * A[i] ** 3) + ressac[i] * (0.3 + 0.25 * A[i]));
}

// Foule : une vingtaine de « voix » (source glottique en dent de scie + trois formants) qui enchaînent des syllabes
// de voyelles au hasard, avec intonation, pauses et quelques fricatives : un brouhaha sans un mot intelligible.
// Fond de brouhaha lointain, réverbération de salle, et de temps en temps un choc de chopes ou de verres.
const VOYELLES = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [500, 1500, 2500], [660, 1700, 2400], [400, 1900, 2550]];
function voix(n, r) {
  const femme = r.u() < 0.45, echelle = femme ? 1.17 : 1, base = femme ? r.entre(175, 235) : r.entre(95, 140);
  const amp = vide(n), F = [vide(n), vide(n), vide(n)], h = vide(n), fric = vide(n);
  const debut = ech(r.entre(0, 3)), fin = debut + n;
  let t = debut, v = VOYELLES[0], hz = base;
  const tenir = (de, a) => { for (let j = de; j < a; j++) { const i = j % n; F[0][i] = v[0] * echelle; F[1][i] = v[1] * echelle; F[2][i] = v[2] * echelle; h[i] = hz; } };
  while (t < fin) {
    const syllabes = r.entier(3, 14), force = r.entre(0.6, 1);
    for (let s = 0; s < syllabes; s++) {
      const duree = ech(r.entre(0.1, 0.26));
      if (t + duree + ech(0.3) > fin) break;
      v = VOYELLES[r.entier(0, VOYELLES.length - 1)];
      hz = base * (1 + 0.14 * (1 - s / syllabes) + 0.05 * r.n());
      tenir(t, t + duree);
      for (let j = 0; j < duree; j++) amp[(t + j) % n] = force * Math.sin(Math.PI * j / duree) ** 0.5;
      if (r.u() < 0.3) { const lf = ech(r.entre(0.04, 0.09)); for (let j = 0; j < lf; j++) fric[(t + j) % n] = 1 - j / lf; }
      t += duree;
    }
    const pause = Math.min(ech(r.entre(0.25, 2.2)), fin - t);
    tenir(t, t + pause);
    t += Math.max(pause, 1);
  }
  const tremble = courbe(n, 2400, r, -1, 1), hauteur = lisser(h, 0.04).map((x, i) => x * (1 + 0.012 * tremble[i]));
  const souffle = blanc(n, r), glotte = oscillateur(n, hauteur, "scie");
  const source = remplir(n, i => glotte[i] * 0.9 + souffle[i] * 0.06);
  const f = F.map(x => lisser(x, 0.03)), largeurs = [90, 110, 150], gains = [1, 0.6, 0.35];
  const sortie = vide(n);
  f.forEach((fk, k) => { const y = filtrer(source, "bande", fk, fk.map(x => x / largeurs[k]), SR / 4); for (let i = 0; i < n; i++) sortie[i] += y[i] * gains[k]; });
  const a = lisser(amp, 0.012), sifflante = filtrer(blanc(n, r), "haut", 4200, 0.7, SR / 10), fr = lisser(fric, 0.006);
  return remplir(n, i => sortie[i] * a[i] + sifflante[i] * fr[i] * 0.08);
}
function foule(n, r) {
  const salle = vide(n);
  for (let k = 0; k < 22; k++) {
    const d = r.entre(0.15, 1);
    const v = unite(filtrer(voix(n, r), "bas", 2200 + 5000 * d, 0.7, SR / 4));
    for (let i = 0; i < n; i++) salle[i] += v[i] * d ** 1.3;
  }
  const lointain = unite(filtrer(rose(n, r), "bande", 550, 0.7)), ondule = courbe(n, 20, r, 0.7, 1);
  const chocs = vide(n);
  for (const t of instants(n, 0.3, r)) {
    poser(chocs, r.u() < 0.5
      ? frappe(r, { f: r.entre(1900, 3200), rapports: [1, 2.32, 3.9, 5.1], taus: [0.18, 0.1, 0.06, 0.04], bruit: 0.4 })
      : frappe(r, { f: r.entre(380, 650), rapports: [1, 1.8, 2.7], taus: [0.05, 0.03, 0.02], bruit: 0.8, choc: 0.6, fChoc: 120 }), t, r.entre(0.3, 1));
  }
  const s = unite(salle), c = crete1(chocs);
  const sec = remplir(n, i => s[i] + lointain[i] * ondule[i] * 0.3 + c[i] * 0.9);
  return reverberation(sec, { piece: 0.7, amorti: 0.5, humide: 0.22, sec: 1, predelai: 0.015 });
}

// Forge / manufactorum : bourdonnement électrique (50 Hz et harmoniques), moteur grave, grondement ; cycle de
// machine de 0,75 s (presse lourde, deux cliquetis), jets de vapeur toutes les 3 s, marteau sur enclume toutes les 6 s.
function forge(n, r) {
  const cycle = n / 32;
  const pulsation = lfo(n, 32, 0.25);
  const hum = vide(n);
  [1, 0.55, 0.45, 0.25, 0.15, 0.08].forEach((a, k) => { const o = oscillateur(n, 50 * (k + 1), "sinus", r.u()); for (let i = 0; i < n; i++) hum[i] += o[i] * a; });
  const moteur = unite(filtrer(oscillateur(n, 37.5, "scie"), "bas", 170, 1.3)), grave = unite(filtrer(brun(n, r), "bas", 220, 0.7));
  const coups = vide(n), vapeur = vide(n);
  for (let c = 0; c < 32; c++) {
    const b = c * cycle, j = () => ech(0.004 * r.n());
    poser(coups, frappe(r, { f: 160, rapports: [1, 1.47, 2.09, 2.56, 3.42, 4.6], taus: [0.3, 0.22, 0.16, 0.1, 0.07, 0.05], bruit: 0.5, choc: 1.4 }), b + j(), 0.9 * (1 + 0.08 * r.n()));
    poser(coups, frappe(r, { f: 1250, rapports: [1, 1.58, 2.37, 3.1], taus: [0.06, 0.04, 0.03, 0.02], bruit: 0.6 }), b + 0.5 * cycle + j(), 0.75 * (1 + 0.1 * r.n()));
    poser(coups, frappe(r, { f: 2050, rapports: [1, 1.71, 2.6], taus: [0.04, 0.03, 0.02], bruit: 0.5 }), b + 0.75 * cycle + j(), 0.4 * (1 + 0.1 * r.n()));
    if (c % 4 === 2) {
      const len = ech(0.9), jet = svf(remplir(len, () => r.n()), "haut", 2400, 0.7);
      poser(vapeur, jet.map((x, i) => x * (1 - Math.exp(-i / ech(0.03))) * Math.exp(-i / ech(0.3))), b + 0.2 * cycle, 0.8);
    }
    if (c % 8 === 5) for (const [dt, a] of [[0.1, 0.55], [0.62, 0.4]]) {
      poser(coups, frappe(r, { f: 880, rapports: [1, 2.76, 5.4, 8.93], taus: [0.9, 0.5, 0.3, 0.18], bruit: 0.6 }), b + dt * cycle + j(), a);
    }
  }
  const salle = crete1(reverberation(coups, { piece: 0.75, amorti: 0.45, humide: 0.4, sec: 1, predelai: 0.02 })), jets = crete1(vapeur);
  return remplir(n, i => hum[i] * (0.8 + 0.2 * pulsation[i]) * 0.1 + moteur[i] * 0.22 + grave[i] * 0.2 + salle[i] * 1.0 + jets[i] * 0.25);
}

// Nuit : grillons (trains de 3-4 impulsions vers 4,5 kHz, quelques proches et un chœur lointain qui s'arrête par
// moments), brise légère dans le grave et froissement de feuilles.
function grillons(n, r, nombre, proche) {
  const y = vide(n);
  for (let k = 0; k < nombre; k++) {
    const fc = r.entre(4100, 5100), periode = r.entre(0.36, 0.7), pulses = r.entier(3, 4), duree = r.entre(0.011, 0.02), ecart = r.entre(0.027, 0.04);
    const actif = courbe(n, r.entier(3, 7), r, proche ? 0.1 : -0.6, 1.3), a = proche ? r.entre(0.5, 1) : r.entre(0.06, 0.2);
    for (let t = r.entre(0, periode) * SR; t < n; t += periode * SR * (1 + 0.015 * r.n())) {
      const on = Math.min(1, actif[Math.floor(t)]);
      if (on <= 0) continue;
      for (let p = 0; p < pulses; p++) {
        const len = ech(duree);
        let ph = 0;
        poser(y, remplir(len, i => { const x = i / len; ph += fc * (1 - 0.02 * x) / SR; return Math.sin(Math.PI * x) ** 2 * (Math.sin(2 * Math.PI * ph) + 0.08 * Math.sin(4 * Math.PI * ph)); }), t + p * ecart * SR, a * on);
      }
    }
  }
  return y;
}
function nuit(n, r) {
  const proches = crete1(grillons(n, r, 3, true)), lointains = crete1(filtrer(grillons(n, r, 16, false), "bas", 5500, 0.7, SR / 10));
  const brise = unite(filtrer(rose(n, r), "bande", 300, 0.5)), b = courbe(n, 10, r, 0.3, 1);
  const feuilles = unite(filtrer(blanc(n, r), "bande", 2600, 0.7)), fe = borner(courbe(n, 9, r, -0.4, 1));
  return remplir(n, i => proches[i] * 0.5 + lointains[i] * 0.35 + brise[i] * b[i] * 0.15 + feuilles[i] * fe[i] ** 3 * 0.05);
}

// Tension : grappe dissonante grave (la, si bémol, ré dièse : seconde mineure et triton) en dents de scie
// désaccordées sous un filtre qui respire, sous-grave, souffle sombre, sons aigus vitreux en triton qui gonflent par
// moments, et battement de cœur discret à 50 pulsations par minute.
function tension(n, r) {
  const grappe = vide(n);
  for (const f of [55, 58.27, 77.78]) for (const d of [-0.13, 0, 0.11]) {
    const o = oscillateur(n, f + d, "scie", r.u());
    for (let i = 0; i < n; i++) grappe[i] += o[i];
  }
  const ouvre = lfo(n, 1, r.u()), drone = unite(filtrer(grappe, "bas", ouvre.map(v => 140 + 260 * v), 2.2));
  const sub = oscillateur(n, 41.2, "sinus"), subAm = lfo(n, 3);
  const vib = lfo(n, 120), aigu1 = oscillateur(n, vib.map(v => 1318.5 * (1 + 0.004 * (v - 0.5))), "sinus"), aigu2 = oscillateur(n, vib.map(v => 1864.7 * (1 - 0.005 * (v - 0.5))), "sinus");
  const gonfle = borner(courbe(n, 6, r, -0.6, 1)).map(v => v * v);
  const souffle = unite(filtrer(brun(n, r), "bande", 130, 1.2)), sf = courbe(n, 8, r, 0.3, 1);
  const coeur = vide(n), battement = remplir(ech(0.3), i => { const t = i / SR; return Math.sin(2 * Math.PI * 48 * t) * (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.07); });
  for (let k = 0; k < 20; k++) { poser(coeur, battement, k * n / 20); poser(coeur, battement, k * n / 20 + ech(0.28), 0.7); }
  const mix = remplir(n, i => drone[i] * 0.6 + sub[i] * (0.6 + 0.4 * subAm[i]) * 0.35 + (aigu1[i] + aigu2[i] * 0.7) * gonfle[i] * 0.05
    + souffle[i] * sf[i] * 0.3 + coeur[i] * 0.45);
  return reverberation(mix, { piece: 0.85, amorti: 0.5, humide: 0.2, sec: 1 });
}

export const AMBIANCES = {
  vent: { libelle: "Vent et rafales", pour: "Extérieur venteux : lande, col de montagne, remparts, plaine désolée, tempête sèche.", synthese: vent },
  pluie: { libelle: "Pluie régulière", pour: "Voyage ou scène sous la pluie, ville mouillée, campement sous la toile.", synthese: pluie },
  orage: { libelle: "Orage", pour: "Tempête, nuit d'orage, scène dramatique, château battu par la pluie.", synthese: orage },
  feu: { libelle: "Feu de camp", pour: "Bivouac, veillée, âtre d'auberge, cheminée de manoir, repos au coin du feu.", synthese: feu },
  grotte: { libelle: "Grotte et souterrain", pour: "Grotte, donjon, crypte, mine, égouts, tunnels de ruche.", synthese: grotte },
  mer: { libelle: "Vagues", pour: "Côte, plage, falaises, port, pont d'un navire par mer calme.", synthese: mer },
  foule: { libelle: "Foule et taverne", pour: "Taverne, auberge, marché, place publique, banquet, salle des fêtes.", synthese: foule },
  forge: { libelle: "Forge et machines", pour: "Forge, atelier, manufactorum, salle des machines, ruche industrielle (40k).", synthese: forge },
  nuit: { libelle: "Nuit en campagne", pour: "Nuit calme : campagne, tour de garde au camp, village endormi, lisière de forêt.", synthese: nuit },
  tension: { libelle: "Tension", pour: "Suspense, horreur, menace imminente : loup-garou, crypte maudite, présence du Warp (40k).", synthese: tension }
};

export const cheminSon = cle => `${DOSSIER_SONS}/${cle}.wav`;
export const indexSons = (ambiances = AMBIANCES) =>
  Object.fromEntries(Object.entries(ambiances).map(([cle, { libelle, pour }]) => [cle, { libelle, fichier: cheminSon(cle), pour }]));

// ---------------------------------------------------------------- Mesures et normalisation

// Sonie intégrée en LUFS : pondération K (UIT-R BS.1770 : plateau aigu +4 dB puis passe-haut ~38 Hz), sans portillonnage.
export function sonie(x, frequence = SR) {
  const biquad = (s, [b0, b1, b2, a0, a1, a2]) => {
    const y = new Float64Array(s.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < s.length; i++) {
      const v = (b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  let w = 2 * Math.PI * 1681.974450955533 / frequence, A = 10 ** (3.999843853973347 / 40), al = Math.sin(w) / (2 * 0.7071752369554196), c = Math.cos(w);
  const plateau = [A * ((A + 1) + (A - 1) * c + 2 * Math.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * Math.sqrt(A) * al),
    (A + 1) - (A - 1) * c + 2 * Math.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * Math.sqrt(A) * al];
  w = 2 * Math.PI * 38.13547087602444 / frequence; al = Math.sin(w) / (2 * 0.5003270373238773); c = Math.cos(w);
  const passeHaut = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
  const y = biquad(biquad(x, plateau), passeHaut);
  let s = 0;
  for (const v of y) s += v * v;
  return -0.691 + 10 * Math.log10(s / y.length + 1e-20);
}

export const crete = x => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };

// Limiteur doux et circulaire : gain minimal requis étalé sur ±20 ms puis moyenné sur ±20 ms ; à chaque crête, la
// moyenne ne dépasse jamais le gain requis, donc la crête finale reste sous le plafond.
function limiter(x, plafond) {
  const n = x.length, L = ech(0.02), g = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a <= plafond) continue;
    const req = plafond / a;
    for (let j = i - L; j <= i + L; j++) { const k = (j + n) % n; if (g[k] > req) g[k] = req; }
  }
  const cumul = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cumul[i + 1] = cumul[i] + g[i];
  const somme = (a, b) => cumul[b] - cumul[a]; // [a, b[ avec 0 <= a <= b <= n
  return remplir(n, i => {
    const a = i - L, b = i + L + 1;
    const s = a < 0 ? somme(0, b) + somme(n + a, n) : b > n ? somme(a, n) + somme(0, b - n) : somme(a, b);
    return x[i] * s / (2 * L + 1);
  });
}

// Retire le continu, amène la sonie à la cible et la crête sous le plafond (quelques passes : le limiteur fait
// perdre un peu de sonie, qu'on rattrape).
export function finaliser(x) {
  const propre = filtrer(x, "haut", 20, 0.707, 2 * SR);
  let gain = 10 ** ((SONIE_CIBLE - sonie(propre)) / 20), y = propre;
  for (let passe = 0; passe < 4; passe++) {
    y = limiter(propre.map(v => v * gain), PLAFOND);
    gain *= 10 ** ((SONIE_CIBLE - sonie(y)) / 20);
  }
  return y.map(v => Math.max(-PLAFOND, Math.min(PLAFOND, v)));
}

export function synthetiser(cle, duree = DUREE) {
  const a = AMBIANCES[cle];
  if (!a) throw new Error(`Ambiance inconnue : ${cle}`);
  return finaliser(a.synthese(ech(duree), alea(grainePour(cle))));
}

// ---------------------------------------------------------------- WAV

export function encoderWav(x, frequence = SR) {
  const taille = x.length * 2, b = Buffer.alloc(44 + taille);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + taille, 4); b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(frequence, 24); b.writeUInt32LE(frequence * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii"); b.writeUInt32LE(taille, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + 2 * i);
  return b;
}

// Lecteur strict : refuse un fichier tronqué, incohérent ou d'un autre format que PCM 16 bits.
export function lireWav(octets) {
  const b = Buffer.isBuffer(octets) ? octets : Buffer.from(octets);
  if (b.length < 12 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("pas un fichier RIFF/WAVE");
  if (b.readUInt32LE(4) + 8 !== b.length) throw new Error(`taille RIFF incohérente (${b.readUInt32LE(4) + 8} octets annoncés, ${b.length} présents) : fichier tronqué ?`);
  let pos = 12, fmt = null, data = null;
  while (pos < b.length) {
    if (pos + 8 > b.length) throw new Error("en-tête de bloc tronqué");
    const id = b.toString("ascii", pos, pos + 4), t = b.readUInt32LE(pos + 4);
    if (pos + 8 + t > b.length) throw new Error(`bloc « ${id} » tronqué`);
    if (id === "fmt ") {
      if (t < 16) throw new Error("bloc fmt trop court");
      fmt = { format: b.readUInt16LE(pos + 8), canaux: b.readUInt16LE(pos + 10), frequence: b.readUInt32LE(pos + 12), debit: b.readUInt32LE(pos + 16), bloc: b.readUInt16LE(pos + 20), bits: b.readUInt16LE(pos + 22) };
    } else if (id === "data") data = b.subarray(pos + 8, pos + 8 + t);
    pos += 8 + t + (t & 1);
  }
  if (!fmt) throw new Error("bloc fmt absent");
  if (!data) throw new Error("bloc data absent");
  if (fmt.format !== 1) throw new Error(`format ${fmt.format} : PCM attendu`);
  if (fmt.bits !== 16) throw new Error(`${fmt.bits} bits : 16 attendus`);
  if (!fmt.canaux || fmt.bloc !== fmt.canaux * 2 || fmt.debit !== fmt.frequence * fmt.bloc) throw new Error("bloc fmt incohérent");
  if (data.length % fmt.bloc) throw new Error("données incomplètes (dernière trame coupée)");
  const echantillons = new Float32Array(data.length / 2);
  for (let i = 0; i < echantillons.length; i++) echantillons[i] = data.readInt16LE(2 * i) / 32768;
  return { ...fmt, duree: echantillons.length / fmt.canaux / fmt.frequence, echantillons };
}

// ---------------------------------------------------------------- Analyse (essais et contrôle)

// Saut à la jointure de boucle (dernier -> premier échantillon) comparé aux sauts ordinaires du signal (quantile
// 99,9 % des écarts entre échantillons voisins). rapport <= 1 : la jointure ne se distingue pas du reste.
export function sautDeBoucle(x) {
  const n = x.length, d = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = Math.abs(x[i + 1] - x[i]);
  d.sort();
  const reference = d[Math.floor(0.999 * (d.length - 1))], saut = Math.abs(x[0] - x[n - 1]);
  return { saut, reference, rapport: saut / Math.max(reference, 1e-6) };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// Part de l'énergie par bande d'octave (Welch, fenêtres de Hann de 4096). Bandes centrées sur 31,25 Hz ... 8 kHz.
export const CENTRES_BANDES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000];
export function bandes(x, frequence = SR) {
  const N = 4096, hann = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)), puissance = new Float64Array(N / 2);
  for (let deb = 0; deb + N <= x.length; deb += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[deb + i] * hann[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) puissance[k] += re[k] * re[k] + im[k] * im[k];
  }
  const e = CENTRES_BANDES.map(() => 0);
  for (let k = 1; k < N / 2; k++) {
    const f = k * frequence / N, b = CENTRES_BANDES.findIndex(c => f >= c / Math.SQRT2 && f < c * Math.SQRT2);
    if (b >= 0) e[b] += puissance[k];
  }
  const total = e.reduce((s, v) => s + v, 0);
  return e.map(v => v / total);
}

// Variation lente du niveau : écart-type relatif de la valeur efficace par tranches de 0,25 s.
export function modulation(x, frequence = SR) {
  const t = Math.round(0.25 * frequence), rms = [];
  for (let d = 0; d + t <= x.length; d += t) { let s = 0; for (let i = d; i < d + t; i++) s += x[i] * x[i]; rms.push(Math.sqrt(s / t)); }
  const m = rms.reduce((s, v) => s + v, 0) / rms.length;
  return Math.sqrt(rms.reduce((s, v) => s + (v - m) ** 2, 0) / rms.length) / m;
}

// ---------------------------------------------------------------- Fabrication

export function fabriquerSons({ dossier = join(RACINE, DOSSIER_SONS_DISQUE), journal = console.log } = {}) {
  mkdirSync(dossier, { recursive: true });
  for (const f of readdirSync(dossier)) if (f.endsWith(".wav") && !AMBIANCES[f.slice(0, -4)]) rmSync(join(dossier, f));
  const bilan = [];
  for (const cle of Object.keys(AMBIANCES)) {
    const debut = Date.now(), x = synthetiser(cle), wav = encoderWav(x);
    writeFileSync(join(dossier, `${cle}.wav`), wav);
    const ligne = { cle, duree: x.length / SR, octets: wav.length, sonie: sonie(x), crete: dB(crete(x)) };
    bilan.push(ligne);
    journal(`${cle.padEnd(8)} ${ligne.duree.toFixed(1)} s  ${(wav.length / 1048576).toFixed(2)} Mio  ${ligne.sonie.toFixed(1)} LUFS  crête ${ligne.crete.toFixed(1)} dBFS  (${((Date.now() - debut) / 1000).toFixed(1)} s)`);
  }
  writeFileSync(join(dossier, "index.json"), `${JSON.stringify(indexSons(), null, 2)}\n`);
  const total = bilan.reduce((s, l) => s + l.octets, 0);
  journal(`total ${(total / 1048576).toFixed(2)} Mio dans ${DOSSIER_SONS}/`);
  return bilan;
}

// Lancé directement (npm run fabriquer-sons) ; importé par les essais, on n'écrit rien.
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) fabriquerSons();
