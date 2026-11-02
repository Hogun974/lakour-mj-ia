import { ID } from "../constantes.js";
import { lireHorloges, geste } from "../horloges.js";
import { vuePourFenetre } from "../horloges-logique.js";
import { enquetes, contacts, gesteCarnet } from "../carnet.js";
import { vueEnquetes } from "../enquetes-logique.js";
import { vueContacts } from "../contacts-logique.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const ONGLETS = ["horloges", "enquetes", "contacts"];

// Fenêtre « Carnet de campagne » (40k, Warcraft), trois onglets :
// - Horloges : camemberts des horloges, barres des jauges (avec leurs seuils), palier des réputations ;
// - Enquêtes : le tableau d'enquête (indices et conclusions) ;
// - Contacts : les contacts, leur attitude, leurs dettes et ce qu'ils demandent.
// Les joueurs n'y voient que ce que le MJ a montré (et d'une enquête, les seuls indices trouvés et conclusions révélées) ; le MJ
// voit tout : il avance une horloge d'un clic (clic droit ou « − » : recule), coche un indice trouvé ou une conclusion révélée,
// change l'attitude d'un contact, montre ou cache. Redessinée chez chacun quand un des réglages change (reglages.js).
export class FenetreCarnet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-carnet`,
    classes: [ID, "lakour-mjia-horloges", "lakour-mjia-carnet"],
    window: { title: "LAKOUR_MJIA.Carnet.Titre", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      onglet: function (_e, cible) { this.onglet = ONGLETS.includes(cible.dataset.onglet) ? cible.dataset.onglet : "horloges"; return this.render(); },
      // Horloges (horloges.js).
      avancer: function (_e, cible) { return agir(this, cible, { action: "avancer", n: 1 }); },
      reculer: function (_e, cible) { return agir(this, cible, { action: "avancer", n: -1 }); },
      montrer: function (_e, cible) { return agir(this, cible, { action: "montrer" }); },
      cacher: function (_e, cible) { return agir(this, cible, { action: "cacher" }); },
      // Enquêtes et contacts (carnet.js) : data-valeur porte la NOUVELLE valeur (une case cochée ou non, un œil ouvert ou non).
      indice: function (_e, cible) { return carnet(this, cible, "indice"); },
      conclusion: function (_e, cible) { return carnet(this, cible, "conclusion"); },
      enqueteVisible: function (_e, cible) { return carnet(this, cible, "enqueteVisible"); },
      attitude: function (_e, cible) { return carnet(this, cible, "attitude"); },
      contactVisible: function (_e, cible) { return carnet(this, cible, "contactVisible"); }
    }
  };

  // scrollable : la position de la liste est gardée quand la part est redessinée (un réglage qui change chez tous).
  static PARTS = {
    onglets: { template: `modules/${ID}/templates/carnet-onglets.hbs` },
    horloges: { template: `modules/${ID}/templates/horloges.hbs`, scrollable: [".lakour-mjia-horloges-liste"] },
    enquetes: { template: `modules/${ID}/templates/enquetes.hbs`, scrollable: [""] },
    contacts: { template: `modules/${ID}/templates/contacts.hbs`, scrollable: [".lakour-mjia-contacts-liste"] }
  };

  onglet = "horloges";

  async _prepareContext() {
    const mj = game.user.isGM;
    const elements = vuePourFenetre(lireHorloges(), { mj });
    const listeEnquetes = vueEnquetes(enquetes.lire(), { mj });
    const listeContacts = vueContacts(contacts.lire(), { mj });
    return {
      mj, elements, vide: !elements.length, enquetes: listeEnquetes, contacts: listeContacts,
      onglet: this.onglet, onglets: Object.fromEntries(ONGLETS.map(o => [o, o === this.onglet])),
      nombres: { horloges: elements.length, enquetes: listeEnquetes.length, contacts: listeContacts.length }
    };
  }

  // Clic droit sur un camembert ou une barre : recule d'un cran (MJ seulement).
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!game.user.isGM) return;
    for (const zone of this.element.querySelectorAll("[data-action=avancer][data-id]")) {
      zone.addEventListener("contextmenu", event => {
        event.preventDefault();
        agir(this, zone, { action: "avancer", n: -1 });
      });
    }
  }
}

// Un geste du MJ sur une horloge (data-id) : la fenêtre suit le réglage ; en cas d'échec, l'erreur est montrée et la part
// redessinée (une case cochée revient à l'état réel).
async function agir(app, cible, message) {
  if (!game.user.isGM) return;
  const id = cible.closest("[data-id]")?.dataset.id;
  if (!id) return;
  try { await geste({ ...message, id }); } catch (e) {
    console.error(`${ID} | horloges`, e);
    ui.notifications.error(e.message);
    app?.render?.({ parts: ["horloges"] });
  }
}

// Un geste du MJ sur une enquête (data-enquete, data-entree) ou un contact (data-contact).
async function carnet(app, cible, action) {
  if (!game.user.isGM) return;
  const valeur = cible.dataset.valeur;
  try {
    await gesteCarnet({
      action, enquete: cible.closest("[data-enquete]")?.dataset.enquete ?? "", entree: cible.dataset.entree ?? "",
      contact: cible.closest("[data-contact]")?.dataset.contact ?? "", valeur: action === "attitude" ? Number(valeur) : valeur === "1"
    });
  } catch (e) {
    console.error(`${ID} | carnet de campagne`, e);
    ui.notifications.error(e.message);
    app?.render?.({ parts: [PART_DU_GESTE[action]] });
  }
}
const PART_DU_GESTE = { indice: "enquetes", conclusion: "enquetes", enqueteVisible: "enquetes", attitude: "contacts", contactVisible: "contacts" };

let fenetre = null;
export function ouvrirCarnet(onglet = null) {
  fenetre ??= new FenetreCarnet();
  if (ONGLETS.includes(onglet)) fenetre.onglet = onglet;
  return fenetre.render({ force: true });
}
export const ouvrirHorloges = () => ouvrirCarnet("horloges");
// cle : le réglage qui a changé (horloges, enquetes, contacts) : seule sa part est redessinée, avec les onglets (leurs nombres) ;
// sans clé, toute la fenêtre.
export function rafraichirCarnet(cle = null) {
  if (!fenetre?.rendered) return;
  fenetre.render(ONGLETS.includes(cle) ? { parts: ["onglets", cle] } : {});
}
