import { describe, expect, it } from "vitest";
import {
  selectBalanced,
  buildSession,
  answerCurrent,
  goForward,
  goBack,
  isComplete,
  toAnswered,
  shuffleOptions,
  filterQuestions,
} from "./session.js";
import { makeSeededShuffle } from "./random.js";
import type { Question } from "../content/schema.js";

/**
 * Fixtures a mano, genéricas (dimensión sin nombrar dominio real — ENG-04).
 */
function makeQuestion(id: string, dimension: string): Question {
  return {
    id,
    dimension,
    difficulty: "easy",
    type: "concepto",
    roles: [],
    stem: `Pregunta de prueba ${id}`,
    options: [
      { id: "a", text: "Opción A" },
      { id: "b", text: "Opción B" },
    ],
    correct: "a",
    explanation: "Explicación de prueba.",
    source: "fixture",
    date: "2026-01-01",
  };
}

function makeBank(dimension: string, count: number): Question[] {
  return Array.from({ length: count }, (_, i) =>
    makeQuestion(`${dimension}-${String(i + 1).padStart(3, "0")}`, dimension),
  );
}

function countByDimension(questions: Question[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of questions) {
    counts[q.dimension] = (counts[q.dimension] ?? 0) + 1;
  }
  return counts;
}

describe("selectBalanced", () => {
  it("misma seed -> exactamente la misma selección y el mismo orden (determinista)", () => {
    const bank = [...makeBank("dim-alpha", 10), ...makeBank("dim-beta", 10)];

    const result1 = selectBalanced(bank, 10, 4, makeSeededShuffle(42));
    const result2 = selectBalanced(bank, 10, 4, makeSeededShuffle(42));

    expect(result1).toEqual(result2);
    expect(result1.map((q) => q.id)).toEqual(result2.map((q) => q.id));
  });

  it("seeds distintas producen selecciones distintas (alta probabilidad)", () => {
    const bank = [...makeBank("dim-alpha", 10), ...makeBank("dim-beta", 10)];

    const resultA = selectBalanced(bank, 10, 4, makeSeededShuffle(1));
    const resultB = selectBalanced(bank, 10, 4, makeSeededShuffle(2));

    expect(resultA.map((q) => q.id)).not.toEqual(resultB.map((q) => q.id));
  });

  it("respeta el mínimo por dimensión cuando el pool lo permite", () => {
    const bank = [...makeBank("dim-alpha", 10), ...makeBank("dim-beta", 10)];

    const result = selectBalanced(bank, 10, 4, makeSeededShuffle(42));

    const perDim = countByDimension(result);
    expect(perDim["dim-alpha"]).toBeGreaterThanOrEqual(4);
    expect(perDim["dim-beta"]).toBeGreaterThanOrEqual(4);
  });

  it("con pool menor que minPerDimension NO lanza: toma el máximo disponible", () => {
    const bank = [...makeBank("dim-alpha", 2), ...makeBank("dim-beta", 10)];

    expect(() => selectBalanced(bank, 10, 8, makeSeededShuffle(42))).not.toThrow();

    const result = selectBalanced(bank, 10, 8, makeSeededShuffle(42));
    const perDim = countByDimension(result);
    expect(perDim["dim-alpha"]).toBe(2); // todo el pool disponible, sin lanzar
  });

  it("nunca selecciona más preguntas de las que hay disponibles en una dimensión", () => {
    const bank = [...makeBank("dim-alpha", 3), ...makeBank("dim-beta", 3)];

    const result = selectBalanced(bank, 20, 10, makeSeededShuffle(42));

    const perDim = countByDimension(result);
    expect(perDim["dim-alpha"]).toBe(3);
    expect(perDim["dim-beta"]).toBe(3);
  });

  it("es agnóstica del número de dimensiones (funciona con una sola dimensión)", () => {
    const bank = makeBank("dim-unica", 6);

    const result = selectBalanced(bank, 4, 2, makeSeededShuffle(42));

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((q) => q.dimension === "dim-unica")).toBe(true);
  });
});

describe("navegación de sesión (buildSession + transiciones)", () => {
  const selected = makeBank("dim-alpha", 3);

  it("buildSession arranca en el índice 0 sin respuestas", () => {
    const state = buildSession(selected);

    expect(state.index).toBe(0);
    expect(state.questions).toEqual(selected);
    expect(isComplete(state)).toBe(false);
  });

  it("answerCurrent registra la respuesta en el índice actual sin avanzar", () => {
    const state = buildSession(selected);
    const next = answerCurrent(state, "a");

    expect(next.index).toBe(0);
    expect(next.answers.get(selected[0]!.id)).toBe("a");
  });

  it("goForward avanza el índice; goBack retrocede", () => {
    let state = buildSession(selected);
    state = answerCurrent(state, "a");
    state = goForward(state);

    expect(state.index).toBe(1);

    state = goBack(state);
    expect(state.index).toBe(0);
  });

  it("volver desde el índice 0 no rompe (se queda en 0)", () => {
    const state = buildSession(selected);
    const back = goBack(state);

    expect(back.index).toBe(0);
  });

  it("permite cambiar una respuesta ya dada (sobrescribe, no acumula)", () => {
    let state = buildSession(selected);
    state = answerCurrent(state, "a");
    state = answerCurrent(state, "b");

    expect(state.answers.get(selected[0]!.id)).toBe("b");
    expect(state.answers.size).toBe(1);
  });

  it("avanzar más allá de la última pregunta marca la sesión como completa", () => {
    let state = buildSession(selected);
    for (let i = 0; i < selected.length; i++) {
      state = answerCurrent(state, "a");
      state = goForward(state);
    }

    expect(isComplete(state)).toBe(true);
  });

  it("toAnswered deriva AnsweredQuestion[] con null para las no respondidas", () => {
    let state = buildSession(selected);
    state = answerCurrent(state, "a"); // solo responde la primera
    state = goForward(state);
    state = goForward(state); // deja la segunda sin responder, salta a la tercera
    state = answerCurrent(state, "b");

    const answered = toAnswered(state);

    expect(answered).toHaveLength(3);
    expect(answered[0]).toEqual({
      questionId: selected[0]!.id,
      selectedOptionId: "a",
      confidence: null,
    });
    expect(answered[1]).toEqual({
      questionId: selected[1]!.id,
      selectedOptionId: null,
      confidence: null,
    });
    expect(answered[2]).toEqual({
      questionId: selected[2]!.id,
      selectedOptionId: "b",
      confidence: null,
    });
  });
});

/** Pregunta de 4 opciones con la correcta SIEMPRE la primera: el sesgo real del banco. */
function makeBiased(id: string, dimension: string, difficulty: Question["difficulty"]): Question {
  return {
    ...makeQuestion(id, dimension),
    difficulty,
    options: [
      { id: "a", text: "La correcta" },
      { id: "b", text: "Distractor 1" },
      { id: "c", text: "Distractor 2" },
      { id: "d", text: "Distractor 3" },
    ],
    correct: "a",
  };
}

describe("shuffleOptions", () => {
  it("no toca los ids ni la respuesta correcta: solo el orden de presentación", () => {
    const bank = [makeBiased("q-1", "dim", "easy")];
    const [shuffled] = shuffleOptions(bank, makeSeededShuffle(7));

    expect(shuffled!.correct).toBe("a");
    expect(shuffled!.options.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
    // El texto sigue pegado a su id: reordenar no puede desparejar opción y contenido.
    expect(shuffled!.options.find((o) => o.id === "a")!.text).toBe("La correcta");
  });

  it("rompe el sesgo de posición: la correcta deja de caer siempre la primera", () => {
    const bank = Array.from({ length: 200 }, (_, i) => makeBiased(`q-${i}`, "dim", "easy"));

    const primeras = shuffleOptions(bank, makeSeededShuffle(99)).filter((q) => q.options[0]!.id === q.correct).length;

    // Con 4 opciones lo esperable es ~25%. Antes de barajar era el 100%.
    expect(primeras).toBeGreaterThan(20);
    expect(primeras).toBeLessThan(80);
  });

  it("misma seed -> mismo orden de opciones (determinista)", () => {
    const bank = Array.from({ length: 20 }, (_, i) => makeBiased(`q-${i}`, "dim", "easy"));

    const a = shuffleOptions(bank, makeSeededShuffle(3));
    const b = shuffleOptions(bank, makeSeededShuffle(3));

    expect(a.map((q) => q.options.map((o) => o.id))).toEqual(b.map((q) => q.options.map((o) => o.id)));
  });

  it("no muta el banco original", () => {
    const bank = [makeBiased("q-1", "dim", "easy")];
    const antes = bank[0]!.options.map((o) => o.id);

    shuffleOptions(bank, makeSeededShuffle(1));

    expect(bank[0]!.options.map((o) => o.id)).toEqual(antes);
  });
});

describe("filterQuestions", () => {
  const bank = [
    makeBiased("a-1", "alpha", "easy"),
    makeBiased("a-2", "alpha", "experto"),
    makeBiased("b-1", "beta", "easy"),
    makeBiased("b-2", "beta", "hard"),
  ];

  it("un filtro vacío no filtra nada", () => {
    expect(filterQuestions(bank, {})).toHaveLength(4);
    expect(filterQuestions(bank, { dimensions: [], difficulties: [] })).toHaveLength(4);
    expect(filterQuestions(bank, { dimensions: null, difficulties: null })).toHaveLength(4);
  });

  it("acota por dimensión", () => {
    expect(filterQuestions(bank, { dimensions: ["alpha"] }).map((q) => q.id)).toEqual(["a-1", "a-2"]);
  });

  it("acota por tramo de dificultad", () => {
    expect(filterQuestions(bank, { difficulties: ["easy"] }).map((q) => q.id)).toEqual(["a-1", "b-1"]);
  });

  it("cruza ambos filtros", () => {
    expect(filterQuestions(bank, { dimensions: ["beta"], difficulties: ["hard", "experto"] }).map((q) => q.id)).toEqual([
      "b-2",
    ]);
  });

  it("un cruce sin material devuelve vacío, no lanza", () => {
    expect(filterQuestions(bank, { dimensions: ["alpha"], difficulties: ["hard"] })).toEqual([]);
  });
});
