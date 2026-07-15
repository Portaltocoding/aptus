import { existsSync, readFileSync } from "node:fs";

/**
 * Frontera de I/O para la oferta (JD): leerla del disco y poco más. El texto de
 * una oferta no tiene estructura que validar (es prosa pegada de LinkedIn o de
 * donde sea), así que aquí no hay schema: solo se comprueba que exista y que no
 * venga vacía, y se falla rápido con un mensaje claro como en `loadPack`.
 * Todo el análisis vive puro en `src/core/jd.ts`.
 */
export function loadJdText(pathToFile: string): string {
  if (!existsSync(pathToFile)) {
    throw new Error(`No existe el fichero de la oferta: ${pathToFile}`);
  }

  let text: string;
  try {
    text = readFileSync(pathToFile, "utf8");
  } catch (err) {
    throw new Error(
      `No se puede leer la oferta en ${pathToFile}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (text.trim().length === 0) {
    throw new Error(`La oferta en ${pathToFile} está vacía. Pega el texto del puesto y vuelve a intentarlo.`);
  }

  return text;
}
