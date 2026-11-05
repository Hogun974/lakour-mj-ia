// Horloges, jauges et réputations (40k, Warcraft) : bornes, seuils, paliers, horloge pleine, résumé pour l'IA, fenêtre des
// joueurs ; l'API des modules des mondes (seul le MJ actif écrit, assurer ne remplace jamais) et l'outil « horloge » (carte au
// chat, retour à l'IA). Deux batteries par mutation : chaque règle de horloges-logique.js et de horloges.js est cassée à son
// tour dans une copie ; la batterie doit alors échouer.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

// ------------------------------------------------------------------ doublure de Foundry (réglages, chat, MJ actif)
const ID = "lakour-mj-ia";
const MJ = { id: "mj", name: "Jordan", isGM: true, active: true }, MJ2 = { id: "mj2", name: "Lise", isGM: true, active: true },
  JOUEUR = { id: "j1", name: "Tom", isGM: false, active: false };
const etat = {};
function reinitialiser({ systeme = "impmal", moi = MJ, actif = MJ } = {}) {
  Object.assign(etat, {
    reglages: { horloges: [], personnalites: [{ id: "p", nomAffiche: "Le Conteur" }], personnaliteActive: "p" },
    messages: [], crochets: [], signaux: [], emissions: [], avis: [], ecritures: 0
  });
  globalThis.ui = { notifications: { info: t => etat.avis.push(t), warn: () => {}, error: () => {} } };
  const users = Object.assign([MJ, MJ2, JOUEUR], { get activeGM() { return actif; }, get: id => [MJ, MJ2, JOUEUR].find(u => u.id === id) });
  globalThis.game = {
    system: { id: systeme }, user: moi, users,
    settings: {
      get: (_m, k) => etat.reglages[k],
      // Comme le vrai réglage (aller-retour au serveur), la valeur n'est lue qu'après un délai.
      set: async (_m, k, v) => { etat.ecritures++; await new Promise(r => setTimeout(r, 1)); etat.reglages[k] = structuredClone(v); }
    },
    modules: { get: id => (id === ID ? { api: { moteur: { signaler: t => etat.signaux.push(t) } } } : undefined) },
    socket: { on: () => {}, emit: (canal, message, options) => etat.emissions.push({ canal, message, options }) }
  };
  globalThis.ChatMessage = { implementation: { create: async d => { etat.messages.push(d); return d; } } };
  globalThis.Hooks = { callAll: (nom, donnees) => etat.crochets.push([nom, donnees]) };
}
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
reinitialiser();

const L = await import("../scripts/horloges-logique.js");
const H = await import("../scripts/horloges.js");
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { CONSIGNE_HORLOGES } = await import("../scripts/contexte.js");
const outilHorloge = args => OUTILS.find(o => o.nom === "horloge").executer({
  action: "lister", nom: "", type: "horloge", valeur: 0, max: 0, faction: "", notes: "", paliers: [], visible: false, ...args
});

// ------------------------------------------------------------------ logique pure
const horloge = (valeur, max = 6) => L.normaliser({ nom: "Rituel du Chœur", type: "horloge", valeur, max, notes: "Le Héraut se manifeste." });
const exposition = valeur => L.normaliser({ id: "exposition", nom: "Exposition", type: "jauge", max: 10, valeur,
  paliers: [{ nom: "Recherchés", min: 7 }, { nom: "Remarqués", min: 4 }, { nom: "Traqués", min: 10 }] });
const horde = valeur => L.normaliser({ nom: "Horde", type: "reputation", faction: "Horde", valeur });

function batterieLogique(L) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  const h = (valeur, max = 6) => L.normaliser({ nom: "Rituel du Chœur", type: "horloge", valeur, max, notes: "Le Héraut se manifeste." });
  const j = valeur => L.normaliser({ id: "exposition", nom: "Exposition", type: "jauge", max: 10, valeur,
    paliers: [{ nom: "Recherchés", min: 7 }, { nom: "Remarqués", min: 4 }, { nom: "Traqués", min: 10 }] });
  const r = (valeur, max = 100) => L.normaliser({ nom: "Horde", type: "reputation", faction: "Horde", valeur, max });
  verifier("segments bornés 4 à 12", () => {
    assert.equal(h(0, 2).max, 4);
    assert.equal(h(0, 20).max, 12);
    assert.equal(h(0, 0).max, L.SEGMENTS_DEFAUT);
  });
  verifier("valeur de départ bornée", () => { assert.equal(h(9, 6).valeur, 6); assert.equal(h(-3, 6).valeur, 0); });
  verifier("avancer borné", () => { assert.equal(L.avancer(h(5), 3).element.valeur, 6); assert.equal(L.avancer(h(1), -5).element.valeur, 0); });
  verifier("l'horloge sonne en se remplissant", () => assert.deepEqual(L.avancer(h(5), 1).evenements, [{ type: "sonne" }]));
  verifier("une horloge pleine ne sonne pas deux fois", () => assert.deepEqual(L.avancer(h(6), 1).evenements, []));
  verifier("seuil franchi en montant, au point exact", () => {
    assert.deepEqual(L.avancer(j(3), 1).evenements, [{ type: "seuil", nom: "Remarqués", min: 4, sens: "monte" }]);
  });
  verifier("seuil repassé en descendant", () => {
    assert.deepEqual(L.avancer(j(7), -1).evenements, [{ type: "seuil", nom: "Recherchés", min: 7, sens: "descend" }]);
  });
  verifier("plusieurs seuils d'un coup, dans l'ordre", () => assert.deepEqual(L.avancer(j(2), 6).evenements.map(e => e.nom), ["Remarqués", "Recherchés"]));
  verifier("jauge pleine sans doublon avec un seuil au maximum", () => {
    assert.deepEqual(L.avancer(j(9), 1).evenements, [{ type: "seuil", nom: "Traqués", min: 10, sens: "monte" }]);
    const sans = L.normaliser({ nom: "Alerte", type: "jauge", max: 5, valeur: 4 });
    assert.deepEqual(L.avancer(sans, 1).evenements, [{ type: "pleine" }]);
  });
  verifier("seuils triés", () => assert.deepEqual(j(0).paliers.map(p => p.min), [4, 7, 10]));
  verifier("jauge sous le premier seuil : aucun", () => { assert.equal(L.palierDe(j(3)), null); assert.equal(L.palierDe(j(8)).nom, "Recherchés"); });
  verifier("paliers de réputation documentés", () => {
    const attendus = [[-100, "Haï"], [-51, "Haï"], [-50, "Hostile"], [-21, "Hostile"], [-20, "Inamical"], [-6, "Inamical"], [-5, "Neutre"],
      [5, "Neutre"], [6, "Amical"], [20, "Amical"], [21, "Honoré"], [50, "Honoré"], [51, "Révéré"], [80, "Révéré"], [81, "Exalté"], [100, "Exalté"]];
    for (const [v, nom] of attendus) assert.equal(L.palierDe(r(v)).nom, nom, `${v}`);
  });
  verifier("réputation négative possible", () => assert.equal(L.avancer(r(0), -30).element.valeur, -30));
  verifier("sous le premier palier : le premier", () => assert.equal(L.palierDe(r(-150, 200)).nom, "Haï"));
  verifier("changement de palier signalé une fois", () => {
    assert.deepEqual(L.avancer(r(4), 20).evenements, [{ type: "palier", avant: "Neutre", apres: "Honoré", sens: "monte" }]);
    assert.deepEqual(L.avancer(r(10), 5).evenements, []);
  });
  verifier("identifiant unique et lisible", () => {
    assert.equal(L.idDepuisNom("Rituel du Chœur"), "rituel-du-choeur");
    assert.equal(L.idDepuisNom("Rituel", ["rituel", "rituel-2"]), "rituel-3");
  });
  verifier("trouver par nom, casse et accents ignorés", () => {
    const liste = [{ id: "x1", nom: "Réputation Éclat" }, { id: "rituel", nom: "Rituel" }];
    assert.equal(L.trouver(liste, "reputation eclat")?.id, "x1");
    assert.equal(L.trouver(liste, "rituel")?.id, "rituel");
    assert.equal(L.trouver(liste, "rien"), null);
    assert.equal(L.trouver([{ id: "horloge-0123456789abcdef", nom: "Rituel du Chœur" }], "rituel du choeur")?.nom, "Rituel du Chœur", "id au hasard : par le nom, œ écrit oe");
  });
  verifier("une réputation par sa faction : rep-<faction>, ou le champ faction", () => {
    const reps = [L.normaliser({ id: "rep-horde", nom: "Horde (Le Carrefour)", type: "reputation", faction: "horde" }),
      L.normaliser({ id: "estime-kirin", nom: "Estime", type: "reputation", faction: "Kirin Tor" }),
      L.normaliser({ id: "rep-rituel", nom: "Rituel", type: "horloge" })];
    assert.equal(L.trouver(reps, "Horde")?.id, "rep-horde");
    const cartel = L.normaliser({ id: "rep-cartel-gentepression", nom: "Le Cartel", type: "reputation", faction: "" });
    assert.equal(L.trouver([cartel], "Cartel Gentepression")?.id, "rep-cartel-gentepression", "par l'identifiant rep-<faction>");
    assert.equal(L.trouver(reps, "kirin tor")?.id, "estime-kirin");
    assert.equal(L.trouver(reps, "rituel"), reps[2], "par son nom, pas comme réputation");
    assert.equal(L.trouver(reps.slice(2), "rituel-2"), null);
  });
  verifier("résumé borné", () => {
    const liste = Array.from({ length: 12 }, (_, i) => L.normaliser({ nom: `H${i}`, type: "horloge" }));
    const lignes = L.resumerPourIA(liste);
    assert.equal(lignes.length, L.MAX_RESUME + 1);
    assert.match(lignes.at(-1), /et 4 autre/);
  });
  verifier("les joueurs ne voient que le visible, sans les notes", () => {
    const liste = [{ ...h(2), visible: true }, { ...h(1), id: "secret", visible: false }];
    assert.deepEqual(L.vuePourFenetre(liste).map(v => v.id), ["rituel-du-choeur"]);
    assert.equal(L.vuePourFenetre(liste)[0].notes, "");
    assert.equal(L.vuePourFenetre(liste, { mj: true }).length, 2);
    assert.equal(L.vuePourFenetre(liste, { mj: true })[0].notes, "Le Héraut se manifeste.");
  });
  verifier("camembert : autant de secteurs pleins que la valeur", () => {
    const svg = L.camembertSVG(2, 6);
    assert.equal(svg.match(/class="plein"/g).length, 2);
    assert.equal(svg.match(/class="vide"/g).length, 4);
  });
  verifier("pas d'horloges aux Veillées", () => {
    assert.equal(L.horlogesDisponibles("lakour-loups"), false);
    assert.ok(L.horlogesDisponibles("impmal") && L.horlogesDisponibles("dnd5e"));
  });
  verifier("l'IA reçoit les notes et la consigne", () => {
    const { element, evenements } = L.avancer(h(5), 1);
    const t = L.texteEvenementsPourIA(element, evenements);
    assert.match(t, /sonne/);
    assert.match(t, /Notes : Le Héraut se manifeste\./);
    assert.match(t, /conséquence/);
  });
  return echecs;
}

test("logique : bornes, seuils, paliers, horloge pleine, résumé, fenêtre (la batterie passe sur le vrai code)", () => {
  assert.deepEqual(batterieLogique(L), []);
});

test("textes : chat sans notes, résumé lisible pour l'IA", () => {
  const { element, evenements } = L.avancer(horloge(5), 1);
  assert.equal(L.texteEvenement(element, evenements[0]), "L'horloge « Rituel du Chœur » est pleine (6/6) : elle sonne !");
  assert.doesNotMatch(L.texteEvenement(element, evenements[0]), /Héraut/, "les notes du MJ restent secrètes");
  assert.equal(L.ligneResume(exposition(5)), "Jauge « Exposition » [exposition] : 5/10 — seuil « Remarqués » atteint ; prochain « Recherchés » à 7, cachée aux joueurs");
  assert.equal(L.ligneResume({ ...horde(12), visible: true }), "Réputation « Horde » [horde] (faction Horde) : +12, Amical ; Honoré à +21");
  const p = L.avancer(horde(4), 20);
  assert.equal(L.texteEvenement(p.element, p.evenements[0]), "Réputation auprès de Horde : Neutre → Honoré (+24).");
  assert.throws(() => L.normaliser({}), /besoin d'un nom/);
});

const MUTATIONS_LOGIQUE = {
  "segments sans bornes": ["borner(entierOu(max, SEGMENTS_DEFAUT) || SEGMENTS_DEFAUT, SEGMENTS_MIN, SEGMENTS_MAX)", "(entierOu(max, SEGMENTS_DEFAUT) || SEGMENTS_DEFAUT)"],
  "valeur de départ non bornée": ["el.valeur = borner(entierOu(def.valeur, 0), b.min, b.max);", "el.valeur = entierOu(def.valeur, 0);"],
  "avancée non bornée": ["const apres = borner(entierOu(nouvelle, avant), b.min, b.max);", "const apres = entierOu(nouvelle, avant);"],
  "l'horloge sonne à chaque avancée": ["if (avant < el.max && apres >= el.max) evenements.push({ type: \"sonne\" });", "if (apres >= el.max) evenements.push({ type: \"sonne\" });"],
  "l'horloge ne sonne qu'au-delà du plein": ["if (avant < el.max && apres >= el.max) evenements.push({ type: \"sonne\" });", "if (avant < el.max && apres > el.max) evenements.push({ type: \"sonne\" });"],
  "seuil atteint mais pas franchi": ["if (avant < s.min && apres >= s.min)", "if (avant < s.min && apres > s.min)"],
  "seuil descendant ignoré": ["else if (apres < s.min && avant >= s.min) evenements.push(", "else if (false) evenements.push("],
  "jauge pleine en double": ["!evenements.some(e => e.sens === \"monte\" && e.min >= el.max)", "true"],
  "seuils non triés": [".sort((a, b) => a.min - b.min);", ";"],
  "réputation sous le premier palier : aucun": ["let atteint = el.type === \"reputation\" ? el.paliers[0] : null;", "let atteint = null;"],
  "palier : son premier point exclu": ["for (const p of el.paliers) if (valeur >= p.min) atteint = p;", "for (const p of el.paliers) if (valeur > p.min) atteint = p;"],
  "palier Honoré décalé": ["{ nom: \"Honoré\", min: 21 }", "{ nom: \"Honoré\", min: 20 }"],
  "changement de palier jamais signalé": ["if (p1 !== p2) evenements.push(", "if (false) evenements.push("],
  "réputation bornée à zéro": ["({ min: el.type === \"reputation\" ? -el.max : 0, max: el.max })", "({ min: 0, max: el.max })"],
  "identifiant en double": ["for (let i = 2; ids.has(id); i++)", "for (let i = 2; false; i++)"],
  "recherche sensible aux accents": ["const pli = s => String(s ?? \"\").normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\").toLowerCase().trim();",
    "const pli = s => String(s ?? \"\").toLowerCase().trim();",
    "    ?? liste.find(e => idDepuisNom(e.nom) === idDepuisNom(r))", "    ?? null"],
  "un nom écrit autrement (ligature) : introuvable": ["    ?? liste.find(e => idDepuisNom(e.nom) === idDepuisNom(r))", "    ?? null"],
  "résumé non borné": ["tries.slice(0, max)", "tries"],
  "les joueurs voient tout": ["filter(el => mj || el.visible)", "filter(el => true)"],
  "notes montrées aux joueurs": ["notes: mj ? el.notes : \"\"", "notes: el.notes"],
  "camembert : un secteur de trop": ["i < valeur ? \"plein\"", "i <= valeur ? \"plein\""],
  "horloges aux Veillées": ["systeme => systeme !== \"lakour-loups\"", "systeme => true"],
  "notes absentes du texte de l'IA": ["if (el.notes) lignes.push(", "if (false) lignes.push("],
  "réputation introuvable par rep-<faction>": ["?? liste.find(e => e.type === \"reputation\" && e.id === `rep-${idDepuisNom(r)}`)", ""],
  "réputation introuvable par sa faction": ["?? liste.find(e => e.type === \"reputation\" && e.faction && pli(e.faction) === pli(r))", ""]
};

async function chargerCopie(fichiers, principal, mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-horloges-"));
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

test("mutations (logique) : la batterie attrape chaque règle cassée", async () => {
  for (const [nom, paires] of Object.entries(MUTATIONS_LOGIQUE)) {
    const m = await chargerCopie(["horloges-logique.js"], "horloges-logique.js", ["horloges-logique.js", ...paires]);
    try { assert.ok(batterieLogique(m.M).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ API des modules des mondes
const BATTERIE_API = {
  "assurer crée, puis ne remplace jamais": async H => {
    reinitialiser();
    const a = await H.assurer({ id: "exposition", nom: "Exposition", type: "jauge", max: 10, visible: true, paliers: [{ nom: "Remarqués", min: 4 }] });
    assert.equal(a.valeur, 0);
    await H.avancer("exposition", 3);
    const b = await H.assurer({ id: "exposition", nom: "Autre", type: "horloge", max: 4 });
    assert.equal(b.nom, "Exposition");
    assert.equal(b.valeur, 3);
    assert.equal(H.lister().length, 1);
    await H.assurer({ nom: "Rituel", type: "horloge" });
    await H.assurer({ nom: "rituel", type: "horloge", max: 8 });
    assert.equal(H.lister().length, 2, "sans id : retrouvé par son nom, jamais doublé");
  },
  "seul le MJ actif écrit": async H => {
    reinitialiser({ moi: MJ2, actif: MJ });
    const el = await H.assurer({ id: "rituel", nom: "Rituel", type: "horloge" });
    assert.equal(el.id, "rituel", "l'élément est rendu");
    assert.equal(etat.ecritures, 0);
    etat.reglages.horloges = [el];
    assert.equal(await H.avancer("rituel"), null);
    assert.equal(await H.retirer("rituel"), null);
    assert.equal(etat.ecritures, 0);
    reinitialiser({ moi: JOUEUR, actif: MJ });
    await H.assurer({ id: "rituel", nom: "Rituel" });
    assert.equal(etat.ecritures, 0);
  },
  "avancer : n vaut 1 par défaut, palier lu": async H => {
    reinitialiser();
    await H.assurer({ id: "horde", nom: "Horde", type: "reputation", faction: "Horde", valeur: 5 });
    assert.equal(H.palier("horde"), "Neutre");
    const r = await H.avancer("horde");
    assert.equal(r.element.valeur, 6);
    assert.equal(H.palier("horde"), "Amical");
    assert.equal(r.evenements[0].type, "palier");
    assert.equal(H.palier("inconnu"), null);
  },
  "deux avancées rapides ne s'écrasent pas": async H => {
    reinitialiser();
    await H.assurer({ id: "rituel", nom: "Rituel", type: "horloge", max: 8 });
    await Promise.all([H.avancer("rituel"), H.avancer("rituel"), H.avancer("rituel", 2)]);
    assert.equal(H.lister()[0].valeur, 4);
  },
  "lister rend des copies": async H => {
    reinitialiser();
    await H.assurer({ id: "rituel", nom: "Rituel" });
    H.lister()[0].valeur = 99;
    assert.equal(H.lister()[0].valeur, 0);
  },
  "horloge pleine : carte au chat et IA prévenue (hors outil)": async H => {
    reinitialiser();
    await H.assurer({ id: "rituel", nom: "Rituel", type: "horloge", max: 4, valeur: 3, visible: true, notes: "Le Héraut se manifeste." });
    await H.avancer("rituel");
    assert.equal(etat.messages.length, 1);
    assert.equal(etat.messages[0].whisper, undefined, "visible : carte publique");
    assert.match(etat.messages[0].content, /elle sonne/);
    assert.doesNotMatch(etat.messages[0].content, /Héraut/, "notes secrètes");
    assert.equal(etat.messages[0].flags[ID].ia, true, "la carte ne revient pas à l'IA comme un message de joueur");
    assert.equal(etat.signaux.length, 1);
    assert.match(etat.signaux[0], /Héraut/);
    assert.ok(etat.crochets.some(([n]) => n === `${ID}.horloge`));
  },
  // Un message chuchoté pourrait parvenir à tous les navigateurs : pas de carte au chat pour un élément caché.
  "élément caché : pas de carte ; le MJ actif prévenu ici, les autres MJ par le canal, à eux seuls": async H => {
    reinitialiser();
    await H.assurer({ id: "rituel", nom: "Rituel", type: "horloge", max: 4, valeur: 3 });
    await H.avancer("rituel");
    assert.equal(etat.messages.length, 0);
    assert.match(etat.avis.join(" "), /Rituel.*sonne/);
    assert.deepEqual(etat.emissions.filter(e => e.message.type === "horloges.avis").map(e => e.options?.recipients), [["mj2"]]);
  },
  "l'outil reçoit les événements dans sa réponse, sans signal en double": async H => {
    reinitialiser();
    await H.assurer({ id: "rituel", nom: "Rituel", type: "horloge", max: 4, valeur: 3 });
    const r = await H.avancer("rituel", 1, { source: "outil" });
    assert.match(r.texte, /sonne/);
    assert.equal(etat.signaux.length, 0);
  },
  "un geste d'un autre MJ part au MJ actif": async H => {
    reinitialiser({ moi: MJ2, actif: MJ });
    H.geste({ action: "avancer", id: "rituel", n: 1 });
    assert.deepEqual(etat.emissions.map(e => [e.message.type, e.options?.recipients]), [["horloges.geste", ["mj"]]]);
  }
};

const MUTATIONS_API = {
  "assurer remplace l'existant": ["horloges.js", "if (existant) return copie(existant);", "", "if (deja) return copie(deja);", ""],
  "assurer sans id : doublons": ["horloges.js", "  const nom = plier(def?.nom);", "  const nom = \"\";"],
  "tout le monde écrit": ["horloges.js", "if (!estMJActif()) return Promise.resolve(null);\n  return enFile(async () => {\n    const liste = lireHorloges();\n    const el = L.trouver(liste, ref);\n    if (!el) return null;\n    const { element",
    "return enFile(async () => {\n    const liste = lireHorloges();\n    const el = L.trouver(liste, ref);\n    if (!el) return null;\n    const { element"],
  "avancées en parallèle sans file": ["coffre.js", "  const suite = file.then(async () => {\n    await ouvrirDansFile();\n    return fn();\n  });",
    "  const suite = (async () => {\n    await ouvrirDansFile();\n    return fn();\n  })();"],
  "lister rend l'original": ["secrets-logique.js", "  const liste = structuredClone(Array.isArray(clair) ? clair : []);", "  const liste = Array.isArray(clair) ? clair : [];",
    "  for (const el of structuredClone(coffre)) {", "  for (const el of coffre) {"],
  "carte au chat pour un élément caché": ["horloges.js", "  if (!el.visible) {\n    const texte", "  if (false) {\n    const texte"],
  "les autres MJ jamais prévenus": ["horloges.js", "    if (autres.length) envoyer({ type: \"horloges.avis\", texte }, autres);\n", ""],
  "l'IA prévenue en double par l'outil": ["horloges.js", "if (source !== \"outil\") game.modules", "if (true) game.modules"],
  "l'IA jamais prévenue": ["horloges.js", "if (source !== \"outil\") game.modules", "if (false) game.modules"],
  "geste d'un autre MJ perdu": ["horloges.js", "return versMJ({ type: \"horloges.geste\", ...message });", "return null;"]
};

async function echecsApi(H) {
  const rates = [];
  for (const [nom, verifier] of Object.entries(BATTERIE_API)) {
    try { await verifier(H); } catch (e) { rates.push(`${nom} : ${e.message}`); }
  }
  return rates;
}

const FICHIERS_API = ["horloges.js", "horloges-logique.js", "recherche-nom.js", "canal.js", "constantes.js", "registre-monde.js", "coffre.js", "fils.js", "utilitaires.js",
  "coffre-logique.js", "secrets-logique.js", "personnalites.js"];
test("API : assurer, avancer, lister, palier ; seul le MJ actif écrit (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await echecsApi(H), []);
});

test("mutations (API) : la batterie attrape chaque règle cassée", async () => {
  for (const [nom, mutation] of Object.entries(MUTATIONS_API)) {
    const m = await chargerCopie(FICHIERS_API, "horloges.js", mutation);
    try { assert.ok((await echecsApi(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ outil du MJ IA
test("outil horloge : en 40k et en Warcraft, pas aux Veillées", () => {
  const noms = s => new Set(outilsDuSysteme(s).map(o => o.nom));
  assert.ok(noms("impmal").has("horloge") && noms("dnd5e").has("horloge"));
  assert.ok(!noms("lakour-loups").has("horloge"));
  reinitialiser({ systeme: "lakour-loups" });
  etat.reglages.horloges = [horloge(2)];
  assert.deepEqual(H.resumePourIA(), [], "aux Veillées, rien dans l'état du jeu");
  assert.match(CONSIGNE_HORLOGES, /Exposition/);
  assert.match(CONSIGNE_HORLOGES, /intermède/);
});

test("outil horloge : créer, avancer jusqu'à la sonnerie, montrer, régler, retirer", async () => {
  reinitialiser();
  let r = await outilHorloge({ action: "creer", nom: "Rituel du Chœur", type: "horloge", max: 4, faction: "Culte", notes: "Le Héraut se manifeste." });
  assert.ok(!r.erreur, r.contenu);
  assert.match(r.contenu, /Créé : Horloge « Rituel du Chœur » \[horloge-[0-9a-f]{16}\] \(faction Culte\) : 0\/4 segments, cachée aux joueurs/);
  assert.doesNotMatch(r.contenu, /rituel-du-choeur/, "cachée : son identifiant ne dit pas son nom");
  r = await outilHorloge({ action: "creer", nom: "rituel du choeur" });
  assert.ok(r.erreur, "pas de doublon");
  r = await outilHorloge({ action: "avancer", nom: "rituel du choeur", valeur: 3 });
  assert.match(r.contenu, /3\/4 segments/);
  assert.equal(etat.messages.length, 0, "rien au chat avant la sonnerie");
  r = await outilHorloge({ action: "avancer", nom: "Rituel du Chœur", valeur: 0 });
  assert.match(r.contenu, /PLEINE/);
  assert.match(r.contenu, /elle sonne !/);
  assert.match(r.contenu, /Notes : Le Héraut se manifeste\./);
  assert.match(r.contenu, /conséquence/);
  assert.equal(etat.messages.length, 0, "cachée : pas de carte au chat");
  assert.match(etat.avis.join(" "), /elle sonne/, "le MJ est prévenu chez lui");
  assert.equal(etat.signaux.length, 0, "l'IA a déjà la réponse de l'outil");
  r = await outilHorloge({ action: "montrer", nom: "Rituel du Chœur" });
  assert.match(r.contenu, /Les joueurs la voient maintenant/);
  assert.equal(etat.messages.at(-1).whisper, undefined, "l'apparition est annoncée à tous");
  r = await outilHorloge({ action: "regler", nom: "Rituel du Chœur", valeur: 0, max: 8 });
  assert.match(r.contenu, /0\/8 segments/);
  assert.equal(H.lister()[0].notes, "Le Héraut se manifeste.", "regler garde les notes non données");
  r = await outilHorloge({ action: "retirer", nom: "Rituel du Chœur" });
  assert.match(r.contenu, /retiré/);
  assert.equal(H.lister().length, 0);
  r = await outilHorloge({ action: "avancer", nom: "Rien" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /introuvable/);
});

test("outil horloge : réputation (paliers par défaut) et jauge à seuils ; lister donne tout", async () => {
  reinitialiser();
  await outilHorloge({ action: "creer", nom: "Horde", type: "reputation", faction: "Horde", visible: true });
  let r = await outilHorloge({ action: "avancer", nom: "Horde", valeur: 8 });
  assert.match(r.contenu, /Réputation auprès de Horde : Neutre → Amical \(\+8\)/);
  assert.equal(etat.messages.at(-1).whisper, undefined);
  await outilHorloge({ action: "creer", nom: "Exposition", type: "jauge", max: 10, paliers: [{ nom: "Remarqués", min: 4 }, { nom: "Traqués", min: 8 }] });
  r = await outilHorloge({ action: "avancer", nom: "Exposition", valeur: 5 });
  assert.match(r.contenu, /franchit le seuil « Remarqués »/);
  r = await outilHorloge({ action: "lister" });
  assert.match(r.contenu, /Paliers : Haï \(-100\), Hostile \(-50\)/);
  assert.match(r.contenu, /Seuils : Remarqués \(4\), Traqués \(8\)/);
  assert.match(H.resumePourIA().join("\n"), /Jauge « Exposition » \[horloge-[0-9a-f]{16}\] : 5\/10 — seuil « Remarqués » atteint ; prochain « Traqués » à 8/);
});
