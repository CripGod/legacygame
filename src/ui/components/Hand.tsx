import { useEffect, useRef, useState } from 'react';
import { cardCost, costBreakdown, type GameState, type PlayerId, type TurnPlan } from '../../engine';
import { CardFace } from './CardFace';
import type { DragPayload } from '../drag';

/** First-seen times for hand cards in the current match. */
let DEALT: { seed: number; at: Map<string, { t: number; k: number }> } = { seed: NaN, at: new Map() };

export function Hand({
  view,
  me,
  plan,
  selected,
  onSelect,
  onInspect,
  compact,
  dragProps,
  rest,
  nudge,
  glow,
  energyLeft,
  dropState,
}: {
  view: GameState;
  me: PlayerId;
  plan: TurnPlan;
  selected: string | null;
  onSelect: (cardId: string) => void;
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
}) {
  const hand = view.players[me].hand;
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
  const visible = hand.filter((id) => !plan.plays.some((pl) => pl.cardId === id));
  const n = visible.length;
  const mid = (n - 1) / 2;
  return (
    <div className={`hand-wrap ${dropState === 'ok' ? 'drop-ok' : ''} ${dropState === 'over' ? 'drop-ok drop-over' : ''} ${rest ? 'rest' : ''} ${nudge ? 'nudge' : ''}`} data-drop="hand">
      <div className="hand">
        {visible.map((id, i) => {
          const off = i - mid;
          // A fanned hand: each card leans out from the centre and sits a little lower the farther out it is.
          const rot = off * (compact ? 5 : 4);
          const ty = Math.abs(off) * Math.abs(off) * (compact ? 2 : 3.5);
          const sel = selected === id;
          const planned = plan.plays.some((pl) => pl.cardId === id);
          const dp = (dragProps && !planned ? dragProps({ kind: 'card', cardId: id }) : {}) as { style?: React.CSSProperties };
          const dealt = dealtInfo(id);
          const style: React.CSSProperties = {
            ...(dp.style ?? {}),
            ...(dealt >= 0 ? { animationDelay: `${dealt * 140}ms` } : {}),
            transform: `rotate(${rot}deg) translateY(${sel ? -26 : ty}px) scale(${sel ? 1.08 : 1})`,
            marginLeft: i === 0 ? 0 : compact ? 'calc(var(--card-w) * -0.4)' : 'calc(var(--card-w) * -0.1)',
            zIndex: sel ? 10 : i,
            position: 'relative',
          };
          return (
            <div
              key={`${id}-${i}`}
              data-hand-card={id}
              className={`card-wrap ${sel ? 'selected' : ''} ${planned ? 'planned' : ''} ${(Array.isArray(glow) ? glow.includes(id) : glow === id) ? 'ftue-flash' : ''} ${dealt >= 0 ? 'dealt' : ''} ${energyLeft !== undefined && cardCost(id, view, me) > energyLeft ? 'unaffordable' : ''} ${id === 'reparations' && view.players[me].setbacks > 0 ? 'reparations-live' : ''}`}
              {...dp}
              style={style}
              onClick={() => onSelect(id)}
              onDoubleClick={() => onInspect(id)}
            >
              <CardFace id={id} cost={cardCost(id, view, me)} costWhy={costBreakdown(view, me, id)}  note={id === 'reparations' && view.players[me].setbacks > 0 ? `${view.players[me].setbacks} Setback${view.players[me].setbacks === 1 ? '' : 's'}` : undefined} />
            </div>
          );
        })}
        {n === 0 && <div className="muted">{hand.length ? 'Card committed' : 'No cards in hand'}</div>}
      </div>
    </div>
  );
}
