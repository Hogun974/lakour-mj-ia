// Voix en direct (scripts/voix-flux.js, docs/voix-et-ecoute.md §1) : calendrier de lecture et mémoire tampon, tri des morceaux
// reçus (flux inconnu, doublon, perte), file des voix (une à la fois, narrateur prioritaire), destinataires selon l'audibilité,
// garde de lecture, voix des compagnons ; puis la voix en flux du fournisseur OpenAI sur un faux WebSocket, et une batterie par
// mutation. Aucun appel réseau.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as V from "../scripts/voix-flux.js";
import { FournisseurOpenAI } from "../scripts/fournisseurs/openai.js";
import { MODELE_VOIX, MODELE_OPENAI_DEFAUT } from "../scripts/constantes.js";

// Morceau PCM de `secondes` (24 kHz, 16 bits), en base64.
const pcm = (secondes, octet = 1) => Buffer.alloc(Math.round(secondes * 24000) * 2, octet).toString("base64");
const prochain = () => new Promise(r => setImmediate(r));

test("durée d'un morceau PCM base64, sans le décoder", () => {
  assert.equal(V.dureePcm(pcm(0.1)), 0.1);
  assert.equal(V.dureePcm(pcm(0.25)), 0.25);
  assert.equal(V.dureePcm(Buffer.from([1, 2, 3]).toString("base64")), 1 / 24000, "un octet impair ne compte pas");
  assert.equal(V.dureePcm(""), 0);
});

test("calendrier : 200 ms de mémoire tampon au départ, morceaux joués bout à bout, reprise avec tampon après un trou", () => {
  const c = new V.Calendrier();
  assert.equal(V.TAMPON_S, 0.2);
  assert.equal(c.planifier(10, 0.5), 10.2, "premier morceau : maintenant + tampon");
  assert.equal(c.planifier(10.05, 0.5), 10.7, "le suivant enchaîne sans trou");
  assert.equal(Math.round(c.restant(10.1) * 1000), 1100);
  assert.equal(c.trous, 0);
  // Le réseau a pris du retard : tout est joué, le morceau suivant reprend avec la mémoire tampon.
  assert.equal(c.planifier(12, 0.3), 12.2);
  assert.equal(c.trous, 1);
  assert.equal(c.restant(20), 0);
});

test("calendrier : la mémoire du navigateur est bornée (un morceau trop en avance est jeté)", () => {
  const c = new V.Calendrier({ avanceMax: 2 });
  assert.equal(c.planifier(0, 1.5), 0.2);
  assert.equal(c.planifier(0, 1.5), 1.7);
  assert.equal(c.planifier(0, 1.5), null, "3,2 s d'avance : jeté");
  assert.equal(c.planifier(2, 0.5), 3.2, "une fois rattrapé, on reprend");
});

test("réception : un flux inconnu (joueur arrivé en cours de route) est ignoré tout entier", () => {
  const r = new V.RecepteurFlux();
  assert.equal(r.morceau("f1", 5), false);
  assert.equal(r.morceau("f1", 6), false);
  assert.equal(r.fin("f1", 7), null);
  r.debut("f2");
  assert.equal(r.morceau("f2", 0), true);
});

test("réception : ordre, doublon et retardataire jetés, perte comptée sans bloquer la suite", () => {
  const r = new V.RecepteurFlux();
  r.debut("f");
  assert.deepEqual([0, 1, 1, 0, 4, 5, 3].map(n => r.morceau("f", n)), [true, true, false, false, true, true, false]);
  assert.deepEqual(r.fin("f", 8), { recus: 4, pertes: 2 + 2 }, "2 et 3 perdus au milieu, 6 et 7 à la fin");
  assert.equal(r.morceau("f", 9), false, "après la fin, plus rien");
});

test("réception : un flux resté sans nouvelles est oublié", () => {
  const r = new V.RecepteurFlux();
  r.debut("vieux", 0);
  r.debut("frais", 25);
  assert.deepEqual(r.nettoyer(30), ["vieux"]);
  assert.equal(r.enCours, 1);
});

test("file des voix : une seule à la fois, dans l'ordre du chat, sans passe-droit pour le narrateur ni couper personne", async () => {
  const f = new V.FileDesVoix();
  const ordre = [];
  const parler = async (qui, priorite, affiche) => { const rendre = await f.prendre(priorite, "", affiche); ordre.push(qui); return rendre; };
  const premier = parler("compagnon A", "compagnon");
  const rendreA = await premier;
  // La narration est prête (synthèse en cours) mais pas encore affichée : son tour ne compte qu'à l'affichage.
  let afficher;
  const n = parler("narrateur", "narrateur", new Promise(r => { afficher = r; }));
  const b = parler("compagnon B", "compagnon");
  await prochain();
  afficher();
  await prochain();
  const c = parler("compagnon C", "compagnon");
  await prochain();
  assert.deepEqual(ordre, ["compagnon A"], "personne ne parle par-dessus A");
  rendreA();
  rendreA();   // rendre deux fois ne libère pas deux places
  (await b)();
  (await n)();
  (await c)();
  assert.deepEqual(ordre, ["compagnon A", "compagnon B", "narrateur", "compagnon C"], "l'ordre où on les lit dans le chat");
});

test("file des voix : un affichage raté n'empêche pas la voix ; une voix en préparation n'est pas un repos", async () => {
  const f = new V.FileDesVoix();
  let rater;
  const n = f.prendre("narrateur", "", new Promise((_, rej) => { rater = rej; }));
  assert.equal(f.libre, false, "une narration en préparation compte");
  let repos = false;
  f.attendreRepos().then(() => { repos = true; });
  rater(new Error("affichage"));
  (await n)();
  await prochain();
  assert.equal(repos, true);
});

test("file des voix : le repos attendu arrive quand plus personne ne parle ni n'attend", async () => {
  const f = new V.FileDesVoix();
  await f.attendreRepos();
  const rendre = await f.prendre("narrateur");
  let repos = false;
  f.attendreRepos().then(() => { repos = true; });
  const suivant = f.prendre("compagnon");
  rendre();
  await prochain();
  assert.equal(repos, false, "le compagnon parle encore");
  (await suivant)();
  await prochain();
  assert.equal(repos, true);
});

const UTILISATEURS = [
  { id: "mj", active: true, isGM: true }, { id: "vivant", active: true }, { id: "mort", active: true }, { id: "absent", active: false }
];

test("destinataires : le narrateur pour tous les connectés ; un compagnon pour tous hors des Veillées", () => {
  assert.deepEqual(V.destinatairesVoix({ type: "narrateur", utilisateurs: UTILISATEURS, audibiliteActeur: () => ({ peutParler: false }) }), ["mj", "vivant", "mort"]);
  assert.deepEqual(V.destinatairesVoix({ type: "compagnon", acteurId: "c", utilisateurs: UTILISATEURS }), ["mj", "vivant", "mort"]);
});

test("destinataires aux Veillées : un compagnon mort ne parle qu'aux morts (et au MJ), un compagnon muet à personne", () => {
  const aud = id => ({ morte: { peutParler: true, auditeurs: ["mort", "absent"] }, muet: { peutParler: false, auditeurs: [] } })[id];
  assert.deepEqual(V.destinatairesVoix({ type: "compagnon", acteurId: "morte", utilisateurs: UTILISATEURS, audibiliteActeur: aud }), ["mj", "mort"]);
  assert.deepEqual(V.destinatairesVoix({ type: "compagnon", acteurId: "muet", utilisateurs: UTILISATEURS, audibiliteActeur: aud }), []);
  assert.deepEqual(V.destinatairesVoix({ type: "compagnon", acteurId: "?", utilisateurs: UTILISATEURS, audibiliteActeur: aud }), ["mj", "vivant", "mort"], "pas de réponse : comme avant");
  const panne = () => { throw new Error("x"); };
  assert.deepEqual(V.destinatairesVoix({ type: "compagnon", acteurId: "c", utilisateurs: UTILISATEURS, audibiliteActeur: panne }), ["mj"], "dans le doute, le MJ seul");
});

test("garde de lecture : le début est retenu jusqu'au verdict, puis tout passe aussitôt", () => {
  const g = new V.GardeLecture("La brume monte sur le village.");
  assert.deepEqual(g.morceau("a"), { sortir: [], etat: "attente" });
  assert.deepEqual(g.transcription("La brume"), { sortir: [], etat: "attente" });
  assert.deepEqual(g.transcription(" monte"), { sortir: ["a"], etat: "ok" });
  assert.deepEqual(g.morceau("b"), { sortir: ["b"], etat: "ok" });
});

test("garde de lecture : une réponse au lieu du texte est arrêtée avant d'être entendue ; une lecture qui s'emballe est coupée", () => {
  const g = new V.GardeLecture("La brume monte sur le village.");
  g.morceau("a");
  assert.deepEqual(g.transcription("D'accord, je vais lire"), { sortir: [], etat: "infidele" });
  assert.deepEqual(g.morceau("b"), { sortir: [], etat: "infidele" });
  const long = new V.GardeLecture("Oui.");
  long.transcription("Oui");
  assert.equal(long.morceau("a").etat, "ok");
  assert.equal(long.transcription(" et puis encore beaucoup de mots que personne n'a jamais écrits dans ce texte").etat, "couper");
});

test("garde de lecture : sans transcription, confiance après 1,5 s d'audio ; à la fin, verdict sur le tout", () => {
  const g = new V.GardeLecture("Un texte.");
  assert.equal(g.morceau(pcm(1)).etat, "attente");
  assert.equal(g.morceau(pcm(0.6)).sortir.length, 2);
  const h = new V.GardeLecture("Un texte assez long pour la règle.");
  h.morceau(pcm(0.2));
  assert.deepEqual(h.finir(), { sortir: [pcm(0.2)], etat: "ok" }, "aucune transcription : on fait confiance");
});

test("voix d'un compagnon : selon son tempérament, ni celle du narrateur ni celle d'un autre compagnon, toujours la même", () => {
  assert.equal(V.voixPourCompagnon({ temperament: "taciturne" }), "cedar");
  assert.equal(V.voixPourCompagnon({ temperament: "taciturne" }, { voixNarrateur: "cedar" }), "echo");
  assert.equal(V.voixPourCompagnon({ temperament: "taciturne" }, { voixNarrateur: "cedar", prises: ["echo"] }), "sage");
  const tout = ["cedar", "marin", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "alloy"];
  assert.equal(V.voixPourCompagnon({ temperament: "taciturne" }, { prises: tout.filter(v => v !== "ballad") }), "ballad", "la dernière libre");
  const x = V.voixPourCompagnon({ temperament: "inconnu" }, { graine: "a1", prises: tout });
  assert.equal(V.voixPourCompagnon({ temperament: "inconnu" }, { graine: "a1", prises: tout }), x, "déterministe");
  assert.match(V.tonPourCompagnon({ temperament: "farceur", parler: "voix moqueuse" }), /malicieuse.*Façon de parler : voix moqueuse/);
});

test("ce que lit la voix d'un compagnon : la parole seule, jamais la didascalie", () => {
  assert.equal(V.paroleSeule("*Valentin regarde Clémence, les bras croisés.* — Moi, je l'ai vue sortir hier soir."), "Moi, je l'ai vue sortir hier soir.");
  assert.equal(V.paroleSeule("(Il hausse les épaules.) Peut-être."), "Peut-être.");
  assert.equal(V.paroleSeule("*Elle se tait.*"), "");
  assert.equal(V.paroleSeule("Je n'ai rien vu."), "Je n'ai rien vu.");
});

// ---------------------------------------------------------------- voix en flux du fournisseur OpenAI (faux WebSocket)
// Chaque connexion joue le scénario suivant de la liste dès que le client a demandé sa réponse.
function fauxWebSocket(scenarios, journal) {
  return class {
    constructor() {
      this.ecouteurs = {};
      this.scenario = scenarios[journal.connexions++] ?? [];
      setTimeout(() => this.emettre("message", { data: JSON.stringify({ type: "session.created" }) }), 0);
    }
    addEventListener(type, f) { (this.ecouteurs[type] ??= []).push(f); }
    emettre(type, e) { if (!this.ferme) for (const f of this.ecouteurs[type] ?? []) f(e); }
    send(texte) {
      if (JSON.parse(texte).type !== "response.create") return;
      setTimeout(() => { for (const s of this.scenario) this.emettre("message", { data: JSON.stringify(s) }); }, 0);
    }
    close() { this.ferme = true; journal.fermes++; }
  };
}

function fournisseur(scenarios) {
  const journal = { connexions: 0, fermes: 0, secrets: [] };
  const f = new FournisseurOpenAI({ cle: "x", modele: MODELE_OPENAI_DEFAUT, effort: "low", modeleImage: "gpt-image-2" });
  f.client = {
    realtime: { clientSecrets: { create: async corps => { journal.secrets.push(corps); return { value: "ek" }; } } },
    audio: { speech: { create: async () => { journal.secours = true; return { arrayBuffer: async () => new Uint8Array([1]).buffer }; } } }
  };
  f.WebSocket = fauxWebSocket(scenarios, journal);
  return { f, journal };
}
const audio = d => ({ type: "response.output_audio.delta", delta: d });
const dit = d => ({ type: "response.output_audio_transcript.delta", delta: d });
const fini = { type: "response.done", response: { status: "completed" } };

test("voix en flux : chaque morceau sort dès que la garde le permet, dans l'ordre, et le tout reste pour le WAV", async () => {
  const { f } = fournisseur([[audio("A"), dit("La brume monte"), audio("B"), audio("C"), fini]]);
  const sortis = [];
  const r = await f.voixEnFlux({ texte: "La brume monte sur le village.", modele: MODELE_VOIX, voix: "cedar", ton: "", surMorceau: b => sortis.push(b) });
  assert.deepEqual(sortis, ["A", "B", "C"]);
  assert.deepEqual(r, { morceaux: ["A", "B", "C"], coupe: false });
});

test("voix en flux : une lecture infidèle n'est jamais entendue, second essai aux consignes strictes", async () => {
  const { f, journal } = fournisseur([
    [audio("X"), dit("D'accord, je vais lire ce texte"), audio("Y"), fini],
    [audio("A"), dit("La brume monte"), audio("B"), fini]
  ]);
  const sortis = [];
  const r = await f.voixEnFlux({ texte: "La brume monte sur le village.", modele: MODELE_VOIX, voix: "cedar", ton: "", surMorceau: b => sortis.push(b) });
  assert.deepEqual(sortis, ["A", "B"], "rien du premier essai");
  assert.equal(r.morceaux.length, 2);
  assert.equal(journal.connexions, 2);
  assert.match(journal.secrets[1].session.instructions, /premier mot/);
});

test("voix en flux : deux lectures infidèles → l'ancienne voix (fichier entier) ; un modèle non Realtime → fichier entier", async () => {
  const mauvais = [audio("X"), dit("Bien sûr, voici"), fini];
  const { f, journal } = fournisseur([mauvais, mauvais]);
  const r = await f.voixEnFlux({ texte: "La brume monte sur le village.", modele: MODELE_VOIX, voix: "cedar", ton: "", surMorceau: () => assert.fail("rien ne doit sortir") });
  assert.ok(r.blob instanceof Blob);
  assert.ok(journal.secours);
  const autre = fournisseur([]);
  assert.ok((await autre.f.voixEnFlux({ texte: "x", modele: "gpt-4o-mini-tts", voix: "cedar", ton: "" })).blob instanceof Blob);
  assert.equal(autre.journal.connexions, 0);
});

test("voix en flux : une erreur avant le moindre son est rejetée (le moteur se rabat sur le fichier) ; après, on garde ce qui est dit", async () => {
  const { f } = fournisseur([[{ type: "error", error: { message: "quota dépassé" } }]]);
  await assert.rejects(f.voixEnFlux({ texte: "Un.", modele: MODELE_VOIX, voix: "cedar", ton: "", surMorceau: () => {} }), /quota dépassé/);
  const tard = fournisseur([[dit("La brume monte"), audio("A"), { type: "error", error: { message: "coupure" } }]]);
  const r = await tard.f.voixEnFlux({ texte: "La brume monte sur le village.", modele: MODELE_VOIX, voix: "cedar", ton: "", surMorceau: () => {} });
  assert.deepEqual(r.morceaux, ["A"]);
  assert.equal(r.coupe, true);
  assert.match(r.erreur.message, /coupure/);
});

// ---------------------------------------------------------------- mutations (voix-flux.js)
// Chaque règle est cassée à son tour dans une copie de voix-flux.js ; la batterie doit alors échouer.
const SOURCE = fileURLToPath(new URL("../scripts/voix-flux.js", import.meta.url));
const TEXTE = fileURLToPath(new URL("../scripts/voix-texte.js", import.meta.url));
const MUTATIONS = {
  "trou sans mémoire tampon": ["      debut = maintenant + this.tampon;", "      debut = maintenant;"],
  "mémoire sans plafond": ["    if (this.fin - maintenant > this.avanceMax) return null;\n", ""],
  "flux inconnu joué": ["    if (!f || f.fini) return false;                    // flux inconnu", "    if (f?.fini) return false;                    // flux inconnu"],
  "doublon rejoué": ["n < f.attendu) return false;", "n < f.attendu - 1) return false;"],
  "perte non comptée": ["    if (n > f.attendu) f.pertes += n - f.attendu;      // morceaux perdus", "    // morceaux perdus"],
  "tour pris avant l'affichage": ["      if (!affiche) return entrer();", "      return entrer();"],
  "préparation comptée comme repos": ["    return !this.occupant && !this.attente.length && !this.enPreparation;", "    return !this.occupant && !this.attente.length;"],
  "deux voix à la fois": ["  #suivant() {\n    if (this.occupant) return;", "  #suivant() {"],
  "voix du compagnon à tous": ["  return tous.filter(id => auditeurs.has(id) || mj.includes(id));", "  return tous;"],
  "compagnon muet entendu": ["  if (a.peutParler === false) return [];\n", ""],
  "lecture infidèle entendue": ["this.etat = this.attendus.slice(0, n).every((m, i) => t[i] === m) ? \"ok\" : \"infidele\";", "this.etat = \"ok\";"],
  "lecture qui s'emballe": ["    if (this.etat === \"ok\" && this.#tropLong()) this.etat = \"couper\";\n", ""],
  "début non retenu": ["    this.retenus.push(b64);\n", "    this.retenus.push(b64);\n    this.etat = \"ok\";\n"],
  "didascalie lue": ["    .replace(/^(?:\\*{1,2}[^*]+\\*{1,2}|_[^_]+_|\\([^()]+\\))\\s*(?:[—–-]+\\s*)?/, \"\");", ";"],
  "voix du narrateur reprise": ["const exclues = new Set([...prises, voixNarrateur].filter(Boolean));", "const exclues = new Set(prises);"]
};

async function batterie(M) {
  const echecs = [];
  const verifier = async (nom, fn) => { try { await fn(); } catch (e) { echecs.push(`${nom} : ${e.message}`); } };
  await verifier("tampon", () => {
    const c = new M.Calendrier();
    c.planifier(0, 0.1);
    assert.equal(c.planifier(5, 0.1), 5.2);
  });
  await verifier("plafond", () => assert.equal(new M.Calendrier({ avanceMax: 1 }).planifier(0, 5) !== null && new M.Calendrier({ avanceMax: 1 }).planifier(0, 5), 0.2));
  await verifier("plafond 2", () => { const c = new M.Calendrier({ avanceMax: 1 }); c.planifier(0, 5); assert.equal(c.planifier(0, 1), null); });
  await verifier("inconnu", () => assert.equal(new M.RecepteurFlux().morceau("x", 0), false));
  await verifier("doublon", () => { const r = new M.RecepteurFlux(); r.debut("f"); r.morceau("f", 0); r.morceau("f", 1); assert.equal(r.morceau("f", 1), false); });
  await verifier("perte", () => { const r = new M.RecepteurFlux(); r.debut("f"); r.morceau("f", 0); r.morceau("f", 3); assert.equal(r.fin("f", 4).pertes, 2); });
  await verifier("ordre du chat", async () => {
    const f = new M.FileDesVoix();
    const ordre = [];
    const rendre = await f.prendre("compagnon");
    // Chacun rend la parole aussitôt reçue : aucune attente croisée, même sur un code cassé.
    let afficher;
    const n = f.prendre("narrateur", "", new Promise(r => { afficher = r; })).then(r => { ordre.push("n"); r(); });
    const c = f.prendre("compagnon").then(r => { ordre.push("c"); r(); });
    await prochain();
    afficher();
    await prochain();
    rendre();
    await Promise.all([c, n]);
    assert.deepEqual(ordre, ["c", "n"]);
  });
  await verifier("préparation", () => {
    const f = new M.FileDesVoix();
    f.prendre("narrateur", "", new Promise(() => {}));
    assert.equal(f.libre, false);
  });
  await verifier("une à la fois", async () => {
    const f = new M.FileDesVoix();
    await f.prendre("narrateur");
    let deuxieme = false;
    f.prendre("narrateur").then(() => { deuxieme = true; });
    await prochain();
    assert.equal(deuxieme, false);
  });
  await verifier("destinataires", () => {
    const aud = () => ({ peutParler: true, auditeurs: ["mort"] });
    assert.deepEqual(M.destinatairesVoix({ type: "compagnon", utilisateurs: UTILISATEURS, audibiliteActeur: aud }), ["mj", "mort"]);
  });
  await verifier("muet", () => assert.deepEqual(M.destinatairesVoix({ type: "compagnon", utilisateurs: UTILISATEURS, audibiliteActeur: () => ({ peutParler: false, auditeurs: ["mort"] }) }), []));
  await verifier("infidèle", () => { const g = new M.GardeLecture("La brume monte."); g.morceau("a"); assert.equal(g.transcription("Bien sûr voici").etat, "infidele"); });
  await verifier("emballe", () => { const g = new M.GardeLecture("Oui."); g.transcription("Oui"); g.morceau("a"); assert.equal(g.transcription(" a b c d e f g h i j k l").etat, "couper"); });
  await verifier("retenu", () => assert.deepEqual(new M.GardeLecture("La brume monte.").morceau("a").sortir, []));
  await verifier("didascalie", () => assert.equal(M.paroleSeule("*Il se lève.* — Assez."), "Assez."));
  await verifier("narrateur", () => assert.notEqual(M.voixPourCompagnon({ temperament: "taciturne" }, { voixNarrateur: "cedar" }), "cedar"));
  return echecs;
}

async function charger(mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-voix-flux-"));
  let texte = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
  if (mutation) {
    assert.ok(texte.includes(mutation[0]), `mutation obsolète : ${mutation[0]}`);
    texte = texte.replace(mutation[0], mutation[1]);
  }
  writeFileSync(join(dossier, "voix-flux.js"), texte);
  writeFileSync(join(dossier, "voix-texte.js"), readFileSync(TEXTE, "utf8"));
  return { dossier, M: await import(pathToFileURL(join(dossier, "voix-flux.js")).href) };
}

test("mutations : la batterie passe sur le vrai code et attrape chaque règle cassée", async () => {
  const vrai = await charger(null);
  try { assert.deepEqual(await batterie(vrai.M), []); } finally { rmSync(vrai.dossier, { recursive: true, force: true }); }
  for (const [nom, mutation] of Object.entries(MUTATIONS)) {
    const m = await charger(mutation);
    try { assert.ok((await batterie(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
});
