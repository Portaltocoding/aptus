import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { ReadinessConfig } from "../content/readiness.js";

/**
 * Motor de readiness puro (sin I/O): mapea el desempeño a readiness POR ROL y
 * nivel (junior/mid/senior), anclando los umbrales a la DIFICULTAD etiquetada de
 * las preguntas (ENG-03) y los perfiles de rol a la config externa (CONT-05).
 *
 * NUNCA produce un score único agregado de "empleabilidad" (RES-02): devuelve el
 * readiness por rol con la evidencia por dificultad (y su N) a la vista, y una
 * lista de gaps priorizados con su plan de estudio (RES-03).
 */

export type Difficulty = "easy" | "medium" | "hard" | "experto";
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "experto"];

/** Por debajo de este acierto, una dimensión respondida se considera un gap. */
export const GAP_THRESHOLD = 0.7;

export interface TierAccuracy {
  difficulty: Difficulty;
  answered: number;
  correct: number;
  accuracy: number; // correct/answered (0 si answered===0, nunca NaN)
}

export interface DimensionAccuracy {
  dimension: string;
  answered: number;
  correct: number;
  accuracy: number; // correct/answered (0 si answered===0, nunca NaN)
}

export interface RoleReadiness {
  roleId: string;
  label: string;
  levelId: string | null; // nivel alcanzado; null = por debajo del primer nivel
  levelLabel: string; // etiqueta legible del nivel (o "Aún no <primer nivel>")
  byDifficulty: TierAccuracy[]; // evidencia por dificultad (base del nivel, ENG-03)
  byDimension: DimensionAccuracy[]; // acierto por dimensión núcleo (matriz rol × dimensión)
  secondary: DimensionAccuracy[]; // acierto en dimensiones secundarias (amplitud, para staff)
  answered: number; // total respondidas de las dimensiones núcleo
}

export interface Gap {
  dimension: string;
  answered: number;
  correct: number;
  accuracy: number;
  study: string;
}

interface QResult {
  answered: boolean;
  correct: boolean;
  difficulty: Difficulty;
  dimension: string;
}

function toResults(answered: AnsweredQuestion[], bank: Question[]): QResult[] {
  return bank.map((q) => {
    const found = answered.find((a) => a.questionId === q.id);
    const wasAnswered = found !== undefined && found.selectedOptionId !== null;
    let ok = false;
    if (wasAnswered) {
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      ok = correctIds.includes(found!.selectedOptionId as string);
    }
    return {
      answered: wasAnswered,
      correct: ok,
      difficulty: q.difficulty as Difficulty,
      dimension: q.dimension,
    };
  });
}

function tierBreakdown(results: QResult[]): TierAccuracy[] {
  return DIFFICULTIES.map((d) => {
    const tier = results.filter((r) => r.difficulty === d);
    const answered = tier.length;
    const correct = tier.filter((r) => r.correct).length;
    return { difficulty: d, answered, correct, accuracy: answered > 0 ? correct / answered : 0 };
  });
}

/**
 * Nivel más alto cuyos umbrales por tramo de dificultad se cumplen. Para no
 * sobre-afirmar: un tramo con exigencia (requires > 0) necesita EVIDENCIA
 * (answered > 0) además de superar el umbral; si el nivel exige ese tramo y no se
 * vio ninguna pregunta de esa dificultad, el nivel NO se concede (p. ej. no hay
 * "senior-ready" sin haber respondido preguntas difíciles). Un tramo sin
 * exigencia (requires === 0) no impone nada.
 *
 * Amplitud (staff): si el nivel declara `breadth`, además exige competencia en
 * las dimensiones SECUNDARIAS del rol — al menos una secundaria respondida y
 * todas las respondidas por encima del umbral de amplitud (no hay staff sin
 * demostrar anchura, no solo profundidad en el núcleo). Se recorre de menor a
 * mayor nivel y se queda con el más alto que se cumple.
 */
function highestLevel(
  byDifficulty: TierAccuracy[],
  secondary: DimensionAccuracy[],
  config: ReadinessConfig,
): string | null {
  const byTier = new Map(byDifficulty.map((t) => [t.difficulty, t]));
  const secondaryAnswered = secondary.filter((s) => s.answered > 0);
  let achieved: string | null = null;
  for (const level of config.levels) {
    const meetsDifficulty = DIFFICULTIES.every((d) => {
      const req = level.requires[d];
      if (req <= 0) return true; // sin exigencia en este tramo
      const tier = byTier.get(d)!;
      return tier.answered > 0 && tier.accuracy >= req; // exige evidencia y umbral
    });
    const meetsBreadth =
      level.breadth === undefined ||
      (secondaryAnswered.length > 0 && secondaryAnswered.every((s) => s.accuracy >= level.breadth!));
    if (meetsDifficulty && meetsBreadth) achieved = level.id;
  }
  return achieved;
}

export function computeReadiness(
  answered: AnsweredQuestion[],
  bank: Question[],
  config: ReadinessConfig,
): RoleReadiness[] {
  const results = toResults(answered, bank);

  const accuracyForDims = (dims: string[]): DimensionAccuracy[] =>
    dims.map((dimension) => {
      const dq = results.filter((r) => r.answered && r.dimension === dimension);
      const answeredDim = dq.length;
      const correct = dq.filter((r) => r.correct).length;
      return { dimension, answered: answeredDim, correct, accuracy: answeredDim > 0 ? correct / answeredDim : 0 };
    });

  return config.roles.map((role) => {
    const core = results.filter((r) => r.answered && role.core.includes(r.dimension));
    const byDifficulty = tierBreakdown(core);
    const byDimension = accuracyForDims(role.core);
    const secondary = accuracyForDims(role.secondary);
    const levelId = highestLevel(byDifficulty, secondary, config);
    const firstLevel = config.levels[0]!;
    const levelLabel = levelId
      ? config.levels.find((l) => l.id === levelId)!.label
      : `Aún no ${firstLevel.label.toLowerCase()}`;

    return {
      roleId: role.id,
      label: role.label,
      levelId,
      levelLabel,
      byDifficulty,
      byDimension,
      secondary,
      answered: core.length,
    };
  });
}

/**
 * Gaps priorizados (RES-03): dimensiones respondidas por debajo del umbral, de
 * más débil a menos, cada una con su recurso de estudio de la config.
 */
export function computeGaps(
  answered: AnsweredQuestion[],
  bank: Question[],
  config: ReadinessConfig,
  threshold: number = GAP_THRESHOLD,
): Gap[] {
  const results = toResults(answered, bank).filter((r) => r.answered);

  const byDim = new Map<string, { answered: number; correct: number }>();
  for (const r of results) {
    const g = byDim.get(r.dimension) ?? { answered: 0, correct: 0 };
    g.answered += 1;
    if (r.correct) g.correct += 1;
    byDim.set(r.dimension, g);
  }

  const gaps: Gap[] = [];
  for (const [dimension, g] of byDim) {
    const accuracy = g.answered > 0 ? g.correct / g.answered : 0;
    if (accuracy < threshold) {
      gaps.push({
        dimension,
        answered: g.answered,
        correct: g.correct,
        accuracy,
        study: config.study[dimension] ?? "Sin recurso de estudio definido para esta dimensión.",
      });
    }
  }

  gaps.sort((a, b) => a.accuracy - b.accuracy); // más débil primero
  return gaps;
}
