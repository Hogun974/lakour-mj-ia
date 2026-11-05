// Registre des contacts et des dettes : la logique pure, sans Foundry (essais/carnet.test.mjs). Le réglage monde « contacts »
// (reglages.js) est un tableau de contacts :
//   { id, nom, faction, lieu, attitude (-3 hostile … +3 allié), dette (qui doit quoi à qui ; "" = rien), demande (ce qu'il veut en
//     échange), visible (les joueurs le voient), notes, acteur (uuid d'un PNJ ; "" = aucun), maj, historique: [texte] }
// Les joueurs ne voient d'un contact visible ni ses notes, ni son historique : le réglage ne les a pas en clair (secrets-logique.js) ;
// elles, et les contacts cachés, sont chiffrés au coffre du Carnet (coffre.js).
import { idDepuisNom } from "./horloges-logique.js";
import { plier } from "./recherche-nom.js";

export const ATTITUDE_MIN = -3;
export const ATTITUDE_MAX = 3;
export const ATTITUDES = { "-3": "Hostile", "-2": "Méfiant", "-1": "Réservé", 0: "Neutre", 1: "Bienveillant", 2: "Amical", 3: "Allié" };
// Lignes des contacts dans le contexte de l'IA (contexte.js), et entrées gardées dans l'historique d'un contact.
export const MAX_LIGNES_CONTACTS = 6;
export const MAX_HISTORIQUE = 10;

const texte = v => (typeof v === "string" ? v.trim() : "");
const borner = n => Math.min(ATTITUDE_MAX, Math.max(ATTITUDE_MIN, Math.round(Number(n) || 0)));
const signe = n => (n > 0 ? `+${n}` : String(n));
export const libelleAttitude = n => `${ATTITUDES[borner(n)]} (${signe(borner(n))})`;

// Un contact par identifiant, sinon par nom (casse et accents ignorés), sinon par l'identifiant tiré du nom donné.
export function trouverContact(liste, ref) {
  const r = texte(ref);
  if (!r) return null;
  return liste.find(c => c.id === r) ?? liste.find(c => plier(c.nom) === plier(r)) ?? liste.find(c => c.id === idDepuisNom(r))
    ?? liste.find(c => idDepuisNom(c.nom) === idDepuisNom(r)) ?? null;   // id tiré au hasard (contact caché) : par le nom
}

// Un contact complet et borné. Lève une erreur sans nom ni id.
export function normaliserContact(def = {}, pris = []) {
  const nom = texte(def.nom) || texte(def.id);
  if (!nom) throw new Error("un contact a besoin d'un nom");
  return {
    id: texte(def.id) || idDepuisNom(nom, pris), nom, faction: texte(def.faction), lieu: texte(def.lieu), attitude: borner(def.attitude),
    dette: texte(def.dette), demande: texte(def.demande), visible: Boolean(def.visible), notes: texte(def.notes), acteur: texte(def.acteur),
    maj: Number(def.maj) || 0, historique: Array.isArray(def.historique) ? def.historique.map(texte).filter(Boolean).slice(-MAX_HISTORIQUE) : []
  };
}

const noter = (c, ligne) => ({ ...c, historique: [...(c.historique ?? []), ligne].slice(-MAX_HISTORIQUE) });

// L'attitude change de delta (bornée de -3 à +3), avec sa raison gardée à l'historique. -> { contact, avant, apres }
export function changerAttitude(contact, delta, raison = "") {
  const avant = borner(contact.attitude);
  const apres = borner(avant + (Number(delta) || 0));
  const c = noter({ ...contact, attitude: apres }, `Attitude ${signe(avant)} → ${signe(apres)}${texte(raison) ? ` : ${texte(raison)}` : ""}`);
  return { contact: c, avant, apres };
}

// Une dette notée (texte : qui doit quoi à qui) ou soldée ("").
export function noterDette(contact, dette) {
  const d = texte(dette);
  return noter({ ...contact, dette: d }, d ? `Dette : ${d}` : `Dette soldée${contact.dette ? ` : ${contact.dette}` : ""}`);
}

// Les contacts qui comptent maintenant : ceux de la scène (leur PNJ y a un jeton, ou leur lieu est celui de la scène), puis les
// plus récemment touchés. acteurs : uuid (ou id) des acteurs présents ; lieu : nom de la scène.
export function contactsPertinents(liste = [], { acteurs = [], lieu = "" } = {}, max = MAX_LIGNES_CONTACTS) {
  const ici = new Set(acteurs.filter(Boolean));
  const l = plier(lieu);
  const surPlace = c => (c.acteur && (ici.has(c.acteur) || ici.has(c.acteur.split(".").at(-1)))) || (l && c.lieu && (l.includes(plier(c.lieu)) || plier(c.lieu).includes(l)));
  const recents = [...liste].sort((a, b) => (Number(b.maj) || 0) - (Number(a.maj) || 0));
  return [...recents.filter(surPlace).map(c => ({ ...c, ici: true })), ...recents.filter(c => !surPlace(c))].slice(0, max);
}

// Une ligne pour l'IA.
export function ligneContact(c) {
  const ou = [c.faction, c.lieu].filter(Boolean).join(", ");
  return `Contact « ${c.nom} » [${c.id}]${ou ? ` (${ou})` : ""} : ${libelleAttitude(c.attitude)}`
    + `${c.dette ? ` ; dette : ${c.dette}` : ""}${c.demande ? ` ; veut : ${c.demande}` : ""}${c.ici ? " ; ICI" : ""}${c.visible ? "" : " ; caché aux joueurs"}`;
}

// Le résumé pour l'IA : MAX_LIGNES_CONTACTS lignes au plus (en-tête compris).
export function resumeContacts(liste = [], ou = {}) {
  if (!liste.length) return [];
  const choisis = contactsPertinents(liste, ou, MAX_LIGNES_CONTACTS - 1);
  const reste = liste.length - choisis.length;
  return [`Contacts et dettes${reste > 0 ? ` (les plus utiles ; ${reste} autre(s) : outil contact, « lister »)` : ""} :`, ...choisis.map(c => `- ${ligneContact(c)}`)];
}

// Ce que montre l'onglet Contacts : les joueurs, les contacts visibles sans notes ni historique ; le MJ tout.
// t(cle, francais) : traduit le nom de l'attitude (apps/carnet.js passe texteJoueurs, LAKOUR_MJIA.Contacts.Attitudes.<n>).
export function vueContacts(liste = [], { mj = false, t = (cle, francais) => francais } = {}) {
  const attitudeTexte = n => `${t(`LAKOUR_MJIA.Contacts.Attitudes.${borner(n)}`, ATTITUDES[borner(n)])} (${signe(borner(n))})`;
  return liste.filter(c => mj || c.visible).map(c => ({
    id: c.id, nom: c.nom, faction: c.faction, lieu: c.lieu, attitude: borner(c.attitude), attitudeTexte: attitudeTexte(c.attitude),
    classe: c.attitude > 0 ? "favorable" : c.attitude < 0 ? "hostile" : "neutre", dette: c.dette, demande: c.demande, visible: c.visible,
    notes: mj ? c.notes : "", historique: mj ? (c.historique ?? []).slice(-3) : []
  }));
}
