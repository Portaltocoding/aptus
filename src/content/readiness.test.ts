import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReadiness } from "./readiness.js";

const REAL_READINESS = new URL("../../packs/ai-ml-readiness/readiness.yaml", import.meta.url).pathname;

describe("loadReadiness", () => {
  it("carga la config real: niveles, roles y plan de estudio", () => {
    const cfg = loadReadiness(REAL_READINESS);

    expect(cfg.levels.map((l) => l.id)).toEqual(["junior", "mid", "senior"]);
    expect(cfg.roles.length).toBeGreaterThanOrEqual(5);
    for (const role of cfg.roles) {
      expect(role.core.length, `rol '${role.id}' sin dimensiones núcleo`).toBeGreaterThanOrEqual(1);
      expect(role.source.length, `rol '${role.id}' sin fuente (CONT-05)`).toBeGreaterThan(0);
    }
    // Cada dimensión núcleo declarada tiene un recurso de estudio (RES-03).
    const studied = new Set(Object.keys(cfg.study));
    for (const role of cfg.roles) {
      for (const dim of role.core) {
        expect(studied.has(dim), `dimensión '${dim}' sin plan de estudio`).toBe(true);
      }
    }
  });

  it("declara keywords de mercado para cada dimensión núcleo (Phase 6)", () => {
    const cfg = loadReadiness(REAL_READINESS);
    expect(cfg.market_keywords).toBeDefined();
    const dims = new Set(cfg.roles.flatMap((r) => r.core));
    for (const dim of dims) {
      const kws = cfg.market_keywords![dim];
      expect(kws, `dimensión '${dim}' sin keywords de mercado`).toBeDefined();
      expect(kws!.length).toBeGreaterThan(0);
    }
  });

  it("los umbrales por nivel suben con la dificultad (junior <= mid <= senior)", () => {
    const cfg = loadReadiness(REAL_READINESS);
    const byId = new Map(cfg.levels.map((l) => [l.id, l]));
    const j = byId.get("junior")!;
    const m = byId.get("mid")!;
    const s = byId.get("senior")!;
    for (const d of ["easy", "medium", "hard"] as const) {
      expect(j.requires[d]).toBeLessThanOrEqual(m.requires[d]);
      expect(m.requires[d]).toBeLessThanOrEqual(s.requires[d]);
    }
  });

  it("falla rápido con mensaje claro si la config está malformada", () => {
    const dir = mkdtempSync(join(tmpdir(), "aptus-readiness-"));
    const bad = join(dir, "readiness.yaml");
    // Falta 'roles' y 'study'; 'levels' sin 'requires'.
    writeFileSync(bad, 'version: "x"\nlevels:\n  - id: junior\n    label: "J"\n', "utf8");

    expect(() => loadReadiness(bad)).toThrow(/Config de readiness inválida/);
  });
});
