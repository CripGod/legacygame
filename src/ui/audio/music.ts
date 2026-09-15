import { getAudioSettings, subscribeAudio } from './settings';

/**
 * Background music: one looping track, faded in and out. It plays on the screens that ask for it
 * (the landing page and the match) once the browser has seen a user gesture, which is when
 * autoplay policies allow sound to start. Files live in public/audio/<id>.m4a; the single-file
 * build inlines them as data URIs on window.__AUDIO__, the same way artwork is inlined.
 */
declare global {
  interface Window {
    __AUDIO__?: Record<string, string>;
  }
}

/** The track that plays everywhere for now. */
export const MUSIC_TRACK = { id: 'echoes-of-the-past', title: 'Echoes of the Past' };
/** The Threat's music: takes over while the Mob stands on the landing page (thirty seconds cut from the piece). */
export const THREAT_TRACK = { id: 'threat-mob', title: 'Threat', ext: 'mp3' };
const THREAT_VOLUME = 0.55;
/** How far the main track drops under the Threat's. */
const UNDER_THREAT = 0.12;

const VOLUME = 0.3;
const FADE_IN_MS = 1200;
const FADE_OUT_MS = 700;

function trackUrl(id: string, ext = 'm4a'): string {
  const inline = typeof window !== 'undefined' ? window.__AUDIO__?.[id] : undefined;
  return inline ?? `${import.meta.env.BASE_URL}audio/${id}.${ext}`;
}

let el: HTMLAudioElement | null = null;
/** A screen that plays music is showing. */
let wanted = false;
/** The page has had a user gesture, so play() is allowed. */
let unlocked = false;
let fadeTimer = 0;

function ensure(): HTMLAudioElement {
  if (!el) {
    el = new Audio(trackUrl(MUSIC_TRACK.id));
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
  }
  return el;
}

function fadeTo(target: number, ms: number, pauseAtEnd = false): void {
  const a = ensure();
  window.clearInterval(fadeTimer);
  const from = a.volume;
  const t0 = performance.now();
  fadeTimer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = from + (target - from) * k;
    if (k >= 1) {
      window.clearInterval(fadeTimer);
      if (pauseAtEnd) a.pause();
    }
  }, 40);
}

/** Reconcile the player with the settings and the screen: play and fade in, or fade out and pause. */
export function syncMusic(): void {
  if (typeof window === 'undefined') return;
  const should = wanted && unlocked && getAudioSettings().music && !document.hidden;
  const a = ensure();
  if (should) {
    if (a.paused) a.play().catch(() => undefined);
    fadeTo(threatOn ? VOLUME * UNDER_THREAT : VOLUME, a.volume === 0 ? FADE_IN_MS : 300);
  } else if (!a.paused) {
    fadeTo(0, FADE_OUT_MS, true);
  }
  syncThreat();
}

let threatEl: HTMLAudioElement | null = null;
/** The Mob is standing: its music is wanted. */
let threatWanted = false;
/** Its music is playing. */
let threatOn = false;
let threatFade = 0;
function fadeThreat(target: number, ms: number, pauseAtEnd = false): void {
  const t = threatEl;
  if (!t) return;
  window.clearInterval(threatFade);
  const from = t.volume;
  const t0 = performance.now();
  threatFade = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    t.volume = from + (target - from) * k;
    if (k >= 1) {
      window.clearInterval(threatFade);
      if (pauseAtEnd) {
        t.pause();
        t.currentTime = 0;
      }
    }
  }, 40);
}

/**
 * The Threat's music, over the main track: on when the Mob rises (it opens with its hit, so it starts at once and
 * the main track drops under it), off when the fists meet (it fades out over the heal and the main track comes back).
 * Unity: a second music source with a snapshot transition on the main bus.
 */
export function threatMusic(on: boolean): void {
  if (typeof window === 'undefined') return;
  threatWanted = on;
  syncThreat();
}

/** Start or stop the Threat's music to match what is wanted and allowed (a gesture seen, music on, page visible). */
function syncThreat(): void {
  const should = threatWanted && wanted && unlocked && getAudioSettings().music && !document.hidden;
  if (should === threatOn) return;
  threatOn = should;
  if (should) {
    if (!threatEl) {
      threatEl = new Audio(trackUrl(THREAT_TRACK.id, THREAT_TRACK.ext));
      threatEl.preload = 'auto';
    }
    threatEl.currentTime = 0;
    threatEl.volume = 0;
    threatEl.play().catch(() => undefined);
    fadeThreat(THREAT_VOLUME, 250);
    const a = ensure();
    if (!a.paused) fadeTo(VOLUME * UNDER_THREAT, 600);
  } else {
    fadeThreat(0, 1400, true);
    const a = ensure();
    if (!a.paused && wanted && getAudioSettings().music) fadeTo(VOLUME, 900);
  }
}

/** Screens call this on mount and unmount: the landing page and the match want music. */
export function musicWanted(on: boolean): void {
  wanted = on;
  syncMusic();
}

/** The first user gesture: from here on play() is allowed. */
export function musicUnlock(): void {
  unlocked = true;
  syncMusic();
}

/** Lower the music under a voice line, then bring it back. */
let duckUntil = 0;
export function duckMusic(ms: number): void {
  const a = ensure();
  if (a.paused) return;
  duckUntil = performance.now() + ms;
  fadeTo(VOLUME * 0.3, 120);
  window.setTimeout(() => {
    if (performance.now() >= duckUntil - 5 && !a.paused && getAudioSettings().music) fadeTo(VOLUME, 500);
  }, ms);
}

export function musicIsPlaying(): boolean {
  return !!el && !el.paused;
}

if (typeof window !== 'undefined') {
  subscribeAudio(syncMusic);
  document.addEventListener('visibilitychange', syncMusic);
}
