// Contrôle COMMUN d'un module de contenu La Kour (lakour-40k, lakour-warcraft, lakour-veillees…) : ce que le MJ IA lit
// dans un module de contenu (voir scripts/contenus.js) existe, est bien formé et se tient.
// - module.json : présent, « id » = nom du dossier ;
// - assets/jetons/figurants.json : types de figurants { type: { libelle, jeton } }, chaque jeton présent à plat
//   (assets/jetons/<jeton>.svg) et en relief (assets/jetons/3d/<jeton>.svg), SVG autonomes et bien formés ;
// - assets/jetons/index.json et index-3d.json : mêmes clés, chaque chemin « modules/<id>/… » existe, le relief est en …/3d/… ;
// - assets/cartes/plans.json et src/scenes/*.json : chaque scène qui porte un plan (flags.<id>.plan) a le même plan sous
//   sa clé dans plans.json, et chaque plan de plans.json a sa scène ; chaque plan a des pièces et des éléments (repères) ;
//   les images citées par les scènes existent, et une carte de assets/cartes/ a sa version en relief (assets/cartes/3d/).
// Chaque dépôt de monde l'appelle depuis le sous-module : modules/lakour-mj-ia/outils/contrat-contenu.mjs.
// Usage : verifierModuleDeContenu("modules/lakour-40k") -> liste d'erreurs (vide si le module respecte le contrat).
//         node modules/lakour-mj-ia/outils/contrat-contenu.mjs modules/lakour-40k   (code de sortie 1 en cas d'erreur)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { erreursSvg, lanceDirectement } from "./jetons-commun.mjs";

const lireJson = (chemin, erreurs, nom) => {
  if (!existsSync(chemin)) { erreurs.push(`${nom} absent`); return null; }
  try { return JSON.parse(readFileSync(chemin, "utf8")); } catch (e) { erreurs.push(`${nom} : JSON illisible (${e.message})`); return null; }
};
const estObjet = v => v !== null && typeof v === "object" && !Array.isArray(v);
const egaux = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// options.minFigurants, options.minJoueurs : nombres minimaux de types de figurants et de jetons de joueur.
export function verifierModuleDeContenu(dossierDuModule, { minFigurants = 1, minJoueurs = 1 } = {}) {
  const racine = resolve(dossierDuModule);
  const erreurs = [];
  const manifeste = lireJson(join(racine, "module.json"), erreurs, "module.json");
  const id = manifeste?.id ?? basename(racine);
  if (manifeste && manifeste.id !== basename(racine)) erreurs.push(`module.json : id « ${manifeste.id} » au lieu de « ${basename(racine)} » (nom du dossier)`);
  const prefixe = `modules/${id}/`;
  // Chemin Foundry « modules/<id>/x » -> chemin sur le disque ; null s'il désigne un autre module.
  const surDisque = chemin => (typeof chemin === "string" && chemin.startsWith(prefixe) ? join(racine, chemin.slice(prefixe.length)) : null);
  const svgControles = new Set();
  const controlerSvg = (chemin, nom) => {
    if (!existsSync(chemin)) { erreurs.push(`${nom} : ${chemin.slice(racine.length + 1).replace(/\\/g, "/")} absent`); return; }
    if (svgControles.has(chemin)) return;
    svgControles.add(chemin);
    erreurs.push(...erreursSvg(readFileSync(chemin, "utf8"), `${nom} (${basename(chemin)})`));
  };

  // ---------------------------------------------------------------- Figurants
  const figurants = lireJson(join(racine, "assets/jetons/figurants.json"), erreurs, "figurants.json");
  if (figurants !== null) {
    if (!estObjet(figurants)) erreurs.push("figurants.json : un objet { type: { libelle, jeton } } est attendu");
    else {
      const types = Object.entries(figurants);
      if (types.length < minFigurants) erreurs.push(`figurants.json : ${types.length} type(s), au moins ${minFigurants} attendu(s)`);
      for (const [type, f] of types) {
        if (!estObjet(f) || typeof f.libelle !== "string" || !f.libelle.trim()) { erreurs.push(`figurants.json : ${type} sans libellé`); continue; }
        if (typeof f.jeton !== "string" || !/^[a-z0-9-]+$/.test(f.jeton)) { erreurs.push(`figurants.json : ${type} sans jeton valable`); continue; }
        controlerSvg(join(racine, "assets/jetons", `${f.jeton}.svg`), `figurant ${type}`);
        controlerSvg(join(racine, "assets/jetons/3d", `${f.jeton}.svg`), `figurant ${type} (3D)`);
      }
    }
  }

  // ---------------------------------------------------------------- Jetons de joueur
  const index = { "2d": lireJson(join(racine, "assets/jetons/index.json"), erreurs, "index.json"),
    "3d": lireJson(join(racine, "assets/jetons/index-3d.json"), erreurs, "index-3d.json") };
  for (const [style, table] of Object.entries(index)) {
    const nom = style === "3d" ? "index-3d.json" : "index.json";
    if (table === null) continue;
    if (!estObjet(table)) { erreurs.push(`${nom} : un objet { clé: chemin } est attendu`); index[style] = null; continue; }
    if (Object.keys(table).length < minJoueurs) erreurs.push(`${nom} : ${Object.keys(table).length} jeton(s) de joueur, au moins ${minJoueurs} attendu(s)`);
    for (const [cle, chemin] of Object.entries(table)) {
      const disque = surDisque(chemin);
      if (!disque) { erreurs.push(`${nom} : ${cle} -> ${chemin} hors du module (attendu ${prefixe}…)`); continue; }
      if (style === "3d" && !chemin.includes("/3d/")) erreurs.push(`${nom} : ${cle} -> ${chemin} n'est pas un jeton en relief (…/3d/…)`);
      if (style === "2d" && chemin.includes("/3d/")) erreurs.push(`${nom} : ${cle} -> ${chemin} est un jeton en relief`);
      controlerSvg(disque, `${nom} : ${cle}`);
    }
  }
  if (index["2d"] && index["3d"]) {
    const plat = Object.keys(index["2d"]), relief = Object.keys(index["3d"]);
    for (const cle of plat) if (!relief.includes(cle)) erreurs.push(`index-3d.json : ${cle} absent (présent dans index.json)`);
    for (const cle of relief) if (!plat.includes(cle)) erreurs.push(`index.json : ${cle} absent (présent dans index-3d.json)`);
  }

  // ---------------------------------------------------------------- Plans et scènes
  const dossierScenes = join(racine, "src/scenes");
  const scenes = existsSync(dossierScenes)
    ? readdirSync(dossierScenes).filter(f => f.endsWith(".json")).map(f => ({ fichier: f, doc: lireJson(join(dossierScenes, f), erreurs, `scène ${f}`) })).filter(s => s.doc)
    : [];
  const avecPlan = scenes.filter(s => s.doc.flags?.[id]?.plan);
  const fichierPlans = join(racine, "assets/cartes/plans.json");
  const plans = existsSync(fichierPlans) || avecPlan.length ? lireJson(fichierPlans, erreurs, "plans.json") : null;
  if (plans !== null) {
    if (!estObjet(plans)) erreurs.push("plans.json : un objet { clé: plan } est attendu");
    else {
      for (const [cle, plan] of Object.entries(plans)) {
        if (!estObjet(plan)) { erreurs.push(`plans.json : ${cle} n'est pas un plan`); continue; }
        if (!(plan.largeur > 0 && plan.hauteur > 0)) erreurs.push(`plans.json : ${cle} sans largeur ni hauteur`);
        if (!Array.isArray(plan.pieces) || !plan.pieces.length) erreurs.push(`plans.json : ${cle} sans pièces`);
        if (!Array.isArray(plan.elements) || !plan.elements.length) erreurs.push(`plans.json : ${cle} sans éléments (repères)`);
      }
      const clesScenes = new Set();
      for (const { fichier, doc } of avecPlan) {
        const { cle, plan } = doc.flags[id];
        if (!cle) { erreurs.push(`scène ${fichier} : plan sans clé (flags.${id}.cle)`); continue; }
        clesScenes.add(cle);
        if (!(cle in plans)) erreurs.push(`scène ${fichier} : plan « ${cle} » absent de plans.json`);
        else if (!egaux(plan, plans[cle])) erreurs.push(`scène ${fichier} : son plan diffère de plans.json[« ${cle} »] (refabriquer le module)`);
      }
      for (const cle of Object.keys(plans)) if (!clesScenes.has(cle)) erreurs.push(`plans.json : « ${cle} » n'a pas de scène`);
    }
  }
  for (const { fichier, doc } of scenes) {
    const images = new Set(JSON.stringify(doc).match(new RegExp(`${prefixe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]+`, "g")) ?? []);
    for (const image of images) {
      const disque = surDisque(image);
      if (!existsSync(disque)) { erreurs.push(`scène ${fichier} : ${image} absent`); continue; }
      const carte = /^assets\/cartes\/([^/]+\.svg)$/.exec(image.slice(prefixe.length));
      if (carte && !existsSync(join(racine, "assets/cartes/3d", carte[1]))) erreurs.push(`scène ${fichier} : carte en relief assets/cartes/3d/${carte[1]} absente`);
    }
  }
  return erreurs;
}

// ---------------------------------------------------------------- Traductions (tout module : moteur ou contenu)

const fichiers = dossier => readdirSync(dossier, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)]));
const aplatir = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? aplatir(v, `${p}${k}.`) : [`${p}${k}`]));

// Chaque clé « <prefixe>.… » utilisée dans scripts/ et templates/ existe dans lang/fr.json, et fr.json et en.json ont
// exactement les mêmes clés. Rend { francaisSeul, anglaisSeul, manquantes } (listes vides si tout va bien).
// Les clés construites dynamiquement (ex. LAKOUR_MJIA.Efforts.${e}) apparaissent tronquées : ignorées si elles
// désignent un groupe existant.
export function ecartsTraductions(dossierDuModule, prefixe) {
  const racine = resolve(dossierDuModule);
  const fr = new Set(aplatir(JSON.parse(readFileSync(join(racine, "lang/fr.json"), "utf8"))));
  const en = new Set(aplatir(JSON.parse(readFileSync(join(racine, "lang/en.json"), "utf8"))));
  const sources = ["scripts", "templates"].flatMap(d => (existsSync(join(racine, d)) ? fichiers(join(racine, d)) : []));
  const motif = new RegExp(`${prefixe}\\.[A-Za-z][A-Za-z0-9.]*[A-Za-z0-9]`, "g");
  const utilisees = new Set(sources.flatMap(f => readFileSync(f, "utf8").match(motif) ?? []));
  return {
    francaisSeul: [...fr].filter(k => !en.has(k)),
    anglaisSeul: [...en].filter(k => !fr.has(k)),
    manquantes: [...utilisees].filter(k => !fr.has(k) && ![...fr].some(f => f.startsWith(`${k}.`)))
  };
}

if (lanceDirectement(import.meta.url)) {
  const dossier = process.argv[2];
  if (!dossier) { console.error("Usage : node modules/lakour-mj-ia/outils/contrat-contenu.mjs <dossier du module de contenu>"); process.exit(2); }
  const erreurs = verifierModuleDeContenu(dossier);
  if (erreurs.length) { console.error(`${dossier} : ${erreurs.length} écart(s) au contrat :\n- ${erreurs.join("\n- ")}`); process.exit(1); }
  console.log(`${dossier} : contrat des modules de contenu respecté`);
}
