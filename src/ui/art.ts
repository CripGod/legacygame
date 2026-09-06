/**
 * Artwork lookup. Files live in public/art/<kind>/<id>.jpg (see docs/ART_SPEC.md).
 * Missing files fall back to the generated initials tile.
 */
export type ArtKind = 'characters' | 'locations' | 'threats' | 'events';

const missing = new Set<string>();

export function artUrl(kind: ArtKind, id: string): string {
  return `${import.meta.env.BASE_URL}art/${kind}/${id}.jpg`;
}

export function artMissing(kind: ArtKind, id: string): boolean {
  return missing.has(`${kind}/${id}`);
}

export function markArtMissing(kind: ArtKind, id: string): void {
  missing.add(`${kind}/${id}`);
}
