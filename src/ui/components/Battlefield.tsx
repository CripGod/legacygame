import { useEffect, useRef, useState , useLayoutEffect } from 'react';
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
import { hueFor, initials, locationName, threatLabel, useDisplay } from '../display';
import { Pic } from './CardFace';
import { Art } from './Art';
import { SkyTag } from './Sky';
import { artUrl } from '../art';
import { assistButtons } from '../assist';
import { influenceLines } from '../influence';
import { charDef, confrontForce, threatForceNeeded, isNight, lockKind, isProtected, protectionReason, shielded, LOCATION_BY_ID, CARD_BY_ID, TEAM_UP_BY_ID } from '../../engine';

/** The strip on a tile that cannot relocate out, by what holds it: the word says which. */
const LOCK_STRIP: Record<'curfew' | 'besieged' | 'held' | 'oath', string> = { curfew: 'Curfew', besieged: 'Besieged', held: 'Held', oath: 'Oath' };
/** A Location under curfew right now: a curfew Location at night. */
function curfewOn(view: GameState, index: number): boolean {
  const loc = view.locations[index];
  return loc.revealed && !!LOCATION_BY_ID[loc.defId]?.curfew && isNight(view);
}
import { isPlannedUid, PLANNED_PREFIX, type foreseePlan } from '../preview';
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
  /** Read a card by id (a card's mark on a Location, tapped). */
  onCard?: (id: string) => void;
  onThreat: (uid: string) => void;
  locked: boolean;
  /** Active first-match coach tip; matching elements pulse. */
  flash?: string | null;
  dragProps?: (payload: DragPayload) => Record<string, unknown>;
  drop?: DropHighlight | null;
  /** Per-tile animation stagger (ms) for the latest resolution. */
  delays?: Record<string, number>;
  /** A clash playing out on the board: tiles hidden while their ghosts fly, the hit, the stamp that says what happened. */
  fx?: BoardFx | null;
  /** Influence still in the air per Location and side: the meter shows the live score less this until the number lands. */
  pending?: Record<number, Partial<Record<PlayerId, number>>>;
  /** During the replay: the state the turn started from; a tile only says Ready if it was Ready then. */
  readyBaseline?: GameState | null;
  /** The Ancestors' vision: the opponent's coming moves as faint ghosts beside the real tiles. */
  foreseen?: ReturnType<typeof foreseePlan> | null;
  /** Gate slots still occupied until the turn resolves, keyed by Location: Characters leaving the Gates this turn. */
  /** Pieces leaving a Location in the preview: ghosted at their old place with an arrow toward where they go. */
  reserved?: Record<number, { uid: string; defId: string; why: string; zone: 'gate' | 'inside'; dir: 'left' | 'right' | 'up'; /** A card played straight Inside: it is placed at these Gates first, so the slot is spoken for. */ through?: boolean; /** Its place in the row (tileOrder), so a ghost stands where the piece stood. */ order: number; /** A ghost at the Gates a piece is moving to. */ arriving?: boolean }[]>;

  /** Replay: the pieces this beat is about. */
  focus?: string[];
  /** Replay: an Event card resolving right now, flaring at its Gates. */
  eventFx?: { cardId: string; owner: PlayerId; location: number; /** The card is flashing over the board: the tile stays as it was, face-down for the opponent's, until the flip. */ waiting?: boolean };
  /** Replay: Event cards played this turn that have not resolved yet; they wait at the Gates. */
  pendingEvents?: { cardId: string; player: PlayerId; location: number }[];
  /** Threats neutralized on this replay beat: they linger with a stamp before they go. */
  neutralized?: { uid: string; defId: string; location: number; target?: PlayerId; /** How it went: broken by Force (the default), lifted on its own (the Decision has run its course), or left behind (the Black Star arrived). */ why?: 'lifted' | 'leftBehind' }[];
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

function Score({ p, value, hurt, detail }: { p: PlayerId; value: number; hurt?: boolean; /** The sum behind the number, one line each (the tooltip). */ detail?: string }) {
  const bump = useBump(value);
  return (
    <div className={`score p${p} ${bump ? 'bump' : ''} ${hurt ? 'hurt' : ''}`} {...tip(detail ?? (p === 'A' ? HINTS.scoreA : HINTS.scoreB))}>
      {value}
    </div>
  );
}

/**
 * The clash choreography, told through the real tiles: `hidden` tiles sit invisible while a ghost of them flies
 * (the striker's charge, the victim's flight), `flash` is the moment of impact on the victim, `stamp` is the
 * verdict slammed onto a tile once it has landed, `land` pops the tile that just arrived, `windup` is the
 * striker gathering itself before the charge.
 */
export interface BoardFx {
  hidden: string[];
  windup?: string;
  flash?: { uid: string; kind: 'hit' | 'held' | 'hexed' };
  /** A siege just took Influence from this player here: their score on the meter looks hurt for a beat. */
  hurt?: { location: number; owner: PlayerId };
  stamp?: { uid: string; title: string; sub?: string; tone?: 'hit' | 'miss' | 'hex' };
  land?: string;
  /** A card landing in its slot: the tile flips face up where it stands (a play, an arrival). */
  arrive?: string;
  /** A card its owner already knows: the tile swells face up where it stands, no turn and no back (your own Dunbar under his cinematic). */
  rise?: string;
  /** After a cinematic: the tile, held big under the veil, comes down to rest in one motion (no second swell, no bounce). */
  settle?: string;
  /** The Location just revealed slamming onto the board: the panel drops, the cards in its column hop. */
  slam?: number;
  /** The first Location opening quietly (nobody guessed it): the beat waits for the picture to develop, no slam. */
  open?: number;
  /** Cards hopping where they stand (the First Location bonus paying them). */
  jolt?: string[];
  /** Threats neutralized this beat that still look alive: the showdown has not reached them yet. */
  alive?: string[];
  /** The Threat breaking apart under the showdown. */
  shatter?: string;
  /** The Reckoning: each Location takes its winner's stamp. */
  locStamp?: Record<number, { title: string; tone: 'mine' | 'theirs' | 'lost' | 'tie' }>;
  /** Locations healing this beat: their last Threat just broke, the picture floods back and light sweeps up it. */
  heal?: number[];
  /** Who broke the Threat that healed them: the light takes their colour ('both' when the Force was even). */
  healBy?: PlayerId | 'both';
}

const picFx = (fx: BoardFx | null | undefined, uid: string): 'windup' | 'knocked' | 'held' | 'hexed' | 'land' | 'arrive' | 'rise' | 'settle' | 'jolt' | undefined => {
  if (!fx) return undefined;
  if (fx.arrive === uid) return 'arrive';
  if (fx.rise === uid) return 'rise';
  if (fx.settle === uid) return 'settle';
  if (fx.jolt?.includes(uid)) return 'jolt';
  if (fx.windup === uid) return 'windup';
  if (fx.flash?.uid === uid) return fx.flash.kind === 'hit' ? 'knocked' : fx.flash.kind;
  if (fx.land === uid) return 'land';
  return undefined;
};

type Common = Pick<BattlefieldProps, 'view' | 'me' | 'plan' | 'onChar' | 'flash' | 'dragProps' | 'drop' | 'reserved' | 'focus' | 'eventFx' | 'pendingEvents' | 'fx' | 'foreseen' | 'readyBaseline' | 'resolving'>;

/** An Event card sitting at the Gates: planned, waiting to resolve, or resolving now. */
function EventTile({ cardId, state, hidden, foreseen, onClick }: { cardId: string; state: 'planned' | 'pending' | 'trigger'; hidden?: boolean; /** The Ancestors foresee it: faint. */ foreseen?: boolean; onClick?: () => void }) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[cardId] as { name: string; curse?: boolean } | undefined;
  if (!def) return null;
  if (hidden) {
    // The opponent's Event waits face-down until its beat, Snap-style.
    return (
      <div className="tile-glow event pending">
        <i className="glow" aria-hidden />
        <div className="gate-slot event-slot pending facedown" {...tip('The opponent played an Event here. It flips when it resolves.')}>
          <span className="ini">?</span>
          <span className="strip event">Event</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`tile-glow event ${state} ${def.curse ? 'curse' : ''}`}>
      <i className="glow" aria-hidden />
      <div className={`gate-slot event-slot ${state} ${def.curse ? 'curse' : ''} ${foreseen ? 'foreseen' : ''}`} onClick={onClick} {...tip(foreseen ? `The Ancestors foresee: ${def.name} is played here.` : state === 'planned' ? `${def.name} is placed here. It resolves when you Lock In and needs this open Gate slot.` : state === 'pending' ? `${def.name} waits to resolve.` : `${def.name} resolves.`)}>
        {placeholders ? <span className="ini">{initials(cardId, true)}</span> : <Art kind="events" id={cardId} className="pic-img" fallback={<span className="ini">{initials(cardId, false)}</span>} alt={def.name} />}
        {state === 'trigger' && <i className="back" aria-hidden />}
        <span className={`strip ${def.curse ? 'curse' : 'event'}`}>{state === 'trigger' ? '✦' : def.curse ? 'Curse' : 'Event'}</span>
      </div>
    </div>
  );
}

/** An asset URL made absolute against the page: a url() in a custom property resolves against the stylesheet otherwise. */
const pageUrl = (u: string): string => (typeof document !== 'undefined' ? new URL(u, document.baseURI).href : u);

/** Where a tile stands in a Gate row: by arrival, then by age (the uid's number), so nothing reorders as plans change. */
export function tileOrder(c: { arrivedTurn: number; uid: string }): number {
  const n = /^c(\d+)$/.exec(c.uid);
  return n ? c.arrivedTurn * 1e6 + Number(n[1]) : Number.POSITIVE_INFINITY;
}

function GateStrip({ view, owner, me, index, plan, onChar, label, right, flash, dragProps, drop, reserved, focus, eventFx, pendingEvents, fx, foreseen, readyBaseline, resolving }: Common & { owner: PlayerId; index: number; label: string; right?: React.ReactNode }) {
  const gOk = owner === me && drop?.gates.includes(index);
  const gOver = gOk && drop?.overKey === `gates:${index}`;
  const chars = charsAt(view, index, owner, 'gate');
  const held = owner === me ? (reserved?.[index] ?? []).filter((h) => h.zone === 'gate') : [];
  const seen = (foreseen?.ghosts[owner]?.[index] ?? []).filter((f) => f.zone === 'gate').slice(0, Math.max(0, GATE_CAPACITY - chars.length - held.length));
  // Tiles and the ghosts holding a place keep the order they stood in: a piece planned Inside leaves its ghost where it was.
  const row = [...chars.map((c) => ({ key: tileOrder(c), item: c as CharacterInstance | { held: (typeof held)[number] } })), ...held.map((h) => ({ key: h.order, item: { held: h } }))].sort((a, b) => a.key - b.key).map((r) => r.item);
  const slots: (CharacterInstance | { held: { uid: string; defId: string; why: string; dir: 'left' | 'right' | 'up'; through?: boolean; arriving?: boolean } } | { seen: { uid: string; defId: string; why: string } } | null)[] = [...row, ...seen.map((f) => ({ seen: f }))];
  // Never more tiles than the Gates hold: whatever the plan says, the row is GATE_CAPACITY wide.
  slots.splice(GATE_CAPACITY);
  while (slots.length < GATE_CAPACITY) slots.push(null);
  // Only the next empty slot is open; the ones after it open as it fills.
  const nextOpen = slots.findIndex((s) => s === null);
  // Event cards at these Gates: planned by me, or (in a replay) waiting to resolve or resolving now.
  const eventTiles: { cardId: string; state: 'planned' | 'pending' | 'trigger'; hidden?: boolean; foreseen?: boolean }[] = [];
  if (owner === me) for (const pl of plan.plays) if (pl.location === index && CARD_BY_ID[pl.cardId]?.kind === 'event') eventTiles.push({ cardId: pl.cardId, state: 'planned' });
  for (const e of foreseen?.events ?? []) if (e.owner === owner && e.location === index) eventTiles.push({ cardId: e.cardId, state: 'planned', foreseen: true });
  for (const pe of pendingEvents ?? []) if (pe.player === owner && pe.location === index) eventTiles.push({ cardId: pe.cardId, state: 'pending', hidden: owner !== me });
  if (eventFx && eventFx.owner === owner && eventFx.location === index) eventTiles.push(eventFx.waiting ? { cardId: eventFx.cardId, state: 'pending', hidden: owner !== me } : { cardId: eventFx.cardId, state: 'trigger' });
  // Events are scarce (a deck carries at most two): the empty slot says how many you have left, hand and deck together.
  const isEvent = (id: string) => CARD_BY_ID[id]?.kind === 'event';
  const evLeft = view.players[me].hand.filter(isEvent).length + (view.players[me].deckEvents ?? 0);
  const evTotal = evLeft + view.players[me].discard.filter(isEvent).length;
  return (
    <div className={`gates-strip ${owner === me ? 'mine' : 'theirs'}`} style={{ '--gate-off': `url("${pageUrl(artUrl('frames', 'gate-gold-off', 'webp'))}")`, '--gate-on': `url("${pageUrl(artUrl('frames', owner === me ? 'gate-gold-on' : 'gate-blue-on', 'webp'))}")`, '--gate-event-off': `url("${pageUrl(artUrl('frames', 'gate-event-off', 'webp'))}")`, '--gate-event-on': `url("${pageUrl(artUrl('frames', 'gate-event-on', 'webp'))}")` } as React.CSSProperties}>
      <div className={`gates-left ${gOk ? 'drop-ok' : ''} ${gOver ? 'drop-over' : ''}`} {...(owner === me ? { 'data-drop': 'gates', 'data-index': index } : {})}>
        <div className="lbl">
          {label}
          {assistButtons() ? ` (${GATE_CAPACITY})` : ''}
        </div>
        <div className="gates">
          {slots.map((s, i) => {
            if (s === null)
              return (
                <div key={i} className={`gate-slot gf ${i === nextOpen ? 'open' : 'later'}`} {...(i !== nextOpen ? tip('Opens once the slot before it is taken.') : {})}>
                  {i === nextOpen ? '+' : ''}
                </div>
              );
            if ('seen' in s) {
              // The Ancestors foresee: the opponent's coming move, faint, beside the real tiles.
              const fd = charDef(s.seen.defId);
              return (
                <div key={`seen:${s.seen.uid}`} className="gate-slot reserved foreseen" data-foreseen={s.seen.uid} {...tip(`The Ancestors foresee: ${fd.name} ${s.seen.why}.`)}>
                  <Art kind="characters" id={s.seen.defId} className="pic-img" fallback={<span className="ini">{fd.name.slice(0, 2)}</span>} alt="" />
                  <span className="strip leaving">Foreseen</span>
                </div>
              );
            }
            if ('held' in s) {
              // Reserved: the Character has left in the preview but still holds this slot until the turn resolves.
              const hd = charDef(s.held.defId);
              return (
                <div key={`held:${s.held.uid}`} className={`gate-slot reserved gf ${s.held.through ? 'through' : ''} ${s.held.arriving ? 'arriving' : ''}`} data-reserved={s.held.uid} onClick={() => onChar(s.held.arriving ? s.held.uid.slice('arrive:'.length) : s.held.uid)} {...tip(s.held.arriving ? `${hd.name} ${s.held.why} when you Lock It In.` : s.held.through ? `${hd.name} ${s.held.why}: every arrival is placed at the Gates before anyone walks Inside, so this slot is taken this turn.` : `${hd.name} ${s.held.why} when you Lock It In. The slot stays taken until then.`)}>
                  <Art kind="characters" id={s.held.defId} className="pic-img" fallback={<span className="ini">{hd.name.slice(0, 2)}</span>} alt="" />
                  <span className={`ghost-arrow ${s.held.dir}`} aria-hidden>
                    ›
                  </span>
                  <span className={`strip leaving ${s.held.arriving ? 'arriving' : ''}`}>{s.held.arriving ? 'Arriving' : s.held.through ? 'Through' : 'Leaving'}</span>
                </div>
              );
            }
            const planned = isPlannedUid(s.uid);
            const moving = plan.relocations.some((r) => r.uid === s.uid) || plan.plays.some((pl) => pl.target?.charUid === s.uid);
            const movingTo = plan.relocations.find((r) => r.uid === s.uid)?.to ?? plan.plays.find((pl) => pl.target?.charUid === s.uid)?.target?.location;
            const moveDir: 'left' | 'right' | 'up' = movingTo === undefined || movingTo === index ? 'up' : movingTo < index ? 'left' : 'right';
            const confronting = plan.confronts.some((c) => c.uid === s.uid);
            const draggable =
              owner === me && dragProps ? dragProps(planned ? { kind: 'card', cardId: s.uid.slice(PLANNED_PREFIX.length) } : { kind: 'char', uid: s.uid }) : {};
            // A piece on the board that nothing can displace this turn stands under the veil (see theme.css); a planned one is not there yet.
            const guarded = !planned && isProtected(view, s);
            const shield = !planned && shielded(view, s);
            return (
              <div key={s.uid} className={`tile-glow owner-${owner} ${focus?.includes(s.uid) ? 'focus' : ''}`}>
                <i className="glow" aria-hidden />
                <div
                  data-uid={s.uid}
                  data-place={`${index}:gate`}
                  className={`gate-slot filled gf owner-${owner} ${planned || moving ? 'preview' : ''} ${flash === 'enter' && owner === me && s.ready ? 'ftue-flash' : ''} ${fx?.hidden.includes(s.uid) ? 'fx-hidden' : ''} ${fx?.arrive === s.uid ? 'fx-flip' : ''} ${fx?.rise === s.uid ? 'fx-rise' : ''} ${fx?.settle === s.uid ? 'fx-settle' : ''} ${guarded ? 'protected' : ''} ${shield ? 'shielded' : ''}`}
                  {...draggable}
                  {...(guarded ? tip(`Under protection: ${protectionReason(view, s) ?? 'cannot be displaced this turn'}. More in the rules.`) : shield ? tip(HINTS.shielded) : {})}
                >
                  {/* An arrival turns the whole framed tile over, frame and all; the back sits in the frame's window. */}
                  {fx?.arrive === s.uid && <i className="back" aria-hidden />}
                  {fx?.stamp?.uid === s.uid && (
                    <div className={`stamp verdict ${fx.stamp.tone ?? 'hit'}`}>
                      <b>{fx.stamp.title}</b>
                      {fx.stamp.sub && <i>{fx.stamp.sub}</i>}
                    </div>
                  )}
                  {moving && owner === me && (
                    <span className={`ghost-arrow ${moveDir}`} aria-hidden>
                      ›
                    </span>
                  )}
                  <Pic state={view} c={s} ready={readyBaseline ? !!readyBaseline.characters[s.uid]?.ready : undefined} resolving={resolving} badges fx={picFx(fx, s.uid) === 'arrive' ? undefined : picFx(fx, s.uid)} focus={focus?.includes(s.uid)} strip={planned ? 'Placed' : moving ? (movingTo === index ? 'Arriving' : 'Moving') : confronting ? 'Confront' : !isPlannedUid(s.uid) && lockKind(view, s) ? LOCK_STRIP[lockKind(view, s)!.kind] : undefined} onClick={() => onChar(s.uid)} onContextMenu={(e) => { e.preventDefault(); onChar(s.uid); }} />
                </div>
              </div>
            );
          })}
          {eventTiles.map((t, n) => (
            <EventTile key={`ev:${t.cardId}:${n}`} cardId={t.cardId} state={t.state} hidden={t.hidden} foreseen={t.foreseen} onClick={owner === me && t.state === 'planned' ? () => onChar(`${PLANNED_PREFIX}${t.cardId}`) : undefined} />
          ))}
          {eventTiles.length === 0 && (
            <div className="gate-slot event-slot empty" {...tip(owner === me ? `Your Event slot here: drop an Event card on this Location. One per Location per turn. A deck carries at most two Events: you have ${evLeft} of ${evTotal} left.` : "Harborlight's Event slot here.")}>
              <span className="ini">+</span>
              <span className="ev-lbl">Event</span>
              {owner === me && evTotal > 0 && <span className={`ev-count ${evLeft === 0 ? 'spent' : ''}`}>{evLeft} of {evTotal}</span>}
            </div>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function InsideRow({ view, owner, me, index, plan, onChar, label, flash, dragProps, drop, focus, fx, reserved, foreseen, readyBaseline }: Common & { owner: PlayerId; index: number; label: string }) {
  const chars = charsAt(view, index, owner, 'inside').sort((a, b) => a.arrivedTurn - b.arrivedTurn);
  const ghosts = owner === me ? (reserved?.[index] ?? []).filter((h) => h.zone === 'inside') : [];
  const cap = insideCapacity(view, index);
  const seen = (foreseen?.ghosts[owner]?.[index] ?? []).filter((f) => f.zone === 'inside').slice(0, Math.max(0, cap - chars.length - ghosts.length));
  const mine = owner === me;
  const dropOk = mine && drop?.inside.includes(index);
  const dropOver = dropOk && drop?.overKey === `inside:${index}`;
  return (
    <div className="inside-row">
      <div className="row-lbl">
        {label}
        {cap === 0 ? ' (no Inside here)' : assistButtons() ? ` (${chars.length}–${cap})` : ''}
      </div>
      <div
        className={`slots ${cap < INSIDE_CAPACITY ? 'restricted' : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''}`}
        {...(mine ? { 'data-drop': 'inside', 'data-index': index } : {})}
      >
        {Array.from({ length: INSIDE_CAPACITY }).map((_, i) => {
          const c = chars[i];
          const g = !c ? ghosts[i - chars.length] : undefined;
          const f = !c && !g ? seen[i - chars.length - ghosts.length] : undefined;
          if (!c && !g && f) {
            const fd = charDef(f.defId);
            return (
              <div key={`seen:${f.uid}`} className="slot ghost foreseen" data-foreseen={f.uid} {...tip(`The Ancestors foresee: ${fd.name} ${f.why}.`)}>
                <Art kind="characters" id={f.defId} className="pic-img" fallback={<span className="ini">{fd.name.slice(0, 2)}</span>} alt="" />
              </div>
            );
          }
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
          if (!c) return <div key={i} className="tile-glow seat"><i className="glow" aria-hidden /><div className={`slot ${i >= cap ? 'locked' : ''}`} {...(i >= cap ? tip('Seat closed: a Housing Restriction (or the Land Office) holds it. Clear the Threat and it opens.') : {})} /></div>;
          const entering = plan.enters.includes(c.uid);
          const brought = plan.plays.some((pl) => pl.target?.charUid === c.uid);
          const planned = isPlannedUid(c.uid);
          const confronting = plan.confronts.some((x) => x.uid === c.uid);
          const draggable =
            mine && dragProps ? dragProps(planned ? { kind: 'card', cardId: c.uid.slice(PLANNED_PREFIX.length) } : { kind: 'char', uid: c.uid }) : {};
          const guarded = !planned && isProtected(view, c);
          const shield = !planned && shielded(view, c);
          return (
            <div key={c.uid} className={`tile-glow seat ${c.owner} ${focus?.includes(c.uid) ? 'focus' : ''}`}>
              <i className="glow" aria-hidden />
              <div data-uid={c.uid} data-place={`${index}:inside`} className={`slot filled ${c.owner} ${entering || planned || brought ? 'preview' : ''} ${flash === 'move' && mine && !entering && !planned ? 'ftue-flash' : ''} ${fx?.hidden.includes(c.uid) ? 'fx-hidden' : ''} ${guarded ? 'protected' : ''} ${shield ? 'shielded' : ''}`} {...draggable} {...(guarded ? tip(`Under protection: ${protectionReason(view, c) ?? 'cannot be displaced this turn'}. More in the rules.`) : shield ? tip(HINTS.shielded) : {})}>
                {fx?.stamp?.uid === c.uid && (
                  <div className={`stamp verdict ${fx.stamp.tone ?? 'hit'}`}>
                    <b>{fx.stamp.title}</b>
                    {fx.stamp.sub && <i>{fx.stamp.sub}</i>}
                  </div>
                )}
                <Pic state={view} c={c} ready={readyBaseline ? !!readyBaseline.characters[c.uid]?.ready : undefined} highlight={confronting} fx={picFx(fx, c.uid)} focus={focus?.includes(c.uid)} strip={entering ? 'Entering' : brought ? 'Arriving' : planned ? 'Placed' : confronting ? 'Confront' : lockKind(view, c) ? LOCK_STRIP[lockKind(view, c)!.kind] : undefined} onClick={() => onChar(c.uid)} onContextMenu={(e) => { e.preventDefault(); onChar(c.uid); }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A Threat as a portrait tile beside the Inside rows: art, the Force it needs, its name, and who it is aimed at. */
function ThreatTile({ t, view, me, plan, drop, flash, onThreat, gone, goneWhy, hidden, hit, shatter, stamp, foreseen }: { /** Why a gone Threat went (its stamp). */ goneWhy?: 'lifted' | 'leftBehind'; /** The Ancestors foresee the opponent confronting it. */ foreseen?: boolean; t: ThreatInstance; view: GameState; me: PlayerId; plan: TurnPlan; drop?: BattlefieldProps['drop']; flash?: BattlefieldProps['flash']; onThreat: (uid: string) => void; gone?: boolean; hidden?: boolean; /** The showdown's blow lands: a red flash when it tells, green when the Threat shrugs it off. */ hit?: 'hit' | 'held' | 'hexed'; shatter?: boolean; stamp?: BoardFx['stamp'] }) {
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
      className={`threat-tile ${who} ${fresh ? 'fresh' : ''} ${gone ? 'gone' : ''} ${confronting ? 'confronting' : ''} ${foreseen ? 'foreseen' : ''} ${armed ? 'armed' : ''} ${flash === 'threat' && !gone ? 'ftue-flash' : ''} ${tOk ? 'drop-ok' : ''} ${tOver ? 'drop-over' : ''} ${hidden ? 'fx-hidden' : ''} ${hit ? `fx-${hit}` : ''} ${shatter ? 'fx-shatter' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!gone) onThreat(t.uid);
      }}
      {...(gone ? {} : tip(who === 'area' ? `${tdef.name}: ${tdef.standing ? `${tdef.standing};` : 'in the area,'} either player can confront it. ${tdef.text}` : who === 'yours' ? `${tdef.name}, aimed at you. ${tdef.text}` : `${tdef.name}, aimed at ${view.players[other(me)].handle}. ${tdef.text}`))}
    >
      <div className="threat-art">{placeholders ? <span className="ini">{initials(t.defId, true)}</span> : <Art kind="threats" id={t.defId} className="threat-img" fallback={<span className="ini">{initials(t.defId, false)}</span>} alt="" />}</div>
      <b className="threat-need">{tdef.requiresBoth ? 'both' : committed > 0 ? `${committed}/${need}` : need}</b>
      <div className="threat-name">{threatLabel(t.defId, placeholders)}</div>
      <div className="threat-who">{who === 'yours' ? 'Yours' : who === 'theirs' ? 'Theirs' : (tdef.standing ?? 'In the area')}</div>
      {stamp ? (
        <div className={`stamp verdict ${stamp.tone ?? 'hit'}`}>
          <b>{stamp.title}</b>
          {stamp.sub && <i>{stamp.sub}</i>}
        </div>
      ) : (
        gone && <div className="stamp">{goneWhy === 'leftBehind' ? 'Left behind' : goneWhy === 'lifted' ? 'Lifted' : 'Neutralized'}</div>
      )}
    </div>
  );
}

/**
 * The Location's rule in one line or two, big enough to read from the chair. When the box cannot hold it, the text is
 * clipped and a MORE link opens the Location's sheet, where the whole rule and its history live.
 */
function LocRule({ text, more = true, onOpen }: { text: string; more?: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div
      className={`loc-rule ${clipped ? 'clipped' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="loc-rule-text" ref={ref}>
        {text}
      </div>
      {more && <b className="loc-more">More ›</b>}
    </div>
  );
}

/** A card's mark on a Location (Taytu's torn treaty): the card's face in its owner's ring, then what it did, and the
 *  turns it has left. Tap it to read the card, so the mark is never mistaken for a rule of the place. */
function CardTag({ id, mine, label, turns, tipText, onOpen }: { id: string; mine: boolean; label: string; turns?: number; tipText: string; onOpen?: (id: string) => void }) {
  const { placeholders } = useDisplay();
  const name = placeholders ? initials(id, true) : charDef(id).name;
  return (
    <span
      className={`card-tag ${mine ? 'mine' : 'theirs'}`}
      role="button"
      {...tip(`${name}: ${tipText}${turns !== undefined ? ` ${turns > 1 ? `${turns} turns left.` : 'This turn only.'}` : ''} Tap to read the card.`)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(id);
      }}
    >
      <span className="ct-pic" style={{ background: hueFor(id) }}>
        <Art kind="characters" id={id} className="ct-img" fallback={<span className="ct-ini">{initials(id, placeholders)}</span>} alt="" />
      </span>
      <span className="ct-label">{label}</span>
      {turns !== undefined && <span className="ct-turns">{turns}</span>}
    </span>
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
    relocatedInReady: 'every arrival Ready',
    recordInformantsHere: 'Informants here count 0',
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
  const { view, me, plan, targetable, onLocationTap, onLocationInfo, onChar, onCard, onThreat, flash, dragProps, drop, delays, resolving, glowLocation, summonLabel, reserved, focus, eventFx, pendingEvents, neutralized, fx, foreseen, readyBaseline, pending } = props;
  const { placeholders } = useDisplay();
  const opp = other(me);
  const rootRef = useRef<HTMLDivElement>(null);
  useFlip(rootRef, {
    version: view,
    delayFor: (uid) => delays?.[uid] ?? 0,
    // Your own moves snap quickly; the opponent's resolution moves glide.
    // A tile whose ghost is flying does not glide: it reappears where the ghost lands.
    durationFor: (uid) => (fx?.hidden.includes(uid) ? 0 : view.characters[uid]?.owner === me || isPlannedUid(uid) ? (resolving ? 0 : 220) : 620),
  });
  const common: Common = { view, me, plan, onChar, flash, dragProps, drop, reserved, focus, eventFx, pendingEvents, fx, foreseen, readyBaseline, resolving };
  return (
    <div className="battlefield" ref={rootRef}>
      {view.locations.map((loc) => {
        const def = locDef(view, loc.index);
        const live = influenceAt(view, loc.index);
        const inf = { A: Math.max(0, live.A - (pending?.[loc.index]?.A ?? 0)), B: Math.max(0, live.B - (pending?.[loc.index]?.B ?? 0)) };
        const ended = view.phase === 'ended' && view.result;
        const winner = ended ? view.result!.locationWinners[loc.index] : null;
        const lead = inf.A === inf.B ? null : inf.A > inf.B ? 'A' : 'B';
        const total = inf.A + inf.B;
        const fracA = total === 0 ? 0.5 : inf.A / total;
        const isTarget = targetable.includes(loc.index);
        const dropOk = drop?.locations.includes(loc.index);
        const dropOver = dropOk && drop?.overKey === `location:${loc.index}`;
        // While something is dragged, the Location itself says whether it can land here: a green glow, or red.
        const canLand = drop ? dropOk || drop.gates.includes(loc.index) || drop.inside.includes(loc.index) || loc.threats.some((t) => drop.threats.includes(t.uid)) : null;
        const overHere = !!drop && (drop.overKey.endsWith(`:${loc.index}`) || loc.threats.some((t) => drop.overKey === `threat:${t.uid}`));
        const hasCurfew = loc.revealed && !!LOCATION_BY_ID[loc.defId]?.curfew;
        const nightHere = hasCurfew && isNight(view);
        const state = [loc.lost ? 'lost' : '', loc.sanctified ? 'sanctified' : '', lead ? `lead-${lead}` : '', winner && winner !== 'lost' ? `won-${winner}` : '', nightHere ? 'night' : '', !loc.lost && curfewOn(view, loc.index) ? 'curfew' : ''].join(' ');
        // Threats that fell this beat and still show here, stamped, until the beat ends.
        const fallen = (neutralized ?? []).filter((g) => g.location === loc.index && !loc.threats.some((t) => t.uid === g.uid));
        // A Location is ailing while a Threat sits on it (or still looks alive in the replay); it heals the beat its last Threat breaks.
        const healing = !!fx?.heal?.includes(loc.index);
        const ailing = !healing && loc.revealed && (loc.threats.length > 0 || fallen.some((g) => fx?.alive?.includes(g.uid)));
        const healCls = healing ? `healing${fx?.healBy && fx.healBy !== 'both' ? ` heal-${fx.healBy}` : ''}` : '';
        const cls = ['location', loc.revealed ? '' : 'hidden-loc', state, ailing ? 'ailing' : '', healCls].join(' ');
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
            className={`column ${isTarget ? `targetable for-${me}` : ''} ${dropOk ? 'drop-ok' : ''} ${dropOver ? 'drop-over' : ''} ${glowLocation === loc.index ? 'ftue-flash' : ''} ${fx?.slam === loc.index ? 'slam' : ''}`}
            data-drop="location"
            data-index={loc.index}
            onClick={isTarget ? () => onLocationTap(loc.index) : undefined}
            tabIndex={isTarget ? 0 : undefined}
            role={isTarget ? 'button' : undefined}
            aria-label={isTarget ? `Play here: ${loc.revealed ? locationName(loc.defId, placeholders) : `Location ${loc.index + 1}`}` : undefined}
            onKeyDown={
              isTarget
                ? (e) => {
                    if (e.target !== e.currentTarget) return; // buttons inside the column keep their own Enter
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onLocationTap(loc.index);
                    }
                  }
                : undefined
            }
          >
            <GateStrip {...common} owner={opp} index={loc.index} label="The Gates" right={title} />
            <div className={`loc-glow ${state}${healing ? ` ${healCls}` : ''} ${canLand === null ? '' : canLand ? 'drop-can' : 'drop-cannot'} ${overHere ? 'drop-here' : ''}`}>
            <div className={`${cls} framed`}>
              {/* The owner's Location frame: gold when I lead, blue when they do, silver when nobody does. The title sits in its band, the body in its window. */}
              <div className="loc-frame" aria-hidden style={{ backgroundImage: `url("${pageUrl(artUrl('frames', `location-${lead === 'A' ? 'gold' : lead === 'B' ? 'blue' : 'unowned'}`, 'webp'))}")` }} />
              {fx?.locStamp?.[loc.index] && <div className={`loc-stamp ${fx.locStamp[loc.index].tone}`}>{fx.locStamp[loc.index].title}</div>}
              {/* Every fill (the plate, the photograph, the parchment band) lives in one layer masked to the frame's interior, so no edge ever shows past the frame. */}
              <div className="loc-fill" aria-hidden style={{ WebkitMaskImage: `url("${pageUrl(artUrl('frames', 'location-mask', 'webp'))}")`, maskImage: `url("${pageUrl(artUrl('frames', 'location-mask', 'webp'))}")` }}>
                <div className="loc-fill-body" />
                {loc.revealed && !placeholders && (
                  /* Keyed by the place, so a retold Location (Anansi) develops in the window like a fresh reveal. */
                  <div className="loc-bg" key={loc.defId}>
                    <div className="loc-shine" aria-hidden />
                    {nightHere ? (
                      <Art kind="locations" id={`${loc.defId}_night`} className="loc-bg-img" fallback={<Art kind="locations" id={loc.defId} className="loc-bg-img" fallback={null} alt="" />} alt="" />
                    ) : (
                      <Art kind="locations" id={loc.defId} className="loc-bg-img" fallback={null} alt="" />
                    )}
                  </div>
                )}
                <div className="loc-fill-band" />
              </div>
              <div
                key={loc.revealed ? 'r' : 'h'}
                className={`art ${loc.revealed ? 'reveal-anim' : 'hidden-art'}`}
                style={loc.revealed ? { background: `linear-gradient(135deg, hsl(${(loc.defId.length * 47) % 360} 30% 24%), hsl(${(loc.defId.length * 47 + 60) % 360} 30% 14%))` } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onLocationInfo(loc.index);
                }}
              >
                <span className="art-name">{loc.revealed || (view.players[me].knownNextReveal === loc.index && loc.defId !== 'unknown') ? locationName(loc.defId, placeholders) : 'Unknown Location'}</span>
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
                {!loc.lost && loc.treatyTorn && view.turn <= loc.treatyTorn.until && <CardTag id="taytu_betul" mine={loc.treatyTorn.by === me} label="No treaty" turns={loc.treatyTorn.until - view.turn + 1} tipText={HINTS.treatyTorn} onOpen={onCard} />}
                {!loc.lost && loc.teamUps?.map((t) => <span key={`${t.id}-${t.owner}`} className={`lost-tag teamup ${t.owner === me ? 'mine' : 'theirs'}`} {...tip(`Team-up, ${TEAM_UP_BY_ID[t.id].name} (${view.players[t.owner].handle}): ${TEAM_UP_BY_ID[t.id].text} It holds while both remain Inside.`)}>{TEAM_UP_BY_ID[t.id].name.toUpperCase()}</span>)}
                {!loc.lost && loc.oath && loc.threats.some((t) => t.uid === loc.oath!.threatUid) && <span className="lost-tag oath" {...tip(HINTS.oath)}>OATH</span>}
                {!loc.lost && hasCurfew && <SkyTag night={nightHere} />}
                {loc.sanctified && <span className="lost-tag sanct">OBATALA</span>}
                {summon && <span className="summon-tag">{summon}</span>}
              </div>
              <div className="influence">
                <Score p="A" value={inf.A} hurt={fx?.hurt?.location === loc.index && fx.hurt.owner === 'A'} detail={influenceLines(view, loc.index, 'A', me).join('\n')} />
                <div className={`line ${winner && winner !== 'lost' ? `won-${winner}` : ''}`} {...tip(HINTS.line)}>
                  <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                  <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                  <div className="mark" style={{ left: `${fracA * 100}%` }} />
                </div>
                <Score p="B" value={inf.B} hurt={fx?.hurt?.location === loc.index && fx.hurt.owner === 'B'} detail={influenceLines(view, loc.index, 'B', me).join('\n')} />
              </div>
              {(() => {
                // The column seats a Threat by whom it hunts: the opponent's at the top (their row), the area's between, yours at the
                // bottom (your row). A Threat that fell this beat keeps its seat while its ghost lingers, so the fighters charge the
                // tile on their own side, not the seat the ghost would take at the end of the column.
                const rank = (t: ThreatInstance) => (t.target ? (t.target === me ? 2 : 0) : 1);
                const ghosts = fallen.map((g): ThreatInstance => ({ uid: g.uid, defId: g.defId, location: g.location, target: g.target, forceRequired: THREAT_BY_ID[g.defId]?.force ?? 0, spawnedTurn: -1 }));
                const seated = [...loc.threats.map((t) => ({ t, gone: false })), ...ghosts.map((t) => ({ t, gone: true }))].sort((a, b) => rank(a.t) - rank(b.t));
                const has = seated.length > 0;
                return (
                  <div className="inside-block">
                    <div className="inside-rows">
                      <InsideRow {...common} owner={opp} index={loc.index} label="Opponent" />
                      <InsideRow {...common} owner={me} index={loc.index} label="You" />
                    </div>
                    {/* The column is always reserved, so the rows never change shape; empty, it shows the Location's art. */}
                    <div className={`threat-col ${has ? '' : 'empty'}`} aria-hidden={!has}>
                      {seated.map(({ t, gone }) =>
                        gone ? (
                          <ThreatTile key={`gone:${t.uid}`} t={t} view={view} me={me} plan={plan} onThreat={onThreat} gone={!fx?.alive?.includes(t.uid)} goneWhy={fallen.find((g) => g.uid === t.uid)?.why} hidden={fx?.hidden.includes(t.uid)} hit={fx?.flash?.uid === t.uid ? fx.flash.kind : undefined} shatter={fx?.shatter === t.uid} stamp={fx?.stamp?.uid === t.uid ? fx.stamp : undefined} />
                        ) : (
                          <ThreatTile key={t.uid} t={t} view={view} me={me} plan={plan} drop={drop} foreseen={!!foreseen?.threats.includes(t.uid)} flash={flash === 'threat' && glowLocation !== null && glowLocation !== undefined && glowLocation !== loc.index ? null : flash} onThreat={onThreat} hidden={fx?.hidden.includes(t.uid)} hit={fx?.flash?.uid === t.uid ? fx.flash.kind : undefined} stamp={fx?.stamp?.uid === t.uid ? fx.stamp : undefined} />
                        ),
                      )}
                    </div>
                  </div>
                );
              })()}
              <InEffect view={view} index={loc.index} me={me} onOpen={() => onLocationInfo(loc.index)} />
              <LocRule
                text={loc.lost ? `LOST: ${loc.lostReason ?? 'an unresolved crisis'} Neither player can win here.` : loc.revealed ? (def.short ?? def.rule) : 'Hidden until revealed. Commit blind.'}
                more={loc.revealed}
                onOpen={() => onLocationInfo(loc.index)}
              />
            </div>
            </div>
            <GateStrip {...common} owner={me} index={loc.index} label="The Gates" />
          </div>
        );
      })}
    </div>
  );
}
