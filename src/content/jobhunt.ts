import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Adaptador de SOLO LECTURA hacia jobhunt (Phase 6, INTEG-01). Lee las ofertas
 * escaneadas para medir la demanda de mercado por dimensión (`loadJobTexts`) y
 * para evaluarlas una a una contra tu readiness (`loadJobs`).
 *
 * Degradación elegante (criterio 2): si la base de datos no existe o no se puede
 * leer por cualquier motivo, devuelve `null` y Aptus sigue exactamente igual sin
 * esa capa. Nunca lanza ni escribe: es puramente lectura.
 *
 * NO se importa el scoring propio de jobhunt (`score`, `score_cv_match`…): eso es
 * su criterio, no el nuestro, y mezclarlo metería por la puerta de atrás justo el
 * "% de encaje" que este proyecto no quiere.
 */

/**
 * Ruta de la base de ofertas, configurable con la variable de entorno
 * `APTUS_JOBS_DB`. No hay ruta por defecto a propósito: la integración es
 * opcional y depende de dónde tenga cada uno su base, así que sin la variable
 * simplemente no existe y Aptus funciona igual sin la capa de mercado.
 */
export function jobsDbPath(): string | null {
  const fromEnv = process.env.APTUS_JOBS_DB?.trim();
  return fromEnv ? fromEnv : null;
}

export interface JobRow {
  id: string | null;
  title: string;
  company: string | null;
  url: string | null;
  status: string | null;
  description: string;
}

interface RichRow {
  id: string | null;
  title: string | null;
  company: string | null;
  job_url: string | null;
  status: string | null;
  description: string | null;
}

interface MinimalRow {
  title: string | null;
  description: string | null;
}

/**
 * Lee las ofertas con sus metadatos. Si el esquema no trae las columnas ricas
 * (bases de datos mínimas, fixtures de test), reintenta con title+description y
 * deja el resto en null: mejor una oferta sin empresa que ninguna oferta.
 */
export function loadJobs(dbPath: string | null): JobRow[] | null {
  if (dbPath === null || !existsSync(dbPath)) return null;

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      try {
        const rows = db
          .prepare("SELECT id, title, company, job_url, status, description FROM jobs")
          .all() as unknown as RichRow[];
        return rows.map((r) => ({
          id: r.id,
          title: r.title ?? "",
          company: r.company,
          url: r.job_url,
          status: r.status,
          description: r.description ?? "",
        }));
      } catch {
        // Esquema mínimo: solo lo que garantiza el contrato original.
        const rows = db.prepare("SELECT title, description FROM jobs").all() as unknown as MinimalRow[];
        return rows.map((r) => ({
          id: null,
          title: r.title ?? "",
          company: null,
          url: null,
          status: null,
          description: r.description ?? "",
        }));
      }
    } finally {
      db.close();
    }
  } catch {
    // Cualquier problema (fichero corrupto, permisos, sin tabla jobs): degradar.
    return null;
  }
}

/** Los textos de las ofertas, para medir la demanda de mercado por dimensión. */
export function loadJobTexts(dbPath: string | null): string[] | null {
  const jobs = loadJobs(dbPath);
  return jobs === null ? null : jobs.map((j) => `${j.title} ${j.description}`);
}
