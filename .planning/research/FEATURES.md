# Feature Research

**Domain:** Test de aptitud técnica / skill assessment CLI (evaluación personal, no contratación masiva)
**Researched:** 2026-07-14
**Confidence:** MEDIUM (síntesis de patrones de producto bien establecidos en assessment técnico, psicometría y spaced-repetition; sin acceso a datos propietarios de conversión/retención de esas plataformas)

## Feature Landscape

### Table Stakes (Users Expect These)

Funciones que el propio Core Value de Aptus exige. Sin ellas, el producto "miente" o se siente incompleto.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Banco de preguntas curado con respuesta correcta objetiva (no autoevaluación) | Es el requisito no negociable del proyecto: medir conocimiento real, no percepción. Sin esto, Aptus es un cuestionario de humor, no un test de aptitud | MEDIUM | Autoría manual/curada offline; nunca generar la pregunta-y-respuesta en tiempo real para el test-taker (ver anti-features) |
| Metadata por pregunta: tema/dimensión, dificultad, rol(es) aplicable(s), respuesta correcta, explicación | Sin metadata estructurada no se puede agregar el score por dimensión ni mapear a readiness por rol; la explicación post-respuesta es lo que convierte el test en herramienta de aprendizaje, no solo de medición | LOW-MEDIUM | Modelo de datos simple (YAML/JSON por pregunta); explicación es tan importante como la pregunta misma |
| UI de selección múltiple navegable en terminal | Es el formato explícito decidido en PROJECT.md; debe sentirse fluido (teclado, sin fricción) en una sesión de ≥15 min | LOW | Librerías TUI estándar (inquirer, prompts, blessed, ink) cubren esto sin esfuerzo de investigación adicional |
| Scoring por dimensión (no solo % global) | El Core Value es "gaps accionables por dimensión", un score único no lo permite | LOW-MEDIUM | Agregación ponderada simple (ver STACK/ARCHITECTURE); no requiere IRT para ser honesto |
| Mapeo de score a readiness por arquetipo de rol (junior/mid/senior-ready) vía rúbrica explícita | Es el core value literal del proyecto; sin una rúbrica transparente, el "readiness" es tan inventado como la "probabilidad de contratación" que el proyecto rechaza explícitamente | MEDIUM | Rúbrica basada en competency frameworks reales (progresión por alcance de responsabilidad y profundidad, no solo % de aciertos) — ver sección Sources |
| Resultado final con desglose por dimensión + readiness por rol + top gaps + plan de estudio | Requisito explícito de PROJECT.md; es lo que hace el test accionable en vez de un simple "aprobado/suspendido" | MEDIUM | El plan de estudio puede ser rule-based (mapa tema→recurso) en v1, no requiere IA generativa |
| Persistencia local de resultados entre sesiones | Requisito explícito; sin esto no hay "evolución" que mostrar | LOW | SQLite o JSON append-only es suficiente para un solo usuario |
| Explicación de la respuesta correcta tras cada pregunta o al final | Estándar en cualquier assessment con vocación formativa (no solo de medición); sin ella el test no enseña, solo puntúa | LOW | Puede diferirse a fin de sesión para no romper el ritmo, pero debe existir |
| Control de duración/ritmo de sesión (≥15 min, nº de preguntas visible) | Evita sesiones que se sienten arbitrariamente largas o cortas; da sensación de "test serio" con principio y fin | LOW | Contador de progreso simple (pregunta X de N) es suficiente, no requiere timer agresivo |

### Differentiators (Competitive Advantage)

Funciones que no son obligatorias para que el producto funcione, pero que atacan directamente el riesgo #1 del dominio: la autoevaluación blanda y el sesgo Dunning-Kruger.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Captura de confianza previa a revelar la respuesta ("¿cómo de seguro estás?") + curva de calibración confianza-vs-acierto | Ataca directamente el efecto Dunning-Kruger: en el estudio de referencia, el cuartil de menor conocimiento estimó un 68.6% de aciertos frente a un 23.1% real. Mostrar esa brecha es un diferenciador de honestidad que ningún quiz de opción múltiple simple ofrece | MEDIUM | Un input extra (alta/media/baja confianza) por pregunta; el valor está en el informe final, no en la mecánica |
| Evolución/tendencia entre sesiones por dimensión (¿mejoro en RAG pero empeoro en system design?) | Es la única forma de que "readiness" no sea una foto fija; permite validar si el plan de estudio funcionó | MEDIUM | Requiere histórico persistido y comparación entre runs; depende de Persistencia (table stakes) |
| Resurfacing tipo repetición espaciada de temas/dimensiones débiles entre sesiones | Patrón validado en Anki/SM-2: repasar con más frecuencia lo que peor se domina acelera el cierre de gaps reales, no solo la sensación de progreso | MEDIUM | No requiere el algoritmo SM-2 completo; basta con ponderar la probabilidad de aparición de un tema por su score histórico |
| Visualización tipo radar en terminal (ASCII/unicode) por dimensión | Comunica de un vistazo el perfil de fortalezas/debilidades; refuerzo visual del Core Value ("honesto y accionable") | LOW-MEDIUM | Unicode block characters o barras horizontales son suficientes; no requiere gráficos complejos |
| Selección de dificultad "adaptativa ligera" dentro de la sesión (heurística tipo Elo, no IRT completo) | Evita que preguntas triviales o imposibles desperdicien los 15 minutos; mantiene la señal informativa alta sin la sobrecarga de calibración de IRT real | MEDIUM-HIGH | Ver Anti-Features: IRT/CAT completo requiere cientos de respuestas por ítem para calibrar, inviable con un banco pequeño de un solo usuario. Una heurística simple (subir/bajar banda de dificultad tras N aciertos/fallos seguidos) da el 80% del valor con mucho menos esfuerzo |
| Preguntas STAR comportamentales como "mejor respuesta" de opción múltiple con rúbrica de calidad | Mantiene el formato "select" pero cubre la dimensión comportamental sin abrir la puerta a texto libre difícil de puntuar objetivamente | MEDIUM | Requiere diseño cuidadoso de distractores plausibles (ver PITFALLS); la rúbrica de "qué hace buena una respuesta STAR" debe ser explícita en la metadata de la pregunta |
| Ponderación por demanda real de mercado (cruce opcional con ofertas de `jobhunt`) | Ancla el readiness en lo que el mercado pide ahora mismo, no solo en una taxonomía estática de rol | HIGH | Opcional explícito en PROJECT.md; depende de acceso a datos de jobhunt y de un mapeo tema-de-pregunta ↔ requisito-de-oferta que no es trivial |
| Recalibración empírica de la dificultad de cada ítem con el histórico propio | Con suficientes sesiones acumuladas, el propio historial de aciertos/fallos por pregunta permite ajustar su dificultad etiquetada sin depender de calibración externa | HIGH | Solo tiene valor una vez hay volumen de intentos por ítem (no en v1 con un solo usuario y pocas rondas); es la versión "casera" de la calibración IRT, coherente con population n=1 |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| IRT/CAT (Computerized Adaptive Testing) completo con estimación de parámetros de dificultad/discriminación/adivinanza | Suena "más riguroso" y es lo que usan los tests estandarizados serios | La calibración IRT tradicional requiere cientos de respuestas por ítem para ser fiable; con un banco pequeño y un solo usuario, los parámetros estimados serían ruido, no señal — falsa precisión, justo lo que el proyecto quiere evitar | Bandas de dificultad fijas etiquetadas por el autor del banco + heurística ligera de ajuste dentro de sesión (ver Differentiators); revisar manualmente qué preguntas resultan "mal calibradas" con el uso |
| "Probabilidad de ser contratado" como número único | Es la pregunta que de verdad importa al usuario y muchos productos de hiring lo prometen | Depende de factores no medibles por un test de conocimiento (competencia, timing, sesgo del entrevistador, suerte); es precisión falsa — **explícitamente fuera de alcance en PROJECT.md** | Readiness técnico por arquetipo de rol con rúbrica transparente y gaps accionables |
| Evaluación de código en vivo / reto tipo LeetCode con juez automático | Es lo que usan HackerRank/CodeSignal/Codility y se percibe como "más real" | Es un producto completamente distinto (sandbox de ejecución, test cases, anti-cheat); v1 es sobre conocimiento conceptual vía preguntas select, no sobre destreza de código en vivo — **explícitamente fuera de alcance en PROJECT.md** | Preguntas conceptuales/de diseño de sistema en formato select que evalúan comprensión, no autoría de código |
| Multiusuario, cuentas, leaderboard o comparación social | Patrón estándar en apps de assessment/gamificación | Rompe el propósito de herramienta personal de auto-diagnóstico honesto; introduce presión social que puede sesgar hacia performar en vez de medir con precisión — **explícitamente fuera de alcance en PROJECT.md** | Comparación solo contra el propio histórico (evolución entre sesiones) |
| Gamificación de rachas/badges/puntos de vanidad | Aumenta engagement en apps de hábito (Duolingo, Anki plugins) | Incentiva completar sesiones por la racha, no por cerrar gaps reales; puede maquillar un score débil con una sensación de progreso falsa, contrario al Core Value de honestidad | Mantener el foco en la tendencia de score por dimensión; si se quiere reforzar el hábito, un simple contador de sesiones sin premiar cantidad sobre calidad |
| Timer agresivo por pregunta (cuenta atrás tipo assessment de contratación) | Common en plataformas de screening para simular presión real de entrevista | Aptus mide *conocimiento*, no *velocidad bajo presión*; un timer por pregunta contamina la señal y puede penalizar reflexión genuina sobre preguntas de diseño/system design que merecen pensarse | Límite blando de duración total de sesión (≥15 min) sin cronómetro visible por pregunta |
| Generación de preguntas on-the-fly con un LLM en tiempo de test | Escala el banco "gratis" y parece atractivo dado que el proyecto ya vive en el ecosistema LLM/AI | Rompe la garantía de "respuesta correcta real" — un LLM puede alucinar la clave correcta o los distractores, exactamente el problema de autoevaluación blanda que el proyecto quiere evitar | Banco curado estático; como mucho, usar LLM como *asistente de autoría offline* con revisión humana antes de que la pregunta entre al banco versionado |
| Certificado/insignia exportable o compartible ("compártelo en LinkedIn") | Common en plataformas de assessment orientadas a candidatos que buscan validación externa | Introduce incentivo a inflar el resultado percibido y desvía el propósito (auto-diagnóstico honesto) hacia señal social; también es una superficie de mantenimiento (diseño, formato) sin relación con el Core Value | Ninguno en v1; si en el futuro se quiere compartir, exportar como texto/markdown plano sin pretensión de credencial |

## Feature Dependencies

```
Banco de preguntas curado con metadata
    └──requires──> Modelo de datos por pregunta (tema, dificultad, rol, respuesta, explicación)

Scoring por dimensión
    └──requires──> Banco de preguntas curado con metadata
                       └──requires──> (rol y tema etiquetados correctamente)

Readiness por arquetipo de rol
    └──requires──> Scoring por dimensión
                       └──requires──> Rúbrica de mapeo score→nivel (junior/mid/senior) por rol

Top gaps + plan de estudio
    └──requires──> Scoring por dimensión
                       └──requires──> (identificar dimensiones/temas bajo umbral)

Resultado final (radar + readiness + gaps + plan)
    └──requires──> Scoring por dimensión
    └──requires──> Readiness por arquetipo de rol
    └──requires──> Top gaps + plan de estudio

Evolución entre sesiones
    └──requires──> Persistencia local de resultados
                       └──requires──> Resultado final calculado por sesión

Resurfacing tipo spaced-repetition
    └──requires──> Evolución entre sesiones (histórico por dimensión/tema)
    └──requires──> Persistencia local con histórico a nivel de pregunta/tema

Curva de calibración confianza-vs-acierto
    └──requires──> Captura de confianza por pregunta (UI adicional en el flujo de respuesta)

Recalibración empírica de dificultad por ítem
    └──requires──> Persistencia con histórico por ítem individual
    └──requires──> Volumen suficiente de intentos por pregunta (no disponible en v1)

Selección de dificultad adaptativa ligera dentro de sesión
    └──requires──> Bandas de dificultad ya etiquetadas en el banco (table stakes)
    └──enhances──> Uso eficiente de los ≥15 min de sesión

Ponderación por demanda de mercado (jobhunt)
    └──requires──> Mapeo tema-de-pregunta ↔ requisito-de-oferta de jobhunt
    └──conflicts──> Simplicidad de la rúbrica de readiness estática (introduce una segunda fuente de verdad móvil)

IRT/CAT completo ──conflicts──> Banco pequeño de un solo usuario
    (la calibración estadística rigurosa requiere volumen de datos que este producto, por diseño, no tendrá)
```

### Dependency Notes

- **Scoring por dimensión requiere Banco con metadata correcta:** si el tema/rol/dificultad de una pregunta está mal etiquetado, todo lo que se construye encima (readiness, gaps, plan) hereda el error. La calidad de la metadata es el cuello de botella real del proyecto, no la lógica de agregación.
- **Readiness por rol requiere una rúbrica explícita, no solo un umbral de %:** copiar el patrón de competency frameworks reales (progresión por alcance, no solo volumen de aciertos) es lo que separa "readiness honesto" de "% disfrazado de nivel".
- **Evolución entre sesiones requiere Persistencia, y a su vez habilita Resurfacing:** son features en cadena; no tiene sentido priorizar resurfacing sin tener aún histórico que mostrar.
- **IRT/CAT completo conflicts con el tamaño del proyecto:** es la anti-feature más importante a documentar porque es la que más "suena bien" técnicamente y más fácil es sobre-invertir en ella. La heurística ligera de dificultad adaptativa da la mayor parte del valor con una fracción del coste, y es compatible con banco pequeño.
- **Ponderación por mercado (jobhunt) conflicts parcialmente con la simplicidad de la rúbrica:** introducir una fuente de verdad externa y cambiante (ofertas de trabajo) puede hacer que el mismo score arroje distinto readiness en momentos distintos, lo cual hay que comunicar con cuidado si se implementa (ver PITFALLS).

## MVP Definition

### Launch With (v1)

Mínimo para validar que el instrumento de medición es honesto y útil.

- [ ] Runner de test en terminal, formato select, sesión de ≥15 min con progreso visible — es el vehículo mínimo de la experiencia
- [ ] Banco de preguntas curado inicial (cobertura real, aunque no exhaustiva, de las 5 dimensiones) con metadata completa: tema, dificultad, rol(es), respuesta correcta, explicación — sin esto no hay nada que medir
- [ ] Selección de preguntas por bandas de dificultad fijas (no adaptativa) — suficiente para v1, evita sobre-invertir en heurísticas antes de tener datos reales de uso
- [ ] Scoring por dimensión con agregación ponderada — es el core value técnico
- [ ] Mapeo a readiness por arquetipo de rol vía rúbrica explícita y documentada — es el core value del producto
- [ ] Resultado final: desglose por dimensión + readiness por rol + top gaps + plan de estudio (rule-based) — el output completo que pide PROJECT.md
- [ ] Persistencia local de cada sesión (SQLite/JSON) — condición necesaria para "evolución"

### Add After Validation (v1.x)

Se añaden una vez el v1 demuestra que el scoring y la rúbrica se sienten honestos y accionables en uso real.

- [ ] Vista de evolución/tendencia entre sesiones por dimensión — trigger: haber acumulado ≥2-3 sesiones reales y querer saber si el plan de estudio funcionó
- [ ] Captura de confianza por pregunta + curva de calibración confianza-vs-acierto — trigger: sospecha (propia o detectada en resultados) de que el usuario sobreestima ciertas dimensiones
- [ ] Resurfacing tipo spaced-repetition de temas débiles — trigger: histórico suficiente para saber qué temas arrastran score bajo de forma persistente
- [ ] Visualización radar en terminal — trigger: el desglose tabular por dimensión se siente insuficiente para "ver" el perfil de un vistazo

### Future Consideration (v2+)

Diferir hasta que el instrumento base esté validado como fiable y útil.

- [ ] Selección de dificultad adaptativa ligera dentro de sesión — diferir porque añade complejidad de lógica antes de saber si las bandas fijas ya son suficientes
- [ ] Ponderación por demanda real de mercado (integración con jobhunt) — diferir porque depende de un mapeo tema↔oferta no trivial y de que jobhunt tenga datos estables que cruzar
- [ ] Recalibración empírica de dificultad por ítem con histórico propio — diferir porque requiere volumen de intentos por pregunta que solo existirá tras mucho uso
- [ ] Ampliación del banco vía pipeline de autoría asistida por LLM con revisión humana offline — diferir porque el banco inicial curado manualmente ya cubre la validación del concepto; escalar el banco es un problema de v2, no de v1

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Banco curado con metadata completa | HIGH | MEDIUM | P1 |
| Runner select en terminal, ≥15 min | HIGH | LOW | P1 |
| Scoring por dimensión ponderado | HIGH | LOW-MEDIUM | P1 |
| Readiness por rol vía rúbrica | HIGH | MEDIUM | P1 |
| Resultado final (radar/gaps/plan) | HIGH | MEDIUM | P1 |
| Persistencia local de sesiones | HIGH | LOW | P1 |
| Evolución/tendencia entre sesiones | MEDIUM | MEDIUM | P2 |
| Captura de confianza + calibración | MEDIUM | MEDIUM | P2 |
| Resurfacing spaced-repetition | MEDIUM | MEDIUM | P2 |
| Radar visual en terminal | LOW-MEDIUM | LOW-MEDIUM | P2 |
| Dificultad adaptativa ligera (Elo-lite) | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| Ponderación por mercado (jobhunt) | MEDIUM | HIGH | P3 |
| Recalibración empírica por ítem | LOW | HIGH | P3 |
| IRT/CAT completo | LOW (para n=1 usuario) | HIGH | No construir |

**Priority key:**
- P1: Imprescindible para lanzar v1
- P2: Deseable, añadir cuando el core esté validado
- P3: Nice to have, considerar en v2+ si el instrumento base demuestra ser fiable

## Competitor Feature Analysis

| Feature | HackerRank / CodeSignal (hiring) | Anki / SM-2 (spaced repetition) | Aptus (nuestro enfoque) |
|---------|-----------------------------------|----------------------------------|---------------------------|
| Banco de preguntas | Miles de preguntas, filtrables por skill/dificultad, mantenidas por equipo profesional | Tarjetas creadas por el propio usuario o decks compartidos | Banco curado pequeño y propio (decenas-centenas), calidad sobre cantidad, con metadata rica por pregunta |
| Calibración de dificultad | Validación psicométrica con equipos de I/O psychology (CodeSignal) o etiquetado editorial (HackerRank) | Ease factor por tarjeta ajustado empíricamente con el uso (SM-2) | Bandas fijas etiquetadas manualmente en v1; recalibración empírica solo en v2+ cuando haya volumen |
| Adaptación de dificultad | Filtrado de assessment por nivel objetivo, no adaptativo dentro de la prueba en la mayoría de casos | Intervalo de repaso adaptativo por tarjeta según acierto/fallo | Heurística ligera opcional (v2+); no IRT/CAT completo por tamaño de banco |
| Scoring | Score agregado y comparativo contra benchmark de otros candidatos | No hay "score" de aptitud, solo progreso de memorización | Score por dimensión + readiness por rol vía rúbrica explícita, sin comparación social |
| Objetivo del producto | Filtrar candidatos para terceros (empleador) | Maximizar retención de memoria a largo plazo | Auto-diagnóstico honesto de un individuo para sí mismo, con plan de cierre de gaps |
| Salida/reporte | Informe de resultados para el reclutador, percentiles | Estadísticas de retención y forecast de repaso | Radar/gaps/plan de estudio dirigido al propio usuario, con foco en accionabilidad, no en comparación |

## Sources

- [Adaptive Testing for LLM Evaluation: A Psychometric Alternative to Static Benchmarks (arXiv)](https://arxiv.org/html/2511.04689v2) — MEDIUM confidence
- [The irtQ R package: item response theory-based calibration (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11561393/) — MEDIUM confidence
- [On-the-fly parameter estimation in item-based adaptive learning systems (Springer)](https://link.springer.com/article/10.3758/s13428-022-01953-x) — MEDIUM confidence
- [HackerRank vs CodeSignal comparison (SelectHub)](https://www.selecthub.com/technical-assessment-tools/hackerrank-vs-codesignal/) — MEDIUM confidence
- [CodeSignal Technical Assessments](https://codesignal.com/technical-assessments/) — MEDIUM confidence
- [Dunning-Kruger Effect in Skill Assessment (JobCannon)](https://jobcannon.io/blog/dunning-kruger-effect-self-assessment) — MEDIUM confidence
- [Prevalence of Dunning-Kruger effect in medical students (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11515314/) — MEDIUM confidence
- [Software Engineer Skill Matrix & Competency Framework IC1-IC6 (Sprad)](https://sprad.io/resources/software-engineer-skill-matrix-competency-framework-by-level-ic1-ic6-behaviors-examples-template-3914c) — MEDIUM confidence
- [Engineering Competency Matrix (Full Scale)](https://fullscale.io/blog/engineering-competency-matrix/) — MEDIUM confidence
- [Anki Algorithm Explained: How Spaced Repetition Works](https://www.growexx.com/blog/anki-algorithm-explained-how-spaced-repetition-works/) — MEDIUM confidence
- Contexto interno: `/home/portal/workspace/aptus/.planning/PROJECT.md` (requisitos y decisiones ya validadas por el usuario)

---
*Feature research for: Test de aptitud técnica CLI (Aptus)*
*Researched: 2026-07-14*
