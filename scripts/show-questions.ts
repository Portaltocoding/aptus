#!/usr/bin/env tsx
/**
 * Vuelca preguntas de un fichero en formato compacto: id, enunciado y opciones,
 * sin explicación ni metadatos.
 *
 * Es la vista que hace falta para escribir los apuntes de opción (`rationale`):
 * hay que ver la pregunta y las cuatro respuestas, y NO conviene ver cuál es la
 * correcta —un apunte que se escribe sabiendo la respuesta acaba delatándola sin
 * querer, argumentando mejor la buena que las otras—.
 *
 * Uso:
 *   npx tsx scripts/show-questions.ts <preguntas.yaml> [desde] [cuantas]
 *   npx tsx scripts/show-questions.ts <preguntas.yaml> --faltan
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface Q {
  id: string;
  subtopic?: string;
  difficulty: string;
  stem: string;
  options: { id: string; text: string; rationale?: string }[];
}

const [ruta, arg1, arg2] = process.argv.slice(2);
if (ruta === undefined) {
  console.error("uso: npx tsx scripts/show-questions.ts <preguntas.yaml> [desde] [cuantas]");
  process.exit(1);
}

const todas = parse(readFileSync(ruta, "utf8")) as Q[];
const pendientes = todas.filter((q) => q.options.some((o) => o.rationale === undefined));

if (arg1 === "--faltan") {
  console.log(`${pendientes.length} de ${todas.length} preguntas sin apuntes en ${ruta}`);
  if (pendientes.length > 0) console.log(pendientes.map((q) => q.id).join(" "));
  process.exit(0);
}

const desde = Number.parseInt(arg1 ?? "0", 10);
const cuantas = Number.parseInt(arg2 ?? "12", 10);

// Se listan SOLO las que aún no tienen apuntes: así el trabajo avanza sin llevar
// la cuenta a mano y sin volver a leer lo ya escrito.
for (const q of pendientes.slice(desde, desde + cuantas)) {
  console.log(`\n### ${q.id}  [${q.subtopic ?? "-"} · ${q.difficulty}]`);
  console.log(q.stem);
  for (const o of q.options) console.log(`  (${o.id}) ${o.text}`);
}
console.log(`\n--- mostradas ${Math.min(cuantas, Math.max(0, pendientes.length - desde))} de ${pendientes.length} pendientes`);
