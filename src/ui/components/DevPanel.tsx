import { useState } from 'react';
import type { GameEvent, GameState } from '../../engine';
import { AI_LOG } from '../../ai/harborlight';
import { allMatches, clearMatches, exportJson, summarize } from '../../analytics/analytics';

export function DevPanel({ trueState, log, onClose }: { trueState: GameState; log: GameEvent[]; onClose: () => void }) {
  const [tab, setTab] = useState<'ai' | 'analytics' | 'log' | 'state'>('ai');
  const [, force] = useState(0);
  const summary = summarize();
  return (
    <div className="devpanel">
      <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>Developer tools</b>
        <button className="small ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="tabs">
        {(['ai', 'analytics', 'log', 'state'] as const).map((t) => (
          <button key={t} className={`small ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'ai' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="muted">Harborlight reasoning (most recent first). Harborlight sees only the redacted view.</div>
          {[...AI_LOG].reverse().map((d, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 6 }}>
              <div>
                <b>Turn {d.turn}</b> · chose <b>{d.chosen}</b> ({d.tier}) · {d.elapsedMs}ms
              </div>
              <div className="muted">Reason: {d.primaryReason}</div>
              <div className="muted">
                Win estimate {(d.winEstimate * 100).toFixed(0)}% · Stand: {d.standDecision}
              </div>
              <details>
                <summary>{d.considered.length} candidates</summary>
                {d.considered.map((c, j) => (
                  <div key={j} className="cand">
                    {c.score.toFixed(1)} · {c.label}
                    <div className="muted">{c.reasons.join('; ')}</div>
                  </div>
                ))}
              </details>
            </div>
          ))}
          {!AI_LOG.length && <div className="muted">No decisions yet.</div>}
        </div>
      )}
      {tab === 'analytics' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <table className="stats">
            <tbody>
              <tr><td>Matches recorded</td><td>{summary.matches}</td></tr>
              <tr><td>Harborlight win rate (vs human)</td><td>{(summary.aiWinRate * 100).toFixed(0)}%</td></tr>
              <tr><td>Human win rate</td><td>{(summary.humanWinRate * 100).toFixed(0)}%</td></tr>
              <tr><td>Location lead changes / match</td><td>{summary.avgLeadChanges.toFixed(2)}</td></tr>
              <tr><td>Final-turn flips / match</td><td>{summary.avgFinalTurnFlips.toFixed(2)}</td></tr>
              <tr><td>Relocations / match</td><td>{summary.avgRelocations.toFixed(2)}</td></tr>
              <tr><td>Assist rate (taken / offered)</td><td>{(summary.assistRate * 100).toFixed(0)}%</td></tr>
              <tr><td>Stand on Business / match</td><td>{summary.standFrequency.toFixed(2)}</td></tr>
              <tr><td>Step Offs</td><td>{summary.stepOffs}</td></tr>
              <tr><td>Gate character-turns / match</td><td>{summary.avgGateTurns.toFixed(1)}</td></tr>
              <tr><td>Inside character-turns / match</td><td>{summary.avgInsideTurns.toFixed(1)}</td></tr>
            </tbody>
          </table>
          <details>
            <summary>Card play / win rates</summary>
            <table className="stats">
              <tbody>
                {summary.cards.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>
                      {c.played} played · {(c.winRate * 100).toFixed(0)}% win
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Locations</summary>
            <table className="stats">
              <tbody>
                {summary.locations.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>
                      {l.played} matches · avg total Influence {l.avgInfluence.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button
              className="small"
              onClick={() => {
                const blob = new Blob([exportJson()], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `bhcb-playtests-${Date.now()}.json`;
                a.click();
              }}
            >
              Export JSON ({allMatches().length})
            </button>
            <button
              className="small danger"
              onClick={() => {
                if (confirm('Clear recorded playtest data?')) {
                  clearMatches();
                  force((n) => n + 1);
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {tab === 'log' && (
        <div style={{ display: 'grid', gap: 2 }}>
          {log.map((e, i) => (
            <div key={i} className={e.privateTo ? 'muted' : ''}>
              <span className="muted">[{e.type}]</span> {e.text}
            </div>
          ))}
        </div>
      )}
      {tab === 'state' && (
        <pre>
          seed {trueState.seed} · turn {trueState.turn} · phase {trueState.phase} · initiative {trueState.initiative}
          {'\n'}locations: {trueState.locations.map((l) => `${l.defId}${l.revealed ? '' : ' (hidden)'}`).join(', ')}
          {'\n'}reveal order: {trueState.revealOrder.map((i) => i + 1).join(' → ')}
          {'\n'}Harborlight hand: {trueState.players.B.hand.join(', ')}
          {'\n'}(true state — never shown to Harborlight's planner)
        </pre>
      )}
    </div>
  );
}
