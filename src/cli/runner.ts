import { select } from "@inquirer/prompts";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "../core/scoring.js";
import {
  answerCurrent,
  buildSession,
  goBack,
  goForward,
  isComplete,
  toAnswered,
  type SessionState,
} from "../core/session.js";

const BACK = "__back__";

/**
 * Runner interactivo `select` navegable. NO reimplementa la máquina de estados:
 * envuelve las transiciones puras de `src/core/session.ts` con prompts de I/O.
 * `@inquirer/prompts` no tiene "volver atrás" nativo, así que se ofrece una
 * choice especial `◀ Volver` (visible solo si `index > 0`) y se usa `default`
 * (el `value` de la opción ya elegida, no un índice) para reposicionar el cursor
 * al revisitar una pregunta.
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

      state = goForward(answerCurrent(state, answer));
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
