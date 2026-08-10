import pc from "picocolors";
import { loadPackDir } from "../../content/loader.js";
import { packDirForRead, pausedPath } from "../../content/paths.js";
import {
  clearPaused,
  loadPaused,
  pausedPacks,
  restorePaused,
  savePaused,
} from "../../content/paused.js";
import { runSession } from "../runner.js";
import { finishMeasureSession, resumeHeading } from "../session-finish.js";
import { heading } from "../theme.js";

/**
 * Subcomando `resume`: retoma la sesión que dejaste a medias.
 *
 * Reanudar NO es empezar otra vez: se recuperan las mismas preguntas, en el mismo
 * orden, con las mismas opciones en el mismo sitio y con tus respuestas puestas.
 * El cursor vuelve a donde lo dejaste, y desde ahí puedes seguir, volver atrás,
 * terminar y evaluar, o pausar otra vez.
 *
 * Y termina exactamente igual que una sesión de un tirón: mismo scoring, mismo
 * historial, mismo repaso de fallos (`session-finish.ts`). Una sesión pausada no
 * es un resultado de segunda.
 */
export type ResumeOutcome = "completada" | "pausada" | "cancelada" | "error";

/** Qué pack retomar cuando no se dice: el único que hay a medias, si es que hay uno. */
export function elegirPackPausado(pausados: readonly string[]): string | null {
  return pausados.length === 1 ? pausados[0]! : null;
}

export async function resumeCommand(packName?: string): Promise<ResumeOutcome> {
  const pausados = pausedPacks();

  const pack = packName ?? elegirPackPausado(pausados);
  if (pack === null) {
    if (pausados.length === 0) {
      console.log(
        "\n  No hay ninguna sesión en pausa.\n" +
          pc.dim(
            "  Se crea una saliendo de una sesión con ESC → «Pausar y seguir en otro momento».\n",
          ),
      );
    } else {
      console.log(
        `\n  Hay sesiones en pausa de varios packs: ${pausados.join(", ")}.\n` +
          pc.dim("  Di cuál: `aptus resume --pack <nombre>`.\n"),
      );
    }
    return "cancelada";
  }

  const packDir = packDirForRead(pack);
  if (packDir === null) {
    console.error(`\n✗ No se puede retomar: no existe el pack '${pack}'.`);
    process.exitCode = 1;
    return "error";
  }

  return await reanudarSesion(pack, packDir);
}

/**
 * El cuerpo de la reanudación, para que `start` pueda ofrecerla cuando detecta una
 * pausa del pack que acabas de elegir sin duplicar nada de esto.
 */
export async function reanudarSesion(pack: string, packDir: string): Promise<ResumeOutcome> {
  const ruta = pausedPath(pack);

  let pausada;
  let banco;
  try {
    pausada = loadPaused(ruta);
    banco = loadPackDir(packDir).questions;
  } catch (err) {
    console.error(
      `\n✗ No se puede retomar la sesión: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return "error";
  }

  if (pausada === null) {
    console.log(`\n  No hay ninguna sesión en pausa de '${pack}'.\n`);
    return "cancelada";
  }

  const { questions, missing } = restorePaused(banco, pausada.snapshot);
  if (questions.length === 0) {
    console.log(
      `\n  La sesión en pausa de '${pack}' ya no tiene ninguna pregunta viva en el pack: se descarta.\n`,
    );
    clearPaused(ruta);
    return "cancelada";
  }

  const respondidas = pausada.snapshot.answers.filter(([id]) =>
    questions.some((q) => q.id === id),
  ).length;

  console.log("\n" + resumeHeading(respondidas, questions.length, pausada.timestamp));
  // Callarse las preguntas que el pack perdió haría la sesión más corta sin decir
  // por qué, justo el tipo de diferencia silenciosa que hace dudar de un número.
  if (missing.length > 0) {
    console.log(
      pc.yellow(
        `  ⚠ ${missing.length} pregunta(s) ya no están en el pack (editadas o retiradas): se caen de la sesión.`,
      ),
    );
  }
  console.log("");

  const outcome = await runSession(questions, { pausable: true, resume: pausada.snapshot });

  switch (outcome.tipo) {
    case "abandonada":
      // Descartar al retomar sí borra la pausa: has dicho que no la quieres.
      clearPaused(ruta);
      console.log(pc.dim("\n  Sesión descartada. No se ha guardado ningún resultado.\n"));
      return "cancelada";

    case "pausada":
      savePaused(ruta, {
        pack,
        kind: "measure",
        timestamp: new Date().toISOString(),
        snapshot: outcome.snapshot,
      });
      console.log(avisoPausa(pack, outcome.snapshot.answers.length));
      return "pausada";

    default:
      // Completada o cortada a propósito: en las dos hay resultado, así que la
      // pausa deja de existir.
      clearPaused(ruta);
      await finishMeasureSession(pack, packDir, outcome.questions, outcome.answered, {
        parcial: outcome.tipo === "parcial",
        seleccionadas: questions.length,
      });
      return "completada";
  }
}

/**
 * Lo que se dice al pausar: dónde ha quedado y cómo se vuelve.
 *
 * `sustituye` es la fecha de la pausa que esta reemplaza, si había otra distinta.
 * Hay UNA pausa por pack, así que empezar una sesión nueva teniendo otra a medias
 * y pausar la nueva se lleva por delante la vieja. Callarlo sería perder trabajo
 * guardado en silencio, que es justo lo que la pausa existe para evitar.
 */
export function avisoPausa(pack: string, respondidas: number, sustituye?: string | null): string {
  const reemplazo =
    sustituye != null
      ? pc.yellow(
          `  ⚠ Sustituye a la sesión que tenías en pausa del ${new Date(sustituye).toLocaleString("es-ES")}:\n` +
            "    solo se guarda una por pack, y esa ya no se puede retomar.\n",
        )
      : "";

  return (
    "\n" +
    heading("Sesión en pausa") +
    "\n" +
    `  Guardadas ${respondidas} respuesta(s) de '${pack}'. No se ha puntuado nada todavía.\n` +
    reemplazo +
    pc.dim(`  Retómala con \`aptus resume --pack ${pack}\`, o desde el menú.\n`)
  );
}
