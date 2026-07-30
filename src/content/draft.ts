import Anthropic from "@anthropic-ai/sdk";
import { QuestionSchema, type Question } from "./schema.js";

/**
 * Borrador de preguntas con LLM. Es la ÚNICA pieza de aptus que sale a la red, y
 * está deliberadamente aislada aquí: ni el motor ni el CLI dependen de ella, y
 * todo lo demás sigue funcionando sin API key.
 *
 * Por qué el resultado se llama BORRADOR y no pack: el argumento entero de aptus
 * es que no te miente sobre lo que sabes. Una pregunta generada y no revisada te
 * mide contra una respuesta que quizá está mal, y eso no lo arregla ningún test.
 * Por eso esto escribe en `drafts/` —fuera de donde el loader mira— y hace falta
 * un paso explícito para promoverlo. El LLM propone; la revisión sigue siendo tuya.
 */

const MODEL = "claude-opus-5";

/** Schema de salida: el mismo contrato que exige el pack, en JSON Schema. */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          dimension: { type: "string" },
          subtopic: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard", "experto"] },
          type: { type: "string", enum: ["concepto", "diagrama", "codigo", "escenario"] },
          roles: { type: "array", items: { type: "string" } },
          stem: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, text: { type: "string" } },
              required: ["id", "text"],
              additionalProperties: false,
            },
          },
          correct: { type: "string" },
          explanation: { type: "string" },
          source: { type: "string" },
          date: { type: "string" },
        },
        required: [
          "id",
          "dimension",
          "subtopic",
          "difficulty",
          "type",
          "roles",
          "stem",
          "options",
          "correct",
          "explanation",
          "source",
          "date",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const SYSTEM = `Eres un curador de bancos de preguntas de evaluación técnica. Escribes en castellano.

REGLA INNEGOCIABLE: curadas, no relleno. Cada pregunta debe ser técnicamente
correcta y su respuesta marcada, verdadera. Si no estás seguro de una respuesta,
NO incluyas esa pregunta: devuelve menos preguntas. Un banco corto y correcto vale
más que uno grande y mentiroso — quien lo use va a creerse el resultado.

Reglas de calidad:
- 4 opciones. Los distractores deben ser PLAUSIBLES: errores que alguien comete de
  verdad, no rellenos absurdos que se descartan sin saber del tema.
- La respuesta correcta NO siempre en la misma posición: repártelas entre a, b, c y d.
- Reparte los tramos de dificultad e incluye siempre alguna 'experto' (nivel staff).
- Varía el 'type': concepto, escenario (caso práctico), codigo (snippet con un fallo
  real), diagrama (ASCII en el enunciado).
- 'explanation' explica POR QUÉ la correcta lo es, y por qué las otras no.
- 'source' cita de dónde sale: el fichero del material, o 'externa' si es
  conocimiento canónico del campo que no está en el material.
- No dupliques conceptos entre preguntas.`;

export interface DraftRequest {
  dimension: string;
  /** Cuántas pedir. El modelo puede devolver menos: eso es correcto, no un fallo. */
  count: number;
  /** El brief del pack, si lo hay: qué se quiere cubrir. */
  brief: string | null;
  /** Material de referencia (recortado por la capa de composición). */
  material: string;
  /** Preguntas ya existentes en el pack, para no repetir. */
  existingStems: readonly string[];
  today: string;
}

export interface DraftResult {
  /** Preguntas que pasan el MISMO schema que exige un pack real. */
  valid: Question[];
  /** Las que no lo pasan, con el motivo. Se reportan: nunca se tiran en silencio. */
  rejected: { id: string; reason: string }[];
}

/**
 * Investiga un tema en la web y devuelve un resumen que sirva de material.
 *
 * Va en una llamada APARTE de la que escribe las preguntas, y no por capricho: la
 * búsqueda web puede pausar el turno (`pause_turn`) y encadenar varias rondas, y
 * mezclarla con la salida estructurada del borrador convierte un fallo de red en
 * un JSON a medias. Así, si la investigación sale mal, se sabe aquí y el borrador
 * ni se intenta.
 *
 * Lo que devuelve NO es una fuente auditada: es lo que el modelo ha encontrado.
 * Por eso baja a `sources/` como material citable y no directamente a preguntas.
 */
export async function researchTopic(dimension: string, context: string | null): Promise<string> {
  const client = new Anthropic();

  const encargo =
    `Investiga en la web el tema '${dimension}' para construir un banco de preguntas de evaluación técnica.\n\n` +
    (context !== null ? `Contexto de para qué es:\n${context}\n\n` : "") +
    "Devuelve un informe en castellano con:\n" +
    "- Los subtemas que un profesional debe dominar, de fundamentos a nivel experto.\n" +
    "- Los conceptos exactos, con su definición precisa (lo que se puede preguntar).\n" +
    "- Los errores y malentendidos frecuentes (sirven de distractores plausibles).\n" +
    "- Qué distingue a alguien senior de alguien junior en este tema.\n\n" +
    "Cita las fuentes. Si algo no lo has podido verificar, dilo en vez de rellenarlo.";

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: encargo }];

  // La búsqueda web corre en el servidor y puede agotar su presupuesto de rondas
  // devolviendo `pause_turn`: se reenvía la conversación para que siga donde iba.
  // El tope evita que un tema muy abierto se convierta en un bucle caro.
  for (let intento = 0; intento < 5; intento += 1) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new Error("El modelo ha rechazado investigar ese tema.");
    }

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  throw new Error("La investigación no ha terminado tras varias rondas de búsqueda; se deja aquí.");
}

function buildPrompt(req: DraftRequest): string {
  const partes = [
    `Escribe hasta ${req.count} preguntas de evaluación para la dimensión '${req.dimension}'.`,
    "",
    `Usa el prefijo '${req.dimension.slice(0, 3)}-borrador-' + número para los ids.`,
    `Pon '${req.today}' como 'date' y '${req.dimension}' como 'dimension'.`,
  ];

  if (req.brief !== null) {
    partes.push("", "=== BRIEF DEL PACK (qué hay que cubrir) ===", req.brief);
  }

  if (req.material.trim().length > 0) {
    partes.push(
      "",
      "=== MATERIAL DE REFERENCIA ===",
      "Ancla las preguntas a este material siempre que puedas, y cítalo en 'source'.",
      req.material,
    );
  } else {
    partes.push(
      "",
      "(No hay material: usa conocimiento canónico del campo y pon 'externa' en 'source'.)",
    );
  }

  if (req.existingStems.length > 0) {
    partes.push(
      "",
      "=== YA PREGUNTADO (no lo repitas, ni reformulado) ===",
      req.existingStems.map((s) => `- ${s}`).join("\n"),
    );
  }

  return partes.join("\n");
}

/**
 * Pide el borrador y valida CADA pregunta contra `QuestionSchema` — el mismo
 * validador que usa el loader con un pack real. Lo que no pasa se descarta y se
 * reporta: el modelo no tiene un pase especial para saltarse el contrato.
 *
 * Se usa streaming porque `max_tokens` alto en no-streaming se come el timeout HTTP.
 */
export async function draftQuestions(req: DraftRequest): Promise<DraftResult> {
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: buildPrompt(req) }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("El modelo ha rechazado la petición; no hay borrador que escribir.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseDraft(text);
}

/**
 * Valida lo que ha devuelto el modelo contra `QuestionSchema` — el MISMO validador
 * que el loader aplica a un pack real. El modelo no tiene un contrato más laxo que
 * una pregunta escrita a mano.
 *
 * Está separado de la llamada a la API a propósito: es la parte que puede fallar de
 * formas interesantes (JSON roto, campos que faltan, `correct` apuntando a una
 * opción que no existe) y así se testea entera sin salir a la red.
 */
export function parseDraft(text: string): DraftResult {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("La respuesta del modelo no es JSON válido; no se escribe nada.");
  }

  const raw = (payload as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) {
    throw new Error("La respuesta del modelo no trae ninguna lista de preguntas.");
  }

  const valid: Question[] = [];
  const rejected: DraftResult["rejected"] = [];

  for (const [i, item] of raw.entries()) {
    const parsed = QuestionSchema.safeParse(item);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      const id =
        typeof (item as { id?: unknown }).id === "string"
          ? (item as { id: string }).id
          : `#${i + 1}`;
      rejected.push({ id, reason: parsed.error.issues.map((x) => x.message).join("; ") });
    }
  }

  return { valid, rejected };
}
