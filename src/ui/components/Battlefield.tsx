import { useEffect, useRef, useState } from 'react';
import {
  charsAt,
  influenceAt,
  insideCapacity,
  locDef,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type CharacterInstance,
  other,
  GATE_CAPACITY,
  INSIDE_CAPACITY,
  THREAT_BY_ID,
  CARD_BY_ID,
} from '../../engine';
import { locationName, threatLabel, useDisplay } from '../display';
import { Pic, PlannedPic } from './CardFace';
import { tip, HINTS } from '../tip';

export interface BattlefieldProps {
  view: GameState;
  me: PlayerId;
  plan: TurnPlan;
  targetable: number[];
  onLocationTap: (index: number) => void;
  onLocationInfo: (index: number) => void;
  onChar: (uid: string) => void;
  onThreat: (uid: string) => void;
  locked: boolean;
  /** Active first-match coach tip; matching elements pulse. */
  flash?: string | null;
}

function useBump(value: number): boolean {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setBump(true);
      const id = setTimeout(() => setBump(false), 500);
      return () => clearTimeout(id);
    }
  }, [value]);
  return bump;
}

function Score({ p, value }: { p: PlayerId; value: number }) {
  const bump = useBump(value);
  return (
    <div className={`score p${p} ${bump ? 'bump' : ''}`} {...tip(p === 'A' ? HINTS.scoreA : HINTS.scoreB)}>
      {value}
    </div>
  );
}

function GateStrip({ view, owner, me, index, plan, onChar, label, right, flash }: { view: GameState; owner: PlayerId; me: PlayerId; index: number; plan: TurnPlan; onChar: (uid: string) => void; label: string; right?: React.ReactNode; flash?: string | null }) {
  const chars = charsAt(view, index, owner, 'gate').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const slots: (CharacterInstance | 'planned' | null)[] = [...chars];
  const planned = owner === me && plan.play && plan.play.location === index && CARD_BY_ID[plan.play.cardId]?.kind === 'character';
  if (planned && slots.length < GATE_CAPACITY) slots.push('planned');
  while (slots.length < GATE_CAPACITY) slots.push(null);
  return (
    <div className="gates-strip">
      <div className="gates-left">
        <div className="lbl">
          {label} ({GATE_CAPACITY})
        </div>
        <div className="gates">
          {slots.map((s, i) => {
            if (s === null)
              return (
                <div key={i} className="gate-slot">
                  +
                </div>
              );
            if (s === 'planned')
              return (
                <div key={i} className={`gate-slot filled ghost owner-${owner}`}>
                  <PlannedPic cardId={plan.play!.cardId} />
                </div>
              );
            const entering = plan.enters.includes(s.uid);
            const confronting = plan.confronts.some((c) => c.uid === s.uid);
            return (
              <div key={s.uid} className={`gate-slot filled owner-${owner} ${entering ? 'entering' : ''} ${flash === 'enter' && owner === me && s.ready && !entering ? 'ftue-flash' : ''}`}>
                <Pic state={view} c={s} strip={entering ? 'Entering' : confronting ? 'Confront' : undefined} onClick={() => onChar(s.uid)} />
              </div>
            );
          })}
        </div>
      </div>
      {right}
    </div>
  );
}

function InsideRow({ view, owner, index, plan, onChar, label, flash }: { view: GameState; owner: PlayerId; index: number; plan: TurnPlan; onChar: (uid: string) => void; label: string; flash?: boolean }) {
  const chars = charsAt(view, index, owner, 'inside').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const cap = insideCapacity(view, index);
  return (
    <>
      <div className="row-lbl">
        {label} ({chars.length}–{INSIDE_CAPACITY})
      </div>
      <div className={`slots ${cap < INSIDE_CAPACITY ? 'restricted' : ''}`}>
        {Array.from({ length: INSIDE_CAPACITY }).map((_, i) => {
          const c = chars[i];
          if (!c) return <div key={i} className={`slot ${i >= cap ? 'locked' : ''}`} />;
          const relocating = plan.relocations.some((r) => r.uid === c.uid);
          const confronting = plan.confronts.some((x) => x.uid === c.uid);
          return (
            <div key={c.uid} className={`slot filled ${c.owner} ${flash && !relocating ? 'ftue-flash' : ''}`}>
              <Pic state={view} c={c} highlight={relocating || confronting} strip={relocating ? 'Moving' : confronting ? 'Confront' : undefined} onClick={() => onChar(c.uid)} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Battlefield(props: BattlefieldProps) {
  const { view, me, plan, targetable, onLocationTap, onLocationInfo, onChar, onThreat, flash } = props;
  const { placeholders } = useDisplay();
  const opp = other(me);
  return (
    <div className="battlefield">
      {view.locations.map((loc) => {
        const def = locDef(view, loc.index);
        const inf = influenceAt(view, loc.index);
        const ended = view.phase === 'ended' && view.result;
        const winner = ended ? view.result!.locationWinners[loc.index] : null;
        const lead = inf.A === inf.B ? null : inf.A > inf.B ? 'A' : 'B';
        const total = inf.A + inf.B;
        const fracA = total === 0 ? 0.5 : inf.A / total;
        const isTarget = targetable.includes(loc.index);
        const cls = ['location', loc.revealed ? '' : 'hidden-loc', loc.lost ? 'lost' : '', lead ? `lead-${lead}` : '', winner && winner !== 'lost' ? `won-${winner}` : ''].join(' ');
        const title = loc.revealed ? (
          <div className="who">{locationName(loc.defId, placeholders)}</div>
        ) : (
          <div className="pill hidden-pill">
            <span aria-hidden>◌</span> Hidden Location
          </div>
        );
        return (
          <div key={loc.index} className={`column ${isTarget ? `targetable for-${me}` : ''}`} onClick={isTarget ? () => onLocationTap(loc.index) : undefined}>
            <GateStrip view={view} owner={opp} me={me} index={loc.index} plan={plan} onChar={onChar} label="Opponent Gates" right={title} flash={flash} />
            <div className={cls}>
              <div
                key={loc.revealed ? 'r' : 'h'}
                className={`art ${loc.revealed ? 'reveal-anim' : 'hidden-art'}`}
                style={loc.revealed ? { background: `linear-gradient(135deg, hsl(${(loc.defId.length * 47) % 360} 30% 24%), hsl(${(loc.defId.length * 47 + 60) % 360} 30% 14%))` } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onLocationInfo(loc.index);
                }}
              >
                {loc.revealed ? locationName(loc.defId, placeholders) : '?'}
                {loc.revealed && !placeholders && <span className="era-tag">{def.era}</span>}
                {loc.lost && <span className="lost-tag">LOST</span>}
              </div>
              <InsideRow view={view} owner={opp} index={loc.index} plan={plan} onChar={onChar} label="Opponent Characters" />
              <div className="influence">
                <Score p="A" value={inf.A} />
                <div className={`line ${winner && winner !== 'lost' ? `won-${winner}` : ''}`} {...tip(HINTS.line)}>
                  <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                  <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                  <div className="mark" style={{ left: `${fracA * 100}%` }} />
                </div>
                <Score p="B" value={inf.B} />
              </div>
              <InsideRow view={view} owner={me} index={loc.index} plan={plan} onChar={onChar} label="Your Characters" flash={flash === 'move'} />
              <div className="threats">
                {loc.threats.map((t) => {
                  const tdef = THREAT_BY_ID[t.defId];
                  const confronting = plan.confronts.some((c) => c.threatUid === t.uid);
                  return (
                    <div
                      key={t.uid}
                      className={`threat ${confronting ? 'confronting' : ''} ${flash === 'threat' ? 'ftue-flash' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onThreat(t.uid);
                      }}
                    >
                      <span>
                        ⚠ {threatLabel(t.defId, placeholders)}
                        {tdef.split && t.target ? ` · ${t.target === me ? 'yours' : 'theirs'}` : ''}
                      </span>
                      <b>{tdef.requiresBoth ? 'both' : t.forceRequired}</b>
                    </div>
                  );
                })}
              </div>
              <div
                className="loc-rule"
                onClick={(e) => {
                  e.stopPropagation();
                  onLocationInfo(loc.index);
                }}
              >
                {loc.revealed ? def.rule : 'Hidden until revealed. Commit blind.'}
              </div>
            </div>
            <GateStrip view={view} owner={me} me={me} index={loc.index} plan={plan} onChar={onChar} label="Your Gates" flash={flash} />
          </div>
        );
      })}
    </div>
  );
}
