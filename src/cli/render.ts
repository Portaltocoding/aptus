import Table from "cli-table3";
import pc from "picocolors";
import type { ScoreResult } from "../core/scoring.js";
import { CALIBRATION_GAP_THRESHOLD, type CalibrationResult } from "../core/calibration.js";
import type { Gap, RoleReadiness, TierAccuracy } from "../core/readiness.js";

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

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * Formatea la curva confianza-vs-acierto (RES-04): por cada nivel de confianza
 * declarado, el acierto real con su N y una lectura honesta (sobreestimas /
 * calibrado / infravaloras). No calcula nada: solo presenta el CalibrationResult
 * del núcleo. Sin ningún score agregado.
 */
export function renderCalibration(result: CalibrationResult): string {
  if (result.byConfidence.length === 0) {
    return "Calibración: no declaraste confianza en esta sesión, no hay curva que mostrar.";
  }

  const table = new Table({
    head: ["Confianza", "Declarada", "Acierto real", "N", "Lectura"],
  });

  for (const b of result.byConfidence) {
    let lectura: string;
    if (b.gap <= -CALIBRATION_GAP_THRESHOLD) lectura = pc.red("⚠ te sobreestimas");
    else if (b.gap >= CALIBRATION_GAP_THRESHOLD) lectura = pc.yellow("te infravaloras");
    else lectura = pc.green("calibrado");

    table.push([
      CONFIDENCE_LABEL[b.confidence] ?? b.confidence,
      `~${Math.round(b.declared * 100)}%`,
      `${bar(b.accuracy)} ${Math.round(b.accuracy * 100)}%`,
      `${b.correct}/${b.answered}`,
      lectura,
    ]);
  }

  return "Calibración (confianza declarada vs acierto real):\n" + table.toString();
}

function tierCell(t: TierAccuracy): string {
  if (t.answered === 0) return "—"; // sin preguntas de este tramo: no evaluable
  return `${Math.round(t.accuracy * 100)}% (${t.correct}/${t.answered})`;
}

function levelColor(levelId: string | null): (s: string) => string {
  if (levelId === "senior") return pc.green;
  if (levelId === "mid") return pc.cyan;
  if (levelId === "junior") return pc.yellow;
  return pc.red; // por debajo del primer nivel
}

/**
 * Formatea el readiness POR ROL (RES-02): nivel alcanzado + evidencia por
 * dificultad con su N. NUNCA un score único agregado de "empleabilidad": una fila
 * por rol, cada una anclada a su desempeño real. Solo presenta; no calcula.
 */
export function renderReadiness(roles: RoleReadiness[]): string {
  const table = new Table({
    head: ["Rol", "Readiness", "Fácil", "Media", "Difícil", "N"],
  });

  for (const r of roles) {
    const byTier = new Map(r.byDifficulty.map((t) => [t.difficulty, t]));
    table.push([
      r.label,
      levelColor(r.levelId)(r.levelLabel),
      tierCell(byTier.get("easy")!),
      tierCell(byTier.get("medium")!),
      tierCell(byTier.get("hard")!),
      String(r.answered),
    ]);
  }

  // Matriz rol × dimensión: por rol, el acierto en cada dimensión núcleo (con N).
  const detalle = roles
    .map((r) => {
      const dims = r.byDimension
        .map((d) =>
          d.answered > 0
            ? `${d.dimension} ${Math.round(d.accuracy * 100)}% (${d.correct}/${d.answered})`
            : `${d.dimension} —`,
        )
        .join("  ·  ");
      return `  ${r.label}: ${dims}`;
    })
    .join("\n");

  return (
    "Readiness por rol (lectura orientativa, anclada a tu acierto por dificultad):\n" +
    table.toString() +
    "\n\nDetalle por rol y dimensión núcleo:\n" +
    detalle
  );
}

/**
 * Formatea los gaps priorizados y el plan de estudio (RES-03): "te falta X → haz
 * Z", de la dimensión más débil a la menos. No es un ranking de empleabilidad.
 */
export function renderGaps(gaps: Gap[]): string {
  if (gaps.length === 0) {
    return "Gaps: sin gaps mayores — todas las dimensiones respondidas están en 70% o más.";
  }

  const lines = gaps.map((g) => {
    const head = pc.red(`te falta ${g.dimension}`);
    const acc = `${Math.round(g.accuracy * 100)}% (${g.correct}/${g.answered})`;
    return `  • ${head} — ${acc}\n    → ${g.study}`;
  });

  return "Gaps priorizados y plan de estudio:\n" + lines.join("\n");
}
