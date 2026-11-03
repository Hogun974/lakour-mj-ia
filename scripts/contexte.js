import { ID } from "./constantes.js";
import { adaptateur } from "./adaptateurs.js";
import { lireMemoire } from "./memoire.js";
import { decrirePersonnalite } from "./personnalites.js";
import { versTexte, tronquer } from "./utilitaires.js";
import { salleEn } from "./salles.js";
import { listeSalles, salleDeLaCase, resumerFigurants, reperesDuPlan, planDe, carteDeScene, resumerReperes } from "./placement.js";
import { voteEnCours } from "./decisions.js";
import { compagnonsDuMonde, estCompagnon, personnaliteDe } from "./compagnons-jeu.js";
import { TEMPERAMENTS } from "./compagnons.js";
import { resumePourIA as resumeHorloges } from "./horloges.js";
import { horlogesDisponibles } from "./horloges-logique.js";
import { resumeCarnetPourIA } from "./carnet.js";
import { etatCoffre } from "./coffre.js";

// Consigne au MJ sur les compagnons IA (docs/compagnons.md) : des joueurs comme les autres, à qui il ne souffle rien.
export const CONSIGNE_COMPAGNONS = [
  "- Compagnons IA : certains personnages côté joueurs sont tenus par une IA à part, qui ne sait que ce qu'un joueur à leur place "
    + "saurait (liste ci-dessous, « [compagnon IA] »). Traite chacun EXACTEMENT comme un joueur : ses répliques arrivent dans le chat "
    + "sous son nom, tu lui réponds comme aux autres, tu ne décides jamais à sa place.",
  "  • Ne lui souffle JAMAIS un secret : ni rôle, ni intention d'un PNJ, ni piège, ni indice que son personnage n'a pas perçu, ni ce que "
    + "toi seul sais (mémoire de campagne, scénario, état secret de la partie). Ce que lui seul perçoit va en message_prive (il le garde "
    + "pour lui), comme pour un joueur.",
  "  • En combat, à son tour, son action déclarée t'arrive : résous-la avec les vrais jets de sa fiche, lancés directement "
    + "(jet_compagnon ; lancer_des pour les dégâts), puis passer_tour. Hors combat, quand l'issue de son action est incertaine, jet_compagnon "
    + "aussi (pas de demander_jet : personne n'est là pour cliquer).",
  "  • Ils disent eux-mêmes leurs gestes : une réplique peut commencer par une didascalie en italique (« *Valentin croise les bras.* — "
    + "Je n'ai rien vu. »), déjà affichée. Ne la raconte pas de nouveau et ne répète ni ne paraphrase ce qu'ils disent : décris le monde, "
    + "les PNJ et les conséquences, pas le geste qu'ils viennent de décrire. Une didascalie ne change rien au jeu.",
  "  • compagnon_ajouter, compagnon_retirer et compagnons gèrent la troupe ; un vote de groupe et un choix secret les incluent."
].join("\n");

// Consigne sur les horloges, jauges et réputations (outil horloge ; 40k, Warcraft) : leur état est dans l'état du jeu.
export const CONSIGNE_HORLOGES = "- Horloges, jauges et réputations (horloge) : une menace ou un projet qui mûrit hors champ est une horloge "
  + "(4 à 12 segments) ; avance-la quand le temps passe, qu'un échec la nourrit ou pendant un intermède (les horloges de faction "
  + "avancent alors d'un ou deux segments), et quand elle sonne, l'événement arrive vraiment. Une jauge compte ce qui s'accumule : l'"
  + "Exposition (40k) monte après un coup d'éclat, un combat bruyant ou un témoin laissé derrière, et ses seuils déclenchent des réactions. "
  + "La réputation d'une faction monte avec un service, baisse avec un affront ; son palier règle l'accueil de ses gens. Montre aux "
  + "joueurs ce que leurs personnages savent (montrer), garde le reste caché ; une ou deux avancées par scène au plus.";

// Consigne sur le Carnet de campagne (outils enquete et contact ; 40k, Warcraft) : son état est dans l'état du jeu.
export const CONSIGNE_CARNET = "- Enquêtes (enquete) : pour un mystère, pose les conclusions que les joueurs doivent atteindre et au moins trois "
  + "indices par conclusion, par des chemins différents (un lieu, un PNJ, un document) ; coche ceux qu'ils trouvent, révèle une conclusion "
  + "quand ils l'ont comprise, et ajoute des indices quand l'outil te le rappelle. Contacts (contact) : note les PNJ que les personnages "
  + "connaissent, leur attitude, ce qu'on se doit et ce qu'ils demandent ; fais-les revenir, et les dettes avec eux.";
// Dans l'état du jeu, quand le coffre du Carnet est fermé dans le navigateur du MJ (coffre.js, en attente des parts des joueurs).
export const AVIS_COFFRE_FERME = "Carnet de campagne : coffre fermé dans ce navigateur (en attente des parts des joueurs). Tu ne vois que les "
  + "éléments visibles des joueurs ; tu peux les faire avancer, mais ne crée, ne cache, ne retire rien et ne touche ni aux notes, ni aux "
  + "indices, ni aux conclusions, ni aux attitudes des contacts jusqu'à sa réouverture (l'outil le refuserait).";

// Consignes des outils liés à des modules tiers (scripts/outils.js, champ « modules ») : une phrase par module actif, et
// seulement dans les systèmes où l'outil existe. actif : id de module -> booléen.
export function consignesModulesTiers(actif = id => Boolean(game.modules.get(id)?.active), systeme = game.system?.id) {
  const aventure = ["impmal", "dnd5e"].includes(systeme);
  const lignes = [];
  if (actif("sequencer") && actif("JB2A_DnD5e")) {
    lignes.push("- Animations (animation) : rends visibles les moments forts — sort, tir, explosion, soin, apparition — sur un jeton, "
      + "sur une case ou de la source à la cible ; avec mesure, pas à chaque coup."
      + (systeme === "dnd5e" && actif("autoanimations")
        ? " Les attaques et sorts lancés depuis une fiche s'animent déjà seuls (Automated Animations) : n'anime que le reste "
          + "(jets de lancer_des, magie racontée, décor)."
        : ""));
  }
  if (actif("fxmaster")) {
    lignes.push("- Météo visible (meteo) : pluie, orage, neige, brouillard, braises… sur la carte quand le temps ou le lieu change ; "
      + "lance aussi l'ambiance_sonore assortie, et coupe-la (« aucune ») en entrant à l'abri.");
  }
  if (aventure && actif("calendaria")) {
    lignes.push("- Calendrier (calendrier) : Calendaria tient la date du monde. Avance-le quand le récit fait passer le temps (voyage, "
      + "repos, attente) et consulte-le pour l'heure, la lune et la météo du jour"
      + (actif("fxmaster") ? " ; si la météo du jour s'affiche déjà sur la carte, ne la double pas avec meteo." : "."));
  }
  if (systeme === "dnd5e" && actif("item-piles")) {
    lignes.push("- Butin (butin) : après un combat, change les ennemis vaincus en tas de butin à fouiller ; un coffre ou une cache "
      + "trouvés se posent avec coffre ou tas, un marchand ouvre boutique avec marchand. donner_objets reste pour une récompense remise en main.");
  }
  return lignes;
}

// Personnages joueurs : ceux assignés aux joueurs, à défaut ceux qu'un joueur possède.
export function personnagesJoueurs() {
  const joueurs = game.users.filter(u => !u.isGM);
  const assignes = joueurs.map(u => u.character).filter(Boolean);
  if (assignes.length) return [...new Set(assignes)];
  return game.actors.filter(a => a.hasPlayerOwner && a.type === "character");
}

// Cartes prêtes des compendiums (aventures et lieux génériques) : nom exact pour amener_joueurs, et à quoi elles servent.
export async function cartesPretes(packs = game.packs, max = 40) {
  const lignes = [];
  for (const pack of packs.filter(p => p.documentName === "Scene")) {
    for (const e of await pack.getIndex({ fields: ["flags"] })) {
      const f = Object.values(e.flags ?? {}).find(x => x?.description || x?.aventure) ?? {};
      lignes.push(`- ${e.name}${f.description ? ` — ${f.description}` : ""}${f.aventure ? ` (aventure « ${f.aventure} »)` : ""}`);
    }
  }
  return lignes.slice(0, max);
}

// Prompt système : tout ce qui est STABLE pendant une séance (le cache le réutilise à chaque tour).
// L'état changeant du jeu va dans les messages, jamais ici.
export async function promptSysteme(personnalite, { mission } = {}) {
  const sys = adaptateur();
  const fiches = personnagesJoueurs().map(a => {
    const joueur = game.users.find(u => u.character === a)?.name;
    return `- ${sys.resumer(a)}${joueur ? ` [joué par ${joueur}]` : ""}`;
  }).join("\n") || "(aucun personnage joueur assigné)";
  const competences = personnagesJoueurs()[0] ? sys.competences(personnagesJoueurs()[0]) : sys.competences(null);
  const cartes = await cartesPretes().catch(() => []);

  return [
    `Tu es le meneur de jeu (MJ) d'une partie de jeu de rôle sur Foundry VTT.`,
    `Système : ${game.system.title} ${game.system.version}. Monde : ${game.world.title}. Tu t'exprimes en français.`,
    "",
    decrirePersonnalite(personnalite),
    "",
    sys.consignes,
    "",
    "Comment tu mènes la partie :",
    "- Les joueurs écrivent dans le chat. Tu reçois leurs messages groupés, précédés de l'état du jeu.",
    "- Ne décide jamais à la place d'un personnage joueur. Décris le monde, incarne les PNJ, laisse des choix ouverts.",
    "- Quand l'issue d'une action est incertaine, appelle demander_jet puis arrête-toi : le résultat arrivera dans un prochain message. Ne lance jamais les dés d'un personnage joueur.",
    "- Règle chaque test selon la situation, comme le ferait un MJ attentif : difficulté, modificateur (blessure, obscurité, couvert, outil adapté…), "
      + "DR bonus, avantages et désavantages. La fenêtre du joueur s'ouvre ainsi pré-remplie ; annonce brièvement pourquoi.",
    "- Pour les PNJ et les événements aléatoires, utilise lancer_des.",
    "- Avant d'inventer une règle, un profil de PNJ, un objet ou un lieu officiel, cherche dans les compendiums (chercher_compendium puis lire_document) : les livres sont là.",
    "- Note les faits importants dans la mémoire de campagne (noter_memoire) : PNJ rencontrés, indices, décisions, fils ouverts.",
    "- Ta voix ne lit que le début de ta narration (réglage « Longueur de la voix » ; le chat garde tout) : mets l'essentiel "
      + "dans les deux premières phrases, et termine par la question ou l'appel aux joueurs, qui est toujours dit.",
    "- Aides de jeu : quand les personnages reçoivent une lettre, un contrat, une affiche ou une partition, montre-la (montrer_aide), "
      + "page par page au moment où le journal du MJ le dit. Les tables du module (rumeurs, rencontres, visages, complications…) "
      + "se tirent avec lancer_table quand l'inspiration manque.",
    "- Cartes : pour jouer un lieu sur carte, utilise amener_joueurs (active la scène, pose les jetons des personnages avec leur vision, lève la pause). "
      + "Pour un autre lieu, prends une carte prête qui convient (liste ci-dessous) ; s'il n'y en a pas, crée la carte avec creer_scene. "
      + "Les aventures prêtes (ex. « Le Chœur creux ») ont leurs journaux et leurs scènes dans les compendiums.",
    "- Tu peux mettre ou enlever la pause (pause) et régler l'obscurité de la scène (ambiance_lumiere).",
    "- Ambiance sonore (ambiance_sonore) : lance celle du lieu à chaque changement de lieu ou d'atmosphère (taverne → foule, souterrain → grotte, "
      + "combat imminent → tension), coupe-la pour un silence voulu.",
    "- Campagne : donne de l'expérience (donner_xp) aux moments mérités ; les personnages progressent avec monter_niveau (D&D 5e) ou "
      + "depenser_xp (Imperium Maledictum), en suivant ce que le joueur veut. Marchands, butins et récompenses passent par donner_objets "
      + "(avec prix pour un achat), bourse et retirer_objet : la fiche reste toujours juste.",
    "- Secrets : ce qu'un seul personnage perçoit (vision, murmure, indice personnel) va en message_prive, pas dans le chat commun.",
    "- Décisions : quand le groupe doit trancher une décision collective qui le divise (attaquer ou négocier, qui envoyer, quelle route), "
      + "propose un vote (vote_groupe) plutôt que d'attendre un accord dans le chat ; pour une intrigue, une trahison ou une tentation qui ne "
      + "regarde qu'un personnage (garder le butin, céder à l'émissaire, mentir aux autres), pose-lui un choix secret (choix_secret) : sa "
      + "réponse ne revient qu'à toi, garde-la secrète et fais-en sentir les conséquences. Avec mesure, aux vrais moments de choix.",
    "- Portraits : pour un PNJ important, illustrer avec portrait_de (coûte de l'argent : avec parcimonie).",
    game.modules.get("levels-3d-preview")?.active
      ? "- La vue 3D (vue_3d) est disponible : active-la pour un lieu marquant, puis cadre la caméra sur une arrivée, une révélation "
        + "ou un PNJ qui entre en scène. Avec mesure : chaque cadrage déplace la caméra de tous les joueurs."
      : "",
    ...consignesModulesTiers(),
    horlogesDisponibles(game.system?.id) ? CONSIGNE_HORLOGES : "",
    horlogesDisponibles(game.system?.id) ? CONSIGNE_CARNET : "",
    "- Tu reçois aussi ce que les joueurs font sur le plateau : 🚶 entrée dans une pièce ou déplacement, 🚪 porte ouverte ou fermée, "
      + "⚔️ tour d'un PNJ en combat. Réagis comme un vrai MJ : décris le lieu découvert, déclenche un piège, fais parler un PNJ. "
      + "Si un déplacement n'appelle aucune réaction, réponds seulement « — » (rien ne s'affiche) : ne commente pas chaque pas.",
    ["impmal", "dnd5e"].includes(game.system?.id)
      ? "- Tour par tour : en combat, l'état du jeu te donne « Tour : X ; étape suivante : … », le même guide que celui du MJ humain "
        + "(panneau Tour par tour) ; reste cohérent avec lui. combat_etat te donne les distances en mètres, les défenses, les actions "
        + "restantes et une proposition d'action pour un PNJ. Hors combat, un tour de table (tour_de_table) donne la parole à chacun : "
        + "pendant qu'il dure, tu attends que tout le monde ait parlé avant de raconter."
      : "",
    "- Le plateau montre ce que vit le joueur : il doit toujours refléter ton récit. Ta réponse est d'abord écrite sans être affichée ; "
      + "une étape « [Mise en place] » te demande ensuite de placer ce qu'elle décrit (mettre_en_scene, avec pres_de pour situer "
      + "quelqu'un près d'un repère), puis elle s'affiche.",
    "  • Quand ta narration déplace un personnage joueur (il entre, sort, monte, suit quelqu'un, recule), déplace son jeton "
      + "(placer_jetons, de préférence avec le nom de la pièce). S'il part vers un lieu absent de la carte, crée la carte (creer_scene) puis amener_joueurs.",
    "  • Tout PNJ qui parle aux joueurs ou agit devant eux a un jeton visible près d'eux, dès son entrée en scène : creer_pnj avec placer_sur_scene "
      + "s'il est nouveau, placer_jetons s'il existe déjà (cache false pour révéler un PNJ caché). Quand il s'en va, retirer_jetons.",
    "  • Un lieu habité a du monde : foule, fidèles, ouvriers, gardes, badauds. Pose des figurants (figurants) dès que les joueurs arrivent "
      + "et retire-les quand ils partent. Ce sont des anonymes jetables : abordés, ils répondent selon leur comportement (souvent brefs, pressés, "
      + "méfiants, ils envoient paître) ; si l'un devient important, crée un vrai PNJ et retire un figurant.",
    "- Au tour d'un PNJ, joue-le vraiment (déplacement avec placer_jetons, attaque avec lancer_des en annonçant cible et résultat), puis passer_tour.",
    "- Tu peux bouger n'importe quel jeton (placer_jetons), bloquer ou libérer les déplacements d'un personnage (bloquer_mouvements), "
      + "et régler vision, lumières, portes et brouillard (regler_vision, lumiere_jeton, gerer_lumieres, gerer_portes, regler_scene).",
    "- La carte évolue avec le récit, avec mesure : pour un lieu clé, un piège ou une révélation à venir, pose une zone invisible des joueurs "
      + "(zone_scene : texte à l'entrée, pause pour reprendre la main, obscurité, passage vers une autre zone), épingle sa page du journal du MJ "
      + "ou un son localisé (epingle) ; lieux_scene te dit ce qui est déjà posé et quelle page décrit quel lieu.",
    "- Ta narration s'affiche dans le chat : texte simple, **gras** et *italique* permis, pas de titres.",
    CONSIGNE_COMPAGNONS,
    mission ? `\nMission particulière : ${mission}` : "",
    "",
    competences.length ? `Clés de compétence valides pour demander_jet : ${competences.map(c => `${c.cle} (${c.libelle})`).join(", ")}.` : "",
    "",
    cartes.length ? `Cartes prêtes (amener_joueurs avec le nom exact ; importées du compendium au besoin) :\n${cartes.join("\n")}\n` : "",
    "Personnages joueurs :",
    fiches,
    "",
    "Compagnons IA (des joueurs comme les autres, joués par une IA qui ne sait que ce que sait leur personnage) :",
    compagnonsDuMonde().map(a => `- ${sys.resumer(a)} [compagnon IA, ${TEMPERAMENTS[personnaliteDe(a).temperament].libelle}]`).join("\n") || "(aucun)",
    "",
    "Mémoire de campagne :",
    // Aux Veillées, chaque partie repart de zéro : rien des parties précédentes (seul l'historique des compositions reste, pour varier).
    game.system.id === "lakour-loups" ? "(aux Veillées, chaque partie est neuve : aucune mémoire des parties précédentes)" : await lireMemoire()
  ].join("\n");
}

// État du jeu au moment où l'IA répond : scène, présents, combat.
export function etatDuJeu() {
  const lignes = [];
  // Partie de loup-garou (système lakour-loups) : phase, tour, vote et morts, pour que le narrateur sache où il en est.
  if (game.lakourLoups) lignes.push(...etatPartieLoups(game.lakourLoups));
  const vote = voteEnCours();
  if (vote) lignes.push(`Vote de groupe OUVERT : « ${vote.question} » — ${vote.exprimes} voix reçue(s) sur ${vote.total} (contenu caché), clôture dans ${vote.reste} s.`);
  const scene = game.scenes.active;
  if (scene) {
    lignes.push(`Scène active : « ${scene.navName || scene.name} ».`);
    const dessins = scene.drawings.contents.map(d => d.toObject());
    const { size } = scene.grid, { sceneX, sceneY } = scene.dimensions;
    const grille = { size, sceneX, sceneY };
    const salles = listeSalles(dessins, grille);
    if (salles.length) {
      lignes.push(`Pièces de la carte : ${salles.slice(0, 40).map(s => `${s.nom} (cases ${s.x1},${s.y1} à ${s.x2},${s.y2})`).join(" ; ")}.`);
    }
    // Repères (éléments et portes du plan) : de quoi placer quelqu'un « près du puits » ou « au seuil de l'échoppe ».
    const reperes = reperesDuPlan(planDe(scene), salles);
    if (reperes.length) {
      lignes.push(`Repères (pour pres_de) : ${resumerReperes(reperes).join(" ; ")}.`);
    }
    const figurants = scene.tokens.contents.filter(t => t.getFlag(ID, "figurant")).map(t => {
      const c = { x: Math.round((t.x - sceneX) / size), y: Math.round((t.y - sceneY) / size) };
      return { groupe: t.getFlag(ID, "groupe") ?? "Figurants", comportement: t.getFlag(ID, "comportement") ?? "", salle: salleDeLaCase(salles, c.x, c.y)?.nom };
    });
    const presents = scene.tokens.contents.filter(t => !t.getFlag(ID, "figurant")).map(t => {
      const pj = estCompagnon(t.actor) ? "compagnon IA" : t.actor?.hasPlayerOwner ? "PJ" : "PNJ";
      const cx = t.x + (t.width * size) / 2, cy = t.y + (t.height * size) / 2;
      const salle = salleEn(dessins, cx, cy);
      return `${t.name} (${pj}${t.hidden ? ", caché" : ""}, case ${Math.floor((cx - sceneX) / size)},${Math.floor((cy - sceneY) / size)}${salle ? `, ${salle}` : ""})`;
    });
    if (presents.length) lignes.push(`Présents : ${presents.join(", ")}.`);
    if (figurants.length) lignes.push(`Figurants : ${resumerFigurants(figurants).join(" ; ")}.`);
    // La carte elle-même, case par case : l'IA voit où sont les étals, le puits, les portes et chacun.
    const carte = carteDeScene(scene);
    if (carte) lignes.push(`Carte (vue de dessus) :\n${carte}`);
    lignes.push("(Rappel : jetons des personnages là où ton récit les place, PNJ présents visibles, lieux habités peuplés de figurants.)");
    if (game.paused) lignes.push("Le jeu est en pause.");
  } else {
    lignes.push("Aucune scène active.");
  }
  const sansPersonnage = game.users.filter(u => !u.isGM && u.active && !u.character).map(u => u.name);
  if (sansPersonnage.length) lignes.push(`Joueurs connectés sans personnage : ${sansPersonnage.join(", ")} (une création guidée leur est proposée).`);
  const bloques = Object.entries(game.settings.get(ID, "mouvementsBloques") ?? {})
    .map(([id, raison]) => `${game.actors.get(id)?.name ?? id} (« ${raison} »)`);
  if (bloques.length) lignes.push(`Déplacements bloqués par toi : ${bloques.join(", ")}. Pense à les libérer quand la raison disparaît.`);
  const combat = game.combats.active;
  if (combat?.started) {
    lignes.push(`Combat en cours : round ${combat.round}, tour de ${combat.combatant?.name ?? "?"}. `
      + `Ordre : ${combat.turns.map(c => c.name).join(", ")}.`);
  }
  // Horloges, jauges et réputations (horloges.js), en quelques lignes (les notes : outil horloge, « lister »).
  const horloges = resumeHorloges();
  if (horloges.length) lignes.push("Horloges, jauges et réputations :", ...horloges);
  // L'enquête en cours et les contacts utiles ici (carnet.js), six lignes au plus chacun.
  if (horlogesDisponibles(game.system?.id)) {
    try { lignes.push(...resumeCarnetPourIA(scene)); } catch { /* pas de carnet */ }
    // Coffre du Carnet fermé dans ce navigateur (coffre.js) : l'IA ne voit que le visible et ne doit rien créer ni cacher.
    if (etatCoffre().etat === "attente") lignes.push(AVIS_COFFRE_FERME);
  }
  // Tour par tour (tour-par-tour.js) : le même état et la même étape suivante que le panneau du MJ humain, pour rester cohérent
  // (détails : outil combat_etat) ; le tour de table en cours.
  try { lignes.push(...(game.modules.get(ID)?.api?.tour?.resumePourIA?.() ?? [])); } catch { /* pas de tour par tour */ }
  return lignes.join("\n");
}

// Un message du chat, tel que l'IA le lit.
export function decrireMessage(message) {
  const auteur = message.author?.name ?? "?";
  const alias = message.speaker?.alias;
  const compagnon = message.flags?.[ID]?.compagnon;
  const qui = compagnon ? `${alias} (compagnon IA)` : alias && alias !== auteur ? `${alias} (joué par ${auteur})` : auteur;
  // Une réplique de compagnon telle qu'il l'a dite : la didascalie (*…*) reste visible comme telle.
  const texte = compagnon && typeof message.flags[ID].texte === "string" ? message.flags[ID].texte : versTexte(message.content);
  const jets = (message.rolls ?? []).map(r => `${r.formula} = ${r.total}`).join(" ; ");
  const saveur = versTexte(message.flavor);
  if (jets) return `🎲 ${qui}${saveur ? ` — ${saveur}` : ""} : ${jets}${texte ? `\n${tronquer(texte, 1500)}` : ""}`;
  return `${qui} : ${tronquer(texte, 3000)}`;
}

// Messages à transmettre à l'IA : tout, sauf ses propres messages et les apartés entre joueurs.
export function messagePourIA(message) {
  if (message.getFlag(ID, "ia")) return false;
  if (message.whisper?.length) {
    const versUnMJ = message.whisper.some(id => game.users.get(id)?.isGM);
    if (!versUnMJ) return false;
  }
  return Boolean(versTexte(message.content) || message.rolls?.length);
}

// Résumé d'une partie des « Veillées de Brumecombe » (état du système lakour-loups, docs/loups-contrat.md).
export function etatPartieLoups(api) {
  const e = api.etat();
  const nom = id => game.actors.get(id)?.name ?? id;
  const tous = api.villageois();
  const vainqueur = v => (v === "village" || v === "meute" ? v : v === "peste" ? "la peste noire"
    : v === "brume" ? "la brume (Saint-Martin : un innocent pendu, personne ne gagne)" : nom(v));
  const lignes = [`Partie : phase « ${e.phase} », tour ${e.tour}${e.vainqueur ? ` — TERMINÉE, victoire : ${vainqueur(e.vainqueur)}` : ""}.`];
  // La peste noire (état complet du MJ : le narrateur a le droit de savoir, jamais de le dire avant la fin).
  if (e.peste?.active && !e.vainqueur) {
    lignes.push(`PESTE NOIRE — secret absolu, ne la nomme jamais et n'y fais aucune allusion : aucun loup dans cette partie, la peste `
      + `frappe chaque nuit (racontée comme une victime de la meute). ${e.peste.porteur ? `Porteur : ${nom(e.peste.porteur)} (il désigne la `
      + "prochaine victime en secret)." : "Pas encore de porteur : c'est TOI qui choisis la victime de la nuit (loups_nuit, peste_victime)."} `
      + "Si un joueur crie « C'est la peste noire ! », loups_peste (le système tranche).");
  }
  lignes.push(`Vivants (${tous.filter(a => a.system.vivant).length}) : ${tous.filter(a => a.system.vivant).map(a => a.name).join(", ") || "aucun"}.`);
  if (e.morts?.length) lignes.push(`Morts : ${e.morts.map(m => `${nom(m.acteurId)} (${m.cause}, tour ${m.tour})`).join(", ")}.`);
  if (e.vote?.ouvert) {
    const recus = Object.keys(e.vote.votes ?? {}).length;
    lignes.push(`${e.vote.objet === "bailli" ? "Élection du Bailli OUVERTE" : "Vote OUVERT"} : ${recus} voix reçue(s) sur `
      + `${tous.filter(a => a.system.vivant).length}${e.vote.double ? ", vote double" : ""}.`);
  }
  const silences = tous.filter(a => a.system.vivant && a.system.silence).map(a => a.name);
  if (silences.length) lignes.push(`Réduits au silence aujourd'hui : ${silences.join(", ")}.`);
  lignes.push(...etatBailliRegistreMasques(api, e));
  lignes.push(...etatCalendrierSouffle(api, e, nom));
  lignes.push(...etatPassageBancDeuil(api, e, nom));
  return lignes;
}

// Le lot 0.8.0 des Veillées (Gens de passage, départs et exil, Banc des accusés, Glas du deuil, Nuit de la Saint-Martin). Défensif :
// un système plus ancien n'a ni ces fonctions ni ces champs.
export function etatPassageBancDeuil(api, e = {}, nom = id => id) {
  const lignes = [];
  const fn = cle => (typeof api?.[cle] === "function" ? essayer(() => api[cle]()) : null);
  if (e.format === "saint-martin" && !e.vainqueur) {
    lignes.push("Nuit de la Saint-Martin : un seul jour, un seul vote d'exécution ; la nuit suivante ne tombe pas, la partie s'arrête au soir.");
  }
  if (e.partis?.length) {
    lignes.push(`Partis (ni morts ni révélés, hors jeu) : ${e.partis.map(p => `${nom(p.acteurId)} (${p.comment === "exil" ? "exilé" : "parti"}, tour ${p.tour})`).join(", ")}.`);
  }
  const gens = (fn("gensDePassage") ?? []).filter(g => !g.parti);
  if (gens.length) {
    lignes.push(`Gens de passage (rôle PUBLIC, camp secret : ne le dis jamais) : ${gens.map(g => `${g.nom} — ${g.role || g.cle} (arrivé au tour ${g.tour})`).join(" ; ")}. `
      + "Un vote d'exil (loups_vote ouvrir, objet « exil ») peut les faire partir.");
  }
  const banc = fn("banc");
  if (banc?.actif && !e.vainqueur) {
    const acc = banc.accusations ?? [];
    lignes.push(`Banc des accusés (public) : ${acc.length ? acc.map(a => `${a.parNom} accuse ${a.contreNom}${a.juge ? " (jugé)" : ""}`).join(" ; ") : "aucune accusation aujourd'hui"}. `
      + (banc.prochain ? `Prochain jugé : ${banc.prochainNom} (loups_vote ouvrir : un vote pour ou contre lui seul).`
        : "Sans accusé, pas de vote d'exécution : la nuit tombera.")
      + " Un joueur qui accuse à voix haute : loups_banc, accuser.");
  }
  const deuil = fn("deuil");
  if (deuil?.actif && deuil.compte > 0 && !e.vainqueur) lignes.push(`Glas du deuil (public) : il a sonné ${deuil.compte} fois (un innocent exécuté à chaque fois).`);
  if (e.vainqueur) return lignes;
  // Les secrets du MJ actif (ailleurs, ces fonctions lèvent une erreur).
  const p = fn("pouvoirsDuDeuil");
  if (p && (p.visions > 0 || p.voix || p.linceul > 0)) {
    lignes.push(`Pouvoirs du deuil de la meute — SECRET : ${[p.visions > 0 ? `${p.visions} vision(s) (la nuit, loups_nuit les réveille)` : "",
      p.voix ? `une voix sans visage au vote${p.cible?.cible ? ` (placée sur ${nom(p.cible.cible)})` : ""}` : "",
      p.linceul > 0 ? `le linceul à la nuit ${p.linceul}` : ""].filter(Boolean).join(", ")}. Ne les évoque jamais.`);
  }
  const autel = fn("autel") ?? [];
  if (autel.length) lignes.push(`Sous l'autel de la Chapelle — SECRET : ${autel.map(r => r.nom || r.cle).join(", ")}. Ces rôles ne sont pas en jeu : ne les nomme jamais.`);
  return lignes;
}

// Le lot 0.7.0 des Veillées (Dernier souffle, Almanach des brumes, Somnambule, Saints du calendrier). Défensif : un système plus
// ancien n'a ni api.presage, ni e.glas, ni e.souffle, ni api.somnambules, et la partie se joue sans eux.
export function etatCalendrierSouffle(api, e = {}, nom = id => id) {
  const lignes = [];
  const p = typeof api?.presage === "function" ? essayer(() => api.presage()) : null;
  if (p?.cle && !e.vainqueur) {
    lignes.push(`Présage de l'Almanach (public, déjà annoncé par le système) : ${p.nom || p.cle}${p.effet ? ` — ${p.effet.replace(/[.\s]+$/, "")}` : ""}. `
      + "Raconte-le à l'aube en une image, sans le recopier.");
  }
  if (Number(e.glas) > 0 && !e.vainqueur) {
    lignes.push(`Glas final (public) : la partie s'arrête au soir du jour ${e.glas} (aujourd'hui : jour ${e.tour}) ; le système tranche alors la victoire.`);
  }
  if (e.souffle?.actif && !e.vainqueur) {
    const utilises = new Set(e.souffle.utilises ?? []);
    const gardent = [...new Set((e.morts ?? []).map(m => m.acteurId))].filter(id => !utilises.has(id));
    if (gardent.length) lignes.push(`Dernier souffle : ${gardent.map(nom).join(", ")} ${gardent.length > 1 ? "gardent" : "garde"} encore sa voix (une seule, au vote d'exécution, comptée par le système).`);
  }
  if (e.vainqueur) return lignes;
  // Les secrets du MJ actif (ailleurs, api.somnambules lève une erreur et e.bonneEtoile est absent de l'état public).
  const reveurs = (typeof api?.somnambules === "function" ? essayer(() => api.somnambules()) : null)?.filter(s => !s.devoile) ?? [];
  if (reveurs.length) {
    lignes.push(`Somnambules — SECRET ABSOLU : ${reveurs.map(s => `${s.nom} croit être ${s.croitNom || s.croit}`).join(" ; ")}. Ne le trahis jamais `
      + "(ni allusion, ni regard appuyé) ; ses visions de nuit sont fausses : laisse-les l'être.");
  }
  if (e.bonneEtoile && Number(e.tour) <= 1) {
    lignes.push(`Bonne étoile — SECRET : ${nom(e.bonneEtoile)} est protégé la première nuit. Personne n'en sait rien, pas même lui : ne le dis jamais.`);
  }
  return lignes;
}

// Le Bailli, le Registre du greffier et les Masques de veillée (système lakour-loups 0.6.0 et plus). Défensif : un système plus
// ancien n'a ni api.bailli, ni api.registreTexte, ni api.masques, et la partie se joue sans eux.
const essayer = fn => { try { return fn(); } catch { return null; } };
export function etatBailliRegistreMasques(api, e = essayer(() => api.etat()) ?? {}) {
  const lignes = [];
  const b = typeof api?.bailli === "function" ? essayer(() => api.bailli()) : null;
  if (b?.actif && !e.vainqueur) {
    if (b.acteurId) lignes.push(`Bailli (public) : ${b.nom || b.acteurId} — sa voix compte double au vote d'exécution, il tranche les égalités.`);
    else if (b.succession) lignes.push(`Bailli : ${b.succession.nom || "le Bailli"} est mort ; il remet le sceau à un vivant (succession en cours, le système s'en charge).`);
    else if (b.election?.ok) lignes.push("Pas de Bailli : élis-le avant le vote d'exécution (loups_vote ouvrir, objet « bailli »).");
    else lignes.push("Pas de Bailli : la charge est vacante (une seule élection par jour, la prochaine au prochain jour).");
  }
  const registre = typeof api?.registreTexte === "function" ? essayer(() => api.registreTexte({ max: MAX_REGISTRE_NARRATEUR })) : null;
  if (registre?.length) {
    lignes.push("Registre du greffier (public ; pour toi, ne le récite pas — une déclaration n'est qu'une parole, ne la confirme ni ne l'infirme jamais) :",
      ...registre.map(l => `· ${l}`));
  }
  // Les Masques (MJ actif seulement : ailleurs, api.masques lève une erreur).
  const masques = typeof api?.masques === "function" && !e.vainqueur ? essayer(() => api.masques()) : null;
  if (masques?.length) {
    lignes.push(`Masques de veillée de la meute — SECRET ABSOLU : ${masques.map(m => m.nom || m.cle).join(", ")}. Des rôles du Village absents `
      + "de la partie, que les loups peuvent prétendre tenir. Ne les nomme jamais, ne dis jamais qu'un rôle n'est pas en jeu.");
  }
  return lignes;
}
export const MAX_REGISTRE_NARRATEUR = 20;
