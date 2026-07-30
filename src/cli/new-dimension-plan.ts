import { basename } from "node:path";
import { toKebab } from "../core/brief.js";

/**
 * Lógica de decisión del flujo de tema nuevo: PURA. Nada de disco, nada de red.
 *
 * Vive en `src/cli/` porque su vocabulario es el del asistente (qué fuentes eligió
 * el usuario, qué queda pendiente antes de que el tema evalúe), no el del motor.
 * Se separa de `new-dimension.ts` porque lo que hay que poder comprobar sin escribir
 * un solo fichero es exactamente esto: QUÉ queda escrito y QUÉ queda pendiente según
 * las fuentes elegidas. Antes, esa decisión estaba trenzada con los `writeFileSync`.
 */

export type MaterialSource = "carpeta" | "oferta" | "buscar";

export interface NewDimensionResult {
  dimension: string;
  /** Ficheros escritos, para poder decir exactamente qué ha pasado. */
  written: string[];
  /** Qué queda por hacer antes de que el tema sea evaluable. */
  pending: string[];
}

/** Nombre de dimensión válido: kebab-case, no vacío y que no exista ya. */
export function validateDimensionName(raw: string, existing: readonly string[]): string | true {
  const kebab = toKebab(raw);
  if (kebab.length < 3) return "Necesita al menos 3 caracteres útiles.";
  if (existing.includes(kebab)) return `'${kebab}' ya existe en este pack.`;
  return true;
}

/**
 * La oferta se guarda como material citable: es la definición de qué hay que saber
 * para ese puesto, en las palabras de quien contrata.
 */
export function ofertaSourceName(rutaOferta: string): string {
  return `oferta-${basename(rutaOferta).replace(/\.[^.]+$/, "")}.txt`;
}

export function investigacionSourceName(dimension: string): string {
  return `investigacion-${dimension}.md`;
}

/**
 * Un nombre libre dentro de `sources/`: si ya hay un fichero así, se numera.
 *
 * Existe porque las fuentes son combinables y se recorren en la misma pasada: dos
 * de ellas pueden proponer el mismo nombre (dos ofertas que se llaman igual, un
 * pegado sobre un pegado anterior). Pisar el material ya guardado sería destruir
 * en silencio la fuente de la que ya se citó algo.
 */
export function nombreLibre(nombre: string, existentes: readonly string[]): string {
  const usados = new Set(existentes);
  if (!usados.has(nombre)) return nombre;

  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : "";

  let n = 2;
  while (usados.has(`${base}-${n}${ext}`)) n += 1;
  return `${base}-${n}${ext}`;
}

/**
 * Ofrecer un borrador cuando no hay material sería pedirle al modelo que se lo
 * invente entero: la única fuente sería el nombre del tema. Y ofrecerlo sin
 * credenciales es peor todavía: es hacerte decir que sí para reventar después con
 * un error de autenticación, cuando se sabía antes de preguntar.
 *
 * Se mide sobre lo que las fuentes REALMENTE han dejado, no sobre lo que se marcó:
 * marcar una carpeta que resulta estar vacía no es tener material.
 */
export function admiteBorrador(
  materiales: readonly MaterialOutcome[],
  tieneApiKey: boolean,
): boolean {
  return tieneApiKey && materiales.some(materialUtil);
}

/** Una opción del menú de fuentes, ya decidido si se puede elegir y por qué no. */
export interface SourceChoice {
  readonly value: MaterialSource;
  readonly name: string;
  readonly description: string;
  /** Motivo por el que está deshabilitada, o `null` si se puede elegir. */
  readonly disabled: string | null;
}

/**
 * Qué se dice cuando no se marca ninguna fuente. No hay opción "Nada por ahora":
 * en una lista de marcar, "nada" ES no marcar nada, y ponerla como casilla haría
 * posible marcarla A LA VEZ que una carpeta, que no significa nada.
 */
export const SIN_FUENTES_HINT = "sin marcar nada, la dimensión se declara vacía";

/**
 * Qué fuentes se pueden ofrecer. Lo único que cambia según el entorno es
 * "que lo busque el modelo": sale deshabilitada CON EL MOTIVO cuando no hay
 * credenciales, en vez de dejarte elegirla para fallar en la llamada.
 *
 * Es una lista de datos y no `checkbox()` directo a propósito: así se comprueba qué
 * se ofrece sin abrir una terminal.
 */
export function sourceChoices(tieneApiKey: boolean): SourceChoice[] {
  return [
    {
      value: "carpeta",
      name: "Una carpeta de material",
      description: "apuntes, temario, un repo — se lee, se copia a sources/ y se indexa",
      disabled: null,
    },
    {
      value: "oferta",
      name: "Un fichero suelto (una oferta, unos apuntes)",
      description: "el texto de ese fichero marca qué hay que saber",
      disabled: null,
    },
    {
      value: "buscar",
      name: "Que lo busque el modelo",
      description: "investiga el tema en la web y deja el informe como material (necesita API key)",
      disabled: tieneApiKey ? null : "sin ANTHROPIC_API_KEY",
    },
  ];
}

/**
 * Orden canónico en el que se recorren las fuentes marcadas.
 *
 * No es el orden en que se marcan: lo local va antes que la red a propósito. Si la
 * investigación falla o se corta, el material que ya tenías en disco está copiado y
 * el brief se puede escribir igual; al revés, un fallo de red se llevaría por
 * delante lo que aún no habías traído.
 */
export const ORDEN_FUENTES: readonly MaterialSource[] = ["carpeta", "oferta", "buscar"];

/** Ordena y deduplica lo marcado. Lo desconocido se descarta en vez de arrastrarse. */
export function ordenarFuentes(seleccion: readonly MaterialSource[]): MaterialSource[] {
  const marcadas = new Set(seleccion);
  return ORDEN_FUENTES.filter((f) => marcadas.has(f));
}

/** Qué pasó con UNA fuente, ya resuelto el I/O. */
export type MaterialOutcome =
  | {
      readonly fuente: "carpeta";
      /** Rutas relativas al pack de lo copiado a `sources/`. */
      readonly copiados: readonly string[];
      readonly leidos: number;
      readonly descartados: number;
    }
  | { readonly fuente: "oferta"; readonly copiado: string }
  | { readonly fuente: "buscar"; readonly copiado: string }
  /**
   * Una fuente que se marcó y no salió. Es una variante propia y no un `null`
   * porque las fuentes son combinables: una puede funcionar y otra fallar, y el
   * resumen tiene que contar las dos cosas en vez de quedarse con la buena.
   */
  | { readonly fuente: "fallo"; readonly origen: MaterialSource; readonly motivo: string };

/** ¿Esta fuente ha dejado material aprovechable? */
export function materialUtil(m: MaterialOutcome): boolean {
  switch (m.fuente) {
    case "carpeta":
      return m.leidos > 0;
    case "oferta":
    case "buscar":
      return true;
    case "fallo":
      return false;
  }
}

/** Ficheros que ha dejado una fuente, en `sources/`. Vacío si no dejó ninguno. */
export function ficherosDe(m: MaterialOutcome): readonly string[] {
  switch (m.fuente) {
    case "carpeta":
      return m.leidos > 0 ? m.copiados : [];
    case "oferta":
    case "buscar":
      return [m.copiado];
    case "fallo":
      return [];
  }
}

/**
 * Qué se pone en el campo `source` del esqueleto: el primer material que haya
 * quedado escrito, o 'externa' si no hay ninguno. Con varias fuentes hay que elegir
 * una, y la primera es la que se recorrió primero: la más local.
 */
export function sourceDelEsqueleto(materiales: readonly MaterialOutcome[]): string {
  for (const m of materiales) {
    const [primero] = ficherosDe(m);
    if (primero !== undefined) return primero;
  }
  return "externa";
}

/**
 * Cuánto material se le manda al modelo cuando se pide el borrador. Hay tope
 * porque el material ya no es un informe suelto: con las fuentes combinadas puede
 * ser una carpeta entera, y volcarla completa en el prompt es gastar contexto en
 * el final de un temario que el modelo ya no va a usar.
 */
export const MAX_MATERIAL_BORRADOR = 120_000;

/**
 * El material de referencia del borrador, con su procedencia delante de cada
 * trozo: el modelo tiene que poder citar en `source` de qué fichero salió cada
 * cosa, y sin la cabecera todo el material es un bloque anónimo.
 *
 * Si hay que recortar se dice EN el propio texto, para que no parezca que el
 * material se acababa ahí.
 */
export function materialParaBorrador(
  docs: readonly { readonly path: string; readonly text: string }[],
  max: number = MAX_MATERIAL_BORRADOR,
): string {
  const entero = docs.map((d) => `--- ${d.path} ---\n${d.text}`).join("\n\n");
  if (entero.length <= max) return entero;
  return `${entero.slice(0, max)}\n\n[…material recortado: ${entero.length - max} caracteres más]`;
}

/** Qué salió del borrador. `null` = no se pidió ninguno. */
export interface BorradorOutcome {
  readonly validas: number;
  readonly descartadas: number;
  /** Ruta relativa al pack del YAML de borrador, si se escribió. */
  readonly fichero: string;
}

/** Qué salió del esqueleto escrito a mano. `null` = no se escribió ninguno. */
export interface EsqueletoOutcome {
  readonly entradas: number;
  /** Ruta relativa al pack del YAML de esqueleto. */
  readonly fichero: string;
}

/** Cuántos huecos trae un esqueleto como mucho: más que esto es una pared. */
const MAX_ESQUELETO = 8;
/** Sin brief del que derivar subtemas, se dejan estos huecos en blanco. */
const ESQUELETO_POR_DEFECTO = 3;

export interface SkeletonInput {
  readonly dimension: string;
  readonly packName: string;
  /** Subtemas propuestos por el brief. Vacío = no había brief del que sacarlos. */
  readonly subtemas: readonly string[];
  /** Qué va en `source`: el material del que sale, o 'externa'. */
  readonly source: string;
  readonly today: string;
}

/**
 * Esqueleto de preguntas para rellenar a mano.
 *
 * Por qué existe: sin credenciales no había NINGÚN camino desde "tema declarado"
 * hasta "tema evaluable" dentro del asistente. Escribirlas a mano siempre valió,
 * pero significaba abrir un fichero en blanco y adivinar el formato.
 *
 * Tres decisiones:
 *
 * 1. **Se escribe en `drafts/`, jamás en `questions/`.** Un esqueleto a medias
 *    dentro de `questions/` no pasa el schema, y el loader carga el pack ENTERO o
 *    nada: dejarlo ahí te quitaría también los temas que ya funcionaban.
 * 2. **`correct` va vacío a propósito.** Es el único campo que hace que un
 *    esqueleto sin rellenar NO se pueda promover: `promote` audita y lo rechaza.
 *    Prerrellenarlo con 'a' convertiría el olvido en una pregunta que miente.
 * 3. **Se escribe a mano y no con `stringify`.** El serializador de YAML no pone
 *    comentarios, y los comentarios son justo lo que hace que rellenarlo sea obvio
 *    sin abrir la documentación.
 */
export function renderSkeleton(input: SkeletonInput): string {
  const { dimension, packName, source, today } = input;
  const subtemas =
    input.subtemas.length > 0
      ? input.subtemas.slice(0, MAX_ESQUELETO)
      : Array<string>(ESQUELETO_POR_DEFECTO).fill("");

  const lines: string[] = [
    `# ESQUELETO sin rellenar — ${dimension}, pack ${packName}.`,
    `# Falta escribir las preguntas: rellena los huecos y luego \`aptus promote ${packName} ${dimension}\`.`,
    "# Mientras siga aquí no te evalúa: el loader solo lee questions/.",
    "",
  ];

  for (const [i, subtema] of subtemas.entries()) {
    lines.push(
      `- id: ${dimension}-${i + 1}`,
      `  dimension: ${dimension}`,
      `  subtopic: "${subtema}"` +
        (subtema === ""
          ? "                # qué parte del tema mide esta pregunta"
          : "   # propuesto por el brief; cámbialo si no es eso lo que preguntas"),
      "  difficulty: medium         # easy | medium | hard | experto",
      "  type: concepto             # concepto | escenario | codigo | diagrama",
      "  roles: []                  # a qué perfiles aplica; [] = a todos",
      '  stem: ""                   # el enunciado, tal cual se lee en pantalla',
      "  options:                   # cuatro: los tres falsos, errores que alguien comete de verdad",
      '    - { id: a, text: "" }',
      '    - { id: b, text: "" }',
      '    - { id: c, text: "" }',
      '    - { id: d, text: "" }',
      '  correct: ""                # el id de la buena: a, b, c o d (repártelas, no siempre la misma)',
      '  explanation: ""            # por qué esa lo es Y por qué las otras no',
      `  source: "${source}"` + "  # de dónde sale; 'externa' si es canónico del campo",
      `  date: "${today}"`,
      "",
    );
  }

  return lines.join("\n");
}

export interface PlanInput {
  readonly dimension: string;
  readonly packName: string;
  readonly briefFile: string;
  /** Qué pasó con CADA fuente marcada, en el orden en que se recorrieron. */
  readonly materiales: readonly MaterialOutcome[];
  /**
   * Si se escribió el brief. Es UNO solo aunque haya varias fuentes: todo el
   * material se acumula en el mismo corpus y de ahí sale un único índice.
   */
  readonly briefEscrito: boolean;
  /** `true` si la dimensión se acaba de añadir a `pack.yaml` (no si ya estaba). */
  readonly dimensionDeclarada: boolean;
  readonly borrador: BorradorOutcome | null;
  /** Esqueleto para rellenar a mano, si se escribió. */
  readonly esqueleto: EsqueletoOutcome | null;
  /**
   * Si había credenciales durante el flujo. Entra como dato y no se lee del
   * entorno aquí: es lo que decide si el resumen final puede decir la verdad
   * sobre por qué no hay borrador.
   */
  readonly tieneApiKey: boolean;
}

/** Qué queda pendiente por culpa de UNA fuente concreta. */
function pendientesDe(m: MaterialOutcome): string[] {
  switch (m.fuente) {
    case "carpeta":
      if (m.leidos === 0) {
        // Sin material no hay brief: escribir uno vacío sería fingir que hay índice.
        return ["conseguir material: la carpeta no tenía texto que aptus sepa leer"];
      }
      return m.descartados > 0
        ? [`${m.descartados} fichero(s) no se han leído (¿PDF?): conviértelos y repite la ingesta`]
        : [];

    case "oferta":
      return [];

    case "buscar":
      return ["verificar el informe: lo ha escrito un modelo, no una fuente auditada"];

    case "fallo":
      // Una fuente caída no anula a las demás, pero tampoco se calla: el resumen
      // tiene que poder decir que de dos marcadas solo entró una.
      return [`'${m.origen}' no ha dejado material: ${m.motivo}`];
  }
}

/**
 * Qué queda escrito y qué queda pendiente. El orden de `written` es el orden en que
 * se escribe, para que el resumen final se lea como la crónica de lo que ha pasado.
 */
export function planNewDimension(input: PlanInput): NewDimensionResult {
  const written: string[] = [];
  const pending: string[] = [];
  const { dimension, packName, materiales } = input;

  // Las fuentes se recorren en el mismo orden en que se ejecutaron: el resumen es
  // la crónica, no un inventario ordenado por otra cosa.
  for (const m of materiales) written.push(...ficherosDe(m));
  if (input.briefEscrito) written.push(input.briefFile);
  for (const m of materiales) pending.push(...pendientesDe(m));

  const hayMaterial = materiales.some(materialUtil);

  // La dimensión se declara pase lo que pase con el material: si no, se pierde el
  // nombre que acabas de elegir.
  if (input.dimensionDeclarada) written.push("pack.yaml");

  // Sin credenciales no se ha podido ofrecer el borrador, y decirlo aquí es la
  // diferencia entre "no hay preguntas" y "no hay preguntas PORQUE falta la key".
  if (!input.tieneApiKey && input.borrador === null) {
    pending.push(
      "exportar ANTHROPIC_API_KEY si quieres el borrador con LLM: sin credenciales " +
        "aptus no sale a la red (lo demás funciona igual)",
    );
  }

  if (!hayMaterial && input.esqueleto === null) {
    pending.push(`darle material: \`aptus ingest <carpeta> --pack ${packName}\``);
  }

  // Qué cierra el tema, en un solo renglón: el paso que lo hace evaluable.
  if (input.esqueleto !== null) {
    written.push(input.esqueleto.fichero);
    pending.push(
      `rellenar las ${input.esqueleto.entradas} pregunta(s) de ${input.esqueleto.fichero} ` +
        `y promoverlo: \`aptus promote ${packName} ${dimension}\``,
    );
  } else if (input.borrador !== null) {
    if (input.borrador.validas > 0) {
      written.push(input.borrador.fichero);
      // Un borrador no evalúa hasta que se revisa y se promueve: es la misma regla
      // de siempre —lo no revisado no te evalúa— y aquí es donde más tienta saltársela.
      pending.push(`revisar el borrador y promoverlo: \`aptus promote ${packName} ${dimension}\``);
    } else {
      pending.push("volver a intentar el borrador: no salió ninguna pregunta válida");
    }
  } else if (admiteBorrador(materiales, input.tieneApiKey)) {
    pending.push(`escribir las preguntas: a mano, o \`aptus draft ${packName} -d ${dimension}\``);
  } else if (hayMaterial) {
    pending.push(`escribir las preguntas a mano en \`drafts/${dimension}.yaml\` y promoverlas`);
  }

  return { dimension, written, pending };
}
