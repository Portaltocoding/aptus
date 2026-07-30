import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";

/**
 * Repaso de fallos: qué fallaste, qué era lo correcto y POR QUÉ. Puro — sin I/O,
 * sin reloj, sin aleatoriedad, sin imports de `src/cli/` (ENG-01).
 *
 * El pack cura una `explanation` por pregunta y hasta ahora no se enseñaba
 * ninguna: se veían porcentajes y nunca el fallo concreto. Esto lo deriva de las
 * respuestas crudas, que ya se guardan en el historial.
 *
 * Ojo con el nombre: "Repasar" (RES-05, `core/resurfacing.ts`) es la tanda de
 * repetición espaciada — preguntas que se vuelven a HACER. Esto es otra cosa: son
 * los fallos de UNA sesión concreta, con su solución delante para LEERLOS. No
 * comparten estado ni se mezclan.
 *
 * La derivación se recorre por `answers`, NO por el banco: `answers` trae una
 * entrada por pregunta PRESENTADA (con `selectedOptionId: null` si no se
 * respondió), mientras que el banco de un pack puede tener cientos que nunca
 * salieron. Recorrer el banco convertiría "no salió" en "no la respondiste", que
 * es exactamente el tipo de mentira que aptus existe para no contar.
 */

/**
 * Por qué esta pregunta entra en el repaso. FALLADA y NO RESPONDIDA se distinguen
 * a propósito: fallar es creer que sabes algo y no saberlo; no responder es no
 * haber llegado. Meterlas en el mismo saco miente sobre lo que sabes.
 */
export type MistakeOutcome = "fallada" | "no-respondida";

export interface ReviewedQuestion {
  questionId: string;
  outcome: MistakeOutcome;
  dimension: string;
  subtopic?: string;
  difficulty: Question["difficulty"];
  stem: string;
  /** TEXTO de lo que elegiste (no su id). `null` si no la respondiste. */
  selectedText: string | null;
  /** TEXTO de la(s) correcta(s). Varios elementos si `correct` era un array. */
  correctTexts: string[];
  explanation: string;
}

export interface MistakeDimensionGroup {
  dimension: string;
  questions: ReviewedQuestion[];
  wrong: number;
  unanswered: number;
  /** Presentadas de esta dimensión: el N que acompaña a cualquier lectura (RES-01). */
  presented: number;
}

export interface MistakeReview {
  byDimension: MistakeDimensionGroup[];
  wrong: number;
  unanswered: number;
  /** wrong + unanswered: lo que hay que repasar. */
  reviewable: number;
  /** Presentadas en total. Sin esto, "12 fallos" no dice nada. */
  presented: number;
  /**
   * Ids que la sesión respondió y que YA NO están en el banco: el pack cambió
   * desde entonces. No se rompe y no se ocultan — se cuentan y se dicen, porque
   * si no el repaso parecería más corto de lo que fue.
   */
  missingFromBank: string[];
}

/** Un fallo en fácil es más urgente que uno en experto: se estudia de abajo arriba. */
const DIFFICULTY_ORDER: Record<Question["difficulty"], number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  experto: 3,
};

/** El orden dentro de cada dimensión: primero lo fallado, luego lo no respondido. */
const OUTCOME_ORDER: Record<MistakeOutcome, number> = {
  fallada: 0,
  "no-respondida": 1,
};

/**
 * Deriva el repaso de una sesión: por cada pregunta presentada que se falló o no
 * se respondió, qué elegiste, qué era lo correcto y su explicación.
 *
 * El criterio de acierto es EL MISMO que `score()`: binario, y con `correct` como
 * array basta con que la elegida esté entre las correctas. Si divergiera, el
 * repaso contradiría a los porcentajes de la misma pantalla.
 *
 * ORDEN — agrupado por dimensión, que es como se estudia: los fallos de una misma
 * dimensión comparten contexto y se leen del tirón. Las dimensiones van en orden
 * de aparición (el orden en que las viviste), NO por número de fallos: ordenarlas
 * "de peor a mejor" sería colar un ranking de dimensiones sin su N, que es justo
 * lo que este proyecto no hace. Dentro de cada dimensión: primero las falladas
 * (creías saberlo) y luego las no respondidas, y dentro de cada grupo de fácil a
 * experto, para reconstruir desde la base.
 */
export function deriveMistakes(
  answers: AnsweredQuestion[],
  presentedBank: Question[],
): MistakeReview {
  const porId = new Map(presentedBank.map((q) => [q.id, q]));

  const grupos = new Map<string, MistakeDimensionGroup>();
  const missingFromBank: string[] = [];
  let wrong = 0;
  let unanswered = 0;
  let presented = 0;

  for (const a of answers) {
    const q = porId.get(a.questionId);
    if (q === undefined) {
      // La pregunta ya no está en el pack (se editó, se retiró o cambió de id).
      // No hay enunciado ni explicación que enseñar: se cuenta y se dice.
      missingFromBank.push(a.questionId);
      continue;
    }

    presented += 1;

    const grupo = grupos.get(q.dimension) ?? {
      dimension: q.dimension,
      questions: [],
      wrong: 0,
      unanswered: 0,
      presented: 0,
    };
    grupo.presented += 1;
    grupos.set(q.dimension, grupo);

    const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
    const correctTexts = correctIds.map((cid) => q.options.find((o) => o.id === cid)?.text ?? cid);

    if (a.selectedOptionId === null) {
      unanswered += 1;
      grupo.unanswered += 1;
      grupo.questions.push({
        ...comun(q),
        outcome: "no-respondida",
        selectedText: null,
        correctTexts,
      });
      continue;
    }

    // Acertada: fuera del repaso. Mismo criterio binario que `score()`.
    if (correctIds.includes(a.selectedOptionId)) continue;

    wrong += 1;
    grupo.wrong += 1;
    grupo.questions.push({
      ...comun(q),
      outcome: "fallada",
      // El id de la opción no le dice nada a nadie: se guarda su TEXTO. Si el id
      // ya no existe en el pack (opciones editadas), se dice en vez de mentir.
      selectedText:
        q.options.find((o) => o.id === a.selectedOptionId)?.text ??
        `(opción '${a.selectedOptionId}', ya no está en el pack)`,
      correctTexts,
    });
  }

  const byDimension = [...grupos.values()]
    .filter((g) => g.questions.length > 0)
    .map((g) => ({
      ...g,
      questions: [...g.questions].sort(
        (a, b) =>
          OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] ||
          DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty],
      ),
    }));

  return {
    byDimension,
    wrong,
    unanswered,
    reviewable: wrong + unanswered,
    presented,
    missingFromBank,
  };
}

function comun(
  q: Question,
): Pick<
  ReviewedQuestion,
  "questionId" | "dimension" | "subtopic" | "difficulty" | "stem" | "explanation"
> {
  return {
    questionId: q.id,
    dimension: q.dimension,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    stem: q.stem,
    explanation: q.explanation,
  };
}

/** Acota el repaso a una dimensión, conservando los totales de la sesión entera. */
export function filterByDimension(review: MistakeReview, dimension: string): MistakeReview {
  return { ...review, byDimension: review.byDimension.filter((g) => g.dimension === dimension) };
}
