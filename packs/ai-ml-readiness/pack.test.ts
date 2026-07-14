import { describe, expect, it } from "vitest";
import { loadPack } from "../../src/content/loader.js";

const PACK_YAML = new URL("pack.yaml", import.meta.url).pathname;
const QUESTIONS_YAML = new URL("questions.yaml", import.meta.url).pathname;

const MIN_PER_DIMENSION = 12; // suficiente para el mínimo por dimensión de una sesión >=15 min
const MIN_TOTAL = 24;

describe("pack real ai-ml-readiness", () => {
  it("valida sin errores contra el validador real (loadPack)", () => {
    expect(() => loadPack(PACK_YAML, QUESTIONS_YAML)).not.toThrow();
  });

  it("declara exactamente 2 dimensiones: llm-rag-evals y ml-clasico", () => {
    const pack = loadPack(PACK_YAML, QUESTIONS_YAML);

    expect(pack.dimensions).toHaveLength(2);
    expect(pack.dimensions).toEqual(["llm-rag-evals", "ml-clasico"]);
  });

  it(`cada dimensión tiene al menos ${MIN_PER_DIMENSION} preguntas`, () => {
    const pack = loadPack(PACK_YAML, QUESTIONS_YAML);

    for (const dimension of pack.dimensions) {
      const count = pack.questions.filter((q) => q.dimension === dimension).length;
      expect(count, `dimensión '${dimension}' tiene ${count} preguntas`).toBeGreaterThanOrEqual(
        MIN_PER_DIMENSION,
      );
    }
  });

  it(`el banco total tiene al menos ${MIN_TOTAL} preguntas`, () => {
    const pack = loadPack(PACK_YAML, QUESTIONS_YAML);

    expect(pack.questions.length).toBeGreaterThanOrEqual(MIN_TOTAL);
  });

  it("todas las preguntas tienen un `correct` que referencia un option.id existente", () => {
    const pack = loadPack(PACK_YAML, QUESTIONS_YAML);

    for (const q of pack.questions) {
      const ids = new Set(q.options.map((o) => o.id));
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      for (const cid of correctIds) {
        expect(ids.has(cid), `pregunta '${q.id}': correct='${cid}' no existe en options`).toBe(
          true,
        );
      }
    }
  });

  it("todas las preguntas tienen una explanation real (no vacía/relleno)", () => {
    const pack = loadPack(PACK_YAML, QUESTIONS_YAML);

    for (const q of pack.questions) {
      expect(q.explanation.length, `pregunta '${q.id}' tiene explanation demasiado corta`).toBeGreaterThanOrEqual(
        15,
      );
    }
  });
});
