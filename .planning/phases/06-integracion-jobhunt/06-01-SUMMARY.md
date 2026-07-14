---
phase: 06-integracion-jobhunt
plan: 01
subsystem: core+content+cli
tags: [jobhunt, mercado, demanda, integ-01, degradacion-elegante, node-sqlite, opcional]

# Dependency graph
requires:
  - phase: 04-01
    provides: "computeGaps → Gap[] (los que se reponderan)"
  - phase: 01-05
    provides: "startCommand donde se compone"
provides:
  - "src/content/jobhunt.ts: adaptador solo-lectura a jobs.db (node:sqlite), null si no disponible"
  - "src/core/market.ts: computeDemand + applyMarketWeight (puro)"
  - "renderWeightedGaps + market_keywords en readiness.yaml"
  - "start.ts pondera los gaps por demanda de mercado si jobhunt está, o degrada con gracia"
affects: []

# Tech tracking
tech-stack:
  added:
    - "node:sqlite (integrado en Node 26, solo lectura; sin ExperimentalWarning en 26.4)"
  patterns:
    - "Integración externa como capa opcional y aditiva: I/O aislada en un adaptador que devuelve null ante cualquier fallo (degradación elegante), motor de mercado puro, y el resto del sistema intacto"
    - "La ponderación reordena señales existentes (debilidad × demanda) sin crear un score agregado nuevo; ambas señales se muestran por separado"

key-files:
  created:
    - src/content/jobhunt.ts
    - src/core/market.ts
    - src/core/market.test.ts
    - src/content/jobhunt.test.ts
  modified:
    - packs/ai-ml-readiness/readiness.yaml
    - src/content/readiness.ts
    - src/cli/render.ts
    - src/cli/commands/start.ts
    - src/cli/render.test.ts
    - src/content/readiness.test.ts

key-decisions:
  - "Lectura con node:sqlite en solo lectura (verificado sin warning en Node 26.4); el adaptador solo obtiene title+description."
  - "Degradación elegante: loadJobTexts devuelve null ante fichero ausente/corrupto/ilegible; start.ts cae a los gaps sin ponderar, exactamente como Phase 5."
  - "priority = debilidad × (1 + demandShare): la debilidad manda, la demanda amplifica sin anular; priority es clave de orden interna, no se muestra como score (criterio 3)."
  - "market_keywords (ES+EN) como dato del pack en readiness.yaml (campo opcional); el motor no conoce los strings del dominio."

patterns-established:
  - "Adaptador de integración externa: existsSync + try/catch → null; el resto del sistema no sabe si jobhunt está o no"

requirements-completed: [INTEG-01]

coverage:
  - id: SC1
    description: "Con jobs.db presente, los gaps reflejan qué dimensiones pide más el mercado real de jobhunt"
    requirement: "INTEG-01"
    verification:
      - kind: unit
        ref: "market.test.ts (computeDemand cuenta por dimensión; applyMarketWeight reordena por debilidad×demanda) + jobhunt.test.ts (lee title+description de una db válida)"
        status: pass
      - kind: manual
        ref: "Sesión PTY con las 403 ofertas reales: llm-rag-evals (275/403) priorizado sobre ml-clasico (133/403) a igual debilidad"
        status: pass
    human_judgment: false
  - id: SC2
    description: "Sin jobs.db (o inaccesible), Aptus degrada con gracia: funciona igual, sin error ni bloqueo, sin ponderación"
    requirement: "INTEG-01"
    verification:
      - kind: unit
        ref: "jobhunt.test.ts (fichero ausente → null; fichero no-sqlite → null) → start.ts cae a renderGaps plano"
        status: pass
    human_judgment: false
  - id: SC3
    description: "El cruce nunca genera un score nuevo de encaje/empleabilidad; solo reordena/pondera los gaps ya calculados"
    requirement: "INTEG-01"
    verification:
      - kind: unit
        ref: "render.test.ts > renderWeightedGaps no muestra encaje/empleab/índice; muestra las dos señales por separado"
        status: pass
    human_judgment: false

# Metrics
duration: ~40min
completed: 2026-07-14
status: complete
---

# Phase 6 Plan 1: Integración con jobhunt Summary

**Cuando jobhunt tiene ofertas escaneadas, Aptus repondera la prioridad de los gaps de Carlos por la demanda real de mercado (p. ej. LLM/RAG aparece en 275 de 403 ofertas), leyendo la base de datos en solo lectura; si jobhunt no está, funciona exactamente igual. Nunca inventa un score de encaje: solo reordena los gaps, con la debilidad y la demanda a la vista.**

## Accomplishments
- **Adaptador solo-lectura** `src/content/jobhunt.ts`: lee title+description de `jobs.db` con node:sqlite readOnly; `null` ante fichero ausente/corrupto/ilegible (degradación elegante).
- **Motor de mercado puro** `src/core/market.ts`: `computeDemand` (ofertas por dimensión vía keywords) + `applyMarketWeight` (debilidad × demanda, reordena).
- **market_keywords** (ES+EN) en `readiness.yaml` (opcional) + schema.
- **renderWeightedGaps** con la señal de mercado transparente ("en N/T ofertas").
- **start.ts**: pondera si jobhunt está, o cae a los gaps sin ponderar.

## Verification
- `npx tsc --noEmit`: limpio (exit 0).
- `npx vitest run`: **105/105 tests** (93 previos + 12 nuevos).
- Grep gates: 0 agregado en render/start; 0 reloj en el núcleo (incl. market.ts). eslint limpio.
- UAT sobre PTY (con las 403 ofertas reales): gaps ponderados; llm-rag-evals (275/403) por delante de ml-clasico (133/403). Degradación elegante cubierta por los tests del adaptador. Datos de prueba borrados.

## Deviations from Plan
Ejecutado inline a petición de Carlos. `node:sqlite` (del stack del research) sí se usa aquí para LEER jobhunt, aunque el historial propio de Aptus quedó en JSON (Phase 5).

## Next Phase Readiness
- Milestone v1 funcionalmente completo (INTEG-01 era la última pieza y es opcional/aditiva).
- Posibles siguientes (no v1): matizar demanda por salario/seniority, cruce por rol concreto, gráficas de evolución.

---
*Phase: 06-integracion-jobhunt*
*Completed: 2026-07-14*
