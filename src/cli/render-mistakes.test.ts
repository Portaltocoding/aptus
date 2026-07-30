import { describe, expect, it } from "vitest";
import { renderMistakes, wrap } from "./render-mistakes.js";
import type { MistakeReview, ReviewedQuestion } from "../core/mistakes.js";

function q(overrides: Partial<ReviewedQuestion> = {}): ReviewedQuestion {
  return {
    questionId: "q1",
    outcome: "fallada",
    dimension: "dim-uno",
    difficulty: "medium",
    type: "concepto",
    stem: "¿Cuál de estas afirmaciones es correcta?",
    selectedText: "La que no era",
    correctTexts: ["La que sí era"],
    explanation: "Era esa porque el motivo es este.",
    ...overrides,
  };
}

function review(overrides: Partial<MistakeReview> = {}): MistakeReview {
  const questions = overrides.byDimension?.[0]?.questions ?? [q()];
  return {
    byDimension: [{ dimension: "dim-uno", questions, wrong: 1, unanswered: 0, presented: 10 }],
    wrong: 1,
    unanswered: 0,
    reviewable: 1,
    presented: 10,
    missingFromBank: [],
    ...overrides,
  };
}

/** Sin los códigos ANSI: lo que se compara es el texto, no el color. */
// eslint-disable-next-line no-control-regex
const sinColor = (s: string): string => s.replace(/\[[0-9;]*m/g, "");

describe("wrap", () => {
  it("ajusta al ancho pedido descontando la sangría", () => {
    const lineas = wrap("uno dos tres cuatro cinco seis", 20, "  ");
    expect(lineas.every((l) => l.length <= 20)).toBe(true);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas[0]!.startsWith("  ")).toBe(true);
  });

  it("respeta los saltos de línea que ya trae el texto", () => {
    expect(wrap("uno\ndos", 40)).toEqual(["uno", "dos"]);
  });

  it("una palabra más larga que el hueco se deja salir en vez de partirla", () => {
    const lineas = wrap("supercalifragilisticoespialidoso", 12);
    expect(lineas).toEqual(["supercalifragilisticoespialidoso"]);
  });
});

describe("renderMistakes", () => {
  it("muestra enunciado, lo elegido, lo correcto y la explicación", () => {
    const out = sinColor(renderMistakes(review(), 72));
    expect(out).toContain("¿Cuál de estas afirmaciones es correcta?");
    expect(out).toContain("Tu respuesta:");
    expect(out).toContain("La que no era");
    expect(out).toContain("Correcta:");
    expect(out).toContain("La que sí era");
    expect(out).toContain("Era esa porque el motivo es este.");
  });

  it("el titular lleva SIEMPRE el N presentado detrás", () => {
    const out = sinColor(renderMistakes(review(), 72));
    expect(out).toContain("1 fallada(s)");
    expect(out).toContain("de 10 pregunta(s) presentada(s)");
    // Nunca un porcentaje suelto en esta pantalla.
    expect(out).not.toMatch(/\d+%/);
  });

  it("una NO RESPONDIDA se dice como tal y no se le inventa respuesta", () => {
    const r = review({
      byDimension: [
        {
          dimension: "dim-uno",
          questions: [q({ outcome: "no-respondida", selectedText: null })],
          wrong: 0,
          unanswered: 1,
          presented: 10,
        },
      ],
      wrong: 0,
      unanswered: 1,
      reviewable: 1,
    });
    const out = sinColor(renderMistakes(r, 72));
    expect(out).toContain("No la respondiste.");
    expect(out).not.toContain("Tu respuesta:");
    expect(out).toContain("sin responder");
    // La solución se enseña igual: es lo que se viene a leer.
    expect(out).toContain("La que sí era");
  });

  it("con varias correctas las enseña todas y cambia el rótulo", () => {
    const r = review({
      byDimension: [
        {
          dimension: "dim-uno",
          questions: [q({ correctTexts: ["Primera buena", "Segunda buena"] })],
          wrong: 1,
          unanswered: 0,
          presented: 10,
        },
      ],
    });
    const out = sinColor(renderMistakes(r, 72));
    expect(out).toContain("Correctas:");
    expect(out).toContain("Primera buena");
    expect(out).toContain("Segunda buena");
  });

  it("respeta el ancho del terminal", () => {
    const largo = "palabra ".repeat(60).trim();
    const r = review({
      byDimension: [
        {
          dimension: "dim-uno",
          questions: [q({ stem: largo, explanation: largo })],
          wrong: 1,
          unanswered: 0,
          presented: 10,
        },
      ],
    });
    for (const ancho of [40, 72, 100]) {
      const out = sinColor(renderMistakes(r, ancho));
      expect(out.split("\n").every((l) => l.length <= ancho)).toBe(true);
    }
  });

  it("un diagrama o un snippet se enseña verbatim: no se reflowea", () => {
    const diagrama = "  A --> B\n  |     |\n  v     v\n  C --> D";
    const r = review({
      byDimension: [
        {
          dimension: "dim-uno",
          questions: [q({ type: "diagrama", stem: diagrama })],
          wrong: 1,
          unanswered: 0,
          presented: 10,
        },
      ],
    });
    const out = sinColor(renderMistakes(r, 72));
    // Las cuatro líneas del diagrama siguen siendo cuatro, con su forma intacta.
    for (const l of diagrama.split("\n")) expect(out).toContain(l);
  });

  it("sin fallos lo dice, con su N", () => {
    const out = sinColor(
      renderMistakes(
        {
          byDimension: [],
          wrong: 0,
          unanswered: 0,
          reviewable: 0,
          presented: 12,
          missingFromBank: [],
        },
        72,
      ),
    );
    expect(out).toContain("Nada que repasar");
    expect(out).toContain("12");
  });

  it("avisa de las preguntas que ya no están en el pack en vez de callarlas", () => {
    const out = sinColor(renderMistakes(review({ missingFromBank: ["vieja-1", "vieja-2"] }), 72));
    expect(out).toContain("2 pregunta(s) de esa sesión ya no están en el");
  });

  it("al acotar a una dimensión avisa de que se muestra solo una parte", () => {
    // El titular cuenta la sesión entera (5) pero abajo solo hay 1: si no se
    // dijera, parecería que los números no cuadran.
    const out = sinColor(renderMistakes(review({ wrong: 5, reviewable: 5 }), 72));
    expect(out).toContain("Se muestran 1 de las 5");
  });
});
