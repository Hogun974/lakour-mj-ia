import { ID, MODELE_VOIX, DOSSIER_DONNEES } from "./constantes.js";
import { lire } from "./reglages.js";
import { fournisseurImages, expliquerErreur } from "./fournisseurs/index.js";
import { versTexte, deposerFichier } from "./utilitaires.js";
import { decouperPourVoix, choisirVoix, morceauxPrets, planAttenuation, wavDepuisPcm, AbregeVocal, LONGUEURS_VOIX } from "./voix-texte.js";
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
// Une réplique PRIVÉE (ses destinataires ne sont qu'une partie des connectés : les loups la nuit aux Veillées, un mort qui ne
// parle qu'aux morts…) n'est JAMAIS déposée dans Data (Foundry sert Data/ à qui en connaît l'adresse) : en direct, ses morceaux
// vont aux seuls destinataires ; en repli, le fichier entier aussi, par le canal, découpé (voix-privee), lu chez eux depuis un
// Blob puis libéré ; pas de réécoute. Les anciens fichiers privés sont écrasés par un silence (nettoyerVoixPrivees).
// Une seule voix à la fois, dans l'ordre où les textes paraissent dans le chat (file des voix). Chaque joueur peut couper la voix chez lui
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
  // Même abrégé vocal que la voix OpenAI : l'essentiel, puis la question finale ; le chat garde tout.
  const texte = versTexte(message.content);
  const abrege = new AbregeVocal(LONGUEURS_VOIX[lire("longueurVoix")] ?? LONGUEURS_VOIX.courte);
  const morceaux = decouperPourVoix(texte).filter(m => abrege.garder(m));
  const question = abrege.fin(texte);
  for (const morceau of [...morceaux, ...(question ? [question] : [])]) {
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
  // prive : la réplique ne va qu'à une partie des connectés (jamais déposée dans Data, pas de réécoute).
  constructor({ priorite, voix, ton, destinataires, attendre = null, fournisseur, enDirect = true, prive = false }) {
    Object.assign(this, { priorite, voix, ton, destinataires, attendre, fournisseur, enDirect, prive });
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
      // Le tour se compte à l'affichage du texte : la voix suit le fil du chat (un affichage raté la laisse parler quand même).
      this.liberer = await file.prendre(this.priorite, "", this.attendre);
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
        if (!this.prive) this.depots.push(this.#deposer(new Blob([wavDepuisPcm(r.morceaux, FREQUENCE_VOIX)], { type: "audio/wav" }), i));
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
    if (this.prive) {
      // Jamais dans Data : le fichier entier, par le canal, aux seuls destinataires (trop gros : texte seul, il est au chat).
      await prise;
      await pause(this.horloge.restant(Date.now() / 1000) * 1000);
      await envoyerVoixPrivee(blob, this.destinataires);
      return;
    }
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
    // À l'oral, l'abrégé (réglage « Longueur de la voix ») ; le chat garde tout le texte.
    this.abrege = new AbregeVocal(LONGUEURS_VOIX[reglage("longueurVoix", "courte")] ?? LONGUEURS_VOIX.courte);
  }

  // À chaque morceau de texte reçu, puis une dernière fois avec final = true.
  suivre(texte, final = false) {
    if (!this.tour) return;
    const { morceaux, pris } = morceauxPrets(texte, this.pris, { final, premier: this.nombre === 0 });
    this.pris = pris;
    for (const morceau of morceaux) {
      if (!this.abrege.garder(morceau)) continue;
      this.nombre++;
      this.tour.dire(morceau);
    }
    const question = final ? this.abrege.fin(texte) : "";
    if (question) { this.nombre++; this.tour.dire(question); }
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
  // Privée d'après le public VISÉ (ceux qui peuvent l'entendre) comparé à TOUS les comptes, connectés ou non : un villageois
  // hors ligne la nuit n'en fait pas une réplique publique.
  const comptes = game.users.map(u => u.id);
  let vise = comptes;
  if (typeof loups?.audibiliteActeur === "function") {
    try {
      const a = loups.audibiliteActeur(acteur.id);
      if (a && Array.isArray(a.auditeurs)) vise = [...new Set([...a.auditeurs, ...game.users.filter(u => u.isGM).map(u => u.id)])];
    } catch { vise = []; }
  }
  const prive = estPrivee(vise, comptes);
  const tour = new TourDeParole({ priorite: "compagnon", voix, ton, destinataires, fournisseur, enDirect: reglage("voixDirecte", true) !== false, prive });
  // Une réplique est dite en entier si elle est courte ; sinon son début, puis sa question finale (abrégé vocal).
  const abrege = new AbregeVocal(LONGUEURS_VOIX[reglage("longueurVoix", "courte")] ?? LONGUEURS_VOIX.courte);
  const dits = decouperPourVoix(parole, 220).filter(m => abrege.garder(m));
  const question = abrege.fin(parole);
  tour.dire([...dits, ...(question ? [question] : [])].join(" "));
  await tour.terminer(message);
}

// ---------- Répliques privées : par le canal, jamais dans Data

// Privée : au moins un compte (connecté ou non) n'est pas dans le public visé.
export const estPrivee = (publicVise = [], comptes = []) => comptes.some(id => !publicVise.includes(id));
export const TAILLE_MORCEAU_PRIVE = 256 * 1024;      // caractères base64 par message du canal
export const TAILLE_MAX_PRIVEE = 4 * 1024 * 1024;    // octets ; au-delà, texte seul (la réplique est écrite au chat)
const MORCEAUX_MAX_PRIVES = Math.ceil((TAILLE_MAX_PRIVEE * 4) / 3 / TAILLE_MORCEAU_PRIVE) + 1;
function versBase64(octets) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

// Le fichier entier d'une réplique privée, découpé, aux seuls destinataires (le MJ, s'il en est, le joue chez lui).
// -> le nombre de messages envoyés (0 : rien, trop gros ou personne).
export async function envoyerVoixPrivee(blob, destinataires = [], id = foundry.utils.randomID()) {
  if (!destinataires.length || !blob?.size || blob.size > TAILLE_MAX_PRIVEE) return 0;
  const b64 = versBase64(new Uint8Array(await blob.arrayBuffer()));
  const total = Math.ceil(b64.length / TAILLE_MORCEAU_PRIVE);
  for (let n = 0; n < total; n++) {
    envoyer({ type: "voix-privee", id, n, total, mime: blob.type || "audio/mpeg",
      donnees: b64.slice(n * TAILLE_MORCEAU_PRIVE, (n + 1) * TAILLE_MORCEAU_PRIVE) }, destinataires);
  }
  return total;
}

// Dans le navigateur d'un destinataire : les morceaux d'une voix privée rassemblés ; recevoir rend { mime, octets } quand le
// dernier arrive, null sinon. Un envoi resté incomplet est oublié après `delai` ms.
export class RecepteurPrive {
  constructor(delai = 120000) {
    this.delai = delai;
    this.envois = new Map();
  }

  recevoir({ id, n, total, mime, donnees } = {}, maintenant = Date.now()) {
    for (const [cle, e] of this.envois) if (maintenant - e.quand > this.delai) this.envois.delete(cle);
    if (typeof id !== "string" || typeof donnees !== "string" || !Number.isInteger(total) || !Number.isInteger(n)
      || total < 1 || total > MORCEAUX_MAX_PRIVES || n < 0 || n >= total) return null;
    const e = this.envois.get(id) ?? { total, morceaux: new Array(total), recus: 0, quand: maintenant, mime: String(mime || "audio/mpeg") };
    if (e.total !== total) return null;
    if (e.morceaux[n] === undefined) e.recus++;
    e.morceaux[n] = donnees;
    this.envois.set(id, e);
    if (e.recus < e.total) return null;
    this.envois.delete(id);
    try {
      const binaire = atob(e.morceaux.join(""));
      const octets = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
      return { mime: e.mime, octets };
    } catch { return null; }
  }
}
const recepteurPrive = new RecepteurPrive();

// Lue depuis un Blob (URL.createObjectURL), libérée à la fin (ou en cas d'erreur).
export function jouerVoixPrivee({ mime, octets }) {
  if (!reglage("entendreNarration", true) || typeof Audio === "undefined") return false;
  const url = URL.createObjectURL(new Blob([octets], { type: mime }));
  const audio = new Audio(url);
  audio.volume = 0.9 * Math.max(0, Math.min(1, Number(reglage("volumeVoix", 1)) || 0));
  let libre = false;
  const liberer = () => { if (!libre) { libre = true; URL.revokeObjectURL(url); } };
  audio.addEventListener?.("ended", liberer, { once: true });
  audio.addEventListener?.("error", liberer, { once: true });
  Promise.resolve(audio.play?.()).catch(liberer);
  return true;
}

// Au démarrage du MJ actif, une fois (main.js, réparations) : les fichiers de voix déposés dans Data par les versions
// précédentes qui ne sont pas la réécoute d'une NARRATION publique (seul cas reconnu à coup sûr : réplique de compagnon, qu'elle
// soit chuchotée ou visée à un public restreint par le système, ou message disparu) sont écrasés par un silence (Foundry n'offre
// pas de suppression de fichier côté client) ; leurs messages perdent leur bouton 🔊.
// -> { liste, ecrases, messages } (liste : false si le dossier n'a pas pu être lu).
export async function nettoyerVoixPrivees(messages = game.messages?.contents ?? []) {
  const sousDossier = `voix/${game.world.id}`;
  const norme = c => {
    const t = String(c ?? "").split("?")[0];
    try { return decodeURIComponent(t).replace(/^\/+/, ""); } catch { return t.replace(/^\/+/, ""); }
  };
  let fichiers;
  try {
    fichiers = (await foundry.applications.apps.FilePicker.implementation.browse("data", `${DOSSIER_DONNEES}/${sousDossier}`))?.files ?? [];
  } catch { return { liste: false, ecrases: 0, messages: 0 }; }
  const publics = new Set();
  const autres = [];
  for (const m of messages) {
    const audio = m.flags?.[ID]?.audio;
    if (!Array.isArray(audio) || !audio.length) continue;
    if (!m.whisper?.length && m.flags?.[ID]?.narration) for (const c of audio) publics.add(norme(c));
    else autres.push(m);
  }
  const silence = wavDepuisPcm([], FREQUENCE_VOIX);
  let ecrases = 0;
  for (const f of fichiers) {
    const chemin = norme(f);
    if (publics.has(chemin)) continue;
    const nom = chemin.split("/").pop();
    try {
      await deposerFichier(sousDossier, nom, new File([silence], nom, { type: "audio/wav" }));
      ecrases++;
    } catch (e) { console.warn(`${ID} | voix privée ${nom} non écrasée`, e); }
  }
  let n = 0;
  for (const m of autres) {
    try { await m.unsetFlag(ID, "audio"); n++; } catch { /* message déjà parti */ }
  }
  return { liste: true, ecrases, messages: n };
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
  // Une réplique privée en repli : ses morceaux rassemblés, puis lue depuis un Blob (canal : seulement d'un MJ).
  recevoir("voix-privee", m => {
    const audio = recepteurPrive.recevoir(m);
    return audio ? jouerVoixPrivee(audio) : false;
  });
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
