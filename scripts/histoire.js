// Histoire de chaque personnage (40k, Warcraft, Fénoir ; docs/survie-contrat.md §10.5 du dépôt lakour-fenoir) : branchement à
// Foundry. Le journal « Histoire de <nom> » (quatre pages, histoire-logique.js) se crée chez un MJ (un joueur n'a pas le droit de
// créer un journal : il le demande au MJ actif par le canal du module) ; l'acteur garde son uuid (flags.lakour-mj-ia.histoire).
// Bouton « Histoire » dans l'en-tête des fiches d'acteur des trois mondes : ouvre le journal, ou le crée (pages vides avec des
// questions d'aide : le joueur peut l'écrire lui-même, sans IA). L'outil histoire_personnage (outils-histoire.js) l'écrit.
import { ID } from "./constantes.js";
import * as H from "./histoire-logique.js";
import { versMJ, envoyer, recevoir } from "./canal.js";
import { langueDuMonde } from "./contenus.js";
import { texteJoueurs } from "./utilitaires.js";

export const journalDe = acteur => H.journalHistoireDe(acteur);
const niveaux = () => ({ NONE: 0, OBSERVER: 2, OWNER: 3, INHERIT: -1, ...(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? {}) });
const proprietaires = acteur => game.users.filter(u => !u.isGM && acteur.testUserPermission?.(u, "OWNER")).map(u => u.id);
const traduire = cle => { try { return game.i18n.localize(cle); } catch { return cle; } };

// Le dossier des histoires : celui qui existe déjà (titre français ou anglais), sinon créé dans la langue du monde.
async function dossierDesHistoires(langue = langueDuMonde()) {
  const noms = Object.values(H.DOSSIERS_HISTOIRES);
  const existant = game.folders?.find?.(f => f.type === "JournalEntry" && noms.includes(f.name));
  if (existant) return existant;
  return globalThis.Folder?.implementation?.create?.({ name: H.dossierHistoires(langue), type: "JournalEntry" }) ?? null;
}

// Le journal d'un acteur, créé s'il n'existe pas (MJ seulement). -> { journal, cree }
export async function assurerJournal(acteur) {
  const deja = journalDe(acteur);
  if (deja) return { journal: deja, cree: false };
  if (!game.user?.isGM) throw new Error(texteJoueurs("LAKOUR_MJIA.Histoire.SeulMJ", "Seul un MJ crée le journal d'histoire."));
  const langue = langueDuMonde();
  const dossier = await dossierDesHistoires(langue);
  const journal = await JournalEntry.implementation.create(H.donneesJournalHistoire({
    nom: acteur.name, proprietaires: proprietaires(acteur), dossier: dossier?.id ?? null, acteurUuid: acteur.uuid ?? "",
    systeme: game.system?.id, niveaux: niveaux(), langue
  }));
  // Fénoir : le système range aussi l'uuid dans system.histoire.journal (§10.1) ; un champ inconnu du modèle est ignoré.
  await acteur.update({ [`flags.${ID}.histoire`]: journal.uuid, ...(acteur.type === "survivant" ? { "system.histoire.journal": journal.uuid } : {}) });
  return { journal, cree: true };
}

// Écrit dans le journal : textes en HTML déjà convertis. mode « ecrire » (remplace) ou « completer » (ajoute) pour les trois
// premières pages ; un chapitre s'ajoute toujours, daté. -> { journal, pages: nombre de pages changées, cree }
export async function ecrireHistoire(acteur, { qui = "", histoire = "", secret = "", chapitre = "", quand = "", mode = "ecrire" } = {}) {
  const { journal, cree } = await assurerJournal(acteur);
  const maj = [];
  const manquantes = [];
  for (const [cle, html] of [["qui", qui], ["histoire", histoire], ["secret", secret]]) {
    if (!String(html).trim()) continue;
    const page = H.pageDe(journal, cle);
    if (!page) { manquantes.push(cle); continue; }
    const contenu = H.nouveauContenu(page.text?.content ?? "", html, mode);
    if (contenu !== null) maj.push({ _id: page.id, "text.content": contenu });
  }
  if (String(chapitre).trim()) {
    const page = H.pageDe(journal, "chapitres");
    if (!page) manquantes.push("chapitres");
    else maj.push({ _id: page.id, "text.content": H.nouveauContenu(page.text?.content ?? "", H.chapitreHTML(quand, chapitre), "completer") });
  }
  if (maj.length) await journal.updateEmbeddedDocuments("JournalEntryPage", maj);
  return { journal, pages: maj.length, cree, manquantes };
}

// Le bouton : ouvre le journal, ou le crée (MJ) / le demande au MJ actif (joueur propriétaire).
export async function ouvrirHistoire(acteur) {
  const j = journalDe(acteur);
  if (j) return j.sheet?.render(true);
  if (game.user.isGM) return (await assurerJournal(acteur)).journal.sheet?.render(true);
  if (!versMJ({ type: "histoire.creer", acteurId: acteur.id })) return ui.notifications?.warn(traduire("LAKOUR_MJIA.Histoire.SansMJ"));
  return ui.notifications?.info(traduire("LAKOUR_MJIA.Histoire.Demandee"));
}

// Les types d'acteur qui ont une histoire : à Fénoir, un survivant (pas un abri) ; ailleurs, tous (un PNJ important aussi).
const TYPES_HISTOIRE = { "lakour-survie": ["survivant"] };
export const boutonVisible = (acteur, jeu = globalThis.game) => Boolean(acteur) && H.SYSTEMES_HISTOIRE.includes(jeu?.system?.id)
  && (TYPES_HISTOIRE[jeu?.system?.id]?.includes(acteur.type) ?? true) && Boolean(jeu?.user?.isGM || acteur.isOwner);

const ouvrir = acteur => ouvrirHistoire(acteur).catch(e => { console.error(`${ID} | histoire`, e); ui.notifications?.error(e.message); });

// Crochets : canal (demande d'un joueur, journal à ouvrir) et boutons des fiches (ApplicationV2 et anciennes fiches).
export function brancherHistoire() {
  recevoir("histoire.creer", async (m, qui) => {
    const acteur = game.actors.get(m.acteurId);
    const u = game.users.get(qui);
    if (!acteur || !u || !acteur.testUserPermission(u, "OWNER")) return;
    const { journal } = await assurerJournal(acteur);
    envoyer({ type: "histoire.ouvrir", uuid: journal.uuid }, [qui]);
  }, { pourMJ: true });
  recevoir("histoire.ouvrir", async m => (await fromUuid(m.uuid))?.sheet?.render(true));
  // Une fiche qui a déjà son bouton « Histoire » (la fiche de survivant de Fénoir : action « histoire », par api.histoire.ouvrir) n'en
  // reçoit pas un second.
  Hooks.on("getHeaderControlsActorSheetV2", (app, controles) => {
    const acteur = app.document ?? app.actor;
    if (!boutonVisible(acteur) || controles.some(c => c.action === "lakourHistoire") || app.options?.actions?.histoire) return;
    controles.push({ icon: "fa-solid fa-book-open", label: traduire("LAKOUR_MJIA.Histoire.Bouton"), action: "lakourHistoire", onClick: () => ouvrir(acteur) });
  });
  Hooks.on("getActorSheetHeaderButtons", (app, boutons) => {
    const acteur = app.actor ?? app.document;
    if (!boutonVisible(acteur)) return;
    boutons.unshift({ class: "lakour-histoire", icon: "fa-solid fa-book-open", label: traduire("LAKOUR_MJIA.Histoire.Bouton"), onclick: () => ouvrir(acteur) });
  });
}
