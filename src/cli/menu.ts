import { input, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import pc from "picocolors";
import { listPackEntries } from "../content/paths.js";
import { startCommand, DEFAULT_PACK } from "./commands/start.js";
import { reviewCommand } from "./commands/review.js";
import { historyCommand } from "./commands/history.js";
import { reportCommand } from "./commands/report.js";
import { packsCommand } from "./commands/packs.js";
import { verifyPackCommand } from "./commands/verify-pack.js";
import { jdCommand } from "./commands/jd.js";
import { jobsCommand } from "./commands/jobs.js";
import { ingestCommand } from "./commands/ingest.js";
import { ESCAPED, ESC_HINT, withEscape } from "./keys.js";
import { heading, promptTheme } from "./theme.js";

/**
 * Menú principal: la pantalla a la que se vuelve.
 *
 * Antes, `aptus` a secas escupía la ayuda de commander y cada cosa era un comando
 * que había que saberse. Eso está bien para automatizar, pero deja el CLI sin un
 * sitio al que volver: equivocarte en un paso del asistente significaba Ctrl+C y
 * empezar desde la terminal.
 *
 * Aquí ESC y "Salir" hacen lo mismo, y cada acción devuelve al menú al terminar.
 * Los comandos con flags siguen existiendo exactamente igual: este menú los llama,
 * no los reimplementa.
 */

type MenuAction =
  | "start"
  | "review"
  | "history"
  | "report"
  | "jd"
  | "jobs"
  | "packs"
  | "verify"
  | "ingest"
  | "salir";

const CHOICES: { value: MenuAction; name: string; description: string }[] = [
  {
    value: "start",
    name: "Empezar una sesión",
    description: "Medir: eliges pack, dimensiones y dificultad.",
  },
  {
    value: "review",
    name: "Repasar",
    description: "Estudiar lo que peor llevas con repetición espaciada. No mide.",
  },
  {
    value: "history",
    name: "Ver el historial",
    description: "Sesiones guardadas y evolución entre ellas.",
  },
  {
    value: "report",
    name: "Informe HTML",
    description: "Informe local y autocontenido, sin salir a la red.",
  },
  {
    value: "jd",
    name: "Evaluar una oferta",
    description: "Tu readiness contra una oferta concreta (o su brief).",
  },
  {
    value: "jobs",
    name: "Ofertas de jobhunt",
    description: "Escaneo en bloque de las ofertas ya guardadas.",
  },
  {
    value: "packs",
    name: "Ver los packs",
    description: "Qué temas hay disponibles para evaluarse.",
  },
  {
    value: "verify",
    name: "Auditar un pack",
    description: "Control de calidad del banco: curadas, no relleno.",
  },
  {
    value: "ingest",
    name: "Ingerir material",
    description: "Una carpeta → el brief de un pack nuevo.",
  },
  { value: "salir", name: "Salir", description: "Cerrar aptus." },
];

/** Pregunta un pack de los que hay, con ESC para volver. */
async function askPack(mensaje: string): Promise<string | typeof ESCAPED> {
  // Las dos raíces a la vez: los packs del producto y los tuyos.
  const nombres = listPackEntries().map((e) => e.name);
  if (nombres.length === 0) return DEFAULT_PACK;
  if (nombres.length === 1) return nombres[0]!;

  return await withEscape((signal) =>
    select(
      {
        message: pc.bold(`  ${mensaje}`) + pc.dim(`  (${ESC_HINT})`),
        choices: nombres.map((n) => ({ value: n, name: n })),
        theme: promptTheme,
      },
      { signal },
    ),
  );
}

/** Pide una ruta que exista, con ESC para volver. */
async function askPath(mensaje: string): Promise<string | typeof ESCAPED> {
  const { existsSync } = await import("node:fs");
  return await withEscape((signal) =>
    input(
      {
        message: pc.bold(`  ${mensaje}`) + pc.dim(`  (${ESC_HINT})`),
        theme: promptTheme,
        validate: (v: string) => {
          const t = v.trim();
          if (t.length === 0) return "Escribe una ruta.";
          return existsSync(resolve(t.replace(/^~/, process.env.HOME ?? "~")))
            ? true
            : "No existe esa ruta.";
        },
      },
      { signal },
    ),
  );
}

const expandir = (v: string): string => resolve(v.trim().replace(/^~/, process.env.HOME ?? "~"));

/**
 * Qué hacer tras la acción. `volver` es para lo que se ha cancelado a mitad: no
 * hay nada que leer, así que pedir "enter para volver al menú" sería ruido.
 */
type Next = "salir" | "volver" | "pausar";

/** Ejecuta la acción elegida. */
async function dispatch(action: MenuAction): Promise<Next> {
  switch (action) {
    case "salir":
      return "salir";

    case "start": {
      // El asistente de la sesión pregunta el pack por su cuenta.
      const outcome = await startCommand({ interactive: true });
      return outcome === "cancelada" ? "volver" : "pausar";
    }

    case "review": {
      const pack = await askPack("¿Qué pack repasar?");
      if (pack === ESCAPED) return "volver";
      await reviewCommand(pack);
      return "pausar";
    }

    case "history": {
      const pack = await askPack("¿Historial de qué pack?");
      if (pack === ESCAPED) return "volver";
      await historyCommand(pack);
      return "pausar";
    }

    case "report": {
      const pack = await askPack("¿Informe de qué pack?");
      if (pack === ESCAPED) return "volver";
      await reportCommand(pack);
      return "pausar";
    }

    case "packs":
      await packsCommand();
      return "pausar";

    case "verify": {
      const pack = await askPack("¿Qué pack auditar?");
      if (pack === ESCAPED) return "volver";
      await verifyPackCommand(pack);
      return "pausar";
    }

    case "jobs": {
      const pack = await askPack("¿Con qué pack evaluarlas?");
      if (pack === ESCAPED) return "volver";
      await jobsCommand(pack, 20);
      return "pausar";
    }

    case "jd": {
      const ruta = await askPath("¿Dónde está el fichero de la oferta?");
      if (ruta === ESCAPED) return "volver";
      const pack = await askPack("¿Con qué pack evaluarla?");
      if (pack === ESCAPED) return "volver";

      const modo = await withEscape((signal) =>
        select(
          {
            message: pc.bold("  ¿Qué quieres de esa oferta?") + pc.dim(`  (${ESC_HINT})`),
            choices: [
              {
                value: "evaluar",
                name: "Tu readiness para ese puesto",
                description: "usa tu última sesión de medición",
              },
              {
                value: "brief",
                name: "El brief del pack que haría falta",
                description: "qué pide y nadie mide — el índice del tema que te falta",
              },
            ],
            theme: promptTheme,
          },
          { signal },
        ),
      );
      if (modo === ESCAPED) return "volver";

      let memoria: string | undefined;
      if (modo === "brief") {
        const conMemoria = await withEscape((signal) =>
          select(
            {
              message: pc.bold("  ¿Cruzarlo con material tuyo?") + pc.dim(`  (${ESC_HINT})`),
              choices: [
                { value: "no", name: "No, solo la oferta" },
                {
                  value: "si",
                  name: "Sí, dime dónde está mi material",
                  description: "notas, vault, apuntes — no se copian",
                },
              ],
              theme: promptTheme,
            },
            { signal },
          ),
        );
        if (conMemoria === ESCAPED) return "volver";
        if (conMemoria === "si") {
          const ruta2 = await askPath("¿Dónde está tu material?");
          if (ruta2 === ESCAPED) return "volver";
          memoria = expandir(ruta2);
        }
      }

      await jdCommand(expandir(ruta), { pack, brief: modo === "brief", memoria });
      return "pausar";
    }

    case "ingest": {
      const carpeta = await askPath("¿Qué carpeta ingiero?");
      if (carpeta === ESCAPED) return "volver";
      const nombre = await withEscape((signal) =>
        input(
          {
            message:
              pc.bold("  ¿Nombre del pack destino?") + pc.dim("  (enter = el de la carpeta)"),
            theme: promptTheme,
          },
          { signal },
        ),
      );
      if (nombre === ESCAPED) return "volver";

      await ingestCommand(expandir(carpeta), {
        pack: nombre.trim().length > 0 ? nombre.trim() : undefined,
        copy: true,
      });
      return "pausar";
    }
  }
}

/** Pausa para poder leer lo que acaba de salir antes de repintar el menú. */
async function pausa(): Promise<void> {
  if (process.stdin.isTTY !== true) return;
  await withEscape((signal) =>
    input({ message: pc.dim("  enter para volver al menú"), theme: promptTheme }, { signal }),
  );
}

/**
 * Bucle del menú. Sale con "Salir", con ESC o con Ctrl+C — las tres cosas hacen lo
 * mismo, que es lo que uno espera de una pantalla principal.
 */
export async function mainMenu(): Promise<void> {
  try {
    for (;;) {
      console.log("\n" + heading("aptus"));
      console.log(
        pc.dim("  Motor de evaluación por terminal. Cada tema es un pack de conocimiento.\n"),
      );

      const action = await withEscape((signal) =>
        select<MenuAction>(
          {
            message: pc.bold("  ¿Qué hacemos?") + pc.dim(`  (${ESC_HINT} · salir)`),
            choices: CHOICES,
            theme: promptTheme,
            pageSize: 12,
          },
          { signal },
        ),
      );

      if (action === ESCAPED) {
        console.log(pc.dim("\nHasta luego.\n"));
        return;
      }

      const next = await dispatch(action);
      if (next === "salir") {
        console.log(pc.dim("\nHasta luego.\n"));
        return;
      }
      if (next === "pausar") await pausa();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") {
      console.log(pc.dim("\nHasta luego.\n"));
      return;
    }
    throw err;
  }
}
