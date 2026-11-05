# Fénoir — comment le MJ IA mène la survie (système `lakour-survie`)

Fénoir : La Réunion, au jour zéro d'un mal inconnu (le Gris) qui relève les morts en Livides. Le système `lakour-survie` tient les
règles, l'horloge du monde et la simulation ; le module `lakour-fenoir` le contenu (régions, sites, installations, passés,
factions, tables) ; le MJ IA raconte et agit **par l'API du système** (`game.lakourSurvie`). La source de vérité des échanges est
le contrat `docs/survie-contrat.md` du dépôt `lakour-fenoir` (§5 l'API, §7 le MJ IA, §9 ce que Fénoir reprend des autres mondes).

## Le secret : connu et réel

Le système garde deux états :
- **public** (`api.etat()`, réglage `lakour-survie.partie`) : le moment, le groupe, l'abri, les **renseignements** (ce que le
  groupe croit de chaque région, **daté** : vu, radio ou rumeur), les alertes, la chronique ;
- **réel** (`api.monde()`, scellé dans le coffre du moteur) : infestation, pillage restant, factions, routes, hordes, cyclone,
  éruption, journal secret. Seul le MJ actif, coffre ouvert, le lit.

Le MJ IA voit les deux ; **tout texte qu'il reçoit les sépare** : « [connu des joueurs] » puis « [secret MJ] » (état du jeu à
chaque tour, réponses des outils). Ses consignes : ne jamais dire le réel que les joueurs n'ont pas vu, ne pas le laisser deviner ;
un lieu d'arrivée a changé depuis la dernière fois, c'est voulu.

Les **compagnons IA** (génériques : drapeau `flags.lakour-mj-ia.compagnon`, comme en 40k et en Warcraft) ne reçoivent que l'état
public : leur fiche (résumé de l'adaptateur, tiré de l'acteur, public) et une vue de la survie (`vuePubliqueSurvie` : moment,
abri, réserves, état du groupe, alertes, renseignement de leur région). `api.monde()` n'y est jamais appelé (essai de non-fuite).

## Ce que fait le MJ IA

- **Le temps** : chaque action coûte des quarts (6 h). Les outils qui le comptent (explorer, fouiller, construire, voyager,
  fabriquer) le font avancer ; sinon `survie_avancer` (garde, repos, attente). Le monde avance avec : il raconte les faits publics.
- **Les tests** : seulement quand l'enjeu le justifie. `demander_jet` pour un joueur (carte au chat, le test du système se lance au
  clic), `survie_test` ou `jet_compagnon` pour un PNJ ou un compagnon. Difficultés communes converties (§7) : facile = normale +1
  dé ; routinière, exigeante = normale ; difficile ; ardue, très ardue = extrême ; très facile = normale +2 dés (hors contrat).
  Avantages +1 dé chacun, désavantages −1 dé, modificateur en dés de situation (±2 au plus).
- **Morsure** : test de soins extrême immédiat ; échec : `survie_blessure infecter`.
- **Combats** sans tour par tour (règles simples du §1.7) ; un assaut contre l'abri : `survie_assaut`.
- **Deux voies** : repartir (`survie_demenager` ; les plans font reconstruire plus vite) ou s'enraciner (installations, autonomie).
- **Factions** : horloges `rep-<faction>` (outil `horloge`), contacts et enquêtes au Carnet, appels radio tirés avec
  `lancer_table` (les données `flags.lakour-fenoir.appel` : type, récompense, réputation, sont lues comme les contrats de Warcraft).
- **Paliers de visibilité** : au crochet `lakourSurvie.palier` ({ palier, table }), le narrateur reçoit la table du palier, la lit
  et la tire en secret (`lancer_des` secret), puis pose la suite sans l'annoncer comme un tirage.
- **Temps avancé par le MJ humain** : au crochet `lakourSurvie.avance` (quand, faits publics), le narrateur reçoit les faits
  publics (sauf pendant son propre tour).
- **Fêtes** : la ligne du narrateur dit ce que la fête du calendrier des joueurs devient dans le monde d'après, sans règle
  cachée ; `survie_feter` si les joueurs la fêtent au camp. Calendrier du moteur : 20 décembre (fête de la liberté), fête des
  letchis (mi-décembre), Dipavali, Cavadee et Nouvel An chinois (dates lunaires calculées), 14 juillet ; la Toussaint se décline
  avec Halloween (même fenêtre, cœur du 31 octobre au 1er novembre ; `docs/fetes.md`).
- **Création guidée** (`CREATION_GUIDEE`, §10.2) : `creer_survivant` « tirer » fait tirer au générateur du système deux ou trois
  survivants (enfance, passé, compétences, passions, traits, incapacités, graine d'histoire ; verrous pour relancer en gardant ce
  que le joueur aime ; un tirage hors du budget 10 – 16 est relancé, cinq fois au plus), résumés au joueur ; « creer » fait créer
  la fiche du tirage choisi (ajustements compris) **par le système** : `creerSurvivant({ donnees, userId, rejoindre, statut })`
  (le MJ IA est le MJ actif, l'appel est direct) pose le jeton du passé (`modules/lakour-fenoir/assets/jetons/joueurs/<passé>.svg`),
  le genre, la graine (`flags.lakour-survie.graine` ; le MJ IA ajoute `flags.lakour-mj-ia.graineHistoire` si le système ne l'a pas
  mis), les savoirs et l'équipement par clé, la propriété du joueur nommé (`joueur` ; vide = personne), et l'entrée au groupe
  (`rejoindre`, partie démarrée) avec le `statut` (joueur, compagnon, recrue, pnj). Sans tirage, même chemin d'après un passé du
  compendium. La fiche devient le personnage du joueur, sauf s'il en joue déjà un autre, vivant (il le garde ; le texte le dit).
  Repli à la main (`Actor.create`, même jeton et mêmes drapeaux, `ajouterMembre` pour le groupe) seulement pour compléter une
  fiche existante ou si le système n'a pas `creerSurvivant`. Puis son histoire (`histoire_personnage`, commun aux trois mondes de
  jeu de rôle). `compagnon_ajouter` passe par `creer_survivant` (statut compagnon).
- **Véhicules et montures** : `survie_voyager` et `survie_demenager` prennent `pied`, `vehicule`, `bateau` (génériques) ou la clé
  ou le nom d'un équipement du contenu qui transporte (`contenu().equipements` à `terrains` : scooter, voiture, 4×4, camion,
  vélo, vélo-cargo, kayak, barque à moteur, âne, cheval ; « 4x4 » trouve le 4×4). L'outil passe la **clé** à l'API, qui en tire durée,
  terrains, charge, carburant par quart et bruit. Le texte rendu (connu) dit le carburant consommé (rendu par `voyager` ; calculé
  `ceil(quarts × carburantParQuart)` pour `demenager`, qui ne le rend pas) et le bruit (+10 % de rencontres par point ; génériques :
  0 à pied, 2 sinon). Le système ne vérifie pas que le groupe a le véhicule : une ligne au secret dit qui le porte, ou que personne.
- **Atelier** : `survie_fabriquer` passe à `fabriquer` `membres` = l'artisan ET ses aides : l'API compte `bras = membres.length || 1`
  (travail en quarts-personne ÷ bras).
- **Le groupe** (§10.2, §10.3) : les manques (`survie_besoins`, et une ligne dans l'état du jeu), les recrues qui les comblent avec
  un prix (`survie_recrue` generer, au secret ; recruter, test de parole), la tâche du jour des compagnons et des recrues
  (`survie_assigner`, ou répartition automatique : urgences d'abord, le plus compétent, jamais une tâche dont il est incapable ;
  les joueurs choisissent la leur), un compagnon arrivé en cours de partie (`survie_ajouter_membre`).
- **Pilote automatique** : le chemin « aventure » du pilote vaut à Fénoir (plus aucun joueur présent, des compagnons) ; sa
  consigne de scène ajoute que le temps passe par les outils `survie_*`.
- **Remise à zéro** d'un monde : réglages `lakour-survie.partie`, `coffre`, `mondeClair` et `monde` (client) à leur défaut,
  acteurs non gardés effacés (les survivants sont proposés à la conservation), contenu `lakour-fenoir` réinstallé.

## Outils (`scripts/outils-survie.js`, `systemes: ["lakour-survie"]`)

| Outil | Quand | API |
|---|---|---|
| `survie_etat` | état en deux blocs ; une région de près (routes, sites, réel) | `etat`, `quand`, `bilan`, `monde`, `contenu` |
| `survie_demarrer` | nouvelle partie au jour zéro | `demarrer` |
| `survie_avancer` | faire passer des quarts sans autre outil | `avancer` |
| `survie_test` | test direct (PNJ, compagnon, à la demande d'un joueur) | `test` |
| `survie_explorer` | aller voir une région (renseignement mis à jour) | `explorer` |
| `survie_fouiller` | fouiller un lieu (butin, bruit, rencontre) | `fouiller` |
| `survie_installer` | s'installer dans un site, reprendre un abri abandonné | `installer` |
| `survie_construire` | chantier d'une installation, ou réparation | `construire`, `reparer` |
| `survie_voyager` | aller dans une région voisine (à pied, véhicule générique ou du contenu) | `voyager`, `contenu` |
| `survie_demenager` | la voie « repartir » (idem) | `demenager`, `contenu` |
| `survie_ajuster` | troc, don, perte, fatigue, moral (variations) | `ajuster` |
| `survie_blessure` | blesser (morsure), soigner, infecter | `blesser`, `soigner`, `infecter` |
| `survie_marquer` | marque de progression après une scène marquante | `marquer` |
| `survie_assaut` | une menace attaque l'abri | `assaut` |
| `survie_rencontre` | tirer une rencontre selon le réel (au secret) | `rencontre` |
| `survie_renseigner` | ce que le groupe apprend sans y aller (radio, rumeur) | `renseigner` |
| `survie_bilan` | les comptes de l'abri | `bilan` |
| `survie_fabriquer` | l'atelier, d'après une recette | `fabriquer` (supposée, §9) |
| `survie_affliction` | donner ou soigner une maladie, une blessure persistante | `affliction` (supposée, §9) |
| `survie_feter` | fêter une fête au camp | `feter` (supposée, §9) |
| `creer_survivant` | création guidée (tirer, puis creer), compagnon | `generer`, `creerSurvivant` (repli : `Actor.create`, `ajouterMembre`) ; compendiums `lakour-fenoir.passes`, `.savoirs`, `.equipements` |
| `survie_besoins` | ce qui manque au groupe, le profil à chercher | `besoins` (supposée, §10) |
| `survie_recrue` | une recrue qui comble les manques, avec son prix ; la recruter | `genererRecrue`, `recruter` (supposées, §10) |
| `survie_assigner` | tâche du jour d'un compagnon ou d'une recrue, ou répartition automatique | `assigner`, `besoins` (supposées, §10) |
| `survie_ajouter_membre` | un survivant existant rejoint le groupe | `ajouterMembre` (supposée, §10) |
| `histoire_personnage` | l'histoire d'un personnage (commun 40k, Warcraft, Fénoir) | journaux Foundry (`scripts/histoire.js`) |

Outils génériques gardés à Fénoir : `demander_jet`, `lancer_des`, compagnons (`compagnon_ajouter`, `compagnon_retirer`,
`compagnons`, `jet_compagnon`), horloges, Carnet (enquêtes, contacts), mémoire, chronique, scènes, placement, figurants, vue 3D,
ambiance, votes et choix secrets. Absents : expérience et bourse, tour par tour, `calendrier` (le système tient la date).

Les outils qui écrivent passent tous par l'API, qui refuse hors du MJ actif ou tant que le monde n'est pas ouvert : le refus
revient à l'IA (`… (LAKOUR_SURVIE.Erreurs.PasMJActif) Seul le MJ actif écrit l'état de Fénoir… rien n'a changé`). Une fonction
absente de l'API donne une erreur claire (`ne fournit pas game.lakourSurvie.x()`).

## Ce qui a été supposé de l'API au-delà du contrat

- `quand().moment` : une clé (`"apres-midi"`) ou le numéro du quart dans le jour (0 à 3) : les deux sont lus.
- `contenu()` : chaque collection en tableau, en `Map` ou en objet indexé par clé ; `recettes` et `afflictions` (§9) en plus.
- `ajuster({ etat })` : des **variations** (comme `stocks`).
- `renseigner` : reçoit `{ region, source, vu: jour du jour, … }`, `electricite`/`eau` en booléens, `routes: { voisine: état }`.
- `demarrer({ pnj })` : `[{ nom, passe }]`.
- `fabriquer({ recette, acteurId, membres })` (membres : l'artisan compris), `affliction({ acteurId, cle, action: "donner" | "soigner" })`, `feter({ fete })`.
- Les menaces du jour : `monde().menaces` (ou `menacesDuJour`) si le système les garde.
- `test` appelable depuis le navigateur du joueur propriétaire (bouton de `demander_jet`).
- §10 : `generer({ verrous: { nom, age, enfance, passe, traits }, statut, region, favoriser: { competence: poids } })` -> `{ nom, age,
  enfance, passe, competences: { cle: niveau | { niveau } }, passions, traits, incapacites, equipement, savoirs, graine }` ;
  `besoins()` -> `[{ tache, competence, meilleur, couverture, urgence, profil }]` (ou un objet indexé par tâche) ;
  `genererRecrue({ region })` -> les mêmes données plus `raison` et `prix` ; `recruter({ recrue, parleurId })` -> `{ test, reussite,
  acteurId }` ; `assigner({ acteurId, tache })` ; `ajouterMembre({ acteurId, statut })`. La fiche est créée par `creerSurvivant({ donnees,
  userId, rejoindre, statut })` -> `{ acteurId, nom, membre }` (lu dans `systems/lakour-survie/scripts/api.mjs`) ; la graine
  d'histoire est gardée en `flags.lakour-mj-ia.graineHistoire`.

## Essais

`essais/survie-adaptateur.test.mjs`, `essais/survie-outils.test.mjs`, `essais/survie-secret.test.mjs` (contexte, non-fuite vers
les compagnons, fêtes, remise à zéro, appels radio, pilote ; batterie de mutations), doublure `essais/doublures/foundry-survie.mjs`
(API conforme au §5, monde réel balisé de marqueurs secrets).
