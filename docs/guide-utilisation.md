# Guide d'utilisation — MJ IA de La Kour

Ce guide est aussi installé dans chaque monde par le MJ IA (journaux « MJ IA — Guide du MJ » et « MJ IA — Guide des joueurs »).

## Pour le MJ

### Démarrer

#### En deux minutes

- **Clés** : Réglages du jeu › Configurer les modules › MJ IA › **Configurer**. Choisis le fournisseur du MJ (Claude ou ChatGPT), colle sa clé, vérifie-la. La voix et les images passent par OpenAI : sans clé OpenAI, pas de voix payante ni d'image. Les clés restent dans TON navigateur, jamais dans le monde.
- **Personnalité** : Réglages › MJ IA › Personnalités › **Modifier**. Choisis le ton, la violence, la longueur, la rigueur des règles, la liberté avec le scénario, la voix.
- **Console** : bouton **chapeau de magicien** dans la barre de gauche (calque des jetons). Choisis la personnalité, puis **Démarrer la séance**.
- **Jouer** : les joueurs écrivent dans le chat. Le MJ IA leur répond quelques secondes après qu'ils ont fini d'écrire, pose les jetons sur la carte avant de raconter, lance les ambiances, demande les jets.
- **Finir** : **Terminer la séance**. L'IA donne l'expérience, écrit la chronique pour les joueurs et met à jour sa mémoire de campagne.

### La console du MJ IA

- **Démarrer / Terminer la séance** : l'IA ne répond qu'en séance. Une séance restée ouverte au départ du MJ est arrêtée au retour.
- **Souffler une consigne secrète** : une instruction que seuls toi et l'IA voyez (« fais intervenir un assassin à la prochaine scène »).
- **Préparer un scénario** : donne un thème ; l'IA crée journaux, PNJ et cartes, hors séance.
- **Créer un personnage avec le MJ** : l'IA guide le joueur dans le chat et crée SA fiche complète (Imperium Maledictum et D&D 5e). Un joueur connecté sans personnage se voit proposer une création automatiquement.
- **Vision des joueurs** : répare la vision des personnages (s'ils voient tout noir sur une carte).
- **Coût estimé** : ce que la séance a coûté chez le fournisseur ; un budget par séance arrête l'IA s'il est dépassé.

### Réglages utiles

- **Autonomie** : « Validation par le MJ humain » te demande d'approuver les actions sensibles (créer une fiche, éliminer, modifier un objet) ; « Autonome » laisse l'IA faire.
- **Délai avant réponse** : le temps que l'IA attend la fin des messages des joueurs.
- **Voix du narrateur** : aucune, navigateur (gratuite, chacun chez soi) ou OpenAI (payante, la même pour tous). Chaque joueur règle s'il l'entend.
- **Mettre en place le plateau avant de raconter** : l'IA pose PNJ, foules et personnages à l'endroit décrit avant d'afficher son récit.
- **Réactions** : l'IA peut réagir aux déplacements des joueurs, aux portes ouvertes, et jouer les PNJ en combat.
- **Style visuel** : cartes et jetons plats ou en relief.

### Ce que l'IA sait faire

- **Plateau** : créer des cartes jouables (murs, portes, lumières), y amener les personnages, poser PNJ et figurants « près du puits », les retirer, régler vision, lumières, portes et brouillard, passer en vue 3D (3D Canvas) et cadrer la caméra.
- **Récit** : voix, images (OpenAI), ambiances sonores (vent, pluie, taverne, forge, tension…), messages secrets à un seul joueur, votes de groupe et choix secrets.
- **Règles** : demander des jets pré-remplis (difficulté, modificateurs), lancer les dés des PNJ, mener les combats.
- **Campagne** : expérience, montée de niveau (D&D 5e) ou dépense d'XP (Imperium Maledictum), argent, objets, marchands, chronique visible des joueurs, mémoire de campagne.
- **Scénario** : suivre l'aventure écrite, ou l'adapter en jeu selon sa liberté (fidèle, adaptative, libre) ; chaque page réécrite garde sa version précédente.

### Les trois mondes

#### Warhammer 40 000 — Imperium Maledictum
Modules **lakour-mj-ia** et **lakour-40k**. Contenu original du sous-secteur de la Kour : origines, factions, rôles, talents (une partie automatisés), armement, bestiaire, deux aventures et une campagne, lieux prêts à l'emploi. Installer : Réglages › La Kour 40k › Installer.

#### Warcraft — D&D 5e
Modules **lakour-mj-ia**, **lakour-warcraft**, **dnd5e_fr-FR**, **babele**, **fr-core**. Peuples d'Azeroth, historiques, objets, bestiaire, aventure de départ et campagne, unités métriques. Installer : Réglages › La Kour Warcraft › Installer.

#### Les Veillées de Brumecombe — loup-garou original
Modules **lakour-mj-ia**, **lakour-veillees**, **fr-core**, système **lakour-loups**. Personnalité conseillée : *La Voix de la brume*. L'IA compose une partie équilibrée pour le nombre de joueurs (ou prend votre liste), distribue les rôles en secret, mène les nuits, l'aube et le vote. La **Table de jeu** (bouton dans la barre de gauche) montre la partie à tous.

### Compagnons IA

#### Des joueurs tenus par l'IA
Pour combler une table : des personnages côté joueurs, joués par une IA comme s'ils étaient des joueurs. Chacun a **son propre cerveau** (un appel au modèle séparé de celui du MJ) et ne sait que ce que sait son personnage : sa fiche, ce qu'on lui a dit en privé, le chat public, ce qu'il voit. Il ne triche pas : ni le prompt du MJ, ni la mémoire de campagne, ni les rôles des autres, ni les jetons cachés, ni les chuchotements.

- **Aux Veillées de Brumecombe** : demande au MJ IA une partie « avec 3 compagnons ». Ils reçoivent des places (noms tirés de la table du village, personnalité au hasard), choisissent la nuit en secret, se coordonnent en meute s'ils sont loups, parlent au débat et votent. Leur carnet secret reste chez le MJ.
- **En 40k et en Warcraft** : demande « ajoute un compagnon au groupe ». Le MJ IA crée sa fiche complète (comme pour un joueur, sans joueur assigné), lui donne un tempérament et une histoire et pose son jeton près du groupe. Après chaque narration, les compagnons présents peuvent réagir dans le chat ; en combat, à leur tour, ils déclarent leur action et le MJ IA la résout avec les vrais jets de leur fiche, lancés directement. Ils votent aux votes de groupe et répondent aux choix secrets.
- **Les retirer** : « Varn nous quitte » (son jeton part, sa fiche reste) ou « Varn reste au village » (il devient un simple PNJ).
- **Réglages** : *Modèle des compagnons IA* (vide = Claude Haiku 5.5, ou le moins cher d'OpenAI) et *Bavardage des compagnons IA* (silencieux, discret, normal, bavard : de 0 à 3 répliques après chaque réponse du MJ, une par compagnon ; jamais deux compagnons qui se répondent sans qu'un joueur ait écrit).
- **Coût** : un appel court par réplique ou par décision, au modèle des compagnons, compté dans le coût et le budget de la séance. Sans clé, budget atteint ou fournisseur factice : ils jouent en mode simple, sans IA, et la partie n'est jamais bloquée.

### Sauvegardes et dépannage

- Les mondes sont sauvegardés chaque nuit à 4 h 30 sur le serveur (14 jours). Avant chaque mise à jour des modules, une sauvegarde complète est faite aussi.
- Une mise à jour d'un script se voit après **F5**. Une mise à jour des compendiums demande un redémarrage du serveur.
- Si l'IA ne répond plus : la séance est-elle démarrée ? la clé est-elle valide (Configurer › Vérifier) ? le budget est-il atteint ?
- Si une fenêtre de D&D 5e s'ouvre pendant une création : un choix de l'IA a été refusé par le système ; finis-la à la main.

## Pour les joueurs

### Jouer avec le MJ IA

- **Parle dans le chat**, comme à une table : ce que fait ton personnage, ce qu'il dit. Le MJ répond quand tout le monde a fini d'écrire.
- **Les jets** : quand le MJ demande un test, une fenêtre s'ouvre déjà réglée (difficulté, modificateurs) ; vérifie et lance.
- **Ce que toi seul vois** : les messages chuchotés du MJ, les choix secrets et les votes s'ouvrent chez toi seulement.
- **La voix** : Réglages › MJ IA › « Entendre la narration » pour l'activer ou la couper chez toi.
- **Ta fiche** : le MJ peut la créer avec toi, et la tient à jour (expérience, argent, objets) ; tu peux toujours la consulter.
- **Les cartes** : tu peux déplacer ton jeton ; le MJ réagit à ce que tu découvres. S'il bloque tes déplacements, c'est voulu (scène en cours).
- **Les compagnons IA** : des personnages joués par l'IA peuvent compléter la table. Ils parlent sous leur nom et jouent comme toi, sans tricher : ils ne savent que ce que sait leur personnage.

### Les Veillées de Brumecombe

- Ton **rôle** t'est donné en secret au début ; garde-le pour toi.
- La **nuit**, si ton rôle agit, une fenêtre s'ouvre chez toi seul : choisis, ou passe.
- Le **jour**, débattez, puis **votez** dans la fenêtre de vote ou la Table de jeu. Les voix restent cachées jusqu'à la fin du vote.
- Les **morts** se taisent et ne votent plus.
- Le guide du joueur de Brumecombe (journal du monde) décrit tous les rôles, métiers et bâtiments.
