import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadPackDir } from "../../content/loader.js";
import { historyPath as historyPathOf, packDirForRead } from "../../content/paths.js";
import { loadReadiness } from "../../content/readiness.js";
import { loadHistory } from "../../content/history.js";
import { loadJobs, jobsDbPath } from "../../content/jobhunt.js";
import { measurements } from "../../core/evolution.js";
import { scanJobs } from "../../core/jobs-scan.js";
import { renderJobsScan } from "../render.js";
import { DEFAULT_PACK } from "./start.js";

const DEFAULT_LIMIT = 20;

/**
 * Subcomando `jobs`: evalúa DE UNA VEZ las ofertas ya escaneadas por jobhunt
 * contra tu readiness, en vez de ir pasándolas a mano una a una por `aptus jd`.
 *
 * Cada oferta recorre exactamente el mismo camino que `aptus jd` y con la MISMA
 * evidencia (tu última sesión de medición), que es lo que las hace comparables
 * entre sí. Solo lectura: no escribe en jobhunt ni en el historial.
 */
export async function jobsCommand(packName: string = DEFAULT_PACK, limit: number = DEFAULT_LIMIT): Promise<void> {
  const packDir = packDirForRead(packName);
  if (packDir === null) {
    console.error(`\n✗ No existe el pack '${packName}'.`);
    process.exitCode = 1;
    return;
  }
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = historyPathOf(packName);

  if (!existsSync(readinessPath)) {
    console.error(`\n✗ El pack '${packName}' no trae readiness.yaml: sin perfiles ni niveles no hay nada que evaluar.`);
    process.exitCode = 1;
    return;
  }

  let pack;
  let cfg;
  let history;
  try {
    pack = loadPackDir(packDir);
    cfg = loadReadiness(readinessPath);
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (!cfg.market_keywords) {
    console.error(
      `\n✗ El readiness.yaml de '${packName}' no declara market_keywords, que es lo que traduce el texto de una oferta a dimensiones.`,
    );
    process.exitCode = 1;
    return;
  }

  // Degradación elegante: sin base de ofertas, aptus sigue funcionando igual (INTEG-01).
  const dbPath = jobsDbPath();
  const jobs = loadJobs(dbPath);
  if (jobs === null) {
    console.log(
      dbPath === null
        ? `\nNo hay ninguna base de ofertas configurada: exporta APTUS_JOBS_DB con la ruta a tu jobs.db.\n` +
            `  Mientras tanto puedes evaluar una oferta suelta con \`aptus jd <fichero>\`.\n`
        : `\nNo hay ofertas que evaluar: no se puede leer ${dbPath}.\n` +
            `  Escanea ofertas y vuelve, o evalúa una suelta con \`aptus jd <fichero>\`.\n`,
    );
    return;
  }

  // Las descartadas en jobhunt no se evalúan: ya dijiste que no te interesan.
  const activas = jobs.filter((j) => j.status !== "dismissed");
  if (activas.length === 0) {
    console.log(`\nNo hay ofertas activas en jobhunt (${jobs.length} escaneadas, todas descartadas).\n`);
    return;
  }

  // Misma regla que `aptus jd`: la evidencia sale de la última MEDICIÓN con
  // respuestas. Un repaso va cargado de tus fallos y daría un ranking peor del real.
  const withAnswers = [...measurements(history)]
    .reverse()
    .find((r) => r.answers !== undefined && r.answers.length > 0);
  if (!withAnswers) {
    console.log(
      `\nAún no hay una sesión de medición con respuestas de '${packName}', y sin evidencia no se puede evaluar ninguna oferta.\n` +
        `  Haz una con \`aptus start --pack ${packName}\` y vuelve.\n`,
    );
    return;
  }

  const answers = withAnswers.answers!;
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const bank = pack.questions.filter((q) => answeredIds.has(q.id));

  const scan = scanJobs(activas, cfg.market_keywords, cfg, answers, bank);

  console.log(`\n${renderJobsScan(scan, limit)}\n`);
  console.log(
    `Evidencia: tu sesión del ${new Date(withAnswers.timestamp).toLocaleString("es-ES")} (${answers.length} respuestas), ` +
      `la misma para todas las ofertas.\n`,
  );
}
