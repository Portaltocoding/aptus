import { describe, expect, it } from "vitest";
import type { Pack, Question } from "../content/schema.js";
import { auditPack, positionBias } from "./pack-audit.js";

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

describe("sesgo de posición", () => {
  /** Banco realista: la correcta siempre la primera, que es como salen escritas a mano. */
  const sesgado = (n: number): Question[] =>
    Array.from({ length: n }, (_, i) =>
      q({
        id: `d-${i}`,
        dimension: "d",
        options: [
          { id: "a", text: "correcta" },
          { id: "b", text: "distractor 1" },
          { id: "c", text: "distractor 2" },
          { id: "d", text: "distractor 3" },
        ],
        correct: "a",
      }),
    );

  it("avisa cuando la correcta se concentra en una posición", () => {
    const rep = auditPack(pack(sesgado(40)), 12);
    const aviso = rep.warnings.find((w) => w.code === "sesgo-posicion");
    expect(aviso).toBeDefined();
    expect(aviso!.message).toContain("40/40");
    // Y deja claro que la sesión no está comprometida: aptus baraja al presentar.
    expect(aviso!.message).toMatch(/baraja/i);
  });

  it("no avisa si las correctas están repartidas", () => {
    const letras = ["a", "b", "c", "d"];
    const repartido = Array.from({ length: 40 }, (_, i) =>
      q({
        id: `d-${i}`,
        dimension: "d",
        options: letras.map((l) => ({ id: l, text: `opción ${l}` })),
        correct: letras[i % 4]!,
      }),
    );
    expect(auditPack(pack(repartido), 12).warnings.some((w) => w.code === "sesgo-posicion")).toBe(false);
  });

  it("no avisa con muestra insuficiente: 10 preguntas no prueban un sesgo", () => {
    expect(auditPack(pack(sesgado(10)), 5).warnings.some((w) => w.code === "sesgo-posicion")).toBe(false);
  });

  it("positionBias ignora las preguntas de respuesta múltiple", () => {
    const multiples = Array.from({ length: 30 }, (_, i) =>
      q({
        id: `m-${i}`,
        dimension: "d",
        options: [
          { id: "a", text: "una" },
          { id: "b", text: "otra" },
        ],
        correct: ["a", "b"],
      }),
    );
    expect(positionBias(multiples)).toBeNull();
  });
});
