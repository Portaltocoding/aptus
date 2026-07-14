import { select } from "@inquirer/prompts";
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

const BACK = "__back__";

const CONFIDENCE_CHOICES: { value: Confidence; name: string }[] = [
  { value: "alta", name: "Alta — estoy muy seguro" },
  { value: "media", name: "Media — creo que sí" },
  { value: "baja", name: "Baja — voy a medias / adivinando" },
];

/**
 * Runner interactivo `select` navegable. NO reimplementa la máquina de estados:
 * envuelve las transiciones puras de `src/core/session.ts` con prompts de I/O.
 * Tras elegir respuesta se captura la confianza declarada (SESS-03) con un
 * segundo `select`, sin romper el flujo. `@inquirer/prompts` no tiene "volver
 * atrás" nativo, así que se ofrece una choice `◀ Volver` (visible solo si
 * `index > 0`) y se usa `default` (un value) para reposicionar el cursor.
 */
export async function runSession(questions: Question[]): Promise<AnsweredQuestion[]> {
  let state: SessionState = buildSession(questions);

  try {
    while (!isComplete(state)) {
      const q = state.questions[state.index]!;
      const choices = [
        ...q.options.map((o) => ({ value: o.id, name: o.text })),
        ...(state.index > 0 ? [{ value: BACK, name: "◀ Volver a la pregunta anterior" }] : []),
      ];

      const answer = await select({
        message: `Pregunta ${state.index + 1} de ${state.questions.length} [${q.dimension}]\n${q.stem}`,
        choices,
        default: state.answers.get(q.id), // reposiciona el cursor si ya se respondió
      });

      if (answer === BACK) {
        state = goBack(state);
        continue;
      }

      const confidence = await select({
        message: "¿Cómo de seguro estás de tu respuesta?",
        choices: CONFIDENCE_CHOICES,
        default: state.confidences.get(q.id),
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
