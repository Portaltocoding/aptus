import { z } from "zod";

const OptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const QuestionSchema = z
  .object({
    id: z.string(),
    dimension: z.string(), // sin enum hardcodeado: el pack declara sus dimensiones (ENG-04)
    subtopic: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
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
