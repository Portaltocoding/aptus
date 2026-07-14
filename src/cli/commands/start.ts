import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPack } from "../../content/loader.js";
import { loadReadiness } from "../../content/readiness.js";
import { loadHistory, saveHistory } from "../../content/history.js";
import { selectBalanced } from "../../core/session.js";
import { makeSeededShuffle } from "../../core/random.js";
import { score } from "../../core/scoring.js";
import { calibration } from "../../core/calibration.js";
import { computeReadiness, computeGaps } from "../../core/readiness.js";
import { buildSessionRecord, evolution } from "../../core/evolution.js";
import { runSession } from "../runner.js";
import {
  renderResult,
  renderCalibration,
  renderReadiness,
  renderGaps,
  renderEvolution,
} from "../render.js";

// Dimensionado de la sesión (ajustable sin tocar la lógica de selectBalanced).
// Con 5 dimensiones: 5 preguntas/dimensión → 25 por sesión (~20 min, ≥15 min).
// El banco (66) es muy superior a lo mostrado, así que la selección con seed
// distinta por arranque rota preguntas entre intentos (SESS-04).
const SESSION_TARGET_QUESTIONS = 25;
const MIN_PER_DIMENSION = 4;

// Ruta FIJA al pack real bajo packs/ — en P1 no se acepta una ruta arbitraria
// del usuario (sin superficie de path traversal).
const PACK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs/ai-ml-readiness");

// Store local del historial de sesiones (fuera del código, gitignored).
const HISTORY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/history.json");

/**
 * Compone el walking skeleton end-to-end: cargar pack real → seleccionar de
 * forma equilibrada → correr la sesión select navegable → puntuar con el motor
 * puro → renderizar el resultado por dimensión con N. La aleatoriedad (seed) se
 * genera aquí, en la capa de I/O, y se inyecta al núcleo — nunca al revés.
 */
export async function startCommand(): Promise<void> {
  const packYaml = resolve(PACK_DIR, "pack.yaml");
  const questionsYaml = resolve(PACK_DIR, "questions.yaml");

  let pack;
  let readinessCfg;
  let history;
  try {
    pack = loadPack(packYaml, questionsYaml);
    readinessCfg = loadReadiness(resolve(PACK_DIR, "readiness.yaml"));
    // Se carga ANTES de la sesión para fallar rápido si el historial está corrupto.
    history = loadHistory(HISTORY_PATH);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ No se puede iniciar la sesión: ${msg}`);
    process.exitCode = 1;
    return;
  }

  // Seed derivada del arranque: distinta cada sesión, pero inyectada como valor
  // puro al núcleo determinista.
  const seed = Date.now() >>> 0;
  const shuffle = makeSeededShuffle(seed);
  const selected = selectBalanced(
    pack.questions,
    SESSION_TARGET_QUESTIONS,
    MIN_PER_DIMENSION,
    shuffle,
  );

  const answered = await runSession(selected);
  const result = score(answered, selected);
  const calib = calibration(answered, selected);
  const roles = computeReadiness(answered, selected, readinessCfg);
  const gaps = computeGaps(answered, selected, readinessCfg);

  // Persistir la sesión (PERS-01) y mostrar la evolución (PERS-02). El timestamp
  // se genera aquí, en la capa de I/O, y se inyecta al registro puro.
  const record = buildSessionRecord(new Date().toISOString(), result, roles);
  const updatedHistory = [...history, record];
  saveHistory(HISTORY_PATH, updatedHistory);

  console.log("\n" + renderResult(result) + "\n");
  console.log(renderCalibration(calib) + "\n");
  console.log(renderReadiness(roles) + "\n");
  console.log(renderGaps(gaps) + "\n");
  console.log(renderEvolution(evolution(updatedHistory)) + "\n");
}
