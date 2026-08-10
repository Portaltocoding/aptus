import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { loadReadiness, type ReadinessConfig } from "../content/readiness.js";
import { loadHistory, saveHistory } from "../content/history.js";
import { loadJobTexts, jobsDbPath } from "../content/jobhunt.js";
import { historyPath as historyPathOf } from "../content/paths.js";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "../core/scoring.js";
import { score } from "../core/scoring.js";
import { calibration } from "../core/calibration.js";
import { computeReadiness, computeGaps } from "../core/readiness.js";
import { buildSessionRecord, evolution } from "../core/evolution.js";
import { computeDemand, applyMarketWeight } from "../core/market.js";
import { deriveMistakes } from "../core/mistakes.js";
import { mistakesHeading, offerMistakes } from "./mistakes-flow.js";
import {
  renderResult,
  renderCalibration,
  renderReadiness,
  renderGaps,
  renderWeightedGaps,
  renderEvolution,
  renderSummary,
} from "./render.js";
import { heading, termWidth, wrap } from "./theme.js";

/**
 * Lo que pasa DESPUÉS de responder en una sesión de medida: puntuar, calcular
 * readiness y gaps, guardar en el historial, enseñar la evolución y ofrecer el
 * repaso de fallos.
 *
 * Vive aparte de `commands/start.ts` porque ya no hay una sola forma de llegar
 * hasta aquí: una sesión puede terminarse entera, cortarse en la pregunta 30 o
 * retomarse días después desde una pausa, y las tres acaban exactamente igual.
 * Tenerlo duplicado en cada camino era la forma segura de que uno de los tres
 * dejara de guardar el historial o de ofrecer los fallos sin que nadie lo notara.
 */

export interface FinishOptions {
  /** ¿Se cortó a propósito antes de tiempo? Cambia lo que se dice, no lo que se calcula. */
  parcial: boolean;
  /** Cuántas preguntas se habían seleccionado para la sesión completa. */
  seleccionadas: number;
}

/**
 * Aviso de sesión parcial. La muestra es la que es, y lo honesto es decirlo
 * ARRIBA y no dejar que se deduzca de un N pequeño en una tabla.
 */
export function partialWarning(evaluadas: number, seleccionadas: number): string {
  const cuantas =
    evaluadas === 1
      ? "se evalúa la única pregunta que respondiste"
      : `se evalúan las ${evaluadas} preguntas que respondiste`;
  return (
    `Sesión terminada antes de tiempo: ${cuantas}, de las ${seleccionadas} que se ` +
    `habían seleccionado. Lo que no viste no cuenta ni a favor ni en contra, pero con menos ` +
    `muestra cada porcentaje se mueve más: mira siempre el N.`
  );
}

export async function finishMeasureSession(
  packName: string,
  packDir: string,
  presented: Question[],
  answered: AnsweredQuestion[],
  opts: FinishOptions,
): Promise<void> {
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = historyPathOf(packName);

  let readinessCfg: ReadinessConfig | null = null;
  if (existsSync(readinessPath)) readinessCfg = loadReadiness(readinessPath);

  if (opts.parcial) {
    const ancho = termWidth();
    console.log(
      "\n" +
        wrap(partialWarning(presented.length, opts.seleccionadas), ancho, "  ")
          .map((l) => pc.yellow(l))
          .join("\n"),
    );
  }

  const result = score(answered, presented);
  const calib = calibration(answered, presented);
  const roles = readinessCfg ? computeReadiness(answered, presented, readinessCfg) : [];

  // Persistir la sesión (PERS-01) y mostrar la evolución (PERS-02). Se guardan
  // también las respuestas crudas para poder reevaluar esta sesión contra una
  // oferta concreta (`aptus jd`) sin tener que repetir el test.
  const history = loadHistory(historyPath);
  const record = buildSessionRecord(new Date().toISOString(), result, roles, answered);
  const updatedHistory = [...history, record];
  saveHistory(historyPath, updatedHistory);

  const gaps = readinessCfg ? computeGaps(answered, presented, readinessCfg) : [];

  // TL;DR narrativo primero: ranking, peores puntos y por dónde estudiar.
  if (readinessCfg) {
    console.log(
      "\n" +
        renderSummary(
          roles,
          gaps,
          readinessCfg.levels.map((l) => l.id),
        ) +
        "\n",
    );
  }
  console.log(renderResult(result) + "\n");
  console.log(renderCalibration(calib) + "\n");

  if (readinessCfg) {
    console.log(renderReadiness(roles) + "\n");

    // Gaps: si hay base de ofertas (APTUS_JOBS_DB), ponderar por demanda de mercado
    // (INTEG-01); si no, mostrarlos sin ponderar (degradación elegante, sin error).
    const jobTexts = loadJobTexts(jobsDbPath());
    if (jobTexts !== null && readinessCfg.market_keywords) {
      const demand = computeDemand(jobTexts, readinessCfg.market_keywords);
      console.log(renderWeightedGaps(applyMarketWeight(gaps, demand), demand) + "\n");
    } else {
      console.log(renderGaps(gaps) + "\n");
    }
  }

  console.log(renderEvolution(evolution(updatedHistory)) + "\n");

  // Lo último, y OFRECIDO: hasta ahora se veían porcentajes y nunca qué fallaste
  // ni por qué, con las explicaciones curadas del pack ahí sin usarse. Va después
  // de los resultados porque primero interesa dónde estás; y se pregunta porque
  // sesenta fallos de golpe es un muro que nadie lee.
  const fallos = deriveMistakes(answered, presented);
  if (fallos.reviewable > 0) {
    console.log(mistakesHeading());
    await offerMistakes(fallos);
  }
}

/** Cabecera de la sesión reanudada, para que se vea que no empieza de cero. */
export function resumeHeading(respondidas: number, total: number, cuando: string): string {
  return (
    heading("Sesión retomada") +
    "\n" +
    pc.dim(
      `  Llevabas ${respondidas} de ${total} respuestas, pausada el ` +
        `${new Date(cuando).toLocaleString("es-ES")}.`,
    )
  );
}
