/**
 * The baked tutorial: a fixed seed and fixed decks, a stopped clock, and a scripted
 * walk through the first five turns. Every lesson either asks the player to read
 * (the board is modal'ed out behind a card) or to do one specific thing (the piece,
 * the Location or the button is spotlit and everything else is dimmed).
 */
import {
  CARD_BY_ID,
  charInfluence,
  charsOf,
  confrontForce,
  influenceAt,
  locDef,
  lockReason,
  other,
  threatForceNeeded,
  THREAT_BY_ID,
  type CharacterInstance,
  type GameState,
  type PlayerId,
  type TurnPlan,
} from '../engine';
import { cardName, locationName, threatLabel } from './display';
import { suggest } from './guide';

/** Seed 7 with Railroad vs Black Star: Greenwood reveals first (its Mob arrives on Turn 4), a 1-cost opener is in hand. */
export const TUTORIAL_SEED = 7;
export const TUTORIAL_DECKS = { A: 'railroad', B: 'blackstar' } as const;
/** After this turn the script ends and the regular coach takes over. */
export const TUTORIAL_LAST_TURN = 5;

export type Lesson =
  | { kind: 'read'; title: string; text: string }
  | {
      kind: 'do';
      text: string;
      /** Hand card to spotlight. */
      card?: string;
      /** Location column to spotlight. */
      location?: number;
      /** Battlefield flash key: 'enter' lights Ready Gate tiles, 'threat' lights Threats. */
      flash?: 'enter' | 'threat' | 'move';
      /** Spotlight the Lock In button. */
      lock?: boolean;
      /** The lesson is complete once this holds. */
      done: (view: GameState, plan: TurnPlan) => boolean;
    };

const LOCK: Lesson = {
  kind: 'do',
  text: 'Press Lock In. Harborlight commits at the same time, then the turn plays out one beat at a time. Watch the banner: it says what is happening and why.',
  lock: true,
  done: () => false, // the turn advancing ends it
};

function playLesson(view: GameState, me: PlayerId, placeholders: boolean, why: string): Lesson[] {
  const s = suggest(view, me, placeholders);
  const play = s.play;
  if (!play) return [];
  const def = CARD_BY_ID[play.cardId];
  if (!def) return [];
  const name = cardName(play.cardId, placeholders);
  const loc = view.locations[play.location].revealed ? locationName(view.locations[play.location].defId, placeholders) : `Location ${play.location + 1}`;
  const stats = def.kind === 'character' ? ` ${name} brings ${def.influence} Influence and ${def.force} Force.` : ` ${def.text}`;
  return [
    {
      kind: 'do',
      text: `Drag ${name} onto ${loc}.${stats} ${why}`.trim(),
      card: play.cardId,
      location: play.location,
      done: (_v, plan) => plan.plays.some((p) => p.cardId === play.cardId),
    },
  ];
}

function standing(view: GameState, me: PlayerId, placeholders: boolean): string {
  const parts: string[] = [];
  for (const l of view.locations) {
    if (!l.revealed) continue;
    const inf = influenceAt(view, l.index);
    const name = locationName(l.defId, placeholders);
    parts.push(inf[me] > inf[other(me)] ? `you lead ${name} ${inf[me]} to ${inf[other(me)]}` : inf[me] < inf[other(me)] ? `you trail at ${name} ${inf[me]} to ${inf[other(me)]}` : `${name} is tied ${inf[me]} all`);
  }
  return parts.length ? parts.join('; ') + '.' : '';
}

export function lessonsFor(view: GameState, me: PlayerId, placeholders: boolean): Lesson[] {
  const nm = (id: string) => cardName(id, placeholders);
  const ln = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
  const mine = charsOf(view, me);
  const turn = view.turn;
  const energy = Math.min(turn, 10) + (view.players[me].energyBonus ?? 0);

  if (turn === 1) {
    return [
      { kind: 'read', title: 'Welcome', text: 'You and Harborlight are fighting over three Locations. Whoever leads Influence at two of them when Turn 7 ends wins. In the tutorial the clock is stopped: take all the time you want.' },
      { kind: 'read', title: 'Energy', text: `Energy buys cards. You have ${energy} Energy this turn; Energy equals the turn number, so it grows every turn. Every card costs Energy, the green circle in its corner. The cards you cannot afford are dimmed.` },
      { kind: 'read', title: 'The board', text: 'Each column is a Location. The strip above it is Harborlight\'s Gates, the strip below is yours: a Character you play waits at the Gates one turn before it can go Inside. All three Locations are hidden on Turn 1, so the first commit is blind.' },
      ...playLesson(view, me, placeholders, 'Its Influence counts from the Gates, so even a blind commit is worth something.'),
      LOCK,
    ];
  }
  if (turn === 2) {
    const fresh = mine.find((c) => c.zone === 'gate' && !c.ready);
    const revealed = view.locations.find((l) => l.revealed);
    const lessons: Lesson[] = [];
    if (revealed) lessons.push({ kind: 'read', title: 'A Location revealed', text: `${ln(revealed.index)} is revealed: ${locDef(view, revealed.index).rule} Tap any Location's title bar to read its rule again. One more reveals each turn until all three are open.` });
    if (fresh) lessons.push({ kind: 'read', title: 'Fresh and Ready', text: `${nm(fresh.defId)} is Fresh at the Gates of ${ln(fresh.location)} and still counts ${charInfluence(view, fresh)} Influence there. At the end of this turn the tile turns Ready; next turn it can go Inside.` });
    lessons.push(...playLesson(view, me, placeholders, 'A second body means two Locations in play.'), LOCK);
    return lessons;
  }
  if (turn === 3) {
    const ready = mine.find((c) => c.zone === 'gate' && c.ready && !lockReason(view, c));
    const lessons: Lesson[] = [];
    if (ready) {
      const def = CARD_BY_ID[ready.defId];
      const standingText = def?.kind === 'character' && def.established ? ` Inside, ${nm(ready.defId)} becomes Established and the standing ability turns on: ${def.established.text}` : ' Inside is where a Character is safe from what happens at the Gates.';
      lessons.push(
        { kind: 'read', title: 'Entering', text: `${nm(ready.defId)} is Ready. Entering is free and does not use your card for the turn.${standingText}` },
        {
          kind: 'do',
          text: `Drag ${nm(ready.defId)} from the Gates into ${ln(ready.location)}.`,
          flash: 'enter',
          location: ready.location,
          done: (_v, plan) => plan.enters.includes(ready.uid),
        },
      );
    }
    lessons.push(...playLesson(view, me, placeholders, 'Reveals fire the moment a card lands, before anyone enters.'), LOCK);
    return lessons;
  }
  if (turn === 4) {
    const lessons: Lesson[] = [{ kind: 'read', title: 'Where you stand', text: `${standing(view, me, placeholders)} Two of three is the target; a Location you cannot win is one to stop feeding.` }];
    let threatLesson = false;
    for (const loc of view.locations) {
      for (const t of loc.threats) {
        const tdef = THREAT_BY_ID[t.defId];
        const label = threatLabel(t.defId, placeholders);
        if (tdef.requiresBoth) {
          lessons.push({ kind: 'read', title: 'A Threat', text: `${label} sits at ${ln(loc.index)}. It only breaks if both players confront it in the same turn. While it stands: ${tdef.text}` });
          threatLesson = true;
          break;
        }
        const need = threatForceNeeded(view, t);
        const here = mine.filter((c) => c.location === loc.index);
        const one = here.find((c) => confrontForce(view, c, t) >= need);
        lessons.push({ kind: 'read', title: 'A Threat', text: `${label} arrived at ${ln(loc.index)}. Threats are neutral: nobody owns them, and either player can fight them. This one needs ${need} Force. While it stands: ${tdef.text}` });
        if (one) {
          const who: CharacterInstance = one;
          lessons.push({
            kind: 'do',
            text: `${nm(who.defId)} has ${confrontForce(view, who, t)} Force, enough on its own. Drag the tile onto the Threat to confront it. Confronting is free, and Force is the red number.`,
            flash: 'threat',
            location: loc.index,
            done: (_v, plan) => plan.confronts.some((k) => k.uid === who.uid && k.threatUid === t.uid),
          });
        } else {
          lessons.push({ kind: 'read', title: 'Not yet', text: `Nobody of yours at ${ln(loc.index)} has ${need} Force${here.length ? ` (${here.map((c) => `${nm(c.defId)} ${confrontForce(view, c, t)}`).join(', ')})` : ''}. Several Characters can add their Force together, or a strong one can arrive next turn.` });
        }
        threatLesson = true;
        break;
      }
      if (threatLesson) break;
    }
    lessons.push(...playLesson(view, me, placeholders, ''), LOCK);
    return lessons;
  }
  if (turn === 5) {
    return [
      { kind: 'read', title: 'Stand on Business', text: `${standing(view, me, placeholders)} The blue button doubles the Legacy the match is worth and adds an 8th turn. Harborlight then gets one turn to Sit Down at the old price, keep playing, or stand back. Once you stand, you cannot Sit Down. Stand when you lead two Locations and can hold them.` },
      ...playLesson(view, me, placeholders, ''),
      LOCK,
    ];
  }
  if (turn === TUTORIAL_LAST_TURN + 1) {
    return [{ kind: 'read', title: 'On your own', text: `${standing(view, me, placeholders)} You have the basics: Energy, Gates, entering, Threats and the Stand. Finish the match on your own. The coach bubble will still point at things worth knowing, and the clock stays stopped.` }];
  }
  return [];
}

/** True while the tutorial script still has lessons to give at this turn. */
export function tutorialActive(view: GameState): boolean {
  return view.phase === 'planning' && view.turn <= TUTORIAL_LAST_TURN + 1;
}
