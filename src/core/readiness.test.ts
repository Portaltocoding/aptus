import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { ReadinessConfig } from "../content/readiness.js";
import { computeReadiness, computeGaps } from "./readiness.js";

type Diff = "easy" | "medium" | "hard";

function q(id: string, dimension: string, difficulty: Diff): Question {
  return {
    id,
    dimension,
    difficulty,
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

// "a" acierta, "b" falla; null = sin responder.
function ans(id: string, opt: string | null): AnsweredQuestion {
  return { questionId: id, selectedOptionId: opt };
}

const CONFIG: ReadinessConfig = {
  version: "test",
  levels: [
    { id: "junior", label: "Junior-ready", requires: { easy: 0.7, medium: 0.4, hard: 0.0 } },
    { id: "mid", label: "Mid-ready", requires: { easy: 0.8, medium: 0.6, hard: 0.35 } },
    { id: "senior", label: "Senior-ready", requires: { easy: 0.9, medium: 0.75, hard: 0.6 } },
  ],
  roles: [
    { id: "r1", label: "Role One", core: ["dim-a"], secondary: [], source: "x" },
    { id: "r2", label: "Role Two", core: ["dim-b"], secondary: [], source: "x" },
  ],
  study: { "dim-a": "estudia A", "dim-b": "estudia B" },
};

function readinessFor(roleId: string, answered: AnsweredQuestion[], bank: Question[]) {
  return computeReadiness(answered, bank, CONFIG).find((r) => r.roleId === roleId)!;
}

describe("computeReadiness (motor puro)", () => {
  it("concede senior cuando los tres tramos tienen evidencia y superan el umbral", () => {
    const bank = [
      q("e1", "dim-a", "easy"),
      q("e2", "dim-a", "easy"),
      q("m1", "dim-a", "medium"),
      q("m2", "dim-a", "medium"),
      q("h1", "dim-a", "hard"),
      q("h2", "dim-a", "hard"),
    ];
    const answered = bank.map((question) => ans(question.id, "a")); // todo correcto

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBe("senior");
    expect(r.answered).toBe(6);
  });

  it("se queda en junior cuando el tramo medio no llega al umbral de mid", () => {
    const bank = [
      q("e1", "dim-a", "easy"),
      q("e2", "dim-a", "easy"),
      q("m1", "dim-a", "medium"),
      q("m2", "dim-a", "medium"),
      q("h1", "dim-a", "hard"),
      q("h2", "dim-a", "hard"),
    ];
    const answered = [
      ans("e1", "a"),
      ans("e2", "a"), // easy 100%
      ans("m1", "a"),
      ans("m2", "b"), // medium 50% (< 0.6 de mid)
      ans("h1", "a"),
      ans("h2", "b"), // hard 50%
    ];

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBe("junior");
  });

  it("no concede mid/senior sin evidencia en el tramo que exigen (no sobre-afirma)", () => {
    // Solo easy y medium, ambos perfectos; ninguna pregunta hard.
    const bank = [
      q("e1", "dim-a", "easy"),
      q("e2", "dim-a", "easy"),
      q("m1", "dim-a", "medium"),
      q("m2", "dim-a", "medium"),
    ];
    const answered = bank.map((question) => ans(question.id, "a"));

    const r = readinessFor("r1", answered, bank);
    // mid exige hard >= 0.35 y no hay hard => no llega a mid; se queda en junior.
    expect(r.levelId).toBe("junior");
    const hard = r.byDifficulty.find((t) => t.difficulty === "hard")!;
    expect(hard.answered).toBe(0);
  });

  it("marca 'aún no junior-ready' (levelId null) cuando ni lo fundamental llega", () => {
    const bank = [q("e1", "dim-a", "easy"), q("e2", "dim-a", "easy")];
    const answered = [ans("e1", "a"), ans("e2", "b")]; // easy 50% (< 0.7)

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBeNull();
    expect(r.levelLabel.toLowerCase()).toContain("aún no");
  });

  it("solo cuenta las dimensiones núcleo del rol", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = bank.map((question) => ans(question.id, "a"));

    const r1 = readinessFor("r1", answered, bank); // core dim-a
    const r2 = readinessFor("r2", answered, bank); // core dim-b
    expect(r1.answered).toBe(1);
    expect(r2.answered).toBe(2);
  });
});

describe("computeGaps (RES-03)", () => {
  it("lista solo las dimensiones por debajo del umbral, de más débil a menos, con su plan", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("a2", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = [
      ans("a1", "b"),
      ans("a2", "b"), // dim-a 0%
      ans("b1", "a"),
      ans("b2", "a"), // dim-b 100% (no es gap)
    ];

    const gaps = computeGaps(answered, bank, CONFIG);
    expect(gaps.map((g) => g.dimension)).toEqual(["dim-a"]);
    expect(gaps[0]!.study).toBe("estudia A");
  });

  it("ordena varios gaps de menor a mayor acierto", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("a2", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = [
      ans("a1", "a"),
      ans("a2", "b"), // dim-a 50%
      ans("b1", "b"),
      ans("b2", "b"), // dim-b 0%
    ];

    const gaps = computeGaps(answered, bank, CONFIG);
    expect(gaps.map((g) => g.dimension)).toEqual(["dim-b", "dim-a"]); // dim-b (0%) primero
  });

  it("sin gaps cuando todo está en el umbral o por encima", () => {
    const bank = [q("a1", "dim-a", "easy"), q("b1", "dim-b", "easy")];
    const answered = [ans("a1", "a"), ans("b1", "a")];
    expect(computeGaps(answered, bank, CONFIG)).toEqual([]);
  });
});
