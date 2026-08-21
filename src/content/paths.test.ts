import { describe, expect, it } from "vitest";
import { isAbsolute, join, sep } from "node:path";
import { assertPackName, resolvePaths, type PathsInput } from "./paths.js";

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
    // trabajar desde el repo no debe ensuciar el home con historial de pruebas.
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
    const { packsDir } = resolvePaths(entrada({ env: { APTUS_PACKS_DIR: "  " } }));
    expect(packsDir).toBe(join(CASA, ".local", "share", "aptus", "packs"));
  });

  it("absolutiza las rutas relativas que lleguen por variable", () => {
    const { dataDir, packsDir } = resolvePaths(
      entrada({ env: { APTUS_DATA_DIR: "./datos", APTUS_PACKS_DIR: "packs-propios" } }),
    );
    expect(isAbsolute(dataDir)).toBe(true);
    expect(isAbsolute(packsDir)).toBe(true);
    expect(dataDir.endsWith(`${sep}datos`)).toBe(true);
    expect(packsDir.endsWith(`${sep}packs-propios`)).toBe(true);
  });
});

describe("resolvePaths — dónde viven los packs", () => {
  it("sin variables, cuelgan del directorio de datos del usuario", () => {
    const p = resolvePaths(entrada());
    expect(p.packsDir).toBe(join(p.dataDir, "packs"));
  });

  it("siguen a XDG_DATA_HOME cuando está definida", () => {
    const { packsDir } = resolvePaths(entrada({ env: { XDG_DATA_HOME: "/var/xdg" } }));
    expect(packsDir).toBe(join("/var/xdg", "aptus", "packs"));
  });

  it("APTUS_PACKS_DIR gana, esté o no en un checkout", () => {
    for (const isDevCheckout of [true, false]) {
      const { packsDir } = resolvePaths(
        entrada({ isDevCheckout, env: { APTUS_PACKS_DIR: "/mis/packs" } }),
      );
      expect(packsDir).toBe("/mis/packs");
    }
  });

  it("APTUS_DATA_DIR NO se lleva los packs con él", () => {
    // Los resultados se pueden mandar a donde sea (una carpeta de pruebas, un
    // tmpdir de test) sin que eso esconda tus packs: son cosas distintas y cada
    // una tiene su variable.
    const p = resolvePaths(entrada({ env: { APTUS_DATA_DIR: "/tmp/prueba" } }));
    expect(p.dataDir).toBe("/tmp/prueba");
    expect(p.packsDir).toBe(join(CASA, ".local", "share", "aptus", "packs"));
  });

  it("un pack está en el MISMO sitio desde el repo que instalado", () => {
    // La asimetría con dataDir es deliberada: un pack es contenido que escribes
    // tú, no un subproducto del checkout. Si el repo tuviera su propia raíz de
    // packs, el mismo tema acabaría duplicado en dos discos y `aptus packs`
    // diría cosas distintas según desde dónde lo llamaras.
    const repo = resolvePaths(entrada({ isDevCheckout: true }));
    const instalado = resolvePaths(entrada({ isDevCheckout: false }));
    expect(repo.packsDir).toBe(instalado.packsDir);
  });
});

describe("resolvePaths — PROPIEDAD: nada del usuario cae dentro de la instalación", () => {
  // Es literalmente el fallo que arregla esta resolución (npm update borraría el
  // historial), así que se assertea como propiedad sobre todas las combinaciones
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
    it(`ni dataDir ni packsDir cuelgan del paquete con env=${JSON.stringify(env)}`, () => {
      const p = resolvePaths(entrada({ env }));
      expect(cuelgaDe(p.packageRoot, p.dataDir)).toBe(false);
      expect(cuelgaDe(p.packageRoot, p.packsDir)).toBe(false);
    });
  }

  it("los packs no caen dentro del paquete NI SIQUIERA en checkout de desarrollo", () => {
    // Los datos sí (data/ del repo, ignorado por git). Los packs no: aptus se
    // publica sin contenido, y el repo no es sitio para el tuyo.
    const p = resolvePaths(entrada({ isDevCheckout: true }));
    expect(cuelgaDe(p.packageRoot, p.dataDir)).toBe(true);
    expect(cuelgaDe(p.packageRoot, p.packsDir)).toBe(false);
  });
});

describe("assertPackName — un nombre no puede alcanzar un join()", () => {
  it("rechaza lo que no es kebab", () => {
    for (const malo of ["../fuera", "a/b", "/abs", "Mayus", "con espacio", "", "-empieza-mal"]) {
      expect(() => assertPackName(malo), `'${malo}' debería rechazarse`).toThrow(/inválido/i);
    }
  });

  it("acepta minúsculas, números y guiones", () => {
    for (const bueno of ["sistemas", "sistemas-distribuidos", "b2", "a"]) {
      expect(() => assertPackName(bueno)).not.toThrow();
    }
  });
});
