# Journal des versions — module `lakour-mj-ia`

Versions du moteur MJ IA de La Kour (les modules de contenu des mondes tiennent chacun leur journal). Les numéros
suivent `module.json` ; chaque release GitHub `v<version>` reprend la section correspondante. Avant la 0.26, le moteur
vivait dans un dépôt commun aux mondes, dont l'historique n'est pas repris ici.

## Non publié

- Fénoir (système `lakour-survie`) branché : adaptateur, outils `survie_*`, état du jeu en deux blocs (connu des
  joueurs / secret du MJ), création de survivant guidée, recrues et tâches ; voir `docs/survie.md`.
- Histoire de chaque personnage (40k, Warcraft, Fénoir) : un journal en quatre pages par personnage et par compagnon,
  outil `histoire_personnage`, bouton **Histoire** sur la fiche, sans IA aussi.
- Calendrier des fêtes : Dipavali, Cavadee, Nouvel An chinois, fête des letchis et 20 décembre (La Réunion).
- Outil commun `outils/empaqueter-monde.mjs` : un monde vierge publiable à partir d'une copie du monde joué, sans
  utilisateur, message, personnage de joueur, coffre ni clé (`docs/empaqueter-monde.md`).
- Publication : README français et anglais, manifeste complété (titre « MJ IA (Anthropic / OpenAI) », adresses de
  diffusion), `THIRD-PARTY-NOTICES.md` (licences des SDK embarqués), `outils/empaqueter-module.mjs`, workflow de
  release GitHub, `docs/publication.md` ; scripts d'infrastructure privée et plans internes sortis du dépôt.

## 0.39.0 — 2026-11-03

- Compagnons de la Petite tablée (Veillées) : ils s'adressent aux humains plutôt qu'entre eux ; votes et nuits inchangés.
- « Sauvés cette nuit » dédoublonné.

## 0.38.1 — 2026-11-03

- Réimporter une clé de secours plus ancienne ne fait plus reculer la date « téléchargée le ».
- La fenêtre du coffre ne dit « jamais téléchargée » que si la clé en vigueur est vraiment dans ce navigateur.

## 0.38.0 — 2026-11-03

- Rappel de la clé de secours : à la création ou au renouvellement d'une clé, fenêtre « Télécharge ta clé de secours
  maintenant » ; « Plus tard » laisse une notification à chaque chargement tant que ce n'est pas fait. Dates mémorisées
  dans le navigateur du MJ, jamais dans le monde ; une clé réimportée compte comme exportée.

## 0.37.1 — 2026-11-03

- Bouton « Repartir d'une clé neuve » dans la fenêtre du coffre, quand la clé n'est plus dans aucun navigateur.

## 0.37.0 — 2026-11-03

- Aux Veillées, la ligne du narrateur suit la veillée de fête choisie à la distribution, même hors saison.

## 0.36.1 — 2026-11-03

- Aux Veillées, la ligne de fête n'affirme plus que rien ne change : une veillée de fête ajoute des règles, la date seule non.

## 0.36.0 — 2026-11-03

- Socle des fêtes de saison : calendrier (Nouvel An, Saint-Valentin, Carnaval, Pâques, Fête de la musique, Halloween,
  Noël, dates mobiles comprises), réglage automatique / aucune / forcée, décor léger coupable par joueur, registre des
  déclinaisons par monde (`api.fetes`), carte quotidienne, ligne discrète au narrateur, crochet `lakour-mj-ia.fete`.
  Contrat des mondes : `docs/fetes.md`.

## 0.35.0 — 2026-11-03

- Les secrets des Veillées sortent des documents : le système les scelle avec le coffre du moteur ; rôles et camps lus
  par l'API du système.
- Transcription relayée par socket aux Veillées, chuchotée ailleurs ; coûts d'IA regroupés pendant une partie.
- Aux Veillées, mémoire, journaux et chronique refusés pendant une partie ; narrateur, pilote et compagnons en pause tant
  que les secrets ne sont pas disponibles.

## 0.34.0 — 2026-11-03

- Coffre chiffré : les éléments cachés du Carnet (horloges, jauges, réputations, enquêtes, contacts) sont rangés dans un
  coffre AES-GCM ; seule la part visible des joueurs reste en clair.
- Clé partagée entre les joueurs (Shamir, seuil à la majorité), renouvellement avec accusés, passage de clé entre MJ,
  clé de secours exportable (fenêtre « Coffre du MJ IA »).
- Fil de l'IA et archives chiffrés dans `Data/` ; anciens fils migrés.
- Voix privées envoyées par socket aux seuls destinataires, plus jamais déposées dans `Data/`.

## 0.32.0 — 2026-11-02

- Veillées 0.8.0 : gens de passage, Banc des accusés, Glas du deuil, Nuit de la Saint-Martin, côté narrateur et compagnons.
  (Le numéro 0.33 n'a pas été publié.)

## 0.31.0 — 2026-11-02

- Veillées 0.7.0 : présages, Dernier souffle, Somnambule, Rosière, Saints du calendrier ; historique des compositions
  publié à la fin de la partie.

## 0.30.0 — 2026-11-02

- Carnet de campagne (40k, Warcraft) : enquêtes en trois indices et contacts avec leurs dettes, outils `enquete` et
  `contact`, fenêtre à onglets, API `enquetes` et `contacts`.
- Un outil absent de la liste offerte au modèle est refusé ; recherche de noms tolérante aux œ/æ.

## 0.29.0 — 2026-11-02

- Horloges, jauges et réputations : outil `horloge`, fenêtre Horloges, API `horloges`, crochet `lakour-mj-ia.pret`.
- 40k : outil `superiorite`, case pré-cochée dans `demander_jet`.
- Tirages sûrs dans les tables (`lancer_table`) : recherche exacte puis par préfixe, ambiguïté rendue à l'IA, sans
  doublon, exclusions.
- D&D 5e : rappels d'actions légendaires et de repaire. Veillées : Bailli, Registre et Masques connus du narrateur, des
  compagnons et du pilote.

## 0.28.0 — 2026-11-01

- Voix en direct : la voix OpenAI (API Realtime) est diffusée aux joueurs morceau par morceau dès sa production ;
  chaque compagnon a sa voix ; aux Veillées, seuls ceux qui peuvent entendre entendent.
- Écoute des joueurs : la parole captée par la voix intégrée de Foundry est transcrite, chez le MJ actif, seulement quand
  une IA doit entendre ; pastille « L'IA écoute » chez chacun ; coût compté.
- Tour par tour (40k, Warcraft) : panneau du MJ (étape suivante en pointillés, initiative, actions restantes, vrais jets,
  cibles et portées, propositions des PNJ sans IA), bandeau des joueurs, tour de table hors combat ; outils `combat_etat`
  et `tour_de_table`.
- Scènes vivantes : sons d'ambiance, zones et épingles natifs de Foundry v14 dans les cartes créées ; la scène se modifie
  en jouant (`zone_scene`, `epingle`, `lieux_scene`) ; cartes à étages ; aide de jeu montrée aux joueurs (`montrer_aide`).
- Animations, météo, calendrier et butin avec les modules installés (Sequencer + JB2A, FXMaster, Calendaria, Item Piles),
  seulement s'ils sont actifs.
- Appel « à toi » (tintement discret et onglet qui clignote) pour un tour de combat, une parole, un vote ou un choix secret.
- Console : la voix de la table vérifiée et réparée d'un clic. Abrégé vocal : la voix lit l'essentiel, le chat garde tout.
- Création 40k rangée comme l'assistant du système (armure portée, arme en main, munitions reliées).

## 0.27.0 — 2026-11-01

- Pilote automatique : quand il ne reste que des IA en mode autonome, la partie continue seule, avec garde-fous
  (victoire, budget, plafond d'étapes, blocage, bouton d'arrêt).
- Nouvelle partie aux Veillées : fil archivé, mémoire des compagnons remise à zéro ; outil `loups_rejouer`.
- Compagnons en style théâtre (didascalie brève) ; le narrateur ne raconte plus leurs gestes.
- Joueurs IA pour un MJ humain qui mène les Veillées sans narrateur IA, coût compté à part.

## 0.26 et avant — jusqu'au 2026-11-01

- 0.26.1 : ambiance sonore moins forte (0,3 par défaut), baissée pendant que le narrateur parle.
- 0.26.0 et avant : naissance du moteur dans le dépôt commun des mondes, puis extraction dans ce dépôt le 1er novembre
  2026 avec l'outillage partagé (validateur Foundry, contrat des modules de contenu, aides de dessin des jetons, SDK
  embarqués, sons synthétisés, guide). Au départ : narration dans le chat avec Claude ou ChatGPT, personnalités, jets
  demandés aux joueurs, PNJ, mémoire de campagne, scénarios, cartes générées, votes et choix secrets, voix, images,
  compagnons IA (0.26.0), mode validation et budget par séance, fournisseur factice.
