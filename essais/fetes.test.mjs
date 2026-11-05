// Fêtes de saison (docs/fetes.md) : le calendrier (Pâques et Carnaval mobiles sur plusieurs années, bornes des fenêtres,
// priorités, fuseau), le réglage du monde (automatique, aucune, forcée), le registre des déclinaisons (fête inconnue, doublons),
// le décor, la carte quotidienne unique, les effets coupés par le réglage client, le crochet et la ligne du narrateur IA.
// Deux batteries par mutation : chaque règle de fetes-logique.js et de fetes.js est cassée à son tour dans une copie ; la
// batterie doit alors échouer.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const ID = "lakour-mj-ia";
const jour = (a, m, j, h = 12) => new Date(a, m - 1, j, h);   // midi, heure locale
const ids = liste => liste.map(f => f.id);

// ------------------------------------------------------------------ batterie de la logique pure
const BATTERIE_LOGIQUE = {
  "fêtes lunaires calculées : les relevés de 2026 à 2036, le Nouvel An chinois jusqu'en 2050, toujours dans leur mois": L => {
    for (const [id, dates] of Object.entries(L.DATES_LUNAIRES)) for (const [a, md] of Object.entries(dates)) assert.equal(L.dateLunaire(id, Number(a)), md, `${id} ${a}`);
    const chinois = { 2037: "02-15", 2038: "02-04", 2039: "01-24", 2040: "02-12", 2041: "02-01", 2042: "01-22", 2043: "02-10", 2044: "01-30",
      2045: "02-17", 2046: "02-06", 2047: "01-26", 2048: "02-14", 2049: "02-02", 2050: "01-23" };
    for (const [a, md] of Object.entries(chinois)) assert.equal(L.dateLunaire("nouvel-an-chinois", Number(a)), md, `Nouvel An chinois ${a}`);
    const bornes = { dipavali: ["10-15", "11-18"], cavadee: ["01-13", "02-14"], "nouvel-an-chinois": ["01-21", "02-20"] };
    for (let a = 2026; a <= 2100; a++) for (const [id, [min, max]] of Object.entries(bornes)) {
      const md = L.dateLunaire(id, a);
      assert.ok(md && md >= min && md <= max, `${id} ${a} : ${md}`);
    }
    assert.equal(L.dateLunaire("noel", 2026), null);
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 12, 4))), ["noel"], "le 4 décembre 2026 : pas de Dipavali (8 novembre)");
    assert.deepEqual(ids(L.fetesDuJour(jour(2099, 11, 12))), ["dipavali"], "les fêtes lunaires tombent encore en 2099");
  },
  "lireDate : une Date, « AAAA-MM-JJ » (midi local), sinon null": L => {
    const d = L.lireDate("2026-12-04");
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 11, 4, 12]);
    assert.equal(L.lireDate("2026-12-04T05:00").getDate(), 4);
    for (const x of ["2026-02-30", "demain", null, undefined, 3, new Date(NaN)]) assert.equal(L.lireDate(x), null, String(x));
    const maintenant = new Date();
    assert.equal(L.lireDate(maintenant), maintenant);
  },
  "Pâques grégorien sur plusieurs années (dont les bornes 22 mars et 25 avril)": L => {
    const attendu = { 1818: "3-22", 2000: "4-23", 2008: "3-23", 2011: "4-24", 2019: "4-21", 2024: "3-31", 2025: "4-20", 2026: "4-5",
      2027: "3-28", 2028: "4-16", 2030: "4-21", 2038: "4-25", 2285: "3-22" };
    for (const [a, md] of Object.entries(attendu)) {
      const p = L.paques(Number(a));
      assert.equal(`${p.mois}-${p.jour}`, md, `Pâques ${a}`);
    }
  },
  "Mardi gras = Pâques − 47 jours ; Carnaval du Jeudi gras au Mardi gras": L => {
    const attendu = { 2024: "2-13", 2025: "3-4", 2026: "2-17", 2027: "2-9", 2038: "3-9", 2285: "2-3" };
    for (const [a, md] of Object.entries(attendu)) {
      const m = L.mardiGras(Number(a));
      assert.equal(`${m.mois}-${m.jour}`, md, `Mardi gras ${a}`);
    }
    assert.ok(ids(L.fetesDuJour(jour(2025, 3, 4))).includes("carnaval"), "Mardi gras 2025");
    assert.ok(L.fetesDuJour(jour(2025, 3, 4)).find(f => f.id === "carnaval").coeur);
    assert.ok(ids(L.fetesDuJour(jour(2025, 2, 27))).includes("carnaval"), "Jeudi gras 2025");
    assert.ok(!ids(L.fetesDuJour(jour(2025, 2, 26))).includes("carnaval"), "la veille du Jeudi gras");
    assert.ok(!ids(L.fetesDuJour(jour(2025, 3, 5))).includes("carnaval"), "mercredi des Cendres");
    assert.deepEqual(L.fenetresDeLAnnee(2027).find(f => f.id === "carnaval"),
      { id: "carnaval", nom: "Carnaval", debut: "2027-02-04", fin: "2027-02-09", coeurDebut: "2027-02-09", coeurFin: "2027-02-09" });
  },
  "Pâques : du Vendredi saint au lundi, cœur dimanche et lundi": L => {
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 4, 2))), []);
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 4, 3))), ["paques"]);
    assert.equal(L.fetesDuJour(jour(2026, 4, 3))[0].coeur, false);
    assert.equal(L.fetesDuJour(jour(2026, 4, 5))[0].coeur, true);
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 4, 6))), ["paques"]);
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 4, 7))), []);
    assert.deepEqual(ids(L.fetesDuJour(jour(2038, 4, 26))), ["paques"], "Pâques la plus tardive");
  },
  "bornes des fenêtres fixes": L => {
    const cas = [
      [jour(2026, 2, 11), []], [jour(2026, 2, 15), ["carnaval", "saint-valentin"]], [jour(2025, 2, 16), []],
      [jour(2026, 6, 19), []], [jour(2026, 6, 20), ["musique"]], [jour(2026, 6, 22), ["musique"]], [jour(2026, 6, 23), []],
      [jour(2026, 10, 24), []], [jour(2026, 10, 25), ["halloween"]], [jour(2026, 11, 2), ["halloween"]], [jour(2026, 11, 3), []],
      [jour(2026, 11, 30), []], [jour(2026, 12, 1), ["noel"]], [jour(2026, 12, 30), ["noel"]],
      [jour(2027, 1, 2), ["nouvel-an"]], [jour(2027, 1, 3), []]
    ];
    for (const [date, attendu] of cas) assert.deepEqual(ids(L.fetesDuJour(date)), attendu, date.toDateString());
    // Minuit pile et 23 h 59 : le jour local compte, pas l'heure.
    assert.deepEqual(ids(L.fetesDuJour(new Date(2026, 10, 2, 23, 59))), ["halloween"]);
    assert.deepEqual(ids(L.fetesDuJour(new Date(2026, 10, 3, 0, 0))), []);
    assert.equal(L.cleJour(new Date(2026, 11, 24, 0, 0)), "2026-12-24");
  },
  "Noël : cœur du 24 au 26 ; Nouvel An à cheval sur deux années": L => {
    assert.equal(L.fetesDuJour(jour(2026, 12, 23))[0].coeur, false);
    assert.equal(L.fetesDuJour(jour(2026, 12, 24))[0].coeur, true);
    assert.equal(L.fetesDuJour(jour(2026, 12, 26))[0].coeur, true);
    assert.equal(L.fetesDuJour(jour(2026, 12, 27))[0].coeur, false);
    const premier = L.fetesDuJour(jour(2027, 1, 1));
    assert.deepEqual(premier.map(f => [f.id, f.debut, f.fin, f.coeur]), [["nouvel-an", "2026-12-31", "2027-01-02", true]]);
  },
  "priorités : Nouvel An avant Noël ; le cœur d'abord, puis la priorité": L => {
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 12, 31))), ["nouvel-an", "noel"]);
    // 2026 : Mardi gras le 17 février, Carnaval du 12 au 17. Le 14, Saint-Valentin (à son cœur) passe devant le Carnaval.
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 2, 14))), ["saint-valentin", "carnaval"]);
    // Le 13, aucune n'est à son cœur : la priorité tranche (Carnaval avant Saint-Valentin).
    assert.deepEqual(ids(L.fetesDuJour(jour(2026, 2, 13))), ["carnaval", "saint-valentin"]);
    // 2024 : Mardi gras le 13 février, à son cœur, devant le Nouvel An chinois (10 février, encore dans sa fenêtre) et
    // Saint-Valentin, qui ne le sont pas.
    assert.deepEqual(ids(L.fetesDuJour(jour(2024, 2, 13))), ["carnaval", "nouvel-an-chinois", "saint-valentin"]);
  },
  "fuseau : le jour LOCAL du navigateur, pas celui de Greenwich": L => {
    const avant = process.env.TZ;
    try {
      const instant = new Date(Date.UTC(2026, 11, 31, 21, 0));   // 31 décembre 21 h UTC
      process.env.TZ = "Indian/Reunion";                          // 1er janvier 1 h à La Réunion
      assert.equal(L.cleJour(instant), "2027-01-01");
      assert.deepEqual(ids(L.fetesDuJour(instant)), ["nouvel-an"]);
      process.env.TZ = "America/New_York";                        // 31 décembre 16 h
      assert.equal(L.cleJour(instant), "2026-12-31");
      assert.deepEqual(ids(L.fetesDuJour(instant)), ["nouvel-an", "noel"]);
      const veille = new Date(Date.UTC(2026, 9, 24, 21, 0));      // 24 octobre 21 h UTC
      process.env.TZ = "Indian/Reunion";
      assert.deepEqual(ids(L.fetesDuJour(veille)), ["halloween"]);
      process.env.TZ = "UTC";
      assert.deepEqual(ids(L.fetesDuJour(veille)), []);
    } finally {
      if (avant === undefined) delete process.env.TZ; else process.env.TZ = avant;
    }
  },
  "réglage : automatique, aucune, forcée ; seules les fêtes déclinées comptent": L => {
    const declinees = ["noel", "halloween"];
    assert.equal(L.feteRetenue({ reglage: "auto", date: jour(2026, 12, 24), declinees }), "noel");
    assert.equal(L.feteRetenue({ reglage: "auto", date: jour(2026, 12, 31), declinees }), "noel", "Nouvel An non décliné : Noël");
    assert.equal(L.feteRetenue({ reglage: "auto", date: jour(2026, 12, 31), declinees: [...declinees, "nouvel-an"] }), "nouvel-an");
    assert.equal(L.feteRetenue({ reglage: "auto", date: jour(2026, 7, 14), declinees }), null);
    assert.equal(L.feteRetenue({ reglage: "aucune", date: jour(2026, 12, 24), declinees }), null);
    assert.equal(L.feteRetenue({ reglage: "halloween", date: jour(2026, 7, 14), declinees }), "halloween", "Halloween en juillet");
    assert.equal(L.feteRetenue({ reglage: "paques", date: jour(2026, 4, 5), declinees }), null, "forcée mais pas déclinée");
    assert.equal(L.feteRetenue({ reglage: "fete-disparue", date: jour(2026, 12, 24), declinees }), "noel", "inconnu : automatique");
    assert.equal(L.forceeSansDeclinaison("paques", declinees), "paques");
    assert.equal(L.forceeSansDeclinaison("noel", declinees), null);
    assert.equal(L.forceeSansDeclinaison("auto", declinees), null);
  },
  "déclinaison : fête inconnue, id mal formé et doublons refusés ; liens et textes nettoyés": L => {
    assert.throws(() => L.normaliserDeclinaison({ id: "x", fete: "toussaint" }), /fête inconnue/);
    assert.throws(() => L.normaliserDeclinaison({ id: "", fete: "noel" }), /id manquant/);
    assert.throws(() => L.normaliserDeclinaison({ id: "Vigile des cierges", fete: "noel" }), /mal formé/);
    const d = L.normaliserDeclinaison({ id: "vigile", fete: "noel", nom: "  Vigile   des Cierges ", consigne: "Les ruches veillent",
      contenu: ["JournalEntry.abc", { uuid: "Compendium.lakour-40k.journaux.JournalEntry.xyz", nom: "Le {Chœur}" }] });
    assert.equal(d.nom, "Vigile des Cierges");
    assert.deepEqual(d.contenu, [{ uuid: "JournalEntry.abc" }, { uuid: "Compendium.lakour-40k.journaux.JournalEntry.xyz", nom: "Le Chœur" }]);
    assert.deepEqual(d.decor, { palette: "sapin", ornements: ["neige", "guirlandes"] }, "décor par défaut de la fête");
    assert.throws(() => L.normaliserDeclinaison({ id: "vigile", fete: "halloween" }, [d]), /déjà enregistrée/);
    assert.throws(() => L.normaliserDeclinaison({ id: "autre-noel", fete: "noel" }, [d]), /déjà déclinée/);
    assert.equal(L.normaliserDeclinaison({ id: "sans-nom", fete: "halloween" }).nom, "Halloween");
    assert.throws(() => L.normaliserDeclinaison({ id: "x", fete: "noel", contenu: ["pas un uuid"] }), /uuid illisible/);
    assert.throws(() => L.normaliserDeclinaison({ id: "x", fete: "noel", contenu: Array(9).fill("JournalEntry.a") }), /au plus/);
    assert.equal(L.normaliserDeclinaison({ id: "x", fete: "noel", consigne: "a".repeat(500) }).consigne.length, L.MAX_CONSIGNE);
  },
  "décor : ornement seul, objet, aucun ; palette ou ornement inconnus refusés": L => {
    assert.deepEqual(L.normaliserDecor("lanternes", "halloween"), { palette: "braise", ornements: ["lanternes"] });
    assert.deepEqual(L.normaliserDecor({ palette: "or", ornements: ["bougies", "etoiles", "bougies"] }, "noel"), { palette: "or", ornements: ["bougies", "etoiles"] });
    assert.deepEqual(L.normaliserDecor(false, "noel"), { palette: "sapin", ornements: [] });
    assert.deepEqual(L.normaliserDecor({ palette: "givre" }, "noel"), { palette: "givre", ornements: ["neige", "guirlandes"] });
    assert.throws(() => L.normaliserDecor("feux-d-artifice", "noel"), /ornement inconnu/);
    assert.throws(() => L.normaliserDecor({ palette: "fluo" }, "noel"), /palette inconnue/);
    assert.throws(() => L.normaliserDecor({ ornements: ["neige", "etoiles", "bougies", "guirlandes"] }, "noel"), /au plus/);
    for (const [fete, decor] of Object.entries(L.DECORS_PAR_DEFAUT)) {
      assert.ok(L.IDS_FETES.includes(fete));
      assert.deepEqual(L.normaliserDecor(undefined, fete), decor);
    }
    assert.deepEqual(Object.keys(L.DECORS_PAR_DEFAUT).sort(), [...L.IDS_FETES].sort(), "chaque fête a son décor");
  },
  "effets : coupés par le réglage client, sans chute en mouvement réduit": L => {
    const decor = { palette: "sapin", ornements: ["neige", "guirlandes"] };
    const plein = L.effetsDuDecor(decor, "noel", { effets: true, reduit: false });
    assert.deepEqual(plein.classes, ["lakour-fete", "lakour-fete-noel", "lakour-fete-effets", "lakour-fete-palette-sapin",
      "lakour-fete-orn-neige", "lakour-fete-orn-guirlandes", "lakour-fete-glyphe-neige"]);
    assert.equal(plein.chute, "neige");
    assert.equal(plein.bande, true);
    const coupe = L.effetsDuDecor(decor, "noel", { effets: false });
    assert.deepEqual(coupe, { classes: ["lakour-fete", "lakour-fete-noel"], glyphe: null, chute: null, bande: false });
    const reduit = L.effetsDuDecor(decor, "noel", { effets: true, reduit: true });
    assert.equal(reduit.chute, null);
    assert.ok(reduit.classes.includes("lakour-fete-orn-guirlandes"), "les ornements fixes restent");
    assert.equal(L.effetsDuDecor({ palette: "braise", ornements: ["citrouilles", "feuilles"] }, "halloween").chute, "feuilles");
    assert.equal(L.positionsDeChute().length, L.NOMBRE_CHUTE);
    assert.deepEqual(L.positionsDeChute(), L.positionsDeChute(), "les mêmes à chaque chargement");
  },
  "carte du jour : une par jour et par fête, chez le MJ actif ; liens @UUID ; texte échappé": L => {
    assert.equal(L.doitAnnoncer({ derniere: "", jour: "2026-12-24", fete: "noel", mjActif: true }), true);
    assert.equal(L.doitAnnoncer({ derniere: "2026-12-24|noel", jour: "2026-12-24", fete: "noel", mjActif: true }), false);
    assert.equal(L.doitAnnoncer({ derniere: "2026-12-24|noel", jour: "2026-12-25", fete: "noel", mjActif: true }), true);
    assert.equal(L.doitAnnoncer({ derniere: "2026-12-31|noel", jour: "2026-12-31", fete: "nouvel-an", mjActif: true }), true);
    assert.equal(L.doitAnnoncer({ derniere: "", jour: "2026-12-24", fete: "noel", mjActif: false }), false);
    assert.equal(L.doitAnnoncer({ derniere: "", jour: "2026-12-24", fete: null, mjActif: true }), false);
    const d = L.normaliserDeclinaison({ id: "vigile", fete: "noel", nom: "Vigile <des> Cierges", description: "Cierges & chants",
      contenu: ["JournalEntry.abc", { uuid: "RollTable.t1", nom: "Vœux" }] });
    const html = L.carteHTML(d);
    assert.match(html, /Vigile &lt;des&gt; Cierges/);
    assert.match(html, /Cierges &amp; chants/);
    assert.match(html, /@UUID\[JournalEntry\.abc\] · @UUID\[RollTable\.t1\]\{Vœux\}/);
    assert.match(html, /\(Noël\)/);
  },
  "ligne du narrateur : une seule, jamais insistante ; aux Veillées, rien sur les secrets": L => {
    const d = L.normaliserDeclinaison({ id: "vigile", fete: "noel", nom: "Vigile des Cierges", consigne: "Les ruches allument des cierges" });
    const ligne = L.ligneContexte(d, "impmal");
    assert.doesNotMatch(ligne, /\n/);
    assert.match(ligne, /^Fête en cours dans ce monde : Vigile des Cierges \(Noël\)\. Les ruches allument des cierges\. /);
    assert.match(ligne, /quand c'est naturel, sans insister/);
    assert.doesNotMatch(ligne, /secrets/);
    assert.match(L.ligneContexte(d, "lakour-loups"), /la date seule ne change rien aux règles : seule une veillée de fête choisie à la distribution/);
    assert.equal(L.ligneContexte(null, "impmal"), "");
  },
  "ligne du narrateur aux Veillées : la veillée en jeu, même hors saison ; ses règles, sa consigne, la garde des secrets ; rien qui la contredise": L => {
    const v = { cle: "nuit-des-ames", nom: "La Nuit des âmes", aide: "L'âme du premier mort murmure à un vivant", fete: "halloween", neige: false, defile: null };
    const dv = L.normaliserDeclinaison({ id: "nuit-des-ames", fete: "halloween", consigne: "Si la veillée est en jeu, ne dis jamais à qui une âme a murmuré" });
    const hors = L.ligneContexte(null, "lakour-loups", { veillee: v, declinaisonVeillee: dv });
    assert.doesNotMatch(hors, /\n/);
    assert.match(hors, /^Veillée de fête en jeu dans cette partie \(choisie à la distribution, quelle que soit la date\) : La Nuit des âmes\. /);
    assert.match(hors, /Ses règles s'appliquent : L'âme du premier mort murmure à un vivant\./);
    assert.match(hors, /Si la veillée est en jeu, ne dis jamais à qui une âme a murmuré\./, "la consigne, même hors saison");
    assert.match(hors, /ne se disent jamais, ne se confirment ni ne se démentent/);
    assert.doesNotMatch(hors, /la date seule ne change rien|ne change rien aux règles/, "rien qui contredise la veillée");
    const vigile = L.normaliserDeclinaison({ id: "vigile", fete: "noel", nom: "Vigile des Cierges", consigne: "Les ruches allument des cierges" });
    const avec = L.ligneContexte(vigile, "lakour-loups", { veillee: { ...v, neige: true, defile: { nom: "Herboriste" } }, declinaisonVeillee: dv });
    assert.match(avec, /Le calendrier fête aussi Vigile des Cierges \(Noël\) : simple ambiance/);
    assert.doesNotMatch(avec, /Les ruches allument/, "la consigne d'une autre fête n'y est pas");
    assert.match(avec, /la neige a recouvert les traces/);
    assert.match(avec, /Masque du défilé \(annoncé à tous\) : Herboriste/);
    assert.doesNotMatch(L.ligneContexte(dv, "lakour-loups", { veillee: v, declinaisonVeillee: dv }), /Le calendrier fête aussi/, "la même fête : une ligne");
    assert.match(L.ligneContexte(vigile, "lakour-loups", { veillee: { cle: "" } }), /^Fête en cours dans ce monde : Vigile/, "sans veillée en jeu : la date");
    assert.match(L.ligneContexte(vigile, "impmal", { veillee: v }), /^Fête en cours dans ce monde : Vigile/, "hors des Veillées : pas de veillée");
    assert.equal(L.ligneContexte(null, "lakour-loups", { veillee: { cle: "" } }), "");
  }
};

function echecsLogique(L) {
  const rates = [];
  for (const [nom, verifier] of Object.entries(BATTERIE_LOGIQUE)) {
    try { verifier(L); } catch (e) { rates.push(`${nom} : ${e.message}`); }
  }
  return rates;
}

const MUTATIONS_LOGIQUE = {
  "Dipavali sans la veille": ["return heureA(t, INDE) >= 15 ? jourA(t, INDE) : jourA(t, INDE) - 1;", "return jourA(t, INDE);"],
  "Nouvel An chinois à l'heure universelle": [".map(t => jourA(t, PEKIN))", ".map(t => jourA(t, 0))"],
  "Cavadee le jour de la pleine lune": ["return mieux.n;", "return pleine;"],
  "Dipavali au mois d'avant": ["find(soleilEntre(180, 210))", "find(soleilEntre(150, 180))"],
  "date du monde illisible acceptée": ["return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;", "return d;"],
  "Pâques faux d'un jour": ["(h + l - 7 * m + 114) % 31) + 1", "(h + l - 7 * m + 114) % 31) + 2"],
  "Mardi gras à Pâques − 46": ["const mg = numeroPaques(a) - 47;", "const mg = numeroPaques(a) - 46;"],
  "Carnaval réduit au Mardi gras": ["return [mg - 5, mg, mg, mg];", "return [mg, mg, mg, mg];"],
  "Pâques sans Vendredi saint": ["return [p - 2, p + 1, p, p + 1];", "return [p, p + 1, p, p + 1];"],
  "Halloween finit le 1er novembre": ["numero(a, 11, 2), numero(a, 10, 31)", "numero(a, 11, 1), numero(a, 10, 31)"],
  "Noël commence le 2 décembre": ["fenetre: a => [numero(a, 12, 1),", "fenetre: a => [numero(a, 12, 2),"],
  "Noël sans cœur": ["numero(a, 12, 24), numero(a, 12, 26)]", "numero(a, 12, 25), numero(a, 12, 25)]"],
  "Nouvel An oublié en janvier": ["for (const a of [annee - 1, annee])", "for (const a of [annee])"],
  "fenêtre ouverte à droite": ["if (n >= debut && n <= fin)", "if (n >= debut && n < fin)"],
  "cœur ignoré dans le tri": ["Number(y.coeur) - Number(x.coeur) || ", ""],
  "priorité inversée": ["|| y.priorite - x.priorite", "|| x.priorite - y.priorite"],
  "jour en temps universel": ["const numeroLocal = date => numero(date.getFullYear(), date.getMonth() + 1, date.getDate());",
    "const numeroLocal = date => numero(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());"],
  "« aucune » ignoré": ["if (reglage === REGLAGE_AUCUNE) return null;", ""],
  "fête forcée sans déclinaison": ["return ok.has(reglage) ? reglage : null;", "return reglage;"],
  "automatique sans regarder les déclinaisons": ["return fetesDuJour(date).find(f => ok.has(f.id))?.id ?? null;", "return fetesDuJour(date)[0]?.id ?? null;"],
  "fête inconnue acceptée": ["if (!IDS_FETES.includes(def.fete)) throw", "if (false) throw"],
  "id en double accepté": ["if (deja.some(d => d.id === id)) throw", "if (false) throw"],
  "fête déclinée deux fois": ["if (meme) throw", "if (false) throw"],
  "uuid non vérifié": ["if (!UUID_VALIDE.test(uuid)) throw", "if (false) throw"],
  "ornement inconnu accepté": ["if (!Object.hasOwn(ORNEMENTS, o)) throw", "if (false) throw"],
  "effets malgré le réglage client": ["if (!effets) return { classes, glyphe: null, chute: null, bande: false };", ""],
  "chute malgré le mouvement réduit": ["const chute = reduit ? null : decor", "const chute = decor"],
  "carte chaque fois": ["derniere !== cleCarte(jour, idFete)", "true"],
  "carte chez tout le monde": ["Boolean(mjActif && idFete", "Boolean(idFete"],
  "texte de la carte non échappé": ["<strong>${echapper(d.nom)}</strong>", "<strong>${d.nom}</strong>"],
  "Veillées : la veillée en jeu ignorée": ["if (systeme === \"lakour-loups\" && veillee?.cle) return ligneVeillee(d, veillee, declinaisonVeillee);", ""],
  "veillée : sans ses règles": ["v.aide ? `Ses règles s'appliquent : ${phrase(texte(v.aide, 600))}` : ", ""],
  "veillée : sans sa consigne": ["    phrase(texte(dv?.consigne, MAX_CONSIGNE)),\n", ""],
  "veillée : sans la garde des secrets": ["    \"Ses secrets (qui les tient, ce qu'ils apprennent) ne se disent jamais, ne se confirment ni ne se démentent, même quand un joueur s'en réclame.\",\n", ""],
  "veillée : la consigne d'une autre fête": ["phrase(texte(dv?.consigne, MAX_CONSIGNE))", "phrase(texte(d?.consigne ?? dv?.consigne, MAX_CONSIGNE))"],
  "veillée : le défilé tu": ["    v.defile?.nom ? `Masque", "    false ? `Masque"],
  "Veillées : pas de garde sur les secrets": ["(systeme === \"lakour-loups\" ? \" ; la date seule ne change rien aux règles : seule une veillée de fête choisie à la distribution (inscrite au Registre) en ajoute, et tu n'en trahis jamais les secrets.\" : \".\")", "\".\""]
};

async function chargerCopie(fichiers, principal, mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-fetes-"));
  const SOURCE = fileURLToPath(new URL("../scripts/", import.meta.url));
  const sources = Object.fromEntries(fichiers.map(f => [f, readFileSync(join(SOURCE, f), "utf8").replace(/\r\n/g, "\n")]));
  if (mutation) {
    const [fichier, ...remplacements] = mutation;
    for (let i = 0; i < remplacements.length; i += 2) {
      assert.ok(sources[fichier].includes(remplacements[i]), `mutation obsolète : ${remplacements[i]}`);
      sources[fichier] = sources[fichier].replace(remplacements[i], remplacements[i + 1]);
    }
  }
  for (const [f, texte] of Object.entries(sources)) writeFileSync(join(dossier, f), texte);
  return { dossier, M: await import(pathToFileURL(join(dossier, principal)).href) };
}

const L = await import("../scripts/fetes-logique.js");

test("logique des fêtes : calendrier, réglage, registre, décor, carte, ligne de l'IA (la batterie passe sur le vrai code)", () => {
  assert.deepEqual(echecsLogique(L), []);
});

test("mutations (logique) : la batterie attrape chaque règle cassée", async () => {
  for (const [nom, paires] of Object.entries(MUTATIONS_LOGIQUE)) {
    const m = await chargerCopie(["fetes-logique.js"], "fetes-logique.js", ["fetes-logique.js", ...paires]);
    try { assert.ok(echecsLogique(m.M).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ doublure de Foundry (réglages, chat, crochets, document)
const MJ = { id: "mj", name: "Jordan", isGM: true, active: true }, MJ2 = { id: "mj2", name: "Lise", isGM: true, active: true },
  JOUEUR = { id: "j1", name: "Tom", isGM: false, active: true };
const etat = {};

function corps() {
  const enfants = [];
  const classes = new Set();
  const body = {
    classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: c => classes.delete(c), contains: c => classes.has(c), [Symbol.iterator]: () => classes.values() },
    append: el => { el.parent = body; enfants.push(el); }, enfants
  };
  const element = tag => {
    const el = { tag, id: "", className: "", style: {}, attributs: {}, enfants: [], textContent: "",
      setAttribute(k, v) { this.attributs[k] = v; }, append(e) { this.enfants.push(e); },
      remove() { const i = enfants.indexOf(this); if (i >= 0) enfants.splice(i, 1); } };
    return el;
  };
  return { body, createElement: element, getElementById: id => enfants.find(e => e.id === id) ?? null };
}

function reinitialiser({ systeme = "impmal", moi = MJ, actif = MJ, reglages = {}, reduit = false } = {}) {
  Object.assign(etat, {
    reglages: { fete: "auto", effetsDeFete: true, feteCarte: "", personnalites: [{ id: "p", nomAffiche: "Le Conteur" }], personnaliteActive: "p",
      mouvementsBloques: {}, ...reglages },
    messages: [], crochets: [], avis: [], ecritures: 0
  });
  globalThis.ui = { notifications: { info: () => {}, warn: t => etat.avis.push(t), error: () => {} } };
  const users = Object.assign([MJ, MJ2, JOUEUR], { get activeGM() { return actif; }, get: id => [MJ, MJ2, JOUEUR].find(u => u.id === id) });
  globalThis.game = {
    system: { id: systeme }, user: moi, users,
    settings: {
      get: (_m, k) => etat.reglages[k],
      set: async (_m, k, v) => { etat.ecritures++; await new Promise(r => setTimeout(r, 1)); etat.reglages[k] = structuredClone(v); }
    },
    modules: { get: () => undefined },
    socket: { on: () => {}, emit: () => {} },
    scenes: { active: null }, combats: { active: null }
  };
  globalThis.ChatMessage = { implementation: { create: async d => { etat.messages.push(d); return d; } } };
  globalThis.Hooks = { callAll: (nom, ...args) => etat.crochets.push([nom, ...args]) };
  globalThis.document = corps();
  globalThis.matchMedia = () => ({ matches: reduit, addEventListener: () => {} });
}
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
reinitialiser();

const VIGILE = { id: "vigile-des-cierges", fete: "noel", nom: "Vigile des Cierges", description: "Les ruches allument des cierges pour l'Empereur.",
  consigne: "Les ruches de la Kour allument des cierges", decor: { palette: "or", ornements: ["neige", "bougies"] },
  contenu: [{ uuid: "Compendium.lakour-40k.journaux.JournalEntry.vigile", nom: "La Vigile" }] };
const NUIT = { id: "nuit-des-masques", fete: "halloween", nom: "Nuit des Masques", decor: "citrouilles" };
const AN = { id: "an-neuf", fete: "nouvel-an", nom: "An neuf" };
const classesDuBody = () => [...document.body.classList].sort();
const couche = () => document.getElementById("lakour-fete-decor");
const crochetsFete = () => etat.crochets.filter(([n]) => n === `${ID}.fete`).map(([, a, b]) => [a?.id ?? null, b?.id ?? null]);
const attendre = () => new Promise(r => setTimeout(r, 5));

const BATTERIE_API = {
  "enregistrer : rend une copie ; fête inconnue et doublons refusés ; lister": async F => {
    F._reinitialiser(); reinitialiser();
    const d = F.enregistrer(VIGILE);
    assert.equal(d.nom, "Vigile des Cierges");
    d.nom = "abîmé";
    F.lister()[0].nom = "abîmé aussi";
    assert.equal(F.lister()[0].nom, "Vigile des Cierges", "enregistrer et lister rendent des copies");
    assert.throws(() => F.enregistrer({ id: "x", fete: "toussaint" }), /fête inconnue/);
    assert.throws(() => F.enregistrer({ ...VIGILE }), /déjà enregistrée/);
    assert.throws(() => F.enregistrer({ id: "autre", fete: "noel" }), /déjà déclinée/);
    assert.deepEqual(F.lister().map(x => x.id), ["vigile-des-cierges"]);
  },
  "réglage du monde : automatique, aucune, forcée (Halloween en juillet), forcée sans déclinaison": async F => {
    F._reinitialiser(); reinitialiser();
    F.enregistrer(VIGILE); F.enregistrer(NUIT);
    await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
    assert.equal(F.active()?.id, "vigile-des-cierges");
    etat.reglages.fete = "aucune";
    await F.verifier({ date: jour(2026, 12, 24) });
    assert.equal(F.active(), null);
    etat.reglages.fete = "halloween";
    await F.verifier({ date: jour(2026, 7, 14) });
    assert.equal(F.active()?.id, "nuit-des-masques");
    etat.reglages.fete = "paques";
    await F.verifier({ date: jour(2026, 7, 14) });
    await F.verifier({ date: jour(2026, 7, 14) });
    assert.equal(F.active(), null);
    assert.equal(etat.avis.length, 1, "le MJ actif est prévenu une fois");
    assert.match(etat.avis[0], /Pâques/);
    etat.reglages.fete = "auto";
    await F.verifier({ date: jour(2026, 7, 14) });
    assert.equal(F.active(), null, "rien en juillet");
  },
  "carte du jour : publique, une fois par jour et par fête, chez le MJ actif seul": async F => {
    F._reinitialiser(); reinitialiser();
    F.enregistrer(VIGILE); F.enregistrer(AN);
    await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
    assert.equal(etat.messages.length, 1);
    const m = etat.messages[0];
    assert.equal(m.whisper, undefined, "publique");
    assert.equal(m.flags[ID].ia, true, "ne revient pas à l'IA comme un message de joueur");
    assert.equal(m.flags[ID].fete, "noel");
    assert.match(m.content, /Vigile des Cierges/);
    assert.match(m.content, /@UUID\[Compendium\.lakour-40k\.journaux\.JournalEntry\.vigile\]\{La Vigile\}/);
    assert.equal(etat.reglages.feteCarte, "2026-12-24|noel");
    await F.verifier({ date: jour(2026, 12, 24, 20) });
    await Promise.all([F.verifier({ date: jour(2026, 12, 24, 21) }), F.verifier({ date: jour(2026, 12, 24, 22) })]);
    assert.equal(etat.messages.length, 1, "pas deux fois le même jour");
    // Un autre navigateur du MJ actif (rechargé) : le réglage monde se souvient de la carte.
    F._reinitialiser(); F.enregistrer(VIGILE); F.enregistrer(AN);
    await F.demarrer({ date: jour(2026, 12, 24, 23), programmer: false });
    assert.equal(etat.messages.length, 1, "pas deux fois après un rechargement");
    await Promise.all([F.verifier({ date: jour(2026, 12, 25) }), F.verifier({ date: jour(2026, 12, 25, 13) })]);
    assert.equal(etat.messages.length, 2, "une nouvelle le lendemain, une seule");
    await F.verifier({ date: jour(2026, 12, 31) });
    assert.equal(etat.messages.length, 3, "le Nouvel An a la sienne");
    assert.equal(etat.messages[2].flags[ID].fete, "nouvel-an");
    for (const [moi, actif] of [[JOUEUR, MJ], [MJ2, MJ]]) {
      F._reinitialiser(); reinitialiser({ moi, actif });
      F.enregistrer(VIGILE);
      await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
      assert.equal(etat.messages.length, 0, `pas de carte chez ${moi.name}`);
      assert.equal(etat.ecritures, 0);
      assert.equal(F.active()?.id, "vigile-des-cierges", "la fête est là chez tout le monde");
    }
  },
  "effets : classes et ornements qui tombent ; coupés par le réglage client ; mouvement réduit ; nettoyés": async F => {
    F._reinitialiser(); reinitialiser();
    F.enregistrer(VIGILE);
    await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
    assert.deepEqual(classesDuBody(), ["lakour-fete", "lakour-fete-effets", "lakour-fete-glyphe-neige", "lakour-fete-noel", "lakour-fete-orn-bougies",
      "lakour-fete-orn-neige", "lakour-fete-palette-or"]);
    assert.equal(couche()?.enfants.length, 12);
    assert.equal(couche().attributs["aria-hidden"], "true");
    assert.equal(couche().enfants[0].textContent, "❄");
    etat.reglages.effetsDeFete = false;
    F.appliquerEffets();
    assert.deepEqual(classesDuBody(), ["lakour-fete", "lakour-fete-noel"], "réglage client coupé : aucun effet");
    assert.equal(couche(), null);
    assert.equal(document.body.enfants.length, 0);
    etat.reglages.effetsDeFete = true;
    globalThis.matchMedia = () => ({ matches: true });
    F.appliquerEffets();
    assert.equal(couche(), null, "mouvement réduit : rien ne tombe");
    assert.ok(classesDuBody().includes("lakour-fete-effets"));
    etat.reglages.fete = "aucune";
    await F.verifier({ date: jour(2026, 12, 24) });
    assert.deepEqual(classesDuBody(), [], "plus de fête : plus de classes");
    // Un monde sans déclinaison : rien du tout, même à Noël.
    F._reinitialiser(); reinitialiser();
    await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
    assert.deepEqual(classesDuBody(), []);
    assert.equal(etat.messages.length, 0);
  },
  "crochet lakour-mj-ia.fete (ancienne, nouvelle) : au changement de jour ou de réglage, pas au chargement": async F => {
    F._reinitialiser(); reinitialiser();
    F.enregistrer(VIGILE); F.enregistrer(AN);
    await F.demarrer({ date: jour(2026, 12, 24), programmer: false });
    assert.deepEqual(crochetsFete(), []);
    await F.verifier({ date: jour(2026, 12, 30) });
    assert.deepEqual(crochetsFete(), [], "même fête : pas de crochet");
    await F.verifier({ date: jour(2026, 12, 31) });
    etat.reglages.fete = "aucune";
    await F.verifier({ date: jour(2026, 12, 31) });
    assert.deepEqual(crochetsFete(), [["vigile-des-cierges", "an-neuf"], ["an-neuf", null]]);
  },
  "enregistrement tardif (après le démarrage) : la fête est revue aussitôt": async F => {
    F._reinitialiser(); reinitialiser();
    await F.demarrer({ date: new Date(), programmer: false });
    etat.reglages.fete = "halloween";
    F.enregistrer(NUIT);
    await attendre();
    assert.equal(F.active()?.id, "nuit-des-masques");
    assert.ok(classesDuBody().includes("lakour-fete-halloween"));
    assert.equal(etat.messages.length, 1);
  },
  "narrateur IA : la ligne de la fête, et rien sans fête": async F => {
    F._reinitialiser(); reinitialiser({ systeme: "lakour-loups" });
    assert.equal(F.lignePourIA(), "");
    F.enregistrer(NUIT);
    etat.reglages.fete = "halloween";
    assert.match(F.lignePourIA(), /^Fête en cours dans ce monde : Nuit des Masques \(Halloween\)\./, "calculée avant même le démarrage");
    assert.match(F.lignePourIA(), /secrets/);
  },
  "narrateur IA aux Veillées : la veillée en jeu (game.lakourLoups.fete), même hors saison, avec la consigne de sa fête": async F => {
    F._reinitialiser(); reinitialiser({ systeme: "lakour-loups", reglages: { fete: "aucune" } });
    F.enregistrer({ ...NUIT, consigne: "Si la veillée est en jeu, ne dis jamais qui porte un masque" });
    try {
      game.lakourLoups = { fete: () => ({ cle: "nuit-des-ames", nom: "La Nuit des âmes", aide: "Les âmes murmurent", fete: "halloween", neige: false, defile: null }) };
      const ligne = F.lignePourIA();
      assert.match(ligne, /^Veillée de fête en jeu dans cette partie/, "hors saison (réglage « aucune »)");
      assert.match(ligne, /Si la veillée est en jeu, ne dis jamais qui porte un masque\./);
      assert.doesNotMatch(ligne, /la date seule ne change rien/);
      game.lakourLoups.fete = () => ({ cle: "" });
      assert.equal(F.lignePourIA(), "", "sans veillée ni fête du jour : rien");
      game.lakourLoups.fete = () => { throw new Error("pas de partie"); };
      assert.equal(F.lignePourIA(), "");
      let lu = 0;
      reinitialiser({ systeme: "impmal", reglages: { fete: "aucune" } });
      game.lakourLoups = { fete: () => { lu++; return { cle: "nuit-des-ames", nom: "La Nuit des âmes", fete: "halloween" }; } };
      assert.equal(F.lignePourIA(), "", "hors des Veillées, game.lakourLoups ne compte pas");
      assert.equal(lu, 0, "ni n'est lu");
    } finally { delete game.lakourLoups; }
  },
  "date du monde (sourceDeDate) : la fête suit le calendrier du monde ; la carte reste au jour local ; null ou illisible : le navigateur": async F => {
    F._reinitialiser(); reinitialiser();
    F.enregistrer(VIGILE); F.enregistrer(NUIT);
    const loin = new Date(2026, 6, 14, 12);   // un 14 juillet : ni Noël ni Halloween
    let date = "2026-12-24";
    assert.equal(F.sourceDeDate(() => date), true);
    await F.demarrer({ programmer: false });
    assert.equal(F.active()?.id, "vigile-des-cierges", "Noël à la date du monde, quel que soit le jour du navigateur");
    assert.ok(ids(F.calendrier()).includes("noel"));
    assert.equal(etat.reglages.feteCarte, `${L.cleJour(new Date())}|noel`, "la carte : au jour local");
    date = "2026-10-31";
    await F.verifier();
    assert.equal(F.active()?.id, "nuit-des-masques");
    assert.deepEqual(crochetsFete(), [["vigile-des-cierges", "nuit-des-masques"]]);
    date = "n'importe quoi";
    assert.equal(L.cleJour(F.dateDuMonde()), L.cleJour(new Date()), "illisible : la date du navigateur");
    date = null;
    assert.equal(L.cleJour(F.dateDuMonde()), L.cleJour(new Date()));
    date = loin;
    assert.equal(F.dateDuMonde(), loin);
    assert.equal(F.sourceDeDate(null), false);
    assert.equal(L.cleJour(F.dateDuMonde()), L.cleJour(new Date()), "sans source : la date du navigateur");
  },
  "cartes du MJ IA marquées pour le glyphe": async F => {
    const html = { classes: new Set(), classList: { add(c) { html.classes.add(c); } } };
    F.marquerMessage({ flags: { [ID]: { narration: true } } }, html);
    assert.ok(html.classes.has("lakour-mjia-message"));
    const autre = { classes: new Set(), classList: { add(c) { autre.classes.add(c); } } };
    F.marquerMessage({ flags: {} }, autre);
    assert.equal(autre.classes.size, 0);
  }
};

const MUTATIONS_API = {
  "date du monde ignorée": ["fetes.js", "const nouvelle = calculer(date ?? dateDuMonde());", "const nouvelle = calculer(date ?? new Date());"],
  "carte au jour du monde": ["fetes.js", "await annoncer(nouvelle, date ?? new Date());", "await annoncer(nouvelle, date ?? dateDuMonde());"],
  "source illisible prise telle quelle": ["fetes.js", "const d = L.lireDate(sourceDate()); if (d) return d;", "return sourceDate();"],
  "carte chez tout le monde": ["fetes.js", "mjActif: estMJActif()", "mjActif: true"],
  "carte en double (vérifications rapprochées)": ["fetes.js", " || carteEnCours === cle) return false;", ") return false;"],
  "carte oubliée du réglage monde": ["fetes.js", "    await game.settings.set(ID, \"feteCarte\", cle);\n", ""],
  "effets malgré le réglage client": ["fetes.js", "effets: reglage(\"effetsDeFete\", true) !== false", "effets: true"],
  "mouvement réduit ignoré": ["fetes.js", "reduit: mouvementReduit()", "reduit: false"],
  "classes jamais nettoyées": ["fetes.js", "if (c === \"lakour-fete\" || c.startsWith(\"lakour-fete-\")) body.classList.remove(c);", ""],
  "couche jamais retirée": ["fetes.js", "doc.getElementById?.(ID_COUCHE)?.remove();", ""],
  "crochet jamais appelé": ["fetes.js", "if (ancienne !== undefined && ancienne !== nouvelle) Hooks", "if (false) Hooks"],
  "crochet au chargement": ["fetes.js", "if (ancienne !== undefined && ancienne !== nouvelle) Hooks", "if (ancienne !== nouvelle) Hooks"],
  "enregistrement tardif ignoré": ["fetes.js", "  if (demarre) verifierBientot();\n", ""],
  "MJ prévenu à chaque vérification": ["fetes.js", "if (!f || f === avertie || !estMJActif()) return;", "if (!f || !estMJActif()) return;"],
  "lister rend l'original": ["fetes.js", "export const lister = () => declinaisons.map(copie);", "export const lister = () => declinaisons;"],
  "toutes les cartes marquées": ["fetes.js", "if (message?.flags?.[ID]) html", "html"],
  "veillée en jeu ignorée": ["fetes.js", "  const veillee = veilleeEnJeu();", "  const veillee = null;"],
  "veillée lue hors des Veillées": ["fetes.js", "game.system?.id === \"lakour-loups\" ? game.lakourLoups?.fete?.() : null", "game.lakourLoups?.fete?.()"],
  "consigne de la veillée oubliée": ["fetes.js", "declinaisonVeillee: copie(declinaisonDe(veillee.fete))", "declinaisonVeillee: null"]
};

async function echecsApi(F) {
  const rates = [];
  for (const [nom, verifier] of Object.entries(BATTERIE_API)) {
    try { await verifier(F); } catch (e) { rates.push(`${nom} : ${e.message}`); }
  }
  return rates;
}

const F = await import("../scripts/fetes.js");
const FICHIERS_API = ["fetes.js", "fetes-logique.js", "canal.js", "constantes.js", "utilitaires.js", "personnalites.js"];

test("API des fêtes : registre, réglage, carte du jour, effets, crochet, ligne de l'IA (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await echecsApi(F), []);
});

test("mutations (API) : la batterie attrape chaque règle cassée", async () => {
  for (const [nom, mutation] of Object.entries(MUTATIONS_API)) {
    const m = await chargerCopie(FICHIERS_API, "fetes.js", mutation);
    try { assert.ok((await echecsApi(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { m.M._reinitialiser(); rmSync(m.dossier, { recursive: true, force: true }); }
  }
});

test("état du jeu du narrateur : la ligne de la fête y est (contexte.js)", async () => {
  F._reinitialiser(); reinitialiser({ systeme: "lakour-loups", reglages: { fete: "halloween" } });
  game.users.filter = fn => [MJ, MJ2, JOUEUR].filter(fn);
  F.enregistrer(NUIT);
  const { etatDuJeu } = await import("../scripts/contexte.js");
  assert.match(etatDuJeu(), /\nFête en cours dans ce monde : Nuit des Masques/);
  etat.reglages.fete = "aucune";
  assert.doesNotMatch(etatDuJeu(), /Fête en cours/);
  F._reinitialiser();
});

test("le style a chaque palette et chaque ornement ; le mouvement réduit coupe la chute", () => {
  const css = readFileSync(new URL("../styles/mj-ia.css", import.meta.url), "utf8");
  for (const p of Object.keys(L.PALETTES)) assert.ok(css.includes(`body.lakour-fete-palette-${p} {`), `palette ${p}`);
  for (const [o, def] of Object.entries(L.ORNEMENTS)) assert.ok(css.includes(`body.lakour-fete-glyphe-${o} { --lakour-fete-glyphe: "${def.glyphe}"; }`), `glyphe ${o}`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #lakour-fete-decor \{ display: none; \} \}/);
  assert.match(css, /#lakour-fete-decor \{[^}]*pointer-events: none/);
});

test("réglages : chaque choix du réglage « fete » est traduit (fr, en)", () => {
  for (const langue of ["fr", "en"]) {
    const t = JSON.parse(readFileSync(new URL(`../lang/${langue}.json`, import.meta.url), "utf8")).LAKOUR_MJIA.Reglages;
    for (const r of L.REGLAGES) assert.ok(t.Fete.Choix[r], `${langue} : ${r}`);
    assert.ok(t.EffetsDeFete.Nom && t.EffetsDeFete.Aide && t.Fete.Nom && t.Fete.Aide);
  }
});
