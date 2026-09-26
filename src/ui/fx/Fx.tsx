import { useEffect, useRef } from 'react';
import { drawSim, makeSim } from './engine';
import type { FxPreset } from './schema';

/**
 * One effect on its own fixed canvas over the viewport: a preset played over an anchor rect, in a tint, at a speed.
 * `freezeAt` renders one frame and holds it (the editor's scrub, a screenshot). Nothing here touches the game state.
 */
export function Fx({ preset, at, tint, seed, speed = 1, freezeAt, loop, onDone }: { preset: FxPreset; at: DOMRect; tint?: string; seed?: number; speed?: number; freezeAt?: number; loop?: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.scale(dpr, dpr);
    const sim = makeSim(preset, at, { tint, seed });
    const total = Math.max(sim.end, 1);
    let t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      let el = freezeAt ?? (now - t0) * speed;
      if (loop && freezeAt === undefined && el > total + 250) {
        t0 = now;
        el = 0;
      }
      ctx.clearRect(0, 0, W, H);
      drawSim(ctx, sim, el);
      if (freezeAt !== undefined) return;
      if (el <= total) raf = requestAnimationFrame(frame);
      else if (loop) raf = requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, W, H);
        done.current?.();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [preset, at, tint, seed, speed, freezeAt, loop]);
  return <canvas ref={ref} className="fxlayer" aria-hidden />;
}
