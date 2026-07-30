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
  | "confirmar-salida" // ESC en la pregunta: confirmando antes de tirarlo todo
  | "terminada" // todas las preguntas recorridas
  | "abandonada"; // salida confirmada: no se puntúa ni se guarda nada

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
  | { readonly tipo: "confirmacion"; readonly salir: boolean };

export function initialFlow(questions: Question[]): FlowState {
  const session = buildSession(questions);
  // Un banco vacío no debe abrir un prompt sobre la nada.
  return { session, step: isComplete(session) ? "terminada" : "pregunta", pendiente: null };
}

/** La sesión ya no espera nada del usuario: o se completó o se abandonó. */
export function isFinished(state: FlowState): boolean {
  return state.step === "terminada" || state.step === "abandonada";
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
 * Aviso de la confirmación de salida. El número importa: decirle "se pierden las
 * respuestas" a quien no ha contestado ninguna es ruido, y no decir cuántas se
 * pierden convierte la confirmación en un trámite que se acepta sin leer.
 */
export function exitWarning(respondidas: number): string {
  if (respondidas === 0) return "¿Salir de la sesión?";
  if (respondidas === 1) return "¿Salir de la sesión? Se pierde la respuesta que llevas.";
  return `¿Salir de la sesión? Se pierden las ${respondidas} respuestas que llevas.`;
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
    case "confirmar-salida":
      return desdeConfirmacion(state, input);
    default:
      return state; // terminada / abandonada: no hay vuelta atrás
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
      // ESC en la pregunta = "quiero irme", pero se pregunta antes: sin confirmación
      // un ESC de más borraría todo lo respondido y no hay forma de recuperarlo.
      return { ...state, step: "confirmar-salida", pendiente: null };
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

function desdeConfirmacion(state: FlowState, input: FlowInput): FlowState {
  if (input.tipo !== "confirmacion") return state;
  // Decir que no devuelve a la MISMA pregunta, con todo lo respondido intacto.
  return { ...state, step: input.salir ? "abandonada" : "pregunta" };
}

/**
 * Resultado de la sesión: `null` si se abandonó — quien compone decide qué hacer con
 * eso (volver al menú), pero NADA se puntúa ni se guarda.
 */
export function flowResult(state: FlowState): AnsweredQuestion[] | null {
  if (state.step === "abandonada") return null;
  return toAnswered(state.session);
}
