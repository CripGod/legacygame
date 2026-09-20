import { useEffect, useState } from 'react';
import { artMissing, artUrl, markArtMissing, type ArtKind } from '../art';

/** An image that falls back to `fallback` (initials on a color) when the file is absent. */
export function Art({ kind, id, className, fallback, alt, onSettled }: { kind: ArtKind; id: string; className?: string; fallback: React.ReactNode; alt?: string; /** The picture is in (or has failed and the fallback stands): whoever waits to show the whole can go. */ onSettled?: () => void }) {
  const [failed, setFailed] = useState(() => artMissing(kind, id));
  useEffect(() => {
    if (failed) onSettled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);
  if (failed) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={artUrl(kind, id)}
      alt={alt ?? ''}
      draggable={false}
      onLoad={() => onSettled?.()}
      onError={() => {
        markArtMissing(kind, id);
        setFailed(true);
      }}
    />
  );
}
