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
 * invente entero: la única fuente sería el nombre del tema.
 */
export function admiteBorrador(fuente: MaterialSource): boolean {
  return fuente !== "ninguno";
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

export interface PlanInput {
  readonly dimension: string;
  readonly packName: string;
  readonly briefFile: string;
  readonly material: MaterialOutcome;
  /** `true` si la dimensión se acaba de añadir a `pack.yaml` (no si ya estaba). */
  readonly dimensionDeclarada: boolean;
  readonly borrador: BorradorOutcome | null;
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

  if (input.borrador !== null) {
    if (input.borrador.validas > 0) {
      written.push(input.borrador.fichero);
      // Un borrador no evalúa hasta que se revisa y se promueve: es la misma regla
      // de siempre —lo no revisado no te evalúa— y aquí es donde más tienta saltársela.
      pending.push(`revisar el borrador y promoverlo: \`aptus promote ${packName} ${dimension}\``);
    } else {
      pending.push("volver a intentar el borrador: no salió ninguna pregunta válida");
    }
  } else if (admiteBorrador(material.fuente)) {
    pending.push(`escribir las preguntas: a mano, o \`aptus draft ${packName} -d ${dimension}\``);
  } else {
    pending.push(`darle material: \`aptus ingest <carpeta> --pack ${packName}\``);
  }

  return { dimension, written, pending };
}
