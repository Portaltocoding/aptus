import { describe, expect, it } from "vitest";
import type { Question } from "../content/schema.js";
import {
  BACK,
  answerDefault,
  answeredCount,
  backAvailable,
  confidenceDefault,
  currentQuestion,
  exitWarning,
  flowResult,
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
const confirma = (salir: boolean): FlowInput => ({ tipo: "confirmacion", salir });

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
    expect(flowResult(state)).toEqual([]);
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
    expect(flowResult(state)![0]).toEqual({
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
    expect(flowResult(state)![0]!.selectedOptionId).toBeNull();
  });

  it("declarar la confianza registra respuesta + confianza y avanza", () => {
    const state = play(initialFlow(makeBank(2)), responde("c"), confia("alta"));

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(1);
    expect(state.pendiente).toBeNull();
    expect(flowResult(state)![0]).toEqual({
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

describe("ESC en la pregunta y abandono", () => {
  it("ESC pide confirmación, no abandona de golpe", () => {
    const state = play(initialFlow(makeBank(3)), responde("a"), confia("alta"), escape);

    expect(state.step).toBe("confirmar-salida");
    expect(isFinished(state)).toBe(false);
    expect(answeredCount(state)).toBe(1); // nada perdido todavía
  });

  it("decir que NO devuelve a la misma pregunta con todo intacto", () => {
    const state = play(
      initialFlow(makeBank(3)),
      responde("a"),
      confia("alta"),
      escape,
      confirma(false),
    );

    expect(state.step).toBe("pregunta");
    expect(state.session.index).toBe(1);
    expect(answeredCount(state)).toBe(1);
  });

  it("decir que SÍ abandona y el resultado es null: no se guarda nada", () => {
    const state = play(
      initialFlow(makeBank(3)),
      responde("a"),
      confia("alta"),
      escape,
      confirma(true),
    );

    expect(state.step).toBe("abandonada");
    expect(isFinished(state)).toBe(true);
    expect(flowResult(state)).toBeNull();
  });

  it("una sesión terminada no se puede abandonar a posteriori", () => {
    const terminada = play(initialFlow(makeBank(1)), responde("a"), confia("alta"));
    const despues = play(terminada, escape, confirma(true));

    expect(despues.step).toBe("terminada");
    expect(flowResult(despues)).not.toBeNull();
  });

  it("una sesión abandonada ignora cualquier entrada posterior", () => {
    const abandonada = play(initialFlow(makeBank(2)), escape, confirma(true));

    expect(play(abandonada, responde("a"), confia("alta")).step).toBe("abandonada");
  });
});

describe("exitWarning", () => {
  it("sin respuestas no habla de pérdidas: no hay ninguna", () => {
    expect(exitWarning(0)).toBe("¿Salir de la sesión?");
  });

  it("con una respuesta habla en singular", () => {
    expect(exitWarning(1)).toMatch(/Se pierde la respuesta/);
  });

  it("con varias dice cuántas se pierden", () => {
    expect(exitWarning(7)).toMatch(/Se pierden las 7 respuestas/);
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

    expect(flowResult(state)).toEqual([
      { questionId: "q1", selectedOptionId: "a", confidence: "alta" },
      { questionId: "q2", selectedOptionId: "b", confidence: "media" },
      { questionId: "q3", selectedOptionId: "c", confidence: "baja" },
    ]);
  });
});
