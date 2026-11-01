// Voix en direct (docs/voix-et-ecoute.md §1) : logique pure, sans Foundry, éprouvée dans essais/voix-flux.test.mjs.
// - Calendrier : quand jouer chaque morceau de PCM (petite mémoire tampon, reprise après un trou, plafond de mémoire) ;
//   sert au navigateur qui joue ET au MJ qui estime la fin de la voix.
// - RecepteurFlux : dans chaque navigateur, quels morceaux jouer (flux inconnu ignoré, doublon ou retard jeté, perte comptée).
// - FileDesVoix : une seule voix à la fois, le narrateur avant les compagnons.
// - destinatairesVoix : qui doit entendre une voix (aux Veillées, selon l'audibilité du système lakour-loups).
// - GardeLecture : retient le début de l'audio tant qu'on ne sait pas si le modèle dit bien le texte.
// - voixPourCompagnon, tonPourCompagnon, paroleSeule : la voix d'un compagnon et ce qu'elle lit (pas la didascalie).
import { lectureFidele, texteParlable } from "./voix-texte.js";

export const FREQUENCE_VOIX = 24000;
// Mémoire tampon avant le premier morceau (et après un trou) : absorbe les à-coups du réseau.
export const TAMPON_S = 0.2;
// Au-delà de tant de secondes d'audio en attente, un morceau est jeté (mémoire du navigateur bornée).
export const AVANCE_MAX_S = 300;
// Un flux sans nouvelles depuis tant de secondes est oublié.
export const FLUX_MUET_S = 20;

// Durée (secondes) d'un morceau PCM 16 bits mono encodé en base64, sans le décoder.
export function dureePcm(b64, frequence = FREQUENCE_VOIX) {
  const s = String(b64 ?? "");
  if (!s) return 0;
  const bourrage = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  const octets = Math.floor(s.length * 3 / 4) - bourrage;
  return Math.floor(octets / 2) / frequence;
}

// Ligne de temps de la lecture (une par navigateur, partagée par tous les flux : deux voix ne se chevauchent jamais).
// planifier(maintenant, duree) rend l'instant de début du morceau, ou null s'il faut le jeter (trop d'avance).
export class Calendrier {
  constructor({ tampon = TAMPON_S, avanceMax = AVANCE_MAX_S } = {}) {
    this.tampon = tampon;
    this.avanceMax = avanceMax;
    this.fin = 0;
    this.trous = 0;
  }

  planifier(maintenant, duree) {
    if (this.fin - maintenant > this.avanceMax) return null;
    let debut = this.fin;
    // Rien en cours (premier morceau, ou le précédent est fini : trou) : on reprend avec la mémoire tampon.
    if (debut < maintenant + 0.005) {
      if (this.fin > 0) this.trous++;
      debut = maintenant + this.tampon;
    }
    this.fin = debut + Math.max(0, duree);
    return debut;
  }

  restant(maintenant) {
    return Math.max(0, this.fin - maintenant);
  }

  vider() {
    this.fin = 0;
  }
}

// Dans chaque navigateur : les flux en cours et le tri des morceaux reçus.
// debut(flux) ouvre un flux ; morceau(flux, n) rend true s'il faut le jouer ; fin(flux, total) le ferme.
// Un navigateur arrivé en cours de route n'a pas vu le début : il ignore tout ce flux.
export class RecepteurFlux {
  constructor() {
    this.flux = new Map();   // id -> { attendu, pertes, recus, fini, total, vu }
  }

  debut(id, maintenant = 0) {
    if (!id) return false;
    this.flux.set(id, { attendu: 0, pertes: 0, recus: 0, fini: false, total: null, vu: maintenant });
    return true;
  }

  morceau(id, n, maintenant = 0) {
    const f = this.flux.get(id);
    if (!f || f.fini) return false;                    // flux inconnu (arrivé en cours de route) ou déjà fermé
    if (!Number.isInteger(n) || n < f.attendu) return false;   // doublon ou retardataire : déjà dépassé
    if (n > f.attendu) f.pertes += n - f.attendu;      // morceaux perdus : on continue sans eux
    f.attendu = n + 1;
    f.recus++;
    f.vu = maintenant;
    return true;
  }

  fin(id, total = null) {
    const f = this.flux.get(id);
    if (!f) return null;
    f.fini = true;
    f.total = total;
    if (Number.isInteger(total) && total > f.attendu) f.pertes += total - f.attendu;
    const bilan = { recus: f.recus, pertes: f.pertes };
    this.flux.delete(id);
    return bilan;
  }

  // Flux restés sans nouvelles (fin perdue, MJ parti) : oubliés.
  nettoyer(maintenant, muet = FLUX_MUET_S) {
    const oublies = [];
    for (const [id, f] of this.flux) if (maintenant - f.vu > muet) { this.flux.delete(id); oublies.push(id); }
    return oublies;
  }

  get enCours() {
    return this.flux.size;
  }
}

// Une seule voix à la fois. prendre(priorite) rend une promesse résolue, à son tour, par la fonction qui rend la parole.
// Le narrateur passe avant les compagnons qui attendent ; personne n'est coupé ; à priorité égale, premier arrivé.
export const RANGS_VOIX = { narrateur: 0, compagnon: 1 };

export class FileDesVoix {
  constructor() {
    this.attente = [];
    this.occupant = null;
    this.compteur = 0;
    this.reposAttendus = [];
  }

  prendre(priorite = "compagnon", etiquette = "") {
    return new Promise(resolve => {
      this.attente.push({ rang: RANGS_VOIX[priorite] ?? 1, ordre: this.compteur++, resolve, etiquette, priorite });
      this.#suivant();
    });
  }

  get libre() {
    return !this.occupant && !this.attente.length;
  }

  // Résolue quand plus personne ne parle ni n'attend (le pilote automatique attend la fin des voix).
  attendreRepos() {
    if (this.libre) return Promise.resolve();
    return new Promise(resolve => this.reposAttendus.push(resolve));
  }

  #suivant() {
    if (this.occupant) return;
    if (!this.attente.length) {
      for (const r of this.reposAttendus.splice(0)) r();
      return;
    }
    this.attente.sort((a, b) => a.rang - b.rang || a.ordre - b.ordre);
    const e = this.attente.shift();
    this.occupant = e;
    let rendu = false;
    e.resolve(() => {
      if (rendu) return;
      rendu = true;
      if (this.occupant === e) this.occupant = null;
      this.#suivant();
    });
  }
}

// Qui entend une voix. utilisateurs : [{ id, active, isGM }].
// - narrateur : tous les connectés ;
// - compagnon : tous, sauf si le système dit qui l'entend (audibiliteActeur, Veillées) : alors ses auditeurs connectés, plus
//   les MJ (ils mènent la partie et savent tout). Un compagnon qui ne peut pas parler n'est entendu de personne. Si la question
//   échoue, prudence : les MJ seulement.
export function destinatairesVoix({ type = "narrateur", acteurId = null, utilisateurs = [], audibiliteActeur = null } = {}) {
  const actifs = utilisateurs.filter(u => u?.active);
  const tous = actifs.map(u => u.id);
  if (type !== "compagnon" || typeof audibiliteActeur !== "function") return tous;
  const mj = actifs.filter(u => u.isGM).map(u => u.id);
  let a;
  try { a = audibiliteActeur(acteurId); } catch { return mj; }
  if (!a) return tous;
  if (a.peutParler === false) return [];
  const auditeurs = new Set(Array.isArray(a.auditeurs) ? a.auditeurs : []);
  return tous.filter(id => auditeurs.has(id) || mj.includes(id));
}

// Le début de l'audio est retenu tant qu'on ne sait pas si le modèle dit bien le texte (il lui arrive de répondre au texte au
// lieu de le dire : « D'accord, je vais lire… »). Verdict dès que la transcription a assez de mots, ou après `confiance`
// secondes d'audio sans transcription (on fait confiance). Ensuite les morceaux passent aussitôt ; une lecture qui s'emballe
// (bien plus longue que le texte) est coupée.
// morceau(b64) et transcription(delta) rendent { sortir: [b64…], etat } ; etat : "attente" | "ok" | "infidele" | "couper".
export class GardeLecture {
  constructor(texte, { confiance = 1.5, frequence = FREQUENCE_VOIX } = {}) {
    this.texte = String(texte ?? "");
    this.attendus = mots(this.texte);
    this.confiance = confiance;
    this.frequence = frequence;
    this.transcrit = "";
    this.retenus = [];
    this.duree = 0;
    this.etat = "attente";
  }

  morceau(b64) {
    if (this.etat === "infidele" || this.etat === "couper") return { sortir: [], etat: this.etat };
    if (this.etat === "ok") return { sortir: [b64], etat: "ok" };
    this.retenus.push(b64);
    this.duree += dureePcm(b64, this.frequence);
    return this.#juger();
  }

  transcription(delta) {
    this.transcrit += delta ?? "";
    if (this.etat === "ok" && this.#tropLong()) this.etat = "couper";
    if (this.etat !== "attente") return { sortir: [], etat: this.etat };
    return this.#juger();
  }

  // Fin de la réponse : verdict sur la transcription complète si rien n'était encore décidé.
  finir() {
    if (this.etat !== "attente") return { sortir: [], etat: this.etat };
    this.etat = lectureFidele(this.texte, this.transcrit) ? "ok" : "infidele";
    return { sortir: this.etat === "ok" ? this.retenus.splice(0) : [], etat: this.etat };
  }

  #tropLong() {
    return mots(this.transcrit).length > this.attendus.length * 1.3 + 8;
  }

  #juger() {
    const n = Math.min(3, this.attendus.length);
    const t = mots(this.transcrit);
    if (t.length >= n && n > 0) {
      this.etat = this.attendus.slice(0, n).every((m, i) => t[i] === m) ? "ok" : "infidele";
    } else if (this.duree >= this.confiance) {
      this.etat = "ok";
    }
    return { sortir: this.etat === "ok" ? this.retenus.splice(0) : [], etat: this.etat };
  }
}

const mots = s => texteParlable(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// ---------- Voix des compagnons
// Voix de l'API Realtime préférées pour chaque tempérament (compagnons.js, TEMPERAMENTS), dans l'ordre.
export const VOIX_PAR_TEMPERAMENT = {
  prudent: ["sage", "alloy", "echo"],
  bavard: ["coral", "verse", "shimmer"],
  soupconneux: ["ash", "echo", "sage"],
  farceur: ["verse", "coral", "ballad"],
  loyal: ["marin", "alloy", "cedar"],
  impulsif: ["ash", "verse", "marin"],
  taciturne: ["cedar", "echo", "sage"]
};
const TOUTES_LES_VOIX = ["cedar", "marin", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "alloy"];

const TONS = {
  prudent: "posée, mesurée, un peu méfiante",
  bavard: "vive, enjouée, qui parle volontiers",
  soupconneux: "sèche, inquisitrice, pleine de doute",
  farceur: "malicieuse, un sourire dans la voix",
  loyal: "chaleureuse, franche et sûre",
  impulsif: "rapide, tranchante, pleine d'élan",
  taciturne: "basse, brève, chaque mot pesé"
};

function hacher(texte) {
  let h = 0x811c9dc5;
  for (const c of String(texte)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// La voix d'un compagnon : la première préférée de son tempérament qui n'est ni celle du narrateur ni déjà prise par un autre
// compagnon ; sinon une voix libre tirée de sa graine ; sinon (plus de voix libre) une voix tirée de sa graine. Déterministe.
export function voixPourCompagnon(personnalite, { graine = "", prises = [], voixNarrateur = "" } = {}) {
  const exclues = new Set([...prises, voixNarrateur].filter(Boolean));
  const preferees = VOIX_PAR_TEMPERAMENT[personnalite?.temperament] ?? [];
  const libre = preferees.find(v => !exclues.has(v));
  if (libre) return libre;
  const libres = TOUTES_LES_VOIX.filter(v => !exclues.has(v));
  const liste = libres.length ? libres : TOUTES_LES_VOIX;
  return liste[hacher(`voix|${graine}`) % liste.length];
}

// Consignes de ton (modèle Realtime) d'un compagnon, d'après son tempérament et sa façon de parler.
export function tonPourCompagnon(personnalite) {
  const ton = TONS[personnalite?.temperament] ?? "naturelle";
  const parler = String(personnalite?.parler ?? "").trim();
  return `Voix d'un personnage qui parle à la table, ${ton}.${parler ? ` Façon de parler : ${parler}.` : ""} `
    + "Dis la réplique comme une parole vivante, avec naturel, sans emphase de narrateur.";
}

// Ce que dit la voix d'un compagnon : sa parole seule, sans la didascalie en tête (« *Il croise les bras.* — … ») ni les marques.
export function paroleSeule(replique) {
  const t = String(replique ?? "").trim()
    .replace(/^(?:\*{1,2}[^*]+\*{1,2}|_[^_]+_|\([^()]+\))\s*(?:[—–-]+\s*)?/, "");
  return texteParlable(t).replace(/^[—–-]+\s*/, "").trim();
}
