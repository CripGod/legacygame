import { useEffect, useRef, useState } from 'react';
import { CARD_BY_ID } from '../../engine';
import type { PlayerId } from '../../engine';
import { CardFace } from './CardFace';
import { Trails, TRAIL_COLORS, type TrailShot } from './Trails';
import { cardName, useDisplay } from '../display';

/**
 * Zora Neale Hurston's Folklore, told on screen: the top cards of the deck present themselves in the centre, the
 * dearer one wins (a glow, a burst, a trail into the hand) and the other flips and goes back to the deck.
 * The owner sees the cards; the opponent sees their backs, and still sees one of them kept.
 * Phases: enter (cards rise in) → judge (the winner lights up) → resolve (winner to the hand, loser to the deck).
 */
export type DigPhase = 'enter' | 'judge' | 'resolve';
export interface DigShow {
  seen: string[];
  keep: string;
  owner: PlayerId;
  hidden: boolean;
  /** Who did the digging, for the kicker. */
  by?: string;
}

const ENTER_MS = 750;
const JUDGE_MS = 800;
const RESOLVE_MS = 850;

export function DigReveal({ dig, me, onDone, freeze }: { dig: DigShow; me: PlayerId; onDone: () => void; /** Dev: hold this phase. */ freeze?: DigPhase }) {
  const { placeholders } = useDisplay();
  const [phase, setPhase] = useState<DigPhase>(freeze ?? 'enter');
  const [shots, setShots] = useState<TrailShot[] | null>(null);
  const [fly, setFly] = useState<Record<number, string>>({});
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const done = useRef(onDone);
  done.current = onDone;
  const mine = dig.owner === me;
  /** Where the kept card goes: the visible hand (clamped to the viewport) for me, the owner's plate for the opponent. */
  const handAnchor = () => {
    const el = mine ? document.querySelector('.hand') : document.querySelector(`.profile.p${dig.owner} .plate`);
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const bottom = Math.min(r.bottom, window.innerHeight - 40);
    const top = Math.min(r.top, bottom - 40);
    return new DOMRect(r.left, top, r.width, bottom - top);
  };
  const deckAnchor = () => document.querySelector(`.profile.p${dig.owner} .plate`)?.getBoundingClientRect();
  const keepIndex = dig.hidden ? 0 : Math.max(0, dig.seen.indexOf(dig.keep));

  useEffect(() => {
    if (freeze) {
      // Dev freeze: let the cards finish rising before measuring where they fly from.
      const t = freeze === 'resolve' ? window.setTimeout(launch, ENTER_MS + 200) : 0;
      return () => window.clearTimeout(t);
    }
    const t1 = window.setTimeout(() => setPhase('judge'), ENTER_MS);
    const t2 = window.setTimeout(() => {
      setPhase('resolve');
      launch();
    }, ENTER_MS + JUDGE_MS);
    const t3 = window.setTimeout(() => done.current(), ENTER_MS + JUDGE_MS + RESOLVE_MS + 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Resolve: the winner's trail to the hand, and both cards fly to where they belong. */
  function launch() {
    const hand = handAnchor();
    const deck = deckAnchor();
    const next: Record<number, string> = {};
    const trail: TrailShot[] = [];
    dig.seen.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const target = i === keepIndex ? hand : deck;
      if (!target) return;
      const dx = target.left + target.width / 2 - (r.left + r.width / 2);
      const dy = target.top + target.height / 2 - (r.top + r.height / 2);
      next[i] = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(0.18) rotateY(${i === keepIndex ? 0 : 180}deg)`;
      if (i === keepIndex && hand) trail.push({ from: r, to: hand, color: TRAIL_COLORS[dig.owner], label: 'KEPT' });
    });
    setFly(next);
    if (trail.length) setShots(trail);
  }

  const name = (id: string) => (id === 'hidden' ? 'A card' : cardName(id, placeholders));
  return (
    <div className={`scrim dig-scrim ${phase}`} aria-live="polite">
      <div className="dig-kicker">
        <span className="dig-who">{dig.by ?? 'Zora Neale Hurston'} · Folklore</span>
        <span className="dig-line">
          {phase === 'enter' && (dig.hidden ? `Looks at the top ${dig.seen.length} cards.` : `The top ${dig.seen.length} cards of the deck.`)}
          {phase === 'judge' && (dig.hidden ? 'The dearer story stays.' : `${name(dig.keep)} is the dearer story.`)}
          {phase === 'resolve' && (dig.hidden ? 'One to the hand, the rest to the bottom.' : `${name(dig.keep)} to the hand, the rest to the bottom of the deck.`)}
        </span>
      </div>
      <div className="dig-stage">
        {dig.seen.map((id, i) => {
          const keep = i === keepIndex;
          const def = CARD_BY_ID[id];
          return (
            <div
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`dig-card ${keep ? 'keep' : 'lose'} ${dig.hidden ? 'back' : ''}`}
              style={{ '--i': i, transform: fly[i], transition: fly[i] ? 'transform 0.85s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease 0.3s' : undefined, opacity: fly[i] ? 0 : undefined } as React.CSSProperties}
            >
              {dig.hidden || !def ? (
                <div className="dig-back-face" aria-label="A face-down card">
                  <span>SOB</span>
                </div>
              ) : (
                <CardFace id={id} big />
              )}
              <div className="dig-ring" />
              {!dig.hidden && def && <div className="dig-cost">{def.cost}</div>}
            </div>
          );
        })}
      </div>
      {shots && <Trails shots={shots} onDone={() => setShots(null)} />}
    </div>
  );
}
