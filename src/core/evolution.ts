import type { AnsweredQuestion, ScoreResult } from "./scoring.js";
import type { RoleReadiness } from "./readiness.js";

/**
 * Modelo e histórico de evolución entre sesiones (Phase 5, PERS-01/PERS-02).
 * Todo puro: `buildSessionRecord` arma el registro serializable de una sesión y
 * `evolution` compara la última sesión con la anterior. La marca de tiempo se
 * genera en la capa de I/O (start.ts) y se inyecta; el núcleo no lee el reloj.
 */

export interface SessionDimensionScore {
  dimension: string;
  answered: number;
  correct: number;
  pct: number;
}

export interface SessionRoleReadiness {
  roleId: string;
  label: string;
  levelId: string | null;
  levelLabel: string;
}

export interface SessionRecord {
  timestamp: string; // ISO, generado en la capa de I/O
  byDimension: SessionDimensionScore[];
  readiness: SessionRoleReadiness[];
  // Respuestas crudas: permiten reevaluar la sesión contra una oferta concreta
  // (`aptus jd`) sin repetir el test. Opcional: los registros anteriores a este
  // campo no las traen y el resto del sistema funciona igual sin ellas.
  answers?: AnsweredQuestion[];
}

export interface DimensionTrend {
  dimension: string;
  current: number;
  previous: number | null; // null si la dimensión no estaba en la sesión anterior
  delta: number | null; // current - previous (null si no hay anterior)
}

export interface RoleTrend {
  roleId: string;
  label: string;
  current: string; // etiqueta de nivel actual
  previous: string | null;
  changed: boolean;
}

export interface EvolutionReport {
  sessionCount: number;
  currentTimestamp: string | null;
  previousTimestamp: string | null;
  byDimension: DimensionTrend[];
  byRole: RoleTrend[];
}

/** Arma el registro serializable de una sesión a partir de los resultados ya calculados. */
export function buildSessionRecord(
  timestamp: string,
  score: ScoreResult,
  readiness: RoleReadiness[],
  answers?: AnsweredQuestion[],
): SessionRecord {
  return {
    timestamp,
    ...(answers === undefined ? {} : { answers }),
    byDimension: score.byDimension.map((d) => ({
      dimension: d.dimension,
      answered: d.answered,
      correct: d.correct,
      pct: d.pct,
    })),
    readiness: readiness.map((r) => ({
      roleId: r.roleId,
      label: r.label,
      levelId: r.levelId,
      levelLabel: r.levelLabel,
    })),
  };
}

/**
 * Compara la última sesión del histórico con la inmediatamente anterior. Con 0
 * sesiones devuelve un informe vacío; con 1, `previous`/`delta` son null (no hay
 * con qué comparar todavía).
 */
export function evolution(history: SessionRecord[]): EvolutionReport {
  const sessionCount = history.length;
  if (sessionCount === 0) {
    return { sessionCount: 0, currentTimestamp: null, previousTimestamp: null, byDimension: [], byRole: [] };
  }

  const current = history[sessionCount - 1]!;
  const previous = sessionCount >= 2 ? history[sessionCount - 2]! : null;

  const prevByDim = new Map((previous?.byDimension ?? []).map((d) => [d.dimension, d.pct]));
  const byDimension: DimensionTrend[] = current.byDimension.map((d) => {
    const prev = prevByDim.has(d.dimension) ? prevByDim.get(d.dimension)! : null;
    return { dimension: d.dimension, current: d.pct, previous: prev, delta: prev === null ? null : d.pct - prev };
  });

  const prevByRole = new Map((previous?.readiness ?? []).map((r) => [r.roleId, r.levelLabel]));
  const byRole: RoleTrend[] = current.readiness.map((r) => {
    const prev = prevByRole.has(r.roleId) ? prevByRole.get(r.roleId)! : null;
    return { roleId: r.roleId, label: r.label, current: r.levelLabel, previous: prev, changed: prev !== null && prev !== r.levelLabel };
  });

  return {
    sessionCount,
    currentTimestamp: current.timestamp,
    previousTimestamp: previous?.timestamp ?? null,
    byDimension,
    byRole,
  };
}
