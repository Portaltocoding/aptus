import { describe, it, expect } from "vitest";
import { mulberry32, makeSeededShuffle } from "./random.js";

describe("mulberry32", () => {
  it("devuelve siempre un numero en [0,1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("misma seed produce siempre la misma secuencia", () => {
    const rngA = mulberry32(42);
    const rngB = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => rngA());
    const seqB = Array.from({ length: 10 }, () => rngB());
    expect(seqA).toEqual(seqB);
  });
});

describe("makeSeededShuffle", () => {
  it("la misma seed aplicada dos veces produce exactamente el mismo orden", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffle1 = makeSeededShuffle(42);
    const shuffle2 = makeSeededShuffle(42);

    const result1 = shuffle1(input);
    const result2 = shuffle2(input);

    expect(result1).toEqual(result2);
  });

  it("seeds distintas producen ordenes distintos (alta probabilidad)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffleA = makeSeededShuffle(1);
    const shuffleB = makeSeededShuffle(2);

    const resultA = shuffleA(input);
    const resultB = shuffleB(input);

    expect(resultA).not.toEqual(resultB);
  });

  it("no muta el array de entrada", () => {
    const input = [1, 2, 3, 4, 5];
    const original = [...input];
    const shuffle = makeSeededShuffle(7);

    shuffle(input);

    expect(input).toEqual(original);
  });

  it("produce una permutacion (mismos elementos, mismo tamano)", () => {
    const input = [1, 2, 3, 4, 5];
    const shuffle = makeSeededShuffle(99);
    const result = shuffle(input);

    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });
});
