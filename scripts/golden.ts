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

// The rng seed state is part of GameState and must round-trip exactly, so the trace keeps every field as is.
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
  const turns: { turn: number; plans: Record<PlayerId, TurnPlan>; state: GameState; events: unknown[] }[] = [];
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 12) {
    const plans = { A: planTurn(viewFor(state, 'A'), 'A').plan, B: planTurn(viewFor(state, 'B'), 'B').plan };
    const turn = state.turn;
    const out = resolveTurn(state, plans);
    state = out.state;
    turns.push({ turn, plans, state: structuredClone(state), events: out.events });
  }
  const file = `seed-${String(seed).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ format: 1, source: { commit }, options, initial, turns, result: state.result ?? null }, null, 0));
  files.push({ file, seed, decks: options.deckKeys, turns: turns.length, winner: state.result?.winner ?? null });
  process.stdout.write(`${file} ${turns.length} turns ${state.result?.winner ?? 'draw'}\n`);
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 1, source: { commit, generator: 'scripts/golden.ts' }, matches: files }, null, 1));
const bytes = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
console.log(`${files.length} traces, ${(bytes / 1024 / 1024).toFixed(1)}MB, ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(root, dir)}`);
