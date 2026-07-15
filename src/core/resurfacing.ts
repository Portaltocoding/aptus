import type { Question } from "../content/schema.js";
import type { SessionRecord } from "./evolution.js";

/**
 * Motor de resurfacing tipo repetición espaciada (RES-05), puro y sin I/O ni
 * reloj: el `now` se inyecta desde la capa de I/O, como el timestamp de
 * `buildSessionRecord`.
 *
 * Algoritmo: Leitner clásico. Cada pregunta vista vive en una caja; acertarla la
 * sube una caja (se repasa más tarde), fallarla la devuelve a la caja 1 (vuelve
 * pronto). Se eligió Leitner y no SM-2 a propósito: SM-2 pondera "calidad del
 * recuerdo" en una escala de 0-5 que aquí habría que inventarse a partir de un
 * acierto binario, y este proyecto no fabrica números que no puede sostener.
 * Leitner necesita justo lo que sí hay: acierto/fallo y cuándo fue.
 *
 * Esto SOLO se puede calcular porque el historial guarda las respuestas crudas
 * (`SessionRecord.answers`): con los agregados por dimensión sabías que fallaste
 * el 40% de LLM, pero no QUÉ preguntas.
 *
 * OJO al sesgo (lo más importante de este módulo): una sesión de repaso está
 * deliberadamente cargada de tus fallos, así que su resultado NO es comparable
 * con el de una sesión de medición equilibrada. Por eso se marca `kind: "review"`
 * y la evolución y el readiness la ignoran. Mezclarlas fabricaría una regresión
 * falsa cada vez que estudias.
 */

/** Días hasta el siguiente repaso según la caja. Progresión Leitner convencional. */
export const BOX_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
export const MAX_BOX = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewItem {
  questionId: string;
  dimension: string;
  seen: number; // veces respondida
  failed: number; // veces fallada
  box: number; // caja Leitner: 1 = recién fallada, MAX_BOX = consolidada
  lastSeenAt: string; // ISO de la última sesión donde salió
  lastCorrect: boolean;
  dueAt: string; // ISO: cuándo toca repasarla
}

function isCorrect(q: Question, selectedOptionId: string): boolean {
  const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
  return correctIds.includes(selectedOptionId);
}

/**
 * Reconstruye el estado de repaso a partir del historial completo, en orden
 * cronológico. Solo entran preguntas REALMENTE respondidas (las saltadas no dicen
 * nada) y que sigan en el banco (el banco evoluciona; lo que ya no existe no se
 * repasa).
 *
 * Las sesiones de repaso SÍ cuentan aquí — son justo el evento que mueve las
 * cajas. Lo que no deben contaminar es la medición, no su propio algoritmo.
 */
export function buildReviewState(history: SessionRecord[], bank: Question[]): ReviewItem[] {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const items = new Map<string, ReviewItem>();

  const chronological = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const session of chronological) {
    for (const answer of session.answers ?? []) {
      if (answer.selectedOptionId === null) continue; // sin responder: no es evidencia
      const q = byId.get(answer.questionId);
      if (q === undefined) continue; // ya no está en el banco

      const ok = isCorrect(q, answer.selectedOptionId);
      const prev = items.get(answer.questionId);
      const box = prev === undefined ? (ok ? 2 : 1) : ok ? Math.min(prev.box + 1, MAX_BOX) : 1;

      items.set(answer.questionId, {
        questionId: answer.questionId,
        dimension: q.dimension,
        seen: (prev?.seen ?? 0) + 1,
        failed: (prev?.failed ?? 0) + (ok ? 0 : 1),
        box,
        lastSeenAt: session.timestamp,
        lastCorrect: ok,
        dueAt: new Date(new Date(session.timestamp).getTime() + BOX_INTERVAL_DAYS[box]! * DAY_MS).toISOString(),
      });
    }
  }

  return [...items.values()];
}

/** Lo que toca repasar ya: vencidas primero las más atrasadas y las de caja más baja. */
export function dueForReview(items: ReviewItem[], now: Date): ReviewItem[] {
  const due = items.filter((i) => new Date(i.dueAt).getTime() <= now.getTime());

  // Caja baja primero (lo que peor te sabes), y a igualdad, lo más atrasado.
  due.sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt) || a.questionId.localeCompare(b.questionId));
  return due;
}

/**
 * Las preguntas de la tanda de repaso, en el orden en que se han de presentar.
 * NO se equilibra por dimensión a propósito: el repaso debe cargar hacia los temas
 * peor puntuados (RES-05), justo lo contrario que `selectBalanced`, que muestrea
 * parejo porque de él depende la medición del readiness.
 */
export function selectReview(due: ReviewItem[], bank: Question[], target: number): Question[] {
  const byId = new Map(bank.map((q) => [q.id, q]));
  return due
    .slice(0, target)
    .map((i) => byId.get(i.questionId))
    .filter((q): q is Question => q !== undefined);
}

/** Cuándo vuelve a tocar algo, si ahora mismo no hay nada vencido. */
export function nextDueAt(items: ReviewItem[]): string | null {
  if (items.length === 0) return null;
  return items.reduce((min, i) => (i.dueAt < min ? i.dueAt : min), items[0]!.dueAt);
}

export interface ReviewProgress {
  dimension: string;
  due: number;
  weak: number; // en caja 1: falladas la última vez
}

/** Cuánto repaso pendiente hay por dimensión, para enseñar hacia dónde carga la tanda. */
export function reviewByDimension(due: ReviewItem[]): ReviewProgress[] {
  const map = new Map<string, ReviewProgress>();
  for (const i of due) {
    const p = map.get(i.dimension) ?? { dimension: i.dimension, due: 0, weak: 0 };
    p.due += 1;
    if (i.box === 1) p.weak += 1;
    map.set(i.dimension, p);
  }
  return [...map.values()].sort((a, b) => b.weak - a.weak || b.due - a.due || a.dimension.localeCompare(b.dimension));
}
