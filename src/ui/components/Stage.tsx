import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../audio';
import { RefsModal } from './RefsModal';
import '../compendium.css';

/**
 * The dark stage every inspect sheet shares (the expanded card model): the thing itself alone on the dark, leaning
 * toward the pointer, a History (or References) panel that slides open beside it, and an action tray under it for
 * what the match lets you do with it. A card, a Threat and a Location all open here, so they read the same.
 */
export function Stage({
  name,
  label,
  onClose,
  panel,
  below,
  children,
  history,
  historyLabel = 'History',
  historyTag,
  refsId,
  flat,
  siblings,
  onNav,
  navLabel = 'card',
  info,
}: {
  /** Accessible name and the History panel's title. */
  name: string;
  /** The kicker over the story (deck name, "In hand", the Location it stands at). */
  label: string;
  onClose: () => void;
  /** The thing itself: the big card face, or a plate for a Threat or a Location. */
  panel: ReactNode;
  /** Under the panel, above the tray (the card's rank line). */
  below?: ReactNode;
  /** The action tray. */
  children?: ReactNode;
  /** For a plate that is not a card: the text beside the picture from the start (the side panel is open on arrival), and the History button swaps it for the story and the References. */
  info?: ReactNode;
  /** The story beside it; with none, the side panel still offers the References when refsId is set. */
  history?: string;
  historyLabel?: string;
  historyTag?: string;
  refsId?: string;
  /** No backdrop blur: for the match, where the board behind keeps animating. */
  flat?: boolean;
  siblings?: string[];
  onNav?: (id: string) => void;
  navLabel?: string;
}) {
  const ring = siblings && siblings.length > 1 && onNav ? siblings : null;
  const id = refsId ?? name;
  const go = (dir: -1 | 1) => {
    if (!ring || !onNav) return;
    const at = ring.indexOf(id);
    const next = ring[(at < 0 ? 0 : at + dir + ring.length) % ring.length];
    if (next && next !== id) {
      sfx('card.pick');
      onNav(next);
    }
  };
  const [open, setOpen] = useState(!!info);
  const [story, setStory] = useState(false);
  const [refs, setRefs] = useState(false);
  const mountedAt = useRef(performance.now());
  useEffect(() => {
    sfx('sheet.open');
    return () => sfx('sheet.close');
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, id, ring, onNav]);
  // 3D tilt: the panel leans toward the pointer, gently, and settles back when it leaves. Modal only.
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
  const aside = !!history || !!refsId || !!info;
  const canStory = !!history || !!refsId;
  // With info, the panel stays open and the button swaps its contents; without, the button opens and closes the panel.
  const showingStory = info ? story : true;
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
      <div className={`cx-stage ${open ? 'open' : ''} ${children ? 'has-tray' : ''}`} role="dialog" aria-modal="true" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <button className="cx-x cx-ctl cx-stage-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {ring && (
          <>
            <button className="cx-x cx-ctl cx-arrow prev" onClick={() => go(-1)} aria-label={`Previous ${navLabel}`}>
              ‹
            </button>
            <button className="cx-x cx-ctl cx-arrow next" onClick={() => go(1)} aria-label={`Next ${navLabel}`}>
              ›
            </button>
          </>
        )}
        <div className="cx-card3d">
          <div className="cx-card3d-inner" ref={tiltRef} onPointerMove={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
            {panel}
          </div>
          {aside && canStory && (
            <button className={`cx-btn cx-ctl cx-history-btn ${(info ? story : open) ? 'on' : ''}`} onClick={() => (info ? setStory((o) => !o) : setOpen((o) => !o))} aria-expanded={info ? story : open}>
              {info ? (story ? 'Back' : history ? historyLabel : 'References') : open ? 'Close' : history ? historyLabel : 'References'}
            </button>
          )}
          {below}
          {children && <div className="cx-tray">{children}</div>}
        </div>
        {aside && (
          <aside className="cx-history" aria-hidden={!open}>
            <div className="cx-history-scroll">
              <div className="cx-kicker">
                {label}{showingStory ? ` · ${history ? historyLabel : 'References'}` : ''}
              </div>
              <h3>{name}</h3>
              {!showingStory && info}
              {showingStory && historyTag && <div className="cx-history-tag">{historyTag}</div>}
              {showingStory && history && <p>{history}</p>}
              {showingStory && refsId && (
                <a
                  className="cx-refs-link"
                  href={`#refs=${refsId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setRefs(true);
                  }}
                >
                  References →
                </a>
              )}
            </div>
          </aside>
        )}
      </div>
      {refs && refsId && <RefsModal id={refsId} name={name} onClose={() => setRefs(false)} />}
    </div>
  );
}
