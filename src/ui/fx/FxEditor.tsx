import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Fx } from './Fx';
import { PRESETS, PRESET_IDS } from './presets';
import { validatePreset, type Curve, type Emitter, type FxPreset, type Gradient, type Range } from './schema';
import { TRAIL_COLORS } from '../components/Trails';
import './fx.css';

/**
 * The effects editor (?fx=1): pick a preset, play it over a stand-in of what it plays over, scrub it, slow it down,
 * change any value and see the change at once, go back to the saved values, copy the JSON, and (on the dev server)
 * save it back into src/ui/fx/presets so the game and the Unity port pick it up.
 */
const TINTS: [string, string][] = [
  ['mine', TRAIL_COLORS.A],
  ['theirs', TRAIL_COLORS.B],
  ['artist', TRAIL_COLORS.artist],
  ['impact', TRAIL_COLORS.impact],
  ['heal', TRAIL_COLORS.heal],
  ['stand', TRAIL_COLORS.stand],
];
const SPEEDS = [1, 0.5, 0.25, 0.1];
const ANCHOR_SIZE: Record<FxPreset['anchor'], [number, number]> = { location: [527, 412], tile: [96, 96], button: [300, 64], screen: [900, 520] };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function curveText(c: Curve): string {
  return c.map(([t, v]) => `${t}:${v}`).join(', ');
}
function parseCurve(s: string): Curve | null {
  const out: Curve = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(-?[\d.]+)\s*:\s*(-?[\d.]+)$/);
    if (!m) return null;
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out.length ? out : null;
}
function gradientText(g: Gradient): string {
  return g.map(([t, c]) => `${t}:${c}`).join(', ');
}
function parseGradient(s: string): Gradient | null {
  const out: Gradient = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(-?[\d.]+)\s*:\s*(\$tint|#[0-9a-fA-F]{6})$/);
    if (!m) return null;
    out.push([Number(m[1]), m[2]]);
  }
  return out.length ? out : null;
}

function Num({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="fx-field">
      <span>{label}</span>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
function RangeField({ label, value, step = 1, onChange }: { label: string; value: Range; step?: number; onChange: (v: Range) => void }) {
  return (
    <div className="fx-field fx-range">
      <span>{label}</span>
      <input type="number" value={value.min} step={step} onChange={(e) => onChange({ ...value, min: Number(e.target.value) })} />
      <i>to</i>
      <input type="number" value={value.max} step={step} onChange={(e) => onChange({ ...value, max: Number(e.target.value) })} />
    </div>
  );
}
function TextField({ label, value, parse, onChange }: { label: string; value: string; parse: (s: string) => boolean; onChange: (s: string) => void }) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value);
    setBad(false);
  }, [value]);
  return (
    <label className={`fx-field fx-text ${bad ? 'bad' : ''}`}>
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const ok = parse(e.target.value);
          setBad(!ok);
          if (ok) onChange(e.target.value);
        }}
      />
    </label>
  );
}

function EmitterForm({ e, onChange, onRemove }: { e: Emitter; onChange: (e: Emitter) => void; onRemove: () => void }) {
  const set = <K extends keyof Emitter>(k: K, v: Emitter[K]) => onChange({ ...e, [k]: v });
  return (
    <section className="fx-emitter">
      <header>
        <input className="fx-name" value={e.name} onChange={(ev) => set('name', ev.target.value)} />
        <button type="button" className="fx-btn ghost" onClick={onRemove}>
          remove
        </button>
      </header>
      <div className="fx-grid">
        <Num label="count" value={e.count} onChange={(v) => set('count', v)} />
        <RangeField label="spawn ms" value={e.spawn} step={10} onChange={(v) => set('spawn', v)} />
        <RangeField label="life ms" value={e.life} step={10} onChange={(v) => set('life', v)} />
        <RangeField label="origin x" value={e.origin.x} step={0.05} onChange={(v) => set('origin', { ...e.origin, x: v })} />
        <RangeField label="origin y" value={e.origin.y} step={0.05} onChange={(v) => set('origin', { ...e.origin, y: v })} />
        <RangeField label="angle °" value={e.angle} step={5} onChange={(v) => set('angle', v)} />
        <RangeField label="speed px/ms" value={e.speed} step={0.02} onChange={(v) => set('speed', v)} />
        <Num label="drag /ms" value={e.drag} step={0.001} onChange={(v) => set('drag', v)} />
        <Num label="gravity px/ms²" value={e.gravity} step={0.0001} onChange={(v) => set('gravity', v)} />
        <Num label="sway amp px" value={e.sway.amp} onChange={(v) => set('sway', { ...e.sway, amp: v })} />
        <Num label="sway freq /s" value={e.sway.freq} step={0.1} onChange={(v) => set('sway', { ...e.sway, freq: v })} />
        <RangeField label="size px" value={e.size} onChange={(v) => set('size', v)} />
        <RangeField label="spin turns/s" value={e.spin} step={0.1} onChange={(v) => set('spin', v)} />
        <Num label="trail 0–1" value={e.trail} step={0.1} onChange={(v) => set('trail', v)} />
        <label className="fx-field">
          <span>sprite</span>
          <select value={e.sprite} onChange={(ev) => set('sprite', ev.target.value as Emitter['sprite'])}>
            {['glow', 'puff', 'spark', 'star'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="fx-field">
          <span>blend</span>
          <select value={e.blend} onChange={(ev) => set('blend', ev.target.value as Emitter['blend'])}>
            <option value="add">add (light)</option>
            <option value="normal">normal (paint)</option>
          </select>
        </label>
      </div>
      <TextField label="size over life (t:×)" value={curveText(e.sizeOver)} parse={(s) => !!parseCurve(s)} onChange={(s) => set('sizeOver', parseCurve(s)!)} />
      <TextField label="alpha over life (t:a)" value={curveText(e.alphaOver)} parse={(s) => !!parseCurve(s)} onChange={(s) => set('alphaOver', parseCurve(s)!)} />
      <TextField label="colour over life (t:#hex or $tint)" value={gradientText(e.color)} parse={(s) => !!parseGradient(s)} onChange={(s) => set('color', parseGradient(s)!)} />
    </section>
  );
}

const NEW_EMITTER: Emitter = {
  name: 'new',
  count: 30,
  spawn: { min: 0, max: 200 },
  origin: { x: { min: 0.4, max: 0.6 }, y: { min: 0.4, max: 0.6 } },
  life: { min: 400, max: 800 },
  angle: { min: 0, max: 360 },
  speed: { min: 0.1, max: 0.4 },
  drag: 0.004,
  gravity: 0,
  sway: { amp: 0, freq: 0 },
  size: { min: 6, max: 12 },
  sizeOver: [[0, 1], [1, 0.5]],
  alphaOver: [[0, 0], [0.15, 1], [1, 0]],
  color: [[0, '$tint'], [1, '$tint']],
  sprite: 'glow',
  spin: { min: 0, max: 0 },
  blend: 'add',
  trail: 0,
};

export function FxEditor({ onBack }: { onBack: () => void }) {
  const [id, setId] = useState(PRESET_IDS[0]);
  const [draft, setDraft] = useState<FxPreset>(() => clone(PRESETS[PRESET_IDS[0]]));
  const [tint, setTint] = useState(TRAIL_COLORS.A);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [playKey, setPlayKey] = useState(1);
  const [freezeAt, setFreezeAt] = useState<number | undefined>(undefined);
  const [showAnchor, setShowAnchor] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [note, setNote] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const errors = useMemo(() => validatePreset(draft), [draft]);
  const [aw, ah] = ANCHOR_SIZE[draft.anchor] ?? ANCHOR_SIZE.location;
  const dirty = JSON.stringify(draft) !== JSON.stringify(PRESETS[id]);

  useLayoutEffect(() => {
    const measure = () => anchorRef.current && setRect(anchorRef.current.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [aw, ah]);

  const pick = (next: string) => {
    setId(next);
    setDraft(clone(PRESETS[next]));
    setFreezeAt(undefined);
    setPlayKey((k) => k + 1);
    setNote('');
  };
  const play = () => {
    setFreezeAt(undefined);
    setPlayKey((k) => k + 1);
  };
  const reset = () => {
    setDraft(clone(PRESETS[id]));
    setNote('Back to the saved values.');
    play();
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(JSON.stringify(draft, null, 2));
    setNote('JSON copied.');
  };
  const save = async () => {
    if (errors.length) return setNote(`Not saved: ${errors[0]}`);
    try {
      const r = await fetch('/__fx/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      setNote(j.ok ? `Saved src/ui/fx/presets/${draft.id}.json` : `Not saved: ${j.error ?? r.status}`);
    } catch (e) {
      setNote(`Not saved: ${String(e)}`);
    }
  };
  const total = Math.max(draft.duration, ...draft.emitters.map((e) => e.spawn.max + e.life.max));

  return (
    <div className="fx-editor">
      <div className="fx-stage">
        <div className="fx-stage-top">
          <button type="button" className="fx-btn ghost" onClick={onBack}>
            ‹ back
          </button>
          <b>Effects editor</b>
          <span className="fx-muted">{draft.name}</span>
        </div>
        <div className="fx-stage-floor">
          <div ref={anchorRef} className={`fx-anchor ${draft.anchor} ${showAnchor ? '' : 'hidden'}`} style={{ width: aw, height: ah }}>
            <span>{draft.anchor}</span>
          </div>
        </div>
        {rect && !errors.length && <Fx key={playKey} preset={draft} at={rect} tint={tint} speed={speed} freezeAt={freezeAt} loop={loop} />}
      </div>
      <aside className="fx-panel">
        <div className="fx-row">
          <label className="fx-field grow">
            <span>preset</span>
            <select value={id} onChange={(e) => pick(e.target.value)}>
              {PRESET_IDS.map((p) => (
                <option key={p} value={p}>
                  {PRESETS[p].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="fx-row">
          <button type="button" className="fx-btn" onClick={play}>
            ▶ play
          </button>
          <label className="fx-check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop
          </label>
          <label className="fx-field">
            <span>speed</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <label className="fx-check">
            <input type="checkbox" checked={showAnchor} onChange={(e) => setShowAnchor(e.target.checked)} /> anchor
          </label>
        </div>
        <label className="fx-field fx-scrub">
          <span>scrub {freezeAt !== undefined ? `${Math.round(freezeAt)} ms` : ''}</span>
          <input type="range" min={0} max={total} step={10} value={freezeAt ?? 0} onChange={(e) => setFreezeAt(Number(e.target.value))} />
        </label>
        <div className="fx-row">
          <label className="fx-field">
            <span>tint</span>
            <select value={TINTS.find(([, c]) => c === tint)?.[0] ?? 'custom'} onChange={(e) => { const hit = TINTS.find(([n]) => n === e.target.value); if (hit) setTint(hit[1]); }}>
              {TINTS.map(([n]) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </label>
          <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} aria-label="tint colour" />
        </div>
        <div className="fx-grid top">
          <label className="fx-field">
            <span>name</span>
            <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <Num label="duration ms" value={draft.duration} step={50} onChange={(v) => setDraft({ ...draft, duration: v })} />
          <label className="fx-field">
            <span>anchor</span>
            <select value={draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value as FxPreset['anchor'] })}>
              {Object.keys(ANCHOR_SIZE).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        {draft.emitters.map((e, i) => (
          <EmitterForm key={i} e={e} onChange={(ne) => setDraft({ ...draft, emitters: draft.emitters.map((x, j) => (j === i ? ne : x)) })} onRemove={() => setDraft({ ...draft, emitters: draft.emitters.filter((_, j) => j !== i) })} />
        ))}
        <button type="button" className="fx-btn ghost" onClick={() => setDraft({ ...draft, emitters: [...draft.emitters, clone(NEW_EMITTER)] })}>
          + emitter
        </button>
        {errors.length > 0 && <div className="fx-errors">{errors.join(' · ')}</div>}
        <div className="fx-row fx-actions">
          <button type="button" className="fx-btn ghost" onClick={reset} disabled={!dirty}>
            reset to saved
          </button>
          <button type="button" className="fx-btn ghost" onClick={copy}>
            copy JSON
          </button>
          {import.meta.env.DEV && (
            <button type="button" className="fx-btn" onClick={save} disabled={!dirty || errors.length > 0}>
              save
            </button>
          )}
        </div>
        {note && <div className="fx-note">{note}</div>}
        {!import.meta.env.DEV && <div className="fx-muted small">Saving needs the dev server (npm run dev); here, copy the JSON into src/ui/fx/presets/{draft.id}.json.</div>}
      </aside>
    </div>
  );
}
