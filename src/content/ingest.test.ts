import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("lee los ficheros de texto y devuelve su ruta relativa", () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.txt"), relleno("dos"));

    const { docs } = ingestDirectory(dir);

    expect(docs.map((d) => d.path).sort()).toEqual(["a.md", join("sub", "b.txt")]);
  });

  it("reporta los binarios en vez de tragárselos en silencio", () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    writeFileSync(join(dir, "diagrama.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46]));

    const { docs, skipped } = ingestDirectory(dir);

    expect(docs).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/binario.*conviértelo/i);
  });

  it("reporta los ficheros prácticamente vacíos", () => {
    writeFileSync(join(dir, "vacio.md"), "hola");

    const { docs, skipped } = ingestDirectory(dir);

    expect(docs).toHaveLength(0);
    expect(skipped[0]!.reason).toMatch(/vacío/i);
  });

  it("ignora node_modules y las carpetas ocultas", () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "ruido.md"), relleno("ruido"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config.md"), relleno("ruido"));

    const { docs, skipped } = ingestDirectory(dir);

    expect(docs.map((d) => d.path)).toEqual(["a.md"]);
    // Y tampoco se cuentan como descartados: no son material que el usuario diera.
    expect(skipped).toHaveLength(0);
  });

  it("cuenta los bytes leídos", () => {
    writeFileSync(join(dir, "a.md"), relleno("# Uno"));
    expect(ingestDirectory(dir).bytes).toBeGreaterThan(80);
  });

  it("una carpeta vacía devuelve vacío, no lanza", () => {
    expect(ingestDirectory(dir).docs).toEqual([]);
  });

  it("una ruta que no existe falla claro y pronto", () => {
    expect(() => ingestDirectory(join(dir, "no-existe"))).toThrow();
  });

  it("un fichero suelto no es una carpeta y se dice", () => {
    const f = join(dir, "suelto.md");
    writeFileSync(f, relleno("x"));
    expect(() => ingestDirectory(f)).toThrow(/no es una carpeta/i);
  });
});

describe("copyToSources", () => {
  it("aplana la jerarquía sin perder de qué carpeta venía cada fichero", () => {
    mkdirSync(join(dir, "modulos"));
    writeFileSync(join(dir, "modulos", "m01.md"), relleno("# Uno"));

    const destino = join(dir, "_sources");
    const escritos = copyToSources(dir, ingestDirectory(dir).docs, destino);

    expect(escritos).toEqual([`modulos__m01.md`]);
  });
});
