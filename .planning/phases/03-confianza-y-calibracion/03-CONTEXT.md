# Phase 3: Confianza y calibración - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning (ejecutada de forma directa e inline)
**Mode:** mvp

<domain>
## Phase Boundary

Añadir la captura de confianza por pregunta (SESS-03) y la curva confianza-vs-acierto en el resultado (RES-04), sobre la sesión y el resultado ya existentes. NO incluye readiness por rol (Phase 4) ni persistencia (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Escala de confianza
3 niveles cualitativos (baja / media / alta), tal como sugiere el criterio de la fase. Bajo fricción y suficientes para una curva de fiabilidad legible en terminal.

### Cómo se mide "confianza vs acierto" (sin mapeo arbitrario oculto)
Cada nivel lleva un "acierto declarado" representativo y transparente (baja ~40%, media ~65%, alta ~90%), que se contrasta con el acierto REAL de ese nivel. La brecha (real − declarado) revela sobreestimación (negativa) o infravaloración (positiva); umbral de señal 15 puntos. Los números de referencia se muestran en la columna "Declarada", no se esconden. Con 4 opciones, adivinar ≈ 25%, así que los niveles arrancan por encima.

### Arquitectura (respeta la pureza del núcleo)
- `Confidence` vive en `scoring.ts` junto a `AnsweredQuestion` (campo `confidence?` opcional → no rompe consumidores previos).
- Motor de calibración PURO en `src/core/calibration.ts`: cruza confianza declarada con acierto real por nivel; sin I/O, sin agregado global.
- La sesión gana un mapa `confidences` + transición pura `setConfidenceCurrent`; `toAnswered` propaga la confianza.
- El runner captura la confianza con un 2º `select` tras la respuesta (default a la previa al revisitar). El render añade `renderCalibration`; el núcleo no formatea nada.

### Fuera de alcance
- Persistencia de la calibración entre sesiones (Phase 5).
- Calibración por dimensión (el criterio se satisface con la curva por nivel de confianza).
</decisions>

<code_context>
## Existing Code Insights
- `score` y `selectBalanced` no cambian: la confianza es aditiva. `scoring.score` ignora el nuevo campo.
- El grep gate del proyecto (sin Math.random/Date.now en el núcleo) se mantiene: `calibration.ts` es puro y determinista.
</code_context>

<specifics>
## Specific Ideas
- Lectura por nivel: "⚠ te sobreestimas" (real << declarado), "calibrado" (dentro del umbral), "te infravaloras" (real >> declarado).
- Si no se declaró confianza en la sesión, el render muestra un mensaje claro, no una tabla vacía.
</specifics>

<deferred>
## Deferred Ideas
- Guardar la curva y ver su evolución entre sesiones → Phase 5.
</deferred>
