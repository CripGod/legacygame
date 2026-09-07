/**
 * Redacted views. Everything a player (human UI or AI) is allowed to see comes
 * through here. The AI consumes exactly this — never the true GameState.
 */
import { cloneState } from './resolve';
import type { GameState, PlayerId, GameEvent } from './types';
import { other } from './types';

export function viewFor(state: GameState, p: PlayerId): GameState {
  const v = cloneState(state);
  const opp = other(p);
  v.viewFor = p;
  // Hidden draw order and RNG.
  v.players.A.deck = [];
  v.players.B.deck = [];
  v.rng = { s: 0 };
  // Opponent hand.
  v.players[opp].hand = v.players[opp].hand.map(() => 'hidden');
  v.players[opp].knownNextReveal = undefined;
  // Unrevealed Locations.
  for (const loc of v.locations) {
    if (!loc.revealed) loc.defId = 'unknown';
  }
  v.revealOrder = [];
  v.spawnRolls = {};
  // Characters committed to hidden Locations are public once placed (they are at the Gates).
  for (const c of Object.values(v.characters)) {
    if (c.owner === opp) {
      c.wasHiddenAtCommit = undefined;
    }
  }
  v.lastEvents = filterEvents(v.lastEvents, p);
  return v;
}

export function filterEvents(events: GameEvent[], p: PlayerId): GameEvent[] {
  return events
    .filter((e) => !e.privateTo || e.privateTo === p)
    .map((e) => (e.type === 'draw' && e.player !== p ? { ...e, cardId: undefined } : e));
}
