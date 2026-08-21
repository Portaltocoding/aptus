import { input, select } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { listPackEntries } from "../content/paths.js";
import { pausedPacks } from "../content/paused.js";
import { hasApiCredentials } from "../content/draft.js";
import { startCommand } from "./commands/start.js";
import { resumeCommand } from "./commands/resume.js";
import { reviewCommand } from "./commands/review.js";
import { historyCommand } from "./commands/history.js";
import { reportCommand } from "./commands/report.js";
import { packsCommand } from "./commands/packs.js";
import { verifyPackCommand } from "./commands/verify-pack.js";
import { jdCommand } from "./commands/jd.js";
import { jobsCommand } from "./commands/jobs.js";
import { ingestCommand } from "./commands/ingest.js";
import { newPackCommand } from "./commands/new-pack.js";
import { temaCommand } from "./commands/tema.js";
import { draftCommand, promoteCommand } from "./commands/draft.js";
import { ESCAPED, ESC_HINT, withEscape } from "./keys.js";
import {
  expandirRuta,
  nextMenuStep,
  nextTrasEjecutar,
  type Invocacion,
  type MenuAction,
  type MenuPrompt,
  type Next,
} from "./menu-flow.js";
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
    value: "repasar-fallos",
    name: "Repasar los fallos de una sesión",
    description: "Qué fallaste, qué era lo correcto y por qué — con la explicación del pack.",
  },
  {
    value: "borrar-sesion",
    name: "Borrar una sesión",
    description: "Quitar una sesión concreta del historial. No se puede deshacer.",
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
    value: "tema",
    name: "Generar un tema nuevo",
    description: "De un tema a un pack entero: investiga, lo parte y escribe los borradores.",
  },
  {
    value: "ingest",
    name: "Ingerir material",
    description: "Una carpeta → el brief de un pack nuevo.",
  },
  {
    value: "new-pack",
    name: "Crear un pack nuevo",
    description: "El esqueleto de un tema: pack.yaml, questions/ y sources/.",
  },
  {
    value: "draft",
    name: "Borrador de preguntas con LLM",
    description: "Lo único que sale a la red: necesita ANTHROPIC_API_KEY.",
  },
  {
    value: "promote",
    name: "Promover un borrador",
    description: "drafts/ → questions/: lo hace evaluable. Léelo antes.",
  },
  { value: "salir", name: "Salir", description: "Cerrar aptus." },
];

/** La acción de retomar, que solo existe si hay algo que retomar. */
const RETOMAR: { value: MenuAction; name: string; description: string } = {
  value: "resume",
  name: "Retomar la sesión en pausa",
  description: "Sigue donde la dejaste: mismas preguntas y tus respuestas puestas.",
};

/**
 * Las opciones del menú para el estado de HOY. "Retomar" va la primera y solo
 * aparece cuando hay una sesión a medias: una entrada permanente que casi siempre
 * dice "no hay nada" es ruido, y tener un test a medias es justo lo que quieres
 * ver en cuanto abres el programa.
 */
export function menuChoices(
  pausados: readonly string[],
): { value: MenuAction; name: string; description: string }[] {
  return pausados.length > 0 ? [RETOMAR, ...CHOICES] : [...CHOICES];
}

/** Pregunta un pack de los que hay, con ESC para volver. */
async function askPack(mensaje: string): Promise<string | typeof ESCAPED> {
  const nombres = listPackEntries().map((e) => e.name);
  // Sin packs no hay nada que elegir. Antes se devolvía el nombre del pack que
  // aptus traía de fábrica, y el menú seguía adelante hacia un "no existe el pack"
  // más abajo; ahora se dice aquí, que es donde se sabe, y se vuelve al menú.
  if (nombres.length === 0) {
    console.log(
      "\n" +
        pc.yellow("  Todavía no tienes ningún pack.") +
        pc.dim(
          `  aptus viene vacío: los temas los pones tú.\n` +
            '    Genera uno con `aptus tema <tema>`, o desde "Crear un pack nuevo" en este menú.\n',
        ),
    );
    return ESCAPED;
  }
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

/** Traduce un sub-prompt del plan a su prompt real. `ESCAPED` si se sale con ESC. */
async function preguntar(prompt: MenuPrompt): Promise<string | typeof ESCAPED> {
  switch (prompt.id) {
    case "pack":
      return await askPack(prompt.mensaje);

    case "packPausado":
      return await withEscape((signal) =>
        select(
          {
            message: pc.bold(`  ${prompt.mensaje}`) + pc.dim(`  (${ESC_HINT})`),
            choices: prompt.opciones.map((n) => ({ value: n, name: n })),
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "rutaOferta":
    case "rutaMaterial":
    case "carpeta": {
      const ruta = await askPath(prompt.mensaje);
      return ruta === ESCAPED ? ESCAPED : expandirRuta(ruta, process.env.HOME);
    }

    case "nombrePack":
      return await withEscape((signal) =>
        input(
          {
            message:
              pc.bold("  ¿Nombre del pack destino?") + pc.dim("  (enter = el de la carpeta)"),
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "nombreTema":
      return await withEscape((signal) =>
        input(
          {
            message: pc.bold("  ¿De qué tema?") + pc.dim("  (minúsculas y guiones: redes-tcp-ip)"),
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "materialDelTema":
      // Admite vacío a propósito: no tener material es el caso normal, y de eso
      // va el comando. Por eso NO se usa `askPath`, que exige una ruta que exista.
      return await withEscape((signal) =>
        input(
          {
            message:
              pc.bold("  ¿Carpeta con material tuyo?") +
              pc.dim("  (enter = que lo investigue el modelo)"),
            theme: promptTheme,
            validate: (v: string) => {
              const t = v.trim();
              if (t.length === 0) return true;
              return existsSync(expandirRuta(t, process.env.HOME)) ? true : "No existe esa ruta.";
            },
          },
          { signal },
        ),
      ).then((r) => (r === ESCAPED || r.trim().length === 0 ? r : expandirRuta(r, process.env.HOME)));

    case "nombreNuevoPack":
      return await withEscape((signal) =>
        input(
          {
            message:
              pc.bold("  ¿Cómo se llama el pack?") +
              pc.dim(`  (minúsculas, números y guiones · ${ESC_HINT})`),
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "dimension":
      return await withEscape((signal) =>
        input(
          {
            message: pc.bold(`  ${prompt.mensaje}`) + pc.dim(`  (${ESC_HINT})`),
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "confirmarPromote":
      // La pregunta va con el aviso dentro: promover es lo que convierte un
      // borrador en algo que te mide, y decir "sí" sin haberlo leído es
      // exactamente la mentira que aptus existe para no contarte.
      return await withEscape((signal) =>
        select(
          {
            message:
              pc.bold(`  ¿Has leído entero el borrador de '${prompt.dimension}'?`) +
              pc.dim(`  (${ESC_HINT})`),
            choices: [
              {
                value: "no",
                name: "Todavía no",
                description: `léelo en ${prompt.pack}/drafts/${prompt.dimension}.yaml — mientras siga ahí, no te evalúa`,
              },
              {
                value: "si",
                name: "Sí: respuesta marcada y explicación, una a una",
                description:
                  "promuévelo — la auditoría mira la forma, no si la respuesta correcta lo es",
              },
            ],
            theme: promptTheme,
          },
          { signal },
        ),
      );

    case "modoJd":
      return await withEscape((signal) =>
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

    case "cruzarMaterial":
      return await withEscape((signal) =>
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
  }
}

/** Ejecuta una invocación ya resuelta. Aquí no se decide nada: solo se llama. */
async function ejecutar(invocacion: Invocacion): Promise<string | null> {
  switch (invocacion.comando) {
    case "start":
      // El asistente de la sesión pregunta el pack por su cuenta.
      return await startCommand({ interactive: true });
    case "resume":
      return await resumeCommand(invocacion.pack);
    case "review":
      await reviewCommand(invocacion.pack);
      return null;
    case "history":
      await historyCommand(invocacion.pack);
      return null;
    case "borrar-sesion":
      // Mismo comando que `aptus history --delete`: el menú no reimplementa ni la
      // lista, ni la confirmación, ni el borrado.
      await historyCommand(invocacion.pack, { delete: true });
      return null;
    case "repasar-fallos":
      // Igual: `aptus history --review`. El selector de sesión es el mismo.
      await historyCommand(invocacion.pack, { review: true });
      return null;
    case "report":
      await reportCommand(invocacion.pack);
      return null;
    case "verify":
      await verifyPackCommand(invocacion.pack);
      return null;
    case "packs":
      await packsCommand();
      return null;
    case "jobs":
      await jobsCommand(invocacion.pack, invocacion.limite);
      return null;
    case "jd":
      await jdCommand(invocacion.ruta, {
        pack: invocacion.pack,
        brief: invocacion.brief,
        memoria: invocacion.memoria ?? undefined,
      });
      return null;
    case "ingest":
      await ingestCommand(invocacion.carpeta, {
        pack: invocacion.pack ?? undefined,
        copy: true,
      });
      return null;
    case "tema":
      await temaCommand(invocacion.nombre, {
        material: invocacion.material ?? undefined,
        count: invocacion.cantidad,
      });
      return null;
    case "new-pack":
      await newPackCommand(invocacion.nombre);
      return null;
    case "draft":
      await draftCommand(invocacion.pack, {
        dimension: invocacion.dimension,
        count: invocacion.cantidad,
      });
      return null;
    case "promote":
      await promoteCommand(invocacion.pack, invocacion.dimension);
      return null;
  }
}

/**
 * Recorre el asistente de la acción: pregunta lo que pida el plan y ejecuta cuando
 * ya no pide más. ESC en CUALQUIER sub-prompt cancela la acción entera — esa regla
 * vive en el plan, no repartida por aquí.
 */
async function dispatch(action: MenuAction): Promise<Next> {
  const respuestas: string[] = [];
  // Se relee en cada acción y no una vez al arrancar: acabas de terminar la sesión
  // que estaba pausada, y el menú tiene que enterarse.
  const ctx = { tieneApiKey: hasApiCredentials(), packsPausados: pausedPacks() };

  for (;;) {
    const paso = nextMenuStep(action, respuestas, ctx);
    if (paso.tipo === "salir") return "salir";
    if (paso.tipo === "aviso") {
      console.log("\n" + heading(paso.titulo));
      console.log(pc.dim("\n  " + paso.cuerpo + "\n"));
      return "pausar";
    }
    if (paso.tipo === "ejecutar") {
      return nextTrasEjecutar(paso.invocacion, await ejecutar(paso.invocacion));
    }

    const respuesta = await preguntar(paso.prompt);
    if (respuesta === ESCAPED) return "volver";
    respuestas.push(respuesta);
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
            choices: menuChoices(pausedPacks()),
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
