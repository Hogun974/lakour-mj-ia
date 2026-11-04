// Histoire de chaque personnage (40k, Warcraft, Fénoir ; pas les Veillées) : la logique pure, sans Foundry
// (essais/histoire.test.mjs). Un journal « Histoire de <nom> » dans le dossier « Histoires des personnages », quatre pages :
// « Qui il est » et « Son histoire » (lisibles de tous), « Ce qu'il garde pour lui » (son joueur et le MJ seulement, par la
// propriété de la page : Foundry livre pourtant les documents à tous les navigateurs, ce n'est pas un coffre), « Chapitres »
// (complétés au fil de la campagne). L'acteur garde l'uuid du journal (flags.lakour-mj-ia.histoire). Le branchement à Foundry
// (création, bouton des fiches, outil histoire_personnage) est dans histoire.js et outils-histoire.js ; contrat : §10.5 de
// docs/survie-contrat.md (dépôt lakour-fenoir).

export const SYSTEMES_HISTOIRE = ["impmal", "dnd5e", "lakour-survie"];
export const DOSSIER_HISTOIRES = "Histoires des personnages";
export const CLASSE_AIDE = "lakour-histoire-aide";
const ID_MJIA = "lakour-mj-ia";

// Les quatre pages, dans l'ordre. prive : réservée au propriétaire de l'acteur et au MJ.
export const PAGES_HISTOIRE = [
  { cle: "qui", nom: "Qui il est", prive: false },
  { cle: "histoire", nom: "Son histoire", prive: false },
  { cle: "secret", nom: "Ce qu'il garde pour lui", prive: true },
  { cle: "chapitres", nom: "Chapitres", prive: false }
];
export const nomJournalHistoire = nom => `Histoire de ${String(nom ?? "").trim() || "?"}`;

// Questions d'aide (journal créé sans IA, ou en attente de l'IA), par page et par monde.
const ORIGINE = {
  impmal: "De quel monde viens-tu (ruche, forge, monde agricole, féodal, sanctuaire, sauvage) ? Qui sert ta faction, et pourquoi toi ?",
  dnd5e: "De quel peuple, de quelle ville ou de quel clan viens-tu ? Qu'as-tu fait avant l'aventure (ton historique) ?",
  "lakour-survie": "Où as-tu grandi, à La Réunion ou ailleurs ? Que faisais-tu la veille du jour zéro ?"
};
export function questionsAide(systeme) {
  return {
    qui: [ORIGINE[systeme] ?? ORIGINE.dnd5e, "À quoi ressembles-tu ? Une manie, une façon de parler, un objet qui ne te quitte pas ?"],
    histoire: [systeme === "lakour-survie" ? "Qui as-tu perdu, ou cherches-tu encore, depuis le jour zéro ?" : "Qu'est-ce qui t'a fait quitter ta vie d'avant ?",
      "Qu'est-ce qui t'a amené jusqu'au groupe ?"],
    secret: ["Quel secret gardes-tu, même pour les autres ?", "De quoi as-tu vraiment peur ? Que cherches-tu ?"],
    chapitres: ["Le MJ (ou le MJ IA) y ajoute un paragraphe après chaque événement marquant."]
  };
}

// Le contenu HTML d'une page d'aide : les questions, marquées pour être remplacées à la première écriture.
const echapper = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const aideHTML = questions => `<div class="${CLASSE_AIDE}"><p><em>À écrire (questions pour t'aider) :</em></p>`
  + `<ul>${questions.map(q => `<li>${echapper(q)}</li>`).join("")}</ul></div>`;
export const estAide = html => !String(html ?? "").trim() || String(html).includes(CLASSE_AIDE);

// Les données Foundry du journal (JournalEntry.create) : le journal visible de tous (OBSERVER) et propriété des joueurs de l'acteur ;
// la page secrète réservée à ceux-ci (et au MJ, qui voit tout). niveaux : CONST.DOCUMENT_OWNERSHIP_LEVELS.
export function donneesJournalHistoire({ nom, proprietaires = [], dossier = null, acteurUuid = "", systeme = "dnd5e", niveaux = {} } = {}) {
  const { NONE = 0, OBSERVER = 2, OWNER = 3, INHERIT = -1 } = niveaux;
  const proprio = Object.fromEntries(proprietaires.map(id => [id, OWNER]));
  const aides = questionsAide(systeme);
  return {
    name: nomJournalHistoire(nom), folder: dossier,
    ownership: { default: OBSERVER, ...proprio },
    flags: { [ID_MJIA]: { histoire: { acteur: acteurUuid } } },
    pages: PAGES_HISTOIRE.map((p, i) => ({
      name: p.nom, type: "text", sort: (i + 1) * 100,
      text: { content: aideHTML(aides[p.cle]), format: 1 },
      ownership: p.prive ? { default: NONE, ...proprio } : { default: INHERIT },
      flags: { [ID_MJIA]: { page: p.cle } }
    }))
  };
}

// La page d'un journal par sa clé (drapeau, sinon nom).
export function pageDe(journal, cle) {
  const pages = [...(journal?.pages?.contents ?? journal?.pages ?? [])];
  const def = PAGES_HISTOIRE.find(p => p.cle === cle);
  return pages.find(p => p?.flags?.[ID_MJIA]?.page === cle) ?? pages.find(p => p?.name === def?.nom) ?? null;
}
const contenuDe = page => page?.text?.content ?? "";
const texteBrut = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, "\"")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Les premières phrases d'un texte, au plus max caractères.
export function premieresPhrases(texte, max = 220) {
  const t = texteBrut(texte);
  if (t.length <= max) return t;
  const coupe = t.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf(". "), coupe.lastIndexOf("! "), coupe.lastIndexOf("? "));
  return fin > max / 3 ? coupe.slice(0, fin + 1) : `${coupe.slice(0, max - 1)}…`;
}

// Une ligne d'histoire pour l'IA, tirée des pages PUBLIQUES (« Son histoire », sinon « Qui il est ») ; avec secret : true (le
// narrateur, ou le personnage lui-même), la page secrète en plus ; publique : false, la page secrète seule. "" sans journal ou
// sans texte écrit.
export function ligneHistoire(journal, { secret = false, publique: avecPublique = true, max = 220 } = {}) {
  if (!journal) return "";
  const lire = cle => { const h = contenuDe(pageDe(journal, cle)); return estAide(h) ? "" : premieresPhrases(h, max); };
  const publique = avecPublique ? lire("histoire") || lire("qui") : "";
  const cache = secret ? lire("secret") : "";
  return [publique ? `histoire : ${publique}` : "", cache ? `garde pour lui (secret de son joueur) : ${cache}` : ""].filter(Boolean).join(" — ");
}

// Le journal d'histoire d'un acteur (son drapeau ; uuid « JournalEntry.<id> »), lu dans game.journal ; null sinon.
export function journalHistoireDe(acteur, jeu = globalThis.game) {
  const uuid = acteur?.flags?.[ID_MJIA]?.histoire;
  if (!uuid || typeof uuid !== "string") return null;
  const id = uuid.split(".").pop();
  try { return jeu?.journal?.get?.(id) ?? null; } catch { return null; }
}
// La ligne d'histoire d'un acteur (résumé de l'adaptateur) : "" hors des trois mondes ou sans journal.
export function ligneHistoireActeur(acteur, options = {}, jeu = globalThis.game) {
  if (!SYSTEMES_HISTOIRE.includes(jeu?.system?.id)) return "";
  return ligneHistoire(journalHistoireDe(acteur, jeu), options);
}

// Le contenu d'une page après une écriture : « ecrire » remplace ; « completer » ajoute un paragraphe (une page d'aide est
// remplacée) ; vide = inchangé. html : le texte déjà converti en HTML.
export function nouveauContenu(ancien, html, mode = "ecrire") {
  if (!String(html ?? "").trim()) return null;
  if (mode === "ecrire" || estAide(ancien)) return html;
  return `${ancien}${html}`;
}

// Un chapitre daté : « <h3>Jour 12 — 16 décembre 2026</h3><p>…</p> ».
export const chapitreHTML = (quand, html) => `<h3>${echapper(quand)}</h3>${html}`;

// Le résumé d'histoire d'un compagnon IA (champ « histoire » de sa personnalité) : donné, sinon les premières phrases de son
// histoire et ce qu'il garde pour lui (c'est le sien : il peut le savoir). 500 caractères au plus.
export function resumeCompagnon({ resume = "", histoire = "", qui = "", secret = "" } = {}) {
  if (String(resume).trim()) return premieresPhrases(resume, 500);
  return premieresPhrases([histoire || qui, secret ? `Ce que tu gardes pour toi : ${texteBrut(secret)}` : ""].filter(Boolean).join(" "), 500);
}

// ------------------------------------------------------------------ consignes
// L'étape « histoire » d'une création guidée (moteur.js) : deux ou trois questions courtes, puis l'écriture à partir du contenu
// du monde.
const MATERIAU = {
  impmal: "son origine (monde natal), sa faction et son patron, son rôle, ses devoirs, atouts et handicaps (compendium « La Kour 40k — Création »)",
  dnd5e: "son peuple, son historique, sa classe et sa sous-classe, son affiliation ou sa faction (compendiums « La Kour Warcraft »)",
  "lakour-survie": "son enfance, son passé (le métier du jour zéro), ses traits, sa région, son âge, le proche perdu ou cherché (la graine d'histoire du générateur)"
};
export function etapeHistoire(systeme, nomJoueur = "le joueur") {
  return `Histoire : pose à ${nomJoueur} deux ou trois questions courtes (d'où il vient, qui il a laissé ou perdu, ce qu'il cherche ou cache), `
    + "ou invente s'il te le demande. Puis histoire_personnage : « preparer » te donne ce que le contenu du monde dit de "
    + `${MATERIAU[systeme] ?? MATERIAU.dnd5e} ; « ecrire » remplit les pages « Qui il est », « Son histoire » et « Ce qu'il garde pour lui » `
    + "(ce dernier, son joueur et toi seuls le lisent). Quelques paragraphes, dans le ton du monde, sans contredire sa fiche.";
}
// Le matériau de l'histoire, lu sur la fiche (objets d'origine, de faction, de rôle ; peuple, historique, classe ; enfance, passé,
// traits) : [« Origine : Monde-ruche — Des milliards d'âmes… »]. nomDe(collection, cle, genre) : nom d'une clé du contenu (Fénoir),
// accordé au genre du survivant pour l'enfance et le passé.
const TYPES_MATERIAU = {
  impmal: { origin: "Origine", faction: "Faction", role: "Rôle", duty: "Devoir", boonLiability: "Atout ou handicap" },
  dnd5e: { race: "Peuple", background: "Historique", class: "Classe", subclass: "Sous-classe" }
};
export function materiauHistoire(acteur, systeme, { nomDe = (_c, cle) => cle, max = 300 } = {}) {
  const lignes = [];
  const types = TYPES_MATERIAU[systeme];
  if (types) {
    for (const i of [...(acteur?.items ?? [])].filter(x => types[x.type])) {
      const s = i.system ?? {};
      const desc = premieresPhrases(s.notes?.player ?? s.description?.value ?? s.description ?? "", max);
      lignes.push(`${types[i.type]} : ${i.name}${desc ? ` — ${desc}` : ""}`);
    }
  }
  if (systeme === "lakour-survie") {
    const s = acteur?.system ?? {};
    if (s.enfance) lignes.push(`Enfance : ${nomDe("enfances", s.enfance, s.genre ?? "")}`);
    if (s.passe) lignes.push(`Passé : ${nomDe("passes", s.passe, s.genre ?? "")}`);
    if ((s.traits ?? []).length) lignes.push(`Traits : ${s.traits.map(t => nomDe("traits", t)).join(", ")}`);
    if ((s.incapacites ?? []).length) lignes.push(`Incapacités : ${s.incapacites.join(", ")}`);
    if (s.age) lignes.push(`Âge : ${s.age} ans`);
    if (s.lien) lignes.push(`Lien avec le groupe : ${texteBrut(s.lien)}`);
    const graine = s.graineHistoire ?? s.histoire?.graine ?? acteur?.flags?.[ID_MJIA]?.graineHistoire;
    if (graine) lignes.push(`Graine d'histoire : ${premieresPhrases(Array.isArray(graine) ? graine.join(" ") : graine, 600)}`);
  }
  const notes = acteur?.system?.details?.biography?.value ?? acteur?.system?.notes?.player ?? (typeof acteur?.system?.notes === "string" ? acteur.system.notes : "");
  if (texteBrut(notes)) lignes.push(`Notes de la fiche : ${premieresPhrases(notes, max)}`);
  return lignes;
}
