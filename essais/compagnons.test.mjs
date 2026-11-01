// Compagnons IA, logique pure (modules/lakour-mj-ia/scripts/compagnons.js) : réponses du modèle validées (JSON strict ;
// invalide = passer), repli sans IA déterministe, pas de boucle entre compagnons, budget, coût au modèle des compagnons,
// et une batterie par mutation. Aucun appel payant : les fournisseurs sont des doublures.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const C = await import("../scripts/compagnons.js");
const K = await import("../scripts/constantes.js");

// ------------------------------------------------------------------ doublures
const vue = (extra = {}) => ({
  id: "a1", nom: "Mathurin Vaudrey", monde: "Les Veillées de Brumecombe", jeu: "loups",
  personnalite: { temperament: "bavard", parler: "phrases courtes et sèches", histoire: "" },
  fiche: "Tu es Mathurin Vaudrey. Ton rôle SECRET : Villageois.", prive: ["Ta carte de rôle."], public: ["Joueur 1 : bonjour"],
  scene: "Phase : jour, tour 1.", autres: [{ id: "a2", nom: "Ysaline Corbet", vivant: true }, { id: "a3", nom: "Anselme Ferrand", vivant: true }],
  allies: [], suspects: [], vivant: true, peutParler: true, tour: 1, ...extra
});
const candidats = [{ id: "a2", nom: "Ysaline Corbet" }, { id: "a3", nom: "Anselme Ferrand" }, { id: "a1", nom: "Mathurin Vaudrey" }];
const demandeCibles = (extra = {}) => ({ type: "cibles", invite: "Qui éclairer cette nuit ?", candidats, nombre: 1, cle: "n1", ...extra });

// Un fournisseur qui répond ce qu'on lui dit et note ce qu'il reçoit.
function fournisseur(reponses, { nom = "anthropic", usage = { entree: 1000, cacheLecture: 0, cacheEcriture: 0, sortie: 100 } } = {}) {
  const recu = [];
  let i = 0;
  return {
    nom, recu,
    async envoyerCourt(contexte) {
      recu.push(contexte);
      const r = typeof reponses === "function" ? reponses(contexte, i) : reponses[Math.min(i, reponses.length - 1)];
      i++;
      if (r instanceof Error) throw r;
      return typeof r === "string" ? { texte: r, usage, arret: "fin" } : { usage, ...r };
    }
  };
}

function cerveaux(f, extra = {}) {
  const comptes = [];
  const c = new C.CerveauxCompagnons({ fournisseur: () => f, modele: () => "claude-haiku-5-5", compter: async (u, m) => comptes.push({ u, m }), graine: "essai", ...extra });
  return { c, comptes };
}

// ------------------------------------------------------------------ validation
test("décision : JSON strict validé ; le nom exact d'un candidat devient son identifiant", () => {
  assert.deepEqual(C.analyserDecision('{"cibles": ["Ysaline Corbet"]}', demandeCibles()), { valeur: { cibles: ["a2"] } });
  assert.deepEqual(C.analyserDecision('```json\n{"cibles": ["anselme ferrand"]}\n```', demandeCibles()), { valeur: { cibles: ["a3"] } });
  assert.deepEqual(C.analyserDecision('{"cibles": []}', demandeCibles()), { valeur: { cibles: [] } }, "passer est une réponse valide");
  assert.deepEqual(C.analyserDecision('{"cibles": ["Ysaline Corbet", "Anselme Ferrand"]}', demandeCibles({ nombre: 2 })), { valeur: { cibles: ["a2", "a3"] } });
  assert.deepEqual(C.analyserDecision('{"texte": "  Méfie-toi   du meunier. "}', { type: "texte", max: 120 }), { valeur: { texte: "Méfie-toi du meunier." } });
  assert.equal(C.analyserDecision(`{"texte": "${"x".repeat(300)}"}`, { type: "texte", max: 50 }).valeur.texte.length, 50, "texte coupé à la longueur permise");
  assert.deepEqual(C.analyserDecision('{"choix": "On négocie"}', { type: "option", options: ["On attaque", "On négocie"] }), { valeur: { choix: 1 } });
  assert.deepEqual(C.analyserDecision('{"choix": null}', { type: "option", options: ["On attaque", "On négocie"] }), { valeur: { choix: null } });
});

test("décision : toute réponse invalide est refusée (null), donc vaut « passer »", () => {
  const invalides = [
    "Je vote pour Ysaline Corbet.", "", "null", "[]", '["Ysaline Corbet"]', '{"cibles": "Ysaline Corbet"}', '{"cibles": ["Inconnu"]}',
    '{"cibles": ["Ysaline Corbet", "Anselme Ferrand"]}', '{"cibles": ["Ysaline Corbet", "Ysaline Corbet"]}', '{"cibles": [3]}',
    '{"cibles": ["Ysaline Corbet"], "raison": "elle ment"}', '{"cible": ["Ysaline Corbet"]}', 'Voici : {"cibles": ["Ysaline Corbet"]}',
    '{"cibles": ["Ysaline Corbet"]', "{'cibles': ['Ysaline Corbet']}"
  ];
  for (const t of invalides) assert.equal(C.analyserDecision(t, demandeCibles()), null, `acceptée à tort : ${t}`);
  assert.equal(C.analyserDecision('{"choix": 1}', { type: "option", options: ["a", "b"] }), null, "un index au lieu du libellé");
  assert.equal(C.analyserDecision('{"choix": "c"}', { type: "option", options: ["a", "b"] }), null);
  assert.equal(C.analyserDecision('{"texte": 12}', { type: "texte", max: 50 }), null);
  assert.deepEqual(C.passer(demandeCibles()), { cibles: [] });
  assert.deepEqual(C.passer({ type: "texte" }), { texte: "" });
  assert.deepEqual(C.passer({ type: "option" }), { choix: null });
});

test("cerveau : une réponse invalide du modèle, un refus ou un texte hors format valent « passer », sans repli ni nouvel essai", async () => {
  for (const r of ["Ysaline, évidemment.", '{"cibles": ["Personne"]}', { texte: '{"cibles": ["Ysaline Corbet"]}', arret: "refus" }]) {
    const f = fournisseur([r]);
    const { c } = cerveaux(f);
    const d = await c.decider(vue(), demandeCibles());
    assert.deepEqual(d, { cibles: [], source: "invalide" }, JSON.stringify(r));
    assert.equal(f.recu.length, 1, "un seul appel");
  }
  const { c } = cerveaux(fournisseur(['{"cibles": ["Anselme Ferrand"]}']));
  assert.deepEqual(await c.decider(vue(), demandeCibles()), { cibles: ["a3"], source: "ia" });
});

test("réplique : nettoyée (ni nom devant, ni guillemets, ni méta) ; « — » = rien à dire", async () => {
  assert.equal(C.nettoyerReplique("Mathurin Vaudrey : « Je n'ai rien vu. »", "Mathurin Vaudrey"), "Je n'ai rien vu.");
  assert.equal(C.nettoyerReplique("**Mathurin Vaudrey** — Et toi ?", "Mathurin Vaudrey"), "Et toi ?");
  assert.equal(C.nettoyerReplique("[réflexion]\nJe garde un œil sur toi.", "X"), "Je garde un œil sur toi.");
  for (const vide of ["—", " - ", "", "(rien)", "Rien."]) assert.equal(C.nettoyerReplique(vide, "X"), "");
  assert.ok(C.nettoyerReplique("a".repeat(900)).length <= 500);
  const { c } = cerveaux(fournisseur(["Mathurin Vaudrey : Je soupçonne le meunier."]));
  assert.deepEqual(await c.parler(vue()), { texte: "Je soupçonne le meunier.", source: "ia" });
  assert.deepEqual(await c.parler(vue({ peutParler: false })), { texte: "", source: "muet" }, "un mort ou un muet se tait, sans appel");
});

// ------------------------------------------------------------------ ce qui part au modèle
test("contexte : seule la vue entre dans le prompt ; la consigne JSON nomme les candidats", () => {
  const v = vue({ prive: ["PRIVE-1"], public: ["PUBLIC-1"], scene: "SCENE-1" });
  const { systeme, texte } = C.contexteCompagnon(v, { demande: demandeCibles() });
  assert.match(systeme, /Tu joues Mathurin Vaudrey/);
  assert.match(systeme, /Tu n'es PAS le meneur de jeu/);
  assert.match(systeme, /Tu es bavard/);
  for (const m of ["PRIVE-1", "PUBLIC-1", "SCENE-1"]) assert.ok(texte.includes(m), m);
  assert.match(texte, /Candidats : Ysaline Corbet, Anselme Ferrand, Mathurin Vaudrey\./);
  assert.match(texte, /\{"cibles": \["Nom exact"\]\}/);
  // Rien d'autre que la vue : un champ inconnu (ex. l'état complet glissé par erreur) n'est jamais lu.
  const avecIntrus = C.contexteCompagnon({ ...v, etat: { nuit: "CANARI-NUIT" }, roles: ["CANARI-ROLE"] }, { demande: demandeCibles() });
  assert.ok(!JSON.stringify(avecIntrus).includes("CANARI"), "un champ hors de la vue a fuité dans le prompt");
  assert.match(C.contexteCompagnon(v).texte, /réponds seulement « — »/, "parler : la consigne de réplique");
  assert.match(C.contexteCompagnon({ ...v, jeu: "aventure" }, { consigne: C.CONSIGNE_COMBAT }).texte, /C'est ton tour de combat/);
});

// ------------------------------------------------------------------ repli sans IA
test("repli : sans fournisseur, fournisseur factice, budget épuisé ou erreur réseau — jamais d'appel, jamais de blocage", async () => {
  const appele = fournisseur(['{"cibles": ["Ysaline Corbet"]}']);
  for (const [cas, opts] of [
    ["sans clé", { fournisseur: () => null }],
    ["factice", { fournisseur: () => ({ nom: "factice", envoyerCourt: appele.envoyerCourt }) }],
    ["fournisseur sans appel court", { fournisseur: () => ({ nom: "anthropic" }) }],
    ["budget épuisé", { fournisseur: () => appele, budgetDepasse: () => true }],
    ["fournisseur qui lève", { fournisseur: () => { throw new Error("pas de clé"); } }]
  ]) {
    const c = new C.CerveauxCompagnons({ graine: "essai", ...opts });
    const d = await c.decider(vue(), demandeCibles());
    assert.equal(d.source, "repli", cas);
    assert.ok(d.cibles.every(id => candidats.some(x => x.id === id)), `${cas} : cible hors des candidats`);
    assert.equal((await c.parler(vue())).source, "repli", cas);
  }
  assert.equal(appele.recu.length, 0, "aucun appel au modèle en repli");
  const reseau = cerveaux(fournisseur([new Error("réseau")]));
  assert.equal((await reseau.c.decider(vue(), demandeCibles())).source, "repli", "erreur réseau : repli, la partie continue");
});

test("repli : déterministe (même graine, même choix), un loup ne vise pas les siens, un villageois vise un suspect, un vote peut s'abstenir", async () => {
  const d = (v, dem, g = "essai") => C.repliDecision(v, dem, g);
  assert.deepEqual(d(vue(), demandeCibles()), d(vue(), demandeCibles()), "reproductible");
  const loup = vue({ allies: ["a2"] });
  for (let i = 0; i < 60; i++) {
    const r = d(loup, demandeCibles({ cle: `n${i}` }));
    assert.equal(r.cibles.length, 1, "la meute chasse toujours");
    assert.ok(!r.cibles.includes("a2") && !r.cibles.includes("a1"), "un loup vise un des siens ou lui-même");
  }
  const enquete = vue({ suspects: ["a3"] });
  const votes = Array.from({ length: 80 }, (_, i) => d(enquete, demandeCibles({ vote: true, cle: `v${i}` })).cibles[0] ?? "");
  assert.ok(votes.filter(v => v === "a3").length > 50, "le suspect connu reçoit la plupart des voix");
  assert.ok(votes.includes(""), "un compagnon peut s'abstenir");
  assert.ok(!votes.includes("a1"), "on ne vote pas contre soi");
  assert.deepEqual(d(vue(), { type: "texte", max: 20, cle: "t" }).texte.length <= 20, true);
  assert.ok(Number.isInteger(d(vue(), { type: "option", options: ["a", "b", "c"], cle: "o" }).choix));
  // Les répliques varient d'un tour de parole à l'autre et ne nomment jamais un allié.
  const { c } = cerveaux(null);
  const dites = new Set();
  for (let i = 0; i < 12; i++) dites.add((await c.parler(vue({ personnalite: { temperament: "bavard" }, allies: ["a2"] }))).texte);
  assert.ok(dites.size > 2, "le repli radote");
  assert.ok(![...dites].some(t => t.includes("Ysaline")), "un loup accuse son allié");
  assert.match(C.repliReplique(vue(), "g", { combat: true }), /\w/, "en combat, une action est toujours déclarée");
});

test("personnalité : tirée d'une graine (toujours la même pour un acteur), complétée si incomplète", () => {
  assert.deepEqual(C.personnaliteAuHasard("acteur-1"), C.personnaliteAuHasard("acteur-1"));
  const p = C.normaliserPersonnalite({ temperament: "inconnu", parler: "" }, "acteur-1");
  assert.ok(C.TEMPERAMENTS[p.temperament]);
  assert.ok(C.FACONS_DE_PARLER.includes(p.parler));
  assert.equal(C.normaliserPersonnalite({ temperament: "taciturne", parler: "grave", histoire: " Ancien garde. " }).histoire, "Ancien garde.");
});

// ------------------------------------------------------------------ rythme : pas de boucle entre compagnons
test("rythme : un lot de seules répliques de compagnons ne relance pas les compagnons ; un humain ou un événement, si", () => {
  assert.equal(C.peuventReagir([{ source: "compagnon" }, { source: "compagnon" }]), false);
  assert.equal(C.peuventReagir([]), false);
  assert.equal(C.peuventReagir([{ source: "compagnon" }, { source: "humain" }]), true);
  assert.equal(C.peuventReagir([{ source: "evenement" }]), true);
  assert.equal(C.peuventReagir([{ texte: "ancien format sans source" }]), true);
  assert.equal(C.peuventReagir([{ source: "annonce" }, { source: "compagnon" }]), false, "une annonce du système (mort, vote) ne réveille personne");
  assert.equal(C.estAnnonceSysteme('<div class="lakour-loups annonce">Aubin meurt.</div>'), true);
  assert.equal(C.estAnnonceSysteme("<p>Aubin ment.</p>"), false);
});

test("rythme : au plus N orateurs, une fois chacun ; les cités d'abord, puis ceux qui ont parlé le moins récemment", () => {
  const cs = [{ id: "a", nom: "Aude" }, { id: "b", nom: "Basile" }, { id: "c", nom: "Céleste" }];
  assert.deepEqual(C.choisirOrateurs(cs, { max: 0 }), []);
  assert.deepEqual(C.choisirOrateurs(cs, { max: 2 }).map(c => c.id), ["a", "b"]);
  assert.deepEqual(C.choisirOrateurs(cs, { max: 1, mentions: "Et toi, Céleste ?" }).map(c => c.id), ["c"]);
  assert.deepEqual(C.choisirOrateurs(cs, { max: 2, derniere: new Map([["a", 5], ["b", 2]]) }).map(c => c.id), ["c", "b"]);
  assert.equal(C.choisirOrateurs(cs, { max: 10 }).length, 3, "personne ne parle deux fois");
  assert.deepEqual(C.BAVARDAGE, { silencieux: 0, discret: 1, normal: 2, bavard: 3 });
});

// ------------------------------------------------------------------ modèle, coût, budget
test("modèle des compagnons : Claude Haiku 5.5 chez Anthropic, le moins cher chez OpenAI ; leur coût au prix de CE modèle", async () => {
  assert.equal(K.modeleCompagnonsParDefaut("anthropic"), "claude-haiku-5-5");
  assert.ok(K.MODELES_ANTHROPIC["claude-haiku-5-5"], "le modèle existe dans la liste des prix");
  const luna = K.modeleCompagnonsParDefaut("openai");
  const prix = p => p.entree + p.sortie;
  for (const [cle, p] of Object.entries(K.PRIX_OPENAI)) assert.ok(prix(K.PRIX_OPENAI[luna]) <= prix(p), `${cle} moins cher que ${luna}`);
  const usage = { entree: 2000, cacheLecture: 0, cacheEcriture: 0, sortie: 200 };
  assert.equal(K.coutDe(usage, K.prixDuModele("anthropic", "claude-haiku-5-5")), (2000 * 0.1 + 200 * 0.5) / 1e6);
  assert.ok(K.coutDe(usage, K.prixDuModele("anthropic", "claude-opus-5-5")) > 30 * K.coutDe(usage, K.prixDuModele("anthropic", "claude-haiku-5-5")));
  const { c, comptes } = cerveaux(fournisseur(['{"cibles": []}']));
  await c.decider(vue(), demandeCibles());
  assert.deepEqual(comptes, [{ u: { entree: 1000, cacheLecture: 0, cacheEcriture: 0, sortie: 100 }, m: "claude-haiku-5-5" }], "chaque appel est compté, avec son modèle");
});

test("budget : quand il est atteint, les compagnons passent au repli (plus aucun appel), la partie continue", async () => {
  let cout = 0;
  const f = fournisseur(() => '{"cibles": ["Ysaline Corbet"]}', { usage: { entree: 0, cacheLecture: 0, cacheEcriture: 0, sortie: 1e6 } });
  const c = new C.CerveauxCompagnons({
    fournisseur: () => f, modele: () => "claude-haiku-5-5", graine: "essai",
    compter: async (u, m) => { cout += K.coutDe(u, K.prixDuModele("anthropic", m)); },
    budgetDepasse: () => cout >= 1
  });
  const sources = [];
  for (let i = 0; i < 4; i++) sources.push((await c.decider(vue(), demandeCibles({ cle: `b${i}` }))).source);
  assert.deepEqual(sources, ["ia", "ia", "repli", "repli"], "0,5 $ par appel, budget 1 $");
  assert.equal(f.recu.length, 2);
  assert.equal(c.appels, 2);
});

// ------------------------------------------------------------------ mutations
// Chaque règle est cassée à son tour dans une copie de compagnons.js ; la batterie doit alors échouer.
const SOURCE = fileURLToPath(new URL("../scripts/compagnons.js", import.meta.url));
const MUTATIONS = {
  "texte autour du JSON accepté": ['let obj;\n  try { obj = JSON.parse(brut); }', 'let obj;\n  try { obj = JSON.parse(brut.slice(brut.indexOf("{"))); }'],
  "clés en trop acceptées": ['if (cles.length !== 1 || cles[0] !== "cibles" || !Array.isArray(obj.cibles)) return null;', 'if (!Array.isArray(obj.cibles)) return null;'],
  "trop de cibles acceptées": ["if (obj.cibles.length > n || obj.cibles.some(c => typeof c !== \"string\")) return null;", "if (obj.cibles.some(c => typeof c !== \"string\")) return null;"],
  "nom inconnu ignoré au lieu de refuser": ["if (!c || ids.includes(c.id)) return null;", "if (!c || ids.includes(c.id)) continue;"],
  "réponse invalide : repli au lieu de passer": ['return v ? { ...v.valeur, source: "ia" } : { ...passer(demande), source: "invalide" };', 'return v ? { ...v.valeur, source: "ia" } : { ...repliDecision(vue, demande, this.graine), source: "invalide" };'],
  "budget ignoré": ["if (this.budgetDepasse()) return null;", ""],
  "factice appelé": ['if (!f || f.nom === "factice" || typeof f.envoyerCourt !== "function") return null;', 'if (!f || typeof f.envoyerCourt !== "function") return null;'],
  "coût non compté": ["await this.compter(r?.usage ?? {}, this.modele());", ""],
  "boucle : les compagnons se relancent entre eux": ['export const peuventReagir = lot => (lot ?? []).some(e => !SANS_REACTION.includes(e?.source ?? "humain"));', "export const peuventReagir = lot => (lot ?? []).length > 0;"],
  "une annonce du système réveille les compagnons": ['export const SANS_REACTION = ["compagnon", "annonce"];', 'export const SANS_REACTION = ["compagnon"];'],
  "un compagnon parle deux fois": [".slice(0, max);\n}", ".flatMap(c => [c, c]).slice(0, max);\n}"],
  "repli non déterministe": ["const h = hasard(`decider|${graine}|${vue.id}|${demande.cle ?? demande.invite ?? demande.question ?? \"\"}`);", "const h = Math.random;"],
  "un loup vise les siens": ["const permis = (allies.size ? pasSoi.filter(c => !allies.has(c.id)) : pasSoi);", "const permis = pasSoi;"],
  "le prompt lit l'état complet": ["...liste(\"Ce que tu sais en privé\", vue.prive, \"(rien)\"),", "...liste(\"Ce que tu sais en privé\", [...(vue.prive ?? []), JSON.stringify(vue.etat ?? \"\")], \"(rien)\"),"]
};

async function batterie(M) {
  const echecs = [];
  const verifier = async (nom, fn) => { try { await fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  await verifier("invalides", () => {
    for (const t of ['Voici : {"cibles": ["Ysaline Corbet"]}', '{"cibles": ["Ysaline Corbet"], "raison": "x"}', '{"cibles": ["Ysaline Corbet", "Anselme Ferrand"]}', '{"cibles": ["Inconnu"]}']) {
      assert.equal(M.analyserDecision(t, demandeCibles()), null, t);
    }
  });
  await verifier("invalide = passer", async () => {
    const c = new M.CerveauxCompagnons({ fournisseur: () => fournisseur(["bla"]), graine: "g" });
    assert.deepEqual((await c.decider(vue(), demandeCibles())).cibles, []);
  });
  await verifier("budget", async () => {
    const f = fournisseur(['{"cibles": []}']);
    const c = new M.CerveauxCompagnons({ fournisseur: () => f, budgetDepasse: () => true, graine: "g" });
    await c.decider(vue(), demandeCibles());
    assert.equal(f.recu.length, 0);
  });
  await verifier("factice", async () => {
    const f = fournisseur(['{"cibles": []}'], { nom: "factice" });
    const c = new M.CerveauxCompagnons({ fournisseur: () => f, graine: "g" });
    await c.decider(vue(), demandeCibles());
    assert.equal(f.recu.length, 0);
  });
  await verifier("coût", async () => {
    const comptes = [];
    const c = new M.CerveauxCompagnons({ fournisseur: () => fournisseur(['{"cibles": []}']), compter: async u => comptes.push(u), graine: "g" });
    await c.decider(vue(), demandeCibles());
    assert.equal(comptes.length, 1);
  });
  await verifier("boucle", () => assert.equal(M.peuventReagir([{ source: "compagnon" }]), false));
  await verifier("annonce", () => assert.equal(M.peuventReagir([{ source: "annonce" }, { source: "compagnon" }]), false));
  await verifier("orateurs", () => assert.equal(M.choisirOrateurs([{ id: "a", nom: "A" }, { id: "b", nom: "B" }], { max: 2 }).map(c => c.id).join(), "a,b"));
  await verifier("repli déterministe", () => {
    const serie = () => Array.from({ length: 30 }, (_, i) => M.repliDecision(vue(), demandeCibles({ cle: `d${i}`, nombre: 2 }), "g"));
    assert.deepEqual(serie(), serie());
  });
  await verifier("allié", () => {
    for (let i = 0; i < 40; i++) assert.ok(!M.repliDecision(vue({ allies: ["a2"] }), demandeCibles({ cle: `m${i}` }), "g").cibles.includes("a2"));
  });
  await verifier("prompt", () => assert.ok(!JSON.stringify(M.contexteCompagnon({ ...vue(), etat: "CANARI" })).includes("CANARI")));
  return echecs;
}

async function charger(mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-compagnons-"));
  let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
  if (mutation) {
    assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
    texte = texte.replace(mutation[0], mutation[1]);
  }
  writeFileSync(join(dossier, "compagnons.js"), texte);
  return { dossier, M: await import(pathToFileURL(join(dossier, "compagnons.js")).href) };
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const vrai = await charger(null);
  try { assert.deepEqual(await batterie(vrai.M), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  const originaux = { warn: console.warn };
  console.warn = () => {};
  try {
    for (const [nom, mutation] of Object.entries(MUTATIONS)) {
      const m = await charger(mutation);
      try { assert.ok((await batterie(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
    }
  } finally {
    console.warn = originaux.warn;
  }
});
