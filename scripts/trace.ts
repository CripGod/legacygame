import { createMatch, resolveTurn, viewFor, type GameState } from '../src/engine';
import { planTurn } from '../src/ai/harborlight';

const seed = Number(process.argv[2] ?? 7);
let state: GameState = createMatch({ seed });
console.log(`Seed ${seed}. Locations: ${state.locations.map((l) => l.defId).join(', ')} reveal order ${state.revealOrder.join(',')} initiative ${state.initiative}`);
console.log('Hand A:', state.players.A.hand.join(', '));
console.log('Hand B:', state.players.B.hand.join(', '));
let guard = 0;
while (state.phase !== 'ended' && guard++ < 40) {
  if (state.phase === 'planning') {
    const a = planTurn(viewFor(state, 'A'), 'A');
    const b = planTurn(viewFor(state, 'B'), 'B');
    console.log(`\n=== TURN ${state.turn} ===`);
    console.log(`A plans: ${a.debug.chosen} [${a.debug.tier}] (${a.debug.primaryReason}) stand=${a.debug.standDecision} ${a.debug.elapsedMs}ms`);
    console.log(`B plans: ${b.debug.chosen} [${b.debug.tier}] (${b.debug.primaryReason}) stand=${b.debug.standDecision} ${b.debug.elapsedMs}ms`);
    const out = resolveTurn(state, { A: a.plan, B: b.plan });
    state = out.state;
    for (const e of out.events) if (e.text) console.log(`  [${e.type}] ${e.text}`);
  }
}
console.log('\nRESULT', JSON.stringify(state.result));
console.log('STATS', JSON.stringify(state.stats));
