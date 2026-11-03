// Compagnons IA dans Foundry : qui est compagnon, ce qu'il sait (sa « vue »), ce qu'il dit dans le chat, ses choix aux
// Veillées, son tour de combat, ses réponses aux votes et choix secrets. La logique pure (cerveau, validation, repli,
// rythme) est dans compagnons.js ; la spécification dans docs/compagnons.md.
//
// Ce qu'un compagnon sait, et rien d'autre :
// - sa fiche (40k, Warcraft : le résumé de l'adaptateur ; Veillées : son rôle, son métier, sa maison) et sa personnalité ;
// - ce qu'on lui a dit en privé : aux Veillées, son carnet secret (gardé par le système chez le MJ actif) ; partout, les
//   messages qui lui sont destinés et ses propres choix secrets, gardés ici dans un réglage « client » du MJ actif ;
// - le chat PUBLIC récent (jamais un chuchotement) et ce que son personnage voit : la scène (jetons visibles) ou, aux
//   Veillées, l'état PUBLIC de la partie (celui que reçoit chaque navigateur).
// Jamais le prompt du MJ, sa mémoire de campagne, les rôles des autres, l'état secret de la nuit ni les jetons cachés.
import { ID } from "./constantes.js";
import { adaptateur } from "./adaptateurs.js";
import { versHTML, roleLoups, campLoups, secretsVeilleesEnAttente } from "./utilitaires.js";
import {
  CerveauxCompagnons, BAVARDAGE, normaliserPersonnalite, texteBrut, choisirOrateurs, repliReplique, criePeste, declarationAuRegistre, accusationDans
} from "./compagnons.js";

// Réglage du MJ IA, sans erreur s'il n'est pas enregistré (essais, système sans MJ IA).
const reglageSur = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
const couper = (t, max) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`);
const MONDE_VEILLEES = "Les Veillées de Brumecombe";

// ------------------------------------------------------------------ qui est compagnon
// Aux Veillées : un villageois sans joueur marqué system.compagnon (le système le sait). Ailleurs : le drapeau du MJ IA
// flags.lakour-mj-ia.compagnon = { temperament, parler, histoire }, posé par compagnon_ajouter.
export function estCompagnon(acteur) {
  if (!acteur) return false;
  if (acteur.type === "villageois") return Boolean(acteur.system?.compagnon) && !acteur.system?.joueur;
  return Boolean(acteur.flags?.[ID]?.compagnon);
}

export const personnaliteDe = acteur => normaliserPersonnalite(acteur?.flags?.[ID]?.compagnon, acteur?.id ?? "");

export const compagnonsDuMonde = () => game.actors.filter(estCompagnon);

// Les compagnons présents : vivants aux Veillées ; ailleurs, ceux dont un jeton visible est sur la scène active
// (tous s'il n'y a pas de scène).
export function compagnonsPresents() {
  const tous = compagnonsDuMonde();
  if (game.system?.id === "lakour-loups") return tous.filter(a => a.system?.vivant !== false);
  const scene = game.scenes?.active;
  if (!scene) return tous;
  const ids = new Set(scene.tokens.contents.filter(t => t.actor && !t.hidden).map(t => t.actor.id));
  return tous.filter(a => ids.has(a.id));
}

// Un compagnon par son nom (exact d'abord).
export function trouverCompagnon(nom) {
  const n = String(nom ?? "").trim().toLowerCase();
  if (!n) return null;
  const tous = compagnonsDuMonde();
  return tous.find(a => a.name.toLowerCase() === n) ?? tous.find(a => a.name.toLowerCase().includes(n)) ?? null;
}

// ------------------------------------------------------------------ ce qu'un compagnon sait en privé (MJ actif seulement)
// En mémoire, recopié dans le réglage client « compagnonsPrive » (localStorage du MJ) : jamais dans un document ni un
// réglage monde, que Foundry livre à tous les navigateurs. Aux Veillées, chaque entrée est liée à la partie en cours.
let prive = null;
const memoirePrivee = () => (prive ??= structuredClone(reglageSur("compagnonsPrive", {}) ?? {}));
const partieEnCours = () => {
  try { return game.lakourLoups?.etat?.().partie ?? ""; } catch { return ""; }
};

export async function noterPrive(acteurId, texte) {
  const m = memoirePrivee();
  m[acteurId] = [...(m[acteurId] ?? []), { texte: String(texte), quand: Date.now(), partie: partieEnCours() }].slice(-40);
  try { await game.settings.set(ID, "compagnonsPrive", m); } catch { /* sans stockage local : la mémoire suffit */ }
}

export function privesDe(acteurId) {
  const partie = partieEnCours();
  return (memoirePrivee()[acteurId] ?? []).filter(e => (e.partie ?? "") === partie).map(e => e.texte);
}

export async function oublierPrive(acteurId) {
  const m = memoirePrivee();
  delete m[acteurId];
  try { await game.settings.set(ID, "compagnonsPrive", m); } catch { /* idem */ }
}

// Pour les essais : repartir d'une mémoire vide.
export function reinitialiserPrive() {
  prive = null;
}

// Une nouvelle partie des Veillées : tous les compagnons oublient la précédente (mémoire et réglage « client » vidés).
export async function effacerPrive() {
  prive = {};
  paroles.length = 0;
  try { await game.settings.set(ID, "compagnonsPrive", {}); } catch { /* sans stockage local : la mémoire suffit */ }
}

// ------------------------------------------------------------------ la parole des joueurs (transcription, docs/voix-et-ecoute.md §2)
// Ce que les joueurs ont dit à voix haute, transcrit chez le MJ actif, avec les compagnons qui pouvaient l'entendre (aux Veillées,
// selon l'audibilité du système : un vivant n'entend pas un mort, la nuit seuls les loups s'entendent). En mémoire seulement.
const paroles = [];
const PAROLES_MAX = 40;

export function entendreParole({ nom, texte, quand = Date.now() }, acteursAuditeurs = []) {
  const acteurs = new Set(acteursAuditeurs);
  if (!acteurs.size || !String(texte ?? "").trim()) return false;
  paroles.push({ quand, ligne: `${nom} (à voix haute) : ${couper(String(texte).trim(), 400)}`, acteurs });
  while (paroles.length > PAROLES_MAX) paroles.shift();
  return true;
}

// Ce qu'un compagnon a entendu : [{ quand, ligne }].
export const parolesPour = acteurId => paroles.filter(p => p.acteurs.has(acteurId)).map(({ quand, ligne }) => ({ quand, ligne }));

// ------------------------------------------------------------------ le chat public
// Les derniers messages que tout le monde voit : ni chuchotement (même adressé au MJ), ni message aveugle, ni message privé.
// paroles : ce que le compagnon a entendu à voix haute ([{ quand, ligne }]), mêlé au chat dans l'ordre du temps.
export function chatPublic({ messages = game.messages?.contents ?? [], max = 20, paroles: entendues = [] } = {}) {
  const lignes = [];
  for (const m of messages) {
    if (m.whisper?.length || m.blind) continue;
    const f = m.flags?.[ID] ?? {};
    if (f.prive) continue;
    const qui = m.speaker?.alias || m.author?.name || "?";
    const texte = texteBrut(m.content);
    const jets = (m.rolls ?? []).map(r => (r?.formula ? `${r.formula} = ${r.total}` : "")).filter(Boolean).join(" ; ");
    if (!texte && !jets) continue;
    lignes.push({ quand: Number(m.timestamp) || 0, ligne: `${qui} : ${couper(texte, 400)}${jets ? ` [${jets}]` : ""}` });
  }
  return [...lignes, ...entendues].sort((a, b) => a.quand - b.quand).map(l => l.ligne).slice(-max);
}

// ------------------------------------------------------------------ la vue d'un compagnon des Veillées
const libelle = (cle, defaut) => (game.i18n?.has?.(cle) ? game.i18n.localize(cle) : defaut);
const metierDe = a => a?.items?.find(i => i.type === "metier") ?? null;

export function vueVeillees(acteur, { api = game.lakourLoups, messages } = {}) {
  // Son rôle et son camp : les secrets du MJ actif, par l'API du système (0.9.0 : ni l'un ni l'autre n'est dans les documents).
  // Les rôles des autres : seulement l'objet de rôle d'un document, qui n'existe qu'une fois le rôle révélé à tous.
  const roleDe = a => (a?.id === acteur.id ? roleLoups(a, api) : a?.items?.find?.(i => i.type === "role") ?? null);
  // L'état PUBLIC seulement : celui que reçoit chaque navigateur (ni les choix de la nuit, ni le bilan, ni les primes, ni les
  // voix d'un vote en cours, ni la chronique secrète, ni les carnets des autres).
  const pub = api.logique.etatPublic(api.etat());
  const tous = api.villageois();
  const nom = id => tous.find(a => a.id === id)?.name ?? "?";
  const role = roleDe(acteur), metier = metierDe(acteur);
  // Son carnet secret : ce que SON joueur aurait reçu (sa carte de rôle, ce qu'il apprend la nuit, les mots du Messager).
  const entrees = api.carnet(acteur.id) ?? [];
  const carnet = entrees.map(e => [e.titre, texteBrut(e.html ?? e.texte)].filter(Boolean).join(" — ")).filter(Boolean);
  const autres = tous.filter(a => a.id !== acteur.id);
  const camp = campLoups(acteur, api);
  const loup = camp === "meute";
  // Sa meute, telle que sa carte de rôle la nomme ; ses soupçons, d'après son carnet et les rôles révélés.
  const cartes = entrees.filter(e => e.html).map(e => texteBrut(e.html)).join("\n");
  const allies = loup ? autres.filter(a => cartes.includes(a.name)).map(a => a.id) : [];
  const suspects = loup ? [] : autres.filter(a => {
    const revele = a.system.revele && roleDe(a)?.system?.camp === "meute";
    return revele || entrees.some(e => !e.html && String(e.texte ?? "").includes(a.name) && /meute/i.test(e.texte ?? ""));
  }).map(a => a.id);
  const vivant = acteur.system.vivant !== false;
  // Les partis (système 0.8.0 : départ ou exil) : hors jeu, ni morts ni révélés ; les gens de passage : un rôle PUBLIC.
  const partis = new Set((pub.partis ?? []).map(p => p.acteurId));
  const parti = partis.has(acteur.id);
  const gens = new Map(((() => { try { return api.gensDePassage?.() ?? []; } catch { return []; } })()).map(g => [g.acteurId, g]));
  const dePassage = gens.has(acteur.id);
  // Le Dernier souffle (système 0.7.0) : un mort garde une voix, au vote d'exécution, tant qu'il ne l'a pas donnée.
  const souffle = !vivant && !parti && Boolean((() => { try { return api.peutSouffler?.(acteur.id)?.aSonSouffle; } catch { return false; } })());
  const fiche = [
    `Tu es ${acteur.name}, villageois de Brumecombe${metier ? `, ${metier.name} de ton métier (public)` : ""}`
      + `${acteur.system.maison ? ` ; tu dors à « ${acteur.system.maison} »` : ""}.`,
    role ? `${dePassage ? "Tu es de passage à Brumecombe. Ton rôle (PUBLIC, tout le village le connaît)" : "Ton rôle SECRET"} : ${role.name} (camp ${libelle(`LAKOUR_LOUPS.Camps.${camp}`, camp)}). ${texteBrut(role.system?.description)}` : "",
    role?.system?.victoire ? `Ta victoire : ${texteBrut(role.system.victoire)}` : "",
    metier?.system?.description ? `Ton métier : ${texteBrut(metier.system.description)}` : "",
    loup ? "Tes Masques de veillée, s'ils sont dans ton carnet, sont des rôles du Village absents de la partie : tu peux prétendre en tenir "
      + "un sans qu'on te contredise. Accorde ton masque avec la meute (pas deux loups sous le même) et ne dis jamais qu'un rôle n'est pas en jeu." : "",
    dePassage ? "Ton camp, lui, est SECRET (ton carnet te le dit) : ne le révèle que si ton camp y gagne." : "",
    vivant ? "" : parti ? "Tu as quitté la veillée (départ ou exil) : tu ne joues plus, tu ne parles ni ne votes." : souffle ? "Tu es MORT : tu te tais. Mais tu gardes ton Dernier souffle : une seule voix, au vote d'exécution, qui ne reviendra pas ; "
      + "garde-la pour un vote décisif." : "Tu es MORT : tu te tais et tu ne votes plus.",
    acteur.system.silence ? "Tu es réduit au silence : tu ne parles pas au débat d'aujourd'hui." : ""
  ].filter(Boolean).join("\n");
  const v = pub.vote ?? {};
  const sujet = v.objet === "chapelle" ? " (Chapelle)" : v.objet === "bailli" ? " (élection du Bailli)" : "";
  // Les rôles des autres : seulement ceux révélés à tous. Le système laisse un mort humain tout voir (roleVisible,
  // « mortsVoientTout ») sauf tant qu'il garde son Dernier souffle ; un compagnon, mort ou non, souffle ou non, n'en reçoit jamais
  // aucun : son cerveau pourrait le laisser filer dans une réplique, ou voter de son souffle en connaissant les loups.
  const scene = [
    `Phase : ${libelle(`LAKOUR_LOUPS.Phases.${pub.phase}`, pub.phase)}, tour ${pub.tour}.${pub.vainqueur ? " La partie est terminée." : ""}`,
    `Au village : ${tous.map(a => `${a.name}${a.id === acteur.id ? " (toi)" : ""} — ${partis.has(a.id) ? "parti" : a.system.vivant ? "vivant" : "mort"}`
      + `${metierDe(a) ? `, ${metierDe(a).name}` : ""}${a.system.revele && roleDe(a) ? `, rôle révélé : ${roleDe(a).name}` : ""}`
      + `${gens.has(a.id) && !a.system.revele ? `, de passage : ${gens.get(a.id).role || gens.get(a.id).cle}` : ""}`).join(" ; ")}.`,
    pub.morts?.length ? `Morts : ${pub.morts.map(m => `${nom(m.acteurId)} (${libelle(`LAKOUR_LOUPS.Causes.${m.cause}`, m.cause)}, tour ${m.tour})`).join(", ")}.` : "",
    v.ouvert ? `Vote ouvert${sujet} : candidats ${v.candidats.map(nom).join(", ")} ; ont déjà voté : ${(v.exprimes ?? []).map(nom).join(", ") || "personne"}.` : "",
    !v.ouvert && v.resultat?.decompte ? `Dernier vote : ${Object.entries(v.resultat.decompte).map(([id, n]) => `${nom(id)} ${n}`).join(", ") || "aucune voix"}.` : "",
    tous.some(a => a.system.vivant && a.system.silence) ? `Réduits au silence : ${tous.filter(a => a.system.vivant && a.system.silence).map(a => a.name).join(", ")}.` : "",
    ...bailliEtRegistre(api, acteur),
    presageDuJour(api),
    ...bancEtDeuil(api, acteur),
    pub.historique?.length ? `Annonces publiques récentes :\n${pub.historique.slice(-12).map(h => `· ${texteBrut(h.texte)}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
  // La Petite tablée (système 0.11.0, publique : etat.petiteTablee) et les villageois tenus par un humain (system.joueur, public) :
  // les compagnons y parlent d'abord aux humains (compagnons.js, CONSIGNE_PETITE_TABLEE, repliReplique). Un biais de parole
  // seulement : les décisions (nuit, votes) ne lisent pas cette liste.
  const humains = autres.filter(a => a.system.joueur).map(a => a.id);
  return {
    id: acteur.id, nom: acteur.name, monde: MONDE_VEILLEES, jeu: "loups", personnalite: personnaliteDe(acteur), fiche,
    prive: [...carnet, ...privesDe(acteur.id)], public: chatPublic({ messages, paroles: parolesPour(acteur.id) }), scene,
    autres: autres.map(a => ({ id: a.id, nom: a.name, vivant: a.system.vivant !== false, humain: Boolean(a.system.joueur) })), allies, suspects,
    vivant, peutParler: vivant && !acteur.system.silence && pub.phase !== "nuit", tour: pub.tour,
    humains, petiteTablee: Boolean(pub.petiteTablee)
  };
}

// Le Banc des accusés et le Glas du deuil (système 0.8.0 ; publics) : les accusations du jour, comment accuser, le compte du glas.
function bancEtDeuil(api, acteur) {
  const essayer = fn => { try { return fn(); } catch { return null; } };
  const lignes = [];
  const banc = typeof api?.banc === "function" ? essayer(() => api.banc()) : null;
  if (banc?.actif) {
    const acc = banc.accusations ?? [];
    lignes.push(`Banc des accusés : ${acc.length ? acc.map(a => `${a.parNom} accuse ${a.contreNom}${a.juge ? " (jugé)" : ""}`).join(" ; ") : "personne n'est accusé aujourd'hui"}`
      + `${banc.prochain ? ` ; prochain jugé : ${banc.prochainNom}` : ""}. Sans accusé, pas de vote d'exécution. `
      + (acteur.system.vivant !== false ? "Pour accuser quelqu'un (une fois par jour), écris dans ta réplique « J'accuse <son nom> »." : ""));
  }
  const deuil = typeof api?.deuil === "function" ? essayer(() => api.deuil()) : null;
  if (deuil?.actif && deuil.compte > 0) lignes.push(`Le glas du deuil a sonné ${deuil.compte} fois : un innocent pendu à chaque fois.`);
  return lignes;
}

// L'accusation d'un compagnon (« J'accuse <nom> » dans sa réplique), portée au Banc par le système (MJ actif). true si elle est
// reçue ; refusée (déjà accusé, une par jour, Banc fermé) : seulement un avertissement en console.
async function accuserAuBanc(acteurId, contre) {
  const api = game.lakourLoups;
  if (typeof api?.accuser !== "function" || !contre) return false;
  try {
    if (!api.banc?.()?.actif) return false;
    await api.accuser(acteurId, contre);
    return true;
  } catch (e) {
    console.warn(`${ID} | accusation refusée`, e);
    return false;
  }
}

// Le présage du jour (Almanach des brumes, système 0.7.0 ; public) : "" sans présage, ou avec un système plus ancien.
function presageDuJour(api) {
  try {
    const p = api?.presage?.();
    return p?.cle ? `Présage du jour (Almanach des brumes) : ${p.nom || p.cle}${p.effet ? ` — ${p.effet.replace(/[.\s]+$/, "")}` : ""}.` : "";
  } catch { return ""; }
}

// Le Bailli et le Registre du greffier (système lakour-loups 0.6.0 et plus ; un système plus ancien n'en a pas) : publics.
export const MAX_REGISTRE_COMPAGNON = 15;
function bailliEtRegistre(api, acteur) {
  const essayer = fn => { try { return fn(); } catch { return null; } };
  const lignes = [];
  const b = typeof api?.bailli === "function" ? essayer(() => api.bailli()) : null;
  if (b?.actif) {
    if (b.acteurId === acteur.id) lignes.push("Tu es le Bailli (public) : ta voix compte double au vote d'exécution, et c'est toi qui tranches les égalités.");
    else if (b.acteurId) lignes.push(`Bailli (public) : ${b.nom || "?"} (sa voix compte double au vote d'exécution ; il tranche les égalités).`);
    else if (b.succession) lignes.push(`Le Bailli${b.succession.nom ? ` ${b.succession.nom}` : ""} est mort : il remet le sceau à un vivant de son choix.`);
    else lignes.push("Pas de Bailli pour l'instant : le village l'élira avant le vote d'exécution.");
  }
  const registre = typeof api?.registreTexte === "function" ? essayer(() => api.registreTexte({ max: MAX_REGISTRE_COMPAGNON })) : null;
  if (registre?.length) {
    lignes.push(`Registre du greffier (public ; une déclaration n'est qu'une parole, le greffier ne vérifie rien) :\n${registre.map(l => `· ${l}`).join("\n")}`);
  }
  return lignes;
}

// ------------------------------------------------------------------ la vue d'un compagnon d'aventure (40k, Warcraft)
export function vueAventure(acteur, { messages, scene = game.scenes?.active } = {}) {
  const sys = adaptateur();
  const visibles = scene ? scene.tokens.contents.filter(t => !t.hidden) : [];
  const genre = t => (estCompagnon(t.actor) ? "compagnon" : t.actor?.hasPlayerOwner ? "PJ" : t.disposition === -1 ? "hostile" : "PNJ");
  const combat = game.combats?.active;
  const lignes = [
    scene ? `Lieu : « ${scene.navName || scene.name} ».` : "Aucun lieu affiché.",
    visibles.length ? `Tu vois : ${visibles.map(t => `${t.name}${t.actor?.id === acteur.id ? " (toi)" : ` (${genre(t)})`}`).join(", ")}.` : "",
    combat?.started ? `Combat : round ${combat.round}, tour de ${combat.combatant?.name ?? "?"} ; ordre : `
      + `${combat.turns.filter(c => !c.hidden).map(c => c.name).join(", ")}.` : ""
  ];
  const autres = visibles.filter(t => t.actor && t.actor.id !== acteur.id).map(t => ({ id: t.actor.id, nom: t.name, vivant: true }));
  return {
    id: acteur.id, nom: acteur.name, monde: game.world?.title ?? game.system?.title ?? "", jeu: "aventure",
    personnalite: personnaliteDe(acteur), fiche: sys.resumer(acteur), prive: privesDe(acteur.id), public: chatPublic({ messages, paroles: parolesPour(acteur.id) }),
    scene: lignes.filter(Boolean).join("\n"), autres, allies: [], suspects: [], vivant: true, peutParler: true, tour: combat?.round ?? 0
  };
}

export function vueDe(acteur, options = {}) {
  return acteur?.type === "villageois" && (options.api ?? game.lakourLoups) ? vueVeillees(acteur, options) : vueAventure(acteur, options);
}

// ------------------------------------------------------------------ noms des compagnons des Veillées
const NOMS_DE_SECOURS = ["Mathurin Vaudrey", "Ysaline Corbet", "Anselme Ferrand", "Odile Basquin", "Gaspard Lerouge", "Clémence Aubrac",
  "Firmin Delorme", "Rosalie Brunet", "Eudes Malivert", "Perrine Sauvage", "Bastien Corbière", "Léontine Gaudry"];

// n noms tirés de la table « Noms de villageois » du module de contenu (lakour-veillees.tables), sans ceux déjà pris.
export async function nomsPourCompagnons(n, { exclus = [] } = {}) {
  let noms = [];
  try {
    const pack = game.packs?.get("lakour-veillees.tables");
    const docs = pack ? await pack.getDocuments() : [];
    const table = docs.find(d => d.flags?.["lakour-veillees"]?.cle === "noms-de-villageois") ?? docs.find(d => /noms/i.test(d.name ?? ""));
    const resultats = table ? [...(table.results?.contents ?? table.results ?? [])] : [];
    noms = resultats.map(r => texteBrut(r.description || r.name || r.text)).filter(Boolean);
  } catch { /* pas de table : noms de secours */ }
  if (!noms.length) noms = [...NOMS_DE_SECOURS];
  const pris = new Set(exclus.map(x => String(x).toLowerCase()));
  const libres = [...new Set(noms)].filter(x => !pris.has(x.toLowerCase()));
  for (let i = libres.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [libres[i], libres[j]] = [libres[j], libres[i]];
  }
  const sortie = libres.slice(0, n);
  for (let i = sortie.length; i < n; i++) sortie.push(`Villageois ${i + 1}`);
  return sortie;
}

// La déclaration d'un compagnon (« Au Registre : … » en tête de sa réplique), inscrite au Registre du greffier par le système
// (MJ actif). true si elle est inscrite ; refusée (phase, silence, trois par jour) : seulement un avertissement en console.
async function declarerAuRegistre(acteurId, texte) {
  const api = game.lakourLoups;
  if (typeof api?.declarer !== "function" || !texte) return false;
  try {
    await api.declarer(acteurId, texte);
    return true;
  } catch (e) {
    console.warn(`${ID} | déclaration au Registre refusée`, e);
    return false;
  }
}

// Le cri de la peste noire d'un compagnon, transmis au système des Veillées (MJ actif). true si le système l'a entendu.
async function crierALaPeste(acteurId) {
  const api = game.lakourLoups;
  if (typeof api?.crierPeste !== "function") return false;
  try {
    await api.crierPeste(acteurId);
    return true;
  } catch (e) {
    console.warn(`${ID} | cri de la peste noire refusé`, e);
    return false;
  }
}

// ------------------------------------------------------------------ demandes des Veillées (résolveur des compagnons)
// Le sujet d'une demande du système : vote d'exécution, de la Chapelle ou du Bailli ; départage (le Bailli tranche une égalité) ;
// succession (le Bailli défunt remet le sceau, posthume) ; posthume sans objet (le porteur de la peste) ; nuit (un choix de rôle).
export function sujetDemandeLoups(demande = {}) {
  if (demande.type === "vote" && demande.banc) return "banc";
  if (demande.type === "vote" && demande.souffle) return "souffle";
  if (demande.type === "vote" && demande.objet === "exil") return "exil";
  if (demande.type === "vote") return demande.objet === "bailli" ? "bailli" : demande.objet === "chapelle" ? "chapelle" : "vote";
  if (demande.objet === "departage") return "departage";
  if (demande.objet === "deuil-vision") return "deuil-vision";
  if (demande.objet === "deuil-voix") return "deuil-voix";
  if (demande.objet === "succession") return "succession";
  return demande.posthume ? "posthume" : "nuit";
}

// Ce que le cerveau lit en plus de l'invite du système, pour les demandes du Bailli.
const PRECISIONS_LOUPS = {
  bailli: "Élection du Bailli : vote POUR celui à qui tu confies le sceau (tu peux voter pour toi). Sa voix comptera double au vote "
    + "d'exécution et il tranchera les égalités.",
  departage: "Tu es le Bailli : le vote d'exécution est à égalité, à toi de trancher. Désigne parmi les ex aequo qui sera exécuté (tu peux "
    + "te désigner), ou passe : personne ne l'est pour cette place.",
  "deuil-vision": "SECRET, pour la meute seule : le Glas du deuil vous donne une vision. Désigne le joueur dont la meute apprendra le camp "
    + "cette nuit (la majorité des loups l'emporte).",
  "deuil-voix": "SECRET, pour la meute seule : le Glas du deuil place une voix sans visage dans ce vote d'exécution. Choisis le candidat "
    + "qu'elle doit accabler (un loup peut brouiller les pistes), ou passe. Personne ne saura d'où elle vient.",
  banc: "Jugement au Banc des accusés : un seul accusé. Voter pour lui le condamne ; ne rien choisir l'acquitte (le suivant sera jugé).",
  exil: "Vote d'exil : celui que le village désigne quitte la veillée sans mourir (son camp reste tu). Vise un gens de passage qui te semble dangereux, ou abstiens-toi.",
  souffle: "Tu es mort, mais tu gardes ton Dernier souffle : une seule voix, pour ce vote d'exécution, et elle ne reviendra pas. Elle est "
    + "précieuse : ne la donne que si ce vote est décisif ; sinon abstiens-toi, tu pourras voter un autre jour.",
  succession: "Tu es mort, et tu étais le Bailli : remets le sceau à un vivant de ton choix (sa voix comptera double, il tranchera les "
    + "égalités), ou passe : la charge restera vacante et le village élira un nouveau Bailli."
};
const inviteLoups = (demande, sujet) => [PRECISIONS_LOUPS[sujet], demande.invite].filter(Boolean).join("\n");

// La note privée du compagnon après sa décision, dite selon le sujet (pas « Nuit X… tu as choisi » pour un vote ou le sceau).
export function notePriveeLoups(sujet, tour, noms = [], invite = "") {
  const qui = noms.join(", ");
  switch (sujet) {
    case "vote": return `Vote du tour ${tour} : ${qui ? `tu as voté contre ${noms[0]}` : "tu t'es abstenu"}.`;
    case "chapelle": return `Vote de la Chapelle, tour ${tour} : ${qui ? `tu as voté pour mettre ${noms[0]} à l'abri` : "tu t'es abstenu"}.`;
    case "bailli": return `Élection du Bailli, tour ${tour} : ${qui ? `tu as voté pour ${noms[0]}` : "tu t'es abstenu"}.`;
    case "deuil-vision": return `Nuit ${tour}, Glas du deuil (secret) : ${qui ? `tu as voulu que la meute voie le camp de ${noms[0]}` : "tu as passé"}.`;
    case "deuil-voix": return `Vote du tour ${tour}, voix du deuil (secret) : ${qui ? `tu as proposé de la porter contre ${noms[0]}` : "tu as passé"}.`;
    case "banc": return `Banc des accusés, tour ${tour} : ${qui ? `tu as voté pour condamner ${noms[0]}` : "tu n'as pas voté pour condamner (acquittement)"}.`;
    case "exil": return `Vote d'exil, tour ${tour} : ${qui ? `tu as voté pour exiler ${noms[0]}` : "tu t'es abstenu"}.`;
    case "souffle": return `Dernier souffle, tour ${tour} : ${qui ? `tu as donné ta dernière voix contre ${noms[0]} (elle ne reviendra pas)` : "tu as gardé ton souffle pour un autre jour"}.`;
    case "departage": return `Jour ${tour}, en Bailli, tu as tranché l'égalité : ${qui ? `tu as désigné ${qui}` : "tu n'as désigné personne"}.`;
    case "succession": return `Mort, tu as remis le sceau du Bailli ${qui ? `à ${qui}` : "à personne (la charge reste vacante)"}.`;
    default: return `Nuit ${tour} (« ${invite} ») : tu as choisi ${qui || "de passer"}.`;
  }
}

// ------------------------------------------------------------------ les compagnons en jeu (navigateur du MJ actif)
export class Compagnons {
  // moteur : le MoteurMJ (compteur et budget de la séance, file des messages). fournisseur() : le fournisseur du modèle des
  // compagnons (fournisseurs/index.js, fournisseurCompagnons), null = repli sans IA ; modele() : son identifiant (pour le coût).
  // dire(acteur, texte, message) : sa voix (voix.js, direReplique), facultative.
  constructor({ moteur = null, fournisseur = () => null, modele = () => "", graine = null, dire = null } = {}) {
    this.moteur = moteur;
    this.dire = dire;
    this.cerveaux = new CerveauxCompagnons({
      fournisseur: () => { try { return fournisseur(); } catch { return null; } },
      modele: () => { try { return modele(); } catch { return ""; } },
      compter: (usage, m) => this.moteur?.compter?.(usage, m),
      // Budget atteint, ou (aux Veillées) secrets de la partie en attente : aucun appel des compagnons.
      budgetDepasse: () => Boolean(this.moteur?.budgetDepasse?.()) || secretsVeilleesEnAttente(),
      graine: graine ?? `compagnons|${game.world?.id ?? ""}`
    });
    this.derniere = new Map();   // acteurId -> rang de sa dernière réplique (ceux qui ont parlé le moins récemment d'abord)
    this.horloge = 0;
  }

  vue(acteur, options = {}) {
    return vueDe(acteur, options);
  }

  maxRepliques() {
    return BAVARDAGE[reglageSur("bavardageCompagnons", "normal")] ?? BAVARDAGE.normal;
  }

  // Une réplique dans le chat, sous le nom du compagnon (comme un joueur). action : déclaration de combat, déjà transmise
  // au moteur (drapeau ia : le moteur ne la reçoit pas une seconde fois).
  // La didascalie en tête (« *Il croise les bras.* — … ») s'affiche en italique, avec le style « didascalie ». Le texte brut est
  // gardé dans les drapeaux : le MJ IA le lit tel quel (il sait ainsi ce qui est déjà montré).
  // Sa voix (mode OpenAI) lit la parole seule, sans être attendue : la réplique suivante n'est pas retardée.
  async poster(acteur, texte, { action = false } = {}) {
    const message = await ChatMessage.implementation.create({
      content: versHTML(texte).replace(/^<p><em>/, '<p><em class="lakour-mjia-didascalie">'),
      speaker: { alias: acteur.name, actor: acteur.id },
      flags: { [ID]: { compagnon: acteur.id, texte: String(texte), ...(action ? { ia: true, action: true } : {}) } }
    });
    if (this.dire) Promise.resolve().then(() => this.dire(acteur, texte, message)).catch(e => console.error(`${ID} | voix du compagnon`, e));
    return message;
  }

  // Après une réponse du MJ : au plus max compagnons présents réagissent, une réplique chacun. Ceux que le texte cite
  // parlent d'abord. Rend [{ acteurId, nom, texte, source }].
  // Aux Veillées, un compagnon qui crie « C'est la peste noire ! » dans sa réplique crie pour de bon : le système tranche
  // (api.crierPeste : juste, la partie s'arrête ; faux, il est pendu) et le tour de parole s'arrête là. Une réplique qui commence
  // par « Au Registre : … » fait inscrire sa déclaration au Registre du greffier (api.declarer).
  async reagir({ mentions = "", max = this.maxRepliques(), messages } = {}) {
    if (max <= 0) return [];
    const parlants = compagnonsPresents().map(a => ({ id: a.id, nom: a.name, acteur: a, vue: this.vue(a, { messages }) }))
      .filter(c => c.vue.peutParler);
    const dits = [];
    for (const c of choisirOrateurs(parlants, { max, mentions, derniere: this.derniere })) {
      const r = await this.cerveaux.parler(c.vue);
      if (!r.texte) continue;
      this.derniere.set(c.id, ++this.horloge);
      await this.poster(c.acteur, r.texte);
      dits.push({ acteurId: c.id, nom: c.nom, texte: r.texte, source: r.source });
      if (c.vue.jeu === "loups" && criePeste(r.texte) && await crierALaPeste(c.id)) break;
      if (c.vue.jeu === "loups") await declarerAuRegistre(c.id, declarationAuRegistre(r.texte));
      if (c.vue.jeu === "loups") await accuserAuBanc(c.id, accusationDans(r.texte, c.vue.autres.filter(a => a.vivant)));
    }
    return dits;
  }

  // Le débat du jour aux Veillées : les compagnons vivants (et non réduits au silence) prennent la parole.
  debattre(options = {}) {
    return this.reagir(options);
  }

  // Son tour de combat : il déclare son action dans le chat ; le MJ IA la résout avec les vrais jets (jet_compagnon).
  async tourDeCombat(combat) {
    const c = combat?.combatant;
    const acteur = c?.actor;
    if (!estCompagnon(acteur)) return null;
    const vue = this.vue(acteur);
    const r = await this.cerveaux.parler({ ...vue, peutParler: true }, { combat: true });
    const texte = r.texte || repliReplique(vue, this.cerveaux.graine, { combat: true });
    await this.poster(acteur, texte, { action: true });
    this.moteur?.signaler(`⚔️ Round ${combat.round} : c'est au tour de ${c.name}, compagnon IA. Il déclare : « ${texte} » `
      + "Résous son action comme celle d'un joueur, avec les vrais jets de SA fiche lancés directement (jet_compagnon pour ses tests, "
      + "lancer_des pour les dégâts), décris le résultat, puis appelle passer_tour.", { immediat: true, source: "compagnon" });
    return texte;
  }

  // Résolveur des Veillées (api.resolveurs.compagnon) : choix de nuit, mot du Messager, votes (exécution, Chapelle, Bailli),
  // départage et succession du Bailli.
  async resoudreLoups(demande) {
    const acteur = game.actors.get(demande.acteurId);
    if (!estCompagnon(acteur)) return demande.mode === "texte" ? "" : [];
    const vue = this.vue(acteur);
    if (demande.mode === "texte") {
      const r = await this.cerveaux.decider(vue, { type: "texte", invite: demande.invite, max: demande.max, cle: `texte|${demande.id}` });
      if (r.texte) await noterPrive(acteur.id, `Nuit ${vue.tour} : tu as confié ce mot au Messager : « ${r.texte} ».`);
      return r.texte;
    }
    const candidats = (demande.candidats ?? []).map(c => ({ id: c.id, nom: c.nom }));
    const sujet = sujetDemandeLoups(demande);
    const r = await this.cerveaux.decider(vue, { type: "cibles", invite: inviteLoups(demande, sujet), candidats, nombre: demande.nombre ?? 1,
      vote: ["vote", "chapelle", "bailli", "departage", "souffle", "banc", "exil"].includes(sujet), objet: sujet, cle: `${demande.type}|${demande.id}` });
    const noms = r.cibles.map(id => candidats.find(c => c.id === id)?.nom).filter(Boolean);
    await noterPrive(acteur.id, notePriveeLoups(sujet, vue.tour, noms, demande.invite));
    return r.cibles;
  }

  // Vote de groupe et choix secret (decisions.js) : index de l'option choisie, ou null (abstention, passe).
  async deciderOption(acteurId, { question, options, secret = false }) {
    const acteur = game.actors.get(acteurId);
    if (!estCompagnon(acteur)) return null;
    const r = await this.cerveaux.decider(this.vue(acteur), { type: "option", question, options, cle: `option|${question}` });
    if (secret || r.choix !== null) {
      await noterPrive(acteurId, `${secret ? "Choix secret" : "Vote du groupe"} « ${question} » : `
        + `${r.choix === null ? "tu as passé" : `tu as répondu « ${options[r.choix]} »`}.`);
    }
    return r.choix;
  }
}
