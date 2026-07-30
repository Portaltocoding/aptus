import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { ensureDir } from "./paths.js";
import type { SessionRecord } from "../core/evolution.js";

/**
 * Persistencia local del histórico de sesiones (Phase 5, PERS-01). Store JSON
 * simple: suficiente para un historial personal, testeable y sin dependencias.
 * Es la frontera de I/O; el modelo y la evolución viven puros en core/evolution.
 * Se valida al cargar (zod) y se falla rápido si el fichero está corrupto, para
 * no perder datos silenciosamente ni operar sobre un historial roto.
 */

const SessionDimensionScoreSchema = z.object({
  dimension: z.string(),
  answered: z.number(),
  correct: z.number(),
  pct: z.number(),
});

const SessionRoleReadinessSchema = z.object({
  roleId: z.string(),
  label: z.string(),
  levelId: z.string().nullable(),
  levelLabel: z.string(),
});

// Respuestas crudas de la sesión. OPCIONAL a propósito: los historiales escritos
// antes de que existiera este campo siguen siendo válidos y se cargan igual (solo
// no se pueden reevaluar contra una oferta). Sin esto, evaluar una JD nueva
// obligaría a repetir el test entero.
const AnsweredQuestionSchema = z.object({
  questionId: z.string(),
  selectedOptionId: z.string().nullable(),
  confidence: z.enum(["baja", "media", "alta"]).nullable().optional(),
});

const SessionRecordSchema = z.object({
  timestamp: z.string(),
  byDimension: z.array(SessionDimensionScoreSchema),
  readiness: z.array(SessionRoleReadinessSchema),
  answers: z.array(AnsweredQuestionSchema).optional(),
  // Ausente = "measure" (ver SessionKind): los historiales previos al repaso son
  // todos de medición, así que siguen siendo válidos tal cual.
  kind: z.enum(["measure", "review"]).optional(),
});

const HistorySchema = z.array(SessionRecordSchema);

/** Carga el histórico. Fichero inexistente → []. Corrupto → Error con mensaje claro. */
export function loadHistory(pathToJson: string): SessionRecord[] {
  if (!existsSync(pathToJson)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pathToJson, "utf8"));
  } catch {
    throw new Error(`Historial corrupto (JSON inválido) en ${pathToJson}. Bórralo o corrígelo para continuar.`);
  }

  const result = HistorySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Historial inválido en ${pathToJson}:\n${issues}`);
  }

  return result.data;
}

/** Guarda el histórico (crea el directorio si hace falta). Sobrescribe el fichero. */
export function saveHistory(pathToJson: string, records: SessionRecord[]): void {
  // Mismo modo 0700 que el resto de directorios de datos: el historial vive ahora
  // en el home, donde el modo por defecto dejaría leerlo a otros usuarios.
  ensureDir(dirname(pathToJson));
  writeFileSync(pathToJson, JSON.stringify(records, null, 2), "utf8");
}
