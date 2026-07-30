import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, YAMLSeq } from "yaml";

/**
 * Edición quirúrgica de `pack.yaml`. Existe para que declarar una dimensión no
 * obligue a abrir el YAML a mano.
 *
 * Usa `parseDocument` y no `parse`+`stringify` a propósito: lo segundo reescribe
 * el fichero entero y se lleva por delante los comentarios, que en un pack son
 * la mitad del contenido útil (de dónde salió, qué falta por hacer). Aquí se
 * toca el nodo que hay que tocar y el resto se queda como estaba.
 */

/** Resultado de intentar declarar una dimensión, para poder decir qué pasó. */
export type DeclareResult = "añadida" | "ya-estaba";

/**
 * Añade una dimensión a la lista `dimensions` del YAML dado y devuelve el texto
 * resultante. Función pura sobre el texto: el I/O va aparte, en `declareDimension`.
 */
export function addDimensionToYaml(
  yamlText: string,
  dimension: string,
): { text: string; result: DeclareResult } {
  const doc = parseDocument(yamlText);

  const seq = doc.get("dimensions");
  if (!(seq instanceof YAMLSeq)) {
    // Un pack sin `dimensions` (o con algo que no es una lista) no es editable a
    // ciegas: mejor decirlo que dejar un pack.yaml corrupto detrás.
    throw new Error("pack.yaml no declara una lista 'dimensions' que se pueda editar.");
  }

  const actuales = seq.items.map((item) => String(doc.createNode(item).toJSON()));
  if (actuales.includes(dimension)) {
    return { text: yamlText, result: "ya-estaba" };
  }

  seq.add(dimension);
  return { text: doc.toString(), result: "añadida" };
}

/** Declara la dimensión en el `pack.yaml` de la ruta dada. */
export function declareDimension(packYamlPath: string, dimension: string): DeclareResult {
  const { text, result } = addDimensionToYaml(readFileSync(packYamlPath, "utf8"), dimension);
  if (result === "añadida") writeFileSync(packYamlPath, text, "utf8");
  return result;
}
