/**
 * Deterministic simultaneous-turn resolution.
 *
 * Input: GameState + both players' hidden plans. Output: next GameState + ordered events.
 * Order (per design brief §70):
 *   1 Location reveal · 2 new plays & Reveal abilities · 3 forced movement from Reveals
 *   4 voluntary Relocations · 5 Gate→Inside · 6 Enter effects · 7 Established recalculation
 *   8 Threat actions · 9 Assists · 10 cleanup · 11 Influence update
 */
import { charDef, cardDef, eventDef, LOCATION_BY_ID, THREAT_BY_ID } from './content';
import { nextFloat, pick } from './rng';
import { drawCard, locName, spawnThreat, startTurn } from './setup';
import {
  charsAt,
  charsOf,
  charInfluence,
  confrontForce,
  gateOpen,
  hasEstablished,
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
  validatePlan,
} from './query';
import type { CharacterInstance, GameEvent, GameState, MatchResult, PlayerId, ResolveOutput, ThreatInstance, TurnPlan } from './types';
import { MAX_STAKES, PLAYERS, TURNS, other, emptyPlan } from './types';

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
  if (state.players[c.owner].defendedLocation === c.location) return true;
  if (hasEstablished(state, c.owner, c.location, 'noDisplaceHere').length) return true;
  if (c.relocatedTurn === state.turn && hasEstablishedAnywhere(state, c.owner, 'relocatedNoDisplace').length) return true;
  return false;
}

/** Move a Character to another Location's Gate (random open one). Returns false if nowhere to go. */
function displace(state: GameState, c: CharacterInstance, reason: string, events: GameEvent[], to?: number): boolean {
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
  if (!insideOpen(state, c.location, c.owner)) return false;
  c.zone = 'inside';
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
      if (!c.ready) {
        c.ready = true;
        events.push({ type: 'ready', text: `${name(state, c)} is Ready (${def.name}).`, uid: c.uid });
      }
    }
  }
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

function resolveReveal(state: GameState, c: CharacterInstance, plan: TurnPlan, events: GameEvent[], confronts: PendingConfront[]): void {
  const def = charDef(c.defId);
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
      const t = plan.play?.target;
      const target = t?.charUid ? state.characters[t.charUid] : undefined;
      if (!target || target.owner !== p || target.zone !== 'gate' || t?.location === undefined || t.location === target.location) {
        say('no Character to move.');
        break;
      }
      if (!gateOpen(state, t.location, p) || state.locations[t.location].lost) {
        say(`the Gate at ${locName(state, t.location)} is not open.`);
        break;
      }
      const from = target.location;
      target.location = t.location;
      target.relocatedTurn = state.turn;
      if (LOCATION_BY_ID[state.locations[t.location].defId]?.effect.type === 'readyOnArrival' && state.locations[t.location].revealed) target.ready = true;
      say(`moves ${charDef(target.defId).name} from ${locName(state, from)} to the Gates of ${locName(state, t.location)}, waiting progress preserved.`);
      events.push({ type: 'moved', text: '', uid: target.uid, location: t.location, data: { from, to: t.location, reason: 'Harriet' } });
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
      events.push({ type: 'reveal', text: `${def.name}: privately learns that Location ${next + 1} reveals next.`, uid: c.uid, player: p, privateTo: p, data: { next } });
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
    case 'draw': {
      for (let i = 0; i < eff.count; i++) drawCard(state, p);
      say(`${state.players[p].handle} draws a card.`);
      break;
    }
    case 'blockOneOpposingGate': {
      const targets = charsAt(state, loc, opp, 'gate').filter((x) => x.ready);
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target) {
        target.blockedEnterTurn = state.turn;
        say(`${charDef(target.defId).name} cannot enter this turn.`);
      } else {
        say('no opposing Ready Character to block.');
      }
      c.unstable = true;
      break;
    }
    case 'blockOpposingGatesHere': {
      const targets = charsAt(state, loc, opp, 'gate');
      for (const t of targets) t.blockedEnterTurn = state.turn;
      say(targets.length ? `${targets.length} opposing Gate Character(s) cannot enter this turn.` : 'no opposing Gate Characters here.');
      break;
    }
    case 'readyFriendly': {
      const here = charsAt(state, loc, p, 'gate').filter((x) => x.uid !== c.uid && !x.ready);
      const anywhere = charsOf(state, p).filter((x) => x.zone === 'gate' && x.uid !== c.uid && !x.ready);
      const target = here[0] ?? anywhere[0];
      if (target) {
        target.ready = true;
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
      const targets = charsAt(state, loc, opp, 'gate');
      const target = targets.sort((a, b) => charDef(b.defId).force - charDef(a.defId).force)[0];
      if (!target) {
        say('no opposing Gate Character to challenge.');
        break;
      }
      const myForce = def.force;
      const theirForce = charDef(target.defId).force;
      if (myForce > theirForce && !isProtected(state, target)) {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and displaces them.`);
        displace(state, target, 'Nzinga', events);
      } else {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and is held off.`);
      }
      break;
    }
    case 'challengeInside': {
      const targets = charsAt(state, loc, opp, 'inside');
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (!target) {
        say('no opposing Established Character to challenge.');
        break;
      }
      const myForce = def.force;
      const theirForce = charDef(target.defId).force;
      if (myForce > theirForce && !isProtected(state, target) && gateOpen(state, loc, opp)) {
        target.zone = 'gate';
        target.ready = false;
        target.arrivedTurn = state.turn;
        target.blessedUid = undefined;
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}); they return to the Gates, Fresh.`);
        events.push({ type: 'moved', text: '', uid: target.uid, location: loc, data: { from: loc, to: loc, reason: 'Toussaint' } });
      } else {
        say(`challenges ${charDef(target.defId).name} (${myForce} vs ${theirForce}) and is held off.`);
      }
      break;
    }
    case 'suppressInside': {
      if (hasEstablished(state, opp, loc, 'noSuppressHere').length) {
        say('the opposing Characters here cannot be Suppressed.');
        break;
      }
      const targets = charsAt(state, loc, opp, 'inside');
      const target = targets.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
      if (target) {
        target.suppressedUntilTurn = state.turn + 1;
        say(`suppresses ${charDef(target.defId).name} until the end of next turn.`);
      } else {
        say('no opposing Established Character to suppress.');
      }
      break;
    }
  }
}

function playEvent(state: GameState, p: PlayerId, plan: TurnPlan, events: GameEvent[]): void {
  const play = plan.play!;
  const def = eventDef(play.cardId);
  const ps = state.players[p];
  events.push({ type: 'eventPlayed', text: `${ps.handle} plays ${def.name}.`, player: p, cardId: def.id, location: def.needsLocation ? play.location : undefined });
  switch (def.effect.type) {
    case 'reparations': {
      const bonus = Math.min(def.effect.max, ps.setbacks);
      const candidates = state.locations.filter((l) => !l.lost);
      if (!candidates.length || bonus === 0) {
        events.push({ type: 'info', text: `${def.name}: no qualifying Setbacks this match.`, player: p });
        break;
      }
      const lowest = candidates
        .map((l) => ({ l, diff: influenceAt(state, l.index)[p] - influenceAt(state, l.index)[other(p)] }))
        .sort((a, b) => a.diff - b.diff)[0].l;
      lowest.tempInfluence[p] += bonus;
      events.push({ type: 'info', text: `${def.name}: +${bonus} Influence at ${locName(state, lowest.index)} this turn (${ps.setbacks} Setbacks).`, player: p, location: lowest.index });
      break;
    }
    case 'communityDefense': {
      ps.defendedLocation = play.location;
      events.push({ type: 'info', text: `${def.name}: ${ps.handle}'s Characters at ${locName(state, play.location)} are protected this turn.`, player: p, location: play.location });
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
  events.push({ type: 'stepOff', text: `${state.players[p].handle} steps off. ${state.players[other(p)].handle} wins ${state.stakes} Stake(s).`, player: p });
}

/** Resolve a full turn. Never mutates `input`. Illegal plans are replaced by a pass. */
export function resolveTurn(input: GameState, plansIn: Record<PlayerId, TurnPlan>): ResolveOutput {
  const state = cloneState(input);
  const events: GameEvent[] = [];
  if (state.phase !== 'planning') throw new Error(`Cannot resolve in phase ${state.phase}`);
  const plans: Record<PlayerId, TurnPlan> = { A: plansIn.A, B: plansIn.B };
  for (const p of PLAYERS) {
    const errs = validatePlan(state, p, plans[p]);
    if (errs.length) {
      events.push({ type: 'info', text: `${state.players[p].handle}'s plan was illegal (${errs[0]}) and became a pass.`, player: p });
      plans[p] = { ...emptyPlan(), stepOff: plans[p].stepOff };
    }
  }
  const order = playerOrder(state);
  state.lastEvents = events;

  // Count offered assists for analytics.
  for (const p of PLAYERS) {
    const offered = legalOptions(state, p).confronts.filter((c) => c.assist).length;
    state.stats.assists[p].offered += offered;
  }

  // ---- 0. Step Off / Stand on Business ----
  for (const p of order) {
    if (plans[p].stepOff) {
      endByStepOff(state, p, events);
      return { state, events };
    }
  }
  const raisers = order.filter((p) => plans[p].standOnBusiness);
  if (raisers.length === 2 && state.stakes === 1) {
    state.stakes = MAX_STAKES;
    for (const p of PLAYERS) state.players[p].standUsed = true;
    state.stats.standTurns.push({ player: raisers[0], turn: state.turn, proposed: MAX_STAKES, accepted: true });
    events.push({ type: 'stand', text: `Both players Stand on Business. The match is now worth ${MAX_STAKES} Stakes.`, data: { stakes: MAX_STAKES } });
  } else if (raisers.length >= 1) {
    const p = raisers[0];
    const proposed = Math.min(MAX_STAKES, state.stakes * 2);
    state.players[p].standUsed = true;
    state.pendingStand = { by: p, proposed };
    events.push({ type: 'stand', text: `${state.players[p].handle} STANDS ON BUSINESS: ${state.stakes} → ${proposed} Stakes.`, player: p, data: { proposed } });
  }

  // ---- 1. Location reveal ----
  if (state.turn <= 3 && state.revealOrder.length) {
    revealLocation(state, state.revealOrder[state.turn - 1], events);
  }
  for (const p of PLAYERS) {
    if (state.players[p].knownNextReveal !== undefined && state.locations[state.players[p].knownNextReveal!].revealed) {
      state.players[p].knownNextReveal = undefined;
    }
  }

  // ---- 2. New plays: placement first, then Reveal abilities in initiative order ----
  const pendingConfronts: PendingConfront[] = [];
  const newChars: { p: PlayerId; c: CharacterInstance }[] = [];
  for (const p of order) {
    const play = plans[p].play;
    if (!play) continue;
    const ps = state.players[p];
    const idx = ps.hand.indexOf(play.cardId);
    if (idx < 0) continue;
    ps.hand.splice(idx, 1);
    state.stats.plays[p].push(play.cardId);
    const def = cardDef(play.cardId);
    if (def.kind === 'event') {
      ps.discard.push(def.id);
      continue;
    }
    if (!gateOpen(state, play.location, p) || state.locations[play.location].lost) {
      ps.discard.push(def.id);
      events.push({ type: 'info', text: `${ps.handle}'s ${def.name} could not be placed and is discarded.`, player: p });
      continue;
    }
    const loc = state.locations[play.location];
    const c: CharacterInstance = {
      uid: `c${state.nextUid++}`,
      defId: def.id,
      owner: p,
      location: play.location,
      zone: 'gate',
      ready: false,
      arrivedTurn: state.turn,
      permInfluence: 0,
      tempInfluence: 0,
      wasHiddenAtCommit: !loc.revealed || loc.revealedTurn === state.turn,
    };
    state.characters[c.uid] = c;
    if (loc.revealed && LOCATION_BY_ID[loc.defId]?.effect.type === 'readyOnArrival') c.ready = true;
    newChars.push({ p, c });
    events.push({
      type: 'played',
      text: `${ps.handle} plays ${def.name} (${def.influence}/${def.force}) at the Gates of ${locName(state, play.location)}.`,
      player: p,
      cardId: def.id,
      uid: c.uid,
      location: play.location,
    });
  }
  for (const p of order) {
    const play = plans[p].play;
    if (play && cardDef(play.cardId).kind === 'event') playEvent(state, p, plans[p], events);
  }
  for (const { p, c } of newChars) {
    resolveReveal(state, c, plans[p], events, pendingConfronts);
  }
  // Direct Entry.
  for (const { c } of newChars) {
    if (!state.characters[c.uid] || c.zone !== 'gate') continue;
    if (charDef(c.defId).keywords.includes('DIRECT_ENTRY')) {
      if (!enterInside(state, c, events, 'enters immediately (Direct Entry) at')) {
        events.push({ type: 'blocked', text: `${name(state, c)} cannot enter: no room Inside.`, uid: c.uid });
      }
    }
  }

  // ---- 4. Voluntary Relocations ----
  for (const p of order) {
    for (const r of plans[p].relocations) {
      const c = state.characters[r.uid];
      if (!c || c.owner !== p || c.zone !== 'inside') continue;
      if (!gateOpen(state, r.to, p) || state.locations[r.to].lost) {
        events.push({ type: 'info', text: `${name(state, c)} cannot relocate: the Gate at ${locName(state, r.to)} is full.`, uid: c.uid });
        continue;
      }
      const from = c.location;
      const outReady =
        hasEstablished(state, p, from, 'relocatedOutReady').length > 0 ||
        (state.locations[from].revealed && LOCATION_BY_ID[state.locations[from].defId]?.effect.type === 'relocatedOutReady');
      c.location = r.to;
      c.zone = 'gate';
      c.ready = outReady;
      c.arrivedTurn = state.turn;
      c.relocatedTurn = state.turn;
      c.blessedUid = undefined;
      state.stats.relocations[p] += 1;
      const dest = state.locations[r.to];
      const destDef = dest.revealed ? LOCATION_BY_ID[dest.defId] : undefined;
      if (destDef?.effect.type === 'readyOnArrival') c.ready = true;
      const byOwner = dest.firstRelocatedByOwner ?? (dest.firstRelocatedByOwner = {});
      if (!byOwner[p]) {
        byOwner[p] = c.uid;
        if (hasEstablished(state, p, r.to, 'readyRelocatedIn').length) c.ready = true;
      }
      events.push({
        type: 'moved',
        text: `${name(state, c)} relocates from ${locName(state, from)} to the Gates of ${locName(state, r.to)}${c.ready ? ' and is Ready' : ''}.`,
        uid: c.uid,
        location: r.to,
        player: p,
        data: { from, to: r.to, reason: 'relocation' },
      });
      if (destDef?.effect.type === 'firstRelocatedEnters' && !dest.firstRelocatedThisTurn) {
        dest.firstRelocatedThisTurn = c.uid;
        enterInside(state, c, events, 'enters immediately (Great Migration) at');
      }
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
    }
  }

  // ---- 8/9. Threats: confrontations, then Threat actions ----
  const forceByThreat = new Map<string, { A: number; B: number; assists: Set<string> }>();
  const addForce = (uid: string, threatUid: string, bonus: number) => {
    const c = state.characters[uid];
    const loc = state.locations.find((l) => l.threats.some((t) => t.uid === threatUid));
    const t = loc?.threats.find((x) => x.uid === threatUid);
    if (!c || !t || c.location !== t.location) return;
    const entry = forceByThreat.get(threatUid) ?? { A: 0, B: 0, assists: new Set<string>() };
    const f = confrontForce(state, c, t, bonus);
    entry[c.owner] += f;
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
      if (f) {
        if (def.requiresBoth) cleared = f.A >= 1 && f.B >= 1;
        else cleared = f.A + f.B >= t.forceRequired;
      }
      if (!cleared) {
        if (f) events.push({ type: 'threatActs', text: `${threatName(state, t)} at ${locName(state, loc.index)} holds (${f.A + f.B}/${t.forceRequired} Force).`, location: loc.index });
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
      }
    }
    loc.threats = remaining;
  }

  // Threat actions.
  for (const loc of state.locations) {
    for (const t of loc.threats.slice()) {
      const def = THREAT_BY_ID[t.defId];
      if (def.effect === 'zeroGateInfluence' && t.target) {
        if (charsAt(state, loc.index, t.target, 'gate').length) setback(state, t.target, `${def.name} silences Gate Characters at ${locName(state, loc.index)}`, events);
      }
      if (def.effect === 'mobDisplace') {
        const leader = leaderAt(state, loc.index);
        if (leader) {
          const victims = charsAt(state, loc.index, leader).filter((c) => !isProtected(state, c));
          const victim = victims.sort((a, b) => charInfluence(state, b) - charInfluence(state, a))[0];
          if (victim) {
            events.push({ type: 'threatActs', text: `${def.name} targets ${name(state, victim)}.`, location: loc.index, uid: victim.uid });
            if (displace(state, victim, def.name, events)) setback(state, leader, `${def.name} displaced ${charDef(victim.defId).name}`, events);
          }
        }
        if (def.lostAfterTurns && state.turn - t.spawnedTurn + 1 >= def.lostAfterTurns && !loc.lost) {
          loc.lost = true;
          events.push({ type: 'locationLost', text: `${locName(state, loc.index)} is LOST. Neither player can win it.`, location: loc.index });
        }
      }
    }
  }

  // ---- 10. Cleanup ----
  // Unstable Characters (Karen) may wander.
  for (const c of Object.values(state.characters)) {
    if (c.unstable && c.arrivedTurn < state.turn && nextFloat(state.rng) < 0.5) {
      displace(state, c, 'unstable', events);
    }
  }
  // Fresh → Ready.
  for (const c of Object.values(state.characters)) {
    if (c.zone !== 'gate' || c.ready) continue;
    const loc = state.locations[c.location];
    const ldef = loc.revealed ? LOCATION_BY_ID[loc.defId] : undefined;
    const organized = hasEstablished(state, c.owner, c.location, 'freshReadyHere').length > 0;
    if (c.arrivedTurn < state.turn || organized || ldef?.effect.type === 'readyOnArrival') {
      c.ready = true;
      events.push({ type: 'ready', text: `${name(state, c)} is Ready to enter ${locName(state, c.location)}.`, uid: c.uid, player: c.owner });
    }
  }
  // Sundown Town displaces Fresh Gate Characters.
  for (const loc of state.locations) {
    if (!loc.revealed || LOCATION_BY_ID[loc.defId]?.effect.type !== 'displaceFreshAtEnd') continue;
    for (const c of charsAt(state, loc.index, undefined, 'gate')) {
      if (c.ready || isProtected(state, c)) continue;
      if (displace(state, c, 'Sundown Town', events)) setback(state, c.owner, 'displaced by Sundown Town', events);
    }
  }

  // ---- 11. Influence update & analytics ----
  const leaders = state.locations.map((l) => (l.lost ? null : leaderAt(state, l.index)));
  const prev = state.leadHistory[state.leadHistory.length - 1];
  if (prev) {
    for (let i = 0; i < 3; i++) {
      if (prev.leaders[i] !== leaders[i] && prev.leaders[i] !== null && leaders[i] !== null) {
        state.stats.leadChanges += 1;
        if (state.turn === TURNS) state.stats.finalTurnFlips += 1;
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

  if (state.turn >= TURNS) {
    finalize(state, events);
    if (state.pendingStand) {
      // A raise on the final turn resolves at the final stakes; the responder is asked first.
      state.phase = 'standResponse';
    }
  } else if (state.pendingStand) {
    state.phase = 'standResponse';
  } else {
    clearTemporary(state);
    startTurn(state, events);
  }
  return { state, events };
}

function clearTemporary(state: GameState): void {
  for (const c of Object.values(state.characters)) c.tempInfluence = 0;
  for (const l of state.locations) l.tempInfluence = { A: 0, B: 0 };
}

/** The responder answers a Stand on Business. */
export function respondToStand(input: GameState, responder: PlayerId, continueMatch: boolean): ResolveOutput {
  const state = cloneState(input);
  const events: GameEvent[] = [];
  state.lastEvents = events;
  if (state.phase !== 'standResponse' || !state.pendingStand || state.pendingStand.by === responder) {
    throw new Error('No Stand on Business to respond to.');
  }
  const { by, proposed } = state.pendingStand;
  state.pendingStand = undefined;
  if (continueMatch) {
    state.stakes = proposed;
    state.stats.standTurns.push({ player: by, turn: state.turn, proposed, accepted: true });
    events.push({ type: 'standResponse', text: `${state.players[responder].handle} continues. The match is now worth ${proposed} Stakes.`, player: responder, data: { stakes: proposed } });
    if (state.result) {
      state.result.stakes = proposed;
      state.phase = 'ended';
      events.push({ type: 'ended', text: state.result.winner ? `${state.players[state.result.winner].handle} wins the match.` : 'The match is a draw.', data: { result: state.result } });
    } else {
      clearTemporary(state);
      startTurn(state, events);
    }
  } else {
    state.stats.standTurns.push({ player: by, turn: state.turn, proposed, accepted: false });
    events.push({ type: 'standResponse', text: `${state.players[responder].handle} steps off rather than continue at ${proposed} Stakes.`, player: responder });
    endByStepOff(state, responder, events);
  }
  return { state, events };
}

export { isSuppressed };
