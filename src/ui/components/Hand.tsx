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
  glow,
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
  glow?: string | null;
  dropState?: 'ok' | 'over' | null;
}) {
  const hand = view.players[me].hand;
  const visible = hand.filter((id) => !plan.plays.some((pl) => pl.cardId === id));
  const n = visible.length;
  const mid = (n - 1) / 2;
  return (
    <div className={`hand-wrap ${dropState === 'ok' ? 'drop-ok' : ''} ${dropState === 'over' ? 'drop-ok drop-over' : ''}`} data-drop="hand">
      <div className="hand">
        {visible.map((id, i) => {
          const off = i - mid;
          const rot = compact ? off * 5 : 0;
          const ty = compact ? Math.abs(off) * Math.abs(off) * 2 : 0;
          const sel = selected === id;
          const planned = plan.plays.some((pl) => pl.cardId === id);
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
              className={`card-wrap ${sel ? 'selected' : ''} ${planned ? 'planned' : ''} ${glow === id ? 'ftue-flash' : ''}`}
              {...dp}
              style={style}
              onClick={() => onSelect(id)}
              onDoubleClick={() => onInspect(id)}
            >
              <CardFace id={id} />
            </div>
          );
        })}
        {n === 0 && <div className="muted">{hand.length ? 'Card committed' : 'No cards in hand'}</div>}
      </div>
    </div>
  );
}
