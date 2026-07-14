---
phase: 01-fundamento-end-to-end
plan: 03
subsystem: core
tags: [scoring, session, pure-functions, determinism, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/content/schema.ts (tipo Question), src/core/random.ts (makeSeededShuffle, ShuffleFn)"
provides:
  - "score(answered, presentedBank): función pura, desglose ScoreResult por dimensión y subtema, sin campo agregado"
  - "selectBalanced(bank, target, minPerDimension, shuffle): selección equilibrada determinista, sin lanzar en pool pequeño"
  - "SessionState navegable puro: buildSession/answerCurrent/goForward/goBack/isComplete/toAnswered"
affects: [01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Núcleo (src/core/**) 100% puro: sin I/O, sin Date.now/Math.random, aleatoriedad inyectada como ShuffleFn"
    - "ScoreResult desglosa SIEMPRE por dimensión (y subtema) con {presented, answered, correct, pct}, nunca un campo agregado global"
    - "SessionState inmutable: cada transición (answerCurrent/goForward/goBack) devuelve un nuevo estado, nunca muta el anterior"

key-files:
  created:
    - src/core/scoring.ts
    - src/core/scoring.test.ts
    - src/core/session.ts
    - src/core/session.test.ts
  modified: []

key-decisions:
  - "ScoreResult añade bySubtopic dentro de cada DimensionScore (no estaba en el Pattern 2 literal del research, que solo mostraba byDimension) para cumplir el must_have explícito del plan de 'desglose por subtema coherente con el desglose por dimensión'; solo se agrupan preguntas que declaran subtopic (campo opcional del schema)"
  - "SessionState.index puede llegar a questions.length (no se clampa a length-1): representa 'sesión completa' de forma pura, sin necesidad de un flag booleano adicional; isComplete() es solo azúcar sintáctico sobre esa invariante"
  - "answerCurrent con índice fuera de rango es un no-op puro (devuelve el mismo estado) en vez de lanzar, manteniendo la función total y coherente con el resto de transiciones que tampoco lanzan"

patterns-established:
  - "Grep gates de honestidad como verify automatizado: ausencia de vocabulario prohibido (overall/employability/hire-prob/total-score, Date.now/Math.random, vocabulario de dominio) verificada en cada task, incluyendo comentarios del propio código (no solo lógica) — obligó a redactar comentarios sin citar literalmente los términos prohibidos"

requirements-completed: [ENG-01, ENG-02, ENG-04, SESS-01, SESS-02]

coverage:
  - id: D1
    description: "score() es función pura: sin I/O, sin Date.now/Math.random, mismo input -> mismo output"
    requirement: "ENG-01"
    verification:
      - kind: unit
        ref: "src/core/scoring.test.ts (8 tests, todos deterministas sobre fixtures fijas)"
        status: pass
      - kind: static
        ref: "grep -riE 'Date\\.now|Math\\.random' src/core/scoring.ts -> 0 matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "score() calcula correctamente por dimensión y subtema, incluyendo preguntas no respondidas (answered < presented)"
    requirement: "ENG-02"
    verification:
      - kind: unit
        ref: "src/core/scoring.test.ts > score > dimensión con preguntas no respondidas -> answered < presented y pct se calcula sobre answered"
        status: pass
      - kind: unit
        ref: "src/core/scoring.test.ts > score > el desglose por subtema es coherente con el desglose por dimensión"
        status: pass
    human_judgment: false
  - id: D3
    description: "El núcleo (scoring.ts, session.ts) no contiene ningún string literal de vocabulario de dominio del pack"
    requirement: "ENG-04"
    verification:
      - kind: static
        ref: "grep -riE 'embeddings|hallucination|overfitting|regularization|bias-variance|cross-validation' src/core -> 0 matches"
        status: pass
    human_judgment: false
  - id: D4
    description: "La navegación de sesión (avanzar, volver atrás, registrar/cambiar respuesta) es lógica pura testeable sin terminal"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/core/session.test.ts > navegación de sesión (7 tests: build, answerCurrent, goForward/goBack, volver desde 0, cambiar respuesta, completar, toAnswered)"
        status: pass
    human_judgment: false
  - id: D5
    description: "selectBalanced respeta el mínimo por dimensión, es determinista con la misma seed, y no lanza si el pool es menor que el mínimo"
    requirement: "SESS-02"
    verification:
      - kind: unit
        ref: "src/core/session.test.ts > selectBalanced (6 tests: determinismo, seeds distintas, mínimo respetado, pool pequeño sin excepción, límite superior del pool, una sola dimensión)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-14
status: complete
---

# Phase 1 Plan 3: Motor de scoring puro + motor de sesión puro Summary

**`score()` y `selectBalanced()` como funciones puras deterministas: scoring siempre desglosado por dimensión/subtema con N visible y sin agregado, selección equilibrada con shuffle inyectable que nunca lanza en pool pequeño, y estado de sesión navegable inmutable listo para que el runner del plan 05 lo envuelva sin lógica adicional.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-14T18:55:00Z
- **Completed:** 2026-07-14T19:17:00Z
- **Tasks:** 2
- **Files modified:** 4 (scoring.ts, scoring.test.ts, session.ts, session.test.ts)

## Accomplishments

- `src/core/scoring.ts`: `score(answered, presentedBank)` puro, sin I/O ni `src/cli/`, agrupa por dimensión y subtema, `pct = correct/answered` (0 sin NaN cuando `answered === 0`), corrección binaria (sin crédito parcial), soporta `correct` como array (multi-respuesta futura); `ScoreResult` expone únicamente `byDimension`, sin ningún campo agregado global.
- `src/core/scoring.test.ts`: 8 tests cubriendo todas las invariantes del research (pct nunca NaN, answered ≤ presented implícito por construcción, binario, subtema coherente con dimensión, multi-dimensión independiente, ausencia de campo agregado verificada por `Object.keys`).
- `src/core/session.ts`: `selectBalanced(bank, target, minPerDimension, shuffle)` (Pattern 3 del research, reparto `Math.max(minPerDimension, floor(target/nDimensiones))`, `take = Math.min(perDim, pool.length)`) + `SessionState` navegable inmutable (`buildSession`, `answerCurrent`, `goForward`, `goBack`, `isComplete`, `toAnswered`), todo sin `Math.random()` ni mutación del estado anterior.
- `src/core/session.test.ts`: 13 tests — determinismo con `makeSeededShuffle(42)`, seeds distintas divergen, mínimo por dimensión respetado, pool pequeño sin lanzar, límite superior del pool, una sola dimensión, y las 7 transiciones de navegación (incluyendo volver desde índice 0 y cambiar una respuesta ya dada).
- Los 6 gates de honestidad del plan (grep de ausencia de agregado, `Date.now`/`Math.random`, vocabulario de dominio) pasan de forma automatizada — ver confirmación explícita más abajo.

## Task Commits

Each task was committed atomically:

1. **Task 1: Motor de scoring puro (score)** - `71c63a1` (test, RED) → `fee4a4c` (feat, GREEN)
2. **Task 2: Motor de sesión puro (selectBalanced + navegación)** - `f3fdd39` (test, RED) → `2b9437f` (feat, GREEN)

_Ambas tareas llevaban `tdd="true"`. Ninguna necesitó commit de refactor: la implementación pasó todos los tests en el primer intento tras seguir los Patterns 2 y 3 del research, con el único ajuste de wording de comentarios descrito en Deviations._

## Files Created/Modified

- `src/core/scoring.ts` - `score()` puro + tipos `AnsweredQuestion`, `DimensionScore`, `SubtopicScore`, `ScoreResult`
- `src/core/scoring.test.ts` - 8 tests de invariantes de scoring
- `src/core/session.ts` - `selectBalanced()` + `SessionState` navegable puro (`buildSession`/`answerCurrent`/`goForward`/`goBack`/`isComplete`/`toAnswered`)
- `src/core/session.test.ts` - 13 tests de selección equilibrada + navegación

## Decisions Made

- **`bySubtopic` dentro de `DimensionScore`:** el Pattern 2 literal del research solo mostraba `byDimension` sin subtema; el `must_have` explícito del plan ("Desglose por subtema dentro de la dimensión coherente con el desglose por dimensión") exigía el nivel adicional. Se implementó como array `bySubtopic: SubtopicScore[]` anidado, solo agrupando preguntas que declaran `subtopic` (campo opcional del schema) — coherencia verificada en test sumando `presented/answered/correct` de los subtemas y comparándolos con el total de la dimensión.
- **`SessionState.index` puede llegar a `questions.length`:** en vez de un flag `completed` separado, `index === questions.length` es la representación pura de "sesión terminada"; `isComplete()` es un helper derivado, no estado adicional que pudiera desincronizarse.
- **`answerCurrent` con índice fuera de rango es no-op puro:** devuelve el mismo estado sin lanzar, manteniendo todas las transiciones de `session.ts` como funciones totales (nunca lanzan), simétrico con el diseño de `selectBalanced` (nunca lanza, toma el máximo disponible).
- **Redacción de comentarios ajustada por los grep gates:** los gates de honestidad (`<verify>`) hacen `grep` sobre el fichero entero, incluidos comentarios. La primera redacción de los docblocks mencionaba literalmente "Date.now()", "Math.random()" y "overall"/"total"/"employability" para explicar qué está prohibido, lo cual disparaba el propio gate (falso positivo léxico, no una violación real de pureza). Se reescribieron los comentarios para explicar la prohibición sin citar los términos exactos (p. ej. "sin reloj de sistema, sin generador aleatorio" en vez de nombrar las funciones). Ningún cambio de comportamiento; documentado aquí como desviación menor de estilo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comentarios que citaban literalmente el vocabulario prohibido por los grep gates**
- **Found during:** Task 1, al correr `<verify>` por primera vez tras implementar `scoring.ts`.
- **Issue:** El docblock de `scoring.ts` mencionaba "Date.now()"/"Math.random()" y "overall"/"total"/"employability" en prosa explicativa, lo que hacía que `grep -riE 'Date\.now|Math\.random'` y `grep -riE 'overall|employab|hire.?prob|total.?score'` devolvieran 1 coincidencia cada uno (el propio comentario), bloqueando el gate `-eq 0` aunque el código no violaba ninguna invariante real.
- **Fix:** Reescritura de los comentarios para transmitir la misma prohibición sin citar literalmente los términos vigilados por el grep (p. ej. "sin reloj de sistema, sin generador aleatorio"; "sin ningún campo único a nivel de sesión que resuma el desempeño global").
- **Files modified:** `src/core/scoring.ts`
- **Commit:** incluido en `fee4a4c` (no generó commit separado; se corrigió antes del commit GREEN).

No hubo desviaciones de diseño ni de alcance: ambas tareas siguen los Patterns 2 y 3 del research casi literalmente, con la única adición documentada arriba (`bySubtopic`) exigida por los `must_haves` del propio plan.

## Issues Encountered

None (aparte del ajuste de comentarios descrito arriba, resuelto en el mismo ciclo GREEN).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/core/scoring.ts` y `src/core/session.ts` están listos para que el runner interactivo (plan 05, `src/cli/runner.ts`) los envuelva sin añadir lógica de negocio: la navegación, la selección y el scoring ya están resueltos y testeados como funciones puras.
- `src/cli/render.ts` (plan 04/05, RES-01) puede consumir `ScoreResult.byDimension[].{answered,presented,pct}` directamente para renderizar `N (answered/presented)` junto a cada barra, sin transformación adicional.
- Sin bloqueos. `npx tsc --noEmit` limpio y `npx vitest run` en verde para todo el proyecto (33/33 tests: 6 de `random.test.ts` + 6 de `loader.test.ts` + 8 de `scoring.test.ts` + 13 de `session.test.ts`).

---
*Phase: 01-fundamento-end-to-end*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created files (scoring.ts, scoring.test.ts, session.ts, session.test.ts, este SUMMARY) y los 4 commits de tarea referenciados (71c63a1, fee4a4c, f3fdd39, 2b9437f) verificados presentes en disco / git log.
