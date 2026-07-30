import { existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { loadPackDir } from "../../content/loader.js";
import { loadReadiness } from "../../content/readiness.js";
import { loadHistory } from "../../content/history.js";
import { loadJdText } from "../../content/jd.js";
import { historyPath as historyPathOf, packDirForRead } from "../../content/paths.js";
import { measurements } from "../../core/evolution.js";
import { computeJdGaps, computeJdReadiness, extractJdProfile, jdVerdict } from "../../core/jd.js";
import { attachMaterial, briefFromJd, renderBrief } from "../../core/brief.js";
import { ingestDirectory } from "../../content/ingest.js";
import { renderJdGaps, renderJdProfile, renderJdReadiness } from "../render.js";
import { DEFAULT_PACK } from "./start.js";

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
export interface JdOptions {
  pack: string;
  /** Emitir un brief de pack a partir de la oferta en vez de evaluar tu readiness. */
  brief?: boolean;
  /** Carpeta de material propio con la que cruzar el brief (tu vault, apuntes...). */
  memoria?: string;
}

export async function jdCommand(
  jdPath: string,
  opts: JdOptions = { pack: DEFAULT_PACK },
): Promise<void> {
  const packName = opts.pack;
  const packDir = packDirForRead(packName);
  if (packDir === null) {
    console.error(`\n✗ No existe el pack '${packName}'.`);
    process.exitCode = 1;
    return;
  }
  const readinessPath = join(packDir, "readiness.yaml");
  const historyPath = historyPathOf(packName);

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

  const profile = extractJdProfile(
    jdText,
    cfg.market_keywords,
    cfg.levels,
    cfg.weak_keywords ?? {},
  );

  // `--brief` es otro trabajo: no mide tu readiness, prepara el pack que haría
  // falta para medirlo. Por eso sale ANTES de exigir historial — construir un pack
  // desde una oferta no necesita que te hayas evaluado nunca.
  if (opts.brief === true) {
    emitBrief(profile, packName, jdPath, opts.memoria);
    return;
  }

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
  const withAnswers = [...medidas]
    .reverse()
    .find((r) => r.answers !== undefined && r.answers.length > 0);
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

    console.log(
      `${motivo}\n  Haz una con \`aptus start --pack ${packName}\` y vuelve a pasar la oferta.\n`,
    );
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
    console.log(
      "La oferta no pide con fuerza ninguna dimensión medible: no hay núcleo sobre el que dar un nivel.\n",
    );
    return;
  }

  const verdict = jdVerdict(readiness, profile, cfg.levels);
  const gaps = computeJdGaps(answers, bank, cfg, profile);

  console.log(`\n${renderJdProfile(profile)}\n`);
  console.log(`${renderJdReadiness(readiness, verdict)}\n`);
  console.log(`${renderJdGaps(gaps)}\n`);
  console.log(
    `Evidencia: sesión del ${new Date(withAnswers.timestamp).toLocaleString("es-ES")} (${answers.length} respuestas).` +
      (desaparecidas > 0
        ? ` ${desaparecidas} pregunta(s) de esa sesión ya no están en el pack y no cuentan.`
        : "") +
      "\n",
  );
}

/**
 * Escribe el brief de pack de una oferta, opcionalmente cruzado con tu material.
 *
 * El brief va junto a la oferta, no dentro de `packs/`: todavía no hay pack, hay
 * una propuesta que revisar. Y el material propio NUNCA se copia — se referencia
 * por ruta. Tus notas son tuyas y no tienen por qué acabar dentro de un repo.
 */
function emitBrief(
  profile: ReturnType<typeof extractJdProfile>,
  packName: string,
  jdPath: string,
  memoria: string | undefined,
): void {
  let brief = briefFromJd(profile, packName);

  if (memoria !== undefined) {
    const dir = resolve(memoria);
    try {
      const { docs, skipped } = ingestDirectory(dir);
      brief = attachMaterial(brief, docs);
      brief.sources.push(`${docs.length} documento(s) de ${dir}`);
      if (skipped.length > 0) {
        brief.notes.push(
          `${skipped.length} fichero(s) de tu material no se han podido leer (formato o tamaño): ` +
            "el cruce no los tiene en cuenta.",
        );
      }
    } catch (err) {
      console.error(
        `\n${pc.yellow("⚠")} No se ha podido leer el material de '${dir}': ` +
          `${err instanceof Error ? err.message : String(err)}. El brief sale sin cruzar.`,
      );
    }
  }

  const destino = resolve(
    dirname(resolve(jdPath)),
    `${basename(jdPath).replace(/\.[^.]+$/, "")}.brief.md`,
  );
  writeFileSync(destino, renderBrief(brief), "utf8");

  const nuevos = brief.topics.filter((t) => !t.covered);
  console.log(`\n${pc.bold("Brief de pack")} — ${brief.label}`);
  console.log(
    `  ${pc.green("\u2713")} ${brief.topics.length - nuevos.length} tema(s) ya los mide '${packName}' · ` +
      `${pc.cyan(`${nuevos.length} tema(s) nuevos`)} que la oferta pide y nadie mide.`,
  );

  for (const t of nuevos.slice(0, 10)) {
    const mat = t.material;
    const pista =
      mat === undefined
        ? ""
        : mat.length === 0
          ? pc.yellow("  ← sin material tuyo")
          : pc.dim(`  ← ${mat.length} doc(s) tuyos`);
    console.log(`    • ${pc.cyan(t.name)}${pista}`);
  }
  if (nuevos.length > 10) console.log(pc.dim(`    (y ${nuevos.length - 10} más en el brief)`));

  console.log(`\n  ${pc.green("\u2713")} brief escrito en ${pc.dim(destino)}`);
  console.log(
    pc.dim(
      "\n  · Extracción léxica: cuenta keywords, no entiende la oferta. Revisa y agrupa\n" +
        "    los temas en 3-6 dimensiones antes de curar una sola pregunta.\n" +
        "  · Para convertirlo en pack: `aptus new-pack <tema>`, mueve el brief a su\n" +
        "    carpeta y cura (a mano o con `aptus draft <tema>`).",
    ) + "\n",
  );
}
