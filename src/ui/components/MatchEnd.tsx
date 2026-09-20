import { useEffect, useState } from 'react';
import { CARD_BY_ID, other, type GameState, type PlayerId } from '../../engine';
import { initials, locationName, useDisplay } from '../display';
import { Art } from './Art';
import { balance } from '../legacy';

/**
 * The end of a match, on the board (Hearthstone's banner, Snap's result panel): the word slams in over the
 * stamped Locations, then fades as the result panel opens in the centre over a near-black scrim; "Look at the
 * board" lifts the scrim and leaves a slim bar. No separate screen.
 *   stage 1: the banner only.  stage 2: the banner lifts, the panel rises.
 */
export function MatchEnd({
  view,
  me,
  stage,
  collapsed,
  onCollapse,
  onAgain,
  onRematch,
  onMenu,
}: {
  view: GameState;
  me: PlayerId;
  stage: 1 | 2;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  onAgain: () => void;
  onRematch: () => void;
  onMenu: () => void;
}) {
  const { placeholders } = useDisplay();
  const r = view.result;
  const [stats, setStats] = useState(false);
  const winner = r?.winner ?? null;
  const mineWon = winner === me;
  const tone: 'win' | 'loss' | 'draw' = winner ? (mineWon ? 'win' : 'loss') : 'draw';
  // The wallet counts up from what it held before this match's Legacy was banked.
  const after = balance();
  const gain = mineWon && r ? r.payout : 0;
  const [wallet, setWallet] = useState(after - gain);
  useEffect(() => {
    if (stage < 2 || gain <= 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start - 500) / 900);
      setWallet(Math.round(after - gain + gain * Math.max(0, 1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, after, gain]);
  if (!r) return null;
  const handle = (p: PlayerId) => view.players[p].handle;
  const title = tone === 'win' ? 'VICTORY' : tone === 'loss' ? 'DEFEAT' : 'DRAW';
  const line = winner ? `${handle(winner)} wins ${r.payout} Legacy${r.sweep ? ` (clean sweep, +${r.bonus})` : ''}` : 'Nobody wins the Legacy';
  const reason =
    r.reason === 'locations' ? (r.sweep ? 'All three Locations: a clean sweep.' : 'Two of three Locations.') : r.reason === 'tiebreak-influence' ? 'One Location each: total Influence decides.' : r.reason === 'tiebreak-force' ? 'Tied on Influence: total Force decides.' : r.reason === 'stepOff' ? (mineWon ? `${handle(other(me))} sat down.` : 'You sat down.') : 'Nothing separates them.';
  const profile = (p: PlayerId) => {
    const ps = view.players[p];
    return (
      <div className={`end-profile p${p} ${winner === p ? 'won' : ''}`}>
        <div className="end-avatar">{placeholders ? initials(ps.avatarDefId, true) : <Art kind="characters" id={ps.avatarDefId} className="avatar-img" fallback={initials(ps.avatarDefId, false)} alt={CARD_BY_ID[ps.avatarDefId]?.name} />}</div>
        <div className="end-handle">{ps.handle}</div>
      </div>
    );
  };
  const st = view.stats;
  return (
    <>
      <div className={`end-banner ${tone} ${stage >= 2 ? 'lift' : ''}`} aria-live="assertive">
        <div className="end-flash" aria-hidden />
        <div className="end-word">{title}</div>
      </div>
      {stage >= 2 && collapsed && (
        <div className={`end-bar ${tone}`} role="status">
          <span className="end-bar-text">
            <b>{title}</b> · {line}
          </span>
          <button className="small" onClick={() => onCollapse(false)}>
            Show result
          </button>
          <button className="small primary" onClick={onAgain}>
            Play again
          </button>
        </div>
      )}
      {stage >= 2 && !collapsed && <div className="end-scrim" aria-hidden />}
      {stage >= 2 && !collapsed && (
        <div className={`end-panel ${tone}`} role="dialog" aria-label="Match result">
          <div className="end-title">{title}</div>
          <div className="end-head">
            {profile(other(me))}
            <div className="end-vs">
              <b>{line}</b>
              <small>{reason} Turn {r.turn}.</small>
            </div>
            {profile(me)}
          </div>
          <div className="end-rows">
            {[0, 1, 2].map((i) => {
              const a = r.influence.A[i];
              const b = r.influence.B[i];
              const w = r.locationWinners[i];
              const loc = view.locations[i];
              const total = a + b;
              const fracA = total === 0 ? 0.5 : a / total;
              const label = w === 'lost' ? 'LOST' : w ? `${handle(w)} takes it` : 'Tied';
              return (
                <div key={i} className={`tally-row shown ${w && w !== 'lost' ? `won-${w}` : ''} ${w === 'lost' ? 'lost' : ''} ${w === me ? 'mine' : ''}`}>
                  <div className="tally-name">{locationName(loc.revealed ? loc.defId : 'unknown', placeholders)}</div>
                  <div className="tally-bar">
                    <span className="score pA">{a}</span>
                    <div className="line">
                      <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                      <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                      <div className="mark" style={{ left: `${fracA * 100}%` }} />
                    </div>
                    <span className="score pB">{b}</span>
                  </div>
                  <div className="tally-verdict">{label}</div>
                </div>
              );
            })}
          </div>
          <div className={`end-legacy ${gain > 0 ? 'gain' : ''}`}>
            <span className="end-legacy-lbl">Your Legacy</span>
            <b className="end-wallet">{wallet}</b>
            {gain > 0 && <span className="end-gain">+{gain}</span>}
          </div>
          {stats && (
            <table className="stats end-stats">
              <tbody>
                <tr><td>Location lead changes</td><td>{st.leadChanges}</td></tr>
                <tr><td>Final-turn flips</td><td>{st.finalTurnFlips}</td></tr>
                <tr><td>Relocations</td><td>{st.relocations.A} / {st.relocations.B}</td></tr>
                <tr><td>Setbacks</td><td>{view.players.A.setbacks} / {view.players.B.setbacks}</td></tr>
                <tr><td>Solidarity earned</td><td>{view.players.A.solidarity} / {view.players.B.solidarity}</td></tr>
                <tr><td>Stand on Business</td><td>{st.standTurns.length ? st.standTurns.map((s) => `${handle(s.player)} T${s.turn} → ${s.proposed} (${s.accepted ? 'landed' : 'opponent sat down'})`).join('; ') : '—'}</td></tr>
              </tbody>
            </table>
          )}
          <div className="end-actions">
            <button className="primary" onClick={onAgain} autoFocus>
              Play again
            </button>
            <button onClick={onRematch}>Rematch</button>
            <button className="ghost" onClick={() => onCollapse(true)}>
              Look at the board
            </button>
            <button className="ghost" onClick={() => setStats((s) => !s)}>
              {stats ? 'Hide stats' : 'Stats'}
            </button>
            <button className="ghost" onClick={onMenu}>
              Menu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
