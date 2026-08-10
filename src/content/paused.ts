import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { ensureDir, listPackEntries, pausedPath } from "./paths.js";
import type { Question } from "./schema.js";
import type { SessionSnapshot } from "../core/session.js";

/**
 * Persistencia de una sesión EN PAUSA (una por pack).
 *
 * Existe porque un test de medida son ~120 preguntas y una hora larga: sin pausa,
 * la única forma de levantarse de la silla era tirar la sesión entera y volver a
 * empezar mañana desde la primera pregunta. Con pausa, dejarlo a medias deja de
 * costar lo respondido.
 *
 * Lo que se guarda son IDS, nunca el contenido: las preguntas siguen viviendo en
 * el pack y se releen al reanudar. Si una se editó, se reanuda con la versión de
 * hoy; si desapareció del pack, se cae de la sesión y se dice cuántas. Guardar
 * aquí una copia del enunciado sería tener dos verdades sobre la misma pregunta.
 *
 * Frontera de I/O, como `history.ts`: el modelo (`SessionSnapshot`) y la
 * restauración del estado viven puros en `core/session.ts`, y `restorePaused` —la
 * parte que decide qué se recupera y qué se ha perdido— también es pura.
 */

const SnapshotSchema = z.object({
  index: z.number().int().min(0),
  questions: z.array(z.object({ id: z.string(), options: z.array(z.string()) })),
  answers: z.array(z.tuple([z.string(), z.string()])),
  confidences: z.array(z.tuple([z.string(), z.enum(["baja", "media", "alta"])])),
});

const PausedSessionSchema = z.object({
  pack: z.string(),
  /** Qué sesión era. Hoy solo se pausan las de medida, pero el dato viaja igual. */
  kind: z.enum(["measure", "review"]).default("measure"),
  /** Cuándo se pausó, para poder decir "la dejaste hace tres semanas". */
  timestamp: z.string(),
  snapshot: SnapshotSchema,
});

/**
 * Se declara a mano en vez de inferirse del esquema para que `snapshot` sea el
 * MISMO tipo que produce el motor (`SessionSnapshot`, de sólo lectura): así lo que
 * se guarda y lo que se restaura no pueden divergir sin que el compilador lo diga.
 */
export interface PausedSession {
  readonly pack: string;
  readonly kind: "measure" | "review";
  readonly timestamp: string;
  readonly snapshot: SessionSnapshot;
}

/** Carga la sesión pausada de un pack. Sin fichero → `null`. Corrupto → Error. */
export function loadPaused(pathToJson: string): PausedSession | null {
  if (!existsSync(pathToJson)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pathToJson, "utf8"));
  } catch {
    throw new Error(
      `Sesión en pausa corrupta (JSON inválido) en ${pathToJson}. Bórrala para poder empezar otra.`,
    );
  }

  const result = PausedSessionSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Sesión en pausa inválida en ${pathToJson}:\n${issues}`);
  }

  return result.data;
}

/** Guarda la sesión en pausa, sobrescribiendo la anterior del mismo pack. */
export function savePaused(pathToJson: string, paused: PausedSession): void {
  // Mismo 0700 que el resto de datos: dónde vas en un test es cosa tuya.
  ensureDir(dirname(pathToJson));
  writeFileSync(pathToJson, JSON.stringify(paused, null, 2), "utf8");
}

/** Borra la pausa (al retomarla y terminarla, o al descartarla). No falla si no hay. */
export function clearPaused(pathToJson: string): void {
  rmSync(pathToJson, { force: true });
}

/** Packs que tienen una sesión a medias esperando. Vacío = no hay nada que retomar. */
export function pausedPacks(): string[] {
  return listPackEntries()
    .map((e) => e.name)
    .filter((name) => existsSync(pausedPath(name)));
}

/**
 * Reconstruye las preguntas de una sesión pausada contra el banco de HOY: en el
 * orden en que se presentaron y con sus opciones en el orden en que se enseñaron.
 *
 * Lo segundo no es un detalle cosmético: si al reanudar las opciones salieran
 * rebarajadas, la respuesta que ya diste aparecería en otra posición y la
 * pregunta que ya contestaste sería, de hecho, otra pregunta.
 *
 * PURA: el banco entra como argumento. Devuelve también los ids que ya no existen
 * en el pack, para que quien componga pueda decirlo en voz alta en vez de reanudar
 * una sesión misteriosamente más corta.
 */
export function restorePaused(
  bank: Question[],
  snapshot: SessionSnapshot,
): { questions: Question[]; missing: string[] } {
  const porId = new Map(bank.map((q) => [q.id, q]));
  const questions: Question[] = [];
  const missing: string[] = [];

  for (const guardada of snapshot.questions) {
    const q = porId.get(guardada.id);
    if (q === undefined) {
      missing.push(guardada.id);
      continue;
    }
    questions.push({ ...q, options: ordenarOpciones(q, guardada.options) });
  }

  return { questions, missing };
}

/**
 * Las opciones de hoy en el orden de ayer. Una opción nueva (la pregunta se editó
 * después de pausar) va al final en vez de desaparecer: enseñar menos opciones de
 * las que el pack tiene hoy sería evaluar contra una pregunta que ya no existe.
 */
function ordenarOpciones(q: Question, orden: readonly string[]): Question["options"] {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  return [...q.options].sort(
    (a, b) =>
      (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
