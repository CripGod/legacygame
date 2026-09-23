/**
 * Artwork lookup. Files live in public/art/<kind>/<id>.jpg (see docs/ART_SPEC.md).
 * Missing files fall back to the generated initials tile.
 */
export type ArtKind = 'characters' | 'locations' | 'threats' | 'events' | 'landing' | 'frames' | 'kit';

/** The UI Kit Maker cut (public/art/kit): six buttons in four states and the plan timer's track and fill, as CSS
 *  variables the match root carries, so the stylesheet can draw nine-sliced frames from them (theme.css, "The kit"). */
export const KIT_PIECES = ['primary', 'secondary', 'lock-locked', 'small'] as const;
/** The top-bar cut (public/art/kit, np-* and sob-*): the two nameplate strips with their avatar rings and level chips, and the Stand on Business strip in four states with its wordmark, in gold (sob-*) and in the silver of its resting finish (sob-silver-*); its shines are SVGs (sob-shine-*.svg, sob-plate-still.svg and the silver ones), loaded as images. The turn-tracker cut (tt-*): the plate in two states and the lit and unlit coin. */
export const TOP_BAR_PIECES = ['np-you-strip', 'np-you-ring', 'np-you-chip', 'np-opp-strip', 'np-opp-ring', 'np-opp-chip', 'sob-default', 'sob-hover', 'sob-pressed', 'sob-disabled', 'sob-wordmark', 'sob-silver-default', 'sob-silver-hover', 'sob-silver-disabled', 'sob-silver-wordmark', 'tt-plate', 'tt-plate-disabled', 'tt-coin-lit', 'tt-coin-unlit'] as const;
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
  for (const p of TOP_BAR_PIECES) urls.push(artUrl('kit', p, 'webp'));
  for (const p of ['sob-shine-edge', 'sob-shine-wipe', 'sob-plate-still', 'sob-silver-shine-edge', 'sob-silver-shine-wipe', 'sob-silver-plate-still']) urls.push(artUrl('kit', p, 'svg'));
  for (const u of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
  }
}
/** Every number in kit-geometry.json (scripts/kit.ts writes it from a cut's manifest) as a CSS variable named
 *  --kit-<prefix>-<path> (--kit-tt-shell-w, --kit-sob-wordmark-dx), so the CSS lays a piece out by the cut's own
 *  numbers and a re-export with a different shell or seat lays itself out. See docs/kit.md. */
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
function geometryVars(prefix: string, node: unknown, out: Record<string, string>): void {
  if (typeof node === 'number') out[prefix] = String(node);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) geometryVars(`${prefix}-${kebab(k)}`, v, out);
}

export function kitVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of KIT_PIECES) for (const s of KIT_STATES) out[`--kit-${p}-${s}`] = `url("${pageUrl(artUrl('kit', `${p}-${s}`, 'webp'))}")`;
  for (const p of TOP_BAR_PIECES) out[`--kit-${p}`] = `url("${pageUrl(artUrl('kit', p, 'webp'))}")`;
  out['--kit-timer-track'] = `url("${pageUrl(artUrl('kit', 'timer-track', 'webp'))}")`;
  out['--kit-timer-fill'] = `url("${pageUrl(artUrl('kit', 'timer-fill', 'webp'))}")`;
  // The Brightside ribbon (public/art/kit/ribbon.webp): the turn count's plate; the match-end banner draws it as an img.
  out['--kit-ribbon'] = `url("${pageUrl(artUrl('kit', 'ribbon', 'webp'))}")`;
  out['--kit-ribbon-glow'] = `url("${pageUrl(artUrl('kit', 'ribbon-glow', 'webp'))}")`;
  // The card back (public/art/frames/card-back.webp, 600 by 364, the Gate window's shape): every face-down card wears it.
  out['--card-back'] = `url("${pageUrl(artUrl('frames', 'card-back', 'webp'))}")`;
  geometryVars('--kit', geometry, out);
  return out;
}

import manifest from './art-manifest.json';
import geometry from './kit-geometry.json';

const missing = new Set<string>();

/** Single-file builds (the hosted preview) inline images here as data URIs. */
declare global {
  interface Window {
    __ART__?: Record<string, string>;
    /** Single-file builds: video files by name ("board.mp4"), as URLs. */
    __VIDEO__?: Record<string, string>;
  }
}

/** A video under public/art/video, by file name ("board.mp4"). Versioned like the pictures: the host caches art for a year, so a replaced clip needs a new address. */
export function videoUrl(file: string): string {
  const inline = typeof window !== 'undefined' ? window.__VIDEO__?.[file] : undefined;
  if (inline) return inline;
  const v = (manifest as Record<string, string>)[`video/${file}`];
  return `${import.meta.env.BASE_URL}art/video/${file}${v ? `?v=${v}` : ''}`;
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
