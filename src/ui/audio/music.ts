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

const VOLUME = 0.3;
const FADE_IN_MS = 1200;
const FADE_OUT_MS = 700;

function trackUrl(id: string): string {
  const inline = typeof window !== 'undefined' ? window.__AUDIO__?.[id] : undefined;
  return inline ?? `${import.meta.env.BASE_URL}audio/${id}.m4a`;
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
    fadeTo(VOLUME, a.volume === 0 ? FADE_IN_MS : 300);
  } else if (!a.paused) {
    fadeTo(0, FADE_OUT_MS, true);
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

export function musicIsPlaying(): boolean {
  return !!el && !el.paused;
}

if (typeof window !== 'undefined') {
  subscribeAudio(syncMusic);
  document.addEventListener('visibilitychange', syncMusic);
}
