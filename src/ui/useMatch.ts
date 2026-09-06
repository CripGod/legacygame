/**
 * Match controller: owns the true GameState, drives the AI (or hotseat handoff),
 * timers and the resolution feed. The UI only ever receives redacted views.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMatch,
  resolveTurn,
  respondToStand,
  viewFor,
  filterEvents,
  emptyPlan,
  other,
  PLANNING_SECONDS,
  type GameEvent,
  type GameState,
  type PlayerId,
  type TurnPlan,
} from '../engine';
import { planTurn, respondToStandAi, recordAi } from '../ai/harborlight';
import { recordMatch } from '../analytics/analytics';

export type Mode = 'ai' | 'hotseat';

export interface MatchController {
  view: GameState;
  perspective: PlayerId;
  mode: Mode;
  plan: TurnPlan;
  setPlan: (fn: (p: TurnPlan) => TurnPlan) => void;
  locked: boolean;
  busy: boolean;
  /** Events from the most recent resolution, as seen by the perspective player. */
  lastTurn: GameEvent[];
  /** Tile animation stagger for the opponent's pieces. */
  delays: Record<string, number>;
  secondsLeft: number;
  handoff: PlayerId | null;
  takeDevice: () => void;
  lockIn: () => void;
  respondStand: (continueMatch: boolean) => void;
  newMatch: (seed?: number) => void;
  seed: number;
  trueState: GameState;
  log: GameEvent[];
}

const STAGGER_MS = 160;

export function useMatch(initialSeed: number, mode: Mode, deckKeys?: Record<PlayerId, string>): MatchController {
  const [seed, setSeed] = useState(initialSeed);
  const [trueState, setTrueState] = useState<GameState>(() => createMatch({ seed: initialSeed, deckKeys }));
  const [perspective, setPerspective] = useState<PlayerId>('A');
  const [plan, setPlanState] = useState<TurnPlan>(emptyPlan());
  const [locked, setLocked] = useState(false);
  const [lastTurn, setLastTurn] = useState<GameEvent[]>([]);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PLANNING_SECONDS);
  const [handoff, setHandoff] = useState<PlayerId | null>(null);
  const [log, setLog] = useState<GameEvent[]>([]);
  const stashA = useRef<TurnPlan | null>(null);
  const recorded = useRef(false);
  const stateRef = useRef(trueState);
  stateRef.current = trueState;

  const setPlan = useCallback((fn: (p: TurnPlan) => TurnPlan) => setPlanState((p) => fn(p)), []);

  const view = useMemo(() => viewFor(trueState, perspective), [trueState, perspective]);


  const finishResolution = useCallback(
    (next: GameState, events: GameEvent[], seen: PlayerId) => {
      setTrueState(next);
      setLog((l) => [...l, ...events]);
      const visible = filterEvents(events, seen).filter((e) => e.text && e.type !== 'draw');
      setLastTurn(visible);
      // Only the opponent's pieces animate; stagger them in event order.
      const d: Record<string, number> = {};
      let i = 0;
      for (const e of visible) {
        if (!e.uid || d[e.uid] !== undefined) continue;
        if (e.type !== 'moved' && e.type !== 'entered') continue;
        const c = next.characters[e.uid];
        if (!c || c.owner === seen) continue;
        d[e.uid] = Math.min(2400, i * STAGGER_MS);
        i++;
      }
      setDelays(d);
      const maxDelay = Object.values(d).reduce((m, v) => Math.max(m, v), 0);
      setBusy(true);
      window.setTimeout(() => setBusy(false), (i ? maxDelay + 800 : 0) + 900);
      setLocked(false);
      setPlanState(emptyPlan());
      setSecondsLeft(PLANNING_SECONDS);
    },
    [],
  );

  const resolveWithPlans = useCallback(
    (state: GameState, plans: Record<PlayerId, TurnPlan>) => {
      let out = resolveTurn(state, plans);
      let events = out.events;
      let next = out.state;
      // AI answers a Stand on Business immediately.
      if (mode === 'ai' && next.phase === 'standResponse' && next.pendingStand?.by === 'A') {
        const r = respondToStandAi(viewFor(next, 'B'), 'B');
        const res = respondToStand(next, 'B', r.continueMatch);
        next = res.state;
        events = [...events, ...res.events];
      }
      finishResolution(next, events, 'A');
      if (mode === 'hotseat') setPerspective('A');
    },
    [mode, finishResolution],
  );

  const lockIn = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== 'planning' || locked || busy) return;
    setLocked(true);
    if (mode === 'ai') {
      // Let the UI paint the locked state before the AI thinks.
      setTimeout(() => {
        const ai = planTurn(viewFor(state, 'B'), 'B');
        recordAi(ai.debug);
        resolveWithPlans(state, { A: plan, B: ai.plan });
      }, 60);
    } else if (perspective === 'A') {
      stashA.current = plan;
      setPlanState(emptyPlan());
      setLocked(false);
      setHandoff('B');
    } else {
      const a = stashA.current ?? emptyPlan();
      stashA.current = null;
      resolveWithPlans(state, { A: a, B: plan });
    }
  }, [locked, busy, mode, plan, perspective, resolveWithPlans]);

  const takeDevice = useCallback(() => {
    if (!handoff) return;
    setPerspective(handoff);
    setHandoff(null);
    setSecondsLeft(PLANNING_SECONDS);
  }, [handoff]);

  const respondStand = useCallback(
    (continueMatch: boolean) => {
      const state = stateRef.current;
      if (state.phase !== 'standResponse' || !state.pendingStand) return;
      const responder = other(state.pendingStand.by);
      const res = respondToStand(state, responder, continueMatch);
      finishResolution(res.state, res.events, responder);
      if (mode === 'hotseat') setPerspective('A');
    },
    [finishResolution, mode],
  );

  // Hotseat: the responder to a Stand must take the device.
  useEffect(() => {
    if (mode !== 'hotseat' || busy) return;
    if (trueState.phase === 'standResponse' && trueState.pendingStand) {
      const responder = other(trueState.pendingStand.by);
      if (perspective !== responder && !handoff) setHandoff(responder);
    }
  }, [mode, busy, trueState, perspective, handoff]);

  // Timer.
  const timerActive = trueState.phase === 'planning' && !locked && !busy && !handoff;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [timerActive, trueState.turn]);
  useEffect(() => {
    if (timerActive && secondsLeft === 0) lockIn();
  }, [secondsLeft, timerActive, lockIn]);

  // Analytics on match end.
  useEffect(() => {
    if (trueState.phase === 'ended' && !recorded.current) {
      recorded.current = true;
      recordMatch(trueState, mode);
    }
  }, [trueState, mode]);

  const newMatch = useCallback((s?: number) => {
    const ns = s ?? Math.floor(Math.random() * 1_000_000);
    setSeed(ns);
    const st = createMatch({ seed: ns, deckKeys });
    setTrueState(st);
    setPerspective('A');
    setPlanState(emptyPlan());
    setLocked(false);
    setLastTurn([]);
    setDelays({});
    setBusy(false);
    setSecondsLeft(PLANNING_SECONDS);
    setHandoff(null);
    setLog(st.lastEvents);
    stashA.current = null;
    recorded.current = false;
  }, [deckKeys]);

  return {
    view,
    perspective,
    mode,
    plan,
    setPlan,
    locked,
    busy,
    lastTurn,
    delays,
    secondsLeft,
    handoff,
    takeDevice,
    lockIn,
    respondStand,
    newMatch,
    seed,
    trueState,
    log,
  };
}
