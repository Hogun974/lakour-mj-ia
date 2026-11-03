// Ce qui, du Carnet de campagne, est secret : logique pure, sans Foundry (essais/coffre-carnet.test.mjs).
// Chaque registre (horloges, enquetes, contacts) est rangé en deux morceaux :
// - en clair, dans son réglage monde (livré à tous les navigateurs) : la PART PUBLIQUE des seuls éléments visibles, c'est-à-dire
//   ce que la fenêtre montre aux joueurs ;
// - chiffré, dans le réglage monde « coffreCarnet » (coffre-logique.js) : les listes COMPLÈTES des trois registres (éléments
//   cachés, et parts secrètes des éléments visibles), tant qu'il y a quelque chose de secret.
// La part publique est construite par LISTE BLANCHE (PUBLICS) : un champ qui n'y est pas (notes, historique, acteur, ou un champ
// ajouté plus tard) ne passe jamais en clair.
// - horloge, jauge, réputation : id, nom, type, valeur, max, visible, faction, paliers (secret : ses notes) ;
// - enquête : id, titre, visible, maj, ses conclusions révélées, ses indices trouvés sans dire où on les trouve, et des
//   conclusions qu'ils mènent, les seules révélées (l'identifiant d'une conclusion cachée est tiré de son texte) ;
// - contact : id, nom, faction, lieu, attitude, dette, demande, visible, maj (secret : notes, historique, son PNJ).
// Un élément caché est secret tout entier. Son identifiant aussi : tiré au hasard (idNeuf), il ne dit pas son nom.
import { idDepuisNom } from "./horloges-logique.js";

export const REGISTRES = ["horloges", "enquetes", "contacts"];

// Une écriture stable (clés triées, champs indéfinis omis comme dans un réglage enregistré), pour comparer deux valeurs sans
// dépendre de l'ordre des clés.
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
export const egaux = (a, b) => canon(a) === canon(b);

const garder = (el, cles) => Object.fromEntries(cles.filter(k => el?.[k] !== undefined).map(k => [k, structuredClone(el[k])]));
const sauf = (el, cles) => Object.fromEntries(Object.entries(el ?? {}).filter(([k]) => !cles.includes(k)).map(([k, v]) => [k, structuredClone(v)]));

// Par registre : PUBLICS (la liste blanche) ; vides (les champs secrets, vidés dans la part publique, pour qu'un élément sans
// secret s'y retrouve tel quel) ; publique(el) ; secrete(el) (tout le reste) ; fusionner(publique, secrete).
export const PUBLICS = {
  horloges: ["id", "nom", "type", "valeur", "max", "visible", "faction", "paliers"],
  enquetes: ["id", "titre", "visible", "maj"],
  contacts: ["id", "nom", "faction", "lieu", "attitude", "dette", "demande", "visible", "maj"]
};
const VIDES = {
  horloges: { notes: "" },
  enquetes: {},
  contacts: { notes: "", historique: [], acteur: "" }
};
const PARTS = {
  horloges: { publique: el => ({ ...garder(el, PUBLICS.horloges), ...structuredClone(VIDES.horloges) }) },
  enquetes: {
    publique: e => {
      const revelees = (e.conclusions ?? []).filter(c => c.revelee);
      const ids = new Set(revelees.map(c => c.id));
      return {
        ...garder(e, PUBLICS.enquetes),
        conclusions: revelees.map(c => garder(c, ["id", "texte", "revelee"])),
        indices: (e.indices ?? []).filter(i => i.trouve).map(i => ({ ...garder(i, ["id", "texte", "trouve"]), ou: "",
          mene: (i.mene ?? []).filter(id => ids.has(id)) }))
      };
    }
  },
  contacts: { publique: c => ({ ...garder(c, PUBLICS.contacts), ...structuredClone(VIDES.contacts) }) }
};
const parts = registre => {
  const p = PARTS[registre];
  if (!p) throw new Error(`registre inconnu : ${registre}`);
  return p;
};
const secrete = (registre, el) => sauf(el, PUBLICS[registre]);
const fusionner = (p, s) => (s ? { ...p, ...structuredClone(s) } : p);

// { publique, secrete } d'un élément : un élément caché n'a pas de part publique.
export function separer(registre, el) {
  return { publique: el?.visible ? parts(registre).publique(el) : null, secrete: secrete(registre, el) };
}

// Ce qui va en clair : la part publique des éléments visibles, dans l'ordre.
export const projeter = (registre, liste = []) => (liste ?? []).filter(el => el?.visible).map(el => separer(registre, el).publique);

// L'élément a-t-il quelque chose que le clair ne dit pas ?
export function aUnSecret(registre, el) {
  if (!el?.visible) return true;
  return !egaux(fusionner(separer(registre, el).publique, null), el);
}

// Le contenu complet ({ horloges, enquetes, contacts }) a-t-il quelque chose à chiffrer ? Sinon, pas de coffre.
export const contientSecret = contenu => REGISTRES.some(r => (contenu?.[r] ?? []).some(el => aUnSecret(r, el)));

// La liste complète d'un registre, vue par le MJ : le clair (réglage monde) complété par le coffre ouvert (liste complète), ou
// le clair tel quel si le coffre est vide ou fermé.
// - Un élément caché au coffre : le coffre fait foi (même si le clair le montre encore : une écriture interrompue entre le
//   coffre et le clair).
// - Un élément visible au coffre et en clair : la part publique du clair (elle a pu changer, coffre fermé), la part secrète du
//   coffre.
// - Un élément visible au coffre, absent du clair : celui du coffre (une écriture interrompue ; coffre fermé, rien n'est retiré).
// - Un élément du clair absent du coffre : tel quel (créé sans secret, ou ancien élément d'avant le coffre, rangé à la migration),
//   sauf s'il est parmi les retraits notés au coffre (retiré, le clair n'a pas eu le temps de suivre).
export function fusionnerListes(registre, clair = [], coffre = null, retires = []) {
  const liste = structuredClone(Array.isArray(clair) ? clair : []);
  if (!Array.isArray(coffre)) return liste;
  parts(registre);
  const publics = new Map(liste.map(el => [el.id, el]));
  const resultat = [];
  for (const el of structuredClone(coffre)) {
    const publique = publics.get(el.id);
    publics.delete(el.id);
    if (!el.visible || !publique) resultat.push(el);
    else resultat.push(fusionner(publique, secrete(registre, el)));
  }
  const partis = new Set(Array.isArray(retires) ? retires : []);
  return [...resultat, ...liste.filter(el => publics.has(el.id) && !partis.has(el.id))];
}

// Les retraits récents, gardés au coffre : { [registre]: [id…] } (les MAX_RETIRES derniers). Un id qui revient (élément recréé)
// n'y est plus.
export const MAX_RETIRES = 200;
export function noterRetraits(retires = {}, registre, avant = [], apres = []) {
  const restants = new Set(apres.map(el => el.id));
  const partis = avant.map(el => el.id).filter(id => !restants.has(id));
  const liste = [...(Array.isArray(retires?.[registre]) ? retires[registre] : []).filter(id => !restants.has(id) && !partis.includes(id)), ...partis];
  return { ...retires, [registre]: liste.slice(-MAX_RETIRES) };
}

// La part publique a-t-elle changé (maj d'une enquête ou d'un contact : il ne bouge pas pour un changement purement secret,
// qui ne doit rien réécrire en clair) ? Un élément caché avant ou après : oui (rien de lui n'est en clair).
export const publiqueChange = (registre, avant, apres, sansCles = ["maj"]) => {
  if (!avant?.visible || !apres?.visible) return true;
  const p = el => sauf(separer(registre, el).publique, sansCles);
  return !egaux(p(avant), p(apres));
};

// Coffre fermé (le MJ, sur un nouveau navigateur, attend les parts des joueurs) : on ne peut écrire que le clair. Une
// modification n'est permise que si elle ne touche ni la liste (ni création, ni retrait : un élément caché du même nom
// existe peut-être au coffre), ni ce qui est caché, ni la part secrète d'un élément visible. -> "" (permise) ou ce qui l'empêche.
export function refusSansCoffre(registre, avant = [], apres = []) {
  const ids = l => l.map(el => el.id);
  if (ids(apres).some(id => !ids(avant).includes(id))) return "créer un élément";
  if (ids(avant).some(id => !ids(apres).includes(id))) return "retirer un élément";
  for (const el of apres) {
    const ancien = avant.find(a => a.id === el.id);
    if (egaux(ancien, el)) continue;
    if (!el.visible) return "cacher un élément";
    if (!egaux(separer(registre, ancien).secrete, separer(registre, el).secrete)) return "changer une partie secrète (notes, indices, conclusions, historique)";
  }
  return "";
}

// Un identifiant pour un élément neuf. Caché : tiré au hasard (<prefixe>-<16 hexadécimaux>), il ne dit pas son nom. Visible :
// lisible, tiré du nom, unique parmi les seuls éléments visibles (un suffixe -2 ne trahit pas un caché) ; s'il tombe sur
// l'identifiant d'un caché, tiré au hasard lui aussi.
const hasardHex = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), o => o.toString(16).padStart(2, "0")).join("");
export function idNeuf(nom, liste = [], { visible = false, prefixe = "el" } = {}) {
  const auHasard = () => {
    let id;
    do { id = `${prefixe}-${hasardHex()}`; } while (liste.some(e => e.id === id));
    return id;
  };
  if (!visible) return auHasard();
  const id = idDepuisNom(nom, liste.filter(e => e.visible).map(e => e.id));
  return liste.some(e => !e.visible && e.id === id) ? auHasard() : id;
}

// Un élément caché renommé : son identifiant, s'il est tiré de l'ancien nom, en prend un au hasard (montré plus tard, il ne
// trahirait pas son nom d'avant). -> le nouvel identifiant, ou l'ancien.
export function idApresRenommage(el, nouveauNom, liste = [], prefixe = "el") {
  if (el?.visible || !nouveauNom || nouveauNom === el.nom) return el.id;
  const base = idDepuisNom(el.nom);
  return el.id === base || el.id.startsWith(`${base}-`) ? idNeuf(nouveauNom, liste, { visible: false, prefixe }) : el.id;
}
