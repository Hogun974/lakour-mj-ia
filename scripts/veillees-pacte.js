// Le Pacte aux Veillées (système lakour-loups, étapes 1 à 9 de docs/plan-le-pacte.md dans le dépôt des Veillées) : ce que le
// narrateur doit savoir de la mise en place et de la partie, mis en texte pour lui seul ; ce qui lit l'API du système passe par
// appelSur, qui rend null quand la fonction n'existe pas (un monde avec un système des Veillées plus ancien) ou lève une erreur.
// Logique pure : aucun Foundry ici (le nom d'un villageois et la lecture des réglages sont donnés par l'appelant).
//
// Jamais de clé brute (« loup-de-brumecombe ») ni d'identifiant dans ces textes : des noms seulement (les essais d'intégration des
// Veillées le vérifient, verifierTexte).

// Une fonction de l'API du système, si elle existe ; null sinon, ou si elle lève (MJ non actif, partie absente…).
export function appelSur(api, cle, ...args) {
  if (typeof api?.[cle] !== "function") return null;
  try { return api[cle](...args); } catch { return null; }
}
// La même, attendue (une fonction asynchrone qui échoue rend null).
export async function attendreSur(api, cle, ...args) {
  if (typeof api?.[cle] !== "function") return null;
  try { return await api[cle](...args); } catch { return null; }
}

// ------------------------------------------------------------------ l'ordre d'appel du livre (étape 5)
// Le système le tient (api.ordreDeNuit, ordres du contenu) : rappelé ici pour le narrateur, qui ne cite jamais un rôle à voix haute
// (la composition ne s'annonce pas) mais doit savoir pourquoi la nuit se déroule ainsi.
export const ORDRE_D_APPEL = "Première nuit : Chapardeur, Bateleur, Entremetteuse, Liseuse de cendres, Furet, amoureux, Lavandières, "
  + "Bûcherons, Enfant des bois, Pie, Incendiaire, Garde du pont, meute (avec le Mâtin s'il la rejoint), Enfant de la brume, Loup pâle, "
  + "Louve mère, Loup affamé, Herboriste, Liseuse d'étoiles, Joueur de vielle, charmés ; les nuits suivantes, les mêmes sans les rôles "
  + "de première nuit (le Loup pâle une nuit sur deux, le Loup affamé tant qu'aucun loup n'est mort). Le jour : les victimes, les oies, "
  + "le Spiritisme, le Crieur public, le débat, le vote (et la Chambrière), le Feu follet, le second vote du Greffier bègue.";

// ------------------------------------------------------------------ l'appel des charmés, à voix haute (étape 6c)
// À la table, le narrateur appelle chaque étape de la même voix, et tout le village l'entend : « les charmés, ouvrez les yeux » dit à
// tous qu'un Joueur de vielle joue (les politiques des joueurs simulés le supposent : charmesAppeles, logique/politiques.mjs des
// Veillées). Le MJ IA ne nomme aucun autre rôle qui se réveille (la composition ne s'annonce pas) ; celui-ci, il le dit tout haut, au
// chat public (loups_nuit), sans nommer le Joueur de vielle ni aucun charmé. Le drapeau APPEL_DES_CHARMES ({ partie, tour }) permet
// aux compagnons de compter les nuits d'appel (compagnons-jeu.js).
export const APPEL_DES_CHARMES = "appelDesCharmes";
export const texteAppelDesCharmes = (langue = "fr") => (langue === "en"
  ? "The charmed ones, open your eyes… look at one another, and know each other. Now close your eyes."
  : "Les charmés, ouvrez les yeux… regardez-vous, reconnaissez-vous. Refermez les yeux.");
// Les nuits où les charmés ont été appelés, lues au chat public (messages du MJ IA marqués APPEL_DES_CHARMES) pour la partie donnée.
// ecritParUnMJ(m) : le message vient-il d'un MJ (un joueur ne peut pas faire croire à un appel) ? -> Set(tour)
export function nuitsDAppelAuChat(messages = [], { partie = "", id = "lakour-mj-ia", ecritParUnMJ = () => true } = {}) {
  const nuits = new Set();
  for (const m of messages ?? []) {
    const f = m?.flags?.[id]?.[APPEL_DES_CHARMES];
    if (!f || m.whisper?.length || !ecritParUnMJ(m)) continue;
    if (partie && f.partie && String(f.partie) !== String(partie)) continue;
    nuits.add(Number(f.tour) || 0);
  }
  return nuits;
}

// ------------------------------------------------------------------ les variantes du jeu de soirée (étape 5)
// Les réglages monde de chaque variante (lakour-loups, logique/variantes.mjs : REGLAGES_DES_VARIANTES).
// Le Pacte, étape 6c : « une allégeance loup de plus » (allegeanceLoup, réglage allegeanceLoupEnPlus), seulement avec Double visage.
export const REGLAGES_DES_VARIANTES = { chandelles: "chandelles", angoissante: "chandellesAngoissantes", chaine: "chaineDesInnocents",
  mur: "murDesMurmures", doubleVisage: "doubleVisage", allegeanceLoup: "allegeanceLoupEnPlus", vendanges: "vendanges", envoutement: "envoutement" };
// Ce que le narrateur peut demander (outil : une liste) ; « aucune » : aucune variante, quels que soient les réglages ;
// « allegeance-loup » : une allégeance loup de plus au paquet de Double visage (sans Double visage, rien).
export const CHOIX_DES_VARIANTES = ["aucune", "chandelles", "angoissante", "chaine", "mur", "double-visage-petite", "double-visage-grande",
  "allegeance-loup", "vendanges", "envoutement"];
export const NOMS_DES_VARIANTES = { chandelles: "la Veillée aux chandelles", chaine: "la Chaîne des innocents", mur: "le Mur des murmures",
  doubleVisage: "Double visage", vendanges: "les Vendanges", envoutement: "l'Envoûtement" };
const VIDE = () => ({ chandelles: false, angoissante: false, chaine: false, mur: false, doubleVisage: "", allegeanceLoup: false, vendanges: false, envoutement: false });

// La liste de l'outil -> le choix explicite { chandelles, …, doubleVisage } ; liste vide : undefined (les réglages du monde décident).
export function variantesDemandees(liste = []) {
  const l = (Array.isArray(liste) ? liste : []).map(x => String(x ?? "").trim().toLowerCase()).filter(Boolean);
  if (!l.length) return undefined;
  const v = VIDE();
  if (l.includes("aucune")) return v;
  for (const x of l) {
    if (x === "double-visage-petite" || x === "double-visage-grande") v.doubleVisage = x.endsWith("grande") ? "grande" : "petite";
    else if (x === "allegeance-loup") v.allegeanceLoup = true;
    else if (x in v && x !== "doubleVisage" && x !== "allegeanceLoup") v[x] = true;
  }
  if (v.angoissante) v.chandelles = true;
  // Comme le système (choixDesVariantes) : l'allégeance de plus n'a de sens qu'avec Double visage.
  if (!v.doubleVisage) v.allegeanceLoup = false;
  return v;
}
// Le système des Veillées connaît-il « une allégeance loup de plus » (Le Pacte, étape 6c) ? Sans logique (texte pur) : oui.
const connaitLAllegeance = logique => !logique || typeof logique.allegeanceLoupEnPlus === "function"
  || Boolean(logique.REGLAGES_DES_VARIANTES && "allegeanceLoup" in logique.REGLAGES_DES_VARIANTES);
// Les variantes de la veillée à venir : le choix explicite, sinon les réglages monde (lire(cle) : la valeur du réglage
// lakour-loups.<cle>, undefined s'il n'existe pas) ; filtrées comme le fera le système (logique.variantesPermises, s'il l'a).
export function variantesDeLaVeillee(voulues, lire = () => undefined, { logique = null, places = 0, peste = false, tablee = false, saintMartin = false } = {}) {
  const v = VIDE();
  for (const [cle, reglage] of Object.entries(REGLAGES_DES_VARIANTES)) {
    const x = voulues && cle in voulues ? voulues[cle] : lire(reglage);
    v[cle] = cle === "doubleVisage" ? (["petite", "grande"].includes(x) ? x : "") : Boolean(x);
  }
  v.angoissante = v.chandelles && v.angoissante;
  // Une allégeance loup de plus : avec Double visage, et seulement si le système la connaît (un système plus ancien l'ignorerait :
  // ne pas l'annoncer).
  v.allegeanceLoup = Boolean(v.doubleVisage && v.allegeanceLoup && connaitLAllegeance(logique));
  if (typeof logique?.variantesPermises === "function") {
    try {
      const p = { ...v, ...logique.variantesPermises(v, { places, peste, tablee, saintMartin }) };
      p.allegeanceLoup = Boolean(p.doubleVisage && p.allegeanceLoup);
      return p;
    } catch { /* repli : sans filtre */ }
  }
  return v;
}
// Le conseil de taille d'« une allégeance loup de plus » (Le Pacte, étape 6c, docs/equilibre-veillees.md des Veillées) : le paquet du
// livre favorise le village aux grandes tables ; mesuré, la carte de plus est conseillée dès 16 joueurs en petite complication (et à 13),
// dès 12 en grande ; en dessous, elle donne sept à neuf parties sur dix à la meute. mode : "petite" | "grande". -> Boolean
export const allegeanceLoupConseillee = (mode, places) => {
  const n = Number(places) || 0;
  return mode === "grande" ? n >= 12 : mode === "petite" ? n >= 16 || n === 13 : false;
};
// Ce que le moteur dit au narrateur de la carte de plus, pour Double visage à cette taille : "" sans Double visage.
export function conseilDeLAllegeance(v = {}, places = 0) {
  if (!v?.doubleVisage) return "";
  const conseillee = allegeanceLoupConseillee(v.doubleVisage, places);
  const regle = "conseillée dès 16 joueurs en petite complication (et à 13), dès 12 en grande";
  if (v.allegeanceLoup) {
    return conseillee ? `Une allégeance loup de plus : en jeu (${regle} : c'est le cas ici).`
      : `Une allégeance loup de plus : en jeu, mais elle n'est ${regle} ; à ${places || "ce nombre de"} joueurs, elle donne la partie à la meute `
        + "sept à neuf fois sur dix : propose plutôt le paquet du livre (sans « allegeance-loup »).";
  }
  return conseillee ? `Une allégeance loup de plus (variante « allegeance-loup ») est ${regle} : à ${places} joueurs, le paquet du livre `
    + "favorise le village ; propose-la à la table." : "";
}
// « la Veillée aux chandelles (angoissante), les Vendanges » ; "" sans variante.
export function texteDesVariantes(v = {}) {
  const noms = [];
  if (v.chandelles) noms.push(`${NOMS_DES_VARIANTES.chandelles}${v.angoissante ? " (angoissante)" : ""}`);
  for (const cle of ["chaine", "mur"]) if (v[cle]) noms.push(NOMS_DES_VARIANTES[cle]);
  if (v.doubleVisage) noms.push(`${NOMS_DES_VARIANTES.doubleVisage} (${v.doubleVisage === "grande" ? "grande" : "petite"} complication`
    + `${v.allegeanceLoup ? ", une allégeance loup de plus" : ""})`);
  for (const cle of ["vendanges", "envoutement"]) if (v[cle]) noms.push(NOMS_DES_VARIANTES[cle]);
  return noms.join(", ");
}
export const variantesActives = v => Boolean(v && (v.chandelles || v.chaine || v.mur || v.doubleVisage || v.vendanges || v.envoutement));

// ------------------------------------------------------------------ le niveau (étape 6c)
// Les débutants ont un loup de moins que le barème (logique/composition.mjs des Veillées, LOUPS_DE_MOINS, jamais moins d'un) : le
// générateur et les compositions prêtes du système le comptent déjà. Ce que le narrateur en sait (pour lui seul : le nombre de loups
// ne s'annonce pas) ; "" pour un autre niveau, ou un système qui ne le fait pas.
export function notesDuNiveau(niveau = "", logique = null) {
  const moins = Number(logique?.LOUPS_DE_MOINS?.[niveau]) || 0;
  if (moins <= 0) return "";
  return `Niveau débutants : ${moins > 1 ? `${moins} loups` : "un loup"} de moins que le barème (jamais moins d'un), déjà compté par `
    + "le système ; n'en retire pas un autre, et ne l'annonce pas (le nombre de loups reste secret).";
}

// ------------------------------------------------------------------ la mise en place (après loups_distribuer, loups_rejouer)
// Ce que la table voit (à présenter) et, à part, ce que le narrateur seul sait. nom(id) : le nom d'un villageois.
// -> [ligne]
export function miseEnPlaceLoups(api, { nom = id => id, variantes = null } = {}) {
  const lignes = [];
  const e = appelSur(api, "etat") ?? {};
  const v = variantes ?? e.variantes ?? null;
  if (variantesActives(v)) {
    lignes.push(`Variantes de cette veillée (PUBLIQUES, déjà annoncées au chat ; rappelle-les en une phrase) : ${texteDesVariantes(v)}.`);
    if (v.doubleVisage) {
      lignes.push("Double visage : chacun a une carte visible (retournée devant tous) et une allégeance secrète ; ne dis jamais l'allégeance."
        + (v.allegeanceLoup ? " Le paquet a une allégeance loup de plus que celui du livre (public, annoncé avec la variante)." : ""));
    }
    if (v.vendanges) lignes.push("Les Vendanges : un loup de plus ; la meute frappe un voisin d'un loup ; le Bailli vote seul et d'abord.");
  }
  const a = appelSur(api, "ambigus");
  if (a) {
    if (a.bateleur?.length) lignes.push(`Cartes du Bateleur, face visible (PUBLIQUES, annoncées sans nommer le Bateleur : ne le nomme pas) : ${a.bateleur.map(c => c.nom).join(", ")}.`);
    if (a.groupes?.a?.length && a.groupes?.b?.length) {
      lignes.push(`Les deux groupes de l'Illuminé (PUBLICS, annoncés comme « deux bords » sans nommer l'Illuminé : ne le nomme pas) : ${a.groupes.a.map(x => x.nom ?? nom(x.id ?? x)).join(", ")} | `
        + `${a.groupes.b.map(x => x.nom ?? nom(x.id ?? x)).join(", ")}.`);
    }
    if (a.commenceParLeJour) {
      lignes.push("Le Feu follet est au paquet : la veillée COMMENCE PAR UN JOUR. Présente le village, ouvre le débat, puis le vote d'exécution "
        + "(loups_vote ouvrir, puis clore, puis loups_eliminer) ; la première nuit (loups_nuit) ne vient qu'ensuite.");
    }
  }
  const s = appelSur(api, "ambigusSecrets");
  if (s?.centre?.length) lignes.push(`Pour toi seul (SECRET) : les cartes du centre du Chapardeur — ${s.centre.map(c => c.nom).join(", ")}.`);
  const village = appelSur(api, "village");
  if (village?.actif) {
    const tenus = (village.batiments ?? []).filter(b => b.acteurId).map(b => `${b.occupant || nom(b.acteurId)} — ${b.titre} (${b.nom})`);
    const vacants = (village.batiments ?? []).filter(b => !b.acteurId).map(b => b.nom);
    lignes.push(`Le Village (PUBLIC, annoncé) : ${tenus.join(" ; ") || "aucune personnalité"}`
      + `${village.chemineaux?.length ? ` ; Chemineaux : ${village.chemineaux.map(c => c.nom).join(", ")}` : ""}`
      + `${vacants.length ? ` ; vacants : ${vacants.join(", ")}` : ""}. Présente-les ; avant la première nuit, tu peux changer qui tient quoi `
      + "(loups_pacte, action « installer »).");
  }
  const traits = appelSur(api, "traits");
  if (traits && Object.keys(traits).length) {
    lignes.push(`Traits visibles (PUBLICS, déjà au chat ; décris-les à ta guise) : ${Object.entries(traits).map(([id, t]) => `${nom(id)} — ${t.texte}`).join(" ; ")}.`);
  }
  const g = appelSur(api, "gazette");
  if (g?.actif) {
    lignes.push(`La Gazette de la lune est en jeu (annoncée au chat) : une carte au matin${g.rythme > 1 ? `, tous les ${g.rythme} jours` : ""}`
      + `${g.choix ? " (tu choisis les cartes : loups_gazette, « lire »)" : ""} ; elle est lue au chat, tu la racontes sans la relire.`);
  }
  if (g?.crieur?.actif) {
    lignes.push(g.crieur.acteurId ? `Crieur public : ${g.crieur.nom || nom(g.crieur.acteurId)} (public ; ses cartes sont SECRÈTES).`
      : "Crieur public en jeu : le Bailli le nommera (une demande lui sera faite) ; ses cartes sont SECRÈTES.");
  }
  return lignes;
}

// ------------------------------------------------------------------ l'état du Pacte, à chaque tour (contexte du narrateur)
// e : l'état (copie, celle du MJ actif) ; nom(id). -> [ligne]
export function etatPacteLoups(api, e = {}, nom = id => id) {
  const lignes = [];
  if (e.vainqueur) return lignes;
  const p = appelSur(api, "pacte");
  if (p) {
    if (p.sagessePerdue) lignes.push("Brumecombe a perdu sa sagesse (l'Aïeul) : plus aucun pouvoir de rôle du Village ni de métier ; les charges restent.");
    if (p.gracies?.length) lignes.push(`Innocents graciés (publics, carte retournée ; ils ne votent plus) : ${p.gracies.map(x => nom(x.acteurId)).join(", ")}.`);
    if (p.votants?.ids?.length && Number(p.votants.tour) === Number(e.tour)) {
      lignes.push(`Aujourd'hui, seuls votent à l'exécution (liste du Souffre-douleur, publique) : ${p.votants.ids.map(nom).join(", ")}.`);
    }
    if (p.plume?.cible && Number(p.plume.tour) === Number(e.tour) && !p.plume.servi) lignes.push(`La plume noire (publique) désigne ${nom(p.plume.cible)} : deux voix contre lui au premier vote du jour.`);
  }
  const a = appelSur(api, "ambigus");
  if (a?.devouements?.length) lignes.push(`Dévouements de la Chambrière (publics) : ${a.devouements.map(d => `${nom(d.acteurId)} a pris la carte de ${nom(d.de)}`).join(" ; ")}.`);
  if (a?.groupes?.a?.length) lignes.push(`Groupes de l'Illuminé (publics, sans le nommer) : ${a.groupes.a.map(x => x.nom ?? nom(x.id)).join(", ")} | ${a.groupes.b.map(x => x.nom ?? nom(x.id)).join(", ")}.`);
  if (a?.commenceParLeJour && e.phase === "preparation") lignes.push("Feu follet : la veillée commence par un jour (débat et vote d'exécution avant la première nuit).");
  const village = appelSur(api, "village");
  if (village?.actif) {
    const tenus = (village.batiments ?? []).filter(b => b.acteurId).map(b => `${b.occupant || nom(b.acteurId)} (${b.titre}${b.disponible ? "" : ", pouvoir servi"})`);
    lignes.push(`Le Village (public) : ${tenus.join(", ") || "aucune personnalité"}${village.chemineaux?.length ? ` ; Chemineaux : ${village.chemineaux.map(c => c.nom).join(", ")}` : ""}`
      + `${village.detruits?.length ? ` ; brûlés : ${village.detruits.map(d => d.nom).join(", ")}` : ""}.`);
    if (village.regent?.ids?.length && Number(village.regent.tour) === Number(e.tour)) lignes.push(`Privés de vote par le Régent aujourd'hui : ${village.regent.noms?.join(", ") || village.regent.ids.map(nom).join(", ")}.`);
    if (village.graces?.length) lignes.push(`Graciés par le Hobereau : ${village.graces.map(x => nom(x.acteurId)).join(", ")}.`);
  }
  const v = e.variantes;
  if (variantesActives(v)) {
    lignes.push(`Variantes en jeu (publiques) : ${texteDesVariantes(v)}.`);
    if (v.chaineEnCours) lignes.push("La Chaîne des innocents est en cours : le système la mène (chaque désigné s'assied, au chat) ; personne ne vote.");
  }
  lignes.push(...reglesDesSolitaires(api, e, nom));
  const g = appelSur(api, "gazette");
  if (g?.actif) {
    const jour = (g.tirees ?? []).filter(x => Number(x.tour) === Number(e.tour)).map(x => x.nom);
    if (jour.length) lignes.push(`Gazette de la lune, ce matin (déjà au chat) : ${jour.join(", ")}.`);
    if (g.enCours?.length) lignes.push(`Cartes de la Gazette en cours : ${g.enCours.map(c => `${c.nom}${c.effet ? ` (${String(c.effet).replace(/[.\s]+$/, "")})` : ""}`).join(" ; ")}.`);
    if (g.conduite?.length) lignes.push("Carte de conduite du jour : qui l'enfreint perd son vote (loups_gazette, « priver » ; une parole à voix haute sous Ni loup ni moi : « relever »).");
    if (g.prives?.length) lignes.push(`Privés de vote par la Gazette : ${g.prives.map(nom).join(", ")}.`);
    if (g.variante && !g.variante.appliquee) lignes.push("Une carte propose une variante pour ce tour : loups_gazette, « variante », si la table la veut.");
    if (g.executeur?.acteurId) lignes.push(`Exécuteur (public) : ${g.executeur.nom || nom(g.executeur.acteurId)} — les cartes des condamnés ne sont pas retournées.`);
  }
  if (g?.crieur?.acteurId) lignes.push(`Crieur public : ${g.crieur.nom || nom(g.crieur.acteurId)} (ses cartes sont SECRÈTES).`);
  return lignes;
}

// ------------------------------------------------------------------ le Revenant et le Chasseur de primes (étape 6b)
// Leur victoire a un jour (logique/victoire.mjs des Veillées) : le Revenant ne gagne qu'exécuté au vote à partir du JOUR_DU_REVENANT ;
// la cible du Chasseur de primes doit tomber au vote au plus tard le JOUR_LIMITE_DE_LA_PRIME, sinon (ou morte autrement) sa prime échoue
// au matin et il devient simple villageois (le système le fait et le lui dit, à lui seul). Un système sans ces règles : rien.
const VICTOIRE_DU_REVENANT = "execute";
const VICTOIRE_DE_LA_PRIME = "cible-executee";
// La clé de victoire d'un rôle (celle du système, sinon comme lui : par la clé du rôle).
export function victoireDuRole(role, logique = null) {
  const s = role?.system ?? role ?? {};
  if (typeof logique?.victoireCleDe === "function") {
    try { return String(logique.victoireCleDe({ cle: s.cle ?? "", victoireCle: s.victoireCle ?? "" }) ?? ""); } catch { /* repli */ }
  }
  if (s.victoireCle) return String(s.victoireCle);
  const cle = String(s.cle ?? "");
  return /revenant/.test(cle) ? VICTOIRE_DU_REVENANT : /chasseu.*prime/.test(cle) ? VICTOIRE_DE_LA_PRIME : "";
}
// Les jours de ces règles, si le système les a : { revenant, prime } (0 : la règle n'existe pas).
export const joursDesSolitaires = (logique = null) => ({ revenant: Number(logique?.JOUR_DU_REVENANT) || 0, prime: Number(logique?.JOUR_LIMITE_DE_LA_PRIME) || 0 });
// Pour le narrateur seul (SECRET) : ce que ces deux rôles doivent encore faire. e : l'état du MJ actif (les primes y sont). -> [ligne]
export function reglesDesSolitaires(api, e = {}, nom = id => id) {
  const jours = joursDesSolitaires(api?.logique);
  if ((!jours.revenant && !jours.prime) || e.vainqueur) return [];
  const lignes = [];
  const tous = appelSur(api, "villageois") ?? [];
  for (const a of tous) {
    const role = appelSur(api, "roleDe", a) ?? a?.items?.find?.(i => i.type === "role") ?? null;
    const victoire = victoireDuRole(role, api.logique);
    const camp = appelSur(api, "campDe", a) ?? role?.system?.camp ?? "";
    if (victoire === VICTOIRE_DU_REVENANT && jours.revenant && a.system?.vivant !== false && camp === "solitaire") {
      lignes.push(`Pour toi seul (SECRET) : ${a.name ?? nom(a.id)} (${role?.name ?? "le Revenant"}) ne gagne qu'exécuté au vote à partir du jour `
        + `${jours.revenant} ; exécuté plus tôt, il meurt sans gagner. N'en dis rien.`);
    }
    if (victoire === VICTOIRE_DE_LA_PRIME && jours.prime) {
      const cible = e.primes?.[a.id];
      if (camp === "solitaire" && cible && Number(e.tour) <= jours.prime) {
        lignes.push(`Pour toi seul (SECRET) : la cible de ${a.name ?? nom(a.id)} (${role?.name ?? "Chasseur de primes"}) est ${nom(cible)} ; elle doit tomber `
          + `au vote au plus tard le jour ${jours.prime}, sinon (ou morte autrement) la prime échoue au matin : il devient simple villageois `
          + "(le système le fait et le lui dit). N'en dis rien.");
      } else if (camp === "village" && a.system?.vivant !== false) {
        lignes.push(`Pour toi seul (SECRET) : la prime de ${a.name ?? nom(a.id)} a échoué ; il joue désormais avec le Village (lui seul le sait).`);
      }
    }
  }
  return lignes;
}

// ------------------------------------------------------------------ le dépouillement : ce qui s'ajoute au décompte
// r : le résultat de cloreVote. -> [phrase]
export function resultatDuPacte(r = {}, nom = id => id) {
  const x = [];
  if (r.departage?.auto?.length) x.push(`La voix du Bailli ${nom(r.departage.par)} a tranché d'elle-même : ${r.departage.auto.map(nom).join(" et ")} (annoncé).`);
  if (r.plume) x.push(`La plume noire a porté deux voix sans votant contre ${nom(r.plume)}.`);
  if (r.souffreDouleur && r.remplace) x.push(`Les Vendanges : ${nom(r.souffreDouleur)}, le Souffre-douleur, meurt à la place de ${nom(r.remplace)}.`);
  else if (r.souffreDouleur) x.push(`L'égalité est PAYÉE par ${nom(r.souffreDouleur)}, le Souffre-douleur : il est le condamné ; pas de revote.`);
  if (r.chaine) x.push(`La Chaîne des innocents : ${(r.chaine.assis ?? []).length} innocent(s) se sont assis ; le dernier debout est condamné.`);
  if (r.mode === "defiance") x.push("La Grande Défiance : sont condamnés ceux qui n'ont reçu aucune voix.");
  if (r.cauchemar) x.push("Le Cauchemar : les plus cités sont éliminés.");
  else if (r.mode === "suite") x.push("Vote à tour de rôle (voix publiques).");
  return x;
}
