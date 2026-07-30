#!/usr/bin/env -S npx tsx
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isSeq, parse, parseDocument } from "yaml";
import { mulberry32 } from "../src/core/random.js";

/**
 * Reparte la respuesta correcta entre las cuatro posiciones de cada pregunta de un
 * pack, reordenando los `options` DENTRO del YAML.
 *
 * Por qué existe: `verify-pack` avisaba de `sesgo-posicion` en `ai-ml-readiness`
 * porque 223 de 255 correctas estaban en la primera opción. aptus baraja las
 * opciones al presentarlas, así que la sesión nunca estuvo sesgada — pero el banco
 * en disco sí lo estaba, y un pack se lee y se reutiliza fuera de aptus.
 *
 * CÓMO, y es lo único que importa de este fichero:
 *
 * - Se mueve el par (id, text) ENTERO. No se renombran ids. El historial guardado
 *   apunta a `optionId` por pregunta (`answers: questionId -> selectedOptionId`):
 *   si la 'a' pasara a significar otro texto, las sesiones viejas se reevaluarían
 *   contra respuestas que nadie dio. Por eso `correct` tampoco se toca; lo que
 *   cambia es la POSICIÓN en la que aparece, que es justo lo que mide la auditoría.
 * - Semilla fija: dos ejecuciones sobre el mismo banco dan el mismo resultado.
 * - Se edita con `parseDocument` (no `parse` + `stringify`) para no perder los
 *   comentarios de cabecera de cada fichero.
 * - Al final se compara el YAML viejo con el nuevo pregunta a pregunta. Si el TEXTO
 *   de una sola correcta cambiara, el pack pasaría a mentir: el script aborta sin
 *   escribir nada. Un banco sesgado es un defecto; un banco que miente es basura.
 *
 * Uso: npx tsx scripts/repartir-correctas.ts <pack> [--dry-run]
 */

const SEMILLA = 20260730;

interface Opcion {
  id: string;
  text: string;
}
interface Pregunta {
  id: string;
  correct: string | string[];
  options: Opcion[];
}

/** Índice de la opción correcta, o -1 si es de respuesta múltiple / no resuelve. */
function posicionCorrecta(q: Pregunta): number {
  if (Array.isArray(q.correct)) return -1;
  return q.options.findIndex((o) => o.id === q.correct);
}

/**
 * Posiciones objetivo para `n` preguntas de `k` opciones: round-robin barajado.
 * Round-robin garantiza el reparto (nadie queda con el doble que otro); barajar
 * evita que la posición sea predecible por el orden del fichero, que sería cambiar
 * un sesgo por otro.
 */
function objetivos(n: number, k: number, rnd: () => number): number[] {
  const out = Array.from({ length: n }, (_, i) => i % k);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Permutación de índices que deja `desde` en `hasta` y baraja el resto. */
function permutacion(k: number, desde: number, hasta: number, rnd: () => number): number[] {
  const resto = Array.from({ length: k }, (_, i) => i).filter((i) => i !== desde);
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [resto[i], resto[j]] = [resto[j]!, resto[i]!];
  }
  const out: number[] = [];
  for (let p = 0; p < k; p++) out.push(p === hasta ? desde : resto.shift()!);
  return out;
}

/** Reparte un fichero de preguntas. Devuelve el YAML nuevo, o null si no hay nada. */
function repartirFichero(yamlText: string, rnd: () => number): string | null {
  const doc = parseDocument(yamlText);
  const raiz = doc.contents;
  if (!isSeq(raiz)) throw new Error("el fichero de preguntas no es una lista YAML");

  const preguntas = parse(yamlText) as Pregunta[];
  const elegibles = preguntas
    .map((q, i) => ({ q, i, pos: posicionCorrecta(q) }))
    .filter((e) => e.pos >= 0);

  if (elegibles.length === 0) return null;

  // Todas las preguntas del banco tienen 4 opciones; si algún día no fuera así, se
  // reparte por grupos del mismo tamaño para no sesgar las que tienen menos.
  const porTamano = new Map<number, typeof elegibles>();
  for (const e of elegibles) {
    const k = e.q.options.length;
    porTamano.set(k, [...(porTamano.get(k) ?? []), e]);
  }

  for (const [k, grupo] of [...porTamano.entries()].sort((a, b) => a[0] - b[0])) {
    const destinos = objetivos(grupo.length, k, rnd);
    grupo.forEach((e, n) => {
      const perm = permutacion(k, e.pos, destinos[n]!, rnd);
      const nodo = raiz.get(e.i, true);
      if (!isMap(nodo)) throw new Error(`${e.q.id}: la pregunta no es un mapa YAML`);
      const opciones = nodo.get("options", true);
      if (!isSeq(opciones)) throw new Error(`${e.q.id}: options no es una lista`);
      const originales = [...opciones.items];
      opciones.items = perm.map((p) => originales[p]!);
    });
  }

  return doc.toString({ lineWidth: 80 });
}

/**
 * El control que justifica el script. Compara banco viejo y nuevo:
 * misma pregunta, mismas opciones (id↔texto intactos) y —lo único que de verdad
 * importa— el TEXTO de la correcta idéntico. Lanza a la primera discrepancia.
 */
function verificar(antes: Pregunta[], despues: Pregunta[], fichero: string): void {
  const fallo = (m: string): never => {
    throw new Error(`${fichero}: ${m}`);
  };
  if (antes.length !== despues.length) fallo(`cambia el nº de preguntas`);

  for (let i = 0; i < antes.length; i++) {
    const a = antes[i]!;
    const b = despues[i]!;
    if (a.id !== b.id) fallo(`la pregunta ${i} cambia de id (${a.id} → ${b.id})`);
    if (JSON.stringify(a.correct) !== JSON.stringify(b.correct))
      fallo(`${a.id}: cambia 'correct' (${String(a.correct)} → ${String(b.correct)})`);
    if (a.options.length !== b.options.length) fallo(`${a.id}: cambia el nº de opciones`);

    const parA = JSON.stringify([...a.options].sort((x, y) => x.id.localeCompare(y.id)));
    const parB = JSON.stringify([...b.options].sort((x, y) => x.id.localeCompare(y.id)));
    if (parA !== parB) fallo(`${a.id}: algún par (id, texto) ha cambiado`);

    const textoA = a.options.find((o) => o.id === a.correct)?.text;
    const textoB = b.options.find((o) => o.id === b.correct)?.text;
    if (textoA !== textoB) fallo(`${a.id}: LA RESPUESTA CORRECTA CAMBIA DE TEXTO`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const pack = args.find((a) => !a.startsWith("--"));
  if (pack === undefined) {
    console.error("uso: npx tsx scripts/repartir-correctas.ts <pack> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const dir = join("packs", pack, "questions");
  const ficheros = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  const rnd = mulberry32(SEMILLA);
  const pendientes: { ruta: string; texto: string }[] = [];
  const reparto = new Map<number, number>();

  for (const f of ficheros) {
    const ruta = join(dir, f);
    const original = readFileSync(ruta, "utf8");
    const nuevo = repartirFichero(original, rnd);
    if (nuevo === null) {
      console.log(`  · ${f}: sin preguntas de correcta única, se deja igual`);
      continue;
    }

    const antes = parse(original) as Pregunta[];
    const despues = parse(nuevo) as Pregunta[];
    verificar(antes, despues, f); // lanza antes de escribir nada

    for (const q of despues) {
      const p = posicionCorrecta(q);
      if (p >= 0) reparto.set(p, (reparto.get(p) ?? 0) + 1);
    }
    pendientes.push({ ruta, texto: nuevo });
    console.log(`  ✓ ${f}: ${despues.length} preguntas repartidas`);
  }

  const total = [...reparto.values()].reduce((a, b) => a + b, 0);
  const linea = [...reparto.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, n]) => `${"abcdefgh"[p]}=${n} (${Math.round((n / total) * 100)}%)`)
    .join("  ");
  console.log(`\n  reparto por posición: ${linea}   [n=${total}]`);

  if (dryRun) {
    console.log("\n  --dry-run: no se ha escrito nada.");
    return;
  }
  for (const { ruta, texto } of pendientes) writeFileSync(ruta, texto, "utf8");
  console.log(`\n  escritos ${pendientes.length} fichero(s).`);
}

main();
