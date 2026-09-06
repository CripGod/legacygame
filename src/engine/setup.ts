import { makeRng, shuffle, nextInt, nextFloat, pick } from './rng';
import { LOCATIONS, PRESET_DECKS, validateDeck, THREAT_BY_ID, RANDOM_THREAT_POOL, LOCATION_BY_ID } from './content';
import type { GameState, PlayerId, PlayerState, LocationState, GameEvent, ThreatInstance } from './types';
import { STARTING_HAND, PLAYERS, TURNS } from './types';

export interface MatchOptions {
  seed: number;
  handles?: Record<PlayerId, string>;
  avatars?: Record<PlayerId, string>;
  decks?: Record<PlayerId, string[]>;
}

function makePlayer(id: PlayerId, handle: string, avatar: string, deck: string[]): PlayerState {
  return {
    id,
    handle,
    avatarDefId: avatar,
    deck,
    deckCount: deck.length,
    hand: [],
    discard: [],
    setbacks: 0,
    standUsed: false,
    solidarity: 0,
  };
}

/** Create a new match. Turn 1 is started immediately (hands dealt, first draw taken). */
export function createMatch(opts: MatchOptions): GameState {
  const rng = makeRng(opts.seed);
  const decks = opts.decks ?? { A: PRESET_DECKS.silverlake.cards, B: PRESET_DECKS.harborlight.cards };
  for (const p of PLAYERS) {
    const errs = validateDeck(decks[p]);
    if (errs.length) throw new Error(`Deck ${p} invalid: ${errs.join(' ')}`);
  }
  const handles = opts.handles ?? { A: 'Silverlake Slayer', B: 'Harborlight' };
  const avatars = opts.avatars ?? { A: 'frederick_douglass', B: 'marcus_garvey' };

  // Weighted draw without replacement (rare Locations appear less often).
  const pool = LOCATIONS.slice();
  const chosen: typeof LOCATIONS = [];
  while (chosen.length < 3 && pool.length) {
    const total = pool.reduce((s, l) => s + (l.weight ?? 1), 0);
    let r = nextFloat(rng) * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight ?? 1;
      if (r <= 0) break;
    }
    chosen.push(pool.splice(idx, 1)[0]);
  }
  const locations: LocationState[] = chosen.map((def, index) => ({
    index,
    defId: def.id,
    revealed: false,
    threats: [],
    lost: false,
    tempInfluence: { A: 0, B: 0 },
  }));
  const revealOrder = shuffle(rng, [0, 1, 2]);

  const state: GameState = {
    seed: opts.seed,
    rng,
    turn: 0,
    phase: 'planning',
    players: {
      A: makePlayer('A', handles.A, avatars.A, shuffle(rng, decks.A)),
      B: makePlayer('B', handles.B, avatars.B, shuffle(rng, decks.B)),
    },
    locations,
    revealOrder,
    characters: {},
    initiative: nextInt(rng, 2) === 0 ? 'A' : 'B',
    stakes: 1,
    maxTurns: TURNS,
    leadHistory: [],
    nextUid: 1,
    lastEvents: [],
    stats: {
      plays: { A: [], B: [] },
      relocations: { A: 0, B: 0 },
      assists: { A: { offered: 0, taken: 0 }, B: { offered: 0, taken: 0 } },
      leadChanges: 0,
      finalTurnFlips: 0,
      standTurns: [],
      gateTurns: 0,
      insideTurns: 0,
    },
  };

  for (const p of PLAYERS) {
    for (let i = 0; i < STARTING_HAND; i++) drawCard(state, p);
  }
  const events: GameEvent[] = [];
  startTurn(state, events);
  state.lastEvents = events;
  return state;
}

export function drawCard(state: GameState, p: PlayerId): string | undefined {
  const ps = state.players[p];
  const card = ps.deck.shift();
  if (card) {
    ps.hand.push(card);
    ps.deckCount = ps.deck.length;
  } else if (ps.deckCount > 0 && ps.deck.length === 0) {
    // Redacted view: deck contents unknown; just decrement the count.
    ps.deckCount--;
    ps.hand.push('hidden');
  }
  return card;
}

export function spawnThreat(state: GameState, location: number, threatId: string, events: GameEvent[]): void {
  const def = THREAT_BY_ID[threatId];
  const loc = state.locations[location];
  if (!def || loc.lost) return;
  const make = (target?: PlayerId): ThreatInstance => ({
    uid: `t${state.nextUid++}`,
    defId: threatId,
    location,
    target,
    forceRequired: def.force,
    spawnedTurn: state.turn,
  });
  if (def.split) {
    for (const p of PLAYERS) {
      if (loc.threats.some((t) => t.defId === threatId && t.target === p)) continue;
      loc.threats.push(make(p));
    }
  } else {
    if (loc.threats.some((t) => t.defId === threatId)) return;
    loc.threats.push(make());
  }
  events.push({
    type: 'threatSpawned',
    text: `${def.name} appears at ${locName(state, location)}.`,
    location,
    data: { threatId },
  });
}

export function locName(state: GameState, index: number): string {
  const loc = state.locations[index];
  if (!loc.revealed) return `Location ${index + 1}`;
  return LOCATION_BY_ID[loc.defId]?.name ?? `Location ${index + 1}`;
}

/** Begin a new turn: advance counter, draw, timed threats, reset per-turn fields. */
export function startTurn(state: GameState, events: GameEvent[]): void {
  state.turn += 1;
  state.phase = 'planning';
  events.push({ type: 'turnStart', text: `Turn ${state.turn} begins.`, data: { turn: state.turn } });
  if (state.turn > 1) {
    state.initiative = state.initiative === 'A' ? 'B' : 'A';
  }
  for (const p of PLAYERS) {
    const card = drawCard(state, p);
    events.push({
      type: 'draw',
      text: `${state.players[p].handle} draws a card.`,
      player: p,
      cardId: card,
      privateTo: p,
    });
    state.players[p].defendedLocation = undefined;
  }
  for (const loc of state.locations) {
    loc.firstRelocatedThisTurn = undefined;
    loc.firstRelocatedByOwner = {};
    loc.tempInfluence = { A: 0, B: 0 };
    const def = LOCATION_BY_ID[loc.defId];
    if (loc.revealed && def?.timedThreat && def.timedThreat.turn === state.turn) {
      spawnThreat(state, loc.index, def.timedThreat.threatId, events);
    }
  }
  // "History moves": on Turn 3 a random neutral Threat appears at a revealed Location without one.
  if (state.turn === 3 && state.revealOrder.length > 0) {
    const candidates = state.locations.filter((l) => l.revealed && !l.lost && l.threats.length === 0);
    if (candidates.length) {
      const loc = pick(state.rng, candidates);
      const threatId = pick(state.rng, RANDOM_THREAT_POOL);
      spawnThreat(state, loc.index, threatId, events);
    }
  }
}
