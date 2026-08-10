#!/usr/bin/env tsx
/**
 * Reescribe el TEXTO de los distractores de una pregunta, para corregir el sesgo
 * de longitud (`sesgo-longitud` en `aptus verify-pack`).
 *
 * Por qué existe: en estos packs la respuesta correcta es la más larga en el 98%
 * de las preguntas y mide más del triple que sus distractores, así que se aprueba
 * eligiendo la más larga sin leer. Barajar no lo corrige. La salida elegida es
 * DESARROLLAR LOS DISTRACTORES hasta una longitud comparable —lo que además los
 * hace más plausibles— en vez de recortar la correcta, que perdería el matiz que
 * la hace correcta.
 *
 * Este script es hermano de `add-rationales.ts` y comparte su principio: edición
 * textual y verificación posterior. Aquí la línea roja es más estricta todavía,
 * porque se está tocando lo que el test mide:
 *
 *   - La opción CORRECTA no se puede tocar. Ni su texto ni su id. Se bloquea.
 *   - No se pueden añadir, quitar ni reordenar opciones.
 *   - Enunciado, explicación, `correct`, dificultad, fuente y apuntes quedan igual.
 *   - Solo cambia el campo `text` de las opciones declaradas, que además deben ser
 *     distractores.
 *
 * Si algo de eso no se cumple tras el cambio, no se escribe nada.
 *
 * Uso:
 *   npx tsx scripts/rewrite-distractors.ts <preguntas.yaml> <textos.json>
 *
 * El JSON es `{ "<id-pregunta>": { "<id-distractor>": "texto nuevo", ... }, ... }`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

interface Opcion {
  id: string;
  text: string;
  rationale?: string;
}
interface Pregunta {
  id: string;
  correct: string | string[];
  options: Opcion[];
  [k: string]: unknown;
}
type Textos = Record<string, Record<string, string>>;

function morir(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

/** Un texto de opción, escapado como escalar de una línea. */
function lineaTexto(texto: string, sangria: string): string {
  return `${sangria}text: ${JSON.stringify(texto)}`;
}

/**
 * Sustituye el valor de `text:` en cada opción declarada.
 *
 * El valor puede venir plegado en varias líneas (el YAML original envuelve los
 * textos largos), así que se elimina el bloque entero: la línea `text:` y todas
 * las de continuación, que son las que tienen MÁS sangría que la clave y no son
 * otra clave ni el arranque de otra opción.
 */
function sustituir(texto: string, textos: Textos): { salida: string; cambios: number } {
  const lineas = texto.split("\n");
  const salida: string[] = [];
  let cambios = 0;

  let pregunta: string | null = null;
  let enOptions = false;
  let opcion: string | null = null;
  let sangria = "      ";
  let saltando = false; // dentro del bloque `text:` viejo que se está tirando

  for (const linea of lineas) {
    const nuevaPregunta = /^- id:\s*(\S+)/.exec(linea);
    const nuevaOpcion = /^(\s+)- id:\s*(\S+)/.exec(linea);
    const claveDePregunta = /^ {2}\S/.test(linea);
    const claveDeOpcion = /^\s+[a-zA-Z_]+:/.test(linea);

    if (saltando) {
      // El bloque viejo termina en cuanto aparece otra clave o el `- id:` siguiente.
      if (claveDeOpcion || nuevaOpcion || nuevaPregunta || claveDePregunta) saltando = false;
      else continue;
    }

    if (nuevaPregunta) {
      pregunta = nuevaPregunta[1]!.replace(/["']/g, "");
      enOptions = false;
      opcion = null;
    } else if (enOptions && nuevaOpcion) {
      opcion = nuevaOpcion[2]!.replace(/["']/g, "");
      sangria = nuevaOpcion[1]! + "  ";
    } else if (claveDePregunta) {
      enOptions = /^ {2}options:/.test(linea);
      opcion = null;
    }

    const nuevo =
      pregunta !== null && opcion !== null && /^\s+text:/.test(linea)
        ? textos[pregunta]?.[opcion]
        : undefined;

    if (nuevo !== undefined) {
      salida.push(lineaTexto(nuevo, sangria));
      cambios += 1;
      saltando = true;
      continue;
    }

    salida.push(linea);
  }

  return { salida: salida.join("\n"), cambios };
}

/** Todo lo de una pregunta menos los textos de opción: lo intocable. */
function esqueleto(q: Pregunta): unknown {
  return {
    ...q,
    options: q.options.map((o) => {
      const copia: Record<string, unknown> = { ...o };
      delete copia["text"];
      return copia;
    }),
  };
}

const [rutaYaml, rutaJson] = process.argv.slice(2);
if (rutaYaml === undefined || rutaJson === undefined) {
  morir("uso: npx tsx scripts/rewrite-distractors.ts <preguntas.yaml> <textos.json>");
}

const original = readFileSync(rutaYaml, "utf8");
const antes = parse(original) as Pregunta[];
const textos = JSON.parse(readFileSync(rutaJson, "utf8")) as Textos;
const porId = new Map(antes.map((q) => [q.id, q]));

// ── Validación: nada de esto puede llegar al disco ───────────────────────────
for (const [qid, opciones] of Object.entries(textos)) {
  const q = porId.get(qid);
  if (q === undefined) morir(`la pregunta '${qid}' no está en ${rutaYaml}`);
  const correctas = Array.isArray(q.correct) ? q.correct : [q.correct];

  for (const [oid, nuevo] of Object.entries(opciones)) {
    const o = q.options.find((x) => x.id === oid);
    if (o === undefined) morir(`'${qid}' no tiene ninguna opción '${oid}'`);
    if (correctas.includes(oid)) {
      morir(
        `'${qid}' opción '${oid}' es la CORRECTA: este script solo reescribe distractores.\n` +
          "  Tocar la respuesta buena cambia lo que la pregunta mide.",
      );
    }
    if (nuevo.trim().length === 0) morir(`'${qid}' opción '${oid}': texto vacío`);
  }
}

const { salida, cambios } = sustituir(original, textos);

// ── Verificación: solo pueden haber cambiado los textos declarados ───────────
let despues: Pregunta[];
try {
  despues = parse(salida) as Pregunta[];
} catch (err) {
  morir(`el resultado ya no es YAML válido: ${err instanceof Error ? err.message : String(err)}`);
}
if (despues.length !== antes.length) morir("ha cambiado el número de preguntas");

for (let i = 0; i < antes.length; i++) {
  const a = antes[i]!;
  const b = despues[i]!;
  if (JSON.stringify(esqueleto(a)) !== JSON.stringify(esqueleto(b))) {
    morir(`'${a.id}': ha cambiado algo que no es el texto de un distractor`);
  }
  for (let j = 0; j < a.options.length; j++) {
    const esperado = textos[a.id]?.[a.options[j]!.id] ?? a.options[j]!.text;
    if (b.options[j]!.text !== esperado) morir(`'${a.id}' opción '${a.options[j]!.id}': texto inesperado`);
  }
}

const esperados = Object.values(textos).reduce((n, o) => n + Object.keys(o).length, 0);
if (cambios !== esperados) morir(`se esperaban ${esperados} cambios y se han hecho ${cambios}`);

writeFileSync(rutaYaml, salida, "utf8");

/** Cuántas preguntas siguen teniendo la correcta como la más larga, y por cuánto. */
function sesgo(qs: Pregunta[]): string {
  let masLarga = 0;
  let total = 0;
  let ratio = 0;
  for (const q of qs) {
    if (Array.isArray(q.correct)) continue;
    const buena = q.options.find((o) => o.id === q.correct);
    const otras = q.options.filter((o) => o.id !== q.correct);
    if (!buena || otras.length === 0) continue;
    total += 1;
    if (buena.text.length > Math.max(...otras.map((o) => o.text.length))) masLarga += 1;
    ratio += buena.text.length / (otras.reduce((n, o) => n + o.text.length, 0) / otras.length);
  }
  return `${Math.round((masLarga / total) * 100)}% la más larga · ${(ratio / total).toFixed(1)}× de media`;
}

/** De las preguntas tocadas, cuáles SIGUEN teniendo la correcta como la más larga. */
function sinFlipar(qs: Pregunta[]): string[] {
  return qs
    .filter((q) => textos[q.id] !== undefined && !Array.isArray(q.correct))
    .filter((q) => {
      const buena = q.options.find((o) => o.id === q.correct)!;
      const otras = q.options.filter((o) => o.id !== q.correct);
      return buena.text.trim().length > Math.max(...otras.map((o) => o.text.trim().length));
    })
    .map((q) => {
      const buena = q.options.find((o) => o.id === q.correct)!.text.trim().length;
      const otras = q.options.filter((o) => o.id !== q.correct);
      const max = Math.max(...otras.map((o) => o.text.trim().length));
      return `${q.id} (correcta ${buena}, mayor distractor ${max}: faltan ${buena - max + 1})`;
    });
}

const pendientes = sinFlipar(despues);

console.log(
  `✓ ${cambios} distractores reescritos en ${Object.keys(textos).length} pregunta(s) de ${rutaYaml}\n` +
    `  antes:  ${sesgo(antes)}\n  ahora:  ${sesgo(despues)}` +
    (pendientes.length === 0
      ? ""
      : `\n  siguen con la correcta como la más larga (${pendientes.length}):\n    ` +
        pendientes.join("\n    ")),
);
