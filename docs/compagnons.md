# Compagnons IA — des personnages joués par l'IA comme des joueurs

Demande de Jordan (01/11/2026) : des personnages côté joueurs, joués par l'IA comme si c'étaient des joueurs, pour combler
une table (surtout aux Veillées de Brumecombe, mais aussi en 40k et en Warcraft). Règle de parité : un seul mécanisme, dans
le MJ IA, servant aux trois mondes.

## Principe : un compagnon ne triche pas

Le MJ IA (le narrateur) connaît tous les secrets. Un compagnon ne doit savoir que ce qu'un joueur à sa place saurait. Chaque
compagnon a donc **son propre cerveau** : un appel au modèle séparé de celui du MJ, avec un contexte restreint.
- **Sa fiche** : en 40k et en Warcraft, son personnage (résumé de l'adaptateur) ; aux Veillées, son rôle et son métier.
- **Ce qu'on lui a dit en privé** : messages chuchotés du narrateur, résultats de nuit de son rôle, choix secrets.
- **Le chat public récent** (ce que tous voient), et ce que son personnage voit de la scène (lieu, présents).
- **Sa personnalité** : un tempérament (prudent, bavard, soupçonneux, farceur, loyal…), une façon de parler.

Jamais le prompt du MJ, la mémoire de campagne secrète, les rôles des autres ou l'état secret de la partie.

## Ce qu'un compagnon fait

- **Parler** : une courte réplique en personnage dans le chat, sous son nom (comme un joueur). Le moteur du MJ IA la reçoit
  ensuite comme un message de joueur. Le rythme est limité : au plus une réplique par compagnon et par tour de parole, et
  jamais deux compagnons qui se répondent en boucle sans humain.
- **Décider** : répondre à une demande (choix de nuit, vote, choix secret, vote de groupe) en JSON strict, validé ; une
  réponse invalide vaut « passer ».
- **Agir en combat** (40k, Warcraft) : à son tour, déclarer son action ; le MJ IA la résout avec les vrais jets du système
  (le compagnon n'a pas de joueur : ses jets sont lancés directement).

## Aux Veillées de Brumecombe

- `loups_distribuer` accepte `compagnons: n` : n places sont tenues par des compagnons (villageois sans joueur, marqués
  `compagnon`), avec des noms tirés de la table des noms de villageois et une personnalité au hasard.
- La nuit, une demande d'action pour un compagnon ne passe pas par le socket : le système appelle un résolveur fourni par le
  MJ IA (`game.lakourLoups.resolveurs.compagnon`), qui interroge le cerveau du compagnon.
- Le jour, après le récit de l'aube et pendant le débat, chaque compagnon vivant peut parler (accuser, se défendre, mentir
  s'il est loup, partager une information de son rôle s'il le juge utile).
- Pendant un vote, chaque compagnon vivant vote par son cerveau.
- Sans clé ou budget épuisé : un compagnon joue en mode simple (heuristique sans IA), pour ne jamais bloquer la partie.

## En 40k et en Warcraft

- Outil `compagnon_ajouter` : crée un personnage complet (mêmes outils de création que pour un joueur, sans joueur
  assigné), marque l'acteur `compagnon` avec sa personnalité, pose son jeton près du groupe.
- Après chaque narration, les compagnons présents peuvent réagir (une réplique, une proposition, une action déclarée).
- En combat, à leur tour (suivi des combats), ils déclarent leur action ; le MJ IA la résout. Sans séance du MJ IA (MJ humain),
  ils agissent seuls : annonce par leur cerveau, action jouée par le système d'après la proposition sans IA du tour par tour,
  puis le tour passe (docs/tour-par-tour.md).
- Outil `compagnon_retirer` ; un compagnon peut aussi devenir un simple PNJ.

## Réglages et coût

- Modèle des compagnons : par défaut un modèle bon marché (Claude Haiku 5.5 ou le plus petit modèle OpenAI configuré),
  réglable. Leurs appels comptent dans le coût et le budget de la séance.
- Nombre maximal de répliques de compagnons par tour, et bavardage (discret, normal, bavard).

## Secrets des compagnons

Ce qu'un compagnon sait en privé ne doit pas fuiter vers les joueurs humains : il est gardé du côté du MJ actif, comme les
autres secrets du jeu (voir `docs/loups-contrat.md`, section sur les secrets).

## Mise en œuvre (MJ IA 0.26.0, système lakour-loups 0.2.1)

- `modules/lakour-mj-ia/scripts/compagnons.js` : logique pure (personnalités, contexte d'un compagnon construit à partir de sa
  seule « vue », validation JSON stricte des décisions, repli déterministe sans IA, rythme de parole).
- `modules/lakour-mj-ia/scripts/compagnons-jeu.js` : ce que sait un compagnon (vue des Veillées sur l'état PUBLIC et son carnet ;
  vue d'aventure sur sa fiche, les jetons visibles et le chat public), mémoire privée dans un réglage « client » du MJ actif,
  répliques au chat, résolveur des Veillées, tour de combat, votes et choix secrets.
- Appels : un appel court par réplique ou par décision (`envoyerCourt` des fournisseurs : sans outils, sans historique, effort
  « low »), au modèle « modeleCompagnons » (vide = Claude Haiku 5.5 / le moins cher d'OpenAI), comptés par `MoteurMJ.compter`.
- Rythme : après une réponse du MJ déclenchée par autre chose que des répliques de compagnons, au plus `bavardageCompagnons`
  répliques (0 à 3), une par compagnon ; pas de bavardage en plein combat (ils agissent à leur tour).
- Outils : `compagnon_ajouter`, `compagnon_retirer`, `compagnons`, `jet_compagnon` ; `loups_distribuer` avec `compagnons` ;
  `vote_groupe`, `choix_secret` et `message_prive` acceptent un compagnon ; `demander_jet` sur un compagnon lance directement.
- Essais : `essais/compagnons*.test.mjs` de ce dépôt ; dans le dépôt lakour-veillees, `essais/compagnons-veillees.test.mjs` et les parties avec compagnons d'`essais/integration-loups.test.mjs`.

## Répliques en style théâtre (MJ IA 0.27.0)

Un compagnon dit lui-même ses gestes : sa réplique peut commencer par UNE didascalie brève, en italique, à la troisième
personne, puis sa parole : « *Valentin regarde Clémence, les bras croisés.* — Moi, je l'ai vue sortir hier soir. »
- La didascalie n'est qu'un geste, un regard, une attitude : jamais une action de jeu (on vote, on agit la nuit et on use d'un
  pouvoir par les fenêtres du jeu ; en 40k et en Warcraft, une action qui compte se dit dans la parole et le MJ la résout), et
  aucun secret.
- `nettoyerReplique` garde au plus une didascalie, en tête (`*…*`, `**…**`, `_…_` ou `(…)`), bornée à `DIDASCALIE_MAX`
  (140 caractères), et la parole à `PAROLE_MAX` (400) ; les autres didascalies disparaissent. Le chat l'affiche en italique
  (classe `lakour-mjia-didascalie`) ; le MJ IA lit la réplique telle quelle (drapeau `texte`).
- Le narrateur ne raconte plus ces gestes ni ces répliques. Aux Veillées, il s'en tient à la nuit, à l'aube et aux morts, à
  l'animation du débat (tours de parole, temps, relances) et aux résultats. En 40k et en Warcraft, il décrit le monde et les
  conséquences, pas le geste qu'un compagnon vient de décrire.

## Pilote automatique : quand il ne reste que des IA (MJ IA 0.27.0)

Demande de Jordan : « quand il ne reste que des IA, il faut que les actions continuent (si en mode autonome) ». Le moteur ne
réagit qu'aux messages des joueurs et refuse de relancer les compagnons sur leurs seules répliques (pas de boucle) : sans humain,
la partie se bloquait. `scripts/pilote.js` (`PiloteAutomatique`, un par `MoteurMJ`, `moteur.pilote`).

**Démarrage** (vérifié après chaque tour du MJ, à chaque phase, mort, victoire, connexion, jeton posé ou retiré, combat, et au
changement des réglages) : séance active, autonomie « autonome », réglage `pilote` coché, et
- aux Veillées : partie en cours (phase ni « preparation » ni « fin ») et AUCUN vivant tenu par un humain (des humains morts
  peuvent regarder ; un villageois sans compagnon compte comme humain, même déconnecté) ;
- en 40k et en Warcraft : aucun personnage d'un joueur connecté présent (jeton visible sur la scène active ; sans scène, le
  personnage assigné) et au moins un compagnon présent.
En mode Validation : pas de pilote, un seul avis au MJ humain (« passe en autonome ou mène la suite »).

**Étapes aux Veillées**, une à la fois, chacune une consigne au MJ IA qui raconte et appelle lui-même ses outils `loups_*` :
nuit (`loups_nuit`, puis « — ») → aube (récit ; le pilote passe ensuite la phase à « jour ») → débat (au plus `DEBAT_TOURS` = 2
tours de parole : le pilote appelle lui-même `compagnons.debattre`, leurs répliques entrent dans la file du MJ qui y répond une
fois ; c'est l'exception voulue à la règle anti-boucle, seulement en pilote et seulement au débat ; `peuventReagir` reste
inchangé ailleurs ; aucun débat si le bavardage est « silencieux ») → vote (ouvrir ; les compagnons votent par le résolveur) →
dépouillement (clore) → exécution (`loups_eliminer`) → victoire vérifiée (`api.verifierVictoire`) → nuit suivante. À la
victoire : une étape « dénouement », puis arrêt. Le pilote ne relance jamais une autre partie (`loups_rejouer`).

**Rythme** : `piloteDelai` secondes (4 par défaut) entre deux étapes, après la fin de la voix du narrateur (file de lecture
OpenAI, voix du navigateur du MJ ; deux minutes au plus) et une fois le moteur au repos (`moteur.auRepos()` : aucun tour en cours
ni en attente, aucun lot de messages en traitement, réactions des compagnons comprises).

**Garde-fous** : arrêt net (l'étape en cours finit, aucune autre ne commence) à la victoire, à la fin de la séance, au retour d'un
humain vivant, en mode Validation, réglage coupé ; arrêt avec avis et pause (il ne repart pas seul) au budget atteint, après
`piloteEtapes` étapes (60 par défaut), quand la même étape revient trois fois sur le même état (« la partie n'avance plus »), sur
une erreur, ou par le MJ humain (bouton **Arrêter le pilote** de la console ; **Relancer le pilote** ensuite).

**En 40k et en Warcraft (choix retenu)** : on se limite à ce qui reste sûr.
- Les combats se poursuivent tour après tour, comme avant (`reactions.js` : tour d'un PNJ → le MJ le joue ; tour d'un compagnon
  → il déclare, le MJ résout). Le pilote compte chaque tour de combat comme une étape (le plafond borne donc aussi les combats),
  et relance un combat arrêté depuis 30 s (moteur au repos) : le compagnon redéclare son action, ou le MJ joue le PNJ ou fait
  passer le tour d'un personnage de joueur absent. En pause (plafond, MJ…), alors qu'il ne reste que des compagnons, le combat
  est retenu : les tours ne se jouent plus d'eux-mêmes jusqu'à ce qu'un humain revienne ou que le MJ relance le pilote.
- Hors combat, au plus `ECHANGES_MAX` = 6 échanges : le MJ fait avancer la scène d'un pas, puis les compagnons réagissent (le MJ
  leur répond par sa file) ; ensuite pause et avis au MJ humain. Pas d'aventure qui tourne seule sans fin.

**Coût d'un tour de pilote** (un jour de jeu aux Veillées) : 7 tours du MJ IA (nuit, aube, deux réponses au débat, vote,
dépouillement, exécution ; un de plus pour le dénouement), soit 10 à 12 appels au modèle (un tour avec outil en fait deux), sans
mise en place du plateau ; mesuré par `essais/pilote-automatique.test.mjs` des Veillées (≈ 10,5 appels au narrateur et ≈ 10 aux
compagnons par jour, 6 compagnons) ; côté compagnons, un appel court par
choix de nuit, 2 à 4 répliques (2 tours × bavardage) et un vote par compagnon vivant. En 40k et en Warcraft : 2 appels au MJ par
échange (scène, réponse) plus une réplique par compagnon ; en combat, ce que coûtait déjà chaque tour.

## Chaque partie des Veillées repart de zéro (MJ IA 0.27.0)

À une nouvelle partie (`loups_distribuer`, `loups_rejouer`, hook `lakourLoups.nouvellePartie` de la Table), `moteur.nouvellePartie`
archive le fil de la précédente sous un autre nom (`Data/lakour-mj-ia/fils/<monde>-partie-<date>.json`, jamais supprimé) et
commence un fil neuf, avec un prompt système recalculé (les nouveaux rôles) et la distribution secrète en tête. L'ouverture dit
« nouvelle partie : présente le village, annonce la composition sans dire qui, lance la première nuit » ; au démarrage d'une
séance hors partie en cours, idem (fil neuf) ; en pleine partie, une phrase sur l'état du village. La mémoire de campagne n'entre
pas dans le prompt aux Veillées (l'historique des compositions `historiqueLoups` reste, pour varier). Les compagnons oublient la
partie précédente (`effacerPrive`). Outil `loups_rejouer` (mêmes joueurs, même nombre de compagnons, nouvelle composition
équilibrée sauf rôles ou composition donnés) ; le narrateur le propose en fin de partie.

## Sans narrateur IA : un MJ humain et des joueurs IA (MJ IA 0.27.0)

`scripts/compagnons-veillees.js` (`CompagnonsSansNarrateur`) : au « ready », chez le MJ actif, `game.lakourLoups.compagnons =
{ disponible: true, creer(n), retirer(acteurId) }` (le système appelle le hook `lakourLoups.compagnons`) ; le bouton « + Joueur IA »
de la Table appelle `creer`. Le résolveur des compagnons est branché séance ou non : nuits et votes marchent avec un MJ humain.
Hors séance, quand la phase passe à « jour », les compagnons vivants parlent (au plus le bavardage) ; ils répondent aux messages
publics des humains (regroupés), jamais aux leurs. Coût : compteur « compagnons hors séance » (réglage `compagnonsHorsSeance`,
affiché dans la console), borné par `budgetSeance`, remis à zéro à chaque distribution ; sans clé ou budget atteint, repli.
`scripts/ecoute.js` : `ecouteActive({ seanceIA, compagnonsVivants, moduleActif })`, la règle de `docs/voix-et-ecoute.md` §2
(écouter la parole seulement si une séance est lancée ou si un compagnon vivant est à la table).

Essais : `essais/pilote.test.mjs`, `essais/nouvelle-partie.test.mjs`, `essais/didascalies.test.mjs`, `essais/sans-narrateur.test.mjs`
de ce dépôt ; dans lakour-veillees, `essais/pilote-automatique.test.mjs` et `essais/compagnons-sans-narrateur.test.mjs`.
