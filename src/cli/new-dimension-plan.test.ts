import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { QuestionSchema } from "../content/schema.js";
import {
  admiteBorrador,
  investigacionSourceName,
  ofertaSourceName,
  planNewDimension,
  renderSkeleton,
  sourceChoices,
  validateDimensionName,
  type MaterialOutcome,
  type PlanInput,
} from "./new-dimension-plan.js";

const BRIEF = "BRIEF-colas-de-mensajes.md";

function plan(material: MaterialOutcome, extra: Partial<PlanInput> = {}): PlanInput {
  return {
    dimension: "colas-de-mensajes",
    packName: "backend",
    briefFile: BRIEF,
    material,
    dimensionDeclarada: true,
    borrador: null,
    esqueleto: null,
    tieneApiKey: true,
    ...extra,
  };
}

describe("validateDimensionName", () => {
  it("acepta un nombre normal y lo mide ya en kebab-case", () => {
    expect(validateDimensionName("Sistemas Distribuidos", [])).toBe(true);
  });

  it("rechaza lo que no deja 3 caracteres útiles", () => {
    expect(validateDimensionName("", [])).toMatch(/3 caracteres/);
    expect(validateDimensionName("!!", [])).toMatch(/3 caracteres/);
  });

  it("rechaza un nombre que ya existe, aunque se escriba distinto", () => {
    expect(validateDimensionName("Colas de Mensajes", ["colas-de-mensajes"])).toMatch(/ya existe/);
  });
});

describe("nombres de los ficheros de material", () => {
  it("la oferta se guarda con su nombre, sin la extensión original", () => {
    expect(ofertaSourceName("/tmp/ofertas/backend-senior.pdf")).toBe("oferta-backend-senior.txt");
  });

  it("una oferta sin extensión también tiene nombre válido", () => {
    expect(ofertaSourceName("/tmp/oferta")).toBe("oferta-oferta.txt");
  });

  it("el informe de investigación lleva el nombre del tema", () => {
    expect(investigacionSourceName("colas-de-mensajes")).toBe("investigacion-colas-de-mensajes.md");
  });
});

describe("admiteBorrador", () => {
  it("sin material no se ofrece borrador: el modelo solo tendría el nombre del tema", () => {
    expect(admiteBorrador("ninguno", true)).toBe(false);
  });

  it("con cualquier material sí", () => {
    expect(admiteBorrador("carpeta", true)).toBe(true);
    expect(admiteBorrador("oferta", true)).toBe(true);
    expect(admiteBorrador("buscar", true)).toBe(true);
  });

  it("sin credenciales no se ofrece: decir que sí acabaría en un error de autenticación", () => {
    expect(admiteBorrador("carpeta", false)).toBe(false);
    expect(admiteBorrador("oferta", false)).toBe(false);
  });
});

describe("sourceChoices", () => {
  it("con credenciales se pueden elegir las cuatro fuentes", () => {
    expect(sourceChoices(true).filter((c) => c.disabled !== null)).toEqual([]);
  });

  it("sin credenciales solo 'buscar' cae, y dice por qué", () => {
    const caidas = sourceChoices(false).filter((c) => c.disabled !== null);

    expect(caidas.map((c) => c.value)).toEqual(["buscar"]);
    expect(caidas[0]!.disabled).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("las fuentes que no salen a la red no dependen de la key", () => {
    const sinKey = sourceChoices(false);

    for (const valor of ["carpeta", "oferta", "ninguno"] as const) {
      expect(sinKey.find((c) => c.value === valor)!.disabled).toBeNull();
    }
  });
});

describe("renderSkeleton", () => {
  const base = {
    dimension: "colas-de-mensajes",
    packName: "backend",
    source: "sources/apuntes.md",
    today: "2026-07-30",
  };

  it("una entrada por subtema propuesto, con el subtema ya puesto", () => {
    const yaml = renderSkeleton({ ...base, subtemas: ["kafka", "garantias"] });
    const parsed = parse(yaml) as { subtopic: string; dimension: string; date: string }[];

    expect(parsed).toHaveLength(2);
    expect(parsed.map((q) => q.subtopic)).toEqual(["kafka", "garantias"]);
    expect(parsed[0]!.dimension).toBe("colas-de-mensajes");
    expect(parsed[0]!.date).toBe("2026-07-30");
  });

  it("sin subtemas deja huecos en blanco en vez de inventarse un temario", () => {
    const parsed = parse(renderSkeleton({ ...base, subtemas: [] })) as { subtopic: string }[];

    expect(parsed).toHaveLength(3);
    expect(parsed.every((q) => q.subtopic === "")).toBe(true);
  });

  it("no vuelca un brief entero: ocho huecos son un punto de partida, veinte una pared", () => {
    const subtemas = Array.from({ length: 20 }, (_, i) => `tema-${i}`);

    expect(parse(renderSkeleton({ ...base, subtemas }))).toHaveLength(8);
  });

  it("las cuatro opciones van vacías: rellenarlas es el trabajo", () => {
    const parsed = parse(renderSkeleton({ ...base, subtemas: ["kafka"] })) as {
      options: { id: string; text: string }[];
    }[];

    expect(parsed[0]!.options.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
    expect(parsed[0]!.options.every((o) => o.text === "")).toBe(true);
  });

  it("la cabecera dice qué falta y qué lo cierra, sin abrir la documentación", () => {
    const yaml = renderSkeleton({ ...base, subtemas: ["kafka"] });

    expect(yaml).toMatch(/ESQUELETO sin rellenar/);
    expect(yaml).toContain("aptus promote backend colas-de-mensajes");
  });

  it("cada campo lleva al lado qué va ahí", () => {
    const yaml = renderSkeleton({ ...base, subtemas: ["kafka"] });

    expect(yaml).toMatch(/difficulty: medium\s+# easy \| medium \| hard \| experto/);
    expect(yaml).toMatch(/stem: ""\s+# el enunciado/);
  });

  it("un esqueleto sin rellenar NO pasa el schema: promoverlo por olvido no cuela", () => {
    const [primera] = parse(renderSkeleton({ ...base, subtemas: ["kafka"] })) as unknown[];

    expect(QuestionSchema.safeParse(primera).success).toBe(false);
  });
});

describe("fuente: carpeta", () => {
  it("con material escribe lo copiado y el brief, en ese orden", () => {
    const res = planNewDimension(
      plan({
        fuente: "carpeta",
        copiados: ["sources/a.md", "sources/b.md"],
        leidos: 2,
        descartados: 0,
      }),
    );

    expect(res.written).toEqual(["sources/a.md", "sources/b.md", BRIEF, "pack.yaml"]);
    expect(res.pending).toEqual([expect.stringContaining("aptus draft backend -d colas-de-mensajes")]);
  });

  it("una carpeta sin nada legible NO escribe brief: sería fingir que hay índice", () => {
    const res = planNewDimension(
      plan({ fuente: "carpeta", copiados: [], leidos: 0, descartados: 3 }),
    );

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.written).not.toContain(BRIEF);
    expect(res.pending[0]).toMatch(/conseguir material/);
  });

  it("los ficheros que no se han sabido leer se dicen, no se callan", () => {
    const res = planNewDimension(
      plan({ fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 2 }),
    );

    expect(res.pending).toContainEqual(expect.stringMatching(/2 fichero\(s\) no se han leído/));
  });

  it("sin descartados no aparece ese pendiente", () => {
    const res = planNewDimension(
      plan({ fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 0 }),
    );

    expect(res.pending.some((p) => /no se han leído/.test(p))).toBe(false);
  });
});

describe("fuente: oferta y buscar", () => {
  it("la oferta queda escrita como material y no genera brief", () => {
    const res = planNewDimension(plan({ fuente: "oferta", copiado: "sources/oferta-x.txt" }));

    expect(res.written).toEqual(["sources/oferta-x.txt", "pack.yaml"]);
    expect(res.written).not.toContain(BRIEF);
  });

  it("lo que escribe un modelo queda pendiente de verificar: no es fuente auditada", () => {
    const res = planNewDimension(plan({ fuente: "buscar", copiado: "sources/investigacion-x.md" }));

    expect(res.written).toContain("sources/investigacion-x.md");
    expect(res.pending).toContainEqual(expect.stringMatching(/verificar el informe/));
  });
});

describe("fuente: ninguno", () => {
  it("declara la dimensión y lo único pendiente es darle material", () => {
    const res = planNewDimension(plan({ fuente: "ninguno" }));

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.pending).toEqual([expect.stringContaining("aptus ingest <carpeta> --pack backend")]);
  });

  it("no propone escribir preguntas de un tema sin material", () => {
    const res = planNewDimension(plan({ fuente: "ninguno" }));

    expect(res.pending.some((p) => /aptus draft/.test(p))).toBe(false);
  });
});

describe("declaración en pack.yaml", () => {
  it("una dimensión que ya estaba declarada no se cuenta como escrita", () => {
    const res = planNewDimension(plan({ fuente: "ninguno" }, { dimensionDeclarada: false }));

    expect(res.written).toEqual([]);
  });
});

describe("borrador", () => {
  it("un borrador con preguntas queda escrito pero PENDIENTE de promover: no evalúa aún", () => {
    const res = planNewDimension(
      plan(
        { fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 0 },
        { borrador: { validas: 9, descartadas: 3, fichero: "drafts/colas-de-mensajes.yaml" } },
      ),
    );

    expect(res.written).toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toEqual([
      expect.stringContaining("aptus promote backend colas-de-mensajes"),
    ]);
  });

  it("un borrador vacío no escribe nada y pide reintentarlo", () => {
    const res = planNewDimension(
      plan(
        { fuente: "oferta", copiado: "sources/oferta-x.txt" },
        { borrador: { validas: 0, descartadas: 12, fichero: "drafts/colas-de-mensajes.yaml" } },
      ),
    );

    expect(res.written).not.toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toContainEqual(expect.stringMatching(/volver a intentar el borrador/));
  });

  it("pedir borrador sustituye al pendiente de 'escribir las preguntas'", () => {
    const res = planNewDimension(
      plan(
        { fuente: "buscar", copiado: "sources/investigacion-x.md" },
        { borrador: { validas: 5, descartadas: 0, fichero: "drafts/colas-de-mensajes.yaml" } },
      ),
    );

    expect(res.pending.some((p) => /aptus draft/.test(p))).toBe(false);
  });
});

describe("sin credenciales", () => {
  const material: MaterialOutcome = {
    fuente: "carpeta",
    copiados: ["sources/a.md"],
    leidos: 1,
    descartados: 0,
  };

  it("el resumen dice que falta la key en vez de callarse por qué no hay borrador", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: false }));

    expect(res.pending).toContainEqual(expect.stringContaining("ANTHROPIC_API_KEY"));
  });

  it("no propone `aptus draft`: es exactamente lo que no se puede hacer", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: false }));

    expect(res.pending.some((p) => /aptus draft/.test(p))).toBe(false);
    expect(res.pending).toContainEqual(expect.stringMatching(/a mano/));
  });

  it("con credenciales no se menciona la key: no falta nada", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: true }));

    expect(res.pending.some((p) => /ANTHROPIC_API_KEY/.test(p))).toBe(false);
  });
});

describe("esqueleto a mano", () => {
  const material: MaterialOutcome = {
    fuente: "carpeta",
    copiados: ["sources/a.md"],
    leidos: 1,
    descartados: 0,
  };
  const esqueleto = { entradas: 4, fichero: "drafts/colas-de-mensajes.yaml" };

  it("queda escrito y el pendiente es rellenarlo y promoverlo", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: false, esqueleto }));

    expect(res.written).toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toContainEqual(
      expect.stringContaining("aptus promote backend colas-de-mensajes"),
    );
  });

  it("dice cuántos huecos hay que rellenar y en qué fichero", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: false, esqueleto }));
    const paso = res.pending.find((p) => /promote/.test(p))!;

    expect(paso).toContain("4 pregunta(s)");
    expect(paso).toContain("drafts/colas-de-mensajes.yaml");
  });

  it("un esqueleto NO deja el tema evaluable: sigue habiendo un paso por delante", () => {
    const res = planNewDimension(plan(material, { tieneApiKey: false, esqueleto }));

    expect(res.pending.length).toBeGreaterThan(0);
  });

  it("sobre un tema sin material, el esqueleto sustituye al pendiente genérico", () => {
    const res = planNewDimension(plan({ fuente: "ninguno" }, { tieneApiKey: false, esqueleto }));

    expect(res.pending.some((p) => /aptus ingest/.test(p))).toBe(false);
    expect(res.pending).toContainEqual(expect.stringContaining("aptus promote"));
  });
});

describe("el tema nunca queda evaluable de golpe", () => {
  const casos: MaterialOutcome[] = [
    { fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 0 },
    { fuente: "carpeta", copiados: [], leidos: 0, descartados: 0 },
    { fuente: "oferta", copiado: "sources/oferta-x.txt" },
    { fuente: "buscar", copiado: "sources/investigacion-x.md" },
    { fuente: "ninguno" },
  ];

  it.each(casos)("fuente '$fuente' siempre deja algo pendiente", (material) => {
    // Un borrador recién generado no puede evaluarte: la regla de "lo no revisado
    // no te evalúa" tiene que sobrevivir a cualquier camino del asistente.
    expect(planNewDimension(plan(material)).pending.length).toBeGreaterThan(0);
  });
});
