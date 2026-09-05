/**
 * Read-only queries over GameState: Influence, Force, capacity, legal actions.
 */
import { charDef, cardDef, LOCATION_BY_ID, THREAT_BY_ID } from './content';
import type {
  GameState,
  PlayerId,
  CharacterInstance,
  ThreatInstance,
  TurnPlan,
  EstablishedEffect,
  LocationDef,
} from './types';
import { GATE_CAPACITY, INSIDE_CAPACITY, PLAYERS, other, MAX_STAKES } from './types';

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
  if (c.zone === 'inside') {
    if (ldef?.effect.type === 'insideInfluence') v += ldef.effect.amount;
    for (const d of hasEstablished(state, c.owner, c.location, 'auraInfluenceOthersHere')) {
      if (d.uid !== c.uid) v += amountOf(d);
    }
    for (const m of hasEstablished(state, c.owner, c.location, 'blessNextEstablished')) {
      if (m.blessedUid === c.uid) v += amountOf(m);
    }
  } else {
    if (threatActiveFor(state, c.location, 'zeroGateInfluence', c.owner)) return 0;
    for (const z of hasEstablished(state, c.owner, c.location, 'gateInfluenceHere')) v += amountOf(z);
    for (const o of hasEstablished(state, other(c.owner), c.location, 'opposingGateInfluence')) v -= amountOf(o);
  }
  return Math.max(0, v);
}

/** Raw Influence per player at a Location, before leader-based modifiers. */
export function rawInfluence(state: GameState, location: number, p: PlayerId): number {
  let v = state.locations[location].tempInfluence[p] ?? 0;
  for (const c of charsAt(state, location, p)) v += charInfluence(state, c);
  return v;
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
  for (const n of hasEstablished(state, c.owner, c.location, 'forceAuraHere')) f += amountOf(n);
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

export function relocationsAllowed(state: GameState, p: PlayerId): number {
  let n = 1;
  for (const c of hasEstablishedAnywhere(state, p, 'extraRelocation')) n += amountOf(c);
  return n;
}

export function isBlockedFromEntering(state: GameState, c: CharacterInstance): string | null {
  if (hasEstablished(state, c.owner, c.location, 'noBlockHere').length) return null;
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
  needsTarget?: 'friendlyGateCharAndLocation';
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
  confronts: ConfrontOption[];
  canStand: boolean;
  proposedStakes: number;
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
    .filter((c) => c.zone === 'inside')
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
  const canStand = !ps.standUsed && state.stakes < MAX_STAKES && !state.pendingStand;
  return {
    plays,
    enters,
    relocations,
    relocationsAllowed: relocationsAllowed(state, p),
    confronts,
    canStand,
    proposedStakes: Math.min(MAX_STAKES, state.stakes * 2),
  };
}

/** Returns a list of problems; an empty list means the plan is legal. */
export function validatePlan(state: GameState, p: PlayerId, plan: TurnPlan): string[] {
  const errors: string[] = [];
  const opts = legalOptions(state, p);
  if (plan.play) {
    const opt = opts.plays.find((o) => o.cardId === plan.play!.cardId);
    if (!opt) errors.push('That card cannot be played.');
    else if (!opt.locations.includes(plan.play.location)) errors.push('That Location is not available for this card.');
    if (opt?.needsTarget && plan.play.target?.charUid) {
      const c = state.characters[plan.play.target.charUid];
      if (!c || c.owner !== p || c.zone !== 'gate') errors.push('Invalid target Character.');
      if (plan.play.target.location === undefined || plan.play.target.location === c?.location) errors.push('Choose a different destination.');
    }
  }
  for (const uid of plan.enters) {
    if (!opts.enters.includes(uid)) errors.push('A Character selected to enter is not Ready.');
  }
  if (plan.relocations.length > opts.relocationsAllowed) errors.push(`Only ${opts.relocationsAllowed} Relocation(s) allowed this turn.`);
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
  return errors;
}

export function totalForce(state: GameState, p: PlayerId): number {
  return charsOf(state, p).reduce((s, c) => s + charDef(c.defId).force, 0);
}

export function playerOrder(state: GameState): PlayerId[] {
  return state.initiative === 'A' ? ['A', 'B'] : ['B', 'A'];
}

export { PLAYERS };
