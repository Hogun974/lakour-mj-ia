// Fénoir (système lakour-survie, monde lakour-fenoir ; contrat : docs/survie-contrat.md du dépôt lakour-fenoir, mode
// d'emploi : docs/survie.md) : ce que le MJ IA tire de l'API du système, game.lakourSurvie, en logique pure (sans Foundry ;
// essais/survie-*.test.mjs). Conversion des difficultés et des réglages d'un test, résumé d'un survivant, état du jeu donné à
// l'IA à chaque tour, textes rendus par les outils survie_*, vue publique d'un compagnon IA.
//
// RÈGLE DU SECRET : le monde réel (api.monde(), §2.3 du contrat : infestation réelle, hordes, cyclone, journal secret) n'entre
// QUE dans les blocs marqués SECRET, destinés au narrateur. Ce que voit un compagnon IA (vuePubliqueSurvie) et tout ce qui part au
// chat ne lisent que l'état public (api.etat(), api.quand()) et les acteurs (publics) : ce que le groupe croit savoir, daté.

export const SYSTEME_SURVIE = "lakour-survie";
export const CONNU = "[connu des joueurs]";
export const SECRET = "[secret MJ]";
const ID_MJIA = "lakour-mj-ia";

// Les dix compétences (§1.2 du contrat), clés stables et libellés.
export const COMPETENCES_SURVIE = [
  { cle: "endurance", libelle: "Endurance", aide: "porter, creuser, courir, résister" },
  { cle: "combat", libelle: "Combat", aide: "corps à corps" },
  { cle: "tir", libelle: "Tir", aide: "armes à feu, arc, fronde" },
  { cle: "discretion", libelle: "Discrétion", aide: "passer inaperçu, se cacher" },
  { cle: "vigilance", libelle: "Vigilance", aide: "repérer, monter la garde" },
  { cle: "bricolage", libelle: "Bricolage", aide: "réparer, construire, électricité, mécanique" },
  { cle: "survie", libelle: "Survie", aide: "eau, cultures, pêche, chasse, orientation, plantes" },
  { cle: "soins", libelle: "Soins", aide: "premiers secours, blessures, fièvres" },
  { cle: "parole", libelle: "Parole", aide: "convaincre, négocier, apaiser, commander" },
  { cle: "conduite", libelle: "Conduite", aide: "véhicules, deux-roues, bateau" }
];
export const CLES_COMPETENCES = COMPETENCES_SURVIE.map(c => c.cle);
export const libelleCompetence = cle => COMPETENCES_SURVIE.find(c => c.cle === cle)?.libelle ?? cle;

// Ressources du groupe (§1.6), dans l'ordre où on les montre.
export const RESSOURCES = ["eau", "nourriture", "carburant", "medicaments", "munitions", "materiaux", "pieces", "graines", "energie"];
const LIBELLES_RESSOURCES = { eau: "eau", nourriture: "nourriture", carburant: "carburant", medicaments: "médicaments", munitions: "munitions",
  materiaux: "matériaux", pieces: "pièces", graines: "graines", energie: "énergie (kWh)" };
export const libelleRessource = r => LIBELLES_RESSOURCES[r] ?? r;

export const MOMENTS = { matin: "matin", "apres-midi": "après-midi", soir: "soir", nuit: "nuit" };
const PHASES = { "jour-zero": "jour zéro", panique: "panique", effondrement: "effondrement", silence: "silence", apres: "l'après" };
const BLESSURES = ["indemne", "égratigné", "blessé", "grièvement blessé", "mourant"];

// ------------------------------------------------------------------ difficultés et réglages d'un test
// Échelle commune du MJ IA (adaptateurs.js, DIFFICULTES) -> difficulté du système (succès requis : normale 1, difficile 2,
// extreme 3) et dés en plus (§7 du contrat : facile = normale +1 dé). « tres-facile » (non prévu par le contrat) : +2 dés. Les
// noms du système (normale, difficile, extreme, facile) sont acceptés tels quels.
const CONVERSION = {
  aucune: { difficulte: "normale", bonus: 0 },
  "tres-facile": { difficulte: "normale", bonus: 2 },
  facile: { difficulte: "normale", bonus: 1 },
  routiniere: { difficulte: "normale", bonus: 0 },
  exigeante: { difficulte: "normale", bonus: 0 },
  normale: { difficulte: "normale", bonus: 0 },
  difficile: { difficulte: "difficile", bonus: 0 },
  ardue: { difficulte: "extreme", bonus: 0 },
  "tres-ardue": { difficulte: "extreme", bonus: 0 },
  extreme: { difficulte: "extreme", bonus: 0 }
};
export const DIFFICULTES_SURVIE = ["facile", "normale", "difficile", "extreme"];

export function convertirDifficulte(difficulte) {
  return { ...(CONVERSION[String(difficulte ?? "").trim()] ?? CONVERSION.aucune) };
}

const entier = v => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const borner = (v, min, max) => Math.min(max, Math.max(min, v));

// Réglages communs d'un test (demander_jet, jet_compagnon : { difficulte, modificateur, avantage, desavantage }) -> arguments du
// test du système : { difficulte, bonus, malus } en DÉS. Un avantage = +1 dé, un désavantage = -1 dé (3 au plus chacun) ; le
// modificateur compte en dés de situation (±2 au plus, §1.1 : « situation ±1 ou ±2 ») ; un modificateur de l'échelle d'un autre
// système (-10, +20) est donc ramené à ±2.
export function reglagesVersTest(reglages = {}) {
  const { difficulte, bonus: facile } = convertirDifficulte(reglages.difficulte);
  const modif = borner(entier(reglages.modificateur), -2, 2);
  const bonus = facile + borner(entier(reglages.avantage), 0, 3) + Math.max(0, modif) + Math.max(0, entier(reglages.bonus));
  const malus = borner(entier(reglages.desavantage), 0, 3) + Math.max(0, -modif) + Math.max(0, entier(reglages.malus));
  return { difficulte, bonus, malus };
}

// ------------------------------------------------------------------ l'API du système, défensivement
// Une erreur claire plutôt qu'un « undefined is not a function » : système absent, ou fonction absente (système plus ancien).
export function apiSurvie(api = globalThis.game?.lakourSurvie) {
  if (!api || typeof api !== "object") throw new Error("Le système lakour-survie n'est pas chargé dans ce monde (game.lakourSurvie absent).");
  return api;
}
export function fonctionSurvie(api, nom) {
  const fn = apiSurvie(api)[nom];
  if (typeof fn !== "function") throw new Error(`Le système lakour-survie ne fournit pas game.lakourSurvie.${nom}() : mets-le à jour.`);
  return fn.bind(api);
}
// Un appel qui ne doit jamais faire échouer l'état du jeu : null en cas d'erreur ou de fonction absente.
export function lireSurvie(api, nom, ...args) {
  try { return typeof api?.[nom] === "function" ? api[nom](...args) ?? null : null; } catch { return null; }
}

// Le message d'une erreur du système, lisible par l'IA : une clé de traduction (LAKOUR_SURVIE.Erreurs.PasMJActif) est traduite,
// et le refus hors du MJ actif expliqué.
export function messageErreurSurvie(e, traduire = k => k) {
  const brut = String(e?.message ?? e ?? "erreur inconnue");
  const texte = /^LAKOUR_SURVIE\.[\w.]+$/.test(brut) ? traduire(brut) : brut;
  if (/PasMJActif/.test(brut)) {
    return `${texte !== brut ? `${texte} ` : ""}(LAKOUR_SURVIE.Erreurs.PasMJActif) Seul le MJ actif écrit l'état de Fénoir, monde ouvert : `
      + "rien n'a changé. Vérifie que le coffre est ouvert chez le MJ actif, puis recommence.";
  }
  return texte;
}

// ------------------------------------------------------------------ le contenu (registre du module lakour-fenoir)
// Le registre peut ranger ses fiches en tableau, en Map ou en objet indexé par clé : on lit les trois.
export function listeDe(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (collection instanceof Map) return [...collection.values()];
  if (typeof collection === "object") return Object.entries(collection).map(([cle, v]) => (v && typeof v === "object" && !v.cle ? { cle, ...v } : v));
  return [];
}
const normaliser = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase()
  .replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
// Une fiche par sa clé ou son nom (« saint-denis », « Saint-Denis », « saint denis ») ; null sinon.
export function trouverFiche(collection, reference) {
  const n = normaliser(reference);
  if (!n) return null;
  const liste = listeDe(collection);
  return liste.find(f => f?.cle === reference) ?? liste.find(f => normaliser(f?.cle) === n) ?? liste.find(f => normaliser(f?.nom) === n)
    ?? liste.find(f => normaliser(f?.nom).includes(n)) ?? null;
}
// Le nom d'une fiche ; genre ("f" | "m") : le libellé accordé d'une enfance ou d'un passé genré (`nomAutre` quand le genre du
// survivant est l'autre), comme nomAccorde du système lakour-survie.
export function nomDe(collection, cle, genre = "") {
  const f = trouverFiche(collection, cle);
  if (!f) return cle;
  return f.genre && genre && f.genre !== genre && f.nomAutre ? f.nomAutre : f.nom ?? cle;
}

// Régions voisines d'une région (clés), d'après le contenu.
export const voisinsDe = (contenu, cle) => (trouverFiche(contenu?.regions, cle)?.voisins ?? []).map(v => v?.region).filter(Boolean);

// Distances (en régions traversées) depuis une région, jusqu'à max : Map cle -> distance (la région de départ à 0).
export function regionsADistance(contenu, depart, max = 2) {
  const distances = new Map([[depart, 0]]);
  let front = [depart];
  for (let d = 1; d <= max; d++) {
    const suivant = [];
    for (const r of front) for (const v of voisinsDe(contenu, r)) if (!distances.has(v)) { distances.set(v, d); suivant.push(v); }
    front = suivant;
  }
  return distances;
}

// ------------------------------------------------------------------ petits textes
// Texte brut d'un HTML, sans ponctuation finale (les lignes remettent la leur).
const texteBrut = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().replace(/[.;\s]+$/, "");
const couper = (t, max) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`);
const virgule = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace(".", ","));
const signe = n => `${n > 0 ? "+" : ""}${virgule(n)}`;
const pluriel = (n, mot) => `${virgule(n)} ${mot}${Math.abs(n) >= 2 ? "s" : ""}`;
export const etiquetteBlessures = n => BLESSURES[borner(entier(n), 0, 4)];
export const momentTexte = m => MOMENTS[m] ?? (Number.isInteger(m) ? Object.values(MOMENTS)[m] : m) ?? "?";
export const phaseTexte = p => PHASES[p] ?? p ?? "?";

// Le moment de jeu en une ligne : « jour 3, soir (2026-12-07, saison des pluies), phase panique ».
export function texteQuand(q) {
  if (!q) return "date inconnue";
  const date = q.dateTexte || q.date;
  return `jour ${q.jour ?? "?"}, ${momentTexte(q.moment)}${date ? ` (${date}${q.saison ? `, ${q.saison}` : ""})` : ""}, phase ${phaseTexte(q.phase)}`;
}
// Le jour d'un quart (4 quarts par jour, §1.4).
export const jourDuQuart = quart => Math.floor(entier(quart) / 4);

// Stocks : « eau 12, nourriture 9, carburant 2 » (les ressources à zéro sont tues, sauf eau et nourriture).
export function texteStocks(stocks = {}) {
  return RESSOURCES.filter(r => r === "eau" || r === "nourriture" || entier(stocks?.[r]) !== 0)
    .map(r => `${libelleRessource(r)} ${virgule(Number(stocks?.[r] ?? 0))}`).join(", ");
}
// Variations : « eau +1, nourriture -2 » (les nulles tues).
export function texteVariations(v = {}) {
  const lignes = Object.entries(v ?? {}).filter(([, n]) => Number(n)).map(([r, n]) => `${libelleRessource(r)} ${signe(Number(n))}`);
  return lignes.join(", ") || "rien";
}

// ------------------------------------------------------------------ un survivant
// Résumé d'un acteur « survivant » pour l'IA (adaptateur, compagnons) : PUBLIC (les acteurs sont publics, §4) ; rien du monde.
// nomPasse(cle) : le nom d'un passé du contenu (facultatif).
// nomDe(collection, cle, genre) reçoit le genre du survivant (system.genre) : les libellés genrés s'accordent.
export function resumerSurvivant(acteur, { nomPasse = null, nomDe: nomContenu = (_c, cle) => cle } = {}) {
  const s = acteur?.system ?? {};
  const genre = s.genre ?? "";
  const compagnon = Boolean(acteur?.flags?.[ID_MJIA]?.compagnon);
  const comps = Object.entries(s.competences ?? {})
    .filter(([, c]) => entier(c?.niveau) > 0)
    .map(([k, c]) => `${libelleCompetence(k).toLowerCase()} ${entier(c.niveau)}${FLAMMES[entier(s.passions?.[k])] ?? ""}${entier(c.marques) ? ` (${pluriel(entier(c.marques), "marque")})` : ""}`);
  const objets = [...(acteur?.items ?? [])];
  const savoirs = objets.filter(i => i.type === "savoir").map(i => i.name);
  const equipement = objets.filter(i => i.type === "equipement").map(i => i.name);
  const inf = s.infection ?? {};
  const passe = s.passe ? (nomPasse ? nomPasse(s.passe, genre) : nomContenu("passes", s.passe, genre)) : "";
  const etat = [`blessures ${entier(s.blessures)}/4 (${etiquetteBlessures(s.blessures)})`, `fatigue ${entier(s.fatigue)}/5`,
    `moral ${entier(s.moral ?? 4)}/5`, entier(s.faim) ? `faim ${pluriel(entier(s.faim), "jour")}` : "",
    entier(s.soif) ? `soif ${pluriel(entier(s.soif), "quart")}` : ""].filter(Boolean).join(", ");
  const vie = s.livide ? "LIVIDE (mort et relevé : ce n'est plus un membre du groupe)" : s.vivant === false ? "MORT" : "";
  return [
    `${acteur?.name ?? "?"}${compagnon ? " [compagnon IA]" : ""} (survivant${entier(s.age) ? `, ${entier(s.age)} ans` : ""})`,
    s.statut && s.statut !== "joueur" ? `statut : ${s.statut}` : "",
    s.enfance ? `enfance : ${nomContenu("enfances", s.enfance, genre)}` : "",
    passe ? `passé : ${passe}` : "",
    s.lien ? `lien : ${couper(texteBrut(s.lien), 80)}` : "",
    `compétences : ${comps.join(", ") || "aucune au-dessus de 0"}`,
    (s.traits ?? []).length ? `traits : ${s.traits.map(t => nomContenu("traits", t)).join(", ")}` : "",
    (s.incapacites ?? []).length ? `INCAPABLE de : ${s.incapacites.join(", ")}` : "",
    s.tache ? `tâche du jour : ${s.tache}` : "",
    `état : ${etat}`,
    inf.atteint ? `INFECTÉ : stade ${entier(inf.stade)}/6 depuis le quart ${entier(inf.depuis)} (à 6 il meurt et se relève Livide ; aucun remède connu)` : "",
    savoirs.length ? `savoirs : ${savoirs.join(", ")}` : "",
    equipement.length ? `équipement : ${equipement.join(", ")}` : "",
    entier(s.charge) ? `charge ${entier(s.charge)}` : "",
    vie
  ].filter(Boolean).join(" — ");
}

// Passions (§10.1) : 1 intérêt, 2 passion (marques plus rapides, moral).
const FLAMMES = { 1: " (intérêt)", 2: " (PASSION)" };

// Un membre en quelques mots, pour l'état du jeu : « Lucie (blessé 2, fatigue 3, INFECTÉE 2/6) ».
export function etatCourt(acteur) {
  const s = acteur?.system ?? {};
  if (s.livide) return `${acteur.name} (LIVIDE)`;
  if (s.vivant === false) return `${acteur.name} (mort)`;
  const morceaux = [
    entier(s.blessures) ? `${etiquetteBlessures(s.blessures)} ${entier(s.blessures)}` : "",
    entier(s.fatigue) >= 2 ? `fatigue ${entier(s.fatigue)}` : "",
    entier(s.moral ?? 4) <= 2 ? `moral ${entier(s.moral)}` : "",
    entier(s.faim) ? `faim ${entier(s.faim)} j` : "", entier(s.soif) >= 2 ? `soif ${entier(s.soif)} q` : "",
    s.infection?.atteint ? `INFECTÉ ${entier(s.infection.stade)}/6` : "",
    s.tache ? `à : ${s.tache}` : ""
  ].filter(Boolean);
  if (acteur?.flags?.[ID_MJIA]?.compagnon) morceaux.push("compagnon IA");
  return `${acteur.name}${morceaux.length ? ` (${morceaux.join(", ")})` : ""}`;
}

// Un test résolu, en une phrase : « Lucie, Soins (extrême) : 2 succès pour 3 requis — échec (marge -1), forcé ; complication ».
// monte (api.test) : la marque a fait monter la compétence d'un niveau (le niveau rendu par l'API est celui d'AVANT le test).
export function texteTest(nom, competence, r = {}) {
  const succes = entier(r.succes), requis = entier(r.requis ?? 1);
  return `${nom}, ${libelleCompetence(competence)}${r.difficulte ? ` (${r.difficulte})` : ""} : ${succes} succès `
    + `pour ${requis} requis — ${r.reussite ? "réussite" : "échec"} (marge ${signe(entier(r.marge))})`
    + `${r.force ? ", forcé" : ""}${r.complication ? " ; COMPLICATION (choisis-en une : bruit, outil cassé, blessure légère, temps perdu)" : ""}`
    + `${r.marque ? " ; une marque gagnée" : ""}${r.monte ? " ; la compétence MONTE d'un niveau (dis-le au joueur)" : ""}.`;
}

// ------------------------------------------------------------------ renseignements (PUBLIC) et réel (SECRET)
const BOOL = (v, oui, non) => (v === true ? oui : v === false ? non : "");
// Âge d'un renseignement en jours, ou null (jamais vu).
export function ageRenseignement(r, jour) {
  return Number.isFinite(Number(r?.vu)) && r?.vu !== null && r?.vu !== "" ? Math.max(0, entier(jour) - entier(r.vu)) : null;
}
// Ce que le groupe croit d'une région : « Le Port (radio, il y a 2 j) : infestation dense, pillage entamé, électricité coupée ».
export function ligneRenseignement(nom, r, jour, nomRegion = c => c) {
  if (!r) return `${nom} : rien de connu.`;
  const age = ageRenseignement(r, jour);
  const source = r.source === "radio" ? "par radio" : r.source === "rumeur" ? "rumeur" : "vu";
  const quand = age === null ? "jamais vu" : age === 0 ? `${source}, aujourd'hui` : `${source}, il y a ${age} j`;
  const routes = Object.entries(r.routes ?? {}).filter(([, e]) => e && e !== "ouverte").map(([v, e]) => `${nomRegion(v)} ${e}`);
  const morceaux = [
    r.infestation && r.infestation !== "inconnue" ? `infestation ${r.infestation}` : "",
    r.pillage && r.pillage !== "inconnu" ? `pillage ${r.pillage}` : "",
    BOOL(r.electricite, "électricité là", "électricité coupée"), BOOL(r.eau, "eau courante là", "eau courante coupée"),
    routes.length ? `routes : ${routes.join(", ")}` : "",
    (r.factions ?? []).length ? `factions vues : ${r.factions.join(", ")}` : "",
    r.notes ? couper(texteBrut(r.notes), 120) : ""
  ].filter(Boolean);
  return `${nom} (${quand}) : ${morceaux.join(", ") || "rien de précis"}.`;
}

// Le réel d'une région (SECRET) : « Le Port : infestation 3,8/5, reste à piller nourriture 120, eau 40 ; factions … ».
export function ligneReel(nom, reel, nomRegion = c => c) {
  if (!reel) return `${nom} : pas d'état simulé.`;
  const restes = RESSOURCES.filter(r => Number(reel.pillage?.[r]) > 0).map(r => `${libelleRessource(r)} ${virgule(Number(reel.pillage[r]))}`);
  const factions = Object.entries(reel.factions ?? {}).filter(([, f]) => Number(f) > 0).map(([f, n]) => `${f} ${virgule(Number(n))}`);
  const routes = Object.entries(reel.routes ?? {}).filter(([, e]) => e && e !== "ouverte").map(([v, e]) => `${nomRegion(v)} ${e}`);
  const evenements = (reel.evenements ?? []).map(e => `${e.cle}${e.jusqua !== undefined && e.jusqua !== null ? ` jusqu'au jour ${e.jusqua}` : ""}`);
  const abris = (reel.abrisAbandonnes ?? []).map(a => `${a.site}${a.occupe ? ` occupé par ${a.occupe}` : " vide"}`);
  return `${nom} : infestation ${virgule(Number(reel.infestation ?? 0))}/5`
    + `${restes.length ? ` ; reste à piller : ${restes.join(", ")}` : " ; pillée à sec"}`
    + `${factions.length ? ` ; factions : ${factions.join(", ")}` : ""}${routes.length ? ` ; routes : ${routes.join(", ")}` : ""}`
    + `${evenements.length ? ` ; en cours : ${evenements.join(", ")}` : ""}${abris.length ? ` ; abris abandonnés : ${abris.join(", ")}` : ""}.`;
}

// Réseaux d'une région (SECRET : les dates tirées de chute) : « électricité tombée (jour 9), eau tombe au jour 12 ».
function ligneCoupures(coupures, jour) {
  if (!coupures) return "";
  const noms = { electricite: "électricité", eau: "eau", carburant: "carburant", telephone: "téléphone" };
  return Object.entries(noms).map(([k, n]) => {
    const j = coupures[k];
    if (j === null || j === undefined) return `${n} tient`;
    return entier(j) <= entier(jour) ? `${n} tombé (jour ${entier(j)})` : `${n} tombe au jour ${entier(j)}`;
  }).join(", ");
}

// ------------------------------------------------------------------ l'état du jeu (contexte de l'IA, à chaque tour)
// lire : { etat, quand, bilan, monde, contenu } (déjà lus de l'API) ; acteur(id) -> l'acteur Foundry. Rend { connu, secret },
// deux listes de lignes ; le secret ne lit QUE monde. Court : quelques centaines de mots au plus.
export function lignesSurvie({ etat, quand, bilan, monde, contenu, besoins } = {}, { acteur = () => null } = {}) {
  const connu = [], secret = [];
  if (!etat) return { connu: ["Fénoir : état de la partie illisible (système lakour-survie absent ou pas prêt)."], secret };
  if (!etat.demarree) {
    connu.push("Fénoir : partie pas encore démarrée. Avec les joueurs, choisis la région de départ et le groupe, puis survie_demarrer.");
    return { connu, secret };
  }
  const groupe = etat.groupe ?? {};
  const jour = quand?.jour ?? jourDuQuart(etat.horloge?.quart);
  const nomRegion = cle => nomDe(contenu?.regions, cle);
  const ici = groupe.region;
  connu.push(`Fénoir — ${texteQuand(quand ?? { jour, phase: etat.phase })}.`);
  const abri = groupe.abri ? acteur(groupe.abri) : null;
  const site = abri?.system?.site ? nomDe(contenu?.sites, abri.system.site) : "";
  connu.push(`Groupe : ${ici ? nomRegion(ici) : "région ?"}${abri ? `, abri « ${abri.name}${site && site !== abri.name ? ` — ${site}` : ""} »` : ", sans abri"}`
    + `${groupe.enRoute ? ` ; EN ROUTE de ${nomRegion(groupe.enRoute.de)} vers ${nomRegion(groupe.enRoute.vers)} (${groupe.enRoute.transport ?? "à pied"}, `
      + `reste ${pluriel(entier(groupe.enRoute.reste), "quart")})` : ""}.`);
  const membres = (groupe.membres ?? []).map(id => acteur(id)).filter(Boolean);
  const pnj = (groupe.pnj ?? []).map(p => `${p.nom}${p.etat ? ` (${p.etat})` : ""}`);
  connu.push(`Membres : ${membres.map(etatCourt).join(" ; ") || "aucun"}${pnj.length ? ` ; PNJ du groupe : ${pnj.join(", ")}` : ""}.`);
  if (abri) {
    const j = bilan?.joursDeStocks ?? {};
    connu.push(`Stocks : ${texteStocks(abri.system?.stocks)}`
      + `${j.eau !== undefined || j.nourriture !== undefined ? ` — tiennent ${virgule(Number(j.eau ?? 0))} j d'eau, ${virgule(Number(j.nourriture ?? 0))} j de nourriture` : ""}.`);
  }
  if (bilan) {
    connu.push(`Par jour, net : ${texteVariations(bilan.net)} ; défense ${bilan.defense ?? "?"}, discrétion ${bilan.discretion ?? "?"}, `
      + `visibilité ${bilan.visibilite ?? "?"}, bruit ${abri?.system?.bruit ?? 0} ; jours autonomes d'affilée : ${entier(etat.joursAutonomes)}`
      + `${etat.autonome ? " (AUTONOMES : raconte-le)" : ""}.`);
  }
  if ((groupe.plans ?? []).length) connu.push(`Plans (reconstruits plus vite ailleurs) : ${groupe.plans.map(p => nomDe(contenu?.installations, p)).join(", ")}.`);
  // Ce qui manque au groupe (besoins du système, §10.2) : de quoi chercher et proposer des recrues.
  const manques = lignesBesoins(besoins).slice(0, 4);
  if (manques.length) connu.push(`Manques du groupe : ${manques.join(" ; ")}.`);
  const alertes = (etat.alertes ?? []).slice(-4);
  if (alertes.length) connu.push(`Alertes connues : ${alertes.map(a => `${couper(texteBrut(a.texte), 140)} (jour ${jourDuQuart(a.quart)})`).join(" ; ")}.`);
  // Renseignements de la région du groupe et de ses voisines : ce que le groupe CROIT, daté.
  const regions = ici ? [ici, ...voisinsDe(contenu, ici)] : [];
  if (regions.length) {
    connu.push("Renseignements (ce que le groupe croit, daté ; c'est tout ce que les joueurs savent) :",
      ...regions.map(r => `· ${ligneRenseignement(nomRegion(r), etat.renseignements?.[r], jour, nomRegion)}`));
  }
  // ---------------- SECRET : le réel, de monde() seulement.
  if (!monde) {
    secret.push("Monde réel indisponible (coffre pas encore ouvert chez le MJ actif) : ne devine pas le réel, raconte seulement le connu.");
    return { connu, secret };
  }
  if (ici) {
    secret.push(...regions.map(r => `· ${ligneReel(nomRegion(r), monde.regions?.[r], nomRegion)}`));
    const c = ligneCoupures(monde.coupures?.[ici], jour);
    if (c) secret.push(`· Réseaux à ${nomRegion(ici)} : ${c}.`);
  }
  secret.push(...lignesMenaces({ monde, contenu, ici, jour }));
  return { connu, secret };
}

// Les menaces réelles qui approchent (SECRET, de monde seulement) : hordes à 2 régions ou moins, cyclone, éruption, menaces tirées
// pour l'abri, ce qui s'est passé hors champ depuis le jour depuisJour (la veille par défaut).
export function lignesMenaces({ monde, contenu, ici, jour, depuisJour = entier(jour) - 1 } = {}) {
  if (!monde) return [];
  const secret = [];
  const nomRegion = cle => nomDe(contenu?.regions, cle);
  const distances = ici ? regionsADistance(contenu, ici, 2) : new Map();
  const hordes = (monde.hordes ?? []).filter(h => distances.has(h.region))
    .map(h => `horde ${h.id ?? "?"} (taille ${h.taille ?? "?"}/5) à ${nomRegion(h.region)}${distances.get(h.region) === 0 ? " (ICI)" : ` (à ${distances.get(h.region)} région${distances.get(h.region) > 1 ? "s" : ""})`}`
      + `${h.cap ? `, cap sur ${nomRegion(h.cap)}` : ""}`);
  secret.push(`· Hordes à 2 régions ou moins : ${hordes.join(" ; ") || "aucune"}.`);
  const cy = monde.cyclone;
  if (cy && cy.alerte !== "passe") {
    secret.push(`· Cyclone « ${cy.nom ?? "?"} » : ${cy.alerte ?? "?"}, arrivée jour ${cy.arrivee ?? "?"} (dans ${Math.max(0, entier(cy.arrivee) - entier(jour))} j), `
      + `force ${cy.force ?? "?"}/3${(cy.trajectoire ?? []).length ? `, trajectoire : ${cy.trajectoire.map(nomRegion).join(" → ")}` : ""}.`);
  }
  const er = monde.eruption;
  if (er && (er.fin === undefined || er.fin === null || entier(er.fin) >= entier(jour))) {
    secret.push(`· Éruption de la Fournaise : du jour ${er.debut ?? "?"} au jour ${er.fin ?? "?"} (${(er.regions ?? []).map(nomRegion).join(", ") || "?"}).`);
  }
  // Les menaces tirées pour l'abri (monde.menaces, si le système les garde) et ce qui s'est passé hors champ ces derniers jours.
  const menaces = (monde.menaces ?? monde.menacesDuJour ?? []).map(m => (typeof m === "string" ? m : couper(texteBrut(m.texte ?? m.description ?? m.type ?? ""), 140)))
    .filter(Boolean);
  if (menaces.length) secret.push(`· Menaces du jour pour l'abri : ${menaces.join(" ; ")}.`);
  const horsChamp = (monde.journalSecret ?? []).filter(e => entier(e.jour) >= entier(depuisJour)).slice(-4).map(e => `jour ${e.jour} : ${couper(texteBrut(e.texte), 140)}`);
  if (horsChamp.length) secret.push(`· Hors champ : ${horsChamp.join(" ; ")}.`);
  return secret;
}

// Le temps avancé hors de l'IA (crochet « lakourSurvie.avance » du système : quand, faits publics), signalé au narrateur.
export function texteAvanceSurvie(quand, faits = []) {
  const publics = (faits ?? []).filter(f => f?.public !== false).map(f => couper(texteBrut(f.texte ?? f.cle ?? ""), 160)).filter(Boolean);
  return `⏳ Fénoir : le temps a passé (le MJ l'a avancé) ; maintenant ${texteQuand(quand)}.`
    + `${publics.length ? ` Faits que le groupe perçoit : ${publics.join(" ; ")}.` : ""} Raconte-le si c'est utile.`;
}

// Palier de visibilité franchi à la hausse (crochet « lakourSurvie.palier » du système : { palier, table }, comme l'Exposition
// de lakour-40k) : la table d'événements de ce palier est proposée au narrateur, qui la tire en secret et pose la scène.
export function textePalierSurvie(charge = {}) {
  const palier = couper(texteBrut(charge?.palier ?? "?"), 60);
  const table = couper(texteBrut(charge?.table ?? ""), 120);
  return `👁 [Visibilité] L'abri vient de franchir le palier de visibilité « ${palier} » : on le voit ou on l'entend de plus loin. `
    + (table ? `Lis la table « ${table} » (chercher_compendium, lire_document) et tire son résultat EN SECRET (lancer_des, secret true, avec `
      + `sa formule ; pas lancer_table, qui tire devant tout le monde), puis pose ce qui arrive (rumeur, éclaireurs, visite, `
      + "assaut) au bon moment, sans l'annoncer comme un tirage." : "Fais-en venir les conséquences (rumeur, éclaireurs, visite, assaut) au bon moment.");
}

// L'en-tête du bloc secret, partout le même (contexte, outils) : l'IA sait ce qu'elle ne doit ni dire ni laisser deviner.
export const ENTETE_SECRET = `${SECRET} Le RÉEL — pour toi seul : ne le dis jamais, ne le laisse pas deviner (ni allusion, ni description `
  + "qui le trahisse) ; les joueurs ne savent que les renseignements datés ci-dessus et ce que leurs personnages perçoivent :";

// Un texte en deux blocs : « [connu des joueurs] … » puis « [secret MJ] … » (le second seulement s'il y a un secret).
export function rendu({ connu = [], secret = [] } = {}, { enteteSecret = `${SECRET} Pour toi seul, à ne jamais dire ni laisser deviner :` } = {}) {
  const c = connu.filter(Boolean), s = secret.filter(Boolean);
  return [c.length ? `${CONNU}\n${c.join("\n")}` : "", s.length ? `${enteteSecret}\n${s.join("\n")}` : ""].filter(Boolean).join("\n");
}

// Les lignes de l'état du jeu de Fénoir (contexte.js) : l'API est lue ici, défensivement.
export function contexteSurvie(api, { acteur = () => null } = {}) {
  const lire = nom => lireSurvie(api, nom);
  const donnees = { etat: lire("etat"), quand: lire("quand"), bilan: lire("bilan"), monde: lire("monde"), contenu: lire("contenu"), besoins: lire("besoins") };
  const { connu, secret } = lignesSurvie(donnees, { acteur });
  return [`${CONNU}`, ...connu, ...(secret.length ? [ENTETE_SECRET, ...secret] : [])];
}

// ------------------------------------------------------------------ la vue d'un compagnon IA (PUBLIC SEULEMENT)
// Ce qu'un membre du groupe sait de la situation : le moment, la région et l'abri, les stocks, les alertes, l'état des autres,
// ce que le groupe croit de sa région. Jamais monde() : la fonction ne la reçoit même pas.
export function vuePubliqueSurvie({ etat, quand, contenu } = {}, { acteur = () => null } = {}) {
  if (!etat?.demarree) return [];
  const groupe = etat.groupe ?? {};
  const jour = quand?.jour ?? jourDuQuart(etat.horloge?.quart);
  const nomRegion = cle => nomDe(contenu?.regions, cle);
  const abri = groupe.abri ? acteur(groupe.abri) : null;
  return [
    `Fénoir, ${texteQuand(quand ?? { jour, phase: etat.phase })}.`,
    `Le groupe est à ${groupe.region ? nomRegion(groupe.region) : "?"}${abri ? `, abri « ${abri.name} »` : ", sans abri"}`
      + `${groupe.enRoute ? `, en route vers ${nomRegion(groupe.enRoute.vers)}` : ""}.`,
    abri ? `Réserves de l'abri : ${texteStocks(abri.system?.stocks)}.` : "",
    `Le groupe : ${(groupe.membres ?? []).map(id => acteur(id)).filter(Boolean).map(etatCourt).join(" ; ") || "?"}.`,
    (etat.alertes ?? []).length ? `Ce qu'on sait d'inquiétant : ${(etat.alertes ?? []).slice(-3).map(a => couper(texteBrut(a.texte), 120)).join(" ; ")}.` : "",
    groupe.region ? `Ce que vous croyez du coin : ${ligneRenseignement(nomRegion(groupe.region), etat.renseignements?.[groupe.region], jour, nomRegion)}` : ""
  ].filter(Boolean);
}

// La vue publique lue de l'API (compagnons-jeu.js) : etat, quand et contenu seulement.
export function vuePubliqueDepuisApi(api, options = {}) {
  return vuePubliqueSurvie({ etat: lireSurvie(api, "etat"), quand: lireSurvie(api, "quand"), contenu: lireSurvie(api, "contenu") }, options);
}

// ------------------------------------------------------------------ création « à la RimWorld », besoins, recrues, tâches (§10)
// Fonctions de l'API supposées (le contrat les décrit au §10 sans les signer) : generer({ verrous, …options }) -> données d'un
// survivant ; besoins() -> besoins du groupe ; genererRecrue({ region }) -> une recrue ; recruter({ recrue, parleurId }) ;
// assigner({ acteurId, tache }) ; ajouterMembre({ acteurId, statut }).
export const TACHES = ["garde", "cultures", "elevage", "chantier", "atelier", "cuisine", "soins", "eau", "peche", "chasse", "fouille", "repos", "enseigner"];
export const STATUTS = ["joueur", "compagnon", "recrue", "pnj"];
// Budget d'un humain de départ (§10.2 : somme des niveaux entre 10 et 16, réglage du MJ côté système).
export const BUDGET_DEPART = Object.freeze({ min: 10, max: 16 });

// Le niveau d'une compétence, qu'elle soit rangée en nombre ou en { niveau }.
const niveauDe = c => entier(typeof c === "object" && c !== null ? c.niveau : c);
export const sommeNiveaux = competences => Object.values(competences ?? {}).reduce((t, c) => t + niveauDe(c), 0);
export const dansLeBudget = (donnees, budget = BUDGET_DEPART) => {
  const somme = sommeNiveaux(donnees?.competences);
  return somme >= budget.min && somme <= budget.max;
};

// Un tirage du générateur, résumé pour le joueur (créé par creer_survivant, action « tirer ») :
// « A — Mélissa Payet, 27 ans — enfance : … ; passé : … — soins 3 (PASSION), survie 2 … (somme 12) — traits … — histoire … ».
export function resumerTirage(d = {}, lettre = "?", { nomDe: nomContenu = (_c, cle) => cle } = {}) {
  const passions = d.passions ?? {};
  const comps = Object.entries(d.competences ?? {}).filter(([, c]) => niveauDe(c) > 0)
    .sort(([, a], [, b]) => niveauDe(b) - niveauDe(a))
    .map(([k, c]) => `${libelleCompetence(k).toLowerCase()} ${niveauDe(c)}${FLAMMES[entier(passions[k])] ?? ""}`);
  const graine = Array.isArray(d.graine ?? d.histoire) ? (d.graine ?? d.histoire).join(" ") : (d.graine ?? d.histoire ?? "");
  return [
    `${lettre} — ${d.nom || "(sans nom)"}${entier(d.age) ? `, ${entier(d.age)} ans` : ""}`,
    [d.enfance ? `enfance : ${nomContenu("enfances", d.enfance, d.genre ?? "")}` : "", d.passe ? `passé : ${nomContenu("passes", d.passe, d.genre ?? "")}` : ""].filter(Boolean).join(" ; "),
    `${comps.join(", ") || "aucune compétence"} (somme ${sommeNiveaux(d.competences)}${dansLeBudget(d) ? "" : ", HORS BUDGET 10 – 16"})`,
    (d.traits ?? []).length ? `traits : ${d.traits.map(t => nomContenu("traits", t)).join(", ")}` : "",
    (d.incapacites ?? []).length ? `INCAPABLE de : ${d.incapacites.join(", ")}` : "",
    (d.equipement ?? []).length ? `sur lui : ${d.equipement.map(e => nomContenu("equipements", e)).join(", ")}` : "",
    texteBrut(graine) ? `histoire : ${couper(texteBrut(graine), 220)}` : ""
  ].filter(Boolean).join(" — ");
}

// Les besoins du groupe, quelle que soit leur forme (tableau, ou objet indexé par tâche) : [{ tache, competence, meilleur,
// couverture, urgence, profil }].
export function listeBesoins(besoins) {
  if (!besoins) return [];
  const liste = Array.isArray(besoins) ? besoins : Array.isArray(besoins.taches) ? besoins.taches
    : Object.entries(besoins).filter(([, b]) => b && typeof b === "object").map(([tache, b]) => ({ tache, ...b }));
  return liste.filter(b => b?.tache || b?.competence);
}
const RANG_COUVERTURE = { manquant: 0, faible: 1, couvert: 2 };
const ordreBesoin = b => (b.urgence ? 0 : 10) + (RANG_COUVERTURE[b.couverture] ?? 1);
// Une ligne par besoin non couvert, les urgences d'abord : « soins : MANQUANT (meilleur 0) — URGENT : blessés sans soigneur —
// profil : infirmière ».
export function lignesBesoins(besoins, { tous = false } = {}) {
  return listeBesoins(besoins).filter(b => tous || b.couverture !== "couvert").sort((a, b) => ordreBesoin(a) - ordreBesoin(b))
    .map(b => `${b.tache ?? b.competence}${b.competence && b.competence !== b.tache ? ` (${libelleCompetence(b.competence).toLowerCase()})` : ""} : `
      + `${String(b.couverture ?? "?").toUpperCase()}${b.meilleur !== undefined ? ` (meilleur niveau ${b.meilleur})` : ""}`
      + `${b.urgence ? ` — URGENT : ${typeof b.urgence === "string" ? b.urgence : "oui"}` : ""}${b.profil ? ` — profil cherché : ${texteBrut(b.profil)}` : ""}`);
}

// Répartition automatique des tâches du jour (§10.3), pour les compagnons et les recrues (jamais un joueur : il choisit la sienne).
// Les besoins non couverts, urgences d'abord, reçoivent chacun le membre libre le plus fort dans leur compétence, sauf s'il en est
// incapable. membres : [{ id, nom, competences, incapacites }]. -> [{ acteurId, nom, tache, raison }]
export function repartirTaches(besoins, membres = []) {
  const libres = [...membres];
  const plan = [];
  for (const b of listeBesoins(besoins).filter(x => x.couverture !== "couvert").sort((a, c) => ordreBesoin(a) - ordreBesoin(c))) {
    const tache = TACHES.includes(b.tache) ? b.tache : null;
    if (!tache || !libres.length) continue;
    const capables = libres.filter(m => !(m.incapacites ?? []).some(i => [tache, b.competence].includes(i)));
    if (!capables.length) continue;
    const niveau = m => niveauDe(m.competences?.[b.competence]);
    const choisi = capables.reduce((meilleur, m) => (niveau(m) > niveau(meilleur) ? m : meilleur), capables[0]);
    libres.splice(libres.indexOf(choisi), 1);
    plan.push({ acteurId: choisi.id, nom: choisi.nom, tache, raison: `${b.couverture ?? "?"}${b.urgence ? ", urgent" : ""}, ${b.competence ?? tache} ${niveau(choisi)}` });
  }
  return plan;
}

// Une recrue proposée (genererRecrue), pour le narrateur : qui, pourquoi là, son prix ou son défaut.
export function resumerRecrue(d = {}, id = "?", options = {}) {
  const prix = d.prix ? (typeof d.prix === "string" ? d.prix : texteBrut(d.prix.texte ?? d.prix.description ?? JSON.stringify(d.prix))) : "";
  return `${resumerTirage(d, id, options)}${d.raison ? ` — pourquoi il est là : ${texteBrut(d.raison)}` : ""}${prix ? ` — SON PRIX : ${prix}` : ""}`;
}

// ------------------------------------------------------------------ véhicules et montures (§9 : équipement à `transport`)
// Le système accepte pour voyager et déménager « pied », « vehicule », « bateau » (génériques) ou la CLÉ d'un équipement du contenu
// qui transporte (contenu().equipements : normalisé par le registre du système en { type: "vehicule" | "monture", terrains, charge,
// places, rapide, allure, carburantParQuart, bruit } ; brut, il garde `transport: { mode, chargeMax, carburantParQuart, terrains,
// bruit }`). Le système ne vérifie pas que le groupe l'a : c'est au MJ (ligne au secret quand personne ne le porte).
export const TRANSPORTS_GENERIQUES = ["pied", "vehicule", "bateau"];
const ALIAS_TRANSPORT = { pied: "pied", "a pied": "pied", marche: "pied", vehicule: "vehicule", bateau: "bateau" };
// Bruit des génériques (logique du système : 0 à pied, 2 sinon) ; +10 % de rencontres en route par point.
const BRUIT_GENERIQUE = { pied: 0, vehicule: 2, bateau: 2 };
const nombreOuNull = v => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const objetOuVide = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
export const estVehiculeContenu = e => Boolean(e && typeof e === "object"
  && (Array.isArray(e.terrains) || (e.transport && typeof e.transport === "object") || e.categorie === "transport"));
// Les propriétés d'un véhicule, normalisé ou brut. -> { cle, nom, mode: "vehicule" | "monture" | "bateau", terrains, charge, places,
// carburantParQuart, bruit, moteur }
export function proprietesVehicule(e) {
  const tr = objetOuVide(e?.transport);
  const norme = Array.isArray(e?.terrains);
  const terrains = [...(norme ? e.terrains : Array.isArray(tr.terrains) ? tr.terrains : [])];
  const carburantParQuart = Number(norme ? e.carburantParQuart : tr.carburantParQuart) || 0;
  const mode = e?.type === "monture" || tr.mode === "pied" ? "monture"
    : tr.mode === "bateau" || (terrains.length && terrains.every(t => t === "mer")) ? "bateau" : "vehicule";
  return { cle: e?.cle ?? "", nom: e?.nom ?? e?.cle ?? "", mode, terrains, charge: Number(norme ? e.charge : tr.chargeMax ?? tr.charge) || 0,
    places: Number(norme ? e.places : tr.places) || 0, carburantParQuart, bruit: Number(norme ? e.bruit : tr.bruit ?? e?.bruit) || 0,
    moteur: carburantParQuart > 0 };
}
export const vehiculesDu = contenu => listeDe(contenu?.equipements).filter(estVehiculeContenu);
// « Scooter (scooter : route, piste ; charge 4 ; 2 places ; carburant 0,25/quart ; bruit 1) ».
export function ligneVehicule(v) {
  const p = v?.terrains ? v : proprietesVehicule(v);
  return `${p.nom} (${[p.cle, p.terrains.join(", ") || "?", `charge ${p.charge}`, p.places ? `${p.places} place(s)` : "",
    p.moteur ? `carburant ${String(p.carburantParQuart).replace(".", ",")}/quart` : "sans carburant", `bruit ${p.bruit}`].filter(Boolean).join(" ; ")})`;
}
// Le transport demandé -> { transport: ce que l'API reçoit (générique ou clé), vehicule: propriétés | null } ; null si inconnu.
// Vide = à pied. Les génériques d'abord (« voiture » est un véhicule du contenu, pas le générique) ; puis un véhicule par clé ou nom.
export function resoudreTransport(contenu, reference) {
  const n = normaliser(reference);
  if (!n) return { transport: "pied", vehicule: null };
  if (ALIAS_TRANSPORT[n]) return { transport: ALIAS_TRANSPORT[n], vehicule: null };
  const vehicules = vehiculesDu(contenu);
  const x = t => normaliser(String(t ?? "").replace(/×/g, "x"));   // « 4x4 » pour « 4×4 »
  const f = trouverFiche(vehicules, reference) ?? vehicules.find(v => x(v.nom) === x(reference) || x(v.cle) === x(reference)) ?? null;
  return f ? { transport: f.cle, vehicule: proprietesVehicule(f) } : null;
}
// Le bruit et le carburant d'un trajet, pour le texte rendu. r : retour de l'API (carburant, bruit, quarts) ; sans carburant rendu
// (déménagement), il est calculé comme le système le fait pour un véhicule : ceil(quarts × carburantParQuart).
export function ligneTransport({ transport = "pied", vehicule = null } = {}, r = {}) {
  const bruit = nombreOuNull(r?.bruit) ?? (vehicule ? vehicule.bruit : BRUIT_GENERIQUE[transport] ?? 0);
  const carburant = nombreOuNull(r?.carburant) ?? (vehicule ? Math.ceil(Math.max(0, Number(r?.quarts) || 0) * vehicule.carburantParQuart) : transport === "pied" ? 0 : null);
  const moyen = vehicule ? `${vehicule.nom}${vehicule.mode === "monture" ? " (monture)" : ""}` : transport === "pied" ? "à pied" : transport;
  return `Transport : ${moyen} ; carburant consommé : ${carburant === null ? "?" : carburant} ; bruit ${bruit}`
    + `${bruit > 0 ? ` (rencontres en route +${bruit * 10} %, ça s'entend de loin)` : " (silencieux)"}.`;
}
// Les objets d'acteurs qui sont ce véhicule (par clé, sinon par nom).
export function portentVehicule(acteurs = [], vehicule) {
  if (!vehicule) return [];
  const nn = normaliser(vehicule.nom);
  return acteurs.filter(a => [...(a?.items ?? [])].some(i => (i?.system?.cle && i.system.cle === vehicule.cle) || (nn && normaliser(i?.name) === nn)));
}
