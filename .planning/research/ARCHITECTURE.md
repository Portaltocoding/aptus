# Architecture Research

**Domain:** CLI de test/quiz técnico interactivo (Node.js/TypeScript)
**Researched:** 2026-07-14
**Confidence:** MEDIUM (patrones de arquitectura: alta confianza, son principios de ingeniería consolidados; elección de librerías concretas: confianza media, basada en búsqueda web sin verificación cruzada)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTENIDO (datos, no código)                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │ Banco de         │  │ Mapa rol→        │  │ Recursos de        │ │
│  │ preguntas (YAML) │  │ dimensión (YAML) │  │ estudio (YAML)     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬─────────┘ │
└───────────┼─────────────────────┼───────────────────────┼───────────┘
            │ carga + valida (zod)│                        │
┌───────────┴─────────────────────┴────────────────────────┴──────────┐
│                          NÚCLEO (lógica pura, sin I/O)                │
│  ┌──────────────────┐        ┌──────────────────────────────────┐   │
│  │ Motor de sesión   │  ───▶  │ Motor de scoring                  │   │
│  │ (orden, nav.,     │        │ (respuestas → score/dimensión →   │   │
│  │  timing)          │        │  readiness/rol)                   │   │
│  └────────┬──────────┘        └────────────────┬───────────────────┘ │
└───────────┼────────────────────────────────────┼─────────────────────┘
            │                                    │
┌───────────┴────────────────────┐   ┌───────────┴────────────────────┐
│      CAPA DE TERMINAL (I/O)     │   │      CAPA DE PERSISTENCIA       │
│  ┌────────────┐ ┌────────────┐ │   │  ┌────────────────────────────┐ │
│  │ Prompts    │ │ Render de  │ │   │  │ Historial de sesiones       │ │
│  │ interact.  │ │ resultados │ │   │  │ (SQLite local propia)       │ │
│  └────────────┘ └────────────┘ │   │  └────────────────────────────┘ │
└──────────────────────────────────┘   └──────────────────────────────┘
                                                     ▲
┌────────────────────────────────────────────────────┴────────────────┐
│         INTEGRACIÓN OPCIONAL (adaptador de solo lectura)             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  jobs.db de jobhunt (~/workspace/jobhunt/data/jobs.db)         │   │
│  │  → lectura de descripciones/scores para ponderar por demanda   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Banco de preguntas | Contenido curado: enunciado, opciones, respuesta correcta, dimensión, nivel (junior/mid/senior), peso | Ficheros YAML separados por dimensión (`llm-rag.yaml`, `ml-classico.yaml`, `fullstack.yaml`, `product-system-design.yaml`, `behavioral.yaml`) |
| Mapa rol→dimensión | Qué peso tiene cada dimensión en el readiness de cada arquetipo de rol | YAML de configuración, editable sin tocar código (`roles.yaml`) |
| Cargador/validador de contenido | Carga los YAML, valida estructura y falla rápido si el contenido está mal formado | `zod`/`valibot` schema + parser YAML (`yaml` npm) al arrancar el CLI |
| Motor de sesión | Selecciona preguntas (cobertura balanceada por dimensión), orden, navegación (siguiente/atrás/saltar), controla el tiempo objetivo (≥15 min) | Módulo de lógica pura en memoria, sin dependencias de terminal, fácil de testear con fixtures |
| Motor de scoring | Traduce respuestas capturadas → score por dimensión → readiness por rol (junior/mid/senior-ready) usando el mapa rol→dimensión | Funciones puras (input/output determinista), el componente más crítico del proyecto porque es la promesa de "no mentir" del Core Value |
| Capa de prompts interactivos | Renderiza las preguntas tipo select en terminal, captura la respuesta del usuario | Librería de prompts (`@clack/prompts` o `enquirer`, ver Integration Points) |
| Render de resultados | Presenta el desglose por dimensión (radar/barra ASCII), readiness por rol, top gaps y plan de estudio | Módulo de presentación puro que consume la salida del motor de scoring, sin lógica de negocio |
| Persistencia | Guarda cada sesión (scores, timestamp, readiness) para poder comparar evolución entre sesiones | SQLite local propia de Aptus vía `better-sqlite3` (mismo patrón que usa el proyecto hermano jobhunt con `jobs.db`) |
| Integración jobhunt (opcional) | Lee (solo lectura) `jobhunt/data/jobs.db` para ponderar gaps/dimensiones por demanda real del mercado | Adaptador aislado en su propio módulo, con fallback si el fichero no existe |

## Recommended Project Structure

```
aptus/
├── src/
│   ├── content/              # DATOS curados, no lógica — lo que Carlos edita a menudo
│   │   ├── questions/        # un YAML por dimensión
│   │   │   ├── llm-rag.yaml
│   │   │   ├── ml-classico.yaml
│   │   │   ├── fullstack.yaml
│   │   │   ├── product-system-design.yaml
│   │   │   └── behavioral.yaml
│   │   ├── roles.yaml        # mapa arquetipo de rol → pesos por dimensión + umbral junior/mid/senior
│   │   └── schema.ts         # esquemas zod que validan questions/*.yaml y roles.yaml
│   ├── engine/                # NÚCLEO — lógica pura, testeable sin terminal
│   │   ├── loader.ts          # carga + valida contenido YAML al arrancar
│   │   ├── session.ts         # selección de preguntas, orden, navegación, timing
│   │   └── scoring.ts         # respuestas → score/dimensión → readiness/rol (sin dependencias de I/O)
│   ├── cli/                   # CAPA DE TERMINAL
│   │   ├── prompts.ts         # wraps la librería de prompts elegida
│   │   ├── render-results.ts  # radar/breakdown/gaps/plan de estudio en terminal
│   │   └── commands/          # aptus test | aptus results | aptus history
│   ├── persistence/
│   │   ├── store.ts           # abrir/leer/escribir historial de sesiones
│   │   └── schema.sql         # DDL de la tabla sessions
│   ├── integrations/
│   │   └── jobhunt.ts         # adaptador de solo lectura a jobs.db, con fallback si no existe
│   └── index.ts               # entrypoint del CLI
├── data/
│   └── aptus.db                # SQLite local (gitignored, no se versiona el historial personal)
└── package.json
```

### Structure Rationale

- **`content/`:** Vive fuera de `engine/` deliberadamente. El requisito "banco de preguntas curadas... etiquetadas por tema y nivel" implica que Carlos editará este contenido con frecuencia y sin tocar TypeScript. Si las preguntas viven hardcodeadas en código, cada edición exige recompilar/redeployar y el riesgo de bugs de sintaxis TS al editar contenido sube. YAML es legible, versionable con git, y diffable.
- **`engine/`:** Aislado de `cli/` a propósito. El motor de sesión y el motor de scoring son el corazón de la promesa "medir bien y no mentir" del Core Value. Al ser lógica pura (sin `process.stdin`/`stdout`), se puede testear con fixtures deterministas sin mockear terminal — esto es crítico porque el scoring es la parte que más debe inspirarse confianza.
- **`cli/`:** Solo I/O y presentación. No debe contener lógica de cálculo de scores; solo llama al `engine/` y pinta el resultado.
- **`persistence/`:** Aislado en su propio módulo con una interfaz mínima (`saveSession`, `listSessions`, `getHistory`) para que el motor y la capa CLI no sepan si por debajo hay SQLite o ficheros JSON — facilita cambiar de formato de persistencia sin tocar el resto.
- **`integrations/jobhunt.ts`:** Único punto de contacto con el proyecto hermano. Todo lo relacionado con jobs.db vive aquí, nunca disperso — si el schema de jobhunt cambia, solo este fichero se toca.

## Architectural Patterns

### Pattern 1: Contenido como datos, no como código

**What:** El banco de preguntas, el mapa rol→dimensión y los recursos de estudio viven en YAML fuera del árbol de código TypeScript, cargados y validados en runtime contra un schema.
**When to use:** Siempre que el contenido cambie con más frecuencia que la lógica, y quien lo edite (aquí, el propio Carlos) no necesite tocar TypeScript.
**Trade-offs:** Gana curabilidad y separación de responsabilidades; pierde un poco de type-safety en compile-time (se compensa validando con zod en runtime al arrancar el CLI, fallando rápido con mensajes claros si una pregunta está mal formada).

**Example:**
```typescript
// src/content/schema.ts
import { z } from "zod";

export const QuestionSchema = z.object({
  id: z.string(),
  dimension: z.enum(["llm-rag", "ml-classico", "fullstack", "product-system-design", "behavioral"]),
  level: z.enum(["junior", "mid", "senior"]),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  correctOptionId: z.string(),
  weight: z.number().default(1),
});

// src/engine/loader.ts
export function loadQuestionBank(dir: string): Question[] {
  const files = readYamlFiles(dir);
  return files.flatMap(f => z.array(QuestionSchema).parse(f.content));
}
```

### Pattern 2: Motor de scoring como función pura, desacoplado del terminal

**What:** El cálculo de score/dimensión y readiness/rol es una función determinista `(answers, questionBank, rolesMap) => ScoreResult`, sin ningún `console.log` ni acceso a stdin/stdout dentro.
**When to use:** Siempre en este proyecto — es el componente que sostiene la promesa central de no inventar números. Cualquier lógica de negocio crítica para la confianza del usuario debería vivir aislada del I/O.
**Trade-offs:** Requiere una capa intermedia (el motor de sesión) que traduzca la interacción real del usuario a un formato de "respuestas capturadas" que el scorer consume; a cambio, el scoring se puede testear unitariamente con casos fijos y auditar manualmente sin ejecutar el CLI completo.

**Example:**
```typescript
// src/engine/scoring.ts — sin imports de cli/ ni de terminal
export function scoreSession(
  answers: CapturedAnswer[],
  bank: Question[],
  rolesMap: RoleWeights[]
): SessionScore {
  const byDimension = groupCorrectness(answers, bank);
  const dimensionScores = computeDimensionScores(byDimension);
  const roleReadiness = rolesMap.map(role => ({
    role: role.name,
    readiness: computeReadiness(dimensionScores, role.weights),
  }));
  return { dimensionScores, roleReadiness };
}
```

### Pattern 3: Adaptador de solo lectura para integración cross-proyecto

**What:** Un módulo único (`integrations/jobhunt.ts`) que abre `jobhunt/data/jobs.db` en modo estrictamente lectura, expone una interfaz pequeña (`getMarketSignal(): DimensionWeights | null`) y degrada a `null`/pesos neutros si el fichero no existe o la tabla no tiene las columnas esperadas.
**When to use:** Cuando un proyecto lee datos de otro proyecto hermano que no controla y cuyo schema puede cambiar sin avisar.
**Trade-offs:** Añade una capa de indirección, pero evita que un cambio de schema en jobhunt rompa Aptus en producción de forma silenciosa; el resto del sistema no depende de que jobhunt exista.

## Data Flow

### Flujo de una sesión de test

```
`aptus test`
    ↓
Cargador de contenido → valida YAML (banco de preguntas + roles.yaml)
    ↓
Motor de sesión → selecciona set de preguntas (cobertura por dimensión, ≥15 min)
    ↓
Capa de prompts (loop) → pregunta a pregunta: render → captura respuesta + navegación
    ↓
Motor de sesión → acumula respuestas capturadas en memoria
    ↓ (fin de sesión)
Motor de scoring → score/dimensión → readiness/rol
    ↓                                   ↑ (opcional)
    │                    Integración jobhunt → pesos de demanda de mercado
    ↓
Render de resultados → radar/desglose + top gaps + plan de estudio (terminal)
    ↓
Persistencia → guarda SessionScore + timestamp en aptus.db
```

### Flujo de consulta de historial

```
`aptus results` / `aptus history`
    ↓
Persistencia → lee sesiones pasadas de aptus.db
    ↓
Render de resultados → compara evolución entre sesiones (tendencia por dimensión)
```

### Key Data Flows

1. **Sesión → Scoring → Persistencia:** unidireccional y sin retorno; una vez guardada, una sesión no se recalcula retroactivamente aunque cambie el banco de preguntas (evita que ediciones futuras del contenido "reescriban" resultados pasados).
2. **jobhunt → Aptus (solo lectura, opcional):** unidireccional estricto. Aptus lee de `jobs.db`; jobhunt nunca debe importar ni depender de nada de Aptus. Si `jobs.db` no está disponible, Aptus funciona igual sin ponderación de mercado.

## Scaling Considerations

Este es un CLI personal de un solo usuario (explícitamente fuera de scope multiusuario/cuentas), así que "escala" aquí no significa tráfico ni concurrencia, sino tamaño del banco de preguntas y del historial de sesiones a lo largo de los años.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Banco pequeño (decenas de preguntas por dimensión) | YAML plano + carga completa en memoria al arrancar es más que suficiente |
| Banco grande (cientos de preguntas, múltiples niveles) | Sigue siendo trivial para SQLite/YAML; el único ajuste real es indexar por `dimension`+`level` en el selector del motor de sesión para elegir subconjuntos rápido |
| Historial de sesiones a largo plazo (años de uso) | SQLite local aguanta miles de filas sin esfuerzo; si algún día se quiere graficar tendencias más ricas, sigue siendo una query SQL, no un problema de arquitectura |

### Scaling Priorities

1. **Primer cuello de botella real:** ninguno técnico — el límite práctico es cuánto contenido cura Carlos a mano, no el sistema.
2. **Segundo cuello de botella:** si en el futuro se automatiza la generación de preguntas (LLM-assisted), el cargador/validador (zod) pasa a ser la línea de defensa clave contra contenido mal formado a mayor volumen.

## Anti-Patterns

### Anti-Pattern 1: Preguntas hardcodeadas en TypeScript

**What people do:** Definir el banco de preguntas como objetos/arrays TS dentro de `src/`.
**Why it's wrong:** Rompe el requisito explícito de "banco de preguntas curadas... fácil de curar"; cada edición de contenido exige tocar código, aumenta el riesgo de errores de sintaxis y acopla el ciclo de vida del contenido al del código.
**Do this instead:** Mantener el banco en YAML bajo `content/`, validado con un schema en runtime.

### Anti-Pattern 2: Mezclar cálculo de score con renderizado de terminal

**What people do:** Calcular el score dentro del mismo bucle que imprime resultados en pantalla (`console.log` intercalado con la aritmética de scoring).
**Why it's wrong:** Hace el scoring imposible de testear sin ejecutar el CLI completo, y dificulta auditar manualmente la lógica que sostiene la promesa de "no mentir" del proyecto — justo el componente que más necesita ser inspeccionable.
**Do this instead:** Motor de scoring como función pura en `engine/`, consumida por `cli/render-results.ts` solo para pintar el resultado ya calculado.

### Anti-Pattern 3: Acoplar Aptus al schema interno de jobhunt

**What people do:** Importar directamente modelos/ORM de jobhunt, o replicar sus queries SQL dispersas por el código de Aptus.
**Why it's wrong:** jobhunt evoluciona su propio schema de forma independiente (es otro proyecto con su propio roadmap); un cambio ahí rompería Aptus de forma difusa y difícil de diagnosticar.
**Do this instead:** Un único adaptador (`integrations/jobhunt.ts`) con una interfaz reducida y defensiva (comprobar columnas antes de leerlas, devolver `null`/neutro si algo no cuadra), y degradar con gracia si `jobs.db` no existe.

### Anti-Pattern 4: Hacer obligatoria la integración con jobhunt

**What people do:** Hacer que el CLI falle o pida `jobs.db` para poder correr un test.
**Why it's wrong:** El propio PROJECT.md marca la integración con jobhunt como "(Opcional)"; Aptus debe funcionar de forma completamente autónoma.
**Do this instead:** Flag/detección automática — si `jobs.db` existe y es legible, se usa para ponderar; si no, el motor de scoring usa pesos por defecto sin señal de mercado.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `jobhunt/data/jobs.db` (SQLite) | Adaptador de solo lectura vía `better-sqlite3`, en su propio módulo | `better-sqlite3` no soporta el modo URI `?mode=ro` (fue deshabilitado); la solo-lectura se garantiza por disciplina de código (nunca ejecutar `INSERT`/`UPDATE`/`DELETE` sobre esa conexión) más, si se quiere una garantía más fuerte, permisos de filesystem de solo lectura sobre el fichero. Confirmar el path vía `~/workspace/jobhunt/data/jobs.db` relativo al home, no hardcodeado a un usuario. Columna `description` es la fuente de señal textual para keywords de mercado; columna `score`/`score_keywords` ya trae una puntuación pre-calculada por jobhunt reutilizable. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `content/` ↔ `engine/loader.ts` | Lectura de ficheros YAML + validación zod | Único punto de entrada del contenido al sistema; si la validación falla, el CLI debe abortar con un mensaje claro señalando qué pregunta/fichero está mal, no arrancar con datos parcialmente inválidos |
| `engine/session.ts` ↔ `cli/prompts.ts` | Llamada directa en memoria (mismo proceso) | El motor de sesión decide qué pregunta toca y en qué orden; la capa de prompts solo la presenta y devuelve la respuesta cruda |
| `engine/scoring.ts` ↔ `cli/render-results.ts` | Función pura → objeto de resultado | El render no debe re-derivar ni ajustar scores, solo formatear lo que el motor ya calculó |
| `engine/scoring.ts` ↔ `integrations/jobhunt.ts` | El motor de scoring acepta un `DimensionWeights` opcional como parámetro | Mantiene el motor de scoring testeable sin jobhunt: si no se pasa el parámetro, usa pesos por defecto |
| `persistence/store.ts` ↔ resto del sistema | Interfaz mínima (`saveSession`/`listSessions`) | Nadie fuera de `persistence/` debe saber si por debajo hay SQLite o JSON — permite cambiar de motor de almacenamiento sin tocar `engine/` ni `cli/` |
| Aptus → jobhunt | Unidireccional, solo lectura | jobhunt jamás debe importar ni depender de Aptus; si algún día se quisiera lo inverso (que jobhunt lea readiness de Aptus), sería una integración nueva y explícita, no implícita por compartir workspace |

## Orden de construcción recomendado

El orden se deriva de las dependencias reales entre componentes, no de la interfaz de usuario:

1. **Banco de preguntas + schema + cargador/validador** — nada más se puede construir ni testear sin datos de fixture reales. Empezar con 1-2 dimensiones (ej. LLM/RAG) es suficiente para desbloquear el resto.
2. **Motor de scoring (función pura)** — se construye y testea antes que la UI porque es el corazón de la promesa "no mentir". Se puede validar con respuestas de fixture sin ningún terminal real de por medio.
3. **Motor de sesión (selección, orden, navegación, timing)** — depende del banco de preguntas cargado; sigue siendo lógica pura, testeable sin I/O.
4. **Capa de prompts interactivos** — ahora sí se conecta el motor de sesión a un terminal real (`@clack/prompts` o `enquirer`). Primer punto donde el CLI es "usable" de punta a punta para completar un test.
5. **Render de resultados** — consume la salida del motor de scoring (ya validado en el paso 2) y la pinta en terminal (radar/desglose/gaps/plan de estudio).
6. **Persistencia (historial de sesiones)** — puede construirse en paralelo a los pasos 4-5 porque solo depende de la forma del `SessionScore` que ya definió el motor de scoring; desbloquea `aptus results`/tendencias.
7. **Integración con jobhunt (opcional)** — se construye al final porque es aditiva y ortogonal: el sistema ya es completo y útil sin ella, y su ausencia no debe bloquear ningún paso anterior.

**Implicación clave para el roadmap:** las fases más tempranas deben priorizar `engine/` (scoring + sesión) sobre `cli/` (terminal bonito), porque el riesgo de proyecto está en "el scoring no es honesto", no en "la interfaz no es bonita". Una fase de UI pulida es barata de rehacer; una fase de scoring mal diseñada contamina todo el historial de sesiones persistido después.

## Sources

- [Ink vs @clack/prompts vs Enquirer 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/ink-vs-clack-vs-enquirer-interactive-cli-nodejs-2026) — MEDIUM (web, sin verificación cruzada)
- [@clack/prompts: The Modern Alternative to Inquirer.js — DEV Community](https://dev.to/chengyixu/clackprompts-the-modern-alternative-to-inquirerjs-1ohb) — MEDIUM
- [GitHub - enquirer/enquirer](https://github.com/enquirer/enquirer) — MEDIUM
- [GitHub - SBoudrias/Inquirer.js](https://github.com/SBoudrias/Inquirer.js) — MEDIUM
- [How to attach a database read-only · Issue #1354 · WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3/issues/1354) — MEDIUM
- [Understanding Better-SQLite3 — DEV Community](https://dev.to/lovestaco/understanding-better-sqlite3-the-fastest-sqlite-library-for-nodejs-4n8) — MEDIUM
- Esquema real inspeccionado directamente: `~/workspace/jobhunt/data/jobs.db` (tabla `jobs`) — HIGH (fuente primaria, inspección directa del proyecto hermano)
- Principios de arquitectura en capas / separación contenido-lógica-presentación: conocimiento consolidado de ingeniería de software, contrastado con [three-tier architecture](https://www.designgurus.io/answers/detail/what-is-a-three-tier-architecture-presentation-logic-data-in-system-design) — HIGH (principio establecido, no específico de dominio)

---
*Architecture research for: CLI de test de aptitud técnica (Aptus)*
*Researched: 2026-07-14*
