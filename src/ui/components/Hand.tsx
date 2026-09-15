import { sfx } from '../audio';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardCost, costBreakdown, type GameState, type PlayerId, type TurnPlan } from '../../engine';
import { CardFace } from './CardFace';
import { cardName, useDisplay } from '../display';
import type { DragPayload } from '../drag';

/** First-seen times for hand cards in the current match. */
let DEALT: { seed: number; at: Map<string, { t: number; k: number }> } = { seed: NaN, at: new Map() };

export function Hand({
  view,
  me,
  plan,
  selected,
  onTap,
  onInspect,
  compact,
  dragProps,
  rest,
  nudge,
  glow,
  energyLeft,
  dropState,
  held,
  reject,
  settle,
  canPlay,
}: {
  view: GameState;
  me: PlayerId;
  plan: TurnPlan;
  /** The standing card: lifted, ringed, its Locations lit. A click or tap toggles it. */
  selected: string | null;
  onTap: (cardId: string) => void;
  onInspect: (cardId: string) => void;
  compact: boolean;
  dragProps?: (payload: DragPayload) => Record<string, unknown>;
  /** Not planning: the hand sits back and stops lifting on hover. */
  rest?: boolean;
  /** A blocked drag: the hand dips once. */
  nudge?: boolean;
  glow?: string | string[] | null;
  /** Energy still unspent this turn; cards above it are dimmed. */
  energyLeft?: number;
  dropState?: 'ok' | 'over' | null;
  /** The card whose ghost is riding the pointer: its place in the fan dims. */
  held?: string | null;
  /** A card that was tapped but cannot be played right now: it shakes once. */
  reject?: string | null;
  /** The 250 ms after a card was put down: no hover lift, so it does not pop straight back up under the pointer. */
  settle?: boolean;
  /** Whether a card can be played this turn (legal, affordable, not already planned): others show a no-entry cursor. */
  canPlay?: (id: string) => boolean;
}) {
  const { placeholders } = useDisplay();
  const hand = view.players[me].hand;
  /** What kind of pointer last pressed a card, so right-click on a mouse reads and a touch long-press does not double up. */
  const lastPointer = useRef('mouse');
  // Cards are dealt in with an animation: each id remembers when it first showed up and its place in that batch.
  // Kept outside React state so a remount mid-match does not re-deal the whole hand.
  const seen = useRef(DEALT);
  if (seen.current.seed !== view.seed) seen.current = { seed: view.seed, at: new Map() };
  DEALT = seen.current;
  const now = Date.now();
  let k = 0;
  for (const id of hand) if (!seen.current.at.has(id)) seen.current.at.set(id, { t: now, k: k++ });
  const dealtInfo = (id: string) => {
    const d = seen.current.at.get(id);
    return d && now - d.t < 1400 ? d.k : -1;
  };
  // Re-render once the last deal has settled so the class can come off cleanly.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hand.some((id) => dealtInfo(id) >= 0)) return;
    const h = window.setTimeout(() => tick((n) => n + 1), 1500);
    return () => window.clearTimeout(h);
  });
  // Each card that deals in gets its own sound, on the same stagger as the animation.
  const sounded = useRef(new Set<string>());
  useEffect(() => {
    for (const id of hand) {
      const k = dealtInfo(id);
      if (k < 0 || sounded.current.has(id)) continue;
      sounded.current.add(id);
      window.setTimeout(() => sfx('card.deal'), k * 140);
    }
  });
  // A planned card leaves the hand: it is on the board now, as its preview tile, and the plan chip under the hand (or
  // Undo) takes it back. The fan re-centres on what is left, and that glides like a draw does.
  const visible = hand.filter((id) => !plan.plays.some((pl) => pl.cardId === id));
  const n = visible.length;
  const mid = (n - 1) / 2;
  const fanRef = useRef<HTMLDivElement>(null);
  const fanRects = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = fanRef.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    const seenIds = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-hand-card]').forEach((el) => {
      // Keyed by card (and its occurrence, for duplicates), not by index, so a card leaving the fan still lets the
      // others glide; measured by layout position, so a glide in progress never reads as a new move.
      const id = el.dataset.handCard ?? '';
      const nth = seenIds.get(id) ?? 0;
      seenIds.set(id, nth + 1);
      const key = `${id}#${nth}`;
      // Viewport position net of any glide still running, so a glide in progress never reads as a new move (the fan
      // container itself moves when it narrows, so it is no reference).
      const t = getComputedStyle(el).translate;
      const left = el.getBoundingClientRect().left - (t && t !== 'none' ? parseFloat(t) || 0 : 0);
      next.set(key, left);
      const prev = fanRects.current.get(key);
      if (prev === undefined || reduce || el.classList.contains('dealt')) return;
      const dx = prev - left;
      if (Math.abs(dx) < 1) return;
      // A reflow (a card drawn, the hand re-centred): glide from the old place instead of jumping.
      el.style.transition = 'none';
      el.style.translate = `${dx}px 0`;
      requestAnimationFrame(() => {
        el.style.transition = 'translate 260ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.2s, margin 0.2s';
        el.style.translate = '0 0';
        window.setTimeout(() => {
          el.style.transition = '';
          el.style.translate = '';
        }, 300);
      });
    });
    fanRects.current = next;
  });
  return (
    <div className={`hand-wrap ${dropState === 'ok' ? 'drop-ok' : ''} ${dropState === 'over' ? 'drop-ok drop-over' : ''} ${rest ? 'rest' : ''} ${nudge ? 'nudge' : ''} ${settle ? 'settle' : ''}`} data-drop="hand">
      <div ref={fanRef} className={`hand ${compact ? 'compact' : ''}`}>
        {visible.map((id, i) => {
          const off = i - mid;
          // A fanned hand: each card leans out from the centre and sits a little lower the farther out it is.
          const rot = off * (compact ? 5 : 4);
          const ty = Math.abs(off) * Math.abs(off) * (compact ? 2 : 3.5);
          const sel = selected === id;
          const planned = plan.plays.some((pl) => pl.cardId === id);
          const dp = (dragProps && !planned ? dragProps({ kind: 'card', cardId: id }) : {}) as { style?: React.CSSProperties };
          const dealt = dealtInfo(id);
          // The wrapper holds the fan pose (CSS variables) and is the pointer target; the child .card-lift does every lift,
          // so the hit box never moves under the pointer and a hovered card cannot slide out from under it.
          const style: React.CSSProperties = {
            ...(dp.style ?? {}),
            ...(dealt >= 0 ? { animationDelay: `${dealt * 140}ms` } : {}),
            ['--rot' as string]: `${rot}deg`,
            ['--ty' as string]: `${ty}px`,
            ['--z' as string]: i,
            marginLeft: i === 0 ? 0 : compact ? 'calc(var(--card-w) * -0.44)' : 'calc(var(--card-w) * -0.17)',
            position: 'relative',
          };
          const name = cardName(id, placeholders);
          return (
            <div
              key={`${id}-${i}`}
              data-hand-card={id}
              data-sfx="off"
              className={`card-wrap ${sel ? 'selected' : ''} ${planned ? 'planned' : ''} ${(Array.isArray(glow) ? glow.includes(id) : glow === id) ? 'ftue-flash' : ''} ${dealt >= 0 ? 'dealt' : ''} ${energyLeft !== undefined && cardCost(id, view, me) > energyLeft ? 'unaffordable' : ''} ${id === 'reparations' && view.players[me].setbacks > 0 ? 'reparations-live' : ''} ${held === id ? 'lifting' : ''} ${reject === id ? 'reject' : ''} ${canPlay && !canPlay(id) ? 'unplayable' : ''}`}
              {...dp}
              style={style}
              onPointerDownCapture={(e) => {
                lastPointer.current = e.pointerType;
              }}
              onClick={() => onTap(id)}
              onContextMenu={(e) => {
                // The native menu never shows on a hand card. A mouse right-click reads the card; a touch long-press is the hold timer's.
                e.preventDefault();
                if (lastPointer.current === 'mouse') onInspect(id);
              }}
              tabIndex={0}
              role="button"
              aria-pressed={sel}
              aria-label={`${name}, cost ${cardCost(id, view, me)}`}
              onKeyDown={(e) => {
                // Only the wrapper itself: Enter on the corner ⓘ must read the card, not put it down.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap(id);
                }
              }}
            >
              <div className="card-lift">
                <CardFace id={id} cost={cardCost(id, view, me)} costWhy={costBreakdown(view, me, id)}  note={id === 'reparations' && view.players[me].setbacks > 0 ? `${view.players[me].setbacks} Setback${view.players[me].setbacks === 1 ? '' : 's'}` : undefined} />
              </div>
            </div>
          );
        })}
        {n === 0 && <div className="muted">No cards in hand</div>}
      </div>
    </div>
  );
}
