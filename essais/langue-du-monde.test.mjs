// Un monde anglais (module de contenu « -en » actif) : le narrateur et les compagnons IA reçoivent la consigne de parler anglais,
// les voix et la transcription suivent la langue du monde, et les textes automatiques vus des joueurs (cartes de vote, d'horloge,
// de fête, légendes des jets, nom du narrateur au chat) passent par lang/<langue>.json. Le français du code (repli hors de
// Foundry) est exactement celui de lang/fr.json.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("../", import.meta.url));
const aplatir = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) { const c = p ? `${p}.${k}` : k; if (v && typeof v === "object") aplatir(v, c, out); else out[c] = v; }
  return out;
};
const LANGUES = {
  fr: aplatir(JSON.parse(readFileSync(join(racine, "lang/fr.json"), "utf8"))),
  en: aplatir(JSON.parse(readFileSync(join(racine, "lang/en.json"), "utf8")))
};
// Un i18n de Foundry réduit : has / localize / format sur un fichier de langue ; null : hors de Foundry (repli français).
function sousInterface(langue) {
  globalThis.foundry = { utils: { escapeHTML: s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`) } };
  if (!langue) { globalThis.game = undefined; return; }
  const t = LANGUES[langue];
  globalThis.game = { i18n: { lang: langue, has: k => k in t, localize: k => t[k] ?? k,
    format: (k, d = {}) => String(t[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in d ? String(d[x]) : m)) } };
}

const { langueDuMonde } = await import("../scripts/contenus.js");
const { consigneLangue } = await import("../scripts/contexte.js");
const { consigneSysteme, consigneLangueCompagnon } = await import("../scripts/compagnons.js");
const { texteJoueurs } = await import("../scripts/utilitaires.js");
const { choisirVoix, consignesLecture } = await import("../scripts/voix-texte.js");
const { nomAfficheDe, PERSONNALITES_DE_BASE } = await import("../scripts/personnalites.js");
const H = await import("../scripts/horloges-logique.js");
const F = await import("../scripts/fetes-logique.js");
const { vueContacts } = await import("../scripts/contacts-logique.js");
const D = await import("../scripts/decisions.js");

test("langue du monde : celle du module de contenu actif, sinon celle de l'interface", () => {
  assert.equal(langueDuMonde({ module: "lakour-40k-en", lang: "fr" }), "en");
  assert.equal(langueDuMonde({ module: "lakour-fenoir", lang: "en" }), "fr");
  assert.equal(langueDuMonde({ module: null, lang: "en-GB" }), "en");
  assert.equal(langueDuMonde({ module: null, lang: "fr" }), "fr");
  sousInterface(null);
  assert.equal(langueDuMonde(), "fr", "hors de Foundry : français");
});

test("narrateur : « réponds aux joueurs en anglais » dans un monde anglais ; inchangé en français", () => {
  assert.equal(consigneLangue("fr"), "Tu t'exprimes en français.");
  const en = consigneLangue("en");
  assert.match(en, /en ANGLAIS/);
  assert.match(en, /Always answer the players in English\./);
  assert.match(en, /garde les noms\s+exacts/, "les noms passés aux outils restent exacts");
  // Le prompt système la pose à la place de « Tu t'exprimes en français. » (contexte.js, promptSysteme).
  const source = readFileSync(join(racine, "scripts/contexte.js"), "utf8");
  assert.match(source, /Monde : \$\{game\.world\.title\}\. \$\{consigneLangue\(\)\}`/);
  assert.doesNotMatch(source.replace(/if \(langue !== "en"\) return "Tu t'exprimes en français\.";/, ""), /Tu t'exprimes en français/);
});

test("compagnons IA : leur langue est celle du monde (vue.langue, posée par vueDe)", () => {
  const vue = { nom: "Valentin", monde: "Essai", jeu: "aventure", personnalite: {}, fiche: "" };
  assert.match(consigneSysteme(vue), /Tu t'exprimes en français\./);
  const en = consigneSysteme({ ...vue, langue: "en" });
  assert.match(en, /en ANGLAIS/);
  assert.match(en, /Always speak English\./);
  assert.doesNotMatch(en, /Tu t'exprimes en français/);
  assert.equal(consigneLangueCompagnon(undefined), "Tu t'exprimes en français.");
  assert.match(readFileSync(join(racine, "scripts/compagnons-jeu.js"), "utf8"), /return \{ \.\.\.vue, langue: langueDuMonde\(\) \};/);
});

test("voix et transcription : la langue du monde", () => {
  const VOIX = [{ name: "Denise Online (Natural)", lang: "fr-FR" }, { name: "Aria Online (Natural)", lang: "en-US" }, { name: "Hazel", lang: "en-GB" }];
  assert.equal(choisirVoix(VOIX, "").lang, "fr-FR");
  assert.equal(choisirVoix(VOIX, "", "en").lang, "en-US");
  assert.equal(choisirVoix(VOIX.slice(2), "", "en").name, "Hazel");
  assert.match(consignesLecture("", {}), /mot pour mot, en français, puis tais-toi/);
  assert.match(consignesLecture("", { langue: "en" }), /mot pour mot, en anglais, puis tais-toi/);
  const transcription = readFileSync(join(racine, "scripts/transcription.js"), "utf8");
  assert.match(transcription, /langue: langueDuMonde\(\), consigne: this\.consigne\(\)/);
  assert.match(transcription, /in English\. Names:/);
  assert.match(readFileSync(join(racine, "scripts/fournisseurs/openai.js"), "utf8"), /consignesLecture\(ton, \{ strict, langue: langueDuMonde\(\) \}\)/);
});

// Les textes vus des joueurs, rendus hors de Foundry (repli), avec lang/fr.json et avec lang/en.json.
function textesJoueurs() {
  const t = texteJoueurs;
  const rep = { id: "rep-horde", nom: "Horde", type: "reputation", valeur: 24, max: 100, faction: "Horde", visible: true, paliers: H.PALIERS_REPUTATION };
  const jauge = { id: "expo", nom: "Exposition", type: "jauge", valeur: 4, max: 12, faction: "", visible: true, paliers: [{ nom: "Regards", min: 4 }] };
  const horloge = { id: "rituel", nom: "Rituel", type: "horloge", valeur: 6, max: 6, faction: "", visible: true, paliers: [] };
  const r = D.decompter({ options: ["A", "B"], votes: { x: 0, y: 1 }, votants: ["x", "y", "z"] });
  const r2 = D.decompter({ options: ["A", "B"], votes: { x: 0, y: 0 }, votants: ["x", "y"] });
  const fete = F.normaliserDeclinaison({ id: "vigile", fete: "noel", nom: "Vigile des cierges", description: "", contenu: [] });
  return [
    H.texteEvenement(horloge, { type: "sonne" }, t),
    H.texteEvenement(jauge, { type: "seuil", sens: "monte", nom: "Regards" }, t),
    H.texteEvenement(jauge, { type: "seuil", sens: "descend", nom: "Regards" }, t),
    H.texteEvenement({ ...jauge, valeur: 12 }, { type: "pleine" }, t),
    H.texteEvenement(rep, { type: "palier", avant: "Amical", apres: "Honoré" }, t),
    H.ligneJoueurs(horloge, t), H.ligneJoueurs(jauge, t), H.ligneJoueurs(rep, t),
    H.vuePourFenetre([rep], { t })[0].palier,
    vueContacts([{ id: "c", nom: "Mira", attitude: -2, visible: true }], { t })[0].attitudeTexte,
    F.carteHTML(fete, t),
    D.htmlResultat({ question: "Q ?", anonyme: true, options: [{ libelle: "A" }, { libelle: "B" }] }, r),
    D.htmlResultat({ question: "Q ?", anonyme: true, options: [{ libelle: "A" }, { libelle: "B" }] }, r2),
    ...PERSONNALITES_DE_BASE.map(p => nomAfficheDe(p, t)), nomAfficheDe(undefined, t),
    nomAfficheDe({ id: "conteur", nomAffiche: "Mon conteur" }, t)
  ];
}

test("textes vus des joueurs : le repli français est celui de lang/fr.json ; en anglais, plus de français", () => {
  sousInterface(null);
  const repli = textesJoueurs();
  sousInterface("fr");
  assert.deepEqual(textesJoueurs(), repli, "lang/fr.json et le français du code disent la même chose");
  assert.ok(repli.includes("L'horloge « Rituel » est pleine (6/6) : elle sonne !"));
  assert.ok(repli.includes("Réputation : Honoré (+24)"));
  sousInterface("en");
  const en = textesJoueurs();
  assert.ok(en.includes("The clock “Rituel” is full (6/6): it strikes!"));
  assert.ok(en.includes("Reputation with Horde: Friendly → Honored (+24)."));
  assert.ok(en.includes("Reputation: Honored (+24)"));
  assert.ok(en.includes("Wary (-2)"));
  assert.ok(en.includes("The Inquisitor") && en.includes("GM") && en.includes("Mon conteur"), "un nom choisi par le MJ reste le sien");
  assert.match(en.join("\n"), /<strong>Tie<\/strong> between “A”, “B”\./);
  assert.match(en.join("\n"), /<strong>Decision: A\.<\/strong>/);
  assert.match(en.join("\n"), /\(Christmas\)/);
  for (const texte of en) {
    assert.doesNotMatch(texte, /[éèàç]|\b(?:pour|entre|auprès|jauge|horloge|seuil|voix|Égalité|Décision)\b/i, `reste du français : ${texte}`);
  }
  sousInterface(null);
});

// Chaque appel texteJoueurs("CLE", "français"…) écrit en toutes lettres dans scripts/ : la clé existe dans les deux langues, son
// français est celui du code, et son anglais a les mêmes {paramètres}.
test("texteJoueurs : clés présentes en fr et en, français identique, mêmes paramètres", () => {
  const fichiers = [];
  const parcourir = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) parcourir(p); else if (p.endsWith(".js")) fichiers.push(p); } };
  parcourir(join(racine, "scripts"));
  const params = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
  let vus = 0;
  for (const f of fichiers) {
    const source = readFileSync(f, "utf8");
    for (const m of source.matchAll(/\b(?:texteJoueurs|tj)\(\s*"(LAKOUR_MJIA\.[\w.-]+)",\s*"((?:[^"\\]|\\.)*)"/g)) {
      const [, cle, francais] = m;
      vus++;
      assert.equal(LANGUES.fr[cle], JSON.parse(`"${francais}"`), `${f} : ${cle}`);
      assert.ok(LANGUES.en[cle], `${cle} absente de lang/en.json`);
      assert.equal(params(LANGUES.en[cle]), params(LANGUES.fr[cle]), `${cle} : paramètres`);
    }
  }
  assert.ok(vus >= 15, `appels trouvés : ${vus}`);
  // Les familles dont la clé est composée (difficultés, noms des fêtes, des personnalités, des paliers, des attitudes) : complètes.
  const DIFFICULTES = ["aucune", "tres-facile", "facile", "routiniere", "exigeante", "difficile", "ardue", "tres-ardue"];
  for (const d of DIFFICULTES) assert.ok(LANGUES.en[`LAKOUR_MJIA.Jet.Difficultes.${d}`], d);
  for (const f of F.IDS_FETES) assert.equal(LANGUES.fr[`LAKOUR_MJIA.Fetes.Noms.${f}`], F.nomDeFete(f), f);
  for (const p of PERSONNALITES_DE_BASE) assert.equal(LANGUES.fr[`LAKOUR_MJIA.Personnalites.Noms.${p.id}`], p.nomAffiche, p.id);
  assert.match(readFileSync(join(racine, "scripts/adaptateurs.js"), "utf8"), /export const DIFFICULTES = \["aucune", "tres-facile", "facile", "routiniere", "exigeante", "difficile", "ardue", "tres-ardue"\];/);
});
