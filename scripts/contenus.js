// Modules de contenu La Kour, un par système de jeu. Chacun fournit les mêmes fichiers, que le MJ IA lit de la même façon :
// - assets/jetons/figurants.json : types de figurants { type: { libelle, jeton, image? } } (jeton = assets/jetons/<jeton>.svg ;
//   image, facultative = jeton peint assets/jetons/<image>, « ia/<clé>.webp », préféré à plat) ;
// - assets/jetons/index.json et index-3d.json : jeton d'un personnage joueur, par clé (rôle en 40k, peuple en Warcraft) ;
// - assets/cartes/plans.json et le plan dans les drapeaux des scènes (repères pour placer les jetons).
// Ce qu'on ajoute à l'un s'ajoute à l'autre : on écrit ici ce qui est commun, une seule fois.
export const CONTENUS = { impmal: "lakour-40k", dnd5e: "lakour-warcraft", "lakour-loups": "lakour-veillees", "lakour-survie": "lakour-fenoir" };

// Chaque module de contenu existe en français (« lakour-40k ») et en anglais (« lakour-40k-en » : même fabricant, mêmes _id
// de documents, mêmes drapeaux sous sa propre portée ; outils/traduction.mjs, docs/traduction.md). Un seul des deux est actif
// à la fois (ils se déclarent en conflit) : partout où le moteur nomme un module de contenu, il prend celui qui est actif.
export const SUFFIXE_ANGLAIS = "-en";
export const variantes = id => (id ? [id, `${id}${SUFFIXE_ANGLAIS}`] : []);
// Identifiant de base d'un module de contenu, quelle que soit sa langue : « lakour-40k-en » -> « lakour-40k ».
export const moduleDeBase = id => (typeof id === "string" ? id.replace(new RegExp(`${SUFFIXE_ANGLAIS}$`), "") : id);

// Module de contenu actif pour le système du monde (sa version française ou anglaise), ou null.
export function moduleDeContenu(systeme = globalThis.game?.system?.id) {
  return variantes(CONTENUS[systeme]).find(id => globalThis.game?.modules?.get?.(id)?.active) ?? null;
}

// Langue du monde, « fr » ou « en » : celle du module de contenu actif (« lakour-40k-en » : anglais ; « lakour-40k » : français),
// car c'est lui qui fait la langue des documents ; sans module de contenu (système générique), la langue de l'interface.
// Le guide (guide.js), le narrateur et les compagnons IA (contexte.js, compagnons.js), les voix et la transcription la suivent.
export function langueDuMonde({ module = moduleDeContenu(), lang = globalThis.game?.i18n?.lang } = {}) {
  if (module) return module.endsWith(SUFFIXE_ANGLAIS) ? "en" : "fr";
  return String(lang ?? "").toLowerCase().startsWith("en") ? "en" : "fr";
}

// Identifiant à nommer quand le moteur cherche un compendium, un asset ou l'API du module de contenu : la variante active, sinon
// l'identifiant français (le monde n'a pas le module : la recherche échoue proprement, comme avant). null : système sans contenu.
export const contenuNomme = (systeme = globalThis.game?.system?.id) => moduleDeContenu(systeme) ?? CONTENUS[systeme] ?? null;

// Identifiant d'un compendium du module de contenu (« lakour-40k-en.armement » quand la variante anglaise est active).
export function packDeContenu(nom, systeme = globalThis.game?.system?.id) {
  const module = contenuNomme(systeme);
  return module ? `${module}.${nom}` : null;
}

// Drapeaux posés par le module de contenu sur un document (flags.<id>) : ils portent l'identifiant du module qui a posé le document
// (un document importé de « lakour-40k-en » porte flags["lakour-40k-en"] ; un autre, importé avant le changement de langue, porte
// flags["lakour-40k"]). On lit la variante active d'abord, puis les autres variantes du même module ; undefined sinon.
export function drapeauxDuContenu(flags, module = moduleDeContenu()) {
  if (!flags || !module) return undefined;
  const base = moduleDeBase(module);
  for (const id of [module, ...variantes(base).filter(v => v !== module)]) if (flags[id] !== undefined) return flags[id];
  return undefined;
}

// Jeton peint (images des modules de contenu, assets/jetons/ia/…webp ou .png) : il sert dans les deux styles, plat et relief.
export const estJetonPeint = chemin => typeof chemin === "string" && /\/assets\/jetons\/ia\/.+\.(webp|png)$/i.test(chemin);

// Jeton de personnage joueur fourni par le module de contenu pour cette clé, dans le style voulu ; null sinon. Le jeton peint de
// index.json passe avant tout, même en relief ; sinon le SVG du style (index-3d.json en relief).
export async function jetonJoueur(cle, style) {
  const module = moduleDeContenu();
  if (!module || !cle) return null;
  const lireIndex = async fichier => (await (await fetch(foundry.utils.getRoute(`modules/${module}/assets/jetons/${fichier}`), { cache: "no-store" })).json())[cle] ?? null;
  try {
    const plat = await lireIndex("index.json").catch(() => null);
    if (style !== "3d" || estJetonPeint(plat)) return plat;
    return await lireIndex("index-3d.json");
  } catch { return null; } // pas de jetons fournis : image par défaut
}

// Types de figurants du module de contenu ; null s'il n'en fournit pas.
export async function figurantsDuContenu() {
  const module = moduleDeContenu();
  if (!module) return null;
  try {
    const types = await (await fetch(foundry.utils.getRoute(`modules/${module}/assets/jetons/figurants.json`), { cache: "no-store" })).json();
    return { module, types };
  } catch { return null; }
}
