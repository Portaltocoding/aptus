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

// ─── Elegir raíz de pack (puro) ──────────────────────────────────────────────

/** De dónde ha salido un pack: del producto o del usuario. */
export type PackOrigin = "paquete" | "usuario";

/** Presencia del pack en cada raíz, como DATO: así la decisión sigue siendo pura. */
export interface PackPresence {
  enUsuario: boolean;
  enPaquete: boolean;
}

/**
 * Nombre de pack válido. Es la misma exigencia que ya hacía `scaffoldPack`, pero
 * vive aquí porque ahora se comprueba ANTES de componer ninguna ruta: un nombre
 * llega por la CLI, y `..`, `/` o una ruta absoluta no pueden alcanzar un `join`.
 */
export const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function assertPackName(name: string): void {
  if (!PACK_NAME_RE.test(name)) {
    throw new Error(`Nombre de pack inválido: '${name}'. Usa minúsculas, números y guiones.`);
  }
}

/** Se intentó escribir sobre un pack que solo existe dentro de la instalación. */
export class PackReadOnlyError extends Error {
  constructor(
    readonly packName: string,
    userPacksDir: string,
  ) {
    super(
      `El pack '${packName}' viene dentro de la instalación de aptus y es de solo lectura.\n` +
        `  Para trabajarlo como tuyo: cópialo a ${userPacksDir}/${packName}, ` +
        `o define APTUS_PACKS_DIR apuntando a tu directorio de packs.`,
    );
    this.name = "PackReadOnlyError";
  }
}

/** Dónde LEER un pack: el del usuario sombrea al del producto. */
export function choosePackDir(
  name: string,
  presencia: PackPresence,
  rutas: AptusPaths,
): { dir: string; origin: PackOrigin } | null {
  if (presencia.enUsuario) return { dir: join(rutas.userPacksDir, name), origin: "usuario" };
  if (presencia.enPaquete) return { dir: join(rutas.bundledPacksDir, name), origin: "paquete" };
  return null;
}

/**
 * Dónde ESCRIBIR un pack. Lanza `PackReadOnlyError` si el pack solo existe dentro
 * del paquete: es lo que impide que `new-pack`, `ingest`, `draft` o `promote`
 * escriban en `node_modules`.
 */
export function choosePackDirForWrite(
  name: string,
  presencia: PackPresence,
  rutas: AptusPaths,
): string {
  assertPackName(name);
  const destino = join(rutas.userPacksDir, name);

  // Desde el repo las dos raíces son la misma: escribir ahí es lo de siempre y
  // nada es de solo lectura.
  if (rutas.userPacksDir === rutas.bundledPacksDir) return destino;

  if (!presencia.enUsuario && presencia.enPaquete) {
    throw new PackReadOnlyError(name, rutas.userPacksDir);
  }
  return destino;
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
 * `dir` devuelve `null` cuando el pack no existe en ninguna de las raíces miradas;
 * `dirForWrite` lanza `PackReadOnlyError` si el pack es del producto.
 */
export interface PackLocator {
  list(): string[];
  dir(name: string): string | null;
  dirForWrite(name: string): string;
}

/** Localizador sobre UNA sola raíz: para tests y para contextos de raíz única. */
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

/** ¿Hay un pack con ese nombre bajo esa raíz? Presencia = tiene `pack.yaml`. */
function hayPack(root: string, name: string): boolean {
  return existsSync(join(root, name, "pack.yaml"));
}

function presencia(name: string): PackPresence {
  const { bundledPacksDir, userPacksDir } = aptusPaths();
  return { enUsuario: hayPack(userPacksDir, name), enPaquete: hayPack(bundledPacksDir, name) };
}

export interface PackEntry {
  name: string;
  origin: PackOrigin;
  dir: string;
}

/** Los packs visibles: los del producto MÁS los del usuario, sin duplicados. */
export function listPackEntries(): PackEntry[] {
  const rutas = aptusPaths();
  const nombres = mergePackNames(
    listPacks(rutas.bundledPacksDir),
    // Cuando las raíces coinciden (repo) no se lista dos veces.
    rutas.userPacksDir === rutas.bundledPacksDir ? [] : listPacks(rutas.userPacksDir),
  );
  return nombres.flatMap((name) => {
    const elegido = choosePackDir(name, presencia(name), rutas);
    return elegido === null ? [] : [{ name, origin: elegido.origin, dir: elegido.dir }];
  });
}

/** Directorio del que LEER el pack, o `null` si no está en ninguna raíz. */
export function packDirForRead(name: string): string | null {
  return choosePackDir(name, presencia(name), aptusPaths())?.dir ?? null;
}

/** Directorio en el que ESCRIBIR el pack. Lanza `PackReadOnlyError` si es del producto. */
export function packDirForWrite(name: string): string {
  return choosePackDirForWrite(name, presencia(name), aptusPaths());
}

/** Localizador sobre las dos raíces: lo que consume el asistente de arranque. */
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
