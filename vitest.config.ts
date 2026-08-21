import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    /**
     * Los tests corren SIN color, siempre y en todas partes.
     *
     * `picocolors` decide si emite ANSI mirando el entorno, y entre las señales
     * que mira está `CI`. Eso hacía que la misma suite pasara en local (sin TTY →
     * sin color) y fallara en GitHub Actions (CI → con color): once tests de
     * `theme.ts` comparan anchos y prefijos de texto, y unos códigos de escape
     * invisibles cuentan como caracteres.
     *
     * Fijarlo aquí es lo que hace que "verde en local" signifique algo. Lo que se
     * comprueba en esos tests es la geometría —que un título rellene el ancho,
     * que una barra diga la posición—, y esa no depende de si hay color.
     */
    env: { NO_COLOR: "1", FORCE_COLOR: "0" },
  },
});
