// Compagnons IA dans Foundry : qui est compagnon, ce qu'il sait (sa « vue »), ce qu'il dit dans le chat, ses choix aux
// Veillées, son tour de combat, ses réponses aux votes et choix secrets. La logique pure (cerveau, validation, repli,
// rythme) est dans compagnons.js ; la spécification dans docs/compagnons.md.
//
// Ce qu'un compagnon sait, et rien d'autre :
// - sa fiche (40k, Warcraft : le résumé de l'adaptateur ; Veillées : son rôle, son métier, sa maison) et sa personnalité ;
// - ce qu'on lui a dit en privé : aux Veillées, son carnet secret (gardé par le système chez le MJ actif) ; partout, les
//   messages qui lui sont destinés et ses propres choix secrets, gardés ici dans un réglage « client » du MJ actif ;
// - le chat PUBLIC récent (jamais un chuchotement) et ce que son personnage voit : la scène (jetons visibles) ou, aux
//   Veillées, l'état PUBLIC de la partie (celui que reçoit chaque navigateur) ; à Fénoir, l'état PUBLIC de la survie (moment,
//   abri, stocks, membres, ce que le groupe croit de sa région : survie-logique.js, vuePubliqueSurvie).
// Jamais le prompt du MJ, sa mémoire de campagne, les rôles des autres, l'état secret de la nuit, le monde réel de Fénoir
// (api.monde()) ni les jetons cachés.
import { ID } from "./constantes.js";
import { adaptateur } from "./adaptateurs.js";
import { contenuNomme, packDeContenu, drapeauxDuContenu, langueDuMonde } from "./contenus.js";
import { versHTML, roleLoups, campLoups, secretsVeilleesEnAttente } from "./utilitaires.js";
import { vuePubliqueDepuisApi } from "./survie-logique.js";
import { ligneHistoireActeur } from "./histoire-logique.js";
import {
  CerveauxCompagnons, BAVARDAGE, normaliserPersonnalite, texteBrut, choisirOrateurs, repliReplique, criePeste, declarationAuRegistre, accusationDans,
  formulesReplique, adresseDe, hasard
} from "./compagnons.js";
import { appelSur, texteDesVariantes, variantesActives } from "./veillees-pacte.js";

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

// Pour les essais : repartir d'une mémoire vide (celle des politiques du Pacte comprise : une partie rejouée sous le même identifiant,
// comme dans la doublure des Veillées, ne doit pas retrouver les annonces ni les pouvoirs de jour de la précédente).
export function reinitialiserPrive() {
  prive = null;
  oublierLesPolitiques();
}

// Une nouvelle partie des Veillées : tous les compagnons oublient la précédente (mémoire et réglage « client » vidés).
export async function effacerPrive() {
  prive = {};
  paroles.length = 0;
  oublierLesPolitiques();
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
  // Le Pacte (système lakour-loups récent) : sa personnalité, sa carte envoûtée, ses charges ; le public du jeu de soirée.
  const pacte = pacteDuCompagnon(api, acteur, pub, role, nom);
  const fiche = [
    `Tu es ${acteur.name}, villageois de Brumecombe${metier ? `, ${metier.name} de ton métier (public)` : ""}`
      + `${acteur.system.maison ? ` ; tu dors à « ${acteur.system.maison} »` : ""}.`,
    role ? `${dePassage ? "Tu es de passage à Brumecombe. Ton rôle (PUBLIC, tout le village le connaît)" : "Ton rôle SECRET"} : ${role.name} (camp ${libelle(`LAKOUR_LOUPS.Camps.${camp}`, camp)}). ${texteBrut(role.system?.description)}` : "",
    role?.system?.victoire ? `Ta victoire : ${texteBrut(role.system.victoire)}` : "",
    metier?.system?.description ? `Ton métier : ${texteBrut(metier.system.description)}` : "",
    loup ? "Tes Masques de veillée, s'ils sont dans ton carnet, sont des rôles du Village absents de la partie : tu peux prétendre en tenir "
      + "un sans qu'on te contredise. Accorde ton masque avec la meute (pas deux loups sous le même) et ne dis jamais qu'un rôle n'est pas en jeu." : "",
    dePassage ? "Ton camp, lui, est SECRET (ton carnet te le dit) : ne le révèle que si ton camp y gagne." : "",
    ...pacte.fiche,
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
    ...pacte.scene,
    pub.historique?.length ? `Annonces publiques récentes :\n${pub.historique.slice(-12).map(h => `· ${texteBrut(h.texte)}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
  // La Petite tablée (système 0.11.0, publique : etat.petiteTablee) et les villageois tenus par un humain (system.joueur, public) :
  // les compagnons y parlent d'abord aux humains (compagnons.js, CONSIGNE_PETITE_TABLEE, repliReplique). Un biais de parole
  // seulement : les décisions (nuit, votes) ne lisent pas cette liste.
  const humains = autres.filter(a => a.system.joueur).map(a => a.id);
  return {
    id: acteur.id, nom: acteur.name, monde: MONDE_VEILLEES, jeu: "loups", personnalite: personnaliteDe(acteur), fiche,
    // La clé et l'effet de SON rôle, et son camp (sa propre carte : les politiques de jeu et le repli s'en servent).
    roleCle: role?.system?.cle ?? "", effet: role?.system?.effet ?? "", camp: camp || "",
    prive: [...carnet, ...privesDe(acteur.id)], public: chatPublic({ messages, paroles: parolesPour(acteur.id) }), scene,
    autres: autres.map(a => ({ id: a.id, nom: a.name, vivant: a.system.vivant !== false, humain: Boolean(a.system.joueur) })), allies, suspects,
    vivant, peutParler: vivant && !acteur.system.silence && pub.phase !== "nuit", tour: pub.tour,
    humains, petiteTablee: Boolean(pub.petiteTablee)
  };
}

// Le Pacte (système lakour-loups, étapes 1 à 9 ; un système plus ancien n'a rien de tout cela) : ce que le compagnon sait du jeu de
// soirée. fiche : sa propre carte (personnalité publique, carte envoûtée, Crieur public, Exécuteur) ; scene : le public (variantes, sagesse,
// graciés, votants du jour, plume, Bateleur, Illuminé, Chambrière, Village, Gazette, traits). Jamais un secret d'un autre.
function pacteDuCompagnon(api, acteur, pub = {}, role = null, nom = id => id) {
  const fiche = [], scene = [];
  const id = acteur.id;
  const perso = appelSur(api, "personnalite", id);
  if (perso?.titre) {
    fiche.push(`Ta personnalité du village (PUBLIQUE) : ${perso.titre}${perso.batiment ? `, tu tiens ${perso.batiment}` : ""}. ${texteBrut(perso.aide)}`
      + (perso.personnalite === "cabaretier" ? " Ton vote est annoncé à tous : vote en le sachant." : ""));
  }
  if (role?.system?.envoute) fiche.push("Tu es ENVOÛTÉ : ta carte n'a plus aucun pouvoir (ni la nuit, ni le jour, ni à ta mort). N'agis plus comme si tu l'avais.");
  const g = appelSur(api, "gazette");
  if (g?.crieur?.acteurId === id) {
    // Sa main (ses propres cartes, secrètes pour les autres) : leur nombre ici ; leurs noms sont dans son carnet et dans la demande du matin.
    const main = appelSur(api, "gazetteSecrets")?.main ?? [];
    fiche.push(`Tu es le Crieur public (charge publique) : ${main.length ? `${main.length} carte(s) de la Gazette en main, ` : ""}dans ton carnet, `
      + "secrètes ; un matin, tu peux en lire une, ou te taire.");
  }
  if (g?.executeur?.acteurId === id) fiche.push("Tu es l'Exécuteur (public) : tu apprends seul, dans ton carnet, la carte de chaque condamné ; les autres ne la voient pas.");
  if (variantesActives(pub.variantes)) scene.push(`Variantes de la veillée (publiques) : ${texteDesVariantes(pub.variantes)}.`);
  const p = appelSur(api, "pacte");
  if (p?.sagessePerdue) scene.push("Brumecombe a perdu sa sagesse : plus aucun pouvoir de rôle du Village ni de métier.");
  if (p?.gracies?.length) scene.push(`Innocents graciés (ils ne votent plus) : ${p.gracies.map(x => nom(x.acteurId)).join(", ")}.`);
  if (p?.votants?.ids?.length && Number(p.votants.tour) === Number(pub.tour)) scene.push(`Aujourd'hui, seuls votent à l'exécution : ${p.votants.ids.map(nom).join(", ")}.`);
  if (p?.plume?.cible && Number(p.plume.tour) === Number(pub.tour)) scene.push(`La plume noire désigne ${nom(p.plume.cible)} : deux voix contre lui au premier vote du jour.`);
  const a = appelSur(api, "ambigus");
  // Les cartes du Bateleur et les deux bords de l'Illuminé : ce que la table a vu, dit comme le chat les annonce, sans nommer le rôle qui
  // les a mis en jeu (la composition ne s'annonce pas ; le système non plus ne les nomme pas au chat).
  if (a?.bateleur?.length) scene.push(`Cartes posées face visible au milieu de la table (une nuit, quelqu'un pourra jouer l'une d'elles) : ${a.bateleur.map(c => c.nom).join(", ")}.`);
  if (a?.groupes?.a?.length && a.groupes.b?.length) scene.push(`Le village est partagé en deux bords (annoncé) : ${a.groupes.a.map(x => x.nom).join(", ")} | ${a.groupes.b.map(x => x.nom).join(", ")}.`);
  if (a?.devouements?.length) scene.push(`Dévouements de la Chambrière : ${a.devouements.map(d => `${nom(d.acteurId)} a pris la carte de ${nom(d.de)}`).join(", ")}.`);
  if (a?.commenceParLeJour && Number(pub.tour) < 1) scene.push("La veillée commence par un jour : débat et vote d'exécution avant la première nuit.");
  const v = appelSur(api, "village");
  if (v?.actif) {
    const tenus = (v.batiments ?? []).filter(b => b.acteurId).map(b => `${b.occupant || nom(b.acteurId)}, ${b.titre}`);
    scene.push(`Le Village (public) : ${tenus.join(" ; ") || "personne"}${v.chemineaux?.length ? ` ; Chemineaux : ${v.chemineaux.map(c => c.nom).join(", ")}` : ""}.`);
    if (v.regent?.ids?.length && Number(v.regent.tour) === Number(pub.tour)) scene.push(`Privés de vote par le Régent aujourd'hui : ${v.regent.ids.map(nom).join(", ")}.`);
  }
  if (g?.actif) {
    if (g.enCours?.length) scene.push(`Gazette de la lune, cartes en cours : ${g.enCours.map(c => `${c.nom}${c.effet ? ` (${String(c.effet).replace(/[.\s]+$/, "")})` : ""}`).join(" ; ")}.`);
    if (g.crieur?.acteurId && g.crieur.acteurId !== id) scene.push(`Crieur public : ${g.crieur.nom || nom(g.crieur.acteurId)}.`);
    if (g.executeur?.acteurId && g.executeur.acteurId !== id) scene.push(`Exécuteur : ${g.executeur.nom || nom(g.executeur.acteurId)} (les cartes des condamnés ne sont plus retournées).`);
  }
  const traits = appelSur(api, "traits");
  if (traits && Object.keys(traits).length) scene.push(`Traits visibles (publics) : ${Object.entries(traits).map(([i, t]) => `${nom(i)} — ${t.texte}`).join(" ; ")}.`);
  return { fiche, scene };
}

// Le Banc des accusés et le Glas du deuil (système 0.8.0 ; publics) : les accusations du jour, comment accuser, le compte du glas.
function bancEtDeuil(api, acteur) {
  const essayer = fn => { try { return fn(); } catch { return null; } };
  const lignes = [];
  const banc = typeof api?.banc === "function" ? essayer(() => api.banc()) : null;
  if (banc?.actif) {
    const acc = banc.accusations ?? [];
    // La formule d'accusation dans la langue du monde (compagnons.js, formulesReplique ; reconnue dans les deux langues).
    lignes.push(`Banc des accusés : ${acc.length ? acc.map(a => `${a.parNom} accuse ${a.contreNom}${a.juge ? " (jugé)" : ""}`).join(" ; ") : "personne n'est accusé aujourd'hui"}`
      + `${banc.prochain ? ` ; prochain jugé : ${banc.prochainNom}` : ""}. Sans accusé, pas de vote d'exécution. `
      + (acteur.system.vivant !== false ? `Pour accuser quelqu'un (une fois par jour), écris dans ta réplique « ${formulesReplique(langueDuMonde()).accuser} <son nom> ».` : ""));
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

// ------------------------------------------------------------------ la vue d'un compagnon d'aventure (40k, Warcraft, Fénoir)
export function vueAventure(acteur, { messages, scene = game.scenes?.active } = {}) {
  const sys = adaptateur();
  const visibles = scene ? scene.tokens.contents.filter(t => !t.hidden) : [];
  const genre = t => (estCompagnon(t.actor) ? "compagnon" : t.actor?.hasPlayerOwner ? "PJ" : t.disposition === -1 ? "hostile" : "PNJ");
  const combat = game.combats?.active;
  const lignes = [
    scene ? `Lieu : « ${scene.navName || scene.name} ».` : "Aucun lieu affiché.",
    visibles.length ? `Tu vois : ${visibles.map(t => `${t.name}${t.actor?.id === acteur.id ? " (toi)" : ` (${genre(t)})`}`).join(", ")}.` : "",
    combat?.started ? `Combat : round ${combat.round}, tour de ${combat.combatant?.name ?? "?"} ; ordre : `
      + `${combat.turns.filter(c => !c.hidden).map(c => c.name).join(", ")}.` : "",
    // Fénoir : ce que tout membre du groupe sait (état public seulement ; le monde réel n'est jamais lu ici).
    ...(game.system?.id === "lakour-survie" && game.lakourSurvie
      ? vuePubliqueDepuisApi(game.lakourSurvie, { acteur: id => game.actors?.get?.(id) ?? null }) : [])
  ];
  const autres = visibles.filter(t => t.actor && t.actor.id !== acteur.id).map(t => ({ id: t.actor.id, nom: t.name, vivant: true }));
  return {
    id: acteur.id, nom: acteur.name, monde: game.world?.title ?? game.system?.title ?? "", jeu: "aventure",
    // Sa fiche, et ses secrets (sa propre page secrète : c'est la sienne) ; jamais celle d'un autre.
    personnalite: personnaliteDe(acteur), fiche: [sys.resumer(acteur), ligneHistoireActeur(acteur, { publique: false, secret: true })].filter(Boolean).join(" — "), prive: privesDe(acteur.id), public: chatPublic({ messages, paroles: parolesPour(acteur.id) }),
    scene: lignes.filter(Boolean).join("\n"), autres, allies: [], suspects: [], vivant: true, peutParler: true, tour: combat?.round ?? 0
  };
}

export function vueDe(acteur, options = {}) {
  const vue = acteur?.type === "villageois" && (options.api ?? game.lakourLoups) ? vueVeillees(acteur, options) : vueAventure(acteur, options);
  // La langue du monde : un compagnon d'un monde anglais parle anglais (compagnons.js, consigneLangueCompagnon).
  return { ...vue, langue: langueDuMonde() };
}

// ------------------------------------------------------------------ noms des compagnons des Veillées
const NOMS_DE_SECOURS = ["Mathurin Vaudrey", "Ysaline Corbet", "Anselme Ferrand", "Odile Basquin", "Gaspard Lerouge", "Clémence Aubrac",
  "Firmin Delorme", "Rosalie Brunet", "Eudes Malivert", "Perrine Sauvage", "Bastien Corbière", "Léontine Gaudry"];

// n noms tirés de la table « Noms de villageois » du module de contenu (compendium « tables » de lakour-veillees ou de sa variante
// anglaise lakour-veillees-en, celle qui est active), sans ceux déjà pris.
export async function nomsPourCompagnons(n, { exclus = [] } = {}) {
  let noms = [];
  try {
    const module = contenuNomme("lakour-loups");
    const pack = game.packs?.get(packDeContenu("tables", "lakour-loups"));
    const docs = pack ? await pack.getDocuments() : [];
    const table = docs.find(d => drapeauxDuContenu(d.flags, module)?.cle === "noms-de-villageois") ?? docs.find(d => /noms/i.test(d.name ?? ""));
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
  // La Gazette de la lune : la Grande Défiance (deux voix), l'élection de l'Exécuteur, le Châtiment (témoigner), le vote à tour de rôle.
  if (demande.type === "vote" && demande.mode === "defiance") return "defiance";
  if (demande.type === "vote" && demande.objet === "executeur") return "vote-executeur";
  if (demande.type === "vote" && demande.objet === "chatiment") return "vote-chatiment";
  if (demande.type === "vote") return demande.objet === "bailli" ? "bailli" : demande.objet === "chapelle" ? "chapelle" : demande.mode === "suite" ? "suite" : "vote";
  // Le Pacte : les derniers gestes, les ambigus, le Village, les variantes, la Gazette (l'objet de la demande est son sujet).
  if (OBJETS_DU_PACTE.includes(demande.objet)) return demande.objet;
  if (demande.objet === "departage") return "departage";
  if (demande.objet === "deuil-vision") return "deuil-vision";
  if (demande.objet === "deuil-voix") return "deuil-voix";
  if (demande.objet === "succession") return "succession";
  return demande.posthume ? "posthume" : "nuit";
}

// Les objets de demande du Pacte (système lakour-loups, docs/loups-contrat.md des Veillées), chacun son sujet.
export const OBJETS_DU_PACTE = ["emporter", "votants", "chapardeur", "bateleur", "chambriere", "supplique", "grace", "prevot", "logement", "chaine",
  "marche", "appel", "chatiment", "influences", "executeur", "crieur-nommer", "crieur-transmettre", "crieur-garder", "crieur-annonce",
  "seance-question", "seance-spirite", "seance-designer", "spectre", "benet"];
// Les sujets qui sont des votes (le cerveau peut s'abstenir).
export const SUJETS_DE_VOTE = ["vote", "chapelle", "bailli", "departage", "souffle", "banc", "exil", "defiance", "vote-executeur", "vote-chatiment", "suite"];

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
    + "égalités), ou passe : la charge restera vacante et le village élira un nouveau Bailli.",
  // Le Pacte : chaque demande nouvelle, ce qu'elle décide (le modèle lit aussi l'invite du système).
  emporter: "Tu es mort, et ta carte t'emporte quelqu'un dans la tombe (la Braconnière) : désigne qui meurt avec toi, ou passe.",
  votants: "Tu es mort de l'égalité (le Souffre-douleur) : désigne ceux qui auront le droit de voter demain aux votes d'exécution (un au "
    + "moins, autant que tu veux) ; les autres ne voteront pas.",
  chapardeur: "Le Chapardeur : les candidats sont des CARTES. En prendre une, c'est échanger ta carte contre elle (ton rôle, et peut-être "
    + "ton camp, changent) ; passer, c'est garder la tienne.",
  bateleur: "Le Bateleur : les candidats sont des CARTES face visible. Celle que tu choisis, tu la joues cette nuit (tu te réveilleras "
    + "avec son pouvoir) ; passer : rien cette nuit.",
  chambriere: "La Chambrière : te dévouer pour un condamné (le désigner), c'est prendre sa carte ; la sienne n'est pas montrée, la tienne "
    + "de Chambrière est retournée (ton secret tombe). Passe si tu ne veux pas.",
  supplique: "Le village t'a condamné : supplier le Hobereau (le désigner) peut te sauver ; il décidera. Passer, c'est accepter ton sort.",
  grace: "Tu es le Hobereau : gracier ce condamné (le désigner) le sauve de ce vote, une seule fois par partie ; passe sinon.",
  prevot: "Tu es le Prévôt : un bâtiment est libre, désigne le Chemineau que tu y loges (il prendra sa personnalité), ou passe.",
  logement: "Le Prévôt t'offre un bâtiment : te désigner, c'est accepter (tu prends sa personnalité) ; passer, c'est refuser.",
  chaine: "La Chaîne des innocents : désigne un villageois encore debout dont tu GARANTIS l'innocence ; il s'assied. Le dernier debout "
    + "sera condamné (un loup peut blanchir un loup).",
  marche: "Le Marché avec le Malin : te désigner, c'est accepter (ce vote ne t'élimine pas), mais si ton camp perd, tu ne seras pas de la "
    + "partie suivante. Ce n'est pas toujours une bonne affaire : pèse-le.",
  appel: "Le Châtiment t'accuse : te désigner, c'est lancer un appel au village pour que deux joueurs témoignent pour toi ; passer, c'est te taire.",
  chatiment: "Tu es mort : le Châtiment te fait désigner le joueur que le village doit punir (il faudra deux témoignages pour le sauver).",
  influences: "Tu es mort : les Influences te font choisir qui votera le premier (le vote se fera à tour de rôle, à découvert).",
  executeur: "Tu étais l'Exécuteur : désigne ton successeur (il apprendra seul les cartes des condamnés).",
  "crieur-nommer": "Tu es le Bailli : nomme le Crieur public (jamais toi), qui lira peut-être des cartes de la Gazette au matin.",
  "crieur-transmettre": "Tu es devenu Bailli et tu étais Crieur public : transmets cette charge à un autre.",
  "crieur-garder": "Tu es le nouveau Bailli : désigner le Crieur actuel, c'est le garder ; un autre, c'est le remplacer.",
  "crieur-annonce": "Tu es le Crieur public : les candidats sont tes CARTES de la Gazette. En lire une l'applique aussitôt à tout le "
    + "village ; passer, c'est te taire ce matin. Garde-les pour le bon moment.",
  "seance-question": "Le Spiritisme : choisis la question que l'esprit du premier mort entendra (il répondra par oui ou non, sans mentir).",
  "seance-spirite": "Le Spiritisme : désigne le Spirite, qui posera la question à l'esprit.",
  "seance-designer": "Le Spiritisme : désigne les joueurs sur qui porte la question.",
  spectre: "Le Spectre : tu deviens loup ; désigne l'ancien loup qui mourra à ta place.",
  benet: "Tu es mort le premier : le Méchant Benêt te fait désigner un joueur qui n'est pas loup ; il deviendra l'allié secret de la meute.",
  defiance: "La Grande Défiance : donne tes DEUX voix à deux amis (jamais toi) ; ceux qui n'en reçoivent aucune seront condamnés.",
  "vote-executeur": "Élection de l'Exécuteur : vote pour celui qui apprendra seul les cartes des condamnés.",
  "vote-chatiment": "Le Châtiment : désigner l'accusé, c'est TÉMOIGNER POUR LUI (pour le sauver) ; ne rien choisir, c'est te taire. Avec "
    + "moins de deux témoignages, il est éliminé.",
  suite: "Vote à tour de rôle, à découvert : c'est ton tour, et tout le monde verra ta voix."
};
// Les réveils dont l'effet change le sens d'un choix (le Mâtin, la Liseuse d'étoiles) : une précision de plus.
const PRECISIONS_DES_EFFETS = {
  "choisir-camp": "Le Mâtin : te désigner, c'est rejoindre la meute dès cette nuit (ton camp change) ; passer, c'est rester au Village.",
  spiritisme: "La Liseuse d'étoiles : te désigner, c'est tenir une séance de Spiritisme au matin ; passer, c'est attendre."
};
// Le Mur des murmures (mode « texte ») : une phrase ANONYME, à ne pas confondre avec le mot du Messager.
const PRECISION_DU_MUR = "Le Mur des murmures : écris une courte phrase ANONYME (jamais ton nom, rien qui te trahisse), que tout le village "
  + "lira au matin sans savoir qui l'a écrite. Ce n'est pas un mot du Messager.";
const estLeMur = invite => {
  const t = String(invite ?? "");
  try { if (game.i18n?.has?.("LAKOUR_LOUPS.Variantes.Mur.Invite") && t === game.i18n.localize("LAKOUR_LOUPS.Variantes.Mur.Invite")) return true; } catch { /* sans i18n */ }
  return /mur des murmures|wall of whispers/i.test(t);
};
const inviteLoups = (demande, sujet, effet = "") => [PRECISIONS_LOUPS[sujet], sujet === "nuit" ? PRECISIONS_DES_EFFETS[effet] : "", demande.invite].filter(Boolean).join("\n");

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
    case "emporter": return `Mort, tu as ${qui ? `emporté ${qui} dans la tombe` : "n'emporté personne"}.`;
    case "votants": return `Mort de l'égalité, tu as désigné qui votera demain : ${qui || "personne"}.`;
    case "chapardeur": return `Nuit ${tour}, Chapardeur : ${qui ? `tu as pris la carte « ${noms[0]} »` : "tu as gardé ta carte"}.`;
    case "bateleur": return `Nuit ${tour}, Bateleur : ${qui ? `tu joues la carte « ${noms[0]} »` : "tu n'as joué aucune carte"}.`;
    case "chambriere": return `Jour ${tour}, Chambrière : ${qui ? `tu t'es dévouée pour ${qui}` : "tu ne t'es pas dévouée"}.`;
    case "supplique": return `Jour ${tour} : ${qui ? `tu as supplié ${qui} de te gracier` : "tu n'as pas supplié le Hobereau"}.`;
    case "grace": return `Jour ${tour}, Hobereau : ${qui ? `tu as gracié ${qui}` : "tu n'as gracié personne"}.`;
    case "prevot": return `Jour ${tour}, Prévôt : ${qui ? `tu as logé ${qui}` : "tu as laissé le bâtiment vide"}.`;
    case "logement": return `Jour ${tour} : ${qui ? "tu as accepté le bâtiment du Prévôt" : "tu as refusé le bâtiment du Prévôt"}.`;
    case "chaine": return `Vote du tour ${tour}, Chaîne des innocents : ${qui ? `tu as garanti l'innocence de ${qui}` : "tu n'as désigné personne"}.`;
    case "marche": return `Jour ${tour} : ${qui ? "tu as passé un marché avec le Malin" : "tu as refusé le marché du Malin"}.`;
    case "appel": return `Jour ${tour}, Châtiment : ${qui ? "tu as lancé un appel au village" : "tu t'es tu"}.`;
    case "chatiment": return `Mort, tu as désigné ${qui || "personne"} pour le Châtiment.`;
    case "influences": return `Mort, tu as choisi ${qui || "personne"} pour voter le premier.`;
    case "executeur": return `Mort, tu as désigné ton successeur d'Exécuteur : ${qui || "personne"}.`;
    case "crieur-nommer": case "crieur-transmettre": case "crieur-garder": return `Jour ${tour}, Crieur public : ${qui ? `tu as désigné ${qui}` : "tu n'as désigné personne"}.`;
    case "crieur-annonce": return `Matin du tour ${tour}, Crieur public : ${qui ? `tu as lu « ${noms[0]} »` : "tu t'es tu"}.`;
    case "seance-question": case "seance-spirite": case "seance-designer": return `Matin du tour ${tour}, Spiritisme : ${qui ? `tu as choisi ${qui}` : "tu as passé"}.`;
    case "spectre": return `Nuit ${tour}, Spectre : ${qui ? `${qui} meurt à ta place` : "tu n'as désigné personne"}.`;
    case "benet": return `Méchant Benêt : ${qui ? `tu as fait de ${qui} l'allié secret de la meute` : "tu n'as désigné personne"}.`;
    case "defiance": return `Vote du tour ${tour}, Grande Défiance : ${qui ? `tes voix à ${qui}` : "tu t'es abstenu"}.`;
    case "vote-executeur": return `Élection de l'Exécuteur, tour ${tour} : ${qui ? `tu as voté pour ${noms[0]}` : "tu t'es abstenu"}.`;
    case "vote-chatiment": return `Châtiment, tour ${tour} : ${qui ? `tu as témoigné pour ${noms[0]}` : "tu t'es tu"}.`;
    case "suite": return `Vote du tour ${tour} (à découvert) : ${qui ? `tu as voté contre ${noms[0]}` : "tu t'es abstenu"}.`;
    default: return `Nuit ${tour} (« ${invite} ») : tu as choisi ${qui || "de passer"}.`;
  }
}

// ------------------------------------------------------------------ décider sans modèle : les politiques du système (Le Pacte, étape 6)
// Le système des Veillées expose les politiques de jeu de ses joueurs simulés (api.logique : savoirDuJoueur, politiqueDeNuit,
// politiqueDeVote, rumeurDuJour, proieDuVoteDeLaMeute, politiqueDuJour, annoncesDuJoueur) ; un compagnon sans modèle s'en sert, avec
// l'adresse de son tempérament (compagnons.js, adresseDe). Il ne sait que ce que sait son villageois : son carnet, le chat public, les
// rôles révélés, le Registre, ce que les compagnons ont dit tout haut. Un système plus ancien (sans api.logique.politiqueDeNuit) : null,
// le repli d'avant (compagnons.js, repliDecision).
const politiquesDe = api => (typeof api?.logique?.politiqueDeNuit === "function" && typeof api.logique.savoirDuJoueur === "function" ? api.logique : null);
// Les annonces des compagnons au débat (en mémoire, liées à la partie) : [{ partie, tour, par, cible, camp }].
const annoncesDesCompagnons = [];
function retenirAnnonce(par, cible, tour = 0) {
  annoncesDesCompagnons.push({ partie: partieEnCours(), tour, par, cible, camp: "meute" });
  while (annoncesDesCompagnons.length > 200) annoncesDesCompagnons.shift();
}
const annoncesDeLaPartie = () => annoncesDesCompagnons.filter(a => a.partie === partieEnCours()).map(({ par, cible, camp }) => ({ par, cible, camp }));
// Tout oublier (reinitialiserPrive, effacerPrive) : les annonces, les pouvoirs de jour tentés, le contenu gardé.
function oublierLesPolitiques() {
  annoncesDesCompagnons.length = 0;
  pouvoirsTentes.clear();
  contenuDesPolitiques = { partie: null, roles: {}, nomsDesRoles: {} };
}
// Le contenu de la partie (l'équilibre : camp, information, protection de chaque rôle ; les noms des rôles), gardé par partie.
let contenuDesPolitiques = { partie: null, roles: {}, nomsDesRoles: {} };
async function contenuPourPolitiques(api) {
  const partie = partieEnCours();
  if (contenuDesPolitiques.partie === partie) return contenuDesPolitiques;
  let c = null;
  try { c = typeof api?.contenu === "function" ? await api.contenu() : null; } catch { c = null; }
  contenuDesPolitiques = { partie, roles: c?.equilibre?.roles ?? {}, nomsDesRoles: Object.fromEntries((c?.roles ?? []).map(r => [r.nom, r.cle])) };
  return contenuDesPolitiques;
}
// Le chat public, en texte (sans « Nom : » devant : les gabarits du système se lisent sur la phrase même).
const textesPublics = (messages = game.messages?.contents ?? []) => messages
  .filter(m => !m.whisper?.length && !m.blind && !m.flags?.[ID]?.prive).map(m => texteBrut(m.content)).filter(Boolean).slice(-80);
// Le savoir d'un compagnon, au sens des politiques du système.
async function savoirDuCompagnon(api, acteur, vue) {
  const L = politiquesDe(api);
  if (!L) return null;
  const contenu = await contenuPourPolitiques(api);
  const pub = L.etatPublic ? L.etatPublic(api.etat()) : api.etat();
  const gabarits = game.i18n?.translations?.LAKOUR_LOUPS ?? null;
  const camps = gabarits?.Camps ?? {};
  const nomsDesCamps = Object.fromEntries(Object.entries(camps).map(([cle, libelle]) => [libelle, cle]));
  const roleDe = a => (a.id === acteur.id ? roleLoups(a, api) : a.system?.revele ? a.items?.find?.(i => i.type === "role") ?? null : null);
  const villageois = api.villageois().map(a => {
    const r = roleDe(a);
    return { id: a.id, nom: a.name, vivant: a.system?.vivant !== false, revele: Boolean(a.system?.revele),
      camp: a.id === acteur.id ? vue.camp || "" : a.system?.revele ? r?.system?.camp ?? "" : "", role: r?.system?.cle ?? "" };
  });
  const textes = [...(api.carnet?.(acteur.id) ?? []).map(e => texteBrut(e.html ?? e.texte)), ...privesDe(acteur.id)];
  return L.savoirDuJoueur({ moi: acteur.id, camp: vue.camp || "village", allies: vue.allies ?? [], textes, publics: textesPublics(),
    villageois, gabarits, nomsDesRoles: contenu.nomsDesRoles, nomsDesCamps, annonces: annoncesDeLaPartie(), roles: contenu.roles,
    registre: pub.registre ?? [], role: vue.roleCle ?? "", groupes: pub.ambigus?.groupes ?? null,
    voisins: id => { const v = appelSur(api, "voisins", id); return [v?.gauche, v?.droite].filter(Boolean); } });
}
// L'effet d'un réveil de nuit : celui de son rôle quand l'invite est la sienne (l'Herboriste : la sienne, précédée des proies) ; un loup
// réveillé sous une autre invite chasse (la meute, le Toucher, la Crue) ; sinon (une carte empruntée, une seconde carte), au hasard.
function effetDuReveil(api, acteur, vue, invite = "") {
  const role = roleLoups(acteur, api);
  const sienne = String(role?.system?.nuit?.invite ?? "");
  if (sienne && String(invite).includes(sienne)) return role?.system?.effet ?? "";
  if (vue.camp === "meute") return "tuer";
  return sienne ? "" : role?.system?.effet ?? "";
}
// -> { cibles } | null (null : le repli d'avant).
export async function decisionParPolitique(api, acteur, vue, demande, sujet, graine = "") {
  const L = politiquesDe(api);
  if (!L || !acteur) return null;
  const savoir = await savoirDuCompagnon(api, acteur, vue);
  if (!savoir) return null;
  const contenu = await contenuPourPolitiques(api);
  const adresse = adresseDe(vue.personnalite, vue.id);
  const h = hasard(`politique|${graine}|${vue.id}|${demande.id ?? demande.invite ?? ""}`);
  const candidats = (demande.candidats ?? []).map(c => ({ id: c.id, nom: c.nom }));
  const ids = candidats.map(c => c.id);
  const garder = l => ({ cibles: [...new Set((l ?? []).filter(id => ids.includes(id)))].slice(0, Math.max(1, demande.nombre ?? 1)) });
  if (demande.type === "vote") {
    // La Défiance, le Châtiment, le Banc, le Dernier souffle : le repli (compagnons.js) a leur règle propre.
    if (!["vote", "suite", "chapelle", "bailli", "vote-executeur"].includes(sujet) || typeof L.politiqueDeVote !== "function") return null;
    const objet = sujet === "bailli" || sujet === "vote-executeur" ? "bailli" : sujet === "chapelle" ? "chapelle" : "execution";
    // Ce dont le village et la meute se sont parlé : la rumeur du jour, la proie concertée de la meute (même tirage pour tous).
    const e = api.etat();
    const commun = cle => hasard(`${cle}|${partieEnCours()}|${e.tour}|${e.vote?.numero ?? demande.numero ?? 0}`);
    const revele = new Map(api.villageois().filter(a => a.system?.revele).map(a => [a.id, a.items?.find?.(i => i.type === "role")?.system?.camp ?? ""]));
    const annonces = annoncesDeLaPartie();
    const rumeur = typeof L.rumeurDuJour === "function" ? L.rumeurDuJour({ candidats: ids, annonces, menteurs: savoir.menteurs ?? [], hasard: commun("rumeur"), adresse,
      connus: ids.filter(id => revele.get(id) === "meute"), fiables: typeof L.fiablesDesAnnonces === "function" ? L.fiablesDesAnnonces(annonces, revele) : [] }) : "";
    const proie = savoir.camp === "meute" && typeof L.proieDuVoteDeLaMeute === "function" ? L.proieDuVoteDeLaMeute({ candidats: ids, savoir, adresse, hasard: commun("proie") }) : "";
    const c = L.politiqueDeVote({ objet, candidats: ids, savoir, adresse, hasard: h, place: { rumeur, proie } });
    return garder(c ? [c] : []);
  }
  // Les gestes que le système sait jouer (Braconnière, Souffre-douleur, Prévôt, Chaîne, Chambrière, Hobereau…).
  if (L.POLITIQUES_DES_GESTES?.[sujet]) {
    return garder(L.politiqueDeNuit({ objet: sujet, candidats, nombre: demande.nombre ?? 1, invite: demande.invite, savoir, adresse, hasard: h,
      roles: contenu.roles, nomsDesRoles: contenu.nomsDesRoles }));
  }
  // Un réveil de nuit (son rôle, la meute ; le Chapardeur et le Bateleur choisissent une carte).
  if (["nuit", "chapardeur", "bateleur"].includes(sujet)) {
    const effet = sujet === "nuit" ? effetDuReveil(api, acteur, vue, demande.invite) : vue.effet;
    // Le Mâtin et la Liseuse d'étoiles : un choix de goût (le repli s'en charge).
    if (["choisir-camp", "spiritisme"].includes(effet) && ids.length === 1) return null;
    return garder(L.politiqueDeNuit({ effet, objet: "", candidats, nombre: demande.nombre ?? 1, invite: demande.invite, savoir, adresse, hasard: h,
      roles: contenu.roles, nomsDesRoles: contenu.nomsDesRoles, solitaire: vue.camp === "solitaire" }));
  }
  return null;
}
// Ce que le compagnon dirait tout haut au débat (un loup qu'il croit tenir ; un loup ment parfois) : { cible, nom } | null.
async function annonceDuCompagnon(api, acteur, vue) {
  const L = politiquesDe(api);
  if (!L || typeof L.annoncesDuJoueur !== "function") return null;
  try {
    const savoir = await savoirDuCompagnon(api, acteur, vue);
    const vivants = api.villageois().filter(a => a.system?.vivant !== false).map(a => a.id);
    const dejaDites = annoncesDesCompagnons.filter(a => a.partie === partieEnCours() && a.par === acteur.id).map(a => a.cible);
    const [x] = L.annoncesDuJoueur({ savoir, adresse: adresseDe(vue.personnalite, vue.id), hasard: hasard(`annonce|${acteur.id}|${vue.tour}|${dejaDites.length}`), dejaDites, vivants });
    const nom = x?.cible ? game.actors.get(x.cible)?.name : "";
    return nom ? { cible: x.cible, nom } : null;
  } catch { return null; }
}
// Un pouvoir de jour (politiqueDuJour), au plus un par jour et par compagnon, seulement au débat : le système l'applique et l'annonce.
const pouvoirsTentes = new Set();
async function pouvoirDuJourDuCompagnon(api, acteur, vue, graine = "") {
  const L = politiquesDe(api);
  if (!L || typeof L.politiqueDuJour !== "function" || typeof api?.pouvoirsDeJour !== "function" || typeof api.agirDeJour !== "function") return null;
  const e = api.etat();
  if (e.phase !== "jour" || e.vainqueur) return null;
  const cle = `${partieEnCours()}|${e.tour}|${acteur.id}`;
  if (pouvoirsTentes.has(cle)) return null;
  pouvoirsTentes.add(cle);
  try {
    const possibles = api.pouvoirsDeJour(acteur.id).filter(p => p.possible && p.pouvoir !== "chapelle")
      .map(p => ({ pouvoir: p.pouvoir, nom: p.nom, cibles: p.cibles, candidats: p.candidats ?? [] }));
    if (!possibles.length) return null;
    const savoir = await savoirDuCompagnon(api, acteur, vue);
    const choix = L.politiqueDuJour({ possibles, savoir, adresse: adresseDe(vue.personnalite, vue.id), hasard: hasard(`jour|${graine}|${cle}`) });
    if (!choix) return null;
    await api.agirDeJour({ acteurId: acteur.id, pouvoir: choix.pouvoir, cibles: choix.cibles ?? [] });
    await noterPrive(acteur.id, `Jour ${e.tour} : tu as usé de ton pouvoir de jour (${possibles.find(p => p.pouvoir === choix.pouvoir)?.nom ?? "ton pouvoir"}).`);
    return choix;
  } catch (err) {
    console.warn(`${ID} | pouvoir de jour d'un compagnon refusé`, err);
    return null;
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
    // Sans modèle, aux Veillées : ce qu'il sait se dit tout haut (les politiques du système : annoncesDuJoueur).
    const sansModele = !this.cerveaux.modeIA();
    for (const c of choisirOrateurs(parlants, { max, mentions, derniere: this.derniere })) {
      if (sansModele && c.vue.jeu === "loups") c.vue.annonce = await annonceDuCompagnon(game.lakourLoups, c.acteur, c.vue);
      const r = await this.cerveaux.parler(c.vue);
      if (sansModele && c.vue.jeu === "loups") await pouvoirDuJourDuCompagnon(game.lakourLoups, c.acteur, c.vue, this.cerveaux.graine);
      if (!r.texte) continue;
      if (c.vue.annonce && r.source === "repli" && r.texte.includes(c.vue.annonce.nom)) retenirAnnonce(c.id, c.vue.annonce.cible, c.vue.tour);
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
      // Le Mur des murmures (une phrase anonyme), ou le mot confié au Messager.
      const mur = estLeMur(demande.invite);
      const r = await this.cerveaux.decider(vue, { type: "texte", invite: mur ? `${PRECISION_DU_MUR}\n${demande.invite}` : demande.invite, max: demande.max,
        cle: `texte|${demande.id}`, ...(mur ? { objet: "mur" } : {}) });
      if (r.texte) await noterPrive(acteur.id, mur ? `Nuit ${vue.tour} : tu as écrit sur le Mur des murmures : « ${r.texte} ».` : `Nuit ${vue.tour} : tu as confié ce mot au Messager : « ${r.texte} ».`);
      return r.texte;
    }
    const candidats = (demande.candidats ?? []).map(c => ({ id: c.id, nom: c.nom }));
    const sujet = sujetDemandeLoups(demande);
    const demandeCerveau = { type: "cibles", invite: inviteLoups(demande, sujet, vue.effet), candidats, nombre: demande.nombre ?? 1,
      vote: SUJETS_DE_VOTE.includes(sujet), objet: sujet, cle: `${demande.type}|${demande.id}` };
    // Sans modèle : les politiques de jeu du système des Veillées (Le Pacte, étape 6), l'adresse de son tempérament ; un système qui
    // ne les a pas : le repli d'avant.
    const r = await this.cerveaux.decider(vue, demandeCerveau, { repli: () => decisionParPolitique(game.lakourLoups, acteur, vue, demande, sujet, this.cerveaux.graine) });
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
