import type { EventDef } from '../types';

export const EVENTS: EventDef[] = [
  {
    kind: 'event',
    id: 'reparations',
    name: 'Reparations',
    short: 'Reparations',
    cost: 1,
    text: 'Your lowest-scoring Location gains +1 Influence this turn for each Setback suffered this match (max +4).',
    effect: { type: 'reparations', max: 4 },
    needsLocation: false,
    blurb: 'Only neutral historical harm counts. What the opponent did to you is not the same thing.',
  },
  {
    kind: 'event',
    id: 'community_defense',
    name: 'Community Defense',
    short: 'Defense',
    cost: 2,
    text: 'Choose a Location. This turn your Characters there cannot be blocked or displaced, and they confront Threats with +1 Force.',
    effect: { type: 'communityDefense', force: 1 },
    needsLocation: true,
    blurb: 'Deacons for Defense, armed porches, neighbors who showed up.',
    history:
      'The Deacons for Defense and Justice formed in Jonesboro, Louisiana, in 1964 and spread to Bogalusa and beyond: armed Black men, many of them veterans, who escorted civil rights workers and guarded their neighborhoods against Klan attacks when the police would not. Their presence let nonviolent campaigns keep going.',
  },
  {
    kind: 'event',
    id: 'the_ancestors',
    name: 'The Ancestors',
    short: 'Ancestors',
    cost: 0,
    text: 'Play it while planning: the Ancestors show you your opponent\'s plan for this turn and every danger the board is about to spring.',
    effect: { type: 'ancestors' },
    needsLocation: false,
    blurb: 'Never in a deck. They come to whoever holds three Characters Inside at Accra, Ghana, once per match.',
    spawn: { type: 'insideAt', locationId: 'accra_ghana', count: 3, headline: 'The Ancestors have something to say.', cta: 'Listen', into: 'hand' },
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
