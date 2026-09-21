/**
 * Golden traces for the engine port: seeded matches with Harborlight planning both sides, and for every turn the two
 * plans, the state after the turn and the events. A port that takes the same options and the same plans must produce
 * the same states, key for key. Written under the Unity project's test folder; the C# tests read them from disk.
 * Run: npm run golden -- [matches] [first seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createMatch, resolveTurn, viewFor, type GameState, type TurnPlan, type PlayerId } from '../src/engine';
import { PRESET_DECKS } from '../src/engine/content';
import { planTurn } from '../src/ai/harborlight';
import {
  charInfluence, charInfluenceParts, influenceAt, influenceRows, leaderAt, locationWinner, insideCapacity, lockKind, isBlockedFromEntering, isHeldInside,
  isSuppressed, energyFor, legalOptions, relocationsAllowed, totalForce, cardCost, costBreakdown, threatForceNeeded, canConfront, isAssist, confrontForce,
  effectiveStakes, isNight, playerOrder, validatePlan, charsAt, landOfficeAt, gateOpen, insideOpen,
} from '../src/engine/query';
import { PLAYERS } from '../src/engine/types';
import { makeRng, nextFloat, nextInt, hashSeed, shuffle } from '../src/engine/rng';

/**
 * What the query module says about a state, recorded so the port can be checked value for value: Influence per
 * Location and per Character (with its parts), the itemised rows, capacities, locks, energy, costs, legal options,
 * Threat arithmetic. Nulls are written as nulls; the C# test builds the same document and compares.
 */
function snapshotQueries(state: GameState) {
  const chars = Object.values(state.characters);
  return {
    isNight: isNight(state),
    effectiveStakes: effectiveStakes(state),
    playerOrder: playerOrder(state),
    locations: state.locations.map((l) => ({
      influence: influenceAt(state, l.index),
      leader: leaderAt(state, l.index),
      winner: locationWinner(state, l.index),
      insideCapacity: insideCapacity(state, l.index),
      landOffice: landOfficeAt(state, l.index),
      gateOpen: { A: gateOpen(state, l.index, 'A'), B: gateOpen(state, l.index, 'B') },
      insideOpen: { A: insideOpen(state, l.index, 'A'), B: insideOpen(state, l.index, 'B') },
      rows: { A: influenceRows(state, l.index, 'A'), B: influenceRows(state, l.index, 'B') },
      threats: l.threats.map((t) => ({
        uid: t.uid,
        needed: threatForceNeeded(state, t),
        canConfront: { A: canConfront(state, t, 'A'), B: canConfront(state, t, 'B') },
        assist: { A: isAssist(t, 'A'), B: isAssist(t, 'B') },
        confront: Object.fromEntries(charsAt(state, l.index).map((c) => [c.uid, confrontForce(state, c, t)])),
      })),
    })),
    chars: Object.fromEntries(chars.map((c) => [c.uid, {
      influence: charInfluence(state, c),
      parts: charInfluenceParts(state, c),
      lock: lockKind(state, c),
      blocked: isBlockedFromEntering(state, c),
      held: isHeldInside(state, c),
      suppressed: isSuppressed(state, c),
    }])),
    players: Object.fromEntries(PLAYERS.map((p) => [p, {
      energy: energyFor(state, p),
      relocationsAllowed: relocationsAllowed(state, p),
      totalForce: totalForce(state, p),
      costs: Object.fromEntries([...new Set(state.players[p].hand.filter((id) => id !== 'hidden'))].map((id) => [id, { cost: cardCost(id, state, p), breakdown: costBreakdown(state, p, id) }])),
      legal: legalOptions(state, p),
    }])),
  };
}

const root = process.cwd();
const dir = path.join(root, 'unity/StandOnBusiness/Assets/StandOnBusiness/Engine/Tests/Golden');
const matches = Number(process.argv[2] ?? 40);
const firstSeed = Number(process.argv[3] ?? 1);
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* no git */
}

// The rng seed state is part of GameState and must round-trip exactly, so the trace keeps every field as is. The
// source commit is recorded in the manifest only, so a regeneration that changes nothing rewrites nothing.
const deckKeys = Object.keys(PRESET_DECKS);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const files: { file: string; seed: number; decks: Record<PlayerId, string>; turns: number; winner: PlayerId | null }[] = [];
const t0 = Date.now();
for (let i = 0; i < matches; i++) {
  const seed = firstSeed + i;
  // Every preset deck gets its turns in seat A and seat B; the mix is fixed by the seed, so the corpus regenerates identically.
  const options = { seed, deckKeys: { A: deckKeys[i % deckKeys.length], B: deckKeys[(i * 3 + 1) % deckKeys.length] } as Record<PlayerId, string> };
  let state: GameState = createMatch(options);
  const initial = structuredClone(state);
  const initialQueries = snapshotQueries(state);
  const turns: { turn: number; plans: Record<PlayerId, TurnPlan>; planErrors: Record<PlayerId, string[]>; state: GameState; events: unknown[]; queries: unknown }[] = [];
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 12) {
    const plans = { A: planTurn(viewFor(state, 'A'), 'A').plan, B: planTurn(viewFor(state, 'B'), 'B').plan };
    // The plans are validated against the state they were made on (the full state: the AI's view hides nothing that matters to legality).
    const planErrors = { A: validatePlan(state, 'A', plans.A), B: validatePlan(state, 'B', plans.B) };
    const turn = state.turn;
    const out = resolveTurn(state, plans);
    state = out.state;
    turns.push({ turn, plans, planErrors, state: structuredClone(state), events: out.events, queries: snapshotQueries(state) });
  }
  const file = `seed-${String(seed).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ format: 2, options, initial, initialQueries, turns, result: state.result ?? null }, null, 0));
  files.push({ file, seed, decks: options.deckKeys, turns: turns.length, winner: state.result?.winner ?? null });
  process.stdout.write(`${file} ${turns.length} turns ${state.result?.winner ?? 'draw'}\n`);
}
// The RNG fixture: for known seeds, the state after makeRng, sixteen floats, sixteen ints in [0, 6), a shuffle of eight
// and the state after the floats; plus string hashes. RngTests holds the port to these bit for bit.
const rngFixture: { format: number; seeds: unknown[]; hashes: unknown[] } = { format: 1, seeds: [], hashes: [] };
for (const seed of [0, 1, 2, 7, 42, 1234567, 4294967295, -1, 2147483648]) {
  const r = makeRng(seed);
  const floats: number[] = [];
  for (let i = 0; i < 16; i++) floats.push(nextFloat(r));
  const r2 = makeRng(seed);
  const ints: number[] = [];
  for (let i = 0; i < 16; i++) ints.push(nextInt(r2, 6));
  const order = shuffle(makeRng(seed), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  rngFixture.seeds.push({ seed, initial: makeRng(seed).s, afterSixteen: r.s, floats, intsOfSix: ints, shuffleOfEight: order });
}
for (const str of ['', 'a', '7:arrival:the_ancestors', '1:arrival:chairteenth', 'Stand on Business', 'Bois Caïman', '🙂']) rngFixture.hashes.push({ input: str, hash: hashSeed(str) });
fs.writeFileSync(path.join(dir, 'rng.json'), JSON.stringify(rngFixture, null, 1));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 2, source: { commit, generator: 'scripts/golden.ts' }, matches: files }, null, 1));
const bytes = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
console.log(`${files.length} traces, ${(bytes / 1024 / 1024).toFixed(1)}MB, ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(root, dir)}`);
