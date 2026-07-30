import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { loadPackDir } from "../../content/loader.js";
import { copyToSources, ingestDirectory } from "../../content/ingest.js";
import { briefFromCorpus, renderBrief, toKebab } from "../../core/brief.js";
import { heading } from "../theme.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKS_ROOT = join(ROOT, "packs");

export interface IngestOptions {
  /** Pack destino. Por defecto, el nombre de la carpeta ingerida. */
  pack?: string;
  /** Copiar el material a packs/<tema>/sources/ (por defecto sí). */
  copy: boolean;
}

/**
 * Subcomando `ingest <carpeta>`: convierte una carpeta de material en el punto de
 * partida de un pack — el material copiado a `sources/` y un `BRIEF.md` con los
 * temas que el material propone.
 *
 * NO genera preguntas. Esa es la parte que necesita entender el contenido, y este
 * comando no entiende nada: cuenta títulos y bytes. Separarlo es deliberado —
 * así la parte mecánica es determinista, auditable y sin red, y la parte que
 * juzga queda a la vista en un paso aparte (`aptus draft`, o a mano).
 */
export async function ingestCommand(dirArg: string, opts: IngestOptions): Promise<void> {
  const dir = resolve(dirArg);
  const packName = toKebab(opts.pack ?? basename(dir));

  if (packName.length === 0) {
    console.error("\n✗ No se puede deducir un nombre de pack de esa carpeta. Usa --pack <nombre>.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = ingestDirectory(dir);
  } catch (err) {
    console.error(
      `\n✗ No se puede leer la carpeta: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n" + heading(`Ingesta de ${dir}`));

  if (result.docs.length === 0) {
    console.error(
      `\n✗ No hay ningún fichero de texto legible en esa carpeta ` +
        `(${result.skipped.length} descartado(s)).\n` +
        "  aptus solo lee texto: convierte los PDF/docx antes de ingerirlos.\n",
    );
    process.exitCode = 1;
    return;
  }

  // Si el pack ya existe, sus dimensiones sirven para no proponer escribir lo que
  // ya está escrito. Si no existe, se ingiere igual: el brief es el primer paso.
  const packDir = join(PACKS_ROOT, packName);
  let existingDimensions: string[] = [];
  const existe = existsSync(join(packDir, "pack.yaml"));
  if (existe) {
    try {
      existingDimensions = loadPackDir(packDir).dimensions;
    } catch {
      // Un pack a medio hacer no debe bloquear la ingesta: solo se pierde el
      // contraste de cobertura, y eso se dice abajo.
      existingDimensions = [];
    }
  }

  const avisos: string[] = [];
  if (result.skipped.length > 0) {
    avisos.push(
      `${result.skipped.length} fichero(s) NO se han leído (ver la lista al final del brief): ` +
        "el temario de abajo no los tiene en cuenta.",
    );
  }
  if (!existe) {
    avisos.push(
      `El pack '${packName}' aún no existe: no hay dimensiones contra las que contrastar, ` +
        "así que todos los temas salen como nuevos.",
    );
  }

  const brief = briefFromCorpus(packName, result.docs, existingDimensions, avisos);

  // Lo descartado va DENTRO del brief, no solo por pantalla: si el brief se lee
  // dentro de una semana, el agujero tiene que seguir estando a la vista.
  let markdown = renderBrief(brief);
  if (result.skipped.length > 0) {
    markdown +=
      "\n## Material NO leído\n\n" +
      result.skipped.map((s) => `- \`${s.path}\` — ${s.reason}`).join("\n") +
      "\n";
  }

  mkdirSync(packDir, { recursive: true });
  const briefPath = join(packDir, "BRIEF.md");
  writeFileSync(briefPath, markdown, "utf8");

  // Esqueleto de pack.yaml si el tema es nuevo: sin él no hay pack sobre el que
  // seguir trabajando. `dimensions` sale VACÍO a propósito — los temas del brief
  // son títulos contados a máquina, y declararlos como dimensiones sería fingir
  // que ya está hecho el trabajo de agruparlos, que es justo lo que falta.
  if (!existe) {
    writeFileSync(
      join(packDir, "pack.yaml"),
      `# Pack creado por 'aptus ingest' desde ${dir}.\n` +
        "# Declara aquí tus dimensiones: agrupa los temas de BRIEF.md en 3-6 con nombre\n" +
        "# propio. Hasta que no estén declaradas, verify-pack avisará de cada pregunta.\n" +
        `name: "${packName}"\n` +
        'version: "0.1.0"\n' +
        "dimensions: []\n",
      "utf8",
    );
  }

  let copiados: string[] = [];
  if (opts.copy) {
    copiados = copyToSources(dir, result.docs, join(packDir, "sources"));
  }

  const kb = Math.round(result.bytes / 1024);
  console.log(
    `\n  ${pc.green("✓")} ${result.docs.length} documento(s) leídos (${kb} KB)` +
      (result.skipped.length > 0 ? pc.yellow(` · ${result.skipped.length} sin leer`) : ""),
  );
  if (copiados.length > 0) {
    console.log(
      `  ${pc.green("✓")} material copiado a ${pc.dim(join("packs", packName, "sources") + "/")}`,
    );
  }
  console.log(`  ${pc.green("✓")} brief escrito en ${pc.dim(join("packs", packName, "BRIEF.md"))}`);
  if (!existe) {
    console.log(
      `  ${pc.green("✓")} pack nuevo creado en ${pc.dim(join("packs", packName) + "/")} ${pc.dim("(sin dimensiones aún: decláralas tú)")}`,
    );
  }

  const nuevos = brief.topics.filter((t) => !t.covered);
  console.log(`\n  ${nuevos.length} tema(s) propuestos a partir de los títulos del material:`);
  for (const t of nuevos.slice(0, 8)) {
    console.log(
      `    • ${pc.cyan(t.name)} ${pc.dim(`— ${Math.round(t.weight * 100)}% del material`)}`,
    );
  }
  if (nuevos.length > 8) console.log(pc.dim(`    (y ${nuevos.length - 8} más en el brief)`));

  for (const a of avisos) console.log(`\n  ${pc.yellow("⚠")} ${pc.yellow(a)}`);

  console.log(
    "\n" +
      pc.dim(
        "  · Esto es un índice mecánico: agrupa títulos y cuenta bytes, no entiende el\n" +
          "    material. Revisa y agrupa los temas en 3-6 dimensiones antes de curar nada.\n" +
          `  · Siguiente paso: edita ${join("packs", packName, "BRIEF.md")}, luego cura las\n` +
          `    preguntas (a mano o con \`aptus draft ${packName}\`) y cierra con \`aptus verify-pack ${packName}\`.`,
      ) +
      "\n",
  );
}
