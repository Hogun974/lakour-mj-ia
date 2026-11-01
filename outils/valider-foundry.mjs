// Valide les sources JSON (src/) d'un module avec les schémas de Foundry v14, validation stricte, comme le serveur au
// chargement d'un compendium (un dessin sans auteur y était rejeté en silence). Le code de Foundry n'est pas dans le dépôt :
// copier le dossier server/common d'une installation v14 (avec server/package.json à côté) et l'indiquer en 3e argument.
// Outil COMMUN aux trois mondes : chaque dépôt de monde l'appelle depuis le sous-module du moteur.
// Usage : node modules/lakour-mj-ia/outils/valider-foundry.mjs modules/lakour-40k impmal <dossier contenant common/>
//         node modules/lakour-mj-ia/outils/valider-foundry.mjs modules/lakour-warcraft dnd5e <dossier contenant common/>
//         node modules/lakour-mj-ia/outils/valider-foundry.mjs modules/lakour-veillees lakour-loups <dossier contenant common/>
// Compendiums connus pour les liens « Compendium.<module>.<pack> » : ceux de chaque module voisin (modules/*/module.json).
// Les données propres au système (system.*) ne sont pas vérifiées ici : seulement la structure Foundry.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
if (!process.argv[4]) { console.error("Usage : node modules/lakour-mj-ia/outils/valider-foundry.mjs <module> <système> <dossier de Foundry contenant common/>"); process.exit(2); }
const foundry = await import(pathToFileURL(join(process.argv[4], "common", "server.mjs")).href);
globalThis.foundry = foundry;
globalThis.CONST = foundry.CONST;
globalThis.CONFIG = { Token: { movement: { actions: { walk: {}, fly: {}, swim: {}, burrow: {}, climb: {}, crawl: {}, jump: {}, blink: {}, displace: {} } } } };
// Types : tous ceux rencontrés dans nos sources (on valide la structure Foundry, pas les données propres au système).
const racine0 = process.argv[2];
const types = new Set(["base", "text", "image", "pdf", "video", "document", "character", "npc", "vehicle", "group"]);
const parcourir = v => { if (Array.isArray(v)) v.forEach(parcourir); else if (v && typeof v === "object") { if (typeof v.type === "string") types.add(v.type); Object.values(v).forEach(parcourir); } };
for (const d of readdirSync(join(racine0, "src"))) for (const f of readdirSync(join(racine0, "src", d))) parcourir(JSON.parse(readFileSync(join(racine0, "src", d, f), "utf8")));
const parType = Object.fromEntries([...types].map(t => [t, {}]));
const systeme = { id: process.argv[3] ?? "impmal", version: "1", grid: { type: 1, distance: 2, units: "m" }, documentTypes: new Proxy({}, { get: () => parType }) };
const PACKS = new Map();
const voisins = readdirSync(join(racine0, "..")).filter(m => existsSync(join(racine0, "..", m, "module.json")));
for (const m of voisins) {
  try { for (const p of JSON.parse(readFileSync(join(racine0, "..", m, "module.json"), "utf8")).packs) PACKS.set(`${m}.${p.name}`, { documentName: p.type }); } catch {}
}
const packs = { get: id => PACKS.get(id) ?? (id?.startsWith("dnd5e.") ? { documentName: "Item" } : undefined) };
globalThis.game = { packs, release: { version: "14.369", generation: 14 }, system: systeme, model: new Proxy({}, { get: () => parType }), documentTypes: new Proxy({}, { get: () => [...types] }) };
const classes = { Adventure: foundry.documents.BaseAdventure, Scene: foundry.documents.BaseScene, JournalEntry: foundry.documents.BaseJournalEntry, RollTable: foundry.documents.BaseRollTable,
  Item: foundry.documents.BaseItem, Actor: foundry.documents.BaseActor };
const racine = process.argv[2];
const typePack = JSON.parse(readFileSync(join(racine, "module.json"), "utf8")).packs;
let erreurs = 0, n = 0;
for (const p of typePack) {
  const cls = classes[p.type];
  const dossier = join(racine, "src", p.name);
  let fichiers = [];
  try { fichiers = readdirSync(dossier); } catch { continue; }
  for (const f of fichiers) {
    const data = JSON.parse(readFileSync(join(dossier, f), "utf8"));
    n++;
    try {
      const doc = new cls(structuredClone(data), { strict: true });
      // Comparaison : un élément imbriqué abandonné (validation non stricte) disparaîtrait au chargement.
    } catch (e) {
      erreurs++;
      if (process.env.PILE) console.log(e.stack);
      const msg = String(e.message ?? e).split("\n").slice(0, 6).join(" | ");
      console.log(`✖ ${p.name}/${f} : ${msg.slice(0, 400)}`);
    }
  }
}
console.log(`${n} documents, ${erreurs} en erreur`);
process.exitCode = erreurs ? 1 : 0;
