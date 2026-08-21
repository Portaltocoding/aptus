import { describe, expect, it } from "vitest";
import {
  parseDimensiones,
  pendienteDelTema,
  planTema,
  renderBriefDeTema,
  renderPackYaml,
} from "./tema-plan.js";

/**
 * Las decisiones de `aptus tema`, sin gastar una llamada al modelo: de dónde sale
 * el material, qué dimensiones quedan, qué se escribe y —lo que más importa— qué
 * se le dice al usuario que le falta.
 */

describe("planTema — de dónde sale el material", () => {
  it("sin carpeta, el tema se investiga", () => {
    expect(planTema({ count: 12 }).fuente).toBe("investigacion");
  });

  it("con carpeta, manda tu material", () => {
    expect(planTema({ count: 12, material: "~/curso" }).fuente).toBe("carpeta");
  });

  it("sin --dims, las dimensiones las decide el modelo", () => {
    expect(planTema({ count: 12 }).dimensiones).toBeNull();
  });

  it("con --dims, las tuyas y normalizadas", () => {
    expect(planTema({ count: 12, dims: "Colas de mensajes, Réplicas" }).dimensiones).toEqual([
      "colas-de-mensajes",
      "replicas",
    ]);
  });
});

describe("parseDimensiones", () => {
  it("normaliza a kebab en vez de rechazar lo que escribirías tú", () => {
    // "Colas de mensajes" es lo que se piensa; `colas-de-mensajes` es lo que tiene
    // que acabar siendo un nombre de fichero. Rechazarlo sería pedantería.
    expect(parseDimensiones("Colas de Mensajes")).toEqual(["colas-de-mensajes"]);
    expect(parseDimensiones("Diseño de Índices")).toEqual(["diseno-de-indices"]);
  });

  it("descarta duplicados que solo se diferencian en la forma", () => {
    expect(parseDimensiones("Redes, redes, REDES")).toEqual(["redes"]);
  });

  it("descarta trozos vacíos y demasiado cortos", () => {
    // Menos de tres caracteres útiles no es un nombre de dimensión, es un dedazo.
    // Mismo suelo que el asistente de tema nuevo, para que no discrepen.
    expect(parseDimensiones("redes, , dns, a")).toEqual(["redes", "dns"]);
  });

  it("quedarse sin ninguna sí es un error, y lo dice con la sintaxis buena", () => {
    expect(() => parseDimensiones(" , , ")).toThrow(/--dims/);
  });
});

describe("renderPackYaml", () => {
  it("declara las dimensiones pedidas y ninguna de ejemplo", () => {
    const yaml = renderPackYaml("sistemas", ["consenso", "particionado"]);

    expect(yaml).toContain('name: "sistemas"');
    expect(yaml).toContain("  - consenso");
    expect(yaml).toContain("  - particionado");
    // El esqueleto de `new-pack` trae una dimensión de ejemplo que la auditoría
    // marca como "sin curar": un pack generado no puede nacer con ese aviso.
    expect(yaml).not.toContain("dimension-ejemplo");
  });
});

describe("renderBriefDeTema", () => {
  const plan = [
    { name: "consenso", foco: "Raft y Paxos. NO entra el almacenamiento." },
    { name: "particionado", foco: "Sharding y rebalanceo." },
  ];

  it("recoge cada dimensión con su foco: es el encargo que leerá draft", () => {
    const brief = renderBriefDeTema("sistemas", plan, "carpeta", ["apuntes.md"]);

    expect(brief).toContain("### consenso");
    expect(brief).toContain("Raft y Paxos");
    expect(brief).toContain("### particionado");
    expect(brief).toContain("`sources/apuntes.md`");
  });

  it("dice que una investigación del modelo NO es una fuente auditada", () => {
    const brief = renderBriefDeTema("sistemas", plan, "investigacion", ["investigacion.md"]);
    expect(brief).toMatch(/no es una fuente auditada/i);
  });

  it("sin fuentes lo dice, en vez de dejar una sección vacía", () => {
    const brief = renderBriefDeTema("sistemas", plan, "investigacion", []);
    expect(brief).toMatch(/ninguna/i);
  });
});

describe("pendienteDelTema — lo que falta para que el tema evalúe", () => {
  const escritas = [
    { dimension: "consenso", preguntas: 12 },
    { dimension: "particionado", preguntas: 9 },
  ];

  it("cuenta las preguntas y dice que mientras estén en drafts/ no miden", () => {
    const pasos = pendienteDelTema("sistemas", escritas).join("\n");

    expect(pasos).toContain("21");
    expect(pasos).toMatch(/no te evalúan/i);
  });

  it("da el promote exacto de cada dimensión, para poder copiarlo", () => {
    const pasos = pendienteDelTema("sistemas", escritas);

    expect(pasos).toContain("Cuando te fíes de 'consenso': aptus promote sistemas consenso");
    expect(pasos).toContain(
      "Cuando te fíes de 'particionado': aptus promote sistemas particionado",
    );
  });

  it("sin ningún borrador no finge que haya nada que revisar", () => {
    const pasos = pendienteDelTema("sistemas", []).join("\n");

    expect(pasos).toMatch(/ni un borrador/i);
    expect(pasos).toContain("aptus draft sistemas");
    expect(pasos).not.toMatch(/promote/);
  });
});
