import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { loadPackDir } from "../../content/loader.js";
import { auditPack } from "../../core/pack-audit.js";
import { DEFAULT_PACK } from "./start.js";

const PACKS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs");

/**
 * Subcomando `verify-pack <tema>`: valida (schema) y AUDITA la calidad de un pack
 * (ids únicos, cobertura por dimensión, tramo experto, relleno sin curar...).
 * Control "curadas, no relleno". Exit code != 0 si hay errores.
 */
export async function verifyPackCommand(packName: string = DEFAULT_PACK): Promise<void> {
  let pack;
  try {
    pack = loadPackDir(join(PACKS_ROOT, packName));
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const { errors, warnings } = auditPack(pack);

  console.log(`\nAuditoría de '${packName}' — ${pack.questions.length} preguntas, ${pack.dimensions.length} dimensiones`);

  for (const e of errors) {
    console.log(`  ${pc.red("✗ ERROR")} [${e.code}] ${e.message}${e.questionId ? ` (${e.questionId})` : ""}`);
  }
  for (const w of warnings) {
    console.log(`  ${pc.yellow("⚠ aviso")} [${w.code}] ${w.message}${w.questionId ? ` (${w.questionId})` : ""}`);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`  ${pc.green("✓ limpio")}: pasa schema y auditoría de calidad.\n`);
    return;
  }

  console.log(`\n  Resumen: ${errors.length} errores, ${warnings.length} avisos.\n`);
  if (errors.length > 0) process.exitCode = 1;
}
