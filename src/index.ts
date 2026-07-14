import { Command } from "commander";
import { startCommand, DEFAULT_PACK } from "./cli/commands/start.js";
import { historyCommand } from "./cli/commands/history.js";
import { packsCommand } from "./cli/commands/packs.js";

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

program.parse();
