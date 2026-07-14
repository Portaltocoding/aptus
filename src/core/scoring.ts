import type { Question } from "../content/schema.js";

/**
 * Motor de scoring puro: sin I/O, sin reloj de sistema, sin generador
 * aleatorio, sin imports de `src/cli/`. Mismo input -> mismo output
 * siempre (ENG-01).
 *
 * El resultado desglosa SIEMPRE por dimensión (y subtema), nunca en un
 * campo único agregado a nivel global: el N (`presented`/`answered`)
 * acompaña siempre al `pct` (RES-01, ENG-02). La corrección es binaria,
 * sin crédito parcial.
 */

/** Nivel de confianza declarado por el usuario en una respuesta (Phase 3, SESS-03). */
export type Confidence = "baja" | "media" | "alta";

export interface AnsweredQuestion {
  questionId: string;
  selectedOptionId: string | null; // null = no respondida
  confidence?: Confidence | null; // confianza declarada; ausente/null si no se capturó
}

export interface SubtopicScore {
  subtopic: string;
  presented: number;
  answered: number;
  correct: number;
  pct: number; // correct / answered (0 si answered === 0, nunca NaN)
}

export interface DimensionScore {
  dimension: string;
  presented: number;
  answered: number;
  correct: number;
  pct: number; // correct / answered (0 si answered === 0, nunca NaN)
  bySubtopic: SubtopicScore[];
}

export interface ScoreResult {
  byDimension: DimensionScore[];
  // Deliberadamente NO hay ningún campo único a nivel de sesión que resuma
  // el desempeño global: solo el desglose por dimensión, siempre con su N.
}

interface Counts {
  presented: number;
  answered: number;
  correct: number;
}

function emptyCounts(): Counts {
  return { presented: 0, answered: 0, correct: 0 };
}

function pctOf(counts: Counts): number {
  return counts.answered > 0 ? counts.correct / counts.answered : 0;
}

interface DimensionAccumulator extends Counts {
  subtopics: Map<string, Counts>;
}

export function score(answered: AnsweredQuestion[], presentedBank: Question[]): ScoreResult {
  const byDim = new Map<string, DimensionAccumulator>();

  for (const q of presentedBank) {
    const dim = byDim.get(q.dimension) ?? { ...emptyCounts(), subtopics: new Map() };
    dim.presented += 1;

    const found = answered.find((a) => a.questionId === q.id);
    const wasAnswered = found !== undefined && found.selectedOptionId !== null;

    let wasCorrect = false;
    if (wasAnswered) {
      dim.answered += 1;
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (correctIds.includes(found!.selectedOptionId as string)) {
        dim.correct += 1; // binario — sin crédito parcial
        wasCorrect = true;
      }
    }

    if (q.subtopic !== undefined) {
      const sub = dim.subtopics.get(q.subtopic) ?? emptyCounts();
      sub.presented += 1;
      if (wasAnswered) {
        sub.answered += 1;
        if (wasCorrect) sub.correct += 1;
      }
      dim.subtopics.set(q.subtopic, sub);
    }

    byDim.set(q.dimension, dim);
  }

  const byDimension: DimensionScore[] = [...byDim.entries()].map(([dimension, d]) => ({
    dimension,
    presented: d.presented,
    answered: d.answered,
    correct: d.correct,
    pct: pctOf(d),
    bySubtopic: [...d.subtopics.entries()].map(([subtopic, s]) => ({
      subtopic,
      presented: s.presented,
      answered: s.answered,
      correct: s.correct,
      pct: pctOf(s),
    })),
  }));

  return { byDimension };
}
