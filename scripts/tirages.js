// Tirages sur une table (lancer_table) : plusieurs résultats SANS doublon, en écartant ceux déjà tirés ou pris (le tableau des
// contrats de Warcraft en tire trois par jour), et les données que le module de contenu range sur chaque résultat
// (flags.<module>.contrat : { type, po, faction, reputation }). Logique pure, sans Foundry (essais/lancer-table.test.mjs).
import { plier } from "./recherche-nom.js";

export const TIRAGES_MAX = 10;
// Tentatives par résultat voulu : une petite table aux nombreux exclus finit par rendre moins que demandé, sans boucler.
export const ESSAIS_PAR_RESULTAT = 20;

// Le résultat est-il écarté ? exclus : noms (ou morceaux de nom) donnés par l'IA ; casse, accents et espaces ignorés.
export function estExclu(nom, exclus = []) {
  const n = plier(nom);
  return Boolean(n) && exclus.map(plier).filter(Boolean).some(e => n === e || n.includes(e));
}

// tirer() -> Promise<{ total, resultats: [r] }> (un tirage de la table) ; cleDe(r) : identité d'un résultat ; nomDe(r) : son nom.
// -> [{ r, total }] : au plus n résultats distincts, aucun exclu, dans l'ordre du tirage.
export async function tirerSansDoublon(tirer, n, { exclus = [], cleDe = r => r.id, nomDe = r => r.nom, essais = ESSAIS_PAR_RESULTAT } = {}) {
  const voulus = Math.max(1, Math.min(TIRAGES_MAX, Math.round(Number(n) || 1)));
  const sortie = [];
  const vus = new Set();
  for (let i = 0; sortie.length < voulus && i < voulus * essais; i++) {
    const t = await tirer();
    for (const r of t?.resultats ?? []) {
      const cle = cleDe(r);
      if (sortie.length >= voulus || vus.has(cle) || estExclu(nomDe(r), exclus)) continue;
      vus.add(cle);
      sortie.push({ r, total: t.total });
    }
  }
  return sortie;
}

// Les données d'un résultat pour l'IA (drapeaux du module de contenu du monde) : un contrat en clair (po, réputation et son
// horloge rep-<faction>), le reste en JSON court. "" sans données.
export function donneesDuResultat(drapeaux) {
  if (!drapeaux || typeof drapeaux !== "object" || !Object.keys(drapeaux).length) return "";
  const { contrat, ...autres } = drapeaux;
  const morceaux = [];
  if (contrat) {
    morceaux.push(`contrat${contrat.type ? ` (${contrat.type})` : ""} : ${Number(contrat.po) || 0} po, +${Number(contrat.reputation) || 0} de `
      + `réputation${contrat.faction ? ` auprès de ${contrat.faction} (horloge rep-${contrat.faction})` : ""}`);
  }
  if (Object.keys(autres).length) {
    const json = JSON.stringify(autres);
    morceaux.push(`données : ${json.length > 300 ? `${json.slice(0, 299)}…` : json}`);
  }
  return morceaux.join(" ; ");
}
