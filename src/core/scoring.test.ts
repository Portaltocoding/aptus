import { describe, expect, it } from "vitest";
import { score, type AnsweredQuestion } from "./scoring.js";
import type { Question } from "../content/schema.js";

/**
 * Fixtures a mano, genéricas (dimensión/subtema sin nombrar dominio real —
 * ENG-04): el motor de scoring no debe conocer vocabulario de ningún pack.
 */
function makeQuestion(overrides: Partial<Question> & Pick<Question, "id" | "dimension">): Question {
  return {
    id: overrides.id,
    dimension: overrides.dimension,
    subtopic: overrides.subtopic,
    difficulty: overrides.difficulty ?? "easy",
    roles: overrides.roles ?? [],
    stem: overrides.stem ?? `Pregunta de prueba ${overrides.id}`,
    options: overrides.options ?? [
      { id: "a", text: "Opción A" },
      { id: "b", text: "Opción B" },
    ],
    correct: overrides.correct ?? "a",
    explanation: overrides.explanation ?? "Explicación de prueba.",
    source: overrides.source ?? "fixture",
    date: overrides.date ?? "2026-01-01",
  };
}

function answer(questionId: string, selectedOptionId: string | null): AnsweredQuestion {
  return { questionId, selectedOptionId };
}

describe("score", () => {
  it("todas las preguntas de una dimensión respondidas correctamente -> pct === 1", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-alpha", correct: "a" }),
    ];
    const answered = [answer("q1", "a"), answer("q2", "a")];

    const result = score(answered, bank);

    expect(result.byDimension).toHaveLength(1);
    const dim = result.byDimension[0]!;
    expect(dim.dimension).toBe("dim-alpha");
    expect(dim.presented).toBe(2);
    expect(dim.answered).toBe(2);
    expect(dim.correct).toBe(2);
    expect(dim.pct).toBe(1);
  });

  it("dimensión con preguntas no respondidas -> answered < presented y pct se calcula sobre answered", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q3", dimension: "dim-alpha", correct: "a" }),
    ];
    // q1: respondida y correcta. q2: presente en `answered` pero con selectedOptionId null
    // (dejada en blanco). q3: ni siquiera aparece en `answered` (no visitada).
    const answered = [answer("q1", "a"), answer("q2", null)];

    const result = score(answered, bank);

    const dim = result.byDimension[0]!;
    expect(dim.presented).toBe(3);
    expect(dim.answered).toBe(1);
    expect(dim.correct).toBe(1);
    expect(dim.pct).toBe(1); // 1/1, no 1/3
  });

  it("dimensión con 0 respondidas -> answered === 0 y pct === 0 (nunca NaN)", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha" }),
      makeQuestion({ id: "q2", dimension: "dim-alpha" }),
    ];

    const result = score([], bank);

    const dim = result.byDimension[0]!;
    expect(dim.presented).toBe(2);
    expect(dim.answered).toBe(0);
    expect(dim.correct).toBe(0);
    expect(dim.pct).toBe(0);
    expect(Number.isNaN(dim.pct)).toBe(false);
  });

  it("respuesta incorrecta suma a answered pero no a correct (binario, sin crédito parcial)", () => {
    const bank = [makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" })];
    const answered = [answer("q1", "b")];

    const result = score(answered, bank);

    const dim = result.byDimension[0]!;
    expect(dim.presented).toBe(1);
    expect(dim.answered).toBe(1);
    expect(dim.correct).toBe(0);
    expect(dim.pct).toBe(0);
  });

  it("el desglose por subtema es coherente con el desglose por dimensión", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", subtopic: "sub-1", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-alpha", subtopic: "sub-1", correct: "a" }),
      makeQuestion({ id: "q3", dimension: "dim-alpha", subtopic: "sub-2", correct: "a" }),
    ];
    const answered = [answer("q1", "a"), answer("q2", "b"), answer("q3", "a")];

    const result = score(answered, bank);

    const dim = result.byDimension[0]!;
    expect(dim.presented).toBe(3);
    expect(dim.answered).toBe(3);
    expect(dim.correct).toBe(2);

    const sub1 = dim.bySubtopic.find((s) => s.subtopic === "sub-1")!;
    expect(sub1.presented).toBe(2);
    expect(sub1.answered).toBe(2);
    expect(sub1.correct).toBe(1);
    expect(sub1.pct).toBe(0.5);

    const sub2 = dim.bySubtopic.find((s) => s.subtopic === "sub-2")!;
    expect(sub2.presented).toBe(1);
    expect(sub2.answered).toBe(1);
    expect(sub2.correct).toBe(1);
    expect(sub2.pct).toBe(1);

    // Coherencia: la suma de presented/answered/correct por subtema iguala el total de la dimensión
    const sumPresented = dim.bySubtopic.reduce((acc, s) => acc + s.presented, 0);
    const sumAnswered = dim.bySubtopic.reduce((acc, s) => acc + s.answered, 0);
    const sumCorrect = dim.bySubtopic.reduce((acc, s) => acc + s.correct, 0);
    expect(sumPresented).toBe(dim.presented);
    expect(sumAnswered).toBe(dim.answered);
    expect(sumCorrect).toBe(dim.correct);
  });

  it("una pregunta con correct como array (multi-respuesta futura) acierta solo si la opción elegida está incluida", () => {
    const bank = [
      makeQuestion({
        id: "q1",
        dimension: "dim-alpha",
        correct: ["a", "b"],
        options: [
          { id: "a", text: "Opción A" },
          { id: "b", text: "Opción B" },
          { id: "c", text: "Opción C" },
        ],
      }),
      makeQuestion({
        id: "q2",
        dimension: "dim-alpha",
        correct: ["a", "b"],
        options: [
          { id: "a", text: "Opción A" },
          { id: "b", text: "Opción B" },
          { id: "c", text: "Opción C" },
        ],
      }),
    ];
    const answered = [answer("q1", "b"), answer("q2", "c")];

    const result = score(answered, bank);

    const dim = result.byDimension[0]!;
    expect(dim.answered).toBe(2);
    expect(dim.correct).toBe(1); // solo q1 (b ∈ [a,b]); q2 (c) no está en el array
  });

  it("ScoreResult no expone ningún campo agregado global", () => {
    const bank = [makeQuestion({ id: "q1", dimension: "dim-alpha" })];
    const result = score([answer("q1", "a")], bank);

    expect(Object.keys(result)).toEqual(["byDimension"]);
    for (const dim of result.byDimension) {
      const keys = Object.keys(dim).sort();
      expect(keys).toEqual(["answered", "bySubtopic", "correct", "dimension", "pct", "presented"]);
    }
  });

  it("múltiples dimensiones se desglosan de forma independiente", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-beta", correct: "a" }),
    ];
    const answered = [answer("q1", "a"), answer("q2", "b")];

    const result = score(answered, bank);

    expect(result.byDimension).toHaveLength(2);
    const alpha = result.byDimension.find((d) => d.dimension === "dim-alpha")!;
    const beta = result.byDimension.find((d) => d.dimension === "dim-beta")!;
    expect(alpha.correct).toBe(1);
    expect(beta.correct).toBe(0);
  });
});
