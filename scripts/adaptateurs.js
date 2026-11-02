// Ce qui dépend du système de jeu : comment lancer un test, quelles compétences existent,
// comment résumer une fiche pour l'IA. Tout le reste du module est commun.
// Les règles elles-mêmes ne sont PAS recopiées ici : l'IA les lit dans les compendiums des livres achetés.

import { versMetres, moyenneFormule } from "./tour-logique.js";

const texte = v => (v === undefined || v === null || v === "" ? "?" : v);

// Réglages d'un test demandé par l'IA (outil demander_jet), communs à tous les systèmes :
// { difficulte: "aucune" | "tres-facile" … "tres-ardue", modificateur, dr, avantage, desavantage, titre }.
export const DIFFICULTES = ["aucune", "tres-facile", "facile", "routiniere", "exigeante", "difficile", "ardue", "tres-ardue"];
const IMPMAL_DIFF = { "tres-facile": "veryEasy", facile: "easy", routiniere: "routine", exigeante: "challenging", difficile: "difficult", ardue: "hard", "tres-ardue": "veryHard" };
const DND_DD = { "tres-facile": 5, facile: 10, routiniere: 12, exigeante: 15, difficile: 20, ardue: 25, "tres-ardue": 30 };
// Imperium Maledictum : modificateur de la cible selon la difficulté (même échelle que la fenêtre de test du système).
const IMPMAL_BONUS = { "tres-facile": 60, facile: 40, routiniere: 20, exigeante: 0, difficile: -10, ardue: -20, "tres-ardue": -30 };
// Caractéristique de chaque compétence, si la fiche ne la donne pas.
const IMPMAL_CARAC = { athletics: "str", awareness: "per", dexterity: "ag", discipline: "wil", fortitude: "tgh", intuition: "per",
  linguistics: "int", logic: "int", lore: "int", medicae: "int", melee: "ws", navigation: "int", piloting: "ag", presence: "wil",
  psychic: "wil", ranged: "bs", rapport: "fel", reflexes: "ag", stealth: "ag", tech: "int" };

// Test au d100 d'Imperium Maledictum : réussite si le jet est sous la cible (01 à 05 réussissent toujours, 96 à 100 échouent
// toujours) ; degrés de réussite = dizaines de la cible moins dizaines du jet.
export function testD100(cible, jet) {
  const reussite = jet <= 5 || (jet < 96 && jet <= cible);
  return { reussite, dr: Math.floor(cible / 10) - Math.floor(jet / 10) };
}

const impmal = {
  id: "impmal",
  // Tour par tour (tour-par-tour.js) : économie d'actions, défense, attaques et jets du système (plus bas, TOUR_IMPMAL).
  get tour() { return TOUR_IMPMAL; },
  typePnj: "npc",
  // Expérience : total gagné ; ce qui est dépensé se calcule d'après les avances, talents… (system.xp.spent).
  xp: acteur => ({ total: acteur.system.xp?.total ?? 0, disponible: (acteur.system.xp?.total ?? 0) - (acteur.system.xp?.spent ?? 0) }),
  cheminXp: "system.xp.total",
  devises: ["solars"],
  bourse: acteur => ({ solars: acteur.system.solars ?? 0 }),
  majBourse: bourse => ({ "system.solars": bourse.solars }),
  cheminNotesMJ: "system.notes.gm",
  consignes: "Système Imperium Maledictum (Warhammer 40,000, Cubicle 7) : tests au d100 sous la valeur "
    + "de caractéristique + compétence, degrés de réussite (DR / SL). Respecte le ton de l'univers : "
    + "l'Imperium est oppressant, la foi et la peur gouvernent, le Warp corrompt. "
    + "Pour une difficulté ou une règle précise, consulte le livre de base dans les compendiums. "
    + "Supériorité (outil superiorite) : la réserve commune de l'équipe en combat, ajoutée en DR aux tests qui l'utilisent. Au début "
    + "d'un combat, +1 par renseignement confirmé que le plan des personnages exploite (plafond 3 à 4), 0 s'ils tombent dans une "
    + "embuscade ; remets-la à 0 à la fin du combat. demander_jet peut pré-cocher « Utiliser la Supériorité » (superiorite).",
  competences(acteur) {
    const config = game.impmal?.config ?? CONFIG.IMPMAL ?? {};
    const caracs = Object.keys(acteur?.system?.characteristics ?? {}).map(cle => ({
      cle, libelle: game.i18n.localize(config.characteristics?.[cle] ?? cle)
    }));
    const comps = Object.keys(acteur?.system?.skills ?? {}).map(cle => ({
      cle, libelle: game.i18n.localize(config.skills?.[cle] ?? cle)
    }));
    return [...comps, ...caracs];
  },
  // La fenêtre de test du système s'ouvre pré-remplie (context.fields) ; le joueur valide ou ajuste.
  async lancer(acteur, cle, reglages = {}) {
    const fields = {};
    if (IMPMAL_DIFF[reglages.difficulte]) fields.difficulty = IMPMAL_DIFF[reglages.difficulte];
    if (reglages.modificateur) fields.modifier = reglages.modificateur;
    if (reglages.dr) fields.SL = reglages.dr;
    if (reglages.avantage) fields.advantage = reglages.avantage;
    if (reglages.desavantage) fields.disadvantage = reglages.desavantage;
    // Supériorité : la case « Utiliser la Supériorité » n'existe qu'en combat, pour un personnage joueur (showSuperiority du
    // système). Pré-cochée seulement là : ailleurs, invisible, elle ajouterait la Supériorité aux DR en silence.
    if (reglages.superiorite && acteur.inCombat && acteur.hasPlayerOwner) fields.useSuperiority = true;
    const contexte = { fields, ...(reglages.titre ? { appendTitle: ` — ${reglages.titre}` } : {}) };
    if (acteur.system.characteristics?.[cle]) return acteur.setupCharacteristicTest(cle, contexte);
    return acteur.setupSkillTest({ key: cle }, contexte);
  },
  // Jet lancé directement, sans fenêtre (compagnon IA : personne n'est là pour la valider) : d100 contre la valeur de la fiche,
  // difficulté et modificateur compris, posté au chat. -> { total, cible, reussite, dr, texte }
  async lancerDirect(acteur, cle, reglages = {}) {
    const s = acteur.system ?? {};
    const carac = s.characteristics?.[cle];
    const comp = s.skills?.[cle];
    if (!carac && !comp) throw new Error(`Compétence ou caractéristique inconnue : ${cle}.`);
    const valeurCarac = c => Number(c?.total ?? c?.value ?? 0);
    const base = carac ? valeurCarac(carac)
      : Number(comp.total ?? (valeurCarac(s.characteristics?.[comp.characteristic ?? IMPMAL_CARAC[cle]]) + 5 * Number(comp.advances ?? 0)));
    const cible = base + (IMPMAL_BONUS[reglages.difficulte] ?? 0) + Number(reglages.modificateur ?? 0);
    const jet = await new Roll("1d100").evaluate();
    const r = testD100(cible, jet.total);
    const texte = `${reglages.titre || cle} : ${jet.total} pour ${cible} — ${r.reussite ? "réussite" : "échec"} (${r.dr >= 0 ? "+" : ""}${r.dr} DR)`;
    await jet.toMessage({ speaker: { alias: acteur.name }, flavor: texte });
    return { total: jet.total, cible, ...r, texte: `${acteur.name}, ${texte}.` };
  },
  resumer(acteur) {
    const s = acteur.system ?? {};
    const caracs = Object.entries(s.characteristics ?? {}).map(([k, c]) => `${k} ${texte(c.total ?? c.value)}`).join(", ");
    const comps = Object.entries(s.skills ?? {}).filter(([, c]) => (c.advances ?? 0) > 0)
      .map(([k, c]) => `${k} +${c.advances}`).join(", ");
    const blessures = s.combat?.wounds;
    // Fiche de personnage joueur sans origine, faction ou rôle : l'IA doit la compléter (creer_personnage, acteur_existant).
    const manquants = acteur.type === "character"
      ? [["origin", "origine"], ["faction", "faction"], ["role", "rôle"]].filter(([t]) => !acteur.items?.some(i => i.type === t)).map(([, n]) => n) : [];
    return `${acteur.name} (${acteur.type}) — Caractéristiques : ${caracs || "?"}`
      + (comps ? ` — Compétences entraînées : ${comps}` : "")
      + (manquants.length ? ` — FICHE INCOMPLÈTE, il manque : ${manquants.join(", ")} (complète-la avec creer_personnage, acteur_existant)` : "")
      + (blessures ? ` — Blessures : ${texte(blessures.value)}/${texte(blessures.max)}` : "");
  }
};

const dnd5e = {
  id: "dnd5e",
  get tour() { return TOUR_DND5E; },
  typePnj: "npc",
  xp: acteur => ({ total: acteur.system.details?.xp?.value ?? 0, prochainNiveau: acteur.system.details?.xp?.max ?? null }),
  cheminXp: "system.details.xp.value",
  devises: ["pp", "gp", "ep", "sp", "cp"],
  bourse: acteur => ({ ...(acteur.system.currency ?? {}) }),
  majBourse: bourse => ({ "system.currency": bourse }),
  cheminNotesMJ: "system.details.biography.value",
  consignes: "Système D&D 5e : tests au d20 + modificateur contre un DD (facile 10, moyen 15, difficile 20, "
    + "très difficile 25). Avantage / désavantage selon la situation. "
    + "Pour un monstre, un sort ou un objet, cherche d'abord dans les compendiums. "
    + "Contrats (tableau des contrats d'une ville, Warcraft) : tires-en trois par jour de jeu (lancer_table, nombre 3, exclure ceux "
    + "déjà pris ou accomplis) ; à la fin d'un contrat, paie les po (bourse) et avance la réputation indiquée (rep-<faction>) avec "
    + "horloge (avancer, nom rep-<faction>, valeur = les points du contrat). "
    + "En combat, l'état du jeu te rappelle les actions légendaires restantes des PNJ (à la fin du tour d'un autre) et les actions "
    + "de repaire (une par round, à leur compte d'initiative) : joue-les.",
  competences() {
    const C = CONFIG.DND5E ?? {};
    const comps = Object.entries(C.skills ?? {}).map(([cle, v]) => ({ cle, libelle: game.i18n.localize(v.label ?? cle) }));
    const caracs = Object.entries(C.abilities ?? {}).flatMap(([cle, v]) => {
      const nom = game.i18n.localize(v.label ?? cle);
      return [{ cle: `carac:${cle}`, libelle: `Test de ${nom}` }, { cle: `sauv:${cle}`, libelle: `Sauvegarde de ${nom}` }];
    });
    return [...comps, ...caracs];
  },
  // Difficulté -> DD ; avantage / désavantage ; modificateur ajouté au jet comme bonus de situation.
  async lancer(acteur, cle, reglages = {}) {
    const config = {
      ...(DND_DD[reglages.difficulte] ? { target: DND_DD[reglages.difficulte] } : {}),
      advantage: (reglages.avantage ?? 0) > (reglages.desavantage ?? 0),
      disadvantage: (reglages.desavantage ?? 0) > (reglages.avantage ?? 0),
      ...(reglages.modificateur ? { rolls: [{ parts: ["@situational"], data: { situational: reglages.modificateur } }] } : {})
    };
    const [genre, carac] = cle.split(":");
    if (genre === "carac") return acteur.rollAbilityCheck({ ...config, ability: carac });
    if (genre === "sauv") return acteur.rollSavingThrow({ ...config, ability: carac });
    return acteur.rollSkill({ ...config, skill: cle });
  },
  // Jet lancé directement, sans fenêtre (compagnon IA) : le jet du système, dialogue de configuration sauté (configure: false),
  // carte au chat comme d'habitude. -> { total, dd, reussite, texte }
  async lancerDirect(acteur, cle, reglages = {}) {
    const dd = DND_DD[reglages.difficulte] ?? null;
    const config = {
      ...(dd ? { target: dd } : {}),
      advantage: (reglages.avantage ?? 0) > (reglages.desavantage ?? 0),
      disadvantage: (reglages.desavantage ?? 0) > (reglages.avantage ?? 0),
      ...(reglages.modificateur ? { rolls: [{ parts: ["@situational"], data: { situational: reglages.modificateur } }] } : {})
    };
    const sansFenetre = { configure: false };
    const [genre, carac] = cle.split(":");
    const jets = genre === "carac" ? await acteur.rollAbilityCheck({ ...config, ability: carac }, sansFenetre)
      : genre === "sauv" ? await acteur.rollSavingThrow({ ...config, ability: carac }, sansFenetre)
        : await acteur.rollSkill({ ...config, skill: cle }, sansFenetre);
    const jet = Array.isArray(jets) ? jets[0] : jets;
    if (!jet) throw new Error("Le jet n'a pas eu lieu.");
    const reussite = dd ? jet.total >= dd : null;
    return { total: jet.total, dd, reussite,
      texte: `${acteur.name}, ${reglages.titre || cle} : ${jet.total}${dd ? ` contre DD ${dd} — ${reussite ? "réussite" : "échec"}` : ""}.` };
  },
  resumer(acteur) {
    const s = acteur.system ?? {};
    const a = s.attributes ?? {};
    const caracs = Object.entries(s.abilities ?? {}).map(([k, v]) => `${k} ${texte(v.value)}`).join(", ");
    const classes = acteur.items?.filter(i => i.type === "class").map(i => `${i.name} ${i.system?.levels ?? ""}`).join(", ");
    // Fiche de personnage joueur sans peuple, historique ou classe : l'IA doit la compléter (creer_personnage_dnd5e).
    const manquants = acteur.type === "character"
      ? [["race", "peuple"], ["background", "historique"], ["class", "classe"]].filter(([t]) => !acteur.items?.some(i => i.type === t)).map(([, n]) => n) : [];
    return `${acteur.name} (${acteur.type}${classes ? `, ${classes}` : ""}) — PV ${texte(a.hp?.value)}/${texte(a.hp?.max)}, `
      + `CA ${texte(a.ac?.value)} — ${caracs}`
      + (manquants.length ? ` — FICHE INCOMPLÈTE, il manque : ${manquants.join(", ")} (complète-la avec creer_personnage_dnd5e, acteur_existant)` : "");
  }
};

// Jeu de loup-garou (système lakour-loups) : pas de dés, le MJ IA est le narrateur. Il connaît tous les rôles (il en a besoin
// pour mener la nuit) mais ne les révèle jamais en public : seul message_prive au joueur concerné, ou la révélation d'un mort.
const loups = {
  id: "lakour-loups",
  typePnj: "villageois",
  cheminNotesMJ: null,
  xp: () => ({ total: 0 }),
  cheminXp: null,
  devises: [],
  bourse: () => ({}),
  majBourse: () => ({}),
  consignes: "Jeu « Les Veillées de Brumecombe » : un village, des loups cachés parmi les joueurs, des nuits où ils frappent et des "
    + "jours où le village débat et vote. Tu es le NARRATEUR : tu ne joues pour aucun camp, tu ne donnes jamais d'indice sur un rôle "
    + "secret, tu racontes les nuits et les aubes avec une ambiance gothique d'automne, tu animes le débat (relances, rappels du temps, "
    + "équité de parole) sans l'orienter. Tu ne racontes ni les gestes ni les paroles des joueurs et des compagnons IA : ils disent "
    + "eux-mêmes leurs gestes (didascalie en italique en tête de réplique) ; ne répète pas, ne paraphrase pas, ne commente pas ce qu'ils "
    + "viennent de dire. Tu te limites à la nuit, à l'aube et aux morts, à l'animation du débat (tours de parole, temps, relances) et "
    + "aux résultats (vote, exécution, victoire), en peu de mots pendant que le village débat. Les noms : ne nomme un villageois que "
    + "pour le désigner quand il le faut (la victime de l'aube, le désigné du vote, celui à qui tu donnes ou reprends la parole) ; "
    + "n'énumère jamais les vivants, les présents, les morts ni les voix : le bandeau, la carte et la Table les montrent déjà. Parle au "
    + "village (« vous », « Brumecombe »), pas à une liste. Composition : compose-la en secret pour le "
    + "nombre de joueurs (loups_composer, qui varie les rôles d'une partie à l'autre, ou loups_distribuer en mode auto) et ne l'annonce "
    + "JAMAIS : ni les rôles en jeu, ni le nombre de loups (le village doit les découvrir) ; si les joueurs veulent choisir eux-mêmes, prends "
    + "leur liste. Peste noire : très rarement (ou si on te la demande), une partie n'a aucun loup ; la peste emporte un villageois chaque "
    + "nuit, raconté exactement comme une victime de la meute. Tu le sais (distribution secrète, état du jeu), tu ne le dis jamais, ni "
    + "par allusion, avant la fin. La première nuit, tu choisis sa victime (loups_nuit, peste_victime) ; ensuite, sa dernière victime la "
    + "désigne. Quand un joueur crie « C'est la peste noire ! », loups_peste : juste, le village gagne ; faux, le crieur est pendu. "
    + "Le Bailli est une charge PUBLIQUE : un jour sans Bailli vivant, son élection (loups_vote ouvrir, objet « bailli ») passe avant le "
    + "vote d'exécution ; le système gère seul sa voix double, le départage des égalités et sa succession à sa mort : annonce-les, sans "
    + "rien trancher à sa place (loups_bailli nommer seulement pour corriger, ou quand on te le dit à voix haute). Le Registre du "
    + "greffier est public (votes voix par voix, morts et leur cause publique, déclarations) : tu l'as dans l'état du jeu, ne le récite "
    + "pas ; une déclaration n'est qu'une parole, ne la confirme ni ne l'infirme jamais ; inscris celle qu'un joueur te dicte "
    + "(loups_registre declarer). Les Masques de veillée sont un secret de la meute : ne les mentionne jamais, et ne dis jamais qu'un "
    + "rôle n'est pas en jeu. "
    + "Déroulement : loups_distribuer (mode roles avec la composition retenue, ou auto), "
    + "puis en boucle loups_nuit (la nuit entière, "
    + "rôles réveillés en secret), récit de l'aube, débat, élection du Bailli s'il n'y en a pas, loups_vote (ouvrir puis clore), "
    + "loups_eliminer de l'élu, jusqu'à la victoire. "
    + "Un rôle n'est révélé qu'à la mort (selon le réglage). Les morts se taisent. "
    + "Le plateau se met en scène TOUT SEUL : le système pose un jeton verrouillé par villageois, les ramène chacun devant sa maison "
    + "la nuit, les range en cercle sur la place pour le débat et le vote, porte les morts au cimetière, règle la lumière et révèle les "
    + "rôles sur les jetons. Ne déplace donc aucun jeton de villageois (ni placer_jetons, ni amener_joueurs pour eux), ne change "
    + "pas la lumière : raconte. Les joueurs agissent depuis leur bandeau et la carte (choix de nuit et vote au clic). "
    + "En fin de partie, après le dénouement, propose « une autre partie avec les mêmes joueurs ? » ; s'ils le veulent, loups_rejouer "
    + "(chaque partie repart de zéro : n'évoque jamais une partie précédente).",
  competences() { return []; },
  async lancer() { throw new Error("Pas de dés dans ce jeu : les rôles agissent la nuit (loups_nuit), le village vote le jour (loups_vote)."); },
  resumer(acteur) {
    const s = acteur.system ?? {};
    const role = acteur.items?.find(i => i.type === "role");
    const metier = acteur.items?.find(i => i.type === "metier");
    const joueur = game.users?.get?.(s.joueur)?.name;
    return `${acteur.name}${joueur ? ` [joué par ${joueur}]` : s.compagnon ? " [compagnon IA]" : ""} — ${s.vivant === false ? "MORT" : "vivant"}`
      + `${metier ? ` — métier public : ${metier.name}` : ""}`
      + `${role ? ` — rôle ${s.revele ? "révélé" : "SECRET (ne le dis à personne)"} : ${role.name} (camp ${s.camp ?? role.system?.camp})` : ""}`
      + `${s.maison ? ` — dort à : ${s.maison}` : ""}${s.amoureux ? " — amoureux lié" : ""}`;
  }
};

const generique = {
  id: "generique",
  typePnj: null,
  xp: () => ({ total: 0 }),
  cheminXp: null,
  devises: [],
  bourse: () => ({}),
  majBourse: () => ({}),
  cheminNotesMJ: null,
  consignes: "Système sans adaptateur dédié : demande aux joueurs de lancer eux-mêmes leurs dés "
    + "en précisant la formule, et consulte les compendiums pour les règles.",
  competences() { return []; },
  async lancer() { throw new Error("Ce système n'a pas d'adaptateur : le joueur lance les dés lui-même."); },
  resumer(acteur) { return `${acteur.name} (${acteur.type})`; }
};

// ------------------------------------------------------------------ tour par tour : ce qui est propre à chaque système
// Même forme pour les deux systèmes (tour-par-tour.js ne connaît qu'elle) :
//   economie : [{ cle, libelle, n }] ; ressourceDe(activation) -> cle de l'économie occupée (ou null) ;
//   combattant(acteur) -> { pv, pvMax, pvTexte, defense, aTerre, mort, jetsMort, conditions, effets, concentration,
//                          regeneration, legendaires, mouvementMax (m), allure } ;
//   attaques(acteur) -> [{ id, nom, img, genre, type: "melee" | "distance", allonge, portee: { normale, longue }, moyenne,
//                          bonus, degats, activation }] (portées en mètres) ;
//   lancer(acteur, attaque) : le VRAI jet du système, avec sa fenêtre (MJ, joueur) ;
//   resoudre(acteur, attaque, cible) -> { touche, degats, texte } : résolution directe, sans fenêtre (PNJ accepté, compagnon) ;
//   degats(acteur, attaque, options) ; appliquer(acteur, n) ; jetMort(acteur, options) ; sauvegarde(acteur, obligation) ;
//   lancerInitiative(combat) ; lireMessage(message) -> { genre, activation, attaqueId, total, touche, degats, phase… } | null.
const etatsDe = acteur => [...(acteur?.statuses ?? [])];
const nomCondition = id => {
  const s = (globalThis.CONFIG?.statusEffects ?? []).find(e => e.id === id);
  return s ? game.i18n.localize(s.name ?? s.label ?? id) : id;
};
const signe = n => `${n >= 0 ? "+" : ""}${n}`;
const totalDesJets = jets => (jets ?? []).reduce((t, r) => t + Number(r?.total ?? 0), 0);
const posterJet = (jet, acteur, texte) => jet.toMessage({ speaker: { alias: acteur?.name ?? "?" }, flavor: texte });
// Effets à durée (v14 : duration.remaining en rounds, duration.expired) ; la concentration a son propre rappel.
function effetsADuree(acteur) {
  return [...(acteur?.appliedEffects ?? acteur?.effects ?? [])]
    .filter(e => e && !e.disabled && e.isTemporary && !e.statuses?.has?.("concentrating"))
    .map(e => {
      const d = e.duration ?? {};
      const restant = Number.isFinite(d.remaining) ? d.remaining : null;
      return { id: e.uuid ?? e.id, nom: e.name, restant, fini: Boolean(d.expired ?? (restant !== null && restant <= 0)) };
    });
}

// Imperium Maledictum ne mesure pas les portées : les armes ont une bande (courte, moyenne, longue, extrême). Repères en mètres
// pour aider le MJ (à confirmer dans le livre de base, chapitre Combat ; le MJ tranche). Une bande plus loin : tir possible,
// avec malus (portée « longue » de la proposition).
export const PORTEES_IMPMAL = { immediate: 2, short: 10, medium: 30, long: 100, extreme: 300 };
const BANDES_IMPMAL = ["immediate", "short", "medium", "long", "extreme"];
// Allure (system.combat.speed.land.value) -> repère en mètres d'un déplacement, pour la proposition d'action des PNJ.
export const MOUVEMENT_IMPMAL = { slow: 4, normal: 8, fast: 12, swift: 16 };

// Test opposé d'Imperium Maledictum (OpposedTestResult du système) : DR de l'attaquant moins DR du défenseur ; à égalité, la
// compétence la plus haute l'emporte.
export function gagneOpposition(a, d, cibleA, cibleD) {
  const dr = a.dr - d.dr;
  return dr > 0 || (dr === 0 && cibleA > cibleD);
}

function attaqueImpmal(item, { melee, bande, degats, cible, genre }) {
  const i = BANDES_IMPMAL.indexOf(bande);
  const normale = melee ? null : PORTEES_IMPMAL[bande] ?? PORTEES_IMPMAL.short;
  const longue = melee ? null : PORTEES_IMPMAL[BANDES_IMPMAL[Math.min(BANDES_IMPMAL.length - 1, Math.max(0, i) + 1)]];
  const base = Number(degats ?? 0);
  return {
    id: item.id, nom: item.name, img: item.img, genre, type: melee ? "melee" : "distance", allonge: null,
    portee: melee ? null : { normale, longue }, bande: bande ?? "", moyenne: base + 1, degatsBase: base,
    cible: Number(cible ?? 0), bonus: `${cible ?? "?"}`, degats: `${base} + DR`, activation: "action"
  };
}

const TOUR_IMPMAL = {
  economie: [{ cle: "action", libelle: "Action", n: 1 }, { cle: "deplacement", libelle: "Déplacement", n: 1 }],
  ressourceDe: activation => (activation ? "action" : null),
  defenseLibelle: "Défense",
  // Une attaque est un test opposé : le défenseur répond (esquive, parade, sans opposition) avant les dégâts.
  testOppose: true,
  combattant(acteur) {
    const s = acteur?.system ?? {}, c = s.combat ?? {};
    const w = c.wounds ?? {}, crit = c.criticals ?? {};
    const etats = etatsDe(acteur);
    const mort = etats.includes("dead") || (Number.isFinite(Number(crit.max)) && Number(crit.value ?? 0) > Number(crit.max));
    const aTerre = mort || etats.includes("unconscious")
      || (acteur?.type !== "character" && Number(w.max) > 0 && Number(w.value ?? 0) >= Number(w.max));
    const allure = c.speed?.land?.value ?? "normal";
    const comp = cle => s.skills?.[cle]?.total;
    const libAllure = game.impmal?.config?.speeds?.[allure];
    return {
      pv: Math.max(0, Number(w.max ?? 0) - Number(w.value ?? 0)), pvMax: Number(w.max ?? 0),
      pvTexte: `Blessures ${Number(w.value ?? 0)}/${Number(w.max ?? 0)}${Number(crit.value) ? ` · critiques ${crit.value}/${crit.max ?? "?"}` : ""}`,
      defense: [comp("reflexes") !== undefined ? `Réflexes ${comp("reflexes")}` : "", comp("melee") !== undefined ? `Mêlée ${comp("melee")}` : ""]
        .filter(Boolean).join(" · ") || "?",
      aTerre, mort, jetsMort: null, conditions: etats.filter(e => e !== "dead").map(nomCondition), effets: effetsADuree(acteur),
      concentration: "", regeneration: "", legendaires: null, repaire: null,
      mouvementMax: MOUVEMENT_IMPMAL[allure] ?? null, allure: libAllure ? game.i18n.localize(libAllure) : allure
    };
  },
  attaques(acteur) {
    const sortie = [];
    const cibleComp = cle => Number(acteur?.system?.skills?.[cle]?.total ?? 0);
    for (const item of acteur?.items ?? []) {
      const sy = item.system ?? {};
      if (item.type === "weapon") {
        if (sy.isEquipped === false || sy.equipped?.value === false) continue;
        const comp = sy.getSkill?.(acteur);
        const cible = comp && typeof comp === "object" ? Number(comp.system?.total ?? 0) : cibleComp(typeof comp === "string" ? comp : sy.attackType);
        sortie.push(attaqueImpmal(item, { melee: sy.attackType === "melee", bande: sy.range, degats: sy.damage?.value, cible, genre: "arme" }));
      } else if (item.type === "trait" && sy.attack?.enabled) {
        sortie.push(attaqueImpmal(item, { melee: sy.attack.type === "melee", bande: sy.attack.range, degats: sy.attack.damage?.value,
          cible: Number(sy.attack.target ?? 0), genre: "trait" }));
      } else if (item.type === "power" && Number(sy.damage?.value) > 0) {
        sortie.push(attaqueImpmal(item, { melee: sy.range === "immediate", bande: sy.range, degats: sy.damage.value, cible: cibleComp("psychic"), genre: "pouvoir" }));
      }
    }
    return sortie;
  },
  // Le vrai test du système, avec sa fenêtre ; la cible désignée (touche T) reçoit le test opposé.
  async lancer(acteur, attaque) {
    if (attaque.genre === "trait") return acteur.setupTraitTest(attaque.id);
    if (attaque.genre === "pouvoir") return acteur.setupPowerTest(attaque.id);
    return acteur.setupWeaponTest(attaque.id);
  },
  // Pas de jet pour toucher séparé : le test d'arme est l'attaque (fenêtre rouverte si le MJ l'avait fermée).
  async toucher(acteur, attaque) { return TOUR_IMPMAL.lancer(acteur, attaque); },
  // Résolution directe, sans fenêtre (PNJ accepté d'un clic, compagnon IA) : test d'attaque au d100 contre la valeur de la
  // fiche, test opposé du défenseur (mêlée : le meilleur de Mêlée et Réflexes ; distance : Réflexes), règle du système pour
  // le vainqueur. Dégâts : ceux de l'arme + DR de l'opposition (l'armure est retirée à l'application, par le système).
  async resoudre(acteur, attaque, cible) {
    const jetA = await new Roll("1d100").evaluate();
    const a = testD100(attaque.cible, jetA.total);
    await posterJet(jetA, acteur, `${attaque.nom} : ${jetA.total} pour ${attaque.cible} — ${a.reussite ? "réussite" : "échec"} (${signe(a.dr)} DR)`);
    const sd = cible?.system?.skills ?? {};
    const defense = attaque.type === "melee" ? Math.max(Number(sd.melee?.total ?? 0), Number(sd.reflexes?.total ?? 0)) : Number(sd.reflexes?.total ?? 0);
    const jetD = await new Roll("1d100").evaluate();
    const d = testD100(defense, jetD.total);
    await posterJet(jetD, cible, `Défense contre ${attaque.nom} : ${jetD.total} pour ${defense} — ${d.reussite ? "réussite" : "échec"} (${signe(d.dr)} DR)`);
    const touche = gagneOpposition(a, d, attaque.cible, defense);
    const degats = touche ? Math.max(0, Number(attaque.degatsBase ?? 0) + Math.max(0, a.dr - d.dr)) : 0;
    return { touche, degats, texte: `${acteur.name} ${touche ? `touche ${cible?.name ?? "?"} (${degats} dégâts avant armure)` : `manque ${cible?.name ?? "?"}`}.` };
  },
  // Dégâts d'Imperium Maledictum : ils viennent du test opposé (pas de jet séparé).
  async degats() { return null; },
  // Méthode du système : localisation tirée, armure retirée, blessures et critiques, carte au chat.
  async appliquer(acteur, n) { return acteur.applyDamage(n, { location: "roll", message: true }); },
  async jetMort() { return null; },
  async sauvegarde(acteur, o = {}) { return acteur.setupCharacteristicTest(o.carac || "tgh"); },
  lancerInitiative: combat => combat.rollAll(),
  // Test opposé d'une attaque (messages « opposed » du système) : appliquer ses dégâts, ou répondre pour le défenseur.
  async appliquerOpposition(message) { return message?.system?.applyDamage?.(); },
  async defendre(message, type = "dodge") { return message?.system?.performResponse?.(type); },
  // Action de combat choisie sur la fiche (system.combat.action : viser, charger, courir…) : elle occupe l'action du tour.
  actionChoisie: changements => Boolean(changements?.system?.combat?.action),
  lireMessage(message) {
    if (message?.type === "test") {
      const test = message.system?.test;
      const item = test?.item;
      const genre = ["weapon", "trait", "power"].includes(item?.type) ? "attaque" : "test";
      return { genre, activation: item ? "action" : null, attaqueId: item?.id ?? null, nom: item?.name ?? "", phase: genre === "attaque" ? "defense" : null };
    }
    if (message?.type === "opposed") {
      const s = message.system ?? {};
      const r = s.result ?? {};
      const applique = s.applied && Object.keys(s.applied).length > 0;
      const repondu = Boolean(s.defenderMessageId || s.unopposed);
      let phase = "defense";
      if (applique) phase = "fini";
      else if (repondu) phase = r.winner === "attacker" && Number(r.damage) > 0 ? "appliquer" : r.winner ? "fini" : "defense";
      return { genre: "opposition", phase, degats: Number(r.damage ?? 0), cibleUuid: s.targetTokenUuid ?? "", messageId: message.id,
        auteur: s.attackerMessageId ? game.messages?.get?.(s.attackerMessageId)?.speaker ?? null : null };
    }
    return null;
  }
};

// D&D 5e : activités des objets (attaque, sauvegarde, dégâts), jets du système, application des dégâts, jets contre la mort.
const metresDe = (valeur, unites) => (Number(valeur) > 0 ? versMetres(valeur, unites || "ft") : null);
function activiteDe(acteur, attaque) {
  const item = acteur?.items?.get?.(attaque.itemId) ?? [...(acteur?.items ?? [])].find(i => i.id === attaque.itemId);
  const activites = item?.system?.activities;
  return activites?.get?.(attaque.activiteId) ?? [...(activites ?? [])].find(a => a.id === attaque.activiteId) ?? null;
}

const TOUR_DND5E = {
  economie: [{ cle: "action", libelle: "Action", n: 1 }, { cle: "bonus", libelle: "Action bonus", n: 1 }, { cle: "reaction", libelle: "Réaction", n: 1 }],
  ressourceDe: activation => ({ action: "action", bonus: "bonus", reaction: "reaction" }[activation] ?? null),
  defenseLibelle: "CA",
  // Jet pour toucher contre la CA, puis jet de dégâts : pas de test opposé.
  testOppose: false,
  async appliquerOpposition() { return null; },
  async defendre() { return null; },
  combattant(acteur) {
    const a = acteur?.system?.attributes ?? {};
    const hp = a.hp ?? {};
    const etats = etatsDe(acteur);
    const personnage = acteur?.type === "character";
    const mortSauv = a.death ?? {};
    const zero = Number(hp.value ?? 1) <= 0;
    const mort = etats.includes("dead") || (personnage && Number(mortSauv.failure ?? 0) >= 3) || (!personnage && zero);
    const stable = personnage && Number(mortSauv.success ?? 0) >= 3;
    const legact = acteur?.system?.resources?.legact;
    // Actions de repaire (dnd5e, resources.lair) : règles 2014, le compte d'initiative (20 par défaut) ; règles 2024, value seul.
    const lair = acteur?.system?.resources?.lair;
    const concentration = [...(acteur?.concentration?.items ?? [])].map(i => i.name).join(", ")
      || ([...(acteur?.concentration?.effects ?? [])].length ? "un effet" : "");
    const regen = [...(acteur?.items ?? [])].find(i => /r[ée]g[ée]n[ée]ration|regeneration/i.test(i.name ?? ""));
    const mv = a.movement ?? {};
    return {
      pv: Number(hp.value ?? 0), pvMax: Number(hp.max ?? 0),
      pvTexte: `PV ${Number(hp.value ?? 0)}/${Number(hp.max ?? 0)}${Number(hp.temp) ? ` (+${hp.temp})` : ""}`,
      defense: `CA ${a.ac?.value ?? "?"}`, ca: Number(a.ac?.value ?? 0),
      aTerre: zero || mort || etats.includes("unconscious"), mort,
      jetsMort: personnage && zero && !mort && !stable ? { succes: Number(mortSauv.success ?? 0), echecs: Number(mortSauv.failure ?? 0) } : null,
      conditions: etats.filter(e => !["dead", "concentrating"].includes(e)).map(nomCondition), effets: effetsADuree(acteur),
      concentration, regeneration: regen ? regen.name : "",
      legendaires: Number(legact?.max) > 0 ? { reste: Number(legact.value ?? 0), max: Number(legact.max) } : null,
      repaire: lair?.value || Number(lair?.initiative) > 0 ? Number(lair.initiative) || 20 : null,
      mouvementMax: metresDe(mv.speeds?.walk ?? mv.walk ?? mv.speed, mv.units), allure: ""
    };
  },
  attaques(acteur) {
    const sortie = [];
    const personnage = acteur?.type === "character";
    for (const item of acteur?.items ?? []) {
      const sy = item.system ?? {};
      if (personnage && item.type === "weapon" && sy.equipped === false) continue;
      if (item.type === "spell" && Number(sy.level ?? 0) > 0 && !Number(sy.prepared ?? 1) && sy.method !== "innate" && sy.method !== "atwill") continue;
      for (const act of sy.activities ?? []) {
        if (!["attack", "save", "damage"].includes(act.type)) continue;
        const r = act.range ?? {};
        const unites = r.units || sy.range?.units || "ft";
        const typeAttaque = act.attack?.type?.value ?? (act.validAttackTypes?.has?.("melee") ? "melee" : "");
        const contact = r.units === "touch" || typeAttaque === "melee" || (item.type === "weapon" && !Number(r.long) && Number(sy.range?.reach || 0) > 0);
        const allonge = contact ? metresDe(sy.range?.reach || (r.units === "touch" ? 5 : r.reach || 5), sy.range?.units || "ft") : null;
        const formule = act.labels?.damage?.[0]?.formula ?? act.labels?.damages?.[0]?.formula ?? act.damage?.parts?.[0]?.formula ?? "";
        const sauv = act.save;
        sortie.push({
          id: `${item.id}.${act.id}`, itemId: item.id, activiteId: act.id, nom: item.name === act.name || !act.name ? item.name : `${item.name} (${act.name})`,
          img: item.img, genre: act.type, type: contact ? "melee" : "distance", allonge,
          portee: contact ? null : { normale: metresDe(r.value, unites) ?? 1.5, longue: metresDe(r.long, unites) },
          moyenne: moyenneFormule(formule), degats: formule,
          bonus: act.type === "attack" ? act.labels?.toHit ?? "" : sauv ? `DD ${sauv.dc?.value ?? "?"} ${[...(sauv.ability ?? [])].join("/")}` : "",
          sauvegarde: act.type === "save" ? { carac: [...(sauv?.ability ?? [])][0] ?? "dex", dd: Number(sauv?.dc?.value ?? 10), moitie: act.damage?.onSave === "half" } : null,
          activation: act.activation?.type ?? "action"
        });
      }
    }
    return sortie;
  },
  // Le vrai flux du système : l'activité s'utilise (fenêtre, consommation, carte au chat avec ses boutons de jets).
  async lancer(acteur, attaque) {
    const act = activiteDe(acteur, attaque);
    if (!act) throw new Error(`Activité introuvable : ${attaque.nom}.`);
    return act.use();
  },
  // Le jet pour toucher du système (fenêtre d'attaque), après la carte d'utilisation.
  async toucher(acteur, attaque) { return activiteDe(acteur, attaque)?.rollAttack?.(); },
  // Résolution directe (PNJ accepté, compagnon) : jet d'attaque du système sans fenêtre contre la CA de la cible, puis jet de
  // dégâts (critique compris) ; une activité de sauvegarde : la cible sauvegarde, dégâts pleins, moitié ou rien.
  async resoudre(acteur, attaque, cible) {
    const act = activiteDe(acteur, attaque);
    if (!act) throw new Error(`Activité introuvable : ${attaque.nom}.`);
    const sansFenetre = { configure: false };
    if (act.type === "save" && cible) {
      const s = attaque.sauvegarde ?? { carac: "dex", dd: 10, moitie: true };
      const jets = await cible.rollSavingThrow({ ability: s.carac, target: s.dd }, sansFenetre);
      const reussie = Number((Array.isArray(jets) ? jets[0] : jets)?.total ?? 0) >= s.dd;
      const brut = totalDesJets(await act.rollDamage({}, sansFenetre));
      const degats = reussie ? (s.moitie ? Math.floor(brut / 2) : 0) : brut;
      return { touche: degats > 0, degats, texte: `${cible.name} ${reussie ? "réussit" : "rate"} sa sauvegarde (DD ${s.dd}) : ${degats} dégâts.` };
    }
    let critique = false, touche = true;
    if (act.type === "attack") {
      const jets = await act.rollAttack({}, sansFenetre);
      const jet = Array.isArray(jets) ? jets[0] : jets;
      if (!jet) throw new Error("Le jet d'attaque n'a pas eu lieu.");
      const ca = Number(cible?.system?.attributes?.ac?.value ?? 10);
      critique = Boolean(jet.isCritical);
      touche = critique || (!jet.isFumble && Number(jet.total) >= ca);
      if (!touche) return { touche: false, degats: 0, texte: `${acteur.name} manque ${cible?.name ?? "?"} (${jet.total} contre CA ${ca}).` };
    }
    const degats = totalDesJets(await act.rollDamage({ isCritical: critique }, sansFenetre));
    return { touche: true, degats, critique, texte: `${acteur.name} touche ${cible?.name ?? "?"}${critique ? " (critique)" : ""} : ${degats} dégâts.` };
  },
  // Le jet de dégâts du système pour l'attaque en cours (bouton du panneau, quand le MJ joue un PNJ à la main).
  async degats(acteur, attaque, { critique = false } = {}) {
    const act = activiteDe(acteur, attaque);
    return act?.rollDamage?.({ isCritical: critique });
  },
  // Méthode du système (actor.applyDamage) : PV temporaires d'abord, puis PV ; à 0, le système gère l'état.
  async appliquer(acteur, n) { return acteur.applyDamage(n); },
  async jetMort(acteur, { direct = false } = {}) { return acteur.rollDeathSave({}, direct ? { configure: false } : {}); },
  async sauvegarde(acteur, o = {}) {
    if (o.concentration) return acteur.rollConcentration({ target: o.dd ?? 10 });
    return acteur.rollSavingThrow({ ability: o.carac || "con", target: o.dd ?? 10 });
  },
  lancerInitiative: combat => combat.rollAll(),
  actionChoisie: () => false,
  // Messages du système (ChatMessage5e, type) : carte d'utilisation (activité et son activation), jet d'attaque (touché
  // contre la CA de la cible désignée), jet de dégâts.
  lireMessage(message) {
    const s = message?.system ?? {};
    if (message?.type === "attack") {
      const jet = message.rolls?.[0];
      const ca = s.targets?.[0]?.ac;
      const critique = Boolean(jet?.isCritical);
      const touche = Number.isFinite(Number(ca)) && ca !== null && ca !== undefined ? critique || Number(jet?.total) >= Number(ca) : null;
      return { genre: "attaque", total: Number(jet?.total ?? 0), touche, critique, phase: touche === false ? "fini" : "degats",
        cibleUuid: s.targets?.[0]?.uuid ?? "" };
    }
    if (message?.type === "damage") return { genre: "degats", degats: totalDesJets(message.rolls), phase: "appliquer", cibleUuid: s.targets?.[0]?.uuid ?? "" };
    const uuid = s.activity?.uuid ?? message?.flags?.dnd5e?.activity?.uuid;
    if (uuid) {
      let act = null;
      try { act = globalThis.fromUuidSync?.(uuid) ?? null; } catch { act = null; }
      const type = act?.type ?? s.activity?.type ?? "";
      return { genre: "usage", activation: act?.activation?.type ?? "action", attaqueId: act ? `${act.item?.id}.${act.id}` : null,
        nom: act?.item?.name ?? s.item?.name ?? "", phase: type === "attack" ? "toucher" : ["save", "damage"].includes(type) ? "degats" : null };
    }
    return null;
  }
};

const ADAPTATEURS = { impmal, dnd5e, "lakour-loups": loups };

export function adaptateur() {
  return ADAPTATEURS[game.system.id] ?? generique;
}

// L'adaptateur d'un système donné (essais, parité).
export const adaptateurDe = id => ADAPTATEURS[id] ?? generique;
