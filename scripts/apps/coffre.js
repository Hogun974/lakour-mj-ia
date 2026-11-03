import { ID } from "../constantes.js";
import { etatCoffre, secoursConseille, exporterSecours, importerSecours, chercherCoffre, renouveler, abandonnerCoffre } from "../coffre.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Fenêtre « Coffre du MJ IA » (Réglages › MJ IA, MJ seulement, dans les trois mondes) : l'état de la clé (porteurs de parts
// accusées / seuil, renouvellement en cours), et la CLÉ DE SECOURS : un fichier téléchargé par le MJ, réimporté sur un autre
// navigateur. La clé n'est jamais affichée ; elle ne passe ni par un réglage monde, ni par le chat, ni par Data/, ni par le socket.
export class FenetreCoffre extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-coffre`,
    classes: [ID],
    window: { title: "LAKOUR_MJIA.Coffre.Fenetre.Titre", icon: "fa-solid fa-vault" },
    position: { width: 480, height: "auto" },
    actions: {
      exporter: function () { return agir(this, () => exporterSecours()); },
      importer: function () { return choisirFichier(this); },
      chercher: function () { return agir(this, () => chercherCoffre()); },
      renouveler: function () { return agir(this, () => renouveler()); },
      abandonner: function () { return abandonner(this); }
    }
  };

  static PARTS = { corps: { template: `modules/${ID}/templates/coffre.hbs` } };

  async _prepareContext() {
    const e = etatCoffre();
    return {
      mj: game.user.isGM, etat: e.etat, texteEtat: game.i18n.localize(`LAKOUR_MJIA.Coffre.Etats.${e.etat}`),
      porteurs: e.porteurs ?? 0, seuil: e.seuil ?? 2, comptes: e.comptes ?? 0, renouvellement: e.renouvellement,
      secours: secoursConseille(), attente: e.etat === "attente"
    };
  }
}

async function agir(app, fn) {
  try {
    await fn();
  } catch (erreur) {
    console.error(`${ID} | coffre`, erreur);
    ui.notifications.error(erreur.message);
  }
  app.render();
}

// La clé perdue (aucun navigateur ne l'a plus, aucune clé de secours, trop peu de parts) : repartir d'une clé neuve, après
// confirmation. Les éléments cachés du Carnet et les fils de l'IA scellés avec l'ancienne clé deviennent illisibles pour de bon.
async function abandonner(app) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "LAKOUR_MJIA.Coffre.Fenetre.AbandonnerTitre" },
    content: `<p>${game.i18n.localize("LAKOUR_MJIA.Coffre.Fenetre.AbandonnerConfirmer")}</p>`
  });
  if (!ok) return;
  await agir(app, async () => {
    if (await abandonnerCoffre({ confirmer: true })) ui.notifications.info(game.i18n.localize("LAKOUR_MJIA.Coffre.Abandonne"));
  });
}

// La clé de secours, choisie sur le disque (jamais déposée nulle part).
function choisirFichier(app) {
  const champ = document.createElement("input");
  champ.type = "file";
  champ.accept = "application/json,.json";
  champ.addEventListener("change", () => {
    const fichier = champ.files?.[0];
    if (!fichier) return;
    agir(app, async () => {
      const n = await importerSecours(fichier);
      ui.notifications[n ? "info" : "warn"](game.i18n.format("LAKOUR_MJIA.Coffre.SecoursImporte", { n }));
    });
  });
  champ.click();
}

let fenetre = null;
export function ouvrirCoffre() {
  fenetre ??= new FenetreCoffre();
  return fenetre.render({ force: true });
}
