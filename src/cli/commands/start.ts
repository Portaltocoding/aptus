import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadPackDir } from "../../content/loader.js";
import { loadReadiness, type ReadinessConfig } from "../../content/readiness.js";
import { loadHistory, saveHistory } from "../../content/history.js";
import { loadJobTexts } from "../../content/jobhunt.js";
import { selectBalanced } from "../../core/session.js";
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

// Test LARGO por defecto: para evaluar en serio a través de los rangos de
// seniority (junior→staff) hace falta bastante muestra por dimensión y dificultad.
// Con el banco lleno (~50/dim) esto toma ~24/dim (~120 preguntas); con bancos
// menores toma gran parte de cada dimensión. selectBalanced acota por pool.
const SESSION_TARGET_QUESTIONS = 120;
const MIN_PER_DIMENSION = 20;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKS_ROOT = join(ROOT, "packs");
const DATA_DIR = join(ROOT, "data");
export const DEFAULT_PACK = "ai-ml-readiness";

// Base de datos de jobhunt (solo lectura, opcional): si existe, pondera los gaps
// por demanda de mercado; si no, Aptus funciona igual sin esa capa (INTEG-01).
const JOBHUNT_DB_PATH = join(homedir(), "workspace", "jobhunt", "data", "jobs.db");

/**
 * Compone la sesión end-to-end sobre el pack elegido: cargar pack → seleccionar
 * equilibrado → sesión select navegable → puntuar → renderizar (dimensiones,
 * calibración, y si el pack trae readiness: readiness por rol + gaps). Persiste la
 * sesión (historial por pack) y muestra la evolución. La aleatoriedad/reloj viven
 * aquí, en la capa de I/O. `readiness.yaml` es opcional: un pack de cualquier tema
 * puede traer solo preguntas.
 */
export async function startCommand(packName: string = DEFAULT_PACK): Promise<void> {
  // Aislamiento por tema: cada pack tiene su carpeta de contenido (packs/<pack>/)
  // y su carpeta de resultados (data/<pack>/). Nunca se cruzan entre temas.
  const packDir = join(PACKS_ROOT, packName);
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = join(DATA_DIR, packName, "history.json");

  let pack;
  let readinessCfg: ReadinessConfig | null = null;
  let history;
  try {
    pack = loadPackDir(packDir);
    if (existsSync(readinessPath)) readinessCfg = loadReadiness(readinessPath);
    // Se carga ANTES de la sesión para fallar rápido si el historial está corrupto.
    history = loadHistory(historyPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ No se puede iniciar la sesión: ${msg}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nPack: ${pack.name} (${packName}) — ${pack.questions.length} preguntas, ${pack.dimensions.length} dimensiones`,
  );

  const seed = Date.now() >>> 0;
  const shuffle = makeSeededShuffle(seed);
  const selected = selectBalanced(pack.questions, SESSION_TARGET_QUESTIONS, MIN_PER_DIMENSION, shuffle);

  const answered = await runSession(selected);
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
    console.log("\n" + renderSummary(roles, gaps, readinessCfg.levels.map((l) => l.id)) + "\n");
  }
  console.log(renderResult(result) + "\n");
  console.log(renderCalibration(calib) + "\n");

  if (readinessCfg) {
    console.log(renderReadiness(roles) + "\n");

    // Gaps: si jobhunt está disponible, ponderar por demanda de mercado (INTEG-01);
    // si no, mostrar los gaps sin ponderar (degradación elegante, sin error).
    const jobTexts = loadJobTexts(JOBHUNT_DB_PATH);
    if (jobTexts !== null && readinessCfg.market_keywords) {
      const demand = computeDemand(jobTexts, readinessCfg.market_keywords);
      console.log(renderWeightedGaps(applyMarketWeight(gaps, demand), demand) + "\n");
    } else {
      console.log(renderGaps(gaps) + "\n");
    }
  }

  console.log(renderEvolution(evolution(updatedHistory)) + "\n");
}
