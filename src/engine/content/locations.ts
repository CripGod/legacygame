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
    rule: 'Characters confronting Threats here receive +2 Force. Reveals with a Slave Catcher in the area.',
    blurb: 'Site of John Brown\'s raid on the federal armory, the spark that made the coming war unavoidable.',
    effect: { type: 'confrontForce', amount: 2 },
    spawnOnReveal: 'slave_catcher',
  },
  {
    id: 'black_star',
    name: 'The Black Star',
    era: 'Atlantic, 1919',
    rule: 'A ship. Characters you relocate out of here arrive Ready. Three turns after it reveals, the ship arrives in Accra: everyone aboard gains +1 Influence, Gate Characters walk straight in, and any Threat here is cleared.',
    blurb: 'Marcus Garvey\'s Black Star Line: ships owned by Black people, connecting the diaspora on its own terms. It never reached Africa, but the star did.',
    effect: { type: 'relocatedOutReady' },
    transformsInto: { id: 'accra_ghana', afterTurns: 3 },
  },
  {
    id: 'accra_ghana',
    name: 'Accra, Ghana',
    era: 'Independence, 1957',
    rule: 'The Black Star has landed. Characters relocated here arrive Ready, and Threats cannot appear here.',
    blurb: 'On 6 March 1957 Kwame Nkrumah raised a flag with a black star at its centre, in Garvey\'s honour, and named the new nation\'s shipping line the Black Star Line.',
    effect: { type: 'relocatedInReady' },
    notInPool: true,
    noThreats: true,
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
    rule: 'Characters arriving at these Gates are displaced to a random other Location at the end of the turn (Setback). Nothing happens on the turn it reveals. Direct Entry and Characters arriving Inside are safe.',
    blurb: 'Thousands of towns enforced, by sign, ordinance or violence, that Black people be gone by nightfall.',
    effect: { type: 'displaceFreshAtEnd' },
    weight: 0.35,
  },
  {
    id: 'lagos',
    name: 'Lagos',
    era: 'Eko, today',
    rule: 'Danfo: Relocations out of Lagos do not count against your Relocation limit, and Characters who leave arrive Ready. The city moves people.',
    blurb: 'Twenty million people, Nollywood, Afrobeats, Fela\'s Kalakuta Republic and the yellow danfo buses that never stop. Lagos no dey carry last.',
    effect: { type: 'hub' },
  },
  {
    id: 'gary_indiana',
    name: 'Gary, Indiana',
    era: 'Steel City, 1906–',
    rule: 'Steel: your Characters here gain +1 Force. Soul: a player with five Characters here (Gates and Inside) gains +1 Influence on each of them.',
    blurb: 'Built by U.S. Steel, filled by the Great Migration. Joe Jackson ran a crane at Gary Works and drilled five boys in the living room at 2300 Jackson Street; in 1972 ten thousand people came for the National Black Political Convention.',
    effect: { type: 'steelAndSoul', force: 1, fiveBonus: 1 },
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
