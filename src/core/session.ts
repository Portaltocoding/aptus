import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";

/**
 * Motor de sesión puro: selección equilibrada por dimensión (SESS-02) y
 * estado de sesión navegable (base de SESS-01). Sin I/O, sin generador
 * aleatorio propio: toda la aleatoriedad se inyecta vía `ShuffleFn` desde
 * fuera (ver `src/core/random.ts`, `makeSeededShuffle`) para que el motor
 * sea determinista y testeable con fixtures.
 */

export type ShuffleFn = <T>(items: T[]) => T[];

/**
 * Reparte preguntas por dimensión con un mínimo garantizado cuando el
 * pool lo permite. Si `pool.length < minPerDimension` para alguna
 * dimensión, NO lanza: toma todo lo disponible (responsabilidad del
 * loader/composición avisar de una muestra insuficiente, no de esta
 * función — se mantiene pura y simple).
 */
export function selectBalanced(
  bank: Question[],
  targetTotal: number,
  minPerDimension: number,
  shuffle: ShuffleFn,
): Question[] {
  const byDim = groupBy(bank, (q) => q.dimension);
  const dimensions = [...byDim.keys()];
  const perDim = Math.max(minPerDimension, Math.floor(targetTotal / dimensions.length));

  const selected: Question[] = [];
  for (const dim of dimensions) {
    const pool = shuffle(byDim.get(dim)!);
    const take = Math.min(perDim, pool.length); // nunca más de lo disponible
    selected.push(...pool.slice(0, take));
  }
  return shuffle(selected); // orden final también determinista si se inyecta el mismo shuffle
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/**
 * Estado de sesión navegable, lógica PURA (sin terminal): el runner
 * interactivo (plan siguiente) solo envuelve estas transiciones con
 * prompts de I/O.
 */
export interface SessionState {
  readonly questions: Question[];
  readonly index: number;
  readonly answers: ReadonlyMap<string, string>; // questionId -> selectedOptionId
}

export function buildSession(selected: Question[]): SessionState {
  return { questions: selected, index: 0, answers: new Map() };
}

/** Registra (o sobrescribe) la respuesta de la pregunta en el índice actual, sin avanzar. */
export function answerCurrent(state: SessionState, selectedOptionId: string): SessionState {
  const current = state.questions[state.index];
  if (!current) return state; // índice fuera de rango: no-op puro

  const answers = new Map(state.answers);
  answers.set(current.id, selectedOptionId);
  return { ...state, answers };
}

/** Avanza el índice, sin sobrepasar el final (índice === length marca la sesión completa). */
export function goForward(state: SessionState): SessionState {
  const index = Math.min(state.index + 1, state.questions.length);
  return { ...state, index };
}

/** Retrocede el índice; volver desde el índice 0 no rompe (se queda en 0). */
export function goBack(state: SessionState): SessionState {
  const index = Math.max(state.index - 1, 0);
  return { ...state, index };
}

export function isComplete(state: SessionState): boolean {
  return state.index >= state.questions.length;
}

/** Deriva AnsweredQuestion[] en el orden presentado; null para las no respondidas. */
export function toAnswered(state: SessionState): AnsweredQuestion[] {
  return state.questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: state.answers.get(q.id) ?? null,
  }));
}
