---
phase: 05-persistencia-y-evolucion
plan: 01
subsystem: core+content+cli
tags: [persistencia, evolucion, pers-01, pers-02, json-store, historial]

# Dependency graph
requires:
  - phase: 01-05
    provides: "startCommand end-to-end"
  - phase: 04-01
    provides: "readiness por rol (para persistir el nivel por rol)"
provides:
  - "src/core/evolution.ts: SessionRecord + buildSessionRecord + evolution (puro)"
  - "src/content/history.ts: store JSON local con zod (loadHistory/saveHistory)"
  - "start.ts guarda cada sesión (PERS-01) y muestra la evolución vs la anterior (PERS-02)"
  - "subcomando `aptus history` para consultar el historial y la evolución"
affects: [06-integracion-jobhunt]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Persistencia como store JSON local detrás de una interfaz mínima (loadHistory/saveHistory); el modelo y la evolución son puros en core/evolution y el timestamp se inyecta desde la capa de I/O (el núcleo no lee el reloj)"
    - "Carga fail-fast del historial ANTES de la sesión: un fichero corrupto no deja que hagas el test para luego reventar al guardar; inexistente arranca vacío"

key-files:
  created:
    - src/core/evolution.ts
    - src/content/history.ts
    - src/cli/commands/history.ts
    - src/core/evolution.test.ts
    - src/content/history.test.ts
  modified:
    - src/cli/render.ts
    - src/cli/commands/start.ts
    - src/index.ts
    - .gitignore

key-decisions:
  - "Desviación consciente del `node:sqlite` del research del stack: store JSON local. Motivo: historial personal de baja escala (append + leer todo), más simple y testeable, y sin ExperimentalWarning de node:sqlite en Node 26. Detrás de una interfaz mínima → migrar a sqlite luego sería local."
  - "La evolución compara SIEMPRE las dos últimas sesiones (tendencia inmediata); el histórico completo se conserva en disco."
  - "Se persiste acierto por dimensión (pct/N) y readiness por rol (nivel); la calibración detallada no se guarda en este MVP."
  - "data/ en .gitignore: el historial es dato personal, no se versiona."

patterns-established:
  - "SessionRecord como contrato de persistencia: timestamp + byDimension[] + readiness[], validado por zod al cargar"

requirements-completed: [PERS-01, PERS-02]

coverage:
  - id: SC1
    description: "Cada sesión completada se guarda localmente sin intervención manual"
    requirement: "PERS-01"
    verification:
      - kind: unit
        ref: "history.test.ts (round-trip, crea dir, inexistente→[], corrupto→Error, schema inválido→Error)"
        status: pass
      - kind: manual
        ref: "Sesión PTY: tras terminar aparece data/history.json con 1 sesión guardada"
        status: pass
    human_judgment: false
  - id: SC2
    description: "Carlos ve la evolución de scores por dimensión y readiness por rol entre sesiones sucesivas, al terminar y vía subcomando de consulta"
    requirement: "PERS-02"
    verification:
      - kind: unit
        ref: "evolution.test.ts (0/1/2+ sesiones, delta por dimensión, cambio de nivel por rol, solo-últimas-dos) + render.test.ts (renderEvolution: mensajes 0/1 sesión, tabla con Δ y cambios por rol)"
        status: pass
      - kind: manual
        ref: "2ª sesión PTY: tabla Ahora/Antes/Δ + 'Full Stack Engineer: Senior-ready → Aún no junior-ready'; `aptus history` muestra la misma evolución sin correr sesión"
        status: pass
    human_judgment: false

# Metrics
duration: ~40min
completed: 2026-07-14
status: complete
---

# Phase 5 Plan 1: Persistencia y evolución Summary

**Cada sesión se guarda sola en un store JSON local y, al terminar (o con `aptus history`), Carlos ve cómo evoluciona su acierto por dimensión y su readiness por rol respecto a la sesión anterior — con el motor de evolución puro y el reloj en la capa de I/O.**

## Accomplishments
- **Motor puro** `src/core/evolution.ts`: `SessionRecord`, `buildSessionRecord` (arma el registro desde score+readiness) y `evolution` (última vs anterior: delta por dimensión + cambios de nivel por rol).
- **Store** `src/content/history.ts`: JSON local validado por zod; inexistente→[], corrupto→Error claro.
- **start.ts**: carga el historial fail-fast antes de la sesión; al terminar guarda la sesión (PERS-01) y muestra la evolución (PERS-02).
- **Subcomando `history`** (`src/cli/commands/history.ts` + index.ts): consulta el historial y la evolución sin correr sesión.
- **renderEvolution** + `.gitignore data/`.

## Verification
- `npx tsc --noEmit`: limpio (exit 0).
- `npx vitest run`: **93/93 tests** (80 previos + 13 nuevos).
- Grep gates: 0 agregado en render/start; 0 reloj (Math.random/Date.now/new Date) en el núcleo. eslint limpio. data/ correctamente ignorado.
- UAT sobre PTY: 1ª sesión → guardada + "primera sesión guardada"; 2ª → tabla de evolución con deltas y cambio de nivel por rol; `aptus history` → historial + evolución. Datos de prueba (auto-respondidos) borrados para que el historial de Carlos empiece limpio.

## Deviations from Plan
Store JSON en lugar del `node:sqlite` del research (ver Decisions). Ejecutado inline a petición de Carlos.

## Next Phase Readiness
- Phase 6 (jobhunt, opcional): ponderar la prioridad de los gaps por demanda real de mercado; degradación elegante si jobhunt no está.
- El histórico persistido queda disponible para futuras vistas (gráficas, calibración a lo largo del tiempo).

---
*Phase: 05-persistencia-y-evolucion*
*Completed: 2026-07-14*
