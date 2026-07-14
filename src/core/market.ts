import type { Gap } from "./readiness.js";

/**
 * Motor de demanda de mercado puro (sin I/O): cuenta en cuántas ofertas aparece
 * cada dimensión y repondera la PRIORIDAD de los gaps ya calculados (Phase 6,
 * INTEG-01). No genera ningún score nuevo de "encaje"/"empleabilidad" (criterio
 * 3): solo reordena los gaps combinando debilidad × demanda, con ambas señales
 * a la vista. Determinista.
 */

export interface MarketDemand {
  totalJobs: number;
  byDimension: Record<string, number>; // nº de ofertas que tocan cada dimensión
}

export interface WeightedGap extends Gap {
  demandJobs: number; // ofertas del mercado que piden esta dimensión
  demandShare: number; // demandJobs / totalJobs (0..1)
  priority: number; // clave de orden interna: debilidad × (1 + demanda). No se muestra como score.
}

/**
 * Cuenta, por dimensión, en cuántas ofertas aparece al menos una de sus keywords
 * (case-insensitive). Cada oferta cuenta como mucho una vez por dimensión.
 */
export function computeDemand(
  jobTexts: string[],
  keywords: Record<string, string[]>,
): MarketDemand {
  const lowered = jobTexts.map((t) => t.toLowerCase());
  const byDimension: Record<string, number> = {};

  for (const [dimension, words] of Object.entries(keywords)) {
    const needles = words.map((w) => w.toLowerCase()).filter((w) => w.length > 0);
    let count = 0;
    for (const text of lowered) {
      if (needles.some((w) => text.includes(w))) count += 1;
    }
    byDimension[dimension] = count;
  }

  return { totalJobs: jobTexts.length, byDimension };
}

/**
 * Repondera los gaps por demanda de mercado. `priority = (1 - accuracy) * (1 +
 * demandShare)`: la debilidad manda, y la demanda la amplifica sin anular un gap
 * de dimensión poco demandada. Ordena de mayor a menor prioridad.
 */
export function applyMarketWeight(gaps: Gap[], demand: MarketDemand): WeightedGap[] {
  const weighted = gaps.map((gap) => {
    const demandJobs = demand.byDimension[gap.dimension] ?? 0;
    const demandShare = demand.totalJobs > 0 ? demandJobs / demand.totalJobs : 0;
    const priority = (1 - gap.accuracy) * (1 + demandShare);
    return { ...gap, demandJobs, demandShare, priority };
  });

  weighted.sort((a, b) => b.priority - a.priority); // mayor prioridad primero
  return weighted;
}
