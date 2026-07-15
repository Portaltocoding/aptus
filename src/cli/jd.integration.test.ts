import { describe, expect, it } from "vitest";
import { loadPackDir } from "../content/loader.js";
import { loadReadiness } from "../content/readiness.js";
import type { AnsweredQuestion } from "../core/scoring.js";
import { computeJdGaps, computeJdReadiness, extractJdProfile, jdVerdict } from "../core/jd.js";
import { renderJdGaps, renderJdProfile, renderJdReadiness } from "./render.js";

// Smoke end-to-end de `aptus jd` contra el PACK REAL (motor + contenido + render),
// sin I/O de fichero ni interactividad. Lo que se protege aquí es el contrato de
// honestidad: evidencia siempre a la vista y NUNCA un score de encaje.
const REAL_PACK_DIR = new URL("../../packs/ai-ml-readiness/", import.meta.url).pathname;
const REAL_READINESS = new URL("../../packs/ai-ml-readiness/readiness.yaml", import.meta.url).pathname;

const pack = loadPackDir(REAL_PACK_DIR);
const config = loadReadiness(REAL_READINESS);
const keywords = config.market_keywords!;

const JD_AI = [
  "Senior AI Engineer — Acme Labs",
  "Requisitos",
  "- LLM en producción: RAG, embeddings, evals como contrato.",
  "- Prompt engineering sistemático y tool calling.",
  "- System design: arquitectura, coste y latencia con stakeholders.",
  "Valorable",
  "- Nociones de machine learning clásico.",
].join("\n");

/** Responde todo el banco correctamente: sirve para ejercitar el camino completo. */
function todoCorrecto(): AnsweredQuestion[] {
  return pack.questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: Array.isArray(q.correct) ? q.correct[0]! : q.correct,
  }));
}

describe("jd end-to-end contra el pack real", () => {
  it("traduce la oferta a un rol ad-hoc y da readiness para ese puesto con su evidencia", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const readiness = computeJdReadiness(todoCorrecto(), pack.questions, config, profile)!;
    const verdict = jdVerdict(readiness, profile, config.levels);

    expect(profile.targetLevelId).toBe("senior");
    expect(readiness).not.toBeNull();
    // Las dos dimensiones que la oferta pide de verdad son el núcleo del puesto.
    expect(readiness.byDimension.map((d) => d.dimension).sort()).toEqual([
      "ai-product-system-design",
      "llm-rag-evals",
    ]);
    // Con todo el banco correcto se llega al nivel que pide.
    expect(verdict.meetsTarget).toBe(true);
  });

  it("lo que solo está en «valorable» no se cuela en el núcleo del puesto", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const ml = profile.matched.find((m) => m.dimension === "ml-clasico")!;

    expect(ml.optionalOnly).toBe(true);
    expect(ml.weight).not.toBe("core");
  });

  it("el render muestra SIEMPRE las keywords que disparan cada dimensión (auditable)", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const output = renderJdProfile(profile);

    expect(output).toContain("llm-rag-evals");
    expect(output).toContain("rag"); // la evidencia, no solo el veredicto
    expect(output).toContain("Extracción léxica");
  });

  it("avisa de los puntos ciegos: lo que la oferta pide y el pack no mide", () => {
    const jd = "Senior AI Engineer\nRequisitos\n- LLM y RAG desplegados en Kubernetes con Kafka.";
    const output = renderJdProfile(extractJdProfile(jd, keywords, config.levels));

    expect(output).toContain("Puntos ciegos");
    expect(output).toContain("kubernetes");
    expect(output).toContain("kafka");
  });

  it("no da veredicto para una oferta que va de otra cosa", () => {
    const jd = [
      "Senior Data Platform Engineer",
      "Requisitos",
      "- Kubernetes, Kafka, Spark y Terraform en AWS.",
      "- 6 años de experiencia con Java y Postgres.",
      "Valorable",
      "- Haber tocado algún LLM.",
    ].join("\n");
    const profile = extractJdProfile(jd, keywords, config.levels);

    expect(profile.coverage.low).toBe(true);
    // El único enganche ("LLM") es un «valorable»: no puede ser núcleo, así que no
    // hay puesto que evaluar. Antes de esto, esa mención suelta bastaba para dar un
    // nivel — sesgado a favor y sobre nada.
    expect(computeJdReadiness(todoCorrecto(), pack.questions, config, profile)).toBeNull();
  });

  it("nunca produce un score de encaje ni una probabilidad de contratación", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const answered = todoCorrecto();
    const readiness = computeJdReadiness(answered, pack.questions, config, profile)!;
    const output = [
      renderJdProfile(profile),
      renderJdReadiness(readiness, jdVerdict(readiness, profile, config.levels)),
      renderJdGaps(computeJdGaps(answered, pack.questions, config, profile)),
    ].join("\n");

    expect(output).not.toMatch(/encaje|fit score|match score|empleabilidad|probabilidad de contrataci|te cogerán/i);
  });

  it("el readiness del puesto muestra el N junto a cada acierto", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const answered = todoCorrecto();
    const readiness = computeJdReadiness(answered, pack.questions, config, profile)!;
    const output = renderJdReadiness(readiness, jdVerdict(readiness, profile, config.levels));

    for (const d of readiness.byDimension) {
      expect(output).toContain(`${d.correct}/${d.answered}`);
    }
  });
});
