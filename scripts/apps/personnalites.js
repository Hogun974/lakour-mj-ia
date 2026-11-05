import { ID, VOIX_OPENAI } from "../constantes.js";
import { lire, ecrire } from "../reglages.js";
import { PERSONNALITES_DE_BASE, voixDe } from "../personnalites.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
// Les choix d'un menu déroulant (valeur -> libellé traduit, LAKOUR_MJIA.Personnalites.<groupe>.<valeur>).
const choix = (groupe, valeurs) => Object.fromEntries(valeurs.map(v => [v, game.i18n.localize(`LAKOUR_MJIA.Personnalites.${groupe}.${v}`)]));

// Édition des personnalités du MJ IA : ton, violence, longueur, rigueur et consignes libres.
export class EditeurPersonnalites extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-personnalites`,
    tag: "form",
    classes: [ID],
    window: { title: "LAKOUR_MJIA.Personnalites.Titre", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 640, height: 720 },
    form: { handler: EditeurPersonnalites.#enregistrer, closeOnSubmit: false, submitOnChange: false },
    actions: {
      ajouter: EditeurPersonnalites.#ajouter,
      supprimer: EditeurPersonnalites.#supprimer,
      reinitialiser: EditeurPersonnalites.#reinitialiser
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/personnalites.hbs`, scrollable: [".lakour-mjia-liste"] } };

  async _prepareContext() {
    return {
      active: lire("personnaliteActive"),
      // Les personnalités enregistrées avant l'ajout de la voix affichent la voix par défaut.
      personnalites: lire("personnalites").map(p => { const { voix, ton } = voixDe(p); return { ...p, voixOpenAI: voix, tonVoix: ton }; }),
      violences: choix("Violences", [1, 2, 3]),
      longueurs: choix("Longueurs", ["courte", "moyenne", "longue"]),
      rigueurs: choix("Rigueurs", ["souple", "normale", "stricte"]),
      improvisations: choix("Improvisations", ["fidele", "adaptative", "libre"]),
      voixOpenAI: Object.fromEntries(VOIX_OPENAI.map(v => [v, v]))
    };
  }

  // Le formulaire envoie p.<index>.<champ> : on reconstruit la liste dans l'ordre.
  static #lireFormulaire(formData) {
    const donnees = foundry.utils.expandObject(formData.object);
    const liste = Object.values(donnees.p ?? {}).map(p => ({ ...p, violence: Number(p.violence) }));
    return { liste, active: donnees.active };
  }

  static async #enregistrer(event, form, formData) {
    const { liste, active } = EditeurPersonnalites.#lireFormulaire(formData);
    await ecrire("personnalites", liste);
    await ecrire("personnaliteActive", liste.some(p => p.id === active) ? active : liste[0]?.id);
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Personnalites.Enregistre"));
    this.render();
  }

  // Ajouter / supprimer enregistrent d'abord les modifications en cours, pour ne pas les perdre.
  static async #ajouter() {
    await this.submit();
    const liste = lire("personnalites");
    liste.push({ id: foundry.utils.randomID(), nom: game.i18n.localize("LAKOUR_MJIA.Personnalites.Nouvelle"),
      nomAffiche: game.i18n.localize("LAKOUR_MJIA.Personnalites.NouvelleNomAffiche"), violence: 2, longueur: "moyenne", rigueur: "normale", consignes: "" });
    await ecrire("personnalites", liste);
    this.render();
  }

  static async #supprimer(event, bouton) {
    await this.submit();
    const liste = lire("personnalites").filter(p => p.id !== bouton.dataset.id);
    if (!liste.length) return;
    await ecrire("personnalites", liste);
    this.render();
  }

  static async #reinitialiser() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "LAKOUR_MJIA.Personnalites.Reinitialiser" },
      content: `<p>${game.i18n.localize("LAKOUR_MJIA.Personnalites.ConfirmerReinit")}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await ecrire("personnalites", PERSONNALITES_DE_BASE);
    await ecrire("personnaliteActive", PERSONNALITES_DE_BASE[0].id);
    this.render();
  }
}
