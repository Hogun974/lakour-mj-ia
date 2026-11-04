# La Kour – MJ IA — un meneur de jeu IA pour Foundry VTT, avec votre propre clé

*English version: [README.en.md](README.en.md). Projet francophone : code, commentaires, essais et documentation sont
en français.*

<p align="center">
  <img src="docs/captures/console.png" alt="La console du MJ IA et une narration dans le chat" width="49%">
  <img src="docs/captures/plateau.png" alt="Une carte créée par le MJ IA, jetons posés avant la narration" width="49%">
  <br>
  <img src="docs/captures/carnet.png" alt="Le Carnet de campagne : horloges, jauges et réputations" width="49%">
  <img src="docs/captures/tour-par-tour.png" alt="Le panneau Tour par tour" width="49%">
</p>

**MJ IA** (`lakour-mj-ia`) est un module pour [Foundry VTT](https://foundryvtt.com) qui fait tenir la place du meneur de
jeu par un modèle de langage, **Claude** (Anthropic) ou **ChatGPT** (OpenAI), appelé avec **votre propre clé d'API**,
rangée dans votre navigateur et jamais dans le monde. Le MJ IA lit ce que les joueurs écrivent dans le chat, pose les
jetons sur la carte avant de raconter, demande les jets avec la fenêtre déjà réglée, joue les PNJ, lance les ambiances,
crée des cartes jouables et des scénarios, tient un Carnet de campagne (horloges, enquêtes, contacts), écrit la
chronique et sa mémoire de campagne, et peut faire jouer des **compagnons IA** côté joueurs, chacun avec son propre
cerveau et sa propre voix. Un MJ humain reste aux commandes : en mode *validation* (par défaut), toute action qui
modifie le monde ou coûte de l'argent attend son accord ; un budget par séance arrête l'IA ; un fournisseur *factice*
permet de tout essayer sans clé ni coût.

Le module est le **moteur commun** des quatre mondes de La Kour (Warhammer 40 000 avec *Imperium Maledictum*, Warcraft
avec D&D 5e, *Les Veillées de Brumecombe* et Fénoir), et il apporte aussi des outils **sans IA** : tour par tour guidé,
Carnet de campagne, coffre chiffré, histoires des personnages, fêtes de saison. Dans les autres systèmes de jeu, il
fonctionne en mode générique (narration, cartes, votes, mémoire ; les joueurs lancent eux-mêmes leurs dés).

## Ce que ça coûte, ce que ça envoie

**La clé est la vôtre.** Le MJ colle sa clé Anthropic ou OpenAI dans *Réglages › MJ IA › Configurer*. Ces deux clés sont
des réglages de portée **client** de Foundry (`scripts/reglages.js`) : elles sont stockées dans le navigateur du MJ
(`localStorage`) et **jamais dans le monde**, donc jamais envoyées aux autres joueurs, jamais dans le chat, le socket ni
les fichiers de `Data/`. Un MJ qui change de navigateur la ressaisit. L'auteur du module ne voit rien passer : il n'y a
**aucun serveur intermédiaire**, aucune télémétrie ; le navigateur du MJ appelle directement `api.anthropic.com` ou
`api.openai.com` avec les SDK officiels embarqués dans `vendor/`. Les joueurs n'appellent jamais les fournisseurs : tout
ce que l'IA produit (texte, voix, images) leur arrive par Foundry.

**Ce qui part chez le fournisseur** à chaque tour du MJ IA, depuis le navigateur du MJ :

- la consigne du MJ (personnalité choisie, règles de conduite, liste des outils) ;
- la **mémoire de campagne** (journal réservé au MJ que l'IA complète) ;
- l'**état du jeu** : la scène affichée et sa carte vue de dessus, un résumé des personnages et des PNJ présents (fiche,
  état, histoire en une ligne, y compris la page secrète de chaque histoire), le Carnet de campagne avec ses notes
  cachées, l'horloge du combat, la fête du jour, l'état d'une partie des Veillées (rôles compris : le narrateur doit les
  connaître) ;
- les **messages du chat** : les messages publics, les jets, et les chuchotements adressés à un MJ ; **jamais** les
  apartés entre joueurs ;
- la **parole transcrite** des joueurs quand l'écoute est active (voir plus bas) ;
- les **documents que l'IA consulte** par ses outils, à la demande : journaux, objets des compendiums, tables, aides de
  jeu, dont vos scénarios et vos notes de MJ si elle les ouvre.

Chaque **compagnon IA** fait un appel à part, plus court, avec seulement ce que son personnage sait : sa fiche, le chat
public, ce qu'on lui a dit en privé ; jamais la consigne du MJ, la mémoire, les rôles des autres.

**Ce qui part chez OpenAI, en plus, si vous l'activez** (clé OpenAI nécessaire, quel que soit le fournisseur du texte) :

- la **voix** : le texte de chaque narration et réplique est envoyé à l'API Realtime d'OpenAI (`gpt-realtime-2.1-mini`
  par défaut) ; le son revient par morceaux dans le navigateur du MJ, qui le diffuse aux joueurs par le socket de Foundry ;
- l'**écoute** : quand une IA doit entendre (séance lancée ou compagnon IA vivant à la table) et seulement si le réglage
  *Écouter la parole des joueurs* est coché, le son de chaque joueur capté par la voix intégrée de Foundry (A/V) est
  découpé par silences et transcrit par l'API d'OpenAI. Une pastille « L'IA écoute » s'affiche chez chacun ; un micro
  coupé n'envoie rien ; le reste du temps aucun micro n'est écouté ;
- les **images** : la description d'une image demandée est envoyée à l'API Images (`gpt-image-2` par défaut).

**Ce qui ne part jamais** : les clés (sauf vers leur propre fournisseur), les mots de passe des comptes, les apartés entre
joueurs, les fichiers du monde que l'IA n'ouvre pas, et rien du tout tant qu'aucune séance n'est lancée, ou avec le
fournisseur factice. Le fil complet de la conversation avec l'IA est gardé **chiffré** dans `Data/lakour-mj-ia/fils/`
(voir *Sécurité et vie privée*).

**Ce que ça coûte.** Les appels sont facturés par Anthropic ou OpenAI sur votre compte, selon leur grille. La console du
MJ IA affiche un **coût estimé** de la séance (prix relevés dans `scripts/constantes.js`, avec leur date ; la facture du
fournisseur fait foi) et un **budget par séance** (10 $ par défaut, réglable) arrête l'IA quand il est atteint,
compagnons, voix et transcription compris. Vous choisissez le modèle (chez Anthropic : Opus, Sonnet, Haiku, Fable ; chez
OpenAI : champ libre) et l'effort de réflexion ; un modèle bon marché joue les compagnons par défaut. Ordre de grandeur
constaté à la table : de quelques dizaines de centimes à quelques dollars par séance selon le modèle et la longueur.

**Sans IA.** Le fournisseur *factice* répond en écho et exécute les outils demandés dans le chat (`!outil nom {…}`) :
aucun appel réseau. La voix *navigateur* (synthèse vocale locale) est gratuite. Le tour par tour, le Carnet de campagne,
le coffre, les histoires des personnages, les fêtes, les votes et le panneau de la Table des Veillées fonctionnent sans
aucune clé ; les compagnons passent alors en mode simple (sans IA) et la partie n'est jamais bloquée.

## Ce qu'il faut

| Quoi | Version | Où |
|---|---|---|
| Foundry VTT | **14** (vérifié avec 14.369) | [foundryvtt.com](https://foundryvtt.com) |
| Un navigateur récent pour le MJ | Chrome, Edge ou Firefox à jour | Le coffre utilise WebCrypto, la voix WebAudio et AudioWorklet. |
| Une clé d'API | facultatif | [Anthropic](https://console.anthropic.com) pour Claude ; [OpenAI](https://platform.openai.com) pour ChatGPT, et dans tous les cas pour la voix, l'écoute et les images. |
| La voix intégrée de Foundry (A/V) | facultatif | Mode *Audio seulement*, pour l'écoute des joueurs et les salons vocaux des Veillées. |

Modules **facultatifs**, reconnus par le MJ IA s'ils sont actifs, jamais requis : **Sequencer** et **JB2A** (animations),
**FXMaster** (météo), **Calendaria** (date, heure et météo du jour, 40k et Warcraft), **Item Piles** (butin et marchands,
Warcraft), **3D Canvas** (`levels-3d-preview`, vue en relief).

## Installation

### 1. Par l'URL du manifeste (recommandé)

Dans Foundry, onglet **Modules complémentaires** › **Installer un module** › champ *URL du manifeste* :

```
https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/module.json
```

Puis, dans le monde : **Réglages › Gérer les modules**, cocher *La Kour – MJ IA*. Au premier chargement, le module installe
dans le monde son **guide d'utilisation** (deux journaux : guide du MJ, caché aux joueurs, et guide des joueurs ; en
anglais dans un monde anglais) et propose de configurer une clé. Chapeau de magicien dans la barre de gauche : la console.

### 2. Depuis les sources

```bash
git clone https://github.com/Hogun974/lakour-mj-ia.git
cd lakour-mj-ia
npm install        # facultatif : seulement pour les essais et pour régénérer vendor/ ou les sons
npm run essais     # facultatif : les essais, sans réseau ni clé
```

La racine du dépôt **est** le module : copiez (ou liez) le dossier dans `Data/modules/lakour-mj-ia/` de votre Foundry.
Sous Windows, `powershell -File outils/lier-modules.ps1 -DataPath <votre dossier Data>` crée la jonction. Seuls
`module.json`, `scripts/`, `templates/`, `styles/`, `lang/`, `assets/`, `vendor/` et les fichiers de licence servent à
Foundry ; `npm run empaqueter` fabrique l'archive exactement comme la publie la release.

## Les mondes de La Kour

Le MJ IA lit de la même façon chaque **module de contenu** La Kour (figurants, index des jetons, plans des cartes, fêtes,
réputations : contrat dans `outils/contrat-contenu.mjs`). Chaque monde a son dépôt, son mode d'emploi et son monde
vierge prêt à jouer.

| Monde | Système | Module de contenu | Dépôt |
|---|---|---|---|
| **La Kour 40k** — le sous-secteur de la Kour, Warhammer 40 000 | *Imperium Maledictum* (`impmal`) | `lakour-40k` | [github.com/Hogun974/lakour-w40k](https://github.com/Hogun974/lakour-w40k) |
| **La Kour Warcraft** — Azeroth pour D&D 5e (règles 2024) | `dnd5e` | `lakour-warcraft` | [github.com/Hogun974/lakour-warcraft](https://github.com/Hogun974/lakour-warcraft) |
| **Les Veillées de Brumecombe** — déduction sociale, famille du loup-garou | `lakour-loups` (fourni) | `lakour-veillees` | [github.com/Hogun974/lakour-veillees](https://github.com/Hogun974/lakour-veillees) |
| **Fénoir** — survie à La Réunion au jour zéro d'une épidémie | `lakour-survie` | `lakour-fenoir` | quatrième monde, en préparation |

Aux Veillées, le module est **requis même sans IA** : c'est lui qui tient le coffre chiffré des secrets de la partie.

**Mode générique.** Dans un système sans adaptateur dédié, le MJ IA raconte, crée des cartes et des journaux, lance les
ambiances, mène votes et choix secrets, tient sa mémoire, et demande aux joueurs de lancer eux-mêmes leurs dés en
précisant la formule ; il ne lit pas les fiches et ne lance pas les jets du système à leur place.

## Ce que fait le module, chapitre par chapitre

Le guide complet, tel qu'il est installé dans chaque monde, est dans
[`docs/guide-utilisation.md`](docs/guide-utilisation.md) (en anglais : [`docs/guide-utilisation.en.md`](docs/guide-utilisation.en.md)).

### Narration et outils du MJ IA

- **Console** (chapeau de magicien) : choisir la personnalité, **Démarrer / Terminer la séance**, souffler une consigne
  secrète, préparer un scénario hors séance, créer un personnage avec le MJ, réparer la vision des joueurs, coût estimé.
- **Personnalités** modifiables : ton, violence, longueur, rigueur des règles, liberté avec le scénario (fidèle,
  adaptative, libre), voix.
- **Plateau** : créer des cartes jouables (murs, portes, lumières, sons d'ambiance, zones invisibles des joueurs, étages
  avec escaliers), les faire évoluer en jeu (zone de récit, piège, téléportation, obscurité, épingle vers un journal, son
  localisé), amener les personnages, poser PNJ et figurants « près du puits » avant de raconter, retirer, régler vision,
  brouillard et portes, cadrer la vue 3D.
- **Récit** : messages secrets à un joueur, votes de groupe et choix secrets avec minuteur, aides de jeu montrées page par
  page (jamais un journal réservé au MJ), tirages sûrs dans les tables du module, dix ambiances sonores synthétisées,
  images (OpenAI), chronique visible des joueurs à la fin de la séance.
- **Règles** : jets demandés avec la fenêtre pré-réglée (difficulté, modificateurs), dés des PNJ, combats, expérience,
  montée de niveau (D&D 5e) ou dépense d'XP (Imperium Maledictum), argent, objets, marchands.
- **Création de personnage** guidée dans le chat, fiche complète écrite par l'IA (Imperium Maledictum, D&D 5e, Fénoir),
  puis son histoire.
- **Garde-fous** : mode validation (chaque action sensible attend un clic du MJ), budget par séance, arguments de chaque
  outil validés contre leur schéma, outils refusés hors du système où ils existent, « à toi » discret chez le joueur attendu.

### Compagnons IA et pilote automatique

Des personnages côté joueurs, joués par l'IA **comme des joueurs** : chacun a son propre appel au modèle et ne sait que ce
que son personnage sait (sa fiche, le chat public, ce qu'on lui a dit en privé). Il parle sous son nom, avec une courte
didascalie en italique, vote, répond aux choix secrets, agit à son tour en combat avec les vrais jets de sa fiche, et
réagit aux narrations selon le *Bavardage* réglé. Aux Veillées, ils reçoivent des rôles, choisissent la nuit en secret et
débattent le jour, même avec un MJ humain sans narrateur IA. Le **pilote automatique** (mode autonome, plus aucun joueur
humain en jeu) fait avancer la partie seule, étape par étape, avec des garde-fous : victoire, retour d'un joueur, budget,
plafond d'étapes, bouton d'arrêt. Détails : [`docs/compagnons.md`](docs/compagnons.md).

### Voix et écoute

Trois modes de voix : aucune ; **navigateur** (synthèse vocale locale, gratuite, chacun chez soi) ; **OpenAI** (API
Realtime, diffusée en direct morceau par morceau, une voix par compagnon selon son tempérament, une seule voix à la fois
dans l'ordre du chat, abrégé vocal réglable). L'**écoute** transcrit la parole des joueurs captée par la voix intégrée de
Foundry, seulement quand une IA doit entendre, avec une pastille visible chez chacun. Aux Veillées, qui entend qui
dépend de la phase (les loups entre eux la nuit, les morts entre eux). Chaque joueur règle chez lui s'il entend les IA
et à quel volume. Détails : [`docs/voix-et-ecoute.md`](docs/voix-et-ecoute.md).

### Coffre et secrets

Foundry **livre à chaque navigateur connecté** tous les réglages du monde et les documents du monde (les droits
d'accès sont vérifiés dans le navigateur, pas sur le serveur), et **sert les fichiers de `Data/`** à qui en connaît
l'adresse. Un joueur curieux peut donc lire dans la console de son navigateur ce que l'interface lui cache. Le coffre du
MJ IA (`scripts/coffre.js`, `coffre-logique.js`) protège ce qui doit rester secret même d'un joueur qui fouille :

- ce qu'il **protège** : les éléments cachés du Carnet de campagne (horloges, jauges, réputations, enquêtes, contacts,
  avec leurs notes), le **fil de l'IA** et ses archives (`Data/lakour-mj-ia/fils/`, qui contiennent l'état du jeu donné
  à l'IA à chaque tour), les répliques vocales privées (jamais déposées dans `Data/`, envoyées aux seuls destinataires),
  et, aux Veillées, les rôles, camps et choix de nuit ;
- **comment** : chiffrement AES-GCM 256 bits ; la clé reste dans le navigateur du MJ (réglage client) ; chaque compte
  joueur en reçoit une **part** (partage de Shamir), et il faut la **majorité des joueurs** pour la reconstituer ; le monde
  ne garde que des empreintes. Un MJ sur un nouveau navigateur demande les parts aux joueurs connectés ou la clé aux
  autres MJ ; en attendant, rien de chiffré n'est écrasé. Une **clé de secours** se télécharge (fichier à garder hors du
  monde, comme un mot de passe) et se réimporte ; le module rappelle de le faire tant que ce n'est pas fait ;
- ce qu'il **ne protège pas** : la mémoire de campagne et les journaux du MJ (scénarios, notes), protégés seulement par les
  droits de Foundry ; la page « ce qu'il garde pour lui » des histoires de personnages, qui est une simple propriété de
  page ; et rien du tout si les comptes joueurs n'ont **pas de mot de passe** (une part sans mot de passe est une part que
  n'importe qui peut prendre).

### Carnet de campagne, horloges, enquêtes, contacts (40k, Warcraft)

Livre ouvert dans la barre de gauche. **Horloges** à segments (à la manière de *Blades in the Dark*) qui sonnent quand
elles sont pleines, **jauges** à seuils (l'Exposition en 40k), **réputations** de faction de −100 à +100 lues en paliers ;
**enquêtes** selon la règle des trois indices (conclusions, indices, cochés quand ils sont trouvés, alerte quand une
conclusion en a moins de trois) ; **contacts** avec attitude, dettes et demandes. L'œil montre ou cache chaque élément aux
joueurs ; une carte paraît au chat quand une horloge sonne ou qu'un palier est franchi, et le MJ IA en tire une
conséquence. Les modules des mondes y branchent leurs propres éléments (`api.horloges`, `api.enquetes`, `api.contacts`).

### Tour par tour (40k, Warcraft)

Un panneau (bouclier) qui s'appuie sur le combat de Foundry sans le remplacer, **avec ou sans IA** : l'étape suivante est
écrite en haut et le bouton qui la fait est encadré de pointillés. Préparation et initiative avec la vraie méthode du
système, actions restantes, attaques en vrais jets, cibles avec distance et portée, **proposition** d'action pour chaque
PNJ (sans IA : l'adversaire le plus proche, la meilleure attaque à portée), application des dégâts par le système,
rappels (concentration, jets contre la mort, actions légendaires, test opposé), bandeau des joueurs, et un **tour de
table** hors combat. Détails : [`docs/tour-par-tour.md`](docs/tour-par-tour.md).

### Cartes générées

Un plan décrit par l'IA (ou écrit à la main dans un module de contenu) devient une scène Foundry v14 complète : fond
dessiné en SVG vue de dessus (aucun service d'images), murs, portes, lumières, sons d'ambiance déduits des pièces, zones
natives (texte de récit, téléportation, pause, obscurité), épingles vers les journaux, étages avec escaliers, et un
index des pièces qui permet de poser un jeton « près de la forge ». Style plat ou en relief (3D Canvas).

### Histoires des personnages (40k, Warcraft, Fénoir)

Un journal « Histoire de <nom> » en quatre pages par personnage et par compagnon (qui il est, son histoire, ce qu'il garde
pour lui, chapitres datés), écrit par le MJ IA après deux ou trois questions au joueur, ou créé vide avec des questions
pour l'écrire soi-même (bouton **Histoire** de la fiche, sans IA).

### Fêtes de saison

Un calendrier des fêtes populaires (Nouvel An, Saint-Valentin, Carnaval, Pâques, Fête de la musique, Fête nationale,
Halloween, Noël ; et, pour La Réunion : 20 décembre, letchis, Dipavali, Cavadee, Nouvel An chinois), que chaque monde
**décline** à sa manière (en 40k, une veillée de l'Imperium plutôt que Noël). Carte du jour, décor léger coupable par
joueur, allusion naturelle du narrateur. Réglage automatique, aucune, ou fête forcée. Contrat des mondes :
[`docs/fetes.md`](docs/fetes.md).

### Fils chiffrés et mémoire

Le fil de conversation avec l'IA est gardé entre deux séances (et archivé à chaque nouvelle partie) pour que le MJ IA
reprenne où il en était ; il est chiffré avec la clé du coffre. La **mémoire de campagne** est un journal réservé au MJ
(résumé, PNJ, lieux, fils ouverts, notes) que l'IA relit au début de chaque séance et que le MJ humain peut corriger.

## Sécurité et vie privée

- **Vos clés** restent dans le navigateur du MJ (réglage client), jamais dans le monde ; vérifiable dans
  `scripts/reglages.js`. Révoquez-les chez le fournisseur si un poste est compromis.
- **Seul le navigateur du MJ** parle aux fournisseurs, directement, avec les SDK officiels. Pas de serveur de l'auteur,
  pas de télémétrie, aucune donnée collectée par le module.
- **Ce qui est envoyé** est décrit plus haut : tenez-en compte avant de confier à l'IA des scénarios ou des notes que vous
  ne voulez pas voir quitter votre table. Les conditions de conservation des données chez Anthropic et OpenAI sont les
  leurs ; lisez-les.
- **L'écoute** n'est active que pendant une séance ou avec un compagnon IA vivant, si le réglage est coché, et toujours
  signalée par une pastille ; chaque joueur peut couper son micro.
- **Le coffre** protège ce qui est caché aux joueurs même contre un joueur qui fouille, à condition que les comptes aient
  des mots de passe ; il ne protège ni les journaux du MJ, ni la mémoire, ni les pages secrètes des histoires.
- **Le MJ garde la main** : mode validation par défaut, budget par séance, bouton d'arrêt du pilote, fournisseur factice
  pour essayer. L'IA peut se tromper, inventer une règle ou mal lire une fiche : le mode validation existe pour cela.
- **Les salons vocaux** des Veillées et les droits de vue sont appliqués dans chaque navigateur : contournables par un
  tricheur, acceptables entre amis.
- Le module ne génère ni n'exécute aucun code à l'exécution ; tout ce que l'IA fait passe par des outils déclarés,
  validés et, en mode validation, approuvés.

## Langues

L'**interface** du module existe en français et en anglais (`lang/fr.json`, `lang/en.json`). Les **textes** du MJ IA
(consignes au modèle, cartes au chat, personnalités) et les contenus des mondes sont en **français** ; l'IA raconte en
français. Le **guide d'utilisation** existe dans les deux langues (`scripts/guide.js` et sa traduction `scripts/guide-en.js`) :
un monde dont le module de contenu est la variante `-en` (ou, sans module de contenu, dont l'interface est en anglais)
reçoit le guide anglais, et le guide déjà installé change de langue avec le monde. Une version anglaise des contenus
est en cours, par des modules `-en` propres à chaque monde ; elle n'est pas encore publiée. Le projet lui-même est francophone :
code, commentaires, essais et documentation sont écrits en français.

## Essais

```bash
npm run essais      # 438 essais Node dans 68 fichiers, ~40 s, aucun réseau, aucune clé, aucun coût
```

Les essais éprouvent la logique pure du moteur hors de Foundry (adaptateurs, outils, compagnons, pilote, tour par tour,
coffre et partage de clé, voix et flux, écoute, Carnet, cartes et rendu, fêtes, histoires, contrats des mondes), avec
des doublures de Foundry (`essais/doublures/`) et des **batteries de mutations** : pour chaque règle importante, une
version volontairement cassée du code doit faire échouer la batterie.

Le validateur Foundry (`node outils/valider-foundry.mjs <module> <système> <dossier contenant common/>`) est **facultatif
et hors CI** : il exige le dossier `server/common` d'une installation Foundry v14, qui n'est pas dans le dépôt ; les
dépôts de monde l'appellent à la main.

## Structure du dépôt

```
module.json, scripts/, templates/, styles/, lang/, assets/sons/, vendor/   le module Foundry (racine du dépôt)
scripts/        main.js, moteur.js (boucle du MJ IA), contexte.js (ce qui est envoyé à l'IA), outils*.js (outils de l'IA),
                adaptateurs.js (ce qui dépend du système), fournisseurs/ (anthropic, openai, factice),
                compagnons*.js, pilote.js, voix*.js, transcription.js, ecoute.js, coffre*.js, fils.js, carnet.js,
                horloges*.js, tour-*.js, cartes*.js, placement.js, histoire*.js, fetes*.js, guide*.js, apps/ (fenêtres)
vendor/         SDK Anthropic et OpenAI embarqués (npm run embarquer)
assets/sons/    dix boucles d'ambiance synthétisées (npm run fabriquer-sons) et leur index
outils/         empaqueter-module.mjs, embarquer-sdk.mjs, fabriquer-sons.mjs, ecrire-guide.mjs,
                contrat-contenu.mjs, jetons-commun.mjs, traduction.mjs et empaqueter-monde.mjs (partagés par
                les mondes), valider-foundry.mjs, game-icons/ (icônes CC BY 3.0 et leur licence), lier-modules.ps1
essais/         essais Node, doublures/, donnees/
docs/           guide-utilisation.md (.en.md), compagnons.md, voix-et-ecoute.md, tour-par-tour.md, fetes.md, survie.md,
                empaqueter-monde.md, traduction.md, publication.md, captures/
.github/workflows/release.yml   à chaque tag v*, essais, archive et release GitHub
```

Chaque dépôt de monde embarque ce dépôt en **sous-module** (`modules/lakour-mj-ia`) et appelle ses outils partagés.

## Contribuer

Les retours et contributions sont bienvenus, en français de préférence (l'anglais est lu aussi) :

- **Un bogue, une idée** : [ouvrez une issue](https://github.com/Hogun974/lakour-mj-ia/issues) avec la version de
  Foundry, du système, du module et du fournisseur, et ce qui s'est passé (sans votre clé, évidemment).
- **Du code** : le projet est écrit en **français** (noms, commentaires, messages, essais). Une amélioration du moteur
  doit servir à **tous les mondes** : rien de propre à un monde ici, ce qui dépend d'un système passe par
  `scripts/adaptateurs.js`. Chaque règle nouvelle vient avec son essai, et les règles importantes avec une **batterie de
  mutations** ; `npm run essais` doit rester vert, ici puis dans chaque monde après mise à jour du sous-module.
- **Une traduction** : les chaînes d'interface sont dans `lang/` ; les textes du MJ IA passent par les modules `-en`.
- Ne modifiez pas `vendor/` ni `assets/sons/` à la main : `npm run embarquer` et `npm run fabriquer-sons` les régénèrent.

## Crédits

- **SDK embarqués** (`vendor/`) : [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) 1.3.0
  (Anthropic, PBC) et [`openai`](https://github.com/openai/openai-node) 7.47.0 (OpenAI), tous deux sous licence
  **Apache-2.0**, empaquetés sans modification par esbuild (340 Ko et 380 Ko). Texte de la licence :
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
- **Icônes** (`outils/game-icons/`) : icônes de [game-icons.net](https://game-icons.net) (Carl Olsen, Caro Asercion,
  Cathelineau, DarkZaitzev, Delapouite, Kier Heyl, Lorc, Skoll), licence
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), avec leur `license.txt` ; elles servent aux fabricants de
  jetons des mondes.
- **Sons** (`assets/sons/`) : dix boucles d'ambiance entièrement **synthétisées** par `outils/fabriquer-sons.mjs` (bruit
  filtré, oscillateurs, réverbération) : aucun enregistrement, aucun échantillon tiers. Aucune police embarquée.
- **Images** : le module n'en livre aucune ; les images générées en jeu passent par la clé OpenAI de l'utilisateur.
- **Foundry VTT** est une marque de Foundry Gaming, LLC. *Imperium Maledictum* est publié par Cubicle 7 ; D&D 5e par
  Wizards of the Coast ; Warhammer 40 000 et Warcraft sont des marques de Games Workshop et de Blizzard Entertainment.
  Ce module ne contient aucun texte de leurs livres : il lit ce que vous avez installé.
- **Claude et Anthropic, ChatGPT et OpenAI sont des marques de leurs propriétaires ; ce projet n'est affilié à aucun
  d'eux.**

## Licence

> **TODO (Jordan)** : choisir et déposer un fichier `LICENSE` à la racine avant la première release ; le manifeste pointe
> déjà dessus (`"license": "LICENSE"`) et l'empaqueteur le copie dans l'archive s'il existe.

Licence proposée : **MIT** pour l'ensemble du code de ce dépôt, libre d'usage, de modification et de redistribution à
condition de conserver la mention de l'auteur. Les SDK de `vendor/` restent sous Apache-2.0 et les icônes de
`outils/game-icons/` sous CC BY 3.0.
