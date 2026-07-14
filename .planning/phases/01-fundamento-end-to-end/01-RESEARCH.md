# Phase 1: Fundamento end-to-end - Research

**Researched:** 2026-07-14
**Domain:** CLI TypeScript/Node — carga+validación de contenido YAML, motor de scoring puro, motor de sesión, prompts interactivos, render de resultado
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scaffolding y tooling**
- Lenguaje/runtime: TypeScript sobre Node.js (la máquina corre Node 26.4). Ejecución con `tsx` (esbuild, sin compilar); type-check con `tsc --noEmit`. ESM (`"type": "module"`).
- TypeScript 7 como objetivo, con red de seguridad: si `@typescript-eslint` u otro tooling da fricción con la API aún inestable de TS7, fijar `typescript@^6.0.3` sin bloquear el resto (documentado en STACK.md).
- Gestor de paquetes: npm (consistente con el proyecto hermano `jobhunt/careerops`).
- Test: vitest. El motor de scoring y el validador del pack son la lógica más crítica → cobertura de tests obligatoria ahí.
- Lint/format: ESLint flat config + Prettier. No bloqueante para el MVP.
- Estructura de directorios (separación de capas, decisión arquitectónica #1 del research):
  - `src/core/` — lógica pura: `scoring` (motor de scoring) y `session` (selección + navegación). Sin I/O, sin terminal.
  - `src/content/` — cargador + schema zod del pack. Falla rápido con mensajes claros.
  - `src/cli/` — prompts (`@inquirer/prompts`) + render de resultado (`cli-table3`, `picocolors`). Solo presenta lo que el núcleo ya calculó; nunca deriva ni ajusta scores.
  - `packs/` — contenido YAML fuera del código.
  - Tests co-localizados (`*.test.ts`) o en `test/`, a discreción del planner.
- Entrada CLI: `commander` para el subcomando `start` (más subcomandos llegan en fases posteriores). Ejecutable vía `tsx src/index.ts` / script npm.

**Formato y schema del pack de contenido (CONT-01/02/03, ENG-04)**
- Formato: YAML (legible y editable a mano por Carlos, diff-able), validado con zod al cargar.
- Esquema de pregunta: `id`, `dimension`, `subtopic`, `difficulty` (easy|medium|hard), `roles[]`, `stem`, `options[]` (cada una con `id` y `text`), `correct` (id de opción; permitir array para multi-respuesta futura), `explanation`, `source`, `date`.
- Metadata obligatoria (el validador rechaza el pack si falta): `dimension`, `difficulty`, `stem`, `options` (≥2), `correct` (debe referenciar una `option.id` existente), `explanation`. Sin respuesta correcta válida → pack inválido.
- Pack v1 mínimo real: 2 dimensiones — LLM/RAG/evals y ML clásico — ~12-15 preguntas cada una (≥24-30 en total), contenido real con respuesta correcta verdadera y explicación (no relleno). Cada pregunta con `source` etiquetada (aunque en P1 sea "curación manual"; el mining de `bootcamp-ml-llm` es P2).
- Estructura en disco: `packs/ai-ml-readiness/` con `pack.yaml` (metadata del pack: nombre, versión, lista de dimensiones) + `questions.yaml` (o dividido por dimensión, a discreción del planner). El schema debe permitir campos futuros (baselines, roles→dimensión, confianza) sin romper — esos se rellenan en P3/P4.
- Agnóstico del dominio (ENG-04): ni el motor ni el loader contienen strings de dominio ("LLM", "ML"...) hardcodeados; operan sobre las dimensiones que declara el pack.

**Contrato del motor de scoring (ENG-01/02, pitfalls 2/4/5)**
- Firma pura: `score(answered: AnsweredQuestion[], bank: Question[]) → ScoreResult`. Sin I/O, sin terminal, sin `Date.now()`/`Math.random()` → determinista y testeable con fixtures vitest.
- Sin crédito parcial en select (pitfall 2 grade inflation): acierto binario por pregunta.
- Forma de `ScoreResult`: desglose por dimensión (y por subtema dentro de ella): `{ presented, answered, correct, pct }` donde `pct = correct/answered`. El N (`answered`, y `presented`) va SIEMPRE junto a cada score (RES-01, pitfall 4).
- NUNCA un score único agregado tipo "empleabilidad"/"probabilidad de contratación" (pitfall 5). En P1 el resultado es solo la matriz por dimensión; el readiness por rol es P4.
- Preguntas no respondidas: se cuentan en `presented` pero no en `answered`; `pct` se calcula sobre `answered`. Se reporta `answered/presented` para que quede visible cuánto se dejó sin contestar.

**Sesión + render de resultado (SESS-01/02, RES-01)**
- Prompts: `@inquirer/prompts` (`select`). Sesión navegable: se puede volver atrás a revisar/cambiar una respuesta antes de terminar, no solo avanzar. Ctrl+C sale limpio sin corromper estado.
- Selección equilibrada por dimensión (SESS-02): el motor de sesión reparte las preguntas de forma equilibrada entre las dimensiones del pack, con un mínimo por dimensión para evitar muestra insuficiente. La selección es lógica pura testeable: la aleatoriedad (barajado) se inyecta como una función/seed inyectable (no `Math.random()` directo dentro del núcleo) para que los tests sean deterministas.
- Dimensionado ≥15 min: seleccionar un número de preguntas tal que a ~45-60s/pregunta la sesión dure ≥15 min (≈18-22 preguntas). Configurable por constante.
- Progreso visible: contador sobrio "pregunta N de M" durante la sesión.
- Render de resultado: tabla por dimensión (`cli-table3`) con score y N al lado; barras horizontales unicode (`█░`) coloreadas con `picocolors` para el "radar" sobrio (nada de librerías de radar-chart abandonadas). Estética minimalista clásica (preferencia del usuario) — función sobre adorno.

### Claude's Discretion
- Organización exacta de ficheros de test, nombres internos de tipos, y si el banco YAML se parte por dimensión o va en un fichero — a discreción del planner/executor siempre que respete la separación de capas y los contratos anteriores.
- Elección fina de constantes (nº exacto de preguntas, segundos/pregunta objetivo) mientras cumpla ≥15 min y el mínimo por dimensión.

### Deferred Ideas (OUT OF SCOPE)
- Banco completo de 5 dimensiones + rotación entre intentos → Phase 2.
- Captura de confianza + curva confianza-vs-acierto → Phase 3.
- Readiness por rol + baselines externas + gaps priorizados + plan de estudio → Phase 4.
- Persistencia local + evolución entre sesiones → Phase 5.
- Cruce con ofertas de jobhunt → Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| ENG-01 | El motor de scoring es una función pura (sin I/O ni terminal), testeable con fixtures. | Pattern 2 (motor de scoring puro); Validation Architecture map ENG-01 |
| ENG-02 | El motor calcula puntuación por dimensión y subtema a partir de respuestas correctas/incorrectas. | Pattern 2 (`ScoreResult` por dimensión); Validation Architecture map ENG-02 |
| ENG-04 | El motor es agnóstico del dominio: no contiene conocimiento hardcodeado; todo el contenido vive en el pack. | `QuestionSchema.dimension` como `z.string()` sin enum de dominio (Pattern 1); grep de verificación en Validation Architecture |
| CONT-01 | Un pack se define en ficheros de datos (YAML/JSON) fuera del código. | Pattern 1 (loader YAML+zod), Recommended Project Structure (`packs/ai-ml-readiness/`) |
| CONT-02 | Cada pregunta tiene enunciado, opciones, respuesta correcta, explicación y metadata obligatoria. | `QuestionSchema` completo en Pattern 1 |
| CONT-03 | Un validador comprueba la integridad del pack (schema, respuesta correcta presente, metadata obligatoria) antes de usarlo. | Pattern 1 (`superRefine` para `correct` ∈ `option.id`), Pitfall 2, Security Domain V5 |
| SESS-01 | El usuario responde todas las preguntas con select, navegable, en una sesión de ≥15 min. | Pattern 4 (bucle indexado con "◀ Volver"), Pitfall 1 (`default` de `select`) |
| SESS-02 | El motor de sesión selecciona preguntas equilibradas por dimensión y evita muestra insuficiente por dimensión. | Pattern 3 (`selectBalanced`), Pitfall 3 (mínimo no garantizado si el pool es pequeño) |
| RES-01 | El resultado muestra desglose por dimensión con el N junto a cada score. | Pattern 5 (render con `answered/presented` visible), Validation Architecture map RES-01 |
</phase_requirements>

## Summary

Esta fase no requiere descubrir stack (ya cerrado en STACK.md y en CONTEXT.md) sino resolver el **cómo** implementar cinco piezas concretas de forma que respeten los quality gates de honestidad del proyecto: (1) un loader YAML+zod que falla rápido con mensajes claros y valida que `correct` referencia un `option.id` real; (2) un motor de scoring 100% puro (sin I/O, sin `Date.now()`/`Math.random()`) con aleatoriedad inyectable vía PRNG con semilla; (3) un motor de sesión con selección equilibrada por dimensión (mínimo por dimensión) también puro y testeable; (4) un runner `@inquirer/prompts` `select` con navegación hacia atrás — que Inquirer **no soporta nativamente** y debe implementarse con un bucle indexado propio; (5) un render con `cli-table3` + barras unicode coloreadas con `picocolors` donde el N acompaña siempre al score.

El hallazgo más importante para el planner es que **"navegar hacia atrás" no es una feature de `@inquirer/prompts`** — hay que construirla a mano con un bucle controlado por índice y una choice especial "◀ Volver", reutilizando `default: <value>` de `select()` para reposicionar el cursor en la respuesta previa al volver a mostrar una pregunta ya contestada. Todo lo demás (yaml, zod, commander, cli-table3, vitest) tiene patrones estándar bien documentados y de bajo riesgo.

**Primary recommendation:** Construir `engine/` (loader → scoring → session) primero, con fixtures de vitest, sin tocar `@inquirer/prompts` hasta que scoring y session estén verdes; conectar el runner al final como fue definido en ARCHITECTURE.md.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Carga y validación del pack (YAML→zod) | Content/Loader (`src/content/`) | — | Frontera de datos; falla rápido antes de que el núcleo o la CLI vean datos inválidos |
| Scoring por dimensión/subtema | Core/Engine (`src/core/scoring`) | — | Lógica pura, cero I/O; es la promesa de honestidad del proyecto |
| Selección equilibrada + navegación de sesión | Core/Engine (`src/core/session`) | — | Lógica pura testeable; no depende de terminal |
| Prompts interactivos (select, navegación) | CLI/Terminal (`src/cli/`) | Core/session (consumidor) | I/O puro; solo presenta y captura, nunca decide qué preguntas tocan ni calcula scores |
| Render de resultado (tabla + barras) | CLI/Terminal (`src/cli/`) | — | Solo formatea `ScoreResult` ya calculado; prohibido derivar/ajustar scores aquí |
| Entrypoint / parseo de subcomando `start` | CLI/Terminal (`src/index.ts` + `src/cli/`) | — | Composición: carga pack → arranca sesión → ejecuta scoring → renderiza |

## Standard Stack

> Ya decidido en `.planning/research/STACK.md` y `01-CONTEXT.md`. No se re-litiga; solo se documenta la versión verificada en vivo para esta fase.

### Core (verificado en npm registry, 2026-07-14)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` | 2.9.0 [VERIFIED: npm registry] | Parse de `pack.yaml`/`questions.yaml` | API simple `YAML.parse(str)`, sin dependencias, tipado TS incluido |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Validación del schema del pack + refinements cruzados | Ya usado en el proyecto hermano `jobhunt/careerops`; `safeParse` + `superRefine` cubren el caso "correct debe existir en options" |
| `@inquirer/prompts` | 8.5.2 [VERIFIED: npm registry] | `select` interactivo | Estándar de facto, tipado nativo, `default` acepta un `value` para reposicionar cursor |
| `commander` | 15.0.0 [VERIFIED: npm registry] | Subcomando `start` | ESM-only desde v15, coincide con `"type": "module"` del proyecto |
| `cli-table3` | 0.6.5 [VERIFIED: npm registry] | Tabla de resultado por dimensión | `hAlign` por celda, acepta strings ya coloreados con ANSI |
| `picocolors` | 1.1.1 [VERIFIED: npm registry] | Color de barras/tabla | 14x más ligero que chalk, API casi idéntica |
| `vitest` | 4.1.10 [VERIFIED: npm registry] | Test del motor puro y del validador | ESM nativo, rápido, sin config compleja |
| `typescript` | 7.0.2 [VERIFIED: npm registry] | Type-check (`tsc --noEmit`) | Red de seguridad: si hay fricción de tooling, fijar `^6.0.3` (ver STACK.md) |
| `tsx` | 4.23.1 [VERIFIED: npm registry] | Ejecución sin compilar | Usa esbuild, no depende de la API interna de TS7 aún inestable |

**Instalación:**
```bash
npm install yaml zod @inquirer/prompts commander cli-table3 picocolors
npm install -D typescript tsx vitest @types/node
```

## Package Legitimacy Audit

| Package | Registry | Age (created) | Downloads/semana | Source Repo | Verdict | Disposition |
|---------|----------|----------------|-------------------|--------------|---------|-------------|
| `yaml` | npm | 2011 (14 años) | 158.8M | github.com/eemeli/yaml | OK | Aprobado |
| `zod` | npm | 2020 (6 años) | 208.1M | github.com/colinhacks/zod | OK | Aprobado |
| `@inquirer/prompts` | npm | 2023 (3 años) | 29.4M | github.com/SBoudrias/Inquirer.js | OK | Aprobado |
| `commander` | npm | 2011 (14 años) | 346.8M | github.com/tj/commander.js | OK | Aprobado |
| `cli-table3` | npm | 2018 (8 años) | 28.7M | github.com/cli-table/cli-table3 | OK | Aprobado |
| `picocolors` | npm | 2021 (5 años) | 159.5M | github.com/alexeyraspopov/picocolors | OK | Aprobado |
| `vitest` | npm | 2021 (5 años) | 72.1M | github.com/vitest-dev/vitest | SUS ("too-new") | Aprobado — falso positivo, ver nota |
| `tsx` | npm | 2015 (11 años) | 71.9M | github.com/privatenumber/tsx | SUS ("too-new") | Aprobado — falso positivo, ver nota |

**Nota sobre los dos verdicts SUS:** el seam de legitimidad marca "too-new" basándose en la fecha de publicación de la **última versión** (vitest publicó una versión el 2026-07-06, tsx el 2026-07-13 — ambas hace pocos días), no en la antigüedad del paquete. `npm view <pkg> time.created` confirma que ambos paquetes existen desde 2021 y 2015 respectivamente, con decenas de millones de descargas/semana y repos oficiales activos — es cadencia normal de releases de un paquete maduro, no una señal de slopsquatting. Ningún paquete de esta lista tiene `postinstall` script (verificado con `npm view <pkg> scripts.postinstall`, todos vacíos).

**Packages removed due to [SLOP] verdict:** ninguno.
**Packages flagged as suspicious [SUS]:** `vitest`, `tsx` — flag informativo, no bloqueante (falso positivo documentado arriba); el planner puede omitir el `checkpoint:human-verify` para estos dos dado que la causa raíz está identificada y no es un riesgo real, pero debe dejar constancia en el plan de que se investigó.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  packs/ai-ml-readiness/{pack.yaml, questions.yaml}                 │
│  (contenido, fuera del código — YAML editado a mano)                │
└──────────────────────────────┬───────────────────────────────────┘
                                │ fs.readFile + YAML.parse
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/content/loader.ts                                              │
│  YAML.parse() → PackSchema.safeParse() (zod)                       │
│  refinement: cada question.correct ∈ question.options[].id         │
│  falla rápido con mensaje claro (fichero + pregunta + motivo)      │
└──────────────────────────────┬───────────────────────────────────┘
                                │ Question[] validado y tipado
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/core/session.ts (PURO)                                         │
│  selectBalanced(bank, targetN, minPerDimension, shuffleFn) → Q[]    │
│  buildSession(selected) → estado navegable {index, answers[]}      │
└──────────────────────────────┬───────────────────────────────────┘
                                │ preguntas seleccionadas, en orden
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/cli/runner.ts (I/O)                                            │
│  bucle indexado: muestra pregunta[index] con @inquirer select      │
│  choices = options + "◀ Volver" (si index > 0)                     │
│  Ctrl+C → catch ExitPromptError → salida limpia, sin guardar        │
│  al completar todas → answers: AnsweredQuestion[]                  │
└──────────────────────────────┬───────────────────────────────────┘
                                │ AnsweredQuestion[]
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/core/scoring.ts (PURO — sin I/O, sin Date.now(), sin Math.random)│
│  score(answered, bank) → ScoreResult                                │
│  por dimensión: { presented, answered, correct, pct }               │
│  NUNCA agrega en un score único                                     │
└──────────────────────────────┬───────────────────────────────────┘
                                │ ScoreResult
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/cli/render.ts (I/O)                                            │
│  cli-table3: fila por dimensión con pct + "(answered/presented)"    │
│  picocolors: barra unicode █░ coloreada por pct                     │
│  NO deriva ni ajusta nada — solo formatea ScoreResult                │
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
aptus/
├── src/
│   ├── core/
│   │   ├── scoring.ts          # función pura score()
│   │   ├── scoring.test.ts
│   │   ├── session.ts          # selección equilibrada + navegación pura
│   │   └── session.test.ts
│   ├── content/
│   │   ├── schema.ts           # PackSchema, QuestionSchema (zod)
│   │   ├── loader.ts           # loadPack(dir) → Pack validado
│   │   └── loader.test.ts
│   ├── cli/
│   │   ├── runner.ts           # bucle de sesión con @inquirer/prompts select
│   │   ├── render.ts           # cli-table3 + picocolors
│   │   └── commands/
│   │       └── start.ts        # subcomando `aptus start`
│   └── index.ts                # entrypoint commander
├── packs/
│   └── ai-ml-readiness/
│       ├── pack.yaml            # metadata: nombre, versión, dimensiones
│       └── questions.yaml       # o questions/<dimension>.yaml — a discreción
├── test/
│   └── fixtures/
│       └── mini-pack/           # fixture pequeño y determinista para tests
└── package.json
```

### Pattern 1: Loader YAML + zod con refinamiento cruzado

**What:** Parsear YAML con `YAML.parse()`, validar con `PackSchema.safeParse()`, y usar `superRefine` para verificar que `correct` referencia un `option.id` existente dentro de la misma pregunta.
**When to use:** Único punto de entrada del contenido al sistema (`src/content/loader.ts`).
**Confidence:** [CITED: github.com/eemeli/yaml, zod.dev/api]

```typescript
// src/content/schema.ts
import { z } from "zod";

const OptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const QuestionSchema = z
  .object({
    id: z.string(),
    dimension: z.string(),          // sin enum hardcodeado: el pack declara sus dimensiones (ENG-04)
    subtopic: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    roles: z.array(z.string()).default([]),
    stem: z.string(),
    options: z.array(OptionSchema).min(2),
    correct: z.union([z.string(), z.array(z.string())]),
    explanation: z.string(),
    source: z.string(),
    date: z.string(),
  })
  .superRefine((q, ctx) => {
    const ids = new Set(q.options.map((o) => o.id));
    const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
    for (const cid of correctIds) {
      if (!ids.has(cid)) {
        ctx.addIssue({
          code: "custom",
          message: `correct='${cid}' no referencia ningún option.id de la pregunta '${q.id}'`,
          path: ["correct"],
        });
      }
    }
  });

export const PackSchema = z.object({
  name: z.string(),
  version: z.string(),
  dimensions: z.array(z.string()),
  questions: z.array(QuestionSchema).min(1),
});
```

```typescript
// src/content/loader.ts
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { PackSchema } from "./schema.js";

export function loadPack(pathToPackYaml: string, pathToQuestionsYaml: string) {
  const packRaw = parseYaml(readFileSync(pathToPackYaml, "utf8"));
  const questionsRaw = parseYaml(readFileSync(pathToQuestionsYaml, "utf8"));
  const merged = { ...packRaw, questions: questionsRaw.questions ?? questionsRaw };

  const result = PackSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Pack inválido en ${pathToQuestionsYaml}:\n${issues}`);
  }
  return result.data;
}
```

**Nota sobre errores de sintaxis YAML:** `YAML.parse()` lanza un error con mensaje y ubicación (línea/columna) si el YAML es sintácticamente inválido — dejar que esa excepción propague (o envolverla en un mensaje homogéneo) es preferible a un try/catch silencioso, porque el requisito es que el CLI **rechace el pack antes de arrancar una sesión** (CONT-03), no que degrade con datos parciales.

### Pattern 2: Motor de scoring puro con N siempre visible

**What:** `score()` es una función determinista que jamás importa nada de `cli/`, nunca llama a `Date.now()`/`Math.random()`, y siempre reporta `presented` junto a `answered`/`correct`/`pct`.
**When to use:** `src/core/scoring.ts`.
**Confidence:** [ASSUMED — diseño derivado de los quality gates de CONTEXT.md, no de una librería externa]

```typescript
// src/core/scoring.ts — sin imports de cli/, sin Date.now(), sin Math.random()
export interface AnsweredQuestion {
  questionId: string;
  selectedOptionId: string | null; // null = no respondida
}

export interface DimensionScore {
  dimension: string;
  presented: number;
  answered: number;
  correct: number;
  pct: number; // correct / answered (0 si answered === 0)
}

export interface ScoreResult {
  byDimension: DimensionScore[];
  // NUNCA un campo tipo "overall"/"employability" — prohibido por diseño (RES-01, pitfall 5/8)
}

export function score(
  answered: AnsweredQuestion[],
  presentedBank: Question[]
): ScoreResult {
  const byDim = new Map<string, DimensionScore>();

  for (const q of presentedBank) {
    const d = byDim.get(q.dimension) ?? {
      dimension: q.dimension,
      presented: 0,
      answered: 0,
      correct: 0,
      pct: 0,
    };
    d.presented += 1;

    const answer = answered.find((a) => a.questionId === q.id);
    if (answer && answer.selectedOptionId !== null) {
      d.answered += 1;
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (correctIds.includes(answer.selectedOptionId)) {
        d.correct += 1; // binario — sin crédito parcial
      }
    }
    byDim.set(q.dimension, d);
  }

  for (const d of byDim.values()) {
    d.pct = d.answered > 0 ? d.correct / d.answered : 0;
  }

  return { byDimension: [...byDim.values()] };
}
```

### Pattern 3: Selección equilibrada por dimensión, pura y con shuffle inyectable

**What:** `selectBalanced()` reparte preguntas por dimensión con un mínimo garantizado, usando una función de shuffle inyectada (no `Math.random()` directo) para que los tests sean deterministas.
**When to use:** `src/core/session.ts`.
**Confidence:** [CITED: patrón mulberry32+Fisher-Yates, ver Code Examples] para el PRNG; el algoritmo de reparto en sí es diseño propio derivado de SESS-02.

```typescript
// src/core/session.ts
export type ShuffleFn = <T>(items: T[]) => T[];

export function selectBalanced(
  bank: Question[],
  targetTotal: number,
  minPerDimension: number,
  shuffle: ShuffleFn
): Question[] {
  const byDim = groupBy(bank, (q) => q.dimension);
  const dimensions = [...byDim.keys()];
  const perDim = Math.max(minPerDimension, Math.floor(targetTotal / dimensions.length));

  const selected: Question[] = [];
  for (const dim of dimensions) {
    const pool = shuffle(byDim.get(dim)!);
    const take = Math.min(perDim, pool.length); // nunca más de lo que hay disponible
    selected.push(...pool.slice(0, take));
  }
  return shuffle(selected); // orden final también determinista si se inyecta el mismo shuffle
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}
```

**Nota — "muestra insuficiente":** si `pool.length < minPerDimension` para alguna dimensión, `selectBalanced` toma todo lo disponible (`take = Math.min(perDim, pool.length)`) sin lanzar error — es responsabilidad del **validador del pack** (Pattern 1) o de un chequeo previo en `loader.ts` avisar si una dimensión no alcanza el mínimo configurado, no de la función de selección en sí (mantiene `selectBalanced` pura y simple).

### Pattern 4: Navegación hacia atrás con `@inquirer/prompts` (bucle indexado manual)

**What:** `@inquirer/prompts` **no tiene soporte nativo para "volver atrás"** entre prompts secuenciales — confirmado en issues sin resolver del propio repo (SBoudrias/Inquirer.js#876, #979). El patrón estándar es un bucle controlado por índice mutable, con una choice especial para retroceder, y usando `default: <value>` de `select()` para reposicionar el cursor en la respuesta ya dada al revisitar una pregunta.
**When to use:** `src/cli/runner.ts`.
**Confidence:** [CITED: github.com/SBoudrias/Inquirer.js issues #876, #979; github.com/SBoudrias/Inquirer.js/blob/main/packages/select/README.md]

```typescript
// src/cli/runner.ts
import { select } from "@inquirer/prompts";
import type { Question } from "../content/schema.js";
import type { AnsweredQuestion } from "../core/scoring.js";

const BACK = "__back__";

export async function runSession(
  questions: Question[]
): Promise<AnsweredQuestion[]> {
  const answers = new Map<string, string>(); // questionId -> selectedOptionId
  let index = 0;

  try {
    while (index < questions.length) {
      const q = questions[index];
      const choices = [
        ...q.options.map((o) => ({ value: o.id, name: o.text })),
        ...(index > 0 ? [{ value: BACK, name: "◀ Volver a la pregunta anterior" }] : []),
      ];

      const answer = await select({
        message: `Pregunta ${index + 1} de ${questions.length} [${q.dimension}]\n${q.stem}`,
        choices,
        default: answers.get(q.id), // reposiciona el cursor si ya se había respondido
      });

      if (answer === BACK) {
        index -= 1;
        continue;
      }

      answers.set(q.id, answer);
      index += 1;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "ExitPromptError") {
      // Ctrl+C: salida limpia, no se persiste nada a medio hacer
      console.log("\nSesión cancelada. No se ha guardado ningún resultado.");
      process.exit(0);
    }
    throw err;
  }

  return questions.map((q) => ({
    questionId: q.id,
    selectedOptionId: answers.get(q.id) ?? null,
  }));
}
```

### Pattern 5: Render de resultado con N visible junto al score

**What:** `cli-table3` para la tabla por dimensión, `picocolors` para colorear una barra unicode `█░` construida a mano — nunca una librería de radar-chart (`terminal-charter` está prácticamente abandonado, ver STACK.md "What NOT to Use").
**When to use:** `src/cli/render.ts`.
**Confidence:** [CITED: github.com/cli-table/cli-table3/blob/master/README.md]

```typescript
// src/cli/render.ts
import Table from "cli-table3";
import pc from "picocolors";
import type { ScoreResult } from "../core/scoring.js";

function bar(pct: number, width = 20): string {
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const colorFn = pct >= 0.7 ? pc.green : pct >= 0.4 ? pc.yellow : pc.red;
  return colorFn(bar);
}

export function renderResult(result: ScoreResult): string {
  const table = new Table({
    head: ["Dimensión", "Resultado", "N (respondidas/presentadas)"],
    colWidths: [24, 30, 30],
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
```

### Anti-Patterns to Avoid
- **Prompts anidados/recursivos para simular "volver atrás":** genera stack de promesas difícil de razonar y de testear; usar el bucle indexado del Pattern 4.
- **`Math.random()` dentro de `core/`:** rompe la pureza y hace los tests no deterministas; siempre inyectar un `ShuffleFn`.
- **Colorear dentro de `core/scoring.ts`:** el color/formato pertenece a `cli/render.ts`; el núcleo solo devuelve datos.
- **Try/catch silencioso alrededor de `PackSchema.safeParse`:** `safeParse` ya no lanza — usar el `success`/`error` explícito y **abortar el arranque del CLI** si falla, nunca continuar con datos parcialmente válidos (CONT-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Parseo de YAML | Parser YAML a mano / regex | `yaml` (eemeli/yaml) | Sintaxis YAML tiene muchos casos borde (anchors, multiline, tipos implícitos); un parser a mano introduce bugs sutiles de contenido |
| Validación de schema + mensajes de error | `if`/`throw` anidados a mano | `zod` `safeParse`/`superRefine` | Ya usado en `jobhunt`; da mensajes de error con `path` estructurado reutilizable para UX de error claro |
| Prompt de selección en terminal (flechas, paginación, teclado) | Loop de `readline` a mano | `@inquirer/prompts` `select` | Manejo de teclado, paginación, temas y accesibilidad ya resueltos; reinventar esto es alto esfuerzo para cero beneficio |
| Generador de números pseudoaleatorios con semilla | `Math.random()` con un "hack" de semilla | mulberry32 (función pura de ~5 líneas, ver Code Examples) | No hay paquete npm estándar universalmente adoptado para esto tan simple; mulberry32 es la implementación de referencia citada en toda la literatura de PRNGs deterministas ligeros — se copia como función pura, no como dependencia |
| Radar/gráfico visual de terminal | Librería de radar-chart (`terminal-charter`, 1 descarga/semana) | Barras unicode `█░` + `cli-table3` + `picocolors` | `terminal-charter` está esencialmente abandonado (ver STACK.md); una barra horizontal coloreada es más sobria, más controlable y coherente con el minimalismo clásico preferido |

**Key insight:** Todas las piezas de "no reinventar" de esta fase ya tienen solución de librería estándar excepto el PRNG con semilla — y ahí la razón para no usar un paquete npm es que la implementación de referencia (mulberry32) es tan pequeña y estable que copiarla como función pura es más simple y auditable que añadir una dependencia externa para 5 líneas de código matemático fijo.

## Common Pitfalls

### Pitfall 1: `default` de `select()` no acepta un índice, acepta un `value`
**What goes wrong:** Se intenta pasar `default: 0` (índice) esperando que posicione el cursor en la primera opción.
**Why it happens:** Confusión con otras librerías de prompts que sí usan índice.
**How to avoid:** `default` debe ser el `value` exacto de una `Choice` (p. ej. el `option.id`), no un índice numérico.
**Warning signs:** El cursor siempre aparece en la primera opción pese a pasar `default`.

### Pitfall 2: Confundir `refine` con `superRefine` para validar contra otro campo del mismo objeto
**What goes wrong:** Usar `.refine()` cuando se necesita reportar **múltiples** issues con paths distintos (p. ej. varias `correct` inválidas en preguntas multi-respuesta).
**Why it happens:** `.refine()` solo permite un mensaje/path por invocación; `.superRefine()` permite múltiples `ctx.addIssue()`.
**How to avoid:** Usar `superRefine` en `QuestionSchema` (ver Pattern 1) para poder señalar con precisión qué `correct` id es inválido, no solo que "la pregunta es inválida".
**Warning signs:** El mensaje de error del pack inválido no dice qué pregunta ni qué campo específico falló.

### Pitfall 3: Filtrar por dificultad/dimensión pero olvidar que `selectBalanced` no garantiza el mínimo si el pack es pequeño
**What goes wrong:** Con un pack de 12-15 preguntas por dimensión y `minPerDimension` alto, `selectBalanced` silenciosamente devuelve menos de lo pedido si `pool.length < minPerDimension`.
**Why it happens:** La función está diseñada para no lanzar (mantenerse pura y simple, ver Pattern 3).
**How to avoid:** Validar el tamaño mínimo del pack **en el loader** (Pattern 1), no en `selectBalanced` — el pack v1 real (≥12-15 preguntas/dimensión) ya cumple esto, pero un fixture de test pequeño podría no cumplirlo sin darse cuenta.
**Warning signs:** Una sesión de test sale con menos preguntas de las esperadas en una dimensión sin ningún error visible.

### Pitfall 4: Ejecutar `tsx` con `commander` y olvidar `"type": "module"` en package.json
**What goes wrong:** `commander@15` es ESM-only; si `package.json` no declara `"type": "module"`, los `import`/`export` fallan con `SyntaxError: Cannot use import statement outside a module`.
**Why it happens:** Es fácil olvidar este flag en un scaffold nuevo.
**How to avoid:** `"type": "module"` en `package.json` desde el primer commit del scaffolding (ya decidido en CONTEXT.md).
**Warning signs:** Error de sintaxis en el primer `tsx src/index.ts`.

## Code Examples

### PRNG determinista mulberry32 + shuffle inyectable (Fisher-Yates)

```typescript
// src/core/random.ts — función pura, sin dependencias externas
// Fuente: implementación de referencia estándar de mulberry32 (dominio público,
// ampliamente citada — ver https://github.com/robbiespeed/seeded-shuffle y
// https://www.4rknova.com/blog/2026/03/01/mulberry32-rng)
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeededShuffle(seed: number) {
  const rng = mulberry32(seed);
  return function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
}
```

```typescript
// src/core/session.test.ts — ejemplo de test determinista con vitest
import { describe, it, expect } from "vitest";
import { selectBalanced } from "./session.js";
import { makeSeededShuffle } from "./random.js";

describe("selectBalanced", () => {
  it("reparte de forma equilibrada y es determinista con la misma seed", () => {
    const bank = makeFixtureBank(); // fixture con 2 dimensiones, 10 preguntas cada una
    const shuffle = makeSeededShuffle(42);

    const result1 = selectBalanced(bank, 10, 4, shuffle);
    const result2 = selectBalanced(bank, 10, 4, makeSeededShuffle(42));

    expect(result1).toEqual(result2); // mismo seed -> mismo resultado
    const perDim = countByDimension(result1);
    expect(perDim["llm-rag"]).toBeGreaterThanOrEqual(4);
    expect(perDim["ml-classico"]).toBeGreaterThanOrEqual(4);
  });
});
```

### Subcomando `start` con commander en ESM

```typescript
// src/index.ts
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
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|----------------|--------|
| `inquirer` (paquete monolítico) | `@inquirer/prompts` (modular) | Consolidado desde ~2023 | Import por tipo de prompt, tipado TS nativo — ya reflejado en STACK.md |
| `ts-node` | `tsx` | Consenso de comunidad ~2022-2024 | Arranque casi instantáneo vía esbuild — ya reflejado en STACK.md/CONTEXT.md |
| `zod` v3 `.refine`/`superRefine` con `ctx.addIssue({ path, message })` | `zod` v4 mantiene la misma API pero con `code: "custom"` explícito y helpers de error más ricos | zod v4 (2025) | Sintaxis casi idéntica a v3; los ejemplos de este documento son válidos para v4.4.3 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | El algoritmo concreto de `selectBalanced` (reparto `Math.floor(targetTotal/numDimensiones)` con mínimo por dimensión) es diseño propio, no un patrón de librería documentado externamente | Pattern 3 | Bajo — es lógica de negocio simple y testeable; si el planner prefiere otra estrategia de reparto (p. ej. proporcional al tamaño del pool por dimensión en vez de igual reparto), es un cambio local sin impacto en el resto de la arquitectura |
| A2 | El patrón de bucle indexado con choice "◀ Volver" para navegación es la solución estándar de la comunidad (no una API oficial de Inquirer) | Pattern 4 | Bajo-Medio — está confirmado que Inquirer no ofrece nativo, pero la forma exacta del bucle (dónde poner la choice, usar `default` para reposicionar) es una implementación razonada, no copiada de un ejemplo oficial |
| A3 | La implementación de mulberry32 mostrada es la versión de referencia ampliamente citada, pero no se verificó contra una fuente única "canónica" (es de dominio público, sin autor/paquete oficial) | Code Examples | Bajo — el algoritmo es matemáticamente simple y ampliamente reproducido de forma idéntica en múltiples fuentes independientes; un test de determinismo (misma seed → misma secuencia) lo valida en la práctica sin depender de la fuente |

**Si esta tabla estuviera vacía:** no aplica — hay 3 asunciones de diseño propio documentadas arriba, ninguna sobre librerías externas (esas sí están verificadas contra npm registry o documentación oficial).

## Open Questions

1. **¿`questions.yaml` único o partido por dimensión (`questions/llm-rag.yaml`, `questions/ml-classico.yaml`)?**
   - What we know: CONTEXT.md deja esto a discreción del planner/executor.
   - What's unclear: si partir por fichero complica el loader (dos fuentes a mergear) sin beneficio real en esta fase con solo 2 dimensiones.
   - Recommendation: para 2 dimensiones y ~30 preguntas totales, un único `questions.yaml` es más simple de cargar y validar; partir por dimensión tiene más sentido a partir de Fase 2 (5 dimensiones, banco mucho mayor). El loader del Pattern 1 ya soporta ambos casos con un cambio mínimo (leer un directorio vs. un fichero).

2. **¿Cuántas preguntas exactas por sesión y cuántas dura cada una (constante de dimensionado)?**
   - What we know: CONTEXT.md fija el rango objetivo (~18-22 preguntas a 45-60s/pregunta para ≥15 min), configurable por constante.
   - What's unclear: el valor exacto depende del pack real curado en esta misma fase (12-15 preguntas/dimensión × 2 dimensiones = 24-30 disponibles).
   - Recommendation: fijar la constante como `SESSION_TARGET_QUESTIONS = 20` (10 por dimensión) y `MIN_PER_DIMENSION = 8`, ajustable sin tocar la lógica de `selectBalanced` — son solo parámetros de entrada.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|-----------|
| Node.js | Runtime del CLI | ✓ | v26.4.0 | — |
| npm | Gestor de paquetes | ✓ | 12.0.1 | — |
| git | Control de versiones / commits del plan | ✓ | (repo detectado en `/home/portal/workspace/aptus`) | — |

**Missing dependencies with no fallback:** ninguna — entorno completo para esta fase (proyecto greenfield, sin dependencias externas de servicios).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 |
| Config file | ninguno aún — Wave 0 debe crear `vitest.config.ts` mínimo (o usar defaults de vitest sin config si el proyecto es simple) |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|---------------|
| ENG-01 | `score()` no tiene I/O ni usa `Date.now()`/`Math.random()`; mismo input → mismo output | unit | `npx vitest run src/core/scoring.test.ts` | ❌ Wave 0 |
| ENG-02 | `score()` calcula correctamente por dimensión y subtema a partir de aciertos/fallos, incluyendo preguntas no respondidas (`answered < presented`) | unit | `npx vitest run src/core/scoring.test.ts` | ❌ Wave 0 |
| ENG-04 | El motor (`scoring.ts`, `session.ts`) no contiene ningún string literal de dominio (`"LLM"`, `"ML"`, etc.) — grep automatizado | unit/static | `grep -riE "llm|rag|ml.?clasico" src/core/ \| wc -l` debe dar 0 | ❌ Wave 0 |
| CONT-01 | El loader carga un pack YAML válido y devuelve datos tipados | unit | `npx vitest run src/content/loader.test.ts` | ❌ Wave 0 |
| CONT-02 | Cada pregunta cargada tiene todos los campos de metadata obligatorios | unit | `npx vitest run src/content/loader.test.ts` | ❌ Wave 0 |
| CONT-03 | El validador rechaza un pack con `correct` que no referencia ningún `option.id`, y rechaza un pack con menos de 2 `options` | unit | `npx vitest run src/content/loader.test.ts` (fixtures inválidas) | ❌ Wave 0 |
| SESS-01 | El runner permite navegar hacia atrás y modificar una respuesta antes de terminar (verificación manual/UAT — I/O de terminal no es fixture-testeable con vitest sin mockear stdin) | manual + unit parcial | manual: `npm start` y probar Ctrl+flecha atrás; unit: testear la lógica de índice del bucle extraída como función pura si se refactoriza | ❌ Wave 0 (parcial) |
| SESS-02 | `selectBalanced()` respeta el mínimo por dimensión y es determinista con la misma seed | unit | `npx vitest run src/core/session.test.ts` | ❌ Wave 0 |
| RES-01 | El render (`render.ts`) incluye siempre `answered/presented` junto al `pct` en cada fila — nunca un `pct` sin su N | unit (test de snapshot/contenido de string) | `npx vitest run src/cli/render.test.ts` (assert que el string de salida contiene `/` junto a cada `%`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=dot` (rápido, <5s con este volumen de tests)
- **Per wave merge:** `npx vitest run` (suite completa) + `npx tsc --noEmit`
- **Phase gate:** Suite completa en verde + `tsc --noEmit` sin errores antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — configuración mínima (o confirmar que los defaults de vitest son suficientes sin fichero)
- [ ] `test/fixtures/mini-pack/` — pack YAML de fixture pequeño (2 dimensiones, ~6-8 preguntas cada una) para tests deterministas de `session.ts` y `scoring.ts`, separado del pack real de `packs/ai-ml-readiness/`
- [ ] `test/fixtures/invalid-packs/` — al menos dos fixtures inválidas: (a) `correct` que no referencia ningún `option.id`, (b) pregunta con menos de 2 `options`
- [ ] `src/core/scoring.test.ts`, `src/core/session.test.ts`, `src/content/loader.test.ts`, `src/cli/render.test.ts` — ficheros de test aún no existen (proyecto greenfield)
- [ ] Instalación de framework: `npm install -D vitest` (incluido en Standard Stack de esta fase)

**Nota sobre invariantes a verificar en scoring/selección (no solo casos felices):**
- `answered <= presented` siempre (nunca se puede responder más de lo presentado).
- `pct` está en `[0, 1]` siempre, y es `0` (no `NaN`) cuando `answered === 0`.
- Ninguna pregunta contribuye a `correct` sin contribuir también a `answered` (invariante de conteo).
- `selectBalanced` con `minPerDimension` mayor que el pool disponible no lanza excepción — devuelve el máximo disponible (ver Pitfall 3).
- Casos borde explícitos a testear: sesión con 0 preguntas respondidas (`answered=0` en todas las dimensiones, sin división por cero), pack con una sola dimensión, pack con una pregunta con `correct` como array (multi-respuesta futura) aunque P1 solo use single-answer.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V2 Authentication | no | CLI personal local, sin autenticación |
| V3 Session Management | no | No hay sesión de red; "sesión de test" es un concepto de dominio, no de seguridad |
| V4 Access Control | no | Un solo usuario, sin control de acceso |
| V5 Input Validation | sí | `zod` `safeParse`/`superRefine` en `src/content/loader.ts` — el pack YAML es la única entrada externa no confiable de esta fase (fichero editado a mano por Carlos, pero el validador debe tratarlo como no confiable: rechazar campos faltantes, tipos incorrectos, referencias rotas) |
| V6 Cryptography | no | No hay secretos ni datos cifrados en esta fase (persistencia es Fase 5) |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-------------------------|
| YAML malformado o con estructura inesperada (p. ej. `options` como string en vez de array) provoca crash no controlado del CLI | Denial of Service (local) | Validación completa con zod antes de cualquier uso; el CLI debe salir con mensaje claro (exit code ≠ 0), no con stack trace crudo |
| Pack con `correct` apuntando a un `option.id` inexistente permite que ninguna respuesta sea nunca "correcta" para esa pregunta, inflando artificialmente el % de fallo sin que el usuario sepa por qué | Tampering (integridad de datos, no malicioso pero mismo efecto) | `superRefine` del Pattern 1 rechaza el pack completo al arrancar — no se puede iniciar una sesión con datos rotos (CONT-03) |
| Ejecución de YAML con tipos de datos peligrosos (algunos parsers YAML permiten tags custom que instancian objetos arbitrarios) | Tampering / RCE (bajo pero real en parsers YAML permisivos) | El paquete `yaml` (eemeli/yaml) usa por defecto el esquema "core" seguro (no ejecuta tags custom arbitrarios como `!!python/object` de otros lenguajes); no se necesita configuración adicional para este caso de uso, pero no cargar packs de fuentes no confiables sin revisión |

**Nota de alcance:** dado que Aptus es una herramienta personal de terminal de un solo usuario sin red ni multiusuario (confirmado en ROADMAP.md/REQUIREMENTS.md Out of Scope), la superficie de amenaza real de esta fase se reduce casi enteramente a V5 (validación del pack YAML). Las categorías V2/V3/V4/V6 se documentan como "no aplica" en vez de omitirse, para que quede explícito que se revisaron y no fueron ignoradas.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version/time.created/scripts.postinstall`, verificado en vivo 2026-07-14) — versiones exactas y señales de legitimidad de: `yaml@2.9.0`, `zod@4.4.3`, `@inquirer/prompts@8.5.2`, `commander@15.0.0`, `cli-table3@0.6.5`, `picocolors@1.1.1`, `vitest@4.1.10`, `tsx@4.23.1`, `typescript@7.0.2`, `@types/node@26.1.1`.
- [github.com/SBoudrias/Inquirer.js/blob/main/packages/select/README.md](https://github.com/SBoudrias/Inquirer.js/blob/main/packages/select/README.md) — API exacta de `select()`, shape de `Choice`, comportamiento de `default` (fetch directo del README oficial vía curl, HIGH confianza por ser fuente primaria).
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` — research de proyecto ya verificado, reutilizado sin repetir.

### Secondary (MEDIUM confidence)
- [zod.dev/api](https://zod.dev/api) — sintaxis de `superRefine`/`ctx.addIssue`/`safeParse` para zod v4.
- [github.com/cli-table/cli-table3/blob/master/README.md](https://github.com/cli-table/cli-table3/blob/master/README.md) — ejemplos de tabla, `hAlign`, coloreado de celdas.
- [github.com/SBoudrias/Inquirer.js issues #876 y #979](https://github.com/SBoudrias/Inquirer.js/issues/876) — confirmación de que "volver atrás" no es nativo.
- WebSearch cruzada sobre `yaml` npm (parsing, manejo de errores), vitest 2026 (estructura de proyecto, fixtures), commander ESM+tsx — múltiples fuentes independientes coinciden en las conclusiones.

### Tertiary (LOW confidence)
- Implementación de mulberry32 — algoritmo de dominio público ampliamente reproducido en múltiples fuentes (blogs técnicos), sin una única fuente "canónica" oficial; verificado por lógica matemática y determinismo comprobable en test, no por autoridad de fuente.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas las versiones verificadas en vivo contra npm registry, coincide con STACK.md ya existente.
- Architecture: HIGH — patrones de capas puro/IO consolidados en ARCHITECTURE.md del proyecto; esta fase solo añade el detalle de implementación.
- Navegación hacia atrás en Inquirer: MEDIUM-HIGH — confirmado que no es nativo (fuente primaria: issues del repo oficial), pero el patrón de bucle indexado propuesto es diseño razonado, no copiado de un ejemplo oficial.
- PRNG con semilla: MEDIUM — algoritmo correcto y ampliamente verificado por terceros, pero sin fuente única canónica.
- Pitfalls: HIGH — ya cubiertos en `.planning/research/PITFALLS.md` a nivel de proyecto; esta fase solo verifica que el diseño técnico concreto (Pattern 1-5) los cierra.

**Research date:** 2026-07-14
**Valid until:** 2026-08-13 (30 días — stack basado en librerías estables; TypeScript 7 es la única pieza de rápida evolución, ya con red de seguridad documentada en STACK.md)
