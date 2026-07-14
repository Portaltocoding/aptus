---
phase: 01-fundamento-end-to-end
plan: 04
subsystem: content
tags: [yaml, content-pack, llm, rag, evals, ml-clasico, hand-curated]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/content/schema.ts (PackSchema/QuestionSchema con superRefine)"
  - phase: 01-02
    provides: "src/content/loader.ts (loadPack: única frontera de validación de contenido)"
provides:
  - "packs/ai-ml-readiness/: pack real hand-curado con 2 dimensiones (llm-rag-evals, ml-clasico) y 30 preguntas técnicamente correctas"
  - "Banco suficiente por dimensión (15/15, >= mínimo de 12) para una sesión equilibrada de >=15 min"
  - "pack.test.ts: valida el pack real contra loadPack (carga sin error, 2 dimensiones exactas, >=12/dimensión, >=24 total, correct válido, explanation real)"
affects: [01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El dominio (nombres de dimensión, subtemas, terminología de LLM/RAG/ML) vive únicamente en packs/ai-ml-readiness/*.yaml; src/core y src/content siguen sin conocer estos strings (ENG-04), verificado con grep negativo"
    - "pack.test.ts co-localizado dentro de packs/ (no en src/), importando loadPack con ruta relativa a src/content/loader.ts"

key-files:
  created:
    - packs/ai-ml-readiness/pack.yaml
    - packs/ai-ml-readiness/questions.yaml
    - packs/ai-ml-readiness/pack.test.ts
  modified: []

key-decisions:
  - "questions.yaml se escribió como un único fichero con ambas dimensiones (no partido por dimensión), a discreción del planner/executor según lo permitido explícitamente en 01-CONTEXT.md; el reparto de tareas del plan (Task 1 = dim 1, Task 2 = dim 2 + test) se respetó igualmente en el historial git, separando temporalmente el contenido de cada dimensión entre ambos commits mediante `git reset` + escritura incremental, para que cada commit atómico refleje fielmente lo que esa tarea entregó"
  - "roles[] por pregunta usa etiquetas realistas de rol (AI Engineer, LLM Engineer, ML Engineer, Data Scientist, Product Manager, Prompt Engineer) coherentes con el roles[] del schema, dejadas preparadas para el readiness por rol de Phase 4 sin que el motor las interprete todavía"
  - "date: '2026-07-14' (fecha de curación) en las 30 preguntas; source: 'curación manual' en todas, tal como exige el plan (el mining de bootcamp-ml-llm es Phase 2)"

patterns-established:
  - "Pack real como único punto de entrada del dominio: 2 dimensiones (llm-rag-evals / ml-clasico), pregunta con id/dimension/subtopic/difficulty/roles/stem/options/correct/explanation/source/date completos, sin ningún campo de relleno"

requirements-completed: [CONT-01, CONT-02]

coverage:
  - id: D1
    description: "Existe un pack real en packs/ai-ml-readiness/ con exactamente 2 dimensiones (llm-rag-evals, ml-clasico), declaradas en pack.yaml"
    requirement: "CONT-01"
    verification:
      - kind: unit
        ref: "packs/ai-ml-readiness/pack.test.ts > pack real ai-ml-readiness > declara exactamente 2 dimensiones: llm-rag-evals y ml-clasico"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cada dimensión tiene >=12 preguntas reales (30 en total: 15+15), con correct válido y explanation real por pregunta"
    requirement: "CONT-02"
    verification:
      - kind: unit
        ref: "packs/ai-ml-readiness/pack.test.ts > pack real ai-ml-readiness > cada dimensión tiene al menos 12 preguntas / el banco total tiene al menos 24 preguntas / todas las preguntas tienen un correct que referencia un option.id existente / todas las preguntas tienen una explanation real"
        status: pass
    human_judgment: false
  - id: D3
    description: "El pack real pasa el validador zod real (loadPack) sin errores"
    requirement: "CONT-02"
    verification:
      - kind: unit
        ref: "packs/ai-ml-readiness/pack.test.ts > pack real ai-ml-readiness > valida sin errores contra el validador real (loadPack)"
        status: pass
    human_judgment: false
  - id: D4
    description: "El contenido es técnicamente correcto y hand-curado, sin relleno/lorem/placeholder — requiere criterio humano sobre exactitud del dominio (LLM/RAG/evals y ML clásico)"
    verification: []
    human_judgment: true
    rationale: "La corrección técnica de cada pregunta/respuesta/explicación (p. ej. que faithfulness mida lo que dice medir, que el kernel trick esté bien descrito) es un juicio de dominio que el validador zod no puede verificar automáticamente; solo comprueba forma (correct referencia option.id, explanation no vacía), no veracidad."

# Metrics
duration: 21min
completed: 2026-07-14
status: complete
---

# Phase 1 Plan 4: Pack de contenido real (AI/ML Readiness) Summary

**Pack hand-curado `packs/ai-ml-readiness/` con 2 dimensiones (LLM/RAG/evals y ML clásico) y 30 preguntas de opción múltiple técnicamente correctas (15 por dimensión), cada una con respuesta verdadera y explicación real, validado contra el `loadPack` real.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-14T19:11:00Z (aprox.)
- **Completed:** 2026-07-14T19:18:11+02:00
- **Tasks:** 2
- **Files modified:** 3 (todos creados)

## Accomplishments
- `pack.yaml`: metadata del pack (`name: "AI/ML Readiness"`, `version: "1.0.0"`, `dimensions: [llm-rag-evals, ml-clasico]`)
- `questions.yaml`: 30 preguntas reales, técnicamente correctas y hand-curadas
  - **llm-rag-evals** (15): chunking/overlap, embeddings, retrieval por similitud coseno vs euclídea, alucinación, faithfulness, context precision vs recall, temperature/sampling, RAG vs fine-tuning, ANN en bases de datos vectoriales, context window, tokenización BPE/subword, few-shot vs zero-shot, "lost in the middle", reranking, límites de RAG frente a la alucinación
  - **ml-clasico** (15): bias-variance tradeoff, overfitting, regularización L2 (ridge) y L1 (lasso), precision, recall, F1-score (media armónica), cross-validation k-fold, learning rate y divergencia del gradient descent, feature scaling, overfitting en árboles de decisión, reducción de varianza en Random Forest, kernel trick en SVM, limitaciones de k-means, accuracy engañosa con clases desbalanceadas
  - Dificultad repartida honestamente: llm-rag-evals 5 easy/6 medium/4 hard; ml-clasico 5 easy/7 medium/3 hard
- `pack.test.ts`: 6 tests que validan el pack real vía `loadPack` (carga sin error, exactamente 2 dimensiones, >=12 preguntas/dimensión, >=24 total, `correct` válido en las 30, `explanation` real en las 30)

## Task Commits

Each task was committed atomically:

1. **Task 1: Metadata del pack + dimensión LLM/RAG/evals (15 preguntas)** - `acfe013` (feat)
2. **Task 2: Dimensión ML clásico (15 preguntas) + pack.test.ts** - `003aea5` (feat)

**Plan metadata:** (este commit de SUMMARY, ver más abajo)

## Files Created/Modified
- `packs/ai-ml-readiness/pack.yaml` - metadata del pack (name, version, dimensions)
- `packs/ai-ml-readiness/questions.yaml` - banco real de 30 preguntas (15 llm-rag-evals + 15 ml-clasico)
- `packs/ai-ml-readiness/pack.test.ts` - 6 tests que validan el pack real contra `loadPack`

## Decisions Made
- El fichero `questions.yaml` se redactó en una sola pasada de contenido (ambas dimensiones), pero el historial git se construyó por tarea (`git reset` no destructivo + reescritura incremental) para que el commit de la Task 1 contenga únicamente las 15 preguntas de `llm-rag-evals` y el de la Task 2 añada las 15 de `ml-clasico` + `pack.test.ts`, respetando el `files_modified`/alcance de cada tarea del plan.
- `roles[]` usa etiquetas de rol realistas (AI Engineer, LLM Engineer, ML Engineer, Data Scientist, Product Manager, Prompt Engineer) por pregunta, dejando el terreno preparado para el readiness por rol de Phase 4 sin que el motor actual las use.
- Todas las preguntas llevan `source: "curación manual"` y `date: "2026-07-14"`, conforme exige el plan (el mining automático de `bootcamp-ml-llm` queda para Phase 2).

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. La única particularidad fue de mecánica de commits (ver "Decisions Made"), sin efecto en el contenido final ni en el alcance de ficheros.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- El pack real está completo, valida contra `loadPack` y tiene material más que suficiente (15/15, frente al mínimo 12/dimensión) para una sesión equilibrada de >=15 min con `selectBalanced` (plan 01-03).
- El plan 01-05 (runner CLI interactivo) puede consumir directamente `packs/ai-ml-readiness/pack.yaml` + `questions.yaml` vía `loadPack` sin ningún trabajo adicional de contenido.
- Sin bloqueos. `npx tsc --noEmit` limpio y `npx vitest run` en verde para todo el proyecto (39/39 tests: 33 previos de plans 01-01/02/03 + 6 nuevos de `pack.test.ts`).

---
*Phase: 01-fundamento-end-to-end*
*Completed: 2026-07-14*
