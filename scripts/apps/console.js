import { ID, MODELES_ANTHROPIC, prixOpenAI } from "../constantes.js";
import { lire, ecrire } from "../reglages.js";
import { ConfigIA } from "./config-ia.js";
import { EditeurPersonnalites } from "./personnalites.js";
import { reinitialiserCampagne } from "../reinitialiser.js";
import { voixDuMonde, activerAudio, donnerMicro } from "../voix-monde.js";
import { horlogesDisponibles } from "../horloges-logique.js";
import { libelleModele } from "../utilitaires.js";

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
      arreterPilote: function () { this.moteur.pilote.arreter("manuel"); this.render(); },
      relancerPilote: function () {
        if (!this.moteur.pilote.relancer()) ui.notifications.warn(game.i18n.localize("LAKOUR_MJIA.Pilote.PasMaintenant"));
        this.render();
      },
      reinitialiser: async function () { await reinitialiserCampagne(this.moteur); this.render(); },
      // La voix de Foundry : réparée d'un clic (audio seul, micro des joueurs).
      voixActiver: async function () {
        await activerAudio();
        ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.VoixMonde.Activee"));
        this.render();
      },
      voixMicro: async function () {
        await donnerMicro();
        ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.VoixMonde.MicroDonne"));
        this.render();
      },
      horloges: () => game.modules.get(ID).api.carnet(),
      config: () => new ConfigIA().render({ force: true }),
      personnalites: () => new EditeurPersonnalites().render({ force: true })
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/console.hbs` } };

  get moteur() { return game.modules.get(ID).api.moteur; }

  async _prepareContext() {
    const seance = lire("seance");
    const fournisseur = lire("fournisseur");
    const modele = fournisseur === "anthropic" ? (MODELES_ANTHROPIC[lire("modeleAnthropic")] ? libelleModele(lire("modeleAnthropic")) : undefined)
      : fournisseur === "openai" ? lire("modeleOpenAI") : "factice";
    const personnalites = lire("personnalites");
    // Pilote automatique : en marche, en pause (relançable si la situation s'y prête), ou rien à montrer.
    const pilote = this.moteur?.pilote;
    const etatPilote = pilote?.resume();
    const relancable = Boolean(pilote && !etatPilote.enMarche && pilote.suspendu && pilote.conditions().ok);
    const voix = voixDuMonde();
    return {
      voix: voix.pret ? null : { ...voix, muets: voix.muets.join(", ") },
      pilote: etatPilote?.enMarche || relancable ? { ...etatPilote, relancable } : null,
      seance,
      enCours: this.moteur?.enCours,
      modele,
      personnalite: personnalites.find(p => p.id === lire("personnaliteActive"))?.nom,
      personnalites: Object.fromEntries(personnalites.map(p => [p.id, p.nom])),
      active: lire("personnaliteActive"),
      cout: seance.cout.toFixed(2),
      horsSeance: game.system.id === "lakour-loups" ? (lire("compagnonsHorsSeance")?.cout ?? 0).toFixed(2) : null,
      budget: lire("budgetSeance"),
      jetons: seance.jetons,
      prixConnus: fournisseur === "anthropic" || (fournisseur === "openai" && Boolean(prixOpenAI(lire("modeleOpenAI")))),
      creationPossible: game.system.id === "impmal",
      horloges: horlogesDisponibles(game.system.id),
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
