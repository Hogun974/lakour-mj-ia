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
  "RENCONTRE-SECRETE", "FAIT-SECRET", "ERUPTION-SECRETE",
  // Le marché (§12, monde « nouveautes ») : la vérité d'une rumeur, un préjugé de PNJ. La vraie couleur et le cyclone vécu sont des mots
  // ordinaires : les essais les vérifient à part.
  "AUTEUR-SECRET", "PREJUGE-SECRET",
  // Les lots du jeu 3D (monde « troisD ») : la vérité d'une affaire, l'odeur, le vrai mal, un lieu à plans, une bête cachée dans un lieu, le
  // vrai jour. La chaleur, l'issue d'une morsure, l'infection et l'écart du compte sont des chiffres : les essais les vérifient à part.
  "VERITE-SECRETE", "ODEUR-SECRETE", "MAL-SECRET", "LIEU-PLANS-SECRET", "BETE-SECRETE", "VRAI-JOUR-SECRET"];

export const CONTENU = {
  regions: [
    { cle: "saint-paul", nom: "Saint-Paul", zone: "littoral", altitude: 50, sites: ["college-hauts-saint-paul", "case-du-lagon"],
      voisins: [{ region: "le-port", route: "RN1", km: 12, terrain: "route", quartsPied: 2, quartsVehicule: 1 },
        { region: "hauts-ouest", route: "route du Maïdo", km: 20, terrain: "route", quartsPied: 3, quartsVehicule: 1 }] },
    { cle: "le-port", nom: "Le Port et La Possession", zone: "littoral", altitude: 10, sites: [], arrivee: "Les grues sont immobiles, les quais se taisent.",
      voisins: [{ region: "saint-paul" }, { region: "saint-denis" }] },
    { cle: "hauts-ouest", nom: "Hauts de l'Ouest", zone: "hauts", altitude: 1200, sites: [], voisins: [{ region: "saint-paul" }] },
    { cle: "saint-denis", nom: "Saint-Denis", zone: "littoral", altitude: 30, sites: [], voisins: [{ region: "le-port" }, { region: "salazie" }] },
    { cle: "salazie", nom: "Salazie", zone: "cirque", altitude: 900, sites: [], voisins: [{ region: "saint-denis" }] }
  ],
  sites: [
    { cle: "college-hauts-saint-paul", region: "saint-paul", nom: "Collège des Hauts de Saint-Paul", atouts: ["toit plat"], defauts: ["visible"] },
    { cle: "case-du-lagon", region: "saint-paul", nom: "Case créole du lagon" }
  ],
  installations: [{ cle: "citerne", nom: "Citerne de pluie" }, { cle: "potager", nom: "Potager" },
    // Lots du jeu 3D : un atelier de métier (§24), un cheptel (§27), la palissade de l'abri (§26).
    { cle: "etabli", nom: "Établi", metiers: ["etabli"] }, { cle: "basse-cour", nom: "Basse-cour" }, { cle: "palissade", nom: "Palissade" }],
  corvees: [{ cle: "eau-du-matin", nom: "L'eau du matin", tache: "eau" }], chantiersRegion: [{ cle: "centrale-langevin", nom: "La centrale de Langevin" }],
  objetsFouille: [{ cle: "boite-de-clous", nom: "Une boîte de clous" }],
  savoirs: [{ cle: "premiers-secours", nom: "Premiers secours avancés", arbre: "moderne" }, { cle: "tisanes", nom: "Tisanes lontan", arbre: "lontan" }],
  factions: [{ cle: "recuperateurs", nom: "Les Récupérateurs" }, { cle: "planteurs", nom: "Les Planteurs des Hauts" }], evenements: [],
  // Le marché (§12), l'esprit (§14), les gramounes (§13) : comme le registre du système.
  communautes: [{ cle: "zoreils", nom: "Zoreils" }, { cle: "malbars", nom: "Malbars" }, { cle: "gens-d-en-bas", nom: "Gens d'en bas" }],
  marchands: [{ cle: "madame-chane", nom: "Madame Chane" }], marches: [{ cle: "marche-saint-paul", nom: "Marché forain de Saint-Paul" }],
  foires: [{ cle: "foire-letchis", nom: "Foire aux letchis" }],
  religions: [{ cle: "catholique", nom: "Catholique" }, { cle: "islam", nom: "Islam" }, { cle: "hindouisme-tamoul", nom: "Hindouisme tamoul" },
    { cle: "aucune", nom: "Aucune", special: "aucune" }, { cle: "plusieurs", nom: "Plusieurs", special: "plusieurs" }],
  ancrages: [{ cle: "photo", nom: "La photo des siens" }], gramounes: [{ cle: "gramoune-ida", nom: "Gramoune Ida" }],
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
    // Lots du jeu 3D (monde « troisD ») : le jour que le groupe croit (à peu près, deux jours de retard), le temps du quart.
    const troisD = cadre.troisD ? { compte: { certitude: "a-peu-pres", marge: 2, jourCru: jour - 2, teneur: "s1" }, jourDuGroupe: jour - 2,
      dateDuGroupe: `vers le ${2 + jour} décembre 2026`, heureLue: { exacte: false, marge: 2, cle: "soleil" }, heureDuGroupe: "",
      pluie: true, brume: false, vent: { cap: 300, vers: "nord-ouest", de: "sud-est", force: 0.4, mot: "brise" }, voix: "ressac" } : {};
    return { quart: q, jour, moment: ["matin", "apres-midi", "soir", "nuit"][q % 4], date: `2026-12-${String(4 + jour).padStart(2, "0")}`,
      dateTexte: cadre.troisD ? `VRAI-JOUR-SECRET ${4 + jour} décembre 2026` : `${4 + jour} décembre 2026`, saison: "saison des pluies", phase: cadre.etat.phase, ...troisD };
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
    feter: enregistrer("feter", async ({ fete = "", option = "", pour = [] }) => {
      const cle = fete || cadre.feteDuJour;
      if (!cle) throw new Error("LAKOUR_SURVIE.Erreurs.AucuneFete");
      return { ok: true, fete: cle, option, texte: "Moral +1 pour chacun.", attaches: cle === "noel" ? pour : [], voeux: cle === "cavadee" ? pour : [],
        reposes: cle === "halloween" ? ["Gilberte"] : [], restent: cle === "halloween" ? ["Ti Paul"] : [], refugies: cle === "aid-el-kebir" };
    }),
    // Lot « fetes » (supposées, conformes à l'API du système) : la fête des autres, les vœux, la relève, l'autel.
    participer: enregistrer("participer", async ({ fete = "", communaute = "", faction = "", membres = [] }) => ({ ok: true, fete: fete || cadre.feteDuJour,
      communaute: communaute || "malbars", faction, qui: membres, liens: { communautes: { [communaute || "malbars"]: 1 }, factions: faction ? { [faction]: 1 } : {}, renom: 0 } })),
    voeu: enregistrer("voeu", async ({ acteurId, issue }) => ({ ok: true, acteurId, tenu: issue !== "rompu" })),
    candidatsReleve: ({ mortId = "" } = {}) => [{ id: "s2", nom: "Eddy Payet", source: "membre", statut: "compagnon", age: 17, jeune: true, tache: "chantier" },
      { id: "pnj1", nom: "Tantine Josette", source: "pnj", statut: "pnj", age: null, jeune: false, tache: "", passe: "retraitee" }].filter(x => x.id !== mortId),
    releve: enregistrer("releve", async ({ candidat = "", action = "reprendre", userId = "" }) => (action === "tirage" ? { ok: true, action, joueur: userId || "u1" }
      : { ok: true, action, acteurId: candidat === "Tantine Josette" ? "s1" : candidat, source: candidat === "Tantine Josette" ? "pnj" : "membre", tacheLaissee: "chantier", jeune: true, joueur: userId || "u1" })),
    morts: () => [{ id: "m1", nom: "Gilberte", retrouve: true, repos: false }, { id: "m2", nom: "Ti Paul", retrouve: false, repos: false }],
    autel: enregistrer("autel", async ({ action }) => (action === "repos" ? { ok: true, mort: "Gilberte", deuil: true } : { ok: true })),
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
    // Une gramoune du registre (§13, recrueGramoune) : ses savoirs lontan, sa confiance, son esprit et ses préjugés (§15).
    genererRecrue: enregistrer("genererRecrue", async ({ region, gramoune = "" }) => (gramoune ? { nom: "Gramoune Ida", age: 78, enfance: "hauts-de-salazie", passe: "",
      competences: { survie: 3, soins: 2 }, traits: [], savoirs: ["tisanes"], confiance: 1, region, gramoune, statut: "recrue", regard: "epreuve", religion: "catholique",
      pratique: true, sensMoral: 4, autorite: 3, raison: "Elle garde la case de son défunt mari.", prix: "Elle ne quittera pas Salazie sans son coq.",
      prejuges: [{ cible: "gens-d-en-bas", poids: 1, dit: "PREJUGE-SECRET : ceux d'en bas ne savent rien planter." }] } : { nom: "Gilles Técher", age: 52, enfance: "hauts-de-salazie", passe: "gendarme",
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
    renseigner: enregistrer("renseigner", async args => { cadre.etat.renseignements[args.region] = { ...cadre.etat.renseignements[args.region], ...args }; }),

    // ---------------- le marché (§12, scripts/api-marche.mjs) : mêmes noms, mêmes arguments, retours de même forme.
    marche: () => structuredClone(cadre.etat.marche ?? { boutiques: [], marches: [], rumeurs: [], signe: "", prochain: 1 }),
    coursDuJour: () => ({ ...COURS }),
    stadesDuMarche: ({ region = "" } = {}) => [{ stade: "troc", ouvert: true, texte: "De la main à la main, dès le premier jour.", region },
      { stade: "boutique", ouvert: true, texte: "Un commerçant tient boutique, avec son carnet." },
      { stade: "forain", ouvert: false, texte: "Il faut deux communautés dans la région et une route ouverte entre elles (1 pour l'instant)." },
      { stade: "foire", ouvert: false, texte: "Pas de récolte à fêter en ce moment." }],
    evenementDeMarche: ({ stade = "forain" } = {}) => ({ cle: "vieux-qui-rend", nom: "Le vieux qui rend la monnaie", texte: `Au ${stade}, un vieux rend ce qu'on lui a trop donné.`,
      effets: { dementi: "zoreils" } }),
    evaluerTroc: args => evaluation(args),
    troquer: enregistrer("troquer", async args => {
      const e = evaluation(args);
      if (!e.accepte && !args.accepter) return { ok: false, ...e, raison: `Il demande ${e.demandee} parts, on lui en donne ${e.valeurDonnee}.` };
      return { ok: true, ...e, stocks: {}, usure: { uses: args.cibles ?? [], tombes: [] }, sens: args.prejuge ? sensDe(args.prejuge, "colporter") : null };
    }),
    ouvrirBoutique: enregistrer("ouvrirBoutique", async ({ nom }) => ({ boutique: { cle: "boutique-neuve", nom } })),
    crediter: enregistrer("crediter", async ({ biens = {}, cibles = [] }) => (cibles.length >= 2
      ? { ok: false, raison: "pas de crédit pour le groupe", confiance: confiance({ cibles }) }
      : { ok: true, entree: { id: "d2", valeur: valeur(biens) }, dette: 4 + valeur(biens), plafond: 10, confiance: confiance({ cibles }) })),
    rendre: enregistrer("rendre", async ({ biens = {} }) => ({ ok: true, paye: valeur(biens), reste: Math.max(0, 4 - valeur(biens)), surplus: 0 })),
    effacerDette: enregistrer("effacerDette", async () => ({ efface: 4 })),
    solderCarnet: enregistrer("solderCarnet", async ({ remises = [] }) => ({ deja: false, soldes: [], impayees: remises.length ? [] : [{ debiteur: "groupe", reste: 4 }],
      remises: remises.map(d => ({ debiteur: d, reste: 4 })) })),
    ouvrirMarche: enregistrer("ouvrirMarche", async ({ modele = "", foire = "", nom = "", jourSemaine = 6, bastions = [] }) => ({
      marche: { cle: modele || foire || "marche-neuf", nom: nom || (foire ? "Foire aux letchis" : "Marché forain de Saint-Paul"), region: "saint-paul", jourSemaine,
        bastions, hote: "", treve: { rompue: false }, ouvertLe: 3, foire: Boolean(foire), jusqua: foire ? 5 : null } })),
    fermerMarche: enregistrer("fermerMarche", async ({ marche }) => ({ ferme: marche })),
    accueillir: enregistrer("accueillir", async ({ marche, hote }) => ({ marche, hote, signature: hote ? 2 : 0 })),
    rompreTreve: enregistrer("rompreTreve", async ({ marche, par }) => ({ marche, reputation: par === "groupe" ? { planteurs: -3 } : {}, sens: sensDe(par, "attaquer") })),
    retablirTreve: enregistrer("retablirTreve", async ({ marche }) => ({ marche })),
    rumeur: enregistrer("rumeur", async ({ auteur = "", contre = true }) => ({ id: "r2", colporteur: contre ? auteur : "", sens: contre && auteur ? sensDe(auteur, "colporter") : null })),
    dementir: enregistrer("dementir", async ({ id }) => (id === "r1" ? { ok: true, menteur: "", sens: null } : { ok: false, raison: "une rumeur vraie ne se dément pas" })),
    dementirPrejuge: enregistrer("dementirPrejuge", async ({ cible, pnj = [] }) => ({ cible, pnj: pnj.length ? pnj.map(id => globalThis.game.actors.get(id)?.name ?? id) : ["Madame Chane"] })),
    prejuges: enregistrer("prejuges", async ({ acteurId, prejuges = [] }) => { const a = globalThis.game.actors.get(acteurId); if (a) a.system.prejuges = prejuges; return { prejuges }; }),
    creerMarchand: enregistrer("creerMarchand", async ({ cle }) => {
      const deja = globalThis.game.actors.find(a => a.flags?.["lakour-survie"]?.marchand === cle);
      if (deja) return { acteurId: deja.id, deja: true };
      const a = await globalThis.Actor.implementation.create({ name: "Madame Chane", type: "survivant", flags: { "lakour-survie": { marchand: cle } },
        system: { statut: "pnj", regard: "refaire", religion: "aucune", ancrage: "photo", sensMoral: 2, autorite: 2,
          prejuges: [{ cible: "zoreils", poids: 2, dit: "PREJUGE-SECRET : les zoreils paient mal." }] } });
      return { acteurId: a.id, deja: false };
    }),

    // ---------------- les deux savoirs et l'île en mouvement (§13).
    preparerCyclone: enregistrer("preparerCyclone", async ({ membres = [], quarts = 1 }) => ({ fait: membres.length * quarts, requis: 4, prete: membres.length * quarts >= 4 })),
    apprendre: enregistrer("apprendre", async ({ source }) => ({ fait: 2, requis: source === "livre" ? 14 : 7, termine: false, lumiere: "bougie" })),
    gagnerConfiance: enregistrer("gagnerConfiance", async () => ({ confiance: 2, delta: 1, reussite: true })),
    dicter: enregistrer("dicter", async () => ({ fait: 6, requis: 6, termine: true, enseigne: ["tisanes"] })),
    apprivoiser: enregistrer("apprivoiser", async () => ({ confiance: 2, delta: 1, apprivoise: false, morsure: false, reussite: true })),
    cyclone: () => (cadre.mjActif && cadre.mondeOuvert && cadre.cyclone ? structuredClone(cadre.cyclone) : null),
    savoirsDuGroupe: () => ({ complete: false, moderne: 1, lontan: 0, manque: { moderne: 1, lontan: 2 } }),

    // ---------------- l'esprit, le sens moral, la communauté (§14, §15).
    communaute: () => ({ chef: cadre.etat.groupe.chef ?? "", entente: cadre.etat.groupe.entente ?? 0, reputation: { moyenne: cadre.nouveautes ? 1.5 : 0, bande: "neutre" },
      couleur: { moyenne: cadre.nouveautes ? -2.5 : 0, bande: cadre.nouveautes ? "rougeatre" : "neutre" }, porte: structuredClone(cadre.etat.porte ?? []),
      tributs: structuredClone(cadre.etat.tributs ?? []), votes: structuredClone(cadre.etat.votes ?? []), communautes: structuredClone(cadre.etat.communautes ?? []),
      liste: cadre.nouveautes ? [{ ressource: "eau", manque: 4 }, { ressource: "medicaments", manque: 2 }] : [] }),
    acteMoral: enregistrer("acteMoral", async ({ acteurId = "", acteurs = [], acte = "", voteId = "" }) => ({ ...sensDe([acteurId, ...acteurs].filter(Boolean)[0], acte),
      epargnes: voteId ? ["s2"] : [], vote: voteId ? { delta: 0, suivi: true } : null })),
    ajusterEsprit: enregistrer("ajusterEsprit", async ({ acteurId, ...champs }) => { const a = globalThis.game.actors.get(acteurId); Object.assign(a.system, champs); return { acteurId, ...champs }; }),
    tirerEsprit: enregistrer("tirerEsprit", async ({ acteurId, forcer = false }) => {
      const a = globalThis.game.actors.get(acteurId);
      if (a.system.regard && !forcer) return { acteurId, deja: true };
      Object.assign(a.system, { regard: "vivre", religion: "islam", pratique: true, sensMoral: 1, autorite: 2 });
      return { acteurId, regard: "vivre" };
    }),
    entente: enregistrer("entente", async ({ delta = 0 }) => { cadre.etat.groupe.entente = Math.max(-3, Math.min(3, (cadre.etat.groupe.entente ?? 0) + delta)); return { entente: cadre.etat.groupe.entente }; }),
    chef: enregistrer("chef", async ({ acteurId = "" }) => { cadre.etat.groupe.chef = acteurId; return { chef: acteurId }; }),
    parole: enregistrer("parole", async ({ tenue = true }) => ({ autorite: tenue ? 4 : 2, delta: tenue ? 1 : -1 })),
    voter: enregistrer("voter", async ({ question = "", acte, voix = {} }) => {
      const v = { s1: voix.s1 ?? "abstention", s2: voix.s2 ?? "contre" };
      const compte = x => Object.values(v).filter(y => y === x).length;
      return { id: "vote2", quart: cadre.etat.horloge.quart, question, acte, voix: v, resultat: { pour: compte("pour"), contre: compte("contre"), abstention: compte("abstention") }, decide: null };
    }),
    decider: enregistrer("decider", async ({ voteId, decision }) => ({ vote: { id: voteId }, delta: decision === "pour" ? 0 : -1, suivi: decision === "pour" })),
    porte: enregistrer("porte", async ({ decision, voteId = "" }) => ({ decision, acte: { accueillir: "accueillir", refuser: "exclure", trahir: "trahir" }[decision],
      acteurId: decision === "accueillir" ? "n-recrue" : "", bouches: 2, pris: decision === "trahir" ? { nourriture: 2 } : {}, suite: decision === "refuser" ? "feu" : "",
      ...sensDe("s1", decision === "accueillir" ? "accueillir" : "exclure"), vote: voteId ? { delta: 0, suivi: false } : null })),
    frapper: enregistrer("frapper", async ({ profil = "" }) => {
      const v = { id: "v2", jour: 3, nom: "Teddy Fontaine", age: 44, genre: "m", profil: profil || "dur", bouches: 0, demande: { texte: "J'ai de quoi payer ma place." }, apporte: {}, revient: false };
      cadre.etat.porte = [...(cadre.etat.porte ?? []), v];
      cadre.monde.porte = { ...(cadre.monde.porte ?? {}), v2: { survivant: { sensMoral: -8 }, profil: v.profil, bouches: 0 } };
      return structuredClone(v);
    }),
    tribut: enregistrer("tribut", async ({ tributId, paye = true }) => ({ tribut: { ...(cadre.etat.tributs ?? []).find(t => t.id === tributId) }, issue: paye ? "paye" : "revolte" })),
    resoudreMenace: enregistrer("resoudreMenace", async ({ id, action = "assaut" }) => {
      if (action === "assaut") return { marge: 1, issue: "repoussee", degats: [], blesses: [] };
      if (action === "ultimatum") return { tribut: { id: "t2", bande: "Les Récupérateurs", faction: "recuperateurs", demande: { nourriture: 3, carburant: 1 }, tousLes: 7, prochain: 10, etat: "actif" } };
      if (action === "rejoindre") {
        const v = { id: "v3", jour: 3, nom: "Le Grand Raymond", age: 50, profil: "dur", bouches: 0, demande: { texte: "Ma bande et moi, on voudrait entrer." } };
        cadre.monde.porte = { ...(cadre.monde.porte ?? {}), v3: { survivant: { sensMoral: -5 } } };
        return { visiteur: v, menace: id };
      }
      return { ecartee: true };
    }),
    separer: enregistrer("separer", async ({ partants = [], nom = "" }) => ({ communaute: { id: "c1", nom: nom || "Les autres (1)", membres: partants }, restants: ["s1"] })),
    fusionner: enregistrer("fusionner", async ({ communauteId }) => ({ membres: ["s1", "s2"], plans: ["citerne"], entente: -1, communauteId })),
    lireSigne: enregistrer("lireSigne", async () => ({ lectures: [{ acteurId: "s1", nom: "Lucie Hoarau", lecture: "signe" }, { acteurId: "s2", nom: "Eddy Payet", lecture: "rien" }] })),
    ...apiTroisD(cadre, enregistrer)
  };
}

// ---------------- les douze lots du jeu 3D (§16 à §29, scripts/api-*.mjs du système, branche vague3) : mêmes noms, mêmes arguments,
// retours de même forme. Lectures partout ; écritures au MJ actif (enregistrer). Sans le monde « troisD », les lectures rendent du vide.
const AFFAIRE = { cle: "la-source-tarie", numero: 3, titre: "La source tarie", taille: "affaire", front: "fournaise",
  pente: { tousLes: 3, crans: ["On fait la queue à la fontaine.", "Une bagarre à la fontaine.", "La fontaine est gardée par des armes."] },
  apprendre: "Une femme à la radio parle de la source.", demande: "Aller voir la source.", malTourner: "La fontaine est prise.", ton: "sobre",
  issues: [{ cle: "partager", titre: "On partage l'eau", texte: "La source est partagée entre trois abris.", effets: { stocks: { eau: 4, plantes: 1 }, moral: 1, reputation: { planteurs: 3 }, front: -1, rumeur: true } },
    { cle: "prendre", titre: "On prend la source", texte: "Le groupe tient la source, seul.", effets: { acte: "trahir", horde: true } }] };
export const AFFAIRE_DOUBLURE = AFFAIRE;
CONTENU.affaires = [AFFAIRE];
function apiTroisD(cadre, enregistrer) {
  const d = () => cadre.troisD ?? null;
  const mj = () => cadre.mjActif && cadre.mondeOuvert;
  return {
    histoireDuSurvivant: ({ acteurId = "" } = {}) => (d() && acteurId === "s1" ? { phrases: ["Elle est née à Cilaos.", "Elle a soigné tout le quartier du Port."], cles: ["enfance:x/1", "passe:y/2"] } : { phrases: [], cles: [] }),
    // §17 : les affaires (lecture), la vérité au tirage.
    affaires: (options = {}) => ({ contexte: { region: cadre.etat.groupe.region, ...options }, affaires: (options.closes ?? []).includes(AFFAIRE.cle) ? []
      : [{ cle: AFFAIRE.cle, numero: AFFAIRE.numero, titre: AFFAIRE.titre, taille: AFFAIRE.taille, front: AFFAIRE.front, regions: [] }] }),
    tirerAffaire: ({ cle = "" } = {}) => (cle && cle !== AFFAIRE.cle ? null : { cle: AFFAIRE.cle, numero: 3, titre: AFFAIRE.titre, taille: AFFAIRE.taille, front: AFFAIRE.front,
      verite: { cle: "piege", texte: "VERITE-SECRETE : la source n'est pas tarie, une bande la détourne.", poids: 2 }, voix: "Une vieille au marché : « La source pleure plus. »",
      pente: AFFAIRE.pente.crans[0], possibles: 1 }),
    penteAffaire: ({ cle = "", jours = 0 } = {}) => {
      if (cle !== AFFAIRE.cle) return null;
      const cran = Math.min(3, Math.floor(jours / 3));
      return { cle, cran, texte: AFFAIRE.pente.crans[cran - 1] ?? "", fin: cran >= 3, crans: 3 };
    },
    issueAffaire: ({ cle = "", issue = "" } = {}) => (cle === AFFAIRE.cle ? structuredClone(AFFAIRE.issues.find(i => i.cle === issue) ?? null) : null),
    // §18 : les sens.
    sens: () => (d() ? { quart: cadre.etat.horloge.quart, pluie: true, brume: false, vent: { mot: "brise", de: "sud-est", vers: "nord-ouest" }, voix: "ressac", musique: "",
      odeur: mj() ? { odeur: 2, betes: 1, sources: ["ODEUR-SECRETE cuisine"], sousLeVent: "nord-ouest" } : null, ravine: "coule", corps: null,
      accoutumance: [{ id: "s1", nom: "Lucie Hoarau", nuits: 7, palier: 2, effectif: 2 }], nettoyes: [], musiqueLe: null } : null),
    approche: ({ creature = "livide-frais" } = {}) => ({ creature, des: -1, perception: { vue: 1, ouie: 2, odorat: 3 } }),
    noir: enregistrer("noir", async ({ acteurId, action = "lumiere", nuits = 0 }) => ({ acteurId, nuits: action === "regler" ? nuits : 7, palier: 2, effectif: action === "lumiere" ? 0 : 2 })),
    nettoyer: enregistrer("nettoyer", async ({ region = "", site = "", tues = 0 }) => ({ region, site, tues, facteur: 0.5 })),
    jouer: enregistrer("jouer", async ({ musiciens = [], air = "doux" }) => ({ musiciens, air, moral: 1, bruit: air === "fort" ? 3 : 1 })),
    // §19 : le corps.
    corps: () => (d() ? { quart: cadre.etat.horloge.quart, membres: [{ id: "s1", nom: "Lucie Hoarau", veille: 5, sommeil: "epuise", malus: -1, vivant: true }],
      abri: { hygiene: 1, latrines: 0, toilette: 0, insalubrite: 2, etat: "sale", salubre: false, ...(mj() ? { souillure: 2.4 } : {}) }, grisConnu: false, bivouac: true } : null),
    symptomes: ({ acteurId = "" } = {}) => (d() && acteurId === "s1" ? { acteurId, nom: "Lucie Hoarau", maux: [{ cle: "", nom: "", stade: "active", symptomes: ["fievre"], reconnue: false, signes: ["fièvre", "frissons"] }],
      gris: { stade: 2, symptomes: ["toux"], reconnu: false, signes: ["une toux sèche"] }, morsure: null, sommeil: "epuise",
      ...(cadre.mjActif ? { mj: { afflictions: [{ cle: "dengue", nom: "MAL-SECRET dengue", stade: "active", reste: 3, moral: -1 }], infection: { stade: 2, depuis: 10 } } } : {}) } : null),
    bivouac: (criteres = {}) => ({ jugement: criteres.ravine ? "dangereux" : "sur", raisons: criteres.ravine ? ["ravine"] : [], libelle: criteres.ravine ? "dangereux" : "sûr",
      textes: criteres.ravine ? ["au bord d'une ravine"] : [], sommeil: 3, equipe: true, rencontre: criteres.ravine ? 2 : 0.5 }),
    dormir: enregistrer("dormir", async ({ membres = [], quarts = 1, lieu = "" }) => ({ lieu: lieu || "abri", quarts, survivants: membres.map(id => ({ acteurId: id, veille: 0, sommeil: "repose" })) })),
    soignerMorsure: enregistrer("soignerMorsure", async ({ acteurId, soigneurId = "" }) => ({ acteurId, soigneurId: soigneurId || "s2", difficulte: "difficile", medicament: true, decoction: false,
      pansee: true, mj: { reussite: false, infecte: true } })),
    chute: enregistrer("chute", async ({ acteurId = "", hauteur = 0, livide = false }) => (livide ? { livide: true, chancelle: hauteur < 6, rampe: hauteur >= 6 }
      : { acteurId, hauteur, amorti: 0, blessures: Math.floor(hauteur / 3), mourant: hauteur >= 12, mort: hauteur >= 25, fracture: hauteur >= 6, recu: false, test: null, vivant: hauteur < 25 })),
    menage: enregistrer("menage", async ({ quarts = 1 }) => ({ quarts, bras: 2, retire: 1, souillure: 1, insalubrite: 1 })),
    parer: enregistrer("parer", async ({ acteurId, touches = 1 }) => ({ acteurId, seuil: 5, parees: 1, passent: touches - 1, des: [5] })),
    grisConnu: enregistrer("grisConnu", async ({ connu = true }) => ({ grisConnu: Boolean(connu) })),
    // §20 : le jour qu'on croit, les repères.
    reperes: () => (d() ? { compte: { certitude: "a-peu-pres", jourCru: 1, marge: 2, dateCrue: "5 décembre 2026", teneur: "s1", teneurNom: "Lucie Hoarau",
      ...(cadre.mjActif ? { ecart: 2, jourCruReel: 1 } : {}) }, heure: { exacte: false, marge: 2 }, soleil: {}, support: "planche",
      objets: [{ id: "o1", nom: "Carte routière", cle: "carte-routiere", porteurId: "s1", porteur: "Lucie Hoarau", type: "carte", annee: null, valable: null, regions: ["saint-paul"] }],
      cartes: { "saint-paul": { routes: { "le-port": "ouverte" }, sources: [], notes: [] } }, calendrierLune: null, montre: false, cadran: false, fetesAVenir: [], journaux: [] } : null),
    compte: enregistrer("compte", async ({ action = "teneur" }) => ({ certitude: action === "regler" ? "sur" : "a-peu-pres", jourCru: 1, marge: 2, dateCrue: "5 décembre 2026", teneurNom: "Lucie Hoarau", ecart: 2 })),
    donnerDate: enregistrer("donnerDate", async ({ a = "", date = "", mensonge = null }) => (a ? { sens: "donne", date, mensonge: Boolean(mensonge), rumeur: mensonge ? { id: "r9" } : null, vrai: !mensonge }
      : { sens: "recu", date, compte: { certitude: "a-peu-pres", dateCrue: date, ecart: 1 }, vrai: false })),
    lireLaLune: enregistrer("lireLaLune", async () => ({ ok: true, jour: 2, date: "2026-12-06", autreAnnee: false, avant: false, ecart: -1, compte: { certitude: "a-peu-pres", ecart: 1 } })),
    donnerRepere: enregistrer("donnerRepere", async ({ acteurId, cle }) => ({ acteurId, objetId: "o9", nom: `Repère ${cle}` })),
    copierCarte: enregistrer("copierCarte", async () => ({ objetId: "o10", nom: "Copie de carte", encreUsee: "o11" })),
    lireJournal: enregistrer("lireJournal", async ({ mortId = "", de = "" }) => ({ ok: true, de: mortId ? "Gilberte" : de, jour: 1, plans: ["citerne"], regions: [], papier: null, papiers: [] })),
    // §21 : les plans.
    plans: () => (d() ? { carnet: [{ cle: "citerne", nom: "Citerne de pluie", lisible: true }], connus: ["citerne"],
      parCoeur: [{ acteurId: "s2", nom: "Eddy Payet", plans: [{ cle: "potager", nom: "Potager" }], enCours: null }],
      papiers: [{ acteurId: "s1", porteur: "Lucie Hoarau", objetId: "pp1", nom: "Carnet du fontainier", plans: [{ cle: "citerne", nom: "Citerne", lisible: true }], unique: true, valeur: 9 }],
      etagere: [], places: 12, protege: false, circulation: {} } : null),
    valeurPlan: ({ cle = "" } = {}) => ({ cle, nom: "Citerne de pluie", rarete: 20, unique: false, valeur: 7 }),
    lieuxAPlans: () => (d() && cadre.mjActif ? [{ cle: "moulin", nom: "LIEU-PLANS-SECRET Le vieux moulin", region: "saint-paul", regionNom: "Saint-Paul", ici: true, ouverte: true,
      fenetre: "en saison sèche", garde: { type: "livides", texte: "Des Livides dans la cour." }, prochain: null, revenir: 0, tirage: [] }] : []),
    lieuAPlans: enregistrer("lieuAPlans", async ({ lieu }) => ({ lieu, plan: "potager", nom: "Potager", unique: false, lus: ["potager"], objetId: "pp2", prochain: 30 })),
    lirePlan: enregistrer("lirePlan", async () => ({ lus: ["citerne"], illisibles: [] })),
    copierPlan: enregistrer("copierPlan", async ({ cle }) => ({ objetId: "pp3", plan: cle, lumiere: false })),
    enseignerPlan: enregistrer("enseignerPlan", async () => ({ fait: 1, requis: 2, termine: false, lumiere: false })),
    rangerPlan: enregistrer("rangerPlan", async () => ({ id: "e1", places: 12, ranges: 1 })),
    prendrePlan: enregistrer("prendrePlan", async ({ acteurId }) => ({ objetId: "pp4", acteurId })),
    perdreEtagere: enregistrer("perdreEtagere", async () => ({ perdus: ["Carnet du fontainier"], restent: 0 })),
    donnerPlan: enregistrer("donnerPlan", async ({ contre = {} }) => ({ valeur: 9, recu: contre, circulation: { citerne: 1 } })),
    recevoirPlan: enregistrer("recevoirPlan", async ({ cle }) => ({ objetId: "pp5", plan: cle, nom: "Potager", lus: [], paye: {}, valeur: 6 })),
    noterPlan: enregistrer("noterPlan", async ({ cle }) => ({ cle, deja: cadre.etat.groupe.plans.includes(cle), carnet: [...cadre.etat.groupe.plans, cle] })),
    reprendrePlans: enregistrer("reprendrePlans", async () => ({ repris: ["Carnet du fontainier"] })),
    // §22 : la table de gestion, les rangs, la conversion, l'étal, la valeur d'un objet.
    tableDeGestion: () => (d() ? { jour: 3, semaine: 0, disponible: { garde: true, ronde: true },
      membres: [{ id: "s1", nom: "Lucie Hoarau", statut: "joueur", rang: "chef", actif: true, tache: "soins", corvee: "", grille: { soins: 1 }, grillePropre: false, prendrait: "soins", niveaux: {} },
        { id: "s2", nom: "Eddy Payet", statut: "compagnon", rang: "second", actif: true, tache: "chantier", corvee: "eau-du-matin", grille: { chantier: 1 }, grillePropre: true, prendrait: "chantier", niveaux: {} }],
      quotas: [{ id: "q1", acteurId: "s2", nom: "Eddy Payet", tache: "chantier", jours: 3, semaine: 0, fait: 1, depuis: 0 }], seconds: ["s2"], stocks: {} } : null),
    corvees: () => [{ cle: "eau-du-matin", nom: "L'eau du matin", tache: "eau", description: "" }],
    priorites: enregistrer("priorites", async ({ acteurId, grille = {} }) => ({ acteurId, grille })),
    quota: enregistrer("quota", async ({ acteurId = "", tache = "", jours = 1, retirer = "" }) => (retirer ? { retire: retirer } : { quota: { id: "q2", acteurId, tache, jours } })),
    corvee: enregistrer("corvee", async ({ acteurId, corvee = "" }) => ({ acteurId, corvee })),
    second: enregistrer("second", async ({ acteurId, retirer = false }) => ({ seconds: retirer ? [] : [acteurId] })),
    admettre: enregistrer("admettre", async ({ acteurId }) => ({ acteurId, rang: "membre" })),
    passage: enregistrer("passage", async ({ communauteId, ouvert = true }) => ({ communaute: { id: communauteId, passage: ouvert } })),
    convertir: enregistrer("convertir", async ({ religion = "" }) => ({ religion, religions: [], avant: "catholique", quitte: false, souvent: false, rumeur: null })),
    tenirEtal: enregistrer("tenirEtal", async ({ marche, biens = {}, contre = "nourriture" }) => ({ etal: { id: "etal1", marche, biens, contre } })),
    releverEtal: enregistrer("releverEtal", async ({ etal, fermer = false }) => ({ releve: { nourriture: 2 }, rendus: {}, etal: fermer ? null : { id: etal } })),
    valeurObjet: ({ cle = "", objetId = "" } = {}) => ({ cle: cle || "trousse", objet: objetId ? "Trousse de secours" : "", valeur: 5, source: "bareme" }),
    // §24 : les outils.
    outils: ({ acteurId = "" } = {}) => (d() ? [{ acteurId: "s2", objetId: "h1", cle: "hache", nom: "Hache", qualite: "recuperation", gammes: ["hache"], usages: 20, usure: 14, restants: 6,
      reparations: 0, etat: "use", remise: false }].filter(o => !acteurId || o.acteurId === acteurId) : []),
    userOutil: enregistrer("userOutil", async ({ acteurId, objetId }) => ({ acteurId, objetId, nom: "Hache", usages: 20, restants: 5, casse: false, devenueUsee: false })),
    reparerOutil: enregistrer("reparerOutil", async ({ acteurId, objetId, affuter = false }) => ({ acteurId, objetId, nom: "Hache", usages: 20, restants: 11, rendu: 5, ...(affuter ? { affute: true } : {}) })),
    // §25 : les lieux, les gisements, démonter.
    lieux: ({ region = "" } = {}) => (d() ? { region, nom: "Saint-Paul", genres: [{ genre: "maison", nom: "Maisons", nombre: 12, ecarts: 3, vus: 1, finis: 0, demontes: 0 }],
      vus: [{ cle: "saint-paul:maison:1", region, genre: "maison", n: 1, nom: "Maisons 1", mot: "deja", ...(mj() ? { degre: 0.73, bete: "BETE-SECRETE poules" } : {}) }] } : null),
    gisements: ({ region = "" } = {}) => (d() ? { region, nom: "Saint-Paul", milieux: [], gisements: [{ cle: "bambou", nom: "Bambou", nombre: 2, recoltable: true, renvoi: "", ...(mj() ? { disponibles: 2 } : {}) }] } : null),
    betes: () => [],
    demonter: enregistrer("demonter", async () => ({ ok: true, rend: { materiaux: 3 }, travail: 2, quarts: 1 })),
    // §26 : bâtir et défendre.
    ouvrages: () => (d() ? { abri: true, jour: 3, installations: [{ id: "i1", cle: "palissade", nom: "Palissade", niveau: 1, etat: 2, materiau: "bois-sous-tole",
      entretien: { tousLes: 30, travail: 2, prochain: -2, retard: 2, encrasse: false } }], dus: [{ cle: "palissade", nom: "Palissade", retard: 2 }],
      defenses: { piege: 1, pieges: 1, hauteur: false, portes: 0, alarme: true }, eboulement: null } : null),
    entretenir: enregistrer("entretenir", async () => ({ installation: "palissade", soigne: true, rattrape: 1, reste: 0, etat: 1 })),
    incendie: enregistrer("incendie", async ({ force = 1 }) => ({ force, brulees: ["Palissade"], epargnees: [], degatsAbri: force - 1 })),
    // §27 : le vivant.
    cheptels: () => (d() ? { cheptels: [{ cle: "basse-cour", nom: "Basse-cour", espece: "poule", especeNom: "poules", tetes: 5, places: 8, plein: 6, sante: 2, malade: false, manques: ["soif"] }],
      betes: [{ id: "b1", cle: "poule", espece: "poule", nom: "poules", nombre: 2, reste: 3 }], chien: true, outils: ["sac-de-goni"] } : null),
    flairDuChien: ({ distance = 30 } = {}) => ({ signal: distance < 5 ? "aboie" : "tourne", texte: "Il tourne la tête vers la ravine." }),
    beteSauvage: () => ({ espece: "tangue", especeNom: "Tangue", nombre: 1, zone: "littoral" }),
    peupler: enregistrer("peupler", async ({ installation, n = 1 }) => ({ installation, entrent: n, restent: 0, tetes: 5 + n, places: 8 })),
    mettreEnEnclos: enregistrer("mettreEnEnclos", async ({ beteId }) => ({ betes: [beteId], restent: 0 })),
    abattre: enregistrer("abattre", async ({ n = 1 }) => ({ abattues: n, nourriture: 2 * n })),
    soignerCheptel: enregistrer("soignerCheptel", async ({ installation, acteurId }) => ({ installation, gueri: true, reussite: true, acteurId })),
    curer: enregistrer("curer", async ({ installation }) => ({ installation, soigne: true, reste: 0 })),
    capturer: enregistrer("capturer", async () => ({ prise: true, file: false, outil: "sac-de-goni", blessure: false })),
    chasser: enregistrer("chasser", async ({ competence = "combat" }) => ({ abattue: true, viande: 3, bruit: competence === "tir" ? 2 : 0, reussite: true })),
    recevoirBete: enregistrer("recevoirBete", async ({ espece, n = 1 }) => ({ bete: { espece, nombre: n } })),
    lacherBetes: enregistrer("lacherBetes", async ({ beteId }) => ({ lachees: [beteId] })),
    // §28 : le paradis et rallumer l'île.
    paradis: () => (d() ? { quart: cadre.etat.horloge.quart, abri: { nom: "Collège des Hauts", signe: "remarques", signeTexte: "on vous a remarqués : des traces autour de la clôture",
      corps: 3, corpsFrais: 2, rondeLe: 2, rondesManquees: 1, fumee: false, sousTerre: false, air: "bon", airTexte: "bon", puits: {} }, rondiers: ["Eddy Payet"], membres: [],
      prix: { autonome: false, rondiers: 1, corps: 3 }, ...(mj() ? { mj: { chaleur: 4.37, agglutines: 2, leurreLe: null, seuil: 2, arrivants: 0.8 } } : {}) } : null),
    ile: () => (d() ? { jour: 3, regions: [{ cle: "saint-paul", nom: "Saint-Paul", etat: "rallumee", etatTexte: "rallumée", conditions: { manque: [], manqueTextes: [], toutes: true } },
      { cle: "le-port", nom: "Le Port", etat: "noire", etatTexte: "noire" }], chantiers: [], jalons: [], rallumees: 1, total: 5 } : null),
    ronde: enregistrer("ronde", async () => ({ abattus: 2, restants: 0, livides: 2, morsures: ["s2"], trouvaille: 0, chaleur: 3.9 })),
    traiterCorps: enregistrer("traiterCorps", async ({ action = "enterrer" }) => ({ action, traites: 3, restent: 0, bois: action === "bruler" ? 1 : 0, fumee: action === "bruler" })),
    leurre: enregistrer("leurre", async () => ({ reussi: true, effet: -2, partent: 1, recent: false })),
    chaleur: enregistrer("chaleur", async ({ delta = 0 }) => ({ chaleur: 4.37 + delta, agglutines: 2, signe: "remarques" })),
    sousTerre: enregistrer("sousTerre", async ({ vit = null }) => ({ sousTerre: vit })),
    rallumer: enregistrer("rallumer", async ({ region, action = "declarer" }) => ({ region, etat: action === "eteindre" ? "eteinte" : "rallumee", jalons: [] })),
    chantierRegion: enregistrer("chantierRegion", async ({ cle, aide = "", retirer = false }) => (aide ? { cle, aides: retirer ? [] : [aide] } : { cle, fait: 4, requis: 40, fini: false }))
  };
}

// Le cours de la doublure (parts), une valeur au cours, la première confiance d'un PNJ (cibles : ses préjugés éveillés ; ce qu'il en dit).
const COURS = { eau: 0.5, nourriture: 1, carburant: 4, medicaments: 7.5, munitions: 4.5, materiaux: 2, pieces: 3, graines: 2 };
const valeur = (biens = {}) => Object.entries(biens).reduce((s, [r, q]) => s + (COURS[r] ?? 0) * q, 0);
function confiance({ pnjId = "", cibles = [] } = {}) {
  const a = pnjId ? globalThis.game.actors.get(pnjId) : null;
  const enJeu = (a?.system?.prejuges ?? []).filter(p => cibles.includes(p.cible));
  const poids = Math.min(3, enJeu.reduce((s, p) => s + (p.poids ?? 1), 0) + (cibles.length && !a ? cibles.length : 0));
  return { poids, majoration: [0, 0.25, 0.5, 1][poids], credit: ["plein", "moitie", "refuse", "refuse"][poids], parole: [0, 1, 1, 2][poids], enJeu: enJeu.map(p => p.cible),
    dits: enJeu.map(p => p.dit), rumeurs: 0, pnj: a?.name ?? "" };
}
function evaluation({ donne = {}, recoit = {}, pnjId = "", cibles = [] } = {}) {
  const c = confiance({ pnjId, cibles });
  const valeurDonnee = valeur(donne), valeurRecue = valeur(recoit), demandee = valeurRecue * (1 + c.majoration);
  return { valeurDonnee, valeurRecue, demandee, ecart: valeurDonnee - demandee, accepte: valeurRecue > 0 && valeurDonnee >= demandee, equitable: valeurDonnee === valeurRecue,
    confiance: c, cours: { ...COURS } };
}
// Ce que porterActe rend (le sens moral de qui porte l'acte) ; qui : « groupe » ou un id.
function sensDe(qui, acte) {
  if (!qui) return null;
  const ids = qui === "groupe" ? ["s1", "s2"] : [qui];
  const delta = ["accueillir", "aider", "partager", "epargner", "rendre"].includes(acte) ? 1 : -1;
  return { membres: ids.map(id => ({ acteurId: id, nom: globalThis.game.actors.get(id)?.name ?? id, sensMoral: delta, reputation: delta, delta, deltaReputation: delta })),
    porteurs: ids, epargnes: [], enfants: [] };
}

// Le monde des nouveautés (marché, porte, communauté, esprit, savoirs, cyclone vécu) : posé sur la doublure par installerFenoir({ nouveautes }).
function poserNouveautes(cadre, acteurs) {
  cadre.nouveautes = true;
  Object.assign(cadre.etat.groupe, { chef: "s1", entente: 1, chienErrant: { confiance: 1, region: "saint-paul" } });
  cadre.etat.marche = {
    boutiques: [{ cle: "chane", nom: "Boutique Chane", tenancier: "pnj-chane", region: "saint-paul", parole: {}, soldeLe: null, prochain: 2,
      entrees: [{ id: "d1", debiteur: "groupe", pris: { nourriture: 4 }, valeur: 4, reste: 4, jour: 1, nouvelAn: null, rumeur: false, rendus: [] }] }],
    // Le doublure dit le 7 décembre 2026 au jour 3 : un lundi (jourSemaine 1).
    marches: [{ cle: "marche-saint-paul", nom: "Marché forain de Saint-Paul", region: "saint-paul", lieu: "", jourSemaine: 1, bastions: ["planteurs", "groupe"],
      hote: "", treve: { rompue: false, par: "", jour: null }, ouvertLe: 0, joursTenus: 0, recolte: null, foire: false, jusqua: null, litiges: 0 }],
    rumeurs: [{ id: "r1", sujet: "groupe", texte: "On dit que le groupe du collège cache des médicaments.", portee: "region", source: "colporte", contre: true, jour: 2, dementie: false },
      { id: "r0", sujet: "groupe", texte: "Une vieille histoire, démentie.", portee: "region", source: "colporte", contre: true, jour: 1, dementie: true }],
    signe: "", prochain: 2
  };
  cadre.monde.marche = { rumeurs: { r1: { vraie: false, auteur: "AUTEUR-SECRET", malveillant: true }, r0: { vraie: false, auteur: "AUTEUR-SECRET", malveillant: false } } };
  cadre.etat.porte = [{ id: "v1", jour: 3, nom: "Maëva Grondin", age: 31, genre: "f", profil: "famille", bouches: 2, demande: { texte: "Laissez-nous entrer, mes enfants ont faim." },
    apporte: { nourriture: 1 }, revient: false }];
  cadre.monde.porte = { v1: { survivant: { sensMoral: -7 }, profil: "famille", bouches: 2 } };
  cadre.etat.tributs = [{ id: "t1", bande: "Les Récupérateurs", faction: "recuperateurs", demande: { nourriture: 3 }, tousLes: 7, depuis: 0, prochain: 3, payes: 0, etat: "actif" }];
  cadre.etat.votes = [{ id: "vote1", quart: 12, question: "Faut-il ouvrir à la famille ?", acte: "accueillir", voix: { s1: "pour", s2: "contre" },
    resultat: { pour: 1, contre: 1, abstention: 0 }, decide: null }];
  cadre.etat.communautes = [{ id: "c1", nom: "Ceux du Maïdo", membres: ["x1"], statuts: {}, plans: [], region: "hauts-ouest", abri: "", depuis: 2, entente: 0 }];
  cadre.monde.menaces = [{ id: "m1", type: "bande", force: 4, faction: "recuperateurs", texte: "MENACE-SECRETE : les Récupérateurs rôdent près du collège.",
    chef: { decision: "ultimatum", sensMoral: -4, bande: "rougeatre" } }];
  cadre.cyclone = { nom: "CYCLONE-SECRET", alerte: "rouge", force: 2, arrivee: 3, region: "saint-paul", quarts: [
    { moment: "matin", vent: "rafales", dehors: { des: -2, vigilance: -3, discretion: 2 } }, { moment: "apres-midi", vent: "oeil", dehors: { des: 0, vigilance: 0, discretion: 0 } },
    { moment: "soir", vent: "retour", dehors: { des: -2, vigilance: -3, discretion: 2 } }, { moment: "nuit", vent: "accalmie", dehors: { des: -1, vigilance: -1, discretion: 1 } }] };
  // L'esprit de Lucie (la cheffe), un savoir lontan d'Eddy en train, la commerçante et ses préjugés, posée sur la scène.
  Object.assign(acteurs.get("s1").system, { regard: "refaire", religion: "catholique", religions: [], pratique: true, ancrage: "", sensMoral: 3, reputation: 2, autorite: 3,
    esprit: { enFaute: true, lacher: 2, chance: 1, projet: "" } });
  Object.assign(acteurs.get("s2").system, { apprentissage: { savoir: "tisanes", source: "maitre", fait: 2, requis: 7 }, confiance: 0 });
  acteurs.set("pnj-chane", acteur({ id: "pnj-chane", name: "Madame Chane", type: "survivant", system: { statut: "pnj", prejuges: [
    { cible: "zoreils", poids: 2, dit: "PREJUGE-SECRET : les zoreils paient mal.", echanges: 0, fetes: 0, dementis: 0 },
    { cible: "malbars", poids: 1, dit: "Préjugé tombé", echanges: 3, fetes: 0, dementis: 0 }] } }));
  globalThis.game.scenes.active = { name: "Marché de Saint-Paul", tokens: { contents: [{ name: "Madame Chane", actor: acteurs.get("pnj-chane"), hidden: false, disposition: 0 }] } };
}

// Le monde des lots du jeu 3D (§16 à §29) : le compte des jours, le temps, le corps, les plans, la gestion, les ateliers, le vivant, le
// paradis ; l'odeur, la chaleur, les vrais maux, la vérité des affaires au secret. Posé par installerFenoir({ troisD }).
function poserTroisD(cadre, acteurs) {
  cadre.troisD = true;
  Object.assign(cadre.etat.groupe, { seconds: ["s2"], nouveaux: { n9: 2 }, quotas: [{ id: "q1", acteurId: "s2", tache: "chantier", jours: 3, semaine: 0, fait: 1, depuis: 0 }],
    betes: [{ id: "b1", cle: "poule", nombre: 2, prisLe: 10, jusqua: 16, enclos: "", abri: "", source: "fouille" }] });
  cadre.etat.morts = [{ id: "m1", nom: "Gilberte", quart: 4, retrouve: true, repos: false, journal: { jourCru: 1, certitude: "sur", plans: [] } }];
  Object.assign(acteurs.get("s1").system, { veille: 5, morsure: { quart: 12 }, noir: { nuits: 7 } });
  acteurs.get("s2").items.push({ id: "h1", type: "equipement", name: "Hache", system: { cle: "hache", qualite: "recuperation", usages: 20, usure: 14 } },
    { id: "pp9", type: "equipement", name: "Carte routière", system: { cle: "carte-routiere" } });
  acteurs.get("abri1").items.push({ id: "i2", type: "installation", name: "Établi", system: { cle: "etabli", niveau: 2, etat: 0 } },
    { id: "i3", type: "installation", name: "Basse-cour", system: { cle: "basse-cour", niveau: 1, etat: 0 } });
}

// Les horloges du moteur (api.horloges de main.js), en mémoire : assurer, avancer, lister, trouver, regler (les affaires, §17 ; les
// réputations rep-<faction> et les fronts front-<front>).
function horlogesDoublure(cadre) {
  cadre.horloges = [];
  const trouver = ref => cadre.horloges.find(h => h.id === ref || h.nom === ref) ?? null;
  return {
    lister: () => structuredClone(cadre.horloges),
    trouver: ref => structuredClone(trouver(ref)),
    assurer: async def => { const deja = trouver(def.id ?? def.nom); if (deja) return structuredClone(deja);
      const el = { id: def.id ?? def.nom, nom: def.nom ?? def.id, type: def.type ?? "horloge", valeur: def.valeur ?? 0, max: def.max ?? 6, visible: Boolean(def.visible),
        faction: def.faction ?? "", notes: def.notes ?? "", paliers: [] };
      cadre.horloges.push(el); return structuredClone(el); },
    avancer: async (id, n = 1) => { const el = trouver(id); if (!el) return null; el.valeur = Math.min(el.max, el.valeur + n); return { element: structuredClone(el), evenements: [] }; },
    regler: async (id, ch = {}) => { const el = trouver(id); if (!el) return null; Object.assign(el, ch); return { element: structuredClone(el), evenements: [] }; }
  };
}

// Installe le monde Fénoir de la doublure dans globalThis. -> { cadre, api, chat, acteurs }
// nouveautes : le marché, la porte, la communauté, l'esprit, les savoirs et le cyclone vécu (§12 à §15) posés sur le monde.
// troisD : les douze lots du jeu 3D (§16 à §29).
export function installerFenoir({ mjActif = true, mondeOuvert = true, systeme = "lakour-survie", avecApi = true, nouveautes = false, troisD = false } = {}) {
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
    modules: new Map([["lakour-mj-ia", { api: { horloges: horlogesDoublure(cadre) } }]]),
    ...(avecApi ? { lakourSurvie: api } : {})
  };
  if (nouveautes) poserNouveautes(cadre, acteurs);
  if (troisD) poserTroisD(cadre, acteurs);
  return { cadre, api, chat, acteurs, reglages };
}
