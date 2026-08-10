#!/usr/bin/env tsx
/**
 * Vuelca preguntas con la LONGITUD de cada opción y marca la correcta, para
 * trabajar el sesgo de longitud (`sesgo-longitud` en `aptus verify-pack`).
 *
 * Es la vista opuesta a `show-questions.ts`, que esconde la correcta a propósito
 * porque escribir apuntes sabiendo la respuesta acaba delatándola. Aquí hay que
 * verla: se están reescribiendo los distractores y un distractor desarrollado sin
 * saber cuál es la buena acaba siendo verdad sin querer.
 *
 * Uso:
 *   npx tsx scripts/show-bias.ts <preguntas.yaml> [desde] [cuantas]
 *   npx tsx scripts/show-bias.ts <preguntas.yaml> --resumen
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface Q {
  id: string;
  subtopic?: string;
  difficulty: string;
  stem: string;
  correct: string | string[];
  options: { id: string; text: string }[];
}

const [ruta, arg1, arg2] = process.argv.slice(2);
if (ruta === undefined) {
  console.error("uso: npx tsx scripts/show-bias.ts <preguntas.yaml> [desde] [cuantas]");
  process.exit(1);
}

const todas = parse(readFileSync(ruta, "utf8")) as Q[];

/** ¿Sigue siendo la correcta la más larga? Es la condición que hay que romper. */
function delata(q: Q): boolean {
  if (Array.isArray(q.correct)) return false;
  const buena = q.options.find((o) => o.id === q.correct);
  const otras = q.options.filter((o) => o.id !== q.correct);
  if (!buena || otras.length === 0) return false;
  return buena.text.trim().length > Math.max(...otras.map((o) => o.text.trim().length));
}

const pendientes = todas.filter(delata);

if (arg1 === "--resumen") {
  const total = todas.filter((q) => !Array.isArray(q.correct)).length;
  console.log(
    `${pendientes.length}/${total} (${Math.round((pendientes.length / total) * 100)}%) con la correcta como la más larga en ${ruta}`,
  );
  process.exit(0);
}

const desde = Number.parseInt(arg1 ?? "0", 10);
const cuantas = Number.parseInt(arg2 ?? "8", 10);

for (const q of pendientes.slice(desde, desde + cuantas)) {
  console.log(`\n### ${q.id}  [${q.subtopic ?? "-"} · ${q.difficulty}]`);
  console.log(q.stem);
  for (const o of q.options) {
    const marca = o.id === q.correct ? "✔" : " ";
    console.log(`  ${marca} (${o.id}) [${String(o.text.trim().length).padStart(3)}] ${o.text}`);
  }
}
console.log(
  `\n--- mostradas ${Math.min(cuantas, Math.max(0, pendientes.length - desde))} de ${pendientes.length} pendientes`,
);
