// Écoute des joueurs : parole → texte (docs/voix-et-ecoute.md §2), dans le navigateur du MJ actif.
// - Seulement quand une IA doit entendre (ecouteActive : séance du MJ IA lancée, ou au moins un compagnon IA vivant), si le MJ
//   ne l'a pas coupée (réglage « ecouteJoueurs »), avec une clé OpenAI et la voix intégrée de Foundry (A/V) en mode audio.
//   Sinon : aucun micro écouté, aucun appel.
// - Le son de chaque utilisateur vient de la voix intégrée : game.webrtc.client.getMediaStreamForUser(userId) (Foundry v14,
//   AVClient ; avec SimplePeer, le flux local pour soi, le flux reçu du pair pour les autres). On sait donc qui parle. Un joueur
//   qui a coupé son micro (ou qui n'appuie pas sur sa touche de parole) n'envoie que du silence : rien n'est transcrit. Seules
//   les pistes audio servent : la voix de Foundry est réglée en « Audio seulement » à La Kour (le mode audio et vidéo marche aussi).
// - Le son est découpé par silences (ecoute.js, DecoupeurSilences), chaque segment est transcrit par l'API OpenAI (modèle
//   « modeleTranscription », le moins cher par défaut), le coût compté au compteur de la séance ou « compagnons hors séance ».
// - Une phrase transcrite devient { userId, nom, texte, quand } : le MJ IA la reçoit dans sa file (jamais dans le chat des
//   joueurs), les compagnons qui pouvaient l'entendre l'ajoutent à ce qu'ils savent (ecoute.js, routerParole), et elle peut les
//   faire répondre (règles de rythme habituelles, sans boucle).
// Chaque navigateur affiche une icône quand l'écoute tourne (réglage monde « ecouteEnCours », écrit par le MJ actif).
import { ID } from "./constantes.js";
import { fournisseurImages, expliquerErreur } from "./fournisseurs/index.js";
import { estMJActif, envoyer, recevoir, ecouterCanal } from "./canal.js";
import { campLoups } from "./utilitaires.js";
import {
  ecouteActive, DecoupeurSilences, niveauDb, sousEchantillonner, wavMono16, coutTranscription, transcriptionUtile, estEcho,
  routerParole, ligneParole, MODELE_TRANSCRIPTION_DEFAUT
} from "./ecoute.js";
import { compagnonsDuMonde, compagnonsPresents, entendreParole } from "./compagnons-jeu.js";
import { ditsRecents } from "./voix.js";

const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};

// Processeur de capture (AudioWorklet) : blocs de 20 ms envoyés au fil principal.
const PROCESSEUR = `class LakourCapture extends AudioWorkletProcessor {
  constructor() { super(); this.taille = Math.round(sampleRate * 0.02); this.bloc = new Float32Array(this.taille); this.pos = 0; }
  process(entrees) {
    const canal = entrees[0] && entrees[0][0];
    if (canal) for (let i = 0; i < canal.length; i++) {
      this.bloc[this.pos++] = canal[i];
      if (this.pos === this.taille) { this.port.postMessage(this.bloc); this.bloc = new Float32Array(this.taille); this.pos = 0; }
    }
    return true;
  }
}
registerProcessor("lakour-capture", LakourCapture);`;

export class EcouteJoueurs {
  // moteur : le MoteurMJ (séance, file, coût, budget) ; sansNarrateur : les compagnons sans narrateur IA (Veillées, MJ humain).
  constructor({ moteur, sansNarrateur = null }) {
    this.moteur = moteur;
    this.sansNarrateur = sansNarrateur;
    this.captures = new Map();   // userId -> { stream, element, source, noeud, muet }
    this.ctx = null;
    this.workletCharge = false;
    this.actif = false;
    this.erreurVue = false;
    this.budgetVu = false;
    this.verification = Promise.resolve();
  }

  // Faut-il écouter, ici et maintenant ?
  doitEcouter() {
    if (!estMJActif() || !reglage("ecouteJoueurs", true)) return false;
    const av = game.webrtc;
    const modes = av?.settings?.constructor?.AV_MODES ?? { AUDIO: 1, AUDIO_VIDEO: 3 };
    if (!av?.client || ![modes.AUDIO, modes.AUDIO_VIDEO].includes(av.mode)) return false;
    if (!fournisseurImages()) return false;
    return ecouteActive({ seanceIA: this.moteur?.actif, compagnonsVivants: compagnonsPresents().length, moduleActif: true });
  }

  // Revue de l'écoute (appelée régulièrement et à chaque changement) : démarre, suit les flux qui arrivent ou changent, arrête.
  verifier() {
    this.verification = this.verification.then(() => this.#verifier()).catch(e => console.error(`${ID} | écoute des joueurs`, e));
    return this.verification;
  }

  async #verifier() {
    const voulu = this.doitEcouter();
    this.actif = voulu;
    if (voulu) await this.#suivreFlux();
    else this.#arreter();
    if (estMJActif() && Boolean(reglage("ecouteEnCours", false)) !== voulu) await game.settings.set(ID, "ecouteEnCours", voulu);
  }

  async #suivreFlux() {
    const client = game.webrtc.client;
    const vus = new Set();
    for (const u of game.users.filter(x => x.active)) {
      let flux = null;
      try { flux = client.getMediaStreamForUser(u.id) ?? null; } catch { flux = null; }
      if (!flux?.getAudioTracks?.().length) continue;
      vus.add(u.id);
      const c = this.captures.get(u.id);
      if (c?.stream === flux) continue;
      if (c) this.#lacher(u.id);
      try { await this.#capturer(u.id, flux); } catch (e) { console.warn(`${ID} | écoute de ${u.name} impossible`, e); }
    }
    for (const id of [...this.captures.keys()]) if (!vus.has(id)) this.#lacher(id);
  }

  async #contexte() {
    if (this.ctx && this.ctx.state !== "closed") {
      if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    this.ctx = new AudioContext();
    this.workletCharge = false;
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async #capturer(userId, stream) {
    const ctx = await this.#contexte();
    const audio = new MediaStream(stream.getAudioTracks());
    // Chrome : le son d'un flux WebRTC distant n'arrive à WebAudio que si le flux est aussi branché à un élément média (muet).
    const element = new Audio();
    element.muted = true;
    element.srcObject = audio;
    element.play?.()?.catch?.(() => {});
    const source = ctx.createMediaStreamSource(audio);
    const decoupeur = new DecoupeurSilences();
    const surBloc = bloc => {
      if (!this.actif) return;
      const db = niveauDb(bloc);
      for (const segment of decoupeur.ajouter(sousEchantillonner(bloc, ctx.sampleRate, 16000), db)) {
        this.traiterSegment(userId, segment).catch(e => console.error(`${ID} | transcription`, e));
      }
    };
    const noeud = await this.#noeud(ctx, surBloc);
    source.connect(noeud);
    // Le nœud n'est appelé que s'il mène à la sortie : par un gain nul (on n'entend rien de plus).
    const muet = ctx.createGain();
    muet.gain.value = 0;
    noeud.connect(muet);
    muet.connect(ctx.destination);
    this.captures.set(userId, { stream, element, source, noeud, muet });
  }

  async #noeud(ctx, surBloc) {
    try {
      if (!this.workletCharge) {
        const url = URL.createObjectURL(new Blob([PROCESSEUR], { type: "text/javascript" }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.workletCharge = true;
      }
      const noeud = new AudioWorkletNode(ctx, "lakour-capture");
      noeud.port.onmessage = e => surBloc(e.data);
      return noeud;
    } catch {
      // Navigateur sans AudioWorklet utilisable : l'ancien ScriptProcessor (blocs de 85 ms environ).
      const noeud = ctx.createScriptProcessor(4096, 1, 1);
      noeud.onaudioprocess = e => surBloc(Float32Array.from(e.inputBuffer.getChannelData(0)));
      return noeud;
    }
  }

  #lacher(userId) {
    const c = this.captures.get(userId);
    if (!c) return;
    this.captures.delete(userId);
    for (const n of [c.source, c.noeud, c.muet]) { try { n.disconnect(); } catch { /* déjà débranché */ } }
    if (c.noeud?.port) c.noeud.port.onmessage = null;
    try { c.element.pause?.(); c.element.srcObject = null; } catch { /* rien */ }
  }

  #arreter() {
    for (const id of [...this.captures.keys()]) this.#lacher(id);
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  // Le nom donné aux IA : le personnage (villageois aux Veillées) et le joueur.
  nomDe(userId) {
    const u = game.users.get(userId);
    const loups = game.system?.id === "lakour-loups" ? game.lakourLoups : null;
    const perso = loups?.villageois?.().find(a => a.system?.joueur === userId)?.name ?? u?.character?.name ?? "";
    return perso && perso !== u?.name ? `${perso} (${u?.name ?? "?"})` : (u?.name ?? "?");
  }

  // Qui doit entendre ce joueur (calculé au moment où il parle).
  route(userId) {
    const loups = game.system?.id === "lakour-loups" ? game.lakourLoups : null;
    let audibilite = null;
    if (typeof loups?.audibilite === "function") {
      // Une question qui échoue : prudence, personne.
      try { audibilite = loups.audibilite(userId) ?? null; } catch { audibilite = { peutParler: false, auditeurs: [] }; }
    }
    const villageois = loups?.villageois?.() ?? [];
    const compagnons = (loups ? compagnonsDuMonde() : compagnonsPresents())
      .map(a => ({ id: a.id, nom: a.name, vivant: a.system?.vivant !== false, meute: campLoups(a, loups) === "meute" }));
    // Les camps : les secrets du MJ actif (système 0.9.0), jamais les documents.
    const utilisateurs = game.users.map(u => {
      const v = villageois.find(a => a.system?.joueur === u.id);
      return { id: u.id, nom: v?.name ?? u.name, active: u.active, isGM: u.isGM, vivant: v ? v.system?.vivant !== false : true, meute: Boolean(v) && campLoups(v, loups) === "meute" };
    });
    let phase = "";
    try { phase = loups?.etat?.().phase ?? ""; } catch { /* état illisible */ }
    return routerParole({
      seanceIA: Boolean(this.moteur?.actif), audibilite, locuteur: userId, compagnons, utilisateurs, phase,
      audibiliteActeur: typeof loups?.audibiliteActeur === "function" ? id => loups.audibiliteActeur(id) : null
    });
  }

  // Noms propres donnés au modèle de transcription (il les écrit mieux).
  consigne() {
    const noms = new Set([...game.users.map(u => u.name), ...compagnonsDuMonde().map(a => a.name)]);
    for (const a of game.lakourLoups?.villageois?.() ?? []) noms.add(a.name);
    for (const u of game.users) if (u.character) noms.add(u.character.name);
    return `Partie de jeu de rôle autour d'une table, en français. Noms : ${[...noms].filter(Boolean).slice(0, 40).join(", ")}.`;
  }

  // Un segment de parole d'un joueur : transcrit seulement si une IA doit l'entendre et si le budget le permet.
  async traiterSegment(userId, segment) {
    const route = this.route(userId);
    if (!route.transcrire) return;   // aucune IA ne doit l'entendre : aucun appel
    if (this.moteur?.budgetDepasse?.()) {
      if (!this.budgetVu) ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Ecoute.Budget"));
      this.budgetVu = true;
      return;
    }
    this.budgetVu = false;
    const fournisseur = fournisseurImages();
    if (!fournisseur) return;
    const modele = String(reglage("modeleTranscription", "") || "").trim() || MODELE_TRANSCRIPTION_DEFAUT;
    const quand = Date.now();
    let r;
    try {
      const fichier = new File([wavMono16(segment.echantillons, 16000)], "parole.wav", { type: "audio/wav" });
      r = await fournisseur.transcrire({ fichier, modele, langue: "fr", consigne: this.consigne() });
    } catch (erreur) {
      console.error(`${ID} | transcription`, erreur);
      if (!this.erreurVue) ui.notifications.error(expliquerErreur(erreur));
      this.erreurVue = true;
      return;
    }
    await this.moteur?.compterCout?.(coutTranscription(modele, r.secondes ?? segment.duree));
    const texte = transcriptionUtile(r.texte);
    if (!texte || estEcho(texte, ditsRecents)) return;
    await this.recevoir({ userId, nom: this.nomDe(userId), texte, quand }, route);
  }

  // Une phrase transcrite : au MJ IA (sa file, pas le chat), aux compagnons qui pouvaient l'entendre, et peut-être au MJ humain.
  async recevoir(evenement, route = this.route(evenement.userId)) {
    Hooks.callAll("lakourMjIa.transcription", evenement);
    if (route.acteursAuditeurs.length) entendreParole(evenement, route.acteursAuditeurs);
    if (route.versMJ && this.moteur?.actif) {
      // Personne pour lui répondre parmi les compagnons : le MJ la lit, sans réveiller les compagnons (comme une annonce).
      this.moteur.signaler(ligneParole(evenement, route), { source: route.declencher ? "humain" : "annonce" });
    } else if (route.declencher) {
      this.sansNarrateur?.entendre(`${evenement.nom} (à voix haute) : ${evenement.texte}`);
    }
    // Montrée aux MJ (réglage). Aux Veillées, jamais par un chuchotement (Foundry livre tout message de chat à tous les
    // navigateurs : la parole d'un loup la nuit, au salon de la tanière, s'y lirait) : affichée ici (le MJ actif, qui écoute) et
    // envoyée aux autres MJ par le canal du module, à eux seuls ({ recipients }) ; chacun l'affiche localement, sans document.
    // Ailleurs (40k, Warcraft), rien de secret dans ce que les joueurs disent à voix haute à la table : le chuchotement aux MJ
    // d'avant, gardé dans le chat (relisible).
    if (!reglage("transcriptionAuMJ", false)) return;
    if (game.system?.id === "lakour-loups") montrerTranscription(evenement);
    else {
      await ChatMessage.implementation.create({
        content: `<p>🗣️ <strong>${foundry.utils.escapeHTML(evenement.nom)}</strong> : ${foundry.utils.escapeHTML(evenement.texte)}</p>`,
        whisper: game.users.filter(u => u.isGM).map(u => u.id),
        speaker: { alias: game.i18n.localize("LAKOUR_MJIA.Ecoute.Titre") },
        flags: { [ID]: { ia: true, transcription: true } }
      });
    }
  }
}

// ------------------------------------------------------------------ la transcription montrée aux MJ (réglage « transcriptionAuMJ »)
export const TYPE_TRANSCRIPTION = "transcription";
// Chez le MJ actif : affichée ici, et envoyée aux autres MJ connectés (eux seuls).
export function montrerTranscription(evenement) {
  if (!estMJActif()) return false;
  const message = { type: TYPE_TRANSCRIPTION, nom: String(evenement.nom ?? ""), texte: String(evenement.texte ?? ""), quand: evenement.quand ?? Date.now() };
  afficherTranscription(message);
  const autres = game.users.filter(u => u.isGM && u.active && u.id !== game.user.id).map(u => u.id);
  if (autres.length) envoyer(message, autres);
  return true;
}
// Chez un MJ : la ligne dans SON chat, jamais enregistrée (ChatLog#postOne d'un message non créé) ; à défaut, une notification.
export function afficherTranscription({ nom = "", texte = "" } = {}) {
  if (!game.user?.isGM) return false;
  const contenu = `<p>🗣️ <strong>${foundry.utils.escapeHTML(nom)}</strong> : ${foundry.utils.escapeHTML(texte)}</p>`;
  try {
    const Classe = globalThis.ChatMessage?.implementation;
    if (Classe && typeof globalThis.ui?.chat?.postOne === "function") {
      globalThis.ui.chat.postOne(new Classe({ content: contenu, speaker: { alias: game.i18n.localize("LAKOUR_MJIA.Ecoute.Titre") },
        author: game.user.id, flags: { [ID]: { ia: true, transcription: true, local: true } } }), { notify: false });
      return true;
    }
  } catch (e) { console.warn(`${ID} | transcription affichée`, e); }
  globalThis.ui?.notifications?.info?.(`${nom} : ${texte}`);
  return false;
}
// Chez un autre MJ : la transcription envoyée par le MJ actif (le canal n'accepte ce message que d'un MJ ; ici, de l'actif seul).
export function brancherTranscription() {
  recevoir(TYPE_TRANSCRIPTION, (message, emetteur) => (emetteur === game.users.activeGM?.id ? afficherTranscription(message) : false));
  ecouterCanal();
}

// Icône « ta voix est transcrite », dans chaque navigateur, tant que le MJ actif écoute.
export function afficherEcoute() {
  const actif = Boolean(reglage("ecouteEnCours", false)) && Boolean(game.users?.activeGM);
  let el = document.getElementById("lakour-mjia-ecoute");
  if (actif && !el) {
    el = document.createElement("div");
    el.id = "lakour-mjia-ecoute";
    el.dataset.tooltip = game.i18n.localize("LAKOUR_MJIA.Ecoute.Aide");
    el.innerHTML = `<i class="fa-solid fa-microphone-lines"></i> <span>${game.i18n.localize("LAKOUR_MJIA.Ecoute.Icone")}</span>`;
    document.body.append(el);
  } else if (!actif && el) {
    el.remove();
  }
  Hooks.callAll("lakourMjIa.ecoute", actif);
}
