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
    history:
      'The Deacons for Defense and Justice formed in Jonesboro, Louisiana, in 1964 and spread to Bogalusa and beyond: armed Black men, many of them veterans, who escorted civil rights workers and guarded their neighborhoods against Klan attacks when the police would not. Their presence let nonviolent campaigns keep going.',
  },
  {
    kind: 'event',
    id: 'cookout',
    name: 'The Cookout',
    short: 'Cookout',
    text: 'Choose a Location. Your Fresh Gate Characters there become Ready now, and each of your Established Characters there gains +1 Influence this turn.',
    effect: { type: 'cookout', influence: 1 },
    needsLocation: true,
    blurb: 'Everybody eats. Bring a chair, fix a plate, you are in.',
    history:
      'The Black cookout grows out of emancipation celebrations, church picnics and the Southern barbecue tradition that enslaved and freed Black pitmasters built. The Great Migration carried it to backyards and parks in every Northern city. "Invited to the cookout" became shorthand for being welcomed into the community.',
  },
  {
    kind: 'event',
    id: 'chairteenth',
    name: 'Chairteenth',
    short: 'Chairteenth',
    text: 'Choose a Location where you have a Character. Add +3 Force this turn against the Threat there your Characters confront (or the weakest Threat if nobody confronts).',
    effect: { type: 'chairteenth', force: 3 },
    needsLocation: true,
    blurb: 'Somebody grabbed a folding chair. The whole dock showed up.',
    history:
      'On August 5, 2023, at Riverfront Park in Montgomery, Alabama, a group of white boaters attacked a Black riverboat co-captain who had asked them to move their pontoon from the Harriott II\'s docking space. Bystanders, most of them Black, rushed to his defense; one man swam across the river to join in, and a folding chair became the day\'s symbol. Videos went viral, several of the boaters were charged with assault, and the internet named the anniversary Chairteenth.',
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
