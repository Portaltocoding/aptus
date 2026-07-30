import { select } from "@inquirer/prompts";
import pc from "picocolors";
import { loadHistory, saveHistory } from "../../content/history.js";
import { historyPath as historyPathOf, packDirForRead } from "../../content/paths.js";
import { loadPackDir } from "../../content/loader.js";
import { deriveMistakes } from "../../core/mistakes.js";
import { offerMistakes } from "../mistakes-flow.js";
import { evolution, measurements, type SessionRecord } from "../../core/evolution.js";
import {
  deleteSessionAt,
  summarizeSessions,
  type SessionSummary,
} from "../../core/history-edit.js";
import { renderEvolution } from "../render.js";
import { ESCAPED, ESC_HINT, withEscape } from "../keys.js";
import { heading, promptTheme } from "../theme.js";
import { DEFAULT_PACK } from "./start.js";

export interface HistoryOptions {
  /** Borrar una sesión concreta en vez de consultar el historial (PERS-03). */
  delete?: boolean;
  /** Repasar los fallos de una sesión pasada, con su explicación. */
  review?: boolean;
}

/**
 * Subcomando `history`: consulta el historial de un pack y muestra la evolución
 * (PERS-02) sin correr una sesión nueva. El historial es por pack.
 */
export async function historyCommand(
  packName: string = DEFAULT_PACK,
  opts: HistoryOptions = {},
): Promise<void> {
  if (opts.delete === true) return await deleteSessionFlow(packName);
  if (opts.review === true) return await reviewMistakesFlow(packName);
  // Resultados aislados por tema (no se cruzan entre packs), y fuera de la
  // instalación: dónde exactamente lo decide paths.ts.
  const historyPath = historyPathOf(packName);

  let history;
  try {
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log(
      `\nAún no hay sesiones guardadas para el pack '${packName}'. Completa una con \`aptus start --pack ${packName}\`.\n`,
    );
    return;
  }

  // Medición y repaso se cuentan por separado: mezclarlos aquí daría un titular que
  // contradice a la evolución de abajo, que solo mira mediciones.
  const medidas = measurements(history);
  const repasos = history.length - medidas.length;

  if (medidas.length === 0) {
    console.log(
      `\nHistorial de '${packName}': ${repasos} sesión(es) de repaso y ninguna de medición.\n` +
        `  El repaso no mide (va cargado de tus fallos). Haz un test con \`aptus start --pack ${packName}\`.\n`,
    );
    return;
  }

  const repasosLinea = repasos > 0 ? ` · ${repasos} de repaso (no cuentan para la evolución)` : "";
  console.log(
    `\nHistorial de '${packName}': ${medidas.length} sesión(es) de medición${repasosLinea}.`,
  );
  console.log(`  Primera medición: ${medidas[0]!.timestamp}`);
  console.log(`  Última medición:  ${medidas[medidas.length - 1]!.timestamp}\n`);
  console.log(renderEvolution(evolution(history)) + "\n");
  console.log(
    pc.dim(
      `  · Repasar los fallos de una sesión: \`aptus history --pack ${packName} --review\`\n` +
        `  · Borrar una sesión: \`aptus history --pack ${packName} --delete\`\n`,
    ),
  );
}

/**
 * Repasar los fallos de una sesión PASADA, con la explicación curada del pack.
 *
 * Va colgado de `history` y no de un subcomando nuevo por dos razones: aquí es
 * donde ya viven las sesiones pasadas, y aquí ya estaba el selector que las lista
 * con su fecha y sus aciertos (el de `--delete`). Un `aptus mistakes` habría
 * duplicado ese selector y habría partido en dos sitios la respuesta a "¿qué hice
 * la semana pasada?".
 *
 * Dos cosas pueden faltar y NINGUNA rompe: las sesiones anteriores a que se
 * guardaran las respuestas crudas no traen `answers`, y una pregunta puede haber
 * desaparecido del pack desde entonces. Las dos se dicen.
 */
async function reviewMistakesFlow(packName: string): Promise<void> {
  const historyPath = historyPathOf(packName);

  let history: SessionRecord[];
  try {
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log(`\nNo hay ninguna sesión guardada de '${packName}': no hay fallos que repasar.\n`);
    return;
  }

  // El banco de HOY: es contra lo que se resuelven enunciados y explicaciones.
  const packDir = packDirForRead(packName);
  if (packDir === null) {
    console.error(
      `\n✗ No encuentro el pack '${packName}', y sin él no hay explicaciones que enseñar.\n`,
    );
    process.exitCode = 1;
    return;
  }

  let bank;
  try {
    bank = loadPackDir(packDir).questions;
  } catch (err) {
    console.error(
      `\n✗ No se puede leer el pack '${packName}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const resumen = summarizeSessions(history);
  // Solo las que guardaron respuestas: sin ellas no hay nada que repasar. Se
  // cuentan las que se caen para no dar a entender que el historial es más corto.
  const conRespuestas = resumen.filter((s) => (history[s.index]?.answers?.length ?? 0) > 0);
  const sinRespuestas = resumen.length - conRespuestas.length;

  if (conRespuestas.length === 0) {
    console.log(
      `\nNinguna de las ${resumen.length} sesión(es) de '${packName}' guardó las respuestas.\n` +
        "  Son anteriores a que aptus empezara a guardarlas, y sin ellas no se puede\n" +
        "  reconstruir qué fallaste. Las sesiones nuevas sí se podrán repasar.\n",
    );
    return;
  }

  if (process.stdin.isTTY !== true) {
    console.error(
      "\n✗ Repasar una sesión pasada necesita terminal: hay que elegir cuál.\n" +
        `  ${conRespuestas.length} sesión(es) de '${packName}' se pueden repasar.\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n" + heading(`Repasar los fallos de una sesión de '${packName}'`) + "\n");
  if (sinRespuestas > 0) {
    console.log(
      pc.dim(
        `  ${sinRespuestas} sesión(es) no salen aquí: no guardaron las respuestas, así que\n` +
          "  no se puede reconstruir qué fallaste en ellas.\n",
      ),
    );
  }

  // Las más recientes arriba: lo que se quiere repasar suele ser lo último.
  const elegido = await withEscape((signal) =>
    select<number>(
      {
        message: pc.bold("  ¿Qué sesión?") + pc.dim(`  (${ESC_HINT})`),
        choices: [...conRespuestas].reverse().map((s) => ({
          value: s.index,
          name: describeSession(s),
          description:
            s.readiness.length > 0
              ? `Dejó: ${s.readiness.join(" · ")}`
              : "Sin readiness (el pack no lo trae, o fue un repaso).",
        })),
        theme: promptTheme,
        pageSize: 12,
      },
      { signal },
    ),
  );
  if (elegido === ESCAPED) {
    console.log(pc.dim("\n  Nada que repasar entonces.\n"));
    return;
  }

  const sesion = history[elegido];
  if (sesion?.answers === undefined) {
    console.error("\n✗ Esa sesión ya no está en el historial.\n");
    process.exitCode = 1;
    return;
  }

  console.log("\n" + heading(`Fallos de la sesión de ${fecha(sesion.timestamp)}`) + "\n");
  await offerMistakes(deriveMistakes(sesion.answers, bank));
}

/** Fecha legible; si el timestamp está corrupto, se enseña crudo en vez de "Invalid Date". */
function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-ES");
}

/** Una línea de sesión para elegir cuál se borra. Sin porcentaje global, a propósito. */
function describeSession(s: SessionSummary): string {
  const tipo = s.kind === "review" ? pc.yellow("repaso") : pc.cyan("medición");
  return `${fecha(s.timestamp)}  ${tipo}  ${s.correct}/${s.answered} aciertos · ${s.dimensions} dim.`;
}

/**
 * Borrar una sesión del historial (PERS-03). Antes había que abrir el JSON a mano,
 * que es exactamente el sitio donde una coma de menos te deja sin historial entero.
 *
 * Tres cosas que hace este flujo y que el editor de texto no hacía: enseña QUÉ hay
 * antes de elegir, pide confirmación porque esto NO se puede deshacer (no hay
 * papelera, ni copia, ni forma de reconstruir una sesión: sus respuestas eran la
 * evidencia), y dice qué se ha ido y qué queda.
 *
 * La decisión de qué se borra vive pura en `core/history-edit.ts`; aquí solo se
 * carga, se pregunta y se escribe.
 */
async function deleteSessionFlow(packName: string): Promise<void> {
  const historyPath = historyPathOf(packName);

  let history: SessionRecord[];
  try {
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log(`\nNo hay ninguna sesión guardada de '${packName}': no hay nada que borrar.\n`);
    return;
  }

  // Sin terminal no se borra nada. Un `--delete` en un script no puede resolverse
  // "por defecto" cuando lo que hay por defecto es destruir evidencia.
  if (process.stdin.isTTY !== true) {
    console.error(
      "\n✗ Borrar una sesión necesita terminal: hay que ver cuál se borra y confirmarlo.\n" +
        "  No se borra nada en un pipe ni en un script — esto no se puede deshacer.\n",
    );
    process.exitCode = 1;
    return;
  }

  const resumen = summarizeSessions(history);
  console.log("\n" + heading(`Borrar una sesión de '${packName}'`) + "\n");

  // Las más recientes arriba: es de las últimas de las que uno se arrepiente
  // (un test abandonado a medias, un repaso que salió mal).
  const elegido = await withEscape((signal) =>
    select<number>(
      {
        message: pc.bold("  ¿Cuál borro?") + pc.dim(`  (${ESC_HINT})`),
        choices: [...resumen].reverse().map((s) => ({
          value: s.index,
          name: describeSession(s),
          description:
            s.readiness.length > 0
              ? `Dejó: ${s.readiness.join(" · ")}`
              : "Sin readiness (el pack no lo trae, o fue un repaso).",
        })),
        theme: promptTheme,
        pageSize: 12,
      },
      { signal },
    ),
  );
  if (elegido === ESCAPED) {
    console.log(pc.dim("\n  No se ha borrado nada.\n"));
    return;
  }

  const borrado = deleteSessionAt(history, elegido);
  if (borrado === null) {
    console.error("\n✗ Esa sesión ya no está en el historial. No se ha borrado nada.\n");
    process.exitCode = 1;
    return;
  }

  const confirmado = await withEscape((signal) =>
    select(
      {
        message:
          pc.bold(`  Se va a borrar: ${describeSession(borrado.deleted)}`) +
          pc.dim(`  (${ESC_HINT})`),
        choices: [
          { value: "no", name: "No, déjala", description: "vuelve sin tocar el historial" },
          {
            value: "si",
            name: pc.red("Sí, bórrala"),
            description:
              "irreversible: no hay papelera ni copia, y sus respuestas no se pueden reconstruir",
          },
        ],
        theme: promptTheme,
      },
      { signal },
    ),
  );
  if (confirmado !== "si") {
    console.log(pc.dim("\n  No se ha borrado nada.\n"));
    return;
  }

  saveHistory(historyPath, borrado.history);

  const quedan = borrado.history.length;
  const medidas = measurements(borrado.history).length;
  console.log(
    `\n  ${pc.green("✓")} Borrada la sesión de ${fecha(borrado.deleted.timestamp)} ` +
      `(${borrado.deleted.kind === "review" ? "repaso" : "medición"}, ` +
      `${borrado.deleted.correct}/${borrado.deleted.answered} aciertos).`,
  );
  console.log(
    pc.dim(
      `  Quedan ${quedan} sesión(es) en ${historyPath} — ${medidas} de medición.` +
        (borrado.cambiaLaEvolucion
          ? "\n  · Era tu última medición: la evolución vuelve a comparar contra la anterior."
          : ""),
    ) + "\n",
  );
}
