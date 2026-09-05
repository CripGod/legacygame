/**
 * Seeded deterministic RNG (mulberry32). The RNG state lives inside GameState so
 * that every match is fully reproducible from its seed and action history.
 */
export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

/** Advances the RNG and returns a float in [0, 1). */
export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[nextInt(r, arr.length)];
}

export function shuffle<T>(r: RngState, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(r, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Hash a string into a 32-bit seed (for deriving sub-seeds). */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
