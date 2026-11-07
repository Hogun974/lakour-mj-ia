// Essais des fournisseurs du MJ IA, SANS appel réseau : le client du SDK est remplacé par une doublure
// qui enregistre la requête et rend une réponse préparée.  Lancer : npm run essais
import { test } from "node:test";
import assert from "node:assert/strict";
import { FournisseurAnthropic } from "../scripts/fournisseurs/anthropic.js";
import { FournisseurOpenAI } from "../scripts/fournisseurs/openai.js";
import { FournisseurFactice } from "../scripts/fournisseurs/factice.js";

const OUTIL = { nom: "noter", description: "Note.", schema: { type: "object", properties: { t: { type: "string" } }, required: ["t"], additionalProperties: false } };

function doublureAnthropic(f, message) {
  const appel = {};
  f.client = { beta: { messages: { stream(params) {
    appel.params = structuredClone(params);
    const ecouteurs = {};
    return {
      on(evt, cb) { ecouteurs[evt] = cb; return this; },
      async finalMessage() {
        for (const b of message.content) if (b.type === "text") ecouteurs.text?.(b.text);
        return message;
      }
    };
  } } } };
  return appel;
}

const usageA = { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 40 };

test("Anthropic : requête complète (cache, compaction, repli, outils SANS strict, effort)", async () => {
  const f = new FournisseurAnthropic({ cle: "x", modele: "claude-opus-5-5", effort: "high" });
  const appel = doublureAnthropic(f, { content: [{ type: "text", text: "Bonjour." }], stop_reason: "end_turn", usage: usageA });
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "Salut");
  let flux = "";
  const r = await f.envoyer(fil, { systeme: "SYS", outils: [OUTIL], surTexte: t => { flux += t; } });
  const p = appel.params;
  assert.equal(p.model, "claude-opus-5-5");
  // Points de cache : fin des outils et fin du prompt système (une heure), le fil par le point automatique (cinq minutes).
  assert.deepEqual(p.system, [{ type: "text", text: "SYS", cache_control: { type: "ephemeral", ttl: "1h" } }]);
  assert.deepEqual(p.cache_control, { type: "ephemeral" });
  assert.deepEqual(p.tools.at(-1).cache_control, { type: "ephemeral", ttl: "1h" });
  assert.deepEqual(p.thinking, { type: "adaptive" });
  assert.deepEqual(p.output_config, { effort: "high" });
  assert.deepEqual(p.context_management, { edits: [{ type: "compact_20260112" }] });
  assert.deepEqual(p.betas, ["compact-2026-01-12", "server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  // « strict » fait refuser la requête (400 « compiled grammar is too large ») avec nos ~16 outils.
  assert.ok(p.tools.every(t => !("strict" in t)), "strict ne doit pas être envoyé à Anthropic");
  assert.equal(p.tools[0].name, "noter");
  assert.ok(!("budget_tokens" in (p.thinking ?? {})), "budget_tokens interdit sur Opus 5.5");
  assert.ok(!("temperature" in p), "temperature refusée par l'API depuis le 21/10/2026");
  assert.equal(r.texte, "Bonjour.");
  assert.equal(flux, "Bonjour.");
  assert.equal(r.arret, "fin");
  assert.deepEqual(r.usage, { entree: 100, cacheLecture: 900, cacheEcriture: 50, sortie: 40 });
  // Le fil garde la réponse complète, telle quelle (réflexion préservée).
  assert.equal(fil.messages.length, 2);
  assert.equal(fil.messages[1].role, "assistant");
});

test("Anthropic : Haiku n'a pas de repli serveur", async () => {
  const f = new FournisseurAnthropic({ cle: "x", modele: "claude-haiku-5-5", effort: "low" });
  const appel = doublureAnthropic(f, { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: usageA });
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "x");
  await f.envoyer(fil, { systeme: "S", outils: [] });
  assert.deepEqual(appel.params.betas, ["compact-2026-01-12"]);
  assert.ok(!("fallbacks" in appel.params));
});

test("Anthropic : appel d'outil puis résultats regroupés dans un seul message", async () => {
  const f = new FournisseurAnthropic({ cle: "x", modele: "claude-sonnet-5-5", effort: "medium" });
  doublureAnthropic(f, {
    content: [{ type: "text", text: "Je note." }, { type: "tool_use", id: "t1", name: "noter", input: { t: "a" } }, { type: "tool_use", id: "t2", name: "noter", input: { t: "b" } }],
    stop_reason: "tool_use", usage: usageA
  });
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "x");
  const r = await f.envoyer(fil, { systeme: "S", outils: [OUTIL] });
  assert.equal(r.arret, "outils");
  assert.deepEqual(r.appels, [{ id: "t1", nom: "noter", args: { t: "a" } }, { id: "t2", nom: "noter", args: { t: "b" } }]);
  f.ajouterResultats(fil, [{ id: "t1", contenu: "ok" }, { id: "t2", contenu: "raté", erreur: true }]);
  const dernier = fil.messages.at(-1);
  assert.equal(dernier.role, "user");
  assert.deepEqual(dernier.content, [
    { type: "tool_result", tool_use_id: "t1", content: "ok" },
    { type: "tool_result", tool_use_id: "t2", content: "raté", is_error: true }
  ]);
});

test("Anthropic : un refus n'exécute aucun outil", async () => {
  const f = new FournisseurAnthropic({ cle: "x", modele: "claude-opus-5-5", effort: "medium" });
  doublureAnthropic(f, {
    content: [{ type: "tool_use", id: "t1", name: "noter", input: { t: "a" } }],
    stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: "non" }, usage: usageA
  });
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "x");
  const r = await f.envoyer(fil, { systeme: "S", outils: [OUTIL] });
  assert.equal(r.arret, "refus");
  assert.deepEqual(r.appels, []);
  assert.equal(r.detail, "non");
});

test("Anthropic : arguments d'outil tronqués (max_tokens) = erreur, rien n'est exécuté", async () => {
  const f = new FournisseurAnthropic({ cle: "x", modele: "claude-opus-5-5", effort: "medium" });
  doublureAnthropic(f, { content: [{ type: "tool_use", id: "t1", name: "noter", input: { t: "a" } }], stop_reason: "max_tokens", usage: usageA });
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "x");
  await assert.rejects(() => f.envoyer(fil, { systeme: "S", outils: [OUTIL] }), /coupée/);
});

test("OpenAI : requête Responses, appels de fonction, résultats et usage", async () => {
  const f = new FournisseurOpenAI({ cle: "x", modele: "gpt-5.5", effort: "max", modeleImage: "gpt-image-2" });
  let params;
  const sortie = [
    { type: "reasoning", id: "r1", summary: [] },
    // Champs ajoutés par l'assistant de flux du SDK, refusés par l'API s'ils lui sont renvoyés.
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hmm.", annotations: [], parsed: null }] },
    { type: "function_call", call_id: "c1", name: "noter", arguments: "{\"t\":\"a\"}", parsed_arguments: { t: "a" } }
  ];
  f.client = { responses: { stream(p) {
    params = structuredClone(p);
    return { on() { return this; }, async finalResponse() {
      return { output: sortie, output_text: "", usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 30 } };
    } };
  } } };
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "Salut");
  const r = await f.envoyer(fil, { systeme: "SYS", outils: [OUTIL] });
  assert.equal(params.instructions, "SYS");
  assert.deepEqual(params.reasoning, { effort: "high" }, "max -> high chez OpenAI");
  assert.deepEqual(params.tools[0], { type: "function", name: "noter", description: "Note.", parameters: OUTIL.schema, strict: true });
  assert.equal(r.arret, "outils");
  assert.deepEqual(r.appels, [{ id: "c1", nom: "noter", args: { t: "a" } }]);
  assert.deepEqual(r.usage, { entree: 200, cacheLecture: 800, cacheEcriture: 0, sortie: 30 });
  // Le raisonnement, le texte et l'appel sont renvoyés au tour suivant, sans les champs propres au SDK.
  assert.equal(fil.elements.length, 4);
  f.ajouterResultats(fil, [{ id: "c1", contenu: "ok" }]);
  assert.deepEqual(fil.elements.at(-1), { type: "function_call_output", call_id: "c1", output: "ok" });
  // Un fil enregistré avant la correction (champs du SDK encore présents) est nettoyé à l'envoi.
  fil.elements.splice(2, 0, structuredClone(sortie[2]));
  await f.envoyer(fil, { systeme: "SYS", outils: [OUTIL] });
  const envoye = JSON.stringify(params.input);
  assert.doesNotMatch(envoye, /parsed/, envoye);
  assert.deepEqual(params.input.find(e => e.type === "function_call"), { type: "function_call", call_id: "c1", name: "noter", arguments: "{\"t\":\"a\"}" });
  assert.deepEqual(params.input.find(e => e.type === "message").content, [{ type: "output_text", text: "Hmm.", annotations: [] }]);
});

test("Factice : écho et déclenchement d'outil", async () => {
  const f = new FournisseurFactice();
  const fil = f.nouveauFil();
  f.ajouterUtilisateur(fil, "!outil noter {\"t\":\"z\"}");
  const r = await f.envoyer(fil, {});
  assert.deepEqual(r.appels.map(a => [a.nom, a.args]), [["noter", { t: "z" }]]);
  f.ajouterResultats(fil, [{ id: r.appels[0].id, contenu: "noté" }]);
  const r2 = await f.envoyer(fil, {});
  assert.match(r2.texte, /noté/);
  assert.equal(r2.arret, "fin");
});
