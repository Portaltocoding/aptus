import { Command } from "commander";
import { startCommand, DEFAULT_PACK } from "./cli/commands/start.js";
import { historyCommand } from "./cli/commands/history.js";
import { packsCommand } from "./cli/commands/packs.js";
import { newPackCommand } from "./cli/commands/new-pack.js";
import { verifyPackCommand } from "./cli/commands/verify-pack.js";
import { reportCommand } from "./cli/commands/report.js";

const program = new Command();
program.name("aptus").description("Motor de test de aptitud por terminal");

program
  .command("start")
  .description("Inicia una sesión de test sobre un pack")
  .option("-p, --pack <name>", "pack de conocimiento a usar", DEFAULT_PACK)
  .action(async (opts: { pack: string }) => {
    await startCommand(opts.pack);
  });

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
  .command("report [name]")
  .description("Genera un informe HTML local con el resultado y la evolución")
  .action(async (name?: string) => {
    await reportCommand(name);
  });

program.parse();
