import { useEffect, useState } from 'react';
import type { GameState, PlayerId, TurnPlan, CharacterInstance } from '../../engine';
import { charsOf, charInfluence, influenceAt, other, threatForceNeeded, confrontForce, lockReason, LOCATION_BY_ID, THREAT_BY_ID, CARD_BY_ID, charDef, cardCost, legalOptions } from '../../engine';
import { cardName, locationName, threatLabel, useDisplay } from '../display';

/**
 * Coach tips name what is on the board right now: the piece, the Location and the number.
 * Each tip fires once (remembered on the device) and only while its situation is on screen.
 */
type Ctx = { v: GameState; me: PlayerId; plan: TurnPlan; nm: (id: string) => string; ln: (index: number) => string };

function myChars(c: Ctx): CharacterInstance[] {
  return charsOf(c.v, c.me);
}
function lead(c: Ctx, index: number): number {
  const inf = influenceAt(c.v, index);
  return inf[c.me] - inf[other(c.me)];
}
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const TIPS: { key: string; when: (c: Ctx) => string | null }[] = [
  {
    key: 'energy',
    when: (c) => {
      if (c.v.turn < 2) return null;
      const energy = legalOptions(c.v, c.me).energy;
      const hand = c.v.players[c.me].hand.filter((id) => CARD_BY_ID[id]).sort((a, b) => cardCost(a, c.v, c.me) - cardCost(b, c.v, c.me));
      const cheap = hand[0];
      const pricey = hand.find((id) => cardCost(id, c.v, c.me) > energy);
      return `You have ${energy} Energy this turn. Energy equals the turn number, so next turn brings ${c.v.turn + 1}. Every card costs Energy, the green circle in its corner${cheap ? `: ${c.nm(cheap)} costs ${cardCost(cheap, c.v, c.me)}` : ''}${pricey ? `, and ${c.nm(pricey)} (${cardCost(pricey, c.v, c.me)}) has to wait for a richer turn` : ''}.`;
    },
  },
  {
    key: 'enter',
    when: (c) => {
      const ready = myChars(c).find((x) => x.zone === 'gate' && x.ready && !c.plan.enters.includes(x.uid) && !lockReason(c.v, x));
      if (!ready) return null;
      const def = charDef(ready.defId);
      const why = def.established ? `Inside, ${c.nm(ready.defId)} becomes Established and the standing ability turns on: ${def.established.text}` : 'Entering is free, and Inside is where a Character is safe from what happens at the Gates.';
      return `${c.nm(ready.defId)} is Ready at the Gates of ${c.ln(ready.location)}. Drag the tile into the Location. ${why}`;
    },
  },
  {
    key: 'gates',
    when: (c) => {
      const fresh = myChars(c).find((x) => x.zone === 'gate' && !x.ready);
      if (!fresh || c.v.turn < 2) return null;
      return `${c.nm(fresh.defId)} waits at the Gates of ${c.ln(fresh.location)} this turn, still counting ${charInfluence(c.v, fresh)} Influence there. At the end of the turn the tile turns Ready, and next turn it can go Inside.`;
    },
  },
  {
    key: 'threat',
    when: (c) => {
      for (const loc of c.v.locations) {
        for (const t of loc.threats) {
          const tdef = THREAT_BY_ID[t.defId];
          const label = threatLabel(t.defId, false);
          if (tdef.requiresBoth) return `${label} at ${c.ln(loc.index)} only breaks if both players confront it in the same turn. Propose a Summon there, or drag a Character onto it and hope Harborlight does the same.`;
          const need = threatForceNeeded(c.v, t);
          const mine = myChars(c).filter((x) => x.location === loc.index && !c.plan.confronts.some((k) => k.uid === x.uid));
          const one = mine.find((x) => confrontForce(c.v, x, t) >= need);
          if (one) return `${label} at ${c.ln(loc.index)} needs ${need} Force. ${c.nm(one.defId)} (${confrontForce(c.v, one, t)}) can handle it alone: drag the tile onto the Threat.`;
          const total = mine.reduce((s, x) => s + confrontForce(c.v, x, t), 0);
          if (mine.length >= 2 && total >= need) return `${label} at ${c.ln(loc.index)} needs ${need} Force. Together ${joinNames(mine.map((x) => `${c.nm(x.defId)} (${confrontForce(c.v, x, t)})`))} have ${total}: drag each of them onto the Threat.`;
          if (mine.length) return `${label} at ${c.ln(loc.index)} needs ${need} Force; ${joinNames(mine.map((x) => `${c.nm(x.defId)} (${confrontForce(c.v, x, t)})`))} ${mine.length > 1 ? 'have' : 'has'} ${total}. Play a Character with more Force there, or let it stand and read what it does.`;
          return `${label} at ${c.ln(loc.index)} needs ${need} Force and you have nobody there. While it stands: ${tdef.text}`;
        }
      }
      return null;
    },
  },
  {
    key: 'move',
    when: (c) => {
      // A piece stuck where you are far behind, and a Location it would tie or take.
      let best: { ch: CharacterInstance; to: number; after: number } | null = null;
      for (const ch of myChars(c)) {
        if (lockReason(c.v, ch) || c.plan.relocations.some((m) => m.uid === ch.uid) || c.plan.enters.includes(ch.uid)) continue;
        const here = lead(c, ch.location);
        if (here > -3) continue;
        const inf = charInfluence(c.v, ch);
        for (const loc of c.v.locations) {
          if (loc.index === ch.location || !loc.revealed || loc.lost) continue;
          const after = lead(c, loc.index) + inf;
          if (after < 0) continue;
          if (!best || after > best.after) best = { ch, to: loc.index, after };
        }
      }
      if (!best) return null;
      const inf = influenceAt(c.v, best.ch.location);
      return `You trail ${inf[c.me]} to ${inf[other(c.me)]} at ${c.ln(best.ch.location)}. ${c.nm(best.ch.defId)}'s ${charInfluence(c.v, best.ch)} Influence would ${best.after === 0 ? 'tie' : 'take'} ${c.ln(best.to)}: drag the tile there. ${best.ch.zone === 'gate' ? 'From the Gates it stays Ready.' : 'From Inside it arrives Fresh and waits a turn.'}`;
    },
  },
  {
    key: 'influence',
    when: (c) => {
      if (c.v.turn < 3) return null;
      const revealed = c.v.locations.filter((l) => l.revealed && !l.lost);
      const ahead = revealed.filter((l) => lead(c, l.index) > 0).map((l) => c.ln(l.index));
      const close = revealed.filter((l) => lead(c, l.index) <= 0 && lead(c, l.index) >= -2).map((l) => c.ln(l.index));
      if (ahead.length >= 2) return `You lead at ${joinNames(ahead)}. Hold two of the three when the last turn ends and the match is yours.`;
      if (ahead.length === 1) return `You lead only at ${ahead[0]}. You need one more${close.length ? `; ${joinNames(close)} ${close.length > 1 ? 'are' : 'is'} within two Influence` : ''}.`;
      return `You lead nowhere yet${close.length ? `, but ${joinNames(close)} ${close.length > 1 ? 'are' : 'is'} within two Influence` : ''}. Pick the two Locations you can take and build them.`;
    },
  },
  {
    key: 'night',
    when: (c) => {
      const loc = c.v.locations.find((l) => l.revealed && LOCATION_BY_ID[l.defId]?.curfew);
      if (!loc) return null;
      const night = c.v.turn % 2 === 0;
      return `${c.ln(loc.index)} locks everyone in at night, and night falls on even turns${night ? ' (it is night now)' : ''}. Characters there cannot leave until morning; only Harriet Tubman can get someone out.`;
    },
  },
  {
    key: 'stakes',
    when: (c) => {
      if (c.v.turn < 5 || c.v.players[c.me].standUsed || c.plan.standOnBusiness) return null;
      const ahead = c.v.locations.filter((l) => l.revealed && !l.lost && lead(c, l.index) > 0);
      if (ahead.length < 2) return null;
      return `You lead ${ahead.length} of 3. Stand on Business doubles the Legacy and adds an 8th turn; Harborlight gets one turn to Sit Down at the old price. Once you stand, you cannot Sit Down.`;
    },
  },
  {
    key: 'final',
    when: (c) => {
      if (c.v.turn < c.v.maxTurns) return null;
      const ready = myChars(c).filter((x) => x.zone === 'gate' && x.ready && !lockReason(c.v, x)).map((x) => c.nm(x.defId));
      return `Last turn unless someone stands. Reveals resolve before entries, then the Locations are counted.${ready.length ? ` ${joinNames(ready)} ${ready.length > 1 ? 'are' : 'is'} Ready: send them Inside now.` : ''}`;
    },
  },
];

const KEY = 'bhcb.coach.v1';

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function Coach({ view, me, plan, enabled, onActive, override, overrideKicker }: { view: GameState; me: PlayerId; plan: TurnPlan; enabled: boolean; onActive?: (key: string | null) => void; override?: string | null; overrideKicker?: string }) {
  const { placeholders } = useDisplay();
  const [done, setDone] = useState<Set<string>>(() => readDone());
  const [current, setCurrent] = useState<string | null>(null);
  const ctx: Ctx = { v: view, me, plan, nm: (id) => cardName(id, placeholders), ln: (i) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`) };
  const text = current ? TIPS.find((t) => t.key === current)?.when(ctx) ?? null : null;
  useEffect(() => {
    if (!enabled) return;
    if (current && text === null) {
      // The situation passed before the player acted on it; the tip can come back later.
      setCurrent(null);
      return;
    }
    if (current) return;
    for (const t of TIPS) {
      if (done.has(t.key)) continue;
      if (t.when(ctx) !== null) {
        setCurrent(t.key);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, me, plan, enabled, done, current, text]);
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
          <div className="coach-kicker">{overrideKicker ?? 'Coach · First turn'}</div>
          <span>{override}</span>
        </div>
      </div>
    );
  }
  if (!enabled || !current || text === null) return null;
  const step = TIPS.findIndex((t) => t.key === current) + 1;
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
        <span>{text}</span>
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
