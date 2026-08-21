import { toKebab } from "../core/brief.js";
import type { DimensionPlan } from "../content/draft.js";

/**
 * Decisiones del comando `aptus tema`: PURAS. Nada de disco, nada de red.
 *
 * Se separan de `commands/tema.ts` por lo de siempre en este repo: lo que hay que
 * poder comprobar sin gastar una llamada al modelo es exactamente esto —de dónde
 * sale el material, qué dimensiones quedan, qué se escribe y QUÉ QUEDA PENDIENTE—,
 * y eso estaba condenado a trenzarse con los `writeFileSync` si vivía junto a ellos.
 */

/** De dónde sale el material del que se escriben las preguntas. */
export type FuenteMaterial = "carpeta" | "investigacion";

export interface TemaOptions {
  /** Carpeta de material propio. Sin esto, el tema se investiga en la web. */
  material?: string;
  /** Dimensiones impuestas por ti, separadas por comas. Sin esto, las propone el modelo. */
  dims?: string;
  /** Cuántas preguntas pedir por dimensión. */
  count: number;
}

export interface TemaPlan {
  fuente: FuenteMaterial;
  /** `null` = las decide el modelo a partir del material. */
  dimensiones: string[] | null;
  count: number;
}

export function planTema(opts: TemaOptions): TemaPlan {
  return {
    fuente: opts.material !== undefined ? "carpeta" : "investigacion",
    dimensiones: opts.dims !== undefined ? parseDimensiones(opts.dims) : null,
    count: opts.count,
  };
}

/**
 * Las dimensiones que has escrito a mano, normalizadas a kebab-case.
 *
 * Se normaliza en vez de rechazar porque "Colas de mensajes" es lo que se escribe
 * cuando piensas en el tema, y `colas-de-mensajes` es lo que tiene que acabar
 * siendo un nombre de fichero. Lo que sí se rechaza es quedarse sin ninguna.
 */
export function parseDimensiones(csv: string): string[] {
  const limpias: string[] = [];
  for (const trozo of csv.split(",")) {
    const kebab = toKebab(trozo);
    if (kebab.length < 3 || limpias.includes(kebab)) continue;
    limpias.push(kebab);
  }
  if (limpias.length === 0) {
    throw new Error(
      `No hay ninguna dimensión utilizable en '${csv}'. Sepáralas por comas: --dims uno,dos,tres`,
    );
  }
  return limpias;
}

/**
 * El BRIEF.md del pack recién nacido: qué cubre cada dimensión y de dónde sale.
 *
 * Lo lee `aptus draft` en cada dimensión, así que no es documentación decorativa:
 * es el encargo. Y es lo primero que conviene corregir a mano, porque un brief
 * torcido tuerce las preguntas de las seis dimensiones a la vez.
 */
export function renderBriefDeTema(
  tema: string,
  plan: readonly DimensionPlan[],
  fuente: FuenteMaterial,
  fuentes: readonly string[],
): string {
  const origen =
    fuente === "carpeta"
      ? "material que le has dado tú"
      : "una investigación en la web hecha por el modelo (NO es una fuente auditada)";

  return [
    `# Brief del pack '${tema}'`,
    "",
    `Generado por \`aptus tema\` a partir de ${origen}.`,
    "",
    "Esto es el ENCARGO, no el contenido: `aptus draft` lo lee para escribir cada",
    "dimensión. Corrígelo antes de nada — un brief torcido tuerce a la vez las",
    "preguntas de todas las dimensiones.",
    "",
    "## Dimensiones",
    "",
    ...plan.flatMap((d) => [`### ${d.name}`, "", d.foco, ""]),
    "## Fuentes",
    "",
    ...(fuentes.length > 0
      ? fuentes.map((f) => `- \`sources/${f}\``)
      : ["- (ninguna: el pack se apoya solo en conocimiento canónico del campo)"]),
    "",
  ].join("\n");
}

/** Una dimensión que ya tiene borrador escrito, con cuántas preguntas salieron. */
export interface DimensionEscrita {
  dimension: string;
  preguntas: number;
}

/**
 * Qué queda por hacer para que el tema EVALÚE. Es la parte que más fácil sería
 * callarse: al terminar hay seis ficheros nuevos y sensación de tema montado,
 * cuando lo que hay es un borrador que todavía no mide nada.
 */
export function pendienteDelTema(tema: string, escritas: readonly DimensionEscrita[]): string[] {
  if (escritas.length === 0) {
    return [
      "No ha salido ni un borrador: no hay nada que revisar todavía.",
      `Reintenta una dimensión suelta con \`aptus draft ${tema} -d <dimension>\`.`,
    ];
  }

  const total = escritas.reduce((acc, d) => acc + d.preguntas, 0);
  return [
    `Lee las ${total} preguntas de \`drafts/\` y corrige lo que esté mal: mientras sigan ahí, no te evalúan.`,
    ...escritas.map((d) => `Cuando te fíes de '${d.dimension}': aptus promote ${tema} ${d.dimension}`),
    `Después: aptus verify-pack ${tema} — y con eso ya: aptus start --pack ${tema}`,
  ];
}

/**
 * El `pack.yaml` de un tema recién generado. Se escribe entero aquí en vez de
 * partir del esqueleto de `new-pack` porque el esqueleto trae una dimensión de
 * ejemplo y una pregunta de relleno, y eso es exactamente lo que la auditoría
 * marca como "sin curar": nacería avisando de su propio andamiaje.
 */
export function renderPackYaml(tema: string, dimensiones: readonly string[]): string {
  return [
    `# Pack '${tema}', generado por \`aptus tema\`.`,
    "#",
    "# Las dimensiones son el esqueleto: dan nombre a los ficheros de questions/,",
    "# son las claves del readiness y deciden qué se compara con qué. Cámbialas",
    "# ahora si no te cuadran; cambiarlas con el banco escrito cuesta mucho más.",
    `name: "${tema}"`,
    'version: "0.1.0"',
    "dimensions:",
    ...dimensiones.map((d) => `  - ${d}`),
    "",
  ].join("\n");
}
