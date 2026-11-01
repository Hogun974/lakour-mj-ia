// Tour par tour (docs/tour-par-tour.md) : le combat de Foundry, guidé pas à pas, pour le MJ humain sans IA comme pour le MJ IA.
// La logique (étape suivante, actions restantes, proposition d'action, distances, tour de table) est PURE, dans tour-logique.js ;
// ce qui change d'un système à l'autre est dans les adaptateurs (adaptateurs.js, partie « tour ») ; ici, le branchement :
// - l'état mis à plat d'après le Combat de Foundry (sans le remplacer) et le suivi du tour en cours, gardé dans un drapeau du
//   combat (flags.lakour-mj-ia.tour, texte JSON écrit par le MJ actif, lu par tous : le bandeau des joueurs le montre) ;
// - les gestes du MJ (ajouter, initiative, cible, attaque, appliquer, suivant…), chacun par la vraie méthode du système ;
// - ce qu'on lit du chat : cartes d'utilisation, jets d'attaque et de dégâts, tests opposés (adaptateur, lireMessage) ;
// - le tour d'un PNJ (proposition déterministe acceptée d'un clic), d'un compagnon IA (il agit seul, même hors séance du MJ IA ;
//   en séance, reactions.js le confie au MJ IA comme avant), d'un joueur (on l'attend ; il voit ses actions dans son bandeau) ;
// - le tour de table hors combat (réglage monde « tourDeTable ») : la parole à chacun dans l'ordre ; le MJ IA attend la fin.
import { ID } from "./constantes.js";
import { adaptateur } from "./adaptateurs.js";
import { estCompagnon } from "./compagnons-jeu.js";
import { repliReplique } from "./compagnons.js";
import { estMJActif } from "./canal.js";
import * as L from "./tour-logique.js";

const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};
const traduire = (cle, donnees) => {
  try { return donnees ? game.i18n.format(cle, donnees) : game.i18n.localize(cle); } catch { return cle; }
};
const sur = (fn, defaut = null) => {
  try { return fn(); } catch (e) { console.error(`${ID} | tour par tour`, e); return defaut; }
};
const metres = m => (m === null || m === undefined ? "?" : `${String(Math.round(m * 10) / 10).replace(".", ",")} m`);

// ------------------------------------------------------------------ lecture de Foundry
// La clé du tour en cours : un suivi d'un autre tour est périmé.
export const cleTour = combat => (combat?.started ? `${combat.id}:${combat.round}:${combat.turn}:${combat.combatant?.id ?? ""}` : "");
const SUIVI = () => ({ cle: "", depenses: {}, reactions: {}, cible: null, cibleNom: "", attaque: null, obligations: [], infos: [],
  proposition: null, compagnonEnCours: false });

export function lireSuivi(combat) {
  const brut = combat?.flags?.[ID]?.tour;
  let f = null;
  try { f = typeof brut === "string" ? JSON.parse(brut) : brut ?? null; } catch { f = null; }
  const cle = cleTour(combat);
  if (f && f.cle === cle) return { ...SUIVI(), ...f };
  return { ...SUIVI(), cle, reactions: f?.reactions ?? {} };
}

// Le suivi gardé est-il celui du tour en cours ? (sinon, au chargement, le tour est repris de zéro)
export function suiviAJour(combat) {
  const brut = combat?.flags?.[ID]?.tour;
  try { return Boolean(brut) && (typeof brut === "string" ? JSON.parse(brut) : brut)?.cle === cleTour(combat); } catch { return false; }
}

// Le camp d'un jeton : joueur, compagnon IA, allié, ennemi (hostile) ou neutre.
export function campDe(jeton) {
  const a = jeton?.actor;
  if (estCompagnon(a)) return "compagnon";
  if (a?.hasPlayerOwner) return "joueur";
  return jeton?.disposition === -1 ? "ennemi" : jeton?.disposition === 1 ? "allie" : "neutre";
}

export function casesDe(jeton) {
  const s = jeton?.parent?.grid?.size ?? 100;
  return { x: Math.round(Number(jeton?.x ?? 0) / s), y: Math.round(Number(jeton?.y ?? 0) / s), l: Number(jeton?.width ?? 1), h: Number(jeton?.height ?? 1) };
}

export function grilleDe(scene) {
  let diagonales = scene?.grid?.diagonals;
  if (diagonales === undefined) {
    try { diagonales = game.settings.get("core", "gridDiagonals"); } catch { diagonales = 0; }
  }
  return { distance: Number(scene?.grid?.distance ?? 1), unites: scene?.grid?.units ?? "m", diagonales: Number(diagonales ?? 0) };
}

// Mouvement fait ce tour, en mètres : l'historique du jeton (Foundry l'efface au début de chaque tour de combat).
export function mouvementFait(jeton) {
  try {
    const h = jeton?.movementHistory ?? [];
    if (!h.length || typeof jeton.measureMovementPath !== "function") return 0;
    return L.versMetres(jeton.measureMovementPath(h)?.distance ?? 0, grilleDe(jeton.parent).unites);
  } catch { return 0; }
}

// Un déplacement refusé ? Réglage « Seul le combattant actif peut bouger » : pendant un combat commencé sur la scène, un
// joueur ne bouge que le jeton dont c'est le tour. Le MJ n'est jamais bloqué.
export function mouvementHorsTour(jeton, { utilisateur = game.user, combats = game.combats } = {}) {
  if (utilisateur?.isGM || !reglage("seulActifBouge", false)) return false;
  const combat = combats?.find?.(c => c.started && (c.scene?.id ?? c.sceneId) === jeton?.parent?.id) ?? null;
  if (!combat) return false;
  return combat.combatant?.tokenId !== jeton?.id;
}

// ------------------------------------------------------------------ le tour par tour
export class TourParTour {
  // moteur : le MoteurMJ (actif = séance, compagnons = cerveaux, signaler). systeme() : l'adaptateur du monde.
  constructor({ moteur = null, systeme = () => adaptateur(), delai = ms => new Promise(r => setTimeout(r, ms)), pause = 1200 } = {}) {
    this.moteur = moteur;
    this.systeme = systeme;
    this.delai = delai;
    this.pause = pause;
    this.enCours = new Set();     // tours de compagnons en train de se jouer (clé du tour)
    this.dernierTour = "";
    this.tableParole = null;      // compagnon qui parle au tour de table
    this.journal = [];            // ce qui a été fait (essais, console)
  }

  get sys() { return this.systeme()?.tour ?? null; }
  disponible() { return Boolean(this.sys); }
  combat() { return game.combats?.active ?? null; }
  scene() { return this.combat()?.scene ?? globalThis.canvas?.scene ?? game.scenes?.active ?? null; }

  // ---------- état mis à plat
  aPlat(c) {
    const jeton = c.token ?? null, acteur = c.actor ?? null;
    const fiche = acteur ? sur(() => this.sys.combattant(acteur), {}) ?? {} : {};
    return {
      id: c.id, nom: c.name ?? jeton?.name ?? acteur?.name ?? "?", acteurId: acteur?.id ?? null, jetonId: jeton?.id ?? c.tokenId ?? null,
      camp: jeton ? campDe(jeton) : acteur?.hasPlayerOwner ? "joueur" : "neutre", initiative: c.initiative ?? null,
      aTerre: Boolean(c.isDefeated ?? c.defeated) || Boolean(fiche.aTerre), mort: Boolean(fiche.mort), jetsMort: fiche.jetsMort ?? null,
      pv: fiche.pv ?? null, pvMax: fiche.pvMax ?? null, pvTexte: fiche.pvTexte ?? "", defense: fiche.defense ?? "",
      cases: jeton ? casesDe(jeton) : null, cache: Boolean(c.hidden), img: c.img ?? acteur?.img ?? ""
    };
  }

  combattants(combat = this.combat()) {
    if (!combat || !this.sys) return [];
    return (combat.turns ?? combat.combatants?.contents ?? []).map(c => this.aPlat(c));
  }

  // Jetons de la scène pas encore au combat : joueurs et compagnons, PNJ hostiles visibles cochés d'office ; les autres non.
  candidats(scene = this.scene(), combat = this.combat()) {
    if (!scene) return [];
    const deja = new Set((combat?.combatants?.contents ?? []).map(c => c.tokenId));
    return (scene.tokens?.contents ?? []).filter(t => t.actor && !deja.has(t.id) && !t.getFlag?.(ID, "figurant"))
      .map(t => ({ id: t.id, nom: t.name, camp: campDe(t), cache: Boolean(t.hidden), img: t.texture?.src ?? t.actor?.img ?? "" }))
      .map(t => ({ ...t, coche: ["joueur", "compagnon"].includes(t.camp) || (t.camp === "ennemi" && !t.cache) }));
  }

  etatPur(combat = this.combat()) {
    const sys = this.sys;
    const suivi = lireSuivi(combat);
    const tous = this.combattants(combat);
    const actifId = combat?.started ? combat.combatant?.id ?? null : null;
    const depenses = { ...suivi.depenses, reaction: suivi.reactions?.[actifId] ? 1 : 0 };
    // Un jeton qui a bougé ce tour a pris son déplacement (Imperium Maledictum : une ressource « déplacement »).
    if (actifId && sys?.economie?.some(e => e.cle === "deplacement") && mouvementFait(combat.combatant?.token) > 0) depenses.deplacement = 1;
    return {
      combat: combat ? { id: combat.id, commence: Boolean(combat.started), round: combat.round ?? 0, actif: actifId, combattants: tous } : null,
      candidats: this.candidats(this.scene(), combat), suivi: { ...suivi, depenses }, economie: sys?.economie ?? [],
      seanceIA: Boolean(this.moteur?.actif), iaJouePnj: Boolean(reglage("jouerPnj", true))
    };
  }

  etape(combat = this.combat()) {
    return L.etapeSuivanteCombat(this.etatPur(combat));
  }

  texteEtape(e) {
    if (!e) return "";
    const cle = e.cle === "rappel" ? `rappel.${e.donnees?.sorte || "autre"}` : e.cle;
    return traduire(`LAKOUR_MJIA.Tour.Etapes.${cle}`, Object.fromEntries(Object.entries(e.donnees ?? {}).map(([k, v]) => [k, String(v ?? "")])));
  }

  detailEtape(e) {
    return e?.detail ? traduire(`LAKOUR_MJIA.Tour.Detail.${e.detail.cle}`, e.detail.donnees) : "";
  }

  // Le combattant actif : fiche, attaques, actions restantes, cibles (distance, défense, portée).
  actif(combat = this.combat()) {
    const c = combat?.started ? combat.combatant : null;
    if (!c || !this.sys) return null;
    const acteur = c.actor, jeton = c.token;
    const plat = this.aPlat(c);
    const fiche = acteur ? sur(() => this.sys.combattant(acteur), {}) ?? {} : {};
    const suivi = lireSuivi(combat);
    const fait = mouvementFait(jeton);
    const restantes = L.actionsRestantes(this.sys.economie, this.etatPur(combat).suivi.depenses,
      fiche.mouvementMax === null || fiche.mouvementMax === undefined ? null : { max: fiche.mouvementMax, utilise: fait });
    const attaques = acteur ? sur(() => this.sys.attaques(acteur), []) ?? [] : [];
    const grille = grilleDe(jeton?.parent);
    const tous = this.combattants(combat);
    const cibles = tous.filter(x => x.id !== plat.id && x.cases && plat.cases && !x.cache).map(x => {
      const d = L.distanceMetres(plat.cases, x.cases, grille);
      const portee = L.porteeVers(attaques, d, L.metresParCase(grille));
      return { ...x, distance: d, distanceTexte: metres(d), portee, adversaire: L.camp(x) !== L.camp(plat) && L.camp(x) !== "neutre" && L.camp(plat) !== "neutre",
        choisie: suivi.cible === x.jetonId };
    }).sort((a, b) => Number(b.adversaire) - Number(a.adversaire) || a.distance - b.distance);
    return { plat, acteur, jeton, fiche, suivi, restantes, attaques, cibles, mouvementFait: fait };
  }

  // Proposition d'action (PNJ, compagnon), sans IA : voir proposerAction.
  proposition(combat = this.combat()) {
    const a = this.actif(combat);
    if (!a) return { type: "attendre", texte: "" };
    const mouvement = a.fiche.mouvementMax === null || a.fiche.mouvementMax === undefined ? null : Math.max(0, a.fiche.mouvementMax - a.mouvementFait);
    const tous = this.combattants(combat);
    const p = L.proposerAction({ acteur: { ...a.plat, attaques: a.attaques, mouvement }, adversaires: L.adversairesDe(a.plat, tous), grille: grilleDe(a.jeton?.parent) });
    return { ...p, texte: this.texteProposition(p) };
  }

  texteProposition(p) {
    if (!p || p.type === "attendre") return traduire("LAKOUR_MJIA.Tour.Proposition.Attendre");
    const d = { cible: p.cibleNom, attaque: p.attaqueNom ?? "", distance: metres(p.distance), metres: metres(p.deplacement?.metres) };
    if (p.type === "deplacement") return traduire("LAKOUR_MJIA.Tour.Proposition.Approche", d);
    if (p.deplacement?.metres > 0) return traduire("LAKOUR_MJIA.Tour.Proposition.ApprocheAttaque", d);
    return traduire(p.longue ? "LAKOUR_MJIA.Tour.Proposition.AttaqueLongue" : "LAKOUR_MJIA.Tour.Proposition.Attaque", d);
  }

  // ---------- suivi du tour (MJ actif)
  async ecrireSuivi(combat, suivi) {
    if (!combat) return;
    await combat.update({ [`flags.${ID}.tour`]: JSON.stringify({ ...suivi, cle: cleTour(combat) }) });
  }

  async majSuivi(combat, fn) {
    if (!combat) return null;
    const s = lireSuivi(combat);
    const n = fn(structuredClone(s)) ?? s;
    await this.ecrireSuivi(combat, n);
    return n;
  }

  // Un nouveau tour commence : suivi neuf, réaction rendue, rappels de début de tour, proposition pour un PNJ ; un compagnon
  // IA joue seul quand le MJ IA n'est pas en séance (en séance, reactions.js le confie au MJ IA).
  async surNouveauTour(combat = this.combat()) {
    if (!estMJActif() || !combat?.started || !this.sys) return;
    const cle = cleTour(combat);
    if (!cle || this.dernierTour === cle) return;
    this.dernierTour = cle;
    const ancien = lireSuivi(combat);
    const reactions = { ...(ancien.reactions ?? {}) };
    delete reactions[combat.combatant?.id];
    const plat = combat.combatant ? this.aPlat(combat.combatant) : null;
    const fiche = combat.combatant?.actor ? sur(() => this.sys.combattant(combat.combatant.actor), {}) ?? {} : {};
    const { obligations, infos } = plat?.aTerre ? { obligations: [], infos: [] } : L.rappelsDebutTour({ nom: plat?.nom, ...fiche });
    // Les actions légendaires des autres (D&D 5e) : à la fin de ce tour, on peut en dépenser une.
    for (const autre of combat.turns ?? []) {
      if (autre.id === combat.combatant?.id || !autre.actor) continue;
      const f = sur(() => this.sys.combattant(autre.actor), {}) ?? {};
      if (f.legendaires?.reste > 0 && !f.aTerre) infos.push({ cle: "legendairesAutre", texte: `${autre.name} (${f.legendaires.reste}/${f.legendaires.max})` });
    }
    const suivi = { ...SUIVI(), cle, reactions, obligations, infos };
    await this.ecrireSuivi(combat, suivi);
    if (plat && !plat.aTerre && !["joueur", "compagnon"].includes(plat.camp)) {
      const proposition = this.proposition(combat);
      await this.majSuivi(combat, s => ({ ...s, proposition }));
    }
    if (plat?.camp === "compagnon" && !plat.aTerre && !this.moteur?.actif) {
      this.jouerCompagnon(combat).catch(e => console.error(`${ID} | tour du compagnon`, e));
    }
  }

  // ---------- gestes du MJ (panneau)
  async ajouter(jetonIds = []) {
    const scene = this.scene();
    if (!scene) throw new Error(traduire("LAKOUR_MJIA.Tour.Erreurs.PasDeScene"));
    let combat = this.combat();
    if (!combat) combat = await Combat.implementation.create({ scene: scene.id, active: true });
    const deja = new Set((combat.combatants?.contents ?? []).map(c => c.tokenId));
    const jetons = jetonIds.map(id => scene.tokens.get(id)).filter(t => t && !deja.has(t.id));
    if (jetons.length) {
      await combat.createEmbeddedDocuments("Combatant", jetons.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: Boolean(t.hidden) })));
    }
    this.journal.push({ geste: "ajouter", n: jetons.length });
    return jetons.length;
  }

  // La vraie méthode du système (Combat#rollAll : D&D 5e lance le d20 + initiative ; Imperium Maledictum calcule sa formule).
  async initiative() {
    const combat = this.combat();
    if (combat) await this.sys.lancerInitiative(combat);
    this.journal.push({ geste: "initiative" });
  }

  async commencer() {
    const combat = this.combat();
    if (combat && !combat.started) await combat.startCombat();
    this.journal.push({ geste: "commencer" });
  }

  async choisirCible(jetonId) {
    const combat = this.combat();
    const jeton = combat?.scene?.tokens?.get?.(jetonId) ?? this.scene()?.tokens?.get?.(jetonId);
    if (!jeton) return null;
    await this.majSuivi(combat, s => ({ ...s, cible: jeton.id, cibleNom: jeton.name }));
    // La cible désignée dans Foundry : les jets du système la lisent (CA en D&D 5e, test opposé en Imperium Maledictum).
    try { jeton.object?.setTarget?.(true, { releaseOthers: true, groupSelection: false }); } catch { /* sans canevas */ }
    return jeton;
  }

  attaqueDeLActif(attaqueId, combat = this.combat()) {
    const acteur = combat?.combatant?.actor;
    return acteur ? (this.sys.attaques(acteur) ?? []).find(a => a.id === attaqueId) ?? null : null;
  }

  // Le vrai jet du système, avec sa fenêtre (le MJ joue un PNJ à la main) ; la suite arrive par le chat (surMessage).
  async attaquer(attaqueId) {
    const combat = this.combat();
    const att = this.attaqueDeLActif(attaqueId, combat);
    if (!att) return null;
    const s = lireSuivi(combat);
    if (s.cible) await this.choisirCible(s.cible);
    await this.majSuivi(combat, x => ({ ...x, attaque: { phase: "toucher", nom: att.nom, attaqueId: att.id, ...this.#cibleAttaque(combat, x) } }));
    await this.sys.lancer(combat.combatant.actor, att);
    return att;
  }

  async toucher() {
    const combat = this.combat();
    const s = lireSuivi(combat);
    const att = this.attaqueDeLActif(s.attaque?.attaqueId, combat);
    if (att) await this.sys.toucher(combat.combatant.actor, att);
  }

  async degats() {
    const combat = this.combat();
    const s = lireSuivi(combat);
    const att = this.attaqueDeLActif(s.attaque?.attaqueId, combat);
    if (att) await this.sys.degats(combat.combatant.actor, att, { critique: Boolean(s.attaque?.critique) });
  }

  // Imperium Maledictum : le défenseur (PNJ) répond au test opposé, esquive ou sans opposition.
  async defendre(type = "dodge") {
    const s = lireSuivi(this.combat());
    const m = s.attaque?.messageId ? game.messages?.get?.(s.attaque.messageId) : null;
    if (m && this.sys.testOppose) await this.sys.defendre(m, type);
  }

  #cibleAttaque(combat, s) {
    const jetonId = s.cible ?? null;
    const c = (combat?.combatants?.contents ?? []).find(x => x.tokenId === jetonId);
    return { cibleJeton: jetonId, cibleId: c?.id ?? null, cibleNom: s.cibleNom || c?.name || "" };
  }

  // Accepter la proposition (PNJ) : déplacement s'il le faut, attaque résolue par le système sans fenêtre ; les dégâts
  // attendent le bouton « Appliquer ».
  async accepterProposition() {
    const combat = this.combat();
    // Recalculée au moment du clic : le MJ a pu bouger des jetons depuis le début du tour.
    const p = this.proposition(combat);
    return this.executer(combat, p, { auto: false });
  }

  async executer(combat, p, { auto = false } = {}) {
    const c = combat?.combatant;
    if (!c || !p || p.type === "attendre") return null;
    const acteur = c.actor, jeton = c.token;
    const cible = (combat.combatants?.contents ?? []).find(x => x.id === p.cibleId);
    if (p.deplacement?.metres > 0 && jeton && cible?.token) await this.deplacer(jeton, cible.token, p.deplacement.metres);
    const eco = this.sys.economie;
    if (p.type !== "attaque" || !cible) {
      await this.majSuivi(combat, s => ({ ...s, depenses: L.depenser(eco, L.depenser(eco, s.depenses, "deplacement"), "action"),
        attaque: { phase: "fini", nom: "" }, proposition: null }));
      this.journal.push({ geste: "deplacement", qui: c.name, vers: p.cibleNom });
      return { touche: false, degats: 0 };
    }
    const att = this.attaqueDeLActif(p.attaqueId, combat);
    if (!att) return null;
    await this.choisirCible(cible.tokenId);
    const r = await this.sys.resoudre(acteur, att, cible.actor);
    const ressource = this.sys.ressourceDe(att.activation) ?? "action";
    const bouge = p.deplacement?.metres > 0;
    await this.majSuivi(combat, s => ({
      ...s, depenses: L.depenser(eco, bouge ? L.depenser(eco, s.depenses, "deplacement") : s.depenses, ressource), cible: cible.tokenId, cibleNom: cible.name, proposition: null,
      attaque: r.touche && r.degats > 0
        ? { phase: "appliquer", nom: att.nom, attaqueId: att.id, cibleJeton: cible.tokenId, cibleId: cible.id, cibleNom: cible.name, degats: r.degats }
        : { phase: "fini", nom: att.nom }
    }));
    this.journal.push({ geste: "attaque", qui: c.name, cible: cible.name, attaque: att.nom, touche: r.touche, degats: r.degats });
    if (auto && r.touche && r.degats > 0) await this.appliquer();
    return r;
  }

  // Approcher une cible : la case libre la plus proche à côté d'elle, ou le plus loin possible vers elle.
  async deplacer(jeton, cible, distance) {
    const scene = jeton.parent;
    const g = grilleDe(scene);
    const pas = L.metresParCase(g) || 1;
    const occupees = new Set();
    for (const t of scene.tokens?.contents ?? []) {
      if (t.id === jeton.id || t.id === cible.id) continue;
      const k = casesDe(t);
      for (let x = k.x; x < k.x + k.l; x++) for (let y = k.y; y < k.y + k.h; y++) occupees.add(`${x},${y}`);
    }
    const dest = L.caseVers(casesDe(jeton), casesDe(cible), Math.floor(distance / pas + 1e-6), { occupees, diagonales: g.diagonales });
    const s = scene.grid?.size ?? 100;
    if (dest.x * s !== jeton.x || dest.y * s !== jeton.y) await jeton.update({ x: dest.x * s, y: dest.y * s });
    return dest;
  }

  // Appliquer les dégâts par la méthode du système ; une créature concentrée (D&D 5e) doit sauvegarder.
  async appliquer() {
    const combat = this.combat();
    const s = lireSuivi(combat);
    const a = s.attaque;
    if (a?.phase !== "appliquer") return null;
    const jeton = combat.scene?.tokens?.get?.(a.cibleJeton) ?? this.scene()?.tokens?.get?.(a.cibleJeton);
    const cible = jeton?.actor ?? null;
    const message = a.messageId ? game.messages?.get?.(a.messageId) : null;
    if (message && this.sys.testOppose) await this.sys.appliquerOpposition(message);
    else if (cible) await this.sys.appliquer(cible, a.degats);
    const fiche = cible ? sur(() => this.sys.combattant(cible), {}) ?? {} : {};
    const obligations = [...(s.obligations ?? [])];
    if (fiche.concentration && a.degats > 0 && !fiche.aTerre) {
      obligations.push({ cle: "sauvegarde", nom: a.cibleNom, jetonId: a.cibleJeton, raison: "concentration", concentration: true, carac: "con", dd: L.ddConcentration(a.degats) });
    }
    await this.ecrireSuivi(combat, { ...s, attaque: { phase: "fini", nom: a.nom }, obligations });
    this.journal.push({ geste: "appliquer", cible: a.cibleNom, degats: a.degats });
    return a.degats;
  }

  // La première obligation : sauvegarde (vrai jet du système), fin d'un effet (supprimé), rappel (vu).
  async obligation() {
    const combat = this.combat();
    const s = lireSuivi(combat);
    const [o, ...reste] = s.obligations ?? [];
    if (!o) return null;
    if (o.cle === "sauvegarde") {
      const acteur = (combat.scene?.tokens?.get?.(o.jetonId) ?? this.scene()?.tokens?.get?.(o.jetonId))?.actor ?? game.actors?.get?.(o.acteurId);
      if (acteur) await this.sys.sauvegarde(acteur, o);
    } else if (o.cle === "finEffet") {
      const effet = await globalThis.fromUuid?.(o.effetId);
      await effet?.delete?.();
    }
    await this.ecrireSuivi(combat, { ...s, obligations: reste });
    return o;
  }

  async jetMort() {
    const combat = this.combat();
    const c = combat?.combatant;
    if (!c?.actor) return null;
    const r = await this.sys.jetMort(c.actor, { direct: estCompagnon(c.actor) });
    await this.majSuivi(combat, s => ({ ...s, attaque: { phase: "fini", nom: "" } }));
    return r;
  }

  async suivant() {
    const combat = this.combat();
    if (combat?.started) await combat.nextTurn();
    this.journal.push({ geste: "suivant" });
  }

  async finCombat() {
    const combat = this.combat();
    if (combat) await combat.endCombat();
    this.journal.push({ geste: "finCombat" });
  }

  // ---------- un compagnon IA à son tour, sans MJ IA : il déclare (son cerveau, ou le repli sans IA) ce que la proposition
  // lui fait faire, l'action est résolue par le système, les dégâts appliqués, puis le tour passe.
  async jouerCompagnon(combat = this.combat()) {
    const cle = cleTour(combat);
    if (!cle || this.enCours.has(cle)) return null;
    this.enCours.add(cle);
    try {
      await this.majSuivi(combat, s => ({ ...s, compagnonEnCours: true }));
      const acteur = combat.combatant.actor;
      const p = this.proposition(combat);
      const comp = this.moteur?.compagnons;
      if (comp) {
        const vue = comp.vue(acteur);
        const consigne = `C'est ton tour de combat. Ce que fait ton personnage : ${p.texte}. Annonce-le en une ou deux phrases, à la `
          + "première personne, avec ton caractère (une courte didascalie en italique peut ouvrir la réplique).";
        const r = await comp.cerveaux.parler({ ...vue, peutParler: true }, { consigne, combat: true });
        // Sans IA (pas de clé, budget atteint) : l'action telle quelle, pour que la déclaration colle à ce qui est joué.
        await comp.poster(acteur, r.texte || `${acteur.name} ${p.texte}.`, { action: true });
      }
      if (cleTour(combat) !== cle) return null;
      const r = await this.executer(combat, p, { auto: true });
      this.journal.push({ geste: "compagnon", qui: acteur.name, proposition: p.type });
      await this.delai(this.pause);
      if (cleTour(combat) === cle) {
        await this.majSuivi(combat, s => ({ ...s, compagnonEnCours: false }));
        await combat.nextTurn();
      }
      return r;
    } finally {
      this.enCours.delete(cle);
    }
  }

  // ---------- ce que dit le chat (MJ actif) : carte d'utilisation, jet d'attaque, jet de dégâts, test opposé.
  async surMessage(message, { maj = false } = {}) {
    if (!estMJActif() || !this.sys) return;
    if (!maj) await this.surMessageTable(message);
    const combat = this.combat();
    if (!combat?.started) return;
    const lu = sur(() => this.sys.lireMessage(message));
    if (!lu || (maj && lu.genre !== "opposition")) return;
    const actif = combat.combatant;
    const qui = lu.auteur ?? message.speaker ?? {};
    const deLActif = qui.token ? qui.token === actif?.tokenId : Boolean(qui.actor && qui.actor === actif?.actorId);
    const eco = this.sys.economie;
    const ressource = lu.activation ? this.sys.ressourceDe(lu.activation) : null;
    if (!deLActif) {
      // La réaction d'un autre combattant (D&D 5e) : elle est prise jusqu'à son prochain tour.
      if (ressource === "reaction") {
        const autre = (combat.combatants?.contents ?? []).find(c => (qui.token ? c.tokenId === qui.token : c.actorId === qui.actor));
        if (autre) await this.majSuivi(combat, s => ({ ...s, reactions: { ...s.reactions, [autre.id]: true } }));
      }
      return;
    }
    await this.majSuivi(combat, s => {
      const n = { ...s };
      if (ressource === "reaction") n.reactions = { ...s.reactions, [actif.id]: true };
      else if (ressource && lu.genre !== "opposition") n.depenses = L.depenser(eco, s.depenses, ressource);
      if (!lu.phase) return n;
      const nouvelle = lu.genre === "usage" || (lu.genre === "attaque" && !["toucher", "degats"].includes(s.attaque?.phase));
      const base = nouvelle ? { nom: lu.nom ?? "", attaqueId: lu.attaqueId ?? null, ...this.#cibleAttaque(combat, s) } : { ...(s.attaque ?? {}) };
      n.attaque = { ...base, phase: lu.phase, nom: lu.nom || base.nom || "", attaqueId: lu.attaqueId ?? base.attaqueId ?? null,
        degats: lu.degats ?? base.degats ?? 0, critique: lu.critique ?? base.critique ?? false, messageId: lu.messageId ?? base.messageId ?? null };
      // La cible désignée que porte le message (jeton du test opposé d'Imperium Maledictum, acteur visé en D&D 5e).
      if (lu.cibleUuid) {
        const doc = sur(() => globalThis.fromUuidSync?.(lu.cibleUuid));
        const cc = doc ? (combat.combatants?.contents ?? []).find(x => x.tokenId === doc.id || x.actorId === doc.id || x.actor?.uuid === lu.cibleUuid) : null;
        if (cc) Object.assign(n.attaque, { cibleJeton: cc.tokenId, cibleNom: cc.name, cibleId: cc.id });
      }
      // Une attaque sans cible désignée ne demande pas de défense.
      if (n.attaque.phase === "defense" && !n.attaque.cibleJeton) n.attaque.phase = "fini";
      return n;
    });
  }

  // ---------- tour de table (hors combat)
  lireTable() { return reglage("tourDeTable", null) ?? null; }
  async ecrireTable(t) { await game.settings.set(ID, "tourDeTable", t); }
  etapeTable() { return L.etapeTourDeTable(this.lireTable()); }
  tableActive() { return Boolean(this.lireTable()?.actif); }
  // Le MJ IA attend que chacun ait parlé (ou passé) avant de raconter.
  retientIA() { return L.tourDeTableRetient(this.lireTable()); }

  // Les personnages présents : joueurs (jeton visible sur la scène) puis compagnons, dans l'ordre des jetons.
  participantsTable(scene = game.scenes?.active ?? globalThis.canvas?.scene) {
    const joueurs = game.users?.filter?.(u => !u.isGM) ?? [];
    const vus = new Set();
    const sortie = [];
    for (const t of scene?.tokens?.contents ?? []) {
      const a = t.actor;
      if (!a || t.hidden || vus.has(a.id)) continue;
      const compagnon = estCompagnon(a);
      if (!compagnon && !a.hasPlayerOwner) continue;
      vus.add(a.id);
      const u = joueurs.find(x => x.character?.id === a.id) ?? joueurs.find(x => a.ownership?.[x.id] === 3);
      sortie.push({ id: a.id, nom: a.name, userId: compagnon ? null : u?.id ?? null, compagnon });
    }
    return [...sortie.filter(p => !p.compagnon), ...sortie.filter(p => p.compagnon)];
  }

  async commencerTable(participants = this.participantsTable()) {
    const avant = this.lireTable();
    const t = L.nouveauTourDeTable(participants, (avant?.tour ?? 0) + 1);
    await this.ecrireTable(t);
    this.journal.push({ geste: "table", n: t.ordre.length });
    await this.verifierTable();
    return t;
  }

  async avancerTable(id, fait = "parle") {
    const t = this.lireTable();
    const n = L.avancerTourDeTable(t, { id, fait });
    if (n === t) return false;
    await this.ecrireTable(n);
    await this.verifierTable();
    return true;
  }

  async sauterTable() {
    const t = this.lireTable();
    const n = L.sauterTourDeTable(t);
    if (n === t) return false;
    await this.ecrireTable(n);
    await this.verifierTable();
    return true;
  }

  async arreterTable() {
    await this.ecrireTable({ actif: false, ordre: [], index: 0, faits: {}, tour: this.lireTable()?.tour ?? 0 });
  }

  // Après chaque changement : un compagnon qui a la parole parle ; un tour fini est annoncé au MJ IA (une fois).
  async verifierTable() {
    if (!estMJActif()) return;
    const t = this.lireTable();
    if (!t?.actif) return;
    if (L.tourDeTableComplet(t)) {
      if (t.annonce) return;
      await this.ecrireTable({ ...t, annonce: true });
      const passes = t.ordre.filter(o => t.faits[o.id] === "passe").map(o => o.nom);
      this.moteur?.signaler?.(`[Tour de table ${t.tour} terminé] Chacun a parlé${passes.length ? ` (ont passé : ${passes.join(", ")})` : ""}. `
        + "Raconte maintenant la suite pour tout le groupe. Pour redonner la parole à chacun ensuite, appelle tour_de_table « commencer ».",
      { immediat: true });
      return;
    }
    const o = L.orateurTourDeTable(t);
    if (o?.compagnon && this.tableParole !== `${t.tour}:${o.id}`) {
      this.tableParole = `${t.tour}:${o.id}`;
      this.faireParlerCompagnon(o).catch(e => console.error(`${ID} | tour de table`, e));
    }
  }

  async faireParlerCompagnon(o) {
    const acteur = game.actors?.get?.(o.id);
    const comp = this.moteur?.compagnons;
    if (acteur && comp) {
      const vue = comp.vue(acteur);
      const r = await comp.cerveaux.parler({ ...vue, peutParler: true }, { consigne: "C'est ton tour de parole au tour de table : dis en "
        + "une ou deux phrases ce que fait ton personnage maintenant, à la première personne (une courte didascalie en italique peut ouvrir la réplique)." });
      const texte = r.texte || repliReplique(vue, comp.cerveaux.graine);
      await comp.poster(acteur, texte);
    }
    await this.avancerTable(o.id, acteur && comp ? "parle" : "passe");
  }

  // Le joueur qui a la parole écrit dans le chat (message public) : il a parlé.
  async surMessageTable(message) {
    const t = this.lireTable();
    const o = L.orateurTourDeTable(t);
    if (!o || o.compagnon || message?.whisper?.length || message?.flags?.[ID]?.ia) return false;
    const auteur = message.author ?? game.users?.get?.(message.user);
    if (!auteur || auteur.isGM) return false;
    const acteur = game.actors?.get?.(o.id);
    const sien = auteur.id === o.userId || Boolean(acteur?.testUserPermission?.(auteur, "OWNER"));
    if (!sien) return false;
    return this.avancerTable(o.id, "parle");
  }

  // Demande d'un joueur (canal) : il a fini de parler, ou passe.
  async demandeTable(fait, userId) {
    const o = L.orateurTourDeTable(this.lireTable());
    const u = game.users?.get?.(userId);
    if (!o || o.compagnon || !u || u.isGM) return false;
    const acteur = game.actors?.get?.(o.id);
    if (u.id !== o.userId && !acteur?.testUserPermission?.(u, "OWNER")) return false;
    return this.avancerTable(o.id, fait === "passe" ? "passe" : "parle");
  }

  // Demande d'un joueur (canal) : fin de son tour de combat, s'il tient le combattant actif.
  async demandeFinDeTour(userId) {
    const combat = this.combat();
    const u = game.users?.get?.(userId);
    const acteur = combat?.combatant?.actor;
    if (!combat?.started || !u || !acteur?.testUserPermission?.(u, "OWNER")) return false;
    await combat.nextTurn();
    return true;
  }

  // ---------- pour le MJ IA : une ligne dans l'état du jeu, et le rapport de l'outil combat_etat.
  resumePourIA() {
    const lignes = [];
    const combat = this.combat();
    if (combat?.started && this.sys) {
      const e = sur(() => this.etape(combat));
      if (e) lignes.push(`Tour : ${combat.combatant?.name ?? "?"} ; étape suivante : ${this.texteEtape(e)}.`);
    }
    const t = this.lireTable();
    if (t?.actif) {
      const e = L.etapeTourDeTable(t);
      lignes.push(`Tour de table ${t.tour} : ${this.texteEtape(e)} (${t.ordre.map(o => `${o.nom}${t.faits[o.id] ? ` — ${t.faits[o.id] === "passe" ? "a passé" : "a parlé"}` : ""}`).join(", ")}).`);
    }
    return lignes;
  }

  rapport() {
    const combat = this.combat();
    if (!this.sys) return "Pas de tour par tour dans ce système.";
    if (!combat) return `Aucun combat. Prochaine étape : ${this.texteEtape(this.etape(null))}.`;
    const e = this.etape(combat);
    const lignes = [`Combat ${combat.started ? `en cours, round ${combat.round}` : "préparé, pas encore commencé"}. Prochaine étape : ${this.texteEtape(e)}.`];
    const a = this.actif(combat);
    if (a) {
      const r = a.restantes;
      lignes.push(`Tour de ${a.plat.nom} (${a.plat.camp}) — ${a.fiche.pvTexte ?? ""}, ${a.fiche.defense ?? ""}${a.fiche.conditions?.length ? `, états : ${a.fiche.conditions.join(", ")}` : ""}.`);
      lignes.push(`Il lui reste : ${r.lignes.map(l => `${l.libelle} ${l.reste}/${l.max}`).join(", ")}${r.mouvement ? `, mouvement ${metres(r.mouvement.reste)} sur ${metres(r.mouvement.max)}` : a.fiche.allure ? `, allure ${a.fiche.allure}` : ""}.`);
      if (a.attaques.length) lignes.push(`Ses attaques : ${a.attaques.map(x => `${x.nom} (${x.bonus}${x.degats ? `, ${x.degats}` : ""}, ${x.type === "melee" ? "contact" : `portée ${metres(x.portee?.normale)}${x.portee?.longue ? `/${metres(x.portee.longue)}` : ""}`})`).join(" ; ")}.`);
      if (a.cibles.length) lignes.push(`Distances : ${a.cibles.map(c => `${c.nom} ${c.distanceTexte} (${c.defense || "?"}, ${c.pvTexte || "?"}${c.aTerre ? ", à terre" : ""}, ${c.portee === "ok" ? "à portée" : c.portee === "longue" ? "portée longue" : "hors de portée"})`).join(" ; ")}.`);
      if (a.suivi.proposition?.texte) lignes.push(`Proposition sans IA : ${a.suivi.proposition.texte}.`);
    }
    const tous = this.combattants(combat);
    lignes.push(`Ordre : ${tous.map(c => `${c.nom}${c.initiative !== null ? ` [${c.initiative}]` : ""}${c.aTerre ? " (à terre)" : ""}`).join(", ") || "personne"}.`);
    return lignes.join("\n");
  }

  // ---------- ce que montre le panneau du MJ
  contextePanneau() {
    const combat = this.combat();
    const e = this.sys ? this.etape(combat) : null;
    const ctx = { disponible: this.disponible(), etape: e ? { ...e, texte: this.texteEtape(e), detail: this.detailEtape(e) } : null };
    if (!this.sys) return ctx;
    const campLibelle = c => traduire(`LAKOUR_MJIA.Tour.Camps.${c}`);
    if (!combat?.started) {
      ctx.preparation = {
        candidats: this.candidats().map(c => ({ ...c, campLibelle: campLibelle(c.camp) })),
        combattants: this.combattants(combat).map(c => ({ ...c, campLibelle: campLibelle(c.camp) }))
      };
    } else {
      const a = this.actif(combat);
      const actifId = combat.combatant?.id;
      const pnj = a && !["joueur", "compagnon"].includes(a.plat.camp);
      ctx.combat = {
        round: combat.round,
        ordre: this.combattants(combat).map(c => ({ ...c, actif: c.id === actifId, campLibelle: campLibelle(c.camp) })),
        actif: a ? {
          ...a.plat, campLibelle: campLibelle(a.plat.camp), pvTexte: a.fiche.pvTexte, defense: a.fiche.defense, conditions: a.fiche.conditions ?? [],
          pvPct: a.fiche.pvMax ? Math.round(100 * Math.max(0, a.fiche.pv) / a.fiche.pvMax) : null, allure: a.fiche.allure,
          etat: a.plat.mort ? traduire("LAKOUR_MJIA.Tour.Etat.Mort") : a.plat.aTerre ? traduire("LAKOUR_MJIA.Tour.Etat.ATerre") : ""
        } : null,
        restantes: a ? { ...a.restantes, mouvement: a.restantes.mouvement ? { ...a.restantes.mouvement, texte: `${metres(a.restantes.mouvement.reste)} / ${metres(a.restantes.mouvement.max)}` } : null } : null,
        attaques: (a?.attaques ?? []).slice(0, 10).map(x => ({ ...x, porteeTexte: x.type === "melee" ? traduire("LAKOUR_MJIA.Tour.Contact") : `${metres(x.portee?.normale)}${x.portee?.longue ? ` / ${metres(x.portee.longue)}` : ""}` })),
        cibles: a?.cibles ?? [], rappels: [...(a?.suivi.infos ?? []).map(i => ({ texte: `${traduire(`LAKOUR_MJIA.Tour.Infos.${i.cle}`)} ${i.texte}` }))],
        obligations: (a?.suivi.obligations ?? []).map(o => ({ texte: this.texteEtape({ cle: o.cle === "sauvegarde" ? "sauvegarde" : o.cle === "finEffet" ? "finEffet" : "rappel", donnees: { nom: o.nom, effet: o.effet ?? "", raison: o.raison ?? "", dd: o.dd ?? "", texte: o.texte ?? "", sorte: o.sorte ?? "" } }) })),
        proposition: pnj && !a.plat.aTerre && !a.restantes.principaleFaite ? this.proposition(combat) : null, pnj, iaJoue: pnj && Boolean(this.moteur?.actif) && Boolean(reglage("jouerPnj", true)),
        attaque: a?.suivi.attaque ?? null, imperium: Boolean(this.sys.testOppose),
        // Seuls les gestes utiles maintenant (celui de l'étape suivante y est toujours).
        gestes: (ph => ({ toucher: ph === "toucher", degats: ph === "degats", defense: ph === "defense" && Boolean(this.sys.testOppose),
          appliquer: ph === "appliquer", jetMort: Boolean(a?.plat.jetsMort && !a.plat.mort), compagnon: a?.plat.camp === "compagnon" }))(a?.suivi.attaque?.phase)
      };
    }
    const t = this.lireTable();
    if (t?.actif) {
      const et = L.etapeTourDeTable(t);
      ctx.table = { tour: t.tour, etape: { ...et, texte: this.texteEtape(et) },
        ordre: t.ordre.map((o, i) => ({ ...o, courant: i === t.index, fait: t.faits[o.id] ?? "" })) };
    }
    return ctx;
  }

  // ---------- ce que montre le bandeau d'un joueur
  contexteBandeau(utilisateur = game.user) {
    const t = this.lireTable();
    const combat = this.combat();
    if (combat?.started && this.sys) {
      const tous = this.combattants(combat);
      const mes = (combat.turns ?? []).filter(c => c.actor?.testUserPermission?.(utilisateur, "OWNER") && !utilisateur.isGM).map(c => c.id);
      const s = L.situationJoueur(tous, combat.combatant?.id, mes);
      const ctx = { combat: true, round: combat.round, aMoi: s.aMoi, actif: s.actif, puisMoi: s.puisMoi };
      if (s.aMoi) {
        const a = this.actif(combat);
        ctx.restantes = a?.restantes ?? null;
        ctx.mouvement = a?.restantes?.mouvement ? `${metres(a.restantes.mouvement.reste)} / ${metres(a.restantes.mouvement.max)}` : "";
        ctx.attaques = (a?.attaques ?? []).slice(0, 6).map(x => ({ id: x.id, nom: x.nom, img: x.img, bonus: x.bonus }));
      }
      return ctx;
    }
    if (t?.actif) {
      const o = L.orateurTourDeTable(t);
      const acteur = o ? game.actors?.get?.(o.id) : null;
      const aMoi = Boolean(o && !o.compagnon && (o.userId === utilisateur.id || acteur?.testUserPermission?.(utilisateur, "OWNER")) && !utilisateur.isGM);
      return { table: true, tour: t.tour, aMoi, orateur: o?.nom ?? "", fini: L.tourDeTableComplet(t) };
    }
    return null;
  }
}
