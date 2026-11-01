// Fournisseur factice : aucun appel réseau, aucun coût. Il sert à éprouver le module dans Foundry
// (chat, outils, validation) avant de brancher une vraie clé.
// Un message de joueur de la forme « !outil nom_outil {"arg": ...} » déclenche cet outil ;
// tout autre message reçoit une narration d'écho.
export class FournisseurFactice {
  get nom() { return "factice"; }

  nouveauFil() {
    return { fournisseur: "factice", modele: "factice", messages: [] };
  }

  ajouterUtilisateur(fil, texte) {
    fil.messages.push({ role: "user", content: texte });
  }

  ajouterResultats(fil, resultats, texte = "") {
    fil.messages.push({ role: "outils", content: resultats, texte });
  }

  async envoyer(fil, { surTexte }) {
    const dernier = fil.messages.at(-1);
    let reponse;
    if (dernier.role === "outils") {
      reponse = { texte: `(factice) Résultats reçus : ${dernier.content.map(r => r.contenu).join(" | ")}`, appels: [] };
    } else {
      const demande = /!outil\s+(\w+)\s*(\{.*\})?/s.exec(dernier.content);
      reponse = demande
        ? { texte: `(factice) J'appelle l'outil ${demande[1]}.`, appels: [{ id: `f${fil.messages.length}`, nom: demande[1], args: JSON.parse(demande[2] ?? "{}") }] }
        : { texte: `(factice) Le MJ a bien reçu :\n\n${dernier.content}`, appels: [] };
    }
    for (const mot of reponse.texte.split(/(?<= )/)) surTexte?.(mot);
    fil.messages.push({ role: "assistant", content: reponse.texte, appels: reponse.appels });
    return { ...reponse, usage: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, arret: reponse.appels.length ? "outils" : "fin" };
  }

  static expliquer() { return null; }
}
