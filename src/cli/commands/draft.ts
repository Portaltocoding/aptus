import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { stringify } from "yaml";
import { loadPackDir } from "../../content/loader.js";
import { packDirForWrite } from "../../content/paths.js";
import { draftQuestions } from "../../content/draft.js";
import { auditPack } from "../../core/pack-audit.js";
import { heading } from "../theme.js";

/** Techo de material que se manda al modelo: más que esto es coste sin señal. */
const MAX_MATERIAL_CHARS = 120_000;

export interface DraftOptions {
  dimension: string;
  count: number;
}

/**
 * Subcomando `draft <tema>`: pide a un LLM un BORRADOR de preguntas a partir del
 * brief y del material del pack.
 *
 * Tres decisiones que definen este comando:
 *
 * 1. **Escribe en `drafts/`, nunca en `questions/`.** El loader solo mira
 *    `questions/`, así que un borrador NO se puede usar para evaluarte por
 *    accidente. Hace falta `aptus promote` — un paso explícito, después de leerlo.
 * 2. **Valida contra el mismo schema que un pack real.** Lo que no pasa se
 *    descarta y se dice. El modelo no tiene un contrato más laxo que tú.
 * 3. **Es opt-in y aislado.** Es lo único de aptus que sale a la red y necesita
 *    credenciales; todo lo demás funciona igual sin tocar esto.
 */
export async function draftCommand(packName: string, opts: DraftOptions): Promise<void> {
  // draft ESCRIBE dentro del pack (drafts/), así que el directorio sale del
  // resolvedor de escritura: un pack que solo viene con la instalación no se toca.
  let packDir;
  try {
    packDir = packDirForWrite(packName);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(join(packDir, "pack.yaml"))) {
    console.error(
      `\n✗ No existe el pack '${packName}'. Créalo con \`aptus new-pack ${packName}\` o \`aptus ingest\`.`,
    );
    process.exitCode = 1;
    return;
  }

  // El material y las preguntas ya escritas se leen ANTES de gastar una llamada:
  // si el pack no carga, mejor fallar aquí que a mitad.
  const briefPath = join(packDir, "BRIEF.md");
  const brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : null;

  const sourcesDir = join(packDir, "sources");
  let material = "";
  if (existsSync(sourcesDir) && statSync(sourcesDir).isDirectory()) {
    const trozos: string[] = [];
    let total = 0;
    for (const f of readdirSync(sourcesDir).sort()) {
      const full = join(sourcesDir, f);
      if (!statSync(full).isFile()) continue;
      let texto;
      try {
        texto = readFileSync(full, "utf8");
      } catch {
        continue; // binario: ya se avisó en la ingesta
      }
      if (total + texto.length > MAX_MATERIAL_CHARS) break;
      total += texto.length;
      trozos.push(`--- ${f} ---\n${texto}`);
    }
    material = trozos.join("\n\n");
  }

  // Las preguntas ya escritas se mandan para que no las repita. Un pack aún sin
  // preguntas no carga, y eso es lo normal en un tema nuevo: no es un error.
  let existingStems: string[];
  try {
    existingStems = loadPackDir(packDir)
      .questions.filter((q) => q.dimension === opts.dimension)
      .map((q) => q.stem);
  } catch {
    existingStems = [];
  }

  console.log("\n" + heading(`Borrador — ${packName} · ${opts.dimension}`));
  console.log(
    `\n  ${pc.dim("Material:")} ${material.length > 0 ? `${Math.round(material.length / 1024)} KB` : pc.yellow("ninguno")}` +
      ` · ${pc.dim("Brief:")} ${brief !== null ? "sí" : pc.yellow("no")}` +
      ` · ${pc.dim("Ya escritas:")} ${existingStems.length}`,
  );
  console.log(
    pc.dim(`  Pidiendo hasta ${opts.count} preguntas… (esto tarda; el modelo las está curando)\n`),
  );

  let result;
  try {
    result = await draftQuestions({
      dimension: opts.dimension,
      count: opts.count,
      brief,
      material,
      existingStems,
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ No se ha podido generar el borrador: ${msg}`);
    if (/api.?key|authentication|credential/i.test(msg)) {
      console.error(
        pc.dim(
          "  `aptus draft` es lo único de aptus que sale a la red: necesita credenciales de la API\n" +
            "  de Anthropic (ANTHROPIC_API_KEY, o un perfil de `ant auth login`). El resto del CLI\n" +
            "  funciona igual sin ellas.",
        ),
      );
    }
    process.exitCode = 1;
    return;
  }

  if (result.valid.length === 0) {
    console.error(
      "\n✗ No ha salido ni una pregunta que pase el schema del pack. No se escribe nada.\n",
    );
    process.exitCode = 1;
    return;
  }

  const draftsDir = join(packDir, "drafts");
  mkdirSync(draftsDir, { recursive: true });
  const destino = join(draftsDir, `${opts.dimension}.yaml`);

  const cabecera =
    `# BORRADOR sin revisar — dimensión ${opts.dimension}, generado por LLM el ${new Date().toISOString().slice(0, 10)}.\n` +
    "# NO se evalúa con esto: el loader solo lee questions/. Revisa cada respuesta y su\n" +
    `# explicación, y cuando te fíes: aptus promote ${packName} ${opts.dimension}\n`;
  writeFileSync(destino, cabecera + stringify(result.valid), "utf8");

  console.log(
    `  ${pc.green("✓")} ${result.valid.length} pregunta(s) escritas en ${pc.dim(destino)}`,
  );

  // Lo descartado se dice siempre: si el modelo ha fallado 8 de 12, eso es una
  // señal sobre el borrador entero, no un detalle que esconder.
  if (result.rejected.length > 0) {
    console.log(
      `  ${pc.yellow("⚠")} ${result.rejected.length} descartada(s) por no pasar el schema del pack:`,
    );
    for (const r of result.rejected.slice(0, 5)) {
      console.log(pc.dim(`      ${r.id}: ${r.reason}`));
    }
    if (result.rejected.length > 5)
      console.log(pc.dim(`      (y ${result.rejected.length - 5} más)`));
  }

  console.log(
    "\n" +
      pc.yellow("  ⚠ Esto es un borrador de un LLM, no un pack.") +
      pc.dim(
        " Puede tener respuestas mal.\n" +
          "    Todo el valor de aptus es que no te mienta sobre lo que sabes, así que léelo\n" +
          "    entero antes de promoverlo. Mientras siga en drafts/, no te evalúa.\n" +
          `  · Cuando lo hayas revisado: \`aptus promote ${packName} ${opts.dimension}\`\n`,
      ),
  );
}

/**
 * Subcomando `promote <tema> <dimensión>`: mueve un borrador revisado de
 * `drafts/` a `questions/`, que es lo que convierte unas preguntas en evaluables.
 *
 * Audita ANTES de mover y aborta si hay errores: la puerta de calidad se pasa a la
 * entrada, no después de que el pack ya te esté midiendo.
 */
export async function promoteCommand(packName: string, dimension: string): Promise<void> {
  // promote MUEVE ficheros dentro del pack: mismo resolvedor de escritura.
  let packDir;
  try {
    packDir = packDirForWrite(packName);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const origen = join(packDir, "drafts", `${dimension}.yaml`);
  const destino = join(packDir, "questions", `${dimension}.yaml`);

  if (!existsSync(origen)) {
    console.error(
      `\n✗ No hay borrador de '${dimension}' en '${packName}'. Genéralo con \`aptus draft ${packName} -d ${dimension}\`.`,
    );
    process.exitCode = 1;
    return;
  }
  if (existsSync(destino)) {
    console.error(
      `\n✗ Ya existe ${destino}.\n` +
        "  No se sobrescribe contenido ya curado: fusiónalo tú a mano.",
    );
    process.exitCode = 1;
    return;
  }

  // Se mueve, se audita el pack resultante y —si hay errores— se deshace. Un pack
  // roto que ya te está evaluando es peor que un promote fallido.
  mkdirSync(join(packDir, "questions"), { recursive: true });
  renameSync(origen, destino);

  let report;
  try {
    report = auditPack(loadPackDir(packDir));
  } catch (err) {
    renameSync(destino, origen);
    console.error(
      `\n✗ El pack no carga con ese borrador dentro, así que se ha deshecho el movimiento:\n  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (report.errors.length > 0) {
    renameSync(destino, origen);
    console.error(
      `\n✗ La auditoría da ${report.errors.length} error(es); el borrador vuelve a drafts/:`,
    );
    for (const e of report.errors.slice(0, 5)) console.error(`  · [${e.code}] ${e.message}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n  ${pc.green("✓")} '${dimension}' promovida a ${pc.dim(join(packDir, "questions"))} — ya es evaluable.`,
  );
  if (report.warnings.length > 0) {
    console.log(
      `  ${pc.yellow("⚠")} ${report.warnings.length} aviso(s): revísalos con \`aptus verify-pack ${packName}\`.`,
    );
  }
  console.log("");
}
