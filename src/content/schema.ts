import { z } from "zod";

const OptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  /**
   * Apunte de ESTA opción, que se enseña al poner el cursor encima durante la
   * sesión. Argumenta a favor de la opción ("reducir el modelo abarata porque sus
   * tokens cuestan menos") o la desarrolla con el detalle/diagrama que no cabe en
   * una línea de lista.
   *
   * OPCIONAL a propósito, y por dos motivos. Uno: los packs escritos antes de que
   * existiera el campo siguen cargando igual. Dos: NO es la `explanation` de la
   * pregunta —esa dice cuál es la correcta y por qué, y enseñarla antes de
   * responder convertiría el test en una lectura—. Un apunte de opción argumenta
   * como argumentaría quien la eligiera, tanto en la correcta como en los
   * distractores; si delata cuál es la buena, sobra.
   *
   * Un texto con saltos de línea se enseña VERBATIM (diagramas, snippets); uno de
   * un solo párrafo se ajusta al ancho del terminal.
   */
  rationale: z.string().optional(),
});

export const QuestionSchema = z
  .object({
    id: z.string(),
    dimension: z.string(), // sin enum hardcodeado: el pack declara sus dimensiones (ENG-04)
    subtopic: z.string().optional(),
    // 4 tramos para distinguir seniority hasta staff: experto es el más profundo.
    difficulty: z.enum(["easy", "medium", "hard", "experto"]),
    // Formato de la pregunta (para variar y renderizar): concepto (por defecto),
    // diagrama (ASCII en el enunciado), codigo (snippet), escenario (caso práctico).
    type: z.enum(["concepto", "diagrama", "codigo", "escenario"]).default("concepto"),
    roles: z.array(z.string()).default([]),
    stem: z.string(),
    options: z.array(OptionSchema).min(2),
    correct: z.union([z.string(), z.array(z.string())]),
    explanation: z.string(),
    source: z.string(),
    date: z.string(),
  })
  .superRefine((q, ctx) => {
    const ids = new Set(q.options.map((o) => o.id));
    const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
    for (const cid of correctIds) {
      if (!ids.has(cid)) {
        ctx.addIssue({
          code: "custom",
          message: `correct='${cid}' no referencia ningún option.id de la pregunta '${q.id}'`,
          path: ["correct"],
        });
      }
    }
  });

export const PackSchema = z.object({
  name: z.string(),
  version: z.string(),
  dimensions: z.array(z.string()),
  questions: z.array(QuestionSchema).min(1),
});

export type Question = z.infer<typeof QuestionSchema>;
export type Pack = z.infer<typeof PackSchema>;
