import { CARD_BY_ID, type CharacterInstance, type GameState, charInfluence, isSuppressed } from '../../engine';
import { abilityLines, cardName, cardShort, hueFor, initials, useDisplay } from '../display';
import { useLayoutEffect, useRef, useState } from 'react';
import { Art } from './Art';
import { artMissing, artUrl, markArtMissing } from '../art';
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
export function abilityFor(def: { kind: string; text?: string; summary?: string; reveal?: { text: string }; established?: { text: string }; passive?: { text: string } }): string {
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

/** The kind of card, for the frame's marks: the icon in the ribbon under the cost and the colour of the tag pill. */
type CardKind = 'historical' | 'mythic' | 'artist' | 'informant' | 'event' | 'curse';
function kindOf(def: { kind: string; category?: string; keywords?: string[]; curse?: boolean }): CardKind {
  if (def.kind === 'event') return def.curse ? 'curse' : 'event';
  if (def.keywords?.includes('INFORMANT')) return 'informant';
  if (def.category === 'mythic') return 'mythic';
  if (def.category === 'artist') return 'artist';
  return 'historical';
}

/** One stroke icon per kind, drawn in the frame's gold. */
/**
 * The two words in the band at the foot of a Character card, one each side of the frame's centre diamond: a field
 * and a role, read from the card's tags (first and last, past the kind tags), with a hand-picked pair where the
 * tags give only one word or an awkward one.
 */
const BAND_WORDS: Record<string, [string, string]> = {
  harriet_tubman: ['Abolition', 'Freedom'],
  john_brown: ['Abolition', 'Harpers Ferry'],
  katherine_johnson: ['Science', 'Spaceflight'],
  zora_neale_hurston: ['Harlem', 'Writer'],
  alonzo_herndon: ['Atlanta', 'Business'],
  madam_cj_walker: ['Business', 'Philanthropy'],
  scott_joplin: ['Ragtime', 'Music'],
  claudette_colvin: ['Montgomery', 'Civil Rights'],
  bessie_coleman: ['Flight', 'Aviator'],
  organizer: ['Organizing', 'Movement'],
  og: ['Elder', 'Community'],
  chairteenth: ['Gathering', 'Defense'],
  peter_prioleau: ['Charleston', 'Informant'],
  george_wilson: ['Charleston', 'Informant'],
  pharoah_and_tom: ['Richmond', 'Informant'],
  ben_woolfolk: ['Richmond', 'Informant'],
  henry_ossawa_tanner: ['Painter', 'Faith'],
  robert_duncanson: ['Landscape', 'Painter'],
  edward_bannister: ['Providence', 'Painter'],
  harriet_powers: ['Quilter', 'Faith'],
  dave_the_potter: ['Potter', 'Letters'],
};
const KIND_TAGS = new Set(['Black', 'Ally', 'Mythic', 'Gathering', 'Archetype', 'Artist']);
function bandFor(def: { id: string; tags: string[] }): [string, string] {
  const fixed = BAND_WORDS[def.id];
  if (fixed) return fixed;
  const rest = def.tags.filter((t) => !KIND_TAGS.has(t));
  if (rest.length >= 2) return [rest[0], rest[rest.length - 1]];
  return [rest[0] ?? def.tags[0] ?? '', ''];
}
/** Long words step the band's type down so they stay inside their half. */
const bandSize = (w: string) => (w.length >= 14 ? 'xlong' : w.length >= 11 ? 'long' : '');

/* Each viewBox is shifted so the glyph's ink (measured with getBBox) is centred in the box, not just its 64-unit square. */
const KIND_ICONS: Record<CardKind, React.ReactNode> = {
  historical: (
    <svg viewBox="0 0 64 64">
      <path d="M8 14c8-4 16-4 24 2 8-6 16-6 24-2v36c-8-4-16-4-24 2-8-6-16-6-24-2z" />
      <path d="M32 16v38" />
    </svg>
  ),
  mythic: (
    <svg viewBox="0 0 64 64">
      <path d="M36 4 14 36h16l-4 24 24-34H34z" />
    </svg>
  ),
  artist: (
    <svg viewBox="0 -3 64 64">
      <path d="M32 6C17 6 6 17 6 30c0 14 10 22 20 22 5 0 6-3 6-6 0-4 3-6 7-6h6c8 0 13-5 13-12C58 15 46 6 32 6z" />
      <circle cx="20" cy="26" r="3" />
      <circle cx="30" cy="17" r="3" />
      <circle cx="43" cy="20" r="3" />
    </svg>
  ),
  informant: (
    <svg viewBox="0 2.8 64 64">
      <path d="M8 22c8-6 40-6 48 0-2 16-10 26-24 30C18 48 10 38 8 22z" />
      <path d="M18 30c4-3 8-3 12 0M34 30c4-3 8-3 12 0" />
    </svg>
  ),
  event: (
    <svg viewBox="0 -2 64 64">
      <path d="M32 6l6 18h19l-15 11 6 19-16-12-16 12 6-19L7 24h19z" />
    </svg>
  ),
  curse: (
    <svg viewBox="0 -1 64 64">
      <path d="M32 8c-10 0-18 8-18 18 0 8 4 12 8 16v6h20v-6c4-4 8-8 8-16 0-10-8-18-18-18z" />
      <path d="M24 30h4M36 30h4M26 54h12" />
    </svg>
  ),
};

/**
 * The frame: the designer's PNG with its window knocked out, exported as WebP at two sizes (public/art/frames). Events
 * take their own frame when it exists and the Character frame until then; a missing file falls back the same way.
 */
function Frame({ kind, big }: { kind: 'character' | 'event'; big: boolean }) {
  const want = `${kind}${big ? '' : '-sm'}`;
  const back = `character${big ? '' : '-sm'}`;
  const [id, setId] = useState(() => (artMissing('frames', want) ? back : want));
  return <img className="tpl-frame" src={artUrl('frames', id, 'webp')} alt="" draggable={false} onError={() => { markArtMissing('frames', id); if (id !== back) setId(back); }} />;
}

/**
 * Full collectible card (hand, inspection), laid out on the frame from docs/card-template.md: every measurement is a
 * percentage of the card's width (cqw), so the one layout holds at hand size and at Codex size. At hand size the
 * parchment carries the one-line summary; the big card prints every ability and the blurb and scrolls when they run
 * long. Always a 1103 : 1426 rectangle, the frame's own shape.
 */
export function CardFace({ id, big = false, onClick, cost, costWhy, note }: { id: string; big?: boolean; onClick?: () => void; /** Cost right now, after discounts (defaults to the printed cost). */ cost?: number; costWhy?: string[]; /** A live chip over the art (Reparations: the Setback count). */ note?: string }) {
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const isChar = def.kind === 'character';
  const kind = kindOf(def);
  const curse = kind === 'curse';
  const name = cardName(id, placeholders);
  const lines = big ? abilityLines(def) : [];
  // The name fits its banner at every card size: it steps down to a legible floor, then compresses the rest, the way
  // a printed card squeezes a long name rather than letting it run into the corners. Re-measured when the card resizes.
  const nameRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const text = el.firstElementChild as HTMLElement | null;
    // The landing page's thumbnails wrap the name instead of fitting it.
    if (!text || !big) return; // small cards wrap the name instead of compressing it
    const fit = () => {
      el.style.fontSize = '';
      el.style.transform = '';
      const avail = el.clientWidth;
      const need = text.getBoundingClientRect().width;
      if (!avail || need <= avail) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      const floor = Math.max(big ? 12 : 9, base * 0.8);
      const size = Math.max(floor, (base * avail) / need);
      el.style.fontSize = `${size.toFixed(2)}px`;
      const still = text.getBoundingClientRect().width;
      if (still > avail) el.style.transform = `scaleX(${(avail / still).toFixed(3)})`;
    };
    fit();
    // The display font may land after the first paint; measure again when it does.
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(text);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [name, big]);
  // The hand card's summary steps down, never below 8.5px, when it would run past the parchment, so no line is cut.
  const rulesRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = rulesRef.current;
    const text = box?.firstElementChild as HTMLElement | null;
    // The landing page's thumbnails clamp the summary with an ellipsis instead of shrinking it.
    if (!box || !text || big || box.closest('.deck-cards')) return;
    const fit = () => {
      text.style.fontSize = '';
      text.style.webkitLineClamp = '';
      let size = parseFloat(getComputedStyle(text).fontSize);
      for (let i = 0; i < 8 && box.scrollHeight > box.clientHeight + 1 && size > 8.5; i++) {
        size = Math.max(8.5, size - 0.5);
        text.style.fontSize = `${size}px`;
      }
      // Still too tall at the floor: end on the last whole line that fits, with an ellipsis, never a half-cut line.
      if (box.scrollHeight > box.clientHeight + 1) {
        const lh = parseFloat(getComputedStyle(text).lineHeight) || size * 1.12;
        text.style.webkitLineClamp = String(Math.max(1, Math.floor((box.clientHeight - text.offsetTop + box.offsetTop) / lh)));
      }
    };
    fit();
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [id, big]);
  const band = isChar ? bandFor(def) : null;
  return (
    <div className={`card tpl ${big ? 'big' : ''} ${isChar ? '' : 'event'} ${curse ? 'curse' : ''} ${kind === 'informant' ? 'informant' : ''} ${kind === 'artist' ? 'artist' : ''} k-${kind}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="tpl-art" style={{ background: hueFor(id) }}>
        {placeholders ? <span className="ini">{initials(id, true)}</span> : <Art kind={isChar ? 'characters' : 'events'} id={id} className="tpl-art-img" fallback={<span className="ini">{initials(id, false)}</span>} alt={def.name} />}
      </div>
      {note && <span className="card-note tpl-note">{note}</span>}
      <Frame kind={isChar ? 'character' : 'event'} big={big} />
      <div className={`tpl-num tpl-cost ${cost !== undefined && cost < def.cost ? 'discounted' : ''}`} {...tip(cost !== undefined && cost < def.cost ? `Costs ${cost} right now instead of ${def.cost}${costWhy?.length ? ': ' + costWhy.join(', ') : ''}.` : HINTS.cost)}>
        {cost ?? def.cost}
      </div>
      <div className="tpl-kind" aria-hidden>
        {KIND_ICONS[kind]}
      </div>
      {/* The parchment: the name big and black at the top, the tag and era under it in gold, then the rules. */}
      <div className="tpl-body">
        <div className={`tpl-name ${nameSize(name)}`} ref={nameRef}>
          <span>{name}</span>
        </div>
        {!placeholders && <div className="tpl-meta">{isChar ? `${ribbonFor(def)}${def.era ? ` · ${def.era}` : ''}` : ribbonFor(def)}</div>}
        <div className="tpl-rules" ref={rulesRef}>
          {big ? (
            <>
              {lines.map((l, i) => (
                <div key={l.label}>
                  {i > 0 && <div className="tpl-sep" aria-hidden>◆</div>}
                  <span className="kw">{l.label}:</span> {l.text}
                </div>
              ))}
              {!placeholders && <div className="tpl-blurb">{def.blurb}</div>}
            </>
          ) : (
            !placeholders && <div className="tpl-summary">{abilityFor(def)}</div>
          )}
        </div>
      </div>
      {big && band && !placeholders && (
        <div className="tpl-strip">
          <span className={`tpl-strip-l ${bandSize(band[0])}`}>{band[0]}</span>
          <span className={`tpl-strip-r ${bandSize(band[1])}`}>{band[1]}</span>
        </div>
      )}
      {isChar && (
        <>
          <div className="tpl-num tpl-inf" {...tip(HINTS.influence)}>
            {def.influence}
          </div>
          <div className="tpl-num tpl-force" {...tip(HINTS.force)}>
            {def.force}
          </div>
        </>
      )}
    </div>
  );
}

/** Square portrait tile used at the Gates and Inside Locations. */
export function Pic({
  state,
  c,
  strip,
  onClick,
  onContextMenu,
  highlight,
  badges,
  focus,
  fx,
}: {
  state: GameState;
  c: CharacterInstance;
  strip?: string;
  onClick?: () => void;
  /** Right-click reads the piece, the way it reads a hand card. */
  onContextMenu?: (e: React.MouseEvent) => void;
  highlight?: boolean;
  /** Board animation for a clash beat: the striker gathers itself, the victim takes the hit (or holds, or is hexed), a tile lands. */
  fx?: 'windup' | 'knocked' | 'held' | 'hexed' | 'land';
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
    label = def.keywords.includes('INFORMANT') && !c.amnestied ? 'Informant' : c.blockedEnterTurn === state.turn ? 'Blocked' : c.ready ? 'Ready' : 'Fresh';
  }
  const cls = label ? label.toLowerCase() : '';
  const locNow = state.locations[c.location];
  const atHome = !!def.home && locNow?.revealed && def.home.locations.includes(locNow.defId);
  return (
    <div
      className={`pic ${c.owner} ${isSuppressed(state, c) ? 'suppressed' : ''} ${highlight ? 'highlight' : ''} ${focus ? 'focus' : ''} ${atHome ? 'home' : ''} ${fx ? `fx-${fx}` : ''}`}
      style={{ background: hueFor(c.defId) }}
      onClick={onClick}
      onContextMenu={onContextMenu}
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
