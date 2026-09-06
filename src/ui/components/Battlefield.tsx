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
import type { DragPayload } from '../drag';
import { useFlip } from '../flip';

export interface DropHighlight {
  locations: number[];
  inside: number[];
  threats: string[];
  overKey: string;
}

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
  dragProps?: (payload: DragPayload) => Record<string, unknown>;
  drop?: DropHighlight | null;
  /** Per-tile animation stagger (ms) for the latest resolution. */
  delays?: Record<string, number>;
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

type Common = Pick<BattlefieldProps, 'view' | 'me' | 'plan' | 'onChar' | 'flash' | 'dragProps' | 'drop'>;

function GateStrip({ view, owner, me, index, plan, onChar, label, right, flash, dragProps }: Common & { owner: PlayerId; index: number; label: string; right?: React.ReactNode }) {
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
                <div key={i} className={`gate-slot filled ghost owner-${owner}`} data-uid={`planned:${plan.play!.cardId}`}>
                  <PlannedPic cardId={plan.play!.cardId} />
                </div>
              );
            const entering = plan.enters.includes(s.uid);
            const confronting = plan.confronts.some((c) => c.uid === s.uid);
            const draggable = owner === me && dragProps ? dragProps({ kind: 'char', uid: s.uid }) : {};
            return (
              <div
                key={s.uid}
                data-uid={s.uid}
                className={`gate-slot filled owner-${owner} ${entering ? 'entering' : ''} ${flash === 'enter' && owner === me && s.ready && !entering ? 'ftue-flash' : ''}`}
                {...draggable}
              >
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

function InsideRow({ view, owner, me, index, plan, onChar, label, flash, dragProps, drop }: Common & { owner: PlayerId; index: number; label: string }) {
  const chars = charsAt(view, index, owner, 'inside').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const cap = insideCapacity(view, index);
  const mine = owner === me;
  const dropOk = mine && drop?.inside.includes(index);
  const dropOver = dropOk && drop?.overKey === `inside:${index}`;
  return (
    <>
      <div className="row-lbl">
        {label} ({chars.length}–{INSIDE_CAPACITY})
      </div>
      <div
        className={`slots ${cap < INSIDE_CAPACITY ? 'restricted' : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''}`}
        {...(mine ? { 'data-drop': 'inside', 'data-index': index } : {})}
      >
        {Array.from({ length: INSIDE_CAPACITY }).map((_, i) => {
          const c = chars[i];
          if (!c) return <div key={i} className={`slot ${i >= cap ? 'locked' : ''}`} />;
          const relocating = plan.relocations.some((r) => r.uid === c.uid);
          const confronting = plan.confronts.some((x) => x.uid === c.uid);
          const draggable = mine && dragProps ? dragProps({ kind: 'char', uid: c.uid }) : {};
          return (
            <div key={c.uid} data-uid={c.uid} className={`slot filled ${c.owner} ${flash === 'move' && mine && !relocating ? 'ftue-flash' : ''}`} {...draggable}>
              <Pic state={view} c={c} highlight={relocating || confronting} strip={relocating ? 'Moving' : confronting ? 'Confront' : undefined} onClick={() => onChar(c.uid)} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Battlefield(props: BattlefieldProps) {
  const { view, me, plan, targetable, onLocationTap, onLocationInfo, onChar, onThreat, flash, dragProps, drop, delays } = props;
  const { placeholders } = useDisplay();
  const opp = other(me);
  const rootRef = useRef<HTMLDivElement>(null);
  useFlip(rootRef, {
    version: view,
    delayFor: (uid) => delays?.[uid] ?? 0,
    originFor: (uid, prev) => {
      if (uid.startsWith('planned:')) {
        const cardId = uid.slice('planned:'.length);
        return document.querySelector(`[data-hand-card="${cardId}"]`)?.getBoundingClientRect() ?? null;
      }
      const c = view.characters[uid];
      if (!c) return null;
      if (c.owner === me) {
        const ghost = prev.get(`planned:${c.defId}`);
        if (ghost) return ghost;
      }
      return document.querySelector(`[data-avatar="${c.owner}"]`)?.getBoundingClientRect() ?? null;
    },
  });
  const common: Common = { view, me, plan, onChar, flash, dragProps, drop };
  return (
    <div className="battlefield" ref={rootRef}>
      {view.locations.map((loc) => {
        const def = locDef(view, loc.index);
        const inf = influenceAt(view, loc.index);
        const ended = view.phase === 'ended' && view.result;
        const winner = ended ? view.result!.locationWinners[loc.index] : null;
        const lead = inf.A === inf.B ? null : inf.A > inf.B ? 'A' : 'B';
        const total = inf.A + inf.B;
        const fracA = total === 0 ? 0.5 : inf.A / total;
        const isTarget = targetable.includes(loc.index);
        const dropOk = drop?.locations.includes(loc.index);
        const dropOver = dropOk && drop?.overKey === `location:${loc.index}`;
        const cls = ['location', loc.revealed ? '' : 'hidden-loc', loc.lost ? 'lost' : '', lead ? `lead-${lead}` : '', winner && winner !== 'lost' ? `won-${winner}` : ''].join(' ');
        const title = loc.revealed ? (
          <div className="who">{locationName(loc.defId, placeholders)}</div>
        ) : (
          <div className="pill hidden-pill">
            <span aria-hidden>◌</span> Hidden Location
          </div>
        );
        return (
          <div
            key={loc.index}
            className={`column ${isTarget ? `targetable for-${me}` : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''}`}
            data-drop="location"
            data-index={loc.index}
            onClick={isTarget ? () => onLocationTap(loc.index) : undefined}
          >
            <GateStrip {...common} owner={opp} index={loc.index} label="Opponent Gates" right={title} />
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
              <InsideRow {...common} owner={opp} index={loc.index} label="Opponent Characters" />
              <div className="influence">
                <Score p="A" value={inf.A} />
                <div className={`line ${winner && winner !== 'lost' ? `won-${winner}` : ''}`} {...tip(HINTS.line)}>
                  <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                  <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                  <div className="mark" style={{ left: `${fracA * 100}%` }} />
                </div>
                <Score p="B" value={inf.B} />
              </div>
              <InsideRow {...common} owner={me} index={loc.index} label="Your Characters" />
              <div className="threats">
                {loc.threats.map((t) => {
                  const tdef = THREAT_BY_ID[t.defId];
                  const confronting = plan.confronts.some((c) => c.threatUid === t.uid);
                  const tOk = drop?.threats.includes(t.uid);
                  const tOver = tOk && drop?.overKey === `threat:${t.uid}`;
                  return (
                    <div
                      key={t.uid}
                      data-drop="threat"
                      data-threat={t.uid}
                      className={`threat ${confronting ? 'confronting' : ''} ${flash === 'threat' ? 'ftue-flash' : ''} ${tOk ? 'drop-ok' : ''} ${tOver ? 'drop-over' : ''}`}
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
            <GateStrip {...common} owner={me} index={loc.index} label="Your Gates" />
          </div>
        );
      })}
    </div>
  );
}
