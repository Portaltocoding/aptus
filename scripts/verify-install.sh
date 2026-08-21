#!/usr/bin/env bash
#
# Comprueba que aptus funciona INSTALADO, que es otra cosa que "compila".
#
# Empaqueta el repo, instala el tarball en un directorio temporal y ejecuta el
# binario desde FUERA del repo, con el home aislado. Lo que de verdad se está
# demostrando es el fallo que arregla la fase 7: que los datos del usuario se
# escriben en su directorio de datos y NO dentro de la instalación, donde
# `npm update` se los llevaría por delante.
#
# No va en CI: instala de verdad y sería lento y frágil en la matriz de tres
# versiones de Node. Es una comprobación de release que se lanza a mano.
#
# Uso: npm run verify:install

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
TMP_CREADO="$TMP" # el trap solo borra ESTA ruta, y solo si sigue siendo la suya

limpiar() {
  if [ -n "${TMP_CREADO:-}" ] && [ "$TMP_CREADO" = "${TMP:-}" ] && [ -d "$TMP_CREADO" ]; then
    rm -rf "$TMP_CREADO"
  fi
}
trap limpiar EXIT

paso() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
muere() {
  printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2
  exit 1
}

printf '\n\033[1mVerificación de instalación real\033[0m\n'
printf '  repo:     %s\n  temporal: %s\n\n' "$REPO" "$TMP"

# ── 1. Empaquetar ────────────────────────────────────────────────────────────
# `npm pack` dispara `prepare`, así que el tarball lleva un dist/ recién
# compilado por construcción: no se puede verificar un build rancio.
cd "$REPO"
npm pack --pack-destination "$TMP" >/dev/null 2>&1 || muere "npm pack ha fallado"
TARBALL="$(find "$TMP" -maxdepth 1 -name 'aptus-*.tgz' | head -1)"
[ -n "$TARBALL" ] || muere "npm pack no ha dejado ningún tarball en $TMP"
paso "empaquetado: $(basename "$TARBALL")"

# ── 2. Instalar ──────────────────────────────────────────────────────────────
# Todavía con el HOME real, a propósito: la caché de npm vive ahí, y aislar el
# home antes de instalar convertiría esto en una descarga completa cada vez.
# Instalación GLOBAL contra un prefijo temporal: es el mismo camino que
# `npm install -g .` del README, y es el único que produce el enlace en bin/.
npm install -g --prefix "$TMP/install" "$TARBALL" --no-audit --no-fund >/dev/null 2>&1 ||
  muere "la instalación del tarball ha fallado"
INSTALL_PKG="$TMP/install/lib/node_modules/aptus"
[ -d "$INSTALL_PKG" ] || muere "no encuentro el paquete instalado bajo $TMP/install"
paso "instalado en $INSTALL_PKG"

# ── 3. Aislar el entorno ─────────────────────────────────────────────────────
# SOLO ahora. Sin esto, el script escribiría en el home de verdad, que es justo
# lo que no queremos comprobar a base de ensuciarlo.
export HOME="$TMP/home"
export XDG_DATA_HOME="$TMP/home/.local/share"
mkdir -p "$XDG_DATA_HOME"
unset APTUS_DATA_DIR APTUS_PACKS_DIR APTUS_JOBS_DB
paso "entorno aislado (HOME=$HOME)"

# ── 4. Salir del repo ────────────────────────────────────────────────────────
# Todo lo que viene después se ejecuta desde fuera: es el requisito DIST-01.
mkdir -p "$TMP/desde-aqui"
cd "$TMP/desde-aqui"

APTUS="$TMP/install/bin/aptus"
[ -L "$APTUS" ] || [ -f "$APTUS" ] || muere "no hay enlace del binario en $APTUS"
[ -x "$APTUS" ] || muere "$APTUS existe pero no es ejecutable"
paso "binario enlazado y ejecutable: $APTUS"

# ── 5. Responde desde fuera del repo ─────────────────────────────────────────
ESPERADA="$(node -p "require('$REPO/package.json').version")"
OBTENIDA="$("$APTUS" --version)"
[ "$OBTENIDA" = "$ESPERADA" ] ||
  muere "aptus --version dice '$OBTENIDA' y package.json dice '$ESPERADA'"
paso "aptus --version = $OBTENIDA (ejecutado desde $PWD)"

# aptus se instala VACÍO: no viaja contenido en el tarball. Lo que se comprueba
# aquí es que ese estado se explique en vez de parecer una instalación rota.
SALIDA="$("$APTUS" packs)"
echo "$SALIDA" | grep -q 'aptus tema' ||
  muere "una instalación limpia no dice cómo crear el primer pack"
paso "aptus packs, recién instalado, guía a crear el primer pack"

# NEGATIVO: ningún pack ha viajado dentro del tarball.
if [ -d "$INSTALL_PKG/packs" ]; then
  muere "el tarball trae $INSTALL_PKG/packs: aptus tiene que instalarse sin contenido"
fi
paso "NEGATIVO: el tarball no trae ningún pack dentro"

# ── 6. Huella de la instalación ANTES de escribir ────────────────────────────
huella() { (cd "$INSTALL_PKG" && find . -print | LC_ALL=C sort); }
huella >"$TMP/huella-antes.txt"
paso "huella de la instalación tomada ($(wc -l <"$TMP/huella-antes.txt") entradas)"

# ── 7. Una escritura REAL ────────────────────────────────────────────────────
"$APTUS" new-pack prueba-instalacion >/dev/null ||
  muere "aptus new-pack ha fallado en la instalación"

# ── 8. Las DOS caras de la prueba ────────────────────────────────────────────
# Que la huella no cambie NO demuestra que el dato se haya escrito donde toca:
# un new-pack que no escribiera nada en absoluto pasaría esa comprobación. Hay
# que comprobar las dos cosas.

# POSITIVO: el pack está donde debe estar, en el directorio de datos del usuario.
ESPERADO="$XDG_DATA_HOME/aptus/packs/prueba-instalacion/pack.yaml"
[ -f "$ESPERADO" ] || muere "no existe $ESPERADO — el pack no se ha escrito en el directorio de datos del usuario"
paso "POSITIVO: pack.yaml escrito en $ESPERADO"

# NEGATIVO 1: no ha aparecido ningún directorio de datos colgando de la instalación.
for prohibido in "$INSTALL_PKG/data" "$INSTALL_PKG/packs/prueba-instalacion"; do
  if [ -e "$prohibido" ]; then
    muere "ha aparecido $prohibido dentro de la instalación"
  fi
done
paso "NEGATIVO: no hay data/ ni packs propios colgando de la instalación"

# NEGATIVO 2: la instalación es byte a byte la misma lista de ficheros.
huella >"$TMP/huella-despues.txt"
if ! diff -u "$TMP/huella-antes.txt" "$TMP/huella-despues.txt" >"$TMP/huella.diff"; then
  printf '\n  \033[31mLa instalación ha cambiado. Diferencias:\033[0m\n' >&2
  grep -E '^[+-][^+-]' "$TMP/huella.diff" >&2 || true
  muere "la escritura ha tocado el directorio de instalación"
fi
paso "NEGATIVO: la huella de la instalación es idéntica antes y después"

# ── 9. El pack propio se ve y carga ──────────────────────────────────────────
SALIDA="$("$APTUS" packs)"
echo "$SALIDA" | grep -q 'prueba-instalacion' ||
  muere "el pack recién creado no aparece en aptus packs"
paso "aptus packs lista el pack propio"

# Que el nombre salga en un listado no prueba que el contenido cargue. Sale 0
# aunque haya avisos de calidad; solo los errores lo tumban.
"$APTUS" verify-pack prueba-instalacion >/dev/null ||
  muere "aptus verify-pack prueba-instalacion falla: el pack escrito no carga"
paso "aptus verify-pack carga y audita el pack escrito desde la instalación"

# ── Resumen ──────────────────────────────────────────────────────────────────
printf '\n\033[1mTodo verificado sobre una instalación real:\033[0m\n'
printf '  · empaquetado con npm pack (dispara el build) e instalado del tarball\n'
printf '  · --version, packs y verify-pack ejecutados desde %s\n' "$TMP/desde-aqui"
printf '  · el tarball se instaló SIN contenido: ningún pack dentro\n'
printf '  · new-pack escribió en %s\n' "$XDG_DATA_HOME/aptus/packs/prueba-instalacion"
printf '  · la instalación (%s) no ha cambiado ni una entrada\n' "$INSTALL_PKG"
printf '  · el home real no se ha tocado en ningún momento\n\n'
