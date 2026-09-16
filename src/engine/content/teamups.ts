/**
 * Team-ups: two who belong together, Established at the same Location for the same side. A standing team-up holds
 * while both stay Inside there; a once-only team-up fires for whoever assembles it first, and the window closes for
 * the rest of the match. The cards themselves say only who they team up with, the name and what it does briefly.
 */
export type TeamUpStanding =
  | { type: 'sworn' } // nothing displaces, sends back, blocks, suppresses or hexes your Characters here; Threats cannot act on them
  | { type: 'forceHere'; amount: number } // your Characters here confront Threats with more Force
  | { type: 'freshReadyHere' } // your Characters arriving at these Gates are Ready at once
  | { type: 'extraRelocation'; amount: number } // more Relocations each turn
  | { type: 'extraEnergy'; amount: number } // more Energy each turn
  | { type: 'discountCharacters'; amount: number }; // your Characters cost less
export type TeamUpOnce =
  | { type: 'breakThreatsHere' } // every Threat at this Location is neutralized at once
  | { type: 'energyNext'; amount: number } // Energy next turn
  | { type: 'foundOutEverywhere' } // every Informant planted on you, anywhere, goes back to the planter's hand
  | { type: 'permInfluenceEverywhere'; amount: number } // lasting Influence for you at every Location
  | { type: 'weakenThreatsHere'; amount: number } // every Threat here needs less Force, for good
  | { type: 'permInfluenceOthersHere'; amount: number } // each of your other Characters here gains lasting Influence
  | { type: 'draw'; count: number };

export interface TeamUpDef {
  id: string;
  name: string;
  members: [string, string];
  kind: 'standing' | 'once';
  effect: TeamUpStanding | TeamUpOnce;
  /** What it does, briefly: the line under the card. */
  text: string;
  /** Why these two. */
  blurb: string;
}

export const TEAM_UPS: TeamUpDef[] = [
  {
    id: 'bois_caiman',
    name: 'Bois Caïman',
    members: ['boukman_dutty', 'cecile_fatiman'],
    kind: 'standing',
    effect: { type: 'sworn' },
    text: 'Your Characters here cannot be displaced, sent back, blocked, suppressed or hexed, and Threats cannot act on them.',
    blurb: 'He presided, she held the knife. The oath of 14 August 1791.',
  },
  {
    id: 'adwa',
    name: 'Adwa',
    members: ['menelik_ii', 'taytu_betul'],
    kind: 'once',
    effect: { type: 'breakThreatsHere' },
    text: 'Every Threat at this Location is broken at once.',
    blurb: 'Emperor and empress, each commanding, on the same field on 1 March 1896.',
  },
  {
    id: 'the_raid',
    name: 'The Raid',
    members: ['john_brown', 'harriet_tubman'],
    kind: 'standing',
    effect: { type: 'forceHere', amount: 2 },
    text: 'Your Characters here confront Threats with +2 Force.',
    blurb: 'She helped him plan Harpers Ferry and raised recruits for it. He called her General Tubman.',
  },
  {
    id: 'free_african_society',
    name: 'Free African Society',
    members: ['richard_allen', 'absalom_jones'],
    kind: 'once',
    effect: { type: 'energyNext', amount: 3 },
    text: '+3 Energy next turn.',
    blurb: 'Philadelphia, 1787: the mutual-aid society the two founded together, before either had a church.',
  },
  {
    id: 'vigilance',
    name: 'Vigilance',
    members: ['david_ruggles', 'william_still'],
    kind: 'once',
    effect: { type: 'foundOutEverywhere' },
    text: 'Every Informant planted on you, anywhere, is found out and sent back to the hand that planted it.',
    blurb: "Ruggles's New York Committee of Vigilance and Still's Philadelphia one, a generation apart, the same work.",
  },
  {
    id: 'reconstruction',
    name: 'Reconstruction',
    members: ['thaddeus_stevens', 'charles_sumner'],
    kind: 'once',
    effect: { type: 'permInfluenceEverywhere', amount: 1 },
    text: '+1 lasting Influence for you at every Location.',
    blurb: 'The Radical Republicans who wrote Reconstruction into the Constitution, one in the House and one in the Senate.',
  },
  {
    id: 'tuskegee',
    name: 'Tuskegee',
    members: ['booker_t_washington', 'george_washington_carver'],
    kind: 'standing',
    effect: { type: 'discountCharacters', amount: 1 },
    text: 'Your Characters cost 1 less Energy.',
    blurb: 'Washington hired Carver in 1896 and kept him for forty-seven years.',
  },
  {
    id: 'iron_and_thunder',
    name: 'Iron and Thunder',
    members: ['ogun', 'shango'],
    kind: 'once',
    effect: { type: 'weakenThreatsHere', amount: 3 },
    text: 'Every Threat at this Location needs 3 less Force, for good.',
    blurb: 'The orisha of iron who clears the road and the orisha of thunder who strikes down it.',
  },
  {
    id: 'the_pilots',
    name: 'The Pilots',
    members: ['harriet_tubman', 'robert_smalls'],
    kind: 'standing',
    effect: { type: 'extraRelocation', amount: 1 },
    text: '+1 Relocation each turn.',
    blurb: 'She led the Combahee River raid up one South Carolina river; he steered the Planter out of Charleston harbor.',
  },
  {
    id: 'black_business',
    name: 'Sweet Auburn',
    members: ['madam_cj_walker', 'alonzo_herndon'],
    kind: 'standing',
    effect: { type: 'extraEnergy', amount: 1 },
    text: '+1 Energy each turn.',
    blurb: 'Two fortunes built from a washtub and a barber chair, in the same twenty years.',
  },
  {
    id: 'the_maroons',
    name: 'The Maroons',
    members: ['nanny_of_the_maroons', 'zumbi_dos_palmares'],
    kind: 'standing',
    effect: { type: 'freshReadyHere' },
    text: 'Your Characters arriving at these Gates are Ready at once.',
    blurb: 'Nanny Town in the Blue Mountains and Palmares in the Brazilian hills: free towns that held for decades.',
  },
  {
    id: 'rent_party',
    name: 'Rent Party',
    members: ['zora_neale_hurston', 'cotton_club_orchestra'],
    kind: 'once',
    effect: { type: 'permInfluenceOthersHere', amount: 1 },
    text: 'Each of your other Characters here gains +1 Influence for good.',
    blurb: 'Harlem in the twenties: the writers upstairs, the band downstairs, and everybody at the same party.',
  },
  {
    id: 'the_press',
    name: 'The Press',
    members: ['ida_b_wells', 'john_russwurm'],
    kind: 'once',
    effect: { type: 'draw', count: 2 },
    text: 'Draw 2 cards.',
    blurb: "Freedom's Journal in 1827 and the Memphis Free Speech in 1892: the Black press, pleading its own cause.",
  },
];

export const TEAM_UP_BY_ID: Record<string, TeamUpDef> = Object.fromEntries(TEAM_UPS.map((t) => [t.id, t]));

/** The team-ups a card belongs to. */
export function teamUpsFor(cardId: string): TeamUpDef[] {
  return TEAM_UPS.filter((t) => t.members.includes(cardId));
}
