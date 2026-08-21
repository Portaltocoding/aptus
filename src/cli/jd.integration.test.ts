import { describe, expect, it } from "vitest";
import { loadPackDir } from "../content/loader.js";
import { loadReadiness } from "../content/readiness.js";
import type { AnsweredQuestion } from "../core/scoring.js";
import { computeJdGaps, computeJdReadiness, extractJdProfile, jdVerdict } from "../core/jd.js";
import { renderJdGaps, renderJdProfile, renderJdReadiness } from "./render.js";

// Smoke end-to-end de `aptus jd` (motor + contenido + render), sin I/O de fichero
// ni interactividad. Lo que se protege aquí es el contrato de honestidad:
// evidencia siempre a la vista y NUNCA un score de encaje.
//
// Corre contra el pack COMPLETO de fixture, con vocabulario inventado. Que las
// dimensiones se llamen alfa/beta/gamma es justo lo que hace fuerte a este test:
// si pasara, el reconocimiento de una oferta funcionaría con cualquier dominio,
// no solo con el que resultara estar versionado en el repo.
const PACK_DIR = new URL("../../test/fixtures/packs/pack-completo/", import.meta.url).pathname;
const PACK_READINESS = new URL("../../test/fixtures/packs/pack-completo/readiness.yaml", import.meta.url)
  .pathname;

const pack = loadPackDir(PACK_DIR);
const config = loadReadiness(PACK_READINESS);
const keywords = config.market_keywords!;

// Oferta realista: una que de verdad pide una dimensión la menciona varias veces,
// no una de pasada (ver MIN_CORE_HITS). Las fixtures de juguete daban núcleos que
// las ofertas reales de jobhunt demostraron que no se sostienen.
const JD_AI = [
  "Senior Ingeniero de Plataforma — Acme Labs",
  "Requisitos",
  "- Protocolo alfa en producción, con presupuesto de latencia por petición.",
  "- Operar alfa-core como contrato de servicio, no como best effort.",
  "- Diseño gamma de la plataforma: capacidad, coste y aislamiento.",
  "- Decidir el escalado con gamma-scale y defenderlo por escrito.",
  "- Instrumentar alfa de punta a punta.",
  "- Revisar diseño gamma con el resto del equipo.",
  "- Guardias sobre el protocolo alfa, con runbook.",
  "- Presupuesto de capacidad gamma revisado cada trimestre.",
  "Valorable",
  "- Haber tocado beta-legacy.",
].join("\n");

/** Responde todo el banco correctamente: sirve para ejercitar el camino completo. */
function todoCorrecto(): AnsweredQuestion[] {
  return pack.questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: Array.isArray(q.correct) ? q.correct[0]! : q.correct,
  }));
}

describe("jd end-to-end contra un pack completo", () => {
  it("traduce la oferta a un rol ad-hoc y da readiness para ese puesto con su evidencia", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const readiness = computeJdReadiness(todoCorrecto(), pack.questions, config, profile)!;
    const verdict = jdVerdict(readiness, profile, config.levels);

    expect(profile.targetLevelId).toBe("senior");
    expect(readiness).not.toBeNull();
    // Las dos dimensiones que la oferta pide de verdad son el núcleo del puesto.
    expect(readiness.byDimension.map((d) => d.dimension).sort()).toEqual([
      "dimension-alpha",
      "dimension-gamma",
    ]);
    // Con todo el banco correcto se llega al nivel que pide.
    expect(verdict.meetsTarget).toBe(true);
  });

  it("lo que solo está en «valorable» no se cuela en el núcleo del puesto", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const beta = profile.matched.find((m) => m.dimension === "dimension-beta")!;

    expect(beta.optionalOnly).toBe(true);
    expect(beta.weight).not.toBe("core");
  });

  it("el render muestra SIEMPRE las keywords que disparan cada dimensión (auditable)", () => {
    const profile = extractJdProfile(JD_AI, keywords, config.levels);
    const output = renderJdProfile(profile);

    expect(output).toContain("dimension-alpha");
    expect(output).toContain("alfa-core"); // la evidencia, no solo el veredicto
    expect(output).toContain("Extracción léxica");
  });

  it("avisa de los puntos ciegos: lo que la oferta pide y el pack no mide", () => {
    const jd = "Senior Ingeniero — Requisitos\n- Protocolo alfa desplegado en Kubernetes con Kafka.";
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
      "- Haber tocado alfa alguna vez.",
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
