import { getAudioSettings } from './settings';

/**
 * Sound effects. Every sound has a name, and the game asks for sounds by name: `sfx('card.drop')`.
 * The names are the contract. Each name maps to one or more recorded clips (Universal Sound FX,
 * licensed; the trimmed and levelled MP3s live in public/audio/sfx and the single-file build inlines
 * them on window.__AUDIO__ as `sfx/<id>`), layered and with round-robin variants where a sound
 * repeats a lot. Until the clips have loaded, and for any name without clips, a small Web Audio
 * synth plays the same cue, so nothing is ever silent. A Unity port maps the same names to AudioClips.
 * Buttons opt in declaratively with `data-sfx="name"` (or `data-sfx="off"`); any other button plays `tap`.
 */
export type SfxName =
  | 'tap'
  | 'toggle'
  | 'card.pick'
  | 'card.drop'
  | 'card.back'
  | 'lock'
  | 'turn'
  | 'draw'
  | 'enter'
  | 'move'
  | 'clash.hit'
  | 'clash.banish'
  | 'clash.arrest'
  | 'threat.spawn'
  | 'threat.clear'
  | 'trail'
  | 'dig'
  | 'stand'
  | 'lastword'
  | 'lost'
  | 'win'
  | 'lose'
  | 'draw.game';

/** What each sound is for: the mapping sheet for the library, and the AudioEvent table for Unity. */
export const SFX_EVENTS: Record<SfxName, string> = {
  tap: 'Any button or tappable tile.',
  toggle: 'A switch turned on (the sound switch itself).',
  'card.pick': 'A hand card selected or picked up.',
  'card.drop': 'A card lands on a Location (planned, or placed at the Gates in the replay).',
  'card.back': 'A planned card taken back to the hand.',
  lock: 'Lock It In.',
  turn: 'A new turn begins.',
  draw: 'You draw a card.',
  enter: 'A Character walks Inside.',
  move: 'A relocation (swoosh).',
  'clash.hit': 'A strike lands: knocked, held off, blocked, tricked, hexed.',
  'clash.banish': 'A Character is knocked off the board (BANISHED). Fires as the throw begins; the bang lands ~240ms in.',
  'clash.arrest': 'An Informant is found out or arrested.',
  'threat.spawn': 'A Threat arrives.',
  'threat.clear': 'A Threat is neutralized.',
  trail: 'A power trail crosses the board (artist, aura).',
  dig: 'Cards riffled (Zora digs).',
  stand: 'Stand on Business: the stakes rise.',
  lastword: 'The Last Word begins.',
  lost: 'A Location is Lost, or someone changes sides.',
  win: 'You win the match.',
  lose: 'You lose the match.',
  'draw.game': 'The match is drawn.',
};

/** One layer of a cue: one of `files` (chosen at random) at `gain`, starting `at` milliseconds in. */
interface Layer {
  files: string[];
  gain: number;
  at?: number;
}

/** The recorded clips per cue. Clip ids are file names under public/audio/sfx (without .mp3). */
export const SFX_FILES: Record<SfxName, Layer[]> = {
  tap: [{ files: ['tap', 'tap-2'], gain: 0.5 }],
  toggle: [{ files: ['toggle-on'], gain: 0.5 }],
  'card.pick': [{ files: ['card-pick-1', 'card-pick-2'], gain: 0.6 }],
  'card.drop': [{ files: ['card-drop-1', 'card-drop-2', 'card-drop-3'], gain: 0.7 }, { files: ['thud-soft'], gain: 0.45 }],
  'card.back': [{ files: ['card-back'], gain: 0.55 }],
  lock: [{ files: ['lock'], gain: 0.8 }],
  turn: [{ files: ['turn'], gain: 0.55 }],
  draw: [{ files: ['draw'], gain: 0.5 }],
  enter: [{ files: ['enter'], gain: 0.6 }],
  move: [{ files: ['move-1', 'move-2'], gain: 0.6 }],
  'clash.hit': [{ files: ['hit'], gain: 0.8 }, { files: ['hit-wood'], gain: 0.5 }],
  'clash.banish': [{ files: ['banish'], gain: 0.9 }, { files: ['banish-stone'], gain: 0.7, at: 240 }],
  'clash.arrest': [{ files: ['arrest'], gain: 0.8 }],
  'threat.spawn': [{ files: ['threat-spawn'], gain: 0.8 }],
  'threat.clear': [{ files: ['threat-clear'], gain: 0.6 }],
  trail: [{ files: ['trail'], gain: 0.6 }],
  dig: [{ files: ['dig'], gain: 0.6 }],
  stand: [{ files: ['stand-thud'], gain: 0.9 }, { files: ['stand-drums'], gain: 0.8 }],
  lastword: [{ files: ['lastword'], gain: 0.8 }],
  lost: [{ files: ['lost'], gain: 0.65 }],
  win: [{ files: ['win'], gain: 0.8 }, { files: ['win-crowd'], gain: 0.4, at: 150 }],
  lose: [{ files: ['lose'], gain: 0.7 }],
  'draw.game': [{ files: ['draw-game'], gain: 0.65 }],
};

declare global {
  interface Window {
    __AUDIO__?: Record<string, string>;
    /** Dev: how many clips have decoded, of how many. */
    __sobSfxStatus?: () => { loaded: number; total: number; missing: string[] };
  }
}

function clipUrl(id: string): string {
  const inline = typeof window !== 'undefined' ? window.__AUDIO__?.[`sfx/${id}`] : undefined;
  return inline ?? `${import.meta.env.BASE_URL}audio/sfx/${id}.mp3`;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const MASTER = 0.55;
const clips = new Map<string, AudioBuffer>();
const missing = new Set<string>();
let loading = false;

function makeNoise(c: AudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Fetch and decode every clip once, after the first gesture. Failures leave the synth in charge for that clip. */
function preload(): void {
  if (loading || !ctx) return;
  loading = true;
  const ids = new Set<string>();
  for (const layers of Object.values(SFX_FILES)) for (const l of layers) for (const f of l.files) ids.add(f);
  for (const id of ids) {
    fetch(clipUrl(id))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx!.decodeAudioData(ab))
      .then((buf) => clips.set(id, buf))
      .catch(() => missing.add(id));
  }
  if (typeof window !== 'undefined') window.__sobSfxStatus = () => ({ loaded: clips.size, total: ids.size, missing: [...missing] });
}

/** Create (or resume) the context. Must be called from a user gesture the first time. */
export function sfxUnlock(): void {
  if (typeof window === 'undefined') return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!ctx) {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    noise = makeNoise(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  preload();
}

export function sfxReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

// ---------- recorded clips ----------

/** Play the recorded layers for a cue. False when any layer's clip has not decoded yet: the synth covers it. */
function playClips(name: SfxName, t: number): boolean {
  if (!ctx || !master) return false;
  const layers = SFX_FILES[name];
  const picks: { buf: AudioBuffer; gain: number; at: number }[] = [];
  for (const l of layers) {
    const id = l.files[Math.floor(Math.random() * l.files.length)];
    const buf = clips.get(id);
    if (!buf) return false;
    picks.push({ buf, gain: l.gain, at: l.at ?? 0 });
  }
  for (const p of picks) {
    const src = ctx.createBufferSource();
    src.buffer = p.buf;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    src.connect(g).connect(master);
    src.start(t + p.at / 1000);
  }
  return true;
}

// ---------- synth primitives (the fallback) ----------

/** Filtered noise with a frequency sweep and an envelope: the swoosh. */
function swoosh(t: number, dur: number, f0: number, f1: number, gain: number, q = 0.9): void {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** A short tone with an exponential decay. */
function blip(t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A low hit: a sine dropping in pitch plus a burst of low noise. */
function thud(t: number, gain: number, f0 = 150, f1 = 45, dur = 0.22): void {
  if (!ctx || !master || !noise) return;
  blip(t, f0, dur, gain, 'sine', f1);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * 0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(lp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.2);
}

/** Notes in sequence. */
function chime(t: number, freqs: number[], spacing: number, dur: number, gain: number, type: OscillatorType = 'triangle'): void {
  freqs.forEach((f, i) => blip(t + i * spacing, f, dur, gain, type));
}

/** A handful of quick high blips scattered over a short window. */
function sparkle(t: number, count: number, gain: number): void {
  for (let i = 0; i < count; i++) {
    const at = t + (i / count) * 0.32 + Math.random() * 0.03;
    blip(at, 1800 + Math.random() * 2200, 0.09, gain, 'sine');
  }
}

/** A paper tick: a tiny burst of bright noise. */
function tick(t: number, gain: number): void {
  swoosh(t, 0.045, 3000, 5000, gain, 2.5);
}

function synth(name: SfxName, t: number): void {
  switch (name) {
    case 'tap':
      blip(t, 880, 0.06, 0.12);
      break;
    case 'toggle':
      blip(t, 660, 0.07, 0.14);
      blip(t + 0.07, 990, 0.09, 0.14);
      break;
    case 'card.pick':
      swoosh(t, 0.13, 700, 2600, 0.22);
      break;
    case 'card.drop':
      thud(t, 0.35, 170, 60, 0.16);
      blip(t + 0.01, 330, 0.12, 0.1, 'triangle');
      break;
    case 'card.back':
      swoosh(t, 0.16, 2400, 500, 0.2);
      break;
    case 'lock':
      blip(t, 523, 0.1, 0.16, 'triangle');
      blip(t + 0.09, 784, 0.16, 0.16, 'triangle');
      thud(t + 0.1, 0.3, 140, 60, 0.2);
      break;
    case 'turn':
      chime(t, [523, 659, 784], 0.09, 0.28, 0.13);
      break;
    case 'draw':
      swoosh(t, 0.09, 1600, 3800, 0.18, 1.4);
      blip(t + 0.05, 1320, 0.06, 0.06);
      break;
    case 'enter':
      swoosh(t, 0.22, 320, 1400, 0.24);
      blip(t + 0.14, 440, 0.16, 0.1, 'triangle');
      break;
    case 'move':
      swoosh(t, 0.28, 600, 2000, 0.26);
      break;
    case 'clash.hit':
      thud(t, 0.5, 180, 50, 0.2);
      swoosh(t, 0.12, 900, 500, 0.3, 0.6);
      break;
    case 'clash.banish':
      swoosh(t, 0.42, 220, 3200, 0.34, 0.7);
      thud(t + 0.24, 0.6, 200, 40, 0.3);
      blip(t + 0.3, 620, 0.35, 0.12, 'sawtooth', 160);
      break;
    case 'clash.arrest':
      thud(t, 0.35, 220, 90, 0.12);
      blip(t + 0.08, 1200, 0.05, 0.1, 'square');
      blip(t + 0.16, 900, 0.08, 0.1, 'square');
      break;
    case 'threat.spawn':
      blip(t, 110, 0.6, 0.18, 'sawtooth', 70);
      swoosh(t, 0.5, 200, 90, 0.16, 0.5);
      break;
    case 'threat.clear':
      chime(t, [392, 523, 659, 784], 0.07, 0.3, 0.12);
      sparkle(t + 0.15, 4, 0.05);
      break;
    case 'trail':
      swoosh(t, 0.5, 1200, 3600, 0.16, 1.2);
      sparkle(t + 0.05, 6, 0.06);
      break;
    case 'dig':
      for (let i = 0; i < 5; i++) tick(t + i * 0.055, 0.16);
      break;
    case 'stand':
      thud(t, 0.55, 150, 40, 0.24);
      thud(t + 0.16, 0.6, 150, 40, 0.26);
      swoosh(t + 0.16, 0.2, 1200, 300, 0.2, 0.5);
      break;
    case 'lastword':
      blip(t, 98, 0.9, 0.16, 'sawtooth');
      chime(t + 0.1, [523, 784, 1047], 0.12, 0.5, 0.12);
      break;
    case 'lost':
      chime(t, [523, 415, 311], 0.14, 0.32, 0.14, 'sine');
      break;
    case 'win':
      chime(t, [523, 659, 784, 1047], 0.11, 0.6, 0.14);
      blip(t + 0.44, 1047, 0.9, 0.12, 'triangle');
      sparkle(t + 0.3, 8, 0.06);
      break;
    case 'lose':
      chime(t, [392, 311, 261], 0.22, 0.6, 0.13, 'triangle');
      break;
    case 'draw.game':
      chime(t, [440, 440], 0.2, 0.4, 0.12, 'triangle');
      break;
  }
}

// ---------- the entry point ----------

export function sfx(name: SfxName): void {
  if (!ctx || !master || ctx.state !== 'running' || !getAudioSettings().sfx) return;
  const t = ctx.currentTime + 0.005;
  if (!playClips(name, t)) synth(name, t);
}
