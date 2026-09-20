/**
 * Artwork lookup. Files live in public/art/<kind>/<id>.jpg (see docs/ART_SPEC.md).
 * Missing files fall back to the generated initials tile.
 */
export type ArtKind = 'characters' | 'locations' | 'threats' | 'events' | 'landing' | 'frames' | 'kit';

/** The UI Kit Maker cut (public/art/kit): six buttons in four states and the plan timer's track and fill, as CSS
 *  variables the match root carries, so the stylesheet can draw nine-sliced frames from them (theme.css, "The kit"). */
export const KIT_PIECES = ['primary', 'stand-btn-on', 'secondary', 'lock-locked', 'small'] as const;
export const KIT_STATES = ['default', 'hover', 'pressed', 'disabled'] as const;
/** An art address a CSS url() can use from anywhere: absolute against the page (the inlined page hands back data URLs unchanged). */
export const pageUrl = (u: string): string => (typeof document !== 'undefined' ? new URL(u, document.baseURI).href : u);
/** Every kit sprite fetched up front, so a hover or a press never swaps to a frame the browser has not loaded yet
 *  (the first rollover went blank while the hover sprite came in). Once per page. */
let kitWarmed = false;
export function warmKit(): void {
  if (kitWarmed || typeof Image === 'undefined') return;
  kitWarmed = true;
  const urls: string[] = [];
  for (const p of KIT_PIECES) for (const s of KIT_STATES) urls.push(artUrl('kit', `${p}-${s}`, 'webp'));
  urls.push(artUrl('kit', 'timer-track', 'webp'), artUrl('kit', 'timer-fill', 'webp'));
  for (const u of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
  }
}
export function kitVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of KIT_PIECES) for (const s of KIT_STATES) out[`--kit-${p}-${s}`] = `url("${pageUrl(artUrl('kit', `${p}-${s}`, 'webp'))}")`;
  out['--kit-timer-track'] = `url("${pageUrl(artUrl('kit', 'timer-track', 'webp'))}")`;
  out['--kit-timer-fill'] = `url("${pageUrl(artUrl('kit', 'timer-fill', 'webp'))}")`;
  // The Brightside ribbon (public/art/kit/ribbon.webp): the turn count's plate; the match-end banner draws it as an img.
  out['--kit-ribbon'] = `url("${pageUrl(artUrl('kit', 'ribbon', 'webp'))}")`;
  out['--kit-ribbon-glow'] = `url("${pageUrl(artUrl('kit', 'ribbon-glow', 'webp'))}")`;
  // The card back (public/art/frames/card-back.webp, 600 by 364, the Gate window's shape): every face-down card wears it.
  out['--card-back'] = `url("${pageUrl(artUrl('frames', 'card-back', 'webp'))}")`;
  return out;
}

import manifest from './art-manifest.json';

const missing = new Set<string>();

/** Single-file builds (the hosted preview) inline images here as data URIs. */
declare global {
  interface Window {
    __ART__?: Record<string, string>;
    /** Single-file builds: video files by name ("board.mp4"), as URLs. */
    __VIDEO__?: Record<string, string>;
  }
}

/** A video under public/art/video, by file name ("board.mp4"). */
export function videoUrl(file: string): string {
  const inline = typeof window !== 'undefined' ? window.__VIDEO__?.[file] : undefined;
  if (inline) return inline;
  return `${import.meta.env.BASE_URL}art/video/${file}`;
}

export function artUrl(kind: ArtKind, id: string, ext?: 'jpg' | 'webp' | 'png' | 'svg'): string {
  const inline = typeof window !== 'undefined' ? window.__ART__?.[`${kind}/${id}`] : undefined;
  if (inline) return inline;
  const file = `${kind}/${id}.${ext ?? 'jpg'}`;
  // A replaced picture gets a new address (scripts/art-manifest.ts hashes every file before a build).
  const v = (manifest as Record<string, string>)[file];
  return `${import.meta.env.BASE_URL}art/${file}${v ? `?v=${v}` : ''}`;
}

export function artKnownMissing(kind: ArtKind, id: string): boolean {
  const m = typeof window !== 'undefined' ? window.__ART__ : undefined;
  return !!m && !m[`${kind}/${id}`];
}

export function artMissing(kind: ArtKind, id: string): boolean {
  return missing.has(`${kind}/${id}`) || artKnownMissing(kind, id);
}

export function markArtMissing(kind: ArtKind, id: string): void {
  missing.add(`${kind}/${id}`);
}
