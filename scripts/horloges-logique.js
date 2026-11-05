// Horloges, jauges et réputations : la logique pure, sans Foundry (essais/horloges.test.mjs). Le réglage monde « horloges »
// (reglages.js) est un tableau d'éléments { id, nom, type, valeur, max, visible, faction, notes, paliers } (en clair, les seuls
// visibles, sans leurs notes ; la liste complète est chiffrée au coffre du Carnet : secrets-logique.js, coffre.js) :
// - horloge : max segments (4 à 12, à la façon de Blades in the Dark) ; elle se remplit puis « sonne » ;
// - jauge : compteur de 0 à max avec des seuils nommés (l'Exposition en 40k : plus elle monte, plus l'équipe s'est fait remarquer) ;
// - réputation : points auprès d'une faction, de -max à +max, lus en paliers nommés (Haï … Exalté, PALIERS_REPUTATION).
// paliers : [{ nom, min }] triés par min croissant ; seuils d'une jauge (aucun atteint sous le premier), paliers d'une
// réputation (sous le premier min, on reste au premier palier). Une horloge n'en a pas.

export const TYPES = ["horloge", "jauge", "reputation"];
export const SEGMENTS_MIN = 4;
export const SEGMENTS_MAX = 12;
export const SEGMENTS_DEFAUT = 6;
export const JAUGE_MAX = 100;
export const JAUGE_DEFAUT = 10;
export const REPUTATION_DEFAUT = 100;
export const REPUTATION_MAX = 1000;
// Paliers de réputation (bornes -100 à +100 par défaut) : min = premier point du palier.
// Haï ≤ -51 · Hostile -50 à -21 · Inamical -20 à -6 · Neutre -5 à +5 · Amical +6 à +20 · Honoré +21 à +50 · Révéré +51 à +80 ·
// Exalté ≥ +81. Barème conseillé à l'IA : petit service +3 à +5, grand service +10 à +15, affront -5, trahison -20 à -30 ;
// on quitte Neutre en un ou deux gestes, on n'atteint Exalté qu'après une campagne de services.
export const PALIERS_REPUTATION = [
  { nom: "Haï", min: -100 },
  { nom: "Hostile", min: -50 },
  { nom: "Inamical", min: -20 },
  { nom: "Neutre", min: -5 },
  { nom: "Amical", min: 6 },
  { nom: "Honoré", min: 21 },
  { nom: "Révéré", min: 51 },
  { nom: "Exalté", min: 81 }
];
// Lignes du résumé donné à l'IA à chaque tour (contexte.js) : au-delà, « … et N autres ».
export const MAX_RESUME = 8;

// Aux Veillées, pas d'horloges : chaque partie est neuve et le système lakour-loups tient son propre état.
export const horlogesDisponibles = systeme => systeme !== "lakour-loups";

const entierOu = (v, defaut) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.round(Number(v)) : defaut);
const borner = (v, min, max) => Math.min(max, Math.max(min, v));
const texte = v => (typeof v === "string" ? v.trim() : "");

// Identifiant lisible tiré du nom (« Rituel du Chœur » → « rituel-du-choeur »), unique parmi ceux déjà pris.
export function idDepuisNom(nom, pris = []) {
  const base = String(nom ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "horloge";
  const ids = new Set(pris);
  let id = base;
  for (let i = 2; ids.has(id); i++) id = `${base}-${i}`;
  return id;
}

// Paliers valides ([{ nom, min }] avec un nom et un nombre), triés ; null si la liste donnée est vide ou inutilisable.
export function paliersValides(paliers) {
  if (!Array.isArray(paliers)) return null;
  const ok = paliers.filter(p => texte(p?.nom) && Number.isFinite(Number(p?.min)))
    .map(p => ({ nom: texte(p.nom), min: Math.round(Number(p.min)) }))
    .sort((a, b) => a.min - b.min);
  return ok.length ? ok : null;
}

// Bornes de la valeur : 0..max (horloge, jauge), -max..+max (réputation).
export const bornes = el => ({ min: el.type === "reputation" ? -el.max : 0, max: el.max });

function maxDuType(type, max) {
  if (type === "horloge") return borner(entierOu(max, SEGMENTS_DEFAUT) || SEGMENTS_DEFAUT, SEGMENTS_MIN, SEGMENTS_MAX);
  if (type === "jauge") return borner(entierOu(max, JAUGE_DEFAUT) || JAUGE_DEFAUT, 1, JAUGE_MAX);
  return borner(entierOu(max, REPUTATION_DEFAUT) || REPUTATION_DEFAUT, 1, REPUTATION_MAX);
}

// Un élément complet et borné à partir d'une définition partielle (API assurer, outil « creer »). Lève une erreur sans nom
// ni identifiant. pris : identifiants déjà utilisés (un nom sans id reçoit un id libre).
export function normaliser(def = {}, pris = []) {
  const type = TYPES.includes(def.type) ? def.type : "horloge";
  const nom = texte(def.nom) || texte(def.id);
  if (!nom) throw new Error("une horloge, une jauge ou une réputation a besoin d'un nom");
  const id = texte(def.id) || idDepuisNom(nom, pris);
  const max = maxDuType(type, def.max);
  const paliers = type === "horloge" ? [] : paliersValides(def.paliers) ?? (type === "reputation" ? PALIERS_REPUTATION.map(p => ({ ...p })) : []);
  const el = { id, nom, type, valeur: 0, max, visible: Boolean(def.visible), faction: texte(def.faction), notes: texte(def.notes), paliers };
  const b = bornes(el);
  el.valeur = borner(entierOu(def.valeur, 0), b.min, b.max);
  return el;
}

// Palier atteint : réputation, le dernier dont le min est atteint (le premier sinon) ; jauge, le dernier seuil atteint
// (null sous le premier) ; horloge : null.
export function palierDe(el, valeur = el.valeur) {
  if (el.type === "horloge" || !el.paliers?.length) return null;
  let atteint = el.type === "reputation" ? el.paliers[0] : null;
  for (const p of el.paliers) if (valeur >= p.min) atteint = p;
  return atteint;
}

// Le palier suivant (au-dessus de la valeur), pour dire à l'IA ce qui vient.
export const palierSuivant = (el, valeur = el.valeur) => (el.type === "horloge" ? null : el.paliers?.find(p => p.min > valeur) ?? null);

// Nouvelle valeur (bornée) et ce qu'elle déclenche :
// - { type: "sonne" } : l'horloge vient de se remplir ;
// - { type: "seuil", nom, min, sens: "monte" | "descend" } : une jauge franchit un seuil, dans un sens ou dans l'autre ;
// - { type: "pleine" } : une jauge atteint son maximum (sauf si un seuil à ce niveau vient déjà d'être franchi) ;
// - { type: "palier", avant, apres, sens } : une réputation change de palier (un seul événement, même si elle en saute plusieurs).
export function appliquer(el, nouvelle) {
  const b = bornes(el);
  const avant = el.valeur;
  const apres = borner(entierOu(nouvelle, avant), b.min, b.max);
  const element = { ...el, valeur: apres };
  const evenements = [];
  if (el.type === "horloge") {
    if (avant < el.max && apres >= el.max) evenements.push({ type: "sonne" });
  } else if (el.type === "jauge") {
    for (const s of el.paliers ?? []) {
      if (avant < s.min && apres >= s.min) evenements.push({ type: "seuil", nom: s.nom, min: s.min, sens: "monte" });
      else if (apres < s.min && avant >= s.min) evenements.push({ type: "seuil", nom: s.nom, min: s.min, sens: "descend" });
    }
    if (avant < el.max && apres >= el.max && !evenements.some(e => e.sens === "monte" && e.min >= el.max)) evenements.push({ type: "pleine" });
  } else {
    const p1 = palierDe(el, avant)?.nom, p2 = palierDe(el, apres)?.nom;
    if (p1 !== p2) evenements.push({ type: "palier", avant: p1, apres: p2, sens: apres > avant ? "monte" : "descend" });
  }
  return { element, evenements };
}

// Avancer de n (négatif : reculer).
export const avancer = (el, n = 1) => appliquer(el, el.valeur + entierOu(n, 1));

// Un élément par son identifiant, sinon par son nom (casse et accents ignorés), sinon par l'identifiant tiré du nom donné ;
// enfin une réputation par sa faction (« horde » ou « Kirin Tor » trouvent rep-horde, rep-kirin-tor).
export function trouver(liste, ref) {
  const r = texte(ref);
  if (!r) return null;
  const pli = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return liste.find(e => e.id === r) ?? liste.find(e => pli(e.nom) === pli(r)) ?? liste.find(e => e.id === idDepuisNom(r))
    ?? liste.find(e => idDepuisNom(e.nom) === idDepuisNom(r))   // un nom écrit autrement (« choeur » pour « Chœur »), id au hasard
    ?? liste.find(e => e.type === "reputation" && e.id === `rep-${idDepuisNom(r)}`)
    ?? liste.find(e => e.type === "reputation" && e.faction && pli(e.faction) === pli(r)) ?? null;
}

const LIBELLES = { horloge: "Horloge", jauge: "Jauge", reputation: "Réputation" };
const signe = n => (n > 0 ? `+${n}` : String(n));

// Textes vus des joueurs (carte au chat, Carnet) : « t(cle, francais, donnees) » les traduit (horloges.js passe texteJoueurs,
// lang/*.json, LAKOUR_MJIA.Horloges.*) ; par défaut, le français rempli de ses {paramètres} (essais, texte pour l'IA).
export const enFrancais = (cle, francais, donnees = {}) => String(francais).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(donnees, k) ? String(donnees[k]) : m));
// Les paliers de réputation livrés (PALIERS_REPUTATION, et ceux de même nom des modules des mondes) ont un nom traduit ; un
// palier nommé autrement (par le MJ, l'IA ou un module) garde son nom.
const CLES_PALIERS = { "Haï": "Hai", Hostile: "Hostile", Inamical: "Inamical", Neutre: "Neutre", Amical: "Amical", "Honoré": "Honore", "Révéré": "Revere", "Exalté": "Exalte" };

// Les libellés des modules de contenu (api.horloges.libelles) : nom français d'un élément, d'un seuil ou d'une faction -> clé
// i18n du module (ex. « Exposition » -> « LAKOUR40K.Jauges.Exposition »). Les données gardent le nom français (c'est lui que
// l'IA, les outils et les modules connaissent) ; seul l'affichage des joueurs (t = texteJoueurs) le traduit. Le texte pour
// l'IA (t par défaut : enFrancais) reste en français. Un nom absent du registre s'affiche tel quel.
const LIBELLES_MONDE = new Map();
// Ajoute (ou remplace) des libellés : { "Exposition": "LAKOUR40K.Jauges.Exposition", … }. -> le nombre de libellés retenus.
export function enregistrerLibelles(table = {}) {
  let n = 0;
  for (const [francais, cle] of Object.entries(table && typeof table === "object" ? table : {})) {
    const nom = String(francais ?? "").trim();
    if (!nom || typeof cle !== "string" || !cle.trim()) continue;
    LIBELLES_MONDE.set(nom, cle.trim());
    n++;
  }
  return n;
}
export const libellesEnregistres = () => Object.fromEntries(LIBELLES_MONDE);
export const oublierLibelles = () => LIBELLES_MONDE.clear();   // essais
// Un nom français tel que le voient les joueurs (traduit s'il est au registre).
export const libelle = (nom, t = enFrancais) => (LIBELLES_MONDE.has(nom) ? t(LIBELLES_MONDE.get(nom), nom) : nom);
export const nomPalier = (nom, t = enFrancais) => (CLES_PALIERS[nom] ? t(`LAKOUR_MJIA.Horloges.Paliers.${CLES_PALIERS[nom]}`, nom) : libelle(nom, t));
// Le nom d'un élément (horloge, jauge, réputation) tel que le voient les joueurs ; sa faction de même.
export const nomElement = (el, t = enFrancais) => libelle(el?.nom ?? "", t);
export const factionElement = (el, t = enFrancais) => (el?.faction ? libelle(el.faction, t) : "");

// Phrase d'un événement, telle qu'elle paraît dans le chat (sans les notes du MJ, qui peuvent être secrètes).
export function texteEvenement(el, ev, t = enFrancais) {
  const faction = factionElement(el, t);
  const d = { nom: nomElement(el, t), faction: faction ? ` (${faction})` : "", max: el.max, valeur: el.valeur, seuil: ev.nom ? nomPalier(ev.nom, t) : "" };
  const T = (cle, francais, plus = {}) => t(`LAKOUR_MJIA.Horloges.Evenements.${cle}`, francais, { ...d, ...plus });
  if (ev.type === "sonne") return T("Sonne", "L'horloge « {nom} »{faction} est pleine ({max}/{max}) : elle sonne !");
  if (ev.type === "pleine") return T("Pleine", "La jauge « {nom} »{faction} est au maximum ({max}/{max}).");
  if (ev.type === "seuil") {
    return ev.sens === "monte"
      ? T("SeuilMonte", "La jauge « {nom} »{faction} franchit le seuil « {seuil} » ({valeur}/{max}).")
      : T("SeuilDescend", "La jauge « {nom} »{faction} redescend sous le seuil « {seuil} » ({valeur}/{max}).");
  }
  if (ev.type === "palier") {
    return T("Palier", "Réputation auprès de {qui} : {avant} → {apres} ({points}).",
      { qui: faction || d.nom, avant: nomPalier(ev.avant, t), apres: nomPalier(ev.apres, t), points: signe(el.valeur) });
  }
  return "";
}

// Ce que l'IA reçoit : les événements, les notes du MJ, et la consigne d'en tirer une conséquence.
export function texteEvenementsPourIA(el, evenements) {
  if (!evenements.length) return "";
  const lignes = evenements.map(ev => `⏳ ${texteEvenement(el, ev)}`);
  if (el.notes) lignes.push(`  Notes : ${el.notes}`);
  lignes.push(`  → Tires-en une conséquence concrète dans le récit (maintenant ou à la prochaine scène)${el.type === "horloge"
    ? ", puis remets l'horloge à zéro (regler), retire-la ou crée la suivante" : ""}.`);
  return lignes.join("\n");
}

// Une ligne de résumé pour l'IA (contexte.js, outil « lister »).
export function ligneResume(el) {
  const cachee = el.visible ? "" : ", cachée aux joueurs";
  const tete = `${LIBELLES[el.type]} « ${el.nom} » [${el.id}]${el.faction ? ` (faction ${el.faction})` : ""}`;
  if (el.type === "horloge") return `${tete} : ${el.valeur}/${el.max} segments${el.valeur >= el.max ? ", PLEINE" : ""}${cachee}`;
  const p = palierDe(el), s = palierSuivant(el);
  if (el.type === "jauge") {
    return `${tete} : ${el.valeur}/${el.max}${p ? ` — seuil « ${p.nom} » atteint` : ""}${s ? ` ; prochain « ${s.nom} » à ${s.min}` : ""}${cachee}`;
  }
  return `${tete} : ${signe(el.valeur)}, ${p?.nom ?? "?"}${s ? ` ; ${s.nom} à ${signe(s.min)}` : ""}${cachee}`;
}

// Une ligne pour les joueurs (carte au chat) : ni identifiant, ni notes.
export function ligneJoueurs(el, t = enFrancais) {
  const T = (cle, francais, d) => t(`LAKOUR_MJIA.Horloges.Lignes.${cle}`, francais, d);
  if (el.type === "horloge") return T("Horloge", "Horloge : {valeur}/{max}", { valeur: el.valeur, max: el.max });
  if (el.type === "jauge") {
    return T("Jauge", "Jauge : {valeur}/{max}{palier}", { valeur: el.valeur, max: el.max, palier: palierDe(el) ? ` (${nomPalier(palierDe(el).nom, t)})` : "" });
  }
  return T("Reputation", "Réputation : {palier} ({points})", { palier: nomPalier(palierDe(el)?.nom ?? "?", t), points: signe(el.valeur) });
}

// Résumé borné (MAX_RESUME lignes) : les horloges d'abord (ce qui menace), puis les jauges, puis les réputations.
export function resumerPourIA(liste, max = MAX_RESUME) {
  if (!liste?.length) return [];
  const tries = [...liste].sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
  const lignes = tries.slice(0, max).map(el => `- ${ligneResume(el)}`);
  if (tries.length > max) lignes.push(`- … et ${tries.length - max} autre(s) (outil horloge, action « lister »).`);
  return lignes;
}

// ------------------------------------------------------------------ affichage (Carnet de campagne, onglet Horloges)

const arrondi = n => Math.round(n * 100) / 100;

// Camembert SVG d'une horloge : max secteurs, les valeur premiers pleins, dans le sens des aiguilles depuis midi.
export function camembertSVG(valeur, max, taille = 72) {
  const r = taille / 2 - 2, c = taille / 2;
  const point = a => `${arrondi(c + r * Math.cos(a))} ${arrondi(c + r * Math.sin(a))}`;
  const secteurs = [];
  for (let i = 0; i < max; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / max, a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / max;
    const grand = a1 - a0 > Math.PI ? 1 : 0;
    secteurs.push(`<path class="${i < valeur ? "plein" : "vide"}" d="M ${c} ${c} L ${point(a0)} A ${arrondi(r)} ${arrondi(r)} 0 ${grand} 1 ${point(a1)} Z"/>`);
  }
  return `<svg class="lakour-mjia-camembert" viewBox="0 0 ${taille} ${taille}" width="${taille}" height="${taille}" role="img" `
    + `aria-label="${valeur}/${max}">${secteurs.join("")}</svg>`;
}

const pourcent = (v, min, max) => (max > min ? arrondi(((v - min) / (max - min)) * 100) : 0);

// Ce que montre la fenêtre : les joueurs ne voient que les éléments visibles ; le MJ voit tout.
export function vuePourFenetre(liste, { mj = false, t = enFrancais } = {}) {
  return (liste ?? []).filter(el => mj || el.visible).map(el => {
    const b = bornes(el);
    const vue = { id: el.id, nom: nomElement(el, t), type: el.type, faction: factionElement(el, t), valeur: el.valeur, max: el.max, visible: el.visible,
      notes: mj ? el.notes : "", [el.type]: true };
    if (el.type === "horloge") return { ...vue, svg: camembertSVG(el.valeur, el.max), plein: el.valeur >= el.max };
    const p = palierDe(el);
    vue.palier = p ? nomPalier(p.nom, t) : "";
    vue.pct = pourcent(el.valeur, b.min, b.max);
    vue.reperes = (el.paliers ?? []).filter(s => s.min > b.min && s.min <= b.max).map(s => ({ nom: nomPalier(s.nom, t), min: s.min, pct: pourcent(s.min, b.min, b.max) }));
    if (el.type === "reputation") { vue.affiche = signe(el.valeur); vue.zero = pourcent(0, b.min, b.max); }
    return vue;
  });
}
