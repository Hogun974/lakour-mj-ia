// Un registre de campagne (horloges.js ; enquêtes, contacts : carnet.js) : la part publique de ses éléments visibles dans son
// réglage monde (un tableau, livré à tous), le reste chiffré au coffre du Carnet (coffre.js, secrets-logique.js). Lu dans chaque
// navigateur : le MJ qui a ouvert le coffre lit la liste complète, les autres le clair. Écrit par le seul MJ actif, une écriture
// à la fois pour les trois registres (deux gestes rapprochés ne s'écrasent pas, le coffre est scellé dans l'ordre).
import { estMJActif } from "./canal.js";
import { lireRegistre, ecrireRegistre, enFile } from "./coffre.js";

export function registreMonde(cle) {
  const lire = () => lireRegistre(cle);
  // Dans enFile seulement (le coffre y est ouvert avant la lecture) : la liste complète, coffre puis clair.
  const ecrire = liste => ecrireRegistre(cle, liste);
  // fn(copie de la liste) -> { liste, resultat } (liste écrite, resultat rendu) ou null (rien à écrire). Hors du MJ actif : null.
  const modifier = fn => {
    if (!estMJActif()) return Promise.resolve(null);
    return enFile(async () => {
      const r = fn(structuredClone(lire()));
      if (!r) return null;
      await ecrire(r.liste);
      return r.resultat ?? null;
    });
  };
  // lire rend déjà une copie (secrets-logique.js, fusionnerListes) : lister est lire.
  return { cle, lire, ecrire, modifier, enFile, lister: () => lire() };
}
