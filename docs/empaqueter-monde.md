# Empaqueter un monde vierge (`outils/empaqueter-monde.mjs`)

Les trois mondes de La Kour (40k, Warcraft, Veillées) sont joués sur le serveur, avec les joueurs, leurs personnages,
le chat, les clés d'API, le coffre… Pour qu'un tiers puisse installer le monde **vierge** — le contenu de nos modules
déjà installé, les réglages qui font le monde, et rien de personnel — l'outil commun `outils/empaqueter-monde.mjs`
trie une copie du monde du serveur, en écrit les sources versionnées dans le dépôt du monde (`monde/`), puis compile
le paquet (`world.json` + base LevelDB + archive zip) que la release GitHub publie.

Chaque dépôt de monde l'appelle depuis le sous-module : `npm run empaqueter-monde` dans `lakour-w40k`,
`lakour-warcraft`, `lakour-veillees` (script `node modules/lakour-mj-ia/outils/empaqueter-monde.mjs`). Le CLI
`@foundryvtt/foundryvtt-cli` du dépôt du monde fait le déballage et la compilation LevelDB.

| Dépôt | Monde publié (`id`) | Monde du serveur | Système | Modules requis |
| --- | --- | --- | --- | --- |
| lakour-w40k | `la-kour-40k` | `la-kour-mj-ia` | impmal | lakour-40k, lakour-mj-ia, warhammer-lib |
| lakour-warcraft | `la-kour-warcraft` | `la-kour-warcraft` | dnd5e | lakour-warcraft, lakour-mj-ia |
| lakour-veillees | `la-kour-veillees` | `la-kour-veillees` | lakour-loups | lakour-veillees, lakour-mj-ia |

## Modes

```
npm run empaqueter-monde -- --inventaire <Data/worlds/<id serveur>>   # affiche le tri, n'écrit rien
npm run empaqueter-monde -- --extraire   <Data/worlds/<id serveur>>   # écrit monde/src/** et monde/world.json, puis vérifie
npm run empaqueter-monde -- --construire                               # monde/src -> monde/dist/<id>/data (LevelDB), world.json, <id>.zip
npm run empaqueter-monde -- --verifier                                 # relit monde/dist/<id> (sinon monde/src) : échec si fuite
npm run empaqueter-monde                                               # --construire puis --verifier (la release GitHub)
```

Options : `--depot <dossier>` (le dépôt du monde ; par défaut le dossier courant), `--version x.y.z` (par défaut la
version du module de contenu, `modules/<module>/module.json` : le monde et son module portent la même version),
`--langue en` (le monde vierge anglais, voir plus bas).

Ce qui est versionné : `monde/src/<collection>/*.json` (un fichier par document, lisible, nettoyé) et `monde/world.json`.
Ce qui ne l'est pas : `monde/dist/` (dans `.gitignore`), reconstruit à chaque `npm run empaqueter-monde`.

## Règle de tri

Un document est **gardé** quand il est du contenu de monde ; il est **retiré** quand il est personnel ou de partie.
L'inventaire (`--inventaire`) donne le verdict et sa raison pour chaque document et chaque réglage ; les noms des
utilisateurs et des acteurs retirés n'y apparaissent pas (seulement leur type). La règle est écrite en clair dans
`empaqueter-monde.mjs` (constantes `REGLAGES`, `MOTIFS_SECRETS`, fonction `trier`).

| Collection | Gardé | Retiré |
| --- | --- | --- |
| users | rien du serveur ; **un** utilisateur `Gamemaster` (rôle 4, sans mot de passe) est créé | tous les utilisateurs (mots de passe hachés, drapeaux) |
| messages, combats, fog, cards | — | tout (chat, combats, brouillard des joueurs, cartes) |
| actors | PNJ venus de nos compendiums (`_stats.compendiumSource`), `ownership` ramené à `{ default: 0 }`, seuls nos drapeaux et `core` | personnages de type joueur (`character` ; `villageois` pour les Veillées), acteurs dont un utilisateur non-MJ est propriétaire, dossiers « Essais Claude », origine inconnue |
| items, effects, macros | venus de nos compendiums ou portant nos drapeaux | le reste |
| journal | journaux installés depuis nos compendiums (drapeau `<module>.cle`, `compendiumSource`), guides du MJ IA (`lakour-mj-ia.guide`) | mémoire de campagne, chroniques, histoires de personnages (`lakour-mj-ia.memoire` / `.chronique`, `lakour-loups.chroniques`, ou par le nom), notes de calendrier de Calendaria, `sequencerDatabase`, origine inconnue |
| scenes | scènes installées depuis nos compendiums ; jetons des acteurs retirés enlevés ; `fog` (collection) vidé | scène d'accueil de Foundry (`NUEDEFAULTSCENE0`), origine inconnue |
| tables, playlists | venues de nos compendiums ou du MJ IA (« Ambiances (MJ IA) ») | le reste |
| folders | dossiers de compendiums (cités par `core.compendiumConfiguration`), dossiers de nos documents | dossiers de Calendaria, « Essais Claude », dossiers restés vides après le tri |
| settings | voir ci-dessous | voir ci-dessous |
| `data/fils`, `data/cartes` | n'existent dans aucun des trois mondes (les fils de l'IA vivent dans le réglage `lakour-mj-ia.filsScelles`, retiré) ; une collection hors Foundry serait signalée et retirée | |

Sur tout document gardé : les entrées par utilisateur de `ownership` disparaissent (seul `default` reste),
`_stats.lastModifiedBy`, `Drawing.author`, `Setting.user` passent à `null`, et tout identifiant d'utilisateur du serveur
est effacé des chaînes.

### Réglages gardés, et pourquoi

- `core.*` : `moduleConfiguration` (les modules à activer), `compendiumConfiguration` (rangement des compendiums),
  `permissions`, grille, anneaux de jeton, temps du monde… — la configuration du monde. Retirés : `rtcWorldSettings`
  (serveur TURN : adresse et identifiants), `nue.*` (découverte de Foundry), `adventureImports` (historique).
- `<module de contenu>.installe` : marqueur « le contenu est installé » (évite que le module réinstalle tout).
- `lakour-mj-ia.*` sur **liste blanche**, réglages de conduite sans secret ni historique : `pilote`, `piloteDelai`,
  `piloteEtapes`, `autonomie`, `effort`, `styleVisuel`, `jouerPnj`, `reagirPortes`, `reagirDeplacements`,
  `seulActifBouge`, `delaiReponse`, `budgetSeance`, `miseEnPlace`, `fete`, `effetsDeFete`, `panneauTourAuto`,
  `tourDeTable`, `personnaliteActive` (seulement si c'est une personnalité livrée avec le moteur). Tout le reste est
  retiré : `trousseau`, `coffreCarnet` (clés, coffre), `fournisseur` et `modele*` (le compte IA de l'opérateur),
  voix et écoute (`voix*`, `*Voix`, `transcription*`, `ecoute*`), compagnons, `horloges`, `filsScelles`, `seance`,
  `feteCarte`, `reparations`, `mouvementsBloques`, `historiqueLoups`, `personnalites`.
- `lakour-loups.*` (Veillées) sur liste blanche : les règles de la veillée (`mortsVoientTout`, `canalDesMorts`,
  `dureeVote`, `chanceEpier`, `chancePeste`, `annoncesEnChat`, `repartirAZero`, `delaiChoix`, `salonsAutomatiques`,
  `revelerALaMort`, `almanach`, `bailli`, `banc`, `dernierSouffle`, `gensDePassage`, `glasDuDeuil`, `masques`,
  `petiteTablee`, `plateauInteractif`, `signalTour`, `veilleeDeFete`). Retirés : `partie`, `coffre`, `secrets`,
  `chroniques`, `historique`, `lancementTraite`, `carnet`.
- Systèmes (impmal, dnd5e) et modules tiers (dice-so-nice, fxmaster, item-piles, calendaria, sequencer,
  autoanimations, babele, lib-wrapper…) : gardés, y compris `impmal.tableSettings`, `packSourceConfiguration` et les
  versions de migration (les données sont bien à cette version). Retirés : licences acceptées (`*LicenseAgreement`),
  `primaryGM`, marqueurs « déjà vu » (`welcome`, `runonlyonce`, `oneTimeMessages`, `seenVersions`, `changelogger`,
  `updateNotices`, `releaseMessage`, `firstLoad`, `firstRun`), états de Calendaria (`seededCalendars`,
  `weatherHistory`, `calendarHUDPosition`, `weatherForecastPlan`).
- Une clé en double dans la base (vu : `impmal.systemMigrationVersion`) : seul le document le plus récent est gardé.

### Ce que `--verifier` refuse

Le paquet produit est relu (la LevelDB de `monde/dist/<id>/data` déballée, sinon `monde/src`) et l'outil ÉCHOUE
(code 1) s'il reste : un utilisateur autre que le `Gamemaster` créé, un mot de passe, un message, un combat, un
brouillard, un acteur de type joueur, un propriétaire nommé dans `ownership`, un `_stats.lastModifiedBy`, un réglage
que la règle retire, un `Setting.user`, un jeton sans acteur, deux scènes actives, ou une chaîne qui ressemble à un
secret : clé d'API (`sk-…`, `sk_live_…`, AWS), hash bcrypt, adresse IP privée, `Hogun974` hors des adresses GitHub
publiques, adresse mail, paire `password:`/`token:`/`secret:` avec valeur, chaîne longue de 40 caractères et plus avec
chiffres (hors chemins de fichiers et adresses web). À l'extraction, les identifiants et noms des utilisateurs du serveur
sont aussi recherchés.

Il contrôle la structure (`_id` et `_key` de chaque document, `_id` des documents imbriqués, `world.json` complet et sans
`nextSession`/`lastPlayed`/`playtime`) et **signale** (avertissements, sans échec) les liens cassés : chaque uuid
`@UUID[...]` ou nu (`JournalEntry.<id>`, `Compendium.<module>.<pack>.<Type>.<id>`, pages comprises) doit exister dans le
monde ou dans les sources de nos compendiums (`modules/<module>/src/<pack>/*.json`) ; les compendiums des systèmes ne sont
pas vérifiables. Chaque chemin `modules/<nôtre>/…` ou `systems/lakour-loups/…` doit exister dans le dépôt ; un chemin
`worlds/…` est signalé (il ne suivrait pas le monde).

### Le Gamemaster

Les sources du serveur Foundry v14 ne sont pas disponibles (seuls `client/` et `common/` le sont) : on ne peut pas y
vérifier que Foundry crée un Gamemaster quand la collection `users` est vide. L'outil en crée donc un, `Gamemaster`,
rôle 4, sans mot de passe, `_id` `LaKourGamemaster`. Si Foundry en crée un aussi, la collection n'est plus vide et il
n'en crée pas de second. Le tiers met un mot de passe depuis la configuration des utilisateurs.

## Reconstruire après une évolution du monde sur le serveur

1. Copier le monde du serveur (sauvegarde nocturne ou `Data/worlds/<id serveur>`, dossier `data/` + `world.json`) dans un
   dossier de travail hors des dépôts : ce sont des données personnelles, elles ne doivent pas entrer dans git.
2. Dans le dépôt du monde : `npm run empaqueter-monde -- --inventaire <dossier>` et lire le tri. Un document gardé qui
   ne devrait pas l'être, ou un nouveau réglage de nos modules : corriger la règle dans `empaqueter-monde.mjs`
   (`REGLAGES`, `trier`) — jamais le fichier produit à la main.
3. `npm run empaqueter-monde -- --extraire <dossier>` : réécrit `monde/src/` (l'ancien contenu est effacé) et
   `monde/world.json`, puis vérifie. Relire le `git diff` de `monde/` avant de commiter : ce qu'on y voit est ce que le
   tiers recevra.
4. `npm run empaqueter-monde` : compile et vérifie. Pour installer le monde chez soi et l'essayer : dézipper
   `monde/dist/<id>.zip` dans `Data/worlds/<id>/` d'un Foundry v14 où le système et nos modules sont installés.
5. Commiter `monde/` avec la version du module de contenu : la release (`.github/workflows/release.yml`, tag `v<version>`)
   lance `npm run empaqueter-monde` puis `outils/empaqueter-module.mjs --monde monde/dist`, qui aligne `world.json`
   (version, `manifest`, `download`) et publie `world.json` et `<id>.zip` en pièces jointes.

## Le monde vierge anglais (`--langue en`)

Chaque monde a son jumeau anglais, `<id>-en` (`la-kour-40k-en`, `la-kour-warcraft-en`, `la-kour-veillees-en`,
`la-kour-fenoir-en`), construit par `npm run empaqueter-monde -- --langue en` (`--construire`, `--verifier` ou sans
option ; `--inventaire` et `--extraire` restent français : les sources `monde/src` sont celles du monde français) :

- **documents** : les mêmes que le monde français (mêmes `_id` et `_key`), traduits par les dictionnaires du module de
  contenu (`modules/<module>/contenu/en/<pack>.json`, `outils/traduction.mjs`). Un document installé depuis un de nos
  compendiums (`_stats.compendiumSource`) prend l'entrée de son document source (son `_id` dans le monde peut différer :
  l'entrée est recopiée) ; ses pages re-créées à l'installation et les textes repris ailleurs (noms de dossiers : titres
  d'aventures, étiquettes du manifeste `contenu/en/module.json`) passent par la mémoire de traduction. Uuid
  (`Compendium.<module>.` → `<module>-en.`), chemins `modules/<module>/` et portée des drapeaux sont récrits à toute
  profondeur. Les guides et la liste de lecture du **MJ IA** (drapeaux `lakour-mj-ia`) n'ont pas de dictionnaire :
  ils restent tels quels. Les clés que le système lit par nom (Veillées : « Maison N », repères et noms du plan,
  `MONDES[<module>].traduction.exclure`, mêmes clés que `OPTIONS_TRADUCTION` du fabricant) ne sont ni traduites ni
  comptées. Le résumé de la construction dit, pack par pack, ce qui est traduit, par mémoire, obsolète (le français du
  monde n'est plus celui du dictionnaire : le monde du serveur a une version plus ancienne du document) ou resté en
  français ;
- **réglages** : `core.moduleConfiguration` active `<module>-en` à la place du module français, les clés
  `<module>.<pack>` (`core.compendiumConfiguration`, `packSourceConfiguration`…) et le marqueur `<module>.installe`
  passent sous `<module>-en` ; les autres réglages ne changent pas ; le `Gamemaster` est le même ;
- **manifeste** : engendré de `monde/world.json` et de `monde/world.en.json` (versionné : `{ id: "<id>-en", title,
  description }`, traduction fidèle de la description) : même version, mêmes auteurs et adresses ; `background` du
  module anglais, `manifest` `…/releases/latest/download/world-en.json`, `download` `…/<id>-en.zip`, et le module de
  contenu requis devient `<module>-en` (manifeste `<module>-en.json`) ; système, moteur et autres modules inchangés.

Produits : `monde/dist/<id>-en/` (base LevelDB + `world.json`), `monde/dist/<id>-en.zip`, `monde/dist/world-en.json`.
`--verifier --langue en` relit ce paquet avec les mêmes contrôles que le français (fuites, structure, liens vers
`modules/<module>-en/src`, chemins), et **échoue** en plus s'il reste une trace du module français (uuid, chemin,
drapeaux, réglage) ou si `core.moduleConfiguration` n'active pas `<module>-en`. Le module anglais doit avoir été
fabriqué (`npm run fabriquer-<monde>-en`) : ses `src/` et son fond d'écran sont ceux que la vérification lit.

Release : chaque workflow lance `npm run empaqueter-monde` puis `npm run empaqueter-monde -- --langue en` et publie
`world.json`, `<id>.zip`, `world-en.json` et `<id>-en.zip` (40k : `outils/empaqueter-module.mjs --monde monde/dist`
les recopie dans `dist/` en alignant `manifest` et `download` ; Warcraft, Veillées et Fénoir les recopient tels quels).
Adresse stable du manifeste anglais : `https://github.com/Hogun974/<dépôt>/releases/latest/download/world-en.json`.
Essais : `essais/empaqueter-monde.test.mjs` (manifeste, traduction, réglages, clés protégées, contexte).

## Ce qu'un tiers obtient

Il installe le système, nos modules (le `world.json` les déclare dans `relationships.requires`, avec l'adresse de leur
manifeste), puis le monde par son manifeste `https://github.com/Hogun974/<dépôt>/releases/latest/download/world.json`.
Au lancement : un seul utilisateur `Gamemaster` sans mot de passe, aucun message, aucun personnage de joueur ; les
scènes, journaux, tables et dossiers de nos modules déjà installés et rangés ; les guides du MJ IA ; les réglages de
conduite du MJ IA et les règles du jeu ; les modules tiers de `core.moduleConfiguration` à installer s'il les veut
(Foundry ignore ceux qui manquent). Il lui reste à donner sa clé d'API au MJ IA (trousseau), choisir fournisseur et
modèles, et régler voix et compagnons.

| Monde | À installer avant | Contenu livré |
| --- | --- | --- |
| La Kour — Kour Primaris (40k) | système impmal ≥ 4.1.0, modules lakour-40k, lakour-mj-ia, warhammer-lib | 11 scènes (une campagne, une aventure, un one-shot), 15 journaux (aides de jeu, aventures, fêtes, guides) + 2 guides du MJ IA, 7 tables (critiques, maladresses, origines, périls du Warp), dossiers, réglages impmal (`tableSettings`…) |
| La Kour — Les Tarides (Warcraft) | système dnd5e ≥ 6.0.6, modules lakour-warcraft, lakour-mj-ia | 11 scènes, 24 journaux (aides de jeu, aventure, campagne, donjon, fêtes, guides, listes de sorts, contrats, réputation…) + 2 guides du MJ IA, dossiers de compendiums dnd5e et Warcraft, réglages dnd5e (règles 2024, métrique, calendrier) |
| La Kour — Les Veillées de Brumecombe | système lakour-loups ≥ 0.10.2, modules lakour-veillees, lakour-mj-ia | la scène du village, 7 journaux (guides du joueur et du narrateur, variantes, veillées de fête) + 2 guides du MJ IA, la liste de lecture « Ambiances (MJ IA) », les règles de la veillée |

Modules tiers activés dans les mondes du serveur (facultatifs chez le tiers) : fr-core, fxmaster, sequencer, socketlib,
JB2A_DnD5e, dice-so-nice, calendaria, lib-wrapper, levels-3d-preview, 3ds-atlas ; pour Warcraft aussi babele,
dnd5e_fr-FR, item-piles, itempilesdnd5e, autoanimations.
