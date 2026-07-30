import { describe, expect, it } from "vitest";
import { deriveMistakes, filterByDimension } from "./mistakes.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { Question } from "../content/schema.js";

/** Fixtures genéricas: el núcleo no conoce el vocabulario de ningún pack (ENG-04). */
function makeQuestion(overrides: Partial<Question> & Pick<Question, "id" | "dimension">): Question {
  return {
    id: overrides.id,
    dimension: overrides.dimension,
    subtopic: overrides.subtopic,
    difficulty: overrides.difficulty ?? "easy",
    type: overrides.type ?? "concepto",
    roles: overrides.roles ?? [],
    stem: overrides.stem ?? `Enunciado de ${overrides.id}`,
    options: overrides.options ?? [
      { id: "a", text: "Opción A" },
      { id: "b", text: "Opción B" },
      { id: "c", text: "Opción C" },
    ],
    correct: overrides.correct ?? "a",
    explanation: overrides.explanation ?? `Explicación de ${overrides.id}.`,
    source: overrides.source ?? "fixture",
    date: overrides.date ?? "2026-01-01",
  };
}

function answer(questionId: string, selectedOptionId: string | null): AnsweredQuestion {
  return { questionId, selectedOptionId };
}

describe("deriveMistakes", () => {
  it("una acertada no entra en el repaso", () => {
    const bank = [makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" })];
    const review = deriveMistakes([answer("q1", "a")], bank);

    expect(review.byDimension).toEqual([]);
    expect(review.wrong).toBe(0);
    expect(review.unanswered).toBe(0);
    expect(review.reviewable).toBe(0);
    // La acertada sigue contando como presentada: el N no se encoge.
    expect(review.presented).toBe(1);
  });

  it("una fallada trae el TEXTO de lo elegido, el de lo correcto y la explicación", () => {
    const bank = [
      makeQuestion({
        id: "q1",
        dimension: "dim-alpha",
        subtopic: "sub-uno",
        difficulty: "hard",
        stem: "¿Cuál es la buena?",
        correct: "a",
        explanation: "Porque sí, y por esto otro.",
      }),
    ];
    const review = deriveMistakes([answer("q1", "c")], bank);

    expect(review.wrong).toBe(1);
    expect(review.unanswered).toBe(0);
    const q = review.byDimension[0]!.questions[0]!;
    expect(q.outcome).toBe("fallada");
    // El TEXTO, no el id: "elegiste c" no le dice nada a nadie.
    expect(q.selectedText).toBe("Opción C");
    expect(q.correctTexts).toEqual(["Opción A"]);
    expect(q.explanation).toBe("Porque sí, y por esto otro.");
    expect(q.stem).toBe("¿Cuál es la buena?");
    expect(q.dimension).toBe("dim-alpha");
    expect(q.subtopic).toBe("sub-uno");
    expect(q.difficulty).toBe("hard");
  });

  it("una NO RESPONDIDA se distingue de una fallada: sin texto elegido y en su propio contador", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-alpha", correct: "a" }),
    ];
    const review = deriveMistakes([answer("q1", "b"), answer("q2", null)], bank);

    expect(review.wrong).toBe(1);
    expect(review.unanswered).toBe(1);
    expect(review.reviewable).toBe(2);

    const grupo = review.byDimension[0]!;
    expect(grupo.wrong).toBe(1);
    expect(grupo.unanswered).toBe(1);

    const noRespondida = grupo.questions.find((q) => q.questionId === "q2")!;
    expect(noRespondida.outcome).toBe("no-respondida");
    expect(noRespondida.selectedText).toBeNull();
    // Aun sin responderla, se enseña la solución: es lo que se viene a leer.
    expect(noRespondida.correctTexts).toEqual(["Opción A"]);
    expect(noRespondida.explanation).toBe("Explicación de q2.");
  });

  it("con `correct` como array, acertar cualquiera de las correctas NO es fallo", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: ["a", "b"] }),
      makeQuestion({ id: "q2", dimension: "dim-alpha", correct: ["a", "b"] }),
    ];
    const review = deriveMistakes([answer("q1", "b"), answer("q2", "c")], bank);

    // q1 eligió una de las correctas -> fuera del repaso. Mismo criterio que score().
    expect(review.wrong).toBe(1);
    const q = review.byDimension[0]!.questions[0]!;
    expect(q.questionId).toBe("q2");
    // Las dos correctas se enseñan, no solo la primera.
    expect(q.correctTexts).toEqual(["Opción A", "Opción B"]);
  });

  it("una pregunta que ya no está en el banco se cuenta aparte y no rompe", () => {
    const bank = [makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" })];
    const review = deriveMistakes([answer("q1", "b"), answer("q-borrada", "a")], bank);

    expect(review.missingFromBank).toEqual(["q-borrada"]);
    // No se cuela como presentada ni como fallo: de ella no se sabe nada.
    expect(review.presented).toBe(1);
    expect(review.reviewable).toBe(1);
    expect(review.byDimension).toHaveLength(1);
  });

  it("agrupa por dimensión en orden de aparición, no por número de fallos", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-beta", correct: "a" }),
      makeQuestion({ id: "q3", dimension: "dim-beta", correct: "a" }),
    ];
    const review = deriveMistakes([answer("q1", "b"), answer("q2", "b"), answer("q3", "b")], bank);

    // dim-beta tiene MÁS fallos y aun así va segunda: ordenar por fallos sería un
    // ranking de dimensiones sin su N.
    expect(review.byDimension.map((g) => g.dimension)).toEqual(["dim-alpha", "dim-beta"]);
  });

  it("dentro de una dimensión: primero las falladas, y de fácil a experto", () => {
    const bank = [
      makeQuestion({ id: "no-exp", dimension: "d", difficulty: "experto", correct: "a" }),
      makeQuestion({ id: "fall-hard", dimension: "d", difficulty: "hard", correct: "a" }),
      makeQuestion({ id: "no-easy", dimension: "d", difficulty: "easy", correct: "a" }),
      makeQuestion({ id: "fall-easy", dimension: "d", difficulty: "easy", correct: "a" }),
    ];
    const review = deriveMistakes(
      [
        answer("no-exp", null),
        answer("fall-hard", "b"),
        answer("no-easy", null),
        answer("fall-easy", "b"),
      ],
      bank,
    );

    expect(review.byDimension[0]!.questions.map((q) => q.questionId)).toEqual([
      "fall-easy",
      "fall-hard",
      "no-easy",
      "no-exp",
    ]);
  });

  it("si la opción elegida ya no existe en el pack, se dice en vez de mentir", () => {
    const bank = [makeQuestion({ id: "q1", dimension: "d", correct: "a" })];
    const review = deriveMistakes([answer("q1", "z-borrada")], bank);

    expect(review.byDimension[0]!.questions[0]!.selectedText).toContain("z-borrada");
  });

  it("sin respuestas no hay repaso, y no revienta", () => {
    const review = deriveMistakes([], [makeQuestion({ id: "q1", dimension: "d" })]);
    expect(review.reviewable).toBe(0);
    expect(review.presented).toBe(0);
    expect(review.byDimension).toEqual([]);
  });
});

describe("filterByDimension", () => {
  it("acota a una dimensión pero conserva los totales de la sesión entera", () => {
    const bank = [
      makeQuestion({ id: "q1", dimension: "dim-alpha", correct: "a" }),
      makeQuestion({ id: "q2", dimension: "dim-beta", correct: "a" }),
    ];
    const review = deriveMistakes([answer("q1", "b"), answer("q2", "b")], bank);
    const solo = filterByDimension(review, "dim-beta");

    expect(solo.byDimension.map((g) => g.dimension)).toEqual(["dim-beta"]);
    // Los totales NO se recalculan: siguen siendo los de la sesión, para que el
    // encabezado no diga "1 fallo" cuando hubo 2.
    expect(solo.wrong).toBe(2);
    expect(solo.presented).toBe(2);
  });
});
