import { describe, expect, it } from "vitest";
import type { Gap } from "./readiness.js";
import { computeDemand, applyMarketWeight, type MarketDemand } from "./market.js";

function gap(dimension: string, accuracy: number): Gap {
  const answered = 5;
  return {
    dimension,
    answered,
    correct: Math.round(accuracy * answered),
    accuracy,
    study: `estudia ${dimension}`,
  };
}

describe("computeDemand (puro)", () => {
  const keywords = {
    "llm-rag-evals": ["llm", "rag", "openai"],
    "fullstack-next-nest-ts": ["react", "typescript"],
    "ml-clasico": ["machine learning", "pytorch"],
  };

  it("cuenta ofertas por dimensión, case-insensitive, una vez por oferta", () => {
    const jobs = [
      "Buscamos LLM/RAG engineer con OpenAI y experiencia", // llm-rag (varias keywords → 1)
      "Puesto React y TypeScript fullstack",
      "Machine Learning con PyTorch",
      "Rol de gestión sin stack técnico concreto",
    ];
    const d = computeDemand(jobs, keywords);
    expect(d.totalJobs).toBe(4);
    expect(d.byDimension["llm-rag-evals"]).toBe(1);
    expect(d.byDimension["fullstack-next-nest-ts"]).toBe(1);
    expect(d.byDimension["ml-clasico"]).toBe(1);
  });

  it("una dimensión sin ninguna coincidencia queda en 0", () => {
    const d = computeDemand(["oferta sin nada relevante"], keywords);
    expect(d.byDimension["llm-rag-evals"]).toBe(0);
  });
});

describe("applyMarketWeight (puro)", () => {
  it("con misma debilidad, prioriza la dimensión más demandada", () => {
    const gaps = [gap("a", 0.5), gap("b", 0.5)];
    const demand: MarketDemand = { totalJobs: 10, byDimension: { a: 2, b: 8 } };

    const weighted = applyMarketWeight(gaps, demand);
    expect(weighted[0]!.dimension).toBe("b"); // más demanda → primero
    expect(weighted[0]!.demandJobs).toBe(8);
    expect(weighted[0]!.demandShare).toBeCloseTo(0.8);
  });

  it("la debilidad sigue mandando: un gap muy débil sin demanda no cae a lo último", () => {
    const gaps = [gap("fuerte-demandado", 0.6), gap("muy-debil-sin-demanda", 0.1)];
    const demand: MarketDemand = { totalJobs: 10, byDimension: { "fuerte-demandado": 9 } };

    const weighted = applyMarketWeight(gaps, demand);
    // debilidad 0.9*(1+0)=0.9 > 0.4*(1+0.9)=0.76 → el muy débil va primero
    expect(weighted[0]!.dimension).toBe("muy-debil-sin-demanda");
    expect(weighted[0]!.demandJobs).toBe(0);
  });

  it("no revienta con totalJobs=0 (demandShare 0)", () => {
    const weighted = applyMarketWeight([gap("a", 0.3)], { totalJobs: 0, byDimension: {} });
    expect(weighted[0]!.demandShare).toBe(0);
    expect(weighted[0]!.priority).toBeCloseTo(0.7);
  });
});
