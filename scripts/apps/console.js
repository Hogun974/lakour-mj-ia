import { ID, MODELES_ANTHROPIC, prixOpenAI } from "../constantes.js";
import { lire, ecrire } from "../reglages.js";
import { ConfigIA } from "./config-ia.js";
import { EditeurPersonnalites } from "./personnalites.js";
import { reinitialiserCampagne } from "../reinitialiser.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Console du MJ humain : démarrer / arrêter la séance, suivre le coût, souffler une consigne
// à l'IA, lui faire préparer un scénario.
export class ConsoleMJ extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-console`,
    classes: [ID],
    window: { title: "LAKOUR_MJIA.Console.Titre", icon: "fa-solid fa-hat-wizard", resizable: true },
    position: { width: 480, height: "auto" },
    actions: {
      demarrer: ConsoleMJ.#demarrer,
      arreter: ConsoleMJ.#arreter,
      souffler: ConsoleMJ.#souffler,
      scenario: ConsoleMJ.#scenario,
      creation: ConsoleMJ.#creation,
      vision: ConsoleMJ.#vision,
      reinitialiser: async function () { await reinitialiserCampagne(this.moteur); this.render(); },
      config: () => new ConfigIA().render({ force: true }),
      personnalites: () => new EditeurPersonnalites().render({ force: true })
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/console.hbs` } };

  get moteur() { return game.modules.get(ID).api.moteur; }

  async _prepareContext() {
    const seance = lire("seance");
    const fournisseur = lire("fournisseur");
    const modele = fournisseur === "anthropic" ? MODELES_ANTHROPIC[lire("modeleAnthropic")]?.libelle
      : fournisseur === "openai" ? lire("modeleOpenAI") : "factice";
    const personnalites = lire("personnalites");
    return {
      seance,
      enCours: this.moteur?.enCours,
      modele,
      personnalite: personnalites.find(p => p.id === lire("personnaliteActive"))?.nom,
      personnalites: Object.fromEntries(personnalites.map(p => [p.id, p.nom])),
      active: lire("personnaliteActive"),
      cout: seance.cout.toFixed(2),
      budget: lire("budgetSeance"),
      jetons: seance.jetons,
      prixConnus: fournisseur === "anthropic" || (fournisseur === "openai" && Boolean(prixOpenAI(lire("modeleOpenAI")))),
      creationPossible: game.system.id === "impmal",
      joueurs: Object.fromEntries(game.users.filter(u => !u.isGM).map(u => [u.name, u.name]).concat([[game.user.name, `${game.user.name} (MJ)`]]))
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector("[name=personnalite]")?.addEventListener("change", async e => {
      await ecrire("personnaliteActive", e.target.value);
      ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Console.PersonnaliteProchaine"));
    });
  }

  static async #demarrer() {
    await this.moteur.demarrer();
    this.render();
  }

  static async #arreter() {
    await this.moteur.arreter();
    this.render();
  }

  // Consigne du MJ humain, que seule l'IA voit (ex. « fais intervenir un assassin »).
  static async #souffler() {
    const champ = this.element.querySelector("[name=consigne]");
    const texte = champ?.value.trim();
    if (!texte || !lire("seance").active) return;
    champ.value = "";
    await this.moteur.tour(`[Consigne secrète du MJ humain, à appliquer sans la mentionner]\n${texte}`);
    this.render();
  }

  // Création de personnage guidée par l'IA avec un joueur : jets de dés et choix dans le chat.
  static async #creation() {
    const joueur = this.element.querySelector("[name=joueurCreation]")?.value;
    if (!joueur) return;
    ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Console.CreationLancee", { joueur }));
    await this.moteur.creerPersonnage(joueur);
    this.render();
  }

  // Active la vision des personnages des joueurs (modèle de jeton et jetons déjà posés sur les scènes) :
  // sur une carte à vision par jeton, un jeton sans vision laisse son joueur dans le noir.
  static async #vision() {
    const persos = game.actors.filter(a => a.hasPlayerOwner);
    let modeles = 0, jetons = 0;
    for (const a of persos) {
      if (!a.prototypeToken.sight.enabled) { await a.update({ "prototypeToken.sight.enabled": true }); modeles++; }
    }
    for (const scene of game.scenes) {
      const maj = scene.tokens.filter(t => t.actor?.hasPlayerOwner && !t.sight.enabled).map(t => ({ _id: t.id, "sight.enabled": true }));
      if (maj.length) { await scene.updateEmbeddedDocuments("Token", maj); jetons += maj.length; }
    }
    ui.notifications.info(game.i18n.format("LAKOUR_MJIA.Console.VisionFaite", { persos: persos.length, modeles, jetons }));
  }

  static async #scenario() {
    const theme = this.element.querySelector("[name=theme]")?.value.trim();
    if (!theme) return ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Console.ThemeManquant"));
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Console.ScenarioEnCours"));
    await this.moteur.genererScenario(theme);
    ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Console.ScenarioPret"));
    this.render();
  }
}
