// Voix en direct et écoute des joueurs dans Foundry (doublures) : scripts/voix.js (tours de parole du narrateur et des compagnons,
// destinataires, file, repli sur le fichier, repli navigateur, lecture WebAudio dans chaque navigateur) et scripts/transcription.js
// (quand écouter, aucun appel inutile, coût, routage vers le MJ IA et les compagnons). Fournisseur OpenAI doublé : aucun appel
// facturé.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";

class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}

const reglages = {
  voix: "openai", voixDirecte: true, cleOpenAI: "x", modeleOpenAI: "gpt-6.1-sol", modeleImage: "gpt-image-2", modeleVoix: "gpt-realtime-2.1-mini",
  entendreNarration: true, volumeVoix: 1, personnaliteActive: "p", personnalites: [{ id: "p", nom: "Essai", voixOpenAI: "cedar", tonVoix: "grave" }],
  ecouteJoueurs: true, modeleTranscription: "", transcriptionAuMJ: false, ecouteEnCours: false, budgetSeance: 0, delaiReponse: 0,
  bavardageCompagnons: "normal", compagnonsPrive: {}
};
const emis = [];        // [message, destinataires]
const chat = [];
const joues = [];       // AudioHelper.play
const deposes = [];
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "jo", name: "Jordan", isGM: false, active: true };
const mort = { id: "fan", name: "Fantôme", isGM: false, active: true };
let compteur = 0;
let socketRecepteur = null;

globalThis.foundry = {
  applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: {} },
    apps: { FilePicker: { implementation: { createDirectory: async () => {}, upload: async (_s, dossier, fichier) => { deposes.push(fichier); return { path: `${dossier}/${fichier.name}` }; } } } }
  },
  utils: { randomID: () => `id${++compteur}`, escapeHTML: s => String(s), deepClone: o => structuredClone(o) },
  audio: { AudioHelper: { play: async (o, diffuser) => { joues.push([o.src, diffuser]); return { duration: 0 }; } } }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.ChatMessage = { implementation: { create: async d => { chat.push(d); return d; } } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1 } };
const moteurDouble = { actif: false, budgetDepasse: () => false, signaux: [], couts: [],
  signaler(texte, o) { this.signaux.push([texte, o.source]); }, async compterCout(c) { this.couts.push(c); } };
const acteur = (id, nom, extra = {}) => ({ id, name: nom, type: "villageois", flags: { "lakour-mj-ia": { compagnon: { temperament: "taciturne" } } },
  system: { compagnon: true, joueur: "", vivant: true, camp: "village", ...extra },
  async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; } });
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["jo", joueur], ["fan", mort]]), actors: new Collection(),
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  modules: new Map([["lakour-mj-ia", { api: { moteur: moteurDouble } }]]),
  socket: { emit: (_canal, message, o) => emis.push([message, o.recipients]), on: (_c, f) => { socketRecepteur = f; } },
  system: { id: "impmal" }, world: { id: "monde", title: "Monde" }, i18n: { localize: k => k, format: k => k, has: () => false },
  playlists: [], audio: { locked: true }, scenes: { active: null }, messages: { contents: [] }, combats: { active: null }, packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });

const { FournisseurOpenAI } = await import("../scripts/fournisseurs/openai.js");
const V = await import("../scripts/voix.js");
const { traiter } = await import("../scripts/canal.js");
const { EcouteJoueurs } = await import("../scripts/transcription.js");
const J = await import("../scripts/compagnons-jeu.js");
V.brancherVoixDirecte();

// Doublure de la synthèse : chaque énoncé donne des morceaux de 50 ms ; on garde ce qu'on lui demande de dire.
const dits = [];
let panneFlux = false;
const pcm = (s = 0.05) => Buffer.alloc(Math.round(s * 24000) * 2, 1).toString("base64");
FournisseurOpenAI.prototype.voixEnFlux = async function ({ texte, voix, surMorceau }) {
  dits.push({ texte, voix });
  if (panneFlux) throw new Error("Realtime en panne");
  const morceaux = [pcm(), pcm(), pcm()];
  for (const m of morceaux) surMorceau(m);
  return { morceaux, coupe: false };
};
FournisseurOpenAI.prototype.genererVoix = async function ({ texte }) {
  dits.push({ texte, fichier: true });
  return new Blob([new Uint8Array([1, 2])], { type: "audio/wav" });
};
const message = () => ({ flags: {}, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; } });
const vider = () => { emis.length = 0; dits.length = 0; joues.length = 0; deposes.length = 0; chat.length = 0; };

test("narrateur : le flux s'ouvre, chaque morceau part aussitôt à tous les autres connectés, puis la fin ; WAV déposé pour la réécoute", async () => {
  vider();
  const v = new V.VoixEnDirect(reglages.personnalites[0]);
  v.suivre("La brume monte sur le village. Les cloches se taisent.", true);
  const m = message();
  await v.terminer(m);
  const types = emis.map(([e]) => e.type);
  assert.deepEqual(types, ["voix-debut", "voix-morceau", "voix-morceau", "voix-morceau", "voix-fin"]);
  assert.ok(emis.every(([, d]) => d.join() === "jo,fan"), "tous les autres connectés (le MJ joue chez lui sans passer par le serveur)");
  assert.deepEqual(emis.filter(([e]) => e.type === "voix-morceau").map(([e]) => e.n), [0, 1, 2]);
  assert.equal(emis.at(-1)[0].total, 3);
  assert.equal(new Set(emis.map(([e]) => e.flux)).size, 1, "un seul flux pour tout le tour");
  assert.equal(dits[0].voix, "cedar");
  assert.deepEqual(m.flags["lakour-mj-ia"].audio, ["lakour-mj-ia/voix/monde/id2-0.wav"]);
  assert.equal(joues.length, 0, "rien par l'ancien chemin");
});

test("narrateur : texte encore caché (mise en place) → la synthèse avance, mais rien n'est entendu avant l'affichage", async () => {
  vider();
  let afficher;
  const affiche = new Promise(r => { afficher = r; });
  const v = new V.VoixEnDirect(reglages.personnalites[0], { attendre: affiche });
  v.suivre("Une phrase prête.", true);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(dits.length, 1, "déjà synthétisée");
  assert.equal(emis.length, 0, "pas encore envoyée");
  afficher();
  await v.terminer(message());
  assert.deepEqual(emis.map(([e]) => e.type), ["voix-debut", "voix-morceau", "voix-morceau", "voix-morceau", "voix-fin"]);
});

test("une seule voix à la fois : le narrateur passe avant le compagnon qui attend ; la didascalie n'est pas lue", async () => {
  vider();
  const a = acteur("ca", "Valentin"), b = acteur("cb", "Clémence");
  game.actors.set("ca", a); game.actors.set("cb", b);
  const premier = V.direReplique(a, "*Valentin croise les bras.* — Je n'ai rien vu.");
  await new Promise(r => setTimeout(r, 30));
  const second = V.direReplique(b, "Moi non plus.");
  await new Promise(r => setTimeout(r, 30));
  const n = new V.VoixEnDirect(reglages.personnalites[0]);
  n.suivre("Le soleil se couche.", true);
  await Promise.all([premier, second, n.terminer(null)]);
  const debuts = emis.filter(([e]) => e.type === "voix-debut").map(([e]) => e.priorite);
  assert.deepEqual(debuts, ["compagnon", "narrateur", "compagnon"]);
  // Les flux ne se chevauchent pas : chaque fin vient avant le début suivant.
  const ordre = emis.filter(([e]) => ["voix-debut", "voix-fin"].includes(e.type)).map(([e]) => e.type);
  assert.deepEqual(ordre, ["voix-debut", "voix-fin", "voix-debut", "voix-fin", "voix-debut", "voix-fin"]);
  assert.equal(dits.find(d => d.voix === a.flags["lakour-mj-ia"].voix.voix && d.texte.startsWith("Je"))?.texte, "Je n'ai rien vu.");
  assert.ok(!dits.some(d => /croise/.test(d.texte)), "le geste n'est pas dit");
  assert.notEqual(a.flags["lakour-mj-ia"].voix.voix, "cedar", "pas la voix du narrateur");
  assert.notEqual(a.flags["lakour-mj-ia"].voix.voix, b.flags["lakour-mj-ia"].voix.voix, "chacun la sienne");
  await V.voixAuRepos();
});

test("aux Veillées : un compagnon mort ne parle qu'aux morts (le MJ l'entend aussi) ; un compagnon qui ne peut pas parler se tait", async () => {
  vider();
  game.system.id = "lakour-loups";
  game.lakourLoups = { audibiliteActeur: id => (id === "cm" ? { peutParler: true, auditeurs: ["fan"] } : { peutParler: false, auditeurs: [] }) };
  try {
    const m = acteur("cm", "Mort IA", { vivant: false });
    game.actors.set("cm", m);
    await V.direReplique(m, "Je sais qui c'est.");
    assert.ok(emis.length > 0 && emis.every(([, d]) => d.join() === "fan"), JSON.stringify(emis.map(([, d]) => d)));
    vider();
    await V.direReplique(acteur("cx", "Muet"), "Psst.");
    assert.equal(emis.length + dits.length, 0, "ni synthèse ni envoi");
  } finally {
    game.system.id = "impmal";
    delete game.lakourLoups;
  }
});

test("repli : le flux échoue avant le moindre son → fichier entier, déposé puis joué par Foundry chez les destinataires", async () => {
  vider();
  panneFlux = true;
  try {
    const v = new V.VoixEnDirect(reglages.personnalites[0]);
    v.suivre("Une phrase.", true);
    const m = message();
    await v.terminer(m);
    assert.ok(dits.some(d => d.fichier));
    assert.deepEqual(joues, [["lakour-mj-ia/voix/monde/" + deposes[0].name, { recipients: ["jo", "fan"] }]]);
    assert.equal(m.flags["lakour-mj-ia"].audio.length, 1);
  } finally {
    panneFlux = false;
  }
});

test("repli : voix en direct décochée → l'ancien chemin (fichier), sans flux", async () => {
  vider();
  reglages.voixDirecte = false;
  try {
    const v = new V.VoixEnDirect(reglages.personnalites[0]);
    v.suivre("Une phrase.", true);
    await v.terminer(message());
    assert.ok(!emis.some(([e]) => e.type?.startsWith("voix-")));
    assert.equal(joues.length, 1);
  } finally {
    reglages.voixDirecte = true;
  }
});

test("repli : sans clé OpenAI ou budget atteint → la narration est marquée pour la voix du navigateur, les compagnons en texte seul", async () => {
  vider();
  reglages.cleOpenAI = "";
  try {
    const v = new V.VoixEnDirect(reglages.personnalites[0]);
    v.suivre("Une phrase.", true);
    const m = message();
    await v.terminer(m);
    assert.equal(m.flags["lakour-mj-ia"].repliNavigateur, true);
    await V.direReplique(acteur("cz", "Z"), "Bonjour.");
    assert.equal(emis.length + dits.length, 0);
  } finally {
    reglages.cleOpenAI = "x";
  }
  moteurDouble.budgetDepasse = () => true;
  try {
    const v = new V.VoixEnDirect(reglages.personnalites[0]);
    const m = message();
    await v.terminer(m);
    assert.equal(m.flags["lakour-mj-ia"].repliNavigateur, true);
  } finally {
    moteurDouble.budgetDepasse = () => false;
  }
});

// ---------------------------------------------------------------- lecture dans le navigateur d'un joueur (WebAudio doublé)
function contexteAudio() {
  const ctx = { currentTime: 100, departs: [], arretes: 0, gainNode: { connect() {} },
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createBuffer: (_c, n, f) => { const d = new Float32Array(n); return { duration: n / f, getChannelData: () => d }; },
    createBufferSource: () => ({ connect() {}, disconnect() {}, start: t => ctx.departs.push(t), stop: () => { ctx.arretes++; } }) };
  return ctx;
}
const recu = (m) => traiter({ ...m }, "mj");

test("navigateur d'un joueur : morceaux joués bout à bout après 200 ms de tampon ; flux commencé avant son arrivée ignoré", () => {
  const ctx = contexteAudio();
  game.user = joueur;
  game.audio = { locked: false, interface: ctx };
  try {
    recu({ type: "voix-morceau", flux: "ancien", n: 7, pcm: pcm() });
    assert.equal(ctx.departs.length, 0, "arrivé en cours de route : ignoré");
    recu({ type: "voix-debut", flux: "f1" });
    recu({ type: "voix-morceau", flux: "f1", n: 0, pcm: pcm(0.1) });
    recu({ type: "voix-morceau", flux: "f1", n: 1, pcm: pcm(0.1) });
    recu({ type: "voix-morceau", flux: "f1", n: 1, pcm: pcm(0.1) });   // doublon
    recu({ type: "voix-morceau", flux: "f1", n: 3, pcm: pcm(0.1) });   // le 2 est perdu : on continue
    recu({ type: "voix-fin", flux: "f1", total: 4 });
    assert.deepEqual(ctx.departs.map(t => Math.round(t * 1000) / 1000), [100.2, 100.3, 100.4]);
    // Un joueur ne peut pas envoyer de voix : seul un MJ le peut.
    traiter({ type: "voix-debut", flux: "pirate" }, "jo");
    traiter({ type: "voix-morceau", flux: "pirate", n: 0, pcm: pcm() }, "jo");
    assert.equal(ctx.departs.length, 3);
  } finally {
    game.user = mj;
    game.audio = { locked: true };
  }
});

test("navigateur d'un joueur : voix coupée chez lui → rien ; il la coupe en cours → tout s'arrête net ; son verrouillé → rien", () => {
  const ctx = contexteAudio();
  game.user = joueur;
  game.audio = { locked: false, interface: ctx };
  try {
    reglages.entendreNarration = false;
    recu({ type: "voix-debut", flux: "f2" });
    recu({ type: "voix-morceau", flux: "f2", n: 0, pcm: pcm() });
    assert.equal(ctx.departs.length, 0);
    reglages.entendreNarration = true;
    recu({ type: "voix-debut", flux: "f3" });
    recu({ type: "voix-morceau", flux: "f3", n: 0, pcm: pcm() });
    recu({ type: "voix-morceau", flux: "f3", n: 1, pcm: pcm() });
    V.couperVoix();
    assert.equal(ctx.arretes, 2);
    recu({ type: "voix-morceau", flux: "f3", n: 2, pcm: pcm() });
    assert.equal(ctx.departs.length, 2, "le flux coupé ne reprend pas");
    game.audio = { locked: true, interface: ctx };
    recu({ type: "voix-debut", flux: "f4" });
    recu({ type: "voix-morceau", flux: "f4", n: 0, pcm: pcm() });
    assert.equal(ctx.departs.length, 2);
  } finally {
    reglages.entendreNarration = true;
    game.user = mj;
    game.audio = { locked: true };
  }
});

// ---------------------------------------------------------------- écoute des joueurs (transcription.js)
const transcrits = [];
let texteRendu = "Je crois que Valentin ment.";
FournisseurOpenAI.prototype.transcrire = async function (o) { transcrits.push(o); return { texte: texteRendu, secondes: null }; };
const segment = { echantillons: new Float32Array(16000 * 2), duree: 2, parole: 1.8, force: false };

test("écoute : seulement chez le MJ actif, avec la voix intégrée en audio, une clé, le réglage, et une IA qui doit entendre", () => {
  for (const id of [...game.actors.keys()]) game.actors.delete(id);
  const e = new EcouteJoueurs({ moteur: moteurDouble });
  game.webrtc = { client: {}, mode: 3, settings: { constructor: { AV_MODES: { DISABLED: 0, AUDIO: 1, VIDEO: 2, AUDIO_VIDEO: 3 } } } };
  try {
    assert.equal(e.doitEcouter(), false, "ni séance ni compagnon");
    game.actors.set("k9", { ...acteur("k9", "Varn"), type: "character" });
    assert.equal(e.doitEcouter(), true, "un compagnon à la table suffit, même sans séance");
    game.actors.delete("k9");
    moteurDouble.actif = true;
    assert.equal(e.doitEcouter(), true);
    game.webrtc.mode = 2;
    assert.equal(e.doitEcouter(), false, "vidéo seule : pas de son");
    game.webrtc.mode = 1;
    reglages.ecouteJoueurs = false;
    assert.equal(e.doitEcouter(), false, "coupée par le MJ");
    reglages.ecouteJoueurs = true;
    reglages.cleOpenAI = "";
    assert.equal(e.doitEcouter(), false, "sans clé");
    reglages.cleOpenAI = "x";
    game.user = joueur;
    assert.equal(e.doitEcouter(), false, "pas chez un joueur");
    game.user = mj;
    delete game.webrtc;
    assert.equal(e.doitEcouter(), false, "voix intégrée inactive");
  } finally {
    moteurDouble.actif = false;
    delete game.webrtc;
    game.user = mj;
  }
});

test("transcription en séance (40k, Warcraft : sans matrice) : coût compté, phrase au MJ IA (pas au chat), compagnons informés", async () => {
  vider();
  transcrits.length = 0;
  moteurDouble.signaux.length = 0;
  moteurDouble.couts.length = 0;
  moteurDouble.actif = true;
  for (const id of [...game.actors.keys()]) game.actors.delete(id);
  const c = { ...acteur("k1", "Varn"), type: "character" };
  game.actors.set("k1", c);
  try {
    const e = new EcouteJoueurs({ moteur: moteurDouble });
    await e.traiterSegment("jo", segment);
    assert.equal(transcrits.length, 1);
    assert.equal(transcrits[0].modele, "gpt-4o-mini-transcribe", "le moins cher par défaut");
    assert.equal(transcrits[0].langue, "fr");
    assert.ok(transcrits[0].fichier instanceof File);
    assert.deepEqual(moteurDouble.couts, [2 / 60 * 0.003]);
    assert.deepEqual(moteurDouble.signaux, [["🗣️ Jordan (à voix haute) : Je crois que Valentin ment.", "humain"]]);
    assert.equal(chat.length, 0, "rien dans le chat des joueurs");
    assert.match(J.parolesPour("k1").map(p => p.ligne).join(), /Jordan \(à voix haute\) : Je crois que Valentin ment/);
    // Option : chuchotée aux MJ.
    reglages.transcriptionAuMJ = true;
    await e.traiterSegment("jo", segment);
    assert.deepEqual(chat.at(-1).whisper, ["mj"]);
    assert.equal(chat.at(-1).flags["lakour-mj-ia"].ia, true, "le MJ IA ne la relit pas comme un message");
  } finally {
    reglages.transcriptionAuMJ = false;
    moteurDouble.actif = false;
  }
});

test("transcription : aucun appel sans IA à l'écoute, au budget atteint ; écho et hallucination jetés après l'appel", async () => {
  transcrits.length = 0;
  moteurDouble.signaux.length = 0;
  for (const id of [...game.actors.keys()]) game.actors.delete(id);
  const e = new EcouteJoueurs({ moteur: moteurDouble });
  await e.traiterSegment("jo", segment);
  assert.equal(transcrits.length, 0, "ni séance ni compagnon");
  moteurDouble.actif = true;
  moteurDouble.budgetDepasse = () => true;
  try {
    await e.traiterSegment("jo", segment);
    assert.equal(transcrits.length, 0, "budget atteint");
    moteurDouble.budgetDepasse = () => false;
    V.ditsRecents.push({ texte: "Le soleil se couche sur Brumecombe et les loups rôdent.", quand: Date.now() });
    texteRendu = "le soleil se couche sur Brumecombe";
    await e.traiterSegment("jo", segment);
    texteRendu = "Sous-titres réalisés par la communauté d'Amara.org";
    await e.traiterSegment("jo", segment);
    assert.equal(transcrits.length, 2);
    assert.deepEqual(moteurDouble.signaux, [], "ni l'écho ni l'hallucination n'arrivent au MJ IA");
  } finally {
    texteRendu = "Je crois que Valentin ment.";
    moteurDouble.actif = false;
    moteurDouble.budgetDepasse = () => false;
  }
});

test("transcription aux Veillées sans narrateur : un mort n'est entendu que du compagnon mort, la nuit qui ne doit rien dire n'est pas transcrit", async () => {
  transcrits.length = 0;
  for (const id of [...game.actors.keys()]) game.actors.delete(id);
  const vivant = acteur("cv", "Clémence"), defunt = acteur("cm", "Odile", { vivant: false });
  const villageoisMort = { id: "vf", name: "Fantôme", type: "villageois", flags: {}, system: { joueur: "fan", vivant: false, camp: "village" } };
  const villageoisJo = { id: "vj", name: "Mathurin", type: "villageois", flags: {}, system: { joueur: "jo", vivant: true, camp: "village" } };
  for (const a of [vivant, defunt, villageoisMort, villageoisJo]) game.actors.set(a.id, a);
  const entendus = [];
  let phase = "jour";
  game.system.id = "lakour-loups";
  game.lakourLoups = {
    etat: () => ({ phase, tour: 1 }), villageois: () => game.actors.filter(a => a.type === "villageois"),
    audibilite: id => (phase === "nuit" ? { peutParler: false, auditeurs: [] } : id === "fan" ? { peutParler: true, auditeurs: ["mj"] } : { peutParler: true, auditeurs: ["mj", "fan"] }),
    audibiliteActeur: id => (id === "cm" ? { peutParler: true, auditeurs: ["fan"] } : { peutParler: true, auditeurs: ["mj", "jo", "fan"] })
  };
  try {
    const e = new EcouteJoueurs({ moteur: moteurDouble, sansNarrateur: { entendre: t => entendus.push(t) } });
    await e.traiterSegment("fan", segment);
    assert.equal(transcrits.length, 1);
    assert.deepEqual(J.parolesPour("cm").length, 1, "le compagnon mort entend le mort");
    assert.deepEqual(J.parolesPour("cv"), [], "le compagnon vivant ne l'entend pas");
    assert.match(entendus[0], /^Fantôme \(à voix haute\)/);
    await e.traiterSegment("jo", segment);
    assert.equal(J.parolesPour("cv").length, 1, "le jour, un vivant est entendu de tous");
    assert.match(J.parolesPour("cv")[0].ligne, /^Mathurin \(Jordan\)/, "le nom du villageois, puis le joueur");
    phase = "nuit";
    await e.traiterSegment("jo", segment);
    assert.equal(transcrits.length, 2, "la nuit, aucun appel pour qui ne doit rien dire");
  } finally {
    game.system.id = "impmal";
    delete game.lakourLoups;
    await J.effacerPrive();
  }
});

test("compagnons : une réplique postée au chat est aussi dite, sans retarder la suivante", async () => {
  const dites = [];
  let finir;
  const k = new J.Compagnons({ dire: (a, t, m) => { dites.push([a.id, t, Boolean(m)]); return new Promise(r => { finir = r; }); } });
  const m = await k.poster({ id: "k1", name: "Varn" }, "*Il sourit.* — Allons-y.");
  assert.equal(m.flags["lakour-mj-ia"].compagnon, "k1", "le message est rendu sans attendre la voix");
  await new Promise(r => setImmediate(r));
  assert.deepEqual(dites, [["k1", "*Il sourit.* — Allons-y.", true]]);
  finir();
});
