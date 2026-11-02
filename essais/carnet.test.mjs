// Carnet de campagne (40k, Warcraft) : le tableau d'enquête (« règle des trois indices ») et le registre des contacts et des
// dettes. Logique pure (enquetes-logique.js, contacts-logique.js), API des modules des mondes (seul le MJ actif écrit, assurer ne
// remplace jamais), résumé pour l'IA (six lignes au plus chacun, contacts de la scène d'abord), outils « enquete » et « contact ».
// Trois batteries par mutation : chaque règle est cassée à son tour dans une copie ; la batterie doit alors échouer.
// Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

// ------------------------------------------------------------------ doublure de Foundry (réglages, MJ actif, canal)
const ID = "lakour-mj-ia";
const MJ = { id: "mj", isGM: true }, MJ2 = { id: "mj2", isGM: true }, JOUEUR = { id: "j1", isGM: false };
const etat = {};
function reinitialiser({ systeme = "impmal", moi = MJ, actif = MJ } = {}) {
  Object.assign(etat, { reglages: { enquetes: [], contacts: [], horloges: [] }, ecritures: 0, emissions: [] });
  const users = Object.assign([MJ, MJ2, JOUEUR], { get activeGM() { return actif; }, get: id => [MJ, MJ2, JOUEUR].find(u => u.id === id) });
  globalThis.game = {
    system: { id: systeme }, user: moi, users, scenes: { active: null },
    settings: {
      get: (_m, k) => etat.reglages[k],
      // Comme le vrai réglage (aller-retour au serveur), la valeur n'est lue qu'après un délai.
      set: async (_m, k, v) => { etat.ecritures++; await new Promise(r => setTimeout(r, 1)); etat.reglages[k] = structuredClone(v); }
    },
    actors: { find: () => null, getName: () => null, contents: [] },
    socket: { on: () => {}, emit: (canal, message, options) => etat.emissions.push({ canal, message, options }) }
  };
}
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: { escapeHTML: s => String(s) } };
reinitialiser();

const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
const E = await import("../scripts/enquetes-logique.js");
const C = await import("../scripts/contacts-logique.js");
const K = await import("../scripts/carnet.js");
const { OUTILS, outilsDuSysteme } = await import("../scripts/outils.js");
const { CONSIGNE_CARNET } = await import("../scripts/contexte.js");
const outil = (nom, args) => OUTILS.find(o => o.nom === nom).executer(args);
const enquete = args => outil("enquete", { action: "lister", enquete: "", texte: "", ou: "", mene: [], visible: false, ...args });
const contact = args => outil("contact", { action: "lister", nom: "", faction: "", lieu: "", attitude: 0, raison: "", dette: "", demande: "", notes: "", acteur: "", visible: false, ...args });

// Copie de scripts dans un dossier temporaire, l'un d'eux muté ([fichier, avant, après]).
async function chargerCopie(fichiers, principal, mutation) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-carnet-"));
  const sources = Object.fromEntries(fichiers.map(f => [f, readFileSync(join(SCRIPTS, f), "utf8").replace(/\r\n/g, "\n")]));
  if (mutation) {
    const [fichier, avant, apres] = mutation;
    assert.ok(sources[fichier].includes(avant), `mutation obsolète : ${avant}`);
    sources[fichier] = sources[fichier].replace(avant, apres);
  }
  for (const [f, texte] of Object.entries(sources)) writeFileSync(join(dossier, f), texte);
  return { dossier, M: await import(pathToFileURL(join(dossier, principal)).href) };
}
async function mutations(fichiers, principal, liste, batterie) {
  for (const [nom, [avant, apres]] of Object.entries(liste)) {
    const m = await chargerCopie(fichiers, principal, [principal, avant, apres]);
    try { assert.ok((await batterie(m.M)).length > 0, `mutation non détectée : ${nom}`); } finally { rmSync(m.dossier, { recursive: true, force: true }); }
  }
}
async function verifierTout(verifs, M) {
  const echecs = [];
  for (const [nom, fn] of Object.entries(verifs)) { try { await fn(M); } catch (e) { echecs.push(`${nom} : ${e.message}`); } }
  return echecs;
}

// ------------------------------------------------------------------ enquêtes (logique pure)
const DIACRE = { titre: "Le Chœur creux", conclusions: ["Le diacre ment sur les muets", "Le chant vient de la crypte"],
  indices: [
    { texte: "Registre des muets falsifié", ou: "sacristie", mene: ["Le diacre ment sur les muets"] },
    { texte: "Témoignage de la sœur", ou: "Sœur Ilsa", mene: ["le diacre ment sur les muets"] },
    { texte: "Partition à quatre voix", ou: "coffres des ornements", mene: ["Le diacre ment sur les muets", "Le chant vient de la crypte"] }
  ] };
const ENQUETES = {
  "une enquête complète : conclusions et indices reliés par identifiant": L => {
    const e = L.normaliserEnquete(DIACRE);
    assert.equal(e.id, "le-choeur-creux");
    assert.deepEqual(e.conclusions.map(c => c.id), ["le-diacre-ment-sur-les-muets", "le-chant-vient-de-la-crypte"]);
    assert.deepEqual(e.indices[2].mene, ["le-diacre-ment-sur-les-muets", "le-chant-vient-de-la-crypte"]);
    assert.deepEqual(e.indices[1].mene, ["le-diacre-ment-sur-les-muets"], "texte d'une conclusion, casse ignorée");
  },
  "un indice sans conclusion, ou vers une conclusion inconnue, est refusé": L => {
    const e = L.normaliserEnquete(DIACRE);
    assert.throws(() => L.ajouterIndice(e, { texte: "Rien", mene: [] }), /au moins une conclusion/);
    assert.throws(() => L.ajouterIndice(e, { texte: "Rien", mene: ["Le Warp"] }), /conclusion introuvable/);
    assert.throws(() => L.ajouterConclusion(e, { texte: "le chant vient de la crypte" }), /existe déjà/);
    assert.equal(e.indices.length, 3, "l'original n'est pas touché");
  },
  "règle des trois indices : les conclusions cachées sous trois indices trouvables": L => {
    let e = L.normaliserEnquete(DIACRE);
    assert.deepEqual(L.conclusionsFragiles(e).map(x => [x.conclusion.id, x.trouvables]), [["le-chant-vient-de-la-crypte", 1]]);
    e = L.marquerIndice(e, "Registre des muets falsifié").enquete;
    assert.deepEqual(L.conclusionsFragiles(e).map(x => [x.conclusion.id, x.trouvables, x.trouves]),
      [["le-diacre-ment-sur-les-muets", 2, 1], ["le-chant-vient-de-la-crypte", 1, 0]], "un indice trouvé n'est plus trouvable");
    e = L.marquerConclusion(e, "le-chant-vient-de-la-crypte").enquete;
    assert.deepEqual(L.conclusionsFragiles(e).map(x => x.conclusion.id), ["le-diacre-ment-sur-les-muets"], "une conclusion révélée n'a plus besoin d'indices");
    assert.match(L.rappelTroisIndices(e), /« Le diacre ment sur les muets » n'a que 2 indice\(s\) encore trouvable\(s\)/);
    const solide = L.ajouterIndice(L.ajouterIndice(L.normaliserEnquete({ titre: "X", conclusions: ["A"] }), { texte: "1", mene: ["A"] }).enquete, { texte: "2", mene: ["A"] }).enquete;
    assert.equal(L.conclusionsFragiles(L.ajouterIndice(solide, { texte: "3", mene: ["A"] }).enquete).length, 0, "trois indices : rien à dire");
    assert.equal(L.conclusionsFragiles(solide).length, 1, "deux indices : à étoffer");
  },
  "l'enquête en cours : la plus récente encore ouverte (une neuve sans conclusion compte) ; toutes closes : aucune": L => {
    const a = { ...L.normaliserEnquete({ titre: "A", conclusions: ["x"] }), maj: 5 };
    const b = { ...L.normaliserEnquete({ titre: "B", conclusions: [{ texte: "y", revelee: true }] }), maj: 9 };
    const c = { ...L.normaliserEnquete({ titre: "C", conclusions: ["z"] }), maj: 7 };
    assert.equal(L.enqueteEnCours([a, b, c]).id, "c");
    const neuve = { ...L.normaliserEnquete({ titre: "Neuve" }), maj: 10 };
    assert.equal(L.enqueteEnCours([a, neuve]).id, "neuve", "une enquête neuve, sans conclusion, est en cours");
    assert.equal(L.enqueteEnCours([b]), null, "toutes closes : aucune en cours");
    assert.equal(L.derniereClose([a, b]).id, "b");
    assert.equal(L.enqueteParDefaut([b]).id, "b", "sans nom, l'outil vise la plus récente");
    assert.equal(L.enqueteEnCours([]), null);
    assert.equal(L.horodatage([{ maj: 5000 }], 100), 5001, "horodatage strictement croissant");
    assert.equal(L.horodatage([], 100), 100);
  },
  "résumé pour l'IA : six lignes au plus, indices à trouver avec leur lieu, rappel des trois indices": L => {
    let e = L.normaliserEnquete(DIACRE);
    e = L.marquerIndice(e, "Témoignage de la sœur").enquete;
    e = L.marquerConclusion(e, "Le diacre ment sur les muets").enquete;
    const r = L.resumeEnquete(e);
    assert.ok(r.length <= L.MAX_LIGNES_ENQUETE);
    const t = r.join("\n");
    assert.match(t, /^Enquête en cours « Le Chœur creux » \[le-choeur-creux\], cachée aux joueurs :/);
    assert.match(t, /Conclusions révélées : Le diacre ment sur les muets\./);
    assert.match(t, /À découvrir : Le chant vient de la crypte \(indices trouvés 0, encore trouvables 1\)/);
    assert.match(t, /Indices à trouver : Registre des muets falsifié \(sacristie\)/);
    assert.match(t, /Indices déjà trouvés : Témoignage de la sœur/);
    assert.match(t, /Règle des trois indices : à étoffer — Le chant vient de la crypte/);
    assert.equal(r.length, 6, "six lignes ici");
    assert.equal(L.resumeEnquete(e, 3).length, 3, "borné");
  },
  "les joueurs ne voient que les indices trouvés et les conclusions révélées d'une enquête montrée": L => {
    let e = { ...L.normaliserEnquete(DIACRE), visible: true };
    e = L.marquerIndice(e, "Partition à quatre voix").enquete;
    const cachee = L.normaliserEnquete({ titre: "Secrète", conclusions: ["s"] });
    const joueurs = L.vueEnquetes([e, cachee]);
    assert.deepEqual(joueurs.map(x => x.id), ["le-choeur-creux"]);
    assert.deepEqual(joueurs[0].indices.map(i => i.texte), ["Partition à quatre voix"]);
    assert.equal(joueurs[0].indices[0].ou, "", "pas d'où pour les joueurs");
    assert.deepEqual(joueurs[0].conclusions, []);
    const mj = L.vueEnquetes([e, cachee], { mj: true });
    assert.equal(mj.length, 2);
    assert.equal(mj[0].indices.length, 3);
    assert.ok(mj[0].conclusions.find(c => c.id === "le-chant-vient-de-la-crypte").fragile);
  }
};
const MUTATIONS_ENQUETES = {
  "indice sans conclusion accepté": ["if (!mene.length) throw new Error(\"un indice doit mener à au moins une conclusion\");", ""],
  "conclusion inconnue ignorée": ["if (!c) throw new Error(`conclusion introuvable", "if (false) throw new Error(`conclusion introuvable"],
  "conclusion en double": ["if (trouverEntree(enquete.conclusions, t)) throw", "if (false) throw"],
  "l'original modifié": ["const copier = e => structuredClone(e);", "const copier = e => e;"],
  "les indices trouvés comptent comme trouvables": ["trouvables: lies.filter(i => !i.trouve).length", "trouvables: lies.length"],
  "seuil à deux": ["export const SEUIL_INDICES = 3;", "export const SEUIL_INDICES = 2;"],
  "conclusions révélées encore réclamées": ["return (enquete?.conclusions ?? []).filter(c => !c.revelee).map(", "return (enquete?.conclusions ?? []).map("],
  "enquête close choisie": [".find(enqueteOuverte) ?? null;", "[0] ?? null;"],
  "enquête neuve ignorée": ["export const enqueteOuverte = e => !e.conclusions.length || ", "export const enqueteOuverte = e => "],
  "horodatage non strict": ["(Number(e.maj) || 0) + 1", "(Number(e.maj) || 0)"],
  "plus récente oubliée": ["(Number(b.maj) || 0) - (Number(a.maj) || 0)", "(Number(a.maj) || 0) - (Number(b.maj) || 0)"],
  "résumé non borné": ["return lignes.slice(0, max);", "return lignes;"],
  "rappel absent du résumé": ["if (rappel.length) lignes.push(", "if (false) lignes.push("],
  "les joueurs voient tout": ["indices: e.indices.filter(i => mj || i.trouve)", "indices: e.indices"],
  "conclusions cachées montrées": ["conclusions: e.conclusions.filter(c => mj || c.revelee)", "conclusions: e.conclusions"],
  "enquête cachée montrée": ["return liste.filter(e => mj || e.visible).map(e => {", "return liste.map(e => {"],
  "le lieu montré aux joueurs": ["ou: mj ? i.ou : \"\"", "ou: i.ou"]
};
test("enquêtes : règle des trois indices, enquête en cours, résumé, vue des joueurs (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await verifierTout(ENQUETES, E), []);
});
test("mutations (enquêtes) : la batterie attrape chaque règle cassée", async () => {
  await mutations(["enquetes-logique.js", "horloges-logique.js", "recherche-nom.js"], "enquetes-logique.js", MUTATIONS_ENQUETES, M => verifierTout(ENQUETES, M));
});

// ------------------------------------------------------------------ contacts (logique pure)
const NIXI = { nom: "Nixi Pèse-Juste", faction: "Cartel Gentepression", lieu: "Cabestan", attitude: 1, demande: "un passage discret", acteur: "Actor.nixi" };
const CONTACTS = {
  "un contact borné : attitude de -3 à +3": L => {
    assert.equal(L.normaliserContact({ nom: "A", attitude: 7 }).attitude, 3);
    assert.equal(L.normaliserContact({ nom: "A", attitude: -9 }).attitude, -3);
    assert.equal(L.normaliserContact(NIXI).id, "nixi-pese-juste");
    assert.throws(() => L.normaliserContact({}), /besoin d'un nom/);
  },
  "l'attitude change avec sa raison, sans dépasser les bornes": L => {
    const c = L.normaliserContact(NIXI);
    const r = L.changerAttitude(c, 2, "la caisse livrée sans être ouverte");
    assert.deepEqual([r.avant, r.apres], [1, 3]);
    assert.match(r.contact.historique.at(-1), /Attitude \+1 → \+3 : la caisse livrée/);
    assert.equal(L.changerAttitude(r.contact, 1).apres, 3);
    assert.equal(L.changerAttitude(c, -6).apres, -3);
    assert.equal(c.attitude, 1, "l'original n'est pas touché");
  },
  "une dette notée, puis soldée": L => {
    const d = L.noterDette(L.normaliserContact(NIXI), "le groupe lui doit un service");
    assert.equal(d.dette, "le groupe lui doit un service");
    const s = L.noterDette(d, "");
    assert.equal(s.dette, "");
    assert.match(s.historique.at(-1), /Dette soldée : le groupe lui doit un service/);
  },
  "l'historique est borné": L => {
    let c = L.normaliserContact(NIXI);
    for (let i = 0; i < 25; i++) c = L.changerAttitude(c, i % 2 ? 1 : -1, `geste ${i}`).contact;
    assert.equal(c.historique.length, L.MAX_HISTORIQUE);
    assert.match(c.historique.at(-1), /geste 24/);
  },
  "les contacts de la scène d'abord (PNJ présent, ou lieu), puis les plus récents": L => {
    const liste = [
      { ...L.normaliserContact({ nom: "Vieux", lieu: "Theramore" }), maj: 1 },
      { ...L.normaliserContact(NIXI), maj: 2 },
      { ...L.normaliserContact({ nom: "Grizzla", lieu: "Cabestan — comptoir" }), maj: 3 },
      { ...L.normaliserContact({ nom: "Récent", lieu: "Carrefour" }), maj: 9 }
    ];
    assert.deepEqual(L.contactsPertinents(liste, { acteurs: ["Actor.nixi"], lieu: "Le Carrefour" }).map(c => c.nom), ["Récent", "Nixi Pèse-Juste", "Grizzla", "Vieux"]);
    assert.deepEqual(L.contactsPertinents(liste, { acteurs: ["nixi"] }).map(c => c.nom).slice(0, 2), ["Nixi Pèse-Juste", "Récent"], "un id d'acteur suffit");
    assert.deepEqual(L.contactsPertinents(liste, {}).map(c => c.nom), ["Récent", "Grizzla", "Nixi Pèse-Juste", "Vieux"]);
    assert.equal(L.contactsPertinents(liste, {}, 2).length, 2);
  },
  "résumé pour l'IA : six lignes au plus, attitude, dette, demande, présence": L => {
    const liste = Array.from({ length: 9 }, (_, i) => ({ ...L.normaliserContact({ nom: `C${i}` }), maj: i }));
    liste.push({ ...L.noterDette(L.normaliserContact({ ...NIXI, visible: true }), "le groupe lui doit un service"), maj: 0 });
    const r = L.resumeContacts(liste, { acteurs: ["Actor.nixi"] });
    assert.ok(r.length <= L.MAX_LIGNES_CONTACTS);
    assert.match(r[0], /5 autre\(s\)/);
    assert.equal(r[1], "- Contact « Nixi Pèse-Juste » [nixi-pese-juste] (Cartel Gentepression, Cabestan) : Bienveillant (+1) ; dette : le groupe lui doit un service ; veut : un passage discret ; ICI");
    assert.deepEqual(L.resumeContacts([]), []);
  },
  "les joueurs voient les contacts montrés, sans notes ni historique": L => {
    const c = L.changerAttitude(L.normaliserContact({ ...NIXI, notes: "Elle vend aussi au baron.", visible: true }), -2, "trahie").contact;
    const cache = L.normaliserContact({ nom: "Ombre" });
    const j = L.vueContacts([c, cache]);
    assert.deepEqual(j.map(x => x.nom), ["Nixi Pèse-Juste"]);
    assert.equal(j[0].notes, "");
    assert.deepEqual(j[0].historique, []);
    assert.equal(j[0].attitudeTexte, "Réservé (-1)");
    assert.equal(j[0].classe, "hostile");
    assert.equal(L.vueContacts([c, cache], { mj: true })[0].notes, "Elle vend aussi au baron.");
  }
};
const MUTATIONS_CONTACTS = {
  "attitude sans bornes": ["Math.min(ATTITUDE_MAX, Math.max(ATTITUDE_MIN, Math.round(Number(n) || 0)))", "Math.round(Number(n) || 0)"],
  "raison perdue": ["${texte(raison) ? ` : ${texte(raison)}` : \"\"}", ""],
  "dette jamais soldée": ["dette: d }", "dette: d || contact.dette }"],
  "historique sans borne": [".slice(-MAX_HISTORIQUE) });", "});"],
  "la scène ignorée": ["...recents.filter(surPlace).map(c => ({ ...c, ici: true })), ...recents.filter(c => !surPlace(c))", "...recents"],
  "le lieu ignoré": ["|| (l && c.lieu && (l.includes(plier(c.lieu)) || plier(c.lieu).includes(l)))", ""],
  "les plus anciens d'abord": ["(Number(b.maj) || 0) - (Number(a.maj) || 0)", "(Number(a.maj) || 0) - (Number(b.maj) || 0)"],
  "résumé non borné": ["contactsPertinents(liste, ou, MAX_LIGNES_CONTACTS - 1)", "contactsPertinents(liste, ou, 99)"],
  "dette absente du résumé": ["${c.dette ? ` ; dette : ${c.dette}` : \"\"}", ""],
  "notes montrées aux joueurs": ["notes: mj ? c.notes : \"\"", "notes: c.notes"],
  "contact caché montré": ["return liste.filter(c => mj || c.visible).map(c => ({", "return liste.map(c => ({"]
};
test("contacts : attitude bornée, dettes, pertinence, résumé, vue des joueurs (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await verifierTout(CONTACTS, C), []);
});
test("mutations (contacts) : la batterie attrape chaque règle cassée", async () => {
  await mutations(["contacts-logique.js", "horloges-logique.js", "recherche-nom.js"], "contacts-logique.js", MUTATIONS_CONTACTS, M => verifierTout(CONTACTS, M));
});

// ------------------------------------------------------------------ API des modules des mondes (carnet.js)
const API = {
  "assurer crée, puis ne remplace jamais": async K => {
    reinitialiser();
    const a = await K.assurerEnquete({ id: "choeur", titre: "Le Chœur creux", conclusions: ["A"] });
    assert.equal(a.conclusions.length, 1);
    await K.modifierEnquete("choeur", e => E.ajouterConclusion(e, { texte: "B" }));
    const b = await K.assurerEnquete({ id: "choeur", titre: "Autre" });
    assert.equal(b.titre, "Le Chœur creux");
    assert.equal(b.conclusions.length, 2);
    await K.assurerContact({ id: "nixi", nom: "Nixi", attitude: 2 });
    assert.equal((await K.assurerContact({ id: "nixi", nom: "Autre", attitude: -3 })).attitude, 2);
    assert.equal(K.enquetes.lister().length, 1);
    assert.equal(K.contacts.lister().length, 1);
  },
  "seul le MJ actif écrit": async K => {
    reinitialiser({ moi: MJ2, actif: MJ });
    assert.equal((await K.assurerEnquete({ id: "x", titre: "X" })).id, "x", "l'élément est rendu");
    etat.reglages.contacts = [C.normaliserContact({ id: "nixi", nom: "Nixi" })];
    assert.equal(await K.modifierContact("nixi", c => C.changerAttitude(c, 1)), null);
    reinitialiser({ moi: JOUEUR, actif: MJ });
    await K.assurerContact({ id: "y", nom: "Y" });
    assert.equal(etat.ecritures, 0);
  },
  "deux gestes rapprochés ne s'écrasent pas": async K => {
    reinitialiser();
    await K.assurerContact({ id: "nixi", nom: "Nixi" });
    await Promise.all([K.modifierContact("nixi", c => C.changerAttitude(c, 1)), K.modifierContact("nixi", c => C.changerAttitude(c, 1))]);
    assert.equal(K.trouverContact("nixi").attitude, 2);
  },
  "lister rend des copies": async K => {
    reinitialiser();
    await K.assurerContact({ id: "nixi", nom: "Nixi" });
    K.contacts.lister()[0].attitude = 3;
    assert.equal(K.contacts.lister()[0].attitude, 0);
  },
  "résumé pour l'IA : enquête en cours puis contacts de la scène": async K => {
    reinitialiser();
    await K.assurerEnquete({ id: "choeur", titre: "Le Chœur creux", conclusions: ["A"] });
    await K.assurerContact({ id: "loin", nom: "Loin" });
    await K.assurerContact({ id: "nixi", nom: "Nixi", acteur: "Actor.nixi" });
    await K.modifierContact("loin", c => c);
    const scene = { name: "Cabestan", tokens: { contents: [{ actor: { uuid: "Actor.nixi" }, actorId: "nixi" }] } };
    const t = K.resumeCarnetPourIA(scene).join("\n");
    assert.match(t, /Enquête en cours « Le Chœur creux »/);
    assert.match(t, /Contacts et dettes :\n- Contact « Nixi » \[nixi\] : Neutre \(0\) ; ICI/);
  },
  "assurer sans id : retrouvé par son titre ou son nom, jamais doublé": async K => {
    reinitialiser();
    await K.assurerEnquete({ titre: "Le Chœur creux" });
    await K.assurerEnquete({ titre: "le choeur creux" });
    await K.assurerContact({ nom: "Nixi" });
    await K.assurerContact({ nom: "NIXI" });
    assert.deepEqual([K.enquetes.lister().length, K.contacts.lister().length], [1, 1]);
  },
  "deux enquêtes : la neuve est en cours, ajouter_conclusion sans nom y va": async K => {
    reinitialiser();
    await K.assurerEnquete({ id: "vieille", titre: "Vieille", conclusions: ["Cachée"] });
    await K.assurerEnquete({ id: "neuve", titre: "Neuve" });
    await K.modifierEnquete("", e => E.ajouterConclusion(e, { texte: "Première" }));
    assert.deepEqual(K.trouverEnquete("neuve").conclusions.map(c => c.texte), ["Première"]);
    assert.equal(K.trouverEnquete("vieille").conclusions.length, 1);
  },
  "toutes les enquêtes closes : une seule ligne de contexte, sans indices à trouver": async K => {
    reinitialiser();
    await K.assurerEnquete({ id: "close", titre: "Close", conclusions: [{ texte: "Faite", revelee: true }], indices: [{ texte: "Oublié", mene: ["Faite"] }] });
    const t = K.resumeCarnetPourIA(null);
    assert.deepEqual(t, ["Dernière enquête close : « Close » (toutes ses conclusions sont révélées)."]);
  },
  "le geste d'un autre MJ qui échoue : l'émetteur est prévenu": async K => {
    reinitialiser();
    assert.equal(await K.recevoirGeste({ action: "indice", enquete: "inconnue", entree: "x", valeur: true }, "mj2"), false);
    assert.deepEqual(etat.emissions.map(e => [e.message.type, e.options?.recipients]), [["carnet.erreur", ["mj2"]]]);
    await assert.rejects(K.gesteCarnet({ action: "attitude", contact: "personne", valeur: 1 }), /introuvable/);
    assert.equal(await K.recevoirGeste({ action: "attitude", contact: "x", valeur: 1 }, "j1"), false, "un joueur n'agit pas");
  },
  "un geste d'un autre MJ part au MJ actif": async K => {
    reinitialiser({ moi: MJ2, actif: MJ });
    K.gesteCarnet({ action: "attitude", contact: "nixi", valeur: 1 });
    assert.deepEqual(etat.emissions.map(e => [e.message.type, e.options?.recipients]), [["carnet.geste", ["mj"]]]);
  },
  "gestes de la fenêtre : indice coché, conclusion révélée, contact montré": async K => {
    reinitialiser();
    await K.assurerEnquete(DIACRE);
    await K.gesteCarnet({ action: "indice", enquete: "le-choeur-creux", entree: "registre-des-muets-falsifie", valeur: true });
    await K.gesteCarnet({ action: "conclusion", enquete: "le-choeur-creux", entree: "le-chant-vient-de-la-crypte", valeur: true });
    const e = K.trouverEnquete("le-choeur-creux");
    assert.equal(e.indices[0].trouve, true);
    assert.equal(e.conclusions[1].revelee, true);
    await K.assurerContact({ id: "nixi", nom: "Nixi" });
    await K.gesteCarnet({ action: "contactVisible", contact: "nixi", valeur: true });
    assert.equal(K.trouverContact("nixi").visible, true);
  }
};
const MUTATIONS_API = {
  "assurer remplace l'existant": ["  if (existante) return structuredClone(existante);\n", "",
    "    const deja = dejaLa(liste, def, \"titre\") ?? liste.find(e => e.id === neuve.id);", "    const deja = null;"],
  "assurer sans id : un doublon à chaque chargement": ["  const nom = plier(def?.[champ]);", "  const nom = \"\";"],
  "toutes closes : le contexte réclame encore des indices": ["const enCours = E.enqueteEnCours(liste);", "const enCours = E.enqueteEnCours(liste) ?? E.derniereClose(liste);"],
  "erreur d'un autre MJ tue": ["    envoyer({ type: \"carnet.erreur\", texte: e.message }, [emetteur]);\n", ""],
  "élément introuvable passé sous silence": ["if (r === null) throw new Error", "if (false) throw new Error"],
  "tout le monde écrit": ["    if (!estMJActif()) return Promise.resolve(null);\n", ""],
  "gestes en parallèle sans file": ["const suite = file.then(async () => {", "const suite = (async () => {"],
  "lister rend l'original": ["lister: () => structuredClone(lire())", "lister: () => lire()"],
  "résumé sans les contacts de la scène": ["const acteurs = (scene?.tokens?.contents ?? []).flatMap(t => [t.actor?.uuid, t.actorId]).filter(Boolean);", "const acteurs = [];"],
  "geste d'un autre MJ perdu": ["return versMJ({ type: \"carnet.geste\", ...message });", "return null;"],
  "case d'indice sans effet": ["case \"indice\": return modifierEnquete(enquete, e => E.marquerIndice(e, entree, Boolean(valeur)));", "case \"indice\": return null;"]
};
// « gestes en parallèle sans file » : la parenthèse fermante du (async () => { … })() est ajoutée par une seconde substitution.
const FICHIERS_API = ["carnet.js", "registre-monde.js", "enquetes-logique.js", "contacts-logique.js", "horloges-logique.js", "recherche-nom.js", "canal.js", "constantes.js"];
test("API : assurer, lister, trouver ; seul le MJ actif écrit ; résumé et gestes (la batterie passe sur le vrai code)", async () => {
  assert.deepEqual(await verifierTout(API, K), []);
});
test("mutations (API) : la batterie attrape chaque règle cassée", async () => {
  for (const [nom, [avant, apres, ...autres]] of Object.entries(MUTATIONS_API)) {
    const fichier = ["file.then", "structuredClone(lire())", "estMJActif()) return Promise"].some(x => avant.includes(x)) ? "registre-monde.js" : "carnet.js";
    const dossier = mkdtempSync(join(tmpdir(), "lakour-carnet-api-"));
    try {
      for (const f of FICHIERS_API) {
        let t = readFileSync(join(SCRIPTS, f), "utf8").replace(/\r\n/g, "\n");
        if (f === fichier) {
          assert.ok(t.includes(avant), `mutation obsolète : ${avant}`);
          t = t.replace(avant, apres);
          for (let i = 0; i < autres.length; i += 2) {
            assert.ok(t.includes(autres[i]), `mutation obsolète : ${autres[i]}`);
            t = t.replace(autres[i], autres[i + 1]);
          }
          if (nom === "gestes en parallèle sans file") t = t.replace("      return r.resultat ?? null;\n    });", "      return r.resultat ?? null;\n    })();");
        }
        writeFileSync(join(dossier, f), t);
      }
      const M = await import(pathToFileURL(join(dossier, "carnet.js")).href);
      assert.ok((await verifierTout(API, M)).length > 0, `mutation non détectée : ${nom}`);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  }
});

// ------------------------------------------------------------------ outils du MJ IA
test("outils enquete et contact : en 40k et en Warcraft, pas aux Veillées ; consigne", () => {
  const noms = s => new Set(outilsDuSysteme(s).map(o => o.nom));
  for (const s of ["impmal", "dnd5e"]) assert.ok(noms(s).has("enquete") && noms(s).has("contact"), s);
  assert.ok(!noms("lakour-loups").has("enquete") && !noms("lakour-loups").has("contact"));
  assert.match(CONSIGNE_CARNET, /au moins trois indices par conclusion/);
});

test("outil enquete : créer, conclusions, indices (rappel des trois indices), trouver, révéler, montrer", async () => {
  reinitialiser();
  let r = await enquete({ action: "creer", texte: "Le Chœur creux" });
  assert.ok(!r.erreur, r.contenu);
  r = await enquete({ action: "ajouter_conclusion", texte: "Le diacre ment" });
  assert.match(r.contenu, /Conclusion ajoutée \[le-diacre-ment\]/);
  assert.match((await enquete({ action: "creer", texte: "Second mystère" })).contenu, /\[second-mystere\] ; c'est l'enquête en cours/);
  await enquete({ action: "ajouter_conclusion", texte: "Le second" });
  assert.deepEqual(etat.reglages.enquetes.map(e => e.conclusions.map(c => c.texte)), [["Le diacre ment"], ["Le second"]], "la conclusion va dans la neuve");
  await enquete({ action: "retirer", enquete: "Second mystère" });
  assert.match(r.contenu, /« Le diacre ment » n'a que 0 indice\(s\) encore trouvable\(s\)/, "rappel à chaque modification");
  for (const [texte, ou] of [["Registre falsifié", "sacristie"], ["Témoignage de la sœur", "Sœur Ilsa"]]) await enquete({ action: "ajouter_indice", texte, ou, mene: ["Le diacre ment"] });
  r = await enquete({ action: "ajouter_indice", texte: "Partition", ou: "coffres", mene: ["le-diacre-ment"] });
  assert.doesNotMatch(r.contenu, /Règle des trois indices/, "trois indices : plus de rappel");
  r = await enquete({ action: "ajouter_indice", texte: "Rien", mene: ["Le Warp"] });
  assert.ok(r.erreur);
  assert.match(r.contenu, /conclusion introuvable/);
  r = await enquete({ action: "trouver", texte: "registre falsifié" });
  assert.match(r.contenu, /Indice trouvé : « Registre falsifié »/);
  assert.match(r.contenu, /n'a que 2 indice\(s\)/, "trouvé : il n'est plus trouvable");
  r = await enquete({ action: "reveler", enquete: "Le Chœur creux", texte: "Le diacre ment" });
  assert.match(r.contenu, /Conclusion révélée/);
  await enquete({ action: "montrer" });
  assert.equal(etat.reglages.enquetes[0].visible, true, "vide : l'enquête en cours");
  r = await enquete({ action: "lister" });
  assert.match(r.contenu, /Indice \[registre-falsifie\] TROUVÉ : Registre falsifié \(où : sacristie\) → Le diacre ment/);
  assert.ok((await enquete({ action: "trouver", enquete: "Inconnue", texte: "x" })).erreur);
});

test("outil contact : ajouter, attitude avec raison, dette puis solder, modifier, montrer", async () => {
  reinitialiser({ systeme: "dnd5e" });
  let r = await contact({ action: "ajouter", nom: "Nixi Pèse-Juste", faction: "Cartel", lieu: "Cabestan", attitude: 1, demande: "un passage discret", acteur: "Actor.nixi" });
  assert.match(r.contenu, /Contact ajouté : Contact « Nixi Pèse-Juste » \[nixi-pese-juste\] \(Cartel, Cabestan\) : Bienveillant \(\+1\)/);
  assert.equal(etat.reglages.contacts[0].acteur, "Actor.nixi");
  assert.ok((await contact({ action: "ajouter", nom: "nixi pese-juste" })).erreur, "pas de doublon");
  r = await contact({ action: "attitude", nom: "Nixi Pèse-Juste", attitude: 3, raison: "caisse livrée" });
  assert.match(r.contenu, /Allié \(\+3\)/);
  assert.match(etat.reglages.contacts[0].historique.at(-1), /caisse livrée/);
  r = await contact({ action: "dette", nom: "Nixi Pèse-Juste", dette: "le groupe lui doit un service" });
  assert.match(r.contenu, /dette : le groupe lui doit un service/);
  r = await contact({ action: "solder", nom: "Nixi Pèse-Juste" });
  assert.doesNotMatch(r.contenu, /dette :/);
  await contact({ action: "modifier", nom: "Nixi Pèse-Juste", lieu: "Theramore" });
  assert.equal(etat.reglages.contacts[0].lieu, "Theramore");
  assert.equal(etat.reglages.contacts[0].faction, "Cartel", "un champ vide ne change rien");
  await contact({ action: "montrer", nom: "Nixi Pèse-Juste" });
  assert.equal(etat.reglages.contacts[0].visible, true);
  assert.ok((await contact({ action: "attitude", nom: "Nixi Pèse-Juste", attitude: 0 })).erreur);
  assert.ok((await contact({ action: "dette", nom: "Inconnu", dette: "x" })).erreur);
});

test("moteur : un outil absent de la liste offerte pour ce tour est refusé (horsSystemes, liste réduite d'un scénario)", async () => {
  reinitialiser({ systeme: "lakour-loups" });
  const { MoteurMJ } = await import("../scripts/moteur.js");
  const executer = (nom, outils) => MoteurMJ.prototype.executer.call({}, { id: "a", nom, args: { action: "lister", enquete: "", texte: "", ou: "", mene: [], visible: false } }, outils);
  let r = await executer("enquete", outilsDuSysteme("lakour-loups"));
  assert.ok(r.erreur);
  assert.match(r.contenu, /Outil non disponible ici : enquete/);
  r = await executer("enquete", outilsDuSysteme("impmal"));
  assert.ok(!r.erreur, r.contenu);
  assert.match((await executer("inexistant", [])).contenu, /Outil inconnu : inexistant/);
});
