import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDTH,
  DIFFICULTY_LABEL,
  MAX_WIDTH,
  MIN_WIDTH,
  cellBarWidth,
  heading,
  progressBar,
  progressWidth,
  questionHeader,
  tableWidths,
  termWidth,
} from "./theme.js";

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

// SESS-07: el ancho sale del terminal de verdad. Todo lo de aquí es puro (las
// columnas entran como argumento), así que se puede probar el terminal estrecho
// sin tener uno delante.
describe("termWidth", () => {
  it("sin TTY se comporta exactamente como hasta hoy", () => {
    expect(termWidth(undefined)).toBe(DEFAULT_WIDTH);
    expect(DEFAULT_WIDTH).toBe(72);
  });

  it("un terminal estrecho manda: se usa su ancho", () => {
    expect(termWidth(48)).toBe(48);
    expect(termWidth(40)).toBe(40);
  });

  it("un terminal muy ancho se topa: una regla de 300 no se lee mejor", () => {
    expect(termWidth(300)).toBe(MAX_WIDTH);
    expect(termWidth(101)).toBe(MAX_WIDTH);
  });

  it("un terminal absurdamente estrecho deja de encogerse", () => {
    expect(termWidth(10)).toBe(MIN_WIDTH);
    expect(termWidth(1)).toBe(MIN_WIDTH);
  });

  it("la basura que manda un terminal a medio redimensionar no dibuja reglas negativas", () => {
    for (const basura of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(termWidth(basura)).toBe(DEFAULT_WIDTH);
    }
    expect(termWidth(80.7)).toBe(80);
  });
});

describe("heading contra el ancho real", () => {
  it("llena justo el ancho, sea el que sea", () => {
    for (const w of [MIN_WIDTH, 40, DEFAULT_WIDTH, MAX_WIDTH]) {
      expect(heading("Sesión", w)).toHaveLength(w);
    }
  });

  it("un título que no cabe se recorta en vez de desbordar la línea", () => {
    const out = heading("Borrador — un pack con un nombre larguísimo · dimensión", 30);

    expect(out).toHaveLength(30);
    expect(out).toContain("…");
  });

  it("aun recortado sigue dejando visible el principio del título", () => {
    expect(heading("Ingesta de /home/carlos/curso", 24)).toMatch(/^Ingesta de/);
  });
});

describe("barras contra el ancho real", () => {
  it("la barra de avance deja sitio al 'Pregunta 120/120' que va a su lado", () => {
    // 40 columnas: la barra (18) + lo que la acompaña (~22) cabe justo.
    expect(progressWidth(40) + 22).toBeLessThanOrEqual(40);
    expect(progressWidth(36) + 22).toBeLessThanOrEqual(36);
  });

  it("en un terminal estrecho la barra encoge", () => {
    expect(progressWidth(30)).toBe(8);
    expect(progressWidth(MIN_WIDTH)).toBe(6);
  });

  it("en uno ancho no crece: sigue siendo una fracción, no un adorno", () => {
    expect(progressWidth(MAX_WIDTH)).toBe(18);
    expect(progressWidth(DEFAULT_WIDTH)).toBe(18);
  });

  it("la barra sigue diciendo la posición con cualquier ancho", () => {
    expect(progressBar(5, 10, progressWidth(30))).toBe("▓".repeat(4) + "░".repeat(4));
  });

  it("las barras de dentro de las tablas encogen antes: comparten fila con el N", () => {
    expect(cellBarWidth(DEFAULT_WIDTH)).toBe(20);
    expect(cellBarWidth(MAX_WIDTH)).toBe(20);
    expect(cellBarWidth(50)).toBe(10);
  });
});

describe("tableWidths", () => {
  it("si cabe, manda el contenido — que es lo que se ha hecho siempre", () => {
    expect(tableWidths(5, DEFAULT_WIDTH)).toBeUndefined();
    expect(tableWidths(5, MAX_WIDTH)).toBeUndefined();
  });

  it("sin TTY no cambia ni un byte de la salida de hoy", () => {
    expect(tableWidths(7, termWidth(undefined))).toBeUndefined();
  });

  it("en un terminal estrecho reparte el ancho real entre las columnas", () => {
    const anchos = tableWidths(3, 40)!;

    expect(anchos).toHaveLength(3);
    expect(anchos.reduce((a, b) => a + b, 0) + 4).toBeLessThanOrEqual(40);
  });

  it("con muchas columnas y poco ancho no baja de lo mínimo legible", () => {
    expect(tableWidths(7, MIN_WIDTH)).toEqual(Array.from({ length: 7 }, () => 6));
  });

  it("una tabla sin columnas no pide anchos", () => {
    expect(tableWidths(0, 40)).toBeUndefined();
  });
});
