import { confirm, input, select } from "@inquirer/prompts";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import pc from "picocolors";
import { stringify } from "yaml";
import { copyToSources, ingestDirectory } from "../content/ingest.js";
import { declareDimension } from "../content/pack-edit.js";
import { draftQuestions, researchTopic } from "../content/draft.js";
import { briefFromCorpus, renderBrief, toKebab } from "../core/brief.js";
import { promptTheme } from "./theme.js";

/**
 * Añadir un tema nuevo sin salir del asistente: le pones nombre y le dices de
 * dónde sale — una carpeta de material, una oferta, o que lo busque el modelo.
 *
 * Lo que este flujo NO hace es meter el resultado en la sesión que estás a punto
 * de empezar. Un borrador recién generado no puede evaluarte: iría a `drafts/`,
 * y hasta que lo leas y lo promuevas no mide nada. Es la misma regla de siempre
 * —lo no revisado no te evalúa— aplicada aquí, donde es más tentador saltársela.
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

async function pickSource(): Promise<MaterialSource> {
  return await select<MaterialSource>({
    message: pc.bold("  ¿De dónde sale el material de ese tema?"),
    choices: [
      {
        value: "carpeta",
        name: "Una carpeta de material",
        description: "apuntes, temario, un repo — se lee, se copia a sources/ y se indexa",
      },
      {
        value: "oferta",
        name: "Una oferta de empleo (JD)",
        description: "el texto de la oferta marca qué hay que saber para ese puesto",
      },
      {
        value: "buscar",
        name: "Que lo busque el modelo",
        description:
          "investiga el tema en la web y deja el informe como material (necesita API key)",
      },
      {
        value: "ninguno",
        name: "Nada por ahora — solo declararla",
        description: "la dimensión queda declarada y vacía; le pones material después",
      },
    ],
    theme: promptTheme,
  });
}

/** Pide una ruta existente hasta que lo sea (o se cancele con Ctrl+C). */
async function askPath(message: string): Promise<string> {
  return await input({
    message: pc.bold(`  ${message}`),
    theme: promptTheme,
    validate: (v: string) => {
      const ruta = resolve(v.trim().replace(/^~/, process.env.HOME ?? "~"));
      if (v.trim().length === 0) return "Escribe una ruta.";
      return existsSync(ruta) ? true : `No existe: ${ruta}`;
    },
  });
}

/**
 * Ejecuta el flujo entero. Devuelve `null` si se cancela: cancelar aquí no debe
 * dejar un pack a medias más allá de lo ya escrito, que se reporta igualmente.
 */
export async function newDimensionFlow(
  packDir: string,
  packName: string,
  existing: readonly string[],
): Promise<NewDimensionResult | null> {
  try {
    const bruto = await input({
      message: pc.bold("  ¿Cómo se llama el tema nuevo?") + pc.dim("  (se guarda en kebab-case)"),
      theme: promptTheme,
      validate: (v: string) => validateDimensionName(v, existing),
    });
    const dimension = toKebab(bruto);

    const fuente = await pickSource();

    const written: string[] = [];
    const pending: string[] = [];
    const sourcesDir = join(packDir, "sources");
    let material = "";

    if (fuente === "carpeta") {
      const dir = resolve(
        (await askPath("¿Dónde está el material?")).trim().replace(/^~/, process.env.HOME ?? "~"),
      );
      const { docs, skipped } = ingestDirectory(dir);

      if (docs.length === 0) {
        console.log(
          `\n  ${pc.yellow("⚠")} No hay nada legible en esa carpeta; la dimensión se declara vacía.`,
        );
        pending.push("conseguir material: la carpeta no tenía texto que aptus sepa leer");
      } else {
        written.push(...copyToSources(dir, docs, sourcesDir).map((f) => join("sources", f)));
        const brief = briefFromCorpus(dimension, docs, existing);
        writeFileSync(join(packDir, `BRIEF-${dimension}.md`), renderBrief(brief), "utf8");
        written.push(`BRIEF-${dimension}.md`);
        console.log(
          `\n  ${pc.green("✓")} ${docs.length} documento(s) leídos` +
            (skipped.length > 0 ? pc.yellow(` · ${skipped.length} sin leer`) : ""),
        );
        if (skipped.length > 0) {
          pending.push(
            `${skipped.length} fichero(s) no se han leído (¿PDF?): conviértelos y repite la ingesta`,
          );
        }
      }
    } else if (fuente === "oferta") {
      const ruta = resolve(
        (await askPath("¿Dónde está el fichero de la oferta?"))
          .trim()
          .replace(/^~/, process.env.HOME ?? "~"),
      );
      // La oferta se guarda como material citable: es la definición de qué hay que
      // saber para ese puesto, en las palabras de quien contrata.
      mkdirSync(sourcesDir, { recursive: true });
      const destino = join(sourcesDir, `oferta-${basename(ruta).replace(/\.[^.]+$/, "")}.txt`);
      const { readFileSync } = await import("node:fs");
      writeFileSync(destino, readFileSync(ruta, "utf8"), "utf8");
      written.push(join("sources", basename(destino)));
      console.log(
        `\n  ${pc.green("✓")} oferta guardada como material en ${pc.dim(join("sources", basename(destino)))}`,
      );
    } else if (fuente === "buscar") {
      console.log(pc.dim(`\n  Investigando '${dimension}' en la web… (esto tarda)`));
      const informe = await researchTopic(
        dimension,
        `Es una dimensión del pack de evaluación '${packName}'.`,
      );
      mkdirSync(sourcesDir, { recursive: true });
      const destino = join(sourcesDir, `investigacion-${dimension}.md`);
      writeFileSync(
        destino,
        `# Investigación de '${dimension}'\n\n` +
          "> Generado por un LLM con búsqueda web. NO es una fuente auditada: verifica\n" +
          "> lo que uses de aquí antes de convertirlo en preguntas.\n\n" +
          informe,
        "utf8",
      );
      written.push(join("sources", basename(destino)));
      material = informe;
      console.log(
        `  ${pc.green("✓")} informe guardado en ${pc.dim(join("sources", basename(destino)))}`,
      );
      pending.push("verificar el informe: lo ha escrito un modelo, no una fuente auditada");
    }

    // La dimensión se declara pase lo que pase con el material: si no, se pierde
    // el nombre que acabas de elegir.
    const packYaml = join(packDir, "pack.yaml");
    if (existsSync(packYaml)) {
      const res = declareDimension(packYaml, dimension);
      if (res === "añadida") {
        written.push("pack.yaml");
        console.log(`  ${pc.green("✓")} '${dimension}' declarada en pack.yaml`);
      }
    }

    // El borrador es opcional y explícito: es lo único que gasta API.
    const quiereBorrador =
      fuente !== "ninguno" &&
      (await confirm({
        message: pc.bold(`  ¿Genero ya un borrador de preguntas de '${dimension}' con el LLM?`),
        default: false,
        theme: promptTheme,
      }));

    if (quiereBorrador) {
      console.log(pc.dim("\n  Escribiendo el borrador… (esto tarda; el modelo las está curando)"));
      const { valid, rejected } = await draftQuestions({
        dimension,
        count: 12,
        brief: null,
        material,
        existingStems: [],
        today: new Date().toISOString().slice(0, 10),
      });

      if (valid.length > 0) {
        const draftsDir = join(packDir, "drafts");
        mkdirSync(draftsDir, { recursive: true });
        writeFileSync(
          join(draftsDir, `${dimension}.yaml`),
          `# BORRADOR sin revisar — ${dimension}, generado por LLM.\n` +
            `# No evalúa: el loader solo lee questions/. Revísalo y luego:\n` +
            `#   aptus promote ${packName} ${dimension}\n` +
            stringify(valid),
          "utf8",
        );
        written.push(join("drafts", `${dimension}.yaml`));
        console.log(
          `  ${pc.green("✓")} ${valid.length} pregunta(s) en ${pc.dim(join("drafts", `${dimension}.yaml`))}` +
            (rejected.length > 0
              ? pc.yellow(` · ${rejected.length} descartada(s) por el schema`)
              : ""),
        );
        pending.push(
          `revisar el borrador y promoverlo: \`aptus promote ${packName} ${dimension}\``,
        );
      } else {
        console.log(`  ${pc.yellow("⚠")} No ha salido ninguna pregunta que pase el schema.`);
        pending.push("volver a intentar el borrador: no salió ninguna pregunta válida");
      }
    } else if (fuente !== "ninguno") {
      pending.push(`escribir las preguntas: a mano, o \`aptus draft ${packName} -d ${dimension}\``);
    } else {
      pending.push(`darle material: \`aptus ingest <carpeta> --pack ${packName}\``);
    }

    return { dimension, written, pending };
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") return null;
    throw err;
  }
}
