import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { PackSchema, type Pack } from "./schema.js";

/**
 * Única frontera de entrada de contenido no confiable del sistema (CONT-01/02/03).
 * Lee el pack (metadata) y las preguntas desde YAML, los valida con zod
 * (PackSchema.safeParse, incluyendo el superRefine que exige correct ∈ options[].id)
 * y falla rápido con un Error de mensaje claro si el pack está malformado.
 *
 * No hay try/catch silencioso alrededor de safeParse: se usa el resultado
 * success/error explícito. Nunca se devuelven datos parcialmente válidos.
 */
export function loadPack(pathToPackYaml: string, pathToQuestionsYaml: string): Pack {
  const packRaw = parseYaml(readFileSync(pathToPackYaml, "utf8"));
  const questionsRaw = parseYaml(readFileSync(pathToQuestionsYaml, "utf8"));

  const merged = {
    ...packRaw,
    questions: questionsRaw?.questions ?? questionsRaw,
  };

  const result = PackSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Pack inválido en ${pathToQuestionsYaml}:\n${issues}`);
  }

  return result.data;
}
