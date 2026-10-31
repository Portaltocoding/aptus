# Handoff — aptus
_actualizado: 2026-08-24_

## En qué estamos

Cerrando la deuda de calidad del pack **`ai-ml-readiness`** (255 preguntas, 5 dimensiones).
El pack `applied-ai-engineer` ya está limpio de sesiones anteriores.

Foto inicial de `ai-ml-readiness`: **0 errores, 401 avisos**. La correcta era la opción
más larga en **253 de 255 preguntas (99%)** y medía **3,9×** la media de sus distractores
—peor que `applied-ai-engineer`, que empezó en 78% y 2,5×—. Más 400 avisos de apuntes
(`rationale-eco` y `rationale-eco-delata`).

## Estado

| dimensión | preguntas | antes | ahora | avisos |
|---|---|---|---|---|
| ai-product-system-design | 50 | 100% · 5,2× | 26% · 1,1× | **0** ✅ |
| comportamental-star | 50 | 98% · 3,4× | 24% · 1,1× | **0** ✅ |
| fullstack-next-nest-ts | 50 | 98% · 3,9× | 28% · 1,1× | **0** ✅ |
| llm-rag-evals | 55 | 100% · 3,7× | 27% · 1,13× | **0** ✅ |
| ml-clasico | 50 | 100% · 3,5× | 26% · 1,12× | **0** ✅ |

**Pack: 401 → 0 avisos, 0 errores.** `verify-pack ai-ml-readiness` → ✓ limpio.
Total del pack: 99% · 3,93× → **26% · 1,10×**. Azar = 25%.

Distractores reescritos: 759. Apuntes reescritos: 369.
691 tests, lint y typecheck en verde. El repo solo tiene `HANDOFF.md` sin trackear.
**La opción correcta no se ha tocado en ninguna pregunta** (`rewrite-distractors.ts` lo bloquea).

Copias: `backups/packs-2026-08-24-pre-readiness` (antes) y
`backups/packs-2026-08-24-readiness-final` (resultado).

`applied-ai-engineer` sigue limpio. **Los dos packs pasan la auditoría sin un solo aviso.**

## Método (funciona, repetirlo tal cual)

Por dimensión, en dos fases:

**1. Distractores.** `npx tsx dump-tmp.ts <fichero>.yaml <desde> <hasta>` imprime, por
pregunta, la correcta con su longitud y cada distractor con su objetivo exacto de
caracteres (`c len=57 →130 (+73)`). Se escribe el JSON, se valida con
`npx tsx check-tmp.ts <fichero>.yaml <patch>.json` (marca `✗` si el reparto de
"quién es la más larga" no cuadra y muestra el ratio), se itera hasta limpio y se aplica con
`npx tsx scripts/rewrite-distractors.ts <ruta-yaml> <patch>.json`.

**Regla de diseño:** la correcta debe seguir siendo la más larga en ~1 de cada 4 preguntas
(`idx % 4 === 0`), no en 0. Llevarlo a 0% regala una eliminación gratis y sube el azar de
1/4 a 1/3 — error cometido y corregido en la sesión de `applied-ai-engineer`.

**2. Apuntes.** `npx tsx rchk-tmp.ts <fichero>.yaml [patch.json]` comprueba **las cuatro
reglas acopladas a la vez** (`src/core/pack-audit.ts`):
- eco por opción < 0,60
- eco(correcta) − media(eco distractores) < 0,25 (`RATIONALE_ECHO_GAP`)
- longitud(apunte correcta) ≤ 2× media(apuntes distractores) (`RATIONALE_LENGTH_RATIO`)
- todo apunte ≥ 20 caracteres

Escribir el apunte de la correcta con **vocabulario nuevo** (mecanismo, cifra, consecuencia),
no parafraseando la opción. Al alargar un distractor sube su eco, así que **los apuntes van
después de los distractores, nunca antes**. Se aplica con
`npx tsx scripts/add-rationales.ts --replace <ruta-yaml> <patch>.json` (acepta parches
parciales: no hace falta reescribir las cuatro opciones).

## Ficheros clave

- `~/.local/share/aptus/packs/ai-ml-readiness/questions/*.yaml` — los packs, **fuera del repo y sin versionar**
- `scripts/rewrite-distractors.ts` — bloquea la correcta con `morir()`
- `scripts/add-rationales.ts` — `--replace` para sobrescribir apuntes existentes
- `src/core/pack-audit.ts:154-170` — los cuatro umbrales
- Las herramientas temporales (`dump-tmp.ts`, `check-tmp.ts`, `rchk-tmp.ts`, `dc-tmp.ts`, `do-tmp.ts`,
  `bias-tmp.ts`) ya se han borrado. Si hay que rehacerlas, tienen que vivir en la raíz del repo
  para resolver `node_modules/yaml`; la receta está descrita arriba, en "Método".
- Parches JSON en el scratchpad de la sesión (`aps-*`, `star-*`, `fs-*`), más `merge.mjs`.

## Cuidado con esto

- `rewrite-distractors.ts` y `add-rationales.ts` van por **id de opción**, y la correcta no
  siempre es `a`: en `fullstack` eran `b` en fs-001, fs-002, fs-005 y fs-007. Comprobar
  `correct:` antes de escribir el parche.
- Al invocar `npx` hay que estar en la raíz del repo. Un `cd` al scratchpad en el mismo
  comando rompe la resolución de módulos.

## Siguiente paso

Las cinco dimensiones están hechas. Lo que queda no es trabajo de contenido:
1. **Bloqueado:** `aptus tema` nunca se ha ejecutado contra la API. Necesita que Carlos
   exporte `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` y pruebe `aptus tema prueba-humo -n 3`.
2. **Decisión pendiente de Carlos:** versionar los packs. 575 preguntas curadas y ~1.100
   ediciones viven en un solo disco; `backups/` no es control de versiones.
3. **Sugerencia de código (no tocado):** `sesgo-longitud` en `pack-audit.ts` es
   unidireccional (avisa por encima del 50%, no por debajo del azar). Debería avisar en
   ambos sentidos, porque optimizar contra la métrica introduce la pista contraria.
