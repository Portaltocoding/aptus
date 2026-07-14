# Phase 6: Integración con jobhunt (opcional, aditiva) - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning (ejecutada de forma directa e inline)
**Mode:** mvp

<domain>
## Phase Boundary
Cuando existe el dataset de jobhunt, ponderar la PRIORIDAD de los gaps de Carlos por la demanda real de mercado; cuando no existe, Aptus funciona exactamente igual. Capa opcional y aditiva sobre los gaps de Phase 4. NO reentrena readiness ni crea scores nuevos.
</domain>

<decisions>
## Implementation Decisions

### Fuente y lectura
`~/workspace/jobhunt/data/jobs.db` (SQLite, 403 ofertas; tabla `jobs` con `title`/`description`). Se lee en SOLO LECTURA con `node:sqlite` (integrado en Node 26; verificado sin ExperimentalWarning en 26.4). El adaptador solo obtiene title+description por oferta.

### Degradación elegante (criterio 2)
`loadJobTexts` devuelve `null` si el fichero no existe o falla la lectura por cualquier motivo (schema distinto, corrupto, permisos). En ese caso start.ts muestra los gaps sin ponderar, exactamente como en Phase 5. Nunca lanza ni bloquea.

### Ponderación, no score nuevo (criterio 3)
Motor puro `computeDemand` (cuenta ofertas por dimensión vía keywords) + `applyMarketWeight` (priority = debilidad × (1 + demandShare)). `priority` es solo clave de orden interna; el render muestra las DOS señales por separado (tu acierto y "en N/T ofertas") y reordena. No hay score de encaje/empleabilidad.

### Keywords como dato del pack
`market_keywords` (dimensión → keywords ES+EN) vive en `readiness.yaml` (campo opcional). El motor no conoce los strings: los recibe de la config.
</decisions>

<code_context>
## Existing Code Insights
- Reutiliza los `Gap[]` de `computeGaps` (Phase 4) sin tocarlos: la ponderación es una capa encima.
- start.ts ya cargaba pack/readiness/history; se añade la carga opcional de jobhunt tras calcular los gaps.
</code_context>

<specifics>
## Specific Ideas
- Una oferta cuenta como mucho una vez por dimensión (presencia, no frecuencia).
- La debilidad sigue mandando: la demanda amplifica pero no anula un gap de dimensión poco demandada.
</specifics>

<deferred>
## Deferred Ideas
- Usar salario/seniority de las ofertas para matizar la demanda.
- Cruce por rol (qué roles concretos piden qué), no solo por dimensión.
</deferred>
