import { CARD_BY_ID, MAX_HAND, LEGEND_READY, type GameState, type PlayerId, effectiveStakes } from '../../engine';
import { initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';
import { Art } from './Art';
import { SettingsMenu } from './SettingsMenu';

export function Hud({ view, me, onProfile, bubbles, onChat, stand }: { view: GameState; me: PlayerId; onProfile: (p: PlayerId) => void; bubbles?: Partial<Record<PlayerId, string>>; onChat?: () => void; stand?: { on: boolean; disabled: boolean; flash?: boolean; /** The last scheduled turn and you can still stand: the button pulses with the kit's wipe shine. */ urge?: boolean; onToggle: () => void; /** What the Legacy becomes if the planned Stand goes through. */ proposed?: number; /** The press: the button slams. */ slam?: boolean; /** The clap: the coin flips to the new price. */ flip?: boolean } }) {
  const { placeholders } = useDisplay();
  /* The nameplate from the top-bar cut: the wordless strip (gold for you, blue for Harborlight) with the name and counts
     as live text, and the avatar ring hung off its end (the ring, the portrait clipped to the well over it, the level
     chip, and the Legend count riding the chip). Every measure is the strip's 1x pixel (--u) from the cut's manifest. */
  const profile = (p: PlayerId, right: boolean) => {
    const ps = view.players[p];
    const av = CARD_BY_ID[ps.avatarDefId];
    const legend = ps.legend ?? 0;
    return (
      <div className={`profile np ${right ? 'right' : ''} p${p} ${view.initiative === p ? 'first' : ''}`} onClick={() => onProfile(p)} role="button">
        <div className="np-strip">
          <div className="np-text">
            <div className="handle">{ps.handle}</div>
            <div className="sub">
              <span>{ps.hand.length}/{MAX_HAND} in hand · {ps.deckCount} in deck{p === me ? ' · you' : ''}</span>
              {p === me && (
                <span className={`coin ${view.pendingRaises.length ? 'raised' : ''} ${stand?.flip ? 'flip' : ''}`} {...tip(view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes)}>
                  {view.stakes}
                  {(view.pendingRaises.length > 0 || stand?.on) && <em>→{stand?.on && stand.proposed ? stand.proposed : effectiveStakes(view)}</em>}
                  <small>legacy</small>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="np-avatar" title={`${av?.name ?? ''}${view.initiative === p ? ' · goes first this turn' : ''}`} data-avatar={p} {...tip(view.initiative === p ? 'Initiative: this player\'s Reveals and moves resolve first this turn. It alternates every turn.' : 'Resolves second this turn.')}>
          <i className="np-ring" aria-hidden />
          <div className="np-portrait">{placeholders ? initials(ps.avatarDefId, true) : <Art kind="characters" id={ps.avatarDefId} className="avatar-img" fallback={initials(ps.avatarDefId, false)} alt={av?.name} />}</div>
          <i className="np-chip" aria-hidden />
          <b className={`np-level ${legend >= LEGEND_READY ? 'spread' : ''}`} {...tip(legend >= LEGEND_READY ? `Legend ${legend}: word has spread. ${p === me ? 'Your' : 'Their'} Characters arrive at the Gates Ready. ${p === me ? 'You have' : 'They have'} people everywhere.` : `Legend ${legend}: Threats ${p === me ? 'you' : 'they'} helped clear. Clearing one pays +1 lasting Influence at every other Location to everyone who brought Force, +2 to whoever brought the most. At ${LEGEND_READY}, Characters arrive at the Gates Ready.`)}>
            {legend}
          </b>
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
        <div className="hud-mid">
          {stand && (
            /* The round Stand on Business button from the top-bar cut. --heat is how far the match has run (turn 1 = 0, the
               last turn = 1): the glow breathes harder and faster as the end nears: the backing in the kit's four states (hover fades a
               second layer up, never swapping the sprite), the wordmark over it, the gold glow behind on hover and press,
               and Standing held on the pressed state with the raise on a chip. The seat keeps the bar's height; the button
               hangs below it, over the top of the middle column, as the board places it. */
            <span className="sob-seat" style={{ '--heat': Math.min(1, Math.max(0, (view.turn - 1) / Math.max(1, view.maxTurns - 1))) } as React.CSSProperties}>
              <i className="sob-glow" aria-hidden />
              <button className={`sob ${stand.on ? 'on' : ''} ${stand.flash ? 'ftue-flash' : ''} ${stand.slam ? 'slam' : ''} ${stand.urge ? 'urge' : ''}`} disabled={stand.disabled} onClick={stand.onToggle} aria-label={stand.on ? 'Standing on Business' : 'Stand on Business'} title={view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes}>
                <i className="sob-l sob-l-default" aria-hidden />
                <i className="sob-l sob-l-hover" aria-hidden />
                <i className="sob-l sob-l-pressed" aria-hidden />
                <i className="sob-l sob-l-disabled" aria-hidden />
                {stand.on && <b className="sob-chip">×{stand.proposed ?? effectiveStakes(view)}</b>}
              </button>
              <i className="sob-word" aria-hidden />
            </span>
          )}
          <SettingsMenu className="hud-settings" icon="gear" />
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
