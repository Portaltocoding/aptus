/**
 * Salir de un prompt con ESC.
 *
 * `@inquirer/prompts` no trae "volver atrás": lo único que interrumpe un prompt es
 * Ctrl+C, que mata el proceso entero. Eso convierte cualquier equivocación a mitad
 * del asistente en volver a empezar desde la terminal.
 *
 * La vía sin reimplementar los prompts: cada uno acepta un `AbortSignal` en su
 * contexto, y abortarlo lanza `AbortPromptError`. Así que aquí se escucha stdin en
 * paralelo, y cuando llega un ESC suelto se aborta el prompt y se devuelve un
 * centinela — quien llama decide qué significa "atrás" en su pantalla.
 */

/** Lo que devuelve un prompt del que se ha salido con ESC. */
export const ESCAPED = Symbol("escaped");
export type Escapable<T> = T | typeof ESCAPED;

const ESC = 0x1b;

/**
 * Un ESC suelto es la tecla; un ESC seguido de más bytes es el prefijo de una
 * secuencia (flechas, inicio, fin...). El terminal manda las secuencias en un
 * mismo chunk, así que distinguirlas por longitud es fiable en la práctica y no
 * obliga a mantener un temporizador que además retrasaría cada flecha.
 */
export function isEscapeKey(chunk: Buffer): boolean {
  return chunk.length === 1 && chunk[0] === ESC;
}

/**
 * Ejecuta un prompt permitiendo salir con ESC. Devuelve `ESCAPED` si se ha salido.
 *
 * El listener se quita SIEMPRE al terminar: dejarlo puesto haría que un ESC en la
 * pantalla siguiente abortara un prompt que ya no existe.
 */
export async function withEscape<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<Escapable<T>> {
  const controller = new AbortController();
  const onData = (chunk: Buffer): void => {
    if (isEscapeKey(chunk)) controller.abort();
  };

  // Sin TTY no hay teclas que escuchar (scripts, CI, pipes), pero la traducción
  // del abort SÍ se aplica igual: que el resultado dependa de si hay terminal
  // sería una diferencia de comportamiento invisible y muy cara de depurar.
  const tty = process.stdin.isTTY === true;
  if (tty) process.stdin.on("data", onData);

  try {
    return await run(controller.signal);
  } catch (err) {
    // Ctrl+C (ExitPromptError) NO cae aquí a propósito: "volver atrás" y "sal del
    // programa" son intenciones distintas y quien llama las trata distinto.
    if (err instanceof Error && err.name === "AbortPromptError") return ESCAPED;
    throw err;
  } finally {
    if (tty) process.stdin.off("data", onData);
  }
}

/** Pista de teclado, para que ESC se vea en pantalla en vez de haber que adivinarlo. */
export const ESC_HINT = "esc vuelve atrás";
