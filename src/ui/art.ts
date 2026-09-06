/**
 * Artwork lookup. Files live in public/art/<kind>/<id>.jpg (see docs/ART_SPEC.md).
 * Missing files fall back to the generated initials tile.
 */
export type ArtKind = 'characters' | 'locations' | 'threats' | 'events';

const missing = new Set<string>();

/** Single-file builds (the hosted preview) inline images here as data URIs. */
declare global {
  interface Window {
    __ART__?: Record<string, string>;
  }
}

export function artUrl(kind: ArtKind, id: string): string {
  const inline = typeof window !== 'undefined' ? window.__ART__?.[`${kind}/${id}`] : undefined;
  if (inline) return inline;
  return `${import.meta.env.BASE_URL}art/${kind}/${id}.jpg`;
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
