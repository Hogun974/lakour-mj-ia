# Voix en direct, écoute des joueurs et salons vocaux — contrat

Demandes de Jordan (01/11/2026) :
- « pour toutes les IA, mets le son directement, les 2 secondes on les ressent » ;
- « les discussions passent en speech to text (pour le MJ et les IA) » ;
- aux Veillées : les morts parlent entre eux en entendant les vivants, sans que les vivants les entendent ; les loups ont leur
  discussion entre eux ; la nuit personne ne parle, sauf les loups entre eux. Fait dans Foundry (voix intégrée, A/V), pas Discord :
  Discord ne permet pas l'écoute à sens unique et ne donne pas accès au son des joueurs pour la transcription.

Trois pièces, qui doivent s'emboîter :

## 1. Voix en direct (moteur `lakour-mj-ia`)

- La voix OpenAI (API Realtime, `gpt-realtime-2.1-mini`) produit du PCM 24 kHz par morceaux (`response.output_audio.delta`).
  Aujourd'hui : on attend la fin, on assemble un WAV, on le dépose dans Data, puis `AudioHelper.play(…, true)` le fait télécharger
  à chacun : c'est la latence ressentie.
- Désormais : chaque morceau de PCM part dès sa réception vers les navigateurs qui doivent l'entendre, par le canal du MJ IA
  (`canal.js`, socket à destinataires `{ recipients }`), et chaque navigateur le joue aussitôt par WebAudio, avec une petite
  mémoire tampon (≈ 150–250 ms) pour absorber les à-coups. Le WAV complet est ensuite déposé seulement pour la réécoute (🔊).
- Le volume suit le réglage d'écoute de chaque joueur ; l'atténuation de l'ambiance (0.26.1) s'applique au début et à la fin
  de la voix en direct.
- **Toutes les IA parlent** : le narrateur, et chaque compagnon IA avec sa propre voix (choisie dans la liste des voix Realtime
  selon son tempérament, mémorisée sur l'acteur). Les répliques des compagnons passent par le même chemin. Une seule voix à la fois
  (file d'attente), le narrateur prioritaire.
- Destinataires : par défaut tout le monde ; aux Veillées, une voix ne part que vers ceux qui peuvent l'entendre (voir §3 :
  une réplique d'un compagnon mort ne va qu'aux morts, celle d'un loup la nuit qu'aux loups).
- Repli : sans clé OpenAI ou budget atteint, voix du navigateur ou texte seul, comme avant.

## 2. Écoute des joueurs : parole → texte (moteur `lakour-mj-ia`)

- **Seulement quand une IA doit écouter** (demandes de Jordan, 01/11/2026) : pendant une séance du MJ IA (« Démarrer la séance »
  → « Terminer la séance » ou arrêt du pilote), OU quand des compagnons IA vivants sont à la table, même si un MJ humain mène la
  partie sans narrateur IA (ils doivent entendre les joueurs pour débattre). Sans aucune IA à l'écoute (MJ humain, aucun
  compagnon, module inactif), aucun micro n'est écouté ni transcrit, aucun appel n'est fait. La transcription ne va alors
  qu'aux compagnons qui peuvent entendre (§3), pas à un narrateur absent.
- Prérequis : la table parle par la voix intégrée de Foundry (A/V). Le navigateur du MJ actif reçoit le flux micro de chaque
  joueur (`game.webrtc.client` : flux par utilisateur), ce qui donne le nom du locuteur sans deviner.
- Pour chaque joueur qui parle, le son est transcrit par OpenAI (session Realtime de transcription, ou découpage par silences et
  `audio/transcriptions` ; modèle de transcription le moins cher par défaut, réglable). Le MJ peut couper l'écoute (réglage), et
  chaque joueur est prévenu par une icône que sa voix est transcrite.
- Chaque phrase transcrite devient un événement `{ userId, nom, texte, quand }` :
  - le **MJ IA** la reçoit dans sa file comme un message de joueur (« 🗣️ Jordan (à voix haute) : … ») — elle n'est pas publiée
    dans le chat des joueurs ; une option montre la transcription au MJ humain en privé ;
  - les **compagnons IA** l'ajoutent à ce qu'ils savent, **seulement s'ils pouvaient l'entendre** (§3).
- Coût compté dans le budget de séance. Pas de transcription la nuit pour qui ne doit rien dire, ni des humains morts vers les
  vivants (§3).

## 3. Salons vocaux des Veillées (système `lakour-loups`)

Une seule matrice décide « qui entend qui » et « qui peut parler », selon la phase et l'état, et sert à trois choses : régler la
voix Foundry de chaque navigateur, choisir les destinataires de la voix des IA (§1), et router la transcription (§2).

| Qui parle            | Jour : entendu par            | Nuit : entendu par            |
|----------------------|-------------------------------|-------------------------------|
| un vivant            | tous (vivants et morts)       | personne (micro coupé) — sauf un loup : les loups (et les morts si `mortsVoientTout`) |
| un mort              | les morts seulement           | les morts seulement           |
| un réduit au silence | personne pendant « jour » et « vote » de ce jour-là | personne |

- API attendue du système : `game.lakourLoups.audibilite(locuteurUserId)` → `{ peutParler: Boolean, auditeurs: [userId] }`
  (calculée depuis l'état public et le camp du locuteur, chez le MJ actif) et un hook `lakourLoups.audibilite` à chaque changement
  (phase, mort, silence). Pour les compagnons (sans utilisateur), même question par acteur : `audibiliteActeur(acteurId)`.
- Côté chaque navigateur : couper localement les flux des gens qu'on ne doit pas entendre, et le micro quand on ne doit pas parler
  (A/V de Foundry : réglages client par utilisateur, `toggleAudio`, etc. — à vérifier dans le code client v14). Le bandeau du
  plateau affiche l'état : « 🔇 La nuit, silence », « 🐺 Tanière : tu parles aux loups », « 👻 Tu parles aux morts ».
- Le secret : un non-loup n'apprend rien (la nuit il n'entend personne) ; un loup apprend qui sont les autres loups, comme dans le
  jeu. Les règles sont appliquées dans chaque navigateur : contournables par un tricheur, acceptable entre amis.
- Les salons vocaux (couper flux et micros selon la matrice) appartiennent au système, pas au MJ IA : ils marchent aussi avec un
  MJ humain et la Table des Veillées seule. Seule la transcription (§2) et la voix des IA (§1) dépendent d'une séance du MJ IA.
- Le moteur du MJ IA consulte `audibilite` s'il existe ; dans les autres mondes (40k, Warcraft), tout le monde entend tout le monde.

## Mise en œuvre (MJ IA 0.28.0) : §1 et §2

### Voix en direct
- `scripts/voix-flux.js` (logique pure) : `Calendrier` (lecture bout à bout, 200 ms de tampon au départ et après un trou, au plus
  300 s d'avance en mémoire), `RecepteurFlux` (flux inconnu ignoré : un joueur arrivé en cours de route attend le flux suivant ;
  doublon ou retardataire jeté ; perte comptée, la lecture continue ; flux muet 20 s oublié), `FileDesVoix` (une voix à la fois,
  dans l'ordre où les textes paraissent dans le chat, sans passe-droit pour le narrateur ; personne n'est coupé), `destinatairesVoix`, `GardeLecture` (le début de l'audio est
  retenu jusqu'à ce que la transcription renvoyée par l'API montre que le modèle dit bien le texte, ou 1,5 s d'audio : une lecture
  infidèle n'est jamais entendue ; une lecture qui s'emballe est coupée), `voixPourCompagnon`, `tonPourCompagnon`, `paroleSeule`.
- `fournisseurs/openai.js`, `voixEnFlux` : même session Realtime qu'avant, chaque morceau rendu dès que la garde le laisse passer ;
  deux lectures infidèles, ou un modèle non Realtime : fichier entier (ancienne voix).
- `scripts/voix.js`, côté MJ actif : un `TourDeParole` par voix (narrateur : `VoixEnDirect`, même interface qu'avant ; compagnon :
  `direReplique`). Messages du canal `voix-debut`, `voix-morceau { flux, n, pcm }` (base64 tel que rendu par l'API, rien à
  réencoder), `voix-fin { total }`, avec `{ recipients }`. La synthèse avance pendant la mise en place du plateau ; les morceaux sont
  gardés jusqu'à l'affichage de la narration. Le MJ estime la fin de la lecture avec le même calendrier que les joueurs avant de
  rendre la parole et l'ambiance (atténuation 0.26.1 gardée). Le WAV complet est déposé ensuite (bouton 🔊, aussi sur les répliques
  de compagnons). Garde-fou : un tour que personne ne termine rend la parole au bout de 30 s.
- Réplique PRIVÉE (0.34.0 ; ses destinataires ne sont qu'une partie des connectés : un mort qui ne parle qu'aux morts, les loups
  la nuit) : jamais déposée dans Data, que Foundry sert à qui en connaît l'adresse. En direct, ses morceaux vont aux seuls
  destinataires ; en repli, le fichier entier aussi, par le canal (`voix-privee { id, n, total, mime, donnees }`, morceaux de
  256 Ko de base64, 4 Mo au plus, sinon texte seul), lu chez eux depuis un Blob (`URL.createObjectURL`) puis libéré ; pas de
  réécoute. Au premier démarrage du MJ actif en 0.34.0, les fichiers de `voix/<monde>/` qui ne sont pas la réécoute d'un message
  public sont écrasés par un silence (Foundry n'offre pas de suppression de fichier côté client) et les messages chuchotés
  perdent leur bouton 🔊 (voix.js, `nettoyerVoixPrivees`).
- Côté chaque navigateur : `LecteurVoix` joue en WebAudio dans le contexte « interface » de Foundry (son volume général compte),
  au volume `volumeVoix`, seulement si `entendreNarration` (le décocher coupe net ce qui joue) ; seul un MJ peut envoyer une voix
  (canal.js). Son verrouillé (aucun geste dans la page) : flux ignoré.
- Compagnons : voix choisie selon le tempérament, mémorisée sur l'acteur (`flags.lakour-mj-ia.voix = { voix, ton }`) ; seule la
  parole est lue. Destinataires : tous, ou aux Veillées `audibiliteActeur(acteurId).auditeurs` connectés plus les MJ ; `peutParler`
  faux : pas de voix. Le narrateur reste entendu de tous.
- Replis : flux en échec avant le moindre son → fichier entier joué par Foundry chez les mêmes destinataires (jamais une liste vide,
  qui partirait à tous) ; réglage « Voix OpenAI en direct » décoché → ancien chemin ; sans clé OpenAI ou budget atteint → narration
  marquée `repliNavigateur` (chaque navigateur la lit avec sa voix), compagnons en texte seul.
- Pilote automatique : attend `voixAuRepos()` (file vide) au lieu de l'ancienne chaîne de lecture.

### Écoute des joueurs
- `scripts/ecoute.js` (pur) : `ecouteActive`, `DecoupeurSilences` (blocs de 20 ms à 16 kHz ; parole au-dessus de max(-48 dBFS,
  bruit de fond + 12 dB) ; 0,3 s de son d'avant ; fin après 0,7 s de silence ; coupe forcée à 15 s ; moins de 0,4 s de parole jeté ;
  un son continu de 15 s sans creux devient le bruit de fond), `routerParole` et `deduireActeursAuditeurs`, `coutTranscription`
  (prix à la minute : gpt-4o-mini-transcribe 0,003 $ par défaut, gpt-4o-transcribe et whisper-1 0,006 $ ; à revérifier sur la
  facture), `transcriptionUtile` (phrases inventées sur un silence), `estEcho` (voix d'IA reprise par un micro), `ligneParole`.
- `scripts/transcription.js` (`EcouteJoueurs`, chez le MJ actif) : revue toutes les 4 s et à chaque changement (A/V, connexion,
  phase, morts, compagnons). Écoute si : MJ actif, réglage `ecouteJoueurs`, A/V en mode audio (« Audio seulement » à La Kour, aucune
  dépendance à la vidéo), clé OpenAI, `ecouteActive`. Flux de chaque utilisateur par `game.webrtc.client.getMediaStreamForUser(userId)`
  (vérifié dans le client v14, SimplePeer : flux local pour soi, flux reçu du pair sinon ; un micro coupé ou une touche de parole
  relâchée met la piste à `enabled = false`, donc du silence). Pistes audio seulement, branchées aussi sur un élément `<audio>` muet
  (sans quoi Chrome ne livre pas le son d'un flux WebRTC distant à WebAudio), capture par AudioWorklet (repli ScriptProcessor).
  Segment → WAV 16 kHz → `audio/transcriptions` (langue fr, noms propres en consigne) → coût par `moteur.compterCout` (séance ou
  « compagnons hors séance »).
- Aucun appel si aucune IA ne doit entendre (route calculée au moment où le joueur parle : `peutParler` faux, ou ni séance ni
  compagnon qui l'entend) ni au budget atteint.
- Événement `{ userId, nom, texte, quand }` (nom : « Mathurin (Jordan) », personnage puis joueur), hook `lakourMjIa.transcription` :
  - MJ IA en séance : `moteur.signaler("🗣️ Nom (à voix haute) : …")`, source « humain » si un compagnon l'a entendue (il pourra
    répondre, règles de rythme habituelles), sinon « annonce » (pas de réveil des compagnons). Parole restreinte : « entendu seulement
    de …, n'y réponds pas devant les autres ». Jamais publiée dans le chat ; réglage `transcriptionAuMJ` : chuchotée aux MJ (drapeau
    `ia`, donc ni relue par le MJ IA ni par les compagnons).
  - Compagnons : `entendreParole` (mémoire du MJ actif, 40 phrases, vidée à chaque nouvelle partie) ; la vue d'un compagnon mêle au
    chat public, dans l'ordre du temps, ce qu'il a entendu. Hors séance aux Veillées : `sansNarrateur.entendre` (débat du jour).
- Icône : réglage monde `ecouteEnCours` écrit par le MJ actif ; chaque navigateur affiche la pastille « L'IA écoute » (seulement si
  un MJ est connecté) et appelle le hook `lakourMjIa.ecoute(actif)`, que le bandeau des Veillées peut reprendre.
- Réglages : `voixDirecte`, `ecouteJoueurs`, `modeleTranscription`, `transcriptionAuMJ` (monde) ; `entendreNarration`,
  `volumeVoix` (client, s'appliquent aussi à la voix OpenAI).

### Audibilité (contrat avec le système lakour-loups)
- Utilisé : `audibilite(userId) -> { peutParler, auditeurs, acteursAuditeurs? }`, `audibiliteActeur(acteurId) -> { peutParler,
  auditeurs }`. Le moteur interroge à chaque phrase ; le hook `lakourLoups.audibilite` n'est pas nécessaire.
- Sans `acteursAuditeurs` dans `audibilite(userId)`, déduction prudente : un compagnon entend si tout le monde entend, ou si un
  humain dans sa situation (vivant/mort ; la nuit, loup ou non) est parmi les auditeurs, ou si le locuteur entend ce compagnon
  (`audibiliteActeur`) et que le locuteur est vivant ou le compagnon mort. Cas manqués : un compagnon mort n'entend un mort que si
  un autre humain mort l'entend aussi ; la nuit, sans `audibiliteActeur`, un compagnon loup seul avec un humain loup ne l'entend pas.
  **Demande** : que `audibilite(userId)` renvoie aussi `acteursAuditeurs`.

### Essais (`npm run essais`)
`essais/voix-flux.test.mjs` (calendrier, réception, file, destinataires, garde, voix des compagnons, voix en flux sur faux
WebSocket, mutations), `essais/ecoute.test.mjs` (règle d'écoute, découpage sur niveaux simulés, coût, filtres, routage, mutations),
`essais/voix-direct.test.mjs` (voix.js et transcription.js avec doublures : flux, ordre, destinataires, replis, lecture WebAudio
doublée, aucun appel inutile, routage aux Veillées). Aucun appel facturé.

### À vérifier en jeu seulement
- La latence ressentie (premier son) et l'absence de craquements entre morceaux sur le vrai réseau ; la charge du serveur Foundry
  (environ 64 Ko/s de voix par joueur pendant qu'une IA parle).
- La voix de Foundry en **Audio seulement** : que le navigateur du MJ reçoit bien le son de chaque joueur (P2P sans serveur TURN : un
  joueur derrière un réseau strict peut ne pas être relié au MJ, donc ni entendu ni transcrit) ; Firefox et Chrome.
- Les seuils du découpage (-48 dBFS, marge 12 dB) avec de vrais micros, et la qualité de gpt-4o-mini-transcribe en français.
- L'écho (joueur sans casque) : le filtre textuel suffit-il ?
- L'icône « L'IA écoute » (position en haut au centre) et le réglage A/V de chaque joueur (mode de parole).
