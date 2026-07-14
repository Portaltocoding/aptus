---
phase: 01-fundamento-end-to-end
plan: 01
subsystem: infra
tags: [typescript, esm, vitest, zod, tsx, eslint, scaffold]

# Dependency graph
requires: []
provides:
  - Andamiaje ESM TypeScript/Node completo (package.json, tsconfig, vitest.config, eslint flat, prettier, .gitignore)
  - Stack runtime instalado: yaml, zod, @inquirer/prompts, commander, cli-table3, picocolors
  - Stack dev instalado: typescript (^6.0.3), tsx, vitest, @types/node, eslint+typescript-eslint, prettier
  - src/content/schema.ts — contrato zod del pack (OptionSchema, QuestionSchema con superRefine, PackSchema, tipo Question/Pack)
  - src/core/random.ts — PRNG determinista (mulberry32 + makeSeededShuffle) con test de determinismo en verde
affects: [01-02, 01-03]

# Tech tracking
tech-stack:
  added: [yaml@2.9, zod@4.4, "@inquirer/prompts@8.5", commander@15, cli-table3@0.6, picocolors@1.1, "typescript@^6.0.3 (pinned, ver deviations)", tsx@4.23, vitest@4.1, "@types/node@26.1", eslint@10+typescript-eslint@8, prettier@3.9]
  patterns: ["separación núcleo puro (src/core) / contenido (src/content) / IO (src/cli, aún no creado)", "aleatoriedad inyectable vía PRNG con semilla, nunca Math.random()/Date.now() en core", "zod superRefine para validación cruzada de campos (correct ∈ options[].id)"]

key-files:
  created: [package.json, tsconfig.json, vitest.config.ts, eslint.config.js, .prettierrc, .gitignore, src/content/schema.ts, src/core/random.ts, src/core/random.test.ts]
  modified: []

key-decisions:
  - "typescript fijado a ^6.0.3 en vez de la 7.0.2 objetivo: typescript-eslint@8 declara peer typescript>=4.8.4 <6.1.0, ERESOLVE al instalar sobre TS7 — red de seguridad ya prevista en CONTEXT.md/RESEARCH.md, aplicada sin bloquear el resto del andamiaje"
  - "dimension en QuestionSchema es z.string() (cadena libre) — único z.enum permitido es difficulty (easy|medium|hard), cumpliendo ENG-04"
  - "superRefine (no refine) en QuestionSchema para poder reportar el issue con path:['correct'] cuando el id referenciado no existe entre options"

patterns-established:
  - "Pattern PRNG determinista: mulberry32(seed) + makeSeededShuffle(seed) como funciones puras copiadas del research, sin dependencia npm — misma seed produce siempre la misma secuencia/orden, no muta el array de entrada"
  - "Pattern schema del pack: zod con superRefine para validación cruzada; el schema nunca enumera nombres de dominio de negocio, solo la forma de los datos"

requirements-completed: [ENG-04, CONT-02]

coverage:
  - id: D1
    description: "Andamiaje ESM (package.json type:module + scripts start/test/typecheck/lint) instalado y tsc --noEmit limpio sobre el proyecto"
    verification:
      - kind: unit
        ref: "node --input-type=module -e (chequeo type:module + scripts) — pass"
      - kind: unit
        ref: "npx tsc --noEmit — exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/core/random.ts: PRNG determinista mulberry32 + makeSeededShuffle, función pura sin Date.now()/Math.random()"
    requirement: "ENG-04"
    verification:
      - kind: unit
        ref: "src/core/random.test.ts — 6/6 tests pass (mulberry32 rango [0,1) y determinismo; makeSeededShuffle mismo orden con misma seed, orden distinto con seed distinta, no muta input, produce permutación válida)"
        status: pass
    human_judgment: false
  - id: D3
    description: "src/content/schema.ts: QuestionSchema/PackSchema con dimension: z.string() (sin enum de dominio) y superRefine que valida correct ∈ options[].id"
    requirement: "CONT-02"
    verification:
      - kind: unit
        ref: "grep -c 'dimension: z.string()' src/content/schema.ts == 1; grep -c 'z.enum' src/content/schema.ts == 1 (solo difficulty) — pass"
        status: pass
      - kind: other
        ref: "smoke test manual (tsx, no commiteado): parse válido pasa; correct inexistente falla con path:['correct']; explanation faltante falla; options<2 falla"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-14
status: complete
---

# Phase 1 Plan 1: Andamiaje ESM + contrato zod del pack + PRNG determinista Summary

**Scaffold TypeScript/ESM con tsx+vitest+eslint flat, contrato zod del pack (`dimension` como cadena libre, `superRefine` sobre `correct`) y PRNG mulberry32 determinista con test en verde.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-14T16:36:00Z
- **Completed:** 2026-07-14T16:58:15Z
- **Tasks:** 2
- **Files modified:** 9 (7 de andamiaje + schema.ts + random.ts + random.test.ts)

## Accomplishments
- Proyecto TypeScript/Node andamiado en ESM real (`"type": "module"`), con scripts `start`/`test`/`typecheck`/`lint` y todo el Standard Stack de RESEARCH.md instalado (runtime + dev)
- Contrato zod del pack (`src/content/schema.ts`) que respeta ENG-04: `dimension` es cadena libre, único `z.enum` es `difficulty`; `superRefine` valida que `correct` referencia un `option.id` real
- PRNG determinista (`src/core/random.ts`) copiado del research: `mulberry32` + `makeSeededShuffle` (Fisher-Yates), función pura sin `Date.now()`/`Math.random()`, con 6 tests de determinismo en verde (RED→GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Andamiaje ESM + instalación del stack** - `d448f70` (chore)
2. **Task 2: Contrato zod + PRNG determinista (TDD)** - `13657c5` (test, RED) → `8e1af53` (feat, GREEN)

**Plan metadata:** (este commit de SUMMARY, ver más abajo)

_Nota: la Task 2 llevó `tdd="true"` — dos commits (RED test / GREEN implementación), sin necesidad de refactor._

## Files Created/Modified
- `package.json` - ESM (`type: module`), scripts start/test/typecheck/lint, dependencias runtime+dev
- `tsconfig.json` - NodeNext, strict, noEmit, types:["node"], include src+test
- `vitest.config.ts` - config mínima, watch:false
- `eslint.config.js` - flat config (@eslint/js + typescript-eslint + eslint-config-prettier), no bloqueante
- `.prettierrc` - formato mínimo (semi, singleQuote:false, trailingComma:all)
- `.gitignore` - node_modules, dist, coverage, logs
- `src/content/schema.ts` - `OptionSchema`, `QuestionSchema` (+superRefine), `PackSchema`, tipos `Question`/`Pack` inferidos
- `src/core/random.ts` - `mulberry32`, `makeSeededShuffle`
- `src/core/random.test.ts` - 6 tests de determinismo del PRNG

## Decisions Made
- **typescript fijado a `^6.0.3`** en lugar del objetivo TS7 (7.0.2): al instalar `typescript-eslint@8` con TS7 instalado, npm reportó `ERESOLVE` porque `typescript-eslint@8` declara `peer typescript: ">=4.8.4 <6.1.0"`. Esta fricción ya estaba prevista como riesgo aceptado en CONTEXT.md/RESEARCH.md ("red de seguridad": fijar `^6.0.3` sin bloquear el resto). Se aplicó sin checkpoint porque el propio plan autorizaba esta decisión de antemano.
- `dimension: z.string()` sin enum — cumple ENG-04 al pie de la letra; verificado con grep automatizado (`z.enum` aparece exactamente 1 vez, para `difficulty`).
- `superRefine` (no `refine`) en `QuestionSchema`, tal como indica RESEARCH.md Pitfall 2, para poder reportar `path:["correct"]` con precisión.
- No se creó `src/content/loader.ts` ni `src/core/session.ts`/`scoring.ts` en este plan — están fuera de su alcance (planes 02 y 03 respectivamente), tal como indica `files_modified` en el frontmatter del plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, previsto por el propio plan] `typescript@7.0.2` incompatible con `typescript-eslint@8` (peer range `<6.1.0`)**
- **Found during:** Task 1 (instalación de dependencias dev)
- **Issue:** `npm install -D typescript-eslint eslint-config-prettier` falló con `ERESOLVE` al tener `typescript@7.0.2` instalado como dependencia raíz.
- **Fix:** `npm install -D typescript@^6.0.3` (downgrade explícito, versión real publicada en el registry, verificada con `npm view typescript@^6.0.3 version` → `6.0.3`), después reinstalado `typescript-eslint`/`eslint-config-prettier` sin conflicto.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npx tsc --version` → `Version 6.0.3`; `npx tsc --noEmit` limpio (exit 0); `npx eslint .` sin errores.
- **Committed in:** `d448f70` (Task 1 commit)

**2. Orden inherente del scaffolding: `tsc --noEmit` no puede pasar hasta que existan ficheros en `src/`**
- No es un bug ni un fix — es consecuencia de que `tsconfig.json` (`include: ["src","test"]`) se crea en la Task 1 antes de que existan ficheros TS (creados en la Task 2). `npx tsc --noEmit` ejecutado justo tras la Task 1 devuelve `TS18003: No inputs were found`. Documentado aquí para que quede explícito que no es un fallo — la verificación final (tras Task 2) sí pasa limpio.
- **Verification:** `npx tsc --noEmit` tras completar la Task 2 → exit 0, sin errores.

---

**Total deviations:** 1 auto-fijado (Rule 3, blocking previsto), 1 nota de secuenciación documentada (no es una desviación real).
**Impact on plan:** Ninguno sobre el alcance. La fijación de TypeScript ya estaba autorizada explícitamente por el plan como "red de seguridad"; no hubo scope creep.

## Issues Encountered
- `esbuild@0.28.1` (dependencia transitiva de `tsx`/`vitest`) tiene un script `postinstall` bloqueado por la política `allowScripts` de npm en este entorno. No afectó a la funcionalidad: el binario nativo `@esbuild/linux-x64` se instaló igualmente como dependencia opcional independiente y `npx tsx` funciona correctamente (verificado con un smoke test). No se requirió ninguna acción adicional.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/content/schema.ts` y `src/core/random.ts` están listos para ser consumidos sin reconstrucción por el plan 02 (`src/content/loader.ts`, que hará `YAML.parse` + `PackSchema.safeParse`) y por el plan 03 (`src/core/session.ts`/`scoring.ts`, que usará `makeSeededShuffle` para la selección equilibrada por dimensión).
- Sin bloqueos. El único punto a vigilar: si en el futuro se quiere volver a TS7, habrá que esperar a que `typescript-eslint` amplíe su peer range (o desacoplar el lint de TS7 explícitamente).

---
*Phase: 01-fundamento-end-to-end*
*Completed: 2026-07-14*
