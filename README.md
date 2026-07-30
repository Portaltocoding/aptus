# Aptus

![tests](https://github.com/Portaltocoding/aptus/actions/workflows/test.yml/badge.svg)
![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)

Motor de evaluación de aptitud por terminal, *data driven* mediante **packs de
conocimiento** intercambiables.

El motor (selección equilibrada, scoring por dimensión, calibración, readiness por
rol, gaps y repaso espaciado) no sabe de qué tema evalúa. Cada dominio evaluable es
un pack en YAML: banco de preguntas, baselines y perfiles de rol. Añadir un tema
nuevo no toca ni una línea de TypeScript.

El primer pack, **AI/ML Readiness**, tiene 255 preguntas curadas en cinco
dimensiones y sirve de caso de validación del concepto.

## Qué hace una sesión

```
$ aptus start

  ai-ml-readiness · 5 dimensiones · sesión de 25 preguntas

  [llm-rag-evals · chunking · easy]

  En un pipeline RAG, ¿cuál es el motivo principal de usar 'chunk overlap'
  al trocear los documentos?

    a) Reducir el tamaño total del índice vectorial
    b) Evitar que información relevante quede cortada en el límite entre fragmentos
    c) Acelerar la generación de embeddings
    d) Eliminar la necesidad de un modelo de reranking

  ¿Cómo de seguro estás?  › alta / media / baja
```

Al terminar no sale un número. Sale un desglose:

- **Por dimensión y subtema**, siempre con su N a la vista (`68 % · 17/25`), nunca
  un agregado global que esconda de dónde viene.
- **Calibración**: cruza la confianza que declaraste con tu acierto real. Es donde
  se ve si te sobreestimas, que suele importar más que el porcentaje.
- **Readiness por rol y nivel** (junior / mid / senior) para AI Engineer, LLM
  Engineer, ML Engineer, Fullstack y AI Product Engineer, anclado a la dificultad
  etiquetada de las preguntas.
- **Gaps priorizados** con plan de estudio.

## Comandos

| comando | qué hace |
|---|---|
| `aptus start` | inicia una sesión sobre un pack |
| `aptus review` | repaso espaciado de lo que peor llevas (estudio, no medición) |
| `aptus history` | historial de sesiones y evolución entre ellas |
| `aptus report` | informe HTML local y autocontenido, sin salir a la red |
| `aptus packs` | lista los packs disponibles |
| `aptus new-pack <nombre>` | genera el esqueleto aislado de un pack nuevo |
| `aptus verify-pack [nombre]` | audita la calidad de un pack (curadas, no relleno) |
| `aptus jd <fichero>` | evalúa tu readiness contra una oferta concreta |
| `aptus jobs` | evalúa en bloque ofertas ya escaneadas (integración opcional) |

Todos aceptan `-p, --pack <nombre>`. El pack por defecto es `ai-ml-readiness`.

## Instalación

```bash
git clone https://github.com/Portaltocoding/aptus.git
cd aptus
npm install
npm start          # equivale a `aptus start`
```

Requiere Node ≥ 22. Las sesiones se guardan en `data/<pack>/`, que está fuera del
control de versiones: tus resultados no salen de tu máquina.

## Arquitectura

```
src/core/      motores puros: sin I/O, sin reloj, sin aleatoriedad propia
               scoring · calibration · readiness · session · resurfacing
               evolution · market · jd · pack-audit

src/content/   carga y validación de packs (zod), persistencia del historial

src/cli/       render de terminal, informe HTML, comandos

packs/         los datos: un directorio por tema
```

La regla que sostiene el diseño: **el núcleo es puro**. Nada en `src/core/` lee el
reloj, genera aleatoriedad ni toca disco. El `now` y la función de barajado se
inyectan desde la capa de I/O, así que mismo input produce siempre mismo output.
Por eso los 218 tests corren en menos de dos segundos sin un solo mock.

## Anatomía de un pack

```
packs/ai-ml-readiness/
├── pack.yaml          nombre, versión y lista de dimensiones
├── readiness.yaml     perfiles de rol y baselines de nivel
├── questions/         un YAML por dimensión
└── sources/           de dónde salió el contenido
```

Cada pregunta declara dimensión, subtema, dificultad, roles a los que aplica,
opciones, respuesta, explicación y **`source`**, que permite auditar el sesgo de
autocuración: cuánto del pack viene de una fuente propia y cuánto de fuera.

```bash
aptus new-pack idiomas-b2     # esqueleto listo para rellenar
aptus verify-pack idiomas-b2  # errores bloquean, avisos orientan
```

## Decisiones de diseño

**No hay score único de empleabilidad.** El motor se niega a devolver una
"probabilidad de contratación". Ese número sería inventado y además taparía la
evidencia. Todo se reporta desglosado y con su N.

**Los baselines están anclados a fuentes externas, no a la opinión del curador.**
Los niveles se apoyan en marcos públicos de leveling y los perfiles de rol en
descripciones de puesto reales. Las fuentes están citadas dentro del propio
`readiness.yaml` y los cortes son editables ahí mismo.

**El repaso usa Leitner, no SM-2.** SM-2 pondera la "calidad del recuerdo"
autodeclarada, y aquí eso mezclaría la señal de estudio con la de medición. Leitner
solo necesita acierto o fallo.

**Medir y estudiar están separados.** `start` mide con selección equilibrada.
`review` estudia con repetición espaciada. Mezclarlos contaminaría la medición.

## Integración opcional

Si exportas `APTUS_JOBS_DB` con la ruta a una base SQLite de ofertas de empleo,
Aptus la lee **en solo lectura** y repondera la prioridad de tus gaps combinando
**debilidad × demanda de mercado**. No genera ningún score nuevo de encaje: solo
reordena, con las dos señales a la vista.

```bash
export APTUS_JOBS_DB=~/ruta/a/jobs.db
```

Sin esa variable la capa simplemente no existe y el resto del CLI funciona igual.
Basta con una tabla `jobs` que tenga `title` y `description`; si además trae
`company`, `job_url` e `status`, se aprovechan.

## Desarrollo

```bash
npm test         # 218 tests, 21 ficheros
npm run typecheck
npm run lint
```

Los motores de `src/core/` se testean con fixtures y barajado con semilla. Si un
test necesita un mock de reloj o de disco, es señal de que la lógica se ha escapado
del núcleo.
