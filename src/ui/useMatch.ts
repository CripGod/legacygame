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
  feed: GameEvent[];
  feedIndex: number;
  skipFeed: () => void;
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

const FEED_MS = 450;

export function useMatch(initialSeed: number, mode: Mode): MatchController {
  const [seed, setSeed] = useState(initialSeed);
  const [trueState, setTrueState] = useState<GameState>(() => createMatch({ seed: initialSeed }));
  const [perspective, setPerspective] = useState<PlayerId>('A');
  const [plan, setPlanState] = useState<TurnPlan>(emptyPlan());
  const [locked, setLocked] = useState(false);
  const [feed, setFeed] = useState<GameEvent[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
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

  // Feed animation.
  useEffect(() => {
    if (!feed.length) return;
    if (feedIndex >= feed.length) {
      if (busy) setBusy(false);
      const id = setTimeout(() => setFeed([]), 2200);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setFeedIndex((i) => i + 1), FEED_MS);
    return () => clearTimeout(id);
  }, [feed, feedIndex, busy]);

  const skipFeed = useCallback(() => setFeedIndex(feed.length), [feed.length]);

  const finishResolution = useCallback(
    (next: GameState, events: GameEvent[], seen: PlayerId) => {
      setTrueState(next);
      setLog((l) => [...l, ...events]);
      setFeed(filterEvents(events, seen).filter((e) => e.text && e.type !== 'draw' && e.type !== 'influence'));
      setFeedIndex(0);
      setBusy(true);
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
    const st = createMatch({ seed: ns });
    setTrueState(st);
    setPerspective('A');
    setPlanState(emptyPlan());
    setLocked(false);
    setFeed([]);
    setFeedIndex(0);
    setBusy(false);
    setSecondsLeft(PLANNING_SECONDS);
    setHandoff(null);
    setLog(st.lastEvents);
    stashA.current = null;
    recorded.current = false;
  }, []);

  return {
    view,
    perspective,
    mode,
    plan,
    setPlan,
    locked,
    busy,
    feed,
    feedIndex,
    skipFeed,
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
