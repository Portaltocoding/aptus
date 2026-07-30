import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeCorruptPdf, makeScannedPdf, makeTextPdf } from "../../test/fixtures/make-pdf.js";
import { briefFromCorpus } from "../core/brief.js";
import { copyToSources, ingestDirectory } from "./ingest.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "aptus-ingest-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Contenido por encima del suelo de tamaño (80 bytes), para que se lea de verdad. */
const relleno = (s: string): string => s + " ".repeat(200);

describe("ingestDirectory", () => {
  it("lee los ficheros de texto y devuelve su ruta relativa", async () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.txt"), relleno("dos"));

    const { docs } = await ingestDirectory(dir);

    expect(docs.map((d) => d.path).sort()).toEqual(["a.md", join("sub", "b.txt")]);
  });

  it("reporta los binarios en vez de tragárselos en silencio", async () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    writeFileSync(join(dir, "apuntes.docx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const { docs, skipped } = await ingestDirectory(dir);

    expect(docs).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/binario.*conviértelo/i);
  });

  it("reporta los ficheros prácticamente vacíos", async () => {
    writeFileSync(join(dir, "vacio.md"), "hola");

    const { docs, skipped } = await ingestDirectory(dir);

    expect(docs).toHaveLength(0);
    expect(skipped[0]!.reason).toMatch(/vacío/i);
  });

  it("ignora node_modules y las carpetas ocultas", async () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "ruido.md"), relleno("ruido"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config.md"), relleno("ruido"));

    const { docs, skipped } = await ingestDirectory(dir);

    expect(docs.map((d) => d.path)).toEqual(["a.md"]);
    // Y tampoco se cuentan como descartados: no son material que el usuario diera.
    expect(skipped).toHaveLength(0);
  });

  it("cuenta los bytes leídos", async () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    expect((await ingestDirectory(dir)).bytes).toBeGreaterThan(80);
  });

  it("una carpeta vacía devuelve vacío, no lanza", async () => {
    expect((await ingestDirectory(dir)).docs).toEqual([]);
  });

  it("una ruta que no existe falla claro y pronto", async () => {
    await expect(ingestDirectory(join(dir, "no-existe"))).rejects.toThrow();
  });

  it("un fichero suelto no es una carpeta y se dice", async () => {
    const f = join(dir, "suelto.md");
    writeFileSync(f, relleno("x"));
    await expect(ingestDirectory(f)).rejects.toThrow(/no es una carpeta/i);
  });
});

/**
 * El PDF es el formato en el que llega el material de cursos: si se descarta, el
 * brief se construye sobre la mitad del temario sin que nadie se entere.
 */
describe("ingestDirectory con PDF", () => {
  const parrafos = [
    "Los transformers usan atencion multi-cabeza para relacionar tokens.",
    "El retrieval augmented generation recupera contexto antes de generar.",
    "La evaluacion de un sistema RAG mide recuperacion y respuesta por separado.",
  ];

  it("un PDF con texto cuenta como documento leído, no como descartado", async () => {
    writeFileSync(join(dir, "temario.pdf"), makeTextPdf(parrafos));

    const { docs, skipped, bytes } = await ingestDirectory(dir);

    expect(skipped).toHaveLength(0);
    expect(docs.map((d) => d.path)).toEqual(["temario.pdf"]);
    expect(docs[0]!.text).toContain("atencion multi-cabeza");
    expect(bytes).toBeGreaterThan(80);
  });

  it("el texto del PDF alimenta los temas y el peso del brief igual que un .md", async () => {
    // El peso de un tema es cuánto material hay escrito de él. Si el PDF entrara
    // vacío, su tema pesaría menos que unas notas de cuatro líneas.
    writeFileSync(join(dir, "transformers.pdf"), makeTextPdf(Array(20).fill(parrafos[0]!)));
    writeFileSync(join(dir, "notas.md"), relleno("apuntes sueltos"));

    const { docs } = await ingestDirectory(dir);
    const brief = briefFromCorpus("ia-aplicada", docs, []);

    const pdf = brief.topics.find((t) => t.evidence.includes("transformers.pdf"));
    const md = brief.topics.find((t) => t.evidence.includes("notas.md"));

    expect(pdf).toBeDefined();
    expect(md).toBeDefined();
    expect(pdf!.weight).toBeGreaterThan(md!.weight);
  });

  it("un PDF escaneado (sin texto) se reporta sin romper la ingesta", async () => {
    writeFileSync(join(dir, "escaneo.pdf"), makeScannedPdf());
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));

    const { docs, skipped } = await ingestDirectory(dir);

    // El resto del material se sigue leyendo: un PDF malo no tumba la carpeta.
    expect(docs.map((d) => d.path)).toEqual(["a.md"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.path).toBe("escaneo.pdf");
    expect(skipped[0]!.reason).toMatch(/escaneo/i);
  });

  it("un PDF corrupto se reporta con motivo, no lanza", async () => {
    writeFileSync(join(dir, "roto.pdf"), makeCorruptPdf());

    const { docs, skipped } = await ingestDirectory(dir);

    expect(docs).toHaveLength(0);
    expect(skipped[0]!.reason).toMatch(/corrupto|ilegible/i);
  });

  it("un PDF sigue teniendo techo de tamaño, pero más alto que el del texto", async () => {
    // 3 MB pasarían del techo de texto plano (2 MB) y aquí se leen igual.
    writeFileSync(join(dir, "gordo.pdf"), makeTextPdf([...parrafos, "x".repeat(3_000_000)]));

    const { docs, skipped } = await ingestDirectory(dir);

    expect(skipped).toHaveLength(0);
    expect(docs).toHaveLength(1);
  });
});

describe("copyToSources", () => {
  it("aplana la jerarquía sin perder de qué carpeta venía cada fichero", async () => {
    mkdirSync(join(dir, "modulos"));
    writeFileSync(join(dir, "modulos", "m01.md"), relleno("# Uno"));

    const destino = join(dir, "_sources");
    const escritos = copyToSources(dir, (await ingestDirectory(dir)).docs, destino);

    expect(escritos).toEqual([`modulos__m01.md`]);
  });

  it("copia el PDF original, no su texto extraído", async () => {
    writeFileSync(
      join(dir, "temario.pdf"),
      makeTextPdf([
        "Atencion y transformers, con material suficiente para pasar el suelo",
        "de tamaño que exige la ingesta antes de contar un documento como leído.",
      ]),
    );

    const destino = join(dir, "_sources");
    const escritos = copyToSources(dir, (await ingestDirectory(dir)).docs, destino);

    expect(escritos).toEqual(["temario.pdf"]);
  });
});
