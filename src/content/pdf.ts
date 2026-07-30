import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extracción de texto de PDF. Vive en `src/content/` porque toca disco: `src/core/`
 * sigue siendo puro y no sabe que existen los PDF.
 *
 * Se usa `unpdf` (pdf.js empaquetado como ESM, cero dependencias en tiempo de
 * ejecución, ni binarios nativos ni navegador headless): el material de cursos llega
 * en PDF y no puede exigir una toolchain aparte para leerse.
 *
 * La regla del módulo de ingesta sigue mandando: **un PDF que no se sabe leer no
 * revienta nada y no desaparece**. Todo fallo se convierte en un motivo legible,
 * nunca en una excepción que suba.
 */

export type PdfExtraction =
  { ok: true; text: string; pages: number } | { ok: false; reason: string };

/** Colapsa la sopa de espacios y saltos que suelta pdf.js en párrafos legibles. */
function normalize(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      // \u00a0: pdf.js devuelve espacios duros a menudo; si no se normalizan, el
      // análisis del brief los pega a la palabra y cuenta temas que no existen.
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Traduce el fallo de pdf.js a algo que le sirva a quien pasó la carpeta. Lo que
 * importa no es el nombre de la excepción, es qué tiene que hacer con ese fichero.
 */
function reasonFor(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);

  if (name === "PasswordException" || /password/i.test(msg))
    return "PDF cifrado: quítale la contraseña y vuelve a pasar la ingesta";
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg))
    return "PDF corrupto o no es un PDF de verdad";
  return `PDF ilegible (${msg})`;
}

/**
 * Devuelve el texto de un PDF, o el motivo por el que no lo tiene. Nunca lanza.
 *
 * Un PDF sin texto extraíble casi siempre es un escaneo: páginas que son imágenes.
 * Eso no es un error del fichero ni de aptus, así que se dice tal cual en vez de
 * fingir que se ha leído un documento vacío.
 */
export async function extractPdfText(path: string): Promise<PdfExtraction> {
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    return { ok: false, reason: "no se puede leer" };
  }

  try {
    // verbosity: 0 — pdf.js escribe avisos por stderr ("Indexing all PDF objects")
    // que ensuciarían la salida del CLI sin aportar nada a quien ingesta material.
    const doc = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
    const { totalPages, text } = await extractText(doc, { mergePages: true });
    const limpio = normalize(text);

    if (limpio.length === 0) {
      return { ok: false, reason: "PDF sin texto extraíble: ¿es un escaneo?" };
    }
    return { ok: true, text: limpio, pages: totalPages };
  } catch (err) {
    return { ok: false, reason: reasonFor(err) };
  }
}
