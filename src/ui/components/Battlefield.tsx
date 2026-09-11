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
  type ThreatInstance,
  other,
  GATE_CAPACITY,
  INSIDE_CAPACITY,
  THREAT_BY_ID,
} from '../../engine';
import { initials, locationName, threatLabel, useDisplay } from '../display';
import { Pic } from './CardFace';
import { Art } from './Art';
import { charDef, confrontForce, threatForceNeeded, isNight, lockReason, LOCATION_BY_ID, CARD_BY_ID } from '../../engine';

/** A Location under curfew right now: a curfew Location at night. */
function curfewOn(view: GameState, index: number): boolean {
  const loc = view.locations[index];
  return loc.revealed && !!LOCATION_BY_ID[loc.defId]?.curfew && isNight(view);
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
  /** A clash on this beat: who struck and who was knocked away. */
  fx?: { actor?: string; victim: string; outcome?: string; kind?: 'hit' | 'banish'; dx?: number; dy?: number; toName?: string } | null;
  /** Gate slots still occupied until the turn resolves, keyed by Location: Characters leaving the Gates this turn. */
  /** Pieces leaving a Location in the preview: ghosted at their old place with an arrow toward where they go. */
  reserved?: Record<number, { uid: string; defId: string; why: string; zone: 'gate' | 'inside'; dir: 'left' | 'right' | 'up' }[]>;

  /** Replay: the pieces this beat is about. */
  focus?: string[];
  /** Replay: an Event card resolving right now, flaring at its Gates. */
  eventFx?: { cardId: string; owner: PlayerId; location: number };
  /** Replay: Event cards played this turn that have not resolved yet; they wait at the Gates. */
  pendingEvents?: { cardId: string; player: PlayerId; location: number }[];
  /** Threats neutralized on this replay beat: they linger with a stamp before they go. */
  neutralized?: { uid: string; defId: string; location: number; target?: PlayerId }[];
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

type Common = Pick<BattlefieldProps, 'view' | 'me' | 'plan' | 'onChar' | 'flash' | 'dragProps' | 'drop' | 'reserved' | 'focus' | 'eventFx' | 'pendingEvents' | 'fx'>;

/** An Event card sitting at the Gates: planned, waiting to resolve, or resolving now. */
function EventTile({ cardId, state, hidden, onClick }: { cardId: string; state: 'planned' | 'pending' | 'trigger'; hidden?: boolean; onClick?: () => void }) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[cardId] as { name: string; curse?: boolean } | undefined;
  if (!def) return null;
  if (hidden) {
    // The opponent's Event waits face-down until its beat, Snap-style.
    return (
      <div className="gate-slot event-slot pending facedown" {...tip('The opponent played an Event here. It flips when it resolves.')}>
        <span className="ini">?</span>
        <span className="strip event">Event</span>
      </div>
    );
  }
  return (
    <div className={`gate-slot event-slot ${state} ${def.curse ? 'curse' : ''}`} onClick={onClick} {...tip(state === 'planned' ? `${def.name} is planned here. It resolves when you Lock In and needs this open Gate slot.` : state === 'pending' ? `${def.name} waits to resolve.` : `${def.name} resolves.`)}>
      {placeholders ? <span className="ini">{initials(cardId, true)}</span> : <Art kind="events" id={cardId} className="pic-img" fallback={<span className="ini">{initials(cardId, false)}</span>} alt={def.name} />}
      <span className={`strip ${def.curse ? 'curse' : 'event'}`}>{state === 'trigger' ? '✦' : def.curse ? 'Curse' : 'Event'}</span>
    </div>
  );
}

function GateStrip({ view, owner, me, index, plan, onChar, label, right, flash, dragProps, drop, reserved, focus, eventFx, pendingEvents, fx }: Common & { owner: PlayerId; index: number; label: string; right?: React.ReactNode }) {
  const gOk = owner === me && drop?.gates.includes(index);
  const gOver = gOk && drop?.overKey === `gates:${index}`;
  const chars = charsAt(view, index, owner, 'gate').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const held = owner === me ? (reserved?.[index] ?? []).filter((h) => h.zone === 'gate') : [];
  const slots: (CharacterInstance | { held: { uid: string; defId: string; why: string; dir: 'left' | 'right' | 'up' } } | null)[] = [...chars, ...held.map((h) => ({ held: h }))];
  while (slots.length < GATE_CAPACITY) slots.push(null);
  // Event cards at these Gates: planned by me, or (in a replay) waiting to resolve or resolving now.
  const eventTiles: { cardId: string; state: 'planned' | 'pending' | 'trigger'; hidden?: boolean }[] = [];
  if (owner === me) for (const pl of plan.plays) if (pl.location === index && CARD_BY_ID[pl.cardId]?.kind === 'event') eventTiles.push({ cardId: pl.cardId, state: 'planned' });
  for (const pe of pendingEvents ?? []) if (pe.player === owner && pe.location === index) eventTiles.push({ cardId: pe.cardId, state: 'pending', hidden: owner !== me });
  if (eventFx && eventFx.owner === owner && eventFx.location === index) eventTiles.push({ cardId: eventFx.cardId, state: 'trigger' });
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
                  <span className={`ghost-arrow ${s.held.dir}`} aria-hidden>
                    ›
                  </span>
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
              <div key={s.uid} className={`tile-glow owner-${owner} ${focus?.includes(s.uid) ? 'focus' : ''}`}>
                <div
                  data-uid={s.uid}
                  data-place={`${index}:gate`}
                  className={`gate-slot filled owner-${owner} ${planned || moving ? 'preview' : ''} ${flash === 'enter' && owner === me && s.ready ? 'ftue-flash' : ''}`}
                  {...draggable}
                >
                  {fx?.kind === 'banish' && fx.victim === s.uid && (
                    <div className="stamp banished">
                      <b>Banished</b>
                      {fx.toName && <i>to {fx.toName}</i>}
                    </div>
                  )}
                  <Pic state={view} c={s} badges fx={fx?.actor === s.uid ? 'strike' : fx?.victim === s.uid ? (fx.outcome === 'hexed' ? 'hexed' : fx.kind === 'banish' ? 'banish' : 'knocked') : undefined} fxData={fx ?? undefined} focus={focus?.includes(s.uid)} strip={planned ? 'Planned' : moving ? 'Moving' : confronting ? 'Confront' : !isPlannedUid(s.uid) && lockReason(view, s) ? 'Held' : undefined} onClick={() => onChar(s.uid)} />
                </div>
              </div>
            );
          })}
          {eventTiles.map((t, n) => (
            <EventTile key={`ev:${t.cardId}:${n}`} cardId={t.cardId} state={t.state} hidden={t.hidden} onClick={owner === me && t.state === 'planned' ? () => onChar(`${PLANNED_PREFIX}${t.cardId}`) : undefined} />
          ))}
          {eventTiles.length === 0 && (
            <div className="gate-slot event-slot empty" {...tip(owner === me ? 'Your Event slot here: drop an Event card on this Location. One per Location per turn.' : "Harborlight's Event slot here.")}>
              <span className="ini">✦</span>
              <span className="ev-lbl">Event</span>
            </div>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function InsideRow({ view, owner, me, index, plan, onChar, label, flash, dragProps, drop, focus, fx, reserved }: Common & { owner: PlayerId; index: number; label: string }) {
  const chars = charsAt(view, index, owner, 'inside').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const ghosts = owner === me ? (reserved?.[index] ?? []).filter((h) => h.zone === 'inside') : [];
  const cap = insideCapacity(view, index);
  const mine = owner === me;
  const dropOk = mine && drop?.inside.includes(index);
  const dropOver = dropOk && drop?.overKey === `inside:${index}`;
  return (
    <div className="inside-row">
      <div className="row-lbl">
        {label} ({cap === 0 ? 'no Inside here' : `${chars.length}–${cap}`})
      </div>
      <div
        className={`slots ${cap < INSIDE_CAPACITY ? 'restricted' : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''}`}
        {...(mine ? { 'data-drop': 'inside', 'data-index': index } : {})}
      >
        {Array.from({ length: INSIDE_CAPACITY }).map((_, i) => {
          const c = chars[i];
          const g = !c ? ghosts[i - chars.length] : undefined;
          if (!c && g) {
            const gd = charDef(g.defId);
            return (
              <div key={`ghost:${g.uid}`} className="slot ghost" onClick={() => onChar(g.uid)} {...tip(`${gd.name} ${g.why} when you Lock In.`)}>
                <Art kind="characters" id={g.defId} className="pic-img" fallback={<span className="ini">{gd.name.slice(0, 2)}</span>} alt="" />
                <span className={`ghost-arrow ${g.dir}`} aria-hidden>
                  ›
                </span>
              </div>
            );
          }
          if (!c) return <div key={i} className={`slot ${i >= cap ? 'locked' : ''}`} />;
          const entering = plan.enters.includes(c.uid);
          const brought = plan.plays.some((pl) => pl.target?.charUid === c.uid);
          const planned = isPlannedUid(c.uid);
          const confronting = plan.confronts.some((x) => x.uid === c.uid);
          const draggable =
            mine && dragProps ? dragProps(planned ? { kind: 'card', cardId: c.uid.slice(PLANNED_PREFIX.length) } : { kind: 'char', uid: c.uid }) : {};
          return (
            <div key={c.uid} data-uid={c.uid} data-place={`${index}:inside`} className={`slot filled ${c.owner} ${entering || planned || brought ? 'preview' : ''} ${flash === 'move' && mine && !entering && !planned ? 'ftue-flash' : ''}`} {...draggable}>
              {fx?.kind === 'banish' && fx.victim === c.uid && (
                <div className="stamp banished">
                  <b>Banished</b>
                  {fx.toName && <i>to {fx.toName}</i>}
                </div>
              )}
              <Pic state={view} c={c} highlight={confronting} fx={fx?.actor === c.uid ? 'strike' : fx?.victim === c.uid ? (fx.outcome === 'hexed' ? 'hexed' : fx.kind === 'banish' ? 'banish' : 'knocked') : undefined} fxData={fx ?? undefined} focus={focus?.includes(c.uid)} strip={entering ? 'Entering' : brought ? 'Moving' : planned ? 'Planned' : confronting ? 'Confront' : lockReason(view, c) ? 'Held' : undefined} onClick={() => onChar(c.uid)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A Threat as a portrait tile beside the Inside rows: art, the Force it needs, its name, and who it is aimed at. */
function ThreatTile({ t, view, me, plan, drop, flash, onThreat, gone }: { t: ThreatInstance; view: GameState; me: PlayerId; plan: TurnPlan; drop?: BattlefieldProps['drop']; flash?: BattlefieldProps['flash']; onThreat: (uid: string) => void; gone?: boolean }) {
  const { placeholders } = useDisplay();
  const tdef = THREAT_BY_ID[t.defId];
  const confronting = !gone && plan.confronts.some((c) => c.threatUid === t.uid);
  const committed = gone
    ? 0
    : plan.confronts
        .filter((c) => c.threatUid === t.uid)
        .map((c) => view.characters[c.uid])
        .filter((c): c is CharacterInstance => !!c)
        .reduce((s, c) => s + confrontForce(view, c, t), 0);
  const need = threatForceNeeded(view, t);
  const armed = !gone && !tdef.requiresBoth && committed >= need;
  const tOk = !gone && drop?.threats.includes(t.uid);
  const tOver = tOk && drop?.overKey === `threat:${t.uid}`;
  const who = tdef.split && t.target ? (t.target === me ? 'yours' : 'theirs') : 'area';
  const fresh = !gone && t.spawnedTurn === view.turn;
  return (
    <div
      data-drop={gone ? undefined : 'threat'}
      data-threat={t.uid}
      className={`threat-tile ${who} ${fresh ? 'fresh' : ''} ${gone ? 'gone' : ''} ${confronting ? 'confronting' : ''} ${armed ? 'armed' : ''} ${flash === 'threat' && !gone ? 'ftue-flash' : ''} ${tOk ? 'drop-ok' : ''} ${tOver ? 'drop-over' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!gone) onThreat(t.uid);
      }}
      {...(gone ? {} : tip(who === 'area' ? `${tdef.name}: in the area, either player can confront it. ${tdef.text}` : who === 'yours' ? `${tdef.name}, aimed at you. ${tdef.text}` : `${tdef.name}, aimed at ${view.players[other(me)].handle}. ${tdef.text}`))}
    >
      <div className="threat-art">{placeholders ? <span className="ini">{initials(t.defId, true)}</span> : <Art kind="threats" id={t.defId} className="threat-img" fallback={<span className="ini">{initials(t.defId, false)}</span>} alt="" />}</div>
      <b className="threat-need">{tdef.requiresBoth ? 'both' : committed > 0 ? `${committed}/${need}` : need}</b>
      <div className="threat-name">{threatLabel(t.defId, placeholders)}</div>
      <div className="threat-who">{who === 'yours' ? 'Yours' : who === 'theirs' ? 'Theirs' : 'In the area'}</div>
      {gone && <div className="stamp">Neutralized</div>}
    </div>
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
    bridleHere: 'rivals cannot relocate out',
    freeDeparture: 'leaving is free',
    allyBonus: '+1 with company',
    cookout: 'everybody eats',
  };
  return map[type] ?? type;
}

export function Battlefield(props: BattlefieldProps) {
  const { view, me, plan, targetable, onLocationTap, onLocationInfo, onChar, onThreat, flash, dragProps, drop, delays, resolving, glowLocation, summonLabel, reserved, focus, eventFx, pendingEvents, neutralized, fx } = props;
  const { placeholders } = useDisplay();
  const opp = other(me);
  const rootRef = useRef<HTMLDivElement>(null);
  useFlip(rootRef, {
    version: view,
    delayFor: (uid) => delays?.[uid] ?? 0,
    // Your own moves snap quickly; the opponent's resolution moves glide.
    durationFor: (uid) => (uid === fx?.victim ? 760 : view.characters[uid]?.owner === me || isPlannedUid(uid) ? (resolving ? 0 : 220) : 620),
  });
  const common: Common = { view, me, plan, onChar, flash, dragProps, drop, reserved, focus, eventFx, pendingEvents, fx };
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
                {!loc.revealed && view.players[me].knownNextReveal === loc.index && (
                  <span className="lost-tag next-tag" {...tip("Paul Laurence Dunbar's Reveal: this Location opens at the end of next turn. Only you know.")}>
                    ✦ Opens next
                  </span>
                )}
                {loc.revealed && def.transformsInto && loc.revealedTurn !== undefined && (
                  <span className="sail-tag" {...tip(`${def.name} arrives in ${Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)} turn(s): everyone aboard gains +1 Influence and Gate Characters walk straight in.`)}>
                    ⛵ arrives in {Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)}
                  </span>
                )}
                {loc.revealed && !placeholders && <span className="era-tag">{def.era}</span>}
                {loc.lost && <span className="lost-tag">LOST</span>}
                {!loc.lost && loc.rebuilt && <span className="lost-tag rebuilt" {...tip(HINTS.rebuilt)}>REBUILT</span>}
                {!loc.lost && loc.webbed && <span className="lost-tag webbed" {...tip(HINTS.webbed)}>WEBBED</span>}
                {!loc.lost && loc.revealed && curfewOn(view, loc.index) && <span className="lost-tag curfew" {...tip(HINTS.locked)}>CURFEW</span>}
                {!loc.lost && hasCurfew && !curfewOn(view, loc.index) && <span className="lost-tag daytag" {...tip(HINTS.dayNight)}>☀ DAY</span>}
                {!loc.lost && nightHere && <span className="lost-tag nighttag" {...tip(HINTS.dayNight)}>🌙 NIGHT</span>}
                {loc.sanctified && <span className="lost-tag sanct">OBATALA</span>}
                {summon && <span className="summon-tag">{summon}</span>}
              </div>
              <div className="influence">
                <Score p="A" value={inf.A} />
                <div className={`line ${winner && winner !== 'lost' ? `won-${winner}` : ''}`} {...tip(HINTS.line)}>
                  <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                  <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                  <div className="mark" style={{ left: `${fracA * 100}%` }} />
                </div>
                <Score p="B" value={inf.B} />
              </div>
              {(() => {
                const rank = (t: ThreatInstance) => (t.target ? (t.target === me ? 2 : 0) : 1);
                const live = [...loc.threats].sort((a, b) => rank(a) - rank(b));
                const ghosts = (neutralized ?? []).filter((g) => g.location === loc.index && !loc.threats.some((t) => t.uid === g.uid)).map((g): ThreatInstance => ({ uid: g.uid, defId: g.defId, location: g.location, target: g.target, forceRequired: THREAT_BY_ID[g.defId]?.force ?? 0, spawnedTurn: -1 }));
                const has = live.length + ghosts.length > 0;
                return (
                  <div className="inside-block">
                    <div className="inside-rows">
                      <InsideRow {...common} owner={opp} index={loc.index} label="Opponent Characters" />
                      <InsideRow {...common} owner={me} index={loc.index} label="Your Characters" />
                    </div>
                    {/* The column is always reserved, so the rows never change shape; empty, it shows the Location's art. */}
                    <div className={`threat-col ${has ? '' : 'empty'}`} aria-hidden={!has}>
                      {live.map((t) => (
                        <ThreatTile key={t.uid} t={t} view={view} me={me} plan={plan} drop={drop} flash={flash === 'threat' && glowLocation !== null && glowLocation !== undefined && glowLocation !== loc.index ? null : flash} onThreat={onThreat} />
                      ))}
                      {ghosts.map((t) => (
                        <ThreatTile key={`gone:${t.uid}`} t={t} view={view} me={me} plan={plan} onThreat={onThreat} gone />
                      ))}
                    </div>
                  </div>
                );
              })()}
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
