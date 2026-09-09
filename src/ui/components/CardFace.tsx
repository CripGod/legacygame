import { CARD_BY_ID, type CharacterInstance, type GameState, charInfluence, isSuppressed } from '../../engine';
import { abilityLines, cardName, cardShort, hueFor, initials, useDisplay } from '../display';
import { Art } from './Art';
import { tip, HINTS } from '../tip';

/** The one-word role under the name: Mythic, Curse, Event, or the card's most specific tag. */
function ribbonFor(def: { kind: string; category?: string; tags?: string[]; curse?: boolean }): string {
  if (def.kind === 'event') return def.curse ? 'Curse' : 'Event';
  if ((def as { keywords?: string[] }).keywords?.includes('INFORMANT')) return 'Informant';
  if (def.category === 'mythic') return 'Mythic';
  if (def.category === 'gathering') return 'Gathering';
  if (def.category === 'artist') return 'Artist';
  const t = (def.tags ?? []).filter((x) => x !== 'Black');
  return t[t.length - 1] ?? 'Historical';
}

/** The short rules line printed on the small card. */
function abilityFor(def: { kind: string; text?: string; summary?: string; reveal?: { text: string }; established?: { text: string }; passive?: { text: string } }): string {
  if (def.summary) return def.summary;
  if (def.kind === 'event') return def.text ?? '';
  return def.reveal?.text ?? def.established?.text ?? def.passive?.text ?? '';
}

/** Long names step down a size so they never outgrow the two-line name box. */
function nameSize(name: string): string {
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  if (name.length > 22 || longest > 11) return 'xlong';
  if (name.length > 15 || longest > 9) return 'long';
  return '';
}

/** Full collectible card (hand, inspection). Always a 5:7 rigid rectangle. */
export function CardFace({ id, big = false, onClick, cost, costWhy }: { id: string; big?: boolean; onClick?: () => void; /** Cost right now, after discounts (defaults to the printed cost). */ cost?: number; costWhy?: string[] }) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const isChar = def.kind === 'character';
  const curse = !isChar && !!(def as { curse?: boolean }).curse;
  return (
    <div className={`card ${big ? 'big' : ''} ${isChar ? '' : 'event'} ${curse ? 'curse' : ''} ${isChar && def.keywords.includes('INFORMANT') ? 'informant' : ''} ${isChar && def.category === 'artist' ? 'artist' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className={`cost ${cost !== undefined && cost < def.cost ? 'discounted' : ''}`} {...tip(cost !== undefined && cost < def.cost ? `Costs ${cost} right now instead of ${def.cost}${costWhy?.length ? ': ' + costWhy.join(', ') : ''}.` : HINTS.cost)}>
        {cost ?? def.cost}
      </div>
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
      <div className="card-art" style={{ background: hueFor(id) }}>
        {placeholders ? <span className="ini">{initials(id, true)}</span> : <Art kind={isChar ? 'characters' : 'events'} id={id} className="portrait-img" fallback={<span className="ini">{initials(id, false)}</span>} alt={def.name} />}
      </div>
      <div className="card-body">
        <div className={`name ${nameSize(cardName(id, placeholders))}`}>{cardName(id, placeholders)}</div>
        {!placeholders && <div className="ribbon">{ribbonFor(def)}</div>}
        {!big && !placeholders && <div className="rule-line" aria-hidden />}
        {!big && !placeholders && <div className="ability">{abilityFor(def)}</div>}
        {big && isChar && !placeholders && <div className="era">{def.era}</div>}
        <div className="text">
        {big && abilityLines(def).map((l) => (
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
        </div>
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
  badges,
  focus,
  fx,
}: {
  state: GameState;
  c: CharacterInstance;
  strip?: string;
  onClick?: () => void;
  highlight?: boolean;
  /** Board animation for a clash beat: the striker lunges, the victim is knocked away. */
  fx?: 'strike' | 'knocked' | 'hexed';
  /** Gate tiles: show cost, Influence and Force like a small card. */
  badges?: boolean;
  /** Replay: this piece is the one acting in the current beat. */
  focus?: boolean;
}) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[c.defId];
  if (!def || def.kind !== 'character') return null;
  const inf = charInfluence(state, c);
  let label = strip;
  if (!label && c.zone === 'gate') {
    label = def.keywords.includes('INFORMANT') ? 'Informant' : c.blockedEnterTurn === state.turn ? 'Blocked' : c.ready ? 'Ready' : 'Fresh';
  }
  const cls = label ? label.toLowerCase() : '';
  const locNow = state.locations[c.location];
  const atHome = !!def.home && locNow?.revealed && def.home.locations.includes(locNow.defId);
  return (
    <div
      className={`pic ${c.owner} ${isSuppressed(state, c) ? 'suppressed' : ''} ${highlight ? 'highlight' : ''} ${focus ? 'focus' : ''} ${atHome ? 'home' : ''} ${fx ? `fx-${fx}` : ''}`}
      style={{ background: hueFor(c.defId), ...(fx === 'strike' ? { ['--fx-dy' as string]: c.owner === state.viewFor ? -1 : 1 } : {}) }}
      onClick={onClick}
      title={`${cardName(c.defId, placeholders)} · ${inf} Influence · ${def.force} Force`}
    >
      {placeholders ? <span className="ini">{initials(c.defId, true)}</span> : <Art kind="characters" id={c.defId} className="pic-img" fallback={<span className="ini">{initials(c.defId, false)}</span>} alt={def.name} />}
      {badges ? (
        <>
          <span className="b b-cost" {...tip(HINTS.cost)}>
            {def.cost}
          </span>
          <span className="b b-inf" {...tip(HINTS.currentInfluence)}>
            {inf}
          </span>
          <span className="b b-force" {...tip(HINTS.force)}>
            {def.force}
          </span>
        </>
      ) : (
        <span className="inf" {...tip(HINTS.currentInfluence)}>
          {inf}
        </span>
      )}
      {atHome && (
        <span className="home-mark" {...tip(HINTS.home)}>
          ⌂
        </span>
      )}
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
      {placeholders ? <span className="ini">{initials(cardId, true)}</span> : <Art kind="characters" id={cardId} className="pic-img" fallback={<span className="ini">{initials(cardId, false)}</span>} />}
      <span className="strip planned" {...tip(HINTS.planned)}>
        {cardShort(cardId, placeholders)}
      </span>
    </div>
  );
}
