# Aptus

## What This Is

Aptus es un test de **aptitud técnica** por terminal para Carlos Portal (AI Product Engineer, Barcelona). Un CLI interactivo que, en una sesión de mínimo 15 minutos, plantea preguntas curadas tipo select sobre los temas de los roles a los que aplica (LLM/RAG/evals, ML clásico, fullstack Next.js/NestJS/TypeScript, AI product & system design, y comportamental STAR) y produce un **índice de aptitud honesto por rol**: en qué arquetipos está junior/mid/senior-ready, con sus gaps y un plan para cerrarlos.

## Core Value

Decirle con honestidad, **a nivel de conocimiento**, cómo de preparado está para cada rol (AI Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer), con gaps accionables. Si todo lo demás falla, esto debe medir bien y no mentir con una "probabilidad de contratación" inventada.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Test interactivo por terminal, **todo respondido con select** (opción múltiple), navegable, sesión de **≥15 min**.
- [ ] **Banco de preguntas MUY rico**: amplio y profundo, muchas dimensiones y subtemas, curadas con respuesta correcta real y explicación (no autoevaluación blanda), etiquetadas por tema, subtema, dificultad y rol.
- [ ] Cobertura de dimensiones: LLM/RAG/evals, ML clásico, fullstack (Next/Nest/TS), AI product & system design, comportamental (STAR), y subtemas dentro de cada una.
- [ ] **Baselines por rol y nivel**: definir perfiles de referencia (qué se espera saber para junior/mid/senior de cada arquetipo). El resultado del candidato se mide **contra estas baselines**, no en abstracto.
- [ ] **Scoring por dimensión/subtema** y agregación a **readiness por arquetipo de rol** (junior/mid/senior-ready), comparando contra la baseline correspondiente.
- [ ] **Resultado accionable**: radar/desglose por dimensión + readiness por rol + **"te falta X, te falta Y"** con gaps priorizados + **"tienes que hacer Z"** (plan de estudio concreto por gap).
- [ ] Persistencia de resultados para ver evolución entre sesiones (subir sobre la baseline con el tiempo).
- [ ] (Opcional) Cruce con las ofertas reales de jobhunt (`~/workspace/jobhunt`) para ponderar baselines/gaps por lo que el mercado pide de verdad.

### Out of Scope

- "Probabilidad de ser contratado" como número único — no es calibrable honestamente (depende de factores externos: competencia, timing, suerte). Se sustituye por readiness técnico por rol.
- Evaluación de código en vivo / ejecución de retos tipo LeetCode — v1 es preguntas select, no un IDE.
- Multiusuario / cuentas — es una herramienta personal de Carlos.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Readiness técnico por rol, no "probabilidad de contratación" | Un número de contratación sería falsamente preciso; el conocimiento sí se puede medir | — Pending |
| Preguntas select con respuesta correcta real, no autoevaluación | Calibrar conocimiento de verdad, evitar sesgo de autopercepción | — Pending |
| CLI por terminal, estética sobria | Preferencia del usuario; patrón afín al cuestionario nocturno de Vida que ya usa | — Pending |
| Cruce opcional con ofertas de jobhunt | Anclar el readiness en demanda real del mercado, no en opinión | — Pending |

## Context

- Usuario: Carlos Portal. CV y perfil en `~/workspace/jobhunt/careerops/cv.md` y `config/profile.yml`.
- Roles objetivo: AI Engineer, AI Product Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer (junior a senior).
- Proyecto hermano: `jobhunt` (descubrimiento + evaluación de ofertas). Aptus mide al candidato; jobhunt mide las ofertas.
- Ubicación prevista: `~/workspace/aptus`. Estética minimalista clásica sobria.

### Fuente de conocimiento para el banco de preguntas (CLAVE)
- Repo **`github.com/Portaltocoding/bootcamp-ml-llm`** — mina de conocimiento LLM/ML del propio Carlos:
  - `bootcampLLMs.md` / `bootcampLLMs.en.md` (~1,6 MB c/u): material de bootcamp LLM/ML.
  - `BOOTCAMP-FACTORIAL-MASTER-ordered-answers.BACKUP.md` (~1,6 MB): preguntas + respuestas ordenadas → base directa para curar el banco.
  - `module_maps.json` (~45 KB): mapa de módulos/temas → estructura de dimensiones/subtemas.
- Plan: en la fase de construcción del banco, importar/adaptar este material a preguntas select con respuesta correcta + explicación, etiquetadas por tema/subtema/dificultad/rol. Complementar con temas no cubiertos (fullstack Next/Nest, system design, STAR).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-14 after initialization*
