---
phase: 03-confianza-y-calibracion
plan: 01
subsystem: core+cli
tags: [confianza, calibracion, sess-03, res-04, reliability, motor-puro]

# Dependency graph
requires:
  - phase: 01-03
    provides: "src/core/session.ts (máquina de estados pura), src/core/scoring.ts (AnsweredQuestion)"
  - phase: 01-05
    provides: "runner select navegable, render por dimensión, startCommand end-to-end"
  - phase: 02-01
    provides: "banco de 5 dimensiones para una sesión sustancial"
provides:
  - "Tipo Confidence (baja/media/alta) y campo opcional en AnsweredQuestion"
  - "src/core/calibration.ts: motor puro que cruza confianza declarada con acierto real por nivel (RES-04)"
  - "Captura de confianza por pregunta en la sesión y el runner (SESS-03)"
  - "renderCalibration: tabla confianza-vs-acierto con lectura de sobre/infra-estimación"
affects: [05-persistencia-y-evolucion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Motor de calibración puro y determinista (src/core/calibration.ts), en la misma línea que scoring.ts: sin I/O, sin agregado global, solo desglose por nivel con su N"
    - "La confianza se añade como campo OPCIONAL en AnsweredQuestion, aditivo: scoring.score y los consumidores previos no se ven afectados"
    - "La CLI solo captura (2º select) y presenta (renderCalibration); el 'acierto declarado' representativo por nivel se muestra transparente, no se esconde"

key-files:
  created:
    - src/core/calibration.ts
    - src/core/calibration.test.ts
  modified:
    - src/core/scoring.ts
    - src/core/session.ts
    - src/cli/runner.ts
    - src/cli/render.ts
    - src/cli/commands/start.ts
    - src/core/session.test.ts
    - src/cli/render.test.ts
    - src/cli/start.integration.test.ts

key-decisions:
  - "Escala cualitativa de 3 niveles (baja/media/alta) según el criterio de la fase; cada nivel con un acierto declarado representativo transparente (40/65/90%) para contrastar con el real. La brecha revela sobre/infra-estimación (umbral 15 pts)."
  - "Confidence vive en scoring.ts (junto a AnsweredQuestion) para evitar dependencias circulares; calibration.ts la importa."
  - "Campo confidence opcional → cero rotura de tests/consumidores previos (solo hubo que ampliar una aserción estricta de toAnswered en session.test.ts)."
  - "Calibración por nivel de confianza (curva de fiabilidad), no por dimensión: satisface RES-04 con la lectura directa de dónde se sobreestima."

patterns-established:
  - "Segundo select de confianza tras la respuesta, con default a la confianza previa al revisitar (coherente con el default de la respuesta)"

requirements-completed: [SESS-03, RES-04]

coverage:
  - id: SC1
    description: "Para cada pregunta, Carlos indica su confianza (baja/media/alta) sin romper el flujo select navegable"
    requirement: "SESS-03"
    verification:
      - kind: unit
        ref: "calibration.test.ts > sesión: setConfidenceCurrent registra la confianza y toAnswered la propaga / confidence null sin declarar"
        status: pass
      - kind: manual
        ref: "Sesión PTY: tras cada respuesta aparece '¿Cómo de seguro estás?' (Alta/Media/Baja) y la sesión sigue navegable"
        status: pass
    human_judgment: false
  - id: SC2
    description: "El resultado incluye una tabla confianza-vs-acierto que muestra dónde Carlos se sobreestima respecto a su desempeño real"
    requirement: "RES-04"
    verification:
      - kind: unit
        ref: "calibration.test.ts (buckets, gap negativo=sobreestima, exclusiones, orden) + render.test.ts (niveles, N, 'te sobreestimas'/'te infravaloras', sin agregado)"
        status: pass
      - kind: manual
        ref: "Sesión PTY: tabla de calibración con Alta ~90% declarada vs 60% real (15/25) → '⚠ te sobreestimas'"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min
completed: 2026-07-14
status: complete
---

# Phase 3 Plan 1: Confianza y calibración Summary

**Carlos declara su confianza (baja/media/alta) en cada respuesta y, al terminar, ve una curva confianza-vs-acierto que le dice honestamente dónde se sobreestima — todo con un motor de calibración puro, sin ningún score agregado.**

## Accomplishments
- **Modelo de confianza**: tipo `Confidence` y campo opcional `confidence` en `AnsweredQuestion` (aditivo, sin romper nada).
- **Motor puro** `src/core/calibration.ts`: por nivel de confianza declarado, calcula el acierto real, la brecha frente al acierto declarado representativo (40/65/90%) y no produce agregado.
- **Sesión + runner**: mapa `confidences`, transición pura `setConfidenceCurrent`, `toAnswered` que la propaga, y un 2º `select` de confianza tras cada respuesta.
- **Render**: `renderCalibration` con lectura honesta (⚠ te sobreestimas / calibrado / te infravaloras) y mensaje claro si no hubo confianza.
- **start.ts** compone la calibración bajo la tabla por dimensión.

## Verification
- `npx tsc --noEmit`: limpio (exit 0).
- `npx vitest run`: **62/62 tests** (50 previos + 12 nuevos de calibración/plumbing/render/integración).
- Grep gates: 0 agregado en render/start; 0 Math.random/Date.now en el núcleo (incl. calibration.ts).
- UAT sobre PTY: sesión completa con confianza por pregunta → tabla por dimensión (5/5) + tabla de calibración con "⚠ te sobreestimas" (Alta ~90% declarada vs 60% real).

## Deviations from Plan
Ejecutado de forma directa e inline (sin subagentes) a petición de Carlos. Alcance sin cambios. Única regresión: una aserción estricta de `toAnswered` en session.test.ts, ampliada para incluir `confidence`.

## Next Phase Readiness
- Phase 4 (readiness por rol) usará los `roles[]` por pregunta y baselines externas (CONT-05, flag de research pendiente).
- Phase 5 (persistencia) podrá guardar y comparar la curva de calibración entre sesiones.

---
*Phase: 03-confianza-y-calibracion*
*Completed: 2026-07-14*
