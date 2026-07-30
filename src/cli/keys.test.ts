import { describe, expect, it } from "vitest";
import { ESCAPED, isEscapeKey, withEscape } from "./keys.js";

describe("isEscapeKey", () => {
  it("reconoce un ESC suelto", () => {
    expect(isEscapeKey(Buffer.from([0x1b]))).toBe(true);
  });

  it("NO confunde las flechas con ESC: llegan como secuencia en el mismo chunk", () => {
    expect(isEscapeKey(Buffer.from("\x1b[A"))).toBe(false); // arriba
    expect(isEscapeKey(Buffer.from("\x1b[B"))).toBe(false); // abajo
    expect(isEscapeKey(Buffer.from("\x1b[C"))).toBe(false); // derecha
    expect(isEscapeKey(Buffer.from("\x1bOP"))).toBe(false); // F1 en algunos terminales
  });

  it("ignora las teclas normales", () => {
    expect(isEscapeKey(Buffer.from("a"))).toBe(false);
    expect(isEscapeKey(Buffer.from("\r"))).toBe(false);
    expect(isEscapeKey(Buffer.from([0x03]))).toBe(false); // Ctrl+C es otra cosa
  });

  it("un chunk vacío no es ESC", () => {
    expect(isEscapeKey(Buffer.alloc(0))).toBe(false);
  });
});

describe("withEscape", () => {
  it("devuelve el valor del prompt cuando no se pulsa nada", async () => {
    expect(await withEscape(async () => "elegido")).toBe("elegido");
  });

  it("traduce AbortPromptError a ESCAPED", async () => {
    const abortado = async (): Promise<string> => {
      const err = new Error("abortado");
      err.name = "AbortPromptError";
      throw err;
    };

    expect(await withEscape(abortado)).toBe(ESCAPED);
  });

  it("deja pasar cualquier otro error: no se traga fallos reales", async () => {
    const revienta = async (): Promise<string> => {
      throw new Error("disco lleno");
    };

    await expect(withEscape(revienta)).rejects.toThrow(/disco lleno/);
  });

  it("Ctrl+C (ExitPromptError) NO se convierte en ESCAPED: significan cosas distintas", async () => {
    const ctrlC = async (): Promise<string> => {
      const err = new Error("cancelado");
      err.name = "ExitPromptError";
      throw err;
    };

    await expect(withEscape(ctrlC)).rejects.toThrow(/cancelado/);
  });
});
