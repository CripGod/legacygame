/**
 * Artwork lookup. Files live in public/art/<kind>/<id>.jpg (see docs/ART_SPEC.md).
 * Missing files fall back to the generated initials tile.
 */
export type ArtKind = 'characters' | 'locations' | 'threats' | 'events' | 'landing' | 'frames';

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
