# Phase 5: Persistencia y evolución - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning (ejecutada de forma directa e inline)
**Mode:** mvp

<domain>
## Phase Boundary
Guardar cada sesión localmente (PERS-01) y mostrar la evolución de scores/readiness entre sesiones (PERS-02), sobre los resultados ya calculados. NO incluye la integración con jobhunt (Phase 6) ni resurfacing tipo spaced-repetition (v2/RES-05).
</domain>

<decisions>
## Implementation Decisions

### Store: JSON local (desviación consciente del sqlite del research)
El research del stack sugería `node:sqlite`. Para un historial personal de baja escala (append + leer todo) elijo un **store JSON local** (`data/history.json`, gitignored): más simple, totalmente testeable con funciones puras + I/O fina, y sin los ExperimentalWarning de `node:sqlite` en Node 26. El store está detrás de una interfaz mínima (loadHistory/saveHistory), así que migrar a sqlite luego es local si hiciera falta.

### Pureza
- `src/core/evolution.ts` (puro): `buildSessionRecord` (arma el registro) y `evolution` (compara la última sesión con la anterior). El timestamp se genera en la capa de I/O (start.ts, `new Date().toISOString()`) y se inyecta; el núcleo no lee el reloj (grep gate intacto).
- `src/content/history.ts` (I/O): loadHistory/saveHistory con zod. Fichero inexistente → []; corrupto → Error claro (fail-fast, no perder datos en silencio).

### Flujo
- `aptus start`: carga el historial ANTES de la sesión (fail-fast si está corrupto), y al terminar guarda la sesión y muestra la evolución vs la anterior.
- `aptus history`: consulta el historial y muestra la evolución sin correr sesión (satisface "puede consultar el historial").

### Qué se guarda
Por sesión: timestamp, acierto por dimensión (answered/correct/pct) y readiness por rol (nivel). Suficiente para la evolución por dimensión y por rol; la calibración detallada no se persiste en este MVP.
</decisions>

<code_context>
## Existing Code Insights
- `score`, `computeReadiness`, `calibration` no cambian: la evolución es aditiva y consume sus salidas.
- Un tramo/dimensión que aparece o desaparece entre sesiones se maneja (previous null → delta null).
</code_context>

<specifics>
## Specific Ideas
- Evolución compara SIEMPRE las dos últimas sesiones (tendencia inmediata); el histórico completo queda guardado.
- Cambios de nivel de readiness por rol se destacan ("Junior-ready → Mid-ready").
</specifics>

<deferred>
## Deferred Ideas
- Ponderar gaps por demanda de mercado (jobhunt) → Phase 6.
- Resurfacing spaced-repetition de lo peor puntuado → v2 (RES-05).
- Persistir y graficar la curva de calibración a lo largo del tiempo.
</deferred>
