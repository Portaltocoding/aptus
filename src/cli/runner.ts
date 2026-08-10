import { select } from "@inquirer/prompts";
import pc from "picocolors";
import type { Question } from "../content/schema.js";
import type { Confidence } from "../core/scoring.js";
import type { SessionSnapshot } from "../core/session.js";
import {
  optionNote,
  promptTheme,
  questionHeader,
  questionStem,
  questionTheme,
  termWidth,
} from "./theme.js";
import { ESCAPED, ESC_HINT, withEscape } from "./keys.js";
import {
  BACK,
  answerDefault,
  answeredCount,
  backAvailable,
  confidenceDefault,
  currentQuestion,
  exitChoices,
  exitWarning,
  flowOutcome,
  initialFlow,
  isFinished,
  stepFlow,
  type FlowInput,
  type FlowOutcome,
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
  const ancho = termWidth();
  const choices = [
    ...q.options.map((o) => ({
      value: o.id,
      name: o.text,
      // El apunte de la opción: sale al poner el cursor encima, y solo si el pack
      // lo trae. Sin `rationale` no se enseña nada — antes que inventar un margen
      // vacío, ninguno. Un `rationale: ""` en el YAML cuenta como no traerlo: si
      // no, dibujaría una barra sobre la nada.
      description:
        o.rationale !== undefined && o.rationale.trim().length > 0
          ? optionNote(o.rationale, ancho)
          : undefined,
    })),
    ...(backAvailable(state)
      ? [{ value: BACK, name: pc.dim("◀ Volver a la pregunta anterior"), description: undefined }]
      : []),
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
        // Tres niveles y tres colores: cabecera tenue, enunciado en cian y
        // negrita, opciones en el color por defecto (y en amarillo la que estás
        // mirando). El aire —línea en blanco antes de la cabecera y dos entre el
        // enunciado y las opciones— es parte del mensaje: sin él, pregunta y
        // respuestas se leen como un único bloque de texto, y una pregunta y la
        // siguiente se pegan la una a la otra en el scroll.
        message: `\n${cabecera}\n\n${questionStem(q.stem, q.type, ancho)}\n\n`,
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
  // El aire va FUERA del mensaje: estos prompts llevan el prefijo `›` en la misma
  // línea, y un salto dentro del mensaje deja el prefijo solo, colgando arriba.
  console.log("");
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

/**
 * El menú de salida: qué hacer con una sesión a medias. Antes era un sí/no que
 * solo sabía tirarla; ahora puedes cortarla en la pregunta que sea y evaluar lo
 * que llevas, o guardarla para otro día. ESC aquí es "seguir": salir del menú de
 * salida no puede ser una forma de perderlo todo.
 */
async function preguntarSalida(state: FlowState, pausable: boolean): Promise<FlowInput> {
  console.log("");
  const eleccion = await withEscape((signal) =>
    select(
      {
        message:
          pc.bold(pc.yellow(`  ${exitWarning(answeredCount(state))}`)) +
          pc.dim(`  (${ESC_HINT} y sigues)`),
        choices: exitChoices(answeredCount(state), pausable),
        theme: promptTheme,
      },
      { signal },
    ),
  );

  return { tipo: "salida", eleccion: eleccion === ESCAPED ? "seguir" : eleccion };
}

export interface RunSessionOptions {
  /**
   * ¿Se puede dejar en pausa? Solo lo es si quien compone sabe guardar la foto y
   * retomarla (hoy: las sesiones de medida, no los repasos).
   */
  pausable?: boolean;
  /** Foto de una sesión pausada que se está retomando. */
  resume?: SessionSnapshot | null;
}

/**
 * Runner interactivo `select` navegable. Capa fina de I/O: NO decide nada.
 * Traduce prompts de `@inquirer/prompts` a entradas de `./session-flow.ts`, que es
 * quien tiene la lógica de navegación (avanzar, volver, ESC, pausa, abandono) en
 * funciones puras testeables sin terminal, y que a su vez envuelve las
 * transiciones del motor puro `src/core/session.ts`.
 *
 * La presentación (cabecera, enunciado, colores, apuntes) vive en `./theme.ts`:
 * aquí solo se compone. Las opciones llegan ya barajadas desde la composición
 * (`shuffleOptions`), no se reordenan aquí, para que "volver atrás" enseñe siempre
 * el mismo orden que la primera vez.
 *
 * Devuelve CÓMO acabó (completada, cortada a medias, pausada o abandonada) en vez
 * de solo las respuestas: quien compone tiene que poder distinguir "esto se mide"
 * de "esto se guarda para luego" de "esto no ha pasado".
 */
export async function runSession(
  questions: Question[],
  opts: RunSessionOptions = {},
): Promise<FlowOutcome> {
  const pausable = opts.pausable === true;
  let state = initialFlow(questions, opts.resume ?? null);

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
          input = await preguntarSalida(state, pausable);
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

  return flowOutcome(state);
}
