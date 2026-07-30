import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import { DIFFICULTY_PRESETS, parseDifficulty, resolveSetup, sampleWarning } from "./setup.js";
import { validateDimensionName } from "./new-dimension.js";

const PACKS_ROOT = new URL("../../packs/", import.meta.url).pathname;
const DEFAULT_PACK = "ai-ml-readiness";

function q(id: string, dimension: string, difficulty: Question["difficulty"] = "easy"): Question {
  return {
    id,
    dimension,
    difficulty,
    type: "concepto",
    roles: [],
    stem: "Enunciado de prueba suficientemente largo.",
    options: [
      { id: "a", text: "una" },
      { id: "b", text: "otra" },
    ],
    correct: "a",
    explanation: "Explicación de prueba.",
    source: "fixture",
    date: "2026-01-01",
  };
}

describe("parseDifficulty", () => {
  it("acepta los ids de preset", () => {
    expect(parseDifficulty("todas")).toBeNull();
    expect(parseDifficulty("base")).toEqual(["easy", "medium"]);
    expect(parseDifficulty("alta")).toEqual(["hard", "experto"]);
    expect(parseDifficulty("experto")).toEqual(["experto"]);
  });

  it("acepta una lista suelta de tramos", () => {
    expect(parseDifficulty("easy,hard")).toEqual(["easy", "hard"]);
    expect(parseDifficulty(" MEDIUM , experto ")).toEqual(["medium", "experto"]);
  });

  it("rechaza lo que no reconoce, diciendo qué vale", () => {
    expect(() => parseDifficulty("dificilisimo")).toThrow(/no reconocida/i);
    expect(() => parseDifficulty("dificilisimo")).toThrow(/todas/);
    expect(() => parseDifficulty("")).toThrow();
  });

  it("todos los presets declaran tramos válidos (o null para 'todas')", () => {
    for (const p of DIFFICULTY_PRESETS) {
      expect(p.difficulties === null || p.difficulties.length > 0).toBe(true);
    }
  });
});

describe("sampleWarning", () => {
  const banco = (n: number, dims = 1): Question[] =>
    Array.from({ length: n }, (_, i) => q(`q-${i}`, `dim-${i % dims}`));

  it("avisa si el filtro deja el banco vacío", () => {
    expect(sampleWarning([], 120)).toMatch(/ninguna pregunta/i);
  });

  it("avisa si quedan tan pocas que la sesión es un sondeo", () => {
    expect(sampleWarning(banco(9), 120)).toMatch(/sondeo/i);
  });

  it("avisa de dimensiones con poca muestra aunque el total sea grande", () => {
    const desequilibrado = [...banco(40, 1), q("raro-1", "dim-flojo"), q("raro-2", "dim-flojo")];
    expect(sampleWarning(desequilibrado, 120)).toMatch(/dim-flojo/);
  });

  it("no avisa cuando la muestra da para concluir algo", () => {
    expect(sampleWarning(banco(60, 3), 60)).toBeNull();
  });
});

// resolveSetup no interactivo: el camino que usan los scripts, `--yes` y los
// tests. Nunca debe abrir un prompt (aquí no hay TTY).
describe("resolveSetup (no interactivo)", () => {
  const opts = { interactive: false };

  it("sin flags cae al pack por defecto y al banco entero", async () => {
    const setup = await resolveSetup(PACKS_ROOT, opts, 120, DEFAULT_PACK);

    expect(setup).not.toBeNull();
    expect(setup!.packName).toBe(DEFAULT_PACK);
    expect(setup!.dimensions).toBeNull();
    expect(setup!.difficulties).toBeNull();
    expect(setup!.target).toBe(120);
    expect(setup!.bank).toHaveLength(setup!.pack.questions.length);
  });

  it("acota el banco a las dimensiones pedidas", async () => {
    const setup = await resolveSetup(
      PACKS_ROOT,
      { ...opts, dims: "ml-clasico" },
      120,
      DEFAULT_PACK,
    );

    expect(new Set(setup!.bank.map((x) => x.dimension))).toEqual(new Set(["ml-clasico"]));
    expect(setup!.bank.length).toBeLessThan(setup!.pack.questions.length);
  });

  it("acota el banco al tramo de dificultad pedido", async () => {
    const setup = await resolveSetup(
      PACKS_ROOT,
      { ...opts, difficulty: "experto" },
      120,
      DEFAULT_PACK,
    );

    expect(setup!.bank.every((x) => x.difficulty === "experto")).toBe(true);
    expect(setup!.bank.length).toBeGreaterThan(0);
  });

  it("una dimensión mal escrita falla con un mensaje, no con una sesión vacía", async () => {
    await expect(
      resolveSetup(PACKS_ROOT, { ...opts, dims: "no-existe" }, 120, DEFAULT_PACK),
    ).rejects.toThrow(/dimensión desconocida/i);
  });

  it("un cruce de filtros sin material falla antes de empezar la sesión", async () => {
    await expect(
      resolveSetup(
        PACKS_ROOT,
        { ...opts, dims: "comportamental-star", difficulty: "nada" },
        120,
        DEFAULT_PACK,
      ),
    ).rejects.toThrow();
  });
});

describe("validateDimensionName", () => {
  it("acepta un nombre normal y lo mide ya en kebab-case", () => {
    expect(validateDimensionName("Sistemas Distribuidos", [])).toBe(true);
  });

  it("rechaza lo que no deja nada útil tras normalizar", () => {
    expect(validateDimensionName("", [])).toMatch(/3 caracteres/);
    expect(validateDimensionName("!!", [])).toMatch(/3 caracteres/);
  });

  it("rechaza una dimensión que ya existe, comparando en kebab-case", () => {
    expect(validateDimensionName("Colas de Mensajes", ["colas-de-mensajes"])).toMatch(/ya existe/);
  });
});
