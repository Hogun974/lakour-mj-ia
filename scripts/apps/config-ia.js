import { ID, MODELES_ANTHROPIC, EFFORTS } from "../constantes.js";
import { lire, ecrire } from "../reglages.js";
import { FournisseurAnthropic } from "../fournisseurs/anthropic.js";
import { FournisseurOpenAI } from "../fournisseurs/openai.js";
import { expliquerErreur } from "../fournisseurs/index.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Fournisseur, modèles et clés. Les clés sont des réglages « client » : elles restent dans
// le navigateur où on les saisit (celui du MJ) et ne sont jamais réaffichées en clair.
export class ConfigIA extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-config`,
    tag: "form",
    classes: [ID],
    window: { title: "LAKOUR_MJIA.ConfigIA.Titre", icon: "fa-solid fa-key" },
    position: { width: 560, height: "auto" },
    form: { handler: ConfigIA.#enregistrer, closeOnSubmit: true },
    actions: { verifier: ConfigIA.#verifier }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/config-ia.hbs` } };

  async _prepareContext() {
    return {
      fournisseur: lire("fournisseur"),
      fournisseurs: { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", factice: "Factice (essais, gratuit)" },
      modeleAnthropic: lire("modeleAnthropic"),
      modelesAnthropic: Object.fromEntries(Object.entries(MODELES_ANTHROPIC).map(([k, v]) => [k, v.libelle])),
      modeleOpenAI: lire("modeleOpenAI"),
      modeleImage: lire("modeleImage"),
      effort: lire("effort"),
      efforts: Object.fromEntries(EFFORTS.map(e => [e, game.i18n.localize(`LAKOUR_MJIA.Efforts.${e}`)])),
      aCleAnthropic: Boolean(lire("cleAnthropic")),
      aCleOpenAI: Boolean(lire("cleOpenAI"))
    };
  }

  static async #enregistrer(event, form, formData) {
    const d = formData.object;
    await ecrire("fournisseur", d.fournisseur);
    await ecrire("modeleAnthropic", d.modeleAnthropic);
    await ecrire("modeleOpenAI", d.modeleOpenAI.trim());
    await ecrire("modeleImage", d.modeleImage.trim());
    await ecrire("effort", d.effort);
    // Champ vide = on garde la clé déjà enregistrée ; « effacer » coché = on la supprime.
    for (const [champ, reglage] of [["cleAnthropic", "cleAnthropic"], ["cleOpenAI", "cleOpenAI"]]) {
      if (d[`effacer_${champ}`]) await ecrire(reglage, "");
      else if (d[champ]?.trim()) await ecrire(reglage, d[champ].trim());
    }
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.ConfigIA.Enregistre"));
  }

  // Liste les modèles accessibles avec la clé : appel gratuit, qui prouve que la clé fonctionne.
  static async #verifier(event, bouton) {
    const quoi = bouton.dataset.fournisseur;
    const saisie = this.element.querySelector(`[name=${quoi === "anthropic" ? "cleAnthropic" : "cleOpenAI"}]`)?.value.trim();
    const cle = saisie || lire(quoi === "anthropic" ? "cleAnthropic" : "cleOpenAI");
    if (!cle) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Erreurs.PasDeCle"));
    try {
      const f = quoi === "anthropic" ? new FournisseurAnthropic({ cle }) : new FournisseurOpenAI({ cle });
      const page = await f.client.models.list();
      const ids = (page.data ?? []).map(m => m.id);
      ui.notifications.info(game.i18n.format("LAKOUR_MJIA.ConfigIA.CleValide", { n: ids.length }));
    } catch (erreur) {
      ui.notifications.error(expliquerErreur(erreur));
    }
  }
}
