import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadPackDir } from "../../content/loader.js";
import { loadReadiness } from "../../content/readiness.js";
import { loadHistory } from "../../content/history.js";
import { loadJdText } from "../../content/jd.js";
import { measurements } from "../../core/evolution.js";
import { computeJdGaps, computeJdReadiness, extractJdProfile, jdVerdict } from "../../core/jd.js";
import { renderJdGaps, renderJdProfile, renderJdReadiness } from "../render.js";
import { DEFAULT_PACK } from "./start.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKS_ROOT = join(ROOT, "packs");
const DATA_DIR = join(ROOT, "data");

/**
 * Subcomando `jd <fichero>`: evalúa tu readiness contra una oferta CONCRETA.
 *
 * Reutiliza la última sesión con respuestas guardadas en vez de hacerte repetir el
 * test: la oferta se traduce a un rol ad-hoc (sus dimensiones núcleo/secundarias)
 * y se pasa por el mismo motor de readiness de siempre. Así, evaluar una oferta
 * nueva cuesta un segundo y las tres ofertas que mires se miden con la MISMA
 * evidencia, que es justo lo que las hace comparables entre sí.
 *
 * No sale a la red y no escribe nada: es puramente lectura sobre lo que ya tienes.
 */
export async function jdCommand(jdPath: string, packName: string = DEFAULT_PACK): Promise<void> {
  const packDir = join(PACKS_ROOT, packName);
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = join(DATA_DIR, packName, "history.json");

  if (!existsSync(readinessPath)) {
    console.error(
      `\n✗ El pack '${packName}' no trae readiness.yaml, así que no hay perfiles ni niveles con los que evaluar una oferta.`,
    );
    process.exitCode = 1;
    return;
  }

  let pack;
  let cfg;
  let history;
  let jdText;
  try {
    pack = loadPackDir(packDir);
    cfg = loadReadiness(readinessPath);
    history = loadHistory(historyPath);
    jdText = loadJdText(resolve(jdPath));
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Las keywords por dimensión son la base de la extracción: sin ellas el pack no
  // sabe qué palabras delatan cada dimensión y no hay nada que mapear.
  if (!cfg.market_keywords) {
    console.error(
      `\n✗ El readiness.yaml de '${packName}' no declara market_keywords, que es lo que traduce el texto de una oferta a dimensiones.\n` +
        `  Añádelas para poder evaluar ofertas contra este pack.`,
    );
    process.exitCode = 1;
    return;
  }

  const profile = extractJdProfile(jdText, cfg.market_keywords, cfg.levels);

  if (profile.matched.length === 0) {
    console.log(`\n${renderJdProfile(profile)}\n`);
    console.log(
      `La oferta no menciona ninguna dimensión que '${packName}' sepa medir, así que no hay readiness que dar para ella.\n` +
        `  O el puesto va de otra cosa, o le faltan keywords a readiness.yaml.\n`,
    );
    return;
  }

  // La evidencia sale de la última sesión de MEDICIÓN que guardó respuestas crudas.
  // Las de repaso (RES-05) no valen: van cargadas de tus fallos a propósito, así que
  // darían un readiness peor que el real. Los historiales anteriores a que se
  // guardaran las respuestas tampoco sirven.
  const medidas = measurements(history);
  const withAnswers = [...medidas].reverse().find((r) => r.answers !== undefined && r.answers.length > 0);
  if (!withAnswers) {
    console.log(`\n${renderJdProfile(profile)}\n`);

    let motivo: string;
    if (medidas.length === 0) {
      motivo =
        history.length === 0
          ? `Aún no has hecho ningún test de '${packName}'.`
          : `Solo tienes sesiones de repaso de '${packName}', y no valen como evidencia: van cargadas de tus fallos a propósito.`;
    } else {
      motivo =
        medidas.length === 1
          ? `Tu única sesión de medición de '${packName}' es anterior a que se guardaran las respuestas, y sin ellas no se puede reevaluar.`
          : `Tus ${medidas.length} sesiones de medición de '${packName}' son anteriores a que se guardaran las respuestas, y sin ellas no se puede reevaluar.`;
    }

    console.log(`${motivo}\n  Haz una con \`aptus start --pack ${packName}\` y vuelve a pasar la oferta.\n`);
    return;
  }

  // Banco = las preguntas que respondiste en esa sesión. Si alguna ya no está en el
  // pack (el banco evoluciona), se cae sola del cálculo: se avisa para que el N no
  // sorprenda.
  const answers = withAnswers.answers!;
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const bank = pack.questions.filter((q) => answeredIds.has(q.id));
  const desaparecidas = answeredIds.size - bank.length;

  const readiness = computeJdReadiness(answers, bank, cfg, profile);
  if (readiness === null) {
    console.log(`\n${renderJdProfile(profile)}\n`);
    console.log("La oferta no pide con fuerza ninguna dimensión medible: no hay núcleo sobre el que dar un nivel.\n");
    return;
  }

  const verdict = jdVerdict(readiness, profile, cfg.levels);
  const gaps = computeJdGaps(answers, bank, cfg, profile);

  console.log(`\n${renderJdProfile(profile)}\n`);
  console.log(`${renderJdReadiness(readiness, verdict)}\n`);
  console.log(`${renderJdGaps(gaps)}\n`);
  console.log(
    `Evidencia: sesión del ${new Date(withAnswers.timestamp).toLocaleString("es-ES")} (${answers.length} respuestas).` +
      (desaparecidas > 0 ? ` ${desaparecidas} pregunta(s) de esa sesión ya no están en el pack y no cuentan.` : "") +
      "\n",
  );
}
