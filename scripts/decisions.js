// Décisions des joueurs demandées par le MJ IA, dans tous les systèmes : le vote de groupe et le choix secret.
// - Côté MJ actif : l'état (en mémoire de ce navigateur), le décompte, la publication du résultat d'un vote.
// - Côté joueur : les fenêtres (apps/vote-groupe.js, apps/choix-secret.js), chargées quand une demande arrive.
// Tout passe par le canal du module (canal.js), toujours vers des destinataires précis : une demande ne part que chez
// les joueurs visés, une réponse que chez le MJ actif. Seul le résultat d'un vote devient public, dans le chat ;
// un choix secret ne laisse aucune trace dans le chat : il ne revient qu'au MJ (et donc à l'IA).
// Les compagnons IA votent et choisissent aussi : sans navigateur, ils répondent par leur cerveau (compagnons-jeu.js, branché
// par brancherCompagnonsDecisions), ici même chez le MJ actif. Leur place dans un vote est « compagnon:<id de l'acteur> ».
import { ID } from "./constantes.js";
import { envoyer, versMJ, recevoir, ecouterCanal, estMJActif } from "./canal.js";
import { appeler } from "./appel.js";
import { texteJoueurs as tj } from "./utilitaires.js";
import { nomAfficheDe } from "./personnalites.js";

export const DELAI_VOTE = 120;    // secondes, quand l'IA n'en donne pas
export const DELAI_CHOIX = 90;
export const MAX_OPTIONS = 8;

const aliasMJ = () => nomAfficheDe(game.settings.get(ID, "personnalites")?.find(p => p.id === game.settings.get(ID, "personnaliteActive")), tj);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const guillemets = liste => liste.map(l => `« ${l} »`).join(", ");

// Nom d'un joueur dans le chat (son personnage s'il en a un) et pour l'IA (personnage et joueur).
export const nomPublic = u => u?.character?.name ?? u?.name ?? "?";
export const nomPourIA = u => (u?.character ? `${u.character.name} (${u.name})` : u?.name ?? "?");

// ------------------------------------------------------------------ compagnons IA
const CLE_COMPAGNON = "compagnon:";
export const cleCompagnon = acteur => `${CLE_COMPAGNON}${acteur.id}`;
export const estCleCompagnon = id => String(id ?? "").startsWith(CLE_COMPAGNON);
const acteurDeCle = id => game.actors?.get(String(id).slice(CLE_COMPAGNON.length)) ?? null;
const utilisateurs = ids => ids.filter(id => !estCleCompagnon(id));
// Nom d'un votant (joueur ou compagnon), pour le chat et pour l'IA.
const nomVotantPublic = id => (estCleCompagnon(id) ? acteurDeCle(id)?.name ?? "?" : nomPublic(game.users.get(id)));
const nomVotantIA = id => (estCleCompagnon(id) ? `${acteurDeCle(id)?.name ?? "?"} (compagnon IA)` : nomPourIA(game.users.get(id)));

// (acteurId, { question, options, secret }) -> Promise<index | null> : le cerveau d'un compagnon.
let deciderCompagnon = null;
export function brancherCompagnonsDecisions(fn) {
  deciderCompagnon = typeof fn === "function" ? fn : null;
}

// La réponse d'un compagnon, au plus tard au délai ; null (abstention, passe) sans cerveau, en cas d'erreur ou de retard.
async function reponseCompagnon(acteur, demande, delai) {
  if (!deciderCompagnon) return null;
  let minuterie;
  const temps = new Promise(r => { minuterie = setTimeout(() => r(null), delai); });
  try {
    const choix = await Promise.race([Promise.resolve().then(() => deciderCompagnon(acteur.id, demande)), temps]);
    return Number.isInteger(choix) && choix >= 0 && choix < demande.options.length ? choix : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

// Options d'une demande : texte non vide, sans doublon, 2 à MAX_OPTIONS. Une option est un texte ou { libelle, img }.
export function normaliserOptions(options) {
  const vues = new Set();
  const liste = [];
  for (const o of options ?? []) {
    const libelle = String(typeof o === "string" ? o : o?.libelle ?? "").trim();
    if (!libelle || vues.has(libelle.toLowerCase())) continue;
    vues.add(libelle.toLowerCase());
    liste.push({ libelle, img: typeof o === "object" && o?.img ? String(o.img) : "" });
  }
  if (liste.length < 2) throw new Error("Il faut au moins deux options différentes.");
  if (liste.length > MAX_OPTIONS) throw new Error(`Pas plus de ${MAX_OPTIONS} options.`);
  return liste;
}

// ------------------------------------------------------------------ vote de groupe (MJ actif)

// Décompte : votes = { userId: index de l'option | null (abstention) } ; seuls les votants attendus comptent.
// L'option qui a le plus de voix l'emporte ; à égalité, toutes celles en tête sont rendues (egalite) ; sans voix, aucune.
export function decompter({ options, votes, votants }) {
  const comptes = options.map((libelle, index) => ({ index, libelle, voix: 0, votants: [] }));
  const abstentions = [], absents = [];
  for (const id of votants) {
    if (!Object.hasOwn(votes, id)) { absents.push(id); continue; }
    const v = votes[id];
    if (v === null || !comptes[v]) abstentions.push(id);
    else { comptes[v].voix++; comptes[v].votants.push(id); }
  }
  const exprimes = comptes.reduce((s, c) => s + c.voix, 0);
  const max = Math.max(0, ...comptes.map(c => c.voix));
  const gagnants = max > 0 ? comptes.filter(c => c.voix === max).map(c => c.index) : [];
  return { comptes, abstentions, absents, exprimes, gagnants, egalite: gagnants.length > 1 };
}

let vote = null;

// Le vote en cours, sans les voix (pour l'état du jeu) ; null s'il n'y en a pas.
export function voteEnCours() {
  if (!vote) return null;
  return { question: vote.question, options: vote.options.map(o => o.libelle), total: vote.votants.length,
    exprimes: Object.keys(vote.votes).length, reste: Math.max(0, Math.ceil((vote.finit - Date.now()) / 1000)) };
}

// Ouvre un vote chez les votants (des utilisateurs) et les compagnons (des acteurs). delai en millisecondes.
export function ouvrirVote({ question, options, votants, compagnons = [], delai = DELAI_VOTE * 1000, anonyme = false }) {
  if (!estMJActif()) throw new Error("Seul le MJ actif peut ouvrir un vote.");
  if (vote) throw new Error(`Un vote est déjà ouvert (« ${vote.question} ») : clos-le d'abord.`);
  const q = String(question ?? "").trim();
  if (!q) throw new Error("La question est vide.");
  const liste = normaliserOptions(options);
  const joueurs = [...new Set((votants ?? []).map(u => u?.id).filter(Boolean))];
  const compagnonsVotants = [...new Map((compagnons ?? []).filter(a => a?.id).map(a => [a.id, a])).values()];
  const ids = [...joueurs, ...compagnonsVotants.map(cleCompagnon)];
  if (!ids.length) throw new Error("Personne pour voter.");
  const id = foundry.utils.randomID();
  vote = { id, question: q, options: liste, votants: ids, votes: {}, finit: Date.now() + delai, anonyme: Boolean(anonyme),
    minuterie: setTimeout(() => cloreVote({ cause: "delai" }), delai) };
  if (joueurs.length) envoyer({ type: "vote-demande", id, question: q, options: liste, delai, total: ids.length }, joueurs);
  // Les compagnons votent par leur cerveau, en même temps que les joueurs.
  for (const a of compagnonsVotants) {
    reponseCompagnon(a, { question: q, options: liste.map(o => o.libelle) }, delai)
      .then(choix => recevoirVote({ id, choix }, cleCompagnon(a)));
  }
  return { id, question: q, options: liste.map(o => o.libelle), votants: ids };
}

// Voix d'un joueur (par le canal). emetteur : l'utilisateur qui l'a envoyée, d'après le serveur.
// On peut changer d'avis tant que le vote est ouvert ; il se clôt de lui-même quand tous ont voté.
export function recevoirVote({ id, choix }, emetteur) {
  if (!estMJActif()) return { ok: false, raison: "pas le MJ actif" };
  if (!vote || vote.id !== id) return { ok: false, raison: "aucun vote ouvert" };
  if (!vote.votants.includes(emetteur)) return { ok: false, raison: "votant non attendu" };
  if (Date.now() > vote.finit) return { ok: false, raison: "délai écoulé" };
  const valeur = choix ?? null;
  if (valeur !== null && !(Number.isInteger(valeur) && valeur >= 0 && valeur < vote.options.length)) return { ok: false, raison: "option inconnue" };
  vote.votes[emetteur] = valeur;
  const exprimes = Object.keys(vote.votes).length;
  if (exprimes >= vote.votants.length) cloreVote({ cause: "tous" });
  // Aux votants : le nombre de voix seulement, jamais leur contenu.
  else envoyer({ type: "vote-progression", id, exprimes, total: vote.votants.length }, utilisateurs(vote.votants));
  return { ok: true };
}

const CAUSES = { delai: "délai écoulé", tous: "tout le monde a voté", outil: "clos par toi" };

// Texte rendu à l'IA : noms des personnages et des joueurs, jamais d'identifiants.
export function texteResultat(v, r, cause = "outil") {
  const nom = nomVotantIA;
  const lignes = [`🗳️ Vote de groupe clos (${CAUSES[cause] ?? cause}) : « ${v.question} »`];
  for (const c of r.comptes) lignes.push(`- ${c.libelle} : ${c.voix} voix${c.voix ? ` (${c.votants.map(nom).join(", ")})` : ""}`);
  if (r.abstentions.length) lignes.push(`Abstention : ${r.abstentions.map(nom).join(", ")}.`);
  if (r.absents.length) lignes.push(`Sans réponse : ${r.absents.map(nom).join(", ")}.`);
  const libelles = r.gagnants.map(i => v.options[i].libelle);
  if (r.egalite) lignes.push(`Égalité entre ${guillemets(libelles)} : tranche dans le récit ou relance un vote.`);
  else if (libelles.length) lignes.push(`Décision du groupe : « ${libelles[0]} ».`);
  else lignes.push("Aucune voix exprimée : le groupe n'a pas tranché.");
  if (v.anonyme) lignes.push("(Vote anonyme : les joueurs n'ont vu que les totaux ; ne révèle pas qui a voté quoi.)");
  return lignes.join("\n");
}

// Carte du résultat dans le chat (publique), dans la langue de l'interface (LAKOUR_MJIA.Decisions.Resultat.*).
export function htmlResultat(v, r) {
  const nom = id => esc(nomVotantPublic(id));
  const T = (cle, francais, donnees) => tj(`LAKOUR_MJIA.Decisions.Resultat.${cle}`, francais, donnees);
  const options = r.comptes.map(c => `<li${r.gagnants.includes(c.index) ? ' class="gagnant"' : ""}><strong>${esc(c.libelle)}</strong> : ${T("Voix", "{n} voix", { n: c.voix })}`
    + `${c.voix && !v.anonyme ? ` <small>(${c.votants.map(nom).join(", ")})</small>` : ""}</li>`).join("");
  const autres = [
    r.abstentions.length ? (v.anonyme ? T("Abstentions", "Abstentions : {n}", { n: r.abstentions.length })
      : T("Abstention", "Abstention : {noms}", { noms: r.abstentions.map(nom).join(", ") })) : "",
    r.absents.length ? (v.anonyme ? T("SansReponse", "Sans réponse : {noms}", { noms: r.absents.length })
      : T("SansReponse", "Sans réponse : {noms}", { noms: r.absents.map(nom).join(", ") })) : ""
  ].filter(Boolean).join(" · ");
  const libelles = r.gagnants.map(i => esc(v.options[i].libelle));
  const verdict = r.egalite ? `<strong>${T("Egalite", "Égalité")}</strong> ${T("Entre", "entre {options}.", { options: libelles.map(l => T("Option", "« {libelle} »", { libelle: l })).join(", ") })}`
    : libelles.length ? `<strong>${T("Decision", "Décision : {option}.", { option: libelles[0] })}</strong>` : T("Aucune", "Aucune voix exprimée.");
  return `<div class="lakour-mjia-vote"><p><i class="fa-solid fa-check-to-slot"></i> <strong>${T("Titre", "Vote du groupe")}</strong> — ${esc(v.question)}</p>`
    + `<ul>${options}</ul>${autres ? `<p>${autres}</p>` : ""}<p>${verdict}</p></div>`;
}

// Clôt le vote en cours : ferme les fenêtres, publie le résultat dans le chat. Clos par le délai ou parce que tous ont
// voté, le résultat est aussi signalé à l'IA (clos par l'outil, l'IA le reçoit en retour de l'outil).
export async function cloreVote({ cause = "outil" } = {}) {
  if (!vote) return null;
  const v = vote;
  vote = null;
  clearTimeout(v.minuterie);
  envoyer({ type: "vote-clos", id: v.id }, utilisateurs(v.votants));
  const resultat = decompter({ options: v.options.map(o => o.libelle), votes: v.votes, votants: v.votants });
  const texte = texteResultat(v, resultat, cause);
  try {
    await ChatMessage.implementation.create({ content: htmlResultat(v, resultat), speaker: { alias: aliasMJ() }, flags: { [ID]: { ia: true, voteGroupe: true } } });
  } catch (erreur) {
    console.error(`${ID} | résultat du vote`, erreur);
  }
  if (cause !== "outil") game.modules.get(ID)?.api?.moteur?.signaler(texte, { immediat: true });
  Hooks.callAll(`${ID}.voteClos`, { question: v.question, resultat, cause });
  return { ...resultat, question: v.question, options: v.options.map(o => o.libelle), texte };
}

// ------------------------------------------------------------------ choix secret (MJ actif)

const choixEnAttente = new Map();   // id -> { destinataire, options, resolve, minuterie }

// Pose un choix à un seul utilisateur (ou à un compagnon IA) et attend sa réponse. Rend { choix: index | null, libelle, raison } ;
// raison : repondu, passe (il a passé ou fermé la fenêtre), delai, deconnecte, absent.
export function demanderChoix({ utilisateur, compagnon = null, question, options, delai = DELAI_CHOIX * 1000, titre = "" }) {
  if (!estMJActif()) throw new Error("Seul le MJ actif peut poser un choix secret.");
  const q = String(question ?? "").trim();
  if (!q) throw new Error("La question est vide.");
  const liste = normaliserOptions(options).map(o => o.libelle);
  if (compagnon) {
    return reponseCompagnon(compagnon, { question: q, options: liste, secret: true }, delai)
      .then(choix => ({ choix, libelle: choix === null ? "" : liste[choix], raison: choix === null ? "passe" : "repondu" }));
  }
  if (!utilisateur?.active) return Promise.resolve({ choix: null, libelle: "", raison: "absent" });
  const id = foundry.utils.randomID();
  return new Promise(resolve => {
    const minuterie = setTimeout(() => terminerChoix(id, null, "delai"), delai);
    choixEnAttente.set(id, { destinataire: utilisateur.id, options: liste, resolve, minuterie });
    envoyer({ type: "choix-demande", id, titre: String(titre ?? ""), question: q, options: liste, delai }, [utilisateur.id]);
  });
}

function terminerChoix(id, valeur, raison) {
  const c = choixEnAttente.get(id);
  if (!c) return false;
  choixEnAttente.delete(id);
  clearTimeout(c.minuterie);
  if (raison === "delai" || raison === "deconnecte") envoyer({ type: "choix-annuler", id }, [c.destinataire]);
  c.resolve({ choix: valeur, libelle: valeur === null ? "" : c.options[valeur], raison });
  return true;
}

// Réponse du joueur (par le canal) : acceptée seulement de celui à qui le choix a été posé.
export function recevoirChoix({ id, choix }, emetteur) {
  if (!estMJActif()) return false;
  const c = choixEnAttente.get(id);
  if (!c || c.destinataire !== emetteur) return false;
  const valeur = choix ?? null;
  if (valeur === null) return terminerChoix(id, null, "passe");
  if (!Number.isInteger(valeur) || valeur < 0 || valeur >= c.options.length) return false;
  return terminerChoix(id, valeur, "repondu");
}

// Un joueur se déconnecte : ses choix en attente sont rendus aussitôt.
export function joueurDeconnecte(userId) {
  for (const [id, c] of choixEnAttente) if (c.destinataire === userId) terminerChoix(id, null, "deconnecte");
}

// ------------------------------------------------------------------ fenêtres (navigateur du joueur)

// Fenêtres ouvertes, par utilisateur et demande (un navigateur n'a qu'un utilisateur ; les essais en simulent plusieurs).
const fenetres = new Map();
const cle = id => `${game.user.id}:${id}`;

function retenir(demande, f) {
  fenetres.set(cle(demande.id), f);
  f.render({ force: true });
  return f;
}

export async function ouvrirFenetreVote(demande) {
  const { FenetreVoteGroupe } = await import("./apps/vote-groupe.js");
  // L'échéance est recalculée ici : les horloges du MJ et du joueur ne sont pas forcément d'accord.
  const d = { ...demande, finit: Date.now() + demande.delai };
  appeler("LAKOUR_MJIA.Appel.Vote");
  return retenir(d, new FenetreVoteGroupe(d, {
    voter: choix => versMJ({ type: "vote", id: d.id, choix }),
    fermee: () => fenetres.delete(cle(d.id))
  }));
}

export async function ouvrirFenetreChoix(demande) {
  const { FenetreChoixSecret } = await import("./apps/choix-secret.js");
  const d = { ...demande, finit: Date.now() + demande.delai };
  appeler("LAKOUR_MJIA.Appel.Choix");
  return retenir(d, new FenetreChoixSecret(d, {
    repondre: choix => versMJ({ type: "choix-reponse", id: d.id, choix }),
    fermee: () => fenetres.delete(cle(d.id))
  }));
}

// Fermée par le MJ (vote clos, délai écoulé) : la fenêtre ne répond rien.
function fermerFenetre(id) {
  const f = fenetres.get(cle(id));
  if (!f) return;
  fenetres.delete(cle(id));
  f.annulee = true;
  f.close();
}

export const fenetreOuverte = id => fenetres.get(cle(id)) ?? null;

// ------------------------------------------------------------------ branchement (main.js, au « ready »)

export function brancherDecisions() {
  // Chez le joueur : demandes venues d'un MJ.
  recevoir("vote-demande", ouvrirFenetreVote);
  recevoir("vote-progression", ({ id, exprimes }) => fenetres.get(cle(id))?.progression?.(exprimes));
  recevoir("vote-clos", ({ id }) => fermerFenetre(id));
  recevoir("choix-demande", ouvrirFenetreChoix);
  recevoir("choix-annuler", ({ id }) => fermerFenetre(id));
  // Chez le MJ actif : réponses des joueurs.
  recevoir("vote", recevoirVote, { pourMJ: true });
  recevoir("choix-reponse", recevoirChoix, { pourMJ: true });
  ecouterCanal();
  Hooks.on("userConnected", (utilisateur, connecte) => {
    if (!connecte && estMJActif()) joueurDeconnecte(utilisateur.id);
  });
}
