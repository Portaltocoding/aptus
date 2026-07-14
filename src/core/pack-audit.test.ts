import { describe, expect, it } from "vitest";
import type { Pack, Question } from "../content/schema.js";
import { auditPack } from "./pack-audit.js";

function q(over: Partial<Question> & Pick<Question, "id" | "dimension">): Question {
  return {
    id: over.id,
    dimension: over.dimension,
    difficulty: over.difficulty ?? "easy",
    type: over.type ?? "concepto",
    roles: over.roles ?? [],
    stem: over.stem ?? "Enunciado suficientemente largo para pasar el mínimo.",
    options: over.options ?? [
      { id: "a", text: "correcta" },
      { id: "b", text: "incorrecta" },
    ],
    correct: over.correct ?? "a",
    explanation: over.explanation ?? "Explicación suficientemente larga y real.",
    source: over.source ?? "externa",
    date: over.date ?? "2026-01-01",
  };
}

function pack(questions: Question[], dimensions?: string[]): Pack {
  return {
    name: "test",
    version: "1.0.0",
    dimensions: dimensions ?? [...new Set(questions.map((x) => x.dimension))],
    questions,
  };
}

describe("auditPack", () => {
  it("un pack sano (con experto y suficientes preguntas) no da errores", () => {
    const qs = Array.from({ length: 12 }, (_, i) =>
      q({ id: `d-${i}`, dimension: "d", difficulty: i === 0 ? "experto" : "medium" }),
    );
    const rep = auditPack(pack(qs), 12);
    expect(rep.errors).toEqual([]);
    expect(rep.warnings.find((w) => w.code === "sin-experto")).toBeUndefined();
  });

  it("detecta ids duplicados como ERROR", () => {
    const rep = auditPack(pack([q({ id: "x", dimension: "d" }), q({ id: "x", dimension: "d" })]));
    expect(rep.errors.some((e) => e.code === "dup-id")).toBe(true);
  });

  it("avisa si una dimensión no tiene preguntas 'experto' (staff no evaluable)", () => {
    const qs = Array.from({ length: 12 }, (_, i) => q({ id: `d-${i}`, dimension: "d", difficulty: "hard" }));
    const rep = auditPack(pack(qs), 12);
    expect(rep.warnings.some((w) => w.code === "sin-experto")).toBe(true);
  });

  it("avisa de contenido sin curar (esqueleto/relleno)", () => {
    const rep = auditPack(pack([q({ id: "ejemplo-001", dimension: "dimension-ejemplo" })]));
    expect(rep.warnings.some((w) => w.code === "sin-curar")).toBe(true);
  });

  it("avisa de explicación demasiado corta", () => {
    const rep = auditPack(pack([q({ id: "d-1", dimension: "d", explanation: "corta" })]));
    expect(rep.warnings.some((w) => w.code === "explicacion-corta")).toBe(true);
  });
});
