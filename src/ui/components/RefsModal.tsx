import { useEffect, useState } from 'react';
import { referencesFor } from '../../engine';
import { sfx } from '../audio';

/**
 * The references for one entry, over whatever is open: a short list of sources with outbound links, and a link to
 * this list in the Compendium (`#refs=<id>`) that can be copied and shared. "Don't trust us: see for yourself."
 */
export function RefsModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const refs = referencesFor(id);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}#refs=${id}`;
  useEffect(() => {
    sfx('sheet.open');
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div
      className="scrim refs-scrim"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="refs cx-framed" role="dialog" aria-modal="true" aria-label={`References: ${name}`} onClick={(e) => e.stopPropagation()}>
        <div className="refs-head">
          <div className="cx-kicker">References</div>
          <h3>{name}</h3>
          <button className="cx-x cx-ctl refs-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {refs.length ? (
          <ol className="refs-list">
            {refs.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
                {r.by && <span className="refs-by">{r.by}</span>}
                {r.note && <div className="refs-note">{r.note}</div>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="refs-empty">The sources for this entry are still being gathered. The history above is written from the record; the links will follow.</p>
        )}
        <div className="refs-foot">
          <span className="refs-link" title={link}>
            {link.replace(/^https?:\/\//, '')}
          </span>
          <button
            className="cx-btn cx-ctl refs-copy"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                },
                () => undefined,
              );
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  );
}
