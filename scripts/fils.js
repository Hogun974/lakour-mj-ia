// Le fil de l'IA et ses archives, CHIFFRÉS (essais/coffre-carnet.test.mjs). Foundry sert Data/ sans authentification : un
// joueur qui connaît l'adresse (Data/lakour-mj-ia/fils/<monde>.json) lirait sinon l'état du jeu donné à l'IA à chaque tour
// (horloges cachées, indices, notes ; aux Veillées, la distribution des rôles). Chaque fichier y est donc un objet scellé
// { chiffre, id, iv, donnees } (coffre-logique.js), avec la clé du coffre (coffre.js), dans tous les mondes.
// - Lire : un fil scellé s'ouvre avec la clé de son id ; un ancien fil en clair est lu tel quel (chiffré au démarrage ou à la
//   prochaine sauvegarde). Scellé avec une clé que ce navigateur n'a pas mais que le trousseau connaît : VERROUILLÉ, ses parts
//   sont demandées ; l'IA repart d'un fil vide, et ce fichier n'est pas écrasé tant que la clé n'est pas revenue. Scellé avec
//   une clé que plus personne ne connaît (coffre abandonné) : gardé à part, illisible.
// - Écrire : dans la file du coffre (un renouvellement ne croise pas une sauvegarde), avec la clé en vigueur ; sans elle, rien.
// - Clé là (démarrage, réouverture) : les fichiers en clair sont chiffrés à leur place, ceux scellés avec une ancienne clé
//   connue sont rescellés ; un fil verrouillé est gardé sous un autre nom avant que le fil en cours ne prenne sa place. Le
//   réglage monde « filsScelles » ({ nom: id de clé }, rien de secret) dit ce qui est déjà fait : rien n'est relu pour rien.
// - Renouvellement validé : chaque fichier est rescellé avec la nouvelle clé (une erreur l'interrompt : l'ancienne reste).
import { ID, DOSSIER_DONNEES } from "./constantes.js";
import { lireJSON, ecrireJSON } from "./utilitaires.js";
import { enFile, ouvrirScelle, scellerCourant, scellerAvec, cleCourante, idConnu, signalerId, siCleDisponible, siRenouvele } from "./coffre.js";
import { estScelle } from "./coffre-logique.js";

export const SOUS_DOSSIER = "fils";
const verrouilles = new Set();   // noms des fils scellés que ce navigateur n'a pas su ouvrir (clé connue, parts attendues)
let averti = false;

export function oublierFils() {
  verrouilles.clear();
  averti = false;
}
export const filsVerrouilles = () => [...verrouilles];

function avertir(cle, donnees = {}) {
  try {
    const texte = globalThis.game?.i18n?.format?.(`LAKOUR_MJIA.Coffre.${cle}`, donnees);
    if (texte) globalThis.ui?.notifications?.warn?.(texte);
  } catch { /* pas d'interface (essais) */ }
}

// Entrées et sorties (remplaçables dans les essais) : la liste des fichiers du dossier des fils, lire, écrire.
export const es = {
  async lister() {
    const FP = globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
    if (!FP?.browse) return [];
    try {
      const r = await FP.browse("data", `${DOSSIER_DONNEES}/${SOUS_DOSSIER}`);
      return (r?.files ?? []).map(f => decodeURIComponent(String(f).split("/").pop())).filter(n => n.endsWith(".json"));
    } catch { return []; }
  },
  lire: nom => lireJSON(SOUS_DOSSIER, nom).catch(() => null),
  ecrire: (nom, objet) => ecrireJSON(SOUS_DOSSIER, nom, objet)
};

// Ce qui est déjà scellé, et avec quelle clé : { nom: id }.
function memo() {
  try {
    const v = game.settings.get(ID, "filsScelles");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
async function noter(changements) {
  const avant = memo();
  if (Object.entries(changements).every(([nom, id]) => avant[nom] === id)) return;
  try { await game.settings.set(ID, "filsScelles", { ...avant, ...changements }); } catch { /* réglage absent (essais) */ }
}

// -> { fil, verrouille } : fil null si le fichier manque, ou s'il est verrouillé (verrouille: true).
export async function lireFil(nom) {
  const brut = await es.lire(nom);
  if (!brut || typeof brut !== "object") return { fil: null, verrouille: false };
  if (!estScelle(brut)) return { fil: brut, verrouille: false };   // ancien fil en clair
  const fil = await ouvrirScelle(brut);
  if (fil) {
    verrouilles.delete(nom);
    return { fil, verrouille: false };
  }
  // Une clé que le trousseau connaît : on attend ses parts (demandées par la file du coffre). Une clé que plus personne ne
  // connaît, alors qu'une clé est en vigueur (coffre abandonné) : le fichier illisible est gardé à part.
  if (!idConnu(brut.id) && cleCourante()) {
    await enFile(() => mettreDeCote(nom, brut));
    return { fil: null, verrouille: false };
  }
  verrouilles.add(nom);
  signalerId(brut.id);
  enFile(() => null).catch(() => null);   // la file du coffre demande aussitôt les parts de cette clé
  avertir("FilVerrouille", { nom });
  return { fil: null, verrouille: true };
}

const horodate = () => new Date().toISOString().replace(/[:.]/g, "-");
// Le contenu d'un fichier, tel quel, sous un autre nom (<nom>-avant-<date>.json) : jamais perdu.
async function mettreDeCote(nom, brut) {
  if (brut) await es.ecrire(nom.replace(/\.json$/, `-avant-${horodate()}.json`), brut);
  verrouilles.delete(nom);
}

// Sauvegarde un fil (ou une archive), scellé. -> true si écrit ; false sans clé, ou si ce fichier est verrouillé.
export function ecrireFil(nom, fil) {
  return enFile(async () => {
    if (verrouilles.has(nom)) return false;   // seconde garde : sans clé, scellerCourant ne scelle rien
    const scelle = await scellerCourant(fil);
    if (!scelle) {
      if (!averti) avertir("FilSansCle");
      averti = true;
      return false;
    }
    await es.ecrire(nom, scelle);
    await noter({ [nom]: scelle.id });
    return true;
  });
}

// Clé là (dans la file du coffre) : un fil verrouillé est gardé à part ; les fichiers pas encore scellés avec la clé en vigueur
// (en clair, ou sous une ancienne clé connue) le sont. -> le nombre de fichiers (re)scellés.
export async function chiffrerAnciens() {
  const courante = cleCourante();
  if (!courante) return 0;
  for (const nom of [...verrouilles]) await mettreDeCote(nom, await es.lire(nom));
  const deja = memo();
  const faits = {};
  let n = 0;
  for (const nom of await es.lister()) {
    if (deja[nom] === courante.id) continue;
    const brut = await es.lire(nom);
    if (!brut || typeof brut !== "object") continue;
    if (estScelle(brut) && brut.id === courante.id) { faits[nom] = brut.id; continue; }
    const contenu = estScelle(brut) ? await ouvrirScelle(brut) : brut;
    if (contenu === null) {
      if (idConnu(brut.id)) signalerId(brut.id);   // ses parts seront demandées
      continue;
    }
    const scelle = await scellerCourant(contenu);
    if (!scelle) continue;
    await es.ecrire(nom, scelle);
    faits[nom] = scelle.id;
    n++;
  }
  await noter(faits);
  averti = false;
  return n;
}

// Renouvellement validé (dans la file du coffre) : chaque fichier que ce navigateur sait ouvrir est rescellé avec la nouvelle
// clé. Une écriture qui échoue interrompt tout (l'ancienne clé reste en vigueur, coffre.js).
export async function rescellerFils(cle) {
  let n = 0;
  const faits = {};
  for (const nom of await es.lister()) {
    const brut = await es.lire(nom);
    if (!brut || typeof brut !== "object" || (estScelle(brut) && brut.id === cle.id)) continue;
    const contenu = estScelle(brut) ? await ouvrirScelle(brut) : brut;
    if (contenu === null) continue;
    const scelle = await scellerAvec(contenu, cle);
    await es.ecrire(nom, scelle);
    faits[nom] = cle.id;
    n++;
  }
  await noter(faits);
  return n;
}

siCleDisponible(chiffrerAnciens);
siRenouvele(rescellerFils);

// Pour une macro du MJ : le contenu d'un fil ou d'une archive (nom du fichier dans Data/lakour-mj-ia/fils/), ou null.
export async function lireArchive(nom) {
  const brut = await es.lire(nom);
  if (!brut) return null;
  return estScelle(brut) ? ouvrirScelle(brut) : brut;
}
