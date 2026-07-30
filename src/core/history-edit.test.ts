import { describe, expect, it } from "vitest";
import type { SessionRecord } from "./evolution.js";
import { deleteSessionAt, summarizeSessions } from "./history-edit.js";

function sesion(
  timestamp: string,
  opts: { kind?: "review"; answered?: number; correct?: number; dims?: number } = {},
): SessionRecord {
  const dims = opts.dims ?? 2;
  const answered = opts.answered ?? 10;
  const correct = opts.correct ?? 6;
  return {
    timestamp,
    byDimension: Array.from({ length: dims }, (_, i) => ({
      dimension: `dim-${i}`,
      answered: Math.round(answered / dims),
      correct: Math.round(correct / dims),
      pct: correct / answered,
    })),
    readiness: [{ roleId: "ai", label: "AI Engineer", levelId: "mid", levelLabel: "mid-ready" }],
    ...(opts.kind ? { kind: opts.kind } : {}),
  };
}

const T1 = "2026-01-01T10:00:00.000Z";
const T2 = "2026-01-05T10:00:00.000Z";
const T3 = "2026-01-09T10:00:00.000Z";

describe("summarizeSessions", () => {
  it("da una línea por sesión, en el orden guardado", () => {
    const out = summarizeSessions([sesion(T1), sesion(T2)]);

    expect(out.map((s) => s.index)).toEqual([0, 1]);
    expect(out.map((s) => s.timestamp)).toEqual([T1, T2]);
  });

  it("distingue medición de repaso, que es lo que hay que saber antes de borrar", () => {
    const out = summarizeSessions([sesion(T1), sesion(T2, { kind: "review" })]);

    expect(out.map((s) => s.kind)).toEqual(["measure", "review"]);
  });

  it("una sesión antigua sin 'kind' es una medición, como en todo lo demás", () => {
    expect(summarizeSessions([sesion(T1)])[0]!.kind).toBe("measure");
  });

  it("suma aciertos y respondidas por dimensión", () => {
    const out = summarizeSessions([sesion(T1, { answered: 10, correct: 6, dims: 2 })])[0]!;

    expect(out.answered).toBe(10);
    expect(out.correct).toBe(6);
    expect(out.dimensions).toBe(2);
  });

  it("NO fabrica un porcentaje global: ni aquí se cuela un score único", () => {
    const out = summarizeSessions([sesion(T1)])[0]!;

    expect(Object.keys(out)).not.toContain("pct");
    expect(Object.keys(out)).not.toContain("score");
  });

  it("un historial vacío no tiene nada que listar", () => {
    expect(summarizeSessions([])).toEqual([]);
  });
});

describe("deleteSessionAt", () => {
  const history = [sesion(T1), sesion(T2, { kind: "review" }), sesion(T3)];

  it("quita la que está en esa posición y devuelve el resto", () => {
    const res = deleteSessionAt(history, 1)!;

    expect(res.history.map((s) => s.timestamp)).toEqual([T1, T3]);
    expect(res.deleted.timestamp).toBe(T2);
    expect(res.deleted.kind).toBe("review");
  });

  it("no toca el historial que recibe: hasta que no se guarda, no se ha roto nada", () => {
    deleteSessionAt(history, 0);

    expect(history.map((s) => s.timestamp)).toEqual([T1, T2, T3]);
  });

  it("borrar la única sesión deja el historial vacío, no lo rompe", () => {
    expect(deleteSessionAt([sesion(T1)], 0)!.history).toEqual([]);
  });

  it.each([-1, 3, 99, 1.5, Number.NaN])(
    "la posición %s no existe: no se borra 'la que más se le parezca'",
    (indice) => {
      expect(deleteSessionAt(history, indice)).toBeNull();
    },
  );

  it("avisa cuando se borra la última medición: el 'ahora' de la evolución cambia", () => {
    expect(deleteSessionAt(history, 2)!.cambiaLaEvolucion).toBe(true);
  });

  it("borrar un repaso no mueve la evolución: nunca contó para ella", () => {
    expect(deleteSessionAt(history, 1)!.cambiaLaEvolucion).toBe(false);
  });

  it("borrar una medición antigua tampoco cambia el 'ahora'", () => {
    expect(deleteSessionAt(history, 0)!.cambiaLaEvolucion).toBe(false);
  });

  it("con una sola medición, borrarla se avisa igual", () => {
    expect(deleteSessionAt([sesion(T1)], 0)!.cambiaLaEvolucion).toBe(true);
  });
});
