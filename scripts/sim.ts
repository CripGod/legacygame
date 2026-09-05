/**
 * Headless AI-vs-AI simulation for balancing. Usage: npm run sim -- [matches] [seed]
 */
import { createMatch, resolveTurn, respondToStand, viewFor, other, type GameState, type PlayerId } from '../src/engine';
import { planTurn, respondToStandAi } from '../src/ai/harborlight';

const matches = Number(process.argv[2] ?? 100);
const baseSeed = Number(process.argv[3] ?? 1);

export function playMatch(seed: number): GameState {
  let state = createMatch({ seed });
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 40) {
    if (state.phase === 'planning') {
      const plans = {
        A: planTurn(viewFor(state, 'A'), 'A').plan,
        B: planTurn(viewFor(state, 'B'), 'B').plan,
      };
      state = resolveTurn(state, plans).state;
    } else if (state.phase === 'standResponse') {
      const responder: PlayerId = other(state.pendingStand!.by);
      const r = respondToStandAi(viewFor(state, responder), responder);
      state = respondToStand(state, responder, r.continueMatch).state;
    }
  }
  return state;
}

if (process.argv[1]?.endsWith('sim.ts')) {
  const wins = { A: 0, B: 0, draw: 0 };
  const playCounts: Record<string, number> = {};
  const winCounts: Record<string, number> = {};
  let leadChanges = 0;
  let flips = 0;
  let relocations = 0;
  let stands = 0;
  let assists = 0;
  let lost = 0;
  const t0 = Date.now();
  for (let i = 0; i < matches; i++) {
    const s = playMatch(baseSeed + i);
    const r = s.result!;
    if (r.winner) wins[r.winner]++;
    else wins.draw++;
    leadChanges += s.stats.leadChanges;
    flips += s.stats.finalTurnFlips;
    relocations += s.stats.relocations.A + s.stats.relocations.B;
    stands += s.stats.standTurns.length;
    assists += s.stats.assists.A.taken + s.stats.assists.B.taken;
    lost += r.locationWinners.filter((w) => w === 'lost').length;
    for (const p of ['A', 'B'] as const) {
      for (const id of s.stats.plays[p]) {
        playCounts[id] = (playCounts[id] ?? 0) + 1;
        if (r.winner === p) winCounts[id] = (winCounts[id] ?? 0) + 1;
      }
    }
  }
  console.log(`Simulated ${matches} matches in ${Date.now() - t0}ms`);
  console.log('Wins:', wins);
  console.log(`Lead changes/match: ${(leadChanges / matches).toFixed(2)} · final-turn flips/match: ${(flips / matches).toFixed(2)}`);
  console.log(`Relocations/match: ${(relocations / matches).toFixed(2)} · stands/match: ${(stands / matches).toFixed(2)} · assists/match: ${(assists / matches).toFixed(2)} · lost locations/match: ${(lost / matches).toFixed(2)}`);
  console.log('Card play rate / win rate:');
  for (const id of Object.keys(playCounts).sort()) {
    console.log(`  ${id.padEnd(22)} played ${String(playCounts[id]).padStart(4)}  win ${(((winCounts[id] ?? 0) / playCounts[id]) * 100).toFixed(0)}%`);
  }
}
