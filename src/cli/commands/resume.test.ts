import { describe, expect, it } from "vitest";
import { avisoPausa, elegirPackPausado } from "./resume.js";

describe("elegirPackPausado", () => {
  it("con una sola pausa no hay nada que preguntar", () => {
    expect(elegirPackPausado(["uno"])).toBe("uno");
  });

  it("con ninguna o con varias hace falta que lo diga quien llama", () => {
    expect(elegirPackPausado([])).toBeNull();
    expect(elegirPackPausado(["uno", "dos"])).toBeNull();
  });
});

describe("avisoPausa", () => {
  it("dice cuántas respuestas se guardan y cómo se vuelve", () => {
    const aviso = avisoPausa("mi-pack", 12);

    expect(aviso).toContain("12");
    expect(aviso).toContain("aptus resume --pack mi-pack");
    expect(aviso).toMatch(/No se ha puntuado nada/);
  });

  it("sin pausa previa no habla de sustituir nada", () => {
    expect(avisoPausa("mi-pack", 3)).not.toMatch(/Sustituye/);
    expect(avisoPausa("mi-pack", 3, null)).not.toMatch(/Sustituye/);
  });

  it("si reemplaza otra pausa lo dice: solo se guarda una por pack", () => {
    const aviso = avisoPausa("mi-pack", 3, "2026-08-01T09:00:00.000Z");

    expect(aviso).toMatch(/Sustituye a la sesión que tenías en pausa/);
    expect(aviso).toMatch(/ya no se puede retomar/);
  });
});
