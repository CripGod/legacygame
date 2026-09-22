import { CARD_BY_ID, MAX_HAND, LEGEND_READY, type GameState, type PlayerId, effectiveStakes } from '../../engine';
import { initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';
import { Art } from './Art';
import { artUrl } from '../art';
import { SettingsMenu } from './SettingsMenu';

export function Hud({ view, me, onProfile, bubbles, onChat, stand }: { view: GameState; me: PlayerId; onProfile: (p: PlayerId) => void; bubbles?: Partial<Record<PlayerId, string>>; onChat?: () => void; stand?: { on: boolean; disabled: boolean; stood?: boolean; between?: boolean; current?: number; flash?: boolean; /** The last scheduled turn and you can still stand: the button pulses with the kit's wipe shine. */ urge?: boolean; onToggle: () => void; /** What the Legacy becomes if the planned Stand goes through. */ proposed?: number; /** Once stood: what the Stand added, for the chip that stays with the gold. */ raise?: number; /** The press: the button slams. */ slam?: boolean; } }) {
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
  const heat = Math.min(1, Math.max(0, (view.turn - 1) / Math.max(1, view.maxTurns - 1)));
  const ramp = Boolean(stand && !stand.disabled && (stand.urge || heat >= 0.5));
  return (
    <header className="hud">
      {profile('A', false)}
      <div className="hud-center">
        <div className="hud-mid">
          {stand && (
            /* The Stand on Business strip from the button cut. --heat is how far the match has run (turn 1 = 0, the last
               turn = 1): the plate breathes its hover glow harder and faster as the end nears. The plate is the kit's four
               states as four layers (hover fades a second layer up, never swapping the sprite; pressed sinks and disabled
               greys, both baked). The resting finish is silver, the less precious metal: the silver plate and lettering
               with the silver shine SVGs (a spark runs the outline every 9s; when things ramp up, the back half of the
               match or the last turn, a glint sweeps the face every 11s; under reduced motion the still plate). Gold is
               the prize, and it comes only with the click: hover is a brighter silver glow, Standing holds the gold
               pressed plate with the gold lettering, the kit's wipe sweeping the letters and four faint stars on them. Once your Stand has landed (stood) the button rests in gold for the rest of the match, out
               of reach but not greyed; only between turns (the plan locked, the turn playing out) does it take the
               greyed plate. The wordmark rides over the plate, outside the button's hit area, on the board's seat. The button itself takes no pointer (its glow and shadow must not be clipped);
               the hit area is the frame plus the lettering under it (.sob-hit). Standing holds the pressed state with the raise on a chip. */
            <span className={`sob-seat ${ramp ? 'ramp' : ''}`} style={{ '--heat': heat } as React.CSSProperties}>
              <button className={`sob ${stand.on ? 'on' : ''} ${stand.stood ? 'stood' : ''} ${stand.between ? 'between' : ''} ${stand.flash ? 'ftue-flash' : ''} ${stand.slam ? 'slam' : ''} ${stand.urge ? 'urge' : ''}`} disabled={stand.disabled} onClick={stand.onToggle} aria-label={stand.on ? 'Standing on Business' : 'Stand on Business'} title={view.pendingRaises.length ? HINTS.stakesPending : HINTS.stakes}>
                <i className="sob-l sob-l-default" aria-hidden />
                <img className="sob-l sob-shine sob-shine-edge" src={artUrl('kit', 'sob-silver-shine-edge', 'svg')} alt="" aria-hidden draggable={false} />
                <img className="sob-l sob-shine sob-shine-wipe" src={artUrl('kit', 'sob-silver-shine-wipe', 'svg')} alt="" aria-hidden draggable={false} />
                <i className="sob-l sob-l-hover" aria-hidden />
                <i className="sob-l sob-l-pressed" aria-hidden />
                <i className="sob-l sob-l-disabled" aria-hidden />
                <i className="sob-l sob-l-gold-rest" aria-hidden />
                <img className="sob-l sob-shine sob-shine-gold" src={artUrl('kit', 'sob-shine-edge', 'svg')} alt="" aria-hidden draggable={false} />
                <i className="sob-hit" aria-hidden />
              </button>
              <i className="sob-word" aria-hidden />
              <i className="sob-word sob-word-lit" aria-hidden />
              <i className="sob-word sob-stars" aria-hidden>
                <i style={{ '--x': '13%', '--y': '36%', '--d': '0s' } as React.CSSProperties} />
                <i style={{ '--x': '49.5%', '--y': '25%', '--d': '1.3s' } as React.CSSProperties} />
                <i style={{ '--x': '66%', '--y': '44%', '--d': '2.1s' } as React.CSSProperties} />
                <i style={{ '--x': '89%', '--y': '52%', '--d': '3.4s' } as React.CSSProperties} />
              </i>
              {/* The chip follows the strip: up while the Stand is planned and, once stood, whenever the strip is gold (not between turns). */}
              {stand.on ? (
                <b className="sob-chip">+{Math.max(1, (stand.proposed ?? effectiveStakes(view)) - (stand.current ?? effectiveStakes(view)))} Legacy</b>
              ) : (
                stand.stood && !stand.between && stand.raise !== undefined && <b className="sob-chip">+{stand.raise} Legacy</b>
              )}
            </span>
          )}
          <SettingsMenu className="hud-settings" icon="gear" />
        </div>
      </div>
      {profile('B', true)}
    </header>
  );
}
