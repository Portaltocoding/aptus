# Phase 2: Banco completo desde bootcamp-ml-llm - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning (ejecutada de forma directa e inline, sin subagentes)
**Mode:** mvp

<domain>
## Phase Boundary

El banco crece del slice mínimo (2 dimensiones) a las 5 dimensiones objetivo, curado y anclado a fuentes, con preguntas que rotan entre intentos. NO incluye readiness por rol (Phase 4) ni confianza/calibración (Phase 3): solo contenido completo + rotación sobre la tubería ya construida en Phase 1.
</domain>

<decisions>
## Implementation Decisions (resueltas en el research de fuentes)

### Cobertura del bootcamp (inspección real de module_maps.json)
`module_maps.json` mapea el temario a las 5 dimensiones:
- **llm-rag-evals** ← m1 (LLM internals + prompting), m2 (RAG e2e), m3 (evals/métricas), m8 (internals, vector DBs), m14/m15/m17.
- **ml-clasico** ← m0 (fundamentos ML), m0plus (algoritmos clásicos).
- **ai-product-system-design** ← m4 (agent vs workflow, no sobre-ingeniería), m5 (demo→prod: coste/latencia), m6 (evals como contrato), m7 (system design en entrevista), m11 (influir sin autoridad).
- **comportamental-star** ← m12 (contar tu historia, STAR bajo presión), m13.
- **fullstack-next-nest-ts** → NO cubierto por el bootcamp (apenas menciones incidentales). Es el stack profesional de Carlos.

### Semántica de `source` (auditar sesgo de autocuración, curador = evaluado)
- `bootcamp-ml-llm`: pregunta sobre material del temario que Carlos autoseleccionó/estudió → mayor riesgo de que el score refleje familiaridad, no dominio.
- `externa`: conocimiento externo independiente (stack profesional, marcos universales como STAR) → señal más objetiva.
- Reparto: 37 bootcamp / 29 externa. fullstack + comportamental son 100% externa; llm + ml son 100% bootcamp; ai-product mezcla (product/AI del bootcamp vs system design canónico externo).

### Rotación (SESS-04) — decisión MVP
La rotación entre intentos se resuelve con la seed derivada del arranque (`Date.now()` en la capa IO, ya presente desde Phase 1): dos arranques → seeds distintas → subconjuntos distintos, porque el banco (66) es muy superior a lo mostrado por sesión (25). NO se implementa "evitar preguntas vistas recientemente" (requiere persistencia → Phase 5).

### Dimensionado
`SESSION_TARGET_QUESTIONS=25`, `MIN_PER_DIMENSION=4` → 5 preguntas/dimensión × 5 = 25 por sesión (~20 min, cumple SESS-01 ≥15 min). Banco ≥12/dimensión para dar margen de rotación.

### Estructura de ficheros
Un único `questions.yaml` (el loader toma un fichero). No se parte por dimensión: 66 preguntas en un fichero siguen siendo manejables y evita tocar el loader (menos riesgo). Partir por dimensión queda para cuando el banco crezca mucho más.
</decisions>

<code_context>
## Existing Code Insights
- El núcleo (`selectBalanced`, `score`) y el loader NO cambian: la Phase 1 los dejó agnósticos del dominio (ENG-04). Añadir 3 dimensiones es puro contenido en `packs/`.
- Único cambio de código: constantes de dimensionado en `src/cli/commands/start.ts` (20→25, 8→4) para repartir 5 dimensiones.
</code_context>

<specifics>
## Specific Ideas
- Cada pregunta: 4 opciones, `correct` válido, `explanation` real, metadata completa (dimension, subtopic, difficulty, roles, source, date).
- Roles realistas por pregunta preparados para el readiness por rol de Phase 4.
</specifics>

<deferred>
## Deferred Ideas
- Anti-repetición basada en persistencia ("no repetir lo visto la última vez") → Phase 5 (PERS-01/02).
- Anclaje de baselines por rol a fuentes externas (CONT-05) → Phase 4.
</deferred>
