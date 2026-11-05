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

// ------------------------------------------------------------------ compagnons sans IA, histoire, erreurs des fournisseurs
const C = await import("../scripts/compagnons.js");
const HL = await import("../scripts/histoire-logique.js");
const { FournisseurAnthropic } = await import("../scripts/fournisseurs/anthropic.js");
const { FournisseurOpenAI } = await import("../scripts/fournisseurs/openai.js");
const { Anthropic } = await import("../vendor/anthropic.mjs");
const { OpenAI } = await import("../vendor/openai.mjs");
const { libelleModele } = await import("../scripts/utilitaires.js");
const { MODELES_ANTHROPIC } = await import("../scripts/constantes.js");

// Lettres et mots qui trahissent du français (les noms propres « Odile », « Bastien », « Réunion » mis à part).
const FRANCAIS = /[éèàçêîôûœ]|\b(?:je|tu|nous|vous|les|des|une|est|pas|pour|avec|personne|quelqu'un|toi)\b/i;
const sansNomsPropres = t => String(t).replace(/Odile Basquin|Bastien Grenier|Réunion/g, "");

test("compagnons sans IA : leurs répliques et leurs mots suivent la langue du monde (vue.langue), au même rang", () => {
  const autres = [{ id: "a", nom: "Odile Basquin" }, { id: "b", nom: "Bastien Grenier" }];
  const vue = (jeu, langue) => ({ id: "c1", nom: "Valentin", jeu, langue, tour: 2, autres, suspects: ["b"], allies: [],
    personnalite: { temperament: "bavard" } });
  let dites = 0;
  for (const jeu of ["loups", "aventure"]) {
    for (let n = 0; n < 60; n++) {
      const fr = C.repliReplique(vue(jeu), "g", { n });
      const en = C.repliReplique(vue(jeu, "en"), "g", { n });
      assert.equal(Boolean(fr), Boolean(en), "même silence dans les deux langues");
      if (!en) continue;
      dites++;
      assert.doesNotMatch(sansNomsPropres(en), FRANCAIS, `reste du français : ${en}`);
      const rang = l => C.repliquesDansLaLangue(l)[jeu].findIndex(f => [f("Odile Basquin"), f("Bastien Grenier")].includes(l === "en" ? en : fr));
      assert.ok(rang("fr") >= 0 && rang("fr") === rang("en"), `même réplique, traduite : ${fr} / ${en}`);
    }
    assert.equal(C.repliReplique(vue(jeu, "fr"), "g", { n: 3 }), C.repliReplique(vue(jeu), "g", { n: 3 }), "sans langue : français");
  }
  assert.ok(dites > 20, `répliques dites : ${dites}`);
  for (let n = 0; n < 12; n++) {
    const en = C.repliReplique(vue("aventure", "en"), "g", { combat: true, n });
    assert.ok(C.repliquesDansLaLangue("en").combat.some(f => f() === en), en);
    assert.doesNotMatch(en, FRANCAIS, en);
  }
  // Personne à nommer : « someone », pas « quelqu'un ».
  const seul = { ...vue("loups", "en"), autres: [] };
  const lignes = Array.from({ length: 40 }, (_, n) => C.repliReplique(seul, "g", { n })).filter(Boolean).join("\n");
  assert.doesNotMatch(lignes, /quelqu'un/);
  // Le mot du Messager (décision « texte »).
  for (let i = 0; i < 10; i++) {
    const { texte } = C.repliDecision(vue("loups", "en"), { type: "texte", max: 120, cle: `m${i}` }, "g");
    assert.ok(C.repliquesDansLaLangue("en").mots.includes(texte), texte);
    assert.doesNotMatch(texte, FRANCAIS, texte);
  }
  // Les deux langues ont les mêmes listes, de même longueur (l'aléa tire le même rang).
  const [fr, en] = ["fr", "en"].map(C.repliquesDansLaLangue);
  for (const k of Object.keys(fr)) assert.equal(typeof fr[k] === "string" ? 1 : fr[k].length, typeof en[k] === "string" ? 1 : en[k].length, k);
  assert.ok(fr.loups.some(f => f() === "Je n'accuse personne pour l'instant. Écoutons d'abord."), "le français reste celui d'avant");
});

test("histoire d'un personnage : dossier, journal, pages et questions d'aide dans la langue du monde", () => {
  const fr = HL.donneesJournalHistoire({ nom: "Lucie", systeme: "lakour-survie" });
  assert.equal(fr.name, "Histoire de Lucie");
  assert.deepEqual(fr.pages.map(p => p.name), ["Portrait", "Son histoire", "Ses secrets", "Chapitres"]);
  const en = HL.donneesJournalHistoire({ nom: "Lucie", systeme: "lakour-survie", langue: "en" });
  assert.equal(en.name, "Story of Lucie");
  assert.deepEqual(en.pages.map(p => p.name), ["Portrait", "Story", "Secrets", "Chapters"]);
  assert.ok(en.pages.every(p => HL.estAide(p.text.content)), "pages d'aide reconnues");
  for (const s of HL.SYSTEMES_HISTOIRE) {
    const texte = HL.donneesJournalHistoire({ nom: "X", systeme: s, langue: "en" }).pages.map(p => p.text.content).join(" ");
    assert.doesNotMatch(sansNomsPropres(texte.replace(/&#39;/g, "'")), FRANCAIS, `${s} : ${texte}`);
  }
  assert.equal(HL.dossierHistoires("en"), "Character stories");
  assert.equal(HL.dossierHistoires("fr"), "Histoires des personnages");
  // Une page anglaise sans drapeau est retrouvée par son titre (et une française aussi).
  assert.equal(HL.pageDe({ pages: [{ name: "Story", id: "p1" }] }, "histoire")?.id, "p1");
  assert.equal(HL.pageDe({ pages: [{ name: "Son histoire", id: "p2" }] }, "histoire")?.id, "p2");
  const source = readFileSync(join(racine, "scripts/histoire.js"), "utf8");
  assert.match(source, /const langue = langueDuMonde\(\);/);
  assert.match(source, /niveaux: niveaux\(\), langue/);
});

test("erreurs des fournisseurs et libellés des modèles : dans la langue de l'interface du MJ", () => {
  const erreur = (Classe, extra = {}) => Object.assign(Object.create(Classe.prototype), { message: "boom", status: 400 }, extra);
  const cas = [
    [FournisseurAnthropic, Anthropic, "Anthropic"], [FournisseurOpenAI, OpenAI, "OpenAI"]
  ];
  for (const [F, SDK, nom] of cas) {
    sousInterface(null);
    assert.equal(F.expliquer(erreur(SDK.AuthenticationError)), `Clé ${nom} refusée : vérifie-la dans la configuration du MJ IA.`);
    assert.equal(F.expliquer(erreur(SDK.BadRequestError)), `Requête refusée par ${nom} : boom`);
    sousInterface("fr");
    assert.equal(F.expliquer(erreur(SDK.RateLimitError)), `Trop de requêtes ou crédit épuisé chez ${nom} : réessaie dans un moment.`);
    sousInterface("en");
    const textes = ["AuthenticationError", "PermissionDeniedError", "RateLimitError", "BadRequestError", "APIConnectionError", "InternalServerError"]
      .map(c => F.expliquer(erreur(SDK[c])));
    assert.equal(textes[0], `${nom} key rejected: check it in the AI GM configuration.`);
    assert.equal(textes[3], `Request rejected by ${nom}: boom`);
    assert.equal(textes[5], `${nom} error 400: boom`);
    for (const t of textes) assert.doesNotMatch(t, FRANCAIS, t);
  }
  sousInterface("en");
  assert.equal(libelleModele("claude-opus-5-5"), "Claude Opus 5.5 (recommended)");
  for (const id of Object.keys(MODELES_ANTHROPIC)) assert.doesNotMatch(libelleModele(id), FRANCAIS, id);
  sousInterface(null);
  for (const [id, m] of Object.entries(MODELES_ANTHROPIC)) {
    assert.equal(libelleModele(id), m.libelle, id);
    assert.equal(LANGUES.fr[`LAKOUR_MJIA.Modeles.${id}`], m.libelle, id);
    assert.ok(LANGUES.en[`LAKOUR_MJIA.Modeles.${id}`], `${id} absent de lang/en.json`);
  }
});

test("compagnons sans IA : rien ne s'accorde au genre de la personne citée (ni du compagnon), en français comme en anglais", () => {
  // Accords et pronoms genrés qu'une réplique à trou ne doit pas porter (vu en vrai : « Jacquette Vignal était bien silencieux »).
  const GENRE = /(?<!\p{L})(?:silencieux|silencieuse|il|elle|lui|seul|seule|sûr|sûre|sorti|sortie|he|she|him|her|his|hers|himself|herself)(?!\p{L})/iu;
  for (const langue of ["fr", "en"]) {
    const R = C.repliquesDansLaLangue(langue);
    for (const [k, liste] of Object.entries(R)) {
      for (const f of typeof liste === "string" ? [liste] : liste) {
        for (const nom of ["Jacquette Vignal", "Bastien Grenier"]) {
          const texte = typeof f === "function" ? f(nom) : f;
          assert.doesNotMatch(texte.replace(nom, ""), GENRE, `${langue}.${k} : ${texte}`);
        }
      }
    }
  }
  const dit = C.repliquesDansLaLangue("fr").loups[0]("Jacquette Vignal");
  assert.equal(dit, "Je n'ai rien vu cette nuit, mais on n'a presque pas entendu Jacquette Vignal ce matin.");
  assert.equal(C.repliquesDansLaLangue("en").loups[0]("Jacquette Vignal"), "I saw nothing last night, but Jacquette Vignal kept very quiet this morning.");
});

test("compagnons : « (nothing) » vaut silence, comme « (rien) » et « — »", () => {
  for (const t of ["(nothing)", "Nothing.", "(rien)", "—"]) assert.equal(C.nettoyerReplique(t), "", t);
  assert.equal(C.nettoyerReplique("Nothing to add, I'm watching Colin."), "Nothing to add, I'm watching Colin.");
});
