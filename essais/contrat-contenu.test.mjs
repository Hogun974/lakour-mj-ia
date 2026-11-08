// Contrat commun des modules de contenu (outils/contrat-contenu.mjs), éprouvé sur un module d'essai écrit à la volée :
// figurants.json, index des jetons de joueur, jetons à plat et en relief, plans.json cohérent avec les scènes.
// Ce contrôle remplace la partie « fichiers des mondes » des anciens essais transversaux (parite, placement) : chaque
// dépôt de monde l'applique à son propre module (essais/contrat-*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifierModuleDeContenu } from "../outils/contrat-contenu.mjs";
import { jetonPlat, jetonRelief } from "../outils/jetons-commun.mjs";

const ID = "lakour-essai";
const PLAN = { largeur: 8, hauteur: 6, lumiere: "jour", pieces: [{ nom: "Place", x: 0, y: 0, l: 8, h: 6, sol: "pierre" }], ouvertures: [],
  lumieres: [], elements: [{ nom: "Puits", x: 3, y: 3 }] };

// Un module de contenu complet et conforme, dans un dossier temporaire : { racine, ecrire, lireJson, effacer, nettoyer }.
function moduleDEssai() {
  const parent = mkdtempSync(join(tmpdir(), "lakour-contrat-"));
  const racine = join(parent, ID);
  const ecrire = (chemin, contenu) => {
    mkdirSync(join(racine, chemin, ".."), { recursive: true });
    writeFileSync(join(racine, chemin), typeof contenu === "string" ? contenu : `${JSON.stringify(contenu, null, 2)}\n`);
  };
  const jeton = (cle, couleur = "#c9a227") => {
    const modele = { titre: cle, couleur, attitude: "neutre", lisere: null, traces: ["M10 10h20v20z"] };
    ecrire(`assets/jetons/${cle}.svg`, jetonPlat(modele));
    ecrire(`assets/jetons/3d/${cle}.svg`, jetonRelief(modele));
  };
  ecrire("module.json", { id: ID, title: "Module d'essai", packs: [{ name: "scenes", type: "Scene", path: "packs/scenes" }] });
  jeton("paysan"); jeton("garde");
  ecrire("assets/jetons/figurants.json", { paysan: { libelle: "Paysan", jeton: "paysan" }, garde: { libelle: "Garde", jeton: "garde" } });
  for (const cle of ["guerrier", "mage"]) {
    const modele = { titre: cle, couleur: "#3d6a99", attitude: "joueur", lisere: null, traces: ["M1 1h9v9z"] };
    ecrire(`assets/jetons/joueurs/${cle}.svg`, jetonPlat(modele));
    ecrire(`assets/jetons/joueurs/3d/${cle}.svg`, jetonRelief(modele));
  }
  const index = dossier => Object.fromEntries(["guerrier", "mage"].map(c => [c, `modules/${ID}/assets/jetons/joueurs/${dossier}${c}.svg`]));
  ecrire("assets/jetons/index.json", index(""));
  ecrire("assets/jetons/index-3d.json", index("3d/"));
  ecrire("assets/cartes/plans.json", { place: PLAN });
  ecrire("assets/cartes/place.svg", "<svg/>");
  ecrire("assets/cartes/3d/place.svg", "<svg/>");
  ecrire("src/scenes/place.json", { _id: "aaaaaaaaaaaaaaaa", name: "Place", levels: [{ background: { src: `modules/${ID}/assets/cartes/place.svg` } }],
    flags: { [ID]: { cle: "place", plan: PLAN } } });
  return {
    racine, ecrire,
    lireJson: chemin => JSON.parse(readFileSync(join(racine, chemin), "utf8")),
    effacer: chemin => unlinkSync(join(racine, chemin)),
    nettoyer: () => rmSync(parent, { recursive: true, force: true })
  };
}

// Applique une modification à un module d'essai neuf et rend les erreurs du contrat.
const apres = (modifier, options) => {
  const m = moduleDEssai();
  try { modifier(m); return verifierModuleDeContenu(m.racine, options); } finally { m.nettoyer(); }
};

test("module d'essai complet : le contrat est respecté", () => {
  assert.deepEqual(apres(() => {}), []);
  assert.deepEqual(apres(() => {}, { minFigurants: 2, minJoueurs: 2 }), []);
});

test("figurants et jetons de joueur : chaque manque est signalé (mutation)", () => {
  const contient = (erreurs, motif) => assert.ok(erreurs.some(e => motif.test(e)), `${motif} absent de :\n${erreurs.join("\n")}`);
  contient(apres(m => m.effacer("assets/jetons/figurants.json")), /^figurants\.json absent$/);
  contient(apres(m => m.effacer("assets/jetons/3d/garde.svg")), /figurant garde \(3D\) : assets\/jetons\/3d\/garde\.svg absent/);
  contient(apres(m => m.ecrire("assets/jetons/figurants.json", { paysan: { jeton: "paysan" } })), /paysan sans libellé/);
  contient(apres(m => m.ecrire("assets/jetons/paysan.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><image href="https://x/a.png"/></svg>')),
    /référence externe/);
  contient(apres(() => {}, { minFigurants: 10 }), /2 type\(s\), au moins 10/);
  contient(apres(m => m.effacer("assets/jetons/joueurs/3d/mage.svg")), /index-3d\.json : mage .*absent/);
  contient(apres(m => m.ecrire("assets/jetons/index-3d.json", { ...m.lireJson("assets/jetons/index-3d.json"), voleur: `modules/${ID}/assets/jetons/joueurs/3d/mage.svg` })),
    /index\.json : voleur absent \(présent dans index-3d\.json\)/);
  contient(apres(m => m.ecrire("assets/jetons/index.json", { ...m.lireJson("assets/jetons/index.json"), mage: "modules/autre/assets/mage.svg" })), /hors du module/);
  contient(apres(m => m.ecrire("assets/jetons/index-3d.json", m.lireJson("assets/jetons/index.json"))), /n'est pas un jeton en relief/);
  contient(apres(m => m.ecrire("module.json", { id: "autre-nom" })), /id « autre-nom » au lieu de « lakour-essai »/);
});

test("plans et scènes : plan absent, différent, orphelin ou vide, image manquante (mutation)", () => {
  const contient = (erreurs, motif) => assert.ok(erreurs.some(e => motif.test(e)), `${motif} absent de :\n${erreurs.join("\n")}`);
  contient(apres(m => m.ecrire("assets/cartes/plans.json", {})), /plan « place » absent de plans\.json/);
  contient(apres(m => m.ecrire("assets/cartes/plans.json", { place: { ...PLAN, largeur: 9 } })), /son plan diffère de plans\.json/);
  contient(apres(m => m.ecrire("assets/cartes/plans.json", { place: PLAN, cave: PLAN })), /« cave » n'a pas de scène/);
  contient(apres(m => m.ecrire("assets/cartes/plans.json", { place: { ...PLAN, elements: [] } })), /place sans éléments/);
  contient(apres(m => m.effacer("assets/cartes/plans.json")), /^plans\.json absent$/);
  contient(apres(m => m.effacer("assets/cartes/place.svg")), /modules\/lakour-essai\/assets\/cartes\/place\.svg absent/);
  contient(apres(m => m.effacer("assets/cartes/3d/place.svg")), /carte en relief assets\/cartes\/3d\/place\.svg absente/);
});

// Jetons peints (assets/jetons/ia/<clé>.webp) : acceptés à plat dans index.json et comme « image » d'un figurant, s'ils existent
// et sont de vraies images ; jamais en relief.
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);
const ecrireOctets = (m, chemin, octets) => { mkdirSync(join(m.racine, chemin, ".."), { recursive: true }); writeFileSync(join(m.racine, chemin), octets); };
test("jeton peint à plat dans index.json et image peinte de figurant : acceptés", () => {
  const erreurs = apres(m => {
    ecrireOctets(m, "assets/jetons/ia/joueurs/guerrier.webp", WEBP);
    ecrireOctets(m, "assets/jetons/ia/paysan.webp", WEBP);
    const index = m.lireJson("assets/jetons/index.json");
    m.ecrire("assets/jetons/index.json", { ...index, guerrier: `modules/${ID}/assets/jetons/ia/joueurs/guerrier.webp` });
    const fig = m.lireJson("assets/jetons/figurants.json");
    m.ecrire("assets/jetons/figurants.json", { ...fig, paysan: { ...fig.paysan, image: "ia/paysan.webp" } });
  });
  assert.deepEqual(erreurs, []);
});
test("jeton peint absent, faux WebP, hors de ia/ ou en relief : refusés", () => {
  const absent = apres(m => {
    const fig = m.lireJson("assets/jetons/figurants.json");
    m.ecrire("assets/jetons/figurants.json", { ...fig, paysan: { ...fig.paysan, image: "ia/paysan.webp" } });
  });
  assert.ok(absent.some(e => /paysan.*absent/.test(e)), absent.join("\n"));
  const faux = apres(m => {
    m.ecrire("assets/jetons/ia/joueurs/guerrier.webp", "pas une image");
    const index = m.lireJson("assets/jetons/index.json");
    m.ecrire("assets/jetons/index.json", { ...index, guerrier: `modules/${ID}/assets/jetons/ia/joueurs/guerrier.webp` });
  });
  assert.ok(faux.some(e => /WebP valable/.test(e)), faux.join("\n"));
  const dehors = apres(m => {
    ecrireOctets(m, "assets/jetons/joueurs/guerrier.webp", WEBP);
    const index = m.lireJson("assets/jetons/index.json");
    m.ecrire("assets/jetons/index.json", { ...index, guerrier: `modules/${ID}/assets/jetons/joueurs/guerrier.webp` });
  });
  assert.ok(dehors.some(e => /n'est pas un jeton peint/.test(e)), dehors.join("\n"));
  const relief = apres(m => {
    ecrireOctets(m, "assets/jetons/ia/3d/guerrier.webp", WEBP);
    const index = m.lireJson("assets/jetons/index-3d.json");
    m.ecrire("assets/jetons/index-3d.json", { ...index, guerrier: `modules/${ID}/assets/jetons/ia/3d/guerrier.webp` });
  });
  assert.ok(relief.length > 0, "un jeton peint en relief est refusé");
});
