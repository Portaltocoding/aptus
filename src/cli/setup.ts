import { checkbox, select } from "@inquirer/prompts";
import { join } from "node:path";
import pc from "picocolors";
import { listPacks, loadPackDir } from "../content/loader.js";
import type { Pack } from "../content/schema.js";
import { filterQuestions, type Difficulty } from "../core/session.js";
import { DIFFICULTY_LABEL, difficultyColor, heading, promptTheme } from "./theme.js";

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
  packsRoot: string,
  preseleccionado: string | undefined,
): Promise<{ name: string; pack: Pack }> {
  const nombres = listPacks(packsRoot);
  if (nombres.length === 0) throw new Error(`No hay packs en ${packsRoot}.`);

  const cargar = (name: string): { name: string; pack: Pack } => ({
    name,
    pack: loadPackDir(join(packsRoot, name)),
  });

  if (preseleccionado !== undefined) return cargar(preseleccionado);
  if (nombres.length === 1) return cargar(nombres[0]!);

  // Cada pack se anuncia con lo que trae dentro: elegir a ciegas por el nombre de
  // la carpeta no es elegir.
  const choices = nombres.map((name) => {
    try {
      const pack = loadPackDir(join(packsRoot, name));
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

async function pickDimensions(pack: Pack): Promise<string[] | null> {
  const porDim = countBy(pack.questions, (q) => q.dimension);
  const disponibles = pack.dimensions.filter((d) => (porDim.get(d) ?? 0) > 0);
  if (disponibles.length <= 1) return null;

  const elegidas = await checkbox({
    message:
      pc.bold("  ¿Qué dimensiones entran?") +
      pc.dim("  (espacio marca · a todas · enter confirma)"),
    choices: disponibles.map((d) => ({
      value: d,
      name: d,
      checked: true,
      description: `${porDim.get(d)} preguntas en el banco`,
    })),
    required: true,
    theme: promptTheme,
    pageSize: 10,
  });

  return elegidas.length === disponibles.length ? null : elegidas;
}

async function pickDifficulty(): Promise<Difficulty[] | null> {
  const id = await select({
    message: pc.bold("  ¿A qué nivel de dificultad?"),
    choices: DIFFICULTY_PRESETS.map((p) => ({
      value: p.id,
      name: p.id === "todas" ? p.label : difficultyColor(p.difficulties![0]!)(p.label),
      description: p.hint,
    })),
    theme: promptTheme,
  });
  return DIFFICULTY_PRESETS.find((p) => p.id === id)!.difficulties;
}

async function pickTarget(disponibles: number, pordefecto: number): Promise<number> {
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

  return await select({
    message: pc.bold("  ¿Cuántas preguntas?"),
    choices: opciones,
    theme: promptTheme,
  });
}

/**
 * Compone el asistente completo. Devuelve `null` si el usuario cancela (Ctrl+C):
 * cancelar en el asistente no debe arrancar ninguna sesión ni escribir nada.
 */
export async function resolveSetup(
  packsRoot: string,
  opts: SetupOptions,
  defaultTarget: number,
  defaultPack: string,
): Promise<SessionSetup | null> {
  const interactivo = opts.interactive && process.stdin.isTTY === true;

  try {
    // Sin TTY (scripts, CI, pipes) nunca se pregunta: se cae al pack por defecto.
    const preseleccionado = interactivo ? opts.pack : (opts.pack ?? defaultPack);
    const { name: packName, pack } = await pickPack(packsRoot, preseleccionado);

    let dimensions: string[] | null =
      opts.dims !== undefined
        ? opts.dims
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : null;
    let difficulties: Difficulty[] | null =
      opts.difficulty !== undefined ? parseDifficulty(opts.difficulty) : null;
    let target = opts.questions ?? defaultTarget;

    if (interactivo) {
      console.log("\n" + heading("Qué vamos a evaluar") + "\n");
      if (opts.dims === undefined) dimensions = await pickDimensions(pack);
      if (opts.difficulty === undefined) difficulties = await pickDifficulty();

      const disponibles = filterQuestions(pack.questions, { dimensions, difficulties }).length;
      if (opts.questions === undefined) target = await pickTarget(disponibles, defaultTarget);
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

    return { packName, pack, dimensions, difficulties, target, bank };
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
