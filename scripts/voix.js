import { ID, MODELE_VOIX } from "./constantes.js";
import { lire } from "./reglages.js";
import { fournisseurImages, expliquerErreur } from "./fournisseurs/index.js";
import { versTexte, deposerFichier } from "./utilitaires.js";
import { decouperPourVoix, choisirVoix, morceauxPrets } from "./voix-texte.js";
import { voixDe } from "./personnalites.js";

// Voix du narrateur. Deux modes, au choix du MJ (réglage « voix ») :
//  - navigateur : chaque client lit lui-même la narration avec une voix installée (gratuit) ;
//  - openai : le navigateur du MJ fait générer l'audio (sa clé OpenAI), le dépose dans Data et le
//    diffuse à tous ; le fichier reste, un bouton du chat permet de le réécouter.
// Chaque joueur peut couper la voix chez lui (réglage client « entendreNarration »).

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

// ---------- Mode OpenAI (navigateur du MJ, puis diffusion), en direct : chaque phrase est envoyée à la synthèse
// dès qu'elle est écrite et lue aussitôt prête, pendant que la suite s'écrit. Les fichiers restent dans Data
// (bouton 🔊 pour réécouter).

export class VoixEnDirect {
  // Une seule file de lecture pour toutes les narrations : la suivante attend la fin de la précédente.
  static lecture = Promise.resolve();

  // attendre : promesse avant laquelle rien n'est lu (narration préparée mais pas encore affichée).
  constructor(personnalite, { attendre = null } = {}) {
    this.attendre = attendre;
    this.fournisseur = fournisseurImages();
    if (!this.fournisseur) ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasDeCleVoix"));
    this.voix = voixDe(personnalite);
    this.cle = foundry.utils.randomID();
    this.pris = 0;
    this.nombre = 0;
    this.chemins = [];
    this.generation = Promise.resolve();
    this.erreurVue = false;
  }

  // À chaque morceau de texte reçu, puis une dernière fois avec final = true.
  suivre(texte, final = false) {
    if (!this.fournisseur) return;
    const { morceaux, pris } = morceauxPrets(texte, this.pris, { final, premier: this.nombre === 0 });
    this.pris = pris;
    for (const morceau of morceaux) this.#lancer(morceau);
  }

  // Synthèses l'une après l'autre (dans l'ordre du texte) ; lecture dès que chacune est prête.
  #lancer(texte) {
    const i = this.nombre++;
    const fichier = this.generation = this.generation.then(() => this.#generer(texte, i));
    VoixEnDirect.lecture = VoixEnDirect.lecture
      .then(async () => { const chemin = await fichier; await this.attendre; if (chemin) await jouerTousLesMorceaux([chemin], true); })
      .catch(e => console.error(`${ID} | lecture de la voix`, e));
  }

  async #generer(texte, i) {
    try {
      const blob = await this.fournisseur.genererVoix({ texte, modele: lire("modeleVoix") || MODELE_VOIX, ...this.voix });
      const nom = `${this.cle}-${i}.${blob.type === "audio/wav" ? "wav" : "mp3"}`;
      return (this.chemins[i] = await deposerFichier(`voix/${game.world.id}`, nom, new File([blob], nom, { type: blob.type })));
    } catch (erreur) {
      console.error(`${ID} | voix`, erreur);
      if (!this.erreurVue) ui.notifications.error(expliquerErreur(erreur));
      this.erreurVue = true;
      return null;
    }
  }

  // Quand tout est généré : les fichiers sont rattachés au message, pour le bouton « réécouter ».
  async terminer(message) {
    await this.generation;
    const chemins = this.chemins.filter(Boolean);
    if (message && chemins.length) await message.setFlag(ID, "audio", chemins);
  }
}

// Joue les morceaux l'un après l'autre ; diffuser = pour tous les joueurs connectés.
export async function jouerTousLesMorceaux(chemins, diffuser) {
  for (const src of chemins) {
    const son = await foundry.audio.AudioHelper.play({ src, volume: 0.9, autoplay: true, loop: false }, diffuser);
    if (son?.duration) await new Promise(resolve => setTimeout(resolve, son.duration * 1000 + 150));
  }
}
