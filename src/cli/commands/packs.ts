import { loadPackDir } from "../../content/loader.js";
import { aptusPaths, listPackEntries } from "../../content/paths.js";
import { DEFAULT_PACK } from "./start.js";

/**
 * Subcomando `packs`: lista los packs de conocimiento disponibles, con sus
 * dimensiones y su nº de preguntas. Base del uso multi-tema (PACK-02).
 *
 * Mira las DOS raíces: los packs que viajan dentro de la instalación (el producto)
 * y los tuyos. Cuando son la misma —trabajar desde el repo— la salida se queda
 * exactamente como estaba; cuando no, cada línea dice de dónde sale el pack,
 * porque saber cuál puedes editar y cuál no es la mitad de la información.
 */
export async function packsCommand(): Promise<void> {
  const entries = listPackEntries();
  const { bundledPacksDir, userPacksDir } = aptusPaths();
  const dosRaices = bundledPacksDir !== userPacksDir;

  if (entries.length === 0) {
    console.log(
      `\nNo hay ningún pack disponible.\n` +
        `  Crea uno con \`aptus new-pack <tema>\` (se creará en ${userPacksDir}).\n`,
    );
    return;
  }

  console.log("\nPacks disponibles:\n");
  for (const { name, origin, dir } of entries) {
    const marca = name === DEFAULT_PACK ? " (por defecto)" : "";
    const procedencia = dosRaices ? (origin === "paquete" ? " [de aptus]" : " [tuyo]") : "";
    try {
      const pack = loadPackDir(dir);
      console.log(
        `  • ${name}${marca}${procedencia} — "${pack.name}": ${pack.questions.length} preguntas, ${pack.dimensions.length} dimensiones`,
      );
    } catch (err) {
      console.log(
        `  • ${name}${procedencia} — ✗ inválido: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      );
    }
  }

  if (dosRaices) {
    console.log(`\nLos tuyos viven en ${userPacksDir}`);
  }
  console.log(`\nUsa: aptus start --pack <nombre>\n`);
}
