// Joueurs IA aux Veillées SANS narrateur IA : un MJ humain mène la Table des Veillées, aucune séance du MJ IA n'est lancée, et
// les compagnons IA jouent quand même (docs/compagnons.md, « Sans narrateur IA »).
// - Point d'enregistrement game.lakourLoups.compagnons = { disponible, creer(n), retirer(acteurId) } : le bouton « + Joueur IA »
//   de la Table appelle creer (noms de la table du village, personnalité au hasard, marque compagnon) ; la distribution de la
//   Table les reprend comme des places de joueurs.
// - La nuit et les votes passent par le résolveur des compagnons (api.resolveurs.compagnon), branché au « ready », séance ou non.
// - Le jour (hook de phase « jour »), les compagnons vivants prennent la parole, au plus le bavardage réglé, en style théâtre ;
//   ils répondent aux messages publics des humains (et, plus tard, à leurs transcriptions), jamais à ceux des compagnons : pas
//   de boucle.
// - Coût : compté par le moteur dans le compteur « compagnons hors séance », borné par le même budget ; sans clé ou budget
//   atteint, repli déterministe (compagnons.js).
// Pendant une séance du MJ IA, tout cela se tait : le moteur (et le pilote automatique) mène les compagnons.
import { ID } from "./constantes.js";
import { estCompagnon, nomsPourCompagnons, oublierPrive } from "./compagnons-jeu.js";
import { personnaliteAuHasard, estAnnonceSysteme } from "./compagnons.js";

const reglage = (cle, defaut) => {
  try { return game.settings.get(ID, cle) ?? defaut; } catch { return defaut; }
};

export class CompagnonsSansNarrateur {
  // moteur : le MoteurMJ (actif = séance lancée ; compagnons = les cerveaux). api() : l'API des Veillées.
  constructor({ moteur, api = () => game.lakourLoups } = {}) {
    this.moteur = moteur;
    this.api = api;
    this.attente = [];
    this.minuterie = null;
    this.enCours = null;
    this.journal = [];   // { cause, dits } : pour les essais
  }

  // Seulement chez le MJ actif, aux Veillées, hors séance du MJ IA.
  actif() {
    return game.system?.id === "lakour-loups" && Boolean(this.api()) && game.user === game.users?.activeGM && !this.moteur?.actif;
  }

  partieDeJour() {
    const e = this.api()?.etat?.();
    return Boolean(e && !e.vainqueur && ["aube", "jour", "vote"].includes(e.phase));
  }

  // ---------- le point d'enregistrement de la Table
  enregistrer() {
    const api = this.api();
    if (!api || game.user !== game.users?.activeGM) return null;
    api.compagnons = { disponible: true, creer: n => this.creer(n), retirer: id => this.retirer(id) };
    return api.compagnons;
  }

  // n joueurs IA : des villageois sans joueur, marqués compagnon, avec un nom du village et une personnalité au hasard.
  async creer(n = 1) {
    const api = this.api();
    const nombre = Math.max(0, Math.min(18, Math.floor(Number(n) || 0)));
    if (!nombre) return [];
    const exclus = [...game.users.map(u => u.name), ...(api?.villageois?.() ?? []).map(a => a.name)];
    const noms = await nomsPourCompagnons(nombre, { exclus });
    const niveaux = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const ids = [];
    for (const nom of noms) {
      const acteur = await Actor.implementation.create({
        name: nom, type: "villageois",
        system: { joueur: "", compagnon: true, vivant: true },
        ownership: { default: niveaux.LIMITED ?? 1 },
        prototypeToken: { name: nom, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0 },
        flags: { [ID]: { compagnon: personnaliteAuHasard(`${nom}|${Math.random()}`) } }
      });
      ids.push(acteur.id);
    }
    return ids;
  }

  async retirer(acteurId) {
    const acteur = game.actors.get(acteurId);
    if (!acteur || !estCompagnon(acteur)) return false;
    await oublierPrive(acteurId);
    await acteur.delete();
    return true;
  }

  // ---------- la parole
  // Le jour se lève : un tour de parole des compagnons vivants (au plus le bavardage réglé). Une nouvelle partie : le compteur
  // « compagnons hors séance » repart de zéro.
  async surPhase(phase) {
    if (!this.actif()) return [];
    if (phase === "preparation") {
      await this.moteur?.remettreHorsSeance?.();
      return [];
    }
    if (phase !== "jour" || !this.partieDeJour()) return [];
    return this.parler("jour");
  }

  // Un message du chat : seuls les messages PUBLICS d'humains (joueurs ou MJ) font réagir ; ni une réplique de compagnon, ni un
  // message du MJ IA ou du système, ni un chuchotement.
  surMessage(message) {
    const f = message?.flags?.[ID] ?? {};
    if (f.compagnon || f.ia || message?.whisper?.length || message?.blind) return false;
    if (message?.flags?.["lakour-loups"] || estAnnonceSysteme(message?.content)) return false;
    const texte = String(message?.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!texte) return false;
    return this.entendre(`${message.speaker?.alias || message.author?.name || "?"} : ${texte}`);
  }

  // Une parole humaine (message ou, plus tard, transcription) : regroupée le temps que chacun finisse, puis un tour de parole.
  entendre(texte) {
    if (!this.actif() || !this.partieDeJour()) return false;
    this.attente.push(String(texte));
    clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => {
      const mentions = this.attente.splice(0).join("\n");
      this.parler("humain", mentions).catch(e => console.error(`${ID} | compagnons sans narrateur`, e));
    }, Math.max(0, Number(reglage("delaiReponse", 6)) || 0) * 1000);
    return true;
  }

  // Un tour de parole à la fois ; ce qui arrive pendant est entendu au tour suivant.
  async parler(cause, mentions = "") {
    while (this.enCours) await this.enCours;
    if (!this.actif()) return [];
    this.enCours = (async () => {
      try {
        const dits = await this.moteur.compagnons.reagir({ mentions });
        this.journal.push({ cause, dits });
        return dits;
      } catch (e) {
        console.error(`${ID} | compagnons sans narrateur`, e);
        return [];
      }
    })();
    try { return await this.enCours; } finally { this.enCours = null; }
  }
}
