// Répliques privées (une partie seulement des connectés doit les entendre : un mort qui ne parle qu'aux morts, les loups la nuit
// aux Veillées…) : Foundry sert Data/ à qui en connaît l'adresse, elles n'y sont donc JAMAIS déposées. En direct, leurs morceaux
// vont aux seuls destinataires ; en repli, le fichier entier aussi, par le canal du module, découpé, lu chez eux depuis un Blob
// puis libéré ; trop gros, texte seul. Les fichiers privés des versions d'avant sont écrasés par un silence (pas de suppression
// côté client dans Foundry). Les répliques publiques ne changent pas (déposées pour la réécoute).
// Chaque vérification est rejouée sur des copies mutées des scripts. Fournisseur OpenAI doublé : aucun appel facturé.
// Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}

// ------------------------------------------------------------------ doublure de Foundry
const ID = "lakour-mj-ia";
const reglages = {
  voix: "openai", voixDirecte: true, cleOpenAI: "x", modeleOpenAI: "gpt-6.1-sol", modeleImage: "gpt-image-2", modeleVoix: "gpt-realtime-2.1-mini",
  entendreNarration: true, volumeVoix: 1, personnaliteActive: "p", personnalites: [{ id: "p", nom: "Essai", voixOpenAI: "cedar", tonVoix: "grave" }],
  budgetSeance: 0, longueurVoix: "courte"
};
const etat = { emis: [], deposes: [], joues: [], audios: [], urls: { creees: 0, liberees: 0 }, fichiers: [] };
const mj = { id: "mj", name: "Hogun", isGM: true, active: true };
const joueur = { id: "jo", name: "Jordan", isGM: false, active: true };
const mort = { id: "fan", name: "Fantôme", isGM: false, active: true };
const absent = { id: "vi", name: "Villageois hors ligne", isGM: false, active: false };
let compteur = 0;
globalThis.foundry = {
  applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: {} },
    apps: { FilePicker: { implementation: {
      createDirectory: async () => {},
      upload: async (_s, dossier, fichier) => { etat.deposes.push({ dossier, nom: fichier.name, taille: fichier.size }); return { path: `${dossier}/${fichier.name}` }; },
      browse: async () => ({ files: etat.fichiers })
    } } }
  },
  utils: { randomID: () => `id${++compteur}`, escapeHTML: s => String(s), deepClone: o => structuredClone(o) },
  audio: { AudioHelper: { play: async (o, diffuser) => { etat.joues.push([o.src, diffuser]); return { duration: 0 }; } } }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.ChatMessage = { implementation: { create: async d => d } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1 } };
// Lecture côté client : un élément audio doublé ; les URL de Blob comptées (créées, libérées).
globalThis.Audio = class {
  constructor(src) { this.src = src; this.ecouteurs = {}; etat.audios.push(this); }
  addEventListener(type, f) { this.ecouteurs[type] = f; }
  play() { return Promise.resolve(); }
  finir() { this.ecouteurs.ended?.(); }
};
const urlOrigine = { creer: URL.createObjectURL, liberer: URL.revokeObjectURL };
URL.createObjectURL = blob => { etat.urls.creees++; return urlOrigine.creer(blob); };
URL.revokeObjectURL = url => { etat.urls.liberees++; urlOrigine.liberer(url); };
const moteurDouble = { actif: false, budgetDepasse: () => false, signaler() {}, async compterCout() {} };
const acteur = (id, nom, extra = {}) => ({ id, name: nom, type: "villageois", flags: { [ID]: { compagnon: { temperament: "taciturne" } } },
  system: { compagnon: true, joueur: "", vivant: true, camp: "village", ...extra },
  async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; } });
globalThis.game = {
  user: mj, users: new Collection([["mj", mj], ["jo", joueur], ["fan", mort], ["vi", absent]]), actors: new Collection(),
  settings: { get: (_m, k) => structuredClone(reglages[k]), set: async (_m, k, v) => { reglages[k] = structuredClone(v); } },
  modules: new Map([[ID, { api: { moteur: moteurDouble } }]]),
  socket: { emit: (_c, message, o) => etat.emis.push([message, o.recipients]), on: () => {} },
  system: { id: "lakour-loups" }, world: { id: "monde", title: "Monde" }, i18n: { localize: k => k, format: k => k, has: () => false },
  playlists: [], audio: { locked: true }, scenes: { active: null }, messages: { contents: [] }, combats: { active: null }, packs: new Collection()
};
Object.defineProperty(game.users, "activeGM", { get: () => mj });
// Aux Veillées : le compagnon mort « cm » ne parle qu'aux morts (« fan ») ; le vivant « cv » est entendu de tous.
// « cl », un loup la nuit, n'est entendu que de « jo ».
const AUDITEURS = { cm: ["fan"], cl: ["jo"] };
game.lakourLoups = { audibiliteActeur: id => ({ peutParler: true, auditeurs: AUDITEURS[id] ?? ["mj", "jo", "fan", "vi"] }) };

const vider = () => {
  etat.emis.length = 0; etat.deposes.length = 0; etat.joues.length = 0; etat.audios.length = 0;
  etat.urls.creees = 0; etat.urls.liberees = 0; etat.fichiers = [];
};
const message = () => ({ flags: {}, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; } });

// ------------------------------------------------------------------ chargement (vrais scripts ou copie mutée)
const RACINE = fileURLToPath(new URL("../", import.meta.url));
async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [V, canal, O] = await Promise.all(["scripts/voix.js", "scripts/canal.js", "scripts/fournisseurs/openai.js"].map(m));
  V.brancherVoixDirecte();
  // Doublure de la synthèse : en direct, trois morceaux ; en repli, un fichier de la taille voulue.
  const ctl = { panne: false, taille: 2 };
  const pcm = () => Buffer.alloc(2400, 1).toString("base64");
  O.FournisseurOpenAI.prototype.voixEnFlux = async function ({ surMorceau }) {
    if (ctl.panne) throw new Error("Realtime en panne");
    const morceaux = [pcm(), pcm(), pcm()];
    for (const x of morceaux) surMorceau(x);
    return { morceaux, coupe: false };
  };
  O.FournisseurOpenAI.prototype.genererVoix = async () => new Blob([new Uint8Array(ctl.taille).fill(7)], { type: "audio/mpeg" });
  return { V, canal, ctl };
}

// ------------------------------------------------------------------ la batterie
const VERIFICATIONS = {
  async "privée en direct : morceaux aux seuls destinataires ; rien déposé dans Data ; pas de réécoute"({ V }) {
    vider();
    assert.equal(V.estPrivee(["mj", "fan"], ["mj", "jo", "fan"]), true);
    assert.equal(V.estPrivee(["mj", "jo", "fan"], ["mj", "jo", "fan"]), false);
    // Le public visé comparé à TOUS les comptes : un loup la nuit, le seul villageois connecté parti, reste privé.
    mort.active = false;
    try {
      const l = message();
      await V.direReplique(acteur("cl", "Loup IA"), "Ce soir, le meunier.", l);
      assert.ok(etat.emis.length > 0 && etat.emis.every(([, d]) => d.join() === "jo"));
      assert.deepEqual(etat.deposes, [], "privée même si tous les connectés l'entendent");
      assert.equal(l.flags[ID]?.audio, undefined);
    } finally { mort.active = true; }
    vider();
    const m = message();
    await V.direReplique(acteur("cm", "Mort IA", { vivant: false }), "Je sais qui c'est.", m);
    assert.ok(etat.emis.length > 0 && etat.emis.every(([, d]) => d.join() === "fan"), JSON.stringify(etat.emis.map(([, d]) => d)));
    assert.deepEqual(etat.deposes, [], "jamais dans Data");
    assert.equal(m.flags[ID]?.audio, undefined, "pas de réécoute");
  },

  async "privée en repli : le fichier entier par le canal, découpé, aux seuls destinataires ; jamais d'upload ; le MJ l'entend chez lui"({ V, ctl }) {
    vider();
    ctl.panne = true;
    ctl.taille = 400 * 1024;   // ~533 000 caractères base64 : trois messages
    try {
      await V.direReplique(acteur("cm", "Mort IA", { vivant: false }), "Je sais qui c'est.", message());
    } finally { ctl.panne = false; ctl.taille = 2; }
    const prives = etat.emis.filter(([e]) => e.type === "voix-privee");
    assert.deepEqual(prives.map(([e, d]) => [e.n, e.total, d.join()]), [[0, 3, "fan"], [1, 3, "fan"], [2, 3, "fan"]]);
    assert.ok(prives.every(([e]) => e.donnees.length <= V.TAILLE_MORCEAU_PRIVE));
    assert.deepEqual([etat.deposes, etat.joues], [[], []], "ni upload, ni lecture de fichier par Foundry");
    assert.equal(etat.audios.length, 1, "le MJ, destinataire, l'entend chez lui");
    etat.audios[0].finir();
    assert.deepEqual(etat.urls, { creees: 1, liberees: 1 }, "lue depuis un Blob, puis libérée");
  },

  async "chez un destinataire : morceaux rassemblés (même dans le désordre) ; incomplet, incohérent ou d'un joueur : rien"({ V, canal }) {
    vider();
    const octets = new Uint8Array(700 * 1024).map((_, i) => i % 251);
    // Envoyés par le MJ (la doublure du socket garde le message ; on le rejoue chez le destinataire, émetteur « mj »).
    await V.envoyerVoixPrivee(new Blob([octets], { type: "audio/mpeg" }), ["fan"], "v1");
    const morceaux = etat.emis.map(([e]) => e);
    game.user = mort;
    try {
      assert.equal(morceaux.length, 4);
      const r = new V.RecepteurPrive();
      assert.ok(r.recevoir(morceaux[2]) === null);
      assert.ok(r.recevoir(morceaux[0]) === null);
      assert.ok(r.recevoir(morceaux[3]) === null, "incomplet : rien");
      const audio = r.recevoir(morceaux[1]);
      assert.deepEqual([audio.mime, audio.octets.length, audio.octets[1000]], ["audio/mpeg", octets.length, octets[1000]]);
      assert.ok(r.recevoir({ ...morceaux[0], id: "v2", total: 999 }) === null);
      assert.equal(r.envois.has("v2"), false, "trop de morceaux annoncés : rien n'est gardé");
      assert.ok(r.recevoir({ ...morceaux[0], id: "v3" }) === null);
      assert.ok(r.recevoir({ ...morceaux[1], id: "v3", total: 5 }) === null);
      assert.ok(r.recevoir({ ...morceaux[2], id: "v3" }) === null);
      assert.ok(r.recevoir({ ...morceaux[3], id: "v3" }) === null, "un morceau d'un autre total ne complète pas l'envoi");
      assert.ok((new V.RecepteurPrive(10).recevoir(morceaux[0], 0) ?? new V.RecepteurPrive(10).recevoir(morceaux[1], 100)) === null);
      // Par le canal : d'un joueur, refusé ; du MJ, joué une fois tout reçu.
      for (const e of morceaux) assert.equal(canal.traiter(e, "jo"), false);
      for (const e of morceaux) canal.traiter(e, "mj");
      assert.equal(etat.audios.length, 1);
    } finally { game.user = mj; }
  },

  async "trop gros : texte seul (rien n'est envoyé) ; publique : déposée pour la réécoute, comme avant"({ V }) {
    vider();
    assert.equal(await V.envoyerVoixPrivee(new Blob([new Uint8Array(V.TAILLE_MAX_PRIVEE + 1)]), ["fan"]), 0);
    assert.equal(etat.emis.length, 0);
    const m = message();
    await V.direReplique(acteur("cv", "Vivant IA"), "Bonjour à tous.", m);
    assert.ok(etat.emis.every(([, d]) => d.join() === "jo,fan"), "tous les autres connectés");
    assert.equal(etat.deposes.length, 1, "la réplique publique est déposée pour la réécoute");
    assert.equal(m.flags[ID].audio.length, 1);
  },

  async "anciens fichiers : tout ce qui n'est pas la réécoute d'une NARRATION publique est écrasé par un silence et perd 🔊"({ V }) {
    vider();
    etat.fichiers = ["lakour-mj-ia/voix/monde/public-0.wav", "lakour-mj-ia/voix/monde/prive-0.wav", "lakour-mj-ia/voix/monde/orphelin%20x.mp3",
      "lakour-mj-ia/voix/monde/compagnon-0.wav"];
    const retirable = audio => ({ flags: { [ID]: { audio: [audio] } }, async unsetFlag(s, k) { delete this.flags[s][k]; } });
    const chuchote = { whisper: ["fan"], ...retirable("lakour-mj-ia/voix/monde/prive-0.wav") };
    // Une réplique de compagnon non chuchotée : son public (restreint ou non) ne se reconnaît pas après coup.
    const compagnon = { whisper: [], ...retirable("lakour-mj-ia/voix/monde/compagnon-0.wav") };
    const narration = { whisper: [], flags: { [ID]: { narration: true, audio: ["/lakour-mj-ia/voix/monde/public-0.wav"] } }, async unsetFlag() { throw new Error("intouché"); } };
    const r = await V.nettoyerVoixPrivees([chuchote, compagnon, narration]);
    assert.deepEqual(r, { liste: true, ecrases: 3, messages: 2 });
    assert.deepEqual(etat.deposes.map(d => [d.nom, d.taille]).sort(), [["compagnon-0.wav", 44], ["orphelin x.mp3", 44], ["prive-0.wav", 44]],
      "un silence (en-tête WAV seul) à leur place");
    assert.deepEqual([chuchote.flags[ID].audio, compagnon.flags[ID].audio], [undefined, undefined]);
    assert.deepEqual(narration.flags[ID].audio, ["/lakour-mj-ia/voix/monde/public-0.wav"]);
  }
};

const MUTATIONS = [
  ["scripts/voix.js", "        if (!this.prive) this.depots.push(this.#deposer(", "        this.depots.push(this.#deposer(", "privée déposée (direct)"],
  ["scripts/voix.js", "    if (this.prive) {\n      // Jamais dans Data", "    if (false) {\n      // Jamais dans Data", "privée déposée (repli)"],
  ["scripts/voix.js", "  const prive = estPrivee(vise, comptes);", "  const prive = false;", "réplique jamais privée"],
  ["scripts/voix.js", "  const comptes = game.users.map(u => u.id);", "  const comptes = game.users.filter(u => u.active).map(u => u.id);", "comparée à tous les comptes"],
  ["scripts/voix.js", "export const estPrivee = (publicVise = [], comptes = []) => comptes.some(id => !publicVise.includes(id));",
    "export const estPrivee = () => false;", "privée : un connecté exclu"],
  ["scripts/voix.js", "      donnees: b64.slice(n * TAILLE_MORCEAU_PRIVE, (n + 1) * TAILLE_MORCEAU_PRIVE) }, destinataires);",
    "      donnees: b64.slice(n * TAILLE_MORCEAU_PRIVE, (n + 1) * TAILLE_MORCEAU_PRIVE) }, game.users.filter(u => u.active).map(u => u.id));", "aux seuls destinataires"],
  ["scripts/voix.js", "  const total = Math.ceil(b64.length / TAILLE_MORCEAU_PRIVE);", "  const total = 1;", "découpée"],
  ["scripts/voix.js", "  if (!destinataires.length || !blob?.size || blob.size > TAILLE_MAX_PRIVEE) return 0;", "  if (!destinataires.length || !blob?.size) return 0;", "taille bornée"],
  ["scripts/voix.js", "    if (e.recus < e.total) return null;\n", "", "incomplet jamais joué"],
  ["scripts/voix.js", "|| total < 1 || total > MORCEAUX_MAX_PRIVES || n < 0", "|| total < 1 || n < 0", "nombre de morceaux borné"],
  ["scripts/voix.js", "    if (e.total !== total) return null;\n", "", "total cohérent"],
  ["scripts/voix.js", "  const liberer = () => { if (!libre) { libre = true; URL.revokeObjectURL(url); } };", "  const liberer = () => { libre = true; };", "URL libérée"],
  ["scripts/voix.js", "    if (publics.has(chemin)) continue;\n", "", "publics gardés"],
  ["scripts/voix.js", "    if (!m.whisper?.length && m.flags?.[ID]?.narration) for", "    if (!m.whisper?.length) for", "seule une narration publique est gardée"],
  ["scripts/voix.js", "    try { await m.unsetFlag(ID, \"audio\"); n++; } catch { /* message déjà parti */ }", "    n++;", "réécoute retirée"]
];

// Les scripts qu'importent voix.js, canal.js et le fournisseur OpenAI (et rien d'autre : chaque copie se charge plus vite).
const IMPORTES = (() => {
  const vus = new Set();
  const pile = ["scripts/voix.js", "scripts/canal.js", "scripts/fournisseurs/openai.js"];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !f.startsWith("scripts/")) continue;
    vus.add(f);
    const texte = readFileSync(join(RACINE, f), "utf8");
    for (const m of texte.matchAll(/(?:import|export)[^;]*?from\s+"(\.[^"]+)"|import\(\s*"(\.[^"]+)"\s*\)/g)) {
      pile.push(posix.join(posix.dirname(f), m[1] ?? m[2]));
    }
  }
  return [...vus];
})();

async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-voix-privees-"));
  try {
    for (const f of IMPORTES) cpSync(join(RACINE, f), join(dossier, f));
    // Les SDK embarqués (plusieurs centaines de Ko) ne servent pas ici : la synthèse est doublée. Des coquilles vides suffisent.
    mkdirSync(join(dossier, "vendor"));
    writeFileSync(join(dossier, "vendor", "openai.mjs"), "export class OpenAI { constructor(o) { this.options = o; } }\n");
    writeFileSync(join(dossier, "vendor", "anthropic.mjs"), "export class Anthropic { constructor(o) { this.options = o; } }\n");
    const chemin = join(dossier, fichier);
    const t = readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
    assert.ok(t.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
    writeFileSync(chemin, t.replace(avant, apres));
    return await charger(dossier);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push({ nom, e }); }
  }
  return liste;
}

test("voix privées : les vrais scripts passent toute la batterie", async () => {
  const e = await echecs(await charger(RACINE));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("voix privées : chaque règle cassée est détectée par la batterie", async () => {
  assert.deepEqual((await echecs(await chargerMutant("scripts/voix.js", "", ""))).map(x => `${x.nom} : ${x.e.message}`), [], "témoin");
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(regle);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
