// Tour par tour (docs/tour-par-tour.md) en Warhammer 40k (Imperium Maledictum) et en Warcraft (D&D 5e), hors de Foundry :
// la logique pure (étape suivante pour chaque situation, actions restantes, distances en mètres, proposition d'action des PNJ,
// rappels, tour de table), les parties propres à chaque système (adaptateurs : fiche, attaques, lecture des jets, résolution
// directe), et un combat complet simulé avec doublures — joueur, compagnon IA, PNJ — jusqu'à la victoire, sans IA, en suivant
// à chaque fois l'étape suivante (le bouton en pointillés). Aucun appel payant.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "./doublures/foundry-tour.mjs";

F.installer();
const L = await import("../scripts/tour-logique.js");
const { adaptateurDe, PORTEES_IMPMAL, gagneOpposition } = await import("../scripts/adaptateurs.js");
const { TourParTour, mouvementHorsTour, lireSuivi, cleTour, campDe } = await import("../scripts/tour-par-tour.js");
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");

const ECO = { dnd5e: adaptateurDe("dnd5e").tour.economie, impmal: adaptateurDe("impmal").tour.economie };
const SYSTEMES = ["dnd5e", "impmal"];

// ------------------------------------------------------------------ distances
test("distances en mètres : unités des scènes, diagonales, grands jetons, de bord à bord", () => {
  const a = { x: 0, y: 0 }, b = { x: 3, y: 0 }, c = { x: 3, y: 2 };
  assert.equal(L.distanceMetres(a, b, { distance: 5, unites: "ft" }), 4.5, "3 cases de 5 pieds = 4,5 m (5 pi = 1,5 m)");
  assert.equal(L.distanceMetres(a, b, { distance: 1.5, unites: "m" }), 4.5, "Warcraft en mètres : même résultat");
  assert.equal(L.distanceMetres(a, b, { distance: 1, unites: "m" }), 3, "Imperium Maledictum : 1 m par case");
  assert.equal(L.distanceMetres(a, c, { distance: 1, unites: "m", diagonales: 0 }), 3, "équidistant");
  assert.equal(L.distanceMetres(a, c, { distance: 1, unites: "m", diagonales: 4 }), 4, "alternance 1-2-1 (réglage d'Imperium Maledictum)");
  assert.equal(L.distanceMetres(a, { x: 1, y: 1 }, { distance: 5, unites: "ft" }), 1.5, "voisins en diagonale : au contact");
  assert.equal(L.distanceMetres(a, a, { distance: 5, unites: "ft" }), 0);
  assert.equal(L.distanceMetres({ x: 0, y: 0, l: 2, h: 2 }, { x: 3, y: 0 }, { distance: 5, unites: "ft" }), 3, "un grand jeton : de son bord");
  assert.equal(L.versMetres(30, "ft"), 9);
  assert.equal(L.versMetres(1, "km"), 1000);
  assert.equal(L.metresParCase({ distance: 5, unites: "ft" }), 1.5);
});

// ------------------------------------------------------------------ actions restantes
test("actions restantes : D&D 5e (action, bonus, réaction, mouvement en mètres) et Imperium Maledictum (action, déplacement)", () => {
  const r = L.actionsRestantes(ECO.dnd5e, { action: 1 }, { max: 9, utilise: 4.5 });
  assert.deepEqual(r.lignes.map(l => [l.cle, l.reste]), [["action", 0], ["bonus", 1], ["reaction", 1]]);
  assert.deepEqual(r.mouvement, { max: 9, utilise: 4.5, reste: 4.5 });
  assert.equal(r.principaleFaite, true);
  const i = L.actionsRestantes(ECO.impmal, { deplacement: 1 }, null);
  assert.deepEqual(i.lignes.map(l => [l.libelle, l.reste]), [["Action", 1], ["Déplacement", 0]]);
  assert.equal(i.mouvement, null, "Imperium Maledictum ne mesure pas le mouvement en mètres");
  assert.equal(i.principaleFaite, false);
  assert.equal(L.actionsRestantes(ECO.dnd5e, {}, { max: 9, utilise: 12 }).mouvement.reste, 0, "jamais négatif");
  // Dépenses : une ressource ne descend jamais sous zéro ; une activation inconnue ne coûte rien.
  let d = L.depenser(ECO.dnd5e, {}, "bonus");
  d = L.depenser(ECO.dnd5e, d, "bonus");
  assert.deepEqual(d, { bonus: 1 });
  assert.deepEqual(L.depenser(ECO.dnd5e, d, "legendary"), { bonus: 1 });
  assert.equal(adaptateurDe("dnd5e").tour.ressourceDe("bonus"), "bonus");
  assert.equal(adaptateurDe("dnd5e").tour.ressourceDe("legendary"), null, "une action légendaire a sa propre réserve");
  assert.equal(adaptateurDe("impmal").tour.ressourceDe("action"), "action");
});

test("moyenne d'une formule de dégâts", () => {
  assert.equal(L.moyenneFormule("1d8 + 3"), 7.5);
  assert.equal(L.moyenneFormule("2d6+1d4[feu]+2"), 11.5);
  assert.equal(L.moyenneFormule("1d6 - 1"), 2.5);
  assert.equal(L.moyenneFormule("@mod"), 0);
  assert.equal(L.moyenneFormule(6), 6);
});

// ------------------------------------------------------------------ proposition d'action des PNJ
const grille5 = { distance: 5, unites: "ft" };
const hache = { id: "hache", nom: "Hache", type: "melee", allonge: 1.5, moyenne: 7.5 };
const arc = { id: "arc", nom: "Arc court", type: "distance", portee: { normale: 24, longue: 96 }, moyenne: 6.5 };
const ennemi = (id, nom, x, y, extra = {}) => ({ id, nom, camp: "joueur", cases: { x, y }, ...extra });

test("proposition d'un PNJ : le plus proche, la meilleure attaque à portée, sinon on se rapproche", () => {
  const moi = { id: "g", nom: "Gobelin", camp: "ennemi", cases: { x: 0, y: 0 }, mouvement: 9, attaques: [hache, arc] };
  // Au contact : la hache (le tir au contact est désavantagé).
  let p = L.proposerAction({ acteur: moi, adversaires: [ennemi("a", "Grommash", 1, 0), ennemi("b", "Varn", 5, 0)], grille: grille5 });
  assert.deepEqual([p.type, p.cibleNom, p.attaqueNom, p.deplacement], ["attaque", "Grommash", "Hache", null]);
  // À distance : l'arc, sur le plus proche.
  p = L.proposerAction({ acteur: moi, adversaires: [ennemi("a", "Grommash", 10, 0), ennemi("b", "Varn", 6, 0)], grille: grille5 });
  assert.deepEqual([p.cibleNom, p.attaqueNom, p.distance, p.longue], ["Varn", "Arc court", 9, false]);
  // Sans arc, trop loin pour frapper ce tour : se rapprocher (mouvement compté).
  p = L.proposerAction({ acteur: { ...moi, attaques: [hache] }, adversaires: [ennemi("a", "Grommash", 12, 0)], grille: grille5 });
  assert.deepEqual([p.type, p.cibleNom, p.deplacement.metres], ["deplacement", "Grommash", 9]);
  // Assez près pour approcher et frapper.
  p = L.proposerAction({ acteur: { ...moi, attaques: [hache] }, adversaires: [ennemi("a", "Grommash", 5, 0)], grille: grille5 });
  assert.deepEqual([p.type, p.attaqueNom, p.deplacement.metres], ["attaque", "Hache", 6]);
  // Portée longue : moitié moins bien notée, mais toujours mieux que rien.
  p = L.proposerAction({ acteur: { ...moi, attaques: [arc] }, adversaires: [ennemi("a", "Grommash", 40, 0)], grille: grille5 });
  assert.deepEqual([p.type, p.longue], ["attaque", true]);
  // Personne debout : il attend. Un adversaire à terre n'est pas visé.
  assert.equal(L.proposerAction({ acteur: moi, adversaires: [ennemi("a", "Grommash", 1, 0, { aTerre: true })], grille: grille5 }).type, "attendre");
  p = L.proposerAction({ acteur: moi, adversaires: [ennemi("a", "Grommash", 1, 0, { aTerre: true }), ennemi("b", "Varn", 3, 0)], grille: grille5 });
  assert.equal(p.cibleNom, "Varn");
  // Égalité de distance : par nom, toujours le même choix.
  const deux = [ennemi("b", "Zora", 0, 1), ennemi("a", "Arthas", 1, 0)];
  assert.equal(L.proposerAction({ acteur: moi, adversaires: deux, grille: grille5 }).cibleNom, "Arthas");
  assert.deepEqual(L.proposerAction({ acteur: moi, adversaires: deux, grille: grille5 }), L.proposerAction({ acteur: moi, adversaires: [...deux].reverse(), grille: grille5 }));
});

test("camps : un PNJ hostile vise le groupe, le groupe vise les hostiles, un neutre personne", () => {
  const tous = [{ id: "j", camp: "joueur" }, { id: "c", camp: "compagnon" }, { id: "e", camp: "ennemi" }, { id: "n", camp: "neutre" }];
  assert.deepEqual(L.adversairesDe(tous[2], tous).map(c => c.id), ["j", "c"]);
  assert.deepEqual(L.adversairesDe(tous[1], tous).map(c => c.id), ["e"]);
  assert.deepEqual(L.adversairesDe(tous[3], tous), []);
});

test("approcher une cible : une case libre à côté d'elle, sinon le plus loin possible", () => {
  assert.deepEqual(L.caseVers({ x: 0, y: 0 }, { x: 4, y: 0 }, 6), { x: 3, y: 0 });
  const occupees = new Set(["3,0"]);
  const d = L.caseVers({ x: 0, y: 0 }, { x: 4, y: 0 }, 6, { occupees });
  assert.ok(!occupees.has(`${d.x},${d.y}`) && Math.max(Math.abs(d.x - 4), Math.abs(d.y)) === 1, "une autre case voisine");
  assert.deepEqual(L.caseVers({ x: 0, y: 0 }, { x: 10, y: 0 }, 4), { x: 4, y: 0 }, "trop loin : 4 cases vers elle");
});

test("rappels de début de tour : effet fini, concentration, régénération ; infos sur les effets et les états", () => {
  const r = L.rappelsDebutTour({ nom: "Jaina", effets: [{ id: "e1", nom: "Bénédiction", restant: 0, fini: true }, { id: "e2", nom: "Hâte", restant: 3 }],
    concentration: "Hâte", regeneration: "Régénération", conditions: ["Empoisonné"], legendaires: { reste: 2, max: 3 } });
  assert.deepEqual(r.obligations.map(o => o.cle + (o.sorte ? `.${o.sorte}` : "")), ["finEffet", "rappel.concentration", "rappel.regeneration"]);
  assert.deepEqual(r.infos.map(i => i.cle), ["effet", "conditions", "legendaires"]);
  assert.equal(L.ddConcentration(9), 10);
  assert.equal(L.ddConcentration(31), 15);
  assert.equal(L.ddConcentration(200), 30);
});

// ------------------------------------------------------------------ l'étape suivante
const combattant = (id, nom, camp, extra = {}) => ({ id, nom, camp, initiative: 10, aTerre: false, mort: false, jetsMort: null, cases: { x: 0, y: 0 }, ...extra });
const groupe = () => [combattant("j", "Grommash", "joueur"), combattant("c", "Varn", "compagnon"), combattant("g1", "Gobelin", "ennemi"), combattant("g2", "Gobelin chef", "ennemi")];
const etatCombat = (systeme, { actif = "g1", combattants = groupe(), suivi = {}, round = 2, ...extra } = {}) => ({
  combat: { commence: true, round, actif, combattants }, candidats: [], economie: ECO[systeme], suivi: { depenses: {}, obligations: [], ...suivi }, ...extra
});
const cle = e => `${e.cle}${e.attente ? " (attente)" : ""} → ${e.action || "-"}`;

for (const systeme of SYSTEMES) {
  test(`étape suivante (${systeme}) : préparer, initiative, commencer`, () => {
    assert.equal(cle(L.etapeSuivanteCombat({ combat: null, candidats: [{ id: "t1" }], economie: ECO[systeme] })), "ajouter → ajouter");
    const vide = L.etapeSuivanteCombat({ combat: null, candidats: [], economie: ECO[systeme] });
    assert.equal(vide.detail?.cle, "aucunJeton");
    const sans = groupe().map((c, i) => ({ ...c, initiative: i < 2 ? null : 12 }));
    const e = L.etapeSuivanteCombat({ combat: { commence: false, combattants: sans }, economie: ECO[systeme] });
    assert.deepEqual([e.cle, e.donnees.n], ["initiative", 2]);
    assert.equal(cle(L.etapeSuivanteCombat({ combat: { commence: false, combattants: groupe() }, economie: ECO[systeme] })), "commencer → commencer");
  });

  test(`étape suivante (${systeme}) : tour d'un PNJ — cible, proposition, attaque, jets, dégâts, fin du tour, nouveau round`, () => {
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { proposition: { type: "attaque", texte: "attaque Grommash" } } }))), "cible → proposition");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { proposition: { type: "attendre" } } }))), "cible → cible");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { cible: "t", cibleNom: "Grommash" } }))), "attaquer → attaquer");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { attaque: { phase: "toucher", nom: "Hache" } } }))), "toucher → toucher");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { attaque: { phase: "degats", nom: "Hache" } } }))), "degats → degats");
    const ap = L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { depenses: { action: 1 }, attaque: { phase: "appliquer", degats: 9, cibleNom: "Grommash" } } }));
    assert.deepEqual([ap.cle, ap.action, ap.donnees.n, ap.donnees.cible], ["appliquer", "appliquer", 9, "Grommash"]);
    const s = L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { depenses: { action: 1 }, attaque: { phase: "fini" } } }));
    assert.deepEqual([s.cle, s.donnees.nom], ["suivant", "Gobelin chef"]);
    const r = L.etapeSuivanteCombat(etatCombat(systeme, { actif: "g2", suivi: { depenses: { action: 1 } } }));
    assert.deepEqual([r.cle, r.action, r.donnees.round], ["round", "suivant", 3]);
    // Le MJ IA en séance joue les PNJ : le panneau l'attend.
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { seanceIA: true, iaJouePnj: true }))), "pnjIA (attente) → -");
  });

  test(`étape suivante (${systeme}) : tour d'un joueur (on l'attend, ses jets sont les siens) et d'un compagnon IA`, () => {
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j" }))), "attenteJoueur (attente) → -");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j", suivi: { attaque: { phase: "degats" } } }))), "degats (attente) → -");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j", suivi: { attaque: { phase: "appliquer", degats: 7 } } }))), "appliquer → appliquer",
      "le MJ applique les dégâts du joueur");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "c" }))), "compagnon → compagnon");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "c", suivi: { compagnonEnCours: true } }))), "compagnon (attente) → -");
  });

  test(`étape suivante (${systeme}) : obligations d'abord (sauvegarde, fin d'effet, rappel), puis défense, à terre, victoire, défaite`, () => {
    const o = (x, extra = {}) => L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { obligations: [x], attaque: { phase: "appliquer", degats: 3 } }, ...extra }));
    assert.deepEqual([o({ cle: "sauvegarde", nom: "Jaina", raison: "concentration", dd: 10 }).cle, o({ cle: "sauvegarde", nom: "Jaina" }).action], ["sauvegarde", "obligation"]);
    assert.equal(o({ cle: "finEffet", nom: "Jaina", effet: "Bénédiction" }).cle, "finEffet");
    const rc = o({ cle: "rappel", sorte: "concentration", nom: "Jaina", texte: "Hâte" });
    assert.deepEqual([rc.cle, rc.donnees.sorte, rc.detail.cle], ["rappel", "concentration", "rappel.concentration"]);
    // Défense (test opposé d'Imperium Maledictum) : un PNJ défenseur, le MJ clique ; un joueur défenseur, on l'attend.
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j", suivi: { attaque: { phase: "defense", cibleId: "g1", cibleNom: "Gobelin" } } }))), "defense → defense");
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { suivi: { attaque: { phase: "defense", cibleId: "j", cibleNom: "Grommash" } } }))), "defense (attente) → -");
    // À terre.
    const terre = groupe().map(c => (c.id === "g1" ? { ...c, aTerre: true } : c));
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { combattants: terre }))), "aTerre → suivant");
    const mourant = groupe().map(c => (c.id === "j" ? { ...c, aTerre: true, jetsMort: { succes: 1, echecs: 0 } } : c));
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j", combattants: mourant }))), "jetMort → jetMort");
    assert.equal(L.etapeSuivanteCombat(etatCombat(systeme, { actif: "j", combattants: mourant, suivi: { attaque: { phase: "fini" } } })).cle, "suivant", "un jet par tour");
    // Victoire, défaite.
    const victoire = groupe().map(c => (c.camp === "ennemi" ? { ...c, aTerre: true } : c));
    assert.equal(cle(L.etapeSuivanteCombat(etatCombat(systeme, { combattants: victoire }))), "victoire → finCombat");
    const defaite = groupe().map(c => (c.camp !== "ennemi" ? { ...c, aTerre: true, mort: true } : c));
    assert.equal(L.etapeSuivanteCombat(etatCombat(systeme, { combattants: defaite })).cle, "defaite");
    const presque = groupe().map(c => (c.camp !== "ennemi" ? { ...c, aTerre: true, jetsMort: { succes: 0, echecs: 1 } } : c));
    assert.notEqual(L.etapeSuivanteCombat(etatCombat(systeme, { combattants: presque })).cle, "defaite", "des mourants peuvent encore être sauvés");
  });
}

test("ce que voit un joueur : à toi, au tour de X puis toi, au tour de X", () => {
  const tous = groupe();
  assert.deepEqual(L.situationJoueur(tous, "j", ["j"]), { aMoi: true, actif: "Grommash", puisMoi: false });
  assert.deepEqual(L.situationJoueur(tous, "g1", ["j"]), { aMoi: false, actif: "Gobelin", puisMoi: false });
  assert.deepEqual(L.situationJoueur(tous, "g2", ["j"]), { aMoi: false, actif: "Gobelin chef", puisMoi: true }, "au début du round suivant");
  assert.deepEqual(L.situationJoueur([...tous.slice(2), ...tous.slice(0, 2)], "g2", ["j"]), { aMoi: false, actif: "Gobelin chef", puisMoi: true });
});

// ------------------------------------------------------------------ tour de table
test("tour de table : chacun à son tour, un autre ne fait rien avancer, passer, fin ; le MJ IA attend la fin", () => {
  let t = L.nouveauTourDeTable([{ id: "a", nom: "Grommash", userId: "u1" }, { id: "b", nom: "Varn", compagnon: true }, { id: "a", nom: "doublon" }]);
  assert.equal(t.ordre.length, 2);
  assert.deepEqual([L.etapeTourDeTable(t).cle, L.etapeTourDeTable(t).attente, L.tourDeTableRetient(t)], ["tableParole", true, true]);
  assert.equal(L.avancerTourDeTable(t, { id: "b" }), t, "ce n'est pas à Varn");
  t = L.avancerTourDeTable(t, { id: "a" });
  assert.deepEqual([L.etapeTourDeTable(t).cle, L.etapeTourDeTable(t).action], ["tableCompagnon", "tableCompagnon"]);
  t = L.sauterTourDeTable(t);
  assert.deepEqual(t.faits, { a: "parle", b: "passe" });
  const fin = L.etapeTourDeTable(t);
  assert.deepEqual([fin.cle, fin.action, fin.donnees.passes, L.tourDeTableComplet(t), L.tourDeTableRetient(t)], ["tableFini", "tableNouveau", 1, true, false]);
  assert.equal(L.etapeTourDeTable({ actif: false }), null);
  assert.equal(L.nouveauTourDeTable([]).actif, false);
});

// ------------------------------------------------------------------ adaptateurs : ce qui est propre à chaque système
function arme5e({ nom, toucher, degats, contact = true, portee = 80, longue = 320, d20 = () => F.etat.des.d20.shift() ?? 10 }) {
  const act = {
    id: F.nouvelId(), type: "attack", name: "", activation: { type: "action" },
    range: contact ? { units: "ft", reach: 5 } : { value: portee, long: longue, units: "ft" },
    attack: { type: { value: contact ? "melee" : "ranged" } }, labels: { toHit: `+${toucher}`, damage: [{ formula: degats }] },
    async rollAttack() { const d = d20(); return [{ total: d + toucher, isCritical: d === 20, isFumble: d === 1 }]; },
    async rollDamage(c = {}) { const m = Math.floor(L.moyenneFormule(degats)); return [{ total: c.isCritical ? m * 2 : m }]; }
  };
  return { id: F.nouvelId(), name: nom, type: "weapon", img: `${nom}.webp`,
    system: { equipped: true, range: contact ? { reach: 5, units: "ft" } : { value: portee, long: longue, units: "ft" }, activities: new F.Collection([[act.id, act]]) } };
}
function heros5e({ nom, pv, ca, init, joueur = false, compagnon = false, armes = [], vitesse = 30 }) {
  const a = F.acteur({
    name: nom, type: joueur || compagnon ? "character" : "npc", init, hasPlayerOwner: joueur,
    flags: compagnon ? { "lakour-mj-ia": { compagnon: { temperament: "loyal", parler: "", histoire: "" } } } : {},
    system: { attributes: { hp: { value: pv, max: pv }, ac: { value: ca }, death: { success: 0, failure: 0 }, movement: { speeds: { walk: vitesse }, units: "ft" } }, resources: {} },
    async applyDamage(n) { this.system.attributes.hp.value = Math.max(0, this.system.attributes.hp.value - n); },
    async rollDeathSave() { const d = F.etat.des.d20.shift() ?? 12; this.system.attributes.death[d >= 10 ? "success" : "failure"] += 1; return [{ total: d }]; },
    async rollSavingThrow() { return [{ total: F.etat.des.d20.shift() ?? 10 }]; }
  });
  for (const w of armes) a.items.set(w.id, w);
  return a;
}

test("D&D 5e : fiche (PV, CA, à terre, jets contre la mort, concentration, légendaires), attaques avec portée en mètres", () => {
  F.installer({ systeme: "dnd5e" });
  const T = adaptateurDe("dnd5e").tour;
  const g = heros5e({ nom: "Grommash", pv: 30, ca: 16, joueur: true, armes: [arme5e({ nom: "Hache", toucher: 6, degats: "1d12+4" }), arme5e({ nom: "Arc", toucher: 4, degats: "1d8+2", contact: false })] });
  let f = T.combattant(g);
  assert.deepEqual([f.pvTexte, f.defense, f.aTerre, f.jetsMort, f.mouvementMax], ["PV 30/30", "CA 16", false, null, 9]);
  g.system.attributes.hp.value = 0;
  f = T.combattant(g);
  assert.deepEqual([f.aTerre, f.mort, f.jetsMort], [true, false, { succes: 0, echecs: 0 }], "un personnage à 0 PV fait des jets contre la mort");
  g.system.attributes.death.failure = 3;
  assert.equal(T.combattant(g).mort, true);
  const gob = heros5e({ nom: "Gobelin", pv: 0, ca: 13 });
  assert.deepEqual([T.combattant(gob).mort, T.combattant(gob).jetsMort], [true, null], "un PNJ à 0 PV est mort");
  const jaina = heros5e({ nom: "Jaina", pv: 20, ca: 12 });
  jaina.concentration = { items: new Set([{ name: "Hâte" }]), effects: new Set([{}]) };
  jaina.system.resources.legact = { value: 2, max: 3 };
  jaina.statuses = new Set(["poisoned", "concentrating"]);
  f = T.combattant(jaina);
  assert.deepEqual([f.concentration, f.legendaires, f.conditions], ["Hâte", { reste: 2, max: 3 }, ["Empoisonné"]]);
  const att = T.attaques(g);
  assert.deepEqual(att.map(a => [a.nom, a.type, a.allonge, a.portee, a.moyenne, a.bonus]),
    [["Hache", "melee", 1.5, null, 10.5, "+6"], ["Arc", "distance", null, { normale: 24, longue: 96 }, 6.5, "+4"]]);
});

test("D&D 5e : lecture des jets au chat et résolution directe (attaque contre la CA, critique, raté)", async () => {
  F.installer({ systeme: "dnd5e" });
  const T = adaptateurDe("dnd5e").tour;
  assert.deepEqual(T.lireMessage({ type: "attack", rolls: [{ total: 15 }], system: { targets: [{ ac: 13, uuid: "Actor.x" }] } }),
    { genre: "attaque", total: 15, touche: true, critique: false, phase: "degats", cibleUuid: "Actor.x" });
  assert.equal(T.lireMessage({ type: "attack", rolls: [{ total: 9 }], system: { targets: [{ ac: 13 }] } }).phase, "fini");
  assert.equal(T.lireMessage({ type: "attack", rolls: [{ total: 9, isCritical: true }], system: { targets: [{ ac: 13 }] } }).touche, true);
  assert.equal(T.lireMessage({ type: "attack", rolls: [{ total: 9 }], system: {} }).touche, null, "sans cible désignée : au MJ de juger");
  assert.deepEqual(T.lireMessage({ type: "damage", rolls: [{ total: 6 }, { total: 3 }], system: {} }), { genre: "degats", degats: 9, phase: "appliquer", cibleUuid: "" });
  assert.equal(T.lireMessage({ system: { activity: { uuid: "inconnu", type: "attack" }, item: { name: "Hache" } } }).phase, "toucher");
  assert.equal(T.lireMessage({ type: "base", system: {} }), null);
  const g = heros5e({ nom: "Grommash", pv: 30, ca: 16, armes: [arme5e({ nom: "Hache", toucher: 6, degats: "1d12+4" })] });
  const cible = heros5e({ nom: "Gobelin", pv: 7, ca: 13 });
  const [hache] = T.attaques(g);
  F.etat.des.d20 = [10, 2, 20];
  assert.deepEqual(await T.resoudre(g, hache, cible).then(r => [r.touche, r.degats]), [true, 10]);
  assert.deepEqual(await T.resoudre(g, hache, cible).then(r => [r.touche, r.degats]), [false, 0]);
  assert.deepEqual(await T.resoudre(g, hache, cible).then(r => [r.touche, r.critique, r.degats]), [true, true, 20]);
});

function armeIM({ nom, melee = true, degats = 5, bande = "short" }) {
  return { id: F.nouvelId(), name: nom, type: "weapon", img: `${nom}.webp`, system: { attackType: melee ? "melee" : "ranged", range: melee ? "" : bande, damage: { value: degats }, isEquipped: true, getSkill: () => (melee ? "melee" : "ranged") } };
}
function persoIM({ nom, blessures = 12, init, joueur = false, compagnon = false, armes = [], melee = 45, distance = 40, reflexes = 30, type }) {
  const a = F.acteur({
    name: nom, type: type ?? (joueur || compagnon ? "character" : "npc"), init, hasPlayerOwner: joueur,
    flags: compagnon ? { "lakour-mj-ia": { compagnon: { temperament: "loyal", parler: "", histoire: "" } } } : {},
    system: { skills: { melee: { total: melee }, ranged: { total: distance }, reflexes: { total: reflexes }, psychic: { total: 20 } },
      combat: { wounds: { value: 0, max: blessures }, criticals: { value: 0, max: 3 }, speed: { land: { value: "normal" } } } },
    async applyDamage(n) { this.system.combat.wounds.value += n; return { woundsGained: n }; }
  });
  for (const w of armes) a.items.set(w.id, w);
  return a;
}

test("Imperium Maledictum : fiche (blessures, défense, allure), armes à bandes de portée, test opposé, lecture des messages", async () => {
  F.installer({ systeme: "impmal" });
  const T = adaptateurDe("impmal").tour;
  const p = persoIM({ nom: "Sœur Ilsa", type: "character", armes: [armeIM({ nom: "Épée tronçonneuse", degats: 6 }), armeIM({ nom: "Pistolet laser", melee: false, degats: 4 })] });
  let f = T.combattant(p);
  assert.deepEqual([f.pvTexte, f.defense, f.aTerre, f.mouvementMax, f.jetsMort], ["Blessures 0/12", "Réflexes 30 · Mêlée 45", false, 8, null]);
  p.system.combat.wounds.value = 14;
  assert.equal(T.combattant(p).aTerre, false, "un personnage au-delà de ses blessures prend des critiques, il n'est pas à terre");
  p.system.combat.criticals.value = 4;
  assert.deepEqual([T.combattant(p).aTerre, T.combattant(p).mort], [true, true], "plus de critiques que son maximum : mort");
  const pnj = persoIM({ nom: "Cultiste", blessures: 6 });
  pnj.system.combat.wounds.value = 6;
  assert.equal(T.combattant(pnj).aTerre, true, "un PNJ à son maximum de blessures est hors de combat");
  const att = T.attaques(p);
  assert.deepEqual(att.map(a => [a.nom, a.type, a.portee, a.cible, a.degatsBase]),
    [["Épée tronçonneuse", "melee", null, 45, 6], ["Pistolet laser", "distance", { normale: PORTEES_IMPMAL.short, longue: PORTEES_IMPMAL.medium }, 40, 4]]);
  // Règle du test opposé du système : DR de l'attaquant moins DR du défenseur ; à égalité, la compétence la plus haute.
  assert.equal(gagneOpposition({ dr: 2 }, { dr: 1 }, 40, 50), true);
  assert.equal(gagneOpposition({ dr: 1 }, { dr: 1 }, 40, 50), false);
  assert.equal(gagneOpposition({ dr: 1 }, { dr: 1 }, 55, 50), true);
  // Résolution directe : 23 contre 45 (+2 DR) ; en mêlée, le défenseur pare ou esquive au mieux : 61 contre 45 (−2 DR) ; 6 + 4 = 10.
  F.etat.des.d100 = [23, 61, 80, 12];
  assert.deepEqual(await T.resoudre(p, att[0], pnj).then(r => [r.touche, r.degats]), [true, 10]);
  assert.deepEqual(await T.resoudre(p, att[0], pnj).then(r => [r.touche, r.degats]), [false, 0], "80 contre 45, défense 12 contre 45");
  // Messages : test d'arme (attaque), test opposé en attente, puis dégâts à appliquer, puis appliqués.
  assert.deepEqual(T.lireMessage({ type: "test", system: { test: { item: { type: "weapon", id: "w", name: "Épée" } } } }),
    { genre: "attaque", activation: "action", attaqueId: "w", nom: "Épée", phase: "defense" });
  assert.equal(T.lireMessage({ type: "test", system: { test: { context: {} } } }).genre, "test");
  const op = s => T.lireMessage({ id: "m", type: "opposed", system: { targetTokenUuid: "T", result: {}, applied: {}, ...s } });
  assert.equal(op({}).phase, "defense");
  assert.deepEqual([op({ defenderMessageId: "d", result: { winner: "attacker", damage: 7 } }).phase, op({ defenderMessageId: "d", result: { winner: "attacker", damage: 7 } }).degats], ["appliquer", 7]);
  assert.equal(op({ unopposed: true, result: { winner: "defender" } }).phase, "fini");
  assert.equal(op({ defenderMessageId: "d", result: { winner: "attacker", damage: 7 }, applied: { woundsGained: 3 } }).phase, "fini");
  assert.equal(T.actionChoisie({ system: { combat: { action: "aim" } } }), true, "viser, charger, courir… occupe l'action");
});

test("les deux adaptateurs ont la même forme (règle de parité)", () => {
  const cles = id => Object.keys(adaptateurDe(id).tour).sort();
  assert.deepEqual(cles("dnd5e"), cles("impmal"));
  assert.equal(adaptateurDe("lakour-loups").tour, undefined, "pas de tour par tour aux Veillées (elles ont leur Table)");
});

// ------------------------------------------------------------------ outils du MJ IA
test("outils du MJ IA : combat_etat et tour_de_table en 40k et en Warcraft, pas aux Veillées", () => {
  for (const s of SYSTEMES) for (const o of ["combat_etat", "tour_de_table", "passer_tour", "lancer_combat"]) assert.ok(outilsDuSysteme(s).some(x => x.nom === o), `${s} : ${o}`);
  assert.ok(!outilsDuSysteme("lakour-loups").some(x => x.nom === "combat_etat"));
  assert.equal(OUTILS.find(o => o.nom === "combat_etat").sensible, false);
});

// ------------------------------------------------------------------ le tour par tour dans Foundry (doublures)
// Le MJ « suit les pointillés » : à chaque étape, il presse le bouton qu'elle désigne. Un joueur joue ses vrais jets (les
// messages qu'aurait postés le système) ; un compagnon IA agit seul (sans IA : la proposition) ; un PNJ suit la proposition.
async function suivreLesPointilles(tour, { joueurAgit, max = 400 }) {
  const vues = [];
  for (let i = 0; i < max; i++) {
    const e = tour.etape();
    vues.push(e.cle);
    if (["victoire", "defaite"].includes(e.cle)) { await tour.finCombat(); return vues; }
    switch (e.action) {
      case "ajouter": await tour.ajouter(tour.candidats().filter(c => c.coche).map(c => c.id)); break;
      case "initiative": await tour.initiative(); break;
      case "commencer": await tour.commencer(); break;
      case "proposition": await tour.accepterProposition(); break;
      case "cible": await tour.suivant(); break;
      case "appliquer": await tour.appliquer(); break;
      case "obligation": await tour.obligation(); break;
      case "jetMort": await tour.jetMort(); break;
      case "defense": await tour.defendre("dodge"); break;
      case "suivant": await tour.suivant(); break;
      case "compagnon": await tour.jouerCompagnon(); break;
      case "": if (e.cle === "attenteJoueur") await joueurAgit(tour); else await F.attendre(); break;
      default: throw new Error(`étape inattendue : ${e.cle} → ${e.action}`);
    }
  }
  throw new Error(`combat sans fin : ${vues.slice(-12).join(", ")}`);
}

// Ce que fait le joueur de D&D 5e : il s'approche, utilise son arme (carte d'utilisation), lance l'attaque puis les dégâts.
async function joueur5e(tour) {
  const combat = tour.combat();
  const c = combat.combatant;
  const p = tour.proposition();
  const cible = combat.combatants.get(p.cibleId);
  if (p.deplacement?.metres > 0) await tour.deplacer(c.token, cible.token, p.deplacement.metres);
  if (p.type !== "attaque") return tour.demandeFinDeTour("u1");
  const att = tour.attaqueDeLActif(p.attaqueId);
  const act = c.actor.items.get(att.itemId).system.activities.get(att.activiteId);
  const qui = { actor: c.actorId, token: c.tokenId };
  const cibles = [{ ac: cible.actor.system.attributes.ac.value, uuid: cible.actor.uuid }];
  await tour.surMessage({ speaker: qui, system: { activity: { uuid: "carte", type: "attack" }, item: { name: att.nom } } });
  const [jet] = await act.rollAttack();
  await tour.surMessage({ type: "attack", speaker: qui, rolls: [jet], system: { targets: cibles } });
  if (jet.total >= cibles[0].ac || jet.isCritical) await tour.surMessage({ type: "damage", speaker: qui, rolls: await act.rollDamage(jet), system: { targets: cibles } });
  return null;
}

// Ce que fait le joueur d'Imperium Maledictum : il s'approche, lance son test d'arme ; le système crée le test opposé de la
// cible (que le MJ fait esquiver), puis les dégâts à appliquer.
async function joueurIM(tour) {
  const combat = tour.combat();
  const c = combat.combatant;
  const p = tour.proposition();
  const cible = combat.combatants.get(p.cibleId);
  if (p.deplacement?.metres > 0) await tour.deplacer(c.token, cible.token, p.deplacement.metres);
  if (p.type !== "attaque") return tour.demandeFinDeTour("u1");
  const att = tour.attaqueDeLActif(p.attaqueId);
  const test = await ChatMessage.implementation.create({ type: "test", speaker: { actor: c.actorId, token: c.tokenId }, system: { test: { item: { type: "weapon", id: att.id, name: att.nom } } } });
  await tour.surMessage(test);
  const jetA = F.etat.des.d100.shift() ?? 50;
  const op = await ChatMessage.implementation.create({ type: "opposed", speaker: { alias: "Test opposé" }, system: {
    attackerMessageId: test.id, targetTokenUuid: cible.token.uuid, result: {}, applied: {},
    async performResponse() {
      const a = (await import("../scripts/adaptateurs.js")).testD100(att.cible, jetA);
      const d = (await import("../scripts/adaptateurs.js")).testD100(cible.actor.system.skills.reflexes.total, F.etat.des.d100.shift() ?? 50);
      const gagne = gagneOpposition(a, d, att.cible, cible.actor.system.skills.reflexes.total);
      this.defenderMessageId = "defense";
      this.result = { winner: gagne ? "attacker" : "defender", damage: gagne ? att.degatsBase + a.dr - d.dr : 0 };
      await tour.surMessage(op, { maj: true });
    },
    async applyDamage() { await cible.actor.applyDamage(this.result.damage); this.applied = { woundsGained: this.result.damage }; }
  } });
  await tour.surMessage(op);
  return null;
}

function cycle(valeurs) { const liste = []; for (let i = 0; i < 400; i++) liste.push(valeurs[i % valeurs.length]); return liste; }

test("combat complet simulé en Warcraft (D&D 5e) : joueur, compagnon IA, PNJ, jusqu'à la victoire, sans IA", async () => {
  F.installer({ systeme: "dnd5e" });
  F.creerScene({ distance: 5, unites: "ft" });
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  game.modules.get("lakour-mj-ia").api.tour = tour;
  F.etat.des.d20 = cycle([14, 8, 17, 11, 19, 5, 12, 16, 3, 20, 9, 13]);
  const grommash = heros5e({ nom: "Grommash", pv: 40, ca: 16, init: 15, joueur: true, armes: [arme5e({ nom: "Hache", toucher: 6, degats: "1d12+4" })] });
  const varn = heros5e({ nom: "Varn", pv: 25, ca: 14, init: 12, compagnon: true, armes: [arme5e({ nom: "Arc long", toucher: 5, degats: "1d8+3", contact: false, portee: 150, longue: 600 })] });
  const gob1 = heros5e({ nom: "Gobelin", pv: 7, ca: 13, init: 14, armes: [arme5e({ nom: "Cimeterre", toucher: 4, degats: "1d6+2" }), arme5e({ nom: "Arc court", toucher: 4, degats: "1d6+2", contact: false })] });
  const gob2 = heros5e({ nom: "Gobelin chef", pv: 12, ca: 15, init: 10, armes: [arme5e({ nom: "Cimeterre", toucher: 4, degats: "1d6+2" })] });
  F.poserJeton(grommash, 2, 2, { disposition: 1 });
  F.poserJeton(varn, 1, 4, { disposition: 1 });
  F.poserJeton(gob1, 8, 2);
  F.poserJeton(gob2, 9, 5);
  F.poserJeton(heros5e({ nom: "Marchand", pv: 4, ca: 10 }), 0, 9, { disposition: 0 });
  const vues = await suivreLesPointilles(tour, { joueurAgit: joueur5e });
  for (const e of ["ajouter", "initiative", "commencer", "attenteJoueur", "compagnon", "cible", "appliquer", "suivant", "round", "victoire"]) {
    assert.ok(vues.includes(e), `étape jamais vue : ${e} (${[...new Set(vues)].join(", ")})`);
  }
  assert.ok(game.combats[0].fin, "le combat est fini");
  assert.equal(game.combats[0].combatants.size, 4, "le marchand neutre n'était pas coché");
  assert.ok(gob1.system.attributes.hp.value === 0 && gob2.system.attributes.hp.value === 0, "les deux gobelins sont à terre");
  assert.ok(tour.journal.some(j => j.geste === "compagnon" && j.qui === "Varn"), "le compagnon a joué seul");
  assert.ok(tour.journal.some(j => j.geste === "attaque" && j.qui.startsWith("Gobelin")), "les PNJ ont attaqué par la proposition");
});

test("combat complet simulé en 40k (Imperium Maledictum) : test opposé, dégâts appliqués par le système, jusqu'à la victoire", async () => {
  F.installer({ systeme: "impmal" });
  F.creerScene({ distance: 1, unites: "m", diagonales: 4 });
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  game.modules.get("lakour-mj-ia").api.tour = tour;
  F.etat.des.d100 = cycle([23, 61, 12, 77, 35, 88, 41, 9, 56, 30, 18, 72]);
  const ilsa = persoIM({ nom: "Sœur Ilsa", init: 9.4, joueur: true, armes: [armeIM({ nom: "Épée tronçonneuse", degats: 6 })] });
  const kael = persoIM({ nom: "Kael", init: 8.3, compagnon: true, armes: [armeIM({ nom: "Fusil laser", melee: false, degats: 5, bande: "medium" })] });
  const cult1 = persoIM({ nom: "Cultiste", init: 7.1, blessures: 14, melee: 35, reflexes: 25, armes: [armeIM({ nom: "Couteau", degats: 3 })] });
  const cult2 = persoIM({ nom: "Cultiste armé", init: 6.2, blessures: 14, distance: 30, reflexes: 25, armes: [armeIM({ nom: "Pistolet automatique", melee: false, degats: 4 })] });
  F.poserJeton(ilsa, 2, 2, { disposition: 1 });
  F.poserJeton(kael, 1, 6, { disposition: 1 });
  F.poserJeton(cult1, 7, 2);
  F.poserJeton(cult2, 12, 4);
  const vues = await suivreLesPointilles(tour, { joueurAgit: joueurIM });
  for (const e of ["ajouter", "initiative", "commencer", "attenteJoueur", "defense", "compagnon", "cible", "appliquer", "round", "victoire"]) {
    assert.ok(vues.includes(e), `étape jamais vue : ${e} (${[...new Set(vues)].join(", ")})`);
  }
  assert.ok(cult1.system.combat.wounds.value >= 14 && cult2.system.combat.wounds.value >= 14, "les deux cultistes sont hors de combat");
});

test("suivi du tour : réaction prise jusqu'au prochain tour, action de combat choisie, mouvement fait, drapeau périmé", async () => {
  F.installer({ systeme: "dnd5e" });
  const sc = F.creerScene({ distance: 5, unites: "ft" });
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  const a = heros5e({ nom: "Grommash", pv: 30, ca: 16, init: 15, joueur: true, armes: [arme5e({ nom: "Hache", toucher: 6, degats: "1d12+4" })] });
  const b = heros5e({ nom: "Gobelin", pv: 7, ca: 13, init: 10, armes: [arme5e({ nom: "Cimeterre", toucher: 4, degats: "1d6+2" })] });
  const ta = F.poserJeton(a, 0, 0, { disposition: 1 });
  F.poserJeton(b, 1, 0);
  await tour.ajouter(sc.tokens.map(t => t.id));
  await tour.initiative();
  await tour.commencer();
  const combat = tour.combat();
  assert.equal(combat.combatant.name, "Grommash");
  // Grommash a bougé de 15 pieds : 4,5 m sur 9.
  ta.movementHistory = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  ta.measureMovementPath = () => ({ distance: 15 });
  assert.deepEqual(tour.actif().restantes.mouvement, { max: 9, utilise: 4.5, reste: 4.5 });
  // Pendant le tour de Grommash, le gobelin utilise sa réaction ; elle lui revient à son propre tour.
  const gob = combat.combatants.find(c => c.name === "Gobelin");
  const usage = { speaker: { actor: gob.actorId, token: gob.tokenId }, system: { activity: { uuid: "r", type: "utility" } } };
  const lire = tour.sys.lireMessage;
  tour.sys.lireMessage = m => (m === usage ? { genre: "usage", activation: "reaction", phase: null } : lire(m));
  await tour.surMessage(usage);
  assert.equal(lireSuivi(combat).reactions[gob.id], true);
  await tour.suivant();
  assert.equal(combat.combatant.name, "Gobelin");
  assert.equal(lireSuivi(combat).reactions[gob.id], undefined, "réaction rendue au début de son tour");
  tour.sys.lireMessage = lire;
  assert.notEqual(lireSuivi(combat).cle, "", "suivi du nouveau tour");
  assert.equal(cleTour({ started: false }), "");
  assert.deepEqual(campDe({ actor: a }), "joueur");
  // Un drapeau d'un autre tour est ignoré.
  combat.flags["lakour-mj-ia"].tour = JSON.stringify({ cle: "ancien", depenses: { action: 1 } });
  assert.deepEqual(lireSuivi(combat).depenses, {});
});

test("dégâts sur une créature concentrée (D&D 5e) : sauvegarde de concentration demandée, DD selon les dégâts", async () => {
  F.installer({ systeme: "dnd5e" });
  const sc = F.creerScene({ distance: 5, unites: "ft" });
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  F.etat.des.d20 = cycle([15]);
  const ogre = heros5e({ nom: "Ogre", pv: 50, ca: 11, init: 20, armes: [arme5e({ nom: "Massue", toucher: 6, degats: "2d8+4" })] });
  const jaina = heros5e({ nom: "Jaina", pv: 30, ca: 12, init: 5, joueur: true });
  jaina.concentration = { items: new Set([{ name: "Hâte" }]), effects: new Set([{}]) };
  let sauvegarde = null;
  jaina.rollConcentration = async c => { sauvegarde = c; return [{ total: 12 }]; };
  F.poserJeton(ogre, 0, 0);
  F.poserJeton(jaina, 1, 0, { disposition: 1 });
  await tour.ajouter(sc.tokens.map(t => t.id));
  await tour.initiative();
  await tour.commencer();
  assert.equal(tour.etape().action, "proposition");
  await tour.accepterProposition();
  assert.deepEqual([tour.etape().cle, tour.etape().donnees.n], ["appliquer", 13]);
  await tour.appliquer();
  assert.equal(jaina.system.attributes.hp.value, 17);
  const e = tour.etape();
  assert.deepEqual([e.cle, e.donnees.nom, e.donnees.dd], ["sauvegarde", "Jaina", 10]);
  await tour.obligation();
  assert.deepEqual(sauvegarde, { target: 10 }, "la vraie sauvegarde de concentration du système");
  assert.equal(tour.etape().cle, "suivant", "puis le tour de Jaina");
});

test("tour de table dans Foundry : ordre, message du joueur, compagnon qui parle seul, fin signalée au MJ IA", async () => {
  F.installer({ systeme: "dnd5e" });
  F.creerScene();
  const signaux = [];
  const postes = [];
  const moteur = { actif: true, signaler: (t, o) => signaux.push([t, o]), compagnons: {
    vue: a => ({ id: a.id, nom: a.name }), cerveaux: { graine: "g", parler: async () => ({ texte: "*Varn tend l'oreille.* — J'écoute à la porte.", source: "ia" }) },
    poster: async (a, t) => postes.push([a.name, t])
  } };
  const tour = new TourParTour({ moteur, delai: async () => {}, pause: 0 });
  const g = heros5e({ nom: "Grommash", pv: 30, ca: 16, joueur: true });
  const v = heros5e({ nom: "Varn", pv: 20, ca: 14, compagnon: true });
  F.poserJeton(v, 0, 0, { disposition: 1 });
  F.poserJeton(g, 1, 0, { disposition: 1 });
  F.poserJeton(heros5e({ nom: "Garde", pv: 9, ca: 12 }), 3, 3);
  const t = await tour.commencerTable();
  assert.deepEqual(t.ordre.map(o => o.nom), ["Grommash", "Varn"], "les joueurs d'abord, les PNJ jamais");
  assert.equal(tour.retientIA(), true);
  assert.equal(await tour.surMessageTable({ author: game.users.get("mj"), content: "x" }), false, "le MJ ne parle pas à la place du joueur");
  await tour.surMessageTable({ author: game.users.get("u1"), content: "Je fouille le coffre." });
  await F.attendre();
  assert.deepEqual(postes, [["Varn", "*Varn tend l'oreille.* — J'écoute à la porte."]], "le compagnon a parlé à son tour");
  assert.equal(tour.retientIA(), false);
  assert.match(signaux[0][0], /Tour de table 1 terminé/);
  assert.equal(signaux[0][1].immediat, true);
  assert.match(tour.resumePourIA().join("\n"), /Tour de table 1/);
  // Une demande de joueur qui n'a pas la parole est refusée.
  await tour.commencerTable();
  assert.equal(await tour.demandeTable("passe", "mj"), false);
  assert.equal(await tour.demandeTable("passe", "u1"), true);
});

test("seul le combattant actif peut bouger (réglage) ; le MJ jamais bloqué ; le MJ IA attend la fin du tour de table", async () => {
  F.installer({ systeme: "dnd5e" });
  const sc = F.creerScene();
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  const a = heros5e({ nom: "A", pv: 10, ca: 10, init: 20, joueur: true });
  const b = heros5e({ nom: "B", pv: 10, ca: 10, init: 5, joueur: true });
  const ta = F.poserJeton(a, 0, 0, { disposition: 1 });
  const tb = F.poserJeton(b, 1, 0, { disposition: 1 });
  F.poserJeton(heros5e({ nom: "C", pv: 5, ca: 10, init: 1 }), 5, 5);
  await tour.ajouter(sc.tokens.map(t => t.id));
  await tour.initiative();
  await tour.commencer();
  const joueur = game.users.get("u1"), mj = game.users.get("mj");
  assert.equal(mouvementHorsTour(tb, { utilisateur: joueur }), false, "réglage désactivé par défaut");
  F.etat.reglages.seulActifBouge = true;
  assert.equal(mouvementHorsTour(tb, { utilisateur: joueur }), true);
  assert.equal(mouvementHorsTour(ta, { utilisateur: joueur }), false);
  assert.equal(mouvementHorsTour(tb, { utilisateur: mj }), false);
  // Le moteur du MJ IA : vider() ne répond pas tant que le tour de table retient la parole.
  globalThis.DOMParser = class { parseFromString(h) { return { body: { textContent: String(h) } }; } };
  const { MoteurMJ } = await import("../scripts/moteur.js");
  let tours = 0;
  const faux = { enCours: false, attente: [{ texte: "x", source: "humain" }], tourParTour: { retientIA: () => true }, tour: async () => { tours++; } };
  await MoteurMJ.prototype.vider.call(faux);
  assert.deepEqual([tours, faux.attente.length], [0, 1], "les messages attendent");
});

test("ce que montrent le panneau du MJ, le bandeau du joueur et l'état pour le MJ IA", async () => {
  F.installer({ systeme: "dnd5e" });
  const sc = F.creerScene({ distance: 5, unites: "ft" });
  const tour = new TourParTour({ moteur: null, delai: async () => {}, pause: 0 });
  F.etat.tour = tour;
  const g = heros5e({ nom: "Grommash", pv: 40, ca: 16, init: 15, joueur: true, armes: [arme5e({ nom: "Hache", toucher: 6, degats: "1d12+4" })] });
  const gob = heros5e({ nom: "Gobelin", pv: 7, ca: 13, init: 10, armes: [arme5e({ nom: "Cimeterre", toucher: 4, degats: "1d6+2" })] });
  F.poserJeton(g, 0, 0, { disposition: 1 });
  F.poserJeton(gob, 4, 0);
  let ctx = tour.contextePanneau();
  assert.deepEqual([ctx.etape.cle, ctx.preparation.candidats.map(c => [c.nom, c.coche])], ["ajouter", [["Grommash", true], ["Gobelin", true]]]);
  await tour.ajouter(sc.tokens.map(t => t.id));
  await tour.initiative();
  await tour.commencer();
  ctx = tour.contextePanneau();
  assert.equal(ctx.etape.cle, "attenteJoueur");
  assert.match(ctx.etape.texte, /Tour\.Etapes\.attenteJoueur .*Grommash/);
  assert.deepEqual(ctx.combat.cibles.map(c => [c.nom, c.distanceTexte, c.defense, c.portee]), [["Gobelin", "6 m", "CA 13", "hors"]]);
  assert.equal(ctx.combat.proposition, null, "pas de proposition pour un joueur");
  assert.deepEqual(Object.entries(ctx.combat.gestes).filter(([, v]) => v), []);
  const bandeau = tour.contexteBandeau(game.users.get("u1"));
  assert.deepEqual([bandeau.aMoi, bandeau.round, bandeau.attaques.map(a => a.nom), bandeau.mouvement], [true, 1, ["Hache"], "9 m / 9 m"]);
  assert.match(tour.resumePourIA().join("\n"), /^Tour : Grommash ; étape suivante : /);
  const rapport = tour.rapport();
  assert.match(rapport, /Il lui reste : Action 1\/1, Action bonus 1\/1, Réaction 1\/1, mouvement 9 m sur 9 m/);
  assert.match(rapport, /Distances : Gobelin 6 m \(CA 13, PV 7\/7, hors de portée\)/);
  await tour.demandeFinDeTour("u1");
  ctx = tour.contextePanneau();
  assert.equal(ctx.etape.action, "proposition");
  assert.match(ctx.combat.proposition.texte, /Proposition\.ApprocheAttaque/);
  assert.deepEqual(tour.contexteBandeau(game.users.get("u1")), { combat: true, round: 1, aMoi: false, actif: "Gobelin", puisMoi: true });
});
