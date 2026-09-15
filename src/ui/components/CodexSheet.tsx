import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_BY_ID } from '../../engine';
import { CardFace } from './CardFace';
import { cardName, useDisplay } from '../display';
import { sfx } from '../audio';
import { RANK_LABEL, RANK_PRICE, balance, nextRank, promote, rankOf, useLedger } from '../legacy';
import { tip } from '../tip';
import '../compendium.css';

/**
 * The card, alone, on the dark. "History" slides the card to the left and opens the story beside it,
 * light text on the dark ground, scrolling when it runs long.
 *
 * The same stage serves the match: `children` is an action tray under the card (send it somewhere, enter,
 * relocate, a live readout), so a card reads the same wherever it opens.
 */
export function CodexSheet({ id, label, onClose, children, flat }: { id: string; label: string; onClose: () => void; children?: ReactNode; /** No backdrop blur: for the match, where the board behind keeps animating and a blurred backdrop would re-render every frame. */ flat?: boolean }) {
  const { placeholders } = useDisplay();
  const [open, setOpen] = useState(false);
  useLedger();
  const rank = rankOf(id);
  const next = nextRank(id);
  const price = next ? RANK_PRICE[next] : 0;
  const can = !!next && balance() >= price;
  const [flash, setFlash] = useState(false);
  const mountedAt = useRef(performance.now());
  useEffect(() => {
    sfx('sheet.open');
    return () => sfx('sheet.close');
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // 3D tilt: the card leans toward the pointer, gently, and settles back when it leaves. Modal only.
  // Pointer moves are coalesced into one style write per animation frame, so a burst of events never queues up.
  const tiltRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const applyTilt = () => {
    raf.current = 0;
    const el = tiltRef.current;
    const p = pending.current;
    if (!el || !p) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (p.x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (p.y - r.top) / r.height));
    el.style.setProperty('--ry', `${((px - 0.5) * 18).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * 13).toFixed(2)}deg`);
    el.classList.add('tilting');
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    pending.current = { x: e.clientX, y: e.clientY };
    if (!raf.current) raf.current = requestAnimationFrame(applyTilt);
  };
  const onLeave = () => {
    pending.current = null;
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
    el.classList.remove('tilting');
  };
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const mythic = def.kind === 'character' && def.category === 'mythic';
  const history = placeholders ? undefined : def.history;
  return (
    <div
      className={`scrim cx-scrim ${flat ? 'flat' : ''}`}
      onClick={() => {
        // The click that opened the sheet (a hold released, a right-click's mouseup) must not close it at once.
        if (performance.now() - mountedAt.current > 250) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className={`cx-stage ${open ? 'open' : ''} ${children ? 'has-tray' : ''}`} role="dialog" aria-modal="true" aria-label={cardName(id, placeholders)} onClick={(e) => e.stopPropagation()}>
        <button className="cx-x cx-ctl cx-stage-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="cx-card3d">
          <div className="cx-card3d-inner" ref={tiltRef} onPointerMove={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
            <CardFace id={id} big />
          </div>
          {history && (
            <button className={`cx-btn cx-ctl cx-history-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Close' : mythic ? 'Origins' : 'History'}
            </button>
          )}
          {/* The card's rank, and the way up: Legacy buys the next frame. Cosmetic only; the numbers never change. */}
          <div className={`cx-rank rank-${rank} ${flash ? 'flash' : ''}`}>
            <span className="cx-rank-medal" aria-hidden />
            <span className="cx-rank-lbl">{RANK_LABEL[rank]} rank</span>
            {next ? (
              <button
                className="cx-btn cx-ctl cx-rank-btn"
                disabled={!can}
                data-sfx={can ? 'card.select' : 'off'}
                onClick={() => {
                  if (promote(id) === 'ok') {
                    setFlash(true);
                    window.setTimeout(() => setFlash(false), 900);
                  }
                }}
                {...tip(can ? `Promote ${cardName(id, placeholders)} to ${RANK_LABEL[next]} for ${price} Legacy. You have ${balance()}. The frame changes; the card does not.` : `${RANK_LABEL[next]} costs ${price} Legacy; you have ${balance()}. Win matches to earn it: a match pays its Legacy to the winner.`)}
              >
                {RANK_LABEL[next]} · {price} ★
              </button>
            ) : (
              <span className="cx-rank-max">Highest rank</span>
            )}
          </div>
          {children && <div className="cx-tray">{children}</div>}
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
