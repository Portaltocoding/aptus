import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "./scoring.js";
import type { ReadinessConfig, ReadinessLevel, ReadinessRole } from "../content/readiness.js";
import { computeGaps, computeReadiness, type Gap, type RoleReadiness } from "./readiness.js";
import { TECH_LEXICON } from "./tech-lexicon.js";

/**
 * Motor de evaluación contra una oferta concreta (JD), puro y sin I/O.
 *
 * La idea: una JD NO es un rol nuevo del pack, es un rol AD-HOC. Se extraen las
 * dimensiones que la oferta pide (léxicamente, con las keywords por dimensión que
 * ya declara el pack), se reparten en núcleo/secundarias/incidentales según con
 * cuánta fuerza las pide, y se alimenta el motor de readiness existente con ese
 * rol sintético. El resultado es el readiness para ESE puesto, con la misma vara
 * (dificultad etiquetada + evidencia con su N) que el readiness por rol.
 *
 * LÍMITE HONESTO (deliberado): la extracción es LÉXICA, no semántica. No entiende
 * la oferta; cuenta apariciones de keywords. No distingue "imprescindible RAG" de
 * "no hace falta RAG". Por eso cada dimensión detectada viaja SIEMPRE con las
 * keywords que la dispararon: son auditables a ojo.
 *
 * Lo que SÍ se hace para no engañar:
 *   - Se distingue requisito de "valorable" (`splitLines`): lo que solo aparece en
 *     un "nice to have" no puede ser núcleo del puesto.
 *   - Se mide la COBERTURA (`JdCoverage`): si la oferta va mayoritariamente de
 *     cosas que el pack no mide, se avisa en vez de dar un veredicto optimista
 *     calculado sobre las cuatro palabras que sí se reconocieron.
 *   - Una mención de pasada no gobierna el nivel: por debajo de `INCIDENTAL_SHARE`
 *     la dimensión es `incidental` y no entra en el rol (ver más abajo).
 *
 * Como en el resto del sistema, NUNCA se produce un score único de "encaje" o
 * "probabilidad de que te cojan".
 */

/**
 * Una dimensión pasa a NÚCLEO del rol de la oferta si la JD la pide con al menos
 * la mitad de la fuerza con la que pide la que más. Umbral convencional, explícito
 * y editable: lo que lo hace defendible es que la evidencia queda a la vista.
 */
export const CORE_RATIO = 0.5;

/**
 * Por debajo de esta cuota de menciones, una dimensión es una MENCIÓN INCIDENTAL:
 * se enseña, pero no entra en el rol. Existe porque el motor exige, para conceder
 * staff, competencia en TODAS las dimensiones secundarias (breadth). Sin este
 * suelo, un único "comunicación escrita" suelto en el texto de la oferta convertía
 * esa dimensión en requisito de amplitud y podía bloquear el nivel más alto: ruido
 * léxico gobernando el veredicto.
 */
export const INCIDENTAL_SHARE = 0.1;

/**
 * Menciones ABSOLUTAS mínimas para que una dimensión pueda ser núcleo del puesto.
 * `share` es relativo, y con una base minúscula miente: una oferta de fabricación
 * con 3 menciones sueltas de "product" daba a esa dimensión el 100% del peso y se
 * convertía, a ojos de aptus, en un puesto de producto. Visto en las ofertas
 * reales de jobhunt (Airbus, 15 jul). Con tan poca evidencia no hay núcleo: la
 * oferta va de otra cosa.
 */
export const MIN_CORE_HITS = 4;

/**
 * Falsos amigos del seniority: expresiones donde una palabra de nivel NO habla de
 * nivel. "Account Executive - Mid-Market" es un segmento de mercado, no un puesto
 * mid (visto en las ofertas reales de jobhunt, 15 jul). Se limpian del texto ANTES
 * de buscar el nivel.
 */
const LEVEL_NOISE = /\bmid[-\s](?:market|size|sized|term|cap|caps)\b/gi;

/**
 * Cuánto pesa una mención que solo aparece en un "valorable"/"nice to have" frente
 * a una en los requisitos. No es cero: la oferta lo menciona, algo pide. Pero no
 * puede pesar lo mismo que un requisito duro.
 */
export const OPTIONAL_WEIGHT = 0.35;

/**
 * Fracción de lo técnico reconocible de la oferta que el pack sabe medir, por
 * debajo de la cual se avisa. Es la señal PRINCIPAL de "esta oferta va de otra
 * cosa", y es robusta a la longitud del texto: compara lo medible con lo no
 * medible, no con el número de palabras.
 */
export const MIN_COVERAGE = 0.5;

/**
 * Señal SECUNDARIA: menciones mapeadas por cada 100 palabras. Pilla lo que la
 * anterior no puede — una oferta larga de un dominio que el léxico de puntos
 * ciegos ni conoce (contabilidad, biología) que roza el pack en dos palabras.
 * Ojo: es ruidosa en textos cortos, por eso no manda ella sola.
 *
 * Ambos umbrales son convencionales y solo disparan un AVISO: nunca cambian el
 * cálculo del readiness.
 */
export const LOW_DENSITY = 2.0;

/**
 * Sinónimos de seniority por nivel. Se buscan ADEMÁS del propio id del nivel y de
 * la primera palabra de su etiqueta, así que un pack con niveles exóticos sigue
 * funcionando (solo pierde los sinónimos). Ojo con el español: "principal" suelto
 * significa "el más importante", por eso solo cuenta como staff en "principal
 * engineer"; y "lead" suelto ("lead a team") aparece en ofertas que no son de
 * staff, por eso solo cuentan "tech/team lead".
 */
const LEVEL_ALIASES: Record<string, string[]> = {
  junior: ["junior", "jr.", "jr", "entry-level", "entry level", "trainee", "becario", "becaria"],
  mid: ["mid", "mid-level", "mid level", "semi-senior", "semisenior", "ssr", "intermedio"],
  senior: ["senior", "sr.", "sr"],
  staff: ["staff", "tech lead", "team lead", "principal engineer"],
};

/**
 * Traducción de años de experiencia a nivel, para las ofertas que no dicen
 * "senior" pero sí "5+ años". Convención transparente y editable (no hay un
 * estándar universal); solo se usa como PLAN B cuando la oferta no declara el
 * nivel con palabras, y la evidencia se muestra siempre. Depende de que el pack
 * use los ids junior/mid/senior: con niveles exóticos no se aplica.
 */
const YEARS_TO_LEVEL: { upTo: number; levelId: string }[] = [
  { upTo: 2, levelId: "junior" },
  { upTo: 5, levelId: "mid" },
  { upTo: Infinity, levelId: "senior" },
];

/**
 * Encabezados que abren una sección de "esto es opcional / suma puntos". Cuidado
 * al ampliar esto: se usa también sobre frases sueltas ("Kubernetes es un plus"),
 * así que una palabra corriente como "además" marcaría media oferta como opcional.
 */
const OPTIONAL_HEADINGS = /valorable|se valorar|deseable|nice to have|nice-to-have|bonus|plus|opcional/i;
/** Encabezados que abren una sección de "esto es lo que hace falta". */
const REQUIRED_HEADINGS = /requisito|requerimos|imprescindible|must have|must-have|requirements|required|necesitas|necesitamos|buscamos|qualifications|perfil|responsabilidad|qué harás|what you.ll do/i;
/** Una línea es un ENCABEZADO si es corta y no es una frase con punto final. */
const HEADING_MAX_CHARS = 60;

type LineClass = "required" | "optional" | "neutral";

export type DimensionWeight = "core" | "secondary" | "incidental";

export interface JdDimensionMatch {
  dimension: string;
  hits: number; // menciones brutas
  weightedHits: number; // menciones ponderadas ("valorable" pesa menos)
  keywords: string[]; // keywords distintas que dispararon (EVIDENCIA auditable)
  optionalOnly: boolean; // toda su evidencia sale de un "valorable": nunca es núcleo
  share: number; // weightedHits / total (0..1): cuánto pesa en lo que pide la oferta
  weight: DimensionWeight;
}

export interface JdCoverage {
  words: number; // palabras de la oferta
  mappedHits: number; // menciones que el pack sabe medir
  blindHits: number; // menciones de cosas que el pack NO mide
  ratio: number; // mappedHits / (mappedHits + blindHits); 1 = todo lo técnico es medible
  density: number; // menciones mapeadas por cada 100 palabras
  low: boolean; // alguna señal dice "esta oferta va de otra cosa"
  blindSpots: string[]; // lo que la oferta pide y el pack NO sabe medir
}

export interface JdProfile {
  title: string; // primera línea no vacía de la JD (su titular)
  matched: JdDimensionMatch[]; // dimensiones pedidas, de más a menos
  unmatched: string[]; // dimensiones del pack que la oferta no menciona
  totalHits: number;
  coverage: JdCoverage;
  targetLevelId: string | null; // seniority que pide la oferta (null si no lo declara)
  targetLevelLabel: string | null;
  targetEvidence: string | null; // término exacto que lo delató (auditable)
}

export interface JdVerdict {
  achievedLevelId: string | null;
  achievedLevelLabel: string;
  targetLevelId: string | null;
  targetLevelLabel: string | null;
  meetsTarget: boolean | null; // null = la oferta no declara seniority: nada que comparar
  levelsShort: number | null; // escalones que faltan (0 si llegas o lo superas)
  // Escalones de diferencia CON SIGNO: +1 = superas en uno lo que pide, -2 = te
  // faltan dos. Es `levelsShort` sin recortar en 0, para poder ordenar varias
  // ofertas por una cantidad real y auditable (niveles), nunca por un "% de encaje".
  levelDelta: number | null;
  // Niveles que esta oferta no permite evaluar por no pedir amplitud (ver
  // `capReason`). El motor exige dimensiones secundarias para conceder staff; si la
  // oferta no pide ninguna con peso, ese nivel no es evaluable para ella y hay que
  // DECIRLO, no capar el resultado en silencio.
  capReason: string | null;
}

export interface JdGap extends Gap {
  share: number; // cuánto pide la oferta esta dimensión
  keywords: string[]; // por qué creemos que la pide
  optionalOnly: boolean; // la oferta solo lo pone como "valorable"
  priority: number; // clave de orden interna: debilidad × (1 + share). No es un score.
}

/**
 * Cuenta cuántos LUGARES DISTINTOS del texto mencionan algo de `needles`, no la
 * suma de apariciones keyword a keyword.
 *
 * La diferencia importa y costó un bug real: las keywords de un pack se solapan
 * ("producto" contiene "product"; "escalabilidad" contiene a la vez "escalab" y
 * "scalab"), así que sumar por keyword hacía que UNA palabra contase por dos. Las
 * dimensiones con más pares español/inglés se inflaban solas y se llevaban el
 * núcleo de cualquier oferta. Solapando los tramos y fusionándolos, una mención es
 * una mención.
 *
 * Devuelve también qué keywords dispararon: son la evidencia auditable.
 */
function countMentions(haystack: string, needles: string[]): { hits: number; matched: string[] } {
  const spans: [number, number][] = [];
  const matched: string[] = [];

  for (const needle of needles) {
    const lowered = needle.toLowerCase();
    if (lowered.length === 0) continue;
    let idx = 0;
    let found = false;
    while ((idx = haystack.indexOf(lowered, idx)) !== -1) {
      spans.push([idx, idx + lowered.length]);
      found = true;
      idx += lowered.length;
    }
    if (found) matched.push(needle);
  }

  // Fusiona tramos solapados: cada tramo resultante es UNA mención.
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let hits = 0;
  let lastEnd = -1;
  for (const [start, end] of spans) {
    if (start >= lastEnd) {
      hits += 1;
      lastEnd = end;
    } else {
      lastEnd = Math.max(lastEnd, end);
    }
  }

  return { hits, matched };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Busca un término como PALABRA, no como subcadena: "mid" no salta con
 * "middleware" ni "java" con "javascript". Solo pone \b donde tiene sentido, para
 * que términos como "sr.", ".net" o "c#" sigan funcionando. Devuelve la posición
 * o -1.
 */
function findTerm(haystack: string, term: string): number {
  const opening = /^\w/.test(term) ? "\\b" : "";
  const closing = /\w$/.test(term) ? "\\b" : "";
  const re = new RegExp(`${opening}${escapeRegex(term)}${closing}`, "i");
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

/** El titular de la oferta: su primera línea con contenido, acotada. */
export function extractJdTitle(jdText: string): string {
  const line = jdText.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  return line.length > 80 ? line.slice(0, 79) + "…" : line;
}

/**
 * Reparte las líneas de la oferta en requisito / valorable / neutro.
 *
 * Dos reglas, por este orden:
 *   1. Una línea CORTA que suene a encabezado ("Valorable", "Requisitos") cambia el
 *      modo de todo lo que viene detrás: es la cabecera de una sección.
 *   2. Una línea LARGA que suene a opcional ("se valorará experiencia con X") se
 *      marca opcional ella sola, sin arrastrar al resto — si no, una frase suelta a
 *      mitad de la oferta convertiría todo lo que sigue en "valorable".
 */
function splitLines(jdText: string): { text: string; class: LineClass }[] {
  let mode: LineClass = "neutral";

  return jdText.split("\n").map((text) => {
    const trimmed = text.trim();
    const isHeading = trimmed.length > 0 && trimmed.length <= HEADING_MAX_CHARS && !trimmed.endsWith(".");

    if (isHeading && OPTIONAL_HEADINGS.test(trimmed)) {
      mode = "optional";
      return { text, class: mode };
    }
    if (isHeading && REQUIRED_HEADINGS.test(trimmed)) {
      mode = "required";
      return { text, class: mode };
    }
    if (OPTIONAL_HEADINGS.test(trimmed)) return { text, class: "optional" as LineClass };

    return { text, class: mode };
  });
}

/**
 * Qué nivel pide la oferta, por palabras ("Senior AI Engineer"). Se queda con el
 * término que aparece ANTES en el texto: el titular manda sobre el cuerpo, así que
 * "Senior … mentorizarás juniors" es una oferta senior, no junior.
 */
function levelFromWords(
  jdText: string,
  levels: ReadinessLevel[],
): { id: string; label: string; evidence: string } | null {
  let best: { id: string; label: string; evidence: string; at: number } | null = null;

  for (const level of levels) {
    const firstWord = level.label.split(/[\s-]/)[0]!.toLowerCase();
    const terms = [level.id, firstWord, ...(LEVEL_ALIASES[level.id] ?? [])];
    for (const term of new Set(terms.filter((t) => t.length > 0))) {
      const at = findTerm(jdText, term);
      if (at === -1) continue;
      if (best === null || at < best.at) {
        best = { id: level.id, label: level.label, evidence: term, at };
      }
    }
  }

  return best === null ? null : { id: best.id, label: best.label, evidence: best.evidence };
}

/**
 * Plan B: el nivel por años de experiencia ("5+ años de experiencia"), que es como
 * muchas ofertas declaran el seniority de verdad. Solo mira líneas que hablen de
 * experiencia, para no confundirse con "5 años en el mercado".
 */
function levelFromYears(
  jdText: string,
  levels: ReadinessLevel[],
): { id: string; label: string; evidence: string } | null {
  for (const line of jdText.split("\n")) {
    if (!/experien/i.test(line)) continue;

    const m = /(\d+)\s*\+?\s*(años|anos|año|years|year|yrs)/i.exec(line);
    if (!m) continue;

    const years = Number.parseInt(m[1]!, 10);
    const levelId = YEARS_TO_LEVEL.find((y) => years <= y.upTo)!.levelId;
    const level = levels.find((l) => l.id === levelId);
    if (!level) return null; // pack con niveles exóticos: no se fuerza el mapeo

    return { id: level.id, label: level.label, evidence: m[0].trim() };
  }

  return null;
}

/**
 * Lo que la oferta pide y este pack NO sabe medir. Sin esto, un puesto que pide
 * Kubernetes y Kafka sale evaluado solo por las dos palabras que el pack reconoce,
 * y el veredicto queda sesgado a favor tuyo.
 */
function findBlindSpots(
  jdText: string,
  keywords: Record<string, string[]>,
): { terms: string[]; hits: number } {
  const covered = Object.values(keywords)
    .flat()
    .map((k) => k.toLowerCase());
  const lowered = jdText.toLowerCase();

  const spots = TECH_LEXICON.filter((term) => {
    if (findTerm(jdText, term) === -1) return false;
    // Si alguna keyword del pack ya habla de esto, no es un punto ciego.
    return !covered.some((k) => term.includes(k) || k.includes(term));
  });

  const terms = [...new Set(spots)].sort();
  // Mismo criterio que las dimensiones: lugares distintos, no suma de términos
  // (aquí también se solapan: "postgresql" contiene "postgres").
  return { terms, hits: countMentions(lowered, terms).hits };
}

/**
 * Lee la oferta y la traduce a un perfil de dimensiones del pack, reutilizando las
 * `market_keywords` que el pack ya declara (son exactamente eso: qué palabras
 * delatan cada dimensión en el texto de una oferta).
 */
export function extractJdProfile(
  jdText: string,
  keywords: Record<string, string[]>,
  levels: ReadinessLevel[],
): JdProfile {
  const lines = splitLines(jdText);
  const textOf = (cls: LineClass): string =>
    lines
      .filter((l) => l.class === cls)
      .map((l) => l.text)
      .join("\n")
      .toLowerCase();

  const required = textOf("required");
  const optional = textOf("optional");
  const neutral = textOf("neutral");

  const counted = Object.entries(keywords).map(([dimension, words]) => {
    // Se cuenta por separado en cada tramo (requisito / neutro / valorable) para
    // poder pesar distinto lo que solo es un "nice to have".
    const enRequisitos = countMentions(required, words);
    const enNeutro = countMentions(neutral, words);
    const enValorable = countMentions(optional, words);

    const hard = enRequisitos.hits + enNeutro.hits;
    const soft = enValorable.hits;
    const matchedKeywords = words.filter((w) =>
      [...enRequisitos.matched, ...enNeutro.matched, ...enValorable.matched].includes(w),
    );

    return {
      dimension,
      hits: hard + soft,
      weightedHits: hard + OPTIONAL_WEIGHT * soft,
      keywords: matchedKeywords,
      optionalOnly: hard === 0 && soft > 0,
    };
  });

  const totalHits = counted.reduce((acc, c) => acc + c.hits, 0);
  const totalWeighted = counted.reduce((acc, c) => acc + c.weightedHits, 0);
  const maxWeighted = counted.reduce((acc, c) => Math.max(acc, c.weightedHits), 0);

  const matched: JdDimensionMatch[] = counted
    .filter((c) => c.hits > 0)
    .sort((a, b) => b.weightedHits - a.weightedHits || a.dimension.localeCompare(b.dimension))
    .map((c) => {
      const share = totalWeighted > 0 ? c.weightedHits / totalWeighted : 0;
      let weight: DimensionWeight;
      if (share < INCIDENTAL_SHARE) weight = "incidental";
      else if (c.weightedHits >= maxWeighted * CORE_RATIO && !c.optionalOnly && c.hits >= MIN_CORE_HITS)
        weight = "core";
      else weight = "secondary";

      return { ...c, share, weight };
    });

  const unmatched = counted
    .filter((c) => c.hits === 0)
    .map((c) => c.dimension)
    .sort();

  const words = jdText.split(/\s+/).filter((w) => w.length > 0).length;
  const density = words > 0 ? (totalHits / words) * 100 : 0;
  const blind = findBlindSpots(jdText, keywords);
  const tecnico = totalHits + blind.hits;
  // Sin nada técnico reconocible, `ratio` no significa nada: no se finge un 0 ni
  // un 1. Se deja en 1 (nada que reprochar a la cobertura) y que hable `density`.
  const ratio = tecnico > 0 ? totalHits / tecnico : 1;

  // Se limpian los falsos amigos ("Mid-Market") antes de leer el nivel, no después.
  const paraNivel = jdText.replace(LEVEL_NOISE, " ");
  const target = levelFromWords(paraNivel, levels) ?? levelFromYears(paraNivel, levels);

  return {
    title: extractJdTitle(jdText),
    matched,
    unmatched,
    totalHits,
    coverage: {
      words,
      mappedHits: totalHits,
      blindHits: blind.hits,
      ratio,
      density,
      low: ratio < MIN_COVERAGE || density < LOW_DENSITY,
      blindSpots: blind.terms,
    },
    targetLevelId: target?.id ?? null,
    targetLevelLabel: target?.label ?? null,
    targetEvidence: target?.evidence ?? null,
  };
}

/**
 * Traduce el perfil de la oferta a un rol sintético con la forma de siempre. Las
 * menciones incidentales NO entran: ni definen el nivel ni exigen amplitud.
 */
export function buildJdRole(profile: JdProfile): ReadinessRole {
  return {
    id: "jd",
    label: profile.title.length > 0 ? profile.title : "Puesto de la oferta",
    core: profile.matched.filter((m) => m.weight === "core").map((m) => m.dimension),
    secondary: profile.matched.filter((m) => m.weight === "secondary").map((m) => m.dimension),
    source: "Rol ad-hoc derivado de la oferta por extracción léxica de keywords por dimensión.",
  };
}

/**
 * Readiness para el puesto de la oferta: mismo motor, misma vara, mismos umbrales
 * que el readiness por rol del pack. Solo cambia el rol, que sale de la JD.
 * Devuelve null si la oferta no pide ninguna dimensión que el pack sepa medir (no
 * se inventa un veredicto sobre la nada).
 */
export function computeJdReadiness(
  answered: AnsweredQuestion[],
  bank: Question[],
  config: ReadinessConfig,
  profile: JdProfile,
): RoleReadiness | null {
  const role = buildJdRole(profile);
  if (role.core.length === 0) return null;

  const jdConfig: ReadinessConfig = { ...config, roles: [role] };
  return computeReadiness(answered, bank, jdConfig)[0]!;
}

/**
 * Compara el nivel alcanzado para el puesto con el que la oferta pide. Si la
 * oferta no declara seniority, `meetsTarget` es null: no hay nada que comparar y
 * hay que decirlo, no asumir un nivel por defecto.
 */
export function jdVerdict(
  readiness: RoleReadiness,
  profile: JdProfile,
  levels: ReadinessLevel[],
): JdVerdict {
  const order = levels.map((l) => l.id);
  const achievedIdx = readiness.levelId === null ? -1 : order.indexOf(readiness.levelId);

  // El motor exige amplitud (dimensiones secundarias) para los niveles que declaran
  // `breadth`. Si la oferta no pide ninguna dimensión secundaria con peso, esos
  // niveles son inalcanzables para ella por construcción, no por tu desempeño.
  const needBreadth = levels.filter((l) => l.breadth !== undefined);
  const capReason =
    readiness.secondary.length === 0 && needBreadth.length > 0
      ? `${needBreadth.map((l) => l.label).join(", ")} no se puede evaluar con esta oferta: no pide amplitud (ninguna dimensión secundaria con peso).`
      : null;

  if (profile.targetLevelId === null) {
    return {
      achievedLevelId: readiness.levelId,
      achievedLevelLabel: readiness.levelLabel,
      targetLevelId: null,
      targetLevelLabel: null,
      meetsTarget: null,
      levelsShort: null,
      levelDelta: null,
      capReason,
    };
  }

  const targetIdx = order.indexOf(profile.targetLevelId);
  return {
    achievedLevelId: readiness.levelId,
    achievedLevelLabel: readiness.levelLabel,
    targetLevelId: profile.targetLevelId,
    targetLevelLabel: profile.targetLevelLabel,
    meetsTarget: achievedIdx >= targetIdx,
    levelsShort: Math.max(0, targetIdx - achievedIdx),
    levelDelta: achievedIdx - targetIdx,
    capReason,
  };
}

/**
 * Gaps para ESTA oferta: solo las dimensiones que la oferta pide (lo que falles en
 * algo que no te van a preguntar no es un gap para este puesto), reordenados por
 * debilidad × cuánto lo pide la oferta. Las dos señales quedan a la vista; la
 * `priority` es clave de orden, no un score que mostrar.
 */
export function computeJdGaps(
  answered: AnsweredQuestion[],
  bank: Question[],
  config: ReadinessConfig,
  profile: JdProfile,
  threshold?: number,
): JdGap[] {
  const byDim = new Map(profile.matched.map((m) => [m.dimension, m]));
  const gaps = computeGaps(answered, bank, config, threshold).filter((g) => byDim.has(g.dimension));

  const weighted: JdGap[] = gaps.map((g) => {
    const m = byDim.get(g.dimension)!;
    return {
      ...g,
      share: m.share,
      keywords: m.keywords,
      optionalOnly: m.optionalOnly,
      priority: (1 - g.accuracy) * (1 + m.share),
    };
  });

  weighted.sort((a, b) => b.priority - a.priority || a.dimension.localeCompare(b.dimension));
  return weighted;
}
