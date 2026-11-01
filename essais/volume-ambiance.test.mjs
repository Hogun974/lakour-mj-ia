// Ambiance sonore et voix du narrateur : l'ambiance est plus basse par défaut, plafonnée, et baissée pendant que le narrateur
// parle (le MJ change le volume de la piste, que Foundry répercute chez chaque joueur), puis rendue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planAttenuation, volumeAmbiance, VOLUME_AMBIANCE, ATTENUATION_AMBIANCE } from "../scripts/voix-texte.js";

// Globales de Foundry lues au chargement des modules du MJ IA (fenêtres ApplicationV2).
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c } }, utils: {}, audio: {} };

test("volume d'une ambiance : 0,3 par défaut, jamais au-dessus de 0,6 ni sous 0,05", () => {
  assert.equal(volumeAmbiance(undefined), VOLUME_AMBIANCE.defaut);
  assert.equal(volumeAmbiance(0), VOLUME_AMBIANCE.defaut, "0 ou rien : la valeur par défaut");
  assert.equal(volumeAmbiance(1), 0.6, "plafonné : la voix reste devant");
  assert.equal(volumeAmbiance(0.01), 0.05);
  assert.equal(volumeAmbiance(0.4), 0.4);
});

test("atténuation : seulement les pistes qui jouent, à 30 % de leur volume ; deux voix de suite ne la font pas descendre deux fois", () => {
  const pistes = [{ id: "pluie", playing: true, volume: 0.4 }, { id: "feu", playing: false, volume: 0.5 }];
  assert.deepEqual(planAttenuation(pistes), [{ id: "pluie", origine: 0.4, pendant: 0.12 }]);
  // Seconde narration pendant que la piste est déjà baissée (volume 0,12) : on garde le volume d'origine mémorisé.
  const deja = [{ id: "pluie", playing: true, volume: 0.12 }];
  assert.deepEqual(planAttenuation(deja, { pluie: 0.4 }), [{ id: "pluie", origine: 0.4, pendant: 0.12 }]);
  assert.equal(ATTENUATION_AMBIANCE, 0.3);
});

// Doublure minimale : une playlist « Ambiances (MJ IA) », des pistes qui enregistrent leurs mises à jour, AudioHelper.play.
function monde({ estMJ = true } = {}) {
  const majs = [];
  const piste = (id, playing, volume) => ({ id, playing, volume,
    async update(d) { majs.push([id, d.volume]); Object.assign(this, d); } });
  const sons = [piste("pluie", true, 0.4), piste("vent", false, 0.3)];
  const playlist = { getFlag: (s, k) => s === "lakour-mj-ia" && k === "ambiances", sounds: { contents: sons } };
  const joues = [];
  globalThis.game = { user: { isGM: estMJ }, playlists: [playlist], settings: { get: () => "" } };
  globalThis.foundry.audio = { AudioHelper: { play: async (o, diffuser) => { joues.push([o.src, diffuser, sons[0].volume]); return { duration: 0 }; } } };
  return { sons, majs, joues };
}

test("pendant la voix diffusée, l'ambiance qui joue est baissée chez tous, puis rendue à son volume", async () => {
  const { jouerTousLesMorceaux } = await import("../scripts/voix.js");
  const { sons, majs, joues } = monde();
  await jouerTousLesMorceaux(["a.wav", "b.wav"], true);
  assert.deepEqual(joues.map(j => j[2]), [0.12, 0.12], "les deux morceaux sont joués avec l'ambiance baissée");
  assert.deepEqual(majs, [["pluie", 0.12], ["pluie", 0.4]], "baissée puis rendue ; la piste arrêtée n'est pas touchée");
  assert.equal(sons[0].volume, 0.4);
  // Réécoute locale (bouton 🔊) : pas de mise à jour de la playlist.
  majs.length = 0;
  await jouerTousLesMorceaux(["a.wav"], false);
  assert.deepEqual(majs, []);
});

test("un joueur (pas le MJ) ne modifie jamais la playlist", async () => {
  const { jouerTousLesMorceaux } = await import("../scripts/voix.js");
  const { majs } = monde({ estMJ: false });
  await jouerTousLesMorceaux(["a.wav"], true);
  assert.deepEqual(majs, []);
});
