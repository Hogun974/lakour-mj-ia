// Vue 3D (module 3D Canvas, « levels-3d-preview ») pilotée par l'IA. L'outil vue_3d écrit dans les drapeaux de la scène :
// - levels-3d-preview.auto3d / enablePlayers : la scène s'ouvre en 3D chez chacun (y compris ceux qui arrivent plus tard) ;
// - lakour-mj-ia.camera3d : un cadrage demandé ({ jeton | x, y, dessus, n }), que chaque navigateur applique à sa caméra.
// La réaction ci-dessous tourne dans TOUS les navigateurs : updateScene est diffusé à chacun.
import { ID } from "./constantes.js";

export const MODULE_3D = "levels-3d-preview";

// Ce qu'un navigateur doit faire après une mise à jour de scène : pur, pour les essais.
// etat3d : { active, estMJ } ; renvoie { basculer: true|false|null, camera: null | { jeton } | { x, y, dessus } }.
export function reaction3d(scene, changements, { active, estMJ }) {
  const drapeaux3d = scene.flags?.[MODULE_3D] ?? {};
  let basculer = null;
  if (foundry.utils.hasProperty(changements, `flags.${MODULE_3D}.auto3d`)) {
    const voulu = Boolean(drapeaux3d.auto3d) && (estMJ || Boolean(drapeaux3d.enablePlayers));
    if (voulu !== active) basculer = voulu;
  }
  const actifApres = basculer ?? active;
  const demande = foundry.utils.hasProperty(changements, `flags.${ID}.camera3d`) ? scene.flags?.[ID]?.camera3d : null;
  return { basculer, camera: actifApres && demande ? demande : null };
}

// Applique le cadrage avec l'animation de caméra de 3D Canvas (un jeton : vue de trois quarts derrière lui).
function cadrer(l3d, demande) {
  if (demande.jeton && l3d.tokens?.[demande.jeton]) return l3d.helpers.animateCamera({ id: demande.jeton });
  if (Number.isFinite(demande.x) && Number.isFinite(demande.y)) {
    l3d.helpers.animateCamera({ x: demande.x, y: demande.y, z: 0 }, { topdown: Boolean(demande.dessus), distance: demande.dessus ? 5000 : 2500 });
  }
}

export function brancherVue3d() {
  Hooks.on("updateScene", (scene, changements) => {
    const l3d = game.Levels3DPreview;
    if (!l3d || scene.id !== canvas.scene?.id) return;
    const { basculer, camera } = reaction3d(scene, changements, { active: Boolean(l3d._active), estMJ: game.user.isGM });
    if (basculer !== null) l3d.toggle(basculer);
    // À l'ouverture, 3D Canvas place sa caméra : on cadre juste après.
    if (camera) setTimeout(() => { if (l3d._active) cadrer(l3d, camera); }, basculer ? 1500 : 0);
  });
}
