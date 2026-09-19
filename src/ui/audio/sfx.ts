import { getAudioSettings } from './settings';
import { voiceAttach } from './voice';

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
  | 'card.select'
  | 'card.drop'
  | 'card.back'
  | 'card.reject'
  | 'card.inside'
  | 'card.deal'
  | 'card.hover'
  | 'sheet.open'
  | 'sheet.close'
  | 'influence.up'
  | 'lock'
  | 'turn'
  | 'location.reveal'
  | 'draw'
  | 'enter'
  | 'move'
  | 'clash.hit'
  | 'clash.banish'
  | 'clash.arrest'
  | 'clash.block'
  | 'threat.spawn'
  | 'threat.clear'
  | 'threat.ruling'
  | 'cheer'
  | 'fireworks'
  | 'trail'
  | 'heal'
  | 'dig'
  | 'dig.keep'
  | 'dig.bury'
  | 'stand'
  | 'stand.button'
  | 'lastword'
  | 'lost'
  | 'win'
  | 'lose'
  | 'draw.game';

/** What each sound is for: the mapping sheet for the library, and the AudioEvent table for Unity. */
export const SFX_EVENTS: Record<SfxName, string> = {
  tap: 'Any button or tappable tile.',
  toggle: 'A switch turned on (the sound switch itself).',
  'card.pick': 'A hand card picked up.',
  'card.select': 'A hand card chosen: it stands and opens ("you have been selected").',
  'card.drop': 'A card lands on a Location (planned, or placed at the Gates in the replay).',
  'card.back': 'A planned card taken back to the hand.',
  'card.reject': 'A card that cannot be played right now was tapped, or a drop was refused: it comes back with a low thud.',
  'card.inside': 'A card planned straight Inside (Direct Entry, or dropped on the Inside row).',
  'card.deal': 'A card deals into the hand (one per card, staggered).',
  'card.hover': 'The pointer arrives on a button, a hand card, a board tile or a Location.',
  'sheet.open': 'A card or Location opens to read.',
  'sheet.close': 'It closes.',
  'influence.up': 'Influence goes up: a Character walks Inside, or a +N floats over a Location.',
  lock: 'Lock It In.',
  turn: 'A new turn begins: three soft bells as the meter refills.',
  'location.reveal': 'A Location is revealed (or the Black Star arrives). Plays with the place\'s own sound when it has one: see SFX_PLACES.',
  draw: 'You draw a card.',
  enter: 'A Character walks Inside: planned by you, or in the replay for the other side.',
  move: 'A relocation (swoosh).',
  'clash.hit': 'A strike lands: knocked, held off, hexed (a stand-off plays clash.block instead).',
  'clash.banish': 'A Character is knocked off the board (BANISHED). Fires as the throw begins; the bang lands ~240ms in.',
  'clash.arrest': 'An Informant is found out or arrested.',
  'clash.block': 'A stand-off: an entry blocked, a Character suppressed or tricked. Nobody moves.',
  'threat.spawn': 'A Threat arrives.',
  'threat.clear': 'A Threat is neutralized.',
  'threat.ruling': 'The Dred Scott Decision comes down: the gavel, then the laugh as everyone is thrown out.',
  cheer: 'A crowd cheers: a Threat is cleared in a showdown (with the fireworks).',
  fireworks: 'The fireworks over a cleared Threat: a launch, bursts, crackle.',
  trail: 'A power trail crosses the board (artist, aura).',
  heal: 'A Location heals: its last Threat broke and the word spreads as a wave of light to the other Locations (each landing chimes influence.up).',
  dig: 'Zora digs: three quick card flicks.',
  'dig.keep': 'The dearer story is kept: the card lights up and is chosen (the select climb with a shimmer).',
  'dig.bury': 'The other cards go back to the bottom of the deck: a flick and a soft thud.',
  stand: 'Stand on Business: the stakes rise.',
  'stand.button': 'The Stand on Business button, Marvel Snap style: stomp, stomp, clap, and on the clap the bell, a boom and the crowd\'s roar carrying on for a few seconds. No horns.',
  lastword: 'The Last Word begins.',
  lost: 'A Location is Lost, or someone changes sides.',
  win: 'You win the match: drums and the bell.',
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
  tap: [], // no clip yet: the synthesized arcade press below, until the heavy buttons arrive
  toggle: [{ files: ['toggle-on'], gain: 0.5 }],
  'card.pick': [{ files: ['card-pick-1', 'card-pick-2'], gain: 0.6 }],
  'card.select': [{ files: ['card-pick-1', 'card-pick-2'], gain: 0.5 }, { files: ['select'], gain: 0.5, at: 60 }], // the pick, then a bright two-note climb
  'card.drop': [{ files: ['card-drop-1', 'card-drop-2', 'card-drop-3'], gain: 0.7 }, { files: ['thud-soft'], gain: 0.45 }],
  'card.back': [{ files: ['card-back'], gain: 0.55 }],
  'card.reject': [{ files: ['card-back'], gain: 0.45 }, { files: ['thud-soft'], gain: 0.35, at: 40 }],
  'card.inside': [{ files: ['card-drop-1', 'card-drop-2', 'card-drop-3'], gain: 0.7 }, { files: ['thud-soft'], gain: 0.5 }, { files: ['turn'], gain: 0.45, at: 120 }],
  'card.deal': [{ files: ['card-pick-1', 'card-pick-2', 'draw'], gain: 0.5 }],
  'card.hover': [], // synth: a tiny tick
  'sheet.open': [{ files: ['card-pick-2'], gain: 0.6 }, { files: ['move-2'], gain: 0.35 }],
  'sheet.close': [{ files: ['card-back'], gain: 0.5 }, { files: ['move-1'], gain: 0.3 }],
  'influence.up': [{ files: ['turn'], gain: 0.5 }],
  lock: [{ files: ['lock'], gain: 0.8 }],
  turn: [{ files: ['new-turn'], gain: 0.55 }], // three soft bells: the riffle is gone
  'location.reveal': [{ files: ['stand-thud'], gain: 0.55 }, { files: ['turn'], gain: 0.4, at: 160 }],
  draw: [{ files: ['draw'], gain: 0.5 }],
  enter: [{ files: ['enter'], gain: 0.45 }, { files: ['turn'], gain: 0.45, at: 380 }],
  move: [{ files: ['move-1', 'move-2'], gain: 0.6 }],
  'clash.hit': [{ files: ['hit'], gain: 0.8 }, { files: ['hit-wood'], gain: 0.5 }],
  'clash.banish': [{ files: ['banish'], gain: 0.9 }, { files: ['banish-stone'], gain: 0.7, at: 240 }],
  'clash.arrest': [{ files: ['arrest'], gain: 0.8 }],
  'clash.block': [{ files: ['thud-soft'], gain: 0.6 }, { files: ['lock'], gain: 0.35, at: 80 }], // a stand-off: the gate stays shut
  'threat.spawn': [{ files: ['threat-danger'], gain: 0.8 }], // danger: a rising rumble, a muffled boom, the dark pulse, low brass
  'threat.clear': [{ files: ['threat-clear'], gain: 0.6 }],
  'threat.ruling': [{ files: ['hit-wood'], gain: 1.0, at: 480 }, { files: ['stand-thud'], gain: 0.9, at: 480 }, { files: ['laugh-evil'], gain: 0.85, at: 1000 }], // the Threat tile comes down at ~500ms; the gavel on the landing, the laugh over the cast-out
  cheer: [{ files: ['cheer'], gain: 0.6 }],
  fireworks: [{ files: ['fw-launch'], gain: 0.5 }, { files: ['fw-burst-1'], gain: 0.55, at: 450 }, { files: ['fw-burst-2'], gain: 0.5, at: 850 }, { files: ['fw-crackle'], gain: 0.4, at: 1000 }], // timed to the rockets' climb and bursts
  trail: [{ files: ['trail'], gain: 0.6 }],
  heal: [{ files: ['select'], gain: 0.45 }, { files: ['turn'], gain: 0.4, at: 240 }, { files: ['trail'], gain: 0.3, at: 200 }], // a bright climb, a soft bell, the trail's shimmer under it
  dig: [{ files: ['card-pick-1'], gain: 0.5 }, { files: ['card-pick-2'], gain: 0.5, at: 110 }, { files: ['draw'], gain: 0.5, at: 230 }], // three quick card flicks; the shuffle clip is gone
  'dig.keep': [{ files: ['select'], gain: 0.55 }, { files: ['trail'], gain: 0.25, at: 80 }], // "you have been chosen": the select climb, a shimmer under it
  'dig.bury': [{ files: ['card-back'], gain: 0.5 }, { files: ['thud-soft'], gain: 0.4, at: 120 }],
  stand: [{ files: ['stand-thud'], gain: 0.9 }, { files: ['stand-drums'], gain: 0.8 }],
  'stand.button': [{ files: ['stand-stomp'], gain: 0.9 }, { files: ['stand-bell'], gain: 0.7, at: 800 }, { files: ['stand-burst'], gain: 0.85, at: 800 }], // stomp, stomp, clap ... and on the clap the ring bell, the boom and the crowd carrying on (no brass)
  lastword: [{ files: ['lastword'], gain: 0.8 }],
  lost: [{ files: ['lost'], gain: 0.65 }],
  win: [{ files: ['stand-drums'], gain: 0.85 }, { files: ['lastword'], gain: 0.7, at: 220 }], // drums and the bell: gravity, not a fanfare
  lose: [{ files: ['lose'], gain: 0.7 }],
  'draw.game': [{ files: ['draw-game'], gain: 0.65 }],
};

/**
 * A place's own sound, played over `location.reveal` when that Location is revealed (or arrived at: the Black Star
 * becoming Accra). Keyed by Location id. A recording goes in public/audio/sfx as `place-<location id>.mp3` (each is a
 * mix of two to six Universal Sound FX clips, three to five seconds, levelled to sit over the reveal thud) and gets
 * one line here, which is what preloads and plays it. Until the clip decodes, the synth plays a sketch of the place
 * where one is written below (water for Harpers Ferry, a ship coming to port for Accra) and nothing otherwise.
 */
export const SFX_PLACES: Record<string, Layer[]> = {
  greenwood: [{ files: ['place-greenwood'], gain: 1.0 }], // a busy street and a till: Black Wall Street
  harpers_ferry: [{ files: ['place-harpers_ferry'], gain: 0.9 }], // the crossing the town is named for: lapping river, oar strokes, creaking timber, the town's bell far off
  black_star: [{ files: ['place-black_star'], gain: 0.4 }], // a liner leaving port: the deep horn twice, the engines coming up, the pier, the water
  accra_ghana: [{ files: ['place-accra_ghana'], gain: 0.5 }], // the horn coming in, drums on the quay, small waves
  great_migration: [{ files: ['place-great_migration'], gain: 0.6 }], // a distant whistle and the train going by
  juneteenth: [{ files: ['place-juneteenth'], gain: 0.78 }], // fireworks, cheers and a bell
  sundown_town: [{ files: ['place-sundown_town'], gain: 0.74 }], // wind, a door creak, crickets, a bolt slid home
  middle_passage: [{ files: ['place-middle_passage'], gain: 0.7 }], // solemn: the sea heard from below, chains slow, one bell, thunder a long way off
  charleston_1822: [{ files: ['place-charleston_1822'], gain: 1.0 }], // crickets, a door eased open, a whisper, a distant bell
  lagos: [{ files: ['place-lagos'], gain: 0.63 }], // the market, a horn, a bike going by
  gary_indiana: [{ files: ['place-gary_indiana'], gain: 0.65 }], // the mill: a motor, the furnace, a sledgehammer on steel
  justice_system: [{ files: ['place-justice_system'], gain: 1.0 }], // three raps of the gavel, cell bars, a clasp
  the_tabernacle: [{ files: ['place-the_tabernacle'], gain: 0.73 }], // the bell, a hymn-like climb, the congregation
  montgomery: [{ files: ['place-montgomery'], gain: 0.8 }], // calm: the street, a murmur of people, a church bell a few blocks off
  oak_bluffs: [{ files: ['place-oak_bluffs'], gain: 0.92 }], // small waves and birds
  the_stroll: [{ files: ['place-the_stroll'], gain: 0.71 }], // a cabaret's chatter and a piano
};

declare global {
  interface Window {
    __AUDIO__?: Record<string, string>;
    /** Dev: how many clips have decoded, of how many. */
    __sobSfxStatus?: () => { loaded: number; total: number; missing: string[] };
    __sobSynth?: (name: SfxName, at?: number) => void;
    __sobSfxLog?: { name: SfxName; place?: string; at: number }[];
    __sobSynthPlace?: (place: string, at?: number) => void;
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
  for (const layers of [...Object.values(SFX_FILES), ...Object.values(SFX_PLACES)]) for (const l of layers) for (const f of l.files) ids.add(f);
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
    voiceAttach(ctx, master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  preload();
}

/** Dev (?dev=1): every cue asked for, whether or not it could play (window.__sobSfxLog), so probes can check the wiring. */
const sfxLog: { name: SfxName; place?: string; at: number }[] | null = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev') ? [] : null;
if (sfxLog && typeof window !== 'undefined') window.__sobSfxLog = sfxLog;

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev')) {
  // Dev: schedule a synth cue or a place sketch at an absolute context time (an offline render can line several up).
  window.__sobSynth = (name, at) => {
    sfxUnlock();
    synth(name, at ?? (ctx ? ctx.currentTime + 0.005 : 0));
  };
  window.__sobSynthPlace = (place, at) => {
    sfxUnlock();
    synthPlace(place, at ?? (ctx ? ctx.currentTime + 0.005 : 0));
  };
}

export function sfxReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

// ---------- recorded clips ----------

/** Play the recorded layers for a cue. False when any layer's clip has not decoded yet: the synth covers it. */
function playClips(name: SfxName, t: number): boolean {
  return playLayers(SFX_FILES[name], t);
}

/** Play a set of layers together. False (and silent) when any clip has not decoded, so a cue is never half-played. */
function playLayers(layers: Layer[], t: number): boolean {
  if (!ctx || !master) return false;
  if (!layers.length) return false;
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
      // An arcade press: a chunky square that drops in pitch, with a little body under it.
      blip(t, 260, 0.07, 0.16, 'square', 150);
      thud(t, 0.18, 220, 90, 0.07);
      break;
    case 'toggle':
      blip(t, 660, 0.07, 0.14);
      blip(t + 0.07, 990, 0.09, 0.14);
      break;
    case 'card.select':
      // The pick, then a bright two-note climb: chosen.
      swoosh(t, 0.08, 1800, 4000, 0.2, 0.7);
      chime(t + 0.06, [784, 1175], 0.11, 0.28, 0.2);
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
    case 'card.reject':
      swoosh(t, 0.14, 2000, 500, 0.16);
      thud(t + 0.04, 0.18, 120, 60, 0.14);
      break;
    case 'card.inside':
      thud(t, 0.35, 170, 60, 0.16);
      chime(t + 0.12, [659, 988], 0.09, 0.3, 0.12);
      break;
    case 'influence.up':
      chime(t, [659, 988], 0.09, 0.3, 0.12);
      break;
    case 'card.deal':
      swoosh(t, 0.1, 900, 2800, 0.16);
      break;
    case 'card.hover':
      blip(t, 1400, 0.025, 0.035);
      break;
    case 'sheet.open':
      swoosh(t, 0.18, 500, 2200, 0.18);
      break;
    case 'sheet.close':
      swoosh(t, 0.16, 2200, 500, 0.16);
      break;
    case 'lock':
      blip(t, 523, 0.1, 0.16, 'triangle');
      blip(t + 0.09, 784, 0.16, 0.16, 'triangle');
      thud(t + 0.1, 0.3, 140, 60, 0.2);
      break;
    case 'turn':
      for (let i = 0; i < 5; i++) tick(t + i * 0.055, 0.16);
      break;
    case 'location.reveal':
      thud(t, 0.45, 160, 50, 0.24);
      chime(t + 0.16, [659, 988], 0.09, 0.3, 0.12);
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
    case 'clash.block':
      thud(t, 0.35, 140, 60, 0.18);
      blip(t + 0.08, 520, 0.08, 0.1, 'square', 380);
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
    case 'threat.ruling':
      thud(t + 0.48, 0.7, 160, 40, 0.3);
      blip(t + 1.0, 110, 0.5, 0.2, 'sawtooth', 70);
      blip(t + 1.15, 100, 0.4, 0.2, 'sawtooth', 65);
      blip(t + 1.4, 90, 0.5, 0.2, 'sawtooth', 60);
      break;
    case 'threat.clear':
      chime(t, [392, 523, 659, 784], 0.07, 0.3, 0.12);
      sparkle(t + 0.15, 4, 0.05);
      break;
    case 'cheer':
      // A crowd, sketched: a swell of mid noise with sparkles over it.
      swoosh(t, 1.2, 600, 1400, 0.6, 0.5);
      sparkle(t + 0.1, 10, 0.08);
      break;
    case 'fireworks':
      // Sketched: a rising whistle, then three bursts with crackle.
      swoosh(t, 0.4, 900, 2600, 0.25, 1.5);
      for (const [at, g] of [[0.45, 0.5], [0.85, 0.42], [1.2, 0.36]] as [number, number][]) {
        thud(t + at, g, 120, 40, 0.3);
        sparkle(t + at + 0.05, 6, 0.05);
      }
      break;
    case 'trail':
      swoosh(t, 0.5, 1200, 3600, 0.16, 1.2);
      sparkle(t + 0.05, 6, 0.06);
      break;
    case 'heal':
      chime(t, [523, 659, 784, 1047], 0.09, 0.55, 0.14);
      swoosh(t + 0.15, 0.7, 900, 3200, 0.1, 1.4);
      sparkle(t + 0.3, 8, 0.05);
      break;
    case 'dig':
      for (let i = 0; i < 5; i++) tick(t + i * 0.055, 0.16);
      break;
    case 'dig.keep':
      chime(t, [659, 988, 1319], 0.08, 0.4, 0.16);
      sparkle(t + 0.1, 5, 0.05);
      break;
    case 'dig.bury':
      tick(t, 0.14);
      thud(t + 0.12, 0.3, 160, 60, 0.18);
      break;
    case 'stand':
    case 'stand.button':
      thud(t, 0.55, 150, 40, 0.24);
      thud(t + 0.16, 0.6, 150, 40, 0.26);
      if (name === 'stand.button') {
        thud(t + 0.8, 0.9, 120, 30, 0.35);
        swoosh(t + 0.82, 1.6, 400, 2400, 0.16, 2.2);
      }
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

export function sfx(name: SfxName, place?: string): void {
  if (sfxLog) {
    sfxLog.push({ name, place, at: Math.round(performance.now()) });
    if (sfxLog.length > 200) sfxLog.shift();
  }
  if (!ctx || !master || ctx.state !== 'running' || !getAudioSettings().sfx) return;
  const t = ctx.currentTime + 0.005;
  if (!playClips(name, t)) synth(name, t);
  if (place) playPlace(place, t + 0.12);
}

/** A place's own sound on top of the cue: its clip when recorded, else the synth sketch, else nothing. */
function playPlace(place: string, t: number): void {
  const layers = SFX_PLACES[place];
  if (layers && playLayers(layers, t)) return;
  synthPlace(place, t);
}

// ---------- place sketches (until each Location has its recording) ----------

/** A ship's horn: a low reedy tone with a slow swell, its harmonics rolled off, a second blast a fifth below. */
function horn(t: number, freq: number, dur: number, gain: number): void {
  if (!ctx || !master) return;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.28);
  g.gain.setValueAtTime(gain, t + dur - 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g).connect(master);
  for (const [mult, type, level] of [[1, 'sawtooth', 1], [1.005, 'sawtooth', 0.7], [0.5, 'square', 0.35]] as [number, OscillatorType, number][]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, t);
    o.frequency.linearRampToValueAtTime(freq * mult * 0.985, t + dur); // sags a touch as the air runs out
    const og = ctx.createGain();
    og.gain.value = level;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Water: a splash (a burst of bright noise) and the trickle after it (soft bursts, a few droplets pinging). */
function water(t: number, gain: number): void {
  blip(t, 240, 0.2, gain * 0.35, 'sine', 70); // the plunge under the splash
  swoosh(t, 0.32, 2400, 700, gain, 0.6);
  swoosh(t + 0.05, 0.7, 900, 300, gain * 0.8, 0.5);
  for (let i = 0; i < 8; i++) {
    const at = t + 0.18 + i * 0.13 + Math.random() * 0.05;
    swoosh(at, 0.16, 1600 + Math.random() * 1200, 500, gain * 0.45, 1.2);
    if (i % 2 === 0) blip(at + 0.02, 2200 + Math.random() * 1400, 0.07, gain * 0.3, 'sine', 900);
  }
}

function synthPlace(place: string, t: number): void {
  switch (place) {
    case 'harpers_ferry': // where the Shenandoah meets the Potomac
      water(t, 0.85);
      break;
    case 'accra_ghana': // the Black Star coming in to port: water lapping under the horn, the horn twice
      swoosh(t, 1.6, 500, 250, 0.3, 0.4);
      horn(t + 0.1, 116, 1.15, 0.22);
      horn(t + 1.35, 87, 1.0, 0.18);
      break;
    default:
      break;
  }
}
