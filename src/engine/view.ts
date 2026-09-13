/**
 * Redacted views. Everything a player (human UI or AI) is allowed to see comes
 * through here. The AI consumes exactly this — never the true GameState.
 */
import { cloneState } from './resolve';
import type { GameState, PlayerId, GameEvent } from './types';
import { other } from './types';
import { CARD_BY_ID } from './content';

export function viewFor(state: GameState, p: PlayerId): GameState {
  const v = cloneState(state);
  const opp = other(p);
  v.viewFor = p;
  // Hidden draw order and RNG. You still know how many of your own Events are left to draw.
  v.players[p].deckEvents = state.players[p].deck.filter((id) => CARD_BY_ID[id]?.kind === 'event').length;
  v.players[opp].deckEvents = undefined;
  v.players.A.deck = [];
  v.players.B.deck = [];
  v.rng = { s: 0 };
  // Opponent hand.
  v.players[opp].hand = v.players[opp].hand.map(() => 'hidden');
  v.players[opp].knownNextReveal = undefined;
  // Unrevealed Locations, except the one Dunbar foretold for this player: its name is theirs to see.
  for (const loc of v.locations) {
    if (!loc.revealed && v.players[p].knownNextReveal !== loc.index) loc.defId = 'unknown';
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
