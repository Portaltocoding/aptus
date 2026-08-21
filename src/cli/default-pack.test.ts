import { describe, expect, it } from "vitest";
import { explicaFalloDePack, resolveDefaultPack } from "./default-pack.js";

/**
 * Qué pack se usa cuando no lo dices. La decisión es pura y los nombres entran
 * como dato, así que aquí se comprueban los tres estados sin tocar el disco.
 */

describe("resolveDefaultPack", () => {
  it("un `--pack` explícito manda, aunque no exista todavía", () => {
    // Que el pack exista lo comprueba quien lo carga, con su propio mensaje. Aquí
    // solo se decide QUÉ nombre se usa: adelantar esa comprobación duplicaría el
    // error en dos sitios que se desincronizarían.
    expect(resolveDefaultPack([], "recien-creado")).toEqual({ ok: true, name: "recien-creado" });
    expect(resolveDefaultPack(["a", "b"], "b")).toEqual({ ok: true, name: "b" });
  });

  it("con un solo pack, ése: no hay elección que ofrecer", () => {
    expect(resolveDefaultPack(["sistemas"])).toEqual({ ok: true, name: "sistemas" });
  });

  it("sin ningún pack no falla por 'no existe': falla por 'todavía no hay'", () => {
    expect(resolveDefaultPack([])).toEqual({ ok: false, motivo: "sin-packs", nombres: [] });
  });

  it("con varios y sin decir cuál, no elige por ti", () => {
    // Coger el primero por orden alfabético sería decidir sobre qué te evalúas
    // sin decírtelo, y el número que salga al final llevaría ese error dentro.
    expect(resolveDefaultPack(["idiomas", "sistemas"])).toEqual({
      ok: false,
      motivo: "ambiguo",
      nombres: ["idiomas", "sistemas"],
    });
  });
});

describe("explicaFalloDePack — el mensaje lleva al comando siguiente", () => {
  it("sin packs, dice cómo crear el primero y dónde va a caer", () => {
    const msg = explicaFalloDePack(
      { ok: false, motivo: "sin-packs", nombres: [] },
      "/casa/.local/share/aptus/packs",
    );

    expect(msg).toMatch(/aptus tema/);
    expect(msg).toMatch(/aptus ingest/);
    expect(msg).toContain("/casa/.local/share/aptus/packs");
    // Nada de "no existe el pack X": no falta un pack concreto, faltan todos.
    expect(msg).not.toMatch(/no existe/i);
  });

  it("ambiguo, enumera los que hay para poder copiar uno", () => {
    const msg = explicaFalloDePack(
      { ok: false, motivo: "ambiguo", nombres: ["idiomas", "sistemas"] },
      "/casa/packs",
    );

    expect(msg).toContain("idiomas");
    expect(msg).toContain("sistemas");
    expect(msg).toMatch(/--pack/);
  });
});
