import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { JobRow } from "../content/jobhunt.js";
import type { ReadinessConfig } from "../content/readiness.js";
import type { AnsweredQuestion } from "./scoring.js";
import { scanJobs } from "./jobs-scan.js";

function q(id: string, dimension: string, difficulty: "easy" | "medium" | "hard"): Question {
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

const BANK = [q("e1", "llm", "easy"), q("m1", "llm", "medium"), q("h1", "llm", "hard")];
const TODO_BIEN: AnsweredQuestion[] = BANK.map((x) => ({ questionId: x.id, selectedOptionId: "a" }));

const CONFIG: ReadinessConfig = {
  version: "test",
  levels: [
    { id: "junior", label: "Junior-ready", requires: { easy: 0.7, medium: 0.4, hard: 0.0, experto: 0 } },
    { id: "mid", label: "Mid-ready", requires: { easy: 0.8, medium: 0.6, hard: 0.35, experto: 0 } },
    { id: "senior", label: "Senior-ready", requires: { easy: 0.9, medium: 0.75, hard: 0.6, experto: 0 } },
  ],
  roles: [{ id: "r1", label: "Role One", core: ["llm"], secondary: [], source: "x" }],
  study: { llm: "estudia LLM" },
  market_keywords: { llm: ["llm", "rag"], front: ["react"] },
};

const KEYWORDS = CONFIG.market_keywords!;

// Descripción con evidencia suficiente (>= MIN_CORE_HITS): una oferta real que
// pide LLM lo menciona varias veces, no una vez de pasada.
const DESC_LLM = "LLM y RAG. Trabajarás con LLM y RAG a diario.";

function job(title: string, description: string, extra: Partial<JobRow> = {}): JobRow {
  return { id: null, title, company: null, url: null, status: null, description, ...extra };
}

describe("scanJobs", () => {
  it("ordena de más listo a menos por escalones, no por un score inventado", () => {
    // Con todo el banco correcto se alcanza senior (índice 2).
    const jobs = [
      job("Senior LLM Engineer", DESC_LLM), // pide senior → delta 0
      job("Junior LLM Engineer", DESC_LLM), // pide junior → delta +2
      job("Mid LLM Engineer", `Mid-level. ${DESC_LLM}`), // pide mid → delta +1
    ];
    const scan = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(scan.ranked.map((s) => s.verdict!.levelDelta)).toEqual([2, 1, 0]);
    expect(scan.ranked[0]!.title).toBe("Junior LLM Engineer");
  });

  it("cada fila conserva su veredicto entero, auditable", () => {
    const scan = scanJobs([job("Senior LLM Engineer", DESC_LLM)], KEYWORDS, CONFIG, TODO_BIEN, BANK);
    const v = scan.ranked[0]!.verdict!;

    expect(v.targetLevelLabel).toBe("Senior-ready");
    expect(v.achievedLevelLabel).toBe("Senior-ready");
    expect(v.meetsTarget).toBe(true);
  });

  it("aparta las ofertas sin seniority declarado en vez de colocarlas a ojo", () => {
    const scan = scanJobs([job("LLM Engineer", DESC_LLM)], KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(scan.ranked).toEqual([]);
    expect(scan.withoutLevel).toHaveLength(1);
  });

  it("aparta lo que el pack no sabe medir; no lo tira ni lo cuela en el ranking", () => {
    const jobs = [job("Senior LLM Engineer", DESC_LLM), job("Cocinero de paellas", "Arroces.")];
    const scan = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(scan.ranked).toHaveLength(1);
    expect(scan.notEvaluable).toHaveLength(1);
    expect(scan.notEvaluable[0]!.title).toBe("Cocinero de paellas");
    expect(scan.totalScanned).toBe(2); // el total nunca miente
  });

  it("las tres cestas suman siempre el total escaneado (nada se pierde por el camino)", () => {
    const jobs = [
      job("Senior LLM Engineer", DESC_LLM),
      job("LLM Engineer", DESC_LLM),
      job("Cocinero", "Paellas."),
      job("Junior LLM Engineer", DESC_LLM),
    ];
    const scan = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(scan.ranked.length + scan.withoutLevel.length + scan.notEvaluable.length).toBe(scan.totalScanned);
  });

  it("el titular cuenta: de él sale el seniority de la oferta", () => {
    const scan = scanJobs([job("Junior LLM Engineer", DESC_LLM)], KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(scan.ranked[0]!.profile.targetLevelId).toBe("junior");
  });

  it("es determinista: a igualdad de escalones, orden estable por título", () => {
    const jobs = [job("Zeta Senior LLM", DESC_LLM), job("Alfa Senior LLM", DESC_LLM)];
    const a = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);
    const b = scanJobs([...jobs].reverse(), KEYWORDS, CONFIG, TODO_BIEN, BANK);

    expect(a.ranked.map((s) => s.title)).toEqual(["Alfa Senior LLM", "Zeta Senior LLM"]);
    expect(b.ranked.map((s) => s.title)).toEqual(a.ranked.map((s) => s.title));
  });

  it("marca la oferta cuya cobertura es baja: su fila es optimista y hay que saberlo", () => {
    const jobs = [job("Senior Platform Engineer", "Kubernetes, Kafka, Spark y Terraform en AWS. Algún LLM.")];
    const scan = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);

    const todas = [...scan.ranked, ...scan.withoutLevel, ...scan.notEvaluable];
    expect(todas[0]!.profile.coverage.low).toBe(true);
  });

  it("todas las ofertas se miden con la MISMA evidencia (es lo que las hace comparables)", () => {
    const jobs = [job("Senior LLM Engineer", DESC_LLM), job("Junior LLM Engineer", DESC_LLM)];
    const scan = scanJobs(jobs, KEYWORDS, CONFIG, TODO_BIEN, BANK);

    // Mismo desempeño detrás de las dos: solo cambia lo que pide cada oferta.
    expect(scan.ranked[0]!.readiness!.answered).toBe(scan.ranked[1]!.readiness!.answered);
    expect(scan.ranked[0]!.verdict!.achievedLevelId).toBe(scan.ranked[1]!.verdict!.achievedLevelId);
  });
});
