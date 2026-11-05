// Fêtes de saison (docs/fetes.md) : le registre des déclinaisons que les modules des mondes enregistrent au crochet
// « lakour-mj-ia.pret » (api.fetes.enregistrer), la fête du monde selon le réglage « fete » et la date LOCALE de chaque navigateur
// (celle du MJ chez le MJ), et ses effets : classes du body et décor léger (réglage client « effetsDeFete », mouvement réduit
// respecté), une carte publique au chat une fois par jour et par fête (MJ actif seul), une ligne dans l'état du jeu du narrateur
// IA, le crochet « lakour-mj-ia.fete » (ancienne, nouvelle) quand elle change. La logique pure est dans fetes-logique.js.
// Le registre vit en mémoire, dans chaque navigateur : les modules des mondes l'emplissent à chaque chargement.
import { ID } from "./constantes.js";
import { estMJActif } from "./canal.js";
import * as L from "./fetes-logique.js";
import { texteJoueurs } from "./utilitaires.js";
import { nomAfficheDe } from "./personnalites.js";

const declinaisons = [];
let courante;            // id de la fête du monde dans ce navigateur (undefined : pas encore calculée ; null : aucune)
let demarre = false;
let minuteur = null;
let enAttente = null;    // un verifier() demandé par un enregistrement tardif
let carteEnCours = "";   // la clé de la carte en train d'être écrite (deux vérifications rapprochées n'en font qu'une)
let avertie = null;      // la fête forcée sans déclinaison dont le MJ a déjà été prévenu
const ID_COUCHE = "lakour-fete-decor";

const copie = d => (d ? structuredClone(d) : null);
const reglage = (cle, defaut) => { try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; } };
const declinaisonDe = idFete => declinaisons.find(d => d.fete === idFete) ?? null;
const mouvementReduit = () => Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

const aliasMJ = () => {
  try {
    return nomAfficheDe(game.settings.get(ID, "personnalites").find(p => p.id === game.settings.get(ID, "personnaliteActive")), texteJoueurs);
  } catch { return texteJoueurs("LAKOUR_MJIA.Personnalites.MJ", "MJ"); }
};

// ------------------------------------------------------------------ API (contrat des modules des mondes)

// Enregistre la déclinaison d'une fête pour ce monde et la rend (copie). Erreur si la fête est inconnue, l'id absent ou déjà pris,
// la fête déjà déclinée, le décor ou un lien illisibles. Après le démarrage, la fête du monde est revue aussitôt.
export function enregistrer(def) {
  const d = L.normaliserDeclinaison(def, declinaisons);
  declinaisons.push(d);
  if (demarre) verifierBientot();
  return copie(d);
}
export const lister = () => declinaisons.map(copie);
// La déclinaison de la fête du monde dans ce navigateur (copie), ou null.
// Avant le démarrage (pendant le crochet « pret », registre peut-être incomplet), elle est calculée sans être retenue.
export function active() {
  return copie(declinaisonDe(courante === undefined ? calculer() : courante));
}
// Les fêtes du calendrier ce jour-là (déclinées ou non), de la plus prioritaire à la moins.
export const calendrier = (date = new Date()) => L.fetesDuJour(date);
export const decors = () => ({ palettes: Object.keys(L.PALETTES), ornements: Object.keys(L.ORNEMENTS), parDefaut: structuredClone(L.DECORS_PAR_DEFAUT) });

// La veillée de fête EN JEU aux Veillées (système lakour-loups : game.lakourLoups.fete(), d'après l'état public), ou null.
function veilleeEnJeu() {
  try {
    const v = game.system?.id === "lakour-loups" ? game.lakourLoups?.fete?.() : null;
    return v?.cle ? v : null;
  } catch { return null; }
}
// La ligne de l'état du jeu donnée au narrateur IA (contexte.js) : vide sans fête. Aux Veillées, une veillée en jeu passe devant la
// date (même hors saison), avec la consigne de la déclinaison de sa fête.
export function lignePourIA() {
  const veillee = veilleeEnJeu();
  return L.ligneContexte(active(), game.system?.id, veillee ? { veillee, declinaisonVeillee: copie(declinaisonDe(veillee.fete)) } : {});
}

// ------------------------------------------------------------------ calcul, effets, carte, crochet

const calculer = (date = new Date()) => L.feteRetenue({ reglage: reglage("fete", L.REGLAGE_AUTO), date, declinees: declinaisons.map(d => d.fete) });

// Revoit la fête du monde (au démarrage, à minuit, quand un réglage change, après un enregistrement tardif) : effets, crochet si
// elle a changé, carte du jour chez le MJ actif. date : pour les essais.
export async function verifier({ date = new Date() } = {}) {
  const ancienne = courante;
  const nouvelle = calculer(date);
  courante = nouvelle;
  appliquerEffets();
  if (ancienne !== undefined && ancienne !== nouvelle) Hooks.callAll(`${ID}.fete`, copie(declinaisonDe(ancienne)), copie(declinaisonDe(nouvelle)));
  prevenirForcee();
  await annoncer(nouvelle, date);
  return copie(declinaisonDe(nouvelle));
}
function verifierBientot() {
  if (enAttente) return;
  enAttente = setTimeout(() => { enAttente = null; verifier().catch(e => console.error(`${ID} | fêtes`, e)); }, 0);
}

// Une fête forcée que ce monde ne décline pas : rien ne se passe, le MJ actif en est prévenu une fois.
function prevenirForcee() {
  const f = L.forceeSansDeclinaison(reglage("fete", L.REGLAGE_AUTO), declinaisons.map(d => d.fete));
  if (!f || f === avertie || !estMJActif()) return;
  avertie = f;
  globalThis.ui?.notifications?.warn?.(texteJoueurs("LAKOUR_MJIA.Fetes.Forcee", "MJ IA — {nom} est forcée, mais ce monde ne la décline pas : aucune fête en cours.",
    { nom: texteJoueurs(`LAKOUR_MJIA.Fetes.Noms.${f}`, L.nomDeFete(f)) }));
}

// La carte publique du jour, chez le MJ actif seul, une fois par jour (local) et par fête dans ce monde (réglage « feteCarte »).
async function annoncer(idFete, date) {
  const jour = L.cleJour(date);
  const cle = L.cleCarte(jour, idFete);
  if (!L.doitAnnoncer({ derniere: reglage("feteCarte", ""), jour, fete: idFete, mjActif: estMJActif() }) || carteEnCours === cle) return false;
  carteEnCours = cle;
  try {
    await game.settings.set(ID, "feteCarte", cle);
    // Drapeau « ia » : la carte ne revient pas au MJ IA comme un message de joueur (il a la fête dans son état du jeu).
    await ChatMessage.implementation.create({
      content: L.carteHTML(declinaisonDe(idFete), texteJoueurs),
      speaker: { alias: aliasMJ() },
      flags: { [ID]: { ia: true, fete: idFete } }
    });
    return true;
  } catch (erreur) {
    console.error(`${ID} | fêtes`, erreur);
    return false;
  } finally {
    carteEnCours = "";
  }
}

// Classes du body et couche des ornements qui tombent, selon la fête, le réglage client « effetsDeFete » et le mouvement réduit.
export function appliquerEffets() {
  const doc = globalThis.document;
  const body = doc?.body;
  if (!body) return;
  for (const c of [...body.classList]) if (c === "lakour-fete" || c.startsWith("lakour-fete-")) body.classList.remove(c);
  doc.getElementById?.(ID_COUCHE)?.remove();
  const d = declinaisonDe(courante);
  if (!d) return;
  const e = L.effetsDuDecor(d.decor, d.fete, { effets: reglage("effetsDeFete", true) !== false, reduit: mouvementReduit() });
  body.classList.add(...e.classes);
  if (!e.chute) return;
  const couche = doc.createElement("div");
  couche.id = ID_COUCHE;
  couche.className = `lakour-fete-chute lakour-fete-chute-${e.chute}`;
  couche.setAttribute("aria-hidden", "true");
  for (const p of L.positionsDeChute()) {
    const s = doc.createElement("span");
    s.textContent = L.ORNEMENTS[e.chute].glyphe;
    s.style.cssText = `left:${p.gauche}%;animation-delay:-${p.delai}s;animation-duration:${p.duree}s;font-size:${p.taille}rem`;
    couche.append(s);
  }
  body.append(couche);
}

// Prochaine vérification : juste après minuit (local), au plus tard dans une heure (veille de l'ordinateur, heure changée).
function programmer() {
  clearTimeout(minuteur);
  const maintenant = new Date();
  const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1, 0, 0, 2);
  minuteur = setTimeout(() => { verifier().catch(e => console.error(`${ID} | fêtes`, e)).finally(programmer); },
    Math.min(minuit - maintenant, 3600000));
  minuteur?.unref?.();
}

// Au chargement, après le crochet « pret » (les modules des mondes ont enregistré leurs déclinaisons) : première vérification,
// puis à chaque changement de jour ; le mouvement réduit changé redessine le décor. programmer : false dans les essais.
export async function demarrer({ date, programmer: avecMinuteur = true } = {}) {
  demarre = true;
  if (avecMinuteur) {
    programmer();
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", appliquerEffets);
  }
  return verifier(date ? { date } : {});
}

// Les cartes du MJ IA au chat reçoivent la classe lakour-mjia-message : le glyphe de la fête s'y pose en CSS (rien à redessiner
// quand la fête change).
export function marquerMessage(message, html) {
  if (message?.flags?.[ID]) html?.classList?.add("lakour-mjia-message");
}

// Pour les essais : un registre vide et rien de calculé.
export function _reinitialiser() {
  declinaisons.length = 0;
  courante = undefined;
  demarre = false;
  carteEnCours = "";
  avertie = null;
  clearTimeout(minuteur);
  clearTimeout(enAttente);
  enAttente = null;
}
