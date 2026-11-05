// Les gabarits du moteur ne doivent jamais lire un champ du contexte par un nom nu qui est aussi un assistant Handlebars global
// d'un système ou d'un module courant : Handlebars appelle alors l'assistant au lieu de lire le champ. Vu en vrai (Foundry
// 14.370, monde Imperium Maledictum) : warhammer-lib déclare « pct », et les jauges du Carnet s'affichaient vides
// (« width: NaN% »). Écrire {{this.nom}} pour ces noms-là.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Assistants globaux relevés dans des mondes réels (impmal + warhammer-lib, dnd5e, fxmaster, calendaria…), hors ceux de Foundry.
const ASSISTANTS_TIERS = ["add", "calc", "config", "configLookup", "createObject", "disabled", "fallback", "formatDate",
  "formatNumber", "formatTime", "gte", "hasProperty", "ifIsGM", "ifThen", "includes", "isGM", "lte", "pct", "settings",
  "tokenImg", "tokenName", "selectOptionsArray"];

function gabarits(dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) out.push(...gabarits(p));
    else if (e.name.endsWith(".hbs")) out.push(p);
  }
  return out;
}

test("gabarits : aucun champ lu par un nom nu qui est un assistant Handlebars tiers", () => {
  const fautes = [];
  for (const f of gabarits(new URL("../templates", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\{\{\{?\s*([A-Za-z_]\w*)\s*\}?\}\}/g)) if (ASSISTANTS_TIERS.includes(m[1])) fautes.push(`${f} : {{${m[1]}}}`);
  }
  assert.deepEqual(fautes, []);
});
