import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReadiness } from "./readiness.js";

const REAL_READINESS = new URL("../../packs/ai-ml-readiness/readiness.yaml", import.meta.url).pathname;

describe("loadReadiness", () => {
  it("carga la config real: niveles, roles y plan de estudio", () => {
    const cfg = loadReadiness(REAL_READINESS);

    expect(cfg.levels.map((l) => l.id)).toEqual(["junior", "mid", "senior", "staff"]);
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

  it("los umbrales suben (o se mantienen) de un nivel al siguiente, en cada tramo", () => {
    const cfg = loadReadiness(REAL_READINESS);
    for (const d of ["easy", "medium", "hard", "experto"] as const) {
      for (let i = 1; i < cfg.levels.length; i++) {
        expect(
          cfg.levels[i - 1]!.requires[d],
          `nivel ${cfg.levels[i]!.id} baja el umbral en '${d}'`,
        ).toBeLessThanOrEqual(cfg.levels[i]!.requires[d]);
      }
    }
  });

  it("staff exige tramo experto y amplitud (breadth); los niveles previos no", () => {
    const cfg = loadReadiness(REAL_READINESS);
    const staff = cfg.levels.find((l) => l.id === "staff")!;
    expect(staff.requires.experto).toBeGreaterThan(0);
    expect(staff.breadth).toBeGreaterThan(0);
    for (const l of cfg.levels.filter((l) => l.id !== "staff")) {
      expect(l.requires.experto).toBe(0);
      expect(l.breadth).toBeUndefined();
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
