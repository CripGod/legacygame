import type { ThreatDef } from '../types';

export const THREATS: ThreatDef[] = [
  {
    id: 'segregationist_patrol',
    name: 'Segregationist Patrol',
    family: 'Open Hostility',
    text: 'One per player. While your Patrol is active, your Gate Characters here cannot enter. Neutralize with 3 Force in one turn.',
    split: true,
    force: 3,
    effect: 'blockEntry',
    blurb: 'Local enforcement of the color line: who may enter, and who is turned around at the door.',
  },
  {
    id: 'comfortable_complicity',
    name: 'Comfortable Complicity',
    family: 'Complicit Beneficiary',
    text: 'While active, the player leading this Location gains +1 Influence. To remove it, both players must contribute at least 1 Force in the same turn.',
    split: false,
    force: 1,
    requiresBoth: true,
    effect: 'leaderBonus',
    blurb: 'The status quo has beneficiaries. They are rarely in a hurry.',
  },
  {
    id: 'housing_restriction',
    name: 'Housing Restriction',
    family: 'Systemic Pressure',
    text: 'While active, each player may have at most 2 Established Characters here. Neutralize with 4 Force in one turn (either player, or both together).',
    split: false,
    force: 4,
    effect: 'capacity',
    blurb: 'Redlining and restrictive covenants decided who could live where, and therefore who could build wealth.',
  },
  {
    id: 'mob',
    name: 'Mob',
    family: 'Crisis',
    text: 'At the end of each turn, displaces the leading player\'s highest-Influence Character here. Unresolved for 4 turns: this Location is LOST. Neutralize with 6 Force in one turn (both players may contribute).',
    split: false,
    force: 6,
    effect: 'mobDisplace',
    lostAfterTurns: 4,
    blurb: 'Tulsa, Wilmington, Rosewood, Elaine: organized violence aimed at exactly the people who were winning.',
  },
  {
    id: 'paddy_roller',
    name: 'Paddy Roller',
    family: 'Open Hostility',
    text: 'A Paddy Roller is in the area. While active, Gate Characters here contribute no Influence for either player. Neutralize with 2 Force in one turn (either player, or both together).',
    split: false,
    force: 2,
    effect: 'zeroGateInfluence',
    blurb: 'Paddy rollers were the slave patrols: armed riders who stopped Black people on the road and demanded a pass. After the Fugitive Slave Act of 1850, no free state was safe from them either.',
  },
  {
    id: 'dewolf_trade',
    name: 'The DeWolf Trade',
    family: 'Complicit Beneficiary',
    text: 'At the end of each turn, the Fresh Gate Character here with the lowest Influence is shipped away: to The Middle Passage if it is in play, otherwise to a random Location. A Setback for its player. Neutralize with 5 Force in one turn (either player, or both together).',
    split: false,
    force: 5,
    effect: 'shipsAway',
    blurb: 'The DeWolfs of Bristol, Rhode Island, ran more slaving voyages than any family in American history: about ninety between 1769 and 1820, some ten thousand people. James DeWolf kept at it after the 1808 ban, sat in the United States Senate, and died one of the richest men in the country.',
  },
];

export const THREAT_BY_ID: Record<string, ThreatDef> = Object.fromEntries(THREATS.map((t) => [t.id, t]));

/** Threats that may appear via the mid-match "history moves" trigger. */
export const RANDOM_THREAT_POOL = ['segregationist_patrol', 'comfortable_complicity', 'housing_restriction', 'dewolf_trade'];
