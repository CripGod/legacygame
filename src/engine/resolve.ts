/**
 * Deterministic simultaneous-turn resolution.
 *
 * Input: GameState + both players' hidden plans. Output: next GameState + ordered events.
 * Order (per design brief §70):
 *   1 Location reveal · 2 new plays & Reveal abilities · 3 forced movement from Reveals
 *   4 voluntary Relocations · 5 Gate→Inside · 6 Enter effects · 7 Established recalculation
 *   8 Threat actions · 9 Assists · 10 cleanup · 11 Influence update
 */
import { charDef, cardDef, eventDef, LOCATION_BY_ID, THREAT_BY_ID, SUMMON, EVENTS, CARD_BY_ID } from './content';
import { nextFloat, pick } from './rng';
import { drawCard, locName, spawnThreat, startTurn } from './setup';
import {
  charsAt,
  charsOf,
  charInfluence,
  confrontForce,
  gateOpen,
  hasEstablished,
  effectiveStakes,
  hasEstablishedAnywhere,
  influenceAt,
  insideCapacity,
  insideOpen,
  isAssist,
  isBlockedFromEntering,
  isSuppressed,
  leaderAt,
  legalOptions,
  locationWinner,
  playerOrder,
  totalForce,
  threatForceNeeded,
  validatePlan,
  cardCost,
  lockReason,
} from './query';
import type { CharacterDef, CharacterInstance, GameEvent, GameState, MatchResult, PlayAction, PlayerId, ResolveOptions, ResolveOutput, ThreatInstance, TraceStep, TurnPlan } from './types';
import { MAX_STAKES, PLAYERS, EXTENDED_TURNS, MAX_HAND, other, emptyPlan } from './types';
import { GATHERING_DEFS } from './content/characters';

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

function name(state: GameState, c: CharacterInstance): string {
  return `${charDef(c.defId).name} (${state.players[c.owner].handle})`;
}

export function threatName(state: GameState, t: ThreatInstance): string {
  const def = THREAT_BY_ID[t.defId];
  return t.target ? `${def.name} (hunting ${state.players[t.target].handle})` : def.name;
}

function setback(state: GameState, p: PlayerId, reason: string, events: GameEvent[]): void {
  state.players[p].setbacks += 1;
  events.push({ type: 'setback', text: `Setback for ${state.players[p].handle}: ${reason}.`, player: p });
}

function isProtected(state: GameState, c: CharacterInstance): boolean {
  if (state.players[c.owner].defendedTurn === state.turn) return true;
  if (c.protectedTurn === state.turn) return true;
  if (state.locations[c.location].revealed && LOCATION_BY_ID[state.locations[c.location].defId]?.effect.type === 'noDisplace') return true;
  if (hasEstablished(state, c.owner, c.location, 'noDisplaceHere').length) return true;
  if (hasEstablished(state, c.owner, c.location, 'sanctuary').length) return true;
  if (c.relocatedTurn === state.turn && hasEstablishedAnywhere(state, c.owner, 'relocatedNoDisplace').length) return true;
  return false;
}

/** Nanny of the Maroons: opposing Reveal abilities cannot single out your Characters here. */
function shielded(state: GameState, c: CharacterInstance): boolean {
  return hasEstablished(state, c.owner, c.location, 'shieldHere').length > 0;
}

/** Nehanda: a Character that rises again leaves the board for the hand instead of being displaced, and costs 0 next time. */
function riseAgain(state: GameState, c: CharacterInstance, reason: string, events: GameEvent[]): boolean {
  const def = charDef(c.defId);
  if (!def.passive?.risesAgain) return false;
  const ps = state.players[c.owner];
  delete state.characters[c.uid];
  if (ps.hand.length >= MAX_HAND) {
    ps.discard.push(def.id);
    events.push({ type: 'info', text: `${name(state, c)} would rise again, but ${ps.handle}'s hand is full: she is discarded (${reason}).`, uid: c.uid, player: c.owner, location: c.location });
    return true;
  }
  ps.hand.push(def.id);
  ps.discounts = ps.discounts ?? {};
  ps.discounts[def.id] = def.cost;
  events.push({ type: 'moved', text: `${name(state, c)} rises again: instead of being displaced (${reason}) she returns to ${ps.handle}'s hand and costs 0 the next time.`, uid: c.uid, player: c.owner, location: c.location, data: { from: c.location, to: -1, reason: 'risesAgain' } });
  return true;
}

/** One Character (or Threat, Location, Event) acting on another: the story beat the UI replays before the tally. */
type ClashActor = { kind: 'character' | 'threat' | 'location' | 'event'; id: string; owner?: PlayerId; force?: number };
type ClashOutcome = 'displaced' | 'held' | 'blocked' | 'sentBack' | 'suppressed' | 'turned' | 'tricked' | 'rose' | 'hexed' | 'defected';

/** Informants are planted on the other side: never Ready, never Inside. */
function isInformant(c: CharacterInstance): boolean {
  return charDef(c.defId).keywords.includes('INFORMANT');
}
/** Mark a Gate Character Ready, unless it is an Informant (they wait forever). */
function readyUp(c: CharacterInstance): void {
  if (!isInformant(c)) c.ready = true;
}
function clash(state: GameState, events: GameEvent[], actor: ClashActor, victim: CharacterInstance, outcome: ClashOutcome, location: number, extra: { theirForce?: number; from?: number; to?: number; note?: string; intent?: string } = {}): void {
  const vdef = charDef(victim.defId);
  const alive = !!state.characters[victim.uid];
  const out: ClashOutcome = outcome === 'displaced' && !alive ? 'rose' : outcome;
  const who = actor.kind === 'character' ? charDef(actor.id).name : actor.kind === 'threat' ? THREAT_BY_ID[actor.id]?.name ?? actor.id : actor.kind === 'location' ? LOCATION_BY_ID[actor.id]?.name ?? actor.id : eventDef(actor.id).name;
  const vs = actor.force !== undefined && extra.theirForce !== undefined ? ` (${actor.force} Force against ${extra.theirForce})` : '';
  const verb =
    out === 'displaced' ? `beats ${vdef.name}${vs} and knocks them away to the Gates of ${extra.to !== undefined ? locName(state, extra.to) : 'another Location'}`
    : out === 'held' ? `is held off by ${vdef.name}${vs}: nothing moves`
    : out === 'blocked' ? `blocks ${vdef.name}: they cannot go Inside this turn`
    : out === 'sentBack' ? `beats ${vdef.name}${vs}: they lose their seat Inside and wait at the Gates again, Fresh`
    : out === 'suppressed' ? `silences ${vdef.name}: no Influence and no abilities until the end of next turn`
    : out === 'tricked' ? `tricks ${vdef.name}: they were Ready to go Inside, now they wait another turn`
    : out === 'hexed' ? `hexes ${vdef.name}: −${extra.theirForce ?? 2} Influence for the rest of the match`
    : out === 'defected' ? `turns ${vdef.name}: they change sides`
    : `beats ${vdef.name}${vs} and knocks them off the board. ${vdef.name}'s own power: instead of landing at another Location, they go back to ${state.players[victim.owner].handle}'s hand and cost nothing the next time they are played`;
  events.push({
    type: 'clash',
    text: `${who} ${verb}.`,
    location,
    uid: victim.uid,
    player: actor.owner,
    data: {
      actor,
      victim: { uid: victim.uid, defId: victim.defId, owner: victim.owner, force: vdef.force },
      outcome: out,
      from: extra.from ?? location,
      to: extra.to,
      theirForce: extra.theirForce,
      note: extra.note,
    },
  });
}

/** Move a Character to another Location's Gate (random open one). Returns false if nowhere to go. */
function displace(state: GameState, c: CharacterInstance, reason: string, events: GameEvent[], to?: number): boolean {
  if (riseAgain(state, c, reason, events)) return true;
  const options = state.locations
    .filter((l) => l.index !== c.location && !l.lost && gateOpen(state, l.index, c.owner))
    .map((l) => l.index);
  if (!options.length) {
    events.push({ type: 'info', text: `${name(state, c)} could not be displaced: no open Gate.`, uid: c.uid });
    return false;
  }
  const dest = to !== undefined && options.includes(to) ? to : pick(state.rng, options);
  const from = c.location;
  c.location = dest;
  c.zone = 'gate';
  c.ready = false;
  c.arrivedTurn = state.turn;
  c.blessedUid = undefined;
  events.push({
    type: 'moved',
    text: `${name(state, c)} is displaced from ${locName(state, from)} to the Gates of ${locName(state, dest)} (${reason}).`,
    uid: c.uid,
    location: dest,
    data: { from, to: dest, reason },
  });
  return true;
}

function enterInside(state: GameState, c: CharacterInstance, events: GameEvent[], how = 'enters'): boolean {
  if (isInformant(c)) return false;
  if (!insideOpen(state, c.location, c.owner)) return false;
  c.zone = 'inside';
  for (const pulpit of hasEstablished(state, c.owner, c.location, 'drawOnEnterHere')) {
    if (pulpit.uid === c.uid) continue;
    drawCard(state, c.owner, events);
    events.push({ type: 'info', text: `${charDef(pulpit.defId).name}: the congregation grows; ${state.players[c.owner].handle} draws a card.`, uid: pulpit.uid, player: c.owner, location: c.location });
  }
  c.ready = false;
  c.arrivedTurn = state.turn;
  events.push({ type: 'entered', text: `${name(state, c)} ${how} ${locName(state, c.location)}.`, uid: c.uid, location: c.location, player: c.owner });
  // Enter effect: Mansa Musa blesses the next Character established here.
  for (const m of hasEstablished(state, c.owner, c.location, 'blessNextEstablished')) {
    if (m.uid !== c.uid && !m.blessedUid) {
      m.blessedUid = c.uid;
      events.push({ type: 'info', text: `${charDef(m.defId).name} grants +1 Influence to ${charDef(c.defId).name}.`, uid: c.uid });
      break;
    }
  }
  return true;
}

/** A Gathering arrives on its own. Returns the new Character, or null when there is no room. */
function spawnGathering(state: GameState, p: PlayerId, def: CharacterDef, location: number, events: GameEvent[], prefer: 'inside' | 'gate' = 'inside'): CharacterInstance | null {
  const ps = state.players[p];
  if (ps.spawned.includes(def.id)) return null;
  const loc = state.locations[location];
  if (loc.lost) return null;
  const canInside = prefer === 'inside' && insideOpen(state, location, p);
  const canGate = gateOpen(state, location, p);
  if (!canInside && !canGate) return null;
  const zone: 'inside' | 'gate' = canInside ? 'inside' : 'gate';
  const c: CharacterInstance = {
    uid: `c${state.nextUid++}`,
    defId: def.id,
    owner: p,
    location,
    zone,
    ready: true,
    arrivedTurn: state.turn,
    permInfluence: 0,
    tempInfluence: 0,
    wasHiddenAtCommit: false,
  };
  state.characters[c.uid] = c;
  ps.spawned.push(def.id);
  const where = zone === 'inside' ? 'Inside' : 'the Gates of';
  events.push({ type: 'spawned', text: `${def.name} arrives ${where === 'Inside' ? 'Inside' : 'at the Gates of'} ${locName(state, location)} for ${ps.handle}. ${def.spawn?.headline ?? ''}`.trim(), player: p, cardId: def.id, uid: c.uid, location, data: { zone } });
  return c;
}

/** Gatherings whose condition is met arrive now. Called after reveals and at cleanup. */
function checkGatherings(state: GameState, events: GameEvent[], trigger: 'reveal' | 'cleanup', revealedIndex?: number): void {
  const rolled = (id: string, rule: { chance?: number }) => rule.chance === undefined || state.spawnRolls?.[id] === true;
  for (const def of GATHERING_DEFS) {
    const rule = def.spawn;
    if (!rule || !rolled(def.id, rule)) continue;
    for (const p of PLAYERS) {
      if (rule.type === 'onReveal' && trigger === 'reveal' && revealedIndex !== undefined && state.locations[revealedIndex].defId === rule.locationId) {
        spawnGathering(state, p, def, revealedIndex, events, 'gate');
      }
    }
    if (rule.type === 'establishedAt' && trigger === 'cleanup') {
      const loc = state.locations.find((l) => l.revealed && l.defId === rule.locationId);
      if (!loc) continue;
      // Unique Gatherings: one per match, to whoever earns it first (both, if they earn it the same turn).
      if (rule.unique && PLAYERS.some((q) => state.players[q].spawned.includes(def.id))) continue;
      const earned = PLAYERS.filter((q) => charsAt(state, loc.index, q, 'inside').filter((c) => charDef(c.defId).category !== 'gathering').length >= rule.count);
      for (const q of earned) spawnGathering(state, q, def, loc.index, events);
    }
    if (rule.type === 'setAt' && trigger === 'cleanup') {
      const loc = state.locations.find((l) => l.revealed && l.defId === rule.locationId);
      if (!loc) continue;
      for (const q of PLAYERS) {
        const here = charsAt(state, loc.index, q, 'inside').map((c) => c.defId);
        if (rule.cardIds.every((id) => here.includes(id))) spawnGathering(state, q, def, loc.index, events);
      }
    }
  }
  // Cards that come to the hand rather than the board.
  if (trigger === 'cleanup') {
    for (const def of EVENTS) {
      const rule = def.spawn;
      if (!rule || rule.type !== 'insideAt' || !rolled(def.id, rule)) continue;
      const loc = state.locations.find((l) => l.revealed && l.defId === rule.locationId);
      if (!loc) continue;
      for (const q of PLAYERS) {
        const ps = state.players[q];
        if (ps.spawned.includes(def.id)) continue;
        if (charsAt(state, loc.index, q, 'inside').length < rule.count) continue;
        ps.spawned.push(def.id);
        ps.hand.push(def.id);
        events.push({ type: 'spawned', text: `${def.name} come to ${ps.handle}. ${rule.headline}`, player: q, cardId: def.id, location: loc.index, privateTo: q, data: { zone: 'hand' } });
      }
    }
  }
}

function revealLocation(state: GameState, index: number, events: GameEvent[]): void {
  const loc = state.locations[index];
  if (loc.revealed) return;
  loc.revealed = true;
  loc.revealedTurn = state.turn;
  const def = LOCATION_BY_ID[loc.defId];
  events.push({ type: 'locationRevealed', text: `Location ${index + 1} is revealed: ${def?.name ?? 'Unknown'}.`, location: index, data: { defId: loc.defId } });
  if (!def) return;
  if (def.spawnOnReveal) spawnThreat(state, index, def.spawnOnReveal, events);
  if (def.effect.type === 'readyOnArrival') {
    for (const c of charsAt(state, index, undefined, 'gate')) {
      if (!c.ready && !isInformant(c)) {
        readyUp(c);
        events.push({ type: 'ready', text: `${name(state, c)} is Ready (${def.name}).`, uid: c.uid });
      }
    }
  }
  checkGatherings(state, events, 'reveal', index);
  for (const c of charsAt(state, index)) {
    if (c.pendingRevealBonus) {
      c.permInfluence += c.pendingRevealBonus;
      events.push({ type: 'info', text: `${name(state, c)} gains +${c.pendingRevealBonus} Influence as ${def.name} reveals.`, uid: c.uid });
      c.pendingRevealBonus = 0;
    }
  }
  // Timed threats scheduled for this turn or earlier fire on reveal.
  if (def.timedThreat && def.timedThreat.turn <= state.turn) spawnThreat(state, index, def.timedThreat.threatId, events);
}

interface PendingConfront {
  uid: string;
  threatUid: string;
  bonus: number;
}

function resolveReveal(state: GameState, c: CharacterInstance, revealTarget: PlayAction['target'], events: GameEvent[], confronts: PendingConfront[]): void {
  const def = charDef(c.defId);
  if (def.passive?.unstable) c.unstable = true;
  if (!def.reveal) return;
  const p = c.owner;
  const opp = other(p);
  const loc = c.location;
  const eff = def.reveal.effect;
  const say = (text: string) => events.push({ type: 'reveal', text: `${def.name}: ${text}`, uid: c.uid, player: p, location: loc });
  switch (eff.type) {
    case 'none':
      break;
    case 'moveFriendlyGate': {
      const t = revealTarget;
      const target = t?.charUid ? state.characters[t.charUid] : undefined;
      if (!target || target.owner !== p || target.zone !== 'gate' || target.uid === c.uid || t?.location === undefined || t.location === target.location) {
        say('no Gate Character chosen to move.');
        break;
      }
      const held = lockReason(state, target);
      if (held) {
        say(`cannot move ${charDef(target.defId).name}: ${held}.`);
        break;
      }
      if (!gateOpen(state, t.location, p) || state.locations[t.location].lost) {
        say(`the Gate at ${locName(state, t.location)} is not open.`);
        break;
      }
      const from = target.location;
      target.location = t.location;
      target.relocatedTurn = state.turn;
      target.blessedUid = undefined;
      if (LOCATION_BY_ID[state.locations[t.location].defId]?.effect.type === 'readyOnArrival' && state.locations[t.location].revealed) readyUp(target);
      say(`moves ${charDef(target.defId).name} from ${locName(state, from)} to the Gates of ${locName(state, t.location)}${target.ready ? ', still Ready' : ', waiting progress kept'}.`);
      events.push({ type: 'moved', text: '', uid: target.uid, location: t.location, data: { from, to: t.location, reason: 'Smalls' } });
      break;
    }
    case 'conductor': {
      const t = revealTarget;
      const target = t?.charUid ? state.characters[t.charUid] : undefined;
      if (!target || target.owner !== p || target.uid === c.uid || t?.location === undefined || t.location === target.location) {
        say('nobody chosen to conduct.');
        break;
      }
      const roomInside = insideOpen(state, t.location, p) && !isBlockedFromEntering(state, { ...target, location: t.location });
      if (state.locations[t.location].lost || (!roomInside && !gateOpen(state, t.location, p))) {
        say(`${locName(state, t.location)} has no room for ${charDef(target.defId).name}.`);
        break;
      }
      const from = target.location;
      const held = lockReason(state, target);
      target.location = t.location;
      target.relocatedTurn = state.turn;
      target.blessedUid = undefined;
      target.arrivedTurn = state.turn;
      if (roomInside) {
        target.zone = 'inside';
        target.ready = false;
        say(`conducts ${charDef(target.defId).name} ${held ? `out of ${locName(state, from)} (${held}) ` : `from ${locName(state, from)} `}straight Inside ${locName(state, t.location)}.`);
        events.push({ type: 'entered', text: `${name(state, target)} arrives Inside (Harriet) at ${locName(state, t.location)}.`, uid: target.uid, location: t.location, player: p });
      } else {
        target.zone = 'gate';
        readyUp(target);
        say(`conducts ${charDef(target.defId).name} ${held ? `out of ${locName(state, from)} (${held}) ` : `from ${locName(state, from)} `}to the Gates of ${locName(state, t.location)}, Ready: the Inside is full.`);
      }
      events.push({ type: 'moved', text: '', uid: target.uid, location: t.location, data: { from, to: t.location, reason: 'Harriet', freed: !!held, inside: roomInside } });
      break;
    }
    case 'tempInfluenceOther': {
      const others = charsAt(state, loc, p).filter((x) => x.uid !== c.uid);
      if (!others.length) {
        say('no other friendly Character here.');
        break;
      }
      const best = others.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      best.tempInfluence += eff.amount;
      say(`${charDef(best.defId).name} gains +${eff.amount} Influence this turn.`);
      break;
    }
    case 'tempInfluenceAllOthersHere': {
      const others = charsAt(state, loc, p).filter((x) => x.uid !== c.uid);
      for (const o of others) o.tempInfluence += eff.amount;
      say(others.length ? `${others.length} friendly Character(s) here gain +${eff.amount} Influence this turn.` : 'no other friendly Character here.');
      break;
    }
    case 'confrontThreat': {
      const threats = state.locations[loc].threats.filter((t) => !THREAT_BY_ID[t.defId].split || t.target === p || !state.locations[loc].threats.some((o) => o.defId === t.defId && o.target === p));
      const own = threats.find((t) => !isAssist(t, p)) ?? threats[0];
      if (!own) {
        say('no Threat here to confront.');
        break;
      }
      confronts.push({ uid: c.uid, threatUid: own.uid, bonus: eff.bonus });
      say(`confronts ${threatName(state, own)} with +${eff.bonus} Force.`);
      break;
    }
    case 'peekNextReveal': {
      const next = state.revealOrder.find((i) => !state.locations[i].revealed);
      if (next === undefined) {
        say('all Locations are already revealed.');
        break;
      }
      state.players[p].knownNextReveal = next;
      events.push({ type: 'reveal', text: `${def.name}: privately learns that Location ${next + 1} reveals next (it is marked on the board for you).`, uid: c.uid, player: p, privateTo: p, data: { next } });
      break;
    }
    case 'hiddenBonus': {
      if (!c.wasHiddenAtCommit) {
        say('was played into a known Location.');
        break;
      }
      if (state.locations[loc].revealed) {
        c.permInfluence += eff.amount;
        say(`gains +${eff.amount} Influence as the Location reveals.`);
      } else {
        c.pendingRevealBonus = eff.amount;
        say(`will gain +${eff.amount} Influence when this Location reveals.`);
      }
      break;
    }
    case 'holdSeat': {
      c.protectedTurn = state.turn;
      say('keeps her seat: she cannot be displaced this turn.');
      break;
    }
    case 'draw': {
      for (let i = 0; i < eff.count; i++) drawCard(state, p, events);
      say(`${state.players[p].handle} draws a card.`);
      break;
    }
    case 'blockOneOpposingGate': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && x.ready && !shielded(state, x));
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target) {
        target.blockedEnterTurn = state.turn;
        say(`${charDef(target.defId).name} cannot enter this turn.`);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, target, 'blocked', loc, { note: 'Her Reveal picks the opposing Ready Character here with the highest Influence.' });
      } else {
        say('no opposing Ready Character to block.');
      }
      c.unstable = true;
      break;
    }
    case 'blockOpposingGatesHere': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && !shielded(state, x));
      for (const t of targets) {
        t.blockedEnterTurn = state.turn;
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, t, 'blocked', loc, { note: 'His Reveal blocks every opposing Gate Character here this turn.' });
      }
      say(targets.length ? `${targets.length} opposing Gate Character(s) cannot enter this turn.` : 'no opposing Gate Characters here.');
      break;
    }
    case 'readyFriendly': {
      const here = charsAt(state, loc, p, 'gate').filter((x) => x.uid !== c.uid && !x.ready && !isInformant(x));
      const anywhere = charsOf(state, p).filter((x) => x.zone === 'gate' && x.uid !== c.uid && !x.ready && !isInformant(x));
      const target = here[0] ?? anywhere[0];
      if (target) {
        readyUp(target);
        say(`${charDef(target.defId).name} becomes Ready.`);
        events.push({ type: 'ready', text: '', uid: target.uid });
      } else {
        say('no Fresh friendly Character to organize.');
      }
      break;
    }
    case 'weakenThreat': {
      const threats = state.locations[loc].threats.filter((t) => !THREAT_BY_ID[t.defId].split || t.target === p);
      const t = threats.sort((a, b) => b.forceRequired - a.forceRequired)[0] ?? state.locations[loc].threats[0];
      if (t) {
        t.forceRequired = Math.max(1, t.forceRequired - eff.amount);
        say(`${THREAT_BY_ID[t.defId].name} now needs ${t.forceRequired} Force.`);
      } else {
        say('no Threat here to expose.');
      }
      break;
    }
    case 'challengeGate': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && !shielded(state, x));
      const target = targets.sort((a, b) => charDef(b.defId).force - charDef(a.defId).force)[0];
      if (!target) {
        say('no opposing Gate Character to challenge.');
        break;
      }
      const myForce = def.force;
      const theirForce = charDef(target.defId).force;
      const intent = `${def.name} arrived to challenge the opposing Gate Character here with the most Force, ${charDef(target.defId).name}: with more Force, ${def.name} knocks them to another Location.`;
      if (myForce > theirForce && !isProtected(state, target)) {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and displaces them.`);
        displace(state, target, 'Nzinga', events);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: myForce }, target, 'displaced', loc, { theirForce, to: target.location, intent, note: `Force decides: ${myForce} against ${theirForce}.` });
      } else {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and is held off.`);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: myForce }, target, 'held', loc, { theirForce, intent, note: myForce <= theirForce ? `Force decides: ${myForce} is not more than ${theirForce}, so ${charDef(target.defId).name} stays put.` : `${charDef(target.defId).name} is protected this turn, so nothing can move them.` });
      }
      break;
    }
    case 'challengeInside': {
      const targets = charsAt(state, loc, opp, 'inside').filter((x) => !shielded(state, x));
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (!target) {
        say('no opposing Established Character to challenge.');
        break;
      }
      const myForce = def.force;
      const theirForce = charDef(target.defId).force;
      const intent = `${def.name} arrived to challenge the opposing Established Character here with the most Influence, ${charDef(target.defId).name}: with more Force, ${def.name} sends them back to the Gates, Fresh, and their Influence stops counting Inside.`;
      if (myForce > theirForce && !isProtected(state, target) && gateOpen(state, loc, opp)) {
        target.zone = 'gate';
        target.ready = false;
        target.arrivedTurn = state.turn;
        target.blessedUid = undefined;
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}); they return to the Gates, Fresh.`);
        events.push({ type: 'moved', text: '', uid: target.uid, location: loc, data: { from: loc, to: loc, reason: 'Toussaint' } });
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: myForce }, target, 'sentBack', loc, { theirForce, intent, note: `Force decides: ${myForce} against ${theirForce}. They lose their seat Inside and wait at the Gates again.` });
      } else {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and is held off.`);
        const why = myForce <= theirForce ? `Force decides: ${myForce} is not more than ${theirForce}, so ${charDef(target.defId).name} keeps the seat.` : isProtected(state, target) ? `${charDef(target.defId).name} is protected this turn, so nothing can move them.` : `${state.players[opp].handle}'s Gates here are full, so there is nowhere to send ${charDef(target.defId).name}.`;
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: myForce }, target, 'held', loc, { theirForce, intent, note: why });
      }
      break;
    }
    case 'suppressInside': {
      if (hasEstablished(state, opp, loc, 'noSuppressHere').length) {
        say('the opposing Characters here cannot be Suppressed.');
        break;
      }
      const targets = charsAt(state, loc, opp, 'inside').filter((x) => !shielded(state, x));
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target) {
        target.suppressedUntilTurn = state.turn + 1;
        say(`suppresses ${charDef(target.defId).name} until the end of next turn.`);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, target, 'suppressed', loc, { note: 'Her Reveal picks the opposing Established Character here with the highest Influence.' });
      } else {
        say('no opposing Established Character to suppress.');
      }
      break;
    }
    case 'refreshOpposingGate': {
      drawCard(state, p, events);
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && x.ready && !shielded(state, x));
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target && !isProtected(state, target)) {
        target.ready = false;
        target.arrivedTurn = state.turn;
        say(`draws a card and tricks ${charDef(target.defId).name} into waiting again.`);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, target, 'tricked', loc, { note: 'They were Ready; now they are Fresh and wait a turn before they can enter.' });
      } else {
        say('draws a card.');
      }
      break;
    }
    case 'challengeAllGates': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && !shielded(state, x));
      let hits = 0;
      for (const t of targets) {
        if (def.force > charDef(t.defId).force && !isProtected(state, t) && displace(state, t, 'Shango', events)) {
          hits++;
          clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, t, 'displaced', loc, { theirForce: charDef(t.defId).force, to: t.location, note: `Thunder: ${def.force} Force against ${charDef(t.defId).force}.` });
        }
      }
      say(hits ? `thunder displaces ${hits} opposing Gate Character${hits > 1 ? 's' : ''}.` : 'thunder rolls, but nobody here is weaker.');
      break;
    }
    case 'permInfluenceOther': {
      const others = charsAt(state, loc, p).filter((x) => x.uid !== c.uid);
      const best = others.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (best) {
        best.permInfluence += eff.amount;
        say(`${charDef(best.defId).name} gains +${eff.amount} Influence permanently.`);
      } else say('no other friendly Character here.');
      break;
    }
    case 'moveFriendlyInsideHere': {
      const t = revealTarget?.charUid ? state.characters[revealTarget.charUid] : undefined;
      if (!t || t.owner !== p || t.zone !== 'inside' || t.location === loc) {
        say('no Character to bring across.');
        break;
      }
      const from = t.location;
      const roomInside = insideOpen(state, loc, p);
      const roomGate = gateOpen(state, loc, p);
      t.location = loc;
      t.relocatedTurn = state.turn;
      t.blessedUid = undefined;
      if (roomInside) {
        t.zone = 'inside';
        t.arrivedTurn = state.turn;
        say(`brings ${charDef(t.defId).name} across from ${locName(state, from)}, straight Inside.`);
      } else if (roomGate) {
        t.zone = 'gate';
        readyUp(t);
        t.arrivedTurn = state.turn;
        say(`brings ${charDef(t.defId).name} across from ${locName(state, from)} to the Gates, Ready.`);
      } else {
        t.location = from;
        say(`could not bring ${charDef(t.defId).name} across: no room here.`);
        break;
      }
      events.push({ type: 'moved', text: '', uid: t.uid, location: loc, data: { from, to: loc, reason: 'Yemoja' } });
      break;
    }
    case 'confrontAllThreats': {
      const threats = state.locations[loc].threats.filter((t) => !THREAT_BY_ID[t.defId].split || t.target === p);
      if (!threats.length) {
        say('no Threat here to confront.');
        break;
      }
      for (const t of threats) confronts.push({ uid: c.uid, threatUid: t.uid, bonus: eff.bonus });
      say(`confronts every Threat here with +${eff.bonus} Force.`);
      break;
    }
    case 'displaceOpposingGate': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => !isInformant(x) && !shielded(state, x));
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target && !isProtected(state, target)) {
        say(`lures ${charDef(target.defId).name} away.`);
        displace(state, target, 'Mami Wata', events);
        clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, target, 'displaced', loc, { to: target.location, note: 'Her Reveal lures the opposing Gate Character here with the highest Influence. No Force check.' });
      } else say('nobody here to lure.');
      break;
    }
    case 'massEnter': {
      let n = 0;
      for (const x of charsOf(state, p)) {
        if (x.uid === c.uid || x.zone !== 'gate' || state.locations[x.location].lost) continue;
        if (isBlockedFromEntering(state, x)) continue;
        if (enterInside(state, x, events, 'rises and enters (Boukman) at')) n++;
      }
      say(n ? `uprising: ${n} Character${n > 1 ? 's' : ''} at your Gates enter${n > 1 ? '' : 's'} at once, Ready or not.` : 'calls for an uprising, but nobody is waiting at any Gate (or every Inside is full or blocked).');
      break;
    }
    case 'hexGate': {
      const target = charsAt(state, loc, opp, 'gate')
        .filter((x) => !isInformant(x) && !shielded(state, x) && !isProtected(state, x))
        .sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (!target) {
        say('no opposing Gate Character here to hex.');
        break;
      }
      const amount = def.reveal!.effect.type === 'hexGate' ? def.reveal!.effect.amount : 2;
      target.permInfluence -= amount;
      say(`hexes ${charDef(target.defId).name}: −${amount} Influence for the rest of the match.`);
      clash(state, events, { kind: 'character', id: def.id, owner: p, force: def.force }, target, 'hexed', loc, { theirForce: amount, intent: `${def.name} arrived to hex the opposing Gate Character here with the most Influence, ${charDef(target.defId).name}.`, note: 'Gris-gris does not wear off. Only protection stops it.' });
      break;
    }
    case 'returnFriendlyToHand': {
      const target = revealTarget?.charUid ? state.characters[revealTarget.charUid] : undefined;
      if (!target || target.owner !== p || target.zone !== 'inside' || target.uid === c.uid) {
        say('no Established Character chosen to bring home.');
        break;
      }
      const tdef = charDef(target.defId);
      const ps = state.players[p];
      delete state.characters[target.uid];
      if (ps.hand.length >= MAX_HAND) {
        ps.discard.push(tdef.id);
        say(`writes home for ${tdef.name}, but the hand is full: the card is discarded.`);
        break;
      }
      ps.hand.push(tdef.id);
      ps.discounts = ps.discounts ?? {};
      ps.discounts[tdef.id] = tdef.cost;
      drawCard(state, p, events);
      say(`brings ${tdef.name} home from ${locName(state, target.location)}: back in hand and free to play again. ${ps.handle} draws a card.`);
      events.push({ type: 'moved', text: '', uid: target.uid, location: target.location, player: p, data: { from: target.location, to: -1, reason: 'Diallo' } });
      break;
    }
    case 'peekHand': {
      const ids = state.players[opp].hand.filter((id) => id !== 'hidden');
      const names = ids.map((id) => CARD_BY_ID[id]?.name ?? id);
      events.push({
        type: 'info',
        text: `${def.name}: ${state.players[opp].handle} is holding ${names.length ? names.join(', ') : 'nothing'}.`,
        uid: c.uid,
        player: p,
        location: loc,
        privateTo: p,
        data: { peekHand: ids },
      });
      break;
    }
    case 'reduceHandCost': {
      const ps = state.players[p];
      const best = ps.hand
        .filter((id) => cardCost(id, state, p) > 0)
        .sort((a, b) => cardCost(b, state, p) - cardCost(a, state, p))[0];
      if (!best) {
        say('no card in hand left to make cheaper.');
        break;
      }
      ps.discounts = ps.discounts ?? {};
      ps.discounts[best] = (ps.discounts[best] ?? 0) + eff.amount;
      events.push({ type: 'reveal', text: `${def.name}: ${CARD_BY_ID[best]?.name ?? best} in ${ps.handle}'s hand now costs ${eff.amount} less (${cardCost(best, state, p)}).`, uid: c.uid, player: p, location: loc, privateTo: p });
      break;
    }
    case 'monument': {
      if (eff.type !== 'monument') break;
      const mark = (index: number, amount: number, why: string) => {
        const l = state.locations[index];
        l.permInfluence = l.permInfluence ?? { A: 0, B: 0 };
        l.permInfluence[p] += amount;
        events.push({ type: 'info', text: `${def.name}: ${locName(state, index)} gains +${amount} lasting Influence for ${state.players[p].handle} (${why}). It stays even if ${def.short} leaves.`, uid: c.uid, player: p, location: index });
      };
      if (eff.everywhereEstablished) {
        const spots = state.locations.filter((l) => l.revealed && !l.lost && charsAt(state, l.index, p, 'inside').length > 0);
        if (!spots.length) {
          say('no Location where you are Established to paint.');
          break;
        }
        for (const l of spots) mark(l.index, eff.amount, 'a landscape of every place you have settled');
        break;
      }
      let amount = eff.amount;
      if (eff.perOtherHere) {
        const others = charsAt(state, loc, p).filter((x) => x.uid !== c.uid).length;
        amount = Math.min(eff.max ?? 99, eff.amount * others);
        if (amount <= 0) {
          say('nobody here to stitch into the quilt: no lasting Influence.');
          break;
        }
      }
      if (eff.americasBonus && LOCATION_BY_ID[state.locations[loc].defId]?.region === 'americas' && state.locations[loc].revealed) amount += eff.americasBonus;
      mark(loc, amount, eff.perOtherHere ? 'one square per Character beside her' : 'a work that outlasts its maker');
      break;
    }
    case 'dig': {
      if (eff.type !== 'dig') break;
      const ps = state.players[p];
      const top = ps.deck.slice(0, eff.count);
      if (!top.length) {
        say('the deck is empty.');
        break;
      }
      const keep = [...top].sort((a, b) => cardCost(b, state, p) - cardCost(a, state, p))[0];
      ps.deck = ps.deck.slice(top.length);
      ps.deck.push(...top.filter((id) => id !== keep));
      if (ps.hand.length >= MAX_HAND) {
        ps.discard.push(keep);
        events.push({ type: 'info', text: `${ps.handle}'s hand is full (${MAX_HAND}): ${CARD_BY_ID[keep]?.name ?? keep} is discarded.`, player: p });
      } else {
        ps.hand.push(keep);
      }
      ps.deckCount = ps.deck.length;
      events.push({ type: 'reveal', text: `${def.name}: looks at the top ${top.length} card${top.length > 1 ? 's' : ''} of the deck, keeps ${CARD_BY_ID[keep]?.name ?? keep} and puts the rest on the bottom.`, uid: c.uid, player: p, location: loc, privateTo: p });
      break;
    }
    case 'energyNext': {
      if (eff.type !== 'energyNext') break;
      state.players[p].energyBanked = (state.players[p].energyBanked ?? 0) + eff.amount;
      say(`+${eff.amount} Energy next turn.`);
      break;
    }
    case 'nextCharacterDiscount': {
      if (eff.type !== 'nextCharacterDiscount') break;
      state.players[p].nextCharacterDiscount = { amount: eff.amount, since: state.turn };
      say(`the next Character ${state.players[p].handle} plays costs ${eff.amount} less.`);
      break;
    }
    case 'relocationNextTurn': {
      if (eff.type !== 'relocationNextTurn') break;
      state.players[p].relocationsNextTurn = (state.players[p].relocationsNextTurn ?? 0) + eff.amount;
      say(`next turn ${state.players[p].handle} may make ${eff.amount} extra Relocation${eff.amount > 1 ? 's' : ''}.`);
      break;
    }
    case 'drawPerFriendHere': {
      if (eff.type !== 'drawPerFriendHere') break;
      const n = Math.min(eff.max, charsAt(state, loc, p).filter((x) => x.uid !== c.uid).length);
      if (!n) {
        say('nobody else here to recruit: no cards drawn.');
        break;
      }
      for (let i = 0; i < n; i++) drawCard(state, p, events);
      say(`recruits: draws ${n} card${n > 1 ? 's' : ''}, one per friend here.`);
      break;
    }
    case 'sanctuaryReveal': {
      let n = 0;
      for (const x of charsAt(state, loc)) {
        if (x.blockedEnterTurn === state.turn || (x.suppressedUntilTurn !== undefined && x.suppressedUntilTurn >= state.turn)) n++;
        x.blockedEnterTurn = undefined;
        x.suppressedUntilTurn = undefined;
        if (x.zone === 'gate' && !x.ready) {
          if (isInformant(x)) continue;
          readyUp(x);
          n++;
        }
      }
      say(n ? `sanctuary: ${n} Character${n > 1 ? 's' : ''} freed or made Ready.` : 'sanctuary settles over the Location.');
      break;
    }
  }
}

function playEvent(state: GameState, p: PlayerId, play: PlayAction, events: GameEvent[]): void {
  const def = eventDef(play.cardId);
  const ps = state.players[p];
  const at = play.location;
  const here = state.locations[at];
  const hereDef = here.revealed ? LOCATION_BY_ID[here.defId] : undefined;
  events.push({ type: 'eventPlayed', text: `${ps.handle} plays ${def.name} at ${locName(state, at)}.`, player: p, cardId: def.id, location: at });
  switch (def.effect.type) {
    case 'reparations': {
      const base = Math.min(def.effect.max, ps.setbacks);
      const home = hereDef?.region === def.effect.bonus.region ? def.effect.bonus.influence : 0;
      if (base + home === 0) {
        events.push({ type: 'info', text: `${def.name}: no Setbacks this match, and ${locName(state, at)} is not in the Americas.`, player: p, location: at });
        break;
      }
      here.permInfluence = here.permInfluence ?? { A: 0, B: 0 };
      here.permInfluence[p] += base + home;
      events.push({ type: 'info', text: `${def.name}: +${base + home} lasting Influence at ${locName(state, at)} (${ps.setbacks} Setback${ps.setbacks === 1 ? '' : 's'}${home ? `, +${home} in the Americas` : ''}). It counts at the end no matter when it was played.`, player: p, location: at });
      break;
    }
    case 'ancestors': {
      const home = hereDef?.region === def.effect.bonus.region ? def.effect.bonus.influence : 0;
      if (home) here.tempInfluence[p] += home;
      events.push({ type: 'info', text: `${def.name}: ${ps.handle} has been warned.${home ? ` In Africa: +${home} Influence at ${locName(state, at)} this turn.` : ''}`, player: p, location: at });
      break;
    }
    case 'draw': {
      const crowd = charsAt(state, at, p).length >= def.effect.bonus.crowd;
      const n = def.effect.count + (crowd ? def.effect.bonus.extra : 0);
      for (let i = 0; i < n; i++) drawCard(state, p, events);
      events.push({ type: 'info', text: `${def.name}: ${ps.handle} draws ${n} card${n > 1 ? 's' : ''}${crowd ? ` (${def.effect.bonus.crowd}+ Characters at ${locName(state, at)})` : ''}.`, player: p, location: at });
      break;
    }
    case 'communityDefense': {
      ps.defendedLocation = play.location;
      ps.defendedTurn = state.turn;
      events.push({ type: 'info', text: `${def.name}: none of ${ps.handle}'s Characters can be blocked or displaced this turn, and those at ${locName(state, play.location)} confront with +${def.effect.force} Force.`, player: p, location: play.location });
      break;
    }
  }
}

function finalize(state: GameState, events: GameEvent[]): void {
  const locationWinners = state.locations.map((l) => locationWinner(state, l.index));
  const influence: Record<PlayerId, number[]> = { A: [], B: [] };
  for (const l of state.locations) {
    const inf = influenceAt(state, l.index);
    influence.A.push(inf.A);
    influence.B.push(inf.B);
  }
  const won = { A: locationWinners.filter((w) => w === 'A').length, B: locationWinners.filter((w) => w === 'B').length };
  let winner: PlayerId | null = null;
  let reason: MatchResult['reason'] = 'draw';
  if (won.A >= 2 || won.B >= 2 || won.A !== won.B) {
    winner = won.A > won.B ? 'A' : 'B';
    reason = 'locations';
  } else {
    const totA = influence.A.reduce((a, b) => a + b, 0);
    const totB = influence.B.reduce((a, b) => a + b, 0);
    if (totA !== totB) {
      winner = totA > totB ? 'A' : 'B';
      reason = 'tiebreak-influence';
    } else {
      const fA = totalForce(state, 'A');
      const fB = totalForce(state, 'B');
      if (fA !== fB) {
        winner = fA > fB ? 'A' : 'B';
        reason = 'tiebreak-force';
      }
    }
  }
  state.result = { winner, reason, locationWinners, influence, stakes: state.stakes, turn: state.turn };
  state.phase = 'ended';
  events.push({
    type: 'ended',
    text: winner ? `${state.players[winner].handle} wins the match (${won[winner]} Locations).` : 'The match is a draw.',
    data: { result: state.result },
  });
}

function endByStepOff(state: GameState, p: PlayerId, events: GameEvent[]): void {
  const locationWinners = state.locations.map((l) => locationWinner(state, l.index));
  const influence: Record<PlayerId, number[]> = {
    A: state.locations.map((l) => influenceAt(state, l.index).A),
    B: state.locations.map((l) => influenceAt(state, l.index).B),
  };
  state.result = { winner: other(p), reason: 'stepOff', locationWinners, influence, stakes: state.stakes, turn: state.turn };
  state.phase = 'ended';
  state.stats.stepOffTurn = { player: p, turn: state.turn };
  for (const r of state.pendingRaises) {
    const rec = [...state.stats.standTurns].reverse().find((x) => x.player === r.by && x.turn === r.declaredTurn);
    if (rec) rec.accepted = false;
  }
  state.pendingRaises = [];
  events.push({ type: 'stepOff', text: `${state.players[p].handle} steps off. ${state.players[other(p)].handle} wins ${state.stakes} Legacy.`, player: p });
}

/** Resolve a full turn. Never mutates `input`. Illegal plans are replaced by a pass. */
export function resolveTurn(input: GameState, plansIn: Record<PlayerId, TurnPlan>, opts: ResolveOptions = {}): ResolveOutput {
  const state = cloneState(input);
  const events: GameEvent[] = [];
  if (state.phase !== 'planning') throw new Error(`Cannot resolve in phase ${state.phase}`);
  const plans: Record<PlayerId, TurnPlan> = { A: plansIn.A, B: plansIn.B };
  for (const p of PLAYERS) {
    const errs = validatePlan(state, p, plans[p]);
    if (errs.length) {
      events.push({ type: 'info', text: `${state.players[p].handle}'s plan was illegal (${errs[0]}) and became a pass.`, player: p });
      plans[p] = { ...emptyPlan(), stepOff: plans[p].stepOff && !state.players[p].cannotStepOff };
    }
  }
  const order = playerOrder(state);
  state.lastEvents = events;

  // ---- Replay trace: one snapshot per beat, only when asked for ----
  const steps: TraceStep[] = [];
  let mark = 0;
  const allEventPlays = PLAYERS.flatMap((p) => plans[p].plays.filter((pl) => cardDef(pl.cardId).kind === 'event').map((pl) => ({ cardId: pl.cardId, player: p, location: pl.location })));
  const resolvedEvents = new Set<string>();
  const trace = (kind: TraceStep['kind'], label: string, extra: Partial<Pick<TraceStep, 'uids' | 'location' | 'player' | 'cardId'>> = {}, force = false): void => {
    if (!opts.trace) return;
    if (events.length === mark && !force) return;
    const snap = cloneState(state);
    snap.lastEvents = [];
    steps.push({ kind, label, state: snap, events: events.slice(mark), pendingEvents: allEventPlays.filter((e) => !resolvedEvents.has(e.cardId)), ...extra });
    mark = events.length;
  };

  // Count offered assists for analytics.
  for (const p of PLAYERS) {
    const offered = legalOptions(state, p).confronts.filter((c) => c.assist).length;
    state.stats.assists[p].offered += offered;
  }

  // ---- 0. Sit Down / Stand on Business ----
  for (const p of order) {
    if (plans[p].stepOff) {
      endByStepOff(state, p, events);
      return { state, events };
    }
  }
  const raisers = order.filter((p) => plans[p].standOnBusiness);
  for (const p of raisers) {
    const from = effectiveStakes(state);
    state.players[p].standUsed = true;
    state.players[p].cannotStepOff = true;
    state.pendingRaises.push({ by: p, declaredTurn: state.turn });
    const to = effectiveStakes(state);
    state.stats.standTurns.push({ player: p, turn: state.turn, proposed: to, accepted: true });
    const o = other(p);
    const escape = state.players[o].cannotStepOff ? `${state.players[o].handle} already stood, so there is no backing out.` : `${state.players[o].handle} has one turn to Sit Down for ${state.stakes}.`;
    events.push({ type: 'stand', text: `${state.players[p].handle} STANDS ON BUSINESS: ${from} → ${to} Legacy after next turn. ${escape}`, player: p, data: { from, to } });
    if (state.maxTurns < EXTENDED_TURNS) {
      state.maxTurns = EXTENDED_TURNS;
      events.push({ type: 'stand', text: `The match is extended to ${EXTENDED_TURNS} turns.`, data: { maxTurns: EXTENDED_TURNS } });
    }
  }
  if (raisers.length) trace('stand', `${raisers.map((p) => state.players[p].handle).join(' and ')} stand${raisers.length > 1 ? '' : 's'} on business`, { player: raisers[0] });

  // ---- 1. Location reveal ----
  if (state.turn <= 3 && state.revealOrder.length) {
    const idx = state.revealOrder[state.turn - 1];
    revealLocation(state, idx, events);
    trace('reveal', `${locName(state, idx)} is revealed`, { location: idx });
  }
  for (const p of PLAYERS) {
    if (state.players[p].knownNextReveal !== undefined && state.locations[state.players[p].knownNextReveal!].revealed) {
      state.players[p].knownNextReveal = undefined;
    }
  }

  // ---- 2. New plays: placement first, then Reveal abilities in initiative order ----
  const pendingConfronts: PendingConfront[] = [];
  const newChars: { p: PlayerId; c: CharacterInstance; target: PlayAction['target']; enter?: boolean }[] = [];
  const eventPlays: { p: PlayerId; play: PlayAction }[] = [];
  const placementOrder: { p: PlayerId; play: PlayAction }[] = [];
  for (const p of order) for (const play of plans[p].plays) if (!(cardDef(play.cardId).kind === 'character' && (cardDef(play.cardId) as CharacterDef).keywords.includes('INFORMANT'))) placementOrder.push({ p, play });
  for (const p of order) for (const play of plans[p].plays) if (cardDef(play.cardId).kind === 'character' && (cardDef(play.cardId) as CharacterDef).keywords.includes('INFORMANT')) placementOrder.push({ p, play });
  for (const { p, play } of placementOrder) {
    {
    const ps = state.players[p];
    const idx = ps.hand.indexOf(play.cardId);
    if (idx < 0) continue;
    ps.hand.splice(idx, 1);
    if (ps.discounts) delete ps.discounts[play.cardId];
    state.stats.plays[p].push(play.cardId);
    const def = cardDef(play.cardId);
    if (def.kind === 'event') {
      ps.discard.push(def.id);
      eventPlays.push({ p, play });
      continue;
    }
    // Informants need a slot on the other side; everyone else needs one of yours.
    const side = def.keywords.includes('INFORMANT') ? other(p) : p;
    if (!gateOpen(state, play.location, side) || state.locations[play.location].lost) {
      if (def.keywords.includes('INFORMANT') && ps.hand.length < MAX_HAND) {
        ps.hand.push(def.id);
        events.push({ type: 'info', text: `${ps.handle}'s ${def.name} found ${state.players[other(p)].handle}'s Gates at ${locName(state, play.location)} full and goes back to hand.`, player: p, location: play.location });
        continue;
      }
      ps.discard.push(def.id);
      events.push({ type: 'info', text: `${ps.handle}'s ${def.name} could not be placed and is discarded.`, player: p });
      continue;
    }
    const loc = state.locations[play.location];
    const informant = def.keywords.includes('INFORMANT');
    const c: CharacterInstance = {
      uid: `c${state.nextUid++}`,
      defId: def.id,
      owner: informant ? other(p) : p,
      plantedBy: informant ? p : undefined,
      location: play.location,
      zone: 'gate',
      ready: false,
      arrivedTurn: state.turn,
      permInfluence: 0,
      tempInfluence: 0,
      wasHiddenAtCommit: !loc.revealed || loc.revealedTurn === state.turn,
    };
    state.characters[c.uid] = c;
    if (ps.nextCharacterDiscount && state.turn > ps.nextCharacterDiscount.since) ps.nextCharacterDiscount = undefined;
    for (const spider of hasEstablished(state, other(p), play.location, 'drawOnOpposingPlay')) {
      drawCard(state, spider.owner, events);
      events.push({ type: 'info', text: `${charDef(spider.defId).name} spins a story: ${state.players[spider.owner].handle} draws a card.`, uid: spider.uid, player: spider.owner });
    }
    if (informant) {
      events.push({ type: 'played', text: `${ps.handle} plants ${def.name} (${def.influence}/${def.force}) at ${state.players[other(p)].handle}'s Gates of ${locName(state, play.location)}.`, player: p, cardId: def.id, uid: c.uid, location: play.location });
      trace('play', `${ps.handle} plants ${def.name} at ${locName(state, play.location)}`, { uids: [c.uid], location: play.location, player: p, cardId: def.id });
      continue;
    }
    if (loc.revealed && LOCATION_BY_ID[loc.defId]?.effect.type === 'readyOnArrival') readyUp(c);
    if (hasEstablished(state, p, play.location, 'cookout').length) readyUp(c);
    newChars.push({ p, c, target: play.target, enter: play.enter });
    events.push({
      type: 'played',
      text: `${ps.handle} plays ${def.name} (${def.influence}/${def.force}) at the Gates of ${locName(state, play.location)}.`,
      player: p,
      cardId: def.id,
      uid: c.uid,
      location: play.location,
    });
    trace('play', `${ps.handle} plays ${def.name} at ${locName(state, play.location)}`, { uids: [c.uid], location: play.location, player: p, cardId: def.id });
    }
  }
  for (const { p, play } of eventPlays) {
    playEvent(state, p, play, events);
    resolvedEvents.add(play.cardId);
    trace('event', `${state.players[p].handle} plays ${eventDef(play.cardId).name} at ${locName(state, play.location)}`, { location: play.location, player: p, cardId: play.cardId }, true);
  }
  for (const { c, target } of newChars) {
    const before = events.length;
    resolveReveal(state, c, target, events, pendingConfronts);
    if (events.length > before) {
      const said = events.slice(before).find((e) => e.type === 'reveal');
      const touched = events.slice(before).map((e) => e.uid).filter((u): u is string => !!u);
      trace('revealFx', said?.text ?? `${charDef(c.defId).name} reveals`, { uids: [c.uid, ...touched], location: c.location, player: c.owner, cardId: c.defId });
    }
  }
  // Straight Inside always enters; Direct Entry enters when the player chose to.
  for (const { c, enter } of newChars) {
    if (!state.characters[c.uid] || c.zone !== 'gate') continue;
    const kw = charDef(c.defId).keywords;
    if (kw.includes('STRAIGHT_INSIDE') || (kw.includes('DIRECT_ENTRY') && enter)) {
      if (!enterInside(state, c, events, kw.includes('STRAIGHT_INSIDE') ? 'goes straight Inside at' : 'enters immediately (Direct Entry) at')) {
        events.push({ type: 'blocked', text: `${name(state, c)} cannot enter: no room Inside.`, uid: c.uid });
      }
      trace('enter', `${charDef(c.defId).name} goes straight Inside ${locName(state, c.location)}`, { uids: [c.uid], location: c.location, player: c.owner });
    }
  }

  // ---- 4. Voluntary Relocations ----
  for (const p of order) {
    for (const r of plans[p].relocations) {
      const c = state.characters[r.uid];
      if (!c || c.owner !== p) continue;
      if (!gateOpen(state, r.to, p) || state.locations[r.to].lost) {
        events.push({ type: 'info', text: `${name(state, c)} cannot relocate: the Gate at ${locName(state, r.to)} is full.`, uid: c.uid });
        continue;
      }
      const from = c.location;
      const wasGate = c.zone === 'gate';
      const outReady =
        (wasGate && c.ready) ||
        hasEstablished(state, p, from, 'relocatedOutReady').length > 0 ||
        (state.locations[from].revealed && ['relocatedOutReady', 'hub'].includes(LOCATION_BY_ID[state.locations[from].defId]?.effect.type ?? ''));
      const outInside = !wasGate && hasEstablished(state, p, from, 'relocatedOutInside').length > 0 && insideOpen(state, r.to, p);
      c.location = r.to;
      c.zone = 'gate';
      c.ready = outReady && !isInformant(c);
      // A Gate Character keeps its waiting progress; an Inside one starts waiting again.
      if (!wasGate) c.arrivedTurn = state.turn;
      c.relocatedTurn = state.turn;
      c.blessedUid = undefined;
      state.stats.relocations[p] += 1;
      const dest = state.locations[r.to];
      const destDef = dest.revealed ? LOCATION_BY_ID[dest.defId] : undefined;
      if (destDef?.effect.type === 'readyOnArrival' || destDef?.effect.type === 'relocatedInReady') readyUp(c);
      const byOwner = dest.firstRelocatedByOwner ?? (dest.firstRelocatedByOwner = {});
      if (!byOwner[p]) {
        byOwner[p] = c.uid;
        if (hasEstablished(state, p, r.to, 'readyRelocatedIn').length) readyUp(c);
      }
      events.push({
        type: 'moved',
        text: `${name(state, c)} relocates from ${wasGate ? 'the Gates of ' : ''}${locName(state, from)} to the Gates of ${locName(state, r.to)}${c.ready ? (wasGate ? ', still Ready' : ' and is Ready') : ' and waits again'}.`,
        uid: c.uid,
        location: r.to,
        player: p,
        data: { from, to: r.to, reason: 'relocation' },
      });
      const inInside = hasEstablished(state, p, r.to, 'relocatedInInside').length > 0 && insideOpen(state, r.to, p);
      if (outInside || inInside) {
        enterInside(state, c, events, outInside ? 'arrives Inside (Green Book) at' : 'arrives Inside (Yemoja) at');
      } else if (destDef?.effect.type === 'firstRelocatedEnters' && !dest.firstRelocatedThisTurn) {
        dest.firstRelocatedThisTurn = c.uid;
        enterInside(state, c, events, 'enters immediately (Great Migration) at');
      }
      trace('move', `${charDef(c.defId).name} relocates to ${locName(state, r.to)}`, { uids: [c.uid], location: r.to, player: p });
    }
  }

  // ---- 5/6. Gate → Inside ----
  for (const p of order) {
    for (const uid of plans[p].enters) {
      const c = state.characters[uid];
      if (!c || c.owner !== p || c.zone !== 'gate' || !c.ready) continue;
      const blocked = isBlockedFromEntering(state, c);
      if (blocked) {
        events.push({ type: 'blocked', text: `${name(state, c)} cannot enter ${locName(state, c.location)}: ${blocked}.`, uid: c.uid, player: p });
        if (blocked.includes('Patrol')) setback(state, p, 'entry blocked by Segregationist Patrol', events);
        continue;
      }
      if (!insideOpen(state, c.location, p)) {
        const restricted = insideCapacity(state, c.location) < 5;
        events.push({ type: 'blocked', text: `${name(state, c)} cannot enter ${locName(state, c.location)}: no room Inside.`, uid: c.uid, player: p });
        if (restricted) setback(state, p, 'entry blocked by Housing Restriction', events);
        continue;
      }
      enterInside(state, c, events, 'enters');
      trace('enter', `${charDef(c.defId).name} enters ${locName(state, c.location)}`, { uids: [c.uid], location: c.location, player: p });
    }
  }

  // ---- 8/9. Threats: confrontations, then Threat actions ----
  const forceByThreat = new Map<string, { A: number; B: number; assists: Set<string>; fighters: { uid: string; defId: string; owner: PlayerId; force: number }[] }>();
  const addForce = (uid: string, threatUid: string, bonus: number) => {
    const c = state.characters[uid];
    const loc = state.locations.find((l) => l.threats.some((t) => t.uid === threatUid));
    const t = loc?.threats.find((x) => x.uid === threatUid);
    if (!c || !t || c.location !== t.location) return;
    const entry = forceByThreat.get(threatUid) ?? { A: 0, B: 0, assists: new Set<string>(), fighters: [] };
    const f = confrontForce(state, c, t, bonus);
    entry[c.owner] += f;
    entry.fighters.push({ uid, defId: c.defId, owner: c.owner, force: f });
    if (isAssist(t, c.owner)) entry.assists.add(uid);
    forceByThreat.set(threatUid, entry);
    events.push({
      type: 'threatActs',
      text: `${name(state, c)} confronts ${threatName(state, t)} with ${f} Force${isAssist(t, c.owner) ? ' (Assist)' : ''}.`,
      uid: c.uid,
      location: t.location,
      player: c.owner,
    });
  };
  for (const p of order) for (const cf of plans[p].confronts) addForce(cf.uid, cf.threatUid, 0);
  for (const pc of pendingConfronts) addForce(pc.uid, pc.threatUid, pc.bonus);
  for (const loc of state.locations) {
    const remaining: ThreatInstance[] = [];
    for (const t of loc.threats) {
      const def = THREAT_BY_ID[t.defId];
      const f = forceByThreat.get(t.uid);
      let cleared = false;
      const needed = threatForceNeeded(state, t);
      if (f) {
        if (def.requiresBoth) cleared = f.A >= 1 && f.B >= 1;
        else cleared = f.A + f.B >= needed;
      }
      if (f) {
        events.push({
          type: 'showdown',
          text: `Showdown at ${locName(state, loc.index)}: ${f.A + f.B} Force against ${threatName(state, t)}${def.requiresBoth ? ' (both sides needed)' : ` (needs ${needed})`}.`,
          location: loc.index,
          data: { threatUid: t.uid, defId: t.defId, needed, requiresBoth: !!def.requiresBoth, force: { A: f.A, B: f.B }, fighters: f.fighters, cleared },
        });
      }
      if (!cleared) {
        if (f) events.push({ type: 'threatActs', text: `${threatName(state, t)} at ${locName(state, loc.index)} holds (${f.A + f.B}/${needed} Force).`, location: loc.index });
        remaining.push(t);
        continue;
      }
      const by = PLAYERS.filter((p) => (f![p] ?? 0) > 0);
      events.push({ type: 'threatNeutralized', text: `${threatName(state, t)} at ${locName(state, loc.index)} is neutralized.`, location: loc.index, data: { by } });
      for (const uid of f!.assists) {
        const c = state.characters[uid];
        if (!c) continue;
        state.players[c.owner].solidarity += 1;
        state.stats.assists[c.owner].taken += 1;
        events.push({ type: 'info', text: `${name(state, c)} earns Solidarity.`, uid, player: c.owner });
      }
      for (const p of PLAYERS) {
        for (const ida of hasEstablished(state, p, loc.index, 'influenceOnThreatCleared')) {
          const amt = (charDef(ida.defId).established!.effect as { amount: number }).amount;
          ida.permInfluence += amt;
          events.push({ type: 'info', text: `${name(state, ida)} gains +${amt} Influence.`, uid: ida.uid });
        }
        for (const house of hasEstablished(state, p, loc.index, 'drawOnThreatCleared')) {
          const n = (charDef(house.defId).established!.effect as { count: number }).count;
          for (let i = 0; i < n; i++) drawCard(state, p, events);
          events.push({ type: 'info', text: `${name(state, house)}: the association pays out; ${state.players[p].handle} draws ${n} card${n > 1 ? 's' : ''}.`, uid: house.uid, player: p });
        }
      }
    }
    loc.threats = remaining;
    trace('showdown', `Showdown at ${locName(state, loc.index)}`, { location: loc.index });
  }

  // ---- Joint Summon ----
  const sA = plans.A.summon?.location;
  const sB = plans.B.summon?.location;
  if (sA !== undefined && sA === sB) {
    const loc = state.locations[sA];
    const busy = new Set<string>([...plans.A.enters, ...plans.B.enters, ...plans.A.relocations.map((r) => r.uid), ...plans.B.relocations.map((r) => r.uid)]);
    const contrib: Record<PlayerId, number> = { A: 0, B: 0 };
    const pseudo: ThreatInstance = { uid: 'summon', defId: 'comfortable_complicity', location: sA, forceRequired: SUMMON.force, spawnedTurn: state.turn };
    for (const c of charsAt(state, sA)) {
      if (busy.has(c.uid)) continue;
      contrib[c.owner] += confrontForce(state, c, pseudo);
    }
    const total = contrib.A + contrib.B;
    const success = contrib.A >= SUMMON.minEach && contrib.B >= SUMMON.minEach && total >= SUMMON.force && !loc.lost;
    events.push({ type: 'summon', text: `Both players call on ${SUMMON.name} at ${locName(state, sA)}: ${state.players.A.handle} ${contrib.A} Force, ${state.players.B.handle} ${contrib.B} Force (${total}/${SUMMON.force}).`, location: sA, data: { contrib, success } });
    state.stats.summons.push({ turn: state.turn, location: sA, success });
    if (success) {
      loc.sanctified = true;
      loc.pactFailed = false;
      for (const t of loc.threats) events.push({ type: 'threatNeutralized', text: `${threatName(state, t)} at ${locName(state, sA)} dissolves before ${SUMMON.name}.`, location: sA });
      loc.threats = [];
      for (const c of charsAt(state, sA)) c.permInfluence += 1;
      for (const p of PLAYERS) {
        drawCard(state, p, events);
        state.players[p].solidarity += 1;
      }
      events.push({ type: 'summon', text: `${SUMMON.name} manifests at ${locName(state, sA)}. Every Character there gains +1 Influence, both players draw a card, and this Location can never be Lost.`, location: sA, data: { manifest: true } });
    } else {
      loc.pactFailed = true;
      events.push({ type: 'summon', text: `The Summon at ${locName(state, sA)} fails${loc.lost ? '' : `: it needed ${SUMMON.force} Force with at least ${SUMMON.minEach} from each player`}. If this Location is Lost, both players will pay for the broken pact.`, location: sA, data: { manifest: false } });
    }
  } else if (sA !== undefined || sB !== undefined) {
    const by: PlayerId = sA !== undefined ? 'A' : 'B';
    const at = (sA ?? sB)!;
    events.push({ type: 'summon', text: `${state.players[by].handle} called for a Summon at ${locName(state, at)}, but ${state.players[other(by)].handle} did not join.`, location: at, player: by });
  }

  trace('summon', 'Summon', {});

  // Threat actions.
  for (const loc of state.locations) {
    for (const t of loc.threats.slice()) {
      const def = THREAT_BY_ID[t.defId];
      if (def.effect === 'zeroGateInfluence') {
        for (const p of PLAYERS) {
          if (t.target && t.target !== p) continue;
          if (hasEstablished(state, p, loc.index, 'sanctuary').length) continue;
          if (charsAt(state, loc.index, p, 'gate').length) setback(state, p, `${def.name} silences Gate Characters at ${locName(state, loc.index)}`, events);
        }
      }
      if (def.effect === 'mobDisplace') {
        const leader = leaderAt(state, loc.index);
        if (leader) {
          const victims = charsAt(state, loc.index, leader).filter((c) => !isProtected(state, c));
          const victim = victims.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
          if (victim) {
            events.push({ type: 'threatActs', text: `${def.name} targets ${name(state, victim)}.`, location: loc.index, uid: victim.uid });
            if (displace(state, victim, def.name, events)) {
              setback(state, leader, `${def.name} displaced ${charDef(victim.defId).name}`, events);
              clash(state, events, { kind: 'threat', id: def.id }, victim, 'displaced', loc.index, { to: victim.location, note: `${def.name} goes after whoever leads this Location, picking their Character with the highest Influence. A Setback for ${state.players[leader].handle}.` });
            }
          }
        }
        if (def.lostAfterTurns && state.turn - t.spawnedTurn + 1 >= def.lostAfterTurns && !loc.lost && !loc.sanctified) {
          loc.lost = true;
          loc.lostReason = `${def.name} went unanswered for ${def.lostAfterTurns} turns (it needed ${t.forceRequired} Force in one turn, from either player or both).`;
          events.push({ type: 'locationLost', text: `${locName(state, loc.index)} is LOST: ${loc.lostReason} Neither player can win it.`, location: loc.index });
          if (loc.pactFailed) {
            for (const other_ of state.locations) {
              if (other_.index === loc.index) continue;
              other_.permInfluence = other_.permInfluence ?? { A: 0, B: 0 };
              for (const p of PLAYERS) other_.permInfluence[p] -= 1;
            }
            events.push({ type: 'summon', text: `Broken pact: both players lose 1 Influence at each of their other Locations.`, location: loc.index, data: { penalty: true } });
          }
        }
      }
    }
  }

  {
    const acted = events.slice(mark).find((e) => e.type === 'threatActs' || e.type === 'locationLost');
    trace('threat', acted?.text ?? 'Threats act', { location: acted?.location, uids: acted?.uid ? [acted.uid] : undefined });
  }

  // ---- 10. Cleanup ----
  // Unstable Characters (Karen) may wander.
  for (const c of Object.values(state.characters)) {
    if (c.unstable && c.arrivedTurn < state.turn && nextFloat(state.rng) < 0.5) {
      displace(state, c, 'unstable', events);
      trace('move', `${charDef(c.defId).name} wanders off`, { uids: [c.uid], location: c.location, player: c.owner });
    }
  }
  // Gatherings earned this turn arrive before readiness is settled.
  checkGatherings(state, events, 'cleanup');
  trace('spawn', events.slice(mark).find((e) => e.type === 'spawned')?.text ?? 'An arrival', {});
  // Fresh → Ready.
  for (const c of Object.values(state.characters)) {
    if (c.zone !== 'gate' || c.ready || isInformant(c)) continue;
    const loc = state.locations[c.location];
    const ldef = loc.revealed ? LOCATION_BY_ID[loc.defId] : undefined;
    const organized = hasEstablished(state, c.owner, c.location, 'freshReadyHere').length > 0 || hasEstablished(state, c.owner, c.location, 'cookout').length > 0;
    if (c.arrivedTurn < state.turn || organized || ldef?.effect.type === 'readyOnArrival') {
      readyUp(c);
      events.push({ type: 'ready', text: `${name(state, c)} is Ready to enter ${locName(state, c.location)}.`, uid: c.uid, player: c.owner });
    }
  }
  trace('ready', 'Fresh Characters are Ready', {});
  // Carver: the most expensive card in hand ripens.
  for (const p of PLAYERS) {
    const ps = state.players[p];
    for (const _farm of hasEstablishedAnywhere(state, p, 'ripen')) {
      const best = ps.hand.filter((id) => cardCost(id, state, p) > 0).sort((a, b) => cardCost(b, state, p) - cardCost(a, state, p))[0];
      if (!best) break;
      ps.discounts = ps.discounts ?? {};
      ps.discounts[best] = (ps.discounts[best] ?? 0) + 1;
      events.push({ type: 'info', text: `${charDef(_farm.defId).name}: ${CARD_BY_ID[best]?.name ?? best} in ${ps.handle}'s hand now costs ${cardCost(best, state, p)}.`, uid: _farm.uid, player: p, privateTo: p });
    }
  }
  // Tanner: every turn he stays Established, the Location keeps a little more of him.
  for (const p of PLAYERS) {
    for (const painter of hasEstablishedAnywhere(state, p, 'monumentEachTurn')) {
      const eff = charDef(painter.defId).established!.effect;
      if (eff.type !== 'monumentEachTurn') continue;
      const l = state.locations[painter.location];
      if (l.lost) continue;
      l.permInfluence = l.permInfluence ?? { A: 0, B: 0 };
      l.permInfluence[p] += eff.amount;
      events.push({ type: 'info', text: `${charDef(painter.defId).name}: ${locName(state, painter.location)} gains +${eff.amount} lasting Influence for ${state.players[p].handle}.`, uid: painter.uid, player: p, location: painter.location });
    }
  }
  // Oshun: the river fills the shallowest cup.
  for (const p of PLAYERS) {
    for (const river of hasEstablishedAnywhere(state, p, 'growLowestHere')) {
      const eff = charDef(river.defId).established!.effect;
      if (eff.type !== 'growLowestHere') continue;
      const low = charsAt(state, river.location, p).filter((x) => x.uid !== river.uid && !isInformant(x)).sort((a, b) => charInfluence(state, a) - charInfluence(state, b))[0];
      if (!low) continue;
      low.permInfluence += eff.amount;
      events.push({ type: 'info', text: `${charDef(river.defId).name}: ${name(state, low)} gains +${eff.amount} Influence for good.`, uid: low.uid, player: p, location: river.location });
    }
  }
  // Oak Bluffs: a full house Inside pays out Energy next turn. Energy banked by Reveals (Walker) rides along; so do Green's extra Relocations.
  for (const p of PLAYERS) {
    const ps = state.players[p];
    ps.energyNextTurn = ps.energyBanked ?? 0;
    ps.energyBanked = 0;
    ps.relocationsBonus = ps.relocationsNextTurn ?? 0;
    ps.relocationsNextTurn = 0;
  }
  for (const loc of state.locations) {
    const ldef = loc.revealed ? LOCATION_BY_ID[loc.defId] : undefined;
    if (!ldef || ldef.effect.type !== 'restEnergy' || loc.lost) continue;
    for (const p of PLAYERS) {
      if (charsAt(state, loc.index, p, 'inside').length < ldef.effect.count) continue;
      state.players[p].energyNextTurn = (state.players[p].energyNextTurn ?? 0) + ldef.effect.amount;
      events.push({ type: 'info', text: `${ldef.name}: ${state.players[p].handle} has ${ldef.effect.count}+ Characters Inside and gains +${ldef.effect.amount} Energy next turn.`, player: p, location: loc.index });
    }
  }
  trace('info', 'End of turn', {});
  // Sundown Town displaces Fresh Gate Characters.
  for (const loc of state.locations) {
    if (!loc.revealed || LOCATION_BY_ID[loc.defId]?.effect.type !== 'displaceFreshAtEnd') continue;
    if (loc.revealedTurn === state.turn) continue; // nothing happens on the reveal turn
    // John Brown: immune himself, and hides one friendly Character overnight.
    const shelterLeft: Record<PlayerId, number> = { A: 0, B: 0 };
    for (const c of charsAt(state, loc.index)) shelterLeft[c.owner] += charDef(c.defId).passive?.shelter ?? 0;
    const atRisk = charsAt(state, loc.index, undefined, 'gate')
      .filter((c) => !c.ready && !isProtected(state, c) && !charDef(c.defId).passive?.curfewImmune && !isInformant(c))
      .sort((a, b) => charInfluence(state, b) - charInfluence(state, a));
    for (const c of atRisk) {
      if (shelterLeft[c.owner] > 0) {
        shelterLeft[c.owner] -= 1;
        const host = charsAt(state, loc.index, c.owner).find((h) => charDef(h.defId).passive?.shelter);
        events.push({ type: 'info', text: `${charDef(host?.defId ?? c.defId).name} hides ${charDef(c.defId).name} overnight at ${locName(state, loc.index)}.`, uid: c.uid, location: loc.index, player: c.owner });
        continue;
      }
      const fromHere = loc.index;
      if (displace(state, c, 'Sundown Town', events)) {
        setback(state, c.owner, 'displaced by Sundown Town', events);
        clash(state, events, { kind: 'location', id: loc.defId }, c, 'displaced', fromHere, { to: c.location, note: 'Anyone still Fresh at these Gates at the end of the turn is run out of town. A Setback.' });
        trace('sundown', `Sundown Town runs ${charDef(c.defId).name} out`, { uids: [c.uid], location: fromHere, player: c.owner });
      }
    }
  }

  // Charleston, 1822: the Fresh Gate Character here with the lowest Influence changes sides (a tie goes against the leader).
  for (const loc of state.locations) {
    if (!loc.revealed || loc.lost || LOCATION_BY_ID[loc.defId]?.effect.type !== 'turncoatAtEnd') continue;
    if (loc.revealedTurn === state.turn) continue; // nothing happens on the reveal turn
    const inf = influenceAt(state, loc.index);
    const leader: PlayerId | null = inf.A === inf.B ? null : inf.A > inf.B ? 'A' : 'B';
    const fresh = charsAt(state, loc.index, undefined, 'gate').filter((c) => !c.ready && !isProtected(state, c));
    if (!fresh.length) continue;
    fresh.sort((a, b) => charInfluence(state, a) - charInfluence(state, b) || (a.owner === leader ? -1 : b.owner === leader ? 1 : 0) || a.uid.localeCompare(b.uid));
    // An Informant sent back to whoever planted it goes home to their hand; anyone else needs a Gate slot on the receiving side.
    const t = fresh.find((c) => (c.plantedBy !== undefined && c.plantedBy === other(c.owner)) || gateOpen(state, loc.index, other(c.owner)));
    if (!t) {
      events.push({ type: 'info', text: `${locName(state, loc.index)}: ${charDef(fresh[0].defId).name} would change sides, but ${state.players[other(fresh[0].owner)].handle}'s Gates here are full.`, location: loc.index });
      continue;
    }
    const was = charInfluence(state, t);
    const from = t.owner;
    if (t.plantedBy !== undefined && t.plantedBy === other(from)) {
      const home = state.players[t.plantedBy];
      delete state.characters[t.uid];
      if (home.hand.length >= MAX_HAND) {
        home.discard.push(t.defId);
        events.push({ type: 'info', text: `${locName(state, loc.index)}: ${charDef(t.defId).name} is sent back to ${home.handle}, whose hand is full: discarded.`, location: loc.index, player: t.plantedBy });
      } else {
        home.hand.push(t.defId);
        events.push({ type: 'info', text: `${locName(state, loc.index)}: ${charDef(t.defId).name} is found out and sent back to ${home.handle}'s hand.`, location: loc.index, player: t.plantedBy, uid: t.uid });
      }
      clash(state, events, { kind: 'location', id: loc.defId }, t, 'defected', loc.index, { note: `The Informant was the lowest Fresh Gate Character here (${was}). Found out, they go back to ${home.handle}'s hand and can be planted again.` });
      trace('turncoat', `${locName(state, loc.index)}: ${charDef(t.defId).name} is sent home`, { uids: [t.uid], location: loc.index, player: t.plantedBy });
      continue;
    }
    t.owner = other(from);
    t.arrivedTurn = state.turn;
    t.ready = false;
    t.blessedUid = undefined;
    events.push({ type: 'moved', text: '', uid: t.uid, location: loc.index, player: t.owner, data: { from: loc.index, to: loc.index, reason: 'Charleston' } });
    clash(state, events, { kind: 'location', id: loc.defId }, t, 'defected', loc.index, { note: `The Fresh Gate Character here with the lowest Influence changes sides at the end of every turn; ${charDef(t.defId).name} (${was}) was the lowest. They can turn back later.` });
    trace('turncoat', `${locName(state, loc.index)}: ${charDef(t.defId).name} changes sides`, { uids: [t.uid], location: loc.index, player: t.owner });
  }

  // ---- 11. Influence update & analytics ----
  const leaders = state.locations.map((l) => (l.lost ? null : leaderAt(state, l.index)));
  const prev = state.leadHistory[state.leadHistory.length - 1];
  if (prev) {
    for (let i = 0; i < 3; i++) {
      if (prev.leaders[i] !== leaders[i] && prev.leaders[i] !== null && leaders[i] !== null) {
        state.stats.leadChanges += 1;
        if (state.turn === state.maxTurns) state.stats.finalTurnFlips += 1;
      }
    }
  }
  state.leadHistory.push({ turn: state.turn, leaders });
  for (const c of Object.values(state.characters)) {
    if (c.zone === 'gate') state.stats.gateTurns += 1;
    else state.stats.insideTurns += 1;
  }
  for (const l of state.locations) {
    const inf = influenceAt(state, l.index);
    events.push({ type: 'influence', text: `${locName(state, l.index)}: ${state.players.A.handle} ${inf.A} · ${state.players.B.handle} ${inf.B}${l.lost ? ' (LOST)' : ''}.`, location: l.index, data: { A: inf.A, B: inf.B } });
  }
  trace('tally', `Turn ${state.turn} is counted`, {}, true);

  // Raises declared on an earlier turn land now: the other side had a full turn to Sit Down at the old price.
  const landing = state.pendingRaises.filter((r) => r.declaredTurn < state.turn);
  if (landing.length) {
    state.pendingRaises = state.pendingRaises.filter((r) => r.declaredTurn >= state.turn);
    state.stakes = Math.min(MAX_STAKES, state.stakes * 2 ** landing.length);
    events.push({ type: 'stakes', text: `Nobody sat down. The match is now worth ${state.stakes} Legacy.`, data: { stakes: state.stakes } });
    trace('stakes', `The match is now worth ${state.stakes} Legacy`, {});
  }

  if (state.turn >= state.maxTurns) {
    finalize(state, events);
  } else {
    clearTemporary(state);
    startTurn(state, events);
  }
  return { state, events, trace: opts.trace ? steps : undefined };
}

function clearTemporary(state: GameState): void {
  for (const c of Object.values(state.characters)) c.tempInfluence = 0;
  for (const l of state.locations) l.tempInfluence = { A: 0, B: 0 };
}

export { isSuppressed };
