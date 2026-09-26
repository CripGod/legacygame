import { useEffect, useRef } from 'react';

/**
 * Anansi's smoke: a Location he retells vanishes in a puff, and the new place stands where the old one was. A fixed
 * canvas over the whole viewport, like the fireworks; nothing here touches the game state. Thick violet-grey smoke boils
 * out of the window's centre over the first 260 ms, covers the window by ~400 ms while the picture swaps beneath it,
 * then thins and drifts up, the new place showing through from ~800 ms, gone by 1.5 s. A flash on the first frame and a few gold motes (the web's glint) ride it.
 * Sound: 'location.retell' (a whoosh, a poof, a harp run up).
 */
const TOTAL_MS = 1500;
const PUFFS = 52;
const SPAWN_MS = 260;
const MOTES = 14;
const DRAG = 0.008; // per ms: the clouds stop boiling outward within ~350 ms and hang
const RISE = 0.09; // px per ms, the smoke lifting as it thins
/** Smoke from dark to pale, all on Anansi's violet. */
const TINTS = ['#221a34', '#3a2d55', '#5b4a7e', '#8c7bb0', '#b8a9d6'];

interface Puff { start: number; angle: number; speed: number; size: number; grow: number; life: number; tint: number; spin: number; squash: number; alpha: number }
interface Mote { start: number; x: number; y: number; vx: number; vy: number; size: number; twinkle: number }

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A soft cloud: a radial fall-off with a dense core, pre-rendered once per tint. */
function cloudSprite(color: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grad.addColorStop(0.5, `rgba(${r},${gg},${b},0.72)`);
  grad.addColorStop(0.85, `rgba(${r},${gg},${b},0.16)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function glowSprite(color: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, `rgba(${r},${gg},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function Smoke({ at, onDone, freezeAt }: { at: DOMRect; onDone: () => void; /** Dev: render one frame at this time and hold it. */ freezeAt?: number }) {
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
    const rng = (() => {
      let s = 24681357;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const cx = at.left + at.width / 2;
    const cy = at.top + at.height * 0.52;
    // The puff has to cover the window: the farthest smoke reaches past its corners, the biggest clouds are a third of it.
    const reach = Math.hypot(at.width, at.height) * 0.56;
    const base = Math.max(80, at.width * 0.36);
    const puffs: Puff[] = [];
    for (let i = 0; i < PUFFS; i++) {
      const speed = (0.3 + rng() * 0.5) * reach * DRAG; // speed/DRAG, the distance under drag, lands between 0.3 and 0.8 of the reach: the smoke fills the window, it does not fly off it
      puffs.push({
        start: (i / PUFFS) * SPAWN_MS + rng() * 40,
        angle: (i / PUFFS) * Math.PI * 2 + rng() * 0.6,
        speed,
        size: base * (0.6 + rng() * 0.7),
        grow: 1.0 + rng() * 0.8,
        life: 0.45 + rng() * 0.5, // the first clouds are gone by 700 ms, the last hang to 1.4 s: the window comes back through them
        tint: Math.min(TINTS.length - 1, Math.floor(rng() * rng() * TINTS.length)),
        spin: (rng() - 0.5) * 0.0012,
        squash: 0.7 + rng() * 0.3,
        alpha: 0.78 + rng() * 0.22,
      });
    }
    // The pale wisps draw last, over the dark body.
    puffs.sort((a, b) => a.tint - b.tint);
    const motes: Mote[] = [];
    for (let i = 0; i < MOTES; i++) {
      const a = rng() * Math.PI * 2;
      const v = 0.05 + rng() * 0.14;
      motes.push({ start: 80 + rng() * 300, x: cx + (rng() - 0.5) * at.width * 0.3, y: cy + (rng() - 0.5) * at.height * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.08, size: 5 + rng() * 6, twinkle: rng() * Math.PI * 2 });
    }
    const sprites = TINTS.map((c) => cloudSprite(c, 128));
    const gold = glowSprite('#f2c14e', 48);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const el = freezeAt ?? now - t0;
      ctx.clearRect(0, 0, W, H);
      // The flash: the window lights violet-white for the first frames, as the old place goes.
      const flash = Math.max(0, 1 - el / 180);
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.9);
        grad.addColorStop(0, `rgba(255,255,255,${0.85 * flash})`);
        grad.addColorStop(0.4, `rgba(184,169,214,${0.5 * flash})`);
        grad.addColorStop(1, 'rgba(120,90,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      // The smoke: each cloud boils out from the centre, slows under drag, grows, lifts, and thins away.
      for (const p of puffs) {
        const pt = el - p.start;
        const lifeMs = (TOTAL_MS - p.start) * p.life;
        if (pt < 0 || pt > lifeMs) continue;
        const u = pt / lifeMs;
        const dist = (p.speed * (1 - Math.exp(-DRAG * pt))) / DRAG;
        const x = cx + Math.cos(p.angle) * dist;
        const y = cy + Math.sin(p.angle) * dist * 0.8 - RISE * pt * u;
        const d = p.size * (1 + p.grow * u);
        const env = Math.min(1, pt / 90) * (u < 0.3 ? 1 : 1 - Math.pow((u - 0.3) / 0.7, 1.2));
        ctx.globalAlpha = Math.max(0, p.alpha * env);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle + p.spin * pt);
        ctx.scale(1, p.squash);
        ctx.drawImage(sprites[p.tint], -d / 2, -d / 2, d, d);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // The web's glint: gold motes drifting up through the smoke, winking.
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const mt = el - m.start;
        if (mt < 0 || mt > 1100) continue;
        const u = mt / 1100;
        const a = (1 - u) * (0.5 + 0.5 * Math.abs(Math.sin(mt * 0.012 + m.twinkle)));
        const d = m.size * (1.6 - u * 0.8);
        ctx.globalAlpha = a;
        ctx.drawImage(gold, m.x + m.vx * mt - d / 2, m.y + m.vy * mt - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (freezeAt !== undefined) return;
      if (el < TOTAL_MS) raf = requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, W, H);
        done.current();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [at, freezeAt]);
  return <canvas ref={ref} className="smoke" aria-hidden />;
}
