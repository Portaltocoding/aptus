import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "../core/scoring.js";
import {
  BACK,
  answerDefault,
  answeredCount,
  backAvailable,
  confidenceDefault,
  currentQuestion,
  exitChoices,
  exitWarning,
  flowOutcome,
  initialFlow,
  isFinished,
  questionChoiceValues,
  stepFlow,
  type FlowInput,
  type FlowState,
} from "./session-flow.js";

function makeQuestion(id: string): Question {
  return {
    id,
    dimension: "dim-uno",
    difficulty: "easy",
    type: "concepto",
    roles: [],
    stem: `Pregunta de prueba ${id}`,
    options: [
      { id: "a", text: "Opción A" },
      { id: "b", text: "Opción B" },
      { id: "c", text: "Opción C" },
    ],
    correct: "a",
    explanation: "Explicación de prueba.",
    source: "fixture",
    date: "2026-01-01",
  };
}

function makeBank(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => makeQuestion(`q${i + 1}`));
}

/** Aplica una secuencia de entradas, como haría el runner con sus prompts. */
function play(state: FlowState, ...inputs: FlowInput[]): FlowState {
  return inputs.reduce(stepFlow, state);
}

const responde = (optionId: string): FlowInput => ({ tipo: "respuesta", optionId });
const volver: FlowInput = { tipo: "volver" };
const escape: FlowInput = { tipo: "escape" };
const confia = (valor: "alta" | "media" | "baja"): FlowInput => ({ tipo: "confianza", valor });
const sale = (eleccion: "seguir" | "terminar" | "pausar" | "descartar"): FlowInput => ({
  tipo: "salida",
  eleccion,
});

/** Las respuestas de una sesión, como las devolvía el viejo `flowResult`. */
function respuestas(state: FlowState): AnsweredQuestion[] | null {
  const outcome = flowOutcome(state);
  return outcome.tipo === "abandonada" || outcome.tipo === "pausada" ? null : outcome.answered;
}

describe("initialFlow", () => {
  it("arranca en la primera pregunta, sin nada respondido", () => {
    const state = initialFlow(makeBank(3));

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(0);
    expect(state.pendiente).toBeNull();
    expect(answeredCount(state)).toBe(0);
    expect(isFinished(state)).toBe(false);
  });

  it("un banco vacío nace terminado: no se abre un prompt sobre la nada", () => {
    const state = initialFlow([]);

    expect(state.step).toBe("terminada");
    expect(isFinished(state)).toBe(true);
    expect(currentQuestion(state)).toBeNull();
    expect(respuestas(state)).toEqual([]);
  });
});

describe("◀ Volver", () => {
  it("NO se ofrece en la primera pregunta: no hay adónde volver", () => {
    const state = initialFlow(makeBank(3));

    expect(backAvailable(state)).toBe(false);
    expect(questionChoiceValues(state)).toEqual(["a", "b", "c"]);
  });

  it("se ofrece en cuanto se ha avanzado, y va la última", () => {
    const state = play(initialFlow(makeBank(3)), responde("a"), confia("alta"));

    expect(backAvailable(state)).toBe(true);
    expect(questionChoiceValues(state)).toEqual(["a", "b", "c", BACK]);
  });

  it("retrocede el índice sin borrar lo ya respondido", () => {
    const state = play(initialFlow(makeBank(3)), responde("b"), confia("media"), volver);

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(0);
    expect(answeredCount(state)).toBe(1);
    expect(answerDefault(state)).toBe("b");
    expect(confidenceDefault(state)).toBe("media");
  });

  it("volver desde la primera pregunta no rompe: se queda donde está", () => {
    const state = play(initialFlow(makeBank(3)), volver, volver);

    expect(state.session.index).toBe(0);
    expect(state.step).toBe("pregunta");
  });

  it("el orden de las opciones no cambia al volver atrás: no se rebaraja", () => {
    const inicio = initialFlow(makeBank(2));
    const primera = questionChoiceValues(inicio);
    const devuelta = play(inicio, responde("a"), confia("alta"), volver);

    expect(questionChoiceValues(devuelta)).toEqual(primera); // en el índice 0 tampoco reaparece BACK
  });

  it("volviendo a una pregunta intermedia el orden es el mismo más ◀ Volver", () => {
    const inicio = initialFlow(makeBank(3));
    const enSegunda = play(inicio, responde("a"), confia("alta"));
    const opciones = questionChoiceValues(enSegunda);
    const devuelta = play(enSegunda, responde("b"), confia("alta"), volver);

    expect(opciones).toEqual(["a", "b", "c", BACK]);
    expect(questionChoiceValues(devuelta)).toEqual(opciones);
  });

  it("responder distinto tras volver SOBRESCRIBE, no duplica", () => {
    const state = play(
      initialFlow(makeBank(2)),
      responde("a"),
      confia("alta"),
      volver,
      responde("c"),
      confia("baja"),
    );

    expect(answeredCount(state)).toBe(1);
    expect(respuestas(state)![0]).toEqual({
      questionId: "q1",
      selectedOptionId: "c",
      confidence: "baja",
    });
  });
});

describe("confianza", () => {
  it("elegir respuesta lleva a la confianza SIN registrar todavía", () => {
    const state = play(initialFlow(makeBank(2)), responde("b"));

    expect(state.step).toBe("confianza");
    expect(state.pendiente).toBe("b");
    expect(answeredCount(state)).toBe(0); // aún no hay nada registrado
  });

  it("ESC en la confianza vuelve a la pregunta SIN registrar la respuesta", () => {
    const state = play(initialFlow(makeBank(2)), responde("b"), escape);

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(0); // misma pregunta
    expect(state.pendiente).toBeNull();
    expect(answeredCount(state)).toBe(0);
    expect(answerDefault(state)).toBeUndefined();
    expect(respuestas(state)![0]!.selectedOptionId).toBeNull();
  });

  it("declarar la confianza registra respuesta + confianza y avanza", () => {
    const state = play(initialFlow(makeBank(2)), responde("c"), confia("alta"));

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(1);
    expect(state.pendiente).toBeNull();
    expect(respuestas(state)![0]).toEqual({
      questionId: "q1",
      selectedOptionId: "c",
      confidence: "alta",
    });
  });

  it("la última respuesta cierra la sesión", () => {
    const state = play(initialFlow(makeBank(1)), responde("a"), confia("media"));

    expect(state.step).toBe("terminada");
    expect(isFinished(state)).toBe(true);
  });
});

describe("ESC en la pregunta: el menú de salida", () => {
  it("ESC abre el menú, no abandona de golpe", () => {
    const state = play(initialFlow(makeBank(3)), responde("a"), confia("alta"), escape);

    expect(state.step).toBe("salida");
    expect(isFinished(state)).toBe(false);
    expect(answeredCount(state)).toBe(1); // nada perdido todavía
  });

  it("seguir devuelve a la misma pregunta con todo intacto", () => {
    const state = play(
      initialFlow(makeBank(3)),
      responde("a"),
      confia("alta"),
      escape,
      sale("seguir"),
    );

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(1);
    expect(answeredCount(state)).toBe(1);
  });

  it("descartar abandona y el resultado es null: no se guarda nada", () => {
    const state = play(
      initialFlow(makeBank(3)),
      responde("a"),
      confia("alta"),
      escape,
      sale("descartar"),
    );

    expect(state.step).toBe("abandonada");
    expect(isFinished(state)).toBe(true);
    expect(flowOutcome(state)).toEqual({ tipo: "abandonada" });
  });

  it("una sesión terminada no se puede abandonar a posteriori", () => {
    const terminada = play(initialFlow(makeBank(1)), responde("a"), confia("alta"));
    const despues = play(terminada, escape, sale("descartar"));

    expect(despues.step).toBe("terminada");
    expect(respuestas(despues)).not.toBeNull();
  });

  it("una sesión abandonada ignora cualquier entrada posterior", () => {
    const abandonada = play(initialFlow(makeBank(2)), escape, sale("descartar"));

    expect(play(abandonada, responde("a"), confia("alta")).step).toBe("abandonada");
  });
});

describe("terminar en la pregunta que sea", () => {
  it("evalúa SOLO lo respondido: las que no se vieron no cuentan como presentadas", () => {
    const state = play(
      initialFlow(makeBank(30)),
      responde("a"),
      confia("alta"),
      responde("b"),
      confia("media"),
      escape,
      sale("terminar"),
    );

    expect(state.step).toBe("parcial");
    expect(isFinished(state)).toBe(true);

    const outcome = flowOutcome(state);
    expect(outcome.tipo).toBe("parcial");
    if (outcome.tipo !== "parcial") throw new Error("debería ser parcial");
    expect(outcome.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(outcome.answered).toEqual([
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" },
      { questionId: "q2", selectedOptionId: "b", confidence: "media" },
    ]);
  });

  it("da igual en qué pregunta se corte: la 10 o la 30 se tratan igual", () => {
    const hasta = (n: number): FlowInput[] =>
      Array.from({ length: n }, (_, i) => [responde("a"), confia("alta")][i % 2]!).flat();

    for (const corte of [10, 30]) {
      const state = play(initialFlow(makeBank(40)), ...hasta(corte * 2), escape, sale("terminar"));
      const outcome = flowOutcome(state);

      expect(outcome.tipo).toBe("parcial");
      if (outcome.tipo !== "parcial") throw new Error("debería ser parcial");
      expect(outcome.questions).toHaveLength(corte);
      expect(outcome.answered).toHaveLength(corte);
    }
  });

  it("terminar SIN nada respondido no inventa una sesión vacía: es un abandono", () => {
    const state = play(initialFlow(makeBank(5)), escape, sale("terminar"));

    expect(state.step).toBe("abandonada");
    expect(flowOutcome(state)).toEqual({ tipo: "abandonada" });
  });
});

describe("pausar y reanudar", () => {
  it("pausar deja una foto con dónde vas y qué llevas respondido", () => {
    const state = play(
      initialFlow(makeBank(5)),
      responde("a"),
      confia("alta"),
      responde("c"),
      confia("baja"),
      escape,
      sale("pausar"),
    );

    expect(state.step).toBe("pausada");
    const outcome = flowOutcome(state);
    if (outcome.tipo !== "pausada") throw new Error("debería ser pausada");

    expect(outcome.snapshot.index).toBe(2);
    expect(outcome.snapshot.answers).toEqual([
      ["q1", "a"],
      ["q2", "c"],
    ]);
    expect(outcome.snapshot.confidences).toEqual([
      ["q1", "alta"],
      ["q2", "baja"],
    ]);
    // El orden en que se enseñaron las opciones viaja con la foto: sin él, al
    // reanudar la respuesta ya dada aparecería en otra posición.
    expect(outcome.snapshot.questions[0]).toEqual({ id: "q1", options: ["a", "b", "c"] });
  });

  it("reanudar sigue donde se dejó, con las respuestas puestas", () => {
    const pausada = play(
      initialFlow(makeBank(5)),
      responde("a"),
      confia("alta"),
      responde("c"),
      confia("baja"),
      escape,
      sale("pausar"),
    );
    const outcome = flowOutcome(pausada);
    if (outcome.tipo !== "pausada") throw new Error("debería ser pausada");

    const retomada = initialFlow(makeBank(5), outcome.snapshot);

    expect(retomada.step).toBe("pregunta");
    expect(retomada.session.index).toBe(2);
    expect(answeredCount(retomada)).toBe(2);
    expect(currentQuestion(retomada)!.id).toBe("q3");
    expect(backAvailable(retomada)).toBe(true);
  });

  it("reanudar y terminar la sesión entera da el mismo resultado que no haber parado", () => {
    const deUnTiron = play(
      initialFlow(makeBank(2)),
      responde("a"),
      confia("alta"),
      responde("b"),
      confia("media"),
    );

    const pausada = play(initialFlow(makeBank(2)), responde("a"), confia("alta"), escape, sale("pausar"));
    const foto = flowOutcome(pausada);
    if (foto.tipo !== "pausada") throw new Error("debería ser pausada");
    const retomada = play(initialFlow(makeBank(2), foto.snapshot), responde("b"), confia("media"));

    expect(retomada.step).toBe("terminada");
    expect(respuestas(retomada)).toEqual(respuestas(deUnTiron));
  });

  it("una pausa en la última pregunta se reanuda ya terminada, no fuera de rango", () => {
    const casiEntera = play(initialFlow(makeBank(1)), responde("a"), confia("alta"));
    const foto = flowOutcome(casiEntera);
    if (foto.tipo !== "completada") throw new Error("debería estar completada");

    const retomada = initialFlow(makeBank(1), {
      index: 1,
      questions: [{ id: "q1", options: ["a", "b", "c"] }],
      answers: [["q1", "a"]],
      confidences: [["q1", "alta"]],
    });

    expect(retomada.step).toBe("terminada");
    expect(isFinished(retomada)).toBe(true);
  });
});

describe("exitChoices", () => {
  it("sin nada respondido solo se puede seguir o salir: no hay nada que evaluar ni que guardar", () => {
    expect(exitChoices(0, true).map((c) => c.value)).toEqual(["seguir", "descartar"]);
  });

  it("con respuestas se ofrece terminar y evaluar, y pausar", () => {
    expect(exitChoices(12, true).map((c) => c.value)).toEqual([
      "seguir",
      "terminar",
      "pausar",
      "descartar",
    ]);
  });

  it("lo que no se puede pausar no lo ofrece (un repaso no se retoma)", () => {
    expect(exitChoices(12, false).map((c) => c.value)).toEqual(["seguir", "terminar", "descartar"]);
  });

  it("terminar dice cuántas se van a puntuar: decidir a ciegas no es decidir", () => {
    expect(exitChoices(1, true).find((c) => c.value === "terminar")!.description).toMatch(
      /la respuesta que llevas/,
    );
    expect(exitChoices(30, true).find((c) => c.value === "terminar")!.description).toMatch(
      /las 30 que llevas/,
    );
  });
});

describe("exitWarning", () => {
  it("sin respuestas no habla de lo que llevas: no llevas nada", () => {
    expect(exitWarning(0)).toMatch(/Todavía no has respondido nada/);
  });

  it("con una respuesta habla en singular", () => {
    expect(exitWarning(1)).toMatch(/Llevas 1 respuesta\./);
  });

  it("con varias dice cuántas llevas: es lo que está en juego", () => {
    expect(exitWarning(7)).toMatch(/Llevas 7 respuestas/);
  });
});

describe("entradas que no corresponden a la pantalla", () => {
  it("una confianza en la pantalla de pregunta se ignora", () => {
    const state = initialFlow(makeBank(2));

    expect(play(state, confia("alta"))).toEqual(state);
  });

  it("un 'volver' en la pantalla de confianza se ignora", () => {
    const state = play(initialFlow(makeBank(2)), responde("a"));

    expect(play(state, volver)).toEqual(state);
  });

  it("una respuesta en la confirmación de salida se ignora", () => {
    const state = play(initialFlow(makeBank(2)), escape);

    expect(play(state, responde("b"))).toEqual(state);
  });
});

describe("resultado completo", () => {
  it("devuelve todas las preguntas en orden, con null en las no respondidas", () => {
    // Se responde la 1, se avanza, y se abandona... no: se completa saltando ninguna.
    const state = play(
      initialFlow(makeBank(3)),
      responde("a"),
      confia("alta"),
      responde("b"),
      confia("media"),
      responde("c"),
      confia("baja"),
    );

    expect(respuestas(state)).toEqual([
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" },
      { questionId: "q2", selectedOptionId: "b", confidence: "media" },
      { questionId: "q3", selectedOptionId: "c", confidence: "baja" },
    ]);
  });
});
