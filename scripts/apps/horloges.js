import { ID } from "../constantes.js";
import { lireHorloges, geste } from "../horloges.js";
import { vuePourFenetre } from "../horloges-logique.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Fenêtre « Horloges » : camemberts des horloges, barres des jauges (avec leurs seuils), palier des réputations. Les joueurs
// n'y voient que ce que le MJ a montré ; le MJ voit tout, avance d'un clic (clic droit ou « − » : recule) et montre ou cache.
// Redessinée chez chacun quand le réglage « horloges » change (reglages.js).
export class FenetreHorloges extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-horloges`,
    classes: [ID, "lakour-mjia-horloges"],
    window: { title: "LAKOUR_MJIA.Horloges.Titre", icon: "fa-solid fa-chart-pie", resizable: true },
    position: { width: 380, height: "auto" },
    actions: {
      avancer: function (_e, cible) { return agir(cible, { action: "avancer", n: 1 }); },
      reculer: function (_e, cible) { return agir(cible, { action: "avancer", n: -1 }); },
      montrer: function (_e, cible) { return agir(cible, { action: "montrer" }); },
      cacher: function (_e, cible) { return agir(cible, { action: "cacher" }); }
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/horloges.hbs` } };

  async _prepareContext() {
    const mj = game.user.isGM;
    const elements = vuePourFenetre(lireHorloges(), { mj });
    return { mj, elements, vide: !elements.length };
  }

  // Clic droit sur un camembert ou une barre : recule d'un cran (MJ seulement).
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!game.user.isGM) return;
    for (const zone of this.element.querySelectorAll("[data-action=avancer][data-id]")) {
      zone.addEventListener("contextmenu", event => {
        event.preventDefault();
        agir(zone, { action: "avancer", n: -1 });
      });
    }
  }
}

// Un geste du MJ sur un élément (data-id) : erreurs montrées, la fenêtre suit le réglage.
async function agir(cible, message) {
  if (!game.user.isGM) return;
  const id = cible.closest("[data-id]")?.dataset.id;
  if (!id) return;
  try { await geste({ ...message, id }); } catch (e) {
    console.error(`${ID} | horloges`, e);
    ui.notifications.error(e.message);
  }
}

let fenetre = null;
export function ouvrirHorloges() {
  fenetre ??= new FenetreHorloges();
  return fenetre.render({ force: true });
}
export function rafraichirHorloges() {
  if (fenetre?.rendered) fenetre.render();
}
