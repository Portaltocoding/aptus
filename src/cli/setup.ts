import { checkbox, select } from "@inquirer/prompts";
import pc from "picocolors";
import { loadPackDir } from "../content/loader.js";
import type { PackLocator } from "../content/paths.js";
import type { Pack } from "../content/schema.js";
import { filterQuestions, type Difficulty } from "../core/session.js";
import { DIFFICULTY_LABEL, difficultyColor, heading, promptTheme } from "./theme.js";
import { ESCAPED, ESC_HINT, withEscape, type Escapable } from "./keys.js";

/**
 * Asistente de arranque: QUÉ se evalúa antes de empezar a evaluarlo.
 *
 * Existe porque una sesión con todo el banco y todos los tramos es la única forma
 * de usar aptus, y casi nunca es la que quieres: normalmente vas a repasar dos
 * dimensiones, o a ver si aguantas el tramo experto. Aquí se elige el pack, las
 * dimensiones y la dificultad, y se ve CUÁNTAS preguntas quedan tras el filtro
 * antes de confirmar — alimentar el motor con 6 preguntas y creerte el readiness
 * que salga es la forma más fácil de engañarte.
 *
 * Todo lo que pregunta se puede fijar por flag; con `--yes` (o sin TTY) no
 * pregunta nada y usa los valores por defecto de siempre.
 */

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard", "experto"];

export interface DifficultyPreset {
  id: string;
  label: string;
  hint: string;
  difficulties: Difficulty[] | null; // null = todos los tramos
}

/**
 * Presets anclados a lo que significan los tramos en el readiness: filtrar por
 * dificultad recorta el rango de seniority que la sesión puede acreditar, y eso
 * se dice en el `hint` en vez de dejar que te sorprenda en el resultado.
 */
export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: "todas",
    label: "Todas — de fácil a experto",
    hint: "la única que puede acreditar cualquier nivel, de junior a staff",
    difficulties: null,
  },
  {
    id: "base",
    label: "Base — fácil y media",
    hint: "para asentar fundamentos; no acredita senior ni staff",
    difficulties: ["easy", "medium"],
  },
  {
    id: "alta",
    label: "Alta — difícil y experto",
    hint: "para ver si aguantas arriba; sin tramos bajos el readiness queda capado",
    difficulties: ["hard", "experto"],
  },
  {
    id: "experto",
    label: "Solo experto",
    hint: "el tramo staff a pelo; muestra pequeña, léelo como sondeo",
    difficulties: ["experto"],
  },
];

export interface SessionSetup {
  packName: string;
  /** Directorio del que ha salido el pack: puede ser del producto o del usuario. */
  packDir: string;
  pack: Pack;
  dimensions: string[] | null; // null = todas las del pack
  difficulties: Difficulty[] | null; // null = todos los tramos
  target: number;
  /** Banco ya acotado por el filtro: lo que de verdad alimenta al motor. */
  bank: Pack["questions"];
}

export interface SetupOptions {
  pack?: string;
  dims?: string; // lista separada por comas
  difficulty?: string; // id de preset o tramos separados por coma
  questions?: number;
  interactive: boolean;
}

/** Resuelve `--difficulty`: acepta un id de preset o una lista de tramos. */
export function parseDifficulty(raw: string): Difficulty[] | null {
  const preset = DIFFICULTY_PRESETS.find((p) => p.id === raw.trim().toLowerCase());
  if (preset) return preset.difficulties;

  const tramos = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const invalidos = tramos.filter((t) => !DIFFICULTY_ORDER.includes(t as Difficulty));
  if (tramos.length === 0 || invalidos.length > 0) {
    const validos = [...DIFFICULTY_PRESETS.map((p) => p.id), ...DIFFICULTY_ORDER].join(", ");
    throw new Error(`dificultad no reconocida: '${raw}'. Válidos: ${validos}`);
  }
  return tramos as Difficulty[];
}

/**
 * Resuelve una lista de dimensiones escrita a mano (`--dims a,b`). Vacía = `null`
 * = "todas", que es lo mismo que no pasar el flag. Puro: lo comparten `start` y
 * `review`, y así una coma de más se comporta igual en los dos.
 */
export function parseDims(raw: string): string[] | null {
  const dims = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return dims.length === 0 ? null : dims;
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const map = new Map<K, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}

/**
 * Aviso de muestra: la parte honesta del asistente. Un filtro puede dejar el
 * banco tan corto que el resultado no signifique nada, y eso se dice ANTES de
 * empezar, no después de responder.
 */
export function sampleWarning(bank: Pack["questions"], target: number): string | null {
  if (bank.length === 0) return "Con ese filtro no queda ninguna pregunta.";
  const efectivo = Math.min(bank.length, target);
  if (efectivo < 15) {
    return `Solo quedan ${bank.length} pregunta(s) tras el filtro: la sesión será un sondeo, no una medida.`;
  }
  const porDim = countBy(bank, (q) => q.dimension);
  const flojas = [...porDim.entries()].filter(([, n]) => n < 8).map(([d]) => d);
  if (flojas.length > 0) {
    return `Dimensiones con poca muestra tras el filtro: ${flojas.join(", ")} — su porcentaje se moverá mucho por pocas respuestas.`;
  }
  return null;
}

async function pickPack(
  packs: PackLocator,
  preseleccionado: string | undefined,
): Promise<{ name: string; packDir: string; pack: Pack }> {
  const nombres = packs.list();
  if (nombres.length === 0) {
    throw new Error("no hay ningún pack disponible (ni en la instalación ni en tu directorio).");
  }

  // El localizador mira las DOS raíces —los packs del producto y los tuyos—, así
  // que "no existe el pack X" ahora es cierto en los dos sitios donde se ha mirado.
  const cargar = (name: string): { name: string; packDir: string; pack: Pack } => {
    const packDir = packs.dir(name);
    if (packDir === null) throw new Error(`no existe el pack '${name}'.`);
    return { name, packDir, pack: loadPackDir(packDir) };
  };

  if (preseleccionado !== undefined) return cargar(preseleccionado);
  if (nombres.length === 1) return cargar(nombres[0]!);

  // Cada pack se anuncia con lo que trae dentro: elegir a ciegas por el nombre de
  // la carpeta no es elegir.
  const choices = nombres.map((name) => {
    try {
      const { pack } = cargar(name);
      return {
        value: name,
        name: `${pack.name} ${pc.dim(`(${name})`)}`,
        description: `${pack.questions.length} preguntas · ${pack.dimensions.length} dimensiones: ${pack.dimensions.join(", ")}`,
      };
    } catch {
      return {
        value: name,
        name: `${name} ${pc.red("(inválido)")}`,
        description: "El pack no carga",
        disabled: true,
      };
    }
  });

  const elegido = await select({
    message: pc.bold("  ¿Sobre qué te evalúas?"),
    choices,
    theme: promptTheme,
  });
  return cargar(elegido);
}

/** Valor centinela del checkbox: no es una dimensión, es "quiero crear una". */
export const NUEVA_DIMENSION = "__nueva__";

/** Una dimensión elegible, con lo que hay detrás de ella. */
export interface DimensionOption {
  value: string;
  /** Qué se ve bajo el cursor: cuántas preguntas, cuántas tocan repasar… */
  detalle: string;
}

/** Una dimensión que se ve pero no se puede elegir, y por qué. */
export interface DimensionDisabled {
  value: string;
  nota: string;
  motivo: string;
  detalle: string;
}

export interface DimensionPick {
  mensaje: string;
  disponibles: DimensionOption[];
  deshabilitadas?: DimensionDisabled[];
  /** Entrada "＋ tema nuevo…". Solo la pone quien puede atenderla. */
  nueva?: { etiqueta: string; detalle: string };
}

/**
 * El checkbox de dimensiones, sin saber de dónde salen. Lo comparten el asistente
 * de `start` (dimensiones del pack) y el de `review` (dimensiones que hoy tocan
 * repasar): es el mismo gesto y la misma tecla de escape, así que es la misma
 * función y no dos parecidas que se separan con el tiempo.
 *
 * Devuelve `null` cuando se han marcado TODAS: "todas" y "estas cuatro, que dan la
 * casualidad de ser todas" significan lo mismo aguas abajo y conviene no
 * distinguirlas.
 */
export async function pickDimensionsFrom(o: DimensionPick): Promise<Escapable<string[] | null>> {
  const elegidas = await withEscape((signal) =>
    checkbox(
      {
        message:
          pc.bold(`  ${o.mensaje}`) +
          pc.dim(`  (espacio marca · a todas · enter confirma · ${ESC_HINT})`),
        choices: [
          ...o.disponibles.map((d) => ({
            value: d.value,
            name: d.value,
            checked: true,
            description: d.detalle,
          })),
          ...(o.deshabilitadas ?? []).map((d) => ({
            value: d.value,
            name: `${d.value} ${pc.dim(`(${d.nota})`)}`,
            disabled: pc.dim(d.motivo),
            description: d.detalle,
          })),
          ...(o.nueva
            ? [
                {
                  value: NUEVA_DIMENSION,
                  name: pc.cyan(o.nueva.etiqueta),
                  checked: false,
                  description: o.nueva.detalle,
                },
              ]
            : []),
        ],
        required: true,
        theme: promptTheme,
        pageSize: 12,
      },
      { signal },
    ),
  );

  if (elegidas === ESCAPED) return ESCAPED;
  if (elegidas.includes(NUEVA_DIMENSION)) return [NUEVA_DIMENSION];
  return elegidas.length === o.disponibles.length ? null : elegidas;
}

/**
 * Qué dimensiones entran en la sesión. La lista incluye SIEMPRE una entrada para
 * crear un tema nuevo: sin ella, el asistente solo deja elegir entre lo que ya
 * existe y no hay ninguna pista de que aptus sepa construir temas.
 *
 * Las dimensiones declaradas pero sin preguntas se muestran deshabilitadas en vez
 * de ocultarse: que un tema exista y no sea evaluable es información útil —te dice
 * qué te falta— y esconderlo lo haría parecer inexistente.
 */
async function pickDimensions(pack: Pack): Promise<Escapable<string[] | null>> {
  const porDim = countBy(pack.questions, (q) => q.dimension);

  return await pickDimensionsFrom({
    mensaje: "¿Qué dimensiones entran?",
    disponibles: pack.dimensions
      .filter((d) => (porDim.get(d) ?? 0) > 0)
      .map((d) => ({ value: d, detalle: `${porDim.get(d)} preguntas en el banco` })),
    deshabilitadas: pack.dimensions
      .filter((d) => (porDim.get(d) ?? 0) === 0)
      .map((d) => ({
        value: d,
        nota: "declarada, sin preguntas",
        motivo: "no evaluable todavía",
        detalle: "Está declarada en pack.yaml pero aún no tiene banco: no puede medir nada.",
      })),
    nueva: {
      etiqueta: "＋ escribir un tema nuevo…",
      detalle:
        "Le pones nombre y le dices de dónde sale: una carpeta, una oferta, o que lo busque el modelo.",
    },
  });
}

async function pickDifficulty(): Promise<Escapable<Difficulty[] | null>> {
  const id = await withEscape((signal) =>
    select(
      {
        message: pc.bold("  ¿A qué nivel de dificultad?") + pc.dim(`  (${ESC_HINT})`),
        choices: DIFFICULTY_PRESETS.map((p) => ({
          value: p.id,
          name: p.id === "todas" ? p.label : difficultyColor(p.difficulties![0]!)(p.label),
          description: p.hint,
        })),
        theme: promptTheme,
      },
      { signal },
    ),
  );

  if (id === ESCAPED) return ESCAPED;
  return DIFFICULTY_PRESETS.find((p) => p.id === id)!.difficulties;
}

async function pickTarget(disponibles: number, pordefecto: number): Promise<Escapable<number>> {
  const opciones = [
    {
      value: 25,
      name: "Corta — 25 preguntas",
      description: "un sondeo rápido; el readiness saldrá con poca muestra",
    },
    {
      value: 60,
      name: "Media — 60 preguntas",
      description: "equilibrio entre tiempo y fiabilidad",
    },
    {
      value: pordefecto,
      name: `Larga — ${pordefecto} preguntas ${pc.dim("(por defecto)")}`,
      description: "la que mide de verdad a través de todos los niveles",
    },
    {
      value: disponibles,
      name: `Todo el filtro — ${disponibles} preguntas`,
      description: "todas las que quedan tras el filtro",
    },
  ]
    .filter(
      (o, i, arr) => o.value <= disponibles && arr.findIndex((x) => x.value === o.value) === i,
    )
    .sort((a, b) => a.value - b.value);

  // Si el filtro deja menos que la opción más corta, no hay nada que elegir.
  if (opciones.length <= 1) return disponibles;

  return await withEscape((signal) =>
    select(
      {
        message: pc.bold("  ¿Cuántas preguntas?") + pc.dim(`  (${ESC_HINT})`),
        choices: opciones,
        theme: promptTheme,
      },
      { signal },
    ),
  );
}

/**
 * Atiende la rama "tema nuevo" y cuenta qué ha quedado hecho y qué falta.
 *
 * La sesión NO continúa después: lo que se acaba de crear está sin revisar, y
 * medirte con preguntas que nadie ha leído sería exactamente la mentira que este
 * proyecto evita. Se dice qué falta y se corta.
 */
async function runNewDimension(
  packDir: string,
  packName: string,
  existing: readonly string[],
): Promise<boolean> {
  const { newDimensionFlow } = await import("./new-dimension.js");
  const res = await newDimensionFlow(packDir, packName, existing);

  // Cancelado: se devuelve `false` para volver a la lista de dimensiones. Haber
  // entrado aquí sin querer no debería costar el asistente entero.
  if (res === null) {
    console.log(pc.dim("\n  Tema nuevo cancelado.\n"));
    return false;
  }

  console.log("\n" + heading(`Tema '${res.dimension}'`));
  if (res.written.length > 0) {
    console.log(pc.dim("\n  Escrito:"));
    for (const f of res.written) console.log(`    · ${f}`);
  }
  console.log(pc.dim("\n  Falta para que sea evaluable:"));
  for (const p of res.pending) console.log(`    · ${p}`);
  console.log(
    pc.dim(
      "\n  · La sesión no sigue: lo que se acaba de crear está sin revisar, y medirte\n" +
        "    con preguntas que nadie ha leído sería justo lo que aptus evita.\n" +
        `  · Cuando esté listo, vuelve con \`aptus start --pack ${packName}\`.\n`,
    ),
  );
  return true;
}

/**
 * Compone el asistente completo. Devuelve `null` si el usuario cancela (Ctrl+C):
 * cancelar en el asistente no debe arrancar ninguna sesión ni escribir nada.
 */
export async function resolveSetup(
  packs: PackLocator,
  opts: SetupOptions,
  defaultTarget: number,
  defaultPack: string,
): Promise<SessionSetup | null> {
  const interactivo = opts.interactive && process.stdin.isTTY === true;

  try {
    // Sin TTY (scripts, CI, pipes) nunca se pregunta: se cae al pack por defecto.
    const preseleccionado = interactivo ? opts.pack : (opts.pack ?? defaultPack);
    const { name: packName, packDir, pack } = await pickPack(packs, preseleccionado);

    let dimensions: string[] | null = opts.dims !== undefined ? parseDims(opts.dims) : null;
    let difficulties: Difficulty[] | null =
      opts.difficulty !== undefined ? parseDifficulty(opts.difficulty) : null;
    let target = opts.questions ?? defaultTarget;

    if (interactivo) {
      console.log("\n" + heading("Qué vamos a evaluar") + "\n");

      // Los pasos se recorren con un índice en vez de en línea recta para que ESC
      // pueda RETROCEDER uno. Equivocarte en la dificultad no debería costarte
      // volver a empezar desde la terminal.
      const pasos: ("dims" | "difficulty" | "target")[] = [];
      if (opts.dims === undefined) pasos.push("dims");
      if (opts.difficulty === undefined) pasos.push("difficulty");
      if (opts.questions === undefined) pasos.push("target");

      let i = 0;
      while (i < pasos.length) {
        // ESC en el primer paso visible significa salir del asistente, no
        // retroceder a ninguna parte.
        if (i < 0) return null;
        const paso = pasos[i]!;

        if (paso === "dims") {
          const elegidas = await pickDimensions(pack);
          if (elegidas === ESCAPED) return null; // primer paso: ESC sale del asistente
          dimensions = elegidas;

          // "Tema nuevo" no es un filtro de sesión: es construir el pack. Si el
          // flujo se cancela, se vuelve a esta misma pantalla en vez de tirar
          // abajo el asistente entero por haber entrado sin querer.
          if (dimensions !== null && dimensions.includes(NUEVA_DIMENSION)) {
            // Escribir un tema nuevo es ESCRIBIR en el pack: si el pack viene
            // dentro de la instalación, esto lanza en vez de tocar node_modules.
            const hecho = await runNewDimension(
              packs.dirForWrite(packName),
              packName,
              pack.dimensions,
            );
            if (!hecho) continue;
            return null;
          }
        } else if (paso === "difficulty") {
          const elegida = await pickDifficulty();
          if (elegida === ESCAPED) {
            i -= 1;
            continue;
          }
          difficulties = elegida;
        } else {
          const disponibles = filterQuestions(pack.questions, { dimensions, difficulties }).length;
          const elegido = await pickTarget(disponibles, defaultTarget);
          if (elegido === ESCAPED) {
            i -= 1;
            continue;
          }
          target = elegido;
        }

        i += 1;
      }
    }

    // Se valida el filtro venga de donde venga (asistente o flags): una dimensión
    // mal escrita en `--dims` debe fallar con un mensaje, no con una sesión vacía.
    if (dimensions !== null) {
      const conocidas = new Set(pack.questions.map((q) => q.dimension));
      const desconocidas = dimensions.filter((d) => !conocidas.has(d));
      if (desconocidas.length > 0) {
        throw new Error(
          `dimensión desconocida en '${packName}': ${desconocidas.join(", ")}. Disponibles: ${pack.dimensions.join(", ")}`,
        );
      }
    }

    const bank = filterQuestions(pack.questions, { dimensions, difficulties });
    if (bank.length === 0) {
      throw new Error("con ese filtro de dimensiones y dificultad no queda ninguna pregunta.");
    }

    return { packName, packDir, pack, dimensions, difficulties, target, bank };
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") return null;
    throw err;
  }
}

/** Resumen de una línea de con qué se alimenta el motor, para imprimir al arrancar. */
export function describeSetup(setup: SessionSetup): string {
  const dims =
    setup.dimensions === null
      ? "todas las dimensiones"
      : `${setup.dimensions.length} dimensión(es): ${setup.dimensions.join(", ")}`;
  const tramos =
    setup.difficulties === null
      ? "todos los tramos"
      : setup.difficulties.map((d) => difficultyColor(d)(DIFFICULTY_LABEL[d])).join(", ");
  const efectivo = Math.min(setup.bank.length, setup.target);

  return (
    `  ${pc.bold(setup.pack.name)} ${pc.dim(`(${setup.packName})`)}\n` +
    `  ${pc.dim("Alimentando el motor con:")} ${dims} · ${tramos}\n` +
    `  ${pc.dim("Banco tras el filtro:")} ${setup.bank.length} preguntas ${pc.dim("→ sesión de")} ${efectivo}`
  );
}
