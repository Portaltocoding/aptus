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

const program = new Command();
program.name("aptus").description("Motor de test de aptitud por terminal");

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
  .action(async (fichero: string, opts: { pack: string }) => {
    await jdCommand(fichero, opts.pack);
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

program.parse();
