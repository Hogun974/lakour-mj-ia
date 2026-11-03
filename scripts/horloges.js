// Horloges, jauges et réputations (40k, Warcraft ; pas aux Veillées) : le registre « horloges » (registre-monde.js : en clair,
// les seuls éléments visibles, sans leurs notes ; le reste au coffre du Carnet, coffre.js), l'API des modules des
// mondes (game.modules.get("lakour-mj-ia").api.horloges), l'annonce au chat et à l'IA quand une horloge sonne, qu'une jauge
// franchit un seuil ou qu'une réputation change de palier. La logique pure est dans horloges-logique.js.
// Seul le MJ actif écrit : ailleurs, assurer rend l'élément sans l'enregistrer et les gestes de la fenêtre passent par le
// canal du module jusqu'au MJ actif.
import { ID } from "./constantes.js";
import { estMJActif, recevoir, versMJ, ecouterCanal, envoyer } from "./canal.js";
import { registreMonde } from "./registre-monde.js";
import * as L from "./horloges-logique.js";
import { plier } from "./recherche-nom.js";
import { idNeuf, idApresRenommage } from "./secrets-logique.js";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const copie = el => (el ? structuredClone(el) : null);

// La liste, toujours un tableau (monde neuf, réglage pas encore enregistré dans un essai) : complète chez le MJ qui a ouvert le
// coffre, les seuls éléments visibles ailleurs.
export const registre = registreMonde("horloges");
export const lireHorloges = () => registre.lire();
export const disponibles = () => L.horlogesDisponibles(game.system?.id);

// Les écritures du MJ actif passent l'une après l'autre (celles des enquêtes et des contacts aussi) : deux clics rapides ne
// s'écrasent pas. Dans la file, la liste lue est complète (coffre ouvert) ; coffre fermé, rien de secret n'est écrit.
const enFile = fn => registre.enFile(fn);
const ecrireHorloges = liste => registre.ecrire(liste);

const aliasMJ = () => {
  try {
    return game.settings.get(ID, "personnalites").find(p => p.id === game.settings.get(ID, "personnaliteActive"))?.nomAffiche ?? "MJ";
  } catch { return "MJ"; }
};

// Carte sobre au chat, pour un élément visible des joueurs. Jamais lue par l'IA (drapeau « ia ») : elle reçoit les événements
// par l'outil ou par moteur.signaler. Un élément CACHÉ n'a pas de carte (un message chuchoté pourrait parvenir à tous les
// navigateurs) : le MJ actif est prévenu ici même, les autres MJ par le canal, à eux seuls.
async function carte(el, phrases) {
  if (!phrases.length) return;
  if (!el.visible) {
    const texte = `${el.nom} : ${phrases.join(" ")}`;
    globalThis.ui?.notifications?.info?.(texte);
    const autres = game.users.filter(u => u.isGM && u.active && u.id !== game.user.id).map(u => u.id);
    if (autres.length) envoyer({ type: "horloges.avis", texte }, autres);
    return;
  }
  const icone = el.type === "horloge" ? "fa-clock" : el.type === "jauge" ? "fa-gauge-high" : "fa-handshake";
  try {
    await ChatMessage.implementation.create({
      content: `<div class="lakour-mjia-horloge-carte"><p><i class="fa-solid ${icone}"></i> <strong>${esc(el.nom)}</strong>`
        + `${el.faction ? ` <small>${esc(el.faction)}</small>` : ""}</p>${phrases.map(p => `<p>${esc(p)}</p>`).join("")}</div>`,
      speaker: { alias: aliasMJ() },
      flags: { [ID]: { ia: true, horloge: el.id } }
    });
  } catch (erreur) {
    console.error(`${ID} | horloges`, erreur);
  }
}

// Après un changement : carte au chat, crochet pour les modules des mondes, et l'IA prévenue (sauf si c'est son propre outil :
// elle reçoit alors les événements dans la réponse de l'outil).
async function annoncer(el, evenements, source) {
  if (!evenements.length) return "";
  await carte(el, evenements.map(ev => L.texteEvenement(el, ev)));
  Hooks.callAll(`${ID}.horloge`, { element: copie(el), evenements: structuredClone(evenements), source });
  const texte = L.texteEvenementsPourIA(el, evenements);
  if (source !== "outil") game.modules.get(ID)?.api?.moteur?.signaler(texte);
  return texte;
}

// Modifie un élément (fn : élément -> { element, evenements }) : { element, evenements, texte }, ou null s'il est introuvable
// ou si ce navigateur n'est pas celui du MJ actif.
function modifier(ref, fn, source) {
  if (!estMJActif()) return Promise.resolve(null);
  return enFile(async () => {
    const liste = lireHorloges();
    const el = L.trouver(liste, ref);
    if (!el) return null;
    const { element, evenements } = fn(el, liste);
    await ecrireHorloges(liste.map(e => (e.id === el.id ? element : e)));
    const texte = await annoncer(element, evenements, source);
    return { element: copie(element), evenements, texte };
  });
}

// ------------------------------------------------------------------ API (contrat des modules des mondes)

// Crée l'élément s'il n'existe pas (par id, ou sans id par son nom exact, casse et accents ignorés), sinon le laisse tel quel ;
// rend l'élément. Hors du MJ actif, rien n'est écrit. Coffre fermé (nouveau navigateur du MJ, parts attendues), un élément
// absent du clair n'est pas créé (il existe peut-être, caché, au coffre) : une erreur le dit, rien n'est écrit.
// Montrer (visible) sort l'élément du coffre : il passe en clair, sans ses notes ; cacher l'y range.
const dejaLa = (liste, def) => {
  const id = String(def?.id ?? "").trim();
  if (id) return liste.find(e => e.id === id) ?? null;
  const nom = plier(def?.nom);
  return nom ? liste.find(e => plier(e.nom) === nom) ?? null : null;
};
export async function assurer(def) {
  const existant = dejaLa(lireHorloges(), def);
  if (existant) return copie(existant);
  const el = L.normaliser(def, lireHorloges().map(e => e.id));
  if (!estMJActif()) return el;
  return enFile(async () => {
    // Dans la file, la liste est complète (coffre ouvert) : un élément caché du même nom est retrouvé. Sans identifiant donné,
    // celui d'un élément neuf ne trahit rien (secrets-logique.js, idNeuf : caché, au hasard ; visible, tiré du nom).
    const liste = lireHorloges();
    const deja = dejaLa(liste, def);
    if (deja) return copie(deja);
    const nom = String(def?.nom ?? "").trim();
    const id = String(def?.id ?? "").trim() || (nom ? idNeuf(nom, liste, { visible: Boolean(def?.visible), prefixe: "horloge" }) : "");
    const neuf = L.normaliser({ ...def, id }, liste.map(e => e.id));
    await ecrireHorloges([...liste, neuf]);
    return copie(neuf);
  });
}

// Avance de n (négatif : recule). Rend { element, evenements, texte } ou null.
export const avancer = (id, n = 1, { source = "api" } = {}) => modifier(id, el => L.avancer(el, n), source);
// Règle la valeur (et, au besoin, max, faction, notes, paliers). Les événements franchis sont annoncés de même.
// Un élément caché renommé dont l'identifiant vient de l'ancien nom en reçoit un tiré au hasard (secrets-logique.js).
export const regler = (id, changements = {}, { source = "api" } = {}) => modifier(id, (el, liste) => {
  const neuf = L.normaliser({ ...el, ...changements, id: idApresRenommage(el, String(changements.nom ?? "").trim(), liste, "horloge"),
    type: el.type, valeur: el.valeur });
  return L.appliquer(neuf, changements.valeur ?? el.valeur);
}, source);
// Montrer aux joueurs (ou cacher) : un élément qui apparaît est annoncé d'une carte, pour que les joueurs aillent le voir.
export async function montrer(id, visible = true, { source = "api" } = {}) {
  let apparait = false;
  const r = await modifier(id, el => {
    apparait = Boolean(visible) && !el.visible;
    return { element: { ...el, visible: Boolean(visible) }, evenements: [] };
  }, source);
  if (r && apparait) await carte(r.element, [`${L.ligneJoueurs(r.element)} — désormais visible de tous (Carnet de campagne, onglet Horloges, barre de gauche).`]);
  return r;
}

export function retirer(ref) {
  if (!estMJActif()) return Promise.resolve(null);
  return enFile(async () => {
    const liste = lireHorloges();
    const el = L.trouver(liste, ref);
    if (!el) return null;
    await ecrireHorloges(liste.filter(e => e.id !== el.id));
    return copie(el);
  });
}

export const lister = () => lireHorloges();   // une copie (lireRegistre en rend une)
export const trouver = ref => copie(L.trouver(lireHorloges(), ref));
// Nom du palier courant (réputation) ou du dernier seuil atteint (jauge) ; null pour une horloge ou un élément inconnu.
export function palier(id) {
  const el = L.trouver(lireHorloges(), id);
  return el ? L.palierDe(el)?.nom ?? null : null;
}

// Les lignes du contexte de l'IA (état du jeu) : vide hors des systèmes concernés ou sans élément.
export const resumePourIA = () => (disponibles() ? L.resumerPourIA(lireHorloges()) : []);

// Un geste de la fenêtre (MJ) : chez le MJ actif directement, sinon par le canal.
export function geste(message) {
  if (estMJActif()) return executerGeste(message);
  return versMJ({ type: "horloges.geste", ...message });
}
function executerGeste({ action, id, n }) {
  if (action === "avancer") return avancer(id, Number(n) || 1, { source: "fenetre" });
  if (action === "montrer") return montrer(id, true, { source: "fenetre" });
  if (action === "cacher") return montrer(id, false, { source: "fenetre" });
  return null;
}

// Au chargement : les gestes d'un autre MJ arrivent au MJ actif (un joueur ne fait rien).
export function brancherHorloges() {
  recevoir("horloges.geste", (message, emetteur) => (game.users.get(emetteur)?.isGM ? executerGeste(message) : false), { pourMJ: true });
  // L'événement d'un élément caché, pour un MJ qui n'est pas le MJ actif (le canal n'accepte ce message que d'un MJ).
  recevoir("horloges.avis", message => (game.user.isGM ? (globalThis.ui?.notifications?.info?.(String(message.texte ?? "")), true) : false));
  ecouterCanal();
}
