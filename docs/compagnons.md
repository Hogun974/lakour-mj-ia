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
- En combat, à leur tour (suivi des combats), ils déclarent leur action ; le MJ IA la résout.
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
