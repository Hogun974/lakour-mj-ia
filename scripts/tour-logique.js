// Tour par tour (docs/tour-par-tour.md) : la logique PURE, sans Foundry, éprouvée en Node (essais/tour-par-tour.test.mjs).
// Un seul mécanisme pour Imperium Maledictum et D&D 5e : ce qui change d'un système à l'autre (économie d'actions, défense,
// attaques, jets, lecture des messages) vient des adaptateurs (adaptateurs.js, partie « tour ») et arrive ici déjà mis à plat.
// Le branchement sur Foundry (combat, jetons, chat, boutons) est dans tour-par-tour.js ; le panneau dans apps/tour-par-tour.js.
//
// etapeSuivanteCombat(etat) -> { cle, action, donnees, attente, detail }, comme etapeSuivante des Veillées :
//   cle : ajouter | initiative | commencer | victoire | defaite | sauvegarde | finEffet | rappel | appliquer | degats | toucher
//         | defense | jetMort | aTerre | compagnon | attenteJoueur | pnjIA | cible | attaquer | suivant | round
//   action : le data-action du bouton du panneau qui fait l'étape ("" = rien à presser, on attend quelqu'un) ;
//   donnees : { nom, cible, n, round… } pour le libellé (LAKOUR_MJIA.Tour.Etapes.<cle>) ;
//   attente : true quand on attend un joueur (ou un compagnon qui agit) plutôt qu'un clic du MJ.
//
// L'état mis à plat :
//   { combat: null | { commence, round, actif: id, combattants: [combattant…] (dans l'ordre du tour) },
//     candidats: [{ id, nom, camp }] (jetons de la scène pas encore au combat),
//     suivi: { depenses, reactions, cible, attaque: { phase, nom, cibleId, cibleNom, degats }, obligations: [..],
//              proposition, compagnonEnCours },
//     economie: [{ cle, libelle, n }] (adaptateur), seanceIA, iaJouePnj }
//   combattant : { id, nom, camp: joueur | compagnon | allie | ennemi | neutre, initiative, aTerre, mort,
//                  jetsMort: { succes, echecs } | null, pv, pvMax, cases: { x, y, l, h } }

// ------------------------------------------------------------------ camps
export const NOUS = ["joueur", "compagnon", "allie"];
export const camp = c => (NOUS.includes(c?.camp) ? "nous" : c?.camp === "ennemi" ? "eux" : "neutre");
export const horsCombat = c => Boolean(c?.aTerre || c?.mort);
// Les adversaires d'un combattant : les ennemis pour « nous », « nous » pour un ennemi (un neutre n'attaque personne).
export function adversairesDe(acteur, tous) {
  const moi = camp(acteur);
  if (moi === "neutre") return [];
  return tous.filter(c => c.id !== acteur.id && camp(c) !== "neutre" && camp(c) !== moi);
}

// ------------------------------------------------------------------ distances
// Règles de diagonales de Foundry (CONST.GRID_DIAGONALS) : 0 équidistant, 1 exact, 2 approché (1,5), 3 rectiligne,
// 4 alternance 1-2-1, 5 alternance 2-1-2, 6 interdit.
export function coutDiagonales(dx, dy, regle = 0) {
  const grand = Math.max(Math.abs(dx), Math.abs(dy)), petit = Math.min(Math.abs(dx), Math.abs(dy));
  switch (regle) {
    case 1: return grand - petit + petit * Math.SQRT2;
    case 2: return grand - petit + petit * 1.5;
    case 3: case 6: return grand + petit;
    case 4: return grand + Math.floor(petit / 2);
    case 5: return grand + Math.ceil(petit / 2);
    default: return grand;
  }
}

// Écart en cases entre deux jetons (de bord à bord, comme l'allonge) : deux voisins sont à 1 case, un jeton de lui-même à 0.
// cases : { x, y } case en haut à gauche, { l, h } taille en cases.
export function ecartCases(a, b) {
  const al = a.l ?? 1, ah = a.h ?? 1, bl = b.l ?? 1, bh = b.h ?? 1;
  const dx = Math.max(0, b.x - (a.x + al - 1), a.x - (b.x + bl - 1));
  const dy = Math.max(0, b.y - (a.y + ah - 1), a.y - (b.y + bh - 1));
  return { dx, dy };
}

// Mètres par unité de scène. D&D 5e : 5 pieds = 1,5 m (CONFIG.DND5E.movementUnits.m.conversion = 10/3).
export const METRES_PAR_UNITE = { m: 1, ft: 0.3, pi: 0.3, km: 1000, mi: 1584 };
export function versMetres(valeur, unites = "m") {
  const k = METRES_PAR_UNITE[String(unites ?? "m").trim().toLowerCase()] ?? 1;
  return Math.round(Number(valeur || 0) * k * 100) / 100;
}

// grille : { distance (unités par case), unites, diagonales }. -> mètres (arrondis au centimètre).
export function distanceMetres(a, b, grille = {}) {
  const { dx, dy } = ecartCases(a, b);
  return versMetres(coutDiagonales(dx, dy, grille.diagonales ?? 0) * (grille.distance ?? 1), grille.unites ?? "m");
}

export const metresParCase = (grille = {}) => versMetres(grille.distance ?? 1, grille.unites ?? "m");

// ------------------------------------------------------------------ actions restantes
// economie : [{ cle, libelle, n }] (adaptateur) ; depenses : { cle: n } ce tour ; mouvement : { max, utilise } en mètres
// (max null : le système ne mesure pas le mouvement en mètres, on ne montre que la ressource « déplacement »).
export function actionsRestantes(economie = [], depenses = {}, mouvement = null) {
  const lignes = economie.map(r => {
    const max = Math.max(0, Number(r.n ?? 1));
    return { cle: r.cle, libelle: r.libelle ?? r.cle, max, reste: Math.max(0, max - Number(depenses?.[r.cle] ?? 0)) };
  });
  let m = null;
  if (mouvement && Number.isFinite(Number(mouvement.max)) && mouvement.max !== null) {
    const max = Math.round(Number(mouvement.max) * 10) / 10;
    const utilise = Math.round(Math.max(0, Number(mouvement.utilise ?? 0)) * 10) / 10;
    m = { max, utilise, reste: Math.max(0, Math.round((max - utilise) * 10) / 10) };
  }
  return { lignes, mouvement: m, principaleFaite: lignes.find(l => l.cle === "action")?.reste === 0 };
}

// Une dépense : la ressource qu'occupe une activation (« action », « bonus », « reaction »…), si l'économie l'a.
// Rend de nouvelles dépenses (la ressource ne descend jamais sous zéro).
export function depenser(economie = [], depenses = {}, cle) {
  const r = economie.find(e => e.cle === cle);
  if (!r) return { ...depenses };
  return { ...depenses, [cle]: Math.min(Number(r.n ?? 1), Number(depenses?.[cle] ?? 0) + 1) };
}

// ------------------------------------------------------------------ moyenne d'une formule de dégâts
// « 2d6 + 3 », « 1d8+1d6+2 » -> moyenne ; les termes inconnus (@mod, [feu]) sont ignorés.
export function moyenneFormule(formule) {
  if (typeof formule === "number") return formule;
  const texte = String(formule ?? "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");
  let total = 0;
  for (const m of texte.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)(?![d\d])/g)) {
    if (m[3]) total += (m[1] === "-" ? -1 : 1) * Number(m[2] || 1) * (Number(m[3]) + 1) / 2;
    else if (m[5]) total += (m[4] === "-" ? -1 : 1) * Number(m[5]);
  }
  return Math.round(total * 10) / 10;
}

// ------------------------------------------------------------------ proposition d'action (PNJ, repli d'un compagnon)
// Sans IA, déterministe : l'adversaire debout le plus proche (à égalité, par nom), la meilleure attaque à portée (dégâts
// moyens ; portée longue ou tir au contact : moitié). Personne à portée : on se rapproche (et on frappe si l'allonge suffit).
// acteur : { id, nom, cases, mouvement (m, null = inconnu), attaques: [{ id, nom, type: "melee" | "distance",
//            allonge (m), portee: { normale, longue } (m), moyenne }] } ; adversaires : combattants à plat ; grille.
// -> { type: "attaque" | "deplacement" | "attendre", attaqueId, attaqueNom, cibleId, cibleNom, distance, longue, deplacement }
export function scoreAttaque(attaque, distance, { auContact = false, pas = 1.5 } = {}) {
  const moyenne = Math.max(0.5, Number(attaque.moyenne ?? 1));
  const marge = 0.01;
  if (attaque.type === "melee") return distance <= (attaque.allonge ?? pas) + marge ? moyenne : -1;
  const normale = attaque.portee?.normale ?? 0, longue = Math.max(normale, attaque.portee?.longue ?? 0);
  let score = -1;
  if (distance <= normale + marge) score = moyenne;
  else if (distance <= longue + marge) score = moyenne / 2;
  if (score > 0 && auContact) score /= 2;
  return score;
}

// Une cible à cette distance : « ok » (une attaque y porte normalement), « longue » (seulement à portée longue), « hors ».
export function porteeVers(attaques = [], distance, pas = 1.5) {
  const marge = 0.01;
  if (attaques.some(a => (a.type === "melee" ? distance <= (a.allonge ?? pas) + marge : distance <= (a.portee?.normale ?? 0) + marge))) return "ok";
  if (attaques.some(a => a.type !== "melee" && distance <= Math.max(a.portee?.normale ?? 0, a.portee?.longue ?? 0) + marge)) return "longue";
  return "hors";
}

export function proposerAction({ acteur, adversaires = [], grille = {} } = {}) {
  const debout = adversaires.filter(c => !horsCombat(c) && c.cases);
  if (!acteur?.cases || !debout.length) return { type: "attendre", raison: "personne" };
  const pas = metresParCase(grille);
  const avecDistance = debout.map(c => ({ c, d: distanceMetres(acteur.cases, c.cases, grille) }))
    .sort((a, b) => a.d - b.d || String(a.c.nom).localeCompare(String(b.c.nom)));
  const auContact = avecDistance[0].d <= pas + 0.01;
  const attaques = acteur.attaques ?? [];
  const meilleure = d => attaques.map(a => ({ a, s: scoreAttaque(a, d, { auContact, pas }) }))
    .filter(x => x.s > 0).sort((x, y) => y.s - x.s || String(x.a.nom).localeCompare(String(y.a.nom)))[0] ?? null;
  // La plus proche d'abord, puis les autres dans l'ordre des distances.
  for (const { c, d } of avecDistance) {
    const m = meilleure(d);
    if (m) {
      const longue = m.a.type !== "melee" && d > (m.a.portee?.normale ?? 0) + 0.01;
      return { type: "attaque", attaqueId: m.a.id, attaqueNom: m.a.nom, cibleId: c.id, cibleNom: c.nom, distance: d, longue, deplacement: null };
    }
  }
  // Personne à portée : se rapprocher de la plus proche.
  const { c, d } = avecDistance[0];
  const mouvement = Number.isFinite(acteur.mouvement) ? acteur.mouvement : null;
  const melee = attaques.filter(a => a.type === "melee").sort((x, y) => (y.moyenne ?? 0) - (x.moyenne ?? 0))[0];
  const deplacement = { versId: c.id, metres: mouvement === null ? null : Math.min(mouvement, Math.max(0, d - (melee?.allonge ?? pas))) };
  if (melee && mouvement !== null && d - (melee.allonge ?? pas) <= mouvement + 0.01) {
    return { type: "attaque", attaqueId: melee.id, attaqueNom: melee.nom, cibleId: c.id, cibleNom: c.nom, distance: d, longue: false, deplacement };
  }
  return { type: "deplacement", attaqueId: null, attaqueNom: null, cibleId: c.id, cibleNom: c.nom, distance: d, longue: false, deplacement };
}

// La case où s'arrêter pour approcher une cible : une case libre voisine de la cible si elle est à portée de mouvement,
// sinon le plus loin possible vers elle, case par case. maxCases : mouvement en cases ; occupees : Set de « x,y ».
export function caseVers(depart, cible, maxCases, { occupees = new Set(), diagonales = 0 } = {}) {
  const libre = (x, y) => !occupees.has(`${x},${y}`);
  const anneau = [];
  for (let x = cible.x - 1; x <= cible.x + (cible.l ?? 1); x++) {
    for (let y = cible.y - 1; y <= cible.y + (cible.h ?? 1); y++) {
      const dedans = x >= cible.x && x < cible.x + (cible.l ?? 1) && y >= cible.y && y < cible.y + (cible.h ?? 1);
      if (!dedans && libre(x, y)) anneau.push({ x, y });
    }
  }
  const cout = c => coutDiagonales(c.x - depart.x, c.y - depart.y, diagonales);
  // À coût égal, la case la plus dans l'axe (distance réelle), puis de haut en bas : toujours la même.
  const droit = c => (c.x - depart.x) ** 2 + (c.y - depart.y) ** 2;
  const proche = anneau.sort((a, b) => cout(a) - cout(b) || droit(a) - droit(b) || a.y - b.y || a.x - b.x)[0];
  if (proche && cout(proche) <= maxCases) return proche;
  // Pas à pas vers la cible, sans entrer sur une case occupée.
  let ici = { x: depart.x, y: depart.y };
  const visee = proche ?? cible;
  for (let i = 0; i < 200; i++) {
    const sx = Math.sign(visee.x - ici.x), sy = Math.sign(visee.y - ici.y);
    if (!sx && !sy) break;
    const options = [{ x: ici.x + sx, y: ici.y + sy }, { x: ici.x + sx, y: ici.y }, { x: ici.x, y: ici.y + sy }]
      .filter(o => (o.x !== ici.x || o.y !== ici.y) && libre(o.x, o.y));
    const suivant = options.find(o => cout(o) <= maxCases);
    if (!suivant) break;
    ici = suivant;
  }
  return ici;
}

// ------------------------------------------------------------------ rappels de début de tour
// combattant : { nom, effets: [{ id, nom, restant (rounds), fini }], conditions: [noms], regeneration (texte ou nombre),
// concentration (nom de ce qu'il maintient ou ""), legendaires: { reste, max } | null }.
//
// rappelsLegendaires (D&D 5e) : une ou deux lignes courtes pour l'IA. combattants : [{ id, nom, camp, initiative, aTerre,
// legendaires: { reste, max } | null, repaire: compte d'initiative | null }] dans l'ordre du tour ; actifId : celui qui joue.
// - actions légendaires : un PNJ debout (ni joueur ni compagnon) qui en a encore peut en dépenser une à la fin du tour d'un
//   AUTRE combattant (elles reviennent au début de son propre tour) ;
// - actions de repaire : au compte d'initiative du repaire (20 par défaut, il perd les égalités), une par round : « c'est le
//   moment » quand le combattant actif est le premier du round sous ce compte.
export function rappelsLegendaires({ combattants = [], actifId = null } = {}) {
  const lignes = [];
  const actif = combattants.find(c => c.id === actifId);
  const pnj = c => !c.aTerre && !["joueur", "compagnon"].includes(c.camp);
  const legendaires = combattants.filter(c => c.id !== actifId && pnj(c) && c.legendaires?.reste > 0);
  if (actif && legendaires.length) {
    lignes.push(`Actions légendaires possibles à la fin du tour de ${actif.nom} : ${legendaires.map(c => `${c.nom} (${c.legendaires.reste}/${c.legendaires.max})`).join(", ")}.`);
  }
  for (const c of combattants.filter(x => pnj(x) && Number(x.repaire) > 0)) {
    const compte = Number(c.repaire);
    const i = combattants.findIndex(x => x.id === actifId);
    const ini = x => Number(x?.initiative ?? NaN);
    const maintenant = i >= 0 && ini(actif) < compte && (i === 0 || ini(combattants[i - 1]) >= compte);
    lignes.push(maintenant
      ? `Actions de repaire : c'est le moment (initiative ${compte}, avant ${actif.nom}) — ${c.nom} en fait une, une seule ce round.`
      : `Repaire : ${c.nom} a une action de repaire par round, à l'initiative ${compte} (il perd les égalités).`);
  }
  return lignes;
}
// -> { obligations (à traiter, une étape chacune), infos (affichées seulement) }
export function rappelsDebutTour(c = {}) {
  const obligations = [], infos = [];
  for (const e of c.effets ?? []) {
    if (e.fini) obligations.push({ cle: "finEffet", effetId: e.id, effet: e.nom, nom: c.nom });
    else if (Number.isFinite(e.restant)) infos.push({ cle: "effet", texte: `${e.nom} : ${e.restant} round(s)` });
  }
  if (c.concentration) obligations.push({ cle: "rappel", sorte: "concentration", nom: c.nom, texte: c.concentration });
  if (c.regeneration) obligations.push({ cle: "rappel", sorte: "regeneration", nom: c.nom, texte: String(c.regeneration) });
  if (c.conditions?.length) infos.push({ cle: "conditions", texte: c.conditions.join(", ") });
  if (c.legendaires?.max) infos.push({ cle: "legendaires", texte: `${c.legendaires.reste}/${c.legendaires.max}` });
  return { obligations, infos };
}

// Sauvegarde de concentration (D&D 5e) après des dégâts : DD 10 ou la moitié des dégâts (au plus 30).
export const ddConcentration = degats => Math.min(30, Math.max(10, Math.floor(Number(degats || 0) / 2)));

// ------------------------------------------------------------------ l'étape suivante d'un combat
const etape = (cle, action, donnees = {}, extra = {}) => ({ cle, action, donnees, attente: false, detail: null, ...extra });

// Le prochain combattant à jouer après l'actif (en sautant ceux hors de combat) ; null : le round se termine.
export function prochainCombattant(combattants = [], actifId) {
  const i = combattants.findIndex(c => c.id === actifId);
  return combattants.slice(i + 1).find(c => !horsCombat(c) || c.jetsMort) ?? null;
}

export function etapeSuivanteCombat(etat = {}) {
  const combat = etat.combat;
  const candidats = etat.candidats ?? [];
  if (!combat || !combat.combattants?.length) {
    return etape("ajouter", "ajouter", { n: candidats.length }, candidats.length ? {} : { detail: { cle: "aucunJeton", donnees: {} } });
  }
  const tous = combat.combattants;
  if (!combat.commence) {
    const sans = tous.filter(c => c.initiative === null || c.initiative === undefined);
    if (sans.length) return etape("initiative", "initiative", { n: sans.length });
    return etape("commencer", "commencer", { n: tous.length });
  }
  // Fin du combat : tous les ennemis à terre (victoire), ou tout le groupe (défaite).
  const eux = tous.filter(c => camp(c) === "eux"), nous = tous.filter(c => camp(c) === "nous");
  if (eux.length && eux.every(horsCombat)) return etape("victoire", "finCombat", { n: eux.length });
  if (nous.length && nous.every(c => horsCombat(c) && !(c.jetsMort && !c.mort))) return etape("defaite", "finCombat", { n: nous.length });

  const actif = tous.find(c => c.id === combat.actif);
  if (!actif) return etape("suivant", "suivant", { nom: tous[0]?.nom ?? "" });
  const suivi = etat.suivi ?? {};

  // Ce qui doit être réglé avant de continuer : sauvegarde demandée, effet fini, rappel de début de tour.
  const [o] = suivi.obligations ?? [];
  if (o) {
    if (o.cle === "sauvegarde") return etape("sauvegarde", "obligation", { nom: o.nom, raison: o.raison ?? "", dd: o.dd ?? "" });
    if (o.cle === "finEffet") return etape("finEffet", "obligation", { nom: o.nom, effet: o.effet });
    return etape("rappel", "obligation", { nom: o.nom, sorte: o.sorte ?? "", texte: o.texte ?? "" },
      { detail: { cle: `rappel.${o.sorte ?? "autre"}`, donnees: { nom: o.nom, texte: o.texte ?? "" } } });
  }

  // Une attaque en cours de résolution. Les jets d'un joueur, c'est lui qui les lance : on l'attend.
  const a = suivi.attaque;
  const sesJets = actif?.camp === "joueur";
  if (a?.phase === "appliquer") return etape("appliquer", "appliquer", { n: a.degats ?? 0, cible: a.cibleNom ?? "" });
  if (a?.phase === "degats") return etape("degats", sesJets ? "" : "degats", { nom: a.nom ?? "", cible: a.cibleNom ?? "" }, { attente: sesJets });
  if (a?.phase === "toucher") return etape("toucher", sesJets ? "" : "toucher", { nom: a.nom ?? "", cible: a.cibleNom ?? "" }, { attente: sesJets });
  if (a?.phase === "defense") {
    const defenseur = tous.find(c => c.id === a.cibleId);
    return etape("defense", defenseur?.camp === "joueur" ? "" : "defense", { cible: a.cibleNom ?? "" }, { attente: defenseur?.camp === "joueur" });
  }

  // L'actif est à terre : jets contre la mort (D&D 5e, une fois par tour), sinon son tour passe.
  if (horsCombat(actif) && !(actif.jetsMort && !actif.mort && a?.phase === "fini")) {
    if (actif.jetsMort && !actif.mort) return etape("jetMort", "jetMort", { nom: actif.nom, succes: actif.jetsMort.succes ?? 0, echecs: actif.jetsMort.echecs ?? 0 });
    return etape("aTerre", "suivant", { nom: actif.nom });
  }

  const restantes = actionsRestantes(etat.economie ?? [], suivi.depenses ?? {});
  const principaleFaite = restantes.principaleFaite || Boolean(a?.phase === "fini") || horsCombat(actif);
  if (!principaleFaite) {
    if (suivi.compagnonEnCours) return etape("compagnon", "", { nom: actif.nom }, { attente: true });
    if (actif.camp === "compagnon") return etape("compagnon", "compagnon", { nom: actif.nom });
    if (actif.camp === "joueur") {
      return etape("attenteJoueur", "", { nom: actif.nom, cible: suivi.cibleNom ?? "" }, { attente: true });
    }
    if (etat.seanceIA && etat.iaJouePnj) return etape("pnjIA", "", { nom: actif.nom }, { attente: true });
    if (!suivi.cible) {
      const p = suivi.proposition;
      return etape("cible", p?.type && p.type !== "attendre" ? "proposition" : "cible", { nom: actif.nom, proposition: p?.texte ?? "" });
    }
    return etape("attaquer", "attaquer", { nom: actif.nom, cible: suivi.cibleNom ?? "" });
  }

  const suivant = prochainCombattant(tous, actif.id);
  if (!suivant) return etape("round", "suivant", { round: (combat.round ?? 1) + 1 });
  return etape("suivant", "suivant", { nom: suivant.nom });
}

// Où en est un joueur : « à toi », « au tour de X, puis toi », ou « au tour de X » (mesIds : ses combattants).
export function situationJoueur(combattants = [], actifId, mesIds = []) {
  const actif = combattants.find(c => c.id === actifId);
  if (!actif) return { aMoi: false, actif: "", puisMoi: false };
  if (mesIds.includes(actif.id)) return { aMoi: true, actif: actif.nom, puisMoi: false };
  // Le suivant, au besoin au début du round suivant.
  const suivant = prochainCombattant(combattants, actifId) ?? combattants.find(c => !horsCombat(c) || c.jetsMort) ?? null;
  return { aMoi: false, actif: actif.nom, puisMoi: Boolean(suivant && mesIds.includes(suivant.id)) };
}

// L'appel du bandeau d'un joueur : une clé par tour qui l'attend (round et combattant, ou tour et orateur du tour de table),
// "" quand rien ne l'attend. Une clé nouvelle et non vide : on l'appelle (scripts/appel.js), une fois par tour.
export function cleDAppel(ctx) {
  if (!ctx?.aMoi) return "";
  return ctx.combat ? `combat|${ctx.round ?? 0}|${ctx.actif ?? ""}` : ctx.table ? `table|${ctx.tour ?? 0}|${ctx.orateur ?? ""}` : "";
}

// ------------------------------------------------------------------ tour de table (hors combat)
// t : { actif, ordre: [{ id, nom, userId, compagnon }], index, faits: { id: "parle" | "passe" }, tour }
export function nouveauTourDeTable(participants = [], tour = 1) {
  const vus = new Set();
  const ordre = participants.filter(p => p?.id && !vus.has(p.id) && vus.add(p.id))
    .map(p => ({ id: p.id, nom: p.nom, userId: p.userId ?? null, compagnon: Boolean(p.compagnon) }));
  return { actif: ordre.length > 0, ordre, index: 0, faits: {}, tour };
}

export const orateurTourDeTable = t => (t?.actif ? t.ordre[t.index] ?? null : null);
export const tourDeTableComplet = t => Boolean(t?.actif && t.index >= t.ordre.length);
// Le tour de table retient le MJ IA : il est en cours et quelqu'un doit encore parler.
export const tourDeTableRetient = t => Boolean(t?.actif && !tourDeTableComplet(t));

// Celui qui a la parole a parlé (ou passe) : la parole va au suivant. Un autre que l'orateur ne fait rien avancer.
export function avancerTourDeTable(t, { id, fait = "parle" } = {}) {
  const o = orateurTourDeTable(t);
  if (!o || o.id !== id) return t;
  return { ...t, faits: { ...t.faits, [id]: fait === "passe" ? "passe" : "parle" }, index: t.index + 1 };
}

// Le MJ saute l'orateur (absent, ne répond pas).
export function sauterTourDeTable(t) {
  const o = orateurTourDeTable(t);
  return o ? avancerTourDeTable(t, { id: o.id, fait: "passe" }) : t;
}

export function etapeTourDeTable(t) {
  if (!t?.actif) return null;
  const o = orateurTourDeTable(t);
  if (!o) return etape("tableFini", "tableNouveau", { n: t.ordre.length, passes: Object.values(t.faits).filter(f => f === "passe").length });
  if (o.compagnon) return etape("tableCompagnon", "tableCompagnon", { nom: o.nom });
  return etape("tableParole", "", { nom: o.nom }, { attente: true });
}
