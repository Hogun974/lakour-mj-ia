// Ce qui dépend du système de jeu : comment lancer un test, quelles compétences existent,
// comment résumer une fiche pour l'IA. Tout le reste du module est commun.
// Les règles elles-mêmes ne sont PAS recopiées ici : l'IA les lit dans les compendiums des livres achetés.

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
    + "Pour une difficulté ou une règle précise, consulte le livre de base dans les compendiums.",
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
  typePnj: "npc",
  xp: acteur => ({ total: acteur.system.details?.xp?.value ?? 0, prochainNiveau: acteur.system.details?.xp?.max ?? null }),
  cheminXp: "system.details.xp.value",
  devises: ["pp", "gp", "ep", "sp", "cp"],
  bourse: acteur => ({ ...(acteur.system.currency ?? {}) }),
  majBourse: bourse => ({ "system.currency": bourse }),
  cheminNotesMJ: "system.details.biography.value",
  consignes: "Système D&D 5e : tests au d20 + modificateur contre un DD (facile 10, moyen 15, difficile 20, "
    + "très difficile 25). Avantage / désavantage selon la situation. "
    + "Pour un monstre, un sort ou un objet, cherche d'abord dans les compendiums.",
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
    + "aux résultats (vote, exécution, victoire), en peu de mots pendant que le village débat. Composition : par défaut, propose une composition équilibrée pour le nombre de joueurs "
    + "(loups_composer, qui varie les rôles d'une partie à l'autre) et annonce-la ; si les joueurs veulent changer ou choisir eux-mêmes, "
    + "ajuste (inclure, exclure) ou prends leur liste. Déroulement : loups_distribuer (mode roles avec la composition retenue, ou auto), "
    + "puis en boucle loups_nuit (la nuit entière, "
    + "rôles réveillés en secret), récit de l'aube, débat, loups_vote (ouvrir puis clore), loups_eliminer de l'élu, jusqu'à la victoire. "
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

const ADAPTATEURS = { impmal, dnd5e, "lakour-loups": loups };

export function adaptateur() {
  return ADAPTATEURS[game.system.id] ?? generique;
}
