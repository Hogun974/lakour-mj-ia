# Captures d'écran attendues

Les fichiers PNG de ce dossier illustrent le README (bandeau et sections), les tutoriels (`TUTORIEL.md`, `TUTORIAL.md`)
et le manifeste du module (`media`). Ils ne sont pas encore là : voici ce que chacun doit montrer et comment l'obtenir
dans Foundry VTT v14, dans un monde où `lakour-mj-ia` est actif (le monde Warcraft convient pour la plupart ; les
Veillées pour les compagnons). Format conseillé : 1600 × 900 environ, PNG, **sans nom de joueur réel, sans clé d'API
visible, sans adresse de serveur dans la barre du navigateur** (recadrer). Le fournisseur **factice** suffit pour
presque tout : aucune clé, aucun coût. Une seule capture par fichier, la même pour les deux tutoriels (interface en
français de préférence).

| Fichier | Où elle sert | Ce qu'il montre | Comment l'obtenir |
|---|---|---|---|
| `console.png` | README, tutoriels § 9, manifeste (couverture) | La console du MJ IA (personnalité, Démarrer / Terminer la séance, coût estimé, pilote) et une narration du MJ IA dans le chat. | Réglages › MJ IA › Configurer › fournisseur **factice** ; chapeau de magicien dans la barre de gauche › Démarrer la séance ; un joueur écrit « Nous entrons dans la taverne. » ; capturer console et chat. |
| `plateau.png` | README, manifeste | Une carte créée par le MJ IA avec ses murs, lumières et jetons posés, et le message qui l'accompagne. | En séance (factice) : souffler `!outil creer_scene {…}` avec **tous** les champs du schéma (nom, largeur, hauteur, lumiere, pieces, ouvertures, lumieres, elements, sons, zones, etages, escaliers, image: false, description_image, activer), sinon l'outil refuse l'appel ; puis afficher la scène et poser deux ou trois jetons. Avec une vraie clé, demander simplement « amène-nous dans une auberge ». |
| `carnet.png` | README, manifeste | Le Carnet de campagne, onglet Horloges : une horloge en camembert, une jauge à seuils, une réputation en paliers, l'œil de visibilité. | Livre ouvert dans la barre de gauche › Horloges ; créer trois éléments à la main (ou par `!outil horloge {...}` en factice). Monde Warcraft. |
| `tour-par-tour.png` | README, manifeste | Le panneau Tour par tour pendant un combat : tour en cours, actions restantes, attaques, cibles avec distances, bouton de l'étape suivante encadré de pointillés. | Monde Warcraft : bouclier dans la barre de gauche › cocher des jetons › Ajouter au combat › Lancer l'initiative › Commencer le combat. |
| `coffre.png` | tutoriels § 14, manifeste | La fenêtre « Coffre du MJ IA » : état de la clé, porteurs de parts, bouton de téléchargement de la clé de secours. | Réglages › MJ IA › Coffre. Ne pas montrer le contenu d'une clé de secours. |
| `compagnons.png` | tutoriels § 12, manifeste | Deux ou trois compagnons IA qui parlent sous leur nom dans le chat, didascalie en italique comprise. | Veillées : Table de jeu › + Joueur IA (×3), lancer une partie ; ou Warcraft en séance : « ajoute un compagnon au groupe ». Le mode simple (sans IA) suffit pour une capture. |
| `config-ia.png` | tutoriels § 5 | La fenêtre Configurer (fournisseur, modèle, effort, champs de clé **vides ou masqués**, bouton Vérifier). | Réglages › MJ IA › Configurer. **Aucune clé saisie.** |
| `personnalites.png` | tutoriels § 8 | L'éditeur de personnalités : ton, violence, longueur, rigueur des règles, liberté avec le scénario, voix. | Réglages › MJ IA › Personnalités › Modifier. |
| `installer-manifeste.png` | tutoriels § 2 | L'écran d'accueil de Foundry, onglet Modules complémentaires › Installer un module, avec l'URL du manifeste collée dans le champ du bas. | Écran d'accueil de Foundry › Modules complémentaires › Installer un module ; coller `https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/module.json` ; capturer avant de cliquer sur Installer. |
| `validation.png` | tutoriels § 7 | La fenêtre « Action du MJ IA » (mode Validation) qui résume une action de l'IA, avec ses boutons Oui / Non. | Autonomie : Validation ; en séance (factice), écrire `!outil changer_scene {"nom":"<une scène du monde>"}` (ou tout autre outil sensible) ; capturer la fenêtre chez le MJ. |
| `vote.png` | — | La fenêtre d'un vote de groupe (ou d'un choix secret) chez un joueur, avec le minuteur. | En séance (factice) : `!outil vote_groupe {"question":"On entre ?","options":["Oui","Non"]}` ; capturer chez un joueur. |
| `histoire.png` | — | Le journal « Histoire de <nom> » d'un personnage avec ses quatre pages. | Fiche d'un personnage › bouton Histoire de l'en-tête (Warcraft, Fénoir). |
| `fete.png` | — | La carte du jour d'une fête de saison au chat et le décor léger (guirlande, flocons). | Réglages › MJ IA › Fête de saison › forcer « Noël » dans un monde qui la décline (Warcraft). |
| `ecoute.png` | — | La pastille « L'IA écoute » en haut de l'écran d'un joueur. | Voix de Foundry en mode Audio seulement, séance lancée avec une clé OpenAI (seule capture qui demande une clé) ; sinon l'omettre. |

Le bandeau du README utilise `console.png`, `plateau.png`, `carnet.png` et `tour-par-tour.png` ; le manifeste déclare
`console.png` en couverture et `plateau.png`, `carnet.png`, `tour-par-tour.png`, `coffre.png`, `compagnons.png` en
captures ; les tutoriels montrent `installer-manifeste.png`, `config-ia.png`, `validation.png`, `personnalites.png`,
`console.png`, `compagnons.png` et `coffre.png`. Un fichier manquant n'empêche rien : l'image ne s'affiche simplement pas
(sur GitHub, son texte de remplacement paraît à sa place).
