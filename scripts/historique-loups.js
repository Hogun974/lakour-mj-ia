// L'historique des compositions des Veillées (pour varier d'une partie à l'autre) : le réglage monde « historiqueLoups » est livré
// à tous les navigateurs ; la composition de la partie EN COURS n'y entre donc qu'à sa fin (victoire, ou partie abandonnée par une
// nouvelle distribution ou une remise à zéro). D'ici là, le MJ actif la garde dans le réglage « historiqueLoupsEnAttente », de portée
// client (son navigateur seul, jamais envoyé au serveur), comme le système range la sienne dans les secrets du MJ.
// Les compositions que le système tire lui-même (nouvellePartie, loups_rejouer) sont consignées par lui, dans son réglage
// « lakour-loups.historique » : historiqueDesParties lit les deux.
import { ID } from "./constantes.js";

export const EN_ATTENTE = "historiqueLoupsEnAttente";
export const TAILLE_HISTORIQUE = 10;

const lire = (module, cle, defaut) => { try { return game.settings.get(module, cle) ?? defaut; } catch { return defaut; } };
// La composition en attente : dans le réglage client ; s'il n'est pas enregistré (un monde d'essai qui ne déclare que certains
// réglages), dans la mémoire de ce navigateur, celui du MJ actif.
let memoire = {};
const lireAttente = () => { try { return game.settings.get(ID, EN_ATTENTE) ?? {}; } catch { return memoire; } };
async function ecrireAttente(valeur) {
  memoire = valeur;
  try { await game.settings.set(ID, EN_ATTENTE, valeur); } catch { /* réglage absent : la mémoire suffit */ }
}

// Une écriture à la fois (une victoire et une nouvelle distribution rapprochées ne se mélangent pas).
let file = Promise.resolve();
const enFile = fn => { const suite = file.then(fn); file = suite.catch(() => null); return suite; };

// La composition de la partie qui commence (rôles et bâtiments en jeu, jamais qui a quoi) : celle d'avant, abandonnée, est
// consignée d'abord.
export function retenirComposition({ roles = [], batiments = [] } = {}) {
  return enFile(async () => {
    await consigner();
    await ecrireAttente({ roles: [...roles], batiments: [...batiments], quand: Date.now() });
  });
}

// La partie est finie (ou abandonnée) : sa composition entre enfin à l'historique. -> true si une composition attendait.
export const consignerComposition = () => enFile(consigner);
async function consigner() {
  const c = lireAttente();
  if (!c?.roles?.length) return false;
  await ecrireAttente({});
  await game.settings.set(ID, "historiqueLoups", [...lire(ID, "historiqueLoups", []), c].slice(-TAILLE_HISTORIQUE));
  return true;
}

// Les parties finies, pour le générateur : celles du MJ IA et celles du système, dans l'ordre.
export const historiqueDesParties = () => [...lire(ID, "historiqueLoups", []), ...lire("lakour-loups", "historique", [])]
  .sort((a, b) => (a.quand ?? 0) - (b.quand ?? 0)).slice(-TAILLE_HISTORIQUE);
