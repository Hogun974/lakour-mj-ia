// Essais des boucles d'ambiance de lakour-mj-ia (synthétisées par outils/fabriquer-sons.mjs) : en-têtes WAV,
// durée, crête, bouclage sans clic, ambiances distinctes, sonies proches, index.json cohérent, et mutations
// (WAV tronqué refusé, clic de jointure détecté). Aucun réseau.
// Régénérer les sons : npm run fabriquer-sons
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  AMBIANCES, CENTRES_BANDES, CRETE_DBFS, DOSSIER_SONS, FREQUENCE, bandes, cheminSon, crete, encoderWav, indexSons,
  lireWav, modulation, sautDeBoucle, sonie, synthetiser
} from "../outils/fabriquer-sons.mjs";

const racine = new URL("../", import.meta.url);
// Chemins Foundry (modules/lakour-mj-ia/…) -> chemins du dépôt, dont la racine est le dossier du module.
const surDisque = chemin => chemin.replace(/^modules\/lakour-mj-ia\//, "");
const lireOctets = chemin => readFileSync(new URL(surDisque(chemin), racine));
const REQUISES = ["vent", "pluie", "orage", "feu", "grotte", "mer", "foule", "forge", "nuit", "tension"];
const index = JSON.parse(lireOctets(`${DOSSIER_SONS}/index.json`).toString("utf8"));
const sons = Object.fromEntries(Object.keys(index).map(cle => [cle, lireWav(lireOctets(index[cle].fichier))]));
const x = cle => sons[cle].echantillons;
const dB = v => 10 * Math.log10(v);
const spectres = Object.fromEntries(Object.keys(sons).map(cle => [cle, bandes(x(cle))]));
const part = (cle, ...centres) => centres.reduce((s, c) => s + spectres[cle][CENTRES_BANDES.indexOf(c)], 0);

test("index.json : les dix ambiances requises, libellé, usage, chemin du module, fichier présent, rien d'orphelin", () => {
  for (const cle of REQUISES) assert.ok(index[cle], `ambiance ${cle} absente de l'index`);
  assert.deepEqual(index, indexSons(), "index.json n'est pas à jour : npm run fabriquer-sons");
  for (const [cle, e] of Object.entries(index)) {
    assert.deepEqual(Object.keys(e).sort(), ["fichier", "libelle", "pour"], cle);
    assert.ok(e.libelle.trim().length > 2 && e.pour.trim().length > 10, `${cle} : libellé ou usage vide`);
    assert.equal(e.fichier, `modules/lakour-mj-ia/assets/sons/${cle}.wav`);
    assert.equal(e.fichier, cheminSon(cle));
    assert.ok(existsSync(new URL(surDisque(e.fichier), racine)), `${e.fichier} absent`);
  }
  const wav = readdirSync(new URL(surDisque(DOSSIER_SONS), racine)).filter(f => f.endsWith(".wav")).map(f => f.slice(0, -4)).sort();
  assert.deepEqual(wav, Object.keys(index).sort(), "WAV orphelins ou manquants");
});

test("en-têtes WAV : RIFF/WAVE, PCM, 22 050 Hz, mono, 16 bits ; durée >= 15 s ; total < 15 Mo", () => {
  let total = 0;
  for (const [cle, s] of Object.entries(sons)) {
    const b = lireOctets(index[cle].fichier);
    total += b.length;
    assert.equal(b.toString("ascii", 0, 4), "RIFF", cle);
    assert.equal(b.toString("ascii", 8, 12), "WAVE", cle);
    assert.deepEqual([s.format, s.frequence, s.canaux, s.bits], [1, 22050, 1, 16], cle);
    assert.equal(s.frequence, FREQUENCE);
    assert.ok(s.duree >= 15 && s.duree <= 40, `${cle} : ${s.duree} s`);
  }
  assert.ok(total < 15 * 1024 * 1024, `${(total / 1048576).toFixed(1)} Mio au total`);
});

test("crête à -3 dBFS ou moins, aucune saturation", () => {
  for (const cle of Object.keys(sons)) {
    const c = 20 * Math.log10(crete(x(cle)));
    assert.ok(c <= CRETE_DBFS + 0.01, `${cle} : crête ${c.toFixed(2)} dBFS`);
    assert.ok(c >= -12, `${cle} : crête ${c.toFixed(2)} dBFS, bien trop bas`);
    assert.ok(!x(cle).some(v => v >= 32767 / 32768 || v <= -1), `${cle} : saturation`);
  }
});

test("sonies perçues proches (pondération K) : écart total <= 1,5 LU", () => {
  const l = Object.keys(sons).map(cle => [cle, sonie(x(cle))]);
  const valeurs = l.map(([, v]) => v);
  assert.ok(Math.max(...valeurs) - Math.min(...valeurs) <= 1.5, JSON.stringify(l.map(([c, v]) => [c, +v.toFixed(2)])));
});

test("bouclage sans clic : le saut dernier -> premier échantillon est petit et ordinaire", () => {
  for (const cle of Object.keys(sons)) {
    const { saut, rapport } = sautDeBoucle(x(cle));
    assert.ok(saut < 0.05, `${cle} : saut de ${saut.toFixed(4)} (pleine échelle)`);
    assert.ok(rapport <= 1, `${cle} : saut ${rapport.toFixed(2)} fois le quantile 99,9 % des sauts ordinaires`);
    // pas de trou ni de bosse de niveau à la jointure : 0,5 s de chaque côté
    const t = Math.round(0.5 * FREQUENCE), v = x(cle);
    const ef = a => Math.sqrt(a.reduce((s, y) => s + y * y, 0) / a.length);
    const ecart = Math.abs(dB(ef(v.subarray(v.length - t)) ** 2) - dB(ef(v.subarray(0, t)) ** 2));
    assert.ok(ecart < 10, `${cle} : ${ecart.toFixed(1)} dB d'écart de part et d'autre de la jointure`);
  }
});

test("ambiances distinctes : profils spectraux éloignés deux à deux", () => {
  const profil = cle => spectres[cle].map(v => Math.max(-40, dB(v)));
  const cles = Object.keys(sons);
  for (let i = 0; i < cles.length; i++) for (let j = i + 1; j < cles.length; j++) {
    const a = profil(cles[i]), b = profil(cles[j]), d = a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0);
    assert.ok(d >= 12, `${cles[i]} et ${cles[j]} trop semblables (${d.toFixed(1)} dB)`);
  }
});

test("chaque ambiance a la signature attendue", () => {
  // orage : le tonnerre met bien plus d'énergie dans les graves que la pluie seule
  assert.ok(part("orage", 31.25, 62.5, 125) > 10 * part("pluie", 31.25, 62.5, 125), "orage pas plus grave que pluie");
  // pluie : bruissement aigu, presque rien sous 125 Hz, niveau régulier
  assert.ok(part("pluie", 2000, 4000, 8000) > 0.6 && part("pluie", 31.25, 62.5) < 0.01);
  assert.ok(modulation(x("pluie")) < 0.15, "la pluie doit être régulière");
  // vent et mer : niveau qui varie lentement (rafales, vagues), bien plus que la pluie
  assert.ok(modulation(x("vent")) > 0.3 && modulation(x("mer")) > 2 * modulation(x("pluie")));
  // nuit : pic des grillons dans l'octave des 4 kHz, au moins 6 dB au-dessus des octaves voisines
  const nuit = spectres.nuit, i4 = CENTRES_BANDES.indexOf(4000);
  assert.ok(dB(nuit[i4] / nuit[i4 - 1]) > 6 && dB(nuit[i4] / nuit[i4 + 1]) > 6, "pas de pic de grillons");
  // tension : nappe grave, quasiment rien au-dessus de 1 kHz
  assert.ok(part("tension", 1000, 2000, 4000, 8000) < 0.02 && part("tension", 31.25, 62.5, 125, 250) > 0.8);
  // foule : l'essentiel dans la zone de la voix (250-1000 Hz)
  assert.ok(part("foule", 250, 500, 1000) > 0.7);
  // feu et forge : grave dominant mais des transitoires aigus (crépitements, cliquetis)
  for (const cle of ["feu", "forge"]) assert.ok(part(cle, 31.25, 62.5, 125, 250) > 0.5 && part(cle, 2000, 4000, 8000) > 0.005, cle);
  // grotte : ronflement grave et gouttes vers 1-2 kHz
  assert.ok(part("grotte", 31.25, 62.5) > 0.4 && part("grotte", 1000, 2000) > 0.2);
});

test("reproductible : la synthèse à graine fixe redonne le fichier sur disque", () => {
  const neuf = lireWav(encoderWav(synthetiser("vent"))).echantillons, disque = x("vent");
  assert.equal(neuf.length, disque.length);
  let ecart = 0;
  for (let i = 0; i < neuf.length; i++) ecart = Math.max(ecart, Math.abs(neuf[i] - disque[i]));
  assert.ok(ecart <= 2 / 32768, `écart de ${ecart * 32768} pas de quantification`);
});

test("mutation : le lecteur refuse un WAV tronqué ou altéré", () => {
  const b = lireOctets(index.pluie.fichier);
  assert.throws(() => lireWav(b.subarray(0, b.length - 1000)), /tronqué/);
  assert.throws(() => lireWav(b.subarray(0, 40)), /tronqué/);
  assert.throws(() => lireWav(b.subarray(0, 8)), /RIFF\/WAVE/);
  // tronqué puis « réparé » en recalant la taille RIFF : le bloc data annonce encore plus qu'il ne contient
  const coupe = Buffer.from(b.subarray(0, b.length - 1001));
  coupe.writeUInt32LE(coupe.length - 8, 4);
  assert.throws(() => lireWav(coupe), /tronqué/);
  const flottant = Buffer.from(b);
  flottant.writeUInt16LE(3, 20);
  assert.throws(() => lireWav(flottant), /PCM/);
  const st = Buffer.from(b);
  st.writeUInt16LE(2, 22);
  assert.throws(() => lireWav(st), /incohérent/);
  // et le fichier intact, lui, passe
  assert.equal(lireWav(b).echantillons.length, (b.length - 44) / 2);
});

test("mutation : une boucle mal coupée ou un clic à la jointure est détecté", () => {
  const t = x("tension");
  assert.ok(sautDeBoucle(t.slice(0, t.length - 3001)).rapport > 2, "boucle coupée au hasard non détectée");
  const clic = t.slice();
  clic[0] += 0.2;
  assert.ok(sautDeBoucle(clic).rapport > 2, "clic non détecté");
});

test("toutes les ambiances déclarées ont un générateur", () => {
  for (const [cle, a] of Object.entries(AMBIANCES)) assert.equal(typeof a.synthese, "function", cle);
  assert.ok(Object.keys(AMBIANCES).length >= 10);
});
