# Aptus — Requirements

Motor genérico de evaluación de aptitud por terminal + packs de conocimiento. Primer pack: readiness técnico de empleo (AI/ML/LLM/fullstack/product).

## v1 Requirements

### Engine (motor genérico, agnóstico del contenido)

- [x] **ENG-01**: El motor de scoring es una función pura (sin I/O ni terminal), testeable con fixtures.
- [x] **ENG-02**: El motor calcula puntuación por dimensión y subtema a partir de respuestas correctas/incorrectas.
- [x] **ENG-03**: El motor mapea puntuaciones a readiness por arquetipo de rol (junior/mid/senior-ready) comparando contra la baseline del pack, con umbrales anclados a la dificultad etiquetada de las preguntas (no ajuste "a ojo").
- [x] **ENG-04**: El motor es agnóstico del dominio: no contiene conocimiento hardcodeado; todo el contenido vive en el pack.

### Content (packs de conocimiento)

- [x] **CONT-01**: Un pack se define en ficheros de datos (YAML/JSON) fuera del código: banco de preguntas + baselines + arquetipos de rol.
- [x] **CONT-02**: Cada pregunta tiene: enunciado, opciones select, respuesta(s) correcta(s), explicación, y metadata (tema, subtema, dificultad, rol, fuente, fecha).
- [x] **CONT-03**: Un validador comprueba la integridad del pack (schema, respuesta correcta presente, metadata obligatoria) antes de usarlo.
- [x] **CONT-04**: El pack v1 (readiness AI/ML) se cura a partir de `bootcamp-ml-llm` (bootcampLLMs.md, ordered-answers, module_maps.json) + fuentes externas, cubriendo LLM/RAG/evals, ML clásico, fullstack (Next/Nest/TS), AI product & system design y comportamental (STAR).
- [x] **CONT-05**: Las baselines por rol/nivel se anclan a fuentes externas (competency frameworks, job postings), no solo a la opinión del curador.

### Session (runner interactivo por terminal)

- [x] **SESS-01**: El usuario responde todas las preguntas con **select** (opción múltiple), navegable, en una sesión de **≥15 min**.
- [x] **SESS-02**: El motor de sesión selecciona preguntas equilibradas por dimensión y evita muestra insuficiente por dimensión.
- [x] **SESS-03**: El usuario puede indicar su **confianza** por pregunta (para la curva confianza-vs-acierto que combate el autoengaño).
- [x] **SESS-04**: La sesión rota preguntas entre intentos para mitigar memorización.

### Result (resultado accionable)

- [x] **RES-01**: El resultado muestra desglose por dimensión con el **N (nº de preguntas)** junto a cada score.
- [x] **RES-02**: El resultado da readiness por rol (junior/mid/senior-ready) contra baseline, **sin** un score único agregado de "empleabilidad".
- [x] **RES-03**: El resultado lista **gaps priorizados** ("te falta X, te falta Y") y un **plan concreto** por gap ("haz Z").
- [x] **RES-04**: El resultado muestra la curva confianza-vs-acierto (dónde te sobreestimas).

### Persistence

- [x] **PERS-01**: Los resultados de cada sesión se guardan localmente.
- [x] **PERS-02**: El usuario puede ver la evolución entre sesiones (subir sobre la baseline con el tiempo).

## v2 / Deferred

- [x] **INTEG-01** (opcional): Adaptador de solo lectura hacia jobhunt (`~/workspace/jobhunt/data/jobs.db`) para ponderar baselines/gaps por demanda real de mercado. Degradación elegante si no existe.
- [~] **PACK-02**: Packs adicionales de otros dominios (certificaciones, idiomas, etc.) — reutilizan el motor sin tocar código. **Infra lista (v2, 14 jul 2026)**: un pack es un directorio (`pack.yaml` + `questions/*.yaml`, `readiness.yaml` opcional), descubierto con `aptus packs` y elegido con `aptus start --pack <nombre>`; historial por pack. Crear packs concretos ya no requiere tocar código. Falta: currar packs de otros temas cuando se quieran.
- [ ] **RES-05**: Resurfacing tipo spaced-repetition de los temas peor puntuados.

## Out of Scope

- **Probabilidad de ser contratado** como número único — no calibrable; sustituido por readiness técnico por rol. Vigilar que no reaparezca disfrazado (match %, employability index).
- **Motor psicométrico IRT/CAT completo** — requiere cientos de respuestas por ítem; con banco de un usuario daría falsa precisión.
- **Evaluación de código en vivo / retos tipo LeetCode** — v1 es select, no un IDE.
- **Multiusuario / web / social** — herramienta personal de terminal.
- **Generación de preguntas por LLM en tiempo real** — rompe la garantía de respuesta correcta curada.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Complete |
| ENG-02 | Phase 1 | Complete |
| ENG-04 | Phase 1 | Complete |
| CONT-01 | Phase 1 | Complete |
| CONT-02 | Phase 1 | Complete |
| CONT-03 | Phase 1 | Complete |
| SESS-01 | Phase 1 | Complete |
| SESS-02 | Phase 1 | Complete |
| RES-01 | Phase 1 | Complete |
| CONT-04 | Phase 2 | Complete |
| SESS-04 | Phase 2 | Complete |
| SESS-03 | Phase 3 | Complete |
| RES-04 | Phase 3 | Complete |
| ENG-03 | Phase 4 | Complete |
| CONT-05 | Phase 4 | Complete |
| RES-02 | Phase 4 | Complete |
| RES-03 | Phase 4 | Complete |
| PERS-01 | Phase 5 | Complete |
| PERS-02 | Phase 5 | Complete |
| INTEG-01 (v2, opcional) | Phase 6 | Complete |

**Cobertura v1:** 19/19 requisitos mapeados (100%). No hay huérfanos.
