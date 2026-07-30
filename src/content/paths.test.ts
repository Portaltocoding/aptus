import { describe, expect, it } from "vitest";
import { isAbsolute, join, sep } from "node:path";
import {
  PackReadOnlyError,
  choosePackDir,
  choosePackDirForWrite,
  mergePackNames,
  resolvePaths,
  type PathsInput,
} from "./paths.js";

/**
 * Tests de la resolución de rutas: PUROS, sin tocar disco ni leer el entorno.
 * Todo lo que la decisión necesita (raíz del paquete, home, si estamos en un
 * checkout, variables) entra como dato. Es lo que permite comprobar aquí el fallo
 * de fondo de la fase —los datos del usuario escribiéndose dentro de la
 * instalación— sin instalar nada.
 */

const PAQUETE = "/opt/lib/node_modules/aptus";
const CASA = "/home/carlos";

function entrada(over: Partial<PathsInput> = {}): PathsInput {
  return { packageRoot: PAQUETE, home: CASA, isDevCheckout: false, env: {}, ...over };
}

/** ¿`hijo` cuelga de `padre`? Comparación por segmentos, no por prefijo de texto. */
function cuelgaDe(padre: string, hijo: string): boolean {
  return hijo === padre || hijo.startsWith(padre + sep);
}

describe("resolvePaths — dónde viven los datos del usuario", () => {
  it("sin variables y sin checkout, usa ~/.local/share/aptus", () => {
    expect(resolvePaths(entrada()).dataDir).toBe(join(CASA, ".local", "share", "aptus"));
  });

  it("respeta XDG_DATA_HOME cuando está definida", () => {
    const { dataDir } = resolvePaths(entrada({ env: { XDG_DATA_HOME: "/var/xdg" } }));
    expect(dataDir).toBe(join("/var/xdg", "aptus"));
  });

  it("APTUS_DATA_DIR gana a XDG_DATA_HOME", () => {
    const { dataDir } = resolvePaths(
      entrada({ env: { APTUS_DATA_DIR: "/mis/datos", XDG_DATA_HOME: "/var/xdg" } }),
    );
    expect(dataDir).toBe("/mis/datos");
  });

  it("APTUS_DATA_DIR gana también al checkout de desarrollo: la variable explícita manda siempre", () => {
    const { dataDir } = resolvePaths(
      entrada({ isDevCheckout: true, env: { APTUS_DATA_DIR: "/mis/datos" } }),
    );
    expect(dataDir).toBe("/mis/datos");
  });

  it("en checkout de desarrollo usa data/ del repo AUNQUE XDG_DATA_HOME esté definida", () => {
    // En Linux XDG_DATA_HOME suele estar puesta, así que el orden importa:
    // trabajar desde el repo no debe ensuciar el home.
    const { dataDir } = resolvePaths(
      entrada({ isDevCheckout: true, env: { XDG_DATA_HOME: "/var/xdg" } }),
    );
    expect(dataDir).toBe(join(PAQUETE, "data"));
  });

  it("una variable vacía o de solo espacios cuenta como no definida", () => {
    // Un `export APTUS_DATA_DIR=` no puede acabar resolviendo a la raíz del sistema.
    for (const vacia of ["", "   ", "\t"]) {
      const { dataDir } = resolvePaths(entrada({ env: { APTUS_DATA_DIR: vacia } }));
      expect(dataDir).toBe(join(CASA, ".local", "share", "aptus"));
    }
    const { userPacksDir } = resolvePaths(entrada({ env: { APTUS_PACKS_DIR: "  " } }));
    expect(userPacksDir).toBe(join(CASA, ".local", "share", "aptus", "packs"));
  });

  it("absolutiza las rutas relativas que lleguen por variable", () => {
    const { dataDir, userPacksDir } = resolvePaths(
      entrada({ env: { APTUS_DATA_DIR: "./datos", APTUS_PACKS_DIR: "packs-propios" } }),
    );
    expect(isAbsolute(dataDir)).toBe(true);
    expect(isAbsolute(userPacksDir)).toBe(true);
    expect(dataDir.endsWith(`${sep}datos`)).toBe(true);
    expect(userPacksDir.endsWith(`${sep}packs-propios`)).toBe(true);
  });
});

describe("resolvePaths — dónde viven los packs", () => {
  it("los packs del producto siempre salen del paquete", () => {
    expect(resolvePaths(entrada()).bundledPacksDir).toBe(join(PAQUETE, "packs"));
    expect(resolvePaths(entrada({ isDevCheckout: true })).bundledPacksDir).toBe(
      join(PAQUETE, "packs"),
    );
  });

  it("en checkout de desarrollo, los packs del usuario SON los del repo", () => {
    // Trabajar desde el repo se comporta exactamente igual que antes de esta fase.
    const p = resolvePaths(entrada({ isDevCheckout: true }));
    expect(p.userPacksDir).toBe(p.bundledPacksDir);
  });

  it("instalado, los packs del usuario cuelgan del directorio de datos", () => {
    const p = resolvePaths(entrada());
    expect(p.userPacksDir).toBe(join(p.dataDir, "packs"));
  });

  it("APTUS_PACKS_DIR gana en los dos escenarios", () => {
    for (const isDevCheckout of [true, false]) {
      const { userPacksDir, bundledPacksDir } = resolvePaths(
        entrada({ isDevCheckout, env: { APTUS_PACKS_DIR: "/mis/packs" } }),
      );
      expect(userPacksDir).toBe("/mis/packs");
      // Los del producto no se mueven: siguen viajando dentro del paquete.
      expect(bundledPacksDir).toBe(join(PAQUETE, "packs"));
    }
  });
});

describe("resolvePaths — PROPIEDAD: instalado, nada del usuario cae dentro de la instalación", () => {
  // Es literalmente el fallo que arregla esta fase (npm update borraría el
  // historial), así que se asserta como propiedad sobre todas las combinaciones
  // de entorno que NO apunten a propósito dentro del paquete.
  const entornos: PathsInput["env"][] = [
    {},
    { XDG_DATA_HOME: "/var/xdg" },
    { APTUS_DATA_DIR: "/mis/datos" },
    { APTUS_PACKS_DIR: "/mis/packs" },
    { APTUS_DATA_DIR: "/mis/datos", APTUS_PACKS_DIR: "/mis/packs" },
    { APTUS_DATA_DIR: "", XDG_DATA_HOME: "" },
    { XDG_DATA_HOME: "/var/xdg", APTUS_PACKS_DIR: "/mis/packs" },
  ];

  for (const env of entornos) {
    it(`ni dataDir ni userPacksDir cuelgan del paquete con env=${JSON.stringify(env)}`, () => {
      const p = resolvePaths(entrada({ env }));
      expect(cuelgaDe(p.packageRoot, p.dataDir)).toBe(false);
      expect(cuelgaDe(p.packageRoot, p.userPacksDir)).toBe(false);
    });
  }

  it("en checkout de desarrollo SÍ cuelgan, que es lo que se quiere en el repo", () => {
    const p = resolvePaths(entrada({ isDevCheckout: true }));
    expect(cuelgaDe(p.packageRoot, p.dataDir)).toBe(true);
    expect(cuelgaDe(p.packageRoot, p.userPacksDir)).toBe(true);
  });
});

describe("mergePackNames", () => {
  it("une las dos raíces sin duplicados y ordenado", () => {
    expect(mergePackNames(["ai-ml-readiness", "sistemas"], ["propio", "ai-ml-readiness"])).toEqual([
      "ai-ml-readiness",
      "propio",
      "sistemas",
    ]);
  });

  it("un pack que solo está en una raíz aparece igual", () => {
    expect(mergePackNames(["solo-paquete"], [])).toEqual(["solo-paquete"]);
    expect(mergePackNames([], ["solo-usuario"])).toEqual(["solo-usuario"]);
  });

  it("dos raíces idénticas (el caso del repo) no duplican nada", () => {
    const nombres = ["ai-ml-readiness", "otro"];
    expect(mergePackNames(nombres, nombres)).toEqual(nombres);
  });

  it("sin packs en ninguna raíz devuelve lista vacía", () => {
    expect(mergePackNames([], [])).toEqual([]);
  });
});

describe("choosePackDir — de dónde se LEE un pack", () => {
  const rutas = resolvePaths(entrada());

  it("si está en el usuario, gana el del usuario (sombrea al del producto)", () => {
    expect(choosePackDir("x", { enUsuario: true, enPaquete: true }, rutas)).toEqual({
      dir: join(rutas.userPacksDir, "x"),
      origin: "usuario",
    });
    expect(choosePackDir("x", { enUsuario: true, enPaquete: false }, rutas)).toEqual({
      dir: join(rutas.userPacksDir, "x"),
      origin: "usuario",
    });
  });

  it("si solo está en el paquete, se lee del paquete", () => {
    expect(choosePackDir("x", { enUsuario: false, enPaquete: true }, rutas)).toEqual({
      dir: join(rutas.bundledPacksDir, "x"),
      origin: "paquete",
    });
  });

  it("si no está en ninguno, null", () => {
    expect(choosePackDir("x", { enUsuario: false, enPaquete: false }, rutas)).toBeNull();
  });

  it("desde el repo, las dos raíces coinciden y sale el directorio de siempre", () => {
    const repo = resolvePaths(entrada({ isDevCheckout: true }));
    const elegido = choosePackDir("x", { enUsuario: true, enPaquete: true }, repo);
    expect(elegido?.dir).toBe(join(PAQUETE, "packs", "x"));
  });
});

describe("choosePackDirForWrite — dónde se ESCRIBE un pack", () => {
  const rutas = resolvePaths(entrada());

  it("si ya está en el usuario, se escribe ahí", () => {
    expect(choosePackDirForWrite("x", { enUsuario: true, enPaquete: false }, rutas)).toBe(
      join(rutas.userPacksDir, "x"),
    );
    expect(choosePackDirForWrite("x", { enUsuario: true, enPaquete: true }, rutas)).toBe(
      join(rutas.userPacksDir, "x"),
    );
  });

  it("si no existe en ninguno, se creará en el del usuario", () => {
    expect(choosePackDirForWrite("x", { enUsuario: false, enPaquete: false }, rutas)).toBe(
      join(rutas.userPacksDir, "x"),
    );
  });

  it("si SOLO está en el paquete, lanza en vez de escribir en la instalación", () => {
    // Es lo que impide que new-pack, ingest, draft o promote toquen node_modules.
    expect(() =>
      choosePackDirForWrite("ai-ml-readiness", { enUsuario: false, enPaquete: true }, rutas),
    ).toThrow(PackReadOnlyError);
  });

  it("el error de solo lectura nombra el pack y dice la salida", () => {
    try {
      choosePackDirForWrite("ai-ml-readiness", { enUsuario: false, enPaquete: true }, rutas);
      expect.unreachable("tenía que lanzar");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("ai-ml-readiness");
      expect(msg).toContain("APTUS_PACKS_DIR");
      expect(msg).toContain(rutas.userPacksDir);
    }
  });

  it("rechaza nombres que no son kebab ANTES de componer ninguna ruta", () => {
    // Un nombre con separadores no puede llegar nunca a join().
    for (const malo of ["../fuera", "a/b", "/abs", "Mayus", "con espacio", "", "-empieza-mal"]) {
      expect(() =>
        choosePackDirForWrite(malo, { enUsuario: false, enPaquete: false }, rutas),
      ).toThrow(/inválido/i);
    }
  });

  it("desde el repo, escribir se comporta como siempre: al directorio de packs del repo", () => {
    const repo = resolvePaths(entrada({ isDevCheckout: true }));
    expect(choosePackDirForWrite("nuevo", { enUsuario: false, enPaquete: false }, repo)).toBe(
      join(PAQUETE, "packs", "nuevo"),
    );
    // Y un pack que ya está en el repo no es de solo lectura: las raíces coinciden.
    expect(choosePackDirForWrite("nuevo", { enUsuario: true, enPaquete: true }, repo)).toBe(
      join(PAQUETE, "packs", "nuevo"),
    );
  });
});
