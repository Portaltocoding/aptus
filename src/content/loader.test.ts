import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPack } from "./loader.js";

const FIXTURES = new URL("../../test/fixtures/", import.meta.url);
const MINI_PACK_YAML = new URL("mini-pack/pack.yaml", FIXTURES).pathname;
const MINI_PACK_QUESTIONS = new URL("mini-pack/questions.yaml", FIXTURES).pathname;
const CORRECT_SIN_REFERENCIA = new URL(
  "invalid-packs/correct-sin-referencia.yaml",
  FIXTURES,
).pathname;
const MENOS_DE_DOS_OPCIONES = new URL(
  "invalid-packs/menos-de-dos-opciones.yaml",
  FIXTURES,
).pathname;

describe("loadPack", () => {
  it("carga un mini-pack válido y devuelve datos tipados con todas las preguntas y su metadata", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);

    expect(pack.name).toBe("mini-pack");
    expect(pack.dimensions).toEqual(["dimension-alpha", "dimension-beta"]);
    expect(pack.questions.length).toBe(14);

    const first = pack.questions[0]!;
    expect(first.id).toBe("alpha-001");
    expect(first.dimension).toBe("dimension-alpha");
    expect(first.difficulty).toBe("easy");
    expect(first.options.length).toBeGreaterThanOrEqual(2);
    expect(first.correct).toBe("a");
    expect(first.explanation).toBeTruthy();
  });

  it("conserva el subtopic cuando el pack lo declara", () => {
    const pack = loadPack(MINI_PACK_YAML, MINI_PACK_QUESTIONS);
    const withSubtopic = pack.questions.find((q) => q.id === "alpha-001");

    expect(withSubtopic?.subtopic).toBe("subtopic-alpha-1");
  });

  it("rechaza un pack cuyo correct no referencia ningún option.id existente", () => {
    expect(() => loadPack(CORRECT_SIN_REFERENCIA, CORRECT_SIN_REFERENCIA)).toThrow();

    try {
      loadPack(CORRECT_SIN_REFERENCIA, CORRECT_SIN_REFERENCIA);
      throw new Error("no debería llegar aquí");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("correct");
      expect(message).toContain("invalid-correct-001");
    }
  });

  it("rechaza un pack con una pregunta con menos de 2 options", () => {
    expect(() => loadPack(MENOS_DE_DOS_OPCIONES, MENOS_DE_DOS_OPCIONES)).toThrow();

    try {
      loadPack(MENOS_DE_DOS_OPCIONES, MENOS_DE_DOS_OPCIONES);
      throw new Error("no debería llegar aquí");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("options");
    }
  });

  it("rechaza un pack al que le falta explanation en una pregunta (metadata obligatoria)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aptus-loader-test-"));
    const path = join(dir, "sin-explanation.yaml");
    writeFileSync(
      path,
      `name: invalid-pack-sin-explanation
version: "1.0.0"
dimensions:
  - dimension-alpha
questions:
  - id: sin-explanation-001
    dimension: dimension-alpha
    difficulty: easy
    roles: []
    stem: "Pregunta sin explanation."
    options:
      - id: a
        text: "Opción A"
      - id: b
        text: "Opción B"
    correct: a
    source: fixture
    date: "2026-01-01"
`,
      "utf8",
    );

    expect(() => loadPack(path, path)).toThrow();

    try {
      loadPack(path, path);
      throw new Error("no debería llegar aquí");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("explanation");
    }
  });

  it("el mensaje de error es legible (menciona el fichero, no es un stack trace crudo)", () => {
    try {
      loadPack(MENOS_DE_DOS_OPCIONES, MENOS_DE_DOS_OPCIONES);
      throw new Error("no debería llegar aquí");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("at Object.<anonymous>");
      expect(message).toContain(MENOS_DE_DOS_OPCIONES);
    }
  });
});
