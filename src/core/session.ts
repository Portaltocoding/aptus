import type { Question } from "../content/schema.js";
import type { AnsweredQuestion, Confidence } from "./scoring.js";

/**
 * Motor de sesión puro: selección equilibrada por dimensión (SESS-02) y
 * estado de sesión navegable (base de SESS-01). Sin I/O, sin generador
 * aleatorio propio: toda la aleatoriedad se inyecta vía `ShuffleFn` desde
 * fuera (ver `src/core/random.ts`, `makeSeededShuffle`) para que el motor
 * sea determinista y testeable con fixtures.
 */

export type ShuffleFn = <T>(items: T[]) => T[];

export type Difficulty = Question["difficulty"];

/** Qué acota la sesión: subconjunto de dimensiones y/o de tramos de dificultad. */
export interface QuestionFilter {
  dimensions?: readonly string[] | null; // null/vacío = todas
  difficulties?: readonly Difficulty[] | null; // null/vacío = todos los tramos
}

/**
 * Acota el banco a lo que se va a evaluar (dimensiones y tramos de dificultad).
 * Un filtro vacío o nulo no filtra nada. NO garantiza que quede material
 * suficiente: si el cruce deja el banco vacío devuelve una lista vacía, y avisar
 * de eso es responsabilidad de la composición, no de esta función pura.
 */
export function filterQuestions(bank: Question[], filter: QuestionFilter): Question[] {
  const dims =
    filter.dimensions && filter.dimensions.length > 0 ? new Set(filter.dimensions) : null;
  const diffs =
    filter.difficulties && filter.difficulties.length > 0 ? new Set(filter.difficulties) : null;

  return bank.filter(
    (q) => (dims === null || dims.has(q.dimension)) && (diffs === null || diffs.has(q.difficulty)),
  );
}

/**
 * Baraja el ORDEN DE PRESENTACIÓN de las opciones de cada pregunta.
 *
 * Existe porque el banco tiene un sesgo posicional brutal —al escribir preguntas
 * a mano la correcta acaba casi siempre la primera— y un test cuya respuesta se
 * adivina por posición no mide nada. Se baraja al presentar, no en el YAML: así
 * el sesgo queda neutralizado en CUALQUIER pack, presente o futuro, sin depender
 * de la disciplina de quien lo escriba.
 *
 * `option.id` y `correct` NO se tocan: el scoring, el historial y el repaso
 * siguen hablando de ids, así que reordenar aquí es puramente cosmético y las
 * sesiones antiguas siguen siendo comparables.
 */
export function shuffleOptions(questions: Question[], shuffle: ShuffleFn): Question[] {
  return questions.map((q) => ({ ...q, options: shuffle(q.options) }));
}

const TIER_ORDER: Difficulty[] = ["easy", "medium", "hard", "experto"];

/**
 * Ordena un pool alternando dificultades (una fácil, una media, una difícil, una
 * experto, y vuelta a empezar) para que al cortarlo por `take` salgan los cuatro
 * tramos, no la mezcla que traiga el banco.
 *
 * Existe porque el nivel de readiness se decide POR TRAMO de dificultad, y en un
 * banco donde solo el 11% de las preguntas son fáciles, una sesión de 20 traía
 * unas dos: el veredicto entero pasaba a depender de dos preguntas, y con menos
 * evidencia el motor —con razón— se negaba a conceder nada. El desequilibrio no
 * estaba en el juicio sino en la muestra que le llegaba.
 *
 * No fuerza cuotas: si un tramo se agota, sigue con los demás. Reparte lo que hay.
 *
 * `offset` rota por dónde empieza la ronda. Es imprescindible: sin rotar, una
 * sesión corta que solo coge 1 pregunta por dimensión cogía la fácil SIEMPRE, y
 * el reparto quedaba peor que antes. Rotando por dimensión, lo que en una empieza
 * por fácil en la siguiente empieza por media, y el total sale repartido.
 */
function interleaveByDifficulty(pool: Question[], offset: number): Question[] {
  const orden = TIER_ORDER.map((_, i) => TIER_ORDER[(i + offset) % TIER_ORDER.length]!);
  const buckets = orden.map((d) => pool.filter((q) => q.difficulty === d));
  const resto = pool.filter((q) => !TIER_ORDER.includes(q.difficulty));
  const salida: Question[] = [];

  for (let i = 0; salida.length < pool.length - resto.length; i++) {
    for (const bucket of buckets) {
      const q = bucket[i];
      if (q !== undefined) salida.push(q);
    }
  }
  return [...salida, ...resto];
}

/**
 * Reparte preguntas por dimensión con un mínimo garantizado cuando el
 * pool lo permite. Si `pool.length < minPerDimension` para alguna
 * dimensión, NO lanza: toma todo lo disponible (responsabilidad del
 * loader/composición avisar de una muestra insuficiente, no de esta
 * función — se mantiene pura y simple).
 *
 * Dentro de cada dimensión el recorte reparte además por DIFICULTAD
 * (`interleaveByDifficulty`): la sesión mide las dos cosas que el informe usa
 * después, dimensión y tramo.
 */
export function selectBalanced(
  bank: Question[],
  targetTotal: number,
  minPerDimension: number,
  shuffle: ShuffleFn,
): Question[] {
  const byDim = groupBy(bank, (q) => q.dimension);
  const dimensions = [...byDim.keys()];
  const perDim = Math.max(minPerDimension, Math.floor(targetTotal / dimensions.length));

  const selected: Question[] = [];
  dimensions.forEach((dim, i) => {
    // Se baraja ANTES de intercalar: dentro de cada tramo la elección sigue
    // siendo aleatoria, lo que se fija es cuántas de cada tramo entran.
    const pool = interleaveByDifficulty(shuffle(byDim.get(dim)!), i);
    const take = Math.min(perDim, pool.length); // nunca más de lo disponible
    selected.push(...pool.slice(0, take));
  });
  return shuffle(selected); // orden final también determinista si se inyecta el mismo shuffle
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/**
 * Estado de sesión navegable, lógica PURA (sin terminal): el runner
 * interactivo (plan siguiente) solo envuelve estas transiciones con
 * prompts de I/O.
 */
export interface SessionState {
  readonly questions: Question[];
  readonly index: number;
  readonly answers: ReadonlyMap<string, string>; // questionId -> selectedOptionId
  readonly confidences: ReadonlyMap<string, Confidence>; // questionId -> confianza declarada
}

export function buildSession(selected: Question[]): SessionState {
  return { questions: selected, index: 0, answers: new Map(), confidences: new Map() };
}

/** Registra (o sobrescribe) la respuesta de la pregunta en el índice actual, sin avanzar. */
export function answerCurrent(state: SessionState, selectedOptionId: string): SessionState {
  const current = state.questions[state.index];
  if (!current) return state; // índice fuera de rango: no-op puro

  const answers = new Map(state.answers);
  answers.set(current.id, selectedOptionId);
  return { ...state, answers };
}

/** Registra (o sobrescribe) la confianza declarada de la pregunta actual, sin avanzar. */
export function setConfidenceCurrent(state: SessionState, confidence: Confidence): SessionState {
  const current = state.questions[state.index];
  if (!current) return state; // índice fuera de rango: no-op puro

  const confidences = new Map(state.confidences);
  confidences.set(current.id, confidence);
  return { ...state, confidences };
}

/** Avanza el índice, sin sobrepasar el final (índice === length marca la sesión completa). */
export function goForward(state: SessionState): SessionState {
  const index = Math.min(state.index + 1, state.questions.length);
  return { ...state, index };
}

/** Retrocede el índice; volver desde el índice 0 no rompe (se queda en 0). */
export function goBack(state: SessionState): SessionState {
  const index = Math.max(state.index - 1, 0);
  return { ...state, index };
}

export function isComplete(state: SessionState): boolean {
  return state.index >= state.questions.length;
}

/** Deriva AnsweredQuestion[] en el orden presentado; null para las no respondidas. */
export function toAnswered(state: SessionState): AnsweredQuestion[] {
  return state.questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: state.answers.get(q.id) ?? null,
    confidence: state.confidences.get(q.id) ?? null,
  }));
}

/**
 * La sesión que de verdad ha ocurrido cuando se corta a mitad: SOLO las preguntas
 * respondidas, en el orden presentado, con sus respuestas.
 *
 * Devuelve también las preguntas —y no solo las respuestas— porque el scoring
 * cuenta "presentadas" contra el banco que se le pasa. Puntuar 12 respuestas
 * contra las 120 que se habían seleccionado diría "12/120" en cada dimensión: un
 * 90% de preguntas sin responder que nunca llegaron a enseñarse, y un readiness
 * hundido por preguntas que no viste. Lo honesto al terminar antes es medir lo
 * respondido, con su N pequeño a la vista.
 */
export function answeredSoFar(state: SessionState): {
  questions: Question[];
  answered: AnsweredQuestion[];
} {
  const questions = state.questions.filter((q) => state.answers.has(q.id));
  const answered = questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: state.answers.get(q.id) ?? null,
    confidence: state.confidences.get(q.id) ?? null,
  }));
  return { questions, answered };
}

/**
 * Foto serializable de una sesión a medias, para poder retomarla otro día.
 *
 * Guarda IDS, no preguntas: el contenido vive en el pack y volverá a leerse de
 * ahí al reanudar (si una pregunta se editó, se reanuda con la versión de hoy, y
 * si desapareció, se cae de la sesión). Y guarda el ORDEN DE LAS OPCIONES tal y
 * como se enseñaron: sin eso, al reanudar las opciones saldrían rebarajadas y la
 * respuesta que ya diste aparecería en otro sitio.
 */
export interface SessionSnapshot {
  readonly index: number;
  readonly questions: readonly { readonly id: string; readonly options: readonly string[] }[];
  readonly answers: readonly (readonly [string, string])[];
  readonly confidences: readonly (readonly [string, Confidence])[];
}

export function snapshotSession(state: SessionState): SessionSnapshot {
  return {
    index: state.index,
    questions: state.questions.map((q) => ({ id: q.id, options: q.options.map((o) => o.id) })),
    answers: [...state.answers],
    confidences: [...state.confidences],
  };
}

/**
 * Reconstruye el estado a partir de las preguntas ya reordenadas y la foto.
 *
 * El índice NO se copia tal cual: se DESPLAZA por las preguntas que el pack ha
 * perdido por delante del cursor. Con el índice de ayer sobre una lista más corta,
 * la posición 5 dejaría de ser la misma pregunta y te saltarías una que no habías
 * respondido — que es justo lo contrario de "sigue donde lo dejaste". Después se
 * acota al total recuperado, para no apuntar fuera del banco.
 *
 * Las respuestas de preguntas que ya no están se descartan por la misma razón: son
 * respuestas a algo que este pack ya no pregunta.
 */
export function restoreSession(questions: Question[], snap: SessionSnapshot): SessionState {
  const vigentes = new Set(questions.map((q) => q.id));
  const answers = new Map(snap.answers.filter(([id]) => vigentes.has(id)));
  const confidences = new Map(snap.confidences.filter(([id]) => vigentes.has(id)));

  const caidasPorDelante = snap.questions
    .slice(0, snap.index)
    .filter((q) => !vigentes.has(q.id)).length;
  const index = Math.max(0, Math.min(snap.index - caidasPorDelante, questions.length));

  return { questions, index, answers, confidences };
}
