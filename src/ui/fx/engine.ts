/**
 * The particle runtime: a preset plus an anchor rect, a tint and a seed make a Sim; `drawSim` paints the Sim at any
 * time t on any 2D canvas. Every particle's state at t is a closed form of its birth values, so scrubbing, freezing and
 * replaying are exact, and the Unity twin (the same maths in C#) draws the same frame.
 */
import { curveAt, gradientAt, hexToRgb, type Emitter, type FxPreset, type Sprite } from './schema';

export interface Particle {
  emitter: number;
  start: number;
  life: number;
  x0: number;
  y0: number;
  angle: number; // radians
  speed: number;
  size: number;
  spin: number; // radians per ms
  phase: number;
  seed: number;
  /** Target mode: where this one lands. */
  tx: number;
  ty: number;
}

export interface Sim {
  preset: FxPreset;
  anchor: DOMRect;
  target?: DOMRect;
  tint: string;
  particles: Particle[];
  /** The last moment anything is alive, ms. */
  end: number;
}

export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const lerp = (r: { min: number; max: number }, k: number) => r.min + (r.max - r.min) * k;

export function makeSim(preset: FxPreset, anchor: DOMRect, opts: { tint?: string; seed?: number; target?: DOMRect } = {}): Sim {
  const rng = makeRng(opts.seed ?? 1234567);
  const particles: Particle[] = [];
  const target = opts.target ?? anchor;
  const tcx = target.left + target.width / 2;
  const tcy = target.top + target.height / 2;
  let end = 0;
  preset.emitters.forEach((e, ei) => {
    const box = e.originAt === 'target' ? target : anchor;
    for (let k = 0; k < e.count; k++) {
      const start = lerp(e.spawn, rng());
      const life = lerp(e.life, rng());
      const spread = e.path?.mode === 'target' ? e.path.spread : 0;
      const sa = rng() * Math.PI * 2;
      const sr = Math.sqrt(rng()) * spread;
      particles.push({
        emitter: ei,
        start,
        life,
        x0: box.left + box.width * lerp(e.origin.x, rng()),
        y0: box.top + box.height * lerp(e.origin.y, rng()),
        tx: tcx + Math.cos(sa) * sr,
        ty: tcy + Math.sin(sa) * sr,
        angle: (lerp(e.angle, rng()) * Math.PI) / 180,
        speed: lerp(e.speed, rng()),
        size: lerp(e.size, rng()),
        spin: (lerp(e.spin, rng()) * Math.PI * 2) / 1000,
        phase: rng() * Math.PI * 2,
        seed: rng(),
      });
      end = Math.max(end, Math.min(preset.duration, start + life));
    }
  });
  return { preset, anchor, target: opts.target, tint: opts.tint ?? '#ffe3b3', particles, end };
}

const EASE: Record<NonNullable<Emitter['path']>['ease'], (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
};

/** Where a particle is t ms after birth (t ≥ 0). */
export function particleAt(e: Emitter, p: Particle, t: number): { x: number; y: number } {
  const sway = e.sway.amp ? Math.sin((2 * Math.PI * e.sway.freq * t) / 1000 + p.phase) * e.sway.amp : 0;
  if (e.path?.mode === 'target') {
    // An arc from birth to the target: a quadratic curve lifted at mid-way, run over the particle's life.
    const u = Math.max(0, Math.min(1, t / p.life));
    const k = EASE[e.path.ease ?? 'inOut'](u);
    const mx = (p.x0 + p.tx) / 2;
    const my = (p.y0 + p.ty) / 2 - e.path.arc;
    const w = 1 - k;
    return { x: w * w * p.x0 + 2 * w * k * mx + k * k * p.tx + sway * (1 - k), y: w * w * p.y0 + 2 * w * k * my + k * k * p.ty };
  }
  const dist = e.drag > 0 ? (p.speed * (1 - Math.exp(-e.drag * t))) / e.drag : p.speed * t;
  return { x: p.x0 + Math.cos(p.angle) * dist + sway, y: p.y0 + Math.sin(p.angle) * dist + 0.5 * e.gravity * t * t };
}

// ---------- sprites, cached by kind and colour ----------
const cache = new Map<string, HTMLCanvasElement>();

function sprite(kind: Sprite, color: string): HTMLCanvasElement {
  const key = `${kind}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (kind === 'glow') {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  } else if (kind === 'puff') {
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.5, `rgba(${r},${gg},${b},0.72)`);
    grad.addColorStop(0.85, `rgba(${r},${gg},${b},0.16)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  } else if (kind === 'spark') {
    // A hot core with a short soft halo: the head of a spark.
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  } else {
    // A four-point star over a soft halo.
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.8)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const cx = size / 2;
    const R = size * 0.46;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 === 0 ? R : R * 0.3;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * rr;
      const y = cx + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  cache.set(key, c);
  return c;
}

/** The gradient sampled at 8 steps, so a life needs at most 8 sprites. */
function colorStep(e: Emitter, u: number, tint: string): string {
  return gradientAt(e.color, Math.round(u * 7) / 7, tint);
}

/** Paint the Sim at `t` ms after its start. Leaves the context's blend at source-over and alpha at 1. */
export function drawSim(ctx: CanvasRenderingContext2D, sim: Sim, t: number): void {
  const { preset, tint } = sim;
  for (const p of sim.particles) {
    const e = preset.emitters[p.emitter];
    const pt = t - p.start;
    if (pt < 0 || pt > p.life || t > preset.duration) continue;
    const u = pt / p.life;
    const a = curveAt(e.alphaOver, u);
    if (a <= 0) continue;
    const d = Math.max(0.5, p.size * curveAt(e.sizeOver, u));
    const col = colorStep(e, u, tint);
    const spr = sprite(e.sprite, col);
    const { x, y } = particleAt(e, p, pt);
    ctx.globalCompositeOperation = e.blend === 'add' ? 'lighter' : 'source-over';
    const back = Math.max(0, pt - 40);
    const q = e.trail > 0 || e.sprite === 'spark' ? particleAt(e, p, back) : null;
    const heading = q && (q.x !== x || q.y !== y) ? Math.atan2(y - q.y, x - q.x) : p.angle;
    if (e.trail > 0 && pt > 8 && q) {
      const bx = x + (q.x - x) * e.trail;
      const by = y + (q.y - y) * e.trail;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, d * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, a);
    if ((e.sprite === 'star' || e.sprite === 'spark') && (p.spin !== 0 || e.sprite === 'spark')) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.sprite === 'spark' ? heading : p.spin * pt + p.phase);
      ctx.drawImage(spr, -d / 2, -d / 2, d, d);
      ctx.restore();
    } else {
      ctx.drawImage(spr, x - d / 2, y - d / 2, d, d);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
