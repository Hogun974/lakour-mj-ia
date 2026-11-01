// L'appel « à toi » : chez le joueur seul, un tintement discret (canal « interface » de Foundry, jamais diffusé) et, s'il
// regarde un autre onglet, le titre de la page qui clignote jusqu'à son retour. Quand on attend quelque chose de lui : un
// vote de groupe, un choix secret, son tour de combat, sa parole au tour de table. Le MJ n'en a pas ; réglage client
// « appelJoueur ». (Les Veillées ont le même, scripts/signal.mjs du système lakour-loups.)
import { ID } from "./constantes.js";

export const VOLUME = 0.5;
let clignotement = null;   // { minuterie, origine, retour }

const lireReglage = () => { try { return game.settings.get(ID, "appelJoueur") !== false; } catch { return true; } };
// Un thème de combat de Foundry joue déjà « à ton tour » : pas de second son.
export function themeDeCombat() {
  try { return (game.settings.get("core", "combatTheme") ?? "none") !== "none"; } catch { return false; }
}

// cle : le texte du titre (clé de traduction). son : false pour le seul titre. -> true si l'appel est donné.
export function appeler(cle, { son = true } = {}) {
  if (game.user?.isGM || !lireReglage()) return false;
  const texte = game.i18n?.localize?.(cle) ?? cle;
  if (son) {
    try {
      foundry.audio.AudioHelper.play({ src: CONFIG.sounds?.notification ?? "sounds/notify.wav", volume: VOLUME, autoplay: true, loop: false, channel: "interface" }, false);
    } catch { /* sans son : le titre suffit */ }
  }
  clignoterTitre(texte);
  return true;
}

function clignoterTitre(texte) {
  if (typeof document === "undefined" || !document.hidden || clignotement) return;
  const origine = document.title;
  let allume = false;
  const retour = () => { if (!document.hidden) arreterClignotement(); };
  clignotement = { origine, retour, minuterie: setInterval(() => { document.title = (allume = !allume) ? `🔔 ${texte}` : origine; }, 1000) };
  document.addEventListener("visibilitychange", retour);
}

export function arreterClignotement() {
  if (!clignotement) return;
  clearInterval(clignotement.minuterie);
  document.title = clignotement.origine;
  document.removeEventListener("visibilitychange", clignotement.retour);
  clignotement = null;
}
