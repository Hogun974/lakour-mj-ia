// Empaquette le module lakour-mj-ia (la racine de ce dépôt) pour une release GitHub : un manifeste module.json à part
// (celui que Foundry lit à l'adresse « releases/latest/download/module.json ») et une archive lakour-mj-ia.zip
// installable (fichiers à la racine du zip, comme Foundry l'attend). Appelé par .github/workflows/release.yml à chaque
// tag « v<version> », et utilisable à la main (`npm run empaqueter`). Même forme que l'empaqueteur des dépôts de monde
// (lakour-warcraft/outils/empaqueter-module.mjs, par exemple). Aucune dépendance : l'archive zip est écrite ici même (déflate et CRC-32
// de node:zlib).
//
// 1. lit module.json, vérifie que sa version est celle demandée (le tag fait foi, le manifeste doit déjà la porter : on
//    ne publie pas une version que le dépôt ne connaît pas) ;
// 2. renseigne « manifest » (adresse stable de la dernière version : c'est elle que Foundry interroge pour les mises à
//    jour) et « download » (archive de CETTE version, adresse datée du tag) ;
// 3. n'emballe que ce que Foundry utilise : module.json, README.md, CHANGELOG.md, LICENSE (s'il existe),
//    THIRD-PARTY-NOTICES.md (licences des SDK embarqués), assets/, lang/, scripts/, styles/, templates/, vendor/.
//    Ni essais/, ni outils/, ni docs/, ni node_modules/, ni package*.json.
//
// Usage : node outils/empaqueter-module.mjs [--version 0.39.0 | v0.39.0] [--sortie dist] [--depot <url GitHub>]
//   sans --version : la version du module.json ; --depot par défaut : https://github.com/Hogun974/lakour-mj-ia.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

export const MODULE = "lakour-mj-ia";
export const DEPOT = "https://github.com/Hogun974/lakour-mj-ia";
export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Ce qui entre dans l'archive, relativement à la racine du dépôt (= dossier du module).
export const EMBARQUES = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "THIRD-PARTY-NOTICES.md", "assets", "lang", "scripts", "styles", "templates", "vendor"];
// Fichiers de système d'exploitation qui ne doivent jamais partir.
const EXCLUS = new Set([".DS_Store", "Thumbs.db"]);

// ---------------------------------------------------------------- Adresses et manifestes

export const normaliserVersion = v => String(v ?? "").trim().replace(/^v/, "");
export const adresses = (depot, version, archive) => ({
  manifest: `${depot}/releases/latest/download/module.json`,
  download: `${depot}/releases/download/v${version}/${archive}`
});

// Manifeste publié : même contenu, version, manifest et download fixés. Le manifeste du dépôt doit déjà porter la version
// demandée (sinon le tag ne correspond à rien de connu : erreur, pas de correction silencieuse).
export function manifestePublie(manifeste, { version, depot = DEPOT, archive = `${MODULE}.zip` }) {
  const v = normaliserVersion(version || manifeste.version);
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Version invalide : « ${version} » (attendu : 0.39.0 ou v0.39.0)`);
  if (manifeste.version !== v) {
    throw new Error(`La version demandée (${v}) n'est pas celle du manifeste (${manifeste.version}) : mettre à jour « version » dans module.json avant de poser le tag v${v}`);
  }
  if (manifeste.id !== MODULE) throw new Error(`L'identifiant du manifeste (${manifeste.id}) n'est pas ${MODULE}`);
  return { ...manifeste, version: v, ...adresses(depot, v, archive) };
}

// ---------------------------------------------------------------- Archive zip (sans dépendance)

const dosDate = d => (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
const dosHeure = d => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);

// entrees : [{ nom: "chemin/dans/le/zip", contenu: Buffer, date?: Date }] -> Buffer du fichier zip (déflate, noms UTF-8).
export function zip(entrees) {
  const morceaux = [], centrales = [];
  let decalage = 0;
  for (const { nom, contenu, date = new Date(2000, 0, 1) } of entrees) {
    const nomOctets = Buffer.from(nom, "utf8");
    const comprime = deflateRawSync(contenu, { level: 9 });
    const crc = crc32(contenu) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version requise : 2.0 (déflate)
    local.writeUInt16LE(0x0800, 6);       // drapeaux : noms en UTF-8
    local.writeUInt16LE(8, 8);            // méthode : déflate
    local.writeUInt16LE(dosHeure(date), 10);
    local.writeUInt16LE(dosDate(date), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprime.length, 18);
    local.writeUInt32LE(contenu.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    local.writeUInt16LE(0, 28);
    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(20, 4);
    centrale.writeUInt16LE(20, 6);
    centrale.writeUInt16LE(0x0800, 8);
    centrale.writeUInt16LE(8, 10);
    centrale.writeUInt16LE(dosHeure(date), 12);
    centrale.writeUInt16LE(dosDate(date), 14);
    centrale.writeUInt32LE(crc, 16);
    centrale.writeUInt32LE(comprime.length, 20);
    centrale.writeUInt32LE(contenu.length, 24);
    centrale.writeUInt16LE(nomOctets.length, 28);
    centrale.writeUInt16LE(0, 30);        // extra
    centrale.writeUInt16LE(0, 32);        // commentaire
    centrale.writeUInt16LE(0, 34);        // disque
    centrale.writeUInt16LE(0, 36);        // attributs internes
    centrale.writeUInt32LE(0, 38);        // attributs externes
    centrale.writeUInt32LE(decalage, 42); // position de l'en-tête local
    morceaux.push(local, nomOctets, comprime);
    centrales.push(centrale, nomOctets);
    decalage += local.length + nomOctets.length + comprime.length;
  }
  const repertoire = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20);
  if (entrees.length > 0xffff || decalage + repertoire.length > 0xffffffff) throw new Error("Archive trop grande pour un zip sans ZIP64");
  return Buffer.concat([...morceaux, repertoire, fin]);
}

// Fichiers d'un dossier, récursivement, en chemins relatifs à « base » avec des « / » (ordre stable).
export function listerFichiers(dossier, base = dossier) {
  const resultat = [];
  for (const nom of readdirSync(dossier).sort()) {
    if (EXCLUS.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...listerFichiers(chemin, base));
    else resultat.push(relative(base, chemin).split("\\").join("/"));
  }
  return resultat;
}

// Entrées de l'archive : les fichiers embarqués, module.json remplacé par le manifeste publié. Renvoie aussi les
// avertissements (LICENSE absent, dossier manquant…) ; vendor/ vide est une erreur (le module ne démarrerait pas).
export function entreesDuModule(dossierModule, manifeste) {
  const entrees = [], avertissements = [];
  for (const element of EMBARQUES) {
    const chemin = join(dossierModule, element);
    if (element === "module.json") { entrees.push({ nom: element, contenu: Buffer.from(JSON.stringify(manifeste, null, 2) + "\n") }); continue; }
    if (!existsSync(chemin)) {
      avertissements.push(element === "LICENSE"
        ? "LICENSE absent : le champ « license » du manifeste pointera dans le vide"
        : `${element} absent`);
      continue;
    }
    if (statSync(chemin).isDirectory()) {
      const fichiers = listerFichiers(chemin);
      if (element === "vendor" && !fichiers.some(f => f.endsWith(".mjs"))) {
        throw new Error("vendor/ vide : lancer `npm run embarquer` avant d'empaqueter");
      }
      for (const f of fichiers) entrees.push({ nom: posix.join(element, f), contenu: readFileSync(join(chemin, f)) });
    } else entrees.push({ nom: element, contenu: readFileSync(chemin) });
  }
  return { entrees, avertissements };
}

// ---------------------------------------------------------------- Empaquetage

export function empaqueterModule({ version, depot = DEPOT, sortie = join(RACINE, "dist"), dossierModule = RACINE } = {}) {
  const manifeste = JSON.parse(readFileSync(join(dossierModule, "module.json"), "utf8"));
  const archive = `${manifeste.id}.zip`;
  const publie = manifestePublie(manifeste, { version, depot, archive });
  const { entrees, avertissements } = entreesDuModule(dossierModule, publie);
  mkdirSync(sortie, { recursive: true });
  const cheminZip = join(sortie, archive), cheminManifeste = join(sortie, "module.json");
  const octets = zip(entrees);
  writeFileSync(cheminZip, octets);
  writeFileSync(cheminManifeste, JSON.stringify(publie, null, 2) + "\n");
  return { version: publie.version, archive: cheminZip, manifeste: cheminManifeste, fichiers: entrees.length, octets: octets.length, avertissements };
}

// ---------------------------------------------------------------- Ligne de commande

function arguments_(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) options[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = arguments_(process.argv.slice(2));
  const sortie = resolve(o.sortie ?? "dist");
  try {
    const r = empaqueterModule({ version: o.version, depot: o.depot, sortie });
    console.log(`${MODULE} ${r.version} : ${r.fichiers} fichiers, ${(r.octets / 1048576).toFixed(1)} Mo dans ${r.archive}, manifeste ${r.manifeste}`);
    for (const a of r.avertissements) console.warn(`avertissement : ${a}`);
  } catch (e) {
    console.error(`erreur : ${e.message}`);
    process.exit(1);
  }
}
