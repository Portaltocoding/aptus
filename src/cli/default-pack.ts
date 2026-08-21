import { listPackEntries, aptusPaths } from "../content/paths.js";

/**
 * Qué pack usa un comando cuando no le pasas `--pack`.
 *
 * Antes había una constante, `DEFAULT_PACK = "ai-ml-readiness"`: el nombre de uno
 * de los packs que aptus traía dentro, cableado en ocho sitios. Con aptus vacío
 * ese nombre no significa nada —puede que no tengas ningún pack, o que el tuyo se
 * llame de otra forma—, así que la elección se toma ahora mirando lo que hay:
 *
 * - **Ninguno**: no es un error de uso, es el primer día. Se dice cómo crear uno.
 * - **Uno solo**: ése, sin preguntar. Preguntar cuando no hay elección es un trámite.
 * - **Varios**: hay que decir cuál. Elegir por ti —el primero por orden alfabético,
 *   el último usado— sería adivinar sobre qué te evalúas, y eso es justo lo que
 *   aptus no hace.
 *
 * La función es PURA y recibe los nombres como dato: así se comprueba entera sin
 * tocar el disco. `requirePackName` es la capa de una línea que la alimenta.
 */

export type DefaultPackResult =
  | { ok: true; name: string }
  | { ok: false; motivo: "sin-packs" | "ambiguo"; nombres: string[] };

export function resolveDefaultPack(
  nombres: readonly string[],
  pedido?: string,
): DefaultPackResult {
  if (pedido !== undefined) return { ok: true, name: pedido };
  if (nombres.length === 0) return { ok: false, motivo: "sin-packs", nombres: [] };
  if (nombres.length === 1) return { ok: true, name: nombres[0]! };
  return { ok: false, motivo: "ambiguo", nombres: [...nombres] };
}

/**
 * El mensaje que ve quien no ha pasado `--pack`. Se separa de la decisión porque
 * es lo único que hay que leer para saber qué se le dice al usuario en cada caso,
 * y porque un texto que guía al comando siguiente merece un test propio.
 */
export function explicaFalloDePack(
  fallo: Extract<DefaultPackResult, { ok: false }>,
  packsDir: string,
): string {
  if (fallo.motivo === "sin-packs") {
    return (
      `no tienes ningún pack todavía. aptus viene vacío: genera uno del tema que\n` +
      `  quieras con \`aptus tema <tema>\`, o parte de material tuyo con \`aptus ingest <carpeta>\`.\n` +
      `  Se escribirán en ${packsDir}`
    );
  }
  return (
    `tienes ${fallo.nombres.length} packs y no has dicho cuál: ${fallo.nombres.join(", ")}.\n` +
    `  Añade \`--pack <nombre>\`.`
  );
}

/**
 * El nombre de pack con el que trabajar, o un error ya redactado. Lo usan los
 * comandos que reciben `--pack` opcional (history, review, jd, jobs, report).
 */
export function requirePackName(pedido?: string): string {
  const resultado = resolveDefaultPack(
    listPackEntries().map((e) => e.name),
    pedido,
  );
  if (resultado.ok) return resultado.name;
  throw new Error(explicaFalloDePack(resultado, aptusPaths().packsDir));
}
