---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 6
current_phase_name: Integración con jobhunt
status: complete
stopped_at: context exhaustion at 75% (2026-07-14)
last_updated: "2026-07-14T23:24:21.384Z"
last_activity: 2026-07-15
last_activity_desc: "v2: 'aptus jd <fichero>' — readiness contra una oferta concreta (rol ad-hoc desde la JD); 149/149 tests"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** Decirle a Carlos con honestidad, a nivel de conocimiento, cómo de preparado está para cada rol (AI Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer), con gaps accionables — nunca una "probabilidad de contratación" inventada.
**Current focus:** Phase 1 — Fundamento end-to-end

## Current Position

Phase: 6 of 6 (Integración con jobhunt) — COMPLETA. Milestone v1 completo.
Plan: Phases 1-6 completas (10/10 planes)
Status: Milestone v1 completo. **v2 EN CURSO** (a petición de Carlos): multi-tema + banco mucho mayor y creativo.
Last activity: 2026-07-15 — v2: `aptus jd <fichero>` — readiness contra una oferta concreta; 149/149 tests

Progress v1: [██████████] 100%

## v2 en curso (14 jul 2026)

- **Multi-tema (PACK-02): LISTO.** Pack = directorio (`pack.yaml` + `questions/<dim>.yaml`, `readiness.yaml` opcional). `aptus packs` lista; `aptus start --pack <nombre>` elige; historial por pack. Crear packs de cualquier tema ya no requiere código.
- **Tipos de pregunta creativos: LISTO.** Campo `type` (concepto|diagrama|codigo|escenario); enunciados multilínea (diagramas ASCII, snippets de código) renderizados en el select.
- **Seniority afinado (junior/mid/senior/staff): LISTO.** Nueva dificultad `experto` (4 tramos) y nivel **staff** = dominio experto en el núcleo + **amplitud** (breadth) en las dimensiones secundarias del rol. Sin evidencia experto no se concede staff (anti-sobreafirmación). **Test largo por defecto** (~120 obj.; ~85 con el banco actual). **Resultado con resumen narrativo** (ranking de roles + peores puntos + por dónde estudiar) + plan de estudio offline.
- **Research bajo petición:** offline enriquecido (resumen + plan) **LISTO**; **web opcional PENDIENTE** (probablemente asistido por Claude/deep-research bajo petición, o un `aptus study --research`).
- **Banco mucho mayor: COMPLETO ✓.** Objetivo ~250 alcanzado: **255 preguntas**, las 5 dimensiones a 50 (llm-rag-evals 55, resto 50), todas con tramo `experto`. Staff evaluable en todos los roles. Tipos: concepto + diagrama + código + escenario. Mezcla de fuente auditable. Todo curado a mano y verificado (zod + pack.test).
- **Generación de packs por input/fuentes (petición de Carlos, 14 jul):** quiere una lógica "le doy inputs o señalo fuentes → me arma el pack". Enfoque A (asistido por Claude): señala fuentes/tema → Claude lee/investiga, cura questions+readiness, verifica, escribe packs/<tema>/. **PASO 1 HECHO:** `aptus new-pack <tema>` (esqueleto aislado). **PASO 2 HECHO:** `aptus verify-pack <tema>` + `auditPack` puro (control de calidad "curadas, no relleno": ids únicos, cobertura, experto por dimensión, sin relleno; el pack real pasa limpio). **PASO 3 HECHO:** skill `build-pack` — la receta repetible de currar el pack desde `sources/`. El bucle asistido completo ya es: `aptus new-pack X` → dejo fuentes en sources/ → skill build-pack (Claude cura) → `aptus verify-pack X`. **PENDIENTE del flujo:** solo el generador in-tool con LLM (Enfoque B), diferido a conciencia.
- **Evaluación contra una oferta concreta (JD): LISTO (15 jul).** `aptus jd <fichero> [--pack]`: le pasas el texto de una oferta y te da el readiness para ESE puesto. La JD se traduce a un **rol ad-hoc** (dimensiones núcleo/secundarias según con cuánta fuerza las pide) y se mete por el motor de readiness de siempre: misma vara, mismos umbrales, sin motor paralelo. Extrae también el seniority que pide la oferta y dice cuántos escalones te faltan. Los gaps se acotan a lo que la oferta pide y se ordenan por debilidad × cuánto lo pide. **Sin score de "encaje"** (respeta el quality gate transversal). Detalles de diseño:
  - **Reutiliza `market_keywords`** del pack (ya eran "qué palabras delatan cada dimensión en una oferta"), sin duplicar léxico.
  - **Reutiliza la última sesión con respuestas**, no te hace repetir el test → evaluar una oferta cuesta un segundo y varias ofertas se comparan con la MISMA evidencia. Para eso, `history.json` ahora guarda las respuestas crudas (campo `answers`, **opcional**: los historiales viejos siguen cargando, solo no son reevaluables).
  - **Límite honesto y declarado en pantalla:** la extracción es LÉXICA, no semántica — no distingue "imprescindible RAG" de "no hace falta RAG". Por eso cada dimensión detectada muestra SIEMPRE las keywords que la dispararon (auditables a ojo). Ojo al español: "principal"/"lead" sueltos NO cuentan como staff, y "mid" se busca como palabra (no dispara con "middleware").
  - Degrada sin inventar: oferta que no toca ninguna dimensión medible → lo dice y no da veredicto; sin seniority declarado → `meetsTarget = null`, no un false engañoso.
- **Afinado del `jd` (15 jul), a raíz de una autocrítica.** Cinco arreglos, todos contra el mismo sesgo: que el veredicto salga más optimista que la oferta real.
  1. **Puntos ciegos (el grave).** Lo que el pack no mide era INVISIBLE: una oferta de Kubernetes+Kafka se evaluaba solo por las dos palabras reconocidas → sesgo optimista sistemático. Ahora `src/core/tech-lexicon.ts` (léxico general, NO de pack: los puntos ciegos son del mundo) detecta qué pide la oferta que aptus no mide y lo avisa. Su incompletitud solo cuesta un aviso de menos → falla hacia el silencio, nunca hacia el falso positivo.
  2. **Cobertura.** Dos señales: `ratio` = fracción de lo técnico reconocible que el pack sabe medir (**principal**, robusta a la longitud) y `density` = menciones por 100 palabras (**secundaria**, pilla dominios que el léxico ni conoce — contabilidad —, pero es ruidosa en textos cortos: lo descubrió un test). Cualquiera de las dos dispara aviso; ninguna cambia el cálculo.
  3. **Requisito vs «valorable».** Se parten las líneas en required/optional/neutral por encabezados. Lo que solo aparece en un "valorable" NO puede ser núcleo (pesa `OPTIONAL_WEIGHT`=0.35). Bug real observado: un "nociones de ML clásico" en un *Valorable* metía ml-clasico en el perfil como un requisito duro. Cuidado al tocar `OPTIONAL_HEADINGS`: se aplica a frases sueltas ("X es un plus"), así que una palabra corriente como "además" marcaría media oferta como opcional.
  4. **Menciones incidentales.** Por debajo de `INCIDENTAL_SHARE`=0.10 la dimensión no entra en el rol. Arregla un bug de diseño: el motor exige competencia en TODAS las secundarias para conceder staff, así que un único "comunicación escrita" suelto en la oferta bloqueaba el nivel más alto (ruido léxico gobernando el veredicto). Efecto colateral asumido: si la oferta no pide amplitud, staff no es evaluable para ella → se DICE (`capReason`), no se capa en silencio.
  5. **Años de experiencia** ("5+ años") como plan B del seniority cuando la oferta no dice "senior"; la palabra explícita manda. Y el render recuerda que esto mide CONOCIMIENTO, no experiencia (producción/incidentes/mentoría no entran y pesan en un puesto real).
  - Test de integración `src/cli/jd.integration.test.ts` contra el pack real, con el contrato de honestidad protegido (evidencia a la vista, nunca un score de encaje).
  - **Pendiente conocido:** el conteo de menciones premia la verborrea; `CORE_RATIO`/`INCIDENTAL_SHARE`/umbrales de cobertura son convenciones transparentes, no anclajes externos.
- **Idea siguiente (natural, casi gratis):** evaluar EN BLOQUE las ofertas ya escaneadas en `jobs.db` de jobhunt. No para rankearlas por "encaje" (prohibido), sino para responder: "de las 40 ofertas escaneadas, estas 6 piden justo aquello en lo que eres fuerte".
- **Generación de packs (multi-tema real):** hoy el motor corre CUALQUIER pack, pero armar un pack nuevo = currar sus YAML (lo hace Claude a mano, curado). NO hay generador in-tool que tome "tema + info" y produzca el pack. Idea futura: flujo de generación asistido (Claude/deep-research) con verificación de correctitud para no romper el principio "curadas, no relleno". Ver conversación 14 jul.

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 22min | 2 tasks | 9 files |
| Phase 01 P02 | 18min | 2 tasks | 6 files |
| Phase 01-fundamento-end-to-end P03 | 22min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Fase 1 es un slice vertical MVP end-to-end (banco mínimo real, no fixture aislada de motor) — no una capa técnica aislada.
- [Roadmap]: El banco completo desde `bootcamp-ml-llm` se separa en Fase 2, después del slice mínimo funcional, para no bloquear la validación del núcleo con el trabajo de curación de contenido.
- [Roadmap]: Readiness por rol (ENG-03/RES-02) se pospone a Fase 4, después de tener el banco completo (Fase 2) y baselines ancladas a fuentes externas (CONT-05), para evitar mapeos arbitrarios score→nivel.
- [Roadmap]: Integración con jobhunt (INTEG-01) queda como Fase 6, opcional y aditiva — el sistema es completo y útil sin ella.
- [Phase ?]: typescript fijado a ^6.0.3 (red de seguridad prevista): typescript-eslint@8 no soporta el peer range de TS7, ERESOLVE resuelto sin bloquear el andamiaje
- [Phase ?]: dimension en QuestionSchema es z.string() (cadena libre), unico z.enum permitido es difficulty, cumple ENG-04
- [Phase ?]: Fixtures inválidas autocontenidas (pack+questions en un único YAML) para poder invocar loadPack(ruta,ruta) en tests
- [Phase ?]: Núcleo puro con desglose por dimensión y subtema, sin agregado global (score/selectBalanced deterministas)

### Pending Todos

None yet.

### Blockers/Concerns

- Quality gate transversal (todas las fases de resultado): nunca mostrar un score único agregado tipo "empleabilidad"; siempre mostrar N junto a cada score; nada de IRT/CAT en el mapeo score→rol.
- ~~Fase 2 requiere inspección real de `bootcampLLMs.md` / `BACKUP.md` / `module_maps.json`~~ RESUELTO (Phase 2): inspeccionado `module_maps.json`; el bootcamp cubre 4/5 dimensiones (fullstack es externo). Procedencia por pregunta anclada en consecuencia.
- ~~Fase 4 requiere investigación de umbrales junior/mid/senior por rol anclados a fuentes externas~~ RESUELTO (Phase 4): niveles anclados a marcos de leveling (dificultad) y perfiles de rol a descripciones de puesto 2026, documentado en 04-RESEARCH.md con fuentes.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | PACK-02 (packs adicionales de otros dominios) | Deferred | Roadmap v1 |
| v2 | RES-05 (resurfacing spaced-repetition) | Deferred | Roadmap v1 |

## Session Continuity

Last session: 2026-07-14T23:24:21.377Z
Stopped at: context exhaustion at 75% (2026-07-14)
Resume file: None
