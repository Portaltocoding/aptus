import Table from "cli-table3";
import pc from "picocolors";
import type { ScoreResult } from "../core/scoring.js";

/**
 * Barra unicode coloreada por umbral (verde/amarillo/rojo). Estética sobria,
 * sin arte. Es solo presentación: no deriva ni ajusta ningún score.
 */
function bar(pct: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  const glyphs = "█".repeat(filled) + "░".repeat(width - filled);
  const colorFn = pct >= 0.7 ? pc.green : pct >= 0.4 ? pc.yellow : pc.red;
  return colorFn(glyphs);
}

/**
 * Formatea el `ScoreResult` del núcleo como una tabla por dimensión. El N
 * (respondidas/presentadas) acompaña SIEMPRE al porcentaje (RES-01) y NUNCA se
 * muestra un score único agregado tipo "empleabilidad". Esta capa solo
 * formatea: el cálculo vive por completo en `src/core/scoring.ts`.
 */
export function renderResult(result: ScoreResult): string {
  const table = new Table({
    head: ["Dimensión", "Resultado", "N (respondidas/presentadas)"],
  });

  for (const d of result.byDimension) {
    table.push([
      d.dimension,
      `${bar(d.pct)} ${Math.round(d.pct * 100)}%`,
      `${d.answered}/${d.presented}`,
    ]);
  }

  return table.toString();
}
