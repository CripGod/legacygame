import { influenceAt, type GameState } from '../../engine';
import { locationName, useDisplay } from '../display';

export function ResultScreen({ state, onAgain, onRematch, onMenu, onBoard }: { state: GameState; onAgain: () => void; onRematch: () => void; onMenu: () => void; onBoard: () => void }) {
  const { placeholders } = useDisplay();
  const r = state.result!;
  const reason: Record<string, string> = {
    locations: 'won more Locations',
    'tiebreak-influence': 'won on total Influence (1–1 with a tie)',
    'tiebreak-force': 'won on total Force',
    draw: 'nobody could break the tie',
    stepOff: 'the opponent stepped off',
  };
  return (
    <div className="screen">
      <div className="inner">
        <div className="winner" style={{ color: r.winner === 'A' ? 'var(--cA)' : r.winner === 'B' ? 'var(--cB)' : 'var(--text)' }}>
          {r.winner ? `${state.players[r.winner].handle} wins` : 'Draw'}
        </div>
        <div className="center muted">
          {reason[r.reason]} · {r.stakes} Stake{r.stakes > 1 ? 's' : ''} · ended on Turn {r.turn}
        </div>
        <div className="result-grid">
          {state.locations.map((l, i) => {
            const inf = influenceAt(state, i);
            const w = r.locationWinners[i];
            return (
              <div key={i} className={`result-loc ${w === 'A' || w === 'B' ? w : ''}`}>
                <div style={{ fontWeight: 800 }}>{l.revealed ? locationName(l.defId, placeholders) : `Location ${i + 1}`}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>
                  <span className="pA">{inf.A}</span> <span className="muted">·</span> <span className="pB">{inf.B}</span>
                </div>
                <div className="muted">{w === 'lost' ? 'LOST' : w ? `${state.players[w].handle}` : 'Tie'}</div>
              </div>
            );
          })}
        </div>
        <table className="stats">
          <tbody>
            <tr><td>Location lead changes</td><td>{state.stats.leadChanges}</td></tr>
            <tr><td>Final-turn flips</td><td>{state.stats.finalTurnFlips}</td></tr>
            <tr><td>Relocations</td><td>{state.stats.relocations.A} / {state.stats.relocations.B}</td></tr>
            <tr><td>Setbacks (neutral)</td><td>{state.players.A.setbacks} / {state.players.B.setbacks}</td></tr>
            <tr><td>Solidarity earned</td><td>{state.players.A.solidarity} / {state.players.B.solidarity}</td></tr>
            <tr><td>Stand on Business</td><td>{state.stats.standTurns.length ? state.stats.standTurns.map((s) => `${state.players[s.player].handle} T${s.turn} → ${s.proposed} (${s.accepted ? 'landed' : 'opponent stepped off'})`).join('; ') : '—'}</td></tr>
          </tbody>
        </table>
        <div className="menu">
          <button className="primary" onClick={onAgain}>
            Play again
          </button>
          <button onClick={onBoard}>View the final board</button>
          <button onClick={onRematch}>Rematch (same seed {state.seed})</button>
          <button className="ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
