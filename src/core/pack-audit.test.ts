import { describe, expect, it } from "vitest";
import type { Pack, Question } from "../content/schema.js";
import { auditPack, auditRationales, lengthBias, rationaleEcho, positionBias } from "./pack-audit.js";

function q(over: Partial<Question> & Pick<Question, "id" | "dimension">): Question {
  return {
    id: over.id,
    dimension: over.dimension,
    difficulty: over.difficulty ?? "easy",
    type: over.type ?? "concepto",
    roles: over.roles ?? [],
    stem: over.stem ?? "Enunciado suficientemente largo para pasar el mínimo.",
    options: over.options ?? [
      { id: "a", text: "correcta" },
      { id: "b", text: "incorrecta" },
    ],
    correct: over.correct ?? "a",
    explanation: over.explanation ?? "Explicación suficientemente larga y real.",
    source: over.source ?? "externa",
    date: over.date ?? "2026-01-01",
  };
}

function pack(questions: Question[], dimensions?: string[]): Pack {
  return {
    name: "test",
    version: "1.0.0",
    dimensions: dimensions ?? [...new Set(questions.map((x) => x.dimension))],
    questions,
  };
}

describe("auditPack", () => {
  it("un pack sano (con experto y suficientes preguntas) no da errores", () => {
    const qs = Array.from({ length: 12 }, (_, i) =>
      q({ id: `d-${i}`, dimension: "d", difficulty: i === 0 ? "experto" : "medium" }),
    );
    const rep = auditPack(pack(qs), 12);
    expect(rep.errors).toEqual([]);
    expect(rep.warnings.find((w) => w.code === "sin-experto")).toBeUndefined();
  });

  it("detecta ids duplicados como ERROR", () => {
    const rep = auditPack(pack([q({ id: "x", dimension: "d" }), q({ id: "x", dimension: "d" })]));
    expect(rep.errors.some((e) => e.code === "dup-id")).toBe(true);
  });

  it("avisa si una dimensión no tiene preguntas 'experto' (staff no evaluable)", () => {
    const qs = Array.from({ length: 12 }, (_, i) => q({ id: `d-${i}`, dimension: "d", difficulty: "hard" }));
    const rep = auditPack(pack(qs), 12);
    expect(rep.warnings.some((w) => w.code === "sin-experto")).toBe(true);
  });

  it("avisa de contenido sin curar (esqueleto/relleno)", () => {
    const rep = auditPack(pack([q({ id: "ejemplo-001", dimension: "dimension-ejemplo" })]));
    expect(rep.warnings.some((w) => w.code === "sin-curar")).toBe(true);
  });

  it("avisa de explicación demasiado corta", () => {
    const rep = auditPack(pack([q({ id: "d-1", dimension: "d", explanation: "corta" })]));
    expect(rep.warnings.some((w) => w.code === "explicacion-corta")).toBe(true);
  });
});

describe("sesgo de posición", () => {
  /** Banco realista: la correcta siempre la primera, que es como salen escritas a mano. */
  const sesgado = (n: number): Question[] =>
    Array.from({ length: n }, (_, i) =>
      q({
        id: `d-${i}`,
        dimension: "d",
        options: [
          { id: "a", text: "correcta" },
          { id: "b", text: "distractor 1" },
          { id: "c", text: "distractor 2" },
          { id: "d", text: "distractor 3" },
        ],
        correct: "a",
      }),
    );

  it("avisa cuando la correcta se concentra en una posición", () => {
    const rep = auditPack(pack(sesgado(40)), 12);
    const aviso = rep.warnings.find((w) => w.code === "sesgo-posicion");
    expect(aviso).toBeDefined();
    expect(aviso!.message).toContain("40/40");
    // Y deja claro que la sesión no está comprometida: aptus baraja al presentar.
    expect(aviso!.message).toMatch(/baraja/i);
  });

  it("no avisa si las correctas están repartidas", () => {
    const letras = ["a", "b", "c", "d"];
    const repartido = Array.from({ length: 40 }, (_, i) =>
      q({
        id: `d-${i}`,
        dimension: "d",
        options: letras.map((l) => ({ id: l, text: `opción ${l}` })),
        correct: letras[i % 4]!,
      }),
    );
    expect(auditPack(pack(repartido), 12).warnings.some((w) => w.code === "sesgo-posicion")).toBe(false);
  });

  it("no avisa con muestra insuficiente: 10 preguntas no prueban un sesgo", () => {
    expect(auditPack(pack(sesgado(10)), 5).warnings.some((w) => w.code === "sesgo-posicion")).toBe(false);
  });

  it("positionBias ignora las preguntas de respuesta múltiple", () => {
    const multiples = Array.from({ length: 30 }, (_, i) =>
      q({
        id: `m-${i}`,
        dimension: "d",
        options: [
          { id: "a", text: "una" },
          { id: "b", text: "otra" },
        ],
        correct: ["a", "b"],
      }),
    );
    expect(positionBias(multiples)).toBeNull();
  });
});

/**
 * Los apuntes de opción se enseñan ANTES de responder, así que la auditoría mira
 * una sola cosa: que no delaten cuál es la correcta.
 */
describe("auditRationales", () => {
  const largo = (n: number): string => "argumento plausible ".repeat(n).trim();

  it("un pack sin apuntes no dispara nada: el campo es opcional", () => {
    expect(auditRationales(q({ id: "x", dimension: "d" }))).toEqual([]);
  });

  it("apuntes en todas las opciones y de tamaño parecido: nada que decir", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: largo(2) },
        { id: "b", text: "incorrecta", rationale: largo(2) },
      ],
    });
    expect(auditRationales(pregunta)).toEqual([]);
  });

  it("avisa si solo algunas opciones tienen apunte: las que lo tienen destacan", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: largo(2) },
        { id: "b", text: "incorrecta" },
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).toContain("rationale-incompleto");
  });

  it("avisa si el apunte de la correcta es mucho más largo: se ve por el volumen", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: largo(10) },
        { id: "b", text: "incorrecta", rationale: largo(1) },
        { id: "c", text: "incorrecta", rationale: largo(1) },
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).toContain("rationale-delata");
  });

  it("un distractor largo NO se penaliza: solo delata el de la correcta", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: largo(1) },
        { id: "b", text: "incorrecta", rationale: largo(10) },
        { id: "c", text: "incorrecta", rationale: largo(1) },
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).not.toContain("rationale-delata");
  });

  it("avisa de un apunte puesto por poner", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: "sí" },
        { id: "b", text: "incorrecta", rationale: "no" },
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).toEqual([
      "rationale-corto",
      "rationale-corto",
    ]);
  });

  it("los hallazgos llegan al informe del pack con su id de pregunta", () => {
    const pregunta = q({
      id: "mixta-1",
      dimension: "d",
      options: [
        { id: "a", text: "correcta", rationale: largo(2) },
        { id: "b", text: "incorrecta" },
      ],
    });
    const rep = auditPack(pack([pregunta]));
    const hallazgo = rep.warnings.find((w) => w.code === "rationale-incompleto");

    expect(hallazgo?.questionId).toBe("mixta-1");
    expect(rep.errors).toEqual([]); // son avisos: nunca bloquean
  });
});

/**
 * El eco es el delator sutil: un apunte que reformula su opción no añade nada, y
 * si SOLO lo hace el de la correcta, la respuesta se adivina por el patrón sin
 * saber del tema. Es el fallo que se coló en la primera tanda de apuntes.
 */
describe("rationaleEcho", () => {
  it("reformular la opción da eco alto", () => {
    const eco = rationaleEcho(
      "Cachear las respuestas de los prompts repetidos",
      "Cachear las respuestas de los prompts que se repiten.",
    );
    expect(eco).toBeGreaterThan(0.7);
  });

  it("aportar algo que no estaba da eco bajo", () => {
    const eco = rationaleEcho(
      "Cachear las respuestas de los prompts repetidos",
      "En un asistente la cola de preguntas iguales es enorme: lo servido así no paga inferencia.",
    );
    expect(eco).toBeLessThan(0.3);
  });

  it("las palabras vacías no cuentan como eco", () => {
    expect(rationaleEcho("de la que en el", "de la que en el")).toBe(0);
  });
});

describe("auditRationales — eco", () => {
  const opcion = (id: string, text: string, rationale: string) => ({ id, text, rationale });

  it("avisa del apunte que reformula su propia opción", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      options: [
        opcion("a", "Cachear las respuestas repetidas del asistente", "Cachear las respuestas repetidas del asistente."),
        opcion("b", "Bajar de modelo en todo el tráfico", "Los tokens del modelo pequeño cuestan bastante menos por millón."),
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).toContain("rationale-eco");
  });

  it("avisa si SOLO la correcta reformula: el patrón delata sin leer", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      correct: "a",
      options: [
        opcion("a", "Cachear las respuestas repetidas del asistente", "Cachear las respuestas ya repetidas del asistente."),
        opcion("b", "Bajar de modelo en todo el tráfico", "Los tokens salen bastante más baratos por cada millón facturado."),
        opcion("c", "Recortar el contexto recuperado a la mitad", "El prompt adelgaza y con él la factura de cada llamada."),
      ],
    });
    expect(auditRationales(pregunta).map((h) => h.code)).toContain("rationale-eco-delata");
  });

  it("apuntes que aportan en todas las opciones no disparan nada", () => {
    const pregunta = q({
      id: "x",
      dimension: "d",
      correct: "a",
      options: [
        opcion("a", "Cachear las respuestas repetidas", "Sirve lo mismo sin pagar inferencia: por eso no toca la calidad."),
        opcion("b", "Bajar de modelo en todo el tráfico", "Los tokens salen más baratos por millón facturado al proveedor."),
        opcion("c", "Recortar el contexto recuperado", "El prompt adelgaza y con él la factura de cada llamada saliente."),
      ],
    });
    expect(auditRationales(pregunta)).toEqual([]);
  });
});

/**
 * El sesgo que invalida un banco entero: si la correcta es siempre la más larga,
 * se aprueba sin leer. Barajar las opciones no lo corrige.
 */
describe("lengthBias", () => {
  const par = (correcta: string, otras: string[], i: number): Question =>
    q({
      id: `q-${i}`,
      dimension: "d",
      correct: "a",
      options: [
        { id: "a", text: correcta },
        ...otras.map((t, j) => ({ id: `x${j}`, text: t })),
      ],
    });

  it("detecta un banco donde la correcta siempre se desarrolla más", () => {
    const qs = Array.from({ length: 25 }, (_, i) =>
      par("Una explicación desarrollada que justifica por qué esta es la buena", ["Corta", "Otra"], i),
    );
    const sesgo = lengthBias(qs)!;
    expect(sesgo.share).toBe(1);
    expect(sesgo.ratio).toBeGreaterThan(2);
  });

  it("no dispara si las opciones miden parecido", () => {
    const qs = Array.from({ length: 25 }, (_, i) =>
      par("Texto de longitud parecida al resto", ["Texto de longitud parecida a los demás", "Otro texto parecido en tamaño total"], i),
    );
    expect(lengthBias(qs)).toBeNull();
  });

  it("no opina con muestra pequeña", () => {
    expect(lengthBias([par("Larguísima y desarrollada sin ninguna duda", ["No"], 0)])).toBeNull();
  });

  it("llega al informe como aviso, no como error", () => {
    const qs = Array.from({ length: 25 }, (_, i) =>
      par("Una explicación desarrollada que justifica por qué esta es la buena", ["Corta", "Otra"], i),
    );
    const rep = auditPack(pack(qs));
    expect(rep.warnings.find((w) => w.code === "sesgo-longitud")).toBeDefined();
    expect(rep.errors).toEqual([]);
  });
});
