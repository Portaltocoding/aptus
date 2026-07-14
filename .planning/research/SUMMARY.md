# Project Research Summary

**Project:** Aptus
**Domain:** CLI interactivo de test de aptitud técnica, motor genérico + packs de conocimiento intercambiables (primer pack: readiness técnico AI/ML para empleo)
**Researched:** 2026-07-14
**Confidence:** MEDIUM-HIGH

## Executive Summary

Aptus es un motor genérico de evaluación de aptitud por terminal, data-driven por packs de conocimiento (banco de preguntas + baselines + arquetipos de rol en YAML). El primer pack — readiness técnico de Carlos para empleo AI/ML — es el caso de uso que valida el concepto, pero la arquitectura debe separar desde el día 1 el **núcleo genérico** (selección de sesión, scoring por dimensión, agregación a readiness, persistencia) de **el contenido del pack** (preguntas, mapa rol→dimensión, recursos de estudio), de forma que futuros packs (certificaciones, idiomas) reutilicen el motor sin tocar código TypeScript. Esta separación motor/contenido es la decisión arquitectónica más importante y determina el orden del roadmap: el motor y su scoring deben construirse y probarse con datos de fixture antes de que el primer pack esté completo, y el primer pack debe construirse antes de cualquier UI pulida.

El stack recomendado es TypeScript/Node 26 con `@inquirer/prompts` (o `@clack/prompts` para el envoltorio) para los prompts select, `node:sqlite` (nativo, sin dependencias compiladas) para persistencia, `zod` para validar el contenido YAML del pack, y `picocolors`/`cli-table3`/`boxen` para una presentación sobria en terminal. El motor de scoring debe ser lógica pura (funciones deterministas, sin I/O), testeada con `vitest`, porque es el componente que sostiene la promesa de honestidad del Core Value: "medir bien y no mentir". Esta priorización — núcleo antes que interfaz — es la conclusión más consistente entre STACK, ARCHITECTURE y PITFALLS: el riesgo del proyecto no está en que la terminal sea bonita, sino en que el scoring sea honesto y bien calibrado.

El riesgo dominante identificado en PITFALLS es que Carlos es a la vez curador del banco y evaluado (self-serving item bias): sin anclar la cobertura de preguntas a fuentes externas (job postings reales, el propio repo `bootcamp-ml-llm`, documentación oficial), el test corre el riesgo de confirmar lo que Carlos ya cree de sí mismo en vez de medirlo. A este riesgo se suman otros cuatro que amenazan directamente el Core Value de honestidad: mostrar un score inflado sin techo real, mapear score→nivel de rol de forma arbitraria, reintroducir por la puerta de atrás la "probabilidad de contratación" ya descartada (como score único agregado), y mostrar porcentajes de precisión falsa sin indicar el tamaño de muestra (N) que los sostiene. Estos cinco riesgos deben convertirse en quality gates explícitos y verificables en cada fase que toque scoring, agregación o presentación de resultados — no son detalles de implementación, son condiciones de aceptación del propio Core Value del proyecto.

## Key Findings

### Recommended Stack

TypeScript sobre Node.js 26.x es la elección clara: el usuario domina TS/Node, ya tiene tooling y convenciones reutilizables en el proyecto hermano `jobhunt/careerops`, y el ecosistema de prompts de terminal en npm está más maduro y mejor tipado que sus equivalentes Python. `node:sqlite` (nativo, Release Candidate estable en Node 26) elimina una dependencia compilada frágil frente a `better-sqlite3`. Confianza alta en las decisiones de dominio (lenguaje, runtime), media en versiones muy recientes (TypeScript 7, GA hace apenas días — usar `tsx`/esbuild para ejecución evita depender de su API programática aún inestable).

**Core technologies:**
- **TypeScript + Node.js ≥22.13 (dev en 26.x)** — dominado por el usuario, ecosistema CLI/TUI maduro en npm, `node:sqlite` estable en esta versión.
- **`@inquirer/prompts`** (con `@clack/prompts` opcional para el envoltorio visual) — estándar de facto para prompts select navegables, tipado nativo TS.
- **`node:sqlite`** — persistencia nativa sin dependencias compiladas, suficiente para un solo usuario sin concurrencia.
- **`zod`** — validación del schema del pack de contenido (preguntas, roles) al cargar, reutilizando el patrón ya usado en `jobhunt`.
- **`picocolors` + `cli-table3` + `boxen`** — presentación sobria en terminal (14x más ligero que `chalk`); construir el "radar" con barras/tablas, no con paquetes de radar-chart casi sin mantenimiento (`terminal-charter` tiene ~1 descarga/semana — evitar).
- **`vitest`** — testing del motor de scoring, la lógica de negocio más crítica del proyecto.

### Expected Features

**Must have (table stakes) — v1:**
- Banco de preguntas curado con respuesta correcta objetiva y explicación (no autoevaluación blanda).
- Metadata completa por pregunta: dimensión, dificultad, rol(es), respuesta correcta, explicación.
- Runner select en terminal, navegable, sesión ≥15 min con progreso visible.
- Scoring por dimensión (no solo % global), agregación ponderada.
- Mapeo a readiness por arquetipo de rol vía rúbrica explícita y documentada.
- Resultado final: desglose por dimensión + readiness por rol + top gaps + plan de estudio.
- Persistencia local de sesiones (condición para "evolución").

**Should have (diferenciadores) — v1.x, tras validar el núcleo:**
- Evolución/tendencia entre sesiones por dimensión.
- Captura de confianza previa + curva de calibración confianza-vs-acierto (ataca Dunning-Kruger).
- Resurfacing tipo spaced-repetition de temas débiles.
- Visualización radar en terminal (barras/bloques unicode, no librerías de radar sin mantenimiento).

**Defer (v2+):**
- Dificultad adaptativa ligera (heurística tipo Elo, no IRT/CAT completo).
- Ponderación por demanda real de mercado (cruce con `jobhunt`).
- Recalibración empírica de dificultad por ítem (requiere volumen de intentos que v1 no tendrá).
- Ampliación del banco vía pipeline de autoría asistida por LLM con revisión humana.

**Anti-features explícitas (nunca construir):** IRT/CAT completo (banco demasiado pequeño para calibrar), "probabilidad de contratación" como número único, evaluación de código en vivo tipo LeetCode, multiusuario/leaderboard, gamificación de rachas/badges, timer agresivo por pregunta, generación de preguntas on-the-fly con LLM en tiempo de test, certificado exportable/compartible.

### Architecture Approach

Arquitectura en capas con separación estricta contenido/núcleo/I/O: el **contenido del pack** (banco de preguntas YAML, mapa rol→dimensión, recursos de estudio) vive fuera del código TypeScript, cargado y validado con `zod` en runtime; el **núcleo** (motor de sesión + motor de scoring) es lógica pura sin I/O, testeable con fixtures, y es deliberadamente el primer componente a construir porque sostiene la promesa de "no mentir"; la **capa de terminal** (prompts, render de resultados) solo presenta lo que el núcleo ya calculó, nunca deriva ni ajusta scores; la **persistencia** vive detrás de una interfaz mínima (`saveSession`/`listSessions`) agnóstica del motor de almacenamiento; y la **integración opcional con jobhunt** es un adaptador de solo lectura, aislado, que degrada con gracia si el fichero no existe.

**Major components:**
1. **Cargador/validador de pack de contenido** — carga YAML, valida con zod, falla rápido con mensajes claros si el contenido está mal formado.
2. **Motor de sesión** — selección de preguntas (cobertura balanceada por dimensión), orden, navegación, timing; lógica pura.
3. **Motor de scoring** — función determinista `(answers, bank, rolesMap) → ScoreResult`; el componente más crítico del proyecto, sin ningún I/O.
4. **Capa de prompts + render de resultados** — I/O de terminal puro, sin lógica de negocio.
5. **Persistencia** — historial de sesiones en SQLite local, interfaz mínima desacoplada del motor.
6. **Integración jobhunt (opcional)** — adaptador de solo lectura a `jobs.db`, único punto de contacto, nunca obligatorio.

**Orden de construcción recomendado** (de ARCHITECTURE.md, explícito y accionable): (1) banco de preguntas + schema + cargador, empezando con 1-2 dimensiones; (2) motor de scoring puro, testeado con fixtures antes que ningún terminal real; (3) motor de sesión; (4) capa de prompts interactivos (primer punto "usable" de punta a punta); (5) render de resultados; (6) persistencia (en paralelo a 4-5); (7) integración jobhunt, al final, por ser aditiva y opcional.

### Critical Pitfalls

1. **Sesgo de autocuración (curador = evaluado)** — Carlos escribe y responde el mismo banco; sin fuentes externas (job postings, `bootcamp-ml-llm`, docs oficiales), el test confirma su autoimagen en vez de medirla. Mitigación: versionar la fuente de cada pregunta, separar temporalmente curación de evaluación, auditar temas con >90% de aciertos sistemáticos.
2. **Scoring que no calibra (grade inflation)** — sin anclas externas de dificultad, el score tiende a inflarse artificialmente. Mitigación: incluir preguntas de calibración (muy fáciles y muy difíciles), reportar con banda de incertidumbre, nunca dar crédito parcial en preguntas select.
3. **Mapeo arbitrario score→nivel de rol** — umbrales junior/mid/senior fijados a ojo reintroducen la "probabilidad de contratación" disfrazada. Mitigación: derivar el readiness de qué % de preguntas etiquetadas por nivel se acierta (etiqueta en origen, no ajuste post-hoc), y marcar "evidencia insuficiente" cuando el N sea bajo.
4. **Muestra insuficiente presentada como precisión falsa** — con pocas preguntas por dimensión en una sesión de 15 min, mostrar "62%" sin N es engañoso. Mitigación obligatoria: mostrar siempre N junto a cualquier porcentaje o radar; usar bandas cualitativas si N es bajo.
5. **"Probabilidad de contratación" disfrazada** — cualquier score único agregado (match %, employability index) hereda el problema que el proyecto ya descartó explícitamente. Mitigación: el resultado final debe ser siempre matriz (rol × dimensión × gaps), nunca un número colapsado; cualquier cruce con jobhunt pondera prioridad de gaps, no genera un score nuevo.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Núcleo del motor genérico (scoring puro + carga/validación de contenido)
**Rationale:** Es el componente que sostiene el Core Value ("medir bien y no mentir"); debe construirse y testearse con fixtures antes que ninguna UI, y antes de que el pack esté completo, para separar de raíz motor genérico de contenido de pack.
**Delivers:** Cargador/validador de pack (zod + YAML) genérico + motor de scoring como función pura, testeado con `vitest` usando fixtures mínimas (1-2 dimensiones).
**Addresses:** Scoring por dimensión, mapeo a readiness por rol vía rúbrica explícita (table stakes de FEATURES.md).
**Avoids:** Pitfall 3 (scoring que no calibra), Pitfall 4 (mapeo arbitrario a nivel de rol) — deben resolverse aquí, con umbrales derivados de dificultad etiquetada en origen, no ajustados a ojo.

### Phase 2: Pack de conocimiento v1 — curación del banco (readiness AI/ML)
**Rationale:** El motor genérico no tiene nada que hacer sin un pack real; esta fase produce el primer pack completo, anclado a fuentes externas (repo `bootcamp-ml-llm` de Carlos + job postings) para evitar el sesgo de autocuración desde el origen.
**Delivers:** Banco de preguntas curado (LLM/RAG/evals, ML clásico, fullstack, AI product/system design, comportamental STAR) con metadata completa (tema, subtema, dificultad, rol, fuente, fecha), importado/adaptado de `bootcampLLMs.md`, `BOOTCAMP-FACTORIAL-MASTER-ordered-answers.BACKUP.md` y `module_maps.json`, complementado con temas no cubiertos (fullstack Next/Nest, system design, STAR). Mapa rol→dimensión (`roles.yaml`).
**Addresses:** Banco curado con metadata, cobertura de las 5 dimensiones (table stakes de FEATURES.md).
**Avoids:** Pitfall 1 (sesgo de autocuración — checklist de fuente externa por pregunta), Pitfall 2 (preguntas ambiguas — justificación de una frase por pregunta), Pitfall 6 (gaming por memorización — banco sustancialmente mayor que lo mostrado por sesión).

### Phase 3: Motor de sesión + capa de terminal (runner interactivo)
**Rationale:** Solo tiene sentido conectar el motor a un terminal real una vez el scoring (Fase 1) y el contenido (Fase 2) están validados; es el primer punto donde el CLI es usable de punta a punta.
**Delivers:** Selección de preguntas por bandas de dificultad fijas, navegación con `@inquirer/prompts`, sesión ≥15 min con progreso visible.
**Uses:** `@inquirer/prompts`, `cli-progress`, `picocolors` (STACK.md).
**Implements:** Motor de sesión + capa de prompts (ARCHITECTURE.md).

### Phase 4: Resultado final + persistencia
**Rationale:** El render de resultados consume la salida ya validada del motor de scoring; la persistencia solo depende de la forma del `SessionScore` ya definida, así que pueden construirse en paralelo.
**Delivers:** Desglose por dimensión con N visible, readiness por rol, top gaps priorizados, plan de estudio rule-based; persistencia de sesiones en `node:sqlite`.
**Addresses:** Resultado accionable, persistencia entre sesiones (table stakes de FEATURES.md).
**Avoids:** Pitfall 7 (muestra insuficiente — N obligatorio junto a cada score), Pitfall 8 (probabilidad de contratación disfrazada — nunca un número único agregado; checklist de scope en cada revisión de esta fase).

### Phase 5 (opcional, futuro): Integración con jobhunt
**Rationale:** Aditiva y ortogonal — el sistema ya es completo y útil sin ella; construirla antes arriesgaría acoplar Aptus a un schema externo cambiante prematuramente.
**Delivers:** Adaptador de solo lectura a `jobs.db` para ponderar prioridad de gaps por demanda real de mercado.
**Avoids:** Pitfall 8 (el cruce pondera gaps, nunca genera un score nuevo de "encaje").

### Phase Ordering Rationale

- El orden refleja la dependencia real de datos: no se puede testear scoring sin banco de fixture, no se puede construir UI útil sin scoring validado, no se puede mostrar evolución sin persistencia definida.
- Motor (Fases 1 y 2) antes que interfaz (Fase 3): una UI mal pulida es barata de rehacer; un scoring mal diseñado contamina todo el historial persistido después (conclusión explícita de ARCHITECTURE.md).
- La separación motor genérico / pack de conocimiento (decisión clave de PROJECT.md) se refleja en que Fase 1 (núcleo) y Fase 2 (contenido del pack) son fases distintas con entregables distintos, aunque ambas sean prerequisito de Fase 3 — esto es lo que permite que un futuro pack (v2) reutilice el motor sin retrabajar Fase 1.
- Los pitfalls críticos (1, 3, 4, 7, 8) están todos mapeados a una fase concreta en PITFALLS.md; el roadmap debe convertir cada uno en un criterio de verificación explícito de esa fase, no dejarlos como advertencia genérica.

### Research Flags

Phases likely needing deeper research during planning:
- **Fase 2 (curación del banco):** el proceso de extraer/adaptar preguntas desde `bootcampLLMs.md` y el `BACKUP.md` (~1.6MB cada uno) a un formato de pregunta select con distractores plausibles no está resuelto en esta investigación — requiere explorar el contenido real de esos ficheros durante la planificación de la fase.
- **Fase 1 (rúbrica de mapeo score→rol):** la definición concreta de qué separa junior/mid/senior por dimensión, anclada a fuentes externas reales (no solo intuición), necesita investigación específica de competency frameworks aplicados a los roles objetivo de Carlos (AI Engineer, LLM Engineer, ML Engineer, Fullstack, Product Engineer).

Phases with standard patterns (skip research-phase):
- **Fase 3 (motor de sesión + terminal):** patrones de CLI interactivo con `@inquirer/prompts` están bien documentados y verificados en STACK.md/ARCHITECTURE.md.
- **Fase 4 (persistencia):** `node:sqlite` y el patrón de interfaz mínima están bien establecidos, sin incertidumbre relevante.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versiones verificadas en vivo contra npm registry; único punto de incertidumbre real es TypeScript 7 (GA hace días, API programática estable pendiente hasta 7.1) |
| Features | MEDIUM | Síntesis sólida de patrones de assessment/psicometría bien establecidos, pero sin datos propietarios de conversión/retención de plataformas similares |
| Architecture | MEDIUM | Patrones de capas (contenido/núcleo/I/O) son principios de ingeniería consolidados (alta confianza); elección de librerías concretas basada en búsqueda web sin verificación cruzada exhaustiva (confianza media) |
| Pitfalls | MEDIUM-HIGH | Literatura psicométrica bien establecida y muy citada (Dunning-Kruger, item banking); los pitfalls específicos del caso "curador=evaluado, un solo usuario" son extrapolación razonada, no casos documentados directamente |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Formato exacto de extracción del banco desde `bootcamp-ml-llm`:** no se ha inspeccionado el contenido real de `bootcampLLMs.md` / `BACKUP.md` / `module_maps.json`; la fase de curación debe empezar leyendo esos ficheros para decidir el proceso de conversión a preguntas select.
- **Umbrales concretos junior/mid/senior por rol:** ninguna fuente da una definición operativa lista para usar; deben derivarse durante la Fase 1/2 a partir de la dificultad etiquetada por pregunta y, si es posible, de job postings reales.
- **TypeScript 7 vs 6:** validar en el arranque del proyecto si el tooling (`@typescript-eslint`) tiene fricción con TS 7; si la hay, fijar `typescript@^6.0.3` como red de seguridad sin bloquear el resto del stack.
- **Tamaño mínimo viable del banco por dimensión:** PITFALLS sugiere >15-20 preguntas por dimensión para mitigar memorización (Pitfall 6) y precisión estadística (Pitfall 7), pero el número exacto para el pack v1 debe decidirse en la Fase 2 según el volumen real disponible en las fuentes de Carlos.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, verificado en vivo 2026-07-14) — versiones exactas de todo el stack recomendado.
- npmjs.org downloads API — salud/popularidad de paquetes (confirma abandono de `terminal-charter`, adopción masiva de `@inquirer/prompts` y `picocolors`).
- Inspección directa de `~/workspace/jobhunt/data/jobs.db` (tabla `jobs`) — schema real para el adaptador de integración opcional.
- Estudios académicos sobre efecto Dunning-Kruger en autoevaluación (biorxiv, PMC) — bien replicados, alta confianza.

### Secondary (MEDIUM confidence)
- nodejs.org/api/sqlite.html, endoflife.date/nodejs — estado de estabilidad de `node:sqlite` por versión.
- Comparativas cualitativas cruzadas (@inquirer/prompts vs @clack/prompts, picocolors vs chalk, better-sqlite3 vs node:sqlite) — múltiples fuentes independientes coinciden.
- Literatura de item banking / credentialing psicométrico (ResearchGate, PMC) — aplicada por extrapolación razonada al caso de un solo usuario.
- Competency frameworks de ingeniería (Sprad, Full Scale) — base para la rúbrica de readiness por rol, no específicos de AI/ML.

### Tertiary (LOW confidence)
- TypeScript 7 GA (2026-07-08) — feature muy reciente, sin track record largo; confirmar fricción de tooling durante Fase 1.
- Pitfalls 1, 6 y 8 (self-serving bias, gaming por memorización, reintroducción de score de contratación) — razonamiento específico del proyecto, no casos documentados externamente; tratar como análisis razonado de confianza media, no hecho verificado.

---
*Research completed: 2026-07-14*
*Ready for roadmap: yes*
