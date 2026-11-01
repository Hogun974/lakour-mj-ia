# Tour par tour — combats et scènes guidés pas à pas (40k et Warcraft)

Demande de Jordan (01/11/2026) : « Sur Warcraft et 40k il faut aussi du tour par tour avec aide au MJ. » Aux Veillées, la Table
de jeu guide déjà le MJ humain (le bouton de l'étape suivante encadré de pointillés, une ligne « Prochaine étape : … »). Même
chose ici pour les combats et les scènes d'**Imperium Maledictum** (`impmal`, 40k) et de **D&D 5e** (`dnd5e`, Warcraft), pour
le MJ humain SANS IA comme pour le MJ IA. Règle de parité : un seul mécanisme dans le moteur, les parties propres à chaque
système dans les adaptateurs.

## Où est quoi

| Fichier | Rôle |
|---|---|
| `scripts/tour-logique.js` | Logique **pure** (sans Foundry) : `etapeSuivanteCombat`, `actionsRestantes`, `depenser`, `distanceMetres`, `proposerAction`, `caseVers`, `rappelsDebutTour`, `situationJoueur`, tour de table (`nouveauTourDeTable`, `avancerTourDeTable`, `etapeTourDeTable`…). |
| `scripts/adaptateurs.js` | Partie `tour` de chaque adaptateur (`TOUR_IMPMAL`, `TOUR_DND5E`), même forme pour les deux : économie d'actions, fiche, attaques, vrais jets, résolution directe, application des dégâts, lecture des messages du système. |
| `scripts/tour-par-tour.js` | Branchement sur Foundry : classe `TourParTour` (état mis à plat, suivi du tour, gestes du MJ, compagnons, lecture du chat, tour de table, ce que voient le MJ IA, le panneau et le bandeau). |
| `scripts/apps/tour-par-tour.js` | Panneau du MJ (`PanneauTour`, ApplicationV2), bandeau des joueurs (`BandeauTour`), crochets (`brancherTourParTour`). |
| `templates/tour-par-tour.hbs`, `templates/bandeau-tour.hbs` | Gabarits. Style : fin de `styles/mj-ia.css` (`.lakour-mjia-tour`, `.lakour-mjia-etape`, `.lakour-mjia-bandeau-tour`). |
| `essais/tour-par-tour.test.mjs`, `essais/tour-mutations.test.mjs`, `essais/doublures/foundry-tour.mjs` | Essais (30) et doublure de Foundry. |

API : `game.modules.get("lakour-mj-ia").api.tour` (le `TourParTour`) et `api.tourParTour()` (ouvre le panneau).

## Le panneau du MJ

Bouton **bouclier** dans la barre de gauche (calque des jetons, MJ seulement, en 40k et Warcraft) ; il s'ouvre aussi seul au
début d'un combat (réglage client *Ouvrir le panneau Tour par tour au début d'un combat*). Il s'appuie sur le `Combat` de
Foundry sans le remplacer : le suivi d'un combat repris dans le traqueur de Foundry continue dans le panneau.

- **Préparer** : jetons de la scène pas encore au combat, avec cases à cocher (joueurs, compagnons, ennemis visibles cochés ;
  neutres, alliés et ennemis cachés non cochés ; figurants exclus). **Ajouter au combat** (crée le combat au besoin),
  **Lancer l'initiative** (`Combat#rollAll` : en D&D 5e le d20 + initiative du système, `Combat5e`, regroupements compris ; en
  Imperium Maledictum la formule du système, `@combat.initiative + @skills.reflexes.total/100`, sans dé), **Commencer**.
- **Tour en cours** : ordre du tour, portrait, PV (D&D 5e) ou blessures et critiques (IM), défense (CA ; IM : Réflexes et
  Mêlée), allure (IM), états. Ce qu'il lui reste : D&D 5e action, action bonus, réaction, mouvement en mètres ; IM action et
  déplacement. Ses attaques et pouvoirs en boutons qui lancent les **vrais jets** (D&D 5e : `activity.use()` ; IM :
  `setupWeaponTest`, `setupTraitTest`, `setupPowerTest`). Les cibles : distance en mètres, défense, PV, « à portée / portée
  longue / hors de portée » ; cliquer une cible la désigne aussi dans Foundry (`setTarget`), ce que lisent les jets du système.
- **Étape suivante en pointillés** : `etapeSuivanteCombat(etat)` → une ligne « Prochaine étape : … » et chaque bouton qui la fait
  encadré de pointillés animés (`button.lakour-mjia-etape`, même style qu'aux Veillées, sans animation si
  `prefers-reduced-motion`). Étapes : ajouter, initiative, commencer, cible (avec proposition), attaquer, toucher, dégâts,
  défense (IM), appliquer N dégâts à X, sauvegarde (concentration, DD), fin de l'effet, rappel (concentration, régénération),
  jet contre la mort, à terre, attente du joueur, compagnon IA, PNJ joué par le MJ IA, fin du tour → au suivant, nouveau round,
  fin du combat (victoire : tous les ennemis à terre ; défaite : tout le groupe à terre, sans mourant).
- Seuls les gestes utiles s'affichent (jet pour toucher, dégâts, esquive / sans opposition, appliquer, jet contre la mort, faire
  jouer le compagnon) ; « Fin du tour » et « Fin du combat » restent toujours là.

### Le tour d'un PNJ
Une **proposition déterministe, sans IA** (`proposerAction`) : l'adversaire debout le plus proche (égalité : par nom), la
meilleure attaque à portée selon les dégâts moyens (portée longue ou tir au contact : moitié) ; personne à portée : il se
rapproche (et frappe si l'allonge suffit après son mouvement). **Accepter** (recalculée au clic) : déplacement du jeton vers une
case libre voisine (`caseVers`), puis attaque **résolue par le système sans fenêtre** :
- D&D 5e : `activity.rollAttack({}, { configure: false })` contre la CA de la cible (critique, échec critique), puis
  `activity.rollDamage({ isCritical })` ; une activité de sauvegarde : `cible.rollSavingThrow`, dégâts pleins, moitié ou rien.
- IM : test d'attaque au d100 contre la valeur de la fiche, test opposé du défenseur (mêlée : le meilleur de Mêlée et Réflexes ;
  distance : Réflexes), règle du système (`OpposedTestResult` : DR attaquant − DR défenseur, égalité à la compétence la plus
  haute) ; dégâts = arme + DR de l'opposition.
Puis **Appliquer N dégâts à X** par la méthode du système (D&D 5e `actor.applyDamage(n)` ; IM `actor.applyDamage(n, { location:
"roll", message: true })` : localisation, armure, critiques). Le MJ peut aussi choisir lui-même cible et arme (vrais jets avec
fenêtre) ; le panneau suit alors le chat. Si le MJ IA est en séance et joue les PNJ (réglage *jouerPnj*), l'étape dit « le MJ IA
le joue » et le panneau prévient de ne pas accepter en double ; `reactions.js` reste inchangé.

### Le tour d'un compagnon IA
**Hors séance du MJ IA** (comme aux Veillées), à son tour, le compagnon agit seul : son cerveau annonce l'action (« C'est ton
tour de combat. Ce que fait ton personnage : … ») — sans clé, budget atteint ou fournisseur factice, l'annonce est l'action
elle-même —, puis la proposition est jouée et les dégâts appliqués, et le tour passe. Coût : compteur *Compagnons hors séance*,
borné par le budget. **En séance**, rien ne change : `reactions.js` lui fait déclarer son action et le MJ IA la résout.

### Le tour d'un joueur
On l'attend (« Tour de X : on attend son action », ligne grisée). Le panneau lit le chat (`lireMessage` de l'adaptateur) :
- D&D 5e : carte d'utilisation (activité, activation → action, bonus ou réaction prise), jet d'attaque (`type: "attack"`,
  touché contre la CA de la cible désignée, critique), jet de dégâts (`type: "damage"`) → « Appliquer N dégâts à X ».
- IM : test d'arme (`type: "test"`) → l'action est prise ; test opposé (`type: "opposed"`, suivi aussi à sa mise à jour) →
  « Défense de X » (le MJ fait esquiver ou laisse sans opposition un PNJ ; un joueur défenseur répond lui-même), puis les
  dégâts calculés par le système → « Appliquer » (la méthode du message : `message.system.applyDamage()`).
- IM : une action de combat choisie sur la fiche (`system.combat.action` : viser, charger, courir…) prend l'action du tour.

### Rappels
Début de tour (`rappelsDebutTour`) : effet à durée écoulée → « Fin de l'effet » (le supprime) ; concentration (D&D 5e) ;
régénération (D&D 5e, objet nommé *Régénération*) ; états, effets en cours et actions légendaires des autres affichés. Après
des dégâts sur une créature concentrée (D&D 5e) : « Jet de sauvegarde de X (concentration, DD max(10, dégâts/2)) »
(`actor.rollConcentration`). Créature à 0 PV : D&D 5e, personnage → jets contre la mort (`rollDeathSave`, un par tour), PNJ →
mort ; IM, PNJ au maximum de blessures → hors de combat, plus de critiques que son maximum → mort. Réaction (D&D 5e) prise au
tour d'un autre : rendue au début de son propre tour.

### Distances et mouvement
`distanceMetres` : de bord à bord (allonge), règle de diagonales de la scène (`scene.grid.diagonals`, sinon le réglage
`core.gridDiagonals`), unités de la scène en mètres (pieds × 0,3 : 5 pi = 1,5 m, comme `CONFIG.DND5E.movementUnits`). Mouvement
fait ce tour : l'historique du jeton (`token.movementHistory`, mesuré par `measureMovementPath`, effacé par Foundry au début de
chaque tour). D&D 5e : vitesse de marche de la fiche en mètres ; IM : le système ne mesure pas le mouvement (allure lente,
normale, rapide, véloce) : on montre la ressource « déplacement » et l'allure.

## Côté joueurs
Un bandeau léger en haut de l'écran : « ⚔️ Round 3 — À toi de jouer ! » avec ses actions restantes, son mouvement (D&D 5e) et
ses attaques en boutons (ses vrais jets, sur son navigateur), **Fin de mon tour** (demande au MJ actif par le canal du module,
qui vérifie qu'il tient le combattant actif) ; sinon « Au tour de X, puis toi » ou « Au tour de X ». Quand son tour (ou sa
parole au tour de table) arrive, il est **appelé** une fois : un tintement chez lui seul et le titre de l'onglet qui clignote
s'il regarde ailleurs (`scripts/appel.js`, réglage client *M'appeler quand c'est à moi* ; pas de second son si un thème de
combat de Foundry joue déjà). Votes de groupe et choix secrets l'appellent de même. Réglage du monde *Seul le
combattant actif peut bouger* (désactivé par défaut) : pendant un combat commencé sur la scène, un joueur ne bouge que le jeton
dont c'est le tour ; le MJ n'est jamais bloqué.

## Hors combat : le tour de table
Bouton du panneau (ou outil `tour_de_table` du MJ IA). La parole passe à chaque personnage présent (jetons visibles : joueurs,
puis compagnons IA), même mise en évidence de l'étape suivante. Le bandeau du joueur dit « À toi de décrire ce que fait ton
personnage » ; son message public dans le chat, ou **J'ai fini** / **Je passe**, passe la parole ; le MJ peut aussi presser
**A parlé** / **Passe**. Un compagnon IA parle quand vient son tour. État : réglage monde `tourDeTable` (écrit par le MJ actif).
**Avec le MJ IA en séance**, il attend : `MoteurMJ.vider()` garde les messages tant que le tour de table retient la parole, les
compagnons ne réagissent pas hors de leur tour ; à la fin, « [Tour de table N terminé] … raconte la suite » lui est signalé et il
peut relancer un tour (`tour_de_table « commencer »`).

## MJ IA
- Même état, même fonction d'étape : `etatDuJeu()` ajoute « Tour : X ; étape suivante : … » en combat et l'état du tour de table.
- Consigne ajoutée au prompt système (40k, Warcraft) pour rester cohérent avec ce guide.
- Outils : `combat_etat` (lecture seule : étape, actif, actions restantes, attaques et portées, distances, défenses, ordre,
  proposition) et `tour_de_table` (commencer, arrêter, état). Les outils existants (`lancer_combat`, `passer_tour`,
  `jet_compagnon`…) ne changent pas.

## Ce qui est éprouvé (npm run essais)
- `etapeSuivanteCombat` pour chaque situation, dans les deux systèmes ; actions restantes et dépenses ; distances (unités,
  diagonales, grands jetons) ; moyenne des formules ; proposition des PNJ (plus proche, meilleure attaque, portée longue, tir au
  contact, rapprochement, à terre ignoré, déterminisme) ; case d'approche ; rappels ; ce que voit un joueur ; tour de table.
- Adaptateurs : fiche, attaques et portées en mètres, lecture des messages, résolution directe (D&D 5e : touché, raté,
  critique ; IM : test opposé, parade en mêlée) ; même forme pour les deux.
- Combat complet simulé avec doublures, **dans les deux systèmes**, joueur (ses vrais messages de jets), compagnon IA (seul),
  PNJ (proposition acceptée), en suivant à chaque fois l'étape en pointillés, jusqu'à la victoire, sans IA.
- Concentration après dégâts, réaction rendue à son tour, mouvement fait, suivi périmé ignoré, panneau, bandeau, rapport pour
  le MJ IA, *seul l'actif bouge*, le MJ IA qui attend la fin du tour de table, outils.
- Mutations (`tour-mutations.test.mjs`) : 17 règles cassées une à une, toutes attrapées.

## Ce qui ne se vérifie qu'en jeu
- **Rendu** du panneau et du bandeau dans Foundry v14 (aperçu PNG fait sur une maquette avec la vraie feuille de style) ;
  placement du bandeau au-dessus du canevas ; bouton de la barre de gauche.
- **D&D 5e 6.0.6** : forme réelle des messages (carte d'utilisation : `system.activity.uuid` ou `flags.dnd5e.activity` ;
  `system.targets[].ac/uuid` des jets d'attaque et de dégâts), `rollAttack` / `rollDamage` sans fenêtre (`configure: false`),
  sorts préparés (`system.prepared`, `method`), allonge des armes, `rollConcentration({ target })`, effets à durée
  (`duration.remaining`, `expired` en v14), récupération des actions légendaires (faite par le système).
- **Imperium Maledictum 4.1.0** : `message.system.test.item` du test, `performResponse` / `applyDamage` du test opposé, mise à
  jour du message opposé ; `getSkill` des armes ; les **repères de portée en mètres** (`PORTEES_IMPMAL` : immédiate 2, courte 10,
  moyenne 30, longue 100, extrême 300) et de **mouvement par allure** (`MOUVEMENT_IMPMAL` : 4, 8, 12, 16 m) ne viennent pas du
  système (il ne mesure ni l'un ni l'autre) : à confirmer avec le livre de base, le MJ tranche. Pas de couvert détecté.
- **Foundry v14** : `token.movementHistory` + `measureMovementPath` pour le mouvement fait ; `setTarget` ; un joueur bloqué par
  *Seul le combattant actif peut bouger* (`preMoveToken`, `preUpdateToken`) ; `Combat#endCombat` demande confirmation.
- Le déplacement automatique d'un PNJ ou d'un compagnon (`token.update({ x, y })`) ignore les murs : il vise la case libre la
  plus proche à côté de la cible, à vol d'oiseau.
