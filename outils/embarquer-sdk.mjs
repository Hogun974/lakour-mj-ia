// Embarque les SDK officiels Anthropic et OpenAI dans le module MJ IA, en un fichier ESM
// navigateur chacun : Foundry charge le JS tel quel, sans npm ni bundler.
// Usage : npm run embarquer   (après npm install ; versions épinglées dans package.json)
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const cible = "vendor"; // dossier du module (racine de ce dépôt)
const sdks = [
  { paquet: "@anthropic-ai/sdk", nom: "Anthropic", sortie: "anthropic.mjs" },
  { paquet: "openai", nom: "OpenAI", sortie: "openai.mjs" }
];

for (const { paquet, nom, sortie } of sdks) {
  const version = JSON.parse(readFileSync(`node_modules/${paquet}/package.json`, "utf8")).version;
  await build({
    stdin: { contents: `export { default as ${nom} } from "${paquet}";`, resolveDir: ".", loader: "js" },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "eof",
    banner: { js: `// ${paquet} ${version} — embarqué par outils/embarquer-sdk.mjs, ne pas modifier à la main.` },
    outfile: `${cible}/${sortie}`
  });
  console.log(`${paquet} ${version} -> ${cible}/${sortie}`);
}
