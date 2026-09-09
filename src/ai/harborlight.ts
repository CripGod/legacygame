/**
 * Harborlight — the prototype AI opponent.
 *
 * Harborlight only ever receives a redacted view (see engine/view.ts): it cannot see
 * the opponent's hand, unrevealed Locations, draw order or RNG state. It evaluates
 * candidate plans by running the real engine on that view with the opponent passing,
 * then scoring the resulting board.
 */
import {
  charDef,
  cardDef,
  charsAt,
  charsOf,
  insideOpen,
  confrontForce,
  emptyPlan,
  gateRoom,
  influenceAt,
  leaderAt,
  legalOptions,
  makeRng,
  nextFloat,
  other,
  resolveTurn,
  THREAT_BY_ID,
  hashSeed,
  type GameState,
  type PlayerId,
  type TurnPlan,
  type PlayAction,
  type ConfrontOption,
  planCost,
  cardCost,
  lockReason,
} from '../engine';

export interface AiCandidate {
  label: string;
  plan: TurnPlan;
  score: number;
  reasons: string[];
}

export interface AiDebug {
  turn: number;
  player: PlayerId;
  considered: AiCandidate[];
  chosen: string;
  primaryReason: string;
  tier: 'best' | 'sensible' | 'imperfect';
  winEstimate: number;
  standDecision: string;
  elapsedMs: number;
}

export interface AiDecision {
  plan: TurnPlan;
  debug: AiDebug;
}

export interface AiTuning {
  bestPick: number; // probability of taking the best plan
  sensiblePick: number; // probability of taking 2nd/3rd best
  standThreshold: number;
  strongStandThreshold: number;
  bluffRate: number;
  continueThreshold: number;
}

export const DEFAULT_TUNING: AiTuning = {
  bestPick: 0.7,
  sensiblePick: 0.2,
  standThreshold: 0.65,
  strongStandThreshold: 0.8,
  bluffRate: 0.07,
  continueThreshold: 0.2,
};

const ESTABLISHED_VALUE: Record<string, number> = {
  bridleHere: 0.8,
  drawOnEnterHere: 0.9,
  drawOnThreatCleared: 0.4,
  growLowestHere: 1.1,
  monumentEachTurn: 1.4,
  auraInfluenceOthersHere: 1.6,
  readyRelocatedIn: 0.8,
  assistForceBonus: 0.3,
  relocatedNoDisplace: 0.4,
  blessNextEstablished: 0.9,
  gateInfluenceHere: 0.8,
  extraRelocation: 0.9,
  extraEnergy: 1.6,
  opposingGateInfluence: 0.9,
  influenceOnThreatCleared: 0.7,
  forceAuraHere: 0.5,
  noDisplaceHere: 0.5,
  relocatedOutReady: 0.7,
  noBlockHere: 0.5,
  noSuppressHere: 0.3,
  relocatedOutInside: 1.2,
  drawOnOpposingPlay: 0.9,
  confrontForceHere: 0.5,
  freshReadyHere: 1.0,
  relocatedInInside: 1.1,
  weakenThreatsHere: 0.5,
  sanctuary: 1.2,
  cookout: 1.8,
  freeDeparture: 0.6,
  allyBonus: 0.7,
  discountCharacters: 1.5,
  discountEvents: 0.4,
  discountTag: 0.8,
  ripen: 0.9,
  shieldHere: 0.8,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Probability-ish that `p` wins each Location, given current Influence and turns left. */
function locationProbabilities(state: GameState, p: PlayerId): number[] {
  const opp = other(p);
  const k = 0.2 + 0.08 * Math.min(state.turn, state.maxTurns);
  return state.locations.map((l) => {
    if (l.lost) return 0;
    const inf = influenceAt(state, l.index);
    const diff = inf[p] - inf[opp];
    if (state.result) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
    return sigmoid(diff * k);
  });
}

function winProbability(probs: number[]): number {
  const [a, b, c] = probs;
  return a * b + a * c + b * c - 2 * a * b * c;
}

export function estimateWinChance(state: GameState, p: PlayerId): number {
  if (state.result) return state.result.winner === p ? 1 : state.result.winner === null ? 0.5 : 0;
  return winProbability(locationProbabilities(state, p));
}

interface Evaluation {
  score: number;
  reasons: string[];
}

export function evaluate(state: GameState, p: PlayerId): Evaluation {
  const opp = other(p);
  const reasons: string[] = [];
  const remaining = Math.max(0, state.maxTurns - state.turn);
  let score = 0;

  if (state.result) {
    const r = state.result.winner === p ? 100 : state.result.winner === null ? 50 : 0;
    score += r;
    reasons.push(`final result ${r}`);
  } else {
    const probs = locationProbabilities(state, p);
    const pw = winProbability(probs);
    score += 100 * pw;
    reasons.push(`win chance ${(pw * 100).toFixed(0)}%`);
  }

  for (const l of state.locations) {
    if (l.lost) continue;
    const inf = influenceAt(state, l.index);
    const diff = inf[p] - inf[opp];
    score += 1.5 * Math.max(-8, Math.min(8, diff));
    if (diff > 7) {
      score -= 0.6 * (diff - 7);
      reasons.push(`overcommitted at L${l.index + 1}`);
    }
    for (const t of l.threats) {
      const def = THREAT_BY_ID[t.defId];
      const mine = charsAt(state, l.index, p);
      if (!mine.length) continue;
      switch (def.effect) {
        case 'blockEntry':
          if (t.target === p && mine.some((c) => c.zone === 'gate')) score -= 2;
          break;
        case 'zeroGateInfluence':
          if (!t.target || t.target === p) score -= 1.5 * mine.filter((c) => c.zone === 'gate').length;
          break;
        case 'capacity':
          score -= 1;
          break;
        case 'mobDisplace': {
          const leader = leaderAt(state, l.index);
          score -= leader === p ? 5 : 1.5;
          if (leader === p) reasons.push(`Mob threatens my lead at L${l.index + 1}`);
          break;
        }
        case 'shipsAway':
          if (mine.some((c) => c.zone === 'gate' && !c.ready)) score -= 2;
          break;
        case 'leaderBonus':
          break;
      }
    }
  }

  // Projected Established value and readiness.
  for (const c of charsOf(state, p)) {
    const def = charDef(c.defId);
    if (c.zone === 'inside') {
      // Inside is safe from Gate-only effects and Established abilities are live.
      score += 0.6;
      if (def.established) score += (ESTABLISHED_VALUE[def.established.effect.type] ?? 0.5) * Math.min(remaining, 3) * 0.5;
    } else if (c.zone === 'gate' && c.ready) {
      score += 0.2;
    }
  }
  // CROWD: a full Gate means no new plays there; the opponent's full Gate is their problem (an Informant makes one).
  for (const l of state.locations) {
    if (l.lost) continue;
    if (charsAt(state, l.index, p, 'gate').length >= 2) {
      score -= 1.5;
      reasons.push(`Gate full at L${l.index + 1}`);
    }
    if (charsAt(state, l.index, opp, 'gate').length >= 2) score += 1.0;
  }
  // Card economy.
  score += 0.25 * state.players[p].hand.length;
  // HELD: a Character that cannot leave is a liability, more so at the Gates where it does nothing but wait.
  for (const c of charsOf(state, p)) {
    if (!lockReason(state, c)) continue;
    score -= c.zone === 'gate' ? 1.0 : 0.6;
    reasons.push('held');
  }
  // Reparations potential.
  if (state.players[p].hand.includes('reparations')) score += 0.4 * Math.min(4, state.players[p].setbacks);
  return { score, reasons };
}

function labelPlan(state: GameState, plan: TurnPlan): string {
  const parts: string[] = [];
  if (plan.plays.length) {
    parts.push(`play ${plan.plays.map((pl) => `${cardDef(pl.cardId).name}→L${pl.location + 1}`).join(' + ')}`);
  } else parts.push('hold');
  if (plan.enters.length) parts.push(`enter ${plan.enters.map((u) => charDef(state.characters[u].defId).short).join(',')}`);
  if (plan.relocations.length) parts.push(`move ${plan.relocations.map((r) => `${charDef(state.characters[r.uid].defId).short}→L${r.to + 1}`).join(',')}`);
  if (plan.confronts.length) parts.push(`confront×${plan.confronts.length}`);
  if (plan.standOnBusiness) parts.push('STAND');
  return parts.join(' · ');
}

function simulate(view: GameState, p: PlayerId, plan: TurnPlan): GameState {
  const plans = { A: emptyPlan(), B: emptyPlan() };
  plans[p] = plan;
  return resolveTurn(view, plans).state;
}

/** Decide confrontations heuristically (before the plan search). */
function decideConfronts(view: GameState, p: PlayerId, rand: () => number, reasons: string[]): { confronts: TurnPlan['confronts']; busy: Set<string> } {
  const opts = legalOptions(view, p);
  const confronts: TurnPlan['confronts'] = [];
  const busy = new Set<string>();
  const opp = other(p);
  const byLocation = new Map<number, ConfrontOption[]>();
  for (const o of opts.confronts) byLocation.set(o.location, [...(byLocation.get(o.location) ?? []), o]);

  for (const [location, options] of byLocation) {
    const leader = leaderAt(view, location);
    const inf = influenceAt(view, location);
    const lead = inf[p] - inf[opp];
    for (const o of options) {
      const threat = view.locations[location].threats.find((t) => t.uid === o.threatUid)!;
      const def = THREAT_BY_ID[threat.defId];
      const available = o.chars
        .filter((u) => !busy.has(u))
        .map((u) => view.characters[u])
        .map((c) => ({ c, f: confrontForce(view, c, threat) }))
        .sort((a, b) => b.f - a.f);
      if (!available.length) continue;
      const total = available.reduce((s, x) => s + x.f, 0);

      if (o.assist) {
        // Helping the opponent clear their own Threat: only when it costs little.
        const spare = lead >= 3;
        const chance = spare ? 0.6 : 0.15;
        if (total >= threat.forceRequired && rand() < chance) {
          let acc = 0;
          for (const x of available) {
            if (acc >= threat.forceRequired) break;
            confronts.push({ uid: x.c.uid, threatUid: threat.uid });
            busy.add(x.c.uid);
            acc += x.f;
          }
          reasons.push(`assists vs ${def.name} at L${location + 1}`);
        }
        continue;
      }

      if (def.requiresBoth) {
        // Comfortable Complicity: the beneficiary usually leaves it alone.
        const benefits = leader === p;
        if (!benefits || rand() < 0.25) {
          const x = available[available.length - 1];
          confronts.push({ uid: x.c.uid, threatUid: threat.uid });
          busy.add(x.c.uid);
          reasons.push(`contributes vs ${def.name} at L${location + 1}`);
        }
        continue;
      }

      const harmsMe =
        def.effect === 'mobDisplace' ? (leader === p ? 3 : 1) : def.effect === 'shipsAway' ? (charsAt(view, threat.location, p, 'gate').some((c) => !c.ready) ? 2 : 1) : def.effect === 'capacity' ? 1 : def.effect === 'blockEntry' ? 2 : def.effect === 'zeroGateInfluence' ? 2 : 1;
      const canAlone = total >= threat.forceRequired;
      const worthTrying = !def.split && total >= threat.forceRequired / 2 && harmsMe >= 2;
      if (canAlone || worthTrying) {
        let acc = 0;
        for (const x of available) {
          if (acc >= threat.forceRequired) break;
          confronts.push({ uid: x.c.uid, threatUid: threat.uid });
          busy.add(x.c.uid);
          acc += x.f;
        }
        reasons.push(`${canAlone ? 'clears' : 'pushes on'} ${def.name} at L${location + 1}`);
      }
    }
  }
  return { confronts, busy };
}

function playVariants(view: GameState, p: PlayerId): PlayAction[] {
  const opts = legalOptions(view, p);
  const out: PlayAction[] = [];
  for (const o of opts.plays) {
    for (const location of o.locations) {
      if (o.needsTarget === 'friendlyCharAndLocation') {
        const gateChars = charsOf(view, p).filter((c) => !charDef(c.defId).keywords.includes('INFORMANT'));
        let added = false;
        for (const c of gateChars) {
          for (const dest of view.locations) {
            if (dest.index === c.location || dest.lost) continue;
            const gate = charsAt(view, dest.index, p, 'gate').length;
            if (gate >= 2 && !insideOpen(view, dest.index, p)) continue;
            out.push({ cardId: o.cardId, location, target: { charUid: c.uid, location: dest.index } });
            added = true;
          }
        }
        if (!added) out.push({ cardId: o.cardId, location });
      } else if (o.needsTarget === 'friendlyInsideChar') {
        const insideChars = charsOf(view, p).filter((c) => c.zone === 'inside' && c.location !== location);
        for (const c of insideChars) out.push({ cardId: o.cardId, location, target: { charUid: c.uid } });
        if (!insideChars.length) out.push({ cardId: o.cardId, location });
      } else {
        out.push({ cardId: o.cardId, location });
        if (o.directEntry) out.push({ cardId: o.cardId, location, enter: true });
      }
    }
  }
  return out;
}

/** Would Harborlight propose a Summon this turn, and where? */
export function aiSummonProposal(view: GameState, p: PlayerId): number | null {
  const opts = legalOptions(view, p);
  const rng = makeRng(hashSeed(`${view.seed}:${view.turn}:${p}:summon`));
  for (const i of opts.summonable) {
    const loc = view.locations[i];
    const dangerous = loc.threats.some((t) => THREAT_BY_ID[t.defId].lostAfterTurns);
    const myForce = charsAt(view, i, p).reduce((s, c) => s + charDef(c.defId).force, 0);
    const theirForce = charsAt(view, i, other(p)).reduce((s, c) => s + charDef(c.defId).force, 0);
    if (myForce < 1 || theirForce < 1) continue;
    if (dangerous || (myForce + theirForce >= 6 && nextFloat(rng) < 0.35)) return i;
  }
  return null;
}

/** Should Harborlight accept a proposed Summon? */
export function aiAcceptSummon(view: GameState, p: PlayerId, location: number): boolean {
  const opts = legalOptions(view, p);
  if (!opts.summonable.includes(location)) return false;
  const loc = view.locations[location];
  const rng = makeRng(hashSeed(`${view.seed}:${view.turn}:${p}:accept:${location}`));
  const dangerous = loc.threats.some((t) => THREAT_BY_ID[t.defId].lostAfterTurns);
  const myForce = charsAt(view, location, p).reduce((s, c) => s + charDef(c.defId).force, 0);
  const theirForce = charsAt(view, location, other(p)).reduce((s, c) => s + charDef(c.defId).force, 0);
  if (myForce + theirForce < 6) return nextFloat(rng) < 0.15; // long shot, rarely
  if (dangerous) return true;
  return nextFloat(rng) < 0.6;
}

export function planTurn(view: GameState, p: PlayerId, tuning: AiTuning = DEFAULT_TUNING, agreedSummon?: number): AiDecision {
  const t0 = Date.now();
  const rng = makeRng(hashSeed(`${view.seed}:${view.turn}:${p}:ai`));
  const rand = () => nextFloat(rng);
  const globalReasons: string[] = [];
  const { confronts, busy } = decideConfronts(view, p, rand, globalReasons);
  const opts = legalOptions(view, p);
  if (agreedSummon !== undefined && opts.summonable.includes(agreedSummon)) {
    for (const c of charsOf(view, p)) if (c.location === agreedSummon) busy.add(c.uid);
    globalReasons.push(`joins the Summon at L${agreedSummon + 1}`);
  }

  const readyUids = opts.enters.filter((u) => !busy.has(u));
  const enterVariants: string[][] = [[]];
  if (readyUids.length) enterVariants.push(readyUids);
  if (readyUids.length > 1) for (const u of readyUids) enterVariants.push([u]);

  const relocVariants: TurnPlan['relocations'][] = [[]];
  for (const r of opts.relocations) {
    if (busy.has(r.uid)) continue;
    for (const to of r.destinations) relocVariants.push([{ uid: r.uid, to }]);
  }

  const plays = playVariants(view, p);
  const hiddenBonus = new Map<number, number>();
  for (const l of view.locations) {
    if (l.revealed) continue;
    let bonus = charsAt(view, l.index, p).length === 0 ? 0.8 : 0;
    if (view.players[p].knownNextReveal === l.index) bonus += 0.5;
    bonus += (rand() - 0.5) * 1.5; // gamble noise: no hidden knowledge
    hiddenBonus.set(l.index, bonus);
  }

  const scoreOf = (plan: TurnPlan): AiCandidate => {
    const next = simulate(view, p, plan);
    const ev = evaluate(next, p);
    let score = ev.score;
    const reasons = [...ev.reasons];
    for (const pl of plan.plays) {
      const pd = cardDef(pl.cardId);
      if (pd.kind !== 'character' || pd.keywords.includes('INFORMANT')) continue;
      const hb = hiddenBonus.get(pl.location);
      if (hb !== undefined) {
        score += hb;
        reasons.push('hidden gamble');
      }
    }
    // Harriet's rescue: pulling a held Character out is worth more than the plain move the simulation sees.
    for (const pl of plan.plays) {
      const def = cardDef(pl.cardId);
      if (def.kind !== 'character' || def.reveal?.effect.type !== 'conductor' || !pl.target?.charUid) continue;
      const t = view.characters[pl.target.charUid];
      if (t && lockReason(view, t)) {
        score += 1.5;
        reasons.push('rescue');
      }
    }
    const spent = planCost(plan, view, p);
    const cheapestLeft = Math.min(...opts.plays.filter((o) => !plan.plays.some((pl) => pl.cardId === o.cardId)).map((o) => cardCost(o.cardId, view, p)), Infinity);
    if (opts.energy - spent >= cheapestLeft) {
      score -= 1.2 * (opts.energy - spent);
      reasons.push('unspent Energy');
    }
    return { label: labelPlan(view, plan), plan, score, reasons };
  };

  // Stage 1: single plays with the default "enter everything" posture.
  const defaultEnters = enterVariants[enterVariants.length > 1 ? 1 : 0];
  const affordable = plays.filter((play) => cardCost(play.cardId, view, p) <= opts.energy);
  const singles: AiCandidate[] = affordable.map((play) => scoreOf({ plays: [play], enters: defaultEnters, relocations: [], confronts }));
  singles.sort((a, b) => b.score - a.score);
  const playSets: PlayAction[][] = [[], ...singles.slice(0, 6).map((c) => c.plan.plays)];
  /** Gate slots per Location: every Character takes one. Events have their own slot: one per Location. */
  const fits = (set: PlayAction[]): boolean => {
    const chars: Record<number, number> = {};
    const planted: Record<number, number> = {};
    const evs: Record<number, number> = {};
    for (const x of set) {
      const d = cardDef(x.cardId);
      if (d.kind !== 'character') evs[x.location] = (evs[x.location] ?? 0) + 1;
      else if (d.keywords.includes('INFORMANT')) planted[x.location] = (planted[x.location] ?? 0) + 1;
      else chars[x.location] = (chars[x.location] ?? 0) + 1;
    }
    for (const x of set) {
      if ((chars[x.location] ?? 0) > gateRoom(view, x.location, p)) return false;
      if ((planted[x.location] ?? 0) > gateRoom(view, x.location, other(p))) return false;
      if ((evs[x.location] ?? 0) > 1) return false;
    }
    return true;
  };
  {
    const top = singles.slice(0, 7).map((c) => c.plan.plays[0]);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (a.cardId === b.cardId) continue;
        if (cardCost(a.cardId, view, p) + cardCost(b.cardId, view, p) > opts.energy) continue;
        if (!fits([a, b])) continue;
        playSets.push([a, b]);
        // A third card when Energy allows and Gates are open for it (drawn from the strongest singles only).
        if (opts.energy < 3) continue;
        for (let k = j + 1; k < Math.min(top.length, 5); k++) {
          const c = top[k];
          if (c.cardId === a.cardId || c.cardId === b.cardId) continue;
          if (cardCost(a.cardId, view, p) + cardCost(b.cardId, view, p) + cardCost(c.cardId, view, p) > opts.energy) continue;
          if (!fits([a, b, c])) continue;
          playSets.push([a, b, c]);
        }
      }
    }
  }
  const stage1: AiCandidate[] = playSets.map((ps) => scoreOf({ plays: ps, enters: defaultEnters, relocations: [], confronts }));
  stage1.sort((a, b) => b.score - a.score);
  const topPlays = stage1.slice(0, 5).map((c) => c.plan.plays);

  // Stage 2: cross top play sets with enter/relocation variants.
  const candidates: AiCandidate[] = [];
  for (const ps of topPlays) {
    for (const enters of enterVariants) {
      for (const relocations of relocVariants) {
        if (relocations.some((r) => enters.includes(r.uid))) continue;
        candidates.push(scoreOf({ plays: ps, enters, relocations, confronts }));
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Controlled imperfection: 70% best, 20% sensible alternative, 10% imperfect-but-legal.
  const roll = rand();
  let tier: AiDebug['tier'] = 'best';
  let chosen = best;
  const sensible = candidates.slice(1, 4).filter((c) => c.score >= best.score - 12);
  const imperfect = candidates.slice(1).filter((c) => c.score >= best.score - 35);
  if (roll > tuning.bestPick && roll <= tuning.bestPick + tuning.sensiblePick && sensible.length) {
    tier = 'sensible';
    chosen = sensible[Math.floor(rand() * sensible.length)];
  } else if (roll > tuning.bestPick + tuning.sensiblePick && imperfect.length) {
    tier = 'imperfect';
    chosen = imperfect[Math.floor(rand() * imperfect.length)];
  }

  // Stand on Business.
  const winEstimate = estimateWinChance(view, p);
  let standDecision = 'no';
  let standOnBusiness = false;
  if (opts.canStand && view.turn >= 2) {
    if (winEstimate >= tuning.strongStandThreshold) {
      standOnBusiness = true;
      standDecision = `stands (strong, ${(winEstimate * 100).toFixed(0)}%)`;
    } else if (winEstimate >= tuning.standThreshold && rand() < 0.5) {
      standOnBusiness = true;
      standDecision = `stands (confident, ${(winEstimate * 100).toFixed(0)}%)`;
    } else if (winEstimate > 0.42 && winEstimate < 0.58 && rand() < tuning.bluffRate) {
      standOnBusiness = true;
      standDecision = `BLUFF (${(winEstimate * 100).toFixed(0)}%)`;
    } else {
      standDecision = `holds (${(winEstimate * 100).toFixed(0)}%)`;
    }
  }

  // The opponent Stood on Business: this is the one cheap turn to Sit Down. Stay when the board is worth playing.
  let stepOff = false;
  const raisedOnMe = view.pendingRaises.some((r) => r.by !== p);
  if (raisedOnMe && opts.canStepOff && view.turn < view.maxTurns) {
    if (winEstimate < tuning.continueThreshold) {
      stepOff = true;
      standDecision = `steps off (${(winEstimate * 100).toFixed(0)}%, pays ${opts.stepOffCost})`;
    } else {
      standDecision += ` · stays at ${opts.pendingStakes}`;
    }
  }

  const plan: TurnPlan = { ...chosen.plan, standOnBusiness, stepOff, summon: agreedSummon !== undefined && opts.summonable.includes(agreedSummon) ? { location: agreedSummon } : undefined };
  const debug: AiDebug = {
    turn: view.turn,
    player: p,
    considered: candidates.slice(0, 12),
    chosen: labelPlan(view, plan),
    primaryReason: [...globalReasons, ...chosen.reasons].slice(0, 3).join('; ') || 'best available board',
    tier,
    winEstimate,
    standDecision,
    elapsedMs: Date.now() - t0,
  };
  return { plan, debug };
}

/** Ring buffer of AI decisions for the developer panel. */
export const AI_LOG: AiDebug[] = [];
export function recordAi(d: AiDebug): void {
  AI_LOG.push(d);
  if (AI_LOG.length > 60) AI_LOG.shift();
}
