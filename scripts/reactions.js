import { ID } from "./constantes.js";
import { lire } from "./reglages.js";
import { salleEn, sallesAutourDe } from "./salles.js";
import { estCompagnon } from "./compagnons-jeu.js";

// Ce que font les joueurs sur le plateau, transmis au MJ IA (dans le navigateur du MJ, pendant une séance) :
// entrée dans une pièce, porte ouverte ou fermée, tour d'un PNJ ou d'un compagnon IA en combat. Les gestes faits depuis ce
// navigateur (par l'IA elle-même ou le MJ humain) ne sont pas signalés : on ne rapporte que les joueurs.

const dessinsDe = scene => scene.drawings.contents.map(d => d.toObject());
const caseDe = (scene, x, y) => `${Math.floor((x - scene.dimensions.sceneX) / scene.grid.size)},${Math.floor((y - scene.dimensions.sceneY) / scene.grid.size)}`;
const centreDe = jeton => {
  const s = jeton.parent.grid.size;
  return [jeton.x + (jeton.width * s) / 2, jeton.y + (jeton.height * s) / 2];
};

export function brancherReactions(moteur) {
  const derniereSalle = new Map();

  // Déplacements : seuls les changements de pièce sont signalés (sur une carte sans pièces nommées,
  // la dernière position de chaque jeton, fusionnée tant que l'IA n'a pas répondu).
  Hooks.on("updateToken", (jeton, changements, options, userId) => {
    if (!moteur.actif || !lire("reagirDeplacements") || userId === game.user.id) return;
    if (!("x" in changements || "y" in changements) || !jeton.actor?.hasPlayerOwner) return;
    const scene = jeton.parent;
    const [cx, cy] = centreDe(jeton);
    const salle = salleEn(dessinsDe(scene), cx, cy);
    const position = `case ${caseDe(scene, cx, cy)}`;
    if (salle) {
      if (derniereSalle.get(jeton.uuid) === salle) return;
      derniereSalle.set(jeton.uuid, salle);
      moteur.signaler(`🚶 ${jeton.name} entre dans « ${salle} » (${position}).`);
    } else {
      moteur.signaler(`🚶 ${jeton.name} se déplace (${position}).`, { fusion: `deplacement:${jeton.uuid}` });
    }
  });

  // Portes ouvertes, fermées ou forcées par un joueur.
  Hooks.on("updateWall", (mur, changements, options, userId) => {
    if (!moteur.actif || !lire("reagirPortes") || userId === game.user.id || !("ds" in changements)) return;
    const qui = game.users.get(userId);
    const nom = qui?.character?.name ?? qui?.name ?? "Quelqu'un";
    const etat = { [CONST.WALL_DOOR_STATES.OPEN]: "ouvre", [CONST.WALL_DOOR_STATES.CLOSED]: "ferme", [CONST.WALL_DOOR_STATES.LOCKED]: "verrouille" }[changements.ds] ?? "manipule";
    const salles = sallesAutourDe(dessinsDe(mur.parent), mur.c);
    const ou = salles.length ? ` entre ${salles.map(s => `« ${s} »`).join(" et ")}` : ` près de la case ${caseDe(mur.parent, (mur.c[0] + mur.c[2]) / 2, (mur.c[1] + mur.c[3]) / 2)}`;
    moteur.signaler(`🚪 ${nom} ${etat} une porte${ou} (porte ${mur.id}).`);
  });

  // Combat : quand vient le tour d'un compagnon IA, son cerveau déclare son action et le MJ IA la résout ; quand vient le
  // tour d'un PNJ, l'IA le joue.
  Hooks.on("updateCombat", (combat, changements) => {
    if (!moteur.actif || !("turn" in changements || "round" in changements)) return;
    // Pilote automatique en pause (plafond d'étapes, MJ humain…) alors qu'il ne reste que des compagnons : le combat attend.
    if (moteur.pilote?.combatRetenu()) return;
    const c = combat.combatant;
    if (c && !c.defeated && estCompagnon(c.actor)) {
      moteur.compagnons.tourDeCombat(combat).catch(e => console.error(`${ID} | tour du compagnon`, e));
      return;
    }
    if (!lire("jouerPnj")) return;
    if (!c || c.defeated || c.actor?.hasPlayerOwner || !c.token) return;
    const [cx, cy] = centreDe(c.token);
    moteur.signaler(`⚔️ Round ${combat.round} : c'est au tour de ${c.name} (PNJ, case ${caseDe(c.token.parent, cx, cy)}). `
      + "Joue son action maintenant (déplacement avec placer_jetons, attaque avec lancer_des en annonçant la cible), puis appelle passer_tour.",
    { immediat: true });
  });
}
