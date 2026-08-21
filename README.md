# Aptus

![tests](https://github.com/Portaltocoding/aptus/actions/workflows/test.yml/badge.svg)
![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)

Motor de evaluación de aptitud por terminal, *data driven* mediante **packs de
conocimiento** intercambiables.

El motor (selección equilibrada, scoring por dimensión, calibración, readiness por
rol, gaps y repaso espaciado) no sabe de qué tema evalúa. Cada dominio evaluable es
un pack en YAML: banco de preguntas, baselines y perfiles de rol. Añadir un tema
nuevo no toca ni una línea de TypeScript.

**aptus viene vacío.** No trae temario de fábrica: el contenido lo pones tú, y
`aptus tema <tema>` lo monta de una pasada —investiga el tema, lo parte en
dimensiones y escribe los borradores— para que el primer día no sea escribir 300
preguntas a mano. Lo que genera aterriza en `drafts/`, que no evalúa hasta que lo
lees: esa parte no la automatiza nadie, y es a propósito.

## Qué hace una sesión

`aptus` a secas abre el menú principal, que es el sitio al que se vuelve: cada
acción termina y te deja otra vez ahí. **ESC vuelve atrás** en cualquier pantalla
—un paso del asistente, un prompt a medias, el menú mismo— y en mitad de una
sesión abre el menú de salida (seguir, terminar y evaluar, pausar, o descartar)
antes de tirar lo que llevas respondido.

```
aptus ──────────────────────────────────────────────────────────

›   ¿Qué hacemos?  (esc vuelve atrás · salir)
❯ Empezar una sesión     Medir: eliges pack, dimensiones y dificultad.
  Repasar                Estudiar lo que peor llevas. No mide.
  Ver el historial       Sesiones guardadas y evolución entre ellas.
  Borrar una sesión      Quitar una del historial. No se puede deshacer.
  Evaluar una oferta     Tu readiness contra una oferta concreta (o su brief).
  Generar un tema nuevo  De un tema a un pack entero: investiga y escribe.
  Ingerir material       Una carpeta → el brief de un pack nuevo.
  Crear un pack nuevo    El esqueleto de un tema: pack.yaml y questions/.
  Borrador con LLM       Lo único que sale a la red: necesita API key.
  Promover un borrador   drafts/ → questions/: lo hace evaluable.
```

El menú expone también la construcción de packs, no solo el consumirlos. El
borrador con LLM avisa de que faltan credenciales **antes** de preguntarte nada,
en vez de hacerte recorrer el asistente para fallar al final; y promover pregunta
si has leído el borrador, porque la auditoría comprueba la forma y no si la
respuesta marcada es la correcta.

La interfaz se dibuja con el **ancho real del terminal** (con tope, para que una
regla no cruce un monitor de 300 columnas). Sin TTY —pipes, CI— usa 72 columnas
y la salida es byte a byte la de siempre: un mismo comando redirigido no puede
producir ficheros distintos según quién lo lance.

Con cualquier subcomando (o sin TTY: scripts, CI, pipes) se comporta como
siempre — el menú llama a los mismos comandos, no los reimplementa.

`aptus start` abre un asistente antes de preguntar nada: sobre qué pack te
evalúas, qué dimensiones entran, a qué nivel de dificultad y cuántas preguntas.
Antes de empezar dice con qué se está alimentando el motor y avisa si el filtro
deja una muestra demasiado corta para concluir nada.

*(Los ejemplos de aquí abajo salen de un pack propio de 255 preguntas sobre IA/ML.
No viene con aptus: es el aspecto que tiene un pack tuyo una vez montado.)*

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
  al trocear los documentos?               ← enunciado en cian y negrita


  Reducir el tamaño total del índice vectorial
❯ Evitar que información relevante quede cortada en el límite entre       ← en amarillo
  Acelerar la generación de embeddings
  Eliminar la necesidad de un modelo de reranking

   │ El solape paga tokens repetidos a cambio de que una frase partida
   │ por la mitad siga entera en algún fragmento.      ← apunte de ESA opción

  ¿Cómo de seguro estás de tu respuesta?
❯ Alta    Estoy muy seguro — sé por qué es esa
  Media   Creo que sí, pero no la firmaría
  Baja    Voy a medias / estoy adivinando
```

**Tres niveles, tres colores.** La cabecera va tenue, el enunciado en cian y
negrita y las respuestas en el color normal, con la que tienes bajo el cursor en
amarillo. Antes enunciado y opciones se distinguían solo por la negrita y se leían
como un bloque de texto seguido. El enunciado se ajusta al ancho real del terminal
—salvo los de tipo `diagrama` y `codigo`, que se indentan verbatim— y hay aire
entre la pregunta y sus respuestas, y entre un bloque y el siguiente.

**Poner el cursor sobre una respuesta enseña su apunte.** Es el `rationale`
opcional de cada opción del pack: una o dos frases que *argumentan a favor de esa
opción* ("bajar de modelo abarata: sus tokens cuestan menos por millón"), o un
diagrama corto, que se respeta tal cual. Va en **todas** las opciones, también en
los distractores, y nunca dice cuál es la correcta: eso es la `explanation`, y esa
solo se ve al repasar los fallos, después de responder. Una opción sin `rationale`
no enseña nada — antes que un margen vacío, ninguno.

**Se puede parar en la pregunta que sea.** ESC en mitad de una sesión abre un
menú, no un sí/no:

```
  ¿Qué hago con la sesión? Llevas 30 respuestas.  (esc vuelve atrás y sigues)
❯ Seguir respondiendo               vuelves a la misma pregunta, todo intacto
  Terminar aquí y evaluar           puntúa las 30 que llevas y guarda la sesión
  Pausar y seguir en otro momento   se guarda dónde vas; vuelves con `aptus resume`
  Salir y descartar                 no se puntúa ni se guarda nada
```

*Terminar* evalúa **solo lo respondido**: da igual que sea la pregunta 10 o la 30.
Las que no llegaste a ver no cuentan como presentadas —puntuarlas como falladas
sería medirte por preguntas que nadie te enseñó—, y el aviso lo dice arriba en vez
de dejar que lo deduzcas de un N pequeño. La sesión se guarda en el historial como
cualquier otra.

*Pausar* guarda la sesión a medias (una por pack) y no puntúa nada. Al retomarla
vuelven las mismas preguntas, en el mismo orden, con las opciones en el mismo sitio
y tus respuestas puestas: se guardan ids, así que si editaste una pregunta te sale
la versión de hoy, y si la retiraste del pack, se cae de la sesión y se te dice.
Con una sesión en pausa, el menú principal la ofrece la primera y `aptus start` te
pregunta si retomarla antes de empezar otra.

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
| `aptus resume` | retoma la sesión que dejaste en pausa, donde la dejaste |
| `aptus review` | repaso espaciado de lo que peor llevas (estudio, no medición) |
| `aptus history` | historial de sesiones y evolución entre ellas |
| `aptus history --delete` | borra una sesión concreta (la eliges y la confirmas) |
| `aptus report` | informe HTML local y autocontenido, sin salir a la red |
| `aptus packs` | lista los packs disponibles |
| `aptus new-pack <nombre>` | genera el esqueleto aislado de un pack nuevo |
| `aptus verify-pack [nombre]` | audita la calidad de un pack (curadas, no relleno) |
| `aptus jd <fichero>` | evalúa tu readiness contra una oferta concreta |
| `aptus jobs` | evalúa en bloque ofertas ya escaneadas (integración opcional) |
| `aptus tema <nombre>` | de un tema a un pack: investiga, lo parte y escribe los borradores |
| `aptus ingest <carpeta>` | ingiere material y saca el brief de un pack nuevo |
| `aptus draft <tema>` | borrador de preguntas con LLM (revisión obligatoria) |
| `aptus promote <tema> <dim>` | mueve un borrador revisado a questions/ |

Todos aceptan `-p, --pack <nombre>`. Sin ese flag: si solo tienes un pack, se usa
ése; si tienes varios, hay que decir cuál —elegir por ti sería decidir sobre qué te
evalúas sin decírtelo—; y si no tienes ninguno, te dice cómo crear el primero.

`aptus tema` acepta `-m, --material <carpeta>` para partir de material tuyo en vez
de investigar en la web, `-d, --dims <lista>` para imponer las dimensiones en lugar
de dejar que las proponga el modelo, y `-n, --count <n>` para cuántas preguntas
pedir por dimensión.

`aptus review` acepta `-d, --dims <lista>` para acotar el repaso a unas
dimensiones, y `-y, --yes` para no preguntar. Acotar elige **qué estudias**, no
qué se mide: la tanda sigue saliendo de tus fallos, así que sigue sin dar
readiness ni gaps.

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

tema ────▶ aptus tema <tema> ─────────────────────────────────────────▶ drafts/ ──▶ aptus promote ──▶ questions/
           (recorre el camino entero de una pasada)                                 (sigue siendo tuyo)
```

`aptus tema` no es un camino distinto: es ese mismo, recorrido de una pasada. Crea
el pack, consigue el material (lo investiga, o lee el tuyo con `--material`), parte
el tema en dimensiones, escribe el `BRIEF.md` y llama a `draft` una vez por
dimensión. Lo que no hace —y por eso el resumen final habla de lo que falta en vez
de celebrar seis ficheros nuevos— es promover nada.

```bash
aptus tema sistemas-distribuidos              # investiga y escribe los borradores
aptus tema redes -m ~/curso/redes -n 15       # partiendo de material tuyo
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
aptus draft mi-tema -d colas-de-mensajes -n 12   # → mi-tema/drafts/
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
| `APTUS_PACKS_DIR` | Dónde viven tus packs. Por defecto, `$XDG_DATA_HOME/aptus/packs`. |

**Los packs no siguen la regla del repo, y es deliberado.** Los resultados sí: desde
un checkout van a `data/` del repo, para que trastear con el código no ensucie el
home ni mezcle pruebas con historial de verdad. Un pack, en cambio, es contenido que
escribes tú, no un subproducto del checkout: está en el mismo sitio lo ejecutes desde
donde lo ejecutes. Si tuviera una copia por checkout, acabarías con el mismo tema
duplicado en dos discos y `aptus packs` diría cosas distintas según desde dónde lo
llamaras.

## Arquitectura

```
src/core/      motores puros: sin I/O, sin reloj, sin aleatoriedad propia
               scoring · calibration · readiness · session · resurfacing
               evolution · market · jd · pack-audit

src/content/   carga y validación de packs (zod), persistencia del historial
               y resolución de rutas (dónde viven packs y datos)

src/cli/       render de terminal, informe HTML, comandos
```

No hay `packs/` en el repo: el contenido no vive aquí. Un pack de test completo
—con vocabulario inventado— vive en `test/fixtures/packs/` para que los tests de
integración recorran el camino entero sin depender de ningún dominio real.

La regla que sostiene el diseño: **el núcleo es puro**. Nada en `src/core/` lee el
reloj, genera aleatoriedad ni toca disco. El `now` y la función de barajado se
inyectan desde la capa de I/O, así que mismo input produce siempre mismo output.
Por eso los 691 tests corren en menos de dos segundos sin un solo mock.

## Anatomía de un pack

```
<tus-packs>/sistemas-distribuidos/
├── pack.yaml          nombre, versión y lista de dimensiones
├── readiness.yaml     perfiles de rol y baselines de nivel
├── questions/         un YAML por dimensión
└── sources/           de dónde salió el contenido
```

Cada pregunta declara dimensión, subtema, dificultad, roles a los que aplica,
opciones, respuesta, explicación y **`source`**, que permite auditar el sesgo de
autocuración: cuánto del pack viene de una fuente propia y cuánto de fuera.

Cada opción admite además un **`rationale`** opcional: el apunte que sale al poner
el cursor encima durante la sesión. Los packs escritos antes de que existiera el
campo siguen cargando igual (y no enseñan apunte).

```yaml
options:
  - id: a
    text: "Cambiar a un modelo más pequeño para todo el tráfico"
    rationale: "Abarata directo: los tokens de un modelo pequeño cuestan
      varias veces menos por millón, y la factura es lineal en tokens."
  - id: b
    text: "Cachear las respuestas de los prompts repetidos"
    rationale: "Lo que se sirve de caché no paga inferencia ni espera al modelo."
```

Se escribe para **todas** las opciones, argumentando a favor de cada una como lo
haría quien la eligiera. Si solo lo tuviera la correcta —o si fuera visiblemente
más larga o más segura que las demás—, el apunte delataría la respuesta y el test
dejaría de medir. `aptus draft` los pide ya al modelo con esa misma regla.

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
npm test         # 691 tests, 39 ficheros
npm run typecheck
npm run lint
```

Los motores de `src/core/` se testean con fixtures y barajado con semilla. Si un
test necesita un mock de reloj o de disco, es señal de que la lógica se ha escapado
del núcleo.
