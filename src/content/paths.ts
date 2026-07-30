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
 * puro. Dentro, la separación se mantiene igual de estricta: `resolvePaths`,
 * `mergePackNames`, `choosePackDir` y `choosePackDirForWrite` son PURAS y son lo
 * único que se testea; el resto es una capa delgada que las alimenta con disco y
 * entorno.
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
  /** Packs que viajan DENTRO del paquete: el producto. Solo lectura si está instalado. */
  bundledPacksDir: string;
  /** Packs propios del usuario: donde escriben `new-pack` e `ingest`. */
  userPacksDir: string;
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

/**
 * Decide las cuatro rutas. Función PURA: no lee el entorno, no mira el disco, no
 * llama al reloj. Precedencias, en este orden y por esta razón:
 *
 * - `APTUS_DATA_DIR` manda siempre: es la salida explícita para quien quiera otra cosa.
 * - Checkout de desarrollo antes que `XDG_DATA_HOME`: en Linux XDG suele estar
 *   definida, y trabajar desde el repo no debe ensuciar el home.
 * - Instalado: `XDG_DATA_HOME/aptus`, o `~/.local/share/aptus`.
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
        : xdg !== null
          ? join(absoluta(xdg), "aptus")
          : join(home, ".local", "share", "aptus");

  // Los packs del producto viajan dentro del paquete y se resuelven relativos al
  // código: eso es correcto y no cambia (D-05).
  const bundledPacksDir = join(packageRoot, "packs");

  const packsDirExplicito = limpia(env.APTUS_PACKS_DIR);
  const userPacksDir =
    packsDirExplicito !== null
      ? absoluta(packsDirExplicito)
      : isDevCheckout
        ? bundledPacksDir // desde el repo, las dos raíces son la misma de siempre
        : join(dataDir, "packs");

  return { packageRoot, bundledPacksDir, userPacksDir, dataDir };
}

/**
 * Unión ordenada y sin duplicados de los nombres de las dos raíces. Cuál de las
 * dos GANA cuando el nombre coincide lo decide `choosePackDir` (el del usuario),
 * que es quien devuelve un directorio; aquí solo se compone la lista.
 */
export function mergePackNames(delPaquete: string[], delUsuario: string[]): string[] {
  return [...new Set([...delPaquete, ...delUsuario])].sort();
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
 * Cómo se buscan packs, sin que quien busca tenga que saber si hay una raíz o dos.
 * `dir` devuelve `null` cuando el pack no existe en ninguna de las raíces miradas.
 */
export interface PackLocator {
  list(): string[];
  dir(name: string): string | null;
}

/** Localizador sobre UNA sola raíz: para tests y para contextos de raíz única. */
export function singleRootLocator(root: string): PackLocator {
  return {
    list: () => listPacks(root),
    dir: (name) => (existsSync(join(root, name, "pack.yaml")) ? join(root, name) : null),
  };
}
