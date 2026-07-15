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
 * SOBRE LA PRESENTACIÓN: se agrupa en CUBOS por veredicto (llegas / te falta 1 /
 * te faltan 2+), no en una lista ordenada. Se probó ordenar por escalones y con
 * las 402 ofertas reales quedó claro que era mala idea: arriba salían los puestos
 * para los que estás MÁS sobrecualificado (todo junior, +2) y se hundía la Senior
 * AI Engineer que era la interesante. Respondía "¿para qué estoy más pasado de
 * nivel?" en vez de "¿qué me conviene mirar?", y además una lista ordenada de
 * ofertas se lee como el ranking de encaje que REQUIREMENTS.md manda vigilar.
 *
 * Dentro de cada cubo el orden es ALFABÉTICO, a propósito: cualquier otro criterio
 * volvería a insinuar un ranking. El cubo dice qué relación tienes con el nivel que
 * pide la oferta; elegir entre las de un cubo es cosa tuya, no del programa.
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
  /** Alcanzas el nivel que piden (o lo superas). */
  meets: ScannedJob[];
  /** Te falta exactamente un escalón: lo que tienes a tiro. */
  oneShort: ScannedJob[];
  /** Te faltan dos o más escalones. */
  farther: ScannedJob[];
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
  const profile = extractJdProfile(text, keywords, config.levels, config.weak_keywords ?? {});
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
  const conNivel = evaluable.filter((s) => s.verdict!.levelDelta !== null);

  // Alfabético dentro del cubo: cualquier otro criterio insinuaría un ranking.
  const alfabetico = (a: ScannedJob, b: ScannedJob): number => a.title.localeCompare(b.title);
  const enCubo = (test: (delta: number) => boolean): ScannedJob[] =>
    conNivel.filter((s) => test(s.verdict!.levelDelta!)).sort(alfabetico);

  return {
    meets: enCubo((d) => d >= 0),
    oneShort: enCubo((d) => d === -1),
    farther: enCubo((d) => d <= -2),
    withoutLevel: [...withoutLevel].sort(alfabetico),
    notEvaluable: [...notEvaluable].sort(alfabetico),
    totalScanned: jobs.length,
  };
}
