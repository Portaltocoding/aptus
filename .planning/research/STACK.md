# Stack Research

**Domain:** CLI interactivo de terminal (quiz/test de aptitud técnica), single-user, local, persistencia entre sesiones
**Researched:** 2026-07-14
**Confidence:** MEDIUM-HIGH (versiones verificadas directamente contra el registro npm; comparativas cualitativas verificadas por múltiples fuentes web cruzadas)

## Lenguaje: Node/TypeScript, no Python

**Recomendación: TypeScript sobre Node.js.** El usuario domina TS/Node, ya tiene un hermano en Node (`jobhunt/careerops`) con convenciones y tooling reutilizables, y el ecosistema de prompts interactivos de terminal en npm (Clack, Inquirer) está más pulido visualmente y mejor tipado que sus equivalentes Python (`questionary`, `InquirerPy`, `rich`), que existen pero son menos activos y con menor diversidad de mantenedores. Python no aporta ninguna ventaja aquí (no hay ML/data pesado, no hay notebooks, no hay necesidad de librerías científicas) y fragmentaría el stack personal del usuario sin motivo. Confianza: **HIGH** (decisión de dominio, no requiere fuente externa — se apoya en el contexto ya provisto).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | ≥22.13 (dev en 26.x LTS-elect) | Runtime | Node 24 es el LTS activo en 2026; Node 26 es "Current" y pasa a LTS en octubre 2026. La máquina del usuario ya corre Node 26.4 — usarlo es lo natural. `node:sqlite` alcanza estado *Release Candidate* estable en Node 26 (era solo "Active Development"/experimental en Node 24), lo que decide la elección de persistencia (ver abajo). Confianza: **HIGH** (verificado en nodejs.org/api/sqlite.html y cruzado con endoflife.date). |
| TypeScript | ^7.0.2 (GA el 8 de julio de 2026) | Lenguaje | TS 7 es el nuevo compilador nativo en Go (proyecto `typescript-go`), ~10x más rápido en type-check que TS 6. Para un CLI pequeño el beneficio de velocidad es marginal, pero es la versión soportada activamente hoy. **Caveat real:** la API programática estable de TS 7 no llega hasta 7.1 — herramientas que dependen de esa API interna (ciertos plugins de ESLint tipados, algunos bundlers) pueden tener fricción los primeros meses. Mitigación: usar `tsx` para ejecución (usa esbuild, no la API de TS) y `tsc --noEmit` solo para chequeo de tipos en CI/pre-commit. Si aparece fricción, `typescript@^6.0.3` es una alternativa estable y probada sin riesgo. Confianza: **MEDIUM** (feature muy reciente, 6 días de GA a fecha de esta investigación). |
| tsx | ^4.23.1 | Ejecución de TS sin compilar | Sucesor de facto de `ts-node`: usa esbuild, arranque casi instantáneo, sin necesidad de `tsconfig.json`, soporta ESM/CJS de forma transparente. `ts-node` no ha tenido major release desde 2021 y su tendencia de adopción es descendente. Se usa como `tsx src/index.ts` en dev y como base del script `bin` si no se compila a JS para distribución. Confianza: **MEDIUM** (verificado por consenso de múltiples fuentes 2026). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@inquirer/prompts` | ^8.5.2 | Prompts interactivos (select, checkbox, confirm, input) | **Elección principal.** Reescritura modular oficial de Inquirer.js: import por tipo de prompt (`select`, `checkbox`), sin dependencia de React/Ink, tipado TS nativo, 29.4M descargas/semana (la mayor de la categoría). Es el estándar de facto para wizards/tests de opción múltiple con navegación por flechas. Usar para las preguntas `select` del test y para menús de navegación. |
| `@clack/prompts` | ^1.7.0 | Alternativa de prompts con estética pulida "de fábrica" | Considerar en vez de Inquirer si se quiere una identidad visual más cuidada sin esfuerzo (líneas conectoras, spinners, manejo de cancelación con Ctrl+C ya resuelto) y los tipos de prompt necesarios son simples. Es ~2-4KB vs el footprint mayor de Inquirer. Dado que el usuario valora "minimalismo clásico sobrio", Clack encaja bien en la app envoltorio (pantalla de bienvenida, selección de sesión, prompts de confirmación), combinado con `@inquirer/prompts` para las preguntas del test en sí si se necesita más control (p.ej. validación por tipo, prompts anidados). **No usar ambos sin razón** — elegir uno como base y usar el otro solo si falta una interacción concreta. |
| `cli-table3` | ^0.6.5 | Tablas en terminal (desglose por dimensión, comparativa entre sesiones) | Estándar del ecosistema (28.6M descargas/semana), API compatible con el histórico `cli-table`, soporta unicode, colores ANSI dentro de celdas, alineación y wrapping. Usar para la tabla de resultados por dimensión y el historial de sesiones. |
| `picocolors` | ^1.1.1 | Colores ANSI en terminal | Preferir sobre `chalk`: 14x más pequeño (383B vs 13KB gzip), 2x más rápido en arranque (0.47ms vs 6.2ms), cero dependencias. Para un CLI que arranca en cada invocación, el coste de arranque de chalk es puro desperdicio. La API es casi idéntica (`pc.green(str)` vs `chalk.green(str)`), migración trivial si hiciera falta más adelante. |
| `boxen` | ^8.0.1 | Cajas con bordes para el resumen final (readiness por rol) | Encaja con la estética sobria: un box con el score y highlights se lee mejor que texto plano al final de una sesión de 15+ min. Usar con moderación (evitar "arte cosmético" excesivo, ver preferencias del usuario). |
| `cli-progress` | ^3.12.0 | Barra de progreso durante la sesión (pregunta N de M / tiempo transcurrido) | Librería madura y estable para barras de progreso de terminal, soporta formato custom, múltiples barras, ETA. Alternativa a construir la barra a mano; usar si se quiere feedback visual de avance además del contador textual. |
| `node:sqlite` | built-in (Node ≥22.5, RC estable en Node ≥25.7/26) | Persistencia de sesiones y resultados históricos | **Elección principal.** Módulo nativo de Node, cero instalación npm, cero compilación nativa (node-gyp), ya alcanzó estado *Release Candidate* en la versión de Node que el usuario tiene instalada (26.4). Para una app personal de un solo usuario con escritura síncrona ocasional (una sesión de test dura 15+ min, no hay concurrencia), las limitaciones de `node:sqlite` (solo síncrono, sin `db.transaction()` con helper, sin `serialize()`/`deserialize()`) no son relevantes. Elimina una dependencia nativa frágil del proyecto. |
| `better-sqlite3` | ^12.11.1 | Alternativa a `node:sqlite` si se necesitan transacciones anidadas o funciones custom | Usar en vez de `node:sqlite` solo si aparece una necesidad concreta de transacciones con savepoints, funciones definidas por el usuario en SQL, o extensiones SQLite — improbable en este dominio. Requiere bindings nativos compilados (node-gyp), lo que puede fallar en CI/contenedores Alpine, pero en una máquina de desarrollo Linux normal (como la del usuario) no suele dar problemas. |
| `env-paths` | ^4.0.0 | Resolución de rutas de datos multiplataforma (`~/.local/share/aptus`, etc.) | Para ubicar el fichero `.sqlite` de forma estándar (XDG en Linux) en vez de hardcodear rutas. Pequeño, sin dependencias, ampliamente usado por CLIs de npm. |
| `zod` | ^4.4.3 | Validación de esquema del banco de preguntas (YAML/JSON) y de las respuestas | El usuario ya usa Zod en `jobhunt` (perfil de configuración `profile.yml`). Reutilizar el mismo patrón para validar la estructura del banco de preguntas (tema, nivel, dimensión, respuesta correcta) al cargarlo, evitando preguntas mal formadas en tiempo de ejecución. |
| `commander` | ^15.0.0 | Parseo de argumentos / subcomandos (`aptus start`, `aptus history`, `aptus review`) | Preferir sobre `yargs`: cero dependencias, arranque más rápido (18-25ms vs 35-48ms), API declarativa que encaja con subcomandos estilo git (`aptus <subcomando>`). Para un CLI personal sin necesidad de coerción de tipos avanzada o completado de shell complejo, Commander es suficiente y más ligero. |
| `vitest` | ^4.1.10 | Testing | Estándar 2026 para proyectos TS/Node modernos (ESM nativo, rápido, API compatible con Jest). Usar para testear el motor de scoring y el parser del banco de preguntas — la lógica de negocio más crítica del proyecto (medir bien y no mentir es el core value). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint + `@typescript-eslint` | Lint | Configurar en modo flat config (`eslint.config.js`), estándar desde ESLint 9. Verificar compatibilidad con TS 7 (API programática aún estabilizándose hasta 7.1) — si hay fricción, fijar `typescript@^6.0.3` temporalmente. |
| Prettier | Formato | Sin configuración especial necesaria para este proyecto. |
| `tsx watch` | Dev loop | `tsx watch src/index.ts` para iterar sobre la lógica de scoring sin recompilar manualmente. |

## Installation

```bash
# Core: prompts, tablas, colores, progreso, cajas
npm install @inquirer/prompts cli-table3 picocolors boxen cli-progress

# Persistencia y validación
npm install zod env-paths
# node:sqlite es nativo — no requiere instalación

# CLI framework
npm install commander

# Dev dependencies
npm install -D typescript tsx vitest @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint prettier @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@inquirer/prompts` | `@clack/prompts` | Si se prioriza una estética "de fábrica" más cuidada sobre flexibilidad de tipos de prompt, o si el proyecto crece hacia un wizard de instalación/scaffolding (Clack es el estándar ahí, usado por Astro, Vite, etc.). |
| `@inquirer/prompts` | `enquirer` | Si se necesita autocompletado avanzado o prompts muy customizados; API menos mantenida activamente que Inquirer/Clack pero muy flexible. |
| `picocolors` | `chalk` | Si se necesita theming avanzado (`chalk.hex()`, templates con `chalk-template`) que picocolors no ofrece — improbable en este dominio, la paleta será sobria y limitada. |
| `node:sqlite` | `better-sqlite3` | Si en el desarrollo se topa con una limitación real (transacciones anidadas, necesidad de `serialize()` para exportar/backup de la DB) — better-sqlite3 es la ruta de escape directa, API muy similar. |
| `node:sqlite` | JSON plano en disco (`lowdb` o `fs` + `zod`) | Si el volumen de datos es mínimo (unas pocas decenas de sesiones) y se prefiere legibilidad/diff-ability del fichero de resultados sobre una base de datos binaria. Para "ver evolución entre sesiones" con queries simples (última sesión, media móvil), SQLite da más margen de crecimiento sin reescritura, pero JSON es válido si se quiere simplicidad máxima. |
| `commander` | `citty` (ecosistema UnJS) | Si se anticipa una CLI con muchos subcomandos anidados y se quiere una API más moderna orientada a ESM — para 3-4 subcomandos (`start`, `history`, `review`) Commander es suficiente y más probado. |
| `commander` | `yargs` | Si se necesita validación de tipos de argumentos, sugerencias de typos, o coerción automática — no es un requisito de este dominio. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `inquirer` (paquete legacy, no `@inquirer/prompts`) | El paquete monolítico original está en modo mantenimiento de facto; el propio equipo empuja a `@inquirer/prompts` como sucesor modular. Instalar el legacy añade peso sin beneficio. | `@inquirer/prompts` |
| `chalk` como dependencia por defecto | 14x más pesado y ~13x más lento en arranque que picocolors sin aportar features que este proyecto necesite. En un CLI que se invoca constantemente (sesiones de 15+ min con refresco de pantalla), el coste de arranque repetido no es gratis. | `picocolors` |
| `ts-node` | Sin major release desde 2021, arranque ~500ms vs casi instantáneo de tsx, requiere TypeScript como peer dependency explícito y configuración adicional. La comunidad ha migrado de forma consistente a tsx. | `tsx` |
| `terminal-charter` (u otro paquete "radar chart terminal") | Investigado específicamente para este proyecto: tiene ~1 descarga/semana en npm — package esencialmente sin uso ni mantenimiento real. Depender de él para la pieza visual central del resultado (el "radar" pedido en PROJECT.md) es un riesgo de abandono/bugs sin red de soporte. | Construir el "radar" como filas de barras horizontales con `cli-table3` + bloques unicode (`█░`) coloreados con `picocolors` — más sobrio, más controlable, y coherente con la preferencia estética del usuario (función sobre adorno). |
| `better-sqlite3` como elección por defecto sin necesidad concreta | Añade una dependencia nativa compilada (node-gyp) para un caso de uso que `node:sqlite` ya cubre sin instalación ni compilación, en una app de un solo usuario sin requisitos de rendimiento extremo. | `node:sqlite` |
| Python / `questionary` / `InquirerPy` / `rich` | El usuario domina TS/Node, ya tiene tooling y convenciones en su proyecto hermano Node (`careerops`), y el ecosistema de prompts+terminal-UI en npm es más maduro y mejor tipado para este caso concreto. Introducir Python fragmentaría el stack personal sin ganancia. | Node.js + TypeScript |

## Stack Patterns by Variant

**Si el banco de preguntas crece mucho (cientos de preguntas, múltiples versiones/idiomas):**
- Usar `node:sqlite` (o `better-sqlite3`) también para almacenar el banco de preguntas, no solo los resultados, con migraciones simples a mano (`CREATE TABLE IF NOT EXISTS`).
- Porque: consultas por dimensión/nivel/tema se vuelven triviales con SQL en vez de filtrar arrays en memoria cada vez.

**Si se decide compilar a un binario distribuible (en vez de solo `tsx src/index.ts` local):**
- Añadir `tsc` a `pipeline` de build (`tsc -p tsconfig.json`) generando `dist/`, y opcionalmente empaquetar con `pkg` o similar más adelante.
- Porque: para uso 100% personal y local (caso actual, según PROJECT.md), no hace falta empaquetado — `tsx` directo es más simple y suficiente.

**Si se añade el cruce opcional con ofertas de `jobhunt` (Node ya, `careerops`):**
- Leer directamente los ficheros/DB de `jobhunt` si están en formato JSON/SQLite accesible, o exponer un pequeño script de exportación en `careerops` que Aptus consuma — evitar acoplar Aptus a la implementación interna de `jobhunt` importando sus módulos.
- Porque: mantiene los dos proyectos hermanos desacoplados (Aptus mide al candidato, jobhunt mide las ofertas, según PROJECT.md) y evita romper Aptus si `careerops` cambia su estructura interna.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `typescript@^7.0.2` | `tsx@^4.23.1` | Compatible sin fricción — tsx usa esbuild para transpilar, no la API de TS, así que no depende de la API programática de TS7 aún inestable hasta 7.1. |
| `typescript@^7.0.2` | `@typescript-eslint/*` | Verificar en el momento de instalar: algunos plugins de ESLint tipados dependen de la API interna del compilador TS, que cambia hasta TS 7.1. Si hay errores de tipo/plugin, fijar `typescript@^6.0.3` como red de seguridad (misma sintaxis de lenguaje, sin el compilador Go). |
| `node:sqlite` | Node `≥22.5` (mínimo), `≥25.7`/`26.x` (RC estable recomendado) | No usar `node:sqlite` en Node <22.5 (no existe) ni depender de su estabilidad plena en Node 22-24 (aún "Active Development"/experimental ahí). |
| `@inquirer/prompts@^8.5.2` | Node `≥20.17 \|\| ^22.13 \|\| ^23.5` (declarado en `engines`) | Compatible con Node 26.x del usuario sin problema. |
| `commander@^15.0.0` | Node `≥22.12` | Compatible con Node 26.x del usuario. |

## Sources

- npm registry (`npm view <pkg> version/engines`, verificado en vivo el 2026-07-14) — HIGH confianza para números de versión exactos: `@clack/prompts@1.7.0`, `@inquirer/prompts@8.5.2`, `enquirer@2.4.1`, `prompts@2.4.2`, `cli-table3@0.6.5`, `picocolors@1.1.1`, `chalk@5.6.2`, `better-sqlite3@12.11.1`, `cli-progress@3.12.0`, `ora@9.4.1`, `commander@15.0.0`, `yargs@18.0.0`, `citty@0.2.2`, `tsx@4.23.1`, `typescript@7.0.2`, `vitest@4.1.10`, `zod@4.4.3`, `boxen@8.0.1`, `conf@15.1.0`, `env-paths@4.0.0`, `chartscii@4.0.3`, `terminal-charter@1.0.20`.
- npmjs.org downloads API (`api.npmjs.org/downloads/point/last-week/<pkg>`) — HIGH confianza para popularidad/salud del paquete: confirma `terminal-charter` prácticamente sin uso (1 descarga/semana) frente a `cli-table3` (28.6M/semana), `@inquirer/prompts` (29.4M/semana), `@clack/prompts` (13.8M/semana), `picocolors` (159M/semana), `better-sqlite3` (7.5M/semana).
- WebSearch cruzada (comparativas @inquirer/prompts vs @clack/prompts vs enquirer, picocolors vs chalk, better-sqlite3 vs node:sqlite, commander vs yargs vs citty, tsx vs ts-node) — MEDIUM confianza (múltiples fuentes independientes coinciden en las conclusiones cualitativas: PkgPulse, npm-compare.com, dev.to, GitHub discussions, Socket.dev).
- nodejs.org/api/sqlite.html, endoflife.date/nodejs, GitHub nodejs/node issue #57445 (stabilization of node:sqlite) — MEDIUM-HIGH confianza para el estado de estabilidad de `node:sqlite` por versión de Node y el calendario LTS 2026.
- Búsqueda específica sobre TypeScript 7 (GA 2026-07-08, compilador nativo en Go, API programática estable pendiente hasta 7.1) — MEDIUM confianza (feature muy reciente al momento de esta investigación, múltiples fuentes de prensa técnica coinciden pero aún no hay track record largo).

---
*Stack research for: CLI interactivo de test de aptitud técnica (Aptus)*
*Researched: 2026-07-14*
