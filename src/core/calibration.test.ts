import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import { calibration, DECLARED_ACCURACY } from "./calibration.js";
import {
  answerCurrent,
  buildSession,
  goForward,
  setConfidenceCurrent,
  toAnswered,
} from "./session.js";

// Fixture mínimo: la respuesta correcta siempre es "a".
function q(id: string): Question {
  return {
    id,
    dimension: "dim",
    difficulty: "easy",
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

describe("calibration (motor puro)", () => {
  it("agrupa por nivel de confianza y calcula el acierto real por nivel", () => {
    const bank = [q("q1"), q("q2"), q("q3"), q("q4")];
    const answered: AnsweredQuestion[] = [
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" }, // correcta
      { questionId: "q2", selectedOptionId: "b", confidence: "alta" }, // fallo
      { questionId: "q3", selectedOptionId: "a", confidence: "baja" }, // correcta
      { questionId: "q4", selectedOptionId: "b", confidence: "baja" }, // fallo
    ];

    const { byConfidence } = calibration(answered, bank);
    const alta = byConfidence.find((b) => b.confidence === "alta")!;
    const baja = byConfidence.find((b) => b.confidence === "baja")!;

    expect(alta.answered).toBe(2);
    expect(alta.correct).toBe(1);
    expect(alta.accuracy).toBeCloseTo(0.5);
    expect(baja.answered).toBe(2);
    expect(baja.accuracy).toBeCloseTo(0.5);
  });

  it("señala sobreestimación: confianza alta con bajo acierto da gap negativo", () => {
    const bank = [q("q1"), q("q2"), q("q3"), q("q4")];
    const answered: AnsweredQuestion[] = bank.map((question, i) => ({
      questionId: question.id,
      selectedOptionId: i === 0 ? "a" : "b", // solo 1 de 4 correcta
      confidence: "alta",
    }));

    const { byConfidence } = calibration(answered, bank);
    const alta = byConfidence.find((b) => b.confidence === "alta")!;

    expect(alta.accuracy).toBeCloseTo(0.25);
    expect(alta.declared).toBe(DECLARED_ACCURACY.alta);
    expect(alta.gap).toBeLessThan(0); // declaró más de lo que acertó => se sobreestima
  });

  it("excluye respuestas sin confianza declarada y sin responder", () => {
    const bank = [q("q1"), q("q2"), q("q3")];
    const answered: AnsweredQuestion[] = [
      { questionId: "q1", selectedOptionId: "a", confidence: "media" },
      { questionId: "q2", selectedOptionId: "a", confidence: null }, // sin confianza
      { questionId: "q3", selectedOptionId: null, confidence: "alta" }, // no respondida
    ];

    const { byConfidence } = calibration(answered, bank);
    const total = byConfidence.reduce((n, b) => n + b.answered, 0);

    expect(total).toBe(1); // solo q1 cuenta
    expect(byConfidence.map((b) => b.confidence)).toEqual(["media"]);
  });

  it("ordena los niveles presentes de mayor a menor confianza", () => {
    const bank = [q("q1"), q("q2"), q("q3")];
    const answered: AnsweredQuestion[] = [
      { questionId: "q1", selectedOptionId: "a", confidence: "baja" },
      { questionId: "q2", selectedOptionId: "a", confidence: "alta" },
      { questionId: "q3", selectedOptionId: "a", confidence: "media" },
    ];

    const { byConfidence } = calibration(answered, bank);
    expect(byConfidence.map((b) => b.confidence)).toEqual(["alta", "media", "baja"]);
  });

  it("no produce ningún campo agregado global (solo el desglose por nivel)", () => {
    const bank = [q("q1")];
    const answered: AnsweredQuestion[] = [
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" },
    ];
    const result = calibration(answered, bank);
    expect(Object.keys(result)).toEqual(["byConfidence"]);
  });
});

describe("sesión: captura de confianza (plumbing puro)", () => {
  it("setConfidenceCurrent registra la confianza y toAnswered la propaga", () => {
    let state = buildSession([q("q1"), q("q2")]);
    state = goForward(setConfidenceCurrent(answerCurrent(state, "a"), "alta"));
    state = goForward(setConfidenceCurrent(answerCurrent(state, "b"), "baja"));

    const answered = toAnswered(state);
    expect(answered).toEqual([
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" },
      { questionId: "q2", selectedOptionId: "b", confidence: "baja" },
    ]);
  });

  it("una pregunta respondida sin declarar confianza queda con confidence null", () => {
    let state = buildSession([q("q1")]);
    state = goForward(answerCurrent(state, "a")); // sin setConfidenceCurrent
    expect(toAnswered(state)[0]!.confidence).toBeNull();
  });
});
