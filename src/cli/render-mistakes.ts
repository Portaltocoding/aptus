import pc from "picocolors";
import { DIFFICULTY_LABEL, difficultyColor, heading, termWidth, wrap } from "./theme.js";
import type { MistakeReview, ReviewedQuestion } from "../core/mistakes.js";

/**
 * Render del repaso de fallos. Aquí NO hay tabla a propósito: lo que manda es
 * texto largo — enunciado y explicación curada —, y una celda de tabla lo parte
 * en tiras de veinte caracteres que nadie lee. Un bloque por pregunta, con la
 * misma jerarquía visual que el resto del CLI: enunciado en negrita, lo tuyo en
 * rojo, lo correcto en verde, la explicación en tenue.
 *
 * Solo presenta: qué entra en el repaso y en qué orden lo decide
 * `core/mistakes.ts`. Y no aparece ni un porcentaje — se cuentan preguntas, con
 * su total presentado siempre al lado (RES-01).
 */

/** Sangría de todo lo que cuelga de un enunciado. */
const SANGRIA = "     ";

// `wrap` vive ahora en `./theme.js` (lo usan también el enunciado y el apunte de
// opción de la sesión en vivo). Se reexporta desde aquí porque este era su sitio
// original y quien lo importaba no tiene por qué enterarse de la mudanza.
export { wrap };

/** Un trozo de línea con su color. Ver `wrapSegments`. */
interface Segmento {
  texto: string;
  color?: (s: string) => string;
}

/**
 * Como `wrap`, pero para una línea hecha de trozos de distinto color.
 *
 * Existe porque colorear y LUEGO medir no funciona: los códigos ANSI cuentan como
 * caracteres y una línea de 40 visibles mide 60, así que el ajuste al ancho sale
 * mal justo en los terminales estrechos donde importa. Aquí se mide por el texto
 * pelado y se pinta cada palabra al emitirla.
 */
export function wrapSegments(segmentos: Segmento[], width: number, indent = ""): string[] {
  const hueco = Math.max(8, width - indent.length);

  const palabras = segmentos.flatMap((s) =>
    s.texto
      .split(/\s+/)
      .filter((p) => p.length > 0)
      .map((texto) => ({ texto, color: s.color })),
  );

  const lineas: string[] = [];
  let plano = "";
  let pintado = "";
  const cerrar = (): void => {
    if (plano.length > 0) lineas.push(indent + pintado);
    plano = "";
    pintado = "";
  };

  for (const p of palabras) {
    const conColor = p.color ? p.color(p.texto) : p.texto;
    if (plano.length === 0) {
      plano = p.texto;
      pintado = conColor;
    } else if (plano.length + 1 + p.texto.length <= hueco) {
      plano += " " + p.texto;
      pintado += " " + conColor;
    } else {
      cerrar();
      plano = p.texto;
      pintado = conColor;
    }
  }
  cerrar();

  return lineas;
}

/** Intercala el separador tenue ` · ` que usa el resto del CLI entre segmentos. */
function separadas(segmentos: Segmento[]): Segmento[] {
  return segmentos.flatMap((s, i) => (i === 0 ? [s] : [{ texto: "·", color: pc.dim }, s]));
}

/**
 * El enunciado. Un `diagrama` o un `codigo` se indenta VERBATIM: reflowearlos al
 * ancho del terminal convierte el ASCII en ruido y el snippet en algo que no
 * compila. Lo demás sí se ajusta al ancho real.
 */
function stemLines(q: ReviewedQuestion, width: number, indent: string): string[] {
  if (q.type === "diagrama" || q.type === "codigo") {
    return q.stem.split("\n").map((l) => indent + l);
  }
  return wrap(q.stem, width, indent);
}

/** Un bloque por pregunta: de qué iba, qué pusiste, qué era y por qué. */
function bloque(q: ReviewedQuestion, n: number, width: number): string {
  const etiquetas: Segmento[] = (
    [
      q.subtopic ? { texto: q.subtopic, color: pc.cyan } : null,
      { texto: DIFFICULTY_LABEL[q.difficulty], color: difficultyColor(q.difficulty) },
      q.outcome === "fallada"
        ? { texto: "fallada", color: pc.red }
        : { texto: "sin responder", color: pc.yellow },
    ] as (Segmento | null)[]
  ).filter((s): s is Segmento => s !== null);

  const lineas: string[] = wrapSegments(
    [{ texto: `${n}.`, color: pc.dim }, ...separadas(etiquetas)],
    width,
    "  ",
  );

  // Enunciado en negrita, como la pregunta en vivo: es el ancla del bloque.
  lineas.push(...stemLines(q, width, SANGRIA).map((l) => pc.bold(l)));
  lineas.push("");

  // Lo tuyo en rojo. En una NO RESPONDIDA no se inventa una respuesta: se dice
  // que no llegaste, que no es lo mismo que haberla fallado.
  if (q.selectedText === null) {
    lineas.push(SANGRIA + pc.yellow("No la respondiste."));
  } else {
    const tuyo = wrap(q.selectedText, width, SANGRIA + "  ");
    lineas.push(SANGRIA + pc.red("Tu respuesta:"));
    lineas.push(...tuyo.map((l) => pc.red(l)));
  }

  // Lo correcto en verde. Si eran varias, van todas: enseñar solo la primera
  // dejaría media respuesta fuera en las de respuesta múltiple.
  const rotulo = q.correctTexts.length > 1 ? "Correctas:" : "Correcta:";
  lineas.push(SANGRIA + pc.green(rotulo));
  for (const texto of q.correctTexts) {
    lineas.push(...wrap(texto, width, SANGRIA + "  ").map((l) => pc.green(l)));
  }
  lineas.push("");

  // La explicación curada del pack: el motivo entero de esta pantalla.
  lineas.push(...wrap(q.explanation, width, SANGRIA).map((l) => pc.dim(l)));

  return lineas.join("\n");
}

/**
 * El repaso entero. `width` entra como argumento (por defecto el ancho real del
 * terminal) para que los tests no dependan de en qué terminal se ejecuten.
 */
export function renderMistakes(review: MistakeReview, width = termWidth()): string {
  const mostradas = review.byDimension.reduce((n, g) => n + g.questions.length, 0);

  if (mostradas === 0 && review.missingFromBank.length === 0) {
    return wrapSegments(
      [
        {
          texto: `Nada que repasar: acertaste las ${review.presented} que salieron.`,
          color: pc.green,
        },
      ],
      width,
      "  ",
    ).join("\n");
  }

  const partes: string[] = [];

  // Titular: SIEMPRE con el N presentado detrás. "9 falladas" a secas no dice si
  // fueron 9 de 10 o 9 de 120.
  const desglose: Segmento[] = (
    [
      review.wrong > 0 ? { texto: `${review.wrong} fallada(s)`, color: pc.red } : null,
      review.unanswered > 0
        ? { texto: `${review.unanswered} sin responder`, color: pc.yellow }
        : null,
    ] as (Segmento | null)[]
  ).filter((s): s is Segmento => s !== null);

  partes.push(
    wrapSegments(
      [
        ...separadas(desglose),
        { texto: `— de ${review.presented} pregunta(s) presentada(s).`, color: pc.dim },
      ],
      width,
      "  ",
    ).join("\n"),
  );

  // Si se está viendo solo una dimensión, se dice: si no, el titular de arriba
  // (que cuenta la sesión entera) parecería no cuadrar con lo que hay debajo.
  if (mostradas < review.reviewable) {
    partes.push(
      wrapSegments(
        [
          {
            texto: `Se muestran ${mostradas} de las ${review.reviewable} que hay que repasar.`,
            color: pc.dim,
          },
        ],
        width,
        "  ",
      ).join("\n"),
    );
  }

  for (const grupo of review.byDimension) {
    const cuenta = [
      grupo.wrong > 0 ? `${grupo.wrong} fallada(s)` : null,
      grupo.unanswered > 0 ? `${grupo.unanswered} sin responder` : null,
    ]
      .filter((p): p is string => p !== null)
      .join(" · ");
    partes.push(
      "\n" +
        heading(grupo.dimension, width) +
        "\n" +
        wrapSegments(
          [
            {
              texto: `${cuenta} — de ${grupo.presented} presentada(s) en esta dimensión.`,
              color: pc.dim,
            },
          ],
          width,
          "  ",
        ).join("\n"),
    );

    // Numeración por dimensión: es la unidad con la que se estudia.
    partes.push(grupo.questions.map((q, i) => bloque(q, i + 1, width)).join("\n\n"));
  }

  // Lo que el pack ya no tiene. Callarlo haría el repaso más corto de lo que fue.
  if (review.missingFromBank.length > 0) {
    partes.push(
      "\n" +
        wrapSegments(
          [
            {
              texto:
                `⚠ ${review.missingFromBank.length} pregunta(s) de esa sesión ya no están en el ` +
                "pack: se editaron o se retiraron, así que no hay enunciado ni explicación que enseñar.",
              color: pc.yellow,
            },
          ],
          width,
          "  ",
        ).join("\n"),
    );
  }

  return partes.join("\n");
}
