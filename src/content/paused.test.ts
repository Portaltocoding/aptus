import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearPaused,
  loadPaused,
  restorePaused,
  savePaused,
  type PausedSession,
} from "./paused.js";
import type { Question } from "./schema.js";
import type { SessionSnapshot } from "../core/session.js";

function tmpFile(name = "paused.json"): string {
  return join(mkdtempSync(join(tmpdir(), "aptus-paused-")), name);
}

function makeQuestion(id: string, options = ["a", "b", "c"]): Question {
  return {
    id,
    dimension: "dim-uno",
    difficulty: "medium",
    type: "concepto",
    roles: [],
    stem: `Enunciado de ${id}`,
    options: options.map((o) => ({ id: o, text: `Opción ${o.toUpperCase()}` })),
    correct: "a",
    explanation: "Explicación de prueba.",
    source: "fixture",
    date: "2026-01-01",
  };
}

const SNAPSHOT: SessionSnapshot = {
  index: 2,
  questions: [
    { id: "q1", options: ["c", "a", "b"] },
    { id: "q2", options: ["b", "c", "a"] },
    { id: "q3", options: ["a", "b", "c"] },
  ],
  answers: [
    ["q1", "c"],
    ["q2", "a"],
  ],
  confidences: [
    ["q1", "alta"],
    ["q2", "baja"],
  ],
};

const SAMPLE: PausedSession = {
  pack: "ai-ml-readiness",
  kind: "measure",
  timestamp: "2026-08-10T10:00:00.000Z",
  snapshot: SNAPSHOT,
};

describe("store de la sesión en pausa", () => {
  it("guarda y recarga sin pérdida (round-trip)", () => {
    const path = tmpFile();
    savePaused(path, SAMPLE);
    expect(loadPaused(path)).toEqual(SAMPLE);
  });

  it("crea el directorio si no existe al guardar", () => {
    const path = join(mkdtempSync(join(tmpdir(), "aptus-paused-")), "sub", "paused.json");
    savePaused(path, SAMPLE);
    expect(loadPaused(path)).toEqual(SAMPLE);
  });

  it("sin fichero no hay pausa: null, no error (el caso normal)", () => {
    expect(loadPaused(tmpFile("no-existe.json"))).toBeNull();
  });

  it("falla rápido y claro si el JSON está corrupto", () => {
    const path = tmpFile();
    writeFileSync(path, "{ esto no es json ", "utf8");
    expect(() => loadPaused(path)).toThrow(/corrupta/i);
  });

  it("falla si el contenido no cuadra con el esquema", () => {
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ pack: "x", timestamp: "hoy" }), "utf8");
    expect(() => loadPaused(path)).toThrow(/inválida/i);
  });

  it("borrar la pausa no falla si ya no había ninguna", () => {
    const path = tmpFile();
    savePaused(path, SAMPLE);
    clearPaused(path);
    expect(existsSync(path)).toBe(false);
    expect(() => clearPaused(path)).not.toThrow();
  });

  it("pausar otra vez sobrescribe: una sesión a medias por pack, no siete", () => {
    const path = tmpFile();
    savePaused(path, SAMPLE);
    savePaused(path, { ...SAMPLE, snapshot: { ...SNAPSHOT, index: 3 } });
    expect(loadPaused(path)!.snapshot.index).toBe(3);
  });
});

describe("restorePaused", () => {
  const banco = [makeQuestion("q3"), makeQuestion("q1"), makeQuestion("q2"), makeQuestion("q9")];

  it("recupera las preguntas en el orden en que se presentaron, no en el del pack", () => {
    const { questions, missing } = restorePaused(banco, SNAPSHOT);

    expect(questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(missing).toEqual([]);
  });

  it("conserva el orden de las opciones tal y como se enseñaron", () => {
    const { questions } = restorePaused(banco, SNAPSHOT);

    // Sin esto, la respuesta que ya diste aparecería en otra posición al reanudar.
    expect(questions[0]!.options.map((o) => o.id)).toEqual(["c", "a", "b"]);
    expect(questions[1]!.options.map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("una pregunta que el pack ya no tiene se cae, y se dice cuál", () => {
    const sinQ2 = banco.filter((q) => q.id !== "q2");
    const { questions, missing } = restorePaused(sinQ2, SNAPSHOT);

    expect(questions.map((q) => q.id)).toEqual(["q1", "q3"]);
    expect(missing).toEqual(["q2"]);
  });

  it("una opción añadida después de pausar no desaparece: va al final", () => {
    const conD = [makeQuestion("q1", ["a", "b", "c", "d"])];
    const { questions } = restorePaused(conD, {
      ...SNAPSHOT,
      questions: [{ id: "q1", options: ["c", "a", "b"] }],
    });

    expect(questions[0]!.options.map((o) => o.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("el banco vacío no revienta: no queda nada que reanudar", () => {
    const { questions, missing } = restorePaused([], SNAPSHOT);

    expect(questions).toEqual([]);
    expect(missing).toEqual(["q1", "q2", "q3"]);
  });
});
