import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadPackDir } from "../../content/loader.js";
import { loadHistory, saveHistory } from "../../content/history.js";
import { score } from "../../core/scoring.js";
import { calibration } from "../../core/calibration.js";
import { buildSessionRecord } from "../../core/evolution.js";
import {
  buildReviewState,
  dueForReview,
  nextDueAt,
  reviewByDimension,
  selectReview,
} from "../../core/resurfacing.js";
import { runSession } from "../runner.js";
import { renderCalibration, renderResult, renderReviewPlan, renderReviewOutcome } from "../render.js";
import { DEFAULT_PACK } from "./start.js";

// Tanda de repaso CORTA: esto es estudio, no medición. Se busca que te sientes a
// repasar 15 preguntas, no que te comas otro test de 120.
const REVIEW_TARGET_QUESTIONS = 15;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKS_ROOT = join(ROOT, "packs");
const DATA_DIR = join(ROOT, "data");

/**
 * Subcomando `review`: repaso espaciado de lo que peor llevas (RES-05).
 *
 * Es un modo de ESTUDIO, no de medida. La tanda va deliberadamente cargada hacia
 * tus fallos, así que aquí NO se calcula readiness ni gaps: sobre una muestra
 * sesgada esos números mentirían. La sesión se guarda marcada como `review` para
 * que la evolución, el informe y `aptus jd` la ignoren.
 */
export async function reviewCommand(packName: string = DEFAULT_PACK): Promise<void> {
  const packDir = join(PACKS_ROOT, packName);
  const historyPath = join(DATA_DIR, packName, "history.json");

  let pack;
  let history;
  try {
    pack = loadPackDir(packDir);
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ No se puede iniciar el repaso: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const before = buildReviewState(history, pack.questions);
  if (before.length === 0) {
    console.log(
      `\nAún no hay nada que repasar de '${packName}': el repaso se construye con lo que ya has respondido.\n` +
        `  Haz una sesión con \`aptus start --pack ${packName}\` y vuelve.\n`,
    );
    return;
  }

  // El reloj vive aquí, en la capa de I/O: el motor de repaso es puro.
  const now = new Date();
  const due = dueForReview(before, now);

  if (due.length === 0) {
    const next = nextDueAt(before);
    console.log(
      `\n✓ Nada que repasar ahora mismo en '${packName}' — ${before.length} pregunta(s) en seguimiento.\n` +
        (next ? `  La siguiente toca el ${new Date(next).toLocaleString("es-ES")}.\n` : "\n"),
    );
    return;
  }

  console.log(`\n${renderReviewPlan(due, reviewByDimension(due), before.length, REVIEW_TARGET_QUESTIONS)}\n`);

  const selected = selectReview(due, pack.questions, REVIEW_TARGET_QUESTIONS);
  const answered = await runSession(selected);
  const result = score(answered, selected);

  // Se marca `review`: sin esto, la próxima `aptus history` te enseñaría una
  // regresión inventada por haber estudiado.
  const record = buildSessionRecord(now.toISOString(), result, [], answered, "review");
  const updatedHistory = [...history, record];
  saveHistory(historyPath, updatedHistory);

  const after = buildReviewState(updatedHistory, pack.questions);

  console.log("\n" + renderResult(result) + "\n");
  console.log(renderCalibration(calibration(answered, selected)) + "\n");
  console.log(renderReviewOutcome(before, after, selected.map((q) => q.id)) + "\n");
}
