---
phase: 01-fundamento-end-to-end
plan: 05
subsystem: cli
tags: [cli, inquirer, commander, cli-table3, walking-skeleton, end-to-end]

# Dependency graph
requires:
  - phase: 01-02
    provides: "src/content/loader.ts (loadPack: frontera de validación de contenido)"
  - phase: 01-03
    provides: "src/core/session.ts (selectBalanced + máquina de estados pura navegable), src/core/scoring.ts (score puro con N)"
  - phase: 01-04
    provides: "packs/ai-ml-readiness/ (pack real: 2 dimensiones, 30 preguntas)"
provides:
  - "src/cli/render.ts: renderResult() — tabla por dimensión con N junto al score, sin agregado (RES-01)"
  - "src/cli/runner.ts: runSession() — bucle select navegable que envuelve la máquina de estados pura, con '◀ Volver' y salida limpia en Ctrl+C (SESS-01)"
  - "src/cli/commands/start.ts: startCommand() — composición end-to-end (loadPack → selectBalanced → runSession → score → renderResult)"
  - "src/index.ts: entrypoint commander con subcomando start"
  - "Walking skeleton completo: `aptus start` corre una sesión real de punta a punta sobre el pack real"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La CLI solo presenta y captura: render.ts formatea el ScoreResult ya calculado (no deriva/ajusta scores); la seed se genera en la capa de IO (start.ts, vía Date.now) y se inyecta al núcleo determinista, nunca al revés"
    - "runner.ts NO reimplementa la máquina de estados: envuelve buildSession/answerCurrent/goForward/goBack/isComplete/toAnswered de src/core/session.ts con prompts de @inquirer/prompts"
    - "Navegación hacia atrás vía choice especial '◀ Volver' (visible solo si index>0) + default=value (id de la opción ya elegida), porque @inquirer no ofrece back nativo"
    - "Ruta del pack fija bajo packs/ (no entrada del usuario en P1): sin superficie de path traversal"

key-files:
  created:
    - src/cli/render.ts
    - src/cli/render.test.ts
    - src/cli/runner.ts
    - src/cli/commands/start.ts
    - src/cli/start.integration.test.ts
    - src/index.ts
  modified: []

key-decisions:
  - "SESSION_TARGET_QUESTIONS=20 y MIN_PER_DIMENSION=8 como constantes de dimensionado en start.ts (recomendación del research Open Question 2), ajustables sin tocar selectBalanced. Con el pack real (15/dimensión) resulta en 10+10=20 preguntas por sesión."
  - "render.ts sin colWidths fijos: se deja auto-dimensionar a cli-table3 para evitar cortes de tokens (N/porcentaje) que romperían las aserciones de substring, y por robustez visual."
  - "La interactividad viva del select (navegar, volver atrás y cambiar respuesta) se verifica por UAT sobre un PTY real; el test automatizado (start.integration.test.ts) cubre de forma determinista la integración motor+contenido+render sin @inquirer."

patterns-established:
  - "Capa CLI (src/cli/) como única frontera de IO/presentación: importa del núcleo puro y del loader, nunca al revés; el núcleo sigue sin conocer la terminal ni el dominio (ENG-04 intacto)"

requirements-completed: [SESS-01, SESS-02, RES-01]

coverage:
  - id: D1
    description: "`aptus start` carga el pack real, arranca una sesión select navegable y al terminar imprime un resultado por dimensión con el N junto a cada score (walking skeleton end-to-end)"
    requirement: "SESS-01, RES-01"
    verification:
      - kind: manual
        ref: "Sesión completa conducida sobre PTY: 20 preguntas del pack real navegadas, tabla final con ml-clasico 10/10 y llm-rag-evals 10/10 (N junto al %), sin fila agregada"
        status: pass
      - kind: unit
        ref: "src/cli/start.integration.test.ts > start end-to-end (smoke no interactivo) > carga pack → selecciona → puntúa → renderiza con N por dimensión, sin agregado"
        status: pass
    human_judgment: false
  - id: D2
    description: "La sesión es de opción múltiple (select) navegable: se puede volver atrás a una pregunta anterior y cambiar la respuesta antes de terminar"
    requirement: "SESS-01"
    verification:
      - kind: manual
        ref: "Choice '◀ Volver a la pregunta anterior' renderizada en preguntas con index>0 durante la sesión PTY; runner delega en goBack/answerCurrent (transiciones puras testeadas en 01-03)"
        status: pass
    human_judgment: true
    rationale: "La experiencia viva de volver atrás y cambiar la respuesta con el teclado es un juicio de UAT; el smoke automatizado no ejercita @inquirer."
  - id: D3
    description: "La selección reparte de forma equilibrada por dimensión con un mínimo por dimensión (SESS-02), usando selectBalanced del núcleo"
    requirement: "SESS-02"
    verification:
      - kind: unit
        ref: "src/cli/start.integration.test.ts > la selección equilibrada cubre ambas dimensiones del fixture"
        status: pass
      - kind: manual
        ref: "Sesión real: 10 preguntas por dimensión (20 totales) sobre el pack de 15/15"
        status: pass
    human_judgment: false
  - id: D4
    description: "El render muestra SIEMPRE answered/presented (el N) junto a cada porcentaje por dimensión (RES-01), y nunca un score único agregado"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "src/cli/render.test.ts (4 tests: N junto al score por dimensión; exactamente un % por dimensión; sin agregado/empleabilidad; answered=0 no rompe)"
        status: pass
      - kind: automated
        ref: "grep gate: 0 coincidencias de overall|employab|hire.?prob en render.ts/start.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ctrl+C durante la sesión sale limpio (captura ExitPromptError), sin corromper estado ni imprimir stack trace"
    requirement: "SESS-01"
    verification:
      - kind: manual
        ref: "EOF/cancelación sobre el runner imprime 'Sesión cancelada. No se ha guardado ningún resultado.' y sale con 0, sin stack trace"
        status: pass
    human_judgment: false
  - id: D6
    description: "Un pack inválido detiene el arranque con mensaje claro y código de salida != 0 (no se inicia sesión con datos rotos)"
    requirement: "CONT-03"
    verification:
      - kind: manual
        ref: "loadPack sobre fixture invalid-packs/correct-sin-referencia.yaml lanza; el guard de startCommand imprime '✗ No se puede iniciar la sesión: ...' y fija exit code 1"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-14
status: complete
---

# Phase 1 Plan 5: CLI end-to-end (walking skeleton) Summary

**La capa de terminal que cierra el slice vertical: `aptus start` carga el pack real, corre una sesión `select` equilibrada y navegable (con '◀ Volver'), puntúa con el motor puro y renderiza el resultado por dimensión con el N junto a cada score, sin ningún agregado. Motor, contenido y sesión funcionan juntos de punta a punta.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-14
- **Tasks:** 2
- **Files created:** 6

## Accomplishments
- `src/cli/render.ts` (+ `render.test.ts`): `renderResult()` con barra unicode coloreada por umbral (picocolors) y tabla `cli-table3` por dimensión; el N (respondidas/presentadas) acompaña siempre al %, sin fila agregada. 4 tests.
- `src/cli/runner.ts`: `runSession()` que envuelve la máquina de estados pura de `session.ts` con `@inquirer/prompts` select; choice '◀ Volver' cuando index>0, `default` para reposicionar el cursor, y captura de `ExitPromptError` para salida limpia en Ctrl+C.
- `src/cli/commands/start.ts`: `startCommand()` compone loadPack (pack real, ruta fija) → selectBalanced (20 preguntas, min 8/dim) → runSession → score → renderResult; guard fail-fast con exit code != 0 si el pack es inválido. Seed vía `Date.now()` inyectada al núcleo (nunca dentro del núcleo).
- `src/cli/start.integration.test.ts`: smoke no interactivo determinista (motor+contenido+render con N, sin agregado; cobertura de ambas dimensiones). 2 tests.
- `src/index.ts`: entrypoint commander con subcomando `start`.

## Verification
- `npx tsc --noEmit`: limpio.
- `npx vitest run`: 45/45 tests en verde (39 previos + 6 nuevos).
- `npx eslint .`: limpio.
- Grep gates: 0 coincidencias de agregado en render/start; 0 de Math.random/Date.now en el núcleo.
- UAT real sobre PTY: sesión completa de 20 preguntas del pack real navegada de punta a punta, con la tabla final por dimensión con N y sin agregado; salida limpia en cancelación; pack inválido → exit 1.

## Deviations from Plan
None — plan ejecutado tal como estaba escrito.

## Issues Encountered
- La sesión interactiva no puede conducirse por pipe (stdin no-TTY) porque `@inquirer/prompts` requiere un TTY; se verificó con un PTY (Python `pty`) para el UAT end-to-end.

## Next Phase Readiness
- Phase 1 (Fundamento end-to-end) completa: el walking skeleton está entero y verificado. Listo para Phase 2 (banco completo desde bootcamp-ml-llm), que solo añade contenido y rotación sobre esta misma tubería sin romperla.

---
*Phase: 01-fundamento-end-to-end*
*Completed: 2026-07-14*
