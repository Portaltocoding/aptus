import { loadPackDir } from "../../content/loader.js";
import { historyPath as historyPathOf, packDirForRead } from "../../content/paths.js";
import { loadHistory, saveHistory } from "../../content/history.js";
import { shuffleOptions } from "../../core/session.js";
import { makeSeededShuffle } from "../../core/random.js";
import { score } from "../../core/scoring.js";
import { calibration } from "../../core/calibration.js";
import { buildSessionRecord } from "../../core/evolution.js";
import {
  buildReviewState,
  dueForReview,
  nextDueAt,
  restrictToDimensions,
  reviewByDimension,
  selectReview,
} from "../../core/resurfacing.js";
import { runSession } from "../runner.js";
import {
  renderCalibration,
  renderResult,
  renderReviewPlan,
  renderReviewOutcome,
} from "../render.js";
import { ESCAPED } from "../keys.js";
import { parseDims, pickDimensionsFrom } from "../setup.js";
import { DEFAULT_PACK } from "./start.js";

// Tanda de repaso CORTA: esto es estudio, no medición. Se busca que te sientes a
// repasar 15 preguntas, no que te comas otro test de 120.
const REVIEW_TARGET_QUESTIONS = 15;

export interface ReviewOptions {
  /** Dimensiones separadas por comas. Sin ellas, se pregunta (si hay terminal). */
  dims?: string;
  /** Con `false` no se pregunta nada: repasa todo lo que toque. */
  interactive?: boolean;
}

/**
 * Subcomando `review`: repaso espaciado de lo que peor llevas (RES-05), acotable
 * por dimensiones (SESS-05).
 *
 * Es un modo de ESTUDIO, no de medida. La tanda va deliberadamente cargada hacia
 * tus fallos, así que aquí NO se calcula readiness ni gaps: sobre una muestra
 * sesgada esos números mentirían. La sesión se guarda marcada como `review` para
 * que la evolución, el informe y `aptus jd` la ignoren.
 *
 * El filtro de dimensiones NO cambia nada de eso, y el asistente lo dice en voz
 * alta: elegir "solo LLM" acota QUÉ estudias, no convierte la tanda en una medición
 * de LLM. Sin ese aviso, un filtro que se parece al de `start` invita justo a la
 * lectura equivocada.
 */
export async function reviewCommand(
  packName: string = DEFAULT_PACK,
  opts: ReviewOptions = {},
): Promise<void> {
  const packDir = packDirForRead(packName);
  if (packDir === null) {
    console.error(`\n✗ No se puede iniciar el repaso: no existe el pack '${packName}'.`);
    process.exitCode = 1;
    return;
  }
  const historyPath = historyPathOf(packName);

  let pack;
  let history;
  try {
    pack = loadPackDir(packDir);
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(
      `\n✗ No se puede iniciar el repaso: ${err instanceof Error ? err.message : String(err)}`,
    );
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

  // Qué dimensiones se repasan. Se valida contra las del PACK y no contra las que
  // hoy tocan: escribir bien una dimensión que hoy no toca no es un error, es una
  // respuesta ("de eso no toca nada"), y merece un mensaje distinto.
  let dims = opts.dims !== undefined ? parseDims(opts.dims) : null;
  if (dims !== null) {
    const conocidas = new Set(pack.dimensions);
    const desconocidas = dims.filter((d) => !conocidas.has(d));
    if (desconocidas.length > 0) {
      console.error(
        `\n✗ Dimensión desconocida en '${packName}': ${desconocidas.join(", ")}.` +
          ` Disponibles: ${pack.dimensions.join(", ")}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const porDimension = reviewByDimension(due);
  const interactivo = opts.interactive !== false && process.stdin.isTTY === true;

  // Con una sola dimensión vencida no hay nada que elegir: preguntarlo sería un
  // paso ceremonial. Sin TTY (scripts, pipes) tampoco se pregunta: se repasa todo.
  if (dims === null && interactivo && porDimension.length > 1) {
    const elegidas = await pickDimensionsFrom({
      mensaje: "¿Qué repasas?",
      disponibles: porDimension.map((d) => ({
        value: d.dimension,
        detalle:
          `${d.due} tocan hoy` +
          (d.weak > 0 ? ` · ${d.weak} falladas la última vez` : "") +
          " — sigue siendo estudio: filtrar no mide nada",
      })),
    });
    if (elegidas === ESCAPED) {
      console.log("\n  Repaso cancelado. Las cajas se quedan como estaban.\n");
      return;
    }
    dims = elegidas;
  }

  const tanda = restrictToDimensions(due, dims);
  if (tanda.length === 0) {
    console.log(
      `\n✓ Nada que repasar hoy en ${dims!.join(", ")} — sí toca en: ` +
        `${porDimension.map((d) => d.dimension).join(", ")}.\n`,
    );
    return;
  }

  console.log(
    `\n${renderReviewPlan(tanda, reviewByDimension(tanda), before.length, REVIEW_TARGET_QUESTIONS, dims)}\n`,
  );

  // Mismo barajado de opciones que en `start`: si en el repaso la correcta
  // volviera a caer siempre la primera, se estaría estudiando la posición.
  const selected = shuffleOptions(
    selectReview(tanda, pack.questions, REVIEW_TARGET_QUESTIONS),
    makeSeededShuffle(now.getTime() >>> 0),
  );
  const answered = await runSession(selected);
  if (answered === null) {
    // Abandonar un repaso no mueve ninguna caja: lo que no se ha respondido no
    // puede consolidarse ni caer.
    console.log("\n  Repaso abandonado. Las cajas se quedan como estaban.\n");
    return;
  }
  const result = score(answered, selected);

  // Se marca `review`: sin esto, la próxima `aptus history` te enseñaría una
  // regresión inventada por haber estudiado.
  const record = buildSessionRecord(now.toISOString(), result, [], answered, "review");
  const updatedHistory = [...history, record];
  saveHistory(historyPath, updatedHistory);

  const after = buildReviewState(updatedHistory, pack.questions);

  console.log("\n" + renderResult(result) + "\n");
  console.log(renderCalibration(calibration(answered, selected)) + "\n");
  console.log(
    renderReviewOutcome(
      before,
      after,
      selected.map((q) => q.id),
    ) + "\n",
  );
}
