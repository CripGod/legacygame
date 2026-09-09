import '../compendium.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CHARACTERS, EVENTS, LOCATIONS, LOCATION_BY_ID, THREATS, type CardDef, type LocationDef, type ThreatDef } from '../../engine';
import { CardFace } from '../components/CardFace';
import { CodexSheet } from '../components/CodexSheet';
import { Art } from '../components/Art';
import { artMissing, artUrl, markArtMissing } from '../art';
import { locationName, threatLabel, useDisplay } from '../display';
import { Wordmark } from '../components/Wordmark';

/** The chapters, in reading order. `short` is the label in the sticky nav. */
const CHAPTERS = [
  { id: 'historical', title: 'Historical', short: 'Historical', lede: 'People who lived. Each card prints what it costs to play, the Influence it brings and the Force it can bring to bear against a Threat.' },
  { id: 'artists', title: 'Artists', short: 'Artists', lede: 'Sculptors, painters, a quilter and a potter. The work outlasts its maker: their Reveals leave lasting Influence on the Location itself, which stays when they are gone.' },
  { id: 'mythic', title: 'Mythic', short: 'Mythic', lede: 'Orisha, tricksters and figures of faith and folklore. Every deck carries at least one.' },
  { id: 'arrivals', title: 'Gatherings and arrivals', short: 'Gatherings', lede: 'Never in a deck. The board hands them out when the world earns them: a set completed, a crowd assembled, a ship that lands.' },
  { id: 'events', title: 'Events', short: 'Events', lede: 'Played into the Event slot beneath a Location. They resolve everywhere at once; the Location only decides what is added. Curses act on the opponent.' },
  { id: 'locations', title: 'Locations', short: 'Locations', lede: 'Three are drawn each match. Every place has a rule of its own; some transform, some fall under curfew at night, some never see a Threat at all.' },
  { id: 'threats', title: 'Threats', short: 'Threats', lede: 'History pushes back. Bring enough Force to bear in a single turn to clear one, or learn to live under it.' },
] as const;

type ChapterId = (typeof CHAPTERS)[number]['id'];

const REGION: Record<string, string> = { americas: 'The Americas', africa: 'Africa', atlantic: 'The Atlantic' };

/**
 * Where each painting's subject sits, as an object-position. The plates crop the square paintings to a
 * wide band, so a plate whose subject is high (a funnel, a skyline, faces in a crowd) is told to look up.
 */
const FOCUS: Record<string, string> = {
  black_star: '50% 36%',
  accra_ghana: '50% 36%',
  lagos: '50% 40%',
  juneteenth: '50% 40%',
  great_migration: '50% 40%',
  greenwood: '50% 45%',
  gary_indiana: '50% 46%',
};

function roman(n: number): string {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

function byCostThenName(a: CardDef, b: CardDef): number {
  return a.cost - b.cost || a.name.localeCompare(b.name);
}

/** "The Black Star" → BS, "Accra, Ghana" → AG, "Lagos" → LA. */
function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !/^(the|of|and|a|an)$/i.test(w));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The nearest ancestor that scrolls vertically (the `.screen` today), or null for the window. */
function findScroller(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === 'auto' || o === 'scroll') return n;
  }
  return null;
}

function StarRule({ className }: { className?: string }) {
  return (
    <div className={`cx-star ${className ?? ''}`} aria-hidden>
      ✦
    </div>
  );
}

/** The dark medallion with initials, used wherever a painting is missing (or in placeholder mode). */
function Medallion({ text, caption }: { text: string; caption?: string }) {
  return (
    <div className="cx-medal" aria-hidden>
      <span>{text}</span>
      {caption && <small>{caption}</small>}
    </div>
  );
}

/** A gold chamfered frame around a piece of art. */
function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`cx-glow soft ${className ?? ''}`}>
      <div className="cx-frame cx-oct">
        <div className="cx-frame-in">{children}</div>
      </div>
    </div>
  );
}

function ChapterHead({ n, title, lede, count, unit }: { n: number; title: string; lede: string; count: number; unit: string }) {
  return (
    <div className="cx-chapter-head">
      <div className="cx-kicker">
        Chapter {roman(n)} · {count} {unit}
      </div>
      <h2>{title}</h2>
      <StarRule />
      <p>{lede}</p>
    </div>
  );
}

function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="cx-glow">
      <article className={`cx-page cx-framed ${className ?? ''}`}>{children}</article>
    </div>
  );
}

/** The word the card's ribbon prints (mirrors CardFace): the kind for Events and Mythic or Gathering figures, else the last tag. */
function ribbonText(def: CardDef): string {
  if (def.kind === 'event') return def.curse ? 'Curse' : 'Event';
  if (def.keywords?.includes('INFORMANT')) return 'Informant';
  if (def.category === 'mythic') return 'Mythic';
  if (def.category === 'gathering') return 'Gathering';
  if (def.category === 'artist') return 'Artist';
  const t = def.tags.filter((x) => x !== 'Black');
  return t[t.length - 1] ?? 'Historical';
}

function CardGrid({ cards, onOpen }: { cards: CardDef[]; onOpen: (id: string) => void }) {
  return (
    <div className="cx-cards">
      {cards.map((c) => (
        <div className={`cx-card ${c.name.length >= 20 ? 'long' : ''} ${ribbonText(c).length >= 13 ? 'wide' : ''}`} key={c.id}>
          <CardFace id={c.id} onClick={() => onOpen(c.id)} />
        </div>
      ))}
    </div>
  );
}

type NightArt = 'unknown' | 'ok' | 'missing';

/** One atlas plate per Location: the painting in a wide band, the rule of the place, the story. */
function LocationPlate({ loc, n, placeholders }: { loc: LocationDef; n: number; placeholders: boolean }) {
  const [night, setNight] = useState(false);
  const nightId = `${loc.id}_night`;
  // A night painting is drawn only once it is known to exist, so the toggle never shows a broken image:
  // one probe per Location per session, and a miss is remembered.
  const [nightArt, setNightArt] = useState<NightArt>(() => (artMissing('locations', nightId) ? 'missing' : 'unknown'));
  useEffect(() => {
    if (!loc.curfew || placeholders || nightArt !== 'unknown') return;
    let live = true;
    const probe = new Image();
    probe.onload = () => {
      if (live) setNightArt('ok');
    };
    probe.onerror = () => {
      markArtMissing('locations', nightId);
      if (live) setNightArt('missing');
    };
    probe.src = artUrl('locations', nightId);
    return () => {
      live = false;
    };
  }, [loc.curfew, placeholders, nightArt, nightId]);

  const name = locationName(loc.id, placeholders);
  const medal = <Medallion text={monogram(name)} caption="Art to come" />;
  const painted = night && nightArt === 'ok';
  const dusk = night && !painted;
  const chips: ReactNode[] = [];
  if (loc.curfew && placeholders) chips.push(<span key="curfew" className="cx-chip warn">Curfew at night</span>);
  if (loc.noThreats) chips.push(<span key="nothreats" className="cx-chip good">Threats never appear here</span>);
  if (loc.immuneThreats?.length) chips.push(<span key="immune" className="cx-chip good">Immune to {loc.immuneThreats.map((t) => threatLabel(t, placeholders)).join(', ')}</span>);
  if (loc.timedThreat) chips.push(<span key="timed" className="cx-chip warn">Turn {loc.timedThreat.turn}: {threatLabel(loc.timedThreat.threatId, placeholders)} arrives</span>);
  if (loc.spawnOnReveal) chips.push(<span key="spawn" className="cx-chip warn">Reveals with a {threatLabel(loc.spawnOnReveal, placeholders)}</span>);
  if (loc.transformsInto) chips.push(<span key="transform" className="cx-chip">Becomes {locationName(loc.transformsInto.id, placeholders)} after {loc.transformsInto.afterTurns} turns</span>);
  if (loc.notInPool) {
    const from = LOCATIONS.find((l) => l.transformsInto?.id === loc.id);
    chips.push(<span key="pool" className="cx-chip">{from ? `Reached from ${locationName(from.id, placeholders)}` : 'Never drawn directly'}</span>);
  }
  // The Day / Night control lives in the caption, beside the chip that names the hour. Not in placeholder mode:
  // the medallion has no night to show.
  const clock = loc.curfew && !placeholders;
  return (
    <Page className={`cx-loc ${n % 2 ? 'flip' : ''}`}>
      <div className="cx-loc-art" style={{ '--focus': FOCUS[loc.id] ?? '50% 42%' } as CSSProperties}>
        <Frame>
          {placeholders ? (
            medal
          ) : (
            <>
              <Art kind="locations" id={loc.id} className={`cx-img ${dusk ? 'dusk' : ''}`} fallback={medal} alt={name} />
              {painted && <Art kind="locations" id={nightId} className="cx-img cx-img-night" fallback={null} alt={`${name} at night`} />}
              {dusk && (
                <>
                  <div className="cx-veil" aria-hidden />
                  <div className="cx-veil-lift" aria-hidden />
                </>
              )}
            </>
          )}
        </Frame>
      </div>
      <div className="cx-loc-body">
        <div className="cx-plate-no">Plate {roman(n + 1)}</div>
        <h3>{name}</h3>
        {!placeholders && (loc.era || loc.region) && (
          <div className="cx-meta">
            {loc.era && <span>{loc.era}</span>}
            {loc.region && <span>{REGION[loc.region] ?? loc.region}</span>}
          </div>
        )}
        <div className="cx-rule">
          <span className="cx-kw">Rule of the place</span>
          {loc.rule}
        </div>
        {!placeholders && loc.blurb && <p className="cx-blurb">{loc.blurb}</p>}
        {(chips.length > 0 || clock) && (
          <div className="cx-chips">
            {clock && (
              <>
                <div className="cx-daynight cx-ctl" role="group" aria-label="Time of day">
                  <button className={night ? '' : 'on'} onClick={() => setNight(false)} aria-pressed={!night}>
                    ☀ Day
                  </button>
                  <button className={night ? 'on' : ''} onClick={() => setNight(true)} aria-pressed={night}>
                    ☾ Night
                  </button>
                </div>
                <span className={`cx-chip ${night ? 'warn' : ''}`}>{night ? 'Night · curfew, nobody relocates out' : 'Day · free to leave'}</span>
              </>
            )}
            {chips}
          </div>
        )}
      </div>
    </Page>
  );
}

function familyClass(family: string): string {
  if (family === 'Systemic Pressure') return 'systemic';
  if (family === 'Complicit Beneficiary' || family === 'Collaborator') return 'complicit';
  if (family === 'Crisis') return 'crisis';
  return '';
}

function ThreatEntry({ t, placeholders }: { t: ThreatDef; placeholders: boolean }) {
  const name = threatLabel(t.id, placeholders);
  const medal = <Medallion text={monogram(name)} />;
  return (
    <article className="cx-threat">
      <div className="cx-threat-art">
        <Frame>{placeholders ? medal : <Art kind="threats" id={t.id} className="cx-img" fallback={medal} alt={name} />}</Frame>
      </div>
      <div className="cx-threat-head">
        <h3>{name}</h3>
        {!placeholders && <span className={`cx-family ${familyClass(t.family)}`}>{t.family}</span>}
      </div>
      <div className="cx-threat-rest">
        <p className="cx-threat-text">{t.text}</p>
        <div className="cx-stats">
          <span className="cx-stat">
            <i className="cx-orb">{t.force}</i> Force in one turn
          </span>
          {t.requiresBoth && <span className="cx-chip warn">Both players must contribute</span>}
          {t.split && <span className="cx-chip">One per player</span>}
          {t.lostAfterTurns && <span className="cx-chip warn">Location lost after {t.lostAfterTurns} turns</span>}
        </div>
      </div>
      {!placeholders && t.blurb && <p className="cx-blurb cx-threat-blurb">{t.blurb}</p>}
    </article>
  );
}

/** The whole game in one illuminated atlas: Characters by kind, Events, Locations with their art, Threats. */
export function CardsScreen({ onBack }: { onBack: () => void }) {
  const { placeholders } = useDisplay();
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<ChapterId>('historical');
  const [edges, setEdges] = useState({ l: false, r: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const shown = CHARACTERS.filter((c) => !c.hidden);
  const historical = shown.filter((c) => c.category !== 'mythic' && c.category !== 'gathering' && c.category !== 'artist' && !c.spawn).sort(byCostThenName);
  const artists = shown.filter((c) => c.category === 'artist' && !c.spawn).sort(byCostThenName);
  const mythic = shown.filter((c) => c.category === 'mythic' && !c.spawn).sort(byCostThenName);
  const arrivals: CardDef[] = [...shown.filter((c) => c.category === 'gathering' || c.spawn), ...EVENTS.filter((e) => e.spawn)].sort(byCostThenName);
  const events: CardDef[] = EVENTS.filter((e) => !e.spawn).sort(byCostThenName);
  const costs = [...new Set(historical.map((c) => c.cost))].sort((a, b) => a - b);
  // Locations in the order they transform: a place reached by transformation follows its origin. Each once.
  const seen = new Set<string>();
  const locations: LocationDef[] = [];
  const add = (l: LocationDef | undefined) => {
    if (l && !l.hidden && !seen.has(l.id)) {
      seen.add(l.id);
      locations.push(l);
    }
  };
  for (const l of LOCATIONS) {
    if (l.notInPool) continue;
    add(l);
    const to = l.transformsInto ? LOCATION_BY_ID[l.transformsInto.id] : undefined;
    if (to?.notInPool) add(to);
  }
  for (const l of LOCATIONS) add(l);

  const chapter = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)!;
  const chapterLabel = (id: ChapterId) => `Chapter ${roman(CHAPTERS.findIndex((c) => c.id === id) + 1)} · ${chapter(id).title}`;
  // The sheet is labelled by the chapter its card came from.
  const sheetLabel = new Map<string, string>();
  for (const c of historical) sheetLabel.set(c.id, chapterLabel('historical'));
  for (const c of mythic) sheetLabel.set(c.id, chapterLabel('mythic'));
  for (const c of arrivals) sheetLabel.set(c.id, chapterLabel('arrivals'));
  for (const c of events) sheetLabel.set(c.id, chapterLabel('events'));

  // The sticky nav follows the reader: the last chapter whose top has passed the nav is the current one.
  useEffect(() => {
    const scroller = findScroller(rootRef.current);
    const target: HTMLElement | Window = scroller ?? window;
    let raf = 0;
    const update = () => {
      raf = 0;
      const edge = (scroller ? scroller.getBoundingClientRect().top : 0) + 100;
      let cur: ChapterId = CHAPTERS[0].id;
      for (const c of CHAPTERS) {
        const el = document.getElementById(`cx-${c.id}`);
        if (el && el.getBoundingClientRect().top <= edge) cur = c.id;
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // The chapter strip scrolls sideways where it does not fit: fade the edges that hide more, and keep the
  // current chapter in view.
  const updateEdges = () => {
    const el = navRef.current;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((cur) => (cur.l === l && cur.r === r ? cur : { l, r }));
  };
  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, []);
  useEffect(() => {
    const track = navRef.current;
    const btn = track?.querySelector<HTMLElement>('button.on');
    if (!track || !btn || track.scrollWidth <= track.clientWidth) return;
    const left = btn.offsetLeft - (track.clientWidth - btn.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  const go = (id: ChapterId) => document.getElementById(`cx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const total = historical.length + mythic.length + arrivals.length + events.length;

  return (
    <div className="screen">
      <div className="inner cx-inner" ref={rootRef}>
        <header className="cx-title cx-framed">
          <Wordmark className="cx-logo" />
          <div className="cx-kicker">Black History Card Battler</div>
          <h1>Compendium</h1>
          <StarRule className="ink" />
          <p>
            An illuminated atlas of the whole game: {total} cards, {locations.length} Locations and {THREATS.length} Threats, with the history behind each.
          </p>
        </header>

        <nav className="cx-nav" aria-label="Chapters">
          <button className="cx-back" onClick={onBack}>
            ← Back
          </button>
          <div className={`cx-nav-track ${edges.l ? 'l' : ''} ${edges.r ? 'r' : ''}`}>
            <div className="cx-nav-scroll" ref={navRef} onScroll={updateEdges}>
              {CHAPTERS.map((c) => (
                <button key={c.id} className={active === c.id ? 'on' : ''} onClick={() => go(c.id)} aria-current={active === c.id ? 'true' : undefined}>
                  {c.short}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <section id="cx-historical" className="cx-chapter">
          <ChapterHead n={1} title={chapter('historical').title} lede={chapter('historical').lede} count={historical.length} unit="cards" />
          <Page>
            {costs.map((cost) => (
              <div className="cx-group" key={cost}>
                <div className="cx-sub">
                  Cost <b>{cost}</b>
                </div>
                <CardGrid cards={historical.filter((c) => c.cost === cost)} onOpen={setOpen} />
              </div>
            ))}
          </Page>
        </section>

        <section id="cx-artists" className="cx-chapter">
          <ChapterHead n={2} title={chapter('artists').title} lede={chapter('artists').lede} count={artists.length} unit="cards" />
          <Page>
            <CardGrid cards={artists} onOpen={setOpen} />
          </Page>
        </section>

        <section id="cx-mythic" className="cx-chapter">
          <ChapterHead n={3} title={chapter('mythic').title} lede={chapter('mythic').lede} count={mythic.length} unit="cards" />
          <Page>
            <CardGrid cards={mythic} onOpen={setOpen} />
          </Page>
        </section>

        <section id="cx-arrivals" className="cx-chapter">
          <ChapterHead n={4} title={chapter('arrivals').title} lede={chapter('arrivals').lede} count={arrivals.length} unit="cards" />
          <Page>
            <CardGrid cards={arrivals} onOpen={setOpen} />
          </Page>
        </section>

        <section id="cx-events" className="cx-chapter">
          <ChapterHead n={5} title={chapter('events').title} lede={chapter('events').lede} count={events.length} unit="cards" />
          <Page>
            <CardGrid cards={events} onOpen={setOpen} />
          </Page>
        </section>

        <section id="cx-locations" className="cx-chapter">
          <ChapterHead n={6} title={chapter('locations').title} lede={chapter('locations').lede} count={locations.length} unit="plates" />
          {locations.map((l, i) => (
            <LocationPlate key={l.id} loc={l} n={i} placeholders={placeholders} />
          ))}
        </section>

        <section id="cx-threats" className="cx-chapter">
          <ChapterHead n={7} title={chapter('threats').title} lede={chapter('threats').lede} count={THREATS.length} unit="entries" />
          <Page>
            <div className="cx-threats">
              {THREATS.map((t) => (
                <ThreatEntry key={t.id} t={t} placeholders={placeholders} />
              ))}
            </div>
          </Page>
        </section>

        <footer className="cx-colophon">
          <StarRule />
          <div>Here ends the Compendium. Tap any card to read it in full.</div>
          <button className="cx-btn cx-ctl" onClick={onBack}>
            ← Back to the menu
          </button>
        </footer>

        {open && <CodexSheet id={open} label={sheetLabel.get(open) ?? 'Compendium'} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}
