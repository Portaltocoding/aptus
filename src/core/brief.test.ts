import { describe, expect, it } from "vitest";
import {
  attachMaterial,
  briefFromCorpus,
  briefFromJd,
  extractHeadings,
  renderBrief,
  toKebab,
  type CorpusDoc,
} from "./brief.js";
import type { JdProfile } from "./jd.js";

function profile(over: Partial<JdProfile> = {}): JdProfile {
  return {
    title: "Senior AI Engineer",
    matched: [
      {
        dimension: "llm-rag-evals",
        hits: 6,
        weightedHits: 6,
        keywords: ["rag", "embeddings"],
        optionalOnly: false,
        weakOnly: false,
        share: 0.8,
        weight: "core",
      },
    ],
    unmatched: [],
    totalHits: 6,
    coverage: {
      words: 200,
      mappedHits: 6,
      blindHits: 2,
      ratio: 0.75,
      density: 3,
      low: false,
      blindSpots: ["kubernetes", "kafka"],
    },
    targetLevelId: "senior",
    targetLevelLabel: "Senior-ready",
    targetEvidence: "senior",
    ...over,
  };
}

describe("toKebab", () => {
  it("normaliza acentos, mayúsculas y separadores", () => {
    expect(toKebab("Consistencia Eventual")).toBe("consistencia-eventual");
    expect(toKebab("  ¿Qué es CAP?  ")).toBe("que-es-cap");
    expect(toKebab("C++ / Rust")).toBe("c-rust");
  });

  it("no devuelve guiones sueltos en los extremos", () => {
    expect(toKebab("--hola--")).toBe("hola");
    expect(toKebab("!!!")).toBe("");
  });
});

describe("extractHeadings", () => {
  it("saca los títulos markdown de nivel 1 a 3", () => {
    const texto = "# Uno\ntexto\n## Dos\n### Tres\n#### Cuatro (demasiado profundo)\n";
    expect(extractHeadings(texto)).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("no confunde una almohadilla dentro del texto con un título", () => {
    expect(extractHeadings("usa el canal #general para eso")).toEqual([]);
  });
});

describe("briefFromJd", () => {
  it("marca como cubiertas las dimensiones del pack y como nuevas los puntos ciegos", () => {
    const brief = briefFromJd(profile(), "ai-ml-readiness");

    const cubiertos = brief.topics.filter((t) => t.covered).map((t) => t.name);
    const nuevos = brief.topics.filter((t) => !t.covered).map((t) => t.name);

    expect(cubiertos).toEqual(["llm-rag-evals"]);
    expect(nuevos).toEqual(["kubernetes", "kafka"]);
  });

  it("no inventa un peso para los puntos ciegos: el detector no lo sabe", () => {
    const brief = briefFromJd(profile(), "ai-ml-readiness");
    for (const t of brief.topics.filter((x) => !x.covered)) {
      expect(t.weight).toBe(0);
    }
  });

  it("arrastra el nivel que pide la oferta", () => {
    expect(briefFromJd(profile(), "p").targetLevel).toBe("Senior-ready");
  });

  it("cuando no hay puntos ciegos lo dice en vez de fingir que hay pack que construir", () => {
    const sinCiegos = profile({
      coverage: { ...profile().coverage, blindSpots: [] },
    });
    const brief = briefFromJd(sinCiegos, "p");

    expect(brief.topics.filter((t) => !t.covered)).toHaveLength(0);
    expect(brief.notes.join(" ")).toMatch(/sin puntos ciegos/i);
  });

  it("avisa cuando la oferta va de otra cosa", () => {
    const brief = briefFromJd(profile({ coverage: { ...profile().coverage, low: true } }), "p");
    expect(brief.notes.join(" ")).toMatch(/va mayoritariamente de cosas que el pack no mide/i);
  });
});

describe("briefFromCorpus", () => {
  const docs: CorpusDoc[] = [
    {
      path: "m01.md",
      text:
        "# Sistemas distribuidos\n" +
        "contenido largo. ".repeat(40) +
        "\n## Consistencia\n" +
        "más texto. ".repeat(40),
    },
    { path: "m02.md", text: "# Colas de mensajes\n" + "texto sobre colas. ".repeat(40) },
  ];

  it("propone temas a partir de los títulos del material", () => {
    const brief = briefFromCorpus("tema", docs);
    const nombres = brief.topics.map((t) => t.name);

    expect(nombres).toContain("sistemas-distribuidos");
    expect(nombres).toContain("consistencia");
    expect(nombres).toContain("colas-de-mensajes");
  });

  it("los pesos suman aproximadamente 1: es un reparto, no notas sueltas", () => {
    const total = briefFromCorpus("tema", docs).topics.reduce((a, t) => a + t.weight, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThanOrEqual(1.0001);
  });

  it("cada tema arrastra el fichero del que sale", () => {
    const brief = briefFromCorpus("tema", docs);
    const colas = brief.topics.find((t) => t.name === "colas-de-mensajes")!;
    expect(colas.evidence).toEqual(["m02.md"]);
  });

  it("marca como cubierto lo que el pack ya mide", () => {
    const brief = briefFromCorpus("tema", docs, ["colas-de-mensajes"]);
    expect(brief.topics.find((t) => t.name === "colas-de-mensajes")!.covered).toBe(true);
    expect(brief.topics.find((t) => t.name === "consistencia")!.covered).toBe(false);
  });

  it("sin títulos cae al nombre del fichero Y LO DICE", () => {
    const brief = briefFromCorpus("tema", [
      { path: "apuntes-sueltos.txt", text: "texto sin estructura. ".repeat(40) },
    ]);

    expect(brief.topics.map((t) => t.name)).toEqual(["apuntes-sueltos"]);
    expect(brief.notes.join(" ")).toMatch(/nombres de fichero/i);
  });

  it("un corpus vacío no revienta", () => {
    const brief = briefFromCorpus("tema", []);
    expect(brief.topics).toEqual([]);
  });
});

describe("attachMaterial", () => {
  const brief = briefFromJd(profile(), "p");

  it("cuelga de cada tema los documentos que hablan de él", () => {
    const conMaterial = attachMaterial(brief, [
      { path: "notas/k8s.md", text: "Kubernetes orquesta contenedores en un clúster." },
      { path: "notas/cocina.md", text: "La masa madre necesita fermentar doce horas." },
    ]);

    const k8s = conMaterial.topics.find((t) => t.name === "kubernetes")!;
    expect(k8s.material!.map((m) => m.path)).toEqual(["notas/k8s.md"]);
  });

  it("el tema SIN material se nombra: es lo más accionable del brief", () => {
    const conMaterial = attachMaterial(brief, [
      { path: "notas/k8s.md", text: "Kubernetes y contenedores." },
    ]);

    expect(conMaterial.topics.find((t) => t.name === "kafka")!.material).toEqual([]);
    expect(conMaterial.notes.join(" ")).toMatch(/sin una sola nota tuya.*kafka/i);
  });

  it("busca por PALABRA: 'java' no salta con 'javascript'", () => {
    const jdJava = briefFromJd(
      profile({ coverage: { ...profile().coverage, blindSpots: ["java"] } }),
      "p",
    );
    const conMaterial = attachMaterial(jdJava, [
      { path: "n.md", text: "Todo el frontend está en javascript moderno." },
    ]);

    expect(conMaterial.topics.find((t) => t.name === "java")!.material).toEqual([]);
  });

  it("no muta el brief original", () => {
    attachMaterial(brief, [{ path: "n.md", text: "kubernetes" }]);
    expect(brief.topics.every((t) => t.material === undefined)).toBe(true);
  });
});

describe("renderBrief", () => {
  it("separa lo que hay que escribir de lo que ya está escrito", () => {
    const out = renderBrief(briefFromJd(profile(), "ai-ml-readiness"));

    expect(out).toMatch(/## Temas a cubrir/);
    expect(out).toMatch(/## Ya cubierto/);
    expect(out).toContain("kubernetes");
    expect(out).toContain("llm-rag-evals");
  });

  it("avisa siempre de que es una propuesta mecánica y lista sus límites", () => {
    const out = renderBrief(briefFromJd(profile(), "p"));
    expect(out).toMatch(/PROPUESTA mecánica/);
    expect(out).toMatch(/## Límites de esta extracción/);
  });

  it("marca en el markdown los temas sin material propio", () => {
    const conMaterial = attachMaterial(briefFromJd(profile(), "p"), [
      { path: "n.md", text: "kubernetes va aquí" },
    ]);
    const out = renderBrief(conMaterial);

    expect(out).toMatch(/### Material tuyo para cada tema/);
    expect(out).toMatch(/`kafka` — \*\*nada en tu material\*\*/);
  });

  it("no revienta con un brief sin temas nuevos", () => {
    const sinCiegos = briefFromJd(
      profile({ coverage: { ...profile().coverage, blindSpots: [] } }),
      "p",
    );
    expect(renderBrief(sinCiegos)).toMatch(/Ninguno: todo lo detectado ya lo mide/);
  });
});
