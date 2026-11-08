// Canal socket du module, « module.lakour-mj-ia » (module.json : "socket": true).
// Le MJ actif envoie des demandes aux joueurs ; les joueurs répondent au seul MJ actif ; seul le MJ actif enregistre.
//
// Ce que fait le serveur de Foundry v14 (server/dist/server/sockets.mjs, handleCustomSocket) :
// - game.socket.emit(CANAL, message, { recipients: [ids] }) ne livre le message qu'aux navigateurs de ces utilisateurs ;
//   sans « recipients », il part chez TOUS les autres. On donne donc toujours des destinataires : une demande privée
//   ne quitte le serveur que vers son destinataire, une réponse que vers le MJ actif.
// - le récepteur reçoit (message, idDeLEmetteur) : l'identifiant est ajouté par le serveur d'après la session, un
//   joueur ne peut pas le falsifier. C'est lui qui fait foi ; message.userId n'est qu'une déclaration, rejetée si elle
//   le contredit. Vérifié dans le serveur 14.370 : le canal d'un module n'est ouvert qu'aux sockets d'une session reconnue
//   (packages/world.mjs, registerCustomSocket, appelé seulement quand la session a un utilisateur) et handleCustomSocket
//   émet TOUJOURS (message, this.user.id). Un message sans émetteur ne vient donc pas du serveur : il est refusé.
import { ID } from "./constantes.js";

export const CANAL = `module.${ID}`;

// type de message -> { fn(message, emetteur), pourMJ }
const recepteurs = new Map();

export const estMJActif = () => Boolean(game.users.activeGM) && game.users.activeGM.id === game.user.id;

// Envoie un message à des utilisateurs précis. Celui qui est adressé à ce navigateur-ci est traité ici même
// (le serveur ne renvoie rien à l'émetteur).
export function envoyer(message, destinataires) {
  const ids = [...new Set(destinataires ?? [])].filter(Boolean);
  const autres = ids.filter(id => id !== game.user.id);
  if (autres.length) game.socket.emit(CANAL, message, { recipients: autres });
  return ids.includes(game.user.id) ? traiter(message, game.user.id) : undefined;
}

// Réponse d'un joueur : au MJ actif seulement.
export function versMJ(message) {
  const mj = game.users.activeGM;
  if (!mj) return false;
  envoyer({ ...message, userId: game.user.id }, [mj.id]);
  return true;
}

// pourMJ : message adressé au MJ, traité seulement dans le navigateur du MJ actif.
// Sinon, message adressé à un joueur : accepté seulement s'il vient d'un MJ.
export function recevoir(type, fn, { pourMJ = false } = {}) {
  recepteurs.set(type, { fn, pourMJ });
}

export function traiter(message, emetteur) {
  if (!message || typeof message.type !== "string") return false;
  const r = recepteurs.get(message.type);
  if (!r) return false;
  if (emetteur && message.userId && message.userId !== emetteur) return false;   // se fait passer pour un autre
  // Seul l'émetteur donné par le serveur (ou ce navigateur même, envoyer) fait foi, jamais une déclaration (message.userId).
  if (!emetteur) return false;
  const qui = emetteur;
  if (r.pourMJ) {
    if (!estMJActif()) return false;
  } else if (!game.users.get(qui)?.isGM) return false;
  return r.fn(message, qui);
}

// ------------------------------------------------------------------ les avis aux MJ
// Un avis pour les MJ (une erreur d'outil, l'avis du pilote, le budget…) : jamais par le chat. Un ChatMessage chuchoté est livré à
// TOUS les navigateurs (Foundry 14.370 diffuse chaque document de chat ; le client du joueur le masque seulement), et un texte d'erreur
// d'outil peut citer un rôle. Ici : une notification dans ce navigateur (le MJ actif), et le même avis aux autres MJ connectés par ce
// canal (recipients : eux seuls), où il s'affiche en notification. niveau : "info" | "warn" | "error".
const NIVEAUX_D_AVIS = ["info", "warn", "error"];
function afficherAvis(texte, niveau = "info") {
  try { ui.notifications?.[NIVEAUX_D_AVIS.includes(niveau) ? niveau : "info"]?.(String(texte ?? "")); } catch { /* sans interface */ }
}
export function avertirLesMJ(texte, { niveau = "info" } = {}) {
  afficherAvis(texte, niveau);
  try {
    const autres = game.users.filter(u => u.isGM && u.active && u.id !== game.user.id).map(u => u.id);
    if (autres.length) envoyer({ type: "avisMJ", texte: String(texte ?? ""), niveau }, autres);
  } catch (e) { console.warn(`${ID} | avis aux MJ`, e); }
  return true;
}
// Reçu d'un MJ (traiter le vérifie), affiché seulement chez un MJ.
recevoir("avisMJ", message => {
  if (!game.user?.isGM) return false;
  afficherAvis(message.texte, message.niveau);
  return true;
});

// Une seule écoute par socket.
let ecoute = null;
export function ecouterCanal() {
  if (ecoute === game.socket) return;
  ecoute = game.socket;
  game.socket.on(CANAL, (message, emetteur) => traiter(message, emetteur));
}
