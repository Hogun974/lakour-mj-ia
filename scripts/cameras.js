// Caméras des joueurs, dans la voix et la vidéo intégrées de Foundry (A/V) — logique dans cameras-logique.js, contrat dans
// README.md (« Caméras des joueurs ») et docs/voix-et-ecoute.md §4. Pour les quatre mondes ; un système de jeu y ajoute ses
// règles (aux Veillées : la nuit, les morts, les absents…) par api.cameras.regle(fn).
//
// Code client de Foundry v14 (14.370) lu pour cela :
// - client/av/master.mjs (AVMaster, game.webrtc) : canUserBroadcastVideo(userId) (le mode du monde et le droit « Diffuser la
//   vidéo ») et canUserShareVideo(userId) (le même, et ni caché ni bloqué) ; #initialize, après la connexion, fait
//   client.toggleVideo(videoSrc && canUserShareVideo(moi)) ; onSettingsChanged refait toggleVideo(canUserShareVideo(moi)) quand
//   le joueur cache ou montre sa caméra. game.webrtc est créé APRÈS le crochet « setup » (Game#initializeRTC, puis connect()
//   sans attendre) : on enveloppe donc la classe (foundry.av.AVMaster.prototype) dès « init ».
// - client/av/clients/simplepeer.mjs : initializeLocalStream ne demande la caméra (getUserMedia) que si
//   master.canUserBroadcastVideo(moi) ; updateLocalStream() redemande le flux et le repasse aux pairs (removeStream / addStream),
//   c'est ce que fait Foundry quand les droits d'un joueur changent (documents/user.mjs, _onUpdate) ; toggleVideo(active) règle
//   `enabled` des pistes vidéo du flux local (éteinte : plus une image de la caméra ne part).
// - applications/apps/av/cameras.mjs (CameraViews, ui.webrtc) : la vignette de chacun (templates/apps/av/camera.hbs) a
//   <img class="user-avatar"> sous <video class="user-camera">, caché (`hidden`) quand canUserShareVideo(son id) est faux ; le
//   son passe toujours par ce <video> (caché, il joue encore). CameraPopout reprend le même gabarit.
//
// Dans chaque navigateur, pour chaque joueur (jamais un MJ), d'après le réglage du MJ et les règles (les mêmes partout) :
// - canUserBroadcastVideo et canUserShareVideo de AVMaster enveloppés (pour tous les utilisateurs : le sien et ceux des autres),
//   et toggleVideo du client (pour soi) : le réglage décoché ferme la caméra (flux redemandé sans vidéo), une règle éteint sa
//   piste vidéo ; chez les autres, sa vignette montre l'image de la règle (ou son avatar) et son <video> reste caché, même s'il
//   rallumait sa caméra dans sa console ;
// - le micro n'est jamais touché (ni canUserShareAudio, ni les pistes audio ; après un flux redemandé, le micro est remis dans
//   l'état voulu par Foundry : AVMaster#broadcast(broadcasting)) ;
// - sans A/V (mode « Désactivé », pas de game.webrtc, pas de caméras affichées), rien ne casse : tout est gardé.
import { ID } from "./constantes.js";
import * as C from "./cameras-logique.js";

const MARQUE = Symbol.for("lakour-mj-ia.cameras");
const regles = [];
let videos = {};                 // userId -> { diffuse, partage, image, repli, raison } (recalculé par actualiser)
let signature = "";
let diffusionAppliquee = null;   // dans ce navigateur : la caméra permise au dernier passage (null : pas encore vu)
let partageApplique = null;      // la piste vidéo permise au dernier passage
let relance = null;              // le flux local en train d'être redemandé

export const camerasPermises = () => { try { return game.settings.get(ID, "camerasJoueurs") !== false; } catch { return true; } };

// Les utilisateurs du monde (une Collection de Foundry : ses valeurs ; un tableau dans les essais).
const tousLesUtilisateurs = () => { try { const u = game.users; return !u ? [] : Array.isArray(u.contents) ? u.contents : [...u]; } catch { return []; } };
const utilisateurs = () => tousLesUtilisateurs().map(u => ({ id: u.id, mj: Boolean(u.isGM), utilisateur: u }));

function calculerUn(userId) {
  const u = game.users?.get?.(userId) ?? null;
  return C.videoDe({ mj: Boolean(u?.isGM), permises: camerasPermises(), remplacement: u?.isGM ? null : C.remplacementDe(regles, u ?? { id: userId }) });
}

// La caméra d'un utilisateur (calculée à la demande si l'actualisation ne l'a pas encore vu).
export function videoDe(userId) {
  const id = String(userId ?? "");
  if (!Object.hasOwn(videos, id)) videos[id] = calculerUn(id);
  return videos[id];
}
const moiMJ = () => Boolean(game.user?.isGM);
const partageIci = () => moiMJ() || !game.user || videoDe(game.user.id).partage;

// ------------------------------------------------------------------ les enveloppes (permanentes, jamais retirées)
// Une méthode enveloppée une fois ; les enveloppes posées ensuite par d'autres (salons des Veillées) s'empilent par-dessus.
function envelopper(objet, nom, fabrique) {
  const avant = objet?.[nom];
  if (typeof avant !== "function" || avant[MARQUE]) return false;
  const nouvelle = fabrique(avant);
  nouvelle[MARQUE] = true;
  objet[nom] = nouvelle;
  return true;
}

function envelopperMaitre(cible) {
  envelopper(cible, "canUserBroadcastVideo", avant => function (userId, ...reste) {
    return Boolean(avant.call(this, userId, ...reste)) && videoDe(userId).diffuse;
  });
  envelopper(cible, "canUserShareVideo", avant => function (userId, ...reste) {
    return Boolean(avant.call(this, userId, ...reste)) && videoDe(userId).partage;
  });
}

function envelopperClient(cible) {
  envelopper(cible, "toggleVideo", avant => function (active, ...reste) {
    return avant.call(this, Boolean(active) && partageIci(), ...reste);
  });
}

// La classe de AVMaster (dès « init ») ; celle du client A/V (dès « setup ») ; puis les instances, au cas où un autre module
// aurait remplacé une classe ou une méthode.
function envelopperTout() {
  try { envelopperMaitre(globalThis.foundry?.av?.AVMaster?.prototype); } catch (e) { console.warn(`${ID} | caméras`, e); }
  try { envelopperClient(globalThis.CONFIG?.WebRTC?.clientClass?.prototype); } catch (e) { console.warn(`${ID} | caméras`, e); }
  const w = globalThis.game?.webrtc;
  if (w) {
    try { envelopperMaitre(w); } catch (e) { console.warn(`${ID} | caméras`, e); }
    try { envelopperClient(w.client); } catch (e) { console.warn(`${ID} | caméras`, e); }
  }
}

// ------------------------------------------------------------------ dans ce navigateur : ma caméra
const fluxLocal = client => { try { return client?.localStream ?? client?.getMediaStreamForUser?.(game.user.id) ?? null; } catch { return null; } };
const pistesVideo = flux => { try { return flux?.getVideoTracks?.() ?? []; } catch { return []; } };

// Le flux local redemandé (caméra fermée ou rouverte), comme Foundry quand les droits d'un joueur changent.
function relancerFlux() {
  const w = game.webrtc, client = w?.client;
  if (relance || typeof client?.updateLocalStream !== "function") return null;
  relance = Promise.resolve()
    .then(() => client.updateLocalStream())
    .then(() => {
      // Le micro d'un flux neuf : remis dans l'état voulu (appuyer pour parler relâché, détection de voix, « toujours »).
      try { w.broadcast?.(Boolean(w.broadcasting)); } catch (e) { console.warn(`${ID} | caméras`, e); }
      partageApplique = null;
      appliquerIci();
      rendre();
    })
    .catch(e => console.warn(`${ID} | caméras`, e))
    .finally(() => { relance = null; });
  return relance;
}

function appliquerIci() {
  const w = game.webrtc, client = w?.client;
  if (!client || !game.user || moiMJ()) return;
  const v = videoDe(game.user.id);
  const pistes = pistesVideo(fluxLocal(client));
  // Diffusion : la caméra fermée (réglage du MJ) ou rouverte. Au premier passage, seulement s'il faut fermer une caméra ouverte.
  const fermerOuRouvrir = diffusionAppliquee === null ? (!v.diffuse && pistes.length > 0) : diffusionAppliquee !== v.diffuse;
  diffusionAppliquee = v.diffuse;
  if (fermerOuRouvrir) relancerFlux();
  // Partage : la piste vidéo éteinte à la source (à chaque passage : un autre code a pu la rallumer), puis rendue au choix du joueur.
  if (!v.partage) {
    for (const p of pistes) if (p.enabled) p.enabled = false;
    if (partageApplique !== false) { try { client.toggleVideo?.(false); } catch (e) { console.warn(`${ID} | caméras`, e); } }
  } else if (partageApplique === false) {
    try { client.toggleVideo?.(Boolean(w.canUserShareVideo?.(game.user.id))); } catch (e) { console.warn(`${ID} | caméras`, e); }
  }
  partageApplique = v.partage;
}

// ------------------------------------------------------------------ dans ce navigateur : les vignettes
function rendre() {
  try {
    const r = ui?.webrtc?.render?.();
    for (const p of ui?.webrtc?.popouts ?? []) p?.render?.();
    Promise.resolve(r).then(() => decorer()).catch(() => null);
  } catch { /* sans caméras affichées */ }
}

// L'image d'une règle sur l'avatar d'une vignette ; une image absente passe au repli, puis à l'avatar.
function poserImage(img, image, repli) {
  const essais = [image, repli].filter(Boolean);
  if (!essais.length) return retirerImage(img);
  if (img.dataset.lakourCamera === essais[0]) return;
  if (img.dataset.lakourAvatar === undefined) img.dataset.lakourAvatar = img.getAttribute?.("src") ?? img.src ?? "";
  let i = 0;
  img.onerror = () => {
    i++;
    if (i < essais.length) img.src = essais[i];
    else { img.onerror = null; img.src = img.dataset.lakourAvatar; }
  };
  img.dataset.lakourCamera = essais[0];
  img.src = essais[0];
}

function retirerImage(img) {
  if (img.dataset.lakourAvatar === undefined) return;
  img.onerror = null;
  img.src = img.dataset.lakourAvatar;
  delete img.dataset.lakourAvatar;
  delete img.dataset.lakourCamera;
}

// Chaque vignette (barre des caméras et fenêtres détachées) : une caméra coupée a son <video> caché et, s'il y en a une,
// l'image de la règle à la place de l'avatar.
export function decorer() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return 0;
  let n = 0;
  for (const vue of document.querySelectorAll(".camera-view[data-user]")) {
    const v = videoDe(vue.dataset.user);
    const coupee = !v.partage;
    vue.classList?.toggle?.("lakour-camera-coupee", coupee);
    vue.classList?.toggle?.("lakour-camera-remplacee", coupee && Boolean(v.image || v.repli));
    const video = vue.querySelector?.("video.user-camera");
    if (video && coupee) video.hidden = true;
    const img = vue.querySelector?.("img.user-avatar");
    if (img) {
      if (coupee) poserImage(img, v.image, v.repli);
      else retirerImage(img);
    }
    if (coupee) n++;
  }
  return n;
}

// ------------------------------------------------------------------ actualisation
// Recalcule la caméra de chacun, l'applique à la mienne, redessine les vignettes si quelque chose a changé. -> { userId: … }
export function actualiser({ forcer = false } = {}) {
  videos = C.videosDeTous(utilisateurs(), { permises: camerasPermises(), regles });
  appliquerIci();
  const sig = JSON.stringify(videos);
  if (forcer || sig !== signature) {
    signature = sig;
    rendre();
    try { Hooks.callAll(`${ID}.cameras`, structuredClone(videos)); } catch { /* sans crochets */ }
  }
  decorer();
  return structuredClone(videos);
}

// Une règle d'un système de jeu : fn(utilisateur) -> null (rien) | true | { image?, repli?, raison? } ; elle ne doit lire que
// ce que TOUS les navigateurs savent (état public), sans quoi les vignettes différeraient et trahiraient un secret. -> une
// fonction qui la retire.
export function regle(fn) {
  if (typeof fn !== "function") throw new TypeError("api.cameras.regle : une fonction est attendue");
  regles.push(fn);
  actualiser();
  return () => {
    const i = regles.indexOf(fn);
    if (i >= 0) regles.splice(i, 1);
    actualiser();
  };
}

// ------------------------------------------------------------------ ce que fait le MJ (console du MJ IA)
export function diagnostic() {
  let mode = 0;
  try { mode = game.settings.get("core", "rtcWorldSettings")?.mode ?? 0; } catch { mode = 0; }
  return C.diagnosticCameras({ mode, permises: camerasPermises(),
    utilisateurs: tousLesUtilisateurs().map(u => ({ nom: u.name, isGM: Boolean(u.isGM), filme: Boolean(u.can?.("BROADCAST_VIDEO")) })) });
}

export async function permettre(oui = true) {
  await game.settings.set(ID, "camerasJoueurs", Boolean(oui));
  return Boolean(oui);
}

// Le monde passe en « Audio et vidéo » (le serveur relais gardé) ; Foundry demande alors à chacun de recharger la page.
export async function activerVideo() {
  const monde = foundry.utils.deepClone(game.settings.get("core", "rtcWorldSettings") ?? {});
  const mode = C.modeAvecVideo(monde.mode);
  if (Number(monde.mode) === mode) return false;
  await game.settings.set("core", "rtcWorldSettings", { ...monde, mode });
  try { await foundry.applications.settings?.SettingsConfig?.reloadConfirm?.({ world: true }); } catch (e) { console.warn(`${ID} | caméras`, e); }
  return true;
}

// Le droit « Diffuser la vidéo » donné au rôle Joueur (par défaut, seuls les joueurs de confiance l'ont).
export async function donnerCamera() {
  const droits = foundry.utils.deepClone(game.settings.get("core", "permissions") ?? {});
  droits.BROADCAST_VIDEO = [...new Set([...(droits.BROADCAST_VIDEO ?? []), CONST.USER_ROLES.PLAYER])].sort((a, b) => a - b);
  await game.settings.set("core", "permissions", droits);
}

export const api = {
  regle: fn => regle(fn),
  actualiser: options => actualiser(options),
  video: userId => ({ ...videoDe(userId) }),
  permises: () => camerasPermises(),
  permettre: oui => permettre(oui),
  diagnostic: () => diagnostic(),
  activerVideo: () => activerVideo(),
  donnerCamera: () => donnerCamera(),
  decorer: () => decorer()
};

// ------------------------------------------------------------------ branchements (crochet « init » du module)
let branche = false;
export function brancherCameras() {
  if (branche) return;
  branche = true;
  envelopperTout();
  Hooks.once("setup", () => envelopperTout());
  Hooks.once("ready", () => { envelopperTout(); actualiser({ forcer: true }); });
  // Les vignettes sont refaites à chaque flux reçu, chaque changement A/V : l'image et la piste éteinte sont reposées.
  for (const nom of ["renderCameraViews", "renderCameraPopout"]) Hooks.on(nom, () => { appliquerIci(); decorer(); });
  for (const nom of ["rtcSettingsChanged", "userConnected", "createUser", "updateUser", "deleteUser"]) Hooks.on(nom, () => { actualiser(); });
  Hooks.on("updateSetting", reglage => {
    if (["core.permissions", "core.rtcWorldSettings"].includes(reglage?.key)) actualiser();
  });
}

// Pour les essais : l'état de ce navigateur oublié (les enveloppes, elles, restent posées).
export function oublierCameras() {
  regles.length = 0;
  videos = {};
  signature = "";
  diffusionAppliquee = null;
  partageApplique = null;
  relance = null;
}
export const relanceEnCours = () => relance;
