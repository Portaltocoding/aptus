import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { QuestionSchema } from "../content/schema.js";
import {
  admiteBorrador,
  editorDePegado,
  ficherosDe,
  investigacionSourceName,
  materialParaBorrador,
  materialUtil,
  nombreLibre,
  ofertaSourceName,
  ordenarFuentes,
  pegadoSourceName,
  planNewDimension,
  renderSkeleton,
  sourceChoices,
  sourceDelEsqueleto,
  validateDimensionName,
  type MaterialOutcome,
  type PlanInput,
} from "./new-dimension-plan.js";

const BRIEF = "BRIEF-colas-de-mensajes.md";

const CARPETA: MaterialOutcome = {
  fuente: "carpeta",
  copiados: ["sources/a.md"],
  leidos: 1,
  descartados: 0,
};

function plan(materiales: MaterialOutcome[], extra: Partial<PlanInput> = {}): PlanInput {
  return {
    dimension: "colas-de-mensajes",
    packName: "backend",
    briefFile: BRIEF,
    materiales,
    briefEscrito: materiales.some(materialUtil),
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

  it("el texto pegado se guarda con el nombre del tema: es material citable, no una nota", () => {
    expect(pegadoSourceName("colas-de-mensajes")).toBe("pegado-colas-de-mensajes.txt");
  });
});

describe("editorDePegado", () => {
  it("$VISUAL manda sobre $EDITOR, igual que en external-editor", () => {
    expect(editorDePegado({ VISUAL: "code", EDITOR: "nano" }, "linux")).toEqual({
      comando: "code",
      configurado: true,
    });
  });

  it("sin $VISUAL se usa $EDITOR", () => {
    expect(editorDePegado({ EDITOR: "nano" }, "linux").comando).toBe("nano");
  });

  it("se queda con el ejecutable, no con los argumentos", () => {
    expect(editorDePegado({ EDITOR: "code --wait" }, "linux").comando).toBe("code");
  });

  it("sin nada declarado cae al de por defecto, y lo dice", () => {
    expect(editorDePegado({}, "linux")).toEqual({ comando: "vim", configurado: false });
    expect(editorDePegado({}, "win32").comando).toBe("notepad");
  });

  it("un $EDITOR en blanco NO cae al de por defecto: es lo que rompe, y se ve", () => {
    // external-editor usa `??`, no `||`: una cadena vacía se lanza tal cual y falla.
    // Devolverla vacía es lo que deja detectarlo antes de abrir nada.
    expect(editorDePegado({ EDITOR: "" }, "linux")).toEqual({ comando: "", configurado: true });
  });
});

describe("nombreLibre", () => {
  it("si no choca con nada, es el nombre tal cual", () => {
    expect(nombreLibre("oferta-x.txt", ["otra.txt"])).toBe("oferta-x.txt");
  });

  it("no pisa material ya guardado: numera en vez de sobrescribir", () => {
    expect(nombreLibre("oferta-x.txt", ["oferta-x.txt"])).toBe("oferta-x-2.txt");
  });

  it("sigue numerando mientras siga chocando", () => {
    const usados = ["a.txt", "a-2.txt", "a-3.txt"];

    expect(nombreLibre("a.txt", usados)).toBe("a-4.txt");
  });

  it("un nombre sin extensión también se numera bien", () => {
    expect(nombreLibre("notas", ["notas"])).toBe("notas-2");
  });

  it("respeta la extensión compuesta contando solo el último punto", () => {
    expect(nombreLibre("apuntes.tar.gz", ["apuntes.tar.gz"])).toBe("apuntes.tar-2.gz");
  });
});

describe("admiteBorrador", () => {
  it("sin material no se ofrece borrador: el modelo solo tendría el nombre del tema", () => {
    expect(admiteBorrador([], true)).toBe(false);
  });

  it("con cualquier material sí", () => {
    expect(admiteBorrador([CARPETA], true)).toBe(true);
    expect(admiteBorrador([{ fuente: "oferta", copiado: "sources/o.txt" }], true)).toBe(true);
    expect(admiteBorrador([{ fuente: "buscar", copiado: "sources/i.md" }], true)).toBe(true);
  });

  it("sin credenciales no se ofrece: decir que sí acabaría en un error de autenticación", () => {
    expect(admiteBorrador([CARPETA], false)).toBe(false);
  });

  it("una carpeta marcada pero vacía no es tener material", () => {
    expect(
      admiteBorrador([{ fuente: "carpeta", copiados: [], leidos: 0, descartados: 2 }], true),
    ).toBe(false);
  });

  it("basta con que UNA de las combinadas haya dejado algo", () => {
    const materiales: MaterialOutcome[] = [
      { fuente: "fallo", origen: "buscar", motivo: "sin red" },
      CARPETA,
    ];

    expect(admiteBorrador(materiales, true)).toBe(true);
  });
});

describe("sourceChoices", () => {
  it("con credenciales se pueden elegir todas las fuentes", () => {
    expect(sourceChoices(true).filter((c) => c.disabled !== null)).toEqual([]);
  });

  it("sin credenciales solo 'buscar' cae, y dice por qué", () => {
    const caidas = sourceChoices(false).filter((c) => c.disabled !== null);

    expect(caidas.map((c) => c.value)).toEqual(["buscar"]);
    expect(caidas[0]!.disabled).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("las fuentes que no salen a la red no dependen de la key", () => {
    const sinKey = sourceChoices(false);

    for (const valor of ["carpeta", "oferta", "pegar"] as const) {
      expect(sinKey.find((c) => c.value === valor)!.disabled).toBeNull();
    }
  });

  it("no hay casilla 'ninguno': no marcar nada ya significa eso", () => {
    expect(sourceChoices(true).map((c) => c.value as string)).not.toContain("ninguno");
  });
});

describe("ordenarFuentes", () => {
  it("lo local va antes que la red, se marque en el orden que se marque", () => {
    expect(ordenarFuentes(["buscar", "pegar", "oferta", "carpeta"])).toEqual([
      "carpeta",
      "oferta",
      "pegar",
      "buscar",
    ]);
  });

  it("no marcar nada es una combinación válida: la lista vacía", () => {
    expect(ordenarFuentes([])).toEqual([]);
  });

  it("una fuente repetida se recorre una sola vez", () => {
    expect(ordenarFuentes(["carpeta", "carpeta"])).toEqual(["carpeta"]);
  });
});

describe("materialUtil y ficherosDe", () => {
  it("una carpeta sin nada legible no cuenta como material ni aporta ficheros", () => {
    const vacia: MaterialOutcome = { fuente: "carpeta", copiados: [], leidos: 0, descartados: 1 };

    expect(materialUtil(vacia)).toBe(false);
    expect(ficherosDe(vacia)).toEqual([]);
  });

  it("una fuente caída no aporta nada", () => {
    const fallo: MaterialOutcome = { fuente: "fallo", origen: "oferta", motivo: "no existe" };

    expect(materialUtil(fallo)).toBe(false);
    expect(ficherosDe(fallo)).toEqual([]);
  });

  it("el esqueleto cita el primer material escrito, no el último", () => {
    const materiales: MaterialOutcome[] = [CARPETA, { fuente: "buscar", copiado: "sources/i.md" }];

    expect(sourceDelEsqueleto(materiales)).toBe("sources/a.md");
  });

  it("sin ningún material, el esqueleto cita 'externa'", () => {
    expect(sourceDelEsqueleto([{ fuente: "fallo", origen: "buscar", motivo: "sin red" }])).toBe(
      "externa",
    );
  });
});

describe("materialParaBorrador", () => {
  it("cada trozo lleva delante de qué fichero sale, para poder citarlo", () => {
    const texto = materialParaBorrador([
      { path: "sources/a.md", text: "kafka" },
      { path: "sources/b.md", text: "rabbit" },
    ]);

    expect(texto).toContain("--- sources/a.md ---\nkafka");
    expect(texto).toContain("--- sources/b.md ---\nrabbit");
  });

  it("sin material es cadena vacía, no un bloque de cabeceras sueltas", () => {
    expect(materialParaBorrador([])).toBe("");
  });

  it("si hay que recortar se dice en el propio texto, no se corta a traición", () => {
    const texto = materialParaBorrador([{ path: "a.md", text: "x".repeat(500) }], 100);

    expect(texto.length).toBeLessThan(300);
    expect(texto).toMatch(/material recortado: \d+ caracteres más/);
  });

  it("por debajo del tope no se toca nada", () => {
    expect(materialParaBorrador([{ path: "a.md", text: "corto" }], 1000)).toBe(
      "--- a.md ---\ncorto",
    );
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
      plan([
        {
          fuente: "carpeta",
          copiados: ["sources/a.md", "sources/b.md"],
          leidos: 2,
          descartados: 0,
        },
      ]),
    );

    expect(res.written).toEqual(["sources/a.md", "sources/b.md", BRIEF, "pack.yaml"]);
    expect(res.pending).toEqual([
      expect.stringContaining("aptus draft backend -d colas-de-mensajes"),
    ]);
  });

  it("una carpeta sin nada legible NO escribe brief: sería fingir que hay índice", () => {
    const res = planNewDimension(
      plan([{ fuente: "carpeta", copiados: [], leidos: 0, descartados: 3 }]),
    );

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.written).not.toContain(BRIEF);
    expect(res.pending[0]).toMatch(/conseguir material/);
  });

  it("los ficheros que no se han sabido leer se dicen, no se callan", () => {
    const res = planNewDimension(
      plan([{ fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 2 }]),
    );

    expect(res.pending).toContainEqual(expect.stringMatching(/2 fichero\(s\) no se han leído/));
  });

  it("sin descartados no aparece ese pendiente", () => {
    const res = planNewDimension(plan([CARPETA]));

    expect(res.pending.some((p) => /no se han leído/.test(p))).toBe(false);
  });
});

describe("fuente: oferta y buscar", () => {
  it("la oferta queda escrita como material y alimenta el brief como cualquier otra", () => {
    const res = planNewDimension(plan([{ fuente: "oferta", copiado: "sources/oferta-x.txt" }]));

    expect(res.written).toEqual(["sources/oferta-x.txt", BRIEF, "pack.yaml"]);
  });

  it("lo que escribe un modelo queda pendiente de verificar: no es fuente auditada", () => {
    const res = planNewDimension(
      plan([{ fuente: "buscar", copiado: "sources/investigacion-x.md" }]),
    );

    expect(res.written).toContain("sources/investigacion-x.md");
    expect(res.pending).toContainEqual(expect.stringMatching(/verificar el informe/));
  });
});

describe("fuente: pegar texto", () => {
  it("lo pegado queda escrito como material y alimenta el brief", () => {
    const res = planNewDimension(
      plan([{ fuente: "pegar", copiado: "sources/pegado-x.txt", caracteres: 420 }]),
    );

    expect(res.written).toEqual(["sources/pegado-x.txt", BRIEF, "pack.yaml"]);
  });

  it("un pegado vacío no escribe nada, y se dice en vez de callarlo", () => {
    const vacio: MaterialOutcome = { fuente: "pegar", copiado: null, caracteres: 0 };
    const res = planNewDimension(plan([vacio]));

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.pending).toContainEqual(expect.stringMatching(/texto pegado venía vacío/));
  });

  it("un pegado vacío no cuenta como material: no habilita el borrador", () => {
    const vacio: MaterialOutcome = { fuente: "pegar", copiado: null, caracteres: 0 };

    expect(materialUtil(vacio)).toBe(false);
    expect(ficherosDe(vacio)).toEqual([]);
    expect(admiteBorrador([vacio], true)).toBe(false);
  });

  it("se puede pegar Y traer una carpeta: las dos acaban en el resumen", () => {
    const res = planNewDimension(
      plan([CARPETA, { fuente: "pegar", copiado: "sources/pegado-x.txt", caracteres: 12 }]),
    );

    expect(res.written).toEqual(["sources/a.md", "sources/pegado-x.txt", BRIEF, "pack.yaml"]);
  });
});

describe("sin fuentes marcadas", () => {
  it("declara la dimensión y lo único pendiente es darle material", () => {
    const res = planNewDimension(plan([]));

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.pending).toEqual([expect.stringContaining("aptus ingest <carpeta> --pack backend")]);
  });

  it("no propone escribir preguntas de un tema sin material", () => {
    expect(planNewDimension(plan([])).pending.some((p) => /aptus draft/.test(p))).toBe(false);
  });
});

describe("fuentes combinadas", () => {
  const dos: MaterialOutcome[] = [CARPETA, { fuente: "buscar", copiado: "sources/i.md" }];

  it("todo lo que producen se acumula, en el orden en que se recorrieron", () => {
    const res = planNewDimension(plan(dos));

    expect(res.written).toEqual(["sources/a.md", "sources/i.md", BRIEF, "pack.yaml"]);
  });

  it("el brief es UNO solo aunque las fuentes sean varias", () => {
    const res = planNewDimension(plan(dos));

    expect(res.written.filter((f) => f === BRIEF)).toHaveLength(1);
  });

  it("una funciona y otra falla: se reportan las dos", () => {
    const res = planNewDimension(
      plan([CARPETA, { fuente: "fallo", origen: "buscar", motivo: "se ha cortado la red" }]),
    );

    expect(res.written).toContain("sources/a.md");
    expect(res.pending).toContainEqual(expect.stringMatching(/'buscar' no ha dejado material/));
    expect(res.pending).toContainEqual(expect.stringMatching(/se ha cortado la red/));
  });

  it("si TODAS caen, el tema queda como si no se hubiera marcado nada", () => {
    const res = planNewDimension(
      plan(
        [
          { fuente: "fallo", origen: "carpeta", motivo: "no existe" },
          { fuente: "fallo", origen: "oferta", motivo: "no se puede leer" },
        ],
        { briefEscrito: false },
      ),
    );

    expect(res.written).toEqual(["pack.yaml"]);
    expect(res.pending).toContainEqual(expect.stringContaining("aptus ingest"));
  });

  it("cada fuente aporta sus propios pendientes, sin pisarse", () => {
    const res = planNewDimension(
      plan([
        { fuente: "carpeta", copiados: ["sources/a.md"], leidos: 1, descartados: 2 },
        { fuente: "buscar", copiado: "sources/i.md" },
      ]),
    );

    expect(res.pending).toContainEqual(expect.stringMatching(/no se han leído/));
    expect(res.pending).toContainEqual(expect.stringMatching(/verificar el informe/));
  });
});

describe("declaración en pack.yaml", () => {
  it("una dimensión que ya estaba declarada no se cuenta como escrita", () => {
    const res = planNewDimension(plan([], { dimensionDeclarada: false }));

    expect(res.written).toEqual([]);
  });
});

describe("borrador", () => {
  it("un borrador con preguntas queda escrito pero PENDIENTE de promover: no evalúa aún", () => {
    const res = planNewDimension(
      plan([CARPETA], {
        borrador: { validas: 9, descartadas: 3, fichero: "drafts/colas-de-mensajes.yaml" },
      }),
    );

    expect(res.written).toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toEqual([
      expect.stringContaining("aptus promote backend colas-de-mensajes"),
    ]);
  });

  it("un borrador vacío no escribe nada y pide reintentarlo", () => {
    const res = planNewDimension(
      plan([{ fuente: "oferta", copiado: "sources/oferta-x.txt" }], {
        borrador: { validas: 0, descartadas: 12, fichero: "drafts/colas-de-mensajes.yaml" },
      }),
    );

    expect(res.written).not.toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toContainEqual(expect.stringMatching(/volver a intentar el borrador/));
  });

  it("pedir borrador sustituye al pendiente de 'escribir las preguntas'", () => {
    const res = planNewDimension(
      plan([{ fuente: "buscar", copiado: "sources/investigacion-x.md" }], {
        borrador: { validas: 5, descartadas: 0, fichero: "drafts/colas-de-mensajes.yaml" },
      }),
    );

    expect(res.pending.some((p) => /aptus draft/.test(p))).toBe(false);
  });
});

describe("sin credenciales", () => {
  it("el resumen dice que falta la key en vez de callarse por qué no hay borrador", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: false }));

    expect(res.pending).toContainEqual(expect.stringContaining("ANTHROPIC_API_KEY"));
  });

  it("no propone `aptus draft`: es exactamente lo que no se puede hacer", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: false }));

    expect(res.pending.some((p) => /aptus draft/.test(p))).toBe(false);
    expect(res.pending).toContainEqual(expect.stringMatching(/a mano/));
  });

  it("con credenciales no se menciona la key: no falta nada", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: true }));

    expect(res.pending.some((p) => /ANTHROPIC_API_KEY/.test(p))).toBe(false);
  });
});

describe("esqueleto a mano", () => {
  const esqueleto = { entradas: 4, fichero: "drafts/colas-de-mensajes.yaml" };

  it("queda escrito y el pendiente es rellenarlo y promoverlo", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: false, esqueleto }));

    expect(res.written).toContain("drafts/colas-de-mensajes.yaml");
    expect(res.pending).toContainEqual(
      expect.stringContaining("aptus promote backend colas-de-mensajes"),
    );
  });

  it("dice cuántos huecos hay que rellenar y en qué fichero", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: false, esqueleto }));
    const paso = res.pending.find((p) => /promote/.test(p))!;

    expect(paso).toContain("4 pregunta(s)");
    expect(paso).toContain("drafts/colas-de-mensajes.yaml");
  });

  it("un esqueleto NO deja el tema evaluable: sigue habiendo un paso por delante", () => {
    const res = planNewDimension(plan([CARPETA], { tieneApiKey: false, esqueleto }));

    expect(res.pending.length).toBeGreaterThan(0);
  });

  it("sobre un tema sin material, el esqueleto sustituye al pendiente genérico", () => {
    const res = planNewDimension(plan([], { tieneApiKey: false, esqueleto }));

    expect(res.pending.some((p) => /aptus ingest/.test(p))).toBe(false);
    expect(res.pending).toContainEqual(expect.stringContaining("aptus promote"));
  });
});

describe("el tema nunca queda evaluable de golpe", () => {
  const casos: MaterialOutcome[][] = [
    [CARPETA],
    [{ fuente: "carpeta", copiados: [], leidos: 0, descartados: 0 }],
    [{ fuente: "oferta", copiado: "sources/oferta-x.txt" }],
    [{ fuente: "buscar", copiado: "sources/investigacion-x.md" }],
    [{ fuente: "pegar", copiado: "sources/pegado-x.txt", caracteres: 9 }],
    [{ fuente: "pegar", copiado: null, caracteres: 0 }],
    [CARPETA, { fuente: "buscar", copiado: "sources/investigacion-x.md" }],
    [{ fuente: "fallo", origen: "carpeta", motivo: "no existe" }],
    [],
  ];

  it.each(casos.map((c, i) => [i, c] as const))(
    "la combinación #%i siempre deja algo pendiente",
    (_i, materiales) => {
      // Un borrador recién generado no puede evaluarte: la regla de "lo no revisado
      // no te evalúa" tiene que sobrevivir a cualquier camino del asistente.
      expect(planNewDimension(plan(materiales)).pending.length).toBeGreaterThan(0);
    },
  );
});
