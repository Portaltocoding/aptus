import type { Pack } from "../content/schema.js";

/**
 * Auditoría de CALIDAD de un pack (pura, sin I/O), más allá de la validación de
 * schema que ya hace loadPack. Sirve de control "curadas, no relleno" al construir
 * packs nuevos desde fuentes. Distingue errores (bloquean) de avisos (orientativos).
 */

export interface AuditFinding {
  code: string;
  message: string;
  questionId?: string;
}

export interface AuditReport {
  errors: AuditFinding[];
  warnings: AuditFinding[];
}

const MIN_PER_DIMENSION = 12;
const MIN_EXPLANATION = 20;
const MIN_STEM = 15;

/**
 * A partir de cuánta concentración en una misma posición se avisa de sesgo. Con 4
 * opciones lo esperable es ~25% por posición; un 50% ya es adivinable a ojo, y
 * quien escribe preguntas a mano tiende a poner la correcta la primera sin darse
 * cuenta. Solo se mira con muestra suficiente para que el aviso signifique algo.
 */
const POSITION_BIAS_THRESHOLD = 0.5;
const POSITION_BIAS_MIN_SAMPLE = 20;

/** Heurística de "sin curar": contenido del esqueleto o texto de relleno evidente. */
function looksUncurated(stem: string, explanation: string, id: string, dimension: string): boolean {
  if (/^ejemplo-/i.test(id) || dimension === "dimension-ejemplo") return true;
  return /lorem ipsum|placeholder|rellenar|\bxxx\b|texto de relleno/i.test(
    `${stem} ${explanation}`,
  );
}

export function auditPack(pack: Pack, minPerDimension: number = MIN_PER_DIMENSION): AuditReport {
  const errors: AuditFinding[] = [];
  const warnings: AuditFinding[] = [];

  // IDs únicos (el schema no lo comprueba).
  const seen = new Set<string>();
  for (const q of pack.questions) {
    if (seen.has(q.id))
      errors.push({ code: "dup-id", message: `id duplicado: ${q.id}`, questionId: q.id });
    seen.add(q.id);
  }

  const declared = new Set(pack.dimensions);
  const byDim = new Map<string, number>();
  const expertoByDim = new Map<string, number>();
  for (const q of pack.questions) {
    if (!declared.has(q.dimension)) {
      warnings.push({
        code: "dim-no-declarada",
        message: `dimensión '${q.dimension}' no está en pack.dimensions`,
        questionId: q.id,
      });
    }
    byDim.set(q.dimension, (byDim.get(q.dimension) ?? 0) + 1);
    if (q.difficulty === "experto")
      expertoByDim.set(q.dimension, (expertoByDim.get(q.dimension) ?? 0) + 1);
  }

  for (const dim of pack.dimensions) {
    const n = byDim.get(dim) ?? 0;
    if (n === 0) {
      warnings.push({ code: "dim-vacia", message: `dimensión '${dim}' sin preguntas` });
      continue;
    }
    if (n < minPerDimension)
      warnings.push({
        code: "dim-pocas",
        message: `dimensión '${dim}' tiene ${n} preguntas (< ${minPerDimension})`,
      });
    if (!expertoByDim.get(dim))
      warnings.push({
        code: "sin-experto",
        message: `dimensión '${dim}' sin preguntas 'experto' (staff no evaluable aquí)`,
      });
  }

  for (const q of pack.questions) {
    const optIds = q.options.map((o) => o.id);
    if (new Set(optIds).size !== optIds.length) {
      errors.push({ code: "opt-id-dup", message: "ids de opción duplicados", questionId: q.id });
    }
    const optTexts = q.options.map((o) => o.text.trim().toLowerCase());
    if (new Set(optTexts).size !== optTexts.length) {
      warnings.push({
        code: "opciones-repetidas",
        message: "opciones con texto duplicado",
        questionId: q.id,
      });
    }
    if (q.explanation.trim().length < MIN_EXPLANATION) {
      warnings.push({
        code: "explicacion-corta",
        message: "explanation demasiado corta",
        questionId: q.id,
      });
    }
    if (q.stem.trim().length < MIN_STEM) {
      warnings.push({ code: "stem-corto", message: "stem demasiado corto", questionId: q.id });
    }
    if (looksUncurated(q.stem, q.explanation, q.id, q.dimension)) {
      warnings.push({
        code: "sin-curar",
        message: "parece contenido de esqueleto o relleno (sin curar)",
        questionId: q.id,
      });
    }
  }

  const sesgo = positionBias(pack.questions);
  if (sesgo !== null) {
    warnings.push({
      code: "sesgo-posicion",
      message:
        `la respuesta correcta cae en la posición ${sesgo.position} en ${sesgo.count}/${sesgo.total} preguntas ` +
        `(${Math.round(sesgo.share * 100)}%): el banco es adivinable por posición. ` +
        `aptus baraja las opciones al presentarlas, así que la sesión no se ve afectada, ` +
        `pero conviene repartir las correctas si el pack se usa fuera de aquí`,
    });
  }

  return { errors, warnings };
}

export interface PositionBias {
  position: number; // 1-indexada, tal y como se lee en el YAML
  count: number;
  total: number;
  share: number;
}

/**
 * Detecta concentración de la respuesta correcta en una misma POSICIÓN del YAML.
 * Se mira la posición y no el `option.id` porque lo que se adivina es "la
 * primera", no "la que se llama a". Solo cuenta preguntas de correcta única: en
 * las de respuesta múltiple no hay una posición que sesgar.
 */
export function positionBias(questions: Pack["questions"]): PositionBias | null {
  const counts = new Map<number, number>();
  let total = 0;

  for (const q of questions) {
    if (Array.isArray(q.correct)) continue;
    const idx = q.options.findIndex((o) => o.id === q.correct);
    if (idx < 0) continue; // el schema ya lo bloquea; aquí solo se ignora
    total += 1;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }

  if (total < POSITION_BIAS_MIN_SAMPLE) return null;

  const [idx, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const share = count / total;
  return share >= POSITION_BIAS_THRESHOLD ? { position: idx + 1, count, total, share } : null;
}
