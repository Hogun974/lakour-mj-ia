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

### Particularités repérées (à traiter dans chaque module)

- **Assets JSON** lus par le moteur (`assets/jetons/index.json`, `index-3d.json`, `figurants.json`, `assets/cartes/plans.json`)
  portent des chemins `modules/<id>/…` : récrits à la copie. `figurants.json` a des libellés français (`libelle`) lus par
  le MJ IA : laissés en français pour l'instant (un dictionnaire des assets serait l'étape suivante).
- **Textes dans les scripts** (ex. `scripts/fetes.js` de lakour-40k : nom, description et consigne des fêtes enregistrées
  auprès du moteur) restent en français dans le module anglais : à passer par `lang/*.json` si on veut les traduire.
- **Classe CSS** `${MODULE}-illustration` dans les pages de journal : non récrite (pas de style associé).
- **Warcraft** : `flags.lakour-warcraft.contrat` (contrats des joueurs, lus par le moteur) et les recettes : les champs
  textuels y sont extraits par l'heuristique (`type`, `faction` exclus par `CLES_EXCLUES`/minuscules) ; vérifier le squelette.
- **Veillées** : `system.cle` des objets (lu par `outils.js` du moteur) est en minuscules : non extrait ; les noms de
  villageois tirés de `lakour-veillees.tables` (compagnons-jeu.js) passent par un pack nommé en dur dans le moteur.
- **Fénoir** : `PACKS` de `outils-survie.js` (`lakour-fenoir.passes`, `.savoirs`, `.equipements`) et
  `flags.lakour-fenoir.appel` nommés en dur dans le moteur.

### Endroits du moteur qui nomment encore un module de contenu en dur

À faire passer par `moduleDeContenu()` / `variantes()` de `scripts/contenus.js` (hors périmètre du pilote, fichiers en
cours de modification par d'autres chantiers) :

- `scripts/main.js` : `game.packs.get("lakour-40k.armement")` (réparation des munitions) ;
- `scripts/outils.js` : `game.modules.get("lakour-40k")?.api?.preparerDepart`, `flags["lakour-40k"]?.cle`,
  `game.packs.get("lakour-40k.armement")` (munitions), `flags["lakour-warcraft"]?.cle`, `modules/lakour-veillees/assets/…`,
  `game.packs.get(\`lakour-veillees.${nom}\`)` ;
- `scripts/compagnons-jeu.js` : `game.packs.get("lakour-veillees.tables")`, `flags["lakour-veillees"]` ;
- `scripts/outils-survie.js` : `PACKS` `lakour-fenoir.*` ;
- `scripts/placement.js` : `moduleFigurants = "lakour-40k"` par défaut (remplacé au chargement par `figurantsDuContenu()`,
  qui rend déjà le bon identifiant) ;
- `scripts/tirages.js` : `flags.lakour-fenoir.appel` (commentaire et lecture des drapeaux).
