/**
 * Match controller: owns the true GameState, drives the AI (or hotseat handoff),
 * timers and the resolution feed. The UI only ever receives redacted views.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMatch,
  resolveTurn,
  viewFor,
  filterEvents,
  emptyPlan,
  PLANNING_SECONDS,
  type GameEvent,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type TraceStep,
} from '../engine';
import { planTurn, recordAi, aiSummonProposal, aiAcceptSummon } from '../ai/harborlight';
import { locName } from '../engine';
import { recordMatch } from '../analytics/analytics';

export type Mode = 'ai' | 'hotseat';

export interface ChatMsg {
  id: number;
  from: PlayerId;
  text: string;
  at: number;
  kind: 'emote' | 'summon' | 'accept' | 'decline';
  location?: number;
}

export const EMOTES = ['Well played', 'Ouch', 'Nah, I\'m busy.', 'Good game'];

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
  /** The turn being replayed one beat at a time, or null when the board shows the live state. */
  replay: { steps: TraceStep[]; idx: number; plan: TurnPlan } | null;
  replayNext: () => void;
  replaySkip: () => void;
  /** Tile animation stagger for the opponent's pieces. */
  delays: Record<string, number>;
  secondsLeft: number;
  handoff: PlayerId | null;
  takeDevice: () => void;
  lockIn: () => void;
  /** AI mode: Harborlight's plan for this turn (deterministic, so peeking changes nothing). */
  peekAiPlan: () => TurnPlan | null;
  newMatch: (seed?: number) => void;
  seed: number;
  trueState: GameState;
  log: GameEvent[];
  chat: ChatMsg[];
  sendEmote: (text: string) => void;
  /** Propose (and commit to) a Summon at a Location this turn. */
  proposeSummon: (location: number) => void;
  /** Accept the opponent's pending proposal. */
  acceptSummon: () => void;
  declineSummon: () => void;
  /** The opponent's open proposal this turn, if any. */
  pendingProposal: { from: PlayerId; location: number } | null;
  /** The opponent has agreed to your proposal. */
  opponentAgreed: number | null;
}

export function useMatch(initialSeed: number, mode: Mode, deckKeys?: Record<PlayerId, string>, options: { tutorial?: boolean } = {}): MatchController {
  const [seed, setSeed] = useState(initialSeed);
  const [trueState, setTrueState] = useState<GameState>(() => createMatch({ seed: initialSeed, deckKeys }));
  const [perspective, setPerspective] = useState<PlayerId>('A');
  const [plan, setPlanState] = useState<TurnPlan>(emptyPlan());
  const [locked, setLocked] = useState(false);
  const [lastTurn, setLastTurn] = useState<GameEvent[]>([]);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<{ steps: TraceStep[]; idx: number; plan: TurnPlan } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(PLANNING_SECONDS);
  const [handoff, setHandoff] = useState<PlayerId | null>(null);
  const [log, setLog] = useState<GameEvent[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [pendingProposal, setPendingProposal] = useState<{ from: PlayerId; location: number } | null>(null);
  const [opponentAgreed, setOpponentAgreed] = useState<number | null>(null);
  const aiAgreedRef = useRef<number | null>(null);
  const chatId = useRef(1);
  const say = useCallback((from: PlayerId, text: string, kind: ChatMsg['kind'] = 'emote', location?: number) => {
    setChat((c) => [...c.slice(-19), { id: chatId.current++, from, text, at: Date.now(), kind, location }]);
  }, []);
  const stashA = useRef<TurnPlan | null>(null);
  const recorded = useRef(false);
  const stateRef = useRef(trueState);
  stateRef.current = trueState;

  const setPlan = useCallback((fn: (p: TurnPlan) => TurnPlan) => setPlanState((p) => fn(p)), []);

  const liveView = useMemo(() => viewFor(trueState, perspective), [trueState, perspective]);
  const view = useMemo(() => (replay ? viewFor(replay.steps[replay.idx].state, perspective) : liveView), [replay, liveView, perspective]);
  const replayNext = useCallback(() => {
    setReplay((r) => {
      if (!r) return r;
      if (r.idx + 1 >= r.steps.length) {
        setBusy(false);
        return null;
      }
      return { ...r, idx: r.idx + 1 };
    });
  }, []);
  const replaySkip = useCallback(() => {
    setReplay(null);
    setBusy(false);
  }, []);


  const finishResolution = useCallback(
    (next: GameState, events: GameEvent[], seen: PlayerId, steps?: TraceStep[], lockedPlan?: TurnPlan) => {
      setTrueState(next);
      setLog((l) => [...l, ...events]);
      const visible = filterEvents(events, seen).filter((e) => e.text && e.type !== 'draw');
      setLastTurn(visible);
      setDelays({});
      setBusy(true);
      if (steps && steps.length) {
        // The screen replays the turn one beat at a time and clears busy when it is done.
        setReplay({ steps, idx: 0, plan: lockedPlan ?? emptyPlan() });
      } else {
        window.setTimeout(() => setBusy(false), 900);
      }
      setLocked(false);
      setPlanState(emptyPlan());
      setSecondsLeft(PLANNING_SECONDS);
      setPendingProposal(null);
      setOpponentAgreed(null);
      aiAgreedRef.current = null;
    },
    [],
  );

  const resolveWithPlans = useCallback(
    (state: GameState, plans: Record<PlayerId, TurnPlan>) => {
      const out = resolveTurn(state, plans, { trace: true });
      const events = out.events;
      const next = out.state;
      finishResolution(next, events, 'A', out.trace, plans.A);
      if (mode === 'hotseat') setPerspective('A');
    },
    [mode, finishResolution],
  );

  const aiPlanRef = useRef<{ turn: number; decision: ReturnType<typeof planTurn> } | null>(null);
  const aiDecision = useCallback(
    (state: GameState) => {
      if (aiPlanRef.current?.turn !== state.turn) aiPlanRef.current = { turn: state.turn, decision: planTurn(viewFor(state, 'B'), 'B', undefined, aiAgreedRef.current ?? undefined) };
      return aiPlanRef.current.decision;
    },
    [],
  );
  const peekAiPlan = useCallback((): TurnPlan | null => {
    const state = stateRef.current;
    if (mode !== 'ai' || state.phase !== 'planning') return null;
    return aiDecision(state).plan;
  }, [mode, aiDecision]);

  const lockIn = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== 'planning' || locked || busy) return;
    setLocked(true);
    if (mode === 'ai') {
      // Let the UI paint the locked state before the AI thinks.
      setTimeout(() => {
        const ai = aiDecision(state);
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
  }, [locked, busy, mode, plan, perspective, resolveWithPlans, aiDecision]);

  const takeDevice = useCallback(() => {
    if (!handoff) return;
    setPerspective(handoff);
    setHandoff(null);
    setSecondsLeft(PLANNING_SECONDS);
  }, [handoff]);


  const sendEmote = useCallback(
    (text: string) => {
      say(perspective, text, 'emote');
      if (mode === 'ai') {
        const replies = ['Well played', 'Respect.', 'Ouch', 'Good game', 'Let\'s go.'];
        window.setTimeout(() => say('B', replies[Math.floor(Math.random() * replies.length)], 'emote'), 900 + Math.random() * 800);
      }
    },
    [say, perspective, mode],
  );

  const proposeSummon = useCallback(
    (location: number) => {
      const state = stateRef.current;
      setPlanState((p) => ({ ...p, summon: { location } }));
      say(perspective, `Summon at ${locName(state, location)}?`, 'summon', location);
      if (mode === 'ai') {
        const accept = aiAcceptSummon(viewFor(state, 'B'), 'B', location);
        window.setTimeout(() => {
          if (accept) {
            aiAgreedRef.current = location;
            setOpponentAgreed(location);
            say('B', 'Summon!', 'accept', location);
          } else {
            say('B', 'Nah, I\'m busy.', 'decline', location);
          }
        }, 1000 + Math.random() * 900);
      } else {
        setPendingProposal({ from: perspective, location });
      }
    },
    [say, perspective, mode],
  );

  const acceptSummon = useCallback(() => {
    if (!pendingProposal) return;
    setPlanState((p) => ({ ...p, summon: { location: pendingProposal.location } }));
    say(perspective, 'Summon!', 'accept', pendingProposal.location);
    setPendingProposal(null);
  }, [pendingProposal, say, perspective]);

  const declineSummon = useCallback(() => {
    if (!pendingProposal) return;
    say(perspective, 'Nah, I\'m busy.', 'decline', pendingProposal.location);
    setPendingProposal(null);
  }, [pendingProposal, say, perspective]);

  // Harborlight may propose a Summon shortly after planning begins.
  useEffect(() => {
    if (mode !== 'ai' || trueState.phase !== 'planning' || busy || locked) return;
    const state = trueState;
    const id = window.setTimeout(() => {
      if (stateRef.current !== state) return;
      const loc = aiSummonProposal(viewFor(state, 'B'), 'B');
      if (loc === null) return;
      aiAgreedRef.current = loc;
      setPendingProposal({ from: 'B', location: loc });
      say('B', `Summon at ${locName(state, loc)}?`, 'summon', loc);
    }, 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, trueState.turn, trueState.phase]);

  // Timer.
  // The tutorial stops the clock: nothing happens until the player acts.
  const timerActive = trueState.phase === 'planning' && !locked && !busy && !handoff && !options.tutorial;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [timerActive, trueState.turn]);
  useEffect(() => {
    if (timerActive && secondsLeft === 0) lockIn();
  }, [secondsLeft, timerActive, lockIn]);
  // Tutorial: the bar inside Lock In drains for show so the player learns what it means, then starts over. It never locks anyone in.
  const showTimer = !!options.tutorial && trueState.phase === 'planning' && !locked && !busy && !handoff;
  useEffect(() => {
    if (!showTimer) return;
    const id = setInterval(() => setSecondsLeft((s) => (s <= 0 ? PLANNING_SECONDS : s - 1)), 1000);
    return () => clearInterval(id);
  }, [showTimer, trueState.turn]);

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
    setReplay(null);
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
    replay,
    replayNext,
    replaySkip,
    delays,
    secondsLeft,
    handoff,
    takeDevice,
    lockIn,
    peekAiPlan,
    newMatch,
    seed,
    trueState,
    log,
    chat,
    sendEmote,
    proposeSummon,
    acceptSummon,
    declineSummon,
    pendingProposal,
    opponentAgreed,
  };
}
