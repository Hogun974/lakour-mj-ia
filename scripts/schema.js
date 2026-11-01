// Validation des arguments d'un appel d'outil contre son schéma JSON, avant de l'exécuter.
// Couvre ce que nos schémas utilisent : object (propriétés requises, aucune inconnue), array (items),
// string / integer / number / boolean, enum. Renvoie la liste des erreurs (vide = valide).
export function validerSchema(schema, valeur, chemin = "arguments") {
  const erreurs = [];
  if (schema.enum && !schema.enum.includes(valeur)) {
    erreurs.push(`${chemin} : « ${valeur} » n'est pas parmi ${schema.enum.join(", ")}`);
    return erreurs;
  }
  switch (schema.type) {
    case "object": {
      if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return [`${chemin} : objet attendu`];
      const proprietes = schema.properties ?? {};
      for (const cle of schema.required ?? []) if (!(cle in valeur)) erreurs.push(`${chemin}.${cle} : champ manquant`);
      for (const [cle, v] of Object.entries(valeur)) {
        if (!(cle in proprietes)) {
          if (schema.additionalProperties === false) erreurs.push(`${chemin}.${cle} : champ inconnu`);
          continue;
        }
        erreurs.push(...validerSchema(proprietes[cle], v, `${chemin}.${cle}`));
      }
      break;
    }
    case "array":
      if (!Array.isArray(valeur)) return [`${chemin} : tableau attendu`];
      valeur.forEach((v, i) => erreurs.push(...validerSchema(schema.items ?? {}, v, `${chemin}[${i}]`)));
      break;
    case "string":
      if (typeof valeur !== "string") erreurs.push(`${chemin} : texte attendu`);
      break;
    case "integer":
      if (!Number.isInteger(valeur)) erreurs.push(`${chemin} : nombre entier attendu`);
      break;
    case "number":
      if (typeof valeur !== "number" || Number.isNaN(valeur)) erreurs.push(`${chemin} : nombre attendu`);
      break;
    case "boolean":
      if (typeof valeur !== "boolean") erreurs.push(`${chemin} : vrai/faux attendu`);
      break;
  }
  return erreurs;
}
