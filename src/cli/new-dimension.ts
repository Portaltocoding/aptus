import { checkbox, confirm, editor, input, select } from "@inquirer/prompts";
import {
  existsSync,
  mkdirSync,
  opendirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import pc from "picocolors";
import { stringify } from "yaml";
import { copyToSources, ingestDirectory } from "../content/ingest.js";
import { declareDimension } from "../content/pack-edit.js";
import { draftQuestions, hasApiCredentials, researchTopic } from "../content/draft.js";
import {
  briefFileName,
  briefFromCorpus,
  renderBrief,
  toKebab,
  type CorpusDoc,
} from "../core/brief.js";
import {
  admiteBorrador,
  browseChoices,
  editorDePegado,
  investigacionSourceName,
  materialParaBorrador,
  materialUtil,
  nombreLibre,
  ofertaSourceName,
  ordenarFuentes,
  pegadoSourceName,
  planNewDimension,
  renderSkeleton,
  sourceChoices,
  sourceDelEsqueleto,
  validateDimensionName,
  SIN_FUENTES_HINT,
  type BorradorOutcome,
  type BrowseChoice,
  type EsqueletoOutcome,
  type MaterialOutcome,
  type MaterialSource,
  type NewDimensionResult,
} from "./new-dimension-plan.js";
import { promptTheme } from "./theme.js";

/**
 * Añadir un tema nuevo sin salir del asistente: le pones nombre y le dices de
 * dónde sale el material — una carpeta, un fichero suelto, o que lo busque el
 * modelo. Las fuentes se COMBINAN: se marcan las que hagan falta, se recorren en
 * orden y todo lo que produzcan se acumula en `sources/` y alimenta el mismo brief.
 *
 * Lo que este flujo NO hace es meter el resultado en la sesión que estás a punto
 * de empezar. Un borrador recién generado no puede evaluarte: iría a `drafts/`,
 * y hasta que lo leas y lo promuevas no mide nada. Es la misma regla de siempre
 * —lo no revisado no te evalúa— aplicada aquí, donde es más tentador saltársela.
 *
 * Este fichero solo pinta y toca disco: QUÉ se ofrece y QUÉ queda pendiente lo
 * decide `new-dimension-plan.ts`, que es puro y se comprueba sin abrir un terminal.
 */

export type { MaterialSource, NewDimensionResult } from "./new-dimension-plan.js";
export { validateDimensionName } from "./new-dimension-plan.js";

/**
 * Las opciones salen de `sourceChoices`, que decide qué se puede ofrecer. Aquí solo
 * se pintan: sin credenciales, "que lo busque el modelo" aparece deshabilitada con
 * el motivo al lado en vez de dejarte elegirla para fallar tres pasos después.
 *
 * Es una lista de marcar y no un `select` porque las fuentes no son excluyentes:
 * una carpeta de apuntes Y la oferta que los pone en contexto es el caso normal,
 * no la excepción. No marcar ninguna es una respuesta válida: declara el tema vacío.
 */
async function pickSources(tieneApiKey: boolean): Promise<MaterialSource[]> {
  return await checkbox<MaterialSource>({
    message:
      pc.bold("  ¿De dónde sale el material de ese tema?") +
      pc.dim(`  (marca las que quieras; ${SIN_FUENTES_HINT})`),
    choices: sourceChoices(tieneApiKey).map((c) => ({
      value: c.value,
      name: c.name,
      description: c.description,
      disabled: c.disabled === null ? false : `(${c.disabled})`,
    })),
    // Sin marcar nada se sigue adelante: es "solo declarar la dimensión".
    required: false,
    theme: promptTheme,
  });
}

/** Expande `~` y resuelve a absoluta. Lo que se escribe a mano llega en crudo. */
function expandir(ruta: string): string {
  return resolve(ruta.trim().replace(/^~/, process.env.HOME ?? "~"));
}

/** Pide una ruta existente hasta que lo sea (o se cancele con Ctrl+C). */
async function askPath(message: string, tipo: "fichero" | "carpeta"): Promise<string> {
  const bruto = await input({
    message: pc.bold(`  ${message}`),
    theme: promptTheme,
    validate: (v: string) => {
      if (v.trim().length === 0) return "Escribe una ruta.";
      const ruta = expandir(v);
      if (!existsSync(ruta)) return `No existe: ${ruta}`;
      // Una carpeta donde se espera un fichero no es un error de aptus: es que te
      // has equivocado de ruta, y decirlo aquí ahorra el fallo tres pasos después.
      try {
        const esDir = statSync(ruta).isDirectory();
        if (tipo === "carpeta" && !esDir) return `No es una carpeta: ${ruta}`;
        if (tipo === "fichero" && esDir) return `Es una carpeta, no un fichero: ${ruta}`;
      } catch {
        return `No se puede leer: ${ruta}`;
      }
      return true;
    },
  });
  return expandir(bruto);
}

/**
 * Techo de entradas que se recorren de una carpeta al navegar. No es lo mismo que
 * cuántas se pintan: es cuántas se MIRAN. Sin él, entrar sin querer en una carpeta
 * de medio millón de ficheros deja el asistente parado sin decir nada.
 */
const MAX_ENTRADAS_LEIDAS = 5000;

/**
 * Subcarpetas de `dir`, ordenadas. Nunca lanza: una carpeta sin permisos o que
 * desaparece a mitad devuelve lo que se haya podido leer, y desde ahí siempre se
 * puede subir, usarla o escribir la ruta.
 *
 * Se usa `opendirSync` y no `readdirSync` porque `readdirSync` materializa la
 * carpeta entera antes de devolver nada: aquí se corta al llegar al techo.
 */
function listarSubdirs(dir: string): { dirs: string[]; incompleto: boolean } {
  let handle;
  try {
    handle = opendirSync(dir);
  } catch {
    return { dirs: [], incompleto: false };
  }

  const dirs: string[] = [];
  let vistas = 0;
  let incompleto = false;
  try {
    for (;;) {
      const entrada = handle.readSync();
      if (entrada === null) break;
      vistas += 1;
      if (vistas > MAX_ENTRADAS_LEIDAS) {
        incompleto = true;
        break;
      }
      // Las ocultas no se listan (son ruido en cualquier home), pero se puede
      // llegar a ellas escribiendo la ruta: no quedan prohibidas, solo fuera.
      if (entrada.isDirectory() && !entrada.name.startsWith(".")) dirs.push(entrada.name);
    }
  } catch {
    // Ilegible a mitad del recorrido: vale lo leído hasta aquí.
    incompleto = true;
  } finally {
    try {
      handle.closeSync();
    } catch {
      // Ya cerrado o inválido: no hay nada que salvar.
    }
  }

  return { dirs: dirs.sort((a, b) => a.localeCompare(b)), incompleto };
}

/**
 * Elegir una carpeta navegando, partiendo de `inicio`.
 *
 * Antes esto era un `input` que solo comprobaba que la ruta existiera: para
 * acertar había que saberse la ruta de memoria y escribirla sin una errata. Ahora
 * se baja y se sube con las flechas — y escribir la ruta sigue estando ahí para
 * quien ya la sabe, que es más rápido que navegar.
 */
async function pickDirectory(message: string, inicio: string): Promise<string> {
  let actual = inicio;

  for (;;) {
    const { dirs, incompleto } = listarSubdirs(actual);
    const vista = browseChoices(actual, dirs, incompleto);
    if (vista.nota !== null) console.log(`  ${pc.yellow("⚠")} ${pc.dim(vista.nota)}`);

    const elegido = await select<BrowseChoice>({
      message: pc.bold(`  ${message}`) + pc.dim(`  ${actual}`),
      choices: vista.choices.map((c) => ({ value: c, name: c.name })),
      pageSize: 12,
      theme: promptTheme,
    });

    if (elegido.accion === "usar") return actual;
    if (elegido.accion === "escribir") return await askPath(message, "carpeta");
    actual = elegido.ruta;
  }
}

/** Qué hay ya en `sources/`, para no pisarlo. Si no existe todavía, no hay nada. */
function nombresEnSources(sourcesDir: string): string[] {
  try {
    return readdirSync(sourcesDir);
  } catch {
    return [];
  }
}

/** Lo que aporta una fuente: qué pasó (para el resumen) y qué texto suma al brief. */
interface FuenteResult {
  readonly outcome: MaterialOutcome;
  readonly docs: readonly CorpusDoc[];
}

async function desdeCarpeta(packDir: string): Promise<FuenteResult> {
  const dir = await pickDirectory("¿Dónde está el material?", process.cwd());
  const { docs, skipped } = await ingestDirectory(dir);

  if (docs.length === 0) {
    console.log(
      `  ${pc.yellow("⚠")} No hay nada legible en esa carpeta; no suma material al tema.`,
    );
    return {
      outcome: { fuente: "carpeta", copiados: [], leidos: 0, descartados: skipped.length },
      docs: [],
    };
  }

  const copiados = copyToSources(dir, docs, join(packDir, "sources")).map((f) =>
    join("sources", f),
  );
  console.log(
    `  ${pc.green("✓")} ${docs.length} documento(s) leídos` +
      (skipped.length > 0 ? pc.yellow(` · ${skipped.length} sin leer`) : ""),
  );

  return {
    outcome: { fuente: "carpeta", copiados, leidos: docs.length, descartados: skipped.length },
    docs,
  };
}

async function desdeFichero(packDir: string): Promise<FuenteResult> {
  const ruta = await askPath("¿Dónde está el fichero?", "fichero");
  const texto = readFileSync(ruta, "utf8");

  const sourcesDir = join(packDir, "sources");
  mkdirSync(sourcesDir, { recursive: true });
  const relativo = join(
    "sources",
    nombreLibre(ofertaSourceName(ruta), nombresEnSources(sourcesDir)),
  );
  writeFileSync(join(packDir, relativo), texto, "utf8");

  console.log(`  ${pc.green("✓")} guardado como material en ${pc.dim(relativo)}`);
  return {
    outcome: { fuente: "oferta", copiado: relativo },
    docs: [{ path: relativo, text: texto }],
  };
}

/**
 * ¿Se puede lanzar ese comando? Sin esto, un `$EDITOR` que no existe deja el prompt
 * de `editor` repitiendo el mismo error cada vez que pulsas enter, sin más salida
 * que Ctrl+C — el prompt captura el fallo de lanzamiento y no lo propaga.
 */
function esLanzable(comando: string): boolean {
  if (comando === "") return false;
  if (comando.includes("/")) return existsSync(comando);
  return (process.env.PATH ?? "")
    .split(delimiter)
    .some((d) => d !== "" && existsSync(join(d, comando)));
}

/**
 * Pegar el material directamente, sin crear un fichero antes.
 *
 * Se usa `editor` y no `input`: lo que se pega aquí es una oferta entera o una
 * página de apuntes, y `input` es de UNA línea — al pegar un texto con saltos, cada
 * salto cuenta como enter y el prompt se cierra con la primera línea, tirando el
 * resto. `editor` abre $EDITOR sobre un fichero temporal, que es donde pegar algo
 * largo funciona de verdad: se pega, se guarda y se cierra.
 *
 * El coste es que depende de que haya un editor que lanzar, así que se comprueba
 * ANTES y, si no lo hay, se cae a `input` de una línea diciéndolo. Peor, pero
 * funciona; quedarse colgado no.
 */
async function desdePegado(packDir: string, dimension: string): Promise<FuenteResult> {
  const { comando, configurado } = editorDePegado();
  const puedeAbrirEditor = esLanzable(comando);

  let texto: string;
  if (puedeAbrirEditor) {
    texto = await editor({
      message:
        pc.bold("  Pega aquí el material") +
        pc.dim(`  (se abre ${comando}${configurado ? "" : ", por defecto"}; guarda y cierra)`),
      postfix: ".txt",
      theme: promptTheme,
    });
  } else {
    console.log(
      `  ${pc.yellow("⚠")} No hay editor que abrir ` +
        pc.dim(`(${comando === "" ? "$EDITOR está en blanco" : `'${comando}' no está`})`) +
        `: se pega en una línea. ` +
        pc.dim("Exporta EDITOR para pegar texto con saltos de línea."),
    );
    texto = await input({ message: pc.bold("  Pega aquí el material:"), theme: promptTheme });
  }

  const limpio = texto.trim();
  if (limpio.length === 0) {
    console.log(`  ${pc.yellow("⚠")} No has pegado nada; no se escribe ningún fichero.`);
    return { outcome: { fuente: "pegar", copiado: null, caracteres: 0 }, docs: [] };
  }

  const sourcesDir = join(packDir, "sources");
  mkdirSync(sourcesDir, { recursive: true });
  const relativo = join(
    "sources",
    nombreLibre(pegadoSourceName(dimension), nombresEnSources(sourcesDir)),
  );
  writeFileSync(join(packDir, relativo), `${limpio}\n`, "utf8");

  console.log(`  ${pc.green("✓")} ${limpio.length} caracteres guardados en ${pc.dim(relativo)}`);
  return {
    outcome: { fuente: "pegar", copiado: relativo, caracteres: limpio.length },
    docs: [{ path: relativo, text: limpio }],
  };
}

async function desdeBusqueda(
  packDir: string,
  dimension: string,
  packName: string,
): Promise<FuenteResult> {
  console.log(pc.dim(`  Investigando '${dimension}' en la web… (esto tarda)`));
  const informe = await researchTopic(
    dimension,
    `Es una dimensión del pack de evaluación '${packName}'.`,
  );

  const sourcesDir = join(packDir, "sources");
  mkdirSync(sourcesDir, { recursive: true });
  const relativo = join(
    "sources",
    nombreLibre(investigacionSourceName(dimension), nombresEnSources(sourcesDir)),
  );
  writeFileSync(
    join(packDir, relativo),
    `# Investigación de '${dimension}'\n\n` +
      "> Generado por un LLM con búsqueda web. NO es una fuente auditada: verifica\n" +
      "> lo que uses de aquí antes de convertirlo en preguntas.\n\n" +
      informe,
    "utf8",
  );

  console.log(`  ${pc.green("✓")} informe guardado en ${pc.dim(relativo)}`);
  return {
    outcome: { fuente: "buscar", copiado: relativo },
    docs: [{ path: relativo, text: informe }],
  };
}

/** Despacha una fuente a su manejador. El `switch` obliga a cubrirlas todas. */
async function ejecutarFuente(
  fuente: MaterialSource,
  packDir: string,
  dimension: string,
  packName: string,
): Promise<FuenteResult> {
  switch (fuente) {
    case "carpeta":
      return await desdeCarpeta(packDir);
    case "oferta":
      return await desdeFichero(packDir);
    case "pegar":
      return await desdePegado(packDir, dimension);
    case "buscar":
      return await desdeBusqueda(packDir, dimension, packName);
  }
}

interface SkeletonAsk {
  readonly packDir: string;
  readonly packName: string;
  readonly dimension: string;
  readonly subtemas: readonly string[];
  readonly source: string;
  readonly yaHayBorrador: boolean;
}

/**
 * Ofrece el esqueleto y lo escribe si se acepta. Devuelve `null` si no se escribió.
 *
 * El fichero va a `drafts/`, NUNCA a `questions/`, y no es un detalle: el loader
 * carga el pack entero o ninguno, así que un esqueleto a medias dentro de
 * `questions/` no solo no evaluaría — dejaría sin cargar el pack completo y te
 * quitaría también los temas que ya funcionaban.
 */
async function maybeSkeleton(ask: SkeletonAsk): Promise<EsqueletoOutcome | null> {
  if (ask.yaHayBorrador) return null;

  const relativo = join("drafts", `${ask.dimension}.yaml`);
  const destino = join(ask.packDir, relativo);

  // Un borrador que salió mal (0 válidas) deja el fichero sin escribir, pero si por
  // lo que sea ya hay algo ahí no se pisa: lo escrito manda sobre una plantilla.
  if (existsSync(destino)) {
    console.log(`  ${pc.yellow("⚠")} Ya existe ${pc.dim(relativo)}: no se toca.`);
    return null;
  }

  const quiere = await confirm({
    message:
      pc.bold("  ¿Te dejo un esqueleto de preguntas para rellenar a mano?") +
      pc.dim("  (drafts/, con los campos comentados)"),
    default: true,
    theme: promptTheme,
  });
  if (!quiere) return null;

  const yaml = renderSkeleton({
    dimension: ask.dimension,
    packName: ask.packName,
    subtemas: ask.subtemas,
    source: ask.source,
    today: new Date().toISOString().slice(0, 10),
  });

  mkdirSync(join(ask.packDir, "drafts"), { recursive: true });
  writeFileSync(destino, yaml, "utf8");

  // Contar las entradas del texto ya escrito, y no volver a decidirlo aquí: lo que
  // se reporta es lo que hay en el fichero.
  const entradas = yaml.split("\n").filter((l) => l.startsWith("- id: ")).length;
  console.log(
    `  ${pc.green("✓")} esqueleto de ${entradas} pregunta(s) en ${pc.dim(relativo)}` +
      pc.dim(` — rellénalo y \`aptus promote ${ask.packName} ${ask.dimension}\``),
  );

  return { entradas, fichero: relativo };
}

/**
 * Ejecuta el flujo entero. Devuelve `null` si se cancela: cancelar aquí no debe
 * dejar un pack a medias más allá de lo ya escrito, que se reporta igualmente.
 */
export async function newDimensionFlow(
  packDir: string,
  packName: string,
  existing: readonly string[],
  /**
   * Las credenciales entran como DATO y no se leen del entorno a mitad del flujo:
   * así se decide QUÉ se ofrece antes de ofrecerlo, y se puede probar sin tocar
   * `process.env`.
   */
  tieneApiKey: boolean = hasApiCredentials(),
): Promise<NewDimensionResult | null> {
  try {
    const bruto = await input({
      message: pc.bold("  ¿Cómo se llama el tema nuevo?") + pc.dim("  (se guarda en kebab-case)"),
      theme: promptTheme,
      validate: (v: string) => validateDimensionName(v, existing),
    });
    const dimension = toKebab(bruto);
    const briefFile = briefFileName(dimension);

    const fuentes = ordenarFuentes(await pickSources(tieneApiKey));

    const materiales: MaterialOutcome[] = [];
    // Todo lo que dejen las fuentes va al MISMO corpus: el brief es uno solo, y con
    // varias fuentes lo que interesa es el índice del conjunto, no uno por fuente.
    const corpus: CorpusDoc[] = [];

    for (const fuente of fuentes) {
      console.log("");
      try {
        const res = await ejecutarFuente(fuente, packDir, dimension, packName);
        materiales.push(res.outcome);
        corpus.push(...res.docs);
      } catch (err) {
        // Ctrl+C sigue significando "sal del programa" y no "esta fuente ha fallado":
        // se deja subir hasta el catch de fuera.
        if (err instanceof Error && err.name === "ExitPromptError") throw err;
        const motivo = err instanceof Error ? err.message : String(err);
        // Una fuente que revienta NO se lleva por delante a las demás: se anota y se
        // sigue con la siguiente. Lo que se reporta al final es lo que pasó con cada una.
        materiales.push({ fuente: "fallo", origen: fuente, motivo });
        console.log(`  ${pc.red("✗")} ${fuente}: ${motivo}`);
      }
    }

    // Los subtemas que propone el brief son de dónde sale el esqueleto: si el
    // material ya trae un índice, rellenar a mano empieza con los huecos puestos.
    let subtemas: string[] = [];
    let briefEscrito = false;
    if (corpus.length > 0) {
      const brief = briefFromCorpus(dimension, corpus, existing);
      writeFileSync(join(packDir, briefFile), renderBrief(brief), "utf8");
      subtemas = brief.topics.filter((t) => !t.covered).map((t) => t.name);
      briefEscrito = true;
      console.log(
        `  ${pc.green("✓")} brief de ${corpus.length} documento(s) en ${pc.dim(briefFile)}`,
      );
    }

    // La dimensión se declara pase lo que pase con el material: si no, se pierde
    // el nombre que acabas de elegir.
    const packYaml = join(packDir, "pack.yaml");
    let dimensionDeclarada = false;
    if (existsSync(packYaml) && declareDimension(packYaml, dimension) === "añadida") {
      dimensionDeclarada = true;
      console.log(`  ${pc.green("✓")} '${dimension}' declarada en pack.yaml`);
    }

    // Sin credenciales el borrador ni se ofrece: prometer algo que va a fallar
    // después es peor que no ofrecerlo. Se dice qué falta y qué se puede hacer igual.
    if (!tieneApiKey && materiales.some(materialUtil)) {
      console.log(
        `\n  ${pc.yellow("⚠")} Sin credenciales no hay borrador con LLM ` +
          pc.dim("(exporta ANTHROPIC_API_KEY o entra con `ant auth login`).") +
          "\n" +
          pc.dim("    Las preguntas se pueden escribir a mano igual: sigue el mismo camino."),
      );
    }

    // El borrador es opcional y explícito: es lo único que gasta API.
    const quiereBorrador =
      admiteBorrador(materiales, tieneApiKey) &&
      (await confirm({
        message: pc.bold(`  ¿Genero ya un borrador de preguntas de '${dimension}' con el LLM?`),
        default: false,
        theme: promptTheme,
      }));

    let borrador: BorradorOutcome | null = null;
    if (quiereBorrador) {
      console.log(pc.dim("\n  Escribiendo el borrador… (esto tarda; el modelo las está curando)"));
      const { valid, rejected } = await draftQuestions({
        dimension,
        count: 12,
        brief: null,
        material: materialParaBorrador(corpus),
        existingStems: [],
        today: new Date().toISOString().slice(0, 10),
      });

      const relativo = join("drafts", `${dimension}.yaml`);
      borrador = { validas: valid.length, descartadas: rejected.length, fichero: relativo };

      if (valid.length > 0) {
        mkdirSync(join(packDir, "drafts"), { recursive: true });
        writeFileSync(
          join(packDir, relativo),
          `# BORRADOR sin revisar — ${dimension}, generado por LLM.\n` +
            `# No evalúa: el loader solo lee questions/.\n` +
            `# Revísalo y luego:\n` +
            `#   aptus promote ${packName} ${dimension}\n` +
            stringify(valid),
          "utf8",
        );
        console.log(
          `  ${pc.green("✓")} ${valid.length} pregunta(s) en ${pc.dim(relativo)}` +
            (rejected.length > 0
              ? pc.yellow(` · ${rejected.length} descartada(s) por el schema`)
              : ""),
        );
      } else {
        console.log(`  ${pc.yellow("⚠")} No ha salido ninguna pregunta que pase el schema.`);
      }
    }

    // Si no ha salido borrador —no había credenciales, o prefieres escribirlas tú—
    // el esqueleto es el otro camino hasta un tema evaluable. Va al MISMO sitio que
    // el borrador (`drafts/`) y se cierra con el mismo `promote`: un solo pipeline,
    // dos formas de rellenarlo.
    const esqueleto = await maybeSkeleton({
      packDir,
      packName,
      dimension,
      subtemas,
      source: sourceDelEsqueleto(materiales),
      yaHayBorrador: borrador !== null && borrador.validas > 0,
    });

    return planNewDimension({
      dimension,
      packName,
      briefFile,
      materiales,
      briefEscrito,
      dimensionDeclarada,
      borrador,
      esqueleto,
      tieneApiKey,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") return null;
    throw err;
  }
}
