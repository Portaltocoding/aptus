import { isMeasurement, type SessionKind, type SessionRecord } from "./evolution.js";

/**
 * Borrado de sesiones del historial (PERS-03), puro y sin I/O: entra el historial
 * cargado y sale el que habría que guardar. Cargar, confirmar y escribir es cosa
 * de la capa de arriba.
 *
 * Por qué está separado: borrar es la única operación de aptus que DESTRUYE
 * evidencia, y no hay copia de seguridad de la que tirar. Que el "qué se borra"
 * sea una función pura significa que se puede probar exhaustivamente —el índice
 * fuera de rango, el historial de una sola sesión, la que rompe la evolución— sin
 * arriesgar un fichero real en ningún test.
 *
 * Se identifica por POSICIÓN y no por timestamp a propósito: dos sesiones podrían
 * compartir marca de tiempo (dos repasos seguidos en el mismo segundo), y borrar
 * "la del 3 de enero" cuando hay dos sería una ambigüedad resuelta a cara o cruz.
 * La posición viene del mismo historial que se acaba de listar, así que no puede
 * apuntar a otra cosa.
 */

export interface SessionSummary {
  /** Posición en el historial tal y como está guardado. Es el identificador. */
  index: number;
  timestamp: string;
  kind: SessionKind;
  /** Respondidas y acertadas, sumando dimensiones. */
  answered: number;
  correct: number;
  dimensions: number;
  /** Niveles de readiness que dejó esa sesión, para reconocerla de un vistazo. */
  readiness: string[];
}

/**
 * Una línea por sesión para poder elegir cuál se borra: fecha, tipo y qué salió.
 *
 * A propósito NO lleva un porcentaje global. No es prudencia decorativa: un número
 * único agregado es justo lo que este proyecto no muestra en ningún sitio, y no va
 * a colarse por la puerta de atrás en un selector. Con la fecha, el tipo y los
 * aciertos crudos ya se distingue una sesión de otra, que es para lo único que
 * está esta lista.
 */
export function summarizeSessions(history: readonly SessionRecord[]): SessionSummary[] {
  return history.map((s, index) => ({
    index,
    timestamp: s.timestamp,
    kind: isMeasurement(s) ? "measure" : "review",
    answered: s.byDimension.reduce((n, d) => n + d.answered, 0),
    correct: s.byDimension.reduce((n, d) => n + d.correct, 0),
    dimensions: s.byDimension.length,
    readiness: s.readiness.map((r) => `${r.label}: ${r.levelLabel}`),
  }));
}

/** Lo que deja un borrado: el historial que hay que guardar y qué se ha ido. */
export interface Deletion {
  history: SessionRecord[];
  deleted: SessionSummary;
  /** ¿Se ha borrado la última MEDICIÓN? Entonces el "ahora" de la evolución cambia. */
  cambiaLaEvolucion: boolean;
}

/**
 * Quita la sesión que está en esa posición. Devuelve `null` si la posición no
 * existe: un índice inventado no puede borrar "la que más se le parezca".
 *
 * No muta el historial que recibe — quien llama sigue teniendo el de antes hasta
 * que decida escribir, que es lo que permite confirmar sin haber roto nada.
 */
export function deleteSessionAt(history: readonly SessionRecord[], index: number): Deletion | null {
  if (!Number.isInteger(index) || index < 0 || index >= history.length) return null;

  const resumen = summarizeSessions(history);
  const antes = ultimaMedicion(history);
  const restante = history.filter((_, i) => i !== index);

  return {
    history: restante,
    deleted: resumen[index]!,
    cambiaLaEvolucion: antes !== null && antes !== ultimaMedicion(restante),
  };
}

/** Timestamp de la última medición, que es el "ahora" contra el que compara todo. */
function ultimaMedicion(history: readonly SessionRecord[]): string | null {
  const medidas = history.filter(isMeasurement);
  return medidas.length === 0 ? null : medidas[medidas.length - 1]!.timestamp;
}
