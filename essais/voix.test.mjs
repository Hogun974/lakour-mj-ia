// Essais de la voix du narrateur, hors Foundry et sans réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { decouperPourVoix, choisirVoix, voixRealtime, wavDepuisPcm, consignesLecture } from "../scripts/voix-texte.js";
import { FournisseurOpenAI, effortOpenAI } from "../scripts/fournisseurs/openai.js";
import { prixOpenAI, MODELE_VOIX, MODELE_OPENAI_DEFAUT, VOIX_OPENAI } from "../scripts/constantes.js";
import { PERSONNALITES_DE_BASE } from "../scripts/personnalites.js";

const TEXTE = "La pluie d'acide ronge les gargouilles de Kour Primaris. Un prêcheur hurle sur la place ! "
  + "Plus loin, dans l'ombre d'une arche, trois silhouettes encapuchonnées vous observent, immobiles, patientes, "
  + "comme si elles attendaient un signal que vous seuls ne pouvez entendre… Que faites-vous ?";

test("découpage : aucun morceau ne dépasse la limite et aucun mot n'est perdu", () => {
  for (const max of [40, 80, 220, 3500]) {
    const morceaux = decouperPourVoix(TEXTE, max);
    assert.ok(morceaux.every(m => m.length <= max), `un morceau dépasse ${max}`);
    assert.equal(morceaux.join(" ").replace(/\s+/g, " "), TEXTE.replace(/\s+/g, " "));
  }
});

test("découpage : coupe de préférence aux fins de phrase", () => {
  // Les phrases courtes sont regroupées, mais chaque morceau s'arrête sur une fin de phrase
  // (sauf une phrase plus longue que la limite, coupée aux virgules).
  const morceaux = decouperPourVoix(TEXTE, 120);
  assert.equal(morceaux[0], "La pluie d'acide ronge les gargouilles de Kour Primaris. Un prêcheur hurle sur la place !");
  assert.ok(morceaux.at(-1).endsWith("Que faites-vous ?"), morceaux.at(-1));
  assert.deepEqual(decouperPourVoix("", 100), []);
  assert.deepEqual(decouperPourVoix("Court.", 100), ["Court."]);
});

const VOIX = [
  { name: "Microsoft David - English", lang: "en-US" },
  { name: "Microsoft Hortense - French (France)", lang: "fr-FR" },
  { name: "Microsoft Denise Online (Natural) - French (France)", lang: "fr-FR" },
  { name: "Microsoft Henri Online (Natural) - French (France)", lang: "fr-FR" }
];

test("choix de voix : préférence du joueur, sinon voix naturelle française, sinon voix française", () => {
  assert.equal(choisirVoix(VOIX, "henri").name, "Microsoft Henri Online (Natural) - French (France)");
  assert.equal(choisirVoix(VOIX, "").name, "Microsoft Denise Online (Natural) - French (France)");
  assert.equal(choisirVoix(VOIX.slice(0, 2), "").name, "Microsoft Hortense - French (France)");
  assert.equal(choisirVoix(VOIX.slice(0, 1), ""), null);
  assert.equal(choisirVoix([], "x"), null);
});

test("voix OpenAI : modèle, voix, ton et format envoyés, MP3 renvoyé", async () => {
  const f = new FournisseurOpenAI({ cle: "x", modele: "gpt-5.5", effort: "low", modeleImage: "gpt-image-2" });
  let recu;
  f.client = { audio: { speech: { create: async p => { recu = p; return { arrayBuffer: async () => new Uint8Array([73, 68, 51]).buffer }; } } } };
  const blob = await f.genererVoix({ texte: "Bonjour.", modele: "gpt-4o-mini-tts", voix: "onyx", ton: "Voix grave." });
  assert.deepEqual(recu, { model: "gpt-4o-mini-tts", voice: "onyx", input: "Bonjour.", response_format: "mp3", instructions: "Voix grave." });
  assert.equal(blob.type, "audio/mpeg");
  assert.equal(blob.size, 3);
  await f.genererVoix({ texte: "Sans ton.", modele: "gpt-4o-mini-tts", voix: "fable", ton: "" });
  assert.ok(!("instructions" in recu), "pas de consignes vides envoyées");
});

// ---------------------------------------------------------------- Voix Realtime (gpt-realtime-2.1-mini)

const b64 = octets => Buffer.from(octets).toString("base64");

// Faux WebSocket : joue un scénario d'événements serveur dès que le client a demandé sa réponse.
function fauxWebSocket(scenario, journal) {
  return class {
    constructor(url, protocoles) {
      this.ecouteurs = {};
      journal.url = url; journal.protocoles = protocoles; journal.envois = [];
      setTimeout(() => this.emettre("message", { data: JSON.stringify({ type: "session.created" }) }), 0);
    }
    addEventListener(type, f) { (this.ecouteurs[type] ??= []).push(f); }
    emettre(type, e) { for (const f of this.ecouteurs[type] ?? []) f(e); }
    send(texte) {
      const ev = JSON.parse(texte);
      journal.envois.push(ev);
      if (ev.type === "response.create") setTimeout(() => {
        for (const s of scenario) s.type === "close" ? this.emettre("close", s) : this.emettre("message", { data: JSON.stringify(s) });
      }, 0);
    }
    close() { journal.ferme = true; }
  };
}

function fournisseurRealtime(scenario) {
  const journal = {};
  const f = new FournisseurOpenAI({ cle: "x", modele: MODELE_OPENAI_DEFAUT, effort: "low", modeleImage: "gpt-image-2" });
  f.client = { realtime: { clientSecrets: { create: async corps => { journal.secret = corps; return { value: "ek_essai" }; } } } };
  f.WebSocket = fauxWebSocket(scenario, journal);
  return { f, journal };
}

test("voix Realtime : clé éphémère, session audio, texte envoyé, WAV assemblé dans l'ordre", async () => {
  const { f, journal } = fournisseurRealtime([
    { type: "response.output_audio.delta", delta: b64([1, 2, 3, 4]) },
    { type: "response.output_audio.delta", delta: b64([5, 6]) },
    { type: "response.done", response: { status: "completed" } }
  ]);
  const blob = await f.genererVoix({ texte: "La pluie tombe.", modele: MODELE_VOIX, voix: "onyx", ton: "Voix grave." });
  assert.equal(MODELE_VOIX, "gpt-realtime-2.1-mini");
  // Clé éphémère courte, session audio seule, voix Realtime (onyx n'existe plus → cedar), ton dans les consignes.
  assert.equal(journal.secret.expires_after.seconds, 60);
  const session = journal.secret.session;
  assert.equal(session.type, "realtime");
  assert.equal(session.model, "gpt-realtime-2.1-mini");
  assert.deepEqual(session.output_modalities, ["audio"]);
  assert.deepEqual(session.audio.output, { voice: "cedar", format: { type: "audio/pcm", rate: 24000 } });
  assert.match(session.instructions, /mot pour mot/);
  assert.match(session.instructions, /Voix grave\./);
  // Connexion : modèle dans l'URL, clé éphémère (jamais la clé du MJ) en sous-protocole.
  assert.equal(journal.url, "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini");
  assert.deepEqual(journal.protocoles, ["realtime", "openai-insecure-api-key.ek_essai"]);
  assert.deepEqual(journal.envois.map(e => e.type), ["conversation.item.create", "response.create"]);
  assert.equal(journal.envois[0].item.content[0].type, "input_text");
  assert.match(journal.envois[0].item.content[0].text, /La pluie tombe\.$/);
  assert.ok(journal.ferme, "connexion fermée après la réponse");
  // WAV : en-tête de 44 octets + les 6 octets reçus, dans l'ordre.
  assert.equal(blob.type, "audio/wav");
  const octets = new Uint8Array(await blob.arrayBuffer());
  assert.equal(octets.length, 50);
  assert.deepEqual([...octets.slice(44)], [1, 2, 3, 4, 5, 6]);
});

test("voix Realtime : une erreur, une réponse échouée, vide ou une coupure rejettent la génération", async () => {
  const cas = [
    [[{ type: "error", error: { message: "quota dépassé" } }], /quota dépassé/],
    [[{ type: "response.done", response: { status: "failed", status_details: { error: { message: "modèle indisponible" } } } }], /failed — modèle indisponible/],
    [[{ type: "response.done", response: { status: "completed" } }], /réponse completed/], // aucun audio reçu
    [[{ type: "close", code: 1006, reason: "" }], /fermée \(1006\)/]
  ];
  for (const [scenario, attendu] of cas) {
    const { f } = fournisseurRealtime(scenario);
    await assert.rejects(f.genererVoix({ texte: "Test.", modele: MODELE_VOIX, voix: "cedar", ton: "" }), attendu);
  }
});

test("WAV : en-tête PCM 16 bits mono 24 kHz correct", () => {
  const wav = wavDepuisPcm([b64([0, 0, 255, 127])], 24000);
  const v = new DataView(wav.buffer);
  const texte = (pos, n) => String.fromCharCode(...wav.slice(pos, pos + n));
  assert.equal(texte(0, 4), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + 4);
  assert.equal(texte(8, 8), "WAVEfmt ");
  assert.equal(v.getUint16(20, true), 1);      // PCM
  assert.equal(v.getUint16(22, true), 1);      // mono
  assert.equal(v.getUint32(24, true), 24000);  // fréquence
  assert.equal(v.getUint32(28, true), 48000);  // octets par seconde
  assert.equal(v.getUint16(34, true), 16);     // bits
  assert.equal(texte(36, 4), "data");
  assert.equal(v.getUint32(40, true), 4);
  assert.equal(wavDepuisPcm([]).length, 44);
});

test("voix des personnalités : toutes disponibles en Realtime ; les anciennes voix sont remplacées", () => {
  for (const p of PERSONNALITES_DE_BASE) assert.ok(VOIX_OPENAI.includes(p.voixOpenAI), `${p.nom} : ${p.voixOpenAI}`);
  assert.equal(voixRealtime("onyx"), "cedar");
  assert.equal(voixRealtime("fable"), "ballad");
  assert.equal(voixRealtime("nova"), "coral");
  assert.equal(voixRealtime("marin"), "marin");
  assert.equal(voixRealtime(undefined), "cedar");
  assert.doesNotMatch(consignesLecture(""), /Manière de lire/);
});

test("prix OpenAI : modèle par défaut connu, préfixe le plus long, modèle inconnu sans prix", () => {
  assert.equal(MODELE_OPENAI_DEFAUT, "gpt-6.1-sol");
  assert.deepEqual(prixOpenAI("gpt-6.1-sol"), { entree: 2, cacheLecture: 0.1, sortie: 10, cacheEcriture: 0 });
  assert.equal(prixOpenAI("gpt-6.1-sol-2026-10-01").sortie, 10);
  assert.equal(prixOpenAI("gpt-5.4-mini").sortie, 4.5);   // pas le prix de gpt-5.4
  assert.equal(prixOpenAI("gpt-5.4").sortie, 15);
  assert.equal(prixOpenAI("gpt-5.45"), null);             // « gpt-5.4 » ne doit pas attraper « gpt-5.45 »
  assert.equal(prixOpenAI("modele-inconnu"), null);
  assert.equal(prixOpenAI(undefined), null);
});

test("effort de raisonnement : jusqu'à max pour GPT-6, plafonné à high avant", () => {
  assert.equal(effortOpenAI("gpt-6.1-sol", "max"), "max");
  assert.equal(effortOpenAI("gpt-6-luna", "xhigh"), "xhigh");
  assert.equal(effortOpenAI("gpt-5.5", "max"), "high");
  assert.equal(effortOpenAI("gpt-5.5", "medium"), "medium");
});

// ---------------------------------------------------------------- La voix dit le texte, elle n'y répond pas

const { lectureFidele } = await import("../scripts/voix-texte.js");

test("lecture fidèle : le début de la transcription doit être celui du texte", () => {
  const texte = "Bienvenue sur **Kour Primaris**, Lazar Vosk. Le marché grouille.";
  assert.ok(lectureFidele(texte, "Bienvenue sur Kour Primaris, Lazar Vosk. Le marché grouille."));
  assert.ok(lectureFidele(texte, "bienvenue sur kour primaris lazar vosk le marche grouille"), "casse, accents et ponctuation ignorés");
  assert.ok(lectureFidele(texte, ""), "sans transcription, on fait confiance");
  assert.ok(!lectureFidele(texte, "D'accord, je vais lire cela sans le modifier. Bienvenue sur Kour Primaris…"));
  assert.ok(!lectureFidele(texte, "Bienvenue sur Kour Primaris, Lazar Vosk. Le marché grouille. Que veux-tu faire maintenant, voyageur ? Je peux te raconter la suite si tu veux, avec plaisir."),
    "une lecture qui s'allonge en conversation n'est pas fidèle");
});

// Plusieurs connexions de suite : chacune joue son propre scénario (audio + transcription).
function fournisseurEssais(scenarios, { speech = null } = {}) {
  const journal = { secrets: [], speech: [] };
  const f = new FournisseurOpenAI({ cle: "x", modele: MODELE_OPENAI_DEFAUT, effort: "low", modeleImage: "gpt-image-2" });
  f.client = {
    realtime: { clientSecrets: { create: async corps => { journal.secrets.push(corps); return { value: "ek" }; } } },
    audio: { speech: { create: async p => { journal.speech.push(p); if (!speech) throw new Error("arrêtée"); return { arrayBuffer: async () => new Uint8Array(speech).buffer }; } } }
  };
  f.WebSocket = class {
    constructor() {
      this.ecouteurs = {};
      this.scenario = scenarios.shift();
      setTimeout(() => this.emettre({ type: "session.created" }), 0);
    }
    addEventListener(type, fn) { (this.ecouteurs[type] ??= []).push(fn); }
    emettre(ev) { for (const fn of this.ecouteurs.message ?? []) fn({ data: JSON.stringify(ev) }); }
    send(texte) { if (JSON.parse(texte).type === "response.create") setTimeout(() => this.scenario.forEach(ev => this.emettre(ev)), 0); }
    close() {}
  };
  return { f, journal };
}
const dit = (octets, transcription) => [
  { type: "response.output_audio.delta", delta: b64(octets) },
  { type: "response.output_audio_transcript.delta", delta: transcription },
  { type: "response.done", response: { status: "completed" } }
];
const TEXTE_INTRO = "Bienvenue sur Kour Primaris, Lazar Vosk.";
const octetsDe = async blob => [...new Uint8Array(await blob.arrayBuffer())];

test("voix Realtime : le texte est envoyé seul, sans « Lis ce texte : » qui invite à répondre", async () => {
  const { f, journal } = fournisseurEssais([dit([1, 2], TEXTE_INTRO)]);
  const blob = await f.genererVoix({ texte: TEXTE_INTRO, modele: MODELE_VOIX, voix: "cedar", ton: "" });
  assert.deepEqual((await octetsDe(blob)).slice(44), [1, 2]);
  assert.equal(journal.secrets.length, 1);
  assert.match(journal.secrets[0].session.instructions, /pas un assistant/);
});

test("voix Realtime : une réponse au lieu d'une lecture → second essai plus ferme", async () => {
  const { f, journal } = fournisseurEssais([dit([9, 9], "D'accord, je vais lire cela sans le modifier."), dit([1, 2], TEXTE_INTRO)]);
  const blob = await f.genererVoix({ texte: TEXTE_INTRO, modele: MODELE_VOIX, voix: "cedar", ton: "" });
  assert.deepEqual((await octetsDe(blob)).slice(44), [1, 2], "c'est le second essai qui est gardé");
  assert.equal(journal.secrets.length, 2);
  assert.match(journal.secrets[1].session.instructions, /premier mot doit être exactement/);
  assert.equal(journal.speech.length, 0);
});

test("voix Realtime : deux réponses infidèles → l'ancienne vraie synthèse, sinon le dernier essai", async () => {
  const infidele = () => dit([9, 9], "D'accord, je vais lire cela.");
  const secours = fournisseurEssais([infidele(), infidele()], { speech: [73, 68, 51] });
  const mp3 = await secours.f.genererVoix({ texte: TEXTE_INTRO, modele: MODELE_VOIX, voix: "cedar", ton: "Voix grave." });
  assert.equal(mp3.type, "audio/mpeg");
  assert.equal(secours.journal.speech[0].model, "gpt-4o-mini-tts");
  assert.equal(secours.journal.speech[0].input, TEXTE_INTRO);
  // L'ancienne voix n'existe plus (après le 06/01/2027) : on garde le dernier essai plutôt que rien.
  const sans = fournisseurEssais([infidele(), dit([5, 5], "Bon, d'accord.")]);
  const wav = await sans.f.genererVoix({ texte: TEXTE_INTRO, modele: MODELE_VOIX, voix: "cedar", ton: "" });
  assert.deepEqual((await octetsDe(wav)).slice(44), [5, 5]);
});
