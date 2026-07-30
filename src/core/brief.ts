import type { JdProfile } from "./jd.js";

/**
 * BRIEF de pack: el puente entre "aquí tienes una fuente" y "cura un pack sobre
 * esto". Formato único, venga de donde venga la fuente (una oferta, una carpeta de
 * material), para que quien cura las preguntas —una persona o un LLM— reciba
 * siempre lo mismo.
 *
 * Lo que un brief SÍ es: un índice mecánico y auditable de la fuente. Qué temas
 * aparecen, con qué evidencia, cuáles ya los mide un pack y cuáles no.
 *
 * Lo que un brief NO es: un temario entendido. Todo lo de aquí sale de contar
 * palabras y leer títulos, exactamente igual que la extracción de ofertas —y con
 * los mismos límites: no distingue "imprescindible Kafka" de "no hace falta
 * Kafka". Por eso el brief se revisa ANTES de curar nada encima. El módulo es
 * puro: no lee disco ni sale a la red.
 */

export interface BriefTopic {
  /** Nombre propuesto para la dimensión, en kebab-case. Es una PROPUESTA. */
  name: string;
  /** Peso relativo del tema en la fuente (0..1). No es una nota ni una prioridad. */
  weight: number;
  /** Por qué se propone: keywords, títulos o ficheros que lo disparan. Auditable. */
  evidence: string[];
  /** Ya lo mide un pack existente: no hay que escribirlo otra vez. */
  covered: boolean;
  /** Material propio encontrado para este tema (ver `attachMaterial`). */
  material?: TopicMaterial[];
}

/** Un documento de tu material que habla de un tema del brief. */
export interface TopicMaterial {
  path: string;
  /** Cuántos términos distintos del tema menciona. Evidencia, no relevancia. */
  hits: number;
}

export type BriefOrigin = "oferta" | "carpeta";

export interface PackBrief {
  origin: BriefOrigin;
  /** Titular de la fuente: el título de la oferta o el nombre de la carpeta. */
  label: string;
  /** Pack contra el que se ha contrastado la cobertura (null si no se contrastó). */
  againstPack: string | null;
  /** Nivel de seniority que pide la fuente, si lo declara. */
  targetLevel: string | null;
  topics: BriefTopic[];
  /** Lo que la fuente pide y NINGÚN pack sabe medir: el hueco a cubrir. */
  blindSpots: string[];
  /** De dónde sale todo esto (ficheros leídos, o la oferta). */
  sources: string[];
  /** Límites de esta extracción concreta. Se imprimen siempre. */
  notes: string[];
}

/** Normaliza un texto libre a un identificador de dimensión en kebab-case. */
export function toKebab(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fuera acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Brief a partir de una oferta ya analizada. Es la ruta más directa que existe:
 * `extractJdProfile` ya sabe qué dimensiones pide la oferta, con qué peso y con
 * qué evidencia, y —lo que de verdad importa aquí— qué pide que el pack NO mide.
 * Esos puntos ciegos son, literalmente, el índice del pack que te falta.
 */
export function briefFromJd(profile: JdProfile, packName: string): PackBrief {
  const topics: BriefTopic[] = profile.matched.map((m) => ({
    name: m.dimension,
    weight: m.share,
    evidence: m.keywords,
    covered: true, // sale de las dimensiones del pack: ya se mide
  }));

  // Cada punto ciego es un tema candidato a dimensión nueva. Sin peso: el detector
  // solo dice que aparece, no cuánto pesa, e inventarle un número sería mentir.
  for (const spot of profile.coverage.blindSpots) {
    topics.push({ name: toKebab(spot), weight: 0, evidence: [spot], covered: false });
  }

  const notes = [
    "Extracción léxica: cuenta keywords, no entiende la oferta. No distingue " +
      '"imprescindible X" de "no hace falta X".',
    "Los temas marcados como ya cubiertos no hay que volver a escribirlos: viven en el pack.",
  ];
  if (profile.coverage.low) {
    notes.push(
      "Esta oferta va mayoritariamente de cosas que el pack no mide: el brief es casi todo tema nuevo.",
    );
  }
  if (profile.coverage.blindSpots.length === 0) {
    notes.push(
      "Sin puntos ciegos: el pack ya cubre todo lo que esta oferta pide que se sepa detectar. " +
        "Aquí no hay pack nuevo que construir, hay preguntas que responder mejor.",
    );
  }

  return {
    origin: "oferta",
    label: profile.title || "(oferta sin titular)",
    againstPack: packName,
    targetLevel: profile.targetLevelLabel,
    topics,
    blindSpots: profile.coverage.blindSpots,
    sources: [profile.title || "(oferta sin titular)"],
    notes,
  };
}

/** Un documento ya leído del disco: la entrada de `briefFromCorpus`. */
export interface CorpusDoc {
  /** Ruta relativa, para poder rastrear de qué fichero salió cada tema. */
  path: string;
  text: string;
}

/** Cuántos temas propone como máximo: más allá de esto es ruido, no un temario. */
const MAX_TOPICS = 20;
/** Un título que aparece en un solo sitio y una vez rara vez es una dimensión. */
const MIN_TOPIC_WEIGHT_CHARS = 200;

/** Títulos markdown/asciidoc de un documento, que es la mejor pista de un temario. */
export function extractHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const line of text.split("\n")) {
    const md = /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
    if (md) headings.push(md[1]!.trim());
  }
  return headings;
}

/**
 * Brief a partir de una carpeta de material.
 *
 * La propuesta de temas sale de los TÍTULOS del material (y, si no hay, del nombre
 * de los ficheros), pesados por cuánto texto cuelga de cada uno. Es un índice
 * mecánico: agrupa lo que el material ya agrupó por sí mismo, no interpreta nada.
 * Si el material no trae títulos, el brief lo dice en vez de inventarse un temario.
 *
 * `covered` se contrasta contra las dimensiones de un pack existente para no
 * proponer escribir lo que ya está escrito.
 */
export function briefFromCorpus(
  label: string,
  docs: CorpusDoc[],
  existingDimensions: readonly string[] = [],
  extraNotes: readonly string[] = [],
): PackBrief {
  const yaCubierto = new Set(existingDimensions.map((d) => toKebab(d)));

  // Peso = caracteres de material bajo ese tema. Es la única cantidad honesta que
  // se puede medir sin entender el contenido: cuánto hay escrito de cada cosa.
  const pesoPorTema = new Map<string, number>();
  const evidencia = new Map<string, Set<string>>();

  const anota = (tema: string, peso: number, fuente: string): void => {
    const key = toKebab(tema);
    if (key.length < 3) return;
    pesoPorTema.set(key, (pesoPorTema.get(key) ?? 0) + peso);
    if (!evidencia.has(key)) evidencia.set(key, new Set());
    evidencia.get(key)!.add(fuente);
  };

  let conTitulos = 0;
  for (const doc of docs) {
    const headings = extractHeadings(doc.text);
    if (headings.length > 0) {
      conTitulos += 1;
      // El texto del documento se reparte entre sus títulos: un documento largo con
      // un solo título pesa entero en ese tema, y uno con diez lo reparte.
      const porTitulo = doc.text.length / headings.length;
      for (const h of headings) anota(h, porTitulo, doc.path);
    } else {
      // Sin títulos, el nombre del fichero es la única pista que da el material.
      const base = doc.path
        .split("/")
        .pop()!
        .replace(/\.[^.]+$/, "");
      anota(base, doc.text.length, doc.path);
    }
  }

  const total = [...pesoPorTema.values()].reduce((a, b) => a + b, 0);
  const topics: BriefTopic[] = [...pesoPorTema.entries()]
    .filter(([, peso]) => peso >= MIN_TOPIC_WEIGHT_CHARS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOPICS)
    .map(([name, peso]) => ({
      name,
      weight: total > 0 ? peso / total : 0,
      evidence: [...evidencia.get(name)!].sort(),
      covered: yaCubierto.has(name),
    }));

  const notes = [
    "Los temas salen de los títulos del material y se pesan por cuánto texto cuelga " +
      "de cada uno. Es un índice mecánico, no un temario entendido: agrúpalos y " +
      "renómbralos antes de curar nada.",
    "Un pack necesita 3-6 dimensiones. Si aquí salen 20 temas, la primera tarea es " +
      "agruparlos, no escribir 20 ficheros.",
    ...extraNotes,
  ];
  if (docs.length > 0 && conTitulos === 0) {
    notes.push(
      "Ningún documento trae títulos: los temas de abajo son NOMBRES DE FICHERO, " +
        "que es una pista muy pobre. Revísalos uno a uno.",
    );
  }

  return {
    origin: "carpeta",
    label,
    againstPack: existingDimensions.length > 0 ? label : null,
    targetLevel: null,
    topics,
    blindSpots: topics.filter((t) => !t.covered).map((t) => t.name),
    sources: docs.map((d) => d.path).sort(),
    notes,
  };
}

/** Cuántos documentos se listan por tema: la lista es una pista, no un índice. */
const MAX_MATERIAL_PER_TOPIC = 6;

/** Busca un término como PALABRA, no como subcadena: "java" no salta con "javascript". */
function mentions(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Cruza el brief con TU material (notas, apuntes, un vault) y cuelga de cada tema
 * los documentos que hablan de él.
 *
 * Para qué: un brief dice qué tienes que saber; esto dice con qué cuentas para
 * escribirlo. Y lo más útil no es la lista, es su ausencia — un tema que la oferta
 * pide y del que no tienes ni una nota es exactamente donde te falta material,
 * no solo conocimiento.
 *
 * El cruce es léxico (los términos del tema como palabra): encuentra lo que
 * comparte vocabulario, no lo que trata del mismo asunto con otras palabras. Falla
 * hacia el silencio: como mucho no encuentra una nota que sí valía.
 *
 * No copia ni lee nada: recibe los documentos ya leídos y devuelve un brief nuevo.
 */
export function attachMaterial(brief: PackBrief, docs: readonly CorpusDoc[]): PackBrief {
  const topics = brief.topics.map((topic) => {
    // Los términos del tema son su evidencia más su propio nombre despiezado: un
    // tema `llm-rag-evals` debe encontrar notas que hablen de "rag" o de "evals".
    const terminos = [...new Set([...topic.evidence, ...topic.name.split("-")])]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3);

    const material = docs
      .map((doc) => ({
        path: doc.path,
        hits: terminos.filter((t) => mentions(doc.text, t)).length,
      }))
      .filter((m) => m.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.path.localeCompare(b.path))
      .slice(0, MAX_MATERIAL_PER_TOPIC);

    return { ...topic, material };
  });

  const sinMaterial = topics.filter((t) => !t.covered && t.material!.length === 0);
  const notes = [...brief.notes];
  if (docs.length > 0) {
    notes.push(
      `Material propio cruzado: ${docs.length} documento(s). El cruce es léxico (comparte ` +
        "vocabulario), así que puede perderse una nota que trate el tema con otras palabras.",
    );
  }
  if (sinMaterial.length > 0) {
    notes.push(
      `Sin una sola nota tuya: ${sinMaterial.map((t) => t.name).join(", ")} — ` +
        "para esos temas no tienes material de partida, hay que traerlo de fuera antes de curar.",
    );
  }

  return { ...brief, topics, notes };
}

/**
 * Serializa el brief a Markdown. Se elige Markdown y no YAML a propósito: un brief
 * es para LEERLO y corregirlo antes de curar nada encima, no para que lo parsee
 * ningún programa. Nada en aptus vuelve a leer este fichero.
 */
export function renderBrief(brief: PackBrief): string {
  const origen = brief.origin === "oferta" ? "una oferta de empleo" : "una carpeta de material";
  const lines: string[] = [
    `# Brief de pack — ${brief.label}`,
    "",
    `Generado por \`aptus\` a partir de ${origen}.`,
    "",
    "> Esto es una PROPUESTA mecánica, no un temario. Revísala y corrígela antes de",
    "> escribir una sola pregunta encima.",
    "",
  ];

  if (brief.targetLevel !== null) {
    lines.push(`**Nivel que pide la fuente:** ${brief.targetLevel}`, "");
  }
  if (brief.againstPack !== null && brief.origin === "oferta") {
    lines.push(`**Contrastado contra el pack:** \`${brief.againstPack}\``, "");
  }

  const nuevos = brief.topics.filter((t) => !t.covered);
  const cubiertos = brief.topics.filter((t) => t.covered);

  lines.push("## Temas a cubrir", "");
  if (nuevos.length === 0) {
    lines.push("_Ninguno: todo lo detectado ya lo mide un pack existente._", "");
  } else {
    lines.push("| tema propuesto | peso en la fuente | evidencia |", "|---|---|---|");
    for (const t of nuevos) {
      const peso = t.weight > 0 ? `${Math.round(t.weight * 100)}%` : "—";
      lines.push(`| \`${t.name}\` | ${peso} | ${t.evidence.join(", ")} |`);
    }
    lines.push("");

    // El material propio se lista POR TEMA, con el tema sin material marcado: ese
    // aviso es la parte más accionable del brief entero.
    if (nuevos.some((t) => t.material !== undefined)) {
      lines.push("### Material tuyo para cada tema", "");
      for (const t of nuevos) {
        const mat = t.material ?? [];
        if (mat.length === 0) {
          lines.push(`- \`${t.name}\` — **nada en tu material**: hay que traerlo de fuera.`);
        } else {
          lines.push(`- \`${t.name}\`:`);
          for (const m of mat) lines.push(`  - \`${m.path}\` _(${m.hits} término(s))_`);
        }
      }
      lines.push("");
    }
  }

  if (cubiertos.length > 0) {
    lines.push("## Ya cubierto (no volver a escribir)", "");
    for (const t of cubiertos) {
      const peso = t.weight > 0 ? ` — pesa ${Math.round(t.weight * 100)}% en la fuente` : "";
      lines.push(`- \`${t.name}\`${peso}`);
    }
    lines.push("");
  }

  lines.push("## Fuentes leídas", "");
  for (const s of brief.sources) lines.push(`- ${s}`);
  lines.push("");

  lines.push("## Límites de esta extracción", "");
  for (const n of brief.notes) lines.push(`- ${n}`);
  lines.push("");

  lines.push(
    "## Siguiente paso",
    "",
    "1. Corrige los temas de arriba: agrúpalos en 3-6 dimensiones con nombre propio.",
    "2. Cura las preguntas (a mano, o con `aptus draft` si quieres un borrador de LLM).",
    "3. `aptus verify-pack <tema>` — 0 errores antes de evaluarte con él.",
    "",
  );

  return lines.join("\n");
}
