import pc from "picocolors";
import type { Question } from "../content/schema.js";
import type { Difficulty } from "../core/session.js";

/**
 * Vocabulario visual del CLI: colores, etiquetas y el tema de los prompts.
 *
 * Está aparte de `render.ts` a propósito: `render.ts` formatea RESULTADOS (tablas
 * de scoring, readiness, gaps) y esto viste la SESIÓN en vivo. Aquí no se calcula
 * nada; si algo de esto desaparece, los números no cambian.
 *
 * Regla de color que sigue todo el fichero: el enunciado y las opciones nunca se
 * pintan igual. Leer una pregunta no debería costar esfuerzo de vista.
 */

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "fácil",
  medium: "media",
  hard: "difícil",
  experto: "experto",
};

/** Color por tramo: el mismo criterio ascendente que usa el readiness por nivel. */
export function difficultyColor(d: Difficulty): (s: string) => string {
  if (d === "easy") return pc.green;
  if (d === "medium") return pc.yellow;
  if (d === "hard") return pc.magenta;
  return pc.red;
}

/**
 * Ancho de referencia cuando NO hay terminal: pipes, CI, tests. Es el 72 de
 * siempre, y ese es justo el punto — sin TTY la salida tiene que seguir siendo
 * byte a byte la de antes, o cada test y cada `| less` empezarían a depender de
 * en qué máquina se ejecutan.
 */
export const DEFAULT_WIDTH = 72;
/** Por debajo de esto no se dibuja nada legible; se deja de encoger. */
export const MIN_WIDTH = 24;
/**
 * Tope. Una regla de 300 caracteres en un monitor ancho no es aprovechar el
 * espacio: es texto que hay que recorrer con la cabeza para leer una línea.
 */
export const MAX_WIDTH = 100;

/**
 * El ancho con el que se dibuja (SESS-07). Función pura: las columnas entran como
 * argumento y la capa de I/O es quien lee `process.stdout.columns`.
 *
 * `columns` es `undefined` cuando la salida no es un terminal, y puede llegar con
 * basura (0, NaN) en terminales que se están redimensionando: los dos casos caen
 * al ancho por defecto en vez de dibujar una regla de longitud negativa.
 */
export function termWidth(columns: number | undefined = process.stdout.columns): number {
  if (typeof columns !== "number" || !Number.isFinite(columns) || columns <= 0) {
    return DEFAULT_WIDTH;
  }
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(columns)));
}

/**
 * Reparte un párrafo en líneas que caben en `width`, respetando los saltos que ya
 * trae el texto. Palabra más larga que el hueco: se deja salir en vez de cortarla
 * a mitad — partir un identificador o una URL hace más daño que desbordar.
 *
 * Vive aquí (y no en `render-mistakes.ts`, de donde viene) porque ajustar texto al
 * ancho es vocabulario visual de TODO el CLI: lo usan el repaso de fallos y ahora
 * también el enunciado y el apunte de una opción en la sesión en vivo.
 */
export function wrap(text: string, width: number, indent = ""): string[] {
  const hueco = Math.max(8, width - indent.length);
  const salida: string[] = [];

  for (const parrafo of text.split("\n")) {
    const palabras = parrafo.split(/\s+/).filter((p) => p.length > 0);
    if (palabras.length === 0) {
      salida.push(indent.trimEnd());
      continue;
    }
    let linea = "";
    for (const palabra of palabras) {
      if (linea.length === 0) linea = palabra;
      else if (linea.length + 1 + palabra.length <= hueco) linea += " " + palabra;
      else {
        salida.push(indent + linea);
        linea = palabra;
      }
    }
    if (linea.length > 0) salida.push(indent + linea);
  }

  return salida;
}

/**
 * Título de sección: texto en negrita seguido de una regla que llena el ancho.
 *
 * Si el título no cabe se recorta con puntos suspensivos: antes se pasaba de largo
 * y el terminal lo partía por donde le tocara, dejando media palabra en la línea
 * siguiente con la regla detrás.
 */
export function heading(text: string, width = termWidth()): string {
  const max = Math.max(1, width - 2); // hueco para el espacio y al menos un ─
  const corto = text.length > max ? text.slice(0, Math.max(1, max - 1)) + "…" : text;
  const relleno = Math.max(0, width - corto.length - 1); // -1 por el espacio separador
  return pc.bold(corto) + " " + pc.dim("─".repeat(relleno));
}

/**
 * Ancho de la barra de avance. Deja sitio a lo que la acompaña en la misma línea
 * ("Pregunta 120/120" y sus dos espacios) y no crece por encima de los 18 de
 * siempre: la barra dice una fracción, y una fracción no se lee mejor por medir
 * media pantalla.
 */
export function progressWidth(total = termWidth()): number {
  return Math.max(6, Math.min(18, total - 22));
}

/** Barra de avance de la sesión (solo posición: no dice nada de tu acierto). */
export function progressBar(done: number, total: number, width = progressWidth()): string {
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return pc.cyan("▓".repeat(filled)) + pc.dim("░".repeat(width - filled));
}

/**
 * Ancho de las barras que van DENTRO de una celda de tabla. Se encogen antes que
 * la barra de avance porque comparten fila con el porcentaje y con el N, y son lo
 * primero que hace desbordar una tabla en un terminal estrecho.
 */
export function cellBarWidth(total = termWidth()): number {
  return total < DEFAULT_WIDTH ? 10 : 20;
}

/**
 * Anchos de columna de una tabla, o `undefined` para que cli-table3 mida por
 * contenido — que es lo correcto MIENTRAS QUEPA, y es lo que se ha hecho hasta
 * hoy. Solo cuando el terminal es más estrecho que el ancho de referencia se
 * reparte el espacio real entre las columnas y se deja que el texto haga salto de
 * línea dentro de la celda, que es lo que evita la tabla escalonada.
 *
 * El corte está en `DEFAULT_WIDTH` a propósito: sin TTY el ancho ES el de
 * referencia, así que esta función devuelve `undefined` y la salida de pipes, CI y
 * tests no cambia ni un byte.
 */
export function tableWidths(columnas: number, total = termWidth()): number[] | undefined {
  if (columnas <= 0 || total >= DEFAULT_WIDTH) return undefined;
  // Los bordes verticales son `columnas + 1`; el padding lo cuenta cli-table3.
  const porColumna = Math.floor((total - (columnas + 1)) / columnas);
  return Array.from({ length: columnas }, () => Math.max(6, porColumna));
}

/**
 * Cabecera de una pregunta: dónde estás, de qué va y cuánto pesa.
 *
 * Va ENTERA en tenue salvo la dificultad (que sí informa de un vistazo). El cian
 * dejó de vivir aquí a propósito: ahora viste el enunciado, y tener la dimensión
 * del mismo color que la pregunta repartía el acento entre dos sitios en vez de
 * marcar la jerarquía cabecera → enunciado → respuestas.
 */
export function questionHeader(
  index: number,
  total: number,
  dimension: string,
  subtopic: string | undefined,
  difficulty: Difficulty,
): string {
  const posicion = pc.dim(`Pregunta ${index}/${total}`);
  const barra = progressBar(index - 1, total);
  const partes = [
    pc.dim(dimension),
    subtopic ? pc.dim(subtopic) : null,
    difficultyColor(difficulty)(DIFFICULTY_LABEL[difficulty]),
  ]
    .filter((p): p is string => p !== null)
    .join(pc.dim(" · "));

  return `${posicion}  ${barra}\n  ${partes}`;
}

/** Sangría del enunciado y de todo lo que cuelga de él en la sesión en vivo. */
const SANGRIA_PREGUNTA = "  ";

/**
 * El enunciado, vestido y ajustado al ancho real.
 *
 * Dos cosas que antes no hacía. Una: se pinta en CIAN y en negrita, no solo en
 * negrita — la negrita sola apenas se distingue del color por defecto de las
 * opciones, y era justo el contraste que faltaba para separar de un vistazo la
 * pregunta de las respuestas. Dos: se ajusta al ancho, salvo `diagrama` y
 * `codigo`, que se indentan VERBATIM: reflowear un ASCII lo convierte en ruido y
 * un snippet en algo que no compila (mismo criterio que el repaso de fallos).
 */
export function questionStem(stem: string, type: Question["type"], width = termWidth()): string {
  const lineas =
    type === "diagrama" || type === "codigo"
      ? stem.split("\n").map((l) => SANGRIA_PREGUNTA + l)
      : wrap(stem, width, SANGRIA_PREGUNTA);
  return lineas.map((l) => pc.bold(pc.cyan(l))).join("\n");
}

/**
 * El apunte de la opción bajo el cursor: lo que sale "al pasar por encima".
 *
 * Va en tenue y colgando de una barra para que se lea como un margen y no como
 * una quinta opción. Con saltos de línea se respeta VERBATIM (es un diagrama o un
 * snippet); de una tirada se ajusta al ancho.
 */
export function optionNote(rationale: string, width = termWidth()): string {
  const sangria = "   │ ";
  const lineas = rationale.includes("\n")
    ? // Con saltos de línea se va línea a línea: la que CABE se respeta tal cual
      // (es la que dibuja el diagrama, y `wrap` colapsaría sus espacios), y solo
      // la que no cabe se ajusta. Antes se respetaban todas, y un párrafo largo
      // metido junto a un diagrama se salía del ancho y lo partía el terminal por
      // donde le tocaba, sin barra y sin sangría.
      rationale
        .split("\n")
        .flatMap((l) =>
          sangria.length + l.length <= width ? [sangria + l] : wrap(l, width, sangria),
        )
    : wrap(rationale, width, sangria);
  return lineas.map((l) => pc.dim(l)).join("\n");
}

/**
 * Tema de `@inquirer/prompts` para la sesión. El mensaje NO se recolorea (se
 * compone ya vestido en el runner) y la opción bajo el cursor va en cian y
 * negrita: el contraste entre pregunta y respuestas es el que faltaba.
 */
export const promptTheme = {
  prefix: pc.dim("›"),
  icon: { cursor: "❯" },
  style: {
    message: (text: string): string => text,
    highlight: (text: string): string => pc.bold(pc.cyan(text)),
    help: (text: string): string => pc.dim(text),
    answer: (text: string): string => pc.cyan(text),
  },
};

/**
 * Igual, pero para la pregunta: sin prefijo (ya trae su propia cabecera, y un `›`
 * delante solo desalinea el bloque) y con la opción bajo el cursor en AMARILLO en
 * vez de cian. Tres colores, tres niveles: cabecera tenue, enunciado cian, la
 * respuesta que estás mirando amarilla. Con el cursor también en cian, mirar una
 * opción la pintaba del mismo color que el enunciado.
 */
export const questionTheme = {
  ...promptTheme,
  prefix: "",
  style: {
    ...promptTheme.style,
    highlight: (text: string): string => pc.bold(pc.yellow(text)),
    // El apunte llega ya vestido de `optionNote` (tenue, con su barra y su
    // sangría). Recolorearlo entero aquí —lo que hace inquirer por defecto— se
    // cargaría el verbatim de un diagrama y lo pintaría como si fuera una opción
    // más. En el resto de menús la descripción sigue siendo la de siempre.
    description: (text: string): string => text,
  },
};
