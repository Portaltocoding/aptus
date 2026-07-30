#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { startCommand, DEFAULT_PACK } from "./cli/commands/start.js";
import { historyCommand } from "./cli/commands/history.js";
import { packsCommand } from "./cli/commands/packs.js";
import { newPackCommand } from "./cli/commands/new-pack.js";
import { verifyPackCommand } from "./cli/commands/verify-pack.js";
import { reportCommand } from "./cli/commands/report.js";
import { jdCommand } from "./cli/commands/jd.js";
import { reviewCommand } from "./cli/commands/review.js";
import { jobsCommand } from "./cli/commands/jobs.js";
import { ingestCommand } from "./cli/commands/ingest.js";
import { draftCommand, promoteCommand } from "./cli/commands/draft.js";
import { mainMenu } from "./cli/menu.js";

// La versión se lee en ejecución del package.json del propio paquete. Un nivel
// arriba funciona igual desde `src/index.ts` (repo) que desde `dist/index.js`
// (instalado), y evita el `import` con atributo de tipo JSON, que no compilaría
// porque package.json cae fuera de `rootDir`.
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();
program.name("aptus").description("Motor de test de aptitud por terminal").version(version);

// `start` no fija `--pack` por defecto a propósito: sin flag, el asistente
// pregunta qué pack, qué dimensiones y qué dificultad. Con flags (o con `--yes`,
// o sin TTY) no pregunta nada y va directo, que es lo que necesitan los scripts.
program
  .command("start")
  .description("Inicia una sesión de test (asistente interactivo si no pasas flags)")
  .option("-p, --pack <name>", "pack de conocimiento a usar")
  .option("-d, --dims <lista>", "dimensiones separadas por comas (por defecto, todas)")
  .option("-D, --difficulty <nivel>", "todas|base|alta|experto, o tramos: easy,medium,hard,experto")
  .option("-n, --questions <n>", "cuántas preguntas", (v: string) => Number.parseInt(v, 10))
  .option("-y, --yes", "no preguntar nada: usa los valores por defecto", false)
  .action(
    async (opts: {
      pack?: string;
      dims?: string;
      difficulty?: string;
      questions?: number;
      yes: boolean;
    }) => {
      await startCommand({
        pack: opts.yes ? (opts.pack ?? DEFAULT_PACK) : opts.pack,
        dims: opts.dims,
        difficulty: opts.difficulty,
        questions: opts.questions,
        interactive: !opts.yes,
      });
    },
  );

program
  .command("history")
  .description("Muestra el historial de sesiones de un pack y la evolución entre ellas")
  .option("-p, --pack <name>", "pack cuyo historial mostrar", DEFAULT_PACK)
  .action(async (opts: { pack: string }) => {
    await historyCommand(opts.pack);
  });

program
  .command("packs")
  .description("Lista los packs de conocimiento disponibles")
  .action(async () => {
    await packsCommand();
  });

program
  .command("new-pack <name>")
  .description("Crea el esqueleto aislado de un pack de tema nuevo")
  .action(async (name: string) => {
    await newPackCommand(name);
  });

program
  .command("verify-pack [name]")
  .description("Valida y audita la calidad de un pack (curadas, no relleno)")
  .action(async (name?: string) => {
    await verifyPackCommand(name);
  });

program
  .command("review")
  .description("Repasa (repetición espaciada) lo que peor llevas — estudio, no medición")
  .option("-p, --pack <name>", "pack que repasar", DEFAULT_PACK)
  .action(async (opts: { pack: string }) => {
    await reviewCommand(opts.pack);
  });

program
  .command("jd <fichero>")
  .description("Evalúa tu readiness contra una oferta concreta (pega su texto en un fichero)")
  .option("-p, --pack <name>", "pack con el que evaluar la oferta", DEFAULT_PACK)
  .option("-b, --brief", "en vez de evaluarte, saca el brief del pack que haría falta", false)
  .option("-m, --memoria <carpeta>", "cruza el brief con tu material propio (vault, apuntes)")
  .action(async (fichero: string, opts: { pack: string; brief: boolean; memoria?: string }) => {
    await jdCommand(fichero, { pack: opts.pack, brief: opts.brief, memoria: opts.memoria });
  });

// Ingesta: la mitad MECÁNICA de construir un pack (recorrer material, indexarlo y
// proponer temas). Determinista y sin red; la parte que juzga va aparte, a
// propósito, para que se vea cuál es cuál.
program
  .command("ingest <carpeta>")
  .description("Ingiere una carpeta de material y saca el brief de un pack nuevo")
  .option("-p, --pack <name>", "pack destino (por defecto, el nombre de la carpeta)")
  .option("--no-copy", "no copiar el material a packs/<tema>/sources/")
  .action(async (carpeta: string, opts: { pack?: string; copy: boolean }) => {
    await ingestCommand(carpeta, { pack: opts.pack, copy: opts.copy });
  });

// `draft` es lo ÚNICO que sale a la red y necesita credenciales. Escribe en
// drafts/, fuera de donde el loader mira: un borrador de LLM no puede evaluarte
// hasta que lo revisas y lo promueves a mano.
program
  .command("draft <tema>")
  .description(
    "Borrador de preguntas con LLM a partir del brief y el material (revisión obligatoria)",
  )
  .requiredOption("-d, --dimension <dim>", "dimensión para la que escribir el borrador")
  .option("-n, --count <n>", "cuántas pedir", (v: string) => Number.parseInt(v, 10), 12)
  .action(async (tema: string, opts: { dimension: string; count: number }) => {
    await draftCommand(tema, { dimension: opts.dimension, count: opts.count });
  });

program
  .command("promote <tema> <dimension>")
  .description(
    "Mueve un borrador ya revisado de drafts/ a questions/ — pasa la auditoría o no entra",
  )
  .action(async (tema: string, dimension: string) => {
    await promoteCommand(tema, dimension);
  });

program
  .command("jobs")
  .description("Evalúa en bloque las ofertas ya escaneadas por jobhunt contra tu readiness")
  .option("-p, --pack <name>", "pack con el que evaluarlas", DEFAULT_PACK)
  .option("-l, --limit <n>", "cuántas mostrar", (v: string) => Number.parseInt(v, 10), 20)
  .action(async (opts: { pack: string; limit: number }) => {
    await jobsCommand(opts.pack, opts.limit);
  });

program
  .command("report [name]")
  .description("Genera un informe HTML local con el resultado y la evolución")
  .action(async (name?: string) => {
    await reportCommand(name);
  });

// `aptus` a secas abre el menú principal, que es el sitio al que se vuelve. Con
// cualquier subcomando (o sin TTY: scripts, CI, pipes) se comporta exactamente
// como siempre — el menú llama a los mismos comandos, no los reimplementa.
if (process.argv.length <= 2 && process.stdin.isTTY === true) {
  await mainMenu();
} else {
  program.parse();
}
