import type { Question } from "../content/schema.js";
import type { JobRow } from "../content/jobhunt.js";
import type { ReadinessConfig } from "../content/readiness.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { RoleReadiness } from "./readiness.js";
import { computeJdReadiness, extractJdProfile, jdVerdict, type JdProfile, type JdVerdict } from "./jd.js";

/**
 * Escaneo en bloque de las ofertas de jobhunt contra tu readiness, puro y sin I/O.
 * No hay motor nuevo: cada oferta pasa por exactamente el mismo camino que
 * `aptus jd` (perfil léxico → rol ad-hoc → readiness → veredicto). Esto solo
 * itera y agrupa.
 *
 * SOBRE EL ORDEN (decisión de Carlos, 15 jul, con la pega puesta encima de la
 * mesa): la lista va ordenada por `levelDelta`, los escalones de diferencia entre
 * el nivel que pide la oferta y el que alcanzas para su perfil. Es una cantidad
 * REAL y auditable —niveles, no un número inventado— y sale del veredicto que ya
 * existía; aquí no se fabrica ningún score. Aun así, conviene no olvidar que una
 * lista ordenada de ofertas SE LEE como un ranking de encaje, que es lo que
 * REQUIREMENTS.md manda vigilar ("que no reaparezca disfrazado: match %,
 * employability index"). Por eso cada fila enseña su veredicto entero (qué pide,
 * qué alcanzas) y jamás un porcentaje.
 *
 * Y nada de silencios: las ofertas que no se pueden evaluar NO se tiran, se
 * cuentan y se dicen. Ocultarlas haría parecer que el pack cubre el mercado.
 */

export interface ScannedJob {
  title: string;
  company: string | null;
  url: string | null;
  profile: JdProfile;
  /** null = no evaluable: la oferta no pide con fuerza ninguna dimensión medible. */
  readiness: RoleReadiness | null;
  verdict: JdVerdict | null;
}

export interface JobsScan {
  /** Evaluadas y con nivel declarado, de más listo a menos (por escalones). */
  ranked: ScannedJob[];
  /** Evaluadas pero la oferta no dice qué nivel busca: no hay con qué compararlas. */
  withoutLevel: ScannedJob[];
  /** La oferta no pide nada que este pack sepa medir. */
  notEvaluable: ScannedJob[];
  totalScanned: number;
}

/** Pasa una oferta por el mismo camino exacto que `aptus jd`. */
function scanOne(
  job: JobRow,
  keywords: Record<string, string[]>,
  config: ReadinessConfig,
  answered: AnsweredQuestion[],
  bank: Question[],
): ScannedJob {
  // El titular importa: de él sale el seniority y la etiqueta del rol ad-hoc.
  const text = `${job.title}\n${job.description}`;
  const profile = extractJdProfile(text, keywords, config.levels);
  const readiness = computeJdReadiness(answered, bank, config, profile);

  return {
    title: job.title,
    company: job.company,
    url: job.url,
    profile,
    readiness,
    verdict: readiness === null ? null : jdVerdict(readiness, profile, config.levels),
  };
}

export function scanJobs(
  jobs: JobRow[],
  keywords: Record<string, string[]>,
  config: ReadinessConfig,
  answered: AnsweredQuestion[],
  bank: Question[],
): JobsScan {
  const scanned = jobs.map((j) => scanOne(j, keywords, config, answered, bank));

  const notEvaluable = scanned.filter((s) => s.readiness === null);
  const evaluable = scanned.filter((s) => s.readiness !== null);
  const withoutLevel = evaluable.filter((s) => s.verdict!.levelDelta === null);

  const ranked = evaluable
    .filter((s) => s.verdict!.levelDelta !== null)
    // Más listo primero. A igualdad de escalones, orden estable por título para que
    // dos ejecuciones den lo mismo.
    .sort((a, b) => b.verdict!.levelDelta! - a.verdict!.levelDelta! || a.title.localeCompare(b.title));

  return { ranked, withoutLevel, notEvaluable, totalScanned: jobs.length };
}
