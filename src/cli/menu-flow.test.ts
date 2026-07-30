import { describe, expect, it } from "vitest";
import { ESCAPED } from "./keys.js";
import {
  expandirRuta,
  nextMenuStep,
  nextTrasEjecutar,
  nextTrasMenu,
  runMenuAction,
  type MenuAction,
} from "./menu-flow.js";

describe("acciones sin sub-prompts", () => {
  it("'salir' cierra el menú", () => {
    expect(nextMenuStep("salir", [])).toEqual({ tipo: "salir" });
    expect(runMenuAction("salir", [])).toEqual({ tipo: "salir" });
  });

  it("'start' arranca sin preguntar: el asistente de la sesión pregunta por su cuenta", () => {
    expect(runMenuAction("start", [])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "start" },
    });
  });

  it("'packs' solo lista", () => {
    expect(runMenuAction("packs", [])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "packs" },
    });
  });
});

describe("acciones de un solo pack", () => {
  const acciones: MenuAction[] = ["review", "history", "report", "verify", "borrar-sesion"];

  it.each(acciones)("'%s' pregunta el pack y lo pasa tal cual", (accion) => {
    const paso = nextMenuStep(accion, []);

    expect(paso).toEqual({ tipo: "preguntar", prompt: { id: "pack", mensaje: expect.any(String) } });
    expect(runMenuAction(accion, ["mi-pack"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: accion, pack: "mi-pack" },
    });
  });

  it("'jobs' lleva además el límite de ofertas", () => {
    expect(runMenuAction("jobs", ["mi-pack"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "jobs", pack: "mi-pack", limite: 20 },
    });
  });

  it.each([...acciones, "jobs" as MenuAction])("ESC en el pack de '%s' vuelve sin ejecutar", (a) => {
    expect(runMenuAction(a, [ESCAPED])).toEqual({ tipo: "volver" });
  });

  it("cada acción pregunta por el pack con su propio mensaje", () => {
    const mensajes = acciones.map((a) => {
      const paso = nextMenuStep(a, []);
      return paso.tipo === "preguntar" && paso.prompt.id === "pack" ? paso.prompt.mensaje : "";
    });

    expect(new Set(mensajes).size).toBe(acciones.length);
  });
});

describe("evaluar una oferta (jd)", () => {
  it("evaluar pide oferta, pack y modo — y nada más", () => {
    expect(runMenuAction("jd", ["/tmp/oferta.txt", "mi-pack", "evaluar"])).toEqual({
      tipo: "ejecutar",
      invocacion: {
        comando: "jd",
        ruta: "/tmp/oferta.txt",
        pack: "mi-pack",
        brief: false,
        memoria: null,
      },
    });
  });

  it("el brief sin cruzar material no pide la ruta del material", () => {
    expect(runMenuAction("jd", ["/tmp/oferta.txt", "mi-pack", "brief", "no"])).toEqual({
      tipo: "ejecutar",
      invocacion: {
        comando: "jd",
        ruta: "/tmp/oferta.txt",
        pack: "mi-pack",
        brief: true,
        memoria: null,
      },
    });
  });

  it("el brief cruzado sí pide dónde está el material", () => {
    const paso = nextMenuStep("jd", ["/tmp/oferta.txt", "mi-pack", "brief", "si"]);

    expect(paso.tipo === "preguntar" && paso.prompt.id).toBe("rutaMaterial");
    expect(runMenuAction("jd", ["/tmp/oferta.txt", "mi-pack", "brief", "si", "~/vault"])).toEqual({
      tipo: "ejecutar",
      invocacion: {
        comando: "jd",
        ruta: "/tmp/oferta.txt",
        pack: "mi-pack",
        brief: true,
        memoria: "~/vault",
      },
    });
  });

  it("el orden de los sub-prompts es oferta → pack → modo → cruzar → material", () => {
    const ids: string[] = [];
    const respuestas = ["/tmp/oferta.txt", "mi-pack", "brief", "si", "~/vault"];
    for (let i = 0; i < respuestas.length; i++) {
      const paso = nextMenuStep("jd", respuestas.slice(0, i));
      if (paso.tipo === "preguntar") ids.push(paso.prompt.id);
    }

    expect(ids).toEqual(["rutaOferta", "pack", "modoJd", "cruzarMaterial", "rutaMaterial"]);
  });

  it.each([0, 1, 2, 3, 4])("ESC en el sub-prompt %i cancela la acción entera", (posicion) => {
    const respuestas: (string | typeof ESCAPED)[] = [
      "/tmp/oferta.txt",
      "mi-pack",
      "brief",
      "si",
      "~/vault",
    ];
    respuestas[posicion] = ESCAPED;

    expect(runMenuAction("jd", respuestas.slice(0, posicion + 1))).toEqual({ tipo: "volver" });
  });
});

describe("ingerir material", () => {
  it("pide carpeta y nombre de pack", () => {
    expect(runMenuAction("ingest", ["/tmp/curso", "sistemas"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "ingest", carpeta: "/tmp/curso", pack: "sistemas" },
    });
  });

  it("nombre vacío = 'el de la carpeta': lo resuelve el comando, no el menú", () => {
    expect(runMenuAction("ingest", ["/tmp/curso", "   "])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "ingest", carpeta: "/tmp/curso", pack: null },
    });
  });

  it.each([0, 1])("ESC en el sub-prompt %i vuelve sin ingerir nada", (posicion) => {
    const respuestas: (string | typeof ESCAPED)[] = ["/tmp/curso", "sistemas"];
    respuestas[posicion] = ESCAPED;

    expect(runMenuAction("ingest", respuestas.slice(0, posicion + 1))).toEqual({ tipo: "volver" });
  });
});

// SESS-06: construir packs desde el menú. Las tres entradas llaman a los mismos
// comandos; lo que se testea aquí es lo que el menú DECIDE antes de llamarlos.
describe("crear un pack (new-pack)", () => {
  it("pide el nombre y lo crea", () => {
    expect(runMenuAction("new-pack", ["sistemas-distribuidos"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "new-pack", nombre: "sistemas-distribuidos" },
    });
  });

  it("recorta espacios pegados sin querer", () => {
    expect(runMenuAction("new-pack", ["  sistemas  "])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "new-pack", nombre: "sistemas" },
    });
  });

  it.each(["Sistemas Distribuidos", "../fuera", "con/barra", ""])(
    "'%s' no llega al disco: se avisa antes de componer ninguna ruta",
    (nombre) => {
      const out = runMenuAction("new-pack", [nombre]);

      expect(out.tipo).toBe("aviso");
      expect(out.tipo === "aviso" && out.titulo).toMatch(/inválido/i);
    },
  );

  it("ESC en el nombre vuelve sin crear nada", () => {
    expect(runMenuAction("new-pack", [ESCAPED])).toEqual({ tipo: "volver" });
  });
});

describe("borrador con LLM (draft)", () => {
  const conKey = { tieneApiKey: true };
  const sinKey = { tieneApiKey: false };

  it("sin credenciales no pregunta NADA: lo dice antes, no al final", () => {
    const paso = nextMenuStep("draft", [], sinKey);

    expect(paso.tipo).toBe("aviso");
    expect(paso.tipo === "aviso" && paso.cuerpo).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("sin credenciales el aviso llega con cero respuestas dadas", () => {
    // Lo importante no es el texto, es que no te haya hecho recorrer el asistente.
    expect(runMenuAction("draft", [], sinKey).tipo).toBe("aviso");
  });

  it("con credenciales pide pack y dimensión, y usa el mismo defecto que el flag -n", () => {
    expect(runMenuAction("draft", ["mi-pack", "llm-rag-evals"], conKey)).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "draft", pack: "mi-pack", dimension: "llm-rag-evals", cantidad: 12 },
    });
  });

  it("el orden de los sub-prompts es pack → dimensión", () => {
    const ids = [[], ["mi-pack"]].map((r) => {
      const paso = nextMenuStep("draft", r, conKey);
      return paso.tipo === "preguntar" ? paso.prompt.id : "";
    });

    expect(ids).toEqual(["pack", "dimension"]);
  });

  it("sin dimensión no hay borrador que pedir", () => {
    expect(runMenuAction("draft", ["mi-pack", "   "], conKey).tipo).toBe("aviso");
  });

  it.each([0, 1])("ESC en el sub-prompt %i vuelve sin gastar una llamada", (posicion) => {
    const respuestas: (string | typeof ESCAPED)[] = ["mi-pack", "llm-rag-evals"];
    respuestas[posicion] = ESCAPED;

    expect(runMenuAction("draft", respuestas.slice(0, posicion + 1), conKey)).toEqual({
      tipo: "volver",
    });
  });
});

describe("promover un borrador (promote)", () => {
  it("no promueve hasta confirmar que lo has leído", () => {
    const paso = nextMenuStep("promote", ["mi-pack", "llm-rag-evals"]);

    expect(paso).toEqual({
      tipo: "preguntar",
      prompt: { id: "confirmarPromote", pack: "mi-pack", dimension: "llm-rag-evals" },
    });
  });

  it("confirmando, promueve", () => {
    expect(runMenuAction("promote", ["mi-pack", "llm-rag-evals", "si"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "promote", pack: "mi-pack", dimension: "llm-rag-evals" },
    });
  });

  it("sin confirmar NO promueve, y dice por qué importa", () => {
    const out = runMenuAction("promote", ["mi-pack", "llm-rag-evals", "no"]);

    expect(out.tipo).toBe("aviso");
    expect(out.tipo === "aviso" && out.cuerpo).toMatch(/drafts\/llm-rag-evals\.yaml/);
    // Lo que la auditoría NO puede comprobar es justo lo que hay que leer.
    expect(out.tipo === "aviso" && out.cuerpo).toMatch(/mira la forma/);
  });

  it("cualquier respuesta que no sea 'si' es un no: promover no se hace por inercia", () => {
    for (const r of ["", "quizá", "SI", "s"]) {
      expect(runMenuAction("promote", ["mi-pack", "dim", r]).tipo).toBe("aviso");
    }
  });

  it.each([0, 1, 2])("ESC en el sub-prompt %i no mueve ningún fichero", (posicion) => {
    const respuestas: (string | typeof ESCAPED)[] = ["mi-pack", "llm-rag-evals", "si"];
    respuestas[posicion] = ESCAPED;

    expect(runMenuAction("promote", respuestas.slice(0, posicion + 1))).toEqual({ tipo: "volver" });
  });
});

// PERS-03: borrar es la única operación que destruye evidencia. El menú solo
// decide el pack; la lista, la confirmación y el borrado son los del comando.
describe("borrar una sesión", () => {
  it("pregunta el pack y delega: no reimplementa el borrado", () => {
    expect(runMenuAction("borrar-sesion", ["mi-pack"])).toEqual({
      tipo: "ejecutar",
      invocacion: { comando: "borrar-sesion", pack: "mi-pack" },
    });
  });

  it("no ejecuta nada por sí solo: sin pack no hay invocación", () => {
    expect(nextMenuStep("borrar-sesion", []).tipo).toBe("preguntar");
  });
});

describe("qué pasa después de ejecutar", () => {
  it("una sesión cancelada vuelve al menú sin pausa: no hay nada que leer", () => {
    expect(nextTrasEjecutar({ comando: "start" }, "cancelada")).toBe("volver");
  });

  it("una sesión completada pausa para poder leer el resultado", () => {
    expect(nextTrasEjecutar({ comando: "start" }, "completada")).toBe("pausar");
  });

  it("el resto de comandos siempre pausan: han escrito algo en pantalla", () => {
    expect(nextTrasEjecutar({ comando: "packs" }, null)).toBe("pausar");
    expect(nextTrasEjecutar({ comando: "history", pack: "p" }, null)).toBe("pausar");
  });
});

describe("nextTrasMenu", () => {
  it("ESC en el menú equivale a elegir 'Salir'", () => {
    expect(nextTrasMenu(ESCAPED)).toBe("salir");
    expect(nextTrasMenu("salir")).toBe("salir");
  });

  it("cualquier otra acción se devuelve tal cual", () => {
    expect(nextTrasMenu("report")).toBe("report");
  });
});

describe("expandirRuta", () => {
  it("expande ~ al home que se le inyecte", () => {
    expect(expandirRuta("~/vault", "/home/carlos")).toBe("/home/carlos/vault");
  });

  it("recorta espacios de sobra al pegar una ruta", () => {
    expect(expandirRuta("  /tmp/curso  ", "/home/carlos")).toBe("/tmp/curso");
  });

  it("sin HOME no inventa nada: deja el ~ tal cual", () => {
    expect(expandirRuta("~/vault", undefined)).toBe("~/vault");
  });

  it("un ~ que no va al principio no es el home", () => {
    expect(expandirRuta("/tmp/a~b", "/home/carlos")).toBe("/tmp/a~b");
  });
});
