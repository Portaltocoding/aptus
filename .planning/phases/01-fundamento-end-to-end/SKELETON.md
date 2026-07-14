# Walking Skeleton — Aptus

**Phase:** 1
**Generated:** 2026-07-14

## Capacidad probada de punta a punta

> Una frase: la capacidad visible más pequeña que ejercita todo el stack.

Carlos ejecuta `aptus start`, completa una sesión de opción múltiple (select) navegable sobre el pack real mínimo (2 dimensiones), y ve un resultado por dimensión con su N junto a cada score, sin ningún score agregado. Esto demuestra que las tres capas (contenido → núcleo → terminal) conectan y que el scoring no miente.

## Decisiones arquitectónicas

| Decisión | Elección | Racional |
|---|---|---|
| Lenguaje / runtime | TypeScript sobre Node 26, ESM (`"type": "module"`), ejecución con `tsx`, type-check con `tsc --noEmit` | Decisión LOCKED de CONTEXT.md; `tsx` (esbuild) arranca sin compilar y no depende de la API inestable de TS7 |
| Capa de datos | Content packs en YAML validados con zod al cargar; `packs/` es la frontera de datos (no hay base de datos) | El contenido vive fuera del código (CONT-01); Carlos edita YAML a mano; el validador rechaza fail-fast |
| Auth | N/A | Herramienta personal de terminal, un solo usuario, sin red (Out of Scope en REQUIREMENTS.md) |
| Persistencia | Ninguna en P1 (sin escritura a disco de resultados) | La persistencia y evolución entre sesiones es Phase 5 |
| Objetivo de despliegue | Local: `npm start` / `tsx src/index.ts start` | CLI personal; no hay entorno remoto |
| Layout de directorios | Separación estricta: `src/core/` (puro, sin I/O) · `src/content/` (loader + schema zod) · `src/cli/` (prompts + render) · `packs/` (contenido) · `test/fixtures/` (fixtures deterministas) | Decisión arquitectónica #1 del research; aísla la lógica de honestidad del I/O |
| Testing | vitest con fixtures deterministas; PRNG con semilla inyectable (mulberry32 + Fisher-Yates) | El motor puro se prueba antes que ninguna UI; la aleatoriedad nunca entra en el núcleo |
| Contrato de scoring | `score(answered, bank) → ScoreResult` puro; desglose por dimensión/subtema con `{ presented, answered, correct, pct }`; el N siempre junto al score | Promesa central del proyecto: nunca un agregado, nunca crédito parcial, N siempre visible |
| Agnosticismo de dominio | El motor y el loader no contienen nombres de dominio hardcodeados; `dimension` es `z.string()`; el dominio vive solo en el pack | ENG-04 — el motor sirve para cualquier pack futuro sin tocar código |

## Stack tocado en la Fase 1

- [x] Scaffold del proyecto (framework, build, lint, test runner) — plan 01
- [x] "Routing" — subcomando `aptus start` vía commander — plan 05
- [x] "Base de datos" — lectura real de un pack YAML validado (una lectura real; sin escritura, la persistencia es Phase 5) — planes 02 + 04
- [x] UI — sesión interactiva `select` navegable + render del resultado por dimensión — plan 05
- [x] Despliegue — comando local documentado que ejercita todo el stack: `npm start` / `tsx src/index.ts start` — plan 05

## Fuera de alcance (diferido a slices posteriores)

> Todo lo que NO está en el skeleton. Explícito, para que fases futuras no reabran la minimalidad de la Fase 1.

- Banco completo de las 5 dimensiones + rotación de preguntas entre intentos → Phase 2 (curado desde `bootcamp-ml-llm`).
- Captura de confianza por pregunta + curva confianza-vs-acierto → Phase 3.
- Readiness por rol (junior/mid/senior) + baselines externas + gaps priorizados + plan de estudio → Phase 4.
- Persistencia local de sesiones + vista de evolución entre sesiones → Phase 5.
- Cruce con el dataset de jobhunt para ponderar gaps por demanda de mercado → Phase 6 (opcional, aditivo).
- **Prohibido para siempre** (garantía transversal, no un "todavía no"): un score único agregado tipo "empleabilidad"/"probabilidad de contratación", y cualquier motor psicométrico IRT/CAT.

## Plan de slices posteriores

Cada fase añade un slice vertical sobre este esqueleto sin alterar sus decisiones arquitectónicas:

- Phase 2: banco completo real de las 5 dimensiones (curado desde `bootcamp-ml-llm` + fuentes externas) con rotación entre intentos.
- Phase 3: confianza por pregunta y curva confianza-vs-acierto en el resultado.
- Phase 4: readiness junior/mid/senior por rol contra baselines externas, con gaps y plan de estudio.
- Phase 5: persistencia local de sesiones y evolución entre sesiones.
- Phase 6: integración opcional con jobhunt (ponderación de gaps por mercado), con degradación elegante si no está disponible.
