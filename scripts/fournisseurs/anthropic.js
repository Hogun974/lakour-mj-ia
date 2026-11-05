import { Anthropic } from "../../vendor/anthropic.mjs";
import { MODELES_ANTHROPIC } from "../constantes.js";
import { texteJoueurs } from "../utilitaires.js";

// Fournisseur Claude, appelé directement depuis le navigateur du MJ avec SA clé
// (dangerouslyAllowBrowser ajoute l'en-tête d'accès direct ; la clé ne quitte que vers api.anthropic.com).
//
// Le fil garde l'historique au format natif de l'API, réponse complète comprise (blocs de réflexion,
// blocs de compaction) : il ne doit jamais être réécrit, seulement prolongé.
export class FournisseurAnthropic {
  constructor({ cle, modele, effort }) {
    this.client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true });
    this.modele = modele;
    this.effort = effort;
  }

  get nom() { return "anthropic"; }

  nouveauFil() {
    return { fournisseur: "anthropic", modele: this.modele, messages: [] };
  }

  ajouterUtilisateur(fil, texte) {
    fil.messages.push({ role: "user", content: texte });
  }

  // texte : consigne ajoutée après les résultats, dans le même message (ex. « raconte maintenant »).
  ajouterResultats(fil, resultats, texte = "") {
    // Tous les résultats d'un même tour vont dans UN seul message utilisateur.
    fil.messages.push({
      role: "user",
      content: [
        ...resultats.map(r => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.contenu,
          ...(r.erreur ? { is_error: true } : {})
        })),
        ...(texte ? [{ type: "text", text: texte }] : [])
      ]
    });
  }

  async envoyer(fil, { systeme, outils, surTexte }) {
    const infos = MODELES_ANTHROPIC[this.modele] ?? {};
    const betas = ["compact-2026-01-12"];
    const parametres = {
      model: this.modele,
      max_tokens: 64000,
      // Prompt système stable en tête (personnalité, mémoire) : c'est lui que le cache réutilise.
      system: [{ type: "text", text: systeme }],
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive" },
      output_config: { effort: this.effort },
      // Les longues séances dépassent vite la fenêtre utile : l'API résume l'ancien historique d'elle-même.
      context_management: { edits: [{ type: "compact_20260112" }] },
      // Pas de « strict » ici : avec une quinzaine d'outils, l'API refuse la grammaire compilée
      // (400 « compiled grammar is too large »). Le moteur valide lui-même chaque appel (schema.js).
      tools: outils.map(o => ({ name: o.nom, description: o.description, input_schema: o.schema })),
      messages: fil.messages
    };
    // Repli automatique si un filtre de sécurité refuse (scènes violentes d'un univers grimdark, par exemple).
    if (infos.repli) {
      betas.push("server-side-fallback-2026-07-01");
      parametres.fallbacks = "default";
    }
    parametres.betas = betas;

    const flux = this.client.beta.messages.stream(parametres);
    if (surTexte) flux.on("text", surTexte);
    const message = await flux.finalMessage();

    const arret = message.stop_reason;
    const appels = message.content.filter(b => b.type === "tool_use");

    // Un refus peut couper un appel d'outil en plein milieu : on n'exécute rien de ce tour.
    if (arret === "refusal") {
      fil.messages.push({ role: "assistant", content: message.content });
      return { texte: extraireTexte(message), appels: [], usage: usage(message), arret: "refus", detail: message.stop_details?.explanation };
    }
    // Arguments d'outil tronqués : ils peuvent sembler valides, on ne les exécute pas.
    if (arret === "max_tokens" && appels.length) {
      throw new Error(texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.Coupee", "Réponse coupée (limite de longueur) au milieu d'un appel d'outil."));
    }

    fil.messages.push({ role: "assistant", content: message.content });
    return {
      texte: extraireTexte(message),
      appels: appels.map(b => ({ id: b.id, nom: b.name, args: b.input })),
      usage: usage(message),
      arret: arret === "tool_use" ? "outils" : "fin"
    };
  }

  // Appel court, sans outils ni historique : le cerveau d'un compagnon IA (compagnons.js). Non streamé, réflexion légère
  // (effort « low »), petite réponse ; rien du fil du MJ n'y entre.
  async envoyerCourt({ systeme, texte, maxJetons = 2000 }) {
    const message = await this.client.messages.create({
      model: this.modele,
      max_tokens: maxJetons,
      system: systeme,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: texte }]
    });
    return { texte: extraireTexte(message), usage: usage(message), arret: message.stop_reason === "refusal" ? "refus" : "fin" };
  }

  // Message d'erreur lisible pour le MJ, d'après les classes d'erreur du SDK.
  static expliquer(erreur) {
    // Vu du MJ (avis, chat) : dans la langue de l'interface (lang/*.json, LAKOUR_MJIA.Erreurs.Fournisseur.*).
    const d = { fournisseur: "Anthropic", message: erreur?.message ?? "", statut: erreur?.status ?? "" };
    if (erreur instanceof Anthropic.AuthenticationError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.CleRefusee", "Clé {fournisseur} refusée : vérifie-la dans la configuration du MJ IA.", d);
    if (erreur instanceof Anthropic.PermissionDeniedError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.SansAcces", "Ta clé {fournisseur} n'a pas accès à ce modèle.", d);
    if (erreur instanceof Anthropic.RateLimitError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.TropDeRequetes", "Trop de requêtes ou crédit épuisé chez {fournisseur} : réessaie dans un moment.", d);
    if (erreur instanceof Anthropic.BadRequestError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.Refusee", "Requête refusée par {fournisseur} : {message}", d);
    if (erreur instanceof Anthropic.APIConnectionError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.Reseau", "Impossible de joindre l'API {fournisseur} (réseau).", d);
    if (erreur instanceof Anthropic.APIError) return texteJoueurs("LAKOUR_MJIA.Erreurs.Fournisseur.Autre", "Erreur {fournisseur} {statut} : {message}", d);
    return null;
  }
}

function extraireTexte(message) {
  return message.content.filter(b => b.type === "text").map(b => b.text).join("\n\n").trim();
}

function usage(message) {
  const u = message.usage ?? {};
  return {
    entree: u.input_tokens ?? 0,
    cacheLecture: u.cache_read_input_tokens ?? 0,
    cacheEcriture: u.cache_creation_input_tokens ?? 0,
    sortie: u.output_tokens ?? 0
  };
}
