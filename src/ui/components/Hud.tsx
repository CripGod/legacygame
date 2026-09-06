import { CARD_BY_ID, PLANNING_SECONDS, type GameState, type PlayerId, effectiveStakes } from '../../engine';
import { initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';
import { Art } from './Art';

function TimerRing({ seconds, paused }: { seconds: number; paused: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = paused ? 1 : seconds / PLANNING_SECONDS;
  return (
    <div className={`timer-ring ${seconds <= 5 && !paused ? 'low' : ''} ${paused ? 'paused' : ''}`} {...tip(HINTS.timer)}>
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="track" />
        <circle cx="32" cy="32" r={r} className="prog" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div className="timer">{paused ? '·' : seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : seconds}</div>
    </div>
  );
}

export function Hud({ view, me, secondsLeft, paused, onProfile, onLog, hasLog, bubbles, onChat }: { view: GameState; me: PlayerId; secondsLeft: number; paused: boolean; onProfile: (p: PlayerId) => void; onLog: () => void; hasLog: boolean; bubbles?: Partial<Record<PlayerId, string>>; onChat?: () => void }) {
  const { placeholders } = useDisplay();
  const profile = (p: PlayerId, right: boolean) => {
    const ps = view.players[p];
    const av = CARD_BY_ID[ps.avatarDefId];
    return (
      <div className={`profile ${right ? 'right' : ''} p${p}`} onClick={() => onProfile(p)} role="button">
        <div className="avatar" title={av?.name} data-avatar={p}>
          {placeholders ? initials(ps.avatarDefId, true) : <Art kind="characters" id={ps.avatarDefId} className="avatar-img" fallback={initials(ps.avatarDefId, false)} alt={av?.name} />}
        </div>
        <div className="plate">
          <div className="handle">{ps.handle}</div>
          <div className="sub">
            {ps.hand.length} in hand · {ps.deckCount} in deck{p === me ? ' · you' : ''}
          </div>
        </div>
        {p === me && onChat && (
          <button
            className="small chat-btn"
            onClick={(e) => {
              e.stopPropagation();
              onChat();
            }}
            {...tip('Quick chat: emotes and Summon.')}
            aria-label="Quick chat"
          >
            💬
          </button>
        )}
        {bubbles?.[p] && <div className={`bubble ${right ? 'right' : ''}`}>{bubbles[p]}</div>}
      </div>
    );
  };
  return (
    <header className="hud">
      {profile('A', false)}
      <div className="hud-center">
        <div className="turn-label">Turn {Math.min(view.turn, view.maxTurns)} / {view.maxTurns}</div>
        <div className="hud-mid">
          <TimerRing seconds={secondsLeft} paused={paused} />
          <div className={`coin ${view.pendingRaises.length ? 'raised' : ''}`} {...tip(view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes)}>
            <span>
              {view.stakes}
              {view.pendingRaises.length > 0 && <em>→{effectiveStakes(view)}</em>}
            </span>
            <small>stake{view.stakes > 1 ? 's' : ''}</small>
          </div>
          <button className="coin info" disabled={!hasLog} onClick={onLog} {...tip('What happened last turn, step by step.')} aria-label="Last turn log">
            i
          </button>
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
