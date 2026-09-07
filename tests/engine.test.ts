import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveTurn,
  viewFor,
  emptyPlan,
  legalOptions,
  validatePlan,
  influenceAt,
  charsOf,
  charsAt,
  LOCATIONS,
  PRESET_DECKS,
  validateDeck,
  threatForceNeeded,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type CharacterInstance,
  charDef,
  MAX_HAND,
  CARD_BY_ID,
  charInfluence,
  spawnThreat,
  type GameEvent,
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
    expect(s.players.A.deckCount).toBe(8);
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
    s2.players.A.hand = ['karen', 'og', 'organizer', 'zora_neale_hurston', 'reparations'];
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
    const cardId = s.players.A.hand.find((c) => c !== 'reparations' && c !== 'community_defense' && c !== 'pullman_porter' && c !== 'bessie_coleman')!;
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
  it('Karen blocks an opposing Ready Character and penalizes the leader', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'juneteenth'], revealAll: true, handB: ['karen'] });
    const mansa = addChar(s, 'mansa_musa', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: { ...pass(), enters: [mansa.uid] }, B: { ...pass(), plays: [{ cardId: 'karen', location: 0 }] } }).state;
    expect(s.characters[mansa.uid].zone).toBe('gate');
    // A leads 5 vs 1 → Karen's presence costs the leader 1.
    expect(influenceAt(s, 0)).toEqual({ A: 4, B: 1 });
  });
  it('Harriet moves a friendly Gate Character preserving readiness', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['harriet_tubman'] });
    const og = addChar(s, 'og', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'harriet_tubman', location: 0, target: { charUid: og.uid, location: 2 } }] }, B: pass() }).state;
    expect(s.characters[og.uid].location).toBe(2);
    expect(s.characters[og.uid].ready).toBe(true);
  });
  it('Direct Entry Characters enter the turn they are played', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handB: ['pullman_porter'] });
    s = resolveTurn(s, { A: pass(), B: { ...pass(), plays: [{ cardId: 'pullman_porter', location: 2 }] } }).state;
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
    const before = influenceAt(s, 1).A;
    const out = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'reparations', location: 0 }] }, B: pass() });
    expect(out.events.some((e) => e.text.includes('Reparations: +1'))).toBe(true);
    expect(before).toBe(0);
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
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // third full turn → LOST
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
    g = resolveTurn(g, { A: pass(), B: pass() }).state; // Mob unresolved 3 turns → Lost
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
    let s = rig(createMatch({ seed: 21 }), { energy: true, locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['karen', 'organizer', 'og', 'mansa_musa'] });
    expect(legalOptions(s, 'A').energy).toBe(1);
    // Turn 1: a 2-cost card is refused, a 1-cost card is fine.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'og', location: 1 }] })).not.toEqual([]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'karen', location: 1 }] })).toEqual([]);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(legalOptions(s, 'A').energy).toBe(2);
    // Turn 2: two 1-cost cards, or one 2-cost card, not both.
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'karen', location: 1 }, { cardId: 'organizer', location: 1 }] })).toEqual([]);
    expect(validatePlan(s, 'A', { ...pass(), plays: [{ cardId: 'og', location: 1 }, { cardId: 'karen', location: 2 }] })).not.toEqual([]);
    addChar(s, 'organizer', 'A', 0, 'inside');
    expect(legalOptions(s, 'A').energy).toBe(3);
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 1 }, { cardId: 'karen', location: 2 }] }, B: pass() }).state;
    expect(charsAt(s, 1, 'A', 'gate')).toHaveLength(1);
    expect(charsAt(s, 2, 'A', 'gate')).toHaveLength(1);
    expect(s.players.A.hand).not.toContain('og');
  });
  it('every deck card has a cost and presets are 13 cards', () => {
    for (const d of Object.values(PRESET_DECKS)) {
      expect(validateDeck(d.cards)).toEqual([]);
      for (const id of d.cards) expect(CARD_BY_ID[id]?.cost ?? 0).toBeGreaterThan(0);
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
  it('The Cookout arrives at Great Migration once you have two Established there, and feeds them', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['great_migration', 'gary_indiana', 'greenwood'], revealAll: true, handA: ['og', 'organizer', 'zora_neale_hurston'] });
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'og', location: 0 }] }, B: pass() }).state;
    s = resolveTurn(s, { A: { ...pass(), plays: [{ cardId: 'organizer', location: 0 }] }, B: pass() }).state;
    const og = Object.values(s.characters).find((c) => c.defId === 'og')!;
    s = resolveTurn(s, { A: { ...pass(), enters: [og.uid] }, B: pass() }).state;
    expect(Object.values(s.characters).some((c) => c.defId === 'cookout')).toBe(false);
    const org = Object.values(s.characters).find((c) => c.defId === 'organizer')!;
    const out = resolveTurn(s, { A: { ...pass(), enters: [org.uid] }, B: pass() });
    const cookout = Object.values(out.state.characters).find((c) => c.defId === 'cookout');
    expect(cookout).toBeDefined();
    expect(cookout!.owner).toBe('A');
    expect(cookout!.zone).toBe('inside');
    expect(out.events.some((e) => e.type === 'spawned' && e.cardId === 'cookout')).toBe(true);
    expect(out.state.players.A.spawned).toContain('cookout');
    // +1 Influence to the other two Established Characters here.
    expect(influenceAt(out.state, 0).A).toBe(charDef('og').influence + charDef('organizer').influence + charDef('cookout').influence + 2);
    // Only once per match.
    const again = resolveTurn(out.state, { A: pass(), B: pass() }).state;
    expect(Object.values(again.characters).filter((c) => c.defId === 'cookout')).toHaveLength(1);
  });
  it('Chairteenth arrives Ready at both players\' Gates when Juneteenth reveals', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['juneteenth', 'gary_indiana', 'greenwood'] });
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
  it('Barber makes departures free; Church Mother wants company', () => {
    const s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'gary_indiana'], revealAll: true });
    s.turn = 4;
    addChar(s, 'barber', 'A', 0, 'inside');
    const a = addChar(s, 'og', 'A', 0, 'inside');
    const b = addChar(s, 'zora_neale_hurston', 'A', 0, 'inside');
    // Two relocations out of the Barber's Location cost nothing against the limit of one.
    expect(validatePlan(s, 'A', { ...pass(), relocations: [{ uid: a.uid, to: 1 }, { uid: b.uid, to: 2 }] })).toEqual([]);
    const mother = addChar(s, 'church_mother', 'A', 1, 'inside');
    expect(charInfluence(s, mother)).toBe(1);
    addChar(s, 'pullman_porter', 'A', 1, 'gate');
    expect(charInfluence(s, mother)).toBe(2);
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
  it('Step Off ends the match immediately', () => {
    const s = createMatch({ seed: 4 });
    const out = resolveTurn(s, { A: { ...pass(), stepOff: true }, B: pass() });
    expect(out.state.phase).toBe('ended');
    expect(out.state.result?.winner).toBe('B');
    expect(out.state.result?.reason).toBe('stepOff');
  });
  it('Stand on Business lands one turn later; the other side can Step Off at the old price first', () => {
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
    // The player who stood cannot back out: a Step Off plan is ignored.
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
    expect(LOCATIONS.filter((l) => !l.notInPool)).toHaveLength(9);
  });
});
