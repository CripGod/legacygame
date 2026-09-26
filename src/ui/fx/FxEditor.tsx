import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Fx } from './Fx';
import { PRESETS, PRESET_IDS, clearBrowserCopy, getPreset, hasBrowserCopy, saveBrowserCopy } from './presets';
import { validatePreset, type Curve, type Emitter, type FxPreset, type Gradient, type Path, type Range, type Sprite } from './schema';
import { Battlefield } from '../components/Battlefield';
import { createMatch, emptyPlan, viewFor, CHARACTER_BY_ID, type GameState } from '../../engine';
import { artUrl, kitVars } from '../art';
import { TRAIL_COLORS } from '../components/Trails';
import './fx.css';

/**
 * The effects editor: pick a preset, play it over stand-ins of what it plays over and travels to (a tile, the
 * Influence circle, a Location panel), scrub it, slow it down, and tune every value with a slider or a pulldown. Save
 * keeps a copy in this browser (matches here play it); on the dev server it also writes the file. Copy JSON hands the
 * values over to be committed.
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

/** Named shapes for the pulldowns; a saved shape that matches none shows as "custom (as saved)". */
const SIZE_CURVES: [string, Curve][] = [
  ['steady', [[0, 1], [1, 1]]],
  ['grow', [[0, 0.4], [1, 1.4]]],
  ['shrink', [[0, 1], [1, 0.3]]],
  ['shrink a little', [[0, 1], [1, 0.68]]],
  ['pop, then shrink', [[0, 0.3], [0.15, 1.2], [1, 0.5]]],
  ['swell mid-way', [[0, 0.5], [0.5, 1.2], [1, 0.5]]],
  ['small, big, small', [[0, 0.6], [0.3, 1], [1, 0.5]]],
];
const ALPHA_CURVES: [string, Curve][] = [
  ['in and out', [[0, 0], [0.2, 1], [1, 0]]],
  ['in, hold, out', [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]],
  ['in and out, soft', [[0, 0], [0.2, 0.95], [1, 0]]],
  ['flash, then fade', [[0, 1], [0.3, 0.6], [1, 0]]],
  ['hold, then fade', [[0, 1], [0.6, 1], [1, 0]]],
  ['fade out', [[0, 1], [1, 0]]],
  ['fade in', [[0, 0], [1, 1]]],
  ['steady', [[0, 1], [1, 1]]],
];
const COLORS: [string, Gradient][] = [
  ['tint', [[0, '$tint'], [1, '$tint']]],
  ['tint, white at the end', [[0, '$tint'], [0.7, '$tint'], [1, '#ffffff']]],
  ['tint to white', [[0, '$tint'], [1, '#ffffff']]],
  ['white to tint', [[0, '#ffffff'], [1, '$tint']]],
  ['white hot, tint, red', [[0, '#ffffff'], [0.3, '$tint'], [1, '#e2483f']]],
  ['gold', [[0, '#ffe19a'], [1, '#e0ae2a']]],
  ['white', [[0, '#ffffff'], [1, '#ffffff']]],
  ['violet smoke', [[0, '#3a2d55'], [1, '#b8a9d6']]],
];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const shown = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0));
  return (
    <label className="fx-slider">
      <span className="fx-lbl">
        {label} <b>{shown}{unit ?? ''}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
/** A min–max pair as two sliders; the max never drops under the min. */
function RangeSlider({ label, value, min, max, step, unit, onChange }: { label: string; value: Range; min: number; max: number; step: number; unit?: string; onChange: (v: Range) => void }) {
  return (
    <div className="fx-pair">
      <Slider label={`${label}, least`} value={value.min} min={min} max={max} step={step} unit={unit} onChange={(v) => onChange({ min: v, max: Math.max(v, value.max) })} />
      <Slider label={`${label}, most`} value={value.max} min={min} max={max} step={step} unit={unit} onChange={(v) => onChange({ min: Math.min(v, value.min), max: v })} />
    </div>
  );
}
function Pick<T>({ label, value, options, onChange }: { label: string; value: T; options: [string, T][]; onChange: (v: T) => void }) {
  const idx = options.findIndex(([, v]) => same(v, value));
  return (
    <label className="fx-pick">
      <span className="fx-lbl">{label}</span>
      <select value={idx < 0 ? -1 : idx} onChange={(e) => { const i = Number(e.target.value); if (i >= 0) onChange(clone(options[i][1])); }}>
        {idx < 0 && <option value={-1}>custom (as saved)</option>}
        {options.map(([n], i) => (
          <option key={n} value={i}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

const FREE: Path = { mode: 'free', arc: 0, ease: 'linear', spread: 0 };

function EmitterForm({ e, hasTarget, onChange, onRemove }: { e: Emitter; hasTarget: boolean; onChange: (e: Emitter) => void; onRemove: () => void }) {
  const set = <K extends keyof Emitter>(k: K, v: Emitter[K]) => onChange({ ...e, [k]: v });
  const path = e.path ?? FREE;
  const toTarget = path.mode === 'target';
  return (
    <section className="fx-emitter">
      <header>
        <input className="fx-name" value={e.name} onChange={(ev) => set('name', ev.target.value)} aria-label="emitter name" />
        <button type="button" className="fx-btn ghost small" onClick={onRemove}>
          remove
        </button>
      </header>
      <div className="fx-group">
        <h4>How many, when</h4>
        <Slider label="particles" value={e.count} min={0} max={300} step={1} onChange={(v) => set('count', v)} />
        <RangeSlider label="born at" value={e.spawn} min={0} max={3000} step={10} unit=" ms" onChange={(v) => set('spawn', v)} />
        <RangeSlider label="lives for" value={e.life} min={50} max={4000} step={10} unit=" ms" onChange={(v) => set('life', v)} />
      </div>
      <div className="fx-group">
        <h4>Where they are born</h4>
        {hasTarget && (
          <Pick label="around" value={e.originAt ?? 'anchor'} options={[['the source', 'anchor'], ['the target', 'target']] as [string, 'anchor' | 'target'][]} onChange={(v) => set('originAt', v)} />
        )}
        <RangeSlider label="across (0 left, 1 right)" value={e.origin.x} min={-0.5} max={1.5} step={0.05} onChange={(v) => set('origin', { ...e.origin, x: v })} />
        <RangeSlider label="down (0 top, 1 bottom)" value={e.origin.y} min={-0.5} max={1.5} step={0.05} onChange={(v) => set('origin', { ...e.origin, y: v })} />
      </div>
      <div className="fx-group">
        <h4>How they move</h4>
        {hasTarget && <Pick label="travel" value={path.mode} options={[['free flight', 'free'], ['to the target', 'target']] as [string, Path['mode']][]} onChange={(v) => set('path', { ...path, mode: v })} />}
        {toTarget ? (
          <>
            <Slider label="arc lift" value={path.arc} min={-300} max={300} step={5} unit=" px" onChange={(v) => set('path', { ...path, arc: v })} />
            <Pick label="timing" value={path.ease} options={[['ease in and out', 'inOut'], ['ease out (fast start)', 'out'], ['ease in (fast finish)', 'in'], ['even', 'linear']] as [string, Path['ease']][]} onChange={(v) => set('path', { ...path, ease: v })} />
            <Slider label="scatter at arrival" value={path.spread} min={0} max={100} step={1} unit=" px" onChange={(v) => set('path', { ...path, spread: v })} />
          </>
        ) : (
          <>
            <RangeSlider label="direction (270 is up)" value={e.angle} min={0} max={360} step={1} unit="°" onChange={(v) => set('angle', v)} />
            <RangeSlider label="speed" value={e.speed} min={0} max={2} step={0.01} unit=" px/ms" onChange={(v) => set('speed', v)} />
            <Slider label="air drag" value={e.drag} min={0} max={0.05} step={0.0005} onChange={(v) => set('drag', v)} />
            <Slider label="gravity (minus lifts)" value={e.gravity} min={-0.005} max={0.005} step={0.0001} onChange={(v) => set('gravity', v)} />
          </>
        )}
        <Slider label="sway" value={e.sway.amp} min={0} max={60} step={1} unit=" px" onChange={(v) => set('sway', { ...e.sway, amp: v })} />
        <Slider label="sway speed" value={e.sway.freq} min={0} max={10} step={0.1} unit=" /s" onChange={(v) => set('sway', { ...e.sway, freq: v })} />
      </div>
      <div className="fx-group">
        <h4>How they look</h4>
        <Pick label="shape" value={e.sprite} options={[['soft glow', 'glow'], ['spark (points its way)', 'spark'], ['star (spins)', 'star'], ['smoke puff', 'puff']] as [string, Sprite][]} onChange={(v) => set('sprite', v)} />
        <Pick label="paint" value={e.blend} options={[['light (adds up)', 'add'], ['solid', 'normal']] as [string, Emitter['blend']][]} onChange={(v) => set('blend', v)} />
        <RangeSlider label="size" value={e.size} min={1} max={200} step={1} unit=" px" onChange={(v) => set('size', v)} />
        <Pick label="size over life" value={e.sizeOver} options={SIZE_CURVES} onChange={(v) => set('sizeOver', v)} />
        <Pick label="fade over life" value={e.alphaOver} options={ALPHA_CURVES} onChange={(v) => set('alphaOver', v)} />
        <Pick label="colour over life" value={e.color} options={COLORS} onChange={(v) => set('color', v)} />
        <Slider label="streak behind" value={e.trail} min={0} max={1} step={0.05} onChange={(v) => set('trail', v)} />
        {(e.sprite === 'star' || e.sprite === 'spark') && <RangeSlider label="spin" value={e.spin} min={0} max={5} step={0.1} unit=" turns/s" onChange={(v) => set('spin', v)} />}
      </div>
    </section>
  );
}

const NEW_EMITTER: Emitter = {
  name: 'new',
  count: 30,
  spawn: { min: 0, max: 200 },
  origin: { x: { min: 0.4, max: 0.6 }, y: { min: 0.4, max: 0.6 } },
  originAt: 'anchor',
  path: { mode: 'free', arc: 0, ease: 'linear', spread: 0 },
  life: { min: 400, max: 800 },
  angle: { min: 0, max: 360 },
  speed: { min: 0.1, max: 0.4 },
  drag: 0.004,
  gravity: 0,
  sway: { amp: 0, freq: 0 },
  size: { min: 6, max: 12 },
  sizeOver: [[0, 1], [1, 0.3]],
  alphaOver: [[0, 0], [0.2, 1], [1, 0]],
  color: [[0, '$tint'], [1, '$tint']],
  sprite: 'glow',
  spin: { min: 0, max: 0 },
  blend: 'add',
  trail: 0,
};

/** A board to play effects over: a real match state, three Locations open, pieces at the Gates and Inside on both sides. */
function rigBoard(): GameState {
  const st = createMatch({ seed: 11 });
  st.turn = 4;
  st.locations.forEach((l, i) => {
    l.revealed = true;
    l.revealedTurn = 1;
    void i;
  });
  const place = (owner: 'A' | 'B', n: number, location: number, zone: 'gate' | 'inside', ready: boolean) => {
    const ps = st.players[owner];
    const id = ps.hand.find((c) => st.characters[`fx-${owner}-${c}`] === undefined && (CHAR_IDS.has(c) ? true : false));
    void n;
    if (!id) return;
    ps.hand = ps.hand.filter((c) => c !== id);
    const uid = `fx-${owner}-${id}`;
    st.characters[uid] = { uid, defId: id, owner, location, zone, ready, arrivedTurn: zone === 'inside' ? 2 : 3, permInfluence: 0, tempInfluence: 0 };
  };
  place('A', 0, 0, 'gate', true);
  place('A', 1, 0, 'inside', false);
  place('A', 2, 1, 'gate', true);
  place('B', 0, 0, 'inside', false);
  place('B', 1, 1, 'inside', false);
  place('B', 2, 2, 'gate', false);
  return st;
}
const CHAR_IDS = new Set(Object.keys(CHARACTER_BY_ID));

/** Where a preset's source and target are on the real board. */
const PICK: Record<string, string> = {
  tile: '.column[data-index="0"] .gates-strip.mine .gate-slot.filled',
  location: '.column[data-index="0"] .location',
  meter: '.column[data-index="0"] .score.pA',
  'target-location': '.column[data-index="1"] .location',
  screen: '.battlefield',
};
const noop = () => {};

function Stage({ preset, show, view }: { preset: FxPreset; show: boolean; view: GameState }) {
  return (
    <div className={`fx-boardwrap ${show ? '' : 'faded'}`}>
      <div className="app fx-app" style={kitVars() as React.CSSProperties}>
        <Battlefield view={view} me="A" plan={emptyPlan()} targetable={[]} onLocationTap={noop} onLocationInfo={noop} onChar={noop} onThreat={noop} locked={false} />
      </div>
      {preset.anchor === 'button' && (
        <div className="fx-standin button" data-fx="button">
          <span>STAND ON BUSINESS</span>
        </div>
      )}
    </div>
  );
}

export function FxEditor({ onBack }: { onBack: () => void }) {
  const [id, setId] = useState(PRESET_IDS[0]);
  const [draft, setDraft] = useState<FxPreset>(() => clone(getPreset(PRESET_IDS[0])));
  const [browserCopy, setBrowserCopy] = useState(() => hasBrowserCopy(PRESET_IDS[0]));
  const [tint, setTint] = useState(TRAIL_COLORS.A);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [playKey, setPlayKey] = useState(1);
  const [freezeAt, setFreezeAt] = useState<number | undefined>(undefined);
  const [showStage, setShowStage] = useState(true);
  const [rects, setRects] = useState<{ at: DOMRect; to?: DOMRect } | null>(null);
  const [note, setNote] = useState('');
  const view = useMemo(() => viewFor(rigBoard(), 'A'), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const errors = useMemo(() => validatePreset(draft), [draft]);
  const dirty = !same(draft, getPreset(id));
  const offShipped = !same(draft, PRESETS[id]);

  useLayoutEffect(() => {
    const measure = () => {
      const root = stageRef.current;
      if (!root) return;
      const q = (sel: string) => root.querySelector(sel)?.getBoundingClientRect();
      const at = draft.anchor === 'button' ? q('[data-fx="button"]') : q(PICK[draft.anchor]);
      const to = draft.target === 'meter' ? q(PICK.meter) : draft.target === 'location' ? q(PICK['target-location']) : undefined;
      if (at) setRects({ at, to });
    };
    measure();
    const t = window.setTimeout(measure, 600); // once the frames and art have laid out
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [draft.anchor, draft.target]);

  const play = () => {
    setFreezeAt(undefined);
    setPlayKey((k) => k + 1);
  };
  const pick = (next: string) => {
    setId(next);
    setDraft(clone(getPreset(next)));
    setBrowserCopy(hasBrowserCopy(next));
    setNote('');
    play();
  };
  const reset = () => {
    setDraft(clone(getPreset(id)));
    setNote('Back to the saved values.');
    play();
  };
  const shipped = () => {
    clearBrowserCopy(id);
    setBrowserCopy(false);
    setDraft(clone(PRESETS[id]));
    setNote('Back to the shipped file; the browser copy is gone.');
    play();
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(JSON.stringify(draft, null, 2));
    setNote('JSON copied: paste it into the chat to have it committed.');
  };
  const save = async () => {
    if (errors.length) return setNote(`Not saved: ${errors[0]}`);
    const kept = saveBrowserCopy(draft);
    setBrowserCopy(kept);
    if (!import.meta.env.DEV) return setNote(kept ? 'Saved in this browser: matches here play it. Copy JSON to make it permanent.' : 'Could not save: this browser blocks storage.');
    try {
      const r = await fetch('/__fx/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      setNote(j.ok ? `Saved src/ui/fx/presets/${draft.id}.json` : `Not saved to the file: ${j.error ?? r.status}`);
    } catch (e) {
      setNote(`Not saved to the file: ${String(e)}`);
    }
  };
  const total = Math.max(draft.duration, ...draft.emitters.map((e) => e.spawn.max + e.life.max));
  const hasTarget = !!draft.target;

  return (
    <div className="fx-editor" style={{ backgroundImage: `url(${artUrl('landing', 'board')})` }}>
      <div className="fx-stage">
        <div className="fx-stage-top">
          <button type="button" className="fx-btn ghost small" onClick={onBack}>
            ‹ back
          </button>
          <b>Effects editor</b>
          <span className="fx-muted">{draft.name}</span>
        </div>
        <div className="fx-stage-floor" ref={stageRef}>
          <Stage preset={draft} show={showStage} view={view} />
        </div>
        {rects && !errors.length && <Fx key={playKey} preset={draft} at={rects.at} to={rects.to} tint={tint} speed={speed} freezeAt={freezeAt} loop={loop} />}
      </div>
      <aside className="fx-panel">
        <label className="fx-pick">
          <span className="fx-lbl">effect</span>
          <select value={id} onChange={(e) => pick(e.target.value)}>
            {PRESET_IDS.map((p) => (
              <option key={p} value={p}>
                {PRESETS[p].name}
              </option>
            ))}
          </select>
        </label>
        <div className="fx-row">
          <button type="button" className="fx-btn" onClick={play}>
            ▶ play
          </button>
          <label className="fx-check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop
          </label>
          <label className="fx-check">
            <input type="checkbox" checked={showStage} onChange={(e) => setShowStage(e.target.checked)} /> show board
          </label>
        </div>
        <Pick label="speed" value={speed} options={SPEEDS.map((s) => [`${s}×`, s] as [string, number])} onChange={setSpeed} />
        <Slider label="scrub" value={freezeAt ?? 0} min={0} max={total} step={10} unit=" ms" onChange={setFreezeAt} />
        <div className="fx-row">
          <Pick label="colour it wears" value={tint} options={TINTS} onChange={setTint} />
          <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} aria-label="custom colour" />
        </div>
        <div className="fx-group">
          <h4>The effect</h4>
          <label className="fx-pick">
            <span className="fx-lbl">name</span>
            <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <Slider label="cut off after" value={draft.duration} min={100} max={6000} step={50} unit=" ms" onChange={(v) => setDraft({ ...draft, duration: v })} />
          <Pick label="plays over" value={draft.anchor} options={[['a card tile', 'tile'], ['a Location panel', 'location'], ['the Stand button', 'button'], ['the screen', 'screen']] as [string, FxPreset['anchor']][]} onChange={(v) => setDraft({ ...draft, anchor: v })} />
          <Pick label="travels to" value={draft.target ?? 'none'} options={[['nothing', 'none'], ['the Influence circle', 'meter'], ['a Location panel', 'location']]} onChange={(v) => setDraft({ ...draft, target: v === 'none' ? undefined : (v as FxPreset['target']) })} />
        </div>
        {draft.emitters.map((e, i) => (
          <EmitterForm key={i} e={e} hasTarget={hasTarget} onChange={(ne) => setDraft({ ...draft, emitters: draft.emitters.map((x, j) => (j === i ? ne : x)) })} onRemove={() => setDraft({ ...draft, emitters: draft.emitters.filter((_, j) => j !== i) })} />
        ))}
        <button type="button" className="fx-btn ghost" onClick={() => setDraft({ ...draft, emitters: [...draft.emitters, clone(NEW_EMITTER)] })}>
          + another kind of particle
        </button>
        {errors.length > 0 && <div className="fx-errors">{errors.join(' · ')}</div>}
        <div className="fx-row fx-actions">
          <button type="button" className="fx-btn" onClick={save} disabled={!dirty || errors.length > 0}>
            save
          </button>
          <button type="button" className="fx-btn ghost" onClick={reset} disabled={!dirty}>
            undo changes
          </button>
          <button type="button" className="fx-btn ghost" onClick={copy}>
            copy JSON
          </button>
          {browserCopy && (
            <button type="button" className="fx-btn ghost" onClick={shipped}>
              back to shipped
            </button>
          )}
        </div>
        {note && <div className="fx-note">{note}</div>}
        {browserCopy && <div className="fx-muted small">A copy saved in this browser is in force{offShipped ? ' (it differs from the shipped file)' : ''}; matches played here use it. Copy JSON to have it committed.</div>}
      </aside>
    </div>
  );
}
