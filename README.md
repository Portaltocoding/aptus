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

`aptus` a secas abre el menú principal, que es el sitio al que se vuelve: cada
acción termina y te deja otra vez ahí. **ESC vuelve atrás** en cualquier pantalla
—un paso del asistente, un prompt a medias, el menú mismo— y en mitad de una
sesión pregunta antes de tirar lo que llevas respondido.

```
aptus ──────────────────────────────────────────────────────────

›   ¿Qué hacemos?  (esc vuelve atrás · salir)
❯ Empezar una sesión     Medir: eliges pack, dimensiones y dificultad.
  Repasar                Estudiar lo que peor llevas. No mide.
  Ver el historial       Sesiones guardadas y evolución entre ellas.
  Evaluar una oferta     Tu readiness contra una oferta concreta (o su brief).
  Ingerir material       Una carpeta → el brief de un pack nuevo.
```

Con cualquier subcomando (o sin TTY: scripts, CI, pipes) se comporta como
siempre — el menú llama a los mismos comandos, no los reimplementa.

`aptus start` abre un asistente antes de preguntar nada: sobre qué pack te
evalúas, qué dimensiones entran, a qué nivel de dificultad y cuántas preguntas.
Antes de empezar dice con qué se está alimentando el motor y avisa si el filtro
deja una muestra demasiado corta para concluir nada.

```
Qué vamos a evaluar ───────────────────────────────────────────────────

›   ¿Qué dimensiones entran?  (espacio marca · a todas · enter confirma)
  ◉ llm-rag-evals          55 preguntas en el banco
  ◉ ml-clasico
  ◯ fullstack-next-nest-ts

›   ¿A qué nivel de dificultad?
❯ Todas — de fácil a experto     la única que puede acreditar cualquier nivel
  Base — fácil y media           para asentar fundamentos; no acredita senior
  Alta — difícil y experto       para ver si aguantas arriba

Sesión ────────────────────────────────────────────────────────────────
  AI/ML Readiness (ai-ml-readiness)
  Alimentando el motor con: 2 dimensión(es): llm-rag-evals, ml-clasico · todos los tramos
  Banco tras el filtro: 105 preguntas → sesión de 60
```

Y la sesión en sí:

```
Pregunta 3/60  ▓░░░░░░░░░░░░░░░░░
  llm-rag-evals · chunking · media

  En un pipeline RAG, ¿cuál es el motivo principal de usar 'chunk overlap'
  al trocear los documentos?

  Reducir el tamaño total del índice vectorial
❯ Evitar que información relevante quede cortada en el límite entre fragmentos
  Acelerar la generación de embeddings
  Eliminar la necesidad de un modelo de reranking

  ¿Cómo de seguro estás de tu respuesta?
❯ Alta    Estoy muy seguro — sé por qué es esa
  Media   Creo que sí, pero no la firmaría
  Baja    Voy a medias / estoy adivinando
```

**Las opciones se barajan al presentarlas.** Escribiendo preguntas a mano la
correcta acaba casi siempre la primera —en este pack, 223 de 255— y un test que se
adivina por posición no mide nada. Se baraja al mostrar, con la semilla de la
sesión: los `option.id` y el `correct` del YAML no se tocan, así que el scoring,
el historial y el repaso no se enteran. `aptus verify-pack` avisa si un pack
concentra las correctas en una posición.

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
| `aptus ingest <carpeta>` | ingiere material y saca el brief de un pack nuevo |
| `aptus draft <tema>` | borrador de preguntas con LLM (revisión obligatoria) |
| `aptus promote <tema> <dim>` | mueve un borrador revisado a questions/ |

Todos aceptan `-p, --pack <nombre>`. El pack por defecto es `ai-ml-readiness`.

`aptus start` acepta además, para saltarse el asistente (útil en scripts):

| flag | qué hace |
|---|---|
| `-d, --dims <lista>` | dimensiones separadas por comas |
| `-D, --difficulty <nivel>` | `todas` \| `base` \| `alta` \| `experto`, o tramos sueltos (`easy,hard`) |
| `-n, --questions <n>` | cuántas preguntas |
| `-y, --yes` | no preguntar nada: valores por defecto |

Sin TTY (pipes, CI) el asistente no se abre nunca.

## De una fuente a un pack

Construir un pack tiene dos mitades, y están separadas a propósito: una es mecánica
y determinista, la otra juzga.

```
fuente ──▶ aptus ingest / aptus jd --brief ──▶ BRIEF.md ──▶ curación ──▶ drafts/ ──▶ aptus promote ──▶ questions/
           (determinista, sin red)                          (a mano o LLM)          (auditoría)      (ya evalúa)
```

Un brief se llama **igual venga de donde venga**: `BRIEF.md` si cubre el pack entero,
`BRIEF-<tema>.md` si cubre un tema. Nada más. `aptus draft -d <tema>` busca primero el
del tema y se cae al del pack, así que un brief escrito nunca queda sin que lo lea
nadie. El brief de una oferta es el índice del pack que esa oferta necesitaría, así
que se llama igual (`BRIEF-<oferta>.md`) y basta con moverlo dentro de un pack para
que `draft` lo encuentre.

**La mitad mecánica** recorre el material, lo indexa y propone temas contando
títulos y bytes. No entiende nada, y lo dice: el `BRIEF.md` que escribe lleva sus
propios límites impresos dentro.

```bash
aptus ingest ~/curso/sistemas-distribuidos   # carpeta → sources/ + BRIEF.md
aptus jd oferta.txt --brief                  # oferta → brief de lo que te falta
```

Con `aptus jd --brief`, los **puntos ciegos** de la oferta —lo que pide y ningún
pack sabe medir— son el índice del pack que te falta. Y con `--memoria` se cruza
con tu material propio, que responde a la pregunta siguiente: de todo eso, ¿de qué
tienes ya notas y de qué no tienes nada?

```bash
aptus jd oferta.txt --brief --memoria ~/vault
```
```
  ✓ 2 tema(s) ya los mide 'ai-ml-readiness' · 6 tema(s) nuevos que la oferta pide y nadie mide.
    • kafka       ← 1 doc(s) tuyos
    • kubernetes  ← sin material tuyo
    • terraform   ← sin material tuyo
```

**La mitad que juzga** escribe las preguntas. A mano, o con `aptus draft`, que es
lo único de aptus que sale a la red. Su salida va a `drafts/` — fuera de donde el
loader mira, así que **un borrador no puede evaluarte**. Cada pregunta se valida
contra el mismo schema que un pack real, y lo que no pasa se descarta y se dice.

```bash
aptus draft mi-tema -d colas-de-mensajes -n 12   # → packs/mi-tema/drafts/
# ...lo lees entero, corriges lo que esté mal...
aptus promote mi-tema colas-de-mensajes          # → questions/, si pasa la auditoría
```

Ese paso manual es el punto: todo el valor de aptus es que no te mienta sobre lo que
sabes, y una pregunta generada y no revisada te mide contra una respuesta que quizá
está mal. `promote` audita antes de mover y deshace el movimiento si hay errores.
Sin `ANTHROPIC_API_KEY` el resto del CLI funciona exactamente igual.

**`drafts/` SÍ se versiona.** Son contenido en revisión, no ficheros temporales: que
un borrador aparezca en un diff es justo lo que hace que alguien lo lea, y esa lectura
es el paso que separa "lo ha escrito un modelo" de "esto ya puede evaluarte".
Ignorarlo volvería invisible la revisión, y lo invisible no se hace. Lo que no se
versiona es `data/` —el historial, que son datos personales— y ahí sí hay una razón
para esconderlo.

## Instalación

```bash
git clone https://github.com/Portaltocoding/aptus.git
cd aptus
npm install        # compila dist/ mediante `prepare`
npm install -g .   # deja el comando `aptus` en el PATH
aptus              # desde cualquier directorio: abre el menú
```

Requiere Node ≥ 22. Sin instalar nada global, `npm start` desde el repo abre ese
mismo menú.

**Dónde viven tus datos.** Instalado, el historial y los informes van a
`$XDG_DATA_HOME/aptus` (o `~/.local/share/aptus` si no la tienes definida).
Trabajando desde el repo clonado, siguen yendo a `data/<pack>/` del repo, como
siempre. En los dos casos están fuera del control de versiones y fuera del
directorio de instalación: **tus resultados no salen de tu máquina**, y un
`npm update` no se los lleva por delante.

Dos variables mandan sobre eso:

| Variable | Qué hace |
|---|---|
| `APTUS_DATA_DIR` | Dónde se guardan historial e informes. Gana a todo lo demás. |
| `APTUS_PACKS_DIR` | Dónde viven tus packs propios. Por defecto, junto a los datos. |

Los packs que creas (`aptus new-pack`, `aptus ingest`) se escriben ahí, nunca
dentro de la instalación — por eso `aptus packs` lista los del producto y los
tuyos juntos, marcando cuál es cuál.

## Arquitectura

```
src/core/      motores puros: sin I/O, sin reloj, sin aleatoriedad propia
               scoring · calibration · readiness · session · resurfacing
               evolution · market · jd · pack-audit

src/content/   carga y validación de packs (zod), persistencia del historial
               y resolución de rutas (dónde viven packs y datos)

src/cli/       render de terminal, informe HTML, comandos

packs/         los datos: un directorio por tema
```

La regla que sostiene el diseño: **el núcleo es puro**. Nada en `src/core/` lee el
reloj, genera aleatoriedad ni toca disco. El `now` y la función de barajado se
inyectan desde la capa de I/O, así que mismo input produce siempre mismo output.
Por eso los 341 tests corren en menos de dos segundos sin un solo mock.

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
npm test         # 341 tests, 29 ficheros
npm run typecheck
npm run lint
```

Los motores de `src/core/` se testean con fixtures y barajado con semilla. Si un
test necesita un mock de reloj o de disco, es señal de que la lógica se ha escapado
del núcleo.
