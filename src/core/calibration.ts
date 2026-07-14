import type { Question } from "../content/schema.js";
import type { AnsweredQuestion, Confidence } from "./scoring.js";

/**
 * Motor de calibración puro (sin I/O): cruza la confianza declarada por el
 * usuario con su acierto real, por nivel de confianza (RES-04). Revela dónde se
 * sobreestima (declara alta confianza pero acierta poco). Mismo input → mismo
 * output; no conoce la terminal ni el dominio.
 *
 * No produce ningún score único agregado: solo el desglose por nivel, con su N.
 */

export const CONFIDENCE_ORDER: Confidence[] = ["alta", "media", "baja"];

/**
 * Acierto "declarado" representativo por nivel (aprox., 0..1), para contrastar
 * contra el acierto real. Con 4 opciones, adivinar ≈ 25%; los niveles suben
 * desde ahí. Son valores de referencia transparentes, no un score oculto.
 */
export const DECLARED_ACCURACY: Record<Confidence, number> = {
  baja: 0.4,
  media: 0.65,
  alta: 0.9,
};

/** Umbral de brecha para señalar sobre/infra-estimación (15 puntos porcentuales). */
export const CALIBRATION_GAP_THRESHOLD = 0.15;

export interface ConfidenceBucket {
  confidence: Confidence;
  declared: number; // acierto declarado representativo (0..1)
  answered: number; // nº de respuestas con esta confianza
  correct: number;
  accuracy: number; // correct / answered (0 si answered === 0, nunca NaN)
  gap: number; // accuracy - declared; negativo => sobreestima
}

export interface CalibrationResult {
  // Solo niveles con al menos una respuesta con confianza declarada, en orden
  // de mayor a menor confianza. Sin campo agregado global.
  byConfidence: ConfidenceBucket[];
}

export function calibration(
  answered: AnsweredQuestion[],
  presentedBank: Question[],
): CalibrationResult {
  // Corrección binaria por id de pregunta (misma regla que el motor de scoring).
  const correctById = new Map<string, boolean>();
  for (const q of presentedBank) {
    const found = answered.find((a) => a.questionId === q.id);
    const wasAnswered = found !== undefined && found.selectedOptionId !== null;
    let ok = false;
    if (wasAnswered) {
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      ok = correctIds.includes(found!.selectedOptionId as string);
    }
    correctById.set(q.id, ok);
  }

  const buckets = new Map<Confidence, { answered: number; correct: number }>();
  for (const a of answered) {
    // Solo cuentan respuestas efectivas con confianza declarada.
    if (a.selectedOptionId === null || a.confidence === null || a.confidence === undefined) continue;
    const b = buckets.get(a.confidence) ?? { answered: 0, correct: 0 };
    b.answered += 1;
    if (correctById.get(a.questionId)) b.correct += 1;
    buckets.set(a.confidence, b);
  }

  const byConfidence: ConfidenceBucket[] = CONFIDENCE_ORDER.filter((c) => buckets.has(c)).map((c) => {
    const b = buckets.get(c)!;
    const accuracy = b.answered > 0 ? b.correct / b.answered : 0;
    const declared = DECLARED_ACCURACY[c];
    return {
      confidence: c,
      declared,
      answered: b.answered,
      correct: b.correct,
      accuracy,
      gap: accuracy - declared,
    };
  });

  return { byConfidence };
}
