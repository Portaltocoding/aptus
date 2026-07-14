# Phase 1: Fundamento end-to-end - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** ~14 (a crear, ninguno existe aún)
**Analogs found:** 0 / 14 (proyecto greenfield — no hay analogías en el repo)

## Greenfield — sin analogías en el repositorio

`/home/portal/workspace/aptus` contiene únicamente `.planning/` y git (7 commits de documentación). No existe `src/`, `packs/` ni `test/`. No hay ningún fichero de código para leer y extraer patrones reales del propio repo.

**Consecuencia para el planner:** los "patrones a copiar" de esta fase no vienen de analogías in-repo, sino de los Patterns 1-5 ya completamente especificados con código en `01-RESEARCH.md` (líneas 216-506). El planner debe tratar esos bloques de código del research como la fuente de verdad de implementación, no como referencia — cópialos casi literalmente al crear cada fichero.

**Referencia externa no leíble:** CONTEXT.md menciona que el proyecto hermano `jobhunt/careerops` usa zod para validar `profile.yml` (mismo estilo de validación deseado para el pack). Esa ruta no está disponible en este entorno de trabajo (`/home/portal/workspace/aptus` es un repo distinto), así que no se pudo leer ni citar código concreto de ahí — se documenta la convención por nombre únicamente, sin excerpt.

## File Classification

| New file | Role | Data Flow | Fuente del patrón | Match Quality |
|----------|------|-----------|--------------------|----------------|
| `src/content/schema.ts` | model (zod schema) | transform/validation | RESEARCH.md Pattern 1 | no analog (greenfield) |
| `src/content/loader.ts` | service (loader) | file-I/O | RESEARCH.md Pattern 1 | no analog (greenfield) |
| `src/content/loader.test.ts` | test | — | RESEARCH.md Validation Architecture / Wave 0 Gaps | no analog (greenfield) |
| `src/core/scoring.ts` | service (motor puro) | transform (CRUD-like, sin I/O) | RESEARCH.md Pattern 2 | no analog (greenfield) |
| `src/core/scoring.test.ts` | test | — | RESEARCH.md Validation Architecture / Code Examples | no analog (greenfield) |
| `src/core/session.ts` | service (motor puro) | transform | RESEARCH.md Pattern 3 | no analog (greenfield) |
| `src/core/session.test.ts` | test | — | RESEARCH.md Code Examples (test determinista) | no analog (greenfield) |
| `src/core/random.ts` | utility (PRNG) | transform | RESEARCH.md Code Examples (mulberry32 + seeded shuffle) | no analog (greenfield) |
| `src/cli/runner.ts` | controller (I/O terminal) | event-driven (bucle interactivo) | RESEARCH.md Pattern 4 | no analog (greenfield) |
| `src/cli/render.ts` | component (render) | transform | RESEARCH.md Pattern 5 | no analog (greenfield) |
| `src/cli/render.test.ts` | test | — | RESEARCH.md Validation Architecture (RES-01) | no analog (greenfield) |
| `src/cli/commands/start.ts` | controller (subcomando) | request-response | RESEARCH.md Code Examples (`src/index.ts`) + Architecture Diagram | no analog (greenfield) |
| `src/index.ts` | config/entrypoint | request-response | RESEARCH.md Code Examples ("Subcomando `start` con commander en ESM") | no analog (greenfield) |
| `packs/ai-ml-readiness/pack.yaml` | config (contenido) | — | RESEARCH.md Recommended Project Structure + PackSchema | no analog (greenfield) |
| `packs/ai-ml-readiness/questions.yaml` | config (contenido) | — | RESEARCH.md Recommended Project Structure + QuestionSchema | no analog (greenfield) |
| `test/fixtures/mini-pack/*` | test fixture | — | RESEARCH.md Wave 0 Gaps | no analog (greenfield) |
| `test/fixtures/invalid-packs/*` | test fixture | — | RESEARCH.md Wave 0 Gaps | no analog (greenfield) |
| `vitest.config.ts` | config | — | RESEARCH.md Validation Architecture (Wave 0 Gaps) | no analog (greenfield) |
| `package.json` | config | — | RESEARCH.md Standard Stack (instalación) + pitfall 4 (`"type":"module"`) | no analog (greenfield) |

## Pattern Assignments (por capa — según separación núcleo/contenido/IO de CONTEXT.md)

### Capa `src/content/` — cargador + schema (CONT-01/02/03, ENG-04)

**Fuente:** RESEARCH.md Pattern 1 (líneas 222-289), código completo listo para copiar:
- `schema.ts`: `OptionSchema`, `QuestionSchema` con `.superRefine()` verificando `correct` ∈ `option.id`, `PackSchema`.
- `loader.ts`: `loadPack(pathToPackYaml, pathToQuestionsYaml)` — `YAML.parse` + `PackSchema.safeParse` + mensaje de error estructurado por `issue.path`.
- Regla clave: `dimension: z.string()` sin enum — nunca hardcodear nombres de dominio ("LLM", "ML") en el schema (ENG-04, verificado con grep en Validation Architecture).
- Anti-patrón explícito a evitar (RESEARCH.md Anti-Patterns): try/catch silencioso alrededor de `safeParse` — usar `success`/`error` y abortar arranque si falla.

### Capa `src/core/` — motor puro (ENG-01/02, SESS-02)

**Fuente:** RESEARCH.md Pattern 2 (líneas 297-350) para `scoring.ts`:
- Interfaces `AnsweredQuestion`, `DimensionScore`, `ScoreResult`.
- `score(answered, presentedBank)` — desglose por dimensión con `presented/answered/correct/pct`, acierto binario, `pct = 0` si `answered === 0` (nunca `NaN`).
- Prohibido: ningún campo agregado tipo `overall` (pitfall 5); nada de `Date.now()`/`Math.random()`; cero imports de `cli/`.

**Fuente:** RESEARCH.md Pattern 3 (líneas 358-390) para `session.ts`:
- `selectBalanced(bank, targetTotal, minPerDimension, shuffle: ShuffleFn)` con reparto `Math.floor(targetTotal/numDimensiones)` y mínimo garantizado hasta el límite del pool disponible (no lanza si el pool es pequeño — ver Pitfall 3).
- `groupBy` helper.

**Fuente:** RESEARCH.md Code Examples (líneas 537-563) para `random.ts`:
- `mulberry32(seed)` y `makeSeededShuffle(seed)` (Fisher-Yates) — función pura sin dependencias, se copia literal, no se instala como paquete npm (ver "Don't Hand-Roll").

### Capa `src/cli/` — I/O terminal (SESS-01, RES-01)

**Fuente:** RESEARCH.md Pattern 4 (líneas 400-450) para `runner.ts`:
- Bucle indexado manual con `@inquirer/prompts` `select()` — **Inquirer no soporta "volver atrás" nativamente** (confirmado en issues #876/#979 del repo oficial).
- Choice especial `BACK = "__back__"` visible solo si `index > 0`.
- `default: answers.get(q.id)` reposiciona el cursor en la respuesta previa (Pitfall 1: `default` es un `value`, no un índice).
- Captura `ExitPromptError` para salida limpia en Ctrl+C sin persistir nada a medio hacer.

**Fuente:** RESEARCH.md Pattern 5 (líneas 458-487) para `render.ts`:
- `bar(pct, width)` con `█`/`░` coloreado por umbral (`pc.green`/`pc.yellow`/`pc.red`).
- `renderResult(result: ScoreResult)` usando `cli-table3` — columna `"N (respondidas/presentadas)"` siempre junto al `%` (RES-01, pitfall 4 del proyecto).
- Prohibido colorear dentro de `core/scoring.ts` — el color es responsabilidad exclusiva de esta capa.

**Fuente:** RESEARCH.md Code Examples (líneas 590-606) para `src/index.ts` y `src/cli/commands/start.ts`:
- `commander` ESM, subcomando `start` que compone: cargar pack → `runSession` → `score` → `renderResult`.
- Pitfall 4: exige `"type": "module"` en `package.json` desde el primer commit (commander@15 es ESM-only).

### Capa `packs/` — contenido (fuera del código)

**Fuente:** RESEARCH.md Recommended Project Structure (líneas 187-214) + `PackSchema`/`QuestionSchema` de Pattern 1 como contrato de shape:
- `packs/ai-ml-readiness/pack.yaml`: `name`, `version`, `dimensions[]`.
- `packs/ai-ml-readiness/questions.yaml`: lista de preguntas, 2 dimensiones (LLM/RAG/evals, ML clásico), ~12-15 c/u, contenido real (no relleno).
- Open Question del research ya resuelta con recomendación: fichero único para 2 dimensiones (partir por dimensión a partir de Fase 2).

### Tests y fixtures

**Fuente:** RESEARCH.md Validation Architecture (líneas 648-688):
- `src/core/scoring.test.ts`, `src/core/session.test.ts`, `src/content/loader.test.ts`, `src/cli/render.test.ts`.
- `test/fixtures/mini-pack/` — pack YAML pequeño (2 dimensiones, ~6-8 preguntas c/u) para tests deterministas, separado del pack real.
- `test/fixtures/invalid-packs/` — al menos 2 fixtures inválidas: `correct` sin referencia válida, pregunta con <2 `options`.
- Invariantes obligatorias a testear (líneas 683-688): `answered <= presented`; `pct ∈ [0,1]` y `0` (no `NaN`) si `answered=0`; ninguna pregunta contribuye a `correct` sin contribuir a `answered`; `selectBalanced` con `minPerDimension` > pool no lanza; casos borde (0 respondidas, 1 dimensión, `correct` como array).
- Ejemplo de test determinista con seed en RESEARCH.md líneas 566-586 (`selectBalanced` con `makeSeededShuffle(42)` — mismo seed produce mismo resultado).

## Shared Patterns

### Separación de capas (regla transversal a todo el phase)
**Fuente:** CONTEXT.md decisión arquitectónica #1 + RESEARCH.md Architectural Responsibility Map (líneas 84-93).
**Aplica a:** todos los ficheros.
- `src/core/` — cero I/O, cero terminal, cero `Date.now()`/`Math.random()` directo.
- `src/content/` — única frontera de entrada de datos no confiables; falla rápido.
- `src/cli/` — solo presenta/captura; nunca deriva ni ajusta scores.

### Validación con zod + mensajes claros
**Fuente:** RESEARCH.md Pattern 1, Pitfall 2 (`superRefine` vs `refine`).
**Aplica a:** `src/content/schema.ts`, `src/content/loader.ts`.
Convención citada de `jobhunt/careerops` (no leíble desde este repo): mismo estilo general de "zod valida YAML de config al cargar, falla explícito" — se reutiliza el patrón por convención de proyecto hermano, no por código copiado literal.

### Aleatoriedad inyectable (nunca `Math.random()` en `core/`)
**Fuente:** RESEARCH.md Pattern 3 + Code Examples (mulberry32).
**Aplica a:** `src/core/session.ts`, cualquier test que necesite determinismo.

### N siempre visible junto al score (RES-01, pitfall 4/5 del proyecto)
**Fuente:** RESEARCH.md Pattern 2 (`ScoreResult`) y Pattern 5 (`renderResult`).
**Aplica a:** `src/core/scoring.ts`, `src/cli/render.ts`. Nunca un score agregado único.

## No Analog Found

Todos los ficheros de esta fase (tabla completa arriba) — el repo es greenfield, no existe `src/` previo. El planner debe usar los bloques de código de `01-RESEARCH.md` Patterns 1-5 y Code Examples como fuente de implementación directa en lugar de analogías in-repo.

## Metadata

**Analog search scope:** raíz del repo (`find . -maxdepth 3`), confirmado solo `.git/` y `.planning/` presentes.
**Files scanned:** 0 ficheros de código fuente (no existen).
**Pattern extraction date:** 2026-07-14
</content>
