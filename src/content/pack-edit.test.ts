import { describe, expect, it } from "vitest";
import { addDimensionToYaml } from "./pack-edit.js";

const CON_COMENTARIOS = `# Pack de prueba: este comentario NO se puede perder.
name: "Prueba"
version: "1.0.0"
dimensions:
  - alpha # la primera
  - beta
`;

describe("addDimensionToYaml", () => {
  it("añade la dimensión al final de la lista", () => {
    const { text, result } = addDimensionToYaml(CON_COMENTARIOS, "gamma");

    expect(result).toBe("añadida");
    expect(text).toMatch(/- alpha/);
    expect(text).toMatch(/- beta/);
    expect(text).toMatch(/- gamma/);
  });

  it("conserva los comentarios del fichero", () => {
    const { text } = addDimensionToYaml(CON_COMENTARIOS, "gamma");

    expect(text).toContain("# Pack de prueba: este comentario NO se puede perder.");
    expect(text).toContain("# la primera");
  });

  it("no duplica una dimensión que ya está, y no reescribe el fichero", () => {
    const { text, result } = addDimensionToYaml(CON_COMENTARIOS, "beta");

    expect(result).toBe("ya-estaba");
    expect(text).toBe(CON_COMENTARIOS);
  });

  it("funciona sobre una lista vacía, que es como la deja `ingest`", () => {
    const vacio = 'name: "x"\nversion: "0.1.0"\ndimensions: []\n';
    const { text, result } = addDimensionToYaml(vacio, "alpha");

    expect(result).toBe("añadida");
    expect(text).toMatch(/alpha/);
  });

  it("falla claro si el pack.yaml no tiene una lista 'dimensions' editable", () => {
    expect(() => addDimensionToYaml('name: "x"\nversion: "1"\n', "alpha")).toThrow(/dimensions/);
    expect(() =>
      addDimensionToYaml('name: "x"\ndimensions: "no soy una lista"\n', "alpha"),
    ).toThrow(/dimensions/);
  });
});
