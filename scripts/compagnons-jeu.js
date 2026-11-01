// Compagnons IA dans Foundry : qui est compagnon, ce qu'il sait (sa « vue »), ce qu'il dit dans le chat, ses choix aux
// Veillées, son tour de combat, ses réponses aux votes et choix secrets. La logique pure (cerveau, validation, repli,
// rythme) est dans compagnons.js ; la spécification dans docs/compagnons.md.
//
// Ce qu'un compagnon sait, et rien d'autre :
// - sa fiche (40k, Warcraft : le résumé de l'adaptateur ; Veillées : son rôle, son métier, sa maison) et sa personnalité ;
// - ce qu'on lui a dit en privé : aux Veillées, son carnet secret (gardé par le système chez le MJ actif) ; partout, les
//   messages qui lui sont destinés et ses propres choix secrets, gardés ici dans un réglage « client » du MJ actif ;
// - le chat PUBLIC récent (jamais un chuchotement) et ce que son personnage voit : la scène (jetons visibles) ou, aux
//   Veillées, l'état PUBLIC de la partie (celui que reçoit chaque navigateur).
// Jamais le prompt du MJ, sa mémoire de campagne, les rôles des autres, l'état secret de la nuit ni les jetons cachés.
import { ID } from "./constantes.js";
import { adaptateur } from "./adaptateurs.js";
import { versHTML } from "./utilitaires.js";
import {
  CerveauxCompagnons, BAVARDAGE, normaliserPersonnalite, texteBrut, choisirOrateurs, repliReplique
} from "./compagnons.js";

// Réglage du MJ IA, sans erreur s'il n'est pas enregistré (essais, système sans MJ IA).
const reglageSur = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
const couper = (t, max) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`);
const MONDE_VEILLEES = "Les Veillées de Brumecombe";

// ------------------------------------------------------------------ qui est compagnon
// Aux Veillées : un villageois sans joueur marqué system.compagnon (le système le sait). Ailleurs : le drapeau du MJ IA
// flags.lakour-mj-ia.compagnon = { temperament, parler, histoire }, posé par compagnon_ajouter.
export function estCompagnon(acteur) {
  if (!acteur) return false;
  if (acteur.type === "villageois") return Boolean(acteur.system?.compagnon) && !acteur.system?.joueur;
  return Boolean(acteur.flags?.[ID]?.compagnon);
}

export const personnaliteDe = acteur => normaliserPersonnalite(acteur?.flags?.[ID]?.compagnon, acteur?.id ?? "");

export const compagnonsDuMonde = () => game.actors.filter(estCompagnon);

// Les compagnons présents : vivants aux Veillées ; ailleurs, ceux dont un jeton visible est sur la scène active
// (tous s'il n'y a pas de scène).
export function compagnonsPresents() {
  const tous = compagnonsDuMonde();
  if (game.system?.id === "lakour-loups") return tous.filter(a => a.system?.vivant !== false);
  const scene = game.scenes?.active;
  if (!scene) return tous;
  const ids = new Set(scene.tokens.contents.filter(t => t.actor && !t.hidden).map(t => t.actor.id));
  return tous.filter(a => ids.has(a.id));
}

// Un compagnon par son nom (exact d'abord).
export function trouverCompagnon(nom) {
  const n = String(nom ?? "").trim().toLowerCase();
  if (!n) return null;
  const tous = compagnonsDuMonde();
  return tous.find(a => a.name.toLowerCase() === n) ?? tous.find(a => a.name.toLowerCase().includes(n)) ?? null;
}

// ------------------------------------------------------------------ ce qu'un compagnon sait en privé (MJ actif seulement)
// En mémoire, recopié dans le réglage client « compagnonsPrive » (localStorage du MJ) : jamais dans un document ni un
// réglage monde, que Foundry livre à tous les navigateurs. Aux Veillées, chaque entrée est liée à la partie en cours.
let prive = null;
const memoirePrivee = () => (prive ??= structuredClone(reglageSur("compagnonsPrive", {}) ?? {}));
const partieEnCours = () => {
  try { return game.lakourLoups?.etat?.().partie ?? ""; } catch { return ""; }
};

export async function noterPrive(acteurId, texte) {
  const m = memoirePrivee();
  m[acteurId] = [...(m[acteurId] ?? []), { texte: String(texte), quand: Date.now(), partie: partieEnCours() }].slice(-40);
  try { await game.settings.set(ID, "compagnonsPrive", m); } catch { /* sans stockage local : la mémoire suffit */ }
}

export function privesDe(acteurId) {
  const partie = partieEnCours();
  return (memoirePrivee()[acteurId] ?? []).filter(e => (e.partie ?? "") === partie).map(e => e.texte);
}

export async function oublierPrive(acteurId) {
  const m = memoirePrivee();
  delete m[acteurId];
  try { await game.settings.set(ID, "compagnonsPrive", m); } catch { /* idem */ }
}

// Pour les essais : repartir d'une mémoire vide.
export function reinitialiserPrive() {
  prive = null;
}

// Une nouvelle partie des Veillées : tous les compagnons oublient la précédente (mémoire et réglage « client » vidés).
export async function effacerPrive() {
  prive = {};
  try { await game.settings.set(ID, "compagnonsPrive", {}); } catch { /* sans stockage local : la mémoire suffit */ }
}

// ------------------------------------------------------------------ le chat public
// Les derniers messages que tout le monde voit : ni chuchotement (même adressé au MJ), ni message aveugle, ni message privé.
export function chatPublic({ messages = game.messages?.contents ?? [], max = 20 } = {}) {
  const lignes = [];
  for (const m of messages) {
    if (m.whisper?.length || m.blind) continue;
    const f = m.flags?.[ID] ?? {};
    if (f.prive) continue;
    const qui = m.speaker?.alias || m.author?.name || "?";
    const texte = texteBrut(m.content);
    const jets = (m.rolls ?? []).map(r => (r?.formula ? `${r.formula} = ${r.total}` : "")).filter(Boolean).join(" ; ");
    if (!texte && !jets) continue;
    lignes.push(`${qui} : ${couper(texte, 400)}${jets ? ` [${jets}]` : ""}`);
  }
  return lignes.slice(-max);
}

// ------------------------------------------------------------------ la vue d'un compagnon des Veillées
const libelle = (cle, defaut) => (game.i18n?.has?.(cle) ? game.i18n.localize(cle) : defaut);
const roleDe = a => a?.items?.find(i => i.type === "role") ?? null;
const metierDe = a => a?.items?.find(i => i.type === "metier") ?? null;

export function vueVeillees(acteur, { api = game.lakourLoups, messages } = {}) {
  // L'état PUBLIC seulement : celui que reçoit chaque navigateur (ni les choix de la nuit, ni le bilan, ni les primes, ni les
  // voix d'un vote en cours, ni la chronique secrète, ni les carnets des autres).
  const pub = api.logique.etatPublic(api.etat());
  const tous = api.villageois();
  const nom = id => tous.find(a => a.id === id)?.name ?? "?";
  const role = roleDe(acteur), metier = metierDe(acteur);
  // Son carnet secret : ce que SON joueur aurait reçu (sa carte de rôle, ce qu'il apprend la nuit, les mots du Messager).
  const entrees = api.carnet(acteur.id) ?? [];
  const carnet = entrees.map(e => [e.titre, texteBrut(e.html ?? e.texte)].filter(Boolean).join(" — ")).filter(Boolean);
  const autres = tous.filter(a => a.id !== acteur.id);
  const loup = acteur.system.camp === "meute";
  // Sa meute, telle que sa carte de rôle la nomme ; ses soupçons, d'après son carnet et les rôles révélés.
  const cartes = entrees.filter(e => e.html).map(e => texteBrut(e.html)).join("\n");
  const allies = loup ? autres.filter(a => cartes.includes(a.name)).map(a => a.id) : [];
  const suspects = loup ? [] : autres.filter(a => {
    const revele = a.system.revele && roleDe(a)?.system?.camp === "meute";
    return revele || entrees.some(e => !e.html && String(e.texte ?? "").includes(a.name) && /meute/i.test(e.texte ?? ""));
  }).map(a => a.id);
  const vivant = acteur.system.vivant !== false;
  const fiche = [
    `Tu es ${acteur.name}, villageois de Brumecombe${metier ? `, ${metier.name} de ton métier (public)` : ""}`
      + `${acteur.system.maison ? ` ; tu dors à « ${acteur.system.maison} »` : ""}.`,
    role ? `Ton rôle SECRET : ${role.name} (camp ${libelle(`LAKOUR_LOUPS.Camps.${acteur.system.camp}`, acteur.system.camp)}). ${texteBrut(role.system?.description)}` : "",
    role?.system?.victoire ? `Ta victoire : ${texteBrut(role.system.victoire)}` : "",
    metier?.system?.description ? `Ton métier : ${texteBrut(metier.system.description)}` : "",
    vivant ? "" : "Tu es MORT : tu te tais et tu ne votes plus.",
    acteur.system.silence ? "Tu es réduit au silence : tu ne parles pas au débat d'aujourd'hui." : ""
  ].filter(Boolean).join("\n");
  const v = pub.vote ?? {};
  const scene = [
    `Phase : ${libelle(`LAKOUR_LOUPS.Phases.${pub.phase}`, pub.phase)}, tour ${pub.tour}.${pub.vainqueur ? " La partie est terminée." : ""}`,
    `Au village : ${tous.map(a => `${a.name}${a.id === acteur.id ? " (toi)" : ""} — ${a.system.vivant ? "vivant" : "mort"}`
      + `${metierDe(a) ? `, ${metierDe(a).name}` : ""}${a.system.revele && roleDe(a) ? `, rôle révélé : ${roleDe(a).name}` : ""}`).join(" ; ")}.`,
    pub.morts?.length ? `Morts : ${pub.morts.map(m => `${nom(m.acteurId)} (${libelle(`LAKOUR_LOUPS.Causes.${m.cause}`, m.cause)}, tour ${m.tour})`).join(", ")}.` : "",
    v.ouvert ? `Vote ouvert${v.objet === "chapelle" ? " (Chapelle)" : ""} : candidats ${v.candidats.map(nom).join(", ")} ; ont déjà voté : ${(v.exprimes ?? []).map(nom).join(", ") || "personne"}.` : "",
    !v.ouvert && v.resultat?.decompte ? `Dernier vote : ${Object.entries(v.resultat.decompte).map(([id, n]) => `${nom(id)} ${n}`).join(", ") || "aucune voix"}.` : "",
    tous.some(a => a.system.vivant && a.system.silence) ? `Réduits au silence : ${tous.filter(a => a.system.vivant && a.system.silence).map(a => a.name).join(", ")}.` : "",
    pub.historique?.length ? `Annonces publiques récentes :\n${pub.historique.slice(-12).map(h => `· ${texteBrut(h.texte)}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
  return {
    id: acteur.id, nom: acteur.name, monde: MONDE_VEILLEES, jeu: "loups", personnalite: personnaliteDe(acteur), fiche,
    prive: [...carnet, ...privesDe(acteur.id)], public: chatPublic({ messages }), scene,
    autres: autres.map(a => ({ id: a.id, nom: a.name, vivant: a.system.vivant !== false })), allies, suspects,
    vivant, peutParler: vivant && !acteur.system.silence && pub.phase !== "nuit", tour: pub.tour
  };
}

// ------------------------------------------------------------------ la vue d'un compagnon d'aventure (40k, Warcraft)
export function vueAventure(acteur, { messages, scene = game.scenes?.active } = {}) {
  const sys = adaptateur();
  const visibles = scene ? scene.tokens.contents.filter(t => !t.hidden) : [];
  const genre = t => (estCompagnon(t.actor) ? "compagnon" : t.actor?.hasPlayerOwner ? "PJ" : t.disposition === -1 ? "hostile" : "PNJ");
  const combat = game.combats?.active;
  const lignes = [
    scene ? `Lieu : « ${scene.navName || scene.name} ».` : "Aucun lieu affiché.",
    visibles.length ? `Tu vois : ${visibles.map(t => `${t.name}${t.actor?.id === acteur.id ? " (toi)" : ` (${genre(t)})`}`).join(", ")}.` : "",
    combat?.started ? `Combat : round ${combat.round}, tour de ${combat.combatant?.name ?? "?"} ; ordre : `
      + `${combat.turns.filter(c => !c.hidden).map(c => c.name).join(", ")}.` : ""
  ];
  const autres = visibles.filter(t => t.actor && t.actor.id !== acteur.id).map(t => ({ id: t.actor.id, nom: t.name, vivant: true }));
  return {
    id: acteur.id, nom: acteur.name, monde: game.world?.title ?? game.system?.title ?? "", jeu: "aventure",
    personnalite: personnaliteDe(acteur), fiche: sys.resumer(acteur), prive: privesDe(acteur.id), public: chatPublic({ messages }),
    scene: lignes.filter(Boolean).join("\n"), autres, allies: [], suspects: [], vivant: true, peutParler: true, tour: combat?.round ?? 0
  };
}

export function vueDe(acteur, options = {}) {
  return acteur?.type === "villageois" && (options.api ?? game.lakourLoups) ? vueVeillees(acteur, options) : vueAventure(acteur, options);
}

// ------------------------------------------------------------------ noms des compagnons des Veillées
const NOMS_DE_SECOURS = ["Mathurin Vaudrey", "Ysaline Corbet", "Anselme Ferrand", "Odile Basquin", "Gaspard Lerouge", "Clémence Aubrac",
  "Firmin Delorme", "Rosalie Brunet", "Eudes Malivert", "Perrine Sauvage", "Bastien Corbière", "Léontine Gaudry"];

// n noms tirés de la table « Noms de villageois » du module de contenu (lakour-veillees.tables), sans ceux déjà pris.
export async function nomsPourCompagnons(n, { exclus = [] } = {}) {
  let noms = [];
  try {
    const pack = game.packs?.get("lakour-veillees.tables");
    const docs = pack ? await pack.getDocuments() : [];
    const table = docs.find(d => d.flags?.["lakour-veillees"]?.cle === "noms-de-villageois") ?? docs.find(d => /noms/i.test(d.name ?? ""));
    const resultats = table ? [...(table.results?.contents ?? table.results ?? [])] : [];
    noms = resultats.map(r => texteBrut(r.description || r.name || r.text)).filter(Boolean);
  } catch { /* pas de table : noms de secours */ }
  if (!noms.length) noms = [...NOMS_DE_SECOURS];
  const pris = new Set(exclus.map(x => String(x).toLowerCase()));
  const libres = [...new Set(noms)].filter(x => !pris.has(x.toLowerCase()));
  for (let i = libres.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [libres[i], libres[j]] = [libres[j], libres[i]];
  }
  const sortie = libres.slice(0, n);
  for (let i = sortie.length; i < n; i++) sortie.push(`Villageois ${i + 1}`);
  return sortie;
}

// ------------------------------------------------------------------ les compagnons en jeu (navigateur du MJ actif)
export class Compagnons {
  // moteur : le MoteurMJ (compteur et budget de la séance, file des messages). fournisseur() : le fournisseur du modèle des
  // compagnons (fournisseurs/index.js, fournisseurCompagnons), null = repli sans IA ; modele() : son identifiant (pour le coût).
  constructor({ moteur = null, fournisseur = () => null, modele = () => "", graine = null } = {}) {
    this.moteur = moteur;
    this.cerveaux = new CerveauxCompagnons({
      fournisseur: () => { try { return fournisseur(); } catch { return null; } },
      modele: () => { try { return modele(); } catch { return ""; } },
      compter: (usage, m) => this.moteur?.compter?.(usage, m),
      budgetDepasse: () => Boolean(this.moteur?.budgetDepasse?.()),
      graine: graine ?? `compagnons|${game.world?.id ?? ""}`
    });
    this.derniere = new Map();   // acteurId -> rang de sa dernière réplique (ceux qui ont parlé le moins récemment d'abord)
    this.horloge = 0;
  }

  vue(acteur, options = {}) {
    return vueDe(acteur, options);
  }

  maxRepliques() {
    return BAVARDAGE[reglageSur("bavardageCompagnons", "normal")] ?? BAVARDAGE.normal;
  }

  // Une réplique dans le chat, sous le nom du compagnon (comme un joueur). action : déclaration de combat, déjà transmise
  // au moteur (drapeau ia : le moteur ne la reçoit pas une seconde fois).
  // La didascalie en tête (« *Il croise les bras.* — … ») s'affiche en italique, avec le style « didascalie ». Le texte brut est
  // gardé dans les drapeaux : le MJ IA le lit tel quel (il sait ainsi ce qui est déjà montré).
  poster(acteur, texte, { action = false } = {}) {
    return ChatMessage.implementation.create({
      content: versHTML(texte).replace(/^<p><em>/, '<p><em class="lakour-mjia-didascalie">'),
      speaker: { alias: acteur.name, actor: acteur.id },
      flags: { [ID]: { compagnon: acteur.id, texte: String(texte), ...(action ? { ia: true, action: true } : {}) } }
    });
  }

  // Après une réponse du MJ : au plus max compagnons présents réagissent, une réplique chacun. Ceux que le texte cite
  // parlent d'abord. Rend [{ acteurId, nom, texte, source }].
  async reagir({ mentions = "", max = this.maxRepliques(), messages } = {}) {
    if (max <= 0) return [];
    const parlants = compagnonsPresents().map(a => ({ id: a.id, nom: a.name, acteur: a, vue: this.vue(a, { messages }) }))
      .filter(c => c.vue.peutParler);
    const dits = [];
    for (const c of choisirOrateurs(parlants, { max, mentions, derniere: this.derniere })) {
      const r = await this.cerveaux.parler(c.vue);
      if (!r.texte) continue;
      this.derniere.set(c.id, ++this.horloge);
      await this.poster(c.acteur, r.texte);
      dits.push({ acteurId: c.id, nom: c.nom, texte: r.texte, source: r.source });
    }
    return dits;
  }

  // Le débat du jour aux Veillées : les compagnons vivants (et non réduits au silence) prennent la parole.
  debattre(options = {}) {
    return this.reagir(options);
  }

  // Son tour de combat : il déclare son action dans le chat ; le MJ IA la résout avec les vrais jets (jet_compagnon).
  async tourDeCombat(combat) {
    const c = combat?.combatant;
    const acteur = c?.actor;
    if (!estCompagnon(acteur)) return null;
    const vue = this.vue(acteur);
    const r = await this.cerveaux.parler({ ...vue, peutParler: true }, { combat: true });
    const texte = r.texte || repliReplique(vue, this.cerveaux.graine, { combat: true });
    await this.poster(acteur, texte, { action: true });
    this.moteur?.signaler(`⚔️ Round ${combat.round} : c'est au tour de ${c.name}, compagnon IA. Il déclare : « ${texte} » `
      + "Résous son action comme celle d'un joueur, avec les vrais jets de SA fiche lancés directement (jet_compagnon pour ses tests, "
      + "lancer_des pour les dégâts), décris le résultat, puis appelle passer_tour.", { immediat: true, source: "compagnon" });
    return texte;
  }

  // Résolveur des Veillées (api.resolveurs.compagnon) : choix de nuit, mot du Messager, vote.
  async resoudreLoups(demande) {
    const acteur = game.actors.get(demande.acteurId);
    if (!estCompagnon(acteur)) return demande.mode === "texte" ? "" : [];
    const vue = this.vue(acteur);
    if (demande.mode === "texte") {
      const r = await this.cerveaux.decider(vue, { type: "texte", invite: demande.invite, max: demande.max, cle: `texte|${demande.id}` });
      if (r.texte) await noterPrive(acteur.id, `Nuit ${vue.tour} : tu as confié ce mot au Messager : « ${r.texte} ».`);
      return r.texte;
    }
    const vote = demande.type === "vote";
    const candidats = (demande.candidats ?? []).map(c => ({ id: c.id, nom: c.nom }));
    const r = await this.cerveaux.decider(vue, { type: "cibles", invite: demande.invite, candidats, nombre: demande.nombre ?? 1, vote,
      cle: `${demande.type}|${demande.id}` });
    const noms = r.cibles.map(id => candidats.find(c => c.id === id)?.nom).filter(Boolean);
    await noterPrive(acteur.id, vote
      ? `Vote du tour ${vue.tour} : ${noms.length ? `tu as voté contre ${noms[0]}` : "tu t'es abstenu"}.`
      : `Nuit ${vue.tour} (« ${demande.invite} ») : tu as choisi ${noms.join(", ") || "de passer"}.`);
    return r.cibles;
  }

  // Vote de groupe et choix secret (decisions.js) : index de l'option choisie, ou null (abstention, passe).
  async deciderOption(acteurId, { question, options, secret = false }) {
    const acteur = game.actors.get(acteurId);
    if (!estCompagnon(acteur)) return null;
    const r = await this.cerveaux.decider(this.vue(acteur), { type: "option", question, options, cle: `option|${question}` });
    if (secret || r.choix !== null) {
      await noterPrive(acteurId, `${secret ? "Choix secret" : "Vote du groupe"} « ${question} » : `
        + `${r.choix === null ? "tu as passé" : `tu as répondu « ${options[r.choix]} »`}.`);
    }
    return r.choix;
  }
}
