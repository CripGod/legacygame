import { CARD_BY_ID, MAX_HAND, LEGEND_READY, type GameState, type PlayerId, effectiveStakes } from '../../engine';
import { initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';
import { Art } from './Art';
import { SettingsMenu } from './SettingsMenu';

export function Hud({ view, me, onProfile, bubbles, onChat, stand }: { view: GameState; me: PlayerId; onProfile: (p: PlayerId) => void; bubbles?: Partial<Record<PlayerId, string>>; onChat?: () => void; stand?: { on: boolean; disabled: boolean; flash?: boolean; onToggle: () => void; /** What the Legacy becomes if the planned Stand goes through. */ proposed?: number; /** The press: the button slams. */ slam?: boolean; /** The clap: the coin flips to the new price. */ flip?: boolean } }) {
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
            <span className={`legend-pill ${(ps.legend ?? 0) >= LEGEND_READY ? 'spread' : ''}`} {...tip((ps.legend ?? 0) >= LEGEND_READY ? `Legend ${ps.legend}: word has spread. ${p === me ? 'Your' : 'Their'} Characters arrive at the Gates Ready. ${p === me ? 'You have' : 'They have'} people everywhere.` : `Legend ${ps.legend ?? 0}: Threats ${p === me ? 'you' : 'they'} helped clear. Clearing one pays +1 lasting Influence at every other Location to everyone who brought Force, +2 to whoever brought the most. At ${LEGEND_READY}, Characters arrive at the Gates Ready.`)}>
              ★ {ps.legend ?? 0}
            </span>
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
          <button className={`stand-btn ${stand.on ? 'on' : ''} ${stand.flash ? 'ftue-flash' : ''} ${stand.slam ? 'slam' : ''}`} disabled={stand.disabled} onClick={stand.onToggle} aria-label={view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes}>
            {stand.on ? 'Standing ✓' : 'Stand on Business'}
          </button>
        )}
        <div className="hud-sub">
          <span className={`coin ${view.pendingRaises.length ? 'raised' : ''} ${stand?.flip ? 'flip' : ''}`} {...tip(view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes)}>
            {view.stakes}
            {(view.pendingRaises.length > 0 || stand?.on) && <em>→{stand?.on && stand.proposed ? stand.proposed : effectiveStakes(view)}</em>}
            <small>legacy</small>
          </span>
          <SettingsMenu className="hud-settings" icon="gear" />
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
