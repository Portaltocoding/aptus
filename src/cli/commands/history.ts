import { select } from "@inquirer/prompts";
import pc from "picocolors";
import { loadHistory, saveHistory } from "../../content/history.js";
import { historyPath as historyPathOf } from "../../content/paths.js";
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
    console.log(`\nAún no hay sesiones guardadas para el pack '${packName}'. Completa una con \`aptus start --pack ${packName}\`.\n`);
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
  console.log(`\nHistorial de '${packName}': ${medidas.length} sesión(es) de medición${repasosLinea}.`);
  console.log(`  Primera medición: ${medidas[0]!.timestamp}`);
  console.log(`  Última medición:  ${medidas[medidas.length - 1]!.timestamp}\n`);
  console.log(renderEvolution(evolution(history)) + "\n");
  console.log(pc.dim(`  · Borrar una sesión: \`aptus history --pack ${packName} --delete\`\n`));
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
