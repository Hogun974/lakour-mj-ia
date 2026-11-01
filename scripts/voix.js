import { ID, MODELE_VOIX } from "./constantes.js";
import { lire } from "./reglages.js";
import { fournisseurImages, expliquerErreur } from "./fournisseurs/index.js";
import { versTexte, deposerFichier } from "./utilitaires.js";
import { decouperPourVoix, choisirVoix, morceauxPrets, planAttenuation, wavDepuisPcm } from "./voix-texte.js";
import { voixDe } from "./personnalites.js";
import {
  Calendrier, RecepteurFlux, FileDesVoix, destinatairesVoix, dureePcm, voixPourCompagnon, tonPourCompagnon, paroleSeule,
  FREQUENCE_VOIX, FLUX_MUET_S
} from "./voix-flux.js";
import { envoyer, recevoir, estMJActif, ecouterCanal } from "./canal.js";

// Voix des IA (narrateur et compagnons). Trois modes, au choix du MJ (réglage « voix ») :
//  - aucune ;
//  - navigateur : chaque client lit lui-même la narration avec une voix installée (gratuit) ;
//  - openai : le navigateur du MJ fait dire le texte par l'API Realtime (sa clé OpenAI) et ENVOIE CHAQUE MORCEAU de son dès sa
//    réception aux navigateurs qui doivent l'entendre (canal du MJ IA) ; chacun le joue aussitôt (WebAudio, petite mémoire
//    tampon). Le WAV complet est ensuite déposé dans Data, seulement pour la réécoute (bouton 🔊). Si le flux échoue, repli sur
//    l'ancien chemin : fichier entier déposé puis joué par Foundry (docs/voix-et-ecoute.md §1).
// Une seule voix à la fois (file d'attente, le narrateur avant les compagnons). Chaque joueur peut couper la voix chez lui
// (réglage client « entendreNarration ») et régler son volume (« volumeVoix »).

// Message de narration finale, public, du MJ IA ?
export const estNarrationAudible = message => {
  const f = message.flags?.[ID];
  return Boolean(f?.narration && f?.final && !message.whisper?.length);
};

// ---------- Mode navigateur (chaque client)

export function lireNavigateur(message) {
  if (!("speechSynthesis" in window) || !lire("entendreNarration")) return;
  const voix = choisirVoix(speechSynthesis.getVoices(), lire("voixNavigateur"));
  for (const morceau of decouperPourVoix(versTexte(message.content))) {
    const enonce = new SpeechSynthesisUtterance(morceau);
    if (voix) enonce.voice = voix;
    enonce.lang = voix?.lang ?? "fr-FR";
    enonce.rate = lire("vitesseVoix");
    enonce.volume = lire("volumeVoix");
    speechSynthesis.speak(enonce);
  }
}

export function taireNavigateur() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// ---------- Mode OpenAI, côté MJ actif : la file des voix et les tours de parole

const file = new FileDesVoix();
// Résolue quand plus aucune voix d'IA ne parle ni n'attend (pilote automatique).
export const voixAuRepos = () => file.attendreRepos();

// Répliques d'IA dites récemment : la transcription jette l'écho d'une voix reprise par le micro d'un joueur (ecoute.js, estEcho).
export const ditsRecents = [];
function noterDit(texte) {
  ditsRecents.push({ texte: String(texte), quand: Date.now() });
  while (ditsRecents.length > 20) ditsRecents.shift();
}

const moteur = () => game.modules.get(ID)?.api?.moteur;
const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
// Voix OpenAI possible : une clé OpenAI, et le budget de la séance pas atteint. Sinon : voix du navigateur ou texte seul.
function fournisseurVoix() {
  const f = fournisseurImages();
  if (!f || moteur()?.budgetDepasse?.()) return null;
  return f;
}
const pause = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const actifs = () => game.users.filter(u => u.active).map(u => ({ id: u.id, active: true, isGM: u.isGM }));

let erreurVue = false;
function signalerUneFois(erreur) {
  console.error(`${ID} | voix`, erreur);
  if (!erreurVue) ui.notifications.error(expliquerErreur(erreur));
  erreurVue = true;
}

// Un tour de parole : une voix (narrateur ou compagnon), un ou plusieurs énoncés dits à la suite, un seul flux chez les joueurs.
// La synthèse d'un énoncé commence dès qu'il est donné ; ses morceaux sont gardés jusqu'à ce que la parole soit prise (file des
// voix) et le texte affiché (attendre), puis envoyés au fil de l'eau. Le MJ estime la fin de la lecture chez les joueurs avec
// le même calendrier qu'eux, et ne rend la parole qu'ensuite (l'ambiance est baissée pendant ce temps).
class TourDeParole {
  constructor({ priorite, voix, ton, destinataires, attendre = null, fournisseur, enDirect = true }) {
    Object.assign(this, { priorite, voix, ton, destinataires, attendre, fournisseur, enDirect });
    this.flux = foundry.utils.randomID();
    this.cle = foundry.utils.randomID();
    this.n = 0;
    this.ouvert = false;
    this.sortie = [];
    this.horloge = new Calendrier();
    this.chemins = [];
    this.depots = [];
    this.generation = Promise.resolve();
    this.nombre = 0;
    this.pret = null;
    this.liberer = null;
    this.fin = null;
    this.veille = null;
  }

  dire(texte) {
    const i = this.nombre++;
    clearTimeout(this.veille);
    this.generation = this.generation.then(() => this.#generer(texte, i));
    // Garde-fou : un tour que personne ne termine (panne au milieu d'un tour du MJ) rend la parole de lui-même.
    this.generation.then(() => {
      this.veille = setTimeout(() => this.terminer(null), 30000);
      this.veille?.unref?.();   // (Node, essais : ne retient pas le processus)
    });
    return this.generation;
  }

  // La parole (une seule voix à la fois), puis l'affichage du texte ; alors le flux s'ouvre chez les destinataires.
  #prendre() {
    this.pret ??= (async () => {
      this.liberer = await file.prendre(this.priorite);
      try { await this.attendre; } catch { /* l'affichage a échoué : la voix parle quand même */ }
      await attenuerAmbiance().catch(() => {});
      if (this.enDirect) envoyer({ type: "voix-debut", flux: this.flux, priorite: this.priorite }, this.destinataires);
      this.ouvert = true;
      this.#vider();
    })();
    return this.pret;
  }

  #emettre(b64) {
    this.sortie.push(b64);
    if (this.ouvert) this.#vider();
  }

  #vider() {
    for (const pcm of this.sortie.splice(0)) {
      envoyer({ type: "voix-morceau", flux: this.flux, n: this.n++, pcm }, this.destinataires);
      this.horloge.planifier(Date.now() / 1000, dureePcm(pcm));
    }
  }

  async #generer(texte, i) {
    const prise = this.#prendre();
    const modele = reglage("modeleVoix", MODELE_VOIX) || MODELE_VOIX;
    if (this.enDirect) {
      try {
        const r = await this.fournisseur.voixEnFlux({ texte, modele, voix: this.voix, ton: this.ton, surMorceau: b64 => this.#emettre(b64) });
        noterDit(texte);
        if (r.blob) return await this.#jouerFichier(r.blob, i, prise);
        if (r.erreur) signalerUneFois(r.erreur);
        this.depots.push(this.#deposer(new Blob([wavDepuisPcm(r.morceaux, FREQUENCE_VOIX)], { type: "audio/wav" }), i));
        return;
      } catch (erreur) {
        // Le flux a échoué avant le moindre son : repli sur le fichier entier (chemin d'avant).
        console.warn(`${ID} | voix en direct impossible, repli sur le fichier :`, erreur?.message ?? erreur);
      }
    }
    try {
      const blob = await this.fournisseur.genererVoix({ texte, modele, voix: this.voix, ton: this.ton });
      noterDit(texte);
      await this.#jouerFichier(blob, i, prise);
    } catch (erreur) {
      signalerUneFois(erreur);
    }
  }

  async #deposer(blob, i) {
    try {
      const nom = `${this.cle}-${i}.${blob.type === "audio/wav" ? "wav" : "mp3"}`;
      return (this.chemins[i] = await deposerFichier(`voix/${game.world.id}`, nom, new File([blob], nom, { type: blob.type })));
    } catch (erreur) {
      console.error(`${ID} | dépôt de la voix`, erreur);
      return null;
    }
  }

  // Repli : le fichier entier, déposé puis joué par Foundry chez les destinataires, après ce qui joue encore en direct.
  async #jouerFichier(blob, i, prise) {
    const chemin = await this.#deposer(blob, i);
    await prise;
    await pause(this.horloge.restant(Date.now() / 1000) * 1000);
    if (!chemin) return;
    // Jamais une liste vide : Foundry diffuserait alors à tous.
    const autres = this.destinataires.filter(id => id !== game.user.id);
    await jouerTousLesMorceaux([chemin], autres.length ? { recipients: autres } : false);
  }

  // Quand tout est dit : fin du flux, attente de la fin de la lecture chez les joueurs, parole rendue ; les fichiers de réécoute
  // sont rattachés au message (bouton 🔊). Plusieurs appels n'en font qu'un (le garde-fou peut passer avant le moteur).
  async terminer(message) {
    clearTimeout(this.veille);
    this.fin ??= (async () => {
      await this.generation;
      if (!this.pret) return;
      await this.pret;
      if (this.enDirect) envoyer({ type: "voix-fin", flux: this.flux, total: this.n }, this.destinataires);
      await pause(this.horloge.restant(Date.now() / 1000) * 1000 + 300);
      await rendreAmbiance().catch(() => {});
      this.liberer?.();
    })();
    await this.fin;
    await Promise.all(this.depots);
    const chemins = this.chemins.filter(Boolean);
    if (message && chemins.length) await message.setFlag(ID, "audio", chemins);
  }
}

// La voix du narrateur, en direct pendant que la narration s'écrit : chaque phrase part à la synthèse dès qu'elle est écrite.
// attendre : promesse avant laquelle rien n'est entendu (narration préparée mais pas encore affichée).
// Sans clé OpenAI ou budget atteint : la narration est marquée « repli », et chaque navigateur la lit avec sa propre voix.
let avertiSansCle = false;
export class VoixEnDirect {
  constructor(personnalite, { attendre = null } = {}) {
    const fournisseur = fournisseurVoix();
    if (!fournisseur && !fournisseurImages() && !avertiSansCle) {
      avertiSansCle = true;
      ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasDeCleVoix"));
    }
    this.repli = !fournisseur;
    this.voix = voixDe(personnalite);
    this.tour = fournisseur
      ? new TourDeParole({ priorite: "narrateur", ...this.voix, destinataires: actifs().map(u => u.id), attendre, fournisseur,
        enDirect: reglage("voixDirecte", true) !== false })
      : null;
    this.pris = 0;
    this.nombre = 0;
  }

  // À chaque morceau de texte reçu, puis une dernière fois avec final = true.
  suivre(texte, final = false) {
    if (!this.tour) return;
    const { morceaux, pris } = morceauxPrets(texte, this.pris, { final, premier: this.nombre === 0 });
    this.pris = pris;
    for (const morceau of morceaux) {
      this.nombre++;
      this.tour.dire(morceau);
    }
  }

  async terminer(message) {
    if (this.tour) return this.tour.terminer(message);
    if (message && this.repli) await message.setFlag(ID, "repliNavigateur", true);
  }
}

// La voix d'un compagnon : choisie une fois selon son tempérament (ni celle du narrateur, ni celle d'un autre compagnon si
// possible), mémorisée sur l'acteur (drapeau « voix »).
export async function voixDuCompagnon(acteur) {
  const memo = acteur.flags?.[ID]?.voix;
  if (memo?.voix) return memo;
  const perso = acteur.flags?.[ID]?.compagnon ?? {};
  const personnalites = reglage("personnalites", []);
  const narrateur = personnalites.find(p => p.id === reglage("personnaliteActive", "")) ?? personnalites[0];
  const prises = game.actors.filter(a => a.id !== acteur.id && a.flags?.[ID]?.voix?.voix).map(a => a.flags[ID].voix.voix);
  const choix = {
    voix: voixPourCompagnon(perso, { graine: acteur.id, prises, voixNarrateur: narrateur ? voixDe(narrateur).voix : "" }),
    ton: tonPourCompagnon(perso)
  };
  try { await acteur.setFlag(ID, "voix", choix); } catch (e) { console.warn(`${ID} | voix du compagnon non mémorisée`, e); }
  return choix;
}

// Une réplique de compagnon dite à voix haute (sa parole seule, pas la didascalie), seulement à ceux qui peuvent l'entendre.
// Mode OpenAI seulement ; sans clé ou budget atteint : texte seul.
export async function direReplique(acteur, texte, message = null) {
  if (reglage("voix", "aucune") !== "openai" || !estMJActif() || !acteur) return;
  const parole = paroleSeule(texte);
  if (!parole) return;
  const fournisseur = fournisseurVoix();
  if (!fournisseur) return;
  const loups = game.system?.id === "lakour-loups" ? game.lakourLoups : null;
  const destinataires = destinatairesVoix({
    type: "compagnon", acteurId: acteur.id, utilisateurs: actifs(),
    audibiliteActeur: typeof loups?.audibiliteActeur === "function" ? id => loups.audibiliteActeur(id) : null
  });
  if (!destinataires.length) return;
  const { voix, ton } = await voixDuCompagnon(acteur);
  const tour = new TourDeParole({ priorite: "compagnon", voix, ton, destinataires, fournisseur, enDirect: reglage("voixDirecte", true) !== false });
  tour.dire(parole);
  await tour.terminer(message);
}

// ---------- Mode OpenAI, dans chaque navigateur : la lecture des morceaux reçus

// Lecteur WebAudio : morceaux PCM 24 kHz joués à la suite sur une seule ligne de temps (deux voix ne se chevauchent jamais),
// dans le contexte « interface » de Foundry (son volume général s'applique), au volume de la voix choisi par le joueur.
class LecteurVoix {
  constructor() {
    this.recepteur = new RecepteurFlux();
    this.calendrier = new Calendrier();
    this.sources = new Set();
    this.ctx = null;
    this.gain = null;
  }

  contexte() {
    if (game.audio?.locked) return null;   // aucun geste encore dans cette page : le navigateur interdit le son
    const ctx = game.audio?.interface;
    if (!ctx) return null;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.gain = ctx.createGain();
      this.gain.connect(ctx.gainNode ?? ctx.destination);
      this.calendrier.vider();
    }
    this.gain.gain.value = 0.9 * Math.max(0, Math.min(1, Number(reglage("volumeVoix", 1)) || 0));
    return ctx;
  }

  debut({ flux }) {
    if (!reglage("entendreNarration", true)) return;
    const ctx = this.contexte();
    if (!ctx) return;
    this.recepteur.nettoyer(ctx.currentTime, FLUX_MUET_S);
    this.recepteur.debut(flux, ctx.currentTime);
  }

  morceau({ flux, n, pcm }) {
    const ctx = this.ctx;
    if (!ctx || !this.recepteur.morceau(flux, n, ctx.currentTime)) return;
    try {
      const octets = Uint8Array.from(atob(pcm), c => c.charCodeAt(0));
      const vue = new DataView(octets.buffer);
      const n16 = octets.length >> 1;
      if (!n16) return;
      const tampon = ctx.createBuffer(1, n16, FREQUENCE_VOIX);
      const canal = tampon.getChannelData(0);
      for (let i = 0; i < n16; i++) canal[i] = vue.getInt16(i * 2, true) / 32768;
      const debut = this.calendrier.planifier(ctx.currentTime, tampon.duration);
      if (debut === null) return;   // trop d'avance : mémoire bornée
      const source = ctx.createBufferSource();
      source.buffer = tampon;
      source.connect(this.gain);
      source.onended = () => { this.sources.delete(source); source.disconnect(); };
      this.sources.add(source);
      source.start(debut);
    } catch (erreur) {
      console.warn(`${ID} | morceau de voix illisible`, erreur);
    }
  }

  fin({ flux, total }) {
    const bilan = this.recepteur.fin(flux, total);
    if (bilan?.pertes) console.warn(`${ID} | voix : ${bilan.pertes} morceau(x) perdu(s) sur ${bilan.recus + bilan.pertes}`);
  }

  // Le joueur coupe la voix : tout s'arrête net chez lui.
  couper() {
    for (const s of this.sources) { try { s.stop(); } catch { /* déjà fini */ } }
    this.sources.clear();
    this.calendrier.vider();
    this.recepteur = new RecepteurFlux();
  }
}

const lecteur = new LecteurVoix();
export const couperVoix = () => lecteur.couper();

// Messages du canal (acceptés seulement s'ils viennent d'un MJ : canal.js).
export function brancherVoixDirecte() {
  ecouterCanal();
  recevoir("voix-debut", m => lecteur.debut(m));
  recevoir("voix-morceau", m => lecteur.morceau(m));
  recevoir("voix-fin", m => lecteur.fin(m));
}

// ---------- Ambiance sonore baissée pendant qu'une IA parle. C'est le MJ qui modifie le volume des pistes de la playlist
// « Ambiances (MJ IA) » : Foundry répercute ce volume chez chaque joueur. Volumes d'origine mémorisés ici, rendus quand plus
// aucune voix ne parle.
const attenuees = {};
let voixEnCours = 0;

function pistesAmbiance() {
  return game.playlists?.find(p => p.getFlag(ID, "ambiances"))?.sounds.contents ?? [];
}

async function attenuerAmbiance() {
  voixEnCours++;
  if (!game.user.isGM) return;
  const plan = planAttenuation(pistesAmbiance().map(s => ({ id: s.id, playing: s.playing, volume: s.volume })), attenuees);
  const pistes = pistesAmbiance();
  for (const { id, origine, pendant } of plan) {
    attenuees[id] = origine;
    const piste = pistes.find(s => s.id === id);
    if (piste && piste.volume !== pendant) await piste.update({ volume: pendant });
  }
}

async function rendreAmbiance() {
  voixEnCours = Math.max(0, voixEnCours - 1);
  if (voixEnCours || !game.user.isGM) return;
  const pistes = pistesAmbiance();
  for (const [id, origine] of Object.entries(attenuees)) {
    delete attenuees[id];
    const piste = pistes.find(s => s.id === id);
    if (piste?.playing) await piste.update({ volume: origine });
  }
}

// Joue des fichiers l'un après l'autre (repli et réécoute). diffuser : true (tous les joueurs connectés) ou { recipients } ;
// faux = pour soi seul (bouton 🔊). En diffusion, l'ambiance est baissée pendant ce temps.
export async function jouerTousLesMorceaux(chemins, diffuser) {
  if (diffuser) await attenuerAmbiance().catch(() => {});
  try {
    for (const src of chemins) {
      const son = await foundry.audio.AudioHelper.play({ src, volume: 0.9, autoplay: true, loop: false }, diffuser);
      if (son?.duration) await new Promise(resolve => setTimeout(resolve, son.duration * 1000 + 150));
    }
  } finally {
    if (diffuser) await rendreAmbiance().catch(() => {});
  }
}
