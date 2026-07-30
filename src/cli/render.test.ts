import { describe, expect, it } from "vitest";
import {
  renderResult,
  renderCalibration,
  renderReadiness,
  renderGaps,
  renderWeightedGaps,
  renderEvolution,
  renderSummary,
  renderReviewPlan,
} from "./render.js";
import type { ScoreResult } from "../core/scoring.js";
import type { CalibrationResult } from "../core/calibration.js";
import type { RoleReadiness, Gap } from "../core/readiness.js";
import type { EvolutionReport } from "../core/evolution.js";
import type { MarketDemand, WeightedGap } from "../core/market.js";

// Fixture de ScoreResult (nombres de dimensión genéricos: el render no conoce
// el dominio). Incluye una dimensión sin responder para el caso borde de N=0.
const FIXTURE: ScoreResult = {
  byDimension: [
    { dimension: "dim-uno", presented: 10, answered: 8, correct: 6, pct: 6 / 8, bySubtopic: [] },
    { dimension: "dim-dos", presented: 10, answered: 10, correct: 4, pct: 0.4, bySubtopic: [] },
    { dimension: "dim-vacia", presented: 5, answered: 0, correct: 0, pct: 0, bySubtopic: [] },
  ],
};

describe("renderResult", () => {
  it("muestra una fila por dimensión con su N (respondidas/presentadas) junto al score", () => {
    const out = renderResult(FIXTURE);
    expect(out).toContain("dim-uno");
    expect(out).toContain("8/10");
    expect(out).toContain("dim-dos");
    expect(out).toContain("10/10");
  });

  it("nunca muestra un porcentaje sin su N: hay exactamente un % por dimensión", () => {
    const out = renderResult(FIXTURE);
    expect((out.match(/%/g) ?? []).length).toBe(FIXTURE.byDimension.length);
  });

  it("no muestra ninguna fila/celda de agregado ni 'empleabilidad'", () => {
    const out = renderResult(FIXTURE);
    expect(out).not.toMatch(/overall|agregad|empleab|global|hire|\btotal\b/i);
  });

  it("una dimensión con answered=0 se renderiza sin romper (0% con N 0/presentadas)", () => {
    const out = renderResult(FIXTURE);
    expect(out).toContain("0/5");
    expect(out).toContain("0%");
  });
});

const CALIB: CalibrationResult = {
  byConfidence: [
    { confidence: "alta", declared: 0.9, answered: 10, correct: 4, accuracy: 0.4, gap: 0.4 - 0.9 },
    { confidence: "media", declared: 0.65, answered: 6, correct: 4, accuracy: 4 / 6, gap: 4 / 6 - 0.65 },
    { confidence: "baja", declared: 0.4, answered: 4, correct: 3, accuracy: 0.75, gap: 0.75 - 0.4 },
  ],
};

describe("renderCalibration", () => {
  it("muestra cada nivel de confianza con su acierto real y su N", () => {
    const out = renderCalibration(CALIB);
    expect(out).toContain("Alta");
    expect(out).toContain("4/10");
    expect(out).toContain("Baja");
    expect(out).toContain("3/4");
  });

  it("señala 'te sobreestimas' cuando la confianza alta supera el acierto real", () => {
    const out = renderCalibration(CALIB);
    expect(out).toMatch(/sobreestimas/i);
  });

  it("señala 'te infravaloras' cuando el acierto supera con holgura la confianza declarada", () => {
    const out = renderCalibration(CALIB);
    expect(out).toMatch(/infravaloras/i);
  });

  it("no muestra ningún score único agregado tipo empleabilidad", () => {
    const out = renderCalibration(CALIB);
    expect(out).not.toMatch(/overall|empleab|global|hire|probabilidad de contrataci/i);
  });

  it("sin datos de confianza devuelve un mensaje claro, no una tabla vacía", () => {
    const out = renderCalibration({ byConfidence: [] });
    expect(out).toMatch(/no declaraste confianza/i);
  });
});

const ROLES: RoleReadiness[] = [
  {
    roleId: "ai-engineer",
    label: "AI Engineer",
    levelId: "mid",
    levelLabel: "Mid-ready",
    byDifficulty: [
      { difficulty: "easy", answered: 4, correct: 4, accuracy: 1 },
      { difficulty: "medium", answered: 4, correct: 3, accuracy: 0.75 },
      { difficulty: "hard", answered: 2, correct: 1, accuracy: 0.5 },
    ],
    byDimension: [
      { dimension: "llm-rag-evals", answered: 5, correct: 3, accuracy: 0.6 },
      { dimension: "ai-product-system-design", answered: 5, correct: 5, accuracy: 1 },
    ],
    secondary: [{ dimension: "ml-clasico", answered: 3, correct: 2, accuracy: 2 / 3 }],
    answered: 10,
  },
  {
    roleId: "llm-engineer",
    label: "LLM Engineer",
    levelId: null,
    levelLabel: "Aún no junior-ready",
    byDifficulty: [
      { difficulty: "easy", answered: 3, correct: 1, accuracy: 1 / 3 },
      { difficulty: "medium", answered: 2, correct: 0, accuracy: 0 },
      { difficulty: "hard", answered: 0, correct: 0, accuracy: 0 },
    ],
    byDimension: [{ dimension: "llm-rag-evals", answered: 5, correct: 1, accuracy: 0.2 }],
    secondary: [],
    answered: 5,
  },
];

describe("renderReadiness", () => {
  it("muestra una fila por rol con su nivel y la evidencia por dificultad con N", () => {
    const out = renderReadiness(ROLES);
    expect(out).toContain("AI Engineer");
    expect(out).toContain("Mid-ready");
    expect(out).toContain("4/4"); // evidencia easy del primer rol
    expect(out).toContain("LLM Engineer");
    expect(out).toContain("Aún no junior-ready");
  });

  it("muestra '—' en un tramo de dificultad sin preguntas (no evaluable)", () => {
    const out = renderReadiness(ROLES);
    expect(out).toContain("—"); // hard del LLM Engineer (N=0)
  });

  it("incluye la matriz rol × dimensión núcleo con el acierto por dimensión", () => {
    const out = renderReadiness(ROLES);
    expect(out).toMatch(/rol y dimensión/i);
    expect(out).toContain("llm-rag-evals");
    expect(out).toContain("ai-product-system-design");
  });

  it("no muestra un score único agregado de empleabilidad", () => {
    const out = renderReadiness(ROLES);
    expect(out).not.toMatch(/overall|empleab|índice|score total/i);
  });
});

const GAPS: Gap[] = [
  { dimension: "ml-clasico", answered: 5, correct: 1, accuracy: 0.2, study: "Repasa m0 y m0plus." },
  { dimension: "fullstack-next-nest-ts", answered: 5, correct: 3, accuracy: 0.6, study: "Docs oficiales." },
];

describe("renderGaps", () => {
  it("lista cada gap con su acierto y su plan de estudio", () => {
    const out = renderGaps(GAPS);
    expect(out).toMatch(/te falta ml-clasico/i);
    expect(out).toContain("Repasa m0 y m0plus.");
    expect(out).toContain("1/5");
  });

  it("sin gaps devuelve un mensaje claro", () => {
    const out = renderGaps([]);
    expect(out).toMatch(/sin gaps mayores/i);
  });
});

const WEIGHTED: WeightedGap[] = [
  { dimension: "llm-rag-evals", answered: 5, correct: 1, accuracy: 0.2, study: "Repasa m1-m3.", demandJobs: 180, demandShare: 0.45, priority: 1.16 },
  { dimension: "ml-clasico", answered: 5, correct: 2, accuracy: 0.4, study: "Repasa m0.", demandJobs: 40, demandShare: 0.1, priority: 0.66 },
];
const DEMAND: MarketDemand = { totalJobs: 400, byDimension: { "llm-rag-evals": 180, "ml-clasico": 40 } };

describe("renderWeightedGaps", () => {
  it("muestra el gap con su acierto y la demanda de mercado (ofertas), más el plan", () => {
    const out = renderWeightedGaps(WEIGHTED, DEMAND);
    expect(out).toMatch(/te falta llm-rag-evals/i);
    expect(out).toContain("180/400"); // demanda de mercado
    expect(out).toContain("Repasa m1-m3.");
    expect(out).toMatch(/demanda de mercado/i);
  });

  it("no muestra un score de encaje/empleabilidad, solo las señales y el orden", () => {
    const out = renderWeightedGaps(WEIGHTED, DEMAND);
    expect(out).not.toMatch(/encaje|empleab|probabilidad de contrataci|índice/i);
  });

  it("sin gaps devuelve el mismo mensaje claro", () => {
    expect(renderWeightedGaps([], DEMAND)).toMatch(/sin gaps mayores/i);
  });
});

describe("renderEvolution", () => {
  it("con 0 sesiones avisa de que no hay historial", () => {
    const report: EvolutionReport = {
      sessionCount: 0,
      currentTimestamp: null,
      previousTimestamp: null,
      byDimension: [],
      byRole: [],
    };
    expect(renderEvolution(report)).toMatch(/no hay sesiones/i);
  });

  it("con 1 sesión anuncia que la comparación llega a partir de la segunda", () => {
    const report: EvolutionReport = {
      sessionCount: 1,
      currentTimestamp: "t1",
      previousTimestamp: null,
      byDimension: [{ dimension: "d1", current: 0.6, previous: null, delta: null }],
      byRole: [{ roleId: "r1", label: "R1", current: "Junior-ready", previous: null, changed: false }],
    };
    expect(renderEvolution(report)).toMatch(/primera sesión/i);
  });

  it("con 2 sesiones muestra la tabla con delta y los cambios de nivel por rol", () => {
    const report: EvolutionReport = {
      sessionCount: 2,
      currentTimestamp: "t2",
      previousTimestamp: "t1",
      byDimension: [{ dimension: "d1", current: 0.6, previous: 0.4, delta: 0.2 }],
      byRole: [{ roleId: "r1", label: "R1", current: "Mid-ready", previous: "Junior-ready", changed: true }],
    };
    const out = renderEvolution(report);
    expect(out).toContain("d1");
    expect(out).toContain("↑"); // delta positivo
    expect(out).toContain("Junior-ready → Mid-ready");
  });
});

describe("readiness sin evidencia (N=0)", () => {
  const rolVacio = (label: string): RoleReadiness => ({
    roleId: label.toLowerCase().replace(/\s/g, "-"),
    label,
    levelId: null,
    levelLabel: "Aún no junior-ready",
    byDifficulty: (["easy", "medium", "hard", "experto"] as const).map((difficulty) => ({
      difficulty,
      answered: 0,
      correct: 0,
      accuracy: 0,
    })),
    byDimension: [],
    secondary: [],
    answered: 0,
  });

  it("un rol sin respuestas se marca 'sin evidencia', no 'aún no junior-ready'", () => {
    const out = renderReadiness([rolVacio("ML Engineer")]);
    expect(out).toContain("sin evidencia");
    expect(out).not.toContain("Aún no junior-ready");
  });

  it("el resumen saca del ranking a los roles sin evidencia y los nombra aparte", () => {
    const out = renderSummary([rolVacio("ML Engineer")], [], ["junior", "mid", "senior"]);
    expect(out).toContain("Sin evidencia en esta sesión");
    expect(out).toContain("ML Engineer");
    expect(out).not.toContain("Ranking");
  });
});

describe("renderReviewPlan (SESS-05: el filtro no puede parecer una medición)", () => {
  const due = [
    {
      questionId: "q1",
      dimension: "llm-rag-evals",
      seen: 2,
      failed: 1,
      box: 1,
      lastSeenAt: "2026-01-01T10:00:00.000Z",
      lastCorrect: false,
      dueAt: "2026-01-02T10:00:00.000Z",
    },
  ];
  const byDim = [{ dimension: "llm-rag-evals", due: 1, weak: 1 }];

  it("sin filtro no habla de dimensiones elegidas", () => {
    const out = renderReviewPlan(due, byDim, 10, 15);

    expect(out).toContain("1 pregunta(s) de las 1 que tocan hoy");
    expect(out).not.toMatch(/elige QUÉ estudias/);
  });

  it("con filtro dice a qué se ha acotado", () => {
    expect(renderReviewPlan(due, byDim, 10, 15, ["llm-rag-evals"])).toContain(
      "que tocan hoy en llm-rag-evals",
    );
  });

  it("con filtro desmiente la lectura de 'test de estas dimensiones'", () => {
    const out = renderReviewPlan(due, byDim, 10, 15, ["llm-rag-evals"]);

    expect(out).toMatch(/elige QUÉ estudias, no qué se mide/);
    expect(out).toMatch(/sigue saliendo de tus fallos/);
  });

  it("filtrado o no, sigue diciendo que esto no mide", () => {
    for (const dims of [null, ["llm-rag-evals"]]) {
      expect(renderReviewPlan(due, byDim, 10, 15, dims)).toMatch(/no mide nada/);
    }
  });
});
