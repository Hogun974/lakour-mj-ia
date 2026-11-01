// Fenêtre du choix secret : s'ouvre chez le seul joueur concerné. Question, options, « Valider », « Passer ».
// Fermer la fenêtre ou laisser filer le délai revient à passer. La réponse ne part que vers le MJ actif.
import { ID } from "../constantes.js";
import { demarrerMinuteur } from "./minuteur.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FenetreChoixSecret extends HandlebarsApplicationMixin(ApplicationV2) {
  // demande : { id, titre, question, options: [texte], delai, finit } ; rappels : { repondre(index | null), fermee() }
  constructor(demande, rappels = {}, options = {}) {
    super({ ...options, id: `${ID}-choix-${demande.id}` });
    this.demande = demande;
    this.rappels = rappels;
    this.selection = null;
    this.repondu = false;
    this.annulee = false;
  }

  static DEFAULT_OPTIONS = {
    classes: [ID, "lakour-mjia-decision", "secret"],
    window: { title: "LAKOUR_MJIA.Decisions.ChoixTitre", icon: "fa-solid fa-user-secret" },
    position: { width: 440, height: "auto" },
    actions: { choisir: FenetreChoixSecret.#choisir, valider: FenetreChoixSecret.#valider, passer: FenetreChoixSecret.#passer }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/choix-secret.hbs` } };

  async _prepareContext() {
    const d = this.demande;
    return {
      titre: d.titre, question: d.question,
      options: d.options.map((libelle, index) => ({ index, libelle, choisi: this.selection === index })),
      peutValider: this.selection !== null
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    demarrerMinuteur(this, this.demande.finit, () => this.close());
  }

  async _onClose(options) {
    clearInterval(this._minuterie);
    if (!this.repondu && !this.annulee) this.repondre(null);
    this.rappels.fermee?.();
    return super._onClose(options);
  }

  repondre(index) {
    if (this.repondu) return false;
    this.repondu = true;
    this.rappels.repondre?.(index);
    return true;
  }

  choisir(index) {
    if (!this.demande.options[index]) return false;
    this.selection = index;
    this.render();
    return true;
  }

  async valider() {
    if (this.selection === null) return false;
    this.repondre(this.selection);
    await this.close();
    return true;
  }

  async passer() {
    this.repondre(null);
    await this.close();
  }

  static #choisir(event, cible) {
    this.choisir(Number(cible.dataset.index));
  }

  static async #valider() {
    await this.valider();
  }

  static async #passer() {
    await this.passer();
  }
}
