import { Command } from "commander";
import { startCommand } from "./cli/commands/start.js";

const program = new Command();
program.name("aptus").description("Motor de test de aptitud por terminal");

program
  .command("start")
  .description("Inicia una sesión de test sobre el pack por defecto")
  .action(async () => {
    await startCommand();
  });

program.parse();
