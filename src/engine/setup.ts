import { makeRng, shuffle, nextInt, nextFloat, pick } from './rng';
import { LOCATIONS, PRESET_DECKS, randomDeck, validateDeck, THREAT_BY_ID, RANDOM_THREAT_POOL, LOCATION_BY_ID, CHARACTER_BY_ID } from './content';
import type { GameState, PlayerId, PlayerState, LocationState, GameEvent, ThreatInstance } from './types';
import { CARD_BY_ID } from './content';
import { STARTING_HAND, PLAYERS, TURNS, MAX_HAND } from './types';

export interface MatchOptions {
  seed: number;
  handles?: Record<PlayerId, string>;
  avatars?: Record<PlayerId, string>;
  decks?: Record<PlayerId, string[]>;
  /** Preset keys ('railroad', 'blackstar', 'mirror', 'random'); used when `decks` is absent. */
  deckKeys?: Record<PlayerId, string>;
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
    spawned: [],
    solidarity: 0,
  };
}

/** Create a new match. Turn 1 is started immediately (hands dealt, first draw taken). */
export function createMatch(opts: MatchOptions): GameState {
  const rng = makeRng(opts.seed);
  const keys = opts.deckKeys ?? { A: 'railroad', B: 'blackstar' };
  const fromKey = (k: string) => (k === 'random' ? randomDeck((n) => nextInt(rng, n)) : (PRESET_DECKS[k] ?? PRESET_DECKS.railroad).cards);
  const decks = opts.decks ?? { A: fromKey(keys.A), B: fromKey(keys.B) };
  for (const p of PLAYERS) {
    const errs = validateDeck(decks[p]);
    if (errs.length) throw new Error(`Deck ${p} invalid: ${errs.join(' ')}`);
  }
  const handles = opts.handles ?? { A: 'Silverlake Slayer', B: 'Harborlight' };
  const avatars = opts.avatars ?? { A: 'frederick_douglass', B: 'marcus_garvey' };

  // Weighted draw without replacement (rare Locations appear less often).
  const pool = LOCATIONS.filter((l) => !l.notInPool);
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
    pendingRaises: [],
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
      summons: [],
      gateTurns: 0,
      insideTurns: 0,
    },
  };

  for (const p of PLAYERS) {
    for (let i = 0; i < STARTING_HAND; i++) drawCard(state, p);
    // Turn 1 grants 1 Energy: make sure the opening hand holds a 1-cost Character when the deck has one
    // (any 1-cost card failing that), so the first turn is never a forced pass.
    const ps = state.players[p];
    const cheap = (id: string) => (CARD_BY_ID[id]?.cost ?? 0) <= 1;
    const cheapChar = (id: string) => cheap(id) && CARD_BY_ID[id]?.kind === 'character';
    if (!ps.hand.some(cheapChar)) {
      let i = ps.deck.findIndex(cheapChar);
      if (i < 0 && !ps.hand.some(cheap)) i = ps.deck.findIndex(cheap);
      if (i >= 0) {
        const swapOut = ps.hand[ps.hand.length - 1];
        ps.hand[ps.hand.length - 1] = ps.deck[i];
        ps.deck[i] = swapOut;
      }
    }
  }
  const events: GameEvent[] = [];
  startTurn(state, events);
  state.lastEvents = events;
  return state;
}

/** Draw one card. A full hand (MAX_HAND) burns the draw to the discard pile; `events` gets the explanation when given. */
export function drawCard(state: GameState, p: PlayerId, events?: GameEvent[]): string | undefined {
  const ps = state.players[p];
  const full = ps.hand.length >= MAX_HAND;
  const card = ps.deck.shift();
  if (card) {
    ps.deckCount = ps.deck.length;
    if (full) {
      ps.discard.push(card);
      events?.push({ type: 'info', text: `${ps.handle}'s hand is full (${MAX_HAND}): ${CARD_BY_ID[card]?.name ?? card} is discarded.`, player: p, cardId: card, privateTo: p });
      return undefined;
    }
    ps.hand.push(card);
  } else if (ps.deckCount > 0 && ps.deck.length === 0) {
    // Redacted view: deck contents unknown; just decrement the count.
    ps.deckCount--;
    if (!full) ps.hand.push('hidden');
  }
  return card;
}

export function spawnThreat(state: GameState, location: number, threatId: string, events: GameEvent[]): void {
  const def = THREAT_BY_ID[threatId];
  const loc = state.locations[location];
  if (!def || loc.lost || loc.sanctified) return;
  if (loc.revealed && LOCATION_BY_ID[loc.defId]?.noThreats) return;
  if (LOCATION_BY_ID[loc.defId]?.immuneThreats?.includes(threatId)) return;
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

/** The Black Star arrives: the Location becomes its destination and everyone aboard benefits. */
export function transformLocation(state: GameState, index: number, intoId: string, events: GameEvent[]): void {
  const loc = state.locations[index];
  const from = LOCATION_BY_ID[loc.defId];
  const into = LOCATION_BY_ID[intoId];
  if (!into) return;
  loc.defId = intoId;
  loc.revealedTurn = state.turn;
  events.push({ type: 'locationTransformed', text: `${from?.name ?? 'The Location'} arrives: it is now ${into.name}.`, location: index, data: { from: from?.id, to: intoId } });
  for (const t of loc.threats) events.push({ type: 'threatNeutralized', text: `${THREAT_BY_ID[t.defId]?.name ?? 'The Threat'} at ${into.name} is left behind.`, location: index });
  loc.threats = [];
  const aboard = Object.values(state.characters).filter((c) => c.location === index);
  for (const c of aboard) c.permInfluence += 1;
  if (aboard.length) events.push({ type: 'info', text: `Everyone aboard gains +1 Influence (${aboard.length} Character${aboard.length > 1 ? 's' : ''}).`, location: index });
  const order: PlayerId[] = state.initiative === 'A' ? ['A', 'B'] : ['B', 'A'];
  for (const p of order) {
    for (const c of aboard.filter((x) => x.owner === p && x.zone === 'gate')) {
      const inside = Object.values(state.characters).filter((x) => x.owner === p && x.location === index && x.zone === 'inside').length;
      if (inside >= 5) break;
      c.zone = 'inside';
      c.ready = false;
      c.arrivedTurn = state.turn;
      events.push({ type: 'entered', text: `${CHARACTER_BY_ID[c.defId]?.name ?? c.defId} (${state.players[p].handle}) walks straight into ${into.name}.`, uid: c.uid, location: index, player: p });
    }
  }
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
    const card = drawCard(state, p, events);
    if (!card && state.players[p].deckCount === 0 && state.players[p].deck.length === 0) continue;
    if (!card) continue;
    events.push({
      type: 'draw',
      text: `${state.players[p].handle} draws a card.`,
      player: p,
      cardId: card,
      privateTo: p,
    });
    state.players[p].defendedLocation = undefined;
    state.players[p].chairLocation = undefined;
  }
  for (const loc of state.locations) {
    const before = LOCATION_BY_ID[loc.defId];
    if (loc.revealed && !loc.lost && before?.transformsInto && loc.revealedTurn !== undefined && state.turn >= loc.revealedTurn + before.transformsInto.afterTurns) {
      transformLocation(state, loc.index, before.transformsInto.id, events);
    }
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
