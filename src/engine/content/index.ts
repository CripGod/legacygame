import type { CardDef, CharacterDef, EventDef } from '../types';
import { DECK_SIZE } from '../types';
import { CHARACTERS, CHARACTER_BY_ID, GATHERING_DEFS } from './characters';
import { EVENTS, EVENT_BY_ID } from './events';
import { LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION } from './locations';
import { THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL } from './threats';

export { CHARACTERS, GATHERING_DEFS, CHARACTER_BY_ID, EVENTS, EVENT_BY_ID, LOCATIONS, LOCATION_BY_ID, UNKNOWN_LOCATION, THREATS, THREAT_BY_ID, RANDOM_THREAT_POOL };

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

/** Preset 18-card decks. Every deck is legal: no duplicate Characters, max 2 Events, at least one Mythic. */
export const PRESET_DECKS: Record<string, { name: string; style: string; cards: string[] }> = {
  railroad: {
    name: 'Railroad',
    style: 'Movement and organizing. Harriet moves people, Douglass and Organizer build a Location, Freeman and Stevens hold it, Pleasant bankrolls the late turns, John Brown is elsewhere: Nzinga breaks the Threats.',
    cards: [
      'harriet_tubman',
      'frederick_douglass',
      'alonzo_herndon',
      'zora_neale_hurston',
      'organizer',
      'queen_nzinga',
      'sleeping_car_porters',
      'edmonia_lewis',
      'mansa_musa',
      'anansi',
      'reparations',
      'word_of_mouth',
      'paul_laurence_dunbar',
      'bass_reeves',
      'john_russwurm',
      'bud_billiken',
      'sojourner_truth',
      'tom_bass',
      'victor_hugo_green',
      'ayuba_suleiman_diallo',
      'katherine_johnson',
      'elizabeth_freeman',
      'thaddeus_stevens',
      'mary_ellen_pleasant',
    ],
  },
  blackstar: {
    name: 'Black Star',
    style: 'Mobility and return. Garvey sends your Characters out Ready and Shadd Cary readies them where they land, Green and Smalls relocate freely, Nehanda comes back when pushed out, Peter Prioleau is planted on the other side to drain a Location, the artists leave Influence behind, and Asantewaa and Menelik close the late turns.',
    cards: [
      'marcus_garvey',
      'toussaint_louverture',
      'bessie_coleman',
      'nehanda',
      'ida_b_wells',
      'victor_hugo_green',
      'john_russwurm',
      'robert_smalls',
      'yemoja',
      'reparations',
      'peter_prioleau',
      'robert_duncanson',
      'community_defense',
      'mami_wata',
      'og',
      'madam_cj_walker',
      'oshun',
      'claudette_colvin',
      'dave_the_potter',
      'harriet_powers',
      'scott_joplin',
      'mary_ann_shadd_cary',
      'yaa_asantewaa',
      'menelik_ii',
    ],
  },
  caiman: {
    name: 'Bois Caïman',
    style: 'The cost flow. Fatiman, Booker T. and Carver bring prices down, Rebellion Characters (Zumbi among them) make Boukman (8) cheaper still, his Uprising sends every Ready Character Inside at once, and Lincoln readies the Gates where you trail.',
    cards: [
      'boukman_dutty',
      'cecile_fatiman',
      'booker_t_washington',
      'george_washington_carver',
      'queen_nzinga',
      'denmark_vesey',
      'nanny_of_the_maroons',
      'nehanda',
      'marie_laveau',
      'bud_billiken',
      'ogun',
      'word_of_mouth',
      'madam_cj_walker',
      'shango',
      'og',
      'john_brown',
      'oshun',
      'absalom_jones',
      'daniel_payne',
      'robert_smalls',
      'henry_ossawa_tanner',
      'zumbi_dos_palmares',
      'charles_sumner',
      'abraham_lincoln',
    ],
  },
  pantheon: {
    name: 'Pantheon',
    style: 'Three orisha with the church behind them: Allen, Jones and Payne can call Black Jesus, Crowther brings a friend across and Seacole tends the Gates, Vesey pays for it, Walker keeps the cards coming, and Tanner paints the church into the ground it stands on.',
    cards: [
      'shango',
      'oshun',
      'ogun',
      'john_brown',
      'scott_joplin',
      'denmark_vesey',
      'absalom_jones',
      'richard_allen',
      'daniel_payne',
      'madam_cj_walker',
      'word_of_mouth',
      'henry_ossawa_tanner',
      'bud_billiken',
      'henry_mcneal_turner',
      'reparations',
      'omar_ibn_said',
      'harriet_powers',
      'callie_house',
      'samuel_ajayi_crowther',
      'james_lafayette',
      'william_lloyd_garrison',
      'nanny_of_the_maroons',
      'sojourner_truth',
      'mary_seacole',
    ],
  },
  mirror: {
    name: 'Mirror',
    style: 'Both players get the same cards. The cleanest way to test the rules and the Locations.',
    cards: [
      'harriet_tubman',
      'frederick_douglass',
      'omar_ibn_said',
      'mansa_musa',
      'ayuba_suleiman_diallo',
      'organizer',
      'queen_nzinga',
      'absalom_jones',
      'bessie_coleman',
      'shango',
      'reparations',
      'community_defense',
      'john_brown',
      'edmonia_lewis',
      'zora_neale_hurston',
      'tom_bass',
      'george_wilson',
      'roger_taney',
      'ogun',
      'oshun',
      'edward_bannister',
      'thaddeus_stevens',
      'charles_sumner',
      'cathay_williams',
    ],
  },
};

/** A seeded random deck: DECK_SIZE − 2 distinct Characters and two Events. */
export function randomDeck(pick: (n: number) => number): string[] {
  // Every deck carries at least one Mythic.
  const mythics = CHARACTERS.filter((c) => c.category === 'mythic' && !c.spawn).map((c) => c.id);
  const first = mythics[pick(mythics.length)];
  const pool = CHARACTERS.filter((c) => c.category !== 'gathering' && !c.spawn && !c.hidden && c.id !== first).map((c) => c.id);
  const chosen: string[] = [first];
  while (chosen.length < DECK_SIZE - 2) chosen.push(pool.splice(pick(pool.length), 1)[0]);
  const ev = EVENTS.filter((e) => !e.spawn).map((e) => e.id);
  const picked: string[] = [];
  while (picked.length < 2) picked.push(ev.splice(pick(ev.length), 1)[0]);
  return [...chosen, ...picked];
}

export function validateDeck(cards: string[]): string[] {
  const errors: string[] = [];
  if (cards.length !== DECK_SIZE) errors.push(`Deck must have ${DECK_SIZE} cards (has ${cards.length}).`);
  const seen = new Set<string>();
  let events = 0;
  for (const id of cards) {
    const def = CARD_BY_ID[id];
    if (!def) {
      errors.push(`Unknown card ${id}.`);
      continue;
    }
    if (def.kind === 'character') {
      if (def.category === 'gathering' || def.spawn) errors.push(`${def.name} arrives on its own and cannot be put in a deck.`);
      if (def.hidden) errors.push(`${def.name} is not in the game right now.`);
      if (seen.has(id)) errors.push(`Duplicate Character ${def.name}.`);
      seen.add(id);
    } else {
      events++;
    }
  }
  if (events > 2) errors.push(`Maximum 2 Event cards (has ${events}).`);
  if (!cards.some((id) => CARD_BY_ID[id]?.kind === 'character' && (CARD_BY_ID[id] as { category?: string }).category === 'mythic')) errors.push('Every deck carries at least one Mythic.');
  return errors;
}
