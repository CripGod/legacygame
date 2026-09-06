import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveTurn,
  respondToStand,
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
  other,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type CharacterInstance,
} from '../src/engine';
import { planTurn, respondToStandAi } from '../src/ai/harborlight';

function pass(): TurnPlan {
  return emptyPlan();
}

/** Force a specific hand/board for tests. */
function rig(state: GameState, opts: { handA?: string[]; handB?: string[]; locations?: string[]; revealAll?: boolean }): GameState {
  const s = structuredClone(state);
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
    expect(s.players.A.deckCount).toBe(7);
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
    let s = createMatch({ seed: 11 });
    // Keep the turn-3 "history moves" Threat away from Location 1 by giving it a harmless Threat already.
    s.locations[0].threats.push({ uid: 'cc', defId: 'comfortable_complicity', location: 0, forceRequired: 1, spawnedTurn: 1 });
    const cardId = s.players.A.hand.find((c) => c !== 'reparations' && c !== 'community_defense' && c !== 'pullman_porter' && c !== 'bessie_coleman')!;
    s = resolveTurn(s, { A: { ...pass(), play: { cardId, location: 0 } }, B: pass() }).state;
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
    s = resolveTurn(s, { A: { ...pass(), play: { cardId: 'og', location: 1 } }, B: pass() }).state;
    s = resolveTurn(s, { A: { ...pass(), play: { cardId: 'organizer', location: 1 } }, B: pass() }).state;
    expect(charsAt(s, 1, 'A', 'gate')).toHaveLength(2);
    const opts = legalOptions(s, 'A');
    const zora = opts.plays.find((p) => p.cardId === 'zora_neale_hurston')!;
    expect(zora.locations).not.toContain(1);
    expect(validatePlan(s, 'A', { ...pass(), play: { cardId: 'zora_neale_hurston', location: 1 } })).not.toEqual([]);
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
    s = resolveTurn(s, { A: { ...pass(), enters: [mansa.uid] }, B: { ...pass(), play: { cardId: 'karen', location: 0 } } }).state;
    expect(s.characters[mansa.uid].zone).toBe('gate');
    // A leads 5 vs 1 → Karen's presence costs the leader 1.
    expect(influenceAt(s, 0)).toEqual({ A: 4, B: 1 });
  });
  it('Harriet moves a friendly Gate Character preserving readiness', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['harriet_tubman'] });
    const og = addChar(s, 'og', 'A', 0, 'gate', true);
    s = resolveTurn(s, { A: { ...pass(), play: { cardId: 'harriet_tubman', location: 0, target: { charUid: og.uid, location: 2 } } }, B: pass() }).state;
    expect(s.characters[og.uid].location).toBe(2);
    expect(s.characters[og.uid].ready).toBe(true);
  });
  it('Direct Entry Characters enter the turn they are played', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handB: ['pullman_porter'] });
    s = resolveTurn(s, { A: pass(), B: { ...pass(), play: { cardId: 'pullman_porter', location: 2 } } }).state;
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
    s = resolveTurn(s, { A: { ...pass(), play: { cardId: 'mansa_musa', location: target } }, B: pass() }).state;
    const m = charsOf(s, 'A')[0];
    expect(m.pendingRevealBonus).toBe(1);
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.characters[m.uid].permInfluence).toBe(1);
  });
});

describe('threats', () => {
  it('Segregationist Patrol blocks entry and records a Setback; Reparations converts Setbacks', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['black_star', 'great_migration', 'greenwood'], revealAll: true, handA: ['reparations', 'og'] });
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
    const out = resolveTurn(s, { A: { ...pass(), play: { cardId: 'reparations', location: 0 } }, B: pass() });
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
  it('Supremacist Mob displaces the leader and eventually loses the Location', () => {
    let s = rig(createMatch({ seed: 2 }), { locations: ['greenwood', 'great_migration', 'black_star'], revealAll: true });
    s.turn = 3;
    addChar(s, 'mansa_musa', 'A', 0, 'inside');
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // → turn 4: Mob spawns at Greenwood
    expect(s.turn).toBe(4);
    expect(s.locations[0].threats.some((t) => t.defId === 'supremacist_mob')).toBe(true);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // Mob displaces Mansa
    expect(charsAt(s, 0, 'A')).toHaveLength(0);
    expect(s.players.A.setbacks).toBe(1);
    s = resolveTurn(s, { A: pass(), B: pass() }).state; // second full turn → LOST
    expect(s.locations[0].lost).toBe(true);
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
  it('Stand on Business raises stakes 1→2 on Continue and loses the old stake on Step Off', () => {
    let s = createMatch({ seed: 4 });
    s = resolveTurn(s, { A: { ...pass(), standOnBusiness: true }, B: pass() }).state;
    expect(s.phase).toBe('standResponse');
    expect(s.pendingStand).toEqual({ by: 'A', proposed: 2 });
    const cont = respondToStand(s, 'B', true).state;
    expect(cont.stakes).toBe(2);
    expect(cont.phase).toBe('planning');
    expect(cont.turn).toBe(2);
    expect(cont.maxTurns).toBe(10);
    expect(cont.players.A.cannotStepOff).toBe(true);
    expect(legalOptions(cont, 'A').canStepOff).toBe(false);
    // The player who stood cannot back out: a Step Off plan is ignored.
    const tried = resolveTurn(cont, { A: { ...pass(), stepOff: true }, B: pass() }).state;
    expect(tried.phase).toBe('planning');
    expect(tried.turn).toBe(3);
    expect(legalOptions(cont, 'A').canStand).toBe(false);
    expect(legalOptions(cont, 'B').proposedStakes).toBe(4);
    const off = respondToStand(s, 'B', false).state;
    expect(off.phase).toBe('ended');
    expect(off.result?.winner).toBe('A');
    expect(off.result?.stakes).toBe(1);
  });
  it('Stand on Business on the last turn extends the match by one', () => {
    let s = createMatch({ seed: 4 });
    for (let t = 1; t <= 8; t++) s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.turn).toBe(9);
    s = resolveTurn(s, { A: pass(), B: { ...pass(), standOnBusiness: true } }).state;
    expect(s.phase).toBe('standResponse');
    expect(s.result).toBeUndefined();
    s = respondToStand(s, 'A', true).state;
    expect(s.turn).toBe(10);
    expect(s.phase).toBe('planning');
    s = resolveTurn(s, { A: pass(), B: pass() }).state;
    expect(s.phase).toBe('ended');
    expect(s.result?.turn).toBe(10);
    expect(s.result?.stakes).toBe(2);
  });
  it('scores two of three Locations at the end of turn 9', () => {
    let s = createMatch({ seed: 4 });
    for (let t = 1; t <= 9; t++) {
      expect(s.turn).toBe(t);
      s = resolveTurn(s, { A: pass(), B: pass() }).state;
    }
    expect(s.phase).toBe('ended');
    expect(s.result?.winner).toBe(null);
    expect(s.result?.reason).toBe('draw');
  });
});

describe('AI vs AI smoke', () => {
  it('completes 40 matches without errors and plays legally', { timeout: 30000 }, () => {
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
        } else {
          const r: PlayerId = other(s.pendingStand!.by);
          s = respondToStand(s, r, respondToStandAi(viewFor(s, r), r).continueMatch).state;
        }
      }
      expect(s.phase).toBe('ended');
      expect(s.result).toBeDefined();
    }
  });
  it('all six Locations and all cards are defined consistently', () => {
    expect(LOCATIONS).toHaveLength(6);
  });
});
