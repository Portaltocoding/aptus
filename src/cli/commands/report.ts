import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadHistory } from "../../content/history.js";
import { ensureDir, historyPath as historyPathOf, packDataDir } from "../../content/paths.js";
import { buildHtmlReport } from "../html-report.js";
import { requirePackName } from "../default-pack.js";

/**
 * Subcomando `report [tema]`: genera un informe HTML local y autocontenido con el
 * resultado de la última sesión y la evolución. Lee el historial aislado del pack
 * (data/<tema>/) y escribe data/<tema>/report.html. No sale a la red.
 */
export async function reportCommand(pedido?: string): Promise<void> {
  let packName;
  try {
    packName = requirePackName(pedido);
  } catch (err) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }
  const historyPath = historyPathOf(packName);
  const outPath = join(packDataDir(packName), "report.html");

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

  // El directorio se crea aquí y no se da por hecho: hasta ahora existía de
  // rebote porque lo había creado la sesión, y con los datos mudándose de sitio
  // eso deja de estar garantizado.
  ensureDir(packDataDir(packName));
  writeFileSync(outPath, buildHtmlReport(packName, history), "utf8");
  console.log(`\n✓ Informe generado: ${outPath}\n  Ábrelo con: xdg-open ${outPath}\n`);
}
