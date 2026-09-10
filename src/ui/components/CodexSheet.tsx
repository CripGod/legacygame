import { useEffect, useState } from 'react';
import { CARD_BY_ID } from '../../engine';
import { CardFace } from './CardFace';
import { cardName, useDisplay } from '../display';

type Note = 'history';

/**
 * The Compendium's card sheet: a parchment plate holding the full card, a note that explains the orbs
 * (the same text the desktop tooltips carry, readable by tap), and the history behind the card.
 * It is labelled by chapter rather than by name, which the card itself already prints.
 */
export function CodexSheet({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const [note, setNote] = useState<Note | null>(null);
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
  const historyLabel = mythic ? 'Origins' : 'History';
  const toggle = (n: Note) => setNote((cur) => (cur === n ? null : n));
  return (
    <div className="scrim cx-scrim" onClick={onClose}>
      <div className="cx-sheet cx-framed" role="dialog" aria-modal="true" aria-label={cardName(id, placeholders)} onClick={(e) => e.stopPropagation()}>
        <div className="cx-sheet-head">
          <span className="cx-kicker">{label}</span>
          <button className="cx-x cx-ctl" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="cx-sheet-body">
          <CardFace id={id} big />
          <div className="cx-sheet-actions">
            {history && (
              <button className={`cx-btn cx-ctl ${note === 'history' ? 'on' : ''}`} onClick={() => toggle('history')} aria-expanded={note === 'history'}>
                {historyLabel}
              </button>
            )}
          </div>
          {note === 'history' && history && (
            <div className="cx-note">
              <span className="cx-kw">{historyLabel}</span>
              {mythic && <div className="cx-note-tag">Mythic: a figure of faith and folklore, not a historical person. Here is where the story comes from.</div>}
              <p>{history}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
