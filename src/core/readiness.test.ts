import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { ReadinessConfig } from "../content/readiness.js";
import { computeReadiness, computeGaps } from "./readiness.js";

type Diff = "easy" | "medium" | "hard" | "experto";

function q(id: string, dimension: string, difficulty: Diff): Question {
  return {
    id,
    dimension,
    difficulty,
    type: "concepto",
    roles: [],
    stem: `Enunciado ${id}`,
    options: [
      { id: "a", text: "correcta" },
      { id: "b", text: "incorrecta" },
    ],
    correct: "a",
    explanation: "explicación suficientemente larga",
    source: "externa",
    date: "2026-01-01",
  };
}

// "a" acierta, "b" falla; null = sin responder.
function ans(id: string, opt: string | null): AnsweredQuestion {
  return { questionId: id, selectedOptionId: opt };
}

const CONFIG: ReadinessConfig = {
  version: "test",
  levels: [
    { id: "junior", label: "Junior-ready", requires: { easy: 0.7, medium: 0.4, hard: 0.0, experto: 0 } },
    { id: "mid", label: "Mid-ready", requires: { easy: 0.8, medium: 0.6, hard: 0.35, experto: 0 } },
    { id: "senior", label: "Senior-ready", requires: { easy: 0.9, medium: 0.75, hard: 0.6, experto: 0 } },
  ],
  roles: [
    { id: "r1", label: "Role One", core: ["dim-a"], secondary: [], source: "x" },
    { id: "r2", label: "Role Two", core: ["dim-b"], secondary: [], source: "x" },
  ],
  study: { "dim-a": "estudia A", "dim-b": "estudia B" },
};

function readinessFor(roleId: string, answered: AnsweredQuestion[], bank: Question[]) {
  return computeReadiness(answered, bank, CONFIG).find((r) => r.roleId === roleId)!;
}

/**
 * Banco + respuestas de un tramo: `n` preguntas de esa dificultad, de las que se
 * aciertan `ok`. Los fixtures usan muestras REALISTAS (10 por tramo) a propósito:
 * escritos con 1-2 preguntas por tramo, cualquier umbral se cumple con un acierto
 * suelto y el test deja de vigilar lo que dice vigilar.
 */
function tramo(
  prefijo: string,
  dimension: string,
  difficulty: Diff,
  n: number,
  ok: number,
): { bank: Question[]; answered: AnsweredQuestion[] } {
  const bank = Array.from({ length: n }, (_, i) => q(`${prefijo}${i}`, dimension, difficulty));
  const answered = bank.map((question, i) => ans(question.id, i < ok ? "a" : "b"));
  return { bank, answered };
}

function sesion(...tramos: { bank: Question[]; answered: AnsweredQuestion[] }[]) {
  return {
    bank: tramos.flatMap((t) => t.bank),
    answered: tramos.flatMap((t) => t.answered),
  };
}

describe("computeReadiness (motor puro)", () => {
  it("concede senior cuando los tres tramos tienen evidencia y superan el umbral", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 10),
      tramo("m", "dim-a", "medium", 10, 10),
      tramo("h", "dim-a", "hard", 10, 10),
    );

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBe("senior");
    expect(r.answered).toBe(30);
  });

  it("se queda en junior cuando el tramo medio no llega al umbral de mid", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 10), // easy 100%
      tramo("m", "dim-a", "medium", 10, 5), // medium 50% (< 0.6 de mid)
      tramo("h", "dim-a", "hard", 10, 5), // hard 50%
    );

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBe("junior");
  });

  it("no concede mid/senior sin evidencia en el tramo que exigen (no sobre-afirma)", () => {
    // Solo easy y medium, ambos perfectos; ninguna pregunta hard.
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 10),
      tramo("m", "dim-a", "medium", 10, 10),
    );

    const r = readinessFor("r1", answered, bank);
    // mid exige hard >= 0.35 y no hay hard => no llega a mid; se queda en junior.
    expect(r.levelId).toBe("junior");
    const hard = r.byDifficulty.find((t) => t.difficulty === "hard")!;
    expect(hard.answered).toBe(0);
  });

  it("marca 'aún no junior-ready' (levelId null) cuando ni lo fundamental llega", () => {
    const { bank, answered } = sesion(tramo("e", "dim-a", "easy", 10, 5)); // easy 50% (< 0.7)

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBeNull();
    expect(r.levelLabel.toLowerCase()).toContain("aún no");
  });

  // ── Muestra pequeña: el bug que hacía senior a quien acertaba tres preguntas ──

  it("no concede NINGÚN nivel con una sola pregunta acertada por tramo", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 1, 1),
      tramo("m", "dim-a", "medium", 1, 1),
      tramo("h", "dim-a", "hard", 1, 1),
    );

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBeNull(); // antes: "senior", con tres preguntas
  });

  it("explica una muestra corta como 'muestra', no como falta de nivel", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 2, 2), // 100% crudo: el umbral lo pasa
      tramo("m", "dim-a", "medium", 2, 2),
    );

    const r = readinessFor("r1", answered, bank);
    // Junior sí (su listón es bajo), pero mid se frena por muestra, no por nivel.
    expect(r.levelId).toBe("junior");
    expect(r.nextLevelId).toBe("mid");
    const easy = r.blockers.find((b) => b.difficulty === "easy")!;
    expect(easy.kind).toBe("muestra");
    expect(easy.accuracy).toBe(1); // el crudo llega al 80% que pide mid...
    expect(easy.adjusted).toBeLessThan(0.8); // ...pero con N=2 no se afirma
  });

  it("distingue 'umbral' (falta saber) de 'muestra' (falta responder)", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 4), // 40% crudo: se queda corto de verdad
      tramo("m", "dim-a", "medium", 10, 10),
    );

    const r = readinessFor("r1", answered, bank);
    expect(r.blockers.find((b) => b.difficulty === "easy")!.kind).toBe("umbral");
  });

  it("nombra el tramo del que no salió ninguna pregunta", () => {
    const { bank, answered } = sesion(tramo("e", "dim-a", "easy", 10, 10));

    const r = readinessFor("r1", answered, bank);
    const medium = r.blockers.find((b) => b.difficulty === "medium")!;
    expect(medium.answered).toBe(0);
    expect(r.nextLevelId).toBe("junior");
  });

  it("una muestra suficiente y perfecta SÍ concede el nivel (el ajuste no es un muro)", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 10),
      tramo("m", "dim-a", "medium", 10, 10),
      tramo("h", "dim-a", "hard", 10, 10),
    );
    expect(readinessFor("r1", answered, bank).levelId).toBe("senior");
  });

  it("no se salta peldaños aunque la config no sea monótona", () => {
    // 'senior' aquí no exige nada de easy: sin escalera, alcanzarlo sin llegar a
    // junior daría "Senior-ready" a quien falla lo fundamental.
    const raro: ReadinessConfig = {
      ...CONFIG,
      levels: [
        { id: "junior", label: "Junior-ready", requires: { easy: 0.7, medium: 0.4, hard: 0, experto: 0 } },
        { id: "senior", label: "Senior-ready", requires: { easy: 0, medium: 0.4, hard: 0.6, experto: 0 } },
      ],
    };
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 10, 0), // easy 0%: no llega a junior
      tramo("m", "dim-a", "medium", 10, 10),
      tramo("h", "dim-a", "hard", 10, 10),
    );

    const r = computeReadiness(answered, bank, raro).find((x) => x.roleId === "r1")!;
    expect(r.levelId).toBeNull();
    expect(r.nextLevelId).toBe("junior"); // se para en el peldaño que falla
  });

  it("sin siguiente nivel (tope de la escalera) no hay nada que bloquear", () => {
    const { bank, answered } = sesion(
      tramo("e", "dim-a", "easy", 20, 20),
      tramo("m", "dim-a", "medium", 20, 20),
      tramo("h", "dim-a", "hard", 20, 20),
    );

    const r = readinessFor("r1", answered, bank);
    expect(r.levelId).toBe("senior");
    expect(r.nextLevelId).toBeNull();
    expect(r.blockers).toEqual([]);
  });

  it("solo cuenta las dimensiones núcleo del rol", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = bank.map((question) => ans(question.id, "a"));

    const r1 = readinessFor("r1", answered, bank); // core dim-a
    const r2 = readinessFor("r2", answered, bank); // core dim-b
    expect(r1.answered).toBe(1);
    expect(r2.answered).toBe(2);
    // matriz rol × dimensión: solo las dimensiones núcleo del rol
    expect(r1.byDimension).toEqual([{ dimension: "dim-a", answered: 1, correct: 1, accuracy: 1 }]);
    expect(r2.byDimension.map((d) => d.dimension)).toEqual(["dim-b"]);
    expect(r2.byDimension[0]!.answered).toBe(2);
  });
});

describe("computeGaps (RES-03)", () => {
  it("lista solo las dimensiones por debajo del umbral, de más débil a menos, con su plan", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("a2", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = [
      ans("a1", "b"),
      ans("a2", "b"), // dim-a 0%
      ans("b1", "a"),
      ans("b2", "a"), // dim-b 100% (no es gap)
    ];

    const gaps = computeGaps(answered, bank, CONFIG);
    expect(gaps.map((g) => g.dimension)).toEqual(["dim-a"]);
    expect(gaps[0]!.study).toBe("estudia A");
  });

  it("ordena varios gaps de menor a mayor acierto", () => {
    const bank = [
      q("a1", "dim-a", "easy"),
      q("a2", "dim-a", "easy"),
      q("b1", "dim-b", "easy"),
      q("b2", "dim-b", "easy"),
    ];
    const answered = [
      ans("a1", "a"),
      ans("a2", "b"), // dim-a 50%
      ans("b1", "b"),
      ans("b2", "b"), // dim-b 0%
    ];

    const gaps = computeGaps(answered, bank, CONFIG);
    expect(gaps.map((g) => g.dimension)).toEqual(["dim-b", "dim-a"]); // dim-b (0%) primero
  });

  it("sin gaps cuando todo está en el umbral o por encima", () => {
    const bank = [q("a1", "dim-a", "easy"), q("b1", "dim-b", "easy")];
    const answered = [ans("a1", "a"), ans("b1", "a")];
    expect(computeGaps(answered, bank, CONFIG)).toEqual([]);
  });
});

describe("computeReadiness — staff (experto + amplitud)", () => {
  const STAFF_CONFIG: ReadinessConfig = {
    version: "t",
    levels: [
      { id: "senior", label: "Senior-ready", requires: { easy: 0.9, medium: 0.75, hard: 0.6, experto: 0 } },
      {
        id: "staff",
        label: "Staff-ready",
        requires: { easy: 0.9, medium: 0.8, hard: 0.7, experto: 0.55 },
        breadth: 0.6,
      },
    ],
    roles: [{ id: "r", label: "R", core: ["core-dim"], secondary: ["sec-dim"], source: "x" }],
    study: { "core-dim": "e", "sec-dim": "e" },
  };

  const TRAMOS: Diff[] = ["easy", "medium", "hard", "experto"];

  /** Núcleo completo (10 por tramo) + secundaria, con muestra suficiente para conceder. */
  function fullBank() {
    return [
      ...TRAMOS.flatMap((d) =>
        Array.from({ length: 10 }, (_, i) => q(`${d}${i}`, "core-dim", d)),
      ),
      ...Array.from({ length: 10 }, (_, i) => q(`s${i}`, "sec-dim", "easy")),
    ];
  }

  function readiness(answered: AnsweredQuestion[], bank: Question[]) {
    return computeReadiness(answered, bank, STAFF_CONFIG)[0]!;
  }

  it("concede staff con dominio experto en el núcleo y amplitud en las secundarias", () => {
    const bank = fullBank();
    const r = readiness(bank.map((question) => ans(question.id, "a")), bank); // todo correcto
    expect(r.levelId).toBe("staff");
    expect(r.secondary.map((s) => s.dimension)).toEqual(["sec-dim"]);
  });

  it("no concede staff sin evidencia experto en el núcleo (se queda en senior)", () => {
    const bank = fullBank().filter((question) => question.difficulty !== "experto");
    const r = readiness(bank.map((question) => ans(question.id, "a")), bank);
    expect(r.levelId).toBe("senior");
    expect(r.blockers.find((b) => b.difficulty === "experto")!.answered).toBe(0);
  });

  it("no concede staff si falla la amplitud (secundaria por debajo del umbral)", () => {
    const bank = fullBank();
    // núcleo perfecto (incl. experto), pero la secundaria mal → sin amplitud
    const answered = bank.map((question) =>
      ans(question.id, question.dimension === "sec-dim" ? "b" : "a"),
    );
    const r = readiness(answered, bank);
    expect(r.levelId).toBe("senior");
    expect(r.blockers.some((b) => b.kind === "amplitud")).toBe(true);
  });
});
