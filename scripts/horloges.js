// Horloges, jauges et réputations (40k, Warcraft ; pas aux Veillées) : le réglage monde « horloges », l'API des modules des
// mondes (game.modules.get("lakour-mj-ia").api.horloges), l'annonce au chat et à l'IA quand une horloge sonne, qu'une jauge
// franchit un seuil ou qu'une réputation change de palier. La logique pure est dans horloges-logique.js.
// Seul le MJ actif écrit : ailleurs, assurer rend l'élément sans l'enregistrer et les gestes de la fenêtre passent par le
// canal du module jusqu'au MJ actif.
import { ID } from "./constantes.js";
import { estMJActif, recevoir, versMJ, ecouterCanal } from "./canal.js";
import * as L from "./horloges-logique.js";
import { plier } from "./recherche-nom.js";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const copie = el => (el ? structuredClone(el) : null);

// Le réglage, toujours un tableau (monde neuf, réglage pas encore enregistré dans un essai).
export function lireHorloges() {
  try {
    const v = game.settings.get(ID, "horloges");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export const disponibles = () => L.horlogesDisponibles(game.system?.id);

// Les écritures du MJ actif passent l'une après l'autre : deux clics rapides ne s'écrasent pas.
let file = Promise.resolve();
const enFile = fn => {
  const suite = file.then(() => fn());
  file = suite.catch(() => null);
  return suite;
};
const ecrireHorloges = liste => game.settings.set(ID, "horloges", liste);

const aliasMJ = () => {
  try {
    return game.settings.get(ID, "personnalites").find(p => p.id === game.settings.get(ID, "personnaliteActive"))?.nomAffiche ?? "MJ";
  } catch { return "MJ"; }
};

// Carte sobre au chat : publique si l'élément est visible des joueurs, sinon chuchotée aux MJ. Jamais lue par l'IA (drapeau
// « ia ») : elle reçoit les événements par l'outil ou par moteur.signaler.
async function carte(el, phrases) {
  if (!phrases.length) return;
  const mjs = game.users.filter(u => u.isGM).map(u => u.id);
  const icone = el.type === "horloge" ? "fa-clock" : el.type === "jauge" ? "fa-gauge-high" : "fa-handshake";
  try {
    await ChatMessage.implementation.create({
      content: `<div class="lakour-mjia-horloge-carte"><p><i class="fa-solid ${icone}"></i> <strong>${esc(el.nom)}</strong>`
        + `${el.faction ? ` <small>${esc(el.faction)}</small>` : ""}</p>${phrases.map(p => `<p>${esc(p)}</p>`).join("")}</div>`,
      speaker: { alias: aliasMJ() },
      ...(el.visible ? {} : { whisper: mjs }),
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
    const { element, evenements } = fn(el);
    await ecrireHorloges(liste.map(e => (e.id === el.id ? element : e)));
    const texte = await annoncer(element, evenements, source);
    return { element: copie(element), evenements, texte };
  });
}

// ------------------------------------------------------------------ API (contrat des modules des mondes)

// Crée l'élément s'il n'existe pas (par id, ou sans id par son nom exact, casse et accents ignorés), sinon le laisse tel quel ;
// rend l'élément. Hors du MJ actif, rien n'est écrit.
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
    const liste = lireHorloges();
    const deja = dejaLa(liste, def) ?? liste.find(e => e.id === el.id);
    if (deja) return copie(deja);
    await ecrireHorloges([...liste, el]);
    return copie(el);
  });
}

// Avance de n (négatif : recule). Rend { element, evenements, texte } ou null.
export const avancer = (id, n = 1, { source = "api" } = {}) => modifier(id, el => L.avancer(el, n), source);
// Règle la valeur (et, au besoin, max, faction, notes, paliers). Les événements franchis sont annoncés de même.
export const regler = (id, changements = {}, { source = "api" } = {}) => modifier(id, el => {
  const neuf = L.normaliser({ ...el, ...changements, id: el.id, type: el.type, valeur: el.valeur });
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

export const lister = () => structuredClone(lireHorloges());
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
  ecouterCanal();
}
