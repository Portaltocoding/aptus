---
phase: 01-fundamento-end-to-end
plan: 02
subsystem: content
tags: [yaml, zod, loader, validation, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/content/schema.ts (PackSchema/QuestionSchema con superRefine), andamiaje ESM/vitest"
provides:
  - "loadPack(pathToPackYaml, pathToQuestionsYaml): única frontera de entrada de contenido no confiable, YAML.parse + PackSchema.safeParse fail-fast"
  - "Fixtures deterministas: mini-pack válido (2 dimensiones genéricas, 14 preguntas) + dos packs inválidos (correct sin referencia, <2 options)"
affects: [01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["loader como única frontera de validación de contenido (yaml.parse + zod.safeParse explícito, sin try/catch silencioso)", "fixtures de test con nombres de dimensión genéricos (dimension-alpha/beta) separadas del pack real de packs/"]

key-files:
  created:
    - src/content/loader.ts
    - src/content/loader.test.ts
    - test/fixtures/mini-pack/pack.yaml
    - test/fixtures/mini-pack/questions.yaml
    - test/fixtures/invalid-packs/correct-sin-referencia.yaml
    - test/fixtures/invalid-packs/menos-de-dos-opciones.yaml
  modified: []

key-decisions:
  - "Las fixtures inválidas son ficheros autocontenidos (pack + questions en un único YAML) para poder invocar loadPack(ruta, ruta) en el test sin duplicar ficheros — el plan solo listaba un fichero por fixture inválida"
  - "El caso 'metadata obligatoria ausente' (explanation faltante) se construye dinámicamente en el test con mkdtempSync/writeFileSync en vez de un fichero de fixture trackeado, para respetar exactamente el files_modified del plan (solo loader.ts/loader.test.ts en esa tarea)"

patterns-established:
  - "Pattern loader fail-fast: yaml.parse(readFileSync) + PackSchema.safeParse(merged); si !result.success, Error con fichero + path.join('.') + message por cada issue; nunca try/catch alrededor de safeParse"

requirements-completed: [CONT-01, CONT-02, CONT-03]

coverage:
  - id: D1
    description: "loadPack() carga un pack YAML válido desde ficheros y devuelve datos tipados (Question[] + metadata)"
    requirement: "CONT-01"
    verification:
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > carga un mini-pack válido y devuelve datos tipados con todas las preguntas y su metadata"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un pack cargado tiene toda la metadata obligatoria por pregunta (dimension, difficulty, stem, options>=2, correct, explanation)"
    requirement: "CONT-02"
    verification:
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > rechaza un pack al que le falta explanation en una pregunta (metadata obligatoria)"
        status: pass
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > conserva el subtopic cuando el pack lo declara"
        status: pass
    human_judgment: false
  - id: D3
    description: "El validador rechaza un pack cuyo correct no referencia ningún option.id existente, con mensaje que menciona el campo y la pregunta afectada"
    requirement: "CONT-03"
    verification:
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > rechaza un pack cuyo correct no referencia ningún option.id existente"
        status: pass
    human_judgment: false
  - id: D4
    description: "El validador rechaza un pack con una pregunta de menos de 2 options"
    requirement: "CONT-03"
    verification:
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > rechaza un pack con una pregunta con menos de 2 options"
        status: pass
    human_judgment: false
  - id: D5
    description: "El mensaje de error es legible (fichero + path + motivo), no un stack trace crudo"
    verification:
      - kind: unit
        ref: "src/content/loader.test.ts > loadPack > el mensaje de error es legible (menciona el fichero, no es un stack trace crudo)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-14
status: complete
---

# Phase 1 Plan 2: Loader de contenido (fail-fast) + fixtures deterministas Summary

**`loadPack()` como única frontera de entrada de contenido: `YAML.parse` + `PackSchema.safeParse` explícito (sin try/catch silencioso), con mensaje de error que agrega fichero + campo + motivo por cada issue, más fixtures deterministas (mini-pack válido de 14 preguntas y dos packs rotos) listas para el motor puro del plan 03.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-14T18:57:00Z
- **Completed:** 2026-07-14T19:15:00Z
- **Tasks:** 2
- **Files modified:** 6 (4 fixtures + loader.ts + loader.test.ts)

## Accomplishments
- `src/content/loader.ts`: `loadPack(pathToPackYaml, pathToQuestionsYaml)` lee ambos YAML, mezcla metadata + preguntas, valida con `PackSchema.safeParse` y lanza `Error` legible si falla — nunca continúa con datos parciales
- Fixture `test/fixtures/mini-pack/` (pack.yaml + questions.yaml): 14 preguntas deterministas repartidas en 2 dimensiones genéricas (`dimension-alpha`, `dimension-beta`), con subtopics en varias preguntas para el desglose del scoring del plan 03
- Dos fixtures inválidas (`correct-sin-referencia.yaml`, `menos-de-dos-opciones.yaml`) que ejercitan el `superRefine` de `QuestionSchema` (CONT-03) y el `options.min(2)`
- `loader.test.ts`: 6 tests cubriendo carga válida tipada, preservación de subtopic, rechazo de `correct` sin referencia, rechazo de `<2 options`, rechazo de `explanation` ausente y legibilidad del mensaje de error (menciona fichero + campo, no stack trace crudo)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fixtures de test (mini-pack válido + dos packs inválidos)** - `ea85ab7` (test)
2. **Task 2: loader.ts (carga + validación fail-fast) y su test exhaustivo** - `74ff3d5` (test, RED) → `6edfa88` (feat, GREEN)

**Plan metadata:** (este commit de SUMMARY, ver más abajo)

_Nota: la Task 2 llevó `tdd="true"` — dos commits (RED test / GREEN implementación), sin necesidad de refactor: la implementación pasó los 6 tests en el primer intento tras seguir el Pattern 1 del research al pie de la letra._

## Files Created/Modified
- `src/content/loader.ts` - `loadPack()`: única frontera de validación de contenido, fail-fast
- `src/content/loader.test.ts` - 6 tests: carga válida, subtopic, 3 rechazos, legibilidad del mensaje
- `test/fixtures/mini-pack/pack.yaml` - metadata del pack de fixture (name, version, dimensions)
- `test/fixtures/mini-pack/questions.yaml` - 14 preguntas deterministas, 2 dimensiones genéricas
- `test/fixtures/invalid-packs/correct-sin-referencia.yaml` - fixture inválida: `correct` no referencia ninguna `option.id`
- `test/fixtures/invalid-packs/menos-de-dos-opciones.yaml` - fixture inválida: pregunta con 1 sola `option`

## Decisions Made
- **Fixtures inválidas autocontenidas:** cada fichero en `test/fixtures/invalid-packs/` incluye tanto la metadata del pack (`name`, `version`, `dimensions`) como `questions`, para poder invocar `loadPack(ruta, ruta)` con el mismo path en ambos argumentos sin necesidad de un segundo fichero — el plan solo listaba un fichero por fixture inválida en `files_modified`.
- **Caso "metadata obligatoria ausente" sin fichero de fixture trackeado:** el test de `explanation` ausente genera el YAML dinámicamente con `mkdtempSync`/`writeFileSync` dentro del propio test, en vez de añadir un tercer fichero de fixture no listado en `files_modified` del plan. Mantiene el alcance exacto de ficheros del plan.
- **Nombres de dimensión/subtopic 100% genéricos** (`dimension-alpha`, `dimension-beta`, `subtopic-alpha-1`, etc.) en todas las fixtures — ningún nombre de dominio real (AI/ML/LLM) aparece fuera de `packs/`, reforzando ENG-04 también a nivel de tests.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. El Pattern 1 del research (`loadPack`) se copió casi literalmente; el único ajuste fue usar `questionsRaw?.questions ?? questionsRaw` (optional chaining) por robustez menor, sin cambio de comportamiento.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/content/loader.ts` y las fixtures de `test/fixtures/mini-pack/` + `test/fixtures/invalid-packs/` están listas para ser consumidas sin reconstrucción por el plan 03 (`src/core/session.ts`/`scoring.ts`, que usará el mini-pack para tests deterministas del motor puro con `selectBalanced`/`score`).
- Sin bloqueos. `npx tsc --noEmit` limpio y `npx vitest run` en verde para todo el proyecto (12/12 tests: 6 de `random.test.ts` + 6 de `loader.test.ts`).

---
*Phase: 01-fundamento-end-to-end*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created files and referenced commits verified present on disk / in git log.
