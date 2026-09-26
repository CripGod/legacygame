import { useEffect, useRef } from 'react';
import { drawSim, makeSim, type Sim } from './engine';
import { getPreset } from './presets';

/**
 * One canvas over the match for every preset effect the board fires (`fxPlay`): the +N's Influence stream, and
 * whatever comes next. Sims are added from anywhere, drawn on one frame loop, and dropped when they end.
 */
interface Live {
  sim: Sim;
  t0: number;
}
const live: Live[] = [];
let wake: (() => void) | null = null;

/** Play a preset now: `at` is where it is born (a tile, a panel), `to` where it travels (the Influence circle). */
export function fxPlay(id: string, opts: { at: DOMRect; to?: DOMRect; tint?: string; seed?: number }): void {
  const preset = getPreset(id);
  if (!preset) return;
  live.push({ sim: makeSim(preset, opts.at, { tint: opts.tint, seed: opts.seed ?? (Date.now() & 0x7fffffff), target: opts.to }), t0: performance.now() });
  wake?.();
}

/** Drop everything (a match reset). */
export function fxClear(): void {
  live.length = 0;
}

export function FxLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let W = 0;
    let H = 0;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const frame = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      for (let i = live.length - 1; i >= 0; i--) {
        const el = now - live[i].t0;
        if (el > live[i].sim.end) {
          live.splice(i, 1);
          continue;
        }
        drawSim(ctx, live[i].sim, el);
      }
      raf = live.length ? requestAnimationFrame(frame) : 0;
    };
    wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    if (live.length) wake();
    window.addEventListener('resize', size);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      wake = null;
      window.removeEventListener('resize', size);
    };
  }, []);
  return <canvas ref={ref} className="fxlayer" aria-hidden />;
}
