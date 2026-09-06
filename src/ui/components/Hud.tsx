import { CARD_BY_ID, PLANNING_SECONDS, type GameState, type PlayerId } from '../../engine';
import { initials, useDisplay } from '../display';

function TimerRing({ seconds, paused }: { seconds: number; paused: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = paused ? 1 : seconds / PLANNING_SECONDS;
  return (
    <div className={`timer-ring ${seconds <= 5 && !paused ? 'low' : ''} ${paused ? 'paused' : ''}`}>
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="track" />
        <circle cx="32" cy="32" r={r} className="prog" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div className="timer">{paused ? '·' : seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : seconds}</div>
    </div>
  );
}

export function Hud({ view, me, secondsLeft, paused, onProfile }: { view: GameState; me: PlayerId; secondsLeft: number; paused: boolean; onProfile: (p: PlayerId) => void }) {
  const { placeholders } = useDisplay();
  const profile = (p: PlayerId, right: boolean) => {
    const ps = view.players[p];
    const av = CARD_BY_ID[ps.avatarDefId];
    return (
      <div className={`profile ${right ? 'right' : ''} p${p}`} onClick={() => onProfile(p)} role="button">
        <div className="avatar" title={av?.name}>
          {initials(ps.avatarDefId, placeholders)}
        </div>
        <div className="plate">
          <div className="handle">{ps.handle}</div>
          <div className="sub">
            {ps.hand.length} in hand · {ps.deckCount} in deck{p === me ? ' · you' : ''}
          </div>
        </div>
      </div>
    );
  };
  return (
    <header className="hud">
      {profile('A', false)}
      <div className="hud-center">
        <div className="turn-label">Turn {Math.min(view.turn, 6)} / 6</div>
        <div className="hud-mid">
          <TimerRing seconds={secondsLeft} paused={paused} />
          <div className="coin" title="Match Stakes">
            <span>{view.stakes}</span>
            <small>stake{view.stakes > 1 ? 's' : ''}</small>
          </div>
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
