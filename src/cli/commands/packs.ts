import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { listPacks, loadPackDir } from "../../content/loader.js";
import { DEFAULT_PACK } from "./start.js";

const PACKS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs");

/**
 * Subcomando `packs`: lista los packs de conocimiento disponibles bajo packs/,
 * con sus dimensiones y su nº de preguntas. Base del uso multi-tema (PACK-02).
 */
export async function packsCommand(): Promise<void> {
  const names = listPacks(PACKS_ROOT);

  if (names.length === 0) {
    console.log("\nNo hay packs en packs/. Crea uno con su pack.yaml y su carpeta questions/.\n");
    return;
  }

  console.log("\nPacks disponibles:\n");
  for (const name of names) {
    try {
      const pack = loadPackDir(join(PACKS_ROOT, name));
      const marca = name === DEFAULT_PACK ? " (por defecto)" : "";
      console.log(`  • ${name}${marca} — "${pack.name}": ${pack.questions.length} preguntas, ${pack.dimensions.length} dimensiones`);
    } catch (err) {
      console.log(`  • ${name} — ✗ inválido: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
  }

  console.log(`\nUsa: aptus start --pack <nombre>\n`);
}
