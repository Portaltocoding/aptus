# Roadmap: Aptus

## Overview

Aptus se construye de dentro hacia fuera: primero un slice vertical mínimo pero real (banco pequeño → sesión select en terminal → motor de scoring puro → resultado básico con N), que demuestra de punta a punta que el núcleo motor/contenido/sesión funciona y que el scoring no miente. A partir de ahí, cada fase siguiente enriquece ese mismo slice sin romperlo: primero el banco crece hasta cubrir de verdad las cinco dimensiones curándolo desde `bootcamp-ml-llm`; después se añade la captura de confianza y la curva de calibración; después el resultado se convierte en una lectura honesta de readiness por rol contra baselines externas, con gaps y plan de estudio; después se añade persistencia para ver evolución entre sesiones. La integración con jobhunt cierra el roadmap como una capa opcional y aditiva que pondera prioridades sin introducir nunca un score único de "empleabilidad".

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fundamento end-to-end** - Banco mínimo real, motor de scoring puro, sesión select en terminal y resultado básico con N, de punta a punta.
- [x] **Phase 2: Banco completo desde bootcamp-ml-llm** - El banco crece hasta cubrir de verdad las 5 dimensiones, curado y anclado a fuentes externas, con rotación entre intentos.
- [ ] **Phase 3: Confianza y calibración** - Captura de confianza por pregunta y curva confianza-vs-acierto en el resultado.
- [ ] **Phase 4: Readiness por rol con baselines ancladas** - Lectura honesta de readiness junior/mid/senior por rol contra baselines externas, con gaps priorizados y plan de estudio.
- [ ] **Phase 5: Persistencia y evolución** - Sesiones guardadas localmente y vista de evolución entre sesiones.
- [ ] **Phase 6: Integración con jobhunt (opcional, aditiva)** - Ponderación de gaps por demanda real de mercado, con degradación elegante si jobhunt no está disponible.

## Phase Details

### Phase 1: Fundamento end-to-end

**Goal**: Carlos puede completar una sesión de test real por terminal sobre un banco mínimo (no simulado), y ver un resultado honesto por dimensión con N — validando de punta a punta que motor, contenido y sesión funcionan juntos antes de escalar el banco.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01, ENG-02, ENG-04, CONT-01, CONT-02, CONT-03, SESS-01, SESS-02, RES-01
**Success Criteria** (what must be TRUE):

  1. Carlos completa una sesión de test por terminal respondiendo enteramente con preguntas de opción múltiple (select), navegable, sobre un banco mínimo real (1-2 dimensiones) dimensionado para durar del orden de ≥15 minutos.
  2. El motor de scoring es una función pura sin I/O (testeada con fixtures vía vitest) que calcula la puntuación por dimensión/subtema a partir de aciertos/fallos, sin ningún conocimiento del dominio hardcodeado en el código.
  3. Al terminar la sesión, Carlos ve un desglose de resultado por dimensión con el N (número de preguntas) junto a cada score — nunca un score único agregado.
  4. El pack de contenido (banco de preguntas + metadata: tema, subtema, dificultad, rol, fuente, fecha) vive en ficheros YAML/JSON fuera del código, y un validador rechaza el pack antes de poder usarse en una sesión si falta metadata obligatoria o respuesta correcta.
  5. La selección de preguntas de la sesión reparte de forma equilibrada por dimensión, evitando que alguna dimensión quede con muestra insuficiente.

**Plans**: 5/5 plans executed

- [x] 01-01-PLAN.md — Andamiaje ESM + contrato zod del pack + PRNG determinista (wave 1)
- [x] 01-02-PLAN.md — Cargador + validador de contenido (YAML+zod, fail-fast) + fixtures (wave 2)
- [x] 01-03-PLAN.md — Motor de scoring puro + motor de sesión (selección equilibrada + navegación) (wave 2)
- [x] 01-04-PLAN.md — Pack real v1 (2 dimensiones, ≥24-30 preguntas reales) (wave 3)
- [x] 01-05-PLAN.md — CLI end-to-end: runner select navegable + render con N + subcomando start (wave 3)

### Phase 2: Banco completo desde bootcamp-ml-llm

**Goal**: Carlos puede completar una sesión real y sustancial que cubre de verdad las 5 dimensiones objetivo, sobre un banco curado y anclado a fuentes externas, con preguntas que rotan entre intentos para mitigar la memorización.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CONT-04, SESS-04
**Success Criteria** (what must be TRUE):

  1. Carlos puede completar una sesión que cubre las 5 dimensiones (LLM/RAG/evals, ML clásico, fullstack Next/Nest/TS, AI product & system design, comportamental STAR) con preguntas curadas y adaptadas desde `bootcamp-ml-llm` (`bootcampLLMs.md`, `BOOTCAMP-FACTORIAL-MASTER-ordered-answers.BACKUP.md`, `module_maps.json`) complementadas con fuentes externas para los temas no cubiertos.
  2. Cada pregunta del banco completo registra su fuente (bootcamp-ml-llm u externa) en la metadata, permitiendo auditar el sesgo de autocuración (curador = evaluado).
  3. El banco es sustancialmente mayor que lo que se muestra en una sola sesión, y dos intentos consecutivos no presentan exactamente el mismo set de preguntas.

**Plans**: 1/1 plans executed

- [x] 02-01-PLAN.md — Banco completo 5 dimensiones (bootcamp-ml-llm + externas), procedencia auditable (CONT-04) y rotación entre intentos (SESS-04)

### Phase 3: Confianza y calibración

**Goal**: Carlos puede indicar su nivel de confianza en cada respuesta y, al terminar, ver dónde se sobreestima frente a lo que realmente sabe.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SESS-03, RES-04
**Success Criteria** (what must be TRUE):

  1. Para cada pregunta, Carlos puede indicar su confianza (p.ej. baja/media/alta) sin que esto rompa el flujo select de la sesión.
  2. El resultado final incluye una curva/tabla confianza-vs-acierto que muestra en qué dimensiones o preguntas Carlos se sobreestima respecto a su desempeño real.

**Plans**: TBD

### Phase 4: Readiness por rol con baselines ancladas

**Goal**: Carlos recibe una lectura honesta de en qué nivel (junior/mid/senior-ready) está para cada rol objetivo (AI Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer), con gaps priorizados y un plan concreto por gap — sin ningún número único de "empleabilidad".
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ENG-03, CONT-05, RES-02, RES-03
**Success Criteria** (what must be TRUE):

  1. El resultado muestra, para cada rol objetivo, un nivel de readiness (junior/mid/senior-ready, o "evidencia insuficiente" si el N es bajo) derivado del % de preguntas etiquetadas por dificultad que se acierta frente a la baseline del rol — sin ajuste manual "a ojo" y sin ningún motor psicométrico IRT/CAT.
  2. Las baselines por rol/nivel están ancladas a fuentes externas documentadas (competency frameworks, job postings), no solo a la opinión de Carlos como curador.
  3. El resultado nunca colapsa en un score único agregado tipo "probabilidad de contratación" o "employability index"; siempre se presenta como matriz rol × dimensión.
  4. Carlos ve una lista de gaps priorizados ("te falta X, te falta Y") junto a un plan de estudio concreto por gap ("haz Z").

**Plans**: TBD

### Phase 5: Persistencia y evolución

**Goal**: Carlos puede ver cómo evoluciona su readiness entre sesiones a lo largo del tiempo, comprobando si sube sobre la baseline tras estudiar.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: PERS-01, PERS-02
**Success Criteria** (what must be TRUE):

  1. Cada sesión completada se guarda localmente sin intervención manual.
  2. Carlos puede consultar el historial de sesiones y ver la evolución de sus scores/readiness por dimensión y por rol entre sesiones sucesivas.

**Plans**: TBD

### Phase 6: Integración con jobhunt (opcional, aditiva)

**Goal**: Cuando existe el dataset de jobhunt, Aptus pondera la prioridad de los gaps de Carlos por la demanda real de mercado detectada en las ofertas escaneadas; cuando no existe, Aptus funciona exactamente igual sin esta capa.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: INTEG-01
**Success Criteria** (what must be TRUE):

  1. Si `~/workspace/jobhunt/data/jobs.db` existe, el resultado de gaps prioritarios de Carlos refleja qué dimensiones pide más el mercado real según las ofertas escaneadas por jobhunt.
  2. Si el fichero de jobhunt no existe o no es accesible, Aptus degrada con gracia: la sesión y el resultado funcionan exactamente igual, sin error ni bloqueo, simplemente sin la ponderación de mercado.
  3. El cruce con jobhunt nunca genera un score nuevo de "encaje" o "empleabilidad"; solo reordena/pondera la prioridad de los gaps ya calculados por el motor.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundamento end-to-end | 3/5 | In Progress|  |
| 2. Banco completo desde bootcamp-ml-llm | 0/TBD | Not started | - |
| 3. Confianza y calibración | 0/TBD | Not started | - |
| 4. Readiness por rol con baselines ancladas | 0/TBD | Not started | - |
| 5. Persistencia y evolución | 0/TBD | Not started | - |
| 6. Integración con jobhunt (opcional, aditiva) | 0/TBD | Not started | - |
