import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { loadReadiness, type ReadinessConfig } from "../../content/readiness.js";
import { loadHistory, saveHistory } from "../../content/history.js";
import { loadJobTexts, jobsDbPath } from "../../content/jobhunt.js";
import { defaultPackLocator, historyPath as historyPathOf } from "../../content/paths.js";
import { selectBalanced, shuffleOptions } from "../../core/session.js";
import { makeSeededShuffle } from "../../core/random.js";
import { score } from "../../core/scoring.js";
import { calibration } from "../../core/calibration.js";
import { computeReadiness, computeGaps } from "../../core/readiness.js";
import { buildSessionRecord, evolution } from "../../core/evolution.js";
import { computeDemand, applyMarketWeight } from "../../core/market.js";
import { runSession } from "../runner.js";
import {
  renderResult,
  renderCalibration,
  renderReadiness,
  renderGaps,
  renderWeightedGaps,
  renderEvolution,
  renderSummary,
} from "../render.js";
import { describeSetup, resolveSetup, sampleWarning, type SetupOptions } from "../setup.js";
import { heading } from "../theme.js";

// Test LARGO por defecto: para evaluar en serio a través de los rangos de
// seniority (junior→staff) hace falta bastante muestra por dimensión y dificultad.
// Con el banco lleno (~50/dim) esto toma ~24/dim (~120 preguntas); con bancos
// menores toma gran parte de cada dimensión. selectBalanced acota por pool.
const SESSION_TARGET_QUESTIONS = 120;
const MIN_PER_DIMENSION = 20;

export const DEFAULT_PACK = "ai-ml-readiness";

/**
 * Compone la sesión end-to-end sobre el pack elegido: asistente (qué pack, qué
 * dimensiones, qué dificultad) → seleccionar equilibrado → barajar opciones →
 * sesión select navegable → puntuar → renderizar (dimensiones, calibración, y si
 * el pack trae readiness: readiness por rol + gaps). Persiste la sesión (historial
 * por pack) y muestra la evolución. La aleatoriedad/reloj viven aquí, en la capa
 * de I/O. `readiness.yaml` es opcional: un pack de cualquier tema puede traer solo
 * preguntas.
 */
/** Qué ha pasado con la sesión, para que el menú sepa si conviene pausar. */
export type StartOutcome = "completada" | "cancelada" | "error";

export async function startCommand(
  opts: SetupOptions = { interactive: true },
): Promise<StartOutcome> {
  let setup;
  try {
    setup = await resolveSetup(
      defaultPackLocator(),
      opts,
      SESSION_TARGET_QUESTIONS,
      DEFAULT_PACK,
    );
  } catch (err) {
    console.error(
      `\n✗ No se puede iniciar la sesión: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return "error";
  }
  if (setup === null) {
    console.log(pc.dim("\n  Sesión cancelada antes de empezar. No se ha guardado nada.\n"));
    return "cancelada";
  }

  const { packName, packDir } = setup;

  // Aislamiento por tema: cada pack tiene su carpeta de contenido y su carpeta de
  // resultados, y nunca se cruzan entre temas. Dónde están cada una lo decide
  // paths.ts: instalado, el contenido viene del paquete y los datos NO.
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = historyPathOf(packName);

  let readinessCfg: ReadinessConfig | null = null;
  let history;
  try {
    if (existsSync(readinessPath)) readinessCfg = loadReadiness(readinessPath);
    // Se carga ANTES de la sesión para fallar rápido si el historial está corrupto.
    history = loadHistory(historyPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ No se puede iniciar la sesión: ${msg}`);
    process.exitCode = 1;
    return "error";
  }

  console.log("\n" + heading("Sesión") + "\n" + describeSetup(setup));

  // Si el filtro deja una muestra que no da para concluir nada, se dice ANTES de
  // responder 40 preguntas y no al final escondido en un N pequeño.
  const aviso = sampleWarning(setup.bank, setup.target);
  if (aviso !== null) console.log(`  ${pc.yellow("⚠")} ${pc.yellow(aviso)}`);
  console.log("");

  const seed = Date.now() >>> 0;
  const shuffle = makeSeededShuffle(seed);

  // El mínimo por dimensión no puede pasarse del total pedido: si no, elegir
  // "sesión corta" devolvería igualmente el mínimo × nº de dimensiones.
  const dimsEnBanco = new Set(setup.bank.map((q) => q.dimension)).size;
  const minPorDim = Math.max(
    1,
    Math.min(MIN_PER_DIMENSION, Math.floor(setup.target / dimsEnBanco)),
  );

  // Barajar las opciones al presentar: el banco tiene la correcta casi siempre la
  // primera (sesgo de quien las escribe), y sin esto el test se adivina por
  // posición. Los ids no se tocan, así que el scoring y el historial no se enteran.
  const selected = shuffleOptions(
    selectBalanced(setup.bank, setup.target, minPorDim, shuffle),
    shuffle,
  );

  const answered = await runSession(selected);
  if (answered === null) {
    // Abandonada con ESC: no se puntúa ni se guarda nada. Decirlo importa —
    // dejar la terminal en silencio haría dudar de si se ha guardado algo.
    console.log(pc.dim("\n  Sesión abandonada. No se ha guardado ningún resultado.\n"));
    return "cancelada";
  }
  const result = score(answered, selected);
  const calib = calibration(answered, selected);
  const roles = readinessCfg ? computeReadiness(answered, selected, readinessCfg) : [];

  // Persistir la sesión (PERS-01) y mostrar la evolución (PERS-02). Se guardan
  // también las respuestas crudas para poder reevaluar esta sesión contra una
  // oferta concreta (`aptus jd`) sin tener que repetir el test.
  const record = buildSessionRecord(new Date().toISOString(), result, roles, answered);
  const updatedHistory = [...history, record];
  saveHistory(historyPath, updatedHistory);

  const gaps = readinessCfg ? computeGaps(answered, selected, readinessCfg) : [];

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
  return "completada";
}
