import { useEffect, useRef } from 'react';

/**
 * Particle tellings on a fixed canvas over the whole viewport; nothing here touches the game state. Two looks, so
 * different things do not look the same:
 * - `ribbon` (the default): a power reaching across the board. Particles fly from one tile to a Location along a
 *   lit path and land as embers rising off the Location with a +N. Robert Duncanson's landscape was the first.
 * - `spray`: a blow landing. Sparks burst from the struck tile and fall, with a shockwave ring. Short and hard.
 * Fireworks over a cleared Threat have their own canvas (Fireworks.tsx).
 * Timing: a ribbon launches over the first ~350ms, flies ~700ms and lands over ~800ms; a spray is over in ~520ms.
 */
export interface TrailShot {
  from: DOMRect;
  to: DOMRect;
  /** Trail colour (CSS hex). */
  color: string;
  /** Text lifted with the embers on landing ("+1"). */
  label?: string;
  kind?: 'ribbon' | 'spray';
}

const FLY_MS = 700;
const LAUNCH_SPREAD_MS = 350;
const LAND_MS = 800;
const PARTICLES = 40;
const EMBERS = 22;
const RIBBON_TOTAL_MS = LAUNCH_SPREAD_MS + FLY_MS + LAND_MS + 100;
const SPRAY_MS = 520;
const SPARKS = 30;

interface Particle {
  shot: number;
  start: number;
  size: number;
  wobble: number;
  speed: number;
}

interface Ember {
  shot: number;
  x0: number;
  y0: number;
  rise: number;
  sway: number;
  phase: number;
  size: number;
  start: number;
  life: number;
}

interface Spark {
  shot: number;
  angle: number;
  speed: number;
  size: number;
  life: number;
}

interface Landing {
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
    const W = canvas.clientWidth || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.scale(dpr, dpr);
    const t0 = performance.now();
    const rng = (() => {
      let s = 1234567;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const isSpray = (i: number) => shots[i].kind === 'spray';
    const totalMs = Math.max(...shots.map((s) => (s.kind === 'spray' ? SPRAY_MS : RIBBON_TOTAL_MS)));
    // Ribbons: the swarm, the path, and the landing.
    const particles: Particle[] = [];
    const embers: Ember[] = [];
    const landings: Landing[] = [];
    for (let i = 0; i < shots.length; i++) {
      if (isSpray(i)) continue;
      for (let k = 0; k < PARTICLES; k++) {
        particles.push({ shot: i, start: rng() * LAUNCH_SPREAD_MS, size: 2.5 + rng() * 3.5, wobble: (rng() - 0.5) * 30, speed: 0.85 + rng() * 0.3 });
      }
      const land = centre(shots[i].to);
      const landAt = LAUNCH_SPREAD_MS * 0.6 + FLY_MS;
      landings.push({ ...land, start: landAt, color: shots[i].color, label: shots[i].label });
      const r = shots[i].to;
      for (let k = 0; k < EMBERS; k++) {
        embers.push({ shot: i, x0: r.left + r.width * (0.15 + rng() * 0.7), y0: r.top + r.height * (0.45 + rng() * 0.5), rise: 50 + rng() * 90, sway: 4 + rng() * 10, phase: rng() * Math.PI * 2, size: 2 + rng() * 2.6, start: landAt + rng() * 220, life: 520 + rng() * 280 });
      }
    }
    // Sprays: sparks flung from the struck tile, falling as they die.
    const sparks: Spark[] = [];
    for (let i = 0; i < shots.length; i++) {
      if (!isSpray(i)) continue;
      for (let k = 0; k < SPARKS; k++) {
        sparks.push({ shot: i, angle: rng() * Math.PI * 2, speed: 0.22 + rng() * 0.4, size: 1.4 + rng() * 2.2, life: 260 + rng() * 240 });
      }
    }
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
        if (isSpray(i)) continue;
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
      // Ribbon: the path lights up behind the swarm's head and fades once the landing begins.
      for (let i = 0; i < shots.length; i++) {
        if (isSpray(i)) continue;
        const head = Math.min(1, Math.max(0, (el - LAUNCH_SPREAD_MS * 0.3) / FLY_MS));
        const fadeOut = Math.max(0, 1 - Math.max(0, el - (LAUNCH_SPREAD_MS * 0.6 + FLY_MS)) / (LAND_MS * 0.6));
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
      // The swarm in flight.
      for (const p of particles) {
        const t = (el - p.start) / (FLY_MS * p.speed);
        if (t < 0 || t > 1) continue;
        const path = paths[p.shot];
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
      }
      // The landing: a soft glow on the Location, embers rising off it, the +N lifting with them.
      for (const ld of landings) {
        const t = (el - ld.start) / LAND_MS;
        if (t < 0 || t > 1) continue;
        const [r, g, b] = hexToRgb(ld.color);
        const k = 1 - t;
        const grad = ctx.createRadialGradient(ld.x, ld.y, 0, ld.x, ld.y, 80);
        grad.addColorStop(0, `rgba(255,255,255,${0.5 * k * k})`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${0.4 * k})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(ld.x - 80, ld.y - 80, 160, 160);
        if (ld.label) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = '800 28px Cinzel, Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, k * 1.6)})`;
          ctx.shadowColor = `rgba(${r},${g},${b},1)`;
          ctx.shadowBlur = 12;
          ctx.fillText(ld.label, ld.x, ld.y - 8 - 44 * ease(t));
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = 'lighter';
        }
      }
      for (const e of embers) {
        const t = (el - e.start) / e.life;
        if (t < 0 || t > 1) continue;
        const sprite = sprites[e.shot];
        const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const x = e.x0 + Math.sin(t * Math.PI * 2 * 1.3 + e.phase) * e.sway;
        const y = e.y0 - e.rise * ease(t);
        const d = e.size * (2.6 + 1.2 * (1 - t));
        ctx.globalAlpha = a * 0.95;
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      // Sprays: a flash, a shockwave ring, sparks out and down.
      for (let i = 0; i < shots.length; i++) {
        if (!isSpray(i)) continue;
        const t = el / SPRAY_MS;
        if (t < 0 || t > 1) continue;
        const c = centre(shots[i].from);
        const [r, g, b] = hexToRgb(shots[i].color);
        const flash = Math.max(0, 1 - el / 120);
        if (flash > 0) {
          const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 60);
          grad.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
          grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.5 * flash})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(c.x - 60, c.y - 60, 120, 120);
        }
        const ringT = Math.min(1, el / 380);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 12 + 78 * ease(ringT), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - ringT)})`;
        ctx.lineWidth = 3 * (1 - ringT) + 0.5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 * (1 - ringT)})`;
        ctx.lineWidth = 6 * (1 - ringT) + 0.5;
        ctx.stroke();
      }
      for (const s of sparks) {
        if (el > s.life) continue;
        const u = el / s.life;
        const c = centre(shots[s.shot].from);
        const dist = s.speed * el * (1 - 0.45 * u);
        const x = c.x + Math.cos(s.angle) * dist;
        const y = c.y + Math.sin(s.angle) * dist + 0.0011 * el * el;
        const [r, g, b] = hexToRgb(shots[s.shot].color);
        const a = 1 - u * u;
        // A short streak behind each spark, then a bright head.
        const bx = c.x + Math.cos(s.angle) * dist * 0.82;
        const by = c.y + Math.sin(s.angle) * dist * 0.82 + 0.0011 * Math.max(0, el - 40) ** 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.7 * a})`;
        ctx.lineWidth = s.size * 0.9;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, s.size * (1 - u * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${230 - Math.round(120 * u)},${200 - Math.round(180 * u)},${a})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (freezeAt !== undefined) return;
      if (el < totalMs) raf = requestAnimationFrame(frame);
      else done.current();
    };
    if (freezeAt !== undefined) frame(t0 + freezeAt);
    else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, freezeAt]);
  return <canvas ref={ref} className="trails" aria-hidden />;
}

/** Trail colours by side: a player's particles match their tint on the board; the artist's are green; a blow's are ember-orange. */
export const TRAIL_COLORS: Record<'A' | 'B' | 'artist' | 'impact', string> = { A: '#ffe3b3', B: '#6fa3ff', artist: '#4fd18a', impact: '#ff6a3c' };
