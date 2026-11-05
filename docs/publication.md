# Passer en public — liste de contrôle

Ce qu'il reste à faire, dans l'ordre, pour que `lakour-mj-ia` devienne un dépôt GitHub public avec un module installable
dans Foundry VTT v14. Rien ici n'est automatique : chaque case est un choix ou un geste de Jordan. Les quatre dépôts de
monde en dépendent : leur workflow de release clone ce dépôt en sous-module depuis GitHub, et leurs README renvoient à
son manifeste.

## 0. Avant tout : le dépôt GitHub

- [ ] `https://github.com/Hogun974/lakour-mj-ia` reçoit la branche `principale`, déclarée **branche par défaut** sur
      GitHub : le manifeste (`changelog`, `media`) et les README pointent sur `.../HEAD/...`, qui suit la branche par
      défaut quel que soit son nom.
- [x] Les scripts d'infrastructure privée (`outils/reconstruire-lakour-v14.sh`, `outils/serveur/`) et le plan de
      travail interne sont sortis du dépôt, et le pseudonyme retiré des essais (commit « Avant publication »).
- [x] La phrase d'infrastructure du **guide installé dans chaque monde** (`scripts/guide.js` et `scripts/guide-en.js`,
      section « Sauvegardes et dépannage ») est reformulée pour un inconnu (« Sauvegarde ton monde régulièrement… ») ;
      `npm run ecrire-guide` relancé le 5 novembre 2026 : `docs/guide-utilisation*.md` sont à jour (essai `guide`).
- [ ] L'historique git porte l'ancien titre « (Claude / ChatGPT) » et des messages de commit avec les noms des modèles :
      sans gravité, mais le savoir avant de rendre l'historique public.
- [x] Aucune adresse IP privée, aucune clé, aucun mot de passe nulle part : vérifié le 5 novembre 2026 avec
      `git grep -nE "172\.|192\.168|AMP|ampdata|sk-|4 h 30|Kuma|Forgejo|forgejo"` (hors
      `docs/empaqueter-monde.md`, qui décrit le filtre). Ce motif rend encore des **faux positifs** sans danger : `AMP`
      dans `CHAMPS_*`, `TAMPON_S`, « CAMP » ; `sk-` dans des noms d'icônes (`mask-`, `flask-`, `tusk-`…), le filtre de
      `outils/empaqueter-monde.mjs` et les textes d'exemple `sk-ant-…` / `sk-…` du champ de clé (`templates/config-ia.hbs`).
      Motif plus strict, qui ne rend rien le 5 novembre 2026 : `git grep -nwE "172\.[0-9]+|192\.168|ampdata|Kuma|[Ff]orgejo|4 h 30"
      -- ':!outils/game-icons' ':!docs/publication.md' ':!docs/empaqueter-monde.md'` (les icônes SVG contiennent des
      nombres comme `172.31`).
- [x] **Tutoriels** pour un inconnu, de zéro à la première séance : `TUTORIEL.md` (français) et `TUTORIAL.md` (anglais),
      liés en tête des deux README.
- [x] **Le monde 40k reste privé** : plus aucun lien vers `lakour-w40k` dans les README et `docs/` ; le tableau des mondes
      des README ne présente plus que Warcraft, les Veillées et Fénoir (avec leur lien), plus une phrase neutre sur le
      système `impmal`. Exemples de `docs/fetes.md` et `docs/traduction.md` passés sur Warcraft ;
      `docs/empaqueter-monde.md` ne cite plus que les trois mondes publics.
- [ ] Restent des **mentions sans lien** du 40k, à décider : le guide installé dans chaque monde (`scripts/guide.js`,
      `scripts/guide-en.js`, donc `docs/guide-utilisation*.md`) présente encore « Les trois mondes » avec une section
      Warhammer 40 000 / `lakour-40k` et des titres « (40k et Warcraft) » : c'est du code livré dans les mondes, non
      modifié ici (le changer = nouvelle version du guide, `VERSION_GUIDE`, et l'essai `guide`). Aussi : les libellés
      « 40k » de `docs/compagnons.md`, `docs/tour-par-tour.md`, `docs/voix-et-ecoute.md`, `docs/survie.md`,
      `CHANGELOG.md`, `lang/*.json` (aide du pilote), `assets/sons/index.json` ; la configuration `lakour-40k` /
      `lakour-w40k` de `outils/empaqueter-monde.mjs` (code, gardée pour le monde privé) et quelques commentaires
      `lakour-40k` de `outils/` ; les adresses `lakour-w40k` qui servent de données d'essai dans
      `essais/empaqueter-monde.test.mjs`. Les commentaires qui nommaient le dépôt `lakour-w40k` (outils, essai `parite`,
      `lier-modules.ps1`) citent désormais les mondes publics.
- [x] **Transparence** : les deux README disent que le code et les textes ont été écrits avec l'aide d'une IA (Claude,
      d'Anthropic) et relus par l'auteur.
- [ ] `.gitmodules` des quatre mondes pointe sur `../lakour-mj-ia` : il faut que ce dépôt soit public **avant** la
      première release d'un monde, sinon `actions/checkout` (`submodules: recursive`) échoue chez eux.

## 1. La licence

- [x] Choisir : **MIT** pour tout le dépôt (code, guides, documentation, sons synthétisés), décidé par Jordan le
      5 novembre 2026 ; les tiers gardent leur licence (`THIRD-PARTY-NOTICES.md`). Les mondes : MIT pour le code,
      CC BY-NC-SA 4.0 pour les textes et les images (leur `LICENCE-CONTENU.md`).
- [x] Déposer `LICENSE` à la racine (texte MIT complet, « Copyright (c) 2026 Hogun974 »). `module.json` déclare déjà
      `"license": "LICENSE"` et `outils/empaqueter-module.mjs` copie ce fichier dans l'archive, avec
      `THIRD-PARTY-NOTICES.md` ; le workflow de release refuse désormais une archive sans l'un ou l'autre.
- [x] Remplacer le `TODO` de la section « Licence » des deux README par la décision (MIT, tiers rappelés, Foundry VTT
      marque de Foundry Gaming, sans affiliation).
- [x] Archives des mondes vierges : `outils/empaqueter-monde.mjs --construire` y pose `LICENSE` et `LICENCE-CONTENU.md`
      du dépôt du monde. Les mondes ne l'auront qu'une fois leur sous-module `modules/lakour-mj-ia` mis à jour
      (leur workflow de release vérifie la présence des deux fichiers dans chaque archive).
- [x] `THIRD-PARTY-NOTICES.md` (écrit) : les deux SDK de `vendor/` sont sous **Apache-2.0** (vérifié dans leurs
      `package.json` et `LICENSE` ; aucun `NOTICE`), minifiés sans commentaire de licence. L'article 4 d'Apache 2.0 exige
      de livrer le texte de la licence avec toute redistribution : le fichier est dans l'archive. Le relire à chaque
      `npm run embarquer` qui change une version (mettre à jour le tableau).
- [x] Les icônes de `outils/game-icons/` (CC BY 3.0, `license.txt`) ne sont pas dans l'archive du module, seulement dans
      le dépôt : le crédit est dans les README et `THIRD-PARTY-NOTICES.md`.

## 2. Les captures d'écran

- [ ] Poser dans `docs/captures/` les PNG listés dans `docs/captures/LISEZ-MOI.md` (au minimum `console.png`,
      `plateau.png`, `carnet.png`, `tour-par-tour.png`, qui font le bandeau des README et la couverture du manifeste).
- [ ] Les tutoriels attendent aussi `installer-manifeste.png`, `config-ia.png`, `validation.png`, `personnalites.png`,
      `coffre.png` et `compagnons.png` (même liste).
- [ ] Vérifier qu'aucune capture ne montre un nom de joueur réel, une clé d'API (même partielle), une adresse de serveur
      dans la barre du navigateur, un chemin de machine.

## 3. Le contenu de l'archive

- [ ] `node outils/empaqueter-module.mjs --version 0.39.0 --sortie dist` : 100 fichiers, environ 10 Mo (l'archive
      pèse presque entièrement par les dix WAV de `assets/sons/`, 1 Mo chacun, qui ne se compressent pas). Si le poids
      gêne, `outils/fabriquer-sons.mjs` pourrait écrire de l'OGG (Foundry le lit) : à décider, ce n'est pas bloquant.
- [ ] Installer `dist/lakour-mj-ia.zip` à la main dans un Foundry de test (ou pointer un manifeste local) et vérifier :
      le module se charge, la console s'ouvre, le fournisseur factice répond, le guide s'installe.
- [ ] `vendor/` est à jour par rapport à `package.json` (le workflow le vérifie : la première ligne de chaque fichier
      embarqué doit porter le nom et la version du paquet).

## 4. La première release

- [ ] `package-lock.json` à jour après les changements de `package.json` (`npm install`, puis `npm ci` doit passer :
      c'est ce que fait le workflow, avec Node 24).
- [ ] `npm run essais` vert (492 essais dans 72 fichiers, tous verts le 5 novembre 2026).
- [ ] `module.json` déclare `"verified": "14.369"`, alors que les tutoriels et les README disent « testé avec 14.370 » :
      passer `compatibility.verified` à `14.370` à la prochaine version (et dans le formulaire du catalogue).
- [ ] La version du tag doit être **celle de `module.json`** et avoir sa section dans `CHANGELOG.md` (le workflow en fait
      le texte de la release). La section « Non publié » du CHANGELOG doit être renommée en version datée au moment de
      publier (par exemple `0.40.1`, la version en service au 2026-11-05 ; mettre alors
      `"version": "0.40.1"` dans `module.json`). Pour publier :

  ```bash
  git tag v0.40.1
  git push github principale --tags
  ```

- [ ] Suivre l'action **Release** sur GitHub : elle doit déposer `module.json` et `lakour-mj-ia.zip`. Puis tester dans
      Foundry l'installation par `https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/module.json`.
- [ ] Les versions suivantes : bumper `version` dans `module.json`, ajouter la section au `CHANGELOG.md`, commiter,
      tagger. Puis, dans chaque monde, `git submodule update --remote modules/lakour-mj-ia` et `npm run essais`.

## 5. Passer le dépôt en public

- [ ] GitHub › Settings › General › Danger zone › **Change visibility** › Public.
- [ ] Vérifier que la release et ses pièces jointes sont visibles sans être connecté (navigateur privé).
- [ ] Activer les **Issues** ; les README y renvoient pour les bogues.
- [ ] Mettre une description et des sujets (*topics*) sur le dépôt : `foundry-vtt`, `foundryvtt-module`, `ai-game-master`,
      `claude`, `openai`, `jdr`, `ttrpg`, `french`.

## 6. Facultatif : le catalogue de paquets Foundry

Le catalogue <https://foundryvtt.com/packages> référence les modules soumis par un détenteur de licence Foundry
(« Packages can be submitted by any user who is the owner of an active Foundry Virtual Tabletop software license ») ;
modules et systèmes passent par une relecture manuelle (« The submission process for Modules and Systems requires a
manual review and approval »). Le formulaire est lié en bas de la page des paquets, visible connecté.

### Ce que Foundry exige d'un module qui appelle une IA à l'exécution

La **politique sur l'IA** de Foundry VTT (<https://foundryvtt.com/article/ai-policy>, dernière révision substantielle le
18 mars 2026) s'applique à tout paquet du catalogue et de la boutique. Ce qu'elle dit, et ce que ça implique ici :

| Règle (citation) | Pour `lakour-mj-ia` |
|---|---|
| « Packages that invoke AI generation at runtime » sont admis, mais « Runtime-generated content must be entirely improvisational » ; « Improvised Content is content generated at runtime in direct response to unpredictable prompts ». | C'est exactement ce que fait le module : narration, voix, images et cartes produites en réponse à ce que les joueurs écrivent. Rien n'est pré-généré. |
| Ces paquets « must be categorized in an "AI Tools" category on our package listing ». | Choisir la catégorie **AI Tools** à la soumission. |
| « Packages must not be designed to automatically collect or inject context from sources the author does not have rights to ». | Le module envoie à l'IA ce que l'utilisateur a installé dans **son** monde (fiches, journaux, compendiums du système et des modules qu'il a choisis) : c'est son usage, pas une collecte par l'auteur. Le dire tel quel dans la description ; la section « Ce que ça envoie » du README le détaille. |
| « All user-facing prepared written text must be human-authored. » ; « AI-generated images, illustrations, video, and UI assets are not permitted as prepared content » ; « AI-generated music, ambient audio, sound effects, and narration are not permitted as prepared content ». | Le contenu **préparé** du module (guide, personnalités, chaînes d'interface, cartes au chat) est écrit par l'auteur ; aucune image embarquée ; les sons sont synthétisés par un programme, sans modèle d'IA. Les captures d'écran doivent être de vraies captures. |
| « AI-assisted software development is not prohibited » ; « An author must be able to understand, explain, modify, and maintain every part of their submitted codebase. » | Le code de ce dépôt a été écrit avec une assistance IA (voir les `Co-Authored-By` de l'historique) : Jordan doit pouvoir en répondre. Les paquets conformes « are no longer required to disclose that usage » ; une déclaration incorrecte « may result in permanent de-listing ». |
| « The user must explicitly confirm their understanding of generated code before it may be executed. » | Sans objet : le module ne génère ni n'exécute aucun code à l'exécution (outils déclarés, arguments validés par schéma). Le dire dans la soumission. |
| Label « Zero AI » : « Authors who have not used any AI tools at any stage of their package's creation ». | Ne pas le demander. |
| « Non-compliant packages will be archived or deleted. » ; « all rulings by Foundry VTT staff regarding compliance with this policy are final. » | En connaissance de cause. |

La politique ne parle pas explicitement des **clés d'API fournies par l'utilisateur** ni d'un consentement spécifique à
l'envoi de données vers un service tiers ; mais les modules d'IA déjà au catalogue affichent une mention du type « des
services en nuage (OpenAI) traiteront les données de campagne ». La page du paquet doit donc dire, en clair : que la clé
est celle de l'utilisateur, que les appels partent de son navigateur vers Anthropic ou OpenAI, ce qui est envoyé, et ce
que ça coûte (la section « Ce que ça coûte, ce que ça envoie » du README, en version courte). Le guide des licences
(<https://foundryvtt.com/article/licensing-guide/>) rappelle par ailleurs ce que vérifie la relecture : « Does the author
have the rights to everything this module contains? », « Does it contain content from another company […] », « Does it
contain art assets which the author did not create? » : ici, SDK Apache-2.0 avec leur notice, icônes CC BY 3.0 créditées,
sons originaux, aucune image.

### Le formulaire de soumission

| Champ | Quoi donner |
|---|---|
| Package name | `lakour-mj-ia` — doit être **exactement** l'`id` du manifeste |
| Title | `La Kour – MJ IA (Anthropic / OpenAI)` (le `title` du manifeste) |
| Description | Le `description` du manifeste, plus la version courte de « Ce que ça envoie » (clé de l'utilisateur, appels directs, données envoyées, coût) |
| Author | Jordan, avec l'URL GitHub |
| URL | `https://github.com/Hogun974/lakour-mj-ia` |
| Manifest URL de la version | **L'adresse datée**, `https://github.com/Hogun974/lakour-mj-ia/releases/download/v<version>/module.json`, pas l'adresse `latest` (le catalogue attend une adresse par version ; le champ `manifest` *dans* le fichier reste, lui, l'adresse `latest`, celle que Foundry interroge pour les mises à jour) |
| Compatibilité | Minimum 14, vérifié 14.369 (reprise du manifeste) |
| Système | Aucun (le module marche dans tous les systèmes ; adaptateurs dédiés pour `impmal`, `dnd5e`, `lakour-loups`, `lakour-survie`) |
| Tags / catégories | **AI Tools** (obligatoire), Game master tools, Automation, Audio, Chat & messaging (choisir dans la liste du formulaire) |
| Média | Couverture et captures : adresses publiques (celles du `media` du manifeste, dès que les captures sont posées) |
| Licence | MIT (étape 1) |

Ensuite, à chaque version, ajouter la nouvelle version depuis la page d'administration du paquet avec son manifeste daté.

## Les adresses à donner aux joueurs

| Quoi | Adresse |
|---|---|
| Le module MJ IA (manifeste, Foundry › Modules › Installer) | `https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/module.json` |
| L'archive de la dernière version | `https://github.com/Hogun974/lakour-mj-ia/releases/latest/download/lakour-mj-ia.zip` |
| Le dépôt, le mode d'emploi | `https://github.com/Hogun974/lakour-mj-ia` (README en français, `README.en.md` en anglais) |
| Le guide d'utilisation complet | `https://github.com/Hogun974/lakour-mj-ia/blob/HEAD/docs/guide-utilisation.md` |
| Signaler un bogue | `https://github.com/Hogun974/lakour-mj-ia/issues` |
| Le journal des versions | `https://github.com/Hogun974/lakour-mj-ia/blob/HEAD/CHANGELOG.md` |
| Le tutoriel | `https://github.com/Hogun974/lakour-mj-ia/blob/HEAD/TUTORIEL.md` (anglais : `TUTORIAL.md`) |
| Les mondes | `https://github.com/Hogun974/lakour-warcraft`, `https://github.com/Hogun974/lakour-veillees`, `https://github.com/Hogun974/lakour-fenoir` |

Ordre d'installation chez un joueur-MJ : Foundry 14 → le système du monde choisi → le module de contenu du monde et
`lakour-mj-ia` → le monde vierge du dépôt du monde (ou un monde neuf, où le module de contenu propose d'installer son
contenu) → *Réglages › MJ IA › Configurer* pour la clé, ou le fournisseur factice pour essayer.

## Release à blanc à la main

Avant de poser une étiquette, on peut rejouer toute la release sur GitHub sans rien publier : onglet **Actions** ›
**Release** › *Run workflow*, sur `principale` (ou une autre branche). Le workflow lance les essais, vérifie `vendor/`, empaquette
et vérifie exactement comme pour une étiquette, avec la version de `module.json` (comme si l'étiquette
`v<version>` était posée : hors étiquette, la comparaison étiquette/version ne peut pas échouer). Seule différence : la
release GitHub n'est pas créée, le contenu de `dist/` est déposé en artefact du workflow (à télécharger en bas de la page
du run). La release réelle ne part que sur une étiquette `v*` poussée. À côté, le workflow **Essais** lance la suite
à chaque push et pull request vers `principale`, une fois la variable de dépôt `ESSAIS_AUTOMATIQUES` mise à `oui`
(Settings › Secrets and variables › Actions › Variables) : à faire quand le moteur `lakour-mj-ia` est à jour sur GitHub,
sinon la récupération du sous-module échoue à chaque envoi. À la main (Run workflow), il tourne toujours.

## Release à blanc du 4 novembre 2026

Chaque workflow a été rejoué étape par étape (Ubuntu 24.04 sous WSL, **Node 24.22**, npm 10) dans un clone neuf
`git clone --recurse-submodules`, avec un tag local et les variables `GITHUB_REF_NAME` / `GITHUB_REPOSITORY` du runner ;
les archives produites ont été relues (manifeste à la racine, chemins `/`, `packs/` complets, ni `src/`, ni `contenu/`, ni
`essais/`, ni `node_modules`, ni `.git`, CRC vérifiés). Les actions sont passées en versions Node 24
(`actions/checkout@v5`, `actions/setup-node@v5`, `softprops/action-gh-release@v3` : les v4/v2 tournent encore sous
Node 20, en fin de vie sur les runners GitHub).

- Résultat : toutes les étapes passent (`npm ci`, essais, SDK embarqués, archive, notes) ; `dist/` = `module.json` et
  `lakour-mj-ia.zip` (~10 Mo, une centaine de fichiers), `download` daté du tag. Un essai
  `coffre-carnet` a échoué une fois sur deux (écart d'une milliseconde entre deux horodatages) : instable, à fiabiliser
  avant de tagger, sinon relancer le workflow.
- [ ] Reste : le dépôt doit être **public** (ou les mondes doivent avoir un PAT de lecture dans le secret
      `SOUS_MODULE_TOKEN`) avant la première release d'un monde : leur `.gitmodules` pointe sur `../lakour-mj-ia`, soit
      `https://github.com/Hogun974/lakour-mj-ia`.
- [x] Reste : `module.json` annonce `"license": "LICENSE"` mais aucun fichier `LICENSE` n'existe (voir § 1) : `LICENSE`
      (MIT) déposé le 5 novembre 2026.
- [ ] Même garde cassée (voir les mondes) dans `outils/ecrire-guide.mjs` et `outils/fabriquer-sons.mjs` : sans effet sur
      la release, mais ces commandes ne font rien sous Linux.
