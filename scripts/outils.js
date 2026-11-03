import { ID } from "./constantes.js";
import { MODULE_3D } from "./vue3d.js";
import { adaptateur, DIFFICULTES } from "./adaptateurs.js";
import { SECTIONS, noterMemoire } from "./memoire.js";
import { fournisseurImages } from "./fournisseurs/index.js";
import { versTexte, versHTML, tronquer, trouverActeur, deposerFichier, roleLoups } from "./utilitaires.js";
import { CARACS, calculerCaracteristiques, objetsDeDepart, munitionPour } from "./creation-impmal.js";
import { ajouterAvecAvancements, donnerEquipement, monterNiveau } from "./creation-dnd5e.js";
import { jetonJoueur, moduleDeContenu } from "./contenus.js";
import { lire, ecrire } from "./reglages.js";
import { volumeAmbiance } from "./voix-texte.js";
import { ouvrirVote, cloreVote, demanderChoix, nomPourIA, DELAI_VOTE, DELAI_CHOIX, MAX_OPTIONS } from "./decisions.js";
import { validerSchema } from "./schema.js";
import { choisirParNom } from "./recherche-nom.js";
import { retenirComposition, consignerComposition, historiqueDesParties } from "./historique-loups.js";
import { tirerSansDoublon, donneesDuResultat, TIRAGES_MAX } from "./tirages.js";
import { TEMPERAMENTS, FACONS_DE_PARLER, personnaliteAuHasard } from "./compagnons.js";
import {
  estCompagnon, personnaliteDe, compagnonsDuMonde, compagnonsPresents, trouverCompagnon, noterPrive, oublierPrive, nomsPourCompagnons
} from "./compagnons-jeu.js";
import { planVersScene, zoneVersRegion, idStable, cheminSon, etagesDuPlan, SOLS, SONS_AMBIANCE, TYPES_ZONE, MAX_ETAGES } from "./cartes.js";
import { planVersSVG } from "./cartes-rendu.js";
import * as Horloges from "./horloges.js";
import * as Carnet from "./carnet.js";
import * as Enq from "./enquetes-logique.js";
import * as Cont from "./contacts-logique.js";
import { ligneResume, PALIERS_REPUTATION, SEGMENTS_MIN, SEGMENTS_MAX } from "./horloges-logique.js";
import { listeSalles, trouverSalle, salleDeLaCase, centreSalle, casesLibres, casesOccupees, casesInterdites, casesDispersees, casesAutour, reperesDuPlan, trouverRepere, planDe, carteDeScene, TYPES_FIGURANTS, jetonFigurant, moduleDesFigurants } from "./placement.js";

// Outils que l'IA peut appeler. Schémas « stricts » : tous les champs sont obligatoires
// (une valeur vide signifie « sans objet ») et aucun champ inconnu n'est accepté.
// sensible : l'outil modifie le monde ou coûte de l'argent ; en mode « validation »,
// le MJ humain doit l'accepter avant qu'il s'exécute.
const objet = proprietes => ({ type: "object", properties: proprietes, required: Object.keys(proprietes), additionalProperties: false });
const chaine = description => ({ type: "string", description });
const booleen = description => ({ type: "boolean", description });
const entier = description => ({ type: "integer", description });

// v14 : une scène a des niveaux et chaque jeton appartient à l'un d'eux (champ obligatoire).
const niveauAffiche = scene => (canvas.scene === scene ? canvas.level?.id : null) ?? scene.initialLevel?.id;

// Grille d'une scène (taille des cases, origine, nombre de cases) et ses pièces.
function grilleDe(scene) {
  const { size } = scene.grid;
  const { sceneX, sceneY, sceneWidth, sceneHeight } = scene.dimensions;
  return { size, sceneX, sceneY, largeur: Math.floor(sceneWidth / size), hauteur: Math.floor(sceneHeight / size) };
}
const sallesDe = scene => listeSalles(scene.drawings.contents.map(d => d.toObject()), grilleDe(scene));
const caseDuJeton = (t, g) => ({ x: Math.round((t.x - g.sceneX) / g.size), y: Math.round((t.y - g.sceneY) / g.size) });
const versPixels = (c, g) => ({ x: g.sceneX + c.x * g.size, y: g.sceneY + c.y * g.size });

// Près d'un repère : un jeton (PNJ, personnage), un élément du plan (puits, étal…) ou une porte (« seuil de l'échoppe »).
// La zone est la pièce demandée, sinon celle du repère (pour une porte : le côté des personnages joueurs).
// Ordre : le nom exact d'un jeton, puis un repère de la carte, puis un jeton cité dans la phrase (« à côté de Mère Gruss »)
// — jamais celui qu'on place (« Mère Gruss au seuil de l'échoppe de Mère Gruss » vise la porte, pas elle-même).
function zoneDuRepere(scene, g, salles, texte, salle = "", sauf = "") {
  // L'IA recopie souvent le repère tel que l'état du jeu le montre : « Étal (case 7,4, Place du marché) ». La case désigne
  // alors le repère sans ambiguïté (il y a six étals) ; le texte entre parenthèses ne doit pas servir à reconnaître le nom.
  const caseDonnee = /case\s*(\d+)\s*[,;]\s*(\d+)/i.exec(texte);
  texte = texte.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const n = texte.toLowerCase(), moi = sauf.trim().toLowerCase();
  const autres = scene.tokens.filter(t => t.name.toLowerCase() !== moi);
  const pj = scene.tokens.find(t => t.actor?.hasPlayerOwner);
  const salleJoueurs = pj ? salleDeLaCase(salles, ...Object.values(caseDuJeton(pj, g)))?.nom : null;
  const reperes = reperesDuPlan(planDe(scene), salles);
  const exact = autres.find(t => t.name.toLowerCase() === n);
  const ici = caseDonnee ? { x: Number(caseDonnee[1]), y: Number(caseDonnee[2]) } : null;
  const r = exact ? null
    : ici ? reperes.find(p => p.cases.some(c => c.x === ici.x && c.y === ici.y)) ?? { nom: `case ${ici.x},${ici.y}`, type: "case", cases: [ici], salles: [] }
    : trouverRepere(reperes, texte, salleJoueurs);
  const cite = exact || r ? null : autres.find(t => !t.getFlag(ID, "figurant") && n.includes(t.name.toLowerCase()));
  const jeton = exact ?? cite;
  let cibles, nom;
  if (jeton) {
    cibles = [caseDuJeton(jeton, g)]; nom = jeton.name;
  } else {
    if (!r) return { erreur: `repère « ${texte} » introuvable (repères : ${[...new Set(reperes.map(p => p.nom))].join(", ") || "aucun"} ; ou le nom d'un jeton)` };
    cibles = r.cases; nom = r.nom;
    if (r.type === "porte" && !salle.trim()) {
      // Côté de la porte : celui des joueurs s'il en fait partie.
      const cote = r.salles.includes(salleJoueurs) ? salleJoueurs : r.salles[0];
      cibles = r.cases.filter(c => salleDeLaCase(salles, c.x, c.y)?.nom === cote);
    }
  }
  const zone = salle.trim() ? trouverSalle(salles, salle) : salleDeLaCase(salles, cibles[0].x, cibles[0].y);
  return { g, centre: cibles[0], zone, cibles, repere: nom };
}

// Cases où l'on ne pose personne : déjà prises par un jeton (sauf celui qu'on déplace), obstacles du plan
// (étals, caisses…) et abords des portes. Le plan n'existe que pour les cartes faites par creer_scene.
function occupeesDe(scene, g, sauf = null) {
  const occupees = casesOccupees(scene.tokens.contents.filter(t => t !== sauf), g);
  for (const c of casesInterdites(planDe(scene))) occupees.add(c);
  return occupees;
}
const PRES_DE = chaine("Repère près duquel se placer : un élément de la carte (« puits central », « étal »), une porte ou un seuil "
  + "(« seuil de l'échoppe de Mère Gruss »), ou le nom d'un jeton (PNJ, personnage) ; vide sinon. Voir « Repères » dans l'état du jeu.");
// Cases choisies pour une pose : autour du repère s'il y en a un, sinon au plus près du centre de la zone.
const choisirCases = (n, ou, occupees) => (ou.cibles
  ? casesAutour(n, ou.cibles, { zone: ou.zone, limites: ou.g, occupees })
  : casesLibres(n, { centre: ou.centre, zone: ou.zone, limites: ou.g, occupees }));
const decrireOu = ou => `${ou.repere ? ` près de « ${ou.repere} »` : ""}${ou.zone ? ` dans « ${ou.zone.nom} »` : ""}`;
const casesDesJoueurs = (scene, g) => scene.tokens.filter(t => t.actor?.hasPlayerOwner).map(t => caseDuJeton(t, g));

// Où poser quelqu'un : dans une pièce nommée, sinon autour d'une case donnée, sinon à côté des personnages
// joueurs. La zone (la pièce) empêche de poser un jeton de l'autre côté d'un mur.
function zoneDePose(scene, { salle = "", x = null, y = null, pres_de = "", sauf = "" } = {}) {
  const g = grilleDe(scene), salles = sallesDe(scene);
  if (pres_de.trim()) return zoneDuRepere(scene, g, salles, pres_de, salle, sauf);
  if (salle.trim()) {
    const s = trouverSalle(salles, salle);
    if (!s) return { erreur: `pièce « ${salle} » introuvable (pièces : ${salles.map(p => p.nom).join(", ") || "aucune"})` };
    return { g, centre: centreSalle(s), zone: s };
  }
  if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0) return { g, centre: { x, y }, zone: salleDeLaCase(salles, x, y) };
  const pj = scene.tokens.find(t => t.actor?.hasPlayerOwner);
  const centre = pj ? caseDuJeton(pj, g) : { x: Math.floor(g.largeur / 2), y: Math.floor(g.hauteur / 2) };
  return { g, centre, zone: salleDeLaCase(salles, centre.x, centre.y) };
}

// Garde des outils qui écrivent un journal du monde (mémoire, journal créé) : refusés aux Veillées, même appelés malgré leur
// absence de la liste (un journal du MJ est livré à tous les navigateurs). -> null, ou le refus à rendre.
function horsVeillees() {
  if (globalThis.game?.system?.id !== "lakour-loups") return null;
  return { erreur: true, contenu: "Pas aux Veillées : un journal du monde (même réservé au MJ) est livré à tous les navigateurs. Garde ce que tu "
    + "dois retenir pour toi (ton fil est chiffré) ; pour un joueur, envoie un message secret (message_prive)." };
}

export const OUTILS = [
  {
    nom: "demander_jet",
    systemes: ["impmal", "dnd5e"],
    description: "Demande à un joueur de lancer un test pour son personnage, avec la fenêtre de test du système PRÉ-REMPLIE selon la situation "
      + "(difficulté, modificateur, DR bonus, avantages, désavantages) : le joueur n'a qu'à valider. Le résultat t'arrivera dans un prochain message. "
      + "Arrête ta narration juste après.",
    schema: objet({
      personnage: chaine("Nom exact du personnage joueur."),
      competence: chaine("Clé de compétence parmi la liste donnée dans tes consignes (ou une formule de dés si le système n'a pas d'adaptateur)."),
      difficulte: { type: "string", enum: DIFFICULTES, description: "Difficulté du test (« aucune » = celle par défaut du système)." },
      modificateur: entier("Modificateur au seuil (Imperium Maledictum : par paliers de 10 ; D&D : bonus de situation). 0 si aucun."),
      dr_bonus: entier("Degrés de réussite ajoutés ou retirés (Imperium Maledictum). 0 si aucun."),
      avantages: entier("Nombre d'avantages (situation favorable). 0 si aucun."),
      desavantages: entier("Nombre de désavantages (situation défavorable). 0 si aucun."),
      superiorite: booleen("Imperium Maledictum : pré-coche « Utiliser la Supériorité » (en combat, pour un personnage joueur ; ignoré sinon). false en D&D."),
      raison: chaine("Ce que tente le personnage, en une phrase (affichée et ajoutée au titre de la fenêtre).")
    }),
    sensible: false,
    async executer({ personnage, competence, difficulte, modificateur, dr_bonus, avantages, desavantages, superiorite, raison }) {
      const acteur = await trouverActeur(personnage);
      if (!acteur) return { erreur: true, contenu: `Personnage introuvable : ${personnage}.` };
      const sys = adaptateur();
      // Un compagnon IA n'a personne pour valider une fenêtre : son jet est lancé directement (comme jet_compagnon).
      if (estCompagnon(acteur)) {
        try {
          const r = await sys.lancerDirect(acteur, competence, { difficulte, modificateur, dr: dr_bonus, avantage: avantages, desavantage: desavantages, titre: raison });
          return { contenu: `${acteur.name} est un compagnon IA : jet lancé directement. ${r.texte}` };
        } catch (e) { return { erreur: true, contenu: `Jet du compagnon impossible : ${e.message}` }; }
      }
      const libelle = sys.competences(acteur).find(c => c.cle === competence)?.libelle ?? competence;
      const joueurs = game.users.filter(u => !u.isGM && acteur.testUserPermission(u, "OWNER"));
      const esc = foundry.utils.escapeHTML;
      const reglages = { difficulte, modificateur, dr: dr_bonus, avantage: avantages, desavantage: desavantages, superiorite: Boolean(superiorite), titre: raison };
      const details = [
        difficulte !== "aucune" ? `Difficulté : ${esc(difficulte)}` : "",
        modificateur ? `modificateur ${modificateur > 0 ? "+" : ""}${modificateur}` : "",
        dr_bonus ? `${dr_bonus > 0 ? "+" : ""}${dr_bonus} DR` : "",
        avantages ? `${avantages} avantage(s)` : "", desavantages ? `${desavantages} désavantage(s)` : "",
        superiorite && sys.id === "impmal" ? "Supériorité" : ""
      ].filter(Boolean).join(", ");
      const bouton = sys.id === "generique" ? `<p>Formule : <strong>${esc(competence)}</strong></p>`
        : `<button type="button" data-lakour-jet data-acteur="${acteur.uuid}" data-competence="${esc(competence)}" data-reglages="${esc(JSON.stringify(reglages))}">`
          + `<i class="fa-solid fa-dice-d20"></i> ${esc(libelle)}</button>`;
      await ChatMessage.implementation.create({
        content: `<div class="lakour-mjia-jet"><p><strong>${esc(acteur.name)}</strong> : ${versHTML(raison)}</p>`
          + (details ? `<p>${details}</p>` : "") + bouton + "</div>",
        speaker: { alias: game.settings.get(ID, "personnalites").find(p => p.id === game.settings.get(ID, "personnaliteActive"))?.nomAffiche ?? "MJ" },
        flags: { [ID]: { ia: true } }
      });
      const qui = joueurs.map(u => u.name).join(", ") || "aucun joueur connecté ne possède ce personnage";
      return { contenu: `Jet de ${libelle} demandé à ${acteur.name} (${qui}). Attends le résultat.` };
    }
  },
  {
    nom: "lancer_des",
    systemes: ["impmal", "dnd5e"],
    description: "Lance des dés pour un PNJ ou un événement (jamais pour un personnage joueur). Renvoie le total.",
    schema: objet({
      formule: chaine("Formule Foundry, ex. « 1d100 », « 2d6+3 »."),
      raison: chaine("Pourquoi ce jet (visible dans le chat)."),
      secret: booleen("true pour un jet caché aux joueurs.")
    }),
    sensible: false,
    async executer({ formule, raison, secret }) {
      const jet = await new Roll(formule).evaluate();
      await jet.toMessage(
        { flavor: raison, speaker: { alias: "MJ IA" }, flags: { [ID]: { ia: true } } },
        { rollMode: secret ? CONST.DICE_ROLL_MODES.PRIVATE : CONST.DICE_ROLL_MODES.PUBLIC }
      );
      return { contenu: `${formule} = ${jet.total} (${jet.result})` };
    }
  },
  {
    nom: "chercher_compendium",
    description: "Cherche par nom dans les compendiums (livres officiels, bestiaires, objets, règles, tables). Renvoie au plus 25 résultats avec leur uuid.",
    schema: objet({
      requete: chaine("Mots à chercher dans les noms (ex. « hérétique », « gobelin », « critique »)."),
      type: { type: "string", enum: ["tous", "Actor", "Item", "JournalEntry", "RollTable", "Scene", "Adventure"], description: "Type de document." }
    }),
    sensible: false,
    async executer({ requete, type }) {
      const mots = requete.toLowerCase().split(/\s+/).filter(Boolean);
      const trouves = [];
      for (const pack of game.packs) {
        if (type !== "tous" && pack.documentName !== type) continue;
        const index = await pack.getIndex();
        for (const e of index) {
          const nom = e.name?.toLowerCase() ?? "";
          // Un mot peut aussi désigner le type d'objet (« role », « origin », « talent »…).
          if (mots.every(m => nom.includes(m) || e.type?.toLowerCase() === m)) trouves.push(`${e.name} — ${pack.documentName}${e.type ? `/${e.type}` : ""} — ${pack.title} — ${e.uuid}`);
          if (trouves.length >= 25) break;
        }
        if (trouves.length >= 25) break;
      }
      return { contenu: trouves.length ? trouves.join("\n") : `Rien trouvé pour « ${requete} ».` };
    }
  },
  {
    nom: "lire_document",
    description: "Lit un document (journal de règles, PNJ, objet, table) par son uuid et en renvoie le texte.",
    schema: objet({ uuid: chaine("uuid obtenu par chercher_compendium, ou d'un document du monde.") }),
    sensible: false,
    async executer({ uuid }) {
      const doc = await fromUuid(uuid);
      if (!doc) return { erreur: true, contenu: `Document introuvable : ${uuid}.` };
      let texte;
      if (doc.documentName === "JournalEntry") texte = doc.pages.contents.map(p => `## ${p.name}\n${versTexte(p.text?.content)}`).join("\n\n");
      else if (doc.documentName === "JournalEntryPage") texte = versTexte(doc.text?.content);
      else if (doc.documentName === "Actor") texte = `${adaptateur().resumer(doc)}\nObjets et capacités : ${doc.items.map(i => i.name).join(", ")}`;
      else if (doc.documentName === "RollTable") texte = `${doc.name} (${doc.formula})\n${doc.results.map(r => `${r.range.join("-")} : ${versTexte(r.description ?? r.text ?? r.name)}`).join("\n")}`;
      else texte = `${doc.name} (${doc.type ?? doc.documentName})\n${versTexte(doc.system?.description?.value ?? doc.system?.notes?.player ?? "")}`;
      // Objets : les données mécaniques aussi (choix d'une origine, table de factions, talents d'un rôle…),
      // sans les notes déjà rendues en texte.
      if (doc.documentName === "Item" && doc.system) {
        const { notes, description, ...donnees } = doc.system.toObject?.() ?? doc.system;
        texte += `\nDonnées : ${tronquer(JSON.stringify(donnees), 6000)}`;
      }
      return { contenu: tronquer(texte, 20000) };
    }
  },
  // Aux Veillées (« horsSystemes ») : ni mémoire de campagne ni journal créé par l'IA. Un journal réservé au MJ reste un document
  // du monde, que Foundry livre à TOUS les navigateurs : une note de partie (qui est loup, qui a été vu la nuit) s'y lirait dans
  // la console. Chaque partie repart de zéro ; ce que le narrateur doit retenir vit dans son fil (chiffré, coffre du moteur).
  {
    nom: "noter_memoire",
    horsSystemes: ["lakour-loups"],
    description: "Ajoute une note à la mémoire de campagne (relue au début de chaque séance).",
    schema: objet({
      section: { type: "string", enum: SECTIONS, description: "Section de la mémoire." },
      texte: chaine("La note, concise et factuelle.")
    }),
    sensible: false,
    async executer({ section, texte }) {
      if (horsVeillees()) return horsVeillees();
      return { contenu: await noterMemoire(section, texte) };
    }
  },
  {
    nom: "creer_journal",
    horsSystemes: ["lakour-loups"],
    description: "Crée un journal (scénario, aide de jeu, lettre, description de lieu). Les pages visibles des joueurs leur sont montrées.",
    schema: objet({
      titre: chaine("Titre du journal."),
      pages: { type: "array", items: objet({ titre: chaine("Titre de la page."), texte: chaine("Contenu (gras, italique, listes « - » et titres « # » permis).") }) },
      visible_joueurs: booleen("true si les joueurs peuvent le lire (aide de jeu), false pour les secrets du MJ.")
    }),
    sensible: true,
    async executer({ titre, pages, visible_joueurs }) {
      if (horsVeillees()) return horsVeillees();
      const journal = await JournalEntry.implementation.create({
        name: titre,
        ownership: { default: visible_joueurs ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [ID]: { cree: true } },
        pages: pages.map((p, i) => ({ name: p.titre, type: "text", sort: (i + 1) * 100, text: { content: versHTML(p.texte) } }))
      });
      return { contenu: `Journal « ${titre} » créé (${journal.uuid}).` };
    }
  },
  {
    nom: "montrer_aide",
    description: "Montre aux joueurs une aide de jeu, comme le MJ qui la pose sur la table : un journal visible des joueurs (lettre, "
      + "contrat, affiche, partition…) ou une page précise (les aides découpées se montrent page par page, au bon moment du récit, "
      + "d'après le journal du MJ). Jamais un journal réservé au MJ : il est refusé. Ou une image, par son chemin.",
    schema: objet({
      uuid: chaine("uuid du journal ou de la page (lien @UUID du journal du MJ, ou chercher_compendium). Vide pour une image."),
      image: chaine("Chemin d'une image à montrer (illustration, portrait). Vide pour un journal.")
    }),
    sensible: false,
    async executer({ uuid, image }) {
      const { Journal } = foundry.documents.collections;
      if (!uuid && image) {
        Journal.showImage(image, {});
        return { contenu: "Image montrée aux joueurs." };
      }
      const r = await aideAMontrer(uuid);
      if (r.erreur) return r;
      await Journal.show(r.doc, { force: true });
      return { contenu: `Montré aux joueurs : « ${r.doc.name} »${r.importe ? " (importé du compendium dans le monde)" : ""}.` };
    }
  },
  {
    nom: "modifier_scenario",
    description: "Fait évoluer un scénario EN COURS DE PARTIE (journal du monde : aventure, campagne, notes du MJ), selon ta liberté avec le scénario "
      + "(voir ta personnalité) : ajouter une page (nouvelle scène, PNJ, rebondissement, intrigue secondaire), réécrire une page (la version "
      + "précédente est gardée et restaurable), ou ajouter une note à la fin d'une page (ce qui a changé et pourquoi). Fais-le quand ça sert "
      + "les joueurs : leurs idées, leurs envies, une piste bloquée. Les joueurs ne voient que les journaux qui leur sont ouverts.",
    schema: objet({
      action: { type: "string", enum: ["ajouter_page", "reecrire_page", "annoter_page", "restaurer_page"], description: "Ce qu'on fait." },
      journal: chaine("Nom (ou uuid) du journal du monde à modifier ; s'il n'existe pas et que action = ajouter_page, il est créé (caché)."),
      page: chaine("Titre de la page visée (pour ajouter_page : titre de la nouvelle page)."),
      texte: chaine("Contenu (gras, italique, listes « - » et titres « # » permis) ; vide pour restaurer_page."),
      raison: chaine("Pourquoi ce changement sert les joueurs, en une phrase (gardé dans l'historique).")
    }),
    sensible: false,
    async executer({ action, journal: nomJournal, page: titre, texte, raison }) {
      const n = nomJournal.trim().toLowerCase();
      let journal = nomJournal.startsWith("JournalEntry.") ? await fromUuid(nomJournal).catch(() => null)
        : game.journal.find(j => j.name.toLowerCase() === n) ?? game.journal.find(j => j.name.toLowerCase().includes(n));
      const quand = new Date().toLocaleString("fr-FR");
      if (!journal) {
        if (action !== "ajouter_page") return { erreur: true, contenu: `Journal introuvable dans le monde : « ${nomJournal} ». Un journal de compendium s'importe d'abord (installateur du module de contenu).` };
        journal = await JournalEntry.implementation.create({ name: nomJournal, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { [ID]: { cree: true } } });
      }
      const t = titre.trim().toLowerCase();
      const cible = journal.pages.find(p => p.name.toLowerCase() === t) ?? journal.pages.find(p => p.name.toLowerCase().includes(t));
      if (action === "ajouter_page") {
        const sort = Math.max(0, ...journal.pages.map(p => p.sort)) + 100;
        await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: titre, type: "text", sort, text: { content: versHTML(texte) },
          flags: { [ID]: { ajoutee: { quand, raison } } } }]);
        return { contenu: `Page « ${titre} » ajoutée au journal « ${journal.name} ».` };
      }
      if (!cible) return { erreur: true, contenu: `Page « ${titre} » introuvable dans « ${journal.name} » (pages : ${journal.pages.map(p => p.name).join(", ")}).` };
      const historique = cible.getFlag(ID, "historique") ?? [];
      if (action === "restaurer_page") {
        const derniere = historique.at(-1);
        if (!derniere) return { erreur: true, contenu: `Aucune version précédente de « ${cible.name} ».` };
        await cible.update({ "text.content": derniere.contenu, [`flags.${ID}.historique`]: historique.slice(0, -1) });
        return { contenu: `Page « ${cible.name} » restaurée dans sa version du ${derniere.quand}.` };
      }
      // Version précédente gardée (au plus 10) : le MJ humain ou l'IA peuvent revenir en arrière.
      const sauvegarde = [...historique, { quand, raison, contenu: cible.text.content }].slice(-10);
      const contenu = action === "reecrire_page" ? versHTML(texte)
        : `${cible.text.content}<hr><p><em>Note du MJ IA (${quand}) — ${raison}</em></p>${versHTML(texte)}`;
      await cible.update({ "text.content": contenu, [`flags.${ID}.historique`]: sauvegarde });
      return { contenu: `Page « ${cible.name} » ${action === "reecrire_page" ? "réécrite" : "annotée"} (version précédente gardée).` };
    }
  },
  {
    nom: "creer_pnj",
    description: "Crée un PNJ. Utilise de préférence un profil officiel trouvé dans les compendiums (modele_uuid), renommé et décrit.",
    schema: objet({
      nom: chaine("Nom du PNJ."),
      modele_uuid: chaine("uuid d'un acteur de compendium à copier, ou vide pour un PNJ sans profil chiffré."),
      description: chaine("Apparence, attitude, motivations, secrets (notes du MJ)."),
      placer_sur_scene: booleen("true pour poser son jeton sur la carte affichée : fais-le dès que le PNJ est devant les joueurs."),
      salle: chaine("Pièce de la carte où le poser, ou vide pour le poser à côté des personnages joueurs."),
      pres_de: PRES_DE,
      cache: booleen("true pour un jeton caché aux joueurs (embuscade, présence pas encore remarquée).")
    }),
    sensible: true,
    async executer({ nom, modele_uuid, description, placer_sur_scene, salle, pres_de = "", cache }) {
      const sys = adaptateur();
      let donnees;
      if (modele_uuid) {
        const modele = await fromUuid(modele_uuid);
        if (modele?.documentName !== "Actor") return { erreur: true, contenu: `Aucun acteur à l'uuid ${modele_uuid}.` };
        donnees = game.actors.fromCompendium(modele);
        donnees.name = nom;
        if (donnees.prototypeToken) donnees.prototypeToken.name = nom;
      } else {
        if (!sys.typePnj) return { erreur: true, contenu: "Sur ce système, indique un modele_uuid (aucun type de PNJ connu)." };
        donnees = { name: nom, type: sys.typePnj };
      }
      if (sys.cheminNotesMJ && description) foundry.utils.setProperty(donnees, sys.cheminNotesMJ, versHTML(description));
      foundry.utils.setProperty(donnees, `flags.${ID}`, { cree: true, description });
      const acteur = await Actor.implementation.create(donnees);
      let pose = "";
      if (placer_sur_scene && canvas.scene) {
        const scene = canvas.scene;
        let ou = zoneDePose(scene, { salle, pres_de, sauf: nom });
        let remarque = "";
        if (ou.erreur) { remarque = ` (${ou.erreur} : posé à côté des personnages joueurs)`; ou = zoneDePose(scene); }
        const [libre] = choisirCases(1, ou, occupeesDe(scene, ou.g));
        const c = libre ?? ou.centre;
        const jeton = await acteur.getTokenDocument({ ...versPixels(c, ou.g), hidden: cache, level: niveauAffiche(scene) });
        await scene.createEmbeddedDocuments("Token", [jeton.toObject()]);
        pose = ` Jeton posé${cache ? " (caché)" : ""}${decrireOu(ou)}, case ${c.x},${c.y}.${remarque}`;
      }
      return { contenu: `PNJ « ${nom} » créé (${acteur.uuid}).${pose}` };
    }
  },
  {
    nom: "placer_jetons",
    description: "Pose ou déplace des jetons sur la carte affichée, y compris ceux des personnages joueurs. Le plateau doit suivre le récit : "
      + "quand ta narration déplace un personnage (il entre, sort, suit quelqu'un, recule, est repoussé), déplace son jeton dans la même réponse. "
      + "Donne de préférence le nom d'une pièce (le jeton va sur une case libre de la pièce), sinon une case. "
      + "Sert aussi à faire apparaître (cache false) ou disparaître (cache true) un PNJ. Tes déplacements ne sont jamais bloqués par bloquer_mouvements.",
    schema: objet({
      jetons: {
        type: "array",
        items: objet({
          personnage: chaine("Nom de l'acteur ou du jeton."),
          salle: chaine("Pièce de la carte où aller (voir « Pièces de la carte » dans l'état du jeu), ou vide pour utiliser x et y."),
          pres_de: PRES_DE,
          x: entier("Colonne (case), si salle est vide ; -1 (avec y -1) = à côté des personnages joueurs."),
          y: entier("Ligne (case), si salle est vide ; -1 = à côté des personnages joueurs."),
          cache: booleen("true pour un jeton caché aux joueurs.")
        })
      }
    }),
    sensible: true,
    async executer({ jetons }) {
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const g = grilleDe(scene);
      const rapport = [];
      for (const j of jetons) {
        const existant = scene.tokens.find(t => t.name.toLowerCase() === j.personnage.trim().toLowerCase());
        // Les autres jetons occupent leurs cases ; celui qu'on déplace libère la sienne.
        const occupees = occupeesDe(scene, g, existant);
        let c = { x: j.x, y: j.y }, ou = "";
        if (j.pres_de?.trim()) {
          const zone = zoneDePose(scene, { salle: j.salle, pres_de: j.pres_de, sauf: j.personnage });
          if (zone.erreur) { rapport.push(`${j.personnage} : ${zone.erreur}`); continue; }
          // Déjà tout contre le repère : il ne bouge pas.
          const ici = existant ? caseDuJeton(existant, g) : null;
          const dejaLa = ici && !occupees.has(`${ici.x},${ici.y}`) && zone.cibles.some(k => Math.max(Math.abs(k.x - ici.x), Math.abs(k.y - ici.y)) <= 1);
          [c] = dejaLa ? [ici] : choisirCases(1, zone, occupees);
          if (!c) { rapport.push(`${j.personnage} : plus de case libre près de « ${zone.repere} »`); continue; }
          ou = decrireOu(zone);
        } else if (j.salle?.trim()) {
          const zone = zoneDePose(scene, { salle: j.salle });
          if (zone.erreur) { rapport.push(`${j.personnage} : ${zone.erreur}`); continue; }
          // Déjà dans la pièce : on ne le bouge pas (seule sa visibilité peut changer).
          const ici = existant ? caseDuJeton(existant, g) : null;
          const dejaLa = ici && !occupees.has(`${ici.x},${ici.y}`) && salleDeLaCase([zone.zone], ici.x, ici.y);
          [c] = dejaLa ? [ici] : casesLibres(1, { centre: zone.centre, zone: zone.zone, limites: g, occupees });
          if (!c) { rapport.push(`${j.personnage} : plus de case libre dans « ${zone.zone.nom} »`); continue; }
          ou = ` dans « ${zone.zone.nom} »`;
        } else if (j.x < 0 || j.y < 0) {
          // À côté des personnages joueurs ; un jeton déjà tout près ne bouge pas.
          const zone = zoneDePose(scene);
          const ici = existant ? caseDuJeton(existant, g) : null;
          const proche = ici && !occupees.has(`${ici.x},${ici.y}`) && Math.max(Math.abs(ici.x - zone.centre.x), Math.abs(ici.y - zone.centre.y)) <= 2;
          [c] = proche ? [ici] : casesLibres(1, { centre: zone.centre, zone: zone.zone, limites: g, occupees });
          if (!c) { rapport.push(`${j.personnage} : plus de case libre près des personnages joueurs`); continue; }
          ou = " près des personnages joueurs";
        } else if (occupees.has(`${c.x},${c.y}`)) {
          // Case donnée occupée, sur un obstacle (étal, puits…) ou devant une porte : la plus proche libre, dans la même pièce.
          const salles = sallesDe(scene);
          const [libre] = casesLibres(1, { centre: c, zone: salleDeLaCase(salles, c.x, c.y), limites: g, occupees });
          if (libre) { ou = ` (case ${c.x},${c.y} prise : la plus proche libre)`; c = libre; }
        }
        const { x, y } = versPixels(c, g);
        if (existant) {
          // « displace » : le jeton est posé directement à sa place. Un déplacement ordinaire est une marche que Foundry v14
          // arrête au premier mur ou à la première porte fermée (le jeton restait coincé dans le mur de l'échoppe).
          await existant.update({ x, y, hidden: j.cache, action: "displace" });
          rapport.push(`${existant.name} → case ${c.x},${c.y}${ou}${j.cache ? " (caché)" : ""}`);
          continue;
        }
        const acteur = await trouverActeur(j.personnage);
        if (!acteur) { rapport.push(`${j.personnage} introuvable (crée-le avec creer_pnj)`); continue; }
        const jeton = await acteur.getTokenDocument({ x, y, hidden: j.cache, level: niveauAffiche(scene) });
        await scene.createEmbeddedDocuments("Token", [jeton.toObject()]);
        rapport.push(`${acteur.name} posé case ${c.x},${c.y}${ou}${j.cache ? " (caché)" : ""}`);
      }
      return { contenu: `${rapport.join(" ; ")}.` };
    }
  },
  {
    nom: "lancer_combat",
    systemes: ["impmal", "dnd5e"],
    description: "Démarre un combat avec les jetons nommés présents sur la scène active, et lance l'initiative des PNJ.",
    schema: objet({ participants: { type: "array", items: chaine("Nom du jeton.") } }),
    sensible: true,
    async executer({ participants }) {
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const noms = participants.map(n => n.toLowerCase());
      const jetons = scene.tokens.filter(t => noms.includes(t.name.toLowerCase()));
      if (!jetons.length) return { erreur: true, contenu: "Aucun de ces jetons n'est sur la scène." };
      const combat = game.combats.active ?? await Combat.implementation.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", jetons.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      await combat.rollNPC().catch(() => null);
      await combat.startCombat();
      return { contenu: `Combat lancé avec ${jetons.map(t => t.name).join(", ")}.` };
    }
  },
  {
    nom: "changer_scene",
    description: "Active une scène (les joueurs y sont transportés). Si elle n'est pas dans le monde, elle est importée des compendiums (cartes des aventures). Pour démarrer une scène jouée, préfère amener_joueurs.",
    schema: objet({ nom: chaine("Nom de la scène.") }),
    sensible: true,
    async executer({ nom }) {
      const scene = await trouverOuImporterScene(nom);
      if (!scene) return { erreur: true, contenu: `Scène introuvable : ${nom}. Scènes du monde : ${game.scenes.map(s => s.name).join(", ")}.` };
      await scene.activate();
      return { contenu: `Scène « ${scene.name} » activée.` };
    }
  },
  {
    nom: "illustrer",
    description: "Génère une image (lieu, PNJ, objet, ambiance) avec OpenAI et la montre dans le chat. Coûte de l'argent : avec parcimonie, pour les moments marquants.",
    schema: objet({
      titre: chaine("Titre court de l'image."),
      description: chaine("Description visuelle détaillée, en anglais de préférence, avec le style voulu."),
      format: { type: "string", enum: ["paysage", "portrait", "carre"], description: "Format." },
      portrait_de: chaine("Nom d'un PNJ ou d'un personnage dont l'image devient le portrait (fiche) ; vide sinon. Son jeton ne change pas.")
    }),
    sensible: true,
    async executer({ titre, description, format, portrait_de = "" }) {
      const images = fournisseurImages();
      if (!images) return { erreur: true, contenu: "Pas de clé OpenAI configurée : impossible de générer une image." };
      const taille = { paysage: "1536x1024", portrait: "1024x1536", carre: "1024x1024" }[format];
      const blob = await images.genererImage({ description, taille });
      const nom = `${Date.now()}-${titre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
      const chemin = await deposerFichier(`images/${game.world.id}`, nom, new File([blob], nom, { type: "image/png" }));
      await ChatMessage.implementation.create({
        content: `<figure class="lakour-mjia-image"><img src="${chemin}" alt=""><figcaption>${foundry.utils.escapeHTML(titre)}</figcaption></figure>`,
        speaker: { alias: "MJ IA" },
        flags: { [ID]: { ia: true } }
      });
      const acteur = portrait_de.trim() ? await trouverActeur(portrait_de) : null;
      if (acteur) await acteur.update({ img: chemin });
      return { contenu: `Image « ${titre} » montrée aux joueurs (${chemin})${acteur ? ` ; c'est désormais le portrait de ${acteur.name}` : ""}.` };
    }
  }
];

// ---------------------------------------------------------------- Création de personnage

const COMPETENCES_IMPMAL = ["athletics", "awareness", "dexterity", "discipline", "fortitude", "intuition", "linguistics", "logic", "lore", "medicae", "melee", "navigation", "presence", "piloting", "psychic", "ranged", "rapport", "reflexes", "stealth", "tech"];
const aliasMJ = () => game.settings.get(ID, "personnalites").find(p => p.id === game.settings.get(ID, "personnaliteActive"))?.nomAffiche ?? "MJ";
const trouverJoueur = nom => {
  const n = (nom ?? "").trim().toLowerCase();
  return game.users.find(u => u.name.toLowerCase() === n) ?? game.users.find(u => u.character?.name.toLowerCase() === n) ?? null;
};

OUTILS.push(
  {
    nom: "demander_des",
    systemes: ["impmal", "dnd5e"],
    description: "Demande à un joueur de lancer lui-même des dés (bouton dans le chat) : caractéristiques à la création, jet de chance, etc. Les résultats t'arriveront dans un prochain message. Arrête-toi juste après.",
    schema: objet({
      joueur: chaine("Nom du joueur Foundry (ou de son personnage)."),
      formule: chaine("Formule de dés, ex. « 2d10+20 »."),
      nombre: entier("Nombre de jets identiques à faire d'un coup (1 à 12), ex. 9 pour les neuf caractéristiques."),
      raison: chaine("À quoi sert ce jet, en une phrase (affiché sur le bouton).")
    }),
    sensible: false,
    async executer({ joueur, formule, nombre, raison }) {
      if (!Roll.validate(formule)) return { erreur: true, contenu: `Formule invalide : ${formule}.` };
      const n = Math.min(Math.max(nombre, 1), 12);
      const utilisateur = trouverJoueur(joueur);
      const esc = foundry.utils.escapeHTML;
      await ChatMessage.implementation.create({
        content: `<div class="lakour-mjia-jet"><p>${versHTML(raison)}</p>`
          + `<button type="button" data-lakour-des data-formule="${esc(formule)}" data-nombre="${n}" data-raison="${esc(raison)}"`
          + `${utilisateur ? ` data-joueur="${utilisateur.id}"` : ""}><i class="fa-solid fa-dice"></i> ${n > 1 ? `${n} × ` : ""}${esc(formule)}</button></div>`,
        speaker: { alias: aliasMJ() },
        flags: { [ID]: { ia: true } }
      });
      return { contenu: `Bouton de jet (${n} × ${formule}) posé dans le chat pour ${utilisateur?.name ?? "n'importe quel joueur"}. Attends les résultats.` };
    }
  },
  {
    nom: "lancer_table",
    description: "Tire sur une table aléatoire devant tout le monde (ex. la table des origines, ou la table de factions d'une origine) et renvoie le résultat avec son uuid "
      + "et les données qu'il porte (un contrat : po et réputation à donner, horloge rep-<faction>). nombre : plusieurs résultats différents d'un coup "
      + "(les trois contrats du jour), en écartant ceux déjà tirés ou pris (exclure).",
    schema: objet({
      table: chaine("Nom de la table (ex. « Origines ») ou son uuid (ex. la factionTable d'une origine, lue avec lire_document)."),
      raison: chaine("Pourquoi ce tirage."),
      nombre: entier(`Combien de résultats différents tirer (1 à ${TIRAGES_MAX} ; 0 = 1).`),
      exclure: { type: "array", items: chaine("Nom (ou morceau de nom) d'un résultat déjà tiré, pris ou accompli."), description: "Résultats à ne pas retirer ; vide = aucun." }
    }),
    sensible: false,
    async executer({ table, raison, nombre = 1, exclure = [] }) {
      let t = table.includes(".") ? await fromUuid(table).catch(() => null) : null;
      if (!t) {
        // Par le nom (recherche-nom.js) : exact, puis début, puis contenu ; tables du monde avant celles des compendiums. Plusieurs
        // tables possibles : aucune n'est tirée au hasard, l'IA reçoit les noms et choisit.
        const candidats = game.tables.map(x => ({ nom: x.name, doc: x }));
        for (const pack of game.packs.filter(p => p.documentName === "RollTable")) {
          for (const e of await pack.getIndex()) candidats.push({ nom: e.name, pack, id: e._id });
        }
        const { choix, ambigus } = choisirParNom(candidats, table);
        if (ambigus.length) {
          return { erreur: true, contenu: `« ${table} » désigne plusieurs tables : ${ambigus.slice(0, 20).map(n => `« ${n} »`).join(", ")}`
            + `${ambigus.length > 20 ? ` (et ${ambigus.length - 20} autres)` : ""}. Rien n'a été tiré : rappelle lancer_table avec le nom exact.` };
        }
        t = choix ? choix.doc ?? await choix.pack.getDocument(choix.id) : null;
      }
      if (!t) return { erreur: true, contenu: `Table introuvable : ${table}. Tables du monde : ${game.tables.map(x => x.name).join(", ")}.` };
      const nomDe = r => r.name || versTexte(r.description);
      // Les données du module de contenu du monde (lakour-warcraft : flags.lakour-warcraft.contrat), pour l'IA seule.
      const contenu = (() => { try { return moduleDeContenu(); } catch { return null; } })();
      const ligne = (r, total) => `jet ${total} → ${nomDe(r)}${r.documentUuid ? ` (uuid ${r.documentUuid})` : ""}`
        + `${contenu && donneesDuResultat(r.flags?.[contenu]) ? ` [${donneesDuResultat(r.flags[contenu])}]` : ""}`;
      // Un seul résultat, rien à écarter : le tirage de Foundry, affiché tel quel.
      if ((nombre || 1) <= 1 && !exclure.length) {
        const tirage = await t.draw({ displayChat: true, rollMode: CONST.DICE_ROLL_MODES.PUBLIC });
        const r = tirage.results[0];
        if (!r) return { erreur: true, contenu: `Le tirage sur « ${t.name} » n'a rien donné.` };
        return { contenu: `${raison} — « ${t.name} » : ${ligne(r, tirage.roll.total)}.` };
      }
      // Plusieurs résultats, ou des résultats écartés : des tirages muets, sans doublon, puis une seule carte au chat.
      const tires = await tirerSansDoublon(async () => {
        const x = await t.draw({ displayChat: false });
        return { total: x.roll?.total, resultats: x.results ?? [] };
      }, nombre, { exclus: exclure, cleDe: r => r.id ?? r._id ?? nomDe(r), nomDe });
      if (!tires.length) return { erreur: true, contenu: `Le tirage sur « ${t.name} » n'a rien donné${exclure.length ? " (tous les résultats possibles sont écartés)" : ""}.` };
      const esc = foundry.utils.escapeHTML;
      await ChatMessage.implementation.create({
        content: `<div class="lakour-mjia-jet"><p><strong>${esc(t.name)}</strong> — ${esc(raison)}</p><ul>${tires.map(({ r }) => `<li>${esc(nomDe(r))}</li>`).join("")}</ul></div>`,
        speaker: { alias: aliasMJ() }, flags: { [ID]: { ia: true } }
      });
      const voulus = Math.max(1, Math.min(TIRAGES_MAX, nombre || 1));
      return { contenu: `${raison} — « ${t.name} », ${tires.length} résultat(s) différent(s)${tires.length < voulus ? ` (sur ${voulus} voulus : la table n'en a pas assez hors des exclus)` : ""} :\n`
        + tires.map(({ r, total }) => `- ${ligne(r, total)}`).join("\n") };
    }
  },
  {
    nom: "creer_personnage",
    systemes: ["impmal"],
    description: "Crée la fiche d'un personnage joueur Imperium Maledictum une fois TOUS les choix faits avec le joueur, et la lui confie. Les +5 des caractéristiques de base de l'origine et de la faction sont ajoutés automatiquement ; indique seulement les caractéristiques CHOISIES dans bonus_choisis. "
      + "Pour COMPLÉTER une fiche existante (origine, faction ou rôle manquant), donne acteur_existant : seuls les éléments absents sont ajoutés "
      + "(laisse vides les uuid des autres) ; ses caractéristiques ne sont recalculées que si elles n'ont jamais été tirées.",
    schema: objet({
      nom: chaine("Nom du personnage."),
      joueur: chaine("Nom du joueur Foundry qui recevra la fiche (vide = aucun)."),
      acteur_existant: chaine("Nom d'une fiche de personnage existante à compléter ; vide = nouvelle fiche."),
      tirages: objet(Object.fromEntries(CARACS.map(c => [c, entier(`Résultat du 2d10+20 attribué à ${c}.`)]))),
      bonus_choisis: { type: "array", items: { type: "string", enum: CARACS }, description: "Caractéristique choisie pour l'origine, puis pour la faction (0 à 2)." },
      origine_uuid: chaine("uuid de l'origine."),
      faction_uuid: chaine("uuid de la faction."),
      role_uuid: chaine("uuid du rôle."),
      competences: { type: "array", items: objet({ competence: { type: "string", enum: COMPETENCES_IMPMAL }, avances: entier("Nombre d'avances (total).") }) },
      specialisations: { type: "array", items: objet({ uuid: chaine("uuid de la spécialisation."), avances: entier("Nombre d'avances.") }) },
      objets: { type: "array", items: chaine("uuid d'un talent, d'une arme, d'une protection, d'un équipement ou d'un pouvoir retenu.") },
      px: entier("Points d'expérience de départ non dépensés (0 si aucun)."),
      description: chaine("Apparence, histoire, ambitions, en quelques lignes.")
    }),
    sensible: true,
    async executer(a) {
      if (game.system.id !== "impmal") return { erreur: true, contenu: "La création guidée n'est disponible que pour Imperium Maledictum." };
      const existant = a.acteur_existant.trim()
        ? game.actors.find(x => x.type === "character" && x.name.toLowerCase() === a.acteur_existant.trim().toLowerCase()) : null;
      if (a.acteur_existant.trim() && !existant) return { erreur: true, contenu: `Fiche introuvable : ${a.acteur_existant}.` };
      // Sur une fiche existante, on n'ajoute que ce qui manque (origine, faction, rôle).
      const deja = type => existant?.items.find(i => i.type === type) ?? null;
      const charger = async (uuid, quoi) => {
        const d = await fromUuid(uuid).catch(() => null);
        if (!d || d.documentName !== "Item") throw new Error(`${quoi} introuvable : ${uuid || "(vide)"}`);
        return d;
      };
      let origine, faction, role;
      try {
        origine = deja("origin") ?? await charger(a.origine_uuid, "Origine");
        faction = deja("faction") ?? await charger(a.faction_uuid, "Faction");
        role = deja("role") ?? await charger(a.role_uuid, "Rôle");
      } catch (e) { return { erreur: true, contenu: e.message }; }
      // Caractéristiques : calculées pour une nouvelle fiche, ou pour une fiche existante jamais tirée (toutes à 0).
      const jamaisTiree = existant && CARACS.every(c => !existant.system.characteristics?.[c]?.starting);
      let caracteristiques = null;
      if (!existant || jamaisTiree) {
        const calcul = calculerCaracteristiques(a.tirages, {
          baseOrigine: origine.system.characteristics?.base, baseFaction: faction.system.character?.characteristics?.base, choix: a.bonus_choisis
        });
        if (calcul.erreurs.length) return { erreur: true, contenu: calcul.erreurs.join(" ; ") };
        caracteristiques = calcul.caracteristiques;
      }

      const objets = [origine, faction, role].filter(d => !d.parent).map(d => game.items.fromCompendium(d));
      for (const s of a.specialisations) {
        const d = game.items.fromCompendium(await charger(s.uuid, "Spécialisation"));
        d.system.advances = s.avances;
        objets.push(d);
      }
      // Objets de départ : tout ce que donnent l'origine, la faction et le rôle ajoutés (choix de l'IA d'abord, sinon la
      // première option), plus les objets demandés en plus. Sur une fiche existante, seulement ceux des éléments ajoutés.
      const neuf = d => (d.parent ? undefined : d.toObject().system);
      // Le module de contenu 40k range la fiche ensuite (armure portée, arme en main, munitions, doublons fusionnés) :
      // on lui laisse les doubles voulus (deux Stimm). Sans lui, un seul exemplaire de chaque objet.
      const preparerDepart = game.modules.get("lakour-40k")?.api?.preparerDepart;
      const dejaLa = new Set((existant?.items ?? []).map(i => `${i.type}:${i.name}`));
      const introuvables = [];
      for (const uuid of objetsDeDepart({ origine: neuf(origine), faction: neuf(faction), role: neuf(role) }, a.objets, { garderDoubles: Boolean(preparerDepart) })) {
        const d = await fromUuid(uuid).catch(() => null);
        if (d?.documentName !== "Item") { introuvables.push(uuid); continue; }
        const cle = `${d.type}:${d.name}`;
        if (dejaLa.has(cle)) continue;
        if (!preparerDepart) dejaLa.add(cle);
        objets.push(game.items.fromCompendium(d));
      }

      const utilisateur = trouverJoueur(a.joueur);
      // Jeton du rôle, si le module de contenu en fournit un.
      const jeton = existant ? null : await jetonJoueur(role.flags?.["lakour-40k"]?.cle, lire("styleVisuel"));
      const acteur = existant ?? await Actor.implementation.create({
        name: a.nom, type: "character",
        ...(jeton ? { img: jeton } : {}),
        system: {
          characteristics: caracteristiques,
          skills: Object.fromEntries(a.competences.map(c => [c.competence, { advances: c.avances }])),
          solars: faction.system.character?.solars ?? 0,
          xp: { total: a.px },
          notes: { player: versHTML(a.description), gm: "" }
        },
        ownership: utilisateur ? { default: 0, [utilisateur.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } : { default: 0 },
        // Vision obligatoire : impmal ne l'active d'office que si on ne fournit AUCUN prototypeToken.
        // Sans elle, un joueur ne voit rien sur une carte à vision par jeton (toutes nos cartes).
        prototypeToken: { name: a.nom, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, sight: { enabled: true, range: 2 },
          ...(jeton ? { texture: { src: jeton } } : {}) }
      });
      // Fiche existante : caractéristiques (si jamais tirées) et compétences complétées, rien d'autre n'est écrasé.
      if (existant) {
        const maj = Object.fromEntries(a.competences.map(c => [`system.skills.${c.competence}.advances`, c.avances]));
        if (caracteristiques) maj["system.characteristics"] = caracteristiques;
        // La faction vient d'être ajoutée : ses solars de départ aussi.
        if (!faction.parent) maj["system.solars"] = (existant.system.solars ?? 0) + (faction.system.character?.solars ?? 0);
        if (Object.keys(maj).length) await existant.update(maj);
      }
      // Comme l'assistant du système : on n'applique pas une seconde fois origine et faction.
      if (objets.length) await acteur.createEmbeddedDocuments("Item", objets, { skipRequirement: true, skipOrigin: true, skipFaction: true });
      const rangement = preparerDepart ? await preparerDepart(acteur).catch(e => { console.warn(`${ID} | preparerDepart`, e); return null; }) : null;
      const munitions = await donnerMunitions(acteur);
      // Les avances de départ sont gratuites : une ligne négative annule l'expérience « dépensée ».
      const depense = acteur.system.xp?.spent ?? 0;
      if (depense) await acteur.update({ "system.xp.other.list": [{ xp: -depense, description: "Création de personnage (MJ IA)" }] });
      if (utilisateur && !utilisateur.isGM) await utilisateur.update({ character: acteur.id });

      const finales = CARACS.map(c => `${c} ${acteur.system.characteristics?.[c]?.starting ?? "?"}`).join(", ");
      return { contenu: `Fiche « ${acteur.name} » ${existant ? "complétée" : "créée"} (${acteur.uuid})${utilisateur ? ` et confiée à ${utilisateur.name}` : ""}. `
        + `Caractéristiques : ${finales}. ${objets.length} objets ajoutés : ${objets.map(o => o.name).join(", ")}.`
        + (munitions.length ? ` Munitions chargées : ${munitions.join(", ")}.` : "")
        + (rangement ? " Fiche rangée : armure portée, arme en main, munitions reliées, doublons fusionnés." : "")
        + (introuvables.length ? ` Introuvables, non ajoutés : ${introuvables.join(", ")} (vérifie avec chercher_compendium).` : "") };
    }
  }
);

// D&D 5e : l'IA crée le personnage COMPLET. Peuple, historique et classe passent par le gestionnaire d'avancements de
// dnd5e (creation-dnd5e.js), qui reçoit les choix de l'IA à chaque étape au lieu d'ouvrir une fenêtre au joueur.
const CARACS_DND = ["str", "dex", "con", "int", "wis", "cha"];
OUTILS.push({
  nom: "creer_personnage_dnd5e",
  systemes: ["dnd5e"],
  description: "D&D 5e seulement. Crée la fiche COMPLÈTE d'un personnage joueur et la lui assigne : caractéristiques de base, puis peuple, "
    + "historique et classe (niveau 1) appliqués avec tous leurs choix (taille, maîtrises, bonus d'historique, dons, sorts, PV), puis "
    + "l'équipement de départ. Les uuid se trouvent avec chercher_compendium. Ce que tu ne précises pas est choisi par défaut. "
    + "Pour COMPLÉTER une fiche existante (peuple, historique ou classe manquant), donne acteur_existant : seuls les éléments absents sont ajoutés "
    + "(laisse vides les uuid des autres), ses caractéristiques actuelles sont gardées.",
  schema: objet({
    nom: chaine("Nom du personnage."),
    joueur: chaine("Nom du joueur Foundry qui reçoit la fiche (vide = aucun, pour un compagnon IA)."),
    acteur_existant: chaine("Nom d'une fiche de personnage existante à compléter ; vide = nouvelle fiche."),
    caracteristiques: objet(Object.fromEntries(CARACS_DND.map(c => [c, entier(`Valeur de base de ${c} (3 à 18), avant les bonus d'historique (ignorée pour une fiche existante).`)]))),
    peuple_uuid: chaine("uuid du peuple (objet de type race)."),
    historique_uuid: chaine("uuid de l'historique (objet de type background)."),
    classe_uuid: chaine("uuid de la classe (objet de type class)."),
    bonus_historique: { type: "array", items: objet({ carac: { type: "string", enum: CARACS_DND }, valeur: entier("+1 ou +2.") }),
      description: "Bonus de caractéristiques de l'historique : +2/+1 ou +1/+1/+1 parmi les trois qu'il permet." },
    maitrises: { type: "array", items: chaine("Clé dnd5e : compétence « ath », « prc »… ; outil « tool:… » ; langue « languages:… »."),
      description: "Maîtrises voulues, dans l'ordre de préférence (compétences de classe, d'historique, langues)." },
    choix_uuid: { type: "array", items: chaine("uuid d'un don, d'un sort ou d'une option à choisir."), description: "Choix d'objets (dons, sorts, options) à retenir." },
    taille: { type: "string", enum: ["", "sm", "med"], description: "Taille si le peuple laisse le choix (vide = défaut)." },
    carac_sorts: { type: "string", enum: ["", ...CARACS_DND], description: "Caractéristique d'incantation des sorts accordés (vide = défaut)." },
    equipement: { type: "string", enum: ["objets", "or"], description: "Équipement de départ : les objets proposés, ou l'or à la place." },
    description: chaine("Apparence, histoire, ambitions, en quelques lignes.")
  }),
  sensible: true,
  async executer(a) {
    if (game.system.id !== "dnd5e") return { erreur: true, contenu: "creer_personnage_dnd5e ne sert qu'en D&D 5e." };
    const existant = a.acteur_existant.trim()
      ? game.actors.find(x => x.type === "character" && x.name.toLowerCase() === a.acteur_existant.trim().toLowerCase()) : null;
    if (a.acteur_existant.trim() && !existant) return { erreur: true, contenu: `Fiche introuvable : ${a.acteur_existant}.` };
    const hors = existant ? [] : CARACS_DND.filter(c => !(a.caracteristiques[c] >= 3 && a.caracteristiques[c] <= 18));
    if (hors.length) return { erreur: true, contenu: `Caractéristiques hors de 3 à 18 : ${hors.join(", ")}.` };
    const utilisateur = a.joueur.trim() ? trouverJoueur(a.joueur) : null;
    if (a.joueur.trim() && !utilisateur && !existant) return { erreur: true, contenu: `Joueur introuvable : ${a.joueur}.` };
    // Sur une fiche existante, on n'ajoute que ce qui manque.
    const manque = type => !existant?.items.some(i => i.type === type);
    const charger = async (uuid, type, quoi) => {
      if (!manque(type)) return null;
      const d = await fromUuid(uuid).catch(() => null);
      if (d?.documentName !== "Item" || d.type !== type) throw new Error(`${quoi} introuvable ou d'un autre type : ${uuid || "(vide)"}`);
      return d;
    };
    let peuple, historique, classe;
    try {
      [peuple, historique, classe] = await Promise.all([
        charger(a.peuple_uuid, "race", "Peuple"), charger(a.historique_uuid, "background", "Historique"), charger(a.classe_uuid, "class", "Classe")
      ]);
    } catch (e) { return { erreur: true, contenu: e.message }; }

    // Jeton du peuple, si le module de contenu en fournit un (nouvelle fiche seulement).
    const jeton = existant ? null : await jetonJoueur(peuple?.flags?.["lakour-warcraft"]?.cle, lire("styleVisuel"));
    const acteur = existant ?? await Actor.implementation.create({
      name: a.nom, type: "character",
      ...(jeton ? { img: jeton } : {}),
      system: {
        abilities: Object.fromEntries(CARACS_DND.map(c => [c, { value: a.caracteristiques[c] }])),
        details: { biography: { value: versHTML(a.description) } }
      },
      ownership: utilisateur ? { default: 0, [utilisateur.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } : { default: 0 },
      prototypeToken: { name: a.nom, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, sight: { enabled: true },
        ...(jeton ? { texture: { src: jeton } } : {}) }
    });
    // Ordre des caractéristiques pour les bonus par défaut : les plus hautes d'abord.
    const base = existant ? Object.fromEntries(CARACS_DND.map(c => [c, existant.system.abilities?.[c]?.value ?? 10])) : a.caracteristiques;
    const priorites = [...CARACS_DND].sort((x, y) => base[y] - base[x]);
    const preferences = { taille: a.taille, maitrises: a.maitrises, bonus: a.bonus_historique, choix: a.choix_uuid, caracSorts: a.carac_sorts, priorites };
    const problemes = [];
    for (const source of [peuple, historique, classe].filter(Boolean)) {
      try { await ajouterAvecAvancements(acteur, game.items.fromCompendium(source), preferences); }
      catch (e) { problemes.push(e.message); }
    }
    const equipement = [];
    for (const source of [classe, historique].filter(Boolean)) {
      try { equipement.push(await donnerEquipement(acteur, source, a.equipement)); }
      catch (e) { problemes.push(`équipement de ${source.name} : ${e.message}`); }
    }
    if (utilisateur && !utilisateur.isGM) await utilisateur.update({ character: acteur.id });

    const fiche = acteur.system;
    const caracs = CARACS_DND.map(c => `${c} ${fiche.abilities?.[c]?.value}`).join(", ");
    const comps = Object.entries(fiche.skills ?? {}).filter(([, v]) => v.value > 0).map(([k]) => k).join(", ");
    const objets = equipement.flatMap(e => e.objets).join(", ");
    const pieces = equipement.map(e => Object.entries(e.pieces).map(([k, v]) => `${v} ${k}`).join(", ")).filter(Boolean).join(", ");
    const aChoisir = equipement.flatMap(e => e.aChoisir);
    return { contenu: [
      `Personnage « ${acteur.name} » ${existant ? "complété" : "créé"} (${acteur.uuid})${utilisateur ? `, assigné à ${utilisateur.name}` : ""} : `
        + `${["race", "background", "class"].map(t => acteur.items.find(i => i.type === t)?.name ?? `(${t} manquant)`).join(", ")}.`,
      `Caractéristiques finales : ${caracs}. PV ${fiche.attributes?.hp?.value}/${fiche.attributes?.hp?.max}. Compétences maîtrisées : ${comps || "aucune"}.`,
      `Équipement : ${objets || "aucun objet"}${pieces ? ` ; pièces : ${pieces}` : ""}.`,
      aChoisir.length ? `Équipement générique à donner toi-même s'il compte (non ajouté) : ${aChoisir.join(" ; ")}.` : "",
      problemes.length ? `À vérifier (une fenêtre de dnd5e a pu s'ouvrir chez le MJ) : ${problemes.join(" ; ")}.` : ""
    ].filter(Boolean).join("\n") };
  }
});

// Imperium Maledictum : chaque arme à chargeur sans munitions reliées reçoit deux lots de sa munition (compendium de
// lakour-40k), branchés sur l'arme (system.ammo.id) : elle peut tirer et recharger depuis la fiche. Renvoie les lots ajoutés.
export async function donnerMunitions(acteur) {
  const pack = game.packs.get("lakour-40k.armement");
  if (!pack || game.system.id !== "impmal") return [];
  const sources = await pack.getDocuments();
  const ajoutes = [];
  for (const arme of acteur.items.filter(i => munitionPour(i) && !i.system.ammo?.id)) {
    const cle = munitionPour(arme);
    let lot = acteur.items.find(i => i.type === "ammo" && i.flags?.["lakour-40k"]?.cle === cle);
    if (!lot) {
      const source = sources.find(d => d.flags?.["lakour-40k"]?.cle === cle);
      if (!source) continue;
      const donnees = game.items.fromCompendium(source);
      donnees.system.quantity = (donnees.system.quantity ?? 1) * 2;
      [lot] = await acteur.createEmbeddedDocuments("Item", [donnees]);
      ajoutes.push(`${lot.name} (${lot.system.quantity})`);
    }
    await arme.update({ "system.ammo.id": lot.id });
  }
  return ajoutes;
}

// ---------------------------------------------------------------- Campagne : progression, bourse, objets, secrets, chronique, sons
// Mêmes outils pour tous les systèmes : ce qui diffère (expérience, monnaie) passe par l'adaptateur.

// Personnages visés : « tous » = tous les personnages joueurs, sinon par nom.
async function personnagesVises(noms) {
  if (noms.some(n => n.trim().toLowerCase() === "tous")) return { acteurs: personnagesJoueurs(), inconnus: [] };
  const acteurs = [], inconnus = [];
  for (const n of noms) { const a = await trouverActeur(n); if (a) acteurs.push(a); else inconnus.push(n); }
  return { acteurs, inconnus };
}

// Ambiances sonores fournies par le module (assets/sons, synthétisées, libres de droits).
export const AMBIANCES = ["vent", "pluie", "orage", "feu", "grotte", "mer", "foule", "forge", "nuit", "tension"];
const NOM_PLAYLIST = "Ambiances (MJ IA)";

OUTILS.push(
  {
    nom: "donner_xp",
    systemes: ["impmal", "dnd5e"],
    description: "Donne de l'expérience aux personnages joueurs (fin de scène, objectif atteint, belle idée). En D&D 5e, dis quand un "
      + "personnage peut monter de niveau (puis monter_niveau) ; en Imperium Maledictum, ils dépensent leur XP avec depenser_xp.",
    schema: objet({
      personnages: { type: "array", items: chaine("Nom d'un personnage, ou « tous »."), description: "Qui reçoit l'expérience." },
      xp: entier("Points d'expérience donnés à chacun."),
      raison: chaine("Pourquoi, en une phrase (annoncée aux joueurs).")
    }),
    sensible: false,
    async executer({ personnages, xp, raison }) {
      const sys = adaptateur();
      if (!sys.cheminXp) return { erreur: true, contenu: "Ce système n'a pas d'expérience gérée par le MJ IA." };
      if (!(xp > 0 && xp <= 100000)) return { erreur: true, contenu: "xp doit être un nombre positif." };
      const { acteurs, inconnus } = await personnagesVises(personnages);
      if (!acteurs.length) return { erreur: true, contenu: `Aucun personnage trouvé (${inconnus.join(", ")}).` };
      const lignes = [];
      for (const a of acteurs) {
        await a.update({ [sys.cheminXp]: sys.xp(a).total + xp });
        const etat = sys.xp(a);
        const niveau = etat.prochainNiveau && etat.total >= etat.prochainNiveau ? " — peut monter de niveau" : "";
        lignes.push(`${a.name} : ${etat.total} XP${etat.disponible !== undefined ? ` (${etat.disponible} à dépenser)` : ""}${niveau}`);
      }
      await ChatMessage.implementation.create({
        content: `<p><strong>+${xp} XP</strong> — ${foundry.utils.escapeHTML(raison)}</p><p>${acteurs.map(a => foundry.utils.escapeHTML(a.name)).join(", ")}</p>`,
        speaker: { alias: aliasMJ() }, flags: { [ID]: { ia: true } }
      });
      return { contenu: lignes.join("\n") + (inconnus.length ? `\nIntrouvables : ${inconnus.join(", ")}.` : "") };
    }
  },
  {
    nom: "monter_niveau",
    systemes: ["dnd5e"],
    description: "D&D 5e : fait monter un personnage d'un niveau, avec tous les choix appliqués comme à la création (PV moyens, sous-classe, "
      + "bonus de caractéristiques ou don, sorts et options). classe_uuid vide = sa classe actuelle ; une autre classe = multiclassage. "
      + "Demande d'abord au joueur ce qu'il veut choisir.",
    schema: objet({
      personnage: chaine("Nom du personnage."),
      classe_uuid: chaine("uuid d'une nouvelle classe (multiclassage) ; vide pour sa classe actuelle."),
      sous_classe_uuid: chaine("uuid de la sous-classe si ce niveau en donne une ; vide sinon."),
      bonus: { type: "array", items: objet({ carac: { type: "string", enum: CARACS_DND }, valeur: entier("+1 ou +2.") }), description: "Amélioration de caractéristiques (+2 ou +1/+1)." },
      don_uuid: chaine("uuid d'un don pris à la place des bonus ; vide sinon."),
      choix_uuid: { type: "array", items: chaine("uuid d'un sort, d'une option…"), description: "Choix d'objets du niveau." },
      maitrises: { type: "array", items: chaine("Clé de maîtrise."), description: "Maîtrises voulues si le niveau en donne." }
    }),
    sensible: true,
    async executer(a) {
      if (game.system.id !== "dnd5e") return { erreur: true, contenu: "monter_niveau ne sert qu'en D&D 5e (en Imperium Maledictum : depenser_xp)." };
      const acteur = await trouverActeur(a.personnage);
      if (!acteur || acteur.type !== "character") return { erreur: true, contenu: `Personnage introuvable : ${a.personnage}.` };
      const preferences = { taille: "", maitrises: a.maitrises, bonus: a.bonus, choix: a.choix_uuid, caracSorts: "", priorites: [],
        sousClasse: a.sous_classe_uuid, don: a.don_uuid };
      const avant = acteur.system.details?.level ?? 0;
      try {
        if (a.classe_uuid.trim()) {
          const source = await fromUuid(a.classe_uuid).catch(() => null);
          if (source?.type !== "class") return { erreur: true, contenu: `Classe introuvable : ${a.classe_uuid}.` };
          const deja = acteur.items.find(i => i.type === "class" && i.name === source.name);
          if (deja) await monterNiveau(acteur, deja, preferences);
          else await ajouterAvecAvancements(acteur, game.items.fromCompendium(source), preferences);
        } else {
          const classe = acteur.items.get(acteur.system.details?.originalClass) ?? acteur.items.find(i => i.type === "class");
          if (!classe) return { erreur: true, contenu: `${acteur.name} n'a pas de classe : complète d'abord sa fiche (creer_personnage_dnd5e).` };
          await monterNiveau(acteur, classe, preferences);
        }
      } catch (e) { return { erreur: true, contenu: `Montée de niveau inachevée : ${e.message}` }; }
      const s = acteur.system;
      return { contenu: `${acteur.name} passe du niveau ${avant} au niveau ${s.details?.level} — PV ${s.attributes?.hp?.value}/${s.attributes?.hp?.max} ; `
        + `classes : ${acteur.items.filter(i => i.type === "class").map(c => `${c.name} ${c.system.levels}`).join(", ")}.` };
    }
  },
  {
    nom: "depenser_xp",
    systemes: ["impmal"],
    description: "Imperium Maledictum : dépense l'expérience d'un personnage, comme le joueur le souhaite : avances de caractéristiques et de "
      + "compétences (nombre à AJOUTER), nouveaux talents, spécialisations. Le système calcule le coût ; si l'XP ne suffit pas, rien n'est fait.",
    schema: objet({
      personnage: chaine("Nom du personnage."),
      caracteristiques: { type: "array", items: objet({ carac: { type: "string", enum: CARACS }, avances: entier("Avances à ajouter.") }), description: "Avances de caractéristiques." },
      competences: { type: "array", items: objet({ competence: { type: "string", enum: COMPETENCES_IMPMAL }, avances: entier("Avances à ajouter.") }), description: "Avances de compétences." },
      talents: { type: "array", items: chaine("uuid d'un talent."), description: "Talents achetés." },
      specialisations: { type: "array", items: objet({ uuid: chaine("uuid de la spécialisation."), avances: entier("Avances.") }), description: "Spécialisations." }
    }),
    sensible: true,
    async executer(a) {
      if (game.system.id !== "impmal") return { erreur: true, contenu: "depenser_xp ne sert qu'en Imperium Maledictum (en D&D 5e : monter_niveau)." };
      const acteur = await trouverActeur(a.personnage);
      if (!acteur || acteur.type !== "character") return { erreur: true, contenu: `Personnage introuvable : ${a.personnage}.` };
      const maj = {};
      for (const c of a.caracteristiques) maj[`system.characteristics.${c.carac}.advances`] = (acteur.system.characteristics?.[c.carac]?.advances ?? 0) + c.avances;
      for (const c of a.competences) maj[`system.skills.${c.competence}.advances`] = (acteur.system.skills?.[c.competence]?.advances ?? 0) + c.avances;
      const avant = Object.fromEntries(Object.keys(maj).map(k => [k, foundry.utils.getProperty(acteur, k) ?? 0]));
      const objets = [];
      for (const uuid of a.talents) {
        const d = await fromUuid(uuid).catch(() => null);
        if (d?.type !== "talent") return { erreur: true, contenu: `Talent introuvable : ${uuid}.` };
        objets.push(game.items.fromCompendium(d));
      }
      for (const s of a.specialisations) {
        const d = await fromUuid(s.uuid).catch(() => null);
        if (d?.type !== "specialisation") return { erreur: true, contenu: `Spécialisation introuvable : ${s.uuid}.` };
        const donnees = game.items.fromCompendium(d);
        donnees.system.advances = s.avances;
        objets.push(donnees);
      }
      if (Object.keys(maj).length) await acteur.update(maj);
      const crees = objets.length ? await acteur.createEmbeddedDocuments("Item", objets, { skipRequirement: true }) : [];
      const { total, disponible } = adaptateur().xp(acteur);
      if (disponible < 0) {
        // Pas assez d'XP : on annule tout.
        if (Object.keys(avant).length) await acteur.update(avant);
        if (crees.length) await acteur.deleteEmbeddedDocuments("Item", crees.map(i => i.id));
        return { erreur: true, contenu: `Pas assez d'expérience : il manquerait ${-disponible} XP (total ${total}). Rien n'a été dépensé.` };
      }
      return { contenu: `${acteur.name} : ${Object.keys(maj).length} avance(s), ${crees.map(i => i.name).join(", ") || "aucun objet"} ; reste ${disponible} XP.` };
    }
  },
  {
    nom: "bourse",
    systemes: ["impmal", "dnd5e"],
    description: "Ajoute ou retire de l'argent à un personnage : récompense, butin, paiement, pot-de-vin. Montant négatif pour payer. "
      + `Devises : solars (Imperium Maledictum) ; pp, gp, ep, sp, cp (D&D 5e : platine, or, électrum, argent, cuivre).`,
    schema: objet({
      personnage: chaine("Nom du personnage."),
      montant: entier("Montant (négatif pour retirer)."),
      devise: chaine("Devise (solars, gp, sp…)."),
      raison: chaine("Pourquoi, en quelques mots.")
    }),
    sensible: false,
    async executer({ personnage, montant, devise, raison }) {
      const sys = adaptateur();
      const acteur = await trouverActeur(personnage);
      if (!acteur) return { erreur: true, contenu: `Personnage introuvable : ${personnage}.` };
      if (!sys.devises.includes(devise)) return { erreur: true, contenu: `Devise inconnue : ${devise} (devises : ${sys.devises.join(", ") || "aucune"}).` };
      const bourse = sys.bourse(acteur);
      if ((bourse[devise] ?? 0) + montant < 0) return { erreur: true, contenu: `${acteur.name} n'a que ${bourse[devise] ?? 0} ${devise}.` };
      bourse[devise] = (bourse[devise] ?? 0) + montant;
      await acteur.update(sys.majBourse(bourse));
      return { contenu: `${acteur.name} : ${montant > 0 ? "+" : ""}${montant} ${devise} (${raison}) ; il a maintenant ${bourse[devise]} ${devise}.` };
    }
  },
  {
    nom: "donner_objets",
    systemes: ["impmal", "dnd5e"],
    description: "Donne des objets à un personnage (butin, récompense, achat chez un marchand). Prix > 0 : il paie (refusé s'il n'a pas "
      + "assez). Les uuid se trouvent avec chercher_compendium ; un objet du monde se donne aussi par son uuid.",
    schema: objet({
      personnage: chaine("Nom du personnage."),
      objets: { type: "array", items: objet({ uuid: chaine("uuid de l'objet."), quantite: entier("Quantité (1 en général).") }), description: "Objets donnés." },
      prix: entier("Prix total à payer (0 = cadeau, butin)."),
      devise: chaine("Devise du prix (solars, gp…) ; vide si gratuit.")
    }),
    sensible: false,
    async executer({ personnage, objets, prix, devise }) {
      const sys = adaptateur();
      const acteur = await trouverActeur(personnage);
      if (!acteur) return { erreur: true, contenu: `Personnage introuvable : ${personnage}.` };
      const donnees = [];
      for (const o of objets) {
        const d = await fromUuid(o.uuid).catch(() => null);
        if (d?.documentName !== "Item") return { erreur: true, contenu: `Objet introuvable : ${o.uuid}.` };
        const copie = d.pack ? game.items.fromCompendium(d) : d.toObject();
        delete copie._id;
        if (o.quantite > 1 && copie.system && "quantity" in copie.system) copie.system.quantity = (copie.system.quantity ?? 1) * o.quantite;
        donnees.push(copie);
      }
      if (prix > 0) {
        if (!sys.devises.includes(devise)) return { erreur: true, contenu: `Devise inconnue : ${devise}.` };
        const bourse = sys.bourse(acteur);
        if ((bourse[devise] ?? 0) < prix) return { erreur: true, contenu: `${acteur.name} n'a que ${bourse[devise] ?? 0} ${devise} pour ${prix}.` };
        bourse[devise] -= prix;
        await acteur.update(sys.majBourse(bourse));
      }
      const crees = await acteur.createEmbeddedDocuments("Item", donnees, { skipRequirement: true });
      return { contenu: `${acteur.name} reçoit : ${crees.map(i => i.name).join(", ")}${prix > 0 ? ` pour ${prix} ${devise}` : ""}.` };
    }
  },
  {
    nom: "retirer_objet",
    systemes: ["impmal", "dnd5e"],
    description: "Retire un objet de la fiche d'un personnage (perdu, volé, consommé, vendu, donné à un PNJ).",
    schema: objet({
      personnage: chaine("Nom du personnage."),
      objet: chaine("Nom de l'objet sur sa fiche."),
      quantite: entier("Quantité retirée (0 = tout).")
    }),
    sensible: true,
    async executer({ personnage, objet: nomObjet, quantite }) {
      const acteur = await trouverActeur(personnage);
      if (!acteur) return { erreur: true, contenu: `Personnage introuvable : ${personnage}.` };
      const n = nomObjet.trim().toLowerCase();
      const item = acteur.items.find(i => i.name.toLowerCase() === n) ?? acteur.items.find(i => i.name.toLowerCase().includes(n));
      if (!item) return { erreur: true, contenu: `${acteur.name} n'a pas « ${nomObjet} ».` };
      const stock = item.system?.quantity;
      if (quantite > 0 && typeof stock === "number" && stock > quantite) {
        await item.update({ "system.quantity": stock - quantite });
        return { contenu: `${acteur.name} : ${item.name} ${stock} → ${stock - quantite}.` };
      }
      await item.delete();
      return { contenu: `${item.name} retiré de la fiche de ${acteur.name}.` };
    }
  },
  {
    nom: "message_prive",
    description: "Message SECRET à un seul joueur (et au MJ) : ce que lui seul voit, entend, devine, rêve ; une vision, un murmure, un "
      + "indice personnel. Les autres joueurs ne le voient pas.",
    schema: objet({
      joueur: chaine("Nom du joueur ou de son personnage."),
      texte: chaine("Le message (gras, italique permis).")
    }),
    sensible: false,
    async executer({ joueur, texte }) {
      const utilisateur = trouverJoueur(joueur);
      // Un compagnon IA : le message rejoint ce qu'il sait en privé (chez le MJ actif), rien ne paraît au chat.
      const compagnon = utilisateur ? null : trouverCompagnon(joueur);
      if (compagnon) {
        const villageoisCompagnon = compagnon.type === "villageois" && game.lakourLoups;
        if (villageoisCompagnon) await game.lakourLoups.envoyerSecret(compagnon.id, { texte, titre: aliasMJ() });
        else await noterPrive(compagnon.id, `Le meneur te dit en privé : ${texte}`);
        return { contenu: `Message secret gardé par le compagnon ${compagnon.name} (lui seul le sait).` };
      }
      if (!utilisateur) return { erreur: true, contenu: `Joueur introuvable : ${joueur}.` };
      // Aux Veillées : le carnet secret du système (envoyé au seul joueur, jamais dans les documents du chat que chaque
      // navigateur reçoit), plutôt qu'un chuchotement lisible dans la console.
      const villageois = game.lakourLoups?.villageois().find(a => a.system.joueur === utilisateur.id);
      if (villageois) {
        await game.lakourLoups.envoyerSecret(villageois.id, { texte, titre: aliasMJ() });
        return { contenu: `Message secret remis dans le carnet de ${utilisateur.name}.` };
      }
      await ChatMessage.implementation.create({
        content: versHTML(texte), speaker: { alias: aliasMJ() },
        whisper: [utilisateur.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
        flags: { [ID]: { ia: true, prive: true } }
      });
      return { contenu: `Message secret envoyé à ${utilisateur.name}.` };
    }
  },
  {
    nom: "ecrire_chronique",
    // Aux Veillées, pas pendant une partie en cours (outilsDuSysteme ; refus en garde ci-dessous) : la partie se raconte au chat.
    horsPartieLoups: true,
    description: "Ajoute une entrée à la chronique de campagne, journal que TOUS les joueurs peuvent lire : résumé de séance (« Précédemment… »), "
      + "fait marquant, PNJ rencontré. Écris-le pour les joueurs : sans les secrets du MJ.",
    schema: objet({
      titre: chaine("Titre de l'entrée (ex. « Séance du 31 octobre — Le marché des Sept-Puits »)."),
      texte: chaine("Le récit (gras, italique, listes permis).")
    }),
    sensible: false,
    async executer({ titre, texte }) {
      if (partieLoupsEnCoursIci()) {
        return { erreur: true, contenu: "Pas pendant une partie des Veillées : la chronique est un journal lisible de tous. Raconte au chat ; "
          + "les Chroniques de Brumecombe gardent la veillée à sa fin." };
      }
      const nom = "Chronique de campagne";
      const journal = game.journal.find(j => j.getFlag(ID, "chronique")) ?? await JournalEntry.implementation.create({
        name: nom, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }, flags: { [ID]: { chronique: true } }
      });
      const sort = Math.max(0, ...journal.pages.map(p => p.sort)) + 100;
      await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: titre, type: "text", sort, text: { content: versHTML(texte) } }]);
      return { contenu: `Entrée « ${titre} » ajoutée à la chronique (${journal.pages.size} entrées).` };
    }
  },
  {
    nom: "ambiance_sonore",
    description: "Lance pour tous une ambiance sonore en boucle (remplace la précédente) ou coupe tout (« aucune ») : vent, pluie, orage, "
      + "feu (camp, âtre), grotte (souterrain, égout), mer, foule (taverne, marché), forge (machines, manufactorum), nuit (campagne calme), "
      + "tension (suspense, horreur). Change-la quand le lieu ou l'ambiance change.",
    schema: objet({
      ambiance: { type: "string", enum: ["aucune", ...AMBIANCES], description: "Ambiance voulue." },
      volume: { type: "number", description: "Volume de 0,05 à 0,6 (0,3 en général : la voix du narrateur doit rester devant ; elle baisse d'elle-même l'ambiance quand il parle)." }
    }),
    sensible: false,
    async executer({ ambiance, volume }) {
      let playlist = game.playlists.find(p => p.getFlag(ID, "ambiances"));
      if (ambiance === "aucune") {
        if (playlist) await playlist.stopAll();
        return { contenu: "Ambiance sonore coupée." };
      }
      const index = await (await fetch(foundry.utils.getRoute(`modules/${ID}/assets/sons/index.json`), { cache: "no-store" })).json().catch(() => ({}));
      const son = index[ambiance];
      if (!son) return { erreur: true, contenu: `Ambiance indisponible : ${ambiance}.` };
      playlist ??= await Playlist.implementation.create({ name: NOM_PLAYLIST, mode: CONST.PLAYLIST_MODES.DISABLED, flags: { [ID]: { ambiances: true } } });
      let piste = playlist.sounds.find(s => s.getFlag(ID, "ambiance") === ambiance);
      if (!piste) [piste] = await playlist.createEmbeddedDocuments("PlaylistSound", [{ name: son.libelle, path: son.fichier, repeat: true, fade: 2000, flags: { [ID]: { ambiance } } }]);
      for (const autre of playlist.sounds.filter(s => s.playing && s.id !== piste.id)) await autre.update({ playing: false });
      await piste.update({ playing: true, volume: volumeAmbiance(volume) });
      return { contenu: `Ambiance « ${son.libelle} » lancée pour tous.` };
    }
  }
);

// ---------------------------------------------------------------- Narrateur des « Veillées de Brumecombe » (système lakour-loups)
// Ces outils appellent l'API du système (game.lakourLoups, docs/loups-contrat.md) ; le contenu (rôles, compositions) vient du
// module lakour-veillees.
const LOUPS = ["lakour-loups"];
const apiLoups = () => {
  const api = game.lakourLoups;
  if (!api) throw new Error("Le système lakour-loups n'est pas chargé dans ce monde.");
  return api;
};
const nomActeur = id => game.actors.get(id)?.name ?? id;
// Villageois par nom (vivants d'abord) -> id.
function idVillageois(nom) {
  const n = nom.trim().toLowerCase();
  const liste = apiLoups().villageois();
  const trouve = liste.find(a => a.name.toLowerCase() === n) ?? liste.find(a => a.name.toLowerCase().includes(n))
    ?? liste.find(a => game.users.get(a.system.joueur)?.name.toLowerCase() === n);
  return trouve?.id ?? null;
}
const vivants = () => apiLoups().villageois().filter(a => a.system.vivant);

// Compositions, équilibre et rôles du module de contenu : clé -> uuid du compendium, et clé -> nom (pour parler aux joueurs).
async function contenuVeillees() {
  const json = async f => (await fetch(foundry.utils.getRoute(`modules/lakour-veillees/assets/${f}`), { cache: "no-store" })).json();
  const [compositions, equilibre] = await Promise.all([json("compositions.json"), json("equilibre.json").catch(() => ({ roles: {}, batiments: {} }))]);
  // Index en tableau d'entrées (une Collection de Foundry s'itère par valeurs, une Map par paires : on prend les valeurs).
  const index = async nom => {
    const idx = await game.packs.get(`lakour-veillees.${nom}`)?.getIndex({ fields: ["system.cle"] });
    return idx ? [...(typeof idx.values === "function" ? idx.values() : idx)] : [];
  };
  const [ir, im, ib] = await Promise.all([index("roles"), index("metiers"), index("batiments")]);
  const parCle = idx => new Map(idx.map(e => [e.system?.cle, e.uuid]));
  const noms = new Map([...ir, ...ib].map(e => [e.system?.cle, e.name]));
  return { compositions, equilibre, roles: parCle(ir), metiers: parCle(im), batiments: parCle(ib), noms };
}

// Clé d'un rôle donné par sa clé ou par son nom (« Liseuse de cendres », « liseuse »).
export function cleDeRole(texte, noms) {
  const t = texte.trim().toLowerCase();
  if (noms.has(t)) return t;
  const parNom = [...noms].find(([, n]) => n.toLowerCase() === t) ?? [...noms].find(([cle, n]) => n.toLowerCase().includes(t) || cle.includes(t));
  return parNom?.[0] ?? null;
}

// Présentation d'une composition : rôles groupés par camp, avec leur nombre (sans dire qui a quoi). Pour le narrateur SEUL :
// la composition n'est jamais annoncée aux joueurs.
export function annoncerComposition(roles, equilibre, noms) {
  const parCamp = { meute: [], village: [], solitaire: [] };
  const comptes = new Map();
  for (const cle of roles) comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  for (const [cle, n] of comptes) (parCamp[equilibre.roles?.[cle]?.camp ?? "village"] ??= []).push(`${noms.get(cle) ?? cle}${n > 1 ? ` ×${n}` : ""}`);
  return [`Meute : ${parCamp.meute.join(", ") || "—"}`, `Village : ${parCamp.village.join(", ") || "—"}`,
    parCamp.solitaire.length ? `Solitaires : ${parCamp.solitaire.join(", ")}` : ""].filter(Boolean).join(" ; ");
}

// Composition choisie ou, à défaut, la première du niveau voulu qui accepte ce nombre de joueurs.
export function choisirComposition(compositions, nombre, { cle = "", niveau = "classique" } = {}) {
  if (cle) return compositions[cle] ? { cle, ...compositions[cle] } : null;
  const possibles = Object.entries(compositions).filter(([, c]) => nombre >= c.joueurs[0] && nombre <= c.joueurs[1]);
  const [choix] = possibles.filter(([, c]) => c.niveau === niveau).concat(possibles);
  return choix ? { cle: choix[0], ...choix[1] } : null;
}

// Rôles d'une composition pour n joueurs : la liste, coupée ou complétée de « villageois ».
export function rolesPour(composition, nombre) {
  const roles = composition.roles.slice(0, nombre);
  while (roles.length < nombre) roles.push("villageois");
  return roles;
}

// Joueurs d'une partie : ceux nommés, sinon tous les connectés hors MJ.
const joueursDeLaPartie = noms => (noms.length ? noms.map(n => trouverJoueur(n)) : game.users.filter(u => u.active && !u.isGM));

// Génère une composition équilibrée et variée (générateur du système, poids du contenu, historique des parties).
// peste : une composition de peste noire (aucun rôle de la meute).
async function genererComposition(contenu, nombre, { niveau, inclure = [], exclure = [], peste = false }) {
  const logique = apiLoups().logique;
  const historique = historiqueDesParties();
  return logique.composer(nombre, contenu.equilibre, { niveau, inclure, exclure, historique, ...(peste ? { peste: true } : {}) });
}

// ---------------------------------------------------------------- la peste noire (variante rare, docs/loups-contrat.md)
// Une partie que l'IA compose elle-même (loups_composer, loups_distribuer auto, loups_rejouer) devient une peste noire avec la
// chance du système (réglage caché « chancePeste ») ; « oui » / « non » la décident. La dernière composition de peste proposée
// par loups_composer est retenue : distribuée telle quelle (loups_distribuer, mode roles), elle reste une peste noire.
let propositionPeste = null;   // [cle] triées
export function tirerPesteIA(api = apiLoups()) {
  const L = api?.logique;
  if (typeof L?.tirerPeste !== "function") return false;
  const chance = typeof api.chancePeste === "function" ? api.chancePeste() : L.CHANCE_PESTE;
  return L.tirerPeste({ chance });
}
const pesteVoulue = choix => (choix === "oui" ? true : choix === "non" ? false : undefined);
const memesRoles = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sansMeute = (roles, equilibre) => roles.map(c => (equilibre.roles?.[c]?.camp === "meute" ? "villageois" : c));
const PESTE_CHOIX = { type: "string", enum: ["", "oui", "non"],
  description: "Peste noire (aucun loup) : « oui » si les joueurs ou le MJ la veulent, « non » pour l'exclure ; vide (par défaut) : le hasard en décide, très rarement." };
// Le vainqueur d'une partie, pour le narrateur.
// Le nom du rôle de passage d'un arrivant (le résumé du système donne la clé).
const contenuNomRole = r => roleLoups(game.actors.get(r.acteurId))?.name ?? r.cle;
const nomVainqueur = v => (v === "village" || v === "meute" ? v : v === "peste" ? "la peste noire"
  : v === "brume" ? "la brume (Saint-Martin : un innocent pendu, personne ne gagne)" : nomActeur(v));
const NOTE_PESTE = "PESTE NOIRE (secret absolu, ne la nomme jamais et n'y fais aucune allusion avant la fin) : aucun loup. Chaque nuit, "
  + "la peste emporte un villageois, raconté exactement comme une victime de la meute ; la première nuit, c'est toi qui choisis sa "
  + "victime (loups_nuit, peste_victime), ensuite sa dernière victime la désigne. Si quelqu'un crie « C'est la peste noire ! » : loups_peste.";

OUTILS.push(
  {
    nom: "loups_composer",
    systemes: LOUPS,
    description: "Prépare EN SECRET une composition ÉQUILIBRÉE pour le nombre de joueurs : nombre de loups, rôles de village, solitaires, "
      + "bâtiments. Elle change d'une partie à l'autre (les rôles récents sont évités) et suit le niveau ; on peut imposer ou exclure des rôles. "
      + "Très rarement, c'est une PESTE NOIRE (aucun loup). Rien n'est distribué, et la composition ne s'annonce JAMAIS aux joueurs (ni les "
      + "rôles en jeu, ni le nombre de loups) : ensuite, loups_distribuer avec mode « roles » et ces clés.",
    schema: objet({
      nombre_joueurs: entier("Nombre de joueurs (0 = les joueurs connectés)."),
      niveau: { type: "string", enum: ["debutants", "classique", "chaos"], description: "Niveau de complexité." },
      inclure: { type: "array", items: chaine("Rôle voulu (nom ou clé)."), description: "Rôles à mettre absolument." },
      exclure: { type: "array", items: chaine("Rôle refusé (nom ou clé)."), description: "Rôles à ne pas mettre." },
      peste: PESTE_CHOIX
    }),
    sensible: false,
    async executer({ nombre_joueurs, niveau, inclure, exclure, peste = "" }) {
      const contenu = await contenuVeillees();
      const nombre = nombre_joueurs > 0 ? nombre_joueurs : joueursDeLaPartie([]).length;
      const cles = liste => liste.map(t => [t, cleDeRole(t, contenu.noms)]);
      const inconnus = [...cles(inclure), ...cles(exclure)].filter(([, c]) => !c).map(([t]) => t);
      if (inconnus.length) return { erreur: true, contenu: `Rôles inconnus : ${inconnus.join(", ")}.` };
      const enPeste = pesteVoulue(peste) ?? tirerPesteIA();
      let c;
      try { c = await genererComposition(contenu, nombre, { niveau, inclure: cles(inclure).map(x => x[1]), exclure: cles(exclure).map(x => x[1]), peste: enPeste }); }
      catch (e) { return { erreur: true, contenu: e.message }; }
      propositionPeste = enPeste ? [...c.roles].sort() : null;
      return { contenu: `Composition préparée pour ${nombre} joueurs (${niveau}, ${c.verdict}, équilibre ${c.somme >= 0 ? "+" : ""}${c.somme}) — `
        + "pour toi seul, ne l'annonce pas aux joueurs :\n"
        + `${annoncerComposition(c.roles, contenu.equilibre, contenu.noms)}\n`
        + (enPeste ? `${NOTE_PESTE}\n` : "")
        + `Bâtiments : ${c.batiments.map(b => contenu.noms.get(b) ?? b).join(", ")}.\n`
        + `Clés pour loups_distribuer (mode roles) : roles = ${JSON.stringify(c.roles)}, batiments = ${JSON.stringify(c.batiments)}`
        + `${enPeste ? ", peste = « oui »" : ""}.` };
    }
  },
  {
    nom: "loups_distribuer",
    systemes: LOUPS,
    description: "Prépare une partie et distribue les rôles en secret (chaque joueur reçoit le sien en privé), avec métiers publics, maisons et "
      + "bâtiments. mode « auto » (par défaut) : composition ÉQUILIBRÉE générée pour ce nombre de joueurs, différente des dernières parties. "
      + "mode « roles » : la liste exacte choisie (par les joueurs, ou issue de loups_composer). mode « composition » : une composition prête "
      + "du module. Une partie composée d'elle-même (auto) devient très rarement une PESTE NOIRE (aucun loup ; « peste » la décide). "
      + "Le Somnambule et la Rosière ne sortent jamais d'un tirage : seulement si on les demande (roles, ou inclure en mode auto). "
      + "Ensuite : présente le village et les bâtiments en jeu, SANS annoncer la composition (ni rôles en jeu, ni nombre de loups), puis "
      + "la première nuit (loups_nuit).",
    schema: objet({
      joueurs: { type: "array", items: chaine("Nom d'un joueur Foundry."), description: "Joueurs de la partie ; vide = tous les joueurs connectés (hors MJ)." },
      mode: { type: "string", enum: ["auto", "roles", "composition"], description: "Comment choisir les rôles." },
      niveau: { type: "string", enum: ["debutants", "classique", "chaos"], description: "Niveau (modes auto et composition)." },
      roles: { type: "array", items: chaine("Rôle (nom ou clé)."), description: "Mode roles : autant de rôles que de joueurs (complétés par des villageois)." },
      batiments: { type: "array", items: chaine("Bâtiment (clé)."), description: "Mode roles : bâtiments voulus (vide = tirés au hasard selon le niveau)." },
      inclure: { type: "array", items: chaine("Rôle voulu."), description: "Mode auto : rôles à mettre absolument." },
      exclure: { type: "array", items: chaine("Rôle refusé."), description: "Mode auto : rôles à ne pas mettre." },
      composition: chaine("Mode composition : clé d'une composition prête (vide = celle du niveau)."),
      compagnons: entier("Places tenues par des compagnons IA (villageois sans joueur, noms tirés de la table du village, personnalité au "
        + "hasard), en plus des joueurs : ils choisissent la nuit, parlent au débat et votent seuls. 0 = aucun."),
      peste: PESTE_CHOIX,
      glas: entier("Glas final (public, annoncé au chat) : la partie s'arrête au soir de ce jour (après son vote d'exécution) ; 0 = jamais."),
      format: { type: "string", enum: ["", "saint-martin"], description: "« saint-martin » : la Nuit de la Saint-Martin (un jour, un vote ; "
        + "trois rôles sous l'autel, SECRETS) ; vide = une veillée ordinaire." },
    }),
    sensible: true,
    async executer({ joueurs, mode, niveau, roles = [], batiments: batimentsVoulus = [], inclure = [], exclure = [], composition = "", compagnons = 0, peste = "", glas = 0, format = "" }) {
      const api = apiLoups();
      // Une composition nommée sans mode : c'est le mode « composition » ; sinon la génération équilibrée.
      mode ||= composition ? "composition" : "auto";
      niveau ||= "classique";
      const utilisateurs = joueursDeLaPartie(joueurs);
      if (utilisateurs.some(u => !u)) return { erreur: true, contenu: `Joueur introuvable parmi : ${joueurs.join(", ")}.` };
      const nbCompagnons = Math.max(0, Math.min(18, Math.floor(Number(compagnons) || 0)));
      const total = utilisateurs.length + nbCompagnons;
      if (total < 4) return { erreur: true, contenu: `Il faut au moins 4 joueurs, compagnons IA compris (${total} ici).` };
      if (total > 18) return { erreur: true, contenu: `18 places au plus (${total} demandées).` };
      const contenu = await contenuVeillees();
      const enCles = liste => liste.map(t => cleDeRole(t, contenu.noms));
      let compo;
      // La peste noire : voulue (« oui »), exclue (« non ») ; sinon, la composition de peste proposée par loups_composer, ou, en
      // mode auto, le hasard (très rarement).
      let enPeste = pesteVoulue(peste);
      // La Nuit de la Saint-Martin (système 0.8.0) : sa propre composition (le générateur du système), trois rôles sous l'autel.
      if (format === "saint-martin") {
        if (typeof api.logique?.composerSaintMartin !== "function") return { erreur: true, contenu: "Ce système des Veillées ne connaît pas la Saint-Martin (il faut lakour-loups 0.8.0 ou plus)." };
        const sm = api.logique.composerSaintMartin(total, { disponibles: [...contenu.roles.keys()] });
        compo = { cle: "saint-martin", libelle: "Nuit de la Saint-Martin", roles: sm.joueurs, batiments: [], autel: sm.autel };
        enPeste = false;
      } else if (mode === "roles") {
        const cles = enCles(roles);
        if (cles.some(c => !c)) return { erreur: true, contenu: `Rôles inconnus : ${roles.filter((_, i) => !cles[i]).join(", ")}.` };
        if (cles.length > total) return { erreur: true, contenu: `${cles.length} rôles pour ${total} joueurs : retire-en.` };
        enPeste ??= Boolean(propositionPeste && memesRoles(rolesPour({ roles: cles }, total), propositionPeste));
        const tires = batimentsVoulus.length ? batimentsVoulus : (await genererComposition(contenu, total, { niveau, inclure: cles.filter(c => c !== "villageois" && c !== "loup-de-brumecombe") })).batiments;
        compo = { cle: "choisie", libelle: "composition choisie", roles: enPeste ? sansMeute(cles, contenu.equilibre) : cles, batiments: tires };
      } else if (mode === "composition") {
        compo = choisirComposition(contenu.compositions, total, { cle: composition, niveau });
        if (!compo) return { erreur: true, contenu: `Aucune composition pour ${total} joueurs (${Object.keys(contenu.compositions).join(", ")}).` };
        if (enPeste) compo = { ...compo, roles: sansMeute(compo.roles, contenu.equilibre) };
      } else {
        const ci = enCles(inclure), ce = enCles(exclure);
        if ([...ci, ...ce].some(c => !c)) return { erreur: true, contenu: `Rôles inconnus parmi : ${[...inclure, ...exclure].join(", ")}.` };
        enPeste ??= tirerPesteIA(api);
        try {
          const g = await genererComposition(contenu, total, { niveau, inclure: ci, exclure: ce, peste: enPeste });
          compo = { cle: "generee", libelle: `générée, ${g.verdict} (${g.somme >= 0 ? "+" : ""}${g.somme})`, roles: g.roles, batiments: g.batiments };
        } catch (e) { return { erreur: true, contenu: e.message }; }
      }
      enPeste = Boolean(enPeste);
      propositionPeste = null;
      const cles = rolesPour(compo, total);
      const inconnus = cles.filter(c => !contenu.roles.has(c));
      if (inconnus.length) return { erreur: true, contenu: `Rôles absents du compendium : ${inconnus.join(", ")}.` };
      // Un métier par joueur : s'il y a plus de joueurs que de métiers, la liste est reprise (deux forgerons, etc.).
      const tousMetiers = [...contenu.metiers.values()];
      const metiers = tousMetiers.length ? Array.from({ length: total }, (_, i) => tousMetiers[i % tousMetiers.length]) : [];
      const batiments = (compo.batiments ?? []).map(c => contenu.batiments.get(c)).filter(Boolean);
      // Les maisons couvrent les deux rives (Maison 13 à 18 au-delà du Pont), quelle que soit la taille du village.
      const maisons = api.logique.maisonsDuVillage?.(total) ?? Array.from({ length: total }, (_, i) => `Maison ${i + 1}`);
      // Les compagnons : des noms du village (table « Noms de villageois »), jamais celui d'un joueur.
      const exclus = [...utilisateurs.map(u => u.name), ...api.villageois().filter(a => !a.system.compagnon).map(a => a.name)];
      const nomsCompagnons = nbCompagnons ? await nomsPourCompagnons(nbCompagnons, { exclus }) : [];
      const resultat = await api.distribuer({
        roles: cles.map(c => contenu.roles.get(c)), metiers, joueurs: utilisateurs.map(u => u.id), compagnons: nomsCompagnons,
        maisons, composition: compo.cle, batiments, ...(enPeste ? { peste: true } : {}), ...(glas > 0 ? { glas: Math.floor(glas) } : {}),
        ...(compo.autel ? { format: "saint-martin", autel: compo.autel } : {})
      });
      // Une personnalité au hasard pour chaque compagnon (drapeau du MJ IA : rien de secret).
      for (const r of resultat.filter(x => x.compagnon)) {
        await game.actors.get(r.acteurId)?.update({ [`flags.${ID}.compagnon`]: personnaliteAuHasard(`${r.acteurId}|${Math.random()}`) });
      }
      const nomRole = id => roleLoups(game.actors.get(id))?.name ?? "?";
      // La composition n'entre à l'historique (réglage monde, livré à tous) qu'à la fin de la partie : le MJ la garde d'ici là.
      await retenirComposition({ roles: cles, batiments: compo.batiments ?? [] });
      // Une nouvelle partie : après ce tour, le fil de la précédente est archivé et un fil neuf commence (moteur.nouvellePartie).
      game.modules?.get(ID)?.api?.moteur?.nouvellePartie({ ouverture: false });
      // Pour toi seul (narrateur) : qui est qui, et la composition. Rien de tout cela ne s'annonce aux joueurs.
      return { contenu: `Partie prête, composition « ${compo.libelle ?? compo.cle} » (${total} joueurs${nbCompagnons ? `, dont ${nbCompagnons} compagnons IA` : ""}).\n`
        + `Composition, pour toi seul (ne l'annonce JAMAIS, ni le nombre de loups) : ${annoncerComposition(cles, contenu.equilibre, contenu.noms)}.\n`
        + (enPeste ? `${NOTE_PESTE}\n` : "")
        + resultat.map(r => `- ${nomActeur(r.acteurId)} (${r.compagnon ? "compagnon IA" : game.users.get(r.userId)?.name}) : ${nomRole(r.acteurId)}`).join("\n")
        + (nbCompagnons ? "\nLes compagnons IA jouent seuls (choix de nuit, débat, vote) et ne savent que ce que sait leur villageois : "
          + "traite-les comme des joueurs, ne leur souffle rien." : "")
        + `\nBâtiments en jeu : ${batiments.map(u => fromUuidSync(u)?.name).filter(Boolean).join(", ") || "aucun"}. Ne révèle aucun rôle.`
        + (glas > 0 ? `\nGlas final : la partie s'arrêtera au soir du jour ${Math.floor(glas)} (annoncé au chat).` : "")
        + (compo.autel ? `\nNuit de la Saint-Martin : un seul jour, un seul vote. Sous l'autel (SECRET, ne les nomme jamais) : ${compo.autel.map(c => contenu.noms.get(c) ?? c).join(", ")}.` : "") };
    }
  },
  {
    nom: "loups_rejouer",
    systemes: LOUPS,
    description: "Rejoue une partie avec les mêmes joueurs et le même nombre de compagnons ; nouvelle composition équilibrée (très rarement "
      + "une peste noire), sauf si des rôles sont donnés (ou une composition prête ; le Somnambule et la Rosière seulement ainsi). À proposer en fin de partie (« une autre partie avec les mêmes joueurs ? »), "
      + "seulement si les joueurs le veulent. La partie précédente est archivée et la nouvelle s'ouvre dans un fil NEUF, où tu présenteras "
      + "le village : après l'outil, dis seulement une phrase de transition.",
    schema: objet({
      niveau: { type: "string", enum: ["", "debutants", "classique", "chaos"], description: "Niveau ; vide = celui de la partie précédente." },
      roles: { type: "array", items: chaine("Rôle (nom ou clé)."), description: "Rôles voulus (vide = composition équilibrée générée)." },
      composition: chaine("Clé d'une composition prête (vide = aucune)."),
      peste: PESTE_CHOIX,
      glas: entier("Glas final (public, annoncé au chat) : la partie s'arrête au soir de ce jour (après son vote d'exécution) ; 0 = jamais."),
      format: { type: "string", enum: ["", "ordinaire", "saint-martin"], description: "« saint-martin » : la Nuit de la Saint-Martin (un jour, "
        + "un vote ; trois rôles sous l'autel, SECRETS) ; « ordinaire » : une veillée ordinaire ; vide = le format de la partie précédente." },
    }),
    sensible: true,
    async executer({ niveau = "", roles = [], composition = "", peste = "", glas = 0, format = "" }) {
      // Le format : vide = celui de la partie précédente (le système le garde) ; « ordinaire » = une veillée ordinaire.
      const formatVoulu = format === "saint-martin" ? { format } : format === "ordinaire" ? { format: "" } : {};
      const api = apiLoups();
      if (typeof api?.nouvellePartie !== "function") return { erreur: true, contenu: "Le système lakour-loups de ce monde ne sait pas rejouer une partie : mets-le à jour." };
      let r;
      // Sans choix, le système tire lui-même la peste noire (très rarement) pour une composition générée.
      const voulue = pesteVoulue(peste);
      // La partie précédente, si le MJ IA l'avait distribuée, est finie ou abandonnée : sa composition entre à l'historique.
      await consignerComposition();
      try {
        r = await api.nouvellePartie({ memesJoueurs: true, niveau, roles, composition, ...(voulue !== undefined ? { peste: voulue } : {}),
          ...(glas > 0 ? { glas: Math.floor(glas) } : {}), ...formatVoulu });
      }
      catch (e) { return { erreur: true, contenu: e.message }; }
      const c = r?.composition ?? {};
      // Le système (0.7.0) garde lui-même la composition de nouvellePartie dans les secrets du MJ jusqu'à la fin (réglage
      // « lakour-loups.historique ») ; un système plus ancien ne le fait pas : le MJ IA la retient alors, sans la publier.
      const systemeConsigne = Boolean(game.settings.settings?.has?.("lakour-loups.historique"));
      if (c.roles?.length && !systemeConsigne) await retenirComposition({ roles: c.roles, batiments: c.batiments ?? [] });
      game.modules?.get(ID)?.api?.moteur?.nouvellePartie({ ouverture: true });
      return { contenu: `Nouvelle partie prête : ${r?.joueurs?.length ?? 0} joueurs et ${r?.compagnons?.length ?? 0} compagnons IA, composition « ${c.libelle ?? c.cle ?? "?"} » `
        + "(pour toi seul : ne l'annonce jamais). La partie précédente est archivée ; l'ouverture de la nouvelle (village, première nuit) "
        + "suit dans un fil neuf. Dis maintenant une seule phrase de transition, sans rien annoncer d'autre." };
    }
  },
  {
    nom: "loups_nuit",
    systemes: LOUPS,
    description: "Mène TOUTE la nuit : passe en phase nuit, réveille chaque rôle actif dans l'ordre (la meute ensemble) en lui demandant "
      + "son choix dans une fenêtre secrète, puis résout la nuit à l'aube (morts, protections, révélations, messages privés). "
      + "Peste noire (secret) : à la place de la meute, la peste frappe ; tant qu'elle n'a pas de porteur, c'est ta victime "
      + "(peste_victime) ; ensuite, son porteur la désigne en secret. "
      + "Raconte la tombée de la nuit AVANT d'appeler cet outil ; il peut durer plusieurs minutes. Ensuite, raconte l'aube.",
    schema: objet({
      delai_secondes: entier("Temps laissé à chaque rôle pour choisir (60 à 180 en général)."),
      peste_victime: chaine("Partie de peste noire seulement, sans porteur encore (la première nuit) : le villageois que la peste frappe, "
        + "choisi par toi ; « hasard » ou vide : au hasard. Partie ordinaire : laisse vide.")
    }),
    sensible: false,
    async executer({ delai_secondes, peste_victime = "" }) {
      const api = apiLoups();
      const delai = Math.min(600, Math.max(20, delai_secondes || 90)) * 1000;
      const finie = () => { const e = api.etat(); return e.vainqueur || e.phase === "fin" ? e : null; };
      if (finie()) return { erreur: true, contenu: `La partie est finie (victoire : ${nomVainqueur(finie().vainqueur)}) : pas de nuit. Raconte le dénouement.` };
      await api.changerPhase("nuit");
      // Le Glas final (système 0.7.0) : la nuit du jour N ne tombe pas, la partie s'arrête au soir et le système a tranché.
      if (finie()) {
        const sm = finie().format === "saint-martin";
        return { contenu: `${sm ? "La Nuit de la Saint-Martin s'achève" : "Le Glas final a sonné"} : la partie s'arrête ce soir, sans nuit. `
          + `VICTOIRE : ${nomVainqueur(finie().vainqueur)}. Raconte le dénouement : dis que ${sm ? "la Saint-Martin" : "le glas"} a mis fin à la veillée.` };
      }
      const journal = [];
      const proies = [];   // attaqués par la meute (et les loups qui tuent seuls) cette nuit
      for (const { roleCle, acteurIds } of api.ordreDeNuit()) {
        // La peste noire : le système demande au porteur (ou prend ta victime, ou le hasard) et note l'action.
        // Le Glas du deuil (système 0.8.0) : la vision de la meute, demandée par le système comme une chasse.
        if (roleCle === "deuil") {
          const r = await api.reveiller("deuil", { delai });
          journal.push(`la vision du deuil (meute) → ${(r?.cibles ?? []).map(nomActeur).join(", ") || "personne"}`);
          continue;
        }
        if (roleCle === "peste") {
          const voulue = String(peste_victime ?? "").trim();
          const cible = voulue && !/^(au )?hasard$/i.test(voulue) ? idVillageois(voulue) ?? "" : "";
          const r = await api.reveiller("peste", { delai, cible });
          proies.push(...r.cibles.filter(id => !proies.includes(id)));
          journal.push(`la peste (${acteurIds.length ? `porteur ${nomActeur(acteurIds[0])}` : "ton choix"}) → ${r.cibles.map(nomActeur).join(", ") || "personne"}${r.hasard ? " (au hasard)" : ""}`);
          continue;
        }
        // Les effets du jour comptent : ni les joueurs hors d'atteinte (Passeur, Grange), ni l'asile de la Chapelle pour la
        // meute, ni l'autre rive quand le Pont est bloqué ; un joueur gardé à l'œil ne vise que sa maison.
        const base = api.candidatsDeNuit ? api.candidatsDeNuit({ acteurId: acteurIds[0], roleCle }) : vivants().map(a => a.id);
        let candidats = base;
        const roles = acteurIds.map(id => roleLoups(game.actors.get(id)));
        // La meute chasse avec l'invite d'un loup qui chasse avec elle (ordre 40), pas celle du premier venu
        // (Louve mère, Loup affamé, villageois mordu…) ; à défaut, l'invite du système.
        const role = roleCle === "meute" ? roles.find(r => r?.system?.camp === "meute" && Number(r.system.nuit?.ordre) === 40) : roles[0];
        const effet = roleCle === "meute" ? "tuer" : role?.system?.effet ?? "";
        let invite = role?.system?.nuit?.invite || (roleCle === "meute" ? "" : `${role?.name ?? roleCle} : que fais-tu cette nuit ?`);
        const nombre = role?.system?.nuit?.cibles ?? 1;
        // Le Fossoyeur interroge une tombe : les morts ; la Louve mère mord la proie de la meute ; l'Herboriste apprend qui a été attaqué.
        if (effet === "voir-role-mort") candidats = base.length ? api.villageois().filter(a => !a.system.vivant).map(a => a.id) : [];
        if (effet === "mordre") candidats = candidats.filter(id => proies.includes(id));
        if (effet === "remede" && proies.length) invite = `Cette nuit, la meute a attaqué ${proies.map(nomActeur).join(", ")}. ${invite}`;
        let cibles;
        const meute = role?.system?.camp === "meute" && acteurIds.length > 1 || roleCle === "meute";
        // Deux porteurs d'un même rôle hors meute (un Somnambule qui rêve un rôle déjà en jeu, système 0.7.0) : chacun est réveillé,
        // avec ses propres candidats, et son choix noté à son nom.
        if (!meute && acteurIds.length > 1) {
          const choix = [];
          for (const id of acteurIds) {
            const siens = effet === "voir-role-mort" || effet === "mordre" ? candidats
              : api.candidatsDeNuit ? api.candidatsDeNuit({ acteurId: id, roleCle }) : candidats;
            const c = siens.length ? await api.demanderAction({ acteurId: id, invite, candidats: siens, nombre, delai }) : [];
            await api.noterAction({ acteurId: id, roleCle, cibles: c });
            choix.push(`${nomActeur(id)} → ${c.length ? c.map(nomActeur).join(", ") : "passe"}`);
          }
          journal.push(`${role?.name ?? roleCle} (${acteurIds.length} porteurs) : ${choix.join(" ; ")}`);
          continue;
        }
        if (!candidats.length) cibles = [];
        else if (meute) {
          cibles = await api.demanderActionMeute({ invite, candidats, delai });
        } else {
          cibles = await api.demanderAction({ acteurId: acteurIds[0], invite, candidats, nombre, delai });
        }
        if (effet === "tuer" && (roleCle === "meute" || role?.system?.camp === "meute")) proies.push(...cibles.filter(id => !proies.includes(id)));
        // Le Messager : l'expéditeur choisi écrit son mot dans une fenêtre ouverte chez lui seul ; le système le remet à l'aube.
        let texte = "";
        if (effet === "messager" && cibles.length === 2 && cibles[0] !== cibles[1] && api.demanderTexte) {
          texte = await api.demanderTexte({ acteurId: cibles[0], delai,
            invite: `Le Messager frappe à ta porte cette nuit : écris une phrase pour ${nomActeur(cibles[1])}. Il la lui remettra à l'aube, de ta part.` });
        }
        // La meute est notée une fois (par l'un des loups) ; un rôle seul, par lui-même.
        await api.noterAction({ acteurId: acteurIds[0], roleCle, cibles, ...(texte ? { texte } : {}) });
        journal.push(`${roleCle === "meute" ? "meute" : role?.name ?? roleCle} (${acteurIds.map(nomActeur).join(", ")}) → ${cibles.length ? cibles.map(nomActeur).join(", ") : "passe"}${texte ? ` (mot : « ${texte} »)` : ""}`);
      }
      await api.changerPhase("aube");
      // Le système applique l'aube (morts, révélations, bâtiments) ; ce que chaque rôle a appris est remis en SECRET au seul
      // joueur concerné (carnet secret, par le socket) : un chuchotement du chat serait livré à tous les navigateurs.
      const { morts = [], revelations = [], messages = [], sauves = [], narrateur = [], narration = [], enAttente = [], annonces = [], deuil = "" } = await api.resoudreNuit();
      for (const m of messages) {
        const acteurId = m.acteurId ?? m.destinataire;
        if (api.envoyerSecret) { await api.envoyerSecret(acteurId, m.texte); continue; }
        const utilisateur = game.users.get(game.actors.get(acteurId)?.system.joueur);
        if (!utilisateur) continue;
        await ChatMessage.implementation.create({ content: versHTML(m.texte), speaker: { alias: aliasMJ() },
          whisper: [utilisateur.id, ...game.users.filter(u => u.isGM).map(u => u.id)], flags: { [ID]: { ia: true, prive: true } } });
      }
      const vainqueur = await api.verifierVictoire();
      return { contenu: [
        "Nuit (secret, pour toi seul) :", ...journal.map(l => `- ${l}`),
        `Morts de la nuit : ${morts.map(nomActeur).join(", ") || "aucun"}.`,
        deuil ? `Glas du deuil (SECRET) : la meute a appris le camp de ${nomActeur(deuil)}. N'en dis rien.` : "",
        sauves.length ? `Sauvés cette nuit : ${sauves.map(x => nomActeur(x.acteurId ?? x)).join(", ")}.` : "",
        revelations.length ? `Révélés : ${revelations.map(x => nomActeur(x.acteurId ?? x)).join(", ")}.` : "",
        messages.length ? (api.envoyerSecret ? `${messages.length} message(s) secret(s) remis aux joueurs concernés (carnet secret).`
          : `${messages.length} message(s) privé(s) chuchoté(s) aux joueurs concernés.`) : "",
        annonces.length ? `Annoncé à tout le village (déjà au chat) : ${annonces.map(t => t.replace(/[.\s]+$/, "")).join(" ; ")}.` : "",
        narration.length ? `Pour toi : ${narration.map(t => t.replace(/[.\s]+$/, "")).join(" ; ")}.` : "",
        narrateur.length ? `À ARBITRER par toi : ${narrateur.map(n => `${nomActeur(n.acteurId)} — ${n.effet || "?"} → ${(n.cibles ?? []).map(nomActeur).join(", ") || "—"}`).join(" ; ")}.` : "",
        enAttente.length ? `En attente : ${enAttente.map(x => `${nomActeur(x.acteurId)} doit désigner qui il emporte (demande-le-lui, puis loups_eliminer)`).join(" ; ")}.` : "",
        vainqueur ? `VICTOIRE : ${nomVainqueur(vainqueur)}. Raconte le dénouement.`
          : "Raconte l'aube (les morts et leur sort, sans trahir qui a fait quoi), puis ouvre le débat du jour (les pouvoirs de jour : loups_jour)."
      ].filter(Boolean).join("\n") };
    }
  },
  {
    nom: "loups_vote",
    systemes: LOUPS,
    description: "Vote du village : ouvrir (chaque joueur vivant vote dans sa fenêtre, avec un minuteur ; les voix restent secrètes jusqu'à "
      + "la clôture) puis clore (décompte, élu ou égalité). Après la clôture, annonce le résultat puis loups_eliminer l'élu (ou applique la "
      + "règle d'égalité). objet « chapelle » : le village choisit qui dormira à l'abri de la Chapelle (l'élu y est mis d'office). "
      + "objet « bailli » : l'élection du Bailli (tous les vivants candidats), un jour sans Bailli vivant, AVANT le vote d'exécution ; ce "
      + "n'est pas une exécution. Le système compte double la voix du Bailli au vote d'exécution et lui fait trancher les égalités.",
    schema: objet({
      action: { type: "string", enum: ["ouvrir", "clore"], description: "Ouvrir ou clore le vote." },
      candidats: { type: "array", items: chaine("Nom d'un villageois."), description: "Pour ouvrir : candidats ; vide = tous les vivants." },
      duree_secondes: entier("Pour ouvrir : durée du vote (0 = sans minuteur)."),
      double: booleen("Pour ouvrir : vote double, deux villageois sont désignés (cloche du Sonneur)."),
      objet: { type: "string", enum: ["execution", "chapelle", "bailli", "exil"], description: "Pour ouvrir : vote d'exécution (par défaut ; "
        + "avec le Banc des accusés, le jugement du prochain accusé), asile de la Chapelle, élection du Bailli, ou exil d'un gens de passage." }
    }),
    sensible: false,
    async executer({ action, candidats = [], duree_secondes = 0, double, objet: sujet = "execution" }) {
      const api = apiLoups();
      const chapelle = sujet === "chapelle";
      // L'élection du Bailli (système 0.6.0 et plus) : tous les vivants candidats, sans changer de phase ; le système refuse avec
      // sa raison quand elle n'est pas permise (Bailli vivant, succession en cours, déjà faite…).
      if (action === "ouvrir" && sujet === "bailli") {
        if (typeof api.bailli !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Bailli (il faut lakour-loups 0.6.0 ou plus)." };
        try {
          await api.ouvrirVote({ objet: "bailli", duree: Math.max(0, duree_secondes) * 1000 });
        } catch (e) { return { erreur: true, contenu: `Élection impossible : ${e.message}` }; }
        return { contenu: `Élection du Bailli ouverte (tous les vivants${duree_secondes ? `, ${duree_secondes} s` : ""}). Rappelle l'enjeu en une phrase `
          + "(voix double au vote d'exécution, il tranche les égalités), puis clos-la (loups_vote clore)." };
      }
      // Un jour sans Bailli vivant, l'élection passe avant le vote d'exécution.
      if (action === "ouvrir" && sujet === "execution" && (() => { try { return api.bailli?.()?.election?.ok; } catch { return false; } })()) {
        return { erreur: true, contenu: "Pas de Bailli : élis-le d'abord (loups_vote ouvrir, objet « bailli »), puis ouvre le vote d'exécution." };
      }
      // L'exil (système 0.8.0) : les gens de passage encore là sont candidats ; l'élu part, sans mourir, son camp tu.
      if (action === "ouvrir" && sujet === "exil") {
        if (typeof api.gensDePassage !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de gens de passage (il faut lakour-loups 0.8.0 ou plus)." };
        try {
          await api.changerPhase("vote");
          await api.ouvrirVote({ objet: "exil", duree: Math.max(0, duree_secondes) * 1000 });
        } catch (e) { return { erreur: true, contenu: `Exil impossible : ${e.message}` }; }
        return { contenu: "Vote d'exil ouvert (les gens de passage encore là). Rappelle l'enjeu en une phrase, puis clos-le (loups_vote clore)." };
      }
      // Le Banc des accusés (système 0.8.0) : le vote d'exécution juge le prochain accusé, lui seul ; sans accusé, pas de vote.
      const banc = action === "ouvrir" && sujet === "execution" ? (() => { try { return api.banc?.(); } catch { return null; } })() : null;
      if (banc?.actif && !banc.prochain) {
        return { erreur: true, contenu: "Banc des accusés : personne n'est accusé (ou tous ont été jugés). Pas de vote d'exécution aujourd'hui : la nuit tombe (loups_nuit)." };
      }
      if (action === "ouvrir") {
        const ids = candidats.length ? candidats.map(idVillageois) : vivants().map(a => a.id);
        if (ids.some(i => !i)) return { erreur: true, contenu: `Candidat introuvable parmi : ${candidats.join(", ")}.` };
        if (chapelle && !(api.etat().batimentsCles ?? []).includes("chapelle")) return { erreur: true, contenu: "La Chapelle n'est pas en jeu." };
        await api.changerPhase("vote");
        // double à false ne doit pas effacer un vote double décidé la nuit (cloche) : on ne le transmet que s'il est voulu.
        await api.ouvrirVote({ candidats: ids, duree: Math.max(0, duree_secondes) * 1000, ...(double ? { double: true } : {}), ...(chapelle ? { objet: "chapelle" } : {}) });
        if (banc?.actif) {
          return { contenu: `Jugement de ${banc.prochainNom} au Banc des accusés : voter pour lui le condamne, ne rien voter l'acquitte. Rappelle l'enjeu, puis clos-le.` };
        }
        return { contenu: `Vote ${chapelle ? "de la Chapelle " : ""}ouvert (${ids.length} candidats${duree_secondes ? `, ${duree_secondes} s` : ""}). Rappelle l'enjeu, puis clos-le.` };
      }
      // Un vote clos par le départ de son seul candidat (système 0.8.0) : rien à dépouiller, personne à éliminer.
      const deja = api.etat().vote;
      if (!deja?.ouvert && deja?.resultat?.depart) {
        return { contenu: `Le vote s'est clos sans élu : ${nomActeur(deja.resultat.depart)} a quitté la veillée. Personne n'est désigné ; n'élimine personne.` };
      }
      const r = await api.cloreVote();
      // Le ruban de la Tisserande : le plus désigné a une minute de plus pour se défendre, le vote reste ouvert.
      if (r.prolonge) {
        return { contenu: `${nomActeur(r.prolonge)} porte le ruban de la Tisserande : le dépouillement attend, il a une minute de plus pour se défendre `
          + "(le vote reste ouvert, chacun peut changer d'avis). Laisse-le parler, puis clos de nouveau (loups_vote clore)." };
      }
      const { decompte = {}, elu, elus = elu ? [elu] : [], egalite = false } = r;
      // Le Dernier souffle (système 0.7.0) : les morts qui ont voté ont donné leur dernière voix.
      const souffles = (r.souffles ?? []).length ? ` Dernier souffle : ${r.souffles.map(nomActeur).join(", ")} ont donné leur dernière voix (elle ne reviendra pas).` : "";
      const lignes = Object.entries(decompte).sort((x, y) => y[1] - x[1]).map(([id, n]) => `${nomActeur(id)} : ${n}`);
      // L'élection du Bailli : l'élu (ou le sort, ou la vacance), déjà annoncé au chat par le système. Personne n'est exécuté.
      if (r.objet === "bailli") {
        return { contenu: `Élection du Bailli — décompte : ${lignes.join(", ") || "aucune voix"}. `
          + (r.bailli ? `${nomActeur(r.bailli)} est le nouveau Bailli${r.sort ? " (désigné par le sort parmi les ex aequo)" : ""}. `
            : "Personne n'est élu : la charge reste vacante jusqu'au prochain jour. ")
          + "Annonce-le en une phrase. Ce vote n'exécute personne : ouvre ensuite le vote d'exécution (loups_vote ouvrir)." };
      }
      // Le Bailli a tranché une égalité (r.departage : { par, candidats, choix }), ou sa voix a compté double (r.poids).
      const departage = r.departage
        ? ` Égalité tranchée par le Bailli ${nomActeur(r.departage.par)} : ${(r.departage.choix ?? []).length ? (r.departage.choix).map(nomActeur).join(" et ") : "il n'a désigné personne"}.`
        : "";
      const poids = Object.keys(r.poids ?? {}).length ? ` (voix du Bailli ${Object.keys(r.poids).map(nomActeur).join(", ")} comptée double)` : "";
      if (r.objet === "exil") {
        return { contenu: `Exil — décompte : ${lignes.join(", ") || "aucune voix"}. `
          + (elu ? `${nomActeur(elu)} quitte la veillée (ni mort ni révélé : ne dis rien de son camp).` : "Personne n'est exilé.")
          + " Le vote d'exécution du jour reste dû." };
      }
      // Le Banc : le verdict (pour sur le total) ; acquitté, le prochain accusé est jugé, s'il y en a un.
      if (r.banc) {
        const condamne = elus.length > 0;
        const voix = r.deuil ? " Une voix sans visage (le Glas du deuil) s'est jointe au vote." : "";
        return { contenu: `Banc des accusés : ${nomActeur(r.banc.accuse)} ${condamne ? "est CONDAMNÉ" : "est acquitté"} (${r.banc.pour} pour sur ${r.banc.total}).${voix}${souffles} `
          + (condamne ? `Désigné : ${nomActeur(r.banc.accuse)} (loups_eliminer).` : "Personne n'est désigné : s'il reste un accusé, juge-le (loups_vote ouvrir) ; sinon, la nuit tombe.") };
      }
      if (r.objet === "chapelle") {
        return { contenu: `Décompte : ${lignes.join(", ") || "aucune voix"}. `
          + (elu ? `${nomActeur(elu)} dormira à l'abri de la Chapelle la nuit prochaine (annoncé au chat).` : "Personne n'est choisi : la Chapelle reste vide cette nuit.") };
      }
      // Personne : faute de voix, par égalité, ou faute de majorité absolue (le Gibet).
      const personne = !lignes.length ? "Aucun vote" : egalite ? "Égalité"
        : api.etat().vote?.majoriteAbsolue ? "Pas de majorité absolue (le Gibet l'exige)" : "Égalité ou aucun vote";
      // Le Juge de paix en jeu (vivant ou non : la question se pose toujours, pour ne rien trahir) peut annuler ce vote.
      const juge = elus.length && api.villageois().some(a => roleLoups(a, api)?.system?.effet === "annuler-vote");
      return { contenu: `Décompte${poids} : ${lignes.join(", ") || "aucune voix"}.${departage}${souffles} `
        + (elus.length ? `Désigné${elus.length > 1 ? "s" : ""} : ${elus.map(nomActeur).join(" et ")} (loups_eliminer pour chacun).` : `${personne} : personne n'est désigné.`)
        + (juge ? " Avant d'exécuter, demande au village si quelqu'un use d'un pouvoir après le dépouillement (Juge de paix) et laisse-lui un instant : "
          + "s'il annule (Table de jeu, ou loups_jour), le vote se rejoue — clos-le de nouveau, et n'exécute que le résultat du nouveau vote." : "") };
    }
  },
  // Les gens de passage (système 0.8.0 et plus) : un arrivant en cours de partie (rôle public, camp secret), un départ.
  {
    nom: "loups_passage",
    systemes: LOUPS,
    description: "Gens de passage. « accueillir » : un joueur arrivé en cours de partie (son nom de joueur Foundry) entre à l'aube ou au "
      + "débat, hors vote, avec un rôle de passage PUBLIC (Rémouleur, Montreur d'ours, Pèlerine) et un camp SECRET tiré par le système (ne "
      + "le dis jamais) ; un nom qui n'est pas celui d'un joueur fait entrer un compagnon IA. « partir » : un villageois quitte la veillée (le "
      + "joueur doit s'en aller) : ni mort ni révélé. « lister » : les gens de passage. L'exil passe par loups_vote (objet « exil »).",
    schema: objet({
      action: { type: "string", enum: ["accueillir", "partir", "lister"], description: "accueillir, partir ou lister." },
      qui: chaine("accueillir : le nom du joueur Foundry, ou le nom du compagnon IA à faire entrer ; partir : le villageois. Vide pour lister."),
      role: { type: "string", enum: ["", "remouleur", "montreur-d-ours", "pelerine"], description: "accueillir : le rôle de passage voulu (vide : tiré)." }
    }),
    sensible: true,
    async executer({ action, qui, role }) {
      const api = apiLoups();
      if (typeof api.accueillir !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de gens de passage (il faut lakour-loups 0.8.0 ou plus)." };
      if (action === "lister") {
        const gens = api.gensDePassage();
        return { contenu: gens.length ? gens.map(g => `- ${g.nom} : ${g.role} (arrivé au tour ${g.tour})${g.parti ? ", parti" : ""}`).join("\n") : "Aucun gens de passage." };
      }
      if (!qui.trim()) return { erreur: true, contenu: "Dis qui (le nom du joueur, du compagnon ou du villageois)." };
      if (action === "partir") {
        const id = idVillageois(qui);
        if (!id) return { erreur: true, contenu: `Villageois introuvable : ${qui}.` };
        const voteAvant = api.etat().vote?.ouvert;
        let parti;
        try { parti = await api.partir(id, { comment: "depart" }); } catch (e) { return { erreur: true, contenu: `Départ refusé : ${e.message}` }; }
        if (parti === false) return { erreur: true, contenu: `${nomActeur(id)} a déjà quitté la veillée.` };
        // Seul candidat du vote ouvert (l'accusé du Banc, le seul gens de passage d'un exil) : le système a clos ce vote, sans élu.
        const apres = api.etat().vote;
        const sansObjet = voteAvant && !apres?.ouvert && apres?.resultat?.depart;
        return { contenu: `${nomActeur(id)} quitte la veillée (annoncé au chat) : ni mort ni révélé. Dis-le en une phrase, sans rien de son rôle.`
          + (sansObjet ? " Le vote en cours n'avait plus d'objet : le système l'a clos SANS élu ; n'élimine personne." : "") };
      }
      const joueur = game.users.find(u => !u.isGM && u.name.toLowerCase() === qui.trim().toLowerCase());
      let r;
      try { r = await api.accueillir({ ...(joueur ? { userId: joueur.id } : { nom: qui.trim() }), ...(role ? { cle: role } : {}) }); }
      catch (e) { return { erreur: true, contenu: `Arrivée refusée : ${e.message}` }; }
      // Un compagnon IA qui arrive : une personnalité au hasard, comme à la distribution.
      if (!joueur) await game.actors.get(r.acteurId)?.update({ [`flags.${ID}.compagnon`]: personnaliteAuHasard(`${r.acteurId}|${Math.random()}`) });
      return { contenu: `${r.nom} arrive à Brumecombe${joueur ? "" : " (compagnon IA)"} : rôle public ${contenuNomRole(r)} (annoncé au chat). Son camp est SECRET : `
        + "ne le dis jamais. Accueille-le en une phrase." };
    }
  },
  // Le Banc des accusés (système 0.8.0 et plus) : public. Les joueurs accusent par leur bandeau ; toi, pour qui le dit à voix haute.
  {
    nom: "loups_banc",
    systemes: LOUPS,
    description: "Le Banc des accusés (public) : « etat » dit les accusations du jour et le prochain jugé ; « accuser » porte l'accusation d'un "
      + "villageois qui la DIT à voix haute (une par jour et par accusateur ; chacun n'est accusé qu'une fois par jour), jamais de ton propre "
      + "chef. Le jugement passe par loups_vote (ouvrir : le prochain accusé, lui seul) ; sans accusé, pas de vote d'exécution.",
    schema: objet({
      action: { type: "string", enum: ["etat", "accuser"], description: "etat ou accuser." },
      par: chaine("accuser : le villageois qui accuse. Vide pour etat."),
      contre: chaine("accuser : le villageois accusé. Vide pour etat.")
    }),
    sensible: false,
    async executer({ action, par, contre }) {
      const api = apiLoups();
      if (typeof api.banc !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Banc des accusés (il faut lakour-loups 0.8.0 ou plus)." };
      if (action === "accuser") {
        const a = idVillageois(par), c = idVillageois(contre);
        if (!a || !c) return { erreur: true, contenu: `Villageois introuvable : ${!a ? par : contre}.` };
        try { await api.accuser(a, c); } catch (e) { return { erreur: true, contenu: `Accusation refusée : ${e.message}` }; }
        return { contenu: `${nomActeur(a)} accuse ${nomActeur(c)} (annoncé au chat, inscrit au Registre).` };
      }
      const b = api.banc();
      if (!b.actif) return { contenu: "Pas de Banc des accusés dans cette partie (réglage du système)." };
      return { contenu: `${(b.accusations ?? []).map(x => `${x.parNom} accuse ${x.contreNom}${x.juge ? " (jugé)" : ""}`).join(" ; ") || "Aucune accusation aujourd'hui"}. `
        + (b.prochain ? `Prochain jugé : ${b.prochainNom}.` : "Personne à juger : pas de vote d'exécution aujourd'hui.") };
    }
  },
  // Les Saints du calendrier (système 0.7.0 et plus) : la Bonne étoile (secrète) et le Glas final (public).
  {
    nom: "loups_calendrier",
    systemes: LOUPS,
    description: "Les Saints du calendrier. « etoile » : la Bonne étoile, ta protection SECRÈTE d'un villageois la première nuit seulement (un "
      + "joueur débutant à ménager ; personne n'en est prévenu, pas même lui ; vide = personne), à poser avant que la première nuit soit "
      + "résolue. « glas » : le Glas final, PUBLIC et annoncé au chat : la partie s'arrête au soir du jour donné (0 le lève).",
    schema: objet({
      action: { type: "string", enum: ["etoile", "glas"], description: "etoile ou glas." },
      villageois: chaine("Pour etoile : le villageois protégé (vide = personne). Vide pour glas."),
      jour: entier("Pour glas : le jour où la partie s'arrête (0 = plus de glas). 0 pour etoile.")
    }),
    sensible: false,
    async executer({ action, villageois, jour }) {
      const api = apiLoups();
      if (action === "glas") {
        if (typeof api.glasFinal !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Glas final (il faut lakour-loups 0.7.0 ou plus)." };
        try {
          const n = await api.glasFinal(Math.max(0, jour || 0));
          return { contenu: n ? `Glas final posé : la partie s'arrêtera au soir du jour ${n} (annoncé au chat).` : "Glas final levé (annoncé au chat)." };
        } catch (e) { return { erreur: true, contenu: `Glas refusé : ${e.message}` }; }
      }
      if (typeof api.bonneEtoile !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Bonne étoile (il faut lakour-loups 0.7.0 ou plus)." };
      const id = villageois.trim() ? idVillageois(villageois) : "";
      if (villageois.trim() && !id) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
      try { await api.bonneEtoile(id); } catch (e) { return { erreur: true, contenu: `Bonne étoile refusée : ${e.message}` }; }
      return { contenu: id ? `Bonne étoile (secret) : ${nomActeur(id)} est protégé la première nuit. N'en dis rien à personne.` : "Bonne étoile retirée." };
    }
  },
  // Le Bailli (système 0.6.0 et plus) : la charge publique, son état ; le narrateur ne le nomme que pour corriger, ou quand le
  // défunt le dit à voix haute (le système gère élection, voix double, départage et succession).
  {
    nom: "loups_bailli",
    systemes: LOUPS,
    description: "Le Bailli de Brumecombe (charge PUBLIQUE) : « etat » dit qui l'est, si une succession est en cours et si l'élection est "
      + "due ; « nommer » remet le sceau à un vivant, seulement pour corriger une erreur ou quand un joueur (le Bailli mourant, le village "
      + "d'un commun accord) le dit à voix haute. L'élection elle-même passe par loups_vote (objet « bailli ») ; voix double, départage et "
      + "succession sont gérés par le système.",
    schema: objet({
      action: { type: "string", enum: ["etat", "nommer"], description: "etat, ou nommer un Bailli." },
      villageois: chaine("Pour nommer : nom du villageois (vivant). Vide pour etat.")
    }),
    sensible: false,
    async executer({ action, villageois }) {
      const api = apiLoups();
      if (typeof api.bailli !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Bailli (il faut lakour-loups 0.6.0 ou plus)." };
      if (action === "nommer") {
        const id = idVillageois(villageois);
        if (!id) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
        try { await api.nommerBailli(id); } catch (e) { return { erreur: true, contenu: `Sceau non remis : ${e.message}` }; }
        return { contenu: `${nomActeur(id)} est nommé Bailli (annoncé au chat). Dis-le en une phrase.` };
      }
      const b = api.bailli();
      if (!b.actif) return { contenu: "Pas de Bailli dans cette partie (réglage du système)." };
      return { contenu: b.acteurId ? `Bailli : ${b.nom} (depuis le tour ${b.depuis}).`
        : b.succession ? `Le Bailli ${b.succession.nom} est mort : il remet le sceau (succession en cours, le système attend sa réponse).`
        : b.election?.ok ? "Pas de Bailli : l'élection est due, avant le vote d'exécution (loups_vote ouvrir, objet « bailli »)."
        : `Pas de Bailli : charge vacante${b.possible?.raisonTexte ? ` (${b.possible.raisonTexte})` : ""}.` };
    }
  },
  // Le Registre du greffier (système 0.6.0 et plus) : public. Le narrateur l'a dans l'état du jeu ; il ne le récite pas.
  {
    nom: "loups_registre",
    systemes: LOUPS,
    description: "Le Registre du greffier (PUBLIC) : votes clos voix par voix, morts et leur cause publique, Bailli, déclarations. « lire » "
      + "le rend en entier (au plus 60 lignes) ; « declarer » inscrit la déclaration d'un villageois vivant qui te la DICTE (un joueur qui dit "
      + "« inscris au Registre que… ») : jamais de ton propre chef, et ses mots à lui. Une déclaration n'est qu'une parole : ne la confirme "
      + "ni ne l'infirme jamais.",
    schema: objet({
      action: { type: "string", enum: ["lire", "declarer"], description: "lire le Registre, ou declarer pour un joueur." },
      villageois: chaine("Pour declarer : le villageois qui déclare (vide pour lire)."),
      texte: chaine("Pour declarer : sa déclaration, une phrase (160 caractères au plus), avec ses mots. Vide pour lire.")
    }),
    sensible: false,
    async executer({ action, villageois, texte }) {
      const api = apiLoups();
      if (typeof api.registreTexte !== "function") return { erreur: true, contenu: "Ce système des Veillées n'a pas de Registre (il faut lakour-loups 0.6.0 ou plus)." };
      if (action === "lire") {
        const lignes = api.registreTexte({ max: 60 });
        return { contenu: lignes.length ? `Registre du greffier (pour toi, ne le récite pas) :\n${lignes.map(l => `· ${l}`).join("\n")}` : "Le Registre est vide." };
      }
      const id = idVillageois(villageois);
      if (!id) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
      try {
        const entree = await api.declarer(id, texte);
        return { contenu: `Inscrit au Registre (annoncé au chat) : ${nomActeur(id)} — « ${entree?.texte ?? texte} ». Ne le confirme ni ne l'infirme.` };
      } catch (e) { return { erreur: true, contenu: `Déclaration refusée : ${e.message}` }; }
    }
  },
  {
    nom: "loups_eliminer",
    systemes: LOUPS,
    description: "Élimine un villageois (désigné par le vote, ou décision du narrateur pour un pouvoir arbitré) ; son rôle est révélé selon "
      + "le réglage ; l'amoureux lié meurt aussi. Vérifie la victoire. Raconte ensuite sa fin et ce qu'on découvre.",
    schema: objet({
      villageois: chaine("Nom du villageois (ou de son joueur)."),
      cause: chaine("Cause (vote, chasse, poison…)."),
      reveler: booleen("Révéler son rôle (le réglage du monde l'emporte si tu ne sais pas : true).")
    }),
    sensible: true,
    async executer({ villageois, cause, reveler }) {
      const api = apiLoups();
      const id = idVillageois(villageois);
      if (!id) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
      // Un vote rouvert (Juge de paix, ruban de la Tisserande) n'a encore désigné personne.
      if (/^vote$/i.test(String(cause).trim()) && api.etat().vote?.ouvert) {
        return { erreur: true, contenu: "Le vote est ouvert (il se rejoue ou se prolonge) : clos-le d'abord (loups_vote clore), puis exécute le nouvel élu." };
      }
      const avant = new Set(vivants().map(a => a.id));
      await api.eliminer(id, { cause, reveler });
      const morts = [...avant].filter(i => !game.actors.get(i)?.system.vivant);
      const vainqueur = await api.verifierVictoire();
      const roleDe = i => roleLoups(game.actors.get(i));
      const role = roleDe(id);
      // Un mort qui emporte quelqu'un (Braconnière) doit encore choisir : comme pour l'aube (loups_nuit, « En attente »).
      const emportent = vainqueur ? [] : morts.filter(i => roleDe(i)?.system?.effet === "emporter" && !(i === id && cause === "emporte"));
      return { contenu: `${morts.map(nomActeur).join(" et ")} ${morts.length > 1 ? "meurent" : "meurt"} (${cause}). Rôle de ${nomActeur(id)} : ${role?.name ?? "?"}.`
        + (emportent.length ? ` ${emportent.map(nomActeur).join(" et ")} peut emporter quelqu'un dans la tombe : demande-lui qui, puis loups_eliminer (cause emporte).` : "")
        + (vainqueur ? ` VICTOIRE : ${nomVainqueur(vainqueur)} — raconte le dénouement.` : " La partie continue.") };
    }
  },
  {
    nom: "loups_peste",
    systemes: LOUPS,
    description: "Le cri « C'est la peste noire ! » : quand un joueur le crie à voix haute (chat ou voix) pendant le jour (aube, débat, "
      + "vote), fais-le crier par le système (les joueurs ont aussi un bouton ; un compagnon IA qui l'écrit dans sa réplique crie de "
      + "lui-même). Le système tranche : si la partie est une peste noire, elle s'arrête et le village gagne ; sinon, le crieur est pendu "
      + "pour avoir semé la panique (annoncé au chat). Ne laisse jamais deviner avant le verdict si c'est vrai ; raconte ensuite.",
    schema: objet({
      villageois: chaine("Nom du villageois qui crie (ou de son joueur).")
    }),
    sensible: true,
    async executer({ villageois }) {
      const api = apiLoups();
      if (typeof api?.crierPeste !== "function") return { erreur: true, contenu: "Le système lakour-loups de ce monde ne connaît pas la peste noire : mets-le à jour." };
      const id = idVillageois(villageois);
      if (!id) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
      let r;
      try { r = await api.crierPeste(id); } catch (e) { return { erreur: true, contenu: `Cri refusé — ${e.message}` }; }
      return { contenu: r.juste
        ? `C'était bien la peste noire : ${nomActeur(id)} l'a reconnue, la partie s'arrête. VICTOIRE : ${nomVainqueur(r.vainqueur || "village")} — `
          + "raconte le dénouement (la peste enfin dévoilée)."
        : `Ce n'était pas la peste : ${nomActeur(id)} est pendu pour avoir semé la panique (annoncé au chat).`
          + (r.vainqueur ? ` VICTOIRE : ${nomVainqueur(r.vainqueur)} — raconte le dénouement.` : " Raconte sa fin en une phrase ; la partie continue.") };
    }
  },
  {
    nom: "loups_effet",
    systemes: LOUPS,
    description: "Applique un effet arbitré par le narrateur (pouvoir que le système n'automatise pas) : proteger, silence, changer_camp, echanger_roles.",
    schema: objet({
      effet: { type: "string", enum: ["proteger", "silence", "changer_camp", "echanger_roles"], description: "Effet." },
      cibles: { type: "array", items: chaine("Nom d'un villageois."), description: "Une cible (deux pour echanger_roles)." },
      camp: { type: "string", enum: ["", "village", "meute", "solitaire"], description: "Pour changer_camp." }
    }),
    sensible: true,
    async executer({ effet, cibles, camp }) {
      const api = apiLoups();
      const ids = cibles.map(idVillageois);
      if (!ids.length || ids.some(i => !i)) return { erreur: true, contenu: `Cible introuvable parmi : ${cibles.join(", ")}.` };
      if (effet === "proteger") await api.proteger(ids[0]);
      else if (effet === "silence") await api.reduireAuSilence(ids[0]);
      else if (effet === "changer_camp") {
        if (!camp) return { erreur: true, contenu: "Indique le camp." };
        await api.changerCamp(ids[0], camp);
      } else {
        if (ids.length !== 2) return { erreur: true, contenu: "echanger_roles demande deux cibles." };
        await api.echangerRoles(ids[0], ids[1]);
      }
      return { contenu: `Effet « ${effet} » appliqué à ${ids.map(nomActeur).join(" et ")}.` };
    }
  },
  {
    nom: "loups_jour",
    systemes: LOUPS,
    description: "Pouvoirs de JOUR, appliqués par le système : métiers publics (Forgeron, Meunière, Garde du guet, Curé, Chasseresse, "
      + "Aubergiste, Apothicaire, Colporteur de nouvelles, Tisserande, Passeur, Tanneur, Maîtresse d'école, Ramoneuse, Éclusière ; "
      + "la liste exacte vient du système, action « lister »), Juge de paix (annuler le vote "
      + "juste après le dépouillement : il se révèle et le village revote), Conteuse, bâtiments (Taverne, Forge, Grange, Puits pour un mort "
      + "du jour ; Chapelle : le village désigne, sans villageois). action « lister » : ce qui est possible maintenant (d'un villageois, ou "
      + "de tous si vide). action « utiliser » : quand un joueur annonce son pouvoir à voix haute (il peut aussi le faire lui-même depuis la "
      + "Table de jeu). Le système refuse ce qui n'est pas permis ; l'annonce publique part au chat, raconte-la.",
    schema: objet({
      action: { type: "string", enum: ["lister", "utiliser"], description: "Lister les pouvoirs possibles, ou en utiliser un." },
      villageois: chaine("Nom du villageois qui agit (vide pour la Chapelle ; pour lister : vide = tous)."),
      pouvoir: chaine("Pour utiliser : le métier, le rôle ou le bâtiment (« Forgeron », « Juge de paix », « Taverne », « Chapelle »…)."),
      cibles: { type: "array", items: chaine("Nom d'un villageois."), description: "Pour utiliser : les joueurs désignés (souvent un seul, aucun pour certains)." },
      texte: chaine("Pour le Puits : le dernier mot du mort, dix mots au plus.")
    }),
    sensible: true,
    async executer({ action, villageois = "", pouvoir = "", cibles = [], texte = "" }) {
      const api = apiLoups();
      if (!api.pouvoirsDeJour) return { erreur: true, contenu: "Le système lakour-loups de ce monde ne connaît pas les pouvoirs de jour : mets-le à jour." };
      const simple = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^(la|le|les|l')\s*/, "").trim();
      const acteurId = villageois.trim() ? idVillageois(villageois) : "";
      if (villageois.trim() && !acteurId) return { erreur: true, contenu: `Villageois introuvable : ${villageois}.` };
      const decrire = p => `${p.nom}${p.source === "role" ? " (rôle SECRET)" : ""}${p.cibles ? ` — désigne ${p.cibles} parmi : ${p.candidats.map(c => c.nom).join(", ") || "personne"}` : ""}${p.texte ? " — un dernier mot" : ""}`;
      if (action === "lister") {
        const qui = acteurId ? [game.actors.get(acteurId)] : api.villageois();
        const lignes = [];
        for (const a of qui) {
          const possibles = api.pouvoirsDeJour(a.id).filter(p => p.possible);
          if (possibles.length) lignes.push(`- ${a.name} : ${possibles.map(decrire).join(" ; ")}`);
        }
        if (!acteurId) for (const p of api.pouvoirsDeJour("").filter(x => x.possible)) lignes.push(`- Le village : ${decrire(p)}`);
        return { contenu: lignes.length ? `Pouvoirs de jour possibles maintenant (pour toi seul) :\n${lignes.join("\n")}` : "Aucun pouvoir de jour n'est possible maintenant." };
      }
      const liste = api.pouvoirsDeJour(acteurId);
      const voulu = simple(pouvoir);
      const p = liste.find(x => simple(x.pouvoir) === voulu || simple(x.nom) === voulu)
        ?? liste.find(x => voulu && (simple(x.nom).includes(voulu) || simple(x.pouvoir).includes(voulu)));
      if (!p) {
        return { erreur: true, contenu: `${acteurId ? nomActeur(acteurId) : "Le village"} n'a pas ce pouvoir de jour (« ${pouvoir} »). `
          + `Possibles : ${liste.map(x => x.nom).join(", ") || "aucun"}.` };
      }
      const ids = cibles.map(idVillageois);
      if (ids.some(i => !i)) return { erreur: true, contenu: `Cible introuvable parmi : ${cibles.join(", ")}.` };
      try {
        const r = await api.agirDeJour({ acteurId, pouvoir: p.pouvoir, cibles: ids, texte });
        return { contenu: `${p.nom} : fait. Annoncé au village : ${r.annonces.join(" ") || "—"}`
          + (p.pouvoir === "juge-de-paix" ? " Le vote se rejoue : laisse voter, puis loups_vote clore." : "") };
      } catch (e) {
        return { erreur: true, contenu: `${p.nom} : refusé — ${e.message}` };
      }
    }
  }
);

// ---------------------------------------------------------------- Cartes jouables

const caseXY = { x: entier("Colonne (0 = gauche)."), y: entier("Ligne (0 = haut).") };
// Contenu d'un plan, à la racine (carte simple) ou dans chaque étage (carte à étages).
const CONTENU_PLAN = {
  pieces: { type: "array", items: objet({ nom: chaine("Nom (visible du MJ seulement)."), ...caseXY, l: entier("Largeur en cases."), h: entier("Hauteur en cases."), sol: { type: "string", enum: Object.keys(SOLS), description: "Matière du sol." } }) },
  ouvertures: { type: "array", items: objet({ ...caseXY, cote: { type: "string", enum: ["nord", "sud", "est", "ouest"], description: "Bord de la case concerné." }, type: { type: "string", enum: ["porte", "secrete", "verrouillee", "fenetre", "passage"], description: "Nature de l'ouverture." } }) },
  lumieres: { type: "array", items: objet({ ...caseXY, rayon: entier("Rayon en cases."), couleur: chaine("Couleur hexadécimale, ex. #ffaa55.") }) },
  elements: { type: "array", items: objet({ nom: chaine("Obstacle ou couvert (caisses, pilier…)."), ...caseXY, l: entier("Largeur en cases."), h: entier("Hauteur en cases.") }) },
  sons: { type: "array", description: "Sons d'ambiance placés ; vide = déduits des éléments et des pièces.", items: objet({ ...caseXY,
    rayon: entier("Portée en cases."), son: { type: "string", enum: SONS_AMBIANCE, description: "Ambiance." } }) },
  zones: { type: "array", description: "Zones invisibles des joueurs (souvent vide).", items: objet({ nom: chaine("Nom unique de la zone (dans toute la scène)."), ...caseXY,
    l: entier("Largeur en cases."), h: entier("Hauteur en cases."), type: { type: "string", enum: TYPES_ZONE, description: "Effet de la zone." },
    texte: chaine("Pour « texte » : ce qui s'élève au-dessus du jeton qui entre. Sinon vide."),
    vers: chaine("Pour « teleport » : nom de la zone d'arrivée (elle peut être à un autre étage). Sinon vide."),
    obscurite: { type: "number", description: "Pour « obscurite » : 0 (clair) à 1 (noir). Sinon 0." } }) }
};
OUTILS.push({
  nom: "creer_scene",
  description: "Crée une carte JOUABLE (scène Foundry) à partir d'un plan en cases : pièces rectangulaires (les couloirs sont des pièces étroites), "
    + "murs automatiques entre pièces et autour, portes/fenêtres/passages sur les bords, lumières, obstacles, obscurité. "
    + "Une case = 2 mètres (1,5 m en D&D 5e). Toute ouverture doit être placée sur un bord qui sépare deux pièces (ou une pièce et l'extérieur). "
    + "Scène vivante : sons d'ambiance placés (sinon déduits des éléments : cheminée → feu, forge, foule d'une place…) et zones invisibles "
    + "des joueurs : texte qui s'élève quand un jeton entre (indice, inscription), téléportation vers une autre zone (escalier, trappe), "
    + "pause de la partie à l'entrée (piège, révélation), obscurité. "
    + "Bâtiment à plusieurs niveaux (cave, rez, étage…) : remplis `etages` (un niveau Foundry par étage, même grille, chacun son fond "
    + "dessiné) et laisse VIDES pieces, ouvertures, lumieres, elements, sons et zones à la racine ; `escaliers` relie des étages par une "
    + "cage d'escalier, une échelle ou une trappe aux MÊMES cases sur chaque étage relié (dans une pièce de chacun) : le jeton qui y entre "
    + "se voit proposer de changer de niveau, dans les deux sens. Les joueurs arrivent au premier étage de la liste. Carte simple : etages et escaliers vides. "
    + "image=true ajoute un fond peint par OpenAI (coût, et seulement si une clé OpenAI existe ; pas pour une carte à étages). Ensuite, pose les jetons avec placer_jetons.",
  schema: objet({
    nom: chaine("Nom de la scène."),
    largeur: entier("Largeur du plan en cases (4 à 80)."),
    hauteur: entier("Hauteur du plan en cases (4 à 80)."),
    lumiere: { type: "string", enum: ["jour", "penombre", "nuit"], description: "Lumière ambiante." },
    ...CONTENU_PLAN,
    etages: { type: "array", description: `Carte à étages (${MAX_ETAGES} au plus) ; vide pour une carte simple. Le premier est celui où l'on arrive.`,
      items: objet({ nom: chaine("Nom unique de l'étage (« Cave », « Rez-de-chaussée », « Étage »…)."),
        elevation: { type: "number", description: "Altitude du sol de l'étage en mètres, unique (cave -3, rez 0, étage 3…)." }, ...CONTENU_PLAN }) },
    escaliers: { type: "array", description: "Passages entre étages (vide pour une carte simple).", items: objet({
      nom: chaine("Nom unique (« Escalier de la tour », « Trappe de la cave »)."), ...caseXY,
      l: entier("Largeur en cases (1 en général)."), h: entier("Hauteur en cases (1 en général)."),
      etages: { type: "array", items: chaine("Nom d'un étage relié."), description: "Les étages reliés (deux au moins), aux mêmes cases sur chacun." } }) },
    image: booleen("false (recommandé) : fond dessiné automatiquement, gratuit. true : fond peint par OpenAI (payant)."),
    description_image: chaine("Si image : description visuelle du lieu, en anglais de préférence (style, matières, ambiance). Sinon vide."),
    activer: booleen("true pour y amener les joueurs tout de suite.")
  }),
  sensible: true,
  async executer(plan) {
    const { erreurs, scene } = planVersScene(plan, { taille: 100, distance: game.system.id === "dnd5e" ? 1.5 : 2 });
    if (erreurs.length) return { erreur: true, contenu: `Plan refusé : ${erreurs.join(" ; ")}. Corrige le plan et rappelle creer_scene.` };
    let note = "";
    const slug = plan.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const dossier = `cartes/${game.world.id}`;
    const aEtages = Boolean(plan.etages?.length);
    let fond = null;
    if (plan.image && aEtages) note = " Pas de fond peint pour une carte à étages : fonds dessinés.";
    // Fond peint par OpenAI, sur demande seulement (payant).
    if (plan.image && !aEtages) {
      const images = fournisseurImages();
      if (!images) note = " Pas de clé OpenAI : fond dessiné à la place du fond peint.";
      else {
        try {
          const format = plan.largeur > plan.hauteur * 1.2 ? "1536x1024" : plan.hauteur > plan.largeur * 1.2 ? "1024x1536" : "1024x1024";
          const disposition = plan.pieces.map(p => `${p.nom} (${p.l}x${p.h})`).join(", ");
          const blob = await images.genererImage({ taille: format,
            description: `Top-down tabletop RPG battle map, seen from directly above, no grid, no text, no characters. ${plan.description_image}. Rooms: ${disposition}.` });
          const nomFichier = `${Date.now()}-${slug}.png`;
          fond = await deposerFichier(dossier, nomFichier, new File([blob], nomFichier, { type: "image/png" }));
        } catch (erreur) {
          note = ` Fond peint impossible (${erreur.message}) : fond dessiné à la place.`;
        }
      }
    }
    // Sinon, fond dessiné (gratuit) dans le style choisi (plat ou relief), aligné sur les murs de la scène ; un par
    // étage pour une carte à étages, chacun au fond de son niveau (tout part dans le même Scene.create).
    if (aEtages) {
      for (const [i, e] of etagesDuPlan(plan).entries()) {
        scene.levels.find(l => l._id === e.niveau).background.src = await deposerFondDessine(plan, slug, lire("styleVisuel"), i);
      }
    } else {
      if (!fond) fond = await deposerFondDessine(plan, slug, lire("styleVisuel"));
      scene.levels[0].background.src = fond;
    }
    // L'image remplace les sols et objets dessinés ; restent les étiquettes de pièces (MJ seulement).
    scene.drawings = scene.drawings.filter(d => d.hidden);
    const doc = await Scene.implementation.create({ name: plan.nom, navigation: true, ...scene, flags: { [ID]: { cree: true, plan } } });
    if (plan.activer) await doc.activate();
    const escaliers = scene.regions.filter(r => r.behaviors[0]?.type === "changeLevel").length;
    const etages = aEtages ? `${scene.levels.length} étages (${scene.levels.map(l => l.name).join(", ")} ; on arrive à « ${scene.levels[0].name} »), ${escaliers} escaliers, ` : "";
    return { contenu: `Scène « ${plan.nom} » créée (${doc.uuid}) : ${etages}${scene.walls.length} murs, ${scene.walls.filter(w => w.door).length} portes, ${scene.lights.length} lumières, ${scene.sounds?.length ?? 0} sons, ${scene.regions.length - escaliers} zones.${plan.activer ? " Les joueurs y sont." : ""}${note} Coordonnées en cases pour placer_jetons.` };
  }
});

// L'aide de jeu à montrer (montrer_aide) : un journal ou une page que les joueurs ont le droit de lire. Venue d'un compendium,
// on montre sa copie du monde (installée par le module de contenu), ou on l'importe. -> { doc, importe } | { erreur, contenu }.
const VISIBLE = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const lisibleDesJoueurs = (entree, page) => (page && page.ownership?.default >= 0
  ? page.ownership.default >= VISIBLE() : (entree.ownership?.default ?? 0) >= VISIBLE());
export async function aideAMontrer(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc || !["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return { erreur: true, contenu: `Aucun journal ni page à cet uuid : ${uuid}.` };
  const page = doc.documentName === "JournalEntryPage" ? doc : null;
  const entree = page ? page.parent : doc;
  if (!lisibleDesJoueurs(entree, page)) {
    return { erreur: true, contenu: `« ${doc.name} » est réservé au MJ : il ne se montre pas aux joueurs. Raconte-le, ou montre une aide de jeu.` };
  }
  if (!entree.pack) return { doc, importe: false };
  // La copie du monde : même source de compendium, ou même clé de module de contenu.
  const cle = Object.values(entree.flags ?? {}).find(f => f?.cle)?.cle;
  let copie = game.journal.find(j => j._stats?.compendiumSource === entree.uuid
    || (cle && Object.values(j.flags ?? {}).some(f => f?.cle === cle)));
  let importe = false;
  if (!copie) {
    copie = await JournalEntry.implementation.create(game.journal.fromCompendium(entree, { keepId: true, clearOwnership: false }));
    importe = true;
  }
  const pageCopie = page ? copie.pages.get(page.id) ?? copie.pages.find(p => p.name === page.name) : null;
  if (page && !pageCopie) return { erreur: true, contenu: `La page « ${page.name} » manque dans la copie du monde de « ${copie.name} ».` };
  // Le MJ a pu recacher la copie du monde : on ne la montre pas de force.
  if (!lisibleDesJoueurs(copie, pageCopie)) return { erreur: true, contenu: `« ${copie.name} » a été caché aux joueurs dans ce monde : il ne se montre pas.` };
  return { doc: pageCopie ?? copie, importe };
}

// Fond dessiné d'un plan, déposé dans Data/lakour-mj-ia/cartes/<monde>/ ; renvoie son chemin. etage : rang de l'étage
// d'une carte à étages (son fond seul) ; sans lui, le premier étage.
export async function deposerFondDessine(plan, slug, style, etage = null) {
  const { svg } = planVersSVG(plan, { taille: 100, style, etage });
  const nomFichier = `${Date.now()}-${slug}${etage === null ? "" : `-n${etage}`}-${style}.svg`;
  return deposerFichier(`cartes/${game.world.id}`, nomFichier, new File([svg], nomFichier, { type: "image/svg+xml" }));
}

// Changement de style : redessine les cartes créées par le MJ IA dont le fond est dessiné (pas les fonds peints).
export async function redessinerCartes(style) {
  let n = 0;
  for (const scene of game.scenes) {
    const plan = scene.getFlag(ID, "plan");
    const niveau = scene.levels.contents[0];
    if (!plan || !niveau || !niveau.background.src?.endsWith(".svg")) continue;
    const slug = plan.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const src = await deposerFondDessine(plan, slug, style);
    await scene.updateEmbeddedDocuments("Level", [{ _id: niveau.id, "background.src": src }]);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Conduite de la partie

// Scène du monde par nom ; à défaut, importée d'un compendium (ex. les cartes de « Le Chœur creux »).
async function trouverOuImporterScene(nom) {
  const n = nom.trim().toLowerCase();
  const locale = game.scenes.find(s => s.name.toLowerCase() === n) ?? game.scenes.find(s => s.name.toLowerCase().includes(n));
  if (locale) return locale;
  for (const pack of game.packs.filter(p => p.documentName === "Scene")) {
    const entree = (await pack.getIndex()).find(e => e.name.toLowerCase() === n) ?? pack.index.find(e => e.name.toLowerCase().includes(n));
    if (entree) return game.scenes.importFromCompendium(pack, entree._id);
  }
  return null;
}

// Personnages des joueurs : ceux assignés aux joueurs, à défaut ceux qu'ils possèdent.
function personnagesJoueurs() {
  const assignes = game.users.filter(u => !u.isGM && u.character).map(u => u.character);
  return assignes.length ? [...new Set(assignes)] : game.actors.filter(a => a.hasPlayerOwner && a.type === "character");
}

OUTILS.push(
  {
    nom: "amener_joueurs",
    description: "Démarre une scène jouée : l'active (en l'important des compendiums si besoin), pose les jetons des personnages joueurs "
      + "autour d'une case de départ avec leur vision activée (sinon les joueurs ne voient rien), et peut enlever la pause.",
    schema: objet({
      scene: chaine("Nom de la scène."),
      x: entier("Colonne de la case de départ (0 = gauche)."),
      y: entier("Ligne de la case de départ (0 = haut)."),
      reprendre: booleen("true pour enlever la pause du jeu.")
    }),
    sensible: true,
    async executer({ scene: nom, x, y, reprendre }) {
      const scene = await trouverOuImporterScene(nom);
      if (!scene) return { erreur: true, contenu: `Scène introuvable : ${nom}.` };
      // Les figurants du lieu quitté n'ont plus de raison d'être.
      const quittee = game.scenes.active;
      const anciens = quittee && quittee !== scene ? quittee.tokens.filter(t => t.getFlag(ID, "figurant")).map(t => t.id) : [];
      if (anciens.length) await quittee.deleteEmbeddedDocuments("Token", anciens);
      await scene.activate();
      const { size } = scene.grid, { sceneX, sceneY } = scene.dimensions;
      const niveau = scene.initialLevel?.id;
      const poses = [], deja = [];
      const nouveaux = [];
      // Cases de départ libres autour de la case donnée, dans sa pièce : jamais sur un étal, un puits ou devant une porte.
      const g = grilleDe(scene);
      const occupees = occupeesDe(scene, g);
      const depart = casesLibres(personnagesJoueurs().length, { centre: { x, y }, zone: salleDeLaCase(sallesDe(scene), x, y), limites: g, occupees });
      for (const [i, acteur] of personnagesJoueurs().entries()) {
        if (!acteur.prototypeToken.sight.enabled) await acteur.update({ "prototypeToken.sight.enabled": true });
        const existant = scene.tokens.find(t => t.actorId === acteur.id);
        if (existant) {
          if (!existant.sight.enabled) await existant.update({ "sight.enabled": true });
          deja.push(acteur.name);
          continue;
        }
        const { x: cx, y: cy } = depart[i] ?? { x: x + (i % 3), y: y + Math.floor(i / 3) };
        // (la vision du modèle de jeton vient d'être activée ci-dessus : le jeton en hérite)
        const jeton = await acteur.getTokenDocument({ x: sceneX + cx * size, y: sceneY + cy * size, level: niveau });
        nouveaux.push(jeton.toObject());
        poses.push(acteur.name);
      }
      if (nouveaux.length) await scene.createEmbeddedDocuments("Token", nouveaux);
      if (reprendre) game.togglePause(false, { broadcast: true });
      return { contenu: `Scène « ${scene.name} » active. Jetons posés : ${poses.join(", ") || "aucun"}${deja.length ? ` ; déjà présents : ${deja.join(", ")}` : ""}.${reprendre ? " Pause levée." : ""}` };
    }
  },
  {
    nom: "pause",
    description: "Met le jeu en pause (les joueurs ne peuvent plus déplacer leurs jetons) ou enlève la pause.",
    schema: objet({ pause: booleen("true = pause, false = reprendre.") }),
    sensible: false,
    async executer({ pause }) {
      game.togglePause(pause, { broadcast: true });
      return { contenu: pause ? "Jeu en pause." : "Pause levée." };
    }
  },
  {
    nom: "ambiance_lumiere",
    description: "Règle l'obscurité de la scène active : jour (tout est visible), pénombre, nuit (seuls les lieux éclairés se voient).",
    schema: objet({ lumiere: { type: "string", enum: ["jour", "penombre", "nuit"], description: "Ambiance lumineuse." } }),
    sensible: false,
    async executer({ lumiere }) {
      const scene = game.scenes.active;
      if (!scene) return { erreur: true, contenu: "Aucune scène active." };
      const obscurite = { jour: 0, penombre: 0.5, nuit: 0.85 }[lumiere];
      await scene.update({ "environment.darknessLevel": obscurite, "environment.globalLight.enabled": obscurite === 0 });
      return { contenu: `Lumière de « ${scene.name} » : ${lumiere}.` };
    }
  },
  {
    nom: "vue_3d",
    description: "Vue en 3D (module 3D Canvas) pour tous les joueurs : activer ou desactiver la 3D sur la scène active, cadrer la caméra "
      + "de chacun sur un jeton ou un repère (une arrivée, une révélation, un PNJ qui entre), ou vue_dessus (plan vu d'en haut). "
      + "À réserver aux moments forts : chaque cadrage déplace la caméra de tous les joueurs.",
    schema: objet({
      action: { type: "string", enum: ["activer", "desactiver", "cadrer", "vue_dessus"], description: "Ce qu'on fait de la vue 3D." },
      cible: chaine("Pour cadrer ou vue_dessus : nom d'un jeton ou repère de la carte (« puits », « seuil de l'échoppe ») ; vide = les personnages joueurs.")
    }),
    sensible: false,
    async executer({ action, cible }) {
      if (!game.modules.get(MODULE_3D)?.active) return { erreur: true, contenu: "3D Canvas n'est pas actif dans ce monde : pas de vue 3D." };
      const scene = game.scenes.active;
      if (!scene) return { erreur: true, contenu: "Aucune scène active." };
      if (action === "activer" || action === "desactiver") {
        const oui = action === "activer";
        await scene.update({ [`flags.${MODULE_3D}.auto3d`]: oui, ...(oui ? { [`flags.${MODULE_3D}.enablePlayers`]: true } : {}) });
        return { contenu: `Vue 3D ${oui ? "activée" : "désactivée"} sur « ${scene.name} » pour tous.` };
      }
      if (!scene.flags?.[MODULE_3D]?.auto3d) return { erreur: true, contenu: "La 3D n'est pas activée sur cette scène : appelle d'abord vue_3d avec activer." };
      const g = grilleDe(scene);
      let demande, nom;
      if (cible.trim()) {
        const zone = zoneDuRepere(scene, g, sallesDe(scene), cible);
        if (zone.erreur) return { erreur: true, contenu: zone.erreur };
        const jeton = scene.tokens.find(t => t.name === zone.repere);
        const centre = versPixels(zone.cibles[0], g);
        demande = jeton && action === "cadrer" ? { jeton: jeton.id } : { x: centre.x + g.size / 2, y: centre.y + g.size / 2 };
        nom = zone.repere;
      } else {
        const pj = scene.tokens.filter(t => t.actor?.hasPlayerOwner);
        if (!pj.length) return { erreur: true, contenu: "Aucun personnage joueur sur la scène : donne une cible." };
        demande = { x: pj.reduce((s, t) => s + t.x, 0) / pj.length + g.size / 2, y: pj.reduce((s, t) => s + t.y, 0) / pj.length + g.size / 2 };
        nom = "les personnages joueurs";
      }
      await scene.setFlag(ID, "camera3d", { ...demande, dessus: action === "vue_dessus", n: Date.now() });
      return { contenu: `Caméra 3D de chacun ${action === "vue_dessus" ? "au-dessus de" : "cadrée sur"} ${nom}.` };
    }
  }
);

// ---------------------------------------------------------------- Vision, lumières, portes, brouillard
// Ces réglages sont réversibles d'un clic et fréquents en jeu : pas de validation du MJ humain.

const MODES_VISION = ["basic", "darkvision", "monochromatic", "blindness", "tremorsense", "lightAmplification"];
// Animations de lumière de Foundry v14 (CONFIG.Canvas.lightAnimations), sous-ensemble utile.
const ANIMATIONS = ["aucune", "torch", "flame", "pulse", "chroma", "wave", "fog", "sunburst", "emanation", "siren"];
const sceneJouee = () => canvas.scene ?? game.scenes.active;
const caseDe = (scene, x, y) => {
  const { size } = scene.grid, { sceneX, sceneY } = scene.dimensions;
  return `${Math.floor((x - sceneX) / size)},${Math.floor((y - sceneY) / size)}`;
};
const animation = a => (a && a !== "aucune" && CONFIG.Canvas.lightAnimations[a] ? { type: a, speed: 5, intensity: 5 } : { type: null });

// Acteurs visés : « tous » = tous les personnages joueurs.
async function acteursVises(noms) {
  if (noms.some(n => n.trim().toLowerCase() === "tous")) return personnagesJoueurs();
  const trouves = [];
  for (const n of noms) { const a = await trouverActeur(n); if (a) trouves.push(a); }
  return trouves;
}

OUTILS.push(
  {
    nom: "regler_vision",
    description: "Règle la vision de personnages (ou de « tous » les personnages joueurs) : activée ou non, portée dans le noir en mètres "
      + "(0 = ne voit que les zones éclairées), mode (basic normal, darkvision vision nocturne, blindness aveuglé…). "
      + "Sur une carte à vision par jeton, un personnage sans vision laisse son joueur dans le noir.",
    schema: objet({
      personnages: { type: "array", items: chaine("Nom d'un personnage, ou « tous »."), description: "Personnages concernés." },
      active: booleen("Vision activée."),
      portee: { type: "number", description: "Portée dans l'obscurité, en mètres (0 = seulement les zones éclairées)." },
      mode: { type: "string", enum: MODES_VISION, description: "Mode de vision." }
    }),
    sensible: false,
    async executer({ personnages, active, portee, mode }) {
      const acteurs = await acteursVises(personnages);
      if (!acteurs.length) return { erreur: true, contenu: `Aucun personnage trouvé parmi : ${personnages.join(", ")}.` };
      const vision = { "sight.enabled": active, "sight.range": Math.max(0, portee), "sight.visionMode": CONFIG.Canvas.visionModes[mode] ? mode : "basic" };
      let jetons = 0;
      for (const a of acteurs) {
        await a.update(Object.fromEntries(Object.entries(vision).map(([k, v]) => [`prototypeToken.${k}`, v])));
        for (const scene of game.scenes) {
          const maj = scene.tokens.filter(t => t.actorId === a.id).map(t => ({ _id: t.id, ...vision }));
          if (maj.length) { await scene.updateEmbeddedDocuments("Token", maj); jetons += maj.length; }
        }
      }
      return { contenu: `Vision ${active ? `activée (${mode}, ${portee} m dans le noir)` : "désactivée"} pour ${acteurs.map(a => a.name).join(", ")} (${jetons} jeton(s)).` };
    }
  },
  {
    nom: "lumiere_jeton",
    description: "Donne une source de lumière portée à un personnage (torche, lanterne, lampe-torche…) ou l'éteint (rayon_faible = 0). Rayons en mètres.",
    schema: objet({
      personnage: chaine("Nom du personnage ou du jeton."),
      rayon_vif: { type: "number", description: "Rayon de lumière vive, en mètres." },
      rayon_faible: { type: "number", description: "Rayon de lumière faible, en mètres (0 = éteindre)." },
      couleur: chaine("Couleur hexadécimale (ex. #ffaa55), ou vide."),
      animation: { type: "string", enum: ANIMATIONS, description: "Animation (torch pour une torche)." }
    }),
    sensible: false,
    async executer({ personnage, rayon_vif, rayon_faible, couleur, animation: anim }) {
      const scene = sceneJouee();
      const n = personnage.trim().toLowerCase();
      const jetons = scene?.tokens.filter(t => t.name.toLowerCase() === n || t.actor?.name.toLowerCase() === n) ?? [];
      const lumiere = { "light.dim": Math.max(0, rayon_faible), "light.bright": Math.max(0, Math.min(rayon_vif, rayon_faible)),
        "light.color": couleur || null, "light.animation": animation(anim), "light.alpha": 0.4 };
      if (jetons.length) {
        await scene.updateEmbeddedDocuments("Token", jetons.map(t => ({ _id: t.id, ...lumiere })));
      } else {
        const a = await trouverActeur(personnage);
        if (!a) return { erreur: true, contenu: `Personnage introuvable : ${personnage}.` };
        await a.update(Object.fromEntries(Object.entries(lumiere).map(([k, v]) => [`prototypeToken.${k}`, v])));
      }
      return { contenu: rayon_faible > 0 ? `${personnage} porte une lumière (${rayon_vif}/${rayon_faible} m).` : `Lumière de ${personnage} éteinte.` };
    }
  },
  {
    nom: "gerer_lumieres",
    description: "Lumières de la carte affichée : lister (avec identifiants et cases), ajouter (case x,y, rayon en cases), allumer, éteindre ou supprimer (par identifiants).",
    schema: objet({
      action: { type: "string", enum: ["lister", "ajouter", "allumer", "eteindre", "supprimer"], description: "Action." },
      ids: { type: "array", items: chaine("Identifiant d'une lumière (donné par lister)."), description: "Lumières visées (vide pour lister ou ajouter)." },
      x: entier("Pour ajouter : colonne."), y: entier("Pour ajouter : ligne."),
      rayon: entier("Pour ajouter : rayon en cases."),
      couleur: chaine("Pour ajouter : couleur hexadécimale, ou vide."),
      animation: { type: "string", enum: ANIMATIONS, description: "Pour ajouter : animation." }
    }),
    sensible: false,
    async executer({ action, ids, x, y, rayon, couleur, animation: anim }) {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      if (action === "lister") {
        const l = scene.lights.contents.map(l => `${l.id} — case ${caseDe(scene, l.x, l.y)}, ${l.config.dim} m${l.config.color ? `, ${l.config.color}` : ""}${l.hidden ? ", ÉTEINTE" : ""}`);
        return { contenu: l.length ? l.join("\n") : "Aucune lumière sur cette carte." };
      }
      if (action === "ajouter") {
        const { size, distance } = scene.grid, { sceneX, sceneY } = scene.dimensions;
        const [cree] = await scene.createEmbeddedDocuments("AmbientLight", [{
          x: Math.round(sceneX + (x + 0.5) * size), y: Math.round(sceneY + (y + 0.5) * size), walls: true,
          config: { dim: rayon * distance, bright: (rayon * distance) / 2, color: couleur || null, alpha: 0.4, animation: animation(anim) }
        }]);
        return { contenu: `Lumière ajoutée en ${x},${y} (identifiant ${cree.id}).` };
      }
      const cibles = ids.filter(id => scene.lights.has(id));
      if (!cibles.length) return { erreur: true, contenu: "Aucun identifiant valide : appelle d'abord gerer_lumieres avec l'action lister." };
      if (action === "supprimer") await scene.deleteEmbeddedDocuments("AmbientLight", cibles);
      else await scene.updateEmbeddedDocuments("AmbientLight", cibles.map(id => ({ _id: id, hidden: action === "eteindre" })));
      return { contenu: `${cibles.length} lumière(s) : ${action}.` };
    }
  },
  {
    nom: "gerer_portes",
    description: "Portes de la carte affichée : lister (identifiants, cases, état), ouvrir, fermer, verrouiller ou déverrouiller (par identifiants).",
    schema: objet({
      action: { type: "string", enum: ["lister", "ouvrir", "fermer", "verrouiller", "deverrouiller"], description: "Action." },
      ids: { type: "array", items: chaine("Identifiant d'une porte (donné par lister)."), description: "Portes visées (vide pour lister)." }
    }),
    sensible: false,
    async executer({ action, ids }) {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const { SECRET } = CONST.WALL_DOOR_TYPES, { OPEN, CLOSED, LOCKED } = CONST.WALL_DOOR_STATES;
      const portes = scene.walls.filter(w => w.door !== CONST.WALL_DOOR_TYPES.NONE);
      if (action === "lister") {
        const etat = { [OPEN]: "ouverte", [CLOSED]: "fermée", [LOCKED]: "verrouillée" };
        const l = portes.map(w => `${w.id} — près de la case ${caseDe(scene, (w.c[0] + w.c[2]) / 2, (w.c[1] + w.c[3]) / 2)}, ${w.door === SECRET ? "porte secrète" : "porte"}, ${etat[w.ds]}`);
        return { contenu: l.length ? l.join("\n") : "Aucune porte sur cette carte." };
      }
      const cibles = ids.filter(id => portes.some(w => w.id === id));
      if (!cibles.length) return { erreur: true, contenu: "Aucun identifiant de porte valide : appelle d'abord gerer_portes avec l'action lister." };
      const ds = { ouvrir: OPEN, fermer: CLOSED, verrouiller: LOCKED, deverrouiller: CLOSED }[action];
      await scene.updateEmbeddedDocuments("Wall", cibles.map(id => ({ _id: id, ds })));
      return { contenu: `${cibles.length} porte(s) : ${action}.` };
    }
  },
  {
    nom: "regler_scene",
    description: "Réglages de vision de la carte affichée : vision par jeton (chaque joueur ne voit que ce que voit son jeton), brouillard de guerre "
      + "(desactive, individuel, partage) et remise à zéro du brouillard déjà exploré.",
    schema: objet({
      vision_par_jeton: booleen("true : chaque joueur voit par son jeton ; false : tout est visible."),
      brouillard: { type: "string", enum: ["desactive", "individuel", "partage"], description: "Mode du brouillard de guerre." },
      reinitialiser_brouillard: booleen("true pour effacer ce que les joueurs ont déjà exploré.")
    }),
    sensible: false,
    async executer({ vision_par_jeton, brouillard, reinitialiser_brouillard }) {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const mode = { desactive: CONST.FOG_EXPLORATION_MODES.DISABLED, individuel: CONST.FOG_EXPLORATION_MODES.INDIVIDUAL, partage: CONST.FOG_EXPLORATION_MODES.SHARED }[brouillard];
      await scene.update({ tokenVision: vision_par_jeton, "fog.mode": mode });
      if (reinitialiser_brouillard && canvas.scene === scene) await canvas.fog.reset();
      return { contenu: `« ${scene.name} » : vision par jeton ${vision_par_jeton ? "activée" : "désactivée"}, brouillard ${brouillard}${reinitialiser_brouillard ? ", brouillard remis à zéro" : ""}.` };
    }
  }
);

// ---------------------------------------------------------------- Contrôle des mouvements et du combat

OUTILS.push(
  {
    nom: "bloquer_mouvements",
    description: "Empêche (ou autorise de nouveau) des personnages joueurs de déplacer leur jeton : entraves, paralysie, passage interdit, "
      + "moment de narration. Le joueur voit la raison s'il essaie de bouger. « tous » = tous les personnages joueurs. "
      + "Pour figer tout le monde, la pause suffit.",
    schema: objet({
      personnages: { type: "array", items: chaine("Nom d'un personnage, ou « tous »."), description: "Personnages concernés." },
      bloque: booleen("true = bloqué, false = libéré."),
      raison: chaine("Ce que voit le joueur s'il essaie de bouger (ex. « Vous êtes entravé. »).")
    }),
    sensible: false,
    async executer({ personnages, bloque, raison }) {
      const acteurs = await acteursVises(personnages);
      if (!acteurs.length) return { erreur: true, contenu: `Aucun personnage trouvé parmi : ${personnages.join(", ")}.` };
      const bloques = foundry.utils.deepClone(lire("mouvementsBloques") ?? {});
      for (const a of acteurs) {
        if (bloque) bloques[a.id] = raison || game.i18n.localize("LAKOUR_MJIA.Mouvement.Bloque");
        else delete bloques[a.id];
      }
      await ecrire("mouvementsBloques", bloques);
      return { contenu: `${acteurs.map(a => a.name).join(", ")} : déplacements ${bloque ? `bloqués (« ${raison} »)` : "libérés"}.` };
    }
  },
  {
    nom: "passer_tour",
    systemes: ["impmal", "dnd5e"],
    description: "En combat, passe au combattant suivant (après avoir joué le tour d'un PNJ), ou au round suivant.",
    schema: objet({ round: booleen("true pour passer directement au round suivant.") }),
    sensible: false,
    async executer({ round }) {
      const combat = game.combats.active;
      if (!combat?.started) return { erreur: true, contenu: "Aucun combat en cours." };
      if (round) await combat.nextRound();
      else await combat.nextTurn();
      return { contenu: `Round ${combat.round}, au tour de ${combat.combatant?.name ?? "?"}.` };
    }
  },
  // Tour par tour (tour-par-tour.js) : le même état que le panneau du MJ humain.
  {
    nom: "combat_etat",
    systemes: ["impmal", "dnd5e"],
    description: "État du combat tour par tour, tel que le voit le MJ humain dans son panneau : étape suivante, combattant actif (PV, "
      + "défense, états), ce qu'il lui reste ce tour (actions, mouvement), ses attaques avec leur portée, les distances en mètres "
      + "vers chaque combattant (défense, portée), l'ordre du tour, et pour un PNJ une proposition d'action sans IA. Lecture seule.",
    schema: objet({}),
    sensible: false,
    async executer() {
      const tour = game.modules.get(ID)?.api?.tour;
      if (!tour?.disponible()) return { erreur: true, contenu: "Pas de tour par tour dans ce système." };
      return { contenu: tour.rapport() };
    }
  },
  {
    nom: "tour_de_table",
    systemes: ["impmal", "dnd5e"],
    description: "Hors combat, donne la parole à chaque personnage présent, dans l'ordre (joueurs puis compagnons IA) : chacun décrit ce "
      + "que fait son personnage, et tu attends que tous aient parlé (ou passé) avant de raconter la suite. « commencer » ouvre un "
      + "tour (ou le suivant), « arreter » le ferme, « etat » dit où il en est.",
    schema: objet({ action: { type: "string", enum: ["commencer", "arreter", "etat"], description: "Ce qu'il faut faire." } }),
    sensible: false,
    async executer({ action }) {
      const tour = game.modules.get(ID)?.api?.tour;
      if (!tour?.disponible()) return { erreur: true, contenu: "Pas de tour de table dans ce système." };
      if (action === "arreter") {
        await tour.arreterTable();
        return { contenu: "Tour de table arrêté." };
      }
      if (action === "commencer") {
        if (game.combats?.active?.started) return { erreur: true, contenu: "Un combat est en cours : le tour par tour s'en charge." };
        const t = await tour.commencerTable();
        if (!t.actif) return { erreur: true, contenu: "Personne à qui donner la parole (aucun personnage de joueur ni compagnon sur la scène)." };
        return { contenu: `Tour de table ${t.tour} ouvert : ${t.ordre.map(o => o.nom).join(", ")}. Attends que chacun ait parlé.` };
      }
      return { contenu: tour.resumePourIA().join("\n") || "Aucun tour de table en cours." };
    }
  }
);

// ---------- Figurants : foules, passants, gardes de faction… Jetons jetables, sans nom ni histoire,
// faits d'un acteur modèle par type (dossier « Figurants (MJ IA) ») ; chaque jeton est une copie non liée.

const DISPOSITIONS = { neutre: 0, hostile: -1, amicale: 1 };
const REPARTITION = {
  type: "string", enum: ["dispersee", "groupee"],
  description: "dispersee : répartis dans toute la pièce (foule, clients, passants) ; groupee : rassemblés autour du centre "
    + "de la pièce ou d'un point (file d'attente, attroupement, patrouille). Jamais collés aux personnages joueurs."
};

async function acteurFigurant(type) {
  const existant = game.actors.find(a => a.getFlag(ID, "figurant") === type);
  if (existant) return existant;
  const sys = adaptateur();
  if (!sys.typePnj) return null;
  const img = game.modules.get(moduleDesFigurants())?.active ? jetonFigurant(type, lire("styleVisuel")) : "icons/svg/mystery-man.svg";
  const dossier = game.folders.find(f => f.type === "Actor" && f.getFlag(ID, "figurants"))
    ?? await Folder.implementation.create({ name: "Figurants (MJ IA)", type: "Actor", flags: { [ID]: { figurants: true } } });
  const { libelle } = TYPES_FIGURANTS[type];
  return Actor.implementation.create({
    name: `Figurant — ${libelle}`, type: sys.typePnj, img, folder: dossier.id,
    prototypeToken: { name: libelle, texture: { src: img }, actorLink: false, disposition: 0 },
    flags: { [ID]: { figurant: type } }
  });
}

OUTILS.push(
  {
    nom: "figurants",
    description: "Peuple le lieu de figurants jetables : foule d'un marché, fidèles d'une chapelle, ouvriers, patrouille, badauds… "
      + "Un lieu habité doit avoir du monde sur la carte : pose-les dès que les joueurs y arrivent ou qu'ils apparaissent dans ton récit, "
      + "retire-les quand ils s'en vont (changer de lieu avec amener_joueurs retire ceux de l'ancien lieu). "
      + "Un figurant n'a ni nom ni histoire : si un joueur l'aborde, réponds selon son comportement ; s'il devient important, "
      + "crée un vrai PNJ (creer_pnj) et retire un figurant.",
    schema: objet({
      action: { type: "string", enum: ["poser", "retirer"], description: "poser un groupe, ou retirer un groupe." },
      groupe: chaine("Nom du groupe, ex. « Foule du marché ». Pour retirer : ce nom, ou « tous »."),
      type: { type: "string", get enum() { return Object.keys(TYPES_FIGURANTS); }, description: "Allure des figurants (ignoré pour retirer)." },
      nombre: entier("Combien (1 à 20 ; ignoré pour retirer)."),
      salle: chaine("Pièce de la carte où les poser, ou vide pour les poser autour des personnages joueurs."),
      pres_de: PRES_DE,
      attitude: { type: "string", enum: Object.keys(DISPOSITIONS), description: "Attitude envers les joueurs (couleur du jeton pour Foundry)." },
      comportement: chaine("Comment ils réagissent si on les aborde, ex. « pressés, ils envoient paître quiconque les retient »."),
      repartition: REPARTITION
    }),
    sensible: false, // réversible et gratuit
    async executer({ action, groupe, type, nombre, salle, pres_de = "", attitude, comportement, repartition }) {
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const nomGroupe = groupe.trim() || "Figurants";
      if (action === "retirer") {
        const tous = nomGroupe.toLowerCase() === "tous";
        const ids = scene.tokens.filter(t => t.getFlag(ID, "figurant")
          && (tous || String(t.getFlag(ID, "groupe")).toLowerCase() === nomGroupe.toLowerCase())).map(t => t.id);
        if (!ids.length) return { erreur: true, contenu: `Aucun figurant « ${nomGroupe} » sur cette scène.` };
        await scene.deleteEmbeddedDocuments("Token", ids);
        return { contenu: `${ids.length} figurant(s) retiré(s).` };
      }
      const acteur = await acteurFigurant(type);
      if (!acteur) return { erreur: true, contenu: "Ce système n'a pas de type de PNJ connu : figurants impossibles." };
      const ou = zoneDePose(scene, { salle, pres_de });
      if (ou.erreur) return { erreur: true, contenu: `${ou.erreur}.` };
      const n = Math.min(20, Math.max(1, nombre || 1));
      // Jamais collés aux personnages joueurs : un anneau libre autour d'eux pour qu'ils puissent bouger.
      const occupees = occupeesDe(scene, ou.g), joueurs = casesDesJoueurs(scene, ou.g);
      let cases;
      if (repartition === "groupee" || ou.cibles) {
        for (const p of joueurs) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) occupees.add(`${p.x + dx},${p.y + dy}`);
        cases = choisirCases(n, ou, occupees);
      } else {
        cases = casesDispersees(n, { zone: ou.zone, limites: ou.g, occupees, proteges: joueurs, graine: Math.floor(Math.random() * 2 ** 31) });
      }
      if (!cases.length) return { erreur: true, contenu: "Plus aucune case libre à cet endroit." };
      const niveau = niveauAffiche(scene);
      const jetons = [];
      for (const c of cases) {
        const jeton = await acteur.getTokenDocument({
          ...versPixels(c, ou.g), level: niveau, hidden: false, disposition: DISPOSITIONS[attitude] ?? 0,
          flags: { [ID]: { figurant: true, groupe: nomGroupe, comportement } }
        });
        jetons.push(jeton.toObject());
      }
      await scene.createEmbeddedDocuments("Token", jetons);
      return { contenu: `${cases.length} figurant(s) « ${nomGroupe} » posé(s)${decrireOu(ou)}${cases.length < n ? " (manque de place)" : ""}.` };
    }
  },
  {
    nom: "retirer_jetons",
    description: "Retire de la carte les jetons de PNJ qui quittent la scène (partis, morts et emportés, disparus). "
      + "Les personnages joueurs ne peuvent pas être retirés. La fiche du PNJ reste : il pourra revenir.",
    schema: objet({ noms: { type: "array", items: chaine("Nom du jeton.") } }),
    sensible: false, // la fiche reste, le jeton se repose d'un appel
    async executer({ noms }) {
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const voulus = noms.map(n => n.trim().toLowerCase());
      const vises = scene.tokens.filter(t => voulus.includes(t.name.toLowerCase()));
      const pj = vises.filter(t => t.actor?.hasPlayerOwner);
      const ids = vises.filter(t => !t.actor?.hasPlayerOwner).map(t => t.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
      const absents = voulus.filter(n => !vises.some(t => t.name.toLowerCase() === n));
      return {
        erreur: !ids.length,
        contenu: `${ids.length} jeton(s) retiré(s).${pj.length ? ` Refusé pour les personnages joueurs : ${pj.map(t => t.name).join(", ")}.` : ""}`
          + `${absents.length ? ` Introuvables : ${absents.join(", ")}.` : ""}`
      };
    }
  }
);

// ---------- Mise en place d'une scène en un seul appel : retraits, personnages joueurs, PNJ, figurants.
// Réutilise les outils ci-dessus, dans l'ordre qui laisse aux PNJ les cases proches des joueurs.

const salleOuVide = chaine("Pièce de la carte, ou vide pour « à côté des personnages joueurs ».");

OUTILS.push({
  nom: "mettre_en_scene",
  description: "Met le plateau en accord avec ta narration, en un seul appel : retire ce qui n'a plus lieu d'être, "
    + "place les personnages joueurs, pose ou déplace chaque PNJ présent (créé s'il n'existe pas encore), et peuple le lieu de figurants ; "
    + "pres_de situe chacun près d'un repère (puits, seuil, autre personnage). C'est l'outil de l'étape « [Mise en place] ». "
    + "Le lieu lui-même (la carte) se règle avant, avec creer_scene puis amener_joueurs.",
  schema: objet({
    retirer: { type: "array", items: chaine("Nom d'un jeton de PNJ, ou nom d'un groupe de figurants, à retirer de la carte.") },
    joueurs: { type: "array", items: objet({ personnage: chaine("Nom du personnage joueur."), salle: chaine("Pièce où il se trouve."), pres_de: PRES_DE }) },
    pnj: {
      type: "array",
      items: objet({
        nom: chaine("Nom du PNJ (un PNJ existant est seulement déplacé)."),
        modele_uuid: chaine("Pour un nouveau PNJ : uuid d'un acteur de compendium à copier, ou vide."),
        description: chaine("Pour un nouveau PNJ : apparence, attitude, motivations, secrets ; vide sinon."),
        salle: salleOuVide,
        pres_de: PRES_DE,
        cache: booleen("true s'il n'est pas encore visible des joueurs (caché, en approche, en embuscade).")
      })
    },
    figurants: {
      type: "array",
      items: objet({
        groupe: chaine("Nom du groupe, ex. « Foule du marché »."),
        type: { type: "string", get enum() { return Object.keys(TYPES_FIGURANTS); }, description: "Allure des figurants." },
        nombre: entier("Combien (1 à 20)."),
        salle: salleOuVide,
        pres_de: PRES_DE,
        attitude: { type: "string", enum: ["neutre", "hostile", "amicale"], description: "Attitude envers les joueurs." },
        comportement: chaine("Comment ils réagissent si on les aborde."),
        repartition: REPARTITION
      })
    }
  }),
  sensible: true, // peut créer des PNJ
  async executer({ retirer, joueurs, pnj, figurants }) {
    const scene = canvas.scene;
    if (!scene) return { erreur: true, contenu: "Aucune scène affichée : crée ou active d'abord la carte du lieu (creer_scene, amener_joueurs)." };
    const outilNomme = nom => OUTILS.find(o => o.nom === nom);
    const rapport = [];
    if (retirer.length) {
      const groupes = new Set(scene.tokens.filter(t => t.getFlag(ID, "figurant")).map(t => String(t.getFlag(ID, "groupe")).toLowerCase()));
      const deGroupe = retirer.filter(n => groupes.has(n.trim().toLowerCase()));
      for (const g of deGroupe) {
        rapport.push((await outilNomme("figurants").executer({ action: "retirer", groupe: g, type: "citoyen", nombre: 1, salle: "", attitude: "neutre", comportement: "" })).contenu);
      }
      const jetons = retirer.filter(n => !deGroupe.includes(n));
      if (jetons.length) rapport.push((await outilNomme("retirer_jetons").executer({ noms: jetons })).contenu);
    }
    if (joueurs.length) {
      rapport.push((await outilNomme("placer_jetons").executer({
        jetons: joueurs.map(j => ({ personnage: j.personnage, salle: j.salle, pres_de: j.pres_de, x: -1, y: -1, cache: false }))
      })).contenu);
    }
    for (const p of pnj) {
      const surLaCarte = scene.tokens.some(t => t.name.toLowerCase() === p.nom.trim().toLowerCase());
      const existe = surLaCarte || await trouverActeur(p.nom);
      const r = existe
        ? await outilNomme("placer_jetons").executer({ jetons: [{ personnage: p.nom, salle: p.salle, pres_de: p.pres_de, x: -1, y: -1, cache: p.cache }] })
        : await outilNomme("creer_pnj").executer({ nom: p.nom, modele_uuid: p.modele_uuid, description: p.description, placer_sur_scene: true, salle: p.salle, pres_de: p.pres_de, cache: p.cache });
      rapport.push(r.contenu);
    }
    for (const f of figurants) {
      rapport.push((await outilNomme("figurants").executer({ action: "poser", ...f })).contenu);
    }
    const carte = carteDeScene(scene);
    return {
      contenu: `${rapport.length ? rapport.join("\n") : "Rien à changer sur le plateau."}`
        + `${carte ? `\n\nPlateau obtenu (vue de dessus) :\n${carte}` : ""}`
    };
  }
});

// ---------------------------------------------------------------- Compagnons IA (docs/compagnons.md)
// Des personnages côté joueurs, sans joueur, joués par une IA à part (compagnons.js, compagnons-jeu.js) qui ne sait que ce que
// sait son personnage. Aux Veillées, ils viennent de loups_distribuer (compagnons) ; en 40k et en Warcraft, de compagnon_ajouter.
const SYSTEMES_AVENTURE = ["impmal", "dnd5e"];
const OUTIL_CREATION = { impmal: "creer_personnage", dnd5e: "creer_personnage_dnd5e" };

// Pose le jeton d'un compagnon près du groupe (ou d'un repère), sur la carte affichée.
async function poserCompagnon(acteur, pres_de = "") {
  const scene = canvas?.scene;
  if (!scene) return " Aucune carte affichée : pose son jeton plus tard (placer_jetons ou amener_joueurs).";
  if (scene.tokens.some(t => t.actor?.id === acteur.id)) return " Son jeton est déjà sur la carte.";
  let ou = zoneDePose(scene, { pres_de, sauf: acteur.name });
  let remarque = "";
  if (ou.erreur) { remarque = ` (${ou.erreur} : posé à côté du groupe)`; ou = zoneDePose(scene); }
  const [libre] = choisirCases(1, ou, occupeesDe(scene, ou.g));
  const c = libre ?? ou.centre;
  const jeton = await acteur.getTokenDocument({ ...versPixels(c, ou.g), hidden: false, level: niveauAffiche(scene) });
  await scene.createEmbeddedDocuments("Token", [jeton.toObject()]);
  return ` Jeton posé${decrireOu(ou)}, case ${c.x},${c.y}.${remarque}`;
}

OUTILS.push(
  {
    nom: "compagnon_ajouter",
    systemes: SYSTEMES_AVENTURE,
    description: "Ajoute au groupe un COMPAGNON IA : un personnage côté joueurs, sans joueur, joué par une IA à part qui ne sait que ce que sait "
      + "son personnage (il parle dans le chat sous son nom, réagit à tes narrations, agit à son tour en combat, vote). Sa fiche est COMPLÈTE, "
      + "comme celle d'un joueur : donne creation (les arguments de creer_personnage en Imperium Maledictum, de creer_personnage_dnd5e en D&D 5e, "
      + "en JSON ; fais toi-même les choix, et les tirages avec lancer_des), ou fiche_existante (une fiche sans joueur déjà créée). "
      + "Son jeton est posé près du groupe.",
    schema: objet({
      nom: chaine("Nom du compagnon."),
      creation: chaine("Arguments complets de l'outil de création du système, en JSON (joueur et acteur_existant sont ignorés) ; vide si fiche_existante."),
      fiche_existante: chaine("Nom d'une fiche de personnage sans joueur à faire compagnon ; vide si creation."),
      temperament: { type: "string", enum: Object.keys(TEMPERAMENTS), description: "Son tempérament, qui guide sa façon de jouer." },
      facon_de_parler: chaine(`Sa façon de parler (ex. « ${FACONS_DE_PARLER[0]} », « ${FACONS_DE_PARLER[2]} ») ; vide = au hasard.`),
      histoire: chaine("Deux ou trois phrases : d'où il vient, ce qu'il veut, ce qui le lie au groupe (il s'en sert pour jouer)."),
      pres_de: PRES_DE
    }),
    sensible: true,
    async executer({ nom, creation, fiche_existante, temperament, facon_de_parler, histoire, pres_de = "" }) {
      let acteur = null;
      let rapport = "";
      if (creation.trim()) {
        const def = OUTILS.find(o => o.nom === OUTIL_CREATION[game.system.id]);
        if (!def) return { erreur: true, contenu: "Pas de création de personnage dans ce système." };
        let args;
        try { args = JSON.parse(creation); } catch (e) { return { erreur: true, contenu: `creation n'est pas du JSON valide : ${e.message}` }; }
        if (!args || typeof args !== "object" || Array.isArray(args)) return { erreur: true, contenu: "creation doit être un objet JSON." };
        args = { ...args, nom: nom.trim() || String(args.nom ?? ""), joueur: "", acteur_existant: "" };
        const invalides = validerSchema(def.schema, args);
        if (invalides.length) return { erreur: true, contenu: `Arguments de ${def.nom} invalides, rien n'a été créé : ${invalides.join(" ; ")}.` };
        const r = await def.executer(args);
        if (r.erreur) return { erreur: true, contenu: `${def.nom} : ${r.contenu}` };
        rapport = r.contenu;
        acteur = game.actors.filter(a => a.type === "character" && a.name === args.nom && !a.hasPlayerOwner).at(-1) ?? null;
        if (!acteur) return { erreur: true, contenu: `La fiche « ${args.nom} » a été créée mais reste introuvable : ${rapport}` };
      } else if (fiche_existante.trim()) {
        acteur = await trouverActeur(fiche_existante);
        if (!acteur) return { erreur: true, contenu: `Fiche introuvable : ${fiche_existante}.` };
        if (acteur.hasPlayerOwner) return { erreur: true, contenu: `${acteur.name} est la fiche d'un joueur : elle ne peut pas devenir un compagnon IA.` };
      } else {
        return { erreur: true, contenu: "Donne creation (nouvelle fiche complète) ou fiche_existante." };
      }
      await acteur.update({ [`flags.${ID}.compagnon`]: {
        temperament, parler: facon_de_parler.trim() || personnaliteAuHasard(acteur.id).parler, histoire: histoire.trim()
      } });
      const pose = await poserCompagnon(acteur, pres_de);
      return { contenu: `${acteur.name} rejoint le groupe comme compagnon IA (${TEMPERAMENTS[temperament].libelle}).${pose}`
        + `${rapport ? `\n${rapport}` : ""}\nIl jouera seul : traite-le comme un joueur, ne lui souffle rien que son personnage ne sache.` };
    }
  },
  {
    nom: "compagnon_retirer",
    systemes: SYSTEMES_AVENTURE,
    description: "Retire un compagnon IA du groupe. mode « depart » : il s'en va (son jeton quitte la carte, sa fiche reste dans le monde) ; "
      + "mode « pnj » : il reste mais devient un simple PNJ, que tu joues toi-même. Dans les deux cas l'IA cesse de le jouer et oublie ce qu'il savait en privé.",
    schema: objet({
      compagnon: chaine("Nom du compagnon."),
      mode: { type: "string", enum: ["depart", "pnj"], description: "depart : il quitte le groupe ; pnj : il devient un PNJ." }
    }),
    sensible: true,
    async executer({ compagnon, mode }) {
      const a = trouverCompagnon(compagnon);
      if (!a) return { erreur: true, contenu: `Compagnon introuvable : ${compagnon} (compagnons : ${compagnonsDuMonde().map(x => x.name).join(", ") || "aucun"}).` };
      if (typeof a.unsetFlag === "function") await a.unsetFlag(ID, "compagnon");
      else await a.update({ [`flags.${ID}.compagnon`]: null });
      await oublierPrive(a.id);
      let retires = 0;
      if (mode === "depart" && canvas?.scene) {
        const ids = canvas.scene.tokens.filter(t => t.actor?.id === a.id).map(t => t.id);
        if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Token", ids);
        retires = ids.length;
      }
      return { contenu: mode === "pnj" ? `${a.name} n'est plus un compagnon IA : c'est désormais un PNJ, que tu joues.`
        : `${a.name} quitte le groupe${retires ? " (jeton retiré de la carte)" : ""} ; sa fiche reste dans le monde.` };
    }
  },
  {
    nom: "compagnons",
    description: "Liste les compagnons IA (personnages côté joueurs joués par une IA) : fiche, tempérament, façon de parler, présent ou non "
      + "(aux Veillées : vivant ou mort). Pour toi seul.",
    schema: objet({}),
    sensible: false,
    async executer() {
      const tous = compagnonsDuMonde();
      if (!tous.length) {
        return { contenu: `Aucun compagnon IA.${game.system.id === "lakour-loups" ? " Aux Veillées : loups_distribuer avec compagnons." : " compagnon_ajouter pour en créer un."}` };
      }
      const presents = new Set(compagnonsPresents().map(a => a.id));
      const sys = adaptateur();
      return { contenu: `Compagnons IA (pour toi seul) :\n${tous.map(a => {
        const p = personnaliteDe(a);
        return `- ${sys.resumer(a)} — ${TEMPERAMENTS[p.temperament].libelle}, ${p.parler}${p.histoire ? ` ; ${p.histoire}` : ""} — ${presents.has(a.id) ? "présent" : "absent"}`;
      }).join("\n")}` };
    }
  },
  {
    nom: "jet_compagnon",
    systemes: SYSTEMES_AVENTURE,
    description: "Lance DIRECTEMENT un test d'un compagnon IA avec SA fiche, sans fenêtre (personne n'est là pour la valider) : compétence ou "
      + "caractéristique, difficulté, modificateur. Le jet paraît dans le chat et tu reçois le résultat. Pour une attaque : en Imperium "
      + "Maledictum, melee ou ranged ; en D&D 5e, lancer_des avec le bonus d'attaque de sa fiche. Les dégâts : lancer_des.",
    schema: objet({
      compagnon: chaine("Nom du compagnon."),
      competence: chaine("Clé de compétence, comme pour demander_jet (« ranged », « athletics », « prc », « carac:dex », « sauv:con »…)."),
      difficulte: { type: "string", enum: DIFFICULTES, description: "Difficulté du test (« aucune » = celle par défaut)." },
      modificateur: entier("Bonus ou malus de situation (0 si aucun)."),
      raison: chaine("Ce qu'il tente, en quelques mots.")
    }),
    sensible: false,
    async executer({ compagnon, competence, difficulte, modificateur, raison }) {
      const a = trouverCompagnon(compagnon);
      if (!a) return { erreur: true, contenu: `Compagnon introuvable : ${compagnon} (compagnons : ${compagnonsDuMonde().map(x => x.name).join(", ") || "aucun"}).` };
      try {
        const r = await adaptateur().lancerDirect(a, competence.trim(), { difficulte, modificateur, titre: raison });
        return { contenu: r.texte };
      } catch (e) {
        return { erreur: true, contenu: `Jet impossible : ${e.message}` };
      }
    }
  }
);

// ---------------------------------------------------------------- Décisions des joueurs : vote de groupe et choix secret
// Tous les systèmes (pas de « systemes ») : une fenêtre s'ouvre chez les joueurs visés, par le canal du module
// (decisions.js, canal.js). Les textes rendus à l'IA ne parlent que par noms.

// Délai en secondes donné par l'IA : 0 = valeur par défaut, sinon borné.
const delaiBorne = (s, defaut, min, max) => (s > 0 ? Math.min(max, Math.max(min, Math.round(s))) : defaut);
const joueursConnectes = () => game.users.filter(u => u.active && !u.isGM);
const listeJoueurs = () => joueursConnectes().map(nomPourIA).join(", ") || "aucun";

OUTILS.push(
  {
    nom: "vote_groupe",
    description: "Fait voter le groupe sur une décision collective qui le divise (attaquer ou négocier, qui envoyer, quelle route) : une fenêtre "
      + "s'ouvre chez chaque joueur visé, avec la question, les options et un délai ; chacun vote ou s'abstient, les voix restent cachées "
      + "jusqu'à la clôture, puis le résultat paraît dans le chat. « ouvrir » rend la main aussitôt : le résultat te sera transmis à la "
      + "clôture (délai écoulé ou tout le monde a voté). « clore » termine le vote tout de suite et te rend le décompte. Un seul vote à la fois.",
    schema: objet({
      action: { type: "string", enum: ["ouvrir", "clore"], description: "ouvrir un vote, ou clore celui en cours." },
      question: chaine("La question posée au groupe (vide pour clore)."),
      options: { type: "array", items: chaine("Une option."), description: `2 à ${MAX_OPTIONS} options en texte libre (« On attaque le convoi », `
        + "« On négocie », « On fuit »), ou des noms de personnages si personnages vaut true. Vide pour clore." },
      personnages: booleen("true si les options sont des personnages (noms exacts : leur portrait s'affiche)."),
      joueurs: { type: "array", items: chaine("Nom d'un joueur, de son personnage ou d'un compagnon IA."), description: "Qui vote ; vide = tous les joueurs connectés et les compagnons IA présents." },
      delai: entier(`Délai en secondes (15 à 600 ; 0 = ${DELAI_VOTE}).`),
      anonyme: booleen("true : le chat ne montre que les totaux, pas qui a voté quoi.")
    }),
    sensible: false,
    async executer({ action, question, options, personnages, joueurs, delai, anonyme }) {
      if (action === "clore") {
        const r = await cloreVote({ cause: "outil" });
        return r ? { contenu: r.texte } : { erreur: true, contenu: "Aucun vote de groupe n'est ouvert." };
      }
      let choix = options.map(o => o.trim()).filter(Boolean);
      if (personnages) {
        const acteurs = [];
        for (const nom of choix) {
          const a = await trouverActeur(nom);
          if (!a) return { erreur: true, contenu: `Personnage introuvable : ${nom}. Donne les noms exacts.` };
          acteurs.push({ libelle: a.name, img: a.img ?? "" });
        }
        choix = acteurs;
      }
      let votants, compagnons;
      const absents = [];
      if (joueurs.length) {
        votants = [];
        compagnons = [];
        for (const nom of joueurs) {
          const u = trouverJoueur(nom);
          const c = u ? null : trouverCompagnon(nom);
          if (c) { compagnons.push(c); continue; }
          if (!u) return { erreur: true, contenu: `Joueur introuvable : ${nom} (joueurs connectés : ${listeJoueurs()}).` };
          if (u.active) votants.push(u);
          else absents.push(nomPourIA(u));
        }
      } else {
        votants = joueursConnectes();
        compagnons = compagnonsPresents();
      }
      if (!votants.length && !compagnons.length) return { erreur: true, contenu: `Aucun joueur connecté pour voter${absents.length ? ` (pas connecté : ${absents.join(", ")})` : ""}.` };
      const secondes = delaiBorne(delai, DELAI_VOTE, 15, 600);
      let v;
      try {
        v = ouvrirVote({ question, options: choix, votants, compagnons, delai: secondes * 1000, anonyme });
      } catch (erreur) {
        return { erreur: true, contenu: `Vote non ouvert : ${erreur.message}` };
      }
      const qui = [...votants.map(nomPourIA), ...compagnons.map(a => `${a.name} (compagnon IA)`)];
      return {
        contenu: `Vote ouvert chez ${qui.join(", ")} : « ${v.question} » (options : ${v.options.map(o => `« ${o} »`).join(", ")}).`
          + `${absents.length ? ` Pas connecté, donc sans fenêtre : ${absents.join(", ")}.` : ""}`
          + ` Clôture dans ${secondes} s ou dès que tous auront voté ; le résultat te sera transmis. Les voix restent cachées d'ici là.`
      };
    }
  },
  {
    nom: "choix_secret",
    description: "Pose à UN joueur un choix que les autres ne voient pas (trahir ou non, ce qu'il glisse dans sa poche, ce qu'il répond à "
      + "l'émissaire) : une fenêtre s'ouvre chez lui seul, avec la question, les options et un délai ; il choisit ou passe. ATTEND sa réponse "
      + "(ou la fin du délai) et te la rend. Rien ne paraît dans le chat : toi seul la connais. Ne la révèle pas aux autres joueurs, "
      + "fais-en sentir les conséquences dans le récit.",
    schema: objet({
      joueur: chaine("Nom du joueur, de son personnage ou d'un compagnon IA."),
      question: chaine("La question, avec le contexte utile : il la lit seul, hors du chat."),
      options: { type: "array", items: chaine("Une option."), description: `2 à ${MAX_OPTIONS} options.` },
      delai: entier(`Délai en secondes (10 à 300 ; 0 = ${DELAI_CHOIX}).`)
    }),
    sensible: false,
    async executer({ joueur, question, options, delai }) {
      const u = trouverJoueur(joueur);
      // Un compagnon IA répond par son cerveau, avec ce que sait son personnage ; sa réponse ne revient qu'à toi.
      const compagnon = u ? null : trouverCompagnon(joueur);
      if (!u && !compagnon) return { erreur: true, contenu: `Joueur introuvable : ${joueur} (joueurs connectés : ${listeJoueurs()}).` };
      const nom = compagnon ? `${compagnon.name} (compagnon IA)` : nomPourIA(u);
      if (u && !u.active) return { erreur: true, contenu: `${nom} n'est pas connecté : impossible de lui poser ce choix.` };
      const secondes = delaiBorne(delai, DELAI_CHOIX, 10, 300);
      let r;
      try {
        r = await demanderChoix({ utilisateur: u, compagnon, question, options, delai: secondes * 1000, titre: compagnon?.name ?? u.character?.name ?? u.name });
      } catch (erreur) {
        return { erreur: true, contenu: `Choix non posé : ${erreur.message}` };
      }
      const q = question.trim();
      if (r.raison === "repondu") {
        return { contenu: `Choix secret de ${nom} (« ${q} ») : « ${r.libelle} ». Personne d'autre ne le sait : ne le révèle pas aux autres joueurs, `
          + "fais-en sentir les conséquences." };
      }
      if (r.raison === "passe") return { contenu: `${nom} a passé sans choisir (« ${q} ») : il refuse, hésite ou se tait. À toi d'en tenir compte.` };
      if (r.raison === "delai") return { contenu: `${nom} n'a pas répondu dans les ${secondes} s (« ${q} ») : considère qu'il hésite et n'a rien fait, ou repose la question plus tard.` };
      if (r.raison === "deconnecte") return { contenu: `${nom} s'est déconnecté avant de répondre (« ${q} »).` };
      return { erreur: true, contenu: `${nom} n'est pas connecté : impossible de lui poser ce choix.` };
    }
  }
);

// ---------------------------------------------------------------- La scène se modifie en jouant
// Zones (Region), épingles (Note) et sons localisés (AmbientSound) ajoutés à la scène affichée, en cases comme placer_jetons,
// sur le niveau v14 affiché. Les zones sont invisibles des joueurs ; une épingle n'est vue que de qui peut lire son journal.

const nomEgal = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const zoneNommee = (scene, nom) => scene.regions.find(r => nomEgal(r.name, nom)) ?? scene.regions.get(nom.trim()) ?? null;
const dansLaGrille = (g, x, y, l = 1, h = 1) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + l <= g.largeur && y + h <= g.hauteur;
const centreDeCase = (g, x, y) => ({ x: Math.round(g.sceneX + (x + 0.5) * g.size), y: Math.round(g.sceneY + (y + 0.5) * g.size) });
const niveauxDe = scene => { const n = niveauAffiche(scene); return n ? [n] : []; };
const casesDeBornes = (b, g) => {
  const x = Math.round((b.x - g.sceneX) / g.size), y = Math.round((b.y - g.sceneY) / g.size);
  return `cases ${x},${y} (${Math.max(1, Math.round(b.width / g.size))}×${Math.max(1, Math.round(b.height / g.size))})`;
};
const LIBELLES_COMPORTEMENT = { displayScrollingText: "texte", teleportToken: "teleport", pauseGame: "pause", adjustDarknessLevel: "obscurite" };

// Le journal du monde d'un journal ou d'une page (une épingle ne vise que le monde) : venu d'un compendium, sa copie (même
// source, ou même clé de module de contenu), sinon importée avec ses droits. -> { entree, page, importe } | { erreur }.
async function journalAEpingler(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc || !["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return { erreur: `Aucun journal ni page à cet uuid : ${uuid || "(vide)"}.` };
  let page = doc.documentName === "JournalEntryPage" ? doc : null;
  let entree = page ? page.parent : doc, importe = false;
  if (entree.pack) {
    const cle = Object.values(entree.flags ?? {}).find(f => f?.cle)?.cle;
    let copie = game.journal.find(j => j._stats?.compendiumSource === entree.uuid || (cle && Object.values(j.flags ?? {}).some(f => f?.cle === cle)));
    if (!copie) {
      copie = await JournalEntry.implementation.create(game.journal.fromCompendium(entree, { keepId: true, clearOwnership: false }));
      importe = true;
    }
    if (page) {
      const nom = page.name;
      page = copie.pages.get(page.id) ?? copie.pages.find(p => p.name === nom);
      if (!page) return { erreur: `La page « ${nom} » manque dans la copie du monde de « ${copie.name} ».` };
    }
    entree = copie;
  }
  return { entree, page, importe };
}

OUTILS.push(
  {
    nom: "lieux_scene",
    description: "Ce qui est posé sur la carte affichée, invisible ou discret : zones (nom, effet, cases), épingles vers les journaux "
      + "(case, texte, journal et page avec leur uuid pour lire_document, réservées au MJ ou non) et sons localisés. "
      + "Regarde-le avant d'ajouter ou de retirer une zone, une épingle ou un son, ou pour savoir quelle page du journal du MJ décrit un lieu.",
    schema: objet({}),
    sensible: false,
    async executer() {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const g = grilleDe(scene);
      const zones = scene.regions.contents.map(r => {
        const effets = r.behaviors.contents.map(b => LIBELLES_COMPORTEMENT[b.type] ?? b.type).join(", ") || "aucun effet";
        return `- « ${r.name} » (${r.id}) — ${effets}, ${casesDeBornes(r.bounds, g)}`;
      });
      const epingles = scene.notes.contents.map(n => {
        const entree = n.entry, page = n.page;
        const cible = page ? `page « ${page.name} » de « ${entree.name} » (${page.uuid})` : entree ? `« ${entree.name} » (${entree.uuid})` : "journal introuvable";
        const secret = entree && !lisibleDesJoueurs(entree, page) ? ", MJ seulement" : "";
        return `- ${n.id} — case ${caseDe(scene, n.x, n.y)}${n.text ? `, « ${n.text} »` : ""} → ${cible}${secret}`;
      });
      const sons = scene.sounds.contents.map(s => `- ${s.id} — ${s.name || s.path}, case ${caseDe(scene, s.x, s.y)}, `
        + `portée ${Math.round(s.radius / scene.grid.distance)} cases${s.hidden ? ", coupé" : ""}`);
      const partie = (titre, l) => `${titre} :\n${l.length ? l.join("\n") : "(aucune)"}`;
      return { contenu: [`« ${scene.name} » :`, partie("Zones", zones), partie("Épingles", epingles), partie("Sons localisés", sons)].join("\n") };
    }
  },
  {
    nom: "zone_scene",
    description: "Ajoute ou retire une zone invisible des joueurs sur la carte affichée, en cases (x, y, l, h) : « texte » s'élève "
      + "au-dessus du jeton qui entre (inscription, odeur, indice) ; « pause » met la partie en pause à l'entrée d'un personnage (piège, "
      + "révélation : tu reprends la main) ; « obscurite » règle l'obscurité dans la zone ; « teleport » envoie le jeton vers une autre zone "
      + "de la même scène (escalier, trappe, passage secret : crée d'abord la zone d'arrivée). Le nom d'une zone est unique ; lieux_scene les liste.",
    schema: objet({
      action: { type: "string", enum: ["ajouter", "retirer"], description: "ajouter une zone, ou retirer la zone de ce nom." },
      nom: chaine("Nom de la zone (unique sur la scène ; pour retirer : son nom ou son identifiant)."),
      ...caseXY,
      l: entier("Largeur en cases (1 au moins). Pour retirer : 0."),
      h: entier("Hauteur en cases (1 au moins). Pour retirer : 0."),
      type: { type: "string", enum: TYPES_ZONE, description: "Effet de la zone (ignoré pour retirer)." },
      texte: chaine("Pour « texte » : ce qui s'élève au-dessus du jeton qui entre. Sinon vide."),
      vers: chaine("Pour « teleport » : nom d'une AUTRE zone existante de la scène, l'arrivée. Sinon vide."),
      obscurite: { type: "number", description: "Pour « obscurite » : 0 (clair) à 1 (noir). Sinon 0." },
      unique: booleen("Pour « texte » et « pause » : true = une seule fois (conseillé) ; false = à chaque entrée.")
    }),
    sensible: true,
    async executer({ action, nom, x, y, l, h, type, texte, vers, obscurite, unique }) {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const noms = () => scene.regions.map(r => `« ${r.name} »`).join(", ") || "aucune";
      if (!nom?.trim()) return { erreur: true, contenu: "Donne un nom à la zone." };
      nom = nom.trim();
      if (action === "retirer") {
        const zone = zoneNommee(scene, nom);
        if (!zone) return { erreur: true, contenu: `Zone « ${nom} » introuvable (zones : ${noms()}).` };
        // Une téléportation qui y menait ne mène plus nulle part : à retirer aussi, ou à refaire.
        const orphelines = scene.regions.filter(r => r.id !== zone.id
          && r.behaviors.some(b => [...(b.system?.destinations ?? [])].some(d => String(d).endsWith(zone.id))));
        await scene.deleteEmbeddedDocuments("Region", [zone.id]);
        return { contenu: `Zone « ${zone.name} » retirée.${orphelines.length
          ? ` Ces téléportations y menaient et ne mènent plus nulle part : ${orphelines.map(r => `« ${r.name} »`).join(", ")}.` : ""}` };
      }
      const g = grilleDe(scene);
      if (!TYPES_ZONE.includes(type)) return { erreur: true, contenu: `Type de zone « ${type} » inconnu (${TYPES_ZONE.join(", ")}).` };
      if (!(l >= 1 && h >= 1 && dansLaGrille(g, x, y, l, h))) {
        return { erreur: true, contenu: `Zone « ${nom} » (${x},${y} ${l}×${h}) hors de la carte (${g.largeur}×${g.hauteur} cases).` };
      }
      if (zoneNommee(scene, nom)) return { erreur: true, contenu: `Une zone « ${nom} » existe déjà : choisis un autre nom, ou retire-la d'abord.` };
      const arrivee = type === "teleport" ? zoneNommee(scene, vers ?? "") : null;
      if (type === "teleport" && !arrivee) return { erreur: true, contenu: `Zone d'arrivée « ${vers} » inconnue sur cette scène (zones : ${noms()}). Crée-la d'abord.` };
      // Identifiant libre de la nouvelle région ; la téléportation vise la vraie région d'arrivée (UUID relatif « ..id »).
      let id, n = scene.regions.size;
      do id = idStable(`zone:${scene.id}:${nom}:${n++}`); while (scene.regions.has(id));
      const idZone = z => (z === nom ? id : zoneNommee(scene, z)?.id);
      const nomsZones = new Set([...scene.regions.map(r => r.name), nom]);
      const r = zoneVersRegion({ nom, x, y, l, h, type, texte, vers: arrivee?.name, obscurite, unique },
        { taille: g.size, idZone, nomsZones, niveau: niveauAffiche(scene) });
      if (r.erreur) return { erreur: true, contenu: `Zone refusée : ${r.erreur}.` };
      const { region } = r;
      for (const f of region.shapes) { f.x += g.sceneX; f.y += g.sceneY; }
      region.flags = { [ID]: { zone: true } };
      await scene.createEmbeddedDocuments("Region", [region], { keepId: true });
      const effet = { texte: `texte « ${texte} »`, teleport: `téléportation vers « ${arrivee?.name} »`, pause: "pause de la partie", obscurite: `obscurité ${obscurite}` }[type];
      const fois = ["texte", "pause"].includes(type) ? (unique === false ? ", à chaque entrée" : ", une seule fois") : "";
      return { contenu: `Zone « ${nom} » ajoutée (${id}) en ${x},${y} (${l}×${h} cases) : ${effet}${fois}. Invisible des joueurs.` };
    }
  },
  {
    nom: "epingle",
    description: "Sur la carte affichée, en cases : épingle un lieu clé vers son journal ou sa page (uuid : lien @UUID du journal du MJ, "
      + "ou lieux_scene), ou pose un son d'ambiance localisé (feu d'une forge, mer, foule…), ou retire une épingle ou un son par son identifiant "
      + "(lieux_scene). Une épingle n'est visible que de qui peut lire son journal : celle d'un journal du MJ reste au MJ ; celle d'une aide "
      + "de jeu se voit des joueurs, texte compris (n'y écris aucun secret).",
    schema: objet({
      action: { type: "string", enum: ["epingler", "son", "retirer"], description: "epingler un journal, poser un son, ou retirer (par identifiant)." },
      uuid: chaine("Pour epingler : uuid du journal ou de la page. Sinon vide."),
      ...caseXY,
      texte: chaine("Pour epingler : libellé de l'épingle (vide = nom de la page). Pour son : ce qui sonne (ex. « Forge de Brann »). Sinon vide."),
      son: { type: "string", enum: ["aucun", ...SONS_AMBIANCE], description: "Pour son : l'ambiance. Sinon « aucun »." },
      rayon: entier("Pour son : portée en cases. Sinon 0."),
      volume: { type: "number", description: "Pour son : volume de 0 à 1 (0,3 discret). Sinon 0." },
      id: chaine("Pour retirer : identifiant de l'épingle ou du son (lieux_scene). Sinon vide.")
    }),
    sensible: true,
    async executer({ action, uuid, x, y, texte, son, rayon, volume, id }) {
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      if (action === "retirer") {
        const type = scene.notes.has(id) ? "Note" : scene.sounds.has(id) ? "AmbientSound" : null;
        if (!type) return { erreur: true, contenu: `Aucune épingle ni aucun son « ${id} » sur cette carte : appelle lieux_scene pour les identifiants.` };
        await scene.deleteEmbeddedDocuments(type, [id]);
        return { contenu: type === "Note" ? `Épingle ${id} retirée.` : `Son ${id} retiré.` };
      }
      const g = grilleDe(scene);
      if (!dansLaGrille(g, x, y)) return { erreur: true, contenu: `Case ${x},${y} hors de la carte (${g.largeur}×${g.hauteur} cases).` };
      const centre = centreDeCase(g, x, y);
      if (action === "son") {
        if (!SONS_AMBIANCE.includes(son)) return { erreur: true, contenu: `Son « ${son} » inconnu (${SONS_AMBIANCE.join(", ")}).` };
        if (!(rayon >= 1)) return { erreur: true, contenu: `Portée ${rayon} : 1 case au moins.` };
        if (!(volume > 0 && volume <= 1)) return { erreur: true, contenu: `Volume ${volume} : entre 0 (exclu) et 1.` };
        const [cree] = await scene.createEmbeddedDocuments("AmbientSound", [{
          name: texte?.trim() ? `${son} — ${texte.trim()}` : son, ...centre, elevation: 0, levels: niveauxDe(scene),
          radius: rayon * scene.grid.distance, path: cheminSon(son), repeat: true, volume,
          walls: true, easing: true, hidden: false, locked: false, flags: { [ID]: { son: true } }
        }]);
        return { contenu: `Son « ${son} » posé en ${x},${y} (portée ${rayon} cases, identifiant ${cree.id}) : on l'entend en approchant.` };
      }
      const cible = await journalAEpingler(uuid);
      if (cible.erreur) return { erreur: true, contenu: cible.erreur };
      const { entree, page, importe } = cible;
      const [cree] = await scene.createEmbeddedDocuments("Note", [{
        entryId: entree.id, pageId: page?.id ?? null, ...centre, elevation: 0, levels: niveauxDe(scene), sort: 0, locked: false,
        texture: { src: "icons/svg/book.svg", anchorX: 0.5, anchorY: 0.5, fit: "contain", scaleX: 1, scaleY: 1, tint: "#ffffff" },
        iconSize: 40, text: texte?.trim() ?? "", fontFamily: "", fontSize: 24, textAnchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        textColor: "#ffffff", global: false, flags: { [ID]: { epingle: true } }
      }]);
      const qui = lisibleDesJoueurs(entree, page) ? "visible des joueurs (ils peuvent lire ce journal)" : "réservée au MJ (journal du MJ)";
      return { contenu: `Épingle posée en ${x},${y} (${cree.id}) vers ${page ? `la page « ${page.name} » de ` : ""}« ${entree.name} »`
        + `${importe ? " (journal importé du compendium)" : ""}, ${qui}.` };
    }
  }
);

// ---------------------------------------------------------------- Modules tiers : animations, météo, calendrier, butin
// Ces outils déclarent les modules dont ils ont besoin (« modules ») : tant que l'un d'eux n'est pas actif, ils sont absents de la
// liste proposée à l'IA (outilsDuSysteme) et, appelés quand même (vieux fil), ils refusent proprement. API lues dans le code des
// modules : Sequencer 4.3.0 (window.Sequence, Sequencer.Database), JB2A gratuit 0.9.4 (base « jb2a » enregistrée au hook
// sequencer.ready), FXMaster 8.4.2 (game.modules.get("fxmaster").api : presets, effects), Calendaria 1.4.8 (CALENDARIA.api),
// Item Piles 3.3.4 (game.itempiles.API).

export const moduleActif = id => Boolean(globalThis.game?.modules?.get?.(id)?.active);
const sansModules = (...ids) => {
  const absents = ids.filter(id => !moduleActif(id));
  return absents.length ? { erreur: true, contenu: `Module inactif dans ce monde (${absents.join(", ")}) : outil indisponible.` } : null;
};
// Un jeton de la carte, par son nom ou celui de son acteur.
const jetonNomme = (scene, nom) => {
  const n = (nom ?? "").trim().toLowerCase();
  if (!n) return null;
  return scene.tokens.find(t => t.name?.toLowerCase() === n) ?? scene.tokens.find(t => t.actor?.name?.toLowerCase() === n) ?? null;
};

// Liste fermée d'animations, toutes dans la base Sequencer de JB2A gratuit (vérifié par essais/modules-tiers.test.mjs).
// sur_place : sur un jeton (taille × celle du jeton) ou sur une case (taille en cases). trajet : de la source à la cible ;
// pour un projectile ou un rayon, Sequencer choisit le fichier à la bonne longueur (05ft… 90ft).
export const EFFETS_ANIMATION = {
  feu: { base: "jb2a.flames.04.complete.orange", genre: "sur_place", taille: 1.5, libelle: "flammes, embrasement" },
  explosion: { base: "jb2a.explosion.01.orange", genre: "sur_place", taille: 2, libelle: "explosion : grenade, baril, charge" },
  boule_de_feu: { base: "jb2a.fireball.explosion.orange", genre: "sur_place", taille: 4, libelle: "grande déflagration de feu" },
  eclair: { base: "jb2a.lightning_strike.blue", genre: "sur_place", taille: 2, libelle: "la foudre tombe" },
  onde_de_choc: { base: "jb2a.thunderwave.center.blue", genre: "sur_place", taille: 3, libelle: "onde de choc, vague de tonnerre" },
  soin: { base: "jb2a.cure_wounds.400px.blue", genre: "sur_place", taille: 1.5, libelle: "soin, blessures refermées" },
  benediction: { base: "jb2a.bless.400px.intro.yellow", genre: "sur_place", taille: 1.5, libelle: "bénédiction, prière exaucée" },
  chatiment: { base: "jb2a.divine_smite.target.blueyellow", genre: "sur_place", taille: 1.5, libelle: "châtiment divin qui frappe" },
  tenebres: { base: "jb2a.darkness.black", genre: "sur_place", taille: 4, libelle: "ténèbres surnaturelles" },
  poison: { base: "jb2a.markers.poison.dark_green", genre: "sur_place", taille: 1.2, libelle: "empoisonné" },
  effroi: { base: "jb2a.markers.fear.dark_purple", genre: "sur_place", taille: 1.2, libelle: "terreur, effroi" },
  etourdi: { base: "jb2a.markers.stun.purple", genre: "sur_place", taille: 1.2, libelle: "étourdi, sonné" },
  griffes: { base: "jb2a.claws.400px.red", genre: "sur_place", taille: 1.5, libelle: "coup de griffes reçu" },
  morsure: { base: "jb2a.bite.400px.red", genre: "sur_place", taille: 1.5, libelle: "morsure reçue" },
  impact: { base: "jb2a.impact.005.orange", genre: "sur_place", taille: 1.5, libelle: "choc, coup qui porte" },
  fumee: { base: "jb2a.smoke.puff.centered.grey", genre: "sur_place", taille: 2, libelle: "bouffée de fumée" },
  bouclier: { base: "jb2a.shield.01.complete.01.blue", genre: "sur_place", taille: 1.5, libelle: "bouclier, champ protecteur" },
  teleportation: { base: "jb2a.misty_step.01.blue", genre: "sur_place", taille: 1.5, libelle: "apparition, disparition" },
  portail: { base: "jb2a.portals.vertical.ring.bright_yellow", genre: "sur_place", taille: 2, libelle: "portail qui s'ouvre" },
  trait_de_feu: { base: "jb2a.fire_bolt.orange", genre: "trajet", libelle: "trait de feu" },
  rayon_de_givre: { base: "jb2a.ray_of_frost.blue", genre: "trajet", libelle: "rayon de givre" },
  rayon_occulte: { base: "jb2a.eldritch_blast.purple", genre: "trajet", libelle: "rayon occulte, décharge warp" },
  rayon_vert: { base: "jb2a.disintegrate.green", genre: "trajet", libelle: "rayon vert désintégrant, plasma" },
  arc_electrique: { base: "jb2a.chain_lightning.primary.blue", genre: "trajet", libelle: "arc électrique" },
  projectile_magique: { base: "jb2a.magic_missile.purple", genre: "trajet", libelle: "projectile magique" },
  fleche: { base: "jb2a.arrow.physical.white.01", genre: "trajet", libelle: "flèche, carreau" },
  balle: { base: "jb2a.bullet.01.orange", genre: "trajet", libelle: "balle, tir d'arme à feu" },
  tir_laser: { base: "jb2a.lasershot.red", genre: "trajet", libelle: "tir laser (laspistolet, fusil laser)" },
  coup_epee: { base: "jb2a.melee_generic.slash.01.orange", genre: "trajet", libelle: "coup de lame porté au contact" }
};

// Météo : les préréglages gratuits de FXMaster (presets), et quelques particules seules (effects) aux identifiants stables
// de l'espace « apiMacro_ » de FXMaster, pour les couper sans toucher au reste.
export const METEOS = {
  pluie: { prereglage: "rain" }, bruine: { prereglage: "drizzle" }, averse: { prereglage: "monsoon" },
  orage: { prereglage: "thunderstorm" }, tempete: { prereglage: "hurricane" }, neige: { prereglage: "snow" },
  blizzard: { prereglage: "blizzard" }, grele: { prereglage: "hail" }, gresil: { prereglage: "sleet" },
  brouillard: { prereglage: "fog" }, brume: { prereglage: "mist" }, nappes_de_brouillard: { prereglage: "rolling-fog" },
  nuages: { prereglage: "cloudy" }, ciel_couvert: { prereglage: "overcast" }, chaleur: { prereglage: "heat-wave" },
  feuilles_mortes: { prereglage: "autumn-leaves" }, fumee_incendie: { prereglage: "wildfire-smoke" },
  spores: { prereglage: "spore-cloud" }, pluie_acide: { prereglage: "acid-rain" }, pluie_de_sang: { prereglage: "blood-rain" },
  braises: { particules: [{ type: "embers", options: { density: 0.7 } }] },
  cendres: { particules: [{ type: "snow", options: { density: 0.4, speed: 0.2, tint: { apply: true, value: "#6e6a66" } } }] },
  chauves_souris: { particules: [{ type: "bats", options: { density: 0.05 } }] },
  corbeaux: { particules: [{ type: "crows", options: { density: 0.006 } }] }
};
export const PARTICULES_METEO = ["apiMacro_lakourMeteo0_p", "apiMacro_lakourMeteo1_p"];
// Densité des préréglages (mots de FXMaster) et facteur pour les particules seules (mêmes valeurs que FXMaster : 0,5 / 1 / 1,5).
const INTENSITES = { faible: ["low", 0.5], moyenne: ["medium", 1], forte: ["high", 1.5] };

// Calendaria : moments de advanceTimeToPreset et identifiants de ses préréglages météo (liste intégrée du module).
const MOMENTS = { aube: "sunrise", midi: "midday", crepuscule: "sunset", minuit: "midnight" };
export const METEOS_CALENDRIER = {
  degage: "clear", eclaircies: "partly-cloudy", nuageux: "cloudy", couvert: "overcast", bruine: "drizzle", pluie: "rain",
  brouillard: "fog", brume: "mist", venteux: "windy", neige: "snow", gresil: "sleet", canicule: "heat-wave",
  orage: "thunderstorm", blizzard: "blizzard", grele: "hail", ouragan: "hurricane", tempete_de_glace: "ice-storm",
  mousson: "monsoon", pluie_de_cendres: "ashfall", tempete_de_sable: "sandstorm", fumee_incendie: "wildfire-smoke",
  pluie_acide: "acid-rain", pluie_de_sang: "blood-rain"
};
const traduit = t => (typeof t === "string" && t ? game.i18n.localize(t) : "");
const deuxChiffres = n => String(n ?? 0).padStart(2, "0");

// Ce que dit le calendrier en ce moment : date, heure, jour ou nuit, saison, lune, météo.
function etatCalendrier(api) {
  const d = api.getCurrentDateTime();
  const date = api.formatDate?.(null, "dateLong") || `${d.day}/${d.month}/${d.year}`;
  const morceaux = [`${date}, ${deuxChiffres(d.hour)} h ${deuxChiffres(d.minute)}`];
  if (typeof api.isDaytime === "function") morceaux.push(api.isDaytime() ? "il fait jour" : "il fait nuit");
  const saison = traduit(api.getCurrentSeason?.()?.name);
  if (saison) morceaux.push(`saison : ${saison}`);
  const lune = traduit(api.getMoonPhase?.(0)?.name);
  if (lune) morceaux.push(`lune : ${lune}`);
  const m = api.getCurrentWeather?.();
  morceaux.push(m ? `météo : ${traduit(m.label) || m.id}${Number.isFinite(m.temperature) ? `, ${m.temperature}°` : ""}` : "météo : non fixée");
  return morceaux.join(" ; ");
}

// Item Piles : l'argent { pp, gp, ep, sp, cp } en chaîne « 10gp 5sp » avec les abréviations des devises configurées
// (API.CURRENCIES, celles du module compagnon « Item Piles: D&D 5e », éventuellement traduites).
export function argentPourItemPiles(argent, devises = []) {
  const morceaux = [], inconnues = [];
  for (const [cle, n] of Object.entries(argent ?? {})) {
    if (!(n > 0)) continue;
    const d = devises.find(c => c.type === "attribute" && String(c.data?.path ?? "").split(".").pop() === cle);
    if (!d?.abbreviation) { inconnues.push(cle); continue; }
    morceaux.push(`${n}${d.abbreviation.toLowerCase().replace("{#}", "").trim()}`);
  }
  return { texte: morceaux.join(" "), inconnues };
}
const IMAGE_COFFRE = "icons/svg/chest.svg";
const DEVISES_DND = ["pp", "gp", "ep", "sp", "cp"];

// Objets à mettre dans un tas : copies des objets désignés par uuid (compendium ou monde), quantité comprise.
async function objetsPourTas(objets) {
  const donnees = [];
  for (const o of objets) {
    const d = await fromUuid(o.uuid).catch(() => null);
    if (d?.documentName !== "Item") return { erreur: `Objet introuvable : ${o.uuid}.` };
    const copie = d.pack ? game.items.fromCompendium(d) : d.toObject();
    delete copie._id;
    // Quantité portée par l'objet lui-même (system.quantity de D&D 5e), comme donner_objets.
    if (o.quantite > 1 && copie.system && "quantity" in copie.system) copie.system.quantity = (copie.system.quantity ?? 1) * o.quantite;
    donnees.push({ item: copie });
  }
  return { donnees };
}

OUTILS.push(
  {
    nom: "animation",
    modules: ["sequencer", "JB2A_DnD5e"],
    description: "Joue pour tous une animation (Sequencer + JB2A) sur la carte affichée : sur un jeton, sur une case, ou de la source "
      + "à la cible pour un projectile, un rayon ou un coup porté. Pour rendre visible un sort, un tir, une explosion, un soin, une "
      + "apparition. Effets : " + Object.entries(EFFETS_ANIMATION)
      .map(([cle, e]) => `${cle} (${e.libelle}${e.genre === "trajet" ? ", de la source à la cible" : ""})`).join(", ") + ".",
    schema: objet({
      effet: { type: "string", enum: Object.keys(EFFETS_ANIMATION), description: "Animation à jouer." },
      source: chaine("Pour un effet « de la source à la cible » : nom du jeton qui tire, lance ou frappe. Sinon vide."),
      cible: chaine("Nom du jeton visé ou touché ; vide pour viser la case x,y."),
      x: entier("Colonne de la case visée si cible est vide ; sinon -1."),
      y: entier("Ligne de la case visée si cible est vide ; sinon -1."),
      rate: booleen("Pour un tir ou un rayon : true s'il manque sa cible (le projectile passe à côté). Sinon false.")
    }),
    sensible: false,
    async executer({ effet, source, cible, x, y, rate }) {
      const refus = sansModules("sequencer", "JB2A_DnD5e");
      if (refus) return refus;
      const def = EFFETS_ANIMATION[effet];
      if (!def) return { erreur: true, contenu: `Animation inconnue : ${effet} (${Object.keys(EFFETS_ANIMATION).join(", ")}).` };
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      if (typeof globalThis.Sequence !== "function" || !globalThis.Sequencer?.Database?.entryExists(def.base)) {
        return { erreur: true, contenu: `Animation « ${def.base} » absente de la base de Sequencer (JB2A est-il chargé ?).` };
      }
      const g = grilleDe(scene);
      let vers, quoi, surJeton = false;
      if (cible?.trim()) {
        vers = jetonNomme(scene, cible);
        if (!vers) return { erreur: true, contenu: `Jeton « ${cible} » introuvable sur « ${scene.name} ».` };
        quoi = vers.name; surJeton = true;
      } else if (dansLaGrille(g, x, y)) {
        vers = centreDeCase(g, x, y); quoi = `la case ${x},${y}`;
      } else {
        return { erreur: true, contenu: `Donne une cible (nom d'un jeton) ou une case x,y de la carte (${g.largeur}×${g.hauteur} cases).` };
      }
      const sequence = new Sequence({ moduleName: ID });
      const e = sequence.effect().file(def.base);
      let depuis = null;
      if (def.genre === "trajet") {
        if (!source?.trim()) return { erreur: true, contenu: `« ${effet} » va d'un jeton à un autre : donne la source (qui tire, lance ou frappe).` };
        depuis = jetonNomme(scene, source);
        if (!depuis) return { erreur: true, contenu: `Jeton source « ${source} » introuvable sur « ${scene.name} ».` };
        e.atLocation(depuis).stretchTo(vers);
        if (rate) e.missed();
      } else if (surJeton) {
        e.atLocation(vers).scaleToObject(def.taille);
      } else {
        e.atLocation(vers).size(def.taille, { gridUnits: true });
      }
      // Pas d'attente de la fin de l'animation : le récit continue pendant qu'elle se joue chez tous.
      sequence.play().catch(err => console.error(`${ID} | animation ${effet}`, err));
      return { contenu: `Animation « ${effet} » jouée pour tous ${depuis ? `de ${depuis.name} vers ${quoi}${rate ? " (manqué)" : ""}` : `sur ${quoi}`}.` };
    }
  },
  {
    nom: "meteo",
    modules: ["fxmaster"],
    description: "Météo et particules sur la carte affichée (FXMaster), vues de tous : pose un temps (remplace le précédent) ou « aucune » "
      + "pour tout couper. Choix : " + Object.keys(METEOS).join(", ") + ". Ce n'est que l'image : lance aussi l'ambiance sonore "
      + "assortie (ambiance_sonore : pluie, orage, vent…). Les effets posés à la main par le MJ humain dans FXMaster restent.",
    schema: objet({
      meteo: { type: "string", enum: ["aucune", ...Object.keys(METEOS)], description: "Temps ou particules voulus ; « aucune » coupe la météo posée." },
      intensite: { type: "string", enum: Object.keys(INTENSITES), description: "Intensité (densité des particules) ; ignorée pour « aucune »." }
    }),
    sensible: false,
    async executer({ meteo, intensite }) {
      const refus = sansModules("fxmaster");
      if (refus) return refus;
      const api = game.modules.get("fxmaster")?.api;
      if (!api?.presets || !api?.effects) return { erreur: true, contenu: "API de FXMaster indisponible (le monde a-t-il fini de charger ?)." };
      const scene = sceneJouee();
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const def = METEOS[meteo];
      if (meteo !== "aucune" && !def) return { erreur: true, contenu: `Météo inconnue : ${meteo}.` };
      // Une météo à la fois : on coupe les préréglages posés par l'API (les nôtres, ceux de Calendaria) et nos particules.
      await api.presets.switch(null, { scene });
      await api.effects.stop({ particles: PARTICULES_METEO, scene });
      if (meteo === "aucune") return { contenu: `Météo coupée sur « ${scene.name} ».` };
      const [niveau, facteur] = INTENSITES[intensite] ?? INTENSITES.moyenne;
      if (def.prereglage) {
        const ok = await api.presets.play(def.prereglage, { scene, density: niveau, silent: true });
        if (ok === false) return { erreur: true, contenu: `Préréglage FXMaster « ${def.prereglage} » indisponible dans ce monde.` };
      } else {
        await api.effects.play({
          scene,
          particles: def.particules.map((p, i) => ({ id: PARTICULES_METEO[i], type: p.type, options: { ...p.options, density: p.options.density * facteur } }))
        });
      }
      return { contenu: `Météo « ${meteo} » (${INTENSITES[intensite] ? intensite : "moyenne"}) sur « ${scene.name} », pour tous. Pense au son (ambiance_sonore).` };
    }
  },
  {
    nom: "calendrier",
    systemes: ["impmal", "dnd5e"],
    modules: ["calendaria"],
    description: "Le calendrier du monde (Calendaria). « lire » : date, heure, jour ou nuit, saison, lune et météo du jour. « avancer » : "
      + "fait passer le temps quand le récit le fait passer (attente, voyage, repos : 8 heures pour un repos long). « jusqu_a » : avance "
      + "jusqu'à l'aube, midi, le crépuscule ou minuit. « meteo » : fixe la météo du jour (« au_hasard » : tirée selon la saison ; "
      + "« effacer »). Selon ses réglages, Calendaria affiche alors aussi cette météo sur la carte.",
    schema: objet({
      action: { type: "string", enum: ["lire", "avancer", "jusqu_a", "meteo"], description: "Ce qu'on fait." },
      jours: entier("Pour avancer : jours (0 sinon)."),
      heures: entier("Pour avancer : heures (0 sinon)."),
      minutes: entier("Pour avancer : minutes (0 sinon)."),
      moment: { type: "string", enum: ["aucun", ...Object.keys(MOMENTS)], description: "Pour jusqu_a : le moment visé ; sinon « aucun »." },
      meteo: { type: "string", enum: ["inchangee", "effacer", "au_hasard", ...Object.keys(METEOS_CALENDRIER)], description: "Pour l'action meteo : le temps du jour ; sinon « inchangee »." }
    }),
    sensible: false,
    async executer({ action, jours, heures, minutes, moment, meteo }) {
      const refus = sansModules("calendaria");
      if (refus) return refus;
      const api = globalThis.CALENDARIA?.api;
      if (!api) return { erreur: true, contenu: "API de Calendaria indisponible (le monde a-t-il fini de charger ?)." };
      if (action === "avancer") {
        const duree = { day: jours || 0, hour: heures || 0, minute: minutes || 0 };
        if (Object.values(duree).some(n => n < 0)) return { erreur: true, contenu: "Le temps ne recule pas : jours, heures et minutes positifs." };
        if (!duree.day && !duree.hour && !duree.minute) return { erreur: true, contenu: "Rien à avancer : donne des jours, des heures ou des minutes." };
        if (duree.day > 366) return { erreur: true, contenu: "Plus d'un an d'un coup : avance par étapes." };
        await api.advanceTime(duree);
        const passe = [duree.day && `${duree.day} j`, duree.hour && `${duree.hour} h`, duree.minute && `${duree.minute} min`].filter(Boolean).join(" ");
        return { contenu: `Temps avancé de ${passe}. ${etatCalendrier(api)}.` };
      }
      if (action === "jusqu_a") {
        if (!MOMENTS[moment]) return { erreur: true, contenu: `Moment à préciser : ${Object.keys(MOMENTS).join(", ")}.` };
        await api.advanceTimeToPreset(MOMENTS[moment]);
        return { contenu: `Temps avancé jusqu'à : ${moment}. ${etatCalendrier(api)}.` };
      }
      if (action === "meteo") {
        if (meteo === "effacer") await api.clearWeather();
        else if (meteo === "au_hasard") await api.generateWeather();
        else if (METEOS_CALENDRIER[meteo]) await api.setWeather(METEOS_CALENDRIER[meteo]);
        else return { erreur: true, contenu: `Météo à préciser : au_hasard, effacer, ${Object.keys(METEOS_CALENDRIER).join(", ")}.` };
        return { contenu: `Météo du jour réglée. ${etatCalendrier(api)}.` };
      }
      return { contenu: etatCalendrier(api) };
    }
  },
  {
    nom: "butin",
    systemes: ["dnd5e"],
    modules: ["item-piles"],
    description: "Butin et marchands avec Item Piles, sur la carte affichée. « jeton_vaincu » : le jeton d'un ennemi vaincu devient un tas "
      + "de butin (ses objets et son argent, plus ce que tu ajoutes) que les joueurs ouvrent d'un double-clic. « tas » ou « coffre » : pose "
      + "un tas de butin ou un coffre (fermé) près d'un repère ou sur une case, avec des objets (uuid, voir chercher_compendium) et de "
      + "l'argent. « marchand » : un PNJ devient marchand (ses objets sont ses marchandises, à ses prix) et sa boutique s'ouvre chez les "
      + "joueurs connectés. « annuler » : le jeton redevient normal. Jamais sur un personnage joueur.",
    schema: objet({
      action: { type: "string", enum: ["jeton_vaincu", "tas", "coffre", "marchand", "annuler"], description: "Ce qu'on fait." },
      jeton: chaine("jeton_vaincu, marchand, annuler : nom du jeton. tas, coffre : repère ou jeton près duquel le poser, ou vide pour la case x,y."),
      x: entier("tas, coffre : colonne si jeton est vide ; sinon -1."),
      y: entier("tas, coffre : ligne si jeton est vide ; sinon -1."),
      nom: chaine("tas, coffre : nom affiché (« Coffre du contrebandier ») ; vide pour le nom par défaut."),
      objets: { type: "array", items: objet({ uuid: chaine("uuid de l'objet."), quantite: entier("Quantité (1 en général).") }), description: "Objets ajoutés au butin (vide sinon)." },
      argent: objet(Object.fromEntries(DEVISES_DND.map(d => [d, entier(`Pièces (${d}) ajoutées ; 0 sinon.`)])))
    }),
    sensible: true,
    async executer({ action, jeton, x, y, nom, objets, argent }) {
      const refus = sansModules("item-piles");
      if (refus) return refus;
      const API = game.itempiles?.API;
      if (!API) return { erreur: true, contenu: "API d'Item Piles indisponible (le monde a-t-il fini de charger ?)." };
      const scene = canvas.scene;
      if (!scene) return { erreur: true, contenu: "Aucune scène affichée." };
      const contenu = await objetsPourTas(objets ?? []);
      if (contenu.erreur) return { erreur: true, contenu: contenu.erreur };
      const { texte: pieces, inconnues } = argentPourItemPiles(argent, API.CURRENCIES ?? []);
      const avisArgent = inconnues.length ? ` Argent non ajouté (${inconnues.join(", ")}) : devises inconnues d'Item Piles (module « Item Piles: D&D 5e » actif ?).` : "";
      const remplir = async cibleTas => {
        if (contenu.donnees.length) await API.addItems(cibleTas, contenu.donnees);
        if (pieces) await API.addCurrencies(cibleTas, pieces);
      };
      const ajoute = [contenu.donnees.length && `${contenu.donnees.length} objet(s) ajouté(s)`, pieces && `argent : ${pieces}`].filter(Boolean).join(", ");

      if (action === "tas" || action === "coffre") {
        const ou = zoneDePose(scene, { x, y, pres_de: jeton ?? "" });
        if (ou.erreur) return { erreur: true, contenu: ou.erreur };
        const [c] = choisirCases(1, ou, occupeesDe(scene, ou.g));
        if (!c) return { erreur: true, contenu: `Plus de case libre${decrireOu(ou)}.` };
        const coffre = action === "coffre";
        const drapeaux = coffre
          ? { type: "container", closed: true, locked: false, closedImage: IMAGE_COFFRE, openedImage: IMAGE_COFFRE, emptyImage: IMAGE_COFFRE }
          : { type: "pile" };
        const cree = await API.createItemPile({
          position: versPixels(c, ou.g), sceneId: scene.id, itemPileFlags: drapeaux,
          items: contenu.donnees,
          tokenOverrides: nom?.trim() ? { name: nom.trim() } : {}
        });
        if (!cree?.tokenUuid) return { erreur: true, contenu: "Item Piles n'a pas créé le tas (refusé par un autre module ?)." };
        if (pieces) await API.addCurrencies(await fromUuid(cree.tokenUuid), pieces);
        return { contenu: `${coffre ? "Coffre fermé" : "Tas de butin"}${nom?.trim() ? ` « ${nom.trim()} »` : ""} posé en ${c.x},${c.y}${decrireOu(ou)}`
          + `${ajoute ? ` (${ajoute})` : ""}. Les joueurs l'ouvrent d'un double-clic.${avisArgent}` };
      }

      const t = jetonNomme(scene, jeton);
      if (!t) return { erreur: true, contenu: `Jeton « ${jeton} » introuvable sur « ${scene.name} ».` };
      if (t.actor?.hasPlayerOwner) return { erreur: true, contenu: `${t.name} est un personnage joueur : jamais de butin ni de boutique sur lui.` };
      if (action === "annuler") {
        if (!API.isValidItemPile(t)) return { erreur: true, contenu: `${t.name} n'est ni un tas de butin ni un marchand.` };
        await API.revertTokensFromItemPiles(t);
        return { contenu: `${t.name} redevient un jeton normal.` };
      }
      if (action === "marchand") {
        await API.turnTokensIntoItemPiles(t, { pileSettings: { type: "merchant" } });
        await remplir(t);
        const joueurs = joueursConnectes().map(u => u.id);
        if (joueurs.length) await API.renderItemPileInterface(t, { userIds: joueurs, useDefaultCharacter: true });
        return { contenu: `${t.name} tient boutique${ajoute ? ` (${ajoute})` : ""} : ${joueurs.length ? `elle s'ouvre chez ${joueurs.length} joueur(s)` : "aucun joueur connecté"} ; `
          + `ils achètent et vendent avec l'argent de leur fiche.${avisArgent}` };
      }
      await API.turnTokensIntoItemPiles(t, { pileSettings: { type: "pile" } });
      await remplir(t);
      return { contenu: `${t.name} devient un tas de butin${ajoute ? ` (${ajoute})` : ""} : les joueurs l'ouvrent d'un double-clic.${avisArgent}` };
    }
  }
);

// ---------------------------------------------------------------- Horloges, jauges et réputations (horloges.js)
// Partout sauf aux Veillées (« horsSystemes ») : une menace qui mûrit, ce qui s'accumule, ce que pense chaque faction.
// Le chat et l'IA sont prévenus quand une horloge sonne, qu'une jauge franchit un seuil ou qu'une réputation change de palier.

const PALIER_HORLOGE = objet({ nom: chaine("Nom du seuil ou du palier (« Remarqués », « Honoré »)."), min: entier("Valeur à partir de laquelle il est atteint.") });
const detailHorloge = el => [ligneResume(el), el.notes ? `  Notes : ${el.notes}` : "",
  el.paliers?.length ? `  ${el.type === "jauge" ? "Seuils" : "Paliers"} : ${el.paliers.map(p => `${p.nom} (${p.min})`).join(", ")}` : ""].filter(Boolean).join("\n");

OUTILS.push({
  nom: "horloge",
  horsSystemes: ["lakour-loups"],
  description: `Horloges, jauges et réputations, visibles dans le Carnet de campagne, onglet Horloges (les joueurs n'y voient que ce que tu montres). `
    + `Horloge : une menace ou un projet qui mûrit, en ${SEGMENTS_MIN} à ${SEGMENTS_MAX} segments (le culte achève son rituel, les renforts `
    + "arrivent) ; quand elle est pleine, elle sonne et l'événement arrive. Jauge : un compteur de 0 à max avec des seuils nommés (l'"
    + "Exposition en 40k, id exposition : plus elle monte, plus l'équipe s'est fait remarquer). Réputation : les points d'une faction, de -max à +max, lus en "
    + `paliers (${PALIERS_REPUTATION.map(p => `${p.nom} ${p.min}`).join(", ")} par défaut ; service +3 à +5, grand service +10 à +15, `
    + "affront -5, trahison -20 à -30). Quand une horloge sonne, qu'une jauge franchit un seuil ou qu'une réputation change de palier, "
    + "une carte paraît au chat et la réponse te le dit : tires-en une conséquence. « lister » donne tout, notes comprises. "
    + "Après un contrat ou un service : action « avancer », nom rep-<faction> (ou le nom de la faction), valeur = les points gagnés "
    + "(négatifs pour un affront ou un contrat échoué).",
  schema: objet({
    action: { type: "string", enum: ["lister", "creer", "avancer", "regler", "montrer", "cacher", "retirer"],
      description: "lister ; creer ; avancer (ou reculer) ; regler une valeur ou une définition ; montrer aux joueurs ; cacher ; retirer." },
    nom: chaine("Nom ou identifiant de l'élément (vide pour lister)."),
    type: { type: "string", enum: ["horloge", "jauge", "reputation"], description: "creer : le genre d'élément (ignoré sinon)." },
    valeur: entier("avancer : de combien (négatif pour reculer ; 0 = 1). regler : la nouvelle valeur. creer : la valeur de départ."),
    max: entier(`creer, regler : segments d'une horloge (${SEGMENTS_MIN} à ${SEGMENTS_MAX}), maximum d'une jauge, borne d'une réputation `
      + "(de -max à +max, 100 par défaut) ; 0 = par défaut (creer) ou inchangé (regler)."),
    faction: chaine("creer, regler : la faction concernée (réputation : celle dont on mesure l'estime ; horloge : celle qui agit). Vide = aucune ou inchangée."),
    notes: chaine("creer, regler : ce qu'elle mesure et ce qui arrive quand elle sonne ou franchit un seuil. Secret : jamais montré aux joueurs. Vide = inchangé."),
    paliers: { type: "array", items: PALIER_HORLOGE, description: "creer, regler : seuils d'une jauge ou paliers d'une réputation. Vide : "
      + "aucun seuil (jauge), Haï à Exalté (réputation) ; pour regler, inchangés." },
    visible: booleen("creer : true si les joueurs la voient dès sa création (sinon, montrer plus tard).")
  }),
  sensible: false,
  async executer({ action, nom, type, valeur, max, faction, notes, paliers, visible }) {
    if (action === "lister") {
      const tous = Horloges.lister();
      return { contenu: tous.length ? tous.map(detailHorloge).join("\n") : "Aucune horloge, jauge ni réputation." };
    }
    if (!nom.trim()) return { erreur: true, contenu: "Donne le nom ou l'identifiant de l'élément." };
    const existants = () => Horloges.lister().map(e => `${e.nom} [${e.id}]`).join(", ") || "aucun";
    if (action === "creer") {
      const deja = Horloges.trouver(nom);
      if (deja) return { erreur: true, contenu: `« ${deja.nom} » existe déjà : ${ligneResume(deja)}. Utilise avancer ou regler.` };
      const el = await Horloges.assurer({ nom, type, valeur, max, faction, notes, paliers, visible });
      return { contenu: `Créé : ${detailHorloge(el)}` };
    }
    const el = Horloges.trouver(nom);
    if (!el) return { erreur: true, contenu: `« ${nom} » introuvable (existants : ${existants()}).` };
    if (action === "retirer") {
      await Horloges.retirer(el.id);
      return { contenu: `« ${el.nom} » retiré.` };
    }
    let r;
    if (action === "montrer" || action === "cacher") r = await Horloges.montrer(el.id, action === "montrer", { source: "outil" });
    else if (action === "avancer") r = await Horloges.avancer(el.id, valeur || 1, { source: "outil" });
    else {
      const changements = { valeur };
      if (max > 0) changements.max = max;
      if (faction.trim()) changements.faction = faction;
      if (notes.trim()) changements.notes = notes;
      if (paliers.length) changements.paliers = paliers;
      r = await Horloges.regler(el.id, changements, { source: "outil" });
    }
    if (!r) return { erreur: true, contenu: "Seul le MJ actif peut modifier les horloges." };
    const vu = action === "montrer" ? " Les joueurs la voient maintenant." : action === "cacher" ? " Cachée aux joueurs." : "";
    return { contenu: `${ligneResume(r.element)}.${vu}${r.texte ? `\n${r.texte}` : ""}` };
  }
});

// ---------------------------------------------------------------- Carnet de campagne : enquêtes et contacts (carnet.js)
// Partout sauf aux Veillées. Chaque modification d'une enquête rappelle la règle des trois indices.

const NL = "\n";
const detailEnquete = e => [
  `Enquête « ${e.titre} » [${e.id}]${e.visible ? "" : " (cachée aux joueurs)"} :`,
  ...e.conclusions.map(c => `- Conclusion [${c.id}] ${c.revelee ? "RÉVÉLÉE" : "cachée"} : ${c.texte}`),
  ...e.indices.map(i => `- Indice [${i.id}] ${i.trouve ? "TROUVÉ" : "à trouver"} : ${i.texte}${i.ou ? ` (où : ${i.ou})` : ""} → `
    + `${i.mene.map(id => e.conclusions.find(c => c.id === id)?.texte ?? id).join(" ; ")}`)
].join(NL);
const avecRappel = (texte, e) => [texte, Enq.rappelTroisIndices(e)].filter(Boolean).join(NL);

OUTILS.push({
  nom: "enquete",
  horsSystemes: ["lakour-loups"],
  description: "Tableau d'enquête (« règle des trois indices »), visible dans le Carnet de campagne : une enquête a des CONCLUSIONS (ce que les "
    + "joueurs doivent comprendre) et des INDICES (où les trouver, à quelles conclusions ils mènent). Donne au moins trois indices à chaque "
    + "conclusion, par des chemins différents : les joueurs en rateront. « trouver » quand les joueurs trouvent un indice, « reveler » quand ils "
    + "ont compris une conclusion. Chaque modification te rappelle les conclusions qui ont moins de trois indices encore trouvables. Les joueurs "
    + "ne voient d'une enquête montrée que les indices trouvés et les conclusions révélées.",
  schema: objet({
    action: { type: "string", enum: ["lister", "creer", "ajouter_conclusion", "ajouter_indice", "trouver", "reveler", "montrer", "cacher", "retirer"],
      description: "Ce qu'il faut faire." },
    enquete: chaine("Titre ou identifiant de l'enquête ; vide = l'enquête en cours (creer : vide)."),
    texte: chaine("creer : le titre ; ajouter_conclusion : la conclusion ; ajouter_indice : l'indice ; trouver, reveler : l'indice ou la conclusion "
      + "visés (texte ou identifiant). Vide pour lister, montrer, cacher, retirer."),
    ou: chaine("ajouter_indice : où ou comment le trouver (un lieu, un PNJ, un document, un test). Vide sinon."),
    mene: { type: "array", items: chaine("Une conclusion (texte ou identifiant)."), description: "ajouter_indice : les conclusions auxquelles il mène. Vide sinon." },
    visible: booleen("creer : true si les joueurs voient l'enquête dès sa création.")
  }),
  sensible: false,
  async executer({ action, enquete, texte, ou, mene, visible }) {
    if (action === "lister") {
      const tous = Carnet.enquetes.lister();
      return { contenu: tous.length ? tous.map(e => avecRappel(detailEnquete(e), e)).join(NL + NL) : "Aucune enquête." };
    }
    if (action === "creer") {
      if (!texte.trim()) return { erreur: true, contenu: "Donne le titre de l'enquête (texte)." };
      if (Carnet.trouverEnquete(texte)) return { erreur: true, contenu: `L'enquête « ${texte} » existe déjà.` };
      const e = await Carnet.assurerEnquete({ titre: texte, visible });
      return { contenu: `Enquête créée : « ${e.titre} » [${e.id}] ; c'est l'enquête en cours (enquete vide la désigne, ou son identifiant ${e.id}). `
        + "Ajoute ses conclusions (ajouter_conclusion), puis au moins trois indices pour chacune (ajouter_indice)." };
    }
    const cible = Carnet.trouverEnquete(enquete);
    if (!cible) return { erreur: true, contenu: `Enquête introuvable${enquete ? ` : ${enquete}` : " (aucune en cours)"}. Enquêtes : ${Carnet.enquetes.lister().map(e => e.titre).join(", ") || "aucune"}.` };
    if (action === "retirer") {
      await Carnet.retirerEnquete(cible.id);
      return { contenu: `Enquête « ${cible.titre} » retirée.` };
    }
    const operations = {
      ajouter_conclusion: e => Enq.ajouterConclusion(e, { texte }),
      ajouter_indice: e => Enq.ajouterIndice(e, { texte, ou, mene }),
      trouver: e => Enq.marquerIndice(e, texte, true),
      reveler: e => Enq.marquerConclusion(e, texte, true),
      montrer: e => ({ enquete: { ...e, visible: true }, entree: null }),
      cacher: e => ({ enquete: { ...e, visible: false }, entree: null })
    };
    let r;
    try { r = await Carnet.modifierEnquete(cible.id, operations[action]); } catch (e) { return { erreur: true, contenu: `Rien n'a changé : ${e.message}.` }; }
    if (!r) return { erreur: true, contenu: "Seul le MJ actif peut modifier les enquêtes." };
    const fait = {
      ajouter_conclusion: `Conclusion ajoutée [${r.entree?.id}].`, ajouter_indice: `Indice ajouté [${r.entree?.id}].`,
      trouver: `Indice trouvé : « ${r.entree?.texte} »${r.enquete.visible ? " (les joueurs le voient au Carnet)" : ""}.`,
      reveler: `Conclusion révélée : « ${r.entree?.texte} ».`, montrer: "Les joueurs voient maintenant cette enquête (indices trouvés, conclusions révélées).",
      cacher: "Enquête cachée aux joueurs."
    }[action];
    return { contenu: avecRappel(`${fait} (« ${r.enquete.titre} »)`, r.enquete) };
  }
});

OUTILS.push({
  nom: "contact",
  horsSystemes: ["lakour-loups"],
  description: "Registre des contacts et des dettes, visible dans le Carnet de campagne : un PNJ que les personnages connaissent, sa faction, son "
    + "lieu, son attitude envers eux (-3 Hostile, -2 Méfiant, -1 Réservé, 0 Neutre, +1 Bienveillant, +2 Amical, +3 Allié), ce qu'on se doit "
    + "(une dette, dans un sens ou dans l'autre) et ce qu'il demande en échange. Fais-le vivre : une faveur rendue monte l'attitude, une promesse "
    + "trahie la baisse ; une dette se rappelle au mauvais moment. Les joueurs voient les contacts montrés (sans tes notes).",
  schema: objet({
    action: { type: "string", enum: ["lister", "ajouter", "modifier", "attitude", "dette", "solder", "montrer", "cacher", "retirer"],
      description: "Ce qu'il faut faire." },
    nom: chaine("Nom ou identifiant du contact (vide pour lister)."),
    faction: chaine("ajouter, modifier : sa faction. Vide = aucune ou inchangée."),
    lieu: chaine("ajouter, modifier : où on le trouve. Vide = aucun ou inchangé."),
    attitude: entier("ajouter : attitude de départ (-3 à +3) ; attitude : de combien elle change (+1, -2…). 0 sinon."),
    raison: chaine("attitude : pourquoi elle change (gardé à son historique). Vide sinon."),
    dette: chaine("ajouter, dette : qui doit quoi à qui (« le groupe lui doit un passage discret »). Vide sinon."),
    demande: chaine("ajouter, modifier : ce qu'il veut en échange de son aide. Vide = rien ou inchangé."),
    notes: chaine("ajouter, modifier : ce que toi seul sais de lui (jamais montré aux joueurs). Vide = rien ou inchangé."),
    acteur: chaine("ajouter, modifier : le nom (ou l'uuid) de son PNJ dans le monde, pour le reconnaître sur la scène. Vide = aucun ou inchangé."),
    visible: booleen("ajouter : true si les joueurs le voient dès maintenant.")
  }),
  sensible: false,
  async executer({ action, nom, faction, lieu, attitude, raison, dette, demande, notes, acteur, visible }) {
    if (action === "lister") {
      const tous = Carnet.contacts.lister();
      return { contenu: tous.length ? tous.map(c => [Cont.ligneContact(c), c.notes ? `  Notes : ${c.notes}` : "",
        c.historique?.length ? `  Historique : ${c.historique.slice(-3).join(" ; ")}` : ""].filter(Boolean).join(NL)).join(NL) : "Aucun contact." };
    }
    if (!nom.trim()) return { erreur: true, contenu: "Donne le nom du contact." };
    // Son PNJ : un uuid tel quel, sinon le nom d'un acteur du monde.
    const uuidActeur = async () => {
      const a = acteur.trim();
      if (!a) return "";
      if (/^(Actor|Scene|Compendium)\./.test(a)) return a;
      return (await trouverActeur(a))?.uuid ?? "";
    };
    if (action === "ajouter") {
      if (Carnet.trouverContact(nom)) return { erreur: true, contenu: `« ${nom} » est déjà au registre : utilise modifier, attitude ou dette.` };
      const c = await Carnet.assurerContact({ nom, faction, lieu, attitude, dette, demande, notes, acteur: await uuidActeur(), visible });
      return { contenu: `Contact ajouté : ${Cont.ligneContact(c)}.` };
    }
    const cible = Carnet.trouverContact(nom);
    if (!cible) return { erreur: true, contenu: `Contact introuvable : ${nom} (contacts : ${Carnet.contacts.lister().map(c => c.nom).join(", ") || "aucun"}).` };
    if (action === "retirer") {
      await Carnet.retirerContact(cible.id);
      return { contenu: `« ${cible.nom} » retiré du registre.` };
    }
    const lien = action === "modifier" ? await uuidActeur() : "";
    const operations = {
      modifier: c => ({ ...c, ...Object.fromEntries(Object.entries({ faction, lieu, demande, notes, acteur: lien }).filter(([, v]) => String(v ?? "").trim())) }),
      attitude: c => Cont.changerAttitude(c, attitude, raison),
      dette: c => Cont.noterDette(c, dette),
      solder: c => Cont.noterDette(c, ""),
      montrer: c => ({ ...c, visible: true }),
      cacher: c => ({ ...c, visible: false })
    };
    if (action === "dette" && !dette.trim()) return { erreur: true, contenu: "Dis qui doit quoi à qui (dette), ou utilise solder." };
    if (action === "attitude" && !attitude) return { erreur: true, contenu: "attitude : donne de combien elle change (+1, -2…)." };
    const r = await Carnet.modifierContact(cible.id, operations[action]);
    if (!r) return { erreur: true, contenu: "Seul le MJ actif peut modifier les contacts." };
    const borne = action === "attitude" && r.avant === r.apres ? " (déjà à la limite)" : "";
    return { contenu: `${Cont.ligneContact(r.contact)}.${borne}` };
  }
});

// ---------------------------------------------------------------- Supériorité (Imperium Maledictum)
// La réserve commune de l'équipe en combat (réglage impmal.superiority), lue et écrite par l'API du système :
// game.impmal.resources.get / set("superiority", n) (le système prévient alors fiches et suivi de combat).
OUTILS.push({
  nom: "superiorite",
  systemes: ["impmal"],
  description: "Supériorité (Imperium Maledictum) : la réserve commune de l'équipe en combat ; un test d'un personnage joueur qui coche "
    + "« Utiliser la Supériorité » gagne autant de DR (demander_jet, superiorite). « lire » la donne, « fixer » la règle, « ajuster » "
    + "l'augmente ou la baisse. Au début d'un combat : +1 par renseignement confirmé que le plan exploite (plafond 3 à 4), 0 si l'équipe "
    + "tombe dans une embuscade. Remets-la à 0 à la fin du combat.",
  schema: objet({
    action: { type: "string", enum: ["lire", "fixer", "ajuster"], description: "lire la valeur, la fixer, ou l'ajuster." },
    valeur: entier("fixer : la nouvelle valeur (0 ou plus). ajuster : de combien (négatif pour baisser). lire : 0.")
  }),
  sensible: false,
  async executer({ action, valeur }) {
    const ressources = game.impmal?.resources;
    if (typeof ressources?.get !== "function" || typeof ressources.set !== "function") {
      return { erreur: true, contenu: "Supériorité introuvable : l'API du système Imperium Maledictum (game.impmal.resources) n'est pas là." };
    }
    const avant = Number(ressources.get("superiority")) || 0;
    if (action === "lire") return { contenu: `Supériorité : ${avant}.` };
    const apres = Math.max(0, Math.round(action === "fixer" ? valeur : avant + valeur));
    await ressources.set("superiority", apres);
    return { contenu: `Supériorité : ${avant} → ${apres}.${apres > 4 ? " Au-delà de 3 ou 4, les combats deviennent trop faciles." : ""}` };
  }
});

export const outil = nom => OUTILS.find(o => o.nom === nom);
// Outils utiles au système du monde : sans « systemes », un outil sert partout (sauf dans ses « horsSystemes ») ; avec
// « modules », seulement si tous ces modules sont actifs (animations, météo, calendrier, butin).
// « horsPartieLoups » : pas pendant une partie des Veillées en cours (distribuée, pas finie) — la chronique de campagne est un journal
// lisible de tous, où le narrateur raconterait la partie en train de se jouer.
export const outilsDuSysteme = (systeme = game.system.id) => OUTILS.filter(o => (!o.systemes || o.systemes.includes(systeme))
  && !(o.horsSystemes ?? []).includes(systeme)
  && !(o.horsPartieLoups && systeme === "lakour-loups" && partieLoupsEnCoursIci())
  && (o.modules ?? []).every(moduleActif));

// Une partie des Veillées en cours dans ce monde (distribuée, pas finie).
export function partieLoupsEnCoursIci() {
  if (globalThis.game?.system?.id !== "lakour-loups") return false;
  try {
    const e = globalThis.game?.lakourLoups?.etat?.();
    return Boolean(e?.partie) && e.phase !== "fin";
  } catch { return false; }
}

// Résumé lisible d'un appel, pour la demande de validation au MJ humain.
export function resumerAppel(appel) {
  const args = Object.entries(appel.args ?? {}).map(([k, v]) => {
    const valeur = typeof v === "string" ? v : JSON.stringify(v);
    return `<li><strong>${k}</strong> : ${foundry.utils.escapeHTML(tronquer(valeur, 600))}</li>`;
  }).join("");
  return `<p>Le MJ IA veut utiliser <strong>${appel.nom}</strong> :</p><ul>${args}</ul>`;
}
