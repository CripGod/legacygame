import type { GameEvent } from '../../engine';

export function Feed({ events, index, onSkip }: { events: GameEvent[]; index: number; onSkip: () => void }) {
  if (!events.length) return null;
  const visible = events.slice(Math.max(0, index - 4), index);
  if (!visible.length) return null;
  return (
    <div className="feed">
      {visible.map((e, i) => (
        <div key={`${index}-${i}`} className={`line-item ${e.type}`}>
          {e.text}
        </div>
      ))}
      {index < events.length && (
        <button className="small ghost skip" onClick={onSkip}>
          Skip ▸
        </button>
      )}
    </div>
  );
}
