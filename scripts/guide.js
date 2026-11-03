// Guide d'utilisation du MJ IA, écrit une fois ici : installé dans chaque monde (deux journaux : guide du MJ, caché ; guide des
// joueurs, visible) et recopié dans docs/guide-utilisation.md par outils/ecrire-guide.mjs.
// Texte au format des journaux du module (paragraphes, **gras**, *italique*, listes « - », titres « # »).

export const VERSION_GUIDE = 12;

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
- **Voix du narrateur** : aucune, navigateur (gratuite, chacun chez soi) ou OpenAI (payante, en direct, et chaque compagnon IA a la sienne). Chaque joueur règle s'il l'entend.
- **Mettre en place le plateau avant de raconter** : l'IA pose PNJ, foules et personnages à l'endroit décrit avant d'afficher son récit.
- **Réactions** : l'IA peut réagir aux déplacements des joueurs, aux portes ouvertes, et jouer les PNJ en combat.
- **Style visuel** : cartes et jetons plats ou en relief.` },
  { titre: "Ce que l'IA sait faire", texte: `
- **Plateau** : créer des cartes jouables (murs, portes, lumières, sons d'ambiance, zones invisibles des joueurs), les faire évoluer en jeu (zone de lore qui s'affiche quand un jeton entre, piège qui met en pause, escalier qui téléporte, obscurité, épingle vers un journal, son localisé), y amener les personnages, poser PNJ et figurants « près du puits », les retirer, régler vision, lumières, portes et brouillard, passer en vue 3D (3D Canvas) et cadrer la caméra.
- **Récit** : voix, images (OpenAI), ambiances sonores (vent, pluie, taverne, forge, tension…), messages secrets à un seul joueur, votes de groupe et choix secrets ; **montrer une aide de jeu** aux joueurs (lettre, contrat, page par page), jamais un journal réservé au MJ ; tirer dans les tables du module (rumeurs, visages, complications…).
- **Règles** : demander des jets pré-remplis (difficulté, modificateurs), lancer les dés des PNJ, mener les combats.
- **Campagne** : expérience, montée de niveau (D&D 5e) ou dépense d'XP (Imperium Maledictum), argent, objets, marchands, chronique visible des joueurs, mémoire de campagne.
- **Modules d'effets** (seulement s'ils sont actifs dans le monde) : animations de sorts, tirs, explosions et soins (**Sequencer** + **JB2A**), météo sur la carte (**FXMaster** : pluie, orage, neige, brouillard, braises…), date, heure et météo du jour (**Calendaria**, 40k et Warcraft), tas de butin, coffres et marchands (**Item Piles**, Warcraft).
- **Scénario** : suivre l'aventure écrite, ou l'adapter en jeu selon sa liberté (fidèle, adaptative, libre) ; chaque page réécrite garde sa version précédente.` },
  { titre: "Les trois mondes", texte: `
# Warhammer 40 000 — Imperium Maledictum
Modules **lakour-mj-ia** et **lakour-40k**. Contenu original du sous-secteur de la Kour : origines, factions, rôles, talents (une partie automatisés), armement, bestiaire, deux aventures et une campagne, lieux prêts à l'emploi, des tables du MJ (Patron, missions, enquête, ruche, Warp, butin…). **Fiche La Kour** : en-tête avec Origine, Faction, Rôle et Patron, jauges, inventaire par catégories avec icônes et encombrement (on peut revenir à la fiche d'impmal dans la configuration de la fiche). L'assistant de création équipe le personnage (armure portée, arme en main, munitions). Cartes d'aventure épinglées sur le journal du MJ, avec sons et zones. Installer : Réglages › La Kour 40k › Installer, ou importer l'aventure du compendium **Aventures** (proposée aussi à la création d'un monde).

# Warcraft — D&D 5e
Modules **lakour-mj-ia**, **lakour-warcraft**, **dnd5e_fr-FR**, **babele**, **fr-core**. Peuples d'Azeroth, historiques, **8 sous-classes** (Domaine des Éléments, Main d'argent, Rêve d'émeraude, Gladiateur d'Orgrimmar, Chasseur de démons illidari, Pacte de la Gangrène, Kirin Tor, SI:7), **dons** et **affiliations**, **sorts** maison (dans les listes des classes), **arsenal** (armes de faction, armures, munitions, prothèses, objets magiques), **afflictions** (blessures, maladies, corruption gangrenée), bestiaire aux couleurs des factions, aventure de départ et campagne, unités métriques. Journaux liés et jets cliquables ; cartes épinglées, avec sons et zones. Installer : Réglages › La Kour Warcraft › Installer, ou importer l'aventure du compendium **Aventures** (proposée aussi à la création d'un monde).

# Les Veillées de Brumecombe — loup-garou original
Modules **lakour-mj-ia**, **lakour-veillees**, **fr-core**, système **lakour-loups**. Personnalité conseillée : *La Voix de la brume*. L'IA compose une partie équilibrée pour le nombre de joueurs (ou prend votre liste), distribue les rôles en secret, mène les nuits, l'aube et le vote. La **Table de jeu** (bouton dans la barre de gauche) montre la partie à tous. Le vote à minuteur se clôt seul à zéro ; chaque partie finie entre aux **Chroniques de Brumecombe** (palmarès). La brume tombe la nuit, l'écran tremble à une mort (réglage client « Effets visuels »). Chaque bâtiment de la carte est épinglé sur sa page de règles.` },
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
  { titre: "Tour par tour (40k et Warcraft)", texte: `
# Le combat guidé pas à pas
Le panneau **Tour par tour** (bouton **bouclier** dans la barre de gauche, calque des jetons) s'ouvre aussi tout seul quand un combat commence. Il s'appuie sur le combat de Foundry, sans le remplacer, et sert avec ou sans MJ IA. À chaque instant, **l'étape suivante** est écrite en haut (« Prochaine étape : … ») et le bouton qui la fait est **encadré de pointillés** : il suffit de suivre les pointillés.
- **Préparer** : coche les jetons de la scène (joueurs, compagnons et ennemis visibles cochés d'office), **Ajouter au combat**, **Lancer l'initiative** (la vraie méthode du système : d20 + initiative en D&D 5e ; Initiative + Réflexes en Imperium Maledictum), **Commencer le combat**.
- **Tour en cours** : qui joue (portrait, PV ou blessures, défense, états), ce qu'il lui reste (D&D 5e : action, action bonus, réaction, mouvement en mètres ; Imperium Maledictum : son action et son déplacement), ses attaques et pouvoirs en boutons qui ouvrent les **vrais jets** du système, et les **cibles** avec leur distance en mètres, leur CA ou leur défense, et si elles sont à portée.
- **Tour d'un PNJ** : une **proposition** sans IA (l'adversaire le plus proche, la meilleure attaque à portée, sinon il se rapproche). **Accepter** la joue : déplacement, jet d'attaque, jet de dégâts du système. Puis **Appliquer N dégâts** (méthode du système : PV en D&D 5e ; armure, localisation et critiques en Imperium Maledictum). Tu peux aussi choisir une autre cible et une autre arme.
- **Tour d'un joueur** : on l'attend ; il voit ses actions dans son bandeau. Le panneau suit ses jets au chat (attaque, dégâts, test opposé) et te propose d'**appliquer** les dégâts.
- **Tour d'un compagnon IA** : il agit seul, même sans séance du MJ IA (sans IA : la proposition), puis le tour passe.
- **Rappels** : effet terminé (**Fin de l'effet**), concentration et sauvegarde après des dégâts, régénération, actions légendaires en fin de tour (D&D 5e), à terre, jets contre la mort (D&D 5e), test opposé du défenseur (Imperium Maledictum : **Il esquive** ou **Sans opposition**).
- **Fin** : « Fin du tour → au suivant », « Nouveau round », « Fin du combat (tous les ennemis à terre) ».
- **Réglage** *Seul le combattant actif peut bouger* (désactivé par défaut) : pendant un combat, un joueur ne bouge que le jeton dont c'est le tour ; toi, jamais bloqué.
- **Avec le MJ IA** : il lit la même étape suivante (« Tour : X ; étape suivante : … ») et peut demander l'état complet (outil combat_etat). En séance, il joue les PNJ comme avant : n'accepte la proposition que s'il ne le fait pas.

# Le tour de table, hors combat
Bouton **Commencer un tour de table** du panneau : la parole passe à chacun dans l'ordre (joueurs, puis compagnons IA). Celui qui a la parole décrit ce que fait son personnage ; son message dans le chat, ou son bouton **J'ai fini** / **Je passe**, donne la parole au suivant. Tu peux aussi presser **A parlé** ou **Passe**. Avec le MJ IA en séance, il attend que tout le monde ait parlé (ou passé) avant de raconter la suite, puis peut relancer un tour (outil tour_de_table).` },
  { titre: "Horloges, jauges et réputations (40k et Warcraft)", texte: `
# Ce qui avance hors champ
Le **Carnet de campagne** (bouton **livre ouvert** dans la barre de gauche, calque des jetons, ou bouton **Carnet de campagne** de la console), onglet **Horloges**, montre trois sortes d'éléments, que le MJ IA crée et fait vivre avec son outil **horloge** :
- **Horloge** : 4 à 12 segments, à la façon de *Blades in the Dark*. Une menace ou un projet qui mûrit (« le culte achève son rituel », « les renforts arrivent ») : elle avance quand le temps passe ou qu'un échec la nourrit, et quand elle est pleine, **elle sonne** : l'événement arrive.
- **Jauge** : un compteur de 0 au maximum, avec des **seuils** nommés. En 40k, l'**Exposition** (id *exposition*) : plus elle monte, plus l'équipe s'est fait remarquer (un coup d'éclat, un combat bruyant, un témoin laissé derrière).
- **Réputation** : les points d'une faction, de -100 à +100, lus en **paliers** : **Haï** (-100 à -51), **Hostile** (-50 à -21), **Inamical** (-20 à -6), **Neutre** (-5 à +5), **Amical** (+6 à +20), **Honoré** (+21 à +50), **Révéré** (+51 à +80), **Exalté** (+81 et plus). Un service vaut +3 à +5, un grand service +10 à +15, un affront -5, une trahison -20 à -30.

# À la table
- **Clic** sur un camembert ou une barre : avancer d'un cran ; **clic droit** (ou **−**) : reculer. L'**œil** montre l'élément aux joueurs ou le leur cache : ils ne voient que ce que tu as montré.
- Quand une horloge sonne, qu'une jauge franchit un seuil ou qu'une réputation change de palier, une **carte** paraît au chat (chuchotée aux MJ si l'élément est caché) et le **MJ IA** en est prévenu pour en tirer une conséquence.
- Le MJ IA voit l'état de chaque élément à chaque tour ; ses **notes** (ce qui arrive quand l'horloge sonne) restent secrètes. Pendant un intermède, il avance les horloges des factions.
- **Modules des mondes** : *game.modules.get("lakour-mj-ia").api.horloges* — *assurer(def)* crée un élément s'il n'existe pas (par son id) et le rend ; *avancer(id, n)* ; *lister()* ; *palier(id)*. Seul le MJ actif écrit.
- **Réinitialiser la campagne** efface aussi les horloges.` },
  { titre: "Enquêtes et contacts (40k et Warcraft)", texte: `
# Le tableau d'enquête
Onglet **Enquêtes** du **Carnet de campagne**. Le MJ IA y tient chaque mystère avec son outil **enquete**, selon la **règle des trois indices** :
- des **conclusions** : ce que les joueurs doivent comprendre (« le diacre ment sur les muets ») ;
- des **indices** : où les trouver (un lieu, un PNJ, un document, un test) et à quelles conclusions ils mènent. Chaque conclusion devrait en avoir **au moins trois**, par des chemins différents : les joueurs en rateront. Le MJ IA est prévenu à chaque modification quand une conclusion en a moins de trois encore trouvables (marque **moins de 3 indices** chez toi).
- **Coche** un indice trouvé ou une conclusion révélée ; l'**œil** montre l'enquête aux joueurs, qui n'en voient que les indices trouvés et les conclusions révélées.
- Le MJ IA a l'enquête en cours dans son contexte (six lignes au plus) : il coche ce que les joueurs trouvent et ajoute des indices quand il le faut.

# Les contacts et les dettes
Onglet **Contacts**. Le MJ IA y note avec son outil **contact** les PNJ que les personnages connaissent : faction, lieu, **attitude** de -3 (**Hostile**) à +3 (**Allié**), en passant par Méfiant, Réservé, Neutre, Bienveillant et Amical, la **dette** (qui doit quoi à qui) et ce qu'il **demande** en échange de son aide.
- **+** et **−** changent l'attitude, l'**œil** montre le contact aux joueurs (sans tes notes ni l'historique).
- Le MJ IA a dans son contexte les contacts présents sur la scène ou liés au lieu, puis les plus récents (six lignes au plus) : il les fait revenir, et les dettes avec eux.
- **Modules des mondes** : *api.enquetes* et *api.contacts* — *assurer(def)* crée l'élément s'il n'existe pas (par son id) et le rend ; *lister()* ; *trouver(ref)*. Seul le MJ actif écrit.
- **Réinitialiser la campagne** efface aussi enquêtes et contacts.

# Ce qui reste secret : le coffre
Foundry envoie les réglages du monde à tous les navigateurs, et sert les fichiers de Data/ à qui en connaît l'adresse. Le Carnet n'y garde donc en clair que ce que voient les joueurs : les éléments montrés, sans tes notes, sans les indices non trouvés ni les conclusions cachées, sans l'historique ni le PNJ des contacts. Le reste du Carnet est **chiffré** dans un coffre, comme le **fil de l'IA** (Data/lakour-mj-ia/fils/, qui contient l'état du jeu donné à l'IA à chaque tour), dans les trois mondes, et les répliques de voix privées ne sont plus déposées dans Data. Ne sont PAS chiffrés : la mémoire de campagne et les journaux du MJ (scénarios, secrets), qui sont des documents réservés au MJ, protégés par les droits de Foundry. La clé reste dans ton navigateur ; chaque joueur qui l'accuse en garde une **part**, et il en faut une majorité pour la retrouver.
- **Montrer** un élément le sort du coffre (sans ses notes) ; le **cacher** l'y range. Un élément caché a un identifiant tiré au hasard, qui ne dit pas son nom ; il ne fait pas de carte au chat (tu es prévenu par une notification).
- **Clé de secours** (Réglages › MJ IA › **Coffre**) : un petit fichier à télécharger et à garder hors du monde, comme un mot de passe ; réimporté sur un autre navigateur, il rouvre tout sans les joueurs. Le MJ IA t'invite à l'exporter quand trop peu de joueurs gardent une part (table de un ou deux joueurs).
- **Nouveau navigateur** (autre poste, cache vidé) : un bandeau le dit ; les parts sont demandées aux joueurs connectés et la clé aux autres MJ connectés. En attendant, les éléments visibles restent utilisables, mais rien n'est créé, caché, retiré ni changé de secret, l'IA repart d'un fil vide et rien de chiffré n'est écrasé. *api.coffre.chercher()* redemande les parts.
- **Renouvellement** quand un compte est supprimé, créé ou change de rôle (et à la demande, fenêtre du Coffre ou *api.coffre.renouveler()*) : la nouvelle clé n'entre en vigueur qu'une fois ses parts reçues par assez de joueurs (ou sa clé de secours exportée) ; jusque-là l'ancienne reste en vigueur, et rien n'est jamais scellé sous une clé que personne ne pourrait retrouver.
- **Mots de passe** : un compte joueur sans mot de passe est une part que n'importe qui peut prendre ; sans mots de passe, le coffre ne protège rien.
- **Clé perdue** (ni parts, ni autre MJ, ni clé de secours) : *api.coffre.abandonner({ confirmer: true })* renonce aux éléments cachés et aux fils chiffrés (gardés à part, illisibles) ; les visibles restent.` },
  { titre: "Mener les Veillées soi-même, avec des joueurs IA", texte: `
Sans séance du MJ IA, c'est toi qui mènes la **Table de jeu** des Veillées ; des **joueurs IA** peuvent quand même compléter la table.
- **Ajouter des joueurs IA** : bouton **+ Joueur IA** de la Table. Chacun reçoit un nom du village et une personnalité ; la distribution des rôles de la Table les compte comme des joueurs.
- **La nuit** : quand tu réveilles un rôle tenu par un joueur IA, il choisit seul, en secret. **Le jour**, dès que la phase passe à « jour », les joueurs IA vivants prennent la parole (selon le *Bavardage des compagnons IA*), et ils répondent aux messages des joueurs humains — jamais entre eux sans un humain. **Au vote**, ils votent dans le même vote que tout le monde.
- **Coût** : leurs appels vont au compteur *Compagnons hors séance* de la console, remis à zéro à chaque nouvelle partie et borné par le budget de séance ; sans clé ou budget atteint, ils jouent en mode simple, sans IA.
- **Une autre partie** : avec le MJ IA, en fin de partie, il propose « une autre partie avec les mêmes joueurs ? » ; chaque partie repart de zéro (l'ancienne conversation est archivée, les joueurs IA oublient tout).` },
  { titre: "Voix et écoute", texte: `
# Les IA parlent en direct
Avec la voix **OpenAI**, chaque morceau de voix part aux joueurs dès qu'il est produit : la voix démarre presque aussitôt, sans les deux secondes d'attente d'avant. Le fichier complet est gardé ensuite pour le bouton 🔊 (réécouter).
- **Toutes les IA parlent** : le narrateur, et chaque compagnon IA avec sa propre voix, choisie selon son tempérament (jamais celle du narrateur, autant que possible différente de celle des autres compagnons) et gardée sur sa fiche. Un compagnon ne dit que sa parole : son geste en italique ne se lit pas.
- **Une seule voix à la fois** : les voix attendent leur tour et parlent dans l'ordre du chat (narrateur et compagnons, comme on les lit). L'ambiance sonore baisse pendant qu'une IA parle.
- **Qui entend** : tout le monde, sauf aux Veillées, où le système dit qui peut entendre qui (un compagnon mort ne parle qu'aux morts, un loup la nuit qu'aux loups). Le narrateur est entendu de tous.
- **Réglages** : *Voix OpenAI en direct* (décoché : l'ancienne voix, enregistrée en entière puis jouée). Chaque joueur règle chez lui *Entendre les voix des IA* et *Volume de la voix des IA*.
- **Sans clé OpenAI ou budget atteint** : la narration est lue par la voix du navigateur de chacun, les compagnons restent en texte.

# Les IA entendent les joueurs
Quand une IA doit entendre (une séance du MJ IA est lancée, ou un compagnon IA vivant est à la table), ce que les joueurs disent dans la **voix intégrée de Foundry** est transcrit pour elles. Le reste du temps, aucun micro n'est écouté et rien n'est payé.
- **À activer** : Réglages du jeu › Configurer les paramètres › **Audio/Vidéo** : mode **Audio seulement** (pas de vidéo à La Kour : rien ne dépend de la caméra) ; chaque joueur choisit son micro et un mode de parole (*toujours*, *selon l'activité vocale* ou *appuyer pour parler*). Le MJ actif doit avoir la page ouverte : c'est son navigateur qui écoute.
- **Qui a parlé** : le son arrive joueur par joueur, l'IA sait qui parle. Un micro coupé, ou une touche de parole relâchée, n'est pas écouté.
- **Ce qu'en fait l'IA** : le MJ IA reçoit la phrase comme un message (« 🗣️ Jordan (à voix haute) : … »), sans qu'elle paraisse dans le chat des joueurs ; les compagnons l'apprennent seulement s'ils pouvaient l'entendre (aux Veillées : un compagnon vivant n'entend pas les morts, la nuit seuls les loups s'entendent), et peuvent y répondre.
- **Chaque joueur est prévenu** : une pastille « L'IA écoute » en haut de l'écran tant que l'écoute tourne.
- **Réglages** : *Écouter la parole des joueurs* (le couper arrête tout), *Modèle de transcription* (vide : le moins cher, environ 0,3 centime par minute de parole), *Montrer les transcriptions au MJ* (chuchotées aux MJ). Le coût va au compteur de la séance, ou à *Compagnons hors séance*, borné par le budget.
- **Limites** : sans serveur relais (TURN), la voix de Foundry passe de navigateur à navigateur ; un joueur derrière un réseau strict peut ne pas être entendu du MJ, ni donc transcrit. Un joueur sans casque peut renvoyer la voix des IA dans son micro : ce qui ressemble à ce qu'une IA vient de dire est ignoré.` },
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
- **La voix** : Réglages › MJ IA › « Entendre les voix des IA » et « Volume de la voix des IA » pour régler chez toi la voix du narrateur et des compagnons.
- **Parler à voix haute** : si la voix de Foundry est active, quand une IA écoute (pastille « L'IA écoute » en haut de l'écran), ce que tu dis est transcrit pour le MJ IA et les compagnons qui peuvent t'entendre. Coupe ton micro pour ne pas l'être.
- **Ta fiche** : le MJ peut la créer avec toi, et la tient à jour (expérience, argent, objets) ; tu peux toujours la consulter.
- **Les cartes** : tu peux déplacer ton jeton ; le MJ réagit à ce que tu découvres. S'il bloque tes déplacements, c'est voulu (scène en cours).
- **Les compagnons IA** : des personnages joués par l'IA peuvent compléter la table. Ils parlent sous leur nom et jouent comme toi, sans tricher : ils ne savent que ce que sait leur personnage.` },
  { titre: "Tour par tour (40k et Warcraft)", texte: `
- **En combat**, un bandeau en haut de l'écran te dit où on en est : « ⚔️ Round 3 — À toi de jouer ! », ou « Au tour de X, puis toi ».
- **À ton tour**, il montre ce qu'il te reste (D&D 5e : action, action bonus, réaction, mouvement en mètres ; Imperium Maledictum : action et déplacement) et tes attaques en boutons : ils ouvrent tes vrais jets. Désigne d'abord ta cible (touche **T** sur son jeton).
- **Fin de mon tour** passe la main au suivant.
- Quand ton tour arrive, un **tintement** discret sonne chez toi seul (réglage « M'appeler quand c'est à moi » du MJ IA) ; de même pour un vote de groupe ou un choix secret.
- Si le MJ l'a réglé ainsi, seul le combattant dont c'est le tour peut bouger son jeton.
- **Hors combat**, le MJ peut faire un **tour de table** : quand vient ton tour, le bandeau dit « À toi de décrire ce que fait ton personnage ». Écris-le dans le chat (ou presse **J'ai fini**), ou **Je passe**.` },
  { titre: "Carnet de campagne (40k et Warcraft)", texte: `
- Le bouton **livre ouvert** de la barre de gauche ouvre le **Carnet de campagne** : ce que le MJ a choisi de te montrer, en trois onglets (Horloges, Enquêtes, Contacts).
- Une **horloge** se remplit segment par segment : quand elle est pleine, quelque chose arrive. Une **jauge** monte avec vos actions (l'Exposition, en 40k : plus elle est haute, plus vous êtes repérés). Une **réputation** dit ce qu'une faction pense de vous, de **Haï** à **Exalté**.
- Quand une horloge sonne ou qu'une réputation change, le chat te le dit.
- **Enquêtes** : les indices que vous avez trouvés et les conclusions que vous avez comprises. **Contacts** : les gens que vous connaissez, ce qu'ils pensent de vous, ce que vous leur devez (ou eux à vous).` },
  { titre: "Les Veillées de Brumecombe", texte: `
- Ton **rôle** t'est donné en secret au début ; garde-le pour toi.
- La **nuit**, si ton rôle agit, une fenêtre s'ouvre chez toi seul : choisis, ou passe.
- Le **jour**, débattez, puis **votez** dans la fenêtre de vote ou la Table de jeu. Les voix restent cachées jusqu'à la fin du vote.
- Les **morts** se taisent et ne votent plus.
- Le guide du joueur de Brumecombe (journal du monde) décrit tous les rôles, métiers et bâtiments ; sur la carte, clique l'épingle d'un bâtiment pour lire sa règle.
- Quand c'est à toi (choix de nuit, vote), un **tintement** discret sonne chez toi seul et l'onglet clignote si tu regardes ailleurs (réglage « Signal quand c'est à moi »).
- À la fin, les **Chroniques de Brumecombe** racontent la partie et tiennent le palmarès.` }
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
