# lakour-mj-ia — moteur commun de La Kour

Le module Foundry VTT **MJ IA** (Claude ou ChatGPT, avec ta clé) et l'outillage partagé par les trois mondes de
l'instance LaKour : `lakour-w40k`, `lakour-warcraft` et `lakour-veillees`. Chaque monde contient ce dépôt en **sous-module**, monté à
`modules/lakour-mj-ia`. Historique antérieur : archive `foundry-modules@bc94625`.

## Contenu

```
module.json, scripts/, templates/, styles/, lang/, assets/sons/, vendor/   le module Foundry (racine du dépôt)
outils/      partagé par les mondes : valider-foundry.mjs, jetons-commun.mjs (dessin des jetons),
             contrat-contenu.mjs (contrôle d'un module de contenu), game-icons/ (icônes CC BY 3.0 + licence),
             icones-foundry14.txt, embarquer-sdk.mjs, fabriquer-sons.mjs, ecrire-guide.mjs,
             lier-modules.ps1, reconstruire-lakour-v14.sh, serveur/
essais/      essais node du moteur (aucun réseau, aucun coût), doublures/foundry-decisions.mjs
docs/        guide-utilisation.md (recopié de scripts/guide.js), compagnons.md
```

## Cloner, éprouver, fabriquer

```bash
git clone <url>/lakour-mj-ia.git && cd lakour-mj-ia
npm install                # esbuild, SDK Anthropic et OpenAI, resvg (versions épinglées)
npm run essais             # tous les essais du moteur
npm run embarquer          # régénère vendor/anthropic.mjs et vendor/openai.mjs
npm run fabriquer-sons     # régénère assets/sons/ (boucles synthétisées, aucun droit d'auteur)
npm run ecrire-guide       # recopie le guide dans docs/guide-utilisation.md
```

Le validateur Foundry et le contrat des modules de contenu se lancent depuis un dépôt de monde
(`npm run valider -- <dossier de Foundry contenant common/>`, `npm run contrat`).

## Règle de parité

Une amélioration du moteur sert aux **trois** mondes : rien de propre à un monde dans ce dépôt. Ce qui dépend d'un
système passe par les adaptateurs (`scripts/adaptateurs.js`) ; ce qu'un module de contenu doit fournir (figurants,
index des jetons, plans) est décrit par `outils/contrat-contenu.mjs`, que chaque monde éprouve dans ses essais.
Après un changement ici : `npm run essais` ici, puis dans chaque monde, mettre à jour le sous-module et relancer
`npm run essais`.

## Mettre à jour le sous-module dans un monde

```bash
cd lakour-w40k                                   # ou lakour-warcraft, lakour-veillees
git submodule update --remote modules/lakour-mj-ia
npm run essais
git add modules/lakour-mj-ia && git commit -m "Moteur MJ IA à jour"
```

## Sécurité et coût

- Les clés API sont des réglages **client** : stockées dans le navigateur du MJ uniquement, jamais dans le monde.
- Mode **validation** par défaut : chaque action qui modifie le monde ou coûte de l'argent attend l'accord du MJ humain.
- **Budget par séance** (10 $ par défaut), estimé ; la facture du fournisseur fait foi. Fournisseur **factice** pour tout
  éprouver sans clé ni coût.

## Déploiement sur le serveur

Seul le module part dans `Data/modules/lakour-mj-ia` : `module.json`, `scripts/`, `templates/`, `styles/`, `lang/`,
`assets/`, `vendor/`. Ne pas envoyer `essais/`, `outils/`, `docs/`, `node_modules/`, `package*.json`, `README.md`,
`.git*`. NPM « Cache Assets » doit rester décoché sur les hôtes fvtt.
