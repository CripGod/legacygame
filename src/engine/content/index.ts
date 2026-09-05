import type { CardDef, CharacterDef, EventDef } from '../types';
import { CHARACTERS, CHARACTER_BY_ID } from './characters';
import { EVENTS, EVENT_BY_ID } from './events';
import { LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION } from './locations';
import { THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL } from './threats';

export { CHARACTERS, CHARACTER_BY_ID, EVENTS, EVENT_BY_ID, LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION, THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL };

export const CARD_BY_ID: Record<string, CardDef> = { ...CHARACTER_BY_ID, ...EVENT_BY_ID };

export function cardDef(id: string): CardDef {
  const d = CARD_BY_ID[id];
  if (!d) throw new Error(`Unknown card: ${id}`);
  return d;
}

export function charDef(id: string): CharacterDef {
  const d = CHARACTER_BY_ID[id];
  if (!d) throw new Error(`Unknown character: ${id}`);
  return d;
}

export function eventDef(id: string): EventDef {
  const d = EVENT_BY_ID[id];
  if (!d) throw new Error(`Unknown event: ${id}`);
  return d;
}

export function isCharacterCard(id: string): boolean {
  return CARD_BY_ID[id]?.kind === 'character';
}

/** Preset 12-card decks. Both decks are legal: no duplicate Characters, max 2 Events. */
export const PRESET_DECKS: Record<string, { name: string; cards: string[] }> = {
  silverlake: {
    name: 'Silverlake Slayer — Railroad',
    cards: [
      'harriet_tubman',
      'frederick_douglass',
      'john_brown',
      'katherine_johnson',
      'mansa_musa',
      'zora_neale_hurston',
      'organizer',
      'og',
      'ida_b_wells',
      'queen_nzinga',
      'reparations',
      'community_defense',
    ],
  },
  harborlight: {
    name: 'Harborlight — Black Star',
    cards: [
      'marcus_garvey',
      'toussaint_louverture',
      'bessie_coleman',
      'pullman_porter',
      'sojourner_truth',
      'karen',
      'mansa_musa',
      'frederick_douglass',
      'harriet_tubman',
      'john_brown',
      'reparations',
      'community_defense',
    ],
  },
};

export function validateDeck(cards: string[]): string[] {
  const errors: string[] = [];
  if (cards.length !== 12) errors.push(`Deck must have 12 cards (has ${cards.length}).`);
  const seen = new Set<string>();
  let events = 0;
  for (const id of cards) {
    const def = CARD_BY_ID[id];
    if (!def) {
      errors.push(`Unknown card ${id}.`);
      continue;
    }
    if (def.kind === 'character') {
      if (seen.has(id)) errors.push(`Duplicate Character ${def.name}.`);
      seen.add(id);
    } else {
      events++;
    }
  }
  if (events > 2) errors.push(`Maximum 2 Event cards (has ${events}).`);
  return errors;
}
