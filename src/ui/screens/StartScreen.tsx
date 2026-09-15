import { AudioControl } from '../components/AudioControl';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { resetCoach } from '../components/Coach';
import { resetGuide } from '../guide';
import { PRESET_DECKS, CARD_BY_ID, THREAT_BY_ID } from '../../engine';
import { TUTORIAL_SEED, TUTORIAL_DECKS } from '../tutorial';
import { Wordmark } from '../components/Wordmark';
import { CardFace } from '../components/CardFace';
import { CodexSheet } from '../components/CodexSheet';
import { Art } from '../components/Art';
import { artUrl } from '../art';
import '../compendium.css';
import '../landing.css';

export interface StartOptions {
  seed?: number;
  mode: 'ai' | 'hotseat';
  placeholders: boolean;
  dev: boolean;
  coach: boolean;
  deckA: string;
  deckB: string;
  /** The baked walkthrough: fixed seed and decks, stopped clock, scripted lessons. */
  tutorial?: boolean;
}

const RANDOM_DECK = { key: 'random', name: 'Random', style: 'Ten random Characters from the whole pool plus both Events. Different every match.', cards: [] as string[] };
/** One-line deck descriptions for the landing page; the full text lives on the deck itself. */
const TAGLINE: Record<string, string> = {
  railroad: 'Movement and organizing. Harriet moves people, John Brown breaks Threats.',
  blackstar: 'Mobility and return. Relocate freely, come back when pushed out.',
  caiman: 'The cost flow. Prices fall, then the Uprising sends everyone Inside.',
  pantheon: 'Four orisha with the church behind them. Call Black Jesus.',
  mirror: 'Both players get the same cards. The cleanest test.',
  random: 'Ten random Characters plus both Events. Different every match.',
};
/** The Threat spotlighted at the foot of Harborlight's panel. */
const SPOTLIGHT_THREAT = 'mob';

/** Drifting embers over the plates: warm on the left, cool on the right. Pure canvas, no library. */
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; da: number; cool: boolean };
    const ps: P[] = [];
    const spawn = (): P => {
      const cool = Math.random() < 0.45;
      return { x: cool ? w * (0.55 + Math.random() * 0.45) : w * Math.random() * 0.45, y: h + 10, r: 0.6 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.25, vy: -(0.25 + Math.random() * 0.55), a: 0, da: 0.004 + Math.random() * 0.006, cool };
    };
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 70; i++) {
      const p = spawn();
      p.y = Math.random() * h;
      p.a = Math.random() * 0.8;
      ps.push(p);
    }
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx + Math.sin(p.y * 0.01 + i) * 0.15;
        p.y += p.vy;
        p.a += p.da;
        const alpha = Math.max(0, Math.min(1, Math.sin(Math.min(Math.PI, p.a)))) * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.cool ? `rgba(160, 200, 255, ${alpha})` : `rgba(255, 190, 90, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.cool ? 'rgba(120, 170, 255, 0.9)' : 'rgba(255, 160, 40, 0.9)';
        ctx.fill();
        if (p.y < -10 || p.a > Math.PI) ps[i] = spawn();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="embers" aria-hidden />;
}

/** Sparks shed by the Mob card: red and orange motes rising off its edges. */
function MobSparks({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (burst > 0) burstRef.current();
  }, [burst]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    // The card occupies the middle of the canvas: x 27%–73%, y 36%–87%.
    type P = { x: number; y: number; r: number; vx: number; vy: number; life: number; max: number; hue: number };
    const ps: P[] = [];
    const spawn = (): P => {
      const side = Math.random();
      const x = side < 0.5 ? w * (0.27 + Math.random() * 0.46) : side < 0.75 ? w * 0.27 : w * 0.73;
      const y = side < 0.5 ? h * 0.87 : h * (0.36 + Math.random() * 0.51);
      // Sickly motes: slow, wobbling, yellow-green, a few soft spores among the specks. (The hue also picks the palette below.)
      const spore = Math.random() < 0.18;
      return { x, y, r: spore ? 2.4 + Math.random() * 3 : 0.5 + Math.random() * 1.3, vx: (Math.random() - 0.5) * 0.3, vy: -(0.1 + Math.random() * 0.32), life: 0, max: 140 + Math.random() * 160, hue: 62 + Math.random() * 46 };
    };
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 40; i++) {
      const p = spawn();
      p.life = Math.random() * p.max;
      ps.push(p);
    }
    // The explosion: a ring of fast, hot motes thrown out from the card's centre.
    burstRef.current = () => {
      for (let i = 0; i < 140; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 7;
        ps.push({ x: w * 0.5, y: h * 0.62, r: 1 + Math.random() * 2.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0, max: 40 + Math.random() * 50, hue: Math.random() * 40 });
      }
    };
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const hot = p.hue < 60; // burst motes are hot; the idle motes are sick
        p.x += p.vx + Math.sin((p.life + i) * (hot ? 0.08 : 0.05)) * (hot ? 0.25 : 0.4);
        p.y += p.vy;
        p.vy += hot ? 0.04 : 0; // a little gravity so the burst arcs; the motes just drift
        p.life += 1;
        const t = p.life / p.max;
        const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (hot ? 1 - t * 0.5 : 0.85 + Math.sin(p.life * 0.06) * 0.15), 0, Math.PI * 2);
        ctx.fillStyle = hot ? `hsla(${p.hue}, 100%, ${60 + t * 25}%, ${Math.max(0, a)})` : `hsla(${p.hue}, 70%, ${p.r > 2 ? 42 : 58}%, ${Math.max(0, a) * (p.r > 2 ? 0.28 : 0.85)})`;
        ctx.shadowBlur = hot ? 10 : 6;
        ctx.shadowColor = hot ? `hsla(${p.hue}, 100%, 55%, 0.9)` : `hsla(${p.hue}, 80%, 45%, 0.7)`;
        ctx.fill();
        if (p.life >= p.max) {
          if (ps.length > 40) ps.splice(i, 1);
          else ps[i] = spawn();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="mob-sparks" aria-hidden />;
}

/** A small deterministic generator so the cracks and the shards look the same on every visit. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/**
 * The cracks behind the Mob: jagged veins radiating from behind the card across a 400×400 box, each with a branch or
 * two. Drawn twice in CSS (a wide dim glow under a thin bright core) and pulsed to a sick heartbeat.
 * Unity: a line renderer per crack with an emissive material driven by the same heartbeat curve.
 */
const CRACK_PATHS: string[] = (() => {
  const rnd = lcg(7);
  const out: string[] = [];
  const cx = 200;
  const cy = 200;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const len = 150 + rnd() * 70;
    const steps = 5 + Math.floor(rnd() * 3);
    let d = `M${cx} ${cy}`;
    const pts: [number, number][] = [];
    for (let k = 1; k <= steps; k++) {
      const r = (len * k) / steps;
      const j = (rnd() - 0.5) * 22;
      const x = cx + Math.cos(a) * r - Math.sin(a) * j;
      const y = cy + Math.sin(a) * r + Math.cos(a) * j;
      pts.push([x, y]);
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out.push(d);
    // A branch off the second or third joint.
    const [bx, by] = pts[1 + Math.floor(rnd() * 2)];
    const ba = a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
    const bl = 30 + rnd() * 50;
    out.push(`M${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(ba) * bl * 0.5 + (rnd() - 0.5) * 8).toFixed(1)} ${(by + Math.sin(ba) * bl * 0.5 + (rnd() - 0.5) * 8).toFixed(1)} L${(bx + Math.cos(ba) * bl).toFixed(1)} ${(by + Math.sin(ba) * bl).toFixed(1)}`);
  }
  return out;
})();

function MobCracks() {
  return (
    <svg className="mob-cracks" viewBox="0 0 400 400" aria-hidden>
      {CRACK_PATHS.map((d, i) => (
        <path key={`g${i}`} className="crack-glow" d={d} pathLength={1} style={{ '--i': i } as CSSProperties} />
      ))}
      {CRACK_PATHS.map((d, i) => (
        <path key={`c${i}`} className="crack-core" d={d} pathLength={1} style={{ '--i': i } as CSSProperties} />
      ))}
    </svg>
  );
}

/**
 * The shatter: the card is cut into shards along cracks that radiate from the fists' impact point, an inner and an
 * outer piece per wedge, and each piece flies out along its own ray, tumbling, and fades. The polygons are in
 * percent of the card box so the same cut fits every size. Unity: a pre-fractured mesh with the same rays.
 */
type Shard = { clip: string; dx: number; dy: number; rot: number; delay: number };
const SHARDS: Shard[] = (() => {
  const rnd = lcg(11);
  const C: [number, number] = [50, 42];
  const N = 10;
  const angles = Array.from({ length: N }, (_, i) => (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.35);
  // Where a ray from C at angle a leaves the box.
  const edge = (a: number): [number, number] => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (100 - C[0]) / dx);
    if (dx < 0) t = Math.min(t, (0 - C[0]) / dx);
    if (dy > 0) t = Math.min(t, (100 - C[1]) / dy);
    if (dy < 0) t = Math.min(t, (0 - C[1]) / dy);
    return [C[0] + dx * t, C[1] + dy * t];
  };
  const lerp = (p: [number, number], q: [number, number], f: number, jit: number, a: number): [number, number] => [p[0] + (q[0] - p[0]) * f - Math.sin(a) * jit, p[1] + (q[1] - p[1]) * f + Math.cos(a) * jit];
  // Each ray is one jagged polyline C → P1 → M → P2 → B, shared by the shards on either side so the cuts meet.
  const rays = angles.map((a) => {
    const B = edge(a);
    return { a, B, P1: lerp(C, B, 0.22, (rnd() - 0.5) * 6, a), M: lerp(C, B, 0.46, (rnd() - 0.5) * 4, a), P2: lerp(C, B, 0.74, (rnd() - 0.5) * 6, a) };
  });
  const corners: [number, number][] = [
    [100, 0],
    [100, 100],
    [0, 100],
    [0, 0],
  ];
  const norm = (a: number, from: number) => ((a - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const poly = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(', ')})`;
  const out: Shard[] = [];
  for (let i = 0; i < N; i++) {
    const r0 = rays[i];
    const r1 = rays[(i + 1) % N];
    const mid = r0.a + norm(r1.a, r0.a) / 2;
    const between = corners.filter((c) => norm(Math.atan2(c[1] - C[1], c[0] - C[0]), r0.a) < norm(r1.a, r0.a)).sort((p, q) => norm(Math.atan2(p[1] - C[1], p[0] - C[0]), r0.a) - norm(Math.atan2(q[1] - C[1], q[0] - C[0]), r0.a));
    const inner: [number, number][] = [C, r0.P1, r0.M, r1.M, r1.P1];
    const outer: [number, number][] = [r0.M, r0.P2, r0.B, ...between, r1.B, r1.P2, r1.M];
    const fling = (far: boolean): Shard => {
      const dist = far ? 150 + rnd() * 140 : 70 + rnd() * 80;
      return { clip: '', dx: Math.cos(mid) * dist, dy: Math.sin(mid) * dist + 70 + rnd() * 90, rot: (rnd() - 0.5) * 200, delay: (far ? 40 : 0) + rnd() * 70 };
    };
    out.push({ ...fling(false), clip: poly(inner) }, { ...fling(true), clip: poly(outer) });
  }
  return out;
})();

/** True on phones and small tablets: the match is desktop-only for now; the landing page and Compendium still work. */
function useSmallScreen(): boolean {
  const q = '(max-width: 820px), ((pointer: coarse) and (max-width: 1100px))';
  const [small, setSmall] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setSmall(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return small;
}

/** A fist, palm side, knuckles leading; painted in a player's colour. */
/** The fist mark (supplied art). Knuckles lead to the right; the right-hand fist is mirrored in CSS. */
const FIST_PATH =
  'M365.8,395l73.8,2.7-9.7,41.4-48.9-1.6-14.5-27.1-.7-15.4h0ZM483.2,181.1l14.7,30.2,1,37-7,4.9,7.3,4.5,1.7,63.3-7.1,5-16,2.5,5.3,8-17.8,52.3-16-1.1,5.1,10.5-22.7,56.4-163.2,16.3-53.7-37.4-40.7-4.5,44.6-16.2,49.3,28.7,96.6-2.8-44.1-82.5-17.8,11.3,35.9-97.9-127.2,111.5,132.8-169.6-7.7-39,29,30.2,17.4,3.2,9.2-5.7,3.5,24.5,25.4,52.4,24.9.3,11.2-7.3-4.8-66.8-20-41.1-117.7-29.3c-13.8,8.7-27.6,17.4-41.4,26.2l-100.7,112.6-96-44.5,86-2.6,95.9-82.8,58.8-37.1,125,39.5,17.4,35.8,23.7,1.3h0ZM364.9,357.5l3.7-31c27.7,1.5,55.4,2.9,83.1,4.5,4.9,3.9,9.7,7.8,14.6,11.8l-11.9,38c-20.6-1.1-41.2-2.3-61.8-3.4l-27.8-18.8v-1h.1ZM377.7,259.9l23.5.6,12.9,26.6,35.1-.8,15.4-10-.9-15.2,21.3-.4,1.1,51.8c-4,.9-7.9,1.8-11.9,2.7-21.3-1.2-42.7-2.4-64-3.6-12.5-5.5-25-10.9-37.5-16.4l3.5-35.4h1.5ZM463.2,245.9l-2.6-53.4,23.2,11.8.8,42.9h-21.2c0,.1,0-1.3,0-1.3h0Z';

function Fist({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`fist ${side}`} viewBox="70 90 440 390" aria-hidden>
      <defs>
        <linearGradient id={`fist-${side}`} x1="0" x2="1">
          {side === 'left' ? (
            <>
              <stop offset="0" stopColor="#c8901e" />
              <stop offset="1" stopColor="#fbe7a3" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#bfe0ff" />
              <stop offset="1" stopColor="#2f7bff" />
            </>
          )}
        </linearGradient>
      </defs>
      <path d={FIST_PATH} fill={`url(#fist-${side})`} fillRule="evenodd" stroke="rgba(0,0,0,0.55)" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

export function StartScreen({ onPlay, onRules, onCards, initialDev }: { onPlay: (o: StartOptions) => void; onRules: () => void; onCards: () => void; initialDev: boolean }) {
  const [dev, setDev] = useState(initialDev);
  const small = useSmallScreen();
  const [seed, setSeed] = useState('');
  const [placeholders, setPlaceholders] = useState(false);
  const [coach, setCoach] = useState(true);
  const [deckA, setDeckA] = useState('railroad');
  const [deckB, setDeckB] = useState('blackstar');
  /** A deck card tapped on the landing page opens the full Compendium sheet for it. */
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /** The Mob on the landing page: 'up' until clicked, 'falling' through the explosion, 'down' with the message, then it re-forms. */
  const [mobState, setMobState] = useState<'hidden' | 'up' | 'falling' | 'down' | 'fading'>('hidden');
  const [burst, setBurst] = useState(0);
  /** Set at the fists' impact: the card is in shards and the colour starts back into the page. */
  const [shattered, setShattered] = useState(false);
  const MOB_FIRST = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mob') ? 400 : 30000; // hidden → up, the first time (?mob: at once)
  const MOB_AGAIN = 60000; // hidden → up, every time after
  const MOB_STANDS = 15000; // up → breaks on its own if nobody clicks
  const MOB_MESSAGE = 10000; // down → the message starts to fade
  const MOB_FADE = 1800; // fading → hidden
  const mobVisits = useRef(0);
  const FIST_IMPACT = 480; // ms after the fists start moving, they meet at the card
  const defeatMob = () => {
    setMobState((m) => {
      if (m !== 'up') return m;
      window.setTimeout(() => {
        const vs = root.current?.querySelector('.vs')?.getBoundingClientRect();
        if (vs) {
          root.current?.style.setProperty('--heal-x', `${vs.left + vs.width / 2}px`);
          root.current?.style.setProperty('--heal-y', `${vs.top + vs.height / 2}px`);
        }
        setBurst((b) => b + 1);
        setShattered(true);
      }, FIST_IMPACT);
      return 'falling';
    });
  };
  // The cycle: thirty seconds in, the Mob rises and the page drains to grey; it breaks on a click or after fifteen
  // seconds on its own; the message stays ten seconds and fades; then it lies low for sixty seconds before rising again.
  useEffect(() => {
    const wait = mobState === 'hidden' ? (mobVisits.current === 0 ? MOB_FIRST : MOB_AGAIN) : mobState === 'up' ? MOB_STANDS : mobState === 'falling' ? FIST_IMPACT + 1000 : mobState === 'down' ? MOB_MESSAGE : MOB_FADE;
    const rise = () => {
      mobVisits.current += 1;
      setShattered(false);
      setMobState('up');
    };
    const next = mobState === 'hidden' ? rise : mobState === 'up' ? defeatMob : mobState === 'falling' ? () => setMobState('down') : mobState === 'down' ? () => setMobState('fading') : () => setMobState('hidden');
    const id = window.setTimeout(next, wait);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobState]);
  // Parallax: the plates and the hero drift a few pixels against the pointer.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      el.style.setProperty('--mx', x.toFixed(3));
      el.style.setProperty('--my', y.toFixed(3));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  const labelFor = (id: string) => {
    const def = CARD_BY_ID[id];
    if (!def) return 'Card';
    if (def.kind === 'event') return 'Event';
    return def.category === 'artist' ? 'Artists' : def.category.charAt(0).toUpperCase() + def.category.slice(1);
  };
  const opts = (mode: 'ai' | 'hotseat'): StartOptions => ({ seed: seed.trim() ? Number(seed) : undefined, mode, placeholders, dev, coach, deckA, deckB });
  const deckOptions = [...Object.entries(PRESET_DECKS).map(([k, d]) => ({ key: k, name: d.name, style: d.style, cards: d.cards })), RANDOM_DECK];
  const mob = THREAT_BY_ID[SPOTLIGHT_THREAT];
  /** The Mob card's face: drawn once standing, and once per shard when it breaks. */
  const mobCard = mob ? (
    <span className="mob-inner">
      <span className="threat-spot-art">
        <Art kind="threats" id={mob.id} className="threat-spot-img" fallback={<span className="ini">⚠</span>} alt="" />
      </span>
      <span className="threat-spot-body">
        <span className="threat-spot-name">The {mob.name}</span>
        <span className="threat-spot-text">Organized violence aimed at exactly the people who are winning. It needs {mob.force} Force in one turn to break.</span>
        <span className="threat-spot-rule">Work together to overcome.</span>
        <small>Both players may contribute Force.</small>
      </span>
    </span>
  ) : null;

  const DeckPanel = ({ side, label, note, value, onChange }: { side: 'mine' | 'theirs'; label: string; note: string; value: string; onChange: (k: string) => void }) => {
    const d = deckOptions.find((o) => o.key === value)!;
    return (
      <section className={`deck-panel ${side}`}>
        <div className="deck-head">
          <div>
            <div className="lbl">{label}</div>
            <p className="deck-style" title={d.style}>{TAGLINE[d.key] ?? d.style}</p>
          </div>
          <span className="deck-note" aria-hidden>
            {note}
          </span>
        </div>
        <div className="deck-tabs-lbl" id={`decks-${side}`}>Decks</div>
        <div className="deck-tabs" role="group" aria-labelledby={`decks-${side}`}>
          {deckOptions.map((o) => (
            <button key={o.key} className={`small ${o.key === value ? 'primary' : ''}`} onClick={() => onChange(o.key)}>
              {o.name}
            </button>
          ))}
        </div>
        <div className="deck-row">
          {d.cards.length > 0 ? (
            <div className="deck-cards">
              {d.cards.map((id) => (
                <CardFace key={id} id={id} onClick={() => setOpen(id)} />
              ))}
            </div>
          ) : (
            <div className="deck-random">A fresh hand every match: ten Characters drawn from the whole pool, plus both Events.</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={`landing ${mobState === 'up' || (mobState === 'falling' && !shattered) ? 'siege' : ''} ${shattered && mobState !== 'hidden' ? 'healing' : ''}`} ref={root}>
      <div className="bg-plates" aria-hidden>
        <div className="bg-plate left" style={{ backgroundImage: `url(${artUrl('landing', 'harriet')})` }} />
        <div className="bg-plate right" style={{ backgroundImage: `url(${artUrl('landing', 'frederick')})` }} />
        <div className="bg-fade" />
        <div className="bg-floor" />
        <Embers />
      </div>
      {/* Siege: two full-page veils drain the colour and the light while the Mob stands (blend modes, so nothing is re-rendered); at the fists' impact a hole opens in them from the VS and widens until the whole page is back in colour. */}
      {mobState !== 'hidden' && (
        <>
          <div className={`siege-veil sat ${shattered ? 'healing' : 'on'}`} aria-hidden />
          <div className={`siege-veil dark ${shattered ? 'healing' : 'on'}`} aria-hidden />
        </>
      )}
      {/* Foreground cutouts paint over the panels; only the Threat card stands above the rocks. */}
      <div className="fg-layer" aria-hidden>
        <div className="fg books" style={{ backgroundImage: `url(${artUrl('landing', 'books', 'webp')})` }} />
        <div className="fg rocks" style={{ backgroundImage: `url(${artUrl('landing', 'rocks', 'webp')})` }} />
      </div>

      <div className="corner left">
        Strategy
        <br />
        builds
        <br />
        legacy
      </div>
      <div className="corner right">
        Real people.
        <br />
        Real Locations.
        <br />
        Real history.
      </div>

      <header className="hero">
        <Wordmark className="hero-mark" />
        <div className="hero-sub">The Black History Card Battler</div>
        <div className="hero-tag">People. Strategy. A stronger tomorrow.</div>
      </header>
      <div className="audio-corner">
        <AudioControl />
      </div>

      {small && (
        <div className="desktop-note" role="note">
          <div className="desktop-note-title">Built for the desk, for now</div>
          <div>The match is desktop-only while it is in development. Open this on a laptop or desktop browser to play. The cards and the rules are open here.</div>
        </div>
      )}
      <nav className="hero-actions" aria-label="Start">
        <button className="cta play" onClick={() => onPlay(opts('ai'))} disabled={small} title={small ? 'Desktop only for now' : undefined}>
          <span className="cta-ico" aria-hidden>
            ▶
          </span>
          Play match
        </button>
        <button className="cta" onClick={() => onPlay({ ...opts('ai'), seed: TUTORIAL_SEED, deckA: TUTORIAL_DECKS.A, deckB: TUTORIAL_DECKS.B, coach: true, tutorial: true })} disabled={small} title={small ? 'Desktop only for now' : undefined}>
          <span className="cta-ico" aria-hidden>
            ✦
          </span>
          Tutorial
        </button>
        <button className="cta" onClick={onCards}>
          <span className="cta-ico" aria-hidden>
            ▤
          </span>
          Cards
        </button>
        <button className="cta" onClick={onRules}>
          <span className="cta-ico" aria-hidden>
            ▭
          </span>
          Learn the rules
        </button>
      </nav>

      <div className="decks">
        <DeckPanel side="mine" label="Your cards" note="Justice arcs forward." value={deckA} onChange={setDeckA} />
        <div className={`vs-col ${mobState}`}>
          <div className="vs-flourish" aria-hidden />
          <div className="vs" aria-hidden>
            VS
          </div>
          {mobState === 'falling' && (
            <div className="fists" aria-hidden>
              <Fist side="left" />
              <Fist side="right" />
              <span className="fist-flash" />
            </div>
          )}
          {mob && (mobState === 'up' || mobState === 'falling') && (
            <button className={`threat-spot ${mobState} ${shattered ? 'shattered' : ''}`} aria-label="The Mob. Click to neutralize it together." onClick={defeatMob}>
              <MobCracks />
              <MobSparks burst={burst} />
              <span className="mob-shape">{mobCard}</span>
              {shattered && (
                <span className="mob-shards" aria-hidden>
                  {SHARDS.map((sh, i) => (
                    <span key={i} className="shard" style={{ clipPath: sh.clip, '--dx': `${sh.dx}px`, '--dy': `${sh.dy}px`, '--rot': `${sh.rot}deg`, '--delay': `${sh.delay}ms` } as CSSProperties}>
                      <span className="mob-shape">{mobCard}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          )}
          {(mobState === 'down' || mobState === 'fading') && (
            <div className={`mob-msg ${mobState === 'fading' ? 'fading' : ''}`} role="status">
              <div className="mob-msg-title">Defeated together</div>
              <div className="mob-msg-text">Neither side had {mob?.force ?? 6} Force alone. Both stood up in the same turn, and the Mob broke.</div>
            </div>
          )}
        </div>
        <DeckPanel side="theirs" label="Opponent's cards" note="Different paths. Same goals." value={deckB} onChange={setDeckB} />
      </div>

      <footer className="hero-foot">
        <div className="foot-quote">
          Who has the better plan for the future?
          <br />
          Compete for Influence.
        </div>
        <div className="foot-meta">
          <span>Systems prototype · v0.3 · build {typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}</span>
          <button className="link" onClick={() => setDev((d) => !d)}>
            {dev ? 'Hide developer tools' : 'Developer tools'}
          </button>
        </div>
        {dev && (
          <div className="dev">
            <label>
              Seed <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
            </label>
            <label>
              <input type="checkbox" checked={placeholders} onChange={(e) => setPlaceholders(e.target.checked)} /> Generic placeholder names (Test A: is it still fun?)
            </label>
            <label>
              <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /> First-match coach tips
            </label>
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button className="small" onClick={() => onPlay(opts('hotseat'))}>
                Local two-player debug (pass the device)
              </button>
              <button
                className="small ghost"
                onClick={() => {
                  resetCoach();
                  resetGuide();
                }}
              >
                Reset coach tips
              </button>
            </div>
            <div className="muted">In-match: the ⚙ button opens AI reasoning, analytics and the event log. Also enabled with ?dev=1.</div>
          </div>
        )}
      </footer>
      {open && <CodexSheet id={open} label={labelFor(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}
