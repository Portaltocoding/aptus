import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadJobTexts } from "./jobhunt.js";

function tmpPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "aptus-jobhunt-")), name);
}

function makeJobsDb(rows: { title: string; description: string }[]): string {
  const path = tmpPath("jobs.db");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE jobs (title TEXT, description TEXT)");
  const stmt = db.prepare("INSERT INTO jobs (title, description) VALUES (?, ?)");
  for (const r of rows) stmt.run(r.title, r.description);
  db.close();
  return path;
}

describe("loadJobTexts (adaptador solo-lectura de jobhunt)", () => {
  it("lee title+description de una base de datos jobs válida", () => {
    const path = makeJobsDb([
      { title: "AI Engineer", description: "LLM y RAG con OpenAI" },
      { title: "Full Stack", description: "React y TypeScript" },
    ]);
    const texts = loadJobTexts(path);
    expect(texts).not.toBeNull();
    expect(texts!.length).toBe(2);
    expect(texts![0]).toContain("AI Engineer");
    expect(texts![0]).toContain("LLM y RAG");
  });

  it("degrada con gracia (null) si el fichero no existe", () => {
    expect(loadJobTexts(tmpPath("no-existe.db"))).toBeNull();
  });

  it("degrada con gracia (null) si el fichero no es una base de datos válida", () => {
    const path = tmpPath("basura.db");
    writeFileSync(path, "esto no es sqlite", "utf8");
    expect(loadJobTexts(path)).toBeNull();
  });
});
