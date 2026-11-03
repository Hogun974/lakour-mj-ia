// Carnet de campagne (40k, Warcraft ; pas aux Veillées) : le tableau d'enquête et le registre des contacts, rangés dans les
// réglages monde « enquetes » et « contacts » (registre-monde.js : écrits par le seul MJ actif ; en clair, la seule part
// publique des éléments visibles, le reste chiffré au coffre du Carnet, coffre.js). L'API des modules des mondes
// (game.modules.get("lakour-mj-ia").api.enquetes / .contacts), les gestes de la fenêtre (apps/carnet.js) et le résumé donné à
// l'IA. La logique pure : enquetes-logique.js, contacts-logique.js. Les horloges ont leur propre module (horloges.js).
import { estMJActif, recevoir, versMJ, ecouterCanal, envoyer } from "./canal.js";
import { plier } from "./recherche-nom.js";
import { registreMonde } from "./registre-monde.js";
import * as E from "./enquetes-logique.js";
import * as C from "./contacts-logique.js";
import { idNeuf, publiqueChange } from "./secrets-logique.js";

export const enquetes = registreMonde("enquetes");
export const contacts = registreMonde("contacts");
// L'identifiant d'un élément neuf sans identifiant donné : caché, tiré au hasard ; visible, tiré du nom sans trahir un caché.
const idPour = (def, liste, champ, prefixe) => {
  const nom = String(def?.[champ] ?? "").trim();
  return String(def?.id ?? "").trim() || (nom ? idNeuf(nom, liste, { visible: Boolean(def?.visible), prefixe }) : "");
};
// maj (l'enquête en cours, les contacts récents) ne bouge que si la part publique change : un changement purement secret d'un
// élément visible ne réécrit rien en clair.
const dater = (registre, avant, apres, liste) => ({ ...apres, maj: publiqueChange(registre, avant, apres) ? E.horodatage(liste) : avant.maj });
// Une définition déjà au registre : par son id, ou, sans id, par son titre ou son nom (assurer reste idempotent sans id).
const dejaLa = (liste, def, champ) => {
  const id = String(def?.id ?? "").trim();
  if (id) return liste.find(x => x.id === id) ?? null;
  const nom = plier(def?.[champ]);
  return nom ? liste.find(x => plier(x[champ]) === nom) ?? null : null;
};

// ------------------------------------------------------------------ enquêtes
// Crée l'enquête si elle n'existe pas (par id, ou sans id par son titre), sinon la laisse telle quelle ; la rend. Hors du MJ
// actif, rien n'est écrit. Neuve, elle devient l'enquête en cours (horodatage le plus récent).
export async function assurerEnquete(def) {
  const existante = dejaLa(enquetes.lire(), def, "titre");
  if (existante) return structuredClone(existante);
  const neuve = E.normaliserEnquete({ ...def, maj: E.horodatage(enquetes.lire()) }, enquetes.lire().map(e => e.id));
  if (!estMJActif()) return neuve;
  // Dans la file, la liste est complète (coffre ouvert) : l'identifiant d'une enquête neuve est choisi parmi toutes.
  return enquetes.modifier(liste => {
    const deja = dejaLa(liste, def, "titre");
    if (deja) return { liste, resultat: deja };
    const e = E.normaliserEnquete({ ...def, id: idPour(def, liste, "titre", "enquete"), maj: E.horodatage(liste) }, liste.map(x => x.id));
    return { liste: [...liste, e], resultat: e };
  });
}

// L'enquête visée (titre ou id ; vide : l'enquête en cours, à défaut la plus récente), copiée.
export function trouverEnquete(ref = "") {
  const liste = enquetes.lire();
  return structuredClone(String(ref ?? "").trim() ? E.trouverEntree(liste, ref, "titre") : E.enqueteParDefaut(liste));
}

// Modifie une enquête : fn(enquete) -> { enquete, entree } (peut lever une erreur, rendue telle quelle). -> { enquete, entree } ou null.
export function modifierEnquete(ref, fn) {
  return enquetes.modifier(liste => {
    const e = ref ? E.trouverEntree(liste, ref, "titre") : E.enqueteParDefaut(liste);
    if (!e) return null;
    const r = fn(e);
    const enquete = dater("enquetes", e, r.enquete, liste);
    return { liste: liste.map(x => (x.id === e.id ? enquete : x)), resultat: { enquete, entree: r.entree } };
  });
}

export const retirerEnquete = ref => enquetes.modifier(liste => {
  const e = E.trouverEntree(liste, ref, "titre");
  return e ? { liste: liste.filter(x => x.id !== e.id), resultat: e } : null;
});

// ------------------------------------------------------------------ contacts
// Crée le contact s'il n'existe pas (par id, ou sans id par son nom), sinon le laisse tel quel ; le rend.
export async function assurerContact(def) {
  const existant = dejaLa(contacts.lire(), def, "nom");
  if (existant) return structuredClone(existant);
  const neuf = C.normaliserContact({ ...def, maj: E.horodatage(contacts.lire()) }, contacts.lire().map(c => c.id));
  if (!estMJActif()) return neuf;
  return contacts.modifier(liste => {
    const deja = dejaLa(liste, def, "nom");
    if (deja) return { liste, resultat: deja };
    const c = C.normaliserContact({ ...def, id: idPour(def, liste, "nom", "contact"), maj: E.horodatage(liste) }, liste.map(x => x.id));
    return { liste: [...liste, c], resultat: c };
  });
}

export const trouverContact = ref => structuredClone(C.trouverContact(contacts.lire(), ref));

// fn(contact) -> contact modifié (ou { contact, … }). -> le résultat de fn, contact daté, ou null.
export function modifierContact(ref, fn) {
  return contacts.modifier(liste => {
    const c = C.trouverContact(liste, ref);
    if (!c) return null;
    const r = fn(c);
    const contact = dater("contacts", c, r.contact ?? r, liste);
    return { liste: liste.map(x => (x.id === c.id ? contact : x)), resultat: { ...(r.contact ? r : {}), contact } };
  });
}

export const retirerContact = ref => contacts.modifier(liste => {
  const c = C.trouverContact(liste, ref);
  return c ? { liste: liste.filter(x => x.id !== c.id), resultat: c } : null;
});

// ------------------------------------------------------------------ l'IA (contexte.js)
// scene : la scène active (ses jetons disent quels PNJ sont là, son nom quel est le lieu).
export function resumeCarnetPourIA(scene = globalThis.game?.scenes?.active) {
  const liste = enquetes.lire();
  const enCours = E.enqueteEnCours(liste);
  const close = enCours ? null : E.derniereClose(liste);
  // Toutes closes : une seule ligne, sans « indices à trouver ».
  const lignes = enCours ? E.resumeEnquete({ ...enCours, autres: liste.length - 1 })
    : close ? [`Dernière enquête close : « ${close.titre} » (toutes ses conclusions sont révélées).`] : [];
  const acteurs = (scene?.tokens?.contents ?? []).flatMap(t => [t.actor?.uuid, t.actorId]).filter(Boolean);
  lignes.push(...C.resumeContacts(contacts.lire(), { acteurs, lieu: scene ? scene.navName || scene.name : "" }));
  return lignes;
}

// ------------------------------------------------------------------ gestes de la fenêtre (MJ)
// Chez le MJ actif directement (une erreur remonte à la fenêtre) ; sinon par le canal du module jusqu'à lui, qui renvoie une
// erreur éventuelle à l'émetteur (« carnet.erreur »). Un élément introuvable est une erreur.
export async function gesteCarnet(message) {
  if (!estMJActif()) return versMJ({ type: "carnet.geste", ...message });
  const r = await executerGeste(message);
  if (r === null) throw new Error(`élément introuvable (${message.enquete || message.contact || "?"})`);
  return r;
}
function executerGeste({ action, enquete, entree, contact, valeur }) {
  switch (action) {
    case "indice": return modifierEnquete(enquete, e => E.marquerIndice(e, entree, Boolean(valeur)));
    case "conclusion": return modifierEnquete(enquete, e => E.marquerConclusion(e, entree, Boolean(valeur)));
    case "enqueteVisible": return modifierEnquete(enquete, e => ({ enquete: { ...e, visible: Boolean(valeur) }, entree: null }));
    case "attitude": return modifierContact(contact, c => C.changerAttitude(c, Number(valeur) || 0, "à la table"));
    case "contactVisible": return modifierContact(contact, c => ({ ...c, visible: Boolean(valeur) }));
    default: return null;
  }
}
// Le geste d'un autre MJ, exécuté chez le MJ actif ; en cas d'échec, l'émetteur est prévenu (sa fenêtre se redessine).
export async function recevoirGeste(message, emetteur) {
  if (!game.users.get(emetteur)?.isGM) return false;
  try {
    return await gesteCarnet(message);
  } catch (e) {
    envoyer({ type: "carnet.erreur", texte: e.message }, [emetteur]);
    return false;
  }
}
export function brancherCarnet() {
  recevoir("carnet.geste", recevoirGeste, { pourMJ: true });
  recevoir("carnet.erreur", message => {
    globalThis.ui?.notifications?.error(String(message.texte ?? ""));
    game.modules.get("lakour-mj-ia")?.api?.horloges?.rafraichir?.();
  });
  ecouterCanal();
}
