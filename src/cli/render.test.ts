import { describe, expect, it } from "vitest";
import { renderResult, renderCalibration } from "./render.js";
import type { ScoreResult } from "../core/scoring.js";
import type { CalibrationResult } from "../core/calibration.js";

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

const CALIB: CalibrationResult = {
  byConfidence: [
    { confidence: "alta", declared: 0.9, answered: 10, correct: 4, accuracy: 0.4, gap: 0.4 - 0.9 },
    { confidence: "media", declared: 0.65, answered: 6, correct: 4, accuracy: 4 / 6, gap: 4 / 6 - 0.65 },
    { confidence: "baja", declared: 0.4, answered: 4, correct: 3, accuracy: 0.75, gap: 0.75 - 0.4 },
  ],
};

describe("renderCalibration", () => {
  it("muestra cada nivel de confianza con su acierto real y su N", () => {
    const out = renderCalibration(CALIB);
    expect(out).toContain("Alta");
    expect(out).toContain("4/10");
    expect(out).toContain("Baja");
    expect(out).toContain("3/4");
  });

  it("señala 'te sobreestimas' cuando la confianza alta supera el acierto real", () => {
    const out = renderCalibration(CALIB);
    expect(out).toMatch(/sobreestimas/i);
  });

  it("señala 'te infravaloras' cuando el acierto supera con holgura la confianza declarada", () => {
    const out = renderCalibration(CALIB);
    expect(out).toMatch(/infravaloras/i);
  });

  it("no muestra ningún score único agregado tipo empleabilidad", () => {
    const out = renderCalibration(CALIB);
    expect(out).not.toMatch(/overall|empleab|global|hire|probabilidad de contrataci/i);
  });

  it("sin datos de confianza devuelve un mensaje claro, no una tabla vacía", () => {
    const out = renderCalibration({ byConfidence: [] });
    expect(out).toMatch(/no declaraste confianza/i);
  });
});
