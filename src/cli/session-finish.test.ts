import { describe, expect, it } from "vitest";
import { partialWarning } from "./session-finish.js";

/**
 * El aviso de sesión parcial es lo ÚNICO que separa "medí 4 preguntas" de "medí
 * 20": si no se lee, un N pequeño en una tabla no se ve hasta que ya te has creído
 * el porcentaje.
 */
describe("partialWarning", () => {
  it("dice cuántas se evalúan y de cuántas se cortó", () => {
    const aviso = partialWarning(4, 20);

    expect(aviso).toContain("4");
    expect(aviso).toContain("20");
    expect(aviso).toMatch(/no cuenta ni a favor ni en contra/);
  });

  it("concuerda en singular y en plural", () => {
    expect(partialWarning(1, 20)).toMatch(/se evalúa la única pregunta/);
    expect(partialWarning(4, 20)).toMatch(/se evalúan las 4 preguntas/);
  });
});
