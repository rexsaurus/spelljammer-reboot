// Small seedable RNG (mulberry32) so combat/travel are reproducible in tests.
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), roll: d => { let s = 0; for (let i = 0; i < d.n; i++) s += 1 + Math.floor(next() * d.sides); return s; }, get seed() { return a >>> 0; } };
}
