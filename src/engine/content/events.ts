import type { EventDef } from '../types';

export const EVENTS: EventDef[] = [
  {
    kind: 'event',
    id: 'reparations',
    name: 'Reparations',
    short: 'Reparations',
    text: 'Your lowest-scoring Location gains +1 Influence this turn for each qualifying Setback suffered this match (max +4).',
    effect: { type: 'reparations', max: 4 },
    needsLocation: false,
    blurb: 'Only neutral historical harm counts. What the opponent did to you is not the same thing.',
  },
  {
    kind: 'event',
    id: 'community_defense',
    name: 'Community Defense',
    short: 'Defense',
    text: 'Choose a Location. This turn your Characters there cannot be blocked or displaced, and they confront Threats with +1 Force.',
    effect: { type: 'communityDefense', force: 1 },
    needsLocation: true,
    blurb: 'Deacons for Defense, armed porches, neighbors who showed up.',
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
