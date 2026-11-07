// Ce que coûte le narrateur (docs/cout.md) : les économies sont tenues, et rien ne manque au narrateur pour mener une partie.
// - aux Veillées, aucun outil du plateau ni de l'aventure dans la liste envoyée ; tout outil que le prompt nomme est proposé ;
// - le préfixe caché (outils + prompt système) est identique d'un appel à l'autre pendant une partie, y compris à sa fin ;
// - les morceaux des variantes absentes de la partie ne sont pas dans le prompt ; sans partie connue, tous y sont ;
// - l'état du jeu des Veillées n'a ni carte ni repères ; la mise en place n'y coûte plus un appel ;
// - les points de cache : outils et système une heure, le fil cinq minutes, quatre au plus ;
// - les consignes de secret restent ; les trois autres jeux gardent leurs consignes et leurs outils d'aventure.
// Doublure de Foundry de outils/mesurer-prompt.mjs, fournisseur doublure : aucun appel à un modèle. Chaque règle est rejouée sur des
// copies mutées du moteur.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { installerFoundry, monde, chargerVersion, mesurer, simulerPartie, jetons } from "../outils/mesurer-prompt.mjs";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
installerFoundry();
globalThis.fetch = async () => ({ ok: false, json: async () => null });

// Une petite carte : une pièce (dessin caché nommé) et un puits : de quoi faire une carte vue de dessus et des repères.
const SCENE = {
  name: "Brumecombe", navName: "Brumecombe — le village", grid: { size: 100, distance: 1.5, units: "m" }, width: 1200, height: 800, padding: 0,
  drawings: [{ x: 0, y: 0, shape: { type: "r", width: 1200, height: 800 }, hidden: true, text: "Place du village" }],
  flags: { "lakour-veillees": { plan: { largeur: 12, hauteur: 8, pieces: [{ nom: "Place du village", x: 0, y: 0, l: 12, h: 8 }],
    elements: [{ nom: "Puits", type: "puits", x: 5, y: 3, l: 1, h: 1 }, { nom: "Maison 1", type: "maison", x: 1, y: 1, l: 2, h: 2 }], portes: [] } } }
};

// Un fournisseur doublure : il note ce que chaque appel enverrait en tête (outils, puis prompt système), comme l'API les reçoit.
function doublure(M) {
  const envois = [];
  return {
    envois,
    nom: "doublure",
    nouveauFil: () => ({ fournisseur: "doublure", messages: [] }),
    ajouterUtilisateur(fil, texte) { fil.messages.push({ role: "user", content: texte }); },
    ajouterResultats(fil, resultats) { fil.messages.push({ role: "user", content: resultats }); },
    async envoyer(fil, { systeme, outils }) {
      envois.push(JSON.stringify({ tools: M.anthropic.definitionsOutils(outils), system: systeme }));
      fil.messages.push({ role: "assistant", content: "La brume monte sur Brumecombe." });
      return { texte: "La brume monte sur Brumecombe.", appels: [], usage: { entree: 0, cacheLecture: 100, cacheEcriture: 10, sortie: 5 }, arret: "fin" };
    }
  };
}

const REGLAGES_SEANCE = M => ({
  fournisseur: "factice", autonomie: "autonome", voix: "aucune", delaiReponse: 0, budgetSeance: 0, pilote: false, rythmeJoueur: 0,
  personnalites: M.personnalites.PERSONNALITES_DE_BASE, personnaliteActive: M.personnalites.PERSONNALITES_DE_BASE[0].id,
  seance: { active: false, jetons: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 0 }, cout: 0 }, coutsEnAttente: {}
});

// Les outils dont le nom paraît dans un texte (mot entier ; seulement les noms composés, « animation » ou « pause » sont aussi des mots).
const outilsNommes = (texte, tous) => tous.filter(n => n.includes("_") && new RegExp(`(^|[^\\w])${n}([^\\w]|$)`).test(texte));

// ------------------------------------------------------------------ les règles (une batterie, rejouée sur des copies mutées)
const VERIFICATIONS = {
  async "aux Veillées, aucun outil du plateau ni de l'aventure ; tout outil que le prompt nomme est proposé"(M) {
    monde("lakour-loups", { partie: "pacte" });
    const noms = M.outils.outilsDuSysteme("lakour-loups").map(o => o.nom);
    for (const n of M.outils.OUTILS_HORS_VEILLEES) assert.ok(!noms.includes(n), `proposé aux Veillées : ${n}`);
    for (const n of ["creer_scene", "mettre_en_scene", "placer_jetons", "figurants", "creer_pnj", "illustrer", "vote_groupe", "choix_secret"]) {
      assert.ok(M.outils.OUTILS_HORS_VEILLEES.includes(n), n);
    }
    // Tous les outils du jeu restent, et ceux du secret, des aides et des tables.
    for (const n of M.outils.OUTILS.filter(o => o.systemes?.includes("lakour-loups")).map(o => o.nom)) assert.ok(noms.includes(n), `manque : ${n}`);
    for (const n of ["message_prive", "montrer_aide", "lancer_table", "chercher_compendium", "lire_document", "compagnons", "pause"]) assert.ok(noms.includes(n), n);
    const tous = M.outils.OUTILS.map(o => o.nom);
    for (const partie of ["preparation", "classique", "pacte"]) {
      monde("lakour-loups", { partie });
      const offerts = M.outils.outilsDuSysteme("lakour-loups").map(o => o.nom);
      const prompt = await M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0]);
      for (const n of outilsNommes(prompt, tous)) assert.ok(offerts.includes(n), `${partie} : le prompt nomme ${n}, qui n'est pas proposé`);
    }
    // La requête envoyée à l'API : les mêmes outils, rien d'autre.
    monde("lakour-loups", { partie: "pacte" });
    const requete = M.anthropic.definitionsOutils(M.outils.outilsDuSysteme("lakour-loups")).map(t => t.name);
    for (const n of M.outils.OUTILS_HORS_VEILLEES) assert.ok(!requete.includes(n), `envoyé : ${n}`);
  },

  async "les trois autres jeux gardent leurs outils et leurs consignes d'aventure"(M) {
    for (const systeme of ["dnd5e", "impmal"]) {
      monde(systeme);
      const noms = M.outils.outilsDuSysteme(systeme).map(o => o.nom);
      for (const n of M.outils.OUTILS_HORS_VEILLEES) assert.ok(noms.includes(n), `${systeme} sans ${n}`);
      const prompt = await M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0]);
      for (const mot of ["demander_jet", "mettre_en_scene", "vote_groupe", "creer_scene", "modifier_scenario", "jet_compagnon", "donner_xp"]) {
        assert.ok(prompt.includes(mot), `${systeme} : ${mot}`);
      }
    }
    monde("lakour-survie");
    const survie = await M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0]);
    assert.ok(survie.includes("demander_jet") && survie.includes("mettre_en_scene") && !survie.includes("donner_xp"));
  },

  async "le préfixe caché est identique d'un appel à l'autre pendant une partie, fin comprise"(M) {
    const { api, reglages } = monde("lakour-loups", { partie: "pacte", village: SCENE, reglages: REGLAGES_SEANCE(M) });
    const moteur = new M.moteur.MoteurMJ();
    await moteur.demarrer({ silencieux: true });
    const f = doublure(M);
    moteur.fournisseur = f;
    moteur.fil = f.nouveauFil();
    const tour = async texte => moteur.tour(`[État du jeu]\n${M.contexte.etatDuJeu()}\n\n[Messages et actions des joueurs]\n${texte}`, { sauver: false });
    await tour("Aubin : ⟦parole⟧J'accuse Berthe.⟦/parole⟧");
    api.etatInterne.phase = "nuit";
    api.etatInterne.vote = { ouvert: true, votes: { v1: "v2" } };
    await tour("Vote ouvert.");
    // La partie se termine : la liste des outils du système change (ecrire_chronique revient), pas celle de la séance.
    const pendant = M.outils.outilsDuSysteme("lakour-loups").map(o => o.nom).join();
    Object.assign(api.etatInterne, { phase: "fin", vainqueur: "village" });
    assert.notEqual(M.outils.outilsDuSysteme("lakour-loups").map(o => o.nom).join(), pendant, "la doublure fait bien changer la liste");
    await tour("Dénouement.");
    assert.equal(f.envois.length, 3);
    assert.equal(new Set(f.envois).size, 1, "le préfixe a changé d'un appel à l'autre");
    assert.equal(reglages.miseEnPlace, true, "réglage de mise en place allumé : les Veillées ne la demandent pas pour autant");
  },

  async "les morceaux des variantes absentes ne sont pas dans le prompt ; sans partie connue, tous y sont"(M) {
    const prompt = async partie => { monde("lakour-loups", { partie }); return M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0]); };
    const MORCEAUX = { almanach: "l'Almanach des brumes tire un présage", souffle: "garde son Dernier souffle", somnambule: "Un Somnambule croit tenir",
      glas: "Le Glas final (loups_calendrier", bonneEtoile: "La Bonne étoile (loups_calendrier)", banc: "Avec le Banc des accusés",
      deuil: "Le Glas du deuil sonne", saintMartin: "La Nuit de la Saint-Martin", pacte: "Le Pacte (le jeu de soirée", bailli: "Le Bailli est une charge PUBLIQUE" };
    const classique = await prompt("classique");
    for (const [cle, texte] of Object.entries(MORCEAUX)) {
      if (cle === "bailli") assert.ok(classique.includes(texte), "le Bailli est en jeu");
      else assert.ok(!classique.includes(texte), `classique : ${cle} présent`);
    }
    const pacte = await prompt("pacte");
    assert.ok(pacte.includes(MORCEAUX.pacte) && !pacte.includes(MORCEAUX.saintMartin));
    // Avant la distribution (on ne sait rien) : tout ; le texte complet est celui de l'adaptateur.
    const preparation = await prompt("preparation");
    for (const [cle, texte] of Object.entries(MORCEAUX)) assert.ok(preparation.includes(texte), `préparation : ${cle} absent`);
    assert.ok(preparation.includes(M.adaptateurs.adaptateurDe("lakour-loups").consignes));
    // Chaque variante en jeu fait entrer son morceau.
    const base = { partie: "p1", roles: ["loup-de-brumecombe", "villageois", "villageois"], bailli: false };
    const cas = {
      almanach: { etat: { presage: { actif: true } } }, souffle: { etat: { souffle: { actif: true } } }, glas: { etat: { glas: 4 } },
      bonneEtoile: { etat: { bonneEtoile: "v1" } }, banc: { etat: { banc: { actif: true } } }, deuil: { etat: { deuil: { actif: true } } },
      saintMartin: { etat: { format: "saint-martin" } }, bailli: { bailli: true }, somnambule: { roles: ["loup-de-brumecombe", "somnambule"] },
      pacte: { roles: ["loup-de-brumecombe", "braconniere"] }
    };
    for (const [cle, def] of Object.entries(cas)) {
      const texte = await prompt({ ...base, ...def, etat: def.etat });
      assert.ok(texte.includes(MORCEAUX[cle]), `${cle} en jeu, morceau absent`);
      for (const [autre, t] of Object.entries(MORCEAUX)) if (autre !== cle) assert.ok(!texte.includes(t), `${cle} en jeu : ${autre} présent`);
    }
    for (const def of [{ etat: { village: { actif: true } } }, { etat: { gazette: { actif: true } } }, { etat: { variantes: { mur: true } } },
      { etat: { aConsigner: { niveau: "le-pacte" } } }]) {
      assert.ok((await prompt({ ...base, ...def })).includes(MORCEAUX.pacte), JSON.stringify(def));
    }
    // Rôles illisibles (secrets pas encore là), API qui lève : prudence, tout entre.
    assert.ok((await prompt({ ...base, roles: [] })).includes(MORCEAUX.saintMartin));
    monde("lakour-loups", { partie: "classique" });
    game.lakourLoups.etat = () => { throw new Error("MJ non actif"); };
    assert.ok((await M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0])).includes(MORCEAUX.saintMartin));
  },

  async "rien ne manque au narrateur des Veillées : secret, paroles, compagnons, déroulement"(M) {
    for (const partie of ["classique", "pacte"]) {
      monde("lakour-loups", { partie });
      const p = await M.contexte.promptSysteme(M.personnalites.PERSONNALITES_DE_BASE[0]);
      for (const mot of [M.contexte.CONSIGNE_PAROLES, "Ne lui souffle JAMAIS un secret", "va en message_prive", "ne l'annonce JAMAIS",
        "Les Masques de veillée sont un secret de la meute", "Peste noire", "n'est jamais confirmé par toi", "Déroulement : loups_distribuer",
        "Le plateau se met en scène TOUT SEUL", "loups_rejouer", "rôle SECRET (ne le dis à personne)", "Tu ne racontes ni les gestes ni les paroles"]) {
        assert.ok(p.includes(mot), `${partie} : ${mot.slice(0, 50)}`);
      }
      for (const mot of ["demander_jet", "creer_scene", "mettre_en_scene", "[Mise en place]", "donner_xp", "jet_compagnon", "Cartes prêtes",
        "modifier_scenario", "vote_groupe"]) {
        assert.ok(!p.includes(mot), `${partie} : ${mot} encore là`);
      }
      assert.ok(!/\n\n\n/.test(p), "pas de lignes vides en série");
    }
  },

  async "l'état du jeu des Veillées n'a ni carte ni repères ; ailleurs, oui ; la mise en place n'y est jamais demandée"(M) {
    monde("lakour-loups", { partie: "pacte", village: SCENE });
    const veillees = M.contexte.etatDuJeu();
    assert.match(veillees, /Scène active : « Brumecombe — le village »/);
    assert.match(veillees, /Partie : phase « jour », tour 2/);
    for (const mot of ["Carte (vue de dessus)", "Repères", "Présents :", "Pièces de la carte"]) assert.ok(!veillees.includes(mot), mot);
    assert.equal(new M.moteur.MoteurMJ().miseEnPlaceVoulue(), false);
    monde("dnd5e", { village: SCENE });
    const ailleurs = M.contexte.etatDuJeu();
    for (const mot of ["Carte (vue de dessus)", "Pièces de la carte"]) assert.ok(ailleurs.includes(mot), `dnd5e : ${mot}`);
    assert.equal(new M.moteur.MoteurMJ().miseEnPlaceVoulue(), true);
  },

  async "points de cache : outils et système une heure, le fil cinq minutes, quatre au plus"(M) {
    const outils = [{ nom: "a", description: "A.", schema: { type: "object", properties: {} } }, { nom: "b", description: "B.", schema: { type: "object", properties: {} } }];
    const defs = M.anthropic.definitionsOutils(outils);
    assert.equal(defs[0].cache_control, undefined);
    assert.deepEqual(defs[1].cache_control, { type: "ephemeral", ttl: "1h" });
    assert.deepEqual(M.anthropic.definitionsOutils([]), []);
    const f = new M.anthropic.FournisseurAnthropic({ cle: "x", modele: "claude-opus-5-5", effort: "medium" });
    let params = null;
    f.client = { beta: { messages: { stream: p => { params = p; return { on() {}, finalMessage: async () => ({ content: [], stop_reason: "end_turn", usage: {} }) }; } } } };
    const fil = f.nouveauFil();
    f.ajouterUtilisateur(fil, "Salut");
    await f.envoyer(fil, { systeme: "SYS", outils });
    const points = [...params.tools, ...params.system].filter(b => b.cache_control).map(b => b.cache_control);
    assert.deepEqual(points, [{ type: "ephemeral", ttl: "1h" }, { type: "ephemeral", ttl: "1h" }]);
    assert.deepEqual(params.cache_control, { type: "ephemeral" }, "le fil : point automatique, cinq minutes");
    assert.ok(points.length + 1 <= 4);
    assert.ok(!params.messages.some(m => Array.isArray(m.content) && m.content.some(b => b.cache_control)), "aucun point dans le fil");
  },

  async "écritures du cache gardées une heure : lues de l'API et comptées deux fois l'entrée"(M) {
    const opus = M.constantes.MODELES_ANTHROPIC["claude-opus-5-5"];
    assert.equal(M.constantes.coutDe({ cacheEcriture: 1e6 }, opus), opus.cacheEcriture);
    assert.equal(M.constantes.coutDe({ cacheEcriture: 1e6, cacheEcriture1h: 1e6 }, opus), 2 * opus.entree);
    assert.equal(M.constantes.coutDe({ cacheEcriture: 3e6, cacheEcriture1h: 1e6 }, opus), 2 * opus.cacheEcriture + 2 * opus.entree);
    const f = new M.anthropic.FournisseurAnthropic({ cle: "x", modele: "claude-opus-5-5", effort: "medium" });
    const reponse = usage => ({ on() {}, finalMessage: async () => ({ content: [], stop_reason: "end_turn", usage }) });
    let u = { input_tokens: 3, cache_read_input_tokens: 10, cache_creation_input_tokens: 700, output_tokens: 4, cache_creation: { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 200 } };
    f.client = { beta: { messages: { stream: () => reponse(u) } } };
    const fil = f.nouveauFil();
    f.ajouterUtilisateur(fil, "Salut");
    assert.deepEqual((await f.envoyer(fil, { systeme: "S", outils: [] })).usage, { entree: 3, cacheLecture: 10, cacheEcriture: 700, sortie: 4, cacheEcriture1h: 500 });
    u = { input_tokens: 3, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, output_tokens: 4 };
    f.ajouterUtilisateur(fil, "Encore");
    assert.deepEqual((await f.envoyer(fil, { systeme: "S", outils: [] })).usage, { entree: 3, cacheLecture: 10, cacheEcriture: 0, sortie: 4 });
  },

  async "journal des appels du narrateur : borné, en mémoire"(M) {
    const moteur = new M.moteur.MoteurMJ();
    for (let i = 0; i < 450; i++) moteur.noterAppel({ entree: 1, cacheLecture: i, cacheEcriture: 2, sortie: 3 });
    assert.equal(moteur.journalAppels.length, 400);
    assert.equal(moteur.journalAppels.at(-1).cacheLecture, 449);
    moteur.noterAppel(null);
    assert.equal(moteur.journalAppels.length, 400);
  }
};

async function batterie(M) {
  const echecs = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { echecs.push(`${nom} : ${e.message}`); }
  }
  return echecs;
}

async function charger(racine) {
  const V = await chargerVersion(racine);
  const url = f => new URL(`file:///${join(racine, "scripts", f).replace(/\\/g, "/")}`).href;
  return { ...V, anthropic: await import(url("fournisseurs/anthropic.js")), adaptateurs: await import(url("adaptateurs.js")),
    constantes: await import(url("constantes.js")) };
}

for (const nom of Object.keys(VERIFICATIONS)) {
  test(nom, async () => {
    const M = await charger(RACINE);
    await VERIFICATIONS[nom](M);
  });
}

test("partie type : le modèle de coût retrouve à peu près la partie mesurée en vrai, et l'économie tient", async () => {
  const M = await charger(RACINE);
  const r = await mesurer(M, "lakour-loups", { partie: "pacte", village: SCENE });
  assert.ok(r.prefixe < 14000, `préfixe des Veillées : ${r.prefixe} jetons estimés`);
  assert.equal(jetons("x".repeat(35)), 10);
  const apres = simulerPartie({ prefixe: r.prefixe, etat: r.jetonsEtat, prefixeUneHeure: true });
  const avant = simulerPartie({ prefixe: 24400, etat: 1600, outilsChangentALaFin: true });
  assert.ok(Math.abs(avant.lu - 5280561) / 5280561 < 0.1, `cache lu ${avant.lu}`);
  assert.ok(Math.abs(avant.ecrit - 411905) / 411905 < 0.15, `cache écrit ${avant.ecrit}`);
  assert.ok(apres.lu < avant.lu * 0.65 && apres.ecrit + apres.ecritUneHeure < avant.ecrit * 0.5);
});

// ------------------------------------------------------------------ mutations
const MUTATIONS = {
  "outils d'aventure rendus aux Veillées": ["outils.js", `  if (OUTILS_HORS_VEILLEES.includes(o.nom) && !(o.horsSystemes ?? []).includes("lakour-loups"))`, "  if (false)"],
  "liste des outils recalculée à chaque tour": ["moteur.js", "outils = this.outils ?? outilsDuSysteme(), sauver", "outils = outilsDuSysteme(), sauver"],
  "carte dans l'état du jeu des Veillées": ["contexte.js", `if (scene && game.system?.id === "lakour-loups") {`, "if (false) {"],
  "variantes toujours dans le prompt": ["contexte.js", `if (typeof sys.consignesPour === "function") consignes = sys.consignesPour();`, ""],
  "morceau gardé sans sa variante": ["adaptateurs.js", "const actifSauf = inactif => p => !p || !inactif(p);", "const actifSauf = () => () => true;"],
  "morceau retiré sans savoir": ["adaptateurs.js", "const actifSauf = inactif => p => !p || !inactif(p);", "const actifSauf = inactif => p => Boolean(p) && !inactif(p);"],
  "consignes d'aventure aux Veillées": ["contexte.js", "const aventure = lignes => (veillees ? [] : lignes);", "const aventure = lignes => lignes;"],
  "mise en place aux Veillées": ["moteur.js", ` && game.system?.id !== "lakour-loups";`, ";"],
  "consignes du jeu d'aventure en moins ailleurs": ["contexte.js", "const aventure = lignes => (veillees ? [] : lignes);", "const aventure = () => [];"],
  "outils sans point de cache": ["fournisseurs/anthropic.js", "...(i === outils.length - 1 ? { cache_control: { ...CACHE_PREFIXE } } : {})", ""],
  "système en cinq minutes": ["fournisseurs/anthropic.js", `export const CACHE_PREFIXE = Object.freeze({ type: "ephemeral", ttl: "1h" });`,
    `export const CACHE_PREFIXE = Object.freeze({ type: "ephemeral" });`],
  "secret des compagnons perdu aux Veillées": ["contexte.js", `filter(l => !/jet_compagnon|compagnon_ajouter/.test(l))`, `filter(l => !/jet_compagnon|compagnon_ajouter|JAMAIS un secret/.test(l))`],
  "écriture d'une heure au prix de cinq minutes": ["constantes.js", "+ uneHeure + (usage.sortie", "+ (usage.sortie"],
  "écritures d'une heure ignorées": ["fournisseurs/anthropic.js", "...(uneHeure ? { cacheEcriture1h: uneHeure } : {})", ""],
  "journal sans borne": ["moteur.js", "if (this.journalAppels.length > JOURNAL_APPELS_MAX) this.journalAppels.shift();", ""]
};

test("mutations : chaque règle cassée fait échouer la batterie", async () => {
  const echappes = [];
  for (const [nom, [fichier, avant, apres]] of Object.entries(MUTATIONS)) {
    const dossier = mkdtempSync(join(tmpdir(), "mjia-cout-"));
    try {
      cpSync(join(RACINE, "scripts"), join(dossier, "scripts"), { recursive: true });
      cpSync(join(RACINE, "vendor"), join(dossier, "vendor"), { recursive: true });
      cpSync(join(RACINE, "lang"), join(dossier, "lang"), { recursive: true });
      writeFileSync(join(dossier, "package.json"), JSON.stringify({ type: "module" }));
      const chemin = join(dossier, "scripts", fichier);
      const source = readFileSync(chemin, "utf8");
      assert.ok(source.includes(avant), `${nom} : texte à muter introuvable`);
      writeFileSync(chemin, source.replace(avant, apres));
      const echecs = await batterie(await charger(dossier));
      if (!echecs.length) echappes.push(nom);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }
  assert.deepEqual(echappes, [], `mutations non détectées : ${echappes.join(", ")}`);
  assert.deepEqual(await batterie(await charger(RACINE)), [], "le moteur tel qu'il est passe la batterie");
});
