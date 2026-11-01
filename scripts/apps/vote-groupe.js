// Fenêtre du vote de groupe : s'ouvre chez chaque joueur visé, se ferme à la clôture (ou à la fin du délai).
// On peut changer d'avis tant que le vote est ouvert ; les voix des autres restent cachées, seul leur nombre s'affiche.
// Fermer la fenêtre sans voter, c'est ne pas répondre.
import { ID } from "../constantes.js";
import { demarrerMinuteur } from "./minuteur.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FenetreVoteGroupe extends HandlebarsApplicationMixin(ApplicationV2) {
  // demande : { id, question, options: [{ libelle, img }], delai, finit, total } ; rappels : { voter(index | null), fermee() }
  constructor(demande, rappels = {}, options = {}) {
    super({ ...options, id: `${ID}-vote-${demande.id}` });
    this.demande = demande;
    this.rappels = rappels;
    this.maVoix = undefined;   // undefined : pas encore voté ; null : abstention
    this.exprimes = 0;
    this.annulee = false;
  }

  static DEFAULT_OPTIONS = {
    classes: [ID, "lakour-mjia-decision"],
    window: { title: "LAKOUR_MJIA.Decisions.VoteTitre", icon: "fa-solid fa-check-to-slot" },
    position: { width: 460, height: "auto" },
    actions: { voter: FenetreVoteGroupe.#voter, abstenir: FenetreVoteGroupe.#abstenir }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/vote-groupe.hbs` } };

  async _prepareContext() {
    const d = this.demande;
    return {
      question: d.question,
      options: d.options.map((o, index) => ({ index, libelle: o.libelle, img: o.img, choisi: this.maVoix === index })),
      exprimes: this.exprimes, total: d.total,
      aVote: this.maVoix !== undefined, abstenu: this.maVoix === null,
      maVoix: this.maVoix === undefined || this.maVoix === null ? "" : d.options[this.maVoix]?.libelle ?? ""
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Le MJ clôt à l'échéance ; une seconde de grâce, puis la fenêtre se ferme d'elle-même (MJ parti, réseau coupé).
    demarrerMinuteur(this, this.demande.finit, () => setTimeout(() => this.close(), 1000));
  }

  async _onClose(options) {
    clearInterval(this._minuterie);
    this.rappels.fermee?.();
    return super._onClose(options);
  }

  // index : une option, ou null pour s'abstenir.
  voter(index) {
    if (index !== null && !this.demande.options[index]) return false;
    this.maVoix = index;
    this.rappels.voter?.(index);
    this.render();
    return true;
  }

  progression(exprimes) {
    this.exprimes = exprimes;
    this.render();
  }

  static #voter(event, cible) {
    this.voter(Number(cible.dataset.index));
  }

  static #abstenir() {
    this.voter(null);
  }
}
