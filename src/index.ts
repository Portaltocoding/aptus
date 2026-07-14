import { Command } from "commander";
import { startCommand } from "./cli/commands/start.js";
import { historyCommand } from "./cli/commands/history.js";

const program = new Command();
program.name("aptus").description("Motor de test de aptitud por terminal");

program
  .command("start")
  .description("Inicia una sesión de test sobre el pack por defecto")
  .action(async () => {
    await startCommand();
  });

program
  .command("history")
  .description("Muestra el historial de sesiones y la evolución entre ellas")
  .action(async () => {
    await historyCommand();
  });

program.parse();
