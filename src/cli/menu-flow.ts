import { PACK_NAME_RE } from "../content/paths.js";
import { ESCAPED, type Escapable } from "./keys.js";

/**
 * Lógica de decisión del menú principal: PURA, y en la capa CLI por lo mismo que
 * `session-flow.ts` — sabe de ESC y de "volver al menú", que son conceptos de
 * interfaz. Aquí no se ejecuta ningún comando ni se toca disco: entra qué se ha
 * elegido, sale qué habría que ejecutar.
 *
 * El menú es una secuencia de sub-prompts por acción (pack, ruta, modo...) y una
 * regla que atraviesa a todos: ESC en CUALQUIERA de ellos vuelve al menú sin
 * ejecutar nada. Esa regla es fácil de romper añadiendo un sub-prompt nuevo y
 * olvidando su `if (x === ESCAPED) return "volver"`, y hasta ahora no había forma
 * de comprobarla sin un terminal.
 */

export type MenuAction =
  | "start"
  | "review"
  | "history"
  | "report"
  | "jd"
  | "jobs"
  | "packs"
  | "verify"
  | "ingest"
  | "new-pack"
  | "draft"
  | "promote"
  | "borrar-sesion"
  | "repasar-fallos"
  | "salir";

/**
 * Lo que el menú necesita saber del mundo para decidir. Entra como DATO para que
 * la decisión siga siendo pura: si `draft` se puede intentar o no depende de si
 * hay credenciales, y eso se comprueba ANTES de recorrer su asistente —no después
 * de habértelo hecho entero para fallar al final.
 */
export interface MenuContext {
  tieneApiKey: boolean;
}

/** Por defecto se asume que sí: quien decide de verdad (menu.ts) lo pasa siempre. */
const CONTEXTO_POR_DEFECTO: MenuContext = { tieneApiKey: true };

/**
 * Qué hacer tras la acción. `volver` es para lo que se ha cancelado a mitad: no
 * hay nada que leer, así que pedir "enter para volver al menú" sería ruido.
 */
export type Next = "salir" | "volver" | "pausar";

/** Un sub-prompt que el menú necesita antes de poder ejecutar la acción. */
export type MenuPrompt =
  | { readonly id: "pack"; readonly mensaje: string }
  | { readonly id: "rutaOferta"; readonly mensaje: string }
  | { readonly id: "modoJd" }
  | { readonly id: "cruzarMaterial" }
  | { readonly id: "rutaMaterial"; readonly mensaje: string }
  | { readonly id: "carpeta"; readonly mensaje: string }
  | { readonly id: "nombrePack" }
  | { readonly id: "nombreNuevoPack" }
  | { readonly id: "dimension"; readonly mensaje: string }
  | { readonly id: "confirmarPromote"; readonly pack: string; readonly dimension: string };

/** Lo que hay que ejecutar cuando ya están todas las respuestas. */
export type Invocacion =
  | { readonly comando: "start" }
  | { readonly comando: "packs" }
  | { readonly comando: "review" | "history" | "report" | "verify"; readonly pack: string }
  | { readonly comando: "jobs"; readonly pack: string; readonly limite: number }
  | {
      readonly comando: "jd";
      readonly ruta: string;
      readonly pack: string;
      readonly brief: boolean;
      readonly memoria: string | null;
    }
  | { readonly comando: "ingest"; readonly carpeta: string; readonly pack: string | null }
  | { readonly comando: "new-pack"; readonly nombre: string }
  | {
      readonly comando: "draft";
      readonly pack: string;
      readonly dimension: string;
      readonly cantidad: number;
    }
  | { readonly comando: "promote"; readonly pack: string; readonly dimension: string }
  | { readonly comando: "borrar-sesion" | "repasar-fallos"; readonly pack: string };

export type MenuStep =
  | { readonly tipo: "preguntar"; readonly prompt: MenuPrompt }
  | { readonly tipo: "ejecutar"; readonly invocacion: Invocacion }
  | { readonly tipo: "salir" }
  /**
   * No se ejecuta nada y se explica por qué. Es un paso de primera clase y no un
   * `console.log` suelto porque las dos razones por las que aquí NO se sigue —no
   * hay credenciales para `draft`, no has leído el borrador que ibas a promover—
   * son decisiones, y las decisiones del menú se testean.
   */
  | { readonly tipo: "aviso"; readonly titulo: string; readonly cuerpo: string };

/** Cuántas ofertas escanea `jobs` desde el menú (el comando con flags admite otro). */
const JOBS_LIMITE = 20;

/** Cuántas preguntas pide `draft` desde el menú (el mismo defecto que el flag `-n`). */
const DRAFT_CANTIDAD = 12;

/**
 * Siguiente paso de una acción dadas las respuestas ya recogidas, en orden.
 *
 * Es una función de las respuestas, no un generador con estado: así el mismo
 * prefijo de respuestas produce siempre el mismo paso, y un test puede plantarse
 * en cualquier punto del asistente sin simular los anteriores.
 */
export function nextMenuStep(
  action: MenuAction,
  respuestas: readonly string[],
  ctx: MenuContext = CONTEXTO_POR_DEFECTO,
): MenuStep {
  const [r0, r1, r2, r3] = respuestas;

  switch (action) {
    case "salir":
      return { tipo: "salir" };

    case "start":
      // El asistente de la sesión pregunta el pack por su cuenta.
      return { tipo: "ejecutar", invocacion: { comando: "start" } };

    case "packs":
      return { tipo: "ejecutar", invocacion: { comando: "packs" } };

    case "review":
    case "history":
    case "report":
    case "verify":
    case "borrar-sesion":
    case "repasar-fallos":
      return r0 === undefined
        ? { tipo: "preguntar", prompt: { id: "pack", mensaje: mensajePack(action) } }
        : { tipo: "ejecutar", invocacion: { comando: action, pack: r0 } };

    case "jobs":
      return r0 === undefined
        ? { tipo: "preguntar", prompt: { id: "pack", mensaje: mensajePack(action) } }
        : {
            tipo: "ejecutar",
            invocacion: { comando: "jobs", pack: r0, limite: JOBS_LIMITE },
          };

    case "jd": {
      if (r0 === undefined) {
        return {
          tipo: "preguntar",
          prompt: { id: "rutaOferta", mensaje: "¿Dónde está el fichero de la oferta?" },
        };
      }
      if (r1 === undefined) {
        return { tipo: "preguntar", prompt: { id: "pack", mensaje: "¿Con qué pack evaluarla?" } };
      }
      if (r2 === undefined) return { tipo: "preguntar", prompt: { id: "modoJd" } };
      // Evaluar no necesita nada más; el brief sí puede cruzarse con material propio.
      if (r2 !== "brief") {
        return {
          tipo: "ejecutar",
          invocacion: { comando: "jd", ruta: r0, pack: r1, brief: false, memoria: null },
        };
      }
      if (r3 === undefined) return { tipo: "preguntar", prompt: { id: "cruzarMaterial" } };
      if (r3 !== "si") {
        return {
          tipo: "ejecutar",
          invocacion: { comando: "jd", ruta: r0, pack: r1, brief: true, memoria: null },
        };
      }
      const material = respuestas[4];
      return material === undefined
        ? { tipo: "preguntar", prompt: { id: "rutaMaterial", mensaje: "¿Dónde está tu material?" } }
        : {
            tipo: "ejecutar",
            invocacion: { comando: "jd", ruta: r0, pack: r1, brief: true, memoria: material },
          };
    }

    case "ingest": {
      if (r0 === undefined) {
        return { tipo: "preguntar", prompt: { id: "carpeta", mensaje: "¿Qué carpeta ingiero?" } };
      }
      if (r1 === undefined) return { tipo: "preguntar", prompt: { id: "nombrePack" } };
      // Nombre vacío = enter = "el de la carpeta", que lo resuelve el comando.
      return {
        tipo: "ejecutar",
        invocacion: {
          comando: "ingest",
          carpeta: r0,
          pack: r1.trim().length > 0 ? r1.trim() : null,
        },
      };
    }

    case "new-pack": {
      if (r0 === undefined) return { tipo: "preguntar", prompt: { id: "nombreNuevoPack" } };
      const nombre = r0.trim();
      // El nombre compone una ruta, así que se valida aquí y no al llegar al
      // disco: el mismo criterio que `assertPackName`, dicho antes de escribir.
      if (!PACK_NAME_RE.test(nombre)) {
        return {
          tipo: "aviso",
          titulo: `Nombre de pack inválido: '${nombre}'`,
          cuerpo:
            "Un nombre de pack es minúsculas, números y guiones, y empieza por letra o número.\n" +
            "  Sirve de nombre de carpeta, así que ni espacios, ni acentos, ni barras.",
        };
      }
      return { tipo: "ejecutar", invocacion: { comando: "new-pack", nombre } };
    }

    case "draft": {
      // ANTES de preguntar nada: `draft` es lo único de aptus que sale a la red.
      // Recorrerte el asistente entero para fallar en la llamada sería hacerte
      // trabajar para nada.
      if (!ctx.tieneApiKey) {
        return {
          tipo: "aviso",
          titulo: "Escribir un borrador con LLM necesita credenciales, y aquí no hay",
          cuerpo:
            "Es lo ÚNICO de aptus que sale a la red: exporta ANTHROPIC_API_KEY (o entra con\n" +
            "  `ant auth login`) y vuelve a abrir el menú. Todo lo demás funciona igual sin ella.\n" +
            "  Mientras tanto, un pack se cura igual a mano: `ingest` → escribir las preguntas.",
        };
      }
      if (r0 === undefined) {
        return { tipo: "preguntar", prompt: { id: "pack", mensaje: "¿En qué pack escribo?" } };
      }
      if (r1 === undefined) {
        return {
          tipo: "preguntar",
          prompt: { id: "dimension", mensaje: "¿De qué dimensión?" },
        };
      }
      const dimension = r1.trim();
      if (dimension.length === 0) {
        return {
          tipo: "aviso",
          titulo: "Sin dimensión no hay borrador",
          cuerpo: "El borrador se pide para UNA dimensión: es lo que enfoca lo que se escribe.",
        };
      }
      return {
        tipo: "ejecutar",
        invocacion: { comando: "draft", pack: r0, dimension, cantidad: DRAFT_CANTIDAD },
      };
    }

    case "promote": {
      if (r0 === undefined) {
        return { tipo: "preguntar", prompt: { id: "pack", mensaje: "¿De qué pack?" } };
      }
      if (r1 === undefined) {
        return {
          tipo: "preguntar",
          prompt: { id: "dimension", mensaje: "¿Qué dimensión promuevo?" },
        };
      }
      const dimension = r1.trim();
      if (dimension.length === 0) {
        return {
          tipo: "aviso",
          titulo: "Sin dimensión no hay nada que promover",
          cuerpo: "Se promueve un borrador concreto: `drafts/<dimensión>.yaml`.",
        };
      }
      // Promover es lo que convierte unas preguntas en evaluables. Preguntar si lo
      // has leído no es ceremonia: la auditoría valida la FORMA (schema, cobertura,
      // sesgo posicional) y no puede saber si la respuesta marcada es la correcta.
      // Ese es justo el error que te mediría contra una mentira.
      if (r2 === undefined) {
        return { tipo: "preguntar", prompt: { id: "confirmarPromote", pack: r0, dimension } };
      }
      if (r2 !== "si") {
        return {
          tipo: "aviso",
          titulo: "No se ha promovido nada",
          cuerpo:
            `El borrador sigue en drafts/${dimension}.yaml, donde el loader no lo mira: no te\n` +
            "  puede evaluar. Léelo entero —respuesta marcada y explicación, una a una— y vuelve.\n" +
            "  La auditoría de `promote` mira la forma, no si la respuesta correcta lo es.",
        };
      }
      return { tipo: "ejecutar", invocacion: { comando: "promote", pack: r0, dimension } };
    }
  }
}

function mensajePack(action: MenuAction): string {
  switch (action) {
    case "review":
      return "¿Qué pack repasar?";
    case "history":
      return "¿Historial de qué pack?";
    case "report":
      return "¿Informe de qué pack?";
    case "verify":
      return "¿Qué pack auditar?";
    case "borrar-sesion":
      return "¿De qué pack borras una sesión?";
    case "repasar-fallos":
      return "¿De qué pack repasas los fallos?";
    default:
      return "¿Con qué pack evaluarlas?";
  }
}

/** Resultado de recorrer una acción entera. */
export type MenuOutcome =
  | { readonly tipo: "salir" }
  | { readonly tipo: "volver" } // ESC a mitad: NO se ejecuta nada
  | { readonly tipo: "ejecutar"; readonly invocacion: Invocacion }
  | { readonly tipo: "aviso"; readonly titulo: string; readonly cuerpo: string };

/**
 * Recorre la acción con las respuestas dadas (que pueden traer ESCAPED). Es lo que
 * hace el menú de verdad, sin los prompts: cuadra que ESC en cualquier posición
 * cancele la acción entera y no solo el sub-prompt donde se pulsó.
 */
export function runMenuAction(
  action: MenuAction,
  respuestas: readonly Escapable<string>[],
  ctx: MenuContext = CONTEXTO_POR_DEFECTO,
): MenuOutcome {
  const dadas: string[] = [];

  for (let i = 0; i <= respuestas.length; i++) {
    const paso = nextMenuStep(action, dadas, ctx);
    if (paso.tipo !== "preguntar") return paso;

    const siguiente = respuestas[i];
    if (siguiente === undefined) {
      throw new Error(`Faltan respuestas: el menú pide '${paso.prompt.id}' y no hay ninguna más.`);
    }
    if (siguiente === ESCAPED) return { tipo: "volver" };
    dadas.push(siguiente);
  }

  // Inalcanzable con un plan finito, pero un bucle sin salida sería peor.
  throw new Error("El asistente del menú no ha terminado.");
}

/**
 * Qué hacer al volver de ejecutar. Solo la sesión distingue: una sesión cancelada
 * no ha dejado nada en pantalla que leer, así que pausar sería ruido.
 */
export function nextTrasEjecutar(invocacion: Invocacion, resultado: string | null): Next {
  if (invocacion.comando === "start" && resultado === "cancelada") return "volver";
  return "pausar";
}

/** ESC o "Salir" en el menú: las dos cosas cierran aptus, que es lo que uno espera. */
export function nextTrasMenu(action: Escapable<MenuAction>): Next | MenuAction {
  return action === ESCAPED ? "salir" : action;
}

/**
 * Expande `~` y normaliza una ruta escrita a mano. `home` se inyecta en vez de
 * leer el entorno aquí dentro para que la función sea pura y testeable.
 */
export function expandirRuta(valor: string, home: string | undefined): string {
  return valor.trim().replace(/^~/, home ?? "~");
}
