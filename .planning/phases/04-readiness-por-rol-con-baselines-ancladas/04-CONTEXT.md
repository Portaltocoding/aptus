# Phase 4: Readiness por rol con baselines ancladas - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning (ejecutada de forma directa e inline; flag de research resuelto, ver 04-RESEARCH.md)
**Mode:** mvp

<domain>
## Phase Boundary
Convertir el desempeño en una lectura de readiness por rol (junior/mid/senior) contra baselines ancladas a fuentes externas, con gaps priorizados y plan de estudio. NO incluye persistencia (Phase 5) ni la integración con jobhunt (Phase 6).
</domain>

<decisions>
## Implementation Decisions

### Flag de research CONT-05 — RESUELTO (ver 04-RESEARCH.md)
Niveles anclados a los marcos de leveling (alcance/autonomía/profundidad → dificultad de las preguntas). Perfiles de rol anclados a descripciones de puesto/roadmaps 2026. Todo con `source` citado en `readiness.yaml`.

### Niveles anclados a dificultad (ENG-03), no "a ojo"
Umbral de acierto por tramo (easy/medium/hard) que sube con el nivel. La estructura es el anclaje; los cortes numéricos son bandas convencionales transparentes. Un nivel NO se concede sin evidencia en el tramo que exige (no hay senior-ready sin preguntas difíciles respondidas) → evita sobre-afirmar.

### Sin score agregado (RES-02)
Readiness POR ROL (una fila por perfil), con evidencia por dificultad y N. Jamás un índice único de "empleabilidad".

### Gaps + plan (RES-03)
Dimensiones respondidas por debajo del 70%, de más débil a menos, cada una con su recurso de estudio (anclado a módulos del bootcamp para las dimensiones de bootcamp, docs oficiales para fullstack).

### Arquitectura
- Config en `packs/ai-ml-readiness/readiness.yaml` (datos, fuera del código), validada por zod (`src/content/readiness.ts`, fail-fast).
- Motor puro `src/core/readiness.ts` (computeReadiness + computeGaps); no conoce los strings del dominio.
- Render añade `renderReadiness` + `renderGaps`; `start.ts` los compone bajo el resultado y la calibración.
</decisions>

<code_context>
## Existing Code Insights
- `score`/`calibration`/`selectBalanced` no cambian: readiness es aditivo y computa su propio desglose por dificultad desde answered+bank.
- `roles[]` por pregunta (curados en Phase 1/2) quedan disponibles; en este MVP el readiness usa los perfiles de rol de la config, no los roles[] por pregunta (que se reservan para afinado futuro).
</code_context>

<specifics>
## Specific Ideas
- Roles cubiertos: AI Engineer, LLM Engineer, ML Engineer, Full Stack Engineer, AI Product Engineer (los objetivos de Carlos).
- Tramo sin preguntas en la sesión → celda "—" (no evaluable), y no concede el nivel que lo exige.
</specifics>

<deferred>
## Deferred Ideas
- Ponderar gaps por demanda real de mercado (jobhunt) → Phase 6.
- Guardar readiness y ver evolución entre sesiones → Phase 5.
- Afinar perfiles de rol con los roles[] por pregunta.
</deferred>
