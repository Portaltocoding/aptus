import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Adaptador de SOLO LECTURA hacia jobhunt (Phase 6, INTEG-01). Lee los textos de
 * las ofertas escaneadas para medir la demanda de mercado por dimensión.
 *
 * Degradación elegante (criterio 2): si la base de datos no existe o no se puede
 * leer por cualquier motivo, devuelve `null` y Aptus sigue exactamente igual sin
 * la ponderación de mercado. Nunca lanza ni escribe: es puramente lectura.
 */
export function loadJobTexts(dbPath: string): string[] | null {
  if (!existsSync(dbPath)) return null;

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare("SELECT title, description FROM jobs").all() as {
        title: string | null;
        description: string | null;
      }[];
      return rows.map((r) => `${r.title ?? ""} ${r.description ?? ""}`);
    } finally {
      db.close();
    }
  } catch {
    // Cualquier problema (schema distinto, fichero corrupto, permisos): degradar.
    return null;
  }
}
