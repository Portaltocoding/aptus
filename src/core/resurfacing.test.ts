import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { SessionRecord } from "./evolution.js";
import { evolution, measurements } from "./evolution.js";
import {
  BOX_INTERVAL_DAYS,
  MAX_BOX,
  buildReviewState,
  dueForReview,
  nextDueAt,
  reviewByDimension,
  selectReview,
} from "./resurfacing.js";

function q(id: string, dimension = "dim-a"): Question {
  return {
    id,
    dimension,
    difficulty: "medium",
    type: "concepto",
    roles: [],
    stem: `Enunciado ${id}`,
    options: [
      { id: "a", text: "correcta" },
      { id: "b", text: "incorrecta" },
    ],
    correct: "a",
    explanation: "explicación suficientemente larga",
    source: "externa",
    date: "2026-01-01",
  };
}

const BANK = [q("q1"), q("q2"), q("q3", "dim-b")];

/** Sesión mínima: solo timestamp + respuestas es lo que usa el repaso. */
function session(timestamp: string, answers: [string, string | null][], kind?: "review"): SessionRecord {
  return {
    timestamp,
    byDimension: [],
    readiness: [],
    answers: answers.map(([questionId, selectedOptionId]) => ({ questionId, selectedOptionId })),
    ...(kind ? { kind } : {}),
  };
}

const T1 = "2026-01-01T10:00:00.000Z";
const T2 = "2026-01-05T10:00:00.000Z";

function itemFor(items: ReturnType<typeof buildReviewState>, id: string) {
  return items.find((i) => i.questionId === id)!;
}

describe("buildReviewState (Leitner puro)", () => {
  it("una fallada entra en la caja 1 y vuelve pronto", () => {
    const items = buildReviewState([session(T1, [["q1", "b"]])], BANK);
    const q1 = itemFor(items, "q1");

    expect(q1.box).toBe(1);
    expect(q1.failed).toBe(1);
    expect(q1.dueAt).toBe(new Date(new Date(T1).getTime() + BOX_INTERVAL_DAYS[1]! * 86400000).toISOString());
  });

  it("una acertada a la primera arranca en la caja 2 (no hace falta repasarla mañana)", () => {
    const items = buildReviewState([session(T1, [["q1", "a"]])], BANK);

    expect(itemFor(items, "q1").box).toBe(2);
    expect(itemFor(items, "q1").failed).toBe(0);
  });

  it("acertar sube de caja y espacia el siguiente repaso", () => {
    const items = buildReviewState([session(T1, [["q1", "a"]]), session(T2, [["q1", "a"]])], BANK);
    const q1 = itemFor(items, "q1");

    expect(q1.box).toBe(3);
    expect(q1.seen).toBe(2);
    expect(q1.dueAt).toBe(new Date(new Date(T2).getTime() + BOX_INTERVAL_DAYS[3]! * 86400000).toISOString());
  });

  it("fallar devuelve a la caja 1 por muy consolidada que estuviera", () => {
    const history = [
      session("2026-01-01T10:00:00.000Z", [["q1", "a"]]),
      session("2026-01-02T10:00:00.000Z", [["q1", "a"]]),
      session("2026-01-03T10:00:00.000Z", [["q1", "a"]]),
      session("2026-01-04T10:00:00.000Z", [["q1", "b"]]), // fallo
    ];
    const q1 = itemFor(buildReviewState(history, BANK), "q1");

    expect(q1.box).toBe(1);
    expect(q1.seen).toBe(4);
    expect(q1.failed).toBe(1);
    expect(q1.lastCorrect).toBe(false);
  });

  it("la caja no pasa del máximo por mucho que aciertes", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      session(`2026-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`, [["q1", "a"]]),
    );

    expect(itemFor(buildReviewState(history, BANK), "q1").box).toBe(MAX_BOX);
  });

  it("una pregunta saltada no es evidencia: no entra en el repaso", () => {
    const items = buildReviewState([session(T1, [["q1", null]])], BANK);

    expect(items).toEqual([]);
  });

  it("lo que ya no está en el banco no se repasa", () => {
    const items = buildReviewState([session(T1, [["fantasma", "b"]])], BANK);

    expect(items).toEqual([]);
  });

  it("procesa el historial en orden cronológico aunque llegue desordenado", () => {
    const desordenado = [session(T2, [["q1", "b"]]), session(T1, [["q1", "a"]])];
    const q1 = itemFor(buildReviewState(desordenado, BANK), "q1");

    expect(q1.box).toBe(1); // el fallo de T2 es el ÚLTIMO evento, manda él
    expect(q1.lastSeenAt).toBe(T2);
  });

  it("las sesiones de repaso SÍ mueven las cajas (son el evento del algoritmo)", () => {
    const history = [session(T1, [["q1", "b"]]), session(T2, [["q1", "a"]], "review")];

    expect(itemFor(buildReviewState(history, BANK), "q1").box).toBe(2);
  });
});

describe("dueForReview", () => {
  const history = [session(T1, [["q1", "b"], ["q2", "a"]])]; // q1 caja 1 (1 día), q2 caja 2 (3 días)

  it("no devuelve nada antes de que venza", () => {
    const items = buildReviewState(history, BANK);
    const due = dueForReview(items, new Date("2026-01-01T12:00:00.000Z")); // 2h después

    expect(due).toEqual([]);
  });

  it("devuelve solo lo vencido", () => {
    const items = buildReviewState(history, BANK);
    const due = dueForReview(items, new Date("2026-01-02T11:00:00.000Z")); // +1 día

    expect(due.map((i) => i.questionId)).toEqual(["q1"]); // q2 aún no toca (3 días)
  });

  it("antepone lo que peor llevas (caja más baja primero)", () => {
    const items = buildReviewState(history, BANK);
    const due = dueForReview(items, new Date("2026-01-10T10:00:00.000Z")); // todo vencido

    expect(due.map((i) => i.questionId)).toEqual(["q1", "q2"]);
    expect(due[0]!.box).toBeLessThan(due[1]!.box);
  });
});

describe("selectReview", () => {
  it("acota la tanda al objetivo, respetando la prioridad", () => {
    const history = [session(T1, [["q1", "b"], ["q2", "b"], ["q3", "b"]])];
    const due = dueForReview(buildReviewState(history, BANK), new Date("2026-01-10T10:00:00.000Z"));

    expect(selectReview(due, BANK, 2)).toHaveLength(2);
  });

  it("NO equilibra por dimensión: el repaso carga hacia lo peor, al revés que la medición", () => {
    // dim-a fallada dos veces, dim-b acertada: la tanda debe ir a dim-a.
    const history = [session(T1, [["q1", "b"], ["q2", "b"], ["q3", "a"]])];
    const due = dueForReview(buildReviewState(history, BANK), new Date("2026-01-10T10:00:00.000Z"));
    const selected = selectReview(due, BANK, 2);

    expect(selected.every((s) => s.dimension === "dim-a")).toBe(true);
  });
});

describe("nextDueAt / reviewByDimension", () => {
  it("da la fecha más próxima de todo lo que hay en seguimiento", () => {
    const items = buildReviewState([session(T1, [["q1", "b"], ["q2", "a"]])], BANK);

    expect(nextDueAt(items)).toBe(new Date(new Date(T1).getTime() + 1 * 86400000).toISOString()); // la de caja 1
  });

  it("sin nada en seguimiento no hay próxima fecha (null, no una inventada)", () => {
    expect(nextDueAt([])).toBeNull();
  });

  it("agrupa el repaso pendiente por dimensión, peor primero", () => {
    const history = [session(T1, [["q1", "b"], ["q2", "b"], ["q3", "b"]])];
    const due = dueForReview(buildReviewState(history, BANK), new Date("2026-01-10T10:00:00.000Z"));
    const byDim = reviewByDimension(due);

    expect(byDim[0]!.dimension).toBe("dim-a"); // 2 falladas
    expect(byDim[0]!.weak).toBe(2);
    expect(byDim[1]!.weak).toBe(1);
  });
});

describe("aislamiento medición vs repaso (lo que impide una regresión falsa)", () => {
  const medicion: SessionRecord = {
    timestamp: T1,
    byDimension: [{ dimension: "dim-a", answered: 10, correct: 8, pct: 0.8 }],
    readiness: [],
  };
  // Repaso: cargado de fallos a propósito, sale un 20%. No es una regresión.
  const repaso: SessionRecord = {
    timestamp: T2,
    byDimension: [{ dimension: "dim-a", answered: 10, correct: 2, pct: 0.2 }],
    readiness: [],
    kind: "review",
  };

  it("measurements() deja fuera los repasos y conserva los registros sin kind", () => {
    expect(measurements([medicion, repaso])).toEqual([medicion]);
  });

  it("la evolución IGNORA el repaso: estudiar no puede parecer un retroceso", () => {
    const report = evolution([medicion, repaso]);

    expect(report.sessionCount).toBe(1); // solo la medición
    expect(report.currentTimestamp).toBe(T1);
    expect(report.byDimension[0]!.current).toBe(0.8); // el 20% del repaso no asoma
  });

  it("sin el filtro, el repaso habría fingido un desplome de 60 puntos", () => {
    // Testigo del bug que el filtro evita: así se vería si se comparasen sin más.
    const report = evolution([medicion, { ...repaso, kind: "measure" }]);

    expect(report.byDimension[0]!.delta).toBeCloseTo(-0.6);
  });
});
