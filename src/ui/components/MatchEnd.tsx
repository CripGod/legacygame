import { useEffect, useRef, useState } from 'react';
import { CARD_BY_ID, other, type GameState, type PlayerId } from '../../engine';
import { initials, locationName, useDisplay } from '../display';
import { Art } from './Art';
import { balance } from '../legacy';
import { artUrl } from '../art';
import { reduceMotion } from '../motion';

/** The kit's three glyph stars over the banner (Brightside's Victory board): centres relative to the banner's shell
 *  centre in the banner's 1x px, rotation, and scale against the banner (docs/ui-kit-cut/brightside/manifest.json). */
const STARS = [
  { slot: 'left', cx: -237.41, cy: -218.88, rot: -15, sc: 0.973 },
  { slot: 'middle', cx: 5.79, cy: -330.06, rot: 0, sc: 1.465 },
  { slot: 'right', cx: 242.04, cy: -218.88, rot: 15, sc: 0.973 },
] as const;
/** The kit's burst: 26 dots in three inks, 5 to 12 px, thrown 58 to 150 px, 0.95 s, fading over the back half. */
const INKS = ['#DFD6C4', '#FFE9AE', '#FFFFFF'];

/**
 * The match-end banner from the Brightside kit: the wordless ribbon with the live word (Fredoka 700 at the kit's seat),
 * and the three stars popping up over it one after another, left to right: the ones earned light with the kit's burst
 * (all three, the clean sweep, with the flare too), the rest come up grey. The word and the arc scale with the ribbon's width (--k).
 */
function EndRibbon({ title, tone, stage, stars }: { title: string; tone: 'win' | 'loss' | 'draw'; stage: 1 | 2; /** Stars earned, 0 to 3, lit left to right. */ stars: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [flare, setFlare] = useState(false);
  const lit = stars;
  useEffect(() => {
    if (stage !== 1) return;
    const quick = reduceMotion();
    const timers: number[] = [];
    STARS.forEach((st, i) => {
      timers.push(
        window.setTimeout(() => {
          setShown(i + 1);
          const isLit = i < stars;
          if (isLit && !quick) burst(box.current, st.slot);
          if (stars === STARS.length && i === STARS.length - 1) timers.push(window.setTimeout(() => setFlare(true), 200));
        }, quick ? 0 : 620 + i * 380),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [stage, tone, stars]);
  return (
    <div className="end-ribbon" ref={box} aria-hidden>
      <i className="ribbon-glow" />
      <img className="ribbon-base" src={artUrl('kit', 'ribbon', 'webp')} alt="" />
      <span className="ribbon-word">{title}</span>
      <div className="ribbon-stars">
        <img className={`star-flare ${flare ? 'on' : ''}`} src={artUrl('kit', 'star-flare', 'webp')} alt="" />
        {STARS.map((st, i) => (
          <i
            key={st.slot}
            className={`star ${st.slot} ${shown > i ? 'in' : ''} ${shown > i && i < lit ? 'lit' : 'dim'}`}
            style={{ '--sx': st.cx, '--sy': st.cy, '--srot': `${st.rot}deg`, '--sc': st.sc } as React.CSSProperties}
          >
            <img src={artUrl('kit', 'star-glyph', 'webp')} alt="" />
          </i>
        ))}
      </div>
    </div>
  );
}

/** The kit's burst out of a star: dots in the three inks thrown in an even fan with a small stagger. */
function burst(box: HTMLDivElement | null, slot: string): void {
  if (!box) return;
  const star = box.querySelector(`.star.${slot}`);
  if (!star) return;
  const br = box.getBoundingClientRect();
  const sr = star.getBoundingClientRect();
  const k = br.width / 807;
  const cx = sr.left + sr.width / 2 - br.left;
  const cy = sr.top + sr.height / 2 - br.top;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('i');
    dot.className = 'burst-dot';
    const size = (5 + Math.random() * 7) * k * 1.8;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    dot.style.background = INKS[i % INKS.length];
    box.appendChild(dot);
    const a = ((i + Math.random() * 0.6) / n) * Math.PI * 2;
    const d = (58 + Math.random() * 92) * k * 1.4;
    const anim = dot.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1, offset: 0 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d * 0.7}px), calc(-50% + ${Math.sin(a) * d * 0.7}px)) scale(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.8)`, opacity: 0, offset: 1 },
      ],
      { duration: 950, delay: (i % 5) * 18, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => dot.remove();
  }
}

/**
 * The end of a match, on the board (Hearthstone's banner, Snap's result panel): the word slams in over the
 * stamped Locations, then fades as the result panel opens in the centre over a near-black scrim; "Look at the
 * board" lifts the scrim and leaves a slim bar. No separate screen.
 *   stage 1: the banner only.  stage 2: the banner lifts, the panel rises.
 */
export function MatchEnd({
  view,
  me,
  stage,
  collapsed,
  onCollapse,
  onAgain,
  onRematch,
  onMenu,
}: {
  view: GameState;
  me: PlayerId;
  stage: 1 | 2;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  onAgain: () => void;
  onRematch: () => void;
  onMenu: () => void;
}) {
  const { placeholders } = useDisplay();
  const r = view.result;
  const [stats, setStats] = useState(false);
  const winner = r?.winner ?? null;
  const mineWon = winner === me;
  const tone: 'win' | 'loss' | 'draw' = winner ? (mineWon ? 'win' : 'loss') : 'draw';
  // The wallet counts up from what it held before this match's Legacy was banked.
  const after = balance();
  const gain = mineWon && r ? r.payout : 0;
  const [wallet, setWallet] = useState(after - gain);
  useEffect(() => {
    if (stage < 2 || gain <= 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start - 500) / 900);
      setWallet(Math.round(after - gain + gain * Math.max(0, 1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, after, gain]);
  // Once the panel is up, the ribbon docks on its top edge: the panel is centred, so its top is half the room above it.
  const panelRef = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(0);
  useEffect(() => {
    if (stage < 2 || collapsed) return;
    const measure = () => {
      const el = panelRef.current;
      if (el) setDock(Math.round((window.innerHeight - el.getBoundingClientRect().height) / 2));
    };
    measure();
    const id = window.setTimeout(measure, 550); // after the panel's rise
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [stage, collapsed, stats]);
  if (!r) return null;
  const handle = (p: PlayerId) => view.players[p].handle;
  const title = tone === 'win' ? 'VICTORY' : tone === 'loss' ? 'DEFEAT' : 'DRAW';
  // Three stars: the Locations you took. Two of three is the usual win; all three is the clean sweep; a win on the
  // tiebreak or by the other side sitting down is one.
  const stars = !mineWon ? 0 : r.reason === 'locations' ? Math.max(1, r.locationWinners.filter((w) => w === me).length) : 1;
  const line = winner ? `${handle(winner)} wins ${r.payout} Legacy${r.sweep ? ` (clean sweep, +${r.bonus})` : ''}` : 'Nobody wins the Legacy';
  const reason =
    r.reason === 'locations' ? (r.sweep ? 'All three Locations: a clean sweep.' : 'Two of three Locations.') : r.reason === 'tiebreak-influence' ? 'One Location each: total Influence decides.' : r.reason === 'tiebreak-force' ? 'Tied on Influence: total Force decides.' : r.reason === 'stepOff' ? (mineWon ? `${handle(other(me))} sat down.` : 'You sat down.') : 'Nothing separates them.';
  const profile = (p: PlayerId) => {
    const ps = view.players[p];
    return (
      <div className={`end-profile p${p} ${winner === p ? 'won' : ''}`}>
        <div className="end-avatar">{placeholders ? initials(ps.avatarDefId, true) : <Art kind="characters" id={ps.avatarDefId} className="avatar-img" fallback={initials(ps.avatarDefId, false)} alt={CARD_BY_ID[ps.avatarDefId]?.name} />}</div>
        <div className="end-handle">{ps.handle}</div>
      </div>
    );
  };
  const st = view.stats;
  return (
    <>
      <div className={`end-banner ${tone} ${stage >= 2 ? (collapsed ? 'lift' : 'docked') : ''}`} style={{ '--dock': `${dock}px` } as React.CSSProperties} aria-live="assertive">
        <div className="end-veil" aria-hidden />
        <div className="end-flash" aria-hidden />
        <EndRibbon title={title} tone={tone} stage={stage} stars={stars} />
      </div>
      {/* A click outside the card puts it away and leaves the board; SEE RESULT in the corner brings it back. */}
      {stage >= 2 && !collapsed && <div className="end-scrim" aria-hidden onClick={() => onCollapse(true)} />}
      {stage >= 2 && !collapsed && (
        <div className={`end-panel docked ${tone}`} role="dialog" aria-label="Match result" ref={panelRef}>
          <div className="end-head">
            {profile(other(me))}
            <div className="end-vs">
              <b>{line}</b>
              <small>{reason} Turn {r.turn}.</small>
            </div>
            {profile(me)}
          </div>
          <div className="end-rows">
            {[0, 1, 2].map((i) => {
              const a = r.influence.A[i];
              const b = r.influence.B[i];
              const w = r.locationWinners[i];
              const loc = view.locations[i];
              const total = a + b;
              const fracA = total === 0 ? 0.5 : a / total;
              const label = w === 'lost' ? 'LOST' : w ? `${handle(w)} takes it` : 'Tied';
              return (
                <div key={i} className={`tally-row shown ${w && w !== 'lost' ? `won-${w}` : ''} ${w === 'lost' ? 'lost' : ''} ${w === me ? 'mine' : ''}`}>
                  <div className="tally-name">{locationName(loc.revealed ? loc.defId : 'unknown', placeholders)}</div>
                  <div className="tally-bar">
                    <span className="score pA">{a}</span>
                    <div className="line">
                      <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                      <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                      <div className="mark" style={{ left: `${fracA * 100}%` }} />
                    </div>
                    <span className="score pB">{b}</span>
                  </div>
                  <div className="tally-verdict">{label}</div>
                </div>
              );
            })}
          </div>
          <div className={`end-legacy ${gain > 0 ? 'gain' : ''}`}>
            <span className="end-legacy-lbl">Your Legacy</span>
            <b className="end-wallet">{wallet}</b>
            {gain > 0 && <span className="end-gain">+{gain}</span>}
          </div>
          {stats && (
            <table className="stats end-stats">
              <tbody>
                <tr><td>Location lead changes</td><td>{st.leadChanges}</td></tr>
                <tr><td>Final-turn flips</td><td>{st.finalTurnFlips}</td></tr>
                <tr><td>Relocations</td><td>{st.relocations.A} / {st.relocations.B}</td></tr>
                <tr><td>Setbacks</td><td>{view.players.A.setbacks} / {view.players.B.setbacks}</td></tr>
                <tr><td>Solidarity earned</td><td>{view.players.A.solidarity} / {view.players.B.solidarity}</td></tr>
                <tr><td>Stand on Business</td><td>{st.standTurns.length ? st.standTurns.map((s) => `${handle(s.player)} T${s.turn} → ${s.proposed} (${s.accepted ? 'landed' : 'opponent sat down'})`).join('; ') : '—'}</td></tr>
              </tbody>
            </table>
          )}
          <div className="end-actions">
            <button className="primary" onClick={onAgain} autoFocus>
              Play again
            </button>
            <button onClick={onRematch}>Rematch</button>
            <button className="ghost" onClick={() => onCollapse(true)}>
              Look at the board
            </button>
            <button className="ghost" onClick={() => setStats((s) => !s)}>
              {stats ? 'Hide stats' : 'Stats'}
            </button>
            <button className="ghost" onClick={onMenu}>
              Menu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
