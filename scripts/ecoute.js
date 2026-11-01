// Écoute des joueurs (parole → texte), docs/voix-et-ecoute.md §2 : on n'écoute et on ne transcrit QUE si une IA doit entendre.
// Logique pure, sans Foundry. La transcription elle-même viendra plus tard ; cette règle décide si elle peut tourner.
//
// seanceIA : une séance du MJ IA est lancée ; compagnonsVivants : nombre (ou liste) de compagnons IA vivants à la table, même
// si un MJ humain mène sans narrateur IA ; moduleActif : le MJ IA est actif dans ce monde (faux = jamais d'écoute).
export function ecouteActive({ seanceIA = false, compagnonsVivants = 0, moduleActif = true } = {}) {
  if (moduleActif === false) return false;
  const compagnons = Array.isArray(compagnonsVivants) ? compagnonsVivants.length : Number(compagnonsVivants) || 0;
  return Boolean(seanceIA) || compagnons > 0;
}
