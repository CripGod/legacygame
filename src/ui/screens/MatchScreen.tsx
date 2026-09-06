import { useEffect, useMemo, useState } from 'react';
import { CARD_BY_ID, legalOptions, type PlayerId, other } from '../../engine';
import type { MatchController } from '../useMatch';
import { Hud } from '../components/Hud';
import { Battlefield } from '../components/Battlefield';
import { Hand } from '../components/Hand';
import { Feed } from '../components/Feed';
import { Coach } from '../components/Coach';
import { CardSheet, CharSheet, ConfirmSheet, LocationSheet, ProfileSheet, StandResponseSheet, TargetSheet, ThreatSheet } from '../components/Sheets';
import { cardName, useDisplay } from '../display';

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
  const opts = useMemo(() => legalOptions(view, me), [view, me]);
  const planning = view.phase === 'planning' && !locked && !busy;

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
    setSelected(selected === cardId ? null : cardId);
  };

  const commitPlay = (location: number) => {
    if (!selected) return;
    const opt = opts.plays.find((p) => p.cardId === selected);
    if (!opt || !opt.locations.includes(location)) return;
    if (opt.needsTarget) {
      setSheet({ kind: 'target', cardId: selected, location });
      return;
    }
    setPlan((p) => ({ ...p, play: { cardId: selected, location } }));
    setSelected(null);
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

  const onChar = (uid: string) => {
    const c = view.characters[uid];
    if (!c) return;
    // Quick action: tapping your own Ready Gate Character toggles entering.
    if (planning && c.owner === me && c.zone === 'gate' && opts.enters.includes(uid) && !plan.confronts.some((x) => x.uid === uid)) {
      toggleEnter(uid);
      return;
    }
    setSheet({ kind: 'char', uid });
  };

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
    return parts.length ? parts.join(' · ') : 'Tap a card, then a Location. One card per turn.';
  })();

  const showStandResponse = view.phase === 'standResponse' && view.pendingStand && other(view.pendingStand.by) === me && !busy;

  return (
    <div className="app">
      <Hud view={view} me={me} secondsLeft={m.secondsLeft} paused={!planning} onProfile={(p) => setSheet({ kind: 'profile', p })} />
      <div className="main-wrap">
        <Battlefield
          view={view}
          me={me}
          plan={plan}
          targetable={targetable}
          onLocationTap={commitPlay}
          onLocationInfo={(i) => setSheet({ kind: 'location', index: i })}
          onChar={onChar}
          onThreat={(uid) => setSheet({ kind: 'threat', uid })}
          locked={!planning}
          flash={flash}
        />
        <Feed events={m.feed} index={m.feedIndex} onSkip={m.skipFeed} />
        <Coach view={view} me={me} plan={plan} enabled={coach && planning && m.mode === 'ai'} onActive={setFlash} />
      </div>
      <div className="bottom">
        <Hand view={view} me={me} plan={plan} selected={selected} onSelect={selectCard} onInspect={(id) => setSheet({ kind: 'card', id })} compact={compact} />
        <div className="hint">{hint}</div>
        <div className="actions-left">
          <button className="danger" disabled={view.phase === 'ended'} onClick={() => setSheet({ kind: 'stepOff' })}>
            Step Off
          </button>
        </div>
        <div className="lock-row">
          {selected && (
            <button className="small ghost" onClick={() => setSheet({ kind: 'card', id: selected })}>
              Inspect
            </button>
          )}
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
          <button className="danger" disabled={view.phase === 'ended'} onClick={() => setSheet({ kind: 'stepOff' })}>
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

      {sheet?.kind === 'card' && (
        <CardSheet
          id={sheet.id}
          onClose={() => setSheet(null)}
          onPlay={
            planning && opts.plays.some((p) => p.cardId === sheet.id)
              ? () => {
                  setSheet(null);
                  selectCard(sheet.id);
                }
              : undefined
          }
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
              : `Raise the match from ${view.stakes} to ${opts.proposedStakes} Stakes. Your opponent must Continue or Step Off. You can only do this once per match.`
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
