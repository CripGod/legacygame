/**
 * Apply the local player's draft plan to a view so the board shows their moves
 * immediately. Preview instances are visual only; the engine never sees them.
 */
import { cloneState, CARD_BY_ID, gateOpen, insideOpen, isBlockedFromEntering, other, type GameState, type PlayerId, type TurnPlan, type CharacterInstance } from '../engine';

export const PLANNED_PREFIX = 'planned:';

export function previewPlan(view: GameState, me: PlayerId, plan: TurnPlan): GameState {
  const hasChanges = plan.plays.length || plan.enters.length || plan.relocations.length;
  if (!hasChanges) return view;
  const v = cloneState(view);
  // Engine order: relocations, then plays (with the door check), then entries; so the entries are applied last, after the plays.
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
    if ((def.keywords.includes('STRAIGHT_INSIDE') || (def.keywords.includes('DIRECT_ENTRY') && play.enter)) && insideOpen(v, c.location, me) && !isBlockedFromEntering(v, c)) c.zone = 'inside';
    v.characters[c.uid] = c;
    // The card holds its Gate slot before its Reveal moves anyone, so a move only shows where there will be room.
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
        const from = t.location;
        t.location = play.target.location;
        if (def.reveal.effect.type === 'conductor') {
          // Harriet takes them straight Inside when there is room, to the Gates when those are open, and nowhere otherwise.
          const room = insideOpen(v, play.target.location, me) && !isBlockedFromEntering(v, { ...t, location: play.target.location });
          if (room) t.zone = 'inside';
          else if (gateOpen(v, play.target.location, me)) {
            t.zone = 'gate';
            t.ready = true;
          } else t.location = from;
        } else if (!gateOpen(v, play.target.location, me)) t.location = from;
        t.relocatedTurn = v.turn;
      }
    }
  });
  for (const uid of plan.enters) {
    const c = v.characters[uid];
    if (c && c.owner === me && c.zone === 'gate') {
      c.zone = 'inside';
      c.arrivedTurn = v.turn;
    }
  }
  return v;
}

export function isPlannedUid(uid: string): boolean {
  return uid.startsWith(PLANNED_PREFIX);
}

/**
 * The part of a locked plan a replay beat has not caught up with yet, so the board keeps
 * showing the player's own moves where they put them instead of re-animating them.
 */
export function remainingPlan(state: GameState, me: PlayerId, plan: TurnPlan, blockedNow: string[] = []): TurnPlan {
  return {
    ...plan,
    // Event plays are shown by the replay's own pending tiles.
    plays: plan.plays.filter((pl) => CARD_BY_ID[pl.cardId]?.kind === 'character' && !Object.values(state.characters).some((c) => c.defId === pl.cardId && (c.owner === me || c.plantedBy === me))),
    // A Character whose entry is blocked this turn (the OG's Reveal, a curfew) is not going Inside: the board stops
    // showing it there from the beat that blocks it, so the block is seen to land at the Gates.
    enters: plan.enters.filter((uid) => {
      const c = state.characters[uid];
      // The engine only lets a Ready Character enter: one tricked Waiting (Anansi, James Lafayette) is not going Inside.
      return !!c && c.zone === 'gate' && c.ready && c.blockedEnterTurn !== state.turn && !blockedNow.includes(uid);
    }),
    relocations: plan.relocations.filter((r) => state.characters[r.uid] && state.characters[r.uid].location !== r.to),
  };
}

/** One of the Ancestors' ghosts: the opponent's coming move, shown beside the real tiles without moving anyone. */
export interface Foreseen {
  uid: string;
  defId: string;
  zone: 'gate' | 'inside';
  /** "plays here", "goes Inside", "moves here": read in the tooltip after the name. */
  why: string;
}

/**
 * The Ancestors' vision: the opponent's plan laid on the board as faint ghosts. Nothing real moves and nothing is
 * counted; each ghost sits beside the tiles at the place the move ends. An Informant they plant appears at the
 * planter's target, that is, at my own Gates.
 */
export function foreseePlan(view: GameState, opp: PlayerId, plan: TurnPlan): { ghosts: Record<PlayerId, Record<number, Foreseen[]>>; threats: string[]; events: { owner: PlayerId; location: number; cardId: string }[]; moves: number } {
  const me = other(opp);
  const ghosts: Record<PlayerId, Record<number, Foreseen[]>> = { A: {}, B: {} };
  const add = (owner: PlayerId, location: number, f: Foreseen) => {
    (ghosts[owner][location] ??= []).push(f);
  };
  const events: { owner: PlayerId; location: number; cardId: string }[] = [];
  let moves = 0;
  for (const play of plan.plays) {
    const def = CARD_BY_ID[play.cardId];
    if (!def) continue;
    moves++;
    if (def.kind === 'event') {
      if (def.needsLocation) events.push({ owner: opp, location: play.location, cardId: play.cardId });
      continue;
    }
    if (def.kind !== 'character') continue;
    const informant = def.keywords.includes('INFORMANT');
    const inside = (def.keywords.includes('STRAIGHT_INSIDE') || (def.keywords.includes('DIRECT_ENTRY') && play.enter)) && insideOpen(view, play.location, opp) && !isBlockedFromEntering(view, { owner: opp, location: play.location } as CharacterInstance);
    add(informant ? me : opp, play.location, { uid: `foreseen:play:${def.id}`, defId: def.id, zone: inside ? 'inside' : 'gate', why: informant ? 'is planted at your Gates' : inside ? 'plays here, straight Inside' : 'plays here' });
  }
  for (const uid of plan.enters) {
    const c = view.characters[uid];
    if (!c || c.owner !== opp || c.zone !== 'gate' || !insideOpen(view, c.location, opp)) continue;
    moves++;
    add(opp, c.location, { uid: `foreseen:enter:${uid}`, defId: c.defId, zone: 'inside', why: 'goes Inside' });
  }
  for (const r of plan.relocations) {
    const c = view.characters[r.uid];
    if (!c || c.owner !== opp) continue;
    moves++;
    add(opp, r.to, { uid: `foreseen:move:${r.uid}`, defId: c.defId, zone: 'gate', why: 'moves here' });
  }
  moves += plan.confronts.length;
  return { ghosts, threats: plan.confronts.map((c) => c.threatUid), events, moves };
}

/** Is the door at `location` shut to `me`'s straight-Inside play, judged on the board the engine will see: relocations
 *  applied, planned entries not yet (they resolve after the plays). The reason, or null. One answer for the tile, the
 *  hint and the drop's sound. */
export function doorShutAt(view: GameState, me: PlayerId, plan: TurnPlan, location: number): string | null {
  const board = plan.relocations.length ? previewPlan(view, me, { ...plan, enters: [], plays: [] }) : view;
  return isBlockedFromEntering(board, { owner: me, location } as CharacterInstance);
}
