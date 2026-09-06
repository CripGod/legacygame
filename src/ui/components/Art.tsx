import { useState } from 'react';
import { artMissing, artUrl, markArtMissing, type ArtKind } from '../art';

/** An image that falls back to `fallback` (initials on a color) when the file is absent. */
export function Art({ kind, id, className, fallback, alt }: { kind: ArtKind; id: string; className?: string; fallback: React.ReactNode; alt?: string }) {
  const [failed, setFailed] = useState(() => artMissing(kind, id));
  if (failed) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={artUrl(kind, id)}
      alt={alt ?? ''}
      draggable={false}
      onError={() => {
        markArtMissing(kind, id);
        setFailed(true);
      }}
    />
  );
}
