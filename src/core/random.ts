// src/core/random.ts — función pura, sin dependencias externas
// Fuente: implementación de referencia estándar de mulberry32 (dominio público,
// ampliamente citada — ver https://github.com/robbiespeed/seeded-shuffle y
// https://www.4rknova.com/blog/2026/03/01/mulberry32-rng)
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeededShuffle(seed: number) {
  const rng = mulberry32(seed);
  return function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
}
