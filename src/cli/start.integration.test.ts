import { describe, expect, it } from "vitest";
import { loadPack } from "../content/loader.js";
import { selectBalanced } from "../core/session.js";
import { makeSeededShuffle } from "../core/random.js";
import { score, type AnsweredQuestion } from "../core/scoring.js";
import { renderResult } from "./render.js";

// Smoke NO interactivo: ejercita el camino end-to-end motor+contenido+render sin
// `@inquirer` (la interactividad viva del select se verifica manualmente en UAT).
const FIXTURES = new URL("../../test/fixtures/", import.meta.url);
const MINI_PACK_YAML = new URL("mini-pack/pack.yaml", FIXTURES).pathname;
const MINI_PACK_QUESTIONS = new URL("mini-pack/questions.yaml", FIXTURES).pathname;

describe("start end-to-end (smoke no interactivo)", () => {
  it("carga pack → selecciona equilibrado → puntúa → renderiza con N por dimensión, sin agregado", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);
    const selected = selectBalanced(pack.questions, 20, 8, makeSeededShuffle(123));

    // Respuestas deterministas: contestar todo eligiendo la primera opción.
    const answered: AnsweredQuestion[] = selected.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.options[0]!.id,
    }));

    const result = score(answered, selected);
    const output = renderResult(result);

    // Cada dimensión aparece con su N (respondidas/presentadas) al lado.
    for (const d of result.byDimension) {
      expect(output).toContain(d.dimension);
      expect(output).toContain(`${d.answered}/${d.presented}`);
    }
    // Un único "%" por dimensión: ningún porcentaje agregado extra.
    expect((output.match(/%/g) ?? []).length).toBe(result.byDimension.length);
    // Nunca un score agregado tipo empleabilidad / probabilidad de contratación.
    expect(output).not.toMatch(/overall|agregad|empleab|global|hire|probabilidad de contrataci/i);
  });

  it("la selección equilibrada cubre ambas dimensiones del fixture", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);
    const selected = selectBalanced(pack.questions, 20, 8, makeSeededShuffle(7));
    const dims = new Set(selected.map((q) => q.dimension));
    expect(dims).toEqual(new Set(["dimension-alpha", "dimension-beta"]));
  });
});
