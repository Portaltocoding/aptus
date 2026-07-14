import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { PackSchema, type Pack } from "./schema.js";

/**
 * Única frontera de entrada de contenido no confiable del sistema (CONT-01/02/03).
 * Lee el pack (metadata) y las preguntas desde YAML, los valida con zod
 * (PackSchema.safeParse, incluyendo el superRefine que exige correct ∈ options[].id)
 * y falla rápido con un Error de mensaje claro si el pack está malformado.
 *
 * Soporta dos disposiciones (multi-tema / escala, PACK-02):
 *   - Un pack como DIRECTORIO con `pack.yaml` + una carpeta `questions/` de
 *     ficheros por dimensión (recomendado; escala a cientos de preguntas).
 *   - El formato clásico de dos ficheros (`pack.yaml` + `questions.yaml`), que se
 *     mantiene para fixtures y compatibilidad.
 */

/** Normaliza un YAML de preguntas: acepta lista suelta o `{ questions: [...] }`. */
function readQuestions(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object" && "questions" in raw) {
    const q = (raw as { questions?: unknown }).questions;
    return Array.isArray(q) ? q : [];
  }
  return [];
}

function assemble(packRaw: unknown, questions: unknown[], sourceLabel: string): Pack {
  const merged = { ...(packRaw as object), questions };

  const result = PackSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Pack inválido en ${sourceLabel}:\n${issues}`);
  }

  return result.data;
}

/** Carga clásica de dos ficheros (usada por fixtures de test y compatibilidad). */
export function loadPack(pathToPackYaml: string, pathToQuestionsYaml: string): Pack {
  const packRaw = parseYaml(readFileSync(pathToPackYaml, "utf8"));
  const questionsRaw = parseYaml(readFileSync(pathToQuestionsYaml, "utf8"));
  return assemble(packRaw, readQuestions(questionsRaw), pathToQuestionsYaml);
}

/**
 * Carga un pack desde su DIRECTORIO: `pack.yaml` + preguntas. Si existe una
 * carpeta `questions/`, mergea todos sus `*.yaml`/`*.yml` (orden alfabético
 * estable); si no, usa `questions.yaml`.
 */
export function loadPackDir(packDir: string): Pack {
  const packYaml = join(packDir, "pack.yaml");
  if (!existsSync(packYaml)) {
    throw new Error(`No hay pack.yaml en ${packDir}`);
  }
  const packRaw = parseYaml(readFileSync(packYaml, "utf8"));

  const questionsDir = join(packDir, "questions");
  if (existsSync(questionsDir) && statSync(questionsDir).isDirectory()) {
    const files = readdirSync(questionsDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    const questions = files.flatMap((f) =>
      readQuestions(parseYaml(readFileSync(join(questionsDir, f), "utf8"))),
    );
    return assemble(packRaw, questions, questionsDir);
  }

  const single = join(packDir, "questions.yaml");
  const questionsRaw = parseYaml(readFileSync(single, "utf8"));
  return assemble(packRaw, readQuestions(questionsRaw), single);
}

/** Descubre los packs disponibles bajo `packsRoot` (subdirectorios con pack.yaml). */
export function listPacks(packsRoot: string): string[] {
  if (!existsSync(packsRoot)) return [];
  return readdirSync(packsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(packsRoot, d.name, "pack.yaml")))
    .map((d) => d.name)
    .sort();
}
