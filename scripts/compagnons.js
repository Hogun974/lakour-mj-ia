// Compagnons IA : des personnages côté joueurs, joués par l'IA comme des joueurs (docs/compagnons.md).
// Ce fichier est la logique PURE, sans Foundry : personnalités, contexte d'un compagnon, validation de ses décisions,
// repli sans IA, rythme de parole. Le branchement sur Foundry (qui sait quoi, chat, nuit des Veillées, combat) est dans
// compagnons-jeu.js.
//
// Principe : un compagnon ne triche pas. Son cerveau est un appel au modèle SÉPARÉ de celui du MJ (pas de fil, pas
// d'outils, pas de prompt du MJ), et tout ce qu'on lui envoie est construit par contexteCompagnon() à partir d'une seule
// « vue » : sa fiche, sa personnalité, ce qu'on lui a dit en privé, le chat public récent, ce qu'il voit de la scène.
// La vue est remplie côté Foundry avec ce qu'un joueur à sa place saurait, et rien d'autre.
//
// Vue : { id, nom, monde, jeu ("loups" | "aventure"), personnalite: { temperament, parler, histoire }, fiche, prive: [texte],
//         public: [texte], scene, autres: [{ id, nom, vivant, humain? }], allies: [id], suspects: [id], vivant, peutParler, tour,
//         humains?: [id] (aux Veillées : les villageois tenus par un joueur humain — public), petiteTablee?: Boolean (la Petite
//         tablée du système lakour-loups 0.11.0, publique : les compagnons y parlent d'abord aux humains) }
// Demande (decider) : { type: "cibles", invite, candidats: [{ id, nom }], nombre, vote?, cle? }
//                     { type: "texte", invite, max, cle? }
//                     { type: "option", question, options: [libellé], cle? }

// ------------------------------------------------------------------ personnalités
export const TEMPERAMENTS = {
  prudent: { libelle: "prudent", consigne: "Tu es prudent : tu réfléchis avant d'agir, tu te méfies des décisions hâtives.", silence: 0.45 },
  bavard: { libelle: "bavard", consigne: "Tu es bavard : tu commentes volontiers, tu relances la conversation.", silence: 0.15 },
  soupconneux: { libelle: "soupçonneux", consigne: "Tu es soupçonneux : tu doutes de tout le monde et tu poses des questions qui dérangent.", silence: 0.3 },
  farceur: { libelle: "farceur", consigne: "Tu es farceur : tu détends l'atmosphère d'un trait d'humour, sans casser la partie.", silence: 0.35 },
  loyal: { libelle: "loyal", consigne: "Tu es loyal : tu soutiens tes compagnons et tiens parole.", silence: 0.4 },
  impulsif: { libelle: "impulsif", consigne: "Tu es impulsif : tu fonces, tu tranches vite, tu assumes.", silence: 0.25 },
  taciturne: { libelle: "taciturne", consigne: "Tu es taciturne : tu parles peu, mais chaque mot compte.", silence: 0.7 }
};

// L'adresse d'un compagnon qui décide sans modèle aux Veillées (les politiques de jeu du système lakour-loups, Le Pacte, étape 6 : de 0,
// toujours au hasard, à 1, tout ce qu'il sait) : tirée de son tempérament. Un prudent ou un soupçonneux use de ce qu'il sait, un impulsif
// ou un farceur moins souvent.
export const ADRESSE_DES_TEMPERAMENTS = { prudent: 0.9, soupconneux: 0.85, taciturne: 0.8, loyal: 0.75, bavard: 0.65, farceur: 0.55, impulsif: 0.5 };
export const ADRESSE_PAR_DEFAUT = 0.7;
export const adresseDe = (personnalite, graine = "") => ADRESSE_DES_TEMPERAMENTS[normaliserPersonnalite(personnalite, graine).temperament] ?? ADRESSE_PAR_DEFAUT;

export const FACONS_DE_PARLER = [
  "phrases courtes et sèches",
  "langue fleurie, un brin théâtrale",
  "parler simple de campagne, plein d'images",
  "ton posé, poli, un peu distant",
  "voix moqueuse, piques et sous-entendus",
  "franc-parler, sans détour"
];

// Bavardage des compagnons : nombre maximal de répliques de compagnons après chaque réponse du MJ.
export const BAVARDAGE = { silencieux: 0, discret: 1, normal: 2, bavard: 3 };

// ------------------------------------------------------------------ hasard reproductible (graine)
export function hacher(texte) {
  let h = 0x811c9dc5;
  for (const c of String(texte)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hasard(graine) {
  let a = hacher(graine);
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choisir = (liste, h) => (liste.length ? liste[Math.floor(h() * liste.length)] : undefined);
const melanger = (liste, h) => {
  const c = [...liste];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(h() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
};

// Une personnalité tirée d'une graine (l'identifiant de l'acteur : toujours la même pour lui).
export function personnaliteAuHasard(graine) {
  const h = hasard(`personnalite|${graine}`);
  return { temperament: choisir(Object.keys(TEMPERAMENTS), h), parler: choisir(FACONS_DE_PARLER, h), histoire: "" };
}

// Personnalité complétée (valeurs inconnues remplacées par celles de la graine).
export function normaliserPersonnalite(p, graine = "") {
  const base = personnaliteAuHasard(graine);
  return {
    temperament: TEMPERAMENTS[p?.temperament] ? p.temperament : base.temperament,
    parler: String(p?.parler ?? "").trim() || base.parler,
    histoire: String(p?.histoire ?? "").trim()
  };
}

// ------------------------------------------------------------------ texte
// HTML -> texte brut, sans DOM (les essais tournent dans Node) : balises retirées, entités courantes décodées.
export function texteBrut(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const couper = (texte, max) => (texte.length <= max ? texte : `${texte.slice(0, max - 1)}…`);

// ------------------------------------------------------------------ contexte (ce que reçoit le cerveau d'un compagnon)
const REGLES = {
  loups: "C'est « Les Veillées de Brumecombe », un jeu de déduction sociale : des loups se cachent parmi les villageois. La nuit, "
    + "les rôles agissent en secret ; le jour, le village débat puis vote pour exécuter un suspect. Gagne avec ton camp. "
    + "Un loup ment pour survivre ; un villageois cherche les loups. Les morts se taisent. Le narrateur n'annonce jamais les rôles "
    + "en jeu. Très rarement, une veillée n'a aucun loup : c'est la peste noire, qui emporte un villageois chaque nuit ; le village "
    + "ne la vainc qu'en la reconnaissant (« C'est la peste noire ! »), et un cri à tort coûte la vie. Le Bailli est une charge "
    + "PUBLIQUE : élu par le village avant le vote d'exécution, sa voix y compte double, il tranche les égalités et, à sa mort, remet "
    + "le sceau à un vivant de son choix ; le jeu s'en charge. Le Registre du greffier, public, garde les votes voix par voix, les morts "
    + "et les déclarations des villageois ; une déclaration n'est qu'une parole, que personne ne vérifie. Selon la veillée, un mort garde son "
    + "Dernier souffle (une seule voix, au vote d'exécution) et l'Almanach des brumes annonce chaque matin un présage qui change la journée. "
    + "Des gens de passage peuvent arriver (leur rôle est public, leur camp secret) ; avec le Banc des accusés, seul un accusé est jugé, "
    + "et sans accusation, personne n'est exécuté ce jour-là. Selon la veillée encore (le jeu de soirée), des bâtiments sont tenus par des "
    + "joueurs (des personnalités PUBLIQUES : Métayers, Prieur, Hobereau…), des variantes changent les règles (annoncées), et la Gazette de "
    + "la lune tire au matin une carte qui change la journée (un vote à tour de rôle, deux voix chacun…) : tout cela est dit au chat.",
  aventure: "C'est une partie de jeu de rôle : le meneur décrit le monde et joue les PNJ, chaque joueur joue son personnage. "
    + "Tu dis ce que fait et dit ton personnage, jamais ce que font les autres ni ce qui leur arrive."
};

// La langue de ses répliques : vue.langue, la langue du monde (« en » : module de contenu anglais ; compagnons-jeu.js la pose
// depuis contenus.js, langueDuMonde), comme pour le narrateur (contexte.js, consigneLangue). Sans langue : français.
export function consigneLangueCompagnon(langue) {
  if (langue !== "en") return "Tu t'exprimes en français.";
  return "LANGUE : les autres joueurs sont anglophones. Tes répliques, tes gestes et tout ce que tu écris sont en ANGLAIS, même si ce "
    + "qu'on te donne ici est en français (garde les noms exacts quand tu choisis un nom dans une liste). Always speak English.";
}

export function consigneSysteme(vue) {
  const p = normaliserPersonnalite(vue.personnalite, vue.id);
  return [
    `Tu joues ${vue.nom}, un personnage côté joueurs dans une partie de « ${vue.monde} ». Tu n'es PAS le meneur de jeu : tu es `
      + "un joueur autour de la table, tenu par une IA, avec les mêmes droits et les mêmes limites qu'un joueur humain.",
    "Tu ne sais que ce qui est écrit ici : ta fiche, ce qu'on t'a dit en privé, ce qui s'est dit en public et ce que tu vois. "
      + "Ne prétends jamais savoir ce que tu ignores et n'invente aucun secret.",
    // Le cri de la peste dans la langue du monde (FORMULES_REPLIQUE), comme dans la consigne de parole.
    (REGLES[vue.jeu] ?? REGLES.aventure).replace(`« ${FORMULES_REPLIQUE.fr.peste} »`, `« ${formulesReplique(vue.langue).peste} »`),
    `Personnalité : ${TEMPERAMENTS[p.temperament].consigne} Façon de parler : ${p.parler}.${p.histoire ? ` Ton histoire : ${p.histoire}` : ""}`,
    consigneLangueCompagnon(vue.langue),
    "",
    "Ta fiche :",
    vue.fiche || "(rien de particulier)"
  ].join("\n");
}

function blocs(vue) {
  const liste = (titre, lignes, vide) => [`[${titre}]`, ...(lignes?.length ? lignes.map(l => `- ${l}`) : [vide]), ""];
  return [
    ...liste("Ce que tu sais en privé", vue.prive, "(rien)"),
    ...liste("Ce qui s'est dit en public récemment", vue.public, "(rien encore)"),
    "[Ce que tu vois]", vue.scene || "(rien de particulier)", ""
  ];
}

const nomsDe = candidats => candidats.map(c => c.nom).join(", ");

export function consigneDemande(vue, demande) {
  if (!demande) return null;
  if (demande.type === "cibles") {
    const n = Math.max(1, demande.nombre ?? 1);
    return [
      demande.invite || "Choisis.",
      `Candidats : ${nomsDe(demande.candidats)}.`,
      `Réponds UNIQUEMENT par un objet JSON, sans aucun autre texte : {"cibles": ["Nom exact"]} — au plus ${n} nom${n > 1 ? "s" : ""} `
        + `pris dans la liste des candidats, ou {"cibles": []} pour ${demande.vote ? "t'abstenir" : "passer"}.`
    ].join("\n");
  }
  if (demande.type === "texte") {
    return [
      demande.invite || "Écris une phrase.",
      `Réponds UNIQUEMENT par un objet JSON, sans aucun autre texte : {"texte": "ta phrase"} (${demande.max ?? 120} caractères au plus), `
        + "ou {\"texte\": \"\"} pour ne rien écrire."
    ].join("\n");
  }
  if (demande.type === "option") {
    return [
      demande.question || "Choisis.",
      `Options : ${demande.options.map(o => `« ${o} »`).join(", ")}.`,
      "Réponds UNIQUEMENT par un objet JSON, sans aucun autre texte : {\"choix\": \"libellé exact d'une option\"}, ou {\"choix\": null} pour passer."
    ].join("\n");
  }
  return null;
}

// Une réplique, à la manière du théâtre : une didascalie brève (facultative, une seule), puis la parole. Le compagnon dit
// lui-même ses gestes : le narrateur ne les raconte plus. Exemple : « *Valentin regarde Clémence, les bras croisés.* — Moi, je
// l'ai vue sortir hier soir. »
export const DIDASCALIE_MAX = 140;
export const PAROLE_MAX = 400;
export const CONSIGNE_PARLER = "Écris UNE courte réplique (une à trois phrases) que ton personnage dit maintenant à la table, à la première "
  + "personne, sans guillemets et sans ton nom devant. Tu peux la faire précéder d'UNE didascalie brève, en italique, à la troisième "
  + "personne, comme au théâtre : « *Valentin regarde Clémence, les bras croisés.* — Moi, je l'ai vue sortir hier soir. » La didascalie "
  + "n'est qu'un geste, un regard ou une attitude, au plus une, jamais une action qui change la partie, et elle ne trahit aucun secret. "
  + "Si tu n'as rien d'utile à dire, réponds seulement « — ».";
export const CONSIGNE_PARLER_LOUPS = " Tu peux accuser, te défendre, poser une question ou mentir si ton camp l'exige ; ne révèle ton rôle "
  + "que si tu le juges utile. Voter, agir la nuit ou user d'un pouvoir ne se fait jamais dans une réplique : cela passe par les "
  + "fenêtres du jeu. Une seule exception, le cri de la peste noire : si tu es CONVAINCU qu'il n'y a aucun loup à Brumecombe mais une "
  + "peste (aucune vision n'a jamais montré de loup, les morts n'ont aucune trace de crocs…), tu peux écrire dans ta réplique "
  + "exactement « C'est la peste noire ! ». Si c'est vrai, le village gagne aussitôt ; si c'est faux, tu es pendu pour avoir semé la "
  + "panique. C'est rarissime : sans preuves solides, ne le crie jamais. Pour faire inscrire une déclaration au Registre du greffier "
  + "(public, une phrase, trois par jour au plus), commence ta réplique par « Au Registre : » suivi de ce que tu déclares (« Au "
  + "Registre : cette nuit, j'ai vu une lanterne s'éteindre chez Berthe. »). Le greffier ne vérifie rien : on peut y mentir.";

// Les formules qui déclenchent quelque chose dans une réplique (accusation au Banc, cri de la peste noire, déclaration au Registre),
// dans la langue du monde (vue.langue ; « en » : anglais). La consigne les annonce telles quelles au modèle ; la reconnaissance
// (accusationDans, criePeste, declarationAuRegistre) accepte les deux langues, quelle que soit celle du monde.
export const FORMULES_REPLIQUE = {
  fr: { accuser: "J'accuse", peste: "C'est la peste noire !", registre: "Au Registre :", exempleRegistre: "cette nuit, j'ai vu une lanterne s'éteindre chez Berthe." },
  en: { accuser: "I accuse", peste: "It's the black plague!", registre: "For the Register:", exempleRegistre: "last night, I saw a lantern go out at Berthe's." }
};
export const formulesReplique = langue => FORMULES_REPLIQUE[langue === "en" ? "en" : "fr"];
// La consigne des Veillées, formules dans la langue du monde (le reste de la consigne, pour le modèle, reste en français).
export function consigneParlerLoups(langue) {
  if (langue !== "en") return CONSIGNE_PARLER_LOUPS;
  const { fr, en } = FORMULES_REPLIQUE;
  return CONSIGNE_PARLER_LOUPS
    .replace(`« ${fr.peste} »`, `« ${en.peste} » (en anglais, mot pour mot)`)
    .replace(`« ${fr.registre} » suivi de ce que tu déclares (« Au `, `« ${en.registre} » (en anglais, mot pour mot) suivi de ce que tu déclares (« `)
    .replace(`Registre : ${fr.exempleRegistre} »)`, `${en.registre} ${en.exempleRegistre} »)`);
}

// La déclaration au Registre en tête d'une réplique de compagnon (« Au Registre : … », après une éventuelle didascalie) : le
// texte à inscrire, ou null. compagnons-jeu.js la transmet au système des Veillées (api.declarer).
// L'accusation au Banc dans une réplique (« J'accuse Berthe ! ») : le villageois visé (parmi candidats : [{ id, nom }], nom exact,
// casse et accents ignorés, ou le premier dont le nom commence par le texte), ou null. compagnons-jeu.js la porte au système.
const plierNom = t => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
// Français ou anglais : « J'accuse Berthe », « I accuse Berthe », « I'm accusing Berthe », « I am accusing Berthe » (casse ignorée,
// apostrophe droite ou courbe ; « Je n'accuse personne », « I'm not accusing anyone » ne visent personne).
export const ACCUSATION = /(?:\bj['’]\s*accuse|\bi\s+accuse|\bi['’]m\s+accusing|\bi\s+am\s+accusing)\s+([^.!?,;:—–\n]+)/i;
export function accusationDans(texte, candidats = []) {
  const m = ACCUSATION.exec(String(texte ?? ""));
  if (!m) return null;
  const vise = plierNom(m[1]);
  const c = candidats.find(x => plierNom(x.nom) === vise) ?? candidats.find(x => vise.startsWith(plierNom(x.nom)));
  return c?.id ?? null;
}

// Français ou anglais : « Au Registre : … », « For the Register: … », « On the Register: … », « On the record: … » (pas « For the
// record », trop courant en anglais pour valoir déclaration).
export const DECLARATION_REGISTRE = /^\s*(?:\*[^*]*\*\s*(?:[—–-]\s*)?)?(?:au registre|for the register|on the register|on the record)\s*:\s*(.+)$/is;
export function declarationAuRegistre(texte) {
  const m = DECLARATION_REGISTRE.exec(String(texte ?? ""));
  const dit = m ? m[1].replace(/\s+/g, " ").trim() : "";
  return dit || null;
}

// Le cri de la peste noire dans une réplique de compagnon (compagnons-jeu.js le transmet au système des Veillées).
// Français ou anglais : « C'est la peste noire ! », « It's the black plague! », « It is the black plague! » (et « the Black Death »).
export const CRI_PESTE = /c['’]est la peste noire|\bit(?:['’]s|\s+is)\s+the\s+black\s+(?:plague|death)/i;
export const criePeste = texte => CRI_PESTE.test(String(texte ?? ""));
// La Petite tablée (système lakour-loups 0.11.0, publique) : les compagnons s'adressent d'abord aux joueurs humains. Un biais de
// parole seulement : jamais de vote ni de choix de nuit orienté vers les humains (repliDecision ne lit pas cette liste, et la
// consigne n'entre que dans une réplique, jamais dans une décision).
export const CONSIGNE_PETITE_TABLEE = noms => ` Petite tablée : les joueurs humains de cette veillée sont ${noms.join(", ")}. Adresse-toi d'abord `
  + "à eux — accuse-les, défends-les, questionne-les, réponds à ce qu'ils viennent de dire — plutôt que de discuter avec les autres "
  + "compagnons IA ; ne cite un autre compagnon que pour rebondir sur ce qu'un humain a dit.";
export const nomsDesHumains = vue => (vue.autres ?? []).filter(a => (vue.humains ?? []).includes(a.id) && a.vivant !== false).map(a => a.nom);
export const CONSIGNE_PARLER_AVENTURE = " Une action qui compte (attaquer, fouiller, partir…) se dit dans ta parole, le meneur la résout ; "
  + "la didascalie n'est qu'un geste.";
export const CONSIGNE_COMBAT = "C'est ton tour de combat. Déclare en une ou deux phrases, à la première personne, ce que fait ton personnage "
  + "(déplacement, attaque et sur qui, sort, aide…). Le meneur lancera les dés de ta fiche : ne donne aucun résultat.";

// Le contexte complet d'un appel : { systeme, texte }. Seule la vue (et la demande) y entrent.
export function contexteCompagnon(vue, { demande = null, consigne = "" } = {}) {
  const humains = vue.jeu === "loups" && vue.petiteTablee ? nomsDesHumains(vue) : [];
  const attendu = consigneDemande(vue, demande) ?? (consigne || (CONSIGNE_PARLER + (vue.jeu === "loups"
    ? consigneParlerLoups(vue.langue) + (humains.length ? CONSIGNE_PETITE_TABLEE(humains) : "") : CONSIGNE_PARLER_AVENTURE)));
  return { systeme: consigneSysteme(vue), texte: [...blocs(vue), "[Ce qu'on attend de toi]", attendu].join("\n") };
}

// ------------------------------------------------------------------ validation (JSON strict ; invalide = passer)
// Rend { valeur } si la réponse est valide, null sinon. Seul un objet JSON (éventuellement entre ```json … ```), avec la seule
// clé attendue, est accepté.
export function analyserDecision(texte, demande) {
  const brut = String(texte ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let obj;
  try { obj = JSON.parse(brut); } catch { return null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const cles = Object.keys(obj);
  if (demande.type === "cibles") {
    if (cles.length !== 1 || cles[0] !== "cibles" || !Array.isArray(obj.cibles)) return null;
    const n = Math.max(1, demande.nombre ?? 1);
    if (obj.cibles.length > n || obj.cibles.some(c => typeof c !== "string")) return null;
    const ids = [];
    for (const nom of obj.cibles) {
      const n2 = nom.trim().toLowerCase();
      const c = demande.candidats.find(x => x.nom.trim().toLowerCase() === n2);
      if (!c || ids.includes(c.id)) return null;
      ids.push(c.id);
    }
    return { valeur: { cibles: ids } };
  }
  if (demande.type === "texte") {
    if (cles.length !== 1 || cles[0] !== "texte" || typeof obj.texte !== "string") return null;
    return { valeur: { texte: couper(obj.texte.replace(/\s+/g, " ").trim(), demande.max ?? 120) } };
  }
  if (demande.type === "option") {
    if (cles.length !== 1 || cles[0] !== "choix") return null;
    if (obj.choix === null) return { valeur: { choix: null } };
    if (typeof obj.choix !== "string") return null;
    const i = demande.options.findIndex(o => o.trim().toLowerCase() === obj.choix.trim().toLowerCase());
    return i < 0 ? null : { valeur: { choix: i } };
  }
  return null;
}

export function passer(demande) {
  if (demande.type === "texte") return { texte: "" };
  if (demande.type === "option") return { choix: null };
  return { cibles: [] };
}

// Une réplique propre : ni guillemets autour, ni « Nom : » devant, ni méta ; « — » ou vide = rien à dire. Une didascalie en tête
// (*…*, _…_ ou (…)) est gardée, une seule, bornée, au format « *Didascalie.* — Parole » ; toute autre didascalie est retirée.
export function nettoyerReplique(texte, nom = "") {
  let t = String(texte ?? "").trim();
  if (nom) t = t.replace(new RegExp(`^\\**${nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\**\\s*[:：—-]\\s*`, "i"), "");
  t = t.split("\n").filter(l => !/^\s*\[.*\]\s*$/.test(l)).join(" ").replace(/\s+/g, " ").trim();
  let didascalie = "";
  const tete = /^(?:\*{1,2}([^*]+)\*{1,2}|_([^_]+)_|\(([^()]+)\))\s*(?:[—–-]+\s*)?([\s\S]*)$/.exec(t);
  if (tete) {
    didascalie = (tete[1] ?? tete[2] ?? tete[3]).replace(/^[«"“\s]+|[»"”\s]+$/g, "").trim();
    t = tete[4];
  }
  // Une seule didascalie : les suivantes, au milieu de la parole, disparaissent.
  const parole = t.replace(/\*{1,2}[^*]*\*{1,2}|(^|\s)_[^_]+_(?=\s|$)/g, "$1").replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").replace(/([.,]),+/g, "$1").trim()
    .replace(/^[—–-]+\s*/, "").replace(/^[«"“]\s*/, "").replace(/\s*[»"”]$/, "").trim();
  const vide = x => !x || /^[—–-]+$/.test(x) || /^\(?(?:rien|nothing)\)?\.?$/i.test(x);
  if (vide(didascalie)) didascalie = "";
  const dit = vide(parole) ? "" : couper(parole, PAROLE_MAX);
  if (didascalie) didascalie = couper(/[.!?…]$/.test(didascalie) ? didascalie : `${didascalie}.`, DIDASCALIE_MAX);
  if (!didascalie) return dit;
  return dit ? `*${didascalie}* — ${dit}` : `*${didascalie}*`;
}

// ------------------------------------------------------------------ repli sans IA (déterministe)
// Dans la langue du monde (vue.langue, posée par compagnons-jeu.js depuis contenus.js, langueDuMonde ; « en » : anglais, sinon
// français), comme les répliques du modèle (consigneLangueCompagnon). Les deux langues ont les mêmes listes, dans le même ordre
// et de même longueur : l'aléa tire le même rang, quelle que soit la langue. Tournures neutres : rien ne s'accorde au nom cité
// (homme, femme ou ni l'un ni l'autre ; ni « il/elle » ni « he/she »), ni au genre du compagnon qui parle.
const REPLIQUES_LANGUES = {
  fr: {
    loups: [
      n => `Je n'ai rien vu cette nuit, mais on n'a presque pas entendu ${n} ce matin.`,
      n => `Et toi, ${n}, tu étais où quand la brume est tombée ?`,
      () => "Gardons la tête froide : un vote trop vite fait, c'est un innocent de moins.",
      n => `Je garde un œil sur ${n}. Ses réponses ne tiennent pas debout.`,
      () => "Je n'accuse personne pour l'instant. Écoutons d'abord.",
      n => `${n}, ça fait deux fois que tu changes d'avis. Pourquoi ?`,
      n => `${n}, qu'as-tu fait de ta soirée, au juste ?`,
      () => "Les loups adorent les votes pressés. Prenons notre temps.",
      n => `Je voterais bien contre ${n}, mais j'aimerais d'abord l'entendre.`,
      () => "Qui a parlé le premier, hier ? Souvenez-vous-en.",
      n => `${n}, tu réponds toujours à côté. C'est fait exprès ?`,
      () => "Quelqu'un ici en sait plus long qu'on ne le dit.",
      n => `On a vu quelqu'un près du puits cette nuit. ${n}, une idée ?`,
      () => "La brume a bon dos : ce sont des mains qui ont frappé cette nuit.",
      n => `Je ne dis pas que c'est ${n}. Je dis que ça y ressemble.`,
      () => "Regardez qui défend qui. Ça en dit long.",
      n => `${n}, tu as beaucoup insisté hier. Qu'est-ce qui te presse ?`,
      () => "On ne gagnera rien à se disputer. Cherchons ce qui cloche.",
      n => `Si ${n} n'a rien à cacher, la réponse sera simple.`,
      () => "Hier, on s'est trompé. Ne refaisons pas la même erreur.",
      n => `${n} change de sujet dès qu'on parle des loups. J'ai remarqué.`,
      () => "Faisons le tour : où étiez-vous tous, cette nuit ?",
      n => `${n}, tes mots d'hier et ceux d'aujourd'hui ne disent pas la même chose.`,
      () => "Moi, je me méfie de ceux qui ne disent jamais rien.",
      n => `J'ai confiance en ${n}, pour l'instant. Ne me déçois pas.`,
      () => "Un loup n'accuse jamais sa propre meute. Écoutez qui accuse qui.",
      n => `${n}, tu as voté vite hier. Trop vite, peut-être.`,
      () => "Les cendres ne mentent pas. Les vivants, si.",
      n => `Je propose qu'on écoute ${n} jusqu'au bout avant de voter.`,
      () => "Chaque matin, une chaise vide de plus. On doit trancher.",
      n => `${n}, pourquoi ce regard vers la fenêtre ?`,
      () => "Qui sait se tait ; qui ment parle trop.",
      n => `Ce que dit ${n} me trouble. Quelqu'un d'autre a remarqué ?`,
      () => "Je n'ai pas de preuve. Juste une drôle d'impression.",
      n => `${n}, à ma place, tu voterais contre qui ?`,
      () => "Brumecombe a déjà trop pleuré. Votons juste, pas vite.",
      n => `Je remarque que ${n} n'accuse jamais personne. Curieux.`,
      () => "Les loups se protègent entre eux. Regardez les votes d'hier.",
      n => `${n}, raconte-nous ta nuit, sans rien oublier.`,
      () => "Personne ne dort tranquille tant que la meute rôde.",
      n => `Ma voix ira peut-être à ${n}. Convaincs-moi du contraire.`,
      () => "On tourne en rond. Qui a une piste, une vraie ?"
    ],
    aventure: [
      () => "Je reste sur mes gardes. Quelque chose ne colle pas.",
      () => "Je vous suis. Dites-moi où frapper.",
      () => "On devrait souffler un instant et réfléchir avant d'avancer.",
      () => "Je couvre nos arrières.",
      () => "Ça ne me plaît pas. Mais allons-y.",
      () => "Quelqu'un a une meilleure idée ? Sinon, j'y vais."
    ],
    combat: [
      () => "J'attaque l'ennemi le plus proche.",
      () => "Je me mets à couvert et je vise le plus dangereux.",
      () => "Je me place devant les plus fragiles et je frappe.",
      () => "Je recule d'un pas et je tire."
    ],
    // Le mot confié la nuit (le Messager des Veillées) : une phrase, lue par son destinataire.
    mots: ["Méfie-toi de ceux qui parlent trop.", "Je veille sur toi cette nuit.", "J'étais dehors cette nuit, mais je n'y suis pour rien.",
      "Regarde qui se tait au moment du vote.", "Garde ta porte fermée, et ta lanterne allumée.", "Je te crois. Ne me fais pas regretter.",
      "Demain, vote avec moi : j'ai une idée.", "Ne dis à personne que je t'ai écrit."],
    // Le Mur des murmures (variante des Veillées) : une phrase ANONYME, lue au matin par tous.
    murmures: ["Quelqu'un ici ment depuis le premier soir.", "J'ai entendu marcher dans la brume, près du puits.", "Ne vous fiez pas aux plus bavards.",
      "Le loup dort plus près de vous que vous ne croyez.", "Une porte a grincé deux fois cette nuit, puis plus rien.",
      "Les chiens ont aboyé du côté du pont, et se sont tus d'un coup.", "Quelqu'un rentre toujours avec de la boue jusqu'aux genoux.",
      "Comptez les chaises vides, et regardez qui sourit.", "La meute a un ami parmi les plus calmes.", "Ce n'est pas la brume qui frappe : ce sont des mains.",
      "J'ai vu une lanterne s'éteindre au moment du cri.", "Le prochain vote dira qui protège qui.", "Écoutez qui accuse le plus vite.",
      "Les loups votent ensemble. Relisez les votes d'hier.", "Quelqu'un a rincé ses manches au lavoir avant l'aube.",
      "Une fenêtre est restée ouverte trop longtemps, cette nuit.", "Brumecombe se trompe de coupable depuis deux jours.",
      "Le silence de certains en dit plus long que les cris.", "Une voix tremble au débat, et ce n'est pas de peur.",
      "Des cendres encore chaudes à minuit, chez quelqu'un qui dormait, à ce qu'on dit.", "Des traces de griffes sur une barrière, côté rivière.",
      "La meute rôde autour de ceux qui parlent trop.", "Quelqu'un connaît le chemin des bois mieux que personne.",
      "Les corbeaux se posent toujours sur le même toit.", "Une ombre a traversé la place sans lanterne.",
      "On a entendu rire dans la brume, à l'heure des loups.", "Méfiez-vous des amitiés trop soudaines.", "Un regard fuit dès qu'on parle des morts.",
      "Défendre tout le monde, c'est d'abord se défendre.", "Le vent a porté une odeur de bête jusqu'au fournil.",
      "Quelqu'un a compté les maisons, la nuit dernière.", "Le Village a encore une chance. Ne la gaspillez pas.",
      "Les loups ont peur des questions précises.", "Une main a gratté à ma porte, puis s'est ravisée.", "Ceux qui dorment bien ne sont pas tous innocents.",
      "La brume cache des pas, pas des mensonges.", "Quelqu'un a menti sur sa nuit. Cherchez la contradiction.",
      "Les morts savent. Écoutez ce qu'on dit d'eux.", "Au bout du pont, une silhouette attendait la meute.", "Une prière n'a pas suffi, cette nuit.",
      "Tant que la meute vit, personne n'est à l'abri.", "Ce matin, des yeux trop rouges pour une nuit de sommeil.",
      "Un vote de travers, et la meute rit sous cape.", "La cloche n'a pas sonné, et pourtant une porte s'est ouverte.",
      "Du sang sous la neige, dans le chemin creux."],
    // Ce qu'il dit tout haut quand il croit tenir un loup (les politiques du système : annoncesDuJoueur ; un loup peut mentir).
    annonces: [
      n => `Je vous le dis franchement : ${n} est un loup.`,
      n => `Écoutez-moi bien : ${n} est de la meute, je n'en doute pas.`,
      n => `Ne cherchez plus : c'est ${n}, le loup.`,
      n => `J'en mettrais ma main au feu : ${n} chasse avec la meute.`,
      n => `Votez contre ${n}. C'est un loup, j'en ai la certitude.`,
      n => `Je sais ce que je sais : ${n} n'est pas du Village.`,
      n => `Ouvrez les yeux : ${n} court avec les loups.`,
      n => `Sans détour : ${n} est un loup, et je le maintiens.`
    ],
    quelquun: "quelqu'un"
  },
  en: {
    loups: [
      n => `I saw nothing last night, but ${n} kept very quiet this morning.`,
      n => `And you, ${n}, where were you when the mist came down?`,
      () => "Let's keep a cool head: a vote cast too quickly is one more innocent lost.",
      n => `I'm keeping an eye on ${n}. Those answers don't add up.`,
      () => "I'm not accusing anyone yet. Let's listen first.",
      n => `${n}, that's twice you've changed your mind. Why?`,
      n => `${n}, what did you do with your evening, exactly?`,
      () => "Wolves love a hurried vote. Let's take our time.",
      n => `I could vote against ${n}, but I'd like to hear the answer first.`,
      () => "Who spoke first yesterday? Remember that.",
      n => `${n}, you always answer beside the point. On purpose?`,
      () => "Someone here knows more than we're being told.",
      n => `Someone was seen near the well last night. ${n}, any idea?`,
      () => "Don't blame the mist: it was hands that struck last night.",
      n => `I'm not saying it's ${n}. I'm saying it looks like it.`,
      () => "Watch who defends whom. It says a lot.",
      n => `${n}, you pushed hard yesterday. What's the hurry?`,
      () => "Quarrelling gets us nowhere. Let's look for what doesn't fit.",
      n => `If ${n} has nothing to hide, the answer will be simple.`,
      () => "Yesterday we got it wrong. Let's not make the same mistake.",
      n => `${n} changes the subject whenever wolves come up. I've noticed.`,
      () => "Let's go round the table: where was everyone last night?",
      n => `${n}, your words yesterday and today don't say the same thing.`,
      () => "Me, I'm wary of the ones who never say anything.",
      n => `I trust ${n}, for now. Don't let me down.`,
      () => "A wolf never accuses its own pack. Listen to who accuses whom.",
      n => `${n}, you voted fast yesterday. Too fast, maybe.`,
      () => "Ashes don't lie. The living do.",
      n => `I say we hear ${n} out before we vote.`,
      () => "Every morning, one more empty chair. We have to decide.",
      n => `${n}, why that glance at the window?`,
      () => "Who knows keeps quiet; who lies talks too much.",
      n => `What ${n} says troubles me. Anyone else notice?`,
      () => "I have no proof. Just a strange feeling.",
      n => `${n}, in my place, who would you vote against?`,
      () => "Brumecombe has wept enough. Let's vote right, not fast.",
      n => `I notice ${n} never accuses anyone. Curious.`,
      () => "Wolves protect each other. Look at yesterday's votes.",
      n => `${n}, tell us about your night, and leave nothing out.`,
      () => "Nobody sleeps easy while the pack is prowling.",
      n => `My vote may go to ${n}. Convince me otherwise.`,
      () => "We're going round in circles. Who has a lead, a real one?"
    ],
    aventure: [
      () => "I'm staying on my guard. Something doesn't feel right.",
      () => "I'm with you. Tell me where to strike.",
      () => "We should catch our breath and think before we go on.",
      () => "I'll cover our backs.",
      () => "I don't like this. But let's go.",
      () => "Anyone have a better idea? If not, I'm going in."
    ],
    combat: [
      () => "I attack the nearest enemy.",
      () => "I take cover and aim at the most dangerous one.",
      () => "I step in front of the weakest and strike.",
      () => "I step back and shoot."
    ],
    mots: ["Beware of those who talk too much.", "I'm watching over you tonight.", "I was out last night, but I had nothing to do with it.",
      "Watch who goes quiet when the vote comes.", "Keep your door shut and your lantern lit.", "I believe you. Don't make me regret it.",
      "Tomorrow, vote with me: I have an idea.", "Tell no one I wrote to you."],
    murmures: ["Someone here has been lying since the first night.", "I heard footsteps in the mist, near the well.", "Don't trust the loudest ones.",
      "The wolf sleeps closer to you than you think.", "A door creaked twice last night, then nothing.",
      "The dogs barked by the bridge, then fell silent all at once.", "Someone always comes home with mud up to the knees.",
      "Count the empty chairs, and watch who smiles.", "The pack has a friend among the calmest of us.", "It isn't the mist that strikes: it's hands.",
      "I saw a lantern go out at the moment of the scream.", "The next vote will show who protects whom.", "Listen to who accuses fastest.",
      "Wolves vote together. Read yesterday's votes again.", "Someone rinsed a pair of sleeves at the wash-house before dawn.",
      "A window stayed open too long last night.", "Brumecombe has been blaming the wrong one for two days.",
      "Some silences say more than shouting.", "A voice trembles in the debate, and not from fear.",
      "Embers still warm at midnight, at the house of someone who was asleep, supposedly.", "Claw marks on a gate, on the river side.",
      "The pack prowls around those who talk too much.", "Someone knows the woodland path better than anyone.",
      "The crows always land on the same roof.", "A shadow crossed the square without a lantern.",
      "Laughter was heard in the mist, at the wolves' hour.", "Beware of friendships that come too suddenly.", "Some eyes look away whenever the dead are mentioned.",
      "Defending everyone is first of all defending oneself.", "The wind carried a smell of beast as far as the bakehouse.",
      "Someone counted the houses last night.", "The Village still has a chance. Don't waste it.",
      "Wolves fear precise questions.", "A hand scratched at my door, then thought better of it.", "Not everyone who sleeps well is innocent.",
      "The mist hides footsteps, not lies.", "Someone lied about last night. Look for the contradiction.",
      "The dead know. Listen to what is said about them.", "At the end of the bridge, a figure was waiting for the pack.", "A prayer was not enough last night.",
      "As long as the pack lives, nobody is safe.", "This morning, eyes far too red for a night of sleep.",
      "One crooked vote, and the pack laughs up its sleeve.", "The bell didn't ring, and yet a door opened.",
      "There is blood under the snow of the sunken lane."],
    annonces: [
      n => `I'll say it plainly: ${n} is a wolf.`,
      n => `Listen to me: ${n} runs with the pack, I'm sure of it.`,
      n => `Look no further: ${n} is the wolf.`,
      n => `I'd stake my hand on it: ${n} hunts with the pack.`,
      n => `Vote against ${n}. A wolf, I'm certain of it.`,
      n => `I know what I know: ${n} is not of the Village.`,
      n => `Open your eyes: ${n} runs with the wolves.`,
      n => `No beating about the bush: ${n} is a wolf, and I stand by it.`
    ],
    quelquun: "someone"
  }
};
// Le Mur des murmures, ce qu'un compagnon SAIT (les politiques du système : un loup découvert, un innocent sûr ; un loup peut mentir) :
// une allusion, jamais un nom propre ni une preuve — le genre de la personne et l'un de ses traits visibles (publics : gazette.mjs), de
// préférence un trait qu'elle partage avec d'autres vivants. « Méfiez-vous de celle qui porte des lunettes. » Ici, les accords suivent le
// genre de la personne visée (connu de tous : ses traits) ; un genre inconnu : « la personne », « the one ».
const ALLUSIONS_LANGUES = {
  fr: {
    sujet: { femme: "celle", homme: "celui", "": "la personne" },
    indices: { lunettes: "qui porte des lunettes", bijou: "qui porte un bijou", sabots: "qui marche en sabots", coiffe: "à la coiffe sombre",
      pipe: "qui fume la pipe", bourg: "qui loge au bourg", ecart: "qui vit de l'autre côté du pont", jeune: "qui est encore jeune", vieux: "aux cheveux gris" },
    loup: [q => `Méfiez-vous de ${q}.`, q => `${q} ne dort pas la nuit.`, q => `J'ai vu ${q} rentrer bien après minuit.`,
      q => `Ne tournez pas le dos à ${q}.`, q => `Regardez donc les mains de ${q}.`, q => `Quand le vent tourne, ${q} sent la bête.`,
      q => `La meute compte sur ${q}.`, q => `Demandez à ${q} d'où vient la boue sur ses manches.`],
    innocent: [q => `On peut se fier à ${q}.`, q => `${q} n'a rien à se reprocher.`, q => `Ce n'est pas ${q} qu'on doit craindre.`,
      q => `Laissez en paix ${q} : c'est la meute qui voudrait l'écarter, pas vous.`, q => `Gardez ${q} parmi nous : le Village en a besoin.`]
  },
  en: {
    sujet: { femme: "the woman", homme: "the man", "": "the one" },
    indices: { lunettes: "who wears spectacles", bijou: "who wears a jewel", sabots: "who walks in clogs", coiffe: "in the dark headdress",
      pipe: "who smokes a pipe", bourg: "who lodges in the town", ecart: "who lives across the bridge", jeune: "who is still young", vieux: "with the grey hair" },
    loup: [q => `Beware of ${q}.`, q => `${q} does not sleep at night.`, q => `I saw ${q} come home well after midnight.`,
      q => `Never turn your back on ${q}.`, q => `Take a good look at the hands of ${q}.`, q => `When the wind turns, ${q} smells of the beast.`,
      q => `The pack counts on ${q}.`, q => `Ask ${q} where the mud on those sleeves comes from.`],
    innocent: [q => `You can trust ${q}.`, q => `${q} has nothing to hide.`, q => `It is not ${q} we should fear.`,
      q => `Leave ${q} in peace: the pack would like that one gone, not you.`, q => `Keep ${q} among us: the Village needs that help.`]
  }
};
export const allusionsDansLaLangue = langue => ALLUSIONS_LANGUES[langue === "en" ? "en" : "fr"];
const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);
// Une phrase d'allusion : murmure = { sens: "loup" | "innocent", genre: "femme" | "homme" | "", indice: clé d'ALLUSIONS_LANGUES.indices }.
export function phraseDAllusion(murmure, langue, h, dites = null) {
  const A = allusionsDansLaLangue(langue);
  const indice = A.indices[murmure?.indice];
  const liste = A[murmure?.sens];
  if (!indice || !liste) return "";
  const qui = `${A.sujet[murmure.genre] ?? A.sujet[""]} ${indice}`;
  const f = choisirLibre(liste, h, dites, `allusion-${murmure.sens}`);
  const texte = f(qui);
  return texte.startsWith(qui) ? majuscule(texte) : texte;
}
// La part des compagnons qui n'écrit rien sur le Mur (sans rien savoir ; s'il sait quelque chose : PART_DU_MUR_MUET_SAVANT).
export const PART_DU_MUR_MUET = 0.3;
export const PART_DU_MUR_MUET_SAVANT = 0.1;
// Une phrase du Mur sans IA : ce qu'il sait (demande.murmure, compagnons-jeu.js) passe d'abord ; sinon la réserve, jamais une phrase déjà
// écrite sur ce mur (demande.deja : les phrases du mur, CerveauxCompagnons les tient) ; parfois rien. Le mur a tout : il se tait.
export function murmureSansIA(vue, { murmure = null, deja = null } = {}, h) {
  const R = repliquesDansLaLangue(vue.langue);
  const pris = new Set(deja ?? []);
  if (h() < (murmure ? PART_DU_MUR_MUET_SAVANT : PART_DU_MUR_MUET)) return "";
  if (murmure) {
    for (let i = 0; i < 6; i++) {
      const p = phraseDAllusion(murmure, vue.langue, h);
      if (p && !pris.has(p)) return p;
    }
  }
  const libres = R.murmures.filter(p => !pris.has(p));
  return libres.length ? choisir(libres, h) : "";
}

// Les répliques sans IA dans une langue (« en » : anglais ; toute autre valeur : français).
export const repliquesDansLaLangue = langue => REPLIQUES_LANGUES[langue === "en" ? "en" : "fr"];

// Un élément d'une réserve, jamais un déjà dit : dites (facultatif) est l'ensemble des « liste:rang » déjà tirés (une partie, un mur) ;
// le rang tiré y est ajouté. Tout est déjà dit : n'importe lequel (la réserve recommence).
function choisirLibre(liste, h, dites = null, nom = "") {
  if (!dites) return choisir(liste, h);
  const libres = liste.map((x, i) => i).filter(i => !dites.has(`${nom}:${i}`));
  const i = libres.length ? choisir(libres, h) : Math.floor(h() * liste.length);
  dites.add(`${nom}:${i}`);
  return liste[i];
}

// Une réplique sans IA. "" = le compagnon se tait (selon son tempérament). Petite tablée : la réplique nomme un humain
// (PART_HUMAINS des fois, s'il en reste un en vie), un suspect humain d'abord. dites (facultatif) : les répliques déjà dites dans la
// partie (CerveauxCompagnons les tient, par partie) — jamais deux fois la même tant que la réserve n'est pas épuisée.
export const PART_HUMAINS = 0.8;
export function repliReplique(vue, graine, { combat = false, n = 0, dites = null } = {}) {
  const h = hasard(`parler|${graine}|${vue.id}|${vue.tour ?? 0}|${n}`);
  const R = repliquesDansLaLangue(vue.langue);
  if (combat) return choisir(R.combat, h)();
  // Aux Veillées, ce qu'il a à dire tout haut (vue.annonce : { cible, nom }, les politiques du système) passe avant le silence.
  if (vue.jeu === "loups" && vue.annonce?.nom) return choisirLibre(R.annonces, h, dites, "annonces")(vue.annonce.nom);
  const p = normaliserPersonnalite(vue.personnalite, vue.id);
  // Interpellé par le narrateur (vue.interpelle) : il répond, quel que soit son tempérament.
  if (h() < TEMPERAMENTS[p.temperament].silence && !vue.interpelle) return "";
  let autres = (vue.autres ?? []).filter(a => a.vivant !== false && a.id !== vue.id && !(vue.allies ?? []).includes(a.id));
  const humains = vue.jeu === "loups" && vue.petiteTablee ? autres.filter(a => (vue.humains ?? []).includes(a.id)) : [];
  if (humains.length && h() < PART_HUMAINS) autres = humains;
  const suspects = autres.filter(a => (vue.suspects ?? []).includes(a.id));
  const cible = choisir(suspects.length ? suspects : autres, h)?.nom ?? R.quelquun;
  const jeu = R[vue.jeu] ? vue.jeu : "aventure";
  return choisirLibre(R[jeu], h, dites, jeu)(cible);
}

// Une décision sans IA. Un loup ne vise pas les siens ; un villageois vise d'abord un suspect connu ; parfois on passe.
export function repliDecision(vue, demande, graine) {
  const h = hasard(`decider|${graine}|${vue.id}|${demande.cle ?? demande.invite ?? demande.question ?? ""}`);
  if (demande.type === "texte") {
    const R = repliquesDansLaLangue(vue.langue);
    if (demande.objet === "mur") return { texte: couper(murmureSansIA(vue, demande, h), demande.max ?? 120) };
    return { texte: couper(choisir(R.mots, h), demande.max ?? 120) };
  }
  if (demande.type === "option") return { choix: demande.options.length ? Math.floor(h() * demande.options.length) : null };
  const allies = new Set(vue.allies ?? []);
  const suspects = new Set(vue.suspects ?? []);
  const n = Math.max(1, demande.nombre ?? 1);
  const pasSoi = demande.candidats.filter(c => c.id !== vue.id);
  const permis = (allies.size ? pasSoi.filter(c => !allies.has(c.id)) : pasSoi);
  const pool = permis.length ? permis : demande.candidats;
  // Confier le sceau (élection, succession) : un loup à un allié (ou à lui-même), un villageois à quelqu'un qu'il ne soupçonne pas.
  if (demande.objet === "bailli" || demande.objet === "succession") {
    const vivants = demande.candidats;
    const amis = vivants.filter(c => allies.has(c.id) || (demande.objet === "bailli" && allies.size && c.id === vue.id));
    const surs = vivants.filter(c => !suspects.has(c.id));
    const c = choisir(amis.length ? amis : surs.length ? surs : vivants, h);
    return { cibles: c ? [c.id] : [] };
  }
  // Le Banc : un seul accusé ; sans IA, un loup acquitte les siens, un villageois condamne un suspect, sinon une fois sur deux.
  if (demande.objet === "banc") {
    const accuse = demande.candidats[0];
    if (!accuse || allies.has(accuse.id)) return { cibles: [] };
    return { cibles: suspects.has(accuse.id) || h() < 0.5 ? [accuse.id] : [] };
  }
  const pacte = repliDuPacte(vue, demande, h, { allies, suspects });
  if (pacte) return pacte;
  // Le Dernier souffle : une voix unique ; sans IA, on ne la donne que contre un suspect connu, une fois sur deux.
  if (demande.objet === "souffle") {
    const vises = pool.filter(c => suspects.has(c.id));
    return { cibles: vises.length && h() < 0.5 ? [choisir(vises, h).id] : [] };
  }
  if (demande.vote) {
    if (h() < 0.1) return { cibles: [] };
    const vises = pool.filter(c => suspects.has(c.id));
    const c = choisir(vises.length && h() < 0.85 ? vises : pool, h);
    return { cibles: c ? [c.id] : [] };
  }
  // La nuit, un loup chasse toujours ; un autre rôle agit le plus souvent.
  if (!allies.size && h() < 0.15) return { cibles: [] };
  return { cibles: melanger(pool, h).slice(0, n).map(c => c.id) };
}

// Les demandes du Pacte (système lakour-loups : jeu de soirée, Village, variantes, Gazette de la lune), sans modèle et sans politique du
// système : un choix sensé, jamais toujours le même (un compagnon n'accepte pas toujours un marché, le Crieur ne lit pas toujours une
// carte). demande.objet : le sujet (compagnons-jeu.js, sujetDemandeLoups) ; vue.effet : l'effet de son rôle. -> { cibles } | null
export function repliDuPacte(vue, demande, h, { allies = new Set(), suspects = new Set() } = {}) {
  const candidats = demande.candidats ?? [];
  const soi = candidats.find(c => c.id === vue.id);
  const un = l => (l.length ? [choisir(l, h).id] : []);
  const loup = vue.camp ? vue.camp === "meute" : allies.size > 0;
  const autres = candidats.filter(c => c.id !== vue.id);
  // Un sûr : un allié pour un loup ; pour un villageois, quelqu'un qu'il ne soupçonne pas.
  const surs = autres.filter(c => (loup ? allies.has(c.id) : !suspects.has(c.id)));
  const ennemis = autres.filter(c => !allies.has(c.id));
  const suspectsIci = ennemis.filter(c => suspects.has(c.id));
  switch (demande.objet) {
    // Se désigner = accepter (le marché avec le Malin, l'appel du Châtiment, le logement du Prévôt) ; supplier le Hobereau : toujours.
    case "marche": return { cibles: soi && h() < 0.35 ? [soi.id] : [] };
    case "appel": return { cibles: soi && h() < 0.75 ? [soi.id] : [] };
    case "logement": return { cibles: soi && h() < 0.8 ? [soi.id] : [] };
    case "supplique": return { cibles: candidats.length ? [candidats[0].id] : [] };
    // Le Hobereau gracie un allié (un loup), un villageois qu'il ne soupçonne pas (plus d'une fois sur deux), ou lui-même.
    case "grace": {
      const c = candidats[0];
      if (!c) return { cibles: [] };
      return { cibles: c.id === vue.id || allies.has(c.id) || (!loup && !suspects.has(c.id) && h() < 0.6) ? [c.id] : [] };
    }
    // La Chambrière se dévoue rarement (et jamais pour un suspect).
    case "chambriere": return { cibles: surs.length && h() < 0.25 ? un(surs) : [] };
    // Le Crieur public : une carte de sa main un matin sur deux.
    case "crieur-annonce": return { cibles: candidats.length && h() < 0.5 ? un(candidats) : [] };
    // Confier une charge (Crieur, Exécuteur, logement du Prévôt) : un sûr.
    case "crieur-nommer": case "crieur-transmettre": case "crieur-garder": case "executeur": case "prevot": case "vote-executeur":
      return { cibles: un(surs.length ? surs : autres.length ? autres : candidats) };
    // Le Chapardeur prend une carte du centre une fois sur deux ; le Bateleur joue presque toujours une carte.
    case "chapardeur": return { cibles: candidats.length && h() < 0.5 ? un(candidats) : [] };
    case "bateleur": return { cibles: candidats.length && h() < 0.85 ? un(candidats) : [] };
    // Le Souffre-douleur : qui votera demain — ceux qu'il ne soupçonne pas (un loup : sa meute d'abord), un au moins.
    case "votants": {
      const l = loup ? [...candidats.filter(c => allies.has(c.id)), ...melanger(candidats.filter(c => !allies.has(c.id)), h).slice(0, 1)]
        : candidats.filter(c => !suspects.has(c.id));
      return { cibles: (l.length ? l : candidats).slice(0, Math.max(1, demande.nombre ?? 1)).map(c => c.id) };
    }
    // La Chaîne des innocents : garantir l'innocence d'un debout (un loup blanchit un loup).
    case "chaine": return { cibles: un(surs.length ? surs : autres) };
    // La Braconnière emporte, le Châtiment punit : un suspect, sinon quelqu'un qui n'est pas des siens.
    case "emporter": case "chatiment": return { cibles: un(suspectsIci.length ? suspectsIci : ennemis.length ? ennemis : candidats) };
    // Les Influences, le Spiritisme, le Spectre, le Méchant Benêt : au hasard (rien à savoir de plus).
    case "influences": case "seance-question": case "spectre": case "benet": return { cibles: un(candidats) };
    case "seance-spirite": return { cibles: un(autres.length ? autres : candidats) };
    case "seance-designer": return { cibles: melanger(suspectsIci.length ? suspectsIci : ennemis.length ? ennemis : candidats, h).slice(0, Math.max(1, demande.nombre ?? 1)).map(c => c.id) };
    // La Grande Défiance : deux voix à deux amis, jamais à soi.
    case "defiance": return { cibles: melanger(surs.length >= 2 ? surs : [...surs, ...ennemis.filter(c => !surs.includes(c))], h).slice(0, 2).map(c => c.id) };
    // Le Châtiment : témoigner pour l'accusé, s'il est des siens (un loup) ou s'il n'est pas soupçonné (une fois sur deux).
    case "vote-chatiment": {
      const c = candidats[0];
      return { cibles: c && (allies.has(c.id) || (!loup && !suspects.has(c.id) && h() < 0.5)) ? [c.id] : [] };
    }
    default: break;
  }
  // Les réveils sans autre choix que soi : le Mâtin rejoint la meute deux fois sur cinq, la Liseuse d'étoiles dit oui le plus souvent.
  if (soi && candidats.length === 1) {
    if (vue.effet === "choisir-camp") return { cibles: h() < 0.4 ? [soi.id] : [] };
    if (vue.effet === "spiritisme") return { cibles: h() < 0.7 ? [soi.id] : [] };
  }
  return null;
}

// ------------------------------------------------------------------ rythme de parole (pas de boucle entre compagnons)
// Les compagnons que le narrateur interpelle dans sa narration (« Léonce, c'est à vous : pourquoi cette grâce ? ») : leur nom (ou leur
// prénom, seul de ce prénom) dans une phrase qui leur donne la parole — une question, ou « c'est à vous / à toi », « your turn »… Un
// nom cité dans un récit (« Léonce pâlit. ») n'est pas une interpellation. candidats : [{ id, nom }]. -> [id]
const DONNE_LA_PAROLE = /\?|(?<!\p{L})(?:c'est à (?:vous|toi)|à (?:vous|toi)|votre tour|ton tour|qu'en dites-vous|qu'en dis-tu|répondez|réponds|parlez|parle|expliquez|explique|your turn|over to you|what do you say|answer|speak|explain)(?!\p{L})/iu;
const echapperRegex = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function interpellesDans(texte, candidats = []) {
  const phrases = String(texte ?? "").replace(/<[^>]*>/g, " ").split(/(?<=[.!?…»])\s+|\n+/);
  const prenom = c => String(c.nom ?? "").trim().split(/\s+/)[0];
  const prenoms = new Map();
  for (const c of candidats) prenoms.set(prenom(c), (prenoms.get(prenom(c)) ?? 0) + 1);
  const cite = (phrase, c) => [c.nom, ...(prenoms.get(prenom(c)) === 1 ? [prenom(c)] : [])].filter(n => n && n.length > 1)
    .some(n => new RegExp(`(?<!\\p{L})${echapperRegex(n)}(?!\\p{L})`, "iu").test(phrase));
  const ids = [];
  for (const phrase of phrases) {
    if (!DONNE_LA_PAROLE.test(phrase)) continue;
    for (const c of candidats) if (!ids.includes(c.id) && cite(phrase, c)) ids.push(c.id);
  }
  return ids;
}

// Un lot de messages transmis au MJ ne déclenche une réaction des compagnons que s'il contient autre chose que des
// répliques de compagnons (un joueur humain, un événement du plateau) : deux compagnons ne se répondent jamais en boucle.
// Une annonce du système (mort, vote ouvert…) ne les réveille pas non plus : ce n'est pas quelqu'un qui leur parle.
export const SANS_REACTION = ["compagnon", "annonce"];
export const peuventReagir = lot => (lot ?? []).some(e => !SANS_REACTION.includes(e?.source ?? "humain"));

// Une annonce publique du système des Veillées (lakour-loups), postée au chat par le navigateur du MJ actif.
export const estAnnonceSysteme = html => /class="lakour-loups annonce"/.test(String(html ?? ""));
// Le même, pour un message : seulement s'il est écrit par un MJ (le système poste ses annonces depuis le navigateur du MJ
// actif) ; un joueur qui copie la classe dans son message reste un joueur.
export const estAnnonceDuSysteme = message => message?.author?.isGM === true && estAnnonceSysteme(message?.content);

// Qui parle, au plus max, une fois chacun : ceux que le texte cite d'abord, puis ceux qui ont parlé le moins récemment.
export function choisirOrateurs(candidats, { max = 1, mentions = "", derniere = new Map() } = {}) {
  if (max <= 0) return [];
  const texte = String(mentions ?? "").toLowerCase();
  const cite = c => (c.nom && texte.includes(c.nom.toLowerCase()) ? 0 : 1);
  return [...candidats]
    .sort((a, b) => cite(a) - cite(b) || (derniere.get(a.id) ?? 0) - (derniere.get(b.id) ?? 0) || a.nom.localeCompare(b.nom))
    .slice(0, max);
}

// ------------------------------------------------------------------ le cerveau
// Dépendances injectées (rien de Foundry ici) :
//   fournisseur() -> fournisseur du modèle des compagnons (envoyerCourt({ systeme, texte }) -> { texte, usage, arret }) ou null ;
//   modele() -> identifiant du modèle (pour le coût) ; compter(usage, modele) ; budgetDepasse() ; graine.
// Sans fournisseur, avec le fournisseur factice, budget épuisé ou en cas d'erreur réseau : repli déterministe.
export class CerveauxCompagnons {
  constructor({ fournisseur = () => null, modele = () => "", compter = async () => {}, budgetDepasse = () => false, graine = "compagnons" } = {}) {
    Object.assign(this, { fournisseur, modele, compter, budgetDepasse, graine });
    this.appels = 0;
    this.repliques = new Map();   // acteurId -> nombre de répliques de repli (pour varier d'un tour de parole à l'autre)
    // Les répliques de repli déjà dites dans la partie (vue.partie), tous compagnons confondus : pas deux fois la même ; et les phrases
    // de repli du Mur des murmures de la nuit (vue.partie, vue.tour) : jamais deux fois la même sur un mur.
    this.dites = { partie: null, ensemble: new Set() };
    this.mur = { cle: null, phrases: new Set() };
    this.journal = [];   // { acteurId, operation, source } : pour la console et les essais
  }

  // Le fournisseur à utiliser maintenant, ou null pour le repli.
  modeIA() {
    let f = null;
    try { f = this.fournisseur(); } catch { f = null; }
    if (!f || f.nom === "factice" || typeof f.envoyerCourt !== "function") return null;
    if (this.budgetDepasse()) return null;
    return f;
  }

  async #appeler(f, contexte) {
    this.appels++;
    const r = await f.envoyerCourt(contexte);
    await this.compter(r?.usage ?? {}, this.modele());
    return r ?? { texte: "", arret: "fin" };
  }

  #noter(vue, operation, source) {
    this.journal.push({ acteurId: vue.id, operation, source });
    if (this.journal.length > 200) this.journal.shift();
  }

  // Une réplique en personnage : { texte ("" = rien), source: "ia" | "repli" | "muet" }.
  async parler(vue, { consigne = "", combat = false } = {}) {
    if (!vue.peutParler) return { texte: "", source: "muet" };
    const f = this.modeIA();
    if (f) {
      try {
        const r = await this.#appeler(f, contexteCompagnon(vue, { consigne: consigne || (combat ? CONSIGNE_COMBAT : "") }));
        this.#noter(vue, "parler", "ia");
        return { texte: r.arret === "refus" ? "" : nettoyerReplique(r.texte, vue.nom), source: "ia" };
      } catch (e) {
        console.warn("lakour-mj-ia | compagnon, repli après erreur :", e?.message ?? e);
      }
    }
    this.#noter(vue, "parler", "repli");
    const n = (this.repliques.get(vue.id) ?? 0) + 1;
    this.repliques.set(vue.id, n);
    return { texte: repliReplique(vue, this.graine, { combat, n, dites: combat ? null : this.#ditesDeLaPartie(vue) }), source: "repli" };
  }

  // Les répliques déjà dites dans la partie de cette vue (une partie neuve : la réserve repart entière).
  #ditesDeLaPartie(vue) {
    const partie = String(vue.partie ?? "");
    if (this.dites.partie !== partie) this.dites = { partie, ensemble: new Set() };
    return this.dites.ensemble;
  }
  // Les phrases déjà écrites (sans IA) sur le Mur de cette nuit.
  #phrasesDuMur(vue) {
    const cle = `${vue.partie ?? ""}|${vue.tour ?? 0}`;
    if (this.mur.cle !== cle) this.mur = { cle, phrases: new Set() };
    return this.mur.phrases;
  }

  // Une décision : { cibles } | { texte } | { choix }, plus source ("ia", "invalide", "politique", "repli"). Invalide = passer.
  // repli (facultatif) : () -> { cibles } | null (ou sa promesse), une décision sans modèle mieux informée que repliDecision (aux
  // Veillées : les politiques de jeu du système, compagnons-jeu.js) ; null ou une erreur : le repli déterministe.
  async decider(vue, demande, { repli = null } = {}) {
    const f = this.modeIA();
    if (f) {
      try {
        const r = await this.#appeler(f, contexteCompagnon(vue, { demande }));
        const v = r.arret === "refus" ? null : analyserDecision(r.texte, demande);
        this.#noter(vue, "decider", v ? "ia" : "invalide");
        return v ? { ...v.valeur, source: "ia" } : { ...passer(demande), source: "invalide" };
      } catch (e) {
        console.warn("lakour-mj-ia | compagnon, repli après erreur :", e?.message ?? e);
      }
    }
    if (typeof repli === "function") {
      try {
        const v = await repli();
        if (v && Array.isArray(v.cibles)) {
          this.#noter(vue, "decider", "politique");
          return { ...v, source: "politique" };
        }
      } catch (e) {
        console.warn("lakour-mj-ia | compagnon, politique en échec :", e?.message ?? e);
      }
    }
    this.#noter(vue, "decider", "repli");
    if (demande.type === "texte" && demande.objet === "mur") {
      const phrases = this.#phrasesDuMur(vue);
      const r = repliDecision(vue, { ...demande, deja: [...(demande.deja ?? []), ...phrases] }, this.graine);
      if (r.texte) phrases.add(r.texte);
      return { ...r, source: "repli" };
    }
    return { ...repliDecision(vue, demande, this.graine), source: "repli" };
  }
}
