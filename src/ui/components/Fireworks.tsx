import { useEffect, useRef } from 'react';

/**
 * Fireworks over a cleared Threat: rockets climb from the Threat's tile and burst into particle explosions that
 * drift down and wink out. A fixed canvas over the whole viewport, like the power trails; nothing here touches the
 * game state. Timing: rockets launch over the first ~600ms and climb ~420ms each, every burst lives ~1.2s, and
 * the whole show is over in about 2.3s, inside the showdown's verdict hold.
 */
const ROCKETS = 6;
const LAUNCH_SPREAD_MS = 600;
const CLIMB_MS = 420;
const BURST_MS = 1250;
const TOTAL_MS = LAUNCH_SPREAD_MS + CLIMB_MS + BURST_MS + 100;
/** Gold, red and green with white: the colours of the Pan-African flag and the Black Star, and a white flash. */
const COLORS = ['#f2c14e', '#e2483f', '#3fae62', '#ffffff', '#f2c14e', '#e2483f'];
const GRAVITY = 0.00045; // px per ms², a slow drift down
const DRAG = 0.0026; // per ms

interface Spark {
  rocket: number;
  angle: number;
  speed: number;
  size: number;
  life: number;
  twinkle: number;
}

interface Rocket {
  start: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  sparks: Spark[];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A soft glowing disc, pre-rendered once per colour. */
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

export function Fireworks({ at, onDone, freezeAt }: { at: DOMRect; onDone: () => void; /** Dev: render one frame at this time and hold it. */ freezeAt?: number }) {
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
      let s = 7654321;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const cx = at.left + at.width / 2;
    const cy = at.top + at.height / 2;
    // Bursts sit above and around the tile, but never off the top of the screen or over the far side of the board.
    const rockets: Rocket[] = [];
    for (let i = 0; i < ROCKETS; i++) {
      const dx = (rng() - 0.5) * Math.max(160, at.width * 2.2);
      const rise = 60 + rng() * 150;
      const to = { x: Math.max(60, Math.min(W - 60, cx + dx)), y: Math.max(50, cy - rise) };
      const color = COLORS[i % COLORS.length];
      const sparks: Spark[] = [];
      const count = 70 + Math.floor(rng() * 30);
      for (let k = 0; k < count; k++) {
        sparks.push({
          rocket: i,
          angle: (k / count) * Math.PI * 2 + rng() * 0.25,
          speed: 0.12 + rng() * 0.24, // px per ms at the burst
          size: 3 + rng() * 3.4,
          life: 0.7 + rng() * 0.3,
          twinkle: rng() * Math.PI * 2,
        });
      }
      rockets.push({ start: (i / ROCKETS) * LAUNCH_SPREAD_MS + rng() * 60, from: { x: cx + (rng() - 0.5) * at.width * 0.4, y: cy }, to, color, sparks });
    }
    const sprites = new Map(COLORS.map((c) => [c, glowSprite(c, 64)]));
    const t0 = performance.now();
    let raf = 0;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);
    const frame = (now: number) => {
      const el = freezeAt ?? now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const r of rockets) {
        const [cr, cg, cb] = hexToRgb(r.color);
        const sprite = sprites.get(r.color)!;
        // The climb: a bright head with a short sparkling tail.
        const climb = (el - r.start) / CLIMB_MS;
        if (climb >= 0 && climb <= 1) {
          const k = easeOut(climb);
          const x = r.from.x + (r.to.x - r.from.x) * k;
          const y = r.from.y + (r.to.y - r.from.y) * k;
          for (let j = 5; j >= 0; j--) {
            const kk = Math.max(0, k - j * 0.045);
            const tx = r.from.x + (r.to.x - r.from.x) * kk;
            const ty = r.from.y + (r.to.y - r.from.y) * kk;
            const d = j === 0 ? 16 : 10 - j;
            ctx.globalAlpha = j === 0 ? 1 : 0.5 / j;
            ctx.drawImage(sprite, tx - d / 2, ty - d / 2, d, d);
          }
          ctx.globalAlpha = 1;
          void x;
          void y;
        }
        // The burst: a flash, then sparks flung out, slowed by drag, pulled down, winking as they fade.
        const bt = el - r.start - CLIMB_MS;
        if (bt < 0 || bt > BURST_MS) continue;
        const flash = Math.max(0, 1 - bt / 160);
        if (flash > 0) {
          const grad = ctx.createRadialGradient(r.to.x, r.to.y, 0, r.to.x, r.to.y, 110);
          grad.addColorStop(0, `rgba(255,255,255,${0.95 * flash})`);
          grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${0.6 * flash})`);
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(r.to.x - 110, r.to.y - 110, 220, 220);
        }
        for (const s of r.sparks) {
          const lifeMs = BURST_MS * s.life;
          if (bt > lifeMs) continue;
          const u = bt / lifeMs;
          // Position under drag: v(t) = v0·e^(−k·t), so x(t) = v0·(1 − e^(−k·t))/k; gravity adds ½·g·t².
          const dist = (s.speed * (1 - Math.exp(-DRAG * bt))) / DRAG;
          const x = r.to.x + Math.cos(s.angle) * dist;
          const y = r.to.y + Math.sin(s.angle) * dist + 0.5 * GRAVITY * bt * bt;
          const wink = u > 0.55 ? 0.55 + 0.45 * Math.abs(Math.sin(bt * 0.02 + s.twinkle)) : 1;
          const a = (1 - u * u * u) * wink;
          const d = s.size * (u < 0.1 ? 5 : 3.8 - u * 1.4);
          ctx.globalAlpha = a;
          ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
          // A short tail while the spark still moves fast.
          if (u < 0.4) {
            const back = Math.max(0, bt - 40);
            const bd = (s.speed * (1 - Math.exp(-DRAG * back))) / DRAG;
            const bx = r.to.x + Math.cos(s.angle) * bd;
            const by = r.to.y + Math.sin(s.angle) * bd + 0.5 * GRAVITY * back * back;
            ctx.globalAlpha = a * 0.35;
            ctx.drawImage(sprite, bx - d / 3, by - d / 3, d * 0.66, d * 0.66);
          }
        }
        ctx.globalAlpha = 1;
      }
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
  return <canvas ref={ref} className="fireworks" aria-hidden />;
}
