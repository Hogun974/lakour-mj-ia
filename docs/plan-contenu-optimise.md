# Plan — tirer tout Foundry v14 pour les trois mondes

Demande de Jordan (01/11/2026) : « exploiter tout le potentiel de FVTT pour ces 3 mondes, planifier un contenu optimisé aux petits
oignons, regarder ce qui se fait, se baser sur 40k (plus poussé) pour améliorer Warcraft, et aussi le loup-garou ».

Sources : veille du 01/11/2026 (notes de version Foundry 13.341, 14.352, 14.354 et 14.359 ; fiches de modules ; Phandelver and
Below de WotC, ImpMal Core de Cubicle 7, Restored Keep de Tom Cartos) et audit des trois dépôts.

## Constats

- **Warcraft** est au niveau de 40k côté MJ (aventure, campagne, cartes, PNJ, jetons, style plat/relief). Côté joueur, il est
  loin derrière :

  | Couche joueur | 40k | Warcraft |
  |---|---|---|
  | Talents / dons | 58 talents | 6 dons d'origine |
  | Effets automatisés | 37 à script | 14 simples |
  | Pouvoirs / sorts maison | 18 | 0 |
  | Arsenal | 46 armes, 8 protections, champs de force, munitions, modifications | 9 objets |
  | Augmétiques | 17 | 0 |
  | Afflictions | 29 (corruptions, blessures) | 0 |
  | Patronage | 7 devoirs, 14 atouts/handicaps | 0 |

- **Les 33 scènes des trois mondes** :
  - ont des murs, des portes et des lumières ;
  - n'ont **aucun son d'ambiance, aucune note, aucune région, aucune tuile** ;
  - n'ont qu'un seul niveau.
- **Les journaux** (65 pages en tout) : **aucun lien `@UUID`**, aucune image, des handouts d'une page.
- **La référence premium**, Phandelver de WotC, c'est :
  - 38 scènes entièrement préparées (murs, lumières, sons, météo) ;
  - 550 pages de journal liées ;
  - des acteurs avec leurs effets ;
  - 13 tables ;
  - le tout livré en Adventure.
- **ImpMal Core** de Cubicle 7, c'est 87 tables et une carte de secteur avec épingles de journal.
- **Aucun loup-garou n'existe sur Foundry** : les Veillées n'ont pas de concurrent.

## Ce que Foundry v14 offre et que nous n'utilisons pas

| Fonction native | Usage chez nous |
|---|---|
| **Comportements de région** (13 au total) : Display Scrolling Text, Teleport Token (y compris entre scènes), Pause Game « Once », Adjust Darkness Level, Apply Active Effect, Toggle Behavior, Execute Script… | Lore qui s'affiche en entrant dans une pièce, escaliers et trappes qui téléportent, pièges et plaques, zones toxiques ou sacrées, nuit qui tombe |
| **Sons d'ambiance de scène** (rayon, murs, fondu) et **lumières « Sound Reactive Pulse »** | Forge, foule, pluie, mer, feu de cheminée placés dans la pièce ; le moteur a déjà 9 sons (`assets/sons`) |
| **Notes de carte** (épingles vers une page de journal) | Chaque lieu clé d'aventure épinglé sur sa page du guide |
| **Liens `@UUID`** et enrichers dnd5e (`[[/check …]]`, `[[/save …]]`) | Journaux du MJ reliés aux PNJ, scènes et tables ; jets cliquables |
| **Transitions de scène** et **Screen Shake** (v14) | Passage nuit/jour aux Veillées, révélation d'une mort, explosion |
| **Active Effects V2** (expiration, effets portés en compendium) | Afflictions, maladies et blessures de Warcraft et 40k |
| **Anneaux de jeton dynamiques** | Couleur par faction (déjà en partie fait) |
| **Adventure + `quickstart`** (v14) | Aventures livrées en un clic à la création d'un monde |
| **Scene Levels** (v14) | Plus tard : un donjon sur plusieurs niveaux. Cohabitation avec 3D Canvas à tester d'abord |

## Modules gratuits proposés

Rien n'est installé sans le feu vert de Jordan, puis un essai sur LaKour.

| Module | Pour | Compatible v14 | Avis |
|---|---|---|---|
| Sequencer + JB2A gratuit | Animations (sorts, tirs, explosions) | Oui | Sûr, gros gain visuel |
| FXMaster | Météo et particules | Oui | Sûr |
| Calendaria | Date, météo, lunes | Oui (v14 seulement) | Jeune mais actif |
| Item Piles | Butin et marchands (Warcraft) | Oui ; impmal non confirmé | Warcraft d'abord |
| Tidy 5e Sheet | Fiche dnd5e plus lisible | Oui, dnd5e 6.0.6 | Au goût des joueurs |
| Automated Animations | Animations automatiques dnd5e | Oui (v14) | Après Sequencer |
| Visual Polls | Vote illustré | v14, mais en version 0.0.2 | Inutile : les Veillées ont mieux |
| **À éviter** : Midi-QOL (très intrusif, support de dnd5e 6 ambigu), Seasons & Stars (v13 seulement), tout module qui reposait sur les Measured Templates (supprimés en v14) | — | — | — |

## Le plan, par chantiers

Chaque chantier est une pièce du puzzle (fichiers séparés) : plusieurs avancent en parallèle, puis tout est assemblé,
fabriqué, testé et déployé ensemble. Un seul redémarrage de LaKour suffit, avec le feu vert de Jordan.

### Vague 1 — le socle, pour les trois mondes et pour Warcraft

1. **Scènes vivantes (moteur, les 3 mondes)** — `lakour-mj-ia/scripts/cartes.js` et `cartes-rendu.js`. Le plan accepte :
   - `sons` : sons d'ambiance natifs ;
   - `zones` : régions natives (texte de lore, téléportation, pause unique, obscurité, effet actif) ;
   - `notes` : épingles vers un journal.

   Il déduit aussi des sons par défaut des éléments nommés (cheminée → feu, forge → forge, eau → mer…). Les 33 scènes en
   profitent dès leur prochaine fabrication.
2. **Warcraft, dons et afflictions** — `contenu/dons.mjs` et `contenu/afflictions.mjs` : dons généraux et de style de combat
   maison avec effets actifs, blessures persistantes, maladies et corruption gangrénée. C'est l'équivalent des talents et
   afflictions de 40k.
3. **Warcraft, arsenal** — `contenu/arsenal.mjs` : armes et armures de faction, munitions, prothèses gnomes et gobelines (les
   augmétiques), objets peu communs et rares avec harmonisation et effets.
4. **Warcraft, sorts et affiliations** — `contenu/sorts.mjs` et `contenu/affiliations.mjs` :
   - sorts maison : chamanisme, Lumière, gangrène, druidisme ;
   - affiliations (Kirin Tor, Cartel, Cercle cénarien, Lame Ardente…) en dons avec rang et faveur, l'équivalent du patronage
     de 40k.
5. **Journaux liés (40k et Warcraft)** — aventure, campagne et guides :
   - liens `@UUID` vers les PNJ, scènes, tables et objets ;
   - jets cliquables dnd5e ;
   - handouts découpés page par page.
6. **40k, tables du MJ** — `contenu/tables-mj.mjs` : Patrons, missions, complications d'enquête, butin de ruche, rumeurs par
   monde, sur le modèle des 87 tables de Cubicle 7.

### Vague 2 — l'immersion

7. **Les Veillées** : transition et fondu natifs à la tombée de la nuit, écran qui tremble à la révélation d'une victime, et
   des sons dans la scène (le village a déjà 30 lumières).
8. **Les 3 mondes** : notes de carte pour chaque lieu clé d'aventure, et régions de lore sur les cartes d'aventure.
9. **Modules gratuits** (après le feu vert) : Sequencer + JB2A et FXMaster d'abord, puis Calendaria et Item Piles (Warcraft).
   Le MJ IA apprend à s'en servir (outils d'animation et de météo).

### Vague 3 — le grand format

10. **Adventure + `quickstart`** : chaque aventure livrée en un paquet, proposée à la création du monde.
11. **Un donjon à niveaux** (Scene Levels) par monde, après avoir testé la cohabitation avec 3D Canvas.
12. **Parité continue** : chaque fonction ajoutée à un monde est examinée pour les deux autres (règle de parité).

## Règles

- Textes **originaux** : on ne recopie rien de WotC, Cubicle 7 ou Thiercelieux.
- Les médias restent dans le dossier du module.
- Chaque chantier vient avec ses essais.
- Les compendiums changés demandent **un redémarrage** de LaKour : les changements sont groupés, et on ne redémarre qu'avec le
  feu vert de Jordan, quand personne ne joue.

## Avancement (nuit du 1er au 2 novembre 2026)

Fait, testé, validé contre Foundry v14 et déployé (redémarrage de LaKour le 02/11 à 00:10, sauvegarde
`avant-vague2-20261102-001000.tgz`) :

| Chantier | Où | État |
|---|---|---|
| 1. Scènes vivantes (sons, zones, notes) | moteur + 3 mondes | fait ; outils `creer_scene` (sons, zones), `zone_scene`, `epingle`, `lieux_scene` |
| 2. Dons (22) et afflictions (17) | Warcraft | fait |
| 3. Arsenal (44 objets) | Warcraft | fait |
| 4. Sorts (19) et affiliations (8 + 6 atouts/handicaps) | Warcraft | fait, listes de sorts de classe |
| 5. Journaux liés et handouts | 40k (225 liens), Warcraft (184 liens, 82 jets) | fait ; `montrer_aide` pour le MJ IA |
| 6. Tables du MJ (14) | 40k | fait |
| 7. Veillées : immersion v14, fiches à la dnd5e | Veillées | fait |
| 8. Épingles et zones des cartes d'aventure | 40k, Warcraft | fait ; installateur qui raccorde et complète |
| 10. Adventure + quickstart | Warcraft | fait |
| Fiche La Kour (inspirée de dnd5e) | 40k | fait |
| Une icône par objet | 40k (367), Warcraft (205) | fait |
| Sous-classes d'Azeroth (8, 44 capacités) | Warcraft | fait |
| Anneaux de jeton par faction, icônes des capacités | Warcraft | fait |
| Création de personnage réparée (factions, équipement, munitions) | 40k + MJ IA | fait |
| Adventure + quickstart | 40k | fait |
| Anneaux par faction, icônes des objets des PNJ | 40k (49 PNJ, 203 icônes), Warcraft (52 PNJ) | fait |
| Village de Brumecombe épinglé (bâtiments → pages de règles) | Veillées | fait |
| Guides et aides de jeu visibles après installation (clearOwnership) | 3 mondes | corrigé |
| Relecture des chemins « vrai Foundry » (installateurs, création, fiches, immersion) | 3 mondes + MJ IA | corrigé |
| One-shot « Trois jours d'avance » (spatioport, 3 cartes) | 40k | fait |
| One-shot « Une nuit aux Deux Lanternes » (Âprefange, 3 cartes) | Warcraft | fait |
| 4 rôles et 2 métiers (Loup des roseaux, Louvetier, Pêcheur de nuit, Dame du gué, Ramoneuse, Éclusière) | Veillées | fait |
| 11. Cartes à étages (Scene Levels) | moteur (`creer_scene`, plans) | fait côté moteur ; aucune carte à étages livrée avant essai en vrai |

Déploiements : 00:10 (vague 2), 00:26 (vague 3), 01:11 (one-shots), 01:30 (rôles des Veillées), plus des mises à jour à chaud, chacun précédé d'une sauvegarde dans
`/home/amp/sauvegardes-foundry/`. Restent : modules gratuits (feu vert de Jordan), donjons à niveaux (Scene Levels, à
tester avec 3D Canvas), essais en vrai de tout ce qui précède.
