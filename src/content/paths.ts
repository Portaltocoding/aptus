import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPacks } from "./loader.js";

/**
 * ÚNICO sitio del proyecto que decide dónde está cada cosa en el disco. Antes esta
 * resolución estaba copiada ~10 veces por los comandos, siempre relativa al fichero
 * fuente; instalado, eso escribía el historial dentro de `node_modules/aptus/`,
 * donde `npm update` lo borra y donde muchas veces ni hay permiso de escritura.
 *
 * El módulo vive en `src/content/` porque resolver rutas es I/O: `src/core/` sigue
 * puro. Dentro, la separación se mantiene igual de estricta: `resolvePaths` y
 * `assertPackName` son PURAS y son lo único que se testea; el resto es una capa
 * delgada que las alimenta con disco y entorno.
 *
 * **Aptus no trae contenido.** Hubo un tiempo en que sí: dos packs viajaban dentro
 * del paquete y este módulo distinguía "los del producto" (solo lectura) de "los
 * tuyos". Esa distinción se ha ido entera —con su `PackReadOnlyError`, su
 * sombreado por nombre y su doble raíz— porque ya no modela nada: TODO pack es
 * tuyo, lo hayas escrito a mano o generado con `aptus tema`. Queda una sola raíz
 * de packs, y es de escritura.
 */

export interface PathsEnv {
  APTUS_DATA_DIR?: string;
  APTUS_PACKS_DIR?: string;
  XDG_DATA_HOME?: string;
}

export interface PathsInput {
  /** Raíz del paquete instalado (o del repo, en desarrollo). */
  packageRoot: string;
  home: string;
  /** ¿Estamos ejecutando desde un checkout del repo en vez de una instalación? */
  isDevCheckout: boolean;
  env: PathsEnv;
}

export interface AptusPaths {
  packageRoot: string;
  /** Tus packs: lo único que hay. Siempre de escritura. */
  packsDir: string;
  /** Historial de sesiones e informes: datos personales, nunca dentro de la instalación. */
  dataDir: string;
}

/** Una variable vacía o de solo espacios es una variable NO definida. */
function limpia(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const t = valor.trim();
  return t.length === 0 ? null : t;
}

/** Absolutiza una ruta que venga del entorno, relativa al directorio de trabajo. */
function absoluta(ruta: string): string {
  return isAbsolute(ruta) ? ruta : resolve(ruta);
}

/** Raíz de datos del usuario según XDG, con el respaldo de siempre. */
function xdgAptus(home: string, xdg: string | null): string {
  return xdg !== null ? join(absoluta(xdg), "aptus") : join(home, ".local", "share", "aptus");
}

/**
 * Decide las tres rutas. Función PURA: no lee el entorno, no mira el disco, no
 * llama al reloj. Precedencias, en este orden y por esta razón:
 *
 * - `APTUS_DATA_DIR` / `APTUS_PACKS_DIR` mandan siempre: son la salida explícita
 *   para quien quiera otra cosa.
 * - Los RESULTADOS siguen la regla de siempre: desde un checkout del repo van a
 *   `<repo>/data` (que está en .gitignore), para que trabajar sobre el código no
 *   ensucie el home ni mezcle pruebas con historial de verdad.
 * - Los PACKS no siguen esa regla, y la asimetría es deliberada. Un pack es
 *   contenido que TÚ escribes, no un subproducto del checkout: tiene que estar en
 *   el mismo sitio lo ejecutes desde el repo o desde una instalación global, o
 *   `aptus packs` diría cosas distintas según desde dónde lo llames y tendrías el
 *   mismo tema duplicado en dos discos.
 */
export function resolvePaths(input: PathsInput): AptusPaths {
  const { packageRoot, home, isDevCheckout, env } = input;

  const dataDirExplicito = limpia(env.APTUS_DATA_DIR);
  const xdg = limpia(env.XDG_DATA_HOME);

  const dataDir =
    dataDirExplicito !== null
      ? absoluta(dataDirExplicito)
      : isDevCheckout
        ? join(packageRoot, "data")
        : xdgAptus(home, xdg);

  const packsDirExplicito = limpia(env.APTUS_PACKS_DIR);
  const packsDir =
    packsDirExplicito !== null ? absoluta(packsDirExplicito) : join(xdgAptus(home, xdg), "packs");

  return { packageRoot, packsDir, dataDir };
}

// ─── Nombres de pack ─────────────────────────────────────────────────────────

/**
 * Nombre de pack válido. Se comprueba ANTES de componer ninguna ruta: un nombre
 * llega por la CLI, y `..`, `/` o una ruta absoluta no pueden alcanzar un `join`.
 */
export const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function assertPackName(name: string): void {
  if (!PACK_NAME_RE.test(name)) {
    throw new Error(`Nombre de pack inválido: '${name}'. Usa minúsculas, números y guiones.`);
  }
}

// ─── Capa impura: entorno y disco ────────────────────────────────────────────

/**
 * Raíz del paquete, derivada de la URL de este módulo subiendo dos niveles.
 * `src/content/paths.ts` y `dist/content/paths.js` están a la misma profundidad,
 * así que da la raíz correcta en el repo y en una instalación.
 */
function packageRootFromModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

/**
 * ACOPLAMIENTO DELIBERADO con el campo `files` de package.json: la allowlist NO
 * empaqueta `src/`, así que la presencia de `src/index.ts` junto a la raíz es lo
 * que distingue un checkout del repo de una instalación. Si algún día `src/`
 * pasara a viajar en el tarball, esta detección dejaría de funcionar y los datos
 * volverían a escribirse dentro de la instalación.
 */
function detectDevCheckout(packageRoot: string): boolean {
  return existsSync(join(packageRoot, "src", "index.ts"));
}

let cache: AptusPaths | null = null;

/** Las rutas efectivas de este proceso. Se resuelven una vez y se memoizan. */
export function aptusPaths(): AptusPaths {
  if (cache !== null) return cache;
  const packageRoot = packageRootFromModule();
  cache = resolvePaths({
    packageRoot,
    home: homedir(),
    isDevCheckout: detectDevCheckout(packageRoot),
    env: {
      APTUS_DATA_DIR: process.env.APTUS_DATA_DIR,
      APTUS_PACKS_DIR: process.env.APTUS_PACKS_DIR,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    },
  });
  return cache;
}

/** Solo para tests: olvida la memoización. */
export function resetPathsCache(): void {
  cache = null;
}

/**
 * Crea el directorio con modo 0700. El historial son datos personales y ahora vive
 * en el home, donde el modo por defecto sería más abierto: en una máquina
 * compartida, otro usuario no tiene por qué poder leer tus resultados.
 */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/**
 * Cómo se buscan packs, sin que quien busca tenga que saber dónde viven.
 * `dir` devuelve `null` cuando el pack no existe; `dirForWrite` compone la ruta
 * en la que escribirlo, exista o no.
 */
export interface PackLocator {
  list(): string[];
  dir(name: string): string | null;
  dirForWrite(name: string): string;
}

/** Localizador sobre una raíz concreta: para tests y para contextos aislados. */
export function singleRootLocator(root: string): PackLocator {
  return {
    list: () => listPacks(root),
    dir: (name) => (existsSync(join(root, name, "pack.yaml")) ? join(root, name) : null),
    dirForWrite: (name) => {
      assertPackName(name);
      return join(root, name);
    },
  };
}

export interface PackEntry {
  name: string;
  dir: string;
}

/** Los packs que tienes. Lista vacía = aptus recién instalado, que es lo normal. */
export function listPackEntries(): PackEntry[] {
  const { packsDir } = aptusPaths();
  return listPacks(packsDir).map((name) => ({ name, dir: join(packsDir, name) }));
}

/** Directorio del que LEER el pack, o `null` si no existe. */
export function packDirForRead(name: string): string | null {
  const { packsDir } = aptusPaths();
  return existsSync(join(packsDir, name, "pack.yaml")) ? join(packsDir, name) : null;
}

/** Directorio en el que ESCRIBIR el pack. No exige que exista todavía. */
export function packDirForWrite(name: string): string {
  assertPackName(name);
  return join(aptusPaths().packsDir, name);
}

/** Localizador sobre tus packs: lo que consume el asistente de arranque. */
export function defaultPackLocator(): PackLocator {
  return {
    list: () => listPackEntries().map((e) => e.name),
    dir: (name) => packDirForRead(name),
    dirForWrite: (name) => packDirForWrite(name),
  };
}

/** Directorio de resultados de un pack (aislado por tema), fuera de la instalación. */
export function packDataDir(name: string): string {
  return join(aptusPaths().dataDir, name);
}

/** Fichero de historial de un pack. */
export function historyPath(name: string): string {
  return join(packDataDir(name), "history.json");
}

/**
 * Fichero de la sesión en pausa de un pack. UNA por pack a propósito: retomar
 * tiene que ser "sigue donde lo dejaste", no elegir entre siete sesiones a medias
 * de las que ya no te acuerdas.
 */
export function pausedPath(name: string): string {
  return join(packDataDir(name), "paused.json");
}
