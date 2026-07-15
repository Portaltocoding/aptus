import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * Frontera de validación de la config de readiness (perfiles de rol + baselines
 * de nivel, ENG-03/CONT-05). Vive fuera del código, en el pack. Se valida con
 * zod y falla rápido con mensaje claro si está malformada (mismo patrón que
 * loadPack). El motor de readiness no conoce estos strings: los recibe validados.
 */

const DifficultyThresholdsSchema = z.object({
  easy: z.number().min(0).max(1),
  medium: z.number().min(0).max(1),
  hard: z.number().min(0).max(1),
  // Tramo experto: opcional; por defecto 0 (solo staff suele exigirlo).
  experto: z.number().min(0).max(1).default(0),
});

const LevelSchema = z.object({
  id: z.string(),
  label: z.string(),
  requires: DifficultyThresholdsSchema,
  // Amplitud (solo staff): acierto mínimo exigido también en las dimensiones
  // SECUNDARIAS del rol (no solo las núcleo). Ausente = no se exige amplitud.
  breadth: z.number().min(0).max(1).optional(),
});

const RoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  core: z.array(z.string()).min(1),
  secondary: z.array(z.string()).default([]),
  source: z.string(),
});

export const ReadinessConfigSchema = z.object({
  version: z.string(),
  levels: z.array(LevelSchema).min(1),
  roles: z.array(RoleSchema).min(1),
  study: z.record(z.string(), z.string()),
  // Opcional (Phase 6): keywords por dimensión para medir demanda de mercado.
  market_keywords: z.record(z.string(), z.array(z.string())).optional(),
  // Opcional (v2, 15 jul): cuáles de esas keywords son DÉBILES — palabras de
  // oficina que aparecen en cualquier oferta ("product", "stakeholder"). Siguen
  // contando como mención, pero por sí solas no pueden hacer núcleo a una
  // dimensión. Sin esto, una oferta de pruebas de vehículos que dice "product" 14
  // veces se evaluaba como un puesto de producto.
  //
  // Existen porque `market_keywords` se creó para ponderar demanda sobre TODO el
  // corpus de ofertas, donde el ruido se promedia; al reutilizarlas para clasificar
  // UNA oferta, ese ruido decide. Cada uso necesita su propia tolerancia.
  weak_keywords: z.record(z.string(), z.array(z.string())).optional(),
});

export type ReadinessConfig = z.infer<typeof ReadinessConfigSchema>;
export type ReadinessRole = z.infer<typeof RoleSchema>;
export type ReadinessLevel = z.infer<typeof LevelSchema>;

export function loadReadiness(pathToYaml: string): ReadinessConfig {
  const raw = parseYaml(readFileSync(pathToYaml, "utf8"));

  const result = ReadinessConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Config de readiness inválida en ${pathToYaml}:\n${issues}`);
  }

  return result.data;
}
