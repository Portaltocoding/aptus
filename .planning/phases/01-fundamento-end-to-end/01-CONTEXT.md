# Phase 1: Fundamento end-to-end - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning
**Mode:** Smart discuss (autónomo, defaults recomendados auto-aceptados — `mode: yolo`)

<domain>
## Phase Boundary

Slice vertical MVP end-to-end que demuestra que motor + contenido + sesión funcionan juntos y que el scoring no miente, **antes** de escalar el banco (Phase 2), añadir readiness por rol (Phase 4), confianza (Phase 3) o persistencia (Phase 5).

Entra en esta fase:
- Scaffolding del proyecto TS/Node con separación estricta núcleo/contenido/IO desde el día 1.
- Cargador + validador de pack de contenido (YAML + zod) genérico y agnóstico del dominio.
- Un pack **mínimo pero real** (1-2 dimensiones) suficiente para una sesión de ≥15 min.
- Motor de scoring como **función pura sin I/O**, testeado con vitest usando fixtures.
- Motor de sesión: selección equilibrada por dimensión + navegación.
- Runner select interactivo por terminal.
- Render de resultado por dimensión con **N** junto a cada score.

NO entra (diferido a fases posteriores): banco completo de 5 dimensiones (P2), rotación entre intentos (P2), confianza/calibración (P3), readiness por rol + baselines + gaps + plan (P4), persistencia/evolución (P5), integración jobhunt (P6).

</domain>

<decisions>
## Implementation Decisions

### Scaffolding y tooling
- **Lenguaje/runtime:** TypeScript sobre Node.js (la máquina corre Node 26.4). Ejecución con `tsx` (esbuild, sin compilar); type-check con `tsc --noEmit`. ESM (`"type": "module"`).
- **TypeScript 7** como objetivo, con **red de seguridad**: si `@typescript-eslint` u otro tooling da fricción con la API aún inestable de TS7, fijar `typescript@^6.0.3` sin bloquear el resto (documentado en STACK.md).
- **Gestor de paquetes:** npm (consistente con el proyecto hermano `jobhunt/careerops`).
- **Test:** vitest. El motor de scoring y el validador del pack son la lógica más crítica → cobertura de tests obligatoria ahí.
- **Lint/format:** ESLint flat config + Prettier. No bloqueante para el MVP.
- **Estructura de directorios (separación de capas, decisión arquitectónica #1 del research):**
  - `src/core/` — lógica pura: `scoring` (motor de scoring) y `session` (selección + navegación). Sin I/O, sin terminal.
  - `src/content/` — cargador + schema zod del pack. Falla rápido con mensajes claros.
  - `src/cli/` — prompts (`@inquirer/prompts`) + render de resultado (`cli-table3`, `picocolors`). Solo presenta lo que el núcleo ya calculó; nunca deriva ni ajusta scores.
  - `packs/` — contenido YAML **fuera del código**.
  - Tests co-localizados (`*.test.ts`) o en `test/`, a discreción del planner.
- **Entrada CLI:** `commander` para el subcomando `start` (más subcomandos llegan en fases posteriores). Ejecutable vía `tsx src/index.ts` / script npm.

### Formato y schema del pack de contenido (CONT-01/02/03, ENG-04)
- **Formato:** YAML (legible y editable a mano por Carlos, diff-able), validado con **zod** al cargar.
- **Esquema de pregunta:** `id`, `dimension`, `subtopic`, `difficulty` (easy|medium|hard), `roles[]`, `stem`, `options[]` (cada una con `id` y `text`), `correct` (id de opción; permitir array para multi-respuesta futura), `explanation`, `source`, `date`.
- **Metadata obligatoria (el validador rechaza el pack si falta):** `dimension`, `difficulty`, `stem`, `options` (≥2), `correct` (debe referenciar una `option.id` existente), `explanation`. Sin respuesta correcta válida → pack inválido.
- **Pack v1 mínimo real:** 2 dimensiones — **LLM/RAG/evals** y **ML clásico** — ~12-15 preguntas cada una (≥24-30 en total), **contenido real** con respuesta correcta verdadera y explicación (no relleno). Cada pregunta con `source` etiquetada (aunque en P1 sea "curación manual"; el mining de `bootcamp-ml-llm` es P2).
- **Estructura en disco:** `packs/ai-ml-readiness/` con `pack.yaml` (metadata del pack: nombre, versión, lista de dimensiones) + `questions.yaml` (o dividido por dimensión, a discreción del planner). El schema debe **permitir campos futuros** (baselines, roles→dimensión, confianza) sin romper — esos se rellenan en P3/P4.
- **Agnóstico del dominio (ENG-04):** ni el motor ni el loader contienen strings de dominio ("LLM", "ML"...) hardcodeados; operan sobre las dimensiones que declara el pack.

### Contrato del motor de scoring (ENG-01/02, pitfalls 2/4/5)
- **Firma pura:** `score(answered: AnsweredQuestion[], bank: Question[]) → ScoreResult`. Sin I/O, sin terminal, sin `Date.now()`/`Math.random()` → determinista y testeable con fixtures vitest.
- **Sin crédito parcial** en select (pitfall 2 grade inflation): acierto binario por pregunta.
- **Forma de `ScoreResult`:** desglose **por dimensión** (y por subtema dentro de ella): `{ presented, answered, correct, pct }` donde `pct = correct/answered`. **El N (`answered`, y `presented`) va SIEMPRE junto a cada score** (RES-01, pitfall 4). 
- **NUNCA un score único agregado** tipo "empleabilidad"/"probabilidad de contratación" (pitfall 5). En P1 el resultado es solo la matriz por dimensión; el readiness por rol es P4.
- **Preguntas no respondidas:** se cuentan en `presented` pero no en `answered`; `pct` se calcula sobre `answered`. Se reporta `answered/presented` para que quede visible cuánto se dejó sin contestar.

### Sesión + render de resultado (SESS-01/02, RES-01)
- **Prompts:** `@inquirer/prompts` (`select`). Sesión **navegable**: se puede volver atrás a revisar/cambiar una respuesta antes de terminar, no solo avanzar. Ctrl+C sale limpio sin corromper estado.
- **Selección equilibrada por dimensión (SESS-02):** el motor de sesión reparte las preguntas de forma equilibrada entre las dimensiones del pack, con un **mínimo por dimensión** para evitar muestra insuficiente. La selección es **lógica pura testeable**: la aleatoriedad (barajado) se inyecta como una función/seed inyectable (no `Math.random()` directo dentro del núcleo) para que los tests sean deterministas.
- **Dimensionado ≥15 min:** seleccionar un número de preguntas tal que a ~45-60s/pregunta la sesión dure ≥15 min (≈18-22 preguntas). Configurable por constante.
- **Progreso visible:** contador sobrio "pregunta N de M" durante la sesión.
- **Render de resultado:** tabla por dimensión (`cli-table3`) con score y **N** al lado; barras horizontales unicode (`█░`) coloreadas con `picocolors` para el "radar" sobrio (nada de librerías de radar-chart abandonadas). Estética **minimalista clásica** (preferencia del usuario) — función sobre adorno.

### Claude's Discretion
- Organización exacta de ficheros de test, nombres internos de tipos, y si el banco YAML se parte por dimensión o va en un fichero — a discreción del planner/executor siempre que respete la separación de capas y los contratos anteriores.
- Elección fina de constantes (nº exacto de preguntas, segundos/pregunta objetivo) mientras cumpla ≥15 min y el mínimo por dimensión.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Proyecto **greenfield**: solo `.planning/` y git (7 commits de docs). No hay `src/` todavía — esta fase crea el scaffolding.
- Patrón reutilizable del hermano `jobhunt/careerops`: uso de **zod** para validar config YAML (`profile.yml`), convenciones TS/Node, layout de proyecto. Reutilizar el mismo estilo de validación para el pack.

### Established Patterns
- Separación estricta contenido / núcleo puro / capa I/O (decisión arquitectónica clave del research, `.planning/research/ARCHITECTURE.md` y `SUMMARY.md`).
- Motor de negocio como funciones deterministas testeadas antes que ninguna UI.

### Integration Points
- `packs/` como frontera de datos: todo el conocimiento entra por ahí, nunca por el código.
- Ninguna integración externa en P1 (jobhunt es P6, opcional).

</code_context>

<specifics>
## Specific Ideas

- Los **5 pitfalls** del research son criterios de aceptación, no advertencias: en P1 aplican el (2) no grade inflation / no crédito parcial, el (4) N siempre visible, y el (5) nunca un score único agregado.
- Estética: minimalismo clásico sobrio (preferencia registrada del usuario). Evitar arte cosmético; priorizar legibilidad del resultado tras 15+ min de test.
- El banco de P1 es real pero pequeño y **hand-curado**; el mining serio de `bootcamp-ml-llm` es Phase 2 — no adelantarlo aquí.

</specifics>

<deferred>
## Deferred Ideas

- Banco completo de 5 dimensiones + rotación entre intentos → **Phase 2**.
- Captura de confianza + curva confianza-vs-acierto → **Phase 3**.
- Readiness por rol + baselines externas + gaps priorizados + plan de estudio → **Phase 4**.
- Persistencia local + evolución entre sesiones → **Phase 5**.
- Cruce con ofertas de jobhunt → **Phase 6**.

</deferred>
