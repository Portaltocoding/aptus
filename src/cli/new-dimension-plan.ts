import { basename } from "node:path";
import { toKebab } from "../core/brief.js";

/**
 * Lógica de decisión del flujo de tema nuevo: PURA. Nada de disco, nada de red.
 *
 * Vive en `src/cli/` porque su vocabulario es el del asistente (qué fuente eligió
 * el usuario, qué queda pendiente antes de que el tema evalúe), no el del motor.
 * Se separa de `new-dimension.ts` porque lo que hay que poder comprobar sin escribir
 * un solo fichero es exactamente esto: QUÉ queda escrito y QUÉ queda pendiente según
 * la fuente elegida. Antes, esa decisión estaba trenzada con los `writeFileSync`.
 */

export type MaterialSource = "carpeta" | "oferta" | "buscar" | "ninguno";

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
 * Ofrecer un borrador cuando no hay material sería pedirle al modelo que se lo
 * invente entero: la única fuente sería el nombre del tema. Y ofrecerlo sin
 * credenciales es peor todavía: es hacerte decir que sí para reventar después con
 * un error de autenticación, cuando se sabía antes de preguntar.
 */
export function admiteBorrador(fuente: MaterialSource, tieneApiKey: boolean): boolean {
  return fuente !== "ninguno" && tieneApiKey;
}

/** Una opción del menú de fuente, ya decidido si se puede elegir y por qué no. */
export interface SourceChoice {
  readonly value: MaterialSource;
  readonly name: string;
  readonly description: string;
  /** Motivo por el que está deshabilitada, o `null` si se puede elegir. */
  readonly disabled: string | null;
}

/**
 * Qué fuentes se pueden ofrecer. Lo único que cambia según el entorno es
 * "que lo busque el modelo": sale deshabilitada CON EL MOTIVO cuando no hay
 * credenciales, en vez de dejarte elegirla para fallar en la llamada.
 *
 * Es una lista de datos y no `select()` directo a propósito: así se comprueba qué
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
      name: "Una oferta de empleo (JD)",
      description: "el texto de la oferta marca qué hay que saber para ese puesto",
      disabled: null,
    },
    {
      value: "buscar",
      name: "Que lo busque el modelo",
      description: "investiga el tema en la web y deja el informe como material (necesita API key)",
      disabled: tieneApiKey ? null : "sin ANTHROPIC_API_KEY",
    },
    {
      value: "ninguno",
      name: "Nada por ahora — solo declararla",
      description: "la dimensión queda declarada y vacía; le pones material después",
      disabled: null,
    },
  ];
}

/** Qué pasó con el material, ya resuelto el I/O. */
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
  | { readonly fuente: "ninguno" };

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
  readonly material: MaterialOutcome;
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

/**
 * Qué queda escrito y qué queda pendiente. El orden de `written` es el orden en que
 * se escribe, para que el resumen final se lea como la crónica de lo que ha pasado.
 */
export function planNewDimension(input: PlanInput): NewDimensionResult {
  const written: string[] = [];
  const pending: string[] = [];
  const { dimension, packName, material } = input;

  switch (material.fuente) {
    case "carpeta":
      if (material.leidos === 0) {
        // Sin material no hay brief: escribir uno vacío sería fingir que hay índice.
        pending.push("conseguir material: la carpeta no tenía texto que aptus sepa leer");
      } else {
        written.push(...material.copiados, input.briefFile);
        if (material.descartados > 0) {
          pending.push(
            `${material.descartados} fichero(s) no se han leído (¿PDF?): conviértelos y repite la ingesta`,
          );
        }
      }
      break;

    case "oferta":
    case "buscar":
      written.push(material.copiado);
      break;

    case "ninguno":
      break;
  }

  if (material.fuente === "buscar") {
    pending.push("verificar el informe: lo ha escrito un modelo, no una fuente auditada");
  }

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

  if (material.fuente === "ninguno" && input.esqueleto === null) {
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
  } else if (admiteBorrador(material.fuente, input.tieneApiKey)) {
    pending.push(`escribir las preguntas: a mano, o \`aptus draft ${packName} -d ${dimension}\``);
  } else if (material.fuente !== "ninguno") {
    pending.push(`escribir las preguntas a mano en \`drafts/${dimension}.yaml\` y promoverlas`);
  }

  return { dimension, written, pending };
}
