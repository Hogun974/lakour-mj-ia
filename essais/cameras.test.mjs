// Caméras des joueurs (scripts/cameras-logique.js, scripts/cameras.js) : le réglage du MJ « Caméras des joueurs permises » et
// les règles d'un système de jeu (aux Veillées : la nuit, les morts…). Un navigateur est simulé avec un AVMaster et un client
// A/V qui font comme ceux de Foundry v14 (client/av/master.mjs : canUserBroadcastVideo, canUserShareVideo, toggleVideo à la
// connexion ; client/av/clients/simplepeer.mjs : la caméra demandée seulement si la diffusion est permise, updateLocalStream),
// et des vignettes comme celles de CameraViews (img.user-avatar sous video.user-camera). Éprouvé : la caméra d'un joueur ne part
// plus de SON navigateur (fermée, ou piste éteinte), aucun autre navigateur ne l'affiche, le micro n'est jamais touché, le MJ
// jamais coupé ; sans A/V, rien ne casse. Puis une batterie par mutation de la logique.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as C0 from "../scripts/cameras-logique.js";

const ID = "lakour-mj-ia";
const repos = () => new Promise(r => setImmediate(r));

// ------------------------------------------------------------------ doublures : Foundry v14, de quoi faire un navigateur
const ecouteurs = new Map();
globalThis.Hooks = {
  on: (nom, fn) => { if (!ecouteurs.has(nom)) ecouteurs.set(nom, []); ecouteurs.get(nom).push({ fn }); },
  once: (nom, fn) => { if (!ecouteurs.has(nom)) ecouteurs.set(nom, []); ecouteurs.get(nom).push({ fn, once: true }); },
  callAll: (nom, ...args) => {
    for (const e of [...(ecouteurs.get(nom) ?? [])]) {
      if (e.once) ecouteurs.set(nom, ecouteurs.get(nom).filter(x => x !== e));
      e.fn(...args);
    }
    return true;
  }
};
globalThis.CONST = { USER_ROLES: { PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 } };

const piste = kind => ({ kind, enabled: true });
const flux = ({ audio = true, video = true } = {}) => {
  const pistes = [...(audio ? [piste("audio")] : []), ...(video ? [piste("video")] : [])];
  return { getTracks: () => [...pistes], getAudioTracks: () => pistes.filter(p => p.kind === "audio"), getVideoTracks: () => pistes.filter(p => p.kind === "video") };
};

// Le client A/V : comme SimplePeerAVClient (la caméra n'est demandée que si master.canUserBroadcastVideo(moi)).
class FauxClient {
  constructor(master) { this.master = master; this.localStream = null; this.ouvertures = 0; this.basculesVideo = []; }
  async initializeLocalStream() {
    this.ouvertures++;
    this.localStream = flux({ audio: true, video: this.master.canUserBroadcastVideo(game.user.id) });
    return this.localStream;
  }
  async updateLocalStream() { await this.initializeLocalStream(); }
  isVideoEnabled() { return Boolean(this.localStream?.getVideoTracks().length); }
  toggleVideo(active) { this.basculesVideo.push(active); for (const p of this.localStream?.getVideoTracks() ?? []) p.enabled = active; }
  toggleBroadcast(active) { for (const p of this.localStream?.getAudioTracks() ?? []) p.enabled = active; }
  getMediaStreamForUser(id) { return id === game.user.id ? this.localStream : null; }
}

// AVMaster : comme celui de Foundry v14 (le mode du monde, le droit « Diffuser la vidéo », caché ou non).
class FauxMaitre {
  constructor() {
    this.client = new CONFIG.WebRTC.clientClass(this);
    this.broadcasting = false;
    this.cachees = new Set();   // ce que les autres ont dit d'eux-mêmes (activité { av: { hidden } })
  }
  get mode() { return game.settings.get("core", "rtcWorldSettings").mode; }
  get settings() { return { activity: {}, getUser: id => this.utilisateur(id) }; }
  utilisateur(id) {
    const u = game.users.get(id);
    if (!u) return null;
    const moi = id === game.user.id;
    return { canBroadcastVideo: u.can("BROADCAST_VIDEO"), canBroadcastAudio: u.can("BROADCAST_AUDIO"),
      hidden: moi ? !this.client.isVideoEnabled() : this.cachees.has(id), muted: false, blocked: false };
  }
  canUserBroadcastVideo(id) { if ([0, 1].includes(this.mode)) return false; const u = this.utilisateur(id); return u && u.canBroadcastVideo; }
  canUserShareVideo(id) { if ([0, 1].includes(this.mode)) return false; const u = this.utilisateur(id); return u && u.canBroadcastVideo && !(u.hidden || u.blocked); }
  canUserShareAudio(id) { if ([0, 2].includes(this.mode)) return false; const u = this.utilisateur(id); return u && u.canBroadcastAudio && !u.muted; }
  broadcast(intention) { this.broadcasting = Boolean(intention) && this.canUserShareAudio(game.user.id); this.client.toggleBroadcast(this.broadcasting); }
  // AVMaster#connect puis #initialize : le flux local, puis la vidéo selon canUserShareVideo, puis le micro.
  async connect() {
    await this.client.initializeLocalStream();
    this.client.toggleVideo(this.canUserShareVideo(game.user.id));
    this.broadcast(this.voix === "always");
  }
}

globalThis.foundry = {
  av: { AVMaster: FauxMaitre },
  utils: { deepClone: o => structuredClone(o) },
  applications: { settings: { SettingsConfig: { reloadConfirm: async () => { rechargements++; } } } }
};
globalThis.CONFIG = { WebRTC: { clientClass: FauxClient } };
let rechargements = 0;

// Une vignette de CameraViews : <div class="camera-view" data-user> avec img.user-avatar et video.user-camera.
function vignette(userId) {
  const classes = new Set(["camera-view"]);
  const img = { dataset: {}, src: `avatars/${userId}.png`, onerror: null, getAttribute: n => (n === "src" ? img.src : null) };
  const video = { hidden: false };
  return {
    dataset: { user: userId }, img, video,
    classList: { toggle: (c, oui) => (oui ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    querySelector: s => (s === "img.user-avatar" ? img : s === "video.user-camera" ? video : null)
  };
}

const cameras = await import("../scripts/cameras.js");
cameras.brancherCameras();

// Un navigateur : le monde (mode A/V, droits), les utilisateurs, l'utilisateur courant, les vignettes de chacun ; Foundry crée
// game.webrtc après « setup » et le connecte, puis « ready ».
async function navigateur(moi, { mode = 3, permises = true, droitVideo = [1, 2, 3, 4], avecAV = true, voix = "ptt", avantConnexion = null } = {}) {
  cameras.oublierCameras();
  const reglages = new Map([
    ["core.rtcWorldSettings", { mode, turn: { type: "custom", url: "turn:relais", username: "u", password: "p" } }],
    ["core.permissions", { BROADCAST_AUDIO: [1, 2, 3, 4], BROADCAST_VIDEO: droitVideo }],
    [`${ID}.camerasJoueurs`, permises]
  ]);
  const roles = { mj: 4, u1: 1, u2: 1, u3: 1 };
  const users = Object.entries(roles).map(([id, role]) => ({ id, name: id === "mj" ? "Meneuse" : `Joueur ${id}`, isGM: role === 4, role,
    can: p => reglages.get("core.permissions")[p].includes(role) }));
  const liste = Object.assign([...users], { get: id => users.find(u => u.id === id) });
  globalThis.game = {
    users: liste, user: liste.get(moi), modules: new Map([[ID, { id: ID, api: { cameras: cameras.api } }]]),
    settings: {
      get: (s, c) => structuredClone(reglages.get(`${s}.${c}`)),
      set: async (s, c, v) => {
        reglages.set(`${s}.${c}`, structuredClone(v));
        // Comme le réglage du moteur (reglages.js) : son onChange actualise les caméras.
        if (`${s}.${c}` === `${ID}.camerasJoueurs`) cameras.actualiser({ forcer: true });
        else Hooks.callAll("updateSetting", { key: `${s}.${c}` });
        return v;
      }
    }
  };
  const vues = Object.fromEntries(Object.keys(roles).map(id => [id, vignette(id)]));
  const rendus = { n: 0 };
  globalThis.ui = { webrtc: { render: () => { rendus.n++; }, popouts: [] } };
  globalThis.document = { querySelectorAll: s => (s === ".camera-view[data-user]" ? Object.values(vues) : []) };
  Hooks.callAll("setup");
  avantConnexion?.();
  if (avecAV) {
    game.webrtc = new FauxMaitre();
    game.webrtc.voix = voix;
    await game.webrtc.connect();
  } else delete game.webrtc;
  cameras.actualiser({ forcer: true });
  return { reglages, vues, rendus, w: game.webrtc };
}
const videoLocale = () => game.webrtc.client.localStream.getVideoTracks();
const audioLocal = () => game.webrtc.client.localStream.getAudioTracks().map(p => p.enabled);

// ------------------------------------------------------------------ logique pure
test("logique : un MJ jamais coupé ; réglage décoché : ni caméra ni piste ; une règle : la piste seule, avec son image", () => {
  assert.deepEqual(C0.videoDe({ mj: true, permises: false, remplacement: { image: "x.webp", repli: "", raison: "nuit" } }),
    { diffuse: true, partage: true, image: "", repli: "", raison: "" });
  assert.deepEqual(C0.videoDe({ permises: false }), { diffuse: false, partage: false, image: "", repli: "", raison: "mj" });
  assert.deepEqual(C0.videoDe({ remplacement: { image: "loup.webp", repli: "loup.svg", raison: "nuit" } }),
    { diffuse: true, partage: false, image: "loup.webp", repli: "loup.svg", raison: "nuit" });
  assert.deepEqual(C0.videoDe({ permises: false, remplacement: { image: "loup.webp", repli: "", raison: "nuit" } }),
    { diffuse: false, partage: false, image: "loup.webp", repli: "", raison: "mj" }, "coupées par le MJ : l'image de la règle quand même");
  assert.deepEqual(C0.videoDe({}), { diffuse: true, partage: true, image: "", repli: "", raison: "" });
});

test("logique : règles dans l'ordre, la première qui remplace l'emporte ; une règle qui échoue remplace (prudence)", () => {
  const u = { id: "u1" };
  assert.equal(C0.remplacementDe([() => null, () => false, () => ({ remplacee: false })], u), null);
  assert.deepEqual(C0.remplacementDe([() => null, () => ({ image: "a.webp", raison: "mort" }), () => true], u), { image: "a.webp", repli: "", raison: "mort" });
  assert.deepEqual(C0.remplacementDe([() => true], u), { image: "", repli: "", raison: "" });
  assert.deepEqual(C0.remplacementDe([() => { throw new Error("panne"); }], u), { image: "", repli: "", raison: "erreur" });
  const tous = C0.videosDeTous([{ id: "mj", mj: true }, { id: "u1" }], { regles: [() => { throw new Error("panne"); }] });
  assert.equal(tous.mj.partage, true, "le MJ n'est pas soumis aux règles");
  assert.equal(tous.u1.partage, false);
});

test("logique : chemins d'image (pas de javascript:, de data:, de guillemets) ; raisons courtes", () => {
  assert.equal(C0.cheminImage("modules/lakour-veillees/assets/camera/loup-garou.webp"), "modules/lakour-veillees/assets/camera/loup-garou.webp");
  assert.equal(C0.cheminImage("  https://exemple.org/a b.png "), "https://exemple.org/a b.png");
  for (const mauvais of ["javascript:alert(1)", " JavaScript:x", "data:image/svg+xml,<svg>", "a\"onerror=\"x", "a<b", 42, null, "x".repeat(501)]) {
    assert.equal(C0.cheminImage(mauvais), "", String(mauvais));
  }
  assert.deepEqual(C0.normaliserRemplacement({ image: "javascript:x", raison: "Loup Garou !" }), { image: "", repli: "", raison: "" });
});

test("logique : diagnostic de la console (vidéo du monde, droit des joueurs) ; le mode qui ajoute la vidéo garde la voix", () => {
  const u = (nom, isGM, filme) => ({ nom, isGM, filme });
  assert.deepEqual(C0.diagnosticCameras({ mode: 1, utilisateurs: [u("Meneuse", true, false), u("Ana", false, false)] }),
    { desactive: false, video: false, permises: true, sansDroit: ["Ana"], pret: false });
  assert.equal(C0.diagnosticCameras({ mode: 3, utilisateurs: [u("Ana", false, true)] }).pret, true);
  assert.equal(C0.diagnosticCameras({ mode: 1, permises: false }).pret, true, "coupées : rien à réparer");
  assert.equal(C0.diagnosticCameras({ mode: 0 }).desactive, true);
  assert.deepEqual([0, 1, 2, 3].map(C0.modeAvecVideo), [3, 3, 2, 3]);
});

// ------------------------------------------------------------------ le réglage du MJ
test("réglage décoché : le navigateur du joueur ferme sa caméra (flux redemandé sans vidéo), les autres ne l'affichent plus", async () => {
  const { w, rendus } = await navigateur("u1", { voix: "always" });
  assert.equal(videoLocale().length, 1, "caméra ouverte au départ");
  assert.equal(videoLocale()[0].enabled, true);
  assert.deepEqual(audioLocal(), [true]);
  const ouvertures = w.client.ouvertures;
  const rendusAvant = rendus.n;
  await cameras.permettre(false);
  await cameras.relanceEnCours();
  assert.equal(w.client.ouvertures, ouvertures + 1, "Foundry redemande le flux local");
  assert.equal(videoLocale().length, 0, "plus de caméra du tout : getUserMedia sans vidéo");
  assert.deepEqual(audioLocal(), [true], "le micro est rendu tel que Foundry le voulait (mode « toujours »)");
  assert.equal(w.canUserBroadcastVideo("u1"), false);
  assert.equal(w.canUserShareVideo("u2"), false, "un autre joueur : sa vignette sans vidéo, ici aussi");
  assert.equal(w.canUserShareVideo("mj"), true, "le MJ garde la sienne");
  assert.equal(w.canUserShareAudio("u1"), true, "le micro n'est pas touché");
  assert.ok(rendus.n > rendusAvant, "les vignettes sont redessinées");
  await cameras.permettre(true);
  await cameras.relanceEnCours();
  assert.equal(videoLocale().length, 1, "permises de nouveau : la caméra revient");
  assert.equal(videoLocale()[0].enabled, true);
  assert.equal(w.canUserShareVideo("u2"), true);
});

test("réglage décoché au chargement : la caméra n'est jamais demandée ; en « appuyer pour parler », le micro reste fermé", async () => {
  const { w } = await navigateur("u2", { permises: false });
  assert.equal(videoLocale().length, 0);
  assert.equal(w.client.ouvertures, 1, "pas de flux redemandé : la caméra n'a jamais été ouverte");
  assert.deepEqual(audioLocal(), [false], "appuyer pour parler : micro fermé tant qu'on n'appuie pas");
  await cameras.permettre(true);
  await cameras.relanceEnCours();
  assert.equal(videoLocale().length, 1);
  assert.deepEqual(audioLocal(), [false], "le flux neuf ne rouvre pas le micro");
});

test("le MJ n'est jamais coupé, ni par le réglage, ni par une règle", async () => {
  const { w } = await navigateur("mj", { permises: false });
  cameras.regle(() => ({ image: "loup.webp", raison: "nuit" }));
  assert.equal(videoLocale().length, 1);
  assert.equal(videoLocale()[0].enabled, true);
  assert.equal(w.canUserShareVideo("mj"), true);
  assert.equal(w.canUserShareVideo("u1"), false, "les joueurs, si");
});

// ------------------------------------------------------------------ une règle d'un système de jeu
test("règle : la piste vidéo du joueur éteinte à la source, l'image sur sa vignette ; levée : sa caméra revient", async () => {
  const { w, vues } = await navigateur("u1");
  let nuit = false;
  const retirer = cameras.regle(u => (nuit && !u.isGM ? { image: "loup.webp", repli: "loup.svg", raison: "nuit" } : null));
  assert.equal(videoLocale()[0].enabled, true);
  nuit = true;
  cameras.actualiser();
  assert.equal(videoLocale()[0].enabled, false, "plus une image de la caméra ne part");
  assert.equal(videoLocale().length, 1, "la caméra reste ouverte : pas de renégociation à chaque nuit");
  assert.deepEqual(audioLocal(), [false], "le micro n'est pas touché");
  w.client.toggleVideo(true);
  assert.equal(videoLocale()[0].enabled, false, "Foundry (ou un autre module) ne la rallume pas");
  for (const id of ["u1", "u2", "u3"]) {
    assert.equal(vues[id].img.src, "loup.webp", `vignette de ${id}`);
    assert.equal(vues[id].video.hidden, true);
    assert.equal(vues[id].classList.contains("lakour-camera-remplacee"), true);
  }
  assert.equal(vues.mj.img.src, "avatars/mj.png", "la vignette du MJ ne change pas");
  // Image absente : le repli, puis l'avatar.
  vues.u2.img.onerror();
  assert.equal(vues.u2.img.src, "loup.svg");
  vues.u2.img.onerror();
  assert.equal(vues.u2.img.src, "avatars/u2.png");
  nuit = false;
  cameras.actualiser();
  assert.equal(videoLocale()[0].enabled, true, "le jour : la caméra revient (rendue au choix du joueur)");
  assert.equal(w.client.basculesVideo.at(-1), true);
  assert.equal(vues.u1.img.src, "avatars/u1.png", "l'avatar revient sous la vidéo");
  assert.equal(vues.u1.classList.contains("lakour-camera-coupee"), false);
  retirer();
});

test("règle : un joueur qui rallume sa caméra dans sa console n'est affiché par aucun autre navigateur", async () => {
  // Le navigateur de u2 regarde u1 : u1 dit (activité) que sa caméra est montrée.
  const { w } = await navigateur("u2");
  cameras.regle(u => (u.id === "u1" ? { image: "loup.webp", raison: "mort" } : null));
  assert.equal(w.utilisateur("u1").hidden, false, "u1 se dit visible");
  assert.equal(w.canUserShareVideo("u1"), false, "ici, sa vidéo n'est pas montrée : le gabarit cache son <video>");
  assert.equal(w.canUserShareVideo("u3"), true);
  assert.equal(w.canUserShareAudio("u1"), true, "on l'entend toujours");
});

test("règle déjà vraie à la connexion : la caméra s'ouvre éteinte (Foundry fait toggleVideo(canUserShareVideo))", async () => {
  // Une règle posée avant la connexion A/V (aux Veillées : au « setup »).
  const { w } = await navigateur("u3", { avantConnexion: () => cameras.regle(() => ({ image: "loup.webp", raison: "nuit" })) });
  assert.equal(videoLocale().length, 1, "la caméra est ouverte…");
  assert.equal(videoLocale()[0].enabled, false, "…mais éteinte d'emblée");
  assert.equal(w.client.basculesVideo[0], false, "#initialize : toggleVideo(false)");
});

// ------------------------------------------------------------------ tolérance
test("sans A/V (pas de game.webrtc, mode désactivé, pas de vignettes) : rien ne casse", async () => {
  await navigateur("u1", { avecAV: false });
  cameras.regle(() => true);
  assert.doesNotThrow(() => cameras.actualiser({ forcer: true }));
  delete globalThis.document;
  globalThis.ui = {};
  assert.doesNotThrow(() => cameras.actualiser({ forcer: true }));
  assert.equal(cameras.decorer(), 0);
  const { w } = await navigateur("u1", { mode: 0 });
  assert.equal(w.canUserShareVideo("u2"), false);
  assert.equal(videoLocale().length, 0);
  assert.doesNotThrow(() => cameras.actualiser({ forcer: true }));
  assert.throws(() => cameras.regle("pas une fonction"), TypeError);
});

test("console : ajouter la vidéo (relais gardé, rechargement proposé), donner la caméra au rôle Joueur", async () => {
  const { reglages } = await navigateur("mj", { mode: 1, droitVideo: [2, 3, 4] });
  assert.deepEqual(cameras.diagnostic(), { desactive: false, video: false, permises: true, sansDroit: ["Joueur u1", "Joueur u2", "Joueur u3"], pret: false });
  const avant = rechargements;
  assert.equal(await cameras.activerVideo(), true);
  assert.deepEqual(reglages.get("core.rtcWorldSettings"), { mode: 3, turn: { type: "custom", url: "turn:relais", username: "u", password: "p" } });
  assert.equal(rechargements, avant + 1);
  assert.equal(await cameras.activerVideo(), false, "déjà en vidéo : rien");
  await cameras.donnerCamera();
  await cameras.donnerCamera();
  assert.deepEqual(reglages.get("core.permissions"), { BROADCAST_AUDIO: [1, 2, 3, 4], BROADCAST_VIDEO: [1, 2, 3, 4] }, "le micro n'est pas touché, pas de doublon");
  assert.equal(cameras.diagnostic().pret, true);
});

// ------------------------------------------------------------------ mutations de la logique
const VERIFICATIONS = {
  "MJ jamais coupé": C => assert.equal(C.videoDe({ mj: true, permises: false }).partage, true),
  "réglage décoché : pas de caméra": C => assert.equal(C.videoDe({ permises: false }).diffuse, false),
  "réglage décoché : pas de piste": C => assert.equal(C.videoDe({ permises: false }).partage, false),
  "règle : piste coupée": C => assert.equal(C.videoDe({ remplacement: { image: "", repli: "", raison: "nuit" } }).partage, false),
  "règle : caméra gardée ouverte": C => assert.equal(C.videoDe({ remplacement: { image: "", repli: "", raison: "nuit" } }).diffuse, true),
  "prudence d'une règle en panne": C => assert.notEqual(C.remplacementDe([() => { throw new Error("x"); }], {}), null),
  "première règle qui remplace": C => assert.equal(C.remplacementDe([() => null, () => ({ image: "a.png" })], {})?.image, "a.png"),
  "image sans javascript:": C => assert.equal(C.cheminImage("javascript:alert(1)"), ""),
  "vidéo seulement en mode 2 ou 3": C => assert.deepEqual([0, 1, 2, 3].map(C.avecVideo), [false, false, true, true])
};
const echecs = C => Object.entries(VERIFICATIONS).flatMap(([nom, f]) => { try { f(C); return []; } catch (e) { return [`${nom} : ${e.message.split("\n")[0]}`]; } });

test("caméras, logique pure : la batterie passe", () => { assert.deepEqual(echecs(C0), []); });

const SOURCE = fileURLToPath(new URL("../scripts/cameras-logique.js", import.meta.url));
const MUTATIONS = [
  ["  if (mj) return { diffuse: true, partage: true, image: \"\", repli: \"\", raison: \"\" };\n", "", "le MJ jamais coupé"],
  ["if (permises === false) return { diffuse: false, partage: false,", "if (permises === false) return { diffuse: true, partage: false,", "le réglage ferme la caméra"],
  ["if (permises === false) return { diffuse: false, partage: false,", "if (permises === false) return { diffuse: false, partage: true,", "le réglage coupe la piste"],
  ["if (r) return { diffuse: true, partage: false,", "if (r) return { diffuse: true, partage: true,", "une règle coupe la piste"],
  ["if (r) return { diffuse: true, partage: false,", "if (r) return { diffuse: false, partage: false,", "une règle garde la caméra ouverte"],
  ["catch { r = { image: \"\", repli: \"\", raison: \"erreur\" }; }", "catch { r = null; }", "une règle en panne remplace"],
  ["    if (r) return r;\n  }", "  }", "la première règle l'emporte"],
  ["const IMAGE_INTERDITE = /^\\s*(javascript|vbscript|data)\\s*:/i;", "const IMAGE_INTERDITE = /^\\s*(vbscript)\\s*:/i;", "pas de javascript:"],
  ["[MODES_AV.VIDEO, MODES_AV.AUDIO_VIDEO].includes(Number(mode))", "Number(mode) > 0", "la vidéo du monde"]
];
for (const [avant, apres, regle] of MUTATIONS) {
  test(`mutation des caméras « ${regle} » : détectée`, async () => {
    const texte = readFileSync(SOURCE, "utf8");
    assert.ok(texte.includes(avant), `mutation introuvable : ${avant}`);
    const dossier = mkdtempSync(join(tmpdir(), "cameras-mutant-"));
    try {
      writeFileSync(join(dossier, "cameras-logique.js"), texte.replace(avant, apres));
      const C = await import(pathToFileURL(join(dossier, "cameras-logique.js")).href);
      assert.ok(echecs(C).length > 0, `la règle « ${regle} » cassée passe inaperçue`);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  });
}

test("aucune boucle de rendu : une actualisation sans changement ne redessine pas les vignettes", async () => {
  const { rendus } = await navigateur("u1");
  await repos();
  const n = rendus.n;
  cameras.actualiser();
  cameras.actualiser();
  assert.equal(rendus.n, n);
});
