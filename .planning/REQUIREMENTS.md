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

## v2 — CERRADO (15 jul 2026)

Tema de v2: **multi-tema + banco grande + evaluación contra el mercado real**.

- [x] **PACK-02**: Multi-pack (ver abajo). Infra lista; currar packs nuevos ya no toca código.
- [x] **BANK-01**: Banco ~250 curado a mano. Hecho: **255 preguntas**, 5 dimensiones a 50+, todas con tramo `experto`, tipos concepto/diagrama/código/escenario.
- [x] **SEN-01**: Seniority hasta staff: 4 tramos de dificultad + `breadth` (amplitud en secundarias). Sin evidencia experto no hay staff.
- [x] **PACKFLOW-01**: Bucle asistido de creación de packs: `aptus new-pack` → fuentes en `sources/` → skill `build-pack` (Claude cura) → `aptus verify-pack` (auditPack: "curadas, no relleno").
- [x] **JD-01**: `aptus jd <fichero>` — readiness contra una oferta concreta. La JD se traduce a un ROL AD-HOC y se pasa por el motor de readiness de siempre. Sin score de encaje.
- [x] **JD-02**: Guardas de honestidad del JD: puntos ciegos (`tech-lexicon`), cobertura (ratio + densidad), requisito vs «valorable», menciones incidentales, keywords débiles, falsos amigos del seniority. Todas nacieron de un fallo observado, no de una teoría.
- [x] **RES-05**: `aptus review` — repaso espaciado (Leitner) de lo peor puntuado, aislado de la medición (`kind`).
- [x] **JOBS-01**: `aptus jobs` — escaneo en bloque de las 402 ofertas de jobhunt, agrupadas en cubos por veredicto. Solo lectura; no importa el scoring de jobhunt.
- [x] **INTEG-01** (opcional): Adaptador de solo lectura hacia jobhunt (`~/workspace/jobhunt/data/jobs.db`) para ponderar baselines/gaps por demanda real de mercado. Degradación elegante si no existe.
- [~] **PACK-02**: Packs adicionales de otros dominios (certificaciones, idiomas, etc.) — reutilizan el motor sin tocar código. **Infra lista (v2, 14 jul 2026)**: un pack es un directorio (`pack.yaml` + `questions/*.yaml`, `readiness.yaml` opcional), descubierto con `aptus packs` y elegido con `aptus start --pack <nombre>`; historial por pack. Crear packs concretos ya no requiere tocar código. Falta: currar packs de otros temas cuando se quieran.
- [x] **RES-05**: Resurfacing tipo spaced-repetition de los temas peor puntuados. **Hecho (v2, 15 jul 2026)**: `aptus review` — Leitner (5 cajas; acertar sube, fallar devuelve a la 1) sobre las respuestas crudas del historial. Modo ESTUDIO, no medición: la tanda carga hacia lo peor puntuado (al revés que `selectBalanced`), así que no da readiness ni gaps y se marca `kind: "review"` para que evolución, informe y `aptus jd` la ignoren.

## v3 — Diferido (abierto, sin fecha)

**Precondición de todo v3: una sesión de medición REAL.** A 15 jul 2026 no existe ninguna (`data/` vacío); todo lo verificado hasta ahora usó historiales sintéticos. Sin evidencia real, `jd`/`jobs`/`review` no producen nada y no se puede decidir nada de lo de abajo con criterio.

- [ ] **CALIB-01** (el interesante): comparar lo que tu CV AFIRMA (jobhunt/careerops, cv-trainer-mcp) con lo que DEMUESTRAS (aptus). Esa distancia es la señal más valiosa que puede dar ninguno de los tres sistemas, y hoy no la da nadie. Es la calibración confianza-vs-acierto de aptus, pero a nivel de carrera.
- [ ] **JD-03**: jubilar la extracción léxica. Los 6 umbrales (`CORE_RATIO`, `INCIDENTAL_SHARE`, `MIN_CORE_HITS`, `OPTIONAL_WEIGHT`, `LOW_DENSITY`, `MIN_COVERAGE`) + `weak_keywords` son el síntoma de pelear la batalla equivocada: leer prosa es lo que un LLM hace bien y contar palabras hace mal. Cada bug de las 402 ofertas reales ("product" ×14, "Mid-Market", "reporting to a Team Lead", "data science staff") fue la misma derrota. Arreglo propuesto: **el LLM lee, aptus mide** — la extracción pasa a ser CONTENIDO CURADO y auditable (mismo patrón que los packs: Claude cura → el tool verifica), no código en tiempo de ejecución. No rompe ENG-01: lo cacheado es contenido y el cálculo sobre él sigue siendo determinista.
- [~] **INTEG-02**: frontera entre los sistemas. **De tres a dos (15 jul 2026): `cv-trainer-mcp` RETIRADO.** Estaba duplicado en todos los ejes y no aportaba ninguno: su CV → `careerops/cv.md`; sus ofertas → `jobs.db`; su `analizar_contra_oferta` y su prep de entrevistas → careerops (A-F × 10 dimensiones); sus puntos ciegos/plan → los gaps de aptus, que además salen de evidencia y no de la opinión de un LLM sobre un CV. Lo que zanjó la decisión: **su carpeta `datos/` estaba VACÍA** — nunca se llegó a usar, así que no había nada que migrar. Desconectado de `mcpServers` en `~/.claude.json` (raíz: se cargaba en TODAS las sesiones, 37 herramientas de contexto para nada). El código sigue en `~/workspace/cv-trainer-mcp`: retirar ≠ borrar, y revertir es volver a pegar su entrada.
  - **Reparto que queda:** **jobhunt** = el mercado (descubrimiento con JobSpy, ranking, dashboard, evaluación LLM A-F, CVs a medida, tracker). **aptus** = el conocimiento (lo que demuestras, con evidencia y N). Sin solape.
  - **Reglas:** una fuente de verdad por hecho; aptus lee `jobs.db` pero NUNCA escribe; nadie promedia el 0-5 de jobhunt con el readiness de aptus (promediar una afirmación con una evidencia da un número sin significado); un solo plan de mejora.
- [ ] **RES-06**: research web bajo petición (el offline ya está: resumen + plan). Sigue siendo lo más vago de la lista; definir qué se espera antes de tocarlo.
- [ ] **PACKGEN-02**: generador in-tool con LLM (Enfoque B). Diferido a conciencia desde el 14 jul; el bucle asistido cubre el caso.
- [ ] **JOBS-02**: las 126 ofertas (31%) que no declaran seniority se caen de los cubos. Son evaluables (sabes qué alcanzarías para su perfil), solo que no hay objetivo con el que comparar. Probablemente lo resuelve JD-03.

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
