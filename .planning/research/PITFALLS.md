# Pitfalls Research

**Domain:** Technical skill self-assessment tool (CLI, objective quizzing, role-readiness scoring)
**Researched:** 2026-07-14
**Confidence:** MEDIUM-HIGH (psychometric theory is well-established literature; application to a single-user CLI tool is reasoned extrapolation, not found as a documented case study)

Aptus's stated core risk is **honestidad y calibración**: no debe dar una falsa sensación de preparación ni un número inventado. Todos los pitfalls de abajo están ordenados por cuánto amenazan directamente esa promesa.

## Critical Pitfalls

### Pitfall 1: El curador y el evaluado son la misma persona (self-serving item bias)

**What goes wrong:**
Carlos escribe (o supervisa/aprueba con ayuda de un LLM) el banco de preguntas que luego se hace a sí mismo. Sin darse cuenta, el banco tiende a sesgarse hacia temas que ya domina (preguntas "fáciles" percibidas como representativas) o hacia temas que quiere reforzar en vez de los que el mercado realmente exige. El resultado es un test que confirma lo que ya cree de sí mismo en vez de medirlo objetivamente. Esto es el pitfall más peligroso del proyecto porque ataca directamente la promesa de honestidad — un test que el mismo sujeto diseña no es independiente, aunque las preguntas tengan respuesta objetivamente correcta.

**Why it happens:**
No hay una tercera parte que cure el banco. Cuando alguien redacta sus propias preguntas de examen, elige inconscientemente el framing, los distractores y la cobertura de temas en los que se siente cómodo (o en los que quiere quedar bien delante de sí mismo). Es un conflicto de interés estructural, no un fallo de carácter.

**How to avoid:**
- Anclar la cobertura de temas a fuentes externas, no a la memoria de Carlos: job descriptions reales (cruce con `jobhunt`), syllabi de certificaciones reconocidas, documentación oficial de las tecnologías del stack objetivo.
- Generar el banco inicial con ayuda de LLM a partir de esas fuentes externas, y versionar la fuente de cada pregunta (de qué job post / doc / paper viene) para poder auditar sesgo de cobertura después.
- Revisar la distribución de dificultad y de temas del banco *antes* de resolver ninguna pregunta uno mismo (separar fase de curación de fase de evaluación en el tiempo).
- Periódicamente, medir qué % de preguntas acierta por tema; si un tema tiene 100% de aciertos sistemáticos, es señal de que el banco en ese tema es "cómodo" y necesita preguntas más exigentes o más recientes.

**Warning signs:**
- El score global sube sesión tras sesión sin que haya habido estudio real de por medio (indica memorización de preguntas o banco autoindulgente, ver Pitfall 6).
- Ciertos temas/dimensiones nunca bajan de 90% de aciertos.
- Las preguntas "difíciles" concentradas en temas donde Carlos ya sabe que es fuerte, y ausentes en temas donde sabe que es débil.

**Phase to address:**
Fase de diseño del banco de preguntas (curación), antes de construir el motor de scoring. Debe ser la primera fase técnica, con un checklist de fuente externa por pregunta.

---

### Pitfall 2: Preguntas ambiguas o con respuesta "correcta" discutible

**What goes wrong:**
Preguntas tipo select donde más de una opción es defendible según el contexto (versión de librería, convención de equipo, "depende"), o donde la opción marcada como correcta está desactualizada o es simplificación excesiva de un tema matizado (común en ML/LLM donde "depende del caso de uso" es a menudo la respuesta real). El resultado: el score mide la capacidad de adivinar la intención del autor de la pregunta, no el conocimiento del dominio.

**Why it happens:**
Escribir buenos distractores (opciones incorrectas plausibles) es más difícil que escribir la pregunta. Los dominios de este proyecto (LLM/RAG, ML, fullstack, system design) tienen mucha zona gris legítima donde "la mejor práctica" cambia con contexto y con el tiempo.

**How to avoid:**
- Cada pregunta debe llevar una nota de justificación breve de por qué la opción marcada es correcta y por qué las otras no lo son — si no se puede escribir esa justificación en una frase, la pregunta no está lista.
- Preferir preguntas ancladas a hechos verificables (comportamiento documentado de una API, definición estándar, resultado de un cálculo) sobre preguntas de "mejor práctica" u opinión, especialmente en dimensiones de sistema/producto donde el juicio es más subjetivo.
- Para las preguntas de diseño/juicio (system design, comportamental STAR) considerar rúbricas de múltiples niveles de calidad en vez de una única opción "correcta" binaria — de lo contrario ese tipo de pregunta arrastra ruido al resto del scoring.
- Pase de revisión: releer cada pregunta unas semanas después de escribirla, sin ver la respuesta marcada, para ver si sigue siendo obvia cuál es correcta.

**Warning signs:**
- Dudas al resolver una pregunta propia ("bueno, depende...") — si el autor duda, la pregunta es ambigua.
- Preguntas donde la respuesta correcta depende de una versión de librería o de un cambio reciente no explicitado en el enunciado.
- Distractores que son claramente absurdos (la pregunta se vuelve trivial por eliminación, no por conocimiento real).

**Phase to address:**
Fase de curación del banco de preguntas, con revisión explícita antes de marcar el banco como "v1 listo".

---

### Pitfall 3: Scoring que no calibra — todo sale alto (grade inflation / techo)

**What goes wrong:**
El sistema de puntuación tiende sistemáticamente a resultados altos: por redondeo generoso, por dar crédito parcial demasiado fácil, por un banco con preguntas mayoritariamente fáciles, o porque no hay penalización por adivinar. El usuario termina viendo "80% senior-ready" cuando la realidad es más débil — justo la falsa sensación de preparación que el proyecto quiere evitar explícitamente.

**Why it happens:**
Es la trampa por defecto de casi cualquier score design: sin un ancla externa (¿qué % real corresponde a "senior-ready"?), es fácil que el diseñador ajuste umbrales para que el resultado "se sienta bien" o para que valide su autoimagen (conecta con Pitfall 1).

**How to avoid:**
- No inventar los umbrales de junior/mid/senior a partir de intuición: derivarlos de la dificultad real de las preguntas (una pregunta "nivel senior" debe estar etiquetada así porque un junior típico falla, no porque suene difícil) y ajustarlos con datos según se acumulen sesiones.
- Incluir preguntas trampa/calibración: alguna pregunta deliberadamente fácil (para verificar que el usuario no está adivinando al azar sistemáticamente) y alguna deliberadamente muy difícil / de vanguardia (para evitar techo, que nadie la acierte "de churro").
- Reportar el score con banda de incertidumbre, no un número puntual — un 15 min test con pocas preguntas por dimensión no soporta precisión de punto decimal.
- Evitar crédito parcial generoso en preguntas select de opción única: es correcto o no lo es.
- Revisar la distribución de dificultad del banco: si el 80% de las preguntas son "fáciles", el techo estará artificialmente alto sin que el diseño lo pretenda.

**Warning signs:**
- El score medio a través de sesiones repetidas es consistentemente >85% en cualquier dimensión.
- Ninguna pregunta del banco tiene una tasa histórica de acierto <50%.
- El usuario "se siente cómodo" mirando el resultado — un test honesto sobre gaps duele un poco.

**Phase to address:**
Fase de diseño del motor de scoring, en paralelo con la curación del banco (los umbrales de dificultad se definen ahí). Debe verificarse contra el banco real antes de construir el mapeo a roles.

---

### Pitfall 4: Mapeo arbitrario de score a niveles junior/mid/senior

**What goes wrong:**
Se define "score < 40% = junior, 40-70% = mid, >70% = senior" (o similar) sin ninguna base real de qué separa esos niveles en el mercado. El "readiness por rol" — la feature central del producto — se vuelve un número con apariencia de rigor pero sin fundamento, exactamente el mismo problema que "probabilidad de contratación" que el proyecto ya decidió evitar, solo que reintroducido por la puerta de atrás con otro nombre.

**Why it happens:**
No existe una definición universal de "mid-level engineer" — varía por empresa, y el propio equipo de contratación suele discrepar sobre dónde está la barrera. Sin datos externos de qué preguntas separan realmente a un junior de un senior en la práctica, cualquier umbral es una construcción del autor del test.

**How to avoid:**
- Etiquetar la dificultad de cada pregunta individual en origen (junior / mid / senior) basándose en de dónde viene la pregunta (ej. una pregunta sacada de un job posting "senior" o de una entrevista real reportada a ese nivel), no ajustar umbrales de score al final para que cuadren.
- El readiness por rol se deriva de qué % de preguntas etiquetadas "mid" o "senior" en esa dimensión acierta el usuario — no de un corte arbitrario sobre el score total.
- Usar el cruce opcional con `jobhunt` (ofertas reales) como ancla adicional: si las ofertas de nivel "mid" para AI Engineer piden X, Y, Z, y el usuario falla sistemáticamente X, eso es evidencia concreta de gap de nivel, más defendible que un porcentaje abstracto.
- Presentar el resultado como "gaps concretos identificados a nivel X" en vez de un veredicto binario "eres/no eres mid-ready" — el valor está en la lista de gaps, el nivel es una etiqueta orientativa encima.
- Ser explícito en la UI/reporte sobre la incertidumbre: "con este banco de preguntas, tu evidencia apunta a X, pero esto no es una garantía de nivel de mercado."

**Warning signs:**
- Los umbrales de nivel se decidieron mirando qué resultado "sonaba razonable" para el propio Carlos, en vez de derivarse de la dificultad etiquetada de las preguntas.
- No hay trazabilidad de por qué una pregunta se etiquetó "senior" (¿de dónde salió esa clasificación?).
- El resultado final se parece demasiado a la "probabilidad de contratación" que el proyecto decidió explícitamente no construir.

**Phase to address:**
Fase de agregación / mapeo a arquetipos de rol — debe ser una fase separada y posterior a scoring por dimensión, con su propia validación explícita contra el requirement "Out of Scope" del PROJECT.md.

---

### Pitfall 5: Banco de preguntas que envejece, especialmente en LLM/RAG

**What goes wrong:**
Las dimensiones LLM/RAG/evals y AI product & system design cambian de "mejor práctica" cada pocos meses (nuevos modelos, nuevos frameworks de evals, protocolos como MCP, cambios de API). Una pregunta correcta hoy puede tener una respuesta "correcta" obsoleta en 6 meses, y el usuario puede fallarla no por falta de conocimiento sino porque la pregunta asume un estado del mundo que ya no existe — o al revés, puede acertarla de memoria sin entender el concepto subyacente porque ya se la sabe de sesiones anteriores.

**Why it happens:**
Escribir un banco de preguntas es trabajo puntual; el dominio no es estático. Sin un proceso explícito de revisión, el banco se congela en el estado del mundo del día en que se escribió.

**How to avoid:**
- Etiquetar cada pregunta con la fecha/versión de la fuente que la sustenta y una fecha de "revisar antes de".
- Priorizar preguntas de conceptos estables (fundamentos de attention, trade-offs de RAG, teoría de embeddings) sobre preguntas de API/herramienta específica volátil, especialmente en LLM/RAG — las preguntas de "qué hace el parámetro X de la librería Y" caducan rápido.
- Cuando sí se testeen herramientas/APIs concretas (razonable para fullstack Next/Nest), anclarlas a la versión que Carlos usa realmente en el mercado objetivo actual, y revisar el banco cada vez que se actualice el stack de referencia.
- Separar el banco en "núcleo estable" (revisar cada 6-12 meses) y "frontera" (revisar antes de cada sesión de examen, dado el ritmo del espacio LLM).

**Warning signs:**
- Una pregunta de LLM/RAG hace referencia a un modelo, versión de API o framework que ya no se usa en el mercado.
- Fallar una pregunta y, al revisar la respuesta correcta, la razón sea "eso cambió" en vez de "no lo sabía".
- El banco no tiene metadata de fecha de creación/última revisión por pregunta.

**Phase to address:**
Fase de mantenimiento del banco de preguntas (post-v1) — pero el *hook* para que esto sea posible (metadata de fecha/fuente por pregunta) debe construirse desde la fase de curación inicial, no añadirse después.

---

### Pitfall 6: Gaming del test por memorización entre sesiones (auto-trampa)

**What goes wrong:**
Aptus está pensado para persistir resultados y ver evolución entre sesiones — pero es el mismo usuario resolviendo el mismo banco de preguntas repetidamente. Si el banco es finito y estático, la segunda vez que se hace el test el usuario recuerda parcialmente las preguntas y sus respuestas correctas, no porque haya estudiado el concepto sino porque memorizó el examen. La "evolución" que se reporta entre sesiones queda contaminada: parte de la mejora es aprendizaje real, parte es memorización del test en sí, y no hay forma de distinguirlas.

**Why it happens:**
Es la variante de un solo usuario del problema clásico de "item exposure" en testing repetido (el mismo problema que motiva los bancos grandes y la aleatorización en certificaciones profesionales), pero aquí es más agudo porque no hay una población grande entre la que rotar preguntas — solo un usuario que repite.

**How to avoid:**
- Banco de preguntas sustancialmente mayor que lo que se muestra por sesión, con selección aleatoria de subconjunto por dimensión en cada sesión (no repetir el mismo set).
- Versionar/agrupar preguntas en "pools" por tema y rotar qué pool se usa en cada sesión, de forma que una sesión no reutilice preguntas de la sesión inmediatamente anterior sobre el mismo tema.
- Al reportar evolución entre sesiones, mostrar también qué % de preguntas eran repetidas vs. nuevas, para que la comparación sea honesta sobre su propia limitación.
- Aceptar que con un banco pequeño (v1) la comparación entre sesiones cercanas en el tiempo (días/semanas) es poco fiable; ser explícito en el reporte de que la evolución es más significativa a escala de meses, cuando el conocimiento real pudo cambiar más que la memoria del test.

**Warning signs:**
- El usuario reconoce preguntas específicas al releerlas en la siguiente sesión.
- La mejora de sesión a sesión es más rápida que el tiempo de estudio real invertido entre medias.
- El banco tiene pocas preguntas por dimensión (p. ej. <15-20) respecto al número que se muestra por sesión.

**Phase to address:**
Fase de diseño del banco de preguntas (tamaño y estructura de pools) y fase de persistencia/evolución — ambas deben coordinar este punto, ya que el problema surge en la intersección de las dos features.

---

### Pitfall 7: Muestra insuficiente para concluir con la precisión que se muestra

**What goes wrong:**
Una sesión de ~15 minutos repartida entre 5 dimensiones (LLM/RAG, ML clásico, fullstack, AI product/system design, comportamental) implica pocas preguntas por dimensión — probablemente de un dígito. Con tan pocas observaciones, un resultado como "62% en ML clásico" tiene un margen de error enorme (una sola pregunta más acertada o fallada puede mover el % varios puntos), pero si se presenta como un número limpio (o peor, en un radar chart preciso), transmite una falsa sensación de precisión estadística que no existe.

**Why it happens:**
Los radares y porcentajes son visualmente atractivos y dan sensación de rigor, pero ocultan el tamaño de muestra subyacente. Es fácil olvidar, al construir la visualización, que "7 de 10 preguntas" y "70%" no deberían tratarse con la misma confianza que "700 de 1000".

**How to avoid:**
- Mostrar siempre el N (número de preguntas) junto a cualquier porcentaje o posición en el radar — "7/10 en ML clásico", no solo "70%".
- Para dimensiones con muy pocas preguntas, usar bandas cualitativas (bajo/medio/alto) en vez de porcentajes de precisión falsa, o mostrar explícitamente un intervalo ("60-80% probable, con este N").
- Considerar acumular evidencia entre sesiones por dimensión (banco de historial por tema) en vez de resetear la confianza cada sesión — el "readiness" real se calibra mejor con acumulado histórico que con una sola sesión de 15 min.
- No mapear a nivel de rol (junior/mid/senior) con menos de un mínimo razonable de preguntas por dimensión — si no hay suficientes, el reporte debe decir explícitamente "evidencia insuficiente" en vez de forzar una etiqueta.

**Warning signs:**
- Cualquier dimensión con menos de ~8-10 preguntas por sesión mostrando un porcentaje con decimales.
- El radar chart se ve "completo y confiado" pese a que alguna dimensión tuvo 3 preguntas.
- No hay ningún indicador de tamaño de muestra visible en el resultado final.

**Phase to address:**
Fase de diseño del resultado final (radar + desglose + reporte) — debe construirse con el N visible desde el primer diseño de la UI de resultados, no añadirse como parche después.

---

### Pitfall 8: Reintroducir "probabilidad de contratación" disfrazada

**What goes wrong:**
El proyecto ya decidió explícitamente no dar una "probabilidad de contratación" porque no es calibrable (depende de competencia, timing, suerte). El riesgo es que esa métrica reaparezca con otro nombre: un "score de empleabilidad", un "match %" agregado con las ofertas de `jobhunt`, o un único número final que combine las 5 dimensiones en un solo "readiness general" — cualquiera de estos hereda el mismo problema de falsa precisión si se presenta como una cifra única y accionable de decisión de contratación.

**Why it happens:**
Hay presión natural de UX hacia "dame un solo número al final" porque es más fácil de consumir que un desglose por dimensión y rol. Esa presión de simplicidad puede reintroducir exactamente lo que se decidió evitar, sobre todo si se cruza con datos de `jobhunt` (que sí incluyen señales de mercado) de forma que el resultado combinado *parezca* una probabilidad de éxito en la búsqueda de empleo.

**How to avoid:**
- Mantener el resultado final estructurado como matriz (rol x dimensión x gaps), nunca colapsado a un único número global.
- Si se cruza con `jobhunt`, el cruce debe usarse para *ponderar qué gaps importan más* (priorización), no para producir un score combinado de "posibilidades de conseguir el puesto".
- Revisar cualquier nueva feature de "resumen" o "score general" contra el requirement Out of Scope del PROJECT.md antes de construirla.

**Warning signs:**
- Aparece en el diseño un campo llamado "score general", "match %", "employability index" o similar que agrega todo en un número.
- El resultado final cabe en una sola cifra destacada en vez de un desglose.

**Phase to address:**
Fase de diseño del resultado final / reporte — es una verificación de scope, no de implementación técnica; debe revisarse en cada fase que toque la presentación de resultados.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Banco de preguntas pequeño en v1 (10-15 por dimensión) | Lanzar rápido, validar el flujo del CLI | Memorización entre sesiones (Pitfall 6), poca precisión estadística (Pitfall 7) | Solo en v1 para validar UX, con aviso explícito de "banco reducido" en el resultado |
| Umbrales junior/mid/senior fijados a mano por intuición | Rápido, no requiere datos | Mapeo arbitrario (Pitfall 4), erosiona la honestidad del readiness | Nunca como versión final; aceptable como placeholder explícitamente marcado "sin calibrar" |
| Preguntas generadas por LLM sin revisión humana individual | Banco grande rápido | Respuestas "correctas" erróneas o ambiguas (Pitfall 2), alucinaciones en temas de frontera LLM/RAG | Solo como borrador; cada pregunta debe pasar revisión humana antes de entrar al banco activo |
| Un solo score agregado en vez de desglose por dimensión | UI más simple | Reintroduce probabilidad de contratación disfrazada (Pitfall 8) | Nunca — es un anti-requirement explícito del proyecto |
| Reutilizar exactamente el mismo set de preguntas cada sesión | Simplicidad de implementación | Gaming por memorización (Pitfall 6) | Solo en la primera sesión de baseline; debe rotar a partir de la segunda |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|-----------------|-------------------|
| Cruce con `jobhunt` (ofertas reales) | Usar el cruce para producir un score combinado de "encaje con el mercado" que se lee como probabilidad de contratación | Usar el cruce solo para *priorizar qué gaps importan más* según demanda real, mantenerlo como ponderación de gaps, no como score nuevo |
| Persistencia local de resultados | Guardar solo el score final por sesión, perdiendo qué preguntas concretas se acertaron/fallaron | Guardar el detalle pregunta-a-pregunta (con qué versión de pregunta, no solo el ID) para poder auditar sesgo de memorización y calcular evolución real por tema |
| LLM asistiendo en la generación de preguntas | Aceptar la respuesta "correcta" que propone el LLM sin verificarla contra documentación oficial | Verificar cada pregunta generada contra fuente primaria (docs oficiales, RFC, paper) antes de añadirla al banco activo — el LLM alucina con confianza especialmente en detalles de API/versión |

## Performance Traps

Este dominio no tiene riesgos de escalabilidad clásicos (es una herramienta CLI de un solo usuario), pero sí un par de trampas de crecimiento de datos:

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Historial de sesiones sin poda ni agregación | Archivo de resultados crece sin límite, cálculo de "evolución" se vuelve lento o difícil de leer | Agregar por periodo (mensual) tras cierto volumen, mantener detalle crudo aparte | A partir de decenas de sesiones si se guarda el detalle pregunta-a-pregunta completo |
| Banco de preguntas mezclado sin metadata estructurada (texto plano) | Difícil auditar cobertura, dificultad y fecha por pregunta a medida que el banco crece | Estructurar desde el inicio (YAML/JSON con tema, nivel, fuente, fecha) en vez de texto suelto | Se vuelve doloroso pasadas ~50-100 preguntas si no está estructurado desde el principio |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Guardar el banco de preguntas con respuestas correctas en el mismo repo público/versionado sin cuidado | Si el repo se hace público o se comparte, expone las respuestas y "chafa" la validez del propio test para uso futuro | Mantener el banco (con respuestas) fuera de un repo público, o en un repo privado separado del código del CLI |
| Resultados personales de aptitud (gaps, debilidades) en texto plano sin protección | Información sensible sobre el propio candidato si el equipo se sincroniza en la nube o se comparte accidentalmente | Tratar el historial de resultados como dato personal sensible: almacenamiento local, sin subir a repos compartidos |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Sesión de 15+ min sin pausas ni indicador de progreso | Fatiga hacia el final degrada la calidad de las respuestas de las últimas preguntas, sesgando el score de esas dimensiones a la baja de forma artificial | Mostrar progreso claro, permitir pausar/reanudar, y si es posible, ordenar dimensiones para no concentrar las más exigentes al final |
| Feedback inmediato de correcto/incorrecto por pregunta durante el test | Sesga la actitud del resto del test (frustración o exceso de confianza a mitad de camino) y facilita que sesiones futuras "aprendan" el patrón de qué se acaba de fallar | Dar feedback agregado al final de la sesión, no pregunta a pregunta, salvo que se diseñe explícitamente como modo "práctica" separado del modo "evaluación" |
| Resultado final abrumador (mucho texto, muchos gaps a la vez) | El usuario no sabe por dónde empezar, la utilidad accionable del "plan para cerrar gaps" se pierde | Priorizar top 3-5 gaps por relevancia (idealmente ponderados por demanda de `jobhunt`), no listar todo lo fallado sin jerarquía |
| Ausencia de opción "no lo sé" / abstención | Fuerza a adivinar entre las opciones, inflando el score por azar en preguntas de dificultad alta (con 4 opciones, ~25% de aciertos "gratis" por azar en lo que realmente no se sabe) | Incluir opción explícita de abstención, y descontarla del score de forma distinta a una respuesta incorrecta (no es lo mismo no saber que responder mal con confianza) |

## "Looks Done But Isn't" Checklist

- [ ] **Banco de preguntas:** Parece completo por tener muchas preguntas, pero falta metadata de fuente/fecha/nivel por pregunta — verificar que cada entrada tenga trazabilidad de origen, no solo texto y respuesta.
- [ ] **Scoring por dimensión:** Parece funcionar porque produce un número, pero falta mostrar el N (tamaño de muestra) junto al porcentaje — verificar que la UI de resultado nunca muestre un % sin su denominador visible.
- [ ] **Mapeo a rol (junior/mid/senior):** Parece calibrado porque hay umbrales definidos, pero verificar que esos umbrales estén documentados con su justificación (de dónde salen), no solo hardcodeados.
- [ ] **Evolución entre sesiones:** Parece útil porque muestra una gráfica de progreso, pero verificar que distinga preguntas repetidas de nuevas — si no lo hace, la "mejora" mostrada puede ser solo memorización (Pitfall 6).
- [ ] **Resultado final:** Parece honesto porque tiene desglose por dimensión, pero verificar que no exista en ningún sitio un número único agregado tipo "score general" o "match %" que reintroduzca la probabilidad de contratación evitada (Pitfall 8).
- [ ] **Cruce con jobhunt:** Parece añadir valor de mercado, pero verificar que se use solo para ponderar prioridad de gaps, no para generar una cifra nueva de "encaje".

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Banco sesgado por autocuración (Pitfall 1) | MEDIUM | Auditar retroactivamente la fuente de cada pregunta existente; eliminar o reetiquetar las que no tengan fuente externa verificable; añadir preguntas nuevas ancladas a fuentes externas para rebalancear cobertura |
| Scoring inflado / techo (Pitfall 3) | MEDIUM | Re-etiquetar dificultad de preguntas existentes basándose en tasa histórica de acierto acumulada; recalibrar umbrales con esos datos reales en vez de los originales a ojo |
| Mapeo arbitrario a nivel de rol (Pitfall 4) | LOW-MEDIUM | Añadir capa de "evidencia insuficiente" para dimensiones/roles con poco N mientras se recalibra; no requiere rehacer el banco, solo la capa de presentación |
| Banco envejecido en LLM/RAG (Pitfall 5) | LOW | Revisión trimestral dedicada solo a esa dimensión; marcar preguntas obsoletas como "retiradas" en vez de borrarlas (mantener trazabilidad histórica) |
| Memorización entre sesiones (Pitfall 6) | MEDIUM | Ampliar el banco por dimensión y activar rotación aleatoria de subconjuntos; reetiquetar el historial pasado como "no comparable" si se sospecha contaminación fuerte |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| 1. Sesgo de autocuración | Diseño/curación del banco de preguntas | Cada pregunta tiene fuente externa documentada; distribución de cobertura revisada contra job postings reales antes de aprobar el banco v1 |
| 2. Preguntas ambiguas / respuesta discutible | Diseño/curación del banco de preguntas | Cada pregunta tiene justificación de una frase de por qué la respuesta es correcta; pase de revisión diferido en el tiempo |
| 3. Scoring que no calibra (todo alto) | Motor de scoring | Distribución de dificultad del banco revisada; ninguna dimensión con tasa de acierto histórica >85% sin preguntas de refuerzo añadidas |
| 4. Mapeo arbitrario a nivel de rol | Agregación / mapeo a arquetipos de rol | Umbrales documentados con origen (etiqueta de dificultad por pregunta, no ajuste post-hoc); capa de "evidencia insuficiente" quality gate |
| 5. Banco que envejece | Mantenimiento del banco (post-v1), con metadata desde curación inicial | Cada pregunta tiene fecha de fuente y fecha de próxima revisión; proceso de revisión trimestral definido para dimensión LLM/RAG |
| 6. Gaming por memorización | Diseño del banco + persistencia/evolución | Banco con pools rotables; historial de sesión registra qué preguntas eran repetidas vs. nuevas |
| 7. Muestra insuficiente | Diseño del resultado final (radar + reporte) | N visible junto a cada porcentaje; bandas cualitativas en vez de decimales cuando N es bajo |
| 8. Probabilidad de contratación disfrazada | Diseño del resultado final / cualquier fase que toque presentación | Checklist de scope: no existe ningún campo de score único agregado en el resultado final |

## Sources

- [Impact of Test Design, Item Quality, and Item Bank Size on Psychometric Properties of Computer-Based Credentialing Examinations](https://www.researchgate.net/publication/247728564_Impact_of_Test_Design_Item_Quality_and_Item_Bank_Size_on_the_Psychometric_Properties_of_Computer-Based_Credentialing_Examinations) — MEDIUM confidence (peer-reviewed, general item-bank/credentialing literature)
- [Item Banking and Item Calibration in Psychometrics](https://www.linkedin.com/pulse/item-banking-calibration-psychometrics-andrew-f) — LOW-MEDIUM confidence (practitioner summary, cross-checked against academic sources above)
- [The Complete Guide to Technical Assessments in IT Recruitment: Why Most Tests Fail](https://hroasis.com/technical-assessments-it-recruitment-guide/) — MEDIUM confidence (industry practitioner source, consistent with multiple independent hiring-assessment articles found)
- [Dunning-Kruger Effect: Understanding Confidence and Competence](https://www.earlyyears.tv/dunning-kruger-effect/) and [From overconfidence to task dropout in a spatial navigation test: evidence for the Dunning-Kruger effect across 46 countries](https://www.biorxiv.org/content/10.1101/2023.09.18.558324.full.pdf) — HIGH confidence (well-replicated academic finding; cross-source: lowest performers overestimate most, best performers slightly underestimate)
- [The interrelationship between confidence and correctness in a multiple-choice assessment](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7881024/) — MEDIUM-HIGH confidence (peer-reviewed, PMC)
- [Reliability Coefficient of Multiple-Choice and Short Answer Objective Test Items](https://www.researchgate.net/publication/348500772_Reliability_Coefficient_of_Multiple-Choice_and_Short_Answer_Objective_Test_Items_in_Basic_Technology_Comparative_Approach) — MEDIUM confidence (peer-reviewed, supports short-test reliability caution used in Pitfall 7)
- Pitfalls 1, 6, 8 are project-specific reasoning (single-user, self-curated CLI tool with explicit anti-requirement against "probabilidad de contratación") extrapolated from the general psychometric/hiring-assessment literature above and from `.planning/PROJECT.md` — not independently documented as a named case study; treat as MEDIUM confidence reasoned analysis rather than externally verified fact.

---
*Pitfalls research for: Aptus (technical skill self-assessment CLI)*
*Researched: 2026-07-14*
