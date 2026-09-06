import { type GameState, type PlayerId, type TurnPlan } from '../../engine';
import { CardFace } from './CardFace';
import type { DragPayload } from '../drag';

export function Hand({
  view,
  me,
  plan,
  selected,
  onSelect,
  onInspect,
  compact,
  dragProps,
}: {
  view: GameState;
  me: PlayerId;
  plan: TurnPlan;
  selected: string | null;
  onSelect: (cardId: string) => void;
  onInspect: (cardId: string) => void;
  compact: boolean;
  dragProps?: (payload: DragPayload) => Record<string, unknown>;
}) {
  const hand = view.players[me].hand;
  const n = hand.length;
  const mid = (n - 1) / 2;
  return (
    <div className="hand-wrap">
      <div className="hand-label">Your hand ({n})</div>
      <div className="hand">
        {hand.map((id, i) => {
          const off = i - mid;
          const rot = compact ? off * 5 : 0;
          const ty = compact ? Math.abs(off) * Math.abs(off) * 2 : 0;
          const sel = selected === id;
          const planned = plan.play?.cardId === id;
          const dp = (dragProps && !planned ? dragProps({ kind: 'card', cardId: id }) : {}) as { style?: React.CSSProperties };
          const style: React.CSSProperties = {
            ...(dp.style ?? {}),
            transform: `rotate(${rot}deg) translateY(${sel ? -26 : ty}px) scale(${sel ? 1.08 : 1})`,
            marginLeft: i === 0 ? 0 : compact ? 'calc(var(--card-w) * -0.32)' : 6,
            zIndex: sel ? 10 : i,
            position: 'relative',
          };
          return (
            <div
              key={`${id}-${i}`}
              data-hand-card={id}
              className={`card-wrap ${sel ? 'selected' : ''} ${planned ? 'planned' : ''}`}
              {...dp}
              style={style}
              onClick={() => onSelect(id)}
              onDoubleClick={() => onInspect(id)}
            >
              <CardFace id={id} />
            </div>
          );
        })}
        {n === 0 && <div className="muted">No cards in hand</div>}
      </div>
    </div>
  );
}
