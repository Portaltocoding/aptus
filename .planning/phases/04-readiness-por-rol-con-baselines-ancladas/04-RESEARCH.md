# Phase 4 Research — Anclaje de readiness a fuentes externas (resuelve el flag CONT-05)

**Fecha:** 2026-07-14
**Flag resuelto:** "Los umbrales junior/mid/senior por rol deben anclarse a fuentes externas, no a la opinión del curador."

## Pregunta
¿De dónde salen (a) la definición de niveles junior/mid/senior y (b) qué dimensiones pesan por rol, sin inventárselo?

## Hallazgos

### Niveles (junior / mid / senior) → alcance, autonomía, profundidad
Los marcos de leveling de ingeniería coinciden: los niveles no se separan tanto por "más skill" como por **alcance, autonomía y profundidad**. Junior resuelve tareas acotadas con dirección; mid diseña features completas y se autodirige; senior tiene profundidad, refactoriza a escala y opera de forma independiente.

**Traducción al test (ancla ENG-03):** se mapea a la **dificultad etiquetada** de las preguntas. La barra sube por tramo al subir de nivel: junior = domina lo fundamental (easy); mid = además lo intermedio (medium); senior = además lo profundo (hard). La ESTRUCTURA (barra creciente por tramo) es el anclaje; los cortes numéricos son bandas convencionales y transparentes en `readiness.yaml`. Además, un nivel no se concede sin EVIDENCIA en el tramo que exige (no hay "senior-ready" sin preguntas difíciles respondidas).

Fuentes: levels.fyi (SWE level framework), em-tools.io (engineering levels guide), altexsoft (junior/middle/senior), sprad.io (IC1–IC6 competency matrix).

### Perfiles de rol → qué dimensiones pesan
- **AI Engineer**: intersección SWE + ML + LLM. Núcleo: LLM app dev (prompting, tool calling, structured outputs) + RAG + bases de ML (métricas, overfitting, validación). (DataCamp, Scaler)
- **LLM Engineer**: adaptar/orquestar/servir LLMs pre-entrenados; prompting, tool calling, RAG, LLMOps. NO entrenar desde cero. (KDnuggets)
- **ML Engineer**: Python, algoritmos ML, math/stats, model eval, MLOps; en 2026 también LLM/RAG. (doit.software, DataCamp)
- **Full Stack Engineer**: TS/React/Python, features completas + system design (DDD, microservicios, event-driven) + LLM calling. (min.io, Jobgether)
- **AI Product Engineer**: product sense + full-stack + LLM + envío end-to-end + comunicación/influencia. (zenvanriel)

Se codifican en `readiness.yaml` como `core`/`secondary` por rol, con el campo `source` citando la referencia.

## Decisión de diseño
- Baselines y perfiles viven en `packs/ai-ml-readiness/readiness.yaml` (datos, no código), validados por zod (fail-fast).
- El motor de readiness es puro y no conoce los strings del dominio: recibe la config validada.
- Nunca un score único de "empleabilidad": readiness POR ROL con la evidencia por dificultad y su N a la vista.

## Fuentes
- https://www.levels.fyi/blog/swe-level-framework.html
- https://www.em-tools.io/frameworks/engineering-levels
- https://www.altexsoft.com/blog/software-engineer-qualification-levels-junior-middle-and-senior/
- https://www.datacamp.com/blog/essential-ai-engineer-skills
- https://www.scaler.com/topics/ai-engineer-skills-2026-checklist-hiring-teams-want/
- https://www.kdnuggets.com/the-roadmap-to-becoming-an-llm-engineer-in-2026
- https://doit.software/blog/machine-learning-engineer-skills
- https://www.min.io/blog/the-full-stack-ai-engineer-a-modern-day-polymath
- https://zenvanriel.com/ai-engineer-blog/ai-product-engineer-career-path-guide/
