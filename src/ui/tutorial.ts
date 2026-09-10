/**
 * The baked tutorial: a fixed seed and fixed decks, a stopped clock, and a scripted
 * walk through the first five turns. Every lesson either asks the player to read
 * (the board is modal'ed out behind a card) or to do one specific thing (the piece,
 * the Location or the button is spotlit and everything else is dimmed).
 */
import {
  CARD_BY_ID,
  cardCost,
  charsOf,
  confrontForce,
  influenceAt,
  legalOptions,
  locDef,
  other,
  threatForceNeeded,
  THREAT_BY_ID,
  type CharacterInstance,
  type GameState,
  type PlayerId,
  type TurnPlan,
} from '../engine';
import { cardName, locationName, threatLabel } from './display';

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
      /** Several hand cards to spotlight (every card the player can afford, say). */
      cards?: string[];
      /** Location column to spotlight. */
      location?: number;
      /** Battlefield flash key: 'enter' lights Ready Gate tiles, 'threat' lights Threats. */
      flash?: 'enter' | 'threat' | 'move';
      /** Spotlight the Lock In button. */
      lock?: boolean;
      /** The lesson is complete once this holds. */
      done: (view: GameState, plan: TurnPlan) => boolean;
    };

/** Press Lock In. The text can carry one more sentence of context for the beat that follows. */
function lock(text = 'Press Lock In. Once Harborlight commits, the turn plays out one beat at a time; the banner says what is happening.'): Lesson {
  return { kind: 'do', text, lock: true, done: () => false }; // the turn advancing ends it
}

/**
 * Play a card. The tutorial teaches the move, not the play: any card onto any Location counts, and the
 * spotlight only points at one affordable card so the player knows where to start. Null when nothing is
 * playable, so the point before it is dropped too.
 */
function playLesson(view: GameState, me: PlayerId, _placeholders: boolean, why: string): Lesson | null {
  const energy = Math.min(view.turn, 10) + (view.players[me].energyBonus ?? 0);
  const playable = new Set(legalOptions(view, me).plays.map((p) => p.cardId));
  const affordable = [...new Set(view.players[me].hand.filter((id) => playable.has(id) && cardCost(id, view, me) <= energy))];
  if (!affordable.length) return null;
  const all = affordable.length === view.players[me].hand.length;
  return {
    kind: 'do',
    text: `Drag one of the lit cards onto a Location. ${all ? 'Every card in your hand' : `Everything costing ${energy} or less`} is lit: that is what your ${energy} Energy buys this turn. Any Location will do. ${why}`.trim(),
    cards: affordable,
    done: (_v, plan) => plan.plays.length > 0,
  };
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

/**
 * One point, then the player does something. A `read` is only kept when the `do` after it exists,
 * so the script never shows two points in a row and never teaches something the board is not showing.
 */
type Beat = { point?: Lesson; act: Lesson | null };
function script(beats: Beat[]): Lesson[] {
  const out: Lesson[] = [];
  for (const b of beats) {
    if (!b.act) continue;
    if (b.point) out.push(b.point);
    out.push(b.act);
  }
  return out;
}

export function lessonsFor(view: GameState, me: PlayerId, placeholders: boolean): Lesson[] {
  const nm = (id: string) => cardName(id, placeholders);
  const ln = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
  const mine = charsOf(view, me);
  const turn = view.turn;
  const energy = Math.min(turn, 10) + (view.players[me].energyBonus ?? 0);
  const read = (title: string, text: string): Lesson => ({ kind: 'read', title, text });

  if (turn === 1) {
    const play = playLesson(view, me, placeholders, '');
    const played = play?.kind === 'do' && play.cards?.length === 1 ? CARD_BY_ID[play.cards[0]] : undefined;
    const straight = played?.kind === 'character' && played.keywords.includes('STRAIGHT_INSIDE');
    const who = played ? `${nm(played.id)}'s card` : 'Your card';
    return script([
      { point: read('Welcome', 'You and your opponent (Harborlight) are vying for control of three Locations. Whoever leads Influence at two of them when Turn 9 ends wins. The clock is stopped in here, so take your time.'), act: play },
      {
        point: read(
          'The Gates',
          straight
            ? `Most cards wait a turn at the Gates, the strip below the Location, and count their Influence from there. ${who} is the exception: Straight Inside means it walks in the moment it lands. All three Locations are still hidden, so this first commit is blind for both players.`
            : `${who} now waits at the Gates, the strip below the Location. It counts its Influence from there this turn. All three Locations are still hidden, so this first commit is blind for both players.`,
        ),
        act: lock('Press Lock In. The bar inside the button is the turn clock: in a real match it drains over two minutes and locks whatever you have planned. In here it only ticks for show.'),
      },
    ]);
  }
  if (turn === 2) {
    const opp = other(me);
    const ev = view.lastEvents ?? [];
    const oppPlays = ev.filter((e) => e.type === 'played' && e.player === opp && e.cardId && e.location !== undefined);
    const oppGate = charsOf(view, opp).filter((c) => c.zone === 'gate');
    const opened = view.locations.filter((l) => l.revealed);
    const handle = view.players[opp].handle;
    const what = oppPlays.length
      ? `${handle} played ${oppPlays.map((e) => `${nm(e.cardId!)} at ${ln(e.location!)}`).join(' and ')}.`
      : `${handle} played nothing.`;
    const where = oppGate.length ? ` You can see ${oppGate.length > 1 ? 'those cards' : 'that card'} in the strip above ${ln(oppGate[0].location)}: ${handle}'s Gates are always the top strip of a Location, yours the bottom.` : '';
    const reveal = opened.length ? ` Then ${ln(opened[0].index)} was revealed.` : '';
    const play = playLesson(view, me, placeholders, '');
    return script([
      {
        point: read('What just happened', `${what}${where}${reveal} The i button at the left edge replays any turn beat by beat whenever you want it.`),
        act: play,
      },
      {
        point: read('Energy', `Energy equals the turn number, so it grows every turn until it settles at 7: ${energy} now, ${energy + 1} next turn. Every card costs Energy, the green circle in its corner, and the cards you cannot afford are dimmed.`),
        act: lock(),
      },
    ]);
  }
  /** Entering, taught the first time a Ready Character of yours can actually go Inside (Turn 3 or later). */
  const enterBeat = (): Beat => {
    if (mine.some((c) => { const d = CARD_BY_ID[c.defId]; return c.zone === 'inside' && !(d?.kind === 'character' && d.keywords.includes('STRAIGHT_INSIDE')); })) return { act: null };
    const legal = legalOptions(view, me).enters;
    const ready = mine.find((c) => c.zone === 'gate' && c.ready && legal.includes(c.uid));
    if (!ready) return { act: null };
    const def = CARD_BY_ID[ready.defId];
    const standingText = def?.kind === 'character' && def.established ? ` Inside, the card becomes Established and its standing ability turns on: ${def.established.text}` : ' Inside is where a card is safe from what happens at the Gates.';
    return {
      point: read('Ready', `${nm(ready.defId)}'s card was Fresh when it arrived and is Ready now, so it can go Inside.${standingText}`),
      act: { kind: 'do', text: `Drag ${nm(ready.defId)}'s card from the Gates into ${ln(ready.location)}. Entering is free and does not use your card play for the turn.`, flash: 'enter', location: ready.location, done: (_v, plan) => plan.enters.includes(ready.uid) },
    };
  };
  if (turn === 3) {
    const opened = view.locations.filter((l) => l.revealed && l.revealedTurn === turn - 1)[0] ?? view.locations.filter((l) => l.revealed)[0];
    const play = playLesson(view, me, placeholders, "A card's Reveal fires the moment it lands at the Gates, before anyone walks Inside: watch the banner.");
    return script([
      enterBeat(),
      {
        point: opened ? read('A Location revealed', `${ln(opened.index)} is open: ${locDef(view, opened.index).rule} Tap any Location's title bar to read its rule again. One more opens each turn until all three are showing.`) : undefined,
        act: play,
      },
      { act: lock() },
    ]);
  }
  if (turn === 4) {
    const beats: Beat[] = [enterBeat()];
    let threatDone = false;
    for (const loc of view.locations) {
      for (const t of loc.threats) {
        const tdef = THREAT_BY_ID[t.defId];
        const label = threatLabel(t.defId, placeholders);
        const need = threatForceNeeded(view, t);
        const here = mine.filter((c) => c.location === loc.index);
        const one = !tdef.requiresBoth ? here.find((c) => confrontForce(view, c, t) >= need) : undefined;
        if (one) {
          const who: CharacterInstance = one;
          const base = CARD_BY_ID[who.defId]?.kind === 'character' ? (CARD_BY_ID[who.defId] as { force: number }).force : 0;
          const eff = confrontForce(view, who, t);
          const forceLine = eff > base ? `${nm(who.defId)}'s card shows ${base} Force, and ${ln(loc.index)} adds +${eff - base} to anyone confronting here: ${eff} in all, enough on its own.` : `${nm(who.defId)}'s card has ${eff} Force, enough on its own.`;
          beats.push({
            point: read('A Threat', `${label} arrived at ${ln(loc.index)}. Threats are neutral: nobody owns them and either player can fight them. This one needs ${need} Force in one turn. While it stands: ${tdef.text}`),
            act: {
              kind: 'do',
              text: `${forceLine} Drag the tile onto the Threat to confront it. Confronting is free; Force is the red number.`,
              flash: 'threat',
              location: loc.index,
              done: (_v, plan) => plan.confronts.some((k) => k.uid === who.uid && k.threatUid === t.uid),
            },
          });
          threatDone = true;
        }
        break;
      }
      if (threatDone) break;
    }
    const firstThreat = view.locations.flatMap((l) => l.threats.map((t) => ({ l, t })))[0];
    const play = playLesson(view, me, placeholders, '');
    if (!threatDone && firstThreat) {
      const { l, t } = firstThreat;
      const tdef = THREAT_BY_ID[t.defId];
      const need = threatForceNeeded(view, t);
      const here = mine.filter((c) => c.location === l.index);
      beats.push({
        point: read(
          'A Threat',
          tdef.requiresBoth
            ? `${threatLabel(t.defId, placeholders)} sits at ${ln(l.index)}. It only breaks when both players confront it in the same turn. While it stands: ${tdef.text}`
            : `${threatLabel(t.defId, placeholders)} arrived at ${ln(l.index)} and needs ${need} Force in one turn. None of your cards there has that yet${here.length ? ` (${here.map((c) => `${nm(c.defId)} ${confrontForce(view, c, t)}`).join(', ')})` : ''}: cards can add their Force together, or a stronger one can arrive.`,
        ),
        act: play,
      });
      beats.push({ point: read('Reading the board', `${standing(view, me, placeholders)} The numbers on each end of a Location's bar are the two sides' Influence; the bigger one leads. Two of three at the end of Turn 9 wins.`), act: lock() });
    } else {
      beats.push({ point: read('Reading the board', `${standing(view, me, placeholders)} The numbers on each end of a Location's bar are the two sides' Influence; the bigger one leads. Two of three at the end of Turn 9 wins.`), act: play });
      beats.push({ act: lock() });
    }
    return script(beats);
  }
  if (turn === 5) {
    const play = playLesson(view, me, placeholders, '');
    return script([
      enterBeat(),
      {
        point: read('Stand on Business', `${standing(view, me, placeholders)} The red button doubles the Legacy this match is worth and adds a 10th turn. Harborlight then gets one turn to Sit Down at the old price, keep playing, or stand back. Once you stand, you cannot Sit Down.`),
        act: play ?? lock(),
      },
      { act: play ? lock() : null },
    ]);
  }
  if (turn === TUTORIAL_LAST_TURN + 1) {
    return [read('On your own', `${standing(view, me, placeholders)} You have the basics: Energy, Gates, entering, Threats and the Stand. Finish the match on your own. The coach bubble will still point at things worth knowing, and the clock stays stopped.`)];
  }
  return [];
}

/** True while the tutorial script still has lessons to give at this turn. */
export function tutorialActive(view: GameState): boolean {
  return view.phase === 'planning' && view.turn <= TUTORIAL_LAST_TURN + 1;
}
