import { OpenAI } from "../../vendor/openai.mjs";
import { voixRealtime, consignesLecture, wavDepuisPcm, lectureFidele } from "../voix-texte.js";
import { GardeLecture } from "../voix-flux.js";

// Fournisseur ChatGPT (API Responses), appelé depuis le navigateur du MJ avec SA clé.
// Le fil garde les éléments de sortie tels que l'API les rend (raisonnement, appels de fonction)
// et les renvoie à l'identique au tour suivant.
export class FournisseurOpenAI {
  constructor({ cle, modele, effort, modeleImage }) {
    this.client = new OpenAI({ apiKey: cle, dangerouslyAllowBrowser: true });
    this.modele = modele;
    this.effort = effort;
    this.modeleImage = modeleImage;
  }

  get nom() { return "openai"; }

  nouveauFil() {
    return { fournisseur: "openai", modele: this.modele, elements: [] };
  }

  ajouterUtilisateur(fil, texte) {
    fil.elements.push({ role: "user", content: texte });
  }

  // texte : consigne ajoutée après les résultats (ex. « raconte maintenant »).
  ajouterResultats(fil, resultats, texte = "") {
    for (const r of resultats) {
      fil.elements.push({ type: "function_call_output", call_id: r.id, output: r.erreur ? `ERREUR : ${r.contenu}` : r.contenu });
    }
    if (texte) fil.elements.push({ role: "user", content: texte });
  }

  async envoyer(fil, { systeme, outils, surTexte }) {
    const flux = this.client.responses.stream({
      model: this.modele,
      instructions: systeme,
      // Nettoyé à l'envoi aussi : un fil enregistré avant la correction peut contenir les champs ajoutés par le SDK.
      input: fil.elements.map(elementPourApi),
      reasoning: { effort: effortOpenAI(this.modele, this.effort) },
      tools: outils.map(o => ({ type: "function", name: o.nom, description: o.description, parameters: o.schema, strict: true }))
    });
    if (surTexte) flux.on("response.output_text.delta", e => surTexte(e.delta));
    const reponse = await flux.finalResponse();

    fil.elements.push(...reponse.output.map(elementPourApi));
    const refus = reponse.output.some(i => i.type === "message" && i.content?.some(c => c.type === "refusal"));
    const appels = reponse.output.filter(i => i.type === "function_call");
    const u = reponse.usage ?? {};
    const enCache = u.input_tokens_details?.cached_tokens ?? 0;
    return {
      texte: (reponse.output_text ?? "").trim(),
      appels: refus ? [] : appels.map(i => ({ id: i.call_id, nom: i.name, args: JSON.parse(i.arguments || "{}") })),
      usage: { entree: (u.input_tokens ?? 0) - enCache, cacheLecture: enCache, cacheEcriture: 0, sortie: u.output_tokens ?? 0 },
      arret: refus ? "refus" : appels.length ? "outils" : "fin"
    };
  }

  // Appel court, sans outils ni historique : le cerveau d'un compagnon IA (compagnons.js). Raisonnement léger, petite réponse.
  async envoyerCourt({ systeme, texte, maxJetons = 2000 }) {
    const reponse = await this.client.responses.create({
      model: this.modele,
      instructions: systeme,
      input: [{ role: "user", content: texte }],
      reasoning: { effort: effortOpenAI(this.modele, "low") },
      max_output_tokens: maxJetons
    });
    const refus = (reponse.output ?? []).some(i => i.type === "message" && i.content?.some(c => c.type === "refusal"));
    const u = reponse.usage ?? {};
    const enCache = u.input_tokens_details?.cached_tokens ?? 0;
    return {
      texte: (reponse.output_text ?? "").trim(),
      usage: { entree: (u.input_tokens ?? 0) - enCache, cacheLecture: enCache, cacheEcriture: 0, sortie: u.output_tokens ?? 0 },
      arret: refus ? "refus" : "fin"
    };
  }

  // Image (carte, portrait, illustration) : renvoie un Blob PNG.
  async genererImage({ description, taille }) {
    const r = await this.client.images.generate({ model: this.modeleImage, prompt: description, size: taille, n: 1 });
    const b64 = r.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI n'a renvoyé aucune image.");
    const octets = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Blob([octets], { type: "image/png" });
  }

  // Narration à voix haute : renvoie un Blob audio. ton = consignes de lecture.
  // Modèle « gpt-realtime… » : API Realtime (WAV) ; sinon ancienne API Speech (MP3, gpt-4o-mini-tts).
  async genererVoix({ texte, modele, voix, ton }) {
    if (modele.startsWith("gpt-realtime")) return this.#voixRealtime({ texte, modele, voix: voixRealtime(voix), ton });
    const reponse = await this.client.audio.speech.create({
      model: modele, voice: voix, input: texte, response_format: "mp3",
      ...(ton ? { instructions: ton } : {})
    });
    return new Blob([await reponse.arrayBuffer()], { type: "audio/mpeg" });
  }

  // API Realtime : une clé éphémère (une minute) est créée avec la clé du MJ, puis une connexion WebSocket
  // reçoit l'audio (PCM 16 bits, 24 kHz) d'une réponse qui lit le texte ; l'audio est assemblé en WAV.
  // La transcription renvoyée avec l'audio sert de contrôle : si le modèle a parlé en son nom au lieu de dire le texte,
  // second essai avec des consignes plus fermes, puis l'ancienne voix (gpt-4o-mini-tts, vraie synthèse) tant qu'elle existe.
  async #voixRealtime({ texte, modele, voix, ton }) {
    let dernier = null;
    for (const strict of [false, true]) {
      const secret = await this.client.realtime.clientSecrets.create({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime", model: modele, output_modalities: ["audio"], instructions: consignesLecture(ton, { strict }),
          audio: { output: { voice: voix, format: { type: "audio/pcm", rate: 24000 } } }
        }
      });
      const { morceaux, transcription } = await recevoirAudioRealtime(this.WebSocket ?? globalThis.WebSocket, modele, secret.value, texte);
      dernier = new Blob([wavDepuisPcm(morceaux, 24000)], { type: "audio/wav" });
      if (lectureFidele(texte, transcription)) return dernier;
      console.warn(`lakour-mj-ia | voix : lecture infidèle (« ${transcription.slice(0, 80)} »)${strict ? "" : ", nouvel essai"}`);
    }
    try {
      return await this.genererVoix({ texte, modele: VOIX_DE_SECOURS, voix, ton });
    } catch {
      return dernier; // plus d'ancienne voix : on garde le dernier essai plutôt que rien
    }
  }

  // Voix en direct (docs/voix-et-ecoute.md §1) : même session Realtime que #voixRealtime, mais chaque morceau de PCM est rendu
  // dès que la garde de lecture le laisse passer (surMorceau(b64)), au lieu d'attendre la fin. Rend { morceaux } (tout ce qui est
  // sorti, pour le WAV de réécoute ; coupe : lecture arrêtée car elle s'emballait), ou { blob } quand il a fallu se rabattre sur
  // un fichier entier (modèle non Realtime, ou deux lectures infidèles : ancienne voix gpt-4o-mini-tts).
  async voixEnFlux({ texte, modele, voix, ton, surMorceau }) {
    if (!modele.startsWith("gpt-realtime")) return { blob: await this.genererVoix({ texte, modele, voix, ton }) };
    for (const strict of [false, true]) {
      const secret = await this.client.realtime.clientSecrets.create({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime", model: modele, output_modalities: ["audio"], instructions: consignesLecture(ton, { strict }),
          audio: { output: { voice: voixRealtime(voix), format: { type: "audio/pcm", rate: 24000 } } }
        }
      });
      const garde = new GardeLecture(texte);
      const sortis = [];
      const sortir = ({ sortir: liste, etat }) => {
        for (const b64 of liste) { sortis.push(b64); surMorceau?.(b64); }
        return etat;
      };
      try {
        const r = await recevoirAudioRealtime(this.WebSocket ?? globalThis.WebSocket, modele, secret.value, texte, 180000, {
          surMorceau: b64 => sortir(garde.morceau(b64)),
          surTranscription: delta => sortir(garde.transcription(delta))
        });
        const etat = sortir(garde.finir());
        if (etat !== "infidele" && sortis.length) return { morceaux: sortis, coupe: Boolean(r.coupe) };
        if (etat !== "infidele") throw new Error("Voix OpenAI (Realtime) : aucun son reçu.");
      } catch (erreur) {
        if (!erreur?.infidele) {
          if (sortis.length) return { morceaux: sortis, coupe: true, erreur };   // déjà entendu : on ne recommence pas
          throw erreur;
        }
      }
      console.warn(`lakour-mj-ia | voix : lecture infidèle (« ${garde.transcrit.slice(0, 80)} »)${strict ? "" : ", nouvel essai"}`);
    }
    return { blob: await this.genererVoix({ texte, modele: VOIX_DE_SECOURS, voix, ton }) };
  }

  // Parole d'un joueur → texte (docs/voix-et-ecoute.md §2) : un segment WAV envoyé à l'API de transcription.
  // Rend { texte, secondes } (secondes : durée facturée si l'API la donne, sinon null).
  async transcrire({ fichier, modele, langue = "fr", consigne = "" }) {
    const r = await this.client.audio.transcriptions.create({
      file: fichier, model: modele, language: langue, response_format: "json", ...(consigne ? { prompt: consigne } : {})
    });
    const u = r?.usage;
    return { texte: String(r?.text ?? "").trim(), secondes: u?.type === "duration" ? Number(u.seconds) || null : null };
  }

  static expliquer(erreur) {
    if (erreur instanceof OpenAI.AuthenticationError) return "Clé OpenAI refusée : vérifie-la dans la configuration du MJ IA.";
    if (erreur instanceof OpenAI.PermissionDeniedError) return "Ta clé OpenAI n'a pas accès à ce modèle.";
    if (erreur instanceof OpenAI.RateLimitError) return "Trop de requêtes ou crédit épuisé chez OpenAI : réessaie dans un moment.";
    if (erreur instanceof OpenAI.BadRequestError) return `Requête refusée par OpenAI : ${erreur.message}`;
    if (erreur instanceof OpenAI.APIConnectionError) return "Impossible de joindre l'API OpenAI (réseau).";
    if (erreur instanceof OpenAI.APIError) return `Erreur OpenAI ${erreur.status ?? ""} : ${erreur.message}`;
    return null;
  }
}

// Élément de sortie tel que l'API l'accepte en entrée : l'assistant de flux du SDK ajoute des champs à lui
// (parsed_arguments sur un appel de fonction, parsed sur un texte) que l'API refuse ensuite (« Unknown parameter »).
export function elementPourApi(element) {
  const { parsed_arguments, ...reste } = element;
  if (reste.type === "message" && Array.isArray(reste.content)) {
    reste.content = reste.content.map(({ parsed, ...partie }) => partie);
  }
  return reste;
}

// Ancienne voix (API Speech, vraie synthèse : elle ne répond jamais au texte), en secours jusqu'à son arrêt le 06/01/2027.
const VOIX_DE_SECOURS = "gpt-4o-mini-tts";

// Niveau de raisonnement : les modèles GPT-6 acceptent jusqu'à "max" ; avant eux, rien au-delà de "high".
export function effortOpenAI(modele, effort) {
  if (/^gpt-(6|[7-9])/.test(modele ?? "")) return effort;
  return ["xhigh", "max"].includes(effort) ? "high" : effort;
}

// Une seule réponse sur une session Realtime neuve : le texte est envoyé, l'audio reçu par morceaux base64.
// suivi (voix en direct) : surMorceau(b64) et surTranscription(delta) à chaque événement ; s'ils rendent « infidele », la
// réponse est abandonnée (erreur marquée infidele) ; « couper », elle s'arrête là (résultat marqué coupe).
export function recevoirAudioRealtime(ClasseWebSocket, modele, cleEphemere, texte, delai = 180000, suivi = {}) {
  return new Promise((resolve, reject) => {
    const ws = new ClasseWebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(modele)}`,
      ["realtime", `openai-insecure-api-key.${cleEphemere}`]);
    const morceaux = [];
    let transcription = "";
    let fini = false;
    const finir = (erreur, valeur) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      try { ws.close(); } catch { /* déjà fermée */ }
      erreur ? reject(erreur) : resolve(valeur);
    };
    const minuterie = setTimeout(() => finir(new Error("La voix OpenAI (Realtime) n'a pas répondu à temps.")), delai);
    const reagir = etat => {
      if (etat === "infidele") finir(Object.assign(new Error("Voix OpenAI (Realtime) : lecture infidèle."), { infidele: true }));
      else if (etat === "couper") finir(null, { morceaux, transcription, coupe: true });
    };
    ws.addEventListener("message", e => {
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }
      if (ev.type === "session.created") {
        // Le texte seul : une phrase d'introduction (« Lis ce texte : ») invite le modèle à répondre plutôt qu'à dire.
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: texte }] }
        }));
        ws.send(JSON.stringify({ type: "response.create" }));
      } else if (ev.type === "response.output_audio.delta") {
        morceaux.push(ev.delta);
        reagir(suivi.surMorceau?.(ev.delta));
      } else if (ev.type === "response.output_audio_transcript.delta") {
        transcription += ev.delta ?? "";
        reagir(suivi.surTranscription?.(ev.delta ?? ""));
      } else if (ev.type === "response.done") {
        const statut = ev.response?.status;
        if (statut === "completed" && morceaux.length) finir(null, { morceaux, transcription });
        else finir(new Error(`Voix OpenAI (Realtime) : réponse ${statut ?? "vide"}${ev.response?.status_details?.error?.message ? ` — ${ev.response.status_details.error.message}` : ""}.`));
      } else if (ev.type === "error") {
        finir(new Error(`Voix OpenAI (Realtime) : ${ev.error?.message ?? "erreur inconnue"}`));
      }
    });
    ws.addEventListener("error", () => finir(new Error("Impossible de joindre l'API Realtime d'OpenAI (réseau).")));
    ws.addEventListener("close", e => finir(new Error(`Connexion Realtime fermée (${e.code}${e.reason ? ` : ${e.reason}` : ""}).`)));
  });
}
