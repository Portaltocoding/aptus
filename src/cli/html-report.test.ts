import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../core/evolution.js";
import { buildHtmlReport } from "./html-report.js";

function rec(ts: string, pct: number, levelLabel = "Mid-ready"): SessionRecord {
  return {
    timestamp: ts,
    byDimension: [
      { dimension: "llm-rag-evals", answered: 10, correct: Math.round(pct * 10), pct },
      { dimension: "ml-clasico", answered: 8, correct: 4, pct: 0.5 },
    ],
    readiness: [{ roleId: "ai-engineer", label: "AI Engineer", levelId: "mid", levelLabel }],
  };
}

describe("buildHtmlReport", () => {
  it("incluye cada dimensión con su porcentaje y su N (nunca un % suelto)", () => {
    const html = buildHtmlReport("ai-ml-readiness", [rec("2026-07-14T10:00:00Z", 0.6)]);
    expect(html).toContain("llm-rag-evals");
    expect(html).toContain("60%");
    expect(html).toContain("6/10"); // N = aciertos/respondidas
    expect(html).toContain("ml-clasico");
    expect(html).toContain("4/8");
  });

  it("muestra el readiness por rol y no un score agregado de empleabilidad", () => {
    const html = buildHtmlReport("ai-ml-readiness", [rec("t1", 0.6)]);
    expect(html).toContain("AI Engineer");
    expect(html).toContain("Mid-ready");
    expect(html).not.toMatch(/empleabilidad|probabilidad de contrataci|score total/i);
  });

  it("es autocontenido: sin recursos externos (CSP-safe, funciona offline)", () => {
    const html = buildHtmlReport("x", [rec("t1", 0.6), rec("t2", 0.8)]);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("<style>");
  });

  it("con 2+ sesiones dibuja la gráfica de evolución; con 1 avisa", () => {
    const dos = buildHtmlReport("x", [rec("t1", 0.4), rec("t2", 0.9)]);
    expect(dos).toContain("<svg");
    expect(dos).toContain("<polyline");

    const una = buildHtmlReport("x", [rec("t1", 0.4)]);
    expect(una).toMatch(/a partir de la segunda sesión/i);
  });

  it("sin sesiones no revienta: informa de que no hay datos", () => {
    const html = buildHtmlReport("x", []);
    expect(html).toMatch(/Aún no hay sesiones/i);
  });

  it("escapa el contenido (no inyecta HTML crudo)", () => {
    const evil = rec("t1", 0.5);
    evil.readiness[0]!.label = "<img src=x onerror=alert(1)>";
    const html = buildHtmlReport("x", [evil]);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
