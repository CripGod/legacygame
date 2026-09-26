import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_IDS } from '../src/ui/fx/presets';
import { validatePreset, curveAt, gradientAt } from '../src/ui/fx/schema';
import { makeSim, particleAt } from '../src/ui/fx/engine';

const rect = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect;

describe('particle presets', () => {
  it('every preset validates and its file name is its id', () => {
    for (const id of PRESET_IDS) {
      expect(validatePreset(PRESETS[id]), id).toEqual([]);
      expect(PRESETS[id].id).toBe(id);
    }
  });
  it('a Sim is deterministic for a seed and differs for another', () => {
    const p = PRESETS['ember-landing'];
    const a = makeSim(p, rect(100, 100, 400, 300), { seed: 42 });
    const b = makeSim(p, rect(100, 100, 400, 300), { seed: 42 });
    const c = makeSim(p, rect(100, 100, 400, 300), { seed: 43 });
    expect(a.particles).toEqual(b.particles);
    expect(a.particles).not.toEqual(c.particles);
    expect(a.particles.length).toBe(p.emitters.reduce((n, e) => n + e.count, 0));
    expect(a.end).toBeLessThanOrEqual(p.duration);
  });
  it('the landing embers rise from the lower half of the anchor and never fall', () => {
    const p = PRESETS['ember-landing'];
    const sim = makeSim(p, rect(0, 0, 400, 300), { seed: 7 });
    for (const q of sim.particles) {
      expect(q.y0).toBeGreaterThanOrEqual(300 * 0.45 - 1);
      const e = p.emitters[q.emitter];
      const mid = particleAt(e, q, q.life / 2);
      const end = particleAt(e, q, q.life);
      expect(mid.y).toBeLessThan(q.y0);
      expect(end.y).toBeLessThanOrEqual(mid.y + 1);
    }
  });
  it('curves and gradients interpolate and substitute the tint', () => {
    expect(curveAt([[0, 0], [0.5, 1], [1, 0]], 0.25)).toBeCloseTo(0.5);
    expect(curveAt([[0, 2]], 0.9)).toBe(2);
    expect(gradientAt([[0, '$tint'], [1, '#000000']], 0, '#ffffff')).toBe('#ffffff');
    expect(gradientAt([[0, '#000000'], [1, '#ffffff']], 0.5, '#ff0000')).toBe('#808080');
  });
});
