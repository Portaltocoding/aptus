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

/**
 * Acierto que se le supone a quien responde al azar: 1 entre 4 opciones. Es el
 * punto al que se encoge un tramo del que casi no hay evidencia.
 */
export const BASE_RATE = 0.25;

/**
 * Cuántas respuestas "fantasma" al azar se le suman a cada tramo antes de
 * compararlo con el umbral de un nivel.
 *
 * Existe porque sin esto un tramo de UNA pregunta acertada valía 100% y abría
 * cualquier nivel: acertando tres preguntas —una fácil, una media y una difícil—
 * se salía "Senior-ready". Con una sesión completa eso era raro; desde que se
 * puede cortar el test en la pregunta 10, es lo normal.
 *
 * Se corrige encogiendo el acierto hacia el azar en proporción a lo poca que es
 * la muestra: `(aciertos + 0,25) / (respondidas + 1)`. Un 1/1 cuenta como 0,63 y
 * no llega a junior; un 10/10 cuenta como 0,93 y sí llega a senior. El porcentaje
 * que se ENSEÑA sigue siendo el crudo: esto solo decide niveles, y por qué no se
 * concede uno se explica en `blockers`.
 */
export const PHANTOM = 1;

/** Acierto encogido hacia el azar según la muestra. Es lo que se compara con los umbrales. */
export function adjustedAccuracy(correct: number, answered: number): number {
  return (correct + BASE_RATE * PHANTOM) / (answered + PHANTOM);
}

export interface TierAccuracy {
  difficulty: Difficulty;
  answered: number;
  correct: number;
  accuracy: number; // correct/answered (0 si answered===0, nunca NaN)
  adjusted: number; // acierto encogido por muestra: lo que se compara con el umbral
}

export interface DimensionAccuracy {
  dimension: string;
  answered: number;
  correct: number;
  accuracy: number; // correct/answered (0 si answered===0, nunca NaN)
}

/**
 * Por qué NO se ha concedido el siguiente nivel. Se distinguen dos motivos, que
 * piden cosas distintas de quien lee:
 *
 *   - `umbral`:  el acierto crudo ya está por debajo de lo que pide el nivel.
 *                Falta saber más. Se estudia.
 *   - `muestra`: el acierto crudo llega, pero hay tan pocas respuestas de ese
 *                tramo que afirmarlo sería inventárselo. Se responden más.
 *
 * Sin esta distinción las dos cosas salían por la misma etiqueta roja, y "Aún no
 * junior-ready" significaba lo mismo para quien falla todo que para quien acertó
 * las dos únicas preguntas fáciles que le tocaron.
 */
export interface Blocker {
  kind: "umbral" | "muestra" | "amplitud";
  difficulty: Difficulty | null; // null en `amplitud`
  answered: number;
  correct: number;
  accuracy: number; // acierto crudo
  adjusted: number; // acierto encogido por muestra
  required: number; // umbral del nivel
}

export interface RoleReadiness {
  roleId: string;
  label: string;
  levelId: string | null; // nivel alcanzado; null = por debajo del primer nivel
  levelLabel: string; // etiqueta legible del nivel (o "Aún no <primer nivel>")
  nextLevelId: string | null; // siguiente peldaño de la escalera (null si es el último)
  nextLevelLabel: string | null;
  blockers: Blocker[]; // qué frena ese siguiente peldaño (vacío si no hay siguiente)
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
    return {
      difficulty: d,
      answered,
      correct,
      accuracy: answered > 0 ? correct / answered : 0,
      adjusted: adjustedAccuracy(correct, answered),
    };
  });
}

/**
 * Qué le falta a UN nivel concreto. Lista vacía = el nivel se cumple.
 *
 * Un tramo con exigencia (requires > 0) necesita EVIDENCIA además de superar el
 * umbral: si el nivel exige ese tramo y no se vio ninguna pregunta de esa
 * dificultad, el nivel NO se concede (no hay "senior-ready" sin haber respondido
 * preguntas difíciles). Un tramo sin exigencia (requires === 0) no impone nada.
 *
 * La comparación se hace contra el acierto AJUSTADO, no el crudo: ver PHANTOM.
 *
 * Amplitud (staff): si el nivel declara `breadth`, además exige competencia en
 * las dimensiones SECUNDARIAS del rol — al menos una secundaria respondida y
 * todas las respondidas por encima del umbral de amplitud (no hay staff sin
 * demostrar anchura, no solo profundidad en el núcleo).
 */
function levelBlockers(
  level: ReadinessConfig["levels"][number],
  byDifficulty: TierAccuracy[],
  secondary: DimensionAccuracy[],
): Blocker[] {
  const byTier = new Map(byDifficulty.map((t) => [t.difficulty, t]));
  const blockers: Blocker[] = [];

  for (const d of DIFFICULTIES) {
    const required = level.requires[d];
    if (required <= 0) continue; // sin exigencia en este tramo
    const tier = byTier.get(d)!;
    if (tier.answered > 0 && tier.adjusted >= required) continue;
    blockers.push({
      // Si el acierto crudo ya llega, lo que falla es la muestra, no el nivel.
      kind: tier.answered > 0 && tier.accuracy >= required ? "muestra" : "umbral",
      difficulty: d,
      answered: tier.answered,
      correct: tier.correct,
      accuracy: tier.accuracy,
      adjusted: tier.adjusted,
      required,
    });
  }

  if (level.breadth !== undefined) {
    const vistas = secondary.filter((s) => s.answered > 0);
    const flojas = vistas.filter((s) => s.accuracy < level.breadth!);
    if (vistas.length === 0 || flojas.length > 0) {
      const peor = flojas[0];
      blockers.push({
        kind: "amplitud",
        difficulty: null,
        answered: peor?.answered ?? 0,
        correct: peor?.correct ?? 0,
        accuracy: peor?.accuracy ?? 0,
        adjusted: peor?.accuracy ?? 0,
        required: level.breadth,
      });
    }
  }

  return blockers;
}

/**
 * Recorre la escalera de niveles de abajo arriba y se PARA en el primero que no
 * se cumple. No se salta peldaños: alcanzar un nivel implica los de debajo.
 *
 * Antes se recorrían todos y se guardaba el último que cuadrase, así que una
 * config cuyos umbrales no fueran monótonos podía dar "Senior-ready" a quien no
 * llegaba a junior. Nadie quiere leer eso en un informe.
 */
function climb(
  byDifficulty: TierAccuracy[],
  secondary: DimensionAccuracy[],
  config: ReadinessConfig,
): { achieved: string | null; next: ReadinessConfig["levels"][number] | null; blockers: Blocker[] } {
  let achieved: string | null = null;
  for (const level of config.levels) {
    const blockers = levelBlockers(level, byDifficulty, secondary);
    if (blockers.length > 0) return { achieved, next: level, blockers };
    achieved = level.id;
  }
  return { achieved, next: null, blockers: [] };
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
    const { achieved: levelId, next, blockers } = climb(byDifficulty, secondary, config);
    const firstLevel = config.levels[0]!;
    const levelLabel = levelId
      ? config.levels.find((l) => l.id === levelId)!.label
      : `Aún no ${firstLevel.label.toLowerCase()}`;

    return {
      roleId: role.id,
      label: role.label,
      levelId,
      levelLabel,
      nextLevelId: next?.id ?? null,
      nextLevelLabel: next?.label ?? null,
      blockers,
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
