---
name: build-pack
description: Construye un pack de conocimiento de aptus para un tema nuevo a partir de fuentes que señale Carlos (material en sources/, URLs, temario o un repo). Úsalo cuando pida "hazme un pack de X", "monta un tema nuevo", "te doy estas fuentes y me armas el test" o similar.
---

# Construir un pack de aptus desde fuentes

Convierte "aquí tienes un tema + info" en un pack curado, aislado y verificado.

## Principio no negociable

**Curadas, no relleno.** Cada pregunta debe ser técnicamente correcta y su respuesta
marcada, verdadera. Si no estás seguro de una respuesta, **no la incluyas**. Es
preferible un pack más corto y correcto que uno grande y mentiroso: todo el valor de
aptus es que no te engañe sobre lo que sabes.

## Pipeline

### 1. Esqueleto aislado
```bash
cd ~/workspace/aptus && npx tsx src/index.ts new-pack <tema>
```
Crea `packs/<tema>/` (pack.yaml + questions/ + sources/). Cada tema es autocontenido:
**nunca mezcles contenido ni resultados entre packs**.

### 2. Entender las fuentes (input)
- Material en `packs/<tema>/sources/` (léelo), o URLs/temario que dé Carlos.
- Si hay huecos, investiga (WebSearch/WebFetch) y **cita** de dónde sale.
- Si el tema es amplio, pregunta el alcance antes de currar 50 preguntas de algo equivocado.

### 3. Definir dimensiones (`pack.yaml`)
3-6 dimensiones **derivadas de las fuentes**, no inventadas. Nombres en kebab-case.
El motor no las conoce: viven solo en el pack (ENG-04).

### 4. Curar las preguntas (`questions/<dimension>.yaml`)
Un fichero por dimensión. Objetivo por defecto **~50 por dimensión** (mínimo 12).

Cada pregunta:
- `id`: `<dimension>-NNN`, único en todo el pack.
- `difficulty`: reparte los 4 tramos. **Incluye siempre algunas `experto`** o el nivel
  staff no será evaluable en esa dimensión.
- `type`: varía formatos. `concepto`, `diagrama` (ASCII multilínea en el `stem`),
  `codigo` (snippet con un fallo real), `escenario` (caso práctico).
- `options`: 4 preferiblemente. **Distractoras plausibles**, no de relleno obvio.
- `correct`: verificada. Una sola (salvo que el tema pida varias).
- `explanation`: real, explica POR QUÉ es correcta (y por qué las otras no).
- `source`: procedencia auditable. Distingue material propio/autoseleccionado de
  fuentes externas independientes (permite auditar el sesgo de autocuración).
- `subtopic`, `roles`, `date`: rellénalos.

**No dupliques conceptos** ya cubiertos: revisa lo existente antes de añadir.

### 5. Readiness (`readiness.yaml`) — opcional
Solo si el tema tiene niveles/roles con sentido. Si no (trivia, cultura general),
**omite el fichero**: el pack funciona igual con resultado por dimensión + calibración.

Si lo incluyes:
- `levels`: umbral por tramo de dificultad, creciente. Staff exige `experto` > 0 y
  `breadth` (competencia también en las dimensiones secundarias del rol).
- `roles`: `core` (definen el nivel) / `secondary` (amplitud) + `source` **citando la
  referencia externa** que ancla ese perfil (no la opinión del curador).
- `study`: recurso concreto por dimensión ("te falta X → haz Z").
- `market_keywords`: **solo si el tema es de empleo** (cruce con jobhunt). Si no, omitir.

### 6. Verificar (obligatorio)
```bash
npx tsx src/index.ts verify-pack <tema>   # 0 errores; resuelve los avisos
npx tsc --noEmit && npx vitest run        # nada roto
npx tsx src/index.ts start --pack <tema>  # arranca (Ctrl+C tras ver la 1ª pregunta)
```

### 7. Commit
Commits atómicos por dimensión: `content(<tema>): <dimension> a N (+X, incl. experto)`.

## Mecánica de escritura (importante)

Los enunciados multilínea (diagramas ASCII, código) rompen el YAML a mano. **Escribe las
preguntas con un script Node** que use el `yaml` del proyecto: parsea el fichero
existente, añade los objetos nuevos y reescribe con `stringify`. Así el YAML siempre sale
válido y no duplicas ids.

```js
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "<ruta>/node_modules/yaml/dist/index.js";
const existing = parse(readFileSync(FILE, "utf8"));
const all = [...existing, ...nuevas];
writeFileSync(FILE, header + stringify(all), "utf8");
// comprobar ids duplicados antes de escribir
```

## Ritmo de trabajo

Ve **dimensión por dimensión** (una tanda = una dimensión completa), verificando y
commiteando cada una. No intentes las 250 de golpe: la calidad se cae y no se termina.
Reporta el progreso (`X/objetivo`) al acabar cada tanda.

## Lo que este proyecto NUNCA hace

- Un score único agregado de "empleabilidad" o "probabilidad de contratación".
- Mostrar un porcentaje sin su N al lado.
- Conceder un nivel (p. ej. staff) sin evidencia en el tramo que exige.
- Meter conocimiento del dominio en `src/` (el motor es agnóstico; todo va en `packs/`).
