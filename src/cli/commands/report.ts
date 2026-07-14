import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadHistory } from "../../content/history.js";
import { buildHtmlReport } from "../html-report.js";
import { DEFAULT_PACK } from "./start.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data");

/**
 * Subcomando `report [tema]`: genera un informe HTML local y autocontenido con el
 * resultado de la última sesión y la evolución. Lee el historial aislado del pack
 * (data/<tema>/) y escribe data/<tema>/report.html. No sale a la red.
 */
export async function reportCommand(packName: string = DEFAULT_PACK): Promise<void> {
  const historyPath = join(DATA_DIR, packName, "history.json");
  const outPath = join(DATA_DIR, packName, "report.html");

  let history;
  try {
    history = loadHistory(historyPath);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.log(`\nAún no hay sesiones guardadas para '${packName}'. Completa una con \`aptus start --pack ${packName}\`.\n`);
    return;
  }

  writeFileSync(outPath, buildHtmlReport(packName, history), "utf8");
  console.log(`\n✓ Informe generado: ${outPath}\n  Ábrelo con: xdg-open ${outPath}\n`);
}
