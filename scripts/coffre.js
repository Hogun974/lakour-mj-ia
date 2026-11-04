// Le coffre du moteur, branché sur Foundry, dans TOUS les mondes (Veillées comprises) : la clé qui chiffre le Carnet de campagne
// caché (40k, Warcraft) et le fil de l'IA avec ses archives (fils.js). Chiffrement et partage de la clé : coffre-logique.js ; ce
// qui est secret dans chaque registre du Carnet : secrets-logique.js. Essais : essais/coffre-carnet.test.mjs.
//
// Règle première : rien n'est jamais scellé sous une clé que personne ne pourrait reconstituer.
// - Une clé n'entre en vigueur (réglage « trousseau ») qu'une fois ses parts ACCUSÉES par `seuil` joueurs (ou sa clé de secours
//   exportée par le MJ). Seule la toute première clé d'un monde (rien n'est encore scellé) entre en vigueur aussitôt ; le MJ est
//   alors invité à exporter la clé de secours tant que les porteurs de parts ne suffisent pas.
// - Renouvellement (un compte supprimé, créé ou qui change de rôle ; api.coffre.renouveler()) : une clé « en cours » est annoncée
//   (trousseau.enCours, public : id, seuil, empreinte, porteurs), ses parts envoyées ; tant qu'elles ne sont pas accusées par son
//   seuil, l'ancienne clé reste en vigueur et tout continue d'être scellé avec elle. Ensuite seulement : coffre et fichiers
//   rescellés, puis le trousseau publié. Une coupure au milieu ne perd rien : chaque joueur garde ses parts par id de clé, et
//   le trousseau garde l'empreinte des anciennes clés.
// - Un MJ actif sans une clé (nouveau navigateur) demande les parts de chaque id qui scelle réellement quelque chose (le coffre,
//   un fil) ou qui est en vigueur, une fois par id (api.coffre.chercher() redemande) ; il demande aussi la clé aux autres MJ
//   connectés (« coffre.cle », à lui seul). Tant qu'il attend, il ne scelle rien : rien de chiffré n'est jamais écrasé.
// - Clé de secours : un petit fichier que le MJ télécharge (api.coffre.exporterSecours(), fenêtre du coffre) et réimporte sur un
//   autre navigateur (api.coffre.importerSecours(fichier)) ; elle ne passe jamais par un réglage monde, le chat, Data/ ni le
//   socket.
// - Rappel : qu'on ne perde plus jamais une clé par oubli. Dès qu'une clé est créée (première clé, clé neuve après abandon) ou
//   entre en vigueur (renouvellement validé) sans clé de secours téléchargée pour elle, le MJ actif voit une fenêtre « Télécharge
//   ta clé de secours maintenant » (apps/coffre.js, branchée par brancherRappel) ; « Plus tard » : une notification permanente à
//   chaque chargement du monde, tant que ce n'est pas fait. Jamais plus d'un rappel par clé et par chargement. Les dates de
//   téléchargement sont mémorisées par empreinte de clé dans « cleCarnet » (client, jamais en monde) ; une clé réimportée compte
//   comme téléchargée (elle est sur disque).
// Réglages :
// - « trousseau » (monde) : { id, seuil, empreinte, porteurs, enCours, anciennes } (rien de secret : des empreintes SHA-256) ;
// - « horloges », « enquetes », « contacts » (monde) : la part publique des éléments visibles, seulement ;
// - « coffreCarnet » (monde, chiffré) : { chiffre, id, iv, donnees } : les listes complètes et les retraits récents ;
// - « cleCarnet » (client, chez un MJ) : { [monde]: { [userId]: { courante, enAttente, anciennes, secours } } }, lu par un MJ pour
//   lui seul (secours : { [empreinte]: date ISO du dernier téléchargement de la clé de secours qui la contient }) ;
//   « partCarnet » (client, chez un joueur) : { [monde]: { [userId]: { [idDeCle]: part } } } (les dernières, par id).
// Chez le MJ actif, tout ce qui touche à la clé ou au coffre passe dans UNE file (enFile) : rien ne s'y croise.
// ATTENTION : un compte joueur sans mot de passe est une part que n'importe qui peut prendre (et des comptes ouverts à tous
// suffisent à atteindre le seuil) : la protection suppose que chaque compte ait un mot de passe.
import { ID } from "./constantes.js";
import { estMJActif, recevoir, envoyer, versMJ, ecouterCanal } from "./canal.js";
import { horlogesDisponibles } from "./horloges-logique.js";
import * as C from "./coffre-logique.js";
import * as S from "./secrets-logique.js";

export const MAX_ANCIENNES = 10;
export const MAX_PARTS_GARDEES = 4;
export const TYPE_SECOURS = "lakour-mj-ia/cle-de-secours";

// [{ donnees, contenu }] : les deux derniers coffres du Carnet ouverts dans ce navigateur (contenu : listes complètes, retraits).
let ouverts = [];
let demandes = new Set();     // ids dont ce MJ a demandé les parts (une fois chacun ; chercher() redemande)
let recues = new Map();       // id -> Map(userId -> part rendue)
let idsVus = new Set();       // ids qui scellent un fichier que ce navigateur n'a pas su ouvrir (fils.js)
let file = Promise.resolve();
let etaisActif = false;
let avertis = new Set();
let rappeles = new Set();     // empreintes des clés dont la clé de secours a été rappelée depuis ce chargement (une fois chacune)
let fenetreRappel = null;     // fn() : la fenêtre « Télécharge ta clé de secours maintenant » (apps/coffre.js) ; sinon, une notification
const quandDisponible = [];   // fn() : la clé est là (démarrage, réouverture) — fils.js y chiffre les anciens fils
const quandRenouvele = [];    // fn(cle) : nouvelle clé validée — fils.js y rescelle les fils et archives avec elle

// Oublie tout ce que ce navigateur sait du coffre en mémoire (essais ; rechargement simulé).
export function oublierCoffre() {
  ouverts = [];
  demandes = new Set();
  recues = new Map();
  idsVus = new Set();
  file = Promise.resolve();
  etaisActif = false;
  avertis = new Set();
  rappeles = new Set();
}
export const siCleDisponible = fn => { quandDisponible.push(fn); };
export const siRenouvele = fn => { quandRenouvele.push(fn); };
// Un fichier scellé avec cet id n'a pas pu être ouvert ici : ses parts seront demandées.
export const signalerId = id => { if (id) idsVus.add(id); };
const retenir = (donnees, contenu) => { ouverts = [{ donnees, contenu }, ...ouverts.filter(o => o.donnees !== donnees)].slice(0, 2); };

const monde = () => String(game.world?.id ?? "");
const objet = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
function lireReglage(nom) {
  try { return game.settings.get(ID, nom); } catch { return undefined; }
}
export const lireCoffre = () => objet(lireReglage("coffreCarnet"));
export const lireTrousseau = () => objet(lireReglage("trousseau"));
export function lireClair(registre) {
  const v = lireReglage(registre);
  return Array.isArray(v) ? v : [];
}
const comptesJoueurs = () => game.users.filter(u => !u.isGM).map(u => u.id);
const joueursConnectes = () => game.users.filter(u => u.active && !u.isGM).map(u => u.id);
const autresMJConnectes = () => game.users.filter(u => u.active && u.isGM && u.id !== game.user.id).map(u => u.id);
export const disponible = () => horlogesDisponibles(game.system?.id);
const rafraichir = (cle = null) => game.modules?.get(ID)?.api?.horloges?.rafraichir?.(cle);
function avertir(niveau, cle, donnees = {}, une = "", options = {}) {
  if (une && avertis.has(une)) return;
  if (une) avertis.add(une);
  try {
    const texte = globalThis.game?.i18n?.format?.(`LAKOUR_MJIA.Coffre.${cle}`, donnees);
    if (texte) globalThis.ui?.notifications?.[niveau]?.(texte, options);
  } catch { /* pas d'interface (essais) */ }
}
function emettre(message, destinataires) {
  try { envoyer(message, destinataires); } catch (e) { console.warn(`${ID} | coffre`, e); }
}
const meta = async cle => ({ id: cle.id, seuil: cle.seuil, empreinte: await C.empreinte(cle) });
// Les clés que le trousseau connaît (en vigueur, en cours, anciennes) : { id, seuil, empreinte }.
const metas = () => {
  const t = lireTrousseau();
  return [t.id ? t : null, t.enCours, ...(Array.isArray(t.anciennes) ? t.anciennes : [])].filter(m => m?.id && m.empreinte);
};
const metaPour = id => metas().find(m => m.id === id) ?? null;

// ------------------------------------------------------------------ les clés de ce navigateur (MJ seulement, pour lui-même)
function local() {
  if (!game.user?.isGM) return {};
  return objet(objet(objet(lireReglage("cleCarnet"))[monde()])[game.user.id]);
}
const valide = c => Boolean(c?.k && c.id);
const mesCles = () => {
  const l = local();
  return [l.courante, l.enAttente?.cle, ...(Array.isArray(l.anciennes) ? l.anciennes : [])].filter(valide);
};
const cleDe = id => (id ? mesCles().find(c => c.id === id) ?? null : null);
// La clé en vigueur (celle du trousseau), si ce navigateur l'a.
export const cleCourante = () => cleDe(lireTrousseau().id);
const cleAbsente = () => Boolean(lireTrousseau().id) && !cleCourante();
async function ecrireLocal(neuf) {
  const tout = objet(lireReglage("cleCarnet"));
  const parMonde = objet(tout[monde()]);
  const l = { courante: null, enAttente: null, anciennes: [], secours: objet(parMonde[game.user.id]?.secours), ...neuf };
  l.anciennes = l.anciennes.filter(valide).filter((c, i, a) => a.findIndex(d => d.id === c.id) === i
    && c.id !== l.courante?.id && c.id !== l.enAttente?.cle?.id).slice(0, MAX_ANCIENNES);
  // Les dates de téléchargement de la clé de secours, par empreinte : les plus récentes seulement.
  l.secours = Object.fromEntries(Object.entries(objet(l.secours)).filter(([, d]) => typeof d === "string" && d)
    .sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, 2 * MAX_ANCIENNES));
  await game.settings.set(ID, "cleCarnet", { ...tout, [monde()]: { ...parMonde, [game.user.id]: l } });
}
// Range une clé retrouvée (parts, autre MJ, secours) à sa place : en vigueur, en cours ou ancienne.
async function ajouterCle(cle) {
  if (!valide(cle) || cleDe(cle.id)) return false;
  const l = local();
  const t = lireTrousseau();
  if (cle.id === t.id) await ecrireLocal({ ...l, courante: cle, anciennes: [l.courante, ...(l.anciennes ?? [])] });
  else if (cle.id === t.enCours?.id) await ecrireLocal({ ...l, enAttente: { ...objet(l.enAttente), cle } });
  else await ecrireLocal({ ...l, anciennes: [cle, ...(l.anciennes ?? [])] });
  return true;
}

// Ouvre un objet scellé avec la clé de son id (en vigueur, en cours ou ancienne) ; null si ce navigateur ne l'a pas.
export async function ouvrirScelle(scelle) {
  const cle = cleDe(scelle?.id);
  return cle ? C.ouvrir(scelle, cle) : null;
}
// L'id d'une clé que le trousseau connaît (son empreinte est publiée) : récupérable par les parts.
export const idConnu = id => Boolean(metaPour(id));

// ------------------------------------------------------------------ la file du MJ
export function enFile(fn) {
  const suite = file.then(async () => {
    await ouvrirDansFile();
    return fn();
  });
  file = suite.catch(() => null);
  return suite;
}

// Le contenu du coffre du Carnet ouvert dans ce navigateur, s'il est celui du réglage ; null sinon.
function contenuOuvert() {
  const donnees = lireCoffre().donnees;
  return donnees ? ouverts.find(o => o.donnees === donnees)?.contenu ?? null : null;
}

// La liste complète d'un registre : chez un MJ qui a ouvert le coffre, le clair complété du coffre (sans ce qui en a été
// retiré) ; ailleurs, le clair seul.
export function lireRegistre(registre) {
  const contenu = game.user?.isGM ? contenuOuvert() : null;
  return S.fusionnerListes(registre, lireClair(registre), contenu?.[registre] ?? null, contenu?.retires?.[registre] ?? []);
}

// Les ids dont ce navigateur a besoin et qu'il n'a pas : la clé en vigueur, celle qui scelle le coffre, celles des fichiers.
const idsManquants = () => [...new Set([lireTrousseau().id, lireCoffre().id, ...idsVus])].filter(id => id && !cleDe(id));

// Ce que sait ce navigateur : { etat, … } avec etat "joueur", "vide" (rien au coffre), "ouvert", "ouverture" (clé là,
// déchiffrement en cours), "attente" (MJ actif à qui manque une clé : { parts, seuil, joueurs }) ou "ferme" (un autre MJ).
// porteurs / seuil : les parts accusées de la clé en vigueur ; renouvellement : celles de la clé en cours.
export function etatCoffre() {
  if (!game.user?.isGM) return { etat: "joueur" };
  const t = lireTrousseau();
  const commun = { porteurs: (t.porteurs ?? []).length, seuil: t.seuil ?? 2, comptes: comptesJoueurs().length,
    renouvellement: t.enCours ? { porteurs: (t.enCours.porteurs ?? []).length, seuil: t.enCours.seuil } : null };
  const manquants = idsManquants();
  if (manquants.length) {
    const recu = Math.max(0, ...manquants.map(id => recues.get(id)?.size ?? 0));
    return estMJActif() ? { ...commun, etat: "attente", parts: recu, joueurs: joueursConnectes().length } : { ...commun, etat: "ferme" };
  }
  const coffre = lireCoffre();
  if (!coffre.donnees) return { ...commun, etat: "vide" };
  return { ...commun, etat: contenuOuvert() ? "ouvert" : "ouverture" };
}
// Trop peu de porteurs pour retrouver la clé par les parts : la clé de secours est le seul recours.
export const secoursConseille = () => {
  const t = lireTrousseau();
  return Boolean(t.id) && ((t.porteurs ?? []).length < (t.seuil ?? 2) || comptesJoueurs().length <= 2);
};

// ------------------------------------------------------------------ le rappel de la clé de secours (chez le MJ actif)
// La clé de secours de la clé en vigueur a-t-elle été téléchargée (ou réimportée) depuis ce navigateur ? -> la date ISO, ou "".
export const secoursExportee = () => {
  const t = lireTrousseau();
  return (t.empreinte && objet(local().secours)[t.empreinte]) || "";
};
// La fenêtre « Télécharge ta clé de secours maintenant » (apps/coffre.js) : fn() rend une promesse ; elle appelle elle-même
// exporterSecours() si le MJ le veut. Sans fenêtre branchée (essais), le rappel est une notification.
export const brancherRappel = fn => { fenetreRappel = typeof fn === "function" ? fn : null; };
// Note ces clés comme sauvegardées sur disque (téléchargées, ou réimportées d'un fichier daté de `date`).
async function noterSecours(cles, date = new Date().toISOString()) {
  const empreintes = await Promise.all(cles.filter(valide).map(c => C.empreinte(c)));
  if (!empreintes.length) return;
  const l = local();
  const anciennes = objet(l.secours);
  // La date la plus récente l'emporte : réimporter un vieux fichier de secours ne fait pas reculer « téléchargée le ».
  const plusRecente = e => (anciennes[e] && anciennes[e] > date ? anciennes[e] : date);
  await ecrireLocal({ ...l, secours: { ...anciennes, ...Object.fromEntries(empreintes.map(e => [e, plusRecente(e)])) } });
}
// Une clé vient d'être créée ou d'entrer en vigueur (fenetre : la fenêtre, tout de suite), ou le monde se charge avec elle (une
// notification permanente) : si sa clé de secours n'a jamais été téléchargée d'ici, le MJ actif est rappelé à l'ordre, une fois
// par clé et par chargement. -> true si un rappel est fait.
function rappelerSecours(fenetre = false) {
  const t = lireTrousseau();
  if (!estMJActif() || !t.empreinte || !cleCourante() || rappeles.has(t.empreinte) || secoursExportee()) return false;
  rappeles.add(t.empreinte);
  if (fenetre && fenetreRappel) {
    // Hors de la file (on y est) : la fenêtre, et son export, viennent après.
    Promise.resolve().then(fenetreRappel).catch(e => console.error(`${ID} | coffre (rappel de la clé de secours)`, e));
  } else {
    avertir("warn", "SecoursRappel", {}, "", { permanent: true });
  }
  return true;
}

// Dans la file : ouvre le coffre du Carnet si ce navigateur (d'un MJ) a sa clé ; le MJ actif à qui manque une clé demande
// ses parts aux joueurs connectés et la clé aux autres MJ (une fois par id). -> { coffreFerme, cleAbsente }.
async function ouvrirDansFile() {
  if (!game.user?.isGM) return { coffreFerme: Boolean(lireCoffre().donnees), cleAbsente: true };
  const coffre = lireCoffre();
  if (coffre.donnees && !contenuOuvert()) {
    const cle = cleDe(coffre.id);
    const contenu = cle ? await C.ouvrir(coffre, cle) : null;
    if (contenu && lireCoffre().donnees === coffre.donnees) retenir(coffre.donnees, contenu);
  }
  if (estMJActif()) {
    const nouveaux = idsManquants().filter(id => !demandes.has(id));
    if (nouveaux.length) demanderParts(nouveaux);
  }
  return { coffreFerme: Boolean(lireCoffre().donnees && !contenuOuvert()), cleAbsente: cleAbsente() };
}

function demanderParts(ids) {
  for (const id of ids) demandes.add(id);
  const joueurs = joueursConnectes();
  if (joueurs.length) emettre({ type: "coffre.rendrePart", ids }, joueurs);
  const mjs = autresMJConnectes();
  if (mjs.length) emettre({ type: "coffre.demandeCle", ids }, mjs);
  const m = metaPour(ids[0]);
  avertir("warn", "Attente", { joueurs: joueurs.length, seuil: m?.seuil ?? 2 }, `attente:${ids.join(",")}`);
  rafraichir();
}

// ------------------------------------------------------------------ la clé (dans la file, chez le MJ actif)
// Le seuil d'une clé neuve : la majorité des porteurs probables (ceux qui ont accusé une part de la clé en vigueur, et les
// joueurs connectés, parmi les comptes qui existent encore), jamais moins de 2.
function seuilNeuf() {
  const comptes = new Set(comptesJoueurs());
  const porteurs = new Set([...(lireTrousseau().porteurs ?? []), ...joueursConnectes()].filter(id => comptes.has(id)));
  return C.seuilPour(porteurs.size);
}

// La toute première clé d'un monde (rien n'est encore scellé) : en vigueur aussitôt ; seul le MJ actif la crée.
async function premiereCle() {
  if (!estMJActif() || lireTrousseau().id) return null;
  const cle = C.nouvelleCle({ seuil: seuilNeuf() });
  await ecrireLocal({ ...local(), courante: cle });
  await game.settings.set(ID, "trousseau", { ...(await meta(cle)), porteurs: [], enCours: null, anciennes: [] });
  for (const u of joueursConnectes()) envoyerParts(u);
  rappelerSecours(true);
  return cle;
}
// La clé en vigueur ; monde neuf : la première ; null si ce navigateur attend les parts.
async function assurerCle() {
  if (!lireTrousseau().id) return premiereCle();
  return cleCourante();
}

// Scelle un objet avec la clé en vigueur (dans la file : fils.js). null si elle est absente (rien n'est écrit).
export async function scellerCourant(contenu) {
  if (!estMJActif()) return null;
  const cle = await assurerCle();
  return cle ? C.sceller(contenu, cle) : null;
}
// Scelle avec une clé donnée (rescellement à la validation d'un renouvellement).
export const scellerAvec = (contenu, cle) => C.sceller(contenu, cle);

// ------------------------------------------------------------------ le Carnet (dans la file, chez le MJ actif)
async function ecrireClair(registre, projection) {
  if (!S.egaux(lireClair(registre), projection)) await game.settings.set(ID, registre, projection);
}

// Écrit les trois registres (contenu : listes complètes et retraits). Coffre d'abord, clair ensuite, toujours : une écriture
// interrompue entre les deux ne fait ni disparaître un élément (il est au coffre) ni revenir un élément retiré (le coffre garde
// la liste des retraits). Sans clé et sans secret, le clair seul (il n'y a rien au coffre).
async function ecrireTout(contenu) {
  const cle = await assurerCle();
  if (cle) {
    const scelle = await C.sceller(contenu, cle);
    retenir(scelle.donnees, structuredClone(contenu));
    await game.settings.set(ID, "coffreCarnet", scelle);
  } else if (S.contientSecret(contenu) || lireCoffre().donnees) {
    throw new Error(texteRefus("ranger un secret au coffre"));
  }
  for (const r of S.REGISTRES) await ecrireClair(r, S.projeter(r, contenu[r]));
}
const contenuActuel = () => ({ ...Object.fromEntries(S.REGISTRES.map(r => [r, lireRegistre(r)])), retires: structuredClone(contenuOuvert()?.retires ?? {}) });

export const texteRefus = quoi => `Coffre fermé dans ce navigateur : impossible de ${quoi} tant que la clé n'est pas revenue (parts des `
  + "joueurs, autre MJ ou clé de secours ; les éléments visibles restent utilisables). Rien n'a été écrit.";

// Écrit la liste complète d'un registre (dans enFile, chez le MJ actif). Coffre fermé : le clair seul, et seulement ce qui ne
// touche à rien de secret (sinon une erreur, rien n'est écrit).
export async function ecrireRegistre(registre, liste) {
  const { coffreFerme } = await ouvrirDansFile();
  const avant = lireRegistre(registre);
  if (coffreFerme) {
    const refus = S.refusSansCoffre(registre, avant, liste);
    if (refus) throw new Error(texteRefus(refus));
    await ecrireClair(registre, S.projeter(registre, liste));
    return;
  }
  const contenu = contenuActuel();
  contenu[registre] = liste;
  contenu.retires = S.noterRetraits(contenu.retires, registre, avant, liste);
  await ecrireTout(contenu);
}

// Ce qui est encore en clair sans devoir l'être (versions précédentes) passe au coffre et quitte le clair. Dans la file.
async function migrerCarnet() {
  if (!estMJActif() || !disponible() || lireCoffre().donnees && !contenuOuvert() || !cleCourante()) return false;
  const contenu = contenuActuel();
  if (S.REGISTRES.every(r => S.egaux(lireClair(r), S.projeter(r, contenu[r])))) return false;
  await ecrireTout(contenu);
  return true;
}
export const migrer = () => enFile(migrerCarnet);

// La clé est là (démarrage, réouverture) : le Carnet et les fils d'avant passent au coffre ; un renouvellement interrompu
// reprend ; chacun a ses parts.
async function cleRetrouvee() {
  if (cleAbsente()) return;
  await migrerCarnet();
  for (const fn of quandDisponible) {
    try { await fn(); } catch (e) { console.error(`${ID} | coffre`, e); }
  }
  await reprendreRenouvellement();
  for (const u of joueursConnectes()) envoyerParts(u);
  // Trop peu de porteurs probables (ceux qui ont accusé, et les connectés qui viennent de recevoir leur part), ou une table d'un
  // ou deux joueurs : la clé de secours est conseillée, une fois par clé.
  const t = lireTrousseau();
  const probables = new Set([...(t.porteurs ?? []), ...joueursConnectes()]).size;
  if (probables < (t.seuil ?? 2) || comptesJoueurs().length <= 2) {
    avertir("warn", "SecoursConseille", { porteurs: probables, seuil: t.seuil ?? 2 }, `secours:${t.id}`);
  }
  // Et, dans tous les mondes : la clé est là mais sa clé de secours n'a jamais été téléchargée d'ici.
  rappelerSecours(false);
}

// Remise à zéro de la campagne (reinitialiser.js) : les trois registres et leur coffre, dans la file. La clé reste.
export function viderCarnet() {
  return enFile(async () => {
    for (const r of S.REGISTRES) await game.settings.set(ID, r, []);
    ouverts = [];
    if (lireCoffre().donnees) await game.settings.set(ID, "coffreCarnet", {});
  });
}

// ------------------------------------------------------------------ renouvellement (dans la file, chez le MJ actif)
// Commence (ou, s'il y en a un, reprend) un renouvellement. force : un compte supprimé ou qui a changé de rôle ; la clé en
// cours, peut-être donnée à ce compte, est remplacée. -> { etat: "fait" | "attente" | "impossible", porteurs, seuil }.
async function renouvelerDansFile({ force = false } = {}) {
  if (!estMJActif() || cleAbsente() || lireCoffre().donnees && !contenuOuvert()) return { etat: "impossible" };
  const t = lireTrousseau();
  const l = local();
  if (!t.id) return { etat: (await premiereCle()) ? "fait" : "impossible" };
  if (!t.enCours || force || !l.enAttente?.cle || l.enAttente.cle.id !== t.enCours.id) {
    const cle = C.nouvelleCle({ seuil: seuilNeuf() });
    // Une clé en cours remplacée reste connue (son empreinte au trousseau, la clé ici) : elle a pu sceller quelque chose.
    const anciennes = t.enCours ? [{ id: t.enCours.id, seuil: t.enCours.seuil, empreinte: t.enCours.empreinte }, ...(t.anciennes ?? [])] : t.anciennes ?? [];
    await ecrireLocal({ ...l, enAttente: { cle, secours: false }, anciennes: [l.enAttente?.cle, ...(l.anciennes ?? [])] });
    await game.settings.set(ID, "trousseau", { ...t, enCours: { ...(await meta(cle)), porteurs: [] }, anciennes: anciennes.slice(0, MAX_ANCIENNES) });
  }
  return reprendreRenouvellement();
}
export const renouveler = (options = {}) => enFile(() => renouvelerDansFile(options));

// Le renouvellement en cours : ses parts renvoyées aux joueurs connectés ; validé s'il a assez d'accusés (ou sa clé de secours).
async function reprendreRenouvellement() {
  const t = lireTrousseau();
  const p = local().enAttente;
  if (!t.enCours) return { etat: "fait" };
  if (!p?.cle || p.cle.id !== t.enCours.id) return { etat: "attente", porteurs: (t.enCours.porteurs ?? []).length, seuil: t.enCours.seuil };
  if ((t.enCours.porteurs ?? []).length >= t.enCours.seuil || p.secours) return validerRenouvellement();
  for (const u of joueursConnectes()) envoyerParts(u);
  // Parts distribuées n / seuil t (les accusés suivent ; la fenêtre du coffre les compte).
  const distribuees = new Set([...(t.enCours.porteurs ?? []), ...joueursConnectes()]).size;
  avertir("info", "RenouvellementAttente", { porteurs: distribuees, seuil: t.enCours.seuil }, `renouv:${t.enCours.id}:${distribuees}`);
  rafraichir();
  return { etat: "attente", porteurs: (t.enCours.porteurs ?? []).length, seuil: t.enCours.seuil };
}

// La nouvelle clé a assez de porteurs : coffre rescellé, fichiers rescellés, PUIS le trousseau publié. Une coupure avant la fin
// laisse l'ancienne clé en vigueur ; ce qui a déjà été rescellé l'est sous une clé dont les parts sont accusées.
async function validerRenouvellement() {
  const t = lireTrousseau();
  const l = local();
  const cle = l.enAttente?.cle;
  if (!cle || cle.id !== t.enCours?.id || lireCoffre().donnees && !contenuOuvert()) return { etat: "attente" };
  try {
    if (lireCoffre().donnees) {
      const contenu = contenuActuel();
      const scelle = await C.sceller(contenu, cle);
      retenir(scelle.donnees, structuredClone(contenu));
      await game.settings.set(ID, "coffreCarnet", scelle);
    }
    for (const fn of quandRenouvele) await fn(cle);
  } catch (e) {
    console.error(`${ID} | coffre (renouvellement interrompu, l'ancienne clé reste en vigueur)`, e);
    return { etat: "attente", porteurs: (t.enCours.porteurs ?? []).length, seuil: t.enCours.seuil };
  }
  await game.settings.set(ID, "trousseau", {
    id: cle.id, seuil: cle.seuil, empreinte: t.enCours.empreinte, porteurs: t.enCours.porteurs ?? [], enCours: null,
    anciennes: [{ id: t.id, seuil: t.seuil, empreinte: t.empreinte }, ...(t.anciennes ?? [])].filter(m => m.id !== cle.id).slice(0, MAX_ANCIENNES)
  });
  await ecrireLocal({ courante: cle, enAttente: null, anciennes: [l.courante, ...(l.anciennes ?? [])] });
  avertir("info", "Renouvelee", { seuil: cle.seuil });
  rappelerSecours(true);
  rafraichir();
  return { etat: "fait", porteurs: (t.enCours.porteurs ?? []).length, seuil: cle.seuil };
}

// Les parts sont perdues et il n'y a pas de clé de secours : le MJ renonce, explicitement, aux éléments cachés du Carnet et aux
// fils chiffrés. Les éléments visibles restent ; une nouvelle clé, de nouvelles parts.
export function abandonnerCoffre({ confirmer = false } = {}) {
  if (!confirmer) return Promise.reject(new Error("abandonner le coffre efface les éléments cachés : appelle abandonner({ confirmer: true })"));
  return enFile(async () => {
    if (!estMJActif()) return false;
    demandes = new Set();
    recues = new Map();
    idsVus = new Set();
    ouverts = [];
    await game.settings.set(ID, "coffreCarnet", {});
    await game.settings.set(ID, "trousseau", {});
    await premiereCle();
    rafraichir();
    return true;
  });
}

// ------------------------------------------------------------------ les parts
// Les parts d'un joueur (clé en vigueur, et clé en cours s'il y en a une), à lui seul.
function envoyerParts(userId) {
  const u = game.users.get(userId);
  if (!u || u.isGM || !estMJActif()) return 0;
  const t = lireTrousseau();
  let n = 0;
  for (const cle of [cleCourante(), t.enCours ? cleDe(t.enCours.id) : null]) {
    if (!cle) continue;
    emettre({ type: "coffre.part", ...C.partDe(cle, userId) }, [userId]);
    n++;
  }
  return n;
}

// Un joueur se connecte ou recharge (« coffre.bonjour ») : il reçoit ses parts ; si ce MJ attend des parts, on lui demande les siennes.
export function joueurArrive(_message, userId) {
  if (!estMJActif() || !userId || !game.users.get(userId) || game.users.get(userId).isGM) return false;
  const attendus = [...demandes].filter(id => !cleDe(id));
  if (attendus.length) emettre({ type: "coffre.rendrePart", ids: attendus }, [userId]);
  return envoyerParts(userId) > 0;
}

// Un joueur a gardé sa part (« coffre.accuse ») : il devient porteur de cette clé (trousseau) ; assez de porteurs pour la clé
// en cours : le renouvellement est validé.
export function recevoirAccuse({ id } = {}, userId) {
  return enFile(async () => {
    if (!estMJActif() || !userId || !game.users.get(userId) || game.users.get(userId).isGM) return false;
    await noterPorteur(id, userId);
    const t = lireTrousseau();
    if (t.enCours?.id === id && (t.enCours.porteurs ?? []).length >= t.enCours.seuil) await reprendreRenouvellement();
    rafraichir();
    return true;
  });
}
async function noterPorteur(id, userId) {
  const t = lireTrousseau();
  if (t.id === id && !(t.porteurs ?? []).includes(userId)) {
    await game.settings.set(ID, "trousseau", { ...t, porteurs: [...(t.porteurs ?? []), userId] });
  } else if (t.enCours?.id === id && !(t.enCours.porteurs ?? []).includes(userId)) {
    await game.settings.set(ID, "trousseau", { ...t, enCours: { ...t.enCours, porteurs: [...(t.enCours.porteurs ?? []), userId] } });
  }
}

// La part rendue par un joueur (userId : l'émetteur réel). Dès que `seuil` parts donnent la clé (empreinte vérifiée), elle revient.
export function recevoirPartRendue({ id, x, y } = {}, userId) {
  return enFile(async () => {
    if (!estMJActif() || !demandes.has(id) || cleDe(id) || !userId || !game.users.get(userId) || game.users.get(userId).isGM) return false;
    if (C.abscisse(userId).toString(16) !== String(x)) return false;   // la part d'un autre joueur
    const m = metaPour(id);
    if (!m) return false;
    const parts = recues.get(id) ?? new Map();
    parts.set(userId, { id, seuil: m.seuil, x: String(x), y: String(y ?? "") });
    recues.set(id, parts);
    await noterPorteur(id, userId);
    const cle = await C.cleDesParts([...parts.values()], m.empreinte, m.seuil);
    if (cle) await cleRevenue(cle);
    rafraichir();
    return true;
  });
}

// Une clé revient (parts, autre MJ, secours) : rangée ; quand plus rien ne manque, tout se rouvre.
async function cleRevenue(cle) {
  const m = metaPour(cle.id);
  if (m && (await C.empreinte(cle)) !== m.empreinte) return false;
  if (!(await ajouterCle(cle))) return false;
  recues.delete(cle.id);
  await ouvrirDansFile();
  if (!idsManquants().length) {
    avertir("info", "Rouvert");
    await cleRetrouvee();
    Hooks.callAll?.(`${ID}.coffreRouvert`);
  }
  return true;
}

// Chez le MJ actif : les clés données par un autre MJ connecté (« coffre.cle », à lui seul ; émetteur MJ vérifié par le serveur).
export function recevoirCles({ cles } = {}, emetteur) {
  return enFile(async () => {
    if (!estMJActif() || !emetteur || emetteur === game.user.id || !game.users.get(emetteur)?.isGM || !Array.isArray(cles)) return false;
    let n = 0;
    for (const cle of cles) if (metaPour(cle?.id) && await cleRevenue(cle)) n++;
    rafraichir();
    return n > 0;
  });
}
// Chez un autre MJ : le MJ actif (émetteur vérifié) demande des clés ; celles que ce navigateur a lui sont données, à lui seul.
export function donnerCles({ ids } = {}, emetteur) {
  if (!game.user?.isGM || !emetteur || emetteur !== game.users.activeGM?.id || emetteur === game.user.id || !Array.isArray(ids)) return false;
  const cles = ids.map(cleDe).filter(Boolean);
  if (!cles.length) return false;
  emettre({ type: "coffre.cle", cles }, [emetteur]);
  return true;
}

// Chez un joueur : sa part, envoyée par le MJ ACTIF (le canal n'accepte « coffre.part » que d'un MJ ; ici, l'actif seul). Gardée
// avec les précédentes (par id de clé), puis accusée.
export async function recevoirPart({ id, seuil, x, y } = {}, emetteur) {
  if (game.user.isGM || !id || !x || !y || !emetteur || emetteur !== game.users.activeGM?.id) return false;
  const tout = objet(lireReglage("partCarnet"));
  const parMonde = objet(tout[monde()]);
  const miennes = objet(parMonde[game.user.id]);
  const part = { id, seuil: Number(seuil) || 2, x: String(x), y: String(y), recue: Date.now() };
  if (!S.egaux({ ...miennes[id], recue: 0 }, { ...part, recue: 0 })) {
    const gardees = Object.fromEntries([...Object.entries(miennes).filter(([k]) => k !== id), [id, part]]
      // À heure égale (même milliseconde), la part qui arrive passe devant : elle n'est jamais celle qu'on écarte.
      .sort((a, b) => (b[1].recue ?? 0) - (a[1].recue ?? 0) || (a[0] === id ? -1 : b[0] === id ? 1 : 0)).slice(0, MAX_PARTS_GARDEES));
    await game.settings.set(ID, "partCarnet", { ...tout, [monde()]: { ...parMonde, [game.user.id]: gardees } });
  }
  emettre({ type: "coffre.accuse", id }, [emetteur]);
  return true;
}

// Chez un joueur : le MJ ACTIF (emetteur : l'identifiant donné par le serveur) demande ses parts de ces clés.
export function rendrePart({ ids, id } = {}, emetteur) {
  if (game.user.isGM || !emetteur || emetteur !== game.users.activeGM?.id) return false;
  const miennes = objet(objet(objet(lireReglage("partCarnet"))[monde()])[game.user.id]);
  let n = 0;
  for (const voulu of Array.isArray(ids) ? ids : [id]) {
    const p = miennes[voulu];
    if (!p?.id) continue;
    emettre({ type: "coffre.partRendue", id: p.id, x: p.x, y: p.y }, [emetteur]);
    n++;
  }
  return n > 0;
}

// ------------------------------------------------------------------ la clé de secours (jamais par le monde, le chat, Data ni le socket)
// Le fichier que le MJ garde : toutes les clés que ce navigateur connaît pour ce monde. -> { nom, texte } ; téléchargé si Foundry
// le permet (foundry.utils.saveDataToFile). Une clé en cours ainsi sauvegardée peut entrer en vigueur sans attendre les accusés.
export function exporterSecours() {
  return enFile(async () => {
    if (!game.user?.isGM) throw new Error("seul un MJ garde la clé de secours");
    const cles = mesCles();
    if (!cles.length) throw new Error("ce navigateur n'a pas la clé du coffre");
    // Une seule heure pour le fichier, son nom et la date notée « téléchargée le » (deux lectures de l'horloge pouvaient différer
    // d'une milliseconde : la date notée n'était alors plus celle du fichier, qu'une réimportation reprend).
    const cree = new Date().toISOString();
    const texte = JSON.stringify({ type: TYPE_SECOURS, version: 1, monde: monde(), cree, cles }, null, 1);
    const nom = `cle-de-secours-${monde()}-${cree.slice(0, 10)}.json`;
    globalThis.foundry?.utils?.saveDataToFile?.(texte, "application/json", nom);
    await noterSecours(cles, cree);
    const l = local();
    if (l.enAttente?.cle) await ecrireLocal({ ...l, enAttente: { ...l.enAttente, secours: true } });
    if (estMJActif()) await reprendreRenouvellement();
    return { nom, texte };
  });
}

// Réimporte une clé de secours (File, Blob, texte ou objet) dans ce navigateur. -> le nombre de clés reconnues (empreinte du
// trousseau vérifiée). Une clé inconnue du trousseau est ignorée. Les clés reconnues sont sur disque : notées comme
// téléchargées, à la date du fichier (plus de rappel pour elles).
export async function importerSecours(source) {
  const texte = typeof source === "string" ? source : typeof source?.text === "function" ? await source.text() : JSON.stringify(source ?? {});
  let donnees;
  try { donnees = JSON.parse(texte); } catch { throw new Error("fichier de secours illisible"); }
  if (donnees?.type !== TYPE_SECOURS || !Array.isArray(donnees.cles)) throw new Error("ce n'est pas une clé de secours du MJ IA");
  if (donnees.monde !== monde()) throw new Error(`clé de secours d'un autre monde (${donnees.monde})`);
  return enFile(async () => {
    if (!game.user?.isGM) return 0;
    const connues = [];
    for (const cle of donnees.cles) {
      const m = metaPour(cle?.id);
      if (m && valide(cle) && (await C.empreinte(cle)) === m.empreinte) connues.push(cle);
    }
    const creee = new Date(donnees.cree ?? NaN);
    await noterSecours(connues, Number.isNaN(creee.getTime()) ? new Date().toISOString() : creee.toISOString());
    let n = 0;
    for (const cle of connues) if (await cleRevenue(cle)) n++;
    rafraichir();
    return n;
  });
}

// ------------------------------------------------------------------ pour un autre module (le système des Veillées, lakour-loups)
// Les secrets d'une partie des Veillées sont scellés avec la même clé (api.coffre.sceller / ouvrirScelle / siRenouvele /
// siDisponible ; contrat : lakour-veillees/docs/loups-contrat.md §6). Le module garde son objet scellé où il veut (réglage monde) ;
// le moteur lui donne la clé en vigueur, ses parts, son renouvellement et sa reprise.
// Scelle un contenu avec la clé en vigueur, dans la file : null si ce navigateur n'est pas le MJ actif ou n'a pas la clé.
export const scellerPourAutre = contenu => enFile(() => scellerCourant(contenu));
// La passation : un MJ qui vient de perdre la main (un autre MJ est devenu actif) scelle une dernière fois ce qu'il sait, avec la
// clé en vigueur s'il l'a (jamais une clé neuve : seul le MJ actif en crée). null sinon.
export const scellerEnPartant = contenu => enFile(async () => {
  if (!game.user?.isGM) return null;
  const cle = cleCourante();
  return cle ? C.sceller(contenu, cle) : null;
});

// Ouvre un objet scellé (clé en vigueur, en cours ou ancienne), dans la file ; null si ce navigateur n'a pas sa clé : si le
// trousseau la connaît, ses parts sont demandées (MJ actif) et le hook « lakour-mj-ia.coffreRouvert » dira quand elle revient.
export function ouvrirPourAutre(scelle) {
  return enFile(async () => {
    if (!game.user?.isGM || !C.estScelle(scelle)) return null;
    const contenu = await ouvrirScelle(scelle);
    if (contenu !== null) return contenu;
    if (estMJActif() && idConnu(scelle.id) && !demandes.has(scelle.id)) {
      signalerId(scelle.id);
      enFile(() => null).catch(() => null);   // le passage suivant dans la file demande les parts de cette clé
    }
    return null;
  });
}

// ------------------------------------------------------------------ au chargement
// Chez un MJ : ouvrir le coffre (MJ actif sans une clé : demander les parts ; monde neuf : créer la clé), ranger ce qui traîne en
// clair, reprendre un renouvellement, donner ses parts à chaque joueur déjà là. Rend l'état du coffre.
export function demarrerCoffre() {
  return enFile(async () => {
    if (!game.user?.isGM) return "";
    etaisActif = estMJActif();
    if (estMJActif() && !cleAbsente()) {
      await assurerCle();
      await cleRetrouvee();
    }
    rafraichir();
    return etatCoffre().etat;
  });
}

// api.coffre.chercher() : rouvrir, ou redemander VRAIMENT les parts (des réponses ont pu se perdre).
export function chercherCoffre() {
  demandes = new Set();
  recues = new Map();
  return demarrerCoffre();
}

// Le coffre a changé (réglage « coffreCarnet ») : un MJ qui a la clé le rouvre, et sa fenêtre suit.
export function coffreChange() {
  if (!game.user?.isGM) return;
  enFile(() => rafraichir()).catch(e => console.warn(`${ID} | coffre`, e));
}

// Les messages du coffre sur le canal du module (canal.js : sans émetteur donné par le serveur, tout « coffre.* » est ignoré ;
// « coffre.part », « coffre.rendrePart » et « coffre.demandeCle » ne sont acceptés que d'un MJ ; « coffre.bonjour »,
// « coffre.partRendue », « coffre.accuse » et « coffre.cle » ne sont traités que chez le MJ actif).
export function ecouterCoffre() {
  recevoir("coffre.part", (message, emetteur) => recevoirPart(message, emetteur));
  recevoir("coffre.rendrePart", (message, emetteur) => rendrePart(message, emetteur));
  recevoir("coffre.demandeCle", (message, emetteur) => donnerCles(message, emetteur));
  recevoir("coffre.bonjour", joueurArrive, { pourMJ: true });
  recevoir("coffre.partRendue", recevoirPartRendue, { pourMJ: true });
  recevoir("coffre.accuse", recevoirAccuse, { pourMJ: true });
  recevoir("coffre.cle", recevoirCles, { pourMJ: true });
  ecouterCanal();
}

// Au « ready » (main.js), dans tous les mondes.
export function brancherCoffre() {
  ecouterCoffre();
  if (!game.user.isGM) {
    versMJ({ type: "coffre.bonjour" });
    return;
  }
  demarrerCoffre().catch(e => console.error(`${ID} | coffre`, e));
  // Ce navigateur devient MJ actif (un autre MJ part) : il ouvre le coffre ou redemande les parts.
  Hooks.on("userConnected", () => {
    if (estMJActif() && !etaisActif) chercherCoffre().catch(() => null);
    etaisActif = estMJActif();
  });
  // Un compte supprimé ou qui change de rôle : ses parts doivent cesser de servir (la clé en cours est remplacée) ; un compte
  // créé : la majorité change.
  const renouvelerSiActif = force => { if (estMJActif()) renouveler({ force }).catch(e => console.error(`${ID} | coffre`, e)); };
  Hooks.on("deleteUser", () => renouvelerSiActif(true));
  Hooks.on("createUser", () => renouvelerSiActif(false));
  Hooks.on("updateUser", (_u, changements) => { if (changements && "role" in changements) renouvelerSiActif(true); });
}
