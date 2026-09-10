import { useEffect, useState } from 'react';
import { CARD_BY_ID } from '../../engine';
import { CardFace } from './CardFace';
import { cardName, useDisplay } from '../display';

/**
 * The card, alone, on the dark. "History" slides the card to the left and opens the story beside it,
 * light text on the dark ground, scrolling when it runs long.
 */
export function CodexSheet({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const mythic = def.kind === 'character' && def.category === 'mythic';
  const history = placeholders ? undefined : def.history;
  return (
    <div className="scrim cx-scrim" onClick={onClose}>
      <div className={`cx-stage ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label={cardName(id, placeholders)} onClick={(e) => e.stopPropagation()}>
        <button className="cx-x cx-ctl cx-stage-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="cx-card3d">
          <div className="cx-card3d-inner">
            <CardFace id={id} big />
          </div>
          {history && (
            <button className={`cx-btn cx-ctl cx-history-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Close' : mythic ? 'Origins' : 'History'}
            </button>
          )}
        </div>
        {history && (
          <aside className="cx-history" aria-hidden={!open}>
            <div className="cx-history-scroll">
              <div className="cx-kicker">
                {label} · {mythic ? 'Origins' : 'History'}
              </div>
              <h3>{cardName(id, placeholders)}</h3>
              {mythic && <div className="cx-history-tag">A figure of faith and folklore, not a historical person. Here is where the story comes from.</div>}
              <p>{history}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
