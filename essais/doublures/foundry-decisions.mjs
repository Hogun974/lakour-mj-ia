// Petite doublure de Foundry pour le canal du MJ IA (vote de groupe, choix secret) : un MJ et des joueurs, un socket
// qui se comporte comme le serveur v14 (handleCustomSocket : « recipients » respecté, identifiant de l'émetteur ajouté
// par le serveur en second argument), le chat, les hooks, des fenêtres ApplicationV2 inertes.
// Un seul processus joue tous les navigateurs : livrer() pose game.user sur chaque destinataire avant de traiter.
// Utilisée par essais/vote-groupe.test.mjs et essais/choix-secret.test.mjs.

export const etat = { emissions: [], messages: [], signaux: [], hooks: [], fenetres: [], livrees: 0 };
let ecouteurs = [];
const crochets = new Map();

class Collection extends Map {
  filter(f) { return [...this.values()].filter(f); }
  find(f) { return [...this.values()].find(f); }
  map(f) { return [...this.values()].map(f); }
  some(f) { return [...this.values()].some(f); }
  get contents() { return [...this.values()]; }
}

// Identifiants à la Foundry (16 caractères) : les essais vérifient qu'aucun n'apparaît dans les textes pour l'IA.
let compteur = 0;
const nouvelId = () => `Zq${String(++compteur).padStart(14, "0")}`;

export const U = {};   // nom du joueur -> utilisateur

export function installer() {
  const users = new Collection();
  const ajouter = (name, { isGM = false, active = true, personnage = null } = {}) => {
    const u = { id: nouvelId(), name, isGM, active, character: personnage };
    users.set(u.id, u);
    U[name] = u;
    return u;
  };
  ajouter("Hogun", { isGM: true });
  ajouter("Jordan", { personnage: { name: "Brin", img: "brin.webp" } });
  ajouter("Lise", { personnage: { name: "Mira", img: "mira.webp" } });
  ajouter("Tom");
  ajouter("Absente", { active: false, personnage: { name: "Nox", img: "nox.webp" } });
  Object.defineProperty(users, "activeGM", { get: () => users.find(u => u.isGM && u.active) ?? null });

  const actors = new Collection();
  for (const [name, img] of [["Brin", "brin.webp"], ["Mira", "mira.webp"], ["Capitaine Varn", "varn.webp"]]) {
    const id = nouvelId();
    actors.set(id, { id, name, img });
  }

  globalThis.game = {
    users, actors, user: U.Hogun,
    system: { id: "impmal" },
    socket: {
      emit(canal, message, options) {
        etat.emissions.push({ canal, message: structuredClone(message), options: options === undefined ? undefined : structuredClone(options), de: game.user.id });
      },
      on(canal, fn) { ecouteurs.push({ canal, fn }); }
    },
    settings: {
      get(module, cle) {
        if (cle === "personnalites") return [{ id: "p1", nomAffiche: "Le Conteur" }];
        if (cle === "personnaliteActive") return "p1";
        return undefined;
      }
    },
    modules: new Map([["lakour-mj-ia", { api: { moteur: { signaler: (texte, options) => etat.signaux.push({ texte, options }) } } }]])
  };
  globalThis.canvas = { scene: null };
  globalThis.Hooks = {
    callAll(nom, ...args) {
      etat.hooks.push({ nom, args });
      for (const fn of crochets.get(nom) ?? []) fn(...args);
    },
    on(nom, fn) { crochets.set(nom, [...(crochets.get(nom) ?? []), fn]); },
    once() {}
  };
  globalThis.ChatMessage = { implementation: { create: async m => { etat.messages.push(structuredClone(m)); return m; } } };
  let n = 0;
  globalThis.foundry = {
    applications: {
      api: {
        // Fenêtre inerte : on retient qui l'a ouverte, render() et close() ne dessinent rien.
        ApplicationV2: class {
          constructor(options = {}) { this.options = options; this.utilisateur = game.user.id; this.rendus = 0; this.fermee = false; etat.fenetres.push(this); }
          render() { this.rendus++; return this; }
          async close() {
            if (this.fermee) return this;
            this.fermee = true;
            await this._onClose({});
            return this;
          }
          async _onClose() {}
          async _onRender() {}
        },
        HandlebarsApplicationMixin: c => c
      }
    },
    utils: {
      randomID: () => `Dm${String(++n).padStart(14, "0")}`,
      escapeHTML: s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
    }
  };
}

export function reinitialiser() {
  etat.emissions = []; etat.messages = []; etat.signaux = []; etat.hooks = []; etat.fenetres = []; etat.livrees = 0;
  game.user = U.Hogun;
  for (const u of game.users.values()) u.active = u.name !== "Absente";
}

// Agit dans le navigateur d'un utilisateur.
export async function comme(utilisateur, fn) {
  const avant = game.user;
  game.user = utilisateur;
  try { return await fn(); } finally { game.user = avant; }
}

// Livre une émission comme le serveur : aux destinataires, sinon à tous les autres ; avec l'identifiant de l'émetteur.
export async function livrer(emission) {
  const ids = Array.isArray(emission.options?.recipients) ? emission.options.recipients
    : game.users.filter(u => u.id !== emission.de && u.active).map(u => u.id);
  for (const id of ids) {
    const u = game.users.get(id);
    if (!u?.active) continue;
    for (const e of ecouteurs.filter(x => x.canal === emission.canal)) await comme(u, () => e.fn(structuredClone(emission.message), emission.de));
  }
}

// Livre tout ce qui a été émis, y compris ce que la livraison fait émettre.
export async function livrerTout() {
  while (etat.livrees < etat.emissions.length) await livrer(etat.emissions[etat.livrees++]);
  await attendre();
}

export const attendre = (ms = 0) => new Promise(r => setTimeout(r, ms));

// Fenêtre ouverte (pas encore fermée) dans le navigateur d'un utilisateur.
export const fenetreDe = utilisateur => etat.fenetres.find(f => f.utilisateur === utilisateur.id && !f.fermee);
