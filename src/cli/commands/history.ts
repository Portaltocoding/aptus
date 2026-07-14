import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadHistory } from "../../content/history.js";
import { evolution } from "../../core/evolution.js";
import { renderEvolution } from "../render.js";

// Store local del historial (fuera del código; gitignored). Misma ruta que start.ts.
const HISTORY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/history.json");

/**
 * Subcomando `history`: consulta el historial de sesiones y muestra la evolución
 * (PERS-02) sin correr una sesión nueva. Falla claro si el historial está corrupto.
 */
export async function historyCommand(): Promise<void> {
  let history;
  try {
    history = loadHistory(HISTORY_PATH);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log("\nAún no hay sesiones guardadas. Completa una con `aptus start`.\n");
    return;
  }

  console.log(`\nHistorial: ${history.length} sesión(es) guardada(s).`);
  console.log(`  Primera: ${history[0]!.timestamp}`);
  console.log(`  Última:  ${history[history.length - 1]!.timestamp}\n`);
  console.log(renderEvolution(evolution(history)) + "\n");
}
