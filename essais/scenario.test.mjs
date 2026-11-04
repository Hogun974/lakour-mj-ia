// Scénario modifiable en cours de partie : selon la personnalité (fidèle, adaptative, libre), l'IA ajoute, réécrit, annote ou
// restaure une page de journal ; la version précédente est toujours gardée.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {} };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
const { OUTILS } = await import("../scripts/outils.js");
const { decrirePersonnalite, improvisationDe, PERSONNALITES_DE_BASE } = await import("../scripts/personnalites.js");
const outil = OUTILS.find(o => o.nom === "modifier_scenario");

// Faux journal Foundry : pages avec drapeaux, mises à jour par chemin pointé.
function fauxJournal(nom, pages) {
  const j = { name: nom, pages: [] };
  const page = p => ({
    ...p, flags: p.flags ?? {},
    getFlag(scope, cle) { return this.flags[scope]?.[cle]; },
    async update(maj) {
      for (const [k, v] of Object.entries(maj)) {
        if (k === "text.content") this.text.content = v;
        else { const [, scope, cle] = k.split("."); (this.flags[scope] ??= {})[cle] = v; }
      }
    }
  });
  j.pages = pages.map(page);
  j.createEmbeddedDocuments = async (type, liste) => { j.pages.push(...liste.map(page)); };
  return j;
}

test("ajouter, réécrire, annoter, restaurer : la version précédente est gardée", async () => {
  const j = fauxJournal("Aventure — Le Chœur creux", [{ name: "Scène 2 — Le Marché", sort: 100, text: { content: "<p>Original</p>" } }]);
  globalThis.game = { journal: [j] };
  const appel = (action, page, texte, raison = "les joueurs adorent Mère Gruss") => outil.executer({ action, journal: "chœur creux", page, texte, raison });

  assert.match((await appel("ajouter_page", "Scène 2 bis — La dette de Mère Gruss", "Elle revient demander un service.")).contenu, /ajoutée/);
  assert.equal(j.pages.length, 2);
  assert.equal(j.pages[1].sort, 200, "rangée après les autres");

  await appel("reecrire_page", "Scène 2", "Version adaptée");
  assert.equal(j.pages[0].text.content, "<p>Version adaptée</p>");
  assert.equal(j.pages[0].flags["lakour-mj-ia"].historique[0].contenu, "<p>Original</p>");

  await appel("annoter_page", "Scène 2", "Les gangers ont fui vers le manufactorum.");
  assert.match(j.pages[0].text.content, /^<p>Version adaptée<\/p><hr><p><em>Note du MJ IA .* les joueurs adorent Mère Gruss<\/em><\/p><p>Les gangers/);

  await appel("restaurer_page", "Scène 2", "");
  assert.equal(j.pages[0].text.content, "<p>Version adaptée</p>");
  await appel("restaurer_page", "Scène 2", "");
  assert.equal(j.pages[0].text.content, "<p>Original</p>", "on remonte jusqu'à l'original");
  assert.ok((await appel("restaurer_page", "Scène 2", "")).erreur, "plus rien à restaurer");
});

test("journal ou page introuvable : erreur claire, rien de créé sauf pour ajouter une page", async () => {
  globalThis.game = { journal: [] };
  const r = await outil.executer({ action: "reecrire_page", journal: "Inexistant", page: "x", texte: "y", raison: "z" });
  assert.ok(r.erreur);
  assert.match(r.contenu, /Journal introuvable/);
  const j = fauxJournal("Notes", [{ name: "A", sort: 100, text: { content: "" } }]);
  globalThis.game = { journal: [j] };
  assert.match((await outil.executer({ action: "annoter_page", journal: "Notes", page: "Zzz", texte: "y", raison: "z" })).contenu, /pages : A/);
});

test("personnalité : liberté avec le scénario dans la consigne, avec repli pour les personnalités d'avant", () => {
  const parId = Object.fromEntries(PERSONNALITES_DE_BASE.map(p => [p.id, p]));
  assert.equal(improvisationDe(parId.arbitre), "fidele");
  assert.equal(improvisationDe(parId.chroniqueuse), "libre");
  assert.equal(improvisationDe({ ...parId.conteur, improvisation: undefined }), "adaptative", "valeur livrée");
  assert.equal(improvisationDe({ id: "maison", improvisation: "n'importe" }), "adaptative", "défaut");
  assert.match(decrirePersonnalite(parId.inquisiteur), /tu suis l'aventure écrite\. modifier_scenario seulement/);
  assert.match(decrirePersonnalite(parId.bouffon), /point de départ/);
});

test("personnalités livrées après coup : ajoutées une fois, jamais réimposées si supprimées", async () => {
  const { personnalitesAAjouter } = await import("../scripts/reglages.js");
  const anciennes = PERSONNALITES_DE_BASE.filter(p => p.id !== "voix-de-la-brume" && p.id !== "gramoune");
  // Monde d'avant le suivi : les nouvelles arrivent (la Voix de la brume pour les Veillées, la Gramoune pour Fénoir).
  const premier = personnalitesAAjouter(anciennes, undefined);
  assert.deepEqual(premier.nouvelles.map(p => p.id), ["voix-de-la-brume", "gramoune"]);
  assert.ok(premier.vues.includes("voix-de-la-brume") && premier.vues.includes("gramoune"));
  // Le MJ l'a supprimée ensuite : elle ne revient pas.
  assert.deepEqual(personnalitesAAjouter(anciennes, premier.vues).nouvelles, []);
  // Personnalité maison conservée, rien en double.
  const maison = [...PERSONNALITES_DE_BASE, { id: "maison", nom: "Maison" }];
  assert.deepEqual(personnalitesAAjouter(maison, undefined).nouvelles, []);
});
