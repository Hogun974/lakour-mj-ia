// Guide d'utilisation du MJ IA, écrit une fois ici : installé dans chaque monde (deux journaux : guide du MJ, caché ; guide des
// joueurs, visible) et recopié dans docs/guide-utilisation.md par outils/ecrire-guide.mjs.
// Texte au format des journaux du module (paragraphes, **gras**, *italique*, listes « - », titres « # »).

export const VERSION_GUIDE = 3;

export const GUIDE_MJ = [
  { titre: "Démarrer", texte: `
# En deux minutes

- **Clés** : Réglages du jeu › Configurer les modules › MJ IA › **Configurer**. Choisis le fournisseur du MJ (Claude ou ChatGPT), colle sa clé, vérifie-la. La voix et les images passent par OpenAI : sans clé OpenAI, pas de voix payante ni d'image. Les clés restent dans TON navigateur, jamais dans le monde.
- **Personnalité** : Réglages › MJ IA › Personnalités › **Modifier**. Choisis le ton, la violence, la longueur, la rigueur des règles, la liberté avec le scénario, la voix.
- **Console** : bouton **chapeau de magicien** dans la barre de gauche (calque des jetons). Choisis la personnalité, puis **Démarrer la séance**.
- **Jouer** : les joueurs écrivent dans le chat. Le MJ IA leur répond quelques secondes après qu'ils ont fini d'écrire, pose les jetons sur la carte avant de raconter, lance les ambiances, demande les jets.
- **Finir** : **Terminer la séance**. L'IA donne l'expérience, écrit la chronique pour les joueurs et met à jour sa mémoire de campagne.` },
  { titre: "La console du MJ IA", texte: `
- **Démarrer / Terminer la séance** : l'IA ne répond qu'en séance. Une séance restée ouverte au départ du MJ est arrêtée au retour.
- **Souffler une consigne secrète** : une instruction que seuls toi et l'IA voyez (« fais intervenir un assassin à la prochaine scène »).
- **Préparer un scénario** : donne un thème ; l'IA crée journaux, PNJ et cartes, hors séance.
- **Créer un personnage avec le MJ** : l'IA guide le joueur dans le chat et crée SA fiche complète (Imperium Maledictum et D&D 5e). Un joueur connecté sans personnage se voit proposer une création automatiquement.
- **Vision des joueurs** : répare la vision des personnages (s'ils voient tout noir sur une carte).
- **Coût estimé** : ce que la séance a coûté chez le fournisseur ; un budget par séance arrête l'IA s'il est dépassé.` },
  { titre: "Réglages utiles", texte: `
- **Autonomie** : « Validation par le MJ humain » te demande d'approuver les actions sensibles (créer une fiche, éliminer, modifier un objet) ; « Autonome » laisse l'IA faire.
- **Délai avant réponse** : le temps que l'IA attend la fin des messages des joueurs.
- **Voix du narrateur** : aucune, navigateur (gratuite, chacun chez soi) ou OpenAI (payante, la même pour tous). Chaque joueur règle s'il l'entend.
- **Mettre en place le plateau avant de raconter** : l'IA pose PNJ, foules et personnages à l'endroit décrit avant d'afficher son récit.
- **Réactions** : l'IA peut réagir aux déplacements des joueurs, aux portes ouvertes, et jouer les PNJ en combat.
- **Style visuel** : cartes et jetons plats ou en relief.` },
  { titre: "Ce que l'IA sait faire", texte: `
- **Plateau** : créer des cartes jouables (murs, portes, lumières), y amener les personnages, poser PNJ et figurants « près du puits », les retirer, régler vision, lumières, portes et brouillard, passer en vue 3D (3D Canvas) et cadrer la caméra.
- **Récit** : voix, images (OpenAI), ambiances sonores (vent, pluie, taverne, forge, tension…), messages secrets à un seul joueur, votes de groupe et choix secrets.
- **Règles** : demander des jets pré-remplis (difficulté, modificateurs), lancer les dés des PNJ, mener les combats.
- **Campagne** : expérience, montée de niveau (D&D 5e) ou dépense d'XP (Imperium Maledictum), argent, objets, marchands, chronique visible des joueurs, mémoire de campagne.
- **Scénario** : suivre l'aventure écrite, ou l'adapter en jeu selon sa liberté (fidèle, adaptative, libre) ; chaque page réécrite garde sa version précédente.` },
  { titre: "Les trois mondes", texte: `
# Warhammer 40 000 — Imperium Maledictum
Modules **lakour-mj-ia** et **lakour-40k**. Contenu original du sous-secteur de la Kour : origines, factions, rôles, talents (une partie automatisés), armement, bestiaire, deux aventures et une campagne, lieux prêts à l'emploi. Installer : Réglages › La Kour 40k › Installer.

# Warcraft — D&D 5e
Modules **lakour-mj-ia**, **lakour-warcraft**, **dnd5e_fr-FR**, **babele**, **fr-core**. Peuples d'Azeroth, historiques, objets, bestiaire, aventure de départ et campagne, unités métriques. Installer : Réglages › La Kour Warcraft › Installer.

# Les Veillées de Brumecombe — loup-garou original
Modules **lakour-mj-ia**, **lakour-veillees**, **fr-core**, système **lakour-loups**. Personnalité conseillée : *La Voix de la brume*. L'IA compose une partie équilibrée pour le nombre de joueurs (ou prend votre liste), distribue les rôles en secret, mène les nuits, l'aube et le vote. La **Table de jeu** (bouton dans la barre de gauche) montre la partie à tous.` },
  { titre: "Compagnons IA", texte: `
# Des joueurs tenus par l'IA
Pour combler une table : des personnages côté joueurs, joués par une IA comme s'ils étaient des joueurs. Chacun a **son propre cerveau** (un appel au modèle séparé de celui du MJ) et ne sait que ce que sait son personnage : sa fiche, ce qu'on lui a dit en privé, le chat public, ce qu'il voit. Il ne triche pas : ni le prompt du MJ, ni la mémoire de campagne, ni les rôles des autres, ni les jetons cachés, ni les chuchotements.

- **Aux Veillées de Brumecombe** : demande au MJ IA une partie « avec 3 compagnons ». Ils reçoivent des places (noms tirés de la table du village, personnalité au hasard), choisissent la nuit en secret, se coordonnent en meute s'ils sont loups, parlent au débat et votent. Leur carnet secret reste chez le MJ.
- **En 40k et en Warcraft** : demande « ajoute un compagnon au groupe ». Le MJ IA crée sa fiche complète (comme pour un joueur, sans joueur assigné), lui donne un tempérament et une histoire et pose son jeton près du groupe. Après chaque narration, les compagnons présents peuvent réagir dans le chat ; en combat, à leur tour, ils déclarent leur action et le MJ IA la résout avec les vrais jets de leur fiche, lancés directement. Ils votent aux votes de groupe et répondent aux choix secrets.
- **Les retirer** : « Varn nous quitte » (son jeton part, sa fiche reste) ou « Varn reste au village » (il devient un simple PNJ).
- **Réglages** : *Modèle des compagnons IA* (vide = Claude Haiku 5.5, ou le moins cher d'OpenAI) et *Bavardage des compagnons IA* (silencieux, discret, normal, bavard : de 0 à 3 répliques après chaque réponse du MJ, une par compagnon ; jamais deux compagnons qui se répondent sans qu'un joueur ait écrit).
- **Coût** : un appel court par réplique ou par décision, au modèle des compagnons, compté dans le coût et le budget de la séance. Sans clé, budget atteint ou fournisseur factice : ils jouent en mode simple, sans IA, et la partie n'est jamais bloquée.
- **Leurs gestes** : un compagnon dit lui-même ce qu'il fait, à la manière du théâtre, par une courte didascalie en italique avant sa parole (« *Valentin regarde Clémence, les bras croisés.* — Moi, je l'ai vue sortir hier soir. »). Le MJ IA ne raconte plus ces gestes ni ces répliques : aux Veillées, il s'en tient à la nuit, à l'aube, aux morts, à l'animation du débat et aux résultats.

# Pilote automatique : quand il ne reste que des IA
En mode **Autonome**, si plus aucun joueur humain n'est en jeu (aux Veillées : plus aucun vivant tenu par un joueur, les morts peuvent regarder ; en 40k et en Warcraft : plus aucun personnage d'un joueur connecté sur la scène), la partie **continue seule**, étape par étape, sous les yeux des spectateurs.
- **Aux Veillées** : nuit, aube, un débat court entre compagnons (deux tours de parole), vote, exécution, puis la nuit suivante, jusqu'à la victoire et son dénouement. Le pilote ne relance jamais une autre partie.
- **En 40k et en Warcraft** : les combats se poursuivent tour après tour (un combat arrêté est relancé) ; hors combat, quelques échanges entre le MJ IA et les compagnons, puis une pause avec un avis.
- **Rythme** : une pause entre deux étapes (réglage *Pilote automatique : pause entre deux étapes*, 4 s par défaut), comptée après la fin de la voix du narrateur.
- **Garde-fous** : il s'arrête net à la victoire, à la fin de la séance, dès qu'un joueur humain revient, si tu repasses en *Validation*, au budget de la séance, après un nombre maximal d'étapes (réglage, 60 par défaut) ou quand la partie n'avance plus. Tu reçois un avis à chaque arrêt. Jamais deux étapes à la fois, jamais pendant que le MJ IA réfléchit.
- **Le reprendre en main** : la console du MJ IA montre le pilote, avec **Arrêter le pilote** (ou **Relancer le pilote** après une pause). Le réglage *Pilote automatique (compagnons seuls)* le coupe tout à fait. En mode *Validation*, pas de pilote : un avis te propose de passer en autonome ou de mener la suite.
- **Coût d'un tour de pilote aux Veillées** : par jour de jeu, sept tours du MJ IA (nuit, aube, réponses aux deux tours de parole, vote, dépouillement, exécution), soit une dizaine d'appels au modèle, plus les appels courts des compagnons (leurs choix de nuit, deux à quatre répliques, un vote chacun : une dizaine pour six compagnons).` },
  { titre: "Mener les Veillées soi-même, avec des joueurs IA", texte: `
Sans séance du MJ IA, c'est toi qui mènes la **Table de jeu** des Veillées ; des **joueurs IA** peuvent quand même compléter la table.
- **Ajouter des joueurs IA** : bouton **+ Joueur IA** de la Table. Chacun reçoit un nom du village et une personnalité ; la distribution des rôles de la Table les compte comme des joueurs.
- **La nuit** : quand tu réveilles un rôle tenu par un joueur IA, il choisit seul, en secret. **Le jour**, dès que la phase passe à « jour », les joueurs IA vivants prennent la parole (selon le *Bavardage des compagnons IA*), et ils répondent aux messages des joueurs humains — jamais entre eux sans un humain. **Au vote**, ils votent dans le même vote que tout le monde.
- **Coût** : leurs appels vont au compteur *Compagnons hors séance* de la console, remis à zéro à chaque nouvelle partie et borné par le budget de séance ; sans clé ou budget atteint, ils jouent en mode simple, sans IA.
- **Une autre partie** : avec le MJ IA, en fin de partie, il propose « une autre partie avec les mêmes joueurs ? » ; chaque partie repart de zéro (l'ancienne conversation est archivée, les joueurs IA oublient tout).` },
  { titre: "Sauvegardes et dépannage", texte: `
- Les mondes sont sauvegardés chaque nuit à 4 h 30 sur le serveur (14 jours). Avant chaque mise à jour des modules, une sauvegarde complète est faite aussi.
- Une mise à jour d'un script se voit après **F5**. Une mise à jour des compendiums demande un redémarrage du serveur.
- Si l'IA ne répond plus : la séance est-elle démarrée ? la clé est-elle valide (Configurer › Vérifier) ? le budget est-il atteint ?
- Si une fenêtre de D&D 5e s'ouvre pendant une création : un choix de l'IA a été refusé par le système ; finis-la à la main.` }
];

export const GUIDE_JOUEURS = [
  { titre: "Jouer avec le MJ IA", texte: `
- **Parle dans le chat**, comme à une table : ce que fait ton personnage, ce qu'il dit. Le MJ répond quand tout le monde a fini d'écrire.
- **Les jets** : quand le MJ demande un test, une fenêtre s'ouvre déjà réglée (difficulté, modificateurs) ; vérifie et lance.
- **Ce que toi seul vois** : les messages chuchotés du MJ, les choix secrets et les votes s'ouvrent chez toi seulement.
- **La voix** : Réglages › MJ IA › « Entendre la narration » pour l'activer ou la couper chez toi.
- **Ta fiche** : le MJ peut la créer avec toi, et la tient à jour (expérience, argent, objets) ; tu peux toujours la consulter.
- **Les cartes** : tu peux déplacer ton jeton ; le MJ réagit à ce que tu découvres. S'il bloque tes déplacements, c'est voulu (scène en cours).
- **Les compagnons IA** : des personnages joués par l'IA peuvent compléter la table. Ils parlent sous leur nom et jouent comme toi, sans tricher : ils ne savent que ce que sait leur personnage.` },
  { titre: "Les Veillées de Brumecombe", texte: `
- Ton **rôle** t'est donné en secret au début ; garde-le pour toi.
- La **nuit**, si ton rôle agit, une fenêtre s'ouvre chez toi seul : choisis, ou passe.
- Le **jour**, débattez, puis **votez** dans la fenêtre de vote ou la Table de jeu. Les voix restent cachées jusqu'à la fin du vote.
- Les **morts** se taisent et ne votent plus.
- Le guide du joueur de Brumecombe (journal du monde) décrit tous les rôles, métiers et bâtiments.` }
];

// Installe ou met à jour les deux journaux du guide dans le monde (MJ actif seulement, une fois par version du guide).
export async function installerGuide({ id, versHTML }) {
  const journaux = [
    { cle: "guide-mj", nom: "MJ IA — Guide du MJ", pages: GUIDE_MJ, visible: false },
    { cle: "guide-joueurs", nom: "MJ IA — Guide des joueurs", pages: GUIDE_JOUEURS, visible: true }
  ];
  for (const j of journaux) {
    const existant = game.journal.find(x => x.getFlag(id, "guide") === j.cle);
    if (existant && existant.getFlag(id, "versionGuide") >= VERSION_GUIDE) continue;
    const pages = j.pages.map((p, i) => ({ name: p.titre, type: "text", sort: (i + 1) * 100, text: { content: versHTML(p.texte) } }));
    if (existant) {
      await existant.deleteEmbeddedDocuments("JournalEntryPage", existant.pages.map(p => p.id));
      await existant.createEmbeddedDocuments("JournalEntryPage", pages);
      await existant.setFlag(id, "versionGuide", VERSION_GUIDE);
    } else {
      await JournalEntry.implementation.create({
        name: j.nom, pages,
        ownership: { default: j.visible ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [id]: { guide: j.cle, versionGuide: VERSION_GUIDE } }
      });
    }
  }
}
