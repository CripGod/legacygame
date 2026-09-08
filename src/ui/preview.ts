/**
 * Apply the local player's draft plan to a view so the board shows their moves
 * immediately. Preview instances are visual only; the engine never sees them.
 */
import { cloneState, CARD_BY_ID, insideOpen, other, type GameState, type PlayerId, type TurnPlan, type CharacterInstance } from '../engine';

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
        if (def.reveal.effect.type === 'conductor') {
          // Harriet takes them straight Inside when there is room.
          const room = insideOpen(v, play.target.location, me);
          t.zone = room ? 'inside' : 'gate';
          if (!room) t.ready = true;
        }
        t.relocatedTurn = v.turn;
      }
    }
    const informant = def.keywords.includes('INFORMANT');
    const c: CharacterInstance = {
      uid: `${PLANNED_PREFIX}${def.id}`,
      defId: def.id,
      owner: informant ? other(me) : me,
      plantedBy: informant ? me : undefined,
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

/**
 * The part of a locked plan a replay beat has not caught up with yet, so the board keeps
 * showing the player's own moves where they put them instead of re-animating them.
 */
export function remainingPlan(state: GameState, me: PlayerId, plan: TurnPlan): TurnPlan {
  const mine = Object.values(state.characters).filter((c) => c.owner === me);
  void mine;
  return {
    ...plan,
    // Event plays are shown by the replay's own pending tiles.
    plays: plan.plays.filter((pl) => CARD_BY_ID[pl.cardId]?.kind === 'character' && !Object.values(state.characters).some((c) => c.defId === pl.cardId && (c.owner === me || c.plantedBy === me))),
    enters: plan.enters.filter((uid) => state.characters[uid]?.zone === 'gate'),
    relocations: plan.relocations.filter((r) => state.characters[r.uid] && state.characters[r.uid].location !== r.to),
  };
}
