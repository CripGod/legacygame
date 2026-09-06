import { CARD_BY_ID, type CharacterInstance, type GameState, charInfluence, isSuppressed } from '../../engine';
import { abilityLines, cardName, cardShort, hueFor, initials, useDisplay } from '../display';
import { tip, HINTS } from '../tip';

/** Full collectible card (hand, inspection). Always a 5:7 rigid rectangle. */
export function CardFace({ id, big = false, onClick }: { id: string; big?: boolean; onClick?: () => void }) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const isChar = def.kind === 'character';
  return (
    <div className={`card ${big ? 'big' : ''} ${isChar ? '' : 'event'}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {isChar ? (
        <>
          <div className="hex i" {...tip(HINTS.influence)}>
            {def.influence}
          </div>
          <div className="hex f" {...tip(HINTS.force)}>
            {def.force}
          </div>
        </>
      ) : (
        <div className="hex e" {...tip(HINTS.event)}>
          EV
        </div>
      )}
      <div className="portrait-wrap">
        <div className="portrait" style={{ background: hueFor(id) }}>
          {initials(id, placeholders)}
        </div>
      </div>
      <div className="name">{cardName(id, placeholders)}</div>
      {big && isChar && !placeholders && <div className="era">{def.era}</div>}
      <div className="text">
        {abilityLines(def).map((l) => (
          <div key={l.label}>
            <span className="kw">{l.label}:</span> {l.text}
          </div>
        ))}
        {big && !placeholders && <div className="blurb">{def.blurb}</div>}
        {big && isChar && (
          <div className="era" style={{ marginTop: 6 }}>
            {def.tags.length ? def.tags.join(' · ') : ''}
          </div>
        )}
        {big && (
          <div className="legend">
            {isChar ? (
              <>
                <div>
                  <span className="hex i small">{def.influence}</span> {HINTS.influence}
                </div>
                <div>
                  <span className="hex f small">{def.force}</span> {HINTS.force}
                </div>
              </>
            ) : (
              <div>
                <span className="hex e small">EV</span> {HINTS.event}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Square portrait tile used at the Gates and Inside Locations. */
export function Pic({
  state,
  c,
  strip,
  onClick,
  highlight,
}: {
  state: GameState;
  c: CharacterInstance;
  strip?: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[c.defId];
  if (!def || def.kind !== 'character') return null;
  const inf = charInfluence(state, c);
  let label = strip;
  if (!label && c.zone === 'gate') {
    label = c.blockedEnterTurn === state.turn ? 'Blocked' : c.ready ? 'Ready' : 'Fresh';
  }
  const cls = label ? label.toLowerCase() : '';
  return (
    <div
      className={`pic ${c.owner} ${isSuppressed(state, c) ? 'suppressed' : ''} ${highlight ? 'highlight' : ''}`}
      style={{ background: hueFor(c.defId) }}
      onClick={onClick}
      title={`${cardName(c.defId, placeholders)} · ${inf} Influence · ${def.force} Force`}
    >
      <span className="ini">{initials(c.defId, placeholders)}</span>
      <span className="inf" {...tip(HINTS.currentInfluence)}>
        {inf}
      </span>
      {label && (
        <span className={`strip ${cls}`} {...tip((HINTS as Record<string, string>)[cls] ?? label)}>
          {label}
        </span>
      )}
    </div>
  );
}

/** Ghost tile for a card planned but not yet resolved. */
export function PlannedPic({ cardId }: { cardId: string }) {
  const { placeholders } = useDisplay();
  return (
    <div className="pic ghost" style={{ background: hueFor(cardId) }}>
      <span className="ini">{initials(cardId, placeholders)}</span>
      <span className="strip planned" {...tip(HINTS.planned)}>
        {cardShort(cardId, placeholders)}
      </span>
    </div>
  );
}
