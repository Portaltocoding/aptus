# Fuentes del pack 'applied-ai-engineer' (input aislado)

Deja aquí el material de origen de ESTE tema (apuntes, docs, exportaciones, notas).
Este pack es autocontenido y no comparte contexto con otros.

## Cómo se construye
1. Pon el material en esta carpeta `sources/` (o indícame URLs/temario).
2. Se definen las dimensiones en `../pack.yaml`.
3. Se curan las preguntas en `../questions/<dimension>.yaml` (verificando que la
   respuesta correcta lo es), con dificultad hasta `experto`.
4. (Opcional) niveles/roles en `../readiness.yaml` para el readiness por rol.

## Salida
- Contenido: `packs/applied-ai-engineer/`  ·  Resultados de sesión: `data/applied-ai-engineer/` (aislado).
- Jugar: `aptus start --pack applied-ai-engineer`
