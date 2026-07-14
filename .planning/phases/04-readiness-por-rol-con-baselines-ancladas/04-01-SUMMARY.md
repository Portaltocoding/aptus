---
phase: 04-readiness-por-rol-con-baselines-ancladas
plan: 01
subsystem: core+content+cli
tags: [readiness, roles, baselines, eng-03, cont-05, res-02, res-03, gaps, plan-estudio]

# Dependency graph
requires:
  - phase: 01-03
    provides: "AnsweredQuestion + selectBalanced"
  - phase: 02-01
    provides: "banco de 5 dimensiones con dificultad etiquetada por pregunta"
  - phase: 01-05
    provides: "startCommand end-to-end donde componer el readiness"
provides:
  - "packs/ai-ml-readiness/readiness.yaml: niveles (umbral por dificultad) + perfiles de rol (core/secondary + source) + plan de estudio, anclados a fuentes externas"
  - "src/content/readiness.ts: loadReadiness (zod fail-fast)"
  - "src/core/readiness.ts: computeReadiness (por rol/nivel) + computeGaps (priorizados con estudio), puro"
  - "renderReadiness + renderGaps"
affects: [05-persistencia-y-evolucion, 06-integracion-jobhunt]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Segundo dataset del pack (readiness.yaml) con su propio loader+schema zod, en paralelo al de questions: baselines y perfiles como datos fuera del código (CONT-01/CONT-05)"
    - "Readiness anclado a la dificultad etiquetada (ENG-03): umbral por tramo easy/medium/hard que sube con el nivel; un nivel exige EVIDENCIA en su tramo (no sobre-afirma sin preguntas difíciles)"
    - "Sin score agregado (RES-02): una fila por rol con evidencia por dificultad y N; gaps priorizados con plan (RES-03), débil primero"

key-files:
  created:
    - packs/ai-ml-readiness/readiness.yaml
    - src/content/readiness.ts
    - src/core/readiness.ts
    - src/core/readiness.test.ts
    - src/content/readiness.test.ts
  modified:
    - src/cli/render.ts
    - src/cli/commands/start.ts
    - src/cli/render.test.ts
    - src/cli/start.integration.test.ts

key-decisions:
  - "Flag de research CONT-05 resuelto con búsqueda real (ver 04-RESEARCH.md): niveles anclados a marcos de leveling (alcance/autonomía/profundidad → dificultad); perfiles de rol anclados a descripciones de puesto 2026 (DataCamp/Scaler, KDnuggets, doit.software, min.io, zenvanriel), cada rol con su `source`."
  - "Regla anti-sobreafirmación: un nivel solo se concede si los tramos con exigencia (>0) tienen evidencia (N>0) y superan el umbral; sin preguntas difíciles no hay senior-ready."
  - "Cortes numéricos por tramo como bandas convencionales transparentes en readiness.yaml (editables); la ESTRUCTURA (barra creciente por dificultad) es lo anclado, no un número mágico."
  - "En este MVP el readiness usa los perfiles de rol de la config, no los roles[] por pregunta (reservados para afinado futuro)."

patterns-established:
  - "Config de readiness como contrato de datos: levels[].requires{easy,medium,hard}, roles[]{core,secondary,source}, study{dimension->recurso}"

requirements-completed: [ENG-03, CONT-05, RES-02, RES-03]

coverage:
  - id: SC1
    description: "El resultado da readiness por rol (junior/mid/senior) contra baselines ancladas a la dificultad y a fuentes externas, sin score único agregado"
    requirement: "ENG-03, CONT-05, RES-02"
    verification:
      - kind: unit
        ref: "readiness.test.ts (senior con evidencia en 3 tramos; junior si medium<umbral; pre-junior; solo dims núcleo) + readiness(content).test.ts (config real: niveles ordenados, roles con source, plan por dim)"
        status: pass
      - kind: manual
        ref: "Sesión PTY: tabla 'Readiness por rol' con 5 roles, evidencia por dificultad y N, sin fila agregada"
        status: pass
    human_judgment: false
  - id: SC2
    description: "No se sobre-afirma: sin evidencia en el tramo exigido, el nivel no se concede"
    requirement: "ENG-03"
    verification:
      - kind: unit
        ref: "readiness.test.ts > no concede mid/senior sin evidencia en el tramo que exigen"
        status: pass
    human_judgment: false
  - id: SC3
    description: "El resultado lista gaps priorizados con un plan de estudio concreto por gap"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "readiness.test.ts (gaps < umbral, ordenados débil primero, con study) + render.test.ts (renderGaps: 'te falta X' + plan)"
        status: pass
      - kind: manual
        ref: "Sesión PTY: 'Gaps priorizados y plan de estudio' con llm-rag-evals/ml-clasico y su recurso del bootcamp"
        status: pass
    human_judgment: false
  - id: SC4
    description: "El anclaje a fuentes externas es real y auditable"
    requirement: "CONT-05"
    verification:
      - kind: unit
        ref: "readiness(content).test.ts > cada rol tiene source no vacío"
        status: pass
      - kind: manual
        ref: "04-RESEARCH.md documenta las 9 fuentes; readiness.yaml cita la fuente por rol"
        status: pass
    human_judgment: true
    rationale: "Que las fuentes elegidas sean las adecuadas y su interpretación fiel es juicio humano; el test solo comprueba que cada rol declara una fuente."

# Metrics
duration: ~45min
completed: 2026-07-14
status: complete
---

# Phase 4 Plan 1: Readiness por rol con baselines ancladas Summary

**Al terminar la sesión, Carlos ve su readiness por rol (AI/LLM/ML Engineer, Full Stack, AI Product) contra baselines ancladas a fuentes externas y a la dificultad de las preguntas, sin ningún score único de 'empleabilidad', más una lista de gaps priorizados con plan de estudio concreto por gap.**

## Accomplishments
- **Flag CONT-05 resuelto** con research real (04-RESEARCH.md, 9 fuentes): niveles anclados a marcos de leveling; perfiles de rol a descripciones de puesto 2026.
- **readiness.yaml**: niveles con umbral por tramo de dificultad, 5 perfiles de rol (core/secondary + source citada) y plan de estudio por dimensión.
- **Motor puro** `src/core/readiness.ts`: `computeReadiness` (nivel por rol anclado a dificultad, exige evidencia para no sobre-afirmar) + `computeGaps` (débil primero, con recurso).
- **Loader** `src/content/readiness.ts` con zod fail-fast.
- **Render**: `renderReadiness` (tabla por rol con evidencia por dificultad y N) + `renderGaps` ("te falta X → haz Z"); `start.ts` los compone.

## Verification
- `npx tsc --noEmit`: limpio (exit 0).
- `npx vitest run`: **79/79 tests** (62 previos + 17 nuevos).
- Grep gates: 0 agregado en render/start; 0 Math.random/Date.now en el núcleo (incl. readiness.ts). eslint limpio.
- UAT sobre PTY: sesión completa → 4 bloques (dimensión, calibración, readiness por rol, gaps con plan). Regla anti-sobreafirmación visible (Full Stack con easy 50% no se declara junior pese a bordar media/difícil; N a la vista).

## Deviations from Plan
Ejecutado inline (sin subagentes) a petición de Carlos. Se hizo research web real (2-3 búsquedas) para anclar, acotado para no enredarse.

## Next Phase Readiness
- Phase 5 (persistencia) podrá guardar readiness + calibración y mostrar evolución entre sesiones.
- Phase 6 (jobhunt) podrá ponderar los gaps por demanda real de mercado.
- Pendiente opcional: afinar perfiles con los roles[] por pregunta.

---
*Phase: 04-readiness-por-rol-con-baselines-ancladas*
*Completed: 2026-07-14*
