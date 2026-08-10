import type { Question } from "../content/schema.js";
import type { AnsweredQuestion, Confidence } from "../core/scoring.js";
import {
  answerCurrent,
  answeredSoFar,
  buildSession,
  goBack,
  goForward,
  isComplete,
  restoreSession,
  setConfidenceCurrent,
  snapshotSession,
  toAnswered,
  type SessionSnapshot,
  type SessionState,
} from "../core/session.js";

/**
 * Lógica de navegación de una sesión interactiva: PURA, pero de la capa CLI.
 *
 * ¿Por qué aquí y no en `src/core/session.ts`? Porque esto sabe de ESC, de
 * "◀ Volver" y de una confirmación antes de tirar lo respondido — todo eso son
 * conceptos de INTERFAZ, no del motor. `src/core/` es agnóstico de la UI: sabe de
 * índices, respuestas y confianzas, y debe seguir sabiendo solo eso para que otra
 * interfaz (web, batch) lo reutilice sin arrastrar el vocabulario de un terminal.
 *
 * Y ¿por qué separado de `runner.ts`? Porque la decisión ("ante esta entrada, ¿qué
 * pantalla toca y qué se registra?") estaba enredada con los prompts de inquirer, y
 * eso la hacía intesteable sin terminal. Aquí no se lee ni se escribe nada: entra un
 * estado y una entrada, sale un estado. El runner queda como traductor de prompts a
 * estas entradas.
 */

/** Valor de la choice "◀ Volver". No es un id de opción: se distingue por prefijo. */
export const BACK = "__back__";

/** En qué pantalla está la sesión. */
export type FlowStep =
  | "pregunta" // eligiendo respuesta
  | "confianza" // respuesta elegida, declarando cómo de seguro
  | "salida" // ESC en la pregunta: decidiendo qué hacer con la sesión
  | "terminada" // todas las preguntas recorridas
  | "parcial" // cortada a propósito: se evalúa lo respondido hasta aquí
  | "pausada" // cortada a propósito: se guarda dónde vas para retomarla
  | "abandonada"; // salida confirmada: no se puntúa ni se guarda nada

/** Qué se ha decidido en el menú de salida. */
export type ExitChoice =
  | "seguir" // volver a la misma pregunta, con todo intacto
  | "terminar" // evaluar aquí mismo lo respondido
  | "pausar" // guardar dónde vas y seguir otro día
  | "descartar"; // salir sin puntuar ni guardar nada

export interface FlowState {
  readonly session: SessionState;
  readonly step: FlowStep;
  /**
   * Respuesta elegida pero AÚN NO registrada, a la espera de la confianza. Vive
   * fuera de `session` a propósito: si se sale con ESC de la confianza, la respuesta
   * no debe haber dejado rastro.
   */
  readonly pendiente: string | null;
}

/** Lo que puede llegar desde la pantalla actual. */
export type FlowInput =
  | { readonly tipo: "respuesta"; readonly optionId: string }
  | { readonly tipo: "volver" }
  | { readonly tipo: "escape" }
  | { readonly tipo: "confianza"; readonly valor: Confidence }
  | { readonly tipo: "salida"; readonly eleccion: ExitChoice };

/**
 * Arranca la sesión. Con `previo` se REANUDA una sesión pausada: mismas preguntas
 * (ya reordenadas por quien las recuperó del disco), mismas respuestas y el cursor
 * donde se dejó.
 */
export function initialFlow(questions: Question[], previo?: SessionSnapshot | null): FlowState {
  const session = previo != null ? restoreSession(questions, previo) : buildSession(questions);
  // Un banco vacío no debe abrir un prompt sobre la nada. Y una sesión pausada
  // justo en la última pregunta se reanuda ya terminada, no fuera de rango.
  return { session, step: isComplete(session) ? "terminada" : "pregunta", pendiente: null };
}

/** La sesión ya no espera nada del usuario. */
export function isFinished(state: FlowState): boolean {
  return (
    state.step === "terminada" ||
    state.step === "parcial" ||
    state.step === "pausada" ||
    state.step === "abandonada"
  );
}

export function currentQuestion(state: FlowState): Question | null {
  return state.session.questions[state.session.index] ?? null;
}

/**
 * "◀ Volver" solo se ofrece si hay adónde volver. Mostrarlo en la primera
 * pregunta sería una opción que no hace nada.
 */
export function backAvailable(state: FlowState): boolean {
  return state.session.index > 0;
}

/**
 * Values de las choices de la pregunta actual, en el ORDEN EN QUE LLEGAN. No se
 * baraja aquí: las opciones vienen ya barajadas desde la composición
 * (`shuffleOptions`), y rebarajar haría que volver atrás enseñara otro orden.
 */
export function questionChoiceValues(state: FlowState): string[] {
  const q = currentQuestion(state);
  if (!q) return [];
  const values = q.options.map((o) => o.id);
  return backAvailable(state) ? [...values, BACK] : values;
}

/** Respuesta ya registrada de la pregunta actual, para reposicionar el cursor. */
export function answerDefault(state: FlowState): string | undefined {
  const q = currentQuestion(state);
  return q ? state.session.answers.get(q.id) : undefined;
}

/** Confianza ya registrada de la pregunta actual, para reposicionar el cursor. */
export function confidenceDefault(state: FlowState): Confidence | undefined {
  const q = currentQuestion(state);
  return q ? state.session.confidences.get(q.id) : undefined;
}

/**
 * Encabezado del menú de salida. El número importa: sin él, decidir qué hacer con
 * la sesión es decidir a ciegas, y con 0 respondidas hablar de lo que se pierde
 * sería ruido.
 */
export function exitWarning(respondidas: number): string {
  if (respondidas === 0) return "¿Salir de la sesión? Todavía no has respondido nada.";
  if (respondidas === 1) return "¿Qué hago con la sesión? Llevas 1 respuesta.";
  return `¿Qué hago con la sesión? Llevas ${respondidas} respuestas.`;
}

/** Una opción del menú de salida, tal cual la pinta el runner. */
export interface ExitOption {
  readonly value: ExitChoice;
  readonly name: string;
  readonly description: string;
}

/**
 * Las salidas que se ofrecen, en orden. PURA y aquí (y no en el runner) porque
 * QUÉ se puede hacer con una sesión a medias es una decisión, no un formato.
 *
 * Dos reglas:
 * - Sin ninguna respuesta no se ofrece ni terminar ni pausar: no hay nada que
 *   puntuar ni nada que retomar, y ofrecerlo sería prometer un resultado vacío.
 * - `pausable` lo decide quien compone: una sesión de medida se retoma con
 *   `aptus resume`, pero un repaso no (sus cajas se mueven al terminar la tanda,
 *   así que dejarlo a medias en disco no tendría a dónde volver).
 */
export function exitChoices(respondidas: number, pausable: boolean): ExitOption[] {
  const opciones: ExitOption[] = [
    {
      value: "seguir",
      name: "Seguir respondiendo",
      description: "vuelves a la misma pregunta, con todo lo respondido intacto",
    },
  ];

  if (respondidas > 0) {
    opciones.push({
      value: "terminar",
      name: "Terminar aquí y evaluar",
      description:
        respondidas === 1
          ? "puntúa la respuesta que llevas y guarda la sesión; lo que no has visto no cuenta"
          : `puntúa las ${respondidas} que llevas y guarda la sesión; lo que no has visto no cuenta`,
    });
    if (pausable) {
      opciones.push({
        value: "pausar",
        name: "Pausar y seguir en otro momento",
        description: "se guarda dónde vas; se retoma con `aptus resume` o desde el menú",
      });
    }
  }

  opciones.push({
    value: "descartar",
    name: "Salir y descartar",
    description: "no se puntúa ni se guarda nada de esta sesión",
  });

  return opciones;
}

/** Cuántas respuestas se perderían al abandonar ahora mismo. */
export function answeredCount(state: FlowState): number {
  return state.session.answers.size;
}

/**
 * Transición pura: estado + entrada → estado. Una entrada que no corresponde a la
 * pantalla actual se ignora (devuelve el mismo estado) en vez de lanzar: el runner
 * no puede producirlas, y tragárselas es preferible a tirar una sesión a medias por
 * un desajuste de composición.
 */
export function stepFlow(state: FlowState, input: FlowInput): FlowState {
  switch (state.step) {
    case "pregunta":
      return desdePregunta(state, input);
    case "confianza":
      return desdeConfianza(state, input);
    case "salida":
      return desdeSalida(state, input);
    default:
      return state; // terminada / parcial / pausada / abandonada: no hay vuelta atrás
  }
}

function desdePregunta(state: FlowState, input: FlowInput): FlowState {
  switch (input.tipo) {
    case "respuesta":
      // No se registra todavía: primero la confianza (ver `pendiente`).
      return { ...state, step: "confianza", pendiente: input.optionId };
    case "volver":
      return { ...state, session: goBack(state.session), pendiente: null };
    case "escape":
      // ESC en la pregunta = "quiero irme", pero se pregunta antes: sin ese menú
      // un ESC de más borraría todo lo respondido y no hay forma de recuperarlo.
      // Y de paso es donde se decide SI irse es tirarlo, evaluarlo o guardarlo.
      return { ...state, step: "salida", pendiente: null };
    default:
      return state;
  }
}

function desdeConfianza(state: FlowState, input: FlowInput): FlowState {
  switch (input.tipo) {
    case "escape":
      // Aquí ESC significa "me he equivocado de respuesta": se vuelve a la pregunta
      // y la respuesta pendiente se descarta sin registrarse.
      return { ...state, step: "pregunta", pendiente: null };
    case "confianza": {
      if (state.pendiente === null) return state;
      const conRespuesta = answerCurrent(state.session, state.pendiente);
      const session = goForward(setConfidenceCurrent(conRespuesta, input.valor));
      return {
        session,
        step: isComplete(session) ? "terminada" : "pregunta",
        pendiente: null,
      };
    }
    default:
      return state;
  }
}

function desdeSalida(state: FlowState, input: FlowInput): FlowState {
  if (input.tipo !== "salida") return state;

  switch (input.eleccion) {
    case "seguir":
      // Vuelve a la MISMA pregunta, con todo lo respondido intacto.
      return { ...state, step: "pregunta" };
    case "descartar":
      return { ...state, step: "abandonada" };
    case "pausar":
      return { ...state, step: "pausada" };
    case "terminar":
      // Terminar sin haber respondido nada no es una sesión de 0 preguntas: es
      // haberse ido. Se trata como abandono para no guardar un registro vacío que
      // luego apareciera en el historial y en la evolución.
      return { ...state, step: state.session.answers.size > 0 ? "parcial" : "abandonada" };
  }
}

/**
 * Cómo ha acabado la sesión y con qué se queda quien compone.
 *
 * `completada` y `parcial` se distinguen porque no significan lo mismo: la segunda
 * mide una muestra más pequeña de la que se seleccionó, y eso hay que decirlo en
 * pantalla en vez de dejar que un N pequeño lo insinúe.
 */
export type FlowOutcome =
  | {
      readonly tipo: "completada";
      readonly questions: Question[];
      readonly answered: AnsweredQuestion[];
    }
  | {
      readonly tipo: "parcial";
      readonly questions: Question[];
      readonly answered: AnsweredQuestion[];
    }
  | { readonly tipo: "pausada"; readonly snapshot: SessionSnapshot }
  | { readonly tipo: "abandonada" };

export function flowOutcome(state: FlowState): FlowOutcome {
  switch (state.step) {
    case "abandonada":
      return { tipo: "abandonada" };
    case "pausada":
      return { tipo: "pausada", snapshot: snapshotSession(state.session) };
    case "parcial": {
      // Solo lo respondido: puntuar 12 respuestas contra las 120 seleccionadas
      // hundiría cada dimensión con preguntas que nunca se llegaron a enseñar.
      const { questions, answered } = answeredSoFar(state.session);
      return { tipo: "parcial", questions, answered };
    }
    default:
      return {
        tipo: "completada",
        questions: state.session.questions,
        answered: toAnswered(state.session),
      };
  }
}
