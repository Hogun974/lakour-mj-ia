// Le coffre du moteur (tous les mondes) : Foundry v14 livre tous les réglages monde à tous les navigateurs et sert Data/ sans
// authentification ; ce qui est caché aux joueurs ne doit donc jamais y être écrit en clair, et RIEN ne doit jamais être scellé
// sous une clé que personne ne pourrait reconstituer.
// - Chiffrement (AES-GCM), bourrage par blocs de 4096 octets ; partage de Shamir (seuil = majorité des porteurs, au moins 2).
// - Ce qui est secret dans chaque registre (liste blanche) ; identifiants qui ne trahissent rien ; non-fuite de tout ce qu'un
//   joueur reçoit (réglages, messages, tout le chat, Data/), clé de secours comprise.
// - Clé : la première en vigueur aussitôt ; parts accusées (porteurs) ; renouvellement TRANSACTIONNEL (en vigueur seulement
//   après `seuil` accusés ; coupure au milieu : l'ancienne reste, un autre navigateur rouvre tout, sans boucle) ; parts gardées
//   par id ; demandées pour l'id qui scelle réellement ; une fois chacune ; passage de clé entre MJ ; clé de secours exportée et
//   réimportée ; seul le MJ actif crée une clé.
// - Carnet : montrer / cacher, maj stable, migration, coffre jamais écrasé coffre fermé, aucun élément retiré qui revienne.
// - Fils : chiffrés, verrouillés sans clé, rescellés au démarrage, rien relu pour rien ; aux Veillées, la clé et les fils aussi.
// Chaque vérification est rejouée sur des copies mutées des scripts.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

// ------------------------------------------------------------------ doublure de Foundry : plusieurs navigateurs, un serveur, Data/
const ID = "lakour-mj-ia";
const CLIENT = new Set(["cleCarnet", "partCarnet"]);   // réglages « client » : propres à chaque navigateur
const etat = {};
let U = {};
// comptes : les comptes joueurs ; joueurs : ceux qui sont connectés ; navigateurDe : userId -> navigateur.
function installer({ systeme = "impmal", monde = "monde-a", comptes = ["u1", "u2", "u3", "u4"], joueurs = ["u1", "u2", "u3"], garder = false,
  navigateurDe = id => id } = {}) {
  if (!garder) {
    Object.assign(etat, { mondes: {}, navigateurs: {}, reseau: [], emissions: [], messages: [], avis: [], ecritures: 0, actif: "mj",
      data: new Map(), lectures: 0, echec: null, telecharges: [] });
  }
  U = {
    mj: { id: "mj", name: "Jordan", isGM: true, active: true },
    mj2: { id: "mj2", name: "Lise", isGM: true, active: true },
    ...Object.fromEntries(comptes.map(id => [id, { id, name: id, isGM: false, active: joueurs.includes(id) }]))
  };
  const users = Object.values(U);
  users.get = id => U[id];
  Object.defineProperty(users, "activeGM", { get: () => U[etat.actif] ?? null });
  const lieu = k => (CLIENT.has(k) ? (etat.navigateurs[navigateurDe(game.user.id)] ??= {}) : (etat.mondes[game.world.id] ??= {}));
  globalThis.game = {
    system: { id: systeme }, world: { id: monde }, user: U[etat.actif] ?? U.mj, users, scenes: { active: null },
    settings: {
      get: (_m, k) => structuredClone(lieu(k)[k]),
      // Comme le vrai réglage (aller-retour au serveur), la valeur n'est lue qu'après un délai. etat.echec : coupure simulée.
      set: async (_m, k, v) => {
        if (etat.echec?.(k)) throw new Error(`navigateur fermé pendant l'écriture de ${k}`);
        const l = lieu(k); etat.ecritures++; await new Promise(r => setTimeout(r, 1)); l[k] = structuredClone(v);
      }
    },
    socket: {
      on: () => {},
      emit: (_canal, message, options) => {
        const e = { message: structuredClone(message), recipients: options?.recipients ?? null, emetteur: game.user.id };
        etat.reseau.push(e);
        etat.emissions.push(e);
      }
    },
    i18n: { localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
    modules: { get: id => (id === ID ? { api: { moteur: { signaler: () => {} } } } : undefined) },
    actors: { find: () => null, getName: () => null, contents: [] }
  };
  globalThis.ChatMessage = { implementation: { create: async d => { etat.messages.push(d); return d; } } };
  globalThis.Hooks = { callAll: () => {}, on: () => {} };
  // Une notification permanente (rappel de la clé de secours) est notée comme telle.
  const noter = (t, o) => etat.avis.push(o?.permanent ? `${t} [permanente]` : t);
  globalThis.ui = { notifications: { info: noter, warn: noter, error: noter } };
}
// Data/ : servi à tous, sans authentification (fetch) ; seul un MJ y dépose (FilePicker). La clé de secours : téléchargée.
globalThis.foundry = {
  applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c },
    apps: { FilePicker: { implementation: {
      createDirectory: async () => {},
      upload: async (_s, dossier, fichier) => {
        if (etat.echec?.(`data:${fichier.name}`)) throw new Error(`navigateur fermé pendant l'écriture de ${fichier.name}`);
        etat.data.set(`${dossier}/${fichier.name}`, JSON.parse(await fichier.text()));
        return { path: `${dossier}/${fichier.name}` };
      },
      browse: async (_s, dossier) => ({ files: [...etat.data.keys()].filter(k => k.startsWith(`${dossier}/`)) })
    } } }
  },
  utils: { escapeHTML: s => String(s), getRoute: r => r, saveDataToFile: (texte, type, nom) => etat.telecharges.push({ texte, type, nom }) }
};
globalThis.fetch = async url => {
  const chemin = String(url).split("?")[0];
  etat.lectures++;
  return etat.data.has(chemin) ? { ok: true, json: async () => structuredClone(etat.data.get(chemin)) } : { ok: false, json: async () => null };
};
installer();

// Le serveur livre chaque message à ses destinataires connectés ; chacun le traite dans son navigateur (game.user), l'émetteur
// donné par le serveur faisant foi. Jusqu'à ce que plus rien ne circule (au plus `max` messages : au-delà, une boucle).
async function comme(userId, fn) {
  const avant = game.user;
  game.user = U[userId];
  try { return await fn(); } finally { game.user = avant; }
}
async function pomper(M, max = 500) {
  let n = 0;
  while (etat.reseau.length) {
    if (++n > max) throw new Error("messages en boucle");
    const { message, recipients, emetteur } = etat.reseau.shift();
    for (const id of recipients ?? []) if (U[id]?.active) await comme(id, () => M.canal.traiter(message, emetteur));
  }
  return n;
}
const envoyerDe = (de, message, a) => etat.reseau.push({ message, recipients: a, emetteur: de });
const reglage = cle => structuredClone(etat.mondes[game.world.id]?.[cle]);
const navigateur = id => etat.navigateurs[id] ?? {};
const partsDe = (u, monde = "monde-a") => navigateur(u).partCarnet?.[monde]?.[u] ?? {};
const cleDuMJ = (u = "mj", monde = "monde-a") => navigateur(u).cleCarnet?.[monde]?.[u]?.courante;
const emis = type => etat.emissions.filter(e => e.message.type === type);
const FIL = "lakour-mj-ia/fils/monde-a.json";
const filAvecSecrets = () => ({ fournisseur: "essai", messages: [{ role: "user", content: "[Ouverture]\n- Horloge « Rituel du Chœur Noir » : Le Héraut se manifeste" }] });

// ------------------------------------------------------------------ chargement (vrais scripts ou copie mutée)
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
const FICHIERS = ["canal.js", "constantes.js", "coffre.js", "coffre-logique.js", "secrets-logique.js", "registre-monde.js", "horloges.js",
  "horloges-logique.js", "recherche-nom.js", "carnet.js", "enquetes-logique.js", "contacts-logique.js", "apps/carnet.js", "fils.js", "utilitaires.js"];
async function charger(racine) {
  const m = f => import(pathToFileURL(join(racine, f)).href);
  const [canal, coffre, C, S, H, K, E, Ct, app, F] = await Promise.all(["canal.js", "coffre.js", "coffre-logique.js", "secrets-logique.js", "horloges.js",
    "carnet.js", "enquetes-logique.js", "contacts-logique.js", "apps/carnet.js", "fils.js"].map(m));
  return { canal, coffre, C, S, H, K, E, Ct, app, F };
}

// Une table neuve : le MJ actif démarre (première clé), les parts sont livrées et accusées.
async function table(M, options = {}) {
  installer(options);
  M.coffre.oublierCoffre();
  M.F.oublierFils();
  M.coffre.ecouterCoffre();
  await M.coffre.demarrerCoffre();
  await pomper(M);
}
// Le MJ ouvre le monde dans un autre navigateur (ses réglages client perdus) ; id : un autre MJ.
function autreNavigateur(M, id = "mj") {
  M.coffre.oublierCoffre();
  M.F.oublierFils();
  M.coffre.ecouterCoffre();
  delete etat.navigateurs[id];
}

const SECRETS = ["Rituel du Chœur Noir", "rituel-du-choeur-noir", "Le Héraut se manifeste", "NOTE-EXPO-SECRETE", "Le Gouverneur Cultiste",
  "le-gouverneur-cultiste", "crypte", "Partition", "partition-a-quatre-voix", "ornements", "sacristie", "Ilsa", "Nixi", "nixi-pese-juste",
  "NOTE-DOCKER", "RAISON-SECRETE", "Actor.docker-secret", "Culte de Slaanesh"];
const PUBLICS = ["Exposition", "Le Chœur creux", "Le diacre ment", "Registre falsifié", "Le Docker"];
async function campagne(M) {
  const { H, K, E, Ct } = M;
  await H.assurer({ nom: "Rituel du Chœur Noir", type: "horloge", max: 6, faction: "Culte de Slaanesh", notes: "Le Héraut se manifeste" });
  await H.assurer({ id: "exposition", nom: "Exposition", type: "jauge", max: 10, visible: true, notes: "NOTE-EXPO-SECRETE",
    paliers: [{ nom: "Remarqués", min: 4 }] });
  await K.assurerEnquete({ titre: "Le Gouverneur Cultiste", conclusions: ["Il prie le Warp"] });
  await K.assurerEnquete({ id: "choeur", titre: "Le Chœur creux", visible: true, conclusions: ["Le diacre ment", "Le chant vient de la crypte"],
    indices: [
      { texte: "Registre falsifié", ou: "sacristie", mene: ["Le diacre ment", "Le chant vient de la crypte"] },
      { texte: "Partition à quatre voix", ou: "coffres des ornements", mene: ["Le chant vient de la crypte"] },
      { texte: "Témoignage de Sœur Ilsa", ou: "le parloir", mene: ["Le diacre ment"] }
    ] });
  await K.modifierEnquete("choeur", e => E.marquerIndice(e, "Registre falsifié", true));
  await K.modifierEnquete("choeur", e => E.marquerConclusion(e, "Le diacre ment", true));
  await K.assurerContact({ nom: "Nixi Pèse-Juste", notes: "elle vend la cellule" });
  await K.assurerContact({ id: "docker", nom: "Le Docker", visible: true, notes: "NOTE-DOCKER", acteur: "Actor.docker-secret" });
  await K.modifierContact("docker", c => Ct.changerAttitude(c, 1, "RAISON-SECRETE"));
  await M.F.ecrireFil("monde-a.json", filAvecSecrets());
}

// Tout ce qu'un joueur reçoit : les réglages monde, les messages qui lui sont adressés, TOUT le chat, Data/. Le chiffré (base64
// tiré au hasard) est mis de côté : il pourrait contenir « nIxI » par hasard, il ne dit rien sans la clé.
const sansChiffre = o => (o && typeof o === "object" && o.donnees ? { ...o, iv: "", donnees: "" } : o);
const recuPar = joueur => JSON.stringify({
  reglages: Object.fromEntries(Object.entries(etat.mondes[game.world.id] ?? {}).map(([k, v]) => [k, sansChiffre(v)])),
  messages: etat.emissions.filter(e => !e.recipients || e.recipients.includes(joueur)).map(e => e.message),
  chat: etat.messages,
  data: [...etat.data.entries()].map(([k, v]) => [k, sansChiffre(v)])
});
const fuites = texte => SECRETS.filter(s => texte.toLowerCase().includes(s.toLowerCase()));

// ------------------------------------------------------------------ la batterie
const VERIFICATIONS = {
  async "chiffrement : aller-retour ; mauvaise clé, autre clé ou objet touché : rien ; taille par blocs d'octets"(M) {
    const cle = M.C.nouvelleCle({ id: "k1" });
    const contenu = { horloges: [{ id: "x", nom: "Rituel très secret" }] };
    const scelle = await M.C.sceller(contenu, cle);
    assert.ok(M.C.estScelle(scelle));
    assert.deepEqual(await M.C.ouvrir(scelle, cle), contenu);
    assert.ok(!JSON.stringify(scelle).includes("Rituel"));
    assert.equal(await M.C.ouvrir(scelle, M.C.nouvelleCle({ id: "k1" })), null, "mauvaise clé");
    assert.equal(await M.C.ouvrir({ ...scelle, id: "k2" }, { ...cle, id: "k2" }), null, "l'objet d'une autre clé");
    const touche = { ...scelle, donnees: (scelle.donnees[0] === "A" ? "B" : "A") + scelle.donnees.slice(1) };
    assert.equal(await M.C.ouvrir(touche, cle), null, "objet touché");
    const long = await M.C.sceller({ horloges: [{ id: "x", nom: "é".repeat(1500) }] }, cle);
    assert.equal(long.donnees.length, scelle.donnees.length, "la taille ne trahit pas ce qui a été ajouté");
    assert.equal(M.C.bourrer("é".repeat(2048)).length, 8192, "bourrage compté en octets (UTF-8), pas en caractères");
  },

  async "partage : seuil = majorité, au moins 2 ; seuil - 1 parts : rien ; seuil parts : la clé ; parts fausses ou d'une autre clé : rien"(M) {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(M.C.seuilPour), [2, 2, 2, 2, 3, 3, 4, 4]);
    const cle = M.C.nouvelleCle({ id: "k1", seuil: 3 });
    const empreinte = await M.C.empreinte(cle);
    const p = ["u1", "u2", "u3", "u4"].map(u => M.C.partDe(cle, u));
    assert.equal(M.C.reconstituer(p.slice(0, 2)), null, "deux parts sur trois");
    assert.equal(await M.C.cleDesParts(p.slice(0, 2), empreinte), null);
    const r = M.C.reconstituer([p[3], p[1], p[2]]);
    assert.deepEqual([r.k, r.a], [cle.k, cle.a], "trois parts : la clé et tout le polynôme (les parts se redonnent)");
    assert.deepEqual(M.C.partDe(r, "u1"), p[0]);
    const fausse = { ...p[0], y: (BigInt(`0x${p[0].y}`) + 12345n).toString(16) };
    assert.notEqual(M.C.reconstituer([fausse, p[1], p[2]]).k, cle.k);
    assert.equal((await M.C.cleDesParts([fausse, p[1], p[2], p[3]], empreinte))?.k, cle.k, "une part fausse n'empêche pas les vraies");
    assert.equal(await M.C.cleDesParts([p[0], p[1], { ...p[2], id: "k2" }], empreinte), null, "parts de deux clés");
  },

  async "séparation : liste blanche ; fusion clair + coffre + retraits ; refus coffre fermé ; identifiants qui ne trahissent rien"(M) {
    const { S } = M;
    const h = { id: "h", nom: "H", type: "horloge", valeur: 1, max: 4, visible: true, faction: "", notes: "N", paliers: [] };
    assert.equal(S.separer("horloges", h).publique.notes, "");
    assert.equal(S.separer("horloges", { ...h, visible: false }).publique, null);
    assert.equal(S.separer("horloges", { ...h, bientot: "secret" }).publique.bientot, undefined, "un champ inconnu ne passe pas en clair");
    const e = { id: "e", titre: "E", visible: true, maj: 1, conclusions: [{ id: "a", texte: "A", revelee: true }, { id: "b", texte: "B", revelee: false }],
      indices: [{ id: "i", texte: "I", ou: "où", mene: ["a", "b"], trouve: true }, { id: "j", texte: "J", ou: "là", mene: ["b"], trouve: false }] };
    assert.deepEqual(S.separer("enquetes", e).publique.indices, [{ id: "i", texte: "I", trouve: true, ou: "", mene: ["a"] }]);
    const c = { id: "c", nom: "C", visible: true, notes: "N", historique: ["h"], attitude: 1, acteur: "Actor.x" };
    const pc = S.separer("contacts", c).publique;
    assert.deepEqual([pc.notes, pc.historique, pc.acteur], ["", [], ""]);
    const fusion = S.fusionnerListes("horloges", [{ ...h, notes: "", valeur: 3 }, { ...h, id: "montree", notes: "" }, { ...h, id: "partie", notes: "" }],
      [h, { ...h, id: "montree", visible: false, notes: "M" }, { ...h, id: "nouvelle", visible: false }], ["partie"]);
    assert.deepEqual(fusion.map(x => [x.id, x.valeur, x.notes, x.visible]), [["h", 3, "N", true], ["montree", 1, "M", false], ["nouvelle", 1, "N", false]],
      "un élément retiré au coffre ne revient pas par le clair");
    assert.deepEqual(S.noterRetraits({}, "horloges", [{ id: "a" }, { id: "b" }], [{ id: "b" }]), { horloges: ["a"] });
    assert.deepEqual(S.noterRetraits({ horloges: ["a"] }, "horloges", [{ id: "b" }], [{ id: "a" }, { id: "b" }]), { horloges: [] }, "recréé : plus retiré");
    const pub = [{ ...h, notes: "" }];
    assert.equal(S.refusSansCoffre("horloges", pub, [{ ...h, notes: "", valeur: 4 }]), "");
    assert.match(S.refusSansCoffre("horloges", pub, [...pub, { ...h, id: "neuve", notes: "" }]), /créer/);
    assert.match(S.refusSansCoffre("horloges", pub, []), /retirer/);
    assert.match(S.refusSansCoffre("horloges", pub, [{ ...h, notes: "", visible: false }]), /cacher/);
    assert.match(S.refusSansCoffre("horloges", pub, [{ ...h, notes: "x" }]), /secrète/);
    assert.equal(S.publiqueChange("enquetes", e, { ...e, indices: [...e.indices, { id: "k", texte: "K", mene: ["b"], trouve: false }] }), false);
    assert.equal(S.publiqueChange("enquetes", e, { ...e, titre: "E2" }), true);
    const liste = [{ id: "rituel", nom: "Rituel", visible: false }, { id: "garde", nom: "Garde", visible: true }];
    assert.match(S.idNeuf("Rituel", liste, { visible: false, prefixe: "horloge" }), /^horloge-[0-9a-f]{16}$/);
    assert.match(S.idNeuf("Rituel", liste, { visible: true, prefixe: "horloge" }), /^horloge-[0-9a-f]{16}$/, "pas de rituel-2");
    assert.equal(S.idNeuf("Garde", liste, { visible: true }), "garde-2");
    assert.match(S.idApresRenommage({ id: "le-gouverneur", nom: "Le Gouverneur", visible: false }, "Menace", liste, "horloge"), /^horloge-/);
  },

  async "non-fuite : ce qu'un joueur reçoit (réglages, messages, tout le chat, Data/) ne contient rien de caché ; le MJ lit tout"(M) {
    await table(M);
    await campagne(M);
    await M.H.avancer(M.H.trouver("Rituel du Chœur Noir").id, 6);
    await pomper(M);
    assert.ok(!etat.messages.some(m => m.whisper), "aucune carte chuchotée");
    for (const joueur of ["u1", "u2", "u3", "u4"]) assert.deepEqual(fuites(recuPar(joueur)), [], `reçu par ${joueur}`);
    for (const p of PUBLICS) assert.ok(recuPar("u1").includes(p), `le visible reste en clair : ${p}`);
    assert.ok(M.C.estScelle(reglage("coffreCarnet")) && M.C.estScelle(etat.data.get(FIL)), "Carnet et fil chiffrés");
    assert.deepEqual(M.H.lister().map(e => [e.nom, e.notes]), [["Rituel du Chœur Noir", "Le Héraut se manifeste"], ["Exposition", "NOTE-EXPO-SECRETE"]]);
    assert.equal(M.K.trouverContact("docker").acteur, "Actor.docker-secret");
    assert.match((await M.F.lireFil("monde-a.json")).fil.messages[0].content, /Le Héraut/);
    await comme("u1", async () => {
      assert.deepEqual(M.H.lister().map(e => e.nom), ["Exposition"]);
      assert.deepEqual(M.K.contacts.lister().map(c => [c.nom, c.notes, c.acteur]), [["Le Docker", "", ""]]);
      assert.equal((await M.F.lireFil("monde-a.json")).fil, null, "un joueur ne lit pas le fil");
    });
  },

  async "première clé : en vigueur aussitôt, seuil = majorité des connectés ; parts à chacun, gardées par id, accusées (porteurs)"(M) {
    await table(M, { navigateurDe: id => (id === "u1" || id === "u2" ? "pc-partage" : id === "mj2" ? "mj" : id) });
    const t = reglage("trousseau");
    assert.deepEqual([t.seuil, Boolean(t.empreinte), [...t.porteurs].sort()], [2, true, ["u1", "u2", "u3"]], "3 connectés : seuil 2, trois porteurs");
    assert.ok(!etat.avis.join(" ").includes("SecoursConseille"), "assez de porteurs : pas d'avertissement");
    assert.equal(M.coffre.secoursConseille(), false);
    for (const e of emis("coffre.part")) assert.equal(e.recipients.length, 1, "une part, à son seul destinataire");
    const pc = navigateur("pc-partage").partCarnet["monde-a"];
    assert.deepEqual(Object.keys(pc).sort(), ["u1", "u2"], "deux comptes sur un navigateur : deux parts");
    assert.equal(pc.u1[t.id].x, M.C.abscisse("u1").toString(16));
    assert.equal(navigateur("pc-partage").cleCarnet, undefined, "un joueur n'a jamais la clé");
    await comme("mj2", () => assert.equal(M.coffre.cleCourante(), null, "un autre compte du même navigateur ne lit pas la clé du MJ"));
    // Une part n'est acceptée que du MJ actif.
    await comme("u3", async () => {
      assert.equal(await M.coffre.recevoirPart({ id: "k9", x: "1", y: "2" }, "mj2"), false);
      assert.equal(await M.coffre.recevoirPart({ id: "k9", x: "1", y: "2" }), false);
    });
    assert.equal(partsDe("u3").k9, undefined);
    // Un joueur qui arrive reçoit la sienne et devient porteur.
    U.u4.active = true;
    envoyerDe("u4", { type: "coffre.bonjour", userId: "u4" }, ["mj"]);
    await pomper(M);
    assert.ok(partsDe("u4")[t.id]?.y);
    assert.ok(reglage("trousseau").porteurs.includes("u4"));
  },

  async "deux MJ sur un monde neuf : seul le MJ actif crée la clé"(M) {
    installer();
    M.coffre.oublierCoffre();
    M.F.oublierFils();
    M.coffre.ecouterCoffre();
    await comme("mj2", async () => {
      await M.coffre.demarrerCoffre();
      await M.H.assurer({ nom: "Rituel", notes: "x" }).catch(() => null);
      assert.equal(await M.F.ecrireFil("monde-a.json", filAvecSecrets()), false);
    });
    assert.equal(reglage("trousseau"), undefined, "le MJ qui n'est pas actif n'en crée aucune");
    await M.coffre.demarrerCoffre();
    assert.ok(reglage("trousseau")?.id);
    assert.equal(navigateur("mj2").cleCarnet, undefined);
  },

  async "montrer / cacher ; renommé caché : nouvel identifiant ; maj stable ; aucun élément retiré ne revient après une coupure"(M) {
    await table(M);
    const r = await M.H.assurer({ nom: "Le Gouverneur est un cultiste", notes: "Le Héraut" });
    assert.match(r.id, /^horloge-[0-9a-f]{16}$/);
    await M.H.montrer(r.id, true);
    assert.deepEqual(reglage("horloges").map(e => [e.id, e.notes]), [[r.id, ""]]);
    assert.equal(M.H.trouver(r.id).notes, "Le Héraut");
    await M.H.montrer(r.id, false);
    assert.deepEqual(reglage("horloges"), []);
    etat.mondes["monde-a"].horloges = [{ id: "le-traitre-est-varn", nom: "Le traître est Varn", type: "horloge", valeur: 0, max: 6, visible: false,
      faction: "", notes: "", paliers: [] }];
    await M.H.regler("le-traitre-est-varn", { nom: "Menace sur la ruche" });
    await M.H.montrer(M.H.trouver("Menace sur la ruche").id, true);
    assert.ok(!JSON.stringify(reglage("horloges")).includes("varn"));
    await M.K.assurerEnquete({ id: "e", titre: "Enquête", visible: true, conclusions: ["Le coupable"] });
    const clair = reglage("enquetes");
    await new Promise(res => setTimeout(res, 3));
    await M.K.modifierEnquete("e", e => M.E.ajouterIndice(e, { texte: "Partition cachée", ou: "crypte", mene: ["Le coupable"] }));
    assert.deepEqual(reglage("enquetes"), clair, "changement purement secret : le clair (maj compris) ne bouge pas");
    // Retrait d'un élément visible, coupure entre le coffre et le clair : après rechargement, il ne revient pas.
    await M.H.assurer({ nom: "Visible", visible: true });
    etat.echec = k => k === "horloges";
    await assert.rejects(M.H.retirer("Visible"));
    etat.echec = null;
    M.coffre.oublierCoffre();
    await M.coffre.demarrerCoffre();
    assert.ok(!M.H.lister().some(e => e.nom === "Visible"), "retiré au coffre : ne revient pas");
    assert.ok(!reglage("horloges").some(e => e.nom === "Visible"), "et le clair est remis d'accord");
    // Retrait du dernier secret, coupure à l'écriture du coffre : l'erreur se voit, rien n'est perdu ni ressuscité à moitié.
    etat.echec = k => k === "coffreCarnet";
    await assert.rejects(M.H.retirer(r.id));
    etat.echec = null;
    M.coffre.oublierCoffre();
    await M.coffre.demarrerCoffre();
    assert.equal(M.H.trouver(r.id)?.id, r.id, "le retrait n'a pas eu lieu (coffre intact)");
    await M.H.retirer(r.id);
    assert.equal(M.H.trouver(r.id), null);
  },

  async "migration : au démarrage du MJ actif, Carnet et fils en clair passent au coffre ; un second démarrage ne relit rien"(M) {
    installer();
    M.coffre.oublierCoffre();
    M.F.oublierFils();
    M.coffre.ecouterCoffre();
    etat.mondes["monde-a"] = {
      horloges: [
        { id: "rituel-du-choeur-noir", nom: "Rituel du Chœur Noir", type: "horloge", valeur: 2, max: 6, visible: false, faction: "", notes: "Le Héraut se manifeste", paliers: [] },
        { id: "exposition", nom: "Exposition", type: "jauge", valeur: 3, max: 10, visible: true, faction: "", notes: "NOTE-EXPO-SECRETE", paliers: [] }
      ],
      contacts: [{ id: "docker", nom: "Le Docker", visible: true, notes: "NOTE-DOCKER", historique: ["RAISON-SECRETE"], attitude: 1, faction: "", lieu: "",
        dette: "", demande: "", acteur: "Actor.docker-secret", maj: 1 }]
    };
    etat.data.set(FIL, filAvecSecrets());
    etat.data.set("lakour-mj-ia/fils/monde-a-partie-2026.json", filAvecSecrets());
    await M.coffre.demarrerCoffre();
    await pomper(M);
    assert.deepEqual(fuites(recuPar("u1")), [], "plus rien de caché en clair, ni réglages ni fichiers");
    for (const [k, v] of etat.data) assert.ok(M.C.estScelle(v), `chiffré : ${k}`);
    assert.deepEqual(M.H.lister().map(e => [e.id, e.notes]), [["rituel-du-choeur-noir", "Le Héraut se manifeste"], ["exposition", "NOTE-EXPO-SECRETE"]]);
    const [n, l] = [etat.ecritures, etat.lectures];
    M.coffre.oublierCoffre();
    assert.equal(await M.coffre.demarrerCoffre(), "ouvert");
    assert.deepEqual([etat.ecritures, etat.lectures], [n, l], "une fois rangé : ni écriture ni lecture de fichier");
  },

  async "nouveau navigateur du MJ : rien de chiffré écrasé, visible utilisable ; parts demandées UNE fois par id ; seuil parts rouvrent tout"(M) {
    await table(M);
    await campagne(M);
    const coffre = reglage("coffreCarnet");
    const fil = structuredClone(etat.data.get(FIL));
    autreNavigateur(M);
    U.u2.active = false;
    U.u3.active = false;
    etat.emissions.length = 0;
    assert.equal(await M.coffre.demarrerCoffre(), "attente");
    assert.deepEqual(emis("coffre.rendrePart").map(e => [e.recipients, e.message.ids]), [[["u1"], [coffre.id]]]);
    assert.match(M.app.bandeauCoffre()?.texte ?? "", /Coffre\.Fenetre\.Attente/);
    assert.deepEqual(M.H.lister().map(e => e.id), ["exposition"]);
    assert.deepEqual(await M.F.lireFil("monde-a.json"), { fil: null, verrouille: true });
    assert.equal(await M.F.ecrireFil("monde-a.json", { messages: ["neuf"] }), false);
    assert.deepEqual(etat.data.get(FIL), fil);
    assert.equal((await M.H.avancer("exposition", 4)).element.valeur, 4);
    await assert.rejects(M.H.assurer({ nom: "Nouvelle", visible: true }), /Coffre fermé/);
    await assert.rejects(M.H.regler("exposition", { notes: "écrasée" }), /secrète/);
    await assert.rejects(M.K.modifierContact("docker", c => M.Ct.changerAttitude(c, 1, "x")), /secrète/);
    assert.deepEqual(reglage("coffreCarnet"), coffre, "le coffre n'est jamais écrasé");
    await pomper(M);
    assert.equal(emis("coffre.rendrePart").length, 1, "une seule demande, malgré les passages dans la file");
    envoyerDe("u1", { type: "coffre.partRendue", id: coffre.id, x: M.C.abscisse("u2").toString(16), y: "1" }, ["mj"]);
    await M.canal.traiter({ type: "coffre.partRendue", id: coffre.id, x: "1", y: "2", userId: "u2" });   // sans émetteur serveur
    await pomper(M);
    assert.equal(M.coffre.etatCoffre().etat, "attente");
    U.u2.active = true;
    envoyerDe("u2", { type: "coffre.bonjour", userId: "u2" }, ["mj"]);
    await pomper(M);
    assert.equal(M.coffre.etatCoffre().etat, "ouvert");
    assert.ok(cleDuMJ()?.k);
    assert.deepEqual([M.H.trouver("exposition").valeur, M.H.trouver("exposition").notes], [4, "NOTE-EXPO-SECRETE"]);
    assert.ok([...etat.data.keys()].some(k => /monde-a-avant-/.test(k)), "le fil verrouillé est gardé à part");
    assert.equal(await M.F.ecrireFil("monde-a.json", { messages: ["neuf"] }), true);
    etat.emissions.length = 0;
    await M.H.assurer({ nom: "Nouvelle", notes: "cachée" });
    await pomper(M);
    assert.equal(emis("coffre.rendrePart").length, 0, "plus rien à demander : pas de redemande");
    // chercher() redemande vraiment (des réponses ont pu se perdre).
    autreNavigateur(M);
    await M.coffre.demarrerCoffre();
    etat.reseau = etat.reseau.filter(e => e.message.type !== "coffre.rendrePart");
    await M.coffre.chercherCoffre();
    await pomper(M);
    assert.equal(M.coffre.etatCoffre().etat, "ouvert");
  },

  async "renouvellement : en vigueur seulement après `seuil` accusés ; jusque-là l'ancienne clé, et tout reste récupérable"(M) {
    await table(M);
    await campagne(M);
    const t1 = reglage("trousseau");
    for (const u of ["u2", "u3"]) U[u].active = false;
    const r = await M.coffre.renouveler({ force: true });
    await pomper(M);
    assert.equal(r.etat, "attente");
    const t = reglage("trousseau");
    assert.deepEqual([t.id, reglage("coffreCarnet").id, etat.data.get(FIL).id], [t1.id, t1.id, t1.id], "rien n'est rescellé, l'ancienne clé reste");
    assert.deepEqual([t.enCours.porteurs, t.enCours.seuil], [["u1"], 2], "parts distribuées 1 / seuil 2");
    assert.match(etat.avis.join(" "), /RenouvellementAttente.*"porteurs":1.*"seuil":2/);
    assert.ok(partsDe("u1")[t1.id] && partsDe("u1")[t.enCours.id], "le joueur garde l'ancienne part ET la nouvelle");
    // Le MJ perd son navigateur : l'ancienne clé se retrouve (les parts de la clé 1 n'ont pas été écrasées).
    const sauve = structuredClone(etat.navigateurs.mj);
    autreNavigateur(M);
    for (const u of ["u2", "u3"]) U[u].active = true;
    await M.coffre.demarrerCoffre();
    await pomper(M);
    assert.equal(M.coffre.etatCoffre().etat, "ouvert");
    assert.equal(M.H.lister().length, 2);
    // Retour au premier navigateur (la clé en cours y est) : u2 revient, accuse, la nouvelle clé entre en vigueur.
    etat.navigateurs.mj = sauve;
    M.coffre.oublierCoffre();
    U.u2.active = false;
    U.u3.active = false;
    await M.coffre.demarrerCoffre();
    await pomper(M);
    U.u2.active = true;
    envoyerDe("u2", { type: "coffre.bonjour", userId: "u2" }, ["mj"]);
    await pomper(M);
    const t2 = reglage("trousseau");
    assert.notEqual(t2.id, t1.id);
    assert.equal(t2.enCours, null);
    assert.deepEqual([reglage("coffreCarnet").id, etat.data.get(FIL).id], [t2.id, t2.id], "tout est rescellé avec la nouvelle clé");
    assert.ok(t2.anciennes.some(m => m.id === t1.id), "l'ancienne reste connue (empreinte)");
    const vieille = M.C.reconstituer(["u1", "u2", "u3"].map(u => partsDe(u)[t1.id]));
    assert.equal(await M.C.ouvrir(reglage("coffreCarnet"), vieille), null, "les anciennes parts n'ouvrent plus rien de neuf");
  },

  async "renouvellement interrompu pendant le rescellement : l'ancienne clé reste en vigueur ; un autre MJ rouvre tout, sans boucle"(M) {
    for (const casse of ["coffreCarnet", "data:monde-a-partie-1.json"]) {
      await table(M);
      await campagne(M);
      await M.F.ecrireFil("monde-a-partie-1.json", { messages: [{ content: "archive" }] });
      const t1 = reglage("trousseau");
      etat.echec = k => k === casse;
      await M.coffre.renouveler({ force: true });
      await pomper(M);
      etat.echec = null;
      const t = reglage("trousseau");
      assert.equal(t.id, t1.id, `${casse} : l'ancienne clé reste en vigueur`);
      assert.ok(t.enCours?.id);
      // mj s'en va ; mj2 (sans clé) devient MJ actif.
      U.mj.active = false;
      etat.actif = "mj2";
      autreNavigateur(M, "mj2");
      await comme("mj2", async () => {
        await M.coffre.chercherCoffre();
        assert.ok((await pomper(M, 200)) < 200, "pas de boucle de demandes");
        assert.equal(M.coffre.etatCoffre().etat, "ouvert", casse);
        assert.equal(M.H.lister().length, 2);
        assert.deepEqual((await M.F.lireArchive("monde-a-partie-1.json"))?.messages?.[0]?.content, "archive");
        assert.match(JSON.stringify((await M.F.lireFil("monde-a.json")).fil), /Le Héraut/);
        assert.ok(emis("coffre.rendrePart").filter(e => e.emetteur === "mj2").length <= 2);
      });
      etat.actif = "mj";
    }
  },

  async "un seul compte joueur : clé de secours conseillée, exportée (jamais par le monde, le chat, Data ni le socket), réimportée ailleurs"(M) {
    await table(M, { comptes: ["u1"], joueurs: ["u1"] });
    await campagne(M);
    assert.equal(M.coffre.secoursConseille(), true);
    assert.match(etat.avis.join(" "), /SecoursConseille/);
    const { texte } = await M.coffre.exporterSecours();
    assert.equal(etat.telecharges.length, 1, "téléchargée par le MJ");
    const k = JSON.parse(texte).cles[0].k;
    const partout = JSON.stringify({ mondes: etat.mondes, emissions: etat.emissions, chat: etat.messages, data: [...etat.data] });
    assert.ok(!partout.includes(k), "la clé de secours n'est nulle part ailleurs");
    autreNavigateur(M);
    await M.coffre.demarrerCoffre();
    await pomper(M);
    assert.equal(M.coffre.etatCoffre().etat, "attente", "une seule part : rien ne rouvre");
    await assert.rejects(M.coffre.importerSecours(texte.replace("monde-a", "monde-z")), /autre monde/);
    assert.equal(await M.coffre.importerSecours(texte), 1);
    assert.equal(M.coffre.etatCoffre().etat, "ouvert");
    assert.equal(M.H.lister().length, 2);
    // Renouvellement d'une table d'un joueur : la clé de secours exportée le valide.
    await M.coffre.renouveler({ force: true });
    await pomper(M);
    assert.ok(reglage("trousseau").enCours, "un porteur ne suffit pas");
    await M.coffre.exporterSecours();
    assert.equal(reglage("trousseau").enCours, null, "clé de secours exportée : la nouvelle clé entre en vigueur");
    assert.match(M.coffre.secoursExportee(), /^\d{4}-\d{2}-\d{2}T/, "la clé en cours exportée avant sa validation compte comme téléchargée");
  },

  async "rappel de la clé de secours : fenêtre à la création et au renouvellement ; « plus tard » : une notification permanente par chargement ; exportée ou réimportée : plus rien"(M) {
    const rappels = [];
    M.coffre.brancherRappel(async () => { rappels.push(reglage("trousseau").empreinte); });
    try {
      await table(M);
      const t1 = reglage("trousseau");
      assert.deepEqual(rappels, [t1.empreinte], "clé créée, jamais exportée : la fenêtre, tout de suite");
      assert.equal(M.coffre.secoursExportee(), "");
      assert.ok(!etat.avis.some(a => a.includes("SecoursRappel")), "la fenêtre, pas la notification");
      // « Plus tard », puis rechargement : une notification permanente, une seule même si le coffre redémarre deux fois.
      M.coffre.oublierCoffre();
      etat.avis.length = 0;
      await M.coffre.demarrerCoffre();
      await M.coffre.chercherCoffre();
      await pomper(M);
      assert.deepEqual(etat.avis.filter(a => a.includes("SecoursRappel")).map(a => a.slice(-12)), ["[permanente]"], "un rappel permanent par chargement");
      assert.equal(rappels.length, 1, "au chargement : pas la fenêtre");
      // Le MJ télécharge : noté dans ce navigateur seulement ; plus de rappel au chargement suivant.
      const { texte } = await M.coffre.exporterSecours();
      const date = M.coffre.secoursExportee();
      assert.match(date, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(navigateur("mj").cleCarnet["monde-a"].mj.secours[t1.empreinte], date, "mémorisé par empreinte, réglage client");
      assert.ok(!JSON.stringify(etat.mondes).includes(date), "jamais en monde");
      M.coffre.oublierCoffre();
      etat.avis.length = 0;
      await M.coffre.demarrerCoffre();
      assert.ok(!etat.avis.some(a => a.includes("SecoursRappel")), "exportée : plus de rappel");
      assert.equal(rappels.length, 1);
      // Renouvellement validé : la nouvelle clé n'a pas de clé de secours : la fenêtre, et rien de plus dans ce chargement.
      await M.coffre.renouveler({ force: true });
      await pomper(M);
      const t2 = reglage("trousseau");
      assert.equal(t2.enCours, null);
      assert.deepEqual(rappels, [t1.empreinte, t2.empreinte], "clé renouvelée : la fenêtre");
      assert.equal(M.coffre.secoursExportee(), "", "l'ancienne date ne vaut pas pour la nouvelle clé");
      await M.coffre.chercherCoffre();
      await pomper(M);
      assert.ok(!etat.avis.some(a => a.includes("SecoursRappel")), "jamais deux rappels pour une clé dans un chargement");
      assert.equal(rappels.length, 2);
      // Réimportée sur un autre navigateur (sans les joueurs) : sur disque, donc notée téléchargée à la date du fichier ; pas de rappel.
      const { texte: fichier } = await M.coffre.exporterSecours();
      assert.equal(M.coffre.secoursExportee(), JSON.parse(fichier).cree);
      autreNavigateur(M);
      for (const u of ["u1", "u2", "u3"]) U[u].active = false;
      etat.avis.length = 0;
      rappels.length = 0;
      assert.equal(await M.coffre.demarrerCoffre(), "attente");
      assert.equal(M.coffre.secoursExportee(), "", "un autre navigateur ne sait rien de ce téléchargement");
      assert.equal(await M.coffre.importerSecours(fichier), 2);
      assert.ok(M.coffre.cleCourante()?.k, "la clé est revenue");
      assert.equal(M.coffre.secoursExportee(), JSON.parse(fichier).cree, "réimportée : téléchargée à la date du fichier");
      assert.ok(!etat.avis.some(a => a.includes("SecoursRappel")) && !rappels.length, "réimportée : aucun rappel");
      // Une clé revenue par les parts, elle, n'est sur aucun disque : rappel.
      autreNavigateur(M);
      for (const u of ["u1", "u2", "u3"]) U[u].active = true;
      etat.avis.length = 0;
      await M.coffre.demarrerCoffre();
      await pomper(M);
      assert.ok(M.coffre.cleCourante()?.k, "la clé est revenue par les parts");
      assert.equal(etat.avis.filter(a => a.includes("SecoursRappel")).length, 1, "revenue par les parts : rappel");
      assert.equal(texte.length > 0, true);
    } finally { M.coffre.brancherRappel(null); }
  },

  async "rappel de la clé de secours sans fenêtre branchée, et après « repartir d'une clé neuve » : une notification permanente"(M) {
    await table(M);
    assert.deepEqual(etat.avis.filter(a => a.includes("SecoursRappel")).map(a => a.slice(-12)), ["[permanente]"]);
    etat.avis.length = 0;
    await M.coffre.abandonnerCoffre({ confirmer: true });
    assert.equal(etat.avis.filter(a => a.includes("SecoursRappel")).length, 1, "clé neuve après abandon : rappel");
    await comme("mj2", async () => {
      etat.avis.length = 0;
      M.coffre.oublierCoffre();
      await M.coffre.demarrerCoffre();
      assert.ok(!etat.avis.some(a => a.includes("SecoursRappel")), "un MJ qui n'est pas actif n'est pas rappelé");
    });
  },

  async "passage de clé : le MJ qui l'a la donne au MJ actif qui l'attend (à lui seul, émetteur MJ vérifié)"(M) {
    await table(M, { navigateurDe: id => id });
    await campagne(M);
    U.u2.active = false;
    U.u3.active = false;
    etat.actif = "mj2";
    autreNavigateur(M, "mj2");
    etat.emissions.length = 0;
    await comme("mj2", async () => {
      await M.coffre.demarrerCoffre();
      await pomper(M);
      assert.equal(M.coffre.etatCoffre().etat, "ouvert");
      assert.equal(M.H.lister().length, 2);
    });
    assert.deepEqual(emis("coffre.cle").map(e => e.recipients), [["mj2"]], "la clé ne va qu'au MJ actif");
    // Un joueur ou un MJ non actif ne reçoit rien ; un joueur qui en envoie une n'est pas cru.
    assert.equal(M.coffre.donnerCles({ ids: [reglage("trousseau").id] }, "u1"), false);
    etat.actif = "mj";
    assert.equal(await M.coffre.recevoirCles({ cles: [{ id: "x", k: "1", a: ["2"] }] }, "u1"), false);
  },

  async "chez un joueur : parts gardées par id ; rendues au seul MJ actif ; il n'écrit rien"(M) {
    await table(M);
    await M.K.assurerContact({ id: "docker", nom: "Le Docker", visible: true });
    const n = etat.ecritures;
    for (const qui of ["u1", "mj2"]) assert.equal(await comme(qui, () => M.K.modifierContact("docker", c => ({ ...c, lieu: "ailleurs" }))), null, qui);
    assert.equal(etat.ecritures, n, "seul le MJ actif écrit");
    const id = reglage("trousseau").id;
    await comme("u1", async () => {
      etat.emissions.length = 0;
      M.canal.traiter({ type: "coffre.rendrePart", ids: [id] }, "u2");
      M.canal.traiter({ type: "coffre.rendrePart", ids: [id] }, "mj2");
      M.canal.traiter({ type: "coffre.rendrePart", ids: [id], userId: "mj" });
      assert.equal(M.coffre.rendrePart({ ids: [id] }, "mj2"), false);
      assert.equal(etat.emissions.length, 0);
      M.canal.traiter({ type: "coffre.rendrePart", ids: [id, "inconnue"] }, "mj");
      assert.deepEqual(etat.emissions.map(e => [e.message.type, e.message.id, e.recipients]), [["coffre.partRendue", id, ["mj"]]]);
    });
  },

  async "fils : fichier sous une ancienne clé connue rescellé au démarrage ; sous une clé abandonnée, gardé à part"(M) {
    await table(M);
    await M.F.ecrireFil("monde-a.json", filAvecSecrets());
    const ancien = structuredClone(etat.data.get(FIL));
    await M.coffre.renouveler({ force: true });
    await pomper(M);
    const t = reglage("trousseau");
    assert.notEqual(ancien.id, t.id);
    etat.data.set("lakour-mj-ia/fils/monde-a-partie-old.json", ancien);
    M.coffre.oublierCoffre();
    await M.coffre.demarrerCoffre();
    assert.equal(etat.data.get("lakour-mj-ia/fils/monde-a-partie-old.json").id, t.id, "rescellé avec la clé en vigueur");
    // Une clé connue du trousseau mais absente d'ici : le fichier attend ses parts (verrouillé), il n'est pas mis de côté.
    const l = navigateur("mj").cleCarnet["monde-a"].mj;
    l.anciennes = l.anciennes.filter(c => c.id !== ancien.id);
    M.coffre.oublierCoffre();
    await M.coffre.demarrerCoffre();
    etat.data.set("lakour-mj-ia/fils/monde-a-partie-k1.json", ancien);
    assert.deepEqual(await M.F.lireFil("monde-a-partie-k1.json"), { fil: null, verrouille: true });
    assert.ok(![...etat.data.keys()].some(k => /monde-a-partie-k1-avant-/.test(k)), "rien n'est mis de côté : la clé se retrouve");
    await pomper(M);
    assert.match(JSON.stringify((await M.F.lireFil("monde-a-partie-k1.json")).fil), /Le Héraut/, "ses parts la rendent");
    await M.coffre.abandonnerCoffre({ confirmer: true });
    await pomper(M);
    assert.deepEqual(await M.F.lireFil("monde-a.json"), { fil: null, verrouille: false });
    assert.ok([...etat.data.keys()].some(k => /monde-a-avant-/.test(k)), "illisible : gardé à part");
    assert.equal(await M.F.ecrireFil("monde-a.json", { messages: ["neuf"] }), true);
  },

  async "remise à zéro dans la file : une écriture en cours ne fait pas renaître le coffre"(M) {
    await table(M);
    // L'entrelacement est fixé, pas laissé au hasard des minuteries (le chiffrement WebCrypto contre les écritures de 1 ms de la
    // doublure, ce qui rendait la détection d'une remise à zéro hors de la file aléatoire sous charge) : l'écriture du coffre par
    // l'enquête est retenue ; pendant ce temps, la remise à zéro va aussi loin qu'elle peut ; puis l'écriture est lâchée.
    const set = game.settings.set;
    let lacher, atteinte;
    const porte = new Promise(r => { lacher = r; });
    const retenue = new Promise(r => { atteinte = r; });
    let retenir = true;
    game.settings.set = async (m, k, v) => {
      if (k === "coffreCarnet" && retenir) { retenir = false; atteinte(); await porte; }
      return set(m, k, v);
    };
    try {
      const enCours = M.K.assurerEnquete({ titre: "Le Gouverneur Cultiste", conclusions: ["Il prie le Warp"] });
      await retenue;
      const vider = M.coffre.viderCarnet();
      // Bien plus de tours que les écritures d'une remise à zéro (une minuterie de 1 ms chacune, servies dans l'ordre).
      for (let i = 0; i < 4 * (M.S.REGISTRES.length + 2); i++) await new Promise(r => setTimeout(r, 1));
      lacher();
      await Promise.all([enCours, vider]);
    } finally { game.settings.set = set; lacher(); }
    assert.deepEqual(reglage("coffreCarnet") ?? {}, {});
    assert.equal(M.K.enquetes.lister().length, 0);
  },

  async "deux mondes dans un navigateur : une clé par monde"(M) {
    await table(M);
    await M.H.assurer({ nom: "Rituel A", notes: "a" });
    installer({ monde: "monde-b", garder: true });
    M.coffre.oublierCoffre();
    await M.coffre.demarrerCoffre();
    await M.H.assurer({ nom: "Rituel B", notes: "b" });
    assert.deepEqual(Object.keys(navigateur("mj").cleCarnet).sort(), ["monde-a", "monde-b"]);
    installer({ monde: "monde-a", garder: true });
    M.coffre.oublierCoffre();
    assert.equal(await M.coffre.demarrerCoffre(), "ouvert");
    assert.deepEqual(M.H.lister().map(e => e.nom), ["Rituel A"]);
  },

  async "aux Veillées : la clé et le fil chiffré, le Carnet intact"(M) {
    installer({ systeme: "lakour-loups" });
    M.coffre.oublierCoffre();
    M.F.oublierFils();
    etat.data.set(FIL, filAvecSecrets());
    M.coffre.brancherCoffre();
    await M.coffre.demarrerCoffre();
    await pomper(M);
    assert.ok(reglage("trousseau")?.id);
    assert.ok(M.C.estScelle(etat.data.get(FIL)), "le fil (la distribution des rôles) est chiffré");
    assert.deepEqual([reglage("horloges"), reglage("coffreCarnet")], [undefined, undefined], "le Carnet n'y est pas touché");
    etat.emissions.length = 0;
    await comme("u1", () => M.coffre.brancherCoffre());
    assert.deepEqual(etat.emissions.map(e => [e.message.type, e.recipients]), [["coffre.bonjour", ["mj"]]]);
  }
};

const MUTATIONS = [
  ["coffre-logique.js", "    bourrer(JSON.stringify({ id: cle.id, contenu })));", "    new TextEncoder().encode(JSON.stringify({ id: cle.id, contenu })));", "bourrage par blocs"],
  ["coffre-logique.js", "    return contenu?.id === scelle.id ? contenu.contenu ?? null : null;", "    return contenu.contenu;", "l'objet d'une autre clé refusé"],
  ["coffre-logique.js", "    if (!p?.id || p.id !== id || !p.x || !p.y) continue;", "    if (!p?.x || !p.y) continue;", "parts de clés différentes"],
  ["coffre-logique.js", "export const seuilPour = n => Math.max(2, Math.floor((Number(n) || 0) / 2) + 1);", "export const seuilPour = n => 2;", "seuil : la majorité"],
  ["coffre-logique.js", "      return cle && (await empreinte(cle)) === attendue ? cle : null;", "      return cle;", "empreinte vérifiée"],
  ["secrets-logique.js", "  horloges: { publique: el => ({ ...garder(el, PUBLICS.horloges), ...structuredClone(VIDES.horloges) }) },",
    "  horloges: { publique: el => ({ ...el, ...structuredClone(VIDES.horloges) }) },", "liste blanche (horloges)"],
  ["secrets-logique.js", "  contacts: { publique: c => ({ ...garder(c, PUBLICS.contacts), ...structuredClone(VIDES.contacts) }) }",
    "  contacts: { publique: c => ({ ...garder(c, PUBLICS.contacts), notes: \"\", historique: [] }) }", "PNJ d'un contact"],
  ["secrets-logique.js", "(e.indices ?? []).filter(i => i.trouve)", "(e.indices ?? [])", "indices non trouvés"],
  ["secrets-logique.js", "(liste ?? []).filter(el => el?.visible).map(", "(liste ?? []).map(", "éléments cachés en clair"],
  ["secrets-logique.js", "    if (!el.visible || !publique) resultat.push(el);", "    if (!publique) resultat.push(el);", "un caché du coffre l'emporte"],
  ["secrets-logique.js", "publics.has(el.id) && !partis.has(el.id))", "publics.has(el.id))", "un retiré ne revient pas"],
  ["secrets-logique.js", "  const liste = [...(Array.isArray(retires?.[registre]) ? retires[registre] : []).filter(id => !restants.has(id) && !partis.includes(id)), ...partis];",
    "  const liste = [...(Array.isArray(retires?.[registre]) ? retires[registre] : []), ...partis];", "recréé : plus retiré"],
  ["secrets-logique.js", "  if (ids(apres).some(id => !ids(avant).includes(id))) return \"créer un élément\";\n", "", "création coffre fermé"],
  ["secrets-logique.js", "    if (!egaux(separer(registre, ancien).secrete, separer(registre, el).secrete)) return", "    if (false) return", "partie secrète coffre fermé"],
  ["secrets-logique.js", "  if (!visible) return auHasard();\n", "", "identifiant d'un caché au hasard"],
  ["secrets-logique.js", "  if (!avant?.visible || !apres?.visible) return true;\n  const p", "  return true;\n  const p", "maj d'un changement secret"],
  ["horloges.js", "  if (!el.visible) {\n    const texte", "  if (false) {\n    const texte", "pas de carte pour un caché"],
  ["coffre.js", "  if (coffreFerme) {\n    const refus", "  if (false) {\n    const refus", "coffre jamais écrasé coffre fermé"],
  ["coffre.js", "    const nouveaux = idsManquants().filter(id => !demandes.has(id));", "    const nouveaux = idsManquants();", "une demande par id"],
  ["coffre.js", "const idsManquants = () => [...new Set([lireTrousseau().id, lireCoffre().id, ...idsVus])]", "const idsManquants = () => [...new Set([lireTrousseau().id, ...idsVus])]",
    "l'id qui scelle le coffre"],
  ["coffre.js", "export function chercherCoffre() {\n  demandes = new Set();", "export function chercherCoffre() {\n  void 0;", "chercher() redemande"],
  ["coffre.js", "  if ((t.enCours.porteurs ?? []).length >= t.enCours.seuil || p.secours) return validerRenouvellement();",
    "  return validerRenouvellement();", "renouvellement : accusés d'abord"],
  ["coffre.js", "    for (const fn of quandRenouvele) await fn(cle);\n  } catch (e) {", "    for (const fn of quandRenouvele) await fn(cle).catch(() => null);\n  } catch (e) {", "interruption : rien n'est publié"],
  ["coffre.js", "  await game.settings.set(ID, \"trousseau\", {\n    id: cle.id, seuil: cle.seuil,", "  await null;\n  if (false) await game.settings.set(ID, \"trousseau\", {\n    id: cle.id, seuil: cle.seuil,", "le trousseau publié"],
  ["coffre.js", "  if (t.id === id && !(t.porteurs ?? []).includes(userId)) {", "  if (false) {", "porteurs accusés"],
  ["coffre.js", "  emettre({ type: \"coffre.accuse\", id }, [emetteur]);\n", "", "le joueur accuse"],
  ["coffre.js", ".sort((a, b) => (b[1].recue ?? 0) - (a[1].recue ?? 0)).slice(0, MAX_PARTS_GARDEES));", ".slice(-1));", "parts gardées par id"],
  ["coffre.js", "  if (game.user.isGM || !id || !x || !y || !emetteur || emetteur !== game.users.activeGM?.id) return false;",
    "  if (game.user.isGM || !id || !x || !y) return false;", "part du seul MJ actif"],
  ["coffre.js", "  if (game.user.isGM || !emetteur || emetteur !== game.users.activeGM?.id) return false;\n  const miennes",
    "  if (game.user.isGM || !emetteur) return false;\n  const miennes", "rendue au seul MJ actif"],
  ["coffre.js", "  emettre({ type: \"coffre.cle\", cles }, [emetteur]);", "  emettre({ type: \"coffre.cle\", cles }, game.users.filter(u => u.active).map(u => u.id));", "clé au seul MJ actif"],
  ["coffre.js", "  if (mjs.length) emettre({ type: \"coffre.demandeCle\", ids }, mjs);\n", "", "clé demandée aux autres MJ"],
  ["coffre.js", "    if (C.abscisse(userId).toString(16) !== String(x)) return false;", "", "part d'un autre refusée"],
  ["coffre.js", "    if (l.enAttente?.cle) await ecrireLocal({ ...l, enAttente: { ...l.enAttente, secours: true } });", "", "secours exporté valide le renouvellement"],
  ["coffre.js", "  if (donnees.monde !== monde()) throw new Error", "  if (false) throw new Error", "secours d'un autre monde"],
  ["coffre.js", "  if (probables < (t.seuil ?? 2) || comptesJoueurs().length <= 2) {", "  if (false) {", "secours conseillé"],
  ["coffre.js", "  for (const u of joueursConnectes()) envoyerParts(u);\n  rappelerSecours(true);\n  return cle;", "  for (const u of joueursConnectes()) envoyerParts(u);\n  return cle;", "rappel à la création"],
  ["coffre.js", "  avertir(\"info\", \"Renouvelee\", { seuil: cle.seuil });\n  rappelerSecours(true);", "  avertir(\"info\", \"Renouvelee\", { seuil: cle.seuil });", "rappel au renouvellement"],
  ["coffre.js", "  rappelerSecours(false);\n}", "}", "rappel au chargement (plus tard)"],
  ["coffre.js", " || rappeles.has(t.empreinte) || secoursExportee()) return false;", " || rappeles.has(t.empreinte)) return false;", "pas de rappel si déjà exportée"],
  ["coffre.js", " || rappeles.has(t.empreinte) || secoursExportee()) return false;", " || secoursExportee()) return false;", "jamais deux rappels par chargement"],
  ["coffre.js", "  if (fenetre && fenetreRappel) {", "  if (false) {", "la fenêtre à la création"],
  ["coffre.js", "    await noterSecours(cles, cree);\n", "", "export noté"],
  ["coffre.js", "    await noterSecours(connues, Number.isNaN(creee.getTime()) ? new Date().toISOString() : creee.toISOString());\n", "", "import noté comme exporté"],
  ["coffre.js", "await game.settings.set(ID, \"cleCarnet\", { ...tout, [monde()]: { ...parMonde, [game.user.id]: l } });",
    "await game.settings.set(ID, \"cleCarnet\", { ...tout, [monde()]: { ...parMonde, [game.user.id]: { ...l, secours: {} } } });", "dates d'export gardées"],
  ["coffre.js", "    await ouvrirDansFile();\n    return fn();", "    return fn();", "coffre ouvert avant de lire"],
  ["coffre.js", "await game.settings.set(ID, \"cleCarnet\", { ...tout, [monde()]:", "await game.settings.set(ID, \"cleCarnet\", { [monde()]:", "une clé par monde"],
  ["coffre.js", "  return enFile(async () => {\n    for (const r of S.REGISTRES) await game.settings.set(ID, r, []);", "  return (async () => {\n    await null;\n    for (const r of S.REGISTRES) await game.settings.set(ID, r, []);", "remise à zéro dans la file"],
  ["canal.js", "  if (!emetteur && message.type.startsWith(\"coffre.\")) return false;\n", "", "coffre.* sans émetteur serveur"],
  ["fils.js", "    if (deja[nom] === courante.id) continue;\n", "", "rien relu pour rien"],
  ["fils.js", "    if (estScelle(brut) && brut.id === courante.id) { faits[nom] = brut.id; continue; }\n    const contenu", "    if (estScelle(brut)) continue;\n    const contenu", "ancienne clé rescellée au démarrage"],
  ["fils.js", "  if (!idConnu(brut.id) && cleCourante()) {", "  if (cleCourante()) {", "verrouillé tant que la clé est connue"],
  ["fils.js", "    await enFile(() => mettreDeCote(nom, brut));\n    return { fil: null, verrouille: false };", "    return { fil: null, verrouille: false };", "fil illisible gardé à part"],
  ["fils.js", "    const scelle = await scellerAvec(contenu, cle);", "    const scelle = await scellerCourant(contenu);", "fils rescellés avec la nouvelle clé"],
  ["registre-monde.js", "    if (!estMJActif()) return Promise.resolve(null);\n", "", "seul le MJ actif écrit"]
];

async function chargerMutant(fichier, avant, apres) {
  const dossier = mkdtempSync(join(tmpdir(), "lakour-coffre-"));
  mkdirSync(join(dossier, "apps"));
  try {
    for (const f of FICHIERS) {
      let t = readFileSync(join(SCRIPTS, f), "utf8").replace(/\r\n/g, "\n");
      if (f === fichier) {
        assert.ok(t.includes(avant), `mutation introuvable dans ${fichier} : ${avant}`);
        t = t.replace(avant, apres);
      }
      writeFileSync(join(dossier, f), t);
    }
    return await charger(dossier);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}

async function echecs(M) {
  const liste = [];
  for (const [nom, verifier] of Object.entries(VERIFICATIONS)) {
    try { await verifier(M); } catch (e) { liste.push({ nom, e }); }
    etat.echec = null;
    etat.actif = "mj";
  }
  return liste;
}

test("coffre : les vrais scripts passent toute la batterie", async () => {
  const e = await echecs(await charger(SCRIPTS));
  assert.deepEqual(e.map(x => `${x.nom} : ${x.e.message}`), []);
});

test("coffre : chaque règle cassée est détectée par la batterie", async () => {
  // Témoin : une copie sans mutation passe (sinon chaque mutant échouerait pour une autre raison que sa mutation).
  assert.deepEqual((await echecs(await chargerMutant("coffre.js", "", ""))).map(x => `${x.nom} : ${x.e.message}`), []);
  const passees = [];
  for (const [fichier, avant, apres, regle] of MUTATIONS) {
    if (!(await echecs(await chargerMutant(fichier, avant, apres))).length) passees.push(`${regle} (${fichier})`);
  }
  assert.deepEqual(passees, [], "mutations passées inaperçues");
});
