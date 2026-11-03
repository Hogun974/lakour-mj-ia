import { ID } from "../constantes.js";
import { etatCoffre, secoursConseille, secoursExportee, brancherRappel, exporterSecours, importerSecours, chercherCoffre, renouveler,
  abandonnerCoffre } from "../coffre.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Fenêtre « Coffre du MJ IA » (Réglages › MJ IA, MJ seulement, dans les trois mondes) : l'état de la clé (porteurs de parts
// accusées / seuil, renouvellement en cours), et la CLÉ DE SECOURS : un fichier téléchargé par le MJ, réimporté sur un autre
// navigateur, avec la date de son dernier téléchargement pour la clé en vigueur (bandeau). La clé n'est jamais affichée ; elle ne
// passe ni par un réglage monde, ni par le chat, ni par Data/, ni par le socket.
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
    const exportee = secoursExportee();
    return {
      mj: game.user.isGM, etat: e.etat, texteEtat: game.i18n.localize(`LAKOUR_MJIA.Coffre.Etats.${e.etat}`),
      porteurs: e.porteurs ?? 0, seuil: e.seuil ?? 2, comptes: e.comptes ?? 0, renouvellement: e.renouvellement,
      secours: secoursConseille(), attente: e.etat === "attente",
      // La clé en vigueur est dans ce navigateur : sa clé de secours a-t-elle été téléchargée d'ici, et quand (date locale) ?
      cleIci: ["vide", "ouvert", "ouverture"].includes(e.etat), secoursDate: exportee ? dateLocale(exportee) : ""
    };
  }
}

function dateLocale(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try { return d.toLocaleString(game.i18n?.lang || undefined, { dateStyle: "long", timeStyle: "short" }); } catch { return d.toLocaleString(); }
}

// Une clé vient d'être créée ou d'entrer en vigueur dans ce navigateur sans clé de secours (coffre.js) : « Télécharge ta clé de
// secours maintenant ». Le bouton télécharge (exporterSecours) ; « Plus tard » laisse le rappel au chargement suivant.
async function rappelSecours() {
  const choix = await foundry.applications.api.DialogV2.wait({
    window: { title: "LAKOUR_MJIA.Coffre.Rappel.Titre", icon: "fa-solid fa-key" },
    content: `<p>${game.i18n.localize("LAKOUR_MJIA.Coffre.Rappel.Texte")}</p><p class="hint">${game.i18n.localize("LAKOUR_MJIA.Coffre.Fenetre.Aide")}</p>`,
    buttons: [
      { action: "exporter", label: "LAKOUR_MJIA.Coffre.Fenetre.Exporter", icon: "fa-solid fa-download", default: true },
      { action: "plusTard", label: "LAKOUR_MJIA.Coffre.Rappel.PlusTard", icon: "fa-solid fa-clock" }
    ],
    rejectClose: false
  });
  if (choix !== "exporter") return false;
  await agir({ render: () => fenetre?.rendered && fenetre.render() }, () => exporterSecours());
  return true;
}
// Au « ready » (main.js), avant brancherCoffre : la fenêtre de rappel est celle-ci.
export const brancherRappelSecours = () => brancherRappel(rappelSecours);

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
