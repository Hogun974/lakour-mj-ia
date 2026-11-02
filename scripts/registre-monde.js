// Un registre de campagne rangé dans un réglage monde (un tableau) : enquêtes, contacts (carnet.js). Lu dans chaque navigateur,
// écrit par le seul MJ actif, une écriture à la fois (deux gestes rapprochés ne s'écrasent pas).
import { ID } from "./constantes.js";
import { estMJActif } from "./canal.js";

export function registreMonde(cle) {
  let file = Promise.resolve();
  const lire = () => {
    try {
      const v = game.settings.get(ID, cle);
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  // fn(copie de la liste) -> { liste, resultat } (liste écrite, resultat rendu) ou null (rien à écrire). Hors du MJ actif : null.
  const modifier = fn => {
    if (!estMJActif()) return Promise.resolve(null);
    const suite = file.then(async () => {
      const r = fn(structuredClone(lire()));
      if (!r) return null;
      await game.settings.set(ID, cle, r.liste);
      return r.resultat ?? null;
    });
    file = suite.catch(() => null);
    return suite;
  };
  return { cle, lire, modifier, lister: () => structuredClone(lire()) };
}
