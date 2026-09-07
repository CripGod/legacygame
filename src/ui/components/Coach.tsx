import { useEffect, useState } from 'react';
import type { GameState, PlayerId, TurnPlan } from '../../engine';
import { charsOf } from '../../engine';

const TIPS: { key: string; text: string; when: (v: GameState, me: PlayerId, plan: TurnPlan) => boolean }[] = [
  { key: 'first', text: 'Drag a card onto a Location to commit it. All three Locations are hidden on Turn 1.', when: (v) => v.turn === 1 },
  { key: 'gates', text: 'Characters wait one turn at the Gates. Next turn they become Ready and may enter.', when: (v, me) => v.turn === 2 && charsOf(v, me).some((c) => c.zone === 'gate') },
  { key: 'enter', text: 'Drag a Ready Character from your Gates into the Location. Entering is free.', when: (v, me) => charsOf(v, me).some((c) => c.zone === 'gate' && c.ready) },
  { key: 'influence', text: 'Control two of the three Locations at the end of the last turn to win.', when: (v) => v.turn === 3 },
  { key: 'move', text: 'Drag a Character to another Location to relocate it. From the Gates it stays Ready; from Inside it arrives Fresh and waits again.', when: (v, me) => charsOf(v, me).length > 0 },
  { key: 'final', text: 'Final turn. After this the Locations are counted: win two of three. Commit everything that can enter, and remember Reveals resolve before entries.', when: (v) => v.turn >= v.maxTurns },
  { key: 'night', text: 'Night falls on even turns. Sundown Town locks everyone in until morning and a Curfew Threat holds a Location around the clock. Harriet Tubman is the only one who can get them out.', when: (v) => v.turn === 2 },
  { key: 'threat', text: 'Threats are neutral dangers. Drag a Character onto one to confront it. Some affect both players.', when: (v) => v.locations.some((l) => l.threats.length > 0) },
  { key: 'stakes', text: 'Stand on Business doubles the Legacy and adds an 8th turn. Once you stand, you cannot Sit Down.', when: (v) => v.turn >= 5 },
];

const KEY = 'bhcb.coach.v1';

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function Coach({ view, me, plan, enabled, onActive, override }: { view: GameState; me: PlayerId; plan: TurnPlan; enabled: boolean; onActive?: (key: string | null) => void; override?: string | null }) {
  const [done, setDone] = useState<Set<string>>(() => readDone());
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || current) return;
    const tip = TIPS.find((t) => !done.has(t.key) && t.when(view, me, plan));
    if (tip) setCurrent(tip.key);
  }, [view, me, plan, enabled, done, current]);
  useEffect(() => {
    onActive?.(enabled ? current : null);
  }, [current, enabled, onActive]);
  if (override) {
    return (
      <div className="coach guide" role="status">
        <span className="coach-icon" aria-hidden>
          💡
        </span>
        <div className="coach-body">
          <div className="coach-kicker">Coach · First turn</div>
          <span>{override}</span>
        </div>
      </div>
    );
  }
  if (!enabled || !current) return null;
  const tip = TIPS.find((t) => t.key === current)!;
  const step = TIPS.indexOf(tip) + 1;
  const dismiss = () => {
    const next = new Set(done);
    next.add(current);
    setDone(next);
    setCurrent(null);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="coach" role="status">
      <span className="coach-icon" aria-hidden>
        💡
      </span>
      <div className="coach-body">
        <div className="coach-kicker">
          Coach · Tip {step} of {TIPS.length}
        </div>
        <span>{tip.text}</span>
      </div>
      <button onClick={dismiss}>Got it</button>
    </div>
  );
}

export function resetCoach(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
