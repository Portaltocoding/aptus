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
});

const LevelSchema = z.object({
  id: z.string(),
  label: z.string(),
  requires: DifficultyThresholdsSchema,
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
