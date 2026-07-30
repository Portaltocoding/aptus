import { confirm, select } from "@inquirer/prompts";
import pc from "picocolors";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion, Confidence } from "../core/scoring.js";
import { promptTheme, questionHeader, questionTheme } from "./theme.js";
import { ESCAPED, ESC_HINT, withEscape } from "./keys.js";
import {
  BACK,
  answerDefault,
  answeredCount,
  backAvailable,
  confidenceDefault,
  currentQuestion,
  exitWarning,
  flowResult,
  initialFlow,
  isFinished,
  stepFlow,
  type FlowInput,
  type FlowState,
} from "./session-flow.js";

const CONFIDENCE_CHOICES: { value: Confidence; name: string; description: string }[] = [
  { value: "alta", name: "Alta", description: "Estoy muy seguro — sé por qué es esa" },
  { value: "media", name: "Media", description: "Creo que sí, pero no la firmaría" },
  { value: "baja", name: "Baja", description: "Voy a medias / estoy adivinando" },
];

/** Pregunta actual con sus opciones y, si hay adónde volver, la choice `◀ Volver`. */
async function preguntar(state: FlowState): Promise<FlowInput> {
  const q = currentQuestion(state)!;
  const choices = [
    ...q.options.map((o) => ({ value: o.id, name: o.text })),
    ...(backAvailable(state) ? [{ value: BACK, name: pc.dim("◀ Volver a la pregunta anterior") }] : []),
  ];

  const cabecera = questionHeader(
    state.session.index + 1,
    state.session.questions.length,
    q.dimension,
    q.subtopic,
    q.difficulty,
  );

  const answer = await withEscape((signal) =>
    select(
      {
        // Cabecera tenue, enunciado en negrita, opciones en color normal: los
        // tres niveles se distinguen de un vistazo sin leer nada.
        message: `${cabecera}\n\n  ${pc.bold(q.stem)}\n`,
        choices,
        default: answerDefault(state), // reposiciona el cursor si ya se respondió
        theme: questionTheme,
        pageSize: 10,
      },
      { signal },
    ),
  );

  if (answer === ESCAPED) return { tipo: "escape" };
  if (answer === BACK) return { tipo: "volver" };
  return { tipo: "respuesta", optionId: answer };
}

async function preguntarConfianza(state: FlowState): Promise<FlowInput> {
  const valor = await withEscape((signal) =>
    select(
      {
        message:
          pc.dim("  ¿Cómo de seguro estás de tu respuesta?") +
          pc.dim(`  (${ESC_HINT} a la pregunta)`),
        choices: CONFIDENCE_CHOICES,
        default: confidenceDefault(state),
        theme: promptTheme,
      },
      { signal },
    ),
  );

  return valor === ESCAPED ? { tipo: "escape" } : { tipo: "confianza", valor };
}

async function confirmarSalida(state: FlowState): Promise<FlowInput> {
  const salir = await confirm({
    message: pc.yellow(`  ${exitWarning(answeredCount(state))}`),
    default: false,
    theme: promptTheme,
  });

  return { tipo: "confirmacion", salir };
}

/**
 * Runner interactivo `select` navegable. Capa fina de I/O: NO decide nada.
 * Traduce prompts de `@inquirer/prompts` a entradas de `./session-flow.ts`, que es
 * quien tiene la lógica de navegación (avanzar, volver, ESC, abandono) en funciones
 * puras testeables sin terminal, y que a su vez envuelve las transiciones del motor
 * puro `src/core/session.ts`.
 *
 * La presentación (cabecera, colores, cursor) vive en `./theme.ts`: aquí solo se
 * compone. Las opciones llegan ya barajadas desde la composición (`shuffleOptions`),
 * no se reordenan aquí, para que "volver atrás" enseñe siempre el mismo orden que
 * la primera vez.
 *
 * Devuelve `null` si se abandona la sesión con ESC: quien compone decide qué hacer
 * con eso (volver al menú), pero NADA se puntúa ni se guarda.
 */
export async function runSession(questions: Question[]): Promise<AnsweredQuestion[] | null> {
  let state = initialFlow(questions);

  try {
    while (!isFinished(state)) {
      let input: FlowInput;
      switch (state.step) {
        case "pregunta":
          input = await preguntar(state);
          break;
        case "confianza":
          input = await preguntarConfianza(state);
          break;
        default:
          input = await confirmarSalida(state);
      }
      state = stepFlow(state, input);
    }
  } catch (err) {
    // Ctrl+C: salida limpia, sin persistir nada a medias ni imprimir stack trace.
    if (err instanceof Error && err.name === "ExitPromptError") {
      console.log("\nSesión cancelada. No se ha guardado ningún resultado.");
      process.exit(0);
    }
    throw err;
  }

  return flowResult(state);
}
