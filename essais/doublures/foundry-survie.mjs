// Doublure de Foundry pour Fénoir (système lakour-survie) : game (acteurs, utilisateurs, réglages, compendiums, i18n), le chat,
// et game.lakourSurvie conforme au §5 du contrat (docs/survie-contrat.md du dépôt lakour-fenoir) : mêmes noms, mêmes arguments,
// mêmes retours ; les fonctions qui écrivent refusent hors du MJ actif (LAKOUR_SURVIE.Erreurs.PasMJActif), monde() rend null
// tant que le coffre n'est pas ouvert. Le monde réel porte des MARQUEURS (« HORDE-SECRETE »…) : les essais vérifient qu'ils
// n'apparaissent jamais dans ce que voient les joueurs ou les compagnons IA. Aucun réseau, aucune IA.

export class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}

// Ce qui n'existe que dans le monde réel (secret) : aucun ne doit fuir.
export const MARQUEURS_SECRETS = ["HORDE-SECRETE", "CYCLONE-SECRET", "JOURNAL-SECRET", "faction-secrete", "MENACE-SECRETE", "crue-secrete",
  "RENCONTRE-SECRETE", "FAIT-SECRET", "ERUPTION-SECRETE"];

export const CONTENU = {
  regions: [
    { cle: "saint-paul", nom: "Saint-Paul", zone: "littoral", altitude: 50, sites: ["college-hauts-saint-paul", "case-du-lagon"],
      voisins: [{ region: "le-port", route: "RN1", km: 12, terrain: "route", quartsPied: 2, quartsVehicule: 1 },
        { region: "hauts-ouest", route: "route du Maïdo", km: 20, terrain: "route", quartsPied: 3, quartsVehicule: 1 }] },
    { cle: "le-port", nom: "Le Port et La Possession", zone: "littoral", altitude: 10, sites: [],
      voisins: [{ region: "saint-paul" }, { region: "saint-denis" }] },
    { cle: "hauts-ouest", nom: "Hauts de l'Ouest", zone: "hauts", altitude: 1200, sites: [], voisins: [{ region: "saint-paul" }] },
    { cle: "saint-denis", nom: "Saint-Denis", zone: "littoral", altitude: 30, sites: [], voisins: [{ region: "le-port" }, { region: "salazie" }] },
    { cle: "salazie", nom: "Salazie", zone: "cirque", altitude: 900, sites: [], voisins: [{ region: "saint-denis" }] }
  ],
  sites: [
    { cle: "college-hauts-saint-paul", region: "saint-paul", nom: "Collège des Hauts de Saint-Paul", atouts: ["toit plat"], defauts: ["visible"] },
    { cle: "case-du-lagon", region: "saint-paul", nom: "Case créole du lagon" }
  ],
  installations: [{ cle: "citerne", nom: "Citerne de pluie" }, { cle: "potager", nom: "Potager" }],
  savoirs: [{ cle: "premiers-secours", nom: "Premiers secours avancés" }], factions: [], evenements: [],
  passes: [{ cle: "infirmiere", nom: "Infirmière" }],
  recettes: [{ cle: "arc-et-fleches", nom: "Arc et flèches", competence: "bricolage" }, { cle: "filtre-portatif", nom: "Filtre portatif" }],
  afflictions: [{ cle: "leptospirose", nom: "Leptospirose" }, { cle: "fracture", nom: "Fracture" }],
  enfances: [{ cle: "gamin-du-port", nom: "Gamin du Port" }, { cle: "hauts-de-salazie", nom: "Enfant des Hauts de Salazie" }],
  traits: [{ cle: "main-verte", nom: "Main verte" }, { cle: "insomniaque", nom: "Insomniaque" }],
  // Comme contenu() du système : les véhicules et montures normalisés par son registre (type, terrains, charge, places, rapide,
  // allure, carburantParQuart, bruit), le transport d'origine gardé.
  equipements: [
    { cle: "trousse", nom: "Trousse de secours", categorie: "soin" },
    { cle: "machette", nom: "Machette", categorie: "arme" },
    { cle: "scooter", nom: "Scooter", categorie: "transport", type: "vehicule", terrains: ["route", "piste"], charge: 4, places: 2, rapide: true,
      allure: null, carburantParQuart: 0.25, bruit: 1, poids: 0,
      transport: { mode: "vehicule", places: 2, chargeMax: 4, carburantParQuart: 0.25, terrains: ["route", "piste"], bruit: 1 } },
    { cle: "quatre-quatre", nom: "4×4", categorie: "transport", type: "vehicule", terrains: ["route", "piste"], charge: 30, places: 5, rapide: true,
      allure: null, carburantParQuart: 2, bruit: 1, poids: 0 },
    { cle: "voiture", nom: "Voiture", categorie: "transport", type: "vehicule", terrains: ["route"], charge: 15, places: 5, rapide: true,
      allure: null, carburantParQuart: 1, bruit: 2, poids: 0 },
    { cle: "ane", nom: "Âne de bât", categorie: "transport", type: "monture", terrains: ["route", "piste", "sentier"], charge: 8, places: 0,
      rapide: false, allure: 0.8, carburantParQuart: 0, bruit: 1, poids: 0 },
    { cle: "kayak", nom: "Kayak de mer", categorie: "transport", type: "vehicule", terrains: ["mer"], charge: 4, places: 2, rapide: false,
      allure: 0.7, carburantParQuart: 0, bruit: 0, poids: 0 }
  ]
};
// Le carburant d'un trajet de la doublure (deux quarts de route), comme la logique du système : véhicule du contenu
// ceil(quarts × carburantParQuart) ; générique : 1 en véhicule ou en bateau, 0 à pied.
const QUARTS_ROUTE = 2;
const vehiculeDe = cle => CONTENU.equipements.find(e => e.cle === cle && Array.isArray(e.terrains)) ?? null;
const carburantDe = transport => {
  const v = vehiculeDe(transport);
  return v ? Math.ceil(QUARTS_ROUTE * v.carburantParQuart) : transport === "pied" ? 0 : 1;
};

const REQUIS = { facile: 1, normale: 1, difficile: 2, extreme: 3 };

export function etatDeDepart() {
  return {
    partie: "p1", demarree: true, horloge: { quart: 13 }, phase: "panique",
    groupe: { abri: "abri1", membres: ["s1", "s2"], pnj: [{ id: "p1", nom: "Tantine Josette", passe: "retraitee", etat: "inquiète", travail: true }],
      plans: ["citerne"], region: "saint-paul", enRoute: null },
    renseignements: {
      "saint-paul": { vu: 3, source: "vu", infestation: "presente", pillage: "entame", electricite: true, eau: true, routes: { "le-port": "difficile" }, factions: [], notes: "" },
      "le-port": { vu: 1, source: "radio", infestation: "dense", pillage: "inconnu", electricite: null, eau: null, routes: {}, factions: [], notes: "On parle de pillages." }
    },
    joursAutonomes: 0, autonome: false,
    alertes: [{ quart: 12, type: "cyclone", texte: "Pré-alerte cyclonique entendue à la radio." }],
    journal: [{ quart: 12, texte: "Le groupe s'installe au collège." }]
  };
}

export function mondeDeDepart() {
  return {
    graine: "essai", jour: 3,
    coupures: { "saint-paul": { electricite: 9, eau: 12, carburant: null, telephone: 2 } },
    regions: {
      "saint-paul": { infestation: 2.4, pillage: { nourriture: 50, eau: 30 }, nature: {}, factions: { "faction-secrete": 2 }, routes: { "le-port": "coupee" },
        evenements: [{ cle: "crue-secrete", depuis: 2, jusqua: 5 }], abrisAbandonnes: [] },
      "le-port": { infestation: 4.2, pillage: { munitions: 4 }, nature: {}, factions: {}, routes: {}, evenements: [], abrisAbandonnes: [] },
      "hauts-ouest": { infestation: 0.5, pillage: { graines: 8 }, nature: {}, factions: {}, routes: {}, evenements: [], abrisAbandonnes: [] }
    },
    hordes: [{ id: "HORDE-SECRETE", region: "le-port", taille: 3, cap: "saint-paul", depuis: 2 },
      { id: "HORDE-LOINTAINE", region: "salazie", taille: 5, cap: null, depuis: 1 }],
    cyclone: { nom: "CYCLONE-SECRET", alerte: "orange", arrivee: 4, force: 2, trajectoire: ["saint-denis", "saint-paul"] },
    eruption: null,
    menaces: [{ type: "bande", texte: "MENACE-SECRETE : une bande rôde près du collège." }],
    journalSecret: [{ jour: 3, texte: "JOURNAL-SECRET : les quais du Port tombent." }, { jour: 0, texte: "JOURNAL-SECRET-ANCIEN" }]
  };
}

// Un acteur de la doublure (survivant ou abri), avec ses objets.
export function acteur(d) {
  const a = { ...structuredClone(d), items: [...(d.items ?? [])].map(i => ({ ...i })), flags: structuredClone(d.flags ?? {}), getFlag(s, k) { return a.flags?.[s]?.[k]; } };
  a.update = async changements => {
    for (const [k, v] of Object.entries(changements)) {
      const parties = k.split(".");
      const dernier = parties.pop();
      let o = a;
      for (const p of parties) o = o[p] ??= {};
      o[dernier] = structuredClone(v);
    }
    return a;
  };
  a.createEmbeddedDocuments = async (_t, objets) => { a.items.push(...objets.map(o => ({ ...o }))); return objets; };
  a.testUserPermission = () => Boolean(a.hasPlayerOwner);
  return a;
}

export function acteursDeDepart() {
  return [
    acteur({ id: "s1", name: "Lucie Hoarau", type: "survivant", hasPlayerOwner: true,
      system: { competences: { soins: { niveau: 3, marques: 1 }, survie: { niveau: 1, marques: 0 }, tir: { niveau: 0, marques: 0 } },
        blessures: 1, fatigue: 2, moral: 4, faim: 0, soif: 0, infection: { atteint: true, stade: 2, depuis: 10 }, passe: "infirmiere",
        age: 34, lien: "voisine d'Eddy", vivant: true, livide: false, charge: 3, notes: "" },
      items: [{ type: "savoir", name: "Premiers secours avancés" }, { type: "equipement", name: "Trousse de secours" }] }),
    acteur({ id: "s2", name: "Eddy Payet", type: "survivant", hasPlayerOwner: false,
      flags: { "lakour-mj-ia": { compagnon: { temperament: "prudent", parler: "bref", histoire: "Mécanicien du Port." } } },
      system: { competences: { bricolage: { niveau: 2, marques: 0 }, conduite: { niveau: 2, marques: 0 } }, blessures: 0, fatigue: 0, moral: 3,
        faim: 0, soif: 0, infection: { atteint: false, stade: 0, depuis: 0 }, passe: "mecanicien", vivant: true, livide: false } }),
    acteur({ id: "abri1", name: "Collège des Hauts", type: "abri",
      system: { site: "college-hauts-saint-paul", region: "saint-paul", stocks: { eau: 12, nourriture: 9, carburant: 2, medicaments: 1, munitions: 0,
        materiaux: 4, pieces: 0, graines: 0, energie: 0 }, bruit: 2, degats: 0 },
      items: [{ id: "i1", type: "installation", name: "Palissade", system: { cle: "palissade", niveau: 1, etat: 2 } }] }),
    acteur({ id: "abri0", name: "Vieille case de Bellemène", type: "abri", system: { site: "case-du-lagon", region: "saint-paul", stocks: {} } })
  ];
}

// game.lakourSurvie, conforme au §5 du contrat.
export function apiDoublure(cadre) {
  const appels = [];
  const ecrit = nom => {
    appels.push([nom, ...cadre.derniersArgs]);
    if (!cadre.mjActif) throw new Error("LAKOUR_SURVIE.Erreurs.PasMJActif");
  };
  const enregistrer = (nom, fn) => async (...args) => { cadre.derniersArgs = structuredClone(args); ecrit(nom); return fn(...args); };
  const quand = () => {
    const q = cadre.etat.horloge.quart;
    const jour = Math.floor(q / 4);
    return { quart: q, jour, moment: ["matin", "apres-midi", "soir", "nuit"][q % 4], date: `2026-12-${String(4 + jour).padStart(2, "0")}`,
      dateTexte: `${4 + jour} décembre 2026`, saison: "saison des pluies", phase: cadre.etat.phase };
  };
  const bilan = () => ({ production: { eau: 1 }, consommation: { eau: 3, nourriture: 3 }, net: { eau: -2, nourriture: -3, energie: 0 },
    autonomie: false, defense: 2, discretion: 1, visibilite: 4, capacite: 6, joursDeStocks: { eau: 4, nourriture: 3 }, alertes: [] });
  return {
    appels,
    contenu: () => structuredClone(CONTENU),
    etat: () => structuredClone(cadre.etat),
    monde: () => (cadre.mjActif && cadre.mondeOuvert ? structuredClone(cadre.monde) : null),
    quand,
    bilan,
    demarrer: enregistrer("demarrer", async ({ region, membres }) => { Object.assign(cadre.etat, { demarree: true }); cadre.etat.groupe.region = region; cadre.etat.groupe.membres = membres; }),
    avancer: enregistrer("avancer", async ({ quarts }) => {
      cadre.etat.horloge.quart += quarts;
      cadre.monde.journalSecret.push({ jour: quand().jour, texte: "JOURNAL-SECRET-NOUVEAU : une bande s'installe au Port." });
      return { quand: quand(), faits: [{ jour: quand().jour, region: "le-port", cle: "fumee", public: true, texte: "Une fumée noire monte du Port." }],
        alertes: [{ quart: cadre.etat.horloge.quart, type: "cyclone", texte: "Alerte orange cyclonique." }], bilan: bilan(), departs: quarts >= 4 ? ["s2"] : [] };
    }),
    test: enregistrer("test", async ({ difficulte, forcer, compte }) => {
      const succes = 2, requis = REQUIS[difficulte] ?? 1;
      return { des: [5, 2, 6], desForces: forcer ? [3] : [], succes, requis, reussite: succes >= requis, marge: succes - requis, force: Boolean(forcer),
        complication: false, marque: Boolean(compte) && succes < requis, texte: "dés au chat" };
    }),
    forcer: enregistrer("forcer", async () => ({})),
    explorer: enregistrer("explorer", async ({ region }) => {
      const r = { vu: quand().jour, source: "vu", infestation: "dense", pillage: "maigre", electricite: false, eau: true, routes: {}, factions: [], notes: "" };
      cadre.etat.renseignements[region] = r;
      return { renseignement: r, rencontre: { type: "livides", nombre: 4, texte: "RENCONTRE-SECRETE : quatre Livides dans un parking." },
        faits: [{ public: true, region, texte: "Des sirènes au loin." }, { public: false, region, texte: "FAIT-SECRET : une bande les observe." }] };
    }),
    fouiller: enregistrer("fouiller", async () => ({ butin: { nourriture: 3, medicaments: 1, eau: 0 }, rencontre: null, bruit: 1, faits: [] })),
    installer: enregistrer("installer", async () => ({})),
    construire: enregistrer("construire", async () => ({ chantier: { fait: 2, requis: 6 }, termine: false, niveau: 0 })),
    reparer: enregistrer("reparer", async ({ installationId = "" }) => (installationId ? { etat: 0 } : { degats: 1, repares: 1 })),
    // Un voyage en deux étapes : une rencontre par étape (rencontres), la première aussi en rencontre ; des provisions qui ont manqué.
    // Le retour de l'API réelle (voyagerInterne) : carburant rendu, pas le bruit.
    voyager: enregistrer("voyager", async ({ vers, transport = "pied" }) => {
      cadre.etat.groupe.region = vers;
      const rencontres = [{ type: "livides", nombre: 2, texte: "RENCONTRE-SECRETE-1 : deux Livides sur la quatre-voies." }, { type: "animaux", texte: "RENCONTRE-SECRETE-2 : des chiens." }];
      return { possible: true, arrivee: true, quarts: QUARTS_ROUTE, chemin: ["saint-paul", vers], carburant: carburantDe(transport), rencontre: rencontres[0], rencontres,
        faits: [], manque: { eau: 1, nourriture: 0, carburant: 0 } };
    }),
    // Le retour de l'API réelle : ni carburant ni bruit (le voyage interne les garde) ; la charge d'un véhicule borne ce qu'on emporte.
    demenager: enregistrer("demenager", async ({ emporter = {}, transport = "pied" }) => {
      const v = vehiculeDe(transport);
      let place = v ? v.charge : 3 * cadre.etat.groupe.membres.length;
      const emporte = {};
      for (const [r, q] of Object.entries(emporter)) { const n = Math.min(q, place); if (n > 0) { emporte[r] = n; place -= n; } }
      return { arrivee: true, emporte, laisse: {}, quarts: QUARTS_ROUTE, rencontre: null, rencontres: [], abriId: "abri1", faits: [] };
    }),
    ajuster: enregistrer("ajuster", async () => ({})),
    blesser: enregistrer("blesser", async () => ({})),
    // Le soigneur est celui donné, sinon le meilleur en soins (s1) : le test est le sien.
    soigner: enregistrer("soigner", async ({ soigneurId = "" }) => ({ test: { acteurId: soigneurId || "s1", succes: 2, requis: 1, reussite: true, marge: 1 }, soignees: 1, blessures: 0, medicament: true })),
    infecter: enregistrer("infecter", async () => ({})),
    marquer: enregistrer("marquer", async () => ({ niveau: 3, marques: 2, monte: false })),
    assaut: enregistrer("assaut", async () => ({ marge: -1, issue: "installation endommagée", degats: ["Palissade"], blesses: ["s1"] })),
    rencontre: enregistrer("rencontre", async () => ({ type: "humains", faction: "faction-secrete", texte: "RENCONTRE-SECRETE : trois hommes armés." })),
    fabriquer: enregistrer("fabriquer", async ({ acteurId }) => ({ termine: true, produit: { equipement: "arc-et-fleches", n: 1 },
      test: { competence: "bricolage", succes: 1, requis: 1, reussite: true, marge: 0 }, acteurId })),
    affliction: enregistrer("affliction", async ({ action }) => (action === "soigner" ? { gueri: true } : {})),
    // Fête vide : celle du jour DE JEU (ici Noël, 2026-12-xx) ; LAKOUR_SURVIE.Erreurs.AucuneFete si le cadre n'en a pas.
    feter: enregistrer("feter", async ({ fete = "" }) => {
      const cle = fete || cadre.feteDuJour;
      if (!cle) throw new Error("LAKOUR_SURVIE.Erreurs.AucuneFete");
      return { ok: true, fete: cle, texte: "Moral +1 pour chacun." };
    }),
    // §10 (supposées) : générateur, besoins, recrues, tâches, membres. generer : le premier tirage hors budget, puis dans le budget.
    generer: async options => {
      cadre.generes.push(structuredClone(options));
      const n = cadre.generes.length;
      const fort = n === 1 ? 5 : 3;
      return { nom: options.verrous?.nom ?? `Tiré ${n}`, age: options.verrous?.age ?? 20 + n, enfance: options.verrous?.enfance ?? "gamin-du-port",
        passe: options.verrous?.passe ?? "infirmiere", competences: { soins: fort, survie: 3, parole: 2, endurance: 2, tir: n === 1 ? 5 : 1 },
        passions: { soins: 2, survie: 1 }, traits: options.verrous?.traits ?? ["main-verte"], incapacites: ["violence"],
        equipement: ["trousse"], savoirs: ["premiers-secours"], graine: "Elle a perdu sa sœur sur la route du Littoral." };
    },
    besoins: () => [
      { tache: "soins", competence: "soins", meilleur: 3, couverture: "couvert" },
      { tache: "garde", competence: "vigilance", meilleur: 0, couverture: "manquant", urgence: "pas de garde la nuit", profil: "ancien gendarme, vigile" },
      { tache: "chantier", competence: "bricolage", meilleur: 2, couverture: "faible" }
    ],
    genererRecrue: enregistrer("genererRecrue", async ({ region }) => ({ nom: "Gilles Técher", age: 52, enfance: "hauts-de-salazie", passe: "gendarme",
      competences: { vigilance: 3, tir: 2, parole: 1 }, traits: ["insomniaque"], region,
      raison: "Il garde seul la caserne vide.", prix: "Il veut qu'on aille chercher sa fille à Saint-Denis." })),
    recruter: enregistrer("recruter", async ({ recrue }) => ({ test: { succes: 1, requis: 1, reussite: true, marge: 0 }, reussite: true,
      acteurId: (await globalThis.Actor.implementation.create({ name: recrue.nom, type: "survivant", system: { statut: "recrue" } })).id })),
    assigner: enregistrer("assigner", async ({ acteurId, tache }) => { const a = globalThis.game.actors.get(acteurId); if (a) a.system.tache = tache; }),
    // creerSurvivant({ donnees, userId, rejoindre, statut }) comme l'API (creerSurvivantDirect, MJ actif) -> { acteurId, nom, membre } :
    // jeton du passé, genre, graine (flags.lakour-survie.graine ; graineHistoire du moteur seulement s'il est actif), objets du contenu par
    // clé, propriété et personnage du joueur (s'il n'en a pas), entrée au groupe si rejoindre et partie démarrée.
    creerSurvivant: enregistrer("creerSurvivant", async ({ donnees: d, userId = "", rejoindre = true, statut = null }) => {
      const g = globalThis.game;
      const user = userId ? g.users.get(userId) : null;
      const st = statut ?? (user && !user.isGM ? "joueur" : d.statut ?? "joueur");
      const jeton = CONTENU.passes.some(p => p.cle === d.passe) ? `modules/lakour-fenoir/assets/jetons/joueurs/${d.passe}.svg` : "icons/svg/mystery-man.svg";
      const moteur = g.modules.get("lakour-mj-ia");
      const competences = Object.fromEntries(Object.entries(d.competences ?? {}).map(([k, v]) => [k, { niveau: Number(v?.niveau ?? v) || 0, marques: 0 }]));
      const a = await globalThis.Actor.implementation.create({
        name: d.nom, type: "survivant", img: jeton,
        system: { competences, passions: d.passions ?? {}, enfance: d.enfance ?? "", passe: d.passe ?? "", genre: ["f", "m"].includes(d.genre) ? d.genre : "",
          traits: [...(d.traits ?? [])], incapacites: [...(d.incapacites ?? [])], statut: st, tache: "repos", age: d.age ?? 30, lien: d.lien ?? "",
          vivant: true, livide: false, notes: d.notes ?? "" },
        ownership: user && !user.isGM ? { default: 0, [user.id]: 3 } : { default: 0 },
        prototypeToken: { name: d.nom, actorLink: true, disposition: 1, sight: { enabled: true }, texture: { src: jeton } },
        flags: { "lakour-survie": { graine: d.graine ?? "" }, ...(moteur?.active && d.graine ? { "lakour-mj-ia": { graineHistoire: d.graine } } : {}) }
      });
      const objets = [...(d.savoirs ?? []).map(c => ["savoir", CONTENU.savoirs.find(x => x.cle === c)]), ...(d.equipement ?? []).map(c => ["equipement", CONTENU.equipements.find(x => x.cle === c)])]
        .filter(([, def]) => def).map(([type, def]) => ({ type, name: def.nom, system: { cle: def.cle } }));
      if (objets.length) await a.createEmbeddedDocuments("Item", objets);
      if (user && !user.isGM && !user.character) await user.update({ character: a.id });
      const membre = Boolean(rejoindre && cadre.etat.demarree);
      if (membre) cadre.etat.groupe.membres.push(a.id);
      return { acteurId: a.id, nom: a.name, membre };
    }),
    ajouterMembre: enregistrer("ajouterMembre", async ({ acteurId }) => { cadre.etat.groupe.membres.push(acteurId); }),
    renseigner: enregistrer("renseigner", async args => { cadre.etat.renseignements[args.region] = { ...cadre.etat.renseignements[args.region], ...args }; })
  };
}

// Installe le monde Fénoir de la doublure dans globalThis. -> { cadre, api, chat, acteurs }
export function installerFenoir({ mjActif = true, mondeOuvert = true, systeme = "lakour-survie", avecApi = true } = {}) {
  const cadre = { mjActif, mondeOuvert, etat: etatDeDepart(), monde: mondeDeDepart(), derniersArgs: [], generes: [], feteDuJour: "noel" };
  const chat = [];
  const acteurs = new Collection(acteursDeDepart().map(a => [a.id, a]));
  const mj = { id: "mj", name: "Hogun", isGM: true, active: true, update: async () => {} };
  const joueur = { id: "u1", name: "Jordan", isGM: false, active: true, character: acteurs.get("s1"), update: async d => Object.assign(joueur, d) };
  const users = new Collection([["mj", mj], ["u1", joueur]]);
  const reglages = { mouvementsBloques: {}, compagnonsPrive: {}, personnalites: [{ id: "p", nomAffiche: "Le Conteur" }], personnaliteActive: "p" };
  const packs = new Collection([["lakour-fenoir.passes", { getDocuments: async () => [
    { type: "passe", name: "Infirmière", system: { cle: "infirmiere", competences: { soins: 3, parole: 1 }, savoirs: ["premiers-secours"], equipement: ["trousse"] } }] }],
  ["lakour-fenoir.savoirs", { getDocuments: async () => [{ type: "savoir", name: "Premiers secours avancés", system: { cle: "premiers-secours" } }] }],
  ["lakour-fenoir.equipements", { getDocuments: async () => [{ type: "equipement", name: "Trousse de secours", system: { cle: "trousse" } },
    { type: "equipement", name: "Machette", system: { cle: "machette" } }] }]]);
  globalThis.foundry = {
    applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } },
    utils: { deepClone: o => structuredClone(o), escapeHTML: s => String(s).replace(/</g, "&lt;"), randomID: () => "x",
      setProperty: (o, k, v) => { const p = k.split("."); const d = p.pop(); let x = o; for (const q of p) x = x[q] ??= {}; x[d] = v; },
      getProperty: (o, k) => k.split(".").reduce((x, p) => x?.[p], o), expandObject: o => o }
  };
  globalThis.DOMParser = class {
    parseFromString(html) {
      const texte = String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return { querySelectorAll: () => [], body: { textContent: texte } };
    }
  };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 }, TOKEN_DISPOSITIONS: { FRIENDLY: 1, HOSTILE: -1 } };
  globalThis.Hooks = { on() {}, callAll() {}, once() {} };
  globalThis.canvas = { scene: null };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.ChatMessage = { implementation: { create: async d => { chat.push(d); return d; } } };
  let n = 0;
  globalThis.Actor = { implementation: { create: async d => { const a = acteur({ id: `n${++n}`, ...d }); acteurs.set(a.id, a); return a; } } };
  const api = avecApi ? apiDoublure(cadre) : undefined;
  globalThis.game = {
    system: { id: systeme, title: "Fénoir", version: "0.1.0" }, world: { id: "fenoir", title: "Fénoir" },
    user: mj, users, actors: acteurs, packs, items: { fromCompendium: d => ({ ...d }) },
    messages: { contents: chat }, scenes: { active: null }, combats: { active: null },
    settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); }, settings: new Map() },
    i18n: { localize: k => (k === "LAKOUR_SURVIE.Erreurs.PasMJActif" ? "Seul le MJ actif peut faire cela." : k), format: k => k, has: () => false },
    modules: new Map([["lakour-mj-ia", { api: {} }]]),
    ...(avecApi ? { lakourSurvie: api } : {})
  };
  return { cadre, api, chat, acteurs, reglages };
}
