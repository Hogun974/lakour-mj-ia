import { ID } from "./constantes.js";
import { lire, ecrire } from "./reglages.js";
import { ecrireJSON } from "./utilitaires.js";
import { consignerComposition } from "./historique-loups.js";
import { viderCarnet } from "./coffre.js";
import { moduleDeContenu } from "./contenus.js";

// Remise à zéro de la campagne, dans le navigateur du MJ, par l'API de Foundry (qui défait proprement
// tous les liens) : chat, combats, scènes, journaux, objets, tables, dossiers, brouillard, horloges, enquêtes, contacts, acteurs — sauf les
// personnages cochés. Restent : utilisateurs, réglages (clés comprises), macros, musiques, compendiums.
// Le personnage gardé reçoit le jeton de son rôle ; le contenu du jeu (40k, Warcraft, Veillées, Fénoir) est ensuite réinstallé
// à neuf et une scène activée (sans elle, plus de barre d'outils pour le MJ).

const COLLECTIONS = ["ChatMessage", "Combat", "Scene", "JournalEntry", "Item", "RollTable"];
// Le module de contenu du système (français ou anglais « -en ») : moduleDeContenu() de contenus.js.
// Types d'acteur d'un personnage joueur, proposés à la conservation (Fénoir : « survivant »).
const TYPES_PERSONNAGE = ["character", "survivant"];
// Fénoir (système lakour-survie, docs/survie.md) : l'état de la partie (public), le monde scellé (coffre), son double en clair
// (sans le moteur) et le monde gardé en réglage client chez le MJ reviennent à leur valeur par défaut. Les abris et les
// survivants non gardés partent avec les acteurs.
export const REGLAGES_SURVIE = ["partie", "coffre", "mondeClair", "monde"];

// Les réglages du système de jeu à remettre à zéro (une partie qui désignait des acteurs effacés) : [[système, clé]], seulement
// ceux que le système a enregistrés (existe(« système.clé »)).
export function reglagesAReinitialiser(systeme, existe = () => false) {
  const cles = systeme === "lakour-loups" ? ["partie"] : systeme === "lakour-survie" ? REGLAGES_SURVIE : [];
  return cles.filter(cle => existe(`${systeme}.${cle}`)).map(cle => [systeme, cle]);
}

async function choisirPersonnagesGardes() {
  const persos = game.actors.filter(a => TYPES_PERSONNAGE.includes(a.type));
  const esc = foundry.utils.escapeHTML;
  // Cochés d'office : les personnages assignés à un joueur.
  const assignes = new Set(game.users.filter(u => !u.isGM && u.character).map(u => u.character.id));
  const lignes = persos.map(a => {
    const joueurs = game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER")).map(u => u.name).join(", ");
    return `<label class="checkbox"><input type="checkbox" name="garder.${a.id}" ${assignes.has(a.id) ? "checked" : ""}> ${esc(a.name)}${joueurs ? ` (${esc(joueurs)})` : ""}</label>`;
  }).join("");
  const compte = c => game.collections.get(c)?.size ?? 0;
  const resume = [
    `${compte("ChatMessage")} messages`, `${compte("Scene")} scènes`, `${compte("JournalEntry")} journaux`,
    `${game.actors.size} acteurs (moins ceux gardés)`, `${compte("Item")} objets`, `${compte("RollTable")} tables`, `${compte("Combat")} combats`
  ].join(", ");
  return foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize("LAKOUR_MJIA.Reinit.Titre"), icon: "fa-solid fa-rotate-left" },
    content: `<p>${game.i18n.localize("LAKOUR_MJIA.Reinit.Explication")}</p><p><strong>${game.i18n.localize("LAKOUR_MJIA.Reinit.Supprime")}</strong> ${resume}.</p>`
      + `<p><strong>${game.i18n.localize("LAKOUR_MJIA.Reinit.Garder")}</strong></p>${lignes || "<p>—</p>"}`
      + `<p class="hint">${game.i18n.localize("LAKOUR_MJIA.Reinit.Conserve")}</p>`,
    ok: { label: game.i18n.localize("LAKOUR_MJIA.Reinit.Confirmer"), icon: "fa-solid fa-trash" },
    rejectClose: false
  });
}

// Jeton du rôle (module de contenu 40k actif : lakour-40k ou lakour-40k-en), dans le style visuel choisi.
async function jetonDuRole(acteur) {
  const module = moduleDeContenu();
  if (!module) return null;
  let cle = acteur.items.find(i => i.type === "role")?.getFlag(module, "cle");
  if (!cle) {
    const nomRole = acteur.items.find(i => i.type === "role")?.name;
    const pack = game.packs.get(`${module}.creation`);
    cle = nomRole && pack ? (await pack.getIndex({ fields: ["flags"] })).find(e => e.type === "role" && e.name === nomRole)?.flags?.[module]?.cle : null;
  }
  if (!cle) return null;
  const fichier = lire("styleVisuel") === "3d" ? "index-3d.json" : "index.json";
  try {
    const index = await (await fetch(foundry.utils.getRoute(`modules/${module}/assets/jetons/${fichier}`), { cache: "no-store" })).json();
    return index[cle] ?? null;
  } catch { return null; }
}

export async function reinitialiserCampagne(moteur) {
  if (!game.user.isGM) return;
  const reponse = await choisirPersonnagesGardes();
  if (!reponse) return; // fenêtre fermée : rien n'est fait
  const garder = new Set(Object.entries(foundry.utils.expandObject(reponse).garder ?? {}).filter(([, v]) => v).map(([id]) => id));

  // 1. Le MJ IA s'arrête et oublie tout (fil de conversation, compteurs, déplacements bloqués).
  clearTimeout(moteur.minuterie);
  moteur.attente = [];
  moteur.fil = null;
  await ecrire("seance", { active: false, debut: null, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 });
  await ecrire("mouvementsBloques", {});
  // Horloges, jauges et réputations, enquêtes et contacts : la campagne repart de zéro (le contenu réinstallé déclare à nouveau
  // les siens).
  // Avec leur coffre (éléments cachés, notes), dans la file du coffre : une écriture en cours ne le fait pas renaître. La clé reste.
  await viderCarnet();
  // Une partie des Veillées abandonnée : sa composition entre à l'historique (qui, lui, reste, pour varier la suivante).
  await consignerComposition().catch(() => false);
  // Un fil vide, en clair : il ne contient rien (fils.js chiffre les fils qui ont quelque chose à cacher).
  await ecrireJSON("fils", `${game.world.id}.json`, {}).catch(() => null);

  // 2. Le contenu du monde.
  for (const nom of COLLECTIONS) {
    const classe = CONFIG[nom]?.documentClass;
    if (classe && game.collections.get(nom)?.size) await classe.deleteDocuments([], { deleteAll: true });
  }
  // Le brouillard exploré n'est pas une collection chargée dans le client : suppression directe.
  await CONFIG.FogExploration.documentClass.deleteDocuments([], { deleteAll: true }).catch(() => null);
  const acteurs = game.actors.filter(a => !garder.has(a.id)).map(a => a.id);
  if (acteurs.length) await Actor.implementation.deleteDocuments(acteurs);
  for (const a of game.actors) if (a.folder) await a.update({ folder: null });
  if (game.folders.size) await Folder.implementation.deleteDocuments(game.folders.map(f => f.id));

  // 3. Les personnages gardés : jeton du rôle, vision active, lien avec la fiche.
  for (const a of game.actors) {
    const jeton = await jetonDuRole(a);
    await a.update({
      ...(jeton ? { img: jeton, "prototypeToken.texture.src": jeton } : {}),
      "prototypeToken.sight.enabled": true, "prototypeToken.actorLink": true
    });
  }

  // 4. Le contenu du jeu de ce monde réinstallé à neuf (guides, tables, aventure, cartes), s'il est là.
  const contenu = game.modules.get(moduleDeContenu());
  if (contenu?.active) {
    await game.settings.set(contenu.id, "installe", "");
    await contenu.api?.installer?.();
  }
  // La partie des Veillées désignait des villageois effacés : retour aux préparatifs. Fénoir : partie, monde scellé, monde en
  // clair et monde gardé chez le MJ, remis à leur valeur par défaut (REGLAGES_SURVIE) ; le système peut aussi oublier le monde
  // qu'il garde en mémoire (game.lakourSurvie.oublier, s'il la fournit un jour : hors contrat, facultative).
  for (const [systeme, cle] of reglagesAReinitialiser(game.system.id, c => game.settings.settings.has(c))) {
    const defaut = game.settings.settings.get(`${systeme}.${cle}`).default;
    await game.settings.set(systeme, cle, foundry.utils.deepClone(defaut)).catch(e => console.error(`${ID} | ${systeme}.${cle}`, e));
  }
  if (typeof game.lakourSurvie?.oublier === "function") await Promise.resolve(game.lakourSurvie.oublier()).catch(() => null);
  // Sans scène active, Foundry masque la barre d'outils (console du MJ IA, Table de veillée, tour par tour).
  if (!game.scenes.active && game.scenes.size) await game.scenes.contents[0].activate();
  if (game.paused) game.togglePause(false, { broadcast: true });
  ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Reinit.Fait", { gardes: game.actors.map(a => a.name).join(", ") || "—" }));
}
