/**
 * Apply the local player's draft plan to a view so the board shows their moves
 * immediately. Preview instances are visual only; the engine never sees them.
 */
import { cloneState, CARD_BY_ID, insideOpen, type GameState, type PlayerId, type TurnPlan, type CharacterInstance } from '../engine';

export const PLANNED_PREFIX = 'planned:';

export function previewPlan(view: GameState, me: PlayerId, plan: TurnPlan): GameState {
  const hasChanges = plan.plays.length || plan.enters.length || plan.relocations.length;
  if (!hasChanges) return view;
  const v = cloneState(view);
  for (const uid of plan.enters) {
    const c = v.characters[uid];
    if (c && c.owner === me && c.zone === 'gate') {
      c.zone = 'inside';
      c.arrivedTurn = v.turn;
    }
  }
  for (const r of plan.relocations) {
    const c = v.characters[r.uid];
    if (c && c.owner === me && c.zone === 'inside') {
      c.location = r.to;
      c.zone = 'gate';
      c.ready = false;
      c.arrivedTurn = v.turn + 1; // sorts after existing Gate tiles
    }
  }
  plan.plays.forEach((play, i) => {
    const def = CARD_BY_ID[play.cardId];
    if (def?.kind !== 'character') return;
    // Yemoja's Reveal: show the chosen Established Character brought across.
    if (def.reveal?.effect.type === 'moveFriendlyInsideHere' && play.target?.charUid) {
      const t = v.characters[play.target.charUid];
      if (t && t.owner === me && t.zone === 'inside') {
        t.location = play.location;
        t.relocatedTurn = v.turn;
        if (!insideOpen(v, play.location, me)) {
          t.zone = 'gate';
          t.ready = true;
        }
      }
    }
    // Harriet Tubman's Reveal: show the chosen Gate Character at its destination.
    if ((def.reveal?.effect.type === 'conductor' || def.reveal?.effect.type === 'moveFriendlyGate') && play.target?.charUid && play.target.location !== undefined) {
      const t = v.characters[play.target.charUid];
      if (t && t.owner === me && (def.reveal.effect.type === 'conductor' || t.zone === 'gate')) {
        t.location = play.target.location;
        if (t.zone === 'inside') {
          t.zone = 'gate';
          t.ready = true;
        }
        t.relocatedTurn = v.turn;
      }
    }
    const c: CharacterInstance = {
      uid: `${PLANNED_PREFIX}${def.id}`,
      defId: def.id,
      owner: me,
      location: play.location,
      zone: 'gate',
      ready: false,
      arrivedTurn: v.turn + 2 + i,
      permInfluence: 0,
      tempInfluence: 0,
    };
    if ((def.keywords.includes('STRAIGHT_INSIDE') || (def.keywords.includes('DIRECT_ENTRY') && play.enter)) && insideOpen(v, c.location, me)) c.zone = 'inside';
    v.characters[c.uid] = c;
  });
  return v;
}

export function isPlannedUid(uid: string): boolean {
  return uid.startsWith(PLANNED_PREFIX);
}
