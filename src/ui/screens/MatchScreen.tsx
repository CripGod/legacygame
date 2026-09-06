import { useCallback, useEffect, useMemo, useState } from 'react';
import { CARD_BY_ID, legalOptions, type PlayerId, other } from '../../engine';
import { useDrag, targetKey, type DragPayload, type DropTarget } from '../drag';
import { CardFace, Pic } from '../components/CardFace';
import type { DropHighlight } from '../components/Battlefield';
import { previewPlan, isPlannedUid, PLANNED_PREFIX } from '../preview';
import type { MatchController } from '../useMatch';
import { Hud } from '../components/Hud';
import { Battlefield } from '../components/Battlefield';
import { Hand } from '../components/Hand';
import { Feed } from '../components/Feed';
import { Coach } from '../components/Coach';
import { CardSheet, CharSheet, ConfirmSheet, LocationSheet, ProfileSheet, StandResponseSheet, TargetSheet, ThreatSheet } from '../components/Sheets';
import { cardName, locationName, useDisplay } from '../display';
import { tip, HINTS } from '../tip';

type SheetState =
  | { kind: 'card'; id: string }
  | { kind: 'char'; uid: string }
  | { kind: 'threat'; uid: string }
  | { kind: 'location'; index: number }
  | { kind: 'target'; cardId: string; location: number }
  | { kind: 'profile'; p: PlayerId }
  | { kind: 'stepOff' }
  | { kind: 'stand' }
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
  const { view, perspective: me, plan, setPlan, locked, busy } = m;
  const { placeholders } = useDisplay();
  const compact = useCompact();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const opts = useMemo(() => legalOptions(view, me), [view, me]);
  const boardView = useMemo(() => (view.phase === 'planning' && !locked ? previewPlan(view, me, plan) : view), [view, me, plan, locked]);
  const planning = view.phase === 'planning' && !locked && !busy;

  // Escape closes any sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet((sh) => (sh && sh.kind !== 'stand' ? null : sh));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stagger tile animations in the order the resolution events happened.
  useEffect(() => {
    const d: Record<string, number> = {};
    let i = 0;
    for (const e of m.feed) {
      if (e.uid && d[e.uid] === undefined && (e.type === 'played' || e.type === 'moved' || e.type === 'entered')) {
        d[e.uid] = Math.min(2400, i * 160);
        i++;
      }
    }
    setDelays(d);
  }, [m.feed]);

  // Reset transient selection on new turn.
  useEffect(() => {
    setSelected(null);
    setSheet(null);
  }, [view.turn, me]);

  const targetable = useMemo(() => {
    if (!selected || !planning) return [];
    const opt = opts.plays.find((p) => p.cardId === selected);
    if (!opt) return [];
    return opt.needsLocation ? opt.locations : [];
  }, [selected, opts, planning]);

  const selectCard = (cardId: string) => {
    if (!planning) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    if (plan.play?.cardId === cardId) {
      setPlan((p) => ({ ...p, play: undefined }));
      setSelected(null);
      return;
    }
    const opt = opts.plays.find((p) => p.cardId === cardId);
    if (!opt) {
      setSheet({ kind: 'card', id: cardId });
      return;
    }
    if (!opt.needsLocation) {
      // Reparations: no Location choice.
      setPlan((p) => ({ ...p, play: { cardId, location: 0 } }));
      setSelected(null);
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
    if (opt.needsTarget) {
      setSheet({ kind: 'target', cardId, location });
      return;
    }
    setPlan((p) => ({ ...p, play: { cardId, location: opt.needsLocation ? location : 0 } }));
    setSelected(null);
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
      const out: DropHighlight = { locations: [], inside: [], threats: [], overKey: '' };
      if (!planning) return out;
      if (payload.kind === 'card') {
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (opt) out.locations = opt.needsLocation ? opt.locations : view.locations.map((l) => l.index);
        return out;
      }
      const c = view.characters[payload.uid];
      if (!c || c.owner !== me) return out;
      const confronting = plan.confronts.some((x) => x.uid === c.uid);
      if (!confronting) {
        if (c.zone === 'gate' && opts.enters.includes(c.uid)) {
          out.inside = [c.location];
          out.locations = [c.location];
        }
        if (c.zone === 'inside') {
          const r = opts.relocations.find((x) => x.uid === c.uid);
          if (r && (plan.relocations.length < opts.relocationsAllowed || plan.relocations.some((x) => x.uid === c.uid))) out.locations = r.destinations;
        }
      }
      if (!plan.enters.includes(c.uid) && !plan.relocations.some((x) => x.uid === c.uid)) {
        out.threats = opts.confronts.filter((o) => o.chars.includes(c.uid)).map((o) => o.threatUid);
      }
      return out;
    },
    [planning, opts, view, me, plan],
  );

  const onDrop = useCallback(
    (payload: DragPayload, target: DropTarget) => {
      const ok = dropTargetsFor(payload);
      if (payload.kind === 'card') {
        if (target.type === 'threat') return;
        if (!ok.locations.includes(target.index)) return;
        const opt = opts.plays.find((p) => p.cardId === payload.cardId);
        if (!opt) return;
        if (!opt.needsLocation) {
          setPlan((p) => ({ ...p, play: { cardId: payload.cardId, location: 0 } }));
        } else if (opt.needsTarget) {
          setSheet({ kind: 'target', cardId: payload.cardId, location: target.index });
        } else {
          setPlan((p) => ({ ...p, play: { cardId: payload.cardId, location: target.index } }));
        }
        setSelected(null);
        return;
      }
      const c = view.characters[payload.uid];
      if (!c) return;
      if (target.type === 'threat') {
        if (ok.threats.includes(target.uid)) toggleConfront(c.uid, target.uid);
        return;
      }
      if (c.zone === 'gate' && ok.inside.includes(target.index)) {
        if (!plan.enters.includes(c.uid)) toggleEnter(c.uid);
        return;
      }
      if (c.zone === 'inside' && ok.locations.includes(target.index)) {
        setRelocation(c.uid, target.index);
      }
    },
    [dropTargetsFor, opts, view, plan, setPlan],
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

  const hint = (() => {
    if (view.phase === 'ended') return 'Match over.';
    if (busy) return 'Resolving…';
    if (locked) return m.mode === 'ai' ? 'Locked. Harborlight is deciding…' : 'Locked.';
    if (selected) return `Tap a Location to commit ${cardName(selected, placeholders)}.`;
    const parts: string[] = [];
    if (plan.play) parts.push(`Playing ${cardName(plan.play.cardId, placeholders)}${CARD_BY_ID[plan.play.cardId]?.kind === 'character' || CARD_BY_ID[plan.play.cardId]?.id === 'community_defense' ? ` at Location ${plan.play.location + 1}` : ''}`);
    if (plan.enters.length) parts.push(`${plan.enters.length} entering`);
    if (plan.relocations.length) parts.push(`${plan.relocations.length} relocating`);
    if (plan.confronts.length) parts.push(`${plan.confronts.length} confronting`);
    if (plan.standOnBusiness) parts.push('STANDING ON BUSINESS');
    return parts.length ? parts.join(' · ') : 'Drag a card onto a Location (or tap card, then Location). One card per turn.';
  })();

  const showStandResponse = view.phase === 'standResponse' && view.pendingStand && other(view.pendingStand.by) === me && !busy;

  return (
    <div className="app">
      <Hud view={view} me={me} secondsLeft={m.secondsLeft} paused={!planning} onProfile={(p) => setSheet({ kind: 'profile', p })} />
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
          delays={delays}
        />
        <Feed events={m.feed} index={m.feedIndex} onSkip={m.skipFeed} />
        <Coach view={view} me={me} plan={plan} enabled={coach && planning && m.mode === 'ai'} onActive={setFlash} />
      </div>
      <div className="bottom">
        <Hand view={view} me={me} plan={plan} selected={selected} onSelect={selectCard} onInspect={(id) => setSheet({ kind: 'card', id })} compact={compact} dragProps={dragProps} />
        <div className="hint">
          {selected && planning ? (
            <button className="small chip" onClick={() => setSheet({ kind: 'card', id: selected })}>
              ⓘ Inspect / send {cardName(selected, placeholders)}
            </button>
          ) : (
            hint
          )}
        </div>
        <div className="actions-left">
          <button className="danger" disabled={view.phase === 'ended' || !opts.canStepOff} {...(opts.canStepOff ? {} : tip(HINTS.noStepOff))} onClick={() => setSheet({ kind: 'stepOff' })}>
            Step Off
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
          <button className="danger" disabled={view.phase === 'ended' || !opts.canStepOff} onClick={() => setSheet({ kind: 'stepOff' })}>
            Step Off
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
          planned={plan.play?.cardId === sheet.id}
          onCancelPlay={() => {
            setPlan((p) => ({ ...p, play: undefined }));
            setSheet(null);
          }}
          sendTo={(() => {
            const opt = planning ? opts.plays.find((p) => p.cardId === sheet.id) : undefined;
            if (!opt) return undefined;
            return {
              needsLocation: opt.needsLocation,
              options: opt.locations.map((i) => ({
                index: i,
                label: view.locations[i].revealed ? cardLocationLabel(i) : `Location ${i + 1} (hidden)`,
              })),
              onSend: (i: number) => commitPlay(i, sheet.id),
            };
          })()}
        />
      )}
      {sheet?.kind === 'char' && <CharSheet view={view} me={me} uid={sheet.uid} plan={plan} locked={!planning} onClose={() => setSheet(null)} onToggleEnter={toggleEnter} onRelocate={setRelocation} />}
      {sheet?.kind === 'threat' && <ThreatSheet view={view} me={me} threatUid={sheet.uid} plan={plan} locked={!planning} onClose={() => setSheet(null)} onToggle={toggleConfront} />}
      {sheet?.kind === 'location' && <LocationSheet view={view} index={sheet.index} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'profile' && <ProfileSheet view={view} p={sheet.p} me={me} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'target' && (
        <TargetSheet
          view={view}
          me={me}
          cardId={sheet.cardId}
          location={sheet.location}
          onClose={() => setSheet(null)}
          onConfirm={(target) => {
            setPlan((p) => ({ ...p, play: { cardId: sheet.cardId, location: sheet.location, target } }));
            setSelected(null);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'stepOff' && (
        <ConfirmSheet
          title="Step Off?"
          body={`Stepping off surrenders the match. ${view.players[other(me)].handle} wins ${view.stakes} Stake${view.stakes > 1 ? 's' : ''}.`}
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
              : `Raise the match from ${view.stakes} to ${opts.proposedStakes} Stakes${view.maxTurns < 10 ? ' and extend it to 10 turns' : ''}. Your opponent must Continue or Step Off. Once you stand you cannot Step Off, and you can only do this once per match.`
          }
          confirmLabel={plan.standOnBusiness ? 'Cancel raise' : `Stand: ${view.stakes} → ${opts.proposedStakes}`}
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setPlan((p) => ({ ...p, standOnBusiness: !p.standOnBusiness }));
            setSheet(null);
          }}
        />
      )}
      {showStandResponse && <StandResponseSheet view={view} me={me} onRespond={m.respondStand} />}
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
