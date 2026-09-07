/**
 * Read-only queries over GameState: Influence, Force, capacity, legal actions.
 */
import { charDef, cardDef, LOCATION_BY_ID, THREAT_BY_ID, CARD_BY_ID } from './content';
import type {
  GameState,
  PlayerId,
  CharacterInstance,
  ThreatInstance,
  TurnPlan,
  EstablishedEffect,
  LocationDef,
} from './types';
import { GATE_CAPACITY, INSIDE_CAPACITY, PLAYERS, other, MAX_STAKES, EXTENDED_TURNS } from './types';

/** The Justice System: a Character that went Inside recently cannot relocate out yet. */
export function isHeldInside(state: GameState, c: CharacterInstance): boolean {
  if (c.zone !== 'inside') return false;
  const loc = state.locations[c.location];
  if (!loc.revealed) return false;
  const eff = LOCATION_BY_ID[loc.defId]?.effect;
  return eff?.type === 'lockInside' && state.turn - c.arrivedTurn <= eff.turns;
}

/** Legacy (the match's worth) once every pending Stand on Business has taken effect. */
export function effectiveStakes(state: GameState): number {
  return Math.min(MAX_STAKES, state.stakes * 2 ** state.pendingRaises.length);
}

export function locDef(state: GameState, index: number): LocationDef {
  const loc = state.locations[index];
  return LOCATION_BY_ID[loc.revealed ? loc.defId : 'unknown'] ?? LOCATION_BY_ID.unknown;
}

export function charsAt(state: GameState, location: number, owner?: PlayerId, zone?: 'gate' | 'inside'): CharacterInstance[] {
  return Object.values(state.characters).filter(
    (c) => c.location === location && (owner === undefined || c.owner === owner) && (zone === undefined || c.zone === zone),
  );
}

export function charsOf(state: GameState, owner: PlayerId): CharacterInstance[] {
  return Object.values(state.characters).filter((c) => c.owner === owner);
}

export function isSuppressed(state: GameState, c: CharacterInstance): boolean {
  return c.suppressedUntilTurn !== undefined && c.suppressedUntilTurn >= state.turn;
}

/** Inside, unsuppressed Characters of `owner` at `location` with an Established effect of `type`. */
export function hasEstablished(state: GameState, owner: PlayerId, location: number, type: EstablishedEffect['type']): CharacterInstance[] {
  return charsAt(state, location, owner, 'inside').filter((c) => {
    if (isSuppressed(state, c)) return false;
    const def = charDef(c.defId);
    return def.established?.effect.type === type;
  });
}

/** Established effects that apply globally for a player (e.g. Katherine, Pullman Porter). */
export function hasEstablishedAnywhere(state: GameState, owner: PlayerId, type: EstablishedEffect['type']): CharacterInstance[] {
  return charsOf(state, owner).filter((c) => {
    if (c.zone !== 'inside' || isSuppressed(state, c)) return false;
    return charDef(c.defId).established?.effect.type === type;
  });
}

export function activeThreats(state: GameState, location: number): ThreatInstance[] {
  return state.locations[location].threats;
}

export function threatActiveFor(state: GameState, location: number, effect: string, player: PlayerId): boolean {
  return state.locations[location].threats.some((t) => {
    const def = THREAT_BY_ID[t.defId];
    return def.effect === effect && (!def.split || t.target === player);
  });
}

export function insideCapacity(state: GameState, location: number): number {
  return threatActiveFor(state, location, 'capacity', 'A') ? 2 : INSIDE_CAPACITY;
}

export function gateOpen(state: GameState, location: number, owner: PlayerId): boolean {
  return charsAt(state, location, owner, 'gate').length < GATE_CAPACITY;
}

export function insideOpen(state: GameState, location: number, owner: PlayerId): boolean {
  return charsAt(state, location, owner, 'inside').length < insideCapacity(state, location);
}

function amountOf(c: CharacterInstance): number {
  const eff = charDef(c.defId).established?.effect as { amount?: number } | undefined;
  return eff?.amount ?? 0;
}

/** Influence contributed by a single Character, including auras. */
export function charInfluence(state: GameState, c: CharacterInstance): number {
  const def = charDef(c.defId);
  let v = def.influence + c.permInfluence + c.tempInfluence;
  const loc = state.locations[c.location];
  const ldef = LOCATION_BY_ID[loc.revealed ? loc.defId : 'unknown'];
  if (ldef?.effect.type === 'steelAndSoul' && charsAt(state, c.location, c.owner).length >= 5) v += ldef.effect.fiveBonus;
  const home = def.passive?.regionBonus;
  if (home && ldef?.region === home.region) v += home.influence;
  if (c.zone === 'inside') {
    if (ldef?.effect.type === 'insideInfluence') v += ldef.effect.amount;
    for (const d of hasEstablished(state, c.owner, c.location, 'auraInfluenceOthersHere')) {
      if (d.uid !== c.uid) v += amountOf(d);
    }
    for (const m of hasEstablished(state, c.owner, c.location, 'blessNextEstablished')) {
      if (m.blessedUid === c.uid) v += amountOf(m);
    }
    for (const k of hasEstablished(state, c.owner, c.location, 'cookout')) {
      if (k.uid !== c.uid) v += amountOf(k);
    }
    for (const m of hasEstablished(state, c.owner, c.location, 'allyBonus')) {
      if (m.uid === c.uid && charsAt(state, c.location, c.owner).length >= 2) v += amountOf(m);
    }
  } else {
    if (threatActiveFor(state, c.location, 'zeroGateInfluence', c.owner) && !hasEstablished(state, c.owner, c.location, 'sanctuary').length) return 0;
    for (const z of hasEstablished(state, c.owner, c.location, 'gateInfluenceHere')) v += amountOf(z);
    for (const o of hasEstablished(state, other(c.owner), c.location, 'opposingGateInfluence')) v -= amountOf(o);
  }
  return Math.max(0, v);
}

/** Raw Influence per player at a Location, before leader-based modifiers. */
export function rawInfluence(state: GameState, location: number, p: PlayerId): number {
  let v = (state.locations[location].tempInfluence[p] ?? 0) + (state.locations[location].permInfluence?.[p] ?? 0);
  for (const c of charsAt(state, location, p)) v += charInfluence(state, c);
  return Math.max(0, v);
}

/** Final Influence for both players at a Location, including Karen and Comfortable Complicity. */
export function influenceAt(state: GameState, location: number): Record<PlayerId, number> {
  const raw = { A: rawInfluence(state, location, 'A'), B: rawInfluence(state, location, 'B') };
  if (raw.A === raw.B) return raw;
  const leader: PlayerId = raw.A > raw.B ? 'A' : 'B';
  let mod = 0;
  for (const c of charsAt(state, location)) {
    const pen = charDef(c.defId).passive?.leaderPenalty;
    if (pen) mod -= pen;
  }
  if (state.locations[location].threats.some((t) => THREAT_BY_ID[t.defId].effect === 'leaderBonus')) mod += 1;
  const out = { ...raw };
  out[leader] = Math.max(0, out[leader] + mod);
  return out;
}

export function leaderAt(state: GameState, location: number): PlayerId | null {
  const inf = influenceAt(state, location);
  if (inf.A === inf.B) return null;
  return inf.A > inf.B ? 'A' : 'B';
}

export function locationWinner(state: GameState, location: number): PlayerId | null | 'lost' {
  if (state.locations[location].lost) return 'lost';
  return leaderAt(state, location);
}

/** Confronting a split Threat that targets the opponent is an Assist. */
export function isAssist(threat: ThreatInstance, p: PlayerId): boolean {
  const def = THREAT_BY_ID[threat.defId];
  return def.split && threat.target !== undefined && threat.target !== p;
}

/** Force a Character contributes when confronting `threat` this turn. */
export function confrontForce(state: GameState, c: CharacterInstance, threat: ThreatInstance, extra = 0): number {
  const def = charDef(c.defId);
  let f = def.force + extra;
  const ldef = locDef(state, c.location);
  if (ldef.effect.type === 'confrontForce') f += ldef.effect.amount;
  if (ldef.effect.type === 'steelAndSoul') f += ldef.effect.force;
  for (const n of hasEstablished(state, c.owner, c.location, 'forceAuraHere')) f += amountOf(n);
  for (const n of hasEstablished(state, c.owner, c.location, 'confrontForceHere')) f += amountOf(n);
  if (state.players[c.owner].defendedLocation === c.location) f += 1;
  if (isAssist(threat, c.owner) && c.zone === 'inside' && !isSuppressed(state, c) && def.established?.effect.type === 'assistForceBonus') {
    f += def.established.effect.amount;
  }
  return f;
}

/** Can `p` confront this threat at all? Split threats: own first, then assist once own is clear. */
export function canConfront(state: GameState, threat: ThreatInstance, p: PlayerId): boolean {
  const def = THREAT_BY_ID[threat.defId];
  if (!def.split) return true;
  if (threat.target === p) return true;
  const own = state.locations[threat.location].threats.find((t) => t.defId === threat.defId && t.target === p);
  return !own;
}

/** Energy this turn: the turn number, plus Organizer-style bonuses. Unspent Energy does not carry over. */
export function energyFor(state: GameState, p: PlayerId): number {
  let n = state.turn + (state.players[p].energyBonus ?? 0);
  for (const c of hasEstablishedAnywhere(state, p, 'extraEnergy')) n += amountOf(c);
  return n;
}

/** Energy cost of a card. */
export function cardCost(cardId: string): number {
  return CARD_BY_ID[cardId]?.cost ?? 0;
}

/** Total Energy a plan spends on plays. */
export function planCost(plan: TurnPlan): number {
  return plan.plays.reduce((s, pl) => s + cardCost(pl.cardId), 0);
}

/** Open Gate slots for `p` at a Location, after `planned` Characters already committed there. */
export function gateRoom(state: GameState, location: number, p: PlayerId, planned = 0): number {
  return GATE_CAPACITY - charsAt(state, location, p, 'gate').length - planned;
}

/** Force a Threat needs this turn, after Ogun-style reductions from either player. */
export function threatForceNeeded(state: GameState, t: ThreatInstance): number {
  let n = t.forceRequired;
  for (const p of PLAYERS) for (const o of hasEstablished(state, p, t.location, 'weakenThreatsHere')) n -= amountOf(o);
  return Math.max(1, n);
}

export function relocationsAllowed(state: GameState, p: PlayerId): number {
  let n = 1;
  for (const c of hasEstablishedAnywhere(state, p, 'extraRelocation')) n += amountOf(c);
  return n;
}

export function isBlockedFromEntering(state: GameState, c: CharacterInstance): string | null {
  if (hasEstablished(state, c.owner, c.location, 'noBlockHere').length) return null;
  if (hasEstablished(state, c.owner, c.location, 'sanctuary').length) return null;
  if (state.players[c.owner].defendedLocation === c.location) return null;
  if (c.blockedEnterTurn === state.turn) return 'blocked by an opposing Character';
  if (threatActiveFor(state, c.location, 'blockEntry', c.owner)) return 'blocked by Segregationist Patrol';
  return null;
}

// ---------- Legal options ----------

export interface PlayOption {
  cardId: string;
  kind: 'character' | 'event';
  locations: number[];
  needsLocation: boolean;
  needsTarget?: 'friendlyGateCharAndLocation' | 'friendlyInsideChar';
  directEntry: boolean;
}

export interface ConfrontOption {
  threatUid: string;
  location: number;
  chars: string[];
  assist: boolean;
}

export interface LegalOptions {
  plays: PlayOption[];
  enters: string[];
  relocations: { uid: string; destinations: number[] }[];
  relocationsAllowed: number;
  /** Energy available this turn. */
  energy: number;
  confronts: ConfrontOption[];
  canStand: boolean;
  canStepOff: boolean;
  proposedStakes: number;
  /** Stakes after pending raises land. */
  pendingStakes: number;
  /** What Stepping Off costs right now (raises land only after the turn resolves). */
  stepOffCost: number;
  /** Locations where a joint Summon may be attempted this turn. */
  summonable: number[];
}

export function legalOptions(state: GameState, p: PlayerId): LegalOptions {
  const ps = state.players[p];
  const plays: PlayOption[] = [];
  const seen = new Set<string>();
  for (const cardId of ps.hand) {
    if (cardId === 'hidden' || seen.has(cardId)) continue;
    seen.add(cardId);
    const def = cardDef(cardId);
    if (def.kind === 'character') {
      const locs = state.locations.filter((l) => !l.lost && gateOpen(state, l.index, p)).map((l) => l.index);
      if (locs.length) {
        plays.push({
          cardId,
          kind: 'character',
          locations: locs,
          needsLocation: true,
          needsTarget: def.reveal?.needsTarget,
          directEntry: def.keywords.includes('DIRECT_ENTRY'),
        });
      }
    } else {
      plays.push({
        cardId,
        kind: 'event',
        locations: def.needsLocation ? state.locations.filter((l) => !l.lost).map((l) => l.index) : [0],
        needsLocation: def.needsLocation,
        directEntry: false,
      });
    }
  }
  const mine = charsOf(state, p);
  const enters = mine.filter((c) => c.zone === 'gate' && c.ready && !state.locations[c.location].lost).map((c) => c.uid);
  const relocations = mine
    .filter((c) => c.zone === 'inside' && !isHeldInside(state, c))
    .map((c) => ({
      uid: c.uid,
      destinations: state.locations
        .filter((l) => l.index !== c.location && !l.lost && gateOpen(state, l.index, p))
        .map((l) => l.index),
    }))
    .filter((r) => r.destinations.length > 0);
  const confronts: ConfrontOption[] = [];
  for (const loc of state.locations) {
    for (const t of loc.threats) {
      if (!canConfront(state, t, p)) continue;
      const chars = mine.filter((c) => c.location === loc.index).map((c) => c.uid);
      if (!chars.length) continue;
      confronts.push({ threatUid: t.uid, location: loc.index, chars, assist: isAssist(t, p) });
    }
  }
  const effective = effectiveStakes(state);
  const canStand = !ps.standUsed && effective < MAX_STAKES && (state.turn < state.maxTurns || state.maxTurns < EXTENDED_TURNS);
  return {
    plays,
    enters,
    relocations,
    relocationsAllowed: relocationsAllowed(state, p),
    energy: energyFor(state, p),
    confronts,
    canStand,
    summonable: state.locations.filter((l) => l.revealed && !l.lost && !l.sanctified && l.threats.length > 0 && mine.some((c) => c.location === l.index)).map((l) => l.index),
    canStepOff: !ps.cannotStepOff,
    proposedStakes: Math.min(MAX_STAKES, effective * 2),
    pendingStakes: effective,
    stepOffCost: state.stakes,
  };
}

/** Returns a list of problems; an empty list means the plan is legal. */
export function validatePlan(state: GameState, p: PlayerId, plan: TurnPlan): string[] {
  const errors: string[] = [];
  const opts = legalOptions(state, p);
  if (planCost(plan) > opts.energy) errors.push(`Not enough Energy: this plan costs ${planCost(plan)} and you have ${opts.energy}.`);
  const usedCards = new Set<string>();
  const gateUse: Record<number, number> = {};
  for (const play of plan.plays) {
    if (usedCards.has(play.cardId)) errors.push('A card can only be played once.');
    usedCards.add(play.cardId);
    const opt = opts.plays.find((o) => o.cardId === play.cardId);
    if (!opt) {
      errors.push('That card cannot be played.');
      continue;
    }
    if (opt.needsLocation && !opt.locations.includes(play.location)) errors.push('That Location is not available for this card.');
    if (opt.kind === 'character') {
      gateUse[play.location] = (gateUse[play.location] ?? 0) + 1;
      if (gateRoom(state, play.location, p, gateUse[play.location] - 1) <= 0) errors.push('No open Gate slot for that card.');
    }
    if (opt.needsTarget === 'friendlyGateCharAndLocation' && play.target?.charUid) {
      const c = state.characters[play.target.charUid];
      if (!c || c.owner !== p || c.zone !== 'gate') errors.push('Invalid target Character.');
      if (play.target.location === undefined || play.target.location === c?.location) errors.push('Choose a different destination.');
    }
    if (opt.needsTarget === 'friendlyInsideChar' && play.target?.charUid) {
      const c = state.characters[play.target.charUid];
      if (!c || c.owner !== p || c.zone !== 'inside' || c.location === play.location) errors.push('Invalid target Character.');
    }
  }
  for (const uid of plan.enters) {
    if (!opts.enters.includes(uid)) errors.push('A Character selected to enter is not Ready.');
  }
  const counted = plan.relocations.filter((r) => {
    const c = state.characters[r.uid];
    return !(c && (locDef(state, c.location).effect.type === 'hub' || hasEstablished(state, c.owner, c.location, 'freeDeparture').length));
  });
  if (counted.length > opts.relocationsAllowed) errors.push(`Only ${opts.relocationsAllowed} Relocation(s) allowed this turn (Lagos departures are free).`);
  for (const r of plan.relocations) {
    const opt = opts.relocations.find((o) => o.uid === r.uid);
    if (!opt || !opt.destinations.includes(r.to)) errors.push('Invalid Relocation.');
  }
  const busy = new Set<string>([...plan.enters, ...plan.relocations.map((r) => r.uid)]);
  const seen = new Set<string>();
  for (const c of plan.confronts) {
    const opt = opts.confronts.find((o) => o.threatUid === c.threatUid);
    if (!opt || !opt.chars.includes(c.uid)) errors.push('Invalid confrontation.');
    if (busy.has(c.uid)) errors.push('A Character cannot confront and move in the same turn.');
    if (seen.has(c.uid)) errors.push('A Character can only confront one Threat per turn.');
    seen.add(c.uid);
  }
  if (plan.standOnBusiness && !opts.canStand) errors.push('Stand on Business is not available.');
  if (plan.stepOff && !opts.canStepOff) errors.push('You Stood on Business: you cannot Step Off.');
  if (plan.summon && !opts.summonable.includes(plan.summon.location)) errors.push('No Summon is possible there.');
  return errors;
}

export function totalForce(state: GameState, p: PlayerId): number {
  return charsOf(state, p).reduce((s, c) => s + charDef(c.defId).force, 0);
}

export function playerOrder(state: GameState): PlayerId[] {
  return state.initiative === 'A' ? ['A', 'B'] : ['B', 'A'];
}

export { PLAYERS };
