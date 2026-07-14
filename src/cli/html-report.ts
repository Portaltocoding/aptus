import type { SessionRecord } from "../core/evolution.js";

/**
 * Generador puro del informe HTML (sin I/O): toma el historial persistido y
 * devuelve un HTML autocontenido (CSS y gráficas SVG en línea, sin recursos
 * externos). Misma ética que la terminal: el N siempre junto al porcentaje y
 * NUNCA un score único agregado.
 */

const PALETTE = ["#2f6f9f", "#8a5a44", "#4f7a4a", "#7a4f7a", "#9f7a2f"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const pct = (n: number): number => Math.round(n * 100);

function bar(p: number, color: string): string {
  return `<div class="bar"><span style="width:${pct(p)}%;background:${color}"></span></div>`;
}

/** Gráfica de líneas SVG: una línea por dimensión a lo largo de las sesiones. */
function evolutionChart(history: SessionRecord[], dims: string[]): string {
  if (history.length < 2) {
    return `<p class="nota">La gráfica de evolución aparece a partir de la segunda sesión guardada.</p>`;
  }
  const W = 720, H = 260, P = 40;
  const n = history.length;
  const x = (i: number) => P + (i * (W - 2 * P)) / (n - 1);
  const y = (v: number) => H - P - v * (H - 2 * P);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((v) => `<line x1="${P}" y1="${y(v)}" x2="${W - P}" y2="${y(v)}" class="grid"/>
      <text x="${P - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${pct(v)}%</text>`)
    .join("");

  const lines = dims
    .map((dim, di) => {
      const color = PALETTE[di % PALETTE.length]!;
      const pts = history.map((s, i) => {
        const d = s.byDimension.find((x) => x.dimension === dim);
        return d ? `${x(i)},${y(d.pct)}` : null;
      });
      const path = pts.filter(Boolean).join(" ");
      const dots = history
        .map((s, i) => {
          const d = s.byDimension.find((x) => x.dimension === dim);
          return d ? `<circle cx="${x(i)}" cy="${y(d.pct)}" r="3" fill="${color}"/>` : "";
        })
        .join("");
      return `<polyline points="${path}" fill="none" stroke="${color}" stroke-width="2"/>${dots}`;
    })
    .join("");

  const xlabels = history
    .map((_, i) => `<text x="${x(i)}" y="${H - P + 18}" class="tick" text-anchor="middle">${i + 1}</text>`)
    .join("");

  const legend = dims
    .map((dim, di) => `<span class="leg"><i style="background:${PALETTE[di % PALETTE.length]}"></i>${esc(dim)}</span>`)
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolución por dimensión">
    ${grid}${lines}${xlabels}
    <text x="${W / 2}" y="${H - 6}" class="tick" text-anchor="middle">sesión</text>
  </svg><div class="legend">${legend}</div>`;
}

export function buildHtmlReport(packName: string, history: SessionRecord[]): string {
  const last = history[history.length - 1];
  const dims = last ? last.byDimension.map((d) => d.dimension) : [];

  const cuerpo = !last
    ? `<p class="nota">Aún no hay sesiones guardadas para este pack.</p>`
    : `
    <section>
      <h2>Última sesión</h2>
      <p class="meta">${esc(last.timestamp)}</p>
      <table>
        <thead><tr><th>Dimensión</th><th>Acierto</th><th></th><th>N (aciertos/respondidas)</th></tr></thead>
        <tbody>
          ${last.byDimension
            .map(
              (d, i) => `<tr>
            <td>${esc(d.dimension)}</td>
            <td class="num">${pct(d.pct)}%</td>
            <td class="barcell">${bar(d.pct, PALETTE[i % PALETTE.length]!)}</td>
            <td class="num">${d.correct}/${d.answered}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="nota">Sin score agregado: el desglose por dimensión con su N es el resultado.</p>
    </section>

    ${
      last.readiness.length > 0
        ? `<section>
      <h2>Readiness por rol</h2>
      <table>
        <thead><tr><th>Rol</th><th>Nivel alcanzado</th></tr></thead>
        <tbody>${last.readiness
          .map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.levelLabel)}</td></tr>`)
          .join("")}</tbody>
      </table>
      <p class="nota">Lectura orientativa anclada a tu acierto por dificultad; no predice si te contratarán.</p>
    </section>`
        : ""
    }

    <section>
      <h2>Evolución</h2>
      ${evolutionChart(history, dims)}
    </section>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>aptus — ${esc(packName)}</title>
<style>
  :root { color-scheme: light dark; --fg:#1c1c1c; --mut:#666; --bg:#faf9f7; --card:#fff; --line:#e4e1dc; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e6e3; --mut:#9a9a9a; --bg:#16171a; --card:#1e2024; --line:#33363b; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1rem; background:var(--bg); color:var(--fg);
    font:16px/1.55 ui-serif, Georgia, "Times New Roman", serif; }
  main { max-width: 820px; margin: 0 auto; }
  h1 { font-size:1.6rem; margin:0 0 .2rem; font-weight:600; letter-spacing:.01em; }
  h2 { font-size:1.1rem; margin:0 0 .8rem; font-weight:600; }
  .meta, .nota { color:var(--mut); font-size:.85rem; }
  .nota { margin-top:.6rem; }
  section { background:var(--card); border:1px solid var(--line); border-radius:8px;
    padding:1.2rem; margin:1.2rem 0; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:.5rem .4rem; border-bottom:1px solid var(--line); }
  th { font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; color:var(--mut); font-weight:600; }
  .num { font-variant-numeric: tabular-nums; white-space:nowrap; }
  .barcell { width:45%; }
  .bar { background:var(--line); border-radius:3px; height:8px; overflow:hidden; }
  .bar span { display:block; height:100%; border-radius:3px; }
  .chart { width:100%; height:auto; overflow:visible; }
  .grid { stroke:var(--line); stroke-width:1; }
  .tick { fill:var(--mut); font-size:11px; font-family:ui-sans-serif,system-ui,sans-serif; }
  .legend { display:flex; flex-wrap:wrap; gap:.9rem; margin-top:.5rem; font-size:.8rem; color:var(--mut); }
  .leg i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:.35rem; vertical-align:middle; }
</style></head>
<body><main>
  <h1>aptus — ${esc(packName)}</h1>
  <p class="meta">${history.length} sesión(es) guardada(s)${last ? ` · última: ${esc(last.timestamp)}` : ""}</p>
  ${cuerpo}
</main></body></html>`;
}
