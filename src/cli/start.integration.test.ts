import { describe, expect, it } from "vitest";
import { loadPack, loadPackDir } from "../content/loader.js";
import { selectBalanced } from "../core/session.js";
import { makeSeededShuffle } from "../core/random.js";
import { score, type AnsweredQuestion, type Confidence } from "../core/scoring.js";
import { calibration } from "../core/calibration.js";
import { loadReadiness } from "../content/readiness.js";
import { computeReadiness, computeGaps } from "../core/readiness.js";
import { renderResult, renderCalibration, renderReadiness, renderGaps } from "./render.js";

const CONF_CYCLE: Confidence[] = ["alta", "media", "baja"];

const PACK_DIR = new URL("../../test/fixtures/packs/pack-completo/", import.meta.url).pathname;
const PACK_READINESS = new URL("../../test/fixtures/packs/pack-completo/readiness.yaml", import.meta.url)
  .pathname;

// Smoke NO interactivo: ejercita el camino end-to-end motor+contenido+render sin
// `@inquirer` (la interactividad viva del select se verifica manualmente en UAT).
const FIXTURES = new URL("../../test/fixtures/", import.meta.url);
const MINI_PACK_YAML = new URL("mini-pack/pack.yaml", FIXTURES).pathname;
const MINI_PACK_QUESTIONS = new URL("mini-pack/questions.yaml", FIXTURES).pathname;

describe("start end-to-end (smoke no interactivo)", () => {
  it("carga pack → selecciona equilibrado → puntúa → renderiza con N por dimensión, sin agregado", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);
    const selected = selectBalanced(pack.questions, 20, 8, makeSeededShuffle(123));

    // Respuestas deterministas: primera opción, con confianza rotando por índice.
    const answered: AnsweredQuestion[] = selected.map((q, i) => ({
      questionId: q.id,
      selectedOptionId: q.options[0]!.id,
      confidence: CONF_CYCLE[i % CONF_CYCLE.length]!,
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

    // La calibración (confianza-vs-acierto) se compone end-to-end con los mismos datos.
    const calibOut = renderCalibration(calibration(answered, selected));
    expect(calibOut).toMatch(/confianza declarada vs acierto real/i);
    expect(calibOut).toContain("Alta");
    expect(calibOut).not.toMatch(/empleab|probabilidad de contrataci/i);
  });

  it("la selección equilibrada cubre ambas dimensiones del fixture", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);
    const selected = selectBalanced(pack.questions, 20, 8, makeSeededShuffle(7));
    const dims = new Set(selected.map((q) => q.dimension));
    expect(dims).toEqual(new Set(["dimension-alpha", "dimension-beta"]));
  });
});

describe("readiness + gaps end-to-end (pack completo de fixture)", () => {
  it("compone readiness por rol y gaps priorizados sobre un pack completo", () => {
    const pack = loadPackDir(PACK_DIR);
    const cfg = loadReadiness(PACK_READINESS);
    const selected = selectBalanced(pack.questions, 25, 4, makeSeededShuffle(99));

    const answered: AnsweredQuestion[] = selected.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.options[0]!.id,
      confidence: "media",
    }));

    const roles = computeReadiness(answered, selected, cfg);
    const gaps = computeGaps(answered, selected, cfg);

    // Un readiness por cada perfil de rol de la config, con evidencia por dificultad.
    expect(roles.map((r) => r.roleId).sort()).toEqual(cfg.roles.map((r) => r.id).sort());
    for (const r of roles) {
      expect(r.byDifficulty.map((t) => t.difficulty)).toEqual(["easy", "medium", "hard", "experto"]);
    }

    const readinessOut = renderReadiness(roles);
    expect(readinessOut).toContain("Especialista Alfa");
    expect(readinessOut).not.toMatch(/empleab|índice de contrataci/i);

    // Cada gap (si lo hay) trae su plan de estudio; el render nunca revienta.
    expect(typeof renderGaps(gaps)).toBe("string");
    for (const g of gaps) {
      expect(g.study.length).toBeGreaterThan(0);
    }
  });
});
