import { describe, expect, it } from "vitest";
import type { ScoreResult } from "./scoring.js";
import type { RoleReadiness } from "./readiness.js";
import { buildSessionRecord, evolution, type SessionRecord } from "./evolution.js";

describe("buildSessionRecord (puro)", () => {
  it("arma un registro serializable a partir del score y el readiness", () => {
    const score: ScoreResult = {
      byDimension: [
        { dimension: "d1", presented: 5, answered: 5, correct: 3, pct: 0.6, bySubtopic: [] },
      ],
    };
    const roles: RoleReadiness[] = [
      {
        roleId: "r1",
        label: "R1",
        levelId: "mid",
        levelLabel: "Mid-ready",
        byDifficulty: [],
        byDimension: [],
        answered: 5,
      },
    ];

    const rec = buildSessionRecord("2026-01-01T00:00:00.000Z", score, roles);
    expect(rec.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(rec.byDimension).toEqual([{ dimension: "d1", answered: 5, correct: 3, pct: 0.6 }]);
    expect(rec.readiness).toEqual([
      { roleId: "r1", label: "R1", levelId: "mid", levelLabel: "Mid-ready" },
    ]);
  });
});

function rec(
  ts: string,
  dimPct: number,
  levelLabel: string,
  levelId: string | null,
): SessionRecord {
  return {
    timestamp: ts,
    byDimension: [{ dimension: "d1", answered: 5, correct: Math.round(dimPct * 5), pct: dimPct }],
    readiness: [{ roleId: "r1", label: "R1", levelId, levelLabel }],
  };
}

describe("evolution (puro)", () => {
  it("con 0 sesiones devuelve un informe vacío", () => {
    const r = evolution([]);
    expect(r.sessionCount).toBe(0);
    expect(r.byDimension).toEqual([]);
    expect(r.byRole).toEqual([]);
  });

  it("con 1 sesión no hay anterior: previous y delta son null", () => {
    const r = evolution([rec("t1", 0.6, "Mid-ready", "mid")]);
    expect(r.sessionCount).toBe(1);
    expect(r.byDimension[0]).toMatchObject({ dimension: "d1", current: 0.6, previous: null, delta: null });
    expect(r.byRole[0]!.previous).toBeNull();
    expect(r.byRole[0]!.changed).toBe(false);
  });

  it("con 2 sesiones calcula el delta por dimensión y detecta el cambio de nivel", () => {
    const r = evolution([
      rec("t1", 0.4, "Junior-ready", "junior"),
      rec("t2", 0.6, "Mid-ready", "mid"),
    ]);
    expect(r.sessionCount).toBe(2);
    expect(r.currentTimestamp).toBe("t2");
    expect(r.previousTimestamp).toBe("t1");

    const d1 = r.byDimension.find((d) => d.dimension === "d1")!;
    expect(d1.current).toBeCloseTo(0.6);
    expect(d1.previous).toBeCloseTo(0.4);
    expect(d1.delta).toBeCloseTo(0.2);

    const role = r.byRole.find((x) => x.roleId === "r1")!;
    expect(role.previous).toBe("Junior-ready");
    expect(role.current).toBe("Mid-ready");
    expect(role.changed).toBe(true);
  });

  it("compara solo las dos últimas sesiones aunque haya más", () => {
    const r = evolution([
      rec("t1", 0.1, "Junior-ready", "junior"),
      rec("t2", 0.4, "Junior-ready", "junior"),
      rec("t3", 0.5, "Junior-ready", "junior"),
    ]);
    const d1 = r.byDimension.find((d) => d.dimension === "d1")!;
    expect(d1.previous).toBeCloseTo(0.4); // t2, no t1
    expect(d1.delta).toBeCloseTo(0.1);
    expect(r.byRole[0]!.changed).toBe(false); // mismo nivel entre t2 y t3
  });
});
