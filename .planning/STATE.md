---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: Confianza y calibración
status: ready
stopped_at: Completado Phase 2 — banco completo 5 dimensiones (02-01)
last_updated: "2026-07-14T21:05:00.000Z"
last_activity: 2026-07-14
last_activity_desc: Completado 02-01 (banco completo 5 dimensiones) y cerrada Phase 2; 50/50 tests en verde
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** Decirle a Carlos con honestidad, a nivel de conocimiento, cómo de preparado está para cada rol (AI Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer), con gaps accionables — nunca una "probabilidad de contratación" inventada.
**Current focus:** Phase 1 — Fundamento end-to-end

## Current Position

Phase: 3 of 6 (Confianza y calibración) — no iniciada
Plan: Phases 1 y 2 completas
Status: Phase 2 verificada end-to-end (banco de 5 dimensiones, 66 preguntas); Phase 3 lista cuando Carlos decida
Last activity: 2026-07-14 — Completado 02-01 (banco completo), cerrada Phase 2; 50/50 tests

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 22min | 2 tasks | 9 files |
| Phase 01 P02 | 18min | 2 tasks | 6 files |
| Phase 01-fundamento-end-to-end P03 | 22min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Fase 1 es un slice vertical MVP end-to-end (banco mínimo real, no fixture aislada de motor) — no una capa técnica aislada.
- [Roadmap]: El banco completo desde `bootcamp-ml-llm` se separa en Fase 2, después del slice mínimo funcional, para no bloquear la validación del núcleo con el trabajo de curación de contenido.
- [Roadmap]: Readiness por rol (ENG-03/RES-02) se pospone a Fase 4, después de tener el banco completo (Fase 2) y baselines ancladas a fuentes externas (CONT-05), para evitar mapeos arbitrarios score→nivel.
- [Roadmap]: Integración con jobhunt (INTEG-01) queda como Fase 6, opcional y aditiva — el sistema es completo y útil sin ella.
- [Phase ?]: typescript fijado a ^6.0.3 (red de seguridad prevista): typescript-eslint@8 no soporta el peer range de TS7, ERESOLVE resuelto sin bloquear el andamiaje
- [Phase ?]: dimension en QuestionSchema es z.string() (cadena libre), unico z.enum permitido es difficulty, cumple ENG-04
- [Phase ?]: Fixtures inválidas autocontenidas (pack+questions en un único YAML) para poder invocar loadPack(ruta,ruta) en tests
- [Phase ?]: Núcleo puro con desglose por dimensión y subtema, sin agregado global (score/selectBalanced deterministas)

### Pending Todos

None yet.

### Blockers/Concerns

- Quality gate transversal (todas las fases de resultado): nunca mostrar un score único agregado tipo "empleabilidad"; siempre mostrar N junto a cada score; nada de IRT/CAT en el mapeo score→rol.
- ~~Fase 2 requiere inspección real de `bootcampLLMs.md` / `BACKUP.md` / `module_maps.json`~~ RESUELTO (Phase 2): inspeccionado `module_maps.json`; el bootcamp cubre 4/5 dimensiones (fullstack es externo). Procedencia por pregunta anclada en consecuencia.
- Fase 4 requiere investigación de umbrales junior/mid/senior por rol anclados a fuentes externas — research flag pendiente de resolver en discuss/plan de esa fase.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | PACK-02 (packs adicionales de otros dominios) | Deferred | Roadmap v1 |
| v2 | RES-05 (resurfacing spaced-repetition) | Deferred | Roadmap v1 |

## Session Continuity

Last session: 2026-07-14T21:05:00.000Z
Stopped at: Completado Phase 2 — banco completo 5 dimensiones (02-01). Detenido tras la fase, a la espera de que Carlos decida seguir.
Resume file: None
