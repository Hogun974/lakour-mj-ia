// Pilote automatique (docs/compagnons.md, « Pilote automatique ») : quand il ne reste plus que des compagnons IA, en mode
// autonome, la partie continue seule. Le moteur du MJ IA ne répond qu'aux joueurs et refuse exprès de relancer les
// compagnons sur leurs seules répliques (pas de boucle) : sans humain, tout s'arrêterait. Le pilote fait avancer la partie
// par étapes, une à la fois, en confiant au MJ IA une consigne à chaque étape (il raconte et appelle lui-même ses outils).
//
// Quand : une séance est active, l'autonomie vaut « autonome », le réglage « pilote » est coché, et
//   - aux Veillées : une partie est en cours (phase ni « preparation » ni « fin ») et AUCUN vivant n'est tenu par un humain
//     (des humains morts peuvent regarder) ;
//   - en 40k, en Warcraft et à Fénoir : aucun personnage d'un joueur connecté n'est présent (sur la scène active), et des compagnons
//     le sont (à Fénoir, la consigne de scène ajoute CONSIGNE_PILOTE_SURVIE : le temps passe par les outils survie_*).
// En mode Validation, pas de pilote : le MJ humain reçoit un avis.
//
// Peste noire (secret) : la première nuit (pas encore de porteur), la consigne de la nuit dit au narrateur de choisir la victime
// de la peste (loups_nuit, peste_victime) ; le dénouement dévoile la peste. Une partie ordinaire n'en entend jamais parler ; le
// cri d'un compagnon (« C'est la peste noire ! ») est transmis au système par compagnons-jeu.js.
// Étapes aux Veillées : nuit (loups_nuit), aube, débat (au plus DEBAT_TOURS tours de parole des compagnons, l'exception voulue à
// la règle anti-boucle, seulement ici), vote (ouvrir, les compagnons votent, clore), exécution, victoire vérifiée, nuit suivante.
// En 40k et en Warcraft : les combats se poursuivent tour après tour (chaque tour compte comme une étape, le pilote relance un
// combat arrêté) ; hors combat, au plus ECHANGES_MAX échanges entre le MJ IA et les compagnons, puis une pause avec un avis.
//
// Garde-fous : jamais deux étapes en même temps ni pendant un tour du MJ IA ; un délai réglable entre les étapes, après la fin de
// la voix du narrateur ; arrêt net à la victoire (après le dénouement), à la fin de la séance, au retour d'un humain vivant, en
// mode Validation, au budget atteint, après piloteEtapes étapes ou quand la partie n'avance plus ; le MJ humain l'arrête depuis
// la console.
import { ID } from "./constantes.js";
import { estCompagnon, compagnonsPresents } from "./compagnons-jeu.js";
import { voixAuRepos } from "./voix.js";

export const ETAPES_MAX = 60;
export const DEBAT_TOURS = 2;
export const ECHANGES_MAX = 6;
export const DELAI_DEFAUT = 4;
export const ATTENTE_COMBAT = 30000;   // ms sans que le combat avance (moteur au repos) avant de le relancer
export const REPETITIONS_MAX = 3;      // la même étape, sur le même état, au-delà : la partie n'avance plus
const ATTENTE_REPOS_MAX = 10 * 60000;  // un tour du MJ ne dure jamais autant : au-delà, on passe outre
// Arrêts qui laissent le pilote en pause : il ne repart pas seul, le MJ humain le relance depuis la console.
const SUSPENDRE = ["manuel", "max", "budget", "bloque", "pause", "erreur"];
// Arrêts annoncés au MJ humain (clé de traduction LAKOUR_MJIA.Pilote.<clé>).
const AVIS = { manuel: "Arrete", max: "Max", budget: "Budget", bloque: "Bloque", pause: "Pause", erreur: "Erreur", victoire: "Victoire",
  humain: "Humain", validation: "Validation", reglage: "Coupe", secrets: "Secrets" };

const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
const traduire = (cle, donnees) => {
  try { return donnees ? game.i18n.format(cle, donnees) : game.i18n.localize(cle); } catch { return cle; }
};

// ------------------------------------------------------------------ qui reste à la table
// Les vivants des Veillées. Un villageois sans compagnon compte comme humain (même déconnecté : il peut revenir).
export function vivantsVeillees(api) {
  const vivants = api.villageois().filter(a => a.system?.vivant !== false);
  return { humains: vivants.filter(a => !estCompagnon(a)), compagnons: vivants.filter(estCompagnon) };
}

// Le groupe en 40k et en Warcraft : les personnages de joueurs CONNECTÉS présents (jeton visible sur la scène active ; sans
// scène, le personnage assigné), et les compagnons présents.
export function groupeAventure() {
  const joueurs = game.users.filter(u => !u.isGM && u.active);
  const tenuParUnJoueur = a => a && !estCompagnon(a) && joueurs.some(u => u.character?.id === a.id || a.ownership?.[u.id] === 3);
  const scene = game.scenes?.active;
  const humains = scene
    ? [...new Set(scene.tokens.contents.filter(t => !t.hidden && tenuParUnJoueur(t.actor)).map(t => t.actor))]
    : joueurs.map(u => u.character).filter(tenuParUnJoueur);
  return { humains, compagnons: compagnonsPresents() };
}

// ------------------------------------------------------------------ étapes des Veillées (logique pure)
export const nouvelleMemoire = () => ({ tour: -1, aube: false, debats: 0, voteFait: false, denouement: false, echanges: 0, combat: null, depuis: 0 });

// La prochaine étape d'après l'état du système et la mémoire du pilote ; null = rien à faire.
// elusVivants : désignés du vote du jour encore vivants ; debatMax : tours de parole des compagnons au débat.
// election : l'élection du Bailli est due (api.bailli().election.ok, système 0.6.0 et plus) : après le débat, elle passe avant le
// vote d'exécution ; sa clôture (« bailli-clore ») n'exécute personne. Le pilote ouvre et clôt lui-même l'élection (au débat, sans
// changer de phase), sans tour du narrateur : elle ne dépend pas d'un outil oublié par le modèle et ne coûte aucun appel ; le
// narrateur annonce le Bailli en ouvrant le vote d'exécution (CONSIGNES_LOUPS.annonceBailli).
// victoire : le système dit que la partie est gagnée (api.etapeSuivante().cle === "victoire", système 0.7.0 : le Glas final, par
// exemple) avant même de l'avoir déclarée. Le Glas final atteint (etat.glas, jour N) : après le vote du jour N, pas de nuit.
export const glasAtteint = etat => Number(etat?.glas) > 0 && Number(etat.tour) >= Number(etat.glas);
// systeme : l'étape suivante du système (api.etapeSuivante(), 0.8.0) : avec le Banc des accusés, « juger » (le prochain accusé,
// jusqu'à une condamnation) ou la nuit (détail « bancVide », personne à juger). La Nuit de la Saint-Martin : après son unique
// vote, le dénouement (la nuit ne tombe pas).
export function prochaineEtapeLoups(etat, m, { elusVivants = [], debatMax = DEBAT_TOURS, election = false, victoire = false, systeme = null } = {}) {
  if (etat.vainqueur || etat.phase === "fin" || victoire) return m.denouement ? null : "denouement";
  if (etat.phase === "preparation") return null;
  if (etat.vote?.ouvert) return etat.vote.objet === "bailli" ? "bailli-clore" : "vote-clore";
  if (etat.phase === "nuit") return "nuit";
  const finDuDebat = m.voteFait || m.debats >= debatMax;
  if (systeme?.cle === "juger" && finDuDebat && !elusVivants.length) return "vote-ouvrir";
  if (systeme?.cle === "nuit" && systeme.detail?.cle === "bancVide" && finDuDebat && !elusVivants.length) {
    return etat.format === "saint-martin" ? (m.denouement ? null : "denouement") : "nuit";
  }
  if (m.voteFait) {
    if (elusVivants.length) return "eliminer";
    return glasAtteint(etat) || etat.format === "saint-martin" ? (m.denouement ? null : "denouement") : "nuit";
  }
  if (etat.phase === "aube" && !m.aube) return "aube";
  if (m.debats < debatMax) return "debat";
  return election ? "bailli" : "vote-ouvrir";
}

// Le résultat d'une élection du Bailli (api.cloreVote, objet « bailli »), en clair pour la consigne du narrateur.
export function resultatElection(r, nom = id => id) {
  if (r?.bailli) return `${nom(r.bailli)} est élu Bailli${r.sort ? " (par le sort, entre les ex aequo)" : ""}`;
  return r ? "personne n'est élu, la charge reste vacante jusqu'au prochain jour" : "l'élection n'a pas pu être close";
}

// Le vote d'exécution de ce tour a eu lieu (clos, non prolongé) ?
export const voteDuJour = etat => {
  const r = etat.vote?.resultat;
  return Boolean(r && !etat.vote.ouvert && (r.objet ?? "execution") === "execution" && r.tour === etat.tour);
};

// ------------------------------------------------------------------ consignes au MJ IA
const ENTETE = "[Pilote automatique — plus aucun joueur humain vivant : les compagnons IA finissent la partie seuls, des spectateurs "
  + "regardent. Garde un rythme lisible et des récits courts.]";
const ENTETE_AVENTURE = "[Pilote automatique — plus aucun joueur humain présent : les compagnons IA continuent seuls, des spectateurs "
  + "regardent. Ne décide jamais à leur place ; récits courts.]";

export const CONSIGNES_LOUPS = {
  nuit: "Étape : la nuit. Raconte en deux ou trois phrases la tombée de la nuit sur Brumecombe, puis appelle loups_nuit (delai_secondes 60). "
    + "Après son résultat, réponds seulement « — » : l'aube sera racontée à l'étape suivante, même si une victoire est annoncée.",
  aube: "Étape : l'aube. Raconte l'aube de cette nuit (les morts et leur sort, sans trahir qui a fait quoi ni aucun rôle secret), "
    + "puis ouvre le débat du jour en une phrase. N'ouvre pas encore le vote.",
  juger: nom => `Avec le Banc des accusés, ce vote est le jugement de ${nom}, lui seul : voter pour lui le condamne, ne rien voter `
    + "l'acquitte (le suivant sera jugé à l'étape d'après).",
  annonceBailli: resultat => `Avant cela, le village vient d'élire son Bailli (élection menée au débat) : ${resultat}. Annonce-le d'abord `
    + "en une phrase, sans réciter les voix (sa voix comptera double à ce vote, il tranchera les égalités) ; personne n'a été exécuté par l'élection.",
  "vote-ouvrir": "Étape : le vote. Clos le débat en une phrase, puis ouvre le vote d'exécution (loups_vote, action « ouvrir », candidats "
    + "vides, duree_secondes 0). Ne le clos pas : les villageois votent.",
  "vote-clore": "Étape : le dépouillement. Clos le vote (loups_vote, action « clore ») et annonce le désigné, sans réciter les voix (la carte et la Table les montrent). N'exécute personne à cette "
    + "étape : l'exécution suit. Si personne n'est désigné, dis-le ; si le vote se prolonge (ruban), laisse le désigné se défendre en une phrase.",
  eliminer: noms => `Étape : l'exécution. Le village a désigné ${noms}. Appelle loups_eliminer pour chacun (cause « vote »), puis raconte `
    + "sa fin et ce qu'on découvre. Si l'outil annonce une victoire, ne raconte pas encore le dénouement : c'est l'étape suivante.",
  denouement: vainqueur => `Étape : le dénouement. La partie est finie, victoire : ${vainqueur}. Raconte le dénouement pour les spectateurs `
    + "en quelques phrases : qui l'emporte, les rôles qui ont pesé (sans passer tout le village en revue), une image finale. N'appelle aucun outil et ne relance pas de partie "
    + "(pas de loups_rejouer : une autre partie se décide entre humains)."
};

// Peste noire (secret, donnée au seul narrateur, seulement dans une telle partie) : la nuit, tant que la peste n'a pas de porteur,
// le narrateur choisit sa victime. Jamais dans une partie ordinaire (rien ne doit lui souffler l'idée d'une peste).
export const CONSIGNE_PESTE_NUIT = "SECRET (peste noire, ne la nomme jamais) : la peste n'a pas encore de porteur, c'est toi qui choisis sa "
  + "victime de cette nuit parmi les vivants : donne son nom à loups_nuit (peste_victime). Raconte la nuit comme toutes les autres.";

// Le vainqueur, pour la consigne du dénouement (et la peste noire dévoilée).
// glas : le jour du Glas final atteint (0 : pas de glas) ; le dénouement dit alors que le glas a mis fin à la veillée.
export function libelleVainqueurPilote(v, nom = id => id, peste = false, glas = 0) {
  const fin = glas > 0 ? ` — le Glas final a sonné au soir du jour ${glas} : dis que c'est lui qui a mis fin à la veillée` : "";
  if (!v) return `personne pour l'instant${fin}`;
  if (v === "brume") return `la brume : à la Saint-Martin, le village a pendu un innocent sans qu'aucun loup ne soit parmi eux ; personne ne gagne${fin}`;
  if (v === "peste") return `la peste noire (il n'y avait aucun loup : la peste a emporté Brumecombe)${fin}`;
  if (v === "village" && peste) return `le camp « village », qui a reconnu la peste noire (il n'y avait aucun loup)${fin}`;
  return `${v === "village" || v === "meute" ? `le camp « ${v} »` : nom(v)}${fin}`;
}

// Fénoir (lakour-survie) : le même pilote « aventure » (aucun humain présent, des compagnons) ; la scène avance aussi par le temps.
export const CONSIGNE_PILOTE_SURVIE = "À Fénoir, le temps compte : quand les compagnons ont décidé d'une action (fouille, garde, chantier, "
  + "repos, route), résous-la avec l'outil survie_* qui convient (il fait passer le temps), sans choisir à leur place ; s'ils attendent, "
  + "survie_avancer. Le réel reste secret, même pour eux.";
export const CONSIGNES_AVENTURE = {
  scene: "Étape : la scène continue. Fais-la avancer d'un pas (un événement, un PNJ qui agit, un choix qui se présente au groupe), "
    + "en quelques phrases, puis laisse les compagnons réagir.",
  relance: "Étape : les compagnons n'ont rien dit. Fais avancer la scène d'un pas, en quelques phrases.",
  combat: c => `Étape : le combat est arrêté au tour de ${c}. Joue ce tour s'il est à un PNJ (puis passer_tour) ; si c'est le personnage `
    + "d'un joueur absent, il se met à couvert sans agir : passer_tour."
};

// ------------------------------------------------------------------ le pilote
export class PiloteAutomatique {
  // moteur : le MoteurMJ (actif, tour, auRepos, budgetDepasse, compagnons). api() : l'API des Veillées, s'il y en a une.
  // horloge : { maintenant(), attendre(ms) } ; attendreVoix() : fin de la voix du narrateur ; aviser(texte) : avis au MJ humain.
  constructor({ moteur, api = () => (game.system?.id === "lakour-loups" ? game.lakourLoups : null), horloge = null, attendreVoix = null,
    aviser = null, etatDuJeu = () => "" } = {}) {
    this.moteur = moteur;
    this.api = api;
    this.horloge = horloge ?? { maintenant: () => Date.now(), attendre: ms => new Promise(r => setTimeout(r, ms)) };
    this.attendreVoix = attendreVoix ?? (async () => {});
    this.aviser = aviser ?? (texte => avisAuMJ(texte));
    this.etatDuJeu = etatDuJeu;
    this.enMarche = false;
    this.enEtape = false;
    this.suspendu = false;      // arrêté (MJ, plafond, budget…) : ne repart pas seul
    this.boucle = null;
    this.etapes = 0;
    this.memoire = nouvelleMemoire();
    this.journal = [];          // { etape, n } : pour la console et les essais
    this.dernierArret = null;   // { raison, etapes, detail }
    this.avisValidation = false;
    this.derniereCle = "";
    this.repetitions = 0;
    this.prevu = null;
  }

  // ---------- réglages
  delai() { return Math.max(0, Number(reglage("piloteDelai", DELAI_DEFAUT)) || 0) * 1000; }
  etapesMax() { return Math.max(1, Math.floor(Number(reglage("piloteEtapes", ETAPES_MAX)) || ETAPES_MAX)); }
  debatMax() { return this.moteur.compagnons?.maxRepliques?.() === 0 ? 0 : DEBAT_TOURS; }
  jeu() { return this.api() ? "loups" : "aventure"; }

  // ---------- détection : { ok } ou { ok: false, raison } ; « validation » = tout y est, sauf le mode
  conditions() {
    if (!reglage("pilote", true)) return { ok: false, raison: "reglage" };
    if (!this.moteur.actif) return { ok: false, raison: "seance" };
    const api = this.api();
    let groupe;
    if (api) {
      const etat = api.etat();
      if (etat.phase === "preparation") return { ok: false, raison: "preparation" };
      // Secrets de la partie en attente (coffre) : pause ; il repart seul quand ils sont revenus (hook lakourLoups.secrets).
      if (api.ecritureBloquee?.()) return { ok: false, raison: "secrets" };
      if (etat.vainqueur || etat.phase === "fin") return { ok: false, raison: "fin" };
      groupe = vivantsVeillees(api);
    } else {
      groupe = groupeAventure();
    }
    if (groupe.humains.length) return { ok: false, raison: "humain" };
    if (!groupe.compagnons.length) return { ok: false, raison: "personne" };
    if (reglage("autonomie", "validation") !== "autonome") return { ok: false, raison: "validation" };
    return { ok: true };
  }

  // Un combat que le pilote retient : en pause (plafond, MJ…) alors qu'il ne reste que des compagnons. Les tours des PNJ et des
  // compagnons ne sont plus joués d'eux-mêmes (reactions.js) jusqu'à ce que le MJ humain relance le pilote ou qu'un humain revienne.
  combatRetenu() {
    return this.suspendu && !this.enMarche && this.conditions().ok;
  }

  // Après un tour du MJ, un changement de réglage, une mort, une connexion… (regroupés).
  verifierBientot() {
    if (this.prevu) return;
    this.prevu = setTimeout(() => { this.prevu = null; this.verifier(); }, 0);
  }

  verifier() {
    let c;
    try { c = this.conditions(); } catch (e) { console.error(`${ID} | pilote`, e); return; }
    if (this.enMarche) {
      // La fin de partie est menée par la boucle (dénouement, puis arrêt).
      if (!c.ok && c.raison !== "fin") this.arreter(c.raison);
      return;
    }
    if (c.ok) {
      if (!this.suspendu) this.demarrer();
      return;
    }
    if (c.raison === "validation") {
      if (!this.avisValidation) this.aviser(traduire("LAKOUR_MJIA.Pilote.Validation"));
      this.avisValidation = true;
      return;
    }
    // La situation « que des compagnons » est finie : la prochaine fois, le pilote repartira de lui-même.
    if (["humain", "seance", "preparation", "personne", "secrets"].includes(c.raison)) {
      this.suspendu = false;
      this.avisValidation = false;
    }
  }

  demarrer() {
    if (this.enMarche || this.boucle) return false;
    Object.assign(this, { enMarche: true, suspendu: false, etapes: 0, memoire: nouvelleMemoire(), dernierArret: null, derniereCle: "", repetitions: 0 });
    this.aviser(traduire("LAKOUR_MJIA.Pilote.Demarre"));
    this.boucle = this.#boucle()
      .catch(e => { console.error(`${ID} | pilote`, e); this.arreter("erreur", e?.message ?? String(e)); })
      .finally(() => { this.enMarche = false; this.boucle = null; rafraichirConsole(); });
    rafraichirConsole();
    return true;
  }

  // Relance par le MJ humain (console) : seulement si la situation s'y prête.
  relancer() {
    this.suspendu = false;
    const c = this.conditions();
    if (!c.ok) return false;
    return this.demarrer();
  }

  // Arrêt net : l'étape en cours finit, aucune autre ne commence.
  arreter(raison = "manuel", detail = "") {
    if (SUSPENDRE.includes(raison)) this.suspendu = true;
    if (!this.enMarche) return false;
    this.enMarche = false;
    this.dernierArret = { raison, etapes: this.etapes, detail };
    const cle = AVIS[raison];
    if (cle) this.aviser(traduire(`LAKOUR_MJIA.Pilote.${cle}`, { n: this.etapes, detail, max: this.etapesMax(), echanges: ECHANGES_MAX }));
    rafraichirConsole();
    return true;
  }

  // ---------- la boucle : une étape à la fois
  async #boucle() {
    while (this.enMarche) {
      await this.horloge.attendre(this.delai());
      if (!(await this.#attendreRepos())) return;
      await this.attendreVoix();
      if (!(await this.#attendreRepos())) return;
      const c = this.conditions();
      if (!c.ok) {
        if (c.raison === "fin" && !this.memoire.denouement && !this.moteur.budgetDepasse()) await this.#etape("denouement", "fin");
        this.arreter(c.raison === "fin" ? "victoire" : c.raison);
        return;
      }
      if (this.moteur.budgetDepasse()) return void this.arreter("budget");
      if (this.etapes >= this.etapesMax()) return void this.arreter("max");
      const choix = await this.choisir();
      if (!this.enMarche) return;
      if (!choix) continue;
      if (choix.etape === "pause") return void this.arreter("pause");
      if (choix.cle === this.derniereCle) {
        if (++this.repetitions >= REPETITIONS_MAX) return void this.arreter("bloque", choix.etape);
      } else {
        this.derniereCle = choix.cle;
        this.repetitions = 0;
      }
      await this.#etape(choix.etape, choix.cle);
    }
  }

  // Le moteur au repos : aucun tour du MJ en cours ni en attente, aucun message en file. false si le pilote s'est arrêté.
  async #attendreRepos() {
    const debut = this.horloge.maintenant();
    while (this.enMarche && !this.moteur.auRepos() && this.horloge.maintenant() - debut < ATTENTE_REPOS_MAX) await this.horloge.attendre(250);
    return this.enMarche;
  }

  async #etape(etape, cle) {
    if (this.enEtape) throw new Error("deux étapes du pilote en même temps");
    this.enEtape = true;
    this.etapes++;
    this.journal.push({ etape, n: this.etapes, cle });
    if (this.journal.length > 200) this.journal.shift();
    rafraichirConsole();
    try {
      await (this.jeu() === "loups" ? this.#executerLoups(etape) : this.#executerAventure(etape));
    } finally {
      this.enEtape = false;
    }
  }

  // ---------- choisir : { etape, cle } ou null (attendre)
  async choisir() {
    return this.jeu() === "loups" ? this.#choisirLoups() : this.#choisirAventure();
  }

  async #choisirLoups() {
    const api = this.api();
    await api.verifierVictoire?.();
    const etat = api.etat();
    const m = this.memoire;
    if (m.tour !== etat.tour) Object.assign(m, { tour: etat.tour, aube: false, debats: 0, voteFait: false, annonceBailli: "" });
    if (voteDuJour(etat)) m.voteFait = true;
    const vivant = id => api.villageois().find(a => a.id === id)?.system?.vivant !== false;
    const elusVivants = m.voteFait ? (etat.vote.resultat?.elus ?? []).filter(vivant) : [];
    // L'élection du Bailli due maintenant (système 0.6.0 et plus ; un système plus ancien n'a pas api.bailli).
    let election = false;
    try { election = Boolean(api.bailli?.()?.election?.ok) && m.electionRefusee !== etat.tour; } catch { /* pas de Bailli */ }
    // L'étape que le système voit venir (0.7.0 et plus ; un système plus ancien n'a pas etapeSuivante) : la victoire, le Banc.
    let systeme = null;
    try { systeme = api.etapeSuivante?.() ?? null; } catch { /* pas d'étapes */ }
    const etape = prochaineEtapeLoups(etat, m, { elusVivants, debatMax: this.debatMax(), election, victoire: systeme?.cle === "victoire", systeme });
    if (!etape) return null;
    const vivants = api.villageois().filter(a => a.system?.vivant !== false).length;
    return { etape, cle: [etape, etat.phase, etat.tour, etat.vote?.numero ?? 0, Boolean(etat.vote?.ouvert), vivants, m.debats].join("|") };
  }

  async #choisirAventure() {
    const m = this.memoire;
    const combat = game.combats?.active;
    if (combat?.started) {
      const sig = `${combat.id ?? ""}|${combat.round}|${combat.turn}`;
      const t = this.horloge.maintenant();
      if (sig !== m.combat) {
        // Chaque tour de combat joué compte comme une étape (le plafond borne aussi les combats).
        if (m.combat) this.etapes++;
        Object.assign(m, { combat: sig, depuis: t });
        return null;
      }
      if (t - m.depuis < ATTENTE_COMBAT) return null;
      m.depuis = t;
      return { etape: "relance-combat", cle: `combat|${sig}` };
    }
    m.combat = null;
    if (m.echanges >= ECHANGES_MAX) return { etape: "pause", cle: "pause" };
    return { etape: m.echanges ? "echange" : "scene", cle: `echange|${m.echanges}` };
  }

  // ---------- exécuter
  #consigne(entete, texte) {
    let etat = "";
    try { etat = this.etatDuJeu(); } catch { /* sans état : la consigne suffit */ }
    return `${entete}\n${etat ? `[État du jeu]\n${etat}\n\n` : ""}${texte}`;
  }

  #tour(entete, texte) {
    return this.moteur.tour(this.#consigne(entete, texte), { miseEnPlace: false });
  }

  async #executerLoups(etape) {
    const api = this.api();
    const m = this.memoire;
    const nom = id => api.villageois().find(a => a.id === id)?.name ?? id;
    switch (etape) {
      case "nuit": {
        const e = api.etat();
        const premiere = e.peste?.active && !e.peste.porteur;
        return this.#tour(ENTETE, premiere ? `${CONSIGNES_LOUPS.nuit}\n${CONSIGNE_PESTE_NUIT}` : CONSIGNES_LOUPS.nuit);
      }
      case "aube":
        await this.#tour(ENTETE, CONSIGNES_LOUPS.aube);
        m.aube = true;
        // Le jour se lève : le débat commence (la Table de jeu et la mise en scène suivent la phase).
        if (api.etat().phase === "aube") await api.changerPhase("jour");
        return;
      case "debat": {
        // L'exception à la règle anti-boucle : le pilote donne lui-même la parole aux compagnons, au plus debatMax fois.
        // Leurs répliques entrent dans la file du MJ comme celles de joueurs ; il y répond, sans relancer les compagnons.
        m.debats++;
        const dits = await this.moteur.compagnons.debattre({ mentions: "" });
        if (!dits.length) m.debats = Math.max(m.debats, this.debatMax());
        return;
      }
      case "vote-ouvrir": {
        const annonce = m.annonceBailli ? ` ${CONSIGNES_LOUPS.annonceBailli(m.annonceBailli)}` : "";
        m.annonceBailli = "";
        // Le Banc des accusés (système 0.8.0) : ce vote juge le prochain accusé, lui seul.
        let banc = "";
        try { const b = api.banc?.(); if (b?.actif && b.prochain) banc = ` ${CONSIGNES_LOUPS.juger(b.prochainNom)}`; } catch { /* pas de Banc */ }
        return this.#tour(ENTETE, `${CONSIGNES_LOUPS["vote-ouvrir"]}${annonce}${banc}`);
      }
      case "vote-clore": return this.#tour(ENTETE, CONSIGNES_LOUPS["vote-clore"]);
      case "bailli": {
        // Refusée (raison du système) : on n'y revient pas ce jour-là, le vote d'exécution suit.
        try { await api.ouvrirVote({ objet: "bailli", duree: 0 }); } catch (e) {
          m.electionRefusee = api.etat().tour;
          console.warn(`${ID} | pilote : élection du Bailli refusée`, e);
        }
        return;
      }
      case "bailli-clore": {
        let r = null;
        try { r = await api.cloreVote(); } catch (e) { console.warn(`${ID} | pilote : clôture de l'élection`, e); }
        m.annonceBailli = resultatElection(r, nom);
        return;
      }
      case "eliminer": {
        const etat = api.etat();
        const elus = (etat.vote.resultat?.elus ?? []).filter(id => api.villageois().find(a => a.id === id)?.system?.vivant !== false);
        return this.#tour(ENTETE, CONSIGNES_LOUPS.eliminer(elus.map(nom).join(" et ")));
      }
      case "denouement": {
        // Pas encore déclarée (le Glas final au soir du jour N, sans vote) : le système la tranche maintenant.
        if (!api.etat().vainqueur) {
          try { await api.verifierVictoire?.({ finDuJour: true }); } catch (e) { console.warn(`${ID} | pilote : victoire`, e); }
        }
        const e = api.etat();
        m.denouement = true;
        return this.#tour(ENTETE, CONSIGNES_LOUPS.denouement(libelleVainqueurPilote(e.vainqueur, nom, Boolean(e.peste?.active), glasAtteint(e) ? e.glas : 0)));
      }
      default: throw new Error(`étape inconnue : ${etape}`);
    }
  }

  async #executerAventure(etape) {
    const m = this.memoire;
    if (etape === "relance-combat") {
      const combat = game.combats?.active;
      const c = combat?.combatant;
      if (c && estCompagnon(c.actor)) return this.moteur.compagnons.tourDeCombat(combat);
      return this.#tour(ENTETE_AVENTURE, CONSIGNES_AVENTURE.combat(c?.name ?? "?"));
    }
    m.echanges++;
    if (etape === "scene") {
      await this.#tour(ENTETE_AVENTURE, game.system?.id === "lakour-survie" ? `${CONSIGNES_AVENTURE.scene} ${CONSIGNE_PILOTE_SURVIE}` : CONSIGNES_AVENTURE.scene);
      return this.moteur.compagnons.reagir();
    }
    // Un échange : les compagnons réagissent à la dernière narration ; le MJ leur répond (file normale du moteur).
    const dits = await this.moteur.compagnons.reagir();
    if (!dits.length) await this.#tour(ENTETE_AVENTURE, CONSIGNES_AVENTURE.relance);
  }

  // ---------- pour la console
  resume() {
    return { enMarche: this.enMarche, suspendu: this.suspendu, etapes: this.etapes, max: this.etapesMax(), dernierArret: this.dernierArret };
  }
}

// ------------------------------------------------------------------ Foundry
function avisAuMJ(texte) {
  try { ui.notifications?.info(texte); } catch { /* sans interface */ }
  try {
    return ChatMessage.implementation.create({
      content: `<p><strong>MJ IA</strong> — ${foundry.utils.escapeHTML(texte)}</p>`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
      flags: { [ID]: { ia: true, pilote: true } }
    }).catch(e => console.error(`${ID} | avis du pilote`, e));
  } catch (e) {
    console.error(`${ID} | avis du pilote`, e);
  }
}

// Les voix des IA ont fini de parler : file des voix OpenAI (narrateur et compagnons, en direct), puis la voix du navigateur
// du MJ (s'il l'entend). Jamais plus de max ms : une voix bloquée ne doit pas arrêter la partie.
export async function attendreFinVoix({ max = 120000 } = {}) {
  if (reglage("voix", "aucune") === "aucune") return;
  const debut = Date.now();
  const reste = () => Math.max(0, max - (Date.now() - debut));
  // File des voix d'IA (narrateur et compagnons, voix.js) : une voix ajoutée pendant l'attente est attendue aussi.
  await Promise.race([voixAuRepos(), new Promise(r => setTimeout(r, reste()))]);
  while (globalThis.speechSynthesis?.speaking && reste() > 0) await new Promise(r => setTimeout(r, 300));
}

function rafraichirConsole() {
  try { foundry.applications?.instances?.get(`${ID}-console`)?.render(); } catch { /* console fermée */ }
}
