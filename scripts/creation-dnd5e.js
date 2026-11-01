// Création complète d'un personnage D&D 5e par l'IA, sans fenêtre pour le joueur : peuple, historique et classe sont
// ajoutés par le gestionnaire d'avancements de dnd5e lui-même (AdvancementManager), dont chaque étape reçoit les choix
// de l'IA au lieu d'attendre un clic. Ce qui manque est choisi raisonnablement (première option). En cas d'échec d'une
// étape, la fenêtre de dnd5e s'ouvre chez le MJ pour finir à la main.

const CARACS = ["str", "dex", "con", "int", "wis", "cha"];

// ---------- Choix purs (essayés hors de Foundry)

// Bonus d'historique : ceux demandés s'ils respectent points, plafond et caractéristiques permises ; sinon +2/+1 sur
// les deux premières caractéristiques permises de l'ordre de priorité.
export function assignationsASI({ points = 3, cap = 2, fixed = {}, locked = [] }, voulus = [], priorites = CARACS) {
  const permises = CARACS.filter(c => !locked.includes(c));
  const assignations = { ...Object.fromEntries(Object.entries(fixed).filter(([, v]) => v)) };
  const total = voulus.reduce((s, b) => s + b.valeur, 0);
  const valides = voulus.length && total <= points
    && voulus.every(b => permises.includes(b.carac) && b.valeur > 0 && b.valeur <= cap);
  if (valides) {
    for (const b of voulus) assignations[b.carac] = (assignations[b.carac] ?? 0) + b.valeur;
    return assignations;
  }
  const ordre = [...priorites.filter(c => permises.includes(c)), ...permises.filter(c => !priorites.includes(c))];
  let reste = points;
  for (const c of ordre) {
    if (reste <= 0) break;
    const n = Math.min(cap, reste, reste === points ? cap : 1);
    assignations[c] = (assignations[c] ?? 0) + n;
    reste -= n;
  }
  return assignations;
}

// Choix dans des ensembles de traits : d'abord les préférences (clés complètes « skills:ath » ou courtes « ath »).
// groupes : [{ choix: Set<string> }] encore à pourvoir, recalculés après chaque choix par `restants`.
export async function choisirTraits(restants, preferences = []) {
  const chosen = new Set();
  for (let i = 0; i < 30; i++) {
    const groupes = (await restants(chosen)).filter(g => g.choix.size);
    if (!groupes.length) break;
    const options = [...groupes[0].choix].filter(k => !chosen.has(k));
    if (!options.length) break;
    const pref = preferences.map(p => options.find(k => k === p || k.split(":").pop() === p)).find(Boolean);
    chosen.add(pref ?? options[0]);
  }
  return [...chosen];
}

// Équipement de départ (startingEquipment de dnd5e) : objets liés (uuid × nombre) et pièces ; un « OU » prend la première
// option (« objets ») ou la dernière (« or », souvent l'argent) ; les catégories génériques (« une arme courante ») sont
// rendues en texte pour que l'IA les mentionne. entrees : [{ _id, group, sort, type, key, count }].
export function resoudreEquipement(entrees, prefere = "objets") {
  const enfants = id => entrees.filter(e => e.group === id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const resultat = { objets: [], pieces: {}, aChoisir: [] };
  const visiter = e => {
    if (e.type === "OR") {
      const options = enfants(e._id);
      const pris = prefere === "or" ? options.at(-1) : options[0];
      if (pris) visiter(pris);
    } else if (e.type === "AND") enfants(e._id).forEach(visiter);
    else if (e.type === "linked" && e.key) resultat.objets.push({ uuid: e.key, nombre: e.count || 1 });
    else if (e.type === "currency" && e.key) resultat.pieces[e.key] = (resultat.pieces[e.key] ?? 0) + (e.count || 0);
    else resultat.aChoisir.push(`${e.count || 1} × ${e.type}${e.key ? ` (${e.key})` : ""}`);
  };
  entrees.filter(e => !e.group).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).forEach(visiter);
  return resultat;
}

// ---------- Dans Foundry

// Données d'application d'une étape d'avancement, selon son type.
async function donneesPour(adv, niveau, p) {
  const type = adv.constructor.typeName ?? adv.type;
  if (type === "Size") {
    const tailles = [...(adv.configuration.sizes ?? [])];
    return { size: tailles.includes(p.taille) ? p.taille : tailles[0] ?? "med" };
  }
  if (type === "Trait") {
    const chosen = await choisirTraits(async deja => (await adv.unfulfilledChoices(deja)).available
      .map(a => ({ choix: a.choices.asSet() })), p.maitrises);
    return { chosen };
  }
  if (type === "AbilityScoreImprovement") {
    const c = adv.configuration;
    // Niveau de classe (4, 8…) : un don si l'IA en a choisi un et que les règles le permettent, sinon les bonus.
    if (p.don && adv.allowFeat) return { type: "feat", uuid: p.don };
    return { type: "asi", assignments: assignationsASI({ points: c.points, cap: c.cap, fixed: c.fixed, locked: [...(c.locked ?? [])] },
      p.bonus, p.priorites) };
  }
  if (type === "Subclass") return p.sousClasse ? { uuid: p.sousClasse } : false;
  if (type === "HitPoints") return { [niveau]: niveau === 1 && adv.item.isOriginalClass ? "max" : "avg" };
  if (type === "ItemChoice") {
    const reserve = (adv.configuration.pool ?? []).map(i => i.uuid);
    const nombre = adv.configuration.choices?.[niveau]?.count ?? 1;
    const voulus = p.choix.filter(u => !reserve.length || reserve.includes(u));
    const selected = [...voulus, ...reserve.filter(u => !voulus.includes(u))].slice(0, nombre);
    if (!selected.length) return false; // rien à proposer : la fenêtre de dnd5e prend le relais
    return { selected, ability: p.caracSorts || adv.configuration.spell?.ability?.first?.() };
  }
  if (type === "ItemGrant") {
    return { selected: (adv.configuration.items ?? []).map(i => i.uuid), ability: p.caracSorts || adv.configuration.spell?.ability?.first?.() };
  }
  return (await adv.automaticApplicationValue?.(niveau)) || {};
}

// Ajoute un objet à avancements (peuple, historique, classe) en répondant soi-même à chaque étape.
export async function ajouterAvecAvancements(acteur, donneesObjet, preferences, { delai = 60000 } = {}) {
  const Gestionnaire = dnd5e.applications.advancement.AdvancementManager;
  const gestionnaire = Gestionnaire.forNewItem(acteur, donneesObjet, { automaticApplication: true });
  if (!gestionnaire.steps.length) return acteur.createEmbeddedDocuments("Item", [donneesObjet]);
  return piloter(gestionnaire, preferences, donneesObjet.name, delai);
}

// Monte une classe d'un niveau (même pilotage : PV moyens, sous-classe, bonus ou don, choix de la classe).
export async function monterNiveau(acteur, classe, preferences, { delai = 60000 } = {}) {
  const Gestionnaire = dnd5e.applications.advancement.AdvancementManager;
  const gestionnaire = Gestionnaire.forLevelChange(acteur, classe.id, 1, { automaticApplication: true });
  if (!gestionnaire.steps.length) return classe.update({ "system.levels": (classe.system.levels ?? 0) + 1 });
  return piloter(gestionnaire, preferences, classe.name, delai);
}

// Fait avancer un gestionnaire d'avancements de dnd5e sans fenêtre : chaque étape reçoit les choix de l'IA.
function piloter(gestionnaire, preferences, nom, delai) {
  const essais = new Map();
  return new Promise((resolve, reject) => {
    const nettoyer = () => { Hooks.off("dnd5e.preAdvancementManagerRender", avant); Hooks.off("dnd5e.advancementManagerComplete", fin); clearTimeout(minuteur); };
    const avant = Hooks.on("dnd5e.preAdvancementManagerRender", g => {
      const etape = g === gestionnaire ? g.step : null;
      if (!etape?.flow || etape.automatic) return;
      // Une seule tentative par étape : si nos choix sont refusés, la fenêtre s'affiche au lieu de boucler.
      const flow = etape.flow;
      const deja = essais.get(etape);
      if (deja) { flow.getAutomaticApplicationValue = deja; return; } // fonction d'origine rendue : la fenêtre s'ouvre
      essais.set(etape, flow.getAutomaticApplicationValue);
      flow.getAutomaticApplicationValue = () => donneesPour(flow.advancement, flow.level, preferences);
    });
    const fin = Hooks.on("dnd5e.advancementManagerComplete", g => { if (g === gestionnaire) { nettoyer(); resolve(); } });
    const minuteur = setTimeout(() => { nettoyer(); reject(new Error(`${nom} : avancement non terminé (fenêtre ouverte chez le MJ ?)`)); }, delai);
    gestionnaire.render(true);
  });
}

// Objets et pièces de l'équipement de départ d'un objet (classe ou historique).
export async function donnerEquipement(acteur, objet, prefere) {
  const { objets, pieces, aChoisir } = resoudreEquipement(objet.system.startingEquipment?.map(e => e.toObject?.() ?? e) ?? [], prefere);
  const crees = [];
  for (const { uuid, nombre } of objets) {
    const source = await fromUuid(uuid).catch(() => null);
    if (!source) continue;
    const d = game.items.fromCompendium(source);
    if (nombre > 1) d.system.quantity = (d.system.quantity ?? 1) * nombre;
    crees.push(d);
  }
  if (crees.length) await acteur.createEmbeddedDocuments("Item", crees);
  const monnaie = foundry.utils.deepClone(acteur.system.currency ?? {});
  for (const [k, v] of Object.entries(pieces)) monnaie[k] = (monnaie[k] ?? 0) + v;
  if (Object.keys(pieces).length) await acteur.update({ "system.currency": monnaie });
  return { objets: crees.map(o => o.name), pieces, aChoisir };
}
