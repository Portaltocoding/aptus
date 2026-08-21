import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { copyToSources, ingestDirectory } from "../../content/ingest.js";
import {
  hasApiCredentials,
  planDimensions,
  researchTopic,
  type DimensionPlan,
} from "../../content/draft.js";
import { aptusPaths, assertPackName, packDirForWrite } from "../../content/paths.js";
import { briefFileName, toKebab, type CorpusDoc } from "../../core/brief.js";
import { heading } from "../theme.js";
import {
  planTema,
  pendienteDelTema,
  renderBriefDeTema,
  renderPackYaml,
  type DimensionEscrita,
  type FuenteMaterial,
  type TemaOptions,
} from "../tema-plan.js";
import { draftCommand } from "./draft.js";

/** Techo de material que se manda a planificar: más que esto es coste sin señal. */
const MAX_MATERIAL_CHARS = 120_000;

/**
 * Subcomando `tema <nombre>`: de un tema a un pack, de una pasada.
 *
 * Es el comando que hace falta cuando aptus viene vacío. Antes, montar un tema
 * eran cuatro comandos y un asistente escondido dentro de `start`: crear el pack,
 * conseguir material, decidir las dimensiones a mano y llamar a `draft` una vez
 * por cada una. Todo eso sigue existiendo por separado —y sigue siendo la vía si
 * quieres control fino—; esto es la línea recta.
 *
 * Lo que este comando NO hace, y es deliberado: dejarte un pack que ya te evalúa.
 * Todo lo que escribe el modelo aterriza en `drafts/`, que el loader no mira. El
 * argumento entero de aptus es que no te mienta sobre lo que sabes, y unas
 * preguntas que nadie ha leído pueden medirte contra una respuesta que está mal.
 * El último paso —revisar y promover— es tuyo, y por eso el resumen final lo dice
 * en vez de celebrar seis ficheros nuevos.
 */
export async function temaCommand(nombre: string, opts: TemaOptions): Promise<void> {
  let plan;
  let packDir;
  try {
    assertPackName(nombre);
    plan = planTema(opts);
    packDir = packDirForWrite(nombre);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  if (existsSync(join(packDir, "pack.yaml"))) {
    console.error(
      `\n✗ Ya tienes un pack '${nombre}' en ${packDir}.\n` +
        `  Para añadirle un tema más: \`aptus draft ${nombre} -d <dimension>\`.\n`,
    );
    process.exitCode = 1;
    return;
  }

  // Las credenciales se comprueban ANTES de crear nada. Sin ellas no hay ni plan
  // ni borradores, y dejar un pack vacío a medio nacer sería peor que no empezar.
  if (!hasApiCredentials()) {
    console.error(
      `\n✗ \`aptus tema\` sale a la red y necesita credenciales de la API de Anthropic\n` +
        `  (ANTHROPIC_API_KEY, o un perfil de \`ant auth login\`).\n\n` +
        `  Sin ellas puedes montar el tema a mano: \`aptus new-pack ${nombre}\`, o partir de\n` +
        `  material tuyo con \`aptus ingest <carpeta>\`. El resto de aptus funciona igual.\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n" + heading(`Tema nuevo — ${nombre}`));

  const sourcesDir = join(packDir, "sources");
  mkdirSync(sourcesDir, { recursive: true });

  let material: string;
  let fuentes: string[];
  try {
    ({ material, fuentes } = await reunirMaterial(nombre, plan.fuente, opts.material, sourcesDir));
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  // Las dimensiones se deciden y se ENSEÑAN antes de escribir ni una pregunta:
  // son el esqueleto del pack, y corregirlas ahora cuesta una línea.
  let dimensiones: DimensionPlan[];
  if (plan.dimensiones !== null) {
    dimensiones = plan.dimensiones.map((name) => ({ name, foco: "Dimensión que has fijado tú." }));
    console.log(`\n  ${pc.dim("Dimensiones:")} las que has pedido`);
  } else {
    console.log(pc.dim("\n  Partiendo el tema en dimensiones…"));
    try {
      dimensiones = await planDimensions(nombre, material.slice(0, MAX_MATERIAL_CHARS));
    } catch (err) {
      console.error(`\n✗ No se ha podido partir el tema: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
      return;
    }
  }

  for (const d of dimensiones) console.log(`    · ${pc.bold(d.name)} ${pc.dim("—")} ${d.foco}`);

  writeFileSync(
    join(packDir, "pack.yaml"),
    renderPackYaml(nombre, dimensiones.map((d) => d.name)),
    "utf8",
  );
  mkdirSync(join(packDir, "questions"), { recursive: true });
  writeFileSync(
    join(packDir, briefFileName(null)),
    renderBriefDeTema(nombre, dimensiones, plan.fuente, fuentes),
    "utf8",
  );

  // Una llamada por dimensión, y en serie a propósito: cada `draft` manda las
  // preguntas ya escritas para no repetirse, así que la sexta sabe lo que dijeron
  // las cinco anteriores. En paralelo serían seis bancos que se solapan.
  const escritas: DimensionEscrita[] = [];
  for (const d of dimensiones) {
    await draftCommand(nombre, { dimension: d.name, count: plan.count });
    const borrador = join(packDir, "drafts", `${d.name}.yaml`);
    if (existsSync(borrador)) {
      const preguntas = (readFileSync(borrador, "utf8").match(/^- id:/gm) ?? []).length;
      escritas.push({ dimension: d.name, preguntas });
    }
  }

  console.log("\n" + heading(`Qué hay y qué falta — ${nombre}`) + "\n");
  console.log(`  ${pc.green("✓")} Pack en ${pc.dim(packDir)}`);
  console.log(
    `  ${pc.green("✓")} ${escritas.length}/${dimensiones.length} dimensiones con borrador` +
      pc.dim(` · ${escritas.reduce((a, d) => a + d.preguntas, 0)} preguntas sin revisar`),
  );
  console.log(
    "\n" +
      pc.yellow("  ⚠ Todavía no te evalúa, y esa es la idea.") +
      pc.dim(" Lo ha escrito un modelo y nadie lo ha leído.\n"),
  );
  for (const paso of pendienteDelTema(nombre, escritas)) console.log(pc.dim(`  · ${paso}`));
  console.log("");

  if (aptusPaths().packsDir !== packDir) {
    console.log(pc.dim(`  (tus packs viven en ${aptusPaths().packsDir})\n`));
  }
}

/**
 * El material del que van a salir las preguntas: o una carpeta tuya, o lo que el
 * modelo encuentre en la web. En los dos casos aterriza en `sources/` como
 * fichero citable, porque el `source` de una pregunta tiene que poder apuntarlo.
 */
async function reunirMaterial(
  tema: string,
  fuente: FuenteMaterial,
  carpeta: string | undefined,
  sourcesDir: string,
): Promise<{ material: string; fuentes: string[] }> {
  if (fuente === "carpeta") {
    const { docs, skipped, bytes } = await ingestDirectory(carpeta!);
    if (docs.length === 0) {
      throw new Error(`No se ha podido leer nada de ${carpeta}: sin material no hay pack.`);
    }
    const fuentes = copyToSources(carpeta!, docs, sourcesDir);
    console.log(
      `\n  ${pc.dim("Material:")} ${docs.length} fichero(s), ${Math.round(bytes / 1024)} KB` +
        (skipped.length > 0 ? pc.yellow(` · ${skipped.length} sin leer`) : ""),
    );
    // Lo que no se ha podido leer se dice SIEMPRE: si no, el pack parecería cubrir
    // material que en realidad se quedó fuera.
    for (const s of skipped.slice(0, 5)) console.log(pc.dim(`    ✗ ${s.path}: ${s.reason}`));
    if (skipped.length > 5) console.log(pc.dim(`    (y ${skipped.length - 5} más)`));

    return { material: componer(docs), fuentes };
  }

  console.log(pc.dim("\n  Investigando el tema en la web… (esto tarda)"));
  const informe = await researchTopic(tema, null);
  const nombreFichero = `investigacion-${toKebab(tema)}.md`;
  writeFileSync(
    join(sourcesDir, nombreFichero),
    `# Investigación de '${tema}'\n\n` +
      `> Lo que un modelo ha encontrado en la web, NO una fuente auditada. Vive en\n` +
      `> \`sources/\` para poder citarse, con la misma desconfianza que merece.\n\n` +
      informe,
    "utf8",
  );
  console.log(`  ${pc.green("✓")} ${pc.dim(`sources/${nombreFichero}`)}`);

  return { material: informe, fuentes: [nombreFichero] };
}

function componer(docs: readonly CorpusDoc[]): string {
  let total = 0;
  const trozos: string[] = [];
  for (const doc of docs) {
    if (total + doc.text.length > MAX_MATERIAL_CHARS) break;
    total += doc.text.length;
    trozos.push(`--- ${doc.path} ---\n${doc.text}`);
  }
  return trozos.join("\n\n");
}
