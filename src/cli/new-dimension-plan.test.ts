import { describe, expect, it } from "vitest";
import {
  admiteBorrador,
  investigacionSourceName,
  ofertaSourceName,
  planNewDimension,
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
    expect(admiteBorrador("ninguno")).toBe(false);
  });

  it("con cualquier material sí", () => {
    expect(admiteBorrador("carpeta")).toBe(true);
    expect(admiteBorrador("oferta")).toBe(true);
    expect(admiteBorrador("buscar")).toBe(true);
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
