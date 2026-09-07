/**
 * First-turn hand-holding: suggest a concrete move and explain it in plain terms.
 * Uses the same planner as Harborlight, fed the human's redacted view.
 */
import { CARD_BY_ID, charInfluence, charsOf, influenceAt, locDef, other, type GameState, type PlayAction, type PlayerId, type TurnPlan } from '../engine';
import { planTurn } from '../ai/harborlight';

const KEY = 'bhcb.guide.v1';

export function guideDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markGuideDone(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetGuide(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface Suggestion {
  plan: TurnPlan;
  play?: PlayAction;
  text: string;
}

export function suggest(view: GameState, me: PlayerId, placeholders: boolean): Suggestion {
  const plan = planTurn(view, me, { bestPick: 1, sensiblePick: 0, standThreshold: 2, strongStandThreshold: 2, bluffRate: 0, continueThreshold: 0.2 }).plan;
  const play = plan.plays[0];
  const name = (id: string) => (placeholders ? CARD_BY_ID[id]?.short ?? id : CARD_BY_ID[id]?.name ?? id);
  if (!play) return { plan, text: 'Nothing to play this turn. Lock It In.' };
  const def = CARD_BY_ID[play.cardId];
  if (!def) return { plan, play, text: 'Lock It In.' };
  const locLabel = view.locations[play.location].revealed ? locDef(view, play.location).name : `Location ${play.location + 1}`;
  if (def.kind === 'event') {
    return { plan, play, text: `Play ${name(def.id)}. ${def.text}` };
  }
  const hand = view.players[me].hand.filter((id) => CARD_BY_ID[id]?.kind === 'character');
  const best = Math.max(...hand.map((id) => (CARD_BY_ID[id] as { influence: number }).influence));
  const allHidden = view.locations.every((l) => !l.revealed);
  const parts: string[] = [`Drag ${name(def.id)} onto ${locLabel}.`];
  if (allHidden) {
    parts.push(
      def.influence >= best
        ? `Every Location is still hidden, so open with your strongest Influence: ${def.influence} is the most in your hand, and Influence is what wins a Location.`
        : `Every Location is still hidden, so this turn is a gamble; ${name(def.id)} brings ${def.influence} Influence and is safe to commit blind.`,
    );
  } else {
    const inf = influenceAt(view, play.location);
    const diff = inf[me] - inf[other(me)];
    const mine = charsOf(view, me).filter((c) => c.location === play.location);
    const there = mine.reduce((s, c) => s + charInfluence(view, c), 0);
    parts.push(
      diff < 0
        ? `You trail there ${inf[me]} to ${inf[other(me)]}; ${def.influence} more Influence puts you ahead or close.`
        : diff === 0
          ? `That Location is tied; ${def.influence} Influence takes the lead.`
          : `You already lead there (${there} of yours); this builds a Location you can hold.`,
    );
  }
  if (def.reveal?.effect.type === 'hiddenBonus' && allHidden) parts.push('His Reveal pays +1 Influence when played into a hidden Location, so blind is exactly where he wants to be.');
  if (def.keywords.includes('STRAIGHT_INSIDE')) parts.push('It goes straight Inside instead of waiting at the Gates.');
  if (def.keywords.includes('DIRECT_ENTRY')) parts.push('Direct Entry: it may go Inside right away instead of waiting at the Gates.');
  parts.push('Then press Lock It In.');
  return { plan, play, text: parts.join(' ') };
}
