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
} from '../../engine';
import { locationName, threatLabel, useDisplay } from '../display';
import { Pic } from './CardFace';
import { Art } from './Art';
import { charDef, confrontForce, threatForceNeeded, isNight, lockReason, threatActiveFor, LOCATION_BY_ID } from '../../engine';

/** A Location where nobody relocates out right now: curfew at night, or a Curfew Threat. */
function curfewOn(view: GameState, index: number): boolean {
  const loc = view.locations[index];
  if (!loc.revealed) return false;
  if (LOCATION_BY_ID[loc.defId]?.curfew && isNight(view)) return true;
  return threatActiveFor(view, index, 'curfew', 'A') || threatActiveFor(view, index, 'curfew', 'B');
}
import { isPlannedUid, PLANNED_PREFIX } from '../preview';
import { tip, HINTS } from '../tip';
import type { DragPayload } from '../drag';
import { useFlip } from '../flip';

export interface DropHighlight {
  locations: number[];
  inside: number[];
  gates: number[];
  threats: string[];
  hand: boolean;
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
  /** Gate slots still occupied until the turn resolves, keyed by Location: Characters leaving the Gates this turn. */
  reserved?: Record<number, { uid: string; defId: string; why: string }[]>;
  /** True while the opponent's resolution is animating: the player's own tiles snap. */
  resolving?: boolean;
  /** First-turn guide: Location to glow. */
  glowLocation?: number | null;
  /** Joint Summon status label per Location. */
  summonLabel?: (index: number) => string | null;
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

type Common = Pick<BattlefieldProps, 'view' | 'me' | 'plan' | 'onChar' | 'flash' | 'dragProps' | 'drop' | 'reserved'>;

function GateStrip({ view, owner, me, index, plan, onChar, label, right, flash, dragProps, drop, reserved }: Common & { owner: PlayerId; index: number; label: string; right?: React.ReactNode }) {
  const gOk = owner === me && drop?.gates.includes(index);
  const gOver = gOk && drop?.overKey === `gates:${index}`;
  const chars = charsAt(view, index, owner, 'gate').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const held = owner === me ? reserved?.[index] ?? [] : [];
  const slots: (CharacterInstance | { held: { uid: string; defId: string; why: string } } | null)[] = [...chars, ...held.map((h) => ({ held: h }))];
  while (slots.length < GATE_CAPACITY) slots.push(null);
  return (
    <div className="gates-strip">
      <div className={`gates-left ${gOk ? 'drop-ok' : ''} ${gOver ? 'drop-over' : ''}`} {...(owner === me ? { 'data-drop': 'gates', 'data-index': index } : {})}>
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
            if ('held' in s) {
              // Reserved: the Character has left in the preview but still holds this slot until the turn resolves.
              const hd = charDef(s.held.defId);
              return (
                <div key={`held:${s.held.uid}`} className="gate-slot reserved" data-reserved={s.held.uid} onClick={() => onChar(s.held.uid)} {...tip(`${hd.name} ${s.held.why} when you Lock It In. The slot stays taken until then.`)}>
                  <Art kind="characters" id={s.held.defId} className="pic-img" fallback={<span className="ini">{hd.name.slice(0, 2)}</span>} alt="" />
                  <span className="strip leaving">Leaving</span>
                </div>
              );
            }
            const planned = isPlannedUid(s.uid);
            const moving = plan.relocations.some((r) => r.uid === s.uid) || plan.plays.some((pl) => pl.target?.charUid === s.uid);
            const confronting = plan.confronts.some((c) => c.uid === s.uid);
            const draggable =
              owner === me && dragProps ? dragProps(planned ? { kind: 'card', cardId: s.uid.slice(PLANNED_PREFIX.length) } : { kind: 'char', uid: s.uid }) : {};
            return (
              <div
                key={s.uid}
                data-uid={s.uid}
                data-place={`${index}:gate`}
                className={`gate-slot filled owner-${owner} ${planned || moving ? 'preview' : ''} ${flash === 'enter' && owner === me && s.ready ? 'ftue-flash' : ''}`}
                {...draggable}
              >
                <Pic state={view} c={s} badges strip={planned ? 'Planned' : moving ? 'Moving' : confronting ? 'Confront' : !isPlannedUid(s.uid) && lockReason(view, s) ? 'Held' : undefined} onClick={() => onChar(s.uid)} />
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
          const entering = plan.enters.includes(c.uid);
          const brought = plan.plays.some((pl) => pl.target?.charUid === c.uid);
          const planned = isPlannedUid(c.uid);
          const confronting = plan.confronts.some((x) => x.uid === c.uid);
          const draggable =
            mine && dragProps ? dragProps(planned ? { kind: 'card', cardId: c.uid.slice(PLANNED_PREFIX.length) } : { kind: 'char', uid: c.uid }) : {};
          return (
            <div key={c.uid} data-uid={c.uid} data-place={`${index}:inside`} className={`slot filled ${c.owner} ${entering || planned || brought ? 'preview' : ''} ${flash === 'move' && mine && !entering && !planned ? 'ftue-flash' : ''}`} {...draggable}>
              <Pic state={view} c={c} highlight={confronting} strip={entering ? 'Entering' : brought ? 'Moving' : planned ? 'Planned' : confronting ? 'Confront' : lockReason(view, c) ? 'Held' : undefined} onClick={() => onChar(c.uid)} />
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Established abilities live at a Location: a count per player; tap for the full list. */
function InEffect({ view, index, me, onOpen }: { view: GameState; index: number; me: PlayerId; onOpen: () => void }) {
  const counts = (['A', 'B'] as PlayerId[]).map((p) => ({ p, n: liveAbilities(view, index, p).length }));
  const total = counts.reduce((s, c) => s + c.n, 0);
  if (!total) return <div className="in-effect empty" />;
  return (
    <div className="in-effect">
      <button
        className="fx-chip"
        title="Abilities in effect here (tap for details)"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <span aria-hidden>✦</span>
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <span key={c.p} className={`p${c.p}`}>
              {c.p === me ? 'You' : view.players[c.p].handle} {c.n}
            </span>
          ))}
        <span className="muted">in effect ›</span>
      </button>
    </div>
  );
}

/** Established abilities currently active for one player at a Location (suppressed ones excluded). */
export function liveAbilities(view: GameState, index: number, p: PlayerId): { uid: string; defId: string; text: string; short: string }[] {
  return charsAt(view, index, p, 'inside')
    .filter((c) => charDef(c.defId).established && !(c.suppressedUntilTurn !== undefined && c.suppressedUntilTurn >= view.turn))
    .map((c) => ({ uid: c.uid, defId: c.defId, text: charDef(c.defId).established!.text, short: shortEffect(charDef(c.defId).established!.effect.type) }));
}

function shortEffect(type: string): string {
  const map: Record<string, string> = {
    readyRelocatedIn: 'arrivals Ready',
    auraInfluenceOthersHere: '+1 Influence to others',
    assistForceBonus: '+1 Force when assisting',
    relocatedNoDisplace: 'relocated are safe',
    blessNextEstablished: '+1 to next arrival',
    gateInfluenceHere: '+1 to Gate Characters',
    extraRelocation: '+1 Relocation',
    extraPlay: '+1 card play',
    opposingGateInfluence: '−1 to enemy Gates',
    influenceOnThreatCleared: '+2 when a Threat falls',
    forceAuraHere: '+1 Force here',
    noDisplaceHere: 'cannot be displaced',
    relocatedOutReady: 'leave Ready',
    relocatedOutInside: 'leave straight Inside',
    noBlockHere: 'cannot be blocked',
    noSuppressHere: 'cannot be Suppressed',
    drawOnOpposingPlay: 'draw when they play here',
    confrontForceHere: '+2 Force vs Threats',
    freshReadyHere: 'arrivals Ready at turn end',
    relocatedInInside: 'relocations arrive Inside',
    weakenThreatsHere: 'Threats need 1 less',
    sanctuary: 'sanctuary from Threats',
    freeDeparture: 'leaving is free',
    allyBonus: '+1 with company',
    cookout: 'everybody eats',
  };
  return map[type] ?? type;
}

export function Battlefield(props: BattlefieldProps) {
  const { view, me, plan, targetable, onLocationTap, onLocationInfo, onChar, onThreat, flash, dragProps, drop, delays, resolving, glowLocation, summonLabel, reserved } = props;
  const { placeholders } = useDisplay();
  const opp = other(me);
  const rootRef = useRef<HTMLDivElement>(null);
  useFlip(rootRef, {
    version: view,
    delayFor: (uid) => delays?.[uid] ?? 0,
    // Your own moves snap quickly; the opponent's resolution moves glide.
    durationFor: (uid) => (view.characters[uid]?.owner === me || isPlannedUid(uid) ? (resolving ? 0 : 220) : 620),
  });
  const common: Common = { view, me, plan, onChar, flash, dragProps, drop, reserved };
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
        const hasCurfew = loc.revealed && !!LOCATION_BY_ID[loc.defId]?.curfew;
        const nightHere = hasCurfew && isNight(view);
        const state = [loc.lost ? 'lost' : '', loc.sanctified ? 'sanctified' : '', lead ? `lead-${lead}` : '', winner && winner !== 'lost' ? `won-${winner}` : '', nightHere ? 'night' : '', !loc.lost && curfewOn(view, loc.index) ? 'curfew' : ''].join(' ');
        const cls = ['location', loc.revealed ? '' : 'hidden-loc', state].join(' ');
        const summon = summonLabel?.(loc.index);
        const title = loc.revealed ? (
          <div className="who">{locationName(loc.defId, placeholders)}</div>
        ) : (
          <div className="who hidden-title" aria-hidden>
            &nbsp;
          </div>
        );
        return (
          <div
            key={loc.index}
            className={`column ${isTarget ? `targetable for-${me}` : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''} ${glowLocation === loc.index ? 'ftue-flash' : ''}`}
            data-drop="location"
            data-index={loc.index}
            onClick={isTarget ? () => onLocationTap(loc.index) : undefined}
          >
            <GateStrip {...common} owner={opp} index={loc.index} label="Opponent Gates" right={title} />
            <div className={`loc-glow ${state}`}>
            <div className={cls}>
              {loc.revealed && !placeholders && (
                <div className="loc-bg" aria-hidden>
                  {nightHere ? (
                    <Art kind="locations" id={`${loc.defId}_night`} className="loc-bg-img" fallback={<Art kind="locations" id={loc.defId} className="loc-bg-img" fallback={null} alt="" />} alt="" />
                  ) : (
                    <Art kind="locations" id={loc.defId} className="loc-bg-img" fallback={null} alt="" />
                  )}
                </div>
              )}
              <div
                key={loc.revealed ? 'r' : 'h'}
                className={`art ${loc.revealed ? 'reveal-anim' : 'hidden-art'}`}
                style={loc.revealed ? { background: `linear-gradient(135deg, hsl(${(loc.defId.length * 47) % 360} 30% 24%), hsl(${(loc.defId.length * 47 + 60) % 360} 30% 14%))` } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onLocationInfo(loc.index);
                }}
              >
                <span className="art-name">{loc.revealed ? locationName(loc.defId, placeholders) : '?'}</span>
                {loc.revealed && def.transformsInto && loc.revealedTurn !== undefined && (
                  <span className="sail-tag" {...tip(`${def.name} arrives in ${Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)} turn(s): everyone aboard gains +1 Influence and Gate Characters walk straight in.`)}>
                    ⛵ arrives in {Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)}
                  </span>
                )}
                {loc.revealed && !placeholders && <span className="era-tag">{def.era}</span>}
                {loc.lost && <span className="lost-tag">LOST</span>}
                {!loc.lost && loc.revealed && curfewOn(view, loc.index) && <span className="lost-tag curfew" {...tip(HINTS.locked)}>CURFEW</span>}
                {!loc.lost && hasCurfew && !curfewOn(view, loc.index) && <span className="lost-tag daytag" {...tip(HINTS.dayNight)}>☀ DAY</span>}
                {!loc.lost && nightHere && <span className="lost-tag nighttag" {...tip(HINTS.dayNight)}>🌙 NIGHT</span>}
                {loc.sanctified && <span className="lost-tag sanct">OBATALA</span>}
                {summon && <span className="summon-tag">{summon}</span>}
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
                  const committed = plan.confronts
                    .filter((c) => c.threatUid === t.uid)
                    .map((c) => view.characters[c.uid])
                    .filter((c): c is CharacterInstance => !!c)
                    .reduce((s, c) => s + confrontForce(view, c, t), 0);
                  const need = threatForceNeeded(view, t);
                  const armed = !tdef.requiresBoth && committed >= need;
                  const tOk = drop?.threats.includes(t.uid);
                  const tOver = tOk && drop?.overKey === `threat:${t.uid}`;
                  return (
                    <div
                      key={t.uid}
                      data-drop="threat"
                      data-threat={t.uid}
                      className={`threat ${confronting ? 'confronting' : ''} ${armed ? 'armed' : ''} ${flash === 'threat' ? 'ftue-flash' : ''} ${tOk ? 'drop-ok' : ''} ${tOver ? 'drop-over' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onThreat(t.uid);
                      }}
                    >
                      {!placeholders && <Art kind="threats" id={t.defId} className="threat-thumb" fallback={null} alt="" />}
                      <span>
                        ⚠ {threatLabel(t.defId, placeholders)}
                        {tdef.split && t.target ? ` · ${t.target === me ? 'yours' : 'theirs'}` : ' · in the area'}
                      </span>
                      <b>{tdef.requiresBoth ? 'both' : committed > 0 ? `${committed}/${need}` : need}</b>
                    </div>
                  );
                })}
              </div>
              <InEffect view={view} index={loc.index} me={me} onOpen={() => onLocationInfo(loc.index)} />
              <div
                className="loc-rule"
                onClick={(e) => {
                  e.stopPropagation();
                  onLocationInfo(loc.index);
                }}
              >
                {loc.lost ? `LOST: ${loc.lostReason ?? 'an unresolved crisis'} Neither player can win here.` : loc.revealed ? def.rule : 'Hidden until revealed. Commit blind.'}
              </div>
            </div>
            </div>
            <GateStrip {...common} owner={me} index={loc.index} label="Your Gates" />
          </div>
        );
      })}
    </div>
  );
}
