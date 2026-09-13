import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_BY_ID, viewFor, legalOptions, validatePlan, gateRoom, GATE_CAPACITY, lockReason, PLANNING_SECONDS, insideOpen, insideCapacity, isBlockedFromEntering, charsAt, locDef, THREAT_BY_ID, SUMMON, emptyPlan, type PlayerId, type TurnPlan, type GameEvent, type GameState, other, MAX_HAND, EXTENDED_TURNS, ENERGY_CAP, planCost, cardCost, costBreakdown, filterEvents, LOCATION_BY_ID } from '../../engine';
import { useDrag, targetKey, type DragPayload, type DropTarget } from '../drag';
import { CardFace, Pic } from '../components/CardFace';
import type { DropHighlight, BoardFx } from '../components/Battlefield';
import { previewPlan, remainingPlan, isPlannedUid, PLANNED_PREFIX } from '../preview';
import type { MatchController } from '../useMatch';
import { Hud } from '../components/Hud';
import { Battlefield } from '../components/Battlefield';
import { Hand } from '../components/Hand';
import { Coach } from '../components/Coach';
import { Spotlight } from '../components/Spotlight';
import { sfx, voice } from '../audio';
import type { TraceStep } from '../../engine';
import { Trails, TRAIL_COLORS, type TrailShot } from '../components/Trails';
import { ghostOf, fly, jolt, partWay, clearGhosts, wait, painted, type Ghost } from '../fly';
import { DigReveal, type DigShow, type DigPhase } from '../components/DigReveal';
import { CardSheet, CharSheet, ChatSheet, ConfirmSheet, LocationSheet, LogSheet, ProfileSheet, ThreatSheet, AncestorsSheet, CLASH_TITLES, adviceFor, showdownWhy, type ShowdownData } from '../components/Sheets';
import { markGuideDone, suggest } from '../guide';
import { lessonsFor, tutorialActive } from '../tutorial';
import { EMOTES } from '../useMatch';
import { cardName, locationName, spawnText, useDisplay } from '../display';
import { tip, HINTS } from '../tip';

type SheetState =
  | { kind: 'card'; id: string }
  | { kind: 'char'; uid: string }
  | { kind: 'threat'; uid: string }
  | { kind: 'location'; index: number }
  | { kind: 'profile'; p: PlayerId }
  | { kind: 'stepOff' }
  | { kind: 'ancestors' }
  | { kind: 'peek'; cards: string[]; by: string }
  | { kind: 'log' }
  | { kind: 'chat' }
  | null;

/** How long each replay beat holds on screen before the next. */
const BEAT_MS: Record<string, number> = {
  stand: 1400,
  reveal: 1400,
  play: 950,
  event: 1300,
  revealFx: 1400,
  enter: 800,
  move: 900,
  showdown: 700,
  summon: 1200,
  threat: 1200,
  spawn: 600,
  ready: 700,
  sundown: 1200,
  turncoat: 1300,
  info: 500,
  tally: 1200,
  stakes: 1300,
};
const BEAT_KIND: Record<string, string> = {
  turncoat: 'Charleston',
  stand: 'Stand',
  reveal: 'Location',
  play: 'Play',
  event: 'Event',
  revealFx: 'Reveal',
  enter: 'Enter',
  move: 'Move',
  showdown: 'Showdown',
  summon: 'Summon',
  threat: 'Threat',
  spawn: 'Arrival',
  ready: 'Ready',
  sundown: 'Sundown',
  info: '',
  tally: 'Tally',
  stakes: 'Legacy',
};

/** A clash event's payload, as resolve.ts writes it. */
type ClashData = {
  actor: { kind: 'character' | 'threat' | 'location' | 'event'; id: string; owner?: PlayerId; force?: number };
  victim: { uid: string; defId: string; owner: PlayerId; force: number };
  outcome: keyof typeof CLASH_TITLES;
  from: number;
  to?: number;
  theirForce?: number;
  note?: string;
  intent?: string;
};
/** Outcomes where the victim stays put: it takes the hit where it stands rather than flying anywhere. */
const STAYS = new Set<string>(['held', 'blocked', 'suppressed', 'tricked', 'hexed', 'amnestied']);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/** The board tile that struck: a Character of that card and owner, or the Threat of that kind at the Location. */
const actorUidFor = (d: ClashData, v: GameState): string | undefined => {
  if (d.actor.kind === 'character') return Object.values(v.characters).find((c) => c.defId === d.actor.id && (d.actor.owner === undefined || c.owner === d.actor.owner))?.uid;
  if (d.actor.kind === 'threat') return v.locations[d.from]?.threats.find((t) => t.defId === d.actor.id)?.uid;
  return undefined;
};
const tileOf = (uid: string) => document.querySelector(`[data-uid="${uid}"], [data-threat="${uid}"]`);
/** Where a blow comes from when no tile threw it: the Location's art, or the Event at its Gates. */
const sourceRect = (d: ClashData): DOMRect | undefined => {
  const col = `.column[data-index="${d.from}"]`;
  const el = d.actor.kind === 'event' ? document.querySelector(`${col} .event-slot`) ?? document.querySelector(`${col} .art`) : document.querySelector(`${col} .art`);
  return el?.getBoundingClientRect();
};

/** The last scheduled turn can still grow by one if someone Stands on Business. */
function finalTurnLabel(view: GameState, short = false): string | null {
  if (view.phase === 'ended' || view.turn < view.maxTurns) return null;
  const lastWord = view.maxTurns === EXTENDED_TURNS;
  const extendable = !lastWord && (!view.players.A.standUsed || !view.players.B.standUsed);
  if (short) return lastWord ? 'LAST WORD' : extendable ? 'LAST?' : 'FINAL';
  return lastWord ? 'THE LAST WORD' : extendable ? 'Last turn unless someone stands' : 'Final turn';
}

/** How hard the Lock In button flashes as the planning timer drains. */
function urgency(secondsLeft: number): string {
  const frac = secondsLeft / PLANNING_SECONDS;
  if (frac <= 0.1) return 'crit';
  if (frac <= 0.25) return 'low';
  if (frac <= 0.5) return 'warn';
  return '';
}

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth <= 700);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth <= 700);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return compact;
}

export function MatchScreen({ m, coach, tutorial = false, onExit }: { m: MatchController; coach: boolean; tutorial?: boolean; onExit: () => void }) {
  const { view, perspective: me, plan, setPlan: setPlanRaw, locked, busy } = m;
  // Undo history for the current plan.
  const [history, setHistory] = useState<TurnPlan[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const setPlan = useCallback(
    (fn: (p: TurnPlan) => TurnPlan) => {
      setHistory((h) => [...h.slice(-30), planRef.current]);
      setPlanRaw(fn);
    },
    [setPlanRaw],
  );
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setPlanRaw(() => prev);
      return h.slice(0, -1);
    });
  }, [setPlanRaw]);
  // Feedback for moves that cannot happen.
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'warn' | 'info'>('warn');
  const feedback = useCallback((text: string, shake: string[] = [], tone: 'warn' | 'info' = 'warn') => {
    setToastTone(tone);
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 3200);
    for (const sel of shake) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        window.setTimeout(() => el.classList.remove('shake'), 600);
      });
    }
  }, []);
  const { placeholders } = useDisplay();
  const compact = useCompact();
  const [selected, setSelected] = useState<string | null>(null);
  /** A card tapped that cannot be played right now: it shakes once. */
  const [rejectId, setRejectId] = useState<string | null>(null);
  /** The 250 ms after a card was put down or a drag ended: no hover lift, so nothing pops straight back up under the pointer. */
  const [settle, setSettle] = useState(false);
  const settleFor = useCallback(() => {
    setSettle(true);
    window.setTimeout(() => setSettle(false), 250);
  }, []);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** Match over and the player chose to look at the final board instead of the result card. */
  const [peek, setPeek] = useState(() => m.view.phase === 'ended');
  /** The Reckoning's verdict, once every Location has taken its stamp. */
  const [verdict, setVerdict] = useState<{ title: string; line: string; reason: string; tone: 'win' | 'loss' | 'draw' } | null>(null);
  const reckoned = useRef(false);
  // Explainer pop-ups (the first-match guide, the coach's tips) are off outside the tutorial: the board tells the story.
  const [guideOn, setGuideOn] = useState(false);
  const opts = useMemo(() => legalOptions(view, me), [view, me]);
  const step = m.replay ? m.replay.steps[m.replay.idx] : null;
  /** Beats that only re-show one of your own planned moves are skipped. */
  const ownBeat = !!step && !!m.replay && step.player === me && (step.kind === 'play' || step.kind === 'enter' || (step.kind === 'move' && m.replay.plan.relocations.some((r) => step.uids?.includes(r.uid))));
  /** A Gathering's card, flashed over the board as it arrives (no button: it flies to its tile on its own). */
  const [arrival, setArrival] = useState<{ cardId: string; owner: PlayerId } | null>(null);
  /** Omar ibn Said's look at the opponent's hand: a strip over the board for a few seconds, then the profile keeps it. */
  const [peekShow, setPeekShow] = useState<{ cards: string[]; by: string } | null>(null);
  const [lastPeek, setLastPeek] = useState<{ turn: number; cards: string[]; by: string } | null>(null);
  const showPeek = useCallback((ev: GameEvent) => {
    const cards = (ev.data as { peekHand: string[] }).peekHand;
    const by = ev.uid ? cardName(view.characters[ev.uid]?.defId ?? 'omar_ibn_said', placeholders) : 'Omar ibn Said';
    setPeekShow({ cards, by });
    setLastPeek({ turn: view.turn, cards, by });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, placeholders]);
  useEffect(() => {
    if (!peekShow) return;
    const id = window.setTimeout(() => setPeekShow(null), 5000);
    return () => window.clearTimeout(id);
  }, [peekShow]);
  /**
   * Every resolution records Omar's look for the profile, replay or not (a skipped replay never reaches the beat);
   * without a replay (Sit Down, or a resolution with no beats) the strip shows at once. The log has the rest.
   */
  useEffect(() => {
    const peek = m.lastTurn.find((e) => e.player === me && Array.isArray((e.data as { peekHand?: string[] } | undefined)?.peekHand));
    if (!peek) return;
    const cards = (peek.data as { peekHand: string[] }).peekHand;
    setLastPeek({ turn: view.turn, cards, by: peek.uid ? cardName(view.characters[peek.uid]?.defId ?? 'omar_ibn_said', placeholders) : 'Omar ibn Said' });
    if (!m.replay) showPeek(peek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.lastTurn]);
  /** During a replay each beat queues only its own sheets; a clash plays out on the board and tells itself there. */
  /** The choreography's grip on the board: tiles hidden under their flying ghosts, the flash, the stamp. Non-null while a clash plays. */
  const [fx, setFx] = useState<BoardFx | null>(null);
  /** What the banner says while a clash plays: the verdict in the pill, the sentence beside it. */
  const [clashTell, setClashTell] = useState<{ title: string; text: string; sub?: string; tone: 'hit' | 'miss' | 'hex' | 'arrive' } | null>(null);
  /** The board as it stood before this beat: a clash opens on it, so every piece is still where it was struck. */
  const prevView = useMemo(() => (m.replay && m.replay.idx > 0 ? viewFor(m.replay.steps[m.replay.idx - 1].state, me) : null), [m.replay?.idx, m.replay?.steps, me]);
  const [stagePrev, setStagePrev] = useState(false);
  const [shake, setShake] = useState(false);
  /** Text floats up from a point on the screen: a +N over a Location, the Force readout over a clash. */
  const floatText = (x: number, y: number, text: string, cls: string) => {
    const el = document.createElement('div');
    el.className = `float-num ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1600);
  };
  /** A +N floats up from a Location's art. */
  const floatNum = (location: number, amount: number, tone: 'artist' | 'mine' | 'theirs') => {
    const art = document.querySelector(`.column[data-index="${location}"] .art`);
    if (!art) return;
    const r = art.getBoundingClientRect();
    floatText(r.left + r.width / 2, r.top + r.height / 2, `+${amount}`, tone);
  };
  const landFx = (items: { location: number; amount?: number; tone: 'artist' | 'mine' | 'theirs' }[]) => {
    if (items.some((it) => it.amount)) sfx('influence.up');
    for (const it of items) {
      const loc = document.querySelector(`.column[data-index="${it.location}"] .loc-glow`);
      if (loc) {
        loc.classList.remove('loc-pulse', 'artist', 'mine', 'theirs');
        void (loc as HTMLElement).offsetWidth;
        loc.classList.add('loc-pulse', it.tone);
        window.setTimeout(() => loc.classList.remove('loc-pulse', it.tone), 1100);
      }
      if (it.amount) floatNum(it.location, it.amount, it.tone);
    }
  };
  /** During a replay your own moves stay where you put them; the board only re-animates what you could not see coming. */
  const boardView = useMemo(() => {
    if (stagePrev && prevView && m.replay) return previewPlan(prevView, me, remainingPlan(prevView, me, m.replay.plan));
    if (m.replay && step) return previewPlan(view, me, remainingPlan(step.state, me, m.replay.plan));
    return view.phase === 'planning' && !locked ? previewPlan(view, me, plan) : view;
  }, [view, me, plan, locked, m.replay, step, stagePrev, prevView]);
  /** Power trails on the board (a Reveal that reaches other Locations): particles fly from the actor to each target. */
  const [trail, setTrail] = useState<TrailShot[] | null>(null);
  const [trailFreeze, setTrailFreeze] = useState<number | undefined>(undefined);
  /** Zora's dig, told on screen: the cards seen, the one kept. */
  const [dig, setDig] = useState<DigShow | null>(null);
  const digKey = useRef(0);
  const [digFreeze, setDigFreeze] = useState<DigPhase | undefined>(undefined);
  /** The impact: the hit is heard, the board jolts, sparks spray off the victim. */
  const impactAt = (v: DOMRect) => {
    sfx('clash.hit');
    const spray = new DOMRect(v.left + 90, v.top - 30, v.width, v.height);
    setTrail([{ from: v, to: spray, color: TRAIL_COLORS.impact, noRibbon: true }]);
    setShake(true);
    window.setTimeout(() => setShake(false), 320);
  };
  /** Where a knocked victim's ghost flies: its real tile's new place, or off the board toward the hand it goes back to. */
  const destRect = (d: ClashData): { rect: DOMRect; offBoard: boolean } | null => {
    const tile = document.querySelector(`[data-uid="${d.victim.uid}"]`);
    if (tile) return { rect: tile.getBoundingClientRect(), offBoard: false };
    if (d.outcome === 'arrested') return null;
    const receiver: PlayerId = d.outcome === 'exposed' ? other(d.victim.owner) : d.victim.owner;
    const el = receiver === me ? document.querySelector('.hand') : document.querySelector(`.profile.p${receiver}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { rect: new DOMRect(r.left + r.width / 2 - 30, r.top + r.height / 2 - 30, 60, 60), offBoard: true };
  };

  /**
   * One clash, told on the board (see fly.ts). The striker's ghost gathers itself and charges the victim; on impact
   * the board jolts and the Force readout floats up. A victim knocked somewhere flies there as a ghost and its real
   * tile pops in with the verdict stamped on it; one that stands its ground flashes and takes the stamp where it is.
   * The striker comes back to its slot. The banner carries the sentence throughout, then the verdict holds long
   * enough to read. `ghosts` were taken from the board as it stood before the beat; `alive` is false once the beat
   * has moved on (a skip), and every step checks it.
   */
  const playClash = async (ev: GameEvent, ghosts: Map<string, Ghost>, alive: () => boolean, last: boolean, demoDest?: DOMRect) => {
    const d = ev.data as ClashData;
    const outcome = d.outcome;
    const tone: 'hit' | 'miss' | 'hex' = outcome === 'held' || outcome === 'amnestied' ? 'miss' : outcome === 'hexed' ? 'hex' : 'hit';
    const title = CLASH_TITLES[outcome] ?? String(outcome).toUpperCase();
    const victimUid = d.victim.uid;
    const actorUid = actorUidFor(d, prevView ?? view);
    const toName = d.to !== undefined ? locationName(view.locations[d.to].revealed ? view.locations[d.to].defId : 'unknown', placeholders) : undefined;
    const sub = d.note ?? d.intent ?? (d.victim.owner === me ? adviceFor(view, me, d.actor, outcome, d.from, placeholders) || undefined : undefined);
    const stampOn = (uid: string) => ({ uid, title, sub: toName ? `to ${toName}` : undefined, tone });
    const patch = (f: BoardFx | null, p: Partial<BoardFx>): BoardFx => ({ ...(f ?? { hidden: [] }), ...p });
    setClashTell({ title, text: ev.text, sub, tone });
    const vg = ghosts.get(victimUid);
    let ag = actorUid ? ghosts.get(actorUid) : undefined;
    // One striker, several victims in a beat (Thunder, a sweep Inside): its ghost went home after the last knock, so take a new one from where it stands now.
    if (ag && actorUid && !ag.el.isConnected) {
      const el = tileOf(actorUid);
      if (el) {
        ag = ghostOf(el);
        ghosts.set(actorUid, ag);
        setFx((f) => patch(f, { hidden: [...(f?.hidden ?? []).filter((u) => u !== actorUid), actorUid] }));
        await painted();
        if (!alive()) return;
      } else {
        ag = undefined;
      }
    }
    const victimRect = vg?.base ?? tileOf(victimUid)?.getBoundingClientRect();
    if (reduceMotion()) {
      if (tileOf(victimUid)) setFx((f) => patch(f, { stamp: stampOn(victimUid) }));
      await wait(1600);
      if (alive()) setFx((f) => (f ? { ...f, stamp: undefined } : f));
      return;
    }
    // 1. Wind-up: the striker gathers itself where it stands.
    if (ag) {
      ag.el.querySelector('.pic')?.classList.add('fx-windup');
      await wait(340);
      if (!alive()) return;
    }
    // 2. The charge: the striker's ghost crosses to the victim (with no striker tile, a bolt from the source).
    if (ag && victimRect) {
      ag.el.querySelector('.pic')?.classList.remove('fx-windup');
      ag.el.classList.add('charging');
      sfx('move');
      // Slow in, fast strike: the charge is quick and stops just short, overlapping the victim's edge (Hearthstone stages its lunge the same way).
      await fly(ag, partWay(ag.base, victimRect, 0.8), { ms: 280, easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)', swell: 1.12, arc: 10 });
    } else if (victimRect) {
      const src = sourceRect(d) ?? victimRect;
      sfx('trail');
      setTrail([{ from: src, to: victimRect, color: TRAIL_COLORS.impact }]);
      await wait(950);
    }
    if (!alive()) return;
    // 3. Hit stop, then impact: for a few frames both pieces freeze and the victim flashes white; then the blow lands.
    if (vg) {
      vg.el.querySelector('.pic')?.classList.add('hit-stop');
      await wait(90);
      if (!alive()) return;
      vg.el.querySelector('.pic')?.classList.remove('hit-stop');
    }
    if (victimRect) {
      impactAt(victimRect);
      if (d.actor.force !== undefined && d.theirForce !== undefined && outcome !== 'hexed') floatText(victimRect.left + victimRect.width / 2, victimRect.top + victimRect.height * 0.3, `${d.actor.force} vs ${d.theirForce}`, `clash ${tone === 'miss' ? 'miss' : ''}`);
    }
    if (ag) void jolt(ag, 260, 5);
    if (vg) {
      vg.el.querySelector('.pic')?.classList.add('fx-knocked');
      void jolt(vg, 300, 8);
    } else {
      setFx((f) => patch(f, { flash: { uid: victimUid, kind: outcome === 'held' || outcome === 'amnestied' ? 'held' : outcome === 'hexed' ? 'hexed' : 'hit' } }));
    }
    await wait(240);
    if (!alive()) return;
    // 4. The knock: the victim's ghost flies to where it was sent; the striker's ghost comes back to its slot, slowly.
    const actorBack = actorUid ? tileOf(actorUid)?.getBoundingClientRect() : undefined;
    const returnStriker = ag
      ? (async () => {
          await wait(60);
          ag.el.classList.remove('charging');
          if (actorBack) await fly(ag, actorBack, { ms: outcome === 'held' ? 460 : 640, easing: outcome === 'held' ? 'cubic-bezier(0.2, 0.9, 0.3, 1.25)' : 'cubic-bezier(0.15, 0.7, 0.2, 1)', spin: outcome === 'held' ? -8 : 0, remove: true });
          else await fly(ag, ag.base, { ms: 300, fade: true, remove: true });
          if (!alive() || !actorUid) return;
          setFx((f) => (f ? { ...f, hidden: f.hidden.filter((u) => u !== actorUid) } : f));
        })()
      : Promise.resolve();
    if (vg) {
      const dest = demoDest ? { rect: demoDest, offBoard: false } : destRect(d);
      if (outcome === 'exposed' || outcome === 'arrested') sfx('clash.arrest');
      if (dest) {
        const dir = Math.sign(dest.rect.left - vg.base.left) || 1;
        await fly(vg, dest.rect, { ms: dest.offBoard ? 620 : 760, easing: 'cubic-bezier(0.25, 0.75, 0.3, 1)', arc: dest.offBoard ? 30 : 70, spin: dir * (dest.offBoard ? 40 : 24), swell: 1.16, fade: dest.offBoard, remove: true });
      } else {
        await fly(vg, vg.base, { ms: 600, spin: 20, fade: true, remove: true });
      }
      if (!alive()) return;
      if (dest && !dest.offBoard && tileOf(victimUid)) {
        sfx('card.drop');
        setFx((f) => patch(f, { hidden: (f?.hidden ?? []).filter((u) => u !== victimUid), land: victimUid, stamp: stampOn(victimUid) }));
      } else {
        setFx((f) => patch(f, { hidden: (f?.hidden ?? []).filter((u) => u !== victimUid) }));
      }
    } else {
      await wait(320);
      if (!alive()) return;
      if (tileOf(victimUid)) setFx((f) => patch(f, { stamp: stampOn(victimUid) }));
    }
    await returnStriker;
    if (!alive()) return;
    // 5. The verdict holds.
    await wait(last ? 1200 : 900);
    if (!alive()) return;
    setFx((f) => (f ? { ...f, stamp: undefined, land: undefined, flash: undefined } : f));
  };

  /**
   * A showdown, told on the board: every confronting Character's ghost charges the Threat together; on impact the
   * Force readout floats up; a neutralized Threat breaks apart into its grey tile, one that holds flashes green and
   * takes a HOLDS stamp; the fighters drift back. The banner carries the sentence and the why.
   */
  const playShowdown = async (ev: GameEvent, alive: () => boolean) => {
    const d = ev.data as ShowdownData;
    const total = d.force.A + d.force.B;
    const tone: 'hit' | 'miss' = d.cleared ? 'miss' : 'hit';
    const patch = (f: BoardFx | null, p: Partial<BoardFx>): BoardFx => ({ ...(f ?? { hidden: [] }), ...p });
    setClashTell({ title: d.cleared ? 'NEUTRALIZED' : 'HOLDS', text: ev.text, sub: showdownWhy(d, view, placeholders), tone });
    const threatEl = tileOf(d.threatUid);
    const fighters = d.fighters.map((f) => f.uid).filter((uid) => !!tileOf(uid));
    if (!threatEl || reduceMotion() || !fighters.length) {
      setFx((f) => patch(f, { alive: [], stamp: threatEl ? { uid: d.threatUid, title: d.cleared ? 'NEUTRALIZED' : 'HOLDS', sub: d.requiresBoth ? undefined : `${total} of ${d.needed}`, tone } : undefined }));
      await wait(1800);
      return;
    }
    const tRect = threatEl.getBoundingClientRect();
    // Stage: the Threat still looks alive, the fighters' ghosts stand where they are.
    setFx((f) => patch(f, { alive: [d.threatUid] }));
    await painted();
    if (!alive()) return;
    const ghosts = fighters.map((uid) => ghostOf(tileOf(uid)!));
    setFx((f) => patch(f, { hidden: [...(f?.hidden ?? []), ...fighters] }));
    await painted();
    if (!alive()) return;
    // 1. Wind-up, all together.
    for (const g of ghosts) g.el.querySelector('.pic')?.classList.add('fx-windup');
    await wait(340);
    if (!alive()) return;
    // 2. The charge: each ghost to its own spot short of the Threat, a beat apart.
    sfx('move');
    await Promise.all(
      ghosts.map((g, i) =>
        wait(i * 70).then(() => {
          g.el.querySelector('.pic')?.classList.remove('fx-windup');
          g.el.classList.add('charging');
          const spread = (i - (ghosts.length - 1) / 2) * tRect.width * 0.55;
          const aim = new DOMRect(tRect.left + spread, tRect.top, tRect.width, tRect.height);
          return fly(g, partWay(g.base, aim, 0.8), { ms: 280, easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)', swell: 1.12, arc: 10 });
        }),
      ),
    );
    if (!alive()) return;
    // 3. Hit stop, then impact.
    await wait(90);
    if (!alive()) return;
    impactAt(tRect);
    floatText(tRect.left + tRect.width / 2, tRect.top + tRect.height * 0.3, d.requiresBoth ? `${d.force.A} + ${d.force.B}` : `${total} vs ${d.needed}`, `clash ${d.cleared ? 'miss' : ''}`);
    for (const g of ghosts) void jolt(g, 260, 5);
    setFx((f) => patch(f, { flash: { uid: d.threatUid, kind: d.cleared ? 'hit' : 'held' } }));
    await wait(240);
    if (!alive()) return;
    // 4. The verdict on the Threat: it breaks, or it holds.
    if (d.cleared) {
      sfx('threat.clear');
      setFx((f) => patch(f, { alive: [], shatter: d.threatUid, flash: undefined }));
    } else {
      setFx((f) => patch(f, { flash: undefined, stamp: { uid: d.threatUid, title: 'HOLDS', sub: d.requiresBoth ? 'needs both' : `${total} of ${d.needed}`, tone: 'hit' } }));
    }
    // 5. The fighters drift back.
    await Promise.all(
      ghosts.map((g, i) =>
        wait(60 + i * 50).then(() => {
          g.el.classList.remove('charging');
          const back = tileOf(fighters[i])?.getBoundingClientRect();
          return back ? fly(g, back, { ms: d.cleared ? 640 : 460, easing: d.cleared ? 'cubic-bezier(0.15, 0.7, 0.2, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.25)', spin: d.cleared ? 0 : -8, remove: true }) : fly(g, g.base, { ms: 300, fade: true, remove: true });
        }),
      ),
    );
    if (!alive()) return;
    setFx((f) => patch(f, { hidden: (f?.hidden ?? []).filter((u) => !fighters.includes(u)) }));
    await wait(1200);
    if (!alive()) return;
    setFx((f) => (f ? { ...f, stamp: undefined, shatter: undefined, flash: undefined, alive: [] } : f));
  };

  /**
   * A Gathering arrives: its card flashes over the board with the headline in the banner, then flies to its tile
   * (or to the hand it joins) and the real tile pops in. No button; the replay moves on by itself.
   */
  const playArrival = async (ev: GameEvent, alive: () => boolean) => {
    if (!ev.cardId || !ev.player) return;
    const def = CARD_BY_ID[ev.cardId] as { name?: string; spawn?: Parameters<typeof spawnText>[0] } | undefined;
    if (!def) return;
    const mine = ev.player === me;
    const zone = (ev.data as { zone?: string } | undefined)?.zone;
    const patch = (f: BoardFx | null, p: Partial<BoardFx>): BoardFx => ({ ...(f ?? { hidden: [] }), ...p });
    const rule = def.spawn ? spawnText(def.spawn).replace('Not in any deck. ', '') : '';
    setClashTell({ title: 'ARRIVAL', text: ev.text, sub: `${mine ? 'Yours now. ' : `${view.players[ev.player].handle}'s. `}${zone === 'hand' ? 'It is in the hand now and costs nothing.' : rule}`.trim(), tone: 'arrive' });
    if (ev.uid) setFx((f) => patch(f, { hidden: [...(f?.hidden ?? []), ev.uid!] }));
    setArrival({ cardId: ev.cardId, owner: ev.player });
    await painted();
    if (!alive()) return;
    await wait(reduceMotion() ? 1800 : 1500);
    if (!alive()) return;
    const el = document.querySelector('.card-flash .card');
    const dest = ev.uid ? tileOf(ev.uid)?.getBoundingClientRect() : (() => {
      const h = mine ? document.querySelector('.hand') : document.querySelector(`.profile.p${ev.player}`);
      if (!h) return undefined;
      const r = h.getBoundingClientRect();
      return new DOMRect(r.left + r.width / 2 - 30, r.top + r.height / 2 - 30, 60, 60);
    })();
    if (el && dest && !reduceMotion()) {
      const g = ghostOf(el);
      setArrival(null);
      await painted();
      await fly(g, dest, { ms: 650, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', arc: 30, fade: !ev.uid, remove: true });
    } else {
      setArrival(null);
    }
    if (!alive()) return;
    if (ev.uid && tileOf(ev.uid)) {
      sfx('card.drop');
      setFx((f) => patch(f, { hidden: (f?.hidden ?? []).filter((u) => u !== ev.uid), land: ev.uid }));
    } else {
      setFx((f) => patch(f, { hidden: (f?.hidden ?? []).filter((u) => u !== ev.uid) }));
    }
    await wait(900);
    if (!alive()) return;
    setFx((f) => (f ? { ...f, land: undefined } : f));
  };

  useEffect(() => {
    if (!step) return;
    const evs = filterEvents(step.events, me);
    let cancelled = false;
    const alive = () => !cancelled;
    const digEv = evs.find((e) => (e.data as { dig?: DigShow } | undefined)?.dig && e.player);
    if (digEv && !reduceMotion()) {
      const d = (digEv.data as { dig: { seen: string[]; keep: string; hidden: boolean } }).dig;
      digKey.current += 1;
      sfx('dig');
      setDig({ seen: d.seen, keep: d.keep, hidden: d.hidden, owner: digEv.player!, by: digEv.uid ? cardName(view.characters[digEv.uid]?.defId ?? 'zora_neale_hurston', placeholders) : undefined });
    }
    const trailEvs = evs.filter((e) => (e.data as { trail?: string } | undefined)?.trail && e.uid && e.location !== undefined);
    const clashEvs = evs.filter((e) => e.type === 'clash');
    const showdownEvs = evs.filter((e) => e.type === 'showdown');
    const arrivalEvs = evs.filter((e) => e.type === 'spawned' && !!e.cardId && !!e.player);
    const finish = () => {
      const peek = evs.find((e) => e.player === me && Array.isArray((e.data as { peekHand?: string[] } | undefined)?.peekHand));
      if (peek) showPeek(peek);
    };
    const run = async () => {
      if (trailEvs.length && !reduceMotion()) {
        // Measure after this beat's board has rendered.
        await painted();
        if (!alive()) return;
        const shots: TrailShot[] = [];
        for (const e of trailEvs) {
          const from = document.querySelector(`[data-uid="${e.uid}"]`)?.getBoundingClientRect();
          const to = document.querySelector(`.column[data-index="${e.location}"] .art`)?.getBoundingClientRect();
          if (!from || !to) continue;
          const amount = (e.data as { amount?: number }).amount;
          const tone = (e.data as { color?: string }).color;
          shots.push({ from, to, color: tone === 'artist' ? TRAIL_COLORS.artist : TRAIL_COLORS[e.player ?? 'A'], label: amount ? `+${amount}` : undefined });
        }
        if (shots.length) sfx('trail');
        setTrail(shots.length ? shots : null);
        // When the trail lands (~1050ms): a floating +N over the Location and a pulse on its panel.
        window.setTimeout(() => landFx(trailEvs.map((e) => ({ location: e.location!, amount: (e.data as { amount?: number }).amount, tone: (e.data as { color?: string }).color === 'artist' ? 'artist' : e.player === me ? 'mine' : 'theirs' }))), 1050);
        if (clashEvs.length) await wait(1200);
        if (!alive()) return;
      }
      if (clashEvs.length) {
        // Stage the clash on the board as it stood before the beat, and take ghosts of every piece that will fly.
        setFx({ hidden: [] });
        setStagePrev(true);
        await painted();
        if (!alive()) return;
        const ghosts = new Map<string, Ghost>();
        const prev = prevView ?? view;
        if (!reduceMotion()) {
          for (const e of clashEvs) {
            const d = e.data as ClashData;
            for (const uid of [actorUidFor(d, prev), STAYS.has(d.outcome) ? undefined : d.victim.uid]) {
              if (!uid || ghosts.has(uid)) continue;
              const el = tileOf(uid);
              if (el) ghosts.set(uid, ghostOf(el));
            }
          }
        }
        setStagePrev(false);
        setFx({ hidden: [...ghosts.keys()] });
        await painted();
        for (let i = 0; i < clashEvs.length; i++) {
          if (!alive()) return;
          await playClash(clashEvs[i], ghosts, alive, i === clashEvs.length - 1);
        }
        if (!alive()) return;
        clearGhosts();
        setFx(null);
        setClashTell(null);
      }
      if (showdownEvs.length || arrivalEvs.length) {
        setFx((f) => f ?? { hidden: [] });
        for (const ev of showdownEvs) {
          if (!alive()) return;
          await playShowdown(ev, alive);
        }
        for (const ev of arrivalEvs) {
          if (!alive()) return;
          await playArrival(ev, alive);
        }
        if (!alive()) return;
        clearGhosts();
        setFx(null);
        setClashTell(null);
      }
      finish();
    };
    void run();
    return () => {
      cancelled = true;
      clearGhosts();
      setStagePrev(false);
      setFx(null);
      setClashTell(null);
      setArrival(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.replay?.idx, m.replay?.steps]);
  // One sound per replay beat (my own beats were heard when I planned them); strikes, trails and digs have their own cues.
  useEffect(() => {
    if (step && !ownBeat) {
      beatSfx(step);
      if (step.kind === 'play' && step.cardId) voice(step.cardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.replay?.idx, m.replay?.steps]);
  const turnHeard = useRef(view.turn);
  useEffect(() => {
    if (m.replay || turnHeard.current === view.turn) return;
    turnHeard.current = view.turn;
    sfx('turn');
  }, [view.turn, m.replay]);
  /** Advance the replay once this beat's sheets are closed. */
  useEffect(() => {
    if (!step || fx || trail || dig || arrival || peekShow) return;
    const ms = ownBeat ? 0 : BEAT_MS[step.kind] ?? 900;
    const id = window.setTimeout(m.replayNext, ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.replay?.idx, m.replay?.steps, arrival, peekShow, fx, trail, dig]);
  useEffect(() => {
    document.body.classList.toggle('board-shake', shake);
    return () => document.body.classList.remove('board-shake');
  }, [shake]);
  /** Dev: preview a trail from a Character tile to Locations without playing to it (window.__sobTrail(uid, [0, 2])). */
  const devRef = useRef({ view, playClash, playArrival });
  devRef.current = { view, playClash, playArrival };
  useEffect(() => {
    if (!window.location.search.includes('dev=1')) return;
    (window as unknown as { __sobTrail?: (uid: string, locs: number[], side?: 'A' | 'B' | 'artist', freezeAt?: number) => void }).__sobTrail = (uid, locs, side = 'A', freezeAt) => {
      setTrailFreeze(freezeAt);
      const from = document.querySelector(`[data-uid="${uid}"]`)?.getBoundingClientRect();
      if (!from) return;
      const shots: TrailShot[] = [];
      for (const i of locs) {
        const to = document.querySelector(`.column[data-index="${i}"] .art`)?.getBoundingClientRect();
        if (to) shots.push({ from, to, color: TRAIL_COLORS[side as 'A' | 'B' | 'artist'], label: '+1' });
      }
      sfx('trail');
      setTrail(shots);
      if (freezeAt === undefined) window.setTimeout(() => landFx(locs.map((location) => ({ location, amount: 1, tone: side === 'artist' ? 'artist' : side === 'A' ? 'mine' : 'theirs' }))), 1050);
    };
    /** Dev: play a clash between two tiles on the board as it stands (window.__sobClash(actorUid, victimUid, 'displaced', 1)). */
    (window as unknown as { __sobClash?: (actor: string, victim: string, outcome?: string, to?: number) => void }).__sobClash = (actor, victim, outcome = 'displaced', to = 1) => {
      const { view, playClash } = devRef.current;
      const a = view.characters[actor];
      const v = view.characters[victim];
      if (!a || !v) return;
      const adef = CARD_BY_ID[a.defId] as { name: string; force: number };
      const vdef = CARD_BY_ID[v.defId] as { name: string; force: number };
      const ev: GameEvent = { type: 'clash', text: `${adef.name} beats ${vdef.name} (${adef.force} Force against ${vdef.force}) and knocks them away to the Gates of another Location.`, location: v.location, uid: victim, player: a.owner, data: { actor: { kind: 'character', id: a.defId, owner: a.owner, force: adef.force }, victim: { uid: victim, defId: v.defId, owner: v.owner, force: vdef.force }, outcome, from: v.location, to: STAYS.has(outcome) ? undefined : to, theirForce: vdef.force } };
      const ghosts = new Map<string, Ghost>();
      for (const uid of [actor, STAYS.has(outcome) ? undefined : victim]) {
        const el = uid ? tileOf(uid) : null;
        if (uid && el) ghosts.set(uid, ghostOf(el));
      }
      setFx({ hidden: [...ghosts.keys()] });
      const dest = document.querySelector(`.column[data-index="${to}"] .gates`)?.getBoundingClientRect();
      void (async () => {
        await painted();
        await playClash(ev, ghosts, () => true, true, STAYS.has(outcome) ? undefined : dest ? new DOMRect(dest.left + dest.width / 2 - 40, dest.top, 80, 80) : undefined);
        clearGhosts();
        setFx(null);
        setClashTell(null);
      })();
    };
    /** Dev: a Gathering's arrival flash (window.__sobArrival('chairteenth', uidOnBoard?)). */
    (window as unknown as { __sobArrival?: (cardId: string, uid?: string) => void }).__sobArrival = (cardId, uid) => {
      const ev: GameEvent = { type: 'spawned', text: `${(CARD_BY_ID[cardId] as { name?: string } | undefined)?.name ?? cardId} arrives.`, player: 'A', cardId, uid, location: 0, data: { zone: uid ? 'gate' : 'hand' } };
      void (async () => {
        setFx({ hidden: [] });
        await devRef.current.playArrival(ev, () => true);
        clearGhosts();
        setFx(null);
        setClashTell(null);
      })();
    };
    (window as unknown as { __sobDig?: (seen: string[], keep: string, hidden?: boolean, freeze?: DigPhase, owner?: PlayerId) => void }).__sobDig = (seen, keep, hidden = false, freeze, owner = 'A') => {
      setDigFreeze(freeze);
      digKey.current += 1;
      sfx('dig');
      setDig({ seen, keep, hidden, owner });
    };
  }, []);
  /** Gate slots my departing Characters still hold this turn (the preview shows them elsewhere). */
  const reserved = useMemo(() => {
    const out: Record<number, { uid: string; defId: string; why: string; zone: 'gate' | 'inside'; dir: 'left' | 'right' | 'up'; through?: boolean }[]> = {};
    if (view.phase !== 'planning' || locked) return out;
    // A card played straight Inside still passes through the Gates: its slot is drawn as taken, not empty.
    for (const pl of plan.plays) {
      const def = CARD_BY_ID[pl.cardId] as { kind?: string; keywords?: string[] } | undefined;
      if (def?.kind !== 'character') continue;
      const straight = def.keywords?.includes('STRAIGHT_INSIDE') || (def.keywords?.includes('DIRECT_ENTRY') && pl.enter);
      if (straight && insideOpen(view, pl.location, me)) (out[pl.location] ??= []).push({ uid: `${PLANNED_PREFIX}${pl.cardId}`, defId: pl.cardId, why: 'goes straight Inside', zone: 'gate', dir: 'up', through: true });
    }
    const add = (uid: string, why: string, to?: number) => {
      const c = view.characters[uid];
      if (!c || c.owner !== me) return;
      const dir = to === undefined || to === c.location ? 'up' : to < c.location ? 'left' : 'right';
      (out[c.location] ??= []).push({ uid, defId: c.defId, why, zone: c.zone, dir });
    };
    // Gate slots stay taken until the turn resolves; Inside ghosts just show where a piece is going.
    for (const uid of plan.enters) add(uid, 'enters');
    for (const pl of plan.plays) if (pl.target?.charUid && pl.target.location !== undefined) add(pl.target.charUid, `moves with ${cardName(pl.cardId, placeholders)}`, pl.target.location);
    for (const r of plan.relocations) add(r.uid, `relocates to ${view.locations[r.to].revealed ? locationName(view.locations[r.to].defId, placeholders) : `Location ${r.to + 1}`}`, r.to);
    return out;
  }, [view, me, plan, locked, placeholders]);
  /** Threats that fell on this beat: the board keeps their tile up, stamped, until the beat ends. */
  const neutralized = useMemo(
    () =>
      (step?.events ?? [])
        .filter((e) => e.type === 'threatNeutralized' && e.location !== undefined && !!(e.data as { threatUid?: string } | undefined)?.threatUid)
        .map((e) => {
          const d = e.data as { threatUid: string; defId: string; target?: PlayerId };
          return { uid: d.threatUid, defId: d.defId, location: e.location!, target: d.target };
        }),
    [step],
  );
  const planning = view.phase === 'planning' && !locked && !busy;
  /** From Lock In to the next turn the board is a stage, not a desk: nothing drags, the hand sits back, a banner says what is happening. */
  const resolving = !planning && view.phase !== 'ended';
  const [turnFlash, setTurnFlash] = useState<number | null>(null);
  const wasPlanning = useRef(planning);
  useEffect(() => {
    const back = planning && !wasPlanning.current && view.turn > 1;
    wasPlanning.current = planning;
    if (!back) return;
    setTurnFlash(view.turn);
    const id = window.setTimeout(() => setTurnFlash(null), 1150);
    return () => window.clearTimeout(id);
  }, [planning, view.turn]);
  /**
   * The Reckoning, on the board: once the last replay has played, each Location takes its winner's stamp, the
   * loser's Locations first and the decisive one last, then the verdict lands over the board and the corner banner
   * offers the result. No sheet.
   */
  useEffect(() => {
    if (view.phase !== 'ended' || busy || m.replay || reckoned.current) return;
    const r = view.result;
    if (!r) return;
    reckoned.current = true;
    let cancelled = false;
    const winner = r.winner ?? null;
    const handle = (p: PlayerId) => view.players[p].handle;
    const order = [0, 1, 2].sort((a, b) => {
      const rank = (i: number) => {
        const w = r.locationWinners[i];
        if (winner && w === winner) return 2;
        if (w === 'lost' || w === null) return 1;
        return 0;
      };
      return rank(a) - rank(b) || a - b;
    });
    void (async () => {
      await wait(600);
      for (const i of order) {
        if (cancelled) return;
        const w = r.locationWinners[i];
        const tone: 'mine' | 'theirs' | 'lost' | 'tie' = w === 'lost' ? 'lost' : w === null ? 'tie' : w === me ? 'mine' : 'theirs';
        const title = w === 'lost' ? 'Lost' : w === null ? 'Tied' : handle(w);
        setFx((f) => ({ ...(f ?? { hidden: [] }), locStamp: { ...(f?.locStamp ?? {}), [i]: { title, tone } } }));
        if (tone === 'mine' || tone === 'theirs') landFx([{ location: i, tone }]);
        sfx(w === 'lost' ? 'lost' : w === me ? 'stand' : 'card.drop');
        await wait(1150);
      }
      if (cancelled) return;
      const mineWon = winner === me;
      const reason = r.reason === 'locations' ? 'Two of three Locations.' : r.reason === 'tiebreak-influence' ? 'One Location each: total Influence decides.' : r.reason === 'tiebreak-force' ? 'Tied on Influence: total Force decides.' : r.reason === 'stepOff' ? 'The other side sat down.' : 'Nothing separates them.';
      setVerdict({ title: winner ? (mineWon ? 'Victory' : 'Defeat') : 'Draw', line: winner ? `${handle(winner)} wins ${r.stakes} Legacy` : 'Nobody wins the Legacy', reason, tone: winner ? (mineWon ? 'win' : 'loss') : 'draw' });
      sfx(winner ? (mineWon ? 'win' : 'lose') : 'draw.game');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, busy, m.replay]);
  /** Lock In, unless the plan is illegal: then say why instead of letting the engine turn it into a pass. */
  const lockNow = () => {
    const errors = validatePlan(view, me, plan);
    if (errors.length) {
      setToast(errors[0]);
      setToastTone('warn');
      return;
    }
    sfx('lock');
    m.lockIn();
  };
  // Tutorial: one scripted lesson at a time; 'read' lessons modal the board out, 'do' lessons spotlight the target.
  const [tutIdx, setTutIdx] = useState(0);
  useEffect(() => setTutIdx(0), [view.turn]);
  const lessons = useMemo(() => (tutorial && tutorialActive(view) ? lessonsFor(view, me, placeholders) : []), [tutorial, view, me, placeholders]);
  const lesson = planning && tutIdx < lessons.length ? lessons[tutIdx] : null;
  useEffect(() => {
    if (lesson?.kind === 'do' && lesson.done(view, plan)) setTutIdx((i) => i + 1);
  }, [lesson, view, plan]);
  const doing = lesson?.kind === 'do' ? lesson : null;


  // First-turn guide: suggest a concrete move and glow the pieces involved.
  const guide = useMemo(() => (guideOn && view.turn === 1 && planning ? suggest(view, me, placeholders) : null), [guideOn, view, me, planning, placeholders]);
  const guideText = useMemo(() => {
    if (!guide) return null;
    if (guide.play && plan.plays.some((pl) => pl.cardId === guide.play!.cardId && pl.location === guide.play!.location)) return 'That is the move. Press Lock It In.';
    if (plan.plays.length) return `That works too. Or ${guide.text.charAt(0).toLowerCase()}${guide.text.slice(1)}`;
    return guide.text;
  }, [guide, plan]);
  const guideCard: string | string[] | null = doing ? doing.cards ?? doing.card ?? null : guide?.play && !plan.plays.length ? guide.play.cardId : null;
  const guideLocation = doing ? doing.location ?? null : guide?.play && !plan.plays.length && CARD_BY_ID[guide.play.cardId]?.kind === 'character' ? guide.play.location : null;
  useEffect(() => {
    if (guideOn && view.turn > 1) {
      markGuideDone();
      setGuideOn(false);
    }
  }, [guideOn, view.turn]);

  // Reset transient selection on new turn.
  useEffect(() => {
    setSelected(null);
    setSheet(null);
    setHistory([]);
  }, [view.turn, me]);

/** Gate room at a Location after the plays already planned there. */
  const plannedAt = (index: number, except?: string) =>
    plan.plays.filter((pl) => pl.location === index && pl.cardId !== except && CARD_BY_ID[pl.cardId]?.kind === 'character' && !(CARD_BY_ID[pl.cardId] as { keywords?: string[] }).keywords?.includes('INFORMANT')).length;

  /** Can this card still go to Location i, given what is already planned there? Events use the Event slot, Informants the opponent's Gates, everyone else yours. */
  const roomFor = (cardId: string, i: number): boolean => {
    const def = CARD_BY_ID[cardId] as { kind?: string; keywords?: string[] } | undefined;
    if (def?.kind === 'event') return !plan.plays.some((pl) => pl.location === i && pl.cardId !== cardId && CARD_BY_ID[pl.cardId]?.kind === 'event');
    if (def?.keywords?.includes('INFORMANT')) return gateRoom(view, i, other(me), plan.plays.filter((pl) => pl.location === i && pl.cardId !== cardId && (CARD_BY_ID[pl.cardId] as { keywords?: string[] })?.keywords?.includes('INFORMANT')).length) > 0;
    return gateRoom(view, i, me, plannedAt(i, cardId)) > 0;
  };
  /** A card can stand: it has a legal play this turn, costs no more than the Energy left, and is not already planned. */
  const selectable = (id: string) => planning && !!opts.plays.find((p) => p.cardId === id) && !plan.plays.some((pl) => pl.cardId === id) && cardCost(id, view, me) <= energyLeft;
  const whyCannotPlay = (id: string): { text: string; shake: string[] } => {
    const nm = cardName(id, placeholders);
    // The card itself shakes once through `.reject`; only what else explains it is shaken here.
    if (!opts.plays.find((p) => p.cardId === id)) return { text: `${nm} cannot be played right now.`, shake: [] };
    if (cardCost(id, view, me) > energyLeft) return { text: `Not enough Energy: ${nm} costs ${cardCost(id, view, me)} and you have ${energyLeft} left this turn. Energy equals the turn number, so it grows every turn.`, shake: ['.energy-meter'] };
    return { text: `${nm} has nowhere to go right now.`, shake: [] };
  };

  /**
   * A tap (or click) on a hand card. Not planning: read it. Planned: take it back. Standing: put it down (a strict
   * toggle: the second tap never opens the Codex any more; right-click, a hold, the corner ⓘ and the hint's chip read).
   * Unplayable: it shakes and the toast says why. Otherwise it stands, its Locations light, and the hint names the exits.
   */
  const tapCard = (cardId: string) => {
    if (!planning) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    if (plan.plays.some((pl) => pl.cardId === cardId)) {
      setPlan((p) => ({ ...p, plays: p.plays.filter((pl) => pl.cardId !== cardId) }));
      setSelected(null);
      return;
    }
    if (selected === cardId) {
      sfx('card.back');
      setSelected(null);
      settleFor();
      return;
    }
    if (!selectable(cardId)) {
      if (selected) {
        sfx('card.back');
        setSelected(null);
      }
      sfx('card.reject');
      setRejectId(cardId);
      window.setTimeout(() => setRejectId((r) => (r === cardId ? null : r)), 340);
      const why = whyCannotPlay(cardId);
      feedback(why.text, why.shake);
      return;
    }
    sfx('card.pick');
    setSelected(cardId);
  };

  const commitPlay = (location: number, cardId: string | null = selected) => {
    if (!cardId) return;
    const opt = opts.plays.find((p) => p.cardId === cardId);
    if (!opt) return;
    if (opt.needsLocation && !opt.locations.includes(location)) return;
    addPlay({ cardId, location: opt.needsLocation ? location : 0 });
    setSelected(null);
    setSheet(null);
    settleFor();
  };

  /** Stand on Business is one tap: it toggles in the plan and the toast explains what it does. */
  const toggleStand = () => {
    if (plan.standOnBusiness) {
      setPlan((p) => ({ ...p, standOnBusiness: false }));
      feedback('Stand cancelled.', [], 'info');
      return;
    }
    sfx('stand');
    setPlan((p) => ({ ...p, standOnBusiness: true }));
    feedback(`Standing on Business: when you Lock It In, the match rises from ${opts.pendingStakes} to ${opts.proposedStakes} Legacy after next turn${view.maxTurns < EXTENDED_TURNS ? ' and adds a 9th turn' : ''}. ${view.players[other(me)].handle} gets one turn to Sit Down for ${view.stakes} or Stand back. You cannot Sit Down once you stand, and this is once per match. Tap again to cancel.`, [], 'info');
  };

  /** Energy left after the plays already planned. */
  const energyLeft = opts.energy - planCost(plan, view, me);
  /** Crystals to light: while planning, what is left; from Lock In through the replay, what the locked plan left (no refill until the new turn). */
  const energyShown = planning ? energyLeft : locked ? energyLeft : m.replay ? Math.max(0, opts.energy - planCost(m.replay.plan, view, me)) : opts.energy;

  /** Add or move a play. Refused when it would overspend this turn's Energy. */
  function addPlay(play: { cardId: string; location: number; target?: { charUid?: string; location?: number }; enter?: boolean }) {
    const pdef = CARD_BY_ID[play.cardId];
    const directEntry = pdef?.kind === 'character' && pdef.keywords.includes('DIRECT_ENTRY');
    if (directEntry && play.enter === undefined) play = { ...play, enter: true };
    sfx(play.enter ? 'card.inside' : 'card.drop');
    if (play.enter) requestAnimationFrame(() => floatNum(play.location, 1, 'mine')); // the Inside bonus, shown as it is planned
    voice(play.cardId);
    const current = planRef.current.plays.filter((pl) => pl.cardId !== play.cardId);
    const spent = current.reduce((s, pl) => s + cardCost(pl.cardId, view, me), 0);
    const cost = cardCost(play.cardId, view, me);
    if (spent + cost > opts.energy) {
      feedback(`Not enough Energy. ${cardName(play.cardId, placeholders)} costs ${cost} and you have ${opts.energy - spent} left of ${opts.energy} this turn (Energy = the turn number). Remove a planned card or wait a turn.`, [`[data-hand-card="${play.cardId}"]`, '.energy-meter']);
      return;
    }
    setPlan((p) => ({ ...p, plays: [...p.plays.filter((pl) => pl.cardId !== play.cardId), play] }));
    if (directEntry) feedback(`${cardName(play.cardId, placeholders)} goes Inside right away (Direct Entry). Tap ⇅ on the planned move to wait at the Gates instead.`, [], 'info');
    if (play.cardId === 'the_ancestors') setSheet({ kind: 'ancestors' });
    const needs = opts.plays.find((p) => p.cardId === play.cardId)?.needsTarget;
    if (needs === 'friendlyCharAndLocation' && !play.target) feedback(`${cardName(play.cardId, placeholders)} planned. Optional: drag one of your Gate Characters to another Location's Gates and she moves it there for free.`);
    if (needs === 'friendlyInsideChar' && !play.target) feedback(`${cardName(play.cardId, placeholders)} planned. Optional: drag one of your Established Characters from another Location onto this one and ${cardName(play.cardId, placeholders)} brings them across.`);
  }

  /** Harriet Tubman / Yemoja: the planned play whose Reveal wants a target, if any. */
  const targetPlay = (kind: 'friendlyCharAndLocation' | 'friendlyInsideChar') =>
    planRef.current.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === kind);
  const harrietPlay = plan.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === 'friendlyCharAndLocation');
  const yemojaPlay = plan.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === 'friendlyInsideChar');
  /** Gates with room for a Tubman move, counting the plays already planned there. */
  const tubmanDests = (uid: string) => {
    const c = view.characters[uid];
    if (!c || !harrietPlay || (CARD_BY_ID[c.defId] as { keywords?: string[] })?.keywords?.includes('INFORMANT')) return [];
    return view.locations.filter((l) => l.index !== c.location && !l.lost && (gateRoom(view, l.index, me, plannedAt(l.index)) > 0 || insideOpen(view, l.index, me))).map((l) => l.index);
  };
  const setTarget = (kind: 'friendlyCharAndLocation' | 'friendlyInsideChar', target: { charUid: string; location: number } | null) => {
    const play = targetPlay(kind);
    if (!play) return;
    setPlan((p) => ({ ...p, plays: p.plays.map((pl) => (pl.cardId === play.cardId ? { ...pl, target: target ?? undefined } : pl)) }));
    setSheet(null);
  };


  // Your own moves are heard when you plan them (the replay skips your own beats): the gate for walking Inside,
  // the whoosh for a relocation, the switch for a confrontation; taking a move back is the card-back swoosh.
  const toggleEnter = (uid: string) => {
    sfx(plan.enters.includes(uid) ? 'card.back' : 'enter');
    setPlan((p) => ({ ...p, enters: p.enters.includes(uid) ? p.enters.filter((u) => u !== uid) : [...p.enters, uid] }));
    setSheet(null);
  };
  const setRelocation = (uid: string, to: number | null) => {
    sfx(to === null ? 'card.back' : 'move');
    setPlan((p) => ({ ...p, relocations: [...p.relocations.filter((r) => r.uid !== uid), ...(to === null ? [] : [{ uid, to }])] }));
    setSheet(null);
  };
  const toggleConfront = (uid: string, threatUid: string) => {
    sfx(plan.confronts.some((c) => c.uid === uid && c.threatUid === threatUid) ? 'card.back' : 'toggle');
    setPlan((p) => {
      const has = p.confronts.some((c) => c.uid === uid && c.threatUid === threatUid);
      return { ...p, confronts: has ? p.confronts.filter((c) => !(c.uid === uid)) : [...p.confronts.filter((c) => c.uid !== uid), { uid, threatUid }] };
    });
  };

  const dropTargetsFor = useCallback(
    (payload: DragPayload): DropHighlight => {
      const out: DropHighlight = { locations: [], inside: [], gates: [], threats: [], hand: false, overKey: '' };
      if (!planning) return out;
      if (payload.kind === 'card') {
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        const alreadyPlanned = plan.plays.some((pl) => pl.cardId === payload.cardId);
        const affordable = alreadyPlanned || cardCost(payload.cardId, view, me) <= opts.energy - planCost(plan, view, me);
        if (opt && affordable) {
          out.locations = opt.locations.filter((i) => roomFor(payload.cardId, i));
        }
        out.hand = plan.plays.some((pl) => pl.cardId === payload.cardId);
        return out;
      }
      const c = view.characters[payload.uid];
      if (!c || c.owner !== me) return out;
      const confronting = plan.confronts.some((x) => x.uid === c.uid);
      const entering = plan.enters.includes(c.uid);
      const reloc = plan.relocations.find((x) => x.uid === c.uid);
      if (entering) out.gates = [c.location]; // drag back to cancel
      if (reloc) {
        out.locations = [c.location];
        out.inside = [c.location];
      }
      const targeted = plan.plays.find((pl) => pl.target?.charUid === c.uid);
      if (targeted) out.gates = [...out.gates, c.location]; // drag back to cancel the free move
      if (!confronting && !entering && !reloc) {
        if (harrietPlay) {
          const d = tubmanDests(c.uid);
          out.gates = [...out.gates, ...d];
          out.locations = [...out.locations, ...d];
        }
        if (c.zone === 'inside' && yemojaPlay && yemojaPlay.location !== c.location && !view.locations[yemojaPlay.location].lost) {
          out.inside = [...out.inside, yemojaPlay.location];
          out.locations = [...out.locations, yemojaPlay.location];
        }
      }
      if (!confronting) {
        if (c.zone === 'gate' && opts.enters.includes(c.uid) && !entering) {
          out.inside = [c.location];
          out.locations = [c.location];
        }
        if (!entering) {
          const r = opts.relocations.find((x) => x.uid === c.uid);
          const fromHub = locDef(view, c.location).effect.type === 'hub';
          const used = plan.relocations.filter((x) => locDef(view, view.characters[x.uid]?.location ?? -1).effect.type !== 'hub').length;
          if (r && (fromHub || used < opts.relocationsAllowed || reloc)) out.locations = [...out.locations, ...r.destinations];
        }
      }
      if (!entering && !reloc) {
        out.threats = opts.confronts.filter((o) => o.chars.includes(c.uid)).map((o) => o.threatUid);
      }
      return out;
    },
    [planning, opts, view, me, plan, harrietPlay, yemojaPlay],
  );

  /** Why a drop cannot happen, and what to shake. */
  const explain = useCallback(
    (payload: DragPayload, target: DropTarget): { text: string; shake: string[] } | null => {
      const locIndex = target.type === 'location' || target.type === 'inside' || target.type === 'gates' ? target.index : null;
      const locNameAt = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
      const col = (i: number) => `.column[data-index="${i}"]`;
      if (payload.kind === 'card') {
        const nm = cardName(payload.cardId, placeholders);
        if (target.type === 'threat') return { text: `${nm} is a card in your hand. Drop it on a Location; Threats are confronted by Characters already there.`, shake: [] };
        if (target.type === 'hand') return null;
        const i = locIndex!;
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it, so nothing can be played there.`, shake: [`${col(i)} .art`] };
        if (!opt) return { text: `${nm} cannot be played right now.`, shake: [`[data-hand-card="${payload.cardId}"]`] };
        if (!plan.plays.some((pl) => pl.cardId === payload.cardId) && cardCost(payload.cardId, view, me) > opts.energy - planCost(plan, view, me))
          return { text: `Not enough Energy: ${nm} costs ${cardCost(payload.cardId, view, me)} and you have ${opts.energy - planCost(plan, view, me)} left this turn. Energy equals the turn number, so it grows every turn.`, shake: [`[data-hand-card="${payload.cardId}"]`, '.energy-meter'] };
        if (opt.kind === 'event' && !roomFor(payload.cardId, i)) {
          const otherEv = plan.plays.find((pl) => pl.location === i && pl.cardId !== payload.cardId && CARD_BY_ID[pl.cardId]?.kind === 'event');
          return { text: `The Event slot at ${locNameAt(i)} already holds ${otherEv ? cardName(otherEv.cardId, placeholders) : 'an Event'} this turn. One Event per Location per turn: play ${nm} somewhere else.`, shake: [`${col(i)} .event-slot`] };
        }
        if (opt.kind === 'character' && (CARD_BY_ID[payload.cardId] as { keywords?: string[] })?.keywords?.includes('INFORMANT')) {
          if (gateRoom(view, i, other(me), plan.plays.filter((pl) => pl.location === i && pl.cardId !== payload.cardId && (CARD_BY_ID[pl.cardId] as { keywords?: string[] })?.keywords?.includes('INFORMANT')).length) <= 0)
            return { text: `${view.players[other(me)].handle}'s Gates at ${locNameAt(i)} are full. An Informant needs one of their slots open: plant ${nm} where they have room.`, shake: [`${col(i)} .gates-left:not([data-drop]) .gate-slot`] };
          return { text: `${nm} cannot go to ${locNameAt(i)}.`, shake: [] };
        }
        if (opt.kind === 'character' && gateRoom(view, i, me, plannedAt(i, payload.cardId)) <= 0) {
          const leaving = (reserved[i] ?? []).filter((h) => !h.through);
          if (leaving.length)
            return { text: `${leaving.map((h) => cardName(h.defId, placeholders)).join(' and ')} still hold${leaving.length > 1 ? '' : 's'} a Gate slot at ${locNameAt(i)} until the turn resolves (new arrivals are placed before anyone enters). Play ${nm} there next turn.`, shake: [`${col(i)} .gate-slot.reserved`] };
          // Every played Character is placed at the Gates before anyone walks Inside, a Direct Entry included: name who holds the slots this turn.
          const there = charsAt(view, i, me, 'gate').map((c) => cardName(c.defId, placeholders));
          const arriving = plan.plays.filter((pl) => pl.location === i && pl.cardId !== payload.cardId && CARD_BY_ID[pl.cardId]?.kind === 'character' && !(CARD_BY_ID[pl.cardId] as { keywords?: string[] }).keywords?.includes('INFORMANT'));
          const arrivals = arriving.map((pl) => `${cardName(pl.cardId, placeholders)}${pl.enter ? ' (straight Inside, but placed at the Gates first)' : ''}`);
          const who = [...there, ...arrivals];
          return {
            text: `Your ${GATE_CAPACITY} Gate slots at ${locNameAt(i)} are spoken for this turn: ${who.join(', ')}. Arrivals are all placed at the Gates before anyone walks Inside, so a card played straight Inside still needs a slot for a moment. Play ${nm} elsewhere, or take one of them back.`,
            shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`, ...arriving.map((pl) => `[data-uid="${PLANNED_PREFIX}${pl.cardId}"]`)],
          };
        }
        return { text: `${nm} cannot go to ${locNameAt(i)}.`, shake: [] };
      }
      const c = view.characters[payload.uid];
      if (!c) return null;
      const nm = cardName(c.defId, placeholders);
      const tile = `[data-uid="${c.uid}"]`;
      const confronting = plan.confronts.some((x) => x.uid === c.uid);
      if (target.type === 'hand') return { text: `${nm} is already on the board; cards only return to your hand before they are played.`, shake: [] };
      if (target.type === 'threat') {
        const loc = view.locations.find((l) => l.threats.some((t) => t.uid === target.uid));
        const t = loc?.threats.find((x) => x.uid === target.uid);
        if (!loc || !t) return null;
        const tname = THREAT_BY_ID[t.defId].name;
        if (loc.index !== c.location) return { text: `${nm} is not at ${locNameAt(loc.index)}. Only Characters at a Threat's Location can confront it.`, shake: [tile] };
        if (plan.enters.includes(c.uid) || plan.relocations.some((x) => x.uid === c.uid)) return { text: `${nm} is moving this turn. A Character cannot move and confront in the same turn.`, shake: [tile] };
        if (t.target && t.target !== me) return { text: `Clear your own ${tname} first; then you may Assist against ${view.players[other(me)].handle}'s.`, shake: [`[data-threat="${target.uid}"]`] };
        return { text: `${nm} cannot confront ${tname} right now.`, shake: [tile] };
      }
      const i = locIndex!;
      if (confronting) return { text: `${nm} is confronting a Threat this turn and cannot move. Tap the Threat to release it.`, shake: [tile] };
      if (c.zone === 'gate') {
        if (i !== c.location) {
          if (harrietPlay && (plan.enters.includes(c.uid) || plan.relocations.some((x) => x.uid === c.uid))) return { text: `${nm} is already moving this turn. Harriet Tubman can only move a Character that is staying put.`, shake: [tile] };
          if (harrietPlay && view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it.`, shake: [`${col(i)} .art`] };
          if (harrietPlay) return { text: `Your Gates at ${locNameAt(i)} are full, so Harriet Tubman cannot move ${nm} there.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
          if ((CARD_BY_ID[c.defId] as { keywords?: string[] })?.keywords?.includes('INFORMANT')) {
            const r = opts.relocations.find((x) => x.uid === c.uid);
            if (!r) return { text: `${nm} cannot move right now: ${lockReason(view, c) ?? 'you have used your Relocation this turn'}.`, shake: [tile] };
            if (!r.destinations.includes(i)) return { text: `Your Gates at ${locNameAt(i)} are full, so ${nm} cannot go there.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
            return { text: `You have already used your Relocation this turn. Undo it to move ${nm} instead.`, shake: [tile] };
          }
          return { text: `Gate Characters enter the Location they are waiting at. Play Harriet Tubman first and she can move one of them to another Gate.`, shake: [tile] };
        }
        if (!c.ready) return { text: `${nm} is Fresh: it arrived this turn and waits one turn at the Gates before it can enter.`, shake: [tile] };
        const blocked = isBlockedFromEntering(view, c);
        if (blocked?.includes('Patrol')) {
          const patrol = view.locations[i].threats.find((t) => t.defId === 'segregationist_patrol' && (!t.target || t.target === me));
          return { text: `Segregationist Patrol blocks your entries at ${locNameAt(i)}. Neutralize it with ${patrol?.forceRequired ?? 3} Force in one turn.`, shake: patrol ? [`[data-threat="${patrol.uid}"]`] : [] };
        }
        if (blocked) return { text: `An opposing Reveal (Karen or OG) stopped ${nm} from entering this turn. Try again next turn.`, shake: [tile] };
        const cap = insideCapacity(view, i);
        if (charsAt(view, i, me, 'inside').length + plan.enters.filter((u) => view.characters[u]?.location === i).length >= cap) {
          if (cap < 5) {
            const hr = view.locations[i].threats.find((t) => t.defId === 'housing_restriction');
            return { text: `Housing Restriction caps you at ${cap} Established Characters here. Neutralize it with ${hr?.forceRequired ?? 4} Force.`, shake: hr ? [`[data-threat="${hr.uid}"]`] : [] };
          }
          return { text: `All five of your Inside slots at ${locNameAt(i)} are full.`, shake: [`${col(i)} [data-drop="inside"]`] };
        }
        return { text: `${nm} cannot enter right now.`, shake: [tile] };
      }
      // Established Character relocating.
      if (i === c.location) return null;
      if (view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it.`, shake: [`${col(i)} .art`] };
      if (gateRoom(view, i, me) <= 0) return { text: `Your Gates at ${locNameAt(i)} are full; a relocated Character arrives at the Gates.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
      if (plan.relocations.length >= opts.relocationsAllowed && !plan.relocations.some((x) => x.uid === c.uid))
        return { text: `You get ${opts.relocationsAllowed} Relocation${opts.relocationsAllowed > 1 ? 's' : ''} per turn (Pullman Porter adds one). Drag the other one back to cancel it.`, shake: plan.relocations.map((r) => `[data-uid="${r.uid}"]`) };
      const held = lockReason(view, c);
      if (held) return { text: `${nm} cannot leave: ${held}. Only Harriet Tubman's Reveal can move them out.`, shake: [tile] };
      return { text: `${nm} cannot relocate there right now.`, shake: [tile] };
    },
    [view, me, plan, opts, placeholders],
  );

  const onDrop = useCallback(
    (payload: DragPayload, target: DropTarget) => {
      const ok = dropTargetsFor(payload);
      // A refused drop returns false: a card's ghost then flies back to its slot.
      const fail = (): false => {
        sfx('card.reject');
        const why = explain(payload, target);
        if (why) feedback(why.text, why.shake);
        return false;
      };
      const idx = target.type === 'location' || target.type === 'inside' || target.type === 'gates' ? target.index : -1;
      if (payload.kind === 'card') {
        if (target.type === 'hand') {
          if (ok.hand) {
            sfx('card.back');
            setPlan((p) => ({ ...p, plays: p.plays.filter((pl) => pl.cardId !== payload.cardId) }));
          }
          return ok.hand;
        }
        if (target.type === 'threat' || !ok.locations.includes(idx)) return fail();
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (!opt) return fail();
        addPlay({ cardId: payload.cardId, location: opt.needsLocation ? idx : 0 });
        setSelected(null);
        return;
      }
      const c = view.characters[payload.uid];
      if (!c) return;
      if (target.type === 'threat') {
        if (ok.threats.includes(target.uid)) toggleConfront(c.uid, target.uid);
        else fail();
        return;
      }
      const entering = plan.enters.includes(c.uid);
      const reloc = plan.relocations.find((x) => x.uid === c.uid);
      const targeted = plan.plays.find((pl) => pl.target?.charUid === c.uid);
      // Cancel by dragging back.
      if (entering && target.type === 'gates' && idx === c.location) return toggleEnter(c.uid);
      if (reloc && idx === c.location) return setRelocation(c.uid, null);
      if (targeted && idx === c.location) return setTarget(c.zone === 'gate' ? 'friendlyCharAndLocation' : 'friendlyInsideChar', null);
      if (c.zone === 'gate' && !entering) {
        if (idx !== c.location && harrietPlay && !harrietPlay.target && ok.gates.includes(idx)) return setTarget('friendlyCharAndLocation', { charUid: c.uid, location: idx });
        if (idx === c.location && ok.inside.includes(idx)) return toggleEnter(c.uid);
        if (idx !== c.location && ok.locations.includes(idx)) return setRelocation(c.uid, idx);
        return fail();
      }
      if (c.zone === 'inside' && idx !== c.location && harrietPlay && !harrietPlay.target && ok.gates.includes(idx) && target.type === 'gates') return setTarget('friendlyCharAndLocation', { charUid: c.uid, location: idx });
      if (c.zone === 'inside' && idx !== c.location && yemojaPlay?.location === idx && (target.type === 'inside' || ok.inside.includes(idx))) return setTarget('friendlyInsideChar', { charUid: c.uid, location: idx });
      if (c.zone === 'inside' && idx !== c.location && harrietPlay && !harrietPlay.target && ok.gates.includes(idx)) return setTarget('friendlyCharAndLocation', { charUid: c.uid, location: idx });
      if (c.zone === 'inside' && ok.locations.includes(idx) && idx !== c.location) return setRelocation(c.uid, idx);
      if (idx !== c.location) fail();
    },
    [dropTargetsFor, explain, feedback, opts, view, plan, setPlan, harrietPlay, yemojaPlay],
  );

  // A drag while the turn plays out: the hand dips and a toast says why, at most once every few seconds.
  const [handNudge, setHandNudge] = useState(false);
  const blockedAt = useRef(0);
  const onBlocked = useCallback(() => {
    const now = performance.now();
    if (now - blockedAt.current < 2500) return;
    blockedAt.current = now;
    setHandNudge(true);
    window.setTimeout(() => setHandNudge(false), 450);
    feedback(m.replay ? 'The turn is playing out. Skip ▸▸ jumps to the end.' : locked ? (m.mode === 'ai' ? 'Locked in. Harborlight is deciding.' : 'Locked in. Waiting for the other side.') : 'One moment: the board is settling.', [], 'info');
  }, [m.replay, m.mode, locked, feedback]);
  /** A still touch of half a second reads the card or the piece under the finger. */
  const onHold = useCallback((p: DragPayload) => {
    if (p.kind === 'card') setSheet({ kind: 'card', id: p.cardId });
    else if (isPlannedUid(p.uid)) setSheet({ kind: 'card', id: p.uid.slice(PLANNED_PREFIX.length) });
    else setSheet({ kind: 'char', uid: p.uid });
  }, []);
  const { drag, dragProps, cancelDrag } = useDrag(onDrop, planning, onBlocked, onHold, settleFor);
  useEffect(() => {
    document.body.classList.toggle('dragging', !!drag);
    return () => document.body.classList.remove('dragging');
  }, [drag]);
  // A drag, the end of planning, or the card leaving the hand all put a standing card down.
  useEffect(() => {
    if (drag) setSelected(null);
  }, [drag]);
  useEffect(() => {
    if (!planning) setSelected(null);
  }, [planning]);
  useEffect(() => {
    if (selected && !view.players[me].hand.includes(selected)) setSelected(null);
  }, [selected, view, me]);
  // A finger on a hybrid screen must not leave a mouse-style hover lift behind: body.touching from the first touch
  // until a real mouse pointer moves again (a timer would hand the sticky emulated :hover straight back).
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') document.body.classList.remove('touching');
      else document.body.classList.add('touching');
    };
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('pointermove', onPointer, { capture: true });
      document.body.classList.remove('touching');
    };
  }, []);
  const drop: DropHighlight | null = useMemo(() => {
    if (!drag || drag.returning || drag.snap) return null;
    return { ...dropTargetsFor(drag.payload), overKey: targetKey(drag.over) };
  }, [drag, dropTargetsFor]);
  // The ghost arrives over a target that will take it: a tick.
  const lastOver = useRef('');
  useEffect(() => {
    const k = drop?.overKey ?? '';
    if (k && k !== lastOver.current) sfx('card.hover');
    lastOver.current = k;
  }, [drop?.overKey]);
  /** The Locations a standing card can go to right now (legal, affordable, with room). */
  const targetable = useMemo(() => (selected && planning ? dropTargetsFor({ kind: 'card', cardId: selected }).locations : []), [selected, planning, dropTargetsFor]);
  /**
   * A standing card goes back down on any press that is not part of playing or reading it: not a hand card, a lit
   * Location, the corner ⓘ, a hint chip, a plan chip, a sheet or a toast. A press on an unlit Location also says why.
   */
  useEffect(() => {
    if (!selected) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest('[data-hand-card], .column.targetable, .stand-card, .hint .chip, .plan-chip, .scrim, .sheet, .cx-scrim, .tut-sheet, .toast')) return;
      sfx('card.back');
      setSelected(null);
      settleFor();
      const col = t.closest('.column') as HTMLElement | null;
      if (col && col.dataset.index !== undefined) {
        const why = explain({ kind: 'card', cardId: selected }, { type: 'location', index: Number(col.dataset.index) });
        if (why) feedback(why.text, why.shake);
      }
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, [selected, explain, feedback, settleFor]);
  // Keys: Escape closes a sheet, else sends a dragged card home, else puts a standing card down; 1-3 play the standing
  // card at that Location; i reads it; Cmd/Ctrl+Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === 'Escape') {
        if (sheet) {
          setSheet(null);
          return;
        }
        if (drag) {
          cancelDrag();
          return;
        }
        if (selected) {
          sfx('card.back');
          setSelected(null);
          settleFor();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (!sheet && planning && selected) {
        if (/^[1-3]$/.test(e.key)) {
          const i = Number(e.key) - 1;
          if (targetable.includes(i)) commitPlay(i);
          else {
            const why = explain({ kind: 'card', cardId: selected }, { type: 'location', index: i });
            if (why) feedback(why.text, why.shake);
          }
          return;
        }
        if (e.key.toLowerCase() === 'i') setSheet({ kind: 'card', id: selected });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, sheet, drag, selected, planning, targetable, cancelDrag, explain, feedback, settleFor]);

  const onChar = (uid: string) => {
    if (isPlannedUid(uid)) {
      setSheet({ kind: 'card', id: uid.slice(PLANNED_PREFIX.length) });
      return;
    }
    if (!view.characters[uid]) return;
    // Tap inspects and offers actions; drag is the quick action.
    setSheet({ kind: 'char', uid });
  };

  const cardLocationLabel = (i: number) => locationName(view.locations[i].defId, placeholders);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const bubbles = useMemo(() => {
    const out: Partial<Record<PlayerId, string>> = {};
    for (const p of ['A', 'B'] as PlayerId[]) {
      const last = [...m.chat].reverse().find((c) => c.from === p);
      if (last && now - last.at < 7000) out[p] = last.text;
    }
    return out;
  }, [m.chat, now]);
  const summonState = (i: number): string | null => {
    const mine = plan.summon?.location === i;
    const theirs = m.pendingProposal?.from !== me && m.pendingProposal?.location === i ? '?' : m.opponentAgreed === i ? '✓' : null;
    if (!mine && !theirs) return null;
    return `SUMMON · You ${mine ? '✓' : '?'} · ${view.players[other(me)].handle} ${theirs ?? (mine ? '?' : '')}`;
  };

  const planItems = useMemo(() => {
    if (!planning) return [];
    const items: { key: string; label: string; remove: () => void; toggle?: () => void }[] = [];
    for (const pl of plan.plays) {
      const def = CARD_BY_ID[pl.cardId];
      const where = def?.kind === 'character' || def?.id === 'community_defense' ? ` → L${pl.location + 1}` : '';
      const direct = def?.kind === 'character' && def.keywords.includes('DIRECT_ENTRY');
      items.push({
        key: `play:${pl.cardId}`,
        label: `${cardName(pl.cardId, placeholders)}${where}${direct ? (pl.enter ? ' · Inside' : ' · Gates') : ''}`,
        remove: () => {
          sfx('card.back');
          setPlan((p) => ({ ...p, plays: p.plays.filter((x) => x.cardId !== pl.cardId) }));
        },
        toggle: direct
          ? () => {
              sfx(pl.enter ? 'card.drop' : 'card.inside');
              if (!pl.enter) requestAnimationFrame(() => floatNum(pl.location, 1, 'mine'));
              setPlan((p) => ({ ...p, plays: p.plays.map((x) => (x.cardId === pl.cardId ? { ...x, enter: !x.enter } : x)) }));
            }
          : undefined,
      });
    }
    for (const uid of plan.enters) {
      const c = view.characters[uid];
      if (c) items.push({ key: `enter:${uid}`, label: `${cardName(c.defId, placeholders)} enters`, remove: () => setPlan((p) => ({ ...p, enters: p.enters.filter((u) => u !== uid) })) });
    }
    for (const pl of plan.plays) {
      const c = pl.target?.charUid ? view.characters[pl.target.charUid] : undefined;
      if (c) items.push({ key: `target:${c.uid}`, label: `${cardName(c.defId, placeholders)} → L${(pl.target!.location ?? pl.location) + 1} (${cardName(pl.cardId, placeholders).split(' ')[0]})`, remove: () => setPlan((p) => ({ ...p, plays: p.plays.map((x) => (x.cardId === pl.cardId ? { ...x, target: undefined } : x)) })) });
    }
    for (const r of plan.relocations) {
      const c = view.characters[r.uid];
      if (c) items.push({ key: `move:${r.uid}`, label: `${cardName(c.defId, placeholders)} → L${r.to + 1}`, remove: () => setPlan((p) => ({ ...p, relocations: p.relocations.filter((x) => x.uid !== r.uid) })) });
    }
    for (const cf of plan.confronts) {
      const c = view.characters[cf.uid];
      if (c) items.push({ key: `confront:${cf.uid}`, label: `${cardName(c.defId, placeholders)} confronts`, remove: () => setPlan((p) => ({ ...p, confronts: p.confronts.filter((x) => x.uid !== cf.uid) })) });
    }
    if (plan.summon) items.push({ key: 'summon', label: `Summon at L${plan.summon.location + 1}`, remove: () => setPlan((p) => ({ ...p, summon: undefined })) });
    if (plan.standOnBusiness) items.push({ key: 'stand', label: 'Stand on Business', remove: () => setPlan((p) => ({ ...p, standOnBusiness: false })) });
    return items;
  }, [plan, planning, view, placeholders, setPlan]);

  const hint = (() => {
    if (view.phase === 'ended') return `Match over: ${view.result?.winner ? `${view.players[view.result.winner].handle} wins` : 'a draw'}. Tap any card or Location for details.`;
    if (busy) return m.replay ? 'Watching the turn play out…' : 'Harborlight moves…';
    if (locked) return m.mode === 'ai' ? 'Locked. Harborlight is deciding…' : 'Locked.';
    if (view.players[me].hand.length - plan.plays.length >= MAX_HAND && view.players[me].deckCount > 0 && !selected) return `Hand full (${MAX_HAND}). Play a card or your next draw is discarded.`;
    if (drag?.payload.kind === 'card') return `Drop ${cardName(drag.payload.cardId, placeholders)} on a lit Location. Let go anywhere else, or press Escape, to put it back.`;
    if (selected) return `Tap a lit Location to play ${cardName(selected, placeholders)}. Tap it again to put it back. Press 1-3 or drag it.`;
    if (harrietPlay && !harrietPlay.target) return 'Harriet Tubman: drag any of your Characters to another Location and she takes them straight Inside. Free, and she gets them out of a curfew (optional).';
    if (yemojaPlay && !yemojaPlay.target) return `${cardName(yemojaPlay.cardId, placeholders)}: drag an Established Character from elsewhere onto ${view.locations[yemojaPlay.location].revealed ? locationName(view.locations[yemojaPlay.location].defId, placeholders) : `Location ${yemojaPlay.location + 1}`} (optional).`;
    const affordable = opts.plays.filter((o) => !plan.plays.some((pl) => pl.cardId === o.cardId) && cardCost(o.cardId, view, me) <= energyLeft).length;
    if (planItems.length) return affordable > 0 ? '' : '';
    return 'Drag a card onto a Location, or tap it and then tap a Location.';
  })();

  // The opponent Stood on Business and the raise has not landed yet: this is the one cheap turn to Sit Down.
  const raisedOnMe = planning && view.pendingRaises.some((r) => r.by !== me);
  const stepOffLabel = `Sit Down${opts.canStepOff && view.phase !== 'ended' ? ` (−${opts.stepOffCost})` : ''}`;

  return (
    <div className={`app ${resolving ? 'resolving' : ''}`}>
      <Hud view={view} me={me} onProfile={(p) => setSheet({ kind: 'profile', p })} bubbles={bubbles} onChat={() => setSheet({ kind: 'chat' })} stand={{ on: !!plan.standOnBusiness, disabled: !planning || !opts.canStand, flash: flash === 'stakes' || flash === 'final', onToggle: toggleStand }} />
      <div className="main-wrap">
        <Battlefield
          view={boardView}
          me={me}
          plan={plan}
          targetable={targetable}
          onLocationTap={commitPlay}
          onLocationInfo={(i) => setSheet({ kind: 'location', index: i })}
          onChar={onChar}
          onThreat={(uid) => setSheet({ kind: 'threat', uid })}
          locked={!planning}
          flash={doing ? doing.flash ?? null : flash}
          dragProps={dragProps}
          drop={drop}
          reserved={reserved}
          delays={m.delays}
          fx={fx}
          resolving={busy}
          focus={step?.uids}
          eventFx={step?.kind === 'event' && step.cardId && step.player ? { cardId: step.cardId, owner: step.player, location: step.location ?? 0 } : undefined}
          pendingEvents={step?.pendingEvents}
          neutralized={neutralized}
          glowLocation={guideLocation}
          summonLabel={summonState}
        />
        {verdict ? (
          <div className={`replay-banner kind-clash ${verdict.tone === 'win' ? 'miss' : verdict.tone === 'draw' ? 'arrive' : ''}`} role="status">
            <span className="replay-kind">Reckoning</span>
            <span className="replay-text">
              {verdict.line}
              <span className="replay-sub">{verdict.reason}</span>
            </span>
            <button className="small primary" onClick={onExit}>
              See the result
            </button>
            {!peek && (
              <button className="small" onClick={() => setPeek(true)}>
                Stay on the board
              </button>
            )}
          </div>
        ) : clashTell ? (
          <div className={`replay-banner kind-clash ${clashTell.tone}`} role="status">
            <span className="replay-kind">{clashTell.title}</span>
            <span className="replay-text">
              {clashTell.text}
              {clashTell.sub && <span className="replay-sub">{clashTell.sub}</span>}
            </span>
            {m.replay && (
              <button className="small" onClick={m.replaySkip}>
                Skip ▸▸
              </button>
            )}
          </div>
        ) : step && !ownBeat ? (
          <div className={`replay-banner kind-${step.kind}`} role="status">
            {BEAT_KIND[step.kind] && <span className="replay-kind">{BEAT_KIND[step.kind]}</span>}
            <span className="replay-text">{step.label}</span>
            <span className="replay-count">
              {m.replay!.idx + 1}/{m.replay!.steps.length}
            </span>
            <button className="small" onClick={m.replaySkip}>
              Skip ▸▸
            </button>
          </div>
        ) : resolving && !m.replay ? (
          <div className="replay-banner kind-wait" role="status">
            <span className="replay-kind">{locked ? 'Locked' : 'Resolving'}</span>
            <span className="replay-text">
              {locked ? (m.mode === 'ai' ? 'Harborlight is deciding' : 'Waiting for the other side') : 'The board settles'}
              <span className="dots" aria-hidden />
            </span>
          </div>
        ) : null}
        {peekShow && (
          <div className="peek-strip" role="status" onClick={() => setPeekShow(null)}>
            <div className="peek-cap">
              {peekShow.by} reads the room: {peekShow.cards.length ? `${view.players[other(me)].handle} holds ${peekShow.cards.length} card${peekShow.cards.length > 1 ? 's' : ''}` : `${view.players[other(me)].handle} holds nothing`}
            </div>
            {peekShow.cards.length > 0 && (
              <div className="peek-cards">
                {peekShow.cards.map((id, i) => (
                  <CardFace key={`${id}-${i}`} id={id} />
                ))}
              </div>
            )}
            <div className="peek-hint">Kept in {view.players[other(me)].handle}'s profile · tap to dismiss</div>
          </div>
        )}
        {turnFlash !== null && (
          <div className="turn-flash" key={turnFlash} aria-hidden>
            {finalTurnLabel(view) ?? `Turn ${turnFlash}`}
          </div>
        )}
        <Coach view={view} me={me} plan={plan} enabled={coach && tutorial && planning && m.mode === 'ai' && !guide && !lesson} onActive={setFlash} override={doing ? null : guideText} />
        <Spotlight active={planning && !drag && (flash !== null || guide !== null || !!doing)} />
        {doing && (
          <div className="sheet tut-sheet tut-do" role="status" aria-label="Tutorial">
            <div className="tut-kicker">
              Tutorial · {tutIdx + 1} of {lessons.length}
            </div>
            <h3>Your move</h3>
            <p>{doing.text}</p>
          </div>
        )}
        {lesson?.kind === 'read' && (
          <div className="scrim tut-scrim">
            <div className="sheet tut-sheet" role="dialog" aria-label={lesson.title}>
              <div className="tut-kicker">
                Tutorial · {tutIdx + 1} of {lessons.length}
              </div>
              <h3>{lesson.title}</h3>
              <p>{lesson.text}</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="primary" autoFocus onClick={() => setTutIdx((i) => i + 1)}>
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
        <button className="log-toggle" disabled={m.lastTurn.length === 0} onClick={() => setSheet({ kind: 'log' })} {...tip('What happened last turn, step by step.')} aria-label="Last turn log">
          i
        </button>
        {toast && (
          <div className={`toast ${toastTone}`} role="status">
            {toast}
          </div>
        )}
      </div>
      <div className="bottom">
        <Hand view={view} me={me} plan={m.replay ? m.replay.plan : plan} selected={selected} rest={!planning} nudge={handNudge} onTap={tapCard} onInspect={(id) => setSheet({ kind: 'card', id })} compact={compact} dragProps={dragProps} glow={guideCard} energyLeft={planning ? energyLeft : undefined} dropState={drop?.hand ? (drop.overKey === 'hand' ? 'over' : 'ok') : null} held={drag?.payload.kind === 'card' ? drag.payload.cardId : null} reject={rejectId} settle={settle} canPlay={selectable} />
        <div className="hint" aria-live="polite">
          {planItems.map((it) => (
            <span key={it.key} className="plan-chip">
              {it.label}
              {it.toggle && (
                <button className="x swap" onClick={it.toggle} aria-label="Switch between Gates and Inside" title="Gates or Inside">
                  ⇅
                </button>
              )}
              <button className="x" onClick={it.remove} aria-label={`Remove ${it.label}`} title="Remove this move">
                ✕
              </button>
            </span>
          ))}
          {hint && <span>{hint}</span>}

          {planning && history.length > 0 && (
            <button className="small chip undo" onClick={undo} title="Cmd/Ctrl+Z">
              ↶ Undo
            </button>
          )}
          {planning && planItems.length > 0 && (
            <button className="small chip reset" onClick={() => setPlan(() => emptyPlan())} title="Clear every move this turn (undoable)">
              ⟲ Reset turn
            </button>
          )}
        </div>
        <div className="actions-left">
          <button className={`danger ${raisedOnMe && opts.canStepOff ? 'pulse' : ''}`} disabled={view.phase === 'ended' || !opts.canStepOff} {...(opts.canStepOff ? {} : tip(HINTS.noStepOff))} onClick={() => setSheet({ kind: 'stepOff' })}>
            {stepOffLabel}
          </button>
        </div>
        <div className="lock-panel">
          {view.phase === 'ended' ? (
            <button className="primary lock-btn" onClick={onExit}>
              SEE RESULT
            </button>
          ) : (
            <button className={`primary lock-btn ${planning ? urgency(m.secondsLeft) : ''} ${doing?.lock ? 'ftue-flash' : ''}`} disabled={!planning} onClick={lockNow} title={HINTS.timer}>
              <span>{planning ? 'LOCK IN' : locked ? 'LOCKED ✓' : 'RESOLVING…'}</span>
              <i className="timer-bar" aria-hidden>
                <b style={{ width: `${planning ? Math.max(0, Math.min(100, (100 * m.secondsLeft) / PLANNING_SECONDS)) : 0}%` }} />
              </i>
            </button>
          )}
          <div className={`turn-panel ${finalTurnLabel(view) ? 'final' : ''}`} {...tip(finalTurnLabel(view) ? (view.maxTurns === EXTENDED_TURNS ? HINTS.lastWord : HINTS.finalTurn) : HINTS.energy)}>
            <div className="turn-text">
              {finalTurnLabel(view) ?? `Turn ${Math.min(view.turn, view.maxTurns)} / ${view.maxTurns}`}
            </div>
            <div className="crystals" aria-label={`Energy ${energyShown} of ${opts.energy}`}>
              {Array.from({ length: Math.max(ENERGY_CAP, opts.energy) }, (_, i) => (
                <i key={i} className={i < energyShown ? 'on' : i < opts.energy ? 'used' : 'future'} />
              ))}
            </div>
          </div>
        </div>
        <div className="mobile-actions">
          <button className={`danger sit-btn ${raisedOnMe && opts.canStepOff ? 'pulse' : ''}`} disabled={view.phase === 'ended' || !opts.canStepOff} onClick={() => setSheet({ kind: 'stepOff' })}>
            Sit Down
          </button>
          {view.phase === 'ended' ? (
            <button className="primary lock-btn" onClick={onExit}>
              SEE RESULT
            </button>
          ) : (
            <button className={`primary lock-btn ${planning ? urgency(m.secondsLeft) : ''} ${doing?.lock ? 'ftue-flash' : ''}`} disabled={!planning} onClick={lockNow} title={HINTS.timer}>
              <span>{planning ? 'LOCK IN' : locked ? 'LOCKED ✓' : 'RESOLVING…'}</span>
              <i className="timer-bar" aria-hidden>
                <b style={{ width: `${planning ? Math.max(0, Math.min(100, (100 * m.secondsLeft) / PLANNING_SECONDS)) : 0}%` }} />
              </i>
            </button>
          )}
          <div className={`turn-mini ${finalTurnLabel(view) ? 'final' : ''}`} {...tip(HINTS.energy)}>
            <span className="turn-text">{finalTurnLabel(view, true) ?? `T${Math.min(view.turn, view.maxTurns)}/${view.maxTurns}`}</span>
            <span className="crystals">
              {Array.from({ length: Math.max(ENERGY_CAP, opts.energy) }, (_, i) => (
                <i key={i} className={i < energyShown ? 'on' : i < opts.energy ? 'used' : 'future'} />
              ))}
            </span>
          </div>
        </div>
      </div>

      {selected && planning && (
        <div className="stand-card" {...dragProps({ kind: 'card', cardId: selected })}>
          <div
            className="stand-card-face"
            onClick={() => {
              sfx('card.back');
              setSelected(null);
              settleFor();
            }}
          >
            <CardFace id={selected} big cost={cardCost(selected, view, me)} costWhy={costBreakdown(view, me, selected)} />
          </div>
          <button
            type="button"
            className="stand-card-more"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSheet({ kind: 'card', id: selected });
            }}
          >
            History ›
          </button>
        </div>
      )}
      {arrival && (
        <div className={`card-flash p${arrival.owner}`} aria-hidden>
          <CardFace id={arrival.cardId} big />
        </div>
      )}
      {drag && (
        <div
          className={`drag-ghost ${drag.payload.kind === 'card' ? 'card-ghost' : ''} ${drag.pointerType !== 'mouse' ? 'touch' : ''} ${drag.returning ? 'returning' : ''} ${drag.snap ? 'snap' : ''}`}
          style={drag.returning ? { left: drag.from.left + drag.from.width / 2, top: drag.from.top + drag.from.height / 2 } : { left: drag.x, top: drag.y }}
        >
          {drag.payload.kind === 'card' ? (
            <CardFace id={drag.payload.cardId} />
          ) : view.characters[drag.payload.uid] ? (
            <div className="tile">
              <Pic state={view} c={view.characters[drag.payload.uid]} />
            </div>
          ) : null}
        </div>
      )}
      {trail && <Trails shots={trail} freezeAt={trailFreeze} onDone={() => { setTrail(null); setTrailFreeze(undefined); }} />}
      {dig && <DigReveal key={digKey.current} dig={dig} me={me} freeze={digFreeze} onDone={() => { setDig(null); setDigFreeze(undefined); }} />}
      {sheet?.kind === 'card' && (
        <CardSheet
          id={sheet.id}
          onClose={() => setSheet(null)}
          extra={sheet.id === 'reparations' ? <ReparationsReadout view={view} me={me} placeholders={placeholders} /> : undefined}
          actions={
            planning && sheet.id === selected ? (
              <>
                {targetable.map((i) => (
                  <button key={i} className="small chip" onClick={() => commitPlay(i, sheet.id)}>
                    Play at {view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`}
                  </button>
                ))}
                <button
                  className="small chip"
                  onClick={() => {
                    sfx('card.back');
                    setSelected(null);
                    setSheet(null);
                    settleFor();
                  }}
                >
                  Put back
                </button>
              </>
            ) : undefined
          }
        />
      )}
      {sheet?.kind === 'char' && <CharSheet view={view} uid={sheet.uid} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'threat' && <ThreatSheet view={view} me={me} threatUid={sheet.uid} plan={plan} locked={!planning} onClose={() => setSheet(null)} onToggle={toggleConfront} />}
      {sheet?.kind === 'location' && <LocationSheet view={view} index={sheet.index} onClose={() => setSheet(null)} />}
      {m.pendingProposal && m.pendingProposal.from !== me && planning && (
        <div className="proposal">
          <span>
            <b>{view.players[m.pendingProposal.from].handle}</b> proposes a Summon at <b>{cardLocationLabel(m.pendingProposal.location)}</b>. {SUMMON.name} needs {SUMMON.force} Force from both of you.
          </span>
          <button className="small primary" onClick={m.acceptSummon} disabled={!opts.summonable.includes(m.pendingProposal.location)}>
            Summon!
          </button>
          <button className="small ghost" onClick={m.declineSummon}>
            Nah, I'm busy.
          </button>
        </div>
      )}
      {sheet?.kind === 'chat' && (
        <ChatSheet
          onClose={() => setSheet(null)}
          emotes={EMOTES}
          onEmote={(t) => {
            m.sendEmote(t);
            setSheet(null);
          }}
          summonable={planning && !plan.summon ? opts.summonable.map((i) => ({ index: i, label: cardLocationLabel(i) })) : []}
          onSummon={(i) => {
            m.proposeSummon(i);
            setSheet(null);
          }}
          chat={m.chat.map((c) => ({ from: view.players[c.from].handle, text: c.text }))}
        />
      )}
      {sheet?.kind === 'log' && <LogSheet events={m.lastTurn} turn={Math.max(1, view.turn - (view.phase === 'ended' ? 0 : 1))} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'ancestors' && <AncestorsSheet view={view} me={me} plan={m.peekAiPlan()} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'profile' && <ProfileSheet view={view} p={sheet.p} me={me} onClose={() => setSheet(null)} peek={sheet.p !== me && lastPeek ? lastPeek : undefined} />}
      {sheet?.kind === 'stepOff' && (
        <ConfirmSheet
          title="Sit Down?"
          body={`Sitting down surrenders the match. ${view.players[other(me)].handle} wins ${opts.stepOffCost} Legacy.${raisedOnMe ? ` Stay and the match is worth ${opts.pendingStakes} from next turn.` : ''}`}
          confirmLabel="Sit Down"
          danger
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            setPlan((p) => ({ ...p, stepOff: true }));
            setTimeout(() => m.lockIn(), 0);
          }}
        />
      )}
      {verdict && !peek && (
        <div className={`verdict-flash ${verdict.tone}`} aria-hidden>
          {verdict.title}
        </div>
      )}
    </div>
  );
}

/** What Reparations would pay if played now: Setbacks so far (max 4), plus one in the Americas. */
function ReparationsReadout({ view, me, placeholders }: { view: GameState; me: PlayerId; placeholders: boolean }) {
  const n = view.players[me].setbacks;
  const base = Math.min(4, n);
  const americas = view.locations.filter((l) => l.revealed && LOCATION_BY_ID[l.defId]?.region === 'americas').map((l) => locationName(l.defId, placeholders));
  return (
    <div className={`rep-readout ${n > 0 ? 'live' : ''}`}>
      <div className="rep-count">
        <b>{n}</b> Setback{n === 1 ? '' : 's'} so far
      </div>
      <div>
        {n === 0
          ? 'Nothing owed yet. Every Setback you suffer from here on adds +1 (up to +4).'
          : `Played now: +${base} lasting Influence at the Location you choose${base < n ? ' (the cap is 4)' : ''}, and +1 more in the Americas${americas.length ? ` (${americas.join(', ')})` : ''}. It counts at the end no matter when you play it.`}
      </div>
    </div>
  );
}

/** The sound for a replay beat, by what happened in it. */
function beatSfx(step: TraceStep): void {
  const evs = step.events;
  if (evs.some((e) => e.type === 'lastWord')) return sfx('lastword');
  if (evs.some((e) => e.type === 'locationLost')) return sfx('lost');
  if (evs.some((e) => e.type === 'threatNeutralized')) return sfx('threat.clear');
  if (evs.some((e) => e.type === 'threatSpawned')) return sfx('threat.spawn');
  switch (step.kind) {
    case 'play':
    case 'event':
      return sfx('card.drop');
    case 'enter':
      return sfx('enter');
    case 'move':
      return sfx('move');
    case 'stand':
    case 'stakes':
      return sfx('stand');
    case 'turncoat':
      return sfx('lost');
    case 'summon':
      return sfx('lastword');
    case 'spawn':
      return sfx('threat.clear');
    case 'reveal':
      return sfx('location.reveal');
    case 'showdown':
      return sfx('clash.hit');
    default:
      return;
  }
}
