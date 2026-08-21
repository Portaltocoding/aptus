import { loadPackDir } from "../../content/loader.js";
import { aptusPaths, listPackEntries } from "../../content/paths.js";

/**
 * Subcomando `packs`: lista los packs de conocimiento que tienes, con sus
 * dimensiones y su nº de preguntas.
 *
 * No hay packs "del producto": aptus se instala vacío y todo lo que aparece aquí
 * lo has puesto tú —escrito a mano o generado con `aptus tema`—. Por eso la lista
 * vacía no es un error ni un estado raro: es el primer día, y lo que toca decir
 * es cómo salir de él.
 */
export async function packsCommand(): Promise<void> {
  const entries = listPackEntries();
  const { packsDir } = aptusPaths();

  if (entries.length === 0) {
    console.log(
      `\nTodavía no tienes ningún pack. aptus viene vacío a propósito: mide lo que tú\n` +
        `le des de comer, no un temario que venga de fábrica.\n\n` +
        `  · Genera uno de un tema:      aptus tema <tema>\n` +
        `  · O desde material que tengas: aptus ingest <carpeta>\n` +
        `  · O empieza por el esqueleto:  aptus new-pack <tema>\n\n` +
        `Se escribirán en ${packsDir}\n`,
    );
    return;
  }

  console.log("\nTus packs:\n");
  for (const { name, dir } of entries) {
    try {
      const pack = loadPackDir(dir);
      console.log(
        `  • ${name} — "${pack.name}": ${pack.questions.length} preguntas, ${pack.dimensions.length} dimensiones`,
      );
    } catch (err) {
      console.log(
        `  • ${name} — ✗ inválido: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      );
    }
  }

  console.log(`\nViven en ${packsDir}`);
  console.log(`\nUsa: aptus start --pack <nombre>\n`);
}
