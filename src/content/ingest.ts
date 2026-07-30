import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import type { CorpusDoc } from "../core/brief.js";

/**
 * Ingesta de una carpeta de material: recorre, filtra y lee. Es la frontera de I/O
 * de `aptus ingest`; el análisis vive entero en `src/core/brief.ts`.
 *
 * Dos reglas que gobiernan todo el fichero:
 *
 * 1. **Nunca descartar en silencio.** Un PDF que no se sabe leer, un fichero
 *    demasiado grande o una extensión desconocida se CUENTAN y se reportan. Si no,
 *    el brief parecería completo cubriendo la mitad del material.
 * 2. **Solo texto.** No se convierten formatos binarios (PDF, docx, vídeo): eso
 *    exigiría dependencias pesadas y adivinar. Se dice cuáles hay y se pide
 *    convertirlos, que es un minuto de trabajo y cero magia.
 */

/** Extensiones que se leen como texto plano. Todo lo demás se reporta sin leer. */
export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".rst",
  ".adoc",
  ".org",
  ".yaml",
  ".yml",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".sql",
  ".sh",
  ".html",
  ".css",
  ".ipynb",
]);

/** Carpetas que nunca aportan temario y sí mucho ruido. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".venv",
  "__pycache__",
  ".next",
]);

/** Techo por fichero: por encima de esto es un volcado, no material de estudio. */
const MAX_FILE_BYTES = 2_000_000;
/** Suelo por fichero: un texto de dos líneas no define un tema. */
const MIN_FILE_BYTES = 80;

export interface IngestResult {
  docs: CorpusDoc[];
  /** Ficheros vistos y NO leídos, con el motivo. Se reportan siempre. */
  skipped: { path: string; reason: string }[];
  /** Bytes de texto efectivamente leídos. */
  bytes: number;
}

function walk(dir: string, root: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // carpeta ilegible: se ignora en vez de tumbar la ingesta entera
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") && e.isDirectory()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

/**
 * Lee recursivamente el material de `dir`. Devuelve los documentos legibles y la
 * lista de lo que se ha dejado fuera con su motivo — esa segunda lista es tan
 * importante como la primera: es lo que impide creerse un brief incompleto.
 */
export function ingestDirectory(dir: string): IngestResult {
  const stats = statSync(dir); // lanza si no existe: que falle claro y pronto
  if (!stats.isDirectory()) throw new Error(`No es una carpeta: ${dir}`);

  const files: string[] = [];
  walk(dir, dir, files);

  const docs: CorpusDoc[] = [];
  const skipped: IngestResult["skipped"] = [];
  let bytes = 0;

  for (const full of files) {
    const rel = relative(dir, full);
    const ext = extname(full).toLowerCase();

    if (!TEXT_EXTENSIONS.has(ext)) {
      const motivo =
        ext === ".pdf" || ext === ".docx" || ext === ".epub" || ext === ".pptx"
          ? `formato binario (${ext}): conviértelo a texto y vuelve a pasar la ingesta`
          : `extensión no soportada (${ext || "sin extensión"})`;
      skipped.push({ path: rel, reason: motivo });
      continue;
    }

    let size;
    try {
      size = statSync(full).size;
    } catch {
      skipped.push({ path: rel, reason: "no se puede leer" });
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      skipped.push({ path: rel, reason: `demasiado grande (${Math.round(size / 1024)} KB)` });
      continue;
    }
    if (size < MIN_FILE_BYTES) {
      skipped.push({ path: rel, reason: "prácticamente vacío" });
      continue;
    }

    try {
      const text = readFileSync(full, "utf8");
      docs.push({ path: rel, text });
      bytes += size;
    } catch {
      skipped.push({ path: rel, reason: "no se puede leer como texto (¿binario?)" });
    }
  }

  return { docs, skipped, bytes };
}

/**
 * Copia el material legible a `packs/<tema>/sources/`, que es donde un pack guarda
 * de dónde salió su contenido. Aplana la jerarquía prefijando la ruta original en
 * el nombre para no perder de qué carpeta venía cada cosa.
 *
 * Devuelve los nombres escritos. No borra ni sobrescribe fuera de `sources/`.
 */
export function copyToSources(dir: string, docs: CorpusDoc[], sourcesDir: string): string[] {
  mkdirSync(sourcesDir, { recursive: true });

  const written: string[] = [];
  for (const doc of docs) {
    const flat = doc.path.replace(/[/\\]/g, "__");
    const destino = join(sourcesDir, flat);
    copyFileSync(join(dir, doc.path), destino);
    written.push(basename(destino));
  }
  return written.sort();
}
