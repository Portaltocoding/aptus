#!/usr/bin/env tsx
/**
 * Añade los apuntes de opción (`rationale`) a un fichero de preguntas ya escrito.
 *
 * Existe porque los packs se curaron antes de que el campo existiera, y hay 2.300
 * opciones repartidas en once ficheros: a mano es inviable y a golpe de
 * `yaml.stringify` es peor. Reserializar el documento con la librería reescribe
 * 1.200 líneas por fichero (repliega los textos largos, cambia el comillado) y
 * deja un diff en el que ya no se puede revisar qué ha cambiado de verdad.
 *
 * Así que la inserción es TEXTUAL: se localiza el bloque de cada opción y se mete
 * una línea detrás. El resto del fichero —comentarios incluidos— no se toca ni un
 * byte. Y para que "no se toca" no sea una promesa, después se recarga el fichero
 * y se compara pregunta a pregunta contra lo que había: si algo distinto de
 * `rationale` ha cambiado, no se escribe nada.
 *
 * Uso:
 *   npx tsx scripts/add-rationales.ts <preguntas.yaml> <apuntes.json>
 *
 * El JSON es `{ "<id-pregunta>": { "<id-opción>": "apunte", ... }, ... }` y debe
 * traer TODAS las opciones de cada pregunta que toque: media pregunta con apuntes
 * delata la respuesta (lo mismo que avisa `aptus verify-pack`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

interface OpcionCruda {
  id: string;
  text: string;
  rationale?: string;
}
interface PreguntaCruda {
  id: string;
  options: OpcionCruda[];
  [k: string]: unknown;
}

type Apuntes = Record<string, Record<string, string>>;

function morir(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

/** Cómo se escribe el apunte en YAML: una línea, o bloque literal si trae saltos. */
function lineasApunte(texto: string, sangria: string): string[] {
  if (!texto.includes("\n")) {
    // Comillas dobles con escapado JSON: vale para acentos, comillas y `:`.
    return [`${sangria}rationale: ${JSON.stringify(texto)}`];
  }
  // `|-` conserva los saltos y NO añade el salto final: es lo que hace que un
  // diagrama se enseñe tal cual en la sesión.
  return [`${sangria}rationale: |-`, ...texto.split("\n").map((l) => `${sangria}  ${l}`)];
}

/**
 * Inserta los apuntes en el texto del YAML.
 *
 * Recorre líneas y va sabiendo en qué pregunta (`- id:` a nivel 0) y en qué opción
 * (`- id:` dentro de `options:`) está. El bloque de una opción termina donde
 * empieza la siguiente opción o donde vuelve una clave de la pregunta, y el apunte
 * se mete justo ahí: al final del bloque, sin tocar lo que ya había dentro.
 */
function insertar(texto: string, apuntes: Apuntes): { salida: string; insertados: number } {
  const lineas = texto.split("\n");
  const salida: string[] = [];
  let insertados = 0;

  let preguntaActual: string | null = null;
  let enOptions = false;
  let opcionActual: string | null = null;
  let sangriaOpcion = "      ";

  const cerrarOpcion = (): void => {
    if (opcionActual === null || preguntaActual === null) return;
    const texto = apuntes[preguntaActual]?.[opcionActual];
    if (texto !== undefined) {
      salida.push(...lineasApunte(texto, sangriaOpcion));
      insertados += 1;
    }
    opcionActual = null;
  };

  /** ¿Esta línea es el apunte viejo de la opción que se está reescribiendo? */
  const esApunteReemplazado = (linea: string): boolean =>
    reemplazar &&
    opcionActual !== null &&
    preguntaActual !== null &&
    apuntes[preguntaActual]?.[opcionActual] !== undefined &&
    /^\s+rationale:/.test(linea);

  for (const linea of lineas) {
    const nuevaPregunta = /^- id:\s*(\S+)/.exec(linea);
    const nuevaOpcion = /^(\s+)- id:\s*(\S+)/.exec(linea);
    const claveDePregunta = /^ {2}\S/.test(linea);

    if (nuevaPregunta) {
      cerrarOpcion();
      preguntaActual = nuevaPregunta[1]!.replace(/["']/g, "");
      enOptions = false;
    } else if (enOptions && nuevaOpcion) {
      cerrarOpcion();
      opcionActual = nuevaOpcion[2]!.replace(/["']/g, "");
      sangriaOpcion = nuevaOpcion[1]! + "  "; // alineada con `text:`, no con el `-`
    } else if (claveDePregunta) {
      // Una clave de la pregunta (`correct:`, `explanation:`…) cierra `options:`.
      cerrarOpcion();
      enOptions = /^ {2}options:/.test(linea);
    }

    if (!esApunteReemplazado(linea)) salida.push(linea);
  }
  cerrarOpcion();

  return { salida: salida.join("\n"), insertados };
}

/** Copia de un objeto sin una de sus claves. */
function sinClave(obj: object, clave: string): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...obj };
  delete copia[clave];
  return copia;
}

/** Todo lo de una pregunta menos los apuntes: lo que NO puede haber cambiado. */
function sinApuntes(q: PreguntaCruda): unknown {
  return { ...q, options: q.options.map((o) => sinClave(o, "rationale")) };
}

const args = process.argv.slice(2);
/**
 * `--replace` reescribe apuntes que YA existen. Va detrás de un flag explícito
 * porque sobrescribir contenido curado no puede ser el comportamiento por
 * defecto de un script que se lanza a mano sobre un fichero de 1.500 líneas.
 */
const reemplazar = args.includes("--replace");
const [rutaYaml, rutaJson] = args.filter((a) => !a.startsWith("--"));
if (rutaYaml === undefined || rutaJson === undefined) {
  morir("uso: npx tsx scripts/add-rationales.ts <preguntas.yaml> <apuntes.json>");
}

const original = readFileSync(rutaYaml, "utf8");
const antes = parse(original) as PreguntaCruda[];
const apuntes = JSON.parse(readFileSync(rutaJson, "utf8")) as Apuntes;

// ── Validación ANTES de tocar nada ───────────────────────────────────────────
const porId = new Map(antes.map((q) => [q.id, q]));
for (const [qid, opciones] of Object.entries(apuntes)) {
  const q = porId.get(qid);
  if (q === undefined) morir(`la pregunta '${qid}' no está en ${rutaYaml}`);

  const suyas = q.options.map((o) => o.id).sort();
  const dadas = Object.keys(opciones).sort();

  // Al AÑADIR hay que cubrir la pregunta entera: media pregunta con apuntes
  // delata la respuesta. Al REESCRIBIR no, porque las demás opciones ya tienen
  // el suyo; exigirlo obligaría a tocar texto bueno para arreglar una línea.
  if (!reemplazar && suyas.join(",") !== dadas.join(",")) {
    morir(
      `'${qid}': los apuntes cubren [${dadas.join(", ")}] y la pregunta tiene [${suyas.join(", ")}].\n` +
        "  Media pregunta con apuntes delata la respuesta: o todas las opciones, o ninguna.",
    );
  }
  for (const oid of dadas) {
    if (!suyas.includes(oid)) morir(`'${qid}' no tiene ninguna opción '${oid}'`);
    if (reemplazar && q.options.find((o) => o.id === oid)!.rationale === undefined) {
      morir(`'${qid}' opción '${oid}' no tiene apunte que reescribir (quita --replace)`);
    }
  }
  for (const o of q.options) {
    if (o.rationale !== undefined && !reemplazar) {
      morir(`'${qid}' opción '${o.id}' ya tiene apunte (usa --replace para reescribirlo)`);
    }
    const nuevo = opciones[o.id];
    if (nuevo !== undefined && nuevo.trim().length === 0) {
      morir(`'${qid}' opción '${o.id}': apunte vacío`);
    }
  }
}

const { salida, insertados } = insertar(original, apuntes);

// ── Verificación: solo pueden haber aparecido apuntes ────────────────────────
let despues: PreguntaCruda[];
try {
  despues = parse(salida) as PreguntaCruda[];
} catch (err) {
  morir(`el resultado ya no es YAML válido: ${err instanceof Error ? err.message : String(err)}`);
}

if (despues.length !== antes.length) {
  morir(`el fichero tenía ${antes.length} preguntas y ahora tiene ${despues.length}`);
}
for (let i = 0; i < antes.length; i++) {
  const a = JSON.stringify(sinApuntes(antes[i]!));
  const b = JSON.stringify(sinApuntes(despues[i]!));
  if (a !== b) morir(`la pregunta '${antes[i]!.id}' ha cambiado en algo que no es el apunte`);
}

const esperados = Object.values(apuntes).reduce((n, o) => n + Object.keys(o).length, 0);
if (insertados !== esperados) {
  morir(`se esperaban ${esperados} apuntes y se han insertado ${insertados}`);
}

writeFileSync(rutaYaml, salida, "utf8");

const conApunte = despues.filter((q) => q.options.every((o) => o.rationale !== undefined)).length;
console.log(
  `✓ ${insertados} apuntes en ${Object.keys(apuntes).length} pregunta(s) de ${rutaYaml}\n` +
    `  cobertura del fichero: ${conApunte}/${despues.length} preguntas con apuntes completos`,
);
