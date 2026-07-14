import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHistory, saveHistory } from "./history.js";
import type { SessionRecord } from "../core/evolution.js";

function tmpFile(name = "history.json"): string {
  return join(mkdtempSync(join(tmpdir(), "aptus-history-")), name);
}

const SAMPLE: SessionRecord[] = [
  {
    timestamp: "2026-07-14T10:00:00.000Z",
    byDimension: [{ dimension: "llm-rag-evals", answered: 5, correct: 3, pct: 0.6 }],
    readiness: [{ roleId: "ai-engineer", label: "AI Engineer", levelId: "junior", levelLabel: "Junior-ready" }],
  },
];

describe("history store (PERS-01)", () => {
  it("guarda y recarga el historial sin pérdida (round-trip)", () => {
    const path = tmpFile();
    saveHistory(path, SAMPLE);
    expect(loadHistory(path)).toEqual(SAMPLE);
  });

  it("crea el directorio si no existe al guardar", () => {
    const path = join(mkdtempSync(join(tmpdir(), "aptus-history-")), "sub", "dir", "history.json");
    saveHistory(path, SAMPLE);
    expect(loadHistory(path)).toEqual(SAMPLE);
  });

  it("un fichero inexistente devuelve historial vacío (no rompe la primera sesión)", () => {
    expect(loadHistory(tmpFile("no-existe.json"))).toEqual([]);
  });

  it("falla rápido y claro si el JSON está corrupto (no pierde datos en silencio)", () => {
    const path = tmpFile();
    writeFileSync(path, "{ esto no es json válido ", "utf8");
    expect(() => loadHistory(path)).toThrow(/Historial corrupto/);
  });

  it("falla si el contenido no cumple el schema", () => {
    const path = tmpFile();
    writeFileSync(path, JSON.stringify([{ timestamp: 123 }]), "utf8"); // timestamp no-string, faltan campos
    expect(() => loadHistory(path)).toThrow(/Historial inválido/);
  });
});
