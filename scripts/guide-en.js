// Guide d'utilisation du MJ IA, version anglaise : traduction de scripts/guide.js, section par section (même clé, mêmes titres
// « # », mêmes listes, mêmes noms d'outils et d'API ; les libellés d'interface sont ceux de lang/en.json). Installé à la place
// du français dans les mondes anglais (installerGuide, guide.js) et recopié dans docs/guide-utilisation.en.md.
// Toute modification de guide.js se reporte ici : essais/guide.test.mjs vérifie que les deux langues se correspondent.
// Les noms que l'interface n'affiche qu'en français (paliers de réputation, attitudes, pages et dossier des histoires,
// personnalités) restent en français, suivis de leur sens.

export const GUIDE_MJ_EN = [
  { cle: "demarrer", titre: "Getting started", texte: `
# In two minutes

- **Keys**: Game Settings › Configure Settings › MJ IA › **Configure**. Choose the GM provider (Claude or ChatGPT), paste its key and check it. Voice and images go through OpenAI: without an OpenAI key, no paid voice and no images. Keys stay in YOUR browser, never in the world.
- **Personality**: Settings › MJ IA › Personalities › **Edit**. Choose the tone, violence, answer length, rules strictness, freedom with the scenario and voice.
- **Console**: the **wizard hat** button in the left toolbar (token layer). Pick the personality, then **Start session**.
- **Play**: players write in the chat. The AI GM answers a few seconds after they have finished writing, places the tokens on the map before narrating, starts the ambient sounds and asks for rolls.
- **Finish**: **End session**. The AI awards experience, writes the chronicle for the players and updates its campaign memory.` },
  { cle: "console", titre: "The AI GM console", texte: `
- **Start session / End session**: the AI only answers during a session. A session left open when the GM left is stopped when they come back.
- **Whisper a secret instruction**: an instruction only you and the AI can see ("have an assassin show up in the next scene").
- **Prepare a scenario**: give a theme; the AI creates journals, NPCs and maps, outside the session.
- **Create a character with the GM**: the AI guides the player in the chat and creates THEIR full sheet (Imperium Maledictum, D&D 5e, Fénoir), then writes their backstory with them. A connected player with no character is offered a creation automatically.
- **Player vision**: repairs the characters' vision (if they see only black on a map).
- **Estimated cost**: what the session has cost at the provider; a budget per session stops the AI when it is exceeded.` },
  { cle: "reglages", titre: "Useful settings", texte: `
- **Autonomy**: "Human GM approval" asks you to approve sensitive actions (creating a sheet, removing someone, changing an item); "Autonomous" lets the AI act.
- **Delay before answering**: how long the AI waits for the players to finish their messages.
- **Narrator voice**: none, browser (free, each player on their own computer) or OpenAI (paid, live, and each AI companion has its own). Each player chooses whether they hear it.
- **Set up the board before narrating**: the AI places NPCs, crowds and characters where it describes them before showing its narration.
- **Reactions**: the AI can react to the players' movements and to opened doors, and play the NPCs in combat.
- **Visual style**: flat or relief maps and tokens.
- **Seasonal festival**: automatic (by date), none, or a forced festival; each player turns off *Festival visual effects* on their own screen.` },
  { cle: "capacites", titre: "What the AI can do", texte: `
- **Board**: create playable maps (walls, doors, lights, ambient sounds, zones hidden from players), change them during play (a lore zone that shows up when a token enters, a trap that pauses the game, stairs that teleport, darkness, a pin to a journal, a localised sound), bring the characters there, place NPCs and extras "near the well", remove them, set vision, lights, doors and fog, switch to the 3D view (3D Canvas) and frame the camera.
- **Story**: voice, images (OpenAI), ambient sounds (wind, rain, tavern, forge, tension…), secret messages to a single player, group votes and secret choices; **show a handout** to the players (a letter, a contract, page by page), never a GM-only journal; roll on the module's tables (rumours, faces, complications…).
- **Rules**: request pre-filled rolls (difficulty, modifiers), roll the NPCs' dice, run combats.
- **Campaign**: experience, levelling up (D&D 5e) or spending XP (Imperium Maledictum), money, items, merchants, a chronicle the players can read, campaign memory.
- **Effect modules** (only if they are active in the world): spell, shot, explosion and healing animations (**Sequencer** + **JB2A**), weather on the map (**FXMaster**: rain, storm, snow, fog, embers…), date, time and the day's weather (**Calendaria**, 40k and Warcraft), loot piles, chests and merchants (**Item Piles**, Warcraft).
- **Scenario**: follow the written adventure, or adapt it during play according to its freedom (faithful, adaptive, free); every rewritten page keeps its previous version.` },
  { cle: "mondes", titre: "The three worlds", texte: `
# Warhammer 40,000 — Imperium Maledictum
Modules **lakour-mj-ia** and **lakour-40k** (or **lakour-40k-en** in English). Original content from the Kour subsector: origins, factions, roles, talents (some of them automated), weapons, bestiary, two adventures and a campaign, ready-to-use locations, GM tables (Patron, missions, investigation, hive, Warp, loot…). **La Kour sheet**: a header with Origin, Faction, Role and Patron, gauges, an inventory by category with icons and encumbrance (you can switch back to the impmal sheet in the sheet configuration). The creation assistant equips the character (armour worn, weapon in hand, ammunition). Adventure maps pinned to the GM journal, with sounds and zones. To install: Settings › La Kour 40k › Install, or import the adventure from the **Adventures** compendium (also offered when a world is created).

# Warcraft — D&D 5e
Modules **lakour-mj-ia**, **lakour-warcraft** (or **lakour-warcraft-en** in English), **dnd5e_fr-FR**, **babele**, **fr-core** (the last three for a French world). Peoples of Azeroth, backgrounds, **8 subclasses** (Domain of the Elements, Silver Hand, Emerald Dream, Gladiator of Orgrimmar, Illidari Demon Hunter, Pact of the Fel, Kirin Tor, SI:7), **feats** and **affiliations**, homebrew **spells** (in the class lists), an **arsenal** (faction weapons, armour, ammunition, prostheses, magic items), **afflictions** (wounds, diseases, fel corruption), a bestiary in the factions' colours, a starting adventure and a campaign, metric units. Linked journals and clickable rolls; pinned maps, with sounds and zones. To install: Settings › La Kour Warcraft › Install, or import the adventure from the **Adventures** compendium (also offered when a world is created).

# The Vigils of Brumecombe — an original werewolf game
Modules **lakour-mj-ia**, **lakour-veillees** (or **lakour-veillees-en** in English), **fr-core** (for a French world), system **lakour-loups**. Recommended personality: *La Voix de la brume* (the Voice of the Mist). The AI builds a balanced game for the number of players (or takes your list), deals the roles in secret, runs the nights, the dawn and the vote. The **Game Table** (a button in the left toolbar) shows the game to everyone. A timed vote closes by itself at zero; every finished game goes into the **Chronicles of Brumecombe** (hall of fame). Mist falls at night and the screen shakes at a death ("Visual effects" client setting). Every building on the map is pinned to its rules page.` },
  { cle: "compagnons", titre: "AI companions", texte: `
# Players run by the AI
To fill a table: player-side characters, played by an AI as if they were players. Each one has **its own brain** (a call to the model separate from the GM's) and only knows what its character knows: its sheet, what it was told in private, the public chat, what it sees. It does not cheat: no GM prompt, no campaign memory, no one else's role, no hidden tokens, no whispers.

- **In the Vigils of Brumecombe**: ask the AI GM for a game "with 3 companions". They get seats (names drawn from the village table, a random personality), choose in secret at night, coordinate as a pack if they are wolves, speak in the debate and vote. Their secret notebook stays with the GM.
- **In 40k and Warcraft**: ask "add a companion to the party". The AI GM creates its full sheet (as for a player, with no player assigned), gives it a temperament and a backstory and places its token near the party. After each narration, the companions present can react in the chat; in combat, on their turn, they declare their action and the AI GM resolves it with the real rolls of their sheet, rolled directly. They vote in group votes and answer secret choices.
- **Removing them**: "Varn leaves us" (his token goes, his sheet stays) or "Varn stays in the village" (he becomes a plain NPC).
- **Settings**: *AI companions model* (empty = Claude Haiku 5.5, or OpenAI's cheapest) and *AI companions chattiness* (silent, quiet, normal, chatty: 0 to 3 lines after each AI GM answer, one per companion; never two companions answering each other without a player having written).
- **Cost**: one short call per line or per decision, to the companions model, counted in the session's cost and budget. Without a key, with the budget reached or with the fake provider, they play in simple mode, without AI, and the game is never blocked.
- **Their gestures**: a companion says what it does itself, the way plays do, with a short stage direction in italics before its words ("*Valentin looks at Clémence, arms crossed.* — Me, I saw her go out last night."). The AI GM no longer narrates those gestures or lines: in the Vigils, it sticks to the night, the dawn, the deaths, running the debate and the results.

# Autopilot: when only AIs are left
In **Autonomous** mode, if no human player is in the game any more (in the Vigils: no living villager held by a player, the dead may watch; in 40k and Warcraft: no connected player's character on the scene), the game **goes on by itself**, step by step, in front of the spectators.
- **In the Vigils**: night, dawn, a short debate between companions (two rounds of speech), vote, execution, then the next night, until victory and its ending. The autopilot never starts another game. As long as the game's secrets are not up to date for the active GM (vault being reopened), the AI GM waits: no autopilot, no model call, no companions.
- **In 40k and Warcraft**: combats go on turn after turn (a stopped combat is restarted); out of combat, a few exchanges between the AI GM and the companions, then a pause with a notice.
- **Pace**: a pause between two steps (setting *Autopilot: pause between two steps*, 4 s by default), counted after the narrator's voice has finished.
- **Safeguards**: it stops dead at victory, at the end of the session, as soon as a human player comes back, if you switch back to *Human GM approval*, at the session budget, after a maximum number of steps (a setting, 60 by default) or when the game no longer moves forward. You get a notice at every stop. Never two steps at once, never while the AI GM is thinking.
- **Taking back control**: the AI GM console shows the autopilot, with **Stop the autopilot** (or **Restart the autopilot** after a pause). The *Autopilot (companions only)* setting turns it off entirely. In *Human GM approval* mode there is no autopilot: a notice offers to switch to autonomous or to carry on yourself.
- **Cost of an autopilot round in the Vigils**: per game day, seven AI GM turns (night, dawn, answers to the two rounds of speech, vote, count, execution), about ten model calls, plus the companions' short calls (their night choices, two to four lines, one vote each: about ten for six companions).` },
  { cle: "tour", titre: "Turn by turn (40k and Warcraft)", texte: `
# Combat guided step by step
The **Turn by turn** panel (the **shield** button in the left toolbar, token layer) also opens by itself when a combat begins. It builds on Foundry's combat without replacing it, and works with or without the AI GM. At every moment, **the next step** is written at the top ("Next step: …") and the button that does it is **framed with dots**: just follow the dots.
- **Prepare**: tick the scene's tokens (players, companions and visible enemies are ticked already), **Add to combat**, **Roll initiative** (the system's own method: d20 + initiative in D&D 5e; Initiative + Reflexes in Imperium Maledictum), **Begin combat**.
- **Current turn**: who is acting (portrait, HP or wounds, defence, conditions), what they have left (D&D 5e: action, bonus action, reaction, movement in metres; Imperium Maledictum: their action and their move), their attacks and powers as buttons that open the system's **real rolls**, and the **targets** with their distance in metres, their AC or defence, and whether they are in range.
- **An NPC's turn**: a **suggestion** without AI (the nearest opponent, the best attack in range, otherwise it moves closer). **Accept** plays it: movement, attack roll, the system's damage roll. Then **Apply N damage** (the system's method: HP in D&D 5e; armour, location and criticals in Imperium Maledictum). You can also choose another target and another weapon.
- **A player's turn**: you wait for them; they see their actions in their banner. The panel follows their rolls in the chat (attack, damage, opposed test) and offers to **apply** the damage.
- **An AI companion's turn**: it acts by itself, even without an AI GM session (without AI: the suggestion), then the turn passes.
- **Reminders**: an effect that ends (**End of the effect**), concentration and saving throw after damage, regeneration, legendary actions at the end of a turn (D&D 5e), down, death saves (D&D 5e), the defender's opposed test (Imperium Maledictum: **Dodges** or **Unopposed**).
- **End**: "End turn → next", "New round", "End of combat (every enemy is down)".
- **Setting** *Only the active combatant can move* (off by default): during a combat, a player can only move the token whose turn it is; you are never blocked.
- **With the AI GM**: it reads the same next step ("Tour : X ; étape suivante : …", i.e. turn: X; next step: …) and can ask for the full state (the combat_etat tool). In a session it plays the NPCs as before: accept the suggestion only if it does not.

# Round of the table, out of combat
The panel's **Start a round of the table** button: the floor passes to each in turn (players, then AI companions). Whoever has the floor describes what their character does; their message in the chat, or their **I'm done** / **I pass** button, gives the floor to the next one. You can also press **Has spoken** or **Passes**. With the AI GM in session, it waits until everyone has spoken (or passed) before narrating what happens next, then can start another round (the tour_de_table tool).` },
  { cle: "horloges", titre: "Clocks, gauges and reputations (40k and Warcraft)", texte: `
# What moves forward off screen
The **Campaign notebook** (the **open book** button in the left toolbar, token layer, or the console's **Campaign notebook** button), **Clocks** tab, shows three kinds of items, which the AI GM creates and keeps alive with its **horloge** tool:
- **Clock**: 4 to 12 segments, in the manner of *Blades in the Dark*. A threat or a project that ripens ("the cult completes its ritual", "reinforcements arrive"): it advances when time passes or a failure feeds it, and when it is full, **it strikes**: the event happens.
- **Gauge**: a counter from 0 to its maximum, with named **thresholds**. In 40k, **Exposure** (id *exposition*): the higher it climbs, the more the team has drawn attention (a stunt, a noisy fight, a witness left behind).
- **Reputation**: a faction's points, from -100 to +100, read as **tiers** (shown in French): **Haï** (hated, -100 to -51), **Hostile** (-50 to -21), **Inamical** (unfriendly, -20 to -6), **Neutre** (neutral, -5 to +5), **Amical** (friendly, +6 to +20), **Honoré** (honoured, +21 to +50), **Révéré** (revered, +51 to +80), **Exalté** (exalted, +81 and above). A service is worth +3 to +5, a great service +10 to +15, an affront -5, a betrayal -20 to -30.

# At the table
- **Click** a pie or a bar: advance one step; **right-click** (or **−**): go back. The **eye** shows the item to the players or hides it from them: they only see what you have shown.
- When a clock strikes, a gauge crosses a threshold or a reputation changes tier, a **card** appears in the chat (whispered to the GMs if the item is hidden) and the **AI GM** is told, so it can draw a consequence.
- The AI GM sees the state of each item on every turn; its **notes** (what happens when the clock strikes) stay secret. During an interlude, it advances the factions' clocks.
- **World modules**: *game.modules.get("lakour-mj-ia").api.horloges* — *assurer(def)* creates an item if it does not exist yet (by its id) and returns it; *avancer(id, n)*; *lister()*; *palier(id)*. Only the active GM writes.
- **Reset the campaign** erases the clocks too.` },
  { cle: "enquetes", titre: "Investigations and contacts (40k and Warcraft)", texte: `
# The investigation board
The **Investigations** tab of the **Campaign notebook**. The AI GM keeps each mystery there with its **enquete** tool, following the **three clue rule**:
- **conclusions**: what the players must understand ("the deacon is lying about the mute ones");
- **clues**: where to find them (a place, an NPC, a document, a test) and which conclusions they lead to. Each conclusion should have **at least three**, through different paths: the players will miss some. The AI GM is told at every change when a conclusion has fewer than three clues left to find (marked **fewer than 3 clues** on your side).
- **Tick** a found clue or a revealed conclusion; the **eye** shows the investigation to the players, who only see its found clues and revealed conclusions.
- The AI GM has the current investigation in its context (six lines at most): it ticks what the players find and adds clues when needed.

# Contacts and debts
The **Contacts** tab. The AI GM records there, with its **contact** tool, the NPCs the characters know: faction, place, **attitude** from -3 (**Hostile**) to +3 (**Allié**, ally), through Méfiant, Réservé, Neutre, Bienveillant and Amical (wary, reserved, neutral, well-disposed, friendly; shown in French), the **debt** (who owes what to whom) and what they **ask** in return for their help.
- **+** and **−** change the attitude, the **eye** shows the contact to the players (without your notes or the history).
- The AI GM has in its context the contacts present on the scene or tied to the place, then the most recent ones (six lines at most): it brings them back, and their debts with them.
- **World modules**: *api.enquetes* and *api.contacts* — *assurer(def)* creates the item if it does not exist yet (by its id) and returns it; *lister()*; *trouver(ref)*. Only the active GM writes.
- **Reset the campaign** erases investigations and contacts too.

# What stays secret: the vault
Foundry sends the world settings to every browser, and serves the files in Data/ to anyone who knows their address. So the Notebook only keeps there, in clear text, what the players see: the items shown, without your notes, without unfound clues or hidden conclusions, without the history or the contacts' NPC. The rest of the Notebook is **encrypted** in a vault, like the **AI thread** (Data/lakour-mj-ia/fils/, which holds the game state given to the AI on every turn), in all three worlds, and private voice lines are no longer stored in Data. NOT encrypted: the campaign memory and the GM journals (scenarios, secrets), which are GM-only documents, protected by Foundry's permissions. The key stays in your browser; each player who acknowledges it keeps a **share**, and a majority of shares is needed to recover it.
- **Showing** an item takes it out of the vault (without its notes); **hiding** it puts it back. A hidden item has a randomly drawn identifier that does not reveal its name; it makes no card in the chat (you are told by a notification).
- **Backup key** (Settings › MJ IA › **Vault**): a small file to download and keep outside the world, like a password; imported on another browser, it reopens everything without the players. As soon as a key is created or renewed with no backup key downloaded, a window invites you to download it right away; "Later": a reminder on every world load until it is done (in every world, and all the more when too few players keep a share). The Vault window tells when the backup key was downloaded for the key in force; an imported key counts as downloaded.
- **New browser** (another computer, a cleared cache): a banner says so; the shares are requested from the connected players and the key from the other connected GMs. Meanwhile the visible items remain usable, but nothing is created, hidden, removed or has its secret changed, the AI starts from an empty thread and nothing encrypted is overwritten. *api.coffre.chercher()* requests the shares again.
- **Renewal** when an account is deleted, created or changes role (and on demand, from the Vault window or *api.coffre.renouveler()*): the new key only comes into force once enough players have received their shares (or its backup key has been exported); until then the old one stays in force, and nothing is ever sealed under a key that nobody could recover.
- **Passwords**: a player account without a password is a share anyone can take; without passwords, the vault protects nothing.
- **Lost key** (no shares, no other GM, no backup key): *api.coffre.abandonner({ confirmer: true })* gives up the hidden items and the encrypted threads (kept aside, unreadable); the visible ones remain.` },
  { cle: "veillees-sans-mj", titre: "Running the Vigils yourself, with AI players", texte: `
Without an AI GM session, you run the Vigils' **Game Table** yourself; **AI players** can still fill the table.
- **Adding AI players**: the Table's **+ AI player** button. Each one gets a village name and a personality; the Table's role deal counts them as players.
- **At night**: when you wake a role held by an AI player, it chooses by itself, in secret. **By day**, as soon as the phase turns to "day", the living AI players take the floor (according to *AI companions chattiness*), and they answer the human players' messages — never each other without a human. **At the vote**, they vote in the same vote as everyone else.
- **Cost**: their calls go to the console's *Companions outside a session* counter, reset at every new game and capped by the session budget; without a key or with the budget reached, they play in simple mode, without AI.
- **Another game**: with the AI GM, at the end of a game, it offers "another game with the same players?"; each game starts from scratch (the old conversation is archived, the AI players forget everything).` },
  { cle: "voix", titre: "Voice and listening", texte: `
# The AIs speak live
With the **OpenAI** voice, each piece of voice is sent to the players as soon as it is produced: the voice starts almost at once, without the two-second wait of before. The complete file is kept afterwards for the 🔊 button (listen again).
- **Every AI speaks**: the narrator, and each AI companion with its own voice, chosen from its temperament (never the narrator's, as different as possible from the other companions') and kept on its sheet. A companion only says its words: its gesture in italics is not read aloud.
- **One voice at a time**: the voices wait their turn and speak in chat order (narrator and companions, as you read them). The ambient sound is lowered while an AI speaks.
- **Who hears**: everyone, except in the Vigils, where the system says who can hear whom (a dead companion only speaks to the dead, a wolf at night only to the wolves). Everyone hears the narrator.
- **Settings**: *Live OpenAI voice* (unchecked: the old voice, recorded in full and then played). Each player sets *Hear the AI voices* and *AI voice volume* on their own computer.
- **Without an OpenAI key or with the budget reached**: the narration is read by each player's browser voice, and the companions stay in text.

# The AIs hear the players
When an AI must hear (an AI GM session is running, or a living AI companion is at the table), what players say in **Foundry's built-in voice chat** is transcribed for them. The rest of the time, no microphone is listened to and nothing is paid.
- **To enable**: Game Settings › **Configure Audio/Video**: **Audio Only** mode (no video at La Kour: nothing depends on the camera); each player chooses their microphone and a voice mode (*always*, *voice activity* or *push to talk*). The active GM must have the page open: their browser is the one listening.
- **Who spoke**: the sound arrives player by player, so the AI knows who is speaking. A muted microphone, or a released push-to-talk key, is not listened to.
- **What the AI does with it**: the AI GM receives the sentence as a message ("🗣️ Jordan (à voix haute) : …", i.e. aloud), without it appearing in the players' chat; the companions only learn of it if they could hear it (in the Vigils: a living companion does not hear the dead, at night only the wolves hear each other), and can answer it.
- **Every player is warned**: a "The AI is listening" badge at the top of the screen while listening is on.
- **Settings**: *Listen to players' speech (transcription)* (turning it off stops everything), *Transcription model* (empty: the cheapest, about 0.3 cent per minute of speech), *Show transcriptions to the GM* (whispered to the GMs; in the Vigils, shown in the GMs' chat only, without being saved). The cost goes to the session counter, or to *Companions outside a session*, capped by the budget.
- **Limits**: without a relay server (TURN), Foundry's voice goes from browser to browser; a player behind a strict network may not be heard by the GM, and so not transcribed. A player without headphones may send the AIs' voices back into their microphone: whatever sounds like what an AI has just said is ignored.` },
  { cle: "histoire", titre: "Character backstories (40k, Warcraft, Fénoir)", texte: `
# One journal per character
Each player character and each AI companion (and, if you wish, a recruit or an important NPC) has its journal **"Histoire de <name>"** (the story of <name>), filed in the **Histoires des personnages** folder, with four pages (their names are in French):
- **Qui il est** (who they are, readable by everyone): origin, family, what they used to do, looks, manners;
- **Son histoire** (their story, readable by everyone): the past told, what brought them here;
- **Ce qu'il garde pour lui** (what they keep to themselves; their player and the GM only): a secret, a fear, what they are looking for. Beware: this is a **page permission**, not a vault; Foundry sends documents to every browser, and a curious player can read it in the console;
- **Chapitres** (chapters): the AI GM adds a dated paragraph after each notable event.
- **With the AI GM**: during guided creation, it asks the player two or three short questions (or makes things up if asked), then writes the backstory from the world's content (40k: origin, faction, role; Warcraft: people, background, class; Fénoir: childhood, past, traits, region, lost loved one). The *histoire_personnage* tool: prepare, write, complete, add a chapter. An AI companion gets the summary of its backstory in its personality: it talks about it and acts accordingly. The AI GM reads one line of each backstory in the characters' summary, and what each one keeps to themselves.
- **Without AI**: the **Story** button in the sheet header opens the journal, or creates it with its four empty pages and questions to help the player write it themselves. A player who clicks their character's button asks the connected GM, who creates it at once.` },
  { cle: "fetes", titre: "Seasonal festivals", texte: `
# Christmas, Halloween and the others, in each world's own way
When a popular festival comes near, the world can celebrate it in its own way: the world's module writes a **version** of it (in 40k, an Imperial vigil rather than Christmas), and the AI GM handles the rest. A festival the world has no version of does nothing.
- **The festivals and their dates** (from your computer's date): **New Year** (31 December – 2 January), **Valentine's Day** (12 – 15 February), **Carnival** (from Fat Thursday to Shrove Tuesday, a movable date), **Easter** (from Good Friday to Easter Monday, a movable date), **Music Day** (20 – 22 June, the solstice), **Halloween** (25 October – 2 November, All Saints' Day included), **Christmas** (all of December, the heart of it from the 24th to the 26th), **National Day** (14 July); and, for Réunion (Fénoir), **Freedom Day** (20 December), the **Lychee Festival** (mid-December), **Deepavali**, **Cavadee** and **Chinese New Year** (lunar dates known from 2026 to 2036). On 31 December, New Year comes before Christmas.
- **Setting** *Seasonal festival* (Settings › MJ IA): **Automatic**, **None**, or **Force** a festival (play Halloween in July). Forcing a festival this world has no version of does nothing (a notice tells you so).
- **What changes**: a plain **card** in the chat, once a day, with the name of the world's festival and its links (journals, tables, items); a **light decoration** (a garland at the top of the chat, a few falling snowflakes, confetti or hearts, a small ornament on the AI GM's cards); the **AI GM** knows the festival is on and may allude to it when it feels natural, without insisting. In the Vigils, the date alone changes nothing in the rules: only a festival vigil chosen at the deal adds some, and its secrets stay kept.
- **Festival visual effects** (each player's own setting): unchecked, no decoration at all; the computer's *reduced motion* is respected (nothing falls).
- **World modules**: *api.fetes.enregistrer({ id, fete, nom, description, consigne, decor, contenu })* on the *lakour-mj-ia.pret* hook, *api.fetes.active()*, *api.fetes.lister()*; the *lakour-mj-ia.fete* hook (old, new) when the festival changes (docs/fetes.md).` },
  { cle: "depannage", titre: "Backups and troubleshooting", texte: `
- Back up your world regularly (the world's folder in Foundry's data, or your host's backup tool) and before every module update.
- A script update shows after **F5**. A compendium update needs a server restart.
- If the AI no longer answers: is the session started? Is the key valid (Configure › Check key)? Has the budget been reached?
- If a D&D 5e window opens during a creation: one of the AI's choices was refused by the system; finish it by hand.` }
];

export const GUIDE_JOUEURS_EN = [
  { cle: "jouer", titre: "Playing with the AI GM", texte: `
- **Talk in the chat**, as at a table: what your character does, what they say. The GM answers when everyone has finished writing.
- **Rolls**: when the GM asks for a test, a window opens already set up (difficulty, modifiers); check it and roll.
- **What only you see**: the GM's whispered messages, secret choices and votes open on your screen only.
- **Voice**: Settings › MJ IA › "Hear the AI voices" and "AI voice volume" to set the narrator's and companions' voice on your own computer.
- **Speaking aloud**: if Foundry's voice chat is on, when an AI is listening ("The AI is listening" badge at the top of the screen), what you say is transcribed for the AI GM and the companions who can hear you. Mute your microphone to avoid it.
- **Your sheet**: the GM can create it with you, and keeps it up to date (experience, money, items); you can always look at it.
- **Maps**: you can move your token; the GM reacts to what you discover. If it blocks your movement, that is on purpose (a scene in progress).
- **AI companions**: characters played by the AI can fill the table. They speak under their own name and play like you, without cheating: they only know what their character knows.
- **Festivals**: at Christmas, Halloween and a few other festivals, the world may decorate itself a little (garland, snowflakes…). Settings › MJ IA › "Festival visual effects" turns it off on your screen.` },
  { cle: "histoire", titre: "Your character's backstory (40k, Warcraft, Fénoir)", texte: `
- The **Story** button at the top of your sheet opens your character's journal (if it does not exist yet, the GM creates it for you).
- **Qui il est** (who they are) and **Son histoire** (their story) are readable by everyone; **Ce qu'il garde pour lui** (what they keep to themselves), only by you and the GM; the **Chapitres** (chapters) tell the campaign.
- At creation, the AI GM asks you two or three questions and writes it with you; you can add to it yourself at any time (the help questions say what to put in it).` },
  { cle: "tour", titre: "Turn by turn (40k and Warcraft)", texte: `
- **In combat**, a banner at the top of the screen tells you where things stand: "⚔️ Round 3 — Your turn!", or "X's turn, then you".
- **On your turn**, it shows what you have left (D&D 5e: action, bonus action, reaction, movement in metres; Imperium Maledictum: action and move) and your attacks as buttons: they open your real rolls. Target first (the **T** key over its token).
- **End my turn** hands over to the next one.
- When your turn comes, a soft **chime** sounds for you only (the AI GM's "Call me when it is my turn" setting); the same for a group vote or a secret choice.
- If the GM has set it so, only the combatant whose turn it is can move their token.
- **Out of combat**, the GM can run a **round of the table**: when your turn comes, the banner says "Describe what your character does". Write it in the chat (or press **I'm done**), or **I pass**.` },
  { cle: "carnet", titre: "Campaign notebook (40k and Warcraft)", texte: `
- The **open book** button in the left toolbar opens the **Campaign notebook**: what the GM has chosen to show you, in three tabs (Clocks, Investigations, Contacts).
- A **clock** fills segment by segment: when it is full, something happens. A **gauge** rises with your actions (Exposure, in 40k: the higher it is, the more you are noticed). A **reputation** tells what a faction thinks of you, from **Haï** (hated) to **Exalté** (exalted).
- When a clock strikes or a reputation changes, the chat tells you.
- **Investigations**: the clues you have found and the conclusions you have worked out. **Contacts**: the people you know, what they think of you, what you owe them (or they owe you).` },
  { cle: "veillees", titre: "The Vigils of Brumecombe", texte: `
- Your **role** is given to you in secret at the start; keep it to yourself.
- At **night**, if your role acts, a window opens for you only: choose, or pass.
- By **day**, debate, then **vote** in the vote window or on the Game Table. The votes stay hidden until the vote closes.
- The **dead** keep silent and no longer vote.
- The Brumecombe player's guide (a world journal) describes every role, trade and building; on the map, click a building's pin to read its rule.
- When it is your turn (night choice, vote), a soft **chime** sounds for you only and the tab blinks if you are looking elsewhere ("Signal when it is my turn" setting).
- At the end, the **Chronicles of Brumecombe** tell the story of the game and keep the hall of fame.` }
];
