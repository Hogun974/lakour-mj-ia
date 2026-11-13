// Fénoir (système lakour-survie) : le secret du monde réel. L'état du jeu donné au narrateur sépare « [connu des joueurs] » et
// « [secret MJ] » (le réel des régions proches, les hordes à 2 régions ou moins, le cyclone, les menaces, le hors-champ) et reste
// court ; un compagnon IA ne reçoit JAMAIS le réel (sa vue ne lit que l'état public : api.monde() n'est même pas appelé) ; les
// textes signalés au narrateur hors de ses outils (temps avancé par le MJ, palier de visibilité) n'en portent rien. Plus : la ligne
// des fêtes, la remise à zéro d'un monde Fénoir, les appels radio d'une table, le pilote automatique.
// Chaque règle est rejouée sur des copies mutées du moteur.  Doublures, aucun réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installerFenoir, MARQUEURS_SECRETS } from "./doublures/foundry-survie.mjs";

installerFenoir();
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));

async function charger(racine = SCRIPTS) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [L, a, o, c, ctx, f, r, t, p] = await Promise.all(["survie-logique.js", "adaptateurs.js", "outils.js", "compagnons-jeu.js", "contexte.js",
    "fetes-logique.js", "reinitialiser.js", "tirages.js", "pilote.js"].map(m));
  return { L, a, o, c, ctx, f, r, t, p };
}

const coupe = (texte, marque) => { const i = texte.indexOf(marque); return i < 0 ? [texte, ""] : [texte.slice(0, i), texte.slice(i)]; };
const fuites = texte => MARQUEURS_SECRETS.filter(m => texte.includes(m));

const VERIFICATIONS = {
  "contexte : le connu ne porte rien du réel ; le réel est sous l'en-tête [secret MJ] ; pas de horde lointaine"(M) {
    installerFenoir();
    const lignes = M.L.contexteSurvie(game.lakourSurvie, { acteur: id => game.actors.get(id) });
    const texte = lignes.join("\n");
    assert.ok(texte.startsWith(M.L.CONNU), "commence par le connu");
    const [connu, secret] = coupe(texte, M.L.SECRET);
    assert.deepEqual(fuites(connu), [], "fuite dans le connu");
    for (const m of ["HORDE-SECRETE", "CYCLONE-SECRET", "faction-secrete", "MENACE-SECRETE", "crue-secrete", "JOURNAL-SECRET"]) assert.ok(secret.includes(m), `${m} absent du secret`);
    assert.ok(!texte.includes("HORDE-LOINTAINE"), "horde à 3 régions");
    assert.ok(!texte.includes("JOURNAL-SECRET-ANCIEN"), "hors-champ trop ancien");
    for (const m of ["jour 3", "phase panique", "Collège des Hauts", "eau 12", "tiennent 4 j d'eau", "net : eau -2", "Lucie Hoarau (égratigné 1, fatigue 2, INFECTÉ 2/6)",
      "Eddy Payet (compagnon IA)", "Tantine Josette (inquiète)", "Pré-alerte cyclonique", "Saint-Paul (vu, aujourd'hui)", "Le Port et La Possession (par radio, il y a 2 j)",
      "Hauts de l'Ouest : rien de connu"]) assert.ok(connu.includes(m), `${m} absent du connu :\n${connu}`);
    assert.match(secret, /Saint-Paul : infestation 2,4\/5 ; reste à piller : eau 30, nourriture 50/);
    assert.match(secret, /Réseaux à Saint-Paul : électricité tombe au jour 9, eau tombe au jour 12, carburant tient, téléphone tombé \(jour 2\)/);
    assert.match(secret, /horde HORDE-SECRETE \(taille 3\/5\) à Le Port et La Possession \(à 1 région\), cap sur Saint-Paul/);
    assert.ok(texte.split(/\s+/).length < 450, `trop long : ${texte.split(/\s+/).length} mots`);
  },
  "contexte dans l'état du jeu (contexte.js) : le même découpage"(M) {
    installerFenoir();
    const texte = M.ctx.etatDuJeu();
    const [avant, secret] = coupe(texte, M.L.SECRET);
    assert.ok(avant.includes(M.L.CONNU) && avant.includes("Fénoir — jour 3"));
    assert.deepEqual(fuites(avant), []);
    assert.ok(secret.includes("HORDE-SECRETE"));
  },
  "contexte : coffre fermé -> aucun réel, consigne de ne pas deviner ; partie pas démarrée -> survie_demarrer"(M) {
    installerFenoir({ mondeOuvert: false });
    const ferme = M.L.contexteSurvie(game.lakourSurvie, { acteur: id => game.actors.get(id) }).join("\n");
    assert.deepEqual(fuites(ferme), []);
    assert.match(ferme, /Monde réel indisponible/);
    const { cadre } = installerFenoir();
    cadre.etat.demarree = false;
    assert.match(M.L.contexteSurvie(game.lakourSurvie).join("\n"), /pas encore démarrée.*survie_demarrer/);
  },
  "vue d'un compagnon IA : l'état public seulement, jamais monde() (ni même appelé)"(M) {
    installerFenoir();
    let lu = 0;
    const monde = game.lakourSurvie.monde;
    game.lakourSurvie.monde = () => { lu++; return monde(); };
    const v = M.c.vueAventure(game.actors.get("s2"), { messages: [] });
    const texte = JSON.stringify(v);
    assert.deepEqual(fuites(texte), [], "fuite dans la vue du compagnon");
    assert.equal(lu, 0, "monde() appelé pour un compagnon");
    for (const m of ["Fénoir, jour 3", "abri « Collège des Hauts »", "Réserves de l'abri : eau 12", "Pré-alerte cyclonique", "Saint-Paul (vu, aujourd'hui)"]) {
      assert.ok(v.scene.includes(m), `${m} absent de la vue :\n${v.scene}`);
    }
    assert.match(v.fiche, /Eddy Payet \[compagnon IA\]/);
  },
  "textes signalés au narrateur hors outils : temps avancé (faits publics seuls), palier de visibilité"(M) {
    installerFenoir();
    const t = M.L.texteAvanceSurvie(game.lakourSurvie.quand(), [{ public: true, texte: "Une sirène." }, { public: false, texte: "FAIT-SECRET" }]);
    assert.match(t, /jour 3, après-midi .* Une sirène\./);
    assert.deepEqual(fuites(t), []);
    assert.match(M.L.textePalierSurvie({ palier: "Repérés", table: "Visibilité — Repérés" }), /palier de visibilité « Repérés ».*EN SECRET \(lancer_des, secret true/);
    assert.equal(M.L.momentTexte(1), "après-midi", "moment numérique (quart % 4)");
  },
  "difficultés : ardue -> extreme, facile -> normale +1 dé"(M) {
    assert.deepEqual(M.L.convertirDifficulte("ardue"), { difficulte: "extreme", bonus: 0 });
    assert.deepEqual(M.L.convertirDifficulte("facile"), { difficulte: "normale", bonus: 1 });
  },
  async "outils : les faits cachés d'une exploration et le hors-champ ancien ne vont pas au connu"(M) {
    installerFenoir();
    const explorer = await M.o.OUTILS.find(x => x.nom === "survie_explorer").executer({ region: "le-port", membres: [], quarts: 1 });
    const [connu, secret] = coupe(explorer.contenu, M.L.SECRET);
    assert.deepEqual(fuites(connu), []);
    assert.ok(secret.includes("FAIT-SECRET") && secret.includes("RENCONTRE-SECRETE"));
    const avancer = await M.o.OUTILS.find(x => x.nom === "survie_avancer").executer({ quarts: 1, raison: "" });
    assert.ok(!avancer.contenu.includes("JOURNAL-SECRET-ANCIEN"));
    assert.deepEqual(fuites(coupe(avancer.contenu, M.L.SECRET)[0]), []);
  },
  "fêtes : la ligne de Fénoir (monde d'après ; la date seule ne change rien, la fête choisie a son gain et son coût, jamais magiques)"(M) {
    const l = M.f.ligneContexte({ id: "noel-austral", fete: "noel", nom: "Noël austral", consigne: "" }, "lakour-survie");
    assert.match(l, /Noël austral \(Noël\)/);
    assert.match(l, /monde d'après/);
    assert.match(l, /La date seule ne change rien/);
    assert.match(l, /aucune fête n'a d'effet magique/);
    assert.ok(M.f.IDS_FETES.includes("liberte") && M.f.IDS_FETES.includes("fete-nationale"));
    assert.deepEqual(M.f.fetesDuJour(new Date(2026, 11, 20)).map(x => x.id), ["liberte", "noel"], "le 20 décembre avant Noël");
  },
  "remise à zéro : en Fénoir, partie, coffre, monde en clair et monde client ; aux Veillées, la partie"(M) {
    const tous = () => true;
    assert.deepEqual(M.r.reglagesAReinitialiser("lakour-survie", tous), [["lakour-survie", "partie"], ["lakour-survie", "coffre"],
      ["lakour-survie", "mondeClair"], ["lakour-survie", "monde"]]);
    assert.deepEqual(M.r.reglagesAReinitialiser("lakour-survie", c => c !== "lakour-survie.monde").length, 3, "seulement ceux enregistrés");
    assert.deepEqual(M.r.reglagesAReinitialiser("lakour-loups", tous), [["lakour-loups", "partie"]]);
    assert.deepEqual(M.r.reglagesAReinitialiser("impmal", tous), []);
  },
  "lancer_table : un appel radio de Fénoir (flags.lakour-fenoir.appel) lu en clair"(M) {
    assert.equal(M.t.donneesDuResultat({ appel: { type: "escorte", faction: "planteurs", reputation: 5, recompense: { nourriture: 6, graines: 2 } } }),
      "appel (escorte) : récompense nourriture 6, graines 2, +5 de réputation auprès de planteurs (horloge rep-planteurs)");
  },
  "pilote automatique : à Fénoir, la consigne de scène parle du temps (outils survie_*)"(M) {
    assert.match(M.p.CONSIGNE_PILOTE_SURVIE, /survie_avancer/);
  },
  "nouveautés (§12 à §15) : vérité des rumeurs, vraies couleurs, préjugés, cyclone vécu au secret seulement ; un compagnon n'en reçoit rien"(M) {
    installerFenoir({ nouveautes: true });
    const texte = M.L.contexteSurvie(game.lakourSurvie, { acteur: id => game.actors.get(id) }).join("\n");
    const [connu, secret] = coupe(texte, M.L.SECRET);
    assert.deepEqual(fuites(connu), [], "fuite dans le connu");
    assert.doesNotMatch(connu, /Vraie couleur|Couleur réelle|Cyclone vécu|Vérité des rumeurs|son chef veut/);
    for (const m of ["AUTEUR-SECRET", "PREJUGE-SECRET", "Vraie couleur à la porte", "Couleur réelle du groupe", "Cyclone vécu", "son chef veut"]) assert.ok(secret.includes(m), `${m} absent du secret`);
    const a = game.actors.get("s2");
    Object.assign(a.system, { regard: "vivre", sensMoral: -4, prejuges: [{ cible: "zoreils", poids: 2, dit: "PREJUGE-SECRET" }] });
    const vue = JSON.stringify(M.c.vueAventure(a, { messages: [] }));
    assert.deepEqual(fuites(vue), [], "fuite dans la vue du compagnon");
    assert.ok(!vue.includes("sens moral") && !vue.includes(M.L.SECRET), "le compagnon lit son sens moral");
    assert.match(M.a.adaptateur().resumer(a, { secret: true }), /\[secret MJ\] sens moral -4/);
  },
  async "outils des nouveautés : vraie couleur, vérité des rumeurs, sens moral, préjugés au secret seulement"(M) {
    installerFenoir({ nouveautes: true });
    const o = nom => M.o.OUTILS.find(x => x.nom === nom);
    const textes = [
      (await o("survie_marche").executer({ action: "lire", region: "", stade: "" })).contenu,
      (await o("survie_porte").executer({ action: "frapper", visiteur: "", profil: "dur", vote: "", circonstances: false })).contenu,
      (await o("survie_acte_moral").executer({ personnages: ["Lucie"], acte: "colporter", delta: 0, circonstances: false, temoins: true, vote: "vote1", journal: false })).contenu,
      (await o("survie_troquer").executer({ action: "evaluer", biens: [{ ressource: "eau", n: 1 }], pnj: "Madame Chane", cibles: ["zoreils"], faction: "", marche: "", accepter: false, prejuge: "" })).contenu
    ];
    for (const t of textes) {
      const [connu, secret] = coupe(t, M.L.SECRET);
      assert.deepEqual(fuites(connu), [], t);
      assert.doesNotMatch(connu, /sens moral|vraie couleur|FAUSSE|Première confiance/i, t);
      assert.ok(secret, `rien au secret :\n${t}`);
    }
  }
};

const MUTATIONS = [
  ["survie-logique.js", "...(secret.length ? [ENTETE_SECRET, ...secret] : [])", "...secret", "secret non marqué dans le contexte"],
  ["survie-logique.js", "regionsADistance(contenu, ici, 2)", "regionsADistance(contenu, ici, 9)", "hordes lointaines"],
  ["survie-logique.js", "      ...regions.map(r => `· ${ligneRenseignement(nomRegion(r), etat.renseignements?.[r], jour, nomRegion)}`));",
    "      ...regions.map(r => `· ${ligneReel(nomRegion(r), monde?.regions?.[r], nomRegion)}`));", "réel dans les renseignements"],
  ["survie-logique.js", "filter(e => entier(e.jour) >= entier(depuisJour))", "filter(() => true)", "hors-champ trop ancien"],
  ["survie-logique.js", "  ardue: { difficulte: \"extreme\", bonus: 0 },", "  ardue: { difficulte: \"difficile\", bonus: 0 },", "ardue = extrême"],
  ["survie-logique.js", "  facile: { difficulte: \"normale\", bonus: 1 },", "  facile: { difficulte: \"normale\", bonus: 0 },", "facile = +1 dé"],
  ["survie-logique.js", "  const publics = (faits ?? []).filter(f => f?.public !== false)", "  const publics = (faits ?? []).filter(Boolean)", "faits cachés signalés"],
  ["compagnons-jeu.js", "import { vuePubliqueDepuisApi } from \"./survie-logique.js\";",
    "import { contexteSurvie as vuePubliqueDepuisApi } from \"./survie-logique.js\";", "compagnon : contexte du MJ"],
  ["compagnons-jeu.js", "    ...(game.system?.id === \"lakour-survie\" && game.lakourSurvie", "    ...(false", "compagnon sans vue de Fénoir"],
  ["outils-survie.js", "faits.filter(f => f?.public !== false).map(ligne)", "faits.map(ligne)", "faits cachés au connu"],
  ["outils-survie.js", "depuisJour: avant })", "depuisJour: 0 })", "avancer : hors-champ ancien"],
  ["contexte.js", "  if (game.lakourSurvie) lignes.push(", "  if (false) lignes.push(", "état du jeu sans Fénoir"],
  ["fetes-logique.js", "  if (systeme === \"lakour-survie\") return ligneSurvie(d);\n", "", "ligne des fêtes de Fénoir"],
  ["reinitialiser.js", "export const REGLAGES_SURVIE = [\"partie\", \"coffre\", \"mondeClair\", \"monde\"];", "export const REGLAGES_SURVIE = [\"partie\", \"mondeClair\", \"monde\"];", "coffre remis à zéro"],
  ["tirages.js", "  const { contrat, appel, ...autres } = drapeaux;", "  const { contrat, ...autres } = drapeaux; const appel = null;", "appel radio lu"],
  // Les nouveautés (§12 à §15).
  ["survie-logique.js", "    if (verites.length) secret.push(`· Vérité des rumeurs", "    if (verites.length) connu.push(`· Vérité des rumeurs", "vérité des rumeurs au connu"],
  ["survie-logique.js", "    if (vrais.length) secret.push(`· Vraie couleur à la porte", "    if (vrais.length) connu.push(`· Vraie couleur à la porte", "vraie couleur au connu"],
  ["survie-logique.js", "  for (const x of nouveautes) connu.push(...x.connu);", "  for (const x of nouveautes) connu.push(...x.connu, ...x.secret);", "secrets des nouveautés au connu"],
  ["survie-logique.js", "    secret ? ligneSecreteSurvivant(s, nomContenu) : \"\"", "    ligneSecreteSurvivant(s, nomContenu)", "ligne secrète dans tout résumé"],
  ["compagnons-jeu.js", "fiche: [sys.resumer(acteur), ", "fiche: [sys.resumer(acteur, { secret: true }), ", "compagnon : résumé du narrateur"],
  ["outils-survie.js", "    secret: vrai ? [`Sa vraie couleur", "    connu2: 0, secret: [], connu: vrai ? [`Sa vraie couleur", "porte : vraie couleur au connu"],
  ["outils-survie.js", "N'A PAS SUIVI\"} le vote.` : \"\"], secret: lignesSens(r) }) };", "N'A PAS SUIVI\"} le vote.` : \"\", ...lignesSens(r)] }) };", "acte moral : sens au connu"]
];

const RACINE = fileURLToPath(new URL("../", import.meta.url));
async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "mjia-survie-mutant-"));
  for (const d of ["scripts", "vendor"]) cpSync(join(RACINE, d), join(dossier, d), { recursive: true });
  const chemin = join(dossier, "scripts", fichier);
  const texte = readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
  assert.ok(texte.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
  writeFileSync(chemin, texte.replace(avant, apres));
  try { return await charger(join(dossier, "scripts")); } finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push(`${nom} : ${e.message}`); }
  }
  return liste;
}

test("secret de Fénoir : le moteur d'origine passe toute la batterie", async () => {
  assert.deepEqual(await echecs(await charger()), []);
});

test("secret de Fénoir : chaque règle cassée est détectée", async () => {
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
