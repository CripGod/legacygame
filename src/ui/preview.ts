/**
 * Apply the local player's draft plan to a view so the board shows their moves
 * immediately. Preview instances are visual only; the engine never sees them.
 */
import { cloneState, CARD_BY_ID, insideOpen, type GameState, type PlayerId, type TurnPlan, type CharacterInstance } from '../engine';

export const PLANNED_PREFIX = 'planned:';

export function previewPlan(view: GameState, me: PlayerId, plan: TurnPlan): GameState {
  const hasChanges = plan.play || plan.enters.length || plan.relocations.length;
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
  if (plan.play) {
    const def = CARD_BY_ID[plan.play.cardId];
    if (def?.kind === 'character') {
      const c: CharacterInstance = {
        uid: `${PLANNED_PREFIX}${def.id}`,
        defId: def.id,
        owner: me,
        location: plan.play.location,
        zone: 'gate',
        ready: false,
        arrivedTurn: v.turn + 2,
        permInfluence: 0,
        tempInfluence: 0,
      };
      if (def.keywords.includes('DIRECT_ENTRY') && insideOpen(v, c.location, me)) c.zone = 'inside';
      v.characters[c.uid] = c;
    }
  }
  return v;
}

export function isPlannedUid(uid: string): boolean {
  return uid.startsWith(PLANNED_PREFIX);
}
