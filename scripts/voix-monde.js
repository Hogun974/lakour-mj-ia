// La voix de Foundry (A/V) est-elle prête pour jouer ? Les trois mondes se jouent en audio seul (pas de vidéo) : le MJ voit
// ce qui empêche la table de s'entendre et le répare d'un clic (console du MJ IA ; aux Veillées, aussi la Table de veillée).
export const AUDIO_SEUL = 1;

// Logique pure. mode : réglage monde « rtcWorldSettings ».mode (0 = désactivé) ; utilisateurs : [{ nom, isGM, diffuse }]
// (diffuse : droit « Diffuser l'audio » ; le MJ n'en a pas besoin). -> { desactive, muets: [nom], pret }
export function diagnosticVoix({ mode = 0, utilisateurs = [] } = {}) {
  const desactive = !Number(mode);
  const muets = utilisateurs.filter(u => !u.isGM && !u.diffuse).map(u => u.nom);
  return { desactive, muets, pret: !desactive && !muets.length };
}

export function voixDuMonde() {
  return diagnosticVoix({
    mode: game.settings.get("core", "rtcWorldSettings")?.mode ?? 0,
    utilisateurs: game.users.map(u => ({ nom: u.name, isGM: u.isGM, diffuse: u.can("BROADCAST_AUDIO") }))
  });
}

// Mode « Audio seulement » ; le reste du réglage (serveur relais TURN) est gardé tel quel.
export async function activerAudio() {
  const monde = foundry.utils.deepClone(game.settings.get("core", "rtcWorldSettings") ?? {});
  await game.settings.set("core", "rtcWorldSettings", { ...monde, mode: AUDIO_SEUL });
}

// Le droit de diffuser son micro, donné au rôle « Joueur » (par défaut, seuls les joueurs de confiance l'ont).
export async function donnerMicro() {
  const droits = foundry.utils.deepClone(game.settings.get("core", "permissions") ?? {});
  droits.BROADCAST_AUDIO = [...new Set([...(droits.BROADCAST_AUDIO ?? []), CONST.USER_ROLES.PLAYER])].sort((a, b) => a - b);
  await game.settings.set("core", "permissions", droits);
}
