import { select } from "@inquirer/prompts";
import pc from "picocolors";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion, Confidence } from "../core/scoring.js";
import {
  answerCurrent,
  buildSession,
  goBack,
  goForward,
  isComplete,
  setConfidenceCurrent,
  toAnswered,
  type SessionState,
} from "../core/session.js";
import { promptTheme, questionHeader, questionTheme } from "./theme.js";

const BACK = "__back__";

const CONFIDENCE_CHOICES: { value: Confidence; name: string; description: string }[] = [
  { value: "alta", name: "Alta", description: "Estoy muy seguro — sé por qué es esa" },
  { value: "media", name: "Media", description: "Creo que sí, pero no la firmaría" },
  { value: "baja", name: "Baja", description: "Voy a medias / estoy adivinando" },
];

/**
 * Runner interactivo `select` navegable. NO reimplementa la máquina de estados:
 * envuelve las transiciones puras de `src/core/session.ts` con prompts de I/O.
 * Tras elegir respuesta se captura la confianza declarada (SESS-03) con un
 * segundo `select`, sin romper el flujo. `@inquirer/prompts` no tiene "volver
 * atrás" nativo, así que se ofrece una choice `◀ Volver` (visible solo si
 * `index > 0`) y se usa `default` (un value) para reposicionar el cursor.
 *
 * La presentación (cabecera, colores, cursor) vive en `./theme.ts`: aquí solo se
 * compone. Las opciones llegan ya barajadas desde la composición (`shuffleOptions`),
 * no se reordenan aquí, para que "volver atrás" enseñe siempre el mismo orden que
 * la primera vez.
 */
export async function runSession(questions: Question[]): Promise<AnsweredQuestion[]> {
  let state: SessionState = buildSession(questions);

  try {
    while (!isComplete(state)) {
      const q = state.questions[state.index]!;
      const choices = [
        ...q.options.map((o) => ({ value: o.id, name: o.text })),
        ...(state.index > 0
          ? [{ value: BACK, name: pc.dim("◀ Volver a la pregunta anterior") }]
          : []),
      ];

      const cabecera = questionHeader(
        state.index + 1,
        state.questions.length,
        q.dimension,
        q.subtopic,
        q.difficulty,
      );

      const answer = await select({
        // Cabecera tenue, enunciado en negrita, opciones en color normal: los tres
        // niveles se distinguen de un vistazo sin leer nada.
        message: `${cabecera}\n\n  ${pc.bold(q.stem)}\n`,
        choices,
        default: state.answers.get(q.id), // reposiciona el cursor si ya se respondió
        theme: questionTheme,
        pageSize: 10,
      });

      if (answer === BACK) {
        state = goBack(state);
        continue;
      }

      const confidence = await select({
        message: pc.dim("  ¿Cómo de seguro estás de tu respuesta?"),
        choices: CONFIDENCE_CHOICES,
        default: state.confidences.get(q.id),
        theme: promptTheme,
      });

      state = goForward(setConfidenceCurrent(answerCurrent(state, answer), confidence));
    }
  } catch (err) {
    // Ctrl+C: salida limpia, sin persistir nada a medias ni imprimir stack trace.
    if (err instanceof Error && err.name === "ExitPromptError") {
      console.log("\nSesión cancelada. No se ha guardado ningún resultado.");
      process.exit(0);
    }
    throw err;
  }

  return toAnswered(state);
}
