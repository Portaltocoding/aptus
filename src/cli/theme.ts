import pc from "picocolors";
import type { Difficulty } from "../core/session.js";

/**
 * Vocabulario visual del CLI: colores, etiquetas y el tema de los prompts.
 *
 * Está aparte de `render.ts` a propósito: `render.ts` formatea RESULTADOS (tablas
 * de scoring, readiness, gaps) y esto viste la SESIÓN en vivo. Aquí no se calcula
 * nada; si algo de esto desaparece, los números no cambian.
 *
 * Regla de color que sigue todo el fichero: el enunciado y las opciones nunca se
 * pintan igual. Leer una pregunta no debería costar esfuerzo de vista.
 */

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "fácil",
  medium: "media",
  hard: "difícil",
  experto: "experto",
};

/** Color por tramo: el mismo criterio ascendente que usa el readiness por nivel. */
export function difficultyColor(d: Difficulty): (s: string) => string {
  if (d === "easy") return pc.green;
  if (d === "medium") return pc.yellow;
  if (d === "hard") return pc.magenta;
  return pc.red;
}

/** Título de sección: texto en negrita seguido de una regla que llena el ancho. */
export function heading(text: string, width = 72): string {
  const relleno = Math.max(0, width - text.length - 1); // -1 por el espacio separador
  return pc.bold(text) + " " + pc.dim("─".repeat(relleno));
}

/** Barra de avance de la sesión (solo posición: no dice nada de tu acierto). */
export function progressBar(done: number, total: number, width = 18): string {
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return pc.cyan("▓".repeat(filled)) + pc.dim("░".repeat(width - filled));
}

/**
 * Cabecera de una pregunta: dónde estás, de qué va y cuánto pesa. Va en tenue y
 * en cian para que el enunciado (negrita, color por defecto) destaque encima.
 */
export function questionHeader(
  index: number,
  total: number,
  dimension: string,
  subtopic: string | undefined,
  difficulty: Difficulty,
): string {
  const posicion = pc.dim(`Pregunta ${index}/${total}`);
  const barra = progressBar(index - 1, total);
  const partes = [
    pc.cyan(dimension),
    subtopic ? pc.dim(subtopic) : null,
    difficultyColor(difficulty)(DIFFICULTY_LABEL[difficulty]),
  ]
    .filter((p): p is string => p !== null)
    .join(pc.dim(" · "));

  return `${posicion}  ${barra}\n  ${partes}`;
}

/**
 * Tema de `@inquirer/prompts` para la sesión. El mensaje NO se recolorea (se
 * compone ya vestido en el runner) y la opción bajo el cursor va en cian y
 * negrita: el contraste entre pregunta y respuestas es el que faltaba.
 */
export const promptTheme = {
  prefix: pc.dim("›"),
  icon: { cursor: "❯" },
  style: {
    message: (text: string): string => text,
    highlight: (text: string): string => pc.bold(pc.cyan(text)),
    help: (text: string): string => pc.dim(text),
    answer: (text: string): string => pc.cyan(text),
  },
};

/**
 * Igual, pero sin prefijo: la pregunta ya trae su propia cabecera y un `›`
 * delante solo desalinea el bloque.
 */
export const questionTheme = { ...promptTheme, prefix: "" };
