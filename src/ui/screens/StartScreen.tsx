import { useEffect, useRef, useState } from 'react';
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
function MobSparks() {
  const ref = useRef<HTMLCanvasElement>(null);
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
      return { x, y, r: 0.6 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.5, vy: -(0.35 + Math.random() * 0.8), life: 0, max: 80 + Math.random() * 90, hue: 8 + Math.random() * 30 };
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
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx + Math.sin((p.life + i) * 0.08) * 0.25;
        p.y += p.vy;
        p.life += 1;
        const t = p.life / p.max;
        const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${60 + t * 25}%, ${Math.max(0, a)})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 55%, 0.9)`;
        ctx.fill();
        if (p.life >= p.max) ps[i] = spawn();
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

export function StartScreen({ onPlay, onRules, onCards, initialDev }: { onPlay: (o: StartOptions) => void; onRules: () => void; onCards: () => void; initialDev: boolean }) {
  const [dev, setDev] = useState(initialDev);
  const [seed, setSeed] = useState('');
  const [placeholders, setPlaceholders] = useState(false);
  const [coach, setCoach] = useState(true);
  const [deckA, setDeckA] = useState('railroad');
  const [deckB, setDeckB] = useState('blackstar');
  /** A deck card tapped on the landing page opens the full Compendium sheet for it. */
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
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
        <div className="deck-tabs">
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
    <div className="landing" ref={root}>
      <div className="bg-plates" aria-hidden>
        <div className="bg-plate left" style={{ backgroundImage: `url(${artUrl('landing', 'harriet')})` }} />
        <div className="bg-plate right" style={{ backgroundImage: `url(${artUrl('landing', 'frederick')})` }} />
        <div className="bg-fade" />
        <div className="bg-floor" />
        <Embers />
      </div>
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
        Real consequences.
      </div>

      <header className="hero">
        <Wordmark className="hero-mark" />
        <div className="hero-sub">The Black History Card Battler</div>
        <div className="hero-tag">People. Strategy. A stronger tomorrow.</div>
      </header>

      <nav className="hero-actions" aria-label="Start">
        <button className="cta play" onClick={() => onPlay(opts('ai'))}>
          <span className="cta-ico" aria-hidden>
            ▶
          </span>
          Play match
        </button>
        <button className="cta" onClick={() => onPlay({ ...opts('ai'), seed: TUTORIAL_SEED, deckA: TUTORIAL_DECKS.A, deckB: TUTORIAL_DECKS.B, coach: true, tutorial: true })}>
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
        {/* Same width as the Threat card on the right, so the two panels match and the VS sits on the centre line. */}
        <div className="deck-spacer" aria-hidden />
        <DeckPanel side="mine" label="Your deck" note="Justice arcs forward." value={deckA} onChange={setDeckA} />
        <div className="vs" aria-hidden>
          VS
        </div>
        <DeckPanel side="theirs" label="Harborlight's deck" note="Different paths. Same goals." value={deckB} onChange={setDeckB} />
        {mob && (
          <aside className="threat-spot" aria-label="Threat">
            <MobSparks />
            <div className="threat-spot-art">
              <Art kind="threats" id={mob.id} className="threat-spot-img" fallback={<span className="ini">⚠</span>} alt="" />
            </div>
            <div className="threat-spot-body">
              <div className="threat-spot-name">The {mob.name}</div>
              <p>Organized violence aimed at exactly the people who are winning. It needs {mob.force} Force in one turn to break.</p>
              <div className="threat-spot-rule">Work together to overcome.</div>
              <small>Both players may contribute Force.</small>
            </div>
          </aside>
        )}
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
