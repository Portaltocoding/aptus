import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadHistory } from "../../content/history.js";
import { evolution } from "../../core/evolution.js";
import { renderEvolution } from "../render.js";
import { DEFAULT_PACK } from "./start.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data");

/**
 * Subcomando `history`: consulta el historial de un pack y muestra la evolución
 * (PERS-02) sin correr una sesión nueva. El historial es por pack.
 */
export async function historyCommand(packName: string = DEFAULT_PACK): Promise<void> {
  // Resultados aislados por tema en data/<pack>/ (no se cruzan entre packs).
  const historyPath = join(DATA_DIR, packName, "history.json");

  let history;
  try {
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log(`\nAún no hay sesiones guardadas para el pack '${packName}'. Completa una con \`aptus start --pack ${packName}\`.\n`);
    return;
  }

  console.log(`\nHistorial de '${packName}': ${history.length} sesión(es) guardada(s).`);
  console.log(`  Primera: ${history[0]!.timestamp}`);
  console.log(`  Última:  ${history[history.length - 1]!.timestamp}\n`);
  console.log(renderEvolution(evolution(history)) + "\n");
}
