---
phase: 02-banco-completo-desde-bootcamp-ml-llm
plan: 01
subsystem: content
tags: [content-pack, 5-dimensiones, bootcamp-ml-llm, procedencia, rotacion, sess-04, cont-04]

# Dependency graph
requires:
  - phase: 01-02
    provides: "src/content/loader.ts + schema (source y dimension como string libre)"
  - phase: 01-03
    provides: "selectBalanced (reparto por dimensión con mínimo)"
  - phase: 01-05
    provides: "startCommand end-to-end (loadPack → selectBalanced → runSession → score → renderResult)"
provides:
  - "packs/ai-ml-readiness/ v2: 5 dimensiones, 66 preguntas hand-curadas, cada una con source auditable (bootcamp-ml-llm | externa)"
  - "Sesión que cubre de verdad las 5 dimensiones (5/dim, 25 por sesión)"
  - "Rotación entre intentos (SESS-04) vía seed de arranque sobre un banco mayor que lo mostrado"
affects: [04-readiness-por-rol]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El crecimiento del banco es puro contenido en packs/: el núcleo (src/core) y el loader siguen sin conocer las dimensiones ni la terminología del dominio (ENG-04), verificado (las 5 dimensiones solo aparecen en packs/)"
    - "Procedencia por pregunta (source) como metadato de auditoría: distingue material del bootcamp que Carlos autoseleccionó (mayor sesgo) de conocimiento externo independiente"
    - "Rotación entre intentos sin persistencia: seed de arranque (Date.now en la capa IO) + banco (66) >> sesión (25). La anti-repetición basada en historial queda para Phase 5"

key-files:
  created: []
  modified:
    - packs/ai-ml-readiness/pack.yaml
    - packs/ai-ml-readiness/questions.yaml
    - packs/ai-ml-readiness/pack.test.ts
    - src/cli/commands/start.ts

key-decisions:
  - "Inspección real de module_maps.json: el bootcamp cubre 4 de las 5 dimensiones (llm/rag/evals m1-m3/m8, ml m0/m0plus, product&system-design m4-m7/m11, comportamental m12). Solo fullstack-next-nest-ts es externo al bootcamp → tag 'externa'. Esto hace honesta y significativa la auditoría de autocuración."
  - "Retag de las 30 preguntas de Phase 1 (llm/ml) de 'curación manual' a 'bootcamp-ml-llm': son el núcleo del temario que Carlos estudió, así que reflejan el mayor riesgo de sesgo."
  - "SESS-04 (rotación) resuelto con la seed de arranque ya existente, no con persistencia: dos arranques dan subconjuntos distintos porque el banco es 66 y la sesión 25. Test explícito con seeds distintas."
  - "Un único questions.yaml (no partido por dimensión): 66 preguntas manejables sin tocar el loader."

patterns-established:
  - "Pack multi-dimensión con procedencia auditable como contrato de contenido: dimension/subtopic/difficulty/roles/stem/options/correct/explanation/source/date por pregunta, source ∈ {bootcamp-ml-llm, externa}"

requirements-completed: [CONT-04, SESS-04]

coverage:
  - id: SC1
    description: "Sesión que cubre las 5 dimensiones (llm-rag-evals, ml-clasico, fullstack-next-nest-ts, ai-product-system-design, comportamental-star) curadas desde bootcamp-ml-llm + externas"
    requirement: "CONT-04"
    verification:
      - kind: unit
        ref: "pack.test.ts > declara exactamente las 5 dimensiones objetivo / cada dimensión tiene al menos 12 preguntas / el banco total tiene al menos 60"
        status: pass
      - kind: manual
        ref: "Sesión PTY de 25 preguntas: tabla final con las 5 dimensiones, cada una 5/5, sin agregado"
        status: pass
    human_judgment: false
  - id: SC2
    description: "Cada pregunta registra su fuente (bootcamp-ml-llm u externa) para auditar el sesgo de autocuración"
    requirement: "CONT-04"
    verification:
      - kind: unit
        ref: "pack.test.ts > cada pregunta declara una source auditable / el banco mezcla fuentes (fullstack 100% externa)"
        status: pass
    human_judgment: false
  - id: SC3
    description: "El banco es sustancialmente mayor que lo mostrado y dos intentos consecutivos no presentan el mismo set (rotación)"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "pack.test.ts > dos intentos con seeds distintas no presentan el mismo set (rotación) / misma seed → misma selección (determinismo)"
        status: pass
      - kind: manual
        ref: "startCommand genera seed por arranque (Date.now); banco 66 >> sesión 25"
        status: pass
    human_judgment: false
  - id: SC4
    description: "El contenido de las 3 dimensiones nuevas es técnicamente correcto y hand-curado (juicio de dominio)"
    verification: []
    human_judgment: true
    rationale: "La corrección técnica de cada pregunta/respuesta/explicación (TS satisfies, RSC/ISR/Server Actions, DI/Guards/Pipes de Nest, CAP/idempotency/token-bucket, agent-vs-workflow, STAR) es juicio de dominio que el validador no verifica; solo comprueba forma."

# Metrics
duration: ~35min
completed: 2026-07-14
status: complete
---

# Phase 2 Plan 1: Banco completo (5 dimensiones) Summary

**El banco crece de 2 a 5 dimensiones (66 preguntas hand-curadas), anclado al temario real de `bootcamp-ml-llm` (m0-m12) más el stack profesional externo (fullstack Next/Nest/TS), con procedencia por pregunta auditable (bootcamp-ml-llm | externa) y rotación entre intentos — todo sobre la tubería de Phase 1 sin tocar el núcleo puro.**

## Accomplishments
- **3 dimensiones nuevas** (12 preguntas cada una): fullstack-next-nest-ts (TS unknown/satisfies/discriminated unions, Next.js RSC/ISR/Server Actions/hydration, Nest DI/Guards/Pipes/DTO), ai-product-system-design (agent vs workflow, coste/latencia LLM en prod, evals como contrato, human-in-the-loop, guardrails, + system design canónico: latencia/throughput, idempotency, CAP, colas, token bucket), comportamental-star (método STAR, Result cuantificado, conflicto/fracaso/debilidad, liderazgo sin autoridad).
- **Retag de procedencia** de las 30 de Phase 1 (llm/ml) a `bootcamp-ml-llm`; reparto final 37 bootcamp / 29 externa.
- **pack.yaml** v2.0.0 con 5 dimensiones y semántica de source documentada.
- **Dimensionado** de sesión a 25 preguntas (5/dimensión) en start.ts.
- **pack.test.ts** reescrito con auditoría de fuentes (CONT-04) y rotación (SESS-04).

## Verification
- `npx tsc --noEmit`: limpio (exit 0).
- `npx vitest run`: **50/50 tests** en verde (45 previos + 5 nuevos del pack).
- Inspección real de `bootcamp-ml-llm/module_maps.json` para anclar la procedencia (no inventada).
- UAT sobre PTY: sesión completa de 25 preguntas cubriendo las 5 dimensiones, tabla final por dimensión con N (5/5), sin agregado.

## Deviations from Plan
Ejecutado de forma directa e inline (sin la maquinaria autónoma de subagentes) a petición de Carlos, para cerrar la fase sin enredos. Alcance y entregables sin cambios.

## Next Phase Readiness
- Banco completo listo. Phase 3 (confianza y calibración) y Phase 4 (readiness por rol) construyen sobre este banco. Los `roles[]` por pregunta ya están preparados para el mapeo por rol de Phase 4.
- Pendiente para Phase 4: anclar baselines por rol a fuentes externas (CONT-05, flag de research anotado).

---
*Phase: 02-banco-completo-desde-bootcamp-ml-llm*
*Completed: 2026-07-14*
