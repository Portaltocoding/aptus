import { select } from "@inquirer/prompts";
import pc from "picocolors";
import { filterByDimension, type MistakeReview } from "../core/mistakes.js";
import { renderMistakes } from "./render-mistakes.js";
import { ESCAPED, ESC_HINT, withEscape } from "./keys.js";
import { heading, promptTheme } from "./theme.js";

/**
 * El repaso se OFRECE, no se vuelca. Sesenta preguntas falladas de golpe al
 * terminar un test es un muro que nadie lee, y el que lo intenta abandona a la
 * tercera. Se pregunta, y se puede acotar a una dimensión.
 *
 * Sale con ESC como el resto del CLI, y se puede volver a elegir otra dimensión
 * sin repetir el test: leer los fallos de una dimensión y querer los de la
 * siguiente es el caso normal, no la excepción.
 */

/** Cuántas se consideran "muchas de golpe" y merecen que se sugiera acotar. */
const MUCHAS = 15;

export async function offerMistakes(review: MistakeReview): Promise<void> {
  if (review.reviewable === 0) {
    // Silencio aquí sería raro: el que acaba de fallar cero quiere leerlo.
    console.log(renderMistakes(review) + "\n");
    return;
  }

  // Sin terminal no hay nada que preguntar (pipes, CI, scripts). Se dice dónde
  // está en vez de volcar cientos de líneas en la salida de alguien que no las pidió.
  if (process.stdin.isTTY !== true) {
    console.log(
      pc.dim(
        `  · ${review.reviewable} pregunta(s) para repasar. Con terminal, aptus te las enseña\n` +
          "    con su explicación al terminar la sesión.\n",
      ),
    );
    return;
  }

  for (;;) {
    const dims = review.byDimension;
    const desglose =
      review.unanswered > 0
        ? `${review.wrong} fallada(s) y ${review.unanswered} sin responder de ${review.presented}`
        : `${review.wrong} fallada(s) de ${review.presented}`;

    const opciones = [
      {
        value: "todo",
        name: `Ver las ${review.reviewable}, con su explicación`,
        description:
          review.reviewable > MUCHAS
            ? "son unas cuantas de una sentada: quizá te cunda más por dimensión"
            : "agrupadas por dimensión",
      },
      ...(dims.length > 1
        ? [
            {
              value: "dimension",
              name: "Solo una dimensión",
              description: "empieza por donde más te duele",
            },
          ]
        : []),
      {
        value: "salir",
        name: "Ahora no",
        description: "el historial las guarda: puedes verlas luego",
      },
    ];

    // El desglose va en su propia línea y NO dentro del `message`: inquirer no
    // sabe partir por palabras y con el mensaje largo dejaba un "vuelve a/trás"
    // roto a mitad en un terminal de 72.
    console.log(pc.dim(`  ${desglose}.`));

    const que = await withEscape((signal) =>
      select<string>(
        {
          message: pc.bold(`  ¿Repasamos los fallos?`) + pc.dim(`  (${ESC_HINT})`),
          choices: opciones,
          theme: promptTheme,
        },
        { signal },
      ),
    );
    if (que === ESCAPED || que === "salir") return;

    if (que === "todo") {
      console.log("\n" + renderMistakes(review) + "\n");
      return;
    }

    const dim = await withEscape((signal) =>
      select<string>(
        {
          message: pc.bold("  ¿Qué dimensión?") + pc.dim(`  (${ESC_HINT})`),
          choices: dims.map((g) => ({
            value: g.dimension,
            // El N por dimensión va en el propio menú: elegir a ciegas entre
            // "dimensión A" y "dimensión B" no es elegir.
            name: `${g.dimension} — ${g.questions.length} para repasar`,
            description:
              g.unanswered > 0
                ? `${g.wrong} fallada(s) · ${g.unanswered} sin responder · de ${g.presented} presentada(s)`
                : `${g.wrong} fallada(s) de ${g.presented} presentada(s)`,
          })),
          theme: promptTheme,
          pageSize: 12,
        },
        { signal },
      ),
    );
    // ESC aquí vuelve al menú anterior, no se sale del repaso: es lo que hace ESC
    // en el resto del CLI.
    if (dim === ESCAPED) continue;

    console.log("\n" + renderMistakes(filterByDimension(review, dim)) + "\n");

    const seguir = await withEscape((signal) =>
      select<string>(
        {
          message: pc.bold("  ¿Otra dimensión?") + pc.dim(`  (${ESC_HINT})`),
          choices: [
            { value: "no", name: "No, ya está" },
            { value: "si", name: "Sí, elegir otra" },
          ],
          theme: promptTheme,
        },
        { signal },
      ),
    );
    if (seguir !== "si") return;
  }
}

/** Cabecera de la pantalla de repaso, para que no se confunda con los resultados. */
export function mistakesHeading(): string {
  return "\n" + heading("Repaso de fallos");
}
