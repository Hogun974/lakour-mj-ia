# Journal des versions — module `lakour-mj-ia`

Versions du moteur MJ IA de La Kour (les modules de contenu des mondes tiennent chacun leur journal). Les numéros
suivent `module.json` ; chaque release GitHub `v<version>` reprend la section correspondante. Avant la 0.26, le moteur
vivait dans un dépôt commun aux mondes, dont l'historique n'est pas repris ici.

## 0.42.0 — 2026-11-05

- Fêtes lunaires calculées pour toute année (phases de la lune de Meeus, zodiaque sidéral de Lahiri) : la Dipavali, la
  Cavadee et le Nouvel An chinois tombent après 2036, où s'arrêtait la table (`dateLunaire`, qui redonne les 33 relevés de
  2026 – 2036 et le Nouvel An chinois jusqu'en 2050) ; `api.fetes.sourceDeDate(fn)` : un monde à calendrier (Fénoir) donne
  sa date de jeu, branchée au crochet `pret` — sans elle, un monde de Fénoir au 4 décembre 2026 recevait au chargement la
  carte de la Dipavali de la date réelle (5 novembre) avant que le système ait forcé la fête du jour de jeu (`docs/fetes.md`).

## 0.41.0 — 2026-11-05

- Monde anglais : les répliques des compagnons IA en mode simple (sans modèle), leurs déclarations de combat et le mot confié au
  Messager suivent la langue du monde (`vue.langue`, tables fr/en de `compagnons.js`, même tirage dans les deux langues), en
  tournures neutres qui n'accordent rien au genre de la personne citée (« …mais on n'a presque pas entendu Jacquette Vignal ce
  matin. »). Aussi traduits : le journal d'histoire d'un personnage (dossier, titre, pages, questions d'aide ; titres fr et en
  reconnus), les erreurs Anthropic/OpenAI montrées au MJ, les libellés des modèles Claude (configuration, console) et l'avis de
  migration des réglages (`essais/langue-du-monde.test.mjs`).
- Monde anglais, Veillées : les déclencheurs des compagnons IA sont reconnus en anglais comme en français (casse ignorée,
  apostrophe droite ou courbe) — accusation (« I accuse X », « I'm accusing X », « I am accusing X »), cri de la peste noire
  (« It's the black plague! », « It is the Black Death »), déclaration au Registre (« For the Register: », « On the Register: »,
  « On the record: » ; pas « For the record »), silence « (nothing) ». Les consignes du modèle annoncent les formules dans la langue
  du monde (`formulesReplique`, `consigneParlerLoups`), et le narrateur sait qu'un joueur peut crier la peste en anglais.
- Fenêtre « Action du MJ IA » (Validation) lisible : arguments résumés (« 4 éléments (Salle commune, Cuisine, …) », clés
  d'un objet, champs vides omis) au lieu du JSON brut, libellés traduits, tout échappé (`essais/validation-resume.test.mjs`).
  Histoire des personnages : titres neutres « Portrait », « Son histoire », « Ses secrets », « Chapitres » (questions d'aide
  et consignes aussi) ; les journaux existants (« Qui il est », « Ce qu'il garde pour lui ») restent reconnus, sans renommage.
- Sécurité : aux Veillées, plus aucune part de la clé du coffre chez les joueurs (clé renouvelée une fois si des joueurs en
  gardaient, en vigueur par la clé de secours) ; boutons, drapeaux et classes du MJ IA honorés seulement sur un message
  d'un MJ (raison des dés échappée) ; parole des joueurs encadrée comme une donnée pour le narrateur ; canal du module
  sans émetteur refusé ; rythme par joueur des réponses automatiques (réglage) ; section sécurité des README.
- Horloges : `api.horloges.libelles(table)` pour les modules de contenu (nom français -> clé i18n) : jauges, seuils et
  factions traduits dans le Carnet et les cartes du chat ; l'IA et les données restent en français.

## 0.40.1 — 2026-11-05

- Guide d'utilisation en anglais (`scripts/guide-en.js`, `docs/guide-utilisation.en.md`), installé selon la langue du
  monde ; libellé « Listen to players' speech ».
- Fénoir : création de survivant par l'API du système, véhicules du contenu acceptés en voyage (clé ou nom), l'artisan
  compte parmi les bras ; un compagnon ajouté rejoint le groupe par défaut.
- Coffre : la clé de secours note la même heure que son fichier ; à heure égale, la part reçue par un joueur n'est
  jamais celle qu'il écarte.
- Outils (fabricants, guide, sons) utilisables sous Linux ; release à blanc rejouée en Node 24.
- Essais rendus déterministes (aucun délai fixe dans les essais du coffre).

## 0.40.0 — 2026-11-04

- Fénoir (système `lakour-survie`) branché : adaptateur, outils `survie_*`, état du jeu en deux blocs (connu des
  joueurs / secret du MJ), création de survivant guidée, recrues et tâches ; voir `docs/survie.md`.
- Histoire de chaque personnage (40k, Warcraft, Fénoir) : un journal en quatre pages par personnage et par compagnon,
  outil `histoire_personnage`, bouton **Histoire** sur la fiche, sans IA aussi.
- Personnalité « La Gramoune » : une narratrice de survie pour Fénoir.
- Calendrier des fêtes : Dipavali, Cavadee, Nouvel An chinois, fête des letchis et 20 décembre (La Réunion).
- Outil commun `outils/empaqueter-monde.mjs` : un monde vierge publiable à partir d'une copie du monde joué, sans
  utilisateur, message, personnage de joueur, coffre ni clé (`docs/empaqueter-monde.md`).
- Publication : README français et anglais, manifeste complété (titre « MJ IA (Anthropic / OpenAI) », adresses de
  diffusion), `THIRD-PARTY-NOTICES.md` (licences des SDK embarqués), `outils/empaqueter-module.mjs`, workflow de
  release GitHub, `docs/publication.md` ; scripts d'infrastructure privée et plans internes sortis du dépôt.
- Contenu bilingue : outil `outils/traduction.mjs`, variantes anglaises `<module>-en` des modules de contenu reconnues partout
  (packs, drapeaux, assets), voir `docs/traduction.md`.
- Guide d'utilisation en anglais (`scripts/guide-en.js`, `docs/guide-utilisation.en.md`) : installé dans les mondes dont le
  module de contenu est la variante `-en` (sans module de contenu : selon la langue de l'interface) ; un guide déjà installé
  est réécrit et renommé quand la langue du monde change (version 17 du guide).

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
