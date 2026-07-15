import Table from "cli-table3";
import pc from "picocolors";
import type { ScoreResult } from "../core/scoring.js";
import { CALIBRATION_GAP_THRESHOLD, type CalibrationResult } from "../core/calibration.js";
import { GAP_THRESHOLD, type Difficulty, type Gap, type RoleReadiness, type TierAccuracy } from "../core/readiness.js";
import type { EvolutionReport } from "../core/evolution.js";
import type { MarketDemand, WeightedGap } from "../core/market.js";
import type { JdGap, JdProfile, JdVerdict } from "../core/jd.js";
import { MAX_BOX, nextDueAt, type ReviewItem, type ReviewProgress } from "../core/resurfacing.js";
import type { JobsScan, ScannedJob } from "../core/jobs-scan.js";

/**
 * Barra unicode coloreada por umbral (verde/amarillo/rojo). Estética sobria,
 * sin arte. Es solo presentación: no deriva ni ajusta ningún score.
 */
function bar(pct: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  const glyphs = "█".repeat(filled) + "░".repeat(width - filled);
  const colorFn = pct >= 0.7 ? pc.green : pct >= 0.4 ? pc.yellow : pc.red;
  return colorFn(glyphs);
}

/**
 * Formatea el `ScoreResult` del núcleo como una tabla por dimensión. El N
 * (respondidas/presentadas) acompaña SIEMPRE al porcentaje (RES-01) y NUNCA se
 * muestra un score único agregado tipo "empleabilidad". Esta capa solo
 * formatea: el cálculo vive por completo en `src/core/scoring.ts`.
 */
export function renderResult(result: ScoreResult): string {
  const table = new Table({
    head: ["Dimensión", "Resultado", "N (respondidas/presentadas)"],
  });

  for (const d of result.byDimension) {
    table.push([
      d.dimension,
      `${bar(d.pct)} ${Math.round(d.pct * 100)}%`,
      `${d.answered}/${d.presented}`,
    ]);
  }

  return table.toString();
}

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * Formatea la curva confianza-vs-acierto (RES-04): por cada nivel de confianza
 * declarado, el acierto real con su N y una lectura honesta (sobreestimas /
 * calibrado / infravaloras). No calcula nada: solo presenta el CalibrationResult
 * del núcleo. Sin ningún score agregado.
 */
export function renderCalibration(result: CalibrationResult): string {
  if (result.byConfidence.length === 0) {
    return "Calibración: no declaraste confianza en esta sesión, no hay curva que mostrar.";
  }

  const table = new Table({
    head: ["Confianza", "Declarada", "Acierto real", "N", "Lectura"],
  });

  for (const b of result.byConfidence) {
    let lectura: string;
    if (b.gap <= -CALIBRATION_GAP_THRESHOLD) lectura = pc.red("⚠ te sobreestimas");
    else if (b.gap >= CALIBRATION_GAP_THRESHOLD) lectura = pc.yellow("te infravaloras");
    else lectura = pc.green("calibrado");

    table.push([
      CONFIDENCE_LABEL[b.confidence] ?? b.confidence,
      `~${Math.round(b.declared * 100)}%`,
      `${bar(b.accuracy)} ${Math.round(b.accuracy * 100)}%`,
      `${b.correct}/${b.answered}`,
      lectura,
    ]);
  }

  return "Calibración (confianza declarada vs acierto real):\n" + table.toString();
}

function tierCell(t: TierAccuracy): string {
  if (t.answered === 0) return "—"; // sin preguntas de este tramo: no evaluable
  return `${Math.round(t.accuracy * 100)}% (${t.correct}/${t.answered})`;
}

function levelColor(levelId: string | null): (s: string) => string {
  if (levelId === "staff") return pc.magenta;
  if (levelId === "senior") return pc.green;
  if (levelId === "mid") return pc.cyan;
  if (levelId === "junior") return pc.yellow;
  return pc.red; // por debajo del primer nivel
}

/**
 * Formatea el readiness POR ROL (RES-02): nivel alcanzado + evidencia por
 * dificultad con su N. NUNCA un score único agregado de "empleabilidad": una fila
 * por rol, cada una anclada a su desempeño real. Solo presenta; no calcula.
 */
export function renderReadiness(roles: RoleReadiness[]): string {
  const table = new Table({
    head: ["Rol", "Readiness", "Fácil", "Media", "Difícil", "Experto", "N"],
  });

  const cell = (byTier: Map<string, TierAccuracy>, d: string): string => {
    const t = byTier.get(d);
    return t ? tierCell(t) : "—";
  };

  for (const r of roles) {
    const byTier = new Map(r.byDifficulty.map((t) => [t.difficulty, t]));
    table.push([
      r.label,
      levelColor(r.levelId)(r.levelLabel),
      cell(byTier, "easy"),
      cell(byTier, "medium"),
      cell(byTier, "hard"),
      cell(byTier, "experto"),
      String(r.answered),
    ]);
  }

  // Matriz rol × dimensión: por rol, el acierto en cada dimensión núcleo (con N).
  const detalle = roles
    .map((r) => {
      const dims = r.byDimension
        .map((d) =>
          d.answered > 0
            ? `${d.dimension} ${Math.round(d.accuracy * 100)}% (${d.correct}/${d.answered})`
            : `${d.dimension} —`,
        )
        .join("  ·  ");
      return `  ${r.label}: ${dims}`;
    })
    .join("\n");

  return (
    "Readiness por rol (lectura orientativa, anclada a tu acierto por dificultad):\n" +
    table.toString() +
    "\n\nDetalle por rol y dimensión núcleo:\n" +
    detalle
  );
}

/**
 * Resumen narrativo (TL;DR) del resultado: ranking de roles por nivel alcanzado,
 * los puntos más flojos y por dónde empezar a estudiar. Solo presenta; los gaps
 * llegan ya ordenados por debilidad (más flojo primero).
 */
export function renderSummary(roles: RoleReadiness[], gaps: Gap[], levelOrder: string[]): string {
  const rank = (id: string | null): number => (id === null ? -1 : levelOrder.indexOf(id));
  const ordered = [...roles].sort((a, b) => rank(b.levelId) - rank(a.levelId));

  const lines: string[] = [pc.bold("Resumen")];

  if (ordered.length > 0) {
    const top = ordered[0]!;
    lines.push(`  • Tu readiness más alto: ${top.label} — ${levelColor(top.levelId)(top.levelLabel)}.`);
    const ranking = ordered.map((r) => `${r.label} (${r.levelLabel})`).join("  >  ");
    lines.push(`  • Ranking (de más a menos listo): ${ranking}`);
  }

  if (gaps.length > 0) {
    const worst = gaps
      .slice(0, 3)
      .map((g) => `${g.dimension} ${Math.round(g.accuracy * 100)}%`)
      .join(", ");
    lines.push(`  • Puntos más flojos: ${worst}.`);
    lines.push(`  • Empieza por: ${gaps[0]!.dimension} → ${gaps[0]!.study}`);
  } else {
    lines.push("  • Sin gaps mayores: vas sólido en las dimensiones respondidas.");
  }

  return lines.join("\n");
}

/**
 * Formatea los gaps priorizados y el plan de estudio (RES-03): "te falta X → haz
 * Z", de la dimensión más débil a la menos. No es un ranking de empleabilidad.
 */
export function renderGaps(gaps: Gap[]): string {
  if (gaps.length === 0) {
    return "Gaps: sin gaps mayores — todas las dimensiones respondidas están en 70% o más.";
  }

  const lines = gaps.map((g) => {
    const head = pc.red(`te falta ${g.dimension}`);
    const acc = `${Math.round(g.accuracy * 100)}% (${g.correct}/${g.answered})`;
    return `  • ${head} — ${acc}\n    → ${g.study}`;
  });

  return "Gaps priorizados y plan de estudio:\n" + lines.join("\n");
}

/**
 * Como renderGaps, pero cuando hay datos de jobhunt (Phase 6): reordena por
 * debilidad × demanda de mercado y muestra en cuántas ofertas reales aparece cada
 * dimensión. No es un score de encaje: son las dos señales (tu acierto y la
 * demanda) a la vista, con el plan de estudio.
 */
export function renderWeightedGaps(gaps: WeightedGap[], demand: MarketDemand): string {
  if (gaps.length === 0) {
    return "Gaps: sin gaps mayores — todas las dimensiones respondidas están en 70% o más.";
  }

  const lines = gaps.map((g) => {
    const head = pc.red(`te falta ${g.dimension}`);
    const acc = `${Math.round(g.accuracy * 100)}% (${g.correct}/${g.answered})`;
    const mercado = pc.cyan(`mercado: en ${g.demandJobs}/${demand.totalJobs} ofertas`);
    return `  • ${head} — ${acc}  ·  ${mercado}\n    → ${g.study}`;
  });

  return (
    `Gaps priorizados por debilidad × demanda de mercado (${demand.totalJobs} ofertas de jobhunt):\n` +
    lines.join("\n")
  );
}

/**
 * Formatea lo que la oferta pide: qué dimensiones detecta, con cuánta fuerza y
 * —sobre todo— CON QUÉ EVIDENCIA (las keywords que dispararon). La extracción es
 * léxica y puede equivocarse, así que las keywords se muestran siempre para poder
 * auditarlas a ojo. Solo presenta: el análisis vive en core/jd.ts.
 */
export function renderJdProfile(profile: JdProfile): string {
  const lines: string[] = [pc.bold(`Oferta: ${profile.title || "(sin titular)"}`)];

  if (profile.targetLevelId !== null) {
    lines.push(
      `  Nivel que pide: ${pc.bold(profile.targetLevelLabel!)} (detectado por "${profile.targetEvidence}")`,
    );
  } else {
    lines.push(`  Nivel que pide: ${pc.yellow("no lo declara")} — no se compara contra ningún nivel objetivo.`);
  }

  const PESO: Record<string, (s: string) => string> = {
    core: pc.bold,
    secondary: (s) => s,
    incidental: pc.dim,
  };
  const ETIQUETA: Record<string, string> = {
    core: "núcleo",
    secondary: "secundaria",
    incidental: "incidental",
  };

  const table = new Table({ head: ["Dimensión", "Peso en la oferta", "Menciones", "Keywords que la disparan"] });
  for (const m of profile.matched) {
    const peso = PESO[m.weight]!(ETIQUETA[m.weight]!);
    const soloValorable = m.optionalOnly ? pc.yellow(" · solo en «valorable»") : "";
    table.push([
      m.dimension,
      `${peso} ${bar(m.share, 10)} ${Math.round(m.share * 100)}%${soloValorable}`,
      String(m.hits),
      m.keywords.join(", "),
    ]);
  }

  const avisos: string[] = [];

  // Lo más importante que puede decir esta vista: lo que la oferta pide y NO se
  // mide. Sin esto, el veredicto sale calculado solo sobre lo que el pack conoce y
  // engaña a tu favor.
  if (profile.coverage.blindSpots.length > 0) {
    avisos.push(
      pc.yellow("  ⚠ Puntos ciegos — la oferta también pide esto y aptus NO lo mide:\n") +
        `    ${profile.coverage.blindSpots.join(", ")}\n` +
        "    El readiness de abajo NO los tiene en cuenta: es más optimista que la oferta real.",
    );
  }
  if (profile.coverage.low) {
    const c = profile.coverage;
    // Se dice QUÉ señal ha saltado y con qué números: un aviso que no se puede
    // auditar es un aviso que se acaba ignorando.
    const medibles = c.mappedHits === 1 ? "1 mención medible" : `${c.mappedHits} menciones medibles`;
    const motivo =
      c.ratio < 1 && c.mappedHits + c.blindHits > 0
        ? `de lo técnico que reconozco en ella, solo mido el ${Math.round(c.ratio * 100)}% ` +
          `(${medibles} frente a ${c.blindHits} que no mido)`
        : `apenas toca lo que mido: ${c.density.toFixed(1)} menciones por cada 100 palabras, en ${c.words}`;
    avisos.push(pc.red(`  ⚠ Esta oferta va de otra cosa — ${motivo}.\n    Tómate el veredicto de abajo con pinzas.`));
  }

  const notas: string[] = [];
  if (profile.unmatched.length > 0) {
    notas.push(`  · La oferta no menciona: ${profile.unmatched.join(", ")} — fuera del perfil de este puesto.`);
  }
  notas.push(
    pc.dim(
      "  · Extracción léxica: cuenta keywords, no entiende la oferta. No distingue\n" +
        '    "imprescindible RAG" de "no hace falta RAG". Revisa las keywords antes de fiarte.',
    ),
  );

  return (
    lines.join("\n") +
    "\n\nLo que pide la oferta:\n" +
    table.toString() +
    "\n" +
    [...avisos, ...notas].join("\n")
  );
}

/**
 * Formatea el readiness para ESTE puesto: el veredicto contra el nivel que pide la
 * oferta y la evidencia por dificultad con su N detrás. NUNCA un "% de encaje" ni
 * una probabilidad de que te cojan (RES-02): el mismo rasero que el readiness por
 * rol, aplicado al rol ad-hoc que sale de la oferta.
 */
export function renderJdReadiness(readiness: RoleReadiness, verdict: JdVerdict): string {
  const alcanzado = levelColor(verdict.achievedLevelId)(verdict.achievedLevelLabel);

  let veredicto: string;
  if (verdict.meetsTarget === null) {
    veredicto = `  Para este puesto alcanzas ${alcanzado}. La oferta no dice qué nivel busca, así que no hay objetivo contra el que medirte.`;
  } else if (verdict.meetsTarget) {
    veredicto =
      `  La oferta pide ${pc.bold(verdict.targetLevelLabel!)} y para su perfil alcanzas ${alcanzado} — ` +
      pc.green("llegas al nivel que pide") +
      ".";
  } else {
    const n = verdict.levelsShort!;
    const escalones = n === 1 ? "te falta 1 escalón" : `te faltan ${n} escalones`;
    veredicto =
      `  La oferta pide ${pc.bold(verdict.targetLevelLabel!)} y para su perfil alcanzas ${alcanzado} — ` +
      pc.red(escalones) +
      ".";
  }

  const byTier = new Map(readiness.byDifficulty.map((t) => [t.difficulty, t]));
  const table = new Table({ head: ["Fácil", "Media", "Difícil", "Experto", "N (núcleo de la oferta)"] });
  const cell = (d: Difficulty): string => {
    const t = byTier.get(d);
    return t ? tierCell(t) : "—";
  };
  table.push([cell("easy"), cell("medium"), cell("hard"), cell("experto"), String(readiness.answered)]);

  const dims = (label: string, list: typeof readiness.byDimension): string => {
    if (list.length === 0) return "";
    const detalle = list
      .map((d) =>
        d.answered > 0
          ? `${d.dimension} ${Math.round(d.accuracy * 100)}% (${d.correct}/${d.answered})`
          : `${d.dimension} — (sin preguntas respondidas)`,
      )
      .join("  ·  ");
    return `\n  ${label}: ${detalle}`;
  };

  // Si la oferta no pide amplitud, hay niveles que no son evaluables para ella por
  // construcción. Se dice; no se capa el resultado en silencio.
  const tope = verdict.capReason === null ? "" : `\n  ${pc.dim("· " + verdict.capReason)}`;

  // El veredicto mide CONOCIMIENTO sobre las dimensiones del pack. Ni experiencia
  // en producción, ni incidentes, ni mentoría — que es media oferta senior.
  const alcance = pc.dim(
    "  · Mide tu conocimiento en las dimensiones del pack, no tu experiencia:\n" +
      "    producción, incidentes o mentoría no entran aquí y pesan en un puesto real.",
  );

  return (
    "Readiness para ESTE puesto (misma vara que el readiness por rol: tu acierto por dificultad):\n" +
    veredicto +
    "\n" +
    table.toString() +
    dims("Núcleo de la oferta", readiness.byDimension) +
    dims("Secundarias (amplitud)", readiness.secondary) +
    tope +
    "\n" +
    alcance
  );
}

/**
 * Como renderGaps, pero acotado a lo que ESTA oferta pide y ordenado por debilidad
 * × cuánto lo pide. Un fallo en algo que la oferta no menciona no sale aquí: no es
 * un gap para este puesto. No es un ranking de empleabilidad.
 */
export function renderJdGaps(gaps: JdGap[]): string {
  if (gaps.length === 0) {
    return "Gaps para este puesto: ninguno — vas al 70% o más en todo lo que la oferta pide y has respondido.";
  }

  const lines = gaps.map((g) => {
    const head = pc.red(`te falta ${g.dimension}`);
    const acc = `${Math.round(g.accuracy * 100)}% (${g.correct}/${g.answered})`;
    const pide = g.optionalOnly
      ? pc.dim("la oferta solo lo pone como «valorable»")
      : pc.cyan(`la oferta lo pide: ${Math.round(g.share * 100)}% de sus menciones`);
    return `  • ${head} — ${acc}  ·  ${pide}\n    → ${g.study}`;
  });

  return "Gaps para este puesto (debilidad × cuánto lo pide la oferta):\n" + lines.join("\n");
}

/**
 * Formatea el plan de la tanda de repaso (RES-05): qué toca, hacia qué temas carga
 * y cuánto hay en seguimiento. Deja claro que esto NO mide: es estudio.
 */
export function renderReviewPlan(
  due: ReviewItem[],
  byDim: ReviewProgress[],
  tracked: number,
  target: number,
): string {
  const tanda = Math.min(due.length, target);
  const lines: string[] = [
    pc.bold(`Repaso: ${tanda} pregunta(s) de las ${due.length} que tocan hoy (${tracked} en seguimiento).`),
  ];

  const table = new Table({ head: ["Dimensión", "Toca repasar", "De ellas, falladas la última vez"] });
  for (const d of byDim) {
    table.push([d.dimension, String(d.due), d.weak > 0 ? pc.red(String(d.weak)) : "0"]);
  }
  lines.push(table.toString());

  lines.push(
    pc.dim(
      "  · Va cargado a propósito hacia lo que peor llevas, así que no mide nada:\n" +
        "    no verás readiness ni gaps, y esta sesión no cuenta para tu evolución.",
    ),
  );

  return lines.join("\n");
}

/**
 * Formatea el movimiento de cajas tras la tanda: qué se consolida y qué vuelve al
 * principio. Es el único "progreso" honesto del repaso — no un score.
 */
export function renderReviewOutcome(before: ReviewItem[], after: ReviewItem[], asked: string[]): string {
  const prev = new Map(before.map((i) => [i.questionId, i]));
  const now = new Map(after.map((i) => [i.questionId, i]));

  let subieron = 0;
  let cayeron = 0;
  for (const id of asked) {
    const a = prev.get(id);
    const b = now.get(id);
    if (a === undefined || b === undefined) continue;
    if (b.box > a.box) subieron += 1;
    else if (b.box < a.box) cayeron += 1;
  }

  const consolidadas = after.filter((i) => i.box >= MAX_BOX).length;
  const flojas = after.filter((i) => i.box === 1).length;

  const proximo = nextDueAt(after);
  const cuando = proximo ? `  Siguiente repaso: ${new Date(proximo).toLocaleString("es-ES")}.` : "";

  return (
    "Repaso — cómo se mueve lo que estudias:\n" +
    `  • ${pc.green(`${subieron} suben de caja`)} (tardarán más en volver)  ·  ${pc.red(`${cayeron} vuelven a la caja 1`)} (las verás pronto).\n` +
    `  • En total: ${consolidadas} consolidada(s), ${flojas} aún en la caja 1.\n` +
    cuando
  );
}

/**
 * Formatea el escaneo en bloque de las ofertas de jobhunt. El orden es por
 * ESCALONES (una cantidad real: niveles que te sobran o te faltan), y cada fila
 * lleva su veredicto entero al lado para que se pueda auditar. Nunca un
 * porcentaje de encaje ni una probabilidad de que te cojan.
 *
 * Lo no evaluable se CUENTA y se dice: esconderlo haría parecer que el pack cubre
 * todo el mercado, que es la mentira más fácil de contar aquí.
 */
export function renderJobsScan(scan: JobsScan, shown: number): string {
  const evaluables = scan.meets.length + scan.oneShort.length + scan.farther.length + scan.withoutLevel.length;
  const lines: string[] = [
    pc.bold(
      `Ofertas de jobhunt: ${scan.totalScanned} escaneadas · ${evaluables} evaluables con este pack · ` +
        `${scan.notEvaluable.length} no evaluables.`,
    ),
  ];

  /** Un cubo: las ofertas y su veredicto. Sin numerar y en alfabético: no es un ranking. */
  const cubo = (titulo: string, jobs: ScannedJob[], conGap: boolean): void => {
    if (jobs.length === 0) return;
    lines.push(`\n${titulo} (${jobs.length})`);

    for (const s of jobs.slice(0, shown)) {
      const empresa = s.company ? ` @ ${s.company}` : "";
      const aviso = s.profile.coverage.low ? pc.yellow(" ⚠") : "";
      const v = s.verdict!;
      lines.push(`  • ${s.title}${empresa}${aviso}`);
      lines.push(
        pc.dim(`    pide ${v.targetLevelLabel} · alcanzas `) + levelColor(v.achievedLevelId)(v.achievedLevelLabel),
      );
      // En las que tienes a tiro, lo accionable es por dónde se cierra el hueco.
      // Solo si de verdad hay un punto flojo: llamar "peor punto" a un 88% sería
      // ruido disfrazado de consejo.
      if (conGap) {
        const peor = [...s.readiness!.byDimension]
          .filter((d) => d.answered > 0 && d.accuracy < GAP_THRESHOLD)
          .sort((a, b) => a.accuracy - b.accuracy)[0];
        if (peor) {
          lines.push(pc.dim(`    peor punto: ${peor.dimension} ${Math.round(peor.accuracy * 100)}%`));
        }
      }
    }

    // Nunca recortar en silencio.
    if (jobs.length > shown) {
      lines.push(pc.dim(`  (se muestran ${shown} de ${jobs.length}; usa --limit para ver más)`));
    }
  };

  cubo(pc.green(pc.bold("LLEGAS AL NIVEL QUE PIDEN")), scan.meets, false);
  cubo(pc.yellow(pc.bold("TE FALTA 1 ESCALÓN — lo que tienes a tiro")), scan.oneShort, true);
  cubo(pc.red(pc.bold("TE FALTAN 2 O MÁS")), scan.farther, true);

  const notas: string[] = [];
  if (scan.withoutLevel.length > 0) {
    notas.push(
      `  · ${scan.withoutLevel.length} oferta(s) no declaran seniority: no hay nivel con el que compararlas. Míralas con \`aptus jd\`.`,
    );
  }
  if (scan.notEvaluable.length > 0) {
    notas.push(
      `  · ${scan.notEvaluable.length} oferta(s) no piden nada que este pack sepa medir: van de otra cosa.`,
    );
  }
  if (notas.length > 0) lines.push("\n" + notas.join("\n"));

  lines.push(
    pc.dim(
      "\n  · Los cubos dicen tu relación con el nivel que pide cada oferta; dentro van en\n" +
        "    alfabético. No hay ranking, ni % de encaje, ni probabilidad de que te cojan:\n" +
        "    elegir entre las de un cubo es cosa tuya. El detalle, con `aptus jd`." +
        (scan.meets.some((s) => s.profile.coverage.low) ||
        scan.oneShort.some((s) => s.profile.coverage.low) ||
        scan.farther.some((s) => s.profile.coverage.low)
          ? "\n  · ⚠ = la oferta va mayoritariamente de cosas que este pack no mide: su veredicto es optimista."
          : ""),
    ),
  );

  return lines.join("\n");
}

function deltaCell(delta: number | null): string {
  if (delta === null) return "—";
  const pts = Math.round(delta * 100);
  if (pts > 0) return pc.green(`↑ +${pts}`);
  if (pts < 0) return pc.red(`↓ ${pts}`);
  return pc.yellow("= 0");
}

/**
 * Formatea la evolución entre sesiones (PERS-02): por dimensión, el acierto de
 * ahora vs la sesión anterior y su delta en puntos; más los cambios de nivel de
 * readiness por rol. Solo presenta el EvolutionReport del núcleo.
 */
export function renderEvolution(report: EvolutionReport): string {
  if (report.sessionCount === 0) {
    return "Evolución: aún no hay sesiones guardadas.";
  }
  if (report.sessionCount === 1) {
    return "Evolución: primera sesión guardada. La comparación aparecerá a partir de la segunda.";
  }

  const table = new Table({ head: ["Dimensión", "Ahora", "Antes", "Δ (puntos)"] });
  for (const d of report.byDimension) {
    table.push([
      d.dimension,
      `${Math.round(d.current * 100)}%`,
      d.previous === null ? "—" : `${Math.round(d.previous * 100)}%`,
      deltaCell(d.delta),
    ]);
  }

  const roleChanges = report.byRole.filter((r) => r.changed);
  const rolesLine = roleChanges.length
    ? "\nCambios de readiness por rol:\n" +
      roleChanges.map((r) => `  • ${r.label}: ${r.previous} → ${r.current}`).join("\n")
    : "\n(Sin cambios de nivel de readiness por rol respecto a la sesión anterior.)";

  return `Evolución (esta sesión vs la anterior; ${report.sessionCount} guardadas):\n` + table.toString() + rolesLine;
}
