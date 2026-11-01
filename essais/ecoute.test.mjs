// Écoute des joueurs (scripts/ecoute.js, docs/voix-et-ecoute.md §2) : quand écouter, découpage par silences sur des niveaux
// simulés, coût, filtres (hallucinations, écho), routage d'une phrase transcrite selon l'audibilité des Veillées (et sans matrice
// en 40k et en Warcraft), et une batterie par mutation. Aucun appel réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as E from "../scripts/ecoute.js";

// Blocs de 20 ms à 16 kHz : parole (-20 dBFS, avec un bref creux toutes les demi-secondes, comme une vraie voix) ou silence
// (-70 dBFS), niveaux donnés au découpeur.
const BLOC = 320;
const bloc = (valeur = 0.1) => new Float32Array(BLOC).fill(valeur);
function jouer(d, motif) {
  const segments = [];
  for (const [genre, secondes] of motif) {
    for (let i = 0; i < Math.round(secondes / 0.02); i++) {
      const parle = genre === "p" && i % 25 !== 24;
      segments.push(...d.ajouter(bloc(parle ? 0.1 : 0.0003), parle ? -20 : -70));
    }
  }
  return segments;
}

test("écoute : seulement si une séance du MJ IA est lancée ou un compagnon vivant est à la table", () => {
  assert.equal(E.ecouteActive({}), false);
  assert.equal(E.ecouteActive({ seanceIA: true }), true);
  assert.equal(E.ecouteActive({ compagnonsVivants: 2 }), true);
  assert.equal(E.ecouteActive({ compagnonsVivants: [] }), false);
  assert.equal(E.ecouteActive({ seanceIA: true, moduleActif: false }), false);
});

test("découpage : une phrase entre deux silences donne un segment, avec un peu de son d'avant", () => {
  const d = new E.DecoupeurSilences();
  const segs = jouer(d, [["s", 1], ["p", 2], ["s", 1]]);
  assert.equal(segs.length, 1);
  const s = segs[0];
  assert.ok(Math.abs(s.parole - 2 * 0.96) < 0.03, `parole ${s.parole}`);
  assert.ok(s.duree >= 2 + 0.28 + 0.7 - 0.03 && s.duree <= 2 + 0.32 + 0.72, `durée ${s.duree}`);
  assert.equal(s.echantillons.length, Math.round(s.duree * 16000));
  assert.equal(s.force, false);
});

test("découpage : une courte pause ne coupe pas la phrase ; deux phrases bien séparées font deux segments", () => {
  const d = new E.DecoupeurSilences();
  assert.equal(jouer(d, [["s", 0.5], ["p", 1], ["s", 0.4], ["p", 1], ["s", 1]]).length, 1, "0,4 s de pause : même phrase");
  assert.equal(jouer(new E.DecoupeurSilences(), [["s", 0.5], ["p", 1], ["s", 1], ["p", 1.5], ["s", 1]]).length, 2);
});

test("découpage : un clic ou une toux (moins de 0,4 s de parole) est jeté ; un long discours est coupé à 15 s et continue", () => {
  assert.equal(jouer(new E.DecoupeurSilences(), [["s", 1], ["p", 0.2], ["s", 1]]).length, 0);
  const segs = jouer(new E.DecoupeurSilences(), [["s", 0.5], ["p", 40], ["s", 1]]);
  assert.equal(segs.length, 3);
  assert.ok(segs.every(s => s.duree <= 15.02), segs.map(s => s.duree).join(", "));
  assert.deepEqual(segs.map(s => s.force), [true, true, false]);
});

test("découpage : le bruit de fond relève le seuil (un ronronnement continu n'est pas de la parole)", () => {
  const d = new E.DecoupeurSilences();
  let n = 0;
  for (let i = 0; i < 300; i++) n += d.ajouter(bloc(0.003), -45).length;   // 6 s de souffle à -45 dBFS
  assert.equal(n, 0);
  assert.ok(d.seuil() >= -45 + 12 - 0.5, `seuil ${d.seuil()}`);
  assert.equal(jouer(d, [["p", 1], ["s", 1]]).length, 1, "une vraie voix passe toujours");
});

test("découpage : un son continu sans creux (musique) devient le bruit de fond après un segment forcé", () => {
  const d = new E.DecoupeurSilences();
  jouer(d, [["s", 1]]);
  let n = 0;
  for (let i = 0; i < 1500; i++) n += d.ajouter(bloc(0.03), -30).length;   // 30 s de musique à -30 dBFS
  assert.equal(n, 1, "un seul segment forcé, puis plus rien");
  assert.equal(jouer(d, [["p", 1], ["s", 1]]).length, 1, "au premier creux, le bruit de fond redescend : une voix passe");
});

test("découpage : la fin de l'écoute rend le segment en cours s'il vaut quelque chose", () => {
  const d = new E.DecoupeurSilences();
  jouer(d, [["s", 0.5], ["p", 1]]);
  assert.equal(d.vider().length, 1);
  assert.deepEqual(d.vider(), []);
});

test("signal : niveau en dBFS, rééchantillonnage 48 → 16 kHz, WAV 16 bits mono", () => {
  assert.equal(E.niveauDb(new Float32Array(100)), -100);
  assert.ok(Math.abs(E.niveauDb(new Float32Array(100).fill(0.1)) + 20) < 0.01);
  const bas = E.sousEchantillonner(new Float32Array(960).fill(0.5), 48000, 16000);
  assert.equal(bas.length, 320);
  assert.ok(bas.every(x => Math.abs(x - 0.5) < 1e-6));
  const wav = E.wavMono16(new Float32Array([0, 1, -1]), 16000);
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(40, true), 6);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)], [0, 32767, -32768]);
});

test("coût : le modèle le moins cher par défaut, compté à la minute ; un modèle inconnu au prix le plus haut", () => {
  assert.equal(E.MODELE_TRANSCRIPTION_DEFAUT, "gpt-4o-mini-transcribe");
  assert.equal(E.coutTranscription("gpt-4o-mini-transcribe", 60), 0.003);
  assert.equal(E.coutTranscription("gpt-4o-transcribe", 30), 0.003);
  assert.equal(E.coutTranscription("modele-futur", 60), 0.006);
  assert.equal(E.coutTranscription("whisper-1", -5), 0);
});

test("filtres : hallucinations sur un silence jetées, écho d'une voix d'IA reprise par un micro jeté", () => {
  for (const t of ["", "  ", "...", "Sous-titres réalisés par la communauté d'Amara.org", "Merci d'avoir regardé !", "[Musique]", "Merci."]) {
    assert.equal(E.transcriptionUtile(t), "", t);
  }
  assert.equal(E.transcriptionUtile("  Je  crois que c'est Valentin. "), "Je crois que c'est Valentin.");
  const recents = [{ texte: "La brume monte sur le village, et les cloches se taisent.", quand: 1000 }];
  assert.equal(E.estEcho("la brume monte sur le village", recents, 5000), true);
  assert.equal(E.estEcho("la brume monte sur le village", recents, 60000), false, "trop ancien");
  assert.equal(E.estEcho("Moi je dis que Valentin ment", recents, 5000), false);
  assert.equal(E.estEcho("oui", recents, 5000), false, "trop court pour juger");
});

// ---------------------------------------------------------------- routage
const U = [
  { id: "mj", nom: "Hogun", active: true, isGM: true },
  { id: "jo", nom: "Jordan", active: true, vivant: true, meute: false },
  { id: "lou", nom: "Louve", active: true, vivant: true, meute: true },
  { id: "fan", nom: "Fantôme", active: true, vivant: false }
];
const C = [
  { id: "cv", nom: "Clémence", vivant: true, meute: false },
  { id: "cl", nom: "Loup IA", vivant: true, meute: true },
  { id: "cm", nom: "Mort IA", vivant: false }
];

test("routage sans matrice (40k, Warcraft) : le MJ IA en séance et tous les compagnons l'entendent", () => {
  const r = E.routerParole({ seanceIA: true, locuteur: "jo", compagnons: C, utilisateurs: U });
  assert.deepEqual(r, { transcrire: true, versMJ: true, restreint: false, nomsAuditeurs: [], acteursAuditeurs: ["cv", "cl", "cm"], declencher: true });
  const hors = E.routerParole({ seanceIA: false, locuteur: "jo", compagnons: [], utilisateurs: U });
  assert.equal(hors.transcrire, false, "ni séance ni compagnon : aucun appel");
});

test("routage aux Veillées : qui ne doit rien dire n'est pas transcrit du tout", () => {
  const r = E.routerParole({ seanceIA: true, audibilite: { peutParler: false, auditeurs: [] }, locuteur: "jo", compagnons: C, utilisateurs: U, phase: "nuit" });
  assert.equal(r.transcrire, false);
  assert.equal(r.versMJ, false);
});

test("routage aux Veillées : acteursAuditeurs du système fait foi", () => {
  const r = E.routerParole({ audibilite: { peutParler: true, auditeurs: ["lou"], acteursAuditeurs: ["cl", "inconnu"] }, locuteur: "lou", compagnons: C, utilisateurs: U, phase: "nuit" });
  assert.deepEqual(r.acteursAuditeurs, ["cl"]);
  assert.equal(r.restreint, true);
  assert.equal(r.transcrire, true, "sans séance, un compagnon qui entend suffit");
});

test("routage aux Veillées, déduction prudente : le jour un vivant est entendu de tous, compagnon mort compris", () => {
  const r = E.routerParole({ audibilite: { peutParler: true, auditeurs: ["mj", "lou", "fan"] }, locuteur: "jo", compagnons: C, utilisateurs: U, phase: "jour" });
  assert.equal(r.restreint, false);
  assert.deepEqual(r.acteursAuditeurs, ["cv", "cl", "cm"]);
});

test("routage aux Veillées, déduction prudente : un mort n'est entendu que du compagnon mort", () => {
  const r = E.routerParole({ seanceIA: true, audibilite: { peutParler: true, auditeurs: ["fan2"] }, locuteur: "fan", compagnons: C, utilisateurs: [...U, { id: "fan2", nom: "Spectre", active: true, vivant: false }], phase: "jour" });
  assert.deepEqual(r.acteursAuditeurs, ["cm"], "un autre mort humain l'entend : le compagnon mort aussi");
  assert.equal(r.restreint, true);
  assert.match(E.ligneParole({ nom: "Fantôme", texte: "C'est Louve !" }, r), /entendu seulement de .*n'y réponds pas devant les autres/);
});

test("routage aux Veillées, déduction prudente : la nuit, un loup n'est entendu que des compagnons loups", () => {
  // Louve est la seule humaine de la meute : aucun humain dans sa situation, c'est l'audibilité du compagnon loup qui tranche.
  const audActeur = id => ({ cl: { peutParler: true, auditeurs: ["lou"] }, cv: { peutParler: false, auditeurs: [] }, cm: { peutParler: true, auditeurs: ["fan"] } })[id];
  const r = E.routerParole({ audibilite: { peutParler: true, auditeurs: ["lou", "mj"] }, audibiliteActeur: audActeur, locuteur: "lou", compagnons: C, utilisateurs: U, phase: "nuit" });
  assert.deepEqual(r.acteursAuditeurs, ["cl"]);
  // Sans audibilité des acteurs non plus : personne (dans le doute, le compagnon n'entend pas).
  assert.deepEqual(E.routerParole({ audibilite: { peutParler: true, auditeurs: ["lou"] }, locuteur: "lou", compagnons: C, utilisateurs: U, phase: "nuit" }).acteursAuditeurs, []);
});

test("routage aux Veillées, déduction prudente : un compagnon vivant n'entend jamais un mort, même si le mort l'entend", () => {
  const audActeur = () => ({ peutParler: true, auditeurs: ["fan", "jo", "lou"] });   // les morts entendent les vivants
  const r = E.routerParole({ audibilite: { peutParler: true, auditeurs: [] }, audibiliteActeur: audActeur, locuteur: "fan", compagnons: C, utilisateurs: U, phase: "jour" });
  assert.deepEqual(r.acteursAuditeurs, ["cm"]);
});

test("ligne pour le MJ IA", () => {
  assert.equal(E.ligneParole({ nom: "Jordan", texte: "Je vote Clémence." }), "🗣️ Jordan (à voix haute) : Je vote Clémence.");
});

// ---------------------------------------------------------------- mutations (ecoute.js)
const SOURCE = fileURLToPath(new URL("../scripts/ecoute.js", import.meta.url));
const MUTATIONS = {
  "écoute sans IA": ["  return Boolean(seanceIA) || compagnons > 0;", "  return true;"],
  "silence de nuit transcrit": ["  if (audibilite && audibilite.peutParler === false) return rien;", ""],
  "acteursAuditeurs ignorés": ["acteurs = Array.isArray(audibilite.acteursAuditeurs)", "acteurs = false"],
  "déduction imprudente": ["  return compagnons.filter(c => entendues.has(situation(c)) || aRebours(c)).map(c => c.id);", "  return compagnons.map(c => c.id);"],
  "un vivant entend un mort": ["(c.vivant === false || parleur?.vivant !== false)", "true"],
  "appel sans auditeur": ["transcrire: versMJ || acteurs.length > 0,", "transcrire: true,"],
  "segment trop court gardé": ["if (!s || s.parole < this.o.minParole) return null;", "if (!s) return null;"],
  "segment sans borne": ["} else if (s.duree >= this.o.maxSegment) {", "} else if (false) {"],
  "fin de phrase ignorée": ["    if (s.silence >= this.o.silenceFin) {", "    if (false) {"],
  "pas de son d'avant": ["this.segment = { blocs: [...this.avant], duree: this.dureeAvant,", "this.segment = { blocs: [], duree: 0,"],
  "bruit de fond ignoré": ["return Math.max(this.o.seuilDb, (this.bruit ?? -100) + this.o.margeDb);", "return this.o.seuilDb;"],
  "écho gardé": ["return m.filter(x => dit.has(x)).length / m.length >= 0.6;", "return false;"],
  "hallucination gardée": ["  if (HALLUCINATIONS.some(r => r.test(t))) return \"\";\n", ""],
  "coût oublié": ["  return Math.max(0, Number(secondes) || 0) / 60 * prix;", "  return 0;"],
  "MJ non prévenu d'une parole restreinte": ["  const qui = restreint\n", "  const qui = false\n"]
};

function batterie(M) {
  const echecs = [];
  const verifier = (nom, fn) => { try { fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  verifier("écoute", () => assert.equal(M.ecouteActive({}), false));
  verifier("nuit", () => assert.equal(M.routerParole({ seanceIA: true, audibilite: { peutParler: false, auditeurs: [] }, locuteur: "jo", compagnons: C, utilisateurs: U }).transcrire, false));
  verifier("acteurs", () => assert.deepEqual(M.routerParole({ audibilite: { peutParler: true, auditeurs: ["lou"], acteursAuditeurs: ["cl"] }, locuteur: "lou", compagnons: C, utilisateurs: U, phase: "nuit" }).acteursAuditeurs, ["cl"]));
  verifier("prudence", () => assert.deepEqual(M.routerParole({ audibilite: { peutParler: true, auditeurs: ["lou"] }, locuteur: "lou", compagnons: C, utilisateurs: U, phase: "nuit" }).acteursAuditeurs, []));
  verifier("vivant sourd aux morts", () => assert.deepEqual(M.routerParole({ audibilite: { peutParler: true, auditeurs: [] }, audibiliteActeur: () => ({ peutParler: true, auditeurs: ["fan"] }), locuteur: "fan", compagnons: C, utilisateurs: U }).acteursAuditeurs, ["cm"]));
  verifier("aucun appel", () => assert.equal(M.routerParole({ locuteur: "jo", compagnons: [], utilisateurs: U }).transcrire, false));
  verifier("clic", () => assert.equal(jouer(new M.DecoupeurSilences(), [["s", 1], ["p", 0.2], ["s", 1]]).length, 0));
  verifier("borne", () => assert.ok(jouer(new M.DecoupeurSilences(), [["p", 40], ["s", 1]]).every(s => s.duree <= 15.02)));
  verifier("deux phrases", () => assert.equal(jouer(new M.DecoupeurSilences(), [["s", 0.5], ["p", 1], ["s", 1], ["p", 1], ["s", 1]]).length, 2));
  verifier("avant", () => assert.ok(jouer(new M.DecoupeurSilences(), [["s", 1], ["p", 1], ["s", 1]])[0].duree > 1.9));
  verifier("bruit", () => { const d = new M.DecoupeurSilences(); let n = 0; for (let i = 0; i < 300; i++) n += d.ajouter(bloc(0.003), -45).length; n += d.vider().length; assert.equal(n, 0); });
  verifier("écho", () => assert.equal(M.estEcho("la brume monte sur le village", [{ texte: "La brume monte sur le village.", quand: 0 }], 1000), true));
  verifier("hallucination", () => assert.equal(M.transcriptionUtile("Sous-titres réalisés par Amara.org"), ""));
  verifier("coût", () => assert.ok(M.coutTranscription("gpt-4o-mini-transcribe", 60) > 0));
  verifier("restreint", () => assert.match(M.ligneParole({ nom: "A", texte: "b" }, { restreint: true, nomsAuditeurs: ["C"] }), /seulement de C/));
  return echecs;
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const charger = async mutation => {
    const dossier = mkdtempSync(join(tmpdir(), "lakour-ecoute-"));
    let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
    if (mutation) {
      assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
      texte = texte.replace(mutation[0], mutation[1]);
    }
    writeFileSync(join(dossier, "ecoute.js"), texte);
    return { dossier, M: await import(pathToFileURL(join(dossier, "ecoute.js")).href) };
  };
  const vrai = await charger(null);
  try { assert.deepEqual(batterie(vrai.M), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok(batterie(m.M).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
