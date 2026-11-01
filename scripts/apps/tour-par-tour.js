import { ID } from "../constantes.js";
import { recevoir, versMJ, ecouterCanal, estMJActif } from "../canal.js";
import { suiviAJour } from "../tour-par-tour.js";
import * as L from "../tour-logique.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Tour par tour (docs/tour-par-tour.md) : le panneau du MJ (préparer, tour en cours, aide de l'étape suivante en pointillés,
// tour de table) et le bandeau des joueurs (« À toi de jouer ! », actions restantes, attaques). Tout passe par
// game.modules.get("lakour-mj-ia").api.tour (TourParTour, tour-par-tour.js).
const tour = () => game.modules.get(ID)?.api?.tour;
const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
// Un geste du panneau : erreurs montrées au MJ, panneau redessiné après.
async function geste(app, fn) {
  try { await fn(tour()); } catch (e) {
    console.error(`${ID} | tour par tour`, e);
    ui.notifications.error(e.message);
  }
  app?.render?.();
}

export class PanneauTour extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-tour`,
    classes: [ID, "lakour-mjia-tour"],
    window: { title: "LAKOUR_MJIA.Tour.Titre", icon: "fa-solid fa-shield-halved", resizable: true },
    position: { width: 520, height: "auto" },
    actions: {
      ajouter: function () {
        const ids = [...this.element.querySelectorAll("input[name=candidat]:checked")].map(c => c.value);
        return geste(this, t => t.ajouter(ids));
      },
      initiative: function () { return geste(this, t => t.initiative()); },
      commencer: function () { return geste(this, t => t.commencer()); },
      cible: function (_e, cible) { return geste(this, t => t.choisirCible(cible.dataset.jeton)); },
      attaquer: function (_e, cible) { return geste(this, t => t.attaquer(cible.dataset.attaque)); },
      toucher: function () { return geste(this, t => t.toucher()); },
      degats: function () { return geste(this, t => t.degats()); },
      defense: function (_e, cible) { return geste(this, t => t.defendre(cible.dataset.type || "dodge")); },
      appliquer: function () { return geste(this, t => t.appliquer()); },
      obligation: function () { return geste(this, t => t.obligation()); },
      jetMort: function () { return geste(this, t => t.jetMort()); },
      proposition: function () { return geste(this, t => t.accepterProposition()); },
      compagnon: function () { return geste(this, t => t.jouerCompagnon()); },
      suivant: function () { return geste(this, t => t.suivant()); },
      finCombat: function () { return geste(this, t => t.finCombat()); },
      tableCommencer: function () { return geste(this, t => t.commencerTable()); },
      tableNouveau: function () { return geste(this, t => t.commencerTable()); },
      tableArreter: function () { return geste(this, t => t.arreterTable()); },
      tableParle: function () {
        return geste(this, t => { const o = L.orateurTourDeTable(t.lireTable()); return o && t.avancerTable(o.id, "parle"); });
      },
      tablePasse: function () { return geste(this, t => t.sauterTable()); },
      tableCompagnon: function () {
        return geste(this, t => { const o = L.orateurTourDeTable(t.lireTable()); return o?.compagnon && t.faireParlerCompagnon(o); });
      }
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/tour-par-tour.hbs` } };

  async _prepareContext() {
    const t = tour();
    if (!t) return { disponible: false };
    try { return t.contextePanneau(); } catch (e) {
      console.error(`${ID} | panneau tour par tour`, e);
      return { disponible: false };
    }
  }

  // L'étape suivante : chaque bouton qui la fait est encadré de pointillés (comme la Table des Veillées).
  _onRender(context, options) {
    super._onRender?.(context, options);
    const actions = [context.etape?.action, context.table?.etape?.action].filter(Boolean);
    for (const a of actions) {
      for (const b of this.element.querySelectorAll(`button[data-action="${a}"]`)) b.classList.add("lakour-mjia-etape");
    }
  }
}

let panneau = null;
export function ouvrirPanneau() {
  panneau ??= new PanneauTour();
  return panneau.render({ force: true });
}

// ------------------------------------------------------------------ bandeau des joueurs
export class BandeauTour extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-bandeau-tour`,
    classes: [ID, "lakour-mjia-bandeau-tour"],
    tag: "section",
    window: { frame: false, positioned: false },
    actions: {
      bandeauAttaque: async function (_e, cible) {
        const t = tour();
        const att = t?.attaqueDeLActif(cible.dataset.attaque);
        const acteur = t?.combat()?.combatant?.actor;
        if (!att || !acteur?.isOwner) return;
        try { await t.sys.lancer(acteur, att); } catch (e) { ui.notifications.error(e.message); }
      },
      bandeauFin: () => versMJ({ type: "tour.fin" }),
      bandeauParle: () => versMJ({ type: "tour.table", fait: "parle" }),
      bandeauPasse: () => versMJ({ type: "tour.table", fait: "passe" })
    }
  };

  static PARTS = { bandeau: { template: `modules/${ID}/templates/bandeau-tour.hbs` } };

  async _prepareContext() {
    try { return tour()?.contexteBandeau() ?? {}; } catch { return {}; }
  }

  // Au-dessus du canevas, dans l'interface.
  async _insertElement(element) {
    const hote = document.getElementById("interface") ?? document.body;
    const existant = document.getElementById(element.id);
    if (existant) existant.replaceWith(element);
    else hote.append(element);
  }
}

let bandeau = null;
function rafraichirBandeau() {
  if (game.user.isGM) return;
  const ctx = tour()?.contexteBandeau?.();
  if (!ctx) {
    if (bandeau?.rendered) bandeau.close();
    return;
  }
  bandeau ??= new BandeauTour();
  bandeau.render({ force: true });
}

// ------------------------------------------------------------------ branchement
export function brancherTourParTour(t) {
  if (!t?.disponible()) return;
  let prevu = null;
  const rafraichir = () => {
    clearTimeout(prevu);
    prevu = setTimeout(() => {
      if (panneau?.rendered) panneau.render();
      rafraichirBandeau();
    }, 50);
  };
  t.rafraichir = rafraichir;
  // Un combat commence : le panneau s'ouvre chez le MJ (réglage client).
  Hooks.on("combatStart", () => {
    if (game.user.isGM && reglage("panneauTourAuto", true)) ouvrirPanneau();
  });
  Hooks.on("updateCombat", (combat, changements) => {
    if ("turn" in changements || "round" in changements) t.surNouveauTour(combat).catch(e => console.error(`${ID} | nouveau tour`, e));
    rafraichir();
  });
  for (const crochet of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "updateActor", "updateToken",
    "createToken", "deleteToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "canvasReady"]) {
    Hooks.on(crochet, rafraichir);
  }
  // Imperium Maledictum : une action de combat choisie sur la fiche (viser, charger, courir…) occupe l'action du tour.
  Hooks.on("updateActor", (acteur, changements) => {
    if (!estMJActif() || !t.sys?.actionChoisie?.(changements)) return;
    const combat = t.combat();
    if (!combat?.started || combat.combatant?.actor?.id !== acteur.id) return;
    t.majSuivi(combat, s => ({ ...s, depenses: L.depenser(t.sys.economie, s.depenses, "action") })).catch(() => null);
  });
  Hooks.on("createChatMessage", m => { t.surMessage(m).catch(e => console.error(`${ID} | tour par tour (chat)`, e)); });
  Hooks.on("updateChatMessage", m => { t.surMessage(m, { maj: true }).catch(e => console.error(`${ID} | tour par tour (chat)`, e)); });
  // Les joueurs : fin de leur tour, parole donnée ou passée au tour de table (au MJ actif seulement, qui vérifie).
  recevoir("tour.fin", (_m, qui) => t.demandeFinDeTour(qui), { pourMJ: true });
  recevoir("tour.table", (m, qui) => t.demandeTable(m.fait, qui), { pourMJ: true });
  ecouterCanal();
  // Un combat déjà en cours au chargement : le suivi du tour est repris (et un compagnon rejoue si son tour attendait).
  const combat = t.combat();
  if (combat?.started && estMJActif() && !suiviAJour(combat)) t.surNouveauTour(combat).catch(() => null);
  rafraichirBandeau();
}

export { rafraichirBandeau };
