// Écoute des joueurs (parole → texte), docs/voix-et-ecoute.md §2 : logique pure, sans Foundry (essais/ecoute.test.mjs).
// - ecouteActive : on n'écoute et on ne transcrit QUE si une IA doit entendre ;
// - DecoupeurSilences : découpe le son d'un joueur en segments de parole (1 à 15 s environ) d'après son niveau ;
// - routerParole : qui reçoit une phrase transcrite (le MJ IA, les compagnons qui pouvaient l'entendre) ;
// - coût de la transcription, WAV 16 kHz, filtres (hallucinations sur un silence, écho d'une voix d'IA).
// Le branchement sur Foundry (flux A/V, appels à OpenAI, file du MJ IA) est dans transcription.js.

// seanceIA : une séance du MJ IA est lancée ; compagnonsVivants : nombre (ou liste) de compagnons IA vivants à la table, même
// si un MJ humain mène sans narrateur IA ; moduleActif : le MJ IA est actif dans ce monde (faux = jamais d'écoute).
export function ecouteActive({ seanceIA = false, compagnonsVivants = 0, moduleActif = true } = {}) {
  if (moduleActif === false) return false;
  const compagnons = Array.isArray(compagnonsVivants) ? compagnonsVivants.length : Number(compagnonsVivants) || 0;
  return Boolean(seanceIA) || compagnons > 0;
}

// ---------- Coût (dollars par minute d'audio, relevés le 01/11/2026 : estimation de la console, la facture fait foi)
export const PRIX_TRANSCRIPTION = {
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe": 0.006,
  "whisper-1": 0.006
};
// Le moins cher de la liste, par défaut.
export const MODELE_TRANSCRIPTION_DEFAUT = Object.entries(PRIX_TRANSCRIPTION).sort(([, a], [, b]) => a - b)[0][0];

// Coût d'un segment : durée facturée (celle rendue par l'API si elle la donne, sinon celle du segment). Modèle inconnu : le
// prix le plus haut de la liste (mieux vaut surestimer face au budget).
export function coutTranscription(modele, secondes) {
  const prix = PRIX_TRANSCRIPTION[modele] ?? Math.max(...Object.values(PRIX_TRANSCRIPTION));
  return Math.max(0, Number(secondes) || 0) / 60 * prix;
}

// ---------- Signal
// Niveau d'un bloc d'échantillons (-1..1), en dBFS (RMS). Silence numérique : -100.
export function niveauDb(echantillons) {
  let somme = 0;
  for (const x of echantillons) somme += x * x;
  const rms = Math.sqrt(somme / Math.max(1, echantillons.length));
  return rms > 1e-5 ? 20 * Math.log10(rms) : -100;
}

// Rééchantillonnage simple (moyenne par fenêtre) : 48 kHz → 16 kHz suffit à la transcription.
export function sousEchantillonner(echantillons, de, vers = 16000) {
  if (de === vers) return Float32Array.from(echantillons);
  const rapport = de / vers;
  const n = Math.floor(echantillons.length / rapport);
  const sortie = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * rapport), b = Math.max(a + 1, Math.floor((i + 1) * rapport));
    let s = 0;
    for (let j = a; j < b; j++) s += echantillons[j];
    sortie[i] = s / (b - a);
  }
  return sortie;
}

// Fichier WAV PCM 16 bits mono à partir d'échantillons -1..1.
export function wavMono16(echantillons, frequence = 16000) {
  const n = echantillons.length;
  const wav = new Uint8Array(44 + n * 2);
  const v = new DataView(wav.buffer);
  const texte = (pos, s) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texte(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); texte(8, "WAVE");
  texte(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, frequence, true); v.setUint32(28, frequence * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  texte(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, echantillons[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return wav;
}

// ---------- Découpage par silences
// Un détecteur de niveau simple : est « parole » un bloc au-dessus du seuil (le plus haut de seuilDb et du bruit de fond estimé
// + margeDb). Un segment commence à la première parole (avec un peu de son d'avant), finit après silenceFin secondes de silence,
// ou de force à maxSegment secondes (la parole continue alors dans un nouveau segment). Un segment avec moins de minParole
// secondes de parole (un clic, une toux) est jeté. Le bruit de fond suit les silences (vite vers le bas, lentement vers le haut) ;
// un son continu de 15 s sans aucun creux (musique, ventilateur qui démarre) devient le nouveau bruit de fond.
// ajouter(blocs, db) rend la liste des segments finis : [{ echantillons: Float32Array, duree, parole, force }].
export const DECOUPAGE = { frequence: 16000, seuilDb: -48, margeDb: 12, silenceFin: 0.7, avant: 0.3, minParole: 0.4, maxSegment: 15 };

export class DecoupeurSilences {
  constructor(options = {}) {
    this.o = { ...DECOUPAGE, ...options };
    this.bruit = null;
    this.avant = [];        // blocs d'avant la parole (au plus o.avant secondes)
    this.dureeAvant = 0;
    this.segment = null;    // { blocs, duree, parole, silence }
  }

  seuil() {
    return Math.max(this.o.seuilDb, (this.bruit ?? -100) + this.o.margeDb);
  }

  ajouter(bloc, db = niveauDb(bloc)) {
    const duree = bloc.length / this.o.frequence;
    const voix = db >= this.seuil();
    if (!this.segment && (this.bruit === null || !voix)) this.bruit = this.bruit === null || db < this.bruit ? db : this.bruit + (db - this.bruit) * 0.02;
    const finis = [];
    if (!this.segment) {
      if (!voix) {
        this.avant.push(bloc);
        this.dureeAvant += duree;
        while (this.avant.length > 1 && this.dureeAvant - this.avant[0].length / this.o.frequence >= this.o.avant) {
          this.dureeAvant -= this.avant.shift().length / this.o.frequence;
        }
        return finis;
      }
      this.segment = { blocs: [...this.avant], duree: this.dureeAvant, parole: 0, silence: 0, creux: db };
      this.avant = [];
      this.dureeAvant = 0;
    }
    const s = this.segment;
    s.blocs.push(bloc);
    s.duree += duree;
    s.creux = Math.min(s.creux, db);
    if (voix) { s.parole += duree; s.silence = 0; } else s.silence += duree;
    if (s.silence >= this.o.silenceFin) {
      const fini = this.#clore(false);
      if (fini) finis.push(fini);
    } else if (s.duree >= this.o.maxSegment) {
      this.bruit = Math.max(this.bruit ?? -100, s.creux);
      const fini = this.#clore(true);
      if (fini) finis.push(fini);
      if (voix) this.segment = { blocs: [], duree: 0, parole: 0, silence: 0, creux: db };   // il parle encore : la suite
    }
    return finis;
  }

  // Fin de l'écoute : le segment en cours, s'il vaut quelque chose.
  vider() {
    if (!this.segment) return [];
    const fini = this.#clore(false);
    return fini ? [fini] : [];
  }

  #clore(force) {
    const s = this.segment;
    this.segment = null;
    if (!s || s.parole < this.o.minParole) return null;
    const total = s.blocs.reduce((t, b) => t + b.length, 0);
    const echantillons = new Float32Array(total);
    let pos = 0;
    for (const b of s.blocs) { echantillons.set(b, pos); pos += b.length; }
    return { echantillons, duree: total / this.o.frequence, parole: s.parole, force };
  }
}

// ---------- Ce qu'on garde d'une transcription
// Phrases que les modèles de transcription inventent sur un silence ou un bruit (sous-titres, remerciements).
const HALLUCINATIONS = [
  /sous-titr/i, /amara\.org/i, /merci d'avoir regard/i, /abonnez-vous/i, /^\s*(merci|merci\.?)\s*$/i, /^\s*\.+\s*$/,
  /^\s*(\[.*\]|\(.*\))\s*$/, /jeu de rôle autour d'une table/i
];

export function transcriptionUtile(texte) {
  const t = String(texte ?? "").replace(/\s+/g, " ").trim();
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return "";
  if (HALLUCINATIONS.some(r => r.test(t))) return "";
  return t;
}

const motsDe = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// Écho : le micro d'un joueur sans casque reprend la voix d'une IA qui vient de parler. Une transcription dont l'essentiel des
// mots (au moins 60 %, et 3 mots) vient d'une réplique dite dans les `fenetre` dernières secondes est jetée : sinon les
// compagnons se répondraient à eux-mêmes. recents : [{ texte, quand (ms) }].
export function estEcho(texte, recents = [], maintenant = Date.now(), fenetre = 30) {
  const m = motsDe(texte);
  if (m.length < 3) return false;
  return recents.some(r => {
    if (maintenant - (r.quand ?? 0) > fenetre * 1000) return false;
    const dit = new Set(motsDe(r.texte));
    return m.filter(x => dit.has(x)).length / m.length >= 0.6;
  });
}

// ---------- Routage d'une phrase transcrite
// Entrée :
//   seanceIA : une séance du MJ IA est lancée (le narrateur écoute) ;
//   audibilite : réponse du système à « qui entend ce joueur » (game.lakourLoups.audibilite(userId) : { peutParler, auditeurs,
//     acteursAuditeurs? }), ou null hors des Veillées (40k, Warcraft : tout le monde entend tout le monde) ;
//   locuteur : id de l'utilisateur qui parle ;
//   compagnons : [{ id, nom, vivant, meute }] (meute : camp « meute ») ;
//   utilisateurs : [{ id, nom, active, isGM, vivant, meute }] (vivant, meute : d'après le villageois du joueur, aux Veillées) ;
//   phase : phase publique des Veillées (« nuit »…), sinon "".
// Sortie : { transcrire, versMJ, restreint, nomsAuditeurs, acteursAuditeurs, declencher }.
//   transcrire : au moins une IA doit l'entendre (sinon aucun appel n'est fait) ;
//   versMJ : le MJ IA la reçoit dans sa file ; restreint : tous ne l'entendent pas (le MJ IA en est prévenu) ;
//   acteursAuditeurs : les compagnons qui l'ajoutent à ce qu'ils savent ; declencher : elle peut les faire répondre.
//   audibiliteActeur : game.lakourLoups.audibiliteActeur, s'il existe (sert à la déduction prudente).
export function routerParole({ seanceIA = false, audibilite = null, audibiliteActeur = null, locuteur = "", compagnons = [], utilisateurs = [], phase = "" } = {}) {
  const rien = { transcrire: false, versMJ: false, restreint: false, nomsAuditeurs: [], acteursAuditeurs: [], declencher: false };
  if (audibilite && audibilite.peutParler === false) return rien;     // la nuit pour qui ne doit rien dire, un réduit au silence
  let acteurs, restreint = false, nomsAuditeurs = [];
  if (!audibilite) {
    acteurs = compagnons.map(c => c.id);
  } else {
    const auditeurs = new Set(Array.isArray(audibilite.auditeurs) ? audibilite.auditeurs : []);
    const autres = utilisateurs.filter(u => u.active && !u.isGM && u.id !== locuteur);
    restreint = autres.some(u => !auditeurs.has(u.id));
    nomsAuditeurs = utilisateurs.filter(u => auditeurs.has(u.id) && u.id !== locuteur).map(u => u.nom);
    const ids = new Set(compagnons.map(c => c.id));
    acteurs = Array.isArray(audibilite.acteursAuditeurs)
      ? audibilite.acteursAuditeurs.filter(id => ids.has(id))
      : deduireActeursAuditeurs({ auditeurs, locuteur, compagnons, utilisateurs, phase, restreint, audibiliteActeur });
  }
  const versMJ = Boolean(seanceIA);
  return { transcrire: versMJ || acteurs.length > 0, versMJ, restreint, nomsAuditeurs, acteursAuditeurs: acteurs, declencher: acteurs.length > 0 };
}

// Quand le système ne dit pas quels compagnons entendent (pas d'acteursAuditeurs), on le déduit prudemment. Un compagnon entend :
// - si tout le monde entend ;
// - ou si un joueur humain dans la même situation que lui (vivant ou mort ; la nuit, loup ou non) fait partie des auditeurs ;
// - ou, à l'envers, si le locuteur entend ce compagnon (audibiliteActeur) et que le locuteur est vivant ou le compagnon mort :
//   entre loups la nuit, entre vivants le jour, entre morts, l'écoute va dans les deux sens ; un vivant n'entend jamais un mort.
// Un compagnon réduit au silence (de jour, vivant) entend comme un vivant. Dans le doute, il n'entend pas : mieux vaut un
// compagnon sourd qu'un secret qui fuit.
export function deduireActeursAuditeurs({ auditeurs, locuteur = "", compagnons = [], utilisateurs = [], phase = "", restreint = true, audibiliteActeur = null }) {
  if (!restreint) return compagnons.map(c => c.id);
  const nuit = phase === "nuit";
  const situation = x => `${x.vivant === false ? "mort" : "vivant"}${nuit && x.vivant !== false ? (x.meute ? "|meute" : "|village") : ""}`;
  const entendues = new Set(utilisateurs.filter(u => !u.isGM && u.id !== locuteur && auditeurs.has(u.id)).map(situation));
  const parleur = utilisateurs.find(u => u.id === locuteur);
  const aRebours = c => {
    if (typeof audibiliteActeur !== "function") return false;
    let a;
    try { a = audibiliteActeur(c.id); } catch { return false; }
    if (!a || a.peutParler === false) return false;
    return Array.isArray(a.auditeurs) && a.auditeurs.includes(locuteur) && (c.vivant === false || parleur?.vivant !== false);
  };
  return compagnons.filter(c => entendues.has(situation(c)) || aRebours(c)).map(c => c.id);
}

// La ligne que reçoit le MJ IA (jamais publiée dans le chat des joueurs).
export function ligneParole({ nom, texte }, { restreint = false, nomsAuditeurs = [] } = {}) {
  const qui = restreint
    ? `${nom} (à voix haute, entendu seulement de ${nomsAuditeurs.length ? nomsAuditeurs.join(", ") : "personne d'autre"} : n'y réponds pas devant les autres)`
    : `${nom} (à voix haute)`;
  return `🗣️ ${qui} : ${texte}`;
}
