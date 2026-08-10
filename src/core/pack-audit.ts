import type { Pack } from "../content/schema.js";

/**
 * Auditoría de CALIDAD de un pack (pura, sin I/O), más allá de la validación de
 * schema que ya hace loadPack. Sirve de control "curadas, no relleno" al construir
 * packs nuevos desde fuentes. Distingue errores (bloquean) de avisos (orientativos).
 */

export interface AuditFinding {
  code: string;
  message: string;
  questionId?: string;
}

export interface AuditReport {
  errors: AuditFinding[];
  warnings: AuditFinding[];
}

const MIN_PER_DIMENSION = 12;
const MIN_EXPLANATION = 20;
const MIN_STEM = 15;

/**
 * A partir de cuánta concentración en una misma posición se avisa de sesgo. Con 4
 * opciones lo esperable es ~25% por posición; un 50% ya es adivinable a ojo, y
 * quien escribe preguntas a mano tiende a poner la correcta la primera sin darse
 * cuenta. Solo se mira con muestra suficiente para que el aviso signifique algo.
 */
const POSITION_BIAS_THRESHOLD = 0.5;
const POSITION_BIAS_MIN_SAMPLE = 20;

/** Heurística de "sin curar": contenido del esqueleto o texto de relleno evidente. */
function looksUncurated(stem: string, explanation: string, id: string, dimension: string): boolean {
  if (/^ejemplo-/i.test(id) || dimension === "dimension-ejemplo") return true;
  return /lorem ipsum|placeholder|rellenar|\bxxx\b|texto de relleno/i.test(
    `${stem} ${explanation}`,
  );
}

export function auditPack(pack: Pack, minPerDimension: number = MIN_PER_DIMENSION): AuditReport {
  const errors: AuditFinding[] = [];
  const warnings: AuditFinding[] = [];

  // IDs únicos (el schema no lo comprueba).
  const seen = new Set<string>();
  for (const q of pack.questions) {
    if (seen.has(q.id))
      errors.push({ code: "dup-id", message: `id duplicado: ${q.id}`, questionId: q.id });
    seen.add(q.id);
  }

  const declared = new Set(pack.dimensions);
  const byDim = new Map<string, number>();
  const expertoByDim = new Map<string, number>();
  for (const q of pack.questions) {
    if (!declared.has(q.dimension)) {
      warnings.push({
        code: "dim-no-declarada",
        message: `dimensión '${q.dimension}' no está en pack.dimensions`,
        questionId: q.id,
      });
    }
    byDim.set(q.dimension, (byDim.get(q.dimension) ?? 0) + 1);
    if (q.difficulty === "experto")
      expertoByDim.set(q.dimension, (expertoByDim.get(q.dimension) ?? 0) + 1);
  }

  for (const dim of pack.dimensions) {
    const n = byDim.get(dim) ?? 0;
    if (n === 0) {
      warnings.push({ code: "dim-vacia", message: `dimensión '${dim}' sin preguntas` });
      continue;
    }
    if (n < minPerDimension)
      warnings.push({
        code: "dim-pocas",
        message: `dimensión '${dim}' tiene ${n} preguntas (< ${minPerDimension})`,
      });
    if (!expertoByDim.get(dim))
      warnings.push({
        code: "sin-experto",
        message: `dimensión '${dim}' sin preguntas 'experto' (staff no evaluable aquí)`,
      });
  }

  for (const q of pack.questions) {
    const optIds = q.options.map((o) => o.id);
    if (new Set(optIds).size !== optIds.length) {
      errors.push({ code: "opt-id-dup", message: "ids de opción duplicados", questionId: q.id });
    }
    const optTexts = q.options.map((o) => o.text.trim().toLowerCase());
    if (new Set(optTexts).size !== optTexts.length) {
      warnings.push({
        code: "opciones-repetidas",
        message: "opciones con texto duplicado",
        questionId: q.id,
      });
    }
    if (q.explanation.trim().length < MIN_EXPLANATION) {
      warnings.push({
        code: "explicacion-corta",
        message: "explanation demasiado corta",
        questionId: q.id,
      });
    }
    if (q.stem.trim().length < MIN_STEM) {
      warnings.push({ code: "stem-corto", message: "stem demasiado corto", questionId: q.id });
    }
    if (looksUncurated(q.stem, q.explanation, q.id, q.dimension)) {
      warnings.push({
        code: "sin-curar",
        message: "parece contenido de esqueleto o relleno (sin curar)",
        questionId: q.id,
      });
    }
    for (const hallazgo of auditRationales(q)) warnings.push({ ...hallazgo, questionId: q.id });
  }

  const largo = lengthBias(pack.questions);
  if (largo !== null) {
    warnings.push({
      code: "sesgo-longitud",
      message:
        `la respuesta correcta es la MÁS LARGA en ${largo.count}/${largo.total} preguntas ` +
        `(${Math.round(largo.share * 100)}%, azar ≈25%) y mide ${largo.ratio.toFixed(1)}× la media ` +
        `de sus distractores: respondiendo "la más larga" sin leer se acierta el ` +
        `${Math.round(largo.share * 100)}%. Barajar NO lo corrige —la longitud viaja con el texto—, ` +
        `así que mientras siga así el porcentaje de una sesión mide sobre todo esto`,
    });
  }

  const sesgo = positionBias(pack.questions);
  if (sesgo !== null) {
    warnings.push({
      code: "sesgo-posicion",
      message:
        `la respuesta correcta cae en la posición ${sesgo.position} en ${sesgo.count}/${sesgo.total} preguntas ` +
        `(${Math.round(sesgo.share * 100)}%): el banco es adivinable por posición. ` +
        `aptus baraja las opciones al presentarlas, así que la sesión no se ve afectada, ` +
        `pero conviene repartir las correctas si el pack se usa fuera de aquí`,
    });
  }

  return { errors, warnings };
}

/**
 * Cuánto más largo puede ser el apunte de la correcta que la media de los
 * distractores antes de que la delate. Un 2× no es una regla de estilo: el ojo
 * elige lo que está más argumentado sin leerlo entero, y ahí el test deja de medir
 * lo que sabes y pasa a medir dónde hay más texto.
 */
const RATIONALE_LENGTH_RATIO = 2;
/** Por debajo de esto un apunte no argumenta nada: es un campo puesto por poner. */
const MIN_RATIONALE = 20;

/**
 * Cuánto vocabulario puede reciclar un apunte del texto de su propia opción.
 *
 * Un apunte que reformula la opción no añade nada que leer, pero el problema de
 * verdad es otro: en un banco donde la respuesta correcta se escribe larga y
 * auto-explicativa y los distractores cortos, parafrasear produce apuntes
 * calcados en la buena y argumentos de cosecha propia en las falsas. El apunte
 * pasa entonces a delatar la respuesta —"el que repite su opción es el bueno"—
 * sin necesidad de ser más largo. Por eso se mira el solapamiento, y sobre todo
 * la DIFERENCIA de solapamiento entre la correcta y sus distractores.
 */
const RATIONALE_ECHO = 0.6;
const RATIONALE_ECHO_GAP = 0.25;

/** Palabras vacías: repetirlas no significa que se esté reciclando la opción. */
const VACIAS = new Set(
  ("de la el los las un una unos unas y o que en a al del por para con sin es son ser se lo su " +
    "sus como mas si no ni pero cuando donde cual cada esa ese eso esta este esto entre sobre " +
    "desde hasta ya solo hay muy todo toda todos todas otro otra le les nada algo").split(" "),
);

/** Palabras con carga, sin tildes ni signos: la unidad con la que se mide el eco. */
function palabras(texto: string): Set<string> {
  const plano = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return new Set(
    (plano.match(/[a-z0-9_]+/g) ?? []).filter((p) => p.length > 3 && !VACIAS.has(p)),
  );
}

/**
 * Qué fracción del apunte ya estaba en el texto de la opción (0 = todo nuevo,
 * 1 = no dice ni una palabra que no estuviera). Exportada porque es el criterio
 * con el que se revisa el contenido, y conviene poder medirlo fuera del informe.
 */
export function rationaleEcho(optionText: string, rationale: string): number {
  const dela = palabras(optionText);
  const del = palabras(rationale);
  if (del.size === 0) return 0;
  let comunes = 0;
  for (const p of del) if (dela.has(p)) comunes += 1;
  return comunes / del.size;
}

/**
 * Audita los apuntes de opción (`rationale`), que se enseñan ANTES de responder.
 *
 * Los tres avisos miran lo mismo desde tres sitios: que el apunte no diga cuál es
 * la correcta. Tenerlo solo en algunas opciones, o tener el de la buena mucho más
 * desarrollado que los demás, convierte una ayuda de lectura en una pista — y una
 * pista antes de responder es exactamente lo que hace que un test deje de medir.
 *
 * Son AVISOS y no errores: un pack sin ningún apunte es perfectamente válido (el
 * campo es opcional), y aquí solo se mira la forma, nunca el contenido.
 */
export function auditRationales(q: Pack["questions"][number]): AuditFinding[] {
  const hallazgos: AuditFinding[] = [];
  const conApunte = q.options.filter((o) => (o.rationale ?? "").trim().length > 0);

  // Ninguna lo tiene: el pack no usa la función. No hay nada que auditar.
  if (conApunte.length === 0) return hallazgos;

  if (conApunte.length < q.options.length) {
    hallazgos.push({
      code: "rationale-incompleto",
      message:
        `solo ${conApunte.length} de ${q.options.length} opciones tienen apunte (rationale): ` +
        `al pasar el cursor, las que lo tienen destacan sobre las que no y la respuesta se ` +
        `adivina sin saber del tema. O lo tienen todas, o ninguna`,
    });
  }

  for (const o of conApunte) {
    if (o.rationale!.trim().length < MIN_RATIONALE) {
      hallazgos.push({
        code: "rationale-corto",
        message: `el apunte de la opción '${o.id}' no argumenta nada (demasiado corto)`,
      });
    }
    const eco = rationaleEcho(o.text, o.rationale!);
    if (eco >= RATIONALE_ECHO) {
      hallazgos.push({
        code: "rationale-eco",
        message:
          `el apunte de la opción '${o.id}' reformula su propia opción (${Math.round(eco * 100)}% ` +
          `del vocabulario ya estaba ahí): no añade nada que leer. Un apunte aporta el mecanismo, ` +
          `una cifra, cuándo aplica o qué pasa si no`,
      });
    }
  }

  // Solo tiene sentido con correcta única y con todos los distractores escritos:
  // comparar contra un distractor sin apunte no dice nada de la longitud.
  const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
  const buena = conApunte.find((o) => correctIds.includes(o.id));
  const distractores = conApunte.filter((o) => !correctIds.includes(o.id));
  if (correctIds.length === 1 && buena !== undefined && distractores.length > 0) {
    const media =
      distractores.reduce((n, o) => n + o.rationale!.trim().length, 0) / distractores.length;
    const largoBuena = buena.rationale!.trim().length;
    if (media > 0 && largoBuena > media * RATIONALE_LENGTH_RATIO) {
      hallazgos.push({
        code: "rationale-delata",
        message:
          `el apunte de la correcta ('${buena.id}') es ${Math.round(largoBuena / media)}× más largo ` +
          `que la media de los distractores: la respuesta se ve por el volumen de texto`,
      });
    }

    // El delator sutil: que SOLO la correcta parafrasee su opción. No hace falta
    // que sea más larga ni que diga nada de más; basta con que sea la única cuyo
    // apunte suena calcado, y quien se dé cuenta acierta sin saber del tema.
    const ecoBuena = rationaleEcho(buena.text, buena.rationale!);
    const ecoDistractores =
      distractores.reduce((n, o) => n + rationaleEcho(o.text, o.rationale!), 0) /
      distractores.length;
    if (ecoBuena - ecoDistractores >= RATIONALE_ECHO_GAP) {
      hallazgos.push({
        code: "rationale-eco-delata",
        message:
          `solo el apunte de la correcta ('${buena.id}') reformula su opción ` +
          `(${Math.round(ecoBuena * 100)}% frente al ${Math.round(ecoDistractores * 100)}% de los ` +
          `distractores): el patrón delata la respuesta sin necesidad de leerla`,
      });
    }
  }

  return hallazgos;
}

/**
 * A partir de qué proporción de preguntas "la correcta es la más larga" deja de
 * ser casualidad. Con 4 opciones lo esperable por azar es ~25%.
 */
const LENGTH_BIAS_THRESHOLD = 0.5;
const LENGTH_BIAS_MIN_SAMPLE = 20;

export interface LengthBias {
  /** En cuántas preguntas la correcta es la opción más larga. */
  count: number;
  total: number;
  share: number;
  /** Cuántas veces más larga es la correcta que la media de sus distractores. */
  ratio: number;
}

/**
 * Detecta el sesgo de LONGITUD de la respuesta correcta.
 *
 * Es el hermano mayor del sesgo de posición, y bastante más difícil de ver: quien
 * escribe preguntas a mano desarrolla la correcta —porque es la que hay que
 * justificar— y despacha los distractores en media línea. El resultado es un
 * banco que se aprueba eligiendo siempre la opción más larga, sin leerla.
 *
 * Y a diferencia del sesgo de posición, barajar NO lo arregla: la longitud viaja
 * con el texto. Mientras esto no se corrija, el porcentaje que salga de una
 * sesión mide sobre todo la capacidad de contar palabras.
 */
export function lengthBias(questions: Pack["questions"]): LengthBias | null {
  let count = 0;
  let total = 0;
  let suma = 0;

  for (const q of questions) {
    if (Array.isArray(q.correct)) continue; // sin una única correcta no hay a qué comparar
    const buena = q.options.find((o) => o.id === q.correct);
    const otras = q.options.filter((o) => o.id !== q.correct);
    if (buena === undefined || otras.length === 0) continue;

    total += 1;
    // ESTRICTAMENTE la más larga: un empate no delata nada, y contarlo inflaría
    // el sesgo justo en los bancos que sí igualan las longitudes a propósito.
    const masLarga = Math.max(...otras.map((o) => o.text.trim().length));
    if (buena.text.trim().length > masLarga) count += 1;
    const media = otras.reduce((n, o) => n + o.text.trim().length, 0) / otras.length;
    if (media > 0) suma += buena.text.trim().length / media;
  }

  if (total < LENGTH_BIAS_MIN_SAMPLE) return null;
  const share = count / total;
  return share >= LENGTH_BIAS_THRESHOLD
    ? { count, total, share, ratio: suma / total }
    : null;
}

export interface PositionBias {
  position: number; // 1-indexada, tal y como se lee en el YAML
  count: number;
  total: number;
  share: number;
}

/**
 * Detecta concentración de la respuesta correcta en una misma POSICIÓN del YAML.
 * Se mira la posición y no el `option.id` porque lo que se adivina es "la
 * primera", no "la que se llama a". Solo cuenta preguntas de correcta única: en
 * las de respuesta múltiple no hay una posición que sesgar.
 */
export function positionBias(questions: Pack["questions"]): PositionBias | null {
  const counts = new Map<number, number>();
  let total = 0;

  for (const q of questions) {
    if (Array.isArray(q.correct)) continue;
    const idx = q.options.findIndex((o) => o.id === q.correct);
    if (idx < 0) continue; // el schema ya lo bloquea; aquí solo se ignora
    total += 1;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }

  if (total < POSITION_BIAS_MIN_SAMPLE) return null;

  const [idx, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const share = count / total;
  return share >= POSITION_BIAS_THRESHOLD ? { position: idx + 1, count, total, share } : null;
}
