import { describe, expect, it } from "vitest";
import { hasApiCredentials, parseDraft, parsePlan } from "./draft.js";

describe("hasApiCredentials", () => {
  it("con API key hay con qué llamar", () => {
    expect(hasApiCredentials({ ANTHROPIC_API_KEY: "sk-ant-loquesea" })).toBe(true);
  });

  it("un token de sesión vale igual: es lo que deja `ant auth login`", () => {
    expect(hasApiCredentials({ ANTHROPIC_AUTH_TOKEN: "tok" })).toBe(true);
  });

  it("un entorno vacío no tiene credenciales", () => {
    expect(hasApiCredentials({})).toBe(false);
  });

  it("una variable en blanco NO cuenta: existir no es servir", () => {
    expect(hasApiCredentials({ ANTHROPIC_API_KEY: "   " })).toBe(false);
  });
});

/** Una pregunta bien formada, tal y como debe devolverla el modelo. */
function ok(id = "col-borrador-1"): Record<string, unknown> {
  return {
    id,
    dimension: "colas-de-mensajes",
    subtopic: "garantias",
    difficulty: "medium",
    type: "concepto",
    roles: ["Backend Engineer"],
    stem: "¿Qué implica una garantía de entrega at-least-once en una cola?",
    options: [
      { id: "a", text: "Que un mensaje puede entregarse más de una vez" },
      { id: "b", text: "Que un mensaje se entrega exactamente una vez, siempre" },
      { id: "c", text: "Que los mensajes se pierden si el consumidor cae" },
      { id: "d", text: "Que el orden global queda garantizado" },
    ],
    correct: "a",
    explanation:
      "At-least-once reintenta ante la duda, así que puede duplicar; por eso hace falta idempotencia.",
    source: "m02.md",
    date: "2026-07-30",
  };
}

const wrap = (questions: unknown[]): string => JSON.stringify({ questions });

describe("parseDraft", () => {
  it("acepta una pregunta bien formada", () => {
    const { valid, rejected } = parseDraft(wrap([ok()]));

    expect(rejected).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.id).toBe("col-borrador-1");
  });

  it("descarta —sin tirar el resto— una pregunta cuyo 'correct' no apunta a ninguna opción", () => {
    const mala = { ...ok("mala-1"), correct: "z" };
    const { valid, rejected } = parseDraft(wrap([ok(), mala]));

    expect(valid.map((q) => q.id)).toEqual(["col-borrador-1"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.id).toBe("mala-1");
    expect(rejected[0]!.reason).toMatch(/correct/);
  });

  it("descarta una pregunta con una sola opción", () => {
    const mala = { ...ok("mala-2"), options: [{ id: "a", text: "única" }], correct: "a" };
    const { rejected } = parseDraft(wrap([mala]));

    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.id).toBe("mala-2");
  });

  it("descarta una dificultad que el pack no reconoce", () => {
    const mala = { ...ok("mala-3"), difficulty: "imposible" };
    expect(parseDraft(wrap([mala])).rejected).toHaveLength(1);
  });

  it("identifica por posición lo que ni siquiera trae id", () => {
    const { rejected } = parseDraft(wrap([{ dimension: "x" }]));
    expect(rejected[0]!.id).toBe("#1");
  });

  it("un JSON roto no escribe nada: lanza", () => {
    expect(() => parseDraft("{no es json")).toThrow(/no es JSON válido/i);
  });

  it("una respuesta sin lista de preguntas lanza en vez de devolver vacío en silencio", () => {
    expect(() => parseDraft(JSON.stringify({ resultado: "ninguno" }))).toThrow(
      /ninguna lista de preguntas/i,
    );
  });

  it("una lista vacía es válida: el modelo puede no estar seguro de nada", () => {
    const { valid, rejected } = parseDraft(wrap([]));
    expect(valid).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

/**
 * El plan de dimensiones que devuelve el modelo. Se valida igual de duro que las
 * preguntas: un nombre de dimensión da nombre a un fichero y es la clave del
 * readiness, así que no puede entrar tal cual venga.
 */
describe("parsePlan", () => {
  const json = (dimensions: unknown): string => JSON.stringify({ dimensions });

  it("normaliza los nombres a kebab-case", () => {
    // El modelo devuelve a veces "Colas de Mensajes"; el pack necesita un nombre
    // de fichero. Normalizar aquí evita que cada consumidor lo haga a su manera.
    const plan = parsePlan(json([{ name: "Colas de Mensajes", foco: "Kafka y compañía." }]));

    expect(plan).toEqual([{ name: "colas-de-mensajes", foco: "Kafka y compañía." }]);
  });

  it("descarta duplicados que aparecen al normalizar", () => {
    const plan = parsePlan(
      json([
        { name: "Redes", foco: "uno" },
        { name: "redes", foco: "dos" },
      ]),
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]!.foco).toBe("uno"); // gana la primera, no la última
  });

  it("descarta nombres que no dan para un fichero", () => {
    const plan = parsePlan(
      json([
        { name: "!!", foco: "ruido" },
        { name: "consenso", foco: "Raft." },
      ]),
    );

    expect(plan.map((d) => d.name)).toEqual(["consenso"]);
  });

  it("un JSON roto no escribe nada: lo dice", () => {
    expect(() => parsePlan("{ esto no es json")).toThrow(/JSON/i);
  });

  it("una respuesta sin lista de dimensiones también", () => {
    expect(() => parsePlan(JSON.stringify({ otra_cosa: [] }))).toThrow(/dimensiones/i);
  });

  it("si no queda ninguna utilizable, falla en vez de devolver un pack sin esqueleto", () => {
    expect(() => parsePlan(json([{ name: "!!", foco: "x" }]))).toThrow(/utilizable/i);
  });
});
