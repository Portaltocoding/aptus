import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldPack } from "./commands/new-pack.js";
import { loadPackDir } from "../content/loader.js";

function tmpPacksRoot(): string {
  return mkdtempSync(join(tmpdir(), "aptus-newpack-"));
}

describe("scaffoldPack (flujo new-pack)", () => {
  it("crea un esqueleto aislado que carga y valida contra el motor", () => {
    const root = tmpPacksRoot();
    const dir = scaffoldPack(root, "mi-tema");

    expect(existsSync(join(dir, "pack.yaml"))).toBe(true);
    expect(existsSync(join(dir, "questions"))).toBe(true);
    expect(existsSync(join(dir, "sources", "README.md"))).toBe(true);

    // El esqueleto es un pack válido ejecutable desde el primer momento.
    const pack = loadPackDir(dir);
    expect(pack.name).toBe("mi-tema");
    expect(pack.questions.length).toBeGreaterThanOrEqual(1);
    expect(pack.questions[0]!.type).toBe("concepto");
  });

  it("no sobrescribe un pack existente", () => {
    const root = tmpPacksRoot();
    scaffoldPack(root, "dup");
    expect(() => scaffoldPack(root, "dup")).toThrow(/Ya existe/);
  });

  it("rechaza nombres inválidos (evita rutas raras)", () => {
    const root = tmpPacksRoot();
    expect(() => scaffoldPack(root, "../escape")).toThrow(/inválido/);
    expect(() => scaffoldPack(root, "Con Espacios")).toThrow(/inválido/);
  });
});
