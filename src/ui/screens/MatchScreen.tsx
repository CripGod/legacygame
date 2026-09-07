import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_BY_ID, legalOptions, gateRoom, insideCapacity, isBlockedFromEntering, charsAt, locDef, THREAT_BY_ID, SUMMON, emptyPlan, type PlayerId, type TurnPlan, type GameEvent, other, MAX_HAND } from '../../engine';
import { useDrag, targetKey, type DragPayload, type DropTarget } from '../drag';
import { CardFace, Pic } from '../components/CardFace';
import type { DropHighlight } from '../components/Battlefield';
import { previewPlan, isPlannedUid, PLANNED_PREFIX } from '../preview';
import type { MatchController } from '../useMatch';
import { Hud } from '../components/Hud';
import { Battlefield } from '../components/Battlefield';
import { Hand } from '../components/Hand';
import { Coach } from '../components/Coach';
import { CardSheet, CharSheet, ChatSheet, ConfirmSheet, LocationSheet, LogSheet, ProfileSheet, SpawnSheet, ThreatSheet } from '../components/Sheets';
import { guideDone, markGuideDone, suggest } from '../guide';
import { EMOTES } from '../useMatch';
import { cardName, locationName, useDisplay } from '../display';
import { tip, HINTS } from '../tip';

type SheetState =
  | { kind: 'card'; id: string }
  | { kind: 'char'; uid: string }
  | { kind: 'threat'; uid: string }
  | { kind: 'location'; index: number }
  | { kind: 'profile'; p: PlayerId }
  | { kind: 'stepOff' }
  | { kind: 'stand' }
  | { kind: 'log' }
  | { kind: 'chat' }
  | null;

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth <= 700);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth <= 700);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return compact;
}

export function MatchScreen({ m, coach, onExit }: { m: MatchController; coach: boolean; onExit: () => void }) {
  const { view, perspective: me, plan, setPlan: setPlanRaw, locked, busy } = m;
  // Undo history for the current plan.
  const [history, setHistory] = useState<TurnPlan[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const setPlan = useCallback(
    (fn: (p: TurnPlan) => TurnPlan) => {
      setHistory((h) => [...h.slice(-30), planRef.current]);
      setPlanRaw(fn);
    },
    [setPlanRaw],
  );
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setPlanRaw(() => prev);
      return h.slice(0, -1);
    });
  }, [setPlanRaw]);
  // Feedback for moves that cannot happen.
  const [toast, setToast] = useState<string | null>(null);
  const feedback = useCallback((text: string, shake: string[] = []) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 3200);
    for (const sel of shake) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        window.setTimeout(() => el.classList.remove('shake'), 600);
      });
    }
  }, []);
  const { placeholders } = useDisplay();
  const compact = useCompact();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [guideOn, setGuideOn] = useState(() => coach && m.mode === 'ai' && !guideDone());
  const opts = useMemo(() => legalOptions(view, me), [view, me]);
  const boardView = useMemo(() => (view.phase === 'planning' && !locked ? previewPlan(view, me, plan) : view), [view, me, plan, locked]);
  /** Gatherings that arrived in the last resolution, shown one at a time with fanfare. */
  const [fanfare, setFanfare] = useState<GameEvent[]>([]);
  useEffect(() => {
    setFanfare(m.lastTurn.filter((e) => e.type === 'spawned'));
  }, [m.lastTurn]);
  /** Gate slots my departing Characters still hold this turn (the preview shows them elsewhere). */
  const reserved = useMemo(() => {
    const out: Record<number, { uid: string; defId: string; why: string }[]> = {};
    if (view.phase !== 'planning' || locked) return out;
    const add = (uid: string, why: string) => {
      const c = view.characters[uid];
      if (!c || c.owner !== me || c.zone !== 'gate') return;
      (out[c.location] ??= []).push({ uid, defId: c.defId, why });
    };
    for (const uid of plan.enters) add(uid, 'enters');
    for (const pl of plan.plays) if (pl.target?.charUid && pl.target.location !== undefined) add(pl.target.charUid, `moves with ${cardName(pl.cardId, placeholders)}`);
    return out;
  }, [view, me, plan, locked, placeholders]);
  const planning = view.phase === 'planning' && !locked && !busy;

  // Escape closes any sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet((sh) => (sh && sh.kind !== 'stand' ? null : sh));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // First-turn guide: suggest a concrete move and glow the pieces involved.
  const guide = useMemo(() => (guideOn && view.turn === 1 && planning ? suggest(view, me, placeholders) : null), [guideOn, view, me, planning, placeholders]);
  const guideText = useMemo(() => {
    if (!guide) return null;
    if (guide.play && plan.plays.some((pl) => pl.cardId === guide.play!.cardId && pl.location === guide.play!.location)) return 'That is the move. Press Lock It In.';
    if (plan.plays.length) return `That works too. Or ${guide.text.charAt(0).toLowerCase()}${guide.text.slice(1)}`;
    return guide.text;
  }, [guide, plan]);
  const guideCard = guide?.play && !plan.plays.length ? guide.play.cardId : null;
  const guideLocation = guide?.play && !plan.plays.length && CARD_BY_ID[guide.play.cardId]?.kind === 'character' ? guide.play.location : null;
  useEffect(() => {
    if (guideOn && view.turn > 1) {
      markGuideDone();
      setGuideOn(false);
    }
  }, [guideOn, view.turn]);

  // Reset transient selection on new turn.
  useEffect(() => {
    setSelected(null);
    setSheet(null);
    setHistory([]);
  }, [view.turn, me]);

/** Gate room at a Location after the plays already planned there. */
  const plannedAt = (index: number, except?: string) =>
    plan.plays.filter((pl) => pl.location === index && pl.cardId !== except && CARD_BY_ID[pl.cardId]?.kind === 'character').length;

  const targetable = useMemo(() => {
    if (!selected || !planning) return [];
    const opt = opts.plays.find((p) => p.cardId === selected);
    if (!opt) return [];
    return opt.needsLocation ? opt.locations.filter((i) => opt.kind !== 'character' || gateRoom(view, i, me, plannedAt(i, selected)) > 0) : [];
  }, [selected, opts, planning, plan, view, me]);

  const selectCard = (cardId: string) => {
    if (!planning) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    if (plan.plays.some((pl) => pl.cardId === cardId)) {
      setPlan((p) => ({ ...p, plays: p.plays.filter((pl) => pl.cardId !== cardId) }));
      setSelected(null);
      return;
    }
    const opt = opts.plays.find((p) => p.cardId === cardId);
    if (!opt) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    if (selected === cardId) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    setSelected(cardId);
  };

  const commitPlay = (location: number, cardId: string | null = selected) => {
    if (!cardId) return;
    const opt = opts.plays.find((p) => p.cardId === cardId);
    if (!opt) return;
    if (opt.needsLocation && !opt.locations.includes(location)) return;
    addPlay({ cardId, location: opt.needsLocation ? location : 0 });
    setSelected(null);
    setSheet(null);
  };

  /** Add or move a play; when at the limit, the newest replaces the oldest. */
  function addPlay(play: { cardId: string; location: number; target?: { charUid?: string; location?: number } }) {
    const current = planRef.current.plays.filter((pl) => pl.cardId !== play.cardId);
    if (current.length >= opts.playsAllowed && current.length > 0) {
      const dropped = current[0];
      feedback(`Only ${opts.playsAllowed} play${opts.playsAllowed > 1 ? 's' : ''} this turn (${view.locations.every((l) => l.revealed) ? 'two once all Locations are revealed' : 'one while a Location is hidden'}). Swapped ${cardName(dropped.cardId, placeholders)} out for ${cardName(play.cardId, placeholders)}. Cmd/Ctrl+Z to undo.`);
    }
    setPlan((p) => {
      let plays = p.plays.filter((pl) => pl.cardId !== play.cardId);
      while (plays.length >= opts.playsAllowed && plays.length > 0) plays = plays.slice(1);
      return { ...p, plays: [...plays, play] };
    });
    const needs = opts.plays.find((p) => p.cardId === play.cardId)?.needsTarget;
    if (needs === 'friendlyGateCharAndLocation' && !play.target) feedback(`${cardName(play.cardId, placeholders)} planned. Optional: drag one of your Gate Characters to another Location's Gates and she moves it there for free.`);
    if (needs === 'friendlyInsideChar' && !play.target) feedback(`${cardName(play.cardId, placeholders)} planned. Optional: drag one of your Established Characters from another Location onto hers and she brings them across.`);
  }

  /** Harriet Tubman / Yemoja: the planned play whose Reveal wants a target, if any. */
  const targetPlay = (kind: 'friendlyGateCharAndLocation' | 'friendlyInsideChar') =>
    planRef.current.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === kind);
  const harrietPlay = plan.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === 'friendlyGateCharAndLocation');
  const yemojaPlay = plan.plays.find((pl) => (CARD_BY_ID[pl.cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget === 'friendlyInsideChar');
  /** Gates with room for a Tubman move, counting the plays already planned there. */
  const tubmanDests = (uid: string) => {
    const c = view.characters[uid];
    if (!c || !harrietPlay) return [];
    return view.locations.filter((l) => l.index !== c.location && !l.lost && gateRoom(view, l.index, me, plannedAt(l.index)) > 0).map((l) => l.index);
  };
  const setTarget = (kind: 'friendlyGateCharAndLocation' | 'friendlyInsideChar', target: { charUid: string; location: number } | null) => {
    const play = targetPlay(kind);
    if (!play) return;
    setPlan((p) => ({ ...p, plays: p.plays.map((pl) => (pl.cardId === play.cardId ? { ...pl, target: target ?? undefined } : pl)) }));
    setSheet(null);
  };


  const toggleEnter = (uid: string) => {
    setPlan((p) => ({ ...p, enters: p.enters.includes(uid) ? p.enters.filter((u) => u !== uid) : [...p.enters, uid] }));
    setSheet(null);
  };
  const setRelocation = (uid: string, to: number | null) => {
    setPlan((p) => ({ ...p, relocations: [...p.relocations.filter((r) => r.uid !== uid), ...(to === null ? [] : [{ uid, to }])] }));
    setSheet(null);
  };
  const toggleConfront = (uid: string, threatUid: string) => {
    setPlan((p) => {
      const has = p.confronts.some((c) => c.uid === uid && c.threatUid === threatUid);
      return { ...p, confronts: has ? p.confronts.filter((c) => !(c.uid === uid)) : [...p.confronts.filter((c) => c.uid !== uid), { uid, threatUid }] };
    });
  };

  const dropTargetsFor = useCallback(
    (payload: DragPayload): DropHighlight => {
      const out: DropHighlight = { locations: [], inside: [], gates: [], threats: [], hand: false, overKey: '' };
      if (!planning) return out;
      if (payload.kind === 'card') {
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (opt) {
          out.locations = opt.needsLocation
            ? opt.locations.filter((i) => opt.kind !== 'character' || gateRoom(view, i, me, plannedAt(i, payload.cardId)) > 0)
            : view.locations.map((l) => l.index);
        }
        out.hand = plan.plays.some((pl) => pl.cardId === payload.cardId);
        return out;
      }
      const c = view.characters[payload.uid];
      if (!c || c.owner !== me) return out;
      const confronting = plan.confronts.some((x) => x.uid === c.uid);
      const entering = plan.enters.includes(c.uid);
      const reloc = plan.relocations.find((x) => x.uid === c.uid);
      if (entering) out.gates = [c.location]; // drag back to cancel
      if (reloc) {
        out.locations = [c.location];
        out.inside = [c.location];
      }
      const targeted = plan.plays.find((pl) => pl.target?.charUid === c.uid);
      if (targeted) out.gates = [...out.gates, c.location]; // drag back to cancel the free move
      if (!confronting && !entering && !reloc) {
        if (c.zone === 'gate' && harrietPlay) {
          const d = tubmanDests(c.uid);
          out.gates = [...out.gates, ...d];
          out.locations = [...out.locations, ...d];
        }
        if (c.zone === 'inside' && yemojaPlay && yemojaPlay.location !== c.location && !view.locations[yemojaPlay.location].lost) {
          out.inside = [...out.inside, yemojaPlay.location];
          out.locations = [...out.locations, yemojaPlay.location];
        }
      }
      if (!confronting) {
        if (c.zone === 'gate' && opts.enters.includes(c.uid) && !entering) {
          out.inside = [c.location];
          out.locations = [c.location];
        }
        if (c.zone === 'inside') {
          const r = opts.relocations.find((x) => x.uid === c.uid);
          const fromHub = locDef(view, c.location).effect.type === 'hub';
          const used = plan.relocations.filter((x) => locDef(view, view.characters[x.uid]?.location ?? -1).effect.type !== 'hub').length;
          if (r && (fromHub || used < opts.relocationsAllowed || reloc)) out.locations = [...out.locations, ...r.destinations];
        }
      }
      if (!entering && !reloc) {
        out.threats = opts.confronts.filter((o) => o.chars.includes(c.uid)).map((o) => o.threatUid);
      }
      return out;
    },
    [planning, opts, view, me, plan, harrietPlay, yemojaPlay],
  );

  /** Why a drop cannot happen, and what to shake. */
  const explain = useCallback(
    (payload: DragPayload, target: DropTarget): { text: string; shake: string[] } | null => {
      const locIndex = target.type === 'location' || target.type === 'inside' || target.type === 'gates' ? target.index : null;
      const locNameAt = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
      const col = (i: number) => `.column[data-index="${i}"]`;
      if (payload.kind === 'card') {
        const nm = cardName(payload.cardId, placeholders);
        if (target.type === 'threat') return { text: `${nm} is a card in your hand. Drop it on a Location; Threats are confronted by Characters already there.`, shake: [] };
        if (target.type === 'hand') return null;
        const i = locIndex!;
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it, so nothing can be played there.`, shake: [`${col(i)} .art`] };
        if (!opt) return { text: `${nm} cannot be played right now.`, shake: [`[data-hand-card="${payload.cardId}"]`] };
        if (opt.kind === 'character' && gateRoom(view, i, me, plannedAt(i, payload.cardId)) <= 0) {
          const leaving = reserved[i] ?? [];
          if (leaving.length)
            return { text: `${leaving.map((h) => cardName(h.defId, placeholders)).join(' and ')} still hold${leaving.length > 1 ? '' : 's'} a Gate slot at ${locNameAt(i)} until the turn resolves (new arrivals are placed before anyone enters). Play ${nm} there next turn.`, shake: [`${col(i)} .gate-slot.reserved`] };
          return { text: `Both of your Gate slots at ${locNameAt(i)} are taken. Send someone Inside or relocate them first.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
        }
        return { text: `${nm} cannot go to ${locNameAt(i)}.`, shake: [] };
      }
      const c = view.characters[payload.uid];
      if (!c) return null;
      const nm = cardName(c.defId, placeholders);
      const tile = `[data-uid="${c.uid}"]`;
      const confronting = plan.confronts.some((x) => x.uid === c.uid);
      if (target.type === 'hand') return { text: `${nm} is already on the board; cards only return to your hand before they are played.`, shake: [] };
      if (target.type === 'threat') {
        const loc = view.locations.find((l) => l.threats.some((t) => t.uid === target.uid));
        const t = loc?.threats.find((x) => x.uid === target.uid);
        if (!loc || !t) return null;
        const tname = THREAT_BY_ID[t.defId].name;
        if (loc.index !== c.location) return { text: `${nm} is not at ${locNameAt(loc.index)}. Only Characters at a Threat's Location can confront it.`, shake: [tile] };
        if (plan.enters.includes(c.uid) || plan.relocations.some((x) => x.uid === c.uid)) return { text: `${nm} is moving this turn. A Character cannot move and confront in the same turn.`, shake: [tile] };
        if (t.target && t.target !== me) return { text: `Clear your own ${tname} first; then you may Assist against ${view.players[other(me)].handle}'s.`, shake: [`[data-threat="${target.uid}"]`] };
        return { text: `${nm} cannot confront ${tname} right now.`, shake: [tile] };
      }
      const i = locIndex!;
      if (confronting) return { text: `${nm} is confronting a Threat this turn and cannot move. Tap the Threat to release it.`, shake: [tile] };
      if (c.zone === 'gate') {
        if (i !== c.location) {
          if (harrietPlay && (plan.enters.includes(c.uid) || plan.relocations.some((x) => x.uid === c.uid))) return { text: `${nm} is already moving this turn. Harriet Tubman can only move a Character that is staying put.`, shake: [tile] };
          if (harrietPlay && view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it.`, shake: [`${col(i)} .art`] };
          if (harrietPlay) return { text: `Your Gates at ${locNameAt(i)} are full, so Harriet Tubman cannot move ${nm} there.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
          return { text: `Gate Characters enter the Location they are waiting at. Play Harriet Tubman first and she can move one of them to another Gate.`, shake: [tile] };
        }
        if (!c.ready) return { text: `${nm} is Fresh: it arrived this turn and waits one turn at the Gates before it can enter.`, shake: [tile] };
        const blocked = isBlockedFromEntering(view, c);
        if (blocked?.includes('Patrol')) {
          const patrol = view.locations[i].threats.find((t) => t.defId === 'segregationist_patrol' && (!t.target || t.target === me));
          return { text: `Segregationist Patrol blocks your entries at ${locNameAt(i)}. Neutralize it with ${patrol?.forceRequired ?? 3} Force in one turn.`, shake: patrol ? [`[data-threat="${patrol.uid}"]`] : [] };
        }
        if (blocked) return { text: `An opposing Reveal (Karen or OG) stopped ${nm} from entering this turn. Try again next turn.`, shake: [tile] };
        const cap = insideCapacity(view, i);
        if (charsAt(view, i, me, 'inside').length + plan.enters.filter((u) => view.characters[u]?.location === i).length >= cap) {
          if (cap < 5) {
            const hr = view.locations[i].threats.find((t) => t.defId === 'housing_restriction');
            return { text: `Housing Restriction caps you at ${cap} Established Characters here. Neutralize it with ${hr?.forceRequired ?? 4} Force.`, shake: hr ? [`[data-threat="${hr.uid}"]`] : [] };
          }
          return { text: `All five of your Inside slots at ${locNameAt(i)} are full.`, shake: [`${col(i)} [data-drop="inside"]`] };
        }
        return { text: `${nm} cannot enter right now.`, shake: [tile] };
      }
      // Established Character relocating.
      if (i === c.location) return null;
      if (view.locations[i].lost) return { text: `${locNameAt(i)} is Lost. Nobody can win it.`, shake: [`${col(i)} .art`] };
      if (gateRoom(view, i, me) <= 0) return { text: `Your Gates at ${locNameAt(i)} are full; a relocated Character arrives at the Gates.`, shake: [`${col(i)} .gates-left[data-drop="gates"] .gate-slot`] };
      if (plan.relocations.length >= opts.relocationsAllowed && !plan.relocations.some((x) => x.uid === c.uid))
        return { text: `You get ${opts.relocationsAllowed} Relocation${opts.relocationsAllowed > 1 ? 's' : ''} per turn (Pullman Porter adds one). Drag the other one back to cancel it.`, shake: plan.relocations.map((r) => `[data-uid="${r.uid}"]`) };
      return { text: `${nm} cannot relocate there right now.`, shake: [tile] };
    },
    [view, me, plan, opts, placeholders],
  );

  const onDrop = useCallback(
    (payload: DragPayload, target: DropTarget) => {
      const ok = dropTargetsFor(payload);
      const fail = () => {
        const why = explain(payload, target);
        if (why) feedback(why.text, why.shake);
      };
      const idx = target.type === 'location' || target.type === 'inside' || target.type === 'gates' ? target.index : -1;
      if (payload.kind === 'card') {
        if (target.type === 'hand') {
          if (ok.hand) setPlan((p) => ({ ...p, plays: p.plays.filter((pl) => pl.cardId !== payload.cardId) }));
          return;
        }
        if (target.type === 'threat' || !ok.locations.includes(idx)) return fail();
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (!opt) return fail();
        addPlay({ cardId: payload.cardId, location: opt.needsLocation ? idx : 0 });
        setSelected(null);
        return;
      }
      const c = view.characters[payload.uid];
      if (!c) return;
      if (target.type === 'threat') {
        if (ok.threats.includes(target.uid)) toggleConfront(c.uid, target.uid);
        else fail();
        return;
      }
      const entering = plan.enters.includes(c.uid);
      const reloc = plan.relocations.find((x) => x.uid === c.uid);
      const targeted = plan.plays.find((pl) => pl.target?.charUid === c.uid);
      // Cancel by dragging back.
      if (entering && target.type === 'gates' && idx === c.location) return toggleEnter(c.uid);
      if (reloc && idx === c.location) return setRelocation(c.uid, null);
      if (targeted && idx === c.location) return setTarget(c.zone === 'gate' ? 'friendlyGateCharAndLocation' : 'friendlyInsideChar', null);
      if (c.zone === 'gate' && !entering) {
        if (idx !== c.location && harrietPlay && ok.gates.includes(idx)) return setTarget('friendlyGateCharAndLocation', { charUid: c.uid, location: idx });
        if (idx === c.location && ok.inside.includes(idx)) return toggleEnter(c.uid);
        return fail();
      }
      if (c.zone === 'inside' && idx !== c.location && yemojaPlay?.location === idx && (target.type === 'inside' || ok.inside.includes(idx))) return setTarget('friendlyInsideChar', { charUid: c.uid, location: idx });
      if (c.zone === 'inside' && ok.locations.includes(idx) && idx !== c.location) return setRelocation(c.uid, idx);
      if (idx !== c.location) fail();
    },
    [dropTargetsFor, explain, feedback, opts, view, plan, setPlan, harrietPlay, yemojaPlay],
  );

  const { drag, dragProps } = useDrag(onDrop, planning);
  useEffect(() => {
    document.body.classList.toggle('dragging', !!drag);
    return () => document.body.classList.remove('dragging');
  }, [drag]);
  const drop: DropHighlight | null = useMemo(() => {
    if (!drag) return null;
    return { ...dropTargetsFor(drag.payload), overKey: targetKey(drag.over) };
  }, [drag, dropTargetsFor]);

  const onChar = (uid: string) => {
    if (isPlannedUid(uid)) {
      setSheet({ kind: 'card', id: uid.slice(PLANNED_PREFIX.length) });
      return;
    }
    if (!view.characters[uid]) return;
    // Tap inspects and offers actions; drag is the quick action.
    setSheet({ kind: 'char', uid });
  };

  const cardLocationLabel = (i: number) => locationName(view.locations[i].defId, placeholders);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const bubbles = useMemo(() => {
    const out: Partial<Record<PlayerId, string>> = {};
    for (const p of ['A', 'B'] as PlayerId[]) {
      const last = [...m.chat].reverse().find((c) => c.from === p);
      if (last && now - last.at < 7000) out[p] = last.text;
    }
    return out;
  }, [m.chat, now]);
  const summonState = (i: number): string | null => {
    const mine = plan.summon?.location === i;
    const theirs = m.pendingProposal?.from !== me && m.pendingProposal?.location === i ? '?' : m.opponentAgreed === i ? '✓' : null;
    if (!mine && !theirs) return null;
    return `SUMMON · You ${mine ? '✓' : '?'} · ${view.players[other(me)].handle} ${theirs ?? (mine ? '?' : '')}`;
  };

  const planItems = useMemo(() => {
    if (!planning) return [];
    const items: { key: string; label: string; remove: () => void }[] = [];
    for (const pl of plan.plays) {
      const def = CARD_BY_ID[pl.cardId];
      const where = def?.kind === 'character' || def?.id === 'community_defense' ? ` → L${pl.location + 1}` : '';
      items.push({ key: `play:${pl.cardId}`, label: `${cardName(pl.cardId, placeholders)}${where}`, remove: () => setPlan((p) => ({ ...p, plays: p.plays.filter((x) => x.cardId !== pl.cardId) })) });
    }
    for (const uid of plan.enters) {
      const c = view.characters[uid];
      if (c) items.push({ key: `enter:${uid}`, label: `${cardName(c.defId, placeholders)} enters`, remove: () => setPlan((p) => ({ ...p, enters: p.enters.filter((u) => u !== uid) })) });
    }
    for (const pl of plan.plays) {
      const c = pl.target?.charUid ? view.characters[pl.target.charUid] : undefined;
      if (c) items.push({ key: `target:${c.uid}`, label: `${cardName(c.defId, placeholders)} → L${(pl.target!.location ?? pl.location) + 1} (${cardName(pl.cardId, placeholders).split(' ')[0]})`, remove: () => setPlan((p) => ({ ...p, plays: p.plays.map((x) => (x.cardId === pl.cardId ? { ...x, target: undefined } : x)) })) });
    }
    for (const r of plan.relocations) {
      const c = view.characters[r.uid];
      if (c) items.push({ key: `move:${r.uid}`, label: `${cardName(c.defId, placeholders)} → L${r.to + 1}`, remove: () => setPlan((p) => ({ ...p, relocations: p.relocations.filter((x) => x.uid !== r.uid) })) });
    }
    for (const cf of plan.confronts) {
      const c = view.characters[cf.uid];
      if (c) items.push({ key: `confront:${cf.uid}`, label: `${cardName(c.defId, placeholders)} confronts`, remove: () => setPlan((p) => ({ ...p, confronts: p.confronts.filter((x) => x.uid !== cf.uid) })) });
    }
    if (plan.summon) items.push({ key: 'summon', label: `Summon at L${plan.summon.location + 1}`, remove: () => setPlan((p) => ({ ...p, summon: undefined })) });
    if (plan.standOnBusiness) items.push({ key: 'stand', label: 'Stand on Business', remove: () => setPlan((p) => ({ ...p, standOnBusiness: false })) });
    return items;
  }, [plan, planning, view, placeholders, setPlan]);

  const hint = (() => {
    if (view.phase === 'ended') return 'Match over.';
    if (busy) return 'Harborlight moves…';
    if (locked) return m.mode === 'ai' ? 'Locked. Harborlight is deciding…' : 'Locked.';
    if (view.players[me].hand.length - plan.plays.length >= MAX_HAND && view.players[me].deckCount > 0 && !selected) return `Hand full (${MAX_HAND}). Play a card or your next draw is discarded.`;
    if (selected) return `Tap a Location to commit ${cardName(selected, placeholders)}.`;
    if (harrietPlay && !harrietPlay.target) return 'Harriet Tubman: drag a Gate Character to another Gate for a free move (optional).';
    if (yemojaPlay && !yemojaPlay.target) return `Yemoja: drag an Established Character from elsewhere onto ${view.locations[yemojaPlay.location].revealed ? locationName(view.locations[yemojaPlay.location].defId, placeholders) : `Location ${yemojaPlay.location + 1}`} (optional).`;
    const left = opts.playsAllowed - plan.plays.length;
    if (planItems.length) return left > 0 && opts.plays.length > plan.plays.length ? `${left} play${left > 1 ? 's' : ''} left` : '';
    return 'Drag a card onto a Location (or tap card, then Location). One card per turn.';
  })();

  // The opponent Stood on Business and the raise has not landed yet: this is the one cheap turn to Step Off.
  const raisedOnMe = planning && view.pendingRaises.some((r) => r.by !== me);
  const stepOffLabel = `Step Off${opts.canStepOff && view.phase !== 'ended' ? ` (−${opts.stepOffCost})` : ''}`;

  return (
    <div className="app">
      <Hud view={view} me={me} secondsLeft={m.secondsLeft} paused={!planning} onProfile={(p) => setSheet({ kind: 'profile', p })} onLog={() => setSheet({ kind: 'log' })} hasLog={m.lastTurn.length > 0} bubbles={bubbles} onChat={() => setSheet({ kind: 'chat' })} />
      <div className="main-wrap">
        <Battlefield
          view={boardView}
          me={me}
          plan={plan}
          targetable={targetable}
          onLocationTap={commitPlay}
          onLocationInfo={(i) => setSheet({ kind: 'location', index: i })}
          onChar={onChar}
          onThreat={(uid) => setSheet({ kind: 'threat', uid })}
          locked={!planning}
          flash={flash}
          dragProps={dragProps}
          drop={drop}
          reserved={reserved}
          delays={m.delays}
          resolving={busy}
          glowLocation={guideLocation}
          summonLabel={summonState}
        />
        <Coach view={view} me={me} plan={plan} enabled={coach && planning && m.mode === 'ai' && !guide} onActive={setFlash} override={guideText} />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
      <div className="bottom">
        <Hand view={view} me={me} plan={plan} selected={selected} onSelect={selectCard} onInspect={(id) => setSheet({ kind: 'card', id })} compact={compact} dragProps={dragProps} glow={guideCard} dropState={drop?.hand ? (drop.overKey === 'hand' ? 'over' : 'ok') : null} />
        <div className={`hint ${raisedOnMe ? 'stand-banner' : ''}`}>
          {raisedOnMe ? (
            <span role="status">
              <b>{view.players[other(me)].handle} STOOD ON BUSINESS.</b> Stakes go {view.stakes} → {opts.pendingStakes} after this turn.{' '}
              {opts.canStepOff ? `Step Off now and lose only ${opts.stepOffCost}` : 'You stood too, so there is no backing out'}
              {opts.canStand ? `, or Stand back to make it ${opts.proposedStakes}.` : '.'}
            </span>
          ) : selected && planning ? (
            <button className="small chip" onClick={() => setSheet({ kind: 'card', id: selected })}>
              ⓘ Inspect / send {cardName(selected, placeholders)}
            </button>
          ) : (
            <>
              {planItems.map((it) => (
                <span key={it.key} className="plan-chip">
                  {it.label}
                  <button className="x" onClick={it.remove} aria-label={`Remove ${it.label}`} title="Remove this move">
                    ✕
                  </button>
                </span>
              ))}
              {hint && <span>{hint}</span>}
            </>
          )}
          {planning && history.length > 0 && (
            <button className="small chip undo" onClick={undo} title="Cmd/Ctrl+Z">
              ↶ Undo
            </button>
          )}
          {planning && planItems.length > 0 && (
            <button className="small chip reset" onClick={() => setPlan(() => emptyPlan())} title="Clear every move this turn (undoable)">
              ⟲ Reset turn
            </button>
          )}
        </div>
        <div className="actions-left">
          <button className={`danger ${raisedOnMe && opts.canStepOff ? 'pulse' : ''}`} disabled={view.phase === 'ended' || !opts.canStepOff} {...(opts.canStepOff ? {} : tip(HINTS.noStepOff))} onClick={() => setSheet({ kind: 'stepOff' })}>
            {stepOffLabel}
          </button>
        </div>
        <div className="lock-row">
          <button className="primary" disabled={!planning} onClick={m.lockIn}>
            LOCK IT IN
          </button>
        </div>
        <div className="actions-right">
          <button className={`${plan.standOnBusiness ? 'primary' : ''} ${flash === 'stakes' ? 'ftue-flash' : ''}`} disabled={!planning || !opts.canStand} onClick={() => setSheet({ kind: 'stand' })}>
            {plan.standOnBusiness ? 'Standing ✓' : 'Stand on Business'}
          </button>
        </div>
        <div className="mobile-actions">
          <button className={`danger ${raisedOnMe && opts.canStepOff ? 'pulse' : ''}`} disabled={view.phase === 'ended' || !opts.canStepOff} onClick={() => setSheet({ kind: 'stepOff' })}>
            {stepOffLabel}
          </button>
          <button className="primary" disabled={!planning} onClick={m.lockIn}>
            LOCK IT IN
          </button>
          <button className={`${plan.standOnBusiness ? 'primary' : ''} ${flash === 'stakes' ? 'ftue-flash' : ''}`} disabled={!planning || !opts.canStand} onClick={() => setSheet({ kind: 'stand' })}>
            {plan.standOnBusiness ? 'Standing ✓' : 'Stand'}
          </button>
        </div>
      </div>

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.payload.kind === 'card' ? (
            <CardFace id={drag.payload.cardId} />
          ) : view.characters[drag.payload.uid] ? (
            <div className="tile">
              <Pic state={view} c={view.characters[drag.payload.uid]} />
            </div>
          ) : null}
        </div>
      )}
      {sheet?.kind === 'card' && (
        <CardSheet
          id={sheet.id}
          onClose={() => setSheet(null)}
          planned={plan.plays.some((pl) => pl.cardId === sheet.id)}
          onCancelPlay={() => {
            setPlan((p) => ({ ...p, plays: p.plays.filter((pl) => pl.cardId !== sheet.id) }));
            setSheet(null);
          }}
          sendTo={(() => {
            const opt = planning ? opts.plays.find((p) => p.cardId === sheet.id) : undefined;
            if (!opt) return undefined;
            return {
              needsLocation: opt.needsLocation,
              options: opt.locations
                .filter((i) => opt.kind !== 'character' || gateRoom(view, i, me, plannedAt(i, sheet.id)) > 0)
                .map((i) => ({
                  index: i,
                  label: view.locations[i].revealed ? cardLocationLabel(i) : `Location ${i + 1} (hidden)`,
                })),
              onSend: (i: number) => commitPlay(i, sheet.id),
            };
          })()}
        />
      )}
      {sheet?.kind === 'char' && (
        <CharSheet
          view={view}
          me={me}
          uid={sheet.uid}
          plan={plan}
          locked={!planning}
          onClose={() => setSheet(null)}
          onToggleEnter={toggleEnter}
          onRelocate={setRelocation}
          tubman={harrietPlay ? { name: cardName(harrietPlay.cardId, placeholders), dests: tubmanDests(sheet.uid), onMove: (to) => setTarget('friendlyGateCharAndLocation', to === null ? null : { charUid: sheet.uid, location: to }) } : undefined}
          yemoja={yemojaPlay ? { name: cardName(yemojaPlay.cardId, placeholders), location: yemojaPlay.location, onBring: (on) => setTarget('friendlyInsideChar', on ? { charUid: sheet.uid, location: yemojaPlay.location } : null) } : undefined}
        />
      )}
      {sheet?.kind === 'threat' && <ThreatSheet view={view} me={me} threatUid={sheet.uid} plan={plan} locked={!planning} onClose={() => setSheet(null)} onToggle={toggleConfront} />}
      {sheet?.kind === 'location' && <LocationSheet view={view} index={sheet.index} onClose={() => setSheet(null)} />}
      {m.pendingProposal && m.pendingProposal.from !== me && planning && (
        <div className="proposal">
          <span>
            <b>{view.players[m.pendingProposal.from].handle}</b> proposes a Summon at <b>{cardLocationLabel(m.pendingProposal.location)}</b>. {SUMMON.name} needs {SUMMON.force} Force from both of you.
          </span>
          <button className="small primary" onClick={m.acceptSummon} disabled={!opts.summonable.includes(m.pendingProposal.location)}>
            Summon!
          </button>
          <button className="small ghost" onClick={m.declineSummon}>
            Nah, I'm busy.
          </button>
        </div>
      )}
      {sheet?.kind === 'chat' && (
        <ChatSheet
          onClose={() => setSheet(null)}
          emotes={EMOTES}
          onEmote={(t) => {
            m.sendEmote(t);
            setSheet(null);
          }}
          summonable={planning && !plan.summon ? opts.summonable.map((i) => ({ index: i, label: cardLocationLabel(i) })) : []}
          onSummon={(i) => {
            m.proposeSummon(i);
            setSheet(null);
          }}
          chat={m.chat.map((c) => ({ from: view.players[c.from].handle, text: c.text }))}
        />
      )}
      {sheet?.kind === 'log' && <LogSheet events={m.lastTurn} turn={Math.max(1, view.turn - (view.phase === 'ended' ? 0 : 1))} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'profile' && <ProfileSheet view={view} p={sheet.p} me={me} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'stepOff' && (
        <ConfirmSheet
          title="Step Off?"
          body={`Stepping off surrenders the match. ${view.players[other(me)].handle} wins ${opts.stepOffCost} Stake${opts.stepOffCost > 1 ? 's' : ''}.${raisedOnMe ? ` Stay and the match is worth ${opts.pendingStakes} from next turn.` : ''}`}
          confirmLabel="Step Off"
          danger
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            setPlan((p) => ({ ...p, stepOff: true }));
            setTimeout(() => m.lockIn(), 0);
          }}
        />
      )}
      {sheet?.kind === 'stand' && (
        <ConfirmSheet
          title="Stand on Business"
          body={
            plan.standOnBusiness
              ? 'Cancel your raise this turn?'
              : `Raise the match from ${opts.pendingStakes} to ${opts.proposedStakes} Stakes${view.maxTurns < 10 ? ' and extend it to 10 turns' : ''}. The raise lands after next turn: your opponent gets one turn to Step Off for ${view.stakes}, or to Stand back and double it again. Once you stand you cannot Step Off, and you can only do this once per match.`
          }
          confirmLabel={plan.standOnBusiness ? 'Cancel raise' : `Stand: ${opts.pendingStakes} → ${opts.proposedStakes}`}
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setPlan((p) => ({ ...p, standOnBusiness: !p.standOnBusiness }));
            setSheet(null);
          }}
        />
      )}
      {fanfare.length > 0 && !busy && view.phase !== 'ended' && <SpawnSheet ev={fanfare[0]} view={view} me={me} onClose={() => setFanfare((f) => f.slice(1))} />}
      {view.phase === 'ended' && !busy && (
        <div className="scrim">
          <div className="sheet center">
            <div className="winner" style={{ color: view.result?.winner === 'A' ? 'var(--cA)' : view.result?.winner === 'B' ? 'var(--cB)' : 'var(--text)' }}>
              {view.result?.winner ? `${view.players[view.result.winner].handle} wins` : 'Draw'}
            </div>
            <button className="primary" onClick={onExit}>
              See result
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
