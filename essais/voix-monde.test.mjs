// La voix de la table (A/V de Foundry) : ce qui empêche de s'entendre, et la réparation d'un clic depuis la console du MJ IA,
// dans les trois mondes. Le serveur relais (TURN) déjà réglé est gardé ; seul le rôle Joueur gagne le droit au micro.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = { utils: { deepClone: o => structuredClone(o) } };
globalThis.CONST = { USER_ROLES: { PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 } };
const V = await import("../scripts/voix-monde.js");

test("diagnostic : audio désactivé, joueurs sans droit de micro (le MJ n'en a pas besoin)", () => {
  const u = (nom, isGM, diffuse) => ({ nom, isGM, diffuse });
  assert.deepEqual(V.diagnosticVoix({ mode: 0, utilisateurs: [u("DEUS", true, true), u("Hogun974", false, false)] }),
    { desactive: true, muets: ["Hogun974"], pret: false });
  assert.deepEqual(V.diagnosticVoix({ mode: 1, utilisateurs: [u("DEUS", true, false), u("Ana", false, true)] }), { desactive: false, muets: [], pret: true });
  assert.equal(V.diagnosticVoix({ mode: 3 }).pret, true, "audio et vidéo : la voix marche aussi");
});

test("réparer : audio seul en gardant le relais ; micro donné au rôle Joueur sans rien retirer", async () => {
  const reglages = new Map([
    ["core.rtcWorldSettings", { mode: 0, turn: { type: "custom", url: "turn:exemple:3478", username: "u", password: "p" } }],
    ["core.permissions", { BROADCAST_AUDIO: [2, 3, 4], BROADCAST_VIDEO: [2, 3, 4] }]
  ]);
  const users = [{ name: "DEUS", isGM: true, role: 4 }, { name: "Hogun974", isGM: false, role: 1 }];
  globalThis.game = {
    settings: { get: (s, c) => structuredClone(reglages.get(`${s}.${c}`)), set: async (s, c, v) => { reglages.set(`${s}.${c}`, v); } },
    users: users.map(u => ({ ...u, can: p => reglages.get("core.permissions")[p].includes(u.role) }))
  };
  game.users.map = Array.prototype.map.bind(game.users);
  assert.deepEqual(V.voixDuMonde(), { desactive: true, muets: ["Hogun974"], pret: false });
  await V.activerAudio();
  assert.deepEqual(reglages.get("core.rtcWorldSettings"), { mode: 1, turn: { type: "custom", url: "turn:exemple:3478", username: "u", password: "p" } });
  await V.donnerMicro();
  assert.deepEqual(reglages.get("core.permissions"), { BROADCAST_AUDIO: [1, 2, 3, 4], BROADCAST_VIDEO: [2, 3, 4] }, "la vidéo n'est pas touchée");
  await V.donnerMicro();
  assert.deepEqual(reglages.get("core.permissions").BROADCAST_AUDIO, [1, 2, 3, 4], "pas de doublon");
  assert.equal(V.voixDuMonde().pret, true);
});
