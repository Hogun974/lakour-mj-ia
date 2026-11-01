// Ce que lit le MJ IA d'un journal enrichi (40k : @UUID, @Corruption ; Warcraft : @UUID, jets dnd5e [[/check …]]) : des
// noms et des jets lisibles, jamais d'identifiants.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
const { sansEnrichers } = await import("../scripts/utilitaires.js");

test("enrichers : liens et jets lus comme un joueur les voit", () => {
  assert.equal(sansEnrichers("Parlez à @UUID[Compendium.lakour-40k.pnj.Actor.abc123]{la Chanoinesse Varhonne}."), "Parlez à la Chanoinesse Varhonne.");
  assert.equal(sansEnrichers("Gagnez @Corruption[minor]{une corruption mineure}."), "Gagnez une corruption mineure.");
  assert.equal(sansEnrichers("Lien nu @UUID[Actor.abc123] ici"), "Lien nu  ici");
  assert.equal(sansEnrichers("Un [[/check skill=survival dc=13]]{test de Survie DD 13} s'impose."), "Un test de Survie DD 13 s'impose.");
  assert.equal(sansEnrichers("Sinon [[/save dex dc=13]]."), "Sinon (save dex dc=13).");
  assert.equal(sansEnrichers("Texte ordinaire [crochets] {accolades}"), "Texte ordinaire [crochets] {accolades}");
  assert.equal(sansEnrichers(null), "");
});
