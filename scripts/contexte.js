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
  const lignes = [`Partie : phase « ${e.phase} », tour ${e.tour}${e.vainqueur ? ` — TERMINÉE, victoire : ${e.vainqueur === "village" || e.vainqueur === "meute" ? e.vainqueur : nom(e.vainqueur)}` : ""}.`];
  lignes.push(`Vivants (${tous.filter(a => a.system.vivant).length}) : ${tous.filter(a => a.system.vivant).map(a => a.name).join(", ") || "aucun"}.`);
  if (e.morts?.length) lignes.push(`Morts : ${e.morts.map(m => `${nom(m.acteurId)} (${m.cause}, tour ${m.tour})`).join(", ")}.`);
  if (e.vote?.ouvert) {
    const recus = Object.keys(e.vote.votes ?? {}).length;
    lignes.push(`Vote OUVERT : ${recus} voix reçue(s) sur ${tous.filter(a => a.system.vivant).length}${e.vote.double ? ", vote double" : ""}.`);
  }
  const silences = tous.filter(a => a.system.vivant && a.system.silence).map(a => a.name);
  if (silences.length) lignes.push(`Réduits au silence aujourd'hui : ${silences.join(", ")}.`);
  return lignes;
}
