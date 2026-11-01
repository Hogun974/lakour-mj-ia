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
