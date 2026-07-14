import { describe, expect, it } from "vitest";
import { loadPackDir } from "../../src/content/loader.js";
import { selectBalanced } from "../../src/core/session.js";
import { makeSeededShuffle } from "../../src/core/random.js";

// El pack vive en este mismo directorio (pack.yaml + questions/*.yaml).
const PACK_DIR = new URL(".", import.meta.url).pathname;

const EXPECTED_DIMENSIONS = [
  "llm-rag-evals",
  "ml-clasico",
  "fullstack-next-nest-ts",
  "ai-product-system-design",
  "comportamental-star",
];
const MIN_PER_DIMENSION = 12; // suficiente para rotar (se muestran ~5/dimensión por sesión)
const MIN_TOTAL = 60;
const ALLOWED_SOURCES = new Set(["bootcamp-ml-llm", "externa"]);

describe("pack real ai-ml-readiness (v2, banco completo)", () => {
  it("valida sin errores contra el validador real (loadPack)", () => {
    expect(() => loadPackDir(PACK_DIR)).not.toThrow();
  });

  it("declara exactamente las 5 dimensiones objetivo", () => {
    const pack = loadPackDir(PACK_DIR);
    expect(pack.dimensions).toHaveLength(5);
    expect(pack.dimensions).toEqual(EXPECTED_DIMENSIONS);
  });

  it("cada dimensión declarada tiene preguntas reales en el banco", () => {
    const pack = loadPackDir(PACK_DIR);
    const dimsConPreguntas = new Set(pack.questions.map((q) => q.dimension));
    for (const dimension of pack.dimensions) {
      expect(dimsConPreguntas.has(dimension), `dimensión '${dimension}' sin preguntas`).toBe(true);
    }
    // Y ninguna pregunta usa una dimensión no declarada en el pack.
    for (const q of pack.questions) {
      expect(pack.dimensions.includes(q.dimension), `pregunta '${q.id}' con dimensión huérfana`).toBe(
        true,
      );
    }
  });

  it(`cada dimensión tiene al menos ${MIN_PER_DIMENSION} preguntas`, () => {
    const pack = loadPackDir(PACK_DIR);
    for (const dimension of pack.dimensions) {
      const count = pack.questions.filter((q) => q.dimension === dimension).length;
      expect(count, `dimensión '${dimension}' tiene ${count} preguntas`).toBeGreaterThanOrEqual(
        MIN_PER_DIMENSION,
      );
    }
  });

  it(`el banco total tiene al menos ${MIN_TOTAL} preguntas`, () => {
    const pack = loadPackDir(PACK_DIR);
    expect(pack.questions.length).toBeGreaterThanOrEqual(MIN_TOTAL);
  });

  it("todas las preguntas tienen un `correct` que referencia un option.id existente", () => {
    const pack = loadPackDir(PACK_DIR);
    for (const q of pack.questions) {
      const ids = new Set(q.options.map((o) => o.id));
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      for (const cid of correctIds) {
        expect(ids.has(cid), `pregunta '${q.id}': correct='${cid}' no existe en options`).toBe(true);
      }
    }
  });

  it("todas las preguntas tienen una explanation real (no vacía/relleno)", () => {
    const pack = loadPackDir(PACK_DIR);
    for (const q of pack.questions) {
      expect(
        q.explanation.length,
        `pregunta '${q.id}' tiene explanation demasiado corta`,
      ).toBeGreaterThanOrEqual(15);
    }
  });

  // --- CONT-04: procedencia auditable (curador = evaluado) ---
  it("cada pregunta declara una `source` auditable (bootcamp-ml-llm | externa)", () => {
    const pack = loadPackDir(PACK_DIR);
    for (const q of pack.questions) {
      expect(ALLOWED_SOURCES.has(q.source), `pregunta '${q.id}': source '${q.source}' no auditable`).toBe(
        true,
      );
    }
  });

  it("el banco mezcla fuentes: hay preguntas de bootcamp y externas (permite auditar el sesgo)", () => {
    const pack = loadPackDir(PACK_DIR);
    const sources = new Set(pack.questions.map((q) => q.source));
    expect(sources.has("bootcamp-ml-llm")).toBe(true);
    expect(sources.has("externa")).toBe(true);
    // El stack profesional externo (fullstack) no debe venir del bootcamp.
    const fullstack = pack.questions.filter((q) => q.dimension === "fullstack-next-nest-ts");
    expect(fullstack.every((q) => q.source === "externa")).toBe(true);
  });

  // --- SESS-04: rotación entre intentos ---
  it("dos intentos con seeds distintas no presentan el mismo set de preguntas (rotación)", () => {
    const pack = loadPackDir(PACK_DIR);
    const selA = selectBalanced(pack.questions, 25, 4, makeSeededShuffle(1)).map((q) => q.id);
    const selB = selectBalanced(pack.questions, 25, 4, makeSeededShuffle(2)).map((q) => q.id);

    // Combinar los ids únicos de ambas sesiones supera el tamaño de una sola:
    // prueba que el set no es idéntico (el banco es mayor que lo mostrado).
    const combinados = new Set([...selA, ...selB]);
    expect(combinados.size).toBeGreaterThan(selA.length);
  });

  it("misma seed → misma selección (determinismo del núcleo, base de la rotación)", () => {
    const pack = loadPackDir(PACK_DIR);
    const sel1 = selectBalanced(pack.questions, 25, 4, makeSeededShuffle(42)).map((q) => q.id);
    const sel2 = selectBalanced(pack.questions, 25, 4, makeSeededShuffle(42)).map((q) => q.id);
    expect(sel1).toEqual(sel2);
  });
});
