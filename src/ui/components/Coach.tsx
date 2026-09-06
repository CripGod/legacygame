import { useEffect, useState } from 'react';
import type { GameState, PlayerId, TurnPlan } from '../../engine';
import { charsOf } from '../../engine';

const TIPS: { key: string; text: string; when: (v: GameState, me: PlayerId, plan: TurnPlan) => boolean }[] = [
  { key: 'first', text: 'Drag a card onto a Location to commit it (or tap the card, then the Location). All three Locations are hidden on Turn 1.', when: (v) => v.turn === 1 },
  { key: 'gates', text: 'Characters wait one turn at the Gates. Next turn they become Ready and may enter.', when: (v, me) => v.turn === 2 && charsOf(v, me).some((c) => c.zone === 'gate') },
  { key: 'enter', text: 'Drag a Ready Character from your Gates into the Location (or tap it and choose Enter). Entering is free.', when: (v, me) => charsOf(v, me).some((c) => c.zone === 'gate' && c.ready) },
  { key: 'influence', text: 'Control two of the three Locations at the end of the last turn to win.', when: (v) => v.turn === 3 },
  { key: 'move', text: 'Drag an Established Character to another Location to relocate it. Movement is a big part of this game.', when: (v, me) => charsOf(v, me).some((c) => c.zone === 'inside') },
  { key: 'threat', text: 'Threats are neutral dangers. Drag a Character onto one to confront it. Some affect both players.', when: (v) => v.locations.some((l) => l.threats.length > 0) },
  { key: 'stakes', text: 'Stand on Business doubles the Stakes and adds a tenth turn. Once you stand, you cannot Step Off.', when: (v) => v.turn >= 5 },
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
      <div className="coach guide">
        <span>{override}</span>
      </div>
    );
  }
  if (!enabled || !current) return null;
  const tip = TIPS.find((t) => t.key === current)!;
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
    <div className="coach">
      <span>{tip.text}</span>
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
