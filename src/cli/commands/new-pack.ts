import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aptusPaths, assertPackName } from "../../content/paths.js";

const PACK_YAML = (name: string) => `# Pack: ${name} (esqueleto — rellenar)
name: "${name}"
version: "0.1.0"
# Declara aquí las dimensiones de este tema. El motor no las conoce: viven en el pack.
dimensions:
  - dimension-ejemplo
`;

const SAMPLE_QUESTIONS = `# Preguntas de la dimensión 'dimension-ejemplo'. Sustituye por las reales.
# Campos: id, dimension, subtopic?, difficulty(easy|medium|hard|experto),
# type(concepto|diagrama|codigo|escenario), roles[], stem, options[], correct, explanation, source, date.
# Cada opción admite además un 'rationale' OPCIONAL: el apunte que sale al poner el
# cursor encima durante la sesión. Argumenta a favor de ESA opción (también en los
# distractores) y nunca delata cuál es la correcta; con saltos de línea se enseña
# verbatim, así que ahí caben un diagrama o un snippet.
- id: ejemplo-001
  dimension: dimension-ejemplo
  difficulty: easy
  type: concepto
  roles: []
  stem: "Pregunta de ejemplo: ¿cuál es la opción correcta?"
  options:
    - id: a
      text: "Opción correcta"
      rationale: "Por qué alguien elegiría esta, sin decir que es la buena."
    - id: b
      text: "Opción incorrecta"
      rationale: "El argumento que hace plausible este error."
  correct: a
  explanation: "Explicación de ejemplo, suficientemente larga para el validador."
  source: externa
  date: "2026-01-01"
`;

const SOURCES_README = (name: string) => `# Fuentes del pack '${name}' (input aislado)

Deja aquí el material de origen de ESTE tema (apuntes, docs, exportaciones, notas).
Este pack es autocontenido y no comparte contexto con otros.

## Cómo se construye
1. Pon el material en esta carpeta \`sources/\` (o indícame URLs/temario).
2. Se definen las dimensiones en \`../pack.yaml\`.
3. Se curan las preguntas en \`../questions/<dimension>.yaml\` (verificando que la
   respuesta correcta lo es), con dificultad hasta \`experto\`.
4. (Opcional) niveles/roles en \`../readiness.yaml\` para el readiness por rol.

## Salida
- Contenido: esta carpeta  ·  Resultados de sesión: tu directorio de datos (aislado por tema).
- Jugar: \`aptus start --pack ${name}\`
`;

/** Crea el esqueleto aislado de un pack nuevo. Lanza si el pack ya existe. */
export function scaffoldPack(packsRoot: string, name: string): string {
  // Misma exigencia de siempre, ahora compartida con paths.ts: un nombre con
  // separadores no puede llegar a componer una ruta.
  assertPackName(name);
  const packDir = join(packsRoot, name);
  if (existsSync(packDir)) throw new Error(`Ya existe un pack en ${packDir}`);

  mkdirSync(join(packDir, "questions"), { recursive: true });
  mkdirSync(join(packDir, "sources"), { recursive: true });
  writeFileSync(join(packDir, "pack.yaml"), PACK_YAML(name), "utf8");
  writeFileSync(join(packDir, "questions", "dimension-ejemplo.yaml"), SAMPLE_QUESTIONS, "utf8");
  writeFileSync(join(packDir, "sources", "README.md"), SOURCES_README(name), "utf8");
  // readiness.yaml es opcional: se añade al definir niveles/roles del tema.
  return packDir;
}

/**
 * Subcomando `new-pack <nombre>`: crea el esqueleto aislado de un pack de tema
 * nuevo, listo para echarle fuentes y curar el contenido. Primer paso del flujo
 * "le doy fuentes → se arma el pack".
 */
export async function newPackCommand(name: string): Promise<void> {
  try {
    // Todos los packs son tuyos y viven en la misma raíz: no hay contenido de
    // fábrica del que distinguirlos ni instalación en la que no se pueda escribir.
    const dir = scaffoldPack(aptusPaths().packsDir, name);
    console.log(
      `\n✓ Pack '${name}' creado en ${dir}\n` +
        `  1. Deja el material de origen en ${name}/sources/\n` +
        `  2. Define dimensiones en ${name}/pack.yaml y cura ${name}/questions/<dimension>.yaml\n` +
        `  3. Juégalo: aptus start --pack ${name}\n`,
    );
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
