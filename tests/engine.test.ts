import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveTurn,
  viewFor,
  emptyPlan,
  legalOptions,
  validatePlan,
  gateRoom,
  influenceAt,
  charsOf,
  charsAt,
  LOCATIONS,
  PRESET_DECKS,
  validateDeck,
  CHARACTERS,
  LOCATION_BY_ID,
  lockReason,
  randomDeck,
  threatForceNeeded,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type CharacterInstance,
  charDef,
  MAX_HAND,
  CARD_BY_ID,
  charInfluence,
  insideCapacity,
  spawnThreat,
  type GameEvent,
  cardCost,
  energyFor,
} from '../src/engine';
import { planTurn } from '../src/ai/harborlight';

function pass(): TurnPlan {
  return emptyPlan();
}

/** Force a specific hand/board for tests. */
function rig(state: GameState, opts: { handA?: string[]; handB?: string[]; locations?: string[]; revealAll?: boolean; energy?: boolean }): GameState {
  const s = structuredClone(state);
  // Rigged scenarios ignore the Energy curve unless a test opts in.
  if (!opts.energy) {
    s.players.A.energyBonus = 20;
    s.players.B.energyBonus = 20;
  }
  if (opts.handA) s.players.A.hand = opts.handA;
  if (opts.handB) s.players.B.hand = opts.handB;
  if (opts.locations) opts.locations.forEach((id, i) => (s.locations[i].defId = id));
  if (opts.revealAll) {
    for (const l of s.locations) {
      l.revealed = true;
      l.revealedTurn = 0;
    }
  }
  return s;
}

function addChar(state: GameState, defId: string, owner: PlayerId, location: number, zone: 'gate' | 'inside', ready = true): CharacterInstance {
  const c: CharacterInstance = {
    uid: `c${state.nextUid++}`,
    defId,
    owner,
    location,
    zone,
    ready: zone === 'gate' ? ready : false,
    arrivedTurn: 0,
    permInfluence: 0,
    tempInfluence: 0,
  };
  state.characters[c.uid] = c;
  return c;
}

describe('setup', () => {
  it('is deterministic for a seed', () => {
    const a = createMatch({ seed: 42 });
    const b = createMatch({ seed: 42 });
    expect(a.players.A.hand).toEqual(b.players.A.hand);
    expect(a.locations.map((l) => l.defId)).toEqual(b.locations.map((l) => l.defId));
    expect(a.revealOrder).toEqual(b.revealOrder);
  });
  it('deals 4 cards then draws 1 on turn 1', () => {
    const s = createMatch({ seed: 1 });
    expect(s.turn).toBe(1);
    expect(s.players.A.hand).toHaveLength(5);
    expect(s.players.A.deckCount).toBe(13); // 18 − 5
    expect(s.locations.every((l) => !l.revealed)).toBe(true);
    expect(new Set(s.revealOrder)).toEqual(new Set([0, 1, 2]));
  });
  it('validates preset decks', () => {
    for (const d of Object.values(PRESET_DECKS)) expect(validateDeck(d.cards)).toEqual([]);
    expect(validateDeck(['harriet_tubman', 'harriet_tubman'])).not.toEqual([]);
  });
});

describe('redacted view', () => {
  it('hides the opponent hand, decks, RNG and unrevealed Locations', () => {
    const s = createMatch({ seed: 3 });
    const v = viewFor(s, 'A');
    expect(v.players.B.hand.every((c) => c === 'hidden')).toBe(true);
    expect(v.players.B.hand.length).toBe(s.players.B.hand.length);
    expect(v.players.A.hand).toEqual(s.players.A.hand);
    expect(v.players.A.deck).toEqual([]);
    expect(v.players.B.deck).toEqual([]);
    expect(v.revealOrder).toEqual([]);
    expect(v.locations.every((l) => l.defId === 'unknown')).toBe(true);
    expect(v.rng.s).toBe(0);
  });
  it('AI plans are legal on the true state and independent of hidden info', () => {
    const s = createMatch({ seed: 5 });
    const v = viewFor(s, 'B');
    const d = planTurn(v, 'B');
    expect(validatePlan(s, 'B', d.plan)).toEqual([]);
    // Changing hidden info (opponent hand, reveal order) must not change the AI's plan.
    const s2 = structuredClone(s);
    s2.players.A.hand = ['roger_taney', 'og', 'organizer', 'zora_neale_hurston', 'reparations'];
    s2.revealOrder = [...s2.revealOrder].reverse();
    const d2 = planTurn(viewFor(s2, 'B'), 'B');
    expect(d2.plan).toEqual(d.plan);
  });
});

describe('turn structure', () => {
  it('reveals one Location per turn for the first three turns in the predetermined order', () => {
    let s = createMatch({ seed: 9 });
    const order = s.revealOrder.slice();
    for (let t = 1; t <= 3; t++) {
      s = resolveTurn(s, { A: pass(), B: pass() }).state;
      expect(s.locations[order[t - 1]].revealed).toBe(true);
      expect(s.locations.filter((l) => l.revealed)).toHaveLength(t);
    }
  });
  it('a played Character waits one full turn at the Gates before it can enter', () => {
    let s = rig(createMatch({ seed: 11 }), {});
    // Keep the turn-3 "history moves" Threat away from Location 1 by giving it a harmless Threat already.
    s.locations[0].threats.push({ uid: 'cc', defId: 'comfortable_complicity', location: 0, forceRequired: 1, spawnedTurn: 1 });
    const cardId = s.players.A.hand.find((c) => c !== 'reparations' && c !== 'community_defense' && c !== 'sleeping_car_porters' && c !== 'bessie_coleman')!;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId, location: 0 }] }, B: pass() }).state;
    const c = charsOf(s, 'A')[0];
    expect(c.zone).toBe('gate');
    expect(s.turn).toBe(2);
    // Fresh during turn 2 (unless the Location is Juneteenth).
    const juneteenth = s.locations[0].revealed && s.locations[0].defId === 'juneteenth';
    if (!juneteenth) {
      expect(legalOptions(s, 'A').enters).toEqual([]);
      s = resolveTurn(s, { A: pass(), B: pass() }).state;
      expect(s.characters[c.uid].ready).toBe(true);
      expect(legalOptions(s, 'A').enters).toEqual([c.uid]);
      s = resolveTurn(s, { A: { ...pass(), enters: [c.uid] }, B: pass() }).state;
      expect(s.characters[c.uid].zone).toBe('inside');
    }
  });
  it('enforces one card per turn and Gate capacity of two', () => {
    let s = rig(createMatch({ seed: 2 }), { handA: ['og', 'organizer', 'zora_neale_hurston', 'ida_b_wells', 'reparations'] });
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 1 }] }, B: pass() }).state;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'organizer', location: 1 }] }, B: pass() }).state;
    expect(charsAt(s, 1, 'A', 'gate')).toHaveLength(2);
    const opts = legalOptions(s, 'A');
    const zora = opts.plays.find((p) => p.cardId === 'zora_neale_hurston')!;
    expect(zora.locations).not.toContain(1);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'zora_neale_hurston', location: 1 }] })).not.toEqual([]);
  });
  it('Gate and Inside Characters both contribute Influence', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'juneteenth'], revealAll: true });
    addChar(s, 'harriet_tubman', 'A', 0, 'gate');
    addChar(s, 'frederick_douglass', 'A', 0, 'inside');
    expect(influenceAt(s, 0).A).toBe(3 + 4); // Douglass's aura only reaches Inside Characters.
  });
});

describe('abilities', () => {
  it('Frederick Douglass buffs other Inside Characters, not Gate ones', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'juneteenth'], revealAll: true });
    addChar(s, 'frederick_douglass', 'A', 0, 'inside');
    addChar(s, 'harriet_tubman', 'A', 0, 'inside');
    addChar(s, 'zora_neale_hurston', 'A', 0, 'gate');
    expect(influenceAt(s, 0).A).toBe(4 + (3 + 1) + 3);
  });
  it('Roger Taney blocks an opposing Ready Character and penalizes the leader', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'juneteenth'], revealAll: true, handB: ['roger_taney'] });
    const mansa = addChar(s, 'mansa_musa', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: { ...pass(), enters: [mansa.uid] }, B: { ...pass(), plays: [{ cardId: 'roger_taney', location: 0 }] } }).state;
    expect(s.characters[mansa.uid].zone).toBe('gate');
    // A leads 5 vs 1 → Roger Taney's presence costs the leader 1.
    expect(influenceAt(s, 0)).toEqual({ A: 4, B: 1 });
  });
  it('Harriet conducts a friendly Character straight Inside another Location, or to its Gates Ready when the Inside is full', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['harriet_tubman'] });
    const og = addChar(s, 'og', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 0, target: { charUid: og.uid, location: 2 } }] }, B: pass() }).state;
    expect(s.characters[og.uid].location).toBe(2);
    expect(s.characters[og.uid].zone).toBe('inside');
    // Full Inside: they wait at the Gates, Ready.
    let f = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['harriet_tubman'] });
    const kid = addChar(f, 'john_russwurm', 'A', 0, 'gate', false);
    for (const id of ['organizer', 'alonzo_herndon', 'og', 'zora_neale_hurston', 'absalom_jones']) addChar(f, id, 'A', 2, 'inside');
    f = resolveTurn(f, { A: { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 0, target: { charUid: kid.uid, location: 2 } }] }, B: pass() }).state;
    expect(f.characters[kid.uid].location).toBe(2);
    expect(f.characters[kid.uid].zone).toBe('gate');
    expect(f.characters[kid.uid].ready).toBe(true);
  });
  it('Direct Entry Characters enter the turn they are played', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handB: ['sleeping_car_porters'] });
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'sleeping_car_porters', location: 2 }] } }).state;
    const porter = charsOf(s, 'B')[0];
    expect(porter.zone).toBe('inside');
    expect(legalOptions(s, 'B').relocationsAllowed).toBe(2);
  });
  it('Relocation sends an Established Character to another Gate as Fresh; Great Migration enters the first one', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true });
    const og = addChar(s, 'og', 'A', 2, 'inside');
    const ida = addChar(s, 'ida_b_wells', 'A', 2, 'inside');
    s = resolveTurn(s, { A: { ...pass(), relocations: [{ uid: og.uid, to: 0 }] }, B: pass() }).state;
    expect(s.characters[og.uid].zone).toBe('gate');
    expect(s.characters[og.uid].location).toBe(0);
    expect(s.characters[og.uid].ready).toBe(false);
    s = resolveTurn(s, { A: { ...pass(), relocations: [{ uid: ida.uid, to: 1 }] }, B: pass() }).state;
    expect(s.characters[ida.uid].zone).toBe('inside');
    expect(s.characters[ida.uid].location).toBe(1);
  });
  it('Mansa Musa gains +1 when a hidden Location he was committed to reveals', () => {
    let s = rig(createMatch({ seed: 2 }), { handA: ['mansa_musa'] });
    const target = s.revealOrder[1]; // reveals on turn 2
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'mansa_musa', location: target }] }, B: pass() }).state;
    const m = charsOf(s, 'A')[0];
    expect(m.pendingRevealBonus).toBe(1);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.characters[m.uid].permInfluence).toBe(1);
  });
});

describe('threats', () => {
  it('Segregationist Patrol blocks entry and records a Setback; Reparations converts Setbacks', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'greenwood'], revealAll: true, handA: ['reparations', 'og'] });
    const og = addChar(s, 'og', 'A', 0, 'gate', true);
    s.locations[0].threats.push({ uid: 't1', defId: 'segregationist_patrol', location: 0, target: 'A', forceRequired: 3, spawnedTurn: 1 });
    s.locations[0].threats.push({ uid: 't2', defId: 'segregationist_patrol', location: 0, target: 'B', forceRequired: 3, spawnedTurn: 1 });
    s = resolveTurn(s, { A: { ...pass(), enters: [og.uid] }, B: pass() }).state;
    expect(s.characters[og.uid].zone).toBe('gate');
    expect(s.players.A.setbacks).toBe(1);
    // OG (Force 3) clears his own Patrol; then Reparations adds +1 at the lowest Location.
    s = resolveTurn(s, { A: { ...pass(), confronts: [{ uid: og.uid, threatUid: 't1' }] }, B: pass() }).state;
    expect(s.locations[0].threats.map((t) => t.uid)).toEqual(['t2']);
    // Now A can Assist against B's Patrol.
    const opts = legalOptions(s, 'A');
    expect(opts.confronts.find((c) => c.threatUid === 't2')?.assist).toBe(true);
    // Reparations at Great Migration (Americas): +1 per Setback, +1 more for the region.
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'reparations', location: 1 }] }, B: pass() });
    expect(out.events.some((e) => e.text.includes('Reparations: +') && e.text.includes('+1 in the Americas'))).toBe(true);
    expect(out.state.locations[1].tempInfluence.A).toBe(0); // temporary: cleared at end of turn
    expect((out.events.find((e) => e.type === 'influence' && e.location === 1)?.data as { A: number }).A).toBeGreaterThanOrEqual(2);
  });
  it('Comfortable Complicity needs both players and rewards the leader while active', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true });
    const a = addChar(s, 'og', 'A', 0, 'inside');
    const b = addChar(s, 'organizer', 'B', 0, 'inside');
    s.locations[0].threats.push({ uid: 'cc', defId: 'comfortable_complicity', location: 0, forceRequired: 1, spawnedTurn: 1 });
    expect(influenceAt(s, 0)).toEqual({ A: 4, B: 2 });
    s = resolveTurn(s, { A: { ...pass(), confronts: [{ uid: a.uid, threatUid: 'cc' }] }, B: pass() }).state;
    expect(s.locations[0].threats).toHaveLength(1);
    s = resolveTurn(s, { A: { ...pass(), confronts: [{ uid: a.uid, threatUid: 'cc' }] }, B: { ...pass(), confronts: [{ uid: b.uid, threatUid: 'cc' }] } }).state;
    expect(s.locations[0].threats).toHaveLength(0);
  });
  it('Mob displaces the leader and eventually loses the Location', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'black_star'], revealAll: true });
    s.turn = 3;
    addChar(s, 'mansa_musa', 'A', 0, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // → turn 4: Mob spawns at Greenwood
    expect(s.turn).toBe(4);
    expect(s.locations[0].threats.some((t) => t.defId === 'mob')).toBe(true);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // Mob displaces Mansa
    expect(charsAt(s, 0, 'A')).toHaveLength(0);
    expect(s.players.A.setbacks).toBe(1);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // second full turn: still open
    expect(s.locations[0].lost).toBeFalsy();
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // third full turn: still open
    expect(s.locations[0].lost).toBeFalsy();
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // fourth full turn → LOST
    expect(s.locations[0].lost).toBe(true);
  });
});

describe('The Black Star', () => {
  it('arrives in Accra three turns after it reveals, rewarding everyone aboard', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true });
    s.locations[0].revealedTurn = 1;
    const mansa = addChar(s, 'mansa_musa', 'A', 0, 'inside');
    const ida = addChar(s, 'ida_b_wells', 'B', 0, 'gate', false);
    s.locations[0].threats.push({ uid: 'hr', defId: 'housing_restriction', location: 0, forceRequired: 4, spawnedTurn: 1 });
    for (let t = 1; t <= 3; t++) s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.turn).toBe(4);
    expect(s.locations[0].defId).toBe('accra_ghana');
    expect(s.locations[0].threats).toHaveLength(0);
    expect(s.characters[mansa.uid].permInfluence).toBe(1);
    expect(s.characters[ida.uid].zone).toBe('inside');
    expect(s.characters[ida.uid].permInfluence).toBe(1);
    expect(LOCATIONS.some((l) => l.id === 'accra_ghana' && l.notInPool)).toBe(true);
  });
});

describe('Mythic', () => {
  it('Black Jesus makes a Location a sanctuary against Threats', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'greenwood'], revealAll: true });
    addChar(s, 'black_jesus', 'A', 0, 'inside');
    const og = addChar(s, 'og', 'A', 0, 'gate', true);
    s.locations[0].threats.push({ uid: 'pa', defId: 'segregationist_patrol', location: 0, target: 'A', forceRequired: 3, spawnedTurn: 1 });
    s = resolveTurn(s, { A: { ...pass(), enters: [og.uid] }, B: pass() }).state;
    expect(s.characters[og.uid].zone).toBe('inside');
    expect(s.players.A.setbacks).toBe(0);
  });
  it('Shango displaces every weaker opposing Gate Character', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'greenwood'], revealAll: true, handA: ['shango'] });
    const zora = addChar(s, 'zora_neale_hurston', 'B', 1, 'gate', true); // Force 1
    const brown = addChar(s, 'john_brown', 'B', 1, 'gate', true); // Force 5
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'shango', location: 1 }] }, B: pass() }).state;
    expect(s.characters[zora.uid].location).not.toBe(1);
    expect(s.characters[brown.uid].location).toBe(1);
  });
  it('Yemoja brings an Established Character across, and Ogun weakens Threats', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'greenwood'], revealAll: true, handA: ['yemoja'] });
    const ida = addChar(s, 'ida_b_wells', 'A', 2, 'inside');
    addChar(s, 'ogun', 'A', 0, 'inside');
    s.locations[0].threats.push({ uid: 'hr', defId: 'housing_restriction', location: 0, forceRequired: 4, spawnedTurn: 1 });
    expect(threatForceNeeded(s, s.locations[0].threats[0])).toBe(3);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'yemoja', location: 0, target: { charUid: ida.uid, location: 0 } }] }, B: pass() }).state;
    expect(s.characters[ida.uid].location).toBe(0);
    expect(s.characters[ida.uid].zone).toBe('inside');
  });
});

describe('Summon', () => {
  it('manifests Obatala when both commit enough Force, and punishes a broken pact', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    const brown = addChar(s, 'john_brown', 'A', 0, 'inside'); // Force 5
    addChar(s, 'og', 'B', 0, 'inside'); // Force 3
    addChar(s, 'mansa_musa', 'A', 1, 'inside');
    addChar(s, 'ida_b_wells', 'B', 2, 'inside');
    s.locations[0].threats.push({ uid: 'mob', defId: 'mob', location: 0, forceRequired: 6, spawnedTurn: 4 });
    expect(legalOptions(s, 'A').summonable).toEqual([0]);
    // Only one side commits: nothing happens.
    let out = resolveTurn(s, { A: { ...pass(), summon: { location: 0 } }, B: pass() });
    expect(out.state.locations[0].sanctified).toBeFalsy();
    // Both commit: 5 + 3 = 8 ≥ 6, at least 1 each.
    out = resolveTurn(s, { A: { ...pass(), summon: { location: 0 } }, B: { ...pass(), summon: { location: 0 } } });
    const t = out.state;
    expect(t.locations[0].sanctified).toBe(true);
    expect(t.locations[0].threats).toHaveLength(0);
    expect(t.characters[brown.uid].permInfluence).toBe(1);
    expect(t.stats.summons[0].success).toBe(true);
    // Failed pact then Lost: both lose 1 at other Locations.
    const f = structuredClone(s);
    f.characters[brown.uid].defId = 'zora_neale_hurston'; // Force 1: 1 + 3 = 4 < 6
    let g = resolveTurn(f, { A: { ...pass(), summon: { location: 0 } }, B: { ...pass(), summon: { location: 0 } } }).state;
    expect(g.locations[0].pactFailed).toBe(true);
    g = resolveTurn(g, { A: pass(), B: pass() }).state; // Mob unresolved 2 turns: still open
    expect(g.locations[0].lost).toBeFalsy();
    g = resolveTurn(g, { A: pass(), B: pass() }).state; // Mob unresolved 3 turns: still open
    expect(g.locations[0].lost).toBeFalsy();
    g = resolveTurn(g, { A: pass(), B: pass() }).state; // Mob unresolved 4 turns → Lost
    expect(g.locations[0].lost).toBe(true);
    expect(g.locations[1].permInfluence?.A).toBe(-1);
    expect(g.locations[2].permInfluence?.B).toBe(-1);
  });
  it('Lagos departures are free and arrive Ready', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['lagos', 'great_migration', 'gary_indiana'], revealAll: true });
    const a = addChar(s, 'og', 'A', 0, 'inside');
    const b = addChar(s, 'ida_b_wells', 'A', 0, 'inside');
    const c = addChar(s, 'zora_neale_hurston', 'A', 2, 'inside');
    const plan = { ...pass(), relocations: [{ uid: a.uid, to: 2 }, { uid: b.uid, to: 1 }, { uid: c.uid, to: 1 }] };
    expect(validatePlan(s, 'A', plan)).toEqual([]); // two free Lagos departures plus the one allowed
    s = resolveTurn(s, { A: plan, B: pass() }).state;
    expect(s.characters[a.uid].zone).toBe('gate');
    expect(s.characters[a.uid].ready).toBe(true); // left Lagos: Ready
    expect(s.characters[c.uid].ready).toBe(false); // left Gary: Fresh
  });
});

describe('energy', () => {
  it('Energy equals the turn number, cards cost Energy, and Organizer adds one', () => {
    let s = rig(createMatch({ seed: 21 }), { energy: true, locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['roger_taney', 'organizer', 'og', 'mansa_musa'] });
    expect(legalOptions(s, 'A').energy).toBe(1);
    // Turn 1: a 2-cost card is refused, a 1-cost card is fine.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'og', location: 1 }] })).not.toEqual([]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'roger_taney', location: 1 }] })).toEqual([]);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(legalOptions(s, 'A').energy).toBe(2);
    // Turn 2: two 1-cost cards, or one 2-cost card, not both.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'roger_taney', location: 1 }, { cardId: 'organizer', location: 1 }] })).toEqual([]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'og', location: 1 }, { cardId: 'roger_taney', location: 2 }] })).not.toEqual([]);
    addChar(s, 'organizer', 'A', 0, 'inside');
    expect(legalOptions(s, 'A').energy).toBe(3);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 1 }, { cardId: 'roger_taney', location: 2 }] }, B: pass() }).state;
    expect(charsAt(s, 1, 'A', 'gate')).toHaveLength(1);
    expect(charsAt(s, 2, 'A', 'gate')).toHaveLength(1);
    expect(s.players.A.hand).not.toContain('og');
  });
  it('every deck card has a cost and presets are 18 cards', () => {
    for (const d of Object.values(PRESET_DECKS)) {
      expect(validateDeck(d.cards)).toEqual([]);
      for (const id of d.cards) expect(CARD_BY_ID[id]?.cost ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('locations', () => {
  it('Sundown Town does nothing on the turn it reveals, then displaces new arrivals', () => {
    let s = rig(createMatch({ seed: 2 }), {});
    s.locations[0].defId = 'sundown_town';
    s.revealOrder = [0, 1, 2];
    s.players.A.hand = ['og', 'zora_neale_hurston', 'ida_b_wells', 'reparations', 'mansa_musa'];
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 0 }] }, B: pass() }).state;
    expect(charsOf(s, 'A')[0].location).toBe(0); // safe on the reveal turn
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'ida_b_wells', location: 0 }] }, B: pass() }).state;
    const ida = charsOf(s, 'A').find((c) => c.defId === 'ida_b_wells')!;
    expect(ida.location).not.toBe(0); // bounced
    expect(s.players.A.setbacks).toBe(1);
  });
  it('Gary, Indiana grants +1 Force and +1 Influence each with five Characters', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'black_star'], revealAll: true });
    for (let i = 0; i < 4; i++) addChar(s, ['og', 'zora_neale_hurston', 'ida_b_wells', 'mansa_musa'][i], 'A', 0, 'inside');
    expect(influenceAt(s, 0).A).toBe(3 + 3 + 4 + 5);
    addChar(s, 'organizer', 'A', 0, 'gate');
    expect(influenceAt(s, 0).A).toBe(3 + 3 + 4 + 5 + 2 + 5 + 1); // +1 from Zora's Gate bonus
  });
  it('Paddy Roller is shared: it silences both players\' Gate Characters', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['harpers_ferry', 'great_migration', 'black_star'], revealAll: true });
    s.locations[0].threats.push({ uid: 'sc', defId: 'paddy_roller', location: 0, forceRequired: 2, spawnedTurn: 1 });
    addChar(s, 'og', 'A', 0, 'gate');
    addChar(s, 'organizer', 'B', 0, 'gate');
    expect(influenceAt(s, 0)).toEqual({ A: 0, B: 0 });
  });
});

describe('gatherings', () => {
  it('The Stroll arrives at Great Migration once you have three Established there (in the matches it exists), and feeds them', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['great_migration', 'gary_indiana', 'greenwood'], revealAll: true, handA: ['og', 'organizer', 'zora_neale_hurston'] });
    s.spawnRolls.the_stroll = true;
    addChar(s, 'alonzo_herndon', 'A', 0, 'inside');
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 0 }] }, B: pass() }).state;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'organizer', location: 0 }] }, B: pass() }).state;
    const og = Object.values(s.characters).find((c) => c.defId === 'og')!;
    for (const l of s.locations) l.threats = []; // a random Threat must not block the entries this test is about
    s = resolveTurn(s, { A: { ...pass(), enters: [og.uid] }, B: pass() }).state;
    expect(Object.values(s.characters).some((c) => c.defId === 'the_stroll')).toBe(false);
    const org = Object.values(s.characters).find((c) => c.defId === 'organizer')!;
    for (const l of s.locations) l.threats = [];
    const out = resolveTurn(s, { A: { ...pass(), enters: [org.uid] }, B: pass() });
    const cookout = Object.values(out.state.characters).find((c) => c.defId === 'the_stroll');
    expect(cookout).toBeDefined();
    expect(cookout!.owner).toBe('A');
    expect(cookout!.zone).toBe('inside');
    expect(out.events.some((e) => e.type === 'spawned' && e.cardId === 'the_stroll')).toBe(true);
    expect(out.state.players.A.spawned).toContain('the_stroll');
    // +1 Influence to the other three Established Characters here, and the Stroll is on home ground (+1).
    expect(influenceAt(out.state, 0).A).toBe(charDef('og').influence + charDef('organizer').influence + charDef('alonzo_herndon').influence + charDef('the_stroll').influence + 3 + 1);
    // In the other half of matches it never comes.
    const dry = structuredClone(s);
    dry.spawnRolls.the_stroll = false;
    expect(Object.values(resolveTurn(dry, { A: { ...pass(), enters: [org.uid] }, B: pass() }).state.characters).some((c) => c.defId === 'the_stroll')).toBe(false);
    // Only once per match.
    const again = resolveTurn(out.state, { A: pass(), B: pass() }).state;
    expect(Object.values(again.characters).filter((c) => c.defId === 'the_stroll')).toHaveLength(1);
  });
  it('Chairteenth arrives Ready at both players\' Gates when Montgomery reveals', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['montgomery', 'gary_indiana', 'greenwood'] });
    s.spawnRolls.chairteenth = true;
    const out = resolveTurn(s, { A: pass(), B: pass() });
    const chairs = Object.values(out.state.characters).filter((c) => c.defId === 'chairteenth');
    expect(chairs.map((c) => c.owner).sort()).toEqual(['A', 'B']);
    for (const c of chairs) {
      expect(c.zone).toBe('gate');
      expect(c.ready).toBe(true);
      expect(c.location).toBe(0);
    }
    expect(validateDeck([...PRESET_DECKS.railroad.cards.slice(0, 11), 'chairteenth'])).not.toEqual([]);
  });
});

describe('new one-drops and The Justice System', () => {
  it('The Justice System holds a Character Inside for two turns', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['justice_system', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 3;
    const og = addChar(s, 'og', 'A', 0, 'gate');
    s = resolveTurn(s, { A: { ...pass(), enters: [og.uid] }, B: pass() }).state; // enters at end of turn 3
    expect(s.characters[og.uid].zone).toBe('inside');
    expect(s.turn).toBe(4);
    expect(legalOptions(s, 'A').relocations.some((r) => r.uid === og.uid)).toBe(false);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // turn 5: still held
    expect(legalOptions(s, 'A').relocations.some((r) => r.uid === og.uid)).toBe(false);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // turn 6: free
    expect(legalOptions(s, 'A').relocations.some((r) => r.uid === og.uid)).toBe(true);
  });
  it('Alonzo Herndon makes departures free; Daniel Payne wants company', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    addChar(s, 'alonzo_herndon', 'A', 0, 'inside');
    const a = addChar(s, 'og', 'A', 0, 'inside');
    const b = addChar(s, 'zora_neale_hurston', 'A', 0, 'inside');
    // Two relocations out of the Alonzo Herndon's Location cost nothing against the limit of one.
    expect(validatePlan(s, 'A', { ...pass(), relocations: [{ uid: a.uid, to: 1 }, { uid: b.uid, to: 2 }] })).toEqual([]);
    const payne = addChar(s, 'daniel_payne', 'A', 1, 'inside');
    expect(charInfluence(s, payne)).toBe(1);
    addChar(s, 'sleeping_car_porters', 'A', 1, 'gate');
    expect(charInfluence(s, payne)).toBe(2);
  });
  it('Claudette Colvin keeps her seat at Sundown Town', () => {
    let s = rig(createMatch({ seed: 2 }), {});
    s.locations[0].defId = 'sundown_town';
    s.revealOrder = [0, 1, 2];
    s.players.A.hand = ['og', 'claudette_colvin', 'ida_b_wells', 'reparations', 'mansa_musa'];
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 0 }] }, B: pass() }).state; // reveal turn
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'claudette_colvin', location: 0 }] }, B: pass() }).state;
    const claudette = charsOf(s, 'A').find((c) => c.defId === 'claudette_colvin')!;
    expect(claudette.location).toBe(0);
    expect(s.players.A.setbacks).toBe(0);
  });
  it('every preset deck is legal and holds at least three 1-cost cards', () => {
    for (const [key, deck] of Object.entries(PRESET_DECKS)) {
      expect(validateDeck(deck.cards), key).toEqual([]);
      expect(deck.cards.filter((id) => (CARD_BY_ID[id]?.cost ?? 0) <= 1).length, key).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('special arrivals', () => {
  it('Straight Inside always enters: Porter and Bessie never wait at the Gates', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['sleeping_car_porters', 'bessie_coleman', 'og'] });
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'og', location: 0, enter: true }] })).not.toEqual([]);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'sleeping_car_porters', location: 0 }, { cardId: 'bessie_coleman', location: 1 }] }, B: pass() }).state;
    expect(charsOf(s, 'A').find((c) => c.defId === 'sleeping_car_porters')!.zone).toBe('inside');
    expect(charsOf(s, 'A').find((c) => c.defId === 'bessie_coleman')!.zone).toBe('inside');
  });
  it('Black Jesus appears when the church fills The Tabernacle and blesses every Location', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['the_tabernacle', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    addChar(s, 'absalom_jones', 'A', 0, 'inside');
    addChar(s, 'daniel_payne', 'A', 0, 'inside');
    const og = addChar(s, 'og', 'A', 1, 'inside');
    const before = charInfluence(s, og);
    addChar(s, 'richard_allen', 'A', 0, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    const bj = charsOf(s, 'A').find((c) => c.defId === 'black_jesus');
    expect(bj).toBeTruthy();
    expect(bj!.location).toBe(0);
    expect(s.players.A.spawned).toContain('black_jesus');
    expect(charInfluence(s, s.characters[og.uid])).toBe(before + 1);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(charsOf(s, 'A').filter((c) => c.defId === 'black_jesus')).toHaveLength(1);
  });
  it('The Ancestors come to your hand with three Characters Inside at Accra', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['accra_ghana', 'great_migration', 'gary_indiana'], revealAll: true });
    s.spawnRolls.the_ancestors = true;
    s.turn = 4;
    addChar(s, 'og', 'A', 0, 'inside');
    addChar(s, 'zora_neale_hurston', 'A', 0, 'inside');
    addChar(s, 'ida_b_wells', 'A', 0, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.players.A.hand).toContain('the_ancestors');
    expect(viewFor(s, 'B').players.A.hand).not.toContain('the_ancestors');
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'the_ancestors', location: 0 }] })).toEqual([]);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'the_ancestors', location: 0 }] }, B: pass() }).state;
    expect(s.players.A.hand).not.toContain('the_ancestors');
    expect(s.players.A.spawned).toContain('the_ancestors');
  });
  it('The Tabernacle keeps Characters from being displaced', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['the_tabernacle', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    const mansa = addChar(s, 'mansa_musa', 'A', 0, 'inside');
    s.locations[0].threats.push({ uid: 'mob', defId: 'mob', location: 0, forceRequired: 6, spawnedTurn: 4 });
    const t = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(t.characters[mansa.uid].location).toBe(0);
    expect(t.players.A.setbacks).toBe(0);
  });
});

describe('Informants, zero-cost cards and showdowns', () => {
  it('an Informant is planted on the opponent\'s Gates, counts against them, never readies and never enters', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['peter_prioleau', 'boukman_dutty'], handB: [] });
    s.turn = 3;
    addChar(s, 'og', 'B', 0, 'gate', true); // Influence 3 at B's Gates
    // It needs one of the opponent's Gate slots, not yours.
    addChar(s, 'john_russwurm', 'A', 0, 'gate', true);
    addChar(s, 'alonzo_herndon', 'A', 0, 'gate', true);
    expect(legalOptions(s, 'A').plays.find((p) => p.cardId === 'peter_prioleau')?.locations).toEqual([0, 1, 2]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'peter_prioleau', location: 0 }] })).toEqual([]);
    const before = influenceAt(s, 0);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'peter_prioleau', location: 0 }] }, B: pass() }).state;
    const spy = Object.values(s.characters).find((c) => c.defId === 'peter_prioleau')!;
    expect(spy.owner).toBe('B');
    expect(spy.plantedBy).toBe('A');
    expect(spy.zone).toBe('gate');
    expect(spy.ready).toBe(false);
    expect(charInfluence(s, spy)).toBe(-3);
    expect(influenceAt(s, 0).B).toBe(Math.max(0, before.B - 3));
    // B's Gates there are now full (OG + the Informant): B cannot play a second Character there.
    expect(gateRoom(s, 0, 'B')).toBe(0);
    // Next turn it is still Fresh, cannot enter, and Boukman's Uprising leaves it at the Gates.
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.characters[spy.uid].ready).toBe(false);
    expect(legalOptions(s, 'B').enters).not.toContain(spy.uid);
    // B can relocate it away, and it stays Fresh and still theirs.
    expect(legalOptions(s, 'B').relocations.some((r) => r.uid === spy.uid)).toBe(true);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), relocations: [{ uid: spy.uid, to: 2 }] } }).state;
    expect(s.characters[spy.uid].location).toBe(2);
    expect(s.characters[spy.uid].owner).toBe('B');
    // Presets: the Informants are in decks and every deck is still legal.
    for (const d of Object.values(PRESET_DECKS)) expect(validateDeck(d.cards)).toEqual([]);
    expect(PRESET_DECKS.blackstar.cards).toContain('peter_prioleau');
  });

  it('Charleston, 1822 turns the lowest Fresh Gate Character at the end of the turn, and sends an Informant home', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['john_russwurm'], handB: ['og'] });
    s.turn = 3;
    s.locations[0].revealedTurn = 1;
    // Both play at Charleston this turn: Russwurm (1) is the lowest Fresh Character and defects to B.
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'john_russwurm', location: 0 }] }, B: { ...pass(), plays: [{ cardId: 'og', location: 0 }] } }).state;
    const kid = Object.values(s.characters).find((c) => c.defId === 'john_russwurm')!;
    expect(kid.owner).toBe('B');
    expect(kid.zone).toBe('gate');
    expect(kid.ready).toBe(false);
    expect(Object.values(s.characters).find((c) => c.defId === 'og')!.owner).toBe('B');
    // Next turn nobody is Fresh there (both readied), so nobody changes sides.
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.characters[kid.uid].owner).toBe('B');
    // An Informant dumped at Charleston goes back to the player who planted it.
    let t = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    t.turn = 3;
    t.locations[0].revealedTurn = 1;
    const spy = addChar(t, 'george_wilson', 'A', 0, 'gate', false);
    spy.plantedBy = 'B';
    spy.arrivedTurn = t.turn;
    const out = resolveTurn(t, { A: pass(), B: pass() });
    expect(out.state.characters[spy.uid]).toBeUndefined();
    expect(out.state.players.B.hand).toContain('george_wilson');
    expect(out.events.some((e) => e.type === 'clash' && (e.data as { outcome: string }).outcome === 'defected')).toBe(true);
    // Nothing happens on the reveal turn.
    let u = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['john_russwurm'], handB: [] });
    u.turn = 3;
    u.locations[0].revealedTurn = 3;
    u = resolveTurn(u, { A: { ...pass(), plays: [{ cardId: 'john_russwurm', location: 0 }] }, B: pass() }).state;
    expect(Object.values(u.characters).find((c) => c.defId === 'john_russwurm')!.owner).toBe('A');
  });
  it('a confrontation emits a showdown with every fighter', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['great_migration', 'juneteenth', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    const brown = addChar(s, 'john_brown', 'A', 0, 'inside'); // Force 5
    const og = addChar(s, 'og', 'A', 0, 'inside'); // Force 3
    s.locations[0].threats.push({ uid: 'mob', defId: 'mob', location: 0, forceRequired: 6, spawnedTurn: 4 });
    const out = resolveTurn(s, { A: { ...pass(), confronts: [{ uid: brown.uid, threatUid: 'mob' }, { uid: og.uid, threatUid: 'mob' }] }, B: pass() });
    const show = out.events.find((e) => e.type === 'showdown');
    expect(show).toBeTruthy();
    const d = show!.data as { needed: number; force: { A: number; B: number }; fighters: unknown[]; cleared: boolean };
    expect(d.needed).toBe(6);
    expect(d.force.A).toBe(8);
    expect(d.fighters).toHaveLength(2);
    expect(d.cleared).toBe(true);
    expect(out.state.locations[0].threats).toHaveLength(0);
  });
  it('random decks are legal and carry a Mythic', () => {
    let x = 12345;
    const pick = (n: number) => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x % n;
    };
    for (let i = 0; i < 20; i++) expect(validateDeck(randomDeck(pick))).toEqual([]);
  });
});

describe('arrival odds', () => {
  it('Chairteenth and The Ancestors are rolled once per match at about 25%', () => {
    let chairs = 0;
    let ancestors = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = createMatch({ seed });
      if (s.spawnRolls.chairteenth) chairs++;
      if (s.spawnRolls.the_ancestors) ancestors++;
      expect(viewFor(s, 'A').spawnRolls).toEqual({});
    }
    expect(chairs).toBeGreaterThan(60);
    expect(chairs).toBeLessThan(140);
    expect(ancestors).toBeGreaterThan(60);
    expect(ancestors).toBeLessThan(140);
  });
  it('a match that rolled no Chairteenth never gets one', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['montgomery', 'gary_indiana', 'greenwood'] });
    s.spawnRolls.chairteenth = false;
    const out = resolveTurn(s, { A: pass(), B: pass() });
    expect(Object.values(out.state.characters).some((c) => c.defId === 'chairteenth')).toBe(false);
  });
});

describe('new historical cards', () => {
  it('Henry McNeal Turner is strongest aboard The Black Star and stronger anywhere in Africa', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'accra_ghana', 'gary_indiana'], revealAll: true });
    const aboard = addChar(s, 'henry_mcneal_turner', 'A', 0, 'inside');
    expect(charInfluence(s, aboard)).toBe(4);
    const africa = addChar(s, 'henry_mcneal_turner', 'B', 1, 'inside');
    expect(charInfluence(s, africa)).toBe(3);
    const gary = addChar(s, 'henry_mcneal_turner', 'B', 2, 'inside');
    expect(charInfluence(s, gary)).toBe(2);
  });
  it('Denmark Vesey adds Energy once Established; Nat Turner is not unstable after his Reveal', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['nat_turner'] });
    s.turn = 3;
    addChar(s, 'denmark_vesey', 'A', 0, 'inside');
    expect(legalOptions(s, 'A').energy).toBe(4);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'nat_turner', location: 1 }] }, B: pass() }).state;
    const nat = charsOf(s, 'A').find((c) => c.defId === 'nat_turner')!;
    expect(nat.unstable).toBeFalsy();
  });
});

describe('home ground', () => {
  it('Lagos never gets a Housing Restriction', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['lagos', 'gary_indiana', 'greenwood'], revealAll: true });
    const events: GameEvent[] = [];
    spawnThreat(s, 0, 'housing_restriction', events);
    expect(s.locations[0].threats).toHaveLength(0);
    spawnThreat(s, 0, 'segregationist_patrol', events);
    expect(s.locations[0].threats.length).toBeGreaterThan(0);
  });
  it('Mansa Musa has +1 Influence at African Locations', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['lagos', 'gary_indiana', 'greenwood'], revealAll: true });
    addChar(s, 'mansa_musa', 'A', 0, 'inside');
    addChar(s, 'mansa_musa', 'B', 1, 'inside');
    expect(influenceAt(s, 0).A).toBe(charDef('mansa_musa').influence + 1);
    expect(influenceAt(s, 1).B).toBe(charDef('mansa_musa').influence);
  });
});

describe('hand limit', () => {
  it('a draw into a full hand is discarded', () => {
    let s = createMatch({ seed: 4 });
    // Never play: the hand grows from 4 by one each turn and caps at MAX_HAND.
    for (let t = 1; t <= 5; t++) s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.players.A.hand.length).toBe(MAX_HAND);
    const deckBefore = s.players.A.deckCount;
    const discardBefore = s.players.A.discard.length;
    const out = resolveTurn(s, { A: pass(), B: pass() });
    expect(out.state.players.A.hand.length).toBe(MAX_HAND);
    expect(out.state.players.A.deckCount).toBe(deckBefore - 1);
    expect(out.state.players.A.discard.length).toBe(discardBefore + 1);
    expect(out.events.some((e) => e.type === 'info' && /hand is full/.test(e.text) && e.player === 'A')).toBe(true);
  });
});

describe('match end', () => {
  it('Sit Down ends the match immediately', () => {
    const s = createMatch({ seed: 4 });
    const out = resolveTurn(s, { A: { ...pass(), stepOff: true }, B: pass() });
    expect(out.state.phase).toBe('ended');
    expect(out.state.result?.winner).toBe('B');
    expect(out.state.result?.reason).toBe('stepOff');
  });
  it('Stand on Business lands one turn later; the other side can Sit Down at the old price first', () => {
    let s = createMatch({ seed: 4 });
    s = resolveTurn(s, { A: { ...pass(), standOnBusiness: true }, B: pass() }).state;
    expect(s.phase).toBe('planning');
    expect(s.stakes).toBe(1);
    expect(s.pendingRaises).toEqual([{ by: 'A', declaredTurn: 1 }]);
    expect(legalOptions(s, 'B').stepOffCost).toBe(1);
    expect(legalOptions(s, 'B').pendingStakes).toBe(2);
    // Cheap exit: B steps off during the grace turn and loses only 1.
    const fled = resolveTurn(s, { A: pass(), B: { ...pass(), stepOff: true } }).state;
    expect(fled.result?.stakes).toBe(1);
    expect(fled.result?.winner).toBe('A');
    expect(fled.stats.standTurns[0].accepted).toBe(false);
    // Stay: the raise lands at the end of the grace turn.
    const cont = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(cont.stakes).toBe(2);
    expect(cont.pendingRaises).toEqual([]);
    expect(cont.phase).toBe('planning');
    expect(cont.turn).toBe(3);
    expect(cont.maxTurns).toBe(8);
    // Standing back doubles again for both.
    const back = resolveTurn(cont, { A: pass(), B: { ...pass(), standOnBusiness: true } }).state;
    expect(back.stakes).toBe(2);
    const landed = resolveTurn(back, { A: pass(), B: pass() }).state;
    expect(landed.stakes).toBe(4);
    expect(legalOptions(landed, 'B').canStand).toBe(false);
    expect(cont.players.A.cannotStepOff).toBe(true);
    expect(legalOptions(cont, 'A').canStepOff).toBe(false);
    // The player who stood cannot back out: a Sit Down plan is ignored.
    const tried = resolveTurn(cont, { A: { ...pass(), stepOff: true }, B: pass() }).state;
    expect(tried.phase).toBe('planning');
    expect(tried.turn).toBe(4);
    expect(legalOptions(cont, 'A').canStand).toBe(false);
    expect(legalOptions(cont, 'B').proposedStakes).toBe(4);
  });
  it('Stand on Business on the last turn extends the match by one', () => {
    let s = createMatch({ seed: 4 });
    for (let t = 1; t <= 6; t++) s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.turn).toBe(7);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), standOnBusiness: true } }).state;
    expect(s.result).toBeUndefined();
    expect(s.turn).toBe(8);
    expect(s.phase).toBe('planning');
    expect(s.stakes).toBe(1);
    expect(legalOptions(s, 'A').canStand).toBe(false); // no room left to extend
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.phase).toBe('ended');
    expect(s.result?.turn).toBe(8);
    expect(s.result?.stakes).toBe(2); // the raise lands on the final turn
    expect(s.result?.stakes).toBe(2);
  });
  it('scores two of three Locations at the end of turn 7', () => {
    let s = createMatch({ seed: 4 });
    for (let t = 1; t <= 7; t++) {
      expect(s.turn).toBe(t);
      s = resolveTurn(s, { A: pass(), B: pass() }).state;
    }
    expect(s.phase).toBe('ended');
    expect(s.result?.winner).toBe(null);
    expect(s.result?.reason).toBe('draw');
  });
});

describe('AI vs AI smoke', () => {
  it('completes 40 matches without errors and plays legally', { timeout: 60000 }, () => {
    for (let seed = 1000; seed < 1040; seed++) {
      let s = createMatch({ seed });
      let guard = 0;
      while (s.phase !== 'ended' && guard++ < 40) {
        if (s.phase === 'planning') {
          const a = planTurn(viewFor(s, 'A'), 'A').plan;
          const b = planTurn(viewFor(s, 'B'), 'B').plan;
          expect(validatePlan(s, 'A', a)).toEqual([]);
          expect(validatePlan(s, 'B', b)).toEqual([]);
          s = resolveTurn(s, { A: a, B: b }).state;
        }
      }
      expect(s.phase).toBe('ended');
      expect(s.result).toBeDefined();
    }
  });
  it('all pool Locations are defined', () => {
    expect(LOCATIONS.filter((l) => !l.notInPool)).toHaveLength(14);
  });
});

describe('cost flow', () => {
  it('Booker T. Washington makes Characters cheaper, never below 0, and Omar only touches Events', () => {
    const s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['nat_turner', 'bud_billiken', 'reparations'] });
    expect(cardCost('nat_turner', s, 'A')).toBe(2);
    addChar(s, 'booker_t_washington', 'A', 0, 'inside');
    expect(cardCost('nat_turner', s, 'A')).toBe(1);
    expect(cardCost('bud_billiken', s, 'A')).toBe(0);
    expect(cardCost('reparations', s, 'A')).toBe(1);
    addChar(s, 'omar_ibn_said', 'A', 1, 'inside');
    expect(cardCost('reparations', s, 'A')).toBe(0);
    expect(cardCost('nat_turner', s, 'B')).toBe(2);
  });

  it('Boukman costs 1 less per Rebellion Character on the board and Fatiman takes 2 off the priciest card in hand', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['boukman_dutty', 'cecile_fatiman'] });
    s.turn = 3;
    expect(cardCost('boukman_dutty', s, 'A')).toBe(7);
    addChar(s, 'nat_turner', 'A', 0, 'inside');
    addChar(s, 'nanny_of_the_maroons', 'A', 1, 'gate');
    expect(cardCost('boukman_dutty', s, 'A')).toBe(5);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'cecile_fatiman', location: 2 }] }, B: pass() }).state;
    expect(s.players.A.discounts?.boukman_dutty).toBe(2);
    // Fatiman herself now counts as a Rebellion Character: 7 − 3 on board − 2 earned.
    expect(cardCost('boukman_dutty', s, 'A')).toBe(2);
    // Once she is Established, Rebellion Characters are 1 cheaper again.
    const fat = charsOf(s, 'A').find((c) => c.defId === 'cecile_fatiman')!;
    fat.zone = 'inside';
    expect(cardCost('boukman_dutty', s, 'A')).toBe(1);
  });

  it('Carver ripens the most expensive card in hand at the end of each turn, and the discount clears when it is played', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['marie_laveau', 'bud_billiken'], handB: [] });
    s.players.A.deck = [];
    s.players.B.deck = [];
    addChar(s, 'george_washington_carver', 'A', 0, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.players.A.discounts?.marie_laveau).toBe(1);
    expect(cardCost('marie_laveau', s, 'A')).toBe(2);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(cardCost('marie_laveau', s, 'A')).toBe(1);
    s.players.A.energyBonus = 20;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'marie_laveau', location: 1 }] }, B: pass() }).state;
    expect(s.players.A.discounts?.marie_laveau).toBeUndefined();
  });

  it("Boukman's Uprising sends every Ready Gate Character Inside at once", () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['boukman_dutty'] });
    addChar(s, 'john_russwurm', 'A', 0, 'gate', true);
    addChar(s, 'alonzo_herndon', 'A', 1, 'gate', true);
    addChar(s, 'organizer', 'A', 2, 'gate', false);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'boukman_dutty', location: 2 }] }, B: pass() }).state;
    const zones = Object.fromEntries(charsOf(s, 'A').map((c) => [c.defId, c.zone]));
    expect(zones.john_russwurm).toBe('inside');
    expect(zones.alonzo_herndon).toBe('inside');
    expect(zones.organizer).toBe('inside'); // Fresh, but the Uprising takes everyone
    expect(zones.boukman_dutty).toBe('gate');
  });

  it('Nehanda returns to hand at cost 0 instead of being displaced', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['mami_wata'] });
    addChar(s, 'nehanda', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'mami_wata', location: 0 }] } }).state;
    expect(charsOf(s, 'A').some((c) => c.defId === 'nehanda')).toBe(false);
    expect(s.players.A.hand).toContain('nehanda');
    expect(cardCost('nehanda', s, 'A')).toBe(0);
  });

  it('Nanny shields her Location from opposing Reveals; Laveau hexes a Gate Character elsewhere', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['marie_laveau', 'queen_nzinga'] });
    addChar(s, 'nanny_of_the_maroons', 'A', 0, 'inside');
    const kid0 = addChar(s, 'john_russwurm', 'A', 0, 'gate', true);
    addChar(s, 'alonzo_herndon', 'A', 1, 'gate', true);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'marie_laveau', location: 0 }, { cardId: 'queen_nzinga', location: 1 }] } }).state;
    expect(s.characters[kid0.uid].permInfluence).toBe(0); // Nanny: nothing to hex
    const barber = Object.values(s.characters).find((c) => c.defId === 'alonzo_herndon')!;
    expect(barber.owner).toBe('A');
    expect(barber.location).not.toBe(1); // Nzinga (force 4) displaces Alonzo Herndon
    // Where Nanny is not, the gris-gris lands: −2 for the rest of the match, still A's Character.
    let t = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['marie_laveau'] });
    const kid = addChar(t, 'og', 'A', 2, 'gate', true); // 3 Influence
    const out = resolveTurn(t, { A: pass(), B: { ...pass(), plays: [{ cardId: 'marie_laveau', location: 2 }] } });
    expect(out.state.characters[kid.uid].owner).toBe('A');
    expect(out.state.characters[kid.uid].permInfluence).toBe(-2);
    expect(charInfluence(out.state, out.state.characters[kid.uid])).toBe(1);
    expect(out.events.some((e) => e.type === 'clash' && (e.data as { outcome: string }).outcome === 'hexed')).toBe(true);
  });

  it('Diallo brings an Established Character home for free; Oak Bluffs pays Energy next turn', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['oak_bluffs', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['ayuba_suleiman_diallo'] });
    s.turn = 2;
    const z = addChar(s, 'zora_neale_hurston', 'A', 1, 'inside');
    addChar(s, 'john_russwurm', 'A', 0, 'inside');
    addChar(s, 'alonzo_herndon', 'A', 0, 'inside');
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'ayuba_suleiman_diallo', location: 2, target: { charUid: z.uid } }] }, B: pass() }).state;
    expect(s.characters[z.uid]).toBeUndefined();
    expect(s.players.A.hand).toContain('zora_neale_hurston');
    expect(cardCost('zora_neale_hurston', s, 'A')).toBe(0);
    expect(s.turn).toBe(3);
    expect(energyFor(s, 'A')).toBe(4);
    expect(energyFor(s, 'B')).toBe(3);
  });
});

describe('Events at Locations', () => {
  it('an Event goes in the Event slot under a Location: one per Location per turn, no Gate slot needed', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['word_of_mouth', 'reparations', 'john_russwurm', 'alonzo_herndon'] });
    addChar(s, 'og', 'A', 0, 'gate');
    addChar(s, 'organizer', 'A', 0, 'gate');
    // Full Gates do not matter: the Event slot is its own.
    expect(legalOptions(s, 'A').plays.find((p) => p.cardId === 'word_of_mouth')?.locations).toEqual([0, 1, 2]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'word_of_mouth', location: 0 }] })).toEqual([]);
    // Two Characters fill the Gates at Location 1 and the Event still fits beside them.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'john_russwurm', location: 1 }, { cardId: 'alonzo_herndon', location: 1 }, { cardId: 'word_of_mouth', location: 1 }] })).toEqual([]);
    // Two Events at one Location in the same turn: the slot is taken.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'word_of_mouth', location: 1 }, { cardId: 'reparations', location: 1 }] })).not.toEqual([]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'word_of_mouth', location: 1 }, { cardId: 'reparations', location: 2 }] })).toEqual([]);
  });

  it('Word of Mouth draws two with a crowd; The Ancestors bless Africa', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['accra_ghana', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['word_of_mouth', 'the_ancestors'] });
    addChar(s, 'og', 'A', 1, 'inside');
    addChar(s, 'organizer', 'A', 1, 'gate');
    s.players.A.spawned = [];
    const before = s.players.A.hand.length;
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'word_of_mouth', location: 1 }, { cardId: 'the_ancestors', location: 0 }] }, B: pass() });
    // −2 played, +2 from Word of Mouth, +1 turn draw.
    expect(out.state.players.A.hand.length).toBe(before - 2 + 2 + 1);
    expect(out.events.find((e) => e.type === 'influence' && e.location === 0)?.data).toMatchObject({ A: 1 });
  });

  it('Community Defense protects everywhere and adds Force where it lands', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['community_defense'], handB: ['mami_wata'] });
    const kid = addChar(s, 'john_russwurm', 'A', 0, 'gate', true);
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'community_defense', location: 1 }] }, B: { ...pass(), plays: [{ cardId: 'mami_wata', location: 0 }] } });
    // Mami Wata's lure fails: A's Characters cannot be displaced anywhere this turn.
    expect(out.state.characters[kid.uid].location).toBe(0);
    expect(out.state.characters[kid.uid].owner).toBe('A');
  });
});

describe('zone rule', () => {
  it('Gate Characters relocate and stay Ready; Inside Characters arrive Fresh', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'harpers_ferry', 'gary_indiana'], revealAll: true });
    const ready = addChar(s, 'john_russwurm', 'A', 0, 'gate', true);
    const fresh = addChar(s, 'alonzo_herndon', 'A', 0, 'gate', false);
    const settled = addChar(s, 'og', 'A', 1, 'inside');
    s.players.A.energyBonus = 20;
    const opts = legalOptions(s, 'A');
    expect(opts.relocations.map((r) => r.uid).sort()).toEqual([ready.uid, fresh.uid, settled.uid].sort());
    // Enter and relocate in the same turn is refused.
    expect(validatePlan(s, 'A', { ...pass(), enters: [ready.uid], relocations: [{ uid: ready.uid, to: 2 }] })).not.toEqual([]);
    s = resolveTurn(s, { A: { ...pass(), relocations: [{ uid: ready.uid, to: 2 }] }, B: pass() }).state;
    expect(s.characters[ready.uid].location).toBe(2);
    expect(s.characters[ready.uid].zone).toBe('gate');
    expect(s.characters[ready.uid].ready).toBe(true);
    // A Fresh Gate Character keeps its waiting progress when it moves.
    let t = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'harpers_ferry', 'gary_indiana'], revealAll: true });
    const f2 = addChar(t, 'alonzo_herndon', 'A', 0, 'gate', false);
    f2.arrivedTurn = t.turn - 1; // waited one turn already: moving does not reset that
    t = resolveTurn(t, { A: { ...pass(), relocations: [{ uid: f2.uid, to: 2 }] }, B: pass() }).state;
    expect(t.characters[f2.uid].location).toBe(2);
    expect(t.characters[f2.uid].ready).toBe(true);
    // Inside → Gates still arrives Fresh.
    let u = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'harpers_ferry', 'gary_indiana'], revealAll: true });
    const inside = addChar(u, 'og', 'A', 1, 'inside');
    u = resolveTurn(u, { A: { ...pass(), relocations: [{ uid: inside.uid, to: 2 }] }, B: pass() }).state;
    expect(u.characters[inside.uid].zone).toBe('gate');
    expect(u.characters[inside.uid].ready).toBe(false);
  });
});

describe('day and night', () => {
  it('Sundown Town holds everyone at night; a Curfew Threat holds day and night; Harriet frees them', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['sundown_town', 'harpers_ferry', 'gary_indiana'], revealAll: true, handA: ['harriet_tubman'] });
    const stuck = addChar(s, 'john_russwurm', 'A', 0, 'inside');
    const gateStuck = addChar(s, 'alonzo_herndon', 'A', 0, 'gate', true);
    // Turn 1 is day: both may relocate out.
    expect(legalOptions(s, 'A').relocations.map((r) => r.uid)).toEqual(expect.arrayContaining([stuck.uid, gateStuck.uid]));
    s.turn = 2; // night
    expect(legalOptions(s, 'A').relocations.map((r) => r.uid)).not.toContain(stuck.uid);
    expect(legalOptions(s, 'A').relocations.map((r) => r.uid)).not.toContain(gateStuck.uid);
    expect(validatePlan(s, 'A', { ...pass(), relocations: [{ uid: stuck.uid, to: 1 }] })).not.toEqual([]);
    // Harriet conducts the Established John Russwurm out of the curfew, straight Inside the destination.
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 2, target: { charUid: stuck.uid, location: 1 } }] }, B: pass() }).state;
    expect(s.characters[stuck.uid].location).toBe(1);
    expect(s.characters[stuck.uid].zone).toBe('inside');
    // Turn 3 is day again: the Alonzo Herndon may leave.
    expect(s.turn).toBe(3);
    expect(legalOptions(s, 'A').relocations.map((r) => r.uid)).toContain(gateStuck.uid);
    // The Justice System's hold is its own rule, not a curfew: Harriet still gets someone out, and Inside.
    let j = rig(createMatch({ seed: 2 }), { locations: ['justice_system', 'harpers_ferry', 'gary_indiana'], revealAll: true, handA: ['harriet_tubman'] });
    const jailed = addChar(j, 'og', 'A', 0, 'inside');
    jailed.arrivedTurn = j.turn;
    expect(legalOptions(j, 'A').relocations.map((r) => r.uid)).not.toContain(jailed.uid);
    j = resolveTurn(j, { A: { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 2, target: { charUid: jailed.uid, location: 1 } }] }, B: pass() }).state;
    expect(j.characters[jailed.uid].location).toBe(1);
    expect(j.characters[jailed.uid].zone).toBe('inside');
  });
});

describe('clash beats', () => {
  it('a challenge emits a clash event that names the actor, the victim and the outcome', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['queen_nzinga'] });
    const barber = addChar(s, 'alonzo_herndon', 'B', 0, 'gate', true);
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'queen_nzinga', location: 0 }] }, B: pass() });
    const clash = out.events.find((e) => e.type === 'clash');
    expect(clash).toBeTruthy();
    const d = clash!.data as { actor: { id: string; owner: string }; victim: { uid: string }; outcome: string; to?: number };
    expect(d.actor.id).toBe('queen_nzinga');
    expect(d.victim.uid).toBe(barber.uid);
    expect(d.outcome).toBe('displaced');
    expect(d.to).toBe(out.state.characters[barber.uid].location);
    expect(clash!.text).toContain('knocks them away');
    // A held-off challenge is a clash too.
    let h = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['queen_nzinga'] });
    addChar(h, 'ogun', 'B', 0, 'gate', true); // Force 5 beats Nzinga's 4
    const held = resolveTurn(h, { A: { ...pass(), plays: [{ cardId: 'queen_nzinga', location: 0 }] }, B: pass() }).events.find((e) => e.type === 'clash');
    expect((held!.data as { outcome: string }).outcome).toBe('held');
  });
});

describe('turn trace', () => {
  it('records the turn one beat at a time, ending on the resolved state', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['queen_nzinga'], handB: ['john_russwurm'] });
    addChar(s, 'alonzo_herndon', 'B', 0, 'gate', true);
    const plans = { A: { ...pass(), plays: [{ cardId: 'queen_nzinga', location: 0 }] }, B: { ...pass(), plays: [{ cardId: 'john_russwurm', location: 1 }] } };
    const out = resolveTurn(s, plans, { trace: true });
    expect(out.trace).toBeTruthy();
    const steps = out.trace!;
    expect(steps.length).toBeGreaterThan(3);
    const kinds = steps.map((st) => st.kind);
    expect(kinds).toContain('play');
    expect(kinds).toContain('revealFx');
    expect(kinds).toContain('tally');
    // Each beat carries its own events and a label; the last beat is the resolved state.
    for (const st of steps) expect(st.label.length).toBeGreaterThan(0);
    expect(steps.some((st) => st.events.some((e) => e.type === 'clash'))).toBe(true);
    // The last beat is the counted board; the next turn's draw happens after the replay.
    expect(steps[steps.length - 1].state.turn).toBe(s.turn);
    expect(Object.keys(steps[steps.length - 1].state.characters).sort()).toEqual(Object.keys(out.state.characters).sort());
    // The beats do not share state objects with the live result.
    expect(steps[0].state).not.toBe(out.state);
    // Without the option, no trace is produced and the result is the same.
    const plain = resolveTurn(s, plans);
    expect(plain.trace).toBeUndefined();
    expect(plain.state).toEqual(out.state);
  });
});

describe('curfew immunity', () => {
  it('Harriet and John Brown ignore curfew, and John Brown hides one friend from Sundown Town', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['sundown_town', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    s.turn = 2; // night
    const harriet = addChar(s, 'harriet_tubman', 'A', 0, 'gate', true);
    const brown = addChar(s, 'john_brown', 'A', 0, 'inside');
    const porter = addChar(s, 'sleeping_car_porters', 'A', 0, 'gate', true);
    expect(lockReason(s, harriet)).toBeNull();
    expect(lockReason(s, brown)).toBeNull();
    expect(lockReason(s, porter)).not.toBeNull();
    // Fresh arrivals at Sundown Town's Gates: one hides with John Brown, the next is run out.
    let t = rig(createMatch({ seed: 2 }), { locations: ['sundown_town', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    t.turn = 3;
    t.locations[0].revealedTurn = 1;
    addChar(t, 'john_brown', 'A', 0, 'inside');
    const stays = addChar(t, 'zora_neale_hurston', 'A', 0, 'gate', false); // 3 Influence: sheltered first
    const goes = addChar(t, 'john_russwurm', 'A', 0, 'gate', false);
    stays.arrivedTurn = t.turn; // played this turn: still Fresh when the sun goes down
    goes.arrivedTurn = t.turn;
    const out = resolveTurn(t, { A: pass(), B: pass() });
    expect(out.state.characters[stays.uid].location).toBe(0);
    expect(out.state.characters[goes.uid].location).not.toBe(0);
    expect(out.events.some((e) => e.type === 'info' && e.text.includes('hides Zora Neale Hurston overnight'))).toBe(true);
    // John Brown himself, Fresh at those Gates, is never run out.
    let u = rig(createMatch({ seed: 2 }), { locations: ['sundown_town', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    u.turn = 3;
    u.locations[0].revealedTurn = 1;
    const jb = addChar(u, 'john_brown', 'A', 0, 'gate', false);
    jb.arrivedTurn = u.turn;
    expect(resolveTurn(u, { A: pass(), B: pass() }).state.characters[jb.uid].location).toBe(0);
  });
});

describe('artists', () => {
  it("an artist's work is lasting Influence on the Location itself, and it stays when the artist leaves", () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'lagos'], revealAll: true, handA: ['edmonia_lewis', 'edward_bannister', 'harriet_powers', 'robert_duncanson', 'dave_the_potter'], handB: ['queen_nzinga'] });
    s.turn = 3;
    // Lewis: +2 at Greenwood; Bannister: +1, +1 more because A is behind at Great Migration.
    addChar(s, 'og', 'B', 1, 'inside');
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'edmonia_lewis', location: 0 }, { cardId: 'edward_bannister', location: 1 }] }, B: pass() }).state;
    expect(s.locations[0].permInfluence?.A).toBe(2);
    expect(s.locations[1].permInfluence?.A).toBe(2);
    // Nzinga knocks Lewis away; Greenwood keeps her +2.
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'queen_nzinga', location: 0 }] } }).state;
    const lewis = Object.values(s.characters).find((c) => c.defId === 'edmonia_lewis')!;
    expect(lewis.location).not.toBe(0);
    expect(s.locations[0].permInfluence?.A).toBe(2);
    expect(influenceAt(s, 0).A).toBe(2);
    // Powers: one square per other friendly Character at her Location, capped at 3.
    addChar(s, 'john_russwurm', 'A', 2, 'gate', true);
    addChar(s, 'alonzo_herndon', 'A', 2, 'inside');
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'harriet_powers', location: 2 }] }, B: pass() }).state;
    expect(s.locations[2].permInfluence?.A).toBe(2);
    // Duncanson paints every Location where A is Established (Lagos has Herndon Inside; Greenwood and Great Migration do not).
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'robert_duncanson', location: 0 }] }, B: pass() }).state;
    expect(s.locations[2].permInfluence?.A).toBe(3);
    expect(s.locations[0].permInfluence?.A).toBe(2);
    // Dave: +1 wherever he lands (Greenwood: Duncanson holds one Gate slot there, so there is room).
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'dave_the_potter', location: 0 }] }, B: pass() }).state;
    expect(s.locations[0].permInfluence?.A).toBe(3);
  });

  it('Tanner adds lasting Influence every turn he stays Established, and the category is deck-legal', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    addChar(s, 'henry_ossawa_tanner', 'A', 1, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.locations[1].permInfluence?.A).toBe(2);
    expect(CHARACTERS.filter((c) => c.category === 'artist')).toHaveLength(6);
    for (const d of Object.values(PRESET_DECKS)) expect(validateDeck(d.cards)).toEqual([]);
    expect(PRESET_DECKS.railroad.cards).toContain('edmonia_lewis');
    expect(PRESET_DECKS.pantheon.cards).toContain('henry_ossawa_tanner');
  });
});

describe('variety pass and lasting Reparations', () => {
  it('Reparations is lasting Influence on the Location, whenever it is played', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['reparations'] });
    s.players.A.setbacks = 3;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'reparations', location: 0 }] }, B: pass() }).state;
    expect(s.locations[0].permInfluence?.A).toBe(4); // 3 Setbacks +1 in the Americas
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(influenceAt(s, 0).A).toBe(4);
  });
  it('Zora digs, Walker banks Energy, Payne discounts the next Character, Green grants a Relocation, Vesey recruits', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, energy: true, handA: ['zora_neale_hurston', 'madam_cj_walker', 'daniel_payne', 'victor_hugo_green', 'denmark_vesey', 'john_russwurm'] });
    s.turn = 5;
    s.players.A.deck = ['mansa_musa', 'bud_billiken', 'harriet_tubman'];
    s.players.A.deckCount = 3;
    const handBefore = s.players.A.hand.length;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'zora_neale_hurston', location: 0 }, { cardId: 'madam_cj_walker', location: 1 }] }, B: pass() }).state;
    // Zora kept Mansa Musa (cost 4) over Bud Billiken (cost 0), which went to the bottom; then the turn draw took Harriet.
    expect(s.players.A.hand).toContain('mansa_musa');
    expect(s.players.A.deck).toEqual(['bud_billiken']);
    expect(s.players.A.hand.length).toBe(handBefore - 2 + 2);
    // Walker: +2 Energy next turn (turn 6 → 8 Energy).
    expect(legalOptions(s, 'A').energy).toBe(6 + 2);
    // Payne: the next Character costs 1 less from the following turn; Green: +1 Relocation next turn.
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'daniel_payne', location: 0 }, { cardId: 'victor_hugo_green', location: 1 }] }, B: pass() }).state;
    expect(cardCost('john_russwurm', s, 'A')).toBe(0);
    expect(cardCost('denmark_vesey', s, 'A')).toBe(charDef('denmark_vesey').cost - 1);
    expect(legalOptions(s, 'A').relocationsAllowed).toBe(2);
    // Vesey at Gary with two friends beside him: draws 2 (max), and Payne's discount is spent.
    s.players.A.deck = ['harriet_powers', 'bass_reeves', 'og'];
    s.players.A.deckCount = 3;
    addChar(s, 'og', 'A', 2, 'inside');
    addChar(s, 'bud_billiken', 'A', 2, 'gate', true);
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'denmark_vesey', location: 2 }] }, B: pass() });
    expect(out.events.some((e) => e.text.includes('recruits: draws 2 cards'))).toBe(true);
    expect(out.state.players.A.nextCharacterDiscount).toBeUndefined();
    expect(legalOptions(out.state, 'A').relocationsAllowed).toBe(1);
  });
  it('Allen draws when a friend goes Inside, Callie House draws when a Threat is cleared, Oshun grows the weakest', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    addChar(s, 'richard_allen', 'A', 0, 'inside');
    addChar(s, 'oshun', 'A', 0, 'inside');
    const kid = addChar(s, 'bud_billiken', 'A', 0, 'gate', true);
    const o1 = resolveTurn(s, { A: { ...pass(), enters: [kid.uid] }, B: pass() });
    s = o1.state;
    expect(s.characters[kid.uid].zone).toBe('inside');
    expect(o1.events.some((e) => e.text.includes('the congregation grows'))).toBe(true); // Allen draws
    expect(s.characters[kid.uid].permInfluence).toBe(1); // Oshun: Bud (1) is the weakest
    let t = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [] });
    addChar(t, 'callie_house', 'A', 1, 'inside');
    const brown = addChar(t, 'john_brown', 'A', 1, 'gate', true);
    t.locations[1].threats.push({ uid: 'th1', defId: 'segregationist_patrol', location: 1, target: 'A', forceRequired: 3, spawnedTurn: t.turn });
    const out = resolveTurn(t, { A: { ...pass(), confronts: [{ uid: brown.uid, threatUid: 'th1' }] }, B: pass() });
    expect(out.state.locations[1].threats).toHaveLength(0);
    expect(out.events.some((e) => e.text.includes('the association pays out'))).toBe(true);
  });
});

describe('Informant edge cases (from review)', () => {
  it('Charleston: tie goes against the leader, protection is respected, and a full receiving Gate blocks the switch', () => {
    // Tie: A leads on lasting Influence; A's Russwurm defects, not B's.
    let s = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    s.turn = 3;
    s.locations[0].revealedTurn = 1;
    s.locations[0].permInfluence = { A: 2, B: 0 };
    const a = addChar(s, 'john_russwurm', 'A', 0, 'gate', false);
    const b = addChar(s, 'john_russwurm', 'B', 0, 'gate', false);
    a.arrivedTurn = b.arrivedTurn = 3;
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.characters[a.uid].owner).toBe('B');
    expect(s.characters[b.uid].owner).toBe('B');
    // Protection: Community Defense shields A's weakest, so B's stronger Fresh Character is the one that defects.
    let t = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['community_defense'], handB: [] });
    t.turn = 3;
    t.locations[0].revealedTurn = 1;
    const ta = addChar(t, 'john_russwurm', 'A', 0, 'gate', false);
    const tb = addChar(t, 'og', 'B', 0, 'gate', false);
    ta.arrivedTurn = tb.arrivedTurn = 3;
    t = resolveTurn(t, { A: { ...pass(), plays: [{ cardId: 'community_defense', location: 1 }] }, B: pass() }).state;
    expect(t.characters[ta.uid].owner).toBe('A');
    expect(t.characters[tb.uid].owner).toBe('A');
    // Full Gates on the receiving side: nobody switches, and nobody ends up with three Gate Characters.
    let u = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    u.turn = 3;
    u.locations[0].revealedTurn = 1;
    addChar(u, 'og', 'A', 0, 'gate', true);
    addChar(u, 'organizer', 'A', 0, 'gate', true);
    const ub = addChar(u, 'john_russwurm', 'B', 0, 'gate', false);
    ub.arrivedTurn = 3;
    const out = resolveTurn(u, { A: pass(), B: pass() });
    expect(out.state.characters[ub.uid].owner).toBe('B');
    expect(charsAt(out.state, 0, 'A', 'gate')).toHaveLength(2);
    expect(out.events.some((e) => e.text.includes('Gates here are full'))).toBe(true);
  });

  it('Informants never become Ready (Lagos, relocation), never confront, are never knocked by the planter, and are placed last', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['lagos', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    const spy = addChar(s, 'george_wilson', 'B', 0, 'gate', false);
    spy.plantedBy = 'A';
    s = resolveTurn(s, { A: pass(), B: { ...pass(), relocations: [{ uid: spy.uid, to: 1 }] } }).state;
    expect(s.characters[spy.uid].location).toBe(1);
    expect(s.characters[spy.uid].ready).toBe(false); // Lagos departures arrive Ready, but not an Informant
    const forced = structuredClone(s);
    forced.characters[spy.uid].ready = true;
    expect(legalOptions(forced, 'B').enters).not.toContain(spy.uid);
    expect(validatePlan(forced, 'B', { ...pass(), enters: [spy.uid] })).not.toEqual([]);
    // It never confronts, even for its holder.
    s.locations[1].threats.push({ uid: 'th1', defId: 'segregationist_patrol', location: 1, target: 'B', forceRequired: 3, spawnedTurn: s.turn });
    expect(legalOptions(s, 'B').confronts.some((c) => c.chars.includes(spy.uid))).toBe(false);
    // Nzinga (the planter) challenging at that Location ignores her own Informant.
    let n = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['queen_nzinga'], handB: [] });
    const spy2 = addChar(n, 'george_wilson', 'B', 0, 'gate', false);
    spy2.plantedBy = 'A';
    n = resolveTurn(n, { A: { ...pass(), plays: [{ cardId: 'queen_nzinga', location: 0 }] }, B: pass() }).state;
    expect(n.characters[spy2.uid].location).toBe(0);
    // Placement order: with B holding initiative and filling their own Gate first, B's card is never the one discarded.
    let r = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['peter_prioleau'], handB: ['organizer'] });
    r.turn = 3;
    r.initiative = 'A';
    addChar(r, 'og', 'B', 0, 'gate', true);
    const out = resolveTurn(r, { A: { ...pass(), plays: [{ cardId: 'peter_prioleau', location: 0 }] }, B: { ...pass(), plays: [{ cardId: 'organizer', location: 0 }] } });
    expect(Object.values(out.state.characters).some((c) => c.defId === 'organizer' && c.owner === 'B')).toBe(true);
    expect(out.state.players.A.hand).toContain('peter_prioleau'); // back to hand, not discarded
    // Sundown Town leaves Informants alone: no displacement, no Setback for the holder.
    let d = rig(createMatch({ seed: 2 }), { locations: ['sundown_town', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    d.turn = 3;
    d.locations[0].revealedTurn = 1;
    const spy3 = addChar(d, 'peter_prioleau', 'B', 0, 'gate', false);
    spy3.plantedBy = 'A';
    spy3.arrivedTurn = 3;
    const dd = resolveTurn(d, { A: pass(), B: pass() });
    expect(dd.state.characters[spy3.uid].location).toBe(0);
    expect(dd.state.players.B.setbacks).toBe(0);
  });

  it('Boukman skips an Informant, Harriet refuses one but Smalls slides it, Laveau picks the highest and protection stops her, Harborlight plants legally', () => {
    let s = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['boukman_dutty'] });
    s.turn = 7;
    const spy = addChar(s, 'peter_prioleau', 'B', 0, 'gate', false);
    spy.plantedBy = 'A';
    addChar(s, 'newsboy' in CARD_BY_ID ? 'newsboy' : 'john_russwurm', 'B', 1, 'gate', true);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'boukman_dutty', location: 2 }] } }).state;
    expect(s.characters[spy.uid].zone).toBe('gate');
    // Harriet will not conduct an Informant; Robert Smalls may slide it.
    let h = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['harriet_tubman', 'robert_smalls'] });
    const spy2 = addChar(h, 'peter_prioleau', 'B', 0, 'gate', false);
    spy2.plantedBy = 'A';
    expect(validatePlan(h, 'B', { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 1, target: { charUid: spy2.uid, location: 2 } }] })).not.toEqual([]);
    expect(validatePlan(h, 'B', { ...pass(), plays: [{ cardId: 'robert_smalls', location: 1, target: { charUid: spy2.uid, location: 2 } }] })).toEqual([]);
    // Laveau: the highest Influence is hexed; Community Defense stops it entirely.
    let l = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['marie_laveau'] });
    const low = addChar(l, 'john_russwurm', 'A', 2, 'gate', true);
    const high = addChar(l, 'og', 'A', 2, 'gate', true);
    l = resolveTurn(l, { A: pass(), B: { ...pass(), plays: [{ cardId: 'marie_laveau', location: 2 }] } }).state;
    expect(l.characters[high.uid].permInfluence).toBe(-2);
    expect(l.characters[low.uid].permInfluence).toBe(0);
    let m = rig(createMatch({ seed: 5 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['community_defense'], handB: ['marie_laveau'] });
    const kid = addChar(m, 'og', 'A', 2, 'gate', true);
    const mo = resolveTurn(m, { A: { ...pass(), plays: [{ cardId: 'community_defense', location: 0 }] }, B: { ...pass(), plays: [{ cardId: 'marie_laveau', location: 2 }] } });
    expect(mo.state.characters[kid.uid].permInfluence).toBe(0);
    expect(mo.events.some((e) => e.type === 'clash' && (e.data as { outcome: string }).outcome === 'hexed')).toBe(false);
    // Harborlight with Informants in hand produces a legal plan that plants one where the opponent has room.
    let ai = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: ['peter_prioleau', 'george_wilson'] });
    ai.turn = 4;
    addChar(ai, 'og', 'A', 0, 'inside');
    addChar(ai, 'organizer', 'A', 1, 'inside');
    const d = planTurn(viewFor(ai, 'B'), 'B', { bestPick: 1, sensiblePick: 0, standThreshold: 2, strongStandThreshold: 2, bluffRate: 0, continueThreshold: 0.2 });
    expect(validatePlan(ai, 'B', d.plan)).toEqual([]);
    expect(d.plan.plays.some((pl) => pl.cardId === 'peter_prioleau' || pl.cardId === 'george_wilson')).toBe(true);
  });

  it('Community Defense adds +2 confront Force where it lands', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['community_defense'] });
    s.turn = 4;
    const barber = addChar(s, 'alonzo_herndon', 'A', 1, 'inside'); // Force 2
    s.locations[1].threats.push({ uid: 'mob1', defId: 'segregationist_patrol', location: 1, target: 'A', forceRequired: 4, spawnedTurn: s.turn });
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'community_defense', location: 1 }], confronts: [{ uid: barber.uid, threatUid: 'mob1' }] }, B: pass() });
    expect(out.state.locations[1].threats).toHaveLength(0);
  });
});

describe('The Middle Passage and the DeWolf Trade', () => {
  it('the trade ships the lowest Fresh Gate Character to the Passage, where the toll is paid and nobody goes Inside', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'middle_passage', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    s.turn = 3;
    s.locations[0].threats.push({ uid: 'dw', defId: 'dewolf_trade', location: 0, forceRequired: 5, spawnedTurn: 2 });
    const low = addChar(s, 'john_russwurm', 'A', 0, 'gate', false); // Influence 1, Fresh
    low.arrivedTurn = 3;
    const high = addChar(s, 'og', 'B', 0, 'gate', false); // Influence 3, Fresh
    high.arrivedTurn = 3;
    const out = resolveTurn(s, { A: pass(), B: pass() });
    expect(out.state.characters[low.uid].location).toBe(1);
    expect(out.state.characters[high.uid].location).toBe(0);
    expect(out.state.players.A.setbacks).toBe(1);
    expect(out.events.some((e) => e.type === 'clash' && (e.data as { actor: { id: string } }).actor.id === 'dewolf_trade')).toBe(true);
    // The toll: −1 for good at the end of the turn he arrives is not charged (he was displaced after the toll); next turn it is.
    let t = out.state;
    t = resolveTurn(t, { A: pass(), B: pass() }).state;
    expect(t.characters[low.uid].permInfluence).toBe(-1);
    expect(charInfluence(t, t.characters[low.uid])).toBe(0);
    // No Inside here, ever; and it never goes below zero.
    expect(insideCapacity(t, 1)).toBe(0);
    expect(legalOptions(t, 'A').enters).not.toContain(low.uid);
    t = resolveTurn(t, { A: pass(), B: pass() }).state;
    expect(charInfluence(t, t.characters[low.uid])).toBe(0);
    // Leaving the Passage: arrives Ready.
    t = resolveTurn(t, { A: { ...pass(), relocations: [{ uid: low.uid, to: 2 }] }, B: pass() }).state;
    expect(t.characters[low.uid].location).toBe(2);
    expect(t.characters[low.uid].ready).toBe(true);
    // Without a Passage in play the trade ships to a random Location.
    let u = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: [], handB: [] });
    u.turn = 3;
    u.locations[0].threats.push({ uid: 'dw', defId: 'dewolf_trade', location: 0, forceRequired: 5, spawnedTurn: 2 });
    const v = addChar(u, 'john_russwurm', 'A', 0, 'gate', false);
    v.arrivedTurn = 3;
    const uo = resolveTurn(u, { A: pass(), B: pass() }).state;
    expect(uo.characters[v.uid].location).not.toBe(0);
  });
});

describe('Dunbar, Bud Billiken and the neutralized stamp', () => {
  it('Dunbar marks the Location that opens at the end of NEXT turn, and the mark survives this turn\'s reveal', () => {
    let s = rig(createMatch({ seed: 5 }), { handA: ['paul_laurence_dunbar'], handB: [] });
    expect(s.turn).toBe(1);
    const order = s.revealOrder;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'paul_laurence_dunbar', location: 0 }] }, B: pass() }).state;
    // Turn 1's reveal (order[0]) has happened; the secret is order[1], still hidden and still marked.
    expect(s.locations[order[0]].revealed).toBe(true);
    expect(s.players.A.knownNextReveal).toBe(order[1]);
    expect(s.locations[order[1]].revealed).toBe(false);
    expect(s.players.B.knownNextReveal).toBeUndefined();
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.locations[order[1]].revealed).toBe(true);
    expect(s.players.A.knownNextReveal).toBeUndefined();
  });
  it('Dunbar on Turn 3 has nothing left to learn', () => {
    let s = rig(createMatch({ seed: 5 }), { handA: ['paul_laurence_dunbar'], handB: [] });
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.turn).toBe(3);
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'paul_laurence_dunbar', location: 0 }] }, B: pass() });
    expect(out.state.players.A.knownNextReveal).toBeUndefined();
    expect(out.events.some((e) => e.text.includes('every Location is open by the end of this turn'))).toBe(true);
  });
  it('Bud Billiken signs up your other 0–1 cost Characters here, not the expensive ones or the informants', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true, handA: ['bud_billiken'], handB: [] });
    const kid = addChar(s, 'claudette_colvin', 'A', 0, 'inside'); // cost 1
    const grown = addChar(s, 'og', 'A', 0, 'inside'); // cost 2+
    const spy = addChar(s, 'peter_prioleau', 'A', 0, 'gate', false); // an informant B planted on A: owner A, cost 0
    spy.plantedBy = 'B';
    const elsewhere = addChar(s, 'claudette_colvin', 'A', 1, 'inside');
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'bud_billiken', location: 0 }] }, B: pass() }).state;
    expect(s.characters[kid.uid].permInfluence).toBe(1);
    expect(s.characters[grown.uid].permInfluence).toBe(0);
    expect(s.characters[spy.uid].permInfluence).toBe(0);
    expect(s.characters[elsewhere.uid].permInfluence).toBe(0);
  });
  it('a neutralized Threat names itself in the event so the board can stamp it', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'great_migration', 'greenwood'], revealAll: true, handA: [], handB: [] });
    const og = addChar(s, 'og', 'A', 0, 'inside');
    s.locations[0].threats.push({ uid: 't9', defId: 'segregationist_patrol', location: 0, target: 'B', forceRequired: 3, spawnedTurn: 1 });
    const out = resolveTurn(s, { A: { ...pass(), confronts: [{ uid: og.uid, threatUid: 't9' }] }, B: pass() }, { trace: true });
    const ev = out.events.find((e) => e.type === 'threatNeutralized')!;
    expect(ev.data).toMatchObject({ threatUid: 't9', defId: 'segregationist_patrol', target: 'B' });
    const beat = out.trace!.find((t) => t.kind === 'showdown')!;
    expect(beat.events.some((e) => e.type === 'threatNeutralized')).toBe(true);
    expect(beat.state.locations[0].threats).toHaveLength(0);
  });
});

describe('home ground and Straight Inside', () => {
  it('every Character has a home on the board, and the home Locations exist', () => {
    for (const c of CHARACTERS) {
      expect(c.home, c.id).toBeDefined();
      expect(c.home!.locations.length, c.id).toBeGreaterThan(0);
      for (const l of c.home!.locations) expect(LOCATION_BY_ID[l], `${c.id} → ${l}`).toBeDefined();
      expect(c.home!.why.length, c.id).toBeGreaterThan(8);
    }
  });
  it('+1 Influence at home, at the Gates or Inside, and only once the Location is revealed', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['harpers_ferry', 'gary_indiana', 'greenwood'], revealAll: true });
    const jb = addChar(s, 'john_brown', 'A', 0, 'gate');
    const away = addChar(s, 'john_brown', 'B', 1, 'inside');
    expect(charInfluence(s, jb)).toBe(charDef('john_brown').influence + 1);
    expect(charInfluence(s, away)).toBe(charDef('john_brown').influence);
    s.locations[0].revealed = false;
    expect(charInfluence(s, jb)).toBe(charDef('john_brown').influence);
  });
  it('an Informant at home drains one more', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['charleston_1822', 'gary_indiana', 'greenwood'], revealAll: true });
    const spy = addChar(s, 'peter_prioleau', 'B', 0, 'gate', false);
    spy.plantedBy = 'A';
    expect(charInfluence(s, spy)).toBe(charDef('peter_prioleau').influence - 1);
  });
  it('Mansa Musa keeps his +1 in Africa through home ground', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['accra_ghana', 'gary_indiana', 'greenwood'], revealAll: true });
    const mm = addChar(s, 'mansa_musa', 'A', 0, 'inside');
    expect(charInfluence(s, mm)).toBe(charDef('mansa_musa').influence + 1);
  });
  it('Sleeping Car Porters are Inside from the play beat on: the replay never shows them at the Gates', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'greenwood', 'harpers_ferry'], revealAll: true, handA: ['sleeping_car_porters'], handB: [] });
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'sleeping_car_porters', location: 0 }] }, B: pass() }, { trace: true });
    const play = out.trace!.find((t) => t.kind === 'play' && t.cardId === 'sleeping_car_porters')!;
    const uid = play.uids![0];
    expect(play.state.characters[uid].zone).toBe('inside');
    expect(out.trace!.some((t) => t.kind === 'enter' && t.uids?.includes(uid))).toBe(false);
    expect(out.state.characters[uid].zone).toBe('inside');
  });
});

describe('history moves twice', () => {
  it('a second random Threat arrives on Turn 5 in roughly 60% of matches', () => {
    let hits = 0;
    const N = 120;
    for (let seed = 1; seed <= N; seed++) {
      let s = createMatch({ seed });
      // Pass through Turns 1–4; count Threats spawned by the Turn 5 wave alone (timed and reveal spawns are per Location, so compare counts).
      for (let t = 0; t < 4; t++) s = resolveTurn(s, { A: pass(), B: pass() }).state;
      expect(s.turn).toBe(5);
      const events = s.lastEvents.filter((e) => e.type === 'threatSpawned');
      if (events.length) hits++;
    }
    expect(hits / N).toBeGreaterThan(0.4);
    expect(hits / N).toBeLessThan(0.8);
  });
});

describe('Tom Bass', () => {
  it('holds opposing Characters at his Location; Harriet still leaves', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['gary_indiana', 'greenwood', 'harpers_ferry'], revealAll: true });
    addChar(s, 'tom_bass', 'A', 0, 'inside');
    const held = addChar(s, 'og', 'B', 0, 'inside');
    const harriet = addChar(s, 'harriet_tubman', 'B', 0, 'inside');
    const free = addChar(s, 'organizer', 'B', 1, 'inside');
    const friend = addChar(s, 'organizer', 'A', 0, 'inside');
    expect(lockReason(s, held)).toMatch(/Tom Bass/);
    expect(lockReason(s, harriet)).toBeNull();
    expect(lockReason(s, free)).toBeNull();
    expect(lockReason(s, friend)).toBeNull();
    const opts = legalOptions(s, 'B');
    expect(opts.relocations.some((r) => r.uid === held.uid)).toBe(false);
    expect(opts.relocations.some((r) => r.uid === harriet.uid)).toBe(true);
    // The plan is refused too.
    expect(validatePlan(s, 'B', { ...pass(), relocations: [{ uid: held.uid, to: 1 }] }).length).toBeGreaterThan(0);
  });
});
