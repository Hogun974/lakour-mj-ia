# Coût d'une partie — où partent les jetons, ce qui a été réduit

Point de départ : une partie complète des Veillées (4 tours, 10 compagnons IA, niveau Le Pacte, Le Village, la Gazette de la
lune), menée seule par le narrateur Claude Opus 5.5, compagnons Claude Haiku 5.5, le 7 novembre 2026 (moteur 0.44.1) :
**3,45 $**. Compteur de la séance : entrée non cachée 441 948 jetons, lecture du cache 5 280 561, écriture du cache 411 905,
sortie 45 102.

Tout ce qui suit se mesure **hors ligne**, sans aucun appel à un modèle : `node outils/mesurer-prompt.mjs`.

## Où partaient les jetons

Aux prix de `scripts/constantes.js` (Opus 5.5 : entrée 4 $, lecture du cache 0,20 $, écriture du cache 5 $, sortie 20 $ par
million de jetons ; Haiku 5.5 : 0,10 $ et 0,50 $) :

| Poste | Jetons | Coût | Part |
|---|---|---|---|
| Écriture du cache (narrateur) | 411 905 | 2,06 $ | 60 % |
| Lecture du cache (narrateur) | 5 280 561 | 1,06 $ | 31 % |
| Sortie du narrateur (réflexion comprise) | environ 15 000 | environ 0,30 $ | 9 % |
| Compagnons (entrée non cachée, sortie) | 441 948 + environ 30 000 | environ 0,06 $ | 2 % |

Les compagnons ne comptent presque pas : chaque appel est court (leur fiche, ce qu'ils savent, le chat récent) et Haiku est
quarante fois moins cher qu'Opus. Le coût est celui du narrateur, et surtout de son **cache**.

Comment le cache facture : chaque appel envoie, dans l'ordre, les **outils**, le **prompt système** puis tout le **fil**. Ce qui
a déjà été envoyé il y a moins de cinq minutes se relit à 0,20 $ le million ; ce qui est nouveau s'écrit à 5 $. D'où trois
fuites :

1. **Le préfixe (outils + prompt système), relu à chaque appel.** Aux Veillées, 24 400 jetons estimés, dont 19 300 pour les
   descriptions de 47 outils : la moitié servent à l'aventure (cartes, jetons, PNJ, lumières, portes, zones, figurants, 3D,
   votes de groupe, images) et jamais aux Veillées, où le système met lui-même le plateau en scène. Le prompt système portait
   aussi les consignes de dés, de cartes, de plateau, d'expérience, la liste des cartes prêtes, et les consignes de toutes les
   variantes, jouées ou non.
2. **Ce qui entre dans le fil à chaque tour est écrit une fois, puis relu à chaque appel suivant.** Un jeton ajouté au début de la
   partie se paie ainsi près de trois fois son prix d'écriture. L'état du jeu des Veillées y mettait à chaque tour la carte du
   village case par case, ses 28 repères, les présents avec leurs cases : 5 400 caractères (1 600 jetons) par tour, dont le
   narrateur n'a que faire (il ne déplace aucun jeton).
3. **Les réécritures complètes.** Le cache expire après cinq minutes sans appel : une nuit (`loups_nuit` attend chaque rôle) ou
   un vote qui dure, et tout le préfixe et tout le fil se réécrivent à 5 $. Et à la fin de la partie, la liste des outils changeait
   (`ecrire_chronique` revenait) : le préfixe changeant, le dénouement réécrivait tout le fil. Le modèle de la partie type
   (ci-dessous) ne retrouve les 411 905 jetons écrits qu'avec deux réécritures de ce genre en plus de celle de la fin.

Aux Veillées, l'étape « [Mise en place] » coûtait en outre un appel de plus par réponse aux joueurs (pour répondre « plateau
prêt ») : la partie mesurée, menée par le pilote, ne la faisait pas, une partie avec des joueurs humains si.

## Ce qui a changé

| Fichier | Changement |
|---|---|
| `scripts/outils.js` | `OUTILS_HORS_VEILLEES` : 23 outils du plateau et de l'aventure ne sont plus proposés aux Veillées (47 → 24 outils). Restent les `loups_*`, le secret (`message_prive`), la chronique hors partie, les aides, les tables, les compendiums, l'ambiance sonore, la pause, les compagnons. |
| `scripts/contexte.js` | Prompt système propre au jeu : aux Veillées, plus de consignes de dés, cartes, plateau, PNJ, expérience, votes de groupe, portraits, 3D, ni de liste de cartes prêtes ; consigne des compagnons sans combat (`CONSIGNE_COMPAGNONS_VEILLEES`). État du jeu des Veillées sans carte, pièces, repères ni présents case par case. Les autres jeux gardent leur prompt **au caractère près**. |
| `scripts/adaptateurs.js` | Consignes des Veillées en morceaux (`CONSIGNES_LOUPS`) : le prompt d'une partie distribuée ne garde que les variantes qui y jouent (`consignesPour`, `partieDesVeillees`). Règle prudente : un morceau ne sort que si l'on **sait** que sa variante n'est pas en jeu ; sans partie connue (préparation, fin, système ancien, secrets illisibles), tout entre. `consignes` reste le texte complet. |
| `scripts/personnalites.js` | `decrirePersonnalite(p, { scenario })` : sans le degré d'improvisation du scénario aux Veillées (il n'y a ni scénario ni `modifier_scenario`). |
| `scripts/moteur.js` | Liste des outils figée par séance et par partie (`this.outils`, comme le prompt système) : le préfixe ne change plus à la fin d'une partie. Pas de mise en place aux Veillées. `journalAppels` : les 400 derniers appels du narrateur (heure et jetons), en mémoire. |
| `scripts/fournisseurs/anthropic.js` | Points de cache explicites sur le dernier outil et sur le prompt système, gardés **une heure** (`CACHE_PREFIXE`) ; le fil garde le point automatique de cinq minutes. Une nuit longue n'oblige plus qu'à réécrire le fil. Lecture des écritures d'une heure (`cacheEcriture1h`). |
| `scripts/constantes.js` | `coutDe` compte les écritures d'une heure à deux fois l'entrée (au lieu de 1,25). |

Rien n'a changé dans ce que voient les joueurs, ni dans les secrets : les consignes de paroles encadrées, de `message_prive`,
des compagnons (« Ne lui souffle JAMAIS un secret »), de la composition jamais annoncée, des Masques, de la peste noire restent
mot pour mot ; seuls disparaissent des outils et des consignes que les Veillées n'emploient pas.

## Mesure avant / après

`node outils/mesurer-prompt.mjs` — avant : la version 0.44.1 (commit `1b6c912`, extraite de git) ; après : la copie de travail.

Préfixe envoyé à chaque appel du narrateur (jetons estimés) :

| Jeu | Outils | Jetons outils | Jetons système | Préfixe | Économie |
|---|---|---|---|---|---|
| Veillées, préparation (avant la distribution) | 48 → 25 | 19,5 k → 9,2 k | 4,8 k → 3,4 k | 24,3 k → 12,6 k | 48 % |
| Veillées, sans variante (classique) | 47 → 24 | 19,3 k → 9,1 k | 5,0 k → 2,9 k | 24,4 k → 12,0 k | 51 % |
| Veillées, Le Pacte + Le Village + Gazette | 47 → 24 | 19,3 k → 9,1 k | 5,0 k → 3,2 k | 24,4 k → 12,3 k | 50 % |
| Warcraft (dnd5e) | 54 | 19,4 k | 3,3 k | 22,7 k | identique |
| 40k (impmal) | 55 | 19,6 k | 3,3 k | 22,9 k | identique |
| Fénoir (lakour-survie) | 68 | 25,2 k | 4,4 k | 29,7 k | identique |

État du jeu d'un tour aux Veillées (Le Pacte, carte du village) : 1,6 k → 0,4 k jetons.

Partie type des Veillées (Opus 5.5 narrateur, Haiku 5.5 compagnons) :

| | Appels | Cache lu | Cache écrit (5 min + 1 h) | Sortie | Narrateur | Compagnons | Total |
|---|---|---|---|---|---|---|---|
| Pilote, avant | 79 | 5 319 k | 395 k + 0 k | 15 k | 3,34 $ | 0,06 $ | **3,40 $** |
| Pilote, après | 79 | 2 973 k | 104 k + 25 k | 15 k | 1,61 $ | 0,06 $ | **1,67 $** |
| Avec joueurs humains, avant | 114 | 8 949 k | 421 k + 0 k | 22 k | 4,33 $ | 0,06 $ | **4,39 $** |
| Avec joueurs humains, après | 79 | 2 973 k | 104 k + 25 k | 15 k | 1,61 $ | 0,06 $ | **1,67 $** |

L'économie tient quel que soit le nombre d'attentes de plus de cinq minutes (la grandeur la moins sûre du modèle) :

| Attentes | Avant | Après | Économie |
|---|---|---|---|
| 0 | 2,73 $ | 1,42 $ | 48 % |
| 2 | 3,40 $ | 1,67 $ | 51 % |
| 4 | 4,08 $ | 1,92 $ | 53 % |
| 6 | 4,75 $ | 2,16 $ | 54 % |

Soit, pour la partie du 7 novembre, **environ 1,70 $ de moins (3,45 $ → 1,70 $ environ)** ; avec des joueurs humains (une
mise en place par réponse), de l'ordre de 4,40 $ → 1,70 $.

## Méthode

- **Jetons estimés** : caractères / 3,5 (`JETONS_PAR_CARACTERE`), pour du français mêlé de JSON (les schémas des outils). Le
  compte exact demande l'API (`messages.count_tokens`, un appel réseau) ; l'estimation est la même avant et après, elle suffit à
  comparer. Les outils sont comptés tels que l'API les reçoit (`name`, `description`, `input_schema` en JSON).
- **Ce qui est compté** est construit par le code du moteur lui-même (`promptSysteme`, `outilsDuSysteme`, `etatDuJeu`), sur une
  doublure de Foundry : 10 compagnons au tour 2, une partie classique ou la partie du Pacte, la carte du village lue dans le
  dépôt des Veillées s'il est à côté (`../lakour-veillees`, lecture seule ; sans lui, l'état du jeu est compté sans carte).
  Les mondes d'aventure sont comptés sans module tiers ni carte prête ni mémoire : leur prompt n'a pas changé, seule l'égalité
  avant / après y est vérifiée.
- **La version de référence** est extraite de git (`git show`) dans un dossier temporaire, effacé à la fin ; `--avant <réf>`
  en prend une autre, `--json` donne les chiffres bruts.
- **La partie type** (`PARTIE_TYPE`, `simulerPartie`) rejoue les appels d'une partie et ce que le cache lit et écrit à chacun :
  35 réponses du narrateur, 2,25 appels par réponse, 300 jetons de messages par réponse, 300 jetons de résultats d'outils par
  appel qui en appelle, 190 jetons de sortie par appel, deux attentes de plus de cinq minutes, le préfixe écrit à l'ouverture
  et au fil neuf de la partie. Calée sur la partie du 7 novembre : avant, elle redonne 5 319 k lus (mesuré : 5 281 k), 395 k
  écrits (mesuré : 412 k), 3,40 $ (mesuré : 3,45 $). Les compagnons sont repris du compteur mesuré, inchangés.

## Ce qui est laissé, volontairement

- **Le fil garde cinq minutes de cache.** Le passer à une heure supprimerait les réécritures après une nuit longue, mais
  rendrait toutes les écritures 60 % plus chères (2 fois l'entrée au lieu de 1,25) : rentable seulement si les attentes de
  plus de cinq minutes sont fréquentes, ce que la mesure hors ligne ne peut pas dire. `journalAppels` le dira à la prochaine
  partie en vrai : dans la console du MJ, `game.modules.get("lakour-mj-ia").api.moteur.journalAppels` ; un appel dont
  `cacheEcriture` approche tout le fil après un long silence est une expiration.
- **Le fil n'est pas résumé plus tôt.** La compaction de l'API (à 150 000 jetons) suffit : une partie type finit vers
  55 000 jetons. Résumer avant, ce serait risquer d'abîmer la distribution secrète, qui vit dans le fil.
- **Les descriptions des outils des Veillées** (`loups_distribuer` 4 700 caractères, `loups_rejouer` 3 400, `loups_composer`
  2 600…) restent entières : elles portent les règles de la composition et de la nuit.
- **Le Registre du greffier** reste dans l'état du jeu (20 lignes au plus) : le narrateur s'en sert pour animer le débat.
- **Les compagnons** ne sont pas touchés : 2 % du coût.
- **Warcraft, 40k, Fénoir** gardent leur prompt et leurs outils ; ils profitent du point de cache d'une heure sur le préfixe et
  de la liste des outils figée par séance.
- **OpenAI** : rien à changer (son cache est automatique et suit le même préfixe, désormais stable).

## Les essais

`essais/cout-prompt.test.mjs` (doublure de `outils/mesurer-prompt.mjs`, fournisseur doublure, aucun appel payant) : aux
Veillées, aucun outil d'aventure dans la liste envoyée et tout outil nommé par le prompt est proposé ; préfixe identique d'un
appel à l'autre pendant une partie, fin comprise ; morceaux des variantes absentes hors du prompt, tous présents sans partie
connue ; consignes de secret présentes ; état du jeu sans carte ; points de cache ; prix des écritures d'une heure ; et
quinze mutations du moteur, chacune détectée.

## Fénoir : le marché, les savoirs, le moral (lots du 2026-11-13)

`node outils/mesurer-prompt.mjs --avant bd0248b` : douze outils de plus, regroupés par `action` (un outil par famille, pas un par
fonction de l'API : 40 fonctions du système derrière 12 outils), descriptions et schémas resserrés (un troc : une seule liste de
biens signés, + reçu, − donné ; le sens moral s'ajuste par `survie_acte_moral`, pas par `survie_esprit`).

| Fénoir | Outils | Jetons outils | Jetons système | Préfixe |
|---|---|---|---|---|
| avant (`bd0248b`) | 71 | 26 597 | 4 506 | 31 103 |
| après | 83 | 31 773 | 4 809 | 36 582 (+18 %) |

Les autres mondes gardent leur préfixe au caractère près (Veillées, Warcraft, 40k : « identique »). Le préfixe se garde une heure
au cache : à la partie type (79 appels), environ 0,09 $ de lecture et 0,04 $ d'écriture de plus, soit de l'ordre de 0,13 $.

L'état du jeu de chaque tour ne dit les nouveautés que quand elles existent (une ligne se tait quand elle n'a rien à dire) : sur la
doublure des essais, 664 jetons avant, 708 après sans rien de neuf en jeu, 1 152 avec tout en jeu (marché, porte, tributs, votes,
savoirs, cyclone vécu, préjugés des PNJ présents).
