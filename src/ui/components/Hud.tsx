import { CARD_BY_ID, MAX_HAND, type GameState, type PlayerId, effectiveStakes } from '../../engine';
import { isNight } from '../../engine';
import { initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';
import { Art } from './Art';

export function Hud({ view, me, onProfile, bubbles, onChat, stand }: { view: GameState; me: PlayerId; onProfile: (p: PlayerId) => void; bubbles?: Partial<Record<PlayerId, string>>; onChat?: () => void; stand?: { on: boolean; disabled: boolean; flash?: boolean; onToggle: () => void } }) {
  const { placeholders } = useDisplay();
  const profile = (p: PlayerId, right: boolean) => {
    const ps = view.players[p];
    const av = CARD_BY_ID[ps.avatarDefId];
    return (
      <div className={`profile ${right ? 'right' : ''} p${p} ${view.initiative === p ? 'first' : ''}`} onClick={() => onProfile(p)} role="button">
        <div className="avatar" title={`${av?.name ?? ''}${view.initiative === p ? ' · goes first this turn' : ''}`} data-avatar={p} {...tip(view.initiative === p ? 'Initiative: this player\'s Reveals and moves resolve first this turn. It alternates every turn.' : 'Resolves second this turn.')}>
          {placeholders ? initials(ps.avatarDefId, true) : <Art kind="characters" id={ps.avatarDefId} className="avatar-img" fallback={initials(ps.avatarDefId, false)} alt={av?.name} />}
        </div>
        <div className="plate">
          <div className="handle">{ps.handle}</div>
          <div className="sub">
            {ps.hand.length}/{MAX_HAND} in hand · {ps.deckCount} in deck{p === me ? ' · you' : ''}
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
        {stand && (
          <button className={`stand-btn ${stand.on ? 'on' : ''} ${stand.flash ? 'ftue-flash' : ''}`} disabled={stand.disabled} onClick={stand.onToggle} {...tip(view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes)}>
            {stand.on ? 'Standing ✓' : 'Stand on Business'}
          </button>
        )}
        <div className="hud-sub">
          <span className={`coin ${view.pendingRaises.length ? 'raised' : ''}`} {...tip(view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes)}>
            {view.stakes}
            {view.pendingRaises.length > 0 && <em>→{effectiveStakes(view)}</em>}
            <small>legacy</small>
          </span>
          <span className={`turn-label ${isNight(view) ? 'night' : 'day'}`} {...tip(HINTS.dayNight)}>
            {isNight(view) ? '🌙 Night' : '☀ Day'}
          </span>
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
