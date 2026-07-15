import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { ReadinessConfig } from "../content/readiness.js";
import {
  buildJdRole,
  computeJdGaps,
  computeJdReadiness,
  extractJdProfile,
  extractJdTitle,
  jdVerdict,
} from "./jd.js";

type Diff = "easy" | "medium" | "hard" | "experto";

function q(id: string, dimension: string, difficulty: Diff): Question {
  return {
    id,
    dimension,
    difficulty,
    type: "concepto",
    roles: [],
    stem: `Enunciado ${id}`,
    options: [
      { id: "a", text: "correcta" },
      { id: "b", text: "incorrecta" },
    ],
    correct: "a",
    explanation: "explicación suficientemente larga",
    source: "externa",
    date: "2026-01-01",
  };
}

// "a" acierta, "b" falla; null = sin responder.
function ans(id: string, opt: string | null): AnsweredQuestion {
  return { questionId: id, selectedOptionId: opt };
}

const LEVELS = [
  { id: "junior", label: "Junior-ready", requires: { easy: 0.7, medium: 0.4, hard: 0.0, experto: 0 } },
  { id: "mid", label: "Mid-ready", requires: { easy: 0.8, medium: 0.6, hard: 0.35, experto: 0 } },
  { id: "senior", label: "Senior-ready", requires: { easy: 0.9, medium: 0.75, hard: 0.6, experto: 0 } },
];

const CONFIG: ReadinessConfig = {
  version: "test",
  levels: LEVELS,
  roles: [{ id: "r1", label: "Role One", core: ["llm"], secondary: [], source: "x" }],
  study: { llm: "estudia LLM", front: "estudia front", ml: "estudia ML" },
  market_keywords: {
    llm: ["llm", "rag", "prompt"],
    front: ["react", "typescript"],
    ml: ["scikit", "xgboost"],
  },
};

const KEYWORDS = CONFIG.market_keywords!;

describe("extractJdTitle", () => {
  it("toma la primera línea con contenido, saltándose las vacías", () => {
    expect(extractJdTitle("\n\n  Senior AI Engineer  \nBla bla")).toBe("Senior AI Engineer");
  });

  it("acota los titulares kilométricos", () => {
    const title = extractJdTitle("x".repeat(200));
    expect(title.length).toBe(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("extractJdProfile (extracción léxica)", () => {
  it("cuenta menciones por dimensión y guarda las keywords como evidencia auditable", () => {
    const jd = "Senior LLM Engineer\nBuscamos experiencia en LLM y RAG. Sabrás hacer prompt engineering con LLM.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    const llm = p.matched.find((m) => m.dimension === "llm")!;
    expect(llm.hits).toBe(5); // llm x3 + rag x1 + prompt x1
    expect(llm.keywords).toEqual(["llm", "rag", "prompt"]);
    expect(llm.weight).toBe("core");
  });

  it("manda la dimensión más pedida al núcleo y deja de secundaria la mencionada de pasada", () => {
    const jd = "LLM Engineer\nLLM, RAG y prompt a diario. Algo de React de vez en cuando.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    expect(buildJdRole(p).core).toEqual(["llm"]);
    expect(buildJdRole(p).secondary).toEqual(["front"]);
  });

  it("lista como no mencionadas las dimensiones que la oferta no pide", () => {
    const jd = "LLM Engineer\nSolo LLM y RAG.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    expect(p.unmatched).toEqual(["front", "ml"]);
    expect(p.matched.map((m) => m.dimension)).toEqual(["llm"]);
  });

  it("no detecta nada cuando la oferta va de otra cosa (y no se lo inventa)", () => {
    const p = extractJdProfile("Cocinero de paellas\nSe busca cocinero.", KEYWORDS, LEVELS);

    expect(p.matched).toEqual([]);
    expect(p.totalHits).toBe(0);
  });

  it("una palabra que dispara dos keywords solapadas cuenta UNA vez", () => {
    // Bug real del pack: "producto" contiene "product", y "escalabilidad" contiene a
    // la vez "escalab" y "scalab". Sumando por keyword, una palabra valía por dos y
    // la dimensión con más pares español/inglés se llevaba el núcleo de cualquier oferta.
    const keywords = { prod: ["product", "producto"] };
    const p = extractJdProfile("Engineer\nCriterio de producto.", keywords, LEVELS);

    expect(p.matched[0]!.hits).toBe(1); // una palabra, una mención
    expect(p.matched[0]!.keywords).toEqual(["product", "producto"]); // ambas son evidencia
  });

  it("dos menciones separadas de verdad sí cuentan dos", () => {
    const keywords = { prod: ["product", "producto"] };
    const p = extractJdProfile("Engineer\nCriterio de producto y visión de producto.", keywords, LEVELS);

    expect(p.matched[0]!.hits).toBe(2);
  });

  it("las shares suman 1 cuando hay menciones", () => {
    const jd = "Full Stack + LLM\nReact, TypeScript, LLM, RAG.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    const suma = p.matched.reduce((acc, m) => acc + m.share, 0);
    expect(suma).toBeCloseTo(1);
  });
});

describe("extractJdProfile: nivel que pide la oferta", () => {
  it("lee el seniority del titular y deja la evidencia a la vista", () => {
    const p = extractJdProfile("Senior LLM Engineer\nLLM y RAG.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("senior");
    expect(p.targetEvidence).toBe("senior");
  });

  it("el titular manda sobre el cuerpo: 'senior ... mentorizarás juniors' es senior", () => {
    const p = extractJdProfile("Senior LLM Engineer\nLLM. Mentorizarás a junior developers.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("senior");
  });

  it("no confunde 'mid' con 'middleware' (busca palabras, no subcadenas)", () => {
    const p = extractJdProfile("LLM Engineer\nTrabajarás con middleware y RAG.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBeNull();
  });

  it("no toma el 'principal' español ('objetivo principal') por un nivel staff", () => {
    const levels = [...LEVELS, { id: "staff", label: "Staff-ready", requires: { easy: 0.9, medium: 0.8, hard: 0.7, experto: 0.55 }, breadth: 0.6 }];
    const p = extractJdProfile("LLM Engineer\nEl objetivo principal del puesto es RAG.", KEYWORDS, levels);

    expect(p.targetLevelId).toBeNull();
  });

  it("sin seniority declarado no se asume ninguno", () => {
    const p = extractJdProfile("LLM Engineer\nLLM y RAG.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBeNull();
    expect(p.targetEvidence).toBeNull();
  });
});

describe("extractJdProfile: requisito vs «valorable»", () => {
  const JD = [
    "AI Engineer",
    "Requisitos",
    "- LLM y RAG en producción, prompt a diario.",
    "Valorable",
    "- Nociones de scikit para saber cuándo NO usar un LLM.",
  ].join("\n");

  it("lo que solo aparece en «valorable» no puede ser núcleo del puesto", () => {
    const p = extractJdProfile(JD, KEYWORDS, LEVELS);
    const ml = p.matched.find((m) => m.dimension === "ml")!;

    expect(ml.optionalOnly).toBe(true);
    expect(ml.weight).not.toBe("core");
    expect(buildJdRole(p).core).toEqual(["llm"]);
  });

  it("una mención en «valorable» pesa menos que la misma en requisitos", () => {
    const enRequisitos = extractJdProfile("AI Engineer\nRequisitos\n- scikit.", KEYWORDS, LEVELS);
    const enValorable = extractJdProfile("AI Engineer\nValorable\n- scikit.", KEYWORDS, LEVELS);

    const a = enRequisitos.matched.find((m) => m.dimension === "ml")!;
    const b = enValorable.matched.find((m) => m.dimension === "ml")!;
    expect(a.hits).toBe(b.hits); // misma mención bruta...
    expect(b.weightedHits).toBeLessThan(a.weightedHits); // ...pero no pesa igual
  });

  it("una frase suelta tipo «X es un plus» no arrastra al resto de la oferta a opcional", () => {
    const jd = [
      "AI Engineer",
      "Requisitos",
      "- Conocer scikit en profundidad es un plus para el equipo, aunque no imprescindible.",
      "- LLM y RAG en producción todos los días.",
    ].join("\n");
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    // La línea del "plus" es opcional, pero la siguiente sigue siendo requisito.
    expect(p.matched.find((m) => m.dimension === "ml")!.optionalOnly).toBe(true);
    expect(p.matched.find((m) => m.dimension === "llm")!.optionalOnly).toBe(false);
  });
});

describe("extractJdProfile: suelo absoluto de menciones para el núcleo", () => {
  it("con evidencia mínima no hay núcleo por mucho que la share sea del 100%", () => {
    // Caso real (Airbus): 3 menciones sueltas daban el 100% del peso y convertían
    // una oferta de fabricación en un puesto de esa dimensión.
    const p = extractJdProfile("Manufacturing Engineer\nAlgo de llm. Un rag. Otro llm.", KEYWORDS, LEVELS);
    const llm = p.matched.find((m) => m.dimension === "llm")!;

    expect(llm.hits).toBe(3);
    expect(llm.share).toBe(1); // se lo lleva todo...
    expect(llm.weight).not.toBe("core"); // ...pero 3 menciones no son un puesto
    expect(buildJdRole(p).core).toEqual([]);
  });

  it("a partir del suelo, la dimensión ya puede ser núcleo", () => {
    const p = extractJdProfile("AI Engineer\nllm, rag, prompt y más llm.", KEYWORDS, LEVELS);

    expect(p.matched.find((m) => m.dimension === "llm")!.weight).toBe("core");
  });
});

describe("extractJdProfile: falsos amigos del seniority", () => {
  it("'Mid-Market' es un segmento de mercado, no un puesto mid", () => {
    // Caso real (Elevenlabs) visto en las ofertas de jobhunt.
    const p = extractJdProfile("Account Executive - Italy - Mid-Market\nllm, rag, prompt, llm.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBeNull();
  });

  it("'mid-size company' tampoco es un nivel", () => {
    const p = extractJdProfile("Engineer\nSomos una mid-size company. llm, rag, prompt, llm.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBeNull();
  });

  it("pero un puesto mid de verdad se sigue leyendo", () => {
    const p = extractJdProfile("Mid-level LLM Engineer\nllm, rag, prompt, llm.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("mid");
  });
});

describe("extractJdProfile: menciones incidentales", () => {
  it("una mención de pasada es incidental y no entra en el rol", () => {
    // llm domina; front aparece una vez entre mucho ruido de llm.
    const jd = "AI Engineer\n" + "LLM RAG prompt. ".repeat(10) + "Algo de React.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);
    const front = p.matched.find((m) => m.dimension === "front")!;

    expect(front.share).toBeLessThan(0.1);
    expect(front.weight).toBe("incidental");
    const role = buildJdRole(p);
    expect(role.core).toEqual(["llm"]);
    expect(role.secondary).toEqual([]); // no gobierna la amplitud
  });
});

describe("extractJdProfile: cobertura y puntos ciegos", () => {
  it("delata lo que la oferta pide y el pack no mide", () => {
    const jd = "AI Engineer\nLLM y RAG, desplegando en Kubernetes con Kafka y Terraform.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    expect(p.coverage.blindSpots).toContain("kubernetes");
    expect(p.coverage.blindSpots).toContain("kafka");
    expect(p.coverage.blindSpots).toContain("terraform");
  });

  it("no marca como punto ciego lo que el pack sí cubre", () => {
    // El pack mide "react", así que React Native no es un punto ciego pese a estar
    // en el léxico general: lo que el pack cubre se descarta solo.
    const p = extractJdProfile("Dev\nReact Native y TypeScript.", KEYWORDS, LEVELS);

    expect(p.coverage.blindSpots).not.toContain("react native");
    expect(p.matched.map((m) => m.dimension)).toContain("front");
  });

  it("busca palabras: 'javascript' no dispara el punto ciego 'java'", () => {
    const p = extractJdProfile("Dev\nSe programa en javascript.", KEYWORDS, LEVELS);

    expect(p.coverage.blindSpots).not.toContain("java");
  });

  it("avisa por cobertura: casi todo lo técnico que pide cae fuera de lo que mido", () => {
    // Corta a propósito: la densidad por palabras NO la pilla (pocas palabras
    // inflan la ratio), pero la cobertura sí. Por eso mandan las dos señales.
    const jd = "Platform Engineer\nKubernetes, Kafka, Spark y Terraform en AWS. Algún LLM.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    expect(p.coverage.ratio).toBeLessThan(0.5);
    expect(p.coverage.low).toBe(true);
  });

  it("avisa por densidad: oferta larga de un dominio que ni el léxico conoce", () => {
    const jd = "Contable\n" + "Llevarás la contabilidad y los cierres mensuales del grupo. ".repeat(20) + "Algún LLM.";
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);

    expect(p.coverage.ratio).toBe(1); // no hay puntos ciegos: el léxico no sabe de contabilidad
    expect(p.coverage.low).toBe(true); // pero la densidad la delata igual
  });

  it("no avisa cuando la oferta va justo de lo que el pack mide", () => {
    const p = extractJdProfile("AI Engineer\nLLM, RAG y prompt engineering a diario.", KEYWORDS, LEVELS);

    expect(p.coverage.low).toBe(false);
    expect(p.coverage.ratio).toBe(1);
  });
});

describe("extractJdProfile: nivel por años de experiencia", () => {
  it("lee el nivel de '5+ años de experiencia' cuando la oferta no dice el seniority", () => {
    const p = extractJdProfile("AI Engineer\nPedimos 5+ años de experiencia con LLM.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("mid");
    expect(p.targetEvidence).toBe("5+ años");
  });

  it("con muchos años pide senior", () => {
    const p = extractJdProfile("AI Engineer\n8 años de experiencia en RAG.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("senior");
  });

  it("la palabra explícita manda sobre los años", () => {
    const p = extractJdProfile("Junior AI Engineer\nCon 8 años de experiencia en LLM.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBe("junior");
  });

  it("no confunde años que no hablan de experiencia", () => {
    const p = extractJdProfile("AI Engineer\nLlevamos 10 años en el mercado. Usamos LLM.", KEYWORDS, LEVELS);

    expect(p.targetLevelId).toBeNull();
  });
});

describe("computeJdReadiness", () => {
  const bank = [
    q("e1", "llm", "easy"),
    q("e2", "llm", "easy"),
    q("m1", "llm", "medium"),
    q("m2", "llm", "medium"),
    q("h1", "llm", "hard"),
    q("h2", "llm", "hard"),
  ];

  it("da el nivel para el rol ad-hoc de la oferta con la misma vara de siempre", () => {
    const p = extractJdProfile("Senior LLM Engineer\nLLM, RAG, prompt.", KEYWORDS, LEVELS);
    const r = computeJdReadiness(bank.map((x) => ans(x.id, "a")), bank, CONFIG, p)!;

    expect(r.levelId).toBe("senior");
    expect(r.answered).toBe(6);
    expect(r.byDimension.map((d) => d.dimension)).toEqual(["llm"]);
  });

  it("solo cuenta como núcleo las dimensiones que la oferta pide de verdad", () => {
    const mixto = [...bank, q("f1", "front", "easy")];
    const p = extractJdProfile("Senior LLM Engineer\nLLM, RAG, prompt.", KEYWORDS, LEVELS);
    const r = computeJdReadiness(mixto.map((x) => ans(x.id, "a")), mixto, CONFIG, p)!;

    expect(r.answered).toBe(6); // la pregunta de front no entra: la oferta no lo pide
  });

  it("devuelve null cuando la oferta no pide nada medible", () => {
    const p = extractJdProfile("Cocinero de paellas", KEYWORDS, LEVELS);

    expect(computeJdReadiness([], bank, CONFIG, p)).toBeNull();
  });
});

describe("jdVerdict", () => {
  const bank = [q("e1", "llm", "easy"), q("m1", "llm", "medium"), q("h1", "llm", "hard")];

  function verdictFor(jd: string, answers: AnsweredQuestion[]) {
    const p = extractJdProfile(jd, KEYWORDS, LEVELS);
    const r = computeJdReadiness(answers, bank, CONFIG, p)!;
    return jdVerdict(r, p, LEVELS);
  }

  it("dice que llegas cuando alcanzas el nivel que pide la oferta", () => {
    const v = verdictFor("Junior LLM Engineer\nLLM, RAG y prompt.", [ans("e1", "a"), ans("m1", "a"), ans("h1", "a")]);

    expect(v.targetLevelId).toBe("junior");
    expect(v.meetsTarget).toBe(true);
    expect(v.levelsShort).toBe(0);
  });

  it("cuenta los escalones que faltan cuando la oferta pide más de lo que demuestras", () => {
    // Falla lo difícil: no hay senior.
    const v = verdictFor("Senior LLM Engineer\nLLM, RAG y prompt.", [ans("e1", "a"), ans("m1", "a"), ans("h1", "b")]);

    expect(v.targetLevelId).toBe("senior");
    expect(v.meetsTarget).toBe(false);
    expect(v.levelsShort).toBeGreaterThan(0);
  });

  it("superar el nivel pedido también cuenta como llegar", () => {
    const v = verdictFor("Junior LLM Engineer\nLLM, RAG y prompt.", [ans("e1", "a"), ans("m1", "a"), ans("h1", "a")]);

    expect(v.achievedLevelId).toBe("senior");
    expect(v.meetsTarget).toBe(true);
  });

  it("sin nivel declarado en la oferta no hay comparación (null, no un false engañoso)", () => {
    const v = verdictFor("LLM Engineer\nLLM, RAG y prompt.", [ans("e1", "a"), ans("m1", "a"), ans("h1", "a")]);

    expect(v.meetsTarget).toBeNull();
    expect(v.levelsShort).toBeNull();
  });

  it("dice en voz alta que un nivel no es evaluable si la oferta no pide amplitud", () => {
    const staff = { id: "staff", label: "Staff-ready", requires: { easy: 0.9, medium: 0.8, hard: 0.7, experto: 0.55 }, breadth: 0.6 };
    const levels = [...LEVELS, staff];
    const cfg: ReadinessConfig = { ...CONFIG, levels };

    const p = extractJdProfile("Staff LLM Engineer\nSolo LLM, RAG y prompt.", KEYWORDS, levels);
    const r = computeJdReadiness([ans("e1", "a")], bank, cfg, p)!;
    const v = jdVerdict(r, p, levels);

    expect(r.secondary).toEqual([]); // la oferta no pide ninguna secundaria con peso
    expect(v.capReason).toContain("Staff-ready");
    expect(v.capReason).toContain("no pide amplitud");
  });

  it("sin niveles que exijan amplitud no hay nada que avisar", () => {
    const v = verdictFor("Senior LLM Engineer\nLLM, RAG y prompt.", [ans("e1", "a")]);

    expect(v.capReason).toBeNull(); // LEVELS no declara breadth en ningún nivel
  });
});

describe("computeJdGaps", () => {
  it("ignora los gaps de dimensiones que la oferta no pide", () => {
    const bank = [q("l1", "llm", "easy"), q("f1", "front", "easy")];
    const answers = [ans("l1", "b"), ans("f1", "b")]; // ambas falladas
    const p = extractJdProfile("LLM Engineer\nSolo LLM y RAG.", KEYWORDS, LEVELS);

    const gaps = computeJdGaps(answers, bank, CONFIG, p);
    expect(gaps.map((g) => g.dimension)).toEqual(["llm"]); // front no es gap para ESTE puesto
  });

  it("antepone el gap que la oferta pide más cuando la debilidad es la misma", () => {
    const bank = [q("l1", "llm", "easy"), q("f1", "front", "easy")];
    const answers = [ans("l1", "b"), ans("f1", "b")]; // 0% en las dos
    // La oferta pide LLM mucho más que front.
    const p = extractJdProfile("Engineer\nLLM, RAG, prompt, LLM, RAG. Algo de React.", KEYWORDS, LEVELS);

    const gaps = computeJdGaps(answers, bank, CONFIG, p);
    expect(gaps[0]!.dimension).toBe("llm");
    expect(gaps[0]!.share).toBeGreaterThan(gaps[1]!.share);
  });

  it("cada gap viaja con las keywords que lo justifican", () => {
    const bank = [q("l1", "llm", "easy")];
    const p = extractJdProfile("LLM Engineer\nLLM y RAG.", KEYWORDS, LEVELS);

    const gaps = computeJdGaps([ans("l1", "b")], bank, CONFIG, p);
    expect(gaps[0]!.keywords).toEqual(["llm", "rag"]);
  });
});
