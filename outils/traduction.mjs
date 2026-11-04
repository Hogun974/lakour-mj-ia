// Traduction des documents des compendiums d'un module de contenu La Kour (lakour-40k, lakour-warcraft, lakour-veillees,
// lakour-fenoir) : outil COMMUN, importé par chaque fabricant (outils/fabriquer-<monde>.mjs). Foundry ne localise pas un
// compendium : le fabricant produit un SECOND module « <id>-en » à partir des mêmes sources et d'un dictionnaire de
// traduction (contenu/en/<pack>.json, un fichier par pack), avec les mêmes _id de documents.
//
// - extraire(documents, options) -> { squelette, tout } : pour chaque document (clé « pack/_id », nom français en « _nom »),
//   les champs traduisibles sous la forme { "<chemin>": { fr, en: "" } }. Un même texte français qui revient (objet embarqué
//   dans un PNJ, nom d'une pièce repris par ses zones…) n'est listé qu'une fois (première occurrence) : la MÉMOIRE de
//   traduction (même français -> même anglais) comble les autres à l'application. « tout » garde chaque occurrence.
// - fusionner(squelette, existant, tout) : une relance de l'extraction conserve les traductions déjà faites ; une entrée
//   dont le français a changé (la source a bougé) garde son ancien anglais sous « enAncien » et repasse à « en: "" ».
// - appliquer(documents, dictionnaire, { deId, versId }) -> { documents, rapport } : documents traduits (anglais non vide
//   appliqué, sinon le français reste et l'entrée est comptée manquante), uuid, chemins d'images et portées de drapeaux
//   récrits de deId vers versId, noms des références (talents d'un rôle, options d'un choix, résultats de table de type
//   document) réalignés sur le nom traduit de leur cible. Rapport { traduits, parMemoire, manquants, obsoletes, erreurs }.
// - ecartsBalises(fr, en) : balises HTML, liens @UUID[...], jets [[/roll …]], {…} et %…% du français qui manquent dans
//   l'anglais (ou l'inverse) : une entrée en écart n'est pas appliquée et figure dans rapport.erreurs.
// Chemins : « pages.<id>.text.content » pour une collection embarquée dont les éléments ont un _id, « plan.pieces.3.nom »
// (indice) sinon. Les drapeaux de nos modules sont lus sous « flags.<module>. ». Voir docs/traduction.md.

// ---------------------------------------------------------------- Règles par défaut

// Clés jamais extraites (identifiants, images, formules, scripts, couleurs…), à toute profondeur.
export const CLES_EXCLUES = new Set([
  "_id", "_key", "_stats", "img", "src", "path", "uuid", "documentId", "documentUuid", "entryId", "pageId", "id", "idType",
  "type", "documentType", "originalType", "author", "color", "textColor", "fillColor", "strokeColor", "formula", "trigger",
  "script", "activateScript", "hideScript", "font", "fontFamily", "initialLevel", "cle", "installer", "version", "sorting"
]);

// Une chaîne est un texte à traduire si elle contient une lettre et ressemble à du texte (espace, lettre accentuée, majuscule
// initiale ou HTML) sans être un chemin, un uuid, une couleur, un identifiant Foundry ou une formule de dés.
const MOTIFS_TECHNIQUES = [/^modules\//, /^systems\//, /^icons\//, /^Compendium\./, /^[A-Za-z]+\.[A-Za-z0-9]{16}$/, /^#[0-9a-fA-F]{3,8}$/,
  /^[A-Za-z0-9]{16}$/, /^\d*d\d+([+-]\d+)?$/, /^return\b/, /^https?:\/\//];
export function estTexte(valeur) {
  if (typeof valeur !== "string" || !valeur.trim() || !/\p{L}/u.test(valeur)) return false;
  if (MOTIFS_TECHNIQUES.some(m => m.test(valeur))) return false;
  return /\s/.test(valeur) || /[^\x00-\x7F]/.test(valeur) || /^\p{Lu}/u.test(valeur) || valeur.startsWith("<");
}

// Un objet « référence » (uuid / documentId / documentUuid) : son « name » est celui de sa cible, réaligné à l'application.
const estReference = o => o && typeof o === "object" && !Array.isArray(o) && ("uuid" in o || "documentId" in o || "documentUuid" in o);

const OPTIONS_PAR_DEFAUT = {
  module: null,          // portée des drapeaux de nos modules (flags.<module>.…) ; null : tous les drapeaux sont ignorés
  exclure: [],           // clés supplémentaires jamais extraites
  champs: [],            // chemins (motifs, « [] » = chaque élément) toujours extraits s'ils portent une chaîne non vide
  heuristique: true,     // en plus des champs : toute chaîne « texte » (estTexte) hors clés exclues
  ignorerPacks: []       // packs non extraits (ex. « aventures », dont les textes sont engendrés par le fabricant)
};

// ---------------------------------------------------------------- Parcours des documents

const segment = (valeur, i) => (valeur && typeof valeur === "object" && typeof valeur._id === "string" ? valeur._id : String(i));

// Toutes les feuilles (chaînes) d'un document : [{ chemin, motif, valeur, parent, cle }]. motif = chemin avec « [] » pour les
// tableaux (comparé aux « champs » explicites), chemin = chemin stable (identifiants des éléments embarqués).
function feuilles(doc, module) {
  const resultat = [];
  const parcourir = (valeur, chemin, motif, parent, cle) => {
    if (Array.isArray(valeur)) { valeur.forEach((v, i) => parcourir(v, `${chemin}.${segment(v, i)}`, `${motif}[]`, valeur, i)); return; }
    if (valeur && typeof valeur === "object") {
      for (const [k, v] of Object.entries(valeur)) {
        if (chemin === "flags" && k !== module) continue; // drapeaux des autres modules (core, lakour-mj-ia…) : jamais
        parcourir(v, chemin ? `${chemin}.${k}` : k, motif ? `${motif}.${k}` : k, valeur, k);
      }
      return;
    }
    if (typeof valeur === "string") resultat.push({ chemin, motif, valeur, parent, cle });
  };
  parcourir(doc, "", "", null, null);
  return resultat;
}

const motifEnRegex = m => new RegExp(`^${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\[\\\]/g, "\\[\\]").replace(/\\\*/g, "[^.]+")}$`);

// Feuilles traduisibles d'un document selon les options.
function traduisibles(doc, options) {
  const o = { ...OPTIONS_PAR_DEFAUT, ...options };
  const exclues = new Set([...CLES_EXCLUES, ...o.exclure]);
  const explicites = o.champs.map(motifEnRegex);
  return feuilles(doc, o.module).filter(f => {
    if (!f.valeur.trim()) return false;
    if (explicites.some(r => r.test(f.motif))) return true;
    if (!o.heuristique) return false;
    // Élément d'un tableau de chaînes (skills.list[]…) : la clé qui compte est celle du tableau.
    const nomCle = typeof f.cle === "number" ? f.motif.split(".").at(-1).replace("[]", "") : f.cle;
    if (exclues.has(nomCle)) return false;
    if (f.cle === "name" && estReference(f.parent)) return false;
    return estTexte(f.valeur);
  });
}

// Lecture / écriture d'un chemin stable (segments : clé d'objet, _id d'un élément de tableau ou indice).
function situer(doc, chemin) {
  const segments = chemin.split(".");
  let courant = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const s = segments[i];
    if (Array.isArray(courant)) courant = courant.find(e => e && typeof e === "object" && e._id === s) ?? courant[Number(s)];
    else courant = courant?.[s];
    if (courant === undefined || courant === null) return null;
  }
  const dernier = segments.at(-1);
  if (Array.isArray(courant)) {
    const i = courant.findIndex(e => e && typeof e === "object" && e._id === dernier);
    return { parent: courant, cle: i >= 0 ? i : Number(dernier) };
  }
  return courant && typeof courant === "object" ? { parent: courant, cle: dernier } : null;
}
export const lireChemin = (doc, chemin) => { const s = situer(doc, chemin); return s ? s.parent[s.cle] : undefined; };
const ecrireChemin = (doc, chemin, valeur) => { const s = situer(doc, chemin); if (s) s.parent[s.cle] = valeur; };

// ---------------------------------------------------------------- Extraction

// documents : [{ pack, doc }] (sortie de fabriquer() d'un fabricant). Rend :
// - squelette : { [pack]: { "pack/_id": { _nom, "<chemin>": { fr, en: "" } } } } (un fichier par pack), sans les textes
//   français déjà listés ailleurs (première occurrence seulement) ;
// - tout : même forme, avec chaque occurrence (sert à fusionner et à l'application).
export function extraire(documents, options = {}) {
  const o = { ...OPTIONS_PAR_DEFAUT, ...options };
  const squelette = {}, tout = {};
  const vus = new Set();
  for (const { pack, doc } of documents) {
    if (o.ignorerPacks.includes(pack)) continue;
    const cle = `${pack}/${doc._id}`;
    const entreeTout = { _nom: doc.name ?? "" }, entree = { _nom: doc.name ?? "" };
    for (const f of traduisibles(doc, o)) {
      entreeTout[f.chemin] = { fr: f.valeur, en: "" };
      // Le nom du document est toujours dans sa propre entrée (c'est là qu'un traducteur le cherche) ; le reste n'est listé
      // qu'à sa première occurrence.
      if (vus.has(f.valeur) && f.chemin !== "name") continue;
      vus.add(f.valeur);
      entree[f.chemin] = { fr: f.valeur, en: "" };
    }
    (tout[pack] ??= {})[cle] = entreeTout;
    if (Object.keys(entree).length > 1) (squelette[pack] ??= {})[cle] = entree;
  }
  return { squelette, tout };
}

// ---------------------------------------------------------------- Fusion

// squelette, existant, tout : dictionnaires d'UN pack ({ "pack/_id": { … } }). Rend { dictionnaire, rapport }.
// - une entrée du squelette absente de l'existant arrive avec en: "" ;
// - une entrée existante dont le français est inchangé garde son anglais ;
// - une entrée existante dont le français a changé (dans « tout ») passe à en: "", l'ancien anglais sous enAncien (à vérifier) ;
// - une entrée existante traduite mais que le squelette ne reliste plus (doublon) reste, tant que son chemin existe encore ;
// - une entrée dont le document ou le chemin n'existe plus est retirée (comptée « supprimees »).
export function fusionner(squelette, existant = {}, tout = squelette) {
  const dictionnaire = {};
  const rapport = { nouvelles: 0, conservees: 0, obsoletes: [], supprimees: [] };
  const cles = new Set([...Object.keys(squelette), ...Object.keys(existant)]);
  for (const cle of [...cles].sort()) {
    const source = tout[cle];
    if (!source) { rapport.supprimees.push(cle); continue; }
    const neuf = { _nom: source._nom ?? squelette[cle]?._nom ?? "" };
    const chemins = new Set([...Object.keys(squelette[cle] ?? {}), ...Object.keys(existant[cle] ?? {})].filter(c => !c.startsWith("_")));
    for (const chemin of chemins) {
      const ancienne = existant[cle]?.[chemin];
      const fr = source[chemin]?.fr;
      if (fr === undefined) { rapport.supprimees.push(`${cle}:${chemin}`); continue; }
      if (!ancienne) { neuf[chemin] = { fr, en: "" }; rapport.nouvelles++; continue; }
      if (!(chemin in (squelette[cle] ?? {})) && !ancienne.en && !ancienne.enAncien) continue; // doublon jamais traduit : inutile
      if (ancienne.fr === fr) {
        neuf[chemin] = { fr, en: ancienne.en ?? "", ...(ancienne.enAncien ? { enAncien: ancienne.enAncien } : {}) };
        rapport.conservees++;
      } else {
        neuf[chemin] = { fr, en: "", enAncien: ancienne.en || ancienne.enAncien || "" };
        if (!neuf[chemin].enAncien) delete neuf[chemin].enAncien;
        rapport.obsoletes.push(`${cle}:${chemin}`);
      }
    }
    if (Object.keys(neuf).length > 1) dictionnaire[cle] = neuf;
  }
  return { dictionnaire, rapport };
}

// ---------------------------------------------------------------- Vérification des balises et des liens

const echapperRegex = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Marqueurs d'un texte, à retrouver tels quels dans sa traduction : balises (nom, fermante ou non), src/href, liens @UUID,
// jets [[…]] (sans leur libellé « #… »), {…} hors libellé de lien, %…%.
export function marqueurs(texte) {
  const t = String(texte ?? "");
  const liste = [];
  for (const m of t.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    liste.push(`<${m[1]}${m[2].toLowerCase()}>`);
    for (const a of m[3].matchAll(/\b(src|href)\s*=\s*"([^"]*)"/g)) liste.push(`${a[1]}=${a[2]}`);
  }
  for (const m of t.matchAll(/@UUID\[([^\]]+)\]/g)) liste.push(`@UUID[${m[1]}]`);
  for (const m of t.matchAll(/\[\[([^\]]*)\]\]/g)) liste.push(`[[${m[1].replace(/\s*#.*$/, "")}]]`);
  for (const m of t.matchAll(/(^|[^\]])(\{[A-Za-z_][\w.]*\})/g)) liste.push(m[2]);
  for (const m of t.matchAll(/%[A-Za-z_][\w.]*%/g)) liste.push(m[0]);
  return liste.sort();
}

// Écarts entre les marqueurs du français et ceux de l'anglais : [] si tout concorde.
export function ecartsBalises(fr, en) {
  const compter = liste => liste.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const a = compter(marqueurs(fr)), b = compter(marqueurs(en));
  const ecarts = [];
  for (const [m, n] of a) if ((b.get(m) ?? 0) !== n) ecarts.push(`${m} : ${n} en français, ${b.get(m) ?? 0} en anglais`);
  for (const [m, n] of b) if (!a.has(m)) ecarts.push(`${m} : absent du français, ${n} en anglais`);
  return ecarts;
}

// ---------------------------------------------------------------- Application

// Récrit un document d'un module vers son double : « Compendium.<de>. » -> « Compendium.<vers>. », « modules/<de>/ » ->
// « modules/<vers>/ », et la portée de drapeaux « <de> » renommée « <vers> », à toute profondeur.
export function recrireIdentifiant(valeur, deId, versId) {
  if (!deId || !versId || deId === versId) return valeur;
  const compendium = new RegExp(`Compendium\\.${echapperRegex(deId)}\\.`, "g");
  const chemin = new RegExp(`modules/${echapperRegex(deId)}/`, "g");
  const recrire = v => {
    if (typeof v === "string") return v.replace(compendium, `Compendium.${versId}.`).replace(chemin, `modules/${versId}/`);
    if (Array.isArray(v)) return v.map(recrire);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === deId ? versId : k, recrire(x)]));
    return v;
  };
  return recrire(valeur);
}

const idDeUuid = uuid => (typeof uuid === "string" ? /([A-Za-z0-9]{16})$/.exec(uuid)?.[1] ?? null : null);

// Les « name » des références (uuid / documentId / documentUuid) prennent le nom (traduit) de leur cible, quand elle est
// dans les documents.
function realignerNoms(docs) {
  const noms = new Map();
  for (const { doc } of docs) { if (doc?._id && typeof doc.name === "string") noms.set(doc._id, doc.name); }
  let n = 0;
  const parcourir = v => {
    if (Array.isArray(v)) { v.forEach(parcourir); return; }
    if (!v || typeof v !== "object") return;
    if (estReference(v) && typeof v.name === "string") {
      const id = idDeUuid(v.uuid ?? v.documentId ?? v.documentUuid);
      if (id && noms.has(id) && v.name !== noms.get(id)) { v.name = noms.get(id); n++; }
    }
    Object.values(v).forEach(parcourir);
  };
  for (const { doc } of docs) parcourir(doc);
  return n;
}

// documents : [{ pack, doc, … }] ; dictionnaire : union des fichiers contenu/en/<pack>.json ({ "pack/_id": { … } }) ;
// options : { deId, versId, memoire = true, ...options d'extraction } (deId/versId : récriture des uuid, chemins et drapeaux ;
// sans eux, les documents sont seulement traduits). Rend { documents (copies), rapport }.
// rapport : { traduits, parMemoire, manquants: [cle:chemin], obsoletes: [cle:chemin], erreurs: [{ cle, chemin, ecarts }],
//             parPack: { [pack]: { traduits, parMemoire, manquants, obsoletes, erreurs } }, nomsRealignes }.
export function appliquer(documents, dictionnaire = {}, options = {}) {
  const { deId = null, versId = null, memoire: avecMemoire = true, ...extraction } = options;
  const o = { ...OPTIONS_PAR_DEFAUT, ...extraction };
  // Mémoire : même français -> même anglais, depuis toute entrée traduite et à jour (fr inchangé, vérifié à l'usage).
  const memoire = new Map();
  if (avecMemoire) {
    for (const entree of Object.values(dictionnaire)) {
      for (const [chemin, t] of Object.entries(entree)) {
        if (!chemin.startsWith("_") && t?.en && t.fr && !memoire.has(t.fr) && !ecartsBalises(t.fr, t.en).length) memoire.set(t.fr, t.en);
      }
    }
  }
  const rapport = { traduits: 0, parMemoire: 0, manquants: [], obsoletes: [], erreurs: [], parPack: {}, nomsRealignes: 0 };
  const copies = documents.map(d => ({ ...d, doc: structuredClone(d.doc) }));
  for (const { pack, doc } of copies) {
    const p = (rapport.parPack[pack] ??= { traduits: 0, parMemoire: 0, manquants: 0, obsoletes: 0, erreurs: 0 });
    if (o.ignorerPacks.includes(pack)) continue;
    const cle = `${pack}/${doc._id}`;
    const entree = dictionnaire[cle] ?? {};
    // Chemins à traiter : ceux de l'extraction, plus ceux que le dictionnaire nomme explicitement (ajouts manuels).
    const chemins = new Map(traduisibles(doc, o).map(f => [f.chemin, f.valeur]));
    for (const chemin of Object.keys(entree)) if (!chemin.startsWith("_") && !chemins.has(chemin)) {
      const v = lireChemin(doc, chemin);
      if (typeof v === "string") chemins.set(chemin, v);
    }
    for (const [chemin, fr] of chemins) {
      const t = entree[chemin];
      let en = null, source = null;
      if (t?.en) {
        if (t.fr !== fr) { rapport.obsoletes.push(`${cle}:${chemin}`); p.obsoletes++; }
        else { en = t.en; source = "direct"; }
      }
      if (en === null && memoire.has(fr)) { en = memoire.get(fr); source = "memoire"; }
      if (en === null) { rapport.manquants.push(`${cle}:${chemin}`); p.manquants++; continue; }
      const ecarts = ecartsBalises(fr, en);
      if (ecarts.length) { rapport.erreurs.push({ cle, chemin, ecarts }); p.erreurs++; rapport.manquants.push(`${cle}:${chemin}`); p.manquants++; continue; }
      ecrireChemin(doc, chemin, en);
      if (source === "direct") { rapport.traduits++; p.traduits++; } else { rapport.parMemoire++; p.parMemoire++; }
    }
  }
  rapport.nomsRealignes = realignerNoms(copies);
  const finaux = deId && versId ? copies.map(d => ({ ...d, doc: recrireIdentifiant(d.doc, deId, versId) })) : copies;
  return { documents: finaux, rapport };
}

// ---------------------------------------------------------------- Résumé lisible d'un rapport

export function resumerRapport(rapport) {
  const lignes = Object.entries(rapport.parPack).map(([pack, p]) => {
    const total = p.traduits + p.parMemoire + p.manquants;
    return `${pack.padEnd(11)} ${String(p.traduits + p.parMemoire).padStart(5)}/${String(total).padEnd(5)} traduits`
      + `${p.parMemoire ? ` (${p.parMemoire} par mémoire)` : ""}${p.obsoletes ? `, ${p.obsoletes} obsolète(s)` : ""}${p.erreurs ? `, ${p.erreurs} en erreur` : ""}`;
  });
  return lignes.join("\n");
}
