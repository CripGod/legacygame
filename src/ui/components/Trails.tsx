import { useEffect, useRef } from 'react';

/**
 * Particle tellings on a fixed canvas over the whole viewport; nothing here touches the game state. Three looks, so
 * different things do not look the same (the README's "Effects library" maps each to a Unity ParticleSystem):
 * - `ribbon` (the default): a power reaching across the board. Particles fly from one tile to a Location along a
 *   lit path and land as embers rising off the Location with a +N. Robert Duncanson's landscape was the first.
 * - `spray`: a blow landing. Sparks burst from the struck tile and fall, with a shockwave ring. Short and hard.
 * - `wave`: word spreading. A Location just healed of its Threat sends one ring of light out across the board at
 *   `WAVE_SPEED`; every Location the ring reaches blooms, sparkles twinkle over its name and the +N lifts off it.
 *   Nothing streams out of the Threat: the good news is the Location's own health reaching the others.
 * - `burst`: the Stand, Marvel Snap style. A flash and two shockwave rings from the button, sparks flung out and
 *   falling, and slow gold embers that keep rising for two seconds while the roar carries on.
 * Fireworks over a cleared Threat have their own canvas (Fireworks.tsx).
 * Timing: a ribbon launches over the first ~350ms, flies ~700ms and lands over ~800ms; a spray is over in ~520ms;
 * a wave reaches a Location `waveLandAt(from, to)` ms in and is done ~900ms after the farthest one.
 */
export interface TrailShot {
  from: DOMRect;
  to: DOMRect;
  /** Trail colour (CSS hex). */
  color: string;
  /** Text lifted with the embers on landing ("+1"). */
  label?: string;
  kind?: 'ribbon' | 'spray' | 'wave' | 'burst';
  /** Wave shots: the colour of the ring and its motes (the one who broke the Threat); `color` stays the landing's. */
  ring?: string;
}

const FLY_MS = 700;
const LAUNCH_SPREAD_MS = 350;
const LAND_MS = 800;
const PARTICLES = 40;
const EMBERS = 22;
const RIBBON_TOTAL_MS = LAUNCH_SPREAD_MS + FLY_MS + LAND_MS + 100;
const SPRAY_MS = 520;
const SPARKS = 30;
/** The wave's front, in px per ms: a 1000px board is crossed in a little over a second. */
export const WAVE_SPEED = 0.9;
/** The healed Location blooms for this long before the ring sets out. */
const WAVE_LEAD_MS = 140;
const WAVE_BAND = 64;
const MOTES = 56;
const SPARKLES = 14;
const BURST_MS = 2300;
const BURST_SPARKS = 110;
const BURST_EMBERS = 36;

/** When a wave from `from` reaches `to`, in ms after the wave starts. */
export function waveLandAt(from: DOMRect, to: DOMRect): number {
  const a = centre(from);
  const b = centre(to);
  return WAVE_LEAD_MS + Math.hypot(b.x - a.x, b.y - a.y) / WAVE_SPEED;
}

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

interface Sparkle {
  x: number;
  y: number;
  size: number;
  start: number;
  life: number;
  spin: number;
}

interface Wave {
  x: number;
  y: number;
  /** How far the ring travels before it has faded out: past the farthest Location it pays. */
  reach: number;
  /** The ring's colour: whoever broke the Threat. */
  color: string;
  sprite: HTMLCanvasElement;
  motes: { angle: number; jitter: number; size: number }[];
}

/** A four-point star, the sparkle's shape. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const d = i % 2 === 0 ? r : r * 0.32;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
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
    const isWave = (i: number) => shots[i].kind === 'wave';
    const isBurst = (i: number) => shots[i].kind === 'burst';
    const totalMs = Math.max(...shots.map((s) => (s.kind === 'spray' ? SPRAY_MS : s.kind === 'burst' ? BURST_MS : s.kind === 'wave' ? waveLandAt(s.from, s.to) + LAND_MS + 100 : RIBBON_TOTAL_MS)));
    // Bursts: the Stand's sparks and its slow embers.
    const bsparks: Spark[] = [];
    const bembers: Ember[] = [];
    for (let i = 0; i < shots.length; i++) {
      if (!isBurst(i)) continue;
      for (let k = 0; k < BURST_SPARKS; k++) bsparks.push({ shot: i, angle: rng() * Math.PI * 2, speed: 0.3 + rng() * 0.6, size: 1.6 + rng() * 2.6, life: 520 + rng() * 620 });
      const c = centre(shots[i].from);
      for (let k = 0; k < BURST_EMBERS; k++) bembers.push({ shot: i, x0: c.x + (rng() - 0.5) * shots[i].from.width * 1.2, y0: c.y + (rng() - 0.4) * shots[i].from.height, rise: 60 + rng() * 140, sway: 6 + rng() * 14, phase: rng() * Math.PI * 2, size: 2 + rng() * 3, start: 200 + rng() * 1100, life: 700 + rng() * 700 });
    }
    // Ribbons: the swarm, the path, and the landing.
    const particles: Particle[] = [];
    const embers: Ember[] = [];
    const landings: Landing[] = [];
    // Waves: one ring per origin (the shots of one clear all share it), a landing with sparkles per Location reached.
    const waves: Wave[] = [];
    const sparkles: Sparkle[] = [];
    for (let i = 0; i < shots.length; i++) {
      if (!isWave(i)) continue;
      const o = centre(shots[i].from);
      const landAt = waveLandAt(shots[i].from, shots[i].to);
      let w = waves.find((v) => Math.abs(v.x - o.x) < 2 && Math.abs(v.y - o.y) < 2);
      if (!w) {
        const color = shots[i].ring ?? TRAIL_COLORS.heal;
        w = { x: o.x, y: o.y, reach: 0, color, sprite: glowSprite(color, 48), motes: [] };
        for (let k = 0; k < MOTES; k++) w.motes.push({ angle: (k / MOTES) * Math.PI * 2 + rng() * 0.1, jitter: (rng() - 0.5) * WAVE_BAND * 0.8, size: 5 + rng() * 6 });
        waves.push(w);
      }
      w.reach = Math.max(w.reach, (landAt - WAVE_LEAD_MS) * WAVE_SPEED + 140);
      landings.push({ ...centre(shots[i].to), start: landAt, color: shots[i].color, label: shots[i].label });
      const r = shots[i].to;
      for (let k = 0; k < SPARKLES; k++) {
        sparkles.push({ x: r.left + r.width * (0.08 + rng() * 0.84), y: r.top - 6 + r.height * (rng() * 1.3), size: 4 + rng() * 6, start: landAt + rng() * 320, life: 420 + rng() * 320, spin: rng() * Math.PI });
      }
    }
    for (let i = 0; i < shots.length; i++) {
      if (isSpray(i) || isWave(i) || isBurst(i)) continue;
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
    const healSprite = glowSprite(TRAIL_COLORS.heal, 48);
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
      // The burst: a flash, two shockwave rings, a glow that lingers, sparks out and down, embers rising slowly.
      for (let i = 0; i < shots.length; i++) {
        if (!isBurst(i) || el > BURST_MS) continue;
        const c = centre(shots[i].from);
        const [r, g, b] = hexToRgb(shots[i].color);
        const flash = Math.max(0, 1 - el / 200);
        const linger = Math.max(0, 1 - el / BURST_MS);
        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 150);
        grad.addColorStop(0, `rgba(255,255,255,${0.95 * flash + 0.25 * linger})`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${0.6 * flash + 0.18 * linger})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(c.x - 150, c.y - 150, 300, 300);
        for (const [delay, reach, w] of [[0, 280, 1], [140, 210, 0.6]] as [number, number, number][]) {
          const t = (el - delay) / 700;
          if (t < 0 || t > 1) continue;
          const k = (1 - t) * w;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 14 + reach * ease(t), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
          ctx.lineWidth = 3.5 * (1 - t) + 0.6;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.7 * k})`;
          ctx.lineWidth = 9 * (1 - t) + 0.6;
          ctx.stroke();
        }
      }
      for (const s of bsparks) {
        if (el > s.life) continue;
        const u = el / s.life;
        const c = centre(shots[s.shot].from);
        const dist = s.speed * el * (1 - 0.5 * u);
        const x = c.x + Math.cos(s.angle) * dist;
        const y = c.y + Math.sin(s.angle) * dist + 0.0006 * el * el;
        const [r, g, b] = hexToRgb(shots[s.shot].color);
        const a = 1 - u * u;
        const bx = c.x + Math.cos(s.angle) * dist * 0.85;
        const by = c.y + Math.sin(s.angle) * dist * 0.85 + 0.0006 * Math.max(0, el - 40) ** 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.75 * a})`;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, s.size * (1 - u * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${245 - Math.round(60 * u)},${220 - Math.round(150 * u)},${a})`;
        ctx.fill();
      }
      for (const e of bembers) {
        const t = (el - e.start) / e.life;
        if (t < 0 || t > 1) continue;
        const sprite = sprites[e.shot];
        const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const x = e.x0 + Math.sin(t * Math.PI * 2 * 1.1 + e.phase) * e.sway;
        const y = e.y0 - e.rise * ease(t);
        const d = e.size * (2.4 + 1.2 * (1 - t));
        ctx.globalAlpha = a * 0.9;
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      // Source glow.
      for (let i = 0; i < shots.length; i++) {
        if (isSpray(i) || isWave(i) || isBurst(i)) continue;
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
      // The wave: the healed Location blooms, then one ring of light sets out with motes riding its front,
      // fading as it travels; an echo ring follows a beat behind.
      for (const w of waves) {
        const [r, g, b] = hexToRgb(w.color);
        const bloom = el < WAVE_LEAD_MS + 260 ? Math.sin(Math.min(1, el / (WAVE_LEAD_MS + 260)) * Math.PI) : 0;
        if (bloom > 0) {
          const grad = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, 90);
          grad.addColorStop(0, `rgba(255,255,255,${0.5 * bloom})`);
          grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.35 * bloom})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(w.x - 90, w.y - 90, 180, 180);
        }
        const rings: [number, number][] = [
          [WAVE_SPEED * (el - WAVE_LEAD_MS), 1],
          [WAVE_SPEED * (el - WAVE_LEAD_MS - 170), 0.45],
        ];
        for (const [radius, weight] of rings) {
          if (radius <= 0 || radius > w.reach) continue;
          const k = weight * Math.pow(1 - radius / w.reach, 0.8);
          const inner = Math.max(0, radius - WAVE_BAND);
          const grad = ctx.createRadialGradient(w.x, w.y, inner, w.x, w.y, radius + 14);
          grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
          // The band reads in the breaker's colour; only the thin leading line is white.
          grad.addColorStop(0.62, `rgba(${r},${g},${b},${0.6 * k})`);
          grad.addColorStop(0.9, `rgba(${r},${g},${b},${0.85 * k})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(w.x - radius - 16, w.y - radius - 16, (radius + 16) * 2, (radius + 16) * 2);
          ctx.beginPath();
          ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.9 * k})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        const front = WAVE_SPEED * (el - WAVE_LEAD_MS);
        if (front > 0 && front < w.reach) {
          const k = Math.pow(1 - front / w.reach, 0.8);
          const sprite = w.sprite;
          for (const m of w.motes) {
            const d = front + m.jitter;
            const x = w.x + Math.cos(m.angle) * d;
            const y = w.y + Math.sin(m.angle) * d;
            if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
            const twinkle = 0.6 + 0.4 * Math.abs(Math.sin(el * 0.012 + m.angle * 7));
            ctx.globalAlpha = k * twinkle;
            ctx.drawImage(sprite, x - m.size / 2, y - m.size / 2, m.size, m.size);
          }
          ctx.globalAlpha = 1;
        }
      }
      // Ribbon: the path lights up behind the swarm's head and fades once the landing begins.
      for (let i = 0; i < shots.length; i++) {
        if (isSpray(i) || isWave(i) || isBurst(i)) continue;
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
      // Sparkles: four-point stars twinkling over a Location the wave has reached, each turning as it swells and fades.
      for (const sp of sparkles) {
        const t = (el - sp.start) / sp.life;
        if (t < 0 || t > 1) continue;
        const swell = Math.sin(t * Math.PI);
        const rot = sp.spin + t * 0.9;
        const r = sp.size * (0.4 + swell);
        ctx.globalAlpha = swell;
        ctx.drawImage(healSprite, sp.x - r * 1.6, sp.y - r * 1.6, r * 3.2, r * 3.2);
        star(ctx, sp.x, sp.y, r, rot);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
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

/** Trail colours by side: a player's particles match their tint on the board; the artist's are green; a blow's are ember-orange; the healing wave is sunrise gold. */
export const TRAIL_COLORS: Record<'A' | 'B' | 'artist' | 'impact' | 'heal' | 'stand', string> = { A: '#ffe3b3', B: '#6fa3ff', artist: '#4fd18a', impact: '#ff6a3c', heal: '#ffe19a', stand: '#ffd34d' };
