import type { LocationDef } from '../types';

export const LOCATIONS: LocationDef[] = [
  {
    id: 'greenwood',
    name: 'Greenwood District',
    era: 'Tulsa, 1921',
    rule: 'Established Characters here gain +1 Influence. On Turn 4 a Supremacist Mob arrives.',
    blurb: '"Black Wall Street" — a prosperous district destroyed by a white mob in 1921 while authorities looked away.',
    effect: { type: 'insideInfluence', amount: 1 },
    timedThreat: { turn: 4, threatId: 'supremacist_mob' },
  },
  {
    id: 'harpers_ferry',
    name: 'Harpers Ferry',
    era: 'Virginia, 1859',
    rule: 'Characters confronting Threats here receive +2 Force. Reveals with a Slave Catcher hunting each player.',
    blurb: 'Site of John Brown\'s raid on the federal armory, the spark that made the coming war unavoidable.',
    effect: { type: 'confrontForce', amount: 2 },
    spawnOnReveal: 'slave_catcher',
  },
  {
    id: 'black_star',
    name: 'The Black Star',
    era: 'Atlantic, 1919',
    rule: 'Characters you relocate out of this Location arrive Ready.',
    blurb: 'Marcus Garvey\'s Black Star Line: ships owned by Black people, connecting the diaspora on its own terms.',
    effect: { type: 'relocatedOutReady' },
  },
  {
    id: 'great_migration',
    name: 'Great Migration',
    era: '1916–1970',
    rule: 'The first Character relocated here each turn enters immediately.',
    blurb: 'Six million people left the rural South for northern and western cities, remaking America.',
    effect: { type: 'firstRelocatedEnters' },
  },
  {
    id: 'juneteenth',
    name: 'Juneteenth',
    era: 'Galveston, 1865',
    rule: 'Gate Characters here become Ready the turn they arrive (including when this Location reveals).',
    blurb: 'June 19th, 1865: the day freedom finally reached Texas, two years after it was declared.',
    effect: { type: 'readyOnArrival' },
  },
  {
    id: 'sundown_town',
    name: 'Sundown Town',
    era: '1890–1968',
    rule: 'At the end of each turn, Fresh Gate Characters here are displaced to a random other Location. (Setback)',
    blurb: 'Thousands of towns enforced, by sign, ordinance or violence, that Black people be gone by nightfall.',
    effect: { type: 'displaceFreshAtEnd' },
  },
];

export const UNKNOWN_LOCATION: LocationDef = {
  id: 'unknown',
  name: 'Hidden Location',
  era: '',
  rule: 'This Location has not been revealed.',
  blurb: '',
  effect: { type: 'none' },
  hidden: true,
};

export const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(
  [...LOCATIONS, UNKNOWN_LOCATION].map((l) => [l.id, l]),
);
