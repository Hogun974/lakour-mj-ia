# Captures d'écran attendues

Les fichiers PNG de ce dossier illustrent le README (bandeau et sections) et le manifeste du module (`media`). Ils ne
sont pas encore là : voici ce que chacun doit montrer et comment l'obtenir dans Foundry VTT v14, dans un monde où
`lakour-mj-ia` est actif (le monde 40k ou Warcraft convient pour la plupart ; les Veillées pour les compagnons). Format
conseillé : 1600 × 900 environ, PNG, **sans nom de joueur réel, sans clé d'API visible, sans adresse de serveur dans la
barre du navigateur** (recadrer). Le fournisseur **factice** suffit pour presque tout : aucune clé, aucun coût.

| Fichier | Ce qu'il montre | Comment l'obtenir |
|---|---|---|
| `console.png` | La console du MJ IA (personnalité, Démarrer / Terminer la séance, coût estimé, pilote) et une narration du MJ IA dans le chat. | Réglages › MJ IA › Configurer › fournisseur **factice** ; chapeau de magicien dans la barre de gauche › Démarrer la séance ; un joueur écrit « Nous entrons dans la taverne. » ; capturer console et chat. |
| `plateau.png` | Une carte créée par le MJ IA avec ses murs, lumières et jetons posés, et le message qui l'accompagne. | En séance (factice) : écrire `!outil creer_scene {"nom":"Auberge du Puits","description":"une salle commune, un comptoir, un escalier"}` dans le chat, puis activer la scène et poser deux ou trois jetons. Avec une vraie clé, demander simplement « amène-nous dans une auberge ». |
| `carnet.png` | Le Carnet de campagne, onglet Horloges : une horloge en camembert, une jauge à seuils, une réputation en paliers, l'œil de visibilité. | Livre ouvert dans la barre de gauche › Horloges ; créer trois éléments à la main (ou par `!outil horloge {...}` en factice). Monde 40k ou Warcraft. |
| `tour-par-tour.png` | Le panneau Tour par tour pendant un combat : tour en cours, actions restantes, attaques, cibles avec distances, bouton de l'étape suivante encadré de pointillés. | Monde 40k ou Warcraft : bouclier dans la barre de gauche › cocher des jetons › Ajouter au combat › Lancer l'initiative › Commencer le combat. |
| `coffre.png` | La fenêtre « Coffre du MJ IA » : état de la clé, porteurs de parts, bouton de téléchargement de la clé de secours. | Réglages › MJ IA › Coffre. Ne pas montrer le contenu d'une clé de secours. |
| `compagnons.png` | Deux ou trois compagnons IA qui parlent sous leur nom dans le chat, didascalie en italique comprise. | Veillées : Table de jeu › + Joueur IA (×3), lancer une partie ; ou 40k / Warcraft en séance : « ajoute un compagnon au groupe ». Le mode simple (sans IA) suffit pour une capture. |
| `config-ia.png` | La fenêtre Configurer (fournisseur, modèle, effort, champs de clé **vides ou masqués**, bouton Vérifier). | Réglages › MJ IA › Configurer. **Aucune clé saisie.** |
| `personnalites.png` | L'éditeur de personnalités : ton, violence, longueur, rigueur des règles, liberté avec le scénario, voix. | Réglages › MJ IA › Personnalités › Modifier. |
| `vote.png` | La fenêtre d'un vote de groupe (ou d'un choix secret) chez un joueur, avec le minuteur. | En séance (factice) : `!outil vote_groupe {"question":"On entre ?","options":["Oui","Non"]}` ; capturer chez un joueur. |
| `histoire.png` | Le journal « Histoire de <nom> » d'un personnage avec ses quatre pages. | Fiche d'un personnage › bouton Histoire de l'en-tête (40k, Warcraft, Fénoir). |
| `fete.png` | La carte du jour d'une fête de saison au chat et le décor léger (guirlande, flocons). | Réglages › MJ IA › Fête de saison › forcer « Noël » dans un monde qui la décline (40k ou Warcraft). |
| `ecoute.png` | La pastille « L'IA écoute » en haut de l'écran d'un joueur. | Voix de Foundry en mode Audio seulement, séance lancée avec une clé OpenAI (seule capture qui demande une clé) ; sinon l'omettre. |

Le bandeau du README utilise `console.png`, `plateau.png`, `carnet.png` et `tour-par-tour.png` ; le manifeste déclare
`console.png` en couverture et les autres en captures. Un fichier manquant n'empêche rien : l'image ne s'affiche
simplement pas.
