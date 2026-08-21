import pc from "picocolors";
import { select } from "@inquirer/prompts";
import { loadHistory } from "../../content/history.js";
import {
  defaultPackLocator,
  historyPath as historyPathOf,
  pausedPath,
} from "../../content/paths.js";
import { loadPaused, savePaused } from "../../content/paused.js";
import { selectBalanced, shuffleOptions } from "../../core/session.js";
import { makeSeededShuffle } from "../../core/random.js";
import { ESCAPED, ESC_HINT, withEscape } from "../keys.js";
import { runSession } from "../runner.js";
import { avisoPausa, reanudarSesion } from "./resume.js";
import { finishMeasureSession } from "../session-finish.js";
import { describeSetup, resolveSetup, sampleWarning, type SetupOptions } from "../setup.js";
import { heading, promptTheme } from "../theme.js";

// Test LARGO por defecto: para evaluar en serio a través de los rangos de
// seniority (junior→staff) hace falta bastante muestra por dimensión y dificultad.
// Con el banco lleno (~50/dim) esto toma ~24/dim (~120 preguntas); con bancos
// menores toma gran parte de cada dimensión. selectBalanced acota por pool.
const SESSION_TARGET_QUESTIONS = 120;
const MIN_PER_DIMENSION = 20;

/**
 * Compone la sesión end-to-end sobre el pack elegido: asistente (qué pack, qué
 * dimensiones, qué dificultad) → seleccionar equilibrado → barajar opciones →
 * sesión select navegable → puntuar → renderizar (dimensiones, calibración, y si
 * el pack trae readiness: readiness por rol + gaps). Persiste la sesión (historial
 * por pack) y muestra la evolución. La aleatoriedad/reloj viven aquí, en la capa
 * de I/O. `readiness.yaml` es opcional: un pack de cualquier tema puede traer solo
 * preguntas.
 */
/** Qué ha pasado con la sesión, para que el menú sepa si conviene pausar. */
export type StartOutcome = "completada" | "pausada" | "cancelada" | "error";

export async function startCommand(
  opts: SetupOptions = { interactive: true },
): Promise<StartOutcome> {
  let setup;
  try {
    setup = await resolveSetup(defaultPackLocator(), opts, SESSION_TARGET_QUESTIONS);
  } catch (err) {
    console.error(
      `\n✗ No se puede iniciar la sesión: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return "error";
  }
  if (setup === null) {
    console.log(pc.dim("\n  Sesión cancelada antes de empezar. No se ha guardado nada.\n"));
    return "cancelada";
  }

  const { packName, packDir } = setup;

  // Aislamiento por tema: cada pack tiene su carpeta de contenido y su carpeta de
  // resultados, y nunca se cruzan entre temas. Dónde están cada una lo decide
  // paths.ts: instalado, el contenido viene del paquete y los datos NO.
  const historyPath = historyPathOf(packName);
  const rutaPausa = pausedPath(packName);

  let pausada;
  try {
    // Las dos se leen ANTES de la sesión para fallar rápido si algo está corrupto:
    // enterarse después de responder 120 preguntas sería enterarse tarde.
    loadHistory(historyPath);
    pausada = loadPaused(rutaPausa);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ No se puede iniciar la sesión: ${msg}`);
    process.exitCode = 1;
    return "error";
  }

  // Hay una sesión de este pack a medias. Empezar otra encima sin decir nada la
  // dejaría ahí para siempre, olvidada; y descartarla sin preguntar tiraría un
  // trabajo que se guardó a propósito.
  if (pausada !== null) {
    const quiere = await preguntarSiRetoma(packName, pausada.timestamp, opts);
    if (quiere === "cancelar") {
      console.log(pc.dim("\n  Sesión cancelada. La pausa sigue donde estaba.\n"));
      return "cancelada";
    }
    if (quiere === "retomar") return await reanudarSesion(packName, packDir);
    // "nueva": la pausa se queda en disco hasta que se retome o se pause otra
    // encima. Nada de borrarla por haber empezado otro test.
  }

  console.log("\n" + heading("Sesión") + "\n" + describeSetup(setup));

  // Si el filtro deja una muestra que no da para concluir nada, se dice ANTES de
  // responder 40 preguntas y no al final escondido en un N pequeño.
  const aviso = sampleWarning(setup.bank, setup.target);
  if (aviso !== null) console.log(`  ${pc.yellow("⚠")} ${pc.yellow(aviso)}`);
  console.log("");

  const seed = Date.now() >>> 0;
  const shuffle = makeSeededShuffle(seed);

  // El mínimo por dimensión no puede pasarse del total pedido: si no, elegir
  // "sesión corta" devolvería igualmente el mínimo × nº de dimensiones.
  const dimsEnBanco = new Set(setup.bank.map((q) => q.dimension)).size;
  const minPorDim = Math.max(
    1,
    Math.min(MIN_PER_DIMENSION, Math.floor(setup.target / dimsEnBanco)),
  );

  // Barajar las opciones al presentar: el banco tiene la correcta casi siempre la
  // primera (sesgo de quien las escribe), y sin esto el test se adivina por
  // posición. Los ids no se tocan, así que el scoring y el historial no se enteran.
  const selected = shuffleOptions(
    selectBalanced(setup.bank, setup.target, minPorDim, shuffle),
    shuffle,
  );

  const outcome = await runSession(selected, { pausable: true });

  switch (outcome.tipo) {
    case "abandonada":
      // Descartada a propósito: no se puntúa ni se guarda nada. Decirlo importa —
      // dejar la terminal en silencio haría dudar de si se ha guardado algo.
      console.log(pc.dim("\n  Sesión descartada. No se ha guardado ningún resultado.\n"));
      return "cancelada";

    case "pausada":
      savePaused(rutaPausa, {
        pack: packName,
        kind: "measure",
        timestamp: new Date().toISOString(),
        snapshot: outcome.snapshot,
      });
      // `pausada` es la que había ANTES de empezar esta: si existía, quiere decir
      // que se eligió "empezar una sesión nueva" y esta acaba de ocupar su sitio.
      console.log(
        avisoPausa(packName, outcome.snapshot.answers.length, pausada?.timestamp ?? null),
      );
      return "pausada";

    default:
      // Completada o cortada en la pregunta que sea: las dos se puntúan y se
      // guardan igual. Lo único que cambia es que la parcial lo dice.
      await finishMeasureSession(packName, packDir, outcome.questions, outcome.answered, {
        parcial: outcome.tipo === "parcial",
        seleccionadas: selected.length,
      });
      return "completada";
  }
}

/**
 * Qué hacer con una sesión de este pack que quedó en pausa. Sin terminal (scripts,
 * CI, `--yes`) no se pregunta y se empieza una nueva: un prompt bloqueando un
 * script sería peor que la duda, y la pausa no se toca.
 */
async function preguntarSiRetoma(
  packName: string,
  cuando: string,
  opts: SetupOptions,
): Promise<"retomar" | "nueva" | "cancelar"> {
  const interactivo = opts.interactive !== false && process.stdin.isTTY === true;
  if (!interactivo) return "nueva";

  const fecha = new Date(cuando).toLocaleString("es-ES");
  console.log("");
  const eleccion = await withEscape((signal) =>
    select(
      {
        message:
          pc.bold(`  Tienes una sesión de '${packName}' en pausa (${fecha}).`) +
          pc.dim(`  (${ESC_HINT})`),
        choices: [
          {
            value: "retomar",
            name: "Retomarla donde la dejaste",
            description: "mismas preguntas, mismo orden, con tus respuestas puestas",
          },
          {
            value: "nueva",
            name: "Empezar una sesión nueva",
            description: "la pausa se queda guardada; podrás retomarla después",
          },
        ],
        theme: promptTheme,
      },
      { signal },
    ),
  );

  if (eleccion === ESCAPED) return "cancelar";
  return eleccion === "retomar" ? "retomar" : "nueva";
}
