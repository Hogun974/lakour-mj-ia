// Caméras des joueurs (voix et vidéo intégrées de Foundry, A/V) : ce qui décide si la caméra d'un joueur part, et ce que
// les autres voient à sa place. Logique pure ; la liaison avec Foundry v14 (AVMaster, SimplePeerAVClient, CameraViews) est
// dans scripts/cameras.js, le contrat dans README.md (« Caméras des joueurs ») et docs/voix-et-ecoute.md §4.
//
// Deux niveaux, pour chaque joueur (jamais pour un MJ) :
// - la DIFFUSION (le réglage du MJ « Caméras des joueurs » décoché) : pas de caméra du tout. Dans son navigateur, Foundry ne la
//   demande même pas au système (AVMaster#canUserBroadcastVideo faux : getUserMedia sans vidéo) ; chez les autres, sa vignette
//   montre son avatar ;
// - le PARTAGE (une règle d'un système de jeu : la nuit des Veillées, un mort…) : sa caméra reste ouverte mais sa piste vidéo
//   est éteinte à la source (AVMaster#canUserShareVideo faux, puis piste `enabled = false` : plus une image de la caméra ne
//   part), et chaque navigateur, le sien compris, montre à la place l'image de la règle (ou son avatar).
// Chaque navigateur calcule la même chose avec ce que tous savent (le réglage, la règle publique du jeu) : un joueur qui
// rallumerait sa caméra dans sa console ne serait affiché nulle part ailleurs.

export const MODES_AV = Object.freeze({ DESACTIVE: 0, AUDIO: 1, VIDEO: 2, AUDIO_VIDEO: 3 });

// Le mode du monde (réglage « rtcWorldSettings ».mode) permet-il la vidéo ?
export const avecVideo = mode => [MODES_AV.VIDEO, MODES_AV.AUDIO_VIDEO].includes(Number(mode));
// Le mode qui ajoute la vidéo sans retirer la voix : « Audio et vidéo » (un monde en vidéo seule le reste).
export const modeAvecVideo = mode => (avecVideo(mode) ? Number(mode) : MODES_AV.AUDIO_VIDEO);

// Un chemin d'image acceptable : une chaîne courte, sans protocole qui exécute ni données en ligne.
const IMAGE_INTERDITE = /^\s*(javascript|vbscript|data)\s*:/i;
export function cheminImage(chemin) {
  const c = typeof chemin === "string" ? chemin.trim() : "";
  if (!c || c.length > 500 || IMAGE_INTERDITE.test(c) || /[\u0000-\u001f"<>]/.test(c)) return "";
  return c;
}
const raisonPropre = r => (typeof r === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(r) ? r : "");

// Le résultat d'une règle -> null (caméra laissée) ou { image, repli, raison }. Une règle répond null / false / undefined
// (rien), true (remplacée, sans image : l'avatar), ou { image?, repli?, raison? } (remplacee: false : rien).
export function normaliserRemplacement(r) {
  if (!r) return null;
  if (r === true) return { image: "", repli: "", raison: "" };
  if (typeof r !== "object" || r.remplacee === false) return null;
  return { image: cheminImage(r.image), repli: cheminImage(r.repli), raison: raisonPropre(r.raison) };
}

// Les règles enregistrées, dans l'ordre : la première qui remplace l'emporte. Une règle qui échoue remplace (prudence : mieux
// vaut une image qu'une caméra qui ne devait pas partir), sans image. -> null ou { image, repli, raison }
export function remplacementDe(regles = [], utilisateur) {
  for (const regle of regles) {
    let r;
    try { r = normaliserRemplacement(regle(utilisateur)); } catch { r = { image: "", repli: "", raison: "erreur" }; }
    if (r) return r;
  }
  return null;
}

// La caméra d'un utilisateur. mj : un MJ n'est jamais coupé ; permises : le réglage du MJ ; remplacement : celui des règles.
// -> { diffuse, partage, image, repli, raison } : diffuse (la caméra peut être ouverte), partage (sa piste vidéo part).
export function videoDe({ mj = false, permises = true, remplacement = null } = {}) {
  if (mj) return { diffuse: true, partage: true, image: "", repli: "", raison: "" };
  const r = remplacement ?? null;
  if (permises === false) return { diffuse: false, partage: false, image: r?.image ?? "", repli: r?.repli ?? "", raison: "mj" };
  if (r) return { diffuse: true, partage: false, image: r.image, repli: r.repli, raison: r.raison || "regle" };
  return { diffuse: true, partage: true, image: "", repli: "", raison: "" };
}

// Les caméras de tous : utilisateurs [{ id, mj }] -> { userId: videoDe(...) }.
export function videosDeTous(utilisateurs = [], { permises = true, regles = [] } = {}) {
  return Object.fromEntries(utilisateurs.map(u => [u.id, videoDe({ mj: Boolean(u.mj), permises,
    remplacement: u.mj ? null : remplacementDe(regles, u.utilisateur ?? u) })]));
}

// Ce que voit le MJ dans la console : la vidéo est-elle possible ? mode : « rtcWorldSettings ».mode ; permises : le réglage ;
// utilisateurs : [{ nom, isGM, filme }] (filme : droit « Diffuser la vidéo »). -> { desactive, video, permises, sansDroit, pret }
// pret : rien à réparer (caméras coupées par le MJ, ou vidéo du monde et droit de chaque joueur).
export function diagnosticCameras({ mode = 0, permises = true, utilisateurs = [] } = {}) {
  const video = avecVideo(mode);
  const sansDroit = utilisateurs.filter(u => !u.isGM && !u.filme).map(u => u.nom);
  return { desactive: !Number(mode), video, permises: permises !== false, sansDroit, pret: permises === false || (video && !sansDroit.length) };
}
