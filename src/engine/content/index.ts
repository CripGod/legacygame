import type { CardDef, CharacterDef, EventDef } from '../types';
import { CHARACTERS, CHARACTER_BY_ID } from './characters';
import { EVENTS, EVENT_BY_ID } from './events';
import { LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION } from './locations';
import { THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL } from './threats';

export { CHARACTERS, CHARACTER_BY_ID, EVENTS, EVENT_BY_ID, LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION, THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL };

export const CARD_BY_ID: Record<string, CardDef> = { ...CHARACTER_BY_ID, ...EVENT_BY_ID };

/** The joint Summon. Not a card: both players must call, and both must contribute. */
export const SUMMON = {
  id: 'obatala',
  name: 'Obatala',
  force: 6,
  minEach: 1,
  text: 'Both players commit at a Location with a Threat. If each contributes at least 1 Force and the total reaches 6, Obatala manifests: every Threat there is cleared, the Location can never be Lost, every Character there gains +1 Influence, and both players draw a card. If the Summon fails and the Location is later Lost, both players lose 1 Influence at each of their other Locations.',
  blurb: 'Orisha of the white cloth, of peace, clarity and creation; the one the others turn to when they have made a mess of the world. Mythic: fantasy drawn from Yoruba tradition.',
};

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
export const PRESET_DECKS: Record<string, { name: string; style: string; cards: string[] }> = {
  railroad: {
    name: 'Railroad',
    style: 'Movement and organizing. Harriet moves people, Douglass and Organizer build a Location, Nzinga and OG push back.',
    cards: [
      'harriet_tubman',
      'frederick_douglass',
      'john_brown',
      'katherine_johnson',
      'mansa_musa',
      'zora_neale_hurston',
      'organizer',
      'sojourner_truth',
      'ida_b_wells',
      'queen_nzinga',
      'cookout',
      'community_defense',
    ],
  },
  blackstar: {
    name: 'Black Star',
    style: 'Mobility and disruption. Garvey, Green and Porter relocate freely; Toussaint and Sojourner break the other side\'s plans; Karen is a gamble.',
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
      'victor_hugo_green',
      'reparations',
      'chairteenth',
    ],
  },
  pantheon: {
    name: 'Pantheon',
    style: 'The Mythic category: orisha, Anansi and Black Jesus alongside three anchors from history. Rule-bending abilities.',
    cards: [
      'anansi',
      'shango',
      'oshun',
      'yemoja',
      'ogun',
      'mami_wata',
      'black_jesus',
      'harriet_tubman',
      'frederick_douglass',
      'mansa_musa',
      'reparations',
      'community_defense',
    ],
  },
  mirror: {
    name: 'Mirror',
    style: 'Both players get the same twelve cards. The cleanest way to test the rules and the Locations.',
    cards: [
      'harriet_tubman',
      'frederick_douglass',
      'john_brown',
      'katherine_johnson',
      'mansa_musa',
      'zora_neale_hurston',
      'organizer',
      'ida_b_wells',
      'queen_nzinga',
      'toussaint_louverture',
      'cookout',
      'chairteenth',
    ],
  },
};

/** A seeded random 12-card deck: ten distinct Characters and both Events. */
export function randomDeck(pick: (n: number) => number): string[] {
  const pool = CHARACTERS.map((c) => c.id);
  const chosen: string[] = [];
  while (chosen.length < 10) chosen.push(pool.splice(pick(pool.length), 1)[0]);
  const ev = EVENTS.map((e) => e.id);
  const picked: string[] = [];
  while (picked.length < 2) picked.push(ev.splice(pick(ev.length), 1)[0]);
  return [...chosen, ...picked];
}

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
