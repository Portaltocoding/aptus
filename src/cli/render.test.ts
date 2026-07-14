import { describe, expect, it } from "vitest";
import { renderResult } from "./render.js";
import type { ScoreResult } from "../core/scoring.js";

// Fixture de ScoreResult (nombres de dimensión genéricos: el render no conoce
// el dominio). Incluye una dimensión sin responder para el caso borde de N=0.
const FIXTURE: ScoreResult = {
  byDimension: [
    { dimension: "dim-uno", presented: 10, answered: 8, correct: 6, pct: 6 / 8, bySubtopic: [] },
    { dimension: "dim-dos", presented: 10, answered: 10, correct: 4, pct: 0.4, bySubtopic: [] },
    { dimension: "dim-vacia", presented: 5, answered: 0, correct: 0, pct: 0, bySubtopic: [] },
  ],
};

describe("renderResult", () => {
  it("muestra una fila por dimensión con su N (respondidas/presentadas) junto al score", () => {
    const out = renderResult(FIXTURE);
    expect(out).toContain("dim-uno");
    expect(out).toContain("8/10");
    expect(out).toContain("dim-dos");
    expect(out).toContain("10/10");
  });

  it("nunca muestra un porcentaje sin su N: hay exactamente un % por dimensión", () => {
    const out = renderResult(FIXTURE);
    expect((out.match(/%/g) ?? []).length).toBe(FIXTURE.byDimension.length);
  });

  it("no muestra ninguna fila/celda de agregado ni 'empleabilidad'", () => {
    const out = renderResult(FIXTURE);
    expect(out).not.toMatch(/overall|agregad|empleab|global|hire|\btotal\b/i);
  });

  it("una dimensión con answered=0 se renderiza sin romper (0% con N 0/presentadas)", () => {
    const out = renderResult(FIXTURE);
    expect(out).toContain("0/5");
    expect(out).toContain("0%");
  });
});
