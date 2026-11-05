# Traduction des modules de contenu (français → anglais)

Les quatre modules de contenu La Kour (`lakour-40k`, `lakour-warcraft`, `lakour-veillees`, `lakour-fenoir`) sont fabriqués
de la même façon : sources `contenu/*.mjs` → fabricant `outils/fabriquer-<monde>.mjs` → `src/<pack>/*.json` → `packs/`
(LevelDB, CLI Foundry). Leur interface (`lang/fr.json`, `lang/en.json`) est bilingue, mais Foundry ne sait pas localiser
les **documents** d'un compendium (journaux, objets, acteurs, tables, scènes, dossiers, étiquettes des packs).

La méthode retenue : chaque module produit un **second module anglais `<id>-en`** (ex. `lakour-40k-en`), engendré par
le même fabricant à partir des mêmes sources et d'un **dictionnaire de traduction**, avec :

- les **mêmes `_id`** de documents (et les mêmes `_key`) : les liens `@UUID[Compendium.<id>.<pack>.<Type>.<_id>]`, les
  références (talents d'un rôle, options d'un choix, résultats de table de type document), les épingles des cartes et les
  uuid des drapeaux sont récrits vers `<id>-en` sans changer d'identifiant ;
- ses **propres copies** des images, scripts, styles, gabarits et fichiers de langue (un zip doit être autonome) ;
- un `module.json` anglais (titre, description, étiquettes des packs et des dossiers), qui déclare un **conflit** avec le
  module français : un seul des deux est actif à la fois.

Le module `-en` est **engendré en entier, jamais versionné** (`.gitignore`). Ce qui est versionné : les dictionnaires
`contenu/en/<pack>.json` et `contenu/en/module.json`.

## L'outil commun : `outils/traduction.mjs` (moteur)

Importé par chaque fabricant. Essais : `essais/traduction.test.mjs`.

| Fonction | Rôle |
|---|---|
| `extraire(documents, options)` | Squelette du dictionnaire : `{ squelette, tout }`, chacun de la forme `{ [pack]: { "<pack>/<_id>": { _nom, "<chemin>": { fr, en: "" } } } }`. `squelette` ne liste chaque texte français qu'à sa **première occurrence** (le nom d'un document est toujours dans sa propre entrée) ; `tout` garde chaque occurrence. |
| `fusionner(squelette, existant, tout)` | Relance de l'extraction : les traductions faites sont **conservées** ; une entrée dont le français a changé repasse à `en: ""` avec l'ancien anglais sous `enAncien` (à vérifier) ; une entrée dont le document ou le chemin a disparu est retirée. Idempotente. |
| `appliquer(documents, dictionnaire, { deId, versId, ...options })` | Documents traduits (copies) : anglais non vide appliqué, sinon le français reste et l'entrée est comptée **manquante** ; **mémoire** de traduction (même français → même anglais, d'un document ou d'un pack à l'autre) ; une entrée dont le `fr` ne correspond plus au texte source est comptée **obsolète** et non appliquée ; uuid, chemins `modules/<deId>/` et portée de drapeaux `flags.<deId>` récrits vers `versId` ; `name` des références réaligné sur le nom traduit de la cible. Rapport `{ traduits, parMemoire, manquants, obsoletes, erreurs, parPack, nomsRealignes }`. |
| `ecartsBalises(fr, en)` / `marqueurs(texte)` | Les balises HTML (nom, `src`/`href`), les `@UUID[...]`, les jets `[[...]]` (sans leur libellé `#…`), les `{variables}` et `%variables%` du français doivent se retrouver dans l'anglais, texte libre à part. Une entrée en écart n'est pas appliquée et figure dans `rapport.erreurs` : le fabricant s'arrête. |
| `recrireIdentifiant(valeur, deId, versId)` | La récriture seule (uuid, chemins, portées). |
| `resumerRapport(rapport)` | Une ligne par pack. |

### Ce qui est extrait (règles par défaut, configurables)

Un parcours de tout le document retient chaque chaîne qui **ressemble à du texte** (`estTexte`) : contient une lettre
et une espace, une lettre accentuée, une majuscule initiale ou du HTML ; jamais un chemin (`modules/…`, `icons/…`), un
uuid, une couleur, un identifiant de 16 caractères, une formule de dés, un script. Sont exclues à toute profondeur les
clés techniques (`CLES_EXCLUES` : `_id`, `img`, `uuid`, `documentId`, `type`, `formula`, `script`, `author`, `color`, `cle`,
`installer`…), le `name` d'une **référence** (objet portant `uuid`, `documentId` ou `documentUuid` : réaligné à
l'application) et les drapeaux des autres modules (`flags.core`, `flags.lakour-mj-ia`…) : seul `flags.<module>` est lu.

Chemins : `pages.<idPage>.text.content`, `results.<idRésultat>.description`, `effects.<id>.name`,
`regions.<id>.behaviors.<id>.system.text`, `flags.<module>.plan.pieces.3.nom` (indice quand l'élément n'a pas de `_id`).

Options : `module` (portée des drapeaux), `exclure` (clés en plus), `champs` (chemins toujours extraits, motifs avec `[]`),
`heuristique: false` (seulement `champs`), `ignorerPacks`. Une entrée **ajoutée à la main** dans un dictionnaire sur un
chemin non extrait est appliquée quand même.

## Le pilote : `lakour-40k` → `lakour-40k-en`

Dans `lakour-w40k` :

```
node outils/fabriquer-40k.mjs --extraire    # écrit / met à jour modules/lakour-40k/contenu/en/<pack>.json
npm run fabriquer-40k-en                    # = --langue en : engendre modules/lakour-40k-en/ en entier, puis contrôle le contrat
npm run essais                              # essais/traduction-40k.test.mjs : mêmes _id, aucun uuid vers lakour-40k, balises, manifeste
node modules/lakour-mj-ia/outils/valider-foundry.mjs modules/lakour-40k-en impmal <dossier contenant common/>
node outils/empaqueter-module.mjs --module lakour-40k-en --version <v> --sortie dist   # lakour-40k-en.zip + lakour-40k-en.json
```

`modules/lakour-40k-en/` contient : `module.json` (engendré de `contenu/en/module.json` + manifeste français), `src/` et
`packs/` traduits, copies de `lang/`, `scripts/`, `styles/`, `templates/`, `CREDITS.md` et `assets/` (les JSON des assets
sont récrits `modules/lakour-40k/` → `modules/lakour-40k-en/` ; `assets/cartes/plans.json` est **refait** à partir des
plans traduits des scènes, pour le contrat du contenu). Le workflow de release fabrique et publie les deux modules ;
l'adresse stable du manifeste anglais est `releases/latest/download/lakour-40k-en.json`.

Le pack `aventures` (documents Adventure, copies des autres packs) n'a pas de dictionnaire : il est emballé **après** la
traduction, à partir des copies anglaises (`paquetsAventures(documents, { module: "lakour-40k-en", langue: "en" })`) ; ses
textes propres (légende, résumé, phrase d'import, titres des listes) sont dans `contenu/aventures-paquets.mjs`, par
langue, et son titre vient du drapeau `aventure` des cartes traduites (celui que l'installateur compare au dossier).

## Compléter un dictionnaire (traducteur)

Un fichier par pack, `modules/<id>/contenu/en/<pack>.json` :

```json
{
  "talents/b6WANqKurSgyjPAy": {
    "_nom": "Accès aux archives",
    "name": { "fr": "Accès aux archives", "en": "Archive Access" },
    "system.notes.player": { "fr": "<p>Vous savez où chercher. … <strong>+1 DR</strong> …</p>", "en": "<p>You know where to look. … <strong>+1 SL</strong> …</p>" },
    "effects.qYEVe6XBYR7v9tHi.name": { "fr": "Accès aux archives (+1 DR)", "en": "Archive Access (+1 SL)" }
  }
}
```

1. Remplir `en` ; ne **jamais** toucher à `fr` (c'est la clé qui dit si la source a changé) ni aux clés.
2. Garder exactement les balises, les `@UUID[…]` (le libellé `{…}` qui suit se traduit), les jets `[[/roll …]]` (le
   libellé après `#` se traduit) et les `{variables}` : sinon le fabricant refuse l'entrée.
3. Un texte qui revient (objet embarqué dans un PNJ, nom d'une pièce repris par ses zones) n'est listé qu'une fois : la
   mémoire comble les autres occurrences. Pour traduire **différemment** une occurrence, ajouter son entrée à la main
   (chemin dans `tout`, ou lu dans `src/`) : l'entrée directe prime sur la mémoire.
4. Les libellés du **système** (compétences, caractéristiques, états, difficultés, spécialisations d'armes `One Handed`,
   `Pistols`, `Long Guns`…) suivent le `lang/en.json` du système : un nom de spécialisation doit être **exactement** celui
   du système, l'arme retrouve la spécialisation du tireur par son nom.
5. `enAncien` : la source a changé ; relire, retraduire dans `en`, supprimer `enAncien`.
6. Relancer `--extraire` après toute modification des sources (`contenu/*.mjs`) : il signale les entrées obsolètes et
   retire celles qui n'ont plus de source. Puis `npm run fabriquer-40k-en` et `npm run essais`.

Un texte non traduit reste en français dans le module anglais (compté « manquant » dans le résumé du fabricant) ; le
module reste installable.

## Adopter le mécanisme dans un autre module (Warcraft, Veillées, Fénoir)

1. **Fabricant** : importer `appliquer`, `extraire`, `fusionner`, `resumerRapport` de
   `modules/lakour-mj-ia/outils/traduction.mjs` ; ajouter `--extraire` (extraire + fusionner + écrire
   `contenu/en/<pack>.json`) et `--langue en` (appliquer avec `{ module: ID, deId: ID, versId: ID + "-en", ignorerPacks }`,
   écrire `src/` et compiler `packs/` dans `modules/<id>-en/`, engendrer `module.json`, copier `lang/`, `scripts/`,
   `styles/`, `templates/`, `assets/` en récrivant `modules/<id>/` dans les JSON des assets, refaire `plans.json`,
   puis `verifierModuleDeContenu`). Modèle : `lakour-w40k/outils/fabriquer-40k.mjs` (fonctions `lireDictionnaires`,
   `extraireDictionnaires`, `fabriquerAnglais`, `manifesteAnglais`, `copierModule`).
2. **Dictionnaire du manifeste** : `contenu/en/module.json` (`title`, `description`, `packs: { nom: étiquette }`,
   `packFolders: { nom français: nom anglais }`).
3. **Scripts du module** : tout ce qui porte l'identifiant du module (réglages `game.settings.register(ID, …)`, drapeaux
   `getFlag(ID, …)` / `flags.<ID>`, compendiums `game.packs.get(\`${ID}.<pack>\`)`, chemins `modules/${ID}/…`, feuilles
   `registerSheet(Actor, ID, …)`, `game.modules.get(ID).api`, fenêtres `id: \`${ID}-…\``) doit passer par un **`ID` lu
   dans l'adresse du script** et non une constante : `scripts/identite.js` de lakour-40k
   (`/\/modules\/([^/]+)\//.exec(new URL(import.meta.url).pathname)`), importé par chaque script. Les essais qui copient
   un script dans un dossier temporaire doivent copier `identite.js` à côté (il retombe alors sur l'identifiant français).
4. **Documents engendrés par du code** (paquets d'aventure, textes composés dans le fabricant) : paramétrer le module et
   la langue, comme `paquetsAventures(docs, { module, langue })`.
5. **Dossiers et libellés créés par les scripts à l'installation** (ex. dossier « La Kour 40k » des tables, titre par
   défaut d'une aventure) : restent tels quels ou passent par `lang/*.json` ; à décider module par module.
6. **Moteur** : `scripts/contenus.js` connaît les deux variantes (`variantes(id)`, `moduleDeBase(id)`) et
   `moduleDeContenu()` rend celle qui est active ; `reinitialiser.js` s'en sert. Tout autre endroit du moteur qui nomme
   un module de contenu en dur doit passer par `moduleDeContenu()` (voir la liste ci-dessous).
7. **Release** : `.github/workflows/release.yml` fabrique le module `-en`, `outils/empaqueter-module.mjs --module <id>-en`
   l'emballe ; `.gitignore` : `modules/<id>-en/`.
8. **Essais** : copier `lakour-w40k/essais/traduction-40k.test.mjs` (mêmes `_id`, aucun uuid vers l'id français, balises,
   dictionnaires à jour, manifeste).

### Particularités repérées (traitées dans chaque module)

- **Assets JSON** lus par le moteur (`assets/jetons/index.json`, `index-3d.json`, `figurants.json`, `assets/cartes/plans.json`)
  portent des chemins `modules/<id>/…` : récrits à la copie. Les libellés des **figurants** (`figurants.json`, champ
  `libelle`, lus par le MJ IA) sont traduits à la copie par un petit dictionnaire `contenu/en/figurants.json`
  (`{ "<type>": "English label" }`, clés et jetons inchangés) dans les quatre modules (`traduireFigurants` des fabricants ;
  `lireDictionnaires` ignore ce fichier, comme `module.json`).
- **Textes dans les scripts** : `scripts/fetes.js` (nom, description, consigne des fêtes déclinées auprès du moteur, nom
  des liens de la carte) porte un bloc `en` par fête, et `textesDeFete(f)` rend la fête dans la langue du module (`ANGLAIS`
  de `scripts/identite.js`) : 40k, Warcraft et les Veillées enregistrent celle-là ; dans node (fabricant, essais) la fête
  reste française. Fénoir lit ses fêtes dans le registre traduit (`assets/donnees.json`). Les noms anglais des liens sont
  ceux des dictionnaires (`contenu/en/<pack>.json`, essais `fetes-40k.test.mjs`, `warcraft-fetes.test.mjs`).
- **Classe CSS** `${MODULE}-illustration` dans les pages de journal : non récrite (pas de style associé).
- **Warcraft** : `flags.lakour-warcraft.contrat` (contrats des joueurs, lus par le moteur) et les recettes : les champs
  textuels y sont extraits par l'heuristique (`type`, `faction` exclus par `CLES_EXCLUES`/minuscules) ; vérifier le squelette.
- **Veillées** : `system.cle` des objets (lu par `outils.js` du moteur) est en minuscules : non extrait ; les noms de
  villageois viennent du compendium `tables` de la variante active (compagnons-jeu.js, `packDeContenu`). Les **repères de
  la carte** (« Maison 1 » à « Maison 18 », les dix bâtiments : `system.maison`, `system.repere`, noms du plan) sont des
  clés que le système et le MJ IA lisent par nom : ils restent français dans le module anglais (`CLES_NON_TRADUITES` du
  fabricant) et seul leur **affichage** est traduit par le système `lakour-loups` (`logique/reperes.mjs`,
  `libelleRepere` de `scripts/donnees.mjs`, clés `LAKOUR_LOUPS.Reperes.*` de `lang/<langue>.json` : « House 7 »,
  « Chapel »…) dans la fiche du villageois, la fiche du bâtiment, l'infobulle du jeton, la Table, le vote, les choix de
  cible et la carte de rôle ; essais `reperes-veillees.test.mjs`.
- **Fénoir** : les compendiums `passes`, `savoirs`, `equipements` (`outils-survie.js`) et les drapeaux `appel` des tables
  sont lus sous l'identifiant de la variante active (`packDeContenu`, `drapeauxDuContenu`).
- **Mondes vierges anglais** : `outils/empaqueter-monde.mjs --langue en` (voir `docs/empaqueter-monde.md`) engendre le
  jumeau anglais du monde vierge (`<id>-en`, documents traduits par les mêmes dictionnaires, module `<id>-en` activé et
  requis, `monde/world.en.json` pour le titre et la description) ; les releases publient `world-en.json` et `<id>-en.zip`.

### Le moteur ne nomme plus aucun module de contenu en dur

`scripts/contenus.js` fournit, en plus de `moduleDeContenu()` (la variante active, ou null) :

- `contenuNomme(systeme)` : l'identifiant à nommer (compendium, asset, API) — la variante active, sinon l'identifiant
  français (le monde n'a pas le module : la recherche échoue proprement, comme avant) ;
- `packDeContenu(nom, systeme)` : `lakour-40k-en.armement` quand la variante anglaise est active ;
- `drapeauxDuContenu(flags, module)` : les drapeaux posés par le contenu (`flags.<id>`) portent l'identifiant du module qui a
  posé le document (un document importé de `lakour-40k-en` porte `flags["lakour-40k-en"]`, un autre importé avant le
  changement de langue porte `flags["lakour-40k"]`) : on lit la variante active d'abord, puis l'autre.

Endroits passés par ces aides : `scripts/main.js` (réparation des munitions), `scripts/outils.js` (`preparerDepart` de
l'API 40k, jeton du rôle et du peuple, munitions, assets et compendiums des Veillées, drapeaux des résultats de
`lancer_table`), `scripts/compagnons-jeu.js` (table des noms de villageois), `scripts/outils-survie.js` (compendiums des
passés, savoirs et équipements de Fénoir), `scripts/placement.js` (module des figurants par défaut, résolu à chaque appel),
`scripts/tirages.js` (lecture des drapeaux `contrat` / `appel`, quel que soit le module qui les a posés). L'essai
`essais/contenu-variantes.test.mjs` rejoue chaque endroit avec la variante `-en` active et refuse tout nouvel identifiant de
module de contenu écrit en dur dans `scripts/` (hors `contenus.js` et le guide).

## Le moteur dans un monde anglais

La **langue du monde** est celle du module de contenu actif (`langueDuMonde()` de `scripts/contenus.js` : `<id>-en` actif →
`"en"` ; sans module de contenu, la langue de l'interface). Le guide (`langueDuGuide`), le narrateur et les compagnons la suivent :

- **Narrateur** : le prompt système reste en français (les modèles le comprennent), mais sa ligne de langue
  (`consigneLangue()` de `scripts/contexte.js`) lui demande, dans un monde anglais, d'écrire **tout** ce que voient les joueurs en
  anglais (narration, PNJ, messages privés, votes, raisons des jets, chroniques), de traduire ce qu'il reprend de l'état du jeu et
  des résultats d'outils, et de garder les noms exacts quand il appelle un outil.
- **Compagnons IA** : `vueDe` (`scripts/compagnons-jeu.js`) pose `vue.langue` ; `consigneLangueCompagnon` (`scripts/compagnons.js`).
- **Voix** : voix du navigateur choisie dans la langue du monde (`choisirVoix`), consigne de la voix OpenAI (`consignesLecture`) ;
  **transcription** : langue et consigne du modèle (`scripts/transcription.js`).
- **Textes automatiques vus des joueurs** : `texteJoueurs(cle, francais, donnees)` (`scripts/utilitaires.js`) lit
  `lang/<langue>.json` et retombe sur le français du code hors de Foundry (essais). Passent par là : la carte de jet demandé
  (`LAKOUR_MJIA.Jet.*`), les légendes des jets d'Imperium Maledictum, la carte du vote de groupe
  (`LAKOUR_MJIA.Decisions.Resultat.*`), les cartes d'horloge, de jauge et de réputation et les paliers de réputation livrés
  (`LAKOUR_MJIA.Horloges.*`), les attitudes des contacts, le nom générique d'une fête sur sa carte (`LAKOUR_MJIA.Fetes.Noms.*`), le
  nom du narrateur au chat pour une personnalité livrée dont le MJ n'a pas changé le nom (`nomAfficheDe`,
  `LAKOUR_MJIA.Personnalites.Noms.*`), l'alias « MJ IA » (`LAKOUR_MJIA.Nom`). Ces textes suivent la langue de l'interface du
  navigateur qui les écrit (le MJ actif). `essais/langue-du-monde.test.mjs` vérifie que le français du code est celui de
  `lang/fr.json` et qu'il ne reste plus de français dans les rendus anglais.
- Restent en français (lus par le modèle seulement) : descriptions des outils, consignes des adaptateurs, résultats d'outils,
  état du jeu, mémoire de campagne.
