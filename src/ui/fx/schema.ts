/**
 * Particle presets: the data every effect is made of, on the web and in Unity alike. A preset is one or more
 * emitters; each emitter spawns `count` particles inside a `spawn` window, at `origin` (a box in the anchor's
 * fractions), and every particle's whole life is a closed form of its birth values (speed, angle, drag, gravity,
 * sway) so a frame at time t is the same on every machine and in every port. Curves are polylines over the
 * particle's life (0..1). Colours are hex; '$tint' stands for the colour the effect is asked to wear (the owner's).
 */
export interface Range {
  min: number;
  max: number;
}

/** A polyline over 0..1: [[t, value], ...], t ascending. */
export type Curve = [number, number][];

/** A gradient over the particle's life: [[t, '#rrggbb' | '$tint'], ...]. */
export type Gradient = [number, string][];

export type Sprite = 'glow' | 'puff' | 'spark' | 'star';

/** How a particle travels: free (speed, drag, gravity) or to the effect's target along an arc. */
export interface Path {
  mode: 'free' | 'target';
  /** Target mode: the arc's lift at mid-way, px (negative sags). */
  arc: number;
  /** Target mode: how the travel is timed over the particle's life. */
  ease: 'linear' | 'in' | 'out' | 'inOut';
  /** Target mode: scatter around the target's centre at arrival, px. */
  spread: number;
}

export interface Emitter {
  name: string;
  /** Particles this emitter makes in all. */
  count: number;
  /** When they are born, ms after the effect starts. */
  spawn: Range;
  /** Where they are born: fractions of the anchor rect (0 = left/top, 1 = right/bottom; outside is allowed), or of the target's. */
  origin: { x: Range; y: Range };
  originAt?: 'anchor' | 'target';
  /** Free flight by default; 'target' carries each particle to the effect's target over its life. */
  path?: Path;
  /** How long each lives, ms. */
  life: Range;
  /** Launch direction, degrees, screen-wise: 0 right, 90 down, 180 left, 270 up. */
  angle: Range;
  /** Launch speed, px per ms. */
  speed: Range;
  /** Air: the speed decays by this share per ms (0 = none). Distance = speed·(1 − e^(−drag·t))/drag. */
  drag: number;
  /** Fall, px per ms² (negative lifts). */
  gravity: number;
  /** Side-to-side wander: amplitude px, frequency cycles per second. */
  sway: { amp: number; freq: number };
  /** Diameter at birth, px. */
  size: Range;
  /** Diameter multiplier over life. */
  sizeOver: Curve;
  /** Opacity over life. */
  alphaOver: Curve;
  /** Colour over life. */
  color: Gradient;
  sprite: Sprite;
  /** Turns per second (star and spark only). */
  spin: Range;
  /** Additive light (sparks, embers) or plain paint (smoke). */
  blend: 'add' | 'normal';
  /** A streak behind a moving particle, as a share of the last 40 ms of travel (0 = none). */
  trail: number;
}

export interface FxPreset {
  id: string;
  name: string;
  /** What the effect plays over (where particles are born): a Location panel, a tile, the Stand button, the screen. */
  anchor: 'location' | 'tile' | 'button' | 'screen';
  /** What it travels to, when its emitters have a target path: the Influence circle, or a Location panel. */
  target?: 'meter' | 'location';
  /** The effect is over after this many ms (particles past it are cut). */
  duration: number;
  emitters: Emitter[];
}

export function curveAt(c: Curve, t: number): number {
  if (!c.length) return 1;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, v0] = c[i - 1];
      const [t1, v1] = c[i];
      return t1 === t0 ? v1 : v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return c[c.length - 1][1];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The gradient's colour at t, tint substituted. */
export function gradientAt(g: Gradient, t: number, tint: string): string {
  const col = (s: string) => (s === '$tint' ? tint : s);
  if (!g.length) return tint;
  if (t <= g[0][0]) return col(g[0][1]);
  for (let i = 1; i < g.length; i++) {
    if (t <= g[i][0]) {
      const [t0, c0] = g[i - 1];
      const [t1, c1] = g[i];
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const a = hexToRgb(col(c0));
      const b = hexToRgb(col(c1));
      return rgbToHex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
    }
  }
  return col(g[g.length - 1][1]);
}

/** Says what is wrong with a preset, or nothing. */
export function validatePreset(p: FxPreset): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9-]+$/.test(p.id)) errs.push('id must be lowercase letters, digits and dashes');
  if (!(p.duration > 0)) errs.push('duration must be positive');
  if (!p.emitters?.length) errs.push('at least one emitter');
  const range = (r: Range, what: string) => {
    if (!r || typeof r.min !== 'number' || typeof r.max !== 'number' || r.min > r.max) errs.push(`${what}: min must not exceed max`);
  };
  const curve = (c: Curve, what: string) => {
    if (!Array.isArray(c) || !c.length) errs.push(`${what}: needs at least one stop`);
    for (let i = 1; i < (c?.length ?? 0); i++) if (c[i][0] < c[i - 1][0]) errs.push(`${what}: stops must ascend`);
  };
  for (const e of p.emitters ?? []) {
    if (!(e.count >= 0 && e.count <= 2000)) errs.push(`${e.name}: count 0–2000`);
    range(e.spawn, `${e.name} spawn`);
    range(e.life, `${e.name} life`);
    range(e.angle, `${e.name} angle`);
    range(e.speed, `${e.name} speed`);
    range(e.size, `${e.name} size`);
    range(e.spin, `${e.name} spin`);
    range(e.origin?.x, `${e.name} origin x`);
    range(e.origin?.y, `${e.name} origin y`);
    curve(e.sizeOver, `${e.name} sizeOver`);
    curve(e.alphaOver, `${e.name} alphaOver`);
    if (!Array.isArray(e.color) || !e.color.length) errs.push(`${e.name}: color needs a stop`);
    if (!['glow', 'puff', 'spark', 'star'].includes(e.sprite)) errs.push(`${e.name}: unknown sprite`);
    if (!['add', 'normal'].includes(e.blend)) errs.push(`${e.name}: blend is add or normal`);
    if (e.drag < 0) errs.push(`${e.name}: drag cannot be negative`);
    if (e.path && !['free', 'target'].includes(e.path.mode)) errs.push(`${e.name}: path mode is free or target`);
    if ((e.path?.mode === 'target' || e.originAt === 'target') && !p.target) errs.push(`${e.name}: needs the preset's target`);
  }
  return errs;
}
