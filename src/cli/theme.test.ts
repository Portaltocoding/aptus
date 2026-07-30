import { describe, expect, it } from "vitest";
import { DIFFICULTY_LABEL, heading, progressBar, questionHeader } from "./theme.js";

/** Sin TTY picocolors no colorea, así que aquí se comprueba estructura, no ANSI. */
describe("theme", () => {
  it("la barra de avance refleja la posición, no el acierto", () => {
    expect(progressBar(0, 10, 10)).toBe("░".repeat(10));
    expect(progressBar(10, 10, 10)).toBe("▓".repeat(10));
    expect(progressBar(5, 10, 10)).toBe("▓".repeat(5) + "░".repeat(5));
  });

  it("la barra no revienta con total 0", () => {
    expect(progressBar(0, 0, 6)).toBe("░".repeat(6));
  });

  it("la cabecera dice dónde estás, de qué va y cuánto pesa", () => {
    const out = questionHeader(3, 120, "llm-rag-evals", "chunking", "hard");

    expect(out).toContain("Pregunta 3/120");
    expect(out).toContain("llm-rag-evals");
    expect(out).toContain("chunking");
    expect(out).toContain(DIFFICULTY_LABEL.hard);
  });

  it("la cabecera aguanta preguntas sin subtema", () => {
    const out = questionHeader(1, 10, "dim", undefined, "easy");
    expect(out).toContain("dim");
    expect(out).not.toContain("· ·");
  });

  it("heading rellena la regla hasta el ancho pedido", () => {
    expect(heading("Sesión", 40)).toHaveLength(40);
    expect(heading("Qué vamos a evaluar", 40)).toHaveLength(40);
  });

  it("heading no rompe si el texto es más largo que el ancho", () => {
    expect(() => heading("x".repeat(100), 20)).not.toThrow();
  });
});
