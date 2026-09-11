import { useEffect, useRef } from 'react';

/**
 * Power trails: particles fly from one board element to others and burst on arrival.
 * A fixed canvas over the whole viewport; nothing here touches the game state. The first use is Robert Duncanson's
 * landscape (a trail from his tile to every Location where his player is Established); other cross-Location powers
 * plug in by passing more shots. Timing: particles launch over the first ~350ms, fly ~700ms, burst ~450ms.
 */
export interface TrailShot {
  from: DOMRect;
  to: DOMRect;
  /** Trail colour (CSS hex). */
  color: string;
  /** Text stamped at the target on arrival ("+1"). */
  label?: string;
  /** Impact spray: particles and a burst only, no ribbon and no source glow. */
  noRibbon?: boolean;
}

const FLY_MS = 700;
const LAUNCH_SPREAD_MS = 350;
const BURST_MS = 450;
const PARTICLES = 40;
const TOTAL_MS = LAUNCH_SPREAD_MS + FLY_MS + BURST_MS + 150;

interface Particle {
  shot: number;
  start: number;
  size: number;
  wobble: number;
  speed: number;
}

interface Burst {
  x: number;
  y: number;
  start: number;
  color: string;
  label?: string;
}

function centre(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A soft glowing disc, pre-rendered once per colour: cheaper than shadowBlur on every particle. */
function glowSprite(color: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function Trails({ shots, onDone, freezeAt }: { shots: TrailShot[]; onDone: () => void; /** Dev: render one frame at this time and hold it. */ freezeAt?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !shots.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.scale(dpr, dpr);
    const t0 = performance.now();
    const rng = (() => {
      let s = 1234567;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const particles: Particle[] = [];
    for (let i = 0; i < shots.length; i++) {
      for (let k = 0; k < PARTICLES; k++) {
        particles.push({ shot: i, start: rng() * LAUNCH_SPREAD_MS, size: 2.5 + rng() * 3.5, wobble: (rng() - 0.5) * 30, speed: 0.85 + rng() * 0.3 });
      }
    }
    const bursts: Burst[] = shots.map((s) => ({ ...centre(s.to), start: LAUNCH_SPREAD_MS * 0.6 + FLY_MS, color: s.color, label: s.label }));
    const sprites = shots.map((s) => glowSprite(s.color, 48));
    const paths = shots.map((s) => {
      const a = centre(s.from);
      const b = centre(s.to);
      // A shallow arc that stays on screen: the higher endpoint minus a lift that scales with the distance.
      const lift = Math.min(90, Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.16));
      return { a, b, c: { x: (a.x + b.x) / 2, y: Math.max(24, Math.min(a.y, b.y) - lift) } };
    });
    const at = (p: { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number } }, t: number) => {
      const u = 1 - t;
      return { x: u * u * p.a.x + 2 * u * t * p.c.x + t * t * p.b.x, y: u * u * p.a.y + 2 * u * t * p.c.y + t * t * p.b.y };
    };
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const frame = (now: number) => {
      const el = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // Source glow.
      for (let i = 0; i < shots.length; i++) {
        if (shots[i].noRibbon) continue;
        const k = Math.max(0, 1 - el / (LAUNCH_SPREAD_MS + 300));
        if (k <= 0) continue;
        const [r, g, b] = hexToRgb(shots[i].color);
        const s = centre(shots[i].from);
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 46);
        grad.addColorStop(0, `rgba(${r},${g},${b},${0.55 * k})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(s.x - 50, s.y - 50, 100, 100);
      }
      // Ribbon: the path lights up behind the swarm's head and fades once the burst lands.
      for (let i = 0; i < shots.length; i++) {
        if (shots[i].noRibbon) continue;
        const head = Math.min(1, Math.max(0, (el - LAUNCH_SPREAD_MS * 0.3) / FLY_MS));
        const fadeOut = Math.max(0, 1 - Math.max(0, el - (LAUNCH_SPREAD_MS * 0.6 + FLY_MS)) / BURST_MS);
        if (head <= 0 || fadeOut <= 0) continue;
        const [r, g, b] = hexToRgb(shots[i].color);
        ctx.beginPath();
        const steps = 40;
        for (let k = 0; k <= steps; k++) {
          const q = at(paths[i], ease(head) * (k / steps));
          if (k === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.55 * fadeOut})`;
        ctx.lineWidth = 6;
        ctx.shadowColor = `rgba(${r},${g},${b},${0.9 * fadeOut})`;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * fadeOut})`;
        ctx.lineWidth = 1.6;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
      // Trails.
      for (const p of particles) {
        const t = (el - p.start) / (FLY_MS * p.speed);
        if (t < 0 || t > 1) continue;
        const path = paths[p.shot];
        const [r, g, b] = hexToRgb(shots[p.shot].color);
        const fade = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
        const wob = Math.sin(t * Math.PI * 2 + p.wobble) * p.wobble * (1 - t);
        // Tail: four fading ghosts behind the head, drawn as glow sprites.
        const sprite = sprites[p.shot];
        for (let k = 4; k >= 0; k--) {
          const tt = Math.max(0, ease(t) - k * 0.03);
          const q = at(path, tt);
          const a = fade * (k === 0 ? 1 : 0.45 / k);
          const d = p.size * (k === 0 ? 5 : 3.6);
          ctx.globalAlpha = a;
          ctx.drawImage(sprite, q.x + wob - d / 2, q.y + wob * 0.4 - d / 2, d, d);
        }
        ctx.globalAlpha = 1;
        void r; void g; void b;
      }
      // Bursts.
      for (const bst of bursts) {
        const t = (el - bst.start) / BURST_MS;
        if (t < 0 || t > 1) continue;
        const [r, g, b] = hexToRgb(bst.color);
        const k = 1 - t;
        const ring = 22 + 90 * ease(t);
        ctx.beginPath();
        ctx.arc(bst.x, bst.y, ring, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.8 * k})`;
        ctx.lineWidth = 4 * k + 0.5;
        ctx.stroke();
        const grad = ctx.createRadialGradient(bst.x, bst.y, 0, bst.x, bst.y, 90);
        grad.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
        grad.addColorStop(0.3, `rgba(${r},${g},${b},${0.6 * k})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(bst.x - 90, bst.y - 90, 180, 180);
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2 + 0.2;
          const d = 16 + 70 * ease(t);
          ctx.beginPath();
          ctx.arc(bst.x + Math.cos(ang) * d, bst.y + Math.sin(ang) * d, 3.5 * k + 0.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${k})`;
          ctx.fill();
        }
        if (bst.label) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = '800 28px Cinzel, Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, k * 1.6)})`;
          ctx.shadowColor = `rgba(${r},${g},${b},1)`;
          ctx.shadowBlur = 12;
          ctx.fillText(bst.label, bst.x, bst.y - 8 - 26 * ease(t));
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = 'lighter';
        }
      }
      if (freezeAt !== undefined) return;
      if (el < TOTAL_MS) raf = requestAnimationFrame(frame);
      else done.current();
    };
    if (freezeAt !== undefined) frame(t0 + freezeAt);
    else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, freezeAt]);
  return <canvas ref={ref} className="trails" aria-hidden />;
}

/** Colours per side for trails. */
/** Trail colours. The player's stream is pale amber-white (a saturated yellow read as something else entirely). */
export const TRAIL_COLORS: Record<'A' | 'B' | 'artist' | 'impact', string> = { A: '#ffe3b3', B: '#6fa3ff', artist: '#4fd18a', impact: '#ff6a3c' };
