import { ID } from "./constantes.js";
import { lire, ecrire } from "./reglages.js";
import { ecrireJSON } from "./utilitaires.js";

// Remise à zéro de la campagne, dans le navigateur du MJ, par l'API de Foundry (qui défait proprement
// tous les liens) : chat, combats, scènes, journaux, objets, tables, dossiers, brouillard, acteurs — sauf les
// personnages cochés. Restent : utilisateurs, réglages (clés comprises), macros, musiques, compendiums.
// Le personnage gardé reçoit le jeton de son rôle ; le contenu du jeu (40k, Warcraft, Veillées) est ensuite réinstallé
// à neuf et une scène activée (sans elle, plus de barre d'outils pour le MJ).

const COLLECTIONS = ["ChatMessage", "Combat", "Scene", "JournalEntry", "Item", "RollTable"];
const CONTENU_PAR_SYSTEME = { impmal: "lakour-40k", dnd5e: "lakour-warcraft", "lakour-loups": "lakour-veillees" };

async function choisirPersonnagesGardes() {
  const persos = game.actors.filter(a => a.type === "character");
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

// Jeton du rôle (module lakour-40k), dans le style visuel choisi.
async function jetonDuRole(acteur) {
  let cle = acteur.items.find(i => i.type === "role")?.getFlag("lakour-40k", "cle");
  if (!cle) {
    const nomRole = acteur.items.find(i => i.type === "role")?.name;
    const pack = game.packs.get("lakour-40k.creation");
    cle = nomRole && pack ? (await pack.getIndex({ fields: ["flags"] })).find(e => e.type === "role" && e.name === nomRole)?.flags?.["lakour-40k"]?.cle : null;
  }
  if (!cle) return null;
  const fichier = lire("styleVisuel") === "3d" ? "index-3d.json" : "index.json";
  try {
    const index = await (await fetch(foundry.utils.getRoute(`modules/lakour-40k/assets/jetons/${fichier}`), { cache: "no-store" })).json();
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
  const contenu = game.modules.get(CONTENU_PAR_SYSTEME[game.system.id]);
  if (contenu?.active) {
    await game.settings.set(contenu.id, "installe", "");
    await contenu.api?.installer?.();
  }
  // La partie des Veillées désignait des villageois effacés : retour aux préparatifs.
  const partie = game.settings.settings.get(`${game.system.id}.partie`);
  if (game.system.id === "lakour-loups" && partie) await game.settings.set(game.system.id, "partie", foundry.utils.deepClone(partie.default));
  // Sans scène active, Foundry masque la barre d'outils (console du MJ IA, Table de veillée, tour par tour).
  if (!game.scenes.active && game.scenes.size) await game.scenes.contents[0].activate();
  if (game.paused) game.togglePause(false, { broadcast: true });
  ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Reinit.Fait", { gardes: game.actors.map(a => a.name).join(", ") || "—" }));
}
