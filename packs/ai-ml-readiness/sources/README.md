# Fuentes del pack `ai-ml-readiness` (input aislado por tema)

Aquí vive el **material de origen** de este pack, separado del contenido generado.
Cada pack es autocontenido y **no comparte contexto con otros packs**.

## Estructura de un pack (aislamiento por tema)

```
packs/<tema>/
  pack.yaml            # metadata (nombre, versión, dimensiones)
  readiness.yaml       # niveles, perfiles de rol, plan de estudio (opcional)
  questions/           # OUTPUT curado: una <dimension>.yaml por dimensión
    <dimension>.yaml
  sources/             # INPUT: material de origen de ESTE tema (esta carpeta)
    README.md
data/<tema>/           # OUTPUT de sesiones: historial/evolución, aislado por tema
  history.json
```

- Otro tema (p. ej. `packs/psicologia/`) vive en su propia carpeta, con su propio
  `sources/`, sus propias preguntas y su propio `data/psicologia/`. No se tocan.
- El motor carga UN solo pack por ejecución (`aptus start --pack <tema>`); nunca
  mezcla contenido ni resultados entre temas.

## Procedencia de este pack

- **bootcamp-ml-llm** (`~/workspace/bootcamp-ml-llm`): `module_maps.json` (temario
  por módulos m0–m17) usado para anclar dimensiones LLM/RAG/evals, ML clásico,
  AI product & system design y comportamental. Marcadas con `source: bootcamp-ml-llm`.
- **Fuentes externas**: stack profesional (Next/Nest/TS) y marcos universales
  (STAR, system design canónico, papers/herramientas: RAGAS, MTEB, ColBERT, etc.).
  Marcadas con `source: externa`.
- **Perfiles de rol y niveles**: anclados a marcos de leveling y descripciones de
  puesto 2026 (ver `.planning/phases/04-*/04-RESEARCH.md`).

Para crear un pack de un tema nuevo: se deja aquí el material de partida y se cura
`questions/` + `readiness.yaml` a partir de él, verificando correctitud.
