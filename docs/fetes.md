# Fêtes de saison — le socle du moteur (MJ IA 0.36.0)

Le moteur `lakour-mj-ia` connaît un petit calendrier de fêtes populaires. Il ne célèbre rien de lui-même : **chaque monde
décline les fêtes qui lui vont** (Warcraft, Veillées, Fénoir…) en enregistrant une *déclinaison* (nom, description, consigne au
narrateur, décor, liens). Une fête que le monde ne décline pas n'existe pas pour lui : ni décor, ni carte, ni ligne pour l'IA.

Code : `scripts/fetes-logique.js` (logique pure, testée), `scripts/fetes.js` (branchement Foundry), `styles/mj-ia.css` (décor),
`essais/fetes.test.mjs`. Guide : page « Fêtes de saison » du guide du MJ (`scripts/guide.js`).

## 1. Le calendrier

Fenêtres en **heure locale du navigateur** (celle du MJ chez le MJ : c'est son navigateur qui pose la carte du jour et parle
à l'IA), ou à la **date du monde** quand le monde en donne une (`api.fetes.sourceDeDate`, §3 : Fénoir et sa date de jeu).
Bornes incluses.

| id | Fête | Fenêtre | Cœur | Priorité |
|---|---|---|---|---|
| `nouvel-an` | Nouvel An | 31 déc. – 2 janv. | 31 déc. – 1er janv. | 70 |
| `liberte` | Fête de la liberté (20 décembre, La Réunion) | 19 – 21 déc. | 20 déc. | 65 |
| `noel` | Noël | 1er – 31 déc. | 24 – 26 déc. | 60 |
| `letchis` | Fête des letchis (La Réunion, fenêtre fixe choisie) | 12 – 15 déc. | 13 – 14 déc. | 55 |
| `paques` | Pâques | Vendredi saint – lundi de Pâques (mobile) | dimanche et lundi | 50 |
| `dipavali` | Dipavali (La Réunion) | 3 j avant – 3 j après (date lunaire calculée) | le jour | 45 |
| `cavadee` | Cavadee (Thaipoosam) | veille – lendemain (date lunaire calculée) | le jour | 44 |
| `nouvel-an-chinois` | Nouvel An chinois | veille – 3 j après (date lunaire calculée) | le jour | 42 |
| `carnaval` | Carnaval | Jeudi gras – Mardi gras (mobile, Mardi gras = Pâques − 47 j) | Mardi gras | 40 |
| `halloween` | Halloween (et la Toussaint) | 25 oct. – 2 nov. | 31 oct. – 1er nov. | 30 |
| `saint-valentin` | Saint-Valentin | 12 – 15 févr. | 14 févr. | 20 |
| `fete-nationale` | Fête nationale (14 juillet) | 13 – 14 juil. | 14 juil. | 15 |
| `musique` | Fête de la musique (solstice d'été) | 20 – 22 juin | 21 juin | 10 |

Pâques : calcul grégorien (algorithme de Meeus, Jones et Butcher). Deux fêtes le même jour : celle qui est **à son cœur**
passe devant, puis la **priorité** (le 31 décembre, Nouvel An avant Noël ; le 14 février, Saint-Valentin avant un Carnaval
qui n'est pas à son Mardi gras ; le 20 décembre, la fête de la liberté avant Noël).

**Fêtes à date lunaire** (`dateLunaire(id, annee)` de `scripts/fetes-logique.js`) : **calculées pour toute année** depuis
le 5 novembre 2026 (avant, une table s'arrêtait en 2036), d'après les phases de la lune (Jean Meeus, *Astronomical Algorithms*,
chap. 49 ; longitudes abrégées du Soleil et de la Lune ; zodiaque sidéral de Lahiri pour les mois tamouls et hindous) :
- Nouvel An chinois : la nouvelle lune qui tombe entre le 21 janvier et le 20 février, à l'heure de Pékin ;
- Dipavali : la nouvelle lune du mois où le Soleil est dans la Balance sidérale, à l'heure de l'Inde ; le jour même si elle
  tombe après 15 h, sinon la veille (le soir où l'amavasya a commencé) ;
- Cavadee : le jour du mois tamoul de Thai (Soleil dans le Capricorne sidéral) où la Lune passe le plus d'heures de jour
  (6 h 30 – 18 h 30, heure de l'Inde) dans la demeure de Pusam, près de la pleine lune.

Le calcul redonne les **relevés** (`DATES_LUNAIRES`) des 33 dates de 2026 à 2036, et le Nouvel An chinois connu jusqu'en 2050 ;
les essais vérifient aussi que chaque fête reste dans son mois jusqu'en 2100 (`essais/fetes.test.mjs`,
`essais/fetes-reunion.test.mjs`). Relevés du 4 novembre 2026, sources concordantes :
- Dipavali : la Deepavali (amavasya), telle que La Réunion la date (reunion.fr donne le 8 novembre 2026) ; le défilé de
  Saint-André se tient sur le week-end proche, d'où la fenêtre de 3 jours de part et d'autre
  (https://testbook.com/articles/diwali-dates-for-next-20-years, https://en.reunion.fr/organize/local-events/cultural-events-you-must-not-miss/dipavali) ;
- Cavadee : Thaipoosam, pleine lune du mois tamoul de Thai (https://www.qppstudio.net/global-holidays-observances/thaipusam.htm,
  https://www.officeholidays.com/holidays/mauritius/thaipoosam-cavadee) ; un temple peut la décaler d'un jour ;
- Nouvel An chinois : fête du Printemps (https://chinahighlights.com/travelguide/festivals/when-chinese-new-year.htm).

**Fête des letchis** : aucune date officielle ; fenêtre fixe au cœur de la saison des letchis (mi-décembre).

**Toussaint** : pas d'entrée à elle. Elle est dans la fenêtre d'Halloween, dont le cœur va désormais du 31 octobre au
1er novembre. Un monde qui la veut (Fénoir : la Toussaint au cimetière, très suivie à La Réunion, sujet fort dans un monde où
les morts se relèvent) décline `halloween` sous le nom de la Toussaint. Deux fêtes concurrentes pour les mêmes jours se
gêneraient (une seule est retenue chaque jour) ; la règle « fêtes populaires seulement » reste : on ne célèbre pas un deuil,
on raconte ce qu'un peuple fait ce jour-là.

En mode automatique, la fête du monde est **la plus prioritaire des fêtes du jour que le monde décline** : un monde qui ne
décline que Noël garde Noël le 31 décembre.

Pas d'autre fête au calendrier : pas de commémoration historique ou religieuse grave.

## 2. Réglages

- **`fete`** (monde, fenêtre des réglages « Fête de saison ») : `auto` (défaut, selon la date), `aucune`, ou l'id d'une fête
  pour la **forcer** hors saison (Halloween en juillet). Forcer une fête que le monde ne décline pas ne fait rien ; le MJ actif
  en est prévenu par un avis.
- **`effetsDeFete`** (client, « Effets visuels des fêtes », coché par défaut) : chaque joueur coupe le décor chez lui
  (accessibilité, petites machines). Le `prefers-reduced-motion` du système est respecté de toute façon (rien ne tombe).
- `feteCarte` (monde, caché) : la dernière carte du jour, `"AAAA-MM-JJ|<fête>"`.

## 3. Enregistrer une déclinaison

```js
// Dans le module du monde : à charger au niveau du module (ou dans init/setup), PAS dans « ready ».
// À faire dans CHAQUE navigateur (joueurs compris) : le registre vit en mémoire, il n'est pas écrit dans le monde.
Hooks.once("lakour-mj-ia.pret", api => {
  if (game.system.id !== "dnd5e") return;    // le module n'est actif que dans son monde, mais restez prudents
  api.fetes?.enregistrer({
    id: "treve-des-presents",                // minuscules, chiffres, tirets ; unique
    fete: "noel",                            // id du calendrier ci-dessus
    nom: "La Trêve des Présents",            // la fête à la mode du monde (défaut : le nom du calendrier)
    description: "Au Carrefour, l'Épineux du relais ploie sous les grelots ; Horde et Alliance échangent des cadeaux.",
    consigne: "C'est la Trêve des Présents dans les Tarides : Horde et Alliance échangent des cadeaux",
    decor: { palette: "sapin", ornements: ["guirlandes", "bougies"] },
    contenu: [
      { uuid: "Compendium.lakour-warcraft.objets.Item.xxxxxxxxxxxxxxxx", nom: "Grelot de l'Épineux" },
      "Compendium.lakour-warcraft.tables.RollTable.yyyyyyyyyyyyyyyy"
    ]
  });
});
```

Le crochet `lakour-mj-ia.pret` est appelé une fois, dans le `ready` du moteur, avec l'API en argument (`main.js`). Un
enregistrement plus tardif (`game.modules.get("lakour-mj-ia").api.fetes.enregistrer(…)` après le démarrage) marche aussi : la fête
est revue aussitôt.

### Champs

| Champ | Obligatoire | Règle |
|---|---|---|
| `id` | oui | `^[a-z0-9][a-z0-9-]{0,63}$`, unique |
| `fete` | oui | un id du calendrier ; sinon **erreur** « fête inconnue » |
| `nom` | non | 80 caractères ; défaut : nom du calendrier |
| `description` | non | 600 caractères ; affichée sur la carte du jour |
| `consigne` | non | 300 caractères ; donnée au narrateur IA (voir §5). Une phrase factuelle sur le monde, pas un ordre |
| `decor` | non | voir §4 ; défaut : le décor de la fête |
| `contenu` | non | 8 liens au plus : un uuid (`"JournalEntry.abc"`, `"Compendium.mod.pack.JournalEntry.abc"`, `RollTable`, `Item`…) ou `{ uuid, nom }` |

Erreurs (levées par `enregistrer`, visibles dans la console) : id absent ou mal formé, fête inconnue, **id déjà enregistré**,
**fête déjà déclinée** dans ce monde (une déclinaison par fête), palette ou ornement inconnus, plus de 3 ornements, uuid
illisible, plus de 8 liens. Le texte est nettoyé (espaces) et tronqué ; les accolades et crochets sont retirés des libellés de
liens.

### Lire

- `api.fetes.enregistrer(def)` → la déclinaison normalisée (copie).
- `api.fetes.active()` → la déclinaison de la fête en cours **dans ce navigateur**, ou `null` :
  `{ id, fete, nom, description, consigne, decor: { palette, ornements }, contenu: [{ uuid, nom? }] }`.
- `api.fetes.lister()` → toutes les déclinaisons enregistrées (copies).
- `api.fetes.calendrier(date?)` → les fêtes du calendrier ce jour-là, déclinées ou non :
  `[{ id, nom, debut: "AAAA-MM-JJ", fin, coeur }]`, de la plus prioritaire à la moins.
- `api.fetes.decors()` → `{ palettes: [...], ornements: [...], parDefaut: { <fête>: { palette, ornements } } }`.
- `api.fetes.verifier()` → revoit la fête maintenant (rend la déclinaison active) ; `api.fetes.rafraichir()` redessine le décor.
- `api.fetes.sourceDeDate(fn)` → pour un monde qui a **son propre calendrier** : `fn()` rend une `Date`, `"AAAA-MM-JJ"`, ou
  `null` (la date du navigateur). La fête du monde, son décor, la ligne du narrateur et `calendrier()` sans argument suivent
  alors cette date ; la carte du chat reste **une par jour local** et par fête. Branchez-la **au crochet `pret`** (avant le
  premier calcul : sinon la fête de la date réelle s'affiche un instant, et sa carte part), dans chaque navigateur, et appelez
  `api.fetes.verifier()` quand la date du monde change. `sourceDeDate(null)` revient à la date du navigateur ;
  `api.fetes.dateDuMonde()` rend la date utilisée.

Pourquoi : le 5 novembre 2026 (date réelle), un monde de Fénoir au 4 décembre 2026 (date de jeu) recevait la carte de la
Dipavali (fenêtre réelle du 5 au 11 novembre) : au chargement, le moteur calculait sa fête à la date réelle avant que le
système, qui force le réglage `fete` à la fête du jour de jeu, ait pu l'écrire (écriture asynchrone, après le crochet `pret`).

### Crochet

`Hooks.on("lakour-mj-ia.fete", (ancienne, nouvelle) => …)` : dans chaque navigateur, quand la fête du monde **change**
(passage de minuit, réglage `fete` changé, enregistrement tardif). `ancienne` et `nouvelle` sont des déclinaisons (copies) ou
`null`. **Il n'est pas appelé au chargement** : lisez `api.fetes.active()` au `pret` ou au `ready` pour l'état initial.

## 4. Le décor

`decor` accepte :

- rien → le décor par défaut de la fête ;
- une chaîne → un ornement (`"lanternes"`), avec la palette par défaut de la fête ;
- `false` ou `"aucun"` → aucun ornement (la palette reste, pour votre propre CSS) ;
- `{ palette, ornements }` → `ornements` : une chaîne ou un tableau, **3 au plus**.

**Palettes** (trois couleurs, variables CSS `--lakour-fete-c1`, `--lakour-fete-c2`, `--lakour-fete-c3`) :
`sapin` (vert, rouge, or), `givre` (bleus pâles, blanc), `braise` (orange, brun noir, jaune), `crepuscule` (violet, orange,
nuit), `rose`, `printemps` (pastels), `carnaval` (rouge, turquoise, orange), `soleil` (jaune, orange, bleu), `or` (or, brun,
crème), `nuit` (bleu nuit, argent, or).

**Ornements** (glyphe ; ✱ = tombe doucement sur l'écran ; ⌇ = guirlande en haut du chat) :
`neige` ❄ ✱, `confettis` ✦ ✱, `coeurs` ♥ ✱, `notes` ♪ ✱, `feuilles` 🍂 ✱, `guirlandes` ✶ ⌇, `etoiles` ✧, `citrouilles` 🎃,
`lanternes` 🏮, `oeufs` 🥚, `bougies` 🕯, `masques` 🎭.

**Décors par défaut** : Nouvel An `nuit` + confettis, étoiles · Noël `sapin` + neige, guirlandes · Pâques `printemps` + œufs ·
Carnaval `carnaval` + confettis, masques · Halloween `braise` + citrouilles, feuilles · Saint-Valentin `rose` + cœurs ·
Musique `soleil` + notes.

Ce que voit chaque navigateur (CSS seulement, pas de canvas) :

- le **premier ornement** donne le glyphe posé après le nom de l'orateur sur les cartes du MJ IA
  (`.chat-message.lakour-mjia-message .message-sender::after`) ;
- le premier ornement **qui tombe** (✱) : 12 glyphes, lents, translucides, sans clic (`#lakour-fete-decor`) ;
- `guirlandes` : une rangée d'ampoules aux couleurs de la palette en haut de l'onglet du chat (`#chat::before`).

### Classes du `body`

- toujours, quand une fête est active dans le monde : `lakour-fete`, `lakour-fete-<fete>` (repères **sans effet visuel**) ;
- avec les effets (réglage client coché) : `lakour-fete-effets`, `lakour-fete-palette-<palette>`, `lakour-fete-orn-<ornement>`
  (un par ornement), `lakour-fete-glyphe-<premier ornement>`.

Le préfixe `lakour-fete-` est réservé au moteur (il retire toutes ces classes à chaque changement). **Votre propre CSS
décoratif doit passer par `body.lakour-fete-effets`** pour respecter le réglage du joueur, et couper ses animations sous
`@media (prefers-reduced-motion: reduce)` :

```css
body.lakour-fete-effets.lakour-fete-noel .ma-fiche header { border-bottom: 2px solid var(--lakour-fete-c1); }
```

## 5. Ce que fait le moteur quand une fête est active

- **Carte au chat** : publique, sobre (nom, nom du calendrier entre parenthèses s'il diffère, description, liens `@UUID`
  enrichis par Foundry), **une fois par jour et par fête** dans le monde, posée par le **MJ actif seul** (le jour : celui de son
  navigateur). Drapeau `flags["lakour-mj-ia"].ia` : elle ne revient pas à l'IA comme un message de joueur.
- **Narrateur IA** : une ligne dans l'état du jeu (`contexte.js`, `etatDuJeu`) :
  « Fête en cours dans ce monde : Vigile des Cierges (Noël). <consigne>. Tu peux y faire allusion quand c'est naturel, sans
  insister ni en parler à chaque réponse. » Aux Veillées (`lakour-loups`), elle ajoute que la date seule ne change rien aux
  règles : seule une veillée de fête choisie à la distribution (inscrite au Registre) en ajoute, sans trahir ses secrets.
  Quand une veillée de fête est en jeu aux Veillées (`game.lakourLoups.fete()`), la ligne vient d'elle, même hors saison :
  `ligneContexte(d, systeme, { veillee, declinaisonVeillee })` appelle `ligneVeillee`, qui donne son nom, ses règles publiques,
  la consigne de la déclinaison et la garde des secrets. Les compagnons IA ne la reçoivent pas.
- **Aux Veillées, aucune incidence sur les secrets** : rien de la partie n'est lu ni écrit ; la carte et la ligne ne parlent
  que de la fête. N'y mettez rien qui dépende des rôles.
- **Changement de jour** : revu juste après minuit (et au moins une fois par heure), au chargement, et quand le réglage
  change.

## 6. Conseils aux auteurs de monde

- Ne déclinez que ce qui a du sens dans votre monde ; mieux vaut deux fêtes soignées que sept plaquées.
- `consigne` : un fait d'ambiance que le narrateur peut glisser (« les tavernes d'Hurlevent servent du vin chaud »), jamais une
  obligation (« parle de Noël »). Le moteur ajoute lui-même la retenue.
- `contenu` : des documents que **les joueurs peuvent ouvrir** (droits Foundry) si la carte les montre à tous ; n'y mettez **jamais** un journal ou
  une table réservés au MJ : un document de compendium prend le droit du **compendium**, pas le sien, et un journal
  d'un compendium ouvert aux joueurs (`PLAYER: OBSERVER`) s'ouvre depuis la carte. Liez ces journaux depuis le guide du MJ.
- Pas de secret dans la description ni dans la consigne (la carte est publique).
